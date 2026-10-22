import { create } from "zustand";

/**
 * An ayah (or a few, one after another) heard on its own in Mishary Alafasy's voice: only those, then
 * silence, nothing playing on. For the ayahs the Seerah speaks of, and those brought up beside a page.
 * One at a time across the site: starting one stops any other.
 */
const pad = (n: number) => String(n).padStart(3, "0");
const url = (s: number, a: number) => `https://everyayah.com/data/Alafasy_128kbps/${pad(s)}${pad(a)}.mp3`;

export const useAyahAudio = create<{ key: string | null; at: number; loading: boolean }>(() => ({ key: null, at: 0, loading: false }));

let audio: HTMLAudioElement | null = null;
let token = 0;

/** Hear ayahs `from` to `to` of surah `s` (the key says which; playing it again stops it). */
export function playAyahs(s: number, from: number, to = from, key = `${s}:${from}-${to}`) {
  if (useAyahAudio.getState().key === key) return stopAyahs();
  stopAyahs();
  const mine = ++token;
  const play = (a: number) => {
    if (mine !== token) return;
    if (a > to) return stopAyahs();
    useAyahAudio.setState({ key, at: a, loading: true });
    audio = new Audio(url(s, a));
    audio.onplaying = () => mine === token && useAyahAudio.setState({ loading: false });
    audio.onended = () => play(a + 1);
    audio.onerror = () => mine === token && stopAyahs();
    audio.play().catch(() => mine === token && stopAyahs());
  };
  play(from);
}

export function stopAyahs() {
  token++;
  if (audio) {
    audio.onended = audio.onerror = audio.onplaying = null;
    audio.pause();
    audio = null;
  }
  useAyahAudio.setState({ key: null, at: 0, loading: false });
}
