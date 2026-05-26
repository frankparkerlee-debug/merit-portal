import { auth, signOut } from "@/lib/auth";

export default async function PhysicianDashboard() {
  const session = await auth();
  return (
    <div className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--merit-cobalt)" }}>
            Physician portal
          </div>
          <h1 style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
            Intake review queue
          </h1>
        </div>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }}>
          <button type="submit" className="btn btn--ghost" style={{ fontSize: 13 }}>Sign out</button>
        </form>
      </header>

      <div className="card">
        <p style={{ color: "var(--merit-soft)", margin: 0, fontSize: 14 }}>
          Signed in as <strong style={{ color: "var(--merit-ink)" }}>{session?.user?.email}</strong>
        </p>
        <p style={{ color: "var(--merit-soft)", margin: "12px 0 0", fontSize: 14, lineHeight: 1.55 }}>
          The intake queue lands here in Phase 1. For now this is a placeholder confirming auth + role gating work end-to-end.
        </p>
      </div>
    </div>
  );
}
