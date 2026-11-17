import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Bookmark, Clapperboard, Map as MapIcon, Search, Sparkles, Target } from "lucide-react";
import { CoverSearch } from "@/components/CoverSearch";
import { arabicText, loadSurah, translationText, type Surah } from "@/lib/data";
import type { Result } from "@/lib/search";
import { useStore } from "@/lib/store";
import { surahColor } from "@/lib/surahColor";
import { nameMarks } from "@/lib/names";
import { EASE_OUT, cn } from "@/lib/utils";

/** Ayat to come back to, one for each day (by the day of the year). */
const DAILY = ["2:255", "94:5", "13:28", "39:53", "2:286", "3:190", "20:114", "65:3", "2:186", "3:139", "55:13", "93:3", "29:69", "16:97", "49:13", "24:35", "17:24", "59:22", "1:5", "21:87", "8:46", "2:45", "3:8", "25:63", "33:41", "50:16", "57:4", "67:2", "2:152", "18:10"];

/**
 * Home: where the site opens. A greeting with today's date by both calendars; the surah the reader
 * was in, as a card in its own colour, with how far into it they are; the thirty juz as a strip of
 * capsules; and, in cards, the ayah of the day, the Seerah, an ayah made into a video, the reader's
 * progress and what they have saved. Typed into, it becomes the search, and what is picked opens in
 * the reader.
 */
