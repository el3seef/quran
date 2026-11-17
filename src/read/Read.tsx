import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LayoutGrid,
  Search as SearchIcon,
  Bookmark,
  Check,
  ChevronRight,
  Copy,
  Mic,
  Share2,
  BookOpenText,
  PictureInPicture2,
  Highlighter,
  Settings2,
  Glasses,
  Rows3,
  RectangleHorizontal,
  BookOpen,
  Maximize2,
  Minimize2,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CornerDownRight,
  CornerUpLeft,
  Pause,
  Play,
  Trash2,
  Volume2,
  X as XIcon,
} from "lucide-react";
import { Actions, AyahSection, ContextToggle, OwnActions, onAyahHeights, type AyahAction } from "./Ayah";
import { TafsirPanel } from "./Tafsir";
import { HONORIFICS, glossByTerm, glossFor, loadGlossary } from "./terms";
import { HighlightMenu, StickyNotes, Toast, WordTip, tipHover, type Tip } from "./Overlays";
import { ReflectionPanel } from "./Reflection";
import { SettingsPanel } from "./Settings";
import { wantKeys } from "./Guide";
import { SurahSummary } from "./Summary";
import { ShareDialog, type ShareContent } from "./Share";
import { arabicFor, inProportion, translationFor } from "./align";
import { NoteShareDialog } from "./NoteShare";
import { BookText } from "./Book";
import { VoiceRecorder } from "./VoiceNote";
import { rangeToOffsets, rangeToArabicWords, snapToLatinWords, trimRange, arabicWords, translationPieces, shownSlice } from "./text";
import { createPager, type Pager } from "./pager";
import { PlayerBar, PlayerLine } from "./PlayerBar";
import { close as closePlayer, loadTiming, recite, recitePart, toggle as togglePlayer, usePlayer, type Player } from "@/lib/recite";
import { AyahSlider } from "@/components/ui/slider";
import { SurahArt } from "@/components/SurahCard";
import { SearchBox } from "@/components/SearchBox";
import { ImmersivePanel, Reveal } from "@/components/ImmersivePanel";
import { BrainGlyph, NoteGlyph } from "@/components/glyphs";
import { BookSwitch, ReadingMenu, ReadingSwitches, SheetSwitch } from "./ReadingControls";
import { arabicText, loadSurah, loadTranslit, pad3, spellHonorifics, translationText, type Surah, type SurahData, type Translation, type Verse } from "@/lib/data";
import { HIGHLIGHT_COLORS, useStore, type Highlight, type HighlightField, type Settings } from "@/lib/store";
import { useUI, type MenuItem } from "@/lib/ui";
import { playHighlight, sfx, strokeEnd, strokeMove, strokeRecently } from "@/lib/sound";
import { isLongPressMenu } from "@/lib/touch";
import { useTouchSelect } from "./touchSelect";
import type { Rect } from "@/lib/layout";
import type { Result } from "@/lib/search";
import { EASE_IN_OUT, EASE_OUT, cn, copyText, uid, whenIdle } from "@/lib/utils";
import { CompleteMark } from "./Progress";
import { FolderPop } from "./Folders";
import { IndexView, INDEX_VIEWS, type IndexKind } from "@/pages/IndexViews";
import { AyahPeek } from "./Peek";
import { AyahWindows, BringUp } from "./AyahWindows";
import { ayn, nameMarks } from "@/lib/names";
import { surahColor } from "@/lib/surahColor";

const GLOSSED = ".gl, .saw, .hon"; // translation terms and honorifics with a meaning on hover
// the settings an ayah is drawn with
const AYAH_KEYS = ["translation", "also", "book", "bookThemes", "bookLines", "showContext", "readingMode", "arabicScale", "transScale", "wordHover", "script", "view", "reduceMotion", "translitLine"] as const;

type Props = {
  surahs: Surah[];
  juz: Record<string, string>;
  start: { surah: number; ayah: number; from?: Rect; showOpener?: boolean };
  onIndex: (surah: number, ayah: number) => void;
  mobile: boolean;
  below: number; // space between the frame's bottom edge and the window's
};

// the King Fahd Complex (QPC) Hafs text of 1:1
/** An ayah's top within the page: its own, or (a piece of it on a book's line, which measures its words
 *  from itself as it is drawn out) its line's and its own within it */
const yOf = (el: HTMLElement) => {
  const line = el.offsetParent as HTMLElement | null;
  return el.offsetTop + (line?.classList.contains("mushaf-line") ? line.offsetTop : 0);
};

const BISMILLAH = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";

