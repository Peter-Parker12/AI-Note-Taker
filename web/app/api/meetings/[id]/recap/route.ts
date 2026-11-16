import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";
import { checkEditable, recapSchema } from "@/lib/meeting-data";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function load(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return { error: unauthorized() };
  const meeting = await getOwnedMeeting((await params).id, user.id);
  return meeting ? { meeting } : { error: Response.json({ error: "Not found" }, { status: 404 }) };
}

export async function GET(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r.error) return r.error;
  if (r.meeting.summary == null) return Response.json({ error: "No recap" }, { status: 404 });
  return Response.json(r.meeting.summary);
}

// Create / replace. Body: { title, summary (markdown), decisions[], actionItems[{task,owner,due}], topics[] }.
// While a worker is writing the recap, this is how it hands it back: the running job is completed.
export async function PUT(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r.error) return r.error;
  const { meeting } = r;
  const body = recapSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid recap", detail: body.error.issues.slice(0, 3) }, { status: 400 });
  const guard = await checkEditable(meeting, "SUMMARIZE");
  if ("error" in guard) return guard.error;

  const title = meeting.title === "Untitled meeting" ? body.data.title : meeting.title;
  await prisma.$transaction([
    prisma.meeting.update({ where: { id: meeting.id }, data: { summary: body.data, title, status: "READY", error: null, failedStage: null, progress: null } }),
    ...(guard.job ? [prisma.job.update({ where: { id: guard.job.id }, data: { status: "DONE", lastError: null } })] : []),
  ]);
  return Response.json({ ok: true, title });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const r = await load(req, ctx);
  if (r.error) return r.error;
  const guard = await checkEditable(r.meeting);
  if ("error" in guard) return guard.error;
  await prisma.meeting.update({
    where: { id: r.meeting.id },
    data: { summary: Prisma.DbNull, status: "READY", error: null, failedStage: null, progress: null },
  });
  return Response.json({ ok: true });
}
