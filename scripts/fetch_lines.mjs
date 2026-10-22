// The printed mushaf's line breaks, for the book layout: where in each surah a new line of the page
// begins, as quran.com sets each print's words.
//  - the Madani mushaf, the King Fahd Complex's 15-line print (QCF V2, quran.com's mushaf 1): the
//    print the site's Hafs font is made for → public/data/lines.json
//  - MUSHAF=6: the Indo-Pak 15-line print → public/data/lines-indopak.json
// Each: { "<surah>": [a, w, a, w, …] } — a new line begins at word w (0-based) of ayah a. The surah's
// first line is not listed (it begins the text). Checked against the reader's own words: every ayah
// must have as many words as the reader shows.
// Run: node scripts/fetch_lines.mjs   (and MUSHAF=6 node scripts/fetch_lines.mjs)
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const MUSHAF = Number(process.env.MUSHAF || 1);
const FILE = MUSHAF === 6 ? "lines-indopak.json" : "lines.json";
const out = {};
const get = async (url) => {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (r.ok) return r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error("failed: " + url);
};

let bad = 0;
for (let n = 1; n <= 114; n++) {
  const verses = [];
  for (let page = 1; ; page++) {
    const j = await get(`https://api.qurancdn.com/api/qdc/verses/by_chapter/${n}?words=true&word_fields=line_number,page_number,char_type_name,text_uthmani&mushaf=${MUSHAF}&per_page=50&page=${page}`);
    verses.push(...j.verses);
    if (!j.pagination?.next_page) break;
  }
  const mine = JSON.parse(fs.readFileSync(path.join(root, "public/data/s", `${n}.json`), "utf8")).v;
  const starts = [];
  let prev = null;
  for (const v of verses) {
    const a = v.verse_number;
    // (an ayah's number is sometimes listed as a word: 2:181)
    const isWord = (w) => w.char_type_name === "word" && !/^[٠-٩]+$/.test(w.text_uthmani ?? w.text ?? "");
    const words = v.words.filter(isWord);
    if (words.length !== mine[a - 1].a.length) {
      console.log(`${n}:${a} words ${words.length} vs ${mine[a - 1].a.length}`);
      bad++;
    }
    let wi = 0;
    for (const w of v.words) {
      const at = `${w.page_number}/${w.line_number}`;
      // (word to word: the source sets an ayah's number on the line after its last word at times)
      if (!isWord(w)) continue;
      if (prev !== null && at !== prev) starts.push(a, wi);
      wi++;
      prev = at;
    }
  }
  out[n] = starts;
  process.stdout.write(`${n} `);
}
fs.writeFileSync(path.join(root, "public/data", FILE), JSON.stringify(out));
console.log(`\nwritten; mismatched ayat: ${bad}`);
