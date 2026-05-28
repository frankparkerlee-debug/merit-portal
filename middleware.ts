// Edge-runtime middleware: role-based route gating.
//
// We read the JWT cookie *directly* via getToken() rather than going through
// the NextAuth(authConfig).auth() wrapper. Reason: in Auth.js v5 beta the
// session callback's invocation in Edge middleware is inconsistent across
// betas — sometimes the wrapper returns a session with only the default
// fields (email/name/image) regardless of what the session callback would
// have added. getToken reads the raw decoded JWT, so any custom fields the
// jwt callback set (role, userId, active) come through reliably.

import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const AUTH_SECRET = process.env.AUTH_SECRET;

export default async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Routes that don't need auth: signin pages + NextAuth's own routes + the
  // public Shopify webhook (verified by HMAC signature instead) + the
  // post-magic-link finalize endpoint.
  const isPublic =
    path.startsWith("/signin") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/api/signin") ||
    path.startsWith("/api/shopify-webhook");

  // Read the raw decoded JWT (no session callback indirection). In production
  // NextAuth uses the __Secure- prefixed cookie name; getToken handles that
  // automatically based on the protocol.
  const token = await getToken({
    req,
    secret: AUTH_SECRET,
    secureCookie: true,
  });

  const email = token?.email as string | undefined;
  const role = token?.role as string | undefined;
  const isAuthed = Boolean(email);

  // Diagnostic — remove once stable
  console.log(`[mw] path=${path} authed=${isAuthed} email=${email ?? "-"} role=${role ?? "-"}`);

  if (!isAuthed && !isPublic) {
    const signin = req.nextUrl.clone();
    signin.pathname = "/signin";
    signin.search = "";
    return NextResponse.redirect(signin);
  }

  // Authed: gate by role
  if (isAuthed) {
    if (path.startsWith("/physician") && !(role === "PHYSICIAN" || role === "OPS")) {
      console.log(`[mw] reject /physician: role=${role}`);
      return NextResponse.redirect(new URL("/signin/error?reason=role", req.url));
    }
    if (path.startsWith("/pharmacy") && !(role === "PHARMACY" || role === "OPS")) {
      console.log(`[mw] reject /pharmacy: role=${role}`);
      return NextResponse.redirect(new URL("/signin/error?reason=role", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
