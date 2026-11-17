import { THEMES } from "./surahThemes";

/**
 * Each surah's own colour, as the site's cards wear it: its theme's light tone (lib/surahThemes,
 * drawn from its name and subject) made a clear pastel — light, a little saturated — and a deep tone
 * of the same hue for what is drawn on it. The card of Al-Baqarah is the sand of its dunes, An-Nur's
 * the gold of its lamp, Al-Kahf's the green of the cave.
 */
function hsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
const css = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

const cache = new Map<number, { bg: string; deep: string; soft: string }>();
export function surahColor(n: number) {
  let c = cache.get(n);
  if (!c) {
    const [h, s] = hsl(THEMES[(n - 1 + 114) % 114].p[0]);
    // (a grey theme stays a quiet grey; any other is lifted to a clear pastel)
    const sat = s < 0.08 ? s : Math.min(0.78, Math.max(0.5, s * 1.4));
    c = { bg: css(h, sat, 0.83), soft: css(h, sat, 0.92), deep: css(h, Math.min(0.6, sat), 0.28) };
    cache.set(n, c);
  }
  return c;
}
