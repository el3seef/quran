import { create } from "zustand";
import { loadIndex, pad3 } from "./data";
import { useStore, type ReciterId } from "./store";

/**
 * The Qur'an heard: a reciter's recording of the surah, with where each ayah and each of its words
 * begins (public/data/recite/<reciter>/<surah>.json, from scripts/fetch_recitations.mjs). An ayah
 * pressed is recited and the recitation stops at its end; "play on" carries it through the surah.
 * A highlighted part of the Arabic is recited by Alafasy, whose words are timed one by one.
 * Every reciter here has all 114 surahs.
 */
export const RECITERS: { id: ReciterId; name: string; ar: string; url: (n: number) => string }[] = [
  { id: "abkar", name: "Idrees Abkar", ar: "إدريس أبكر", url: (n) => `https://cdn.mp3quran.net/audio/idrees-abkar/r1/${pad3(n)}.mp3` },
  { id: "dosari", name: "Yasser Al-Dosari", ar: "ياسر الدوسري", url: (n) => `https://download.quranicaudio.com/quran/yasser_ad-dussary/${pad3(n)}.mp3` },
  { id: "alafasy", name: "Mishary Alafasy", ar: "مشاري العفاسي", url: (n) => `https://download.quranicaudio.com/qdc/mishari_al_afasy/murattal/${n}.mp3` },
  { id: "salimi", name: "Mansour Al-Salimi", ar: "منصور السالمي", url: (n) => `https://cdn.mp3quran.net/audio/mansour-salimi/r1/${pad3(n)}.mp3` },
  { id: "khalaf", name: "Abdullah Al-Khalaf", ar: "عبدالله الخلف", url: (n) => `https://cdn.mp3quran.net/audio/abdullah-khalaf/r1/${pad3(n)}.mp3` },
];
export const reciterOf = (id: ReciterId) => RECITERS.find((r) => r.id === id) ?? RECITERS[0];

type Timing = { u: string; a: [number, number][]; w: number[][] };

const timings = new Map<string, Promise<Timing>>();
const ready = new Map<string, Timing>();
/** A reciter's timings for a surah (kept once fetched). */
export function loadTiming(r: ReciterId, n: number) {
  const k = `${r}/${n}`;
  let p = timings.get(k);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/recite/${k}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<Timing>;
      })
      .then((t) => (ready.set(k, t), t));
    p.catch(() => timings.delete(k));
    timings.set(k, p);
  }
  return p;
}

export type Player = {
  on: boolean; // in use: its controls show at the frame's foot until it is closed
  reciter: ReciterId; // whose recording is loaded
  surah: number;
  ayah: number; // the ayah sounding, or paused on
  word: number; // its word sounding (-1: none)
  playing: boolean;
  loading: boolean;
  through: boolean; // on through the surah, ayah after ayah (otherwise the ayah pressed, alone)
  part: boolean; // a highlighted part, recited by Alafasy
  error: string | null;
};

export const usePlayer = create<Player>(() => ({
  on: false,
  reciter: "alafasy",
  surah: 0,
  ayah: 0,
  word: -1,
  playing: false,
  loading: false,
  through: false,
  part: false,
  error: null,
}));
const put = (p: Partial<Player>) => usePlayer.setState(p);

let audio: HTMLAudioElement | null = null;
let loaded = ""; // the recording in it
let timing: Timing | null = null;
let lastPart: [number, number] | null = null; // the words of the part heard last
let req = 0; // the latest press: one made while timings load supersedes those before it
let resumeAt = -1; // the word to go on from in a voice newly chosen while paused
let stopAt = Infinity; // (ms) where this recitation ends: the ayah's end, a part's end, or the surah's
let raf = 0;
let backstop = 0;

function el() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("timeupdate", tick); // (in the background, where frames are not drawn)
  audio.addEventListener("playing", () => put({ playing: true, loading: false, error: null }));
  audio.addEventListener("waiting", () => put({ loading: true }));
  audio.addEventListener("pause", () => {
    put({ playing: false, loading: false });
    cancelAnimationFrame(raf);
  });
  audio.addEventListener("ended", () => finish());
  audio.addEventListener("error", () => {
    if (!loaded) return;
    put({ playing: false, loading: false, error: "The recitation didn't load. Check your connection." });
  });
  return audio;
}

