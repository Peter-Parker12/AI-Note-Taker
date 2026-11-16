import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRemote, runningJob, workerContext } from "@/lib/remote-worker";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// The worker could not finish (or the user cancelled). Same outcome as a server-side failure: the job
// stops, no retries, and the recording shows the error with the matching Re-transcribe / Re-recap button.
export async function POST(req: Request, { params }: Ctx) {
  const off = requireRemote();
  if (off) return off;
  const ctx = await workerContext(req, (await params).id);
  if (ctx.error) return ctx.error;
  const body = z.object({ message: z.string().min(1).max(2000) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid body" }, { status: 400 });

  const job = (await runningJob(ctx.meeting.id, "TRANSCRIBE")) ?? (await runningJob(ctx.meeting.id, "SUMMARIZE"));
  if (!job) return Response.json({ error: "No running job for this recording." }, { status: 409 });
  await prisma.$transaction([
    prisma.job.update({ where: { id: job.id }, data: { status: "FAILED", lastError: body.data.message } }),
    prisma.meeting.update({ where: { id: ctx.meeting.id }, data: { status: "FAILED", error: body.data.message, failedStage: job.type, progress: null } }),
  ]);
  return Response.json({ ok: true });
}
