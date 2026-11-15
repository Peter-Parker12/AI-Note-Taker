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

export type FailedStage = "TRANSCRIBE" | "SUMMARIZE";
type StageInput = { status: string; failedStage?: string | null; hasTranscript: boolean };

/** Stage that failed. Rows from before failedStage existed are inferred from whether a transcript exists. */
export function failedStageOf(m: StageInput): FailedStage | null {
  if (m.status !== "FAILED") return null;
  return (m.failedStage as FailedStage | null) ?? (m.hasTranscript ? "SUMMARIZE" : "TRANSCRIBE");
}

export function statusLabel(m: StageInput) {
  const stage = failedStageOf(m);
  if (stage === "TRANSCRIBE") return "Transcription failed";
  if (stage === "SUMMARIZE") return "Recap failed";
  return STATUS_LABEL[m.status] ?? m.status;
}

export type MeetingAction = "finalize" | "retranscribe" | "rerecap";

/** What the user may do right now. Transcribe first, then recap: a recap needs a transcript. */
export function availableActions(m: StageInput & { hasAudio: boolean }): MeetingAction[] {
  if (m.status === "RECORDING") return ["finalize"];
  if (m.status !== "READY" && m.status !== "FAILED") return []; // queued / running: nothing to do
  const out: MeetingAction[] = [];
  if (m.hasAudio) out.push("retranscribe");
  if (m.hasTranscript && failedStageOf(m) !== "TRANSCRIBE") out.push("rerecap");
  return out;
}
