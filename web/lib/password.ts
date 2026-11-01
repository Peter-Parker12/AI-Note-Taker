import bcrypt from "bcryptjs";

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// A real hash to compare against when the username doesn't exist, so a failed login takes
// about the same time either way and doesn't reveal which usernames are valid.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", COST);
export const burnComparison = (plain: string) => bcrypt.compare(plain, DUMMY_HASH);

/** Returns an error message, or null if acceptable. bcrypt ignores everything past 72 bytes. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters";
  if (Buffer.byteLength(pw) > 72) return "Password must be at most 72 bytes";
  return null;
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
