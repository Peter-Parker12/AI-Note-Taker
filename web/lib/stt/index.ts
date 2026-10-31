import { STT_PROVIDER } from "@/lib/env";
import { openaiStt } from "./openai";
import { deepgramStt } from "./deepgram";
import type { SttProvider } from "./types";

export function getStt(name: string = STT_PROVIDER): SttProvider {
  if (name === "deepgram") return deepgramStt;
  return openaiStt;
}
export type { Segment, SttProvider, RawSegment } from "./types";
