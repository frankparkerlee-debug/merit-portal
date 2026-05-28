// HMAC-signed envelope around the real NextAuth callback URL.
//
// Why: Gmail/Google Safe Browsing aggressively follows query-string URLs in
// any link they scan. If our email contains
//   /signin/confirm?target=<callback-url>
// the scanner pulls the callback URL out of the `target=` param and hits IT
// directly, consuming the verification token before the user ever clicks.
//
// Solution: the email link carries only an opaque token. The callback URL is
// encoded + HMAC-signed inside that token. The only way to extract the
// callback URL is to know AUTH_SECRET, which scanners don't. The /signin/
// confirm page renders a static form; only a POST (which scanners don't do)
// reveals the inner URL via a server-side 303 redirect.

import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "";

if (!SECRET) {
  // Surface this loudly at startup — a missing secret means signatures pass
  // verification trivially, which would actually be MORE vulnerable than
  // having no token at all.
  console.error(
    "[confirm-token] AUTH_SECRET is not set — sign-in confirm tokens cannot be securely signed.",
  );
}

const DEFAULT_TTL_SEC = 60 * 60 * 24; // 24h, matches NextAuth verification token TTL

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

export function encodeConfirmToken(url: string, ttlSec: number = DEFAULT_TTL_SEC): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = b64url(JSON.stringify({ url, exp }));
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function decodeConfirmToken(token: string): string | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const { url, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      url?: string;
      exp?: number;
    };
    if (!url || !exp) return null;
    if (Date.now() / 1000 > exp) return null;
    // Refuse anything that isn't an https URL on our own origin — even with
    // a valid signature, this stops an attacker who somehow got hold of the
    // secret from redirecting through us to an arbitrary site.
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}
