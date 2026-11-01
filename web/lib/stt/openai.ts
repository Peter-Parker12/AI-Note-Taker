import fs from "fs/promises";
import path from "path";
import type { SttProvider } from "./types";

// whisper-1 is used because verbose_json returns segment timestamps, which
// gpt-4o-transcribe does not. Language is auto-detected unless STT_LANGUAGE is set.
export const openaiStt: SttProvider = {
  name: "openai",
  async transcribe(file, { apiKey, language }) {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) throw new Error("No OpenAI API key: add yours in Account settings or set OPENAI_API_KEY on the server");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(await fs.readFile(file))]), path.basename(file));
    form.append("model", process.env.OPENAI_STT_MODEL ?? "whisper-1");
    form.append("response_format", "verbose_json");
    if (language !== "auto") form.append("language", language);
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) throw new Error(`OpenAI STT ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { segments?: { start: number; end: number; text: string }[]; text: string };
    return (json.segments ?? [{ start: 0, end: 0, text: json.text }]).map((s) => ({
      start: s.start, end: s.end, text: s.text.trim(),
    }));
  },
};
