// Pharmacy state-transition server actions.
//
// Each step (1) checks the actor has PHARMACY or OPS role, (2) updates
// PharmacyOrder.status, (3) writes a PharmacyAction audit row, and (4)
// mirrors the status onto the parent Intake row so the physician queue
// reflects shipping progress without a separate query.
//
// Shopify writeback (mark order as fulfilled, attach tracking number to
// the Shopify order so the customer's "where's my order?" page updates)
// is stubbed — TODO markers point at the same place lib/intake-actions.ts
// will wire when we add the portal-side Shopify client.

"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createShopifyFulfillment } from "@/lib/shopify";

async function requirePharmacy() {
  const session = await auth();
  const role = (session?.user as { role?: string; id?: string } | undefined)?.role;
  const userId = (session?.user as { role?: string; id?: string } | undefined)?.id;
  if (!session?.user || !["PHARMACY", "OPS"].includes(role ?? "")) {
    throw new Error("Unauthorized");
  }
  return { userId };
}

export async function startCompounding(orderId: string, _actorEmail: string) {
  const { userId } = await requirePharmacy();
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: orderId },
    select: { status: true, intakeId: true },
  });
  if (!order) throw new Error("Order not found");
  await prisma.$transaction([
    prisma.pharmacyOrder.update({ where: { id: orderId }, data: { status: "COMPOUNDING" } }),
    prisma.pharmacyAction.create({
      data: {
        pharmacyOrderId: orderId,
        actorId: userId,
        action: "START_COMPOUNDING",
      },
    }),
    // Mirror onto intake so physician queue sees progress
    prisma.intake.update({
      where: { id: order.intakeId },
      data: { status: "SENT_TO_PHARMACY" },
    }),
  ]);
}

export async function markPacked(orderId: string, _actorEmail: string) {
  const { userId } = await requirePharmacy();
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order) throw new Error("Order not found");
  await prisma.$transaction([
    prisma.pharmacyOrder.update({ where: { id: orderId }, data: { status: "PACKED" } }),
    prisma.pharmacyAction.create({
      data: {
        pharmacyOrderId: orderId,
        actorId: userId,
        action: "MARK_PACKED",
      },
    }),
  ]);
}

export async function markShipped(
  orderId: string,
  _actorEmail: string,
  tracking: { carrier: string; trackingNumber: string; trackingUrl: string | null },
) {
  const { userId } = await requirePharmacy();
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      intakeId: true,
      intake: { select: { shopifyOrderId: true } },
    },
  });
  if (!order) throw new Error("Order not found");

  // First, do the Shopify-side fulfillment so the customer receives the
  // automatic shipping-confirmation email with the tracking link. If
  // Shopify fails (no order linked, scope issue, etc.) we still record
  // the local state change but flag the failure on the audit row so ops
  // knows to retry manually.
  let shopifyResult: { ok: true; fulfillmentId: string } | { ok: false; error: string } = {
    ok: false,
    error: "no Shopify order linked",
  };
  if (order.intake.shopifyOrderId) {
    try {
      shopifyResult = await createShopifyFulfillment(order.intake.shopifyOrderId, {
        carrier: tracking.carrier,
        number: tracking.trackingNumber,
        url: tracking.trackingUrl,
      });
    } catch (err) {
      shopifyResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  await prisma.$transaction([
    prisma.pharmacyOrder.update({
      where: { id: orderId },
      data: {
        status: "SHIPPED",
        trackingCarrier: tracking.carrier,
        trackingNumber: tracking.trackingNumber,
        trackingUrl: tracking.trackingUrl,
        shippedAt: new Date(),
      },
    }),
    prisma.pharmacyAction.create({
      data: {
        pharmacyOrderId: orderId,
        actorId: userId,
        action: "MARK_SHIPPED",
        payload: {
          ...tracking,
          shopifyFulfillmentId: shopifyResult.ok ? shopifyResult.fulfillmentId : null,
          shopifyError: shopifyResult.ok ? null : shopifyResult.error,
        },
      },
    }),
    prisma.intake.update({
      where: { id: order.intakeId },
      data: { status: "SHIPPED" },
    }),
  ]);
}

export async function markDelivered(orderId: string, _actorEmail: string) {
  const { userId } = await requirePharmacy();
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id: orderId },
    select: { status: true, intakeId: true },
  });
  if (!order) throw new Error("Order not found");
  await prisma.$transaction([
    prisma.pharmacyOrder.update({
      where: { id: orderId },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    }),
    prisma.pharmacyAction.create({
      data: {
        pharmacyOrderId: orderId,
        actorId: userId,
        action: "MARK_DELIVERED",
      },
    }),
    prisma.intake.update({
      where: { id: order.intakeId },
      data: { status: "DELIVERED" },
    }),
  ]);
}
