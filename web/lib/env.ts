export const DATA_DIR = process.env.DATA_DIR ?? "./data";
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";
export const STT_PROVIDER = (process.env.STT_PROVIDER ?? "openai") as "openai" | "deepgram";
// Hint for the STT language. "auto" lets the provider detect it (best effort for mixed VN/EN).
export const STT_LANGUAGE = process.env.STT_LANGUAGE ?? "auto";
