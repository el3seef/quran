import { StrictMode } from "react";
import { MotionConfig } from "framer-motion";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/lexend";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/amiri-quran";
import "@fontsource/reem-kufi/400.css";
import "@fontsource/reem-kufi/600.css";
import "@fontsource-variable/caveat";
// the faces a shared ayah's picture and a video can be lettered in (read/grounds.ts, video/render.ts)
import "@fontsource-variable/jost";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/cormorant-garamond/wght-italic.css";
import "@fontsource/spectral/300.css";
import "@fontsource/spectral/300-italic.css";
import "@fontsource/spectral/400.css";
import "@fontsource/spectral/500.css";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource/courier-prime/400.css";
import "@fontsource-variable/crimson-pro/wght.css";
import "@fontsource-variable/crimson-pro/wght-italic.css";
import "@fontsource/amiri/latin-400.css";
import "@fontsource/amiri/latin-400-italic.css";
import "@fontsource/amiri/latin-ext-400.css";
import "@fontsource/amiri/latin-ext-400-italic.css";
import "@fontsource/courier-prime/700.css";
import "./index.css";
import "./bento.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* (the phone's Reduce Motion: slides, zooms and turns skipped, fades kept) */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);

// a touch screen: the site's own selection and menus (index.css html.touch, lib/touch.ts)
if (matchMedia("(pointer: coarse)").matches) document.documentElement.classList.add("touch");

// Safari on iPhone zooms on a pinch whatever the page asks; its own gesture events can stop it
for (const type of ["gesturestart", "gesturechange"]) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

// kept on the device (dist/sw.js): the site opens at once and reads offline. Once the page has
// settled, the rest of the Qur'an is fetched quietly too, unless the reader saves data.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => {
        const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
        if (!saveData) setTimeout(() => navigator.serviceWorker.ready.then((r) => r.active?.postMessage("keep-all")), 8000);
      })
      .catch(() => {});
  });
}
