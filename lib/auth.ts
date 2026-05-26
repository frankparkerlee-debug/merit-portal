// NextAuth v5 (Auth.js) — email-magic-link auth via Postmark.
// Staff-only: physicians, pharmacy users, ops. Patients live in Shopify.
//
// Allow-list model: nobody can sign in unless their email is pre-provisioned
// in the User table with a role. No public sign-up. New staff are seeded
// manually (we add them via Prisma Studio or a one-off script).

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Postmark from "next-auth/providers/postmark";
import { prisma } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Postmark({
      apiKey: process.env.POSTMARK_API_KEY!,
      from: process.env.POSTMARK_FROM_EMAIL ?? "no-reply@meritsciences.com",
    }),
  ],
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
    error: "/signin/error",
  },
  callbacks: {
    // Allow-list gate: only accept logins for emails that already exist as a
    // staff user. Prevents anyone from creating a portal account by guessing
    // the magic-link flow.
    async signIn({ user }) {
      if (!user.email) return false;
      const existing = await prisma.user.findUnique({
        where: { email: user.email },
        select: { active: true },
      });
      return existing?.active === true;
    },
    async session({ session, user }) {
      // Attach role to the session so middleware can gate by it.
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, active: true },
      });
      if (dbUser) {
        (session.user as { role?: string; active?: boolean }).role = dbUser.role;
        (session.user as { role?: string; active?: boolean }).active = dbUser.active;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      // Update lastLoginAt on every successful sign-in
      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
      }
    },
  },
});
