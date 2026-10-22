import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useMotionValue, useSpring, type Variants } from "framer-motion";
import { ArrowLeft, BookOpen, ChevronDown, ChevronUp, LayoutGrid, Mic, StickyNote, Users, Volume2, VolumeX } from "lucide-react";
import "@fontsource/anton/400.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/eb-garamond/wght.css";
import "@fontsource-variable/eb-garamond/wght-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/aref-ruqaa/arabic-400.css";
import "@fontsource/aref-ruqaa/arabic-700.css";
import "@fontsource/amiri/arabic-400.css";
import "./seerah.css";
import { loadIndex, type Surah } from "@/lib/data";
import { useStore, type Highlight } from "@/lib/store";
import { playHighlight, seerahSfx, strokeEnd } from "@/lib/sound";
import { stopAyahs } from "@/lib/ayahAudio";
import { uid } from "@/lib/utils";
import { HighlightMenu, StickyNotes } from "@/read/Overlays";
import { AyahWindows, BringUp } from "@/read/AyahWindows";
import { VoiceRecorder } from "@/read/VoiceNote";
import { rangeToOffsets, snapToLatinWords, trimRange } from "@/read/text";
import { canonOf, loadSeerah, slidesOf, type Seerah as SeerahData } from "./data";
import { MOODS, moodOf, moodVars, step as stepOf, wayOf } from "./moods";
import { Index } from "./Nav";
import { SlideView, type Enter } from "./Section";
import { TimeBar, Years } from "./Timeline";
import { AyahCard } from "./AyahCard";
import { PersonCard } from "./PersonCard";

const EMPTY: Highlight[] = [];
const PAN = [0.76, 0, 0.24, 1] as const;
// a turn: the whole picture moves the way the next page lies, the page leaving and the page coming
// side by side as if one great image were moved under the eye; a page that comes toward the reader
// grows out of a blur as the one before swells past and fades
const turn: Variants = {
  enter: ({ v, still }: Turn) => (still ? { opacity: 0 } : v.z ? { opacity: 0, scale: 0.7, filter: "blur(14px)", x: 0, y: 0 } : { x: `${v.x * 100}%`, y: `${v.y * 100}%`, opacity: 1, scale: 1, filter: "blur(0px)" }),
  center: { x: 0, y: 0, opacity: 1, scale: 1, filter: "blur(0px)", transitionEnd: { filter: "none" }, transition: { duration: 1.2, ease: PAN } },
  exit: ({ v, still }: Turn) =>
    still ? { opacity: 0, transition: { duration: 0.4 } } : v.z ? { opacity: 0, scale: 1.5, filter: "blur(12px)", transition: { duration: 0.9, ease: PAN } } : { x: `${-v.x * 100}%`, y: `${-v.y * 100}%`, filter: "brightness(0.7)", transition: { duration: 1.2, ease: PAN } },
};
type Turn = { v: Enter; still: boolean };

/**
 * The Seerah: the life of the Prophet ﷺ, after The Sealed Nectar, a page at a time, each its own
 * poster: its colours those of what it tells of, a word written enormous, a picture before it, the
 * words beside. The wheel, a swipe, the arrow keys, the timeline or the index turn to another; the
 * pages lie about one great picture, so the turn goes down, across or toward the reader as the next
 * one lies. Words can be highlighted, notes and voice notes left on a page, its ayahs opened and
 * heard, and its people opened to read of them.
 */
