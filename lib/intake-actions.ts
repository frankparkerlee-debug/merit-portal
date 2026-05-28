// Physician decision server actions.
//
// Each action: (1) verifies the session has physician privilege, (2)
// updates Intake.status, (3) writes an IntakeAction audit row tying the
// decision to the actor + reason, (4) creates a PharmacyOrder if approved.
//
// Shopify side-effects (refund on reject, fulfill on approve) are stubbed
// for now — a TODO marker in each branch. We'll wire them in once the
// Shopify Admin client is added to the portal (mirroring the existing
// shopify-auth.js helper from the storefront repo).

"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendPatientEmail } from "@/lib/patient-mail";

async function requirePhysician() {
  const session = await auth();
  const role = (session?.user as { role?: string; id?: string } | undefined)?.role;
  const userId = (session?.user as { role?: string; id?: string } | undefined)?.id;
  if (!session?.user || !["PHYSICIAN", "OPS"].includes(role ?? "")) {
    throw new Error("Unauthorized");
  }
  return { userId, email: session.user.email! };
}

export async function markUnderReview(intakeId: string, _actorEmail: string) {
  const { userId } = await requirePhysician();
  const intake = await prisma.intake.findUnique({
    where: { id: intakeId },
    select: { status: true, patientEmail: true, patientFirstName: true, submissionRef: true, shopifyOrderName: true },
  });
  if (!intake) throw new Error("Intake not found");
  await prisma.$transaction([
    prisma.intake.update({ where: { id: intakeId }, data: { status: "UNDER_REVIEW" } }),
    prisma.intakeAction.create({
      data: {
        intakeId,
        actorId: userId,
        action: "MARK_UNDER_REVIEW",
        fromStatus: intake.status,
        toStatus: "UNDER_REVIEW",
      },
    }),
  ]);
  await sendPatientEmail("REVIEWING", {
    to: intake.patientEmail,
    patientFirstName: intake.patientFirstName,
    submissionRef: intake.submissionRef,
    orderName: intake.shopifyOrderName,
  });
}

export async function approveIntake(intakeId: string, _actorEmail: string) {
  const { userId } = await requirePhysician();
  const intake = await prisma.intake.findUnique({
    where: { id: intakeId },
    select: {
      status: true, pharmacyOrder: true,
      patientEmail: true, patientFirstName: true, submissionRef: true, shopifyOrderName: true,
    },
  });
  if (!intake) throw new Error("Intake not found");

  // Rx expires in 6 months (typical refill window for compounded peptides)
  const rxExpiresAt = new Date();
  rxExpiresAt.setMonth(rxExpiresAt.getMonth() + 6);

  await prisma.$transaction(async (tx) => {
    await tx.intake.update({
      where: { id: intakeId },
      data: { status: "APPROVED", rxExpiresAt },
    });
    await tx.intakeAction.create({
      data: {
        intakeId,
        actorId: userId,
        action: "APPROVE",
        fromStatus: intake.status,
        toStatus: "APPROVED",
        payload: { rxExpiresAt: rxExpiresAt.toISOString() },
      },
    });
    if (!intake.pharmacyOrder) {
      await tx.pharmacyOrder.create({
        data: { intakeId, status: "PENDING" },
      });
    }
  });

  await sendPatientEmail("APPROVED", {
    to: intake.patientEmail,
    patientFirstName: intake.patientFirstName,
    submissionRef: intake.submissionRef,
    orderName: intake.shopifyOrderName,
  });
}

export async function requestLabs(intakeId: string, _actorEmail: string, reason: string) {
  const { userId } = await requirePhysician();
  const intake = await prisma.intake.findUnique({
    where: { id: intakeId },
    select: { status: true, patientEmail: true, patientFirstName: true, submissionRef: true, shopifyOrderName: true },
  });
  if (!intake) throw new Error("Intake not found");

  await prisma.$transaction([
    prisma.intake.update({ where: { id: intakeId }, data: { status: "LABS_REQUESTED" } }),
    prisma.intakeAction.create({
      data: {
        intakeId,
        actorId: userId,
        action: "REQUEST_LABS",
        fromStatus: intake.status,
        toStatus: "LABS_REQUESTED",
        payload: { reason },
      },
    }),
    prisma.intakeMessage.create({
      data: {
        intakeId,
        fromRole: "physician",
        body: `Labs requested: ${reason}`,
      },
    }),
  ]);

  await sendPatientEmail("LABS_REQUESTED", {
    to: intake.patientEmail,
    patientFirstName: intake.patientFirstName,
    submissionRef: intake.submissionRef,
    orderName: intake.shopifyOrderName,
    reason,
  });
}

export async function rejectIntake(intakeId: string, _actorEmail: string, reason: string) {
  const { userId } = await requirePhysician();
  const intake = await prisma.intake.findUnique({
    where: { id: intakeId },
    select: {
      status: true, shopifyOrderId: true,
      patientEmail: true, patientFirstName: true, submissionRef: true, shopifyOrderName: true,
    },
  });
  if (!intake) throw new Error("Intake not found");

  await prisma.$transaction([
    prisma.intake.update({ where: { id: intakeId }, data: { status: "REJECTED" } }),
    prisma.intakeAction.create({
      data: {
        intakeId,
        actorId: userId,
        action: "REJECT",
        fromStatus: intake.status,
        toStatus: "REJECTED",
        payload: { reason, willRefund: Boolean(intake.shopifyOrderId) },
      },
    }),
    prisma.intakeMessage.create({
      data: {
        intakeId,
        fromRole: "physician",
        body: `Application declined: ${reason}`,
      },
    }),
  ]);

  await sendPatientEmail("REJECTED", {
    to: intake.patientEmail,
    patientFirstName: intake.patientFirstName,
    submissionRef: intake.submissionRef,
    orderName: intake.shopifyOrderName,
    reason,
  });

  // TODO: Shopify — POST the refund order mutation if a paid order exists.
}
