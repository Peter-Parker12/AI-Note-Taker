import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";

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
