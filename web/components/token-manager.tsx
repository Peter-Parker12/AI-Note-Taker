"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Token = { id: string; name: string; lastUsedAt: string | null; createdAt: string };

export function TokenManager({ tokens, serverUrl }: { tokens: Token[]; serverUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState("Chrome extension");
  const [fresh, setFresh] = useState("");

  async function create() {
    const res = await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (res.ok) { setFresh((await res.json()).token); router.refresh(); }
  }
  async function revoke(id: string) {
    await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card text-sm">
        <p className="font-medium">Server URL for the extension</p>
        <code className="mt-1 block break-all">{serverUrl}</code>
      </div>
      <div className="flex gap-2">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" onClick={create}>Create token</button>
      </div>
      {fresh && (
        <div className="card border-amber-500 text-sm">
          <p className="font-medium">Copy this token now — it won’t be shown again.</p>
          <code className="mt-1 block break-all">{fresh}</code>
        </div>
      )}
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-2 text-sm">
            <span>{t.name} <span className="muted">· last used {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleDateString() : "never"}</span></span>
            <button className="btn" onClick={() => revoke(t.id)}>Revoke</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
