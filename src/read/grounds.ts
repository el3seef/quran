/**
 * What a shared ayah is laid on: a few old paintings (public domain, from museums'
 * open collections: public/art, credited in About) and a few painted here, in code, as brushwork.
 * No figures, no animals. Each ground says where its words may sit (`spots`, the calm parts of it)
 * and in what ink, so whatever the reader picks, the words read and nothing important is covered.
 */
export type Spot = { id: "top" | "middle" | "bottom"; box: [number, number, number, number] }; // x0 y0 x1 y1, fractions
export type Ground = {
  id: string;
  name: string;
  set: "warm" | "light" | "night"; // (the set it was made in: warm reds, pale paper, the night)
  art?: { src: string; focus: [number, number]; by: string };
  paint?: (g: CanvasRenderingContext2D, W: number, H: number, seed: number) => void;
  ink: "light" | "dark";
  tone: { ar: string; tr: string; ref: string };
  spots: Spot[];
  font: FontId; // the lettering it opens with
};

export type FontId = "amiri" | "cormorant" | "fraunces" | "jost";
export const FONTS: { id: FontId; name: string; tr: (px: number) => string; ref: (px: number) => string; load: string[] }[] = [
  { id: "amiri", name: "Amiri", tr: (px) => `italic 400 ${px}px "Amiri", "Marks Serif", serif`, ref: (px) => `400 ${px}px "Amiri", "Marks Serif", serif`, load: ['italic 400 40px "Amiri"', '400 40px "Amiri"'] },
  { id: "cormorant", name: "Garamond", tr: (px) => `italic 500 ${px}px "Cormorant Garamond Variable", "Marks Serif", serif`, ref: (px) => `500 ${px}px "Cormorant Garamond Variable", "Marks Serif", serif`, load: ['italic 500 40px "Cormorant Garamond Variable"', '500 40px "Cormorant Garamond Variable"'] },
  { id: "fraunces", name: "Fraunces", tr: (px) => `italic 340 ${px}px "Fraunces Variable", "Marks Serif", serif`, ref: (px) => `400 ${px}px "Fraunces Variable", "Marks Serif", serif`, load: ['italic 340 40px "Fraunces Variable"', '400 40px "Fraunces Variable"'] },
  { id: "jost", name: "Jost", tr: (px) => `300 ${px}px "Jost Variable", "Marks Sans", sans-serif`, ref: (px) => `400 ${px}px "Jost Variable", "Marks Sans", sans-serif`, load: ['300 40px "Jost Variable"', '400 40px "Jost Variable"'] },
];

const TOP: Spot = { id: "top", box: [0.1, 0.07, 0.9, 0.5] };
const MIDDLE: Spot = { id: "middle", box: [0.1, 0.22, 0.9, 0.78] };
const BOTTOM: Spot = { id: "bottom", box: [0.1, 0.5, 0.9, 0.93] };
const LIGHT = { ar: "#f6ecd6", tr: "#efe3c8", ref: "rgba(239,227,200,0.78)" };
const SILVER = { ar: "#eef3f8", tr: "#e2e9f1", ref: "rgba(226,233,241,0.72)" };
const INK = { ar: "#1d1b16", tr: "#26231d", ref: "rgba(38,35,29,0.72)" };

/* ── a little randomness of its own, the same every time for the same seed ── */
export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
function noise2(seed: number) {
  const r = rng(seed);
  const P = Array.from({ length: 256 }, () => r());
  const h = (x: number, y: number) => P[(((x * 73856093) ^ (y * 19349663)) >>> 0) & 255];
  const at = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x: number, y: number) => (at(x, y) * 0.6 + at(x * 2.1 + 7, y * 2.1 + 3) * 0.3 + at(x * 4.3 + 1, y * 4.3 + 9) * 0.1);
}
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** a colour along a palette (0 to 1) */
const along = (pal: number[][], t: number) => {
  const x = Math.max(0, Math.min(0.9999, t)) * (pal.length - 1);
  const i = Math.floor(x);
  return mix(pal[i], pal[i + 1], x - i);
};

/* ── brushwork, painted in code ───────────────────────────────── */

