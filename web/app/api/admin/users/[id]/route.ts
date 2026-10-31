import fs from "fs/promises";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { forbidden, unauthorized } from "@/lib/api-auth";
import { meetingDir } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

async function adminCount() {
  return prisma.user.count({ where: { role: "ADMIN", disabled: false } });
}

/** Change role or disable/enable. An admin can't lock the instance out: not themselves, not the last admin. */
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await getSessionUser();
  if (!admin) return unauthorized();
  if (admin.role !== "ADMIN") return forbidden();
  const { id } = await params;
  const body = z.object({ role: z.enum(["ADMIN", "MEMBER"]).optional(), disabled: z.boolean().optional() })
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return Response.json({ error: "Not found" }, { status: 404 });

  const losesAdmin = target.role === "ADMIN" && !target.disabled &&
    (body.data.role === "MEMBER" || body.data.disabled === true);
  if (losesAdmin && (id === admin.id || (await adminCount()) <= 1)) {
    return Response.json({ error: "You can't remove the last active admin (or yourself)" }, { status: 409 });
  }
  await prisma.user.update({ where: { id }, data: body.data });
  return Response.json({ ok: true });
}

/** Deletes the user and all their meetings, tokens and audio. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const admin = await getSessionUser();
  if (!admin) return unauthorized();
  if (admin.role !== "ADMIN") return forbidden();
  const { id } = await params;
  if (id === admin.id) return Response.json({ error: "You can't delete yourself" }, { status: 409 });
  const target = await prisma.user.findUnique({ where: { id }, include: { meetings: { select: { id: true } } } });
  if (!target) return Response.json({ error: "Not found" }, { status: 404 });
  if (target.role === "ADMIN" && !target.disabled && (await adminCount()) <= 1) {
    return Response.json({ error: "You can't remove the last active admin" }, { status: 409 });
  }
  await prisma.user.delete({ where: { id } }); // cascades to meetings, jobs, tokens
  await Promise.all(target.meetings.map((m) => fs.rm(meetingDir(m.id), { recursive: true, force: true })));
  return Response.json({ ok: true });
}
