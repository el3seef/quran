import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronsDown, LoaderCircle, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { RECITERS, close, progress, reciterOf, setThrough, step, toggle, usePlayer } from "@/lib/recite";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { EASE_OUT, cn } from "@/lib/utils";

/**
 * The frame's foot while the Qur'an is heard: play and pause, the ayah before and after, which ayah
 * it is and in whose voice (a tap on the voice chooses another; on the ayah, goes to it), "play on"
 * (ayah after ayah to the surah's end; off, the ayah pressed alone), and a thin line along the top
 * edge for how far through the surah it is. Nothing at all until an ayah is first recited.
 */
export function PlayerBar({ mobile, onGo }: { mobile: boolean; onGo: (s: number, a: number) => void }) {
  const on = usePlayer((p) => p.on);
  const playing = usePlayer((p) => p.playing);
  const loading = usePlayer((p) => p.loading);
  const surah = usePlayer((p) => p.surah);
  const ayah = usePlayer((p) => p.ayah);
  const through = usePlayer((p) => p.through);
  const part = usePlayer((p) => p.part);
  const error = usePlayer((p) => p.error);
  const reciter = usePlayer((p) => p.reciter);

  const chooseVoice = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const mine = useStore.getState().settings.reciter;
    useUI.getState().openMenu(r.left, r.top - 8, [
      { type: "label", label: "Reciter" },
      ...RECITERS.map((x) => ({
        type: "item" as const,
        label: x.name,
        icon: <span className="flex w-4 justify-center">{x.id === mine ? <Check size={13} /> : null}</span>,
        onSelect: () => useStore.getState().set({ reciter: x.id }),
      })),
    ]);
  };

  return (
    <AnimatePresence>
      {on && (
        <motion.div
          key="player"
          className="flex h-full min-w-0 flex-1 items-center gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.18 } }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          role="group"
          aria-label="Recitation"
        >
          {/* the ayah before, play or pause, the next: one group, play in its middle */}
          <span className="-ml-2 flex shrink-0 items-center">
            {!mobile && !part && (
              <Btn label="The ayah before" onClick={() => step(-1)}>
                <SkipBack size={13} />
              </Btn>
            )}
            <Btn label={playing ? "Pause" : "Play"} onClick={toggle} strong>
              {loading && !playing ? <LoaderCircle size={14} className="animate-spin" /> : playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-px" />}
            </Btn>
            {!mobile && !part && (
              <Btn label="The next ayah" onClick={() => step(1)}>
                <SkipForward size={13} />
              </Btn>
            )}
          </span>
          <span aria-hidden className="h-3.5 w-px shrink-0 bg-[var(--box-line)]" />
          <span className="label-sm flex min-w-0 items-center gap-1.5 leading-none text-[var(--box-faint)]">
            {error ? (
              <span className="truncate normal-case tracking-normal text-[var(--box-muted)]">{error}</span>
            ) : (
              <>
                <button type="button" onClick={() => onGo(surah, ayah)} className="shrink-0 tabular-nums text-[var(--box-muted)] transition-colors hover:text-[var(--box-fg)]" title="Go to the ayah being recited">
                  {surah}:{ayah || 1}
                </button>
                <span aria-hidden>·</span>
                {part ? (
                  <span className="truncate">{reciterOf("alafasy").name}</span>
                ) : (
                  <button type="button" onClick={(e) => chooseVoice(e.currentTarget)} className="flex min-w-0 items-center gap-0.5 transition-colors hover:text-[var(--box-fg)]" title="Choose the reciter">
                    {/* (on a phone, the reciter by his family name: the whole of it does not fit) */}
                    <span className={mobile ? "shrink-0" : "truncate"}>{mobile ? reciterOf(reciter).name.split(" ").slice(-1)[0] : reciterOf(reciter).name}</span>
                    <ChevronDown size={10} className="shrink-0" />
                  </button>
                )}
                {playing && <Bars />}
              </>
            )}
          </span>
          <span className="flex-1" />
          {!part && (
            <button
              type="button"
              role="switch"
              aria-checked={through}
              onClick={() => setThrough(!through)}
              className={cn(
                "label-sm pill flex h-[22px] shrink-0 items-center gap-1 border px-2 leading-none transition-colors",
                through ? "border-[var(--box-accent)] bg-[var(--box-accent)] text-[var(--box-bg-solid)]" : "border-[var(--box-line)] text-[var(--box-faint)] hover:border-[var(--box-muted)] hover:text-[var(--box-fg)]",
              )}
              title={through ? "Playing on through the surah, ayah after ayah: tap to stop at the end of this one" : "Play on through the surah, ayah after ayah"}
              aria-label="Play on through the surah"
            >
              <ChevronsDown size={11} strokeWidth={2} />
              {/* (on a phone, its sign alone: the reciter's name needs the room) */}
              {!mobile && <span className="whitespace-nowrap">Play on</span>}
            </button>
          )}
          <Btn label="Stop and close the player" onClick={close}>
            <X size={13} />
          </Btn>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** How far through the surah the recitation is: a thin line along the foot's top edge, kept by the
 *  sound itself while it plays (placed in the foot, across its whole width). */
export function PlayerLine() {
  const on = usePlayer((p) => p.on);
  const playing = usePlayer((p) => p.playing);
  const line = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const draw = () => {
      if (line.current) line.current.style.transform = `scaleX(${progress()})`;
      if (usePlayer.getState().playing) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [on, playing]);
  if (!on) return null;
  return <span ref={line} className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left bg-[var(--box-accent)]" style={{ transform: "scaleX(0)" }} />;
}

function Btn({ children, label, onClick, strong }: { children: React.ReactNode; label: string; onClick: () => void; strong?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      data-sfx="none"
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center transition-colors hover:bg-[var(--box-hover)]",
        strong ? "text-[var(--box-fg)]" : "text-[var(--box-faint)] hover:text-[var(--box-fg)]",
      )}
    >
      {children}
    </button>
  );
}

/** three small bars rising and falling while the recitation sounds (still where motion is reduced) */
function Bars() {
  return (
    <span className="player-bars ml-0.5 flex h-2.5 shrink-0 items-end gap-[2px] self-center" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}
