import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { forbidden, unauthorized } from "@/lib/api-auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getSessionUser();
  if (!admin) return unauthorized();
  if (admin.role !== "ADMIN") return forbidden();
  await prisma.invite.deleteMany({ where: { id: (await params).id } });
  return Response.json({ ok: true });
}
