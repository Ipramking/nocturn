"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState, useSyncExternalStore } from "react";
import type { CheckId, CheckResult, CheckStatus } from "@/lib/shift/types";
import { useMedia } from "./motion/useMedia";

export interface DeckCheck {
  id: CheckId;
  label: string;
  hint: string;
}

// Night-side status tints for the card faces.
const TINT: Record<CheckStatus, { word: string; label: string; border: string; glow: string; bg: string }> = {
  pass: { word: "text-phosphor", label: "Pass", border: "rgb(92 255 161 / 0.5)", glow: "rgb(92 255 161 / 0.45)", bg: "rgb(92 255 161 / 0.16)" },
  warn: { word: "text-amber", label: "Warn", border: "rgb(255 194 97 / 0.5)", glow: "rgb(255 194 97 / 0.4)", bg: "rgb(255 194 97 / 0.14)" },
  fail: { word: "text-danger", label: "Fail", border: "rgb(255 107 122 / 0.6)", glow: "rgb(255 107 122 / 0.5)", bg: "rgb(255 107 122 / 0.16)" },
  error: { word: "text-muted", label: "No answer", border: "var(--color-line)", glow: "transparent", bg: "rgb(127 154 140 / 0.06)" },
  skipped: { word: "text-muted", label: "Skipped", border: "var(--color-line)", glow: "transparent", bg: "rgb(127 154 140 / 0.06)" },
};

const FLIP = { type: "spring", stiffness: 120, damping: 13, mass: 0.9 } as const;
const SETTLE = { type: "spring", stiffness: 220, damping: 24 } as const;
const CARD_W = 128;
const CARD_H = 184;
const STEP = 120;

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

function Crescent() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="text-phosphor-dim">
      <path d="M9.6 1.4A5.8 5.8 0 1 0 12.6 10 4.7 4.7 0 0 1 9.6 1.4Z" fill="currentColor" />
    </svg>
  );
}

