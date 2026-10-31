import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";
import { exportToGoogleDoc } from "@/lib/gdocs";
import type { MeetingSummary } from "@/lib/summarize";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const { id } = await params;
  const meeting = await getOwnedMeeting(id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  if (!meeting.summary) return Response.json({ error: "Recap not ready" }, { status: 409 });
  if (!user.googleRefreshToken) {
    return Response.json({ error: "Drive access not granted — sign out and sign in again" }, { status: 409 });
  }
  try {
    const docUrl = await exportToGoogleDoc({
      refreshToken: user.googleRefreshToken,
      title: meeting.title,
      date: meeting.startedAt,
      summary: meeting.summary as unknown as MeetingSummary,
      transcript: meeting.transcriptText ?? "",
      folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || undefined,
    });
    await prisma.meeting.update({ where: { id }, data: { docUrl } });
    return Response.json({ docUrl });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 502 });
  }
}