/**
 * A sky swirling round a light, as if painted with a loaded brush: broad strokes laid first, then
 * finer ones over them, all along the turning of the air, in bands of light and dark that wind in
 * toward the bright eye of it.
 */
function swirl(pal: string[], cx: number, cy: number, glow: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number, seed: number) => {
    const P = pal.map(hex);
    const r = rng(seed), n = noise2(seed + 11);
    const S = Math.min(W, H), u = S / 1080;
    const ox = W * cx, oy = H * cy;
    const bg = g.createRadialGradient(ox, oy, 0, ox, oy, Math.hypot(W, H) * 0.7);
    bg.addColorStop(0, rgb(P[P.length - 1]));
    bg.addColorStop(0.4, rgb(P[Math.floor(P.length / 2)]));
    bg.addColorStop(1, rgb(P[0]));
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // where the brush goes: round the eye, a little inward, wavering with the air
    const dir = (x: number, y: number) => Math.atan2(y - oy, x - ox) + Math.PI / 2 + 0.22 + (n(x / S * 2.4, y / S * 2.4) - 0.5) * 1.1;
    // how light the paint is there: brighter in, and wound into bands
    const tone = (x: number, y: number) => {
      const d = Math.hypot(x - ox, y - oy) / S;
      const band = 0.5 + 0.5 * Math.sin(d * 26 + Math.atan2(y - oy, x - ox) * 1.0 + n(x / S * 3, y / S * 3) * 5);
      return Math.max(0, Math.min(1, (1 - d * 1.15) * 0.75 + band * 0.32 - 0.06 + (r() - 0.5) * 0.12));
    };
    g.lineCap = "round";
    const pass = (count: number, w0: number, w1: number, l0: number, l1: number, a0: number, a1: number) => {
      for (let k = 0; k < count; k++) {
        let x = r() * W, y = r() * H;
        g.strokeStyle = rgb(along(P, tone(x, y)), a0 + r() * (a1 - a0));
        g.lineWidth = (w0 + r() * (w1 - w0)) * u;
        const len = (l0 + r() * (l1 - l0)) * u;
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          const a = dir(x, y);
          x += (Math.cos(a) * len) / 6;
          y += (Math.sin(a) * len) / 6;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    };
    pass(Math.round((W * H) / 1400), 10, 26, 70, 180, 0.3, 0.55);
    pass(Math.round((W * H) / 320), 3.5, 9, 30, 90, 0.35, 0.65);
    pass(Math.round((W * H) / 140), 1.2, 3.2, 14, 44, 0.4, 0.75);
    const gl = g.createRadialGradient(ox, oy, 0, ox, oy, S * 0.3);
    gl.addColorStop(0, glow);
    gl.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gl;
    g.fillRect(0, 0, W, H);
    // the edges sink into shadow
    const v = g.createRadialGradient(W / 2, H / 2, S * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  };
}

/** Night over the sea: a moon high on one side, its light laid on the water in short strokes. */
function nightSea(g: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const r = rng(seed), n = noise2(seed + 5);
  const S = Math.min(W, H);
  const hz = H * 0.66;
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, "#04091a");
  sky.addColorStop(0.6, "#0d1d3d");
  sky.addColorStop(1, "#1c3256");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, hz);
  const sea = g.createLinearGradient(0, hz, 0, H);
  sea.addColorStop(0, "#0e1a33");
  sea.addColorStop(1, "#03060f");
  g.fillStyle = sea;
  g.fillRect(0, hz, W, H - hz);
  const mx = W * 0.24, my = H * 0.17, mr = S * 0.055;
  // clouds: long soft strokes across the sky
  g.lineCap = "round";
  for (let k = 0; k < (W * H) / 260; k++) {
    const x = r() * W, y = r() * hz * 0.95;
    const c = n(x / S * 2.5, y / S * 5);
    if (c < 0.48) continue;
    const near = Math.max(0, 1 - Math.hypot(x - mx, y - my) / (S * 0.6));
    g.strokeStyle = rgb(mix([40, 62, 104], [176, 196, 222], near * 0.8 + (c - 0.48)), 0.08 + (c - 0.48) * 0.5);
    g.lineWidth = (2 + r() * 6) * (S / 1080);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (20 + r() * 60) * (S / 1080), y + (r() - 0.5) * 4);
    g.stroke();
  }
  // the moon and its halo
  const halo = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 7);
  halo.addColorStop(0, "rgba(214,226,242,0.55)");
  halo.addColorStop(1, "rgba(214,226,242,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, W, hz);
  g.fillStyle = "#eef2f7";
  g.beginPath();
  g.arc(mx, my, mr, 0, Math.PI * 2);
  g.fill();
  // the sea: short strokes, the moon's path bright
  for (let k = 0; k < (W * H) / 120; k++) {
    const x = r() * W, y = hz + Math.pow(r(), 1.3) * (H - hz);
    const depth = (y - hz) / (H - hz);
    const path = Math.max(0, 1 - Math.abs(x - mx) / (S * (0.05 + depth * 0.22)));
    const lit = path * (0.6 + 0.4 * n(x / S * 8, y / S * 30));
    g.strokeStyle = rgb(mix([18, 34, 64], [214, 226, 242], lit), 0.18 + lit * 0.6);
    g.lineWidth = (1 + depth * 3) * (S / 1080);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (6 + depth * 26) * (S / 1080), y);
    g.stroke();
  }
}

