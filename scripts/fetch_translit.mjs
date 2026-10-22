// The ayahs' transliteration, as alquran.cloud publishes it (edition en.transliteration), word for word
// as given: one file a surah, public/data/tl/<surah>.json, an array of the ayahs' lines; and all of
// them in one, public/data/translit.json ([ref, line], …), for the search.
// Run: node scripts/fetch_translit.mjs
import fs from "node:fs";
import path from "node:path";

// the one slip in it: a capital I printed as a small l ("lyyaaka", 1:5)
const FIXES = { "1:5": (t) => t.replace("wa lyyaaka", "wa Iyyaaka") };
const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "public/data/tl");
fs.mkdirSync(dir, { recursive: true });
const r = await fetch("https://api.alquran.cloud/v1/quran/en.transliteration", { headers: { "User-Agent": "Mozilla/5.0" } });
const j = await r.json();
let total = 0;
const all = []; // (every ayah's, in one file: what the search looks through)
for (const s of j.data.surahs) {
  const mine = JSON.parse(fs.readFileSync(path.join(root, "public/data/s", `${s.number}.json`), "utf8")).v;
  if (mine.length !== s.ayahs.length) throw new Error(`surah ${s.number}: ${s.ayahs.length} vs ${mine.length}`);
  fs.writeFileSync(path.join(dir, `${s.number}.json`), JSON.stringify(s.ayahs.map((a) => (FIXES[`${s.number}:${a.numberInSurah}`] ?? ((t) => t))(a.text.trim()))));
  total += s.ayahs.length;
  for (const a of s.ayahs) all.push([`${s.number}:${a.numberInSurah}`, (FIXES[`${s.number}:${a.numberInSurah}`] ?? ((t) => t))(a.text.trim())]);
}
fs.writeFileSync(path.join(root, "public/data/translit.json"), JSON.stringify(all));
console.log("ayat:", total);
