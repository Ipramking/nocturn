import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Report from "@/components/Report";
import Sky from "@/components/Sky";
import Skyline from "@/components/Skyline";
import { siteUrl } from "@/lib/site";
import { getShift } from "@/lib/store";

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
    <main className="relative min-h-dvh px-4 pb-[28vh] sm:px-6">
      <Sky progress={1} dawn={1} />
      <Skyline lit={0.82} dawn={1} fixed={false} />
      <nav className="mx-auto flex max-w-4xl items-center justify-between py-5">
        <Link href="/" className="min-h-10 text-sm font-bold tracking-[0.35em] text-phosphor glow">NOCTURN</Link>
        <Link href={`/?url=${encodeURIComponent(host)}`} className="text-xs tracking-wider text-muted hover:text-phosphor">
          Re-run this shift →
        </Link>
      </nav>
      <Report report={report} shareUrl={`${siteUrl()}/r/${report.id}`} />
      <div className="mx-auto mt-8 max-w-4xl text-center">
        <Link href="/" className="inline-flex min-h-12 items-center rounded-xl bg-phosphor px-6 text-sm font-bold tracking-wider text-ink hover:brightness-110">
          RUN A NIGHT SHIFT ON YOUR APP →
        </Link>
      </div>
    </main>
  );
}
