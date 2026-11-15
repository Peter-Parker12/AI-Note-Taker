import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { audioSize, searchMeetings } from "@/lib/meetings";
import { STATUS_LABEL, statusLabel } from "@/lib/format";
import { RecordingsTable, type Row } from "@/components/recordings-table";
import { UploadForm } from "@/components/upload-form";

export const dynamic = "force-dynamic";

const STATUSES = ["ALL", "READY", "FAILED", "TRANSCRIBING", "SUMMARIZING", "UPLOADED", "RECORDING"] as const;

export default async function Recordings({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  const { q: rawQ, status = "ALL" } = await searchParams;
  const q = rawQ?.trim();

  let where: { userId: string; status?: never; id?: { in: string[] } } & Record<string, unknown> = { userId: user.id };
  if (q) where = { userId: user.id, id: { in: (await searchMeetings(user.id, q, 200)).map((m) => m.id) } };
  if (status !== "ALL" && STATUSES.includes(status as never)) where.status = status as never;

  const meetings = await prisma.meeting.findMany({
    where, orderBy: { startedAt: "desc" }, take: 200,
    select: { id: true, title: true, platform: true, status: true, failedStage: true, progress: true, startedAt: true, durationSec: true, audioPath: true, transcriptText: true, summary: true },
  });
  const rows: Row[] = await Promise.all(meetings.map(async (m) => {
    const hasTranscript = !!m.transcriptText?.trim();
    return {
    id: m.id, title: m.title, platform: m.platform, status: m.status, failedStage: m.failedStage, progress: m.progress,
    statusLabel: statusLabel({ status: m.status, failedStage: m.failedStage, hasTranscript }), hasTranscript, hasSummary: m.summary != null,
    startedAt: m.startedAt.toISOString(), durationSec: m.durationSec, sizeBytes: await audioSize(m.audioPath),
    hasAudio: !!m.audioPath,
  };}));
  const totalBytes = rows.reduce((n, r) => n + r.sizeBytes, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Recordings</h1>
        <p className="muted">{rows.length} shown · {(totalBytes / 1024 / 1024).toFixed(1)} MB of audio</p>
      </div>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search titles and transcripts…" className="input max-w-sm" />
        <select name="status" defaultValue={status} className="input w-auto">
          {STATUSES.map((s) => <option key={s} value={s}>{s === "ALL" ? "All statuses" : STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn">Filter</button>
      </form>
      <UploadForm />
      <RecordingsTable rows={rows} />
    </div>
  );
}
