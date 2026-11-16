import { z } from "zod";

export const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
export const json = (v: unknown) => text(JSON.stringify(v, null, 2));
export const errorResult = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] });

/** Wraps a handler so every tool reports failures the same way. */
export function safe<A>(fn: (args: A, extra: any) => Promise<ReturnType<typeof text>>) {
  return async (args: A, extra: any) => {
    try { return await fn(args, extra); } catch (e) { return errorResult(e); }
  };
}

export const meetingId = z.string().describe("Meeting id (from list_meetings or create_meeting)");

export const segmentShape = z.object({
  speaker: z.string().describe('e.g. "Me", "Others", "Alice"'),
  start: z.number().describe("Seconds from the start of the recording"),
  end: z.number(),
  text: z.string(),
});

export const recapShape = {
  title: z.string().describe("Short descriptive meeting title"),
  summary: z.string().describe("Markdown: a short overview paragraph, then key discussion points as bullets"),
  decisions: z.array(z.string()),
  actionItems: z.array(z.object({
    task: z.string(),
    owner: z.string().nullable().describe("null unless stated in the meeting"),
    due: z.string().nullable().describe("As stated, e.g. 'Friday' or an ISO date; null unless stated"),
  })),
  topics: z.array(z.string()),
};

export const READ = { readOnlyHint: true } as const;
export const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;
export const DESTROY = { readOnlyHint: false, destructiveHint: true } as const;
