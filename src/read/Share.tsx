import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Download, ImageIcon, Link2, X as Close } from "lucide-react";
import { EASE_OUT, cn, copyText } from "@/lib/utils";
import { ayn, drawingHats, nameMarks } from "@/lib/names";
import type { ThemeId } from "@/lib/themes";
import { FONTS, drawGround, groundThumb, groundsOf, type FontId, type Ground, type Spot } from "./grounds";

export type ShareFormat = "square" | "landscape" | "story";
const SIZES: Record<ShareFormat, [number, number]> = { square: [1080, 1080], landscape: [1600, 900], story: [1080, 1920] };

export type ShareContent = {
  arabic: string;
  translation: string;
  surahName: string;
  ref: string;
  url: string;
  surah?: number;
  script?: "uthmani" | "indopak";
  theme?: ThemeId; // its grounds are this theme's
  /** a part of the ayah (a highlight): `arabic` and `translation` are then the part and the other side whole */
  part?: SharePart;
};

/**
 * Sharing a part of an ayah: the side the reader highlighted, and the other side's words to choose
 * from, with a first guess at the ones that go with the part (align.ts).
 */
export type SharePart = {
  side: "ar" | "tr";
  other: string[];
  guess: [number, number] | null;
};

/** How the picture is made: what it is laid on, the lettering, where the words sit, and grain. */
export type ShareStyle = { ground: Ground; font: FontId; spot: Spot["id"]; grain: boolean };

/* ── the image ──────────────────────────────────────────────────── */

export function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > width && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

let grainTile: HTMLCanvasElement | null = null;
/** a tile of fine noise (the notes' pictures lay it lightly over themselves) */
export function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d")!;
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 22;
  }
  g.putImageData(img, 0, 0);
  return (grainTile = c);
}
// film grain: mid-grey noise laid over the whole picture in overlay, so it lives in its lights and darks alike
let filmTile: HTMLCanvasElement | null = null;
function film() {
  if (filmTile) return filmTile;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() + Math.random() - 1) * 120;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (filmTile = c);
}

