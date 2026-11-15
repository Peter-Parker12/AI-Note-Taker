import { openaiStt } from "./openai";
import { deepgramStt } from "./deepgram";
import { localStt } from "./local";
import type { SttProvider } from "./types";

export function getStt(name: string): SttProvider {
  if (name === "deepgram") return deepgramStt;
  if (name === "local") return localStt;
  return openaiStt;
}
export type { Segment, SttProvider, RawSegment, SttOptions } from "./types";
