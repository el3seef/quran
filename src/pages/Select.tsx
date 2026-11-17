import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, X } from "lucide-react";
import { IndexView, INDEX_VIEWS, type IndexKind } from "./IndexViews";
import { AyahSlider } from "@/components/ui/slider";
import { SearchBox } from "@/components/SearchBox";
import type { Surah } from "@/lib/data";
import type { Rect } from "@/lib/layout";
import type { Result } from "@/lib/search";
import { surahColor } from "@/lib/surahColor";
import { nameMarks } from "@/lib/names";
import { useUI } from "@/lib/ui";
import { EASE_OUT, cn } from "@/lib/utils";
import { byKeys } from "@/lib/motion";

export type OpenRequest = { surah: number; ayah: number; from?: Rect };

let lastView: IndexKind = "ring"; // the way the index was last seen, kept for coming back to it

/**
 * The surahs: all 114 as cards, each in its own colour (lib/surahColor), the one the reader came
 * from lit and brought into view; the other ways into the Qur'an (the juz, where each was revealed,
 * its themes, topics, supplications, prostrations, summaries) a chip each above them. A card opens a
 * sheet: begin the surah, or choose the ayah to begin at.
 */
export function Select({
  surahs,
  juz,
  initialSurah,
  initialAyah,
  onOpen,
  mobile,
  resume,
}: {
  surahs: Surah[];
  juz: Record<string, string>;
  initialSurah: number;
  initialAyah: number;
  onOpen: (r: OpenRequest) => void;
  mobile: boolean;
  resume?: { s: number; v: number } | null;
  onSettings: () => void;
  settingsOpen: boolean;
  onBack: () => void;
}) {
  const [view, setViewState] = useState<IndexKind>(lastView);
  const setView = (v: IndexKind) => {
    lastView = v;
    setViewState(v);
  };
  const [sheet, setSheet] = useState<{ s: number; a: number } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  // the surah the reader came from, brought into view (once)
  useEffect(() => {
    if (view !== "ring") return;
    const el = grid.current?.querySelector<HTMLElement>(`[data-s="${initialSurah}"]`);
    el?.scrollIntoView({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const onPick = (r: Result) => {
    if (r.kind === "surah") setSheet({ s: r.surah.n, a: 1 });
    else onOpen({ surah: r.surah.n, ayah: r.ayah });
  };

  // keys: "/" to search, "c" to go on where the reading stopped, Escape to close the sheet
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || t?.closest?.("input, textarea, [contenteditable='true']") || useUI.getState().about) return;
      if (e.key === "Escape" && sheet) return setSheet(null);
      if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".surahs-search .search-input")?.focus();
      }
      if (e.key === "c" && resume) onOpen({ surah: resume.s, ayah: resume.v });
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [sheet, resume, onOpen]);

  const totalAyat = useMemo(() => surahs.reduce((n, s) => n + s.count, 0), [surahs]);

  return (
    <div className="relative h-full text-[var(--box-fg)]">
      <div className="thin-scroll h-full overflow-y-auto overscroll-contain">
        <div className={cn("mx-auto w-full max-w-[1180px] px-4 md:px-8 2xl:max-w-[1400px]", mobile ? "pb-[calc(100px+env(safe-area-inset-bottom))] pt-5" : "pb-12 pt-8")}>
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="display text-[34px] leading-none md:text-[46px]">Surahs</h1>
              <p className="mt-2 text-[14px] text-[var(--box-muted)]">
                {surahs.length} surahs · {totalAyat.toLocaleString("en-GB")} ayat
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SearchBox className="surahs-search min-w-0 flex-1 md:w-[360px] md:flex-none" surahs={surahs} juz={juz} onPick={onPick} />
              {resume && surahs[resume.s - 1] && (
                <button
                  type="button"
                  onClick={() => onOpen({ surah: resume.s, ayah: resume.v })}
                  className="press flex h-12 shrink-0 items-center gap-2 rounded-full bg-[var(--box-fg)] pl-5 pr-2 text-[14px] font-medium text-[var(--box-bg-solid)]"
                  aria-label={`Continue ${surahs[resume.s - 1].tc}, ayah ${resume.v}`}
                  title="Continue where you left off (C)"
                >
                  {mobile ? "" : "Continue"} <span className="tabular-nums opacity-70">{resume.s}:{resume.v}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--box-bg-solid)] text-[var(--box-fg)]">
                    <ArrowRight size={16} strokeWidth={2} />
                  </span>
                </button>
              )}
            </div>
          </header>

          {/* the ways into the Qur'an */}
          <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="tablist" aria-label="Ways into the Qur'an">
            {INDEX_VIEWS.map((v) => (
              <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={cn("chip", view === v.id && "is-on")} title={v.line}>
                {v.id === "ring" ? "All surahs" : v.name}
              </button>
            ))}
          </div>

          {view === "ring" ? (
            <div ref={grid} className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:mt-6 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {surahs.map((s) => (
                <SurahCard key={s.n} s={s} here={s.n === initialSurah} onClick={() => setSheet({ s: s.n, a: s.n === initialSurah ? initialAyah : 1 })} />
              ))}
            </div>
          ) : (
            <div className="card mt-5 p-5 md:mt-6 md:p-8">
              <IndexView kind={view} surahs={surahs} juz={juz} onOpen={(s, a) => onOpen({ surah: s, ayah: a })} mobile={mobile} />
            </div>
          )}
        </div>
      </div>

      <AyahSheet at={sheet} surahs={surahs} mobile={mobile} onClose={() => setSheet(null)} onOpen={(s, a) => onOpen({ surah: s, ayah: a })} />
    </div>
  );
}

