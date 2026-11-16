import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export type RawSegment = { start: number; end: number; text: string };

/** Transcribes one short audio file with an OpenAI-compatible endpoint on this machine. */
export async function transcribeFile(file: string, language: string, signal?: AbortSignal): Promise<RawSegment[]> {
  const form = new FormData();
  form.append("file", new Blob([await fs.readFile(file)]), path.basename(file));
  form.append("model", config.whisperModel);
  form.append("response_format", "verbose_json");
  if (language && language !== "auto") form.append("language", language);

  let res: Response;
  try {
    res = await fetch(`${config.whisperUrl}/audio/transcriptions`, {
      method: "POST",
      headers: config.whisperKey ? { Authorization: `Bearer ${config.whisperKey}` } : undefined,
      body: form,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]) : AbortSignal.timeout(30 * 60_000),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error(`Whisper unreachable at ${config.whisperUrl} (is it running on this machine?)`);
  }
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { segments?: { start: number; end: number; text: string }[]; text?: string; duration?: number };
  if (json.segments?.length) return json.segments.map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
  return json.text?.trim() ? [{ start: 0, end: json.duration ?? 0, text: json.text.trim() }] : [];
}
