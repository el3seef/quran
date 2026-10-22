import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { seerahSfx } from "@/lib/sound";
import { cn } from "@/lib/utils";
import type { Slide } from "./data";
import { MOODS, moodOf } from "./moods";

/** The Seerah's stretches of time, for finding one's way at a glance. */
const ERAS = [
  { id: "before", name: "Before", span: "Before 570", to: 570.5 },
  { id: "early", name: "Forty years", span: "570 – 610", to: 610.55 },
  { id: "makkah", name: "Makkah", span: "610 – 622", to: 622.7 },
  { id: "madinah", name: "Madinah", span: "622 – 632", to: 632.6 },
  { id: "after", name: "Legacy", span: "His household, his character", to: Infinity },
];
const eraOf = (y: number) => ERAS.findIndex((e) => y < e.to);
const yearOf = (sl: Slide) => (sl.kind === "section" ? sl.s.y : (sl.part.sections[0]?.y ?? 0));

/**
 * The timeline, simple: the Seerah's five stretches along the foot of the screen, the one being read
 * lit and filling as the reader goes; a touch on one goes to its beginning. Opened, the years are laid
 * out across the whole screen, each with what happened in it, to go to any of them.
 */
export function TimeBar({ slides, at, onGo, onOpen }: { slides: Slide[]; at: number; onGo: (i: number) => void; onOpen: () => void }) {
  const eras = useMemo(
    () =>
      ERAS.map((e, ei) => {
        const idx = slides.map((sl, i) => ({ sl, i })).filter(({ sl }) => eraOf(yearOf(sl)) === ei).map(({ i }) => i);
        return { ...e, first: idx[0], count: idx.length, idx };
      }),
    [slides],
  );
  const cur = slides[at] ? eraOf(yearOf(slides[at])) : 0;
  return (
    <div className="s-time">
      <div className="s-eras" role="navigation" aria-label="The Seerah's stretches of time">
        {eras.map((e, ei) => {
          const fill = ei < cur ? 1 : ei > cur ? 0 : e.count ? (e.idx.indexOf(at) + 1) / e.count : 0;
          return (
            <button
              key={e.id}
              type="button"
              disabled={!e.count}
              onClick={() => e.first !== undefined && onGo(e.first)}
              onPointerEnter={() => e.count && seerahSfx("tick")}
              className={cn("s-era", ei === cur && "is-on", !e.count && "opacity-40")}
              style={{ flex: e.count ? 1 + Math.min(1.4, e.count / 40) : 0.7 }}
              title={e.count ? `${e.name}: ${e.count} sections` : `${e.name}: still to come`}
            >
              <span className="s-era-name">{e.name}</span>
              <span className="s-era-span">{e.span}</span>
              <span className="s-era-track">
                <motion.span className="s-era-fill" animate={{ width: `${fill * 100}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" className="s-iconbtn mb-[6px]" onClick={onOpen} title="The whole timeline (T)" aria-label="Open the whole timeline">
        <Maximize2 size={14} strokeWidth={1.6} />
        <span className="s-label max-md:hidden">Timeline</span>
      </button>
    </div>
  );
}

export function Years({ open, slides, at, onGo, onClose }: { open: boolean; slides: Slide[]; at: number; onGo: (i: number) => void; onClose: () => void }) {
  // the columns: before his birth, one for each part; then a column for each year in which something happened
  const cols = useMemo(() => {
    const out: { key: string; era: number; title: string; sub: string; items: { sl: Slide; i: number }[] }[] = [];
    slides.forEach((sl, i) => {
      if (sl.kind !== "section") return;
      const y = sl.s.y, era = eraOf(y);
      const key = era === 0 ? `p-${sl.part.id}` : era === 4 ? "after" : String(Math.floor(y));
      let col = out.find((c) => c.key === key);
      if (!col) {
        col =
          era === 0 ? { key, era, title: "—", sub: sl.part.title, items: [] }
          : era === 4 ? { key, era, title: "∞", sub: "His household, his character", items: [] }
          : { key, era, title: String(Math.floor(y)), sub: y >= 622.7 ? `${Math.floor(y) - 622 + (y % 1 > 0.7 ? 1 : 0)} AH` : y >= 610.55 ? `Year ${Math.max(1, Math.floor(y - 610.55) + 1)} of the Message` : y < 571 ? "Before his birth" : `His age ${Math.max(0, Math.floor(y - 571))}`, items: [] };
        out.push(col);
      }
      col.items.push({ sl, i });
    });
    return out;
  }, [slides]);
  const strip = useRef<HTMLDivElement>(null);
  // opened: the year being read in the middle
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => strip.current?.querySelector<HTMLElement>(".s-year.is-on")?.scrollIntoView({ inline: "center", behavior: "instant" as ScrollBehavior }), 30);
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", key);
    };
  }, [open, onClose]);
  // the wheel moves it across; a hand drags it
  useEffect(() => {
    const el = strip.current;
    if (!el || !open) return;
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !(e.target as HTMLElement).closest(".s-year-events")) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    let drag: { x: number; left: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      drag = { x: e.clientX, left: el.scrollLeft, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) > 4) drag.moved = true;
      el.scrollLeft = drag.left - (e.clientX - drag.x);
    };
    const up = (e: PointerEvent) => {
      if (drag?.moved) {
        // (a drag is not a click on what it ended over)
        const stop = (ev: Event) => (ev.stopPropagation(), ev.preventDefault());
        window.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
      }
      drag = null;
      void e;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [open]);
  const curEra = slides[at] ? eraOf(yearOf(slides[at])) : 0;
  const toEra = (ei: number) => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-era="${ei}"]`);
    if (el && strip.current) strip.current.scrollTo({ left: el.offsetLeft - 20, behavior: "smooth" });
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="s-years" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} role="dialog" aria-label="The timeline">
          <div className="s-years-head">
            <div className="flex items-baseline gap-4">
              <span style={{ fontFamily: "Aref Ruqaa, serif", fontSize: 30, color: "#e2b25f", lineHeight: 1 }}>السيرة</span>
              <span className="s-label" style={{ color: "rgba(239,230,214,0.5)" }}>
                The timeline
              </span>
            </div>
            <div className="s-years-eras">
              {ERAS.map((e, ei) => (
                <button key={e.id} type="button" className={cn(ei === curEra && "is-on")} onClick={() => toEra(ei)} disabled={!cols.some((c) => c.era === ei)} style={{ opacity: cols.some((c) => c.era === ei) ? 1 : 0.35 }}>
                  {e.name}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} aria-label="Close the timeline" className="flex h-10 w-10 items-center justify-center text-[#efe6d6]/60 hover:text-[#efe6d6]">
              <X size={18} />
            </button>
          </div>
          <div ref={strip} className="s-years-strip">
            {cols.map((c, ci) => (
              <motion.div
                key={c.key}
                data-era={cols.findIndex((x) => x.era === c.era) === ci ? c.era : undefined}
                className={cn("s-year", c.items.some((x) => x.i === at) && "is-on")}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(0.6, ci * 0.03), duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="s-year-n">{c.title}</div>
                <div className="s-year-sub">{c.sub}</div>
                <div className="s-year-events">
                  {c.items.map(({ sl, i }) => (
                    <button
                      key={sl.id}
                      type="button"
                      className={cn("s-event", i === at && "is-on")}
                      onClick={() => {
                        onGo(i);
                        onClose();
                      }}
                      onPointerEnter={() => seerahSfx("tick")}
                    >
                      <b>
                        <i style={{ background: MOODS[moodOf(sl)].accent }} />
                        {sl.kind === "section" ? sl.s.title : ""}
                      </b>
                      {sl.kind === "section" && sl.s.when && <span>{sl.s.when}</span>}
                    </button>
                  ))}
                </div>
              </motion.div>
            ))}
            <div className="s-year flex items-center justify-center" style={{ width: 360 }}>
              <span className="s-label text-center" style={{ color: "rgba(239,230,214,0.4)" }}>
                Madinah and beyond: still being written
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
