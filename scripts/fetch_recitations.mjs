// The reciters' timings: where each ayah begins and ends in the surah's recording, and where each of
// its words begins. A reciter is taken only if every one of the 114 surahs is there.
//  - quran.com (QDC): the recording and its own word timings (Alafasy, Al-Dosari).
//  - mp3quran.net: the recording and its ayah timings; the words within an ayah are placed by the
//    proportions of the same ayah's words in the two recitations quran.com times word by word (so a
//    word held long by the rules of recitation is held long here too), flagged `est`.
// Writes public/data/recite/<reciter>/<surah>.json: { u: url, a: [[from, to], …], w: [[start of each
// word], …], est?: 1 } (milliseconds).
// Run: node scripts/fetch_recitations.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const RECITERS = [
  { key: "alafasy", qdc: 7 },
  { key: "dosari", qdc: 97 },
  { key: "abkar", mp3: 12 },
  { key: "salimi", mp3: 245 },
  { key: "khalaf", mp3: 244 },
];
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
const words = (n) => JSON.parse(fs.readFileSync(path.join(root, "public/data/s", `${n}.json`), "utf8")).v.map((v) => v.a.length);

/** an ayah's word starts from quran.com's segments ([word, start, end], words from 1), gaps filled */
function starts(segs, count, from, to) {
  const at = Array(count).fill(null);
  for (const s of segs ?? []) {
    const [w, a] = s;
    if (w >= 1 && w <= count && at[w - 1] === null) at[w - 1] = a;
  }
  if (at[0] === null) at[0] = from;
  // a word without its time: between its neighbours
  for (let i = 1; i < count; i++) {
    if (at[i] !== null) continue;
    let j = i;
    while (j < count && at[j] === null) j++;
    const lo = at[i - 1], hi = j < count ? at[j] : to;
    for (let k = i; k < j; k++) at[k] = Math.round(lo + ((hi - lo) * (k - i + 1)) / (j - i + 1));
    i = j - 1;
  }
  for (let i = 1; i < count; i++) at[i] = Math.max(at[i], at[i - 1]);
  return at;
}

const qdcCache = {};
async function qdc(id, n) {
  const key = `${id}/${n}`;
  if (qdcCache[key]) return qdcCache[key];
  const j = await get(`https://api.qurancdn.com/api/qdc/audio/reciters/${id}/audio_files?chapter=${n}&segments=true`);
  const f = j.audio_files?.[0];
  if (!f) throw new Error(`no recording ${key}`);
  const counts = words(n);
  if (f.verse_timings.length !== counts.length) throw new Error(`${key}: ${f.verse_timings.length} ayat`);
  const a = f.verse_timings.map((t) => [t.timestamp_from, t.timestamp_to]);
  const w = f.verse_timings.map((t, i) => starts(t.segments, counts[i], t.timestamp_from, t.timestamp_to));
  return (qdcCache[key] = { u: f.audio_url.replace(/([^:])\/\//g, "$1/"), a, w });
}

// each word's share of its ayah, from the recitations timed word by word
function shares(models, i, count) {
  const out = Array(count).fill(0);
  let used = 0;
  for (const m of models) {
    const [from, to] = m.a[i];
    const st = m.w[i];
    if (!st || st.length !== count || to <= from) continue;
    // (a word timed past its ayah's end, as one in 37:152 is, still takes a share of its own)
    const lens = st.map((s, k) => Math.max(40, (k + 1 < count ? st[k + 1] : to) - s));
    const sum = lens.reduce((x, y) => x + y, 0) || 1;
    lens.forEach((l, k) => (out[k] += l / sum));
    used++;
  }
  if (!used) return Array(count).fill(1 / count);
  return out.map((x) => x / used);
}

let failed = [];
// (only some: node scripts/fetch_recitations.mjs abkar salimi)
const only = process.argv.slice(2);
for (const r of RECITERS.filter((x) => !only.length || only.includes(x.key))) {
  const dir = path.join(root, "public/data/recite", r.key);
  fs.mkdirSync(dir, { recursive: true });
  let folder = null;
  if (r.mp3) {
    const reads = await get("https://www.mp3quran.net/api/v3/ayat_timing/reads");
    folder = reads.find((x) => x.id === r.mp3)?.folder_url;
    if (!folder) throw new Error("no folder for " + r.key);
  }
  for (let n = 1; n <= 114; n++) {
    try {
      let rec;
      if (r.qdc) rec = await qdc(r.qdc, n);
      else {
        const t = await get(`https://www.mp3quran.net/api/v3/ayat_timing?surah=${n}&read=${r.mp3}`);
        const counts = words(n);
        const ay = t.filter((x) => x.ayah >= 1).sort((x, y) => x.ayah - y.ayah);
        if (ay.length !== counts.length) throw new Error(`${r.key} ${n}: ${ay.length} ayat`);
        const a = ay.map((x) => [x.start_time, x.end_time]);
        const models = [await qdc(7, n), await qdc(97, n)];
        const w = a.map(([from, to], i) => {
          const sh = shares(models, i, counts[i]);
          let at = from;
          return sh.map((s) => {
            const here = Math.round(at);
            at += s * (to - from);
            return here;
          });
        });
        rec = { u: `${folder}${String(n).padStart(3, "0")}.mp3`, a, w, est: 1 };
      }
      fs.writeFileSync(path.join(dir, `${n}.json`), JSON.stringify(rec));
      process.stdout.write(".");
    } catch (e) {
      failed.push(`${r.key} ${n}: ${e.message}`);
      process.stdout.write("x");
    }
  }
  console.log(` ${r.key}`);
}
console.log(failed.length ? "FAILED:\n" + failed.join("\n") : "all 114 for every reciter");
