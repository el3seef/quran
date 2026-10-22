/**
 * One frame of an ayah video, drawn on a canvas: the painting (graded, softened, moving slowly), a
 * shade where the words are, the words (small, as in a quiet edit: the Arabic, its meaning under it),
 * the grain and dust of film over all, the edges darkened, and black at the start and the end. The
 * same drawing makes the preview and the video, so what is seen is what is made.
 */

export type Motion = "still" | "drift" | "breathe" | "pan";
export type Grade = "natural" | "warm" | "cool" | "faded" | "mono";
export type Place = "upper" | "centre" | "lower" | "foot" | "free";
export type Look = { motion: Motion; grade: Grade; grain: number; vignette: number; haze: number; dust: boolean; flicker: boolean };
export type Words = {
  mode: "both" | "arabic" | "translation";
  script: "uthmani" | "indopak";
  font: "serif" | "sans" | "italic";
  brackets: boolean;
  size: number; // 0.8 – 1.4 of the quiet size
  place: Place;
  at: { x: number; y: number }; // where the words stand when placed freely (their middle, as fractions)
};
/** Words on screen for a while: an ayah, or a part of a long one. */
export type Cue = { start: number; end: number; ar: string; tr: string };

const FILTERS: Record<Grade, string> = {
  natural: "brightness(0.86) saturate(0.95)",
  warm: "sepia(0.28) saturate(1.12) brightness(0.84) contrast(1.04)",
  cool: "hue-rotate(-14deg) saturate(0.8) brightness(0.82) contrast(1.05)",
  faded: "contrast(0.82) brightness(0.9) saturate(0.72)",
  mono: "grayscale(1) contrast(1.08) brightness(0.8)",
};

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** A number from a seed, the same every time (the grain and the dust, drawn again identically). */
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

export const FONTS = {
  uthmani: '"KFGQPC HAFS", "Amiri Quran", serif',
  indopak: '"IndoPak", "KFGQPC HAFS", serif',
  serif: '"Cormorant Garamond Variable", "EB Garamond Variable", Georgia, serif',
  italic: '"Cormorant Garamond Variable", "EB Garamond Variable", Georgia, serif',
  sans: '"Jost Variable", "Geist Variable", system-ui, sans-serif',
};

