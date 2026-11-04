import { ImageResponse } from "next/og";

// App icons for the PWA manifest, apple-touch-icon and the mini app (any square size).
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Math.min(1024, Math.max(32, parseInt((await params).size, 10) || 512));
  const moon = size * 0.36;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 38%, #12204a 0%, #04060c 70%)",
        }}
      >
        <div
          style={{
            width: moon,
            height: moon,
            borderRadius: 999,
            background: "#e8fff0",
            boxShadow: `0 0 ${size * 0.12}px #5cffa1`,
            display: "flex",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: moon * 0.86,
              height: moon * 0.86,
              borderRadius: 999,
              background: "#0b1430",
              left: moon * 0.34,
              top: -moon * 0.12,
            }}
          />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
