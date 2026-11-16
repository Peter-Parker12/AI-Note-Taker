import { z } from "zod";
import type { Job, Meeting } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transcriptToText } from "@/lib/pipeline";
import { PROCESSING_MODE } from "@/lib/env";

export const segmentSchema = z.object({
  speaker: z.string().min(1),
  start: z.number().min(0),
  end: z.number().min(0),
  text: z.string(),
});

export const recapSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  decisions: z.array(z.string()),
  actionItems: z.array(z.object({ task: z.string(), owner: z.string().nullable(), due: z.string().nullable() })),
  topics: z.array(z.string()),
});

/** A transcript is either timed segments or plain text (pasted notes, an external transcript). */
export const transcriptBodySchema = z.object({
  segments: z.array(segmentSchema).optional(),
  text: z.string().optional(),
  durationSec: z.number().min(0).optional(),
  /** Queue a recap from the new transcript right away. */
  generateRecap: z.boolean().optional(),
}).refine((b) => b.segments?.length || b.text?.trim(), { message: "Provide segments or text" });

export function normalizeTranscript(b: z.infer<typeof transcriptBodySchema>) {
  const segments = (b.segments?.length ? b.segments : [{ speaker: "Speaker", start: 0, end: 0, text: b.text!.trim() }])
    .filter((s) => s.text.trim())
    .sort((a, c) => a.start - c.start);
  // Plain text keeps its own line breaks; timed segments get [mm:ss] Speaker: text lines.
  const text = b.segments?.length ? transcriptToText(segments) : b.text!.trim();
  return { segments, text };
}

export type Stage = "TRANSCRIBE" | "SUMMARIZE";

/**
 * May this meeting's data be edited right now?
 *  - idle meetings (READY / FAILED / a fresh empty one): yes
 *  - being recorded: no
 *  - waiting for or in processing: only by the write that produces what it is waiting for (`completes`):
 *    a transcript for a transcription, a recap for a recap. That write finishes the job, so uploading a
 *    recap to a meeting that is waiting for one is all it takes. (A job still queued can only be taken
 *    over this way when a remote worker handles processing; otherwise the server's own worker owns it.)
 */
export async function checkEditable(meeting: Meeting, completes?: Stage): Promise<{ job: Job | null } | { error: Response }> {
  const busy = (msg: string) => ({ error: Response.json({ error: msg }, { status: 409 }) });
  if (meeting.status === "RECORDING" && (meeting.chunkCount > 0 || meeting.audioPath)) {
    return busy("This recording is still in progress. Stop it first.");
  }
  if (["UPLOADED", "TRANSCRIBING", "SUMMARIZING"].includes(meeting.status)) {
    const statuses = PROCESSING_MODE === "remote" ? ["RUNNING", "PENDING"] : ["RUNNING"];
    const job = completes
      ? await prisma.job.findFirst({ where: { meetingId: meeting.id, type: completes, status: { in: statuses as ("RUNNING" | "PENDING")[] } }, orderBy: [{ status: "desc" }, { createdAt: "desc" }] })
      : null;
    if (!job) return busy("This meeting is being processed. Wait for it to finish, or cancel it first.");
    if (job.cancelRequested) return busy("Cancelled by user");
    return { job };
  }
  return { job: null };
}

/** Shape returned by the read endpoints: metadata plus what exists, without the heavy fields. */
export function meetingMeta(m: Meeting) {
  return {
    id: m.id, title: m.title, platform: m.platform, status: m.status, error: m.error, failedStage: m.failedStage,
    progress: m.progress, startedAt: m.startedAt, durationSec: m.durationSec, stereo: m.stereo,
    hasAudio: !!m.audioPath, hasTranscript: !!m.transcriptText?.trim(), hasRecap: m.summary != null,
    createdAt: m.createdAt, updatedAt: m.updatedAt,
  };
}
