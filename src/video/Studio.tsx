import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Dices, Download, LoaderCircle, Pause, Play, Share2, X } from "lucide-react";
import { arabicText, loadSurah, translationText, TRANSLATIONS, type Surah, type SurahData, type Translation } from "@/lib/data";
import { ModeGlyph } from "@/components/glyphs";
import { cn } from "@/lib/utils";
import { recitation, voiceOf, VOICES, type Piece } from "./audio";
import { makeVideo } from "./export";
import { FONTS, Scene, type Cue, type Grade, type Look, type Motion, type Place, type Words } from "./render";
import PAINTINGS from "./paintings.json";

/**
 * An ayah made into a video to share: chosen ayahs, recited by a chosen voice (the reader's own
 * reciters heard in one unbroken stretch of their recitation, from the first ayah's start to the last's end); their words small over a classical painting, as a quiet hand-made edit would set
 * them (the Arabic, its meaning under it); the painting moving slowly under film grain and dust,
 * fading up from black and back to it. Every choice can be made, or all of them left to chance.
 */

type Shape = "9:16" | "4:5" | "1:1" | "5:4" | "4:3" | "16:9";
const SIZES: Record<Shape, [number, number]> = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "5:4": [1350, 1080], "4:3": [1440, 1080], "16:9": [1920, 1080] };
type Choice = {
  s: number;
  from: number;
  to: number;
  voice: string;
  translation: Translation;
  context: boolean;
  bism: boolean;
  painting: string;
  shape: Shape;
  words: Words;
  look: Look;
};
const DEFAULT: Choice = {
  s: 1,
  from: 1,
  to: 7,
  voice: "alafasy",
  translation: "saheeh",
  context: false,
  bism: true,
  painting: "tryon-twilight",
  shape: "9:16",
  words: { mode: "both", script: "uthmani", font: "serif", brackets: true, size: 1, place: "centre", at: { x: 0.5, y: 0.5 } },
  look: { motion: "drift", grade: "warm", grain: 0.55, vignette: 0.7, haze: 0.45, dust: true, flicker: false },
};
const KEY = "ayah-video";
const saved = (): Choice => {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return c ? { ...DEFAULT, ...c, words: { ...DEFAULT.words, ...c.words }, look: { ...DEFAULT.look, ...c.look } } : DEFAULT;
  } catch {
    return DEFAULT;
  }
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const imgs = new Map<string, Promise<HTMLImageElement>>();
function painting(id: string) {
  let p = imgs.get(id);
  if (!p) {
    p = new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = `${import.meta.env.BASE_URL}video/paint/${id}.webp`;
    });
    imgs.set(id, p);
  }
  return p;
}
const MAX_AYAHS = 30;

/** The cues: each ayah's words for the time it is recited; one too long for the screen in parts, each
 *  part for its share of the ayah's time (by its letters). */
function cuesOf(pieces: Piece[], texts: Map<string, { ar: string; tr: string }>, W: number, H: number, words: Words): Cue[] {
  const out: Cue[] = [];
  const maxAr = W > H ? 3 : 5, maxTr = W > H ? 3 : 6;
  for (const p of pieces) {
    const t = texts.get(p.bism ? "bism" : `${p.s}:${p.a}`);
    if (!t) continue;
    const m = Scene.measure(W, H, words, t.ar, t.tr);
    const k = Math.max(1, Math.ceil(m.ar / maxAr), Math.ceil(m.tr / maxTr));
    if (k === 1) {
      out.push({ start: p.start, end: p.end, ar: t.ar, tr: t.tr });
      continue;
    }
    const split = (s: string) => {
      const w = s.split(/\s+/).filter(Boolean);
      const total = s.length, parts: string[][] = [[]];
      let acc = 0;
      for (const x of w) {
        if (acc > (total * parts.length) / k && parts.length < k) parts.push([]);
        parts[parts.length - 1].push(x);
        acc += x.length + 1;
      }
      while (parts.length < k) parts.push([]);
      return parts.map((x) => x.join(" "));
    };
    const ar = split(t.ar), tr = split(t.tr);
    const weights = (words.mode === "translation" ? tr : ar).map((x) => Math.max(1, x.length));
    const sum = weights.reduce((a, b) => a + b, 0);
    let at = p.start;
    for (let i = 0; i < k; i++) {
      const d = ((p.end - p.start) * weights[i]) / sum;
      out.push({ start: at, end: at + d, ar: ar[i], tr: tr[i] });
      at += d;
    }
  }
  return out;
}