/** Ink on paper: far ridges in mist, washed in grey, the paper's own grain under them. */
function inkWash(g: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const r = rng(seed), n = noise2(seed + 3);
  const S = Math.min(W, H);
  g.fillStyle = "#ece6d7";
  g.fillRect(0, 0, W, H);
  // fibres of the paper
  for (let k = 0; k < (W * H) / 400; k++) {
    g.strokeStyle = `rgba(120,104,80,${0.03 + r() * 0.05})`;
    g.lineWidth = 0.6;
    const x = r() * W, y = r() * H, a = r() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
    g.stroke();
  }
  // ridges, far to near: each a line of hills, its ink fading down into mist
  const ridges = 4;
  for (let i = 0; i < ridges; i++) {
    const base = H * (0.52 + i * 0.12);
    const amp = H * (0.14 - i * 0.02);
    const ink = 0.22 + i * 0.18;
    const top: [number, number][] = [];
    for (let x = 0; x <= W; x += W / 120) {
      const y = base - amp * (n(x / S * (1.2 + i * 0.5) + i * 7, i * 3.1) * 1.4 - 0.3);
      top.push([x, y]);
    }
    const grad = g.createLinearGradient(0, base - amp, 0, base + H * 0.16);
    grad.addColorStop(0, `rgba(30,28,24,${ink})`);
    grad.addColorStop(1, "rgba(30,28,24,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, H);
    for (const [x, y] of top) g.lineTo(x, y);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    // the brush's dry edge along the crest
    g.strokeStyle = `rgba(28,26,22,${ink * 0.8})`;
    g.lineWidth = (1 + i) * (S / 1080);
    g.beginPath();
    top.forEach(([x, y], k) => (k ? g.lineTo(x, y + (r() - 0.5) * 2) : g.moveTo(x, y)));
    g.stroke();
  }
  // mist over the foot
  const mist = g.createLinearGradient(0, H * 0.62, 0, H);
  mist.addColorStop(0, "rgba(236,230,215,0)");
  mist.addColorStop(1, "rgba(236,230,215,0.85)");
  g.fillStyle = mist;
  g.fillRect(0, 0, W, H);
}

/** Dusk: the sun just down behind far hills, the sky banded red to gold, laid on in strokes. */
function dusk(g: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const r = rng(seed), n = noise2(seed + 9);
  const S = Math.min(W, H);
  const hz = H * 0.7;
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, "#2a0408");
  sky.addColorStop(0.45, "#6e1018");
  sky.addColorStop(0.8, "#b0401c");
  sky.addColorStop(1, "#e2a24a");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.lineCap = "round";
  for (let k = 0; k < (W * H) / 110; k++) {
    const x = r() * W, y = r() * hz;
    const t = y / hz + (n(x / S * 2, y / S * 6) - 0.5) * 0.35;
    g.strokeStyle = rgb(along([[34, 4, 8], [110, 16, 24], [176, 64, 28], [226, 162, 74], [246, 206, 120]], t), 0.25 + r() * 0.35);
    g.lineWidth = (1.5 + r() * 4) * (S / 1080);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 20 * (S / 1080), y + (r() - 0.5) * 6, x + (30 + r() * 60) * (S / 1080), y + (r() - 0.5) * 4);
    g.stroke();
  }
  const sun = g.createRadialGradient(W * 0.62, hz, 0, W * 0.62, hz, S * 0.4);
  sun.addColorStop(0, "rgba(255,214,140,0.65)");
  sun.addColorStop(1, "rgba(255,214,140,0)");
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 3; i++) {
    const base = hz + H * (0.02 + i * 0.09);
    g.fillStyle = ["#3a0a0c", "#250507", "#140203"][i];
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += W / 90) g.lineTo(x, base - H * (0.07 - i * 0.015) * n(x / S * (1.6 + i), i * 5.3) * 1.6);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }
}

