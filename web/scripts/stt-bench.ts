// Usage: npx tsx scripts/stt-bench.ts <audio-file> [openai|deepgram ...]
// Compares STT providers on a real recording (use ~5-10 min of mixed Vietnamese/English).
import "dotenv/config";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { splitChannel } from "../lib/audio";
import { getStt } from "../lib/stt";

async function main() {
  const [file, ...names] = process.argv.slice(2);
  if (!file) throw new Error("Usage: stt-bench.ts <audio-file> [openai|deepgram ...]");
  const providers = names.length ? names : ["openai", "deepgram"];
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "stt-bench-"));
  const [first] = await splitChannel(file, work, "mix");

  for (const name of providers) {
    const t0 = Date.now();
    try {
      const segs = await getStt(name).transcribe(first);
      const out = path.join(process.cwd(), `bench-${name}.txt`);
      await fs.writeFile(out, segs.map((s) => `[${s.start.toFixed(1)}] ${s.speaker ?? ""} ${s.text}`).join("\n"));
      console.log(`${name}: ${segs.length} segments in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
    } catch (e) {
      console.error(`${name}: FAILED`, e instanceof Error ? e.message : e);
    }
  }
  await fs.rm(work, { recursive: true, force: true });
  console.log("Read the outputs side by side and judge: Vietnamese accuracy, English terms mid-sentence, timestamps.");
}
main();
