import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Translation } from "./data";
import { DEFAULT_THEME, THEME_IDS, type ThemeId } from "./themes";

export type HighlightColor = "yellow" | "green" | "pink" | "blue" | "orange";
export const HIGHLIGHT_COLORS: HighlightColor[] = ["yellow", "green", "pink", "blue", "orange"];
export const HIGHLIGHT_HEX: Record<HighlightColor, string> = {
  yellow: "#f5e27a",
  green: "#a2dd8f",
  pink: "#f3a0c1",
  blue: "#96c5f4",
  orange: "#f6b06f",
};

/** field: which text of the ayah the highlight lives in */
export type HighlightField = "ar" | Translation | "seerah"; // ("seerah": a section of the Seerah, key "seerah:<id>")

export type Highlight = {
  id: string;
  key: string; // "2:255"
  field: HighlightField;
  start: number;
  end: number;
  color: HighlightColor;
  text: string;
  at: number;
};

export type Note = {
  id: string;
  key: string;
  hid?: string; // highlight the note is attached to
  quote?: string;
  text: string;
  x: number; // position as a fraction of the viewport
  y: number;
  rot: number;
  at: number;
  kind?: "text" | "voice";
  audio?: string; // IndexedDB key of a voice note
  dur?: number;
  docked?: "left" | "right" | "top" | "bottom" | null; // pushed off the screen edge
  // stuck on an ayah brought up beside the page (its window): carried with it, at this offset (px)
  win?: string;
  wx?: number;
  wy?: number;
  label?: string; // what it is on, shown on it (a section of the Seerah); else "ayah <key>"
};

/**
 * An ayah brought up beside the page (AyahWindows.tsx): it belongs to the ayah the reader was on
 * (`key`), and shows whenever that ayah does; tied by a thread to that ayah, or to one of its words
 * (`tie`); a note of its own written in it.
 */
export type AyahWindow = {
  id: string;
  key: string; // the ayah it belongs to ("67:3")
  s: number; // the ayah it shows
  a: number;
  x: number; // its place, as a fraction of the viewport
  y: number;
  // a thread to the ayah, a word of it, or a spot beside it (where in the ayah's box, or the book's, as fractions of it)
  tie?: { field: "ar" | "tr"; w: number } | { field: "ayah" } | { field: "spot"; fx: number; fy: number; book?: boolean } | null;
  note?: string;
  at: number;
};

/** The voices the Qur'an can be heard in (lib/recite.ts): every one has all 114 surahs. */
export type ReciterId = "alafasy" | "dosari" | "abkar" | "salimi" | "khalaf";

export type Recording = { id: string; at: number; dur: number };
export type Reflection = { summary: string; lessons: string; updatedAt: number; recordings: Recording[] };

export type Settings = {
  translation: Translation; // the main one (highlights, context, copy and share follow it)
  also: Translation[]; // shown under it, in this order (up to two more)
  showContext: boolean;
  readingMode: "both" | "arabic" | "translation";
  arabicScale: number;
  transScale: number;
  wordHover: boolean;
  translit: boolean; // in a word's meaning
  translitLine: boolean; // the whole ayah transliterated, under its Arabic
  theme: ThemeId; // the whole site's look (lib/themes.ts)
  grain: boolean;
  slider: boolean; // the ayah slider under the reading frame
  reduceMotion: boolean;
  view: 1 | 3;
  book: boolean; // Arabic only or a translation only, in the multiple-ayah view: the ayahs run on like a book
  bookLines: boolean; // the Arabic as a book, line for line as the printed mushaf (its size fitted to them)
  bookThemes: boolean; // the translation read as a book: its paragraphs headed by their themes
  script: "uthmani" | "indopak"; // the Arabic: Madani (KFGQPC Hafs) or Indo-Pak
  // the site's sounds (lib/sound.ts): all of them, and each kind on its own
  sound: boolean;
  sounds: boolean; // the marker's sound when highlighting
  soundTaps: boolean; // buttons, switches, menus
  soundTyping: boolean; // keys, writing a note or a reflection
  soundNotes: boolean; // a note picked up and put down
  soundRecord: boolean; // a recording starting and stopping
  soundComplete: boolean; // a surah marked as completed
  soundSlider: boolean; // the ayah slider's fine click for each ayah
  reciter: ReciterId;
};

