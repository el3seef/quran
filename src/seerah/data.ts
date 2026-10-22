/** The Seerah's text (seerah/*.md, built into public/data/seerah.json by scripts/build_seerah.mjs). */

export type LookKind = "text" | "map" | "image" | "quote" | "list" | "people" | "lineage" | "kabah" | "opener";
export type Era = "before" | "early" | "makkah" | "madinah" | "after";
export type Section = {
  id: string;
  title: string;
  when?: string;
  y: number; // (its year, for its place on the timeline)
  place?: string;
  look: { kind: LookKind; id?: string };
  tags?: string[];
  refs?: string[];
  body: string[];
  facts?: [string, string][];
  list?: [string, string][];
  people?: [string, string][];
  quote?: { text: string; who?: string };
  lineage?: string[];
  word?: string; // (its word, written large)
  mood?: string; // (its colours: moods.ts)
  img?: string; // (its picture: images.json)
  go?: string; // (which way it comes in: moods.ts)
  who?: string[]; // (the people named in it: their ids)
};
export type Part = { id: string; title: string; ar?: string; span: string; era: Era; blurb?: string; img?: string; mood?: string; sections: Section[] };
/** One of the people of the Seerah: their names, what they were, a little of their story, and the
 *  sections they are named in. */
export type Person = { id: string; name: string; ar?: string; also: string[]; role?: string; body: string[]; in: string[]; except?: string[] };
export type Seerah = { parts: Part[]; people: Person[] };

/** One turn of the Seerah: a part's opening, or a section of it. */
export type Slide = { id: string; kind: "part"; part: Part; pi: number } | { id: string; kind: "section"; part: Part; pi: number; s: Section; n: number };

let loading: Promise<Seerah> | null = null;
export const loadSeerah = () => (loading ??= fetch(`${import.meta.env.BASE_URL}data/seerah.json`).then((r) => r.json()));

export function slidesOf(seerah: Seerah): Slide[] {
  const out: Slide[] = [];
  let n = 0;
  seerah.parts.forEach((part, pi) => {
    out.push({ id: `part:${part.id}`, kind: "part", part, pi });
    for (const s of part.sections) out.push({ id: s.id, kind: "section", part, pi, s, n: ++n });
  });
  return out;
}

// an ayah to bring up, in the text: " [2:255]" or " [4:22-23]"
const REF = /\s*\[(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?\]/g;

/** A paragraph as its runs of words and the ayahs to bring up between them. */
export function runsOf(p: string): ({ text: string } | { ref: string; s: number; a: number; to?: number })[] {
  const out: ({ text: string } | { ref: string; s: number; a: number; to?: number })[] = [];
  let at = 0;
  for (const m of p.matchAll(REF)) {
    if (m.index! > at) out.push({ text: p.slice(at, m.index) });
    out.push({ ref: `${m[1]}:${m[2]}${m[3] ? `-${m[3]}` : ""}`, s: +m[1], a: +m[2], to: m[3] ? +m[3] : undefined });
    at = m.index! + m[0].length;
  }
  if (at < p.length) out.push({ text: p.slice(at) });
  return out;
}

/** A section's text as highlights count it: its paragraphs without the ayahs, a line between each. */
export const canonOf = (s: Section) => s.body.map((p) => p.replace(REF, "")).join("\n");

/** The timeline's stretches: before his birth (squeezed), his forty years, Makkah, Madinah, and after. */
export const ERAS: { era: Era; name: string; from: number; to: number; share: number }[] = [
  { era: "before", name: "Before", from: -2000, to: 570, share: 0.07 },
  { era: "early", name: "Forty years", from: 570, to: 610, share: 0.27 },
  { era: "makkah", name: "Makkah", from: 610, to: 622.7, share: 0.27 },
  { era: "madinah", name: "Madinah", from: 622.7, to: 632.5, share: 0.33 },
  { era: "after", name: "", from: 632.5, to: 640, share: 0.06 },
];

/** The stretch of the timeline a year is in. */
export const eraOf = (y: number): Era => ERAS.find((e) => y < e.to)?.era ?? "after";

/** Where a year falls along the timeline (0 to 1); before his birth, by the order of its sections. */
export function timeAt(y: number, era: Era, orderInEra?: number, ofEra?: number) {
  let start = 0;
  for (const e of ERAS) {
    if (e.era === era) {
      if ((era === "before" || era === "after") && orderInEra !== undefined && ofEra) return start + (e.share * (orderInEra + 0.5)) / ofEra;
      const t = Math.min(1, Math.max(0, (y - e.from) / (e.to - e.from)));
      return start + e.share * t;
    }
    start += e.share;
  }
  return 1;
}
