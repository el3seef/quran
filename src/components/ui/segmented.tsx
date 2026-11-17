import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { byKeys } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A choice of a few, side by side in one pill, the chosen one filled in ink: one row, never wrapped.
 * An option may have a shorter label (third item), used whenever the full ones would not fit the row
 * (a phone, a narrow panel).
 */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string, string?][] }) {
  const hasShort = options.some((o) => o[2]);
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(true);
  useLayoutEffect(() => {
    const b = box.current, pr = probe.current;
    if (!hasShort || !b || !pr) return;
    const check = () => setFull(pr.offsetWidth <= b.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(b);
    ro.observe(pr);
    return () => ro.disconnect();
  }, [hasShort]);
  return (
    <div ref={box} className="relative w-full">
      {hasShort && (
        <div className="pointer-events-none invisible absolute h-0 w-full overflow-hidden" aria-hidden>
          <div ref={probe} className="flex w-max p-1">
            {options.map(([v, l]) => (
              <span key={v} className="whitespace-nowrap px-3.5 text-[13.5px] font-medium">
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="no-select relative flex w-max max-w-full flex-nowrap rounded-full bg-[var(--box-hover)] p-1">
        {options.map(([v, l, short]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            aria-label={l}
            className={cn("relative h-9 rounded-full px-3.5 text-[13.5px] font-medium transition-colors duration-150", value === v ? "text-[var(--box-bg-solid)]" : "text-[var(--box-muted)] hover:text-[var(--box-fg)]")}
          >
            {value === v && <motion.span layoutId={`seg-${options.map((o) => o[0]).join("")}`} className="absolute inset-0 rounded-full bg-[var(--box-fg)]" transition={{ duration: byKeys() ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }} />}
            <span className="relative whitespace-nowrap">{full || !short ? l : short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
