/**
 * The printed Madani mushaf, glyph for glyph (the book layout's Arabic): the King Fahd Complex's
 * 15-line print as quran.com sets it, in the Complex's own font for each page (QCF V2). Every word is
 * one or two glyphs drawn exactly as the print draws them, so a printed line set in its page's font
 * comes out the print's own width, and the lines of a page are as even as the print's.
 * The words of each ayah, their lines, and the pages' juz and quarters: public/data/qcf/<surah>.json
 * (scripts/fetch_qcf.mjs). The fonts are quran.com's, fetched a page at a time as the reader comes to it.
 */
export type QcfAyah = { g: string[]; e: string; l: number[]; le: number };
export type Qcf = { v: QcfAyah[]; pages: Record<string, { j: number; r?: number }> };

const data = new Map<number, Promise<Qcf>>();
export function loadQcf(surah: number) {
  let p = data.get(surah);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/qcf/${surah}.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Qcf>;
    });
    p.catch(() => data.delete(surah));
    data.set(surah, p);
  }
  return p;
}

export const qcfFamily = (page: number) => `qcf-p${page}`;
const FONT = (page: number) => `https://verses.quran.com/fonts/quran/hafs/v2/woff2/p${page}.woff2`;
const faces = new Map<number, Promise<boolean>>();
const ready = new Set<number>();
/** A page's font, fetched once: true when it can be drawn in, false if it could not be had (offline). */
export function loadPageFont(page: number) {
  let p = faces.get(page);
  if (!p) {
    const face = new FontFace(qcfFamily(page), `url(${FONT(page)}) format("woff2")`, { display: "block" });
    p = face
      .load()
      .then((f) => {
        document.fonts.add(f);
        ready.add(page);
        return true;
      })
      .catch(() => {
        faces.delete(page); // (tried again the next time the page is come to)
        return false;
      });
    faces.set(page, p);
  }
  return p;
}
export const pageFontReady = (page: number) => ready.has(page);

/** A quarter of a hizb (1–240) as the print heads its page: "Hizb 3", "¼ Hizb 3", "½ Hizb 3", "¾ Hizb 3". */
export function quarterName(r: number) {
  const h = Math.ceil(r / 4);
  return `${["", "¼ ", "½ ", "¾ "][(r - 1) % 4]}Hizb ${h}`;
}
