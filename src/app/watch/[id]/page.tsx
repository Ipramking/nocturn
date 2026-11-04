import WatchDashboard from "@/components/WatchDashboard";

export const metadata = { title: "Night Watch · NOCTURN", robots: { index: false } };

export default async function WatchPage({ params }: PageProps<"/watch/[id]">) {
  return <WatchDashboard id={(await params).id} />;
}
