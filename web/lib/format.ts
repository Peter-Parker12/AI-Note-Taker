export function fmtDuration(sec: number | null | undefined) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function fmtDate(d: Date) {
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export const STATUS_LABEL: Record<string, string> = {
  RECORDING: "Recording", UPLOADED: "Queued", TRANSCRIBING: "Transcribing",
  SUMMARIZING: "Summarizing", READY: "Ready", FAILED: "Failed",
};
