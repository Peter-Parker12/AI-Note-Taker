import fs from "node:fs/promises";
import path from "node:path";
import { api, type Brief, type Segment } from "./api.js";
import { probeDuration, splitChannel } from "./audio.js";
import { config } from "./config.js";
import { transcribeFile } from "./whisper.js";

type Plan = { label: string; channel: 0 | 1 | undefined; speaker: string };

/**
 * Transcribes a meeting's recording with the local Whisper and saves the transcript (which queues the recap). Any failure (or a Cancel from the web UI) is
 * reported to the server, which shows it on the recording; scratch files are always removed.
 */
export async function transcribeMeeting(id: string, onProgress: (pct: number, message: string) => void): Promise<Brief> {
  // Claims the queued transcription, or starts one if the meeting is idle; the server refuses if it is busy.
  await api.start(id);

  const ac = new AbortController();
  const work = path.join(config.workDir, id);
  try {
    const info = await api.brief(id);
    await fs.rm(work, { recursive: true, force: true });
    await fs.mkdir(work, { recursive: true });

    onProgress(0, "Downloading audio");
    const audio = path.join(work, "audio.bin");
    await api.downloadAudio(id, audio, ac.signal);

    const durationSec = await probeDuration(audio, ac.signal);
    const plan: Plan[] = info.stereo
      ? [{ label: "me", channel: 0, speaker: "Me" }, { label: "others", channel: 1, speaker: "Others" }]
      : [{ label: "mix", channel: undefined, speaker: "Speaker" }];
    const split: (Plan & { chunks: string[] })[] = [];
    for (const p of plan) split.push({ ...p, chunks: await splitChannel(audio, work, p.label, p.channel, ac.signal) });
    const total = split.reduce((n, p) => n + p.chunks.length, 0) || 1;

    let done = 0;
    const segments: Segment[] = [];
    for (const p of split) {
      for (let i = 0; i < p.chunks.length; i++) {
        ac.signal.throwIfAborted();
        const segs = await transcribeFile(p.chunks[i], info.sttLanguage, ac.signal);
        for (const s of segs) if (s.text) segments.push({ speaker: p.speaker, start: s.start + i * config.chunkSeconds, end: s.end + i * config.chunkSeconds, text: s.text });
        done++;
        const pct = Math.round((done / total) * 100);
        onProgress(pct, `Transcribed ${done}/${total} chunks`);
        // Heartbeat + progress for the web UI; also tells us if the user pressed Cancel.
        const { cancelRequested } = await api.progress(id, pct);
        if (cancelRequested) { ac.abort(); throw new Error("Cancelled by user"); }
      }
    }
    if (!segments.length) throw new Error("Whisper returned no speech for this recording.");

    segments.sort((a, b) => a.start - b.start);
    await api.putTranscript(id, { segments, durationSec });
    // The server has queued the recap; it is finished by whoever calls set_recap.
    return await api.brief(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await api.fail(id, msg).catch(() => {}); // already cancelled/failed server-side is fine
    throw e;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
