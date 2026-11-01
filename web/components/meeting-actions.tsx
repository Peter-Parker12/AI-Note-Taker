"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function MeetingActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const inFlight = ["RECORDING", "UPLOADED", "TRANSCRIBING", "SUMMARIZING"].includes(status);

  // Poll while the pipeline is running.
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [inFlight, router]);

  async function call(label: string, url: string, method = "POST") {
    setBusy(label); setError("");
    const res = await fetch(url, { method });
    const json = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) return setError(json.error ?? "Request failed");
    if (label === "delete") return router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "FAILED" || status === "READY") && (
        <button className="btn" disabled={!!busy} onClick={() => call("retry", `/api/meetings/${id}/retry`)}>Regenerate recap</button>
      )}
      <button className="btn" disabled={!!busy} onClick={() => confirm("Delete this meeting and its audio?") && call("delete", `/api/meetings/${id}`, "DELETE")}>Delete</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
