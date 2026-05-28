"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

// One-extra-click confirmation page that defeats email-client link prefetching.
//
// The problem this solves: Gmail/Outlook/Postmark/etc. all run "safe link"
// scanners that GET your URL before you ever see it. When the magic link is
// the direct NextAuth callback, that scanner consumes the verification
// token, so by the time you click in your inbox the token is gone and you
// get "No record was found for a delete" → "Can't sign you in".
//
// By making the email link point to THIS page first, the scanner only
// renders HTML. The actual NextAuth callback URL is hidden behind a button
// + JavaScript redirect — scanners don't click buttons and don't run JS.

function ConfirmInner() {
  const params = useSearchParams();
  const target = params.get("target");
  const [clicked, setClicked] = useState(false);

  if (!target) {
    return (
      <div className="card" style={{ textAlign: "center", maxWidth: 420 }}>
        <h1 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 20, margin: "0 0 8px" }}>Invalid link</h1>
        <p style={{ color: "var(--merit-soft)", fontSize: 14, margin: 0 }}>
          The sign-in link is missing required information. Request a new one from <a href="/signin">the sign-in page</a>.
        </p>
      </div>
    );
  }

  const onClick = () => {
    setClicked(true);
    window.location.href = target;
  };

  return (
    <div className="card" style={{ textAlign: "center", maxWidth: 420 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Merit<span style={{ color: "var(--merit-cobalt)" }}>.</span>
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',Menlo,monospace", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--merit-cobalt)", marginTop: 6, fontWeight: 600 }}>
          Confirm sign-in
        </div>
      </div>
      <h1 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 20, margin: "0 0 8px" }}>
        Ready to continue?
      </h1>
      <p style={{ color: "var(--merit-soft)", fontSize: 14, margin: "0 0 22px", lineHeight: 1.55 }}>
        For your security we need one quick confirmation that it's really you on this device. Click below to finish signing in.
      </p>
      <button
        type="button"
        className="btn"
        onClick={onClick}
        disabled={clicked}
        style={{ width: "100%", justifyContent: "center" }}
      >
        {clicked ? "Signing you in…" : "Sign in to Merit Portal →"}
      </button>
      <p style={{ fontSize: 12, color: "var(--merit-soft)", marginTop: 20, lineHeight: 1.5 }}>
        If you didn't request this link, you can safely close this tab.
      </p>
    </div>
  );
}

export default function Confirm() {
  return (
    <div className="shell" style={{ maxWidth: 460, paddingTop: 80 }}>
      <Suspense fallback={<div className="card">Loading…</div>}>
        <ConfirmInner />
      </Suspense>
    </div>
  );
}
