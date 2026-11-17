import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, GalleryVertical, Rows3 } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { Settings } from "@/lib/store";
import { byKeys } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * How the surah is read, in two plain choices instead of a menu: its layout (one ayah to a page, the
 * ayahs scrolling one after another, or as a book) and what is shown (the Arabic with its translation,
 * or either alone). A book is of one of them, so choosing it with both shown takes the Arabic; and
 * choosing both while in a book goes back to the ayahs scrolling. A book has its one switch of its
 * own: the Arabic's printed lines, or the translation's theme headings.
 */
type Layout = "one" | "scroll" | "book";
type Show = Settings["readingMode"];

export const layoutOf = (s: Settings): Layout => (s.view === 1 ? "one" : s.book && s.readingMode !== "both" ? "book" : "scroll");

/** The change a choice makes, applied at once (Read: one fade for the whole of it). */
export function patchFor(s: Settings, want: { layout?: Layout; show?: Show }): Partial<Settings> {
  const layout = want.layout ?? layoutOf(s);
  const show = want.show ?? s.readingMode;
  if (want.show === "both" && layout === "book") return { view: 3, book: false, readingMode: "both" };
  if (layout === "one") return { view: 1, readingMode: show };
  if (layout === "scroll") return { view: 3, book: false, readingMode: show };
  return { view: 3, book: true, readingMode: show === "both" ? "arabic" : show };
}

const LAYOUTS: { id: Layout; label: string; icon: ReactNode }[] = [
  { id: "one", label: "One ayah", icon: <GalleryVertical size={16} strokeWidth={1.9} /> },
  { id: "scroll", label: "Scroll", icon: <Rows3 size={16} strokeWidth={1.9} /> },
  { id: "book", label: "Book", icon: <BookOpen size={16} strokeWidth={1.9} /> },
];
const SHOWS: { id: Show; label: string; short: string }[] = [
  { id: "both", label: "Arabic + translation", short: "Both" },
  { id: "arabic", label: "Arabic only", short: "Arabic" },
  { id: "translation", label: "Translation only", short: "English" },
];

