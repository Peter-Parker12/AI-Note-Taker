"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { getSettingsView } from "@/lib/settings";

type View = Awaited<ReturnType<typeof getSettingsView>>;
type KeyName = "anthropic" | "openai" | "deepgram";

const KEYS: { name: KeyName; label: string; hint: string }[] = [
  { name: "anthropic", label: "Anthropic (Claude) API key", hint: "sk-ant-…" },
  { name: "openai", label: "OpenAI API key (transcription)", hint: "sk-…" },
  { name: "deepgram", label: "Deepgram API key (transcription)", hint: "" },
];

export function SettingsForm({ view, models }: { view: View; models: string[] }) {
  const router = useRouter();
  const { settings: s, keys, defaults, smtp } = view;
  const [f, setF] = useState({
    aiInstructions: s.aiInstructions,
    recapLanguage: s.recapLanguage,
    sttProvider: s.sttProvider ?? "",
    sttLanguage: s.sttLanguage ?? "",
    claudeModel: s.claudeModel ?? "",
    smtpHost: smtp.host, smtpPort: smtp.port ? String(smtp.port) : "", smtpSecurity: smtp.security,
    smtpUser: smtp.user, smtpFromEmail: smtp.fromEmail, smtpFromName: smtp.fromName,
  });
  const [smtpPass, setSmtpPass] = useState("");
  const [clearSmtpPass, setClearSmtpPass] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [keyInput, setKeyInput] = useState<Record<KeyName, string>>({ anthropic: "", openai: "", deepgram: "" });
  const [clearKey, setClearKey] = useState<Record<KeyName, boolean>>({ anthropic: false, openai: false, deepgram: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const body: Record<string, unknown> = {
      aiInstructions: f.aiInstructions, recapLanguage: f.recapLanguage,
      sttProvider: f.sttProvider || null, sttLanguage: f.sttLanguage || null, claudeModel: f.claudeModel || null,
      smtpHost: f.smtpHost, smtpPort: f.smtpPort.trim() ? Number(f.smtpPort) : null, smtpSecurity: f.smtpSecurity,
      smtpUser: f.smtpUser, smtpFromEmail: f.smtpFromEmail, smtpFromName: f.smtpFromName,
    };
    if (clearSmtpPass) body.smtpPass = null;
    else if (smtpPass) body.smtpPass = smtpPass;
    for (const { name } of KEYS) {
      if (clearKey[name]) body[`${name}Key`] = null;
      else if (keyInput[name].trim()) body[`${name}Key`] = keyInput[name].trim();
    }
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: (await res.json().catch(() => null))?.error ?? "Save failed" });
    setKeyInput({ anthropic: "", openai: "", deepgram: "" });
    setClearKey({ anthropic: false, openai: false, deepgram: false });
    setSmtpPass(""); setClearSmtpPass(false);
    setMsg({ ok: true, text: "Saved. New recordings use these settings." });
    router.refresh();
  }

  async function sendTest() {
    setTesting(true); setTestMsg(null);
    const res = await fetch("/api/settings/smtp-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(testTo.trim() ? { to: testTo.trim() } : {}) });
    const json = await res.json().catch(() => ({}));
    setTesting(false);
    setTestMsg(res.ok ? { ok: true, text: `Test email sent to ${json.to}.` } : { ok: false, text: json.error ?? "Could not send" });
  }

  const field = "block space-y-1 text-sm";
  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold">Recap</legend>
        <label className={field}>
          <span className="font-medium">Your instructions for the AI</span>
          <textarea className="input min-h-28" maxLength={4000} value={f.aiInstructions} onChange={(e) => set("aiInstructions", e.target.value)}
            placeholder="e.g. I'm a product manager. Always list open questions separately. Use short bullet points. Flag any deadline mentioned." />
          <span className="muted">Applied to every recap generated for your account.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>
            <span className="font-medium">Recap language</span>
            <select className="input" value={f.recapLanguage} onChange={(e) => set("recapLanguage", e.target.value)}>
              <option value="auto">Match the meeting</option><option value="vi">Vietnamese</option><option value="en">English</option>
            </select>
          </label>
          <label className={field}>
            <span className="font-medium">Claude model</span>
            <select className="input" value={f.claudeModel} onChange={(e) => set("claudeModel", e.target.value)}>
              <option value="">Server default ({defaults.claudeModel})</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold">Transcription</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>
            <span className="font-medium">Provider</span>
            <select className="input" value={f.sttProvider} onChange={(e) => set("sttProvider", e.target.value)}>
              <option value="">Server default ({defaults.sttProvider})</option>
              <option value="openai">OpenAI Whisper</option><option value="deepgram">Deepgram</option><option value="local">Local Whisper (self-hosted)</option>
            </select>
          </label>
          <label className={field}>
            <span className="font-medium">Spoken language</span>
            <select className="input" value={f.sttLanguage} onChange={(e) => set("sttLanguage", e.target.value)}>
              <option value="">Server default ({defaults.sttLanguage})</option>
              <option value="auto">Auto-detect</option><option value="vi">Vietnamese</option><option value="en">English</option>
            </select>
          </label>
        </div>
        <p className="muted">For mixed Vietnamese/English, Auto-detect usually works best; fixing one language can mangle the other.</p>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold">Your own API keys <span className="muted font-normal">(optional)</span></legend>
        <p className="muted">Leave empty to use the keys configured on the server. Stored encrypted; never shown again after saving.</p>
        {KEYS.map(({ name, label, hint }) => {
          const k = keys[name];
          return (
            <div key={name} className={field}>
              <span className="font-medium">{label}</span>
              <span className="muted ml-2">
                {k.set ? `your key saved (…${k.last4})` : defaults.serverKeys[name] ? "using the server's key" : "no key configured — set one to use this provider"}
              </span>
              <div className="flex items-center gap-3">
                <input className="input" type="password" autoComplete="off" disabled={clearKey[name]} value={keyInput[name]}
                  placeholder={k.set ? "Enter a new key to replace" : hint || "Paste key"}
                  onChange={(e) => setKeyInput((p) => ({ ...p, [name]: e.target.value }))} />
                {k.set && (
                  <label className="flex items-center gap-1 whitespace-nowrap">
                    <input type="checkbox" checked={clearKey[name]} onChange={(e) => setClearKey((p) => ({ ...p, [name]: e.target.checked }))} /> Remove
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-semibold">Email (SMTP) <span className="muted font-normal">(optional)</span></legend>
        <p className="muted">
          Lets you email a recap from the meeting page, sent from your own mailbox.
          {smtp.ready ? " Email is set up." : " Not set up yet."} For Gmail use smtp.gmail.com, port 587, and an app password.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_11rem]">
          <label className={field}>
            <span className="font-medium">SMTP host</span>
            <input className="input" value={f.smtpHost} placeholder="smtp.gmail.com" autoComplete="off" onChange={(e) => set("smtpHost", e.target.value)} />
          </label>
          <label className={field}>
            <span className="font-medium">Port</span>
            <input className="input" inputMode="numeric" value={f.smtpPort} placeholder="587" onChange={(e) => set("smtpPort", e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className={field}>
            <span className="font-medium">Security</span>
            <select className="input" value={f.smtpSecurity} onChange={(e) => set("smtpSecurity", e.target.value as typeof f.smtpSecurity)}>
              <option value="auto">Auto (by port)</option><option value="ssl">SSL/TLS (465)</option><option value="starttls">STARTTLS (587)</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>
            <span className="font-medium">Username</span>
            <input className="input" value={f.smtpUser} placeholder="you@company.com" autoComplete="off" onChange={(e) => set("smtpUser", e.target.value)} />
          </label>
          <div className={field}>
            <span className="font-medium">Password</span>
            <span className="muted ml-2">{smtp.passSet ? "saved" : "not set"}</span>
            <div className="flex items-center gap-3">
              <input className="input" type="password" autoComplete="new-password" disabled={clearSmtpPass} value={smtpPass}
                placeholder={smtp.passSet ? "Enter a new password to replace" : "Password or app password"} onChange={(e) => setSmtpPass(e.target.value)} />
              {smtp.passSet && (
                <label className="flex items-center gap-1 whitespace-nowrap">
                  <input type="checkbox" checked={clearSmtpPass} onChange={(e) => setClearSmtpPass(e.target.checked)} /> Remove
                </label>
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>
            <span className="font-medium">From address</span>
            <input className="input" type="email" value={f.smtpFromEmail} placeholder="you@company.com" onChange={(e) => set("smtpFromEmail", e.target.value)} />
          </label>
          <label className={field}>
            <span className="font-medium">From name</span>
            <input className="input" value={f.smtpFromName} placeholder="Peter Tran" onChange={(e) => set("smtpFromName", e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input className="input max-w-64" type="email" value={testTo} placeholder={`Send test to… (default: ${smtp.fromEmail || "From address"})`} onChange={(e) => setTestTo(e.target.value)} />
          <button type="button" className="btn" disabled={testing || !smtp.ready} onClick={sendTest}>{testing ? "Sending…" : "Send test email"}</button>
          {testMsg && <span className={testMsg.ok ? "text-green-600" : "text-red-600"}>{testMsg.text}</span>}
        </div>
        <p className="muted">Save first: the test uses the saved settings.</p>
      </fieldset>

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
