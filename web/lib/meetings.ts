import fs from "fs/promises";
import { meetingDir } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

/** Meeting by id, only if owned by userId. */
export function getOwnedMeeting(id: string, userId: string) {
  return prisma.meeting.findFirst({ where: { id, userId } });
}

// Full-text search over transcripts ('simple' config: no stemming, works for Vietnamese
// since words are space-separated), falling back to title ILIKE.
export async function searchMeetings(userId: string, q: string, limit: number) {
  return prisma.$queryRaw<{ id: string; title: string; platform: string; status: string; startedAt: Date; durationSec: number | null }[]>`
    SELECT id, title, platform, status, "startedAt", "durationSec"
    FROM "Meeting"
    WHERE "userId" = ${userId}
      AND (
        to_tsvector('simple', coalesce("transcriptText", '') || ' ' || title) @@ websearch_to_tsquery('simple', ${q})
        OR title ILIKE ${"%" + q + "%"}
      )
    ORDER BY "startedAt" DESC
    LIMIT ${limit}`;
}

/** Deletes meetings owned by userId along with their audio on disk. Returns how many were removed. */
export async function deleteMeetings(userId: string, ids: string[]) {
  const owned = await prisma.meeting.findMany({ where: { id: { in: ids }, userId }, select: { id: true } });
  const ownedIds = owned.map((m) => m.id);
  await prisma.meeting.deleteMany({ where: { id: { in: ownedIds } } });
  await Promise.all(ownedIds.map((id) => fs.rm(meetingDir(id), { recursive: true, force: true })));
  return ownedIds.length;
}

/** Bytes of audio on disk for a meeting (0 if none). */
export async function audioSize(audioPath: string | null) {
  if (!audioPath) return 0;
  try { return (await fs.stat(audioPath)).size; } catch { return 0; }
}
