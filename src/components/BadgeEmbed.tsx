"use client";

import CopyButton from "./CopyButton";

// README badge that links back to a fresh shift on the same host.
export const badgeMarkdown = (origin: string, host: string) =>
  `[![Watched by NOCTURN](${origin}/badge/${host})](${origin}/?url=${encodeURIComponent(host)})`;

export default function BadgeEmbed({ origin, host, tone = "dark" }: { origin: string; host: string; tone?: "dark" | "light" }) {
  const md = badgeMarkdown(origin, host);
  const light = tone === "light";
  return (
    <div className={light ? "rounded-2xl border border-rule bg-paper p-5 sm:p-6" : "panel rounded-2xl p-5 sm:p-7"}>
      <p className={`eyebrow ${light ? "text-ink-muted" : "text-phosphor"}`}>Put it in your README</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- live SVG from our own route */}
        <img src={`/badge/${host}`} alt={`NOCTURN night shift badge for ${host}`} height={24} className="h-6 w-auto" />
        <span className={`text-xs ${light ? "text-ink-muted" : "text-muted"}`}>Updates after every shift.</span>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <code
          className={`min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed break-all ${
            light ? "border-rule bg-cream text-ink-soft" : "border-line bg-ink/70 text-text/85"
          }`}
        >
          {md}
        </code>
        <CopyButton text={md} label="Copy badge" tone={light ? "light" : "dark"} />
      </div>
    </div>
  );
}
