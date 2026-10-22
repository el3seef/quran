import { pad3 } from "@/lib/data";

/**
 * The voices a video can be recited in: those whose recitations are kept ayah by ayah (everyayah.com),
 * so each ayah is its own recording and a video begins and ends exactly where its ayahs do.
 */
export const VOICES: { id: string; name: string; ar: string; dir: string }[] = [
  { id: "alafasy", name: "Mishary Alafasy", ar: "مشاري العفاسي", dir: "Alafasy_128kbps" },
  { id: "dosari", name: "Yasser Al-Dosari", ar: "ياسر الدوسري", dir: "Yasser_Ad-Dussary_128kbps" },
  { id: "sudais", name: "Abdur-Rahman As-Sudais", ar: "عبد الرحمن السديس", dir: "Abdurrahmaan_As-Sudais_192kbps" },
  { id: "shuraim", name: "Saud Ash-Shuraim", ar: "سعود الشريم", dir: "Saood_ash-Shuraym_128kbps" },
  { id: "maher", name: "Maher Al-Muaiqly", ar: "ماهر المعيقلي", dir: "MaherAlMuaiqly128kbps" },
  { id: "qatami", name: "Nasser Al-Qatami", ar: "ناصر القطامي", dir: "Nasser_Alqatami_128kbps" },
  { id: "shatri", name: "Abu Bakr Ash-Shatri", ar: "أبو بكر الشاطري", dir: "Abu_Bakr_Ash-Shaatree_128kbps" },
  { id: "qahtani", name: "Khalid Al-Qahtani", ar: "خالد القحطاني", dir: "Khaalid_Abdullaah_al-Qahtaanee_192kbps" },
  { id: "budair", name: "Salah Al-Budair", ar: "صلاح البدير", dir: "Salah_Al_Budair_128kbps" },
  { id: "rifai", name: "Hani Ar-Rifai", ar: "هاني الرفاعي", dir: "Hani_Rifai_192kbps" },
  { id: "ajamy", name: "Ahmed Al-Ajamy", ar: "أحمد العجمي", dir: "ahmed_ibn_ali_al_ajamy_128kbps" },
  { id: "minshawi", name: "Al-Minshawi", ar: "محمد صديق المنشاوي", dir: "Minshawy_Murattal_128kbps" },
  { id: "husary", name: "Al-Husary", ar: "محمود خليل الحصري", dir: "Husary_128kbps" },
  { id: "basit", name: "Abdul-Basit Abdus-Samad", ar: "عبد الباسط عبد الصمد", dir: "Abdul_Basit_Murattal_192kbps" },
  { id: "ayyoub", name: "Muhammad Ayyoub", ar: "محمد أيوب", dir: "Muhammad_Ayyoub_128kbps" },
];

/** An ayah's place in the joined recording (seconds). `bism`: the basmala before a surah's first ayah. */
export type Piece = { s: number; a: number; bism?: boolean; start: number; end: number };

const RATE = 48000;
const cache = new Map<string, Promise<AudioBuffer>>();
let decoder: OfflineAudioContext | null = null;

function clip(dir: string, s: number, a: number) {
  const key = `${dir}/${s}/${a}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`https://everyayah.com/data/${dir}/${pad3(s)}${pad3(a)}.mp3`)
      .then((r) => {
        if (!r.ok) throw new Error(`Ayah ${s}:${a} could not be fetched (${r.status})`);
        return r.arrayBuffer();
      })
      .then((b) => (decoder ??= new OfflineAudioContext(2, 1, RATE)).decodeAudioData(b));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Where a recording's sound begins and ends: its silence at either end let go (a little kept). */
function bounds(b: AudioBuffer) {
  const ch = [...Array(b.numberOfChannels)].map((_, i) => b.getChannelData(i));
  const win = Math.round(RATE * 0.012);
  const loud = (i: number) => {
    let m = 0;
    for (const c of ch) for (let k = i; k < Math.min(c.length, i + win); k++) m = Math.max(m, Math.abs(c[k]));
    return m > 0.012;
  };
  let a = 0;
  while (a < b.length && !loud(a)) a += win;
  let z = b.length - win;
  while (z > a && !loud(z)) z -= win;
  return { from: Math.max(0, a - Math.round(RATE * 0.06)), to: Math.min(b.length, z + win + Math.round(RATE * 0.22)) };
}

/**
 * The ayahs' recordings, each with its silences trimmed, joined in one (a quiet lead before, for the
 * picture to come up from black; a quiet tail after, for it to go back to black), and where each lies.
 */
export async function joinAyahs(dir: string, s: number, from: number, to: number, opts: { bism: boolean; lead: number; tail: number; gap: number }, onLoaded?: (n: number, of: number) => void) {
  const list: { s: number; a: number; bism?: boolean }[] = [];
  if (opts.bism && from === 1 && s !== 1 && s !== 9) list.push({ s: 1, a: 1, bism: true });
  for (let a = from; a <= to; a++) list.push({ s, a });
  let done = 0;
  const bufs = await Promise.all(
    list.map((x) =>
      clip(dir, x.s, x.a).then((b) => {
        onLoaded?.(++done, list.length);
        return b;
      }),
    ),
  );
  const cuts = bufs.map(bounds);
  const gap = Math.round(opts.gap * RATE);
  const total = Math.round(opts.lead * RATE) + cuts.reduce((n, c) => n + (c.to - c.from), 0) + gap * (cuts.length - 1) + Math.round(opts.tail * RATE);
  const out = new AudioBuffer({ length: total, numberOfChannels: 2, sampleRate: RATE });
  const L = out.getChannelData(0), R = out.getChannelData(1);
  const pieces: Piece[] = [];
  let at = Math.round(opts.lead * RATE);
  const fade = Math.round(RATE * 0.012);
  bufs.forEach((b, i) => {
    const { from: f, to: t } = cuts[i];
    const l = b.getChannelData(0), r = b.numberOfChannels > 1 ? b.getChannelData(1) : l;
    const n = t - f;
    for (let k = 0; k < n; k++) {
      // (a breath of fade at each cut: no click)
      const g = Math.min(1, k / fade, (n - k) / fade);
      L[at + k] = l[f + k] * g;
      R[at + k] = r[f + k] * g;
    }
    pieces.push({ ...list[i], start: at / RATE, end: (at + n) / RATE });
    at += n + gap;
  });
  return { buffer: out, pieces, duration: total / RATE };
}
