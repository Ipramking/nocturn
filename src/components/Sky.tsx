"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** 0 = 22:00, 1 = 06:00. Drives the moon's arc. */
  progress: number;
  /** 0 = deep night, 1 = sunrise. */
  dawn: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export default function Sky({ progress, dawn }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef({ progress, dawn });
  useEffect(() => {
    target.current = { progress, dawn };
  }, [progress, dawn]);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let frame = 0;
    const live = { ...target.current };
    let meteor: { x: number; y: number; life: number } | null = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round((w * h) / 5200);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.82,
        r: Math.random() * 1.2 + 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.005,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      live.progress += (target.current.progress - live.progress) * 0.05;
      live.dawn += (target.current.dawn - live.dawn) * 0.025;
      const d = live.dawn;

      const top = mix([4, 6, 12], [28, 34, 78], d);
      const mid = mix([10, 16, 34], [120, 72, 110], d);
      const low = mix([14, 24, 48], [255, 154, 107], d);
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, rgb(top));
      sky.addColorStop(0.6, rgb(mid));
      sky.addColorStop(1, rgb(low));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        const twinkle = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(s.phase + t * s.speed * 0.06);
        ctx.fillStyle = `rgba(220,255,235,${twinkle * (1 - d * 0.95)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Moon travels a low arc across the night.
      const p = live.progress;
      const mx = w * (0.08 + 0.84 * p);
      const my = h * (0.62 - 0.42 * Math.sin(Math.PI * p));
      const halo = ctx.createRadialGradient(mx, my, 0, mx, my, 120);
      halo.addColorStop(0, `rgba(200,255,225,${0.22 * (1 - d)})`);
      halo.addColorStop(1, "rgba(200,255,225,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(mx - 120, my - 120, 240, 240);
      ctx.fillStyle = `rgba(232,255,240,${1 - d * 0.7})`;
      ctx.beginPath();
      ctx.arc(mx, my, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgb(mix([10, 16, 34], [120, 72, 110], d), 1 - d * 0.7);
      ctx.beginPath();
      ctx.arc(mx + 9, my - 6, 20, 0, Math.PI * 2);
      ctx.fill();

      // The sun only shows at dawn, rising behind the skyline.
      if (d > 0.02) {
        const sx = w * 0.72;
        const sy = h * (1.05 - 0.28 * d);
        const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.55);
        sun.addColorStop(0, `rgba(255,214,150,${0.9 * d})`);
        sun.addColorStop(0.12, `rgba(255,170,110,${0.55 * d})`);
        sun.addColorStop(1, "rgba(255,150,100,0)");
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, w, h);
      }

      if (!reduced && d < 0.3) {
        if (!meteor && Math.random() < 0.002) meteor = { x: Math.random() * w * 0.7, y: Math.random() * h * 0.3, life: 1 };
        if (meteor) {
          ctx.strokeStyle = `rgba(220,255,235,${meteor.life * 0.8})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(meteor.x, meteor.y);
          ctx.lineTo(meteor.x - 70, meteor.y - 28);
          ctx.stroke();
          meteor.x += 9;
          meteor.y += 3.6;
          meteor.life -= 0.03;
          if (meteor.life <= 0) meteor = null;
        }
      }

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvas} aria-hidden className="fixed inset-0 -z-10 h-full w-full" />;
}
