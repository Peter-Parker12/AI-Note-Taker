import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";
import { runSummarize, runTranscribe } from "@/lib/pipeline";
import { DATA_DIR, PROCESSING_MODE, REMOTE_STALE_MIN } from "@/lib/env";

const POLL_MS = 3000;
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

// A failed job stops for good: no automatic retries. The meeting shows the error, and the user
// fixes the cause (key, credits, model, Whisper down) and clicks Re-transcribe / Regenerate.
async function failJob(job: { id: string; type: string; meetingId: string }, msg: string) {
  await prisma.job.update({ where: { id: job.id }, data: { status: "FAILED", lastError: msg } });
  // updateMany: the meeting may have been deleted while the job ran.
  await prisma.meeting.updateMany({ where: { id: job.meetingId }, data: { status: "FAILED", error: msg, failedStage: job.type, progress: null } });
}

async function tick() {
  const job = await claim();
  if (!job) return false;
  // The Cancel button sets job.cancelRequested; poll it and abort whatever the job is waiting on.
  const ac = new AbortController();
  const watcher = setInterval(async () => {
    const j = await prisma.job.findUnique({ where: { id: job.id }, select: { cancelRequested: true } }).catch(() => null);
    if (j?.cancelRequested) ac.abort();
  }, 1500);
  try {
    if (job.type === "TRANSCRIBE") await runTranscribe(job.meetingId, ac.signal);
    else await runSummarize(job.meetingId, ac.signal);
    if (ac.signal.aborted) throw new Error("Cancelled by user");
    await prisma.job.update({ where: { id: job.id }, data: { status: "DONE", lastError: null } });
  } catch (e) {
    const msg = ac.signal.aborted ? "Cancelled by user" : e instanceof Error ? e.message : String(e);
    try {
      await failJob(job, msg);
      console.error(`[worker] ${job.type} ${job.meetingId} failed (stopped):`, msg);
    } catch (e2) {
      // Even recording the failure failed (e.g. DB hiccup); never let that take the worker down.
      console.error(`[worker] ${job.type} ${job.meetingId} failed and could not be recorded:`, msg, e2);
    }
  } finally {
    clearInterval(watcher);
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
    const next = m.audioPath ? ({ status: "UPLOADED" } as const) : ({ status: "FAILED", failedStage: "TRANSCRIBE", error: "No audio was received for this recording." } as const);
    // Claim it atomically so a concurrent /finalize call can't enqueue a second job.
    const { count } = await prisma.meeting.updateMany({ where: { id: m.id, status: "RECORDING" }, data: next });
    if (count && m.audioPath) await prisma.job.create({ data: { type: "TRANSCRIBE", meetingId: m.id } });
    if (count) console.log(`[worker] finalized abandoned recording ${m.id} (${m.audioPath ? "processing" : "no audio"})`);
  }
}

/**
 * Remote mode: jobs claimed by the local worker that went silent (laptop closed, crash). Fail them so the
 * recording shows an error with Re-transcribe / Re-recap instead of spinning forever.
 */
async function sweepStaleRemoteJobs() {
  const stale = await prisma.job.findMany({
    where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - REMOTE_STALE_MIN * 60_000) } },
    select: { id: true, type: true, meetingId: true },
  });
  for (const j of stale) {
    const { count } = await prisma.job.updateMany({ where: { id: j.id, status: "RUNNING" }, data: { status: "FAILED", lastError: "Local worker stopped responding" } });
    if (count) {
      await failJob(j, "The local worker stopped responding. Start it again, then re-run this step.");
      console.log(`[worker] failed stale remote ${j.type} job for ${j.meetingId}`);
    }
  }
}

/**
 * Leftover scratch folders (a crash or restart in the middle of a job skips the normal cleanup).
 * Run at startup, when no job can be using one; the next run recreates what it needs.
 */
async function removeOrphanedWorkDirs() {
  const root = path.resolve(DATA_DIR, "meetings");
  const ids = await fs.readdir(root).catch(() => [] as string[]);
  let n = 0;
  for (const id of ids) {
    const work = path.join(root, id, "work");
    if (await fs.stat(work).then(() => true, () => false)) { await fs.rm(work, { recursive: true, force: true }); n++; }
  }
  if (n) console.log(`[worker] removed ${n} leftover work folder(s)`);
}

export function startWorker() {
  if (started) return;
  started = true;
  const remote = PROCESSING_MODE === "remote";
  // Jobs left RUNNING by a crashed/restarted container go back in the queue. In remote mode they belong
  // to the local worker, which may still be running, so they are left alone (the stale sweeper covers them).
  if (!remote) prisma.job.updateMany({ where: { status: "RUNNING" }, data: { status: "PENDING" } }).catch(() => {});
  let lastSweep = 0;
  const loop = async () => {
    try {
      if (Date.now() - lastSweep > SWEEP_EVERY_MS) {
        lastSweep = Date.now();
        await sweepStaleRecordings();
        if (remote) await sweepStaleRemoteJobs();
      }
      if (!remote) while (await tick()) { /* drain */ }
    } catch (e) {
      console.error("[worker] tick error", e);
    }
    setTimeout(loop, POLL_MS);
  };
  // Clear leftovers first, so cleanup can never race a job that has just started.
  removeOrphanedWorkDirs().catch((e) => console.error("[worker] cleanup failed", e)).finally(loop);
  console.log(`[worker] started (${PROCESSING_MODE} processing)`);
}
