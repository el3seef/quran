import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import images from "./images.json";

/** A picture of the Seerah (images.json, the files in public/seerah/img): a photograph, laid into the
 *  page's colours, its edges let go; or a thing cut from its ground, standing in front of the page's
 *  great word with its shadow. Its source is named in its corner. */
export type Img = { file: string; kind: "photo" | "cut"; title: string; credit: string; license: string; url: string; pos?: string; tilt?: number };
const IMAGES = images as Record<string, Img>;

export const hasPicture = (id?: string) => !!id && !!IMAGES[id];

/** (its source runs up the picture's inner edge, the side toward the words; a whole page's, up the page's) */
export function Picture({ id, full, edge }: { id: string; full?: boolean; edge?: "left" | "right" }) {
  const img = IMAGES[id];
  if (!img) return null;
  return (
    <div className={cn("s-pic absolute inset-0", img.kind === "cut" ? "is-cut" : "is-photo")}>
      <motion.img
        src={`${import.meta.env.BASE_URL}seerah/img/${img.file}`}
        alt={img.title}
        draggable={false}
        style={{ objectPosition: img.pos ?? "center", rotate: img.tilt ? `${img.tilt}deg` : undefined, scale: img.tilt ? 1.3 : undefined }}
        initial={{ scale: img.kind === "cut" ? 0.96 : 1.12 }}
        animate={{ scale: 1 }}
        transition={{ duration: img.kind === "cut" ? 1.6 : 14, ease: [0.16, 1, 0.3, 1] }}
      />
      <a className={cn("s-credit pointer-events-auto", full ? "is-page" : edge && `is-side at-${edge}`)} href={img.url} target="_blank" rel="noreferrer noopener">
        {img.title} · {img.credit} · {img.license}
      </a>
    </div>
  );
}
