import Nocturn from "@/components/Nocturn";
import { channels } from "@/lib/notify";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { url } = await searchParams;
  // Only offer email on Night Watch when the server can actually send it
  return <Nocturn initialUrl={typeof url === "string" ? url : ""} emailEnabled={channels.email} />;
}
