// NextAuth lands here when authentication fails. The `error` query param
// tells us which kind of failure, and the copy needs to match — otherwise a
// consumed-link error looks identical to an actual allow-list rejection, and
// the user thinks their account is revoked when really the link expired.
//
// Error codes (from @auth/core):
//   AccessDenied  — signIn callback returned false (real allow-list miss)
//   Verification  — token missing/expired/already-used (email scanner most
//                   commonly consumes it before the user can click)
//   Configuration — server-side misconfig
//   Default       — anything else

type ErrorKind = "AccessDenied" | "Verification" | "Configuration" | "Default";

const COPY: Record<ErrorKind, { title: string; body: string; cta: string }> = {
  AccessDenied: {
    title: "Access denied",
    body: "This email isn't on the staff allow-list, or access has been revoked. Contact ops if you think this is a mistake.",
    cta: "← Back to sign-in",
  },
  Verification: {
    title: "Link no longer valid",
    body: "This sign-in link has expired or already been used. Request a fresh link below — it'll only be valid for 24 hours and one click.",
    cta: "Request a new link",
  },
  Configuration: {
    title: "Sign-in temporarily unavailable",
    body: "The portal hit a configuration error. The ops team has been notified. Try again in a few minutes.",
    cta: "← Back to sign-in",
  },
  Default: {
    title: "Couldn't sign you in",
    body: "Something went wrong on our end. Try requesting a new sign-in link.",
    cta: "← Back to sign-in",
  },
};

function pickCopy(error?: string) {
  if (error === "AccessDenied") return COPY.AccessDenied;
  if (error === "Verification") return COPY.Verification;
  if (error === "Configuration") return COPY.Configuration;
  return COPY.Default;
}

export default async function SignInError({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const copy = pickCopy(params.error);
  return (
    <div className="shell" style={{ maxWidth: 460, paddingTop: 80 }}>
      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Merit<span style={{ color: "var(--merit-cobalt)" }}>.</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',Menlo,monospace", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--merit-cobalt)", marginTop: 6, fontWeight: 600 }}>
            Sign-in error
          </div>
        </div>
        <h1 style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 20, margin: "0 0 8px" }}>
          {copy.title}
        </h1>
        <p style={{ color: "var(--merit-soft)", fontSize: 14, margin: "0 0 20px", lineHeight: 1.55 }}>
          {copy.body}
        </p>
        <a href="/signin" className="btn btn--ghost">{copy.cta}</a>
      </div>
    </div>
  );
}
