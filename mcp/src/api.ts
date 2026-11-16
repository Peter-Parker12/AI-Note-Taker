import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "./config.js";

async function send<T>(method: string, p: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(config.baseUrl() + p, {
    method,
    headers: { Authorization: `Bearer ${config.token()}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  return parse<T>(res);
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error ?? text.slice(0, 300);
    throw new Error(`Note Taker server ${res.status}: ${msg}`);
  }
  return json as T;
}

// ---- Types (mirror the server) ----
export type Stage = "TRANSCRIBE" | "SUMMARIZE";
export type Status = "RECORDING" | "UPLOADED" | "TRANSCRIBING" | "SUMMARIZING" | "READY" | "FAILED";
export type Segment = { speaker: string; start: number; end: number; text: string };
export type Recap = {
  title: string; summary: string; decisions: string[];
  actionItems: { task: string; owner: string | null; due: string | null }[]; topics: string[];
};
export type MeetingRow = { id: string; title: string; platform: string; status: Status; startedAt: string; durationSec: number | null };
export type MeetingMeta = MeetingRow & {
  error: string | null; failedStage: Stage | null; progress: number | null; stereo: boolean;
  hasAudio: boolean; hasTranscript: boolean; hasRecap: boolean; createdAt: string; updatedAt: string;
};
export type Brief = {
  id: string; title: string; status: Status; startedAt: string; durationSec: number | null; stereo: boolean;
  hasAudio: boolean; transcript: string | null; recapInstructions: string; sttLanguage: string;
};

const AUDIO_TYPES: Record<string, string> = {
  ".webm": "audio/webm", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "video/mp4", ".wav": "audio/wav",
  ".ogg": "audio/ogg", ".opus": "audio/ogg", ".aac": "audio/aac", ".flac": "audio/flac",
};

export const api = {
  // ---- Meetings ----
  list: (q?: { q?: string; status?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (q?.q) sp.set("q", q.q);
    if (q?.status) sp.set("status", q.status);
    if (q?.limit) sp.set("limit", String(q.limit));
    return send<MeetingRow[]>("GET", `/api/meetings?${sp}`);
  },
  get: (id: string) => send<MeetingMeta>("GET", `/api/meetings/${id}`),
  create: (b: { title?: string; platform?: string; stereo?: boolean; startedAt?: string }) =>
    send<{ id: string }>("POST", "/api/meetings", { ...b, draft: true }),
  update: (id: string, b: { title?: string; platform?: string; stereo?: boolean; startedAt?: string }) =>
    send<{ ok: true }>("PATCH", `/api/meetings/${id}`, b),
  remove: (id: string) => send<{ ok: true }>("DELETE", `/api/meetings/${id}`),

  // ---- Recording ----
  /** Streams a local file to the server (never held in memory). */
  async uploadAudio(id: string, file: string, opts: { stereo?: boolean; transcribe?: boolean } = {}) {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error(`${file} is not a file`);
    const sp = new URLSearchParams();
    if (opts.stereo !== undefined) sp.set("stereo", String(opts.stereo));
    if (opts.transcribe === false) sp.set("transcribe", "0");
    const ext = path.extname(file).toLowerCase();
    const res = await fetch(`${config.baseUrl()}/api/meetings/${id}/audio?${sp}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.token()}`,
        "Content-Type": AUDIO_TYPES[ext] ?? "application/octet-stream",
        "Content-Length": String(stat.size),
        "X-Filename": path.basename(file),
      },
      body: Readable.toWeb(fs.createReadStream(file)) as never,
      duplex: "half",
    } as RequestInit);
    return parse<{ ok: true; bytes: number; transcribeQueued: boolean }>(res);
  },
  /** Streams the recording to `dest`. */
  async downloadAudio(id: string, dest: string, signal?: AbortSignal) {
    const res = await fetch(`${config.baseUrl()}/api/meetings/${id}/audio`, { headers: { Authorization: `Bearer ${config.token()}` }, signal });
    if (!res.ok || !res.body) throw new Error(`Note Taker server ${res.status}: could not download the audio`);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(dest));
  },
  deleteAudio: (id: string) => send<{ ok: true }>("DELETE", `/api/meetings/${id}/audio`),

  // ---- Transcript ----
  getTranscript: (id: string) => send<{ segments: Segment[]; text: string }>("GET", `/api/meetings/${id}/transcript`),
  putTranscript: (id: string, b: { segments?: Segment[]; text?: string; durationSec?: number; generateRecap?: boolean }) =>
    send<{ ok: true; segments: number; recapQueued: boolean }>("PUT", `/api/meetings/${id}/transcript`, b),
  deleteTranscript: (id: string) => send<{ ok: true }>("DELETE", `/api/meetings/${id}/transcript`),

  // ---- Recap ----
  getRecap: (id: string) => send<Recap>("GET", `/api/meetings/${id}/recap`),
  putRecap: (id: string, recap: Recap) => send<{ ok: true; title: string }>("PUT", `/api/meetings/${id}/recap`, recap),
  deleteRecap: (id: string) => send<{ ok: true }>("DELETE", `/api/meetings/${id}/recap`),

  // ---- Email (uses the SMTP account configured in the web app's settings) ----
  emailRecap: (id: string, to: string[], note?: string) =>
    send<{ ok: true; sent: string[]; rejected: string[] }>("POST", `/api/meetings/${id}/email`, { to, note }),

  // ---- Transcribing on this machine (these keep the web app's status and progress bar in step) ----
  brief: (id: string) => send<Brief>("GET", `/api/worker/meetings/${id}`),
  start: (id: string) => send<{ ok: true }>("POST", `/api/worker/meetings/${id}/start`),
  progress: (id: string, progress?: number) => send<{ ok: true; cancelRequested: boolean }>("POST", `/api/worker/meetings/${id}/progress`, { progress }),
  fail: (id: string, message: string) => send<{ ok: true }>("POST", `/api/worker/meetings/${id}/fail`, { message }),
};
