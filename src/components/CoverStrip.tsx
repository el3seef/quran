import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Search } from "lucide-react";
import type { Surah } from "@/lib/data";
import { coverFoot, type Rect } from "@/lib/layout";
import { ayn } from "@/lib/names";
import { useStore } from "@/lib/store";
import { EASE_OUT } from "@/lib/utils";

/**
 * Page one: a strip of its own below the cover, as wide as it, just above the themes: the search at
 * rest (pressed, the cover becomes the search) and, when there is a place to go back to, Continue,
 * the strip split by a line, the button on the right, as wide as its words.
 */
export function CoverStrip({ show, rect, mobile, surahs, onSearch, onContinue }: { show: boolean; rect: Rect; mobile: boolean; surahs?: Surah[]; onSearch: () => void; onContinue: (surah: number, ayah: number) => void }) {
  // where the reading stopped last time (not the very start of the Qur'an, which is no place to come back to)
  const last = useStore((s) => s.last);
  const resume = last && !(last.s === 1 && last.v <= 1) ? last : null;
  const name = resume ? surahs?.[resume.s - 1]?.tc : undefined;
  const foot = coverFoot(mobile);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed z-20"
          style={{ left: rect.left, width: rect.width, height: foot.h, bottom: `calc(${foot.strip}px + var(--app-bottom, env(safe-area-inset-bottom, 0px)))` }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.95, duration: 0.8, ease: EASE_OUT } }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.25 } }}
        >
          <div className="frame-box cover-strip relative flex h-full items-stretch overflow-hidden bg-[var(--box-bg)] text-[var(--box-fg)]">
            <button
              type="button"
              onClick={onSearch}
              aria-label="Search"
              className="group flex min-w-0 flex-1 items-center justify-center gap-2 px-4 text-[var(--box-faint)] transition-[color,background-color] duration-300 hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)]"
            >
              <Search size={12.5} strokeWidth={1.7} className="shrink-0 transition-transform duration-300 group-hover:scale-110" />
              <span className="label-sm truncate">{resume && mobile ? "Search" : "Search a surah, an ayah, a word"}</span>
            </button>
            {resume && (
              <>
                <span aria-hidden className="w-px shrink-0 bg-[var(--box-line)]" />
                <button
                  type="button"
                  onClick={() => onContinue(resume.s, resume.v)}
                  aria-label={`Continue reading${name ? ` ${ayn(name)},` : ""} at ayah ${resume.s}:${resume.v}`}
                  title="Continue where you left off"
                  className="group flex shrink-0 items-center gap-2 px-4 text-[var(--box-faint)] transition-[color,background-color] duration-300 hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)] md:px-5"
                >
                  <span className="label-sm whitespace-nowrap">
                    Continue <span className="tabular-nums text-[var(--box-muted)] transition-colors duration-300 group-hover:text-[var(--box-fg)]">{resume.s}:{resume.v}</span>
                  </span>
                  <ArrowRight size={12} strokeWidth={1.7} className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" />
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