/** A folder of bookmarks, named by the reader; every bookmark is also under All. */
export type Folder = { id: string; name: string; at: number };

/**
 * A reading goal, kept simple: a number of surahs each week or each month, or the whole Qur'an
 * by a date. Progress is the surahs the reader has marked as completed.
 */
export type Goal = { kind: "week" | "month"; count: number } | { kind: "khatm"; by: string; from: number };

type State = {
  settings: Settings;
  folders: Record<string, Folder>;
  inFolders: Record<string, string[]>; // bookmark key -> the folders it is in
  done: Record<string, number>; // surah -> when the reader marked it as completed
  goal: Goal | null;
  addFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  setInFolders: (key: string, ids: string[]) => void;
  toggleDone: (surah: number) => void;
  setGoal: (g: Goal | null) => void;
  bookmarks: Record<string, number>;
  highlights: Record<string, Highlight>;
  notes: Record<string, Note>;
  windows: Record<string, AyahWindow>;
  addWindow: (w: AyahWindow) => void;
  updateWindow: (id: string, p: Partial<AyahWindow>) => void;
  removeWindow: (id: string) => void;
  reflections: Record<number, Reflection>;
  last: { s: number; v: number } | null;
  // the Seerah: the section it was left at, and which way its sections turn
  seerah: { at: string | null; axis: "y" | "x" };
  setSeerah: (p: Partial<{ at: string | null; axis: "y" | "x" }>) => void;
  set: (p: Partial<Settings>) => void;
  toggleBookmark: (key: string) => void;
  addHighlight: (h: Highlight) => void;
  updateHighlight: (id: string, p: Partial<Highlight>) => void;
  removeHighlight: (id: string) => void;
  addNote: (n: Note) => void;
  updateNote: (id: string, p: Partial<Note>) => void;
  removeNote: (id: string) => void;
  saveReflection: (s: number, p: Partial<Reflection>) => void;
  setLast: (s: number, v: number) => void;
  clearAll: () => void;
};

const DEFAULTS: Settings = {
  translation: "qme",
  also: [],
  showContext: true,
  readingMode: "both",
  arabicScale: 1,
  transScale: 1,
  wordHover: true,
  translit: true,
  translitLine: false,
  theme: DEFAULT_THEME,
  slider: true,
  grain: true,
  reduceMotion: false,
  view: 1,
  book: false,
  bookLines: true,
  bookThemes: true,
  script: "uthmani",
  sound: true,
  sounds: true,
  soundTaps: true,
  soundTyping: true,
  soundNotes: true,
  soundRecord: true,
  soundComplete: true,
  soundSlider: true,
  reciter: "alafasy",
};

const emptyReflection = (): Reflection => ({ summary: "", lessons: "", updatedAt: 0, recordings: [] });

