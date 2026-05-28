// Full NextAuth config — Node runtime only. Imported by /api/auth/* route
// and server actions. The Postmark provider AND the Prisma adapter live on
// the same instance so magic-link auth can store/verify VerificationTokens.

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Postmark from "next-auth/providers/postmark";
import authConfig from "@/lib/auth.config";
import { prisma } from "@/lib/db";

// Merit-branded magic-link email body.
function buildMagicLinkEmail({ url, host }: { url: string; host: string }) {
  const text = `Sign in to Merit Portal\n\nClick the link below to sign in (expires in 24h):\n${url}\n\nIf you didn't request this, ignore this email.\n\n— Merit Sciences\n${host}`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#0B0F19;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #E5E2DC;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;">
          <div style="font-family:'Inter Tight',-apple-system,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#0B0F19;">Merit<span style="color:#2E4DDB;">.</span></div>
          <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:10.5px;letter-spacing:0.18em;text-transform:uppercase;color:#2E4DDB;margin-top:6px;font-weight:600;">Internal portal · staff sign-in</div>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;">
          <h1 style="font-family:'Inter Tight',-apple-system,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.015em;color:#0B0F19;margin:0 0 12px;">Your sign-in link</h1>
          <p style="font-size:14.5px;line-height:1.6;color:#4A5160;margin:0 0 24px;">Click the button below to sign in to the Merit Portal. This link expires in 24 hours and only works once.</p>
        </td></tr>
        <tr><td align="center" style="padding:0 32px 24px;">
          <a href="${url}" style="display:inline-block;padding:13px 28px;background:#2E4DDB;color:#fff;border-radius:8px;font-family:'Inter',-apple-system,sans-serif;font-size:14.5px;font-weight:600;text-decoration:none;">Sign in to Merit Portal</a>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;">
          <p style="font-size:12px;line-height:1.55;color:#6E7585;margin:0 0 8px;">Or paste this URL into your browser:</p>
          <p style="font-family:'JetBrains Mono',Menlo,monospace;font-size:11px;line-height:1.5;color:#4A5160;word-break:break-all;background:#F4F1EA;padding:10px 12px;border-radius:6px;margin:0;">${url}</p>
          <p style="font-size:11.5px;line-height:1.55;color:#B7BCC8;margin:20px 0 0;border-top:1px solid #F4F1EA;padding-top:16px;">Didn't request this? Ignore the email — no further action needed.<br>Questions? Reach the team at info@meritsciences.com.</p>
        </td></tr>
      </table>
      <p style="font-family:'JetBrains Mono',Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#B7BCC8;margin:18px 0 0;">${host}</p>
    </td></tr>
  </table>
</body></html>`;
  return { text, html };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Postmark({
      apiKey: process.env.POSTMARK_API_KEY,
      from: process.env.POSTMARK_FROM_EMAIL ?? "no-reply@meritsciences.com",
      // Override default email body with Merit branding.
      // CRITICAL: TrackLinks=None — Postmark click-tracking wraps the magic
      // link in t.postmark.com which browsers flag as phishing when the auth
      // chain is unfamiliar. Disabling tracking sends users straight to our
      // domain.
      async sendVerificationRequest({ identifier, url, provider }) {
        // Wrap the real NextAuth callback in our /signin/confirm page so that
        // Gmail/Outlook/Postmark "safe link" scanners that GET the URL before
        // the user clicks can't consume the verification token. The confirm
        // page requires a JS-driven button click to redirect to the actual
        // callback — scanners don't execute JS and don't click buttons.
        const verifyUrl = new URL(url);
        const confirmUrl = new URL(`${verifyUrl.origin}/signin/confirm`);
        confirmUrl.searchParams.set("target", url);
        const linkUrl = confirmUrl.toString();
        const host = verifyUrl.host;
        const { text, html } = buildMagicLinkEmail({ url: linkUrl, host });
        const res = await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Postmark-Server-Token": provider.apiKey as string,
          },
          body: JSON.stringify({
            From: provider.from,
            To: identifier,
            Subject: "Your Merit Portal sign-in link",
            TextBody: text,
            HtmlBody: html,
            MessageStream: "outbound",
            TrackOpens: false,
            TrackLinks: "None",
            Tag: "magic-link",
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Postmark send failed (${res.status}): ${body}`);
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    // Allow-list gate: only let an email through sign-in if it's in the
    // User table and active. No public sign-ups.
    async signIn({ user }) {
      const rawEmail = user?.email;
      const email = rawEmail?.toLowerCase();
      console.log("[signIn] raw email:", JSON.stringify(rawEmail), "→ lowercased:", JSON.stringify(email));
      if (!email) {
        console.log("[signIn] REJECT: no email on user object");
        return false;
      }
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true, active: true, role: true },
      });
      console.log("[signIn] DB lookup result:", JSON.stringify(existing));
      const allowed = existing?.active === true;
      console.log("[signIn] decision:", allowed ? "ALLOW" : "REJECT");
      return allowed;
    },

    async jwt({ token, user }) {
      const email = (user?.email ?? token.email)?.toLowerCase() as string | undefined;
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
