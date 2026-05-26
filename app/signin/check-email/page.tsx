export default function CheckEmail() {
  return (
    <div className="shell" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ width: 56, height: 56, margin: "0 auto 16px", background: "var(--merit-cobalt)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <path d="M4 8l8 5 8-5M5 6h14a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 20, margin: "0 0 8px" }}>
          Check your email
        </h1>
        <p style={{ color: "var(--merit-mid)", fontSize: 14, margin: 0, lineHeight: 1.55 }}>
          We sent a sign-in link. It expires in 24 hours. If you don't see it within a minute, check your spam folder.
        </p>
      </div>
    </div>
  );
}
