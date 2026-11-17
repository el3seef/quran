import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { arabicText, loadIndex, loadSurah, toArabicDigits, translationText, type Surah, type SurahData } from "@/lib/data";
import type { Settings } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Tafsir as-Sa'di, in English (the International Islamic Publishing House's translation, from the
 * reader's own copy: scripts/tafsir/), over the page. As-Sa'di explains the Qur'an a passage at
 * a time: a few ayahs together, or one. So the window shows the whole passage the ayah belongs to, its
 * ayahs together in Arabic, then together in translation, then a rule, then his words; the arrows go
 * on to the passage before or after (and on into the next surah).
 *
 * public/data/tafsir/<surah>.json: { p: [{ a, b, t: [paragraphs] }] }, a passage from ayah a to b. In
 * the paragraphs, the Qur'an quoted is set between U+E010 and U+E011, and the book's honorific marks
 * are U+E001–E008 (below).
 */
type Passage = { a: number; b: number; t: string[] };
type Tafsir = { p: Passage[] };

const cache = new Map<number, Promise<Tafsir | null>>();
function loadTafsir(s: number) {
  let p = cache.get(s);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/tafsir/${s}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Tafsir>) : null))
      .catch(() => null);
    cache.set(s, p);
  }
  return p;
}

/** The book's honorific marks, as it prints them (in Arabic), and what each says. */
const HONOURS: Record<string, [string, string]> = {
  "": ["سُبْحَانَهُ وَتَعَالَىٰ", "Subhanahu wa Ta'ala: the Exalted"],
  "": ["ﷺ", "Salla Allahu 'alayhi wa sallam: blessings and peace be upon him"],
  "": ["عَلَيْهِ السَّلَامُ", "'Alayhi as-salam: may peace be upon him"],
  "": ["رَضِيَ اللهُ عَنْهُ", "Radiya Allahu 'anhu: may Allah be pleased with him"],
  "": ["رَضِيَ اللهُ عَنْهَا", "Radiya Allahu 'anha: may Allah be pleased with her"],
  "": ["رَضِيَ اللهُ عَنْهُمَا", "Radiya Allahu 'anhuma: may Allah be pleased with both of them"],
  "": ["رَضِيَ اللهُ عَنْهُمْ", "Radiya Allahu 'anhum: may Allah be pleased with all of them"],
  "": ["رَضِيَ اللهُ عَنْهُنَّ", "Radiya Allahu 'anhunna: may Allah be pleased with all of them"],
};

