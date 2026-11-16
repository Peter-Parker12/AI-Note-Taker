import fs from "fs";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";
import { checkEditable } from "@/lib/meeting-data";
import { ensureMeetingDir } from "@/lib/storage";
import { MAX_AUDIO_MB } from "@/lib/env";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const TYPES: Record<string, string> = {
  ".webm": "audio/webm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "video/mp4",
  ".wav": "audio/wav", ".ogg": "audio/ogg", ".opus": "audio/ogg", ".aac": "audio/aac",
};

/** Streams the original recording with HTTP Range support so the <audio> element can seek. */
export async function GET(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const meeting = await getOwnedMeeting((await params).id, user.id);
  if (!meeting?.audioPath) return Response.json({ error: "No audio" }, { status: 404 });
  let size: number;
  try { size = (await fs.promises.stat(meeting.audioPath)).size; } catch { return Response.json({ error: "Audio file missing" }, { status: 404 }); }

  const ext = path.extname(meeting.audioPath).toLowerCase();
  const headers: Record<string, string> = {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  };
  if (new URL(req.url).searchParams.get("dl") === "1") {
    const name = meeting.title.replace(/[^\w\- ]+/g, "").trim() || "recording";
    headers["Content-Disposition"] = `attachment; filename="${name}${ext}"`;
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  let start = 0, end = size - 1, status = 200;
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), size - 1); }
    else { start = Math.max(size - Number(m[2]), 0); } // suffix range: last N bytes
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  const stream = Readable.toWeb(fs.createReadStream(meeting.audioPath, { start, end })) as ReadableStream;
  return new Response(stream, { status, headers });
}

const EXT_BY_TYPE: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([e, t]) => [t, e]));

/** Keep a plausible extension from the filename header or the content type; ffmpeg probes the real format anyway. */
function pickExt(req: Request) {
  const name = req.headers.get("x-filename") ?? "";
  const fromName = path.extname(name).toLowerCase().replace(/[^.\w]/g, "");
  if (fromName && fromName.length <= 8) return fromName;
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  return EXT_BY_TYPE[type] ?? ".bin";
}

// Create / replace the recording. Body: the raw audio bytes (any format ffmpeg reads).
//   X-Filename: meeting.m4a        optional, used for the extension
//   ?stereo=true|false             true if left = my mic and right = everyone else (default: keep the meeting's setting)
//   ?transcribe=0                  only store the file; by default a transcription job is queued
// Refused while the meeting is being recorded or processed (cancel it first).
export async function PUT(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const meeting = await getOwnedMeeting((await params).id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  if (!(meeting.status === "RECORDING" && meeting.chunkCount === 0 && !meeting.audioPath)) {
    const guard = await checkEditable(meeting);
    if ("error" in guard) return guard.error;
  }
  if (!req.body) return Response.json({ error: "Empty body" }, { status: 400 });

  const limit = MAX_AUDIO_MB * 1024 * 1024;
  const declared = Number(req.headers.get("content-length"));
  if (declared > limit) return Response.json({ error: `Recording too large (max ${MAX_AUDIO_MB} MB)` }, { status: 413 });

  const sp = new URL(req.url).searchParams;
  const dir = await ensureMeetingDir(meeting.id);
  const tmp = path.join(dir, "audio.part");
  const dest = path.join(dir, `audio${pickExt(req)}`);
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      bytes > limit ? cb(new Error("too large")) : cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as never), counter, fs.createWriteStream(tmp));
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    return e instanceof Error && e.message === "too large"
      ? Response.json({ error: `Recording too large (max ${MAX_AUDIO_MB} MB)` }, { status: 413 })
      : Response.json({ error: "Upload failed" }, { status: 400 });
  }
  if (!bytes) { await fs.promises.rm(tmp, { force: true }); return Response.json({ error: "Empty body" }, { status: 400 }); }

  await fs.promises.rename(tmp, dest);
  if (meeting.audioPath && meeting.audioPath !== dest) await fs.promises.rm(meeting.audioPath, { force: true });

  const transcribe = sp.get("transcribe") !== "0";
  const stereo = sp.has("stereo") ? sp.get("stereo") === "true" : meeting.stereo;
  await prisma.$transaction([
    prisma.meeting.update({
      where: { id: meeting.id },
      data: { audioPath: dest, chunkCount: 0, stereo, error: null, failedStage: null, status: transcribe ? "UPLOADED" : "READY", progress: transcribe ? 0 : null },
    }),
    ...(transcribe ? [prisma.job.create({ data: { type: "TRANSCRIBE" as const, meetingId: meeting.id } })] : []),
  ]);
  return Response.json({ ok: true, bytes, transcribeQueued: transcribe }, { status: 200 });
}

// Delete the recording file (the transcript and recap are kept).
export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const meeting = await getOwnedMeeting((await params).id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  if (!meeting.audioPath) return Response.json({ error: "No audio" }, { status: 404 });
  const guard = await checkEditable(meeting);
  if ("error" in guard) return guard.error;
  await fs.promises.rm(meeting.audioPath, { force: true });
  await prisma.meeting.update({ where: { id: meeting.id }, data: { audioPath: null, chunkCount: 0, status: "READY", error: null, failedStage: null, progress: null } });
  return Response.json({ ok: true });
}
