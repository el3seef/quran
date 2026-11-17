import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Backdrop, type Phase } from "@/components/Backdrop";
import { AppNav, type NavTab } from "@/components/AppNav";
import { Frame } from "@/components/Frame";
import { Grain } from "@/components/bits";
import { ContextMenu } from "@/components/ContextMenu";
import { Intro } from "@/pages/Intro";
import { Select, type OpenRequest } from "@/pages/Select";
import { Read } from "@/read/Read";
import { SettingsPanel } from "@/read/Settings";
import { AboutPanel } from "@/components/About";
import { loadIndex, type Surah } from "@/lib/data";
import type { Result } from "@/lib/search";
import { frameRect, useViewport, useVisibleBottom } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { useScheme } from "@/lib/themes";
import { useUI, type MenuItem } from "@/lib/ui";
import { isLongPressMenu, watchLongPress, watchTwoFingerTap } from "@/lib/touch";
import { watchSounds } from "@/lib/uiSounds";
import { isTouch } from "@/lib/motion";

// the Seerah, and the making of an ayah video, loaded when first opened
const Seerah = lazy(() => import("@/seerah/Seerah"));
const Studio = lazy(() => import("@/video/Studio"));

type Start = { surah: number; ayah: number; from?: OpenRequest["from"]; showOpener?: boolean };

