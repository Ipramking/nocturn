import { ImageResponse } from "next/og";
import { getShift } from "@/lib/store";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "NOCTURN Morning Report";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const report = await getShift((await params).id);
  const host = report ? new URL(report.finalUrl).hostname : "your app";
  const score = report?.score ?? 0;
  const color = score >= 75 ? "#5cffa1" : score >= 50 ? "#ffc261" : "#ff6b7a";
  const issues = report ? report.checks.flatMap((c) => c.findings).filter((f) => f.severity !== "info").length : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(180deg,#04060c 0%,#1c224e 55%,#ff9a6b 130%)",
          color: "#d8ffe4",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, letterSpacing: 8, color: "#5cffa1" }}>
          <span>NOCTURN</span>
          <span style={{ color: "#a9c7b4", letterSpacing: 4 }}>MORNING REPORT</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: 999,
              border: `10px solid ${color}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 96, fontWeight: 800, color }}>{score}</span>
            <span style={{ fontSize: 22, letterSpacing: 6, color: "#a9c7b4" }}>GRADE {report?.grade ?? "?"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
            <span style={{ fontSize: 34, color: "#a9c7b4" }}>{host}</span>
            <span style={{ fontSize: 52, lineHeight: 1.15, marginTop: 12 }}>{report?.ai?.headline ?? "Worked the night shift"}</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#d8ffe4" }}>
          <span>{issues ? `${issues} fix${issues === 1 ? "" : "es"} with paste-ready AI prompts` : "Clean night. Nothing needed you."}</span>
          <span style={{ color: "#5cffa1" }}>Run yours →</span>
        </div>
      </div>
    ),
    size,
  );
}
