import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { CLAUDE_MODEL } from "@/lib/env";
import { searchMeetings } from "@/lib/meetings";

export const dynamic = "force-dynamic";

const schema = z.object({
  meetingId: z.string().optional(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(40),
});

const MAX_TRANSCRIPT_CHARS = 60_000;

/**
 * With meetingId: answer from that meeting's recap + full transcript.
 * Without: full-text search the user's archive for the latest question and answer
 * from the top matches (recap + transcript head), citing meeting titles.
 */
export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { meetingId, messages } = body.data;
  if (messages[messages.length - 1].role !== "user") return Response.json({ error: "Last message must be from user" }, { status: 400 });

  let context = "";
  if (meetingId) {
    const m = await prisma.meeting.findFirst({ where: { id: meetingId, userId: user.id } });
    if (!m) return Response.json({ error: "Not found" }, { status: 404 });
    context = renderMeeting(m, MAX_TRANSCRIPT_CHARS);
  } else {
    const hits = await searchMeetings(user.id, messages[messages.length - 1].content, 5);
    const full = await prisma.meeting.findMany({ where: { id: { in: hits.map((h) => h.id) }, userId: user.id } });
    context = full.map((m) => renderMeeting(m, 12_000)).join("\n\n");
    if (!context) context = "(no meetings matched the question)";
  }

  const res = await new Anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system:
      "You answer questions about the user's recorded meetings using only the meeting material provided. " +
      "Transcripts are automatic and may contain errors, in Vietnamese and/or English; answer in the language of the question. " +
      "Cite the meeting title (and timestamp when useful). If the material does not contain the answer, say so.\n\n" +
      `<meetings>\n${context}\n</meetings>`,
    messages,
  });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return Response.json({ answer: text });
}

function renderMeeting(
  m: { title: string; startedAt: Date; summary: unknown; transcriptText: string | null },
  maxChars: number,
) {
  const s = m.summary as { summary?: string; decisions?: string[]; actionItems?: { task: string; owner: string | null; due: string | null }[] } | null;
  return [
    `## ${m.title} (${m.startedAt.toISOString().slice(0, 10)})`,
    s?.summary ? `Summary:\n${s.summary}` : "",
    s?.decisions?.length ? `Decisions:\n- ${s.decisions.join("\n- ")}` : "",
    s?.actionItems?.length ? `Action items:\n${s.actionItems.map((a) => `- ${a.task} (owner: ${a.owner ?? "?"}, due: ${a.due ?? "?"})`).join("\n")}` : "",
    m.transcriptText ? `Transcript:\n${m.transcriptText.slice(0, maxChars)}` : "",
  ].filter(Boolean).join("\n");
}
