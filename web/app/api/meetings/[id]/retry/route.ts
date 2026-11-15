import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Re-run one stage of the pipeline.
//   ?stage=transcribe  (or the older ?full=1)  transcribe the audio again, then recap automatically
//   ?stage=recap                                regenerate only the recap from the existing transcript
// With no parameter: recap if a transcript exists, otherwise transcribe.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const meeting = await getOwnedMeeting(id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  if (meeting.status !== "READY" && meeting.status !== "FAILED") {
    return Response.json({ error: "This recording is still being processed." }, { status: 409 });
  }

  const sp = new URL(req.url).searchParams;
  const stage = sp.get("stage") ?? (sp.get("full") === "1" ? "transcribe" : meeting.transcriptText ? "recap" : "transcribe");
  if (stage !== "transcribe" && stage !== "recap") return Response.json({ error: "Unknown stage" }, { status: 400 });

  if (stage === "recap") {
    if (!meeting.transcriptText?.trim()) return Response.json({ error: "There is no transcript to summarize yet. Transcribe first." }, { status: 400 });
    await prisma.$transaction([
      prisma.meeting.update({ where: { id }, data: { status: "SUMMARIZING", error: null, failedStage: null, progress: null } }),
      prisma.job.create({ data: { type: "SUMMARIZE", meetingId: id } }),
    ]);
    return Response.json({ ok: true, type: "SUMMARIZE" });
  }

  if (!meeting.audioPath) return Response.json({ error: "This recording has no audio to transcribe." }, { status: 400 });
  await prisma.$transaction([
    prisma.meeting.update({ where: { id }, data: { status: "UPLOADED", error: null, failedStage: null, progress: 0 } }),
    prisma.job.create({ data: { type: "TRANSCRIBE", meetingId: id } }),
  ]);
  return Response.json({ ok: true, type: "TRANSCRIBE" });
}
