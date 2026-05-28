// Server endpoint that completes the magic-link sign-in flow.
//
// The /signin/confirm page POSTs the HMAC-signed token here. We decode +
// verify, then 303-redirect the browser to the real NextAuth callback URL.
// Because this endpoint only accepts POST, email scanners (which GET) can
// never trigger it — so the underlying NextAuth verification token stays
// alive until a human actually clicks the button.

import { NextRequest, NextResponse } from "next/server";
import { decodeConfirmToken } from "@/lib/confirm-token";

export const runtime = "nodejs";

// Next.js gives us `req.url` as the *internal* container URL
// (https://localhost:10000/...) which is useless for redirects sent back
// to the browser. Reconstruct the public origin from the forwarded-host
// headers Render's proxy sets, or fall back to AUTH_URL.
function publicOrigin(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://merit-portal.onrender.com";
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = (form.get("t") as string | null) ?? "";
  const target = decodeConfirmToken(token);
  const origin = publicOrigin(req);
  if (!target) {
    return NextResponse.redirect(new URL("/signin/error?error=Verification", origin), 303);
  }
  return NextResponse.redirect(target, 303);
}

// Hard-fail on GET so a curious scanner that fishes the URL out of HTML or
// network traces still can't redirect itself to the callback URL.
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  return NextResponse.redirect(new URL("/signin", origin), 303);
}
