import { prisma } from "@/lib/prisma";
import { runSummarize, runTranscribe } from "@/lib/pipeline";

const POLL_MS = 3000;
const MAX_ATTEMPTS = 3;
let started = false;

async function claim() {
  const job = await prisma.job.findFirst({
    where: { status: "PENDING", runAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;
  // Optimistic claim: only one worker wins the PENDING -> RUNNING transition.
  const { count } = await prisma.job.updateMany({
    where: { id: job.id, status: "PENDING" },
    data: { status: "RUNNING", attempts: { increment: 1 } },
  });
  return count ? job : null;
}

async function tick() {
  const job = await claim();
  if (!job) return false;
  try {
    if (job.type === "TRANSCRIBE") await runTranscribe(job.meetingId);
    else await runSummarize(job.meetingId);
    await prisma.job.update({ where: { id: job.id }, data: { status: "DONE", lastError: null } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[worker] ${job.type} ${job.meetingId} failed:`, msg);
    const final = job.attempts + 1 >= MAX_ATTEMPTS;
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: final ? "FAILED" : "PENDING",
        lastError: msg,
        runAt: new Date(Date.now() + 30_000 * (job.attempts + 1)),
      },
    });
    if (final) {
      await prisma.meeting.update({ where: { id: job.meetingId }, data: { status: "FAILED", error: msg } });
    }
  }
  return true;
}

const STALE_MS = 10 * 60_000; // chunks arrive every ~10s, so 10 minutes of silence means the recorder is gone
const SWEEP_EVERY_MS = 60_000;

/**
 * Recordings the extension never finalized (tab closed with the service worker asleep, browser quit,
 * network lost for good). With audio: process what arrived. Without: fail with a clear message.
 */
async function sweepStaleRecordings() {
  const stale = await prisma.meeting.findMany({
    where: { status: "RECORDING", updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    select: { id: true, audioPath: true },
  });
  for (const m of stale) {
    const next = m.audioPath ? ({ status: "UPLOADED" } as const) : ({ status: "FAILED", error: "No audio was received for this recording." } as const);
    // Claim it atomically so a concurrent /finalize call can't enqueue a second job.
    const { count } = await prisma.meeting.updateMany({ where: { id: m.id, status: "RECORDING" }, data: next });
    if (count && m.audioPath) await prisma.job.create({ data: { type: "TRANSCRIBE", meetingId: m.id } });
    if (count) console.log(`[worker] finalized abandoned recording ${m.id} (${m.audioPath ? "processing" : "no audio"})`);
  }
}

export function startWorker() {
  if (started) return;
  started = true;
  // Jobs left RUNNING by a crashed/restarted container go back in the queue.
  prisma.job.updateMany({ where: { status: "RUNNING" }, data: { status: "PENDING" } }).catch(() => {});
  let lastSweep = 0;
  const loop = async () => {
    try {
      if (Date.now() - lastSweep > SWEEP_EVERY_MS) { lastSweep = Date.now(); await sweepStaleRecordings(); }
      while (await tick()) { /* drain */ }
    } catch (e) {
      console.error("[worker] tick error", e);
    }
    setTimeout(loop, POLL_MS);
  };
  loop();
  console.log("[worker] started");
}
