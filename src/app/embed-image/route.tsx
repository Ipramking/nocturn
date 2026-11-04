import { ImageResponse } from "next/og";

// 3:2 card used by Farcaster / Base mini app embeds.
export function GET() {
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
          background: "linear-gradient(180deg,#04060c 0%,#0b1430 62%,#2a1a3a 100%)",
          color: "#d8ffe4",
          fontFamily: "monospace",
        }}
      >
        <span style={{ fontSize: 30, letterSpacing: 12, color: "#5cffa1" }}>NOCTURN</span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 84, lineHeight: 1.04 }}>You ship. You sleep.</span>
          <span style={{ fontSize: 84, lineHeight: 1.04, color: "#5cffa1" }}>We work the night.</span>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          {[40, 70, 52, 90, 60, 78, 46, 84, 58].map((h, i) => (
            <div key={i} style={{ width: 70, height: h, background: "#03050a", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 10 }}>
              <div style={{ width: 8, height: 10, background: i % 3 ? "#5cffa1" : "#ffcd8c" }} />
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 800 },
  );
}
