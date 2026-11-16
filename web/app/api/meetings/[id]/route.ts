import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { deleteMeetings, getOwnedMeeting } from "@/lib/meetings";
import { meetingMeta } from "@/lib/meeting-data";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const meeting = await getOwnedMeeting((await params).id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  const { audioPath: _a, ...rest } = meeting;
  // Full record (transcript and recap included) plus flags for what exists.
  return Response.json({ ...rest, ...meetingMeta(meeting) });
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

// Update the meeting's own fields: title, platform, startedAt, stereo. Any subset.
const patchSchema = z.object({
  title: z.string().trim().min(1).max(200),
  platform: z.string().trim().min(1).max(40),
  startedAt: z.iso.datetime({ offset: true }),
  stereo: z.boolean(),
}).partial().refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" });

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid body (title, platform, startedAt, stereo)" }, { status: 400 });
  const { startedAt, ...rest } = body.data;
  const { count } = await prisma.meeting.updateMany({
    where: { id, userId: user.id },
    data: { ...rest, ...(startedAt ? { startedAt: new Date(startedAt) } : {}) },
  });
  return count ? Response.json({ ok: true }) : Response.json({ error: "Not found" }, { status: 404 });
}
