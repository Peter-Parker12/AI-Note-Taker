// Service worker: owns recording state, creates the meeting on the server,
// and hands the tab's stream id to the offscreen document that does the recording.

// No recording state lives in this file: MV3 service workers are shut down after ~30s idle, which
// would lose it. The offscreen document is the source of truth (it is what actually records), and
// the last error / last finished meeting live in chrome.storage.session.

async function config() {
  const { serverUrl, token } = await chrome.storage.local.get(["serverUrl", "token"]);
  if (!serverUrl || !token) throw new Error("Set the server URL and token in the extension options first.");
  return { serverUrl: serverUrl.replace(/\/+$/, ""), token };
}

function platformOf(url = "") {
  if (url.includes("meet.google.com")) return "meet";
  if (url.includes("zoom.us")) return "zoom";
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return "teams";
  return "other";
}

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Record tab and microphone audio",
  });
}

function setBadge(on) {
  chrome.action.setBadgeText({ text: on ? "REC" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
}

async function offscreenStatus() {
  if (!(await chrome.offscreen.hasDocument())) return { recording: false };
  try {
    const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "status" });
    return res?.ok ? res : { recording: false };
  } catch {
    return { recording: false };
  }
}

async function closeOffscreen() {
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument().catch(() => {});
}

async function start({ tabId, title }) {
  if ((await offscreenStatus()).recording) throw new Error("Already recording");
  await chrome.storage.session.remove(["error", "lastMeetingId"]);
  const { serverUrl, token } = await config();
  const tab = await chrome.tabs.get(tabId);

  const res = await fetch(`${serverUrl}/api/meetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: title || tab.title?.slice(0, 120) || "", platform: platformOf(tab.url), stereo: true }),
  });
  if (!res.ok) throw new Error(`Server rejected the recording (${res.status}). Check your token.`);
  const { id } = await res.json();

  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreen();
  const ack = await chrome.runtime.sendMessage({ target: "offscreen", type: "start", streamId, serverUrl, token, meetingId: id });
  if (!ack?.ok) throw new Error(ack?.error || "Could not start recording");
  setBadge(true);
}

async function stop() {
  const { recording, meetingId } = await offscreenStatus();
  if (recording) await chrome.runtime.sendMessage({ target: "offscreen", type: "stop" });
  setBadge(false);
  await closeOffscreen();
  if (meetingId) await chrome.storage.session.set({ lastMeetingId: meetingId });
  return meetingId ?? null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "background") return;
  (async () => {
    try {
      if (msg.type === "status") {
        const s = await offscreenStatus();
        setBadge(!!s.recording); // resync in case this worker was restarted
        const { error, lastMeetingId } = await chrome.storage.session.get(["error", "lastMeetingId"]);
        return sendResponse({ ok: true, state: { recording: !!s.recording, meetingId: s.meetingId ?? null, startedAt: s.startedAt ?? null, error, lastMeetingId } });
      }
      if (msg.type === "start") { await start(msg); return sendResponse({ ok: true }); }
      if (msg.type === "stop") { const id = await stop(); return sendResponse({ ok: true, meetingId: id }); }
      if (msg.type === "recorder-finished") {
        // The recorded tab went away and the offscreen document already uploaded and finalized.
        setBadge(false);
        if (msg.meetingId) await chrome.storage.session.set({ lastMeetingId: msg.meetingId });
        await closeOffscreen();
        return sendResponse({ ok: true });
      }
      if (msg.type === "recorder-error") {
        await chrome.storage.session.set({ error: msg.error });
        setBadge(false);
        await closeOffscreen();
        return sendResponse({ ok: true });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // async response
});