/** A pill of choices, the chosen one filled in ink (it glides there, unless a key chose it). */
function Segments<T extends string>({ name, value, options, onPick, wide }: { name: string; value: T; options: { id: T; label: string; short?: string; icon?: ReactNode }[]; onPick: (v: T) => void; wide?: boolean }) {
  return (
    <div role="radiogroup" aria-label={name} className={cn("no-select relative flex items-center rounded-full bg-[var(--surface)] p-1 shadow-[0_0_0_1px_var(--box-line)]", wide && "w-full")}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => !on && onPick(o.id)}
            className={cn("relative flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[13.5px] font-medium transition-colors duration-150", wide ? "flex-1 px-2.5" : "px-3.5", on ? "text-[var(--box-bg-solid)]" : "text-[var(--box-muted)] hover:text-[var(--box-fg)]")}
          >
            {on && <motion.span layoutId={`seg-${name}-${wide ? "w" : "n"}`} className="absolute inset-0 rounded-full bg-[var(--box-fg)]" transition={{ duration: byKeys() ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }} />}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.short ?? o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A switch in a row: its label, and a pill that slides on or off. */
export function SheetSwitch({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className="press-soft flex w-full items-center justify-between rounded-2xl px-1 py-2 text-left text-[14.5px]">
      {label}
      <span className={cn("relative h-7 w-12 rounded-full transition-colors duration-150", on ? "bg-[var(--box-fg)]" : "bg-[var(--box-line)]")}>
        <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-[var(--surface)] shadow transition-[left] duration-200 ease-out", on ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

/** The two choices in a row (a computer's top bar). */
export function ReadingSwitches({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Segments name="Layout" value={layoutOf(settings)} options={LAYOUTS} onPick={(layout) => onChange(patchFor(settings, { layout }))} />
      <Segments name="Show" value={settings.readingMode} options={SHOWS} onPick={(show) => onChange(patchFor(settings, { show }))} />
    </div>
  );
}

/**
 * The ways to read, from the reader's "Reading" button: on a phone a sheet from the foot of the
 * screen (drag it down, or tap outside, to close); on a computer a card that grows from the button.
 * Both hold the two choices, the book's own switch, and `extra` (focus, on a phone).
 */
export function ReadingMenu({ at, mobile, onClose, settings, onChange, extra }: { at: DOMRect | null; mobile: boolean; onClose: () => void; settings: Settings; onChange: (p: Partial<Settings>) => void; extra?: ReactNode }) {
  const layout = layoutOf(settings);
  const instant = byKeys();
  useEffect(() => {
    if (!at) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [at, onClose]);
  const body = (
    <>
      <div className="text-[13px] text-[var(--box-muted)]">Layout</div>
      <div className="mt-2">
        <Segments name="Layout" value={layout} options={LAYOUTS} onPick={(l) => onChange(patchFor(settings, { layout: l }))} wide />
      </div>
      <div className="mt-4 text-[13px] text-[var(--box-muted)]">Show</div>
      <div className="mt-2">
        <Segments name="Show" value={settings.readingMode} options={SHOWS} onPick={(show) => onChange(patchFor(settings, { show }))} wide />
      </div>
      {layout === "book" && (
        <div className="mt-4 rounded-[20px] bg-[var(--surface)] px-4 py-1.5">
          {settings.readingMode === "arabic" ? (
            <SheetSwitch label="Lines as the printed mushaf" on={settings.bookLines} onClick={() => onChange({ bookLines: !settings.bookLines })} />
          ) : (
            <SheetSwitch label="Theme headings" on={settings.bookThemes} onClick={() => onChange({ bookThemes: !settings.bookThemes })} />
          )}
        </div>
      )}
      {extra}
    </>
  );
  if (!mobile) {
    const W = 380;
    const left = at ? Math.max(12, Math.min(window.innerWidth - W - 12, at.right - W)) : 0;
    return (
      <AnimatePresence>
        {at && (
          <>
            <div className="fixed inset-0 z-[79]" onPointerDown={onClose} aria-hidden />
            <motion.div
              role="dialog"
              aria-label="Ways to read"
              className="fixed z-[80] rounded-[26px] bg-[var(--box-bg-solid)] p-4 text-[var(--box-fg)] shadow-[var(--pop-shadow)]"
              style={{ left, top: at.bottom + 10, width: W, transformOrigin: `${at.left + at.width / 2 - left}px -10px` }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: instant ? 0 : 0.12 } }}
              transition={{ duration: instant ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
            >
              {body}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }
  return (
    <AnimatePresence>
      {at && (
        <motion.div key="reading" className="fixed inset-0 z-[80] flex items-end" initial={{ opacity: 1 }} exit={{ opacity: 1, transition: { duration: 0.25 } }}>
          <motion.button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div
            role="dialog"
            aria-label="Ways to read"
            className="relative w-full rounded-t-[30px] bg-[var(--box-bg-solid)] px-5 pb-[calc(22px+env(safe-area-inset-bottom))] pt-3 text-[var(--box-fg)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: instant ? 0 : 0.32, ease: [0.32, 0.72, 0, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.6 }}
            onDragEnd={(_, i) => (i.offset.y > 80 || i.velocity.y > 400) && onClose()}
          >
            <span className="mx-auto mb-4 block h-1.5 w-10 rounded-full bg-[var(--box-line)]" aria-hidden />
            <h2 className="mb-4 text-[20px] font-semibold tracking-[-0.015em]">Ways to read</h2>
            {body}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The book's own switch, beside the choices (a computer's top bar). Its place is kept when there is
 *  no book, so the choices beside it never shift as it comes and goes. */
export function BookSwitch({ settings, onChange }: { settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  const book = layoutOf(settings) === "book";
  const arabic = settings.readingMode !== "translation";
  const on = arabic ? settings.bookLines : settings.bookThemes;
  return (
    <button
      type="button"
      onClick={() => onChange(arabic ? { bookLines: !on } : { bookThemes: !on })}
      aria-pressed={on}
      aria-hidden={!book || undefined}
      tabIndex={book ? undefined : -1}
      className={cn("chip h-11 w-[124px] justify-center transition-opacity duration-150", on && "is-on", !book && "pointer-events-none opacity-0")}
      title={arabic ? "Lines as the printed mushaf" : "Theme headings"}
    >
      {arabic ? "Printed lines" : "Headings"}
    </button>
  );
}
