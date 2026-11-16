import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRemote, runningJob, workerContext } from "@/lib/remote-worker";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Heartbeat + progress while transcribing. The response says whether the user pressed Cancel, so the
// worker can stop and call /fail. Posting regularly also keeps the job from being swept as stale.
export async function POST(req: Request, { params }: Ctx) {
  const off = requireRemote();
  if (off) return off;
  const ctx = await workerContext(req, (await params).id);
  if (ctx.error) return ctx.error;
  const body = z.object({ progress: z.number().min(0).max(100).optional() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "Invalid body" }, { status: 400 });

  const job = (await runningJob(ctx.meeting.id, "TRANSCRIBE")) ?? (await runningJob(ctx.meeting.id, "SUMMARIZE"));
  if (!job) return Response.json({ error: "No running job for this recording." }, { status: 409 });
  await prisma.job.update({ where: { id: job.id }, data: {} }); // touches updatedAt
  if (job.type === "TRANSCRIBE" && body.data.progress !== undefined) {
    await prisma.meeting.updateMany({ where: { id: ctx.meeting.id }, data: { progress: Math.min(99, Math.round(body.data.progress)) } });
  }
  return Response.json({ ok: true, cancelRequested: job.cancelRequested });
}
