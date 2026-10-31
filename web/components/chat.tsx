"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

export function Chat({ meetingId }: { meetingId?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: input.trim() }];
    setMessages(next); setInput(""); setBusy(true);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, messages: next }),
    });
    const json = await res.json().catch(() => ({}));
    setMessages([...next, { role: "assistant", content: res.ok ? json.answer : `Error: ${json.error ?? res.status}` }]);
    setBusy(false);
  }

  return (
    <div className="card space-y-3">
      {messages.map((m, i) => (
        <div key={i} className={m.role === "user" ? "text-right" : ""}>
          <div className={`inline-block max-w-full rounded-lg px-3 py-2 text-left text-sm ${m.role === "user" ? "bg-neutral-100 dark:bg-neutral-800" : ""}`}>
            {m.role === "assistant" ? <div className="prose-sm [&_li]:ml-4 [&_li]:list-disc [&_p]:my-1"><ReactMarkdown>{m.content}</ReactMarkdown></div> : m.content}
          </div>
        </div>
      ))}
      {busy && <p className="muted">Thinking…</p>}
      <form onSubmit={send} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} className="input"
          placeholder={meetingId ? "Ask about this meeting…" : "e.g. What did we decide about pricing last week?"} />
        <button className="btn btn-primary" disabled={busy}>Ask</button>
      </form>
    </div>
  );
}
