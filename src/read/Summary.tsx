import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Undo2 } from "lucide-react";
import { loadSummaries, pad3, type Surah, type SurahData, type SummarySection } from "@/lib/data";
import { surahColor } from "@/lib/surahColor";
import { EASE_OUT, cn } from "@/lib/utils";
import { ayn, nameMarks } from "@/lib/names";

/**
 * The reading page's other face: what the surah is about — its connection to the surah before it and
 * a summary of its contents — followed by the themes it moves through, each a link to where that
 * theme begins. Its own card in the surah's colour beside them, with its details.
 */
export function SurahSummary({
  surah,
  data,
  onBack,
  onGo,
  mobile,
  atStart,
}: {
  surah: Surah;
  data: SurahData | null;
  onBack: () => void;
  onGo: (ayah: number) => void;
  mobile: boolean;
  atStart: boolean; // opened from the opening page: going back begins the surah at ayah 1
}) {
  const [sections, setSections] = useState<SummarySection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // take focus once the face is showing, so arrows, space and page keys scroll it
  useEffect(() => {
    const t = setTimeout(() => scroller.current?.focus({ preventScroll: true }), 250);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    let alive = true;
    loadSummaries()
      .then((all) => alive && setSections(all[String(surah.n)] ?? []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [surah.n]);

  // themes with the ayah each begins at
  const themes = useMemo(() => {
    if (!data) return [];
    const out: { title: string; from: number; to: number }[] = [];
    data.v.forEach((v, i) => {
      if (v.h) out.push({ title: data.themes[i] ?? v.h, from: v.n, to: v.n });
      else if (out.length) out[out.length - 1].to = v.n;
    });
    return out;
  }, [data]);

  // the juz it lies in (or runs through)
  const juz = useMemo(() => {
    if (!data?.v.length) return null;
    const a = data.v[0].j, b = data.v[data.v.length - 1].j;
    return a === b ? `${a}` : `${a}–${b}`;
  }, [data]);
  // the name's meaning as The Clear Quran gives it, its added words (˹…˺) read as part of it
  const meaning = (surah.ct || surah.en).replace(/[˹˺]/g, "");
  const c = surahColor(surah.n);
  const rise = (i: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: EASE_OUT, delay: 0.05 + i * 0.04 } });

  const facts = [
    { k: "Revealed", v: surah.place === "makkah" ? "Makkah" : "Madinah" },
    { k: "Ayat", v: String(surah.count) },
    ...(juz ? [{ k: "Juz", v: juz }] : []),
  ];
  const card = (
    <motion.aside className="flex w-full flex-col gap-2.5" {...rise(0)}>
      <div className="card-tint relative flex aspect-[16/9] flex-col justify-between overflow-hidden p-5 sm:aspect-[4/3] md:aspect-[4/5]" style={{ background: c.bg }}>
        <span className="pointer-events-none absolute -bottom-6 -right-2 font-kufi text-[120px] leading-none opacity-[0.1]" dir="rtl" lang="ar" aria-hidden>
          {surah.ar}
        </span>
        <span className="self-start rounded-full bg-white/55 px-2.5 py-1 text-[12px] font-medium tabular-nums">Surah {pad3(surah.n)}</span>
        <div className="relative">
          <div className="text-left font-kufi text-[40px] leading-none md:text-[46px]" dir="rtl" lang="ar">
            {surah.ar}
          </div>
          <div className="mt-3 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{nameMarks(surah.tc)}</div>
          <div className="mt-1 text-[14px] leading-snug" style={{ color: c.deep }}>
            {meaning}
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2.5">
        {facts.map((f) => (
          <div key={f.k} className="card px-3.5 py-3">
            <dt className="text-[12px] text-[var(--box-muted)]">{f.k}</dt>
            <dd className="mt-0.5 text-[16px] font-semibold tabular-nums">{f.v}</dd>
          </div>
        ))}
      </dl>
    </motion.aside>
  );

  return (
    <div className="relative flex h-full flex-col bg-[var(--panel-bg)] pb-[env(safe-area-inset-bottom)] text-[var(--box-fg)] md:pb-0">
      {/* the top bar, as the reader's */}
      <div className="relative z-10 flex h-[64px] shrink-0 items-center gap-2 px-3 md:h-[76px] md:gap-3 md:px-5">
        <button type="button" onClick={onBack} className={cn("circle-btn", mobile && "is-md")} aria-label={atStart ? "Begin the surah at ayah 1" : "Back to the ayahs"} title="Back to the ayahs (T)">
          <ArrowLeft size={18} strokeWidth={1.9} />
        </button>
        <div className="min-w-0 px-1">
          <div className="truncate text-[17px] font-semibold leading-tight tracking-[-0.02em] md:text-[20px]">{nameMarks(surah.tc)}</div>
          <div className="text-[12.5px] text-[var(--box-muted)] md:text-[13px]">About this surah</div>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 gap-3 px-3 pb-3 md:gap-4 md:px-5 md:pb-5">
        {/* the card stays put beside the text; only the text scrolls (a wheel over the card scrolls it too) */}
        {!mobile && (
          <div className="w-[clamp(240px,28%,320px)] shrink-0" onWheel={(e) => scroller.current?.scrollBy({ top: e.deltaY })}>
            {card}
          </div>
        )}
        <div ref={scroller} tabIndex={-1} className="thin-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[var(--r-card)] outline-none [touch-action:pan-y]">
          <div className="flex max-w-[900px] flex-col gap-3 md:gap-4">
            {mobile && card}
            {sections === null && !failed && <div className="card px-6 py-5 text-[14px] text-[var(--box-muted)]">Opening the summary…</div>}
            {failed && <p className="card px-6 py-5 text-[15px] text-[var(--box-muted)]">The summary didn't load. Check your connection, then open it again.</p>}
            {sections?.length === 0 && (
              <p className="card px-6 py-6 text-[16px] leading-relaxed text-[var(--box-muted)] md:px-9">
                {nameMarks(surah.tc)} opens the Qur'an and is recited in every unit of prayer. Its themes are listed below.
              </p>
            )}
            {sections?.map((s, i) => (
              <motion.section key={i} className="card px-6 py-6 md:px-9 md:py-8" {...rise(i + 1)}>
                <div className="mb-2 inline-flex rounded-full bg-[color-mix(in_srgb,var(--box-accent)_12%,transparent)] px-2.5 py-1 text-[12px] font-medium text-[var(--box-accent)]">{s.kind}</div>
                <h2 className="mb-4 text-[22px] font-semibold leading-tight tracking-[-0.02em] md:text-[26px]">{s.title}</h2>
                <div className="flex flex-col gap-4 text-[16px] leading-[1.7] text-[var(--box-fg)]/90 md:text-[17px]">
                  {s.blocks.map((b, j) =>
                    b.type === "p" ? (
                      <p key={j}>{b.text}</p>
                    ) : (
                      <ul key={j} className="flex flex-col gap-2.5">
                        {b.items.map((it, k) => (
                          <li key={k} className="flex gap-3">
                            {b.type === "ol" ? (
                              <span className="mt-[0.2em] flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[var(--box-hover)] px-1.5 text-[12px] font-medium tabular-nums text-[var(--box-muted)]">{k + 1}</span>
                            ) : (
                              <span className="mt-[0.68em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--box-accent)]" />
                            )}
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    ),
                  )}
                </div>
              </motion.section>
            ))}

            {themes.length > 0 && (
              <motion.section className="card px-3 py-6 md:px-5 md:py-8" {...rise((sections?.length ?? 0) + 1)}>
                <div className="px-3 md:px-4">
                  <div className="mb-2 inline-flex rounded-full bg-[color-mix(in_srgb,var(--box-accent)_12%,transparent)] px-2.5 py-1 text-[12px] font-medium text-[var(--box-accent)]">In this surah</div>
                  <h2 className="mb-4 text-[22px] font-semibold tracking-[-0.02em] md:text-[26px]">Its themes, ayah by ayah</h2>
                </div>
                <ol className="flex flex-col gap-0.5">
                  {themes.map((t) => (
                    <li key={t.from}>
                      <button type="button" onClick={() => onGo(t.from)} className="press-soft group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--box-hover)] md:px-4">
                        <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium tabular-nums" style={{ background: c.soft, color: c.deep }}>
                          {t.from === t.to ? t.from : `${t.from}–${t.to}`}
                        </span>
                        <span className="flex-1 text-[15px] md:text-[16px]">{t.title}</span>
                        <ArrowRight size={16} strokeWidth={1.9} className="shrink-0 text-[var(--box-faint)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--box-fg)]" />
                      </button>
                    </li>
                  ))}
                </ol>
              </motion.section>
            )}
            {/* the way back stays at the foot of the text however far it scrolls (phone and desktop alike) */}
            <div className="pointer-events-none sticky -bottom-px -mt-3 pb-2 pt-6 md:pb-3" style={{ background: "linear-gradient(to bottom, transparent, var(--panel-bg) 60%)" }}>
              <button type="button" onClick={onBack} aria-label={atStart ? "Begin the surah at ayah 1" : "Back to the ayahs"} className="btn-primary pointer-events-auto inline-flex h-12 items-center gap-2.5 px-5 text-[14px] font-medium">
                <Undo2 size={16} strokeWidth={1.8} />
                {atStart ? `Begin ${ayn(surah.tc)} · ayah 1` : "Back to the ayahs"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
