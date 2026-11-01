import { openaiStt } from "./openai";
import { deepgramStt } from "./deepgram";
import type { SttProvider } from "./types";

export function getStt(name: string): SttProvider {
  if (name === "deepgram") return deepgramStt;
  return openaiStt;
}
export type { Segment, SttProvider, RawSegment, SttOptions } from "./types";
