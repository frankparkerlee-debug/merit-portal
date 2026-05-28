// Physician intake-review queue.
//
// Lists every Intake that needs physician attention, newest first. The list
// is intentionally narrow — patient name, compound, BMI, status, submitted
// at, plus a click-into-detail link. The dense column choices and quick-
// scan workflow are modeled on hospital EMR worklists, not on consumer-style
// card grids — the physician should be able to triage a screenful in under
// a minute.

import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted",
  PAID: "Paid · awaiting review",
  UNDER_REVIEW: "Under review",
  LABS_REQUESTED: "Labs requested",
  LABS_RECEIVED: "Labs received",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SENT_TO_PHARMACY: "Sent to pharmacy",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

const STATUS_TINT: Record<string, { bg: string; fg: string }> = {
  SUBMITTED: { bg: "#F4F1EA", fg: "#6E7585" },
  PAID: { bg: "#E8EEFF", fg: "#2E4DDB" },
  UNDER_REVIEW: { bg: "#FFF5DC", fg: "#8B6B00" },
  LABS_REQUESTED: { bg: "#FFEEDC", fg: "#A45000" },
  LABS_RECEIVED: { bg: "#E8EEFF", fg: "#2E4DDB" },
  APPROVED: { bg: "#E0F4E4", fg: "#2A6B36" },
  REJECTED: { bg: "#FFE6E2", fg: "#8B2A22" },
  SENT_TO_PHARMACY: { bg: "#EFE5FF", fg: "#5C2BA8" },
  SHIPPED: { bg: "#EFE5FF", fg: "#5C2BA8" },
  DELIVERED: { bg: "#E0F4E4", fg: "#2A6B36" },
};

const COMPOUND_LABEL: Record<string, string> = {
  TIRZEPATIDE: "LY3298176",
  RETATRUTIDE: "LY3437943",
  TESAMORELIN: "TH9507",
};

function calcBmi(heightInches: number, weightLbs: number): number {
  return (weightLbs * 703) / (heightInches * heightInches);
}

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

export default async function PhysicianQueue() {
  const session = await auth();

  const intakes = await prisma.intake.findMany({
    where: {
      status: {
        in: ["SUBMITTED", "PAID", "UNDER_REVIEW", "LABS_REQUESTED", "LABS_RECEIVED"],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      submissionRef: true,
      status: true,
      compound: true,
      patientFirstName: true,
      patientLastName: true,
      patientState: true,
      heightInches: true,
      weightLbs: true,
      createdAt: true,
      shopifyOrderName: true,
    },
  });

  const counts = await prisma.intake.groupBy({
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
            Physician portal
          </div>
          <h1 style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
            Intake review queue
          </h1>
        </div>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }}>
          <button type="submit" className="btn btn--ghost" style={{ fontSize: 13 }}>Sign out · {session?.user?.email}</button>
        </form>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Awaiting payment" value={countByStatus.SUBMITTED ?? 0} />
        <StatCard label="Awaiting review" value={countByStatus.PAID ?? 0} highlight />
        <StatCard label="In review" value={(countByStatus.UNDER_REVIEW ?? 0) + (countByStatus.LABS_REQUESTED ?? 0) + (countByStatus.LABS_RECEIVED ?? 0)} />
        <StatCard label="Approved (lifetime)" value={countByStatus.APPROVED ?? 0} />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {intakes.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--merit-soft)", fontSize: 14 }}>
            No intakes in the review pipeline yet. Submissions from{" "}
            <a href="https://meritsciences.com/pages/intake" target="_blank" rel="noreferrer">meritsciences.com/pages/intake</a>{" "}
            will appear here.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "#F4F1EA", textAlign: "left" }}>
                <Th>Patient</Th>
                <Th>Compound</Th>
                <Th>State</Th>
                <Th>BMI</Th>
                <Th>Status</Th>
                <Th>Submitted</Th>
                <Th>Order</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {intakes.map((i) => {
                const bmi = calcBmi(i.heightInches, i.weightLbs);
                const tint = STATUS_TINT[i.status] ?? STATUS_TINT.SUBMITTED;
                return (
                  <tr key={i.id} style={{ borderTop: "1px solid #E5E2DC" }}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>
                        {i.patientFirstName} {i.patientLastName}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--merit-soft)" }}>
                        {i.submissionRef}
                      </div>
                    </Td>
                    <Td>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
                        {COMPOUND_LABEL[i.compound] ?? i.compound}
                      </span>
                    </Td>
                    <Td>{i.patientState}</Td>
                    <Td>{bmi.toFixed(1)}</Td>
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
                        {STATUS_LABEL[i.status] ?? i.status}
                      </span>
                    </Td>
                    <Td style={{ color: "var(--merit-soft)" }}>{timeAgo(i.createdAt)}</Td>
                    <Td style={{ color: "var(--merit-soft)", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                      {i.shopifyOrderName ?? "—"}
                    </Td>
                    <Td>
                      <Link href={`/physician/${i.id}`} className="btn btn--ghost" style={{ fontSize: 12, padding: "5px 12px" }}>
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

function Th({ children }: { children: React.ReactNode }) {
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
