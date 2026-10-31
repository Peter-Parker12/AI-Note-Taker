import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const run = promisify(execFile);

export const CHUNK_SECONDS = 600; // 10 min of 32kbps mono mp3 is ~2.4MB, well under provider upload limits

export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ]);
  return Math.round(parseFloat(stdout.trim()) || 0);
}

/**
 * Splits `input` into mono mp3 chunks of CHUNK_SECONDS for the given channel
 * (0 = left/mic, 1 = right/tab, undefined = downmix). Returns chunk paths in order.
 */
export async function splitChannel(input: string, outDir: string, label: string, channel?: 0 | 1) {
  const filter = channel === undefined ? [] : ["-af", `pan=mono|c0=c${channel}`];
  await run("ffmpeg", [
    "-y", "-v", "error", "-i", input, ...filter,
    "-ac", "1", "-ar", "16000", "-b:a", "32k",
    "-f", "segment", "-segment_time", String(CHUNK_SECONDS), "-reset_timestamps", "1",
    path.join(outDir, `${label}-%03d.mp3`),
  ], { maxBuffer: 1024 * 1024 * 16 });
  const files = (await fs.readdir(outDir)).filter((f) => f.startsWith(`${label}-`) && f.endsWith(".mp3")).sort();
  return files.map((f) => path.join(outDir, f));
}
