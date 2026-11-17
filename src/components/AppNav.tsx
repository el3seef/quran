import { BookOpen, Clapperboard, House, Map as MapIcon, Moon, Settings2, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { useScheme } from "@/lib/themes";
import { cn } from "@/lib/utils";

export type NavTab = "home" | "surahs" | "seerah" | "video" | "settings";

/** The site's ways about: Home, the surahs, the Seerah, an ayah made into a video, Settings. */
const TABS: { id: NavTab; label: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", icon: <House size={20} strokeWidth={1.8} /> },
  { id: "surahs", label: "Surahs", icon: <BookOpen size={20} strokeWidth={1.8} /> },
  { id: "seerah", label: "The Seerah", icon: <MapIcon size={20} strokeWidth={1.8} /> },
  { id: "video", label: "Share an ayah", icon: <Clapperboard size={20} strokeWidth={1.8} /> },
  { id: "settings", label: "Settings", icon: <Settings2 size={20} strokeWidth={1.8} /> },
];

/**
 * On a computer: a dark rail down the left of the shell, its icons in a column, the page you are on
 * lit in butter; at its foot, day or night at a press. On a phone: a black pill floating at the foot
 * of the screen, the page you are on a white circle in it. (In the reader a phone has the reader's own
 * dock there instead: App hides this.)
 */
export function AppNav({ active, onGo, mobile, show }: { active: NavTab | null; onGo: (t: NavTab) => void; mobile: boolean; show: boolean }) {
  const appearance = useStore((s) => s.settings.appearance);
  const set = useStore((s) => s.set);
  const scheme = useScheme(appearance);
  if (mobile)
    return (
      <nav
        aria-label="Main"
        className={cn(
          "no-select fixed inset-x-4 z-30 mx-auto flex h-16 max-w-[420px] items-center justify-between rounded-full bg-[#111113] px-2 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)] transition-[opacity,translate] duration-200 ease-out",
          show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
        )}
        style={{ bottom: "calc(14px + env(safe-area-inset-bottom, 0px))" }}
        aria-hidden={!show || undefined}
      >
        {TABS.map((t) => {
          const on = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onGo(t.id)}
              aria-label={t.label}
              aria-current={on ? "page" : undefined}
              tabIndex={show ? 0 : -1}
              className={cn("press flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-150", on ? "bg-white text-[#111113]" : "text-white/70")}
            >
              {t.icon}
            </button>
          );
        })}
      </nav>
    );
  return (
    <nav aria-label="Main" className={cn("no-select fixed bottom-3 left-0 top-3 z-30 flex w-[84px] flex-col items-center gap-2 py-3 transition-opacity duration-200", !show && "pointer-events-none opacity-0")}>
      {/* the mark: the first letter of the Qur'an's name, in its own tile */}
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--p-butter)] font-kufi text-[22px] leading-none text-[#111113]" aria-hidden>
        ق
      </div>
      {TABS.map((t) => {
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onGo(t.id)}
            aria-label={t.label}
            title={t.label}
            aria-current={on ? "page" : undefined}
            className={cn(
              "press group relative flex h-12 w-12 items-center justify-center rounded-2xl transition-colors duration-150",
              t.id === "settings" && "mt-auto",
              on ? "bg-[var(--p-butter)] text-[#111113]" : "text-white/55 hover:bg-white/10 hover:text-white",
            )}
          >
            {t.icon}
            <span className="pointer-events-none absolute left-[calc(100%+10px)] whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#111113] opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-hover:delay-300">
              {t.label}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => set({ appearance: scheme === "dark" ? "light" : "dark" })}
        aria-label={scheme === "dark" ? "Light appearance" : "Dark appearance"}
        title={scheme === "dark" ? "Light" : "Dark"}
        className="press flex h-12 w-12 items-center justify-center rounded-2xl text-white/55 transition-colors duration-150 hover:bg-white/10 hover:text-white"
      >
        {scheme === "dark" ? <Sun size={19} strokeWidth={1.8} /> : <Moon size={19} strokeWidth={1.8} />}
      </button>
    </nav>
  );
}
