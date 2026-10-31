import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";
import type { MeetingSummary } from "@/lib/summarize";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export function recapMarkdown(m: { title: string; startedAt: Date; summary: unknown; transcriptText: string | null }) {
  const s = m.summary as MeetingSummary | null;
  const out = [`# ${m.title}`, `*${m.startedAt.toISOString().slice(0, 16).replace("T", " ")} UTC*`];
  if (s) {
    out.push("## Summary", s.summary);
    out.push("## Decisions", s.decisions.length ? s.decisions.map((d) => `- ${d}`).join("\n") : "None.");
    out.push("## Action items", s.actionItems.length
      ? s.actionItems.map((a) => `- [ ] ${a.task}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (due ${a.due})` : ""}`).join("\n")
      : "None.");
  }
  if (m.transcriptText) out.push("## Transcript", m.transcriptText);
  return out.join("\n\n") + "\n";
}

// ?format=md (recap + transcript) | txt (transcript only) | json (everything)
export async function GET(req: Request, { params }: Ctx) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const m = await getOwnedMeeting((await params).id, user.id);
  if (!m) return Response.json({ error: "Not found" }, { status: 404 });
  const format = new URL(req.url).searchParams.get("format") ?? "md";
  const base = m.title.replace(/[^\w\- ]+/g, "").trim() || "meeting";
  const file = (ext: string, type: string, body: string) =>
    new Response(body, { headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${base}.${ext}"` } });
  if (format === "json") {
    const { audioPath: _a, ...rest } = m;
    return file("json", "application/json", JSON.stringify(rest, null, 2));
  }
  if (format === "txt") return file("txt", "text/plain", m.transcriptText ?? "");
  return file("md", "text/markdown", recapMarkdown(m));
}
