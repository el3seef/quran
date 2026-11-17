import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import type { Surah } from "@/lib/data";
import type { Result } from "@/lib/search";
import { ResultList, resultKeys, useSearchResults } from "./SearchBox";
import { EASE_OUT, cn } from "@/lib/utils";

const TRY = ["2:255", "Kahf", "الكهف", "page 50", "last ayah of Yasin", "verses about patience", "Juz 30"];

/**
 * The cover's search, open: the field under the header, what it finds below it; a pick opens the
 * reader there. It is always in the page (unseen until it opens), so pressing the quiet field in
 * the strip below the frame (CoverStrip) can bring the keyboard up at once onto a field already
 * near the top: a phone's keyboard then rises below it without pushing the page. The list ends
 * above the keyboard.
 */
export function CoverSearch({
  surahs,
  juz,
  open,
  onClose,
  onPick,
  inputRef,
}: {
  surahs: Surah[];
  juz: Record<string, string>;
  open: boolean;
  onClose: () => void;
  onPick: (r: Result) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState("");
  const qRef = useRef(q);
  qRef.current = q;
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const { all, loadingText } = useSearchResults(surahs, juz, q);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // the list's foot: above a phone's keyboard (what of the page is in view), as the frame moves
  const [maxH, setMaxH] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const fit = () => {
      const el = listRef.current;
      if (!el) return;
      const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      setMaxH(Math.max(96, bottom - el.getBoundingClientRect().top - 12));
    };
    fit();
    let raf = 0;
    const until = performance.now() + 900; // (the frame gliding into place)
    const follow = () => {
      fit();
      if (performance.now() < until) raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
    };
  }, [open]);

  const pick = (r: Result) => {
    inputRef.current?.blur();
    onPick(r);
  };
  // (one letter that finds nothing yet: still the suggestions, not "nothing matches")
  const shown = q.trim().length > 1 || all.length > 0;

  return (
    <div className={cn("absolute inset-x-0 bottom-0 top-14 z-20 mx-auto flex w-full max-w-[680px] flex-col md:top-16", !open && "pointer-events-none")} aria-hidden={!open}>
      <motion.div
        className="mx-3 flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-[var(--box-line)] bg-[var(--surface)] pl-4 pr-1.5 md:mx-6 md:h-14 md:pl-5"
        initial={false}
        animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: open ? 0.22 : 0.15, ease: EASE_OUT }}
      >
        <Search size={15} strokeWidth={1.6} className="shrink-0 text-[var(--box-faint)]" />
        <input
          ref={inputRef}
          type="text"
          tabIndex={open ? 0 : -1}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) =>
            resultKeys(
              e,
              all.length,
              setActive,
              () => all[active] && pick(all[active]),
              () => (q ? setQ("") : onClose()),
            )
          }
          // a phone's keyboard put away with nothing typed: back to the cover
          onBlur={() => setTimeout(() => document.activeElement !== inputRef.current && !qRef.current && onClose(), 150)}
          className="cover-search-input min-w-0 flex-1 bg-transparent outline-none"
          placeholder="A surah, an ayah or a word"
          aria-label="Search surahs, ayahs and words"
          aria-autocomplete="list"
          aria-expanded={shown}
          enterKeyHint="search"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          dir="auto"
        />
        {q && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ("")} aria-label="Clear" className="flex h-8 w-8 items-center justify-center text-[var(--box-faint)] transition-colors hover:text-[var(--box-fg)]">
            <X size={14} strokeWidth={1.6} />
          </button>
        )}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClose} className="label-sm h-8 shrink-0 px-2.5 text-[var(--box-muted)] transition-colors hover:text-[var(--box-fg)]">
          Close
        </button>
      </motion.div>

      <div ref={listRef} role="listbox" aria-label="Results" className="thin-scroll mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 md:px-4" style={{ maxHeight: maxH }}>
        <AnimatePresence mode="wait" initial={false}>
          {open && !shown && (
            <motion.div key="try" className="px-4 pb-6 pt-4 md:px-3" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, delay: 0.05, ease: EASE_OUT }}>
              <div className="label-sm text-[var(--box-faint)]">Try</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {TRY.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQ(t);
                      inputRef.current?.focus({ preventScroll: true });
                    }}
                    dir="auto"
                    className={cn("pill press h-8 border border-[var(--box-line)] px-3 text-[var(--box-muted)] transition-colors duration-150 hover:border-[var(--box-faint)] hover:text-[var(--box-fg)]", /[؀-ۿ]/.test(t) ? "font-kufi text-[15px]" : "text-[13.5px]")}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
          {open && shown && (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              <ResultList all={all} active={active} setActive={setActive} pick={pick} loadingText={loadingText} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
