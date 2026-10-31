// Records tab audio (right channel) + microphone (left channel) as one stereo
// Opus/WebM stream and uploads it in ordered chunks. The server splits the channels,
// so "Me" vs "Others" attribution needs no diarization.

const TIMESLICE_MS = 10_000;
let recorder, ctx, streams = [], uploader;

function makeUploader({ serverUrl, token, meetingId }) {
  let index = 0;
  let chain = Promise.resolve();
  let fatal = null;

  async function post(path, init, tries = 6) {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${serverUrl}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
        if (res.ok) return res;
        if (res.status >= 400 && res.status < 500) throw Object.assign(new Error(`Server error ${res.status}`), { permanent: true });
        throw new Error(`Server error ${res.status}`);
      } catch (e) {
        if (e.permanent || attempt >= tries) throw e;
        await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** attempt))); // network blip: back off and retry
      }
    }
  }

  return {
    // Chunks are uploaded strictly in order; the server dedupes on X-Chunk-Index so retries are safe.
    push(blob) {
      const i = index++;
      chain = chain.then(async () => {
        if (fatal) return;
        try {
          await post(`/api/meetings/${meetingId}/chunks`, {
            method: "POST", headers: { "X-Chunk-Index": String(i), "Content-Type": "application/octet-stream" }, body: blob,
          });
        } catch (e) {
          fatal = e;
          chrome.runtime.sendMessage({ target: "background", type: "recorder-error", error: `Upload failed: ${e.message}` });
        }
      });
    },
    async finish() {
      await chain;
      if (fatal) throw fatal;
      await post(`/api/meetings/${meetingId}/finalize`, { method: "POST", headers: {} });
    },
  };
}

async function start({ streamId, serverUrl, token, meetingId }) {
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
    video: false,
  });
  // Mic permission is granted once from the options page (offscreen docs can't show the prompt).
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  });
  streams = [tabStream, micStream];

  ctx = new AudioContext();
  const merger = ctx.createChannelMerger(2);
  const mono = (stream, channel) => {
    const src = ctx.createMediaStreamSource(stream);
    const g = ctx.createGain();
    g.channelCount = 1; g.channelCountMode = "explicit"; // force downmix to mono before routing
    src.connect(g); g.connect(merger, 0, channel);
    return src;
  };
  mono(micStream, 0);
  const tabSrc = mono(tabStream, 1);
  tabSrc.connect(ctx.destination); // capturing a tab mutes it for the user; play it back

  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 2;
  merger.connect(dest);

  uploader = makeUploader({ serverUrl, token, meetingId });
  recorder = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 64_000 });
  recorder.ondataavailable = (e) => e.data.size && uploader.push(e.data);
  recorder.start(TIMESLICE_MS);
}

async function stop() {
  if (!recorder) return;
  const r = recorder, u = uploader;
  recorder = null;
  await new Promise((resolve) => { r.onstop = resolve; r.stop(); }); // flushes the final chunk
  streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  await ctx.close();
  streams = []; ctx = null;
  await u.finish();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  (async () => {
    try {
      if (msg.type === "start") await start(msg);
      if (msg.type === "stop") await stop();
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e.name === "NotAllowedError" ? "Microphone access not granted. Open the extension options and click “Grant microphone”." : e.message });
    }
  })();
  return true;
});
