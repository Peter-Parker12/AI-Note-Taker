import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { meetingDir } from "@/lib/storage";
import { CHUNK_SECONDS, probeDuration, splitChannel } from "@/lib/audio";
import { getStt, type Segment } from "@/lib/stt";
import { getUserSettings, type ResolvedSettings } from "@/lib/settings";
import { summarizeTranscript } from "@/lib/summarize";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function transcriptToText(segments: Segment[]) {
  return segments.map((s) => `[${fmtTime(s.start)}] ${s.speaker}: ${s.text}`).join("\n");
}

type ChannelPlan = { label: string; channel: 0 | 1 | undefined; speaker: string };

async function transcribeChunks(
  cfg: ResolvedSettings, chunks: string[], speaker: string, onChunkDone: () => Promise<void>,
) {
  const stt = getStt(cfg.sttProvider);
  const apiKey = cfg.sttProvider === "deepgram" ? cfg.deepgramKey : cfg.openaiKey;
  const out: Segment[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const segs = await stt.transcribe(chunks[i], { apiKey, language: cfg.sttLanguage });
    for (const s of segs) {
      if (!s.text) continue;
      out.push({
        start: s.start + i * CHUNK_SECONDS,
        end: s.end + i * CHUNK_SECONDS,
        text: s.text,
        speaker: s.speaker !== undefined ? `${speaker} ${Number(s.speaker) + 1}` : speaker,
      });
    }
    await onChunkDone();
  }
  return out;
}

export async function runTranscribe(meetingId: string) {
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  if (!meeting.audioPath) throw new Error("Meeting has no audio");
  const cfg = await getUserSettings(meeting.userId);
  await prisma.meeting.update({ where: { id: meetingId }, data: { status: "TRANSCRIBING", error: null, failedStage: null, progress: 0 } });

  const dir = meetingDir(meetingId);
  const work = path.join(dir, "work");
  await fs.rm(work, { recursive: true, force: true });
  await fs.mkdir(work, { recursive: true });

  try {
    const durationSec = await probeDuration(meeting.audioPath);
    // L = my mic, R = everyone else. Separate channels give speaker attribution for free.
    const plan: ChannelPlan[] = meeting.stereo
      ? [{ label: "me", channel: 0, speaker: "Me" }, { label: "others", channel: 1, speaker: "Others" }]
      : [{ label: "mix", channel: undefined, speaker: "Speaker" }];

    // Split everything first so the progress bar knows the total number of chunks.
    const split = [];
    for (const p of plan) split.push({ ...p, chunks: await splitChannel(meeting.audioPath, work, p.label, p.channel) });
    const total = split.reduce((n, p) => n + p.chunks.length, 0) || 1;
    let done = 0;
    const onChunkDone = async () => {
      done++;
      await prisma.meeting.updateMany({ where: { id: meetingId }, data: { progress: Math.min(99, Math.round((done / total) * 100)) } });
    };

    const segments: Segment[] = [];
    for (const p of split) segments.push(...(await transcribeChunks(cfg, p.chunks, p.speaker, onChunkDone)));
    segments.sort((a, b) => a.start - b.start);

    await prisma.meeting.update({
      where: { id: meetingId },
      data: { transcript: segments, transcriptText: transcriptToText(segments), durationSec, progress: 100 },
    });
    await prisma.job.create({ data: { type: "SUMMARIZE", meetingId } });
  } finally {
    await fs.rm(work, { recursive: true, force: true }); // also on failure
  }
}

export async function runSummarize(meetingId: string) {
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  if (!meeting.transcriptText?.trim()) throw new Error("Empty transcript");
  await prisma.meeting.update({ where: { id: meetingId }, data: { status: "SUMMARIZING", error: null, failedStage: null, progress: null } });
  const cfg = await getUserSettings(meeting.userId);
  const summary = await summarizeTranscript(
    { title: meeting.title, startedAt: meeting.startedAt, transcript: meeting.transcriptText },
    cfg,
  );
  const title = meeting.title === "Untitled meeting" ? summary.title : meeting.title;
  await prisma.meeting.update({ where: { id: meetingId }, data: { summary, title, status: "READY", error: null, failedStage: null, progress: null } });
}
