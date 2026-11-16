import { prisma } from "@/lib/prisma";
import { requireRemote, workerContext } from "@/lib/remote-worker";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Begins a transcription on the caller's machine. If one is queued (upload, Re-transcribe) it is claimed;
// if the meeting is idle and has a recording, a new transcription is started directly. Only one caller can win.
export async function POST(req: Request, { params }: Ctx) {
  const off = requireRemote();
  if (off) return off;
  const ctx = await workerContext(req, (await params).id);
  if (ctx.error) return ctx.error;
  const { meeting } = ctx;
  if (!meeting.audioPath) return Response.json({ error: "This meeting has no recording to transcribe." }, { status: 400 });

  const queued = await prisma.job.findFirst({ where: { meetingId: meeting.id, type: "TRANSCRIBE", status: "PENDING" }, orderBy: { createdAt: "asc" } });
  if (queued) {
    const { count } = await prisma.job.updateMany({ where: { id: queued.id, status: "PENDING" }, data: { status: "RUNNING", attempts: { increment: 1 } } });
    if (!count) return Response.json({ error: "Another worker claimed it." }, { status: 409 });
  } else if (meeting.status === "READY" || meeting.status === "FAILED" || (meeting.status === "RECORDING" && meeting.chunkCount === 0)) {
    await prisma.job.create({ data: { type: "TRANSCRIBE", meetingId: meeting.id, status: "RUNNING", attempts: 1 } });
  } else {
    return Response.json({ error: "This meeting is being recorded or processed. Wait for it to finish, or cancel it first." }, { status: 409 });
  }

  await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "TRANSCRIBING", error: null, failedStage: null, progress: 0 } });
  return Response.json({ ok: true });
}
