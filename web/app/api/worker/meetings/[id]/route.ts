import { workerContext } from "@/lib/remote-worker";
import { getUserSettings } from "@/lib/settings";
import { recapSystemPrompt } from "@/lib/summarize";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// What an AI client needs to work on one meeting: the transcript (if any), the language hint for Whisper,
// and this account's recap instructions (language + standing instructions) for whoever writes the recap.
export async function GET(req: Request, { params }: Ctx) {
  const ctx = await workerContext(req, (await params).id);
  if (ctx.error) return ctx.error;
  const { meeting, user } = ctx;
  const cfg = await getUserSettings(user.id);
  return Response.json({
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    startedAt: meeting.startedAt,
    durationSec: meeting.durationSec,
    stereo: meeting.stereo,
    hasAudio: !!meeting.audioPath,
    transcript: meeting.transcriptText ?? null,
    recapInstructions: recapSystemPrompt(cfg),
    sttLanguage: cfg.sttLanguage,
  });
}
