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
import { getOrderShippingDetails } from "@/lib/shopify";
import { PharmacyActionPanel } from "./action-panel";
import { CopyAddressButton } from "./copy-address-button";

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

  // Pull the shipping address from Shopify if we have a linked order. Done
  // server-side, on every page load — fresh data, no caching, low volume so
  // the latency hit doesn't matter.
  let shipping: Awaited<ReturnType<typeof getOrderShippingDetails>> = null;
  if (order.intake.shopifyOrderId) {
    try {
      shipping = await getOrderShippingDetails(order.intake.shopifyOrderId);
    } catch (err) {
      console.error("[pharmacy] shopify fetch failed:", err);
    }
  }

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
            {shipping?.shippingAddress ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--merit-soft)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                    Shipping address
                  </div>
                  <address style={{ fontStyle: "normal", fontSize: 14, lineHeight: 1.55 }}>
                    <strong>{shipping.shippingAddress.name ?? `${order.intake.patientFirstName} ${order.intake.patientLastName}`}</strong>
                    {shipping.shippingAddress.company && (
                      <>
                        <br />
                        {shipping.shippingAddress.company}
                      </>
                    )}
                    <br />
                    {shipping.shippingAddress.address1}
                    {shipping.shippingAddress.address2 && (
                      <>
                        <br />
                        {shipping.shippingAddress.address2}
                      </>
                    )}
                    <br />
                    {shipping.shippingAddress.city}, {shipping.shippingAddress.provinceCode ?? shipping.shippingAddress.province} {shipping.shippingAddress.zip}
                    <br />
                    {shipping.shippingAddress.country}
                  </address>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--merit-soft)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                    Contact
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.55 }}>
                    <a href={`mailto:${shipping.email ?? order.intake.patientEmail}`}>{shipping.email ?? order.intake.patientEmail}</a>
                    <br />
                    {shipping.shippingAddress.phone ?? order.intake.patientPhone}
                  </div>
                  <CopyAddressButton
                    text={[
                      shipping.shippingAddress.name,
                      shipping.shippingAddress.company,
                      shipping.shippingAddress.address1,
                      shipping.shippingAddress.address2,
                      `${shipping.shippingAddress.city}, ${shipping.shippingAddress.provinceCode ?? shipping.shippingAddress.province} ${shipping.shippingAddress.zip}`,
                      shipping.shippingAddress.country,
                    ].filter(Boolean).join("\n")}
                  />
                </div>
              </div>
            ) : (
              <div style={{ padding: 12, background: "#FFF5DC", borderRadius: 4, fontSize: 13, color: "#8B6B00", lineHeight: 1.5 }}>
                {order.intake.shopifyOrderId
                  ? "Couldn't load shipping address from Shopify right now. Open the order in Shopify Admin directly to ship."
                  : "No Shopify order linked yet — payment hasn't been received. Shipping address will load here once it does."}
              </div>
            )}
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
