/** A touch screen (a phone, a tablet): a finger, not a pointer. */
export const isTouch = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

/**
 * Whether what is happening now was asked for from the keyboard (a key pressed this moment, not a
 * press of the pointer since). What a key opens or switches appears at once, without its motion: the
 * reader pressing a key knows what is coming, and does it many times (Emil Kowalski's rule: never
 * animate a keyboard-initiated action).
 */
let keyAt = -1e9;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => !e.repeat && (keyAt = performance.now()), { capture: true, passive: true });
  window.addEventListener("pointerdown", () => (keyAt = -1e9), { capture: true, passive: true });
}
export const byKeys = () => performance.now() - keyAt < 350;
