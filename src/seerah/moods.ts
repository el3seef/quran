import type { SeerahSfx } from "@/lib/sound";
import type { Section, Slide } from "./data";

/**
 * The Seerah's colours, by what a section tells of: the desert's sand by day, its dusk and its night,
 * parchment for lineages and pacts, the white and gold of the House and the pilgrimage, the dawn of
 * the first believers, embers for the years of torment, the green of Madinah's palms, iron for the
 * battles, and ash for the deaths. Each is a few colours (laid on a section as CSS variables), how
 * its pictures are tinted, whether it is light or dark, and the sound that greets it.
 */
export type Mood = "sand" | "parchment" | "white" | "dawn" | "dusk" | "night" | "ember" | "oasis" | "iron" | "grief";

type Palette = {
  bg: string; // the ground (a colour or a gradient)
  ground: string; // its colour at the foot, plain (what the controls stand on)
  ink: string; // the words
  soft: string; // the quieter words
  faint: string; // the quietest
  line: string; // rules and borders
  accent: string; // the one colour that stands out
  word: string; // the great word behind it all
  grade: string; // a CSS filter for its pictures
  blend: "multiply" | "screen" | "normal"; // how a picture's plain ground melts into the page
  light: boolean;
  sound?: SeerahSfx;
};

export const MOODS: Record<Mood, Palette> = {
  sand: {
    ground: "#d8be90",
    bg: "radial-gradient(120% 90% at 70% 20%, #f1e5cc 0%, #e6d3ae 55%, #d6bb8c 100%)",
    ink: "#2a1b10",
    soft: "rgba(42,27,16,0.72)",
    faint: "rgba(42,27,16,0.45)",
    line: "rgba(42,27,16,0.18)",
    accent: "#a3421c",
    word: "#b4532a",
    grade: "sepia(0.25) saturate(1.05) contrast(1.04)",
    blend: "multiply",
    light: true,
    sound: "wind",
  },
  parchment: {
    ground: "#dccaa4",
    bg: "radial-gradient(120% 100% at 30% 10%, #f4ecdb 0%, #ebdfc4 60%, #dccaa4 100%)",
    ink: "#1d1712",
    soft: "rgba(29,23,18,0.72)",
    faint: "rgba(29,23,18,0.45)",
    line: "rgba(29,23,18,0.2)",
    accent: "#7b1e1e",
    word: "#7b1e1e",
    grade: "grayscale(0.3) sepia(0.35) contrast(1.06)",
    blend: "multiply",
    light: true,
    sound: "paper",
  },
  white: {
    ground: "#e6dcc7",
    bg: "radial-gradient(120% 100% at 50% 0%, #fbf8f1 0%, #f1ebde 60%, #e3d8c2 100%)",
    ink: "#18160f",
    soft: "rgba(24,22,15,0.7)",
    faint: "rgba(24,22,15,0.42)",
    line: "rgba(24,22,15,0.16)",
    accent: "#a5802f",
    word: "#3d6166",
    grade: "saturate(0.9) contrast(1.03) brightness(1.03)",
    blend: "multiply",
    light: true,
    sound: "chime",
  },
  dawn: {
    ground: "#c98f86",
    bg: "linear-gradient(170deg, #f6e2d0 0%, #ecc3ac 45%, #c98f86 100%)",
    ink: "#2a1518",
    soft: "rgba(42,21,24,0.72)",
    faint: "rgba(42,21,24,0.45)",
    line: "rgba(42,21,24,0.18)",
    accent: "#8a2f3e",
    word: "#8a2f3e",
    grade: "sepia(0.2) saturate(1.1) hue-rotate(-8deg)",
    blend: "multiply",
    light: true,
    sound: "chime",
  },
  dusk: {
    ground: "#d9875a",
    bg: "linear-gradient(175deg, #1c1430 0%, #3d2142 38%, #9a4a46 72%, #e0905b 100%)",
    ink: "#fbeee0",
    soft: "rgba(251,238,224,0.76)",
    faint: "rgba(251,238,224,0.5)",
    line: "rgba(251,238,224,0.2)",
    accent: "#ffb47c",
    word: "#ffb47c",
    grade: "sepia(0.3) saturate(1.2) hue-rotate(-12deg) contrast(1.05)",
    blend: "screen",
    light: false,
    sound: "wind",
  },
  night: {
    ground: "#04060f",
    bg: "radial-gradient(120% 90% at 50% 0%, #182046 0%, #0b1029 45%, #04060f 100%)",
    ink: "#e8ecf8",
    soft: "rgba(232,236,248,0.74)",
    faint: "rgba(232,236,248,0.46)",
    line: "rgba(232,236,248,0.16)",
    accent: "#c7d3ff",
    word: "rgba(199,211,255,0.9)",
    grade: "grayscale(0.4) brightness(0.85) contrast(1.1) hue-rotate(190deg) saturate(0.6)",
    blend: "screen",
    light: false,
    sound: "chime",
  },
  ember: {
    ground: "#0c0605",
    bg: "radial-gradient(120% 90% at 30% 100%, #4a140c 0%, #200a07 50%, #0c0605 100%)",
    ink: "#f4e4d8",
    soft: "rgba(244,228,216,0.74)",
    faint: "rgba(244,228,216,0.46)",
    line: "rgba(244,228,216,0.16)",
    accent: "#e5482a",
    word: "#e5482a",
    grade: "sepia(0.5) saturate(1.4) hue-rotate(-20deg) contrast(1.15) brightness(0.85)",
    blend: "screen",
    light: false,
    sound: "ember",
  },
  oasis: {
    ground: "#0a1d17",
    bg: "radial-gradient(120% 100% at 70% 0%, #24503f 0%, #143429 50%, #0a1d17 100%)",
    ink: "#eef3e5",
    soft: "rgba(238,243,229,0.76)",
    faint: "rgba(238,243,229,0.48)",
    line: "rgba(238,243,229,0.18)",
    accent: "#e4c46a",
    word: "#e4c46a",
    grade: "sepia(0.2) saturate(1.1) hue-rotate(15deg) contrast(1.05)",
    blend: "screen",
    light: false,
    sound: "wind",
  },
  iron: {
    ground: "#141618",
    bg: "radial-gradient(120% 100% at 50% 100%, #2b2e33 0%, #16181b 55%, #0a0b0c 100%)",
    ink: "#ece6dc",
    soft: "rgba(236,230,220,0.74)",
    faint: "rgba(236,230,220,0.46)",
    line: "rgba(236,230,220,0.16)",
    accent: "#c2363a",
    word: "#c2363a",
    grade: "grayscale(0.6) contrast(1.2) brightness(0.9)",
    blend: "screen",
    light: false,
    sound: "thud",
  },
  grief: {
    ground: "#131417",
    bg: "radial-gradient(120% 100% at 50% 0%, #34373e 0%, #1f2126 60%, #131417 100%)",
    ink: "#dcd8d0",
    soft: "rgba(220,216,208,0.72)",
    faint: "rgba(220,216,208,0.44)",
    line: "rgba(220,216,208,0.14)",
    accent: "#a7adb8",
    word: "rgba(167,173,184,0.55)",
    grade: "grayscale(0.85) contrast(1.05) brightness(0.9)",
    blend: "screen",
    light: false,
  },
};

