// Visual card for the confirm page. Pure HTML — no client JS. The button
// is a real <button type="submit"> inside a real <form method="POST">; that
// combo is what defeats scanner pre-fetching (scanners GET, never POST).

export default function ConfirmCard({ token }: { token: string }) {
  if (!token) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 20, margin: "0 0 8px" }}>
          Invalid link
        </h1>
        <p style={{ color: "var(--merit-soft)", fontSize: 14, margin: 0 }}>
          The sign-in link is missing required information. Request a new one from{" "}
          <a href="/signin">the sign-in page</a>.
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontFamily: "'Inter Tight',sans-serif",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Merit<span style={{ color: "var(--merit-cobalt)" }}>.</span>
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono',Menlo,monospace",
            fontSize: 10.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--merit-cobalt)",
            marginTop: 6,
            fontWeight: 600,
          }}
        >
          Confirm sign-in
        </div>
      </div>
      <h1 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 20, margin: "0 0 8px" }}>
        Ready to continue?
      </h1>
      <p
        style={{
          color: "var(--merit-soft)",
          fontSize: 14,
          margin: "0 0 22px",
          lineHeight: 1.55,
        }}
      >
        For your security we need one quick confirmation that it's really you on this device.
        Click below to finish signing in.
      </p>
      <form method="POST" action="/api/signin/finalize">
        <input type="hidden" name="t" value={token} />
        <button type="submit" className="btn" style={{ width: "100%", justifyContent: "center" }}>
          Sign in to Merit Portal →
        </button>
      </form>
      <p
        style={{
          fontSize: 12,
          color: "var(--merit-soft)",
          marginTop: 20,
          lineHeight: 1.5,
        }}
      >
        If you didn't request this link, you can safely close this tab.
      </p>
    </div>
  );
}
