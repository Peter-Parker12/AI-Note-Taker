"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RenameTitle({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState("");

  async function save() {
    if (!value.trim() || value.trim() === title) return setEditing(false);
    const res = await fetch(`/api/meetings/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: value }),
    });
    if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? "Failed");
    setEditing(false); router.refresh();
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <button className="btn" onClick={() => setEditing(true)}>Rename</button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <input autoFocus className="input" value={value} maxLength={200} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} />
      <button className="btn btn-primary" onClick={save}>Save</button>
      <button className="btn" onClick={() => { setValue(title); setEditing(false); }}>Cancel</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
