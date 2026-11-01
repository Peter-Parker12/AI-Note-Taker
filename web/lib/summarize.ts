import Anthropic from "@anthropic-ai/sdk";
import type { ResolvedSettings } from "@/lib/settings";

export type MeetingSummary = {
  title: string;
  summary: string; // markdown
  decisions: string[];
  actionItems: { task: string; owner: string | null; due: string | null }[];
  topics: string[];
};

/** Per-account key when set, otherwise the SDK reads ANTHROPIC_API_KEY. */
export const claudeClient = (cfg: Pick<ResolvedSettings, "anthropicKey">) => new Anthropic({ apiKey: cfg.anthropicKey });

const SYSTEM = `You write meeting recaps from automatic transcripts.
The transcript may mix Vietnamese and English and contain recognition errors; infer intended words from context.
Speaker labels: "Me" is the recording user (their microphone); "Others" are remote participants (possibly several people merged), or "Others N" when separated.
Keep English technical terms and names as spoken.
Only include action items that were actually committed to or requested; never invent owners or dates — use null when not stated.
Be concise and factual.`;

const LANGUAGE_RULE = {
  auto: "Write the recap in the dominant language of the meeting (Vietnamese if mixed).",
  vi: "Write the recap in Vietnamese.",
  en: "Write the recap in English.",
};

export function recapSystemPrompt(cfg: Pick<ResolvedSettings, "recapLanguage" | "aiInstructions">) {
  return [
    SYSTEM,
    LANGUAGE_RULE[cfg.recapLanguage],
    cfg.aiInstructions.trim() &&
      `The user's own standing instructions for their recaps (follow them unless they conflict with the rules above):\n<instructions>\n${cfg.aiInstructions.trim()}\n</instructions>`,
  ].filter(Boolean).join("\n");
}

export async function summarizeTranscript(
  input: { title: string; startedAt: Date; transcript: string },
  cfg: ResolvedSettings,
): Promise<MeetingSummary> {
  const res = await claudeClient(cfg).messages.create({
    model: cfg.claudeModel,
    max_tokens: 4096,
    system: recapSystemPrompt(cfg),
    tools: [{
      name: "save_recap",
      description: "Save the structured meeting recap.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short descriptive meeting title" },
          summary: { type: "string", description: "Markdown summary: short overview paragraph, then key discussion points as bullets" },
          decisions: { type: "array", items: { type: "string" } },
          actionItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                task: { type: "string" },
                owner: { type: ["string", "null"] },
                due: { type: ["string", "null"], description: "As stated, e.g. 'Friday' or ISO date" },
              },
              required: ["task", "owner", "due"],
            },
          },
          topics: { type: "array", items: { type: "string" } },
        },
        required: ["title", "summary", "decisions", "actionItems", "topics"],
      },
    }],
    tool_choice: { type: "tool", name: "save_recap" },
    messages: [{
      role: "user",
      content: `Meeting: ${input.title}\nDate: ${input.startedAt.toISOString()}\n\n<transcript>\n${input.transcript}\n</transcript>`,
    }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Claude returned no recap");
  return block.input as MeetingSummary;
}
