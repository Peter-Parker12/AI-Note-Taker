function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set. See mcp/README.md.`);
  return v;
}

export const config = {
  // Your Note Taker server, e.g. https://notes.example.com (no trailing slash).
  baseUrl: () => need("NOTE_TAKER_URL").replace(/\/+$/, ""),
  // An API token created on the server's Account page.
  token: () => need("NOTE_TAKER_TOKEN"),
  // Any OpenAI-compatible /v1/audio/transcriptions endpoint running on THIS machine.
  whisperUrl: (process.env.WHISPER_URL ?? "http://localhost:8000/v1").replace(/\/+$/, ""),
  whisperModel: process.env.WHISPER_MODEL ?? "Systran/faster-whisper-small",
  whisperKey: process.env.WHISPER_API_KEY,
  // Scratch space for downloaded audio and chunks; removed after every run.
  workDir: process.env.WORK_DIR ?? "/tmp/note-taker-mcp",
  chunkSeconds: 600,
};
