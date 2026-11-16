import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";
import { checkEditable, normalizeTranscript, transcriptBodySchema } from "@/lib/meeting-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return { error: unauthorized() };
  const meeting = await getOwnedMeeting((await params).id, user.id);
  return meeting ? { meeting } : { error: Response.json({ error: "Not found" }, { status: 404 }) };
}

// Read: JSON { segments, text }, or plain text with ?format=text.
export async function GET(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r.error) return r.error;
  const { meeting } = r;
  if (!meeting.transcriptText?.trim()) return Response.json({ error: "No transcript" }, { status: 404 });
  if (new URL(req.url).searchParams.get("format") === "text") {
    return new Response(meeting.transcriptText, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return Response.json({ segments: meeting.transcript, text: meeting.transcriptText });
}

// Create / replace. Body: { segments: [{speaker,start,end,text}] } or { text }, optional durationSec,
// optional generateRecap. While a worker is transcribing, this is how it hands the transcript back:
// the running job is completed and the recap job is queued.
export async function PUT(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r.error) return r.error;
  const { meeting } = r;
  const body = transcriptBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid transcript", detail: body.error.issues.slice(0, 3) }, { status: 400 });
  const guard = await checkEditable(meeting, "TRANSCRIBE");
  if ("error" in guard) return guard.error;

  const { segments, text } = normalizeTranscript(body.data);
  if (!text.trim()) return Response.json({ error: "The transcript is empty." }, { status: 400 });
  const queueRecap = !!guard.job || !!body.data.generateRecap;
  const durationSec = body.data.durationSec ? { durationSec: Math.round(body.data.durationSec) } : {};

  await prisma.$transaction([
    prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        transcript: segments, transcriptText: text, error: null, failedStage: null, progress: null, ...durationSec,
        status: queueRecap ? "SUMMARIZING" : "READY",
      },
    }),
    ...(guard.job ? [prisma.job.update({ where: { id: guard.job.id }, data: { status: "DONE", lastError: null } })] : []),
    ...(queueRecap ? [prisma.job.create({ data: { type: "SUMMARIZE", meetingId: meeting.id } })] : []),
  ]);
  return Response.json({ ok: true, segments: segments.length, recapQueued: queueRecap });
}

// Delete the transcript (the recap, if any, is kept).
export async function DELETE(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r.error) return r.error;
  const guard = await checkEditable(r.meeting);
  if ("error" in guard) return guard.error;
  await prisma.meeting.update({
    where: { id: r.meeting.id },
    data: { transcript: Prisma.DbNull, transcriptText: null, status: "READY", error: null, failedStage: null, progress: null },
  });
  return Response.json({ ok: true });
}
