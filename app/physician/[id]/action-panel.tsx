// Decision panel for an intake.
//
// Three actions live here: APPROVE (Rx → pharmacy), REQUEST LABS (wait for
// labs), REJECT (refund). Each calls a server action that updates the
// Intake row + writes an IntakeAction audit row. After Phase 1 these will
// also fire Shopify webhooks back into the order (fulfill/refund) and
// patient communications — that wiring lives in lib/intake-actions.ts so
// we can extend without touching the UI.

"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveIntake, requestLabs, rejectIntake, markUnderReview } from "@/lib/intake-actions";

export function ActionPanel({
  intakeId,
  currentStatus,
  actorEmail,
}: {
  intakeId: string;
  currentStatus: string;
  actorEmail: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "labs" | "reject">("idle");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const wrap = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setErr(null);
      try {
        await fn();
        router.refresh();
        setMode("idle");
        setNote("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Action failed");
      }
    });

  if (currentStatus === "APPROVED" || currentStatus === "SENT_TO_PHARMACY" || currentStatus === "SHIPPED" || currentStatus === "DELIVERED") {
    return (
      <div className="card" style={{ background: "#E0F4E4", borderColor: "#A8D7B0" }}>
        <h2 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 15, margin: "0 0 6px" }}>Approved</h2>
        <p style={{ fontSize: 12.5, color: "#2A6B36", margin: 0 }}>Status: {currentStatus}. No further physician action needed.</p>
      </div>
    );
  }

  if (currentStatus === "REJECTED") {
    return (
      <div className="card" style={{ background: "#FFE6E2", borderColor: "#E89A93" }}>
        <h2 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 15, margin: "0 0 6px" }}>Rejected</h2>
        <p style={{ fontSize: 12.5, color: "#8B2A22", margin: 0 }}>Refund triggered via Shopify.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ fontFamily: "'Inter Tight',sans-serif", fontSize: 15, margin: "0 0 12px" }}>Decision</h2>

      {mode === "idle" && (
        <div style={{ display: "grid", gap: 8 }}>
          {currentStatus === "PAID" && (
            <button
              type="button"
              className="btn btn--ghost"
              style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
              disabled={busy}
              onClick={() => wrap(() => markUnderReview(intakeId, actorEmail))}
            >
              Mark under review
            </button>
          )}
          <button
            type="button"
            className="btn"
            style={{ width: "100%", justifyContent: "center", background: "#2A6B36", borderColor: "#2A6B36" }}
            disabled={busy}
            onClick={() => wrap(() => approveIntake(intakeId, actorEmail))}
          >
            Approve →
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
            disabled={busy}
            onClick={() => setMode("labs")}
          >
            Request labs
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ width: "100%", justifyContent: "center", fontSize: 13, color: "#8B2A22" }}
            disabled={busy}
            onClick={() => setMode("reject")}
          >
            Reject (refund)
          </button>
        </div>
      )}

      {mode === "labs" && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--merit-mid)", display: "block", marginBottom: 6 }}>
            What labs do you need? (sent to patient)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            style={{ width: "100%", fontSize: 13.5, padding: 8, borderRadius: 6, border: "1px solid #E5E2DC", fontFamily: "inherit" }}
            placeholder="e.g. CBC, CMP, HbA1c within last 90 days"
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn--ghost" style={{ flex: 1, justifyContent: "center", fontSize: 13 }} onClick={() => { setMode("idle"); setNote(""); }} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1, justifyContent: "center", fontSize: 13 }}
              disabled={busy || note.trim().length < 4}
              onClick={() => wrap(() => requestLabs(intakeId, actorEmail, note))}
            >
              Send request
            </button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--merit-mid)", display: "block", marginBottom: 6 }}>
            Reason (sent to patient; triggers Shopify refund)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            style={{ width: "100%", fontSize: 13.5, padding: 8, borderRadius: 6, border: "1px solid #E5E2DC", fontFamily: "inherit" }}
            placeholder="e.g. History of pancreatitis disqualifies from GLP-1 therapy"
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn--ghost" style={{ flex: 1, justifyContent: "center", fontSize: 13 }} onClick={() => { setMode("idle"); setNote(""); }} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1, justifyContent: "center", fontSize: 13, background: "#8B2A22", borderColor: "#8B2A22" }}
              disabled={busy || note.trim().length < 4}
              onClick={() => wrap(() => rejectIntake(intakeId, actorEmail, note))}
            >
              Reject + refund
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
