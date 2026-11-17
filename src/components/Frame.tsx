import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { Rect } from "@/lib/layout";
import { useUI } from "@/lib/ui";
import { byKeys } from "@/lib/motion";
import { EASE_IN_OUT } from "@/lib/utils";

/**
 * The panel every page after the entrance sits in. The reading page's surah summary is its other
 * face: asked for, the ayahs fade out and the summary in, in place (no turning over).
 */
const SWAP = [0.23, 1, 0.32, 1] as const;

export function Frame({ rect, children, instant, quick, backBelow = 0 }: { rect: Rect; children: ReactNode; instant?: boolean; quick?: boolean; backBelow?: number }) {
  const flipped = useUI((s) => s.flipped);
  const t = { duration: byKeys() ? 0 : 0.22, ease: SWAP };
  const shown = { opacity: 1, scale: 1, visibility: "visible" as const };
  const gone = { opacity: 0, scale: 0.985, transitionEnd: { visibility: "hidden" as const } };
  return (
    <motion.div
      className="fixed z-10"
      style={{ ["--frame-below" as string]: `${backBelow}px` }}
      initial={{ opacity: 0, y: 6, left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      animate={{ opacity: 1, y: 0, left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      transition={{
        ...(instant ? { duration: 0 } : quick ? { duration: 0.4, ease: EASE_IN_OUT } : { duration: 0.5, ease: EASE_IN_OUT }),
        opacity: { duration: 0.3 },
        y: { duration: 0.35, ease: SWAP },
      }}
    >
      <div className="relative h-full w-full">
        <div className="frame-box absolute inset-0 bg-[var(--box-bg)]" />
        <motion.div className="frame-radius relative h-full w-full overflow-hidden p-[3px]" initial={false} animate={flipped ? gone : shown} transition={t}>
          {children}
        </motion.div>
        {/* the other face: the reading page portals the surah summary here (on a phone down over the
            strip under the page as well, where the dock is gone while it shows) */}
        <motion.div data-frame-back className="frame-radius-in absolute inset-[3px] overflow-hidden" style={{ bottom: "calc(3px - var(--frame-below, 0px))" }} initial={false} animate={flipped ? shown : gone} transition={t} />
        <div data-frame-outside className="pointer-events-none absolute inset-0" />
      </div>
      {/* around the panel (the dock under it): gone while the summary shows */}
      <motion.div data-frame-still className="pointer-events-none absolute inset-0" initial={false} animate={flipped ? { opacity: 0, transitionEnd: { visibility: "hidden" } } : { opacity: 1, visibility: "visible" }} transition={t} />
      <div data-frame-edges className="pointer-events-none absolute inset-0" />
    </motion.div>
  );
}
