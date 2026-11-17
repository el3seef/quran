// The printed Madani mushaf, glyph for glyph, for the book layout: the King Fahd Complex's 15-line
// print as quran.com sets it in the Complex's own page fonts (QCF V2, a font for each of the 604
// pages, in which every word is drawn as the print draws it, so each printed line comes out the
// print's own width).
//   → public/data/qcf/<surah>.json:
//     { v: [{ g: [glyph of each word], e: glyph of the ayah's end, l: [line of each word], le: line
//       of the end }], pages: { "<page>": { j: juz, r: the quarter of a hizb that begins on the page,
//       if one does } } }
//     a line is page × 100 + its line on the page.
// The words are checked against the reader's own: every ayah must have as many as the reader shows.
// Run: node scripts/fetch_qcf.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const OUT = path.join(root, "public/data/qcf");
fs.mkdirSync(OUT, { recursive: true });
const get = async (url) => {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (r.ok) return r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error("failed: " + url);
};

const surahs = {}; // n -> { v: [], pages: {} }
const types = new Map();
let bad = 0;
let lastRub = 0;
for (let page = 1; page <= 604; page++) {
  const verses = [];
  for (let p = 1; ; p++) {
    const j = await get(`https://api.qurancdn.com/api/qdc/verses/by_page/${page}?words=true&word_fields=code_v2,line_number,page_number,char_type_name,text_uthmani&mushaf=1&per_page=50&page=${p}`);
    verses.push(...j.verses);
    if (!j.pagination?.next_page) break;
  }
  for (const v of verses) {
    const [s, a] = v.verse_key.split(":").map(Number);
    const S = (surahs[s] ??= { v: [], pages: {} });
    const pg = (S.pages[page] ??= { j: v.juz_number });
    // (a quarter of a hizb beginning here: its number, 1–240)
    if (v.rub_el_hizb_number !== lastRub) {
      lastRub = v.rub_el_hizb_number;
      if (pg.r === undefined) pg.r = lastRub;
    }
    const g = [], l = [];
    let e = "", le = 0;
    for (const w of v.words) {
      types.set(w.char_type_name, (types.get(w.char_type_name) ?? 0) + 1);
      const at = w.page_number * 100 + w.line_number;
      // (an ayah's number is sometimes listed as a word: 2:181)
      if (w.char_type_name === "end" || /^[٠-٩]+$/.test(w.text_uthmani ?? "")) {
        e = w.code_v2;
        le = at;
      } else {
        g.push(w.code_v2);
        l.push(at);
      }
    }
    S.v[a - 1] = { g, e, l, le };
  }
  process.stdout.write(`${page} `);
}
console.log("\nword types:", Object.fromEntries(types));
for (const [n, S] of Object.entries(surahs)) {
  const mine = JSON.parse(fs.readFileSync(path.join(root, "public/data/s", `${n}.json`), "utf8")).v;
  mine.forEach((v, i) => {
    const q = S.v[i];
    if (!q) return void (console.log(`${n}:${i + 1} missing`), bad++);
    if (q.g.length !== v.a.length) {
      console.log(`${n}:${i + 1} words ${q.g.length} vs ${v.a.length}`);
      bad++;
    }
  });
  fs.writeFileSync(path.join(OUT, `${n}.json`), JSON.stringify(S));
}
console.log(`written ${Object.keys(surahs).length} surahs; mismatched ayat: ${bad}`);
