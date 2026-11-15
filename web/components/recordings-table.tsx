"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { availableActions, failedStageOf, type MeetingAction } from "@/lib/format";
import { JobProgress } from "@/components/job-progress";
import { DownloadMenu } from "@/components/download-menu";

export type Row = {
  id: string; title: string; platform: string; status: string; statusLabel: string;
  failedStage: string | null; progress: number | null; hasTranscript: boolean; hasSummary: boolean;
  startedAt: string; durationSec: number | null; sizeBytes: number; hasAudio: boolean;
};

const mb = (b: number) => (b ? (b / 1024 / 1024).toFixed(1) + " MB" : "—");
const dur = (s: number | null) => (s ? `${Math.floor(s / 60)}m` : "—");

const ACTION_LABEL: Record<MeetingAction, string> = { finalize: "stop & process", retranscribe: "re-transcribe", rerecap: "re-recap" };
const ACTION_URL: Record<MeetingAction, (id: string) => string> = {
  finalize: (id) => `/api/meetings/${id}/finalize`,
  retranscribe: (id) => `/api/meetings/${id}/retry?stage=transcribe`,
  rerecap: (id) => `/api/meetings/${id}/retry?stage=recap`,
};

export function RecordingsTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const actionsOf = (r: Row) => availableActions({ status: r.status, failedStage: r.failedStage, hasTranscript: r.hasTranscript, hasAudio: r.hasAudio });
  const inFlight = rows.some((r) => ["UPLOADED", "TRANSCRIBING", "SUMMARIZING"].includes(r.status));

  // Keep progress bars and statuses fresh while anything is processing.
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [inFlight, router]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function bulkDelete() {
    if (!confirm(`Delete ${selected.size} recording(s), including their audio and transcripts? This can't be undone.`)) return;
    setBusy(true); setError("");
    const res = await fetch("/api/meetings/bulk-delete", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selected] }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Delete failed");
    setSelected(new Set()); router.refresh();
  }

  // Queues one action for each id, one at a time (the worker also processes one job at a time).
  async function run(action: MeetingAction, ids: string[]) {
    if (!ids.length) return setError(`Nothing to ${ACTION_LABEL[action]} in the selection.`);
    const warn = action === "retranscribe" ? "This replaces their transcripts and recaps." : action === "rerecap" ? "This replaces their recaps." : "";
    if (!confirm(`${ACTION_LABEL[action][0].toUpperCase() + ACTION_LABEL[action].slice(1)} for ${ids.length} recording(s)? ${warn}`.trim())) return;
    setBusy(true); setError("");
    let failed = 0;
    for (const id of ids) {
      const res = await fetch(ACTION_URL[action](id), { method: "POST" }).catch(() => null);
      if (!res?.ok) failed++;
    }
    setBusy(false);
    if (failed) setError(`${failed} of ${ids.length} could not be queued.`);
    else setSelected(new Set());
    router.refresh();
  }
  const selectedWith = (a: MeetingAction) => rows.filter((r) => selected.has(r.id) && actionsOf(r).includes(a)).map((r) => r.id);

  if (!rows.length) return <p className="muted">No recordings match.</p>;
  return (
    <div className="space-y-2">
      <div className="flex min-h-9 flex-wrap items-center gap-3">
        {selected.size > 0 && (
          <>
            <span className="text-sm">{selected.size} selected</span>
            {selectedWith("retranscribe").length > 0 && (
              <button className="btn" disabled={busy} onClick={() => run("retranscribe", selectedWith("retranscribe"))}>Re-transcribe ({selectedWith("retranscribe").length})</button>
            )}
            {selectedWith("rerecap").length > 0 && (
              <button className="btn" disabled={busy} onClick={() => run("rerecap", selectedWith("rerecap"))}>Re-recap ({selectedWith("rerecap").length})</button>
            )}
            <button className="btn" disabled={busy} onClick={bulkDelete}>{busy ? "Working…" : "Delete selected"}</button>
          </>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="muted border-b border-neutral-200 dark:border-neutral-800">
            <tr>
              <th className="w-8 py-2"><input type="checkbox" aria-label="Select all" checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
              <th>Title</th><th>Date</th><th>Source</th><th>Length</th><th>Size</th><th>Status</th><th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((r) => {
              const failed = r.status === "FAILED";
              return (
                <tr key={r.id}>
                  <td className="py-2"><input type="checkbox" aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td className="max-w-xs truncate pr-3 font-medium"><Link href={`/meetings/${r.id}`} className="hover:underline">{r.title}</Link></td>
                  <td className="whitespace-nowrap pr-3">{new Date(r.startedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="pr-3">{r.platform}</td>
                  <td className="pr-3">{dur(r.durationSec)}</td>
                  <td className="pr-3">{mb(r.sizeBytes)}</td>
                  <td className={`py-2 pr-3 ${failed ? "text-red-600" : r.status === "READY" ? "text-green-600" : "text-amber-600"}`}>
                    {["UPLOADED", "TRANSCRIBING", "SUMMARIZING"].includes(r.status)
                      ? <JobProgress status={r.status} progress={r.progress} compact />
                      : <span title={failed ? (failedStageOf({ status: r.status, failedStage: r.failedStage, hasTranscript: r.hasTranscript }) ?? "") : undefined}>{r.statusLabel}</span>}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <span className="inline-flex items-center gap-3">
                      {actionsOf(r).map((a) => (
                        <button key={a} className="hover:underline disabled:opacity-50" disabled={busy} onClick={() => run(a, [r.id])}>{ACTION_LABEL[a]}</button>
                      ))}
                      <DownloadMenu icon="dots" id={r.id} hasAudio={r.hasAudio} hasTranscript={r.hasTranscript} hasSummary={r.hasSummary} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