/** A paragraph: its quotations of the Qur'an set apart, its honorific marks drawn. */
function Paragraph({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let quote: ReactNode[] | null = null;
  let buf = "";
  const flush = () => {
    if (!buf) return;
    (quote ?? out).push(buf);
    buf = "";
  };
  for (const ch of text) {
    if (ch === "") {
      flush();
      quote = [];
    } else if (ch === "") {
      flush();
      if (quote) out.push(<q key={out.length} className="tf-q">{quote}</q>);
      quote = null;
    } else if (HONOURS[ch]) {
      flush();
      const [ar, says] = HONOURS[ch];
      (quote ?? out).push(
        <span key={`h${out.length}-${quote?.length ?? 0}`} className="tf-h" title={says} aria-label={says} lang="ar">
          {ar}
        </span>,
      );
    } else buf += ch;
  }
  flush();
  if (quote) out.push(<q key={out.length} className="tf-q">{quote}</q>);
  return <p>{out}</p>;
}

export function TafsirPanel({ at, onGo, onClose, settings, mobile }: { at: { s: number; a: number } | null; onGo: (at: { s: number; a: number }) => void; onClose: () => void; settings: Settings; mobile: boolean }) {
  const [tafsir, setTafsir] = useState<Tafsir | null | undefined>(undefined);
  const [data, setData] = useState<SurahData | null>(null);
  const [surah, setSurah] = useState<Surah | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const s = at?.s ?? 0;
  useEffect(() => {
    if (!s) return;
    let alive = true;
    setTafsir(undefined);
    setData(null);
    loadTafsir(s).then((t) => alive && setTafsir(t));
    loadSurah(s).then((d) => alive && setData(d));
    loadIndex().then((i) => alive && setSurah(i.surahs[s - 1]));
    return () => {
      alive = false;
    };
  }, [s]);
  // the passage the ayah is in (none, for the few ayahs whose pages the source copy lacks)
  const pi = useMemo(() => (tafsir && at ? tafsir.p.findIndex((p) => at.a >= p.a && at.a <= p.b) : -1), [tafsir, at]);
  const passage = pi >= 0 ? tafsir!.p[pi] : null;
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [s, pi, at?.a]);

  const go = (d: 1 | -1) => {
    if (!tafsir || !at) return;
    const next = pi >= 0 ? tafsir.p[pi + d] : d === 1 ? tafsir.p.find((p) => p.a > at.a) : [...tafsir.p].reverse().find((p) => p.b < at.a);
    if (next) return onGo({ s, a: next.a });
    // (on into the next surah, or back to the last passage of the one before)
    if (d === 1 && s < 114) onGo({ s: s + 1, a: 1 });
    if (d === -1 && s > 1)
      loadTafsir(s - 1).then((t) => {
        const last = t?.p[t.p.length - 1];
        onGo({ s: s - 1, a: last ? last.a : 1 });
      });
  };
  useEffect(() => {
    if (!at) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else return;
      e.stopPropagation();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  const [from, to] = passage ? [passage.a, passage.b] : at ? [at.a, at.a] : [0, 0];
  const ayahs = data ? data.v.slice(from - 1, to) : [];
  const ref = from === to ? `${s}:${from}` : `${s}:${from}–${to}`;
  const ip = settings.script === "indopak";

  return (
    <AnimatePresence>
      {at && (
        <motion.div
          key="tafsir"
          className="absolute inset-0 z-[45] flex items-center justify-center backdrop-blur-[10px]"
          style={{ background: "color-mix(in srgb, var(--box-bg-solid) 55%, transparent)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onPointerDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-label={`Tafsir as-Sa'di on ${ref}`}
            className={cn("tafsir relative flex flex-col overflow-hidden rounded-[28px] bg-[var(--box-bg-solid)] text-[var(--box-fg)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)]", mobile ? "h-[94%] w-[94%]" : "h-[90%] w-[min(820px,88%)]")}
            initial={{ y: 16, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 8, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.26, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
              <div className="flex min-w-0 flex-col">
                <span className="text-[16px] font-semibold tracking-[-0.015em]">Tafsir as-Sa'di</span>
                <span className="truncate text-[12.5px] text-[var(--box-muted)]">
                  {surah ? `${surah.tr} · ` : ""}
                  <span className="tabular-nums">{ref}</span>
                </span>
              </div>
              <button type="button" onClick={onClose} aria-label="Close the tafsir" title="Close (Esc)" className="circle-btn is-md">
                <X size={17} strokeWidth={1.9} />
              </button>
            </div>

            <div ref={body} className="tafsir-body thin-scroll mx-2 flex-1 overflow-y-auto rounded-[22px] bg-[var(--surface)] px-5 pb-10 pt-6 md:mx-3 md:px-10 md:pt-8">
              {tafsir === null ? (
                <p className="py-16 text-center font-serif text-[17px] italic text-[var(--box-muted)]">The tafsir of this surah is not here yet.</p>
              ) : tafsir === undefined || !data ? (
                <div className="flex justify-center py-20">
                  <span className="relative h-px w-32 overflow-hidden bg-[var(--box-line)]">
                    <motion.span className="absolute inset-y-0 w-1/3 bg-[var(--box-accent)]" animate={{ left: ["-35%", "100%"] }} transition={{ duration: 1.1, repeat: Infinity }} />
                  </span>
                </div>
              ) : (
                <motion.div key={`${s}-${from}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                  {/* the passage's ayahs, together, as the mushaf runs them on */}
                  <p className={cn("quran text-right leading-[2.1] text-[var(--box-fg)]", ip && "indopak")} dir="rtl" lang="ar" style={{ fontSize: mobile ? 24 : 30 }}>
                    {ayahs.map((v) => (
                      <Fragment key={v.n}>
                        {arabicText(v, settings.script)} <span className="font-quran text-[var(--box-muted)]">{toArabicDigits(v.n)}</span>{" "}
                      </Fragment>
                    ))}
                  </p>
                  <p className="mt-5 font-serif text-[var(--box-fg)]" style={{ fontSize: mobile ? 16.5 : 18, lineHeight: 1.7 }}>
                    {ayahs.map((v) => (
                      <Fragment key={v.n}>
                        <span className="ayah-no mr-1.5 align-[1px] text-[var(--box-muted)]">{v.n}</span>
                        {translationText(v, settings.translation, settings.showContext)}{" "}
                      </Fragment>
                    ))}
                  </p>
                  <div className="my-8 flex items-center gap-3 text-[var(--box-faint)]" aria-hidden>
                    <span className="h-px flex-1 bg-[var(--box-line)]" />
                    <span className="label-sm">As-Sa'di</span>
                    <span className="h-px flex-1 bg-[var(--box-line)]" />
                  </div>
                  {passage ? (
                    <div className="tafsir-text font-serif" style={{ fontSize: mobile ? 16 : 17.5 }}>
                      {passage.t.map((t, i) => (
                        <Paragraph key={i} text={t} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-center font-serif text-[16px] italic text-[var(--box-muted)]">The pages with as-Sa'di's words on this ayah are missing from the copy this tafsir was taken from.</p>
                  )}
                </motion.div>
              )}
            </div>

            <div className="flex items-center justify-between px-2 py-2 md:px-3">
              <button type="button" onClick={() => go(-1)} disabled={!tafsir || (pi <= 0 && s <= 1)} className="chip h-10 gap-2 px-4 disabled:opacity-30" aria-label="The passage before">
                <ArrowLeft size={15} strokeWidth={1.8} />
                <span className="max-md:hidden">Before</span>
              </button>
              <span className="label-sm text-[var(--box-faint)] tabular-nums">{tafsir && pi >= 0 ? `${pi + 1} / ${tafsir.p.length}` : ""}</span>
              <button type="button" onClick={() => go(1)} disabled={!tafsir || (pi >= tafsir.p.length - 1 && s >= 114)} className="chip h-10 gap-2 px-4 disabled:opacity-30" aria-label="The passage after">
                <span className="max-md:hidden">After</span>
                <ArrowRight size={15} strokeWidth={1.8} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