export default function Seerah({ mobile, onHome, onQuran }: { mobile: boolean; onHome: () => void; onQuran: (s: number, a: number) => void }) {
  const [data, setData] = useState<SeerahData | null>(null);
  const [qindex, setQindex] = useState<{ surahs: Surah[]; juz: Record<string, string> } | null>(null);
  useEffect(() => {
    loadSeerah().then(setData);
    loadIndex().then(setQindex);
    return () => stopAyahs();
  }, []);
  const slides = useMemo(() => (data ? slidesOf(data) : []), [data]);
  const people = useMemo(() => new Map((data?.people ?? []).map((p) => [p.id, p])), [data]);
  const setSeerah = useStore((s) => s.setSeerah);
  const still = useStore((s) => s.settings.reduceMotion);
  const soundOn = useStore((s) => s.settings.sound);

  // where it opens: the link's section, else where the reader left it, else its beginning
  const [at, setAt] = useState(-1);
  const [v, setV] = useState<Enter>({ x: 0, y: 1, z: 0 });
  const atRef = useRef(at);
  atRef.current = at;
  useEffect(() => {
    if (!slides.length || atRef.current >= 0) return;
    const linked = decodeURIComponent(location.hash.match(/^#\/seerah\/(.+)$/)?.[1] ?? "");
    const i = slides.findIndex((s) => s.id === (linked || useStore.getState().seerah.at));
    setAt(Math.max(0, i));
  }, [slides]);
  const slide = slides[at];
  useEffect(() => {
    if (!slide) return;
    setSeerah({ at: slide.id });
    history.replaceState(null, "", `#/seerah/${encodeURIComponent(slide.id)}`);
  }, [slide, setSeerah]);

  const busy = useRef(0);
  const go = useCallback(
    (to: number) => {
      const cur = atRef.current, n = Math.max(0, Math.min(slides.length - 1, to));
      if (n === cur || cur < 0) return;
      // which way: the way the page coming in lies; going back, against the way the page left came
      const w = stepOf(n > cur ? wayOf(slides[n]) : wayOf(slides[cur]));
      const dir = n > cur ? 1 : -1;
      setV({ x: w.x * dir, y: w.y * dir, z: w.z * dir });
      setAt(n);
      busy.current = performance.now();
      // the sound of it: air passing the way the page moves, and the new place's own sound
      seerahSfx("turn", w.x * dir * 0.8);
      const m = MOODS[moodOf(slides[n])], was = moodOf(slides[cur]);
      if (m.sound && moodOf(slides[n]) !== was) setTimeout(() => seerahSfx(m.sound!), 380);
    },
    [slides],
  );
  const step = useCallback((d: number) => go(atRef.current + d), [go]);

  // ── turning: the wheel, a swipe, the keys ──
  const stage = useRef<HTMLDivElement>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [indexTab, setIndexTab] = useState<"contents" | "people">("contents");
  const [yearsOpen, setYearsOpen] = useState(false);
  const [person, setPerson] = useState<string | null>(null);
  const overlay = indexOpen || yearsOpen || !!person;
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    // a column of words that can still scroll the way the wheel goes takes the wheel
    const scrolls = (t: EventTarget | null, d: number) => {
      const sc = (t as HTMLElement | null)?.closest?.<HTMLElement>("[data-scroll]");
      if (!sc || !el.contains(sc)) return false;
      return d > 0 ? sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2 : sc.scrollTop > 1;
    };
    let acc = 0, last = 0, held = false;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || overlay) return;
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (scrolls(e.target, d)) return;
      e.preventDefault();
      const now = performance.now();
      // one movement of the wheel (or a trackpad's glide, however long it runs on) turns once
      if (now - last > 220) (acc = 0), (held = false);
      last = now;
      if (held || now - busy.current < 900) return;
      acc += d;
      if (Math.abs(acc) > 34) {
        step(Math.sign(acc));
        held = true;
        acc = 0;
      }
    };
    let t0: { x: number; y: number; end: boolean; start: boolean } | null = null;
    const tstart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || overlay) return (t0 = null);
      const sc = (e.target as HTMLElement).closest<HTMLElement>("[data-scroll]");
      t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, end: !sc || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2, start: !sc || sc.scrollTop <= 1 };
    };
    const tend = (e: TouchEvent) => {
      if (!t0) return;
      const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y;
      // a swipe up or to the left is on; down or to the right, back (the words read to their end first)
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
      else if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.3 && (dy < 0 ? t0.end : t0.start)) step(dy < 0 ? 1 : -1);
      t0 = null;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", tstart, { passive: true });
    el.addEventListener("touchend", tend, { passive: true });
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", tstart);
      el.removeEventListener("touchend", tend);
    };
  }, [step, overlay]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.defaultPrevented || t.closest("input, textarea, [contenteditable='true']") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (overlay) return;
      const next = ["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key), prev = ["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key);
      if (next || prev) {
        e.preventDefault();
        if (performance.now() - busy.current > 600) step(next ? 1 : -1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(slides.length - 1);
      else if (e.key.toLowerCase() === "i") setIndexOpen(true);
      else if (e.key.toLowerCase() === "t") setYearsOpen(true);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [step, go, slides.length, overlay]);

  // ── the pointer's depth: what lies behind moves a little against it ──
  const rawX = useMotionValue(0), rawY = useMotionValue(0);
  const mx = useSpring(rawX, { stiffness: 50, damping: 18 }), my = useSpring(rawY, { stiffness: 50, damping: 18 });
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || still) return;
    rawX.set((e.clientX / window.innerWidth) * 2 - 1);
    rawY.set((e.clientY / window.innerHeight) * 2 - 1);
  };

  // ── what the reader leaves on a page: highlights, notes, voice notes, ayahs brought up ──
  const key = slide?.kind === "section" ? `seerah:${slide.id}` : null;
  const label = slide?.kind === "section" ? `Seerah · ${slide.s.title}` : undefined;
  const allHls = useStore((s) => s.highlights);
  const allNotes = useStore((s) => s.notes);
  const allWindows = useStore((s) => s.windows);
  const addHighlight = useStore((s) => s.addHighlight);
  const addNote = useStore((s) => s.addNote);
  const hls = useMemo(() => (key ? Object.values(allHls).filter((h) => h.key === key) : EMPTY), [allHls, key]);
  const windows = useMemo(() => Object.values(allWindows).filter((w) => w.key === key), [allWindows, key]);
  const shownWins = useMemo(() => new Set(windows.map((w) => w.id)), [windows]);
  const notes = useMemo(() => Object.values(allNotes).filter((n) => (n.win && allWindows[n.win] ? shownWins.has(n.win) : n.key === key)), [allNotes, allWindows, shownWins, key]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; at: { x: number; y: number; bottom: number } } | null>(null);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [recorder, setRecorder] = useState<DOMRect | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [ayah, setAyah] = useState<{ ref: string; rect: DOMRect } | null>(null);
  const closePicker = useCallback(() => setPicker(null), []);
  const closeAyah = useCallback(() => setAyah(null), []);
  const pendingQuote = useRef<{ hid: string; quote: string } | null>(null);
  useEffect(() => {
    setMenu(null);
    setRecorder(null);
    setPicker(null);
    setAyah(null);
  }, [at]);

  const openMenuFor = (id: string) =>
    requestAnimationFrame(() => {
      const marks = [...document.querySelectorAll<HTMLElement>(`mark[data-hid="${id}"]`)];
      if (!marks.length) return;
      const rs = marks.map((m) => m.getBoundingClientRect());
      const top = Math.min(...rs.map((r) => r.top)), bottom = Math.max(...rs.map((r) => r.bottom));
      setMenu({ id, at: { x: (Math.min(...rs.map((r) => r.left)) + Math.max(...rs.map((r) => r.right))) / 2, y: top, bottom } });
    });
  const onSelectEnd = () =>
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount || slide?.kind !== "section") return;
      const range = sel.getRangeAt(0);
      const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const field = startEl?.closest<HTMLElement>('[data-field="seerah"]');
      if (!field || !stage.current?.contains(field)) return;
      if (!field.contains(range.endContainer)) range.setEnd(field, field.childNodes.length);
      const canon = canonOf(slide.s);
      let off = rangeToOffsets(range, field);
      if (!off) return;
      off = snapToLatinWords(canon, trimRange(canon, off));
      const [s, e] = off;
      if (e - s < 2) return;
      const id = uid();
      const text = canon.slice(s, e).replace(/\s*\n\s*/g, " ");
      addHighlight({ id, key: `seerah:${slide.id}`, field: "seerah", start: s, end: e, color: "yellow", text, at: Date.now() });
      sel.removeAllRanges();
      strokeEnd();
      const st = useStore.getState().settings;
      if (st.sound && st.sounds) playHighlight(Math.min(1, text.length / 120));
      setFresh(id);
      openMenuFor(id);
    }, 10);
  const onStageClick = (e: React.MouseEvent) => {
    const mark = (e.target as HTMLElement).closest<HTMLElement>("mark.hl");
    if (mark && !(e.target as HTMLElement).closest(".s-person") && !window.getSelection()?.toString()) openMenuFor(mark.dataset.hid!);
  };

  const newNote = (extra?: { hid?: string; quote?: string; kind?: "voice"; audio?: string; dur?: number }) => {
    if (!key) return;
    const vw = window.innerWidth, vh = window.innerHeight, size = mobile ? 190 : 232;
    const n = Object.values(useStore.getState().notes).filter((x) => x.key === key && !x.docked).length;
    const x = mobile ? (vw - size) / 2 : vw - size - 70 - n * 26;
    const y = 90 + n * 30;
    const id = uid();
    addNote({ id, key, label, text: "", x: x / vw, y: y / vh, rot: Math.round((Math.random() * 6 - 3) * 10) / 10, at: Date.now(), ...extra });
    if (extra?.kind !== "voice") setFocusNote(id);
  };
  // an ayah brought up beside the page: by the right side (on a phone, across the middle), a little
  // lower for each already there; no thread (nothing in the Seerah to tie it to)
  const bringUp = (s: number, a: number) => {
    if (!key) return;
    const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(340, vw - 32);
    const n = windows.length;
    const x = mobile ? (vw - w) / 2 : vw - w - 40 - n * 22;
    const y = (mobile ? 80 : 90) + n * 28;
    useStore.getState().addWindow({ id: uid(), key, s, a, x: x / vw, y: y / vh, tie: null, at: Date.now() });
    setAyah(null);
  };

  const menuHl = menu ? (allHls[menu.id] ?? null) : null;
  const mood = slide ? moodOf(slide) : "sand";
  const iconBtn = "s-iconbtn";
  const tools = slide?.kind === "section" && (
    <div className="s-tools">
      <button type="button" className={iconBtn} onClick={() => newNote()} title="Write a note on this page" aria-label="Write a note on this page">
        <StickyNote size={15} strokeWidth={1.5} />
      </button>
      <button type="button" className={iconBtn} onClick={(e) => setRecorder(e.currentTarget.getBoundingClientRect())} title="Record a voice note on this page" aria-label="Record a voice note on this page">
        <Mic size={15} strokeWidth={1.5} />
      </button>
      <button type="button" className={iconBtn} onClick={(e) => setPicker(picker ? null : { x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().top })} title="Bring up an ayah beside this page" aria-label="Bring up an ayah beside this page">
        <BookOpen size={15} strokeWidth={1.5} />
      </button>
    </div>
  );

  return (
    <div className="seerah" style={moodVars(mood)} onPointerMove={onMove}>
      {/* the stage: one page at a time */}
      <div ref={stage} className="absolute inset-0" style={{ touchAction: "pan-y" }} onMouseUp={onSelectEnd} onTouchEnd={() => setTimeout(() => window.getSelection()?.toString() && onSelectEnd(), 350)} onClick={onStageClick}>
        <AnimatePresence initial={false} custom={{ v, still } satisfies Turn}>
          {slide && (
            <motion.div key={slide.id} className="absolute inset-0" custom={{ v, still } satisfies Turn} variants={turn} initial="enter" animate="center" exit="exit">
              <SlideView slide={slide} hls={hls} fresh={fresh} onRef={(ref, el) => setAyah({ ref, rect: el.getBoundingClientRect() })} people={people} onPerson={setPerson} mobile={mobile} mx={mx} my={my} enter={v} />
            </motion.div>
          )}
        </AnimatePresence>
        {!data && <div className="s-loading">السيرة</div>}
      </div>
      <div className="seerah-grain" aria-hidden />

      {/* the bar along the top: the way home, the index, the people, the sound */}
      <header className="s-top">
        <div className="s-brand">
          <button type="button" className={iconBtn} onClick={onHome} aria-label="Back to the first page" title="Back to the first page">
            <ArrowLeft size={16} strokeWidth={1.5} />
          </button>
          <span className="ar" dir="rtl" lang="ar">
            السيرة النبوية
          </span>
          {!mobile && (
            <span className="s-label" style={{ color: "var(--s-faint)" }}>
              After <i style={{ fontFamily: "var(--display)", fontSize: 15, letterSpacing: 0, textTransform: "none", fontStyle: "italic" }}>The Sealed Nectar</i>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!mobile && slide && (
            <span className="s-label mr-2" style={{ color: "var(--s-faint)" }}>
              {String(at + 1).padStart(3, "0")} / {slides.length}
            </span>
          )}
          <button type="button" className={iconBtn} onClick={() => useStore.getState().set({ sound: !soundOn })} aria-label={soundOn ? "Quiet" : "Sound on"} title={soundOn ? "Quiet" : "Sound on"}>
            {soundOn ? <Volume2 size={15} strokeWidth={1.5} /> : <VolumeX size={15} strokeWidth={1.5} />}
          </button>
          <button type="button" className={iconBtn} onClick={() => (setIndexTab("people"), setIndexOpen(true))} aria-label="The people" title="The people">
            <Users size={15} strokeWidth={1.5} />
          </button>
          <button type="button" className={iconBtn} onClick={() => (setIndexTab("contents"), setIndexOpen(true))} aria-label="The index (I)" title="The index (I)">
            <LayoutGrid size={15} strokeWidth={1.5} />
            {!mobile && <span className="s-label">Index</span>}
          </button>
        </div>
      </header>

      {tools}
      <div className="s-steps">
        <button type="button" className={iconBtn} onClick={() => step(-1)} disabled={at <= 0} aria-label="The page before" style={{ opacity: at <= 0 ? 0.35 : 1 }}>
          <ChevronUp size={16} strokeWidth={1.5} />
        </button>
        <button type="button" className={iconBtn} onClick={() => step(1)} disabled={at >= slides.length - 1} aria-label="The next page" style={{ opacity: at >= slides.length - 1 ? 0.35 : 1 }}>
          <ChevronDown size={16} strokeWidth={1.5} />
        </button>
      </div>
      {slides.length > 0 && <TimeBar slides={slides} at={Math.max(0, at)} onGo={go} onOpen={() => setYearsOpen(true)} />}

      {data && (
        <Index
          open={indexOpen}
          startTab={indexTab}
          onClose={() => setIndexOpen(false)}
          parts={data.parts}
          people={data.people}
          slides={slides}
          at={Math.max(0, at)}
          onGo={go}
          onPerson={(id) => {
            seerahSfx("open");
            setPerson(id);
          }}
        />
      )}
      <Years open={yearsOpen} slides={slides} at={Math.max(0, at)} onGo={go} onClose={() => setYearsOpen(false)} />
      <PersonCard
        person={person ? (people.get(person) ?? null) : null}
        slides={slides}
        at={slide?.id}
        onGo={(i) => {
          setPerson(null);
          setIndexOpen(false);
          go(i);
        }}
        onClose={() => setPerson(null)}
      />

      {/* (laid over the page, on <body>) */}
      {createPortal(
        <>
          <AyahCard open={ayah} onClose={closeAyah} onBeside={bringUp} onQuran={onQuran} />
          <HighlightMenu
            hl={menuHl}
            at={menu?.at ?? null}
            onClose={() => setMenu(null)}
            onCopy={async (h) => {
              await navigator.clipboard?.writeText(h.text).catch(() => {});
              setMenu(null);
            }}
            onNote={(h) => {
              newNote({ hid: h.id, quote: h.text });
              setMenu(null);
            }}
            onVoice={(h, anchor) => {
              setRecorder(anchor);
              setMenu(null);
              pendingQuote.current = { hid: h.id, quote: h.text };
            }}
          />
          <AyahWindows windows={windows} onJump={(w) => onQuran(w.s, w.a)} />
          <StickyNotes notes={notes} focusId={focusNote} onFocused={() => setFocusNote(null)} />
          {qindex && <BringUp at={picker} surahs={qindex.surahs} juz={qindex.juz} onPick={(s, a) => (setPicker(null), bringUp(s, a))} onClose={closePicker} />}
        </>,
        document.body,
      )}
      <VoiceRecorder
        anchor={recorder}
        ayahKey={key ?? ""}
        label={label}
        quote={pendingQuote.current?.quote}
        onClose={() => {
          setRecorder(null);
          pendingQuote.current = null;
        }}
        onSaved={(audio, dur) => {
          newNote({ kind: "voice", audio, dur, ...(pendingQuote.current ?? {}) });
          pendingQuote.current = null;
        }}
      />
    </div>
  );
}
