import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { searchMeetings } from "@/lib/meetings";
import { fmtDate, fmtDuration, STATUS_LABEL } from "@/lib/format";
import { UploadForm } from "@/components/upload-form";
import { Chat } from "@/components/chat";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = (await searchParams).q?.trim();
  const meetings = q
    ? await searchMeetings(user.id, q, 50)
    : await prisma.meeting.findMany({
        where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 100,
        select: { id: true, title: true, platform: true, status: true, startedAt: true, durationSec: true },
      });

  return (
    <div className="space-y-6">
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search meetings and transcripts…" className="input" />
        <button className="btn">Search</button>
      </form>
      <UploadForm />
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {q ? `Results for “${q}”` : "Meetings"}
        </h2>
        {meetings.length === 0 ? (
          <p className="muted">No meetings yet. Record one with the Chrome extension, or upload a recording.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link href={`/meetings/${m.id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.title}</span>
                    <span className="muted">{fmtDate(m.startedAt)} · {m.platform}{m.durationSec ? ` · ${fmtDuration(m.durationSec)}` : ""}</span>
                  </span>
                  <span className={`text-xs ${m.status === "FAILED" ? "text-red-600" : m.status === "READY" ? "text-green-600" : "text-amber-600"}`}>
                    {STATUS_LABEL[m.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Ask across all meetings</h2>
        <Chat />
      </section>
    </div>
  );
}
