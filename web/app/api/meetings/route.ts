import { z } from "zod";
import { MeetingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { searchMeetings } from "@/lib/meetings";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  platform: z.string().max(40).optional(),
  stereo: z.boolean().optional(),
  startedAt: z.iso.datetime({ offset: true }).optional(),
  // true: an empty meeting to fill in through the API (audio, transcript, recap). It is idle (READY) from the
  // start; without it the meeting waits for the extension's audio chunks, as before.
  draft: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const body = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const meeting = await prisma.meeting.create({
    data: {
      userId: user.id,
      title: body.data.title || "Untitled meeting",
      platform: body.data.platform ?? "other",
      stereo: body.data.stereo ?? true,
      ...(body.data.startedAt ? { startedAt: new Date(body.data.startedAt) } : {}),
      ...(body.data.draft ? { status: "READY" as const } : {}),
    },
  });
  return Response.json({ id: meeting.id }, { status: 201 });
}

export async function GET(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 100, 1), 200);
  const select = { id: true, title: true, platform: true, status: true, startedAt: true, durationSec: true };
  if (!q) {
    return Response.json(await prisma.meeting.findMany({
      where: { userId: user.id, ...(status && status in MeetingStatus ? { status: status as keyof typeof MeetingStatus } : {}) },
      orderBy: { startedAt: "desc" }, take: limit, select,
    }));
  }
  const found = await searchMeetings(user.id, q, 50);
  return Response.json(status ? found.filter((m) => m.status === status) : found);
}
