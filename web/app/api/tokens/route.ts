import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { generateToken, hashToken } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Token management is session-only: a leaked API token must not be able to mint more tokens.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await prisma.apiToken.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  }));
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "Name required" }, { status: 400 });
  const token = generateToken();
  await prisma.apiToken.create({ data: { userId: user.id, name: body.data.name, tokenHash: hashToken(token) } });
  return Response.json({ token }, { status: 201 }); // shown once
}
