import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NOCTURN · the night shift for your vibecoded app",
    short_name: "NOCTURN",
    description: "Overnight health and security checks for your live app, with a Morning Report and paste-ready AI fixes.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#04060c",
    theme_color: "#04060c",
    categories: ["developer", "productivity", "security"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
