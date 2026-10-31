import type { MeetingSummary } from "@/lib/summarize";

async function accessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Google token refresh failed — sign out and in again to re-grant Drive access");
  return (await res.json()).access_token as string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function toHtml(title: string, date: Date, s: MeetingSummary, transcript: string) {
  const mdToHtml = (md: string) =>
    esc(md).split(/\n{2,}/).map((p) => {
      const lines = p.split("\n");
      return lines.every((l) => /^\s*[-*] /.test(l))
        ? `<ul>${lines.map((l) => `<li>${l.replace(/^\s*[-*] /, "")}</li>`).join("")}</ul>`
        : `<p>${lines.join("<br>")}</p>`;
    }).join("");
  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "<p>None</p>");
  return `<html><body>
<h1>${esc(title)}</h1><p>${date.toISOString().slice(0, 16).replace("T", " ")} UTC</p>
<h2>Summary</h2>${mdToHtml(s.summary)}
<h2>Decisions</h2>${list(s.decisions)}
<h2>Action items</h2>${list(s.actionItems.map((a) => `${a.task}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (due ${a.due})` : ""}`))}
<h2>Transcript</h2><p>${esc(transcript).split("\n").join("<br>")}</p>
</body></html>`;
}

/** Creates a Google Doc (HTML converted on import) and returns its URL. */
export async function exportToGoogleDoc(opts: {
  refreshToken: string; title: string; date: Date; summary: MeetingSummary; transcript: string; folderId?: string;
}) {
  const token = await accessToken(opts.refreshToken);
  const metadata = {
    name: opts.title,
    mimeType: "application/vnd.google-apps.document",
    ...(opts.folderId ? { parents: [opts.folderId] } : {}),
  };
  const boundary = "nt" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${toHtml(opts.title, opts.date, opts.summary, opts.transcript)}\r\n--${boundary}--`;
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed ${res.status}: ${await res.text()}`);
  return (await res.json()).webViewLink as string;
}
