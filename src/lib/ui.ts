import { create } from "zustand";
import type { ReactNode } from "react";
import type { Note } from "./store";
import { sfx } from "./sound";

export type MenuItem =
  | { type: "item"; label: string; hint?: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean }
  | { type: "sep" }
  | { type: "label"; label: string };

type UI = {
  flipped: boolean;
  setFlipped: (b: boolean) => void;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  closeMenu: () => void;
  noteShare: Note | null; // a note being shared (its picture or video)
  shareNote: (n: Note | null) => void;
  about: boolean; // the About page, over whatever page is open
  setAbout: (b: boolean) => void;
  focus: boolean; // reading with nothing else: the frame fills the screen, only the ayahs and their tools
  setFocus: (b: boolean) => void;
  // the frame changing size into focus or out of it: the page waits, then lays itself out once
  reflow: boolean;
  setReflow: (b: boolean) => void;
  // an ayah a note refers to ("see 23:12"), open beside it to read without leaving the page
  peek: Peek | null;
  setPeek: (p: Peek | null) => void;
};

// (from: the note it was opened from; it goes when that note does)
export type Peek = { s: number; a: number; to?: number; x: number; y: number; w: number; h: number; pinned?: boolean; from?: string };

/** Session-only interface state shared across the frame. */
export const useUI = create<UI>((set) => ({
  flipped: false,
  setFlipped: (flipped) => set({ flipped }),
  menu: null,
  openMenu: (x, y, items) => {
    sfx("menu"); // (a right click, a long press, two fingers)
    set({ menu: { x, y, items } });
  },
  closeMenu: () => set({ menu: null }),
  noteShare: null,
  shareNote: (noteShare) => set({ noteShare }),
  about: false,
  setAbout: (about) => set({ about }),
  focus: false,
  setFocus: (focus) => set({ focus }),
  reflow: false,
  setReflow: (reflow) => set({ reflow }),
  peek: null,
  setPeek: (peek) => set({ peek }),
}));
