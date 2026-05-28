// Shopify webhook receiver.
//
// We register `orders/paid` against this endpoint. When Shopify fires, we:
//   1. Verify the X-Shopify-Hmac-Sha256 signature against SHOPIFY_WEBHOOK_SECRET
//      (timing-safe). Any failure → 401, no body inspection.
//   2. Read the order body. Look for `note_attributes[submission_ref]` —
//      the value the intake form attached as a cart attribute.
//   3. Find the matching Intake row and flip it to status=PAID, stamping
//      the Shopify customer/order references on the row.
//
// We respond 200 immediately on duplicate webhooks (Shopify retries with
// exponential backoff; idempotency must live on our side).

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

  let body: ShopifyOrder;
  try {
    body = JSON.parse(rawBody) as ShopifyOrder;
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  // Find the submission_ref in note attributes
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

  // Idempotency: if we've already stamped this order, no-op
  const orderGid = `gid://shopify/Order/${body.id}`;
  const customerGid = body.customer ? `gid://shopify/Customer/${body.customer.id}` : null;
  if (intake.shopifyOrderId === orderGid && intake.status === "PAID") {
    return NextResponse.json({ ok: true, ignored: "duplicate" });
  }

  if (topic === "orders/paid") {
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
  }

  return NextResponse.json({ ok: true });
}

// Shopify order shape — just the fields we care about
type ShopifyOrder = {
  id: number;
  name?: string;
  customer?: { id: number; email?: string };
  note_attributes?: Array<{ name?: string; value?: string }>;
  line_items?: Array<{ variant_id?: number; product_id?: number; title?: string }>;
};
