"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  return (
    <form className="flex gap-2" onSubmit={async (e) => {
      e.preventDefault(); setError("");
      const res = await fetch("/api/admin/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Failed");
      setEmail(""); router.refresh();
    }}>
      <input className="input max-w-xs" type="email" required placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn btn-primary">Invite</button>
      {error && <span className="self-center text-sm text-red-600">{error}</span>}
    </form>
  );
}
