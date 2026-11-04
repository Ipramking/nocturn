"use client";

import { useState } from "react";

const TONES = {
  dark: "border-phosphor/40 text-phosphor hover:bg-phosphor hover:text-ink",
  light: "border-ink-soft/25 text-ink-soft hover:bg-ink-soft hover:text-cream",
  solid: "border-ink-soft bg-ink-soft text-cream hover:bg-ink-soft/85",
};

export default function CopyButton({
  text,
  label = "Copy",
  tone = "dark",
  className = "",
}: {
  text: string;
  label?: string;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked; the text stays visible to copy by hand */
        }
      }}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-4 text-xs font-semibold transition-colors ${TONES[tone]} ${className}`}
    >
      <span aria-live="polite">{done ? "Copied ✓" : label}</span>
    </button>
  );
}
