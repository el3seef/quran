import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import { arabicText, loadIndex, loadSurah, translationText, type Surah, type SurahData } from "@/lib/data";
import { useStore, type AyahWindow } from "@/lib/store";
import { searchDirect, type Result } from "@/lib/search";
import { sfx } from "@/lib/sound";
import { EASE_OUT, cn } from "@/lib/utils";
import { nameMarks } from "@/lib/names";

/**
 * Ayahs brought up beside the page: another ayah, from anywhere in the Qur'an, opened in a small
 * window over the frame while the reader stays where they are. Each belongs to the ayah the reader
 * was on, and shows whenever that ayah does (as its notes do). It is a thing to hold: picked up, it
 * follows the hand, leans as it moves, and a throw carries it on until it comes to rest. Its knot at
 * the top can be drawn out into a thread and tied to an ayah, or to one word of it; the thread then
 * hangs between them, swaying as either moves. A note can be written in it, and a sticky note laid
 * on it travels with it. From it, the reader can go to the ayah itself, and come back (Read).
 */

// where each window is, as it moves (its notes follow it: Overlays.NoteCard)
export const windowPlace = new Map<string, { L: MotionValue<number>; T: MotionValue<number> }>();
const WIN_W = () => Math.min(340, window.innerWidth - 32);

/* ── the windows, and the threads between them and what they are tied to ── */

