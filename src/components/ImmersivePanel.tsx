import { AnimatePresence, motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { EASE_IN_OUT, EASE_OUT, cn } from "@/lib/utils";
import { byKeys } from "@/lib/motion";

/**
 * A panel over the page (Settings, the search, what is saved…): it rises a few pixels into place as it
 * fades in, quickly, and its contents follow a beat apart; it leaves faster than it came. Opened from
 * the keyboard it is simply there, and so is closing it.
 */
export function ImmersivePanel({
  open,
  onClose,
  children,
  className,
  label,
}: {
  open: boolean;
  from?: "left" | "right";
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const instant = byKeys();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="panel"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={cn("dark-scope frame-radius-in absolute inset-[3px] z-40 overflow-hidden bg-[var(--panel-bg)] text-[var(--box-fg)]", className)}
          // (on a phone in the reader, down over the strip under the page too: Frame --frame-below)
          style={{ bottom: "calc(3px - var(--frame-below, 0px))", paddingBottom: "env(safe-area-inset-bottom)" }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6, transition: { duration: instant ? 0 : 0.16, ease: EASE_OUT } }}
          transition={{ duration: instant ? 0 : 0.24, ease: EASE_OUT }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <motion.div
            className="relative h-full"
            initial="hidden"
            animate="show"
            exit="hide"
            variants={{ show: { transition: instant ? {} : { delayChildren: 0.05, staggerChildren: 0.035 } }, hide: {} }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Child that takes part in the panel's staged reveal. */
export const reveal: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE_OUT } },
  hide: { opacity: 0, transition: { duration: 0.12 } },
};

export function Reveal({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" | "section" }) {
  const C = motion[as];
  return (
    <C variants={reveal} className={className}>
      {children}
    </C>
  );
}

/** The two-line menu icon that folds into a cross, as in the reference. */
export function MenuGlyph({ open, lines = 2 }: { open: boolean; lines?: 2 | 3 }) {
  return (
    <span className="relative block h-3 w-4" aria-hidden>
      <motion.span
        className="absolute left-0 top-[2px] h-px w-4 bg-current"
        animate={open ? { rotate: 45, y: 4 } : { rotate: 0, y: 0 }}
        transition={{ duration: 0.22, ease: EASE_IN_OUT }}
      />
      {lines === 3 && (
        <motion.span className="absolute left-0 top-[6px] h-px w-4 bg-current" animate={{ opacity: open ? 0 : 1 }} />
      )}
      <motion.span
        className="absolute left-0 top-[10px] h-px w-4 bg-current"
        animate={open ? { rotate: -45, y: -4 } : { rotate: 0, y: 0 }}
        transition={{ duration: 0.22, ease: EASE_IN_OUT }}
      />
    </span>
  );
}
