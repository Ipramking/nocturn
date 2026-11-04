"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckId, CheckResult, ShiftEvent, ShiftReport } from "@/lib/shift/types";
import { MotionConfig, motion } from "motion/react";
import CheckDeck from "./CheckDeck";
import NightBoard from "./NightBoard";
import NightEngineer from "./NightEngineer";
import Report from "./Report";
import SoundToggle from "./SoundToggle";
import { chime, startHum, stopHum, tick, unlockSound } from "./sound";
import Sky from "./Sky";
import Skyline from "./Skyline";
import WatchPanel from "./WatchPanel";

const CHECKS: Array<{ id: CheckId; label: string; hint: string }> = [
  { id: "uptime", label: "Uptime & latency", hint: "Is it up, and how fast does it answer?" },
  { id: "tls", label: "TLS & HTTPS", hint: "Valid certificate, forced HTTPS" },
  { id: "headers", label: "Security headers", hint: "CSP, HSTS, clickjacking, cookies" },
  { id: "secrets", label: "Leaked secrets", hint: "API keys shipped in your JS bundles" },
  { id: "meta", label: "Share & SEO", hint: "Share cards, viewport, title, favicon" },
  { id: "links", label: "Broken links", hint: "Internal pages that 404 or crash" },
  { id: "onchain", label: "Onchain (Base)", hint: "Contracts your app talks to, leaked RPC keys" },
  { id: "lighthouse", label: "Lighthouse", hint: "Real mobile performance + accessibility" },
];

// The time-lapse never finishes faster than this, so the night is felt, not skipped.
const MIN_NIGHT_MS = 15_000;

type Phase = "idle" | "running" | "dawn" | "morning" | "error";
interface Line {
  at: string;
  text: string;
  level: "info" | "warn" | "error";
}