/**
 * The prayer rug the theme is named for, along one side of a deep red ground (as the reader's own
 * picture of one): its borders of gold rosettes and chevrons, its field a lattice round a star.
 */
function rug(g: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const r = rng(seed), n = noise2(seed + 4);
  const S = Math.min(W, H);
  // the ground: velvet maroon, lit softly from the right
  const bg = g.createRadialGradient(W * 0.72, H * 0.42, 0, W * 0.72, H * 0.42, Math.hypot(W, H) * 0.7);
  bg.addColorStop(0, "#6a1c22");
  bg.addColorStop(0.6, "#4a0f15");
  bg.addColorStop(1, "#24060a");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < (W * H) / 90; k++) {
    const x = r() * W, y = r() * H;
    g.fillStyle = `rgba(${n(x / 60, y / 60) > 0.5 ? "255,220,200" : "0,0,0"},${0.025 + r() * 0.03})`;
    g.fillRect(x, y, 1.6, 1.6);
  }
  // the rug: from beyond the left edge to a third of the way across, its full height
  const x0 = -W * 0.04, x1 = W * (W > H ? 0.3 : 0.36), y0 = -H * 0.02, y1 = H * 1.02;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)";
  g.shadowBlur = S * 0.05;
  g.shadowOffsetX = S * 0.012;
  g.fillStyle = "#7d1820";
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.restore();
  const u = S / 1080;
  const band = (inset: number, width: number, fill: string, motif: (cx: number, cy: number, s: number) => void, step: number) => {
    const L = x0 + inset, R = x1 - inset, T = y0 + inset, B = y1 - inset;
    g.fillStyle = fill;
    g.fillRect(L, T, R - L, width);
    g.fillRect(L, B - width, R - L, width);
    g.fillRect(L, T, width, B - T);
    g.fillRect(R - width, T, width, B - T);
    for (let y = T + width / 2; y < B; y += step) motif(R - width / 2, y, width);
    for (let y = T + width / 2; y < B; y += step) motif(L + width / 2, y, width);
    for (let x = L + width / 2; x < R; x += step) {
      motif(x, T + width / 2, width);
      motif(x, B - width / 2, width);
    }
  };
  const gold = "#c9a35f", ivory = "#e8d9b5", navy = "#1c2340";
  const rosette = (cx: number, cy: number, s: number) => {
    g.fillStyle = gold;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(cx + Math.cos(a) * s * 0.22, cy + Math.sin(a) * s * 0.22, s * 0.1, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#a3222a";
    g.beginPath();
    g.arc(cx, cy, s * 0.12, 0, Math.PI * 2);
    g.fill();
  };
  const chevron = (cx: number, cy: number, s: number) => {
    g.strokeStyle = gold;
    g.lineWidth = 2 * u;
    g.beginPath();
    g.moveTo(cx - s * 0.3, cy - s * 0.15);
    g.lineTo(cx, cy + s * 0.15);
    g.lineTo(cx + s * 0.3, cy - s * 0.15);
    g.stroke();
  };
  const bead = (cx: number, cy: number, s: number) => {
    g.fillStyle = ivory;
    g.beginPath();
    g.arc(cx, cy, s * 0.22, 0, Math.PI * 2);
    g.fill();
  };
  band(14 * u, 18 * u, "#2a080b", bead, 26 * u);
  band(36 * u, 54 * u, navy, rosette, 62 * u);
  band(94 * u, 26 * u, "#8c1c24", chevron, 30 * u);
  // the field: a lattice of small stars, and a great star in the middle
  const fl = x0 + 124 * u, fr = x1 - 124 * u, ft = y0 + 124 * u, fb = y1 - 124 * u;
  g.save();
  g.beginPath();
  g.rect(fl, ft, fr - fl, fb - ft);
  g.clip();
  g.fillStyle = "#701520";
  g.fillRect(fl, ft, fr - fl, fb - ft);
  const cell = 44 * u;
  g.strokeStyle = "rgba(201,163,95,0.55)";
  g.lineWidth = 1.2 * u;
  for (let y = ft - cell; y < fb + cell; y += cell)
    for (let x = fl - cell; x < fr + cell; x += cell) {
      g.beginPath();
      g.moveTo(x, y + cell / 2);
      g.lineTo(x + cell / 2, y);
      g.lineTo(x + cell, y + cell / 2);
      g.lineTo(x + cell / 2, y + cell);
      g.closePath();
      g.stroke();
      g.fillStyle = (Math.round(x / cell) + Math.round(y / cell)) % 2 ? "rgba(232,217,181,0.5)" : "rgba(28,35,64,0.6)";
      g.beginPath();
      g.arc(x + cell / 2, y + cell / 2, 2.4 * u, 0, Math.PI * 2);
      g.fill();
    }
  const cx = (fl + fr) / 2, cy = (ft + fb) / 2, R = Math.min(fr - fl, fb - ft) * 0.36;
  const star = (rad: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? rad * 0.72 : rad;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  };
  star(R, navy);
  star(R * 0.8, "#a3222a");
  star(R * 0.55, gold);
  star(R * 0.3, "#701520");
  g.restore();
  // the pile's light and wear
  for (let k = 0; k < ((x1 - x0) * H) / 60; k++) {
    const x = x0 + r() * (x1 - x0), y = r() * H;
    g.fillStyle = `rgba(${r() > 0.5 ? "255,240,220" : "0,0,0"},${0.03 + r() * 0.04})`;
    g.fillRect(x, y, 1.5, 1.5);
  }
}

