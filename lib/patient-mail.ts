// Patient-facing transactional emails.
//
// Bridges the silent period between "you paid" and "your order shipped":
//   • REVIEWING        — physician picked up your intake
//   • LABS_REQUESTED   — physician needs labs before approving
//   • APPROVED         — physician signed off; pharmacy starting
//   • REJECTED         — application declined + refund
//   • COMPOUNDING      — pharmacy is preparing the compound
//   • PACKED           — packed; will ship next
//
// SHIPPED + DELIVERED are intentionally NOT sent from here — Shopify
// handles those automatically via its fulfillment notifications.
//
// Failures are logged but never throw — patient communication should
// never block the underlying state machine.

import { PRESCRIBING_PHYSICIAN } from "@/lib/clinic";

const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY ?? "";
const FROM = process.env.POSTMARK_FROM_EMAIL ?? "rx@meritsciences.com";

type EmailKind =
  | "REVIEWING"
  | "LABS_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "COMPOUNDING"
  | "PACKED";

type EmailContext = {
  to: string;
  patientFirstName: string;
  submissionRef: string;
  orderName?: string | null;
  /** Optional free-form reason (labs request body, rejection reason, etc.). */
  reason?: string;
};

const COPY: Record<EmailKind, { subject: string; lead: string; body: string; cta?: string | null }> = {
  REVIEWING: {
    subject: "Your prescription is being reviewed",
    lead: `${PRESCRIBING_PHYSICIAN.shortName} is reviewing your prescription`,
    body:
      `Hi {firstName},\n\nYour intake has reached ${PRESCRIBING_PHYSICIAN.name} for clinical review. ` +
      `Most reviews complete within one business day. We'll email you the moment a decision is made or if ${PRESCRIBING_PHYSICIAN.shortName} needs additional information.`,
    cta: null,
  },
  LABS_REQUESTED: {
    subject: "Labs needed to complete your review",
    lead: `${PRESCRIBING_PHYSICIAN.shortName} has requested labs`,
    body:
      `Hi {firstName},\n\nBefore approving your prescription, ${PRESCRIBING_PHYSICIAN.name} has requested the following labs:\n\n{reason}\n\n` +
      `You can have these drawn at any quest, labcorp, or in-network provider, then reply to this email with a copy of the results. ` +
      `We'll hold your prescription review until they arrive.`,
    cta: null,
  },
  APPROVED: {
    subject: "Your prescription has been approved",
    lead: `${PRESCRIBING_PHYSICIAN.shortName} has approved your prescription`,
    body:
      `Hi {firstName},\n\n${PRESCRIBING_PHYSICIAN.name} has reviewed your intake and approved your prescription. ` +
      `Your order has been sent to the pharmacy. We'll email you again when compounding begins and once your prescription ships with tracking.`,
    cta: null,
  },
  REJECTED: {
    subject: "About your Merit prescription application",
    lead: "We can't approve this application",
    body:
      `Hi {firstName},\n\nAfter reviewing your intake, ${PRESCRIBING_PHYSICIAN.name} was unable to approve this prescription.\n\nReason: {reason}\n\n` +
      `Your payment will be refunded in full to the original payment method within 5 business days. ` +
      `If you have questions, reply to this email — we're happy to talk through alternatives.`,
    cta: null,
  },
  COMPOUNDING: {
    subject: "Your prescription is being compounded",
    lead: "Pharmacy has started compounding",
    body:
      `Hi {firstName},\n\nThe pharmacy has started compounding your prescription. ` +
      `Compounding for peptide therapies typically takes 1–3 business days. ` +
      `You'll receive a shipping confirmation with tracking the moment it's on its way.`,
    cta: null,
  },
  PACKED: {
    subject: "Your prescription is packed and ready to ship",
    lead: "Packed for shipment",
    body:
      `Hi {firstName},\n\nYour prescription is packed and waiting for the next pickup. ` +
      `Cold-chain shipping is included on every Merit prescription, so it'll arrive temperature-controlled. ` +
      `A separate email with the tracking link follows as soon as it leaves the pharmacy.`,
    cta: null,
  },
};

function fillTemplate(s: string, ctx: EmailContext): string {
  return s
    .replace(/{firstName}/g, ctx.patientFirstName || "there")
    .replace(/{ref}/g, ctx.submissionRef)
    .replace(/{order}/g, ctx.orderName ?? "—")
    .replace(/{reason}/g, ctx.reason ?? "");
}

function buildEmail(kind: EmailKind, ctx: EmailContext): { subject: string; text: string; html: string } {
  const c = COPY[kind];
  const filledBody = fillTemplate(c.body, ctx);
  const subject = c.subject;
  const text = `${filledBody}\n\nReference: ${ctx.submissionRef}${ctx.orderName ? ` · Order ${ctx.orderName}` : ""}\n\n— Merit Sciences\nrx@meritsciences.com`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#0B0F19;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #E5E2DC;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;">
          <div style="font-family:'Inter Tight',-apple-system,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#0B0F19;">Merit<span style="color:#2E4DDB;">.</span></div>
          <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:10.5px;letter-spacing:0.18em;text-transform:uppercase;color:#2E4DDB;margin-top:6px;font-weight:600;">Prescription update</div>
        </td></tr>
        <tr><td style="padding:18px 32px 8px;">
          <h1 style="font-family:'Inter Tight',-apple-system,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.015em;color:#0B0F19;margin:0 0 14px;">${escapeHtml(fillTemplate(c.lead, ctx))}</h1>
          <div style="font-size:14.5px;line-height:1.62;color:#3D4351;white-space:pre-wrap;">${escapeHtml(filledBody)}</div>
        </td></tr>
        <tr><td style="padding:16px 32px 8px;">
          <div style="background:#F4F1EA;border-left:3px solid #2E4DDB;border-radius:4px;padding:12px 14px;">
            <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:10.5px;letter-spacing:0.18em;text-transform:uppercase;color:#2E4DDB;font-weight:600;margin-bottom:4px;">Prescribing physician</div>
            <div style="font-size:14px;color:#0B0F19;"><strong>${PRESCRIBING_PHYSICIAN.name}</strong></div>
          </div>
        </td></tr>
        <tr><td style="padding:8px 32px 28px;">
          <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:11px;color:#6E7585;border-top:1px solid #F4F1EA;padding-top:12px;margin-top:14px;">
            Reference ${escapeHtml(ctx.submissionRef)}${ctx.orderName ? ` · Order ${escapeHtml(ctx.orderName)}` : ""}
          </div>
          <p style="font-size:11.5px;line-height:1.55;color:#B7BCC8;margin:14px 0 0;">Questions? Reply to this email — we'll respond personally.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendPatientEmail(kind: EmailKind, ctx: EmailContext): Promise<void> {
  if (!POSTMARK_API_KEY) {
    console.warn("[patient-mail] POSTMARK_API_KEY not set; skipping", kind);
    return;
  }
  if (!ctx.to) {
    console.warn("[patient-mail] no recipient; skipping", kind);
    return;
  }
  const { subject, text, html } = buildEmail(kind, ctx);
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": POSTMARK_API_KEY,
      },
      body: JSON.stringify({
        From: FROM,
        To: ctx.to,
        Subject: subject,
        TextBody: text,
        HtmlBody: html,
        MessageStream: "outbound",
        TrackOpens: false,
        TrackLinks: "None",
        Tag: `patient-status-${kind.toLowerCase()}`,
      }),
    });
    if (!res.ok) {
      console.warn("[patient-mail] postmark non-OK", kind, res.status, await res.text());
    }
  } catch (err) {
    console.warn("[patient-mail] send failed", kind, err);
  }
}
