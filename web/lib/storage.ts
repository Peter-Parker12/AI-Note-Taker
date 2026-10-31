import path from "path";
import fs from "fs/promises";
import { DATA_DIR } from "@/lib/env";

export function meetingDir(meetingId: string) {
  return path.resolve(DATA_DIR, "meetings", meetingId);
}

export async function ensureMeetingDir(meetingId: string) {
  const dir = meetingDir(meetingId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
