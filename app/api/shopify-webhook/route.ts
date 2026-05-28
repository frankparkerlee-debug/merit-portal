// Shopify webhook receiver.
//
// We subscribe to three topics on this endpoint:
//   • orders/paid          → flip Intake to PAID + stamp Shopify refs
//   • fulfillments/create  → label bought (in Shopify or via API),
//                             flip PharmacyOrder to SHIPPED, capture tracking
//   • fulfillments/update  → carrier delivery confirmation,
//                             flip PharmacyOrder to DELIVERED
//
// Every request gets HMAC-verified against SHOPIFY_WEBHOOK_SECRET
// (timing-safe). Shopify retries on non-2xx, so we respond 200 even on
// duplicate-but-already-applied events and let the route own idempotency.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = process.env.SHOPIFY_WEBHOOK_SECRET ?? "";

function timingSafeEqStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shop = req.headers.get("x-shopify-shop-domain") ?? "";

  if (!SECRET) {
    console.error("[webhook] SHOPIFY_WEBHOOK_SECRET not set; refusing");
    return new NextResponse("server not configured", { status: 500 });
  }

  const expected = crypto.createHmac("sha256", SECRET).update(rawBody, "utf8").digest("base64");
  if (!timingSafeEqStrings(sig, expected)) {
    console.warn("[webhook] HMAC mismatch", { topic, shop });
    return new NextResponse("invalid signature", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  if (topic === "orders/paid") return handleOrdersPaid(body as ShopifyOrder);
  if (topic === "fulfillments/create") return handleFulfillmentCreate(body as ShopifyFulfillment);
  if (topic === "fulfillments/update") return handleFulfillmentUpdate(body as ShopifyFulfillment);

  console.log("[webhook] unhandled topic", topic);
  return NextResponse.json({ ok: true, ignored: "unhandled_topic" });
}

// ─── orders/paid ────────────────────────────────────────────────────────

async function handleOrdersPaid(body: ShopifyOrder) {
  const submissionRef = (body.note_attributes ?? []).find(
    (a) => a.name?.toLowerCase() === "submission_ref",
  )?.value;
  if (!submissionRef) {
    console.log("[webhook] no submission_ref on order", body.id, "— ignoring");
    return NextResponse.json({ ok: true, ignored: "no_submission_ref" });
  }
  const intake = await prisma.intake.findUnique({
    where: { submissionRef },
    select: { id: true, status: true, shopifyOrderId: true },
  });
  if (!intake) {
    console.warn("[webhook] no intake matched submissionRef", submissionRef);
    return NextResponse.json({ ok: true, ignored: "no_intake_match" });
  }
  const orderGid = `gid://shopify/Order/${body.id}`;
  const customerGid = body.customer ? `gid://shopify/Customer/${body.customer.id}` : null;
  if (intake.shopifyOrderId === orderGid && intake.status === "PAID") {
    return NextResponse.json({ ok: true, ignored: "duplicate" });
  }
  await prisma.intake.update({
    where: { id: intake.id },
    data: {
      status: "PAID",
      shopifyOrderId: orderGid,
      shopifyCustomerId: customerGid,
      shopifyOrderName: body.name ?? null,
    },
  });
  await prisma.intakeAction
    .create({
      data: {
        intakeId: intake.id,
        action: "PAYMENT_RECEIVED",
        fromStatus: intake.status,
        toStatus: "PAID",
        payload: { shopifyOrderId: orderGid, orderName: body.name },
      },
    })
    .catch((err) => console.warn("[webhook] audit log failed:", err));
  return NextResponse.json({ ok: true });
}

// ─── fulfillments/create ────────────────────────────────────────────────
//
// Fires when a label is purchased in Shopify Admin (or via fulfillment API).
// Look up the PharmacyOrder by order_id, capture tracking, flip to SHIPPED.

async function handleFulfillmentCreate(body: ShopifyFulfillment) {
  const orderGid = `gid://shopify/Order/${body.order_id}`;
  const intake = await prisma.intake.findFirst({
    where: { shopifyOrderId: orderGid },
    include: { pharmacyOrder: true },
  });
  if (!intake?.pharmacyOrder) {
    console.log("[webhook] fulfillment for order", body.order_id, "but no pharmacy order");
    return NextResponse.json({ ok: true, ignored: "no_pharmacy_order" });
  }
  // Idempotency: if already at SHIPPED with this tracking number, no-op
  const trackingNumber = body.tracking_number ?? body.tracking_numbers?.[0] ?? null;
  if (
    intake.pharmacyOrder.status === "SHIPPED" &&
    intake.pharmacyOrder.trackingNumber === trackingNumber
  ) {
    return NextResponse.json({ ok: true, ignored: "duplicate" });
  }
  await prisma.$transaction([
    prisma.pharmacyOrder.update({
      where: { id: intake.pharmacyOrder.id },
      data: {
        status: "SHIPPED",
        trackingCarrier: body.tracking_company ?? intake.pharmacyOrder.trackingCarrier,
        trackingNumber: trackingNumber ?? intake.pharmacyOrder.trackingNumber,
        trackingUrl: body.tracking_url ?? body.tracking_urls?.[0] ?? intake.pharmacyOrder.trackingUrl,
        shippedAt: body.created_at ? new Date(body.created_at) : new Date(),
      },
    }),
    prisma.pharmacyAction.create({
      data: {
        pharmacyOrderId: intake.pharmacyOrder.id,
        action: "SHOPIFY_FULFILLMENT_CREATED",
        payload: {
          fulfillmentId: body.id,
          trackingCompany: body.tracking_company,
          trackingNumber,
        },
      },
    }),
    prisma.intake.update({
      where: { id: intake.id },
      data: { status: "SHIPPED" },
    }),
  ]);
  return NextResponse.json({ ok: true });
}

// ─── fulfillments/update ────────────────────────────────────────────────
//
// Fires when carrier reports a delivery status change. If the fulfillment
// flips to "delivered", advance the PharmacyOrder.

async function handleFulfillmentUpdate(body: ShopifyFulfillment) {
  const orderGid = `gid://shopify/Order/${body.order_id}`;
  const intake = await prisma.intake.findFirst({
    where: { shopifyOrderId: orderGid },
    include: { pharmacyOrder: true },
  });
  if (!intake?.pharmacyOrder) {
    return NextResponse.json({ ok: true, ignored: "no_pharmacy_order" });
  }
  if (
    (body.shipment_status === "delivered" || body.status === "success") &&
    intake.pharmacyOrder.status !== "DELIVERED"
  ) {
    await prisma.$transaction([
      prisma.pharmacyOrder.update({
        where: { id: intake.pharmacyOrder.id },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      }),
      prisma.pharmacyAction.create({
        data: {
          pharmacyOrderId: intake.pharmacyOrder.id,
          action: "SHOPIFY_DELIVERY_CONFIRMED",
          payload: { fulfillmentId: body.id, shipmentStatus: body.shipment_status },
        },
      }),
      prisma.intake.update({
        where: { id: intake.id },
        data: { status: "DELIVERED" },
      }),
    ]);
  }
  return NextResponse.json({ ok: true });
}

// ─── Shopify payload shapes ─────────────────────────────────────────────

type ShopifyOrder = {
  id: number;
  name?: string;
  customer?: { id: number; email?: string };
  note_attributes?: Array<{ name?: string; value?: string }>;
};

type ShopifyFulfillment = {
  id: number;
  order_id: number;
  status?: string; // success | failure | open | cancelled
  shipment_status?: string | null; // delivered | in_transit | out_for_delivery | ...
  tracking_company?: string | null;
  tracking_number?: string | null;
  tracking_numbers?: string[];
  tracking_url?: string | null;
  tracking_urls?: string[];
  created_at?: string;
};
