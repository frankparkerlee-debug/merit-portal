// Full NextAuth config with Prisma adapter — Node-runtime only.
// Imported by API routes and server actions. NOT by middleware (Edge).
//
// Session strategy is JWT so the role is carried in the token and readable
// from Edge middleware without a DB round-trip. The Prisma adapter still
// manages User, Account, Session, and VerificationToken tables (needed for
// the magic-link email flow).

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import authConfig from "@/lib/auth.config";
import { prisma } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,

    // Allow-list gate: only let an email through sign-in if it already
    // exists in the User table and is active. No public sign-ups.
    async signIn({ user }) {
      if (!user.email) return false;
      const existing = await prisma.user.findUnique({
        where: { email: user.email },
        select: { active: true },
      });
      return existing?.active === true;
    },

    // Embed role + DB user id in the JWT so middleware can read them.
    async jwt({ token, user }) {
      // First sign-in: user is populated. Subsequent calls: only token.
      const email = (user?.email ?? token.email) as string | undefined;
      if (email) {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true, active: true },
        });
        if (dbUser) {
          (token as { role?: string; userId?: string; active?: boolean }).role = dbUser.role;
          (token as { role?: string; userId?: string; active?: boolean }).userId = dbUser.id;
          (token as { role?: string; userId?: string; active?: boolean }).active = dbUser.active;
        }
      }
      return token;
    },

    // Expose role on the session object so server components can read it.
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
  events: {
    async signIn({ user }) {
      if (user?.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch(() => {});
      }
    },
  },
});
