// Where the mushaf's pages and the quarters of its hizbs begin, for the search ("page 50", "hizb 10"):
//   → src/lib/marks.json (bundled with the search): { page: ["s:a" of the ayah each page begins with (1–604)],
//                                rub: ["s:a" each quarter of a hizb begins at (1–240)] }
// The pages from the printed lines (public/data/qcf, scripts/fetch_qcf.mjs): a page begins with the
// ayah whose words first reach it. The quarters from quran.com.
// Run: node scripts/build_marks.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const page = Array(604).fill(null);
for (let s = 1; s <= 114; s++) {
  const q = JSON.parse(fs.readFileSync(path.join(root, "public/data/qcf", `${s}.json`), "utf8"));
  q.v.forEach((v, i) => {
    for (const l of [...v.l, v.le]) {
      const p = Math.floor(l / 100);
      if (p >= 1 && p <= 604 && !page[p - 1]) page[p - 1] = `${s}:${i + 1}`;
    }
  });
}
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
const rub = [];
for (let n = 1; n <= 240; n++) {
  const j = await get(`https://api.qurancdn.com/api/qdc/verses/by_rub_el_hizb/${n}?per_page=1&fields=verse_key`);
  rub.push(j.verses[0].verse_key);
  if (n % 20 === 0) process.stdout.write(`${n} `);
}
const missing = page.filter((x) => !x).length;
fs.writeFileSync(path.join(root, "src/lib/marks.json"), JSON.stringify({ page, rub }));
console.log(`\npages ${page.length - missing}/604 (first ${page[0]}, 50th ${page[49]}, last ${page[603]}); quarters ${rub.length} (hizb 2 begins ${rub[4]}, hizb 60 ${rub[236]})`);
