import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, type Brief, type MeetingMeta } from "../api.js";
import { transcribeMeeting } from "../transcribe.js";
import { DESTROY, READ, WRITE, json, meetingId, recapShape, safe, segmentShape, text } from "./util.js";

/** Transcript plus this account's recap instructions: everything needed to write the recap. */
function recapBrief(m: Brief) {
  return [
    `Meeting: ${m.title}`, `Meeting id: ${m.id}`, `Date: ${m.startedAt}`, "",
    "Write the recap following these instructions, then call set_recap with it:",
    "<instructions>", m.recapInstructions, "</instructions>", "",
    "<transcript>", m.transcript ?? "", "</transcript>",
  ].join("\n");
}

const meta = (m: MeetingMeta) => ({
  id: m.id, title: m.title, platform: m.platform, status: m.status, startedAt: m.startedAt, durationSec: m.durationSec,
  stereo: m.stereo, hasAudio: m.hasAudio, hasTranscript: m.hasTranscript, hasRecap: m.hasRecap,
  ...(m.error ? { error: m.error, failedStage: m.failedStage } : {}), ...(m.progress != null ? { progress: m.progress } : {}),
});

/** One create / read / update / delete tool per resource: meeting, recording, transcript, recap. */
export function registerCrud(server: McpServer) {
  // ---------- Meeting ----------
  server.registerTool("list_meetings", {
    description: "Lists meetings, newest first. Optionally search transcripts and titles, or filter by status. Status UPLOADED = waiting for a transcript (use generate_transcript); SUMMARIZING = has a transcript and is waiting for a recap (read it with get_transcript forRecap, then set_recap); FAILED = a step failed (see get_meeting).",
    annotations: READ,
    inputSchema: {
      query: z.string().optional().describe("Search text (title and transcript)"),
      status: z.enum(["RECORDING", "UPLOADED", "TRANSCRIBING", "SUMMARIZING", "READY", "FAILED"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
  }, safe(async ({ query, status, limit }) => json(await api.list({ q: query, status, limit }))));

  server.registerTool("get_meeting", {
    description: "One meeting's details: status, errors, and whether it has a recording, transcript and recap. Use get_transcript / get_recap for their content.",
    annotations: READ,
    inputSchema: { meetingId },
  }, safe(async ({ meetingId }) => json(meta(await api.get(meetingId)))));

  server.registerTool("create_meeting", {
    description: "Creates an empty meeting. Then add a recording with upload_audio, or a transcript with set_transcript, or a recap with set_recap.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      title: z.string().optional().describe('Defaults to "Untitled meeting"; the recap will fill it in'),
      platform: z.string().optional().describe("meet | zoom | other ..."),
      startedAt: z.string().optional().describe("ISO 8601 with offset, e.g. 2026-11-14T09:00:00+07:00. Defaults to now"),
      stereo: z.boolean().optional().describe("true if the audio has my mic on the left and everyone else on the right (default true); false for a single-mixed recording"),
    },
  }, safe(async (b) => json(await api.create(b))));

  server.registerTool("update_meeting", {
    description: "Changes a meeting's title, platform, start time or stereo flag. Only the fields you pass change.",
    annotations: WRITE,
    inputSchema: { meetingId, title: z.string().optional(), platform: z.string().optional(), startedAt: z.string().optional(), stereo: z.boolean().optional() },
  }, safe(async ({ meetingId, ...patch }) => { await api.update(meetingId, patch); return text("Updated."); }));

  server.registerTool("delete_meeting", {
    description: "Permanently deletes a meeting with its recording, transcript and recap.",
    annotations: DESTROY,
    inputSchema: { meetingId },
  }, safe(async ({ meetingId }) => { await api.remove(meetingId); return text("Deleted."); }));

  // ---------- Recording ----------
  server.registerTool("upload_audio", {
    description: "Uploads (or replaces) the recording of a meeting from a file on this machine. By default a transcription is queued afterwards (then run generate_transcript). Refused while the meeting is being processed.",
    annotations: WRITE,
    inputSchema: {
      meetingId,
      filePath: z.string().describe("Absolute path of an audio/video file on this machine (mp3, m4a, wav, webm, mp4 ...)"),
      stereo: z.boolean().optional().describe("true if my mic is the left channel and everyone else the right; omit to keep the meeting's setting"),
      transcribe: z.boolean().optional().describe("false to only store the file without queueing a transcription (default true)"),
    },
  }, safe(async ({ meetingId, filePath, stereo, transcribe }) => {
    const r = await api.uploadAudio(meetingId, path.resolve(filePath), { stereo, transcribe });
    return text(`Uploaded ${(r.bytes / 1e6).toFixed(1)} MB.${r.transcribeQueued ? " A transcription is waiting: run generate_transcript." : ""}`);
  }));

  server.registerTool("download_audio", {
    description: "Saves a meeting's recording to a file on this machine.",
    annotations: READ,
    inputSchema: { meetingId, destPath: z.string().describe("Absolute path to write, e.g. /Users/me/Downloads/meeting.webm") },
  }, safe(async ({ meetingId, destPath }) => { await api.downloadAudio(meetingId, path.resolve(destPath)); return text(`Saved to ${path.resolve(destPath)}`); }));

  server.registerTool("delete_audio", {
    description: "Deletes only the recording file; the transcript and recap are kept.",
    annotations: DESTROY,
    inputSchema: { meetingId },
  }, safe(async ({ meetingId }) => { await api.deleteAudio(meetingId); return text("Recording deleted."); }));

  // ---------- Transcript ----------
  server.registerTool("get_transcript", {
    description: "Reads a meeting's transcript as plain text ([mm:ss] Speaker: text per line). With forRecap, also returns this account's recap instructions so you can write the recap.",
    annotations: READ,
    inputSchema: { meetingId, forRecap: z.boolean().optional().describe("Also return the recap instructions, then call set_recap") },
  }, safe(async ({ meetingId, forRecap }) => forRecap ? text(recapBrief(await api.brief(meetingId))) : text((await api.getTranscript(meetingId)).text)));

  server.registerTool("generate_transcript", {
    description: "Creates the transcript from the meeting's recording with local Whisper (a few minutes for long meetings; progress shows in the web app). Starts the queued transcription, or a fresh one if the meeting is idle. Replaces any existing transcript. Returns the transcript plus recap instructions: write the recap and call set_recap. Failures are reported on the meeting for you.",
    annotations: WRITE,
    inputSchema: { meetingId },
  }, safe(async ({ meetingId }, extra) => {
    const token = extra._meta?.progressToken;
    const brief = await transcribeMeeting(meetingId, (pct, message) => {
      if (token === undefined) return;
      extra.sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: pct, total: 100, message } }).catch(() => {});
    });
    return text(recapBrief(brief));
  }));

  server.registerTool("set_transcript", {
    description: "Creates or replaces a meeting's transcript by hand (to make one from the recording use generate_transcript). If the meeting is waiting for a transcript this finishes that step. Pass timed segments, or plain text (pasted notes, an external transcript). Set generateRecap to queue a recap from it (then read it with get_transcript forRecap and finish it with set_recap).",
    annotations: WRITE,
    inputSchema: {
      meetingId,
      segments: z.array(segmentShape).optional(),
      text: z.string().optional().describe("Plain text, used when there are no segments"),
      durationSec: z.number().optional(),
      generateRecap: z.boolean().optional().describe("Queue a recap from this transcript"),
    },
  }, safe(async ({ meetingId, ...b }) => {
    const r = await api.putTranscript(meetingId, b);
    return text(`Transcript saved (${r.segments} segment${r.segments === 1 ? "" : "s"}).${r.recapQueued ? " A recap is now waiting: read it with get_transcript forRecap, then set_recap." : ""}`);
  }));

  server.registerTool("delete_transcript", {
    description: "Deletes a meeting's transcript (the recap and recording are kept).",
    annotations: DESTROY,
    inputSchema: { meetingId },
  }, safe(async ({ meetingId }) => { await api.deleteTranscript(meetingId); return text("Transcript deleted."); }));

  // ---------- Recap ----------
  server.registerTool("get_recap", {
    description: "Reads a meeting's recap: title, markdown summary, decisions, action items, topics.",
    annotations: READ,
    inputSchema: { meetingId },
  }, safe(async ({ meetingId }) => json(await api.getRecap(meetingId))));

  server.registerTool("set_recap", {
    description: "Creates or replaces a meeting's recap. If the meeting is waiting for a recap, this finishes it and the meeting becomes READY.",
    annotations: WRITE,
    inputSchema: { meetingId, ...recapShape },
  }, safe(async ({ meetingId, ...recap }) => { const r = await api.putRecap(meetingId, recap); return text(`Recap saved. "${r.title}" is READY.`); }));

  server.registerTool("email_recap", {
    description: "Emails a meeting's recap (summary, decisions, action items, link) to the given addresses, from the SMTP mailbox set up in the web app's Account settings.",
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    inputSchema: {
      meetingId,
      to: z.array(z.string().email()).min(1).max(20).describe("Recipient email addresses"),
      note: z.string().optional().describe("Optional short message shown above the recap"),
    },
  }, safe(async ({ meetingId, to, note }) => {
    const r = await api.emailRecap(meetingId, to, note);
    return text(`Sent to ${r.sent.join(", ")}.${r.rejected.length ? ` Rejected: ${r.rejected.join(", ")}.` : ""}`);
  }));

  server.registerTool("delete_recap", {
    description: "Deletes a meeting's recap (the transcript and recording are kept).",
    annotations: DESTROY,
    inputSchema: { meetingId },
  }, safe(async ({ meetingId }) => { await api.deleteRecap(meetingId); return text("Recap deleted."); }));
}

/** One entry point for "work through everything that is waiting", built only from the tools above. */
export function registerPrompts(server: McpServer) {
  server.registerPrompt("process-pending-meetings", {
    description: "Transcribe and recap every recording waiting on the Note Taker server",
  }, () => ({
    messages: [{
      role: "user",
      content: { type: "text", text: [
        "Work through the Note Taker meetings that are waiting:",
        "1. list_meetings with status UPLOADED: for each, call generate_transcript, write the recap from what it returns, and call set_recap.",
        "2. list_meetings with status SUMMARIZING: for each, call get_transcript with forRecap, write the recap, and call set_recap.",
        "If one meeting fails, carry on with the rest.",
        "Finish with one line per meeting: its title and whether it is READY or failed.",
      ].join("\n") },
    }],
  }));
}
