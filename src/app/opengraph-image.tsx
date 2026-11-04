import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "NOCTURN · the night shift for your vibecoded app";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(circle at 78% 22%, #1c2a4e 0%, #04060c 60%)",
          color: "#d8ffe4",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: "#e8fff0", boxShadow: "0 0 60px #5cffa1", display: "flex" }} />
          <span style={{ fontSize: 30, letterSpacing: 12, color: "#5cffa1" }}>NOCTURN</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 76, lineHeight: 1.05 }}>You ship. You sleep.</span>
          <span style={{ fontSize: 76, lineHeight: 1.05, color: "#5cffa1" }}>We work the night.</span>
        </div>
        <span style={{ fontSize: 26, color: "#a9c7b4" }}>Leaked keys · broken prod · weak headers · slow pages → a Morning Report with paste-ready fixes</span>
      </div>
    ),
    size,
  );
}
