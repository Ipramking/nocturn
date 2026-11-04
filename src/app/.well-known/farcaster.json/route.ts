import { siteUrl } from "@/lib/site";

// Farcaster / Base mini app manifest. The account association proves domain
// ownership and is signed by the owner's Farcaster account (env vars below).
export function GET(req: Request) {
  const base = siteUrl(req);
  const signed = process.env.FARCASTER_HEADER && process.env.FARCASTER_PAYLOAD && process.env.FARCASTER_SIGNATURE;
  return Response.json({
    ...(signed && {
      accountAssociation: {
        header: process.env.FARCASTER_HEADER,
        payload: process.env.FARCASTER_PAYLOAD,
        signature: process.env.FARCASTER_SIGNATURE,
      },
    }),
    ...(process.env.BASE_BUILDER_ADDRESS && { baseBuilder: { ownerAddress: process.env.BASE_BUILDER_ADDRESS } }),
    miniapp: {
      version: "1",
      name: "NOCTURN",
      subtitle: "Night shift for your app",
      description: "Paste your live URL. NOCTURN checks for leaked keys, broken prod, weak headers and slow pages overnight, then hands you a Morning Report with paste-ready AI fixes.",
      tagline: "You ship. You sleep. We work the night.",
      homeUrl: base,
      iconUrl: `${base}/pwa-icon/1024`,
      imageUrl: `${base}/embed-image`,
      heroImageUrl: `${base}/embed-image`,
      buttonTitle: "Clock in",
      splashImageUrl: `${base}/pwa-icon/200`,
      splashBackgroundColor: "#04060c",
      primaryCategory: "developer-tools",
      tags: ["security", "devtools", "monitoring", "vibecoding", "base"],
      ogTitle: "NOCTURN",
      ogDescription: "The night shift for your vibecoded app.",
      ogImageUrl: `${base}/opengraph-image`,
    },
  });
}
