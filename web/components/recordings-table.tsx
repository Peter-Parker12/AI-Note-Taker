"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type Row = {
  id: string; title: string; platform: string; status: string; statusLabel: string;
  startedAt: string; durationSec: number | null; sizeBytes: number; hasAudio: boolean;
};

const mb = (b: number) => (b ? (b / 1024 / 1024).toFixed(1) + " MB" : "—");
const dur = (s: number | null) => (s ? `${Math.floor(s / 60)}m` : "—");

export function RecordingsTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allSelected = rows.length > 0 && selected.size === rows.length;

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

  if (!rows.length) return <p className="muted">No recordings match.</p>;
  return (
    <div className="space-y-2">
      <div className="flex h-9 items-center gap-3">
        {selected.size > 0 && (
          <>
            <span className="text-sm">{selected.size} selected</span>
            <button className="btn" disabled={busy} onClick={bulkDelete}>{busy ? "Deleting…" : "Delete selected"}</button>
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
              <th>Title</th><th>Date</th><th>Source</th><th>Length</th><th>Size</th><th>Status</th><th className="text-right">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2"><input type="checkbox" aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="max-w-xs truncate pr-3 font-medium"><Link href={`/meetings/${r.id}`} className="hover:underline">{r.title}</Link></td>
                <td className="whitespace-nowrap pr-3">{new Date(r.startedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="pr-3">{r.platform}</td>
                <td className="pr-3">{dur(r.durationSec)}</td>
                <td className="pr-3">{mb(r.sizeBytes)}</td>
                <td className={`pr-3 ${r.status === "FAILED" ? "text-red-600" : r.status === "READY" ? "text-green-600" : "text-amber-600"}`}>{r.statusLabel}</td>
                <td className="space-x-2 whitespace-nowrap text-right">
                  {r.hasAudio && <a className="hover:underline" href={`/api/meetings/${r.id}/audio?dl=1`}>audio</a>}
                  <a className="hover:underline" href={`/api/meetings/${r.id}/download?format=md`}>recap</a>
                  <a className="hover:underline" href={`/api/meetings/${r.id}/download?format=txt`}>transcript</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