export function Read({ surahs, juz, start, onIndex, mobile, below }: Props) {
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.set);
  const bookmarks = useStore((s) => s.bookmarks);
  const allHighlights = useStore((s) => s.highlights);
  const allNotes = useStore((s) => s.notes);
  const allWindows = useStore((s) => s.windows);
  const toggleBookmark = useStore((s) => s.toggleBookmark);
  const addHighlight = useStore((s) => s.addHighlight);
  const removeHighlight = useStore((s) => s.removeHighlight);
  const addNote = useStore((s) => s.addNote);
  const setLast = useStore((s) => s.setLast);

  const [surahN, setSurahN] = useState(start.surah);
  const [data, setData] = useState<SurahData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(start.showOpener ? 0 : start.ayah);
  const [lastShown, setLastShown] = useState(active); // the last ayah showing in the frame

  /* ── a surah is built around where the reader lands, two ayahs either side, and the rest a
     little at a time while the page is idle: all of a long one at once (Al-Baqarah, some 37,000
     elements) held up its opening. An ayah the reader comes near is always built. ── */
  const [built, setBuilt] = useState<{ for: SurahData | null; lo: number; hi: number }>({ for: null, lo: 1, hi: 0 });
  if (data && built.for !== data) setBuilt({ for: data, lo: active - 2, hi: active + 2 });
  // (and an ayah once built stays built: one the reader has passed falling back to an empty place of
  // another height, above the frame, would move the page under a moving finger)
  const everBuilt = useRef<{ for: SurahData | null; n: Set<number> }>({ for: null, n: new Set() });
  if (everBuilt.current.for !== data) everBuilt.current = { for: data, n: new Set() };
  useEffect(() => {
    const sc = scroller.current;
    if (!data || !sc || built.for !== data || (built.lo <= 1 && built.hi >= data.v.length)) return;
    // (never while the reader is moving the page: the next few once it is still again)
    let moved = 0;
    const onMove = () => (moved = performance.now());
    sc.addEventListener("scroll", onMove, { passive: true });
    sc.addEventListener("touchstart", onMove, { passive: true });
    let cancel = () => {};
    const more = () => {
      if (performance.now() - moved < 350) return void (t = window.setTimeout(() => (cancel = whenIdle(more)), 350));
      setBuilt((b) => (b.for === data ? { ...b, lo: b.lo - 6, hi: b.hi + 6 } : b));
    };
    // (the first, once the opening has settled)
    let t = window.setTimeout(() => (cancel = whenIdle(more)), built.hi - built.lo <= 4 ? 900 : 0);
    return () => {
      window.clearTimeout(t);
      cancel();
      sc.removeEventListener("scroll", onMove);
      sc.removeEventListener("touchstart", onMove);
    };
  }, [data, built]);
  const target = useRef<{ ayah: number; smooth: boolean } | null>({ ayah: start.showOpener ? 0 : start.ayah, smooth: false });
  const [zoom, setZoom] = useState<Rect | null>(start.from ?? null);

  // the ayahs as a book: the multiple-ayah view, with the Arabic alone or a translation alone
  const bookMode = settings.view === 3 && settings.readingMode !== "both" && settings.book;
  const [panel, setPanel] = useState<null | "settings" | "saved" | "reflection" | "search" | "guide">(null);
  // (the site's navigation asks for one: Settings, from the rail or the dock)
  useEffect(() => {
    const on = (e: Event) => {
      const want = (e as CustomEvent).detail as typeof panel;
      setPanel((p) => (p === want ? null : want));
    };
    window.addEventListener("reader-panel", on);
    return () => window.removeEventListener("reader-panel", on);
  }, []);
  const [tip, setTip] = useState<Tip | null>(null);
  const closeTip = useCallback(() => setTip(null), []);
  // a panel opened over the page: what was floating over the page goes
  useEffect(() => {
    if (!panel) return;
    setTip(null);
    useUI.getState().setPeek(null);
  }, [panel]);
  const [menu, setMenu] = useState<{ id: string; at: { x: number; y: number; bottom: number; below?: boolean } } | null>(null);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // bookmarked with folders of one's own: the popup to file it, where it was bookmarked
  const [folderPop, setFolderPop] = useState<{ key: string; x: number; y: number } | null>(null);
  const closeFolderPop = useCallback(() => setFolderPop(null), []);
  const lastPt = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  useEffect(() => {
    const on = (e: PointerEvent) => (lastPt.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointerdown", on, true);
    return () => window.removeEventListener("pointerdown", on, true);
  }, []);
  const [outside, setOutside] = useState<HTMLElement | null>(null); // around the frame, not turning with it
  const [backFace, setBackFace] = useState<HTMLElement | null>(null);
  const [share, setShare] = useState<ShareContent | null>(null);
  // a voice note on an ayah, or on a highlighted part of one (hid + quote)
  const [recorder, setRecorder] = useState<{ key: string; anchor: DOMRect; hid?: string; quote?: string } | null>(null);
  // choosing an ayah to bring up beside the page (AyahWindows): for the ayah `key`, from where it was asked
  const [bringUp, setBringUp] = useState<{ key: string; x: number; y: number } | null>(null);
  // the tafsir open over the page: the ayah it was opened from
  const [tafsir, setTafsir] = useState<{ s: number; a: number } | null>(null);
  const flipped = useUI((s) => s.flipped);
  const setFlipped = useUI((s) => s.setFlipped);
  const openMenu = useUI((s) => s.openMenu);
  const noteShare = useUI((s) => s.noteShare);
  const focus = useUI((s) => s.focus);
  const aboutOpen = useUI((s) => s.about);
  const closeNoteShare = useCallback(() => useUI.getState().shareNote(null), []);
  useEffect(() => () => setFlipped(false), [setFlipped]); // leaving the reader turns the frame back

  const rootRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const surah = surahs[surahN - 1];

  useLayoutEffect(() => {
    setOutside(document.querySelector<HTMLElement>("[data-frame-still]"));
    setBackFace(document.querySelector<HTMLElement>("[data-frame-back]"));
  }, []);

  const [viewH, setViewH] = useState(0);
  const [viewW, setViewW] = useState(0);
  // the ayah being read when the frame changed size (a phone's keyboard opening under a panel,
  // a window resized): every page changes height with it, and the reader stays on that ayah
  const keepOnResize = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      setViewW(Math.round(el.clientWidth / 16) * 16);
      const h = Math.round(el.clientHeight / 8) * 8;
      setViewH((old) => {
        if (old && old !== h && keepOnResize.current === null) keepOnResize.current = activeRef.current;
        return h;
      });
    };
    // (while the frame moves into focus or out of it, the ayahs wait: they are fitted once, at the
    // size it comes to, not at every size on the way)
    const ro = new ResizeObserver(() => !useUI.getState().reflow && measure());
    ro.observe(el);
    const off = useUI.subscribe((st, prev) => {
      if (prev.reflow && !st.reflow) measure();
    });
    return () => {
      ro.disconnect();
      off();
    };
  }, []);
  useLayoutEffect(() => {
    const keep = keepOnResize.current;
    keepOnResize.current = null;
    if (keep === null) return;
    const place = () => {
      const sc = scroller.current;
      const el = sc?.querySelector<HTMLElement>(`[data-n="${keep}"]`);
      if (sc && el) sc.scrollTop = yOf(el);
      anchorNow.current();
    };
    place();
    // and again once long ayahs have refitted to the new height
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(place)));
    return () => cancelAnimationFrame(raf);
  }, [viewH]);

  // each ayah transliterated, under its Arabic (when chosen in Settings)
  const [translits, setTranslits] = useState<{ n: number; lines: string[] } | null>(null);
  useEffect(() => {
    if (!settings.translitLine) return;
    let alive = true;
    loadTranslit(surahN)
      .then((lines) => alive && setTranslits({ n: surahN, lines }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [settings.translitLine, surahN]);
  const tl = settings.translitLine && translits?.n === surahN ? translits.lines : null;

  // the Indo-Pak bismillah is taken from 1:1 of the Indo-Pak text itself
  const [bismIP, setBismIP] = useState<string | null>(null);
  useEffect(() => {
    if (settings.script !== "indopak" || bismIP) return;
    loadSurah(1)
      .then((d) => d.v[0]?.ip && setBismIP(d.v[0].ip.join(" ")))
      .catch(() => {});
  }, [settings.script, bismIP]);

  /* ── load the surah ─────────────────────────────────────────── */
  const mountedAt = useRef(performance.now());
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    setData(null);
    // the glossary comes first, so its terms are marked up when the ayahs render. Coming from the
    // index, the surah is set out once the index has faded and in small pieces (a transition), so
    // the frame moving into place never waits on a long surah being built
    Promise.all([loadSurah(surahN), loadGlossary()])
      .then(([d]) => {
        if (!alive) return;
        const wait = Math.max(0, 420 - (performance.now() - mountedAt.current));
        window.setTimeout(() => alive && startTransition(() => setData(d)), wait);
      })
      .catch(() => alive && setError(`${surahs[surahN - 1]?.tc ?? "This surah"} didn't load. Check your connection and try again.`));
    // warm the neighbours
    if (surahN < 114) loadSurah(surahN + 1).catch(() => {});
    return () => {
      alive = false;
    };
  }, [surahN, surahs, retry]);

  // the recitations of this surah fetched ahead (small files), so a press is heard at once: the chosen
  // reciter's, and Alafasy's for a highlighted part; the player stops when the reader is left
  const reciter = settings.reciter;
  useEffect(() => whenIdle(() => {
    loadTiming(reciter, surahN).catch(() => {});
    loadTiming("alafasy", surahN).catch(() => {});
  }), [reciter, surahN]);
  useEffect(() => () => closePlayer(), []);

  // the one-ayah view's anchor (below): told at once when the page itself moves the reader
  const anchorNow = useRef<() => void>(() => {});
  // (and told to follow a glide the page makes, for as long as it lasts)
  const anchorFollow = useRef<(ms: number) => void>(() => {});
  // one ayah at a time, moved by the reader's own hand (pager.ts): stopped when the page moves itself
  const pagerRef = useRef<Pager | null>(null);

  /* ── scroll to a pending target once the surah is rendered ──── */
  const scrollToAyah = useCallback((ayah: number, smooth = true) => {
    const sc = scroller.current;
    if (!sc) return;
    const el = sc.querySelector<HTMLElement>(`[data-n="${ayah}"]`);
    if (!el) return;
    pagerRef.current?.stop();
    const topOf = () => {
      let top = yOf(el);
      // scrolling freely, the last ayahs rest with the surah's end at the foot of the box (any
      // further and the closing page takes over)
      if (sc.classList.contains("flow") && ayah > 0) {
        const pages = sc.querySelectorAll<HTMLElement>("[data-n]");
        const closing = pages[pages.length - 1];
        if (closing && closing !== el) top = Math.min(top, closing.offsetTop - sc.clientHeight);
      }
      return top;
    };
    const top = topOf();
    if (!smooth || settings.reduceMotion) {
      sc.scrollTo({ top, behavior: "auto" });
      anchorNow.current();
      // held there for a few frames while the ayahs around it are laid out and take their own
      // heights (an ayah taller than the frame does not snap back by itself); anything else that
      // moves the page meanwhile (the reader, the page keeping its place) ends it
      const hold = (frames: number, want: number) =>
        requestAnimationFrame(() => {
          if (Math.abs(sc.scrollTop - want) > 1) return;
          const t = topOf();
          if (Math.abs(t - want) > 1) sc.scrollTop = t;
          anchorNow.current();
          if (frames > 1) hold(frames - 1, sc.scrollTop);
        });
      hold(3, sc.scrollTop);
      return;
    }
    // the ayahs passed on the way are laid out only as they come near, each moving the ones after
    // it a little: a glide lands where the ayah has come to be, once it has stopped
    const started = performance.now();
    const settle = () => {
      if (performance.now() - started > 2500) return; // the reader has scrolled on since
      const t = topOf();
      if (Math.abs(t - sc.scrollTop) > 2) sc.scrollTo({ top: t, behavior: "smooth" });
    };
    anchorFollow.current(2600);
    const glide = () => {
      sc.scrollTo({ top: topOf(), behavior: "smooth" });
      if ("onscrollend" in window) sc.addEventListener("scrollend", settle, { once: true });
      else setTimeout(settle, 900);
    };
    // far away, most of the way is one step and only the last screen glides
    const far = top - sc.scrollTop;
    if (Math.abs(far) > sc.clientHeight * 2.5) {
      sc.scrollTop = top - Math.sign(far) * sc.clientHeight;
      requestAnimationFrame(() => requestAnimationFrame(glide));
    } else glide();
  }, [settings.reduceMotion]);

  useLayoutEffect(() => {
    if (!data || !target.current) return;
    const t = target.current;
    target.current = null;
    // a jump: in place before the first frame is drawn, so an ayah opened partway through a surah
    // (8:60 from the index) never shows the surah's opening page on its way in. Only the start of a
    // surah opens on that page. Into the middle, the page is also kept out of sight and unsnapped
    // until it rests on its ayah (Safari on an iPhone can snap back to the first page as the ayahs
    // take their heights), then shown
    const sc = scroller.current;
    const mid = !t.smooth && t.ayah > 0 && !!sc;
    if (mid) {
      sc.style.visibility = "hidden";
      sc.style.scrollSnapType = "none";
    }
    if (!t.smooth) {
      scrollToAyah(t.ayah, false);
      setActive(t.ayah);
    }
    requestAnimationFrame(() => {
      scrollToAyah(t.ayah, t.smooth);
      setActive(t.ayah);
      if (!mid) return;
      // (three more frames for the ayahs around it to settle, put back on its ayah, then shown)
      let n = 3;
      const settle = () => {
        if (--n > 0) return void requestAnimationFrame(settle);
        const el = sc.querySelector<HTMLElement>(`[data-n="${t.ayah}"]`);
        if (el && settings.view === 1) sc.scrollTop = el.offsetTop;
        else scrollToAyah(t.ayah, false);
        anchorNow.current();
        sc.style.scrollSnapType = "";
        sc.style.visibility = "";
        if (!useStore.getState().settings.reduceMotion) sc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: "cubic-bezier(0, 0, 0.2, 1)" });
      };
      requestAnimationFrame(settle);
    });
  }, [data, scrollToAyah]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the ayah in view when the layout changes (view toggle, reading mode, sizes)
  const activeRef = useRef(active);
  activeRef.current = active;
  useLayoutEffect(() => {
    if (!data) return;
    requestAnimationFrame(() => {
      scrollToAyah(activeRef.current, false);
      // a change of the way of reading, from the view switch's menu, faded the page out: back in
      const sc = scroller.current;
      if (fadeOut.current && sc) {
        fadeOut.current.cancel();
        fadeOut.current = null;
        sc.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.readingMode, settings.book, settings.bookThemes, settings.bookLines, settings.arabicScale, settings.transScale, settings.translation, settings.translitLine]);

  // the Arabic as a book, sized to the printed lines: the reader kept on their ayah. A size of the
  // reader's own chosen for the Arabic, reading it so, lets the lines fall where that size puts them
  const onBookFitted = useCallback(() => requestAnimationFrame(() => scrollToAyah(activeRef.current, false)), [scrollToAyah]);
  const scaleWas = useRef(settings.arabicScale);
  useEffect(() => {
    if (scaleWas.current === settings.arabicScale) return;
    scaleWas.current = settings.arabicScale;
    if (bookMode && settings.readingMode === "arabic" && settings.bookLines) set({ bookLines: false });
  }, [settings.arabicScale]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── the multiple-ayah view scrolls freely, but its opening page and its
     closing page are pages. The moment the scrolling crosses into one (the
     opening page left behind, the last ayah's end reaching the foot of the
     box), the page comes whole into view or goes whole out of it, the way the
     reader was heading; a finger that stops between them settles the same way
     when it lifts. ── */
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || !data || settings.view !== 3) return;
    let last = sc.scrollTop;
    let rest = sc.scrollTop; // where the scroll last came to rest
    let snapping = 0; // until when a snap is under way (the wheel waits for it)
    let fingers = 0;
    let timer = 0;
    const zones = () => {
      const opener = sc.querySelector<HTMLElement>('[data-n="0"]');
      const pages = sc.querySelectorAll<HTMLElement>("[data-n]");
      const closing = pages[pages.length - 1];
      const h = sc.clientHeight;
      return {
        end: opener ? opener.offsetTop + opener.offsetHeight : 0, // ayah 1 at the top
        a: closing && closing !== opener ? closing.offsetTop - h : Infinity, // the last ayah's end at the foot
        b: closing && closing !== opener ? closing.offsetTop : Infinity, // the closing page whole
      };
    };
    const snap = (to: number) => {
      if (Math.abs(to - sc.scrollTop) < 2) return;
      snapping = performance.now() + (settings.reduceMotion ? 50 : 700);
      sc.scrollTo({ top: to, behavior: settings.reduceMotion ? "auto" : "smooth" });
    };
    const busy = () => performance.now() < snapping;
    // only the reader's own scrolling (a finger, the wheel, the keys) brings a page in or out: the
    // page placing itself (a view switch, an ayah laid out above, a jump) never does
    let userAt = -Infinity;
    const byUser = () => fingers > 0 || performance.now() - userAt < 1500;
    const touched = () => (userAt = performance.now());
    // a finger let go (or the scroll stopped) somewhere inside a page: whole in or whole out
    const settle = () => {
      window.clearTimeout(timer);
      if (fingers > 0 || busy()) return;
      const top = sc.scrollTop;
      const down = top >= rest;
      rest = top;
      if (!byUser() || !sc.classList.contains("flow")) return;
      const { end, a, b } = zones();
      if (top > 1 && top < end - 1) snap(down ? (top > end * 0.12 ? end : 0) : top < end * 0.88 ? 0 : end);
      else if (top > a + 1 && top < b - 1) snap(down ? b : top < a + (b - a) * 0.88 ? a : b);
    };
    const onScroll = () => {
      const top = sc.scrollTop;
      if (fingers === 0 && !busy() && byUser() && sc.classList.contains("flow")) {
        const { end, a, b } = zones();
        if (top > last && last <= 1 && top > 1 && top < end) snap(end); // leaving the opening page
        else if (top < last && last >= end - 1 && top < end - 1 && top > 0) snap(0); // back to it
        else if (top > last && last <= a + 1 && top > a + 1 && top < b) snap(b); // the end of the surah
        else if (top < last && last >= b - 1 && top < b - 1 && top > a) snap(a); // back from it
      }
      last = top;
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, "onscrollend" in window ? 500 : 140);
    };
    const onEnd = () => {
      snapping = 0;
      settle();
    };
    // while a page comes into place the wheel waits, so the snap lands where it should
    const onWheel = (e: WheelEvent) => {
      touched();
      if (busy()) e.preventDefault();
    };
    const touchStart = (e: TouchEvent) => {
      fingers = e.touches.length;
      snapping = 0;
      touched();
    };
    const touchEnd = (e: TouchEvent) => {
      fingers = e.touches.length;
      touched(); // (the glide after it is still the reader's)
      if (!fingers) {
        window.clearTimeout(timer);
        timer = window.setTimeout(settle, "onscrollend" in window ? 500 : 140); // after any glide
      }
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    sc.addEventListener("scrollend", onEnd);
    sc.addEventListener("wheel", onWheel, { passive: false });
    sc.addEventListener("touchstart", touchStart, { passive: true });
    sc.addEventListener("touchend", touchEnd, { passive: true });
    sc.addEventListener("touchcancel", touchEnd, { passive: true });
    sc.addEventListener("keydown", touched);
    sc.addEventListener("pointerdown", touched); // (a scrollbar dragged)
    return () => {
      window.clearTimeout(timer);
      sc.removeEventListener("keydown", touched);
      sc.removeEventListener("pointerdown", touched);
      sc.removeEventListener("scroll", onScroll);
      sc.removeEventListener("scrollend", onEnd);
      sc.removeEventListener("wheel", onWheel);
      sc.removeEventListener("touchstart", touchStart);
      sc.removeEventListener("touchend", touchEnd);
      sc.removeEventListener("touchcancel", touchEnd);
    };
  }, [data, settings.view, settings.reduceMotion]);

  /* ── which ayah is in the frame ─────────────────────────────── */
  // and where the reader is, to the pixel: the ayah at the frame's top and how far into it (kept
  // through a change of the context, however it is switched: below)
  const spot = useRef<{ n: number; off: number; frac: number } | null>(null);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const items = sc.querySelectorAll<HTMLElement>("[data-n]");
        const y = sc.scrollTop + 8;
        let cur = 0;
        for (const el of items) {
          if (yOf(el) <= y) cur = Number(el.dataset.n);
          else break;
        }
        // at the very bottom, the last ayah is the active one
        if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4 && items.length) cur = Number(items[items.length - 1].dataset.n);
        // scrolling freely, the surah's end at the foot of the box: the reader is on its last ayah
        else if (sc.classList.contains("flow") && items.length > 1) {
          const closing = items[items.length - 1];
          if (sc.scrollTop >= closing.offsetTop - sc.clientHeight - 4) cur = Number(closing.dataset.n) - 1;
        }
        let top: HTMLElement | null = null;
        for (const el of items) {
          if (yOf(el) <= sc.scrollTop + 2) top = el;
          else break;
        }
        if (top) {
          const off = sc.scrollTop - yOf(top);
          spot.current = { n: Number(top.dataset.n), off, frac: top.offsetHeight ? off / top.offsetHeight : 0 };
        }
        // the ayahs showing in the frame (their notes float over it)
        let last = cur;
        for (const el of items) {
          const n = Number(el.dataset.n);
          if (n > cur && yOf(el) < sc.scrollTop + sc.clientHeight - 24) last = n;
        }
        setActive((a) => (a === cur ? a : cur));
        setLastShown((l) => (l === last ? l : last));
        setTip(null);
      });
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      sc.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [data]);

  /* ── the recitation on the page: the ayah being recited marked, the word being said lit, and the
     page kept on it as it goes (a long ayah read down as its words are said; playing on, each ayah
     brought into view as it begins), unless the reader has just moved the page themselves ── */
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || !data) return;
    let moved = 0;
    const touched = () => (moved = performance.now());
    const inputs = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    inputs.forEach((t) => sc.addEventListener(t, touched, { passive: true }));
    let ayahEls: Element[] = [];
    let wordEl: HTMLElement | null = null;
    let lastAyah = usePlayer.getState().ayah;
    const view1 = settings.view === 1;
    const go = (top: number) => {
      if (Math.abs(top - sc.scrollTop) < 4) return;
      anchorFollow.current(1400);
      if (view1 && pagerRef.current) pagerRef.current.to(top);
      else sc.scrollTo({ top, behavior: useStore.getState().settings.reduceMotion ? "auto" : "smooth" });
    };
    // a new ayah begun (playing on): brought to the top of the frame once it is not wholly in view
    const followAyah = (n: number) => {
      if (bookMode) return; // (as a book, its words lead the page)
      if (view1) return void (activeRef.current !== n && go(sc.querySelector<HTMLElement>(`section[data-n="${n}"]`)?.offsetTop ?? sc.scrollTop));
      const el = sc.querySelector<HTMLElement>(`section[data-n="${n}"]`);
      if (!el) return;
      const top = el.offsetTop - sc.scrollTop;
      if (top < -2 || top + el.offsetHeight > sc.clientHeight) scrollToAyah(n);
    };
    // the word said gone below the frame's lower part (or above its top): the page moves it up to a third
    // of the way down (one ayah at a time, within its own ayah)
    const followWord = (w: HTMLElement) => {
      const r = w.getBoundingClientRect(), box = sc.getBoundingClientRect();
      if (r.top >= box.top + 6 && r.bottom <= box.bottom - box.height * 0.16) return;
      let top = sc.scrollTop + (r.top - box.top) - box.height * 0.3;
      const sec = view1 ? w.closest<HTMLElement>("section[data-n]") : null;
      if (sec) top = Math.min(Math.max(top, sec.offsetTop), sec.offsetTop + Math.max(0, sec.offsetHeight - sc.clientHeight));
      go(Math.max(0, top));
    };
    const paint = (p: Player) => {
      const mine = p.on && p.surah === surahN && p.ayah > 0;
      const key = `${surahN}:${p.ayah}`;
      const want = mine && !p.part ? [...sc.querySelectorAll(`section[data-key="${key}"]`)] : [];
      if (want[0] !== ayahEls[0]) {
        ayahEls.forEach((e) => e.classList.remove("is-reciting"));
        want.forEach((e) => e.classList.add("is-reciting"));
        ayahEls = want;
      }
      const w = mine && p.word >= 0 ? sc.querySelector<HTMLElement>(`[data-field="ar"][data-key="${key}"] .word[data-w="${p.word}"]`) : null;
      if (w !== wordEl) {
        wordEl?.classList.remove("reciting-word");
        w?.classList.add("reciting-word");
        wordEl = w;
      }
      if (!mine || !p.playing) return void (lastAyah = p.ayah);
      const free = performance.now() - moved > 3500;
      if (p.ayah !== lastAyah) {
        lastAyah = p.ayah;
        if (p.through && free) followAyah(p.ayah);
      } else if (w && free && w === wordEl) followWord(w);
    };
    paint(usePlayer.getState());
    const off = usePlayer.subscribe((p, prev) => (p.ayah !== prev.ayah || p.word !== prev.word || p.on !== prev.on || p.playing !== prev.playing) && paint(p));
    return () => {
      off();
      inputs.forEach((t) => sc.removeEventListener(t, touched));
      ayahEls.forEach((e) => e.classList.remove("is-reciting"));
      wordEl?.classList.remove("reciting-word");
    };
  }, [data, surahN, settings.view, bookMode, scrollToAyah]);

  /* ── scrolling freely, an ayah above the frame that is not laid out (or is laid out as it
     comes near, or let go as it moves away) can change from the height it held to its own:
     the page moves by the difference before it is drawn, so what the reader sees stays still
     (the browser's own anchoring is off here, and Safari has none). The one-ayah view keeps its
     place its own way (below). Ayahs laid out on both
     sides of a change are left to their own code (the context switch keeps its place). ── */
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !data || bookMode) return;
    const secs = sc.querySelectorAll<HTMLElement>("section[data-key]");
    const height = new Map<Element, number>();
    const laid = new Map<Element, boolean>();
    const isLaid = (el: HTMLElement) => {
      const c = el.firstElementChild as HTMLElement | null;
      return !c || typeof c.checkVisibility !== "function" || c.checkVisibility({ contentVisibilityAuto: true });
    };
    // how fast the page is moving: a quick glide (a flick let go, a hard turn of a trackpad) is left
    // to glide, not moved under it (a phone stops its glide dead when the page is moved under it, the
    // way it felt to hit something); an ayah laid out above it then moves what is seen a little, unseen
    let lastY = sc.scrollTop, lastT = 0, speed = 0, fingers = 0, flung = false;
    const onScroll = () => {
      const now = performance.now(), dt = now - lastT;
      if (dt > 160) flung = false; // (a glide that had stopped: this is new movement)
      if (dt > 0 && dt < 200) speed = 0.6 * speed + 0.4 * (Math.abs(sc.scrollTop - lastY) / dt);
      else speed = 0;
      lastY = sc.scrollTop;
      lastT = now;
    };
    const touch = (e: TouchEvent) => {
      fingers = e.touches.length;
      flung = !fingers && e.type !== "touchstart";
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    sc.addEventListener("touchstart", touch, { passive: true });
    sc.addEventListener("touchend", touch, { passive: true });
    sc.addEventListener("touchcancel", touch, { passive: true });
    // (a finger's glide, from when it lifts until the page is still, at any speed; a wheel's, when quick)
    const gliding = () => fingers === 0 && performance.now() - lastT < 140 && (speed > 0.5 || flung);
    const ro = new ResizeObserver((entries) => {
      const flow = sc.classList.contains("flow");
      const top = sc.scrollTop;
      let moved = 0, shift = 0;
      const els = entries.map((e) => e.target as HTMLElement).sort((a, b) => a.offsetTop - b.offsetTop);
      for (const el of els) {
        const h = el.offsetHeight, was = height.get(el);
        const now = isLaid(el), before = laid.get(el);
        height.set(el, h);
        laid.set(el, now);
        if (was === undefined || before === undefined || h === was) continue;
        // where it began before the ones above it changed this frame
        if (flow && !(before && now) && el.offsetTop - moved < top) shift += h - was;
        moved += h - was;
      }
      if (shift && !gliding()) sc.scrollTop = top + shift;
    });
    secs.forEach((s) => ro.observe(s));
    return () => {
      ro.disconnect();
      sc.removeEventListener("scroll", onScroll);
      sc.removeEventListener("touchstart", touch);
      sc.removeEventListener("touchend", touch);
      sc.removeEventListener("touchcancel", touch);
    };
  }, [data, bookMode]);

  /* ── one ayah at a time: the reader stays on the ayah they are reading, at the same place in it,
     whatever changes height (the context switched on or off, a long ayah above laid out, an ayah
     built). The page is moved by the reader's hand here (pager.ts), and the browser's own anchoring
     is off: nothing else would keep it. ── */
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !data || settings.view !== 1) return;
    const items = () => sc.querySelectorAll<HTMLElement>("[data-n]");
    // the ayah at the top of the frame, and how far into it the reader has scrolled
    // (within: the reader was inside the ayah's own length, reading down a long one, not on the
    // way from it to the next)
    let anchor: { el: HTMLElement; off: number; within: boolean } | null = null;
    const note = () => {
      const y = sc.scrollTop + 2;
      let cur: HTMLElement | null = null;
      for (const el of items()) {
        if (yOf(el) <= y) cur = el;
        else break;
      }
      const off = cur ? sc.scrollTop - yOf(cur) : 0;
      anchor = cur ? { el: cur, off, within: off <= Math.max(0, cur.offsetHeight - sc.clientHeight) + 1 } : null;
    };
    // the place is taken again only from the reader's own scrolling (a finger, the wheel, the keys,
    // and the glide or snap that follows), or when the page moves them itself (anchorNow): never
    // from the page keeping its place, whose steps can each be a little off (Safari) and would be
    // taken up as the place, adding up until the reader is on another ayah
    let placing = false;
    let theirs = 0;
    let held = false; // (a finger or a button down: all the scrolling is theirs, an edge's autoscroll too)
    const touched = () => (theirs = performance.now() + 1200);
    const press = () => ((held = true), touched());
    // (a press let go: the glide after it is theirs, if the press was on the page: a release elsewhere,
    // after the slider say, is not)
    const lift = () => {
      if (!held) return;
      held = false;
      touched();
    };

    const onScroll = () => {
      if (placing) return;
      // moved by nothing of the reader's: a small shift (the browser's own, as heights change above)
      // put back on their place, as the snapping used to; a jump (the browser's find, say) kept
      if (!held && performance.now() > theirs) {
        const want = wanted();
        if (want != null && Math.abs(sc.scrollTop - want) < sc.clientHeight * 0.5) return place();
      }
      theirs = Math.max(theirs, performance.now() + 250); // (a glide carrying on)
      note();
    };
    const inputs = ["touchstart", "touchmove", "wheel", "keydown", "pointerdown"] as const;
    inputs.forEach((t) => sc.addEventListener(t, touched, { passive: true }));
    sc.addEventListener("pointerdown", press, { passive: true });
    sc.addEventListener("touchstart", press, { passive: true });
    window.addEventListener("pointerup", lift, { passive: true });
    window.addEventListener("pointercancel", lift, { passive: true });
    window.addEventListener("touchend", lift, { passive: true });
    window.addEventListener("touchcancel", lift, { passive: true });
    anchorNow.current = note;
    anchorFollow.current = (ms) => (theirs = Math.max(theirs, performance.now() + ms));
    // where the place noted puts the page now: reading down a long ayah that has grown shorter, kept
    // within it; on the way from one ayah to the next (a swipe under way, the next one laying itself
    // out), exactly where the finger has it, never pulled back to the top of the one being left
    const wanted = () => {
      const a = anchor;
      if (!a || !a.el.isConnected) return null;
      const room = Math.max(0, a.el.offsetHeight - sc.clientHeight);
      return yOf(a.el) + (a.within ? Math.min(Math.max(0, a.off), room) : a.off);
    };
    const place = () => {
      const want = wanted();
      if (want == null || Math.abs(sc.scrollTop - want) < 1) return;
      placing = true;
      sc.scrollTop = want;
      anchor!.off = want - yOf(anchor!.el);
      requestAnimationFrame(() => (placing = false));
    };
    const ro = new ResizeObserver(place);
    const offHeights = onAyahHeights(place);
    sc.querySelectorAll("section[data-key]").forEach((s) => ro.observe(s));
    note();
    sc.addEventListener("scroll", onScroll, { passive: true });

    // and moved by the reader's own hand: a finger, the wheel, the keys (pager.ts)
    const pager = createPager(sc, {
      touch: matchMedia("(pointer: coarse)").matches,
      reduce: () => useStore.getState().settings.reduceMotion,
      settled: () => note(),
      moving: () => (theirs = Math.max(theirs, performance.now() + 300)), // (its glides are the reader's)
      selecting: () => !!document.querySelector(".touch-pick"),
    });
    pagerRef.current = pager;
    return () => {
      pager.destroy();
      pagerRef.current = null;
      anchorNow.current = () => {};
      anchorFollow.current = () => {};
      ro.disconnect();
      offHeights();
      sc.removeEventListener("scroll", onScroll);
      inputs.forEach((t) => sc.removeEventListener(t, touched));
      sc.removeEventListener("pointerdown", press);
      sc.removeEventListener("touchstart", press);
      window.removeEventListener("pointerup", lift);
      window.removeEventListener("pointercancel", lift);
      window.removeEventListener("touchend", lift);
      window.removeEventListener("touchcancel", lift);
    };
  }, [data, settings.view, bookMode]);

  /* ── switching between one ayah and the multiple-ayah view: the page fades
     out, changes its layout while it cannot be seen, keeps the same ayah at the
     top, and fades back in once the long ayahs have settled their size. The
     context on and off in the multiple-ayah view fades through the same way
     (in the one-ayah view the ayah crossfades it by itself). ── */
  const fadeOut = useRef<Animation | null>(null);
  const fadeThen = useCallback(async (apply: () => void) => {
    const sc = scroller.current;
    if (sc && !useStore.getState().settings.reduceMotion) {
      fadeOut.current?.cancel();
      const a = sc.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 180,
        easing: "cubic-bezier(0.4, 0, 1, 1)",
        fill: "forwards",
      });
      fadeOut.current = a;
      await a.finished.catch(() => {});
    }
    apply();
  }, []);
  const switchView = useCallback(
    (v: 1 | 3) => {
      if (useStore.getState().settings.view !== v) fadeThen(() => set({ view: v }));
    },
    [fadeThen, set],
  );
  const setMode = useCallback((p: Partial<Settings>) => fadeThen(() => set(p)), [fadeThen, set]);

  /* the context switched on or off: every ayah near the frame changes height. Where the reader is
     (the ayah at the top of the frame, and how far into it) is noted at the press, and kept while
     the ayahs settle their new heights; switched again before they have, the place first noted is
     the one kept. The reader scrolling lets it go. */
  const ctxKeep = useRef<{ n: number; off: number; frac: number } | null>(null);
  const placeKept = useRef<() => void>(() => {});
  // the place set again whenever an ayah changes height (after the page is laid out, before it is
  // drawn: no frame shows another ayah), and each frame while it is held (below)
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !data || settings.view !== 3) return;
    placeKept.current = () => {
      const k = ctxKeep.current;
      const el = k && sc.querySelector<HTMLElement>(`[data-n="${k.n}"]`);
      if (!k || !el) return;
      // the same part of the ayah: as far into it, in proportion (its words came or went)
      const want = yOf(el) + (k.off < 4 ? 0 : Math.round(k.frac * el.offsetHeight));
      if (Math.abs(sc.scrollTop - want) > 1) sc.scrollTop = want;
    };
    const ro = new ResizeObserver(() => placeKept.current());
    sc.querySelectorAll("[data-n]").forEach((el) => ro.observe(el));
    const offHeights = onAyahHeights(() => placeKept.current());
    return () => {
      ro.disconnect();
      offHeights();
      placeKept.current = () => {};
    };
  }, [data, settings.view, bookMode]);
  const toggleContext = useCallback(() => {
    // (at once, from the state as it is now: quick presses each count)
    set({ showContext: !useStore.getState().settings.showContext });
  }, [set]);
  const seen = useRef({ view: settings.view, ctx: settings.showContext });
  useLayoutEffect(() => {
    const was = seen.current;
    seen.current = { view: settings.view, ctx: settings.showContext };
    const sc = scroller.current;
    if (!sc) return;
    if (was.view === settings.view) {
      if (was.ctx === settings.showContext) return;
      // (the one-ayah view keeps its place itself: its anchor, above)
      if (settings.view !== 3) return;
      // the words settling in softly; the reader held where they were (the place noted just before)
      if (!settings.reduceMotion && settings.translation === "qme" && settings.readingMode !== "arabic")
        sc.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 320, easing: "cubic-bezier(0, 0, 0.2, 1)" });
      if (!ctxKeep.current && spot.current) ctxKeep.current = { ...spot.current };
      placeKept.current();
      // held until the reader scrolls, or the ayahs out of sight have all changed (Ayah.tsx: a few
      // at a time, nearest first, within about a second of the switch)
      const letGo = () => {
        ctxKeep.current = null;
      };
      const opts = { passive: true } as const;
      sc.addEventListener("wheel", letGo, opts);
      sc.addEventListener("touchstart", letGo, opts);
      sc.addEventListener("pointerdown", letGo, opts);
      sc.addEventListener("keydown", letGo);
      const timer = window.setTimeout(letGo, 2600);
      let raf = requestAnimationFrame(function hold() {
        placeKept.current();
        if (ctxKeep.current) raf = requestAnimationFrame(hold);
      });
      fadeOut.current?.cancel();
      fadeOut.current = null;
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
        sc.removeEventListener("wheel", letGo);
        sc.removeEventListener("touchstart", letGo);
        sc.removeEventListener("pointerdown", letGo);
        sc.removeEventListener("keydown", letGo);
      };
    }
    ctxKeep.current = null;
    const place = () => {
      const n = activeRef.current;
      const el = sc.querySelector<HTMLElement>(`[data-n="${n}"]`);
      if (!el) return;
      let top = yOf(el);
      // scrolling freely, the last ayahs rest with the surah's end at the foot of the frame (as a
      // jump does): the closing page is not half brought in, to be snapped on into
      if (settings.view === 3 && n > 0) {
        const pages = sc.querySelectorAll<HTMLElement>("[data-n]");
        const closing = pages[pages.length - 1];
        if (closing && closing !== el) top = Math.min(top, closing.offsetTop - sc.clientHeight);
      }
      sc.scrollTop = Math.max(0, top);
      anchorNow.current();
    };
    place();
    if (settings.reduceMotion) {
      fadeOut.current?.cancel();
      fadeOut.current = null;
      return;
    }
    // hidden until it is laid out (a change from the settings panel has had no fade-out)
    sc.style.opacity = "0";
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        place();
        sc.style.opacity = "";
        sc.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], {
          duration: 420,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        });
        fadeOut.current?.cancel();
        fadeOut.current = null;
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [settings.view, settings.showContext, settings.reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // the player shown in the foot (the context switch beside it shorter on a phone)
  const playerOn = usePlayer((p) => p.on);
  const partPlaying = usePlayer((p) => p.on && p.part && (p.playing || p.loading));
  // the ayah of this surah being recited (its button shows a pause)
  const recitingAyah = usePlayer((p) => (p.on && !p.part && p.surah === surahN && (p.playing || p.loading) ? p.ayah : 0));

  const verse: Verse | null = data && active >= 1 ? data.v[active - 1] ?? null : null;
  const theme = data && active >= 1 ? data.themes[active - 1] : null;

  useEffect(() => {
    if (!data) return;
    const a = Math.min(data.v.length, Math.max(1, active)); // (the closing page is the last ayah's)
    const t = setTimeout(() => {
      history.replaceState(null, "", `#/${surahN}/${a}`);
      setLast(surahN, a);
    }, 400);
    return () => clearTimeout(t);
  }, [active, surahN, data, setLast]);

  /* ── navigation ─────────────────────────────────────────────── */
  const go = useCallback(
    (s: number, a: number) => {
      setPanel(null);
      setMenu(null);
      if (s === surahN && data) {
        scrollToAyah(a);
      } else {
        target.current = { ayah: a, smooth: false };
        setActive(a);
        setSurahN(s);
      }
    },
    [surahN, data, scrollToAyah],
  );

  const onPick = (r: Result) => {
    if (r.kind === "surah") go(r.surah.n, 1);
    else go(r.surah.n, r.ayah);
  };

  /* ── helpers ────────────────────────────────────────────────── */
  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 1800);
  }, []);

  // what gets copied: the ayah, its translation and the reference — no translation name
  const ayahText = useCallback(
    (v: Verse) => `${arabicText(v, settings.script)}\n\n${translationText(v, settings.translation, settings.showContext)}\n\n— ${ayn(surah.tc)} ${surahN}:${v.n}`,
    [settings.translation, settings.showContext, settings.script, surah, surahN],
  );

  const newNote = useCallback(
    (key: string, extra?: { hid?: string; quote?: string; kind?: "text" | "voice"; audio?: string; dur?: number }) => {
      const fr = rootRef.current?.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const size = mobile ? 190 : 232;
      const existing = Object.values(useStore.getState().notes).filter((n) => n.key === key && !n.docked).length;
      const x = mobile ? (vw - size) / 2 / vw : ((fr ? fr.right : vw * 0.88) - size * 0.55 - existing * 26) / vw;
      const y = ((fr ? fr.top : vh * 0.12) + 40 + existing * 30) / vh;
      const id = uid();
      addNote({ id, key, text: "", x, y, rot: Math.round((Math.random() * 6 - 3) * 10) / 10, at: Date.now(), ...extra });
      if (extra?.kind !== "voice") setFocusNote(id);
    },
    [addNote, mobile],
  );

  // an ayah brought up beside the page, for the ayah `bringUp.key`: by the frame's right side (on a
  // phone, across the middle), a little lower for each already there
  const closeBringUp = useCallback(() => setBringUp(null), []);
  const bringUpAyah = useCallback(
    (s: number, a: number) => {
      const b = bringUp;
      setBringUp(null);
      if (!b) return;
      const fr = rootRef.current?.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(340, vw - 32);
      const n = Object.values(useStore.getState().windows).filter((x) => x.key === b.key).length;
      const x = mobile ? (vw - w) / 2 : Math.min(vw - w - 16, (fr ? fr.right : vw) - w - 64 - n * 22);
      const y = (fr ? fr.top : 0) + (mobile ? 96 : 76) + n * 28;
      useStore.getState().addWindow({ id: uid(), key: b.key, s, a, x: x / vw, y: y / vh, tie: null, at: Date.now() });
      sfx("lift");
    },
    [bringUp, mobile],
  );
  // gone to the ayah a window shows: the way back, for a while
  const [cameFrom, setCameFrom] = useState<{ s: number; a: number } | null>(null);
  const jumpFrom = useCallback(
    (w: { s: number; a: number }) => {
      setCameFrom({ s: surahN, a: Math.max(1, activeRef.current) });
      go(w.s, w.a);
    },
    [surahN, go],
  );
  useEffect(() => {
    if (!cameFrom) return;
    const t = window.setTimeout(() => setCameFrom(null), 120000);
    return () => window.clearTimeout(t);
  }, [cameFrom]);

  const openShare = useCallback(
    (v: Verse) =>
      setShare({
        arabic: arabicText(v, settings.script),
        translation: translationText(v, settings.translation, false),
        surahName: surah.tc,
        ref: `${surahN}:${v.n}`,
        url: `${location.origin}${location.pathname}#/${surahN}/${v.n}`,
        surah: surahN,
        script: settings.script,
        theme: settings.theme,
      }),
    [settings.translation, settings.script, settings.theme, surah, surahN],
  );

  // a part of an ayah (a highlight): the part, with the other side's words to choose from (Share.tsx)
  const openSharePart = useCallback(
    (h: Highlight) => {
      const n = Number(h.key.split(":")[1]);
      const v = data?.v[n - 1];
      if (!v) return;
      const tr = h.field === "ar" || h.field === "seerah" ? settings.translation : h.field;
      const whole = translationText(v, tr, false);
      const trWords = whole.split(/\s+/).filter(Boolean);
      const aw = arabicWords(v, settings.script);
      const base = {
        surahName: surah.tc,
        ref: `${surahN}:${n}`,
        url: `${location.origin}${location.pathname}#/${surahN}/${n}`,
        surah: surahN,
        script: settings.script,
        theme: settings.theme,
      } as const;
      if (h.field === "ar") {
        // the words the highlight touches (a highlight can begin or end inside a word)
        let idx = aw.words.filter((w) => w.end > h.start && w.start < h.end).map((w) => w.i);
        if (!idx.length) idx = [0, aw.words.length - 1];
        const span: [number, number] = [Math.min(...idx), Math.max(...idx)];
        const guess = translationFor(v.m, span, trWords) ?? inProportion([span[0], span[1] + 1], aw.words.length, trWords.length);
        setShare({ ...base, arabic: h.text, translation: whole, part: { side: "ar", other: trWords, guess } });
      } else {
        const other = aw.words.map((w) => w.text);
        const len = translationPieces(v, tr).canon.length;
        const guess = arabicFor(v.m, h.text) ?? inProportion([h.start, h.end], len, other.length);
        setShare({ ...base, arabic: arabicText(v, settings.script), translation: spellHonorifics(h.text), part: { side: "tr", other, guess } });
      }
    },
    [data, settings.translation, settings.script, settings.theme, surah, surahN],
  );

  // one function for the life of the reader, so the ayahs (memoised) don't redraw each time it would change
  const actionImpl = useRef<(a: AyahAction, v: Verse, anchor?: HTMLElement) => void>(() => {});
  const onAction = useCallback((a: AyahAction, v: Verse, anchor?: HTMLElement) => actionImpl.current(a, v, anchor), []);
  actionImpl.current = async (a: AyahAction, v: Verse, anchor?: HTMLElement) => {
    const key = `${surahN}:${v.n}`;
    if (a === "bookmark") {
      const was = !!useStore.getState().bookmarks[key];
      toggleBookmark(key);
      flash(was ? `Bookmark removed · ${key}` : `Bookmarked ${key}`);
      if (was) setFolderPop((p) => (p?.key === key ? null : p));
      else if (Object.keys(useStore.getState().folders).length) {
        const r = anchor?.getBoundingClientRect();
        setFolderPop({ key, x: r ? r.left + r.width / 2 : lastPt.current.x, y: r ? r.top + r.height / 2 : lastPt.current.y });
      }
    } else if (a === "copy") {
      (await copyText(ayahText(v))) ? flash(`Copied ${key}`) : flash("Copy was blocked by the browser");
    } else if (a === "share") {
      openShare(v);
    } else if (a === "note") {
      newNote(key);
    } else if (a === "voice") {
      const r = anchor?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
      setRecorder({ key, anchor: r });
    } else if (a === "context") {
      toggleContext();
    } else if (a === "recite") {
      const p = usePlayer.getState();
      if (p.on && !p.part && p.surah === surahN && p.ayah === v.n && (p.playing || p.loading)) togglePlayer();
      else {
        audio.current?.pause();
        recite(surahN, v.n);
      }
    } else if (a === "window") {
      const r = anchor?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
      setBringUp({ key, x: r.left, y: r.top });
    } else if (a === "tafsir") {
      setTafsir({ s: surahN, a: v.n });
    }
  };

  /* ── highlighting: select text, get a yellow highlight ──────── */
  // below: the menu opens under the highlight, leaving the word's meaning above it in view
  const openMenuFor = (id: string, below = false, fresh = false) => {
    requestAnimationFrame(() => {
      const marks = rootRef.current?.querySelectorAll<HTMLElement>(`mark[data-hid="${id}"]`);
      if (!marks?.length) return;
      if (fresh && !settings.reduceMotion) {
        // the marker drawn across: the new highlight sweeps in along the line
        marks.forEach((m) => {
          m.classList.remove("fresh");
          void m.offsetWidth;
          m.classList.add("fresh");
          window.setTimeout(() => m.classList.remove("fresh"), 700);
        });
      }
      const r1 = marks[0].getBoundingClientRect();
      const r2 = marks[marks.length - 1].getBoundingClientRect();
      const x = Math.max(150, Math.min(window.innerWidth - 150, (r1.left + r2.right) / 2 || r1.left + r1.width / 2));
      setMenu({ id, at: { x, y: Math.min(r1.top, r2.top), bottom: Math.max(r1.bottom, r2.bottom), below } });
    });
  };

  // the words selected, by the browser (a mouse) or by the site's own touch selection (given)
  const onSelectEnd = (given?: unknown) => {
    setTimeout(() => {
      const sel = window.getSelection();
      let range: Range;
      if (given instanceof Range) range = given;
      else if (sel && !sel.isCollapsed && sel.rangeCount) range = sel.getRangeAt(0);
      else return;
      if (!data) return;
      const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const field = startEl?.closest<HTMLElement>("[data-field]");
      if (!field || !rootRef.current?.contains(field)) return;
      // (as a book an ayah's Arabic is a piece on each line it runs over: all of them are the ayah)
      const book = field.dataset.field === "ar" ? field.closest<HTMLElement>(".book") : null;
      const pieces = book ? [...book.querySelectorAll<HTMLElement>(`[data-field="ar"][data-key="${field.dataset.key}"]`)] : [field];
      if (!pieces.some((p) => p.contains(range.endContainer))) {
        const lastPiece = pieces[pieces.length - 1];
        if (range.comparePoint(lastPiece, lastPiece.childNodes.length) <= 0 || !book) range.setEnd(lastPiece, lastPiece.childNodes.length);
      }
      const key = field.dataset.key!;
      const fieldName = field.dataset.field as Exclude<HighlightField, "seerah">; // (the reader's: an ayah's)
      const v = data.v[Number(key.split(":")[1]) - 1];
      if (!v) return;
      let off: [number, number] | null;
      let canon: string;
      let aw: ReturnType<typeof arabicWords> | null = null;
      if (fieldName === "ar") {
        aw = arabicWords(v, settings.script);
        canon = aw.canon;
        off = rangeToArabicWords(range, pieces, aw.words); // whole words, in either script
      } else {
        canon = translationPieces(v, fieldName).canon;
        off = rangeToOffsets(range, field);
        if (off) off = snapToLatinWords(canon, trimRange(canon, off));
      }
      if (!off) return;
      const [s, e] = off;
      if (e - s < 1) return;
      // a highlight of its own, even over another: it joins those of its colour once its colour
      // is settled (the menu closes), and where colours differ both stay, their inks combined
      const id = uid();
      // the text kept with the highlight is what was shown (the Arabic in the script being read; the
      // translation as it reads, its bracketed context only if it was showing)
      const text = aw ? aw.words.filter((w) => w.start >= s && w.end <= e).map((w) => w.text).join(" ") : shownSlice(translationPieces(v, fieldName as Translation).pieces, settings.showContext, s, e);
      addHighlight({ id, key, field: fieldName, start: s, end: e, color: "yellow", text, at: Date.now() });
      sel?.removeAllRanges();
      strokeEnd();
      const snd = useStore.getState().settings;
      if (snd.sound && snd.sounds && !strokeRecently()) playHighlight(Math.min(1, text.length / 120));
      openMenuFor(id, false, true);
    }, 10);
  };
  const selectEnd = useRef(onSelectEnd);
  selectEnd.current = onSelectEnd;

  // a touch screen selects words the site's own way: a press held on a word, then drawn across
  const touchPick = useTouchSelect({ root: rootRef, scroller, scrollsFreely: settings.view === 3, onDone: (r) => selectEnd.current(r) });

  /* the marker heard as it is drawn: while a selection in the ayahs grows or shrinks under a
     mouse (or a phone's handles), a felt-tip sound follows it */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onPhone = matchMedia("(pointer: coarse)").matches;
    let down = false;
    let len = 0;
    const press = (e: MouseEvent) => {
      down = e.button === 0 && !!(e.target as HTMLElement).closest("[data-field]");
      len = 0;
    };
    const lift = () => {
      down = false;
      strokeEnd();
    };
    const change = () => {
      const snd = useStore.getState().settings;
      if (!snd.sound || !snd.sounds) return;
      const sel = window.getSelection();
      const inside = !!sel && !sel.isCollapsed && root.contains(sel.anchorNode) && !!(sel.anchorNode?.parentElement?.closest("[data-field]"));
      if (!inside) {
        len = 0;
        return;
      }
      if (!down && !onPhone) return; // a phone's selection moves under its handles, not a pressed mouse
      const n = sel!.toString().length;
      if (n !== len) strokeMove(Math.abs(n - len));
      len = n;
    };
    root.addEventListener("mousedown", press);
    window.addEventListener("mouseup", lift);
    document.addEventListener("selectionchange", change);
    return () => {
      root.removeEventListener("mousedown", press);
      window.removeEventListener("mouseup", lift);
      document.removeEventListener("selectionchange", change);
      strokeEnd();
    };
  }, []);

  /* on a touch screen, the highlight waits until the selection has stopped changing
     (the handles can be dragged to widen it first), the way a phone's own text does */
  const touching = useRef(false);
  useEffect(() => {
    if (!matchMedia("(pointer: coarse)").matches) return;
    let t = 0;
    const settle = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const sel = window.getSelection();
        if (touching.current || !sel || sel.isCollapsed || !rootRef.current?.contains(sel.anchorNode)) return;
        selectEnd.current();
      }, 700);
    };
    const down = () => (touching.current = true);
    const up = () => {
      touching.current = false;
      settle();
    };
    document.addEventListener("selectionchange", settle);
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchend", up, { passive: true });
    document.addEventListener("touchcancel", up, { passive: true });
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("selectionchange", settle);
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchend", up);
      document.removeEventListener("touchcancel", up);
    };
  }, []);

  const onFrameClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    // read as a book: an ayah's number opens its tools
    const end = t.closest<HTMLElement>("[data-ayah-end]");
    if (end && data) {
      const v = data.v[Number(end.dataset.ayahEnd) - 1];
      if (!v) return;
      const key = `${surahN}:${v.n}`;
      const I = (n: React.ReactNode) => <span className="flex w-4 justify-center">{n}</span>;
      const marked = !!useStore.getState().bookmarks[key];
      openMenu(e.clientX, e.clientY, [
        { type: "label", label: `Ayah ${key}` },
        { type: "item", label: marked ? "Remove bookmark" : "Bookmark", icon: I(<Bookmark size={14} />), onSelect: () => onAction("bookmark", v) },
        { type: "item", label: "Tafsir as-Sa'di", icon: I(<BookOpenText size={14} />), onSelect: () => onAction("tafsir", v) },
        { type: "item", label: "Bring up another ayah", icon: I(<PictureInPicture2 size={14} />), onSelect: () => onAction("window", v, end) },
        { type: "item", label: "Write a note", icon: I(<NoteGlyph size={14} />), onSelect: () => onAction("note", v) },
        { type: "item", label: "Record a voice note", icon: I(<Mic size={14} />), onSelect: () => onAction("voice", v, end) },
        { type: "item", label: "Copy", icon: I(<Copy size={14} />), onSelect: () => onAction("copy", v) },
        { type: "item", label: "Share", icon: I(<Share2 size={14} />), onSelect: () => onAction("share", v) },
      ]);
      return;
    }
    const mark = t.closest<HTMLElement>("mark.hl");
    const word = t.closest<HTMLElement>(".word");
    const coarse = matchMedia("(pointer: coarse)").matches;
    // a highlighted word is still a word: it is heard and explained, and its highlight's
    // menu opens below it so the meaning above stays readable
    if (mark && !word) {
      const gl = t.closest<HTMLElement>(GLOSSED);
      if (gl && coarse) showGloss(gl);
      openMenuFor(mark.dataset.hid!, !!gl);
      return;
    }
    if (mark) openMenuFor(mark.dataset.hid!, true);
    if (word && data) {
      const key = word.closest<HTMLElement>("[data-key]")!.dataset.key!;
      const [s, a] = key.split(":").map(Number);
      const w = Number(word.dataset.w) + 1;
      try {
        audio.current?.pause();
        if (usePlayer.getState().playing) togglePlayer(); // (the recitation pauses for the word)
        audio.current = new Audio(`https://audio.qurancdn.com/wbw/${pad3(s)}_${pad3(a)}_${pad3(w)}.mp3`);
        audio.current.play().catch(() => {});
      } catch {
        /* audio unavailable */
      }
      if (matchMedia("(pointer: coarse)").matches) showTip(word);
      return;
    }
    // touch: tap a glossary term to read its meaning
    const gl = t.closest<HTMLElement>(GLOSSED);
    if (gl && matchMedia("(pointer: coarse)").matches) showGloss(gl);
  };

  const showTip = (word: HTMLElement) => {
    if (!data) return;
    const key = word.closest<HTMLElement>("[data-key]")?.dataset.key;
    if (!key) return;
    const v = data.v[Number(key.split(":")[1]) - 1];
    const i = Number(word.dataset.w);
    const r = word.getBoundingClientRect();
    setTip({ x: r.left, y: r.top, w: r.width, h: r.height, meaning: v.m[i], translit: v.t[i], ref: `${key}:${i + 1}`, arabic: v.a[i] });
  };

  // a term of the translation (Taqwa, Kuffaar…) explained by the translation's glossary; ﷺ spelled out
  const showGloss = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const hon = el.dataset.hon;
    if (hon && HONORIFICS[hon]) {
      setTip({ x: r.left, y: r.top, w: r.width, h: r.height, ref: `hon:${hon}`, gloss: { term: HONORIFICS[hon].show, text: HONORIFICS[hon].meaning, saw: true } });
      return;
    }
    const g = (el.dataset.gloss && glossByTerm(el.dataset.gloss)) || glossFor(el.textContent ?? "");
    if (g) setTip({ x: r.left, y: r.top, w: r.width, h: r.height, ref: `gl:${g.term}`, gloss: g });
  };

  const onOver = (e: React.MouseEvent) => {
    if (matchMedia("(pointer: coarse)").matches) return;
    const t = e.target as HTMLElement;
    const gl = t.closest<HTMLElement>(GLOSSED);
    if (gl) {
      tipHover.stay();
      return showGloss(gl);
    }
    if (!settings.wordHover) return;
    const word = t.closest<HTMLElement>(".word");
    if (word) showTip(word);
  };
  const onOut = (e: React.MouseEvent) => {
    const from = (e.target as HTMLElement).closest(`.word, ${GLOSSED}`);
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.(`.word, ${GLOSSED}`);
    if (!from || from === to) return;
    // straight from the term into its meaning (the browser tells the box first, then the term): it stays
    if ((e.relatedTarget as HTMLElement | null)?.closest?.("[data-tip]")) return tipHover.stay();
    // a term's meaning stays a moment, so the pointer can go into it (to follow a "see …")
    if (from.matches(GLOSSED)) tipHover.leave(closeTip);
    else setTip(null);
  };


  /* ── focus: nothing but the Qur'an. The frame fills the screen (and the browser goes full
     screen where it can); the header, footer, slider and tabs go; the ayahs, their meanings,
     highlights, notes and their own buttons stay ── */
  const enterFocus = useCallback((on: boolean) => {
    if (useUI.getState().focus === on) return;
    reflowFor(on);
    setPanel(null);
    setMenu(null);
    const el = document.documentElement;
    if (on && !document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    // the browser's own way out of full screen (its Esc) leaves focus too
    const on = () => {
      if (!document.fullscreenElement && useUI.getState().focus) reflowFor(false);
      // the window itself changing size (full screen coming or going) as the frame moves: the page
      // waits for that too
      else if (useUI.getState().reflow) settleReflow(260);
    };
    document.addEventListener("fullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      useUI.getState().setFocus(false); // leaving the reader leaves focus
      useUI.getState().setPeek(null);
    };
  }, []);

  // the page goes quiet while the frame moves into focus (or out), and comes back laid out once, on
  // the ayah it was on
  const reflow = useUI((s) => s.reflow);
  const reflowFade = useRef<Animation | null>(null);
  const reflowAt = useRef(0);
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    if (reflow) {
      reflowAt.current = activeRef.current;
      if (!settings.reduceMotion) reflowFade.current = sc.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
      return;
    }
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const el = sc.querySelector<HTMLElement>(`[data-n="${reflowAt.current}"]`);
        if (el && settings.view === 1) sc.scrollTop = el.offsetTop;
        anchorNow.current();
        if (!reflowFade.current) return;
        reflowFade.current.cancel();
        reflowFade.current = null;
        sc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "cubic-bezier(0, 0, 0.2, 1)", fill: "backwards" });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [reflow]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── keyboard (a computer's): every button's action has its key, listed in Settings → Guide.
     The handler is set each render (below, keysNow), so it acts on the page as it is now ── */
  const keysNow = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const on = (e: KeyboardEvent) => keysNow.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  /* ── derived ────────────────────────────────────────────────── */
  const hlByKey = useMemo(() => {
    const m = new Map<string, Highlight[]>();
    for (const h of Object.values(allHighlights)) {
      if (!h.key.startsWith(`${surahN}:`)) continue;
      const list = m.get(h.key) ?? [];
      list.push(h);
      m.set(h.key, list);
    }
    return m;
  }, [allHighlights, surahN]);
  const [notesByKey, voicesByKey] = useMemo(() => {
    const t = new Map<string, number>(), v = new Map<string, number>();
    for (const n of Object.values(allNotes)) {
      const m = n.kind === "voice" ? v : t;
      m.set(n.key, (m.get(n.key) ?? 0) + 1);
    }
    return [t, v];
  }, [allNotes]);

  // notes float over the frame for the ayahs being read
  const visibleKeys = useMemo(() => {
    const keys = new Set<string>();
    if (active < 1 || panel || flipped) return keys;
    const upto = settings.view === 3 ? Math.max(active, lastShown) : active;
    for (let a = active; a <= upto; a++) keys.add(`${surahN}:${a}`);
    return keys;
  }, [active, lastShown, settings.view, surahN, panel, flipped]);
  // the ayahs brought up beside the page, as the ayahs they belong to are; the notes stuck on them with them
  const visibleWindows = Object.values(allWindows).filter((w) => visibleKeys.has(w.key));
  const shownWins = new Set(visibleWindows.map((w) => w.id));
  const visibleNotes = Object.values(allNotes).filter((n) => (n.win && allWindows[n.win] ? shownWins.has(n.win) : visibleKeys.has(n.key)));
  const EMPTY: Highlight[] = useMemo(() => [], []);

  // what the ayahs are drawn with: a setting they don't use (mood, box, grain…) doesn't redraw them
  const ayahSettings = useMemo(
    () => settings,
    AYAH_KEYS.map((k) => settings[k]), // eslint-disable-line react-hooks/exhaustive-deps
  );
  // the context switch reaches the ayahs in the frame at once; the rest of a long surah follow once
  // the crossfade has played, in pieces React can pause, so it never stalls on them
  const [lagged, setLagged] = useState(ayahSettings);
  const onlyContext = (a: typeof settings, b: typeof settings) => AYAH_KEYS.every((k) => k === "showContext" || a[k] === b[k]);
  useEffect(() => {
    if (lagged === ayahSettings) return;
    if (!onlyContext(lagged, ayahSettings)) return setLagged(ayahSettings);
    const t = setTimeout(() => startTransition(() => setLagged(ayahSettings)), 480);
    return () => clearTimeout(t);
  }, [ayahSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  const farSettings = onlyContext(lagged, ayahSettings) ? lagged : ayahSettings;

  const menuHl = menu ? allHighlights[menu.id] ?? null : null;

  // the keys (the effect above listens; this is what they do, with the page as it is now)
  keysNow.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (e.defaultPrevented || t?.closest?.("input, textarea, [contenteditable]")) return;
    const flipped = useUI.getState().flipped;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const take = () => e.preventDefault();
    // the ayah in the frame: its own buttons, pressed (their sounds, their pop-ups)
    const tool = (label: RegExp) => {
      const sc = scroller.current;
      const box = settings.view === 1 ? rootRef.current?.querySelector("[data-ayah-tools]") : sc?.querySelector(`section[data-n="${activeRef.current}"] [data-ayah-tools]`);
      [...(box?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) => label.test(b.getAttribute("aria-label") ?? ""))?.click();
    };
    // the newest highlight to be seen in the frame
    const newestInView = () => {
      const r = scroller.current?.getBoundingClientRect();
      if (!r) return null;
      let best: Highlight | null = null;
      for (const list of hlByKey.values())
        for (const h of list) {
          const m = scroller.current?.querySelector(`[data-hid="${h.id}"]`)?.getBoundingClientRect();
          if (m && m.bottom > r.top && m.top < r.bottom && (!best || h.at > best.at)) best = h;
        }
      return best;
    };
    // (a part of an ayah: its words alone, no name or number)
    const copyHl = (h: Highlight) => copyText(h.text).then((ok) => flash(ok ? "Highlight copied" : "Copy was blocked by the browser"));

    // copy: what is selected (the browser's own copy), else the highlight just made (or open), else
    // the newest highlight in the frame, else the ayah in the frame
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && k === "c") {
      const sel = window.getSelection();
      if ((sel && !sel.isCollapsed && sel.toString().trim()) || panel || flipped) return;
      take();
      const h = menuHl ?? newestInView();
      if (h) {
        copyHl(h);
        setMenu(null);
      } else {
        const v = data?.v[activeRef.current - 1];
        if (v) onAction("copy", v);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // a highlight with its menu open: its colour, its words, a note, a picture, gone
    if (menuHl && !panel) {
      const c = "12345".indexOf(k);
      if (c >= 0) return take(), useStore.getState().updateHighlight(menuHl.id, { color: HIGHLIGHT_COLORS[c] });
      if (k === "Delete" || k === "Backspace") return take(), removeHighlight(menuHl.id), setMenu(null);
      if (k === "n" && !e.shiftKey) return take(), newNote(menuHl.key, { hid: menuHl.id, quote: menuHl.text }), setMenu(null);
      if (k === "n" && e.shiftKey) {
        const at = rootRef.current?.querySelector(`[data-hid="${menuHl.id}"]`)?.getBoundingClientRect() ?? new DOMRect(innerWidth / 2, innerHeight / 2, 0, 0);
        return take(), setRecorder({ key: menuHl.key, anchor: at, hid: menuHl.id, quote: menuHl.text }), setMenu(null);
      }
      if (k === "p") return take(), openSharePart(menuHl), setMenu(null);
    }

    if (k === "Escape") {
      if (useUI.getState().focus) return enterFocus(false);
      setPanel(null);
      setMenu(null);
      if (flipped) setFlipped(false);
      return;
    }
    if (k === "/" && !panel) return take(), setPanel("search");
    if (k === "?") return take(), panel !== "guide" && wantKeys(), setPanel(panel === "guide" ? null : "guide");
    if (panel) return; // (a panel open: its own keys)
    if (k === "t") return take(), setFlipped(!flipped);
    if (flipped) return;

    // moving through the surah
    if (k === "ArrowDown" || k === "ArrowUp" || k === "PageDown" || k === "PageUp" || k === " ") {
      if (document.activeElement === scroller.current || t?.closest?.("[role=slider]")) return;
      take();
      const dir = k === "ArrowUp" || k === "PageUp" ? -1 : 1;
      // one ayah at a time, a long one is read through first: a part of it at a time (half a part
      // for the arrows), and on to the next ayah from its end
      if (settings.view === 1 && pagerRef.current) return pagerRef.current.step(dir, k === "ArrowDown" || k === "ArrowUp");
      return scrollToAyah(Math.max(0, Math.min(surah.count, activeRef.current + dir)));
    }
    if (k === "Home") return take(), scrollToAyah(0);
    if (k === "End") return take(), scrollToAyah(surah.count + 1);
    if (k === "[" && surahN > 1) return take(), go(surahN - 1, 0);
    if (k === "]" && surahN < 114) return take(), go(surahN + 1, 0);
    if (k === "i") return take(), onIndex(surahN, activeRef.current);

    // opening
    if (k === "s") return take(), setPanel("saved");
    if (k === ",") return take(), setPanel("settings");
    if (k === "r") return take(), setPanel("reflection");

    // the way of reading
    if (k === "f") return take(), enterFocus(!useUI.getState().focus);
    if (k === "v") return take(), switchView(settings.view === 1 ? 3 : 1);
    if (k === "c") return take(), toggleContext();
    if (k === "m") {
      const order = ["both", "arabic", "translation"] as const;
      return take(), setMode({ readingMode: order[(order.indexOf(settings.readingMode) + 1) % order.length] });
    }

    // the ayah in the frame: kept, written on, recorded on, given on, heard
    const now = data?.v[activeRef.current - 1];
    const tools = () => (settings.view === 1 ? rootRef.current?.querySelector<HTMLElement>("[data-ayah-tools]") : scroller.current?.querySelector<HTMLElement>(`section[data-n="${activeRef.current}"] [data-ayah-tools]`)) ?? undefined;
    if (!now) return;
    if (k === "b") return take(), tool(/bookmark/i);
    if (k === "n") return take(), onAction(e.shiftKey ? "voice" : "note", now, tools());
    if (k === "p") return take(), onAction("share", now);
    if (k === "l") return take(), onAction("recite", now);
    if (k === "o") return take(), onAction("window", now, tools());
  };

  /* when a highlight's menu closes its colour is settled: it joins every highlight of the same
     colour it overlaps or touches (their notes follow it); other colours stay their own */
  const menuWas = useRef<string | null>(null);
  useEffect(() => {
    const prev = menuWas.current;
    menuWas.current = menu?.id ?? null;
    if (!prev || prev === menu?.id || !data) return;
    const st = useStore.getState();
    const h = st.highlights[prev];
    if (!h) return;
    let s = h.start, e = h.end;
    const joined = new Set<string>();
    for (let grew = true; grew; ) {
      grew = false;
      for (const o of Object.values(st.highlights)) {
        // (not one whose own menu is open now: its colour is still being chosen)
        if (o.id === h.id || o.id === menu?.id || joined.has(o.id) || o.key !== h.key || o.field !== h.field || o.color !== h.color) continue;
        if (o.start <= e && o.end >= s) {
          s = Math.min(s, o.start);
          e = Math.max(e, o.end);
          joined.add(o.id);
          grew = true;
        }
      }
    }
    if (!joined.size) return;
    const v = data.v[Number(h.key.split(":")[1]) - 1];
    if (!v) return;
    let text: string;
    if (h.field === "ar") {
      const aw = arabicWords(v, settings.script);
      text = aw.words.filter((w) => w.start >= s && w.end <= e).map((w) => w.text).join(" ");
    } else text = translationPieces(v, h.field as Translation).canon.slice(s, e); // (the reader's highlights: an ayah's)
    for (const n of Object.values(st.notes)) if (n.hid && joined.has(n.hid)) st.updateNote(n.id, { hid: h.id });
    joined.forEach((id) => removeHighlight(id));
    st.updateHighlight(h.id, { start: s, end: e, text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.id]);

  /* ── the site's own right-click menu: what is under the pointer decides what it offers ─────
     (a note, something open over the page, a highlight, a word, an ayah, the surah's opening or
     closing page; the surah's own things after, unless the menu is already about something small) */
  const onContextMenu = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea")) return; // keep the browser's menu where people type
    if (isLongPressMenu(e.nativeEvent)) return; // a long press is the phone selecting text
    e.preventDefault();
    const I = (n: React.ReactNode) => n;
    const items: MenuItem[] = [];
    const show = () => openMenu(e.clientX, e.clientY, items);

    // a note on the page: its own things
    const noteEl = t.closest<HTMLElement>("[data-note-card]");
    const note = noteEl ? useStore.getState().notes[noteEl.dataset.noteCard!] : null;
    if (noteEl && note) {
      const voice = note.kind === "voice";
      const [ns, na] = note.key.split(":").map(Number);
      const press = (label: string) => noteEl.querySelector<HTMLElement>(`[aria-label="${label}"]`)?.click();
      items.push({ type: "label", label: `${voice ? "Voice note" : "Note"} on ${note.key}` });
      if (note.docked) items.push({ type: "item", label: "Bring it back", icon: I(<CornerDownRight size={14} />), onSelect: () => noteEl.click() });
      if (voice) {
        const playing = !!noteEl.querySelector('[aria-label="Pause"]');
        items.push({ type: "item", label: playing ? "Pause" : "Play", icon: I(playing ? <Pause size={14} /> : <Play size={14} />), onSelect: () => press(playing ? "Pause" : "Play") });
      } else items.push({ type: "item", label: "Write in it", icon: I(<NoteGlyph size={14} />), onSelect: () => noteEl.querySelector("textarea")?.focus() });
      items.push({ type: "item", label: "Share as an image", icon: I(<Share2 size={14} />), onSelect: () => useUI.getState().shareNote(note) });
      if (!(ns === surahN && na === activeRef.current)) items.push({ type: "item", label: `Go to ayah ${note.key}`, icon: I(<CornerDownRight size={14} />), onSelect: () => go(ns, na) });
      items.push({ type: "sep" });
      items.push({ type: "item", label: voice ? "Delete voice note" : "Delete note", icon: I(<Trash2 size={14} />), onSelect: () => press(voice ? "Delete voice note" : "Delete note") });
      return show();
    }

    // the highlight's colours and tools, or a word's meaning, open: only to close them
    if (t.closest('[role="toolbar"][aria-label="Highlight"], [data-tip]')) {
      items.push({
        type: "item",
        label: "Close",
        hint: "Esc",
        icon: I(<XIcon size={14} />),
        onSelect: () => {
          setMenu(null);
          closeTip();
        },
      });
      return show();
    }

    // something open over the page (a panel, the share window, an ayah opened beside): to close it
    const dialog = t.closest<HTMLElement>('[role="dialog"]');
    if (dialog) {
      const name = dialog.getAttribute("aria-label") ?? "";
      items.push({ type: "label", label: name });
      const peek = useUI.getState().peek;
      if (peek && /^Ayah \d/.test(name))
        items.push({
          type: "item",
          label: `Go to ${peek.s}:${peek.a}`,
          icon: I(<CornerDownRight size={14} />),
          onSelect: () => {
            useUI.getState().setPeek(null);
            go(peek.s, peek.a);
          },
        });
      items.push({
        type: "item",
        label: "Close",
        hint: "Esc",
        icon: I(<XIcon size={14} />),
        onSelect: () => {
          if (panel && dialog.getAttribute("aria-modal") === "true") return setPanel(null);
          const close = dialog.querySelector<HTMLElement>('button[aria-label^="Close"]');
          if (close) close.click();
          else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        },
      });
      return show();
    }

    const sec = t.closest<HTMLElement>("section[data-n]");
    const n = sec ? Number(sec.dataset.n) : NaN;
    const v = data && n >= 1 && n <= surah.count ? data.v[n - 1] ?? null : null;
    const sel = window.getSelection();
    const selText = sel && !sel.isCollapsed && rootRef.current?.contains(sel.anchorNode) ? sel.toString().trim() : "";
    const ayahItems = (v: Verse) => {
      const key = `${surahN}:${v.n}`;
      items.push({ type: "label", label: `Ayah ${key}` });
      items.push({ type: "item", label: recitingAyah === v.n ? "Pause the recitation" : "Recite this ayah", hint: "L", icon: I(recitingAyah === v.n ? <Pause size={14} /> : <Play size={14} />), onSelect: () => onAction("recite", v) });
      items.push({ type: "item", label: "Copy ayah", icon: I(<Copy size={14} />), onSelect: () => onAction("copy", v) });
      items.push({ type: "item", label: "Share as an image", icon: I(<Share2 size={14} />), onSelect: () => openShare(v) });
      items.push({ type: "item", label: bookmarks[key] ? "Remove bookmark" : "Bookmark", icon: I(<Bookmark size={14} />), onSelect: () => onAction("bookmark", v) });
      items.push({ type: "item", label: "Tafsir as-Sa'di", icon: I(<BookOpenText size={14} />), onSelect: () => onAction("tafsir", v) });
      items.push({ type: "item", label: "Write a note", icon: I(<NoteGlyph size={14} />), onSelect: () => onAction("note", v) });
      items.push({
        type: "item",
        label: "Record a voice note",
        icon: I(<Mic size={14} />),
        onSelect: () => onAction("voice", v, sec?.querySelector<HTMLElement>("[data-ayah-tools]") ?? sec ?? undefined),
      });
      items.push({ type: "item", label: "Bring up another ayah", hint: "O", icon: I(<PictureInPicture2 size={14} />), onSelect: () => setBringUp({ key, x: e.clientX, y: e.clientY }) });
    };

    // words chosen with the mouse: what to do with them, and with their ayah
    if (selText) {
      items.push({ type: "item", label: "Highlight", icon: I(<Highlighter size={14} />), onSelect: onSelectEnd });
      items.push({ type: "item", label: "Copy", icon: I(<Copy size={14} />), onSelect: () => copyText(selText).then((ok) => ok && flash("Copied")) });
      if (v) {
        items.push({ type: "sep" });
        ayahItems(v);
      }
      return show();
    }

    // a highlight: its own tools, then its ayah's
    const mark = t.closest<HTMLElement>("mark.hl");
    const h = mark ? useStore.getState().highlights[mark.dataset.hid!] : null;
    if (mark && h) {
      items.push({ type: "label", label: "Highlight" });
      items.push({ type: "item", label: "Colour…", icon: I(<Highlighter size={14} />), onSelect: () => openMenuFor(h.id, true) });
      items.push({ type: "item", label: "Copy its words", icon: I(<Copy size={14} />), onSelect: () => copyText(h.text).then((ok) => ok && flash("Highlight copied")) });
      items.push({ type: "item", label: "Share this part", icon: I(<Share2 size={14} />), onSelect: () => openSharePart(h) });
      items.push({ type: "item", label: "Add a note to it", icon: I(<NoteGlyph size={14} />), onSelect: () => newNote(h.key, { hid: h.id, quote: h.text }) });
      items.push({ type: "item", label: "Record a voice note on it", icon: I(<Mic size={14} />), onSelect: () => setRecorder({ key: h.key, anchor: mark.getBoundingClientRect(), hid: h.id, quote: h.text }) });
      items.push({ type: "item", label: "Remove", icon: I(<Trash2 size={14} />), onSelect: () => removeHighlight(h.id) });
      if (v) {
        items.push({ type: "sep" });
        ayahItems(v);
      }
      return show();
    }

    // an Arabic word, or a term the translation explains: heard, or explained
    const word = t.closest<HTMLElement>(".word");
    const gl = t.closest<HTMLElement>(GLOSSED);
    if (word) items.push({ type: "item", label: "Hear this word", icon: I(<Volume2 size={14} />), onSelect: () => word.click() });
    else if (gl) items.push({ type: "item", label: `What “${(gl.textContent ?? "").trim().slice(0, 24)}” means`, icon: I(<BookOpen size={14} />), onSelect: () => showGloss(gl) });
    if (word || gl) items.push({ type: "sep" });

    if (v) {
      ayahItems(v);
      items.push({ type: "sep" });
    } else if (sec && n === 0 && !flipped) {
      // the surah's opening page
      items.push({ type: "item", label: "Begin the surah", icon: I(<ArrowDown size={14} />), onSelect: () => scrollToAyah(1) });
      items.push({ type: "sep" });
    } else if (sec && n === surah.count + 1) {
      // its closing page
      const done = !!useStore.getState().done[surahN];
      items.push({ type: "item", label: done ? "Completed · undo" : "Mark as completed", icon: I(<Check size={14} />), onSelect: () => sec.querySelector<HTMLElement>("button[aria-pressed]")?.click() });
      const next = surahs[surahN];
      if (next) items.push({ type: "item", label: `Next · ${ayn(next.tc)}`, icon: I(<ArrowRight size={14} />), onSelect: () => go(surahN + 1, 0) });
      items.push({ type: "sep" });
    }

    // the surah, and the reader around it
    const inFocus = useUI.getState().focus;
    items.push({ type: "label", label: surah.tc });
    items.push(
      flipped
        ? { type: "item", label: "Back to the ayahs", icon: I(<BookOpen size={14} />), onSelect: () => setFlipped(false) }
        : { type: "item", label: "Surah summary", icon: I(<BookOpen size={14} />), onSelect: () => setFlipped(true) },
    );
    items.push({ type: "item", label: "Reflect on this surah", icon: I(<BrainGlyph size={14} />), onSelect: () => setPanel("reflection") });
    if (!flipped) {
      items.push({
        type: "item",
        label: settings.view === 1 ? "Show multiple ayahs" : "Show one ayah at a time",
        icon: I(settings.view === 1 ? <Rows3 size={14} /> : <RectangleHorizontal size={14} />),
        onSelect: () => switchView(settings.view === 1 ? 3 : 1),
      });
      if (settings.translation === "qme")
        items.push({
          type: "item",
          label: settings.showContext ? "Hide the bracketed context" : "Show the bracketed context",
          icon: I(<span className="font-serif text-[13px] italic">( )</span>),
          onSelect: toggleContext,
        });
      items.push({ type: "item", label: inFocus ? "Leave focus" : "Focus", hint: "F", icon: I(inFocus ? <Minimize2 size={14} /> : <Maximize2 size={14} />), onSelect: () => enterFocus(!inFocus) });
    }
    items.push({ type: "sep" });
    items.push({ type: "item", label: "Search", hint: "/", icon: I(<SearchIcon size={14} />), onSelect: () => setPanel("search") });
    if (surahN > 1) items.push({ type: "item", label: `Previous · ${ayn(surahs[surahN - 2].tc)}`, icon: I(<ArrowLeft size={14} />), onSelect: () => go(surahN - 1, 0) });
    if (surahN < 114 && !(sec && n === surah.count + 1)) items.push({ type: "item", label: `Next · ${ayn(surahs[surahN].tc)}`, icon: I(<ArrowRight size={14} />), onSelect: () => go(surahN + 1, 0) });
    items.push({ type: "item", label: "Surah index", icon: I(<LayoutGrid size={14} />), onSelect: () => onIndex(surahN, activeRef.current) });
    items.push({ type: "item", label: "Settings", icon: I(<Settings2 size={14} />), onSelect: () => setPanel("settings") });
    show();
  };

  // from the summary back to the ayahs (from the opening page, straight into ayah 1)
  const backToAyahs = () => {
    if (activeRef.current < 1) {
      scrollToAyah(1, false);
      setActive(1);
    }
    setFlipped(false);
  };
  // the context switch, at the foot of the panel: wherever Quraan Made Easy's text is showing
  const showCtx = settings.translation === "qme" && settings.readingMode !== "arabic";
  // the ways to read, from the top bar (a sheet on a phone, a card on a computer)
  const [reading, setReading] = useState<DOMRect | null>(null);
  const closeReading = useCallback(() => setReading(null), []);
  // under the surah's name: the ayah, and (one at a time, its translation showing) the theme it is in
  const subtitle = settings.view === 1 && settings.readingMode !== "arabic" && theme && active >= 1 ? theme : surah.en;

  return (
    <motion.div
      ref={rootRef}
      className="relative flex h-full flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.4 }}
      onContextMenu={onContextMenu}
    >
      {/* the top bar: back to the surahs; the surah (a tap: its summary); the ways to read; search,
          saved, focus (and settings on a phone: on a computer the rail has it) */}
      <header
        className={cn(
          "relative z-20 flex shrink-0 items-center gap-2 overflow-hidden px-3 transition-[height,opacity] duration-300 md:gap-3 md:px-5",
          focus ? "h-0 opacity-0" : "h-[64px] md:h-[76px]",
        )}
        aria-hidden={focus || undefined}
      >
        <button type="button" className={cn("circle-btn", mobile && "is-md")} onClick={() => onIndex(surahN, active)} aria-label="All surahs" title="All surahs (I)">
          <ArrowLeft size={18} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="press-soft flex min-w-0 flex-1 flex-col items-start rounded-2xl px-1 text-left"
          title="About this surah (T)"
          aria-label={`${ayn(surah.tc)}: about this surah`}
        >
          <span className="flex max-w-full items-center gap-1">
            <FitName text={surah.tc} className="truncate text-[17px] font-semibold leading-tight tracking-[-0.02em] md:text-[20px]" />
            <ChevronRight size={15} strokeWidth={2.2} className="shrink-0 text-[var(--box-faint)]" />
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={subtitle}
              className="block max-w-full truncate text-[12.5px] leading-snug text-[var(--box-muted)] md:text-[13px]"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
            >
              <span className="tabular-nums text-[var(--box-fg)]">
                {surahN}:{Math.max(1, Math.min(surah.count, active))}
              </span>{" "}
              · {subtitle}
            </motion.span>
          </AnimatePresence>
        </button>
        <div className="hidden items-center gap-2 xl:flex">
          <BookSwitch settings={settings} onChange={setMode} />
          <ReadingSwitches settings={settings} onChange={setMode} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          <button
            type="button"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setReading((o) => (o ? null : r));
            }}
            className={cn("circle-btn xl:hidden", mobile && "is-md", reading && "is-on")}
            aria-label="Ways to read"
            aria-expanded={!!reading}
            title="Ways to read: one ayah, scrolling, or as a book"
          >
            <Glasses size={17} strokeWidth={1.9} />
          </button>
          <button type="button" onClick={() => setPanel("search")} className={cn("circle-btn", mobile && "is-md")} aria-label="Search" title="Search (/)">
            <SearchIcon size={17} strokeWidth={1.9} />
          </button>
          <button type="button" onClick={() => setPanel(panel === "saved" ? null : "saved")} className={cn("circle-btn", mobile && "is-md", panel === "saved" && "is-on")} aria-label="Saved: your bookmarks, highlights and notes" title="Saved (S)">
            <Bookmark size={17} strokeWidth={1.9} />
          </button>
          {!mobile && (
            <button type="button" onClick={() => enterFocus(true)} className="circle-btn" aria-label="Focus: only the Qur'an" title="Focus: only the Qur'an (F)">
              <Maximize2 size={16} strokeWidth={1.9} />
            </button>
          )}
          {mobile && (
            <button type="button" onClick={() => setPanel(panel === "settings" ? null : "settings")} className={cn("circle-btn is-md", panel === "settings" && "is-on")} aria-label="Settings">
              <Settings2 size={17} strokeWidth={1.9} />
            </button>
          )}
        </div>
      </header>

      {/* ayahs */}
      <div className="relative min-h-0 flex-1">
        {/* (the cards scrolling under the top bar and the foot fade there, not cut) */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-[var(--box-bg)] to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-gradient-to-t from-[var(--box-bg)] to-transparent" />
        <div
          ref={scroller}
          className={cn("snap-scroller relative h-full", settings.view === 3 && "flow", settings.view === 1 && "paged")}
          tabIndex={-1}
          onMouseUp={onSelectEnd}
          onKeyUp={(e) => e.shiftKey && onSelectEnd()}
          onClick={onFrameClick}
          onMouseOver={onOver}
          onMouseOut={onOut}
          aria-label={`${ayn(surah.tc)}, ayat`}
        >
          {data && (
            <>
              <Opener surah={surah} mobile={mobile} viewH={viewH} onSummary={() => setFlipped(true)} bismillah={settings.script === "indopak" && bismIP ? bismIP : BISMILLAH} indopak={settings.script === "indopak" && !!bismIP} />
              {/* scrolling freely, the surah is at least a page of its own: a short one (At-Takathur
                  as a book) sits in the middle of it, so the opening and closing pages are never both
                  half in view, and a swipe still takes the reader on to either of them. (Not
                  positioned: the ayahs' offsets are measured from the scroller. One ayah at a time,
                  it is no box at all, so each ayah is still a full page of the scroller.) */}
              <div className={settings.view === 3 ? "flex min-h-full flex-col justify-center" : "contents"}>
              {bookMode ? (
                <BookText surah={surahN} meta={surah} data={data} settings={ayahSettings} mobile={mobile} hlByKey={hlByKey} bookmarks={bookmarks} onFitted={onBookFitted} />
              ) : data.v.map((v) => {
                const key = `${surahN}:${v.n}`;
                const near = v.n >= active - 2 && v.n <= Math.max(active, lastShown) + 2;
                const light = !near && !everBuilt.current.n.has(v.n) && (v.n < built.lo || v.n > built.hi);
                if (!light) everBuilt.current.n.add(v.n);
                return (
                  <AyahSection
                    key={key}
                    light={light}
                    surah={surahN}
                    verse={v}
                    near={near}
                    settings={near ? ayahSettings : farSettings}
                    mobile={mobile}
                    highlights={hlByKey.get(key) ?? EMPTY}
                    bookmarked={!!bookmarks[key]}
                    notes={notesByKey.get(key) ?? 0}
                    voices={voicesByKey.get(key) ?? 0}
                    reciting={recitingAyah === v.n}
                    translit={tl?.[v.n - 1]}
                    onAction={onAction}
                    viewH={viewH}
                    viewW={viewW}
                    isLast={v.n === data.v.length}
                  />
                );
              })}
              </div>
              <Closing surah={surah} next={surahs[surahN] ?? null} onReflect={() => setPanel("reflection")} onNext={() => go(surahN + 1, 0)} />
            </>
          )}
        </div>
        {!data && !error && <Loading name={ayn(surah.tc)} />}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="max-w-[40ch] font-serif text-[18px] text-[var(--box-muted)]">{error}</p>
            <button type="button" onClick={() => setRetry((r) => r + 1)} className="btn-secondary label border border-[var(--box-fg)] px-3 py-2 hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]">
              Try again
            </button>
          </div>
        )}
        {/* the card growing into the frame */}
        <AnimatePresence>
          {zoom && (
            <motion.div
              key="zoom"
              className="pointer-events-none absolute z-30 overflow-hidden"
              initial={{ left: zoom.left, top: zoom.top - (mobile ? 48 : 52), width: zoom.width, height: zoom.height, opacity: 1 }}
              animate={{ left: 0, top: 0, width: "100%", height: "100%", opacity: [1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: EASE_IN_OUT, opacity: { duration: 1.5, times: [0, 0.6, 1] } }}
              onAnimationComplete={() => setZoom(null)}
            >
              <SurahArt n={surah.n} blur={22} />
            </motion.div>
          )}
        </AnimatePresence>
        <Toast msg={toast} />
        <AnimatePresence>
          {cameFrom && !focus && (
            <motion.div
              key="back"
              className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center border border-[var(--box-line)] bg-[var(--box-bg-solid)] shadow-[0_14px_40px_-14px_rgba(0,0,0,0.7)]"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              <button
                type="button"
                onClick={() => {
                  const c = cameFrom;
                  setCameFrom(null);
                  go(c.s, c.a);
                }}
                className="label flex h-9 items-center gap-2 pl-3 pr-2 text-[var(--box-muted)] transition-colors hover:text-[var(--box-fg)]"
              >
                <CornerUpLeft size={14} strokeWidth={1.6} />
                Back to {cameFrom.s}:{cameFrom.a}
              </button>
              <button type="button" onClick={() => setCameFrom(null)} aria-label="Dismiss" className="flex h-9 w-8 items-center justify-center text-[var(--box-faint)] hover:text-[var(--box-fg)]">
                <XIcon size={13} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {focus && <FocusExit onExit={() => enterFocus(false)} />}
      </div>

      {/* the foot: one ayah at a time, its buttons in a pill (still while the ayahs pass, acting on the
          one in view); on a computer, the context switch at the end */}
      <footer
        className={cn(
          "frame-foot relative z-20 flex shrink-0 items-center gap-3 overflow-hidden px-4 transition-[height,opacity] duration-300 md:px-6",
          focus ? "h-0 opacity-0" : settings.view === 1 ? "h-[62px] md:h-[68px]" : mobile ? "h-2" : "h-11",
        )}
        aria-hidden={focus || undefined}
      >
        <span className="flex-1 basis-0" />
        {settings.view === 1 && verse && !focus && (
          <div data-ayah-tools className="ayah-pill flex shrink-0 items-center rounded-full bg-[var(--surface)] p-1">
            {(() => {
              const k = `${surahN}:${verse.n}`;
              const act = { bookmarked: !!bookmarks[k], notes: notesByKey.get(k) ?? 0, voices: voicesByKey.get(k) ?? 0, reciting: recitingAyah === verse.n, onAction: (a: AyahAction, el: HTMLElement) => onAction(a, verse, el) };
              // reading it, then (a hairline between) one's own and giving it on
              return (
                <>
                  <Actions {...act} row />
                  <span className="mx-1 h-5 w-px bg-[var(--box-line)]" aria-hidden />
                  <OwnActions {...act} />
                </>
              );
            })()}
          </div>
        )}
        <span className="label-sm flex flex-1 basis-0 justify-end">{showCtx && !mobile && <ContextToggle on={settings.showContext} onToggle={toggleContext} />}</span>
      </footer>

      {/* panels */}
      <SettingsPanel open={panel === "settings" || panel === "saved" || panel === "guide"} startTab={panel === "saved" ? "saved" : panel === "guide" ? "guide" : undefined} onClose={() => setPanel(null)} surahs={surahs} onGo={go} mobile={mobile} />
      <ReadingMenu
        at={reading}
        mobile={mobile}
        onClose={closeReading}
        settings={settings}
        onChange={setMode}
        extra={
          mobile ? (
            <div className="mt-4 rounded-[20px] bg-[var(--surface)] px-4 py-1.5">
              {showCtx && <SheetSwitch label="The bracketed context" on={settings.showContext} onClick={toggleContext} />}
              <button
                type="button"
                onClick={() => {
                  closeReading();
                  enterFocus(true);
                }}
                className="press-soft flex w-full items-center justify-between rounded-2xl px-1 py-2.5 text-left text-[14.5px]"
              >
                Focus: only the Qur'an
                <Maximize2 size={17} strokeWidth={1.8} className="mr-3.5 text-[var(--box-muted)]" />
              </button>
            </div>
          ) : undefined
        }
      />
      <ReflectionPanel open={panel === "reflection"} onClose={() => setPanel(null)} surah={surah} mobile={mobile} />
      <TafsirPanel at={tafsir} onGo={setTafsir} onClose={() => setTafsir(null)} settings={ayahSettings} mobile={mobile} />
      <ImmersivePanel open={panel === "search"} from="left" onClose={() => setPanel(null)} label="Search">
        <SearchPanelBody surahs={surahs} juz={juz} onPick={onPick} onClose={() => setPanel(null)} current={surahN} onSurah={(n) => go(n, 1)} onGo={go} />
      </ImmersivePanel>

      {touchPick}
      {/* floating layers live on <body>: the tilted frame would re-anchor fixed positioning */}
      {createPortal(
        <>
          <WordTip tip={tip} translit={settings.translit} onClose={closeTip} />
          <HighlightMenu
            hl={menuHl}
            at={menu?.at ?? null}
            onClose={() => setMenu(null)}
            onCopy={async (h) => {
              (await copyText(h.text)) && flash("Highlight copied");
              setMenu(null);
            }}
            onNote={(h) => {
              newNote(h.key, { hid: h.id, quote: h.text });
              setMenu(null);
            }}
            onVoice={(h, anchor) => {
              setRecorder({ key: h.key, anchor, hid: h.id, quote: h.text });
              setMenu(null);
            }}
            onShare={(h) => {
              openSharePart(h);
              setMenu(null);
            }}
            reciting={partPlaying}
            onRecite={(h) => {
              if (partPlaying) return togglePlayer();
              const [s, a] = h.key.split(":").map(Number);
              const v = data?.v[a - 1];
              if (!v) return;
              const idx = arabicWords(v, settings.script).words.filter((w) => w.end > h.start && w.start < h.end).map((w) => w.i);
              if (!idx.length) return;
              audio.current?.pause();
              recitePart(s, a, Math.min(...idx), Math.max(...idx));
            }}
          />
          <AyahWindows windows={visibleWindows} onJump={jumpFrom} />
          <StickyNotes notes={visibleNotes} focusId={focusNote} onFocused={() => setFocusNote(null)} />
          <BringUp at={bringUp} surahs={surahs} juz={juz} onPick={bringUpAyah} onClose={closeBringUp} />
          <FolderPop at={folderPop} bkey={folderPop?.key ?? null} onClose={closeFolderPop} />
          <AyahPeek />
        </>,
        document.body,
      )}
      <ShareDialog content={share} onClose={() => setShare(null)} onToast={flash} />
      <NoteShareDialog
        note={noteShare}
        surahName={noteShare ? surahs[Number(noteShare.key.split(":")[0]) - 1]?.tc ?? "" : ""}
        onClose={closeNoteShare}
        onToast={flash}
      />
      <VoiceRecorder
        anchor={recorder?.anchor ?? null}
        ayahKey={recorder?.key ?? ""}
        onClose={() => setRecorder(null)}
        quote={recorder?.quote}
        onSaved={(audio, dur) => {
          if (recorder) newNote(recorder.key, { kind: "voice", audio, dur, hid: recorder.hid, quote: recorder.quote });
          flash("Voice note saved");
        }}
      />

      {/* the back of the frame */}
      {backFace &&
        createPortal(
          <div className="h-full">
            {flipped && (
              <SurahSummary
                surah={surah}
                data={data}
                mobile={mobile}
                atStart={active < 1}
                onBack={backToAyahs}
                onGo={(a) => {
                  setFlipped(false);
                  setTimeout(() => scrollToAyah(a, false), 450);
                }}
              />
            )}
          </div>,
          backFace,
        )}

      {/* under the panel: the slider through the surah, in a dark dock (on the shell, on a computer) */}
      {outside &&
        createPortal(
          <div className={cn("absolute inset-0 transition-[opacity,visibility] duration-300", focus && "pointer-events-none invisible opacity-0")}>
            <div
              className={cn(
                "reader-dock absolute left-1/2 flex h-14 w-[calc(100%-24px)] -translate-x-1/2 items-center gap-2 rounded-full pl-3 pr-1.5 transition-[opacity,width] duration-200 md:pl-4",
                playerOn ? "md:w-[min(1040px,92%)]" : "md:w-[min(760px,86%)]",
                // a panel over the ayahs: the slider has nothing to show (reflection keeps its button, to close it)
                (panel && panel !== "reflection") || aboutOpen ? "pointer-events-none opacity-0" : "pointer-events-auto",
              )}
              style={{
                top: `calc(100% + ${mobile ? 14 : Math.max(8, below / 2 - 28)}px)`,
                ["--box-fg" as string]: "var(--outside-fg)",
                ["--box-line" as string]: "var(--outside-line)",
                ["--box-faint" as string]: "var(--outside-faint)",
                ["--box-bg-solid" as string]: "var(--outside-bg)",
                ["--box-muted" as string]: "var(--outside-muted)",
                ["--box-hover" as string]: "rgba(255, 255, 255, 0.09)",
              }}
            >
              <PlayerLine className="inset-x-7 bottom-[5px]" />
              {playerOn && (
                <div className={cn("flex h-full min-w-0 items-center pl-2", mobile ? "flex-1" : "w-[340px] shrink-0")}>
                  <PlayerBar mobile={mobile} onGo={go} />
                </div>
              )}
              {playerOn && !mobile && <span aria-hidden className="h-6 w-px shrink-0 bg-[var(--box-line)]" />}
              {!(mobile && playerOn) && (
              <AyahSlider
                trackHidden={panel === "reflection" || !settings.slider}
                value={Math.min(surah.count, Math.max(1, active))}
                max={surah.count}
                onChange={(v) => {
                  setActive(v);
                  scrollToAyah(v, false);
                }}
                onEnd={() => setPanel((p) => (p === "reflection" ? null : "reflection"))}
                endLabel="Reflect on this surah — write or record your own summary"
                endIcon={<BrainGlyph size={18} />}
              />
              )}
            </div>
          </div>,
          outside,
        )}
    </motion.div>
  );
}

function Opener({
  surah,
  mobile,
  viewH,
  onSummary,
  bismillah,
  indopak,
}: {
  surah: Surah;
  mobile: boolean;
  viewH: number;
  onSummary: () => void;
  bismillah: string;
  indopak: boolean;
}) {
  const k = viewH ? Math.min(1, Math.max(0.62, viewH / 600)) : 1; // short frames get a smaller title
  // the nudge to scroll moves only when it can be seen (a few times, once), and never where the
  // phone or the reader asks for less motion: moving out of sight it would be the page's only work,
  // every frame, and under the phone's Reduce Motion each of those frames would start a transition
  const phoneStill = useReducedMotion();
  const readerStill = useStore((s) => s.settings.reduceMotion);
  const still = phoneStill || readerStill;
  const c = surahColor(surah.n);
  const rise = (d: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: EASE_OUT, delay: d } });
  return (
    <section data-n={0} className="snap-item snap-page relative flex min-h-full flex-col items-center justify-center px-3 py-3 text-center md:px-8">
      <div className="card-tint relative flex w-full max-w-[900px] flex-col items-center overflow-hidden px-6" style={{ background: c.bg, paddingTop: 44 * k, paddingBottom: 40 * k }}>
        <motion.span className="rounded-full bg-white/55 px-3 py-1 text-[12.5px] font-medium" {...rise(0.1)}>
          Surah {surah.n} · {surah.place === "makkah" ? "Makkan" : "Madinan"} · {surah.count} ayat
        </motion.span>
        <motion.span className="mt-6 font-kufi leading-none" style={{ fontSize: (mobile ? 58 : 86) * k }} dir="rtl" lang="ar" {...rise(0.16)}>
          {surah.ar}
        </motion.span>
        <motion.span className="mt-5 font-semibold leading-none tracking-[-0.03em]" style={{ fontSize: (mobile ? 30 : 42) * k }} {...rise(0.22)}>
          {nameMarks(surah.tc)}
        </motion.span>
        <span className="mt-2.5 text-[14px]" style={{ color: c.deep }}>
          {surah.en}
        </span>
        {surah.bism && (
          <motion.div className={cn("quran text-[#111113]", indopak && "indopak")} style={{ fontSize: (mobile ? 26 : 34) * k, marginTop: 34 * k }} lang="ar" {...rise(0.3)}>
            {bismillah}
          </motion.div>
        )}
        <motion.div className="flex flex-col items-center gap-4" style={{ marginTop: 34 * k }} {...rise(0.36)}>
          <button type="button" onClick={onSummary} className="press inline-flex h-11 items-center gap-2 rounded-full bg-[#111113] px-5 text-[14px] font-medium text-white">
            About this surah
            <ArrowRight size={15} strokeWidth={2} />
          </button>
          <motion.span
            className="text-[13px]"
            style={{ color: c.deep }}
            whileInView={still ? undefined : { y: [0, 4, 0] }}
            viewport={{ once: true }}
            transition={{ duration: 2.2, repeat: 4, ease: "easeInOut" }}
          >
            Scroll to begin ↓
          </motion.span>
        </motion.div>
      </div>
    </section>
  );
}

/** The way out of focus: a quiet corner button that shows when the pointer moves (always, faintly, to a finger). */
function FocusExit({ onExit }: { onExit: () => void }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let t = window.setTimeout(() => setShown(false), 2200);
    const wake = () => {
      setShown(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setShown(false), 2200);
    };
    window.addEventListener("pointermove", wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointermove", wake);
    };
  }, []);
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  return (
    <button
      type="button"
      onClick={onExit}
      aria-label="Leave focus (Esc)"
      title="Leave focus (Esc)"
      className={cn(
        "pill absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center border border-[var(--box-line)] bg-[var(--box-bg-solid)] text-[var(--box-muted)] transition-opacity duration-500 hover:text-[var(--box-fg)] md:right-5 md:top-5",
        shown ? "opacity-100" : touch ? "opacity-40" : "pointer-events-none opacity-0",
      )}
    >
      <Minimize2 size={14} strokeWidth={1.5} />
    </button>
  );
}

