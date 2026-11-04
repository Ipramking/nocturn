"use client";

import { useEffect, useRef } from "react";

// A living night city on canvas. Three parallax layers drift slowly, windows
// flick on and off like people working late, a few fluorescent tubes stutter,
// rooftop beacons blink and a night train crosses now and then. `lit` is how
// awake the city is (it rises as the shift's checks finish); at dawn the night
// crew goes home and the windows go dark.

interface Props {
  lit: number;
  dawn: number;
  fixed?: boolean;
}

interface Layer {
  tileW: number;
  speed: number;
  parallax: number;
  alpha: number;
  night: number[];
  day: number[];
  buildings: Array<{ x: number; w: number; h: number; antenna: boolean; beacon: boolean }>;
  win: { w: number; h: number };
  // Per-window state in flat typed arrays so a few thousand windows stay cheap.
  wx: Float32Array;
  wy: Float32Array;
  order: Float32Array;
  warm: Uint8Array;
  on: Uint8Array;
  want: Uint8Array;
  level: Float32Array;
  next: Float64Array;
  flickerUntil: Float64Array;
}

const LAYERS = [
  { minW: 26, maxW: 60, minH: 0.35, maxH: 0.7, gap: 3, speed: 3, parallax: 4, alpha: 0.45, win: { w: 2, h: 3, sx: 6, sy: 7 }, night: [9, 14, 30], day: [74, 48, 84] },
  { minW: 34, maxW: 80, minH: 0.3, maxH: 0.85, gap: 4, speed: 6, parallax: 9, alpha: 0.7, win: { w: 3, h: 4, sx: 8, sy: 9 }, night: [6, 9, 18], day: [44, 26, 54] },
  { minW: 44, maxW: 110, minH: 0.25, maxH: 1, gap: 5, speed: 11, parallax: 16, alpha: 1, win: { w: 4, h: 5, sx: 10, sy: 11 }, night: [3, 5, 10], day: [22, 13, 31] },
];

const PHOSPHOR = [92, 255, 161];
const WARM = [255, 205, 140];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function buildLayer(cfg: (typeof LAYERS)[number], width: number, height: number): Layer {
  const tileW = Math.max(width, 700) * 1.6;
  const buildings: Layer["buildings"] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  let x = 0;
  while (x < tileW) {
    const w = cfg.minW + Math.random() * (cfg.maxW - cfg.minW);
    const h = height * (cfg.minH + Math.random() * (cfg.maxH - cfg.minH));
    buildings.push({ x, w, h, antenna: Math.random() < 0.18, beacon: false });
    for (let y = height - h + 8; y < height - 6; y += cfg.win.sy) {
      for (let wx = x + 5; wx < x + w - cfg.win.w - 4; wx += cfg.win.sx) {
        if (Math.random() < 0.62) {
          xs.push(wx);
          ys.push(y);
        }
      }
    }
    x += w + cfg.gap + Math.random() * cfg.gap * 2;
  }
  // Beacons on the three tallest towers of the layer.
  [...buildings].sort((a, b) => b.h - a.h).slice(0, 3).forEach((b) => (b.beacon = true));

  const n = xs.length;
  const layer: Layer = {
    tileW,
    speed: cfg.speed,
    parallax: cfg.parallax,
    alpha: cfg.alpha,
    night: cfg.night,
    day: cfg.day,
    buildings,
    win: { w: cfg.win.w, h: cfg.win.h },
    wx: Float32Array.from(xs),
    wy: Float32Array.from(ys),
    order: new Float32Array(n),
    warm: new Uint8Array(n),
    on: new Uint8Array(n),
    want: new Uint8Array(n),
    level: new Float32Array(n),
    next: new Float64Array(n),
    flickerUntil: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    layer.order[i] = Math.random();
    layer.warm[i] = Math.random() < 0.22 ? 1 : 0;
    layer.next[i] = performance.now() + Math.random() * 8000;
  }
  return layer;
}