export function Intro({
  onEnter,
  onSettings,
  settingsOpen,
  mobile,
  index,
  searching,
  onSearching,
  onPick,
  onSeerah,
  onVideo,
  onContinue,
}: {
  onEnter: () => void;
  onSettings: (tab?: "saved" | "progress") => void;
  settingsOpen: boolean;
  mobile: boolean;
  index: { surahs: Surah[]; juz: Record<string, string> } | null;
  searching: boolean;
  onSearching: (on: boolean) => void;
  onPick: (r: Result) => void;
  onSeerah: () => void;
  onVideo: () => void;
  onContinue: (surah: number, ayah: number) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  // (the field is focused in the press itself, so a phone brings its keyboard up)
  const openSearch = () => {
    field.current?.focus({ preventScroll: true });
    onSearching(true);
  };
  const closeSearch = () => {
    field.current?.blur();
    onSearching(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable='true']")) return;
      if (searching) {
        if (e.key === "Escape") closeSearch();
        return;
      }
      // typing on Home searches: the first letter goes into the field
      if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "/") e.preventDefault();
        openSearch();
        return;
      }
      if (e.key === "Enter" && !t?.closest?.("button, a")) onEnter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, searching]);

  const surahs = index?.surahs ?? [];
  const last = useStore((s) => s.last);
  const done = useStore((s) => s.done);
  const goal = useStore((s) => s.goal);
  const bookmarks = useStore((s) => s.bookmarks);
  const notes = useStore((s) => s.notes);
  const highlights = useStore((s) => s.highlights);
  const translation = useStore((s) => s.settings.translation);

  // where the reading stopped (the very start of the Qur'an, if nowhere yet)
  const at = last && surahs[last.s - 1] ? last : { s: 1, v: 1 };
  const begun = !!last && !(last.s === 1 && last.v <= 1);
  const cur = surahs[at.s - 1];
  // the juz it is in
  const juzNow = useMemo(() => {
    if (!index) return 1;
    let j = 1;
    for (const [n, k] of Object.entries(index.juz)) {
      const [s, a] = k.split(":").map(Number);
      if (s < at.s || (s === at.s && a <= at.v)) j = Math.max(j, Number(n));
    }
    return j;
  }, [index, at.s, at.v]);

  // the ayah of the day, its words fetched
  const dayKey = useMemo(() => {
    const d = new Date();
    const day = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);
    return DAILY[day % DAILY.length];
  }, []);
  const [daily, setDaily] = useState<{ ar: string; tr: string } | null>(null);
  useEffect(() => {
    const [s, a] = dayKey.split(":").map(Number);
    let alive = true;
    loadSurah(s)
      .then((d) => {
        const v = d.v[a - 1];
        if (alive && v) setDaily({ ar: arabicText(v), tr: translationText(v, translation, false) });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [dayKey, translation]);
  const [ds, da] = dayKey.split(":").map(Number);

  const today = new Date();
  const hijri = new Intl.DateTimeFormat("en-GB-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(today).replace(/\s*AH$/, "");
  const greg = today.toLocaleDateString("en-GB", { weekday: mobile ? "short" : "long", day: "numeric", month: "long" });
  const doneCount = Object.keys(done).length;
  const noteCount = Object.keys(notes).length, hlCount = Object.keys(highlights).length, bmCount = Object.keys(bookmarks).length;
  const color = surahColor(at.s);

  // the cards come up one after another, the first time the page is seen
  const rise = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: EASE_OUT, delay: 0.04 * i } });

  return (
    <div className="cover-page relative h-full text-[var(--box-fg)]">
      <div
        className={cn("thin-scroll h-full overflow-y-auto overscroll-contain transition-[opacity,translate] duration-200 ease-out", searching && "pointer-events-none translate-y-1 opacity-0")}
        aria-hidden={searching}
      >
        <div className={cn("mx-auto flex w-full max-w-[1180px] flex-col px-4 md:px-8 2xl:max-w-[1400px]", mobile ? "pb-[calc(100px+env(safe-area-inset-bottom))] pt-5" : "pb-6 pt-7 lg:h-full lg:min-h-[640px]")}>
          {/* greeting, and the search */}
          <motion.header className="flex items-start gap-3 md:gap-4" {...rise(0)}>
            <div className="min-w-0 flex-1">
              <h1 className="display whitespace-nowrap text-[clamp(24px,7.4vw,30px)] leading-[1.05] md:text-[36px] lg:text-[42px]">Assalāmu ʿalaykum</h1>
              <p className="mt-2 flex flex-wrap gap-x-1.5 text-[14px] text-[var(--box-muted)] md:text-[15px]">
                <span className="whitespace-nowrap">{greg} ·</span>
                <span className="whitespace-nowrap text-[var(--box-fg)]">{hijri}</span>
              </p>
            </div>
            {mobile ? (
              <button type="button" onClick={openSearch} className="circle-btn mt-1" aria-label="Search">
                <Search size={19} strokeWidth={1.9} />
              </button>
            ) : (
              <button
                type="button"
                onClick={openSearch}
                className="press mt-2 flex h-12 w-[min(380px,32vw)] shrink-0 items-center gap-3 lg:w-[min(380px,24vw)] rounded-full bg-[var(--surface)] px-5 text-left text-[15px] text-[var(--box-faint)] shadow-[0_0_0_1px_var(--box-line)]"
                aria-label="Search"
              >
                <Search size={18} strokeWidth={1.9} className="text-[var(--box-fg)]" />
                <span className="truncate">Search a surah, an ayah, a word</span>
                <span className="kbd ml-auto">/</span>
              </button>
            )}
            {!mobile && (
              <button type="button" onClick={onEnter} className="press mt-2 hidden h-12 shrink-0 items-center gap-2 rounded-full bg-[var(--box-fg)] pl-5 pr-1.5 text-[14.5px] font-medium text-[var(--box-bg-solid)] lg:flex">
                All 114 surahs
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--box-bg-solid)] text-[var(--box-fg)]">
                  <ArrowUpRight size={17} strokeWidth={2} />
                </span>
              </button>
            )}
          </motion.header>

          <div className="mt-6 grid grid-cols-2 gap-3 md:mt-7 md:grid-cols-6 md:gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-[minmax(190px,1.3fr)_auto_minmax(124px,1fr)]">
            {/* where the reading stopped, in that surah's colour */}
            <motion.button
              type="button"
              onClick={() => (begun ? onContinue(at.s, at.v) : onContinue(1, 1))}
              className="card-tint press-soft group relative col-span-2 flex min-h-[220px] flex-col justify-between overflow-hidden p-6 text-left md:col-span-6 md:min-h-[240px] md:p-8 lg:col-span-8 lg:min-h-0"
              style={{ background: color.bg }}
              aria-label={begun && cur ? `Continue ${cur.tc}, ayah ${at.v}` : "Begin with Al-Fatihah"}
              {...rise(1)}
            >
              <span className="pointer-events-none absolute right-5 top-[42%] -translate-y-1/2 font-kufi leading-none opacity-[0.09] md:right-10" style={{ fontSize: mobile ? 84 : 150 }} dir="rtl" lang="ar" aria-hidden>
                {cur?.ar}
              </span>
              <span className="relative flex items-center justify-between">
                <span className="rounded-full bg-white/60 px-3 py-1.5 text-[12.5px] font-medium">{begun ? "Continue reading" : "Begin here"}</span>
                <span className="circle-btn is-dark transition-transform duration-200 ease-out group-hover:-rotate-45">
                  <ArrowRight size={19} strokeWidth={2} />
                </span>
              </span>
              <span className="relative">
                <span className="display block text-[34px] leading-[1.02] md:text-[46px] xl:text-[52px]">{cur ? nameMarks(cur.tc) : "Al-Fātiḥah"}</span>
                <span className="mt-1.5 block text-[14px] opacity-70 md:text-[15px]">
                  {cur?.en} · ayah {at.v} of {cur?.count ?? 7}
                </span>
                <span className="mt-4 block h-2 w-full max-w-[420px] overflow-hidden rounded-full bg-black/10">
                  <span className="block h-full rounded-full bg-[#111113]" style={{ width: `${Math.max(3, ((at.v - (begun ? 0 : 1)) / (cur?.count ?? 7)) * 100)}%` }} />
                </span>
              </span>
            </motion.button>

            {/* the ayah of the day */}
            <motion.button
              type="button"
              onClick={() => onContinue(ds, da)}
              className="card-tint press-soft col-span-2 flex min-h-[200px] flex-col justify-between gap-4 overflow-hidden p-6 text-left md:col-span-6 md:p-7 lg:col-span-4 lg:row-span-2 lg:min-h-0"
              style={{ background: "var(--p-peach)" }}
              aria-label={`The ayah of the day, ${dayKey}`}
              {...rise(2)}
            >
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  <Sparkles size={15} strokeWidth={2} /> Ayah of the day
                </span>
                <span className="rounded-full bg-white/60 px-3 py-1.5 text-[12.5px] font-medium tabular-nums">{dayKey}</span>
              </span>
              <span className="quran block text-right text-[24px] leading-[1.9] md:text-[27px]" dir="rtl" lang="ar">
                {daily?.ar ?? " "}
              </span>
              <span className="line-clamp-4 text-[14.5px] leading-[1.55] opacity-80 lg:line-clamp-[6]">{daily?.tr}</span>
              <span className="text-[13px] font-medium">{surahs[ds - 1] ? nameMarks(surahs[ds - 1].tc) : ""}</span>
            </motion.button>

            {/* the thirty juz */}
            <motion.div className="card col-span-2 min-w-0 p-5 md:col-span-6 md:p-6 lg:col-span-8" {...rise(3)}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[15px] font-medium">Juz</span>
                <span className="text-[13px] text-[var(--box-muted)]">You are in juz {juzNow}</span>
              </div>
              <JuzStrip juz={index?.juz ?? {}} now={juzNow} onOpen={onContinue} />
            </motion.div>

            <Tile i={4} color="var(--p-sky)" icon={<MapIcon size={18} strokeWidth={1.9} />} eyebrow="The Seerah" title={<>The life of the Prophet <span className="font-[Amiri_Quran] text-[0.8em] font-normal">ﷺ</span></>} onClick={onSeerah} wide={!mobile} />
            <Tile i={5} color="var(--p-blush)" icon={<Clapperboard size={18} strokeWidth={1.9} />} eyebrow="Share an ayah" title="Make a video to share" onClick={onVideo} wide={!mobile} />
            <Tile
              i={6}
              color="var(--p-mint)"
              icon={<Target size={18} strokeWidth={1.9} />}
              eyebrow="Progress"
              title={`${doneCount} of 114 surahs`}
              note={goal ? (goal.kind === "khatm" ? "Reading towards a khatm" : `Goal: ${goal.count} a ${goal.kind}`) : "Set a reading goal"}
              onClick={() => onSettings("progress")}
              wide={!mobile}
            />
            <Tile
              i={7}
              color="var(--p-lilac)"
              icon={<Bookmark size={18} strokeWidth={1.9} />}
              eyebrow="Saved"
              title={`${bmCount} bookmark${bmCount === 1 ? "" : "s"}`}
              note={`${hlCount} highlight${hlCount === 1 ? "" : "s"} · ${noteCount} note${noteCount === 1 ? "" : "s"}`}
              onClick={() => onSettings("saved")}
              wide={!mobile}
            />
          </div>

          <motion.button
            type="button"
            onClick={onEnter}
            className="press mt-3 flex h-14 w-full shrink-0 items-center justify-between rounded-full lg:hidden bg-[var(--box-fg)] pl-6 pr-2 text-[15px] font-medium text-[var(--box-bg-solid)] md:mt-4"
            {...rise(8)}
          >
            All 114 surahs
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--box-bg-solid)] text-[var(--box-fg)]">
              <ArrowUpRight size={18} strokeWidth={2} />
            </span>
          </motion.button>
        </div>
      </div>

      <CoverSearch surahs={surahs} juz={index?.juz ?? {}} open={searching} onClose={closeSearch} onPick={onPick} inputRef={field} />
    </div>
  );
}

