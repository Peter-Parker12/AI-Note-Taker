import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// Re-run the pipeline: re-summarize if a transcript exists, otherwise transcribe again.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const meeting = await getOwnedMeeting(id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  const full = new URL(req.url).searchParams.get("full") === "1";
  const type = meeting.transcriptText && !full ? "SUMMARIZE" : "TRANSCRIBE";
  await prisma.$transaction([
    prisma.meeting.update({ where: { id }, data: { status: "UPLOADED", error: null } }),
    prisma.job.create({ data: { type, meetingId: id } }),
  ]);
  return Response.json({ ok: true, type });
}
