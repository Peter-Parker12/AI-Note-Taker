import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { unauthorized } from "@/lib/api-auth";
import { getSmtpConfig, sendMail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

// Sends a short test message with the saved SMTP settings (to the given address, default the From address).
// Session-only, like the settings themselves.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const cfg = await getSmtpConfig(user.id);
  if (!cfg) return Response.json({ error: "Save your SMTP host and From address first." }, { status: 400 });
  const body = z.object({ to: z.string().trim().email().optional() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const to = body.data.to ?? cfg.fromEmail;
  try {
    await sendMail(user.id, {
      to: [to], subject: "Note Taker test email",
      text: "Your SMTP settings work. Recaps can now be emailed from the meeting page.",
      html: "<p>Your SMTP settings work. Recaps can now be emailed from the meeting page.</p>",
    });
    return Response.json({ ok: true, to });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not send" }, { status: 502 });
  }
}
