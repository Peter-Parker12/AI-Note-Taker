const $ = (id) => document.getElementById(id);
const send = (m) => chrome.runtime.sendMessage({ target: "background", ...m });
let timer;

function msg(text, err) { $("msg").textContent = text || ""; $("msg").className = err ? "err" : ""; }

async function render() {
  const { state } = await send({ type: "status" });
  $("idle").hidden = state.recording;
  $("active").hidden = !state.recording;
  clearInterval(timer);
  if (state.recording) {
    const tick = () => { const s = Math.floor((Date.now() - state.startedAt) / 1000); $("elapsed").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    tick(); timer = setInterval(tick, 1000);
  } else if (state.error) msg(state.error, true);
}

$("start").onclick = async () => {
  msg("Starting…");
  $("start").disabled = true;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await send({ type: "start", tabId: tab.id, title: $("title").value.trim() });
  $("start").disabled = false;
  if (!res.ok) return msg(res.error, true);
  msg(""); render();
};

$("stop").onclick = async () => {
  $("stop").disabled = true;
  msg("Uploading the last chunks…");
  const res = await send({ type: "stop" });
  $("stop").disabled = false;
  if (!res.ok) return msg(res.error, true);
  const { serverUrl } = await chrome.storage.local.get("serverUrl");
  msg("");
  $("msg").innerHTML = `Done. <a target="_blank" href="${serverUrl.replace(/\/+$/, "")}/meetings/${res.meetingId}">Open the recap</a>`;
  render();
};

render();
