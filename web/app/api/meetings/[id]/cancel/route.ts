import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Stops a queued or running transcription/recap. A queued job is failed on the spot; a running one is
// flagged and the worker aborts it within ~2 seconds. Either way the meeting ends as FAILED
// ("Cancelled by user") for the stage that was cancelled, so Re-transcribe / Re-recap are offered.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const meeting = await getOwnedMeeting(id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  if (!["UPLOADED", "TRANSCRIBING", "SUMMARIZING"].includes(meeting.status)) {
    return Response.json({ error: "Nothing is running for this recording." }, { status: 409 });
  }

  const jobs = await prisma.job.findMany({ where: { meetingId: id, status: { in: ["PENDING", "RUNNING"] } } });
  const running = jobs.filter((j) => j.status === "RUNNING");
  const queued = jobs.filter((j) => j.status === "PENDING");

  // Queued jobs never started: fail them now (claim atomically so the worker can't pick one up meanwhile).
  let cancelledQueued = 0;
  for (const j of queued) {
    const { count } = await prisma.job.updateMany({ where: { id: j.id, status: "PENDING" }, data: { status: "FAILED", lastError: "Cancelled by user" } });
    cancelledQueued += count;
  }
  if (running.length) {
    await prisma.job.updateMany({ where: { id: { in: running.map((j) => j.id) } }, data: { cancelRequested: true } });
    return Response.json({ ok: true, cancelling: true }); // the worker finishes the cleanup
  }
  const stage = meeting.status === "SUMMARIZING" || queued.some((j) => j.type === "SUMMARIZE") ? "SUMMARIZE" : "TRANSCRIBE";
  await prisma.meeting.update({ where: { id }, data: { status: "FAILED", failedStage: stage, error: "Cancelled by user", progress: null } });
  return Response.json({ ok: true, cancelledQueued });
}