/* ── the grounds, by theme: the first is the one a share opens on ── */
const GROUNDS: Ground[] = [
  // Sajjadah
  { id: "rug", name: "Sajjadah", set: "warm", paint: rug, ink: "light", tone: LIGHT, font: "amiri", spots: [{ id: "middle", box: [0.4, 0.16, 0.95, 0.84] }, { id: "top", box: [0.4, 0.08, 0.95, 0.52] }, { id: "bottom", box: [0.4, 0.48, 0.95, 0.92] }] },
  { id: "church-twilight", name: "Twilight", set: "warm", art: { src: "art/church-twilight.jpg", focus: [0.55, 0.38], by: "Frederic Edwin Church, Twilight in the Wilderness (1860)" }, ink: "light", tone: LIGHT, font: "amiri", spots: [TOP, MIDDLE] },
  { id: "kuindzhi-red-sunset", name: "Red sunset", set: "warm", art: { src: "art/kuindzhi-red-sunset.jpg", focus: [0.5, 0.45], by: "Arkhip Kuindzhi, Red Sunset on the Dnieper (1905–08)" }, ink: "light", tone: LIGHT, font: "amiri", spots: [BOTTOM, TOP] },
  { id: "ember", name: "Ember", set: "warm", paint: swirl(["#1a0305", "#4a0a10", "#86202a", "#c26a3a", "#e8b870"], 0.5, 0.42, "rgba(255,210,150,0.35)"), ink: "light", tone: LIGHT, font: "cormorant", spots: [MIDDLE, BOTTOM] },
  { id: "dusk", name: "Dusk", set: "warm", paint: dusk, ink: "light", tone: LIGHT, font: "amiri", spots: [TOP, MIDDLE] },
  // Paper
  { id: "constable-clouds", name: "Clouds", set: "light", art: { src: "art/constable-clouds.jpg", focus: [0.45, 0.4], by: "John Constable, Cloud Study (c. 1822)" }, ink: "dark", tone: INK, font: "fraunces", spots: [MIDDLE, TOP, BOTTOM] },
  { id: "ink", name: "Ink", set: "light", paint: inkWash, ink: "dark", tone: INK, font: "fraunces", spots: [TOP, MIDDLE] },
  { id: "constable-storm-clouds", name: "Storm clouds", set: "light", art: { src: "art/constable-storm-clouds.jpg", focus: [0.5, 0.45], by: "John Constable, Cloud Study (1822)" }, ink: "light", tone: LIGHT, font: "cormorant", spots: [MIDDLE, TOP] },
  { id: "sepia", name: "Sepia", set: "light", paint: swirl(["#2a241c", "#5a4e3e", "#8f8068", "#c9bca2", "#efe6d2"], 0.58, 0.36, "rgba(255,248,230,0.35)"), ink: "light", tone: LIGHT, font: "cormorant", spots: [BOTTOM, MIDDLE] },
  // Lunar
  { id: "kuindzhi-moonlit", name: "Moonlit", set: "night", art: { src: "art/kuindzhi-moonlit.jpg", focus: [0.46, 0.3], by: "Arkhip Kuindzhi, Moonlit Night on the Dnieper (1880)" }, ink: "light", tone: SILVER, font: "cormorant", spots: [MIDDLE, BOTTOM] },
  { id: "night-sea", name: "Night sea", set: "night", paint: nightSea, ink: "light", tone: SILVER, font: "cormorant", spots: [MIDDLE, TOP] },
  { id: "homer-storm-morning", name: "After the storm", set: "night", art: { src: "art/homer-storm-morning.jpg", focus: [0.5, 0.45], by: "Winslow Homer, Early Morning After a Storm at Sea (1900–02)" }, ink: "light", tone: SILVER, font: "jost", spots: [TOP, MIDDLE] },
  { id: "vortex", name: "Vortex", set: "night", paint: swirl(["#05080f", "#141f33", "#3a4c68", "#8a9cb4", "#e4ebf3"], 0.5, 0.38, "rgba(235,242,250,0.4)"), ink: "light", tone: SILVER, font: "cormorant", spots: [BOTTOM, MIDDLE] },
];
/** All the grounds, the paler ones first (the site's own look is paper): the reader chooses among them all. */
export const groundsOf = () => [...GROUNDS.filter((g) => g.set === "light"), ...GROUNDS.filter((g) => g.set !== "light")];

