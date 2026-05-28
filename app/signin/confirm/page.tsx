// Email-scanner-resistant sign-in interstitial.
//
// This is a Server Component on purpose — no client JS at all. The page
// renders a static form whose only action is a POST to /api/signin/finalize
// with the opaque confirm token. Why this defeats Gmail/Google Safe Browsing
// pre-fetching:
//
//   • Scanners GET URLs they find in email; they do NOT submit forms.
//   • The actual NextAuth callback URL is never visible — it's HMAC-encoded
//     inside the `t` param, decryptable only with AUTH_SECRET.
//   • Even if a scanner crawls the URL string `t=…`, there's no callback URL
//     hidden inside to follow.
//
// The user clicks the button → browser POSTs the token → server decodes it
// and 303-redirects to the real NextAuth callback. The token is consumed on
// the real click, not on the scanner's GET.

import ConfirmCard from "./card";

export default async function Confirm({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return (
    <div className="shell" style={{ maxWidth: 460, paddingTop: 80 }}>
      <ConfirmCard token={t ?? ""} />
    </div>
  );
}
