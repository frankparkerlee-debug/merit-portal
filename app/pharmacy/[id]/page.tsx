// Single pharmacy order — production + shipping detail.
//
// Pharmacy staff need: who the patient is, what compound + dose, where to
// ship, current step in the production pipeline, and the buttons to advance
// it. Medical history is deliberately NOT shown here — pharmacy doesn't need
// PHI to compound and ship, only the prescription itself.

import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PharmacyActionPanel } from "./action-panel";

export const dynamic = "force-dynamic";

const COMPOUND_LABEL: Record<string, string> = {
  TIRZEPATIDE: "LY3298176 (Tirzepatide)",
  RETATRUTIDE: "LY3437943 (Retatrutide)",
  TESAMORELIN: "TH9507 (Tesamorelin)",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending — ready to compound",
  COMPOUNDING: "Compounding",
  PACKED: "Packed — ready to ship",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

export default async function PharmacyDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const order = await prisma.pharmacyOrder.findUnique({
    where: { id },
    include: {
      intake: true,
      actions: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { email: true, role: true } } },
      },
    },
  });
  if (!order) notFound();

  return (
    <div className="shell" style={{ maxWidth: 1040 }}>
      <div style={{ marginBottom: 18 }}>
        <Link href="/pharmacy" style={{ color: "var(--merit-soft)", fontSize: 13, textDecoration: "none" }}>
          ← Back to queue
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
        <main>
          <header style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--merit-cobalt)" }}>
              {order.intake.submissionRef} · {STATUS_LABEL[order.status] ?? order.status}
            </div>
            <h1 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: "6px 0 4px" }}>
              {order.intake.patientFirstName} {order.intake.patientLastName}
            </h1>
            <div style={{ color: "var(--merit-soft)", fontSize: 14 }}>
              {order.intake.patientState} ·{" "}
              <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                {COMPOUND_LABEL[order.intake.compound] ?? order.intake.compound}
              </span>
            </div>
          </header>

          <section className="card" style={{ marginBottom: 18 }}>
            <h2 style={H2}>Prescription</h2>
            <Grid2>
              <Field k="Compound" v={COMPOUND_LABEL[order.intake.compound] ?? order.intake.compound} />
              <Field k="Approved" v={order.createdAt.toISOString().slice(0, 10)} />
              <Field k="Rx expires" v={order.intake.rxExpiresAt ? order.intake.rxExpiresAt.toISOString().slice(0, 10) : "—"} />
              <Field k="Shopify order" v={order.intake.shopifyOrderName ?? "—"} />
            </Grid2>
          </section>

          <section className="card" style={{ marginBottom: 18 }}>
            <h2 style={H2}>Ship to</h2>
            <Grid2>
              <Field k="Patient" v={`${order.intake.patientFirstName} ${order.intake.patientLastName}`} />
              <Field k="State" v={order.intake.patientState} />
              <Field k="Email" v={<a href={`mailto:${order.intake.patientEmail}`}>{order.intake.patientEmail}</a>} />
              <Field k="Phone" v={order.intake.patientPhone} />
            </Grid2>
            <div style={{ marginTop: 10, padding: 10, background: "#F4F1EA", borderRadius: 4, fontSize: 12, color: "var(--merit-soft)", lineHeight: 1.5 }}>
              Full shipping address lives in Shopify order{" "}
              {order.intake.shopifyOrderName ? (
                <strong style={{ fontFamily: "'JetBrains Mono',monospace" }}>{order.intake.shopifyOrderName}</strong>
              ) : (
                "—"
              )}{" "}
              · pull it from there when generating the label.
            </div>
          </section>

          {(order.trackingNumber || order.trackingCarrier) && (
            <section className="card" style={{ marginBottom: 18 }}>
              <h2 style={H2}>Tracking</h2>
              <Grid2>
                <Field k="Carrier" v={order.trackingCarrier ?? "—"} />
                <Field k="Tracking #" v={<span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{order.trackingNumber ?? "—"}</span>} />
                <Field
                  k="URL"
                  v={
                    order.trackingUrl ? (
                      <a href={order.trackingUrl} target="_blank" rel="noreferrer">Open ↗</a>
                    ) : (
                      "—"
                    )
                  }
                />
                <Field k="Shipped at" v={order.shippedAt ? order.shippedAt.toISOString().slice(0, 16).replace("T", " ") : "—"} />
              </Grid2>
            </section>
          )}

          <section className="card">
            <h2 style={H2}>Audit log</h2>
            {order.actions.length === 0 ? (
              <div style={{ color: "var(--merit-soft)", fontSize: 13 }}>No actions yet.</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
                {order.actions.map((a) => (
                  <li key={a.id} style={{ padding: "8px 0", borderTop: "1px dashed #E5E2DC", display: "flex", gap: 12 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--merit-soft)", whiteSpace: "nowrap" }}>
                      {a.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: "var(--merit-cobalt)" }}>
                      {a.action}
                    </span>
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
          <PharmacyActionPanel
            orderId={order.id}
            currentStatus={order.status}
            existingTrackingNumber={order.trackingNumber ?? ""}
            existingTrackingCarrier={order.trackingCarrier ?? ""}
            existingTrackingUrl={order.trackingUrl ?? ""}
            actorEmail={session?.user?.email ?? ""}
          />
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
