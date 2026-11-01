import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const secret = () => process.env.SETTINGS_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
const key = () => createHash("sha256").update(secret()).digest();

/** AES-256-GCM; output is "iv.tag.ciphertext" (base64 parts). */
export function encrypt(plain: string) {
  if (!secret()) throw new Error("AUTH_SECRET (or SETTINGS_ENCRYPTION_KEY) must be set to store API keys");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}

/** Returns null if the value is missing, malformed, or the secret has changed since it was stored. */
export function decrypt(stored: string | null | undefined) {
  if (!stored) return null;
  try {
    const [iv, tag, ct] = stored.split(".").map((p) => Buffer.from(p, "base64"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
