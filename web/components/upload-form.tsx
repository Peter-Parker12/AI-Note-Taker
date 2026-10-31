"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UploadForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/meetings/upload", { method: "POST", body: new FormData(e.currentTarget) });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Upload failed");
    router.push(`/meetings/${(await res.json()).id}`);
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-wrap items-center gap-2">
      <input name="title" placeholder="Title (optional)" className="input w-48" />
      <input name="file" type="file" accept="audio/*,video/*,.webm,.m4a,.mp3,.wav" required className="text-sm" />
      <button className="btn" disabled={busy}>{busy ? "Uploading…" : "Upload recording"}</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
