import { useEffect, useRef } from "react";
import { SKY } from "@/lib/motion";

/** Sajjadah (Crimson): a carpet's red field and its faint gold lattice, held still (index.css .crimson-sky) */
export function CrimsonSky({ className }: { className?: string }) {
  return <div className={`crimson-sky ${className ?? ""}`} />;
}

/**
 * The themes' living skies, each one fragment shader on one WebGL canvas that fills its parent:
 * drawn at once on mount (never blank), then at thirty frames a second (they drift slowly), resting
 * while the page is hidden. Shaders get \`r\` (pixels) and \`t\` (seconds), and FW(k) for a line width
 * (fwidth where the GPU has derivatives, a fixed width where not).
 */
const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const COMMON = `
precision highp float;
uniform vec2 r;
uniform float t;
float h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), u.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * n(p); p = p * 2.03 + vec2(17.0, 9.2); a *= 0.5; }
  return v;
}
float grain(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float iso(float k) { float f = abs(fract(k + 0.5) - 0.5); float w = max(FW(k) * 1.2, 0.004); return 1.0 - smoothstep(0.0, w, f); }
`;

/** Paper: a sheet of grey paper on the desk, once crumpled and pressed flat again: its creases
 * catch a soft light that drifts a little, with a long fold or two across it. */
const PAPER = `
float crum(vec2 p) {
  // folds: ridges of noise, large and small
  return 0.62 * abs(n(p * 2.1 + 3.1) - 0.5) + 0.3 * abs(n(p * 4.6 - 1.3) - 0.5) + 0.08 * n(p * 11.0);
}
float fold(vec2 p, vec2 a, vec2 d) {
  // a long crease: its distance, signed (one side lit, the other in shade)
  vec2 nn = vec2(-d.y, d.x);
  return dot(p - a, nn);
}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * r) / min(r.x, r.y);
  float tt = t * 0.035;
  vec3 col = vec3(0.56, 0.548, 0.522);
  // the crumpled surface, lit from the upper left; the light drifts slowly
  float e = 0.004;
  float c0 = crum(p), cx = crum(p + vec2(e, 0.0)), cy = crum(p + vec2(0.0, e));
  vec3 nrm = normalize(vec3((c0 - cx) / e, (c0 - cy) / e, 3.2));
  vec3 L = normalize(vec3(-0.55 + 0.12 * sin(tt), 0.6 + 0.1 * cos(tt * 0.7), 0.75));
  float lit = dot(nrm, L);
  col *= 0.86 + 0.24 * lit;
  // two long folds, from when the sheet was folded
  float f1 = fold(p, vec2(-0.2, 0.0), normalize(vec2(0.18, 1.0)));
  float f2 = fold(p, vec2(0.0, -0.18), normalize(vec2(1.0, 0.07)));
  col += 0.045 * (smoothstep(0.02, 0.0, abs(f1)) * sign(f1) + smoothstep(0.016, 0.0, abs(f2)) * sign(f2));
  // the paper's own grain and fibres, a stain or two
  col *= 0.97 + 0.06 * fbm(vec2(p.x * 30.0, p.y * 8.0));
  col -= 0.035 * smoothstep(0.55, 0.85, fbm(p * 1.3 + 5.0));
  col *= 1.0 - 0.38 * smoothstep(0.5, 1.4, length(p));
  col += (grain(gl_FragCoord.xy + floor(t * 8.0) * 3.0) - 0.5) * 0.05;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/** Lunar: a night of stars, twinkling, over ridges of mountains; a full moon low with its glow, and
 * the faint line of a great orbit across the sky. */
const LUNAR = `
float stars(vec2 px, float cell, float tw) {
  vec2 g = px / cell;
  vec2 id = floor(g), f = fract(g) - 0.5;
  float hh = h(id);
  if (hh < 0.9) return 0.0;
  vec2 o = vec2(h(id + 3.1), h(id + 7.7)) - 0.5;
  float d = length(f - o * 0.7);
  float b = smoothstep(0.08, 0.0, d) * (0.5 + 0.5 * sin(t * (0.7 + hh * 2.0) * tw + hh * 60.0));
  return b * (hh - 0.9) * 10.0;
}
void main() {
  vec2 uv = gl_FragCoord.xy / r;
  vec2 p = (gl_FragCoord.xy - 0.5 * r) / min(r.x, r.y);
  float tt = t * 0.01;
  vec3 col = mix(vec3(0.05, 0.12, 0.19), vec3(0.02, 0.05, 0.1), uv.y);
  col += vec3(0.06, 0.12, 0.16) * smoothstep(0.6, 0.0, uv.y) * 0.6; // the glow over the horizon
  vec2 px = gl_FragCoord.xy + vec2(t * 2.0, 0.0);
  col += vec3(0.85, 0.9, 1.0) * (stars(px, 18.0, 1.0) * 0.6 + stars(px * 0.6 + 50.0, 26.0, 0.7) * 0.9);
  // the moon: a lit disk with its seas, and its halo
  vec2 mc = (vec2(0.87, 0.86) - 0.5) * r / min(r.x, r.y); // the screen's upper right, whatever its shape
  float md = length(p - mc), MR = 0.085;
  float disk = smoothstep(MR, MR - 0.004, md);
  float seas = fbm((p - mc) * 22.0 + 4.0);
  vec3 moon = mix(vec3(0.86, 0.88, 0.9), vec3(0.62, 0.66, 0.72), smoothstep(0.45, 0.7, seas));
  col = mix(col, moon, disk);
  col += vec3(0.6, 0.7, 0.85) * exp(-md * 9.0) * 0.18 * (1.0 - disk);
  // a great orbit's arc
  float arc = abs(length(p - vec2(-1.25, -0.1)) - 1.62);
  col += vec3(0.7, 0.8, 0.95) * (1.0 - smoothstep(0.0, max(FW(arc) * 1.5, 0.0015), arc)) * 0.12;
  // ridges of mountains, far to near, drifting at their own speeds
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = p.x * (1.2 + fi * 0.5) + tt * (1.0 + fi) + fi * 11.0;
    float ridge = -0.18 - fi * 0.11 + (fbm(vec2(x, fi * 3.0)) - 0.5) * (0.22 + fi * 0.06);
    float m = smoothstep(ridge + 0.003, ridge - 0.003, p.y);
    vec3 shade = mix(vec3(0.06, 0.12, 0.18), vec3(0.015, 0.03, 0.05), fi / 2.0);
    col = mix(col, shade + vec3(0.03, 0.06, 0.08) * smoothstep(ridge - 0.2, ridge, p.y) * (1.0 - fi * 0.4), m);
  }
  col *= 1.0 - 0.35 * smoothstep(0.6, 1.4, length(p));
  col += (grain(gl_FragCoord.xy + floor(t * 12.0) * 7.0) - 0.5) * 0.04;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/** `still`: hold the sky where it is (focus mode, when the frame covers the whole screen and the
 *  sky would only be drawn unseen); it takes up again from the same moment. */
