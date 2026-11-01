"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateUserForm() {
  const router = useRouter();
  const [f, setF] = useState({ username: "", name: "", password: "", role: "MEMBER" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <form className="flex flex-wrap items-start gap-2" onSubmit={async (e) => {
      e.preventDefault(); setError(""); setBusy(true);
      const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      setBusy(false);
      if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Failed");
      setF({ username: "", name: "", password: "", role: "MEMBER" }); router.refresh();
    }}>
      <input className="input w-40" placeholder="username" autoCapitalize="none" required value={f.username} onChange={(e) => set("username", e.target.value)} />
      <input className="input w-40" placeholder="Display name (optional)" value={f.name} onChange={(e) => set("name", e.target.value)} />
      <input className="input w-48" type="text" autoComplete="off" placeholder="Temporary password" required value={f.password} onChange={(e) => set("password", e.target.value)} />
      <select className="input w-auto" value={f.role} onChange={(e) => set("role", e.target.value)}>
        <option value="MEMBER">Member</option><option value="ADMIN">Admin</option>
      </select>
      <button className="btn btn-primary" disabled={busy}>Create user</button>
      {error && <span className="self-center text-sm text-red-600">{error}</span>}
    </form>
  );
}
