import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { searchMeetings } from "@/lib/meetings";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  platform: z.string().max(40).optional(),
  stereo: z.boolean().optional(),
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
    },
  });
  return Response.json({ id: meeting.id }, { status: 201 });
}

export async function GET(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const select = { id: true, title: true, platform: true, status: true, startedAt: true, durationSec: true };
  if (!q) {
    return Response.json(await prisma.meeting.findMany({
      where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 100, select,
    }));
  }
  return Response.json(await searchMeetings(user.id, q, 50));
}
