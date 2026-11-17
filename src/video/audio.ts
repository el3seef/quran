import { pad3 } from "@/lib/data";
import { loadTiming, RECITERS } from "@/lib/recite";
import type { ReciterId } from "@/lib/store";

/**
 * The voices a video can be recited in.
 *  - The reader's own reciters (whole): each surah is one recording, timed ayah by ayah, so the ayahs
 *    chosen are heard as the reciter recited them, in one breath from the first to the last, never
 *    cut apart; only that stretch of the recording is fetched.
 *  - More voices kept ayah by ayah (everyayah.com): each ayah its own recording, joined end to end
 *    with the pauses and breaths the reciter left in each.
 */
export type Voice = { id: string; name: string; ar: string; whole?: boolean; dir?: string };
export const VOICES: Voice[] = [
  ...RECITERS.map((r) => ({ id: r.id, name: r.name, ar: r.ar, whole: true })),
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
export const voiceOf = (id: string) => VOICES.find((v) => v.id === id) ?? VOICES.find((v) => v.id === "alafasy")!;

/** An ayah's place in the recording (seconds). `bism`: the basmala before a surah's first ayah. */
export type Piece = { s: number; a: number; bism?: boolean; start: number; end: number };
type Opts = { bism: boolean; lead: number; tail: number };
type Loaded = (n: number, of: number) => void;

const RATE = 48000;
let decoder: OfflineAudioContext | null = null;
const decode = (b: ArrayBuffer) => (decoder ??= new OfflineAudioContext(2, 1, RATE)).decodeAudioData(b);
const wantsBism = (s: number, from: number, bism: boolean) => bism && from === 1 && s !== 1 && s !== 9;

/** The recitation of the ayahs, with a quiet lead (the picture comes up from black) and tail. */
export function recitation(voice: Voice, s: number, from: number, to: number, opts: Opts, onLoaded?: Loaded) {
  return voice.whole ? wholeStretch(voice.id as ReciterId, s, from, to, opts, onLoaded) : joinAyahs(voice.dir!, s, from, to, opts, onLoaded);
}

/* ── a stretch of a surah's recording, fetched by itself ─────────────────────────────────────────── */

/** What an MP3 file's head tells: where its sound begins, and how many bytes a second takes (a file
 *  of one bitrate throughout), or that it varies (then the whole file is fetched). */
type Head = { audio: number; bytesPerSec: number } | { vbr: true };
const heads = new Map<string, Promise<Head>>();

const BITRATES = {
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as Record<number, number[]>;
/** An MPEG layer III frame's header at i: its version, bitrate, sample rate and length in bytes. */
function frameAt(b: Uint8Array, i: number) {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
  const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3;
  const bi = b[i + 2] >> 4, si = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
  if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) return null;
  const kbps = (ver === 3 ? BITRATES.v1 : BITRATES.v2)[bi];
  const sr = SAMPLE_RATES[ver][si];
  const len = Math.floor(((ver === 3 ? 144 : 72) * kbps * 1000) / sr) + pad;
  const mono = b[i + 3] >> 6 === 3;
  return { ver, kbps, sr, len, mono };
}
/** A frame header at i that the next frame's header confirms (so not a stray 0xFF in the sound). */
function syncFrom(b: Uint8Array, from: number) {
  for (let i = from; i + 4 < b.length; i++) {
    const f = frameAt(b, i);
    if (!f) continue;
    const g = frameAt(b, i + f.len);
    if (g && g.ver === f.ver && g.sr === f.sr) return { i, f };
  }
  return null;
}
function headOf(url: string) {
  let p = heads.get(url);
  if (!p) {
    p = fetch(url, { headers: { Range: "bytes=0-65535" } })
      .then((r) => {
        if (!r.ok) throw new Error(`The recitation could not be fetched (${r.status})`);
        return r.arrayBuffer();
      })
      .then((ab): Head => {
        const b = new Uint8Array(ab);
        // (an ID3 tag first: its size is kept in seven bits of each of four bytes)
        let off = 0;
        if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) off = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]) + (b[5] & 0x10 ? 10 : 0);
        const s = syncFrom(b, off);
        if (!s) return { vbr: true };
        // a first frame that is a Xing or Info tag carries no sound: "Xing" is a varying bitrate
        const side = s.f.ver === 3 ? (s.f.mono ? 17 : 32) : s.f.mono ? 9 : 17;
        const tag = String.fromCharCode(...b.slice(s.i + 4 + side, s.i + 8 + side));
        if (tag === "Xing") return { vbr: true };
        return { audio: s.i + (tag === "Info" ? s.f.len : 0), bytesPerSec: (s.f.kbps * 1000) / 8 };
      });
    p.catch(() => heads.delete(url));
    heads.set(url, p);
  }
  return p;
}

