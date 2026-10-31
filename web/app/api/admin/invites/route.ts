import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { forbidden, unauthorized } from "@/lib/api-auth";

export async function POST(req: Request) {
  const admin = await getSessionUser();
  if (!admin) return unauthorized();
  if (admin.role !== "ADMIN") return forbidden();
  const body = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Valid email required" }, { status: 400 });
  await prisma.invite.upsert({
    where: { email: body.data.email }, create: { email: body.data.email, invitedBy: admin.email }, update: {},
  });
  return Response.json({ ok: true }, { status: 201 });
}