/** Wrap words to a width (the canvas measuring each line). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(t).width > max) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export class Scene {
  W: number;
  H: number;
  private ctx: CanvasRenderingContext2D;
  private art: HTMLCanvasElement; // the painting, graded
  private soft: HTMLCanvasElement; // the same, blurred (its glow)
  private vign: HTMLCanvasElement;
  private grains: HTMLCanvasElement[];
  private texts = new Map<Cue, HTMLCanvasElement & { cy: number }>();
  constructor(
    public canvas: HTMLCanvasElement,
    private img: HTMLImageElement,
    public look: Look,
    public words: Words,
    public cues: Cue[],
    public duration: number,
    private seed = 1,
  ) {
    this.W = canvas.width;
    this.H = canvas.height;
    this.ctx = canvas.getContext("2d")!;
    // the painting, graded once (not at every frame)
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const k = Math.min(1, 2400 / Math.max(iw, ih));
    this.art = canvasOf(iw * k, ih * k);
    const a = this.art.getContext("2d")!;
    a.filter = FILTERS[look.grade];
    a.drawImage(img, 0, 0, this.art.width, this.art.height);
    this.soft = canvasOf(this.art.width / 4, this.art.height / 4);
    const s = this.soft.getContext("2d")!;
    s.filter = `blur(${Math.max(2, this.soft.width / 120)}px)`;
    s.drawImage(this.art, 0, 0, this.soft.width, this.soft.height);
    // the edges darkened
    this.vign = canvasOf(this.W, this.H);
    const v = this.vign.getContext("2d")!;
    const g = v.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.25, this.W / 2, this.H / 2, Math.hypot(this.W, this.H) * 0.62);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${0.85 * look.vignette})`);
    v.fillStyle = g;
    v.fillRect(0, 0, this.W, this.H);
    // film grain: a few tiles of noise, one drawn at each frame
    this.grains = [0, 1, 2, 3].map((t) => {
      const c = canvasOf(256, 256);
      const x = c.getContext("2d")!;
      const d = x.createImageData(256, 256);
      for (let i = 0; i < d.data.length; i += 4) {
        const n = 128 + (rnd(i * 0.37 + t * 9973 + seed) - 0.5) * 255;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = n;
        d.data[i + 3] = 255;
      }
      x.putImageData(d, 0, 0);
      return c;
    });
  }

  /** The words of a cue, set once on a canvas of their own (Arabic above, its meaning below). */
  private textOf(cue: Cue) {
    let c = this.texts.get(cue);
    if (c) return c;
    const { W, H, words } = this;
    const base = Math.min(W, H);
    const arPx = Math.round(base * 0.043 * words.size);
    const trPx = Math.round(base * 0.0255 * words.size);
    const max = W * (W > H ? 0.62 : 0.8);
    const m = canvasOf(10, 10).getContext("2d")!;
    const showAr = words.mode !== "translation" && !!cue.ar;
    const showTr = words.mode !== "arabic" && !!cue.tr;
    m.font = `${arPx}px ${FONTS[words.script]}`;
    m.direction = "rtl";
    const ar = showAr ? wrap(m, words.brackets ? `﴿${cue.ar}﴾` : cue.ar, max) : [];
    const trFont = `${words.font === "italic" ? "italic " : ""}${words.font === "sans" ? 300 : 500} ${words.font === "sans" ? Math.round(trPx * 0.92) : trPx}px ${FONTS[words.font]}`;
    m.font = trFont;
    m.direction = "ltr";
    const tr = showTr ? wrap(m, cue.tr, max * 0.94) : [];
    const arLH = arPx * 1.75, trLH = trPx * 1.5, gap = showAr && showTr ? arPx * 0.55 : 0;
    const h = ar.length * arLH + gap + tr.length * trLH;
    const pad = arPx;
    c = Object.assign(canvasOf(W, h + pad * 2), { cy: 0 });
    const x = c.getContext("2d")!;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.shadowColor = "rgba(0,0,0,0.55)";
    x.shadowBlur = arPx * 0.45;
    let y = pad;
    x.fillStyle = "rgba(247,242,232,0.97)";
    x.font = `${arPx}px ${FONTS[words.script]}`;
    x.direction = "rtl";
    for (const l of ar) {
      x.fillText(l, W / 2, y + arLH / 2);
      y += arLH;
    }
    y += gap;
    x.fillStyle = "rgba(240,234,224,0.9)";
    x.font = trFont;
    x.direction = "ltr";
    x.shadowBlur = trPx * 0.6;
    for (const l of tr) {
      x.fillText(l, W / 2, y + trLH / 2);
      y += trLH;
    }
    this.texts.set(cue, c);
    return c;
  }

  /** How many lines a cue's words take (to split an ayah too long for the screen). */
  static measure(W: number, H: number, words: Words, ar: string, tr: string) {
    const base = Math.min(W, H);
    const arPx = base * 0.043 * words.size, trPx = base * 0.0255 * words.size;
    const max = W * (W > H ? 0.62 : 0.8);
    const m = canvasOf(10, 10).getContext("2d")!;
    m.font = `${arPx}px ${FONTS[words.script]}`;
    const a = words.mode !== "translation" && ar ? wrap(m, ar, max).length : 0;
    m.font = `${words.font === "italic" ? "italic " : ""}500 ${trPx}px ${FONTS[words.font]}`;
    const t = words.mode !== "arabic" && tr ? wrap(m, tr, max * 0.94).length : 0;
    return { ar: a, tr: t };
  }

  /** Where the words stand: their middle, by the placing chosen. */
  centre() {
    const { words, W, H } = this;
    const y = { upper: 0.3, centre: 0.5, lower: 0.68, foot: 0.82, free: words.at.y }[words.place];
    const x = words.place === "free" ? words.at.x : 0.5;
    return { x: x * W, y: y * H };
  }

  draw(t: number) {
    const { ctx, W, H, look, art } = this;
    const T = Math.max(0.001, this.duration);
    const p = Math.min(1, Math.max(0, t / T));
    // the painting, filling the frame, moving as chosen
    const iw = art.width, ih = art.height;
    const cover = Math.max(W / iw, H / ih);
    let k = 1.04, fx = 0.5, fy = 0.5;
    if (look.motion === "drift") (k = 1.06 + 0.1 * p), (fx = 0.47 + 0.06 * p), (fy = 0.49 + 0.02 * p);
    else if (look.motion === "breathe") k = 1.08 + 0.025 * Math.sin((t / 14) * Math.PI * 2);
    else if (look.motion === "pan") (k = 1.06), (fx = 0.2 + 0.6 * p);
    const s = cover * k, dw = iw * s, dh = ih * s;
    const ox = Math.min(0, Math.max(W - dw, W / 2 - fx * dw)), oy = Math.min(0, Math.max(H - dh, H / 2 - fy * dh));
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(art, ox, oy, dw, dh);
    // its glow: the blurred painting laid over in light, softening its detail
    if (look.haze > 0) {
      ctx.globalAlpha = 0.55 * look.haze;
      ctx.drawImage(this.soft, ox, oy, dw, dh);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.22 * look.haze;
      ctx.drawImage(this.soft, ox, oy, dw, dh);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    // a shade where the words stand
    const c = this.centre();
    const sh = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(W, H) * 0.45);
    sh.addColorStop(0, "rgba(0,0,0,0.32)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, W, H);
    // the words: each cue fading in and out over its neighbour
    for (const cue of this.cues) {
      const a = Math.min(ease((t - (cue.start - 0.3)) / 0.6), ease((cue.end + 0.3 - t) / 0.6));
      if (a <= 0) continue;
      const tc = this.textOf(cue);
      const top = Math.min(H - tc.height - H * 0.04, Math.max(H * 0.04, c.y - tc.height / 2));
      ctx.globalAlpha = a;
      ctx.drawImage(tc, c.x - W / 2, top);
    }
    ctx.globalAlpha = 1;
    // dust in the light
    if (look.dust) {
      ctx.fillStyle = "#fff";
      const n = 34, u = Math.min(W, H) / 1080;
      for (let i = 0; i < n; i++) {
        const sp = 0.004 + rnd(i * 3.1) * 0.012;
        const x = ((rnd(i) + t * sp * (rnd(i + 9) - 0.5) * 2) % 1 + 1) % 1;
        const y = ((rnd(i * 7.3) - t * sp * 0.6) % 1 + 1) % 1;
        ctx.globalAlpha = (0.08 + rnd(i * 1.7) * 0.22) * (0.6 + 0.4 * Math.sin(t * (0.6 + rnd(i)) + i));
        ctx.beginPath();
        ctx.arc(x * W, y * H, (0.6 + rnd(i * 2.3) * 1.6) * u * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // the edges darkened, the film's grain, its flicker
    ctx.drawImage(this.vign, 0, 0);
    if (look.grain > 0) {
      const f = Math.floor(t * 24);
      const g = this.grains[f % 4];
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.5 * look.grain;
      const pat = ctx.createPattern(g, "repeat")!;
      const sc = Math.max(1, Math.min(W, H) / 900);
      pat.setTransform(new DOMMatrix().translate(rnd(f) * 256, rnd(f + 1) * 256).scale(sc));
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    if (look.flicker) {
      ctx.fillStyle = `rgba(0,0,0,${0.035 * rnd(Math.floor(t * 12))})`;
      ctx.fillRect(0, 0, W, H);
    }
    // from black at the start, to black at the end
    const black = Math.max(1 - ease(t / 1.2), ease((t - (T - 1.4)) / 1.4));
    if (black > 0) {
      ctx.fillStyle = `rgba(0,0,0,${black})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
