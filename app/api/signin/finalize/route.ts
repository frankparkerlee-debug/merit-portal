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

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = (form.get("t") as string | null) ?? "";
  const target = decodeConfirmToken(token);
  if (!target) {
    return NextResponse.redirect(new URL("/signin/error?error=Verification", req.url), 303);
  }
  return NextResponse.redirect(target, 303);
}

// Hard-fail on GET so a curious scanner that fishes the URL out of HTML or
// network traces still can't redirect itself to the callback URL.
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/signin", req.url), 303);
}
