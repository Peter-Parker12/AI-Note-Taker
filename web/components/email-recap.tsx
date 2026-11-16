"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** "Email recap" button with a small popover: recipients, optional note, Send. */
export function EmailRecap({ id, hasSummary, smtpReady }: { id: string; hasSummary: boolean; smtpReady: boolean }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const recipients = to.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);

  async function send() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/meetings/${id}/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: recipients, note: note.trim() || undefined }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: json.error ?? "Could not send" });
    setMsg({ ok: true, text: `Sent to ${json.sent.length} recipient${json.sent.length === 1 ? "" : "s"}.${json.rejected?.length ? ` Rejected: ${json.rejected.join(", ")}` : ""}` });
    setTo(""); setNote("");
  }

  const disabledReason = !hasSummary ? "No recap to send yet" : "";
  return (
    <div className="relative" ref={box}>
      <button className="btn" disabled={!hasSummary} title={disabledReason} aria-expanded={open} onClick={() => { setOpen((o) => !o); setMsg(null); }}>
        Email recap
      </button>
      {open && (
        <div className="card absolute left-0 top-full z-20 mt-1 w-80 max-w-[90vw] space-y-3 text-sm shadow-lg">
          {!smtpReady ? (
            <p>Email isn&apos;t set up yet. <Link className="underline" href="/settings">Add your SMTP settings</Link> in Account → Settings.</p>
          ) : (
            <>
              <label className="block space-y-1">
                <span className="font-medium">To</span>
                <input className="input" value={to} autoFocus placeholder="alice@company.com, bob@company.com" onChange={(e) => setTo(e.target.value)} />
              </label>
              <label className="block space-y-1">
                <span className="font-medium">Note <span className="muted font-normal">(optional)</span></span>
                <textarea className="input min-h-16" maxLength={2000} value={note} placeholder="Short message shown above the recap" onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="flex items-center gap-3">
                <button className="btn btn-primary" disabled={busy || !recipients.length} onClick={send}>{busy ? "Sending…" : `Send${recipients.length > 1 ? ` to ${recipients.length}` : ""}`}</button>
                {msg && <span className={msg.ok ? "text-green-600" : "text-red-600"}>{msg.text}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
