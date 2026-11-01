import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { unauthorized } from "@/lib/api-auth";
import { encrypt } from "@/lib/crypto";
import { getSettingsView } from "@/lib/settings";

export const dynamic = "force-dynamic";

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const schema = z.object({
  aiInstructions: nullableText(4000),
  recapLanguage: z.enum(["auto", "vi", "en"]).optional(),
  sttProvider: z.enum(["openai", "deepgram"]).nullable().optional(),
  sttLanguage: z.string().regex(/^(auto|[a-z]{2,3})$/).nullable().optional(),
  claudeModel: z.string().regex(/^claude-[\w.-]+$/).max(80).nullable().optional(),
  anthropicKey: nullableText(300), // string = set, ""/null = clear, absent = unchanged
  openaiKey: nullableText(300),
  deepgramKey: nullableText(300),
});

// Session-only on purpose: a leaked extension token must not be able to read or replace API keys.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return Response.json(await getSettingsView(user.id));
}

/** Partial update, like the Outreach tool's crud_settings: only provided fields change. */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid settings: " + body.error.issues[0]?.message }, { status: 400 });
  const b = body.data;
  const empty = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);

  const data: Record<string, unknown> = {};
  if (b.aiInstructions !== undefined) data.aiInstructions = empty(b.aiInstructions);
  if (b.recapLanguage !== undefined) data.recapLanguage = b.recapLanguage;
  if (b.sttProvider !== undefined) data.sttProvider = b.sttProvider;
  if (b.sttLanguage !== undefined) data.sttLanguage = b.sttLanguage;
  if (b.claudeModel !== undefined) data.claudeModel = b.claudeModel;
  try {
    for (const [field, col] of [["anthropicKey", "anthropicKeyEnc"], ["openaiKey", "openaiKeyEnc"], ["deepgramKey", "deepgramKeyEnc"]] as const) {
      const v = empty(b[field]);
      if (v !== undefined) data[col] = v ? encrypt(v) : null;
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not store key" }, { status: 500 });
  }

  await prisma.userSettings.upsert({
    where: { userId: user.id }, create: { userId: user.id, ...data }, update: data,
  });
  return Response.json(await getSettingsView(user.id));
}
