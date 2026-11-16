import type { MeetingSummary } from "@/lib/summarize";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])_(.+?)_(?=[\s).,;:]|$)/g, "$1<em>$2</em>");

/** The recap summary is simple markdown (paragraphs, bullets, bold, headings); this covers exactly that. */
function markdownToHtml(md: string) {
  const out: string[] = [];
  let list = false;
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) { if (!list) { out.push('<ul style="margin:0 0 12px;padding-left:20px">'); list = true; } out.push(`<li style="margin:2px 0">${inline(bullet[1])}</li>`); continue; }
    if (list) { out.push("</ul>"); list = false; }
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) out.push(`<p style="margin:14px 0 4px;font-weight:600">${inline(h[1])}</p>`);
    else if (line.trim()) out.push(`<p style="margin:0 0 12px">${inline(line)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("\n");
}

type Input = { title: string; startedAt: Date; durationMin: number | null; recap: MeetingSummary; link: string | null; note?: string };

export function buildRecapEmail({ title, startedAt, durationMin, recap, link, note }: Input) {
  const when = startedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const meta = `${when}${durationMin ? ` · ${durationMin} min` : ""}`;
  const h2 = (t: string) => `<h2 style="font-size:15px;margin:22px 0 6px">${t}</h2>`;
  const items = recap.actionItems.map((a) => `<li style="margin:2px 0">${esc(a.task)}${a.owner ? ` — <strong>${esc(a.owner)}</strong>` : ""}${a.due ? ` <span style="color:#666">(${esc(a.due)})</span>` : ""}</li>`).join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;max-width:640px">
${note ? `<p style="margin:0 0 16px;padding:10px 12px;background:#f4f6f8;border-radius:6px">${esc(note).replace(/\n/g, "<br>")}</p>` : ""}
<h1 style="font-size:20px;margin:0 0 2px">${esc(title)}</h1>
<p style="margin:0 0 16px;color:#666">${esc(meta)}</p>
${markdownToHtml(recap.summary)}
${recap.decisions.length ? h2("Decisions") + `<ul style="margin:0;padding-left:20px">${recap.decisions.map((d) => `<li style="margin:2px 0">${esc(d)}</li>`).join("")}</ul>` : ""}
${recap.actionItems.length ? h2("Action items") + `<ul style="margin:0;padding-left:20px">${items}</ul>` : ""}
${link ? `<p style="margin:24px 0 0"><a href="${esc(link)}">Open the full recap and transcript</a></p>` : ""}
</div>`;

  const text = [
    note?.trim(), `${title}\n${meta}`, recap.summary,
    recap.decisions.length ? "Decisions\n" + recap.decisions.map((d) => `- ${d}`).join("\n") : "",
    recap.actionItems.length ? "Action items\n" + recap.actionItems.map((a) => `- ${a.task}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (${a.due})` : ""}`).join("\n") : "",
    link ? `Full recap and transcript: ${link}` : "",
  ].filter(Boolean).join("\n\n");

  return { subject: `Recap: ${title}`, html, text };
}
