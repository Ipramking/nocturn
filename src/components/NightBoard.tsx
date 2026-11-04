"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { BoardShift, BoardTotals } from "@/lib/store";

type Tone = "dark" | "light";
interface Board {
  shifts: BoardShift[];
  totals: BoardTotals;
}

const POLL_MS = 30_000;
const COUNT_MS = 900;

const TONES = {
  dark: {
    shell: "panel text-text",
    eyebrow: "text-phosphor",
    dot: "bg-phosphor",
    number: "text-text",
    muted: "text-muted",
    line: "border-line",
    row: "text-text/90",
    fresh: "bg-phosphor/10",
    good: "text-phosphor",
    warn: "text-amber",
    bad: "text-danger",
    skeleton: "bg-line",
  },
  light: {
    shell: "border border-ink/10 bg-[color:var(--color-paper,#f7f1e6)] text-ink",
    eyebrow: "text-[color:color-mix(in_oklab,var(--color-phosphor-dim)_70%,black)]",
    dot: "bg-phosphor-dim",
    number: "text-ink",
    muted: "text-ink/60",
    line: "border-ink/10",
    row: "text-ink/85",
    fresh: "bg-ink/[0.06]",
    good: "text-[color:color-mix(in_oklab,var(--color-phosphor-dim)_70%,black)]",
    warn: "text-[color:color-mix(in_oklab,var(--color-amber)_45%,black)]",
    bad: "text-[color:color-mix(in_oklab,var(--color-danger)_60%,black)]",
    skeleton: "bg-ink/10",
  },
} satisfies Record<Tone, Record<string, string>>;

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const useReducedMotion = () =>
  useSyncExternalStore(subscribeMotion, () => window.matchMedia(MOTION_QUERY).matches, () => false);

function CountUp({ value, reduced, className }: { value: number; reduced: boolean; className: string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const origin = from.current;
    let raf = requestAnimationFrame(function tick(now) {
      const p = Math.min(1, (now - start) / COUNT_MS);
      const v = Math.round(origin + (value - origin) * (1 - (1 - p) ** 3));
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return (
    <>
      <span aria-hidden="true" className={`text-2xl font-bold tabular-nums sm:text-3xl ${className}`}>
        {(reduced ? value : shown).toLocaleString()}
      </span>
      <span className="sr-only">{value.toLocaleString()}</span>
    </>
  );
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Rows carry no id by design; build stable keys from their content.
function rowKeys(shifts: BoardShift[]) {
  const seen = new Map<string, number>();
  return shifts.map((s) => {
    const base = `${s.at}|${s.hostKind}|${s.score}|${s.issues}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}|${n}`;
  });
}

export default function NightBoard({ tone = "dark", limit = 12 }: { tone?: Tone; limit?: number }) {
  const t = TONES[tone];
  const ids = useId();
  const reduced = useReducedMotion();
  const [board, setBoard] = useState<Board | null>(null);
  const [offline, setOffline] = useState(false);
  const [fresh, setFresh] = useState(0);
  const [announce, setAnnounce] = useState("");
  const lastTotal = useRef<number | null>(null);

  useEffect(() => {
    let ctrl: AbortController | null = null;
    let freshTimer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (document.hidden) return;
      ctrl?.abort();
      const mine = new AbortController();
      ctrl = mine;
      try {
        const res = await fetch(`/api/board?limit=${limit}`, { signal: mine.signal });
        if (!res.ok) throw new Error("board offline");
        const next = (await res.json()) as Board;
        // Announce only new arrivals, once per poll, never the first load.
        const added = lastTotal.current === null ? 0 : Math.max(0, next.totals.shifts - lastTotal.current);
        lastTotal.current = next.totals.shifts;
        if (added) {
          setAnnounce(`${plural(added, "new shift")} clocked in.`);
          setFresh(Math.min(added, next.shifts.length));
          clearTimeout(freshTimer);
          freshTimer = setTimeout(() => setFresh(0), 2500);
        }
        setBoard(next);
        setOffline(false);
      } catch {
        if (!mine.signal.aborted) setOffline(true);
      }
    };
    load();
    const poll = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(poll);
      clearTimeout(freshTimer);
      document.removeEventListener("visibilitychange", onVisible);
      ctrl?.abort();
    };
  }, [limit]);

  const scoreCls = (s: number) => (s >= 75 ? t.good : s >= 50 ? t.warn : t.bad);
  const keys = board ? rowKeys(board.shifts) : [];

  return (
    <section aria-labelledby={`${ids}-title`} className={`rounded-2xl p-4 sm:p-6 ${t.shell}`}>
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          {!offline && <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping ${t.dot}`} />}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${offline ? "bg-muted" : t.dot}`} />
        </span>
        <h3 id={`${ids}-title`} className={`text-[11px] tracking-[0.3em] ${t.eyebrow}`}>
          LIVE NIGHT BOARD
        </h3>
        {offline && board && <span className={`ml-auto text-[11px] ${t.muted}`}>reconnecting…</span>}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
        {(
          [
            ["Shifts worked", board?.totals.shifts],
            ["On night watch", board?.totals.watches],
            ["Leaks caught", board?.totals.leaksCaught],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col-reverse">
            <dt className={`mt-1 text-[10px] leading-tight tracking-[0.15em] uppercase sm:text-[11px] ${t.muted}`}>{label}</dt>
            <dd className="min-h-8">
              {value === undefined ? (
                <span className={`block h-7 w-12 rounded motion-safe:animate-pulse ${t.skeleton}`} aria-hidden="true" />
              ) : (
                <CountUp value={value} reduced={reduced} className={t.number} />
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className={`mt-4 border-t pt-3 ${t.line}`}>
        {!board && !offline && (
          <div className="flex flex-col gap-2 py-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`h-4 rounded motion-safe:animate-pulse ${t.skeleton}`} style={{ width: `${88 - i * 14}%` }} />
            ))}
          </div>
        )}
        {!board && offline && <p className={`py-1 text-sm ${t.muted}`}>The board is offline right now. It will reconnect on its own.</p>}
        {board && board.shifts.length === 0 && (
          <p className={`py-1 text-sm ${t.muted}`}>Quiet so far tonight. Run a shift and it shows up here, anonymously.</p>
        )}
        {board && board.shifts.length > 0 && (
          <ol aria-label="Recent shifts, newest first" className="flex flex-col">
            {board.shifts.map((s, i) => (
              <li
                key={keys[i]}
                className={`-mx-2 rounded px-2 py-1.5 text-xs leading-relaxed break-words motion-safe:transition-colors motion-safe:duration-1000 sm:text-[13px] ${t.row} ${i < fresh ? t.fresh : ""}`}
              >
                <time dateTime={s.at} className={`tabular-nums ${t.muted}`}>
                  {clock(s.at)}
                </time>
                <span className={t.muted}> · </span>
                {s.hostKind} clocked in
                <span className={t.muted}> · </span>
                <span className={`font-semibold tabular-nums ${scoreCls(s.score)}`}>{s.score}/100</span>
                <span className={t.muted}> · </span>
                <span className={s.leaksCaught ? `font-semibold ${t.bad}` : t.muted}>{plural(s.leaksCaught, "leak")}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
