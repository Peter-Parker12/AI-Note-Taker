import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export type SmtpConfig = {
  host: string; port: number; security: "auto" | "ssl" | "starttls";
  user: string | null; pass: string | null; fromEmail: string; fromName: string | null;
};

/** The account's SMTP settings, or null when not (fully) configured. */
export async function getSmtpConfig(userId: string): Promise<SmtpConfig | null> {
  const r = await prisma.userSettings.findUnique({ where: { userId } });
  if (!r?.smtpHost || !r.smtpFromEmail) return null;
  return {
    host: r.smtpHost,
    port: r.smtpPort ?? 587,
    security: (r.smtpSecurity as SmtpConfig["security"]) ?? "auto",
    user: r.smtpUser,
    pass: decrypt(r.smtpPassEnc),
    fromEmail: r.smtpFromEmail,
    fromName: r.smtpFromName,
  };
}

function transport(c: SmtpConfig) {
  const secure = c.security === "ssl" || (c.security === "auto" && c.port === 465);
  return nodemailer.createTransport({
    host: c.host, port: c.port, secure,
    requireTLS: c.security === "starttls",
    auth: c.user ? { user: c.user, pass: c.pass ?? "" } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
  });
}

/** Turns a transport failure into something the user can act on. */
function explain(e: unknown, c: SmtpConfig) {
  const err = e as { code?: string; responseCode?: number; message?: string };
  if (err.code === "EAUTH" || err.responseCode === 535) return "The SMTP server rejected the username or password. For Gmail use an app password.";
  if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") return `Could not connect to ${c.host}:${c.port}. Check the host and port.`;
  if (err.code === "ETIMEDOUT" || err.code === "ESOCKET" || err.code === "ECONNECTION") return `Connection to ${c.host}:${c.port} failed or timed out. Check the port and the security setting (465 = SSL/TLS, 587 = STARTTLS).`;
  return `Could not send: ${err.message ?? "unknown error"}`;
}

export async function sendMail(userId: string, mail: { to: string[]; subject: string; text: string; html: string; replyTo?: string }) {
  const c = await getSmtpConfig(userId);
  if (!c) throw new Error("Email is not set up. Add your SMTP settings in Account → Settings.");
  try {
    const info = await transport(c).sendMail({
      from: c.fromName ? { name: c.fromName, address: c.fromEmail } : c.fromEmail,
      to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, replyTo: mail.replyTo,
    });
    return { accepted: info.accepted as string[], rejected: info.rejected as string[] };
  } catch (e) {
    throw new Error(explain(e, c));
  }
}
