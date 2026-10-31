import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { ensureMeetingDir } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Upload an existing recording (in-person meeting, phone memo, exported call).
export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "Missing file" }, { status: 400 });
  const title = String(form.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "") || "Untitled meeting";
  const meeting = await prisma.meeting.create({
    data: { userId: user.id, title, platform: "upload", stereo: false, status: "RECORDING" },
  });
  const dir = await ensureMeetingDir(meeting.id);
  const ext = path.extname(file.name).replace(/[^.\w]/g, "") || ".bin";
  const audioPath = path.join(dir, `audio${ext}`);
  await fs.writeFile(audioPath, Buffer.from(await file.arrayBuffer()));
  await prisma.$transaction([
    prisma.meeting.update({ where: { id: meeting.id }, data: { audioPath, status: "UPLOADED" } }),
    prisma.job.create({ data: { type: "TRANSCRIBE", meetingId: meeting.id } }),
  ]);
  return Response.json({ id: meeting.id }, { status: 201 });
}
