import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fmtDate, fmtDuration, failedStageOf, statusLabel } from "@/lib/format";
import type { MeetingSummary } from "@/lib/summarize";
import type { Segment } from "@/lib/stt";
import { MeetingActions } from "@/components/meeting-actions";
import { Chat } from "@/components/chat";
import { RenameTitle } from "@/components/rename-title";
import { getSmtpConfig } from "@/lib/mailer";

export const dynamic = "force-dynamic";

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const m = await prisma.meeting.findFirst({ where: { id: (await params).id, userId: user.id } });
  if (!m) notFound();
  const summary = m.summary as unknown as MeetingSummary | null;
  const smtpReady = !!(await getSmtpConfig(user.id));
  const transcript = (m.transcript as unknown as Segment[] | null) ?? [];
  const hasTranscript = !!m.transcriptText?.trim();
  const stageInput = { status: m.status, failedStage: m.failedStage, hasTranscript };
  const stage = failedStageOf(stageInput);

  return (
    <div className="space-y-6">
      <div>
        <RenameTitle id={m.id} title={m.title} />
        <p className="muted">{fmtDate(m.startedAt)} · {m.platform}{m.durationSec ? ` · ${fmtDuration(m.durationSec)}` : ""} · {statusLabel(stageInput)}</p>
        {m.error && <p className="mt-2 text-sm text-red-600">{m.error}</p>}
      </div>
      {m.audioPath && (
        <section className="card">
          <audio controls preload="none" className="w-full" src={`/api/meetings/${m.id}/audio`} />
        </section>
      )}
      <MeetingActions id={m.id} status={m.status} failedStage={m.failedStage} progress={m.progress}
        hasAudio={!!m.audioPath} hasTranscript={hasTranscript} hasSummary={!!summary} smtpReady={smtpReady} />

      {summary ? (
        <>
          <section className="card [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2">
            <h2 className="mb-2 font-semibold">Summary</h2>
            <ReactMarkdown>{summary.summary}</ReactMarkdown>
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="card">
              <h2 className="mb-2 font-semibold">Decisions</h2>
              {summary.decisions.length ? <ul className="ml-5 list-disc space-y-1 text-sm">{summary.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul> : <p className="muted">None recorded.</p>}
            </section>
            <section className="card">
              <h2 className="mb-2 font-semibold">Action items</h2>
              {summary.actionItems.length ? (
                <ul className="space-y-2 text-sm">
                  {summary.actionItems.map((a, i) => (
                    <li key={i}>☐ {a.task}<span className="muted"> {a.owner ? `— ${a.owner}` : ""}{a.due ? ` (due ${a.due})` : ""}</span></li>
                  ))}
                </ul>
              ) : <p className="muted">None recorded.</p>}
            </section>
          </div>
          <section>
            <h2 className="mb-2 font-semibold">Ask about this meeting</h2>
            <Chat meetingId={m.id} />
          </section>
        </>
      ) : stage === "SUMMARIZE" ? (
        <p className="muted">The transcript is ready but the recap failed. Use Re-recap to try again.</p>
      ) : m.status !== "FAILED" && m.status !== "READY" && <p className="muted">The transcript and recap are being generated. This page refreshes automatically.</p>}

      {transcript.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">Transcript</summary>
          <div className="mt-3 space-y-1 text-sm">
            {transcript.map((s, i) => (
              <p key={i}><span className="muted">{mmss(s.start)}</span> <strong>{s.speaker}:</strong> {s.text}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
