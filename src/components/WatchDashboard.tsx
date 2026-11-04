"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BadgeEmbed from "./BadgeEmbed";
import Sky from "./Sky";
import Skyline from "./Skyline";

interface Data {
  watch: { id: string; url: string; email: string | null; active: boolean; telegramLinked: boolean; createdAt: string };
  telegramLink: string | null;
  channels: { email: boolean; telegram: boolean };
  history: Array<{ id: string; score: number; grade: string; finishedAt: string }>;
}

function Trend({ history }: { history: Data["history"] }) {
  const points = [...history].reverse();
  if (points.length < 2) return null;
  const w = 320;
  const h = 70;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(h - (p.score / 100) * h).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-20 w-full" role="img" aria-label="Shift score trend">
      <path d={d} fill="none" stroke="var(--color-phosphor)" strokeWidth="2" style={{ filter: "drop-shadow(0 0 6px var(--color-phosphor))" }} />
    </svg>
  );
}

async function fetchWatch(id: string): Promise<{ data?: Data; error?: string }> {
  const res = await fetch(`/api/watch?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  const json = await res.json();
  return res.ok ? { data: json } : { error: json.error ?? "Couldn't load this watch" };
}

export default function WatchDashboard({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchWatch(id).then((r) => {
      if (!alive) return;
      if (r.data) setData(r.data);
      else setError(r.error ?? "");
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const toggle = async () => {
    if (!data) return;
    await fetch("/api/watch", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, active: !data.watch.active }),
    });
    const r = await fetchWatch(id);
    if (r.data) setData(r.data);
  };

  const host = data ? new URL(data.watch.url).hostname : "";
  return (
    <main className="relative min-h-dvh px-4 pb-[28vh] sm:px-6">
      <Sky progress={0.4} dawn={0} />
      <Skyline lit={data?.watch.active ? 0.55 : 0.1} dawn={0} />
      <nav className="mx-auto flex max-w-3xl items-center justify-between py-5">
        <Link href="/" className="min-h-10 text-sm font-bold tracking-[0.35em] text-phosphor glow">NOCTURN</Link>
        <span className="text-[11px] tracking-[0.25em] text-muted">NIGHT WATCH</span>
      </nav>

      {error && <p role="alert" className="mx-auto max-w-3xl text-danger">{error}</p>}
      {!data && !error && <p className="mx-auto max-w-3xl text-muted caret">Loading your watch</p>}

      {data && (
        <div className="rise mx-auto flex max-w-3xl flex-col gap-4">
          <section className="panel scanlines rounded-2xl p-5 sm:p-7">
            <p className="text-[11px] tracking-[0.3em] text-phosphor">{data.watch.active ? "ON SHIFT EVERY NIGHT" : "PAUSED"}</p>
            <h1 className="mt-2 font-display text-4xl break-words">{host}</h1>
            <p className="mt-2 text-sm text-muted">A full shift runs nightly. Each Morning Report lands here first.</p>
            <Trend history={data.history} />
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/?url=${encodeURIComponent(host)}`} className="inline-flex min-h-11 items-center rounded-md bg-phosphor px-4 text-sm font-bold text-ink hover:brightness-110">
                Run a shift now
              </Link>
              <button onClick={toggle} className="min-h-11 rounded-md border border-line px-4 text-sm text-text hover:border-phosphor/50">
                {data.watch.active ? "Pause watch" : "Resume watch"}
              </button>
            </div>
          </section>

          <section className="panel rounded-2xl p-5 sm:p-7">
            <p className="text-[11px] tracking-[0.3em] text-phosphor">DELIVERY</p>
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span>On this page</span>
                <span className="text-phosphor">Always on</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">Email {data.watch.email ? `· ${data.watch.email}` : ""}</span>
                <span className={data.channels.email && data.watch.email ? "text-phosphor" : "text-muted"}>
                  {!data.channels.email ? "Not available yet" : data.watch.email ? "On" : "No email added"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span>Telegram</span>
                {data.watch.telegramLinked ? (
                  <span className="text-phosphor">Connected</span>
                ) : data.telegramLink ? (
                  <a href={data.telegramLink} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-md border border-phosphor/40 px-3 text-xs font-semibold text-phosphor hover:bg-phosphor/10">
                    Connect Telegram
                  </a>
                ) : (
                  <span className="text-muted">Not available yet</span>
                )}
              </li>
            </ul>
          </section>

          <section className="panel rounded-2xl p-5 sm:p-7">
            <p className="text-[11px] tracking-[0.3em] text-phosphor">BADGE</p>
            <p className="mt-2 text-sm text-muted">Show your nightly score on your site or README.</p>
            <div className="mt-3">
              <BadgeEmbed origin={typeof window === "undefined" ? "" : window.location.origin} host={host} />
            </div>
          </section>

          <section className="panel rounded-2xl p-5 sm:p-7">
            <p className="text-[11px] tracking-[0.3em] text-phosphor">SHIFT LOG</p>
            {data.history.length === 0 && <p className="mt-3 text-sm text-muted">No shifts yet. The first one runs tonight.</p>}
            <ul className="mt-3 flex flex-col divide-y divide-line/60">
              {data.history.map((s) => (
                <li key={s.id}>
                  <Link href={`/r/${s.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:text-phosphor">
                    <span>{new Date(s.finishedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
                    <span className="tabular-nums">
                      {s.score}/100 · {s.grade}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