function Closing({ surah, next, onReflect, onNext }: { surah: Surah; next: Surah | null; onReflect: () => void; onNext: () => void }) {
  const n = next ? surahColor(next.n) : null;
  return (
    <section data-n={surah.count + 1} className="snap-item snap-page relative flex min-h-full flex-col items-center justify-center px-3 py-3 text-center md:px-8">
      <div className="card flex w-full max-w-[900px] flex-col items-center gap-7 px-6 py-12 md:py-16">
        <span className="rounded-full bg-[var(--box-hover)] px-3 py-1 text-[12.5px] font-medium text-[var(--box-muted)]">End of {nameMarks(surah.tc)}</span>
        <div className="max-w-[20ch] text-[26px] font-semibold leading-tight tracking-[-0.025em] md:text-[34px]">What did this surah leave with you?</div>
        <CompleteMark surah={surah} />
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button type="button" onClick={onReflect} className="btn-primary inline-flex h-12 items-center gap-2 px-5 text-[14px] font-medium">
            <BrainGlyph size={16} />
            Write a reflection
          </button>
          {next && n && (
            <button type="button" onClick={onNext} className="press inline-flex h-12 items-center gap-2 rounded-full px-5 text-[14px] font-medium text-[#111113]" style={{ background: n.bg }}>
              Next · {nameMarks(next.tc)}
              <ArrowRight size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Loading({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <span className="label text-[var(--box-muted)]">Opening {name}</span>
      <span className="relative h-px w-40 overflow-hidden bg-[var(--box-line)]">
        <motion.span className="absolute inset-y-0 w-1/3 bg-[var(--color-gold)]" animate={{ left: ["-35%", "100%"] }} transition={{ duration: 1.1, repeat: Infinity, ease: EASE_IN_OUT }} />
      </span>
    </div>
  );
}

/** The surah's name in the header: on a narrow phone a long one (Al-Mumtaĥanah) steps down a
 *  little in size to fit whole, rather than being cut. */
function FitName({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.parentElement) return;
    const fit = () => {
      el.style.fontSize = "";
      if (el.scrollWidth <= el.clientWidth) return;
      const base = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.max(12, Math.floor((base * el.clientWidth * 10) / el.scrollWidth) / 10)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      ro.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [text]);
  return (
    <span ref={ref} className={className}>
      {nameMarks(text)}
    </span>
  );
}

function SearchPanelBody({
  surahs,
  juz,
  onPick,
  onClose,
  current,
  onSurah,
  onGo,
}: {
  surahs: Surah[];
  juz: Record<string, string>;
  onPick: (r: Result) => void;
  onClose: () => void;
  current: number;
  onSurah: (n: number) => void;
  onGo: (s: number, a: number) => void;
}) {
  // besides searching, the surahs browsed other ways: by juz, by theme, by topic…
  const [by, setBy] = useState<IndexKind>(searchBy);
  const pick = (k: IndexKind) => {
    searchBy = k;
    setBy(k);
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[64px] shrink-0 items-center justify-between gap-3 px-4 md:h-[76px] md:px-6">
        <Reveal>
          <div className="text-[20px] font-semibold leading-tight tracking-[-0.02em] md:text-[22px]">Search</div>
          <div className="text-[12.5px] text-[var(--box-muted)]">A surah, 2:255, a juz, or any word</div>
        </Reveal>
        <button type="button" onClick={onClose} aria-label="Close search" className="circle-btn">
          <XIcon size={18} strokeWidth={1.9} />
        </button>
      </div>
      {/* above the surah list, so its dropdown of results is not covered by the list */}
      <Reveal className="relative z-20 px-4 pt-2 md:px-8 md:pt-4">
        <div className="mx-auto w-full max-w-[640px]">
          {/* (on a touch screen not at once: the keyboard would cover the ways of browsing) */}
          <SearchBox surahs={surahs} juz={juz} onPick={onPick} autoFocus={!window.matchMedia("(pointer: coarse)").matches} dropdown="overlay" inputClassName="h-12 text-[12px]" />
        </div>
      </Reveal>
      {/* or browse: each way of seeing the Qur'an a tab of its own, in plain view */}
      <Reveal className="relative z-10 px-5 pt-6 md:px-8 md:pt-7">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-auto md:w-full md:max-w-[860px] md:flex-wrap md:justify-center md:px-0" role="tablist" aria-label="Browse">
          {INDEX_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={by === v.id}
              onClick={() => pick(v.id)}
              className={cn("chip h-9 px-3.5 text-[13px]", by === v.id && "is-on")}
            >
              {v.id === "ring" ? "All surahs" : v.name}
            </button>
          ))}
        </div>
      </Reveal>
      <AnimatePresence mode="wait" initial={false}>
        {by !== "ring" ? (
          <motion.div
            key={by}
            className="relative z-0 mt-5 min-h-0 flex-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            <IndexView kind={by} surahs={surahs} juz={juz} onOpen={onGo} mobile={window.innerWidth < 768} />
          </motion.div>
        ) : (
      <motion.div
        key="all"
        className="thin-scroll relative z-0 mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
      >
        <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {surahs.map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => onSurah(s.n)}
              className={cn(
                "press-soft group flex items-center gap-2.5 rounded-2xl bg-[var(--surface)] px-3 py-2.5 text-left transition-shadow duration-150 hover:shadow-[0_0_0_1px_var(--box-fg)]",
                s.n === current && "shadow-[0_0_0_2px_var(--box-accent)]",
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums text-[#111113]" style={{ background: surahColor(s.n).bg }}>
                {s.n}
              </span>
              <span className="truncate text-[14.5px] font-medium">{nameMarks(s.tc)}</span>
              <span className="ml-auto font-kufi text-[13px] text-[var(--box-faint)]" dir="rtl">
                {s.ar}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
let searchBy: IndexKind = "ring"; // the way of browsing last chosen in the search, kept for its next opening

/* ── into focus and out of it: the frame moves (App gives it a shorter move while reflow is on) and
   the page waits until it has stopped, and until the window has finished changing size ── */
let reflowTimer = 0;
function settleReflow(ms: number) {
  window.clearTimeout(reflowTimer);
  reflowTimer = window.setTimeout(() => useUI.getState().setReflow(false), ms);
}
function reflowFor(on: boolean) {
  const ui = useUI.getState();
  ui.setReflow(true);
  ui.setFocus(on);
  settleReflow(620); // (the frame's move is 0.55s)
}