const clockAt = (p: number) => {
  const minutes = Math.round(22 * 60 + p * 8 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

export default function Nocturn({ initialUrl = "" }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [results, setResults] = useState<Partial<Record<CheckId, CheckResult>>>({});
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [progress, setProgress] = useState(0);
  const [host, setHost] = useState("");
  const [skip, setSkip] = useState(false);
  const startedAt = useRef(0);
  const progressRef = useRef(0);
  const terminal = useRef<HTMLDivElement>(null);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const doneCount = Object.keys(results).length;

  // Night clock: advances with real time, but never ahead of the work.
  useEffect(() => {
    if (phase !== "running") return;
    const tick = setInterval(() => {
      const time = Math.min(0.9, (Date.now() - startedAt.current) / MIN_NIGHT_MS);
      const work = (doneCount / CHECKS.length) * 0.9;
      setProgress((p) => Math.max(p, Math.min(time, work + 0.12)));
    }, 120);
    return () => clearInterval(tick);
  }, [phase, doneCount]);

  // Sunrise once the report is in and the night has had its minimum length.
  useEffect(() => {
    if (phase !== "running" || !report) return;
    const wait = skip ? 0 : Math.max(0, MIN_NIGHT_MS - (Date.now() - startedAt.current));
    const t = setTimeout(() => {
      setProgress(1);
      setPhase("dawn");
      stopHum();
      chime();
      window.history.replaceState(null, "", `/r/${report.id}`);
      setTimeout(() => setPhase("morning"), 2200);
    }, wait);
    return () => clearTimeout(t);
  }, [phase, report, skip]);

  useEffect(() => {
    terminal.current?.scrollTo({ top: terminal.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const say = useCallback((text: string, level: Line["level"] = "info") => {
    setLines((l) => [...l.slice(-80), { at: clockAt(progressRef.current), text, level }]);
  }, []);

  const clockIn = async (e?: React.FormEvent, target = url) => {
    e?.preventDefault();
    if (!target.trim()) return;
    setError("");
    setLines([]);
    setResults({});
    setReport(null);
    setProgress(0);
    setSkip(false);
    unlockSound();
    startHum();
    startedAt.current = Date.now();
    setPhase("running");

    try {
      const res = await fetch("/api/shift", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "The night shift couldn't start");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.trim()) continue;
          const event = JSON.parse(part) as ShiftEvent;
          if (event.type === "start") {
            setHost(new URL(event.url).hostname);
            say(`Clocked in. Taking over ${new URL(event.url).hostname} for the night.`);
          } else if (event.type === "log") say(event.line, event.level);
          else if (event.type === "check") {
            setResults((r) => ({ ...r, [event.result.check]: event.result }));
            tick(event.result.status);
            const r = event.result;
            say(`${r.label}: ${r.summary}`, r.status === "fail" ? "error" : r.status === "warn" ? "warn" : "info");
          } else if (event.type === "done") {
            say("Shift complete. Morning Report is on your desk.");
            setReport(event.report);
          } else if (event.type === "error") throw new Error(event.message);
        }
      }
    } catch (err) {
      setError((err as Error).message);
      stopHum();
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("idle");
    setReport(null);
    setProgress(0);
    window.history.replaceState(null, "", "/");
  };

  const dawn = phase === "dawn" || phase === "morning" ? 1 : 0;
  const lit = phase === "idle" || phase === "error" ? 0.38 : 0.38 + (doneCount / CHECKS.length) * 0.55;

  return (
    <MotionConfig reducedMotion="user">
    <main className="relative min-h-dvh px-4 pb-[28vh] sm:px-6">
      <Sky progress={phase === "idle" ? 0.18 : progress} dawn={dawn} />
      <Skyline lit={lit} dawn={dawn} />

      <nav className="mx-auto flex max-w-5xl items-center justify-between py-5">
        <button onClick={reset} className="min-h-10 text-sm font-bold tracking-[0.35em] text-phosphor glow">NOCTURN</button>
        <span className="flex items-center gap-3">
          <span className="hidden text-[11px] tracking-[0.25em] text-muted sm:inline">VIBEATHON 02 · NIGHT SHIFT</span>
          <SoundToggle />
        </span>
      </nav>

      {(phase === "idle" || phase === "error") && (
        <section className="rise mx-auto flex max-w-3xl flex-col items-center pt-[8vh] text-center">
          <p className="text-[11px] tracking-[0.22em] text-phosphor sm:tracking-[0.35em]">THE NIGHT SHIFT FOR YOUR VIBECODED APP</p>
          <h1 className="mt-5 font-display text-5xl leading-[1.02] text-text sm:text-7xl">
            You ship. You sleep.
            <br />
            <em className="text-phosphor glow">We work the night.</em>
          </h1>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Paste your live URL. NOCTURN checks for leaked API keys, broken production, weak security headers and slow pages, then
            hands you a Morning Report with fixes you can paste straight into your AI.
          </p>
          <form onSubmit={clockIn} className="panel mt-9 flex w-full max-w-xl flex-col gap-2 rounded-2xl p-2 sm:flex-row">
            <label htmlFor="url" className="sr-only">Your app&apos;s live URL</label>
            <input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="your-app.vercel.app"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              className="min-h-12 min-w-0 flex-1 rounded-xl bg-transparent px-4 text-base text-text placeholder:text-muted/50 focus:outline-none"
            />
            <motion.button layoutId="nocturn-hero" className="min-h-12 rounded-xl bg-phosphor px-6 text-sm font-bold tracking-wider text-ink transition-[filter] hover:brightness-110 active:scale-[.98]">
              CLOCK IN →
            </motion.button>
          </form>
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          <p className="mt-4 text-xs text-muted">Free · no wallet · no signup · read-only checks</p>
          <button
            type="button"
            onClick={() => {
              const demo = `${window.location.origin}/demo/leaky`;
              setUrl(demo);
              void clockIn(undefined, demo);
            }}
            className="mt-3 min-h-10 rounded-full border border-danger/40 px-4 text-xs text-danger transition hover:bg-danger/10"
          >
            No app handy? Try a leaky demo →
          </button>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs">
            <a href="/sample" className="inline-flex min-h-10 items-center text-phosphor underline-offset-4 hover:underline">See a sample Morning Report →</a>
            <span className="inline-flex items-center gap-2 text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badge/nocturn-fawn.vercel.app" alt="NOCTURN&apos;s own latest night shift score" height={24} className="h-6 w-auto" />
              NOCTURN runs its own night shift
            </span>
          </div>

          <div className="mt-14 w-full">
            <CheckDeck checks={CHECKS} mode="idle" />
          </div>

          <div className="mt-12 w-full text-left">
            <NightBoard />
          </div>
        </section>
      )}

      {(phase === "running" || phase === "dawn") && (
        <section className="mx-auto max-w-5xl pt-[4vh]" aria-live="polite">
          <div className="text-center">
            <p className="text-[11px] tracking-[0.35em] text-phosphor">{phase === "dawn" ? "SUNRISE" : "NIGHT SHIFT IN PROGRESS"} · {host}</p>
            <motion.div layoutId="nocturn-hero" className="mx-auto mt-3 inline-block rounded-3xl px-6">
              <p className="font-display text-7xl tabular-nums text-text glow sm:text-8xl">{clockAt(progress)}</p>
            </motion.div>
          </div>
          <div className="mt-8 flex flex-col gap-5">
            <CheckDeck checks={CHECKS} results={results} mode="shift" finished={Boolean(report)} />
            <div ref={terminal} className="panel scanlines h-72 overflow-y-auto rounded-2xl p-4 text-[13px] leading-relaxed lg:h-auto lg:max-h-[22rem]">
              {lines.map((l, i) => (
                <p key={i} className={l.level === "error" ? "text-danger" : l.level === "warn" ? "text-amber" : "text-text/85"}>
                  <span className="text-phosphor-dim">[{l.at}]</span> {l.text}
                </p>
              ))}
              {phase === "running" && <p className="caret text-muted" />}
            </div>
          </div>
          {report && phase === "running" && (
            <div className="mt-4 text-center">
              <button onClick={() => setSkip(true)} className="min-h-10 text-xs tracking-wider text-muted underline-offset-4 hover:text-phosphor hover:underline">
                Skip to morning →
              </button>
            </div>
          )}
        </section>
      )}

      {phase === "morning" && report && (
        <section className="mx-auto flex max-w-4xl flex-col gap-5 pt-4">
          <Report report={report} sunrise shareUrl={`${window.location.origin}/r/${report.id}`} extras={<NightEngineer report={report} tone="light" />} />
          <WatchPanel url={report.finalUrl} lastShiftId={report.id} />
          <button onClick={reset} className="mx-auto min-h-11 text-sm text-muted hover:text-phosphor">
            ← Run another shift
          </button>
        </section>
      )}
    </main>
    </MotionConfig>
  );
}
