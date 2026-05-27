// Edge-runtime-safe NextAuth config.
//
// This file is imported by middleware.ts (Edge runtime). Anything Node-only
// (Prisma adapter, providers that hit the DB during init, fs, etc.) lives
// in lib/auth.ts instead.
//
// Middleware only needs: pages config + an authorized() callback. It reads
// the JWT directly to enforce role-based routing.

import type { NextAuthConfig } from "next-auth";

export default {
  providers: [], // populated in lib/auth.ts where the adapter is present
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
  },
} satisfies NextAuthConfig;
