"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Button that calls an API endpoint after a confirm() prompt, then refreshes the page. */
export function ActionButton({ label, url, method = "POST", body, confirmText, className = "btn" }: {
  label: string; url: string; method?: string; body?: unknown; confirmText?: string; className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button className={className} disabled={busy} onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(true); setError("");
        const res = await fetch(url, {
          method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
        });
        setBusy(false);
        if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Failed");
        router.refresh();
      }}>{label}</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}
