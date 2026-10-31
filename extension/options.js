const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["serverUrl", "token"]).then(({ serverUrl, token }) => {
  $("serverUrl").value = serverUrl || "";
  $("token").value = token || "";
});

$("save").onclick = async () => {
  let url;
  try { url = new URL($("serverUrl").value.trim()); } catch { return ($("msg").textContent = "Enter a valid URL."); }
  // Ask for access to just this server (a user gesture is required).
  const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
  if (!granted) return ($("msg").textContent = "Permission to reach the server was denied.");
  await chrome.storage.local.set({ serverUrl: url.origin, token: $("token").value.trim() });
  $("msg").textContent = "Saved.";
};

$("mic").onclick = async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    $("msg").textContent = "Microphone access granted.";
  } catch (e) {
    $("msg").textContent = `Microphone access failed: ${e.message}`;
  }
};
