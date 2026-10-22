import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SurahData, Verse } from "@/lib/data";
import { loadLines, toArabicDigits } from "@/lib/data";
import type { Highlight, Settings } from "@/lib/store";
import { renderArabic, renderPieces } from "./Ayah";
import { arabicWords, translationPieces } from "./text";
import { cn } from "@/lib/utils";

/**
 * The surah read as a book: in the multiple-ayah view, with the Arabic alone or a translation
 * alone, the ayahs run on as continuous text, each marked by its number. The translation breaks
 * into paragraphs where The Clear Quran starts a new theme, headed by it (both can be turned off:
 * then it too runs on). Every ayah is still its own element (data-n, data-key, data-field), so
 * meanings, highlights, notes and the slider work as they do ayah by ayah; its number opens the
 * ayah's own tools.
 *
 * The Arabic as a book is set line for line as the printed Madani mushaf (the King Fahd Complex's
 * 15-line print; the lines run on from page to page with nothing between): each printed line a row
 * of its own, reaching from side to side as the print's do. The letters are never drawn out or
 * pressed: one size for the whole surah, at which most lines fit as they are; a line is filled by the
 * spaces between its words alone, and one a little too long has its spaces closed a little, then (only
 * if that is not enough) is set a touch smaller. A line far too short to fill (the end of a surah, the
 * first pages) stands in the middle, as the print sets it. An ayah that runs over a line is one piece
 * on each line (the same data-key and data-field on each). Once the reader chooses a size of their own
 * (settings.bookLines off), the Arabic runs on and falls where that size puts it.
 */
