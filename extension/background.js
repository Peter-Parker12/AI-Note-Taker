// Service worker: owns recording state, creates the meeting on the server,
// and hands the tab's stream id to the offscreen document that does the recording.

const state = { recording: false, meetingId: null, tabId: null, startedAt: null, error: null };

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

async function start({ tabId, title }) {
  if (state.recording) throw new Error("Already recording");
  state.error = null;
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

  Object.assign(state, { recording: true, meetingId: id, tabId, startedAt: Date.now() });
  setBadge(true);
}

async function stop() {
  const meetingId = state.meetingId;
  await chrome.runtime.sendMessage({ target: "offscreen", type: "stop" });
  Object.assign(state, { recording: false, meetingId: null, tabId: null, startedAt: null });
  setBadge(false);
  return meetingId;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "background") return;
  (async () => {
    try {
      if (msg.type === "status") return sendResponse({ ok: true, state });
      if (msg.type === "start") { await start(msg); return sendResponse({ ok: true }); }
      if (msg.type === "stop") { const id = await stop(); return sendResponse({ ok: true, meetingId: id }); }
      if (msg.type === "recorder-error") {
        // Offscreen doc reports a fatal error (e.g. the tab was closed, upload permanently failing).
        Object.assign(state, { recording: false, meetingId: null, tabId: null, startedAt: null, error: msg.error });
        setBadge(false);
        return sendResponse({ ok: true });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // async response
});

// Closing the recorded tab ends the recording and finalizes the upload.
chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.recording && state.tabId === tabId) stop().catch(() => {});
});
