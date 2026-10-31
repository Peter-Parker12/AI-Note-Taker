import { createHash, randomBytes } from "crypto";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken() {
  return "nt_" + randomBytes(24).toString("hex");
}

/** Resolves the caller from a Bearer API token (extension) or the session cookie (web). */
export async function getRequestUser(req: Request) {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const tokenHash = hashToken(header.slice(7).trim());
    const token = await prisma.apiToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!token || token.user.disabled) return null;
    // Fire-and-forget; not worth failing a chunk upload over.
    prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return token.user;
  }
  return getSessionUser();
}

export const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export const forbidden = () => Response.json({ error: "Forbidden" }, { status: 403 });