export function AyahWindows({ windows, onJump }: { windows: AyahWindow[]; onJump: (w: AyahWindow) => void }) {
  return (
    <>
      <Threads windows={windows} />
      <div className="pointer-events-none fixed inset-0 z-[64] overflow-hidden">
        <AnimatePresence>
          {windows.map((w) => (
            <WindowCard key={w.id} win={w} onJump={() => onJump(w)} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

function WindowCard({ win, onJump }: { win: AyahWindow; onJump: () => void }) {
  const update = useStore((s) => s.updateWindow);
  const remove = useStore((s) => s.removeWindow);
  const settings = useStore((s) => s.settings);
  const [data, setData] = useState<{ surah: Surah; d: SurahData } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([loadIndex(), loadSurah(win.s)]).then(([i, d]) => alive && setData({ surah: i.surahs[win.s - 1], d })).catch(() => {});
    return () => {
      alive = false;
    };
  }, [win.s]);
  const v = data?.d.v[win.a - 1];

  const ref = useRef<HTMLDivElement>(null);
  // (the screen changing size, a phone turned: kept whole on it)
  const [size, setSize] = useState(0);
  useEffect(() => {
    const on = () => setSize((n) => n + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const w = WIN_W();
  const at = () => ({ left: Math.min(window.innerWidth - w - 8, Math.max(8, win.x * window.innerWidth)), top: Math.min(window.innerHeight - 120, Math.max(8, win.y * window.innerHeight)) });
  const L = useMotionValue(at().left);
  const T = useMotionValue(at().top);
  const tilt = useMotionValue(0);
  useLayoutEffect(() => {
    windowPlace.set(win.id, { L, T });
    return () => void windowPlace.delete(win.id);
  }, [win.id, L, T]);
  // (a new place from elsewhere, or a window resized: it goes there)
  useEffect(() => {
    const p = at();
    const a = animate(L, p.left, { type: "spring", stiffness: 240, damping: 30 });
    const b = animate(T, p.top, { type: "spring", stiffness: 240, damping: 30 });
    return () => {
      a.stop();
      b.stop();
    };
  }, [win.x, win.y, size]); // eslint-disable-line react-hooks/exhaustive-deps

  // picked up: it follows the hand, leaning with its speed; let go, it is carried on and comes to rest
  const grab = useRef<{ id: number; x: number; y: number; l: number; t: number; vx: number; vy: number; lx: number; ly: number; lt: number; moved: boolean } | null>(null);
  const [held, setHeld] = useState(false);
  const down = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("button, textarea, input, [data-nodrag]") || (e.pointerType === "mouse" && e.button !== 0)) return;
    L.stop();
    T.stop();
    grab.current = { id: e.pointerId, x: e.clientX, y: e.clientY, l: L.get(), t: T.get(), vx: 0, vy: 0, lx: e.clientX, ly: e.clientY, lt: performance.now(), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return;
    if (!g.moved) {
      g.moved = true;
      setHeld(true);
      sfx("lift");
    }
    const now = performance.now(), dt = Math.max(1, now - g.lt);
    g.vx = 0.7 * g.vx + 0.3 * ((e.clientX - g.lx) / dt);
    g.vy = 0.7 * g.vy + 0.3 * ((e.clientY - g.ly) / dt);
    g.lx = e.clientX;
    g.ly = e.clientY;
    g.lt = now;
    L.set(g.l + e.clientX - g.x);
    T.set(g.t + e.clientY - g.y);
    tilt.set(Math.max(-4, Math.min(4, g.vx * 2.5)));
  };
  const up = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    grab.current = null;
    if (!g.moved) return;
    setHeld(false);
    // (upright again, without swinging past)
    animate(tilt, 0, { type: "spring", stiffness: 260, damping: 34 });
    // (held still before it was let go: not thrown; a hand's quickest, no more)
    if (performance.now() - g.lt > 80) g.vx = g.vy = 0;
    const speed = Math.hypot(g.vx, g.vy), most = 2.4;
    if (speed > most) (g.vx *= most / speed), (g.vy *= most / speed);
    const vw = window.innerWidth, vh = window.innerHeight, h = ref.current?.offsetHeight ?? 200;
    const reduce = useStore.getState().settings.reduceMotion;
    const land = () => {
      sfx("drop");
      update(win.id, { x: L.get() / vw, y: T.get() / vh });
    };
    if (reduce || Math.hypot(g.vx, g.vy) < 0.15) return land();
    // thrown: carried on by its speed, slowing, kept inside the screen
    let done = 0;
    const end = () => ++done === 2 && land();
    // (at the screen's edge it stops there, softly, no bounce)
    animate(L, L.get(), { type: "inertia", velocity: g.vx * 1000, power: 0.22, timeConstant: 240, min: 8, max: vw - w - 8, bounceStiffness: 300, bounceDamping: 40, onComplete: end });
    animate(T, T.get(), { type: "inertia", velocity: g.vy * 1000, power: 0.22, timeConstant: 240, min: 8, max: vh - Math.min(h, 160), bounceStiffness: 300, bounceDamping: 40, onComplete: end });
  };

  // its own note, written in it
  const [note, setNote] = useState(win.note ?? "");
  useEffect(() => {
    if (note === (win.note ?? "")) return;
    const t = setTimeout(() => update(win.id, { note }), 350);
    return () => clearTimeout(t);
  }, [note, win.id, win.note, update]);

  const tied = !!win.tie;
  return (
    <motion.div
      ref={ref}
      data-ayah-window={win.id}
      role="dialog"
      aria-label={`Ayah ${win.s}:${win.a}, brought up beside ${win.key}`}
      className="pointer-events-auto absolute left-0 top-0 select-none"
      style={{ left: L, top: T, width: w, rotate: tilt }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      initial={{ opacity: 0, scale: 0.86, y: 14 }}
      animate={{ opacity: 1, scale: held ? 1.025 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 8, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
    >
      {/* (brought up beside the Seerah: no thread to tie, nothing in the page to tie it to) */}
      {!win.key.startsWith("seerah:") && <Knot win={win} />}
      <div
        className={cn(
          "theme-pop flex cursor-grab flex-col border border-[var(--box-line)] bg-[var(--box-bg-solid)] text-[var(--box-fg)] active:cursor-grabbing",
          held ? "shadow-[0_40px_80px_-24px_rgba(0,0,0,0.85)]" : "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)]",
        )}
      >
        <div className="flex touch-none items-center justify-between gap-2 border-b border-[var(--box-line)] py-1.5 pl-3.5 pr-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="label shrink-0 tabular-nums text-[var(--box-muted)]">
              {win.s}:{win.a}
            </span>
            <span className="display truncate font-serif text-[15px] italic leading-tight">{data ? nameMarks(data.surah.tc) : ""}</span>
          </div>
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={onJump} title="Go to this ayah" aria-label="Go to this ayah" className="flex h-8 w-8 items-center justify-center text-[var(--box-muted)] hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)]">
              <ArrowUpRight size={15} strokeWidth={1.6} />
            </button>
            <button type="button" onClick={() => remove(win.id)} title="Put it away" aria-label="Close" className="flex h-8 w-8 items-center justify-center text-[var(--box-muted)] hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)]">
              <X size={15} strokeWidth={1.6} />
            </button>
          </div>
        </div>
        <div className="thin-scroll max-h-[38vh] touch-pan-y overflow-y-auto overscroll-contain px-3.5 py-3" data-nodrag>
          {v ? (
            <>
              <p className={cn("quran text-right leading-[2] text-[var(--box-fg)]", settings.script === "indopak" && "indopak")} style={{ fontSize: v.a.length > 40 ? 19 : 22 }} dir="rtl" lang="ar">
                {arabicText(v, settings.script)}
              </p>
              <p className="mt-2 font-serif text-[14.5px] leading-relaxed text-[var(--box-fg)]" dir="ltr">
                {translationText(v, settings.translation, settings.showContext)}
              </p>
            </>
          ) : (
            <div className="label py-3 text-center text-[var(--box-faint)]">Opening {win.s}:{win.a}</div>
          )}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (win.note ?? "") && update(win.id, { note })}
          placeholder="Write a note…"
          aria-label={`Your note on ${win.s}:${win.a}`}
          rows={note ? Math.min(5, note.split("\n").length + 1) : 1}
          className="no-scrollbar w-full resize-none border-t border-[var(--box-line)] bg-transparent px-3.5 py-2 font-hand text-[19px] leading-[24px] text-[var(--box-fg)] outline-none placeholder:text-[var(--box-faint)]"
          dir="auto"
        />
      </div>
      {tied && <span className="sr-only">Tied to {win.key}</span>}
    </motion.div>
  );
}

/**
 * The knot at the top of a window: drawn out, it becomes a thread to tie to an ayah or a word (let go
 * on it); tapped, a loose window is tied to its own ayah, and a tied one let loose.
 */
function Knot({ win }: { win: AyahWindow }) {
  const update = useStore((s) => s.updateWindow);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const tied = !!win.tie;
  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    threadHand = { id: win.id, x: e.clientX, y: e.clientY };
    wake();
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    threadHand = null;
    wake();
    if (!d.moved) {
      // a tap: tied to its own ayah, or let loose
      update(win.id, { tie: tied ? null : { field: "ayah" } });
      sfx(tied ? "off" : "on");
      return;
    }
    const tie = tieAt(e.clientX, e.clientY);
    if (tie) {
      update(win.id, { key: tie.key, tie: tie.tie });
      sfx("drop");
    }
  };
  return (
    <button
      type="button"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => e.preventDefault()}
      data-sfx="none"
      title={tied ? "Tied by a thread: tap to let it loose, or draw it elsewhere" : "Draw a thread from here to a word, or to any spot in the surah's box"}
      aria-label={tied ? "Let the thread loose" : "Tie it to the ayah by a thread"}
      className="group absolute -top-[9px] left-1/2 z-[1] flex h-[18px] w-[18px] -translate-x-1/2 touch-none items-center justify-center"
    >
      <span className={cn("block h-[9px] w-[9px] rounded-full border transition-all duration-300 group-hover:scale-125", tied ? "border-[var(--box-accent)] bg-[var(--box-accent)]" : "border-[var(--box-muted)] bg-[var(--box-bg-solid)]")} />
    </button>
  );
}

/**
 * What the hand lets go on: a word of an ayah (Arabic or translation), on it or close by it; else a
 * spot, anywhere inside the surah's box, kept as where it is in the ayah's own box (or, read as a book,
 * in the book's), so it stays put as the page scrolls and as the box changes its shape. Off the box:
 * nothing (the thread is let go).
 */
function tieAt(x: number, y: number): { key: string; tie: NonNullable<AyahWindow["tie"]> } | null {
  const word = (px: number, py: number) => {
    for (const el of document.elementsFromPoint(px, py) as HTMLElement[]) {
      if (el.closest("[data-ayah-window], [data-note-card], [data-ayah-tools]")) continue;
      const field = el.closest<HTMLElement>("[data-field][data-key]");
      const w = el.closest<HTMLElement>(".word[data-w]");
      if (w && field?.dataset.field === "ar") return { key: field.dataset.key!, tie: { field: "ar" as const, w: Number(w.dataset.w) } };
      const tw = el.closest<HTMLElement>(".tw[data-o]");
      if (tw && field) return { key: field.dataset.key!, tie: { field: "tr" as const, w: Number(tw.dataset.o) } };
    }
    return null;
  };
  // on a word, or within a finger's width of one (looked for in rings about the hand, nearest first)
  const on = word(x, y);
  if (on) return on;
  for (const r of [7, 14])
    for (let k = 0; k < 8; k++) {
      const near = word(x + r * Math.cos((k * Math.PI) / 4), y + r * Math.sin((k * Math.PI) / 4));
      if (near) return near;
    }
  // a spot in the box
  const sc = document.querySelector<HTMLElement>(".snap-scroller");
  const frame = sc?.getBoundingClientRect();
  if (!sc || !frame || x < frame.left || x > frame.right || y < frame.top || y > frame.bottom) return null;
  const book = sc.querySelector<HTMLElement>(".book");
  if (book) {
    const b = book.getBoundingClientRect();
    // (the ayah it belongs to: the nearest of the book's)
    let best: { key: string; d: number } | null = null;
    for (const el of book.querySelectorAll<HTMLElement>("[data-key]")) {
      for (const r of el.getClientRects()) {
        const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
        if (!best || d < best.d) best = { key: el.dataset.key!, d };
      }
    }
    if (!best || !b.width || !b.height) return null;
    return { key: best.key, tie: { field: "spot", fx: (x - b.left) / b.width, fy: (y - b.top) / b.height, book: true } };
  }
  // (the ayah whose box it is in, or the nearest)
  let best: { el: HTMLElement; d: number } | null = null;
  for (const el of sc.querySelectorAll<HTMLElement>("section[data-key]")) {
    const r = el.getBoundingClientRect();
    if (r.bottom < frame.top - 400 || r.top > frame.bottom + 400) continue;
    const d = Math.max(r.top - y, 0, y - r.bottom);
    if (!best || d < best.d) best = { el, d };
  }
  if (!best) return null;
  const r = best.el.getBoundingClientRect();
  return { key: best.el.dataset.key!, tie: { field: "spot", fx: (x - r.left) / r.width, fy: (y - r.top) / r.height } };
}

/* ── the threads: each a hanging string of points (pinned at the window's knot and at what it is tied
   to), pulled down a little by its weight, kept to its length, swaying as either end moves ── */

let threadHand: { id: string; x: number; y: number } | null = null; // a thread being drawn out by hand
let wake = () => {};

function targetOf(w: AyahWindow, from: { x: number; y: number }): { x: number; y: number } | null {
  if (!w.tie) return null;
  const sc = document.querySelector<HTMLElement>(".snap-scroller");
  const frame = sc?.getBoundingClientRect();
  let el: HTMLElement | null = null;
  // a spot: where it was let go, in the ayah's box (or the book's) as that box is now
  if (w.tie.field === "spot") {
    const box = w.tie.book ? sc?.querySelector<HTMLElement>(".book") : sc?.querySelector<HTMLElement>(`section[data-key="${w.key}"]`);
    if (!box || !frame) return null;
    const r = box.getBoundingClientRect();
    const p = { x: r.left + w.tie.fx * r.width, y: r.top + w.tie.fy * r.height };
    return p.x >= frame.left && p.x <= frame.right && p.y >= frame.top && p.y <= frame.bottom ? p : null;
  }
  if (w.tie.field === "ar") el = document.querySelector(`[data-field="ar"][data-key="${w.key}"] .word[data-w="${w.tie.w}"]`);
  else if (w.tie.field === "tr") el = document.querySelector(`[data-field][data-key="${w.key}"] .tw[data-o="${w.tie.w}"]`);
  // an ayah: hung from its number (or, where none shows, its first word)
  el ??= document.querySelector(`[data-ayah-mark="${w.key}"]`) ?? document.querySelector(`[data-field][data-key="${w.key}"] :is(.word, .tw)`);
  if (!el || !frame) return null;
  const r = el.getBoundingClientRect();
  // only what can be seen of it: within the frame
  const top = Math.max(r.top, frame.top), bottom = Math.min(r.bottom, frame.bottom), left = Math.max(r.left, frame.left), right = Math.min(r.right, frame.right);
  if (top >= bottom || left >= right) return null;
  return { x: (left + right) / 2, y: Math.abs(from.y - top) < Math.abs(from.y - bottom) ? top + 1 : bottom - 1 };
}

type Pt = { x: number; y: number; px: number; py: number };
const N = 16;

function Threads({ windows }: { windows: AyahWindow[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const ends = useRef<HTMLDivElement>(null);
  const list = useRef(windows);
  list.current = windows;
  const tiedIds = useMemo(() => windows.filter((w) => w.tie).map((w) => w.id).join(","), [windows]);
  useEffect(() => {
    const ropes = new Map<string, { pts: Pt[]; len: number; path: SVGPathElement; end: HTMLElement }>();
    let raf = 0;
    let quiet = 0;
    // the thread's far end, held: drawn to another word or ayah and let go there, it is tied there;
    // let go on nothing, the thread is untied
    const holdEnd = (id: string, end: HTMLElement) => {
      let held = false;
      end.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        held = true;
        end.setPointerCapture(e.pointerId);
        threadHand = { id, x: e.clientX, y: e.clientY };
        sfx("lift");
        wake();
      });
      end.addEventListener("pointermove", (e) => {
        if (!held) return;
        threadHand = { id, x: e.clientX, y: e.clientY };
        wake();
      });
      const drop = (e: PointerEvent) => {
        if (!held) return;
        held = false;
        threadHand = null;
        const tie = tieAt(e.clientX, e.clientY);
        useStore.getState().updateWindow(id, tie ? { key: tie.key, tie: tie.tie } : { tie: null });
        sfx(tie ? "drop" : "off");
        wake();
      };
      end.addEventListener("pointerup", drop);
      end.addEventListener("pointercancel", drop);
    };
    const tick = () => {
      raf = 0;
      const host = svg.current, hold = ends.current;
      if (!host || !hold) return;
      let moving = false;
      const live = new Set<string>();
      for (const w of list.current) {
        const place = windowPlace.get(w.id);
        const card = document.querySelector<HTMLElement>(`[data-ayah-window="${w.id}"]`);
        const drawing = threadHand?.id === w.id;
        if (!place || !card || (!w.tie && !drawing)) continue;
        const a = { x: place.L.get() + card.offsetWidth / 2, y: place.T.get() };
        const b = drawing ? { x: threadHand!.x, y: threadHand!.y } : targetOf(w, a);
        if (!b) continue;
        live.add(w.id);
        let r = ropes.get(w.id);
        if (!r) {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("fill", "none");
          path.setAttribute("stroke-linecap", "round");
          path.classList.add("thread-line");
          host.append(path);
          const end = document.createElement("span");
          end.className = "thread-end";
          end.title = "Draw the thread to another word or spot, or out of the box to untie it";
          hold.append(end);
          holdEnd(w.id, end);
          const pts = Array.from({ length: N }, (_, i) => {
            const x = a.x + ((b.x - a.x) * i) / (N - 1), y = a.y + ((b.y - a.y) * i) / (N - 1);
            return { x, y, px: x, py: y };
          });
          r = { pts, len: Math.hypot(b.x - a.x, b.y - a.y), path, end };
          ropes.set(w.id, r);
        }
        // its length: all but taut, a breath of slack over the distance, following it closely
        const want = Math.max(20, Math.hypot(b.x - a.x, b.y - a.y) * 1.03);
        r.len += (want - r.len) * 0.25;
        const seg = r.len / (N - 1);
        const p = r.pts;
        let energy = 0;
        for (let i = 1; i < N - 1; i++) {
          const q = p[i];
          const vx = (q.x - q.px) * 0.84, vy = (q.y - q.py) * 0.84;
          q.px = q.x;
          q.py = q.y;
          q.x += vx;
          q.y += vy + 0.2;
          energy += Math.abs(vx) + Math.abs(vy);
        }
        p[0].x = a.x;
        p[0].y = a.y;
        p[N - 1].x = b.x;
        p[N - 1].y = b.y;
        for (let k = 0; k < 20; k++) {
          for (let i = 0; i < N - 1; i++) {
            const m = p[i], n = p[i + 1];
            const dx = n.x - m.x, dy = n.y - m.y, d = Math.hypot(dx, dy) || 0.001;
            const diff = (d - seg) / d;
            const fm = i === 0 ? 0 : i + 1 === N - 1 ? 1 : 0.5, fn = i === 0 ? 1 : i + 1 === N - 1 ? 0 : 0.5;
            m.x += dx * diff * fm;
            m.y += dy * diff * fm;
            n.x -= dx * diff * fn;
            n.y -= dy * diff * fn;
          }
        }
        let d = `M${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}`;
        for (let i = 1; i < N - 1; i++) d += ` Q${p[i].x.toFixed(1)} ${p[i].y.toFixed(1)} ${((p[i].x + p[i + 1].x) / 2).toFixed(1)} ${((p[i].y + p[i + 1].y) / 2).toFixed(1)}`;
        d += ` L${p[N - 1].x.toFixed(1)} ${p[N - 1].y.toFixed(1)}`;
        r.path.setAttribute("d", d);
        r.path.style.opacity = drawing ? "0.7" : "1";
        r.end.style.transform = `translate(${(b.x - 11).toFixed(1)}px, ${(b.y - 11).toFixed(1)}px)`;
        r.end.classList.toggle("is-held", drawing);
        if (energy > 0.2 || drawing) moving = true;
      }
      for (const [id, r] of ropes)
        if (!live.has(id)) {
          r.path.remove();
          r.end.remove();
          ropes.delete(id);
        }
      // at rest a while: it sleeps until something moves again
      quiet = moving ? 0 : quiet + 1;
      if (ropes.size && quiet < 30) raf = requestAnimationFrame(tick);
    };
    wake = () => {
      quiet = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    wake();
    // the page scrolled (the ends move), a window moved or resized, a hand on the screen
    const on = () => wake();
    window.addEventListener("scroll", on, true);
    window.addEventListener("pointermove", on, { passive: true });
    window.addEventListener("resize", on);
    const unsub = [...windowPlace.values()].flatMap(({ L, T }) => [L.on("change", on), T.on("change", on)]);
    return () => {
      cancelAnimationFrame(raf);
      wake = () => {};
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("pointermove", on);
      window.removeEventListener("resize", on);
      unsub.forEach((u) => u());
      for (const r of ropes.values()) {
        r.path.remove();
        r.end.remove();
      }
    };
  }, [tiedIds, windows.length]);
  return (
    <>
      <svg ref={svg} className="pointer-events-none fixed inset-0 z-[63] h-full w-full overflow-visible" aria-hidden />
      {/* (the threads' far ends, to take hold of: above the page, the windows and the notes) */}
      <div ref={ends} className="pointer-events-none fixed inset-0 z-[66]" />
    </>
  );
}

/* ── choosing the ayah to bring up: a reference, a surah and a number, the way one would say it ── */

export function BringUp({ at, surahs, juz, onPick, onClose }: { at: { x: number; y: number } | null; surahs: Surah[]; juz: Record<string, string>; onPick: (s: number, a: number) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    setQ("");
    setI(0);
    const t = setTimeout(() => input.current?.focus(), 60);
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    window.addEventListener("pointerdown", down, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", down, true);
    };
  }, [at, onClose]);
  // an ayah, or a surah (its first ayah)
  const found = useMemo(() => {
    if (!q.trim()) return [] as { s: number; a: number; label: string; name: string }[];
    return searchDirect(surahs, juz, q)
      .filter((r): r is Extract<Result, { kind: "ayah" | "surah" }> => r.kind === "ayah" || r.kind === "surah")
      .slice(0, 6)
      .map((r) => ({ s: r.surah.n, a: r.kind === "ayah" ? r.ayah : 1, label: r.kind === "ayah" ? `${r.surah.n}:${r.ayah}` : `${r.surah.n}:1`, name: r.surah.tc }));
  }, [q, surahs, juz]);
  const W = Math.min(320, window.innerWidth - 24);
  const left = at ? Math.max(12, Math.min(window.innerWidth - W - 12, at.x - W + 20)) : 0;
  const top = at ? Math.max(12, Math.min(window.innerHeight - 280, at.y - 20)) : 0;
  return (
    <AnimatePresence>
      {at && (
        <motion.div
          ref={box}
          role="dialog"
          aria-label="Bring up an ayah"
          className="theme-pop fixed z-[86] border border-[var(--box-line)] bg-[var(--box-bg-solid)] p-2 text-[var(--box-fg)] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.75)]"
          style={{ left, top, width: W }}
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          <div className="label px-1.5 pb-1.5 pt-1 text-[var(--box-faint)]">Bring up an ayah</div>
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setI((x) => Math.min(found.length - 1, x + 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setI((x) => Math.max(0, x - 1)));
              else if (e.key === "Enter" && found[i]) onPick(found[i].s, found[i].a);
              else if (e.key === "Escape") onClose();
            }}
            placeholder="2:255, Kahf 10, Yasin 1…"
            className="search-input h-10 text-[12px]"
            spellCheck={false}
            autoComplete="off"
            dir="auto"
          />
          {found.length > 0 && (
            <div className="mt-1.5 flex flex-col" role="listbox">
              {found.map((f, k) => (
                <button
                  key={f.label}
                  type="button"
                  role="option"
                  aria-selected={k === i}
                  onPointerEnter={() => setI(k)}
                  onClick={() => onPick(f.s, f.a)}
                  className={cn("flex items-baseline gap-3 px-2 py-2 text-left transition-colors", k === i && "bg-[var(--box-hover)]")}
                >
                  <span className="label w-[5.5ch] shrink-0 tabular-nums text-[var(--box-muted)]">{f.label}</span>
                  <span className="truncate font-serif text-[15px] italic">{nameMarks(f.name)}</span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
