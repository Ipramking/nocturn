// Optional night-shift sound, muted by default. Web Audio only, no files: a low
// hum while the shift runs, a soft tick per finished check, a chime at sunrise.
// Nothing is created until the listener turns sound on with a click.

const KEY = "nocturn:sound";

let enabled = false;
let loaded = false;
let humWanted = false;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let hum: { stop: () => void } | null = null;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    enabled = window.localStorage.getItem(KEY) === "on";
  } catch {
    enabled = false;
  }
}

export function subscribeSound(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const soundOn = () => {
  load();
  return enabled;
};

export const soundOnServer = () => false;

export function setSoundOn(on: boolean) {
  enabled = on;
  loaded = true;
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage blocked; the choice lasts for this visit */
  }
  if (on) {
    audio();
    if (humWanted) startHum();
  } else {
    hum?.stop();
    hum = null;
  }
  listeners.forEach((l) => l());
}

function audio() {
  load();
  if (!enabled || typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/** Call from a click so the browser lets the audio context start. */
export const unlockSound = () => void audio();

export function startHum() {
  humWanted = true;
  const c = audio();
  if (!c || !master || hum) return;
  const now = c.currentTime;
  const out = c.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(0.1, now + 3);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 220;
  lp.Q.value = 0.8;
  lp.connect(out).connect(master);

  const voices: Array<[OscillatorType, number, number]> = [
    ["sawtooth", 55, 0.5],
    ["triangle", 55.35, 0.6],
    ["sine", 82.4, 0.35],
  ];
  const oscs = voices.map(([type, freq, level]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = level;
    o.connect(g).connect(lp);
    o.start(now);
    return o;
  });
  // The filter breathes slowly, like a building's air handling at 3am.
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.frequency.value = 0.07;
  depth.gain.value = 70;
  lfo.connect(depth).connect(lp.frequency);
  lfo.start(now);

  hum = {
    stop: () => {
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.5);
      [...oscs, lfo].forEach((o) => o.stop(t + 2.5));
    },
  };
}

export function stopHum() {
  humWanted = false;
  hum?.stop();
  hum = null;
}

function blip(c: AudioContext, freq: number, at: number, peak: number, decay: number, type: OscillatorType = "sine") {
  if (!master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + decay + 0.05);
}

export function tick(status: string) {
  const c = audio();
  if (!c) return;
  const freq = status === "pass" ? 1318.5 : status === "warn" ? 987.8 : status === "fail" ? 659.3 : 880;
  const now = c.currentTime;
  blip(c, freq, now, 0.07, 0.14);
  blip(c, freq * 2, now, 0.02, 0.08);
}

export function chime() {
  const c = audio();
  if (!c) return;
  const now = c.currentTime + 0.05;
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
    blip(c, f, now + i * 0.14, 0.06, 2.6);
    blip(c, f * 2.01, now + i * 0.14, 0.012, 1.2, "triangle");
  });
}