/**
 * The recording from t0 to t1 (seconds), and where in it t0 falls: only those bytes fetched (a
 * little before, so the decoder has the frames the first ones lean on), from a frame's start.
 */
async function stretchOf(url: string, t0: number, t1: number, onLoaded?: Loaded) {
  const head = await headOf(url);
  if ("vbr" in head) {
    const all = await (await fetch(url)).arrayBuffer();
    onLoaded?.(1, 1);
    return { buf: await decode(all), at: t0 };
  }
  const pre = Math.max(0, t0 - 0.6);
  const b0 = head.audio + Math.floor(pre * head.bytesPerSec);
  const b1 = head.audio + Math.ceil((t1 + 0.6) * head.bytesPerSec);
  const r = await fetch(url, { headers: { Range: `bytes=${b0}-${b1}` } });
  if (!r.ok) throw new Error(`The recitation could not be fetched (${r.status})`);
  let bytes = new Uint8Array(await r.arrayBuffer());
  let start = b0;
  // (a server that sends the whole file: the bytes wanted cut out of it)
  if (r.status === 200) {
    bytes = bytes.slice(b0, b1 + 1);
  }
  const s = syncFrom(bytes, 0);
  if (!s) throw new Error("The recitation could not be read");
  start += s.i;
  onLoaded?.(1, 1);
  const buf = await decode(bytes.slice(s.i).buffer);
  // where the first frame begins in the recording, and so t0 in what was decoded
  const first = (start - head.audio) / head.bytesPerSec;
  return { buf, at: t0 - first };
}

/**
 * The basmala in a stretch, between `from` and `until` (seconds in it; `until`: where the timings
 * begin the first ayah): the voice there in runs, split at pauses of 0.6 s or more. A run beginning
 * just before `until` is the first ayah begun a moment early; the run before it is the basmala (so an
 * isti'adha before that is left out). Its start and end, the end being where the ayah truly begins.
 */
function basmalaOf(buf: AudioBuffer, from: number, until: number) {
  const ch = buf.getChannelData(0);
  const win = Math.round(RATE * 0.02);
  const i0 = Math.max(0, Math.round(from * RATE)), end = Math.min(ch.length, Math.round(until * RATE));
  const runs: [number, number][] = [];
  let quiet = 0;
  for (let i = i0; i < end; i += win) {
    let m = 0;
    for (let k = i; k < Math.min(end, i + win); k++) m = Math.max(m, Math.abs(ch[k]));
    if (m > 0.03) {
      if (!runs.length || quiet >= RATE * 0.6) runs.push([i, i + win]);
      else runs[runs.length - 1][1] = i + win;
      quiet = 0;
    } else quiet += win;
  }
  let ayah = end;
  if (runs.length > 1 && end - runs[runs.length - 1][0] < RATE * 0.6) ayah = runs.pop()![0];
  const run = runs[runs.length - 1];
  return { start: (run ? run[0] : i0) / RATE, end: ayah / RATE };
}

