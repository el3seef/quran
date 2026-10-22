import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, LoaderCircle, PanelRightOpen, Play, Square, X } from "lucide-react";
import { arabicText, loadSurah, translationText, type SurahData } from "@/lib/data";
import { playAyahs, useAyahAudio } from "@/lib/ayahAudio";
import { useStore } from "@/lib/store";

/**
 * An ayah the Seerah speaks of, opened from its mark in the words: its Arabic and its meaning, to hear
 * in Mishary Alafasy's voice (that ayah alone), to bring up beside the page, or to read in the Qur'an.
 */
export function AyahCard({ open, onClose, onBeside, onQuran }: { open: { ref: string; rect: DOMRect } | null; onClose: () => void; onBeside: (s: number, a: number) => void; onQuran: (s: number, a: number) => void }) {
  const [data, setData] = useState<SurahData | null>(null);
  const settings = useStore((s) => s.settings);
  const m = open?.ref.match(/^(\d+):(\d+)(?:-(\d+))?$/);
  const s = m ? +m[1] : 0, a = m ? +m[2] : 0, to = m?.[3] ? +m[3] : a;
  useEffect(() => {
    if (!s) return;
    setData(null);
    let alive = true;
    loadSurah(s).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [s]);
  const key = `${s}:${a}-${to}`;
  const playing = useAyahAudio((p) => p.key === key);
  const loading = useAyahAudio((p) => p.key === key && p.loading);
  const at = useAyahAudio((p) => (p.key === key ? p.at : 0));

  // placed under its mark, or over it where there is no room below; always whole on the screen
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = open.rect, w = box.current.offsetWidth, h = box.current.offsetHeight;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 10 + h < window.innerHeight - 12;
    setPos({ left, top: below ? r.bottom + 10 : Math.max(12, r.top - h - 10) });
  }, [open, data]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".s-ref") && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [open, onClose]);

  const verses = data ? data.v.slice(a - 1, Math.min(to, a + 5)) : [];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={box}
          key={open.ref}
          role="dialog"
          aria-label={`The Qur'an, ${open.ref}`}
          className="s-ayah"
          style={pos}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-[var(--mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#8a2a1d]" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
              Qur'an {open.ref}
            </span>
            <button type="button" onClick={onClose} aria-label="Close" className="flex h-7 w-7 items-center justify-center text-black/50 hover:text-black">
              <X size={14} />
            </button>
          </div>
          <div className="mt-2 max-h-[46vh] overflow-y-auto pr-1">
            {!data && <div className="py-6 text-center text-black/40">…</div>}
            {verses.map((v) => (
              <div key={v.n} className={playing && at === v.n ? "rounded-sm bg-[#8a2a1d]/[0.07] px-1" : "px-1"}>
                <p className="s-ayah-ar" dir="rtl" lang="ar">
                  {arabicText(v, settings.script)} <span className="text-[16px] text-black/40">﴿{v.n}﴾</span>
                </p>
                <p className="s-ayah-tr">{translationText(v, settings.translation, settings.showContext)}</p>
              </div>
            ))}
            {to > a + 5 && <p className="mt-2 text-[13px] italic text-black/50">…and on to {s}:{to}</p>}
          </div>
          <div className="s-ayah-bar">
            <button type="button" className="is-play" onClick={() => playAyahs(s, a, to, key)} aria-label={playing ? "Stop" : "Listen, recited by Mishary Alafasy"}>
              {loading ? <LoaderCircle size={12} className="animate-spin" /> : playing ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              {playing ? "Stop" : "Listen"}
            </button>
            <button type="button" onClick={() => onBeside(s, a)} title="Bring it up beside the page">
              <PanelRightOpen size={12} />
              Beside
            </button>
            <button type="button" onClick={() => onQuran(s, a)} title="Read it in the Qur'an">
              <ArrowUpRight size={12} />
              Qur'an
            </button>
            <span className="ml-auto text-[10px] text-black/40" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
              Alafasy
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