export default function Skyline({ lit, dawn, fixed = true }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef({ lit, dawn });

  useEffect(() => {
    target.current = { lit, dawn };
  }, [lit, dawn]);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const live = { ...target.current };
    const pointer = { x: 0, tx: 0 };
    let layers: Layer[] = [];
    let w = 0;
    let h = 0;
    let frame = 0;
    let last = performance.now();
    let train: { x: number; speed: number; cars: number } | null = null;
    let nextTrain = performance.now() + 6000 + Math.random() * 8000;

    const resize = () => {
      const rect = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layers = LAYERS.map((cfg) => buildLayer(cfg, w, h));
      if (reduced) draw(performance.now(), true);
    };

    const onPointer = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    };

    function draw(now: number, still = false) {
      const dt = Math.min(64, now - last);
      last = now;
      live.lit += (target.current.lit - live.lit) * (still ? 1 : 0.04);
      live.dawn += (target.current.dawn - live.dawn) * (still ? 1 : 0.02);
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      const d = live.dawn;
      // At dawn most of the night crew clocks out.
      const awake = live.lit * (1 - d * 0.88);

      ctx.clearRect(0, 0, w, h);

      layers.forEach((L, li) => {
        const drift = still ? 0 : (now / 1000) * L.speed;
        const offset = ((drift + pointer.x * L.parallax) % L.tileW + L.tileW) % L.tileW;
        const body = mix(L.night, L.day, d);
        ctx.fillStyle = `rgb(${body[0]},${body[1]},${body[2]})`;

        for (let k = 0; k < 2; k++) {
          const base = k * L.tileW - offset;
          if (base > w || base + L.tileW < 0) continue;
          for (const b of L.buildings) {
            const bx = base + b.x;
            if (bx > w || bx + b.w < 0) continue;
            ctx.fillRect(bx, h - b.h, b.w, b.h);
            if (b.antenna) ctx.fillRect(bx + b.w / 2 - 1, h - b.h - 14, 2, 14);
          }
        }

        // Windows: each one decides on its own schedule whether someone's working.
        for (let i = 0; i < L.wx.length; i++) {
          const want = L.order[i] < awake ? 1 : 0;
          if (want !== L.want[i]) {
            L.want[i] = want;
            // A change in how awake the city is ripples through quickly, not instantly.
            L.next[i] = Math.min(L.next[i], now + Math.random() * 1400);
          }
          if (!still && now >= L.next[i]) {
            const wasOn = L.on[i];
            L.on[i] = want ? (Math.random() < 0.9 ? 1 : 0) : Math.random() < 0.035 ? 1 : 0;
            if (!wasOn && L.on[i] && Math.random() < 0.14) L.flickerUntil[i] = now + 350 + Math.random() * 500;
            L.next[i] = now + 3500 + Math.random() * 15000;
          }
          if (still) L.on[i] = want;
          const goal = L.on[i];
          L.level[i] += (goal - L.level[i]) * (still ? 1 : goal ? Math.min(1, dt / 90) : Math.min(1, dt / 600));
          let lvl = L.level[i];
          if (now < L.flickerUntil[i]) lvl *= Math.sin(now / 28 + i) > 0.1 ? 1 : 0.15; // fluorescent stutter
          if (lvl < 0.03) continue;

          const x = (((L.wx[i] - offset) % L.tileW) + L.tileW) % L.tileW;
          if (x > w) continue;
          const c = L.warm[i] || d > 0.5 ? WARM : PHOSPHOR;
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${(lvl * L.alpha * 0.9).toFixed(3)})`;
          ctx.fillRect(x, L.wy[i], L.win.w, L.win.h);
        }

        // Rooftop beacons blink slowly on the front two layers.
        if (li > 0) {
          const blink = still ? 1 : (Math.sin(now / 520 + li) + 1) / 2;
          for (let k = 0; k < 2; k++) {
            const base = k * L.tileW - offset;
            for (const b of L.buildings) {
              if (!b.beacon) continue;
              const bx = base + b.x + b.w / 2;
              if (bx < -10 || bx > w + 10) continue;
              const by = h - b.h - (b.antenna ? 15 : 2);
              ctx.fillStyle = `rgba(255,70,80,${(0.25 + blink * 0.75) * (1 - d * 0.6)})`;
              ctx.shadowColor = "rgba(255,70,80,0.9)";
              ctx.shadowBlur = 10 * blink;
              ctx.fillRect(bx - 1.5, by - 1.5, 3, 3);
              ctx.shadowBlur = 0;
            }
          }
        }
      });

      // The night train, on an elevated line in front of the city.
      if (!still && d < 0.6) {
        if (!train && now > nextTrain) train = { x: -420, speed: 110 + Math.random() * 60, cars: 4 + Math.floor(Math.random() * 3) };
        if (train) {
          train.x += (train.speed * dt) / 1000;
          const ty = h - 22;
          ctx.fillStyle = "rgba(2,3,7,0.95)";
          ctx.fillRect(0, ty + 12, w, 2); // rail
          for (let c = 0; c < train.cars; c++) {
            const cx = train.x - c * 66;
            if (cx > w || cx + 62 < 0) continue;
            ctx.fillStyle = "rgb(4,6,12)";
            ctx.fillRect(cx, ty, 62, 12);
            ctx.fillStyle = "rgba(255,220,160,0.85)";
            for (let j = 0; j < 6; j++) ctx.fillRect(cx + 4 + j * 10, ty + 3, 6, 4);
          }
          ctx.fillStyle = "rgba(255,245,210,0.9)";
          ctx.shadowColor = "rgba(255,240,200,1)";
          ctx.shadowBlur = 14;
          ctx.fillRect(train.x + 62, ty + 4, 3, 3);
          ctx.shadowBlur = 0;
          if (train.x - train.cars * 66 > w) {
            train = null;
            nextTrain = now + 14000 + Math.random() * 18000;
          }
        }
      }
    }

    const loop = (now: number) => {
      draw(now);
      frame = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    // Reduced motion: no drift or flicker, just a still city that follows the shift.
    const still = reduced ? setInterval(() => draw(performance.now(), true), 500) : undefined;
    if (!reduced) {
      window.addEventListener("pointermove", onPointer);
      frame = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(still);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={`pointer-events-none ${fixed ? "fixed" : "absolute"} inset-x-0 bottom-0 -z-10 h-[26vh] w-full`}
    />
  );
}
