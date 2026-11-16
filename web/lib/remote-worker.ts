import { prisma } from "@/lib/prisma";
import { getRequestUser, unauthorized } from "@/lib/api-auth";
import { getOwnedMeeting } from "@/lib/meetings";
import { PROCESSING_MODE } from "@/lib/env";
import type { Stage } from "@/lib/meeting-data";

/** Authenticates the caller and loads one of their meetings; returns a Response when something is wrong. */
export async function workerContext(req: Request, id: string) {
  const user = await getRequestUser(req);
  if (!user) return { error: unauthorized() };
  const meeting = await getOwnedMeeting(id, user.id);
  if (!meeting) return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  return { user, meeting };
}

export function requireRemote() {
  if (PROCESSING_MODE !== "remote") {
    return Response.json({ error: "This server processes recordings itself (PROCESSING_MODE=local). Set PROCESSING_MODE=remote to use a local worker." }, { status: 409 });
  }
  return null;
}

/** The job a remote worker is currently running for a meeting, if any. */
export function runningJob(meetingId: string, type: Stage) {
  return prisma.job.findFirst({ where: { meetingId, type, status: "RUNNING" }, orderBy: { createdAt: "desc" } });
}
