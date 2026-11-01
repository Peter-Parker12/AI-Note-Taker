import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { unauthorized } from "@/lib/api-auth";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

// Changing the password bumps sessionVersion, which signs out every other browser session.
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = z.object({ current: z.string().max(200), next: z.string().max(200) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  if (!(await verifyPassword(body.data.current, user.passwordHash))) {
    return Response.json({ error: "Current password is incorrect" }, { status: 403 });
  }
  const problem = passwordProblem(body.data.next);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.data.next), sessionVersion: { increment: 1 } },
  });
  return Response.json({ ok: true });
}