function ShaderSky({ main, className, still }: { main: string; className?: string; still?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stillRef = useRef(!!still);
  const syncRef = useRef(() => {});
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false });
    if (!gl) return;
    const budget = SKY(); // (a phone draws it less often, at fewer pixels)
    const derivatives = !!gl.getExtension("OES_standard_derivatives");
    const frag =
      (derivatives ? "#extension GL_OES_standard_derivatives : enable\n#define FW(k) fwidth(k)\n" : "#define FW(k) 0.06\n") + COMMON + main;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "r");
    const uT = gl.getUniformLocation(prog, "t");
    const size = () => {
      const b = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const k = Math.min(1, Math.sqrt(budget.pixels / Math.max(1, b.width * dpr * b.height * dpr)));
      const w = Math.max(1, Math.round(b.width * dpr * k)), hgt = Math.max(1, Math.round(b.height * dpr * k));
      if (canvas.width !== w || canvas.height !== hgt) {
        canvas.width = w;
        canvas.height = hgt;
        gl.viewport(0, 0, w, hgt);
      }
    };
    let start = performance.now();
    let raf = 0, last = 0, heldAt = 0;
    const paint = (now: number) => {
      size();
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 1000 / budget.fps - 1) return;
      last = now;
      paint(now);
    };
    paint(start);
    // runs while the page is shown and the sky not held; time skips the held stretch
    const sync = () => {
      const run = document.visibilityState === "visible" && !stillRef.current;
      if (run && raf === 0) {
        if (heldAt) start += performance.now() - heldAt;
        heldAt = 0;
        raf = requestAnimationFrame(draw);
      } else if (!run && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        heldAt = performance.now();
      }
    };
    syncRef.current = sync;
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      syncRef.current = () => {};
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", sync);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog); // (the context itself stays: a remount, as in development, reuses it)
    };
  }, [main]);
  useEffect(() => {
    stillRef.current = !!still;
    syncRef.current();
  }, [still]);
  return <canvas ref={ref} className={className} style={{ display: "block", width: "100%", height: "100%" }} />;
}

type SkyProps = { className?: string; still?: boolean };
export const LunarSky = (p: SkyProps) => <ShaderSky main={LUNAR} {...p} />;
export const PaperSky = (p: SkyProps) => <ShaderSky main={PAPER} {...p} />;
