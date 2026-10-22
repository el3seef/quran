import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type G = { size?: number; strokeWidth?: number; className?: string };

/** The site's own marks, drawn as its other icons are (class "lucide"), so each theme gives them its own line. */
function Glyph({ size = 16, strokeWidth = 1.6, className, children }: G & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("lucide", className)}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** The reflection's mark: a mind, seen from above, its two halves and their folds. */
export function BrainGlyph(p: G) {
  return (
    <Glyph {...p}>
      {/* its outline, lobe by lobe, either side of the parting */}
      <path d="M12 5.4C11.2 3.5 8.6 3 7.2 4.4 5.3 4.1 3.9 5.9 4.4 7.8 2.9 8.9 2.8 11.3 4 12.5 3.1 14.1 3.6 16.3 5.3 17 5.4 19 7.4 20.5 9.4 20 10.4 20.9 11.6 20.8 12 19.8" />
      <path d="M12 5.4C12.8 3.5 15.4 3 16.8 4.4 18.7 4.1 20.1 5.9 19.6 7.8 21.1 8.9 21.2 11.3 20 12.5 20.9 14.1 20.4 16.3 18.7 17 18.6 19 16.6 20.5 14.6 20 13.6 20.9 12.4 20.8 12 19.8" />
      {/* the parting, and the folds that turn in to it */}
      <path d="M12 5.4V19.8" />
      <path d="M8.6 7.2c.2 1.8 1.3 2.9 3.4 3M15.4 7.2c-.2 1.8-1.3 2.9-3.4 3" />
      <path d="M6.4 14.6c1.2-.9 2.6-.6 3.1.6M17.6 14.6c-1.2-.9-2.6-.6-3.1.6" />
    </Glyph>
  );
}

/** A note's mark: a page of one's own writing, a pencil at its corner. */
export function NoteGlyph(p: G) {
  return (
    <Glyph {...p}>
      <path d="M11 20.5H7.5A2.5 2.5 0 0 1 5 18V6a2.5 2.5 0 0 1 2.5-2.5h8A2.5 2.5 0 0 1 18 6v4" />
      <path d="M8.5 8h6M8.5 11.5h6M8.5 15h3" />
      <path d="M19.4 12.6a1.55 1.55 0 0 1 2.2 2.2l-5.5 5.5-2.9.7.7-2.9z" />
    </Glyph>
  );
}

/* ── the ways of reading, as marks: the Arabic as its letter ʿayn, a translation as a Latin A, a book
   as an open book, a book of one of them the two side by side with a hairline between ── */

function Letter({ ar, x, size }: { ar: boolean; x: number; size: number }) {
  return (
    <text
      x={x}
      y={ar ? 17.6 : 17.2}
      textAnchor="middle"
      fill="currentColor"
      stroke="none"
      style={{ fontFamily: ar ? '"KFGQPC HAFS", "Amiri Quran", serif' : "var(--font-serif), Georgia, serif", fontSize: size, fontWeight: 500 }}
    >
      {ar ? "ع" : "A"}
    </text>
  );
}

export type ReadMode = { mode: "both" | "arabic" | "translation"; book: boolean };

/** One way of reading as a mark (the view switch's menu): wider than square when it has two parts. */
export function ModeGlyph({ mode, book, size = 22 }: ReadMode & { size?: number }) {
  const parts = mode === "both" ? 2 : book ? 2 : 1;
  const w = parts === 2 ? 40 : 24;
  return (
    <svg width={(size * w) / 24} height={size} viewBox={`0 0 ${w} 24`} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="lucide" aria-hidden>
      {mode === "both" ? (
        <>
          <Letter ar x={12} size={19} />
          <Letter ar={false} x={28} size={17} />
        </>
      ) : (
        <Letter ar={mode === "arabic"} x={12} size={mode === "arabic" ? 19 : 17} />
      )}
      {book && mode !== "both" && (
        <>
          <path d="M20 6v13" strokeWidth={1} opacity={0.5} />
          {/* an open book */}
          <path d="M31 9.2c-1.5-1.2-3.4-1.7-5.5-1.7v10c2.1 0 4 .5 5.5 1.7 1.5-1.2 3.4-1.7 5.5-1.7v-10c-2.1 0-4 .5-5.5 1.7z" />
          <path d="M31 9.2v10" />
        </>
      )}
    </svg>
  );
}
