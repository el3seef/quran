import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { BracketButton, Clock } from "@/components/bits";
import { CoverSearch } from "@/components/CoverSearch";
import { SettingsGlyph } from "@/components/ImmersivePanel";
import type { Surah } from "@/lib/data";
import type { Result } from "@/lib/search";
import { EASE_OUT, cn } from "@/lib/utils";

/**
 * Page one: the frame itself, small, like the cover of the book, with the reading page's header and
 * the same box theme. In it, the ways in, a strip each, named and nothing more: the Qur'an (the frame
 * grows into its index), the Seerah, and an ayah made into a video to share. Below it, a strip of its
 * own (CoverStrip): the search, and Continue. Typed into, the cover becomes the search, and what is
 * picked opens straight in the reader.
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
}: {
  onEnter: () => void;
  onSettings: () => void;
  settingsOpen: boolean;
  mobile: boolean;
  index: { surahs: Surah[]; juz: Record<string, string> } | null;
  searching: boolean;
  onSearching: (on: boolean) => void;
  onPick: (r: Result) => void;
  onSeerah: () => void;
  onVideo: () => void;
}) {
  const started = useRef(false);
  const go = () => {
    if (started.current) return;
    started.current = true;
    onEnter();
  };
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
      // typing on the cover searches: the first letter goes into the field
      if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "/") e.preventDefault();
        openSearch();
        return;
      }
      if (e.key !== "Enter") return;
      // a focused button takes its own Enter
      if (t?.closest?.("button, a")) return;
      go();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, searching]);

  return (
    <div className="cover-page relative flex h-full flex-col text-[var(--box-fg)]">
      {/* header, as on the reading page: the time, and the way to Settings */}
      <motion.header
        className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-[var(--box-line)] pl-5 pr-2 md:h-[52px] md:pl-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <Clock className="label-sm text-[var(--box-faint)]" />
        {mobile ? (
          <button
            type="button"
            onClick={onSettings}
            aria-label="Settings"
            title="Settings"
            className="flex h-9 w-9 items-center justify-center text-[var(--box-muted)] transition-colors hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)]"
          >
            <SettingsGlyph open={settingsOpen} />
          </button>
        ) : (
          <BracketButton onClick={onSettings} active={settingsOpen} title="Settings">
            Settings
          </BracketButton>
        )}
      </motion.header>

      {/* the cover: the ways in, one strip each */}
      <div
        className={cn("relative flex min-h-0 flex-1 flex-col justify-center gap-3 p-3 transition-[opacity,filter,transform] duration-500 ease-out md:gap-4 md:p-5", searching && "pointer-events-none -translate-y-2 opacity-0 blur-[3px]")}
        aria-hidden={searching}
      >
        <Way ar="القرآن الكريم" en="Al-Qur’ān al-Karīm" label="Read the Qur'an" onClick={go} tabIndex={searching ? -1 : 0} mobile={mobile} delay={0.55} />
        <Way ar="السيرة النبوية" en="As-Sīrah an-Nabawiyyah" label="The Seerah" onClick={onSeerah} tabIndex={searching ? -1 : 0} mobile={mobile} delay={0.7} seerah />
        <Way ar="شارك آية" en="Share an Āyah" label="Make a video of ayahs to share" onClick={onVideo} tabIndex={searching ? -1 : 0} mobile={mobile} delay={0.85} />
      </div>

      <CoverSearch surahs={index?.surahs ?? []} juz={index?.juz ?? {}} open={searching} onClose={closeSearch} onPick={onPick} inputRef={field} />
    </div>
  );
}

/**
 * A way in from the cover, a strip across the box: its name in Arabic along the top, in English along
 * the foot. Hovered, a light passes across it.
 */
function Way({ ar, en, label, onClick, tabIndex, mobile, delay, seerah }: { ar: string; en: string; label: string; onClick: () => void; tabIndex: number; mobile: boolean; delay: number; seerah?: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      tabIndex={tabIndex}
      aria-label={label}
      className={cn("cover-way group relative flex max-h-[200px] min-h-[92px] flex-1 flex-col justify-between overflow-hidden border border-[var(--box-line)] px-4 py-3.5 text-left transition-[border-color,background-color] duration-300 hover:border-[var(--box-muted)] hover:bg-[var(--box-hover)] md:px-6 md:py-5", seerah && "is-seerah")}
      initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.9, ease: EASE_OUT, delay }}
    >
      {/* a light passing across on hover */}
      <span className="pointer-events-none absolute -inset-y-4 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" />
      <span className="relative flex items-start justify-end gap-3">
        <span className="font-kufi leading-none text-[var(--box-fg)] transition-transform duration-500 ease-out group-hover:-translate-x-1" style={{ fontSize: mobile ? 34 : 46 }} dir="rtl" lang="ar">
          {ar}
        </span>
      </span>
      <span className="relative flex items-end">
        <span className="display cover-name font-serif italic leading-none transition-transform duration-500 ease-out group-hover:translate-x-1" style={{ fontSize: mobile ? 19 : 24 }}>
          {en}
        </span>
      </span>
    </motion.button>
  );
}
