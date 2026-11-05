"use client";

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { CheckId, CheckResult, Finding, Severity, ShiftChanges, ShiftReport } from "@/lib/shift/types";
import BadgeEmbed from "./BadgeEmbed";
import CopyButton from "./CopyButton";

const SEVERITY: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "border-brick bg-brick text-cream" },
  high: { label: "High", cls: "border-brick/50 text-brick" },
  medium: { label: "Medium", cls: "border-ochre/50 text-ochre" },
  low: { label: "Low", cls: "border-ink-soft/20 text-ink-muted" },
  info: { label: "Note", cls: "border-rule text-ink-muted" },
};
const ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

const SHORT: Record<CheckId, string> = {
  uptime: "Uptime",
  tls: "TLS",
  headers: "Headers",
  secrets: "Secrets",
  meta: "Share & SEO",
  links: "Links",
  lighthouse: "Lighthouse",
  onchain: "Onchain",
};

const STATUS: Record<CheckResult["status"], { word: string; cls: string }> = {
  pass: { word: "Clean", cls: "text-moss" },
  warn: { word: "Warn", cls: "text-ochre" },
  fail: { word: "Fail", cls: "text-brick" },
  error: { word: "No answer", cls: "text-ink-muted" },
  skipped: { word: "Skipped", cls: "text-ink-muted" },
};

const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;
const PILL = "inline-flex min-h-11 items-center rounded-full border border-ink-soft/25 px-4 text-xs font-semibold text-ink-soft transition-colors hover:bg-ink-soft hover:text-cream";

type Filter = "all" | "critical" | "high" | "medium" | `check:${CheckId}`;

const ringColor = (score: number) =>
  score >= 75 ? "var(--color-moss)" : score >= 50 ? "var(--color-ochre)" : "var(--color-brick)";

