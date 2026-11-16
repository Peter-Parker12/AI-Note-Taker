export const DATA_DIR = process.env.DATA_DIR ?? "./data";
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";
export const STT_PROVIDER = (process.env.STT_PROVIDER ?? "openai") as "openai" | "deepgram" | "local";
// Hint for the STT language. "auto" lets the provider detect it (best effort for mixed VN/EN).
export const STT_LANGUAGE = process.env.STT_LANGUAGE ?? "auto";
// "local": this server transcribes and recaps (the built-in worker).
// "remote": the server only stores and displays; a worker on your own machine (the MCP server in /mcp)
// claims jobs through /api/worker/*, transcribes with local Whisper and writes the recap.
export const PROCESSING_MODE = (process.env.PROCESSING_MODE ?? "local") as "local" | "remote";
// A remote job that reports nothing for this long is failed, so a sleeping laptop can't leave it stuck.
export const REMOTE_STALE_MIN = Number(process.env.REMOTE_STALE_MIN ?? 30);
// Largest recording accepted by PUT /api/meetings/:id/audio. A Cloudflare Tunnel on the free plan caps one request at 100 MB.
export const MAX_AUDIO_MB = Number(process.env.MAX_AUDIO_MB ?? 500);
