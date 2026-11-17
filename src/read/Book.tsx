import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Surah, SurahData, Verse } from "@/lib/data";
import { loadLines, toArabicDigits } from "@/lib/data";
import { loadPageFont, loadQcf, pageFontReady, qcfFamily, quarterName, type Qcf } from "@/lib/qcf";
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
 * The Arabic as a book is the printed Madani mushaf itself (the King Fahd Complex's 15-line print):
 * page by page, each with its juz and quarter at its head and its number at its foot, every word in
 * the page's own font (lib/qcf), so each line is the print's line and as wide as the others. One size
 * for the whole book, from the page's width; a page's words show once its font has come.
 * Without those fonts (offline, the page not yet kept) the page falls back to the reader's Hafs font,
 * line for line: one size for the whole surah, at which most lines fit as they are; a line filled by
 * the spaces between its words alone, one a little too long has its spaces closed a little, then (only
 * if that is not enough) is set a touch smaller. A line far too short to fill (the end of a surah, the
 * first pages) stands in the middle, as the print sets it. An ayah that runs over a line is one piece
 * on each line (the same data-key and data-field on each). Once the reader chooses a size of their own
 * (settings.bookLines off), the Arabic runs on and falls where that size puts it.
 */
export const BookText = memo(function BookText({
  surah,
  meta,
  data,
  settings,
  mobile,
  hlByKey,
  bookmarks,
  onFitted,
}: {
  surah: number;
  meta: Surah;
  data: SurahData;
  settings: Settings;
  mobile: boolean;
  hlByKey: Map<string, Highlight[]>;
  bookmarks: Record<string, number>;
  onFitted?: () => void; // its size set to the lines: the reader's place found again
}) {
  const arabic = settings.readingMode === "arabic";
  // the printed pages, glyph for glyph (the Madani script, at the book's own size)
  const printed = arabic && settings.bookLines && settings.script !== "indopak";
  const [qcf, setQcf] = useState<Qcf | null>(null);
  useEffect(() => {
    if (!printed) return;
    let alive = true;
    loadQcf(surah)
      .then((q) => alive && setQcf(q))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [printed, surah]);
  const pages = useMemo(() => (printed && qcf ? pagesOf(qcf, data) : null), [printed, qcf, data]);
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

  if (pages) return <PrintedBook pages={pages} surah={surah} meta={meta} data={data} settings={settings} hlByKey={hlByKey} bookmarks={bookmarks} onFitted={onFitted} />;

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
    <section className="book px-3 pb-20 pt-6 sm:px-[max(6%,34px)] sm:pt-10 md:px-[6%] md:pt-12 xl:px-[9%]" aria-label="The surah as continuous text">
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
              <p className="book-tr text-start font-serif text-[var(--box-fg)] [hyphens:auto] xl:text-justify" dir="ltr" lang="en" style={{ fontSize: `calc(${trPx}px * var(--read-scale, 1))`, lineHeight: 1.8 }}>
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

/* ── the printed pages (QCF V2) ─────────────────────────────────────────────────────────────────── */

type PLine = { id: number; pieces: Piece[] };
type PPage = { p: number; lines: PLine[]; j: number; r?: number };

/** The surah's words on the print's lines and pages (a line is page × 100 + its line on the page). An
 *  ayah's end marker the print sets at the head of the next line is a piece of its own there. */
function pagesOf(q: Qcf, data: SurahData): PPage[] {
  keepGlyphs(q, data);
  const lines = new Map<number, PLine>();
  const order: PLine[] = [];
  const lineFor = (id: number) => {
    let l = lines.get(id);
    if (!l) lines.set(id, (l = { id, pieces: [] })), order.push(l);
    return l;
  };
  data.v.forEach((v, i) => {
    const a = q.v[i];
    if (!a || !a.g.length) return;
    let from = 0, cur = a.l[0];
    for (let w = 1; w < a.g.length; w++) {
      if (a.l[w] === cur) continue;
      lineFor(cur).pieces.push({ n: v.n, from, to: w, end: false });
      from = w;
      cur = a.l[w];
    }
    const endHere = a.le === cur || !a.le;
    lineFor(cur).pieces.push({ n: v.n, from, to: a.g.length, end: endHere });
    if (!endHere) lineFor(a.le).pieces.push({ n: v.n, from: a.g.length, to: a.g.length, end: true });
  });
  const pages: PPage[] = [];
  for (const l of order) {
    const p = Math.floor(l.id / 100);
    let pg = pages[pages.length - 1];
    if (!pg || pg.p !== p) pages.push((pg = { p, lines: [], j: q.pages[p]?.j ?? 0, r: q.pages[p]?.r }));
    pg.lines.push(l);
  }
  return pages;
}

/** How wide a full printed line is in the page fonts, in ems (measured: the print's lines are all
 *  this wide, but for those it sets short, in the middle). */
const LINE_EMS = 17.25;
/** The print's leading, in ems. */
const LEADING = 1.86;

/** The book's size: the page's width held to a comfortable measure, the size at which a full line
 *  meets it. Set before any page's font comes, so the pages never move as they arrive. */
function PrintedBook({ pages, surah, meta, data, settings, hlByKey, bookmarks, onFitted }: {
  pages: PPage[];
  surah: number;
  meta: Surah;
  data: SurahData;
  settings: Settings;
  hlByKey: Map<string, Highlight[]>;
  bookmarks: Record<string, number>;
  onFitted?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  const fittedRef = useRef(onFitted);
  fittedRef.current = onFitted;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const room = el.clientWidth;
      if (room) setSize(Math.floor(((room * 0.99) / LINE_EMS) * 10) / 10);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (size) fittedRef.current?.();
  }, [size]);
  return (
    <section className="book printed-book px-4 pb-20 pt-6 md:px-[6%] md:pt-10" aria-label="The surah as printed in the Madani mushaf">
      <div ref={box} className="mx-auto max-w-[620px]">
        {size > 0 &&
          pages.map((pg) => (
            <PrintedPage key={pg.p} page={pg} size={size} surah={surah} meta={meta} data={data} script={settings.script} wordHover={settings.wordHover} hlByKey={hlByKey} bookmarks={bookmarks} />
          ))}
      </div>
    </section>
  );
}

/** One page of the print: its head (juz, a quarter of a hizb that begins on it, the surah), its lines
 *  in its own font once that has come (fetched as the reader nears it), and its number at its foot.
 *  A line the print sets short stands in the middle; one a hair too long for the screen is set a
 *  touch smaller. */
const PrintedPage = memo(function PrintedPage({ page, size, surah, meta, data, script, wordHover, hlByKey, bookmarks }: {
  page: PPage;
  size: number;
  surah: number;
  meta: Surah;
  data: SurahData;
  script: Settings["script"];
  wordHover: boolean;
  hlByKey: Map<string, Highlight[]>;
  bookmarks: Record<string, number>;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState<"ready" | "loading" | "failed">(() => (pageFontReady(page.p) ? "ready" : "loading"));
  useEffect(() => {
    if (font === "ready") return;
    const node = el.current;
    if (!node) return;
    let alive = true;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        loadPageFont(page.p).then((ok) => alive && setFont(ok ? "ready" : "failed"));
      },
      { rootMargin: "150% 0px" },
    );
    io.observe(node);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [page.p, font]);
  // each line as the font draws it: in the middle if the print sets it short, smaller if too long
  const [fits, setFits] = useState<{ mid: boolean; scale: number }[] | null>(null);
  useLayoutEffect(() => {
    const node = el.current;
    if (font !== "ready" || !node) return;
    const rows = [...node.querySelectorAll<HTMLElement>(".mushaf-line")];
    const room = rows[0]?.parentElement?.clientWidth ?? 0;
    if (!room) return;
    node.classList.add("is-measuring");
    const widths = rows.map((r) => r.getBoundingClientRect().width);
    node.classList.remove("is-measuring");
    // (what the screen shows is scaled with the page as it opens: widths against the room as laid out)
    const shown = node.getBoundingClientRect().width / node.clientWidth || 1;
    setFits(widths.map((w) => ((w /= shown), { mid: w < room * 0.86, scale: w > room ? Math.floor((room / w) * 1000) / 1000 : 1 })));
  }, [font, size, page]);

  const family = font === "failed" ? undefined : qcfFamily(page.p);
  return (
    <div ref={el} className="mushaf-page" data-page={page.p}>
      <div className="mushaf-head label-sm" dir="ltr">
        <span>
          Juz’ {page.j}
          {page.r ? `, ${quarterName(page.r)}` : ""}
        </span>
        <span className="mushaf-head-name">
          {meta.tc} <span className="font-quran normal-case tracking-normal" lang="ar">{meta.ar}</span>
        </span>
      </div>
      <div
        className={cn("quran book-ar printed-lines", font !== "ready" && font !== "failed" && "is-waiting", font === "failed" && "is-fallback")}
        dir="rtl"
        lang="ar"
        style={{ fontSize: font === "failed" ? size * 0.82 : size, lineHeight: `${Math.round(size * LEADING)}px`, fontFamily: family }}
      >
        {page.lines.map((line, li) => {
          const fit = fits?.[li];
          return (
            <div key={line.id} className={cn("mushaf-line", fit?.mid && "is-mid")} style={fit && fit.scale < 1 ? { fontSize: size * fit.scale } : undefined}>
              {line.pieces.map((pc) => {
                const v = data.v[pc.n - 1];
                const key = `${surah}:${v.n}`;
                const glyphs = font === "failed" ? null : qcfWords(v, pc, script);
                return (
                  <Fragment key={`${pc.n}-${pc.from}`}>
                    {pc.to > pc.from && (
                      <span data-n={v.n} data-key={key} data-field="ar" className={cn(wordHover && "word-hover")}>
                        {renderArabic(glyphs ?? arabicWords(v, script).words.slice(pc.from, pc.to), (hlByKey.get(key) ?? []).filter((h) => h.field === "ar"))}
                      </span>
                    )}
                    {pc.end && (
                      <>
                        {pc.to > pc.from && " "}
                        <AyahEnd n={v.n} k={key} marked={!!bookmarks[key]} arabic glyph={font === "failed" ? undefined : qcfEnd.get(v)} />
                      </>
                    )}{" "}
                  </Fragment>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="mushaf-foot label-sm">{page.p}</div>
    </div>
  );
});

/** The words of an ayah's piece as the print draws them: the reader's own words (their places in the
 *  ayah's text, for highlights), each drawn by its glyph. */
const qcfGlyphs = new WeakMap<Verse, string[]>();
const qcfEnd = new WeakMap<Verse, string>();
function qcfWords(v: Verse, pc: Piece, script: Settings["script"]) {
  const g = qcfGlyphs.get(v);
  const { words } = arabicWords(v, script);
  return g ? words.slice(pc.from, pc.to).map((w) => ({ ...w, text: g[w.i] })) : null;
}
/** Keep each ayah's glyphs where its words are looked up. */
function keepGlyphs(q: Qcf, data: SurahData) {
  data.v.forEach((v, i) => {
    const a = q.v[i];
    if (!a) return;
    qcfGlyphs.set(v, a.g);
    qcfEnd.set(v, a.e);
  });
}
/** A book line as fitted: its size, its word spacing closed (em, on a long line), and whether it is set
 *  in the middle (too short to fill). */
type Fitted = { size: number; ws: number; mid?: boolean };

/**
 * An ayah's number: closing it in the Arabic, inside the mushaf's own ornament (the Hafs font
 * draws it round the digits); opening it in the English, set in a small ring at the line's own
 * height, so where one ayah ends and the next begins is plain at a glance. A tap on it opens the
 * ayah's tools; a bookmarked ayah's number is lit.
 */
function AyahEnd({ n, k, marked, arabic, glyph }: { n: number; k: string; marked: boolean; arabic?: boolean; glyph?: string }) {
  return (
    <button
      type="button"
      data-ayah-end={n}
      data-ayah-mark={k}
      title={`Ayah ${n}: bookmark, note, copy or share`}
      aria-label={`Ayah ${n}: bookmark, note, copy or share`}
      className={cn(
        "ayah-end cursor-pointer transition-colors hover:text-[var(--box-accent)]",
        glyph ? "inline rounded-none align-baseline" : arabic ? "inline rounded-none px-0.5 align-baseline font-quran" : "ayah-no",
        marked ? "is-marked text-[var(--box-accent)]" : "text-[var(--box-muted)]",
      )}
    >
      {glyph ?? (arabic ? toArabicDigits(n) : n)}
    </button>
  );
}
