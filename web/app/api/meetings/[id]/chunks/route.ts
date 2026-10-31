import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";
import { ensureMeetingDir } from "@/lib/storage";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * Appends one MediaRecorder chunk. Chunks must arrive in order; the client sends
 * X-Chunk-Index. A repeated index (client retry after a lost response) is acknowledged
 * without appending, so retries are idempotent.
 */
export async function POST(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const meeting = await getOwnedMeeting(id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  if (meeting.status !== "RECORDING") return Response.json({ error: "Recording already finalized" }, { status: 409 });

  const index = Number(req.headers.get("x-chunk-index"));
  if (!Number.isInteger(index) || index < 0) return Response.json({ error: "Missing X-Chunk-Index" }, { status: 400 });
  if (index < meeting.chunkCount) return Response.json({ ok: true, duplicate: true, next: meeting.chunkCount });
  if (index > meeting.chunkCount) return Response.json({ error: "Out of order", expected: meeting.chunkCount }, { status: 409 });

  const data = Buffer.from(await req.arrayBuffer());
  if (!data.length) return Response.json({ error: "Empty chunk" }, { status: 400 });
  const dir = await ensureMeetingDir(id);
  const file = path.join(dir, "audio.webm");
  await fs.appendFile(file, data);
  await prisma.meeting.update({ where: { id }, data: { chunkCount: index + 1, audioPath: file } });
  return Response.json({ ok: true, next: index + 1 });
}