/** A section's mood: its own, else by what it tells of, else its part's. */
export function moodOf(slide: Slide): Mood {
  if (slide.kind === "part") return (slide.part.mood as Mood) ?? moodOf({ ...slide, kind: "section", s: slide.part.sections[0], n: 0 } as Slide);
  const s = slide.s;
  if (s.mood) return s.mood as Mood;
  const t = s.tags ?? [];
  if (t.includes("battles")) return "iron";
  if (t.includes("treaties") || t.includes("letters")) return "parchment";
  if (t.includes("revelation") || t.includes("signs")) return "night";
  if (t.includes("journeys")) return "dusk";
  if (t.includes("madinah")) return "oasis";
  return "sand";
}

/** The CSS variables of a mood, to lay on an element. */
export const moodVars = (m: Mood) => {
  const p = MOODS[m];
  return {
    "--s-bg": p.bg,
    "--s-ground": p.ground,
    "--s-ink": p.ink,
    "--s-soft": p.soft,
    "--s-faint": p.faint,
    "--s-line": p.line,
    "--s-accent": p.accent,
    "--s-word": p.word,
    "--s-grade": p.grade,
    "--s-blend": p.blend,
  } as React.CSSProperties;
};

export type Way = "down" | "up" | "right" | "left" | "in";

/**
 * Which way a section comes in: its own, else by what it is. A part's opening and a map come from the
 * side, as if the eye moved across to them; a saying comes toward the reader; the rest from below. So
 * the Seerah reads as one great picture moved about, not a column or a row.
 */
export function wayOf(slide: Slide): Way {
  if (slide.kind === "part") return "right";
  const s: Section = slide.s;
  if (s.go) return s.go as Way;
  const k = s.look.kind;
  if (k === "map" || k === "list" || k === "people" || k === "lineage") return "right";
  if (k === "quote" || k === "kabah") return "in";
  return "down";
}

/** A way as a step across the picture: x and y in whole screens, z toward the reader. */
export const step = (w: Way) => ({ down: { x: 0, y: 1, z: 0 }, up: { x: 0, y: -1, z: 0 }, right: { x: 1, y: 0, z: 0 }, left: { x: -1, y: 0, z: 0 }, in: { x: 0, y: 0, z: 1 } })[w];
