"use client";

import { useEffect, useId, useRef, useState } from "react";
import { checkPasteSafety, pasteBlockedMessage } from "@/lib/shift/secrets";
import type { ShiftReport } from "@/lib/shift/types";

type Tone = "dark" | "light";
interface Message {
  role: "user" | "assistant";
  content: string;
}

const MAX_CHARS = 2000;
const MAX_HISTORY = 12;
const RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;

// Light is the warm-cream "dawn" surface; accents are darkened from the same tokens to keep text contrast.
const TONES = {
  dark: {
    shell: "panel text-text",
    eyebrow: "text-phosphor",
    title: "text-text",
    body: "text-text/90",
    muted: "text-muted",
    line: "border-line",
    you: "border-phosphor/25 bg-phosphor/[0.07]",
    chip: "border-phosphor/30 text-phosphor hover:bg-phosphor/10",
    input: "border-line bg-ink/70 text-text placeholder:text-muted/60 focus:border-phosphor",
    send: "bg-phosphor text-ink hover:brightness-110",
    ghost: "border-line text-muted hover:text-text",
    inline: "bg-ink/70 text-amber",
    danger: "border-danger/40 bg-danger/10 text-danger",
    focus: "focus-visible:outline-phosphor",
  },
  light: {
    shell: "border border-ink/10 bg-[color:var(--color-paper,#f7f1e6)] text-ink",
    eyebrow: "text-[color:color-mix(in_oklab,var(--color-phosphor-dim)_70%,black)]",
    title: "text-ink",
    body: "text-ink/85",
    muted: "text-ink/60",
    line: "border-ink/10",
    you: "border-ink/10 bg-ink/[0.05]",
    chip: "border-ink/15 text-ink hover:bg-ink/5",
    input: "border-ink/15 bg-white/70 text-ink placeholder:text-ink/45 focus:border-ink/50",
    send: "bg-ink text-[color:var(--color-paper,#f7f1e6)] hover:bg-ink/85",
    ghost: "border-ink/15 text-ink/60 hover:text-ink",
    inline: "bg-ink/[0.07] text-ink",
    danger: "border-danger/50 bg-danger/10 text-[color:color-mix(in_oklab,var(--color-danger)_60%,black)]",
    focus: "focus-visible:outline-ink",
  },
} satisfies Record<Tone, Record<string, string>>;
type Theme = (typeof TONES)[Tone];

function suggestions(report: ShiftReport) {
  const top = report.checks
    .flatMap((c) => c.findings)
    .filter((f) => f.severity !== "info")
    .sort((a, b) => RANK[a.severity] - RANK[b.severity])
    .slice(0, 3);
  return top.length
    ? top.map((f) => `How do I fix: ${f.title}?`)
    : ["What did the shift check?", "How do I keep this score up?"];
}

// Fenced code splits the reply; everything else stays plain text.
function splitFences(text: string) {
  return text.split("```").flatMap((chunk, i) => {
    if (i % 2 === 0) {
      const body = chunk.replace(/\*\*(.+?)\*\*/g, "$1").trim();
      return body ? [{ code: false, lang: "", body }] : [];
    }
    const nl = chunk.indexOf("\n");
    const head = nl === -1 ? "" : chunk.slice(0, nl).trim();
    const hasLang = nl !== -1 && /^[\w#+.-]{0,20}$/.test(head);
    const body = (hasLang ? chunk.slice(nl + 1) : chunk).replace(/\s+$/, "");
    return body.trim() ? [{ code: true, lang: hasLang ? head : "", body }] : [];
  });
}

function CopyButton({ text, focus }: { text: string; focus: string }) {
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
          /* clipboard blocked; the code stays selectable */
        }
      }}
      className={`min-h-11 shrink-0 rounded-md px-3 text-xs font-semibold text-amber transition hover:bg-amber/15 focus-visible:outline-2 ${focus}`}
    >
      {done ? "Copied ✓" : "Copy"}
    </button>
  );
}

function Reply({ text, t }: { text: string; t: Theme }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {splitFences(text).map((part, i) =>
        part.code ? (
          <div key={i} className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-ink text-amber">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 pl-3">
              <span className="text-[11px] tracking-wider text-amber/70 uppercase">{part.lang || "code"}</span>
              <CopyButton text={part.body} focus={t.focus} />
            </div>
            <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
              <code>{part.body}</code>
            </pre>
          </div>
        ) : (
          <p key={i} className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${t.body}`}>
            {part.body.split(/(`[^`\n]+`)/).map((s, j) =>
              j % 2 ? (
                <code key={j} className={`rounded px-1 py-0.5 text-[0.92em] break-all ${t.inline}`}>
                  {s.slice(1, -1)}
                </code>
              ) : (
                s
              ),
            )}
          </p>
        ),
      )}
    </div>
  );
}

