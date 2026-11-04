import type { Metadata, Viewport } from "next";
import { Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
const display = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "NOCTURN · the night shift for your vibecoded app",
  description:
    "Paste your live URL before bed. NOCTURN works the night: uptime, leaked keys, security headers, Lighthouse and broken links, then hands you a Morning Report with fixes your AI can paste.",
  openGraph: {
    title: "NOCTURN · the night shift for your vibecoded app",
    description: "Leaked keys, broken prod, slow pages. NOCTURN checks your live app overnight and hands you paste-ready fixes.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#04060c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${mono.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
