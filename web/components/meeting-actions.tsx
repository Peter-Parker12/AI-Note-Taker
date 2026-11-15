"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { availableActions } from "@/lib/format";
import { DownloadMenu } from "@/components/download-menu";
import { JobProgress } from "@/components/job-progress";

type Props = {
  id: string; status: string; failedStage: string | null; progress: number | null;
  hasAudio: boolean; hasTranscript: boolean; hasSummary: boolean;
};

export function MeetingActions({ id, status, failedStage, progress, hasAudio, hasTranscript, hasSummary }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const inFlight = ["RECORDING", "UPLOADED", "TRANSCRIBING", "SUMMARIZING"].includes(status);
  const actions = availableActions({ status, failedStage, hasAudio, hasTranscript });

  // Poll while the pipeline is running.
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => router.refresh(), 3000);
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
    <div className="space-y-3">
      <JobProgress status={status} progress={progress} />
      <div className="flex flex-wrap items-center gap-2">
        <DownloadMenu id={id} hasAudio={hasAudio} hasTranscript={hasTranscript} hasSummary={hasSummary} />
        {actions.includes("finalize") && (
          <button className="btn" disabled={!!busy} onClick={() =>
            confirm("Stop this recording and generate the transcript and recap from the audio received so far?\n\nUse this if the recording was interrupted (for example the tab was closed). If the meeting is still being recorded, the extension will stop.")
            && call("finalize", `/api/meetings/${id}/finalize`)}>
            {busy === "finalize" ? "Processing…" : "Stop & process now"}
          </button>
        )}
        {actions.includes("retranscribe") && (
          <button className="btn" disabled={!!busy} onClick={() =>
            confirm("Transcribe the audio again from scratch? The recap is regenerated afterwards.")
            && call("retranscribe", `/api/meetings/${id}/retry?stage=transcribe`)}>
            {busy === "retranscribe" ? "Starting…" : "Re-transcribe"}
          </button>
        )}
        {actions.includes("rerecap") && (
          <button className="btn" disabled={!!busy} onClick={() => call("rerecap", `/api/meetings/${id}/retry?stage=recap`)}>
            {busy === "rerecap" ? "Starting…" : "Re-recap"}
          </button>
        )}
        <button className="btn" disabled={!!busy} onClick={() => confirm("Delete this meeting and its audio?") && call("delete", `/api/meetings/${id}`, "DELETE")}>Delete</button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
