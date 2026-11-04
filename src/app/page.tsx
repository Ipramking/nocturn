import Nocturn from "@/components/Nocturn";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { url } = await searchParams;
  return <Nocturn initialUrl={typeof url === "string" ? url : ""} />;
}
