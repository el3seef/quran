import type React from "react";

/**
 * The site's themes: each its own sky, box, type and motion (index.css under
 * :root[data-theme=…], components/ui/skies.tsx, ImmersivePanel). `preview` draws its swatch.
 * Sajjadah (id "crimson", the prayer rug's red and gold) is the site's own, the one it opens in.
 */
export type ThemeId = "crimson" | "paper" | "lunar";
export const THEME_IDS: ThemeId[] = ["crimson", "paper", "lunar"];
export const DEFAULT_THEME: ThemeId = "crimson";

export const THEMES: { id: ThemeId; name: string; preview: { bg: string; box: string; fg: string; ac: string; r: number; b: string }; face: React.CSSProperties }[] = [
  { id: "crimson", name: "Sajjadah", preview: { bg: "#5a0d13", box: "#1a0507", fg: "#eddcbb", ac: "#c9a35f", r: 0, b: "3px solid #100203" }, face: { fontFamily: "Amiri", fontStyle: "italic" } },
  { id: "paper", name: "Paper", preview: { bg: "#8e8a82", box: "#ece8de", fg: "#23211c", ac: "#9b3d2c", r: 0, b: "1px solid #b8b1a2" }, face: { fontFamily: "Fraunces Variable", fontStyle: "italic", fontWeight: 340 } },
  { id: "lunar", name: "Lunar", preview: { bg: "#0a1a2c", box: "#0f1b29", fg: "#e8eef5", ac: "#c9d6e3", r: 12, b: "4px solid #04070c" }, face: { fontFamily: "Jost Variable", fontWeight: 300, textTransform: "uppercase", letterSpacing: "0.16em" } },
];
