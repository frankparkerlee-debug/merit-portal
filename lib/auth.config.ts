// Edge-runtime-safe NextAuth config.
//
// This file CANNOT import Prisma (or anything that pulls in Node-only deps).
// It's imported by middleware.ts, which runs in the Edge runtime.
//
// The full Prisma-backed config lives in lib/auth.ts and is used by the
// /api/auth route + server actions.

import type { NextAuthConfig } from "next-auth";
import Postmark from "next-auth/providers/postmark";

export default {
  providers: [
    Postmark({
      apiKey: process.env.POSTMARK_API_KEY,
      from: process.env.POSTMARK_FROM_EMAIL ?? "no-reply@meritsciences.com",
    }),
  ],
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
    error: "/signin/error",
  },
  // Authorization decisions happen in middleware.ts directly so we can
  // do role-based routing — not just yes/no access.
  callbacks: {
    async authorized() {
      return true;
    },
  },
} satisfies NextAuthConfig;
