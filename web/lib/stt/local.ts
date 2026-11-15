import fs from "fs/promises";
import path from "path";
import type { SttProvider } from "./types";

// Self-hosted Whisper behind an OpenAI-compatible /v1/audio/transcriptions endpoint
// (the bundled `whisper` compose service runs speaches/faster-whisper; any compatible server works).
// No API key needed, and audio never leaves your VPS.
export const localStt: SttProvider = {
  name: "local",
  async transcribe(file, { language }) {
    const base = (process.env.LOCAL_STT_URL ?? "http://whisper:8000/v1").replace(/\/+$/, "");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(await fs.readFile(file))]), path.basename(file));
    form.append("model", process.env.LOCAL_STT_MODEL ?? "Systran/faster-whisper-small");
    form.append("response_format", "verbose_json");
    if (language !== "auto") form.append("language", language);
    let res: Response;
    try {
      res = await fetch(`${base}/audio/transcriptions`, { method: "POST", body: form, signal: AbortSignal.timeout(30 * 60_000) });
    } catch (e) {
      throw new Error(`Local STT unreachable at ${base} (is the whisper service running?): ${(e as Error).message}`);
    }
    if (!res.ok) throw new Error(`Local STT ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { segments?: { start: number; end: number; text: string }[]; text: string };
    return (json.segments ?? [{ start: 0, end: 0, text: json.text }]).map((s) => ({
      start: s.start, end: s.end, text: s.text.trim(),
    }));
  },
};