/** how bright a part of the picture is: its mean and its spread (0 to 1) */
function brightness(c: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const s = document.createElement("canvas");
  s.width = s.height = 48;
  const g = s.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(c, Math.max(0, x), Math.max(0, y), Math.max(1, w), Math.max(1, h), 0, 0, 48, 48);
  const d = g.getImageData(0, 0, 48, 48).data;
  let sum = 0, sq = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    sum += l;
    sq += l * l;
  }
  const mean = sum / n;
  return { mean, spread: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

/**
 * The ayah laid on its ground: the Arabic, its translation and the reference, set as large as the
 * place chosen for them allows. So the words always read, the ground under them is quietly
 * darkened (or, under dark ink, lightened) just as far as it must be, softly, with no edge to it.
 */
export async function renderAyahImage(o: ShareContent, format: ShareFormat, style: ShareStyle): Promise<Blob> {
  const [W, H] = SIZES[format];
  const S = Math.min(W, H);
  const font = FONTS.find((f) => f.id === style.font) ?? FONTS[0];
  const gr = style.ground;
  const arFont = o.script === "indopak" ? '"IndoPak"' : '"KFGQPC HAFS"';
  await Promise.all([document.fonts.load(`64px ${arFont}`), ...font.load.map((f) => document.fonts.load(f))]).catch(() => {});
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  await drawGround(g, gr, W, H, o.surah ?? 1);

  // the place for the words (in a landscape picture, a line of translation stays a comfortable length)
  const spot = gr.spots.find((s) => s.id === style.spot) ?? gr.spots[0];
  let [x0, y0, x1, y1] = spot.box;
  if (format === "landscape" && x1 - x0 > 0.7) [x0, x1] = [0.5 - 0.33, 0.5 + 0.33].map((v) => v + ((spot.box[0] + spot.box[2]) / 2 - 0.5)) as [number, number];
  if (format === "story") [y0, y1] = [0.1 + y0 * 0.8, 0.1 + y1 * 0.8];
  const box = { x: x0 * W, y: y0 * H, w: (x1 - x0) * W, h: (y1 - y0) * H };
  const cx = box.x + box.w / 2;

  let ar = S * (format === "landscape" ? 0.1 : 0.085);
  let tr = ar * 0.55;
  const refPx = () => Math.max(16, Math.round(S * 0.021));
  let arLines: string[] = [], trLines: string[] = [];
  const gap = () => ar * 0.7;
  const height = () =>
    arLines.length * ar * 1.9 + (trLines.length ? (arLines.length ? gap() : 0) + trLines.length * tr * 1.42 : 0) + refPx() * 3.2;
  for (let i = 0; i < 70; i++) {
    g.font = `${ar}px ${arFont}`;
    g.direction = "rtl";
    arLines = o.arabic ? wrap(g, o.arabic, box.w) : [];
    g.direction = "ltr";
    g.font = font.tr(tr);
    trLines = o.translation ? wrap(g, o.translation, box.w) : [];
    if (height() <= box.h || ar < 20) break;
    ar *= 0.95;
    tr = Math.max(16, ar * 0.55);
  }
  const total = height();
  const top = spot.id === "top" ? box.y : spot.id === "bottom" ? box.y + box.h - total : box.y + (box.h - total) / 2;

  // the words always read: the ground under them darkened (or lightened) as far as it must be
  const widest = Math.max(
    ...(() => {
      g.font = `${ar}px ${arFont}`;
      const a = arLines.map((l) => g.measureText(l).width);
      g.font = font.tr(tr);
      return [...a, ...trLines.map((l) => g.measureText(l).width), 10];
    })(),
  );
  const bx = cx - widest / 2 - S * 0.03, by = top - S * 0.02, bw = widest + S * 0.06, bh = total + S * 0.03;
  const { mean, spread } = brightness(c, bx, by, bw, bh);
  const light = gr.ink === "light";
  const want = light ? 0.26 : 0.8;
  let a = light ? 1 - want / Math.max(0.01, mean) : (want - mean) / Math.max(0.01, 1 - mean);
  a = Math.max(0, Math.min(0.78, a + (spread > 0.1 ? (spread - 0.1) * 1.4 : 0)));
  if (a > 0.02) {
    g.save();
    g.translate(cx, top + total / 2);
    const rx = bw * 0.78, ry = bh * 0.86;
    g.scale(rx / ry, 1);
    const veil = g.createRadialGradient(0, 0, 0, 0, 0, ry);
    const col = light ? "8,4,4" : "244,238,224";
    veil.addColorStop(0, `rgba(${col},${a})`);
    veil.addColorStop(0.55, `rgba(${col},${a * 0.85})`);
    veil.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = veil;
    g.fillRect(-ry, -ry, ry * 2, ry * 2);
    g.restore();
  }

  // the words, with a breath of shadow under them (no outline)
  g.shadowColor = light ? "rgba(0,0,0,0.45)" : "rgba(255,250,238,0.5)";
  g.shadowBlur = S * 0.012;
  let y = top;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = gr.tone.ar;
  g.direction = "rtl";
  g.font = `${ar}px ${arFont}`;
  for (const l of arLines) {
    g.fillText(l, cx, y + ar * 0.95);
    y += ar * 1.9;
  }
  if (trLines.length) {
    if (arLines.length) y += gap();
    g.direction = "ltr";
    g.fillStyle = gr.tone.tr;
    g.font = font.tr(tr);
    for (const l of trLines) {
      g.fillText(l, cx, y + tr * 0.71);
      y += tr * 1.42;
    }
  }
  // the reference, small and spaced, under it all
  g.direction = "ltr";
  g.fillStyle = gr.tone.ref;
  g.font = font.ref(refPx());
  if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(refPx() * 0.14)}px`;
  drawingHats(g, () => g.fillText(`${ayn(o.surahName)}  ·  ${o.ref}`, cx, y + refPx() * 1.9));
  if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = "0px";
  g.shadowColor = "transparent";

  // the film's grain over everything
  if (style.grain) {
    g.save();
    g.globalCompositeOperation = "overlay";
    g.globalAlpha = 0.13;
    g.fillStyle = g.createPattern(film(), "repeat")!;
    g.fillRect(0, 0, W, H);
    g.restore();
  }
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/jpeg", 0.93));
}

/* ── the dialog ─────────────────────────────────────────────────── */

type Dest = "story" | "post" | "x";
const DEST_FORMAT: Record<Dest, ShareFormat> = { story: "story", post: "square", x: "landscape" };

type WithIt = "part" | "whole" | "none";

/** words taken from within a sentence: no quotation mark left open or closed at its edges, no comma left hanging */
function tidy(s: string) {
  let t = s.trim();
  const opens = (x: string) => (x.match(/[“‘"]/g) ?? []).length;
  const closes = (x: string) => (x.match(/[”’"]/g) ?? []).length;
  if (/^[“‘"]/.test(t) && opens(t) > closes(t)) t = t.slice(1);
  if (/[”’"][.,;:!?]*$/.test(t) && closes(t) > opens(t)) t = t.replace(/[”’"]([.,;:!?]*)$/, "$1");
  return t.replace(/[,;:]$/, "");
}

// the last choices made for each theme's pictures, kept while the page is open
const lastStyle: Partial<Record<ThemeId, { ground: string; font: FontId; spot: Spot["id"]; grain: boolean }>> = {};

export function ShareDialog({ content: given, onClose, onToast }: { content: ShareContent | null; onClose: () => void; onToast: (m: string) => void }) {
  const [format, setFormat] = useState<ShareFormat>("square");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blobs = useRef(new Map<string, Blob>());

  // what it is laid on, its lettering, where the words sit, its grain: the theme's own to choose from
  const theme: ThemeId = given?.theme ?? "crimson";
  const grounds = useMemo(() => groundsOf(theme), [theme]);
  const [groundId, setGroundId] = useState(grounds[0].id);
  const ground = grounds.find((g) => g.id === groundId) ?? grounds[0];
  const [font, setFont] = useState<FontId>(ground.font);
  const [spot, setSpot] = useState<Spot["id"]>(ground.spots[0].id);
  const [grainOn, setGrainOn] = useState(true);
  useEffect(() => {
    if (!given) return;
    const l = lastStyle[theme];
    const gr = grounds.find((g) => g.id === l?.ground) ?? grounds[0];
    setGroundId(gr.id);
    setFont(l?.font ?? gr.font);
    setSpot(l && gr.spots.some((s) => s.id === l.spot) ? l.spot : gr.spots[0].id);
    setGrainOn(l?.grain ?? true);
  }, [given, theme, grounds]);
  const pickGround = (gr: Ground) => {
    setGroundId(gr.id);
    setFont(gr.font);
    if (!gr.spots.some((s) => s.id === spot)) setSpot(gr.spots[0].id);
  };
  useEffect(() => {
    lastStyle[theme] = { ground: groundId, font, spot, grain: grainOn };
  }, [theme, groundId, font, spot, grainOn]);
  const style: ShareStyle = { ground, font, spot: ground.spots.some((s) => s.id === spot) ? spot : ground.spots[0].id, grain: grainOn };
  const styleKey = `${style.ground.id}|${style.font}|${style.spot}|${style.grain}`;

  // a part of an ayah: the other side goes with it in part (the words chosen), whole, or not at all
  const part = given?.part;
  const [withIt, setWithIt] = useState<WithIt>("part");
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [anchor, setAnchor] = useState<number | null>(null);
  useEffect(() => {
    if (!part) return;
    setWithIt("part");
    setRange(part.guess ?? [0, part.other.length - 1]);
    setAnchor(null);
  }, [part]);
  // (while the first word is tapped and the last is not yet, the picture waits: drawn once, at the end)
  const marked: [number, number] = anchor != null ? [anchor, anchor] : range;
  const content = useMemo<ShareContent | null>(() => {
    if (!given || !part) return given;
    const other = withIt === "none" ? "" : withIt === "whole" ? (part.side === "ar" ? given.translation : given.arabic) : tidy(part.other.slice(range[0], range[1] + 1).join(" "));
    return part.side === "ar" ? { ...given, translation: other } : { ...given, arabic: other };
  }, [given, part, withIt, range]);
  const tapWord = (i: number) => {
    if (anchor == null) setAnchor(i);
    else {
      setRange([Math.min(anchor, i), Math.max(anchor, i)]);
      setAnchor(null);
    }
  };

  useEffect(() => {
    blobs.current.clear();
  }, [given]);

  const get = async (f: ShareFormat) => {
    if (!content) throw new Error("nothing to share");
    const id = `${f}\n${styleKey}\n${content.arabic}\n${content.translation}`;
    let b = blobs.current.get(id);
    if (!b) {
      b = await renderAyahImage(content, f, style);
      blobs.current.set(id, b);
    }
    return b;
  };

  useEffect(() => {
    if (!content) return;
    let alive = true;
    let made: string | null = null;
    get(format)
      .then((b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => alive && onToast("The picture couldn't be drawn. Check your connection."));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, format, styleKey]);

  useEffect(() => {
    if (!given) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [given, onClose]);

  if (!content) return createPortal(<AnimatePresence />, document.body);
  const name = `quran-${content.ref.replace(":", "-")}`;

  const download = (b: Blob, f: ShareFormat) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `${name}-${f}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const shareTo = async (d: Dest) => {
    const f = DEST_FORMAT[d];
    setFormat(f);
    setBusy(true);
    try {
      const b = await get(f);
      const file = new File([b], `${name}-${f}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        // on phones this opens the share sheet, where Instagram (story or post) and X appear
        await navigator.share({ files: [file], title: `${ayn(content.surahName)} ${content.ref}` });
      } else {
        download(b, f);
        if (d === "x") {
          const text = `${content.translation || content.arabic}\n— ${ayn(content.surahName)} ${content.ref}`;
          window.open(`https://x.com/intent/post?text=${encodeURIComponent(text.slice(0, 240))}&url=${encodeURIComponent(content.url)}`, "_blank", "noopener");
          onToast("Image saved. Attach it to the post that just opened.");
        } else onToast(d === "story" ? "Image saved. Add it to your Instagram story from your gallery." : "Image saved. Post it on Instagram from your gallery.");
      }
    } catch {
      /* the share sheet was dismissed */
    } finally {
      setBusy(false);
    }
  };

  const seg = "flex border border-white/15 p-0.5";
  const segBtn = (on: boolean) => cn("label relative flex-1 py-2 transition-colors", on ? "text-[#0a0f18]" : "text-white/60 hover:text-white");
  return createPortal(
    <AnimatePresence>
      <motion.div
        key="share"
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          role="dialog"
          aria-label={`Share ${content.ref}`}
          className="theme-dialog relative flex max-h-[92vh] w-full max-w-[920px] flex-col overflow-hidden border-[3px] border-[#06080c] bg-[#0a0f18] text-[#efe9dd] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] md:max-h-[88vh] md:flex-row"
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          <div className="grain-local" />
          {/* preview */}
          <div className="relative flex min-h-[200px] shrink-0 items-center justify-center bg-black/30 p-4 md:min-h-[240px] md:flex-1 md:shrink md:p-8">
            {url ? (
              <motion.img
                key={url}
                src={url}
                alt={`${ayn(content.surahName)} ${content.ref} as an image`}
                className={cn("max-w-full object-contain shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] md:max-h-[70vh]", part ? "max-h-[30vh]" : "max-h-[40vh]")}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
              />
            ) : (
              <span className="label text-white/40">Drawing the image…</span>
            )}
          </div>
          {/* controls */}
          <div className="thin-scroll relative flex min-h-0 w-full flex-col gap-5 overflow-y-auto border-t border-white/10 p-5 md:w-[350px] md:border-l md:border-t-0 md:p-7">
            <div className="flex items-start justify-between">
              <div>
                <div className="label text-white/45">{part ? "Share a part" : "Share"}</div>
                <div className="mt-1 font-serif text-[22px] italic">
                  {nameMarks(content.surahName)} <span className="font-mono text-[14px] not-italic text-white/60">{content.ref}</span>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center text-white/60 hover:bg-white/10 hover:text-white">
                <Close size={16} />
              </button>
            </div>

            {/* what it is laid on */}
            <div>
              <div className="label mb-2 text-white/45">Background</div>
              <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Background">
                {grounds.map((gr) => (
                  <button
                    key={gr.id}
                    type="button"
                    role="radio"
                    aria-checked={gr.id === ground.id}
                    title={gr.art ? `${gr.name}: ${gr.art.by}` : gr.name}
                    onClick={() => pickGround(gr)}
                    className={cn("group relative h-14 w-14 shrink-0 overflow-hidden transition-all", gr.id === ground.id ? "ring-1 ring-white ring-offset-2 ring-offset-[#0a0f18]" : "opacity-70 hover:opacity-100")}
                  >
                    <img src={groundThumb(gr)} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" />
                  </button>
                ))}
              </div>
              <div className="mt-1.5 truncate text-[11.5px] text-white/45">{ground.art ? ground.art.by : `${ground.name} · painted for this reader`}</div>
            </div>

            {/* the lettering, and where the words sit */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="label mb-2 text-white/45">Lettering</div>
                <div className={seg}>
                  {FONTS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFont(f.id)}
                      aria-pressed={font === f.id}
                      className={cn("relative min-w-0 flex-1 px-1 py-1.5 transition-colors", font === f.id ? "text-[#0a0f18]" : "text-white/65 hover:text-white")}
                    >
                      {font === f.id && <motion.span layoutId="share-font" className="absolute inset-0 bg-[#efe9dd]" transition={{ duration: 0.3, ease: EASE_OUT }} />}
                      <span className="relative block truncate" style={{ font: f.tr(15.5), lineHeight: 1.3 }}>
                        {f.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <div className="label mb-2 text-white/45">Place</div>
                  <div className={seg}>
                    {(["top", "middle", "bottom"] as const)
                      .filter((id) => ground.spots.some((s) => s.id === id))
                      .map((id) => (
                        <button key={id} type="button" onClick={() => setSpot(id)} aria-pressed={style.spot === id} className={segBtn(style.spot === id)}>
                          {style.spot === id && <motion.span layoutId="share-spot" className="absolute inset-0 bg-[#efe9dd]" transition={{ duration: 0.3, ease: EASE_OUT }} />}
                          <span className="relative">{id === "top" ? "Top" : id === "middle" ? "Middle" : "Bottom"}</span>
                        </button>
                      ))}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={grainOn}
                  onClick={() => setGrainOn(!grainOn)}
                  className="label flex h-[38px] shrink-0 items-center gap-2 border border-white/15 px-3 text-white/60 transition-colors hover:text-white"
                >
                  Grain
                  <span className={cn("pill relative inline-block h-[11px] w-[20px] border border-current transition-colors duration-300", grainOn && "border-[#efe9dd]")}>
                    <span className={cn("pill absolute top-[1.5px] h-[6px] w-[6px] bg-current transition-all duration-300", grainOn ? "left-[11px] bg-[#efe9dd]" : "left-[1.5px]")} />
                  </span>
                </button>
              </div>
            </div>

            {part && (
              <div>
                <div className="label mb-2 text-white/45">{part.side === "ar" ? "With its translation" : "With its Arabic"}</div>
                <div className={seg}>
                  {(["part", "whole", "none"] as WithIt[]).map((w) => (
                    <button key={w} type="button" onClick={() => setWithIt(w)} aria-pressed={withIt === w} className={segBtn(withIt === w)}>
                      {withIt === w && <motion.span layoutId="share-with" className="absolute inset-0 bg-[#efe9dd]" transition={{ duration: 0.3, ease: EASE_OUT }} />}
                      <span className="relative">{w === "part" ? "Its words" : w === "whole" ? "Whole ayah" : "None"}</span>
                    </button>
                  ))}
                </div>
                <AnimatePresence initial={false}>
                  {withIt === "part" && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="overflow-hidden">
                      <div
                        dir={part.side === "ar" ? "ltr" : "rtl"}
                        className={cn("thin-scroll mt-2 max-h-[150px] overflow-y-auto border border-white/10 px-2.5 py-2", part.side === "ar" ? "font-serif text-[14.5px] leading-[1.75]" : "quran text-right text-[20px] leading-[2]")}
                      >
                        {part.other.map((w, i) => {
                          const inIt = i >= marked[0] && i <= marked[1];
                          return (
                            <span key={i}>
                              <button
                                type="button"
                                onClick={() => tapWord(i)}
                                className={cn("transition-colors", inIt ? "bg-[#efe9dd] text-[#0a0f18] shadow-[0_0_0_1px_#efe9dd]" : "text-white/55 hover:text-white", anchor === i && "outline outline-1 outline-[#c9a24a]")}
                              >
                                {w}
                              </button>
                              {/* (the space between two chosen words is chosen too: one strip) */}
                              <span className={i >= marked[0] && i < marked[1] ? "bg-[#efe9dd] shadow-[0_0_0_1px_#efe9dd]" : undefined}> </span>
                            </span>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 text-[11.5px] leading-snug text-white/45">
                        {anchor == null ? "The words that go with it are marked. To change them, tap the first word, then the last." : "Now tap the last word."}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div>
              <div className="label mb-2 text-white/45">Shape</div>
              <div className={seg}>
                {(["square", "landscape", "story"] as ShareFormat[]).map((f) => (
                  <button key={f} type="button" onClick={() => setFormat(f)} aria-pressed={format === f} className={segBtn(format === f)}>
                    {format === f && <motion.span layoutId="share-shape" className="absolute inset-0 bg-[#efe9dd]" transition={{ duration: 0.3, ease: EASE_OUT }} />}
                    <span className="relative">{f === "square" ? "Square" : f === "landscape" ? "Landscape" : "Story"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="label mb-2 text-white/45">Send to</div>
              <div className="grid grid-cols-3 gap-1.5">
                <DestBtn onClick={() => shareTo("story")} busy={busy} label="Story" sub="Instagram" glyph={<IgGlyph />} />
                <DestBtn onClick={() => shareTo("post")} busy={busy} label="Post" sub="Instagram" glyph={<IgGlyph />} />
                <DestBtn onClick={() => shareTo("x")} busy={busy} label="Post" sub="X" glyph={<span className="text-[17px] font-semibold leading-none">𝕏</span>} />
              </div>
            </div>

            <div className="flex flex-col">
              <Row icon={<Download size={14} />} label="Save image" onClick={async () => download(await get(format), format)} />
              <Row
                icon={<ImageIcon size={14} />}
                label="Copy image"
                onClick={async () => {
                  try {
                    // the clipboard takes PNG only
                    const bmp = await createImageBitmap(await get(format));
                    const cv = document.createElement("canvas");
                    cv.width = bmp.width;
                    cv.height = bmp.height;
                    cv.getContext("2d")!.drawImage(bmp, 0, 0);
                    const png = await new Promise<Blob>((r) => cv.toBlob((b) => r(b!), "image/png"));
                    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
                    onToast("Image copied");
                  } catch {
                    onToast("This browser can't copy images — use Save image");
                  }
                }}
              />
              <Row
                icon={<Copy size={14} />}
                label="Copy text"
                onClick={async () => {
                  // (a part: its words alone, as a highlight copies)
                  const text = part ? [content.arabic, content.translation] : [content.arabic, content.translation, `— ${ayn(content.surahName)} ${content.ref}`];
                  (await copyText(text.filter(Boolean).join("\n\n"))) && onToast(part ? "Copied" : `Copied ${content.ref}`);
                }}
              />
              <Row icon={<Link2 size={14} />} label="Copy link" onClick={async () => (await copyText(content.url)) && onToast("Link copied")} />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function DestBtn({ onClick, label, sub, glyph, busy }: { onClick: () => void; label: string; sub: string; glyph: React.ReactNode; busy: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="group flex flex-col items-start gap-3 border border-white/15 p-3 text-left transition-colors hover:border-white/50 hover:bg-white/5 disabled:opacity-50"
    >
      <span className="text-white/80 transition-transform duration-300 group-hover:-translate-y-0.5">{glyph}</span>
      <span>
        <span className="block text-[13px]">{label}</span>
        <span className="label-sm text-white/45">{sub}</span>
      </span>
    </button>
  );
}

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 border-t border-white/10 py-2.5 text-left text-white/75 transition-colors hover:text-white">
      {icon}
      <span className="text-[13px]">{label}</span>
    </button>
  );
}

function IgGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
