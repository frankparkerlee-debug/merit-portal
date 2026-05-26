// Edge-runtime middleware: role-based route gating.
//
// Uses the lightweight auth.config (no Prisma) so it stays Edge-safe.
// Role + userId are read from the JWT (set in lib/auth.ts during sign-in).

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const session = req.auth;
  const role = (session?.user as { role?: string } | undefined)?.role;

  // Routes that don't need auth: signin pages + NextAuth's own routes + the
  // public Shopify webhook (verified by HMAC signature instead).
  const isPublic =
    path.startsWith("/signin") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/shopify-webhook");

  if (!session && !isPublic) {
    const signin = req.nextUrl.clone();
    signin.pathname = "/signin";
    return NextResponse.redirect(signin);
  }

  if (path.startsWith("/physician") && !(role === "PHYSICIAN" || role === "OPS")) {
    return NextResponse.redirect(new URL("/signin/error?reason=role", req.url));
  }
  if (path.startsWith("/pharmacy") && !(role === "PHARMACY" || role === "OPS")) {
    return NextResponse.redirect(new URL("/signin/error?reason=role", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
