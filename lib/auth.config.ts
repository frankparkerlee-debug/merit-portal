// Edge-runtime-safe NextAuth config.
//
// This file CANNOT import Prisma (or anything that pulls in Node-only deps).
// It's imported by middleware.ts, which runs in the Edge runtime.
//
// The full Prisma-backed config lives in lib/auth.ts and is used by the
// /api/auth route + server actions.

import type { NextAuthConfig } from "next-auth";
import Postmark from "next-auth/providers/postmark";

// Merit-branded magic-link email. Replaces NextAuth's generic default.
function buildMagicLinkEmail({ url, host }: { url: string; host: string }) {
  const text = `Sign in to Merit Portal\n\nClick the link below to sign in (expires in 24h):\n${url}\n\nIf you didn't request this, ignore this email.\n\n— Merit Sciences\n${host}`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#0B0F19;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #E5E2DC;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:32px 32px 8px;">
          <div style="font-family:'Inter Tight',-apple-system,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#0B0F19;">
            Merit<span style="color:#2E4DDB;">.</span>
          </div>
          <div style="font-family:'JetBrains Mono',Menlo,monospace;font-size:10.5px;letter-spacing:0.18em;text-transform:uppercase;color:#2E4DDB;margin-top:6px;font-weight:600;">
            Internal portal · staff sign-in
          </div>
        </td></tr>
        <tr><td style="padding:24px 32px 8px;">
          <h1 style="font-family:'Inter Tight',-apple-system,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.015em;color:#0B0F19;margin:0 0 12px;">
            Your sign-in link
          </h1>
          <p style="font-size:14.5px;line-height:1.6;color:#4A5160;margin:0 0 24px;">
            Click the button below to sign in to the Merit Portal. This link expires in 24 hours and only works once.
          </p>
        </td></tr>
        <tr><td align="center" style="padding:0 32px 24px;">
          <a href="${url}" style="display:inline-block;padding:13px 28px;background:#2E4DDB;color:#fff;border-radius:8px;font-family:'Inter',-apple-system,sans-serif;font-size:14.5px;font-weight:600;text-decoration:none;">
            Sign in to Merit Portal
          </a>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;">
          <p style="font-size:12px;line-height:1.55;color:#6E7585;margin:0 0 8px;">
            Or paste this URL into your browser:
          </p>
          <p style="font-family:'JetBrains Mono',Menlo,monospace;font-size:11px;line-height:1.5;color:#4A5160;word-break:break-all;background:#F4F1EA;padding:10px 12px;border-radius:6px;margin:0;">
            ${url}
          </p>
          <p style="font-size:11.5px;line-height:1.55;color:#B7BCC8;margin:20px 0 0;border-top:1px solid #F4F1EA;padding-top:16px;">
            Didn't request this? Ignore the email — no further action needed.<br>
            Questions? Reach the team at info@meritsciences.com.
          </p>
        </td></tr>
      </table>
      <p style="font-family:'JetBrains Mono',Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#B7BCC8;margin:18px 0 0;">
        ${host}
      </p>
    </td></tr>
  </table>
</body></html>`;
  return { text, html };
}

export default {
  providers: [
    Postmark({
      apiKey: process.env.POSTMARK_API_KEY,
      from: process.env.POSTMARK_FROM_EMAIL ?? "no-reply@meritsciences.com",
      // Override the default email body with Merit branding
      async sendVerificationRequest({ identifier, url, provider }) {
        const host = new URL(url).host;
        const { text, html } = buildMagicLinkEmail({ url, host });
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
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
    error: "/signin/error",
  },
  callbacks: {
    async authorized() {
      return true;
    },
  },
} satisfies NextAuthConfig;
