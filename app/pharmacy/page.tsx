// Pharmacy compounding queue.
//
// Shows every PharmacyOrder still in the production/shipping pipeline.
// Status flow: PENDING → COMPOUNDING → PACKED → SHIPPED → DELIVERED.
// The list intentionally excludes DELIVERED orders past the active window
// so pharmacy staff aren't visually overwhelmed by completed work. Click
// into any row for the full intake + actions.

import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending — ready to compound",
  COMPOUNDING: "Compounding",
  PACKED: "Packed — ready to ship",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

const STATUS_TINT: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: "#E8EEFF", fg: "#2E4DDB" },
  COMPOUNDING: { bg: "#FFF5DC", fg: "#8B6B00" },
  PACKED: { bg: "#EFE5FF", fg: "#5C2BA8" },
  SHIPPED: { bg: "#E0F4E4", fg: "#2A6B36" },
  DELIVERED: { bg: "#F4F1EA", fg: "#6E7585" },
};

const COMPOUND_LABEL: Record<string, string> = {
  TIRZEPATIDE: "LY3298176",
  RETATRUTIDE: "LY3437943",
  TESAMORELIN: "TH9507",
};

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default async function PharmacyQueue() {
  const session = await auth();

  const orders = await prisma.pharmacyOrder.findMany({
    where: {
      status: { in: ["PENDING", "COMPOUNDING", "PACKED", "SHIPPED"] },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      intake: {
        select: {
          submissionRef: true,
          compound: true,
          patientFirstName: true,
          patientLastName: true,
          patientState: true,
          shopifyOrderName: true,
          rxExpiresAt: true,
        },
      },
    },
  });

  const counts = await prisma.pharmacyOrder.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const countByStatus: Record<string, number> = {};
  for (const c of counts) countByStatus[c.status] = c._count._all;

  return (
    <div className="shell">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--merit-cobalt)" }}>
            Pharmacy portal
          </div>
          <h1 style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
            Compounding queue
          </h1>
        </div>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }}>
          <button type="submit" className="btn btn--ghost" style={{ fontSize: 13 }}>Sign out · {session?.user?.email}</button>
        </form>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="To compound" value={countByStatus.PENDING ?? 0} highlight />
        <StatCard label="Compounding" value={countByStatus.COMPOUNDING ?? 0} />
        <StatCard label="Ready to ship" value={countByStatus.PACKED ?? 0} />
        <StatCard label="In transit" value={countByStatus.SHIPPED ?? 0} />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {orders.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--merit-soft)", fontSize: 14 }}>
            No pharmacy orders in the active queue. Approved intakes from the physician side will appear here.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "#F4F1EA", textAlign: "left" }}>
                <Th>Patient</Th>
                <Th>Compound</Th>
                <Th>Ship to</Th>
                <Th>Status</Th>
                <Th>Rx expires</Th>
                <Th>Approved</Th>
                <Th>Order</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const tint = STATUS_TINT[o.status] ?? STATUS_TINT.PENDING;
                return (
                  <tr key={o.id} style={{ borderTop: "1px solid #E5E2DC" }}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>
                        {o.intake.patientFirstName} {o.intake.patientLastName}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--merit-soft)" }}>
                        {o.intake.submissionRef}
                      </div>
                    </Td>
                    <Td>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
                        {COMPOUND_LABEL[o.intake.compound] ?? o.intake.compound}
                      </span>
                    </Td>
                    <Td>{o.intake.patientState}</Td>
                    <Td>
                      <span
                        style={{
                          background: tint.bg,
                          color: tint.fg,
                          padding: "3px 8px",
                          borderRadius: 4,
                          fontSize: 11.5,
                          fontWeight: 600,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </Td>
                    <Td style={{ color: "var(--merit-soft)" }}>
                      {o.intake.rxExpiresAt ? o.intake.rxExpiresAt.toISOString().slice(0, 10) : "—"}
                    </Td>
                    <Td style={{ color: "var(--merit-soft)" }}>{timeAgo(o.createdAt)}</Td>
                    <Td style={{ color: "var(--merit-soft)", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                      {o.intake.shopifyOrderName ?? "—"}
                    </Td>
                    <Td>
                      <Link href={`/pharmacy/${o.id}`} className="btn btn--ghost" style={{ fontSize: 12, padding: "5px 12px" }}>
                        Open →
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className="card"
      style={{
        padding: 16,
        background: highlight ? "linear-gradient(180deg,#E8EEFF 0%,#fff 100%)" : undefined,
        borderColor: highlight ? "#C7D1F8" : undefined,
      }}
    >
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--merit-soft)" }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 32, fontWeight: 700, lineHeight: 1, marginTop: 6, letterSpacing: "-0.02em" }}>
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      style={{
        padding: "10px 14px",
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: 10.5,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--merit-soft)",
        fontWeight: 600,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "12px 14px", verticalAlign: "middle", ...style }}>{children}</td>;
}
