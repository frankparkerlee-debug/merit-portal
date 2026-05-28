// Pharmacy state-progression panel.
//
// Flow: PENDING → COMPOUNDING → PACKED → SHIPPED → DELIVERED. Each forward
// step is a single click. The SHIPPED step needs a tracking number + carrier;
// the panel toggles into an inline form for that input. DELIVERED is a final
// state and the panel locks out of further actions.

"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  startCompounding,
  markPacked,
  markShipped,
  markDelivered,
} from "@/lib/pharmacy-actions";

export function PharmacyActionPanel({
  orderId,
  currentStatus,
  existingTrackingNumber,
  existingTrackingCarrier,
  existingTrackingUrl,
  actorEmail,
  shopifyOrderAdminUrl,
}: {
  orderId: string;
  currentStatus: string;
  existingTrackingNumber: string;
  existingTrackingCarrier: string;
  existingTrackingUrl: string;
  actorEmail: string;
  shopifyOrderAdminUrl: string | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "ship">("idle");
  const [carrier, setCarrier] = useState(existingTrackingCarrier);
  const [trackingNumber, setTrackingNumber] = useState(existingTrackingNumber);
  const [trackingUrl, setTrackingUrl] = useState(existingTrackingUrl);
  const [err, setErr] = useState<string | null>(null);

  const wrap = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setErr(null);
      try {
        await fn();
        router.refresh();
        setMode("idle");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Action failed");
      }
    });

  if (currentStatus === "DELIVERED") {
    return (
      <div className="card" style={{ background: "#E0F4E4", borderColor: "#A8D7B0" }}>
        <h2 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 15, margin: "0 0 6px" }}>Delivered</h2>
        <p style={{ fontSize: 12.5, color: "#2A6B36", margin: 0 }}>Order complete. No further pharmacy action needed.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 15, margin: "0 0 12px" }}>Next step</h2>

      {mode === "idle" && (
        <div style={{ display: "grid", gap: 8 }}>
          {currentStatus === "PENDING" && (
            <button
              type="button"
              className="btn"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={busy}
              onClick={() => wrap(() => startCompounding(orderId, actorEmail))}
            >
              Start compounding →
            </button>
          )}
          {currentStatus === "COMPOUNDING" && (
            <button
              type="button"
              className="btn"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={busy}
              onClick={() => wrap(() => markPacked(orderId, actorEmail))}
            >
              Mark packed →
            </button>
          )}
          {currentStatus === "PACKED" && (
            <>
              {shopifyOrderAdminUrl && (
                <a
                  href={shopifyOrderAdminUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn"
                  style={{ width: "100%", justifyContent: "center", background: "#2E4DDB", borderColor: "#2E4DDB" }}
                >
                  Buy label in Shopify ↗
                </a>
              )}
              <button
                type="button"
                className="btn btn--ghost"
                style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
                disabled={busy}
                onClick={() => setMode("ship")}
              >
                Or enter tracking manually
              </button>
            </>
          )}
          {currentStatus === "SHIPPED" && (
            <button
              type="button"
              className="btn"
              style={{ width: "100%", justifyContent: "center", background: "#2A6B36", borderColor: "#2A6B36" }}
              disabled={busy}
              onClick={() => wrap(() => markDelivered(orderId, actorEmail))}
            >
              Confirm delivered
            </button>
          )}
        </div>
      )}

      {mode === "ship" && (
        <div>
          <label style={LBL}>Carrier</label>
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            style={INP}
          >
            <option value="">Select…</option>
            <option value="USPS">USPS</option>
            <option value="UPS">UPS</option>
            <option value="FedEx">FedEx</option>
            <option value="DHL">DHL</option>
          </select>
          <label style={LBL}>Tracking number</label>
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="1Z…"
            style={INP}
          />
          <label style={LBL}>Tracking URL (optional)</label>
          <input
            type="url"
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="https://…"
            style={INP}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn--ghost" style={{ flex: 1, justifyContent: "center", fontSize: 13 }} onClick={() => setMode("idle")} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1, justifyContent: "center", fontSize: 13 }}
              disabled={busy || !carrier || trackingNumber.trim().length < 4}
              onClick={() => wrap(() => markShipped(orderId, actorEmail, { carrier, trackingNumber: trackingNumber.trim(), trackingUrl: trackingUrl.trim() || null }))}
            >
              Confirm shipped
            </button>
          </div>
        </div>
      )}

      {err && (
        <div style={{ marginTop: 12, padding: 8, background: "#FFF5F4", color: "#8B2A22", fontSize: 12, borderRadius: 4 }}>
          {err}
        </div>
      )}
    </div>
  );
}

const LBL: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--merit-mid)",
  display: "block",
  marginTop: 10,
  marginBottom: 4,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const INP: React.CSSProperties = {
  width: "100%",
  fontSize: 13.5,
  padding: 8,
  borderRadius: 6,
  border: "1px solid #E5E2DC",
  fontFamily: "inherit",
  boxSizing: "border-box",
};
