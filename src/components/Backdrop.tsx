import { isTouch } from "@/lib/motion";

export type Phase = "intro" | "select" | "read" | "seerah" | "video";

/** Behind every page: the page itself, plain paper (or its night), still. The film grain, if it is
 *  asked for in Settings, lies over it on a phone (on a computer it is over the whole site: App). */
export function Backdrop({ grain }: { grain?: boolean }) {
  return (
    <div className="bento-backdrop fixed inset-0 overflow-hidden bg-[var(--sky)]" aria-hidden>
      {grain && isTouch() && <div className="grain grain-sky" />}
      {/* an iPhone home-screen app: into the colour of the strip iOS keeps below the page (index.css) */}
      <div className="ios-strip-fade" />
    </div>
  );
}
