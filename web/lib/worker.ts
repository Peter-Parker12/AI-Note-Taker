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

export function startWorker() {
  if (started) return;
  started = true;
  // Jobs left RUNNING by a crashed/restarted container go back in the queue.
  prisma.job.updateMany({ where: { status: "RUNNING" }, data: { status: "PENDING" } }).catch(() => {});
  const loop = async () => {
    try {
      while (await tick()) { /* drain */ }
    } catch (e) {
      console.error("[worker] tick error", e);
    }
    setTimeout(loop, POLL_MS);
  };
  loop();
  console.log("[worker] started");
}