export default function Studio({ surahs, mobile, onBack }: { surahs: Surah[]; mobile: boolean; onBack: () => void }) {
  const [c, setC] = useState<Choice>(saved);
  const set = useCallback((p: Partial<Choice>) => setC((x) => ({ ...x, ...p })), []);
  const setWords = (p: Partial<Words>) => setC((x) => ({ ...x, words: { ...x.words, ...p } }));
  const setLook = (p: Partial<Look>) => setC((x) => ({ ...x, look: { ...x.look, ...p } }));
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch {
      /* (kept for this visit only) */
    }
  }, [c]);
  const surah = surahs[c.s - 1];
  const count = surah?.count ?? 7;
  const from = Math.min(Math.max(1, c.from), count), to = Math.min(count, Math.max(from, c.to), from + MAX_AYAHS - 1);
  const [W, H] = SIZES[c.shape];

  // the surah's words, and the basmala's
  const [data, setData] = useState<{ d: SurahData; one: SurahData } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([loadSurah(c.s), loadSurah(1)]).then(([d, one]) => alive && setData({ d, one }));
    return () => {
      alive = false;
    };
  }, [c.s]);
  const texts = useMemo(() => {
    const m = new Map<string, { ar: string; tr: string }>();
    if (!data) return m;
    const of = (v: SurahData["v"][number]) => ({ ar: arabicText(v, c.words.script), tr: translationText(v, c.translation, c.context) });
    m.set("bism", of(data.one.v[0]));
    for (let a = from; a <= to; a++) if (data.d.v[a - 1]) m.set(`${c.s}:${a}`, of(data.d.v[a - 1]));
    return m;
  }, [data, c.s, from, to, c.words.script, c.translation, c.context]);

  // the recitation: fetched, cut and joined (again whenever the ayahs or the voice change)
  const [audio, setAudio] = useState<{ buffer: AudioBuffer; pieces: Piece[]; duration: number } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const voice = voiceOf(c.voice);
  useEffect(() => {
    let alive = true;
    setError(null);
    const t = setTimeout(() => {
      setLoading("Fetching the recitation");
      recitation(voice, c.s, from, to, { bism: c.bism, lead: 1.1, tail: 1.9 }, (n, of) => alive && n && setLoading(of > 1 ? `Fetching the recitation · ${n} of ${of}` : "Fetching the recitation"))
        .then((a) => alive && (setAudio(a), setLoading(null)))
        .catch((e) => alive && (setError(String(e?.message ?? e)), setLoading(null)));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [voice, c.s, from, to, c.bism]);

  const cues = useMemo(() => (audio ? cuesOf(audio.pieces, texts, W, H, c.words) : []), [audio, texts, W, H, c.words]);

  // the painting, and the fonts the words are set in
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let alive = true;
    painting(c.painting).then((i) => alive && setImg(i));
    return () => {
      alive = false;
    };
  }, [c.painting]);
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    const sample = [...texts.values()].map((t) => t.ar).join(" ").slice(0, 400) || "بسم";
    Promise.all([
      document.fonts.load(`40px ${FONTS[c.words.script]}`, sample),
      document.fonts.load(`500 30px ${FONTS.serif}`),
      document.fonts.load(`italic 500 30px ${FONTS.italic}`),
      document.fonts.load(`300 30px ${FONTS.sans}`),
    ]).then(() => setFonts((n) => n + 1));
  }, [c.words.script, texts]);

  // the preview: the same drawing at half the size, played with the recitation
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Scene | null>(null);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  tRef.current = t;
  const [playing, setPlaying] = useState(false);
  const duration = audio?.duration ?? 0;
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !img || !audio) return;
    cv.width = Math.round(W / 2);
    cv.height = Math.round(H / 2);
    scene.current = new Scene(cv, img, c.look, c.words, cues, audio.duration, 7);
    scene.current.draw(Math.min(tRef.current, audio.duration));
  }, [img, audio, cues, c.look, c.words, W, H, fonts]);
  useEffect(() => {
    if (!playing) scene.current?.draw(t);
  }, [t, playing]);
  const ac = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode; t0: number } | null>(null);
  const stop = useCallback(() => {
    if (ac.current) {
      ac.current.src.onended = null;
      try {
        ac.current.src.stop();
      } catch {
        /* (already stopped) */
      }
      ac.current.ctx.close();
      ac.current = null;
    }
    setPlaying(false);
  }, []);
  const play = () => {
    if (!audio) return;
    if (playing) return stop();
    const ctx = new AudioContext({ sampleRate: audio.buffer.sampleRate });
    const src = ctx.createBufferSource();
    src.buffer = audio.buffer;
    src.connect(ctx.destination);
    const from = t >= audio.duration - 0.05 ? 0 : t;
    const t0 = ctx.currentTime + 0.05 - from;
    src.start(ctx.currentTime + 0.05, from);
    src.onended = () => stop();
    ac.current = { ctx, src, t0 };
    setPlaying(true);
  };
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = ac.current;
      if (!a) return;
      const now = Math.max(0, a.ctx.currentTime - a.t0);
      scene.current?.draw(now);
      setT(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  // a change stops the preview (it is drawn again as it now is)
  useEffect(() => stop, [stop]);
  // (new ayahs: the picture shown where their first words are up, not in the black it fades from)
  useEffect(() => {
    stop();
    setT(audio?.pieces[0] ? Math.min(audio.duration, audio.pieces[0].start + 0.9) : 0);
  }, [audio, stop]);

  // the words dragged on the picture: placed freely there
  const drag = useRef(false);
  const place = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    setWords({ place: "free", at: { x: Math.min(0.85, Math.max(0.15, (e.clientX - r.left) / r.width)), y: Math.min(0.9, Math.max(0.1, (e.clientY - r.top) / r.height)) } });
  };

  // all to chance (the ayahs, the voice and the shape kept)
  const surprise = () =>
    setC((x) => ({
      ...x,
      painting: pick(PAINTINGS).id,
      words: { ...x.words, font: pick(["serif", "italic", "sans"] as const), brackets: Math.random() > 0.35, place: pick(["upper", "centre", "lower", "foot"] as const), size: 0.9 + Math.random() * 0.25 },
      look: {
        motion: pick(["still", "drift", "breathe", "pan"] as const),
        grade: pick(["natural", "warm", "cool", "faded", "mono"] as const),
        grain: 0.3 + Math.random() * 0.5,
        vignette: 0.45 + Math.random() * 0.45,
        haze: 0.15 + Math.random() * 0.6,
        dust: Math.random() > 0.4,
        flicker: Math.random() > 0.7,
      },
    }));

  // the video made
  const [making, setMaking] = useState<{ p: number; result?: { url: string; blob: Blob; name: string } ; err?: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const make = async () => {
    if (!audio || !img) return;
    stop();
    const ctl = new AbortController();
    abort.current = ctl;
    setMaking({ p: 0 });
    try {
      const cv = document.createElement("canvas");
      cv.width = W;
      cv.height = H;
      const sc = new Scene(cv, img, c.look, c.words, cues, audio.duration, 7);
      const { blob, ext } = await makeVideo(sc, audio.buffer, (p) => setMaking((m) => (m ? { ...m, p } : m)), ctl.signal);
      const name = `${surah?.tr ?? "Surah"} ${c.s}-${from}${to > from ? `-${to}` : ""}.${ext}`;
      setMaking({ p: 1, result: { url: URL.createObjectURL(blob), blob, name } });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") setMaking(null);
      else setMaking({ p: 0, err: String((e as Error)?.message ?? e) });
    }
  };
  const closeMade = () => {
    abort.current?.abort();
    if (making?.result) URL.revokeObjectURL(making.result.url);
    setMaking(null);
  };
  const share = async () => {
    const r = making?.result;
    if (!r) return;
    const file = new File([r.blob], r.name, { type: r.blob.type });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] }).catch(() => {});
  };

  const art = PAINTINGS.find((p) => p.id === c.painting);
  const ready = !!audio && !!img && !loading;

  return (
    <div className="studio relative flex h-full flex-col text-[var(--box-fg)]">
      <header className="flex h-[64px] shrink-0 items-center justify-between gap-2 px-3 md:h-[76px] md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onBack} aria-label="Back to the first page" title="Back" className="circle-btn">
            <ArrowLeft size={18} strokeWidth={1.9} />
          </button>
          <span className="truncate pl-1 text-[17px] font-semibold leading-none tracking-[-0.02em] md:text-[21px]">Share an Āyah</span>
          <span className="font-kufi text-[18px] leading-none text-[var(--box-muted)] max-md:hidden" dir="rtl" lang="ar">
            شارك آية
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={surprise} title="Surprise me: the painting, its look and the words' place left to chance" className="chip h-11 gap-2 px-4">
            <Dices size={16} strokeWidth={1.8} />
            <span className="max-md:hidden">Surprise me</span>
          </button>
          <button type="button" onClick={make} disabled={!ready} className="btn-primary flex h-11 shrink-0 items-center gap-2 whitespace-nowrap px-4 text-[14px] font-medium disabled:opacity-40 md:px-5">
            {mobile ? "Make video" : "Make the video"}
          </button>
        </div>
      </header>

      <div className={cn("flex min-h-0 flex-1", mobile ? "flex-col" : "flex-row")}>
        {/* the picture */}
        <div className={cn("relative flex min-h-0 flex-col items-center justify-center gap-3 p-3 md:p-5", mobile ? "h-[44%] shrink-0" : "flex-1")}>
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
            <canvas
              ref={canvas}
              className="studio-canvas max-h-full max-w-full rounded-[22px] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]"
              style={{ aspectRatio: `${W} / ${H}`, cursor: "grab", touchAction: "none" }}
              onPointerDown={(e) => {
                drag.current = true;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                place(e);
              }}
              onPointerMove={(e) => drag.current && place(e)}
              onPointerUp={() => (drag.current = false)}
              title="Drag to place the words anywhere"
            />
            {(loading || error || !img) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="label flex items-center gap-2 bg-[var(--box-bg-solid)]/80 px-3 py-2 text-[var(--box-muted)]">
                  {error ? error : (
                    <>
                      <LoaderCircle size={13} className="animate-spin" /> {loading ?? "Opening the painting"}
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="flex w-full max-w-[560px] items-center gap-3">
            <button type="button" onClick={play} disabled={!ready} aria-label={playing ? "Pause" : "Play"} className="circle-btn is-dark disabled:opacity-40">
              {playing ? <Pause size={14} strokeWidth={1.6} /> : <Play size={14} strokeWidth={1.6} className="ml-px" />}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0.1, duration)}
              step={0.05}
              value={Math.min(t, duration)}
              onChange={(e) => {
                stop();
                setT(Number(e.target.value));
              }}
              className="studio-range flex-1"
              aria-label="Where in the video"
            />
            <span className="label-sm w-[78px] shrink-0 text-right tabular-nums text-[var(--box-muted)]">
              {fmt(t)} / {fmt(duration)}
            </span>
          </div>
        </div>

        {/* the choices */}
        <div className={cn("thin-scroll flex min-h-0 flex-col gap-2.5 overflow-y-auto px-3 pb-3", mobile ? "flex-1" : "w-[360px] shrink-0 pl-0 pr-5")}>
          <Group title="Ayahs">
            <select className="studio-select" value={c.s} onChange={(e) => set({ s: Number(e.target.value), from: 1, to: Math.min(surahs[Number(e.target.value) - 1]?.count ?? 1, 3) })} aria-label="Surah">
              {surahs.map((s) => (
                <option key={s.n} value={s.n}>
                  {s.n}. {s.tr}
                </option>
              ))}
            </select>
            <div className="mt-2 flex items-center gap-2">
              <Num label="From" value={from} min={1} max={count} onChange={(v) => set({ from: v, to: Math.max(v, to) })} />
              <Num label="To" value={to} min={from} max={Math.min(count, from + MAX_AYAHS - 1)} onChange={(v) => set({ to: v })} />
              <span className="label-sm ml-auto text-[var(--box-faint)]">{to - from + 1 === 1 ? "one ayah" : `${to - from + 1} ayahs`}</span>
            </div>
            {from === 1 && c.s !== 1 && c.s !== 9 && <Toggle label="Begin with the basmala" on={c.bism} onClick={() => set({ bism: !c.bism })} />}
          </Group>

          <Group title="Voice">
            <select className="studio-select" value={c.voice} onChange={(e) => set({ voice: e.target.value })} aria-label="Reciter">
              <optgroup label="The reader's reciters · unbroken">
                {VOICES.filter((v) => v.whole).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="More voices · ayah by ayah">
                {VOICES.filter((v) => !v.whole).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </Group>

          <Group title="Words">
            <Tiles
              value={c.words.mode}
              onChange={(mode) => setWords({ mode })}
              items={[
                ["both", <ModeGlyph key="b" mode="both" book={false} size={24} />, "Arabic and translation"],
                ["arabic", <ModeGlyph key="a" mode="arabic" book={false} size={24} />, "Arabic only"],
                ["translation", <ModeGlyph key="t" mode="translation" book={false} size={24} />, "Translation only"],
              ]}
            />
            {c.words.mode !== "translation" && (
              <Tiles
                value={c.words.script}
                onChange={(script) => setWords({ script })}
                items={[
                  ["uthmani", <span key="u" className="label-sm">Madani</span>, "The Madani mushaf's script"],
                  ["indopak", <span key="i" className="label-sm">Indo-Pak</span>, "The Indo-Pak script"],
                ]}
              />
            )}
            {c.words.mode !== "arabic" && (
              <>
                <select className="studio-select mt-2" value={c.translation} onChange={(e) => set({ translation: e.target.value as Translation })} aria-label="Translation">
                  {(Object.keys(TRANSLATIONS) as Translation[]).map((k) => (
                    <option key={k} value={k}>
                      {TRANSLATIONS[k].name}
                    </option>
                  ))}
                </select>
                <Tiles
                  value={c.words.font}
                  onChange={(font) => setWords({ font })}
                  items={[
                    ["serif", <span key="s" style={{ fontFamily: FONTS.serif, fontSize: 17 }}>Aa</span>, "Serif"],
                    ["italic", <span key="i" style={{ fontFamily: FONTS.italic, fontSize: 17, fontStyle: "italic" }}>Aa</span>, "Italic"],
                    ["sans", <span key="n" style={{ fontFamily: FONTS.sans, fontSize: 15, fontWeight: 300 }}>Aa</span>, "Sans"],
                  ]}
                />
                {c.translation === "qme" && <Toggle label="The bracketed context" on={c.context} onClick={() => set({ context: !c.context })} />}
              </>
            )}
            {c.words.mode !== "translation" && (
              <Toggle
                label={
                  <>
                    Between the mushaf's brackets <span style={{ fontFamily: FONTS.uthmani }}>{"﴾ ﴿"}</span>
                  </>
                }
                on={c.words.brackets}
                onClick={() => setWords({ brackets: !c.words.brackets })}
              />
            )}
          </Group>

          <Group title="Where" hint="or drag them on the picture">
            <Tiles
              value={c.words.place === "free" ? ("" as Place) : c.words.place}
              onChange={(place) => setWords({ place })}
              items={(["upper", "centre", "lower", "foot"] as const).map((p) => [p, <PlaceGlyph key={p} at={{ upper: 0.3, centre: 0.5, lower: 0.68, foot: 0.84 }[p]} />, { upper: "Upper third", centre: "Centre", lower: "Lower third", foot: "Near the foot" }[p]])}
            />
            <Slider label="Size" value={c.words.size} min={0.8} max={1.4} onChange={(size) => setWords({ size })} />
          </Group>

          <Group title="Painting" hint={art ? `${art.title} · ${art.artist}, ${art.year}` : undefined}>
            <div className="grid grid-cols-3 gap-1.5">
              {PAINTINGS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => set({ painting: p.id })}
                  title={`${p.title} — ${p.artist}, ${p.year}`}
                  aria-label={`${p.title} by ${p.artist}`}
                  aria-pressed={c.painting === p.id}
                  className={cn("press relative aspect-[4/3] overflow-hidden rounded-[12px] border-2 transition-[border-color,opacity]", c.painting === p.id ? "border-[var(--box-fg)]" : "border-transparent opacity-80 hover:opacity-100")}
                >
                  <img src={`${import.meta.env.BASE_URL}video/paint/${p.id}-t.webp`} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
            <Tiles
              value={c.look.motion}
              onChange={(motion) => setLook({ motion })}
              items={(["still", "drift", "breathe", "pan"] as Motion[]).map((m) => [m, <span key={m} className="label-sm">{{ still: "Still", drift: "Drift", breathe: "Breathe", pan: "Pan" }[m]}</span>, { still: "Still", drift: "Drawing slowly closer", breathe: "Breathing in and out", pan: "Moving across" }[m]])}
            />
            <Tiles
              value={c.look.grade}
              onChange={(grade) => setLook({ grade })}
              items={(["natural", "warm", "cool", "faded", "mono"] as Grade[]).map((g) => [g, <span key={g} className="label-sm">{{ natural: "True", warm: "Warm", cool: "Cool", faded: "Faded", mono: "Mono" }[g]}</span>, g])}
            />
            <Slider label="Grain" value={c.look.grain} min={0} max={1} onChange={(grain) => setLook({ grain })} />
            <Slider label="Haze" value={c.look.haze} min={0} max={1} onChange={(haze) => setLook({ haze })} />
            <Slider label="Edges" value={c.look.vignette} min={0} max={1} onChange={(vignette) => setLook({ vignette })} />
            <Toggle label="Dust in the light" on={c.look.dust} onClick={() => setLook({ dust: !c.look.dust })} />
            <Toggle label="The film's flicker" on={c.look.flicker} onClick={() => setLook({ flicker: !c.look.flicker })} />
          </Group>

          <Group title="Shape">
            <Tiles
              value={c.shape}
              onChange={(shape) => set({ shape })}
              items={(Object.keys(SIZES) as Shape[]).map((s) => [s, <ShapeGlyph key={s} w={SIZES[s][0]} h={SIZES[s][1]} label={s} />, s])}
            />
          </Group>
          <p className="label-sm px-4 pb-6 pt-1 leading-relaxed text-[var(--box-faint)] md:px-5">The recitations from everyayah.com · the paintings in the public domain</p>
        </div>
      </div>

      {/* making it, and what was made */}
      <AnimatePresence>
        {making && (
          <motion.div className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--box-bg-solid) 70%, transparent)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex w-[min(420px,90%)] flex-col items-center gap-4 border border-[var(--box-line)] bg-[var(--box-bg-solid)] p-5">
              {making.result ? (
                <>
                  <video src={making.result.url} controls playsInline className="max-h-[52vh] w-auto max-w-full" />
                  <div className="flex w-full flex-wrap items-center justify-center gap-2">
                    <a href={making.result.url} download={making.result.name} className="btn-primary label flex h-9 items-center gap-2 border border-[var(--box-fg)] px-3 hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]">
                      <Download size={14} strokeWidth={1.6} /> Save it
                    </a>
                    {typeof navigator.canShare === "function" && (
                      <button type="button" onClick={share} className="label flex h-9 items-center gap-2 border border-[var(--box-line)] px-3 hover:bg-[var(--box-hover)]">
                        <Share2 size={14} strokeWidth={1.6} /> Share
                      </button>
                    )}
                    <button type="button" onClick={closeMade} className="label flex h-9 items-center gap-2 px-3 text-[var(--box-muted)] hover:text-[var(--box-fg)]">
                      <X size={14} strokeWidth={1.6} /> Close
                    </button>
                  </div>
                </>
              ) : making.err ? (
                <>
                  <p className="text-center font-serif text-[16px] text-[var(--box-muted)]">The video could not be made here: {making.err}</p>
                  <button type="button" onClick={closeMade} className="label border border-[var(--box-line)] px-3 py-2">Close</button>
                </>
              ) : (
                <>
                  <span className="label text-[var(--box-muted)]">Making the video · {Math.round(making.p * 100)}%</span>
                  <span className="relative h-px w-full bg-[var(--box-line)]">
                    <span className="absolute inset-y-0 left-0 bg-[var(--box-fg)] transition-[width] duration-200" style={{ width: `${making.p * 100}%` }} />
                  </span>
                  <button type="button" onClick={closeMade} className="label px-3 py-1.5 text-[var(--box-muted)] hover:text-[var(--box-fg)]">Stop</button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card shrink-0 px-4 py-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-medium">{title}</span>
        {hint && <span className="truncate text-right text-[12.5px] text-[var(--box-muted)]">{hint}</span>}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Tiles<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, ReactNode, string][] }) {
  return (
    <div className="flex gap-1" role="radiogroup">
      {items.map(([v, glyph, name]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          aria-label={name}
          title={name}
          onClick={() => onChange(v)}
          className={cn("press flex h-10 min-w-0 flex-1 items-center justify-center rounded-full transition-colors", value === v ? "bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : "bg-[var(--box-hover)] text-[var(--box-muted)] hover:text-[var(--box-fg)]")}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className="flex w-full items-center justify-between gap-3 py-1 text-left">
      <span className="text-[13px] text-[var(--box-muted)]">{label}</span>
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150", on ? "bg-[var(--box-fg)]" : "bg-[var(--box-line)]")}>
        <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-[var(--surface)] shadow transition-[left] duration-200 ease-out", on ? "left-5" : "left-1")} />
      </span>
    </button>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-[13px] text-[var(--box-muted)]">{label}</span>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} className="studio-range flex-1" />
    </label>
  );
}

function Num({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="label-sm text-[var(--box-faint)]">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
        }}
        className="studio-num w-16"
      />
    </label>
  );
}

/** Where the words stand, drawn: a frame with a line at that height. */
function PlaceGlyph({ at }: { at: number }) {
  return (
    <svg width="18" height="26" viewBox="0 0 18 26" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <rect x="0.6" y="0.6" width="16.8" height="24.8" />
      <path d={`M4 ${at * 26 - 1.5}h10M5.5 ${at * 26 + 1.5}h7`} />
    </svg>
  );
}

/** A shape, drawn to its proportions, named. */
function ShapeGlyph({ w, h, label }: { w: number; h: number; label: string }) {
  const k = 20 / Math.max(w, h);
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="block border border-current" style={{ width: w * k, height: h * k }} />
      <span className="text-[8.5px] leading-none tracking-wide">{label}</span>
    </span>
  );
}
