"use client";
import { signOut } from "next-auth/react";
import { useState } from "react";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) return setError("New passwords don't match");
    setBusy(true);
    const res = await fetch("/api/account/password", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }),
    });
    if (!res.ok) { setBusy(false); return setError((await res.json().catch(() => null))?.error ?? "Failed"); }
    // The server invalidated all sessions, including this one: sign in again with the new password.
    await signOut({ redirectTo: "/login" });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-2">
      <input className="input" type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      <input className="input" type="password" autoComplete="new-password" placeholder="New password (min 10 characters)" value={next} onChange={(e) => setNext(e.target.value)} required />
      <input className="input" type="password" autoComplete="new-password" placeholder="Repeat new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>{busy ? "Changing…" : "Change password"}</button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
      <p className="muted">You’ll be signed out everywhere and asked to sign in again.</p>
    </form>
  );
}