export const BookText = memo(function BookText({
  surah,
  data,
  settings,
  mobile,
  hlByKey,
  bookmarks,
  onFitted,
}: {
  surah: number;
  data: SurahData;
  settings: Settings;
  mobile: boolean;
  hlByKey: Map<string, Highlight[]>;
  bookmarks: Record<string, number>;
  onFitted?: () => void; // its size set to the lines: the reader's place found again
}) {
  const arabic = settings.readingMode === "arabic";
  // the printed lines: for each ayah, the words a line begins at
  const [allLines, setAllLines] = useState<Record<string, number[]> | null>(null);
  const lined = arabic && settings.bookLines;
  useEffect(() => {
    if (!lined || allLines) return;
    let alive = true;
    loadLines()
      .then((l) => alive && setAllLines(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lined, allLines]);
  // each printed line: the pieces of ayahs on it (ayah n, its words from…to, and whether it ends there)
  const lines = useMemo(() => {
    const flat = lined ? allLines?.[String(surah)] : undefined;
    if (!flat) return null;
    const starts = new Map<number, Set<number>>();
    for (let i = 0; i + 1 < flat.length; i += 2) {
      if (!starts.has(flat[i])) starts.set(flat[i], new Set());
      starts.get(flat[i])!.add(flat[i + 1]);
    }
    const out: Piece[][] = [[]];
    for (const v of data.v) {
      let from = 0;
      for (let w = 1; w <= v.a.length; w++) {
        const begins = w < v.a.length && !!starts.get(v.n)?.has(w);
        if (w === v.a.length || begins) {
          out[out.length - 1].push({ n: v.n, from, to: w, end: w === v.a.length });
          from = w;
        }
        if (begins) out.push([]);
      }
      // (the next ayah begins a line of its own)
      if (starts.get(v.n + 1)?.has(0)) out.push([]);
    }
    return out.filter((l) => l.length);
  }, [lined, allLines, surah, data]);

  // the sizes: each line measured as it is at a known size; the surah's size set where most lines fit,
  // the spaces between the words then filling each line (the browser's own justifying)
  const page = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<{ base: number; each: Fitted[] } | null>(null);
  const fittedRef = useRef(onFitted);
  fittedRef.current = onFitted;
  useLayoutEffect(() => {
    const p = page.current;
    if (!lines || !p) return void setSizes(null);
    const BASE = 40;
    let measured = 0; // (the width last measured at: only a new width, or new fonts, measures again)
    const fit = (force = false) => {
      const room = p.clientWidth;
      const rows = [...p.children] as HTMLElement[];
      if (!room || rows.length !== lines.length || (room === measured && !force)) return;
      measured = room;
      // (measuring sets the lines smaller for a moment: the page would be pulled up to the shorter end)
      const sc = p.closest<HTMLElement>(".snap-scroller");
      const top = sc?.scrollTop ?? 0;
      const keep = p.style.cssText;
      const kept = rows.map((row) => row.style.cssText);
      // (widths as laid out: what the screen shows is scaled and turned with the frame, mid-move as the
      // reader opens; the page's own width on the screen against its width as laid out undoes that)
      const shown = p.getBoundingClientRect().width / room || 1;
      const width = (el: Element) => el.getBoundingClientRect().width / shown;
      p.style.fontSize = `${BASE}px`;
      // (each line as wide as its words, not the page: its own width, with no size or spacing of its own)
      p.classList.add("is-measuring");
      rows.forEach((row) => (row.style.cssText = ""));
      const wide = rows.map((row) => width(row) || room);
      // how many spaces each line has between its words (to close them a little on a long line)
      const gaps = rows.map((row) => Math.max(1, (row.textContent ?? "").trim().split(/\s+/).length - 1));
      p.classList.remove("is-measuring");
      // the surah's size: the one at which four lines in five fit as they are
      const fits = wide.map((w) => (BASE * room) / w).sort((x, y) => x - y);
      const base = fits[Math.floor(fits.length * 0.2)];
      // a long line: its spaces closed a little (up to a twentieth of an em), only then set smaller
      // (the middle is for the surah's last line when it is short, and a line far too short to fill)
      const each = wide.map((w, i) => {
        const W = (w * base) / BASE; // its own width at the surah's size
        const f = room / W;
        if (f > 1.8 || (i === wide.length - 1 && f > 1.25)) return { size: base, ws: 0, mid: true };
        if (f >= 1.012) return { size: base, ws: 0 }; // (a hair to spare: sizes do not scale quite evenly)
        const R = room / 1.012;
        const ws = -Math.min(0.05, (W - R) / gaps[i] / base);
        const left = W + ws * base * gaps[i];
        const size = left > R ? Math.floor(((base * R) / left) * 10) / 10 : base;
        return { size, ws: Math.round(ws * 1000) / 1000 };
      });
      p.style.cssText = keep;
      rows.forEach((row, i) => (row.style.cssText = kept[i]));
      if (sc && Math.abs(sc.scrollTop - top) > 1) sc.scrollTop = top;
      const next = { base: Math.round(base * 10) / 10, each };
      setSizes((s) => (s && s.base === next.base && JSON.stringify(s.each) === JSON.stringify(each) ? s : next));
    };
    fit(true);
    const ro = new ResizeObserver(() => fit());
    ro.observe(p);
    const fonts = () => fit(true);
    document.fonts.addEventListener("loadingdone", fonts);
    return () => {
      ro.disconnect();
      document.fonts.removeEventListener("loadingdone", fonts);
    };
  }, [lines, settings.script]);
  useLayoutEffect(() => {
    if (sizes) fittedRef.current?.();
  }, [sizes]);

  const headed = !arabic && settings.bookThemes;
  // paragraphs: a new one wherever a theme begins (the translation, with its headings), or one
  const paras: { theme: string | null; verses: Verse[] }[] = [];
  data.v.forEach((v, i) => {
    if (!paras.length || (headed && v.h)) paras.push({ theme: headed ? data.themes[i] : null, verses: [] });
    paras[paras.length - 1].verses.push(v);
  });
  const arPx = Math.round((mobile ? 27 : 34) * settings.arabicScale * 1.12);
  const trPx = Math.round((mobile ? 17 : 19.5) * settings.transScale * 10) / 10;
  const ip = settings.script === "indopak";
  // an ayah's words (or those of it on one line), as the book sets them
  const ayahWords = (v: Verse, from?: number, to?: number) => {
    const key = `${surah}:${v.n}`;
    const { words } = arabicWords(v, settings.script);
    const hls = (hlByKey.get(key) ?? []).filter((h) => h.field === "ar");
    return (
      <span data-n={v.n} data-key={key} data-field="ar" className={cn(ip && "indopak", settings.wordHover && "word-hover")}>
        {renderArabic(from === undefined ? words : words.slice(from, to), hls, ip ? undefined : v.g, v.sj || v.sw !== undefined ? (v.sw ?? words.length - 1) : undefined)}
      </span>
    );
  };

  // a line as fitted: its size and its word spacing (the script's own, closed on a long line)
  const lineStyle = ({ size, ws }: Fitted, base: number) => ({
    fontSize: size,
    wordSpacing: ws ? `calc(var(--ws) + ${ws}em)` : undefined,
    lineHeight: `${Math.round(base * 1.95)}px`,
  });

  if (lines)
    return (
      <section className="book px-3 pb-20 pt-10 md:px-[9%] md:pt-14" aria-label="The surah as continuous text">
        <div
          ref={page}
          className={cn("quran book-ar mx-auto max-w-[760px] text-[var(--box-fg)]", ip && "indopak")}
          dir="rtl"
          lang="ar"
          style={{ fontSize: sizes?.base ?? arPx, visibility: sizes ? undefined : "hidden" }}
        >
          {lines.map((row, li) => (
            <div
              key={li}
              className={cn("mushaf-line", sizes?.each[li]?.mid && "is-mid")}
              style={sizes ? lineStyle(sizes.each[li], sizes.base) : undefined}
            >
              {row.map((pc) => {
                const v = data.v[pc.n - 1];
                const key = `${surah}:${v.n}`;
                return (
                  <Fragment key={`${pc.n}-${pc.from}`}>
                    {ayahWords(v, pc.from, pc.to)}
                    {pc.end && (
                      <>
                        {" "}
                        <AyahEnd n={v.n} k={key} marked={!!bookmarks[key]} arabic />
                      </>
                    )}{" "}
                  </Fragment>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    );

  return (
    <section className="book px-[max(6%,34px)] pb-20 pt-10 md:px-[9%] md:pt-14" aria-label="The surah as continuous text">
      <div className={cn("mx-auto", arabic ? "max-w-[860px]" : "max-w-[680px]")}>
        {paras.map((p, pi) => (
          <div key={pi} className={pi ? "mt-10" : ""}>
            {p.theme && <div className="label mb-4 text-[var(--box-faint)]">{p.theme}</div>}
            {arabic ? (
              <p className="quran book-ar text-start text-[var(--box-fg)] md:text-justify" dir="rtl" lang="ar" style={{ fontSize: arPx, lineHeight: 1.9 }}>
                {p.verses.map((v) => {
                  const key = `${surah}:${v.n}`;
                  return (
                    <span key={key}>
                      {ayahWords(v)} <AyahEnd n={v.n} k={key} marked={!!bookmarks[key]} arabic />{" "}
                    </span>
                  );
                })}
              </p>
            ) : (
              <p className="book-tr text-start font-serif text-[var(--box-fg)] md:text-justify" dir="ltr" lang="en" style={{ fontSize: `calc(${trPx}px * var(--read-scale, 1))`, lineHeight: 1.8 }}>
                {p.verses.map((v, vi) => {
                  const key = `${surah}:${v.n}`;
                  const tr = translationPieces(v, settings.translation);
                  const hls = (hlByKey.get(key) ?? []).filter((h) => h.field === tr.source);
                  return (
                    <Fragment key={key}>
                      {vi > 0 && " "}
                      <AyahEnd n={v.n} k={key} marked={!!bookmarks[key]} />
                      <span data-n={v.n} data-key={key} data-field={tr.source}>
                        {renderPieces(tr, hls, settings.showContext)}
                      </span>
                    </Fragment>
                  );
                })}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
});

/** a run of an ayah's words on one printed line */
type Piece = { n: number; from: number; to: number; end: boolean };
/** A book line as fitted: its size, its word spacing closed (em, on a long line), and whether it is set
 *  in the middle (too short to fill). */
type Fitted = { size: number; ws: number; mid?: boolean };

/**
 * An ayah's number: closing it in the Arabic, inside the mushaf's own ornament (the Hafs font
 * draws it round the digits); opening it in the English, set in a small ring at the line's own
 * height, so where one ayah ends and the next begins is plain at a glance. A tap on it opens the
 * ayah's tools; a bookmarked ayah's number is lit.
 */
function AyahEnd({ n, k, marked, arabic }: { n: number; k: string; marked: boolean; arabic?: boolean }) {
  return (
    <button
      type="button"
      data-ayah-end={n}
      data-ayah-mark={k}
      title={`Ayah ${n}: bookmark, note, copy or share`}
      aria-label={`Ayah ${n}: bookmark, note, copy or share`}
      className={cn(
        "ayah-end cursor-pointer transition-colors hover:text-[var(--box-accent)]",
        arabic ? "inline rounded-none px-0.5 align-baseline font-quran" : "ayah-no",
        marked ? "is-marked text-[var(--box-accent)]" : "text-[var(--box-muted)]",
      )}
    >
      {arabic ? toArabicDigits(n) : n}
    </button>
  );
}
