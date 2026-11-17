import { useEffect, useState } from "react";

/**
 * The site's one look, Quiet: a warm paper page and deep ink, one green for what matters, the words
 * given the room (index.css :root[data-theme="quiet"]). It comes in a light and a dark appearance:
 * by default the device's own (the phone's or the computer's setting), or one held in Settings.
 */
export type ThemeId = "quiet";
export const THEME_IDS: ThemeId[] = ["quiet"];
export const DEFAULT_THEME: ThemeId = "quiet";

export type Appearance = "auto" | "light" | "dark";
export const APPEARANCES: [Appearance, string][] = [
  ["auto", "As the device"],
  ["light", "Light"],
  ["dark", "Dark"],
];

/** The appearance shown: the one chosen, or (auto) the device's, followed as it changes. */
export function useScheme(appearance: Appearance): "light" | "dark" {
  const query = typeof matchMedia === "undefined" ? null : matchMedia("(prefers-color-scheme: dark)");
  const [dark, setDark] = useState(() => !!query?.matches);
  useEffect(() => {
    if (!query) return;
    const on = () => setDark(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, [query]);
  return appearance === "auto" ? (dark ? "dark" : "light") : appearance;
}
