import { fromArabicDigits, loadSearchIndex, type Surah } from "./data";
import MARKS from "./marks.json";

export type Result =
  | { kind: "surah"; surah: Surah; score: number; why?: string }
  | { kind: "ayah"; surah: Surah; ayah: number; score: number; why?: string }
  | { kind: "juz"; juz: number; surah: Surah; ayah: number; score: number }
  | { kind: "text"; surah: Surah; ayah: number; snippet: string; match: [number, number][]; score: number; why?: string };

/** Other names and common spellings people type. */
export const ALIASES: Record<number, string[]> = {
  1: ["fatiha", "alhamd", "umm al kitab", "the opener", "seven oft repeated"],
  2: ["bakara", "baqara", "the heifer"],
  3: ["ali imran", "aal imran", "al imran", "family of imran", "house of imran"],
  4: ["nisa", "nisaa", "women"],
  5: ["maida", "maidah", "table", "the table spread", "the feast"],
  6: ["anam", "livestock", "cattle"],
  7: ["araf", "the heights", "the elevations"],
  8: ["anfal", "spoils of war", "the bounties"],
  9: ["tauba", "tawba", "baraah", "bara'ah", "repentance", "immunity"],
  10: ["jonah", "younus", "yoonus"],
  11: ["hood"],
  12: ["joseph", "yousuf", "yoosuf"],
  13: ["rad", "thunder"],
  14: ["abraham", "ibraheem"],
  15: ["hijr", "the rocky tract", "stoneland"],
  16: ["nahl", "the bee", "bees"],
  17: ["isra", "israa", "bani israil", "bani israel", "night journey", "children of israel"],
  18: ["kahaf", "the cave"],
  19: ["mary", "mariam", "maryum"],
  20: ["taha", "ta ha", "tah"],
  21: ["anbiya", "the prophets"],
  22: ["hajj", "pilgrimage"],
  23: ["muminoon", "mominun", "the believers"],
  24: ["noor", "the light"],
  25: ["furqan", "the criterion", "the standard"],
  26: ["shuara", "the poets"],
  27: ["naml", "the ants", "ant"],
  28: ["qasas", "kasas", "the stories", "the narration", "the whole story"],
  29: ["ankaboot", "the spider"],
  30: ["room", "the romans", "rome", "byzantines"],
  31: ["lukman", "luqmaan"],
  32: ["sajda", "sajdah", "prostration"],
  33: ["ahzab", "the confederates", "the clans", "the enemy alliance"],
  34: ["sheba", "saba"],
  35: ["fatir", "malaika", "the originator", "the angels"],
  36: ["yaseen", "yasin", "ya sin", "yaa seen", "heart of the quran"],
  37: ["saffat", "those ranged in ranks"],
  38: ["saad", "suad"],
  39: ["zumar", "the troops", "the groups"],
  40: ["ghafir", "mumin", "al mumin", "the forgiver"],
  41: ["fussilat", "ha mim sajdah", "hamim sajdah"],
  42: ["shura", "consultation"],
  43: ["zukhruf", "gold ornaments", "ornaments of gold"],
  44: ["dukhan", "smoke"],
  45: ["jathiya", "jasiya", "kneeling", "crouching"],
  46: ["ahqaf", "the sand dunes", "wind curved sandhills"],
  47: ["qital", "muhammad"],
  48: ["fath", "victory", "the triumph"],
  49: ["hujurat", "the rooms", "the inner apartments", "private quarters"],
  50: ["qaaf", "kaf"],
  51: ["dhariyat", "zariyat", "the winnowing winds", "scattering winds"],
  52: ["toor", "the mount", "mount sinai"],
  53: ["najm", "the star"],
  54: ["qamar", "the moon"],
  55: ["rehman", "rahmaan", "the most merciful", "the beneficent"],
  56: ["waqia", "waqiah", "the inevitable", "the event"],
  57: ["hadeed", "iron"],
  58: ["mujadala", "mujadilah", "the pleading woman", "the disputation"],
  59: ["hashr", "the exile", "the gathering"],
  60: ["mumtahina", "mumtahanah", "she that is to be examined", "the tested woman"],
  61: ["saff", "the ranks", "battle array"],
  62: ["juma", "jumuah", "jumma", "friday", "the congregation"],
  63: ["munafiqoon", "munafiqun", "the hypocrites"],
  64: ["taghabun", "mutual loss", "the mutual disillusion"],
  65: ["talaq", "divorce"],
  66: ["tahreem", "prohibition"],
  67: ["mulk", "tabarak", "dominion", "sovereignty", "the kingdom"],
  68: ["qalam", "noon", "nun", "the pen"],
  69: ["haqqa", "haaqqah", "the reality", "the inevitable hour"],
  70: ["maarij", "the ascending stairways", "ways of ascent"],
  71: ["nooh", "noah"],
  72: ["jin", "the jinn"],
  73: ["muzammil", "muzzammil", "the enshrouded one", "the wrapped"],
  74: ["mudassir", "muddathir", "muddaththir", "the cloaked one"],
  75: ["qiyama", "qiyamah", "resurrection"],
  76: ["dahr", "insaan", "man", "humanity", "time"],
  77: ["mursalat", "the emissaries", "those sent forth"],
  78: ["naba", "amma", "the tidings", "the great news", "the announcement"],
  79: ["naziat", "those who drag forth", "those who pull out"],
  80: ["abasa", "he frowned"],
  81: ["takweer", "takwir", "the overthrowing", "folding up", "the rolling"],
  82: ["infitar", "the cleaving", "bursting apart"],
  83: ["mutaffifeen", "tatfif", "the defrauding", "the defrauders"],
  84: ["inshiqaq", "the splitting open", "the sundering"],
  85: ["burooj", "buruj", "the constellations", "the mansions of the stars"],
  86: ["tariq", "the nightcomer", "the morning star", "the night star"],
  87: ["ala", "the most high"],
  88: ["ghashiya", "the overwhelming", "the pall"],
  89: ["fajr", "the dawn"],
  90: ["balad", "the city"],
  91: ["shams", "the sun"],
  92: ["lail", "layl", "the night"],
  93: ["duha", "zuha", "dhuha", "the morning hours", "morning brightness"],
  94: ["inshirah", "sharh", "alam nashrah", "relief", "the expansion"],
  95: ["teen", "the fig"],
  96: ["alaq", "iqra", "the clot", "the embryo"],
  97: ["qadr", "power", "the night of decree"],
  98: ["bayyina", "bayyinah", "the clear proof", "the clear evidence"],
  99: ["zilzal", "zalzala", "zalzalah", "the earthquake"],
  100: ["adiyat", "the chargers", "the courser"],
  101: ["qaria", "qariah", "the calamity", "the striking hour"],
  102: ["takasur", "takathur", "rivalry in world increase", "competition"],
  103: ["asr", "time", "the declining day", "the epoch"],
  104: ["humaza", "humazah", "the slanderer", "the traducer"],
  105: ["feel", "fil", "the elephant"],
  106: ["quraish", "quraysh"],
  107: ["maun", "small kindnesses", "the assistance", "neighbourly assistance"],
  108: ["kausar", "kawsar", "kauthar", "kawthar", "abundance", "plenty"],
  109: ["kafiroon", "kafirun", "the disbelievers"],
  110: ["nasr", "divine support", "the help", "victory"],
  111: ["lahab", "abu lahab", "masad", "palm fiber", "the flame"],
  112: ["ikhlaas", "tawhid", "sincerity", "purity of faith", "oneness"],
  113: ["falak", "the daybreak", "the dawn"],
  114: ["naas", "mankind", "humankind", "people"],
};

