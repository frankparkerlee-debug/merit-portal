"use client";
import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    const res = await signIn("postmark", {
      email,
      redirect: false,
      callbackUrl: "/",
    });
    if (res?.error) {
      setErr("Couldn't send the sign-in email. Check the address or contact ops.");
      setSubmitting(false);
      return;
    }
    window.location.href = "/signin/check-email";
  }

  return (
    <div className="shell" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{
          fontFamily: "'Inter Tight', sans-serif", fontSize: 26, fontWeight: 700,
          letterSpacing: "-0.02em",
        }}>
          Merit<span style={{ color: "var(--merit-cobalt)" }}>.</span>
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
          letterSpacing: "0.18em", textTransform: "uppercase",
          color: "var(--merit-cobalt)", marginTop: 6,
        }}>
          Internal portal
        </div>
      </div>

      <div className="card">
        <h1 style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 22, margin: "0 0 8px" }}>
          Sign in
        </h1>
        <p style={{ color: "var(--merit-soft)", fontSize: 13.5, margin: "0 0 22px", lineHeight: 1.5 }}>
          Enter your staff email. We'll send you a one-time sign-in link.
        </p>
        <form onSubmit={onSubmit}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--merit-mid)" }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@meritsciences.com"
            required
            autoFocus
          />
          {err && <div style={{ marginTop: 12, padding: 10, background: "#FFF5F4", color: "#8B2A22", fontSize: 12.5, borderRadius: 6 }}>{err}</div>}
          <button type="submit" className="btn" disabled={submitting} style={{ marginTop: 18, width: "100%", justifyContent: "center" }}>
            {submitting ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
        <p style={{ marginTop: 18, fontSize: 12, color: "var(--merit-soft)", lineHeight: 1.5 }}>
          Access is granted by your administrator. If your email isn't on the staff allow-list, the link won't sign you in.
        </p>
      </div>
    </div>
  );
}
