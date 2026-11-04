import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NightEngineer from "@/components/NightEngineer";
import Report from "@/components/Report";
import { siteUrl } from "@/lib/site";
import { getShift } from "@/lib/store";

export const viewport: Viewport = { themeColor: "#f3ede1" };

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const report = await getShift((await params).id);
  if (!report) return { title: "Report not found · NOCTURN" };
  const host = new URL(report.finalUrl).hostname;
  const title = `${host} scored ${report.score}/100 on the night shift · NOCTURN`;
  return { title, description: report.ai?.headline, openGraph: { title, description: report.ai?.headline } };
}

export default async function ReportPage({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const report = await getShift(id);
  if (!report) notFound();
  const host = new URL(report.finalUrl).hostname;

  return (
    <main className="tone-light relative min-h-dvh px-4 pb-20 text-ink-soft sm:px-6">
      <div aria-hidden className="paper-bg pointer-events-none fixed inset-0 -z-10" />
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 py-4">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold tracking-[0.35em] text-ink-soft">
          NOCTURN
        </Link>
        <Link href={`/?url=${encodeURIComponent(host)}`} className="eyebrow inline-flex min-h-11 items-center text-[10px] text-ink-muted hover:text-ink-soft">
          Re-run this shift →
        </Link>
      </nav>
      <Report report={report} shareUrl={`${siteUrl()}/r/${report.id}`} extras={<NightEngineer report={report} tone="light" />} />
      <div className="mx-auto mt-14 max-w-5xl border-t border-ink-soft pt-8 text-center">
        <p className="font-display text-3xl text-ink-soft italic sm:text-4xl">Want one for your app?</p>
        <Link
          href="/"
          className="mt-5 inline-flex min-h-12 items-center rounded-full bg-ink-soft px-7 text-sm font-bold tracking-wider text-cream transition-colors hover:bg-ink-soft/85"
        >
          RUN A NIGHT SHIFT ON YOUR APP →
        </Link>
      </div>
    </main>
  );
}