/** where the sound is, in the ayahs and their words; stops at the recitation's end */
function tick() {
  const a = audio;
  if (!a || !timing || a.paused) return; // (a pause's own last report changes nothing)
  const t = a.currentTime * 1000;
  if (t >= stopAt - 25) return finish();
  const st = usePlayer.getState();
  const tm = timing;
  let i = st.ayah - 1;
  const ay = tm.a;
  // (an ayah begins where its first word does, if that is a moment before its own mark)
  const from = (k: number) => startOf(tm, k);
  if (!(i >= 0 && i < ay.length && t >= from(i) && (i + 1 >= ay.length || t < from(i + 1)))) {
    // (a jump: found again; at the very start, the opening before ayah 1 belongs to it)
    i = 0;
    while (i + 1 < ay.length && t >= from(i + 1)) i++;
  }
  const ws = tm.w[i] ?? [];
  let w = -1;
  if (t >= from(i)) {
    w = 0;
    while (w + 1 < ws.length && t >= ws[w + 1]) w++;
  }
  if (i + 1 !== st.ayah || w !== st.word) put({ ayah: i + 1, word: w });
}
function loop() {
  cancelAnimationFrame(raf);
  const step = () => {
    tick();
    if (audio && !audio.paused) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

function finish() {
  cancelAnimationFrame(raf);
  window.clearTimeout(backstop);
  audio?.pause();
  stopAt = Infinity;
  put({ playing: false, loading: false, word: -1 });
}

/** the ayah's start: its first word's, where that is a moment earlier than the ayah's own mark */
const startOf = (t: Timing, i: number) => Math.min(t.a[i][0], t.w[i]?.[0] ?? Infinity);

function start(t: Timing, src: string, from: number, until: number) {
  const a = el();
  timing = t;
  stopAt = until;
  window.clearTimeout(backstop);
  if (loaded !== src) {
    // (a new recording: from its place at once, as it loads)
    loaded = src;
    a.src = `${src}#t=${(from / 1000).toFixed(2)}`;
  } else a.currentTime = from / 1000;
  put({ loading: true, error: null });
  a.play()
    .then(() => {
      loop();
      // (a page in the background draws no frames: the end is kept by a timer too)
      if (until < Infinity) backstop = window.setTimeout(() => tick(), Math.max(0, until - from) + 400);
    })
    .catch((e) => {
      if (e?.name === "AbortError") return;
      put({ loading: false, playing: false, error: e?.name === "NotAllowedError" ? "Press play to listen" : "The recitation didn't load. Check your connection." });
    });
  media();
}

/**
 * Recite ayah `a` of surah `s`: that ayah alone, or on through the surah when `through` is on.
 * (Called from a press: the timings are usually fetched already, so the sound starts within it.)
 */
export async function recite(s: number, a: number, opts: { through?: boolean; word?: number } = {}) {
  const me = ++req;
  resumeAt = -1;
  const r = useStore.getState().settings.reciter;
  const through = opts.through ?? usePlayer.getState().through;
  put({ on: true, reciter: r, surah: s, ayah: a, word: -1, part: false, through, error: null });
  const k = `${r}/${s}`;
  const t = ready.get(k) ?? (put({ loading: true }), await loadTiming(r, s).catch(() => null));
  if (me !== req) return; // (another pressed meanwhile)
  if (!t) return put({ loading: false, error: "The recitation didn't load. Check your connection." });
  const i = Math.min(t.a.length, Math.max(1, a)) - 1;
  // from the surah's opening (its basmala) when the whole surah is to be heard from ayah 1; from a
  // word of it when going on in another voice
  const w = opts.word ?? -1;
  const from = w > 0 && t.w[i]?.[w] !== undefined ? t.w[i][w] : through && i === 0 && w < 0 ? 0 : startOf(t, i);
  start(t, reciterOf(r).url(s), from, through ? Infinity : t.a[i][1]);
}

/** A highlighted part of an ayah's Arabic (its words i to j), recited by Alafasy. */
export async function recitePart(s: number, a: number, i: number, j: number) {
  const me = ++req;
  lastPart = [i, j];
  put({ on: true, reciter: "alafasy", surah: s, ayah: a, word: -1, part: true, error: null });
  const t = ready.get(`alafasy/${s}`) ?? (await loadTiming("alafasy", s).catch(() => null));
  if (me !== req) return;
  if (!t) return put({ error: "The recitation didn't load. Check your connection." });
  const ws = t.w[a - 1], [, end] = t.a[a - 1];
  const from = ws[Math.max(0, i)] ?? t.a[a - 1][0];
  const to = j + 1 < ws.length ? ws[j + 1] : end;
  start(t, reciterOf("alafasy").url(s), from, to);
}

/** Play or pause: paused partway, it goes on from there; heard to its end, it is heard again. */
export function toggle() {
  const st = usePlayer.getState();
  const a = audio;
  if (st.playing && a) return a.pause();
  if (!st.on) return;
  // (another voice chosen while paused: on from the same word, in it)
  if (resumeAt >= 0 && !st.part) return void recite(st.surah, Math.max(1, st.ayah), { through: st.through, word: resumeAt });
  if (a && timing && loaded && st.word >= 0 && !a.ended) {
    put({ loading: true });
    a.play().then(loop).catch(() => put({ loading: false }));
    return;
  }
  if (st.part && lastPart) return void recitePart(st.surah, st.ayah, lastPart[0], lastPart[1]);
  recite(st.surah, Math.max(1, st.ayah), { through: st.through });
}

/** The next ayah (or the one before), heard. */
export function step(dir: 1 | -1) {
  const st = usePlayer.getState();
  if (!st.on) return;
  const n = (timing?.a.length ?? 286) as number;
  const to = Math.max(1, Math.min(n, st.ayah + dir));
  recite(st.surah, to, { through: st.through });
}

/** On through the surah, or the ayah alone; from now on. */
export function setThrough(through: boolean) {
  put({ through });
  const st = usePlayer.getState();
  if (!audio || !timing || st.part) return;
  // (playing an ayah alone: it carries on past its end now, or stops at the end of the one sounding)
  stopAt = through ? Infinity : timing.a[Math.max(0, st.ayah - 1)][1];
}

/** Stopped, and its controls put away. */
export function close() {
  finish();
  if (audio) {
    audio.removeAttribute("src");
    audio.load();
  }
  loaded = "";
  timing = null;
  put({ on: false, ayah: 0, word: -1, part: false, error: null });
}

/** A new reciter chosen while one is heard: the old voice stops at once, and the new one goes on
 *  from the same word (paused, it will when play is pressed). */
useStore.subscribe((s, prev) => {
  if (s.settings.reciter === prev.settings.reciter) return;
  const st = usePlayer.getState();
  if (!st.on || st.part || !st.surah) return;
  const word = st.word;
  const going = st.playing || st.loading;
  audio?.pause();
  if (going) recite(st.surah, Math.max(1, st.ayah), { word });
  else {
    resumeAt = Math.max(0, word);
    put({ reciter: s.settings.reciter });
  }
});

/* the phone's own controls (the lock screen, headphones): its name and the reciter's, and the buttons */
let names: string[] = [];
loadIndex().then((i) => (names = i.surahs.map((x) => x.tc.replace(/[`’]/g, "ʿ")))).catch(() => {});
function media() {
  const ms = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  if (!ms || typeof MediaMetadata === "undefined") return;
  const st = usePlayer.getState();
  ms.metadata = new MediaMetadata({ title: `${names[st.surah - 1] ?? "Surah " + st.surah} · ${st.surah}:${st.ayah}`, artist: reciterOf(st.reciter).name, album: "The Qur'an" });
  ms.setActionHandler("play", () => toggle());
  ms.setActionHandler("pause", () => audio?.pause());
  ms.setActionHandler("nexttrack", () => step(1));
  ms.setActionHandler("previoustrack", () => step(-1));
}
usePlayer.subscribe((s, p) => {
  if (s.ayah !== p.ayah && s.on && s.playing) media();
});

/** How far through the recording it is (0 to 1), for the foot's line. */
export function progress() {
  if (!audio || !timing || !audio.duration || !isFinite(audio.duration)) return 0;
  return audio.currentTime / audio.duration;
}
