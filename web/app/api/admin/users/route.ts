import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { forbidden, unauthorized } from "@/lib/api-auth";
import { hashPassword, passwordProblem, USERNAME_RE } from "@/lib/password";

export async function POST(req: Request) {
  const admin = await getSessionUser();
  if (!admin) return unauthorized();
  if (admin.role !== "ADMIN") return forbidden();
  const body = z.object({
    username: z.string().trim().toLowerCase(),
    password: z.string().max(200),
    name: z.string().trim().max(80).optional(),
    role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { username, password, name, role } = body.data;
  if (!USERNAME_RE.test(username)) return Response.json({ error: "Username: 3-32 chars, a-z 0-9 . _ -" }, { status: 400 });
  const problem = passwordProblem(password);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  if (await prisma.user.findUnique({ where: { username } })) return Response.json({ error: "Username already taken" }, { status: 409 });
  const user = await prisma.user.create({
    data: { username, name: name || null, role, passwordHash: await hashPassword(password) },
  });
  return Response.json({ id: user.id }, { status: 201 });
}
