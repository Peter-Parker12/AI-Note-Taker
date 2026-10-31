import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { meetingDir } from "@/lib/storage";
import { CHUNK_SECONDS, probeDuration, splitChannel } from "@/lib/audio";
import { getStt, type Segment } from "@/lib/stt";
import { summarizeTranscript } from "@/lib/summarize";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function transcriptToText(segments: Segment[]) {
  return segments.map((s) => `[${fmtTime(s.start)}] ${s.speaker}: ${s.text}`).join("\n");
}

async function transcribeChannel(file: string, outDir: string, label: string, channel: 0 | 1 | undefined, speaker: string) {
  const stt = getStt();
  const chunks = await splitChannel(file, outDir, label, channel);
  const out: Segment[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const segs = await stt.transcribe(chunks[i]);
    for (const s of segs) {
      if (!s.text) continue;
      out.push({
        start: s.start + i * CHUNK_SECONDS,
        end: s.end + i * CHUNK_SECONDS,
        text: s.text,
        speaker: s.speaker !== undefined ? `${speaker} ${Number(s.speaker) + 1}` : speaker,
      });
    }
  }
  return out;
}

export async function runTranscribe(meetingId: string) {
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  if (!meeting.audioPath) throw new Error("Meeting has no audio");
  await prisma.meeting.update({ where: { id: meetingId }, data: { status: "TRANSCRIBING", error: null } });

  const dir = meetingDir(meetingId);
  const work = path.join(dir, "work");
  await fs.rm(work, { recursive: true, force: true });
  await fs.mkdir(work, { recursive: true });

  const durationSec = await probeDuration(meeting.audioPath);
  let segments: Segment[];
  if (meeting.stereo) {
    // L = my mic, R = everyone else. Separate channels give speaker attribution for free.
    const me = await transcribeChannel(meeting.audioPath, work, "me", 0, "Me");
    const others = await transcribeChannel(meeting.audioPath, work, "others", 1, "Others");
    segments = [...me, ...others];
  } else {
    segments = await transcribeChannel(meeting.audioPath, work, "mix", undefined, "Speaker");
  }
  segments.sort((a, b) => a.start - b.start);
  await fs.rm(work, { recursive: true, force: true });

  await prisma.meeting.update({
    where: { id: meetingId },
    data: { transcript: segments, transcriptText: transcriptToText(segments), durationSec },
  });
  await prisma.job.create({ data: { type: "SUMMARIZE", meetingId } });
}

export async function runSummarize(meetingId: string) {
  const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
  if (!meeting.transcriptText?.trim()) throw new Error("Empty transcript");
  await prisma.meeting.update({ where: { id: meetingId }, data: { status: "SUMMARIZING" } });
  const summary = await summarizeTranscript({
    title: meeting.title,
    startedAt: meeting.startedAt,
    transcript: meeting.transcriptText,
  });
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { summary, title: meeting.title === "Untitled meeting" ? summary.title : meeting.title, status: "READY" },
  });
}
