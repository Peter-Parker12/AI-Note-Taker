import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const meeting = await getOwnedMeeting(id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  if (meeting.status !== "RECORDING") return Response.json({ ok: true }); // idempotent
  if (!meeting.audioPath) return Response.json({ error: "No audio received" }, { status: 400 });
  await prisma.$transaction([
    prisma.meeting.update({ where: { id }, data: { status: "UPLOADED" } }),
    prisma.job.create({ data: { type: "TRANSCRIBE", meetingId: id } }),
  ]);
  return Response.json({ ok: true });
}