/** A surah's card: its number, its name in Arabic and in English, its ayat and where it came down. */
function SurahCard({ s, here, onClick }: { s: Surah; here: boolean; onClick: () => void }) {
  const c = surahColor(s.n);
  return (
    <button
      type="button"
      data-s={s.n}
      onClick={onClick}
      aria-label={`${s.tc}, ${s.en}: ${s.count} ayat`}
      className={cn("card-tint press-soft group relative flex aspect-[4/5] flex-col justify-between overflow-hidden p-3.5 text-left sm:p-4 md:p-5", here && "ring-2 ring-[var(--box-fg)] ring-offset-2 ring-offset-[var(--box-bg)]")}
      style={{ background: c.bg }}
    >
      <span className="flex items-start justify-between">
        <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white/60 px-2 text-[12.5px] font-medium tabular-nums">{s.n}</span>
        <span className="font-kufi text-[24px] leading-none md:text-[28px]" dir="rtl" lang="ar">
          {s.ar}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[17px] font-semibold leading-tight tracking-[-0.01em] md:text-[19px]">{nameMarks(s.tc)}</span>
        <span className="mt-0.5 block truncate text-[13px] opacity-65">{s.en}</span>
        <span className="mt-3 flex flex-wrap items-center gap-1 text-[11.5px] font-medium opacity-75 sm:gap-1.5 sm:text-[12px]">
          <span className="whitespace-nowrap rounded-full bg-white/55 px-2 py-0.5">{s.count} ayat</span>
          <span className="whitespace-nowrap rounded-full bg-white/55 px-2 py-0.5">{s.place === "makkah" ? "Makkan" : "Madinan"}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * A surah chosen: a sheet rising from the foot of a phone (a card in the middle of a computer's
 * panel), to begin it, or to slide to the ayah to begin at.
 */
function AyahSheet({ at, surahs, mobile, onClose, onOpen }: { at: { s: number; a: number } | null; surahs: Surah[]; mobile: boolean; onClose: () => void; onOpen: (s: number, a: number) => void }) {
  const [ayah, setAyah] = useState(1);
  useEffect(() => {
    if (at) setAyah(at.a);
  }, [at]);
  const s = at ? surahs[at.s - 1] : null;
  const c = at ? surahColor(at.s) : null;
  const instant = byKeys();
  // (on the page itself, above the panel and the phone's navigation pill: inside the panel it sat under the pill)
  return createPortal(
    <AnimatePresence>
      {at && s && c && (
        <motion.div key="sheet" className="fixed inset-0 z-[70] flex items-end justify-center md:items-center" initial={{ opacity: 1 }} exit={{ opacity: 1, transition: { duration: instant ? 0 : 0.2 } }}>
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/30"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: instant ? 0 : 0.2 }}
          />
          <motion.div
            role="dialog"
            aria-label={`${s.tc}: choose where to begin`}
            className={cn("relative w-full overflow-hidden bg-[var(--surface)] p-5 md:max-w-[440px] md:rounded-[30px] md:p-6", mobile ? "rounded-t-[30px] pb-[calc(20px+env(safe-area-inset-bottom))]" : "")}
            initial={mobile ? { y: "100%" } : { opacity: 0, scale: 0.96 }}
            animate={mobile ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={mobile ? { y: "100%" } : { opacity: 0, scale: 0.97 }}
            transition={{ duration: instant ? 0 : mobile ? 0.32 : 0.2, ease: [0.32, 0.72, 0, 1] }}
            onKeyDown={(e) => e.key === "Enter" && !(e.target as HTMLElement).closest("button") && onOpen(s.n, ayah)}
          >
            {mobile && <span className="mx-auto mb-4 block h-1.5 w-10 rounded-full bg-[var(--box-line)]" aria-hidden />}
            <div className="card-tint flex items-center justify-between gap-4 p-5" style={{ background: c.bg }}>
              <span className="min-w-0">
                <span className="block truncate text-[22px] font-semibold tracking-[-0.015em]">{nameMarks(s.tc)}</span>
                <span className="mt-0.5 block text-[13px] opacity-65">
                  {s.en} · {s.count} ayat
                </span>
              </span>
              <span className="font-kufi text-[32px] leading-none" dir="rtl" lang="ar">
                {s.ar}
              </span>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="circle-btn is-sm absolute right-4 top-4 hidden md:inline-flex">
              <X size={16} strokeWidth={2} />
            </button>
            <div className="mt-5 flex items-center justify-between text-[13px] text-[var(--box-muted)]">
              <span>Begin at ayah</span>
              <span className="tabular-nums text-[var(--box-fg)]">
                {ayah} of {s.count}
              </span>
            </div>
            <div className="mt-1">
              <AyahSlider key={s.n} value={Math.min(ayah, s.count)} max={s.count} onChange={setAyah} />
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => onOpen(s.n, 1)} className="press flex h-12 flex-1 items-center justify-center rounded-full border border-[var(--box-line)] text-[14.5px] font-medium">
                From the start
              </button>
              <button type="button" onClick={() => onOpen(s.n, ayah)} className="press flex h-12 flex-[1.3] items-center justify-center gap-2 rounded-full bg-[var(--box-fg)] text-[14.5px] font-medium text-[var(--box-bg-solid)]" autoFocus={!mobile}>
                Read from {s.n}:{ayah} <ArrowRight size={16} strokeWidth={2} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
