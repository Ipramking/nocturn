"use client";

import { useSyncExternalStore } from "react";
import { setSoundOn, soundOn, soundOnServer, subscribeSound } from "./sound";

export function useSound() {
  return useSyncExternalStore(subscribeSound, soundOn, soundOnServer);
}

export default function SoundToggle({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const on = useSound();
  const cls =
    tone === "light"
      ? "border-rule text-ink-muted hover:border-ink-soft/40 hover:text-ink-soft aria-pressed:border-ink-soft/50 aria-pressed:text-ink-soft"
      : "border-line text-muted hover:border-phosphor/40 hover:text-phosphor aria-pressed:border-phosphor/50 aria-pressed:text-phosphor";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setSoundOn(!on)}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border px-3 text-[11px] tracking-[0.2em] uppercase transition-colors ${cls}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
        <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor" />
        {on ? (
          <>
            <path d="M10.3 5.6a3.4 3.4 0 0 1 0 4.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M12.1 3.9a5.8 5.8 0 0 1 0 8.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </>
        ) : (
          <path d="M10.5 6l3.5 4M14 6l-3.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        )}
      </svg>
      <span className="hidden sm:inline">{on ? "Sound on" : "Sound off"}</span>
      <span className="sr-only sm:hidden">Night shift sound</span>
    </button>
  );
}
