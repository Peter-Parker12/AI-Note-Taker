import { prisma } from "@/lib/prisma";
import { hashPassword, passwordProblem, USERNAME_RE } from "@/lib/password";

/**
 * Creates the first admin from ADMIN_USERNAME / ADMIN_PASSWORD when the user table is empty.
 * It never overwrites an existing account's password on restart (so a password changed in the UI
 * sticks), unless RESET_ADMIN_PASSWORD=true is set, which is the recovery path for a lost password.
 */
export async function ensureAdmin() {
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const reset = process.env.RESET_ADMIN_PASSWORD === "true";
  const count = await prisma.user.count();

  if (!username || !password) {
    if (count === 0) console.warn("[bootstrap] No users exist. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env to create the first admin.");
    return;
  }
  if (!USERNAME_RE.test(username)) return void console.error("[bootstrap] ADMIN_USERNAME must be 3-32 chars: a-z 0-9 . _ -");
  const problem = passwordProblem(password);
  if (problem) return void console.error(`[bootstrap] ADMIN_PASSWORD rejected: ${problem}`);

  const existing = await prisma.user.findUnique({ where: { username } });
  if (!existing && count === 0) {
    await prisma.user.create({ data: { username, passwordHash: await hashPassword(password), role: "ADMIN", name: username } });
    console.log(`[bootstrap] Created admin "${username}"`);
  } else if (existing && reset) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(password), role: "ADMIN", disabled: false, sessionVersion: { increment: 1 } },
    });
    console.log(`[bootstrap] Reset password for "${username}". Remove RESET_ADMIN_PASSWORD from .env now.`);
  }
}
