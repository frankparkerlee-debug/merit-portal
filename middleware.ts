// Route-level role enforcement. Sits in front of /physician/* and /pharmacy/*
// to gate them by the session's role claim.
//
// NextAuth v5's middleware export keeps the same session API as in pages.

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const session = req.auth;
  const role = (session?.user as { role?: string } | undefined)?.role;

  // Unauthenticated → bounce to signin (except signin routes + api/auth)
  const isAuthRoute =
    path.startsWith("/signin") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/shopify-webhook"); // webhooks verified by signature instead
  if (!session && !isAuthRoute) {
    const signin = req.nextUrl.clone();
    signin.pathname = "/signin";
    return NextResponse.redirect(signin);
  }

  // Role gates
  if (path.startsWith("/physician") && !(role === "PHYSICIAN" || role === "OPS")) {
    return NextResponse.redirect(new URL("/signin/error?reason=role", req.url));
  }
  if (path.startsWith("/pharmacy") && !(role === "PHARMACY" || role === "OPS")) {
    return NextResponse.redirect(new URL("/signin/error?reason=role", req.url));
  }

  return NextResponse.next();
});

// Apply to everything except static assets + the favicon
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
