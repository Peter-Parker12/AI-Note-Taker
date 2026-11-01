import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { CLAUDE_MODEL, STT_LANGUAGE, STT_PROVIDER } from "@/lib/env";

export const CLAUDE_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"];

/** What the pipeline actually uses for one account: its own settings, else the server defaults. */
export type ResolvedSettings = {
  aiInstructions: string;
  recapLanguage: "auto" | "vi" | "en";
  sttProvider: "openai" | "deepgram";
  sttLanguage: string;
  claudeModel: string;
  anthropicKey?: string; // undefined => SDK falls back to ANTHROPIC_API_KEY
  openaiKey?: string;
  deepgramKey?: string;
};

export async function getUserSettings(userId: string): Promise<ResolvedSettings> {
  const r = await prisma.userSettings.findUnique({ where: { userId } });
  return {
    aiInstructions: r?.aiInstructions ?? "",
    recapLanguage: (r?.recapLanguage as ResolvedSettings["recapLanguage"]) ?? "auto",
    sttProvider: (r?.sttProvider as ResolvedSettings["sttProvider"]) ?? STT_PROVIDER,
    sttLanguage: r?.sttLanguage ?? STT_LANGUAGE,
    claudeModel: r?.claudeModel ?? CLAUDE_MODEL,
    anthropicKey: decrypt(r?.anthropicKeyEnc) ?? undefined,
    openaiKey: decrypt(r?.openaiKeyEnc) ?? undefined,
    deepgramKey: decrypt(r?.deepgramKeyEnc) ?? undefined,
  };
}

const last4 = (k: string | null) => (k ? k.slice(-4) : null);

/** What the settings UI/API shows: raw saved values (null = "use default"), keys masked. */
export async function getSettingsView(userId: string) {
  const r = await prisma.userSettings.findUnique({ where: { userId } });
  const keys = {
    anthropic: decrypt(r?.anthropicKeyEnc), openai: decrypt(r?.openaiKeyEnc), deepgram: decrypt(r?.deepgramKeyEnc),
  };
  return {
    settings: {
      aiInstructions: r?.aiInstructions ?? "",
      recapLanguage: r?.recapLanguage ?? "auto",
      sttProvider: r?.sttProvider ?? null,
      sttLanguage: r?.sttLanguage ?? null,
      claudeModel: r?.claudeModel ?? null,
    },
    keys: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, { set: !!v, last4: last4(v) }])) as
      Record<"anthropic" | "openai" | "deepgram", { set: boolean; last4: string | null }>,
    defaults: {
      sttProvider: STT_PROVIDER, sttLanguage: STT_LANGUAGE, claudeModel: CLAUDE_MODEL,
      serverKeys: {
        anthropic: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY, deepgram: !!process.env.DEEPGRAM_API_KEY,
      },
    },
  };
}