export default function CheckDeck({
  checks,
  results = {},
  mode,
  finished = false,
}: {
  checks: DeckCheck[];
  results?: Partial<Record<CheckId, CheckResult>>;
  mode: "idle" | "shift";
  /** The shift is over: anything that never reported is shown as skipped. */
  finished?: boolean;
}) {
  const hydrated = useHydrated();
  const wide = useMedia("(min-width: 1024px)");
  const fan = hydrated && wide;
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const n = checks.length;

  return (
    <ul
      aria-label={mode === "idle" ? "What the night shift checks" : "Checks"}
      data-ready={hydrated}
      className={
        fan
          ? "relative mx-auto w-full"
          : "grid grid-cols-2 gap-2.5 transition-opacity sm:grid-cols-4 sm:gap-3 lg:opacity-0 lg:data-[ready=true]:opacity-100"
      }
      style={fan ? { height: CARD_H + 92 } : undefined}
    >
      {checks.map((c, i) => {
        const r = results[c.id];
        const status: CheckStatus | null = r ? r.status : finished && mode === "shift" ? "skipped" : null;
        const landed = status !== null;
        const tint = status ? TINT[status] : null;
        const offset = i - (n - 1) / 2;
        const lifted = fan && hover === i;
        const num = String(i + 1).padStart(2, "0");
        const scoreText = r && r.status !== "skipped" && r.status !== "error" ? String(r.score) : "—";

        return (
          <motion.li
            key={c.id}
            layoutId={`deck-${c.id}`}
            transition={{ layout: { type: "spring", stiffness: 170, damping: 24, delay: (fan ? i : i % 4) * 0.03 } }}
            onHoverStart={() => setHover(i)}
            onHoverEnd={() => setHover((h) => (h === i ? null : h))}
            className={fan ? "absolute" : "relative"}
            style={
              fan
                ? {
                    left: `calc(50% - ${CARD_W / 2}px + ${offset} * min(${STEP}px, (100% - ${CARD_W}px) / ${n - 1}))`,
                    top: 34 + offset * offset * 3.4,
                    width: CARD_W,
                    height: CARD_H,
                    zIndex: lifted ? 40 : i + 1,
                  }
                : { height: 124 }
            }
          >
            <motion.div
              className="h-full w-full"
              style={{ transformPerspective: 1100 }}
              initial={false}
              animate={
                fan
                  ? { rotate: lifted ? 0 : offset * 3.2, rotateY: lifted ? 0 : -offset * 3, y: lifted ? -22 : 0, scale: lifted ? 1.05 : 1 }
                  : { rotate: 0, rotateY: 0, y: 0, scale: 1 }
              }
              transition={SETTLE}
            >
              <motion.div
                className="relative h-full w-full"
                style={reduced ? undefined : { transformStyle: "preserve-3d", transformPerspective: 900 }}
                initial={false}
                animate={reduced ? undefined : { rotateY: landed ? 180 : 0, scale: landed ? [1, 1.08, 1] : 1 }}
                transition={{ rotateY: FLIP, scale: { duration: 0.7, times: [0, 0.35, 1] } }}
              >
                {/* Back: what this check looks for, or a live sweep while it's working. */}
                <motion.div
                  aria-hidden={landed}
                  className="card-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-line p-3.5"
                  style={{ background: "linear-gradient(180deg, rgb(13 22 38 / 0.94), rgb(6 10 20 / 0.97))" }}
                  initial={false}
                  animate={reduced ? { opacity: landed ? 0 : 1 } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] tracking-[0.25em] text-phosphor-dim">{num}</span>
                    {mode === "shift" ? (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-phosphor" />
                    ) : (
                      <Crescent />
                    )}
                  </div>
                  <p className={`mt-auto text-[13px] leading-snug text-text ${fan ? "" : "line-clamp-2"}`}>{c.label}</p>
                  {mode === "idle" ? (
                    <p className={`mt-1 text-[11px] leading-snug text-muted ${fan ? "" : "line-clamp-2"}`}>{c.hint}</p>
                  ) : (
                    <p className="mt-1 text-[10px] tracking-[0.25em] text-phosphor">ON IT</p>
                  )}
                  {mode === "shift" && (
                    <span
                      aria-hidden
                      className="sweep pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-transparent via-phosphor/10 to-transparent"
                    />
                  )}
                </motion.div>

                {/* Front: the result, tinted by status. */}
                <motion.div
                  aria-hidden={!landed}
                  className="card-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl border p-3.5"
                  style={{
                    transform: reduced ? undefined : "rotateY(180deg)",
                    borderColor: tint?.border ?? "var(--color-line)",
                    background: `linear-gradient(180deg, ${tint?.bg ?? "transparent"}, rgb(6 10 20 / 0.95) 72%)`,
                    boxShadow: tint && status !== "skipped" && status !== "error" ? `0 0 28px -10px ${tint.glow}` : undefined,
                  }}
                  initial={false}
                  animate={reduced ? { opacity: landed ? 1 : 0 } : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] tracking-[0.25em] text-muted">{num}</span>
                    <span className={`truncate text-[10px] tracking-[0.2em] uppercase ${tint?.word ?? "text-muted"}`}>{tint?.label}</span>
                  </div>
                  <p className={`mt-2 text-[13px] leading-snug text-text ${fan ? "" : "line-clamp-1"}`}>{c.label}</p>
                  <p className={`mt-auto font-display leading-none tabular-nums ${fan ? "text-5xl" : "text-3xl"} ${tint?.word ?? "text-muted"}`}>
                    {scoreText}
                  </p>
                  {fan && r?.summary && <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted">{r.summary}</p>}
                </motion.div>
              </motion.div>
            </motion.div>
            <span className="sr-only">
              {c.label}: {mode === "idle" ? c.hint : status ? `${TINT[status].label}${r && scoreText !== "—" ? `, ${scoreText} of 100` : ""}` : "in progress"}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}
