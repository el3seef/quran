import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { Person, Slide } from "./data";
import { honour } from "./Section";

/**
 * One of the people of the Seerah, opened from their name: their name in its Arabic letters (in place
 * of a likeness, which the Seerah does not draw), what they were, a little of their story, and the
 * sections they are named in, each a way to it.
 */
export function PersonCard({ person, slides, at, onGo, onClose }: { person: Person | null; slides: Slide[]; at: string | undefined; onGo: (i: number) => void; onClose: () => void }) {
  const where = person ? slides.map((sl, i) => ({ sl, i })).filter(({ sl }) => sl.kind === "section" && person.in.includes(sl.id)) : [];
  return (
    <AnimatePresence>
      {person && (
        <>
          <motion.div key="veil" className="fixed inset-0 z-[57] bg-black/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            key={person.id}
            className="s-card"
            initial={{ x: "102%" }}
            animate={{ x: 0 }}
            exit={{ x: "102%", transition: { duration: 0.3 } }}
            transition={{ type: "spring", stiffness: 240, damping: 32 }}
            aria-label={person.name}
            role="dialog"
          >
            <div className="flex items-center justify-between px-6 pt-5">
              <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-black/45" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
                The people of the Seerah
              </span>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center text-black/50 hover:text-black">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10" data-scroll>
              {person.ar && (
                <motion.div className="s-card-ar mt-4" dir="rtl" lang="ar" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.8 }}>
                  {person.ar}
                </motion.div>
              )}
              <div className="s-card-name mt-5">{person.name}</div>
              {person.role && <div className="s-card-role">{honour(person.role)}</div>}
              <div className="s-card-body">
                {person.body.map((p, i) => (
                  <p key={i}>{honour(p)}</p>
                ))}
              </div>
              {where.length > 0 && (
                <div className="mt-8">
                  <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-black/45" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
                    In the Seerah · {where.length}
                  </div>
                  <div className="mt-2">
                    {where.map(({ sl, i }) => (
                      <button key={sl.id} type="button" className={`s-row ${sl.id === at ? "is-on" : ""}`} onClick={() => onGo(i)}>
                        <span className="t">{sl.kind === "section" ? sl.s.title : ""}</span>
                        <span className="w">{sl.kind === "section" ? sl.s.when : ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
