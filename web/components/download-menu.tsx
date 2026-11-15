"use client";
import { useEffect, useRef, useState } from "react";

type Item = { label: string; href: string; enabled: boolean };

// One icon button that opens a menu of every download for a meeting.
export function DownloadMenu({ id, hasAudio, hasTranscript, hasSummary, icon = "download" }: {
  id: string; hasAudio: boolean; hasTranscript: boolean; hasSummary: boolean;
  /** "dots" is the compact "..." trigger used in table rows. */
  icon?: "download" | "dots";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && btnRef.current) {
      // Fixed positioning, so the menu is not clipped by a scrolling table wrapper.
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close);
    };
  }, [open]);

  const items: Item[] = [
    { label: "Audio", href: `/api/meetings/${id}/audio?dl=1`, enabled: hasAudio },
    { label: "Recap (.md)", href: `/api/meetings/${id}/download?format=md`, enabled: hasSummary },
    { label: "Transcript (.txt)", href: `/api/meetings/${id}/download?format=txt`, enabled: hasTranscript },
    { label: "All data (.json)", href: `/api/meetings/${id}/download?format=json`, enabled: hasTranscript || hasSummary },
  ];

  return (
    <div className="inline-block text-left" ref={ref}>
      <button ref={btnRef} className={icon === "dots" ? "rounded px-1.5 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800" : "btn"}
        aria-haspopup="menu" aria-expanded={open} aria-label="Download options" title="Download" onClick={toggle}>
        {icon === "dots" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
          </svg>
        )}
      </button>
      {open && pos && (
        <div role="menu" style={{ position: "fixed", top: pos.top, right: pos.right }} className="z-20 w-48 rounded-md border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {items.map((it) => it.enabled ? (
            <a key={it.label} role="menuitem" href={it.href} onClick={() => setOpen(false)}
              className="block px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800">{it.label}</a>
          ) : (
            <span key={it.label} role="menuitem" aria-disabled className="block cursor-not-allowed px-3 py-1.5 opacity-40">{it.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