/** The shift clock lands here at sunrise (shared `nocturn-hero` layout id). */
export function ScoreRing({ score, grade, size = 156, sunrise = false }: { score: number; grade: string; size?: number; sunrise?: boolean }) {
  const reduced = useReducedMotion();
  const value = useMotionValue(reduced ? score : 0);
  const shown = useTransform(value, (v) => Math.round(v));
  useEffect(() => {
    if (reduced) {
      value.set(score);
      return;
    }
    const controls = animate(value, score, { duration: 1.4, delay: 0.3, ease: [0.2, 0.7, 0.2, 1] });
    return () => controls.stop();
  }, [score, reduced, value]);

  const r = size / 2 - 9;
  const color = ringColor(score);
  return (
    <motion.div
      layoutId="nocturn-hero"
      className="relative shrink-0 border border-rule"
      style={{ width: size, height: size, borderRadius: 999 }}
      initial={sunrise ? { backgroundColor: "rgb(11 18 32)" } : false}
      animate={{ backgroundColor: "rgb(250 246 238)" }}
      transition={{ layout: { type: "spring", stiffness: 120, damping: 20 }, backgroundColor: { duration: 0.8 } }}
    >
      <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-rule)" strokeWidth="5" />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            initial={{ pathLength: reduced ? score / 100 : 0 }}
            animate={{ pathLength: score / 100 }}
            transition={{ duration: 1.4, delay: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span className="font-display text-6xl leading-none tabular-nums" style={{ color }}>
            {shown}
          </motion.span>
          <span className="eyebrow mt-1 text-[10px] text-ink-muted">Grade {grade}</span>
        </div>
      </motion.div>
      <span className="sr-only">
        Score {score} out of 100, grade {grade}
      </span>
    </motion.div>
  );
}

function SevTag({ severity }: { severity: Severity }) {
  const sev = SEVERITY[severity];
  return <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.16em] uppercase ${sev.cls}`}>{sev.label}</span>;
}

function FindingCard({ finding, prompt, index, defaultOpen = false }: { finding: Finding; prompt?: string; index: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = useId();
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ layout: SPRING, opacity: { duration: 0.25 } }}
      style={{ borderRadius: 22 }}
      className={`overflow-hidden border bg-paper transition-[border-color,box-shadow] ${
        open ? "border-ink-soft/35 shadow-[0_22px_48px_-30px_rgb(28_25_20/0.55)]" : "border-rule hover:border-ink-soft/25"
      }`}
    >
      <motion.button
        layout="position"
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-start gap-4 p-4 text-left sm:gap-6 sm:p-6"
      >
        <span className="w-7 shrink-0 font-display text-2xl leading-none text-ink-muted tabular-nums sm:w-9 sm:text-3xl">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <SevTag severity={finding.severity} />
            <span className="eyebrow text-[10px] text-ink-muted">{SHORT[finding.check]}</span>
          </span>
          <span className="mt-2 block font-display text-xl leading-snug text-ink-soft sm:text-2xl">{finding.title}</span>
          {!open && <span className="mt-1 line-clamp-1 block text-sm text-ink-muted">{finding.detail}</span>}
        </span>
        <span
          aria-hidden
          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rule text-lg leading-none text-ink-soft transition-transform duration-300 motion-reduce:transition-none ${
            open ? "rotate-45" : ""
          }`}
        >
          +
        </span>
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panel}
            layout="position"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.08, duration: 0.3 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="px-4 pb-5 sm:px-6 sm:pb-6 sm:pl-[5.25rem]"
          >
            <p className="text-sm leading-relaxed text-ink-muted">{finding.detail}</p>
            {finding.evidence && (
              <code className="mt-3 block rounded-xl border border-rule bg-cream px-3 py-2 text-xs break-all whitespace-pre-wrap text-ochre">
                {finding.evidence}
              </code>
            )}
            <div className="mt-4 border-l-2 border-moss pl-3">
              <p className="eyebrow text-[10px] text-moss">The fix</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{finding.fix}</p>
            </div>
            {prompt && finding.severity !== "info" && (
              <div className="mt-4 rounded-2xl bg-ink p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="eyebrow text-[10px] text-phosphor">Paste-ready fix prompt</p>
                  <CopyButton text={prompt} label="Copy prompt" />
                </div>
                <p className="mt-3 text-[13px] leading-relaxed whitespace-pre-wrap text-text/90">{prompt}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function Changes({ changes }: { changes: ShiftChanges }) {
  const d = changes.scoreDelta;
  const chip = d > 0 ? "bg-moss text-cream" : d < 0 ? "bg-brick text-cream" : "bg-rule text-ink-soft";
  const delta = d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "±0";
  const since = new Date(changes.previousAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section aria-labelledby="changes-h" className="mt-12 rounded-[28px] border border-rule bg-paper/80 p-5 sm:p-7">
      <h2 id="changes-h" className="eyebrow text-ink-muted">
        What changed overnight
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className={`rounded-full px-4 py-1 font-display text-3xl leading-tight tabular-nums ${chip}`}>{delta}</span>
        <p className="text-sm text-ink-muted">
          vs{" "}
          <a href={`/r/${changes.previousId}`} className="font-semibold text-ink-soft underline decoration-rule underline-offset-4 hover:decoration-ink-soft">
            {changes.previousScore}/100
          </a>{" "}
          on <span suppressHydrationWarning>{since}</span>
        </p>
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="eyebrow text-[10px] text-brick">New · {changes.added.length}</h3>
          {changes.added.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Nothing new broke.</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-rule">
              {changes.added.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <SevTag severity={f.severity} />
                  <span className="min-w-0 flex-1 basis-48 text-sm text-ink-soft">{f.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="eyebrow text-[10px] text-moss">Fixed · {changes.resolved.length}</h3>
          {changes.resolved.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Nothing fixed since then.</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-rule">
              {changes.resolved.map((f) => (
                <li key={f.id} className="flex items-start gap-2 py-2.5 text-sm text-ink-muted">
                  <span aria-hidden className="text-moss">✓</span>
                  <span className="min-w-0 line-through decoration-moss/60">{f.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Report({
  report,
  shareUrl,
  extras,
  sunrise = false,
}: {
  report: ShiftReport;
  shareUrl?: string;
  /** Rendered in its own section after the findings (the Night Engineer chat). */
  extras?: ReactNode;
  /** Arriving from the live shift: the clock morphs into the score ring. */
  sunrise?: boolean;
}) {
  const reduced = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("all");
  const host = new URL(report.finalUrl).hostname;
  const origin = shareUrl ? new URL(shareUrl).origin : "";
  const findings = report.checks
    .flatMap((c) => c.findings)
    .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  const issues = findings.filter((f) => f.severity !== "info");
  const notes = findings.filter((f) => f.severity === "info");
  const when = new Date(report.finishedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const secs = Math.max(1, Math.round((Date.parse(report.finishedAt) - Date.parse(report.startedAt)) / 1000));
  const clean = report.checks.filter((c) => c.status === "pass").length;
  const shareText = `NOCTURN worked the night shift on ${host}: ${report.score}/100 (${report.grade}). Run one on your app:`;
  const allPrompts = issues
    .map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${report.ai?.prompts[f.id] ?? f.fix}`)
    .join("\n\n");

  const filters: Array<{ key: Filter; label: string; count: number }> = [{ key: "all", label: "All", count: issues.length }];
  for (const s of ["critical", "high", "medium"] as const) {
    const count = issues.filter((f) => f.severity === s).length;
    if (count) filters.push({ key: s, label: SEVERITY[s].label, count });
  }
  for (const c of report.checks) {
    const count = issues.filter((f) => f.check === c.check).length;
    if (count) filters.push({ key: `check:${c.check}`, label: SHORT[c.check], count });
  }
  const visible = issues.filter((f) =>
    filter === "all" ? true : filter.startsWith("check:") ? `check:${f.check}` === filter : f.severity === filter,
  );

  const focusCheck = (check: CheckId) => {
    setFilter(`check:${check}`);
    document.getElementById("findings")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  const stagger = (i: number) => ({
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: (sunrise ? 0.45 : 0.1) + i * 0.08, duration: 0.6, ease: [0.2, 0.7, 0.2, 1] as const },
  });

  return (
    <article className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[28px] bg-cream/[0.97] p-5 text-ink-soft shadow-[0_40px_120px_-40px_rgb(0_0_0/0.7)] ring-1 ring-black/5 sm:p-10">
      <header className="relative pt-4 sm:pt-8">
        {/* Ghosted masthead behind the header. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-2 overflow-hidden select-none sm:-top-6">
          <motion.p
            className="font-display text-[clamp(4.5rem,17vw,15rem)] leading-[0.9] whitespace-nowrap text-ink-soft/[0.07] italic"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.4, ease: [0.2, 0.7, 0.2, 1] }}
          >
            Good morning.
          </motion.p>
        </div>

        <motion.p {...stagger(0)} className="eyebrow relative text-ink-muted">
          Morning report · <span suppressHydrationWarning>{when}</span>
        </motion.p>
        <div className="relative mt-6 flex flex-col gap-6 sm:mt-10 sm:flex-row sm:items-center sm:gap-10">
          <ScoreRing score={report.score} grade={report.grade} sunrise={sunrise} />
          <motion.div {...stagger(1)} className="min-w-0">
            <p className="eyebrow text-[10px] text-ink-muted">
              <span className="text-ink-soft">{host}</span> · {report.checks.length} checks · {secs}s on shift
            </p>
            <h1 className="mt-2 font-display text-4xl leading-[1.02] text-ink-soft sm:text-6xl">{report.ai?.headline ?? "Your Morning Report"}</h1>
            {report.ai?.summary && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">{report.ai.summary}</p>}
          </motion.div>
        </div>
        {shareUrl && (
          <motion.div {...stagger(2)} className="relative mt-8 flex flex-wrap gap-2 border-t border-rule pt-5">
            <CopyButton text={shareUrl} label="Copy report link" tone="solid" />
            <a
              className={PILL}
              href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noreferrer"
            >
              Post on X
            </a>
            <a
              className={PILL}
              href={`https://farcaster.xyz/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noreferrer"
            >
              Cast on Farcaster
            </a>
            {issues.length > 1 && <CopyButton text={allPrompts} label={`Copy all ${issues.length} fix prompts`} tone="light" />}
          </motion.div>
        )}
      </header>

      {report.changes && (
        <motion.div {...stagger(3)}>
          <Changes changes={report.changes} />
        </motion.div>
      )}

      <motion.section {...stagger(4)} aria-labelledby="checks-h" className="mt-12">
        <div className="flex items-end justify-between gap-3 border-b border-ink-soft pb-3">
          <h2 id="checks-h" className="eyebrow">
            The checks · {report.checks.length}
          </h2>
          <p className="eyebrow text-[10px] text-ink-muted">{clean} clean</p>
        </div>
        <ul className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
          {report.checks.map((c, i) => {
            const count = issues.filter((f) => f.check === c.check).length;
            const st = STATUS[c.status];
            const body = (
              <>
                <span className="eyebrow block text-[10px] text-ink-muted">
                  {String(i + 1).padStart(2, "0")} · {SHORT[c.check]}
                </span>
                <span className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-5xl leading-none tabular-nums">{c.status === "skipped" || c.status === "error" ? "—" : c.score}</span>
                  <span className={`eyebrow text-[10px] ${st.cls}`}>{st.word}</span>
                </span>
                <span className="mt-2 line-clamp-3 block text-xs leading-snug text-ink-muted">{c.summary}</span>
                {count > 0 && (
                  <span className="mt-3 block text-[11px] font-semibold text-ink-soft underline-offset-4 group-hover:underline">
                    {count} issue{count === 1 ? "" : "s"} →
                  </span>
                )}
              </>
            );
            return (
              <li key={c.check} className="bg-cream">
                {count > 0 ? (
                  <button
                    type="button"
                    onClick={() => focusCheck(c.check)}
                    className="group block h-full min-h-11 w-full p-4 text-left transition-colors hover:bg-paper sm:p-5"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="h-full p-4 sm:p-5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </motion.section>

      <motion.section {...stagger(5)} id="findings" aria-labelledby="findings-h" className="mt-12 scroll-mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-soft pb-3">
          <h2 id="findings-h" className="eyebrow">
            {issues.length ? `What needs you · ${issues.length}` : "Nothing needs you"}
          </h2>
          {issues.length > 0 && filter !== "all" && <p className="eyebrow text-[10px] text-ink-muted">Showing {visible.length}</p>}
        </div>
        {issues.length === 0 && <p className="mt-4 font-display text-2xl text-ink-muted italic">Every check came back clean. Sleep in.</p>}
        {issues.length > 0 && (
          <div role="toolbar" aria-label="Filter findings" className="mt-5 flex flex-wrap gap-2">
            {filters.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={`relative inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-colors ${
                    active ? "border-ink-soft text-cream" : "border-ink-soft/20 text-ink-soft hover:border-ink-soft/50"
                  }`}
                >
                  {active && <motion.span layoutId="filter-pill" className="absolute inset-0 rounded-full bg-ink-soft" transition={SPRING} />}
                  <span className="relative">{f.label}</span>
                  <span className="relative tabular-nums opacity-70">{f.count}</span>
                </button>
              );
            })}
          </div>
        )}
        <ul className="relative mt-5 flex flex-col gap-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {visible.map((f, i) => (
              <FindingCard key={f.id} finding={f} index={i} prompt={report.ai?.prompts[f.id]} defaultOpen={i === 0 && filter === "all"} />
            ))}
          </AnimatePresence>
        </ul>
        {notes.length > 0 && (
          <details className="mt-6">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm text-ink-muted hover:text-ink-soft">
              {notes.length} note{notes.length === 1 ? "" : "s"} (no action needed)
            </summary>
            <ul className="mt-2 flex flex-col gap-3">
              {notes.map((f, i) => (
                <FindingCard key={f.id} finding={f} index={i} />
              ))}
            </ul>
          </details>
        )}
      </motion.section>

      {extras && <section className="mt-12">{extras}</section>}

      {origin && (
        <section aria-label="Badge" className="mt-12">
          <BadgeEmbed origin={origin} host={host} tone="light" />
        </section>
      )}
    </article>
  );
}
