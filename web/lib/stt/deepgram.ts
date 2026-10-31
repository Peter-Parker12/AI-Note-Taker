import fs from "fs/promises";
import { STT_LANGUAGE } from "@/lib/env";
import type { SttProvider } from "./types";

// Diarizes within a file, so the "others" channel can be split into Speaker 1..n.
export const deepgramStt: SttProvider = {
  name: "deepgram",
  async transcribe(file) {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("DEEPGRAM_API_KEY is not set");
    const params = new URLSearchParams({
      model: process.env.DEEPGRAM_MODEL ?? "nova-3",
      smart_format: "true",
      punctuate: "true",
      utterances: "true",
      diarize: "true",
    });
    if (STT_LANGUAGE === "auto") params.set("detect_language", "true");
    else params.set("language", STT_LANGUAGE);
    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "audio/mpeg" },
      body: new Uint8Array(await fs.readFile(file)),
    });
    if (!res.ok) throw new Error(`Deepgram STT ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      results?: { utterances?: { start: number; end: number; transcript: string; speaker?: number }[] };
    };
    return (json.results?.utterances ?? []).map((u) => ({
      start: u.start, end: u.end, text: u.transcript.trim(),
      speaker: u.speaker !== undefined ? String(u.speaker) : undefined,
    }));
  },
};
