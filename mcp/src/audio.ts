import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const run = promisify(execFile);

export async function probeDuration(file: string, signal?: AbortSignal): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { signal });
  return Math.round(parseFloat(stdout.trim()) || 0);
}

/** Splits one channel (0 = my mic, 1 = everyone else, undefined = downmix) into mono 16 kHz mp3 chunks. */
export async function splitChannel(input: string, outDir: string, label: string, channel?: 0 | 1, signal?: AbortSignal) {
  const filter = channel === undefined ? [] : ["-af", `pan=mono|c0=c${channel}`];
  const job = run("ffmpeg", [
    "-y", "-v", "error", "-i", input, ...filter, "-ac", "1", "-ar", "16000", "-b:a", "32k",
    "-f", "segment", "-segment_time", String(config.chunkSeconds), "-reset_timestamps", "1",
    path.join(outDir, `${label}-%03d.mp3`),
  ], { maxBuffer: 16 * 1024 * 1024, signal });
  try {
    await job;
  } catch (e) {
    const child = job.child; // wait for ffmpeg to really exit before the caller deletes the folder
    if (signal?.aborted && child.exitCode === null && child.signalCode === null) await new Promise((r) => child.once("exit", r));
    throw e;
  }
  const files = (await fs.readdir(outDir)).filter((f) => f.startsWith(`${label}-`) && f.endsWith(".mp3")).sort();
  return files.map((f) => path.join(outDir, f));
}
