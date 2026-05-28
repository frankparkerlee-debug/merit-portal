// Portal-side Shopify Admin API client.
//
// Mirrors the storefront's shopify-auth.js but in TypeScript + fetch, so it
// can run inside Next.js server components and route handlers. Uses the
// client_credentials grant to exchange SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET
// for a short-lived shpat_ token, cached in-memory per process. The token's
// scope is whatever was granted to the Custom App in Shopify Admin.
//
// We only use this for two flows right now:
//   1. Reading order/customer details on the pharmacy detail page (need
//      shipping address that's only in Shopify)
//   2. Creating fulfillments + writing order timeline events when pharmacy
//      progresses an order — which is what triggers Shopify's automatic
//      shipping-confirmation email to the customer

const SHOP = process.env.SHOPIFY_SHOP ?? "meritpeptides.myshopify.com";
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET ?? "";
const API_VERSION = "2024-10";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  // Treat tokens as good for 50 minutes (Shopify issues ~1h tokens via
  // client_credentials). Cheap to re-fetch if we get a 401.
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET not configured");
  }
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return data.access_token;
}

export async function shopifyGql<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors).slice(0, 400)}`);
  }
  return json.data as T;
}

// ─── High-level helpers ────────────────────────────────────────────────

export type ShopifyAddress = {
  name?: string | null;
  company?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  provinceCode?: string | null;
  zip?: string | null;
  country?: string | null;
  countryCodeV2?: string | null;
  phone?: string | null;
};

/**
 * Pull the shipping address (and a few other useful fields) for an order
 * given its Shopify GraphQL ID. Returns null if the order doesn't exist
 * or has been deleted.
 */
export async function getOrderShippingDetails(orderGid: string): Promise<{
  shippingAddress: ShopifyAddress | null;
  email: string | null;
  fulfillable: boolean;
} | null> {
  type Result = {
    order: {
      id: string;
      email: string | null;
      shippingAddress: ShopifyAddress | null;
      fulfillmentOrders: { nodes: Array<{ id: string; status: string }> };
    } | null;
  };
  const data = await shopifyGql<Result>(
    `query($id: ID!) {
      order(id: $id) {
        id
        email
        shippingAddress {
          name company address1 address2 city province provinceCode
          zip country countryCodeV2 phone
        }
        fulfillmentOrders(first: 5) { nodes { id status } }
      }
    }`,
    { id: orderGid },
  );
  if (!data.order) return null;
  const fulfillable = data.order.fulfillmentOrders.nodes.some(
    (fo) => fo.status === "OPEN" || fo.status === "IN_PROGRESS",
  );
  return {
    shippingAddress: data.order.shippingAddress,
    email: data.order.email,
    fulfillable,
  };
}

/**
 * Create a Shopify fulfillment for the order, with tracking. This is what
 * triggers Shopify's automatic shipping-confirmation email to the customer
 * (with the carrier tracking link). Returns the fulfillment GID on success.
 */
export async function createShopifyFulfillment(
  orderGid: string,
  tracking: { carrier: string; number: string; url: string | null },
): Promise<{ ok: true; fulfillmentId: string } | { ok: false; error: string }> {
  // First, find the fulfillment order(s) backing this order
  type FoResult = {
    order: {
      fulfillmentOrders: {
        nodes: Array<{
          id: string;
          status: string;
          lineItems: { nodes: Array<{ id: string; remainingQuantity: number }> };
        }>;
      };
    } | null;
  };
  const foData = await shopifyGql<FoResult>(
    `query($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 10) {
          nodes {
            id status
            lineItems(first: 50) { nodes { id remainingQuantity } }
          }
        }
      }
    }`,
    { id: orderGid },
  );
  if (!foData.order) return { ok: false, error: "Order not found in Shopify" };
  const openFOs = foData.order.fulfillmentOrders.nodes.filter(
    (fo) => fo.status === "OPEN" || fo.status === "IN_PROGRESS",
  );
  if (openFOs.length === 0) {
    return { ok: false, error: "No open fulfillment orders (already fulfilled?)" };
  }

  const carrierToShopify: Record<string, string> = {
    USPS: "USPS",
    UPS: "UPS",
    FedEx: "FedEx",
    DHL: "DHL eCommerce",
  };

  type CreateResult = {
    fulfillmentCreateV2: {
      fulfillment: { id: string; status: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  };
  const createRes = await shopifyGql<CreateResult>(
    `mutation Fulfill($fulfillment: FulfillmentV2Input!) {
      fulfillmentCreateV2(fulfillment: $fulfillment) {
        fulfillment { id status }
        userErrors { field message }
      }
    }`,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder: openFOs.map((fo) => ({
          fulfillmentOrderId: fo.id,
        })),
        trackingInfo: {
          company: carrierToShopify[tracking.carrier] ?? tracking.carrier,
          number: tracking.number,
          url: tracking.url ?? undefined,
        },
        notifyCustomer: true,
      },
    },
  );
  if (createRes.fulfillmentCreateV2.userErrors.length > 0) {
    return {
      ok: false,
      error: createRes.fulfillmentCreateV2.userErrors.map((e) => e.message).join("; "),
    };
  }
  const f = createRes.fulfillmentCreateV2.fulfillment;
  if (!f) return { ok: false, error: "Fulfillment not created (unknown reason)" };
  return { ok: true, fulfillmentId: f.id };
}
