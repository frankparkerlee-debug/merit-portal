"use client";
import { useState } from "react";

export function CopyAddressButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--ghost"
      style={{ fontSize: 12, marginTop: 12, padding: "5px 12px" }}
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied!" : "Copy address"}
    </button>
  );
}
