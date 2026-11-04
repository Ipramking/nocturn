"use client";

import { useState } from "react";
import type { CheckResult, Finding, Severity, ShiftReport } from "@/lib/shift/types";

const SEVERITY: Record<Severity, { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-danger/15 text-danger border-danger/40" },
  high: { label: "High", cls: "bg-danger/10 text-danger border-danger/30" },
  medium: { label: "Medium", cls: "bg-amber/10 text-amber border-amber/30" },
  low: { label: "Low", cls: "bg-phosphor/5 text-phosphor-dim border-phosphor/20" },
  info: { label: "Note", cls: "bg-white/5 text-muted border-white/10" },
};
const ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

const STATUS_DOT: Record<CheckResult["status"], string> = {
  pass: "bg-phosphor shadow-[0_0_10px_var(--color-phosphor)]",
  warn: "bg-amber",
  fail: "bg-danger shadow-[0_0_10px_var(--color-danger)]",
  error: "bg-muted",
  skipped: "bg-line",
};

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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
      className="min-h-10 shrink-0 rounded-md border border-phosphor/40 px-3 text-xs font-semibold text-phosphor transition hover:bg-phosphor hover:text-ink focus-visible:outline-2 focus-visible:outline-phosphor"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

export function ScoreRing({ score, grade, size = 132 }: { score: number; grade: string; size?: number }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "var(--color-phosphor)" : score >= 50 ? "var(--color-amber)" : "var(--color-danger)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1)", filter: `drop-shadow(0 0 8px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums" style={{ color }}>{score}</span>
        <span className="text-[11px] tracking-[0.25em] text-muted">GRADE {grade}</span>
      </div>
    </div>
  );
}

function FindingCard({ finding, prompt }: { finding: Finding; prompt?: string }) {
  const [open, setOpen] = useState(finding.severity === "critical");
  const sev = SEVERITY[finding.severity];
  return (
    <li className="panel rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold tracking-wider uppercase ${sev.cls}`}>{sev.label}</span>
        <h4 className="min-w-0 flex-1 basis-60 text-[15px] font-semibold text-text">{finding.title}</h4>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{finding.detail}</p>
      {finding.evidence && (
        <code className="mt-3 block overflow-x-auto rounded-md border border-line bg-ink/70 px-3 py-2 text-xs break-all whitespace-pre-wrap text-amber">{finding.evidence}</code>
      )}
      <p className="mt-3 text-sm leading-relaxed text-text/90">
        <span className="text-phosphor">Fix → </span>
        {finding.fix}
      </p>
      {prompt && finding.severity !== "info" && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="min-h-10 text-xs font-semibold tracking-wider text-phosphor uppercase hover:underline"
          >
            {open ? "▾" : "▸"} Paste-ready fix prompt
          </button>
          {open && (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-phosphor/20 bg-phosphor/[0.04] p-3 sm:flex-row sm:items-start">
              <p className="min-w-0 flex-1 text-[13px] leading-relaxed whitespace-pre-wrap text-text/90">{prompt}</p>
              <CopyButton text={prompt} label="Copy prompt" />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function Report({ report, shareUrl }: { report: ShiftReport; shareUrl?: string }) {
  const host = new URL(report.finalUrl).hostname;
  const findings = report.checks
    .flatMap((c) => c.findings)
    .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  const issues = findings.filter((f) => f.severity !== "info");
  const notes = findings.filter((f) => f.severity === "info");
  const when = new Date(report.finishedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const shareText = `NOCTURN worked the night shift on ${host}: ${report.score}/100 (${report.grade}). Run one on your app:`;
  const allPrompts = issues
    .map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${report.ai?.prompts[f.id] ?? f.fix}`)
    .join("\n\n");

  return (
    <article className="rise mx-auto w-full max-w-4xl">
      <header className="panel scanlines rounded-2xl p-5 sm:p-8">
        <p className="text-[11px] tracking-[0.3em] text-phosphor">MORNING REPORT · {when.toUpperCase()}</p>
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center">
          <ScoreRing score={report.score} grade={report.grade} />
          <div className="min-w-0">
            <p className="truncate text-sm text-muted">{host}</p>
            <h2 className="mt-1 font-display text-3xl leading-tight text-text sm:text-4xl">{report.ai?.headline ?? "Your Morning Report"}</h2>
            {report.ai?.summary && <p className="mt-3 text-sm leading-relaxed text-muted">{report.ai.summary}</p>}
          </div>
        </div>
        {shareUrl && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
            <CopyButton text={shareUrl} label="Copy report link" />
            <a
              className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-xs font-semibold text-text hover:border-phosphor/50"
              href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noreferrer"
            >
              Post on X
            </a>
            <a
              className="inline-flex min-h-10 items-center rounded-md border border-line px-3 text-xs font-semibold text-text hover:border-phosphor/50"
              href={`https://farcaster.xyz/~/compose?text=${encodeURIComponent(shareText)}&embeds[]=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noreferrer"
            >
              Cast on Farcaster
            </a>
            {issues.length > 1 && <CopyButton text={allPrompts} label={`Copy all ${issues.length} fix prompts`} />}
          </div>
        )}
      </header>

      <section aria-label="Checks" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {report.checks.map((c) => (
          <div key={c.check} className="panel rounded-xl p-4">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[c.status]}`} />
              <span className="truncate text-xs tracking-wide text-muted uppercase">{c.label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{c.status === "skipped" || c.status === "error" ? "—" : c.score}</p>
            <p className="mt-1 text-xs leading-snug text-muted">{c.summary}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h3 className="text-[11px] tracking-[0.3em] text-phosphor">
          {issues.length ? `WHAT NEEDS YOU · ${issues.length}` : "NOTHING NEEDS YOU"}
        </h3>
        {issues.length === 0 && <p className="mt-3 text-sm text-muted">Every check came back clean. Sleep in.</p>}
        <ul className="mt-3 flex flex-col gap-3">
          {issues.map((f) => (
            <FindingCard key={f.id} finding={f} prompt={report.ai?.prompts[f.id]} />
          ))}
        </ul>
        {notes.length > 0 && (
          <details className="mt-4 text-sm text-muted">
            <summary className="min-h-10 cursor-pointer py-2">{notes.length} note{notes.length === 1 ? "" : "s"} (no action needed)</summary>
            <ul className="mt-2 flex flex-col gap-3">
              {notes.map((f) => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </ul>
          </details>
        )}
      </section>
    </article>
  );
}
