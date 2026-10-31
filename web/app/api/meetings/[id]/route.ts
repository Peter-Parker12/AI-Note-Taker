import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { deleteMeetings, getOwnedMeeting } from "@/lib/meetings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const meeting = await getOwnedMeeting((await params).id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  const { audioPath: _a, ...rest } = meeting;
  return Response.json(rest);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const meeting = await getOwnedMeeting(id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  await deleteMeetings(user.id, [id]);
  return Response.json({ ok: true });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const body = z.object({ title: z.string().trim().min(1).max(200) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Title required (max 200 chars)" }, { status: 400 });
  const { count } = await prisma.meeting.updateMany({ where: { id, userId: user.id }, data: { title: body.data.title } });
  return count ? Response.json({ ok: true }) : Response.json({ error: "Not found" }, { status: 404 });
}