export default function NightEngineer({ report, tone = "dark" }: { report: ShiftReport; tone?: Tone }) {
  const t = TONES[tone];
  const ids = useId();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState("");
  const [error, setError] = useState("");
  const [announce, setAnnounce] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setError("");
    setBlocked("");
    // Checked here first so a pasted key never leaves the browser; the server checks again.
    const leaks = checkPasteSafety(content);
    if (leaks.length) {
      setDraft("");
      setBlocked(pasteBlockedMessage(leaks));
      return;
    }

    const before = messages;
    const history: Message[] = [...before, { role: "user", content }];
    setMessages(history);
    setDraft("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/engineer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shiftId: report.id, messages: history.slice(-MAX_HISTORY) }),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (ctrl.signal.aborted) return;
      if (json.blocked) {
        setMessages(before);
        setBlocked(json.message);
        return;
      }
      if (!res.ok || typeof json.reply !== "string") throw new Error(json.error ?? "The night engineer didn't answer. Try again.");
      setMessages([...history, { role: "assistant", content: json.reply }]);
      setAnnounce(`Night engineer: ${json.reply}`);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setMessages(before);
      setDraft(content);
      setError((err as Error).message || "Couldn't reach the night engineer. Try again.");
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`${ids}-title`} className={`rounded-2xl p-4 sm:p-6 ${t.shell}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className={`text-[11px] tracking-[0.3em] ${t.eyebrow}`}>ASK THE NIGHT ENGINEER</p>
          <h3 id={`${ids}-title`} className={`mt-2 font-display text-2xl leading-tight ${t.title}`}>
            Questions about this shift?
          </h3>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              setBusy(false);
              setMessages([]);
              setError("");
              setBlocked("");
            }}
            className={`min-h-11 rounded-md border px-3 text-xs font-semibold transition focus-visible:outline-2 ${t.ghost} ${t.focus}`}
          >
            Start over
          </button>
        )}
      </div>
      <p className={`mt-2 text-sm leading-relaxed ${t.muted}`}>
        Answers come from this report. Never paste API keys, passwords or seed phrases here. NOCTURN blocks them before they go anywhere.
      </p>

      {messages.length === 0 && (
        <ul aria-label="Suggested questions" className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {suggestions(report).map((q) => (
            <li key={q} className="min-w-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => send(q)}
                className={`min-h-11 w-full rounded-lg border px-3 py-2 text-left text-[13px] leading-snug break-words transition focus-visible:outline-2 disabled:opacity-60 sm:w-auto ${t.chip} ${t.focus}`}
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}

      {(messages.length > 0 || busy) && (
        <div
          ref={logRef}
          aria-label="Conversation"
          aria-busy={busy}
          className={`mt-4 flex max-h-[28rem] flex-col gap-4 overflow-y-auto border-t pt-4 ${t.line}`}
        >
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className={`ml-auto max-w-[90%] min-w-0 rounded-lg border px-3 py-2 ${t.you}`}>
                <p className={`text-[10px] tracking-[0.25em] ${t.muted}`}>YOU</p>
                <p className={`mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap ${t.title}`}>{m.content}</p>
              </div>
            ) : (
              <div key={i} className="min-w-0">
                <p className={`mb-1.5 text-[10px] tracking-[0.25em] ${t.eyebrow}`}>NIGHT ENGINEER</p>
                <Reply text={m.content} t={t} />
              </div>
            ),
          )}
          {busy && <p className={`text-sm motion-safe:animate-pulse ${t.muted}`}>Night engineer is writing…</p>}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {blocked && (
        <div role="alert" className={`mt-4 rounded-lg border px-3 py-3 text-sm leading-relaxed ${t.danger}`}>
          <p className="text-[11px] font-semibold tracking-[0.25em]">NOT SENT</p>
          <p className="mt-1 break-words">{blocked}</p>
        </div>
      )}
      {error && (
        <p role="alert" className={`mt-3 rounded-lg border px-3 py-2 text-sm ${t.danger}`}>
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <label htmlFor={`${ids}-input`} className="sr-only">
          Ask the night engineer about this report
        </label>
        <textarea
          id={`${ids}-input`}
          rows={2}
          maxLength={MAX_CHARS}
          value={draft}
          placeholder="Ask how to fix something in this report…"
          aria-describedby={`${ids}-hint`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(draft);
            }
          }}
          className={`field-sizing-content max-h-40 min-h-11 w-full min-w-0 flex-1 resize-none rounded-md border px-3 py-2.5 text-sm leading-relaxed focus:outline-none ${t.input}`}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className={`min-h-11 shrink-0 rounded-md px-5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${t.send} ${t.focus}`}
        >
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>
      <p id={`${ids}-hint`} className={`mt-2 text-xs ${t.muted}`}>
        Enter to send, Shift+Enter for a new line.
        {draft.length > MAX_CHARS - 400 && ` ${draft.length}/${MAX_CHARS}`}
      </p>
    </section>
  );
}
