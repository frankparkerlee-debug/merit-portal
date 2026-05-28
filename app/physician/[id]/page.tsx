// Single-intake review page.
//
// Layout intent: every fact a physician needs to make a yes/no/labs decision
// is on one screen, no tabs. Health screen flags are visually loud when YES
// (potential disqualifier) and muted when NO. The action panel lives in a
// sticky right column so the decision buttons stay reachable as the
// physician scrolls through medical history.

import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PRESCRIBING_PHYSICIAN } from "@/lib/clinic";
import { ActionPanel } from "./action-panel";

export const dynamic = "force-dynamic";

const COMPOUND_LABEL: Record<string, string> = {
  TIRZEPATIDE: "LY3298176 (Tirzepatide)",
  RETATRUTIDE: "LY3437943 (Retatrutide)",
  TESAMORELIN: "TH9507 (Tesamorelin)",
};

function calcBmi(heightInches: number, weightLbs: number): number {
  return (weightLbs * 703) / (heightInches * heightInches);
}

function calcAge(dob: Date): number {
  const ms = Date.now() - dob.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
}

function formatHeight(inches: number): string {
  const ft = Math.floor(inches / 12);
  const ins = inches % 12;
  return `${ft}'${ins}"`;
}

export default async function IntakeDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const intake = await prisma.intake.findUnique({
    where: { id },
    include: {
      actions: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { email: true, role: true } } },
      },
    },
  });
  if (!intake) notFound();

  const bmi = calcBmi(intake.heightInches, intake.weightLbs);
  const age = calcAge(intake.patientDob);

  // Identify any disqualifying or attention-worthy screen answers
  const flags: Array<{ label: string; severity: "danger" | "warn" }> = [];
  if (intake.screenPregnant) flags.push({ label: "Pregnant / breastfeeding / trying to conceive", severity: "danger" });
  if (intake.screenMtcMen2) flags.push({ label: "Personal/family history of MTC or MEN2", severity: "danger" });
  if (intake.screenPancreatitis) flags.push({ label: "History of pancreatitis", severity: "danger" });
  if (intake.screenIncretinAllergy) flags.push({ label: "Prior allergic reaction to incretin", severity: "danger" });
  if (intake.screenCurrentIncretin) flags.push({ label: "Currently taking another incretin", severity: "warn" });
  if (intake.screenEatingDisorder) flags.push({ label: "Active or recent (<12mo) eating disorder", severity: "warn" });
  if (intake.screenDiabetesMeds) flags.push({ label: "Taking insulin or sulfonylurea", severity: "warn" });
  if (intake.hasAllergies) flags.push({ label: `Drug allergies: ${intake.allergiesDetails ?? "(see notes)"}`, severity: "warn" });

  return (
    <div className="shell" style={{ maxWidth: 1120 }}>
      <div style={{ marginBottom: 18 }}>
        <Link href="/physician" style={{ color: "var(--merit-soft)", fontSize: 13, textDecoration: "none" }}>
          ← Back to queue
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
        <main>
          <header style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--merit-cobalt)" }}>
              {intake.submissionRef} · {intake.status}
            </div>
            <h1 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: "6px 0 4px" }}>
              {intake.patientFirstName} {intake.patientLastName}
            </h1>
            <div style={{ color: "var(--merit-soft)", fontSize: 14 }}>
              {age}y · {intake.patientState} · Requesting{" "}
              <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{COMPOUND_LABEL[intake.compound] ?? intake.compound}</span>
            </div>
            <div style={{ marginTop: 14, padding: "10px 14px", background: "#F4F1EA", borderLeft: "3px solid var(--merit-cobalt)", borderRadius: 4, fontSize: 13, color: "var(--merit-mid)" }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--merit-cobalt)", fontWeight: 600, marginRight: 10 }}>
                Prescribing physician
              </span>
              <strong style={{ color: "var(--merit-ink)" }}>{PRESCRIBING_PHYSICIAN.name}</strong>
            </div>
          </header>

          {flags.length > 0 && (
            <section className="card" style={{ marginBottom: 18, borderColor: flags.some((f) => f.severity === "danger") ? "#E89A93" : "#E8C97A" }}>
              <h2 style={H2}>Screen flags ({flags.length})</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {flags.map((f, idx) => (
                  <li key={idx} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: idx === 0 ? undefined : "1px dashed #E5E2DC" }}>
                    <span style={{ color: f.severity === "danger" ? "#8B2A22" : "#A45000", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", marginTop: 2 }}>
                      {f.severity === "danger" ? "DISQ" : "WARN"}
                    </span>
                    <span style={{ fontSize: 14 }}>{f.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card" style={{ marginBottom: 18 }}>
            <h2 style={H2}>Patient</h2>
            <Grid2>
              <Field k="Email" v={<a href={`mailto:${intake.patientEmail}`}>{intake.patientEmail}</a>} />
              <Field k="Phone" v={intake.patientPhone} />
              <Field k="DOB" v={`${intake.patientDob.toISOString().slice(0, 10)} (${age}y)`} />
              <Field k="State" v={intake.patientState} />
              <Field k="Height" v={formatHeight(intake.heightInches)} />
              <Field k="Weight" v={`${intake.weightLbs} lbs`} />
              <Field k="BMI" v={<strong>{bmi.toFixed(1)}</strong>} />
              <Field k="Routing" v={`Path ${intake.routingPath}${intake.routingReason ? ` (${intake.routingReason})` : ""}`} />
            </Grid2>
          </section>

          <section className="card" style={{ marginBottom: 18 }}>
            <h2 style={H2}>Health screen</h2>
            <ScreenRow label="Pregnant / breastfeeding / TTC" yes={intake.screenPregnant} />
            <ScreenRow label="MTC or MEN2 history" yes={intake.screenMtcMen2} />
            <ScreenRow label="Pancreatitis history" yes={intake.screenPancreatitis} />
            <ScreenRow label="Currently on incretin" yes={intake.screenCurrentIncretin} />
            <ScreenRow label="Prior incretin allergy" yes={intake.screenIncretinAllergy} />
            <ScreenRow label="Eating disorder (active or <12mo)" yes={intake.screenEatingDisorder} />
            <ScreenRow label="Insulin or sulfonylurea use" yes={intake.screenDiabetesMeds} />
            <ScreenRow label="Drug allergies" yes={intake.hasAllergies} detail={intake.allergiesDetails ?? undefined} />
          </section>

          {intake.additionalNotes && (
            <section className="card" style={{ marginBottom: 18 }}>
              <h2 style={H2}>Patient notes</h2>
              <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 14, lineHeight: 1.6 }}>{intake.additionalNotes}</p>
            </section>
          )}

          {intake.idPhotoKey && (
            <section className="card" style={{ marginBottom: 18 }}>
              <h2 style={H2}>Photo ID</h2>
              <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/intake/${intake.id}/photo`}
                  alt="Patient ID"
                  style={{ maxWidth: "100%", maxHeight: 420, borderRadius: 6, border: "1px solid #E5E2DC" }}
                />
              </div>
            </section>
          )}

          <section className="card">
            <h2 style={H2}>Audit log</h2>
            {intake.actions.length === 0 ? (
              <div style={{ color: "var(--merit-soft)", fontSize: 13 }}>No actions yet.</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
                {intake.actions.map((a) => (
                  <li key={a.id} style={{ padding: "8px 0", borderTop: "1px dashed #E5E2DC", display: "flex", gap: 12 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--merit-soft)", whiteSpace: "nowrap" }}>
                      {a.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: "var(--merit-cobalt)" }}>
                      {a.action}
                    </span>
                    {a.fromStatus && a.toStatus && (
                      <span style={{ color: "var(--merit-soft)" }}>
                        {a.fromStatus} → {a.toStatus}
                      </span>
                    )}
                    <span style={{ color: "var(--merit-soft)", marginLeft: "auto" }}>
                      {a.actor?.email ?? "system"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <aside style={{ position: "sticky", top: 20 }}>
          <ActionPanel
            intakeId={intake.id}
            currentStatus={intake.status}
            actorEmail={session?.user?.email ?? ""}
          />
          <div className="card" style={{ marginTop: 14, fontSize: 12.5, color: "var(--merit-soft)" }}>
            <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--merit-ink)" }}>Reference</div>
            Shopify order:{" "}
            {intake.shopifyOrderName ? (
              <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{intake.shopifyOrderName}</span>
            ) : (
              <span style={{ color: "var(--merit-soft)" }}>— (not yet paid)</span>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

const H2: React.CSSProperties = {
  fontFamily: "'Inter Tight',sans-serif",
  fontSize: 16,
  fontWeight: 700,
  margin: "0 0 14px",
  letterSpacing: "-0.01em",
};

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 28px", fontSize: 14 }}>
      {children}
    </div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dotted #E5E2DC", paddingBottom: 6 }}>
      <span style={{ color: "var(--merit-soft)" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function ScreenRow({ label, yes, detail }: { label: string; yes: boolean; detail?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px dashed #E5E2DC", fontSize: 14 }}>
      <span style={{ color: yes ? "#8B2A22" : "var(--merit-ink)", fontWeight: yes ? 600 : 400 }}>
        {label}
        {detail && <span style={{ marginLeft: 10, fontSize: 13, color: "var(--merit-soft)", fontWeight: 400 }}>· {detail}</span>}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          padding: "3px 8px",
          borderRadius: 3,
          background: yes ? "#FFE6E2" : "#F4F1EA",
          color: yes ? "#8B2A22" : "#6E7585",
        }}
      >
        {yes ? "YES" : "NO"}
      </span>
    </div>
  );
}
