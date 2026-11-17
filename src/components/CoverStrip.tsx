import { ArrowRight, Search } from "lucide-react";
import type { Surah } from "@/lib/data";
import { ayn } from "@/lib/names";
import { useStore } from "@/lib/store";

/**
 * On the cover, under the ways in: the search at rest (pressed, the cover becomes the search) and,
 * when there is a place to go back to, Continue, as wide as its words.
 */
export function CoverStrip({ mobile, surahs, onSearch, onContinue, hidden }: { mobile: boolean; surahs?: Surah[]; onSearch: () => void; onContinue: (surah: number, ayah: number) => void; hidden?: boolean }) {
  // where the reading stopped last time (not the very start of the Qur'an, which is no place to come back to)
  const last = useStore((s) => s.last);
  const resume = last && !(last.s === 1 && last.v <= 1) ? last : null;
  const name = resume ? surahs?.[resume.s - 1]?.tc : undefined;
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={onSearch}
        tabIndex={hidden ? -1 : 0}
        aria-label="Search"
        className="press group flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-[var(--box-line)] bg-[var(--surface)] px-4 text-left text-[var(--box-faint)] transition-[border-color,color] duration-150 hover:border-[var(--box-faint)] hover:text-[var(--box-muted)] md:px-5"
      >
        <Search size={16} strokeWidth={1.7} className="shrink-0" />
        <span className="truncate text-[15px]">{resume && mobile ? "Search" : "Search a surah, an ayah, a word"}</span>
        {!mobile && <span className="kbd ml-auto">/</span>}
      </button>
      {resume && (
        <button
          type="button"
          onClick={() => onContinue(resume.s, resume.v)}
          tabIndex={hidden ? -1 : 0}
          aria-label={`Continue reading${name ? ` ${ayn(name)},` : ""} at ayah ${resume.s}:${resume.v}`}
          title="Continue where you left off"
          className="press group flex h-12 shrink-0 items-center gap-2 rounded-full bg-[var(--box-fg)] px-4 text-[var(--box-bg-solid)] transition-opacity duration-150 hover:opacity-90 md:px-5"
        >
          <span className="whitespace-nowrap text-[14px] font-medium">
            Continue <span className="tabular-nums opacity-70">{resume.s}:{resume.v}</span>
          </span>
          <ArrowRight size={15} strokeWidth={1.8} className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}
