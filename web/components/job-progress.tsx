// Two-step pipeline indicator: 1) Transcribing (real percentage, by audio chunks) -> 2) Recapping.
// Renders nothing when the recording is idle (Ready / Failed / still recording).
export function JobProgress({ status, progress, compact = false }: { status: string; progress: number | null; compact?: boolean }) {
  if (status !== "UPLOADED" && status !== "TRANSCRIBING" && status !== "SUMMARIZING") return null;
  const recapping = status === "SUMMARIZING";
  const queued = status === "UPLOADED";
  const pct = recapping ? 100 : Math.max(0, Math.min(100, progress ?? 0));
  const label = queued ? "Queued" : recapping ? "Recapping…" : `Transcribing ${pct}%`;
  const step = queued ? "" : recapping ? "Step 2 of 2" : "Step 1 of 2";

  return (
    <div className={compact ? "w-40" : "w-full max-w-md space-y-1"} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={recapping || queued ? undefined : pct}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        {!compact && step && <span className="muted">{step}</span>}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
        <div
          className={`h-full rounded bg-blue-600 transition-all duration-500 ${recapping ? "animate-pulse" : ""} ${queued ? "opacity-40" : ""}`}
          style={{ width: queued ? "100%" : `${pct}%` }}
        />
      </div>
    </div>
  );
}
