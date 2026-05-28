// Edge-runtime-safe NextAuth config.
//
// This file is imported by middleware.ts (Edge runtime). Anything Node-only
// (Prisma adapter, providers that hit the DB during init, fs, etc.) lives
// in lib/auth.ts instead.
//
// Middleware only needs: pages config + a session callback that copies
// role/userId/active from the JWT onto session.user so that route gates can
// read the current user's role. The role is *populated* into the JWT during
// sign-in by the full lib/auth.ts jwt callback (which does need Prisma); by
// the time middleware reads the cookie, the role is already in the token
// and we just need to surface it on session.user — no DB lookup required.

import type { NextAuthConfig } from "next-auth";

export default {
  providers: [], // populated in lib/auth.ts where the adapter is present
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
    error: "/signin/error",
  },
  callbacks: {
    async authorized() {
      // Per-route gating happens in middleware.ts itself so we can
      // distinguish unauthenticated → /signin vs wrong-role → /signin/error.
      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string; id?: string; active?: boolean }).role =
          (token as { role?: string }).role;
        (session.user as { role?: string; id?: string; active?: boolean }).id =
          (token as { userId?: string }).userId;
        (session.user as { role?: string; id?: string; active?: boolean }).active =
          (token as { active?: boolean }).active;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