/** a painting's image, fetched once */
const images = new Map<string, Promise<HTMLImageElement>>();
function artImage(src: string) {
  let p = images.get(src);
  if (!p) {
    const img = new Image();
    img.decoding = "async";
    img.src = `${import.meta.env.BASE_URL}${src}`;
    p = img.decode().then(() => img);
    p.catch(() => images.delete(src));
    images.set(src, p);
  }
  return p;
}

/** The ground drawn whole over W×H: a painting cropped round its focus, or brushwork painted. */
export async function drawGround(g: CanvasRenderingContext2D, gr: Ground, W: number, H: number, seed: number) {
  if (gr.art) {
    const img = await artImage(gr.art.src);
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
    const [fx, fy] = gr.art.focus;
    const x = Math.min(0, Math.max(W - dw, W / 2 - fx * dw)), y = Math.min(0, Math.max(H - dh, H / 2 - fy * dh));
    g.drawImage(img, x, y, dw, dh);
  } else gr.paint?.(g, W, H, seed);
}

/** a small picture of a ground, for choosing it (painted ones drawn small, once) */
const thumbs = new Map<string, string>();
export function groundThumb(gr: Ground) {
  if (gr.art) return `${import.meta.env.BASE_URL}${gr.art.src.replace(/\.jpg$/, "-t.jpg")}`;
  let t = thumbs.get(gr.id);
  if (!t) {
    const c = document.createElement("canvas");
    c.width = c.height = 160;
    gr.paint?.(c.getContext("2d")!, 160, 160, 7);
    t = c.toDataURL("image/jpeg", 0.8);
    thumbs.set(gr.id, t);
  }
  return t;
}
