"use client";

import { useMemo } from "react";

// A procedural skyline. Windows light up as the shift works through its checks,
// so the city visibly "clocks in" with you.

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export default function Skyline({ lit, dawn }: { lit: number; dawn: number }) {
  const { buildings, windows } = useMemo(() => {
    const rand = seeded(42);
    const buildings: Array<{ x: number; w: number; h: number }> = [];
    const windows: Array<{ x: number; y: number; order: number }> = [];
    let x = 0;
    while (x < 1200) {
      const w = 34 + rand() * 60;
      const h = 50 + rand() * 150;
      buildings.push({ x, w, h });
      for (let wy = 200 - h + 10; wy < 192; wy += 12) {
        for (let wx = x + 6; wx < x + w - 8; wx += 10) {
          if (rand() > 0.45) windows.push({ x: wx, y: wy, order: rand() });
        }
      }
      x += w + 2 + rand() * 6;
    }
    return { buildings, windows };
  }, []);

  const shade = dawn > 0.5 ? "#140d1f" : "#03050a";
  return (
    <svg aria-hidden viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax slice" className="pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[24vh] w-full">
      {buildings.map((b, i) => (
        <rect key={i} x={b.x} y={200 - b.h} width={b.w} height={b.h} fill={shade} style={{ transition: "fill 3s" }} />
      ))}
      {windows.map((win, i) => (
        <rect
          key={i}
          x={win.x}
          y={win.y}
          width={4}
          height={5}
          fill={dawn > 0.5 ? "#ffd59a" : "#5cffa1"}
          opacity={win.order < lit ? 0.85 : 0.06}
          style={{ transition: "opacity 1.2s, fill 3s" }}
        />
      ))}
    </svg>
  );
}