/** "#/2/255" opens straight onto that ayah (shared links). */
function readHash(): Start | null {
  const m = location.hash.match(/^#\/(\d{1,3})(?:\/(\d{1,3}))?/);
  if (!m) return null;
  const s = Number(m[1]);
  if (s < 1 || s > 114) return null;
  return { surah: s, ayah: m[2] ? Number(m[2]) : 1 };
}

export default function App() {
  const vp = useViewport();
  const settings = useStore((s) => s.settings);
  const last = useStore((s) => s.last);
  const [index, setIndex] = useState<{ surahs: Surah[]; juz: Record<string, string> } | null>(null);
  const [linked] = useState(readHash);
  const [phase, setPhase] = useState<Phase>(linked ? "read" : location.hash.startsWith("#/seerah") ? "seerah" : location.hash.startsWith("#/video") ? "video" : "intro");
  const [entering, setEntering] = useState(false);
  const [start, setStart] = useState<Start>(linked ?? { surah: 1, ayah: 1 });
  const [indexAt, setIndexAt] = useState({ surah: last?.s ?? 1, ayah: last?.v ?? 1 }); // where the index opens
  const [firstFrame, setFirstFrame] = useState(true);
  const [coverSettings, setCoverSettings] = useState(false); // Settings opened from Home or the surahs
  const [settingsTab, setSettingsTab] = useState<"saved" | "progress" | undefined>(undefined); // (a section of it asked for)
  // the index, come to from the cover: it offers to go on where the reader left off
  const [resume, setResume] = useState<{ s: number; v: number } | null>(null);
  const about = useUI((s) => s.about);
  const setAbout = useUI((s) => s.setAbout);
  const [coverSearch, setCoverSearch] = useState(false); // the cover turned into its search
  // (the field is focused in the press itself, so a phone brings its keyboard up)
  const openCoverSearch = () => {
    document.querySelector<HTMLInputElement>(".cover-search-input")?.focus({ preventScroll: true });
    setCoverSearch(true);
  };

  useEffect(() => {
    loadIndex().then(setIndex);
  }, []);

  // the site's own right-click menu where no page has one of its own (the reader and the index
  // do, and prevent this): the cover, or what is open over it (About, Settings), or the sky
  const live = useRef({ phase, coverSettings, about, coverSearch });
  live.current = { phase, coverSettings, about, coverSearch };
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea")) return; // where people type, the browser's own
      // the browser's menu from a long press stays away: the site raises its own (watchLongPress)
      if (isLongPressMenu(e)) return e.preventDefault();
      if (e.defaultPrevented) return;
      e.preventDefault();
      const s = live.current;
      const items: MenuItem[] = [];
      const dialog = t.closest<HTMLElement>('[role="dialog"]');
      if (s.about || s.coverSettings || dialog) {
        items.push({ type: "label", label: s.about ? "About this reader" : s.coverSettings ? "Settings" : (dialog?.getAttribute("aria-label") ?? "") });
        items.push({
          type: "item",
          label: "Close",
          hint: "Esc",
          onSelect: () => {
            if (s.about) useUI.getState().setAbout(false);
            else if (s.coverSettings) setCoverSettings(false);
            else dialog?.querySelector<HTMLElement>('button[aria-label^="Close"]')?.click();
          },
        });
      } else if (s.phase === "intro" && s.coverSearch) {
        items.push({ type: "item", label: "Close the search", hint: "Esc", onSelect: () => setCoverSearch(false) });
      } else if (s.phase === "intro") {
        const enter = document.querySelector<HTMLButtonElement>('button[aria-label="Read the Qur\'an"]');
        if (enter) items.push({ type: "item", label: "Read the Qur'an", hint: "Enter", onSelect: () => enter.click() });
        const seerah = document.querySelector<HTMLButtonElement>('button[aria-label="The Seerah"]');
        if (seerah) items.push({ type: "item", label: "The Seerah", onSelect: () => seerah.click() });
        items.push({ type: "item", label: "Search", hint: "/", onSelect: openCoverSearch });
        items.push({ type: "item", label: "Settings", onSelect: () => setCoverSettings(true) });
      }
      if (items.length) items.push({ type: "sep" });
      items.push({ type: "item", label: "Reload", onSelect: () => location.reload() });
      useUI.getState().openMenu(e.clientX, e.clientY, items);
    };
    window.addEventListener("contextmenu", on);
    // touch screens: two fingers at once, or a press held where there is no text to select
    const stopTaps = watchTwoFingerTap();
    const stopPress = watchLongPress();
    return () => {
      window.removeEventListener("contextmenu", on);
      stopTaps();
      stopPress();
    };
  }, []);

  // a pasted or edited link (#/18/10) opens that ayah; our own replaceState calls don't fire this
  const [readKey, setReadKey] = useState(0);
  useEffect(() => {
    const on = () => {
      if (location.hash.startsWith("#/seerah")) return setPhase("seerah");
      if (location.hash.startsWith("#/video")) return setPhase("video");
      const h = readHash();
      if (!h) return;
      setStart(h);
      setReadKey((k) => k + 1);
      setPhase("read");
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // the site's sounds: taps, switches, keys (each kind can be turned off in Settings → Sound)
  useEffect(() => watchSounds(), []);

  // light or dark: the device's own, or the one held in Settings
  const scheme = useScheme(settings.appearance);
  useEffect(() => {
    const root = document.documentElement;
    // (the Seerah in its own look, whatever the reader's)
    root.dataset.theme = phase === "seerah" ? "seerah" : settings.theme;
    root.dataset.scheme = scheme;
    root.dataset.motion = settings.reduceMotion ? "reduce" : "full";
    // the phone's own bar (a home-screen app, Android's browser) takes the colour of the sky
    const sky = getComputedStyle(root).getPropertyValue("--sky").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", sky || "#f7f4ee");
  }, [settings.theme, scheme, settings.reduceMotion, phase]);

  // after the first frame is on screen, later frame moves animate
  useEffect(() => {
    const t = setTimeout(() => setFirstFrame(false), 50);
    return () => clearTimeout(t);
  }, []);

  // page one: the cover grows into the index, then the index comes in
  const enter = useCallback(() => {
    setCoverSettings(false);
    useUI.getState().setAbout(false);
    const l = useStore.getState().last;
    setResume(l && !(l.s === 1 && l.v <= 1) ? l : null);
    setEntering(true);
    setTimeout(
      () => {
        setPhase("select");
        setEntering(false);
      },
      useStore.getState().settings.reduceMotion ? 0 : 160,
    );
  }, []);
  // what the cover's search found: straight into the reader there
  const onCoverPick = useCallback((r: Result) => {
    setCoverSearch(false);
    const ayah = r.kind === "surah" ? 1 : r.ayah;
    setStart({ surah: r.surah.n, ayah, showOpener: ayah === 1 });
    setPhase("read");
  }, []);
  // a saved ayah picked in the settings on page one
  const goTo = useCallback((surah: number, ayah: number) => {
    setCoverSettings(false);
    setStart({ surah, ayah });
    setPhase("read");
  }, []);

  const onOpen = useCallback((r: OpenRequest) => {
    setCoverSettings(false);
    setStart({ surah: r.surah, ayah: r.ayah, from: r.from, showOpener: r.ayah === 1 });
    setPhase("read");
  }, []);

  const onIndex = useCallback((surah: number, ayah: number) => {
    setResume(null);
    setIndexAt({ surah, ayah: Math.max(1, ayah) });
    history.replaceState(null, "", location.pathname);
    setPhase("select");
  }, []);

  // one frame for the whole site: the cover on page one, grown for the index and the reader
  const focus = useUI((s) => s.focus);
  const reflow = useUI((s) => s.reflow);
  // (in focus the frame meets the strip an iPhone keeps below the page: index.css gives it the frame's colour)
  useEffect(() => {
    document.documentElement.classList.toggle("focus-on", focus && phase === "read");
  }, [focus, phase]);
  const cover = phase === "intro" && !entering && !coverSettings && !about;
  const searchingCover = cover && coverSearch;
  // a phone searching from the cover: the frame rises to the top and ends above the keyboard
  const keyboardTop = useVisibleBottom(searchingCover && vp.mobile);
  const rect =
    focus && phase === "read"
      ? // focus: the frame is the whole screen (below the status bar, opened from the home screen)
        { left: 0, top: vp.standalone ? vp.insets.top : 0, width: vp.w, height: vp.h - (vp.standalone ? vp.insets.top : 0) }
      : searchingCover && vp.mobile
        ? (() => {
            const top = vp.standalone ? vp.insets.top : 0;
            return { left: 0, top, width: vp.w, height: Math.max(260, Math.min(keyboardTop, vp.h - vp.insets.bottom) - top - 10) };
          })()
        : frameRect(vp.w, vp.h, cover ? "intro" : phase === "intro" ? "select" : phase, vp);

  // the site's ways about (AppNav): the page on, and where each goes from wherever the reader is
  const navActive: NavTab | null = coverSettings ? "settings" : phase === "intro" ? "home" : phase === "video" ? "video" : phase === "seerah" ? null : "surahs";
  const onNav = (t: NavTab) => {
    setCoverSearch(false);
    if (t === "settings") {
      // (in the reader, its own Settings, over the page being read)
      if (phase === "read") return void window.dispatchEvent(new CustomEvent("reader-panel", { detail: "settings" }));
      setSettingsTab(undefined);
      return setCoverSettings((o) => !o);
    }
    setCoverSettings(false);
    useUI.getState().setAbout(false);
    if (t === "home") {
      history.replaceState(null, "", location.pathname);
      return setPhase("intro");
    }
    if (t === "surahs") {
      if (phase === "select") return;
      const l = useStore.getState().last;
      if (phase === "read" && l) return onIndex(l.s, l.v);
      return enter();
    }
    if (t === "seerah") return setPhase("seerah");
    history.replaceState(null, "", "#/video");
    setPhase("video");
  };
  // (on a phone the navigation floats over Home and the surahs; the reader has its own dock, the video
  // its own controls; on a computer the rail is there throughout, but in focus)
  const navShown = phase !== "seerah" && !(focus && phase === "read") && (!vp.mobile || ((phase === "intro" || phase === "select") && !coverSearch && !coverSettings && !about));

  return (
    <>
      {/* (the Seerah is a world of its own: over the whole screen, without the Qur'an's sky or frame) */}
      {phase !== "seerah" && <Backdrop grain={settings.grain} />}
      <AnimatePresence>
        {phase === "seerah" && (
          <motion.div key="seerah" className="fixed inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.7 } }} exit={{ opacity: 0, transition: { duration: 0.35 } }}>
            <Suspense fallback={null}>
              <Seerah
                mobile={vp.mobile}
                onHome={() => {
                  history.replaceState(null, "", location.pathname);
                  setPhase("intro");
                }}
                onQuran={(s, a) => {
                  setStart({ surah: s, ayah: a });
                  setPhase("read");
                }}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {phase !== "seerah" && (
        <Frame rect={rect} instant={firstFrame} quick={reflow} backBelow={phase === "read" && vp.mobile && !focus ? Math.max(0, vp.h - rect.top - rect.height) : 0}>
          <AnimatePresence>
            {phase === "intro" && !entering && (
              <motion.div key="intro" className="absolute inset-[3px]" exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                <Intro
                  onEnter={enter}
                  onSettings={(tab) => {
                    setCoverSearch(false);
                    setSettingsTab(tab);
                    setCoverSettings((o) => (tab ? true : !o));
                  }}
                  settingsOpen={coverSettings}
                  mobile={vp.mobile}
                  index={index}
                  searching={searchingCover}
                  onSearching={setCoverSearch}
                  onPick={onCoverPick}
                  onSeerah={() => {
                    setCoverSearch(false);
                    setPhase("seerah");
                  }}
                  onVideo={() => {
                    setCoverSearch(false);
                    history.replaceState(null, "", "#/video");
                    setPhase("video");
                  }}
                  onContinue={goTo}
                />
              </motion.div>
            )}
            {phase === "select" && index && (
              <motion.div key="select" className="absolute inset-[3px]" exit={{ opacity: 0, transition: { duration: 0.18 } }}>
                <Select surahs={index.surahs} juz={index.juz} initialSurah={indexAt.surah} initialAyah={indexAt.ayah} onOpen={onOpen} mobile={vp.mobile} resume={resume} onSettings={() => setCoverSettings((o) => !o)} settingsOpen={coverSettings} onBack={() => (setCoverSettings(false), setPhase("intro"))} />
              </motion.div>
            )}
            {phase === "video" && index && (
              <motion.div key="video" className="absolute inset-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.25, delay: 0.1 } }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                <Suspense fallback={null}>
                  <Studio
                    surahs={index.surahs}
                    mobile={vp.mobile}
                    onBack={() => {
                      history.replaceState(null, "", location.pathname);
                      setPhase("intro");
                    }}
                  />
                </Suspense>
              </motion.div>
            )}
            {phase === "read" && index && (
              <motion.div key={`read-${readKey}`} className="absolute inset-[3px]" exit={{ opacity: 0, transition: { duration: 0.18 } }}>
                <Read
                  surahs={index.surahs}
                  juz={index.juz}
                  start={start}
                  onIndex={onIndex}
                  mobile={vp.mobile}
                  below={vp.h - (rect.top + rect.height)}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {(phase === "intro" || phase === "select") && index && (
            <SettingsPanel key={settingsTab ?? "all"} open={coverSettings} startTab={settingsTab} onClose={() => setCoverSettings(false)} surahs={index.surahs} onGo={goTo} mobile={vp.mobile} />
          )}
          <AboutPanel open={about} onClose={() => setAbout(false)} />
        </Frame>
      )}

      {phase !== "seerah" && <AppNav active={navActive} onGo={onNav} mobile={vp.mobile} show={navShown} />}
      <ContextMenu />
      <Grain on={settings.grain && !isTouch()} />
    </>
  );
}
