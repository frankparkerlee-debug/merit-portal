export default function SignInError({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  return (
    <div className="shell" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div className="card" style={{ textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 20, margin: "0 0 8px" }}>
          Can't sign you in
        </h1>
        <p style={{ color: "var(--merit-mid)", fontSize: 14, margin: "0 0 16px", lineHeight: 1.55 }}>
          Your email isn't on the staff allow-list, or your access has been revoked. Contact ops if you think this is a mistake.
        </p>
        <a href="/signin" className="btn btn--ghost">← Back to sign-in</a>
      </div>
    </div>
  );
}
