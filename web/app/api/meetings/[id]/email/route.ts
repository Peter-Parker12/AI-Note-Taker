import { z } from "zod";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";
import { sendMail } from "@/lib/mailer";
import { buildRecapEmail } from "@/lib/recap-email";
import type { MeetingSummary } from "@/lib/summarize";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  to: z.array(z.string().trim().email()).min(1, "Add at least one recipient").max(20, "At most 20 recipients"),
  note: z.string().trim().max(2000).optional(),
});

// Emails the meeting's recap from the caller's own SMTP account. Body: { to: ["a@x.com", ...], note? }.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const meeting = await getOwnedMeeting((await params).id, user.id);
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });
  const recap = meeting.summary as unknown as MeetingSummary | null;
  if (!recap) return Response.json({ error: "This meeting has no recap to send yet." }, { status: 400 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid recipients" }, { status: 400 });

  const base = (process.env.AUTH_URL ?? "").replace(/\/+$/, "");
  const mail = buildRecapEmail({
    title: meeting.title, startedAt: meeting.startedAt, durationMin: meeting.durationSec ? Math.round(meeting.durationSec / 60) : null,
    recap, link: base ? `${base}/meetings/${meeting.id}` : null, note: body.data.note,
  });
  try {
    const r = await sendMail(user.id, { to: [...new Set(body.data.to.map((e) => e.toLowerCase()))], ...mail });
    if (!r.accepted.length) return Response.json({ error: "The server accepted none of the recipients.", rejected: r.rejected }, { status: 502 });
    return Response.json({ ok: true, sent: r.accepted, rejected: r.rejected });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not send" }, { status: 502 });
  }
}