export const useStore = create<State>()(
  persist(
    (set) => ({
      settings: DEFAULTS,
      folders: {},
      inFolders: {},
      done: {},
      goal: null,
      addFolder: (name) => {
        const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({ folders: { ...s.folders, [id]: { id, name: name.trim() || "Folder", at: Date.now() } } }));
        return id;
      },
      renameFolder: (id, name) =>
        set((s) => (s.folders[id] ? { folders: { ...s.folders, [id]: { ...s.folders[id], name: name.trim() || s.folders[id].name } } } : s)),
      removeFolder: (id) =>
        set((s) => {
          const folders = { ...s.folders };
          delete folders[id];
          // its bookmarks stay, under All and their other folders
          const inFolders = Object.fromEntries(Object.entries(s.inFolders).map(([k, ids]) => [k, ids.filter((x) => x !== id)]));
          return { folders, inFolders };
        }),
      setInFolders: (key, ids) => set((s) => ({ inFolders: { ...s.inFolders, [key]: ids } })),
      toggleDone: (surah) =>
        set((s) => {
          const done = { ...s.done };
          if (done[surah]) delete done[surah];
          else done[surah] = Date.now();
          return { done };
        }),
      setGoal: (goal) => set({ goal }),
      bookmarks: {},
      highlights: {},
      notes: {},
      windows: {},
      addWindow: (w) => set((s) => ({ windows: { ...s.windows, [w.id]: w } })),
      updateWindow: (id, p) => set((s) => (s.windows[id] ? { windows: { ...s.windows, [id]: { ...s.windows[id], ...p } } } : s)),
      removeWindow: (id) =>
        set((s) => {
          const windows = { ...s.windows };
          const w = windows[id];
          delete windows[id];
          // the notes stuck on it stay where they were, free
          const notes = Object.fromEntries(
            Object.entries(s.notes).map(([k, n]) =>
              n.win === id && w
                ? [k, { ...n, win: undefined, wx: undefined, wy: undefined, x: w.x + (n.wx ?? 0) / window.innerWidth, y: w.y + (n.wy ?? 0) / window.innerHeight }]
                : [k, n],
            ),
          );
          return { windows, notes };
        }),
      reflections: {},
      last: null,
      seerah: { at: null, axis: "y" },
      setSeerah: (p) => set((s) => ({ seerah: { ...s.seerah, ...p } })),
      set: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      toggleBookmark: (key) =>
        set((s) => {
          const b = { ...s.bookmarks };
          const inFolders = { ...s.inFolders };
          if (b[key]) {
            delete b[key];
            delete inFolders[key];
          } else b[key] = Date.now();
          return { bookmarks: b, inFolders };
        }),
      addHighlight: (h) => set((s) => ({ highlights: { ...s.highlights, [h.id]: h } })),
      updateHighlight: (id, p) =>
        set((s) => (s.highlights[id] ? { highlights: { ...s.highlights, [id]: { ...s.highlights[id], ...p } } } : s)),
      removeHighlight: (id) =>
        set((s) => {
          const h = { ...s.highlights };
          delete h[id];
          // notes attached to the highlight stay, but lose the link
          const notes = Object.fromEntries(
            Object.entries(s.notes).map(([k, n]) => [k, n.hid === id ? { ...n, hid: undefined } : n]),
          );
          return { highlights: h, notes };
        }),
      addNote: (n) => set((s) => ({ notes: { ...s.notes, [n.id]: n } })),
      updateNote: (id, p) => set((s) => (s.notes[id] ? { notes: { ...s.notes, [id]: { ...s.notes[id], ...p } } } : s)),
      removeNote: (id) =>
        set((s) => {
          const n = { ...s.notes };
          delete n[id];
          return { notes: n };
        }),
      saveReflection: (surah, p) =>
        set((s) => ({
          reflections: {
            ...s.reflections,
            [surah]: { ...(s.reflections[surah] ?? emptyReflection()), ...p, updatedAt: Date.now() },
          },
        })),
      setLast: (s, v) => set({ last: { s, v } }),
      clearAll: () => set({ bookmarks: {}, inFolders: {}, folders: {}, highlights: {}, notes: {}, windows: {}, reflections: {}, last: null }),
    }),
    {
      name: "quran-reader",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = { ...((persisted ?? {}) as Partial<State> & { stats?: unknown }) };
        delete p.stats; // the reading counts the site once kept are gone
        const settings: Settings & Record<string, unknown> = { ...DEFAULTS, ...(p.settings ?? {}) };
        // the themes the site no longer has (Classic, Monochrome, Atlas, Folio, Blue): its own, Sajjadah
        if (!THEME_IDS.includes(settings.theme)) settings.theme = DEFAULT_THEME;
        delete settings.boxTheme;
        delete settings.monoSky;
        delete settings.monoCard;
        delete settings.arabicSpacing; // (the Arabic is always set as near as a mushaf sets it)
        return { ...current, ...p, settings };
      },
    },
  ),
);


