// Human-readable submission reference generator.
//
// Format: RX-<6 char base36>. Chosen to match the legacy Shopify form's
// client-side IDs (RX-3XF2K9 etc.) so existing screenshots, emails, and
// internal Slack threads remain readable.

import crypto from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid handwriting confusion

export function newSubmissionRef(): string {
  const bytes = crypto.randomBytes(6);
  let out = "";
  for (const b of bytes) {
    out += ALPHABET[b % ALPHABET.length];
  }
  return `RX-${out}`;
}