/** Collapse transliteration variants so 'Yaseen', 'Ya-Sin' and 'yasin' meet. */
export function normLatin(s: string) {
  let t = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`'ʿʾ"]/g, "")
    .replace(/[-_.,/]/g, " ")
    .replace(/\b(surah|surat|sura|chapter)\b/g, " ")
    .trim()
    .replace(/^(al|an|ar|as|at|ash|ad|adh|az|aal|ali|el|ul)\s+/, "")
    .replace(/^(al|an|ar|as|at|ash|ad|az)(?=[a-z]{3,})/, (m, _p, _off, str) =>
      // only strip a glued article when what's left still looks like a name
      str.length - m.length >= 3 ? "" : m,
    );
  t = t
    .replace(/\s+/g, "")
    .replace(/dh/g, "z")
    .replace(/q/g, "k")
    .replace(/aw/g, "au")
    .replace(/ay/g, "ai")
    .replace(/ee/g, "i")
    .replace(/oo|ou/g, "u")
    .replace(/o/g, "u")
    .replace(/(.)\1+/g, "$1")
    .replace(/h$/g, "");
  return t;
}

/** Arabic without diacritics, with unified letter forms and no article. */
export function normArabic(s: string) {
  return s
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/سورة\s*/g, "")
    .trim();
}
const stripArticle = (s: string) => s.replace(/^ال/, "");

function dl(a: string, b: string) {
  // Damerau-Levenshtein (optimal string alignment)
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[m][n];
}

/** A name by its consonants: vowels gone and sound-alike letters merged, so spellings the way people
 *  say them still meet ('kosar' and 'kawthar', 'rehman' and 'rahman', 'mariam' and 'maryam'). */
function skeleton(norm: string) {
  return norm
    .replace(/th/g, "s")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/sh/g, "s")
    .replace(/ph/g, "f")
    .replace(/[aeiouyw]/g, "")
    .replace(/(.)\1+/g, "$1");
}

type Prepared = { surah: Surah; latin: string[]; skel: string[]; words: string[][]; arabic: string };
let prepared: Prepared[] | null = null;
function prepare(surahs: Surah[]) {
  if (prepared) return prepared;
  prepared = surahs.map((s) => {
    const names = [s.tr, s.tc, ...(ALIASES[s.n] ?? [])];
    const english = [s.en, ...(ALIASES[s.n] ?? []).filter((a) => a.includes(" ") || a.length > 5)];
    return {
      surah: s,
      latin: [...new Set(names.map(normLatin))],
      skel: [...new Set(names.map((n) => skeleton(normLatin(n))))],
      words: english.map((e) => e.toLowerCase().replace(/^the\s+/, "").split(/[\s-]+/)),
      arabic: stripArticle(normArabic(s.ar)),
    };
  });
  return prepared;
}

function scoreSurah(p: Prepared, qRaw: string): number {
  const isArabic = /[؀-ۿ]/.test(qRaw);
  if (isArabic) {
    const q = stripArticle(normArabic(qRaw));
    if (!q) return 0;
    if (q === p.arabic) return 100;
    if (p.arabic.startsWith(q)) return 85;
    if (p.arabic.includes(q)) return 65;
    const d = dl(q, p.arabic);
    return d <= 1 ? 60 : 0;
  }
  const q = normLatin(qRaw);
  if (!q) return 0;
  let best = 0;
  for (const name of p.latin) {
    if (q === name) best = Math.max(best, 100);
    else if (name.startsWith(q) && q.length >= 2) best = Math.max(best, 82 + (q.length / name.length) * 10);
    else if (q.length >= 4 && name.includes(q)) best = Math.max(best, 62);
    else if (q.length >= 3) {
      const d = dl(q, name);
      const tol = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
      if (d <= tol) best = Math.max(best, 76 - d * 9);
    }
  }
  // said the way it sounds: the same consonants, or one off for a longer name
  const qs = skeleton(q);
  if (qs.length >= 3) {
    for (const sk of p.skel) {
      if (qs === sk) best = Math.max(best, 72);
      else if (qs.length >= 4 && sk.length >= 4 && dl(qs, sk) <= 1) best = Math.max(best, 58);
    }
  }
  // English meaning: every typed word must appear (prefix) in the meaning
  const qWords = qRaw.toLowerCase().replace(/^the\s+/, "").split(/[\s-]+/).filter(Boolean);
  if (qWords.length && qWords.join("").length >= 3) {
    for (const words of p.words) {
      if (qWords.every((w) => words.some((x) => x === w))) best = Math.max(best, 90);
      else if (qWords.every((w) => words.some((x) => x.startsWith(w)))) best = Math.max(best, 74);
    }
  }
  return best;
}

export function findSurahs(surahs: Surah[], q: string, limit = 6) {
  const list = prepare(surahs)
    .map((p) => ({ surah: p.surah, score: scoreSurah(p, q) }))
    .filter((r) => r.score >= 50)
    .sort((a, b) => b.score - a.score || a.surah.n - b.surah.n);
  return list.slice(0, limit);
}

/* ── what was meant: a reference however it is written ──────────────
   2:255, 2-255, 2 - 255, 2.255, 2/255, 2,255, 2 255, 2v255, (2:255), Q2:255, s2a255, surah 2 ayah 255,
   chapter 2 verse 255, baqara 255, al-baqarah:255, the cow 255, ayah 255 of baqara, 255 baqara,
   baqara 2:255, البقرة ٢٥٥, سورة البقرة آية 255; an ayah known by its name (ayat al-kursi); a
   range (2:255-257) opens at its first ayah. The words around a reference that only say what it is
   (surah, ayah, verse, of…) are passed over. */
const FILLER = new Set(["surah", "sura", "surat", "soorah", "surahs", "chapter", "chap", "ch", "c", "s", "ayah", "ayat", "aya", "ayaat", "ayahs", "ayas", "ayyah", "verse", "verses", "vers", "v", "vs", "vv", "a", "no", "nr", "number", "num", "of", "in", "from", "to", "and", "q", "quran", "qur'an", "quraan", "koran", "kuran", "سورة", "سوره", "آية", "اية", "الآية", "الاية", "آيه", "ايه", "الايه", "رقم", "من"]);
const JUZ = /^(juz|juzz|juza|juz'|jz|para|parah|part|sipara|siparah|j|جزء|الجزء)$/;
/** What people say before what they want ("open", "take me to", "show me"). */
const ASK = /^(?:please\s+|pls\s+)?(?:open(?:\s+up)?|read|show(?:\s+me)?|go(?:\s+to)?|goto|take\s+me\s+to|jump\s+to|bring\s+up|find(?:\s+me)?|search(?:\s+for)?|look\s+up|play|recite|listen\s+to|i\s+want(?:\s+to\s+read)?)\s+/;
/** A quarter of a hizb said as a part of one: "¼ hizb 3", "half hizb 3", "3/4 of hizb 3". */
const QUARTER: Record<string, number> = { "¼": 1, "1/4": 1, quarter: 1, "½": 2, "1/2": 2, half: 2, "¾": 3, "3/4": 3, "three quarters": 3, "three quarter": 3 };

/** ayat known by name, said many ways */
const NAMED: { s: number; a: number; names: string[] }[] = [
  { s: 2, a: 255, names: ["ayat al kursi", "ayatul kursi", "ayat ul kursi", "ayatal kursi", "ayat kursi", "ayatulkursi", "kursi", "throne verse", "verse of the throne", "the throne verse", "آية الكرسي"] },
  { s: 2, a: 285, names: ["amanar rasul", "aamanar rasool", "amana rasul", "last two ayat of baqarah", "last two verses of baqarah", "last 2 ayat of baqarah", "last 2 verses of baqarah", "end of baqarah", "خواتيم البقرة"] },
  { s: 24, a: 35, names: ["ayat an nur", "ayatun nur", "ayat al nur", "light verse", "verse of light", "the light verse", "آية النور"] },
  { s: 2, a: 282, names: ["ayat ad dayn", "verse of debt", "debt verse", "longest ayah", "آية الدين"] },
  { s: 21, a: 87, names: ["dua of yunus", "dua yunus", "dua of jonah", "dua of the fish", "ayat al karima", "ayat e karima", "ayate karima"] },
  { s: 20, a: 25, names: ["dua of musa", "dua musa", "rabbish rahli sadri", "rabbishrahli sadri"] },
  { s: 2, a: 201, names: ["rabbana atina", "rabbana aatina", "rabbana atina fid dunya"] },
  { s: 20, a: 114, names: ["rabbi zidni ilma", "rabbi zidni ilman"] },
  { s: 3, a: 173, names: ["hasbunallah", "hasbunallahu wa nimal wakil", "hasbuna allah"] },
  { s: 2, a: 156, names: ["inna lillahi", "inna lillahi wa inna ilaihi rajiun", "innalillahi"] },
  { s: 1, a: 1, names: ["bismillah", "basmala", "basmalah"] },
];
const squash = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\u0600-\u06ff]/g, "").replace(/(.)\1+/g, "$1").replace(/ee/g, "i").replace(/oo/g, "u");
let named: Map<string, { s: number; a: number }> | null = null;
function namedAyah(q: string) {
  named ??= new Map(NAMED.flatMap((n) => n.names.map((x) => [squash(normArabic(x)), { s: n.s, a: n.a }] as const)));
  return named.get(squash(normArabic(q)));
}

/** Instant results: references, surah names, juz, ayat known by name. */
export function searchDirect(surahs: Surah[], juz: Record<string, string>, raw: string): Result[] {
  let q = fromArabicDigits(raw)
    .toLowerCase()
    .replace(/[[\](){}"“”«»<>?!]/g, " ")
    .replace(/[‐‑‒–—―]/g, "-")
    .trim()
    .replace(/\s+/g, " ");
  // ("open baqara 255 please": what is wanted, without the asking)
  for (let was = ""; was !== q; ) (was = q), (q = q.replace(ASK, "").replace(/\s+(?:please|pls)$/, "").trim());
  if (!q) return [];
  const byN = (n: number) => surahs[n - 1];
  const out: Result[] = [];
  const ayah = (s: number, a: number, score: number) => {
    const sur = byN(s);
    if (sur && a >= 1 && a <= sur.count && !out.some((r) => r.kind === "ayah" && r.surah.n === s && r.ayah === a)) out.push({ kind: "ayah", surah: sur, ayah: a, score });
  };
  const surah = (s: number, score: number) => {
    const sur = byN(s);
    if (sur && !out.some((r) => r.kind === "surah" && r.surah.n === s)) out.push({ kind: "surah", surah: sur, score });
  };
  const juzAt = (n: number, score: number) => {
    if (n < 1 || n > 30 || !juz[String(n)]) return;
    const [js, ja] = juz[String(n)].split(":").map(Number);
    out.push({ kind: "juz", juz: n, surah: byN(js), ayah: ja, score });
  };

  // an ayah known by its name
  const known = namedAyah(q);
  if (known) ayah(known.s, known.a, 100);
  // an ayah found by where it is, said in words (why: what is said of it in the results)
  const placed = (s: number, a: number, score: number, why: string) => {
    ayah(s, a, score);
    const r = out.find((x) => x.kind === "ayah" && x.surah.n === s && x.ayah === a);
    if (r && r.kind === "ayah") r.why = why;
  };

  // a page of the mushaf: page 50, p. 50, صفحة ٥٠
  const pg = q.match(/^(?:page|pg|p|pp|صفحة|الصفحة|صفحه)\s*\.?\s*(\d{1,3})$/);
  if (pg) {
    const at = MARKS.page[Number(pg[1]) - 1];
    if (at) placed(Number(at.split(":")[0]), Number(at.split(":")[1]), 100, `page ${pg[1]} of the mushaf begins here`);
    return out;
  }
  // a hizb, or a quarter of one: hizb 10, ¼ hizb 3, half hizb 3, rub 9 (of 240)
  const hz = q.match(/^(?:(¼|1\/4|quarter|½|1\/2|half|¾|3\/4|three quarters?)\s+(?:of\s+)?(?:the\s+)?)?(?:hizb|hezb|hizab|حزب|الحزب)\s*(\d{1,2})$/);
  const rb = q.match(/^(?:rub|rubu|rub el hizb|rub al hizb|quarter|ربع)\s*(\d{1,3})$/);
  if (hz || rb) {
    const r = hz ? (Number(hz[2]) - 1) * 4 + (hz[1] ? QUARTER[hz[1]] : 0) + 1 : Number(rb![1]);
    const at = r >= 1 && r <= 240 ? MARKS.rub[r - 1] : null;
    if (at) placed(Number(at.split(":")[0]), Number(at.split(":")[1]), 100, `${["", "¼ ", "½ ", "¾ "][(r - 1) % 4]}hizb ${Math.ceil(r / 4)} begins here`);
    return out;
  }
  // an ayah by its place in a surah: the first, last or middle ayah of yasin; the end of al-kahf
  const place =
    q.match(/^(?:the\s+)?(first|1st|opening|last|final|closing|middle|start|beginning|end)\s+(?:ayah\s+|ayat\s+|aya\s+|verse\s+)?(?:of|in)\s+(.+)$/) ??
    q.match(/^(?:the\s+)?(first|last|final|middle)\s+(?:ayah|ayat|aya|verse)\s+(.+)$/);
  if (place) {
    const which = /last|final|closing|end/.test(place[1]) ? "last" : place[1] === "middle" ? "middle" : "first";
    for (const h of findSurahs(surahs, place[2], 2)) {
      const n = h.surah.count;
      placed(h.surah.n, which === "last" ? n : which === "middle" ? Math.ceil(n / 2) : 1, h.score, `the ${which} ayah, of ${n}`);
    }
    if (out.length) return out;
  }

  const nums = [...q.matchAll(/\d{1,3}/g)].map((m) => Number(m[0]));
  const words = q
    .replace(/\d+/g, " ")
    .replace(/[:.\/,;_#*+=|~-]/g, " ")
    .split(" ")
    .filter(Boolean);
  const named2 = words.filter((w) => !FILLER.has(w));

  // a juz: juz 30, para 1, j30, juz amma
  if (words.some((w) => JUZ.test(w))) {
    const rest = named2.filter((w) => !JUZ.test(w));
    if (nums.length) juzAt(nums[0], 100);
    // (by the surah it opens with: juz amma, juz tabarak)
    else if (rest.length)
      for (const h of findSurahs(surahs, rest.join(" "), 2))
        for (const [n, at] of Object.entries(juz)) if (at === `${h.surah.n}:1`) juzAt(Number(n), 90);
    if (out.length) return out;
  }

  // numbers alone: 18 (a surah, or a juz), 2:255 and every other way of writing it
  if (!named2.length && nums.length) {
    if (nums.length === 1) {
      surah(nums[0], 100);
      if (nums[0] <= 30) juzAt(nums[0], 40);
      return out;
    }
    const [s, a] = nums;
    ayah(s, a, 100);
    if (byN(s)) surah(s, 70);
    return out;
  }

  // a surah by name, and an ayah of it: baqara 255, ayah 255 of baqara, البقرة ٢٥٥, baqara 2:255
  if (named2.length) {
    const hits = findSurahs(surahs, named2.join(" "), 3);
    if (nums.length) {
      for (const h of hits) {
        // (the surah's own number given too: the other is the ayah)
        const a = nums.length >= 2 && nums[0] === h.surah.n ? nums[1] : nums[0];
        ayah(h.surah.n, a, h.score);
      }
      for (const h of hits) surah(h.surah.n, h.score - 30);
      if (out.length) return out;
    }
    for (const h of findSurahs(surahs, named2.join(" "))) surah(h.surah.n, h.score);
    // (the name alone, as typed, too: "an nas", "al-qadr")
    if (!out.some((r) => r.kind === "surah")) for (const h of findSurahs(surahs, q)) surah(h.surah.n, h.score);
  }
  return out.sort((x, y) => y.score - x.score);
}

type IndexRow = { key: string; en: string; ar: string; raw: [string, string, string, string] };
let rows: IndexRow[] | null = null;

/** A transliteration by its sounds alone: its consonants, the ways of writing one sound made one (so
 *  "rabbana atina" meets "Rabbanaaa aatinaa", "alladhi" meets "allazee"). */
function soundSkeleton(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/dh/g, "z")
    .replace(/th/g, "s")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/sh/g, "s")
    .replace(/ph/g, "f")
    .replace(/q/g, "k")
    .replace(/[aeiouyw]/g, "")
    .replace(/(.)\1+/g, "$1");
}
let tlRows: { key: string; text: string; sk: string }[] | null = null;
async function translitRows() {
  if (!tlRows) {
    const all: [string, string][] = await fetch(`${import.meta.env.BASE_URL}data/translit.json`).then((r) => r.json());
    tlRows = all.map(([key, text]) => ({ key, text, sk: soundSkeleton(text) }));
  }
  return tlRows;
}

/** What a question asks the text for: "verses about patience", "what does the Quran say about
 *  orphans?", "ayat on mercy" → the words themselves. */
export function textQuery(raw: string) {
  return raw
    .trim()
    .replace(/[?!]+$/, "")
    .replace(/^(?:what\s+does\s+(?:the\s+)?(?:quran|qur'an|koran)\s+say\s+(?:about|on|regarding)|(?:the\s+)?(?:verses?|ayahs?|ayat|ayaat|quran|qur'an)\s+(?:about|on|regarding|concerning|mentioning|that\s+mention|talking\s+about|for)|(?:search\s+for|find|about|regarding)\s+)\s*/i, "")
    .trim();
}

/** The words of the translations, and how often each comes: for a word mistyped, the one meant. */
let vocab: Map<string, number> | null = null;
function vocabulary() {
  if (!vocab) {
    vocab = new Map();
    for (const r of rows ?? []) for (const w of r.en.match(/[a-z]{3,}/g) ?? []) vocab.set(w, (vocab.get(w) ?? 0) + 1);
  }
  return vocab;
}
/** A word that is nowhere in the text: the nearest that is (one letter off for a short word, two for
 *  a longer, the commonest of the nearest); the word itself if it is there, or none is near. */
function corrected(w: string) {
  const v = vocabulary();
  if (w.length < 4 || v.has(w)) return w;
  const tol = w.length <= 6 ? 1 : 2;
  let best = w, bd = tol + 1, bn = 0;
  for (const [x, n] of v) {
    if (Math.abs(x.length - w.length) > tol || x[0] !== w[0]) continue;
    const d = dl(w, x);
    if (d < bd || (d === bd && n > bn)) (best = x), (bd = d), (bn = n);
  }
  return bd <= tol ? best : w;
}

/** Full-text search across Saheeh International, The Clear Quran and the Arabic (and, for words
 *  that sound like the Arabic written in Latin letters, the transliteration). A question is read for
 *  what it asks about; words found nowhere are taken for the nearest that are ("patiance"). */
export async function searchText(surahs: Surah[], raw: string, limit = 40): Promise<Result[]> {
  const q = textQuery(raw);
  if (q.length < 3 || /^\d/.test(q)) return [];
  if (!rows) {
    const data = await loadSearchIndex();
    rows = data.map((r) => ({ key: r[0], en: (r[1] + " ‖ " + r[2]).toLowerCase(), ar: normArabic(r[3]), raw: r }));
  }
  const arabic = /[؀-ۿ]/.test(q);
  const first = await matchText(surahs, q, arabic);
  if (first.length || arabic) return first.slice(0, limit);
  // nothing: the words as they were likely meant
  const fixed = q.toLowerCase().split(/\s+/).map(corrected).join(" ");
  if (fixed === q.toLowerCase()) return first;
  return (await matchText(surahs, fixed, false))
    .map((r) => (r.kind === "text" ? { ...r, why: `for “${fixed}”` } : r))
    .slice(0, limit);
}

async function matchText(surahs: Surah[], q: string, arabic: boolean): Promise<Result[]> {
  if (!rows) return [];
  const needle = arabic ? normArabic(q) : q.toLowerCase();
  const words = needle.split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return [];
  const results: Result[] = [];
  for (const r of rows) {
    const hay = arabic ? r.ar : r.en;
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    for (const w of words) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      score += (hay.match(re)?.length ?? 0) * 2 + 1;
    }
    if (hay.includes(needle)) score += 6;
    const [s, a] = r.key.split(":").map(Number);
    const src = arabic ? r.raw[3] : r.raw[1];
    const low = arabic ? normArabic(src) : src.toLowerCase();
    const at = Math.max(0, low.indexOf(words[0]));
    const from = Math.max(0, at - 50);
    const snippet = (from > 0 ? "…" : "") + src.slice(from, from + 150) + (from + 150 < src.length ? "…" : "");
    const match: [number, number][] = [];
    if (!arabic) {
      const sl = snippet.toLowerCase();
      for (const w of words) {
        let i = sl.indexOf(w);
        while (i >= 0) {
          match.push([i, i + w.length]);
          i = sl.indexOf(w, i + w.length);
        }
      }
    }
    results.push({ kind: "text", surah: surahs[s - 1], ayah: a, snippet, match, score });
  }
  // the Arabic as it sounds, written in Latin letters
  const qs = arabic ? "" : soundSkeleton(q);
  if (qs.length >= 5) {
    const tl = await translitRows().catch(() => []);
    const seen = new Set(results.map((x) => (x.kind === "text" ? `${x.surah.n}:${x.ayah}` : "")));
    for (const row of tl) {
      if (seen.has(row.key) || !row.sk.includes(qs)) continue;
      const [s, a] = row.key.split(":").map(Number);
      const snippet = row.text.length > 150 ? row.text.slice(0, 150) + "…" : row.text;
      results.push({ kind: "text", surah: surahs[s - 1], ayah: a, snippet, match: [], score: 2 + qs.length / 3 - row.sk.indexOf(qs) / 400 });
    }
  }
  return results.sort((a, b) => b.score - a.score);
}