async function wholeStretch(r: ReciterId, s: number, from: number, to: number, opts: Opts, onLoaded?: Loaded) {
  onLoaded?.(0, 1);
  const t = await loadTiming(r, s);
  const a0 = t.a[from - 1][0] / 1000, a1 = t.a[to - 1][1] / 1000;
  const bism = wantsBism(s, from, opts.bism) && a0 > 1.5;
  // (the basmala, where the reciter says it before the first ayah: the recording from its start)
  const t0 = bism ? 0 : a0;
  const { buf, at } = await stretchOf(t.u, t0, a1, onLoaded);
  const startSample = Math.max(0, Math.round(at * RATE));
  const endSample = Math.min(buf.length, Math.round((at + (a1 - t0)) * RATE));
  let from0 = startSample;
  const pieces: Piece[] = [];
  const lead = Math.round(opts.lead * RATE);
  const sec = (sample: number) => (lead + sample - from0) / RATE;
  let begins = Infinity; // (the first ayah, where the voice truly begins it)
  if (bism) {
    // only the basmala itself (an isti'adha before it left out), and the first ayah from where it truly begins
    const bm = basmalaOf(buf, at, at + a0);
    const b = Math.max(startSample, Math.round(bm.start * RATE) - Math.round(RATE * 0.08));
    from0 = b;
    begins = Math.round(bm.end * RATE);
    pieces.push({ s: 1, a: 1, bism: true, start: sec(b), end: sec(begins) });
  }
  for (let a = from; a <= to; a++) {
    const [x, y] = t.a[a - 1];
    const x0 = Math.round((at + x / 1000 - t0) * RATE);
    pieces.push({ s, a, start: sec(a === from ? Math.min(x0, begins) : x0), end: sec(Math.round((at + y / 1000 - t0) * RATE)) });
  }
  const n = Math.max(0, endSample - from0);
  const total = lead + n + Math.round(opts.tail * RATE);
  const out = new AudioBuffer({ length: total, numberOfChannels: 2, sampleRate: RATE });
  const L = out.getChannelData(0), R = out.getChannelData(1);
  const l = buf.getChannelData(0), rr = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
  // (a breath of fade in, and a longer one out where the recording goes on into the next ayah)
  const fin = Math.round(RATE * 0.03), fout = Math.round(RATE * 0.18);
  for (let k = 0; k < n; k++) {
    const g = Math.min(1, k / fin, (n - k) / fout);
    L[lead + k] = l[from0 + k] * g;
    R[lead + k] = rr[from0 + k] * g;
  }
  return { buffer: out, pieces, duration: total / RATE };
}

/* ── ayah by ayah ─────────────────────────────────────────────────────────────────────────────── */

const clips = new Map<string, Promise<AudioBuffer>>();
function clip(dir: string, s: number, a: number) {
  const key = `${dir}/${s}/${a}`;
  let p = clips.get(key);
  if (!p) {
    p = fetch(`https://everyayah.com/data/${dir}/${pad3(s)}${pad3(a)}.mp3`)
      .then((r) => {
        if (!r.ok) throw new Error(`Ayah ${s}:${a} could not be fetched (${r.status})`);
        return r.arrayBuffer();
      })
      .then(decode);
    p.catch(() => clips.delete(key));
    clips.set(key, p);
  }
  return p;
}

/** Where a recording's sound begins and ends (its silence at either end, a little kept). */
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
 * The ayahs' recordings joined end to end, each as the reciter left it (its pause and breath kept),
 * only the silence before the first and after the last let go.
 */
async function joinAyahs(dir: string, s: number, from: number, to: number, opts: Opts, onLoaded?: Loaded) {
  const list: { s: number; a: number; bism?: boolean }[] = [];
  if (wantsBism(s, from, opts.bism)) list.push({ s: 1, a: 1, bism: true });
  for (let a = from; a <= to; a++) list.push({ s, a });
  let done = 0;
  const bufs = await Promise.all(list.map((x) => clip(dir, x.s, x.a).then((b) => (onLoaded?.(++done, list.length), b))));
  const cuts = bufs.map((b, i) => {
    const c = bounds(b);
    return { from: i === 0 ? c.from : 0, to: i === bufs.length - 1 ? c.to : b.length };
  });
  const lead = Math.round(opts.lead * RATE);
  const total = lead + cuts.reduce((n, c) => n + (c.to - c.from), 0) + Math.round(opts.tail * RATE);
  const out = new AudioBuffer({ length: total, numberOfChannels: 2, sampleRate: RATE });
  const L = out.getChannelData(0), R = out.getChannelData(1);
  const pieces: Piece[] = [];
  let at = lead;
  const fade = Math.round(RATE * 0.012);
  bufs.forEach((b, i) => {
    const { from: f, to: t } = cuts[i];
    const l = b.getChannelData(0), r = b.numberOfChannels > 1 ? b.getChannelData(1) : l;
    const n = t - f;
    for (let k = 0; k < n; k++) {
      // (a breath of fade only at the very start and end: no click)
      const g = Math.min(1, i === 0 ? k / fade : 1, i === bufs.length - 1 ? (n - k) / fade : 1);
      L[at + k] = l[f + k] * g;
      R[at + k] = r[f + k] * g;
    }
    pieces.push({ ...list[i], start: at / RATE, end: (at + n) / RATE });
    at += n;
  });
  return { buffer: out, pieces, duration: total / RATE };
}