/** A card of the dashboard: its colour, an icon in a round, what it is, and a line more. */
function Tile({ i, color, icon, eyebrow, title, note, onClick, wide }: { i: number; color: string; icon: ReactNode; eyebrow: string; title: ReactNode; note?: string; onClick: () => void; wide: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={cn("card-tint press-soft group flex min-h-[150px] flex-col justify-between gap-3 overflow-hidden p-5 text-left md:min-h-[160px] md:p-6 lg:min-h-0", wide ? "md:col-span-3" : "col-span-1")}
      style={{ background: color }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.04 * i }}
    >
      <span className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/60">{icon}</span>
        <ArrowUpRight size={18} strokeWidth={2} className="opacity-50 transition-[opacity,translate] duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" />
      </span>
      <span>
        <span className="block text-[12.5px] font-medium opacity-65">{eyebrow}</span>
        <span className="mt-1 block text-[17px] font-semibold leading-tight tracking-[-0.01em] md:text-[19px]">{title}</span>
        {note && <span className="mt-1 block text-[12.5px] opacity-65">{note}</span>}
      </span>
    </motion.button>
  );
}

/** The thirty juz as capsules, the one the reader is in filled in ink; each opens where it begins. */
function JuzStrip({ juz, now, onOpen }: { juz: Record<string, string>; now: number; onOpen: (s: number, a: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  // (the reader's juz brought into view)
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-j="${now}"]`);
    if (el && box.current) box.current.scrollLeft = el.offsetLeft - box.current.clientWidth / 2 + el.clientWidth / 2;
  }, [now]);
  return (
    <div ref={box} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {Array.from({ length: 30 }, (_, k) => k + 1).map((j) => {
        const [s, a] = (juz[String(j)] ?? "1:1").split(":").map(Number);
        const on = j === now;
        return (
          <button
            key={j}
            type="button"
            data-j={j}
            onClick={() => onOpen(s, a)}
            aria-label={`Juz ${j}, from ${s}:${a}`}
            className={cn(
              "press flex h-[70px] w-[50px] shrink-0 flex-col lg:h-[62px] items-center justify-center gap-1 rounded-full border text-[var(--box-fg)] transition-colors duration-150",
              on ? "border-[var(--box-fg)] bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : "border-[var(--box-line)] hover:border-[var(--box-faint)]",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-[var(--box-bg-solid)]" : "bg-[var(--box-faint)] opacity-60")} />
            <span className="text-[17px] font-medium tabular-nums">{j}</span>
          </button>
        );
      })}
    </div>
  );
}
