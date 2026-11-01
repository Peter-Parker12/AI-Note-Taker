"use client";
import { useState } from "react";

export function ResetPasswordButton({ userId, username }: { userId: string; username: string }) {
  const [msg, setMsg] = useState("");
  return (
    <>
      <button className="btn" onClick={async () => {
        const password = prompt(`New password for ${username} (min 10 characters). They will be signed out everywhere.`);
        if (!password) return;
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
        });
        setMsg(res.ok ? "Password reset" : (await res.json().catch(() => null))?.error ?? "Failed");
      }}>Reset password</button>
      {msg && <span className="text-xs">{msg}</span>}
    </>
  );
}
