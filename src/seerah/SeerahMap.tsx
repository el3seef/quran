import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { Mood } from "./moods";
import data from "./maps.json";

type LonLat = [number, number];
type Via = string | LonLat;
type Kind = "army" | "journey" | "migration" | "letter";
type Route = { via: Via[]; label?: string; kind?: Kind; dashed?: boolean; approx?: boolean; arc?: number };
type Spec = { view: number[]; regions?: string[]; places?: string[]; routes?: Route[]; notes?: Record<string, string>; sides?: Record<string, "left" | "right" | "above" | "below"> };
type Place = { name: string; at: number[]; kind?: string; approx?: boolean };
type Region = { name: string; at: number[]; size?: number; sea?: boolean; rot?: number };
type Meta = { bounds: number[]; grid: [number, number]; min: number; max: number; exag: number; color: "bm" | "relief" };

const PLACES = data.places as Record<string, Place>;
const REGIONS = data.regions as Record<string, Region>;
export const MAPS = data.maps as unknown as Record<string, Spec>;
const DIR = `${import.meta.env.BASE_URL}seerah/terrain/`;

/** The terrains (scripts/build_seerah_terrain.py), by their bounds: W, S, E, N. */
const TERRAINS: Record<string, number[]> = {
  region: [24, 8, 62, 38],
  hijaz: [37.6, 19.8, 41.6, 25.6],
  taif: [39.55, 21, 40.8, 21.86],
  makkah: [39.74, 21.32, 40.04, 21.5],
  valley: [39.812, 21.409, 39.846, 21.437],
  madinah: [39.55, 24.4, 39.68, 24.53],
};
/** The closest terrain that holds most of a view. */
function terrainOf(v: number[]) {
  const area = (b: number[]) => (b[2] - b[0]) * (b[3] - b[1]);
  const held = (b: number[]) => (Math.max(0, Math.min(b[2], v[2]) - Math.max(b[0], v[0])) * Math.max(0, Math.min(b[3], v[3]) - Math.max(b[1], v[1]))) / area(v);
  return Object.keys(TERRAINS).filter((k) => held(TERRAINS[k]) >= 0.6).sort((a, b) => area(TERRAINS[a]) - area(TERRAINS[b]))[0] ?? "region";
}

/**
 * The hour each mood lights its map at: the sun (its colour, strength, bearing and height), the sky's
 * light and the ground's, the haze far off, the sea, the colours of the routes and the places, and
 * the lines of height drawn on the ground.
 */
type Light = { sun: string; sunI: number; az: number; alt: number; sky: string; ground: string; hemi: number; haze: string; water: string; line: string; glow: string; pin: string; contour: string; contourA: number; dark: boolean; low: string; high: string };
const LIGHTS: Record<Mood, Light> = {
  sand: { sun: "#fff0d4", sunI: 2.6, az: 300, alt: 36, sky: "#fff4e0", ground: "#9a6a40", hemi: 0.6, haze: "#e6d3ae", water: "#2c6a7d", line: "#9a3412", glow: "#d9622b", pin: "#2a1b10", contour: "#5a3a20", contourA: 0.16, dark: false, low: "#ecd8b2", high: "#b98a5c" },
  parchment: { sun: "#fff3df", sunI: 2.4, az: 315, alt: 40, sky: "#fbf2df", ground: "#8a6c48", hemi: 0.7, haze: "#ebdfc4", water: "#3b5d68", line: "#7b1e1e", glow: "#a8402e", pin: "#1d1712", contour: "#4a3424", contourA: 0.2, dark: false, low: "#eee3c9", high: "#a88a64" },
  white: { sun: "#ffffff", sunI: 2.5, az: 320, alt: 52, sky: "#ffffff", ground: "#a8946e", hemi: 0.8, haze: "#f1ebde", water: "#3f8792", line: "#9a7426", glow: "#d1a74a", pin: "#18160f", contour: "#5e5440", contourA: 0.12, dark: false, low: "#f3ecdd", high: "#bba786" },
  dawn: { sun: "#ffc9a3", sunI: 3, az: 95, alt: 16, sky: "#ffd9c4", ground: "#7a4a4a", hemi: 0.6, haze: "#ecc3ac", water: "#5b5f94", line: "#8a2f3e", glow: "#e0707a", pin: "#2a1518", contour: "#5a2a30", contourA: 0.16, dark: false, low: "#f0d3c0", high: "#a8706c" },
  dusk: { sun: "#ff9a58", sunI: 3.6, az: 280, alt: 14, sky: "#7a4a8a", ground: "#2a1838", hemi: 0.75, haze: "#5a2e48", water: "#2b2a5e", line: "#ffb47c", glow: "#ff8a4c", pin: "#fbeee0", contour: "#ffcf9e", contourA: 0.12, dark: true, low: "#3a2240", high: "#7a4a5e" },
  night: { sun: "#9fb4ff", sunI: 1.4, az: 140, alt: 28, sky: "#3a4a8a", ground: "#05070f", hemi: 0.5, haze: "#0b1029", water: "#07102e", line: "#c7d3ff", glow: "#8fa6ff", pin: "#e8ecf8", contour: "#8fa6ff", contourA: 0.22, dark: true, low: "#18213f", high: "#3a4776" },
  ember: { sun: "#ff6a3a", sunI: 2.8, az: 250, alt: 15, sky: "#7a2416", ground: "#1a0604", hemi: 0.6, haze: "#2a0c08", water: "#160706", line: "#ff6a44", glow: "#e5482a", pin: "#f4e4d8", contour: "#ff7a50", contourA: 0.18, dark: true, low: "#45190f", high: "#8a3a20" },
  oasis: { sun: "#ffe7b0", sunI: 2.4, az: 290, alt: 28, sky: "#8fc4a8", ground: "#14301f", hemi: 0.75, haze: "#143429", water: "#1f6b62", line: "#e4c46a", glow: "#f0d27a", pin: "#eef3e5", contour: "#e4c46a", contourA: 0.14, dark: true, low: "#183a2a", high: "#4f6e44" },
  iron: { sun: "#dfe4ec", sunI: 2.3, az: 300, alt: 20, sky: "#5a6070", ground: "#101114", hemi: 0.55, haze: "#16181b", water: "#111923", line: "#ff5a52", glow: "#c2363a", pin: "#ece6dc", contour: "#c9ccd2", contourA: 0.12, dark: true, low: "#2a2c31", high: "#5a5e66" },
  grief: { sun: "#c8ccd4", sunI: 1.8, az: 310, alt: 24, sky: "#6a6e78", ground: "#141518", hemi: 0.6, haze: "#1f2126", water: "#141922", line: "#c9ced8", glow: "#a7adb8", pin: "#dcd8d0", contour: "#a7adb8", contourA: 0.12, dark: true, low: "#2c2e33", high: "#5c6068" },
};
const KINDS: Record<Kind, string> = { army: "An army's march", journey: "A journey", migration: "A migration", letter: "A letter carried" };
const kindColor = (k: Kind, L: Light) => (k === "army" ? (L.dark ? "#ff5a4a" : "#b3261e") : k === "migration" ? L.glow : L.line);

/** A terrain's heights (shared between the maps that show it): read from the red and green of its
 *  picture of heights, the sea from its blue. */
type Ground = { meta: Meta; h: Float32Array; sea: Uint8Array };
const grounds = new Map<string, Promise<Ground>>();
function ground(name: string) {
  let p = grounds.get(name);
  if (!p) {
    p = (async () => {
      const [meta, bmp] = await Promise.all([
        fetch(`${DIR}${name}.json`).then((r) => r.json() as Promise<Meta>),
        fetch(`${DIR}${name}-h.png`)
          .then((r) => r.blob())
          .then((b) => createImageBitmap(b, { premultiplyAlpha: "none", colorSpaceConversion: "none" })),
      ]);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(bmp, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      const n = c.width * c.height, h = new Float32Array(n), sea = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        h[i] = meta.min + (((px[i * 4] << 8) | px[i * 4 + 1]) / 65535) * (meta.max - meta.min);
        sea[i] = px[i * 4 + 2] > 127 ? 1 : 0;
      }
      return { meta, h, sea };
    })();
    grounds.set(name, p);
    p.catch(() => grounds.delete(name));
  }
  return p;
}

/** Heights let go of their small detail, as the land would look from far off, rolling: a blur (three
 *  passes of a box, each way). The sea is a shallow even floor in it, so the coast, where the blurred
 *  ground crosses the sea's level, is a smooth line, not the steps of the sea's cells. */
function smoothed(h: Float32Array, sea: Uint8Array, w: number, ht: number, r: number) {
  const out = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) out[i] = sea[i] ? -160 : Math.max(h[i], 0) + 40;
  if (r < 1) return out;
  const tmp = new Float32Array(h.length);
  const pass = (src: Float32Array, dst: Float32Array, n: number, len: number, step: number, line: (k: number) => number) => {
    for (let k = 0; k < n; k++) {
      const o = line(k);
      let sum = 0;
      for (let j = -r; j <= r; j++) sum += src[o + Math.min(len - 1, Math.max(0, j)) * step];
      for (let j = 0; j < len; j++) {
        dst[o + j * step] = sum / (2 * r + 1);
        sum += src[o + Math.min(len - 1, j + r + 1) * step] - src[o + Math.max(0, j - r) * step];
      }
    }
  };
  for (let p = 0; p < 3; p++) {
    pass(out, tmp, ht, w, 1, (k) => k * w);
    pass(tmp, out, w, ht, w, (k) => k);
  }
  return out;
}

/** A soft round glow, for lights and dust. */
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
/** The land's edges let go into the page, unevenly, as a coast would. */
function edgeTexture() {
  const n = 256, c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d")!, img = g.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const wave = (Math.sin(x * 0.11) + Math.sin(y * 0.083 + 1.3) + Math.sin((x + y) * 0.047 + 0.4) + Math.sin((x - y) * 0.19)) * 0.011;
      const d = Math.min(x, n - 1 - x, y, n - 1 - y) / (n - 1) + wave;
      const a = Math.min(1, Math.max(0, (d - 0.02) / 0.17)), s = a * a * (3 - 2 * a) * 255, i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = s;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

const LINE_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// a route: drawn along its way as far as it has gone, light running along it toward its end
const ROUTE_FS = `uniform vec3 uColor; uniform float uProg; uniform float uTime; uniform float uLen; uniform float uDash; uniform float uAlpha; uniform float uRun;
varying vec2 vUv;
void main() {
  float s = vUv.x;
  if (s > uProg) discard;
  if (uDash > 0.0 && fract(s * uLen / uDash) > 0.58) discard;
  float run = pow(0.5 + 0.5 * sin(s * uLen * 1.4 - uTime * 2.6), 8.0) * uRun;
  float head = smoothstep(uProg - 0.03, uProg, s) * (1.0 - step(0.999, uProg));
  gl_FragColor = vec4(uColor * (1.0 + run * 0.9 + head * 1.6), uAlpha);
}`;
// a place's beam of light, from the ground up, fading as it rises
const BEAM_FS = `uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
void main() { gl_FragColor = vec4(uColor, uAlpha * smoothstep(0.0, 0.06, vUv.y) * pow(1.0 - vUv.y, 1.4)); }`;

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * The Seerah's map, in three dimensions: the land as from far off, its heights smoothed into rolling
 * swells (only what matters to the story shown on it), coloured and lit as the section's hour is lit —
 * the low sun of a dusk, the moon of a night — its lines of height rippling slowly, the sea glinting;
 * its places standing up from it in light, its journeys drawn over the ground as they were travelled,
 * light running along them. It flies in and settles, sways a little as if
 * breathing; a mouse turns it (a drag), moves it (a right-drag, or with Shift), draws it closer (the
 * buttons, a double click on a spot, a pinch, or the wheel with Ctrl).
 */
export function SeerahMap({ id, mobile, mood = "sand", side }: { id: string; active?: boolean; mobile: boolean; mood?: Mood; side?: "left" | "right" }) {
  const spec = MAPS[id];
  const box = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const compass = useRef<HTMLDivElement>(null);
  const ctl = useRef<{ zoom: (f: number) => void; reset: () => void } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "flat">("loading");
  const [zoomed, setZoomed] = useState(false);
  const name = terrainOf(spec.view);
  const L = LIGHTS[mood] ?? LIGHTS.sand;

  useEffect(() => {
    const el = box.current!, labels = layer.current!;
    let dead = false, raf = 0;
    const off: (() => void)[] = [];
    let renderer: THREE.WebGLRenderer;
    // (a phone, or a small machine: fewer points of land, no shadows, fewer pixels)
    const lite = mobile || (navigator.hardwareConcurrency ?? 8) <= 4;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: true, powerPreference: "high-performance" });
    } catch {
      setState("flat");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !lite;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.className = "m3-canvas";
    el.prepend(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 4000);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    (async () => {
      const g = await ground(name).catch(() => null);
      if (dead) return;
      if (!g) return setState("flat");

      // ── the land, a hundred units across, north away from the eye: drawn as from far off, its
      // heights smoothed into rolling swells, coloured by the hour, low to high, its lines of height
      // rippling over it like slow waves ──
      const { meta } = g;
      const [W0, S0, E0, N0] = meta.bounds, [gw, gh] = meta.grid;
      const WU = 100, DU = (100 * (gh - 1)) / (gw - 1);
      const wx = (lon: number) => ((lon - W0) / (E0 - W0) - 0.5) * WU;
      const wz = (lat: number) => ((N0 - lat) / (N0 - S0) - 0.5) * DU;
      const perUnit = ((E0 - W0) * 111320 * Math.cos((((S0 + N0) / 2) * Math.PI) / 180)) / WU;
      const hasSea = meta.color === "bm";
      // (the wide maps' heights drawn lower than before, and smoothed more: their mountains swell, not spike)
      const vs = (meta.exag / perUnit) * (hasSea ? 0.55 : 0.85);
      const smooth = smoothed(g.h, g.sea, gw, gh, Math.round(gw / (hasSea ? 75 : 150)));
      // (land below the sea's level, inland, at it)
      const Y = new Float32Array(gw * gh);
      for (let i = 0; i < Y.length; i++) Y[i] = hasSea ? smooth[i] * vs : (smooth[i] - 40 - meta.min) * vs;
      const heightAt = (x: number, z: number) => {
        const fx = Math.min(gw - 1.001, Math.max(0, (x / WU + 0.5) * (gw - 1))), fz = Math.min(gh - 1.001, Math.max(0, (z / DU + 0.5) * (gh - 1)));
        const x0 = Math.floor(fx), z0 = Math.floor(fz), ax = fx - x0, az = fz - z0, i = z0 * gw + x0;
        return (Y[i] * (1 - ax) + Y[i + 1] * ax) * (1 - az) + (Y[i + gw] * (1 - ax) + Y[i + gw + 1] * ax) * az;
      };
      // (smoothed, the land needs fewer points: a half of them, a third on a phone)
      const every = gw > 300 ? (lite ? 3 : 2) : lite && gw > 160 ? 2 : 1;
      const cols = Math.floor((gw - 1) / every), rows = Math.floor((gh - 1) / every);
      const geo = new THREE.PlaneGeometry((WU * cols * every) / (gw - 1), (DU * rows * every) / (gh - 1), cols, rows);
      geo.translate(-(WU - (WU * cols * every) / (gw - 1)) / 2, (DU - (DU * rows * every) / (gh - 1)) / 2, 0);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let r = 0, i = 0; r <= rows; r++) for (let c = 0; c <= cols; c++, i++) pos.setY(i, Y[r * every * gw + c * every]);
      geo.computeVertexNormals();
      const edge = edgeTexture();
      let top = 0;
      for (const y of Y) top = Math.max(top, y);
      const land = new THREE.MeshStandardMaterial({ color: "#ffffff", alphaMap: edge, transparent: true, roughness: 0.94, metalness: 0 });
      // the lines of height, faint on the ground
      const rise = meta.max - Math.max(0, meta.min);
      const stepH = ([5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((m) => m >= rise / (hasSea ? 12 : 20)) ?? 1000) * vs;
      const shaders: { uniforms: Record<string, THREE.IUniform> }[] = [];
      land.onBeforeCompile = (sh) => {
        sh.uniforms.uContour = { value: new THREE.Color(L.contour) };
        sh.uniforms.uContourA = { value: L.contourA * (hasSea ? 1.2 : 1.7) };
        sh.uniforms.uStep = { value: stepH };
        sh.uniforms.uLow = { value: new THREE.Color(L.low) };
        sh.uniforms.uHigh = { value: new THREE.Color(L.high) };
        sh.uniforms.uTop = { value: Math.max(top, 1e-3) };
        sh.uniforms.uTime = { value: 0 };
        // (the coast, a faint line of light where the land meets the sea)
        sh.uniforms.uCoast = { value: new THREE.Color(L.dark ? L.glow : L.line) };
        sh.uniforms.uCoastW = { value: hasSea ? top * 0.012 : 0 };
        shaders.push(sh);
        sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vH;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvH = position.y;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vH; uniform vec3 uContour, uLow, uHigh, uCoast; uniform float uContourA, uStep, uTop, uTime, uCoastW;")
          .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb *= mix(uLow, uHigh, smoothstep(0.0, uTop, vH));")
          .replace(
            "#include <dithering_fragment>",
            "#include <dithering_fragment>\nfloat kH = vH / uStep; float fH = abs(fract(kH - 0.5) - 0.5) / max(fwidth(kH) * 1.4, 1e-4);\nfloat swell = 0.55 + 0.45 * sin(kH * 6.2832 - uTime * 0.7);\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uContour, (1.0 - min(fH, 1.0)) * uContourA * swell * step(0.0, vH));\nif (uCoastW > 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, uCoast, (1.0 - smoothstep(0.0, uCoastW, vH)) * 0.4);",
          );
      };
      const terrain = new THREE.Mesh(geo, land);
      terrain.castShadow = terrain.receiveShadow = !lite;
      scene.add(terrain);
      if (hasSea) {
        // the sea, its surface catching the light in slow moving ripples
        const sea = new THREE.MeshStandardMaterial({ color: L.water, alphaMap: edge, transparent: true, opacity: 0.84, roughness: 0.2, metalness: 0.3 });
        sea.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = { value: 0 };
          shaders.push(sh);
          sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSea;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSea = (modelMatrix * vec4(transformed, 1.0)).xyz;");
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vSea; uniform float uTime;")
            .replace(
              "#include <normal_fragment_maps>",
              "#include <normal_fragment_maps>\nvec2 sp = vSea.xz * 2.2; float r1 = sin(sp.x * 1.3 + uTime * 0.9) * cos(sp.y * 1.1 - uTime * 0.7); float r2 = sin((sp.x + sp.y) * 2.3 - uTime * 1.3);\nnormal = normalize(normal + (viewMatrix * vec4(r1 * 0.09 + r2 * 0.04, 0.0, r2 * 0.07 - r1 * 0.03, 0.0)).xyz);",
            );
        };
        const water = new THREE.Mesh(new THREE.PlaneGeometry(WU, DU).rotateX(-Math.PI / 2), sea);
        water.receiveShadow = !lite;
        water.renderOrder = 1;
        scene.add(water);
      }

      // ── the light of the section's hour ──
      scene.add(new THREE.HemisphereLight(L.sky, L.ground, L.hemi));
      const sun = new THREE.DirectionalLight(L.sun, L.sunI);
      const az = (L.az * Math.PI) / 180, alt = (L.alt * Math.PI) / 180;
      sun.position.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)).multiplyScalar(160);
      sun.castShadow = !lite;
      sun.shadow.mapSize.set(1024, 1024);
      const sc = sun.shadow.camera;
      sc.left = sc.bottom = -Math.max(WU, DU) * 0.75;
      sc.right = sc.top = Math.max(WU, DU) * 0.75;
      sc.near = 1;
      sc.far = 400;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.04;
      // (softened: the land at the faded edges, unseen, casts shadows too)
      sun.shadow.intensity = 0.62;
      scene.add(sun);
      const fog = new THREE.Fog(L.haze, 100, 400);
      scene.fog = fog;

      // ── the view: the map's region, as much of it as the terrain holds ──
      // (never closer than a mile or so across: closer, the heights are not known well enough to show)
      const v = [...spec.view], least = 1600 / perUnit / (WU / (E0 - W0));
      for (const [a, b] of [[0, 2], [1, 3]]) if (v[b] - v[a] < least) [v[a], v[b]] = [(v[a] + v[b] - least) / 2, (v[a] + v[b] + least) / 2];
      const x0 = wx(Math.max(v[0], W0)), x1 = wx(Math.min(v[2], E0)), z0 = wz(Math.min(v[3], N0)), z1 = wz(Math.max(v[1], S0));
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, vw = x1 - x0, vd = z1 - z0;
      let ty = 0;
      for (let i = 0; i < 25; i++) ty += heightAt(x0 + (vw * ((i % 5) + 0.5)) / 5, z0 + (vd * (Math.floor(i / 5) + 0.5)) / 5) / 25;
      const PHI = 0.74;
      type Cam = { r: number; phi: number; theta: number; tx: number; ty: number; tz: number };
      const goal: Cam = { r: 100, phi: PHI, theta: 0, tx: cx, ty, tz: cz };
      const cur: Cam = { ...goal };
      let r0 = 0;
      // (the words' panel beside it, as wide as the section's words have made it)
      const panel = el.parentElement?.parentElement?.querySelector<HTMLElement>(".s-text") ?? null;
      const fit = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        const card = side && !mobile ? (panel?.offsetWidth || Math.min(520, w * 0.38)) + w * 0.045 + 16 : 0;
        const shift = side === "left" ? card / 2 : side === "right" ? -card / 2 : 0;
        camera.aspect = w / h;
        camera.setViewOffset(w, h, -shift, 0, w, h);
        camera.updateProjectionMatrix();
        const tv = Math.tan(((camera.fov / 2) * Math.PI) / 180), th = tv * ((w - card) / h);
        const r = Math.max(vw / 2 / th, (vd * Math.cos(PHI)) / 2 / tv) * 1.06;
        if (r0) {
          goal.r *= r / r0;
          cur.r *= r / r0;
        }
        r0 = r;
      };
      fit();
      r0 ||= vw * 1.6;
      goal.r = r0;
      if (!still) Object.assign(cur, { r: r0 * 2.1, phi: 0.2, theta: -0.6 });
      else Object.assign(cur, goal);
      let rate = 1.2;
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      if (panel) ro.observe(panel);
      off.push(() => ro.disconnect());

      // ── its places, standing up in light ──
      const glow = glowTexture();
      const blend = L.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      const S = vw * 0.011, H = vw * 0.075;
      type Pin = { g: THREE.Group; head: THREE.Object3D; ring: THREE.Mesh; at: number; top: THREE.Vector3 };
      const pins: Pin[] = [];
      const beamGeo = new THREE.CylinderGeometry(S * 0.12, S * 0.12, 1, 6, 1, true).translate(0, 0.5, 0);
      const ringGeo = new THREE.RingGeometry(0.72, 1, 48).rotateX(-Math.PI / 2);
      // a name: a place's (beside it, on whichever side is free), a region's or a route's (over it)
      type Label = { el: HTMLElement; p: THREE.Vector3; at: number; on?: boolean; place: boolean; side: string; pref: string; x: number; y: number; seen: boolean; size?: number[] };
      const labs: Label[] = [];
      const label = (cls: string, parts: [string, string][], p: THREE.Vector3, at: number, side = "") => {
        const d = document.createElement("div");
        d.className = `m3-label ${cls}${side && ` is-${side}`}`;
        const inner = document.createElement("div");
        inner.className = "m3-in";
        for (const [c, t] of parts) {
          const s = document.createElement("span");
          s.className = c;
          s.textContent = t;
          inner.append(s);
        }
        d.append(inner);
        labels.append(d);
        labs.push({ el: d, p, at, place: !!side, side, pref: side, x: 0, y: 0, seen: false });
      };
      (spec.places ?? []).forEach((k, i) => {
        const pl = PLACES[k];
        if (!pl) return;
        const x = wx(pl.at[0]), z = wz(pl.at[1]), y = heightAt(x, z);
        const holy = pl.kind === "holy";
        const color = new THREE.Color(holy ? L.glow : L.pin);
        const grp = new THREE.Group();
        grp.position.set(x, y, z);
        const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(holy ? L.glow : L.line) }, uAlpha: { value: L.dark ? 0.85 : 0.6 } }, vertexShader: LINE_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: blend }));
        beam.scale.y = H * (holy ? 1.25 : 1);
        grp.add(beam);
        const shape =
          holy ? new THREE.OctahedronGeometry(S * 1.05)
          : pl.kind === "mount" ? new THREE.ConeGeometry(S * 0.8, S * 1.7, 4)
          : pl.kind === "site" || pl.kind === "ruin" ? new THREE.TorusGeometry(S * 0.62, S * 0.16, 8, 32)
          : new THREE.SphereGeometry(pl.kind === "city" ? S * 0.78 : S * 0.6, 24, 16);
        const head = new THREE.Mesh(shape, new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(holy ? L.glow : L.line), emissiveIntensity: L.dark ? 0.9 : 0.35, roughness: 0.35, metalness: 0.4 }));
        const top = beam.scale.y;
        head.position.y = top;
        grp.add(head);
        if (holy || L.dark) {
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: L.glow, transparent: true, opacity: L.dark ? 0.9 : 0.5, depthWrite: false, blending: blend }));
          halo.scale.setScalar(S * (holy ? 7 : 4.5));
          halo.position.y = top;
          grp.add(halo);
        }
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: L.glow, transparent: true, opacity: 0, depthWrite: false, blending: blend }));
        ring.position.y = vw * 0.0006;
        grp.add(ring);
        grp.scale.setScalar(0.0001);
        scene.add(grp);
        const at = 0.7 + i * 0.14;
        pins.push({ g: grp, head, ring, at, top: new THREE.Vector3(x, y + top, z) });
        const note = [spec.notes?.[k], pl.approx && "where exactly is not certain"].filter(Boolean).join(" · ");
        label(`m3-place${holy ? " is-holy" : ""}`, note ? [["n", pl.name], ["o", note]] : [["n", pl.name]], new THREE.Vector3(x, y + top, z), at + 0.4, spec.sides?.[k] ?? "right");
      });
      (spec.regions ?? []).forEach((k, i) => {
        const rg = REGIONS[k];
        if (!rg) return;
        const x = wx(rg.at[0]), z = wz(rg.at[1]);
        label(rg.sea ? "m3-sea" : `m3-region is-${rg.size ?? 1}`, [["n", rg.name]], new THREE.Vector3(x, Math.max(0, heightAt(x, z)) + vw * 0.004, z), 0.5 + i * 0.05);
      });

      // ── its journeys, over the ground ──
      type Way = { core: THREE.ShaderMaterial; halo: THREE.ShaderMaterial; curve: THREE.CatmullRomCurve3; at: number; len: number; head: THREE.Mesh; mover: THREE.Sprite };
      const ways: Way[] = [];
      (spec.routes ?? []).forEach((rt, i) => {
        const flat = rt.via.map((p) => {
          const ll = typeof p === "string" ? PLACES[p].at : p;
          return new THREE.Vector3(wx(ll[0]), 0, wz(ll[1]));
        });
        if (flat.length < 2) return;
        const path = new THREE.CatmullRomCurve3(flat, false, "centripetal").getSpacedPoints(220);
        const len2 = path.reduce((s, p, j) => (j ? s + p.distanceTo(path[j - 1]) : 0), 0);
        const kind = rt.kind ?? "journey";
        const arc = rt.arc ?? (kind === "migration" ? 0.05 : kind === "letter" ? 0.08 : 0);
        const lift = vw * 0.003;
        // (a way through the air, as the Night Journey, rises from its start to its end in one arc, not
        // over every hill below it)
        const h0 = heightAt(path[0].x, path[0].z), h1 = heightAt(path[path.length - 1].x, path[path.length - 1].z);
        const pts = path.map((p, j) => {
          const t = j / (path.length - 1);
          const base = arc > 0.1 ? h0 + (h1 - h0) * t : heightAt(p.x, p.z);
          return new THREE.Vector3(p.x, base + lift + Math.sin(Math.PI * t) * len2 * arc, p.z);
        });
        const curve = new THREE.CatmullRomCurve3(pts);
        const rad = vw * (kind === "army" ? 0.0026 : 0.002);
        const color = new THREE.Color(kindColor(kind, L));
        const uni = (alpha: number, run: number) => ({ uColor: { value: color }, uProg: { value: 0 }, uTime: { value: 0 }, uLen: { value: len2 / (vw * 0.02) }, uDash: { value: rt.dashed || rt.approx ? 1.1 : 0 }, uAlpha: { value: alpha }, uRun: { value: run } });
        const core = new THREE.ShaderMaterial({ uniforms: uni(1, 1), vertexShader: LINE_VS, fragmentShader: ROUTE_FS, transparent: true });
        const halo = new THREE.ShaderMaterial({ uniforms: uni(L.dark ? 0.32 : 0.16, 0.6), vertexShader: LINE_VS, fragmentShader: ROUTE_FS, transparent: true, depthWrite: false, blending: blend });
        halo.uniforms.uDash.value = 0;
        scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 360, rad, 8), core));
        scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 360, rad * 3.4, 8), halo));
        const head = new THREE.Mesh(new THREE.ConeGeometry(rad * 3.4, rad * 10, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 }));
        const end = curve.getPointAt(1), tan = curve.getTangentAt(1);
        head.position.copy(end).addScaledVector(tan, -rad * 4);
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
        scene.add(head);
        const mover = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: L.dark ? "#ffffff" : color, transparent: true, opacity: 0, depthWrite: false, blending: blend }));
        mover.scale.setScalar(vw * 0.022);
        scene.add(mover);
        const at = 1.3 + i * 0.55;
        ways.push({ core, halo, curve, at, len: len2, head, mover });
        if (rt.label) label(`m3-route`, [["n", rt.label]], curve.getPointAt(0.5).add(new THREE.Vector3(0, vw * 0.006, 0)), at + 1.2);
      });

      // ── dust in the air, catching the light ──
      const N = lite ? 70 : 240, dp = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const x = cx + (Math.random() - 0.5) * vw * 1.3, z = cz + (Math.random() - 0.5) * vd * 1.3;
        dp.set([x, heightAt(x, z) + Math.random() * vw * 0.14, z], i * 3);
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
      const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: vw * 0.004, map: glow, color: L.dark ? L.glow : "#fff6e2", transparent: true, opacity: L.dark ? 0.7 : 0.55, depthWrite: false, blending: blend, sizeAttenuation: true }));
      scene.add(dust);

      // ── a hand on it ──
      const ray = new THREE.Raycaster();
      const ndc = (e: { clientX: number; clientY: number }) => {
        const r = canvas.getBoundingClientRect();
        return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      };
      const clampGoal = () => {
        goal.r = Math.min(r0 * 1.5, Math.max(r0 * 0.12, goal.r));
        goal.phi = Math.min(1.2, Math.max(0.08, goal.phi));
        goal.tx = Math.min(WU / 2, Math.max(-WU / 2, goal.tx));
        goal.tz = Math.min(DU / 2, Math.max(-DU / 2, goal.tz));
        setZoomed(Math.abs(goal.r - r0) > r0 * 0.03 || Math.abs(goal.theta) > 0.05 || Math.abs(goal.phi - PHI) > 0.05 || Math.hypot(goal.tx - cx, goal.tz - cz) > vw * 0.01);
      };
      const touched = () => (rate = 6);
      ctl.current = {
        zoom: (f) => (touched(), (goal.r /= f), clampGoal()),
        reset: () => (touched(), Object.assign(goal, { r: r0, phi: PHI, theta: 0, tx: cx, ty, tz: cz }), clampGoal()),
      };
      let drag: { x: number; y: number; pan: boolean } | null = null;
      const pts = new Map<number, { x: number; y: number }>();
      let pinch = 0;
      const down = (e: PointerEvent) => {
        if (e.pointerType === "mouse") {
          e.stopPropagation();
          drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
          canvas.setPointerCapture(e.pointerId);
          canvas.classList.add("is-dragging");
          touched();
          return;
        }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = Math.hypot(a.x - b.x, a.y - b.y);
        }
      };
      const move = (e: PointerEvent) => {
        if (pts.has(e.pointerId)) {
          pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pts.size === 2 && pinch) {
            const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
            touched();
            goal.r *= pinch / d;
            pinch = d;
            clampGoal();
          }
          return;
        }
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (drag.pan) {
          const k = (goal.r * 0.0016) / Math.max(0.5, el.clientHeight / 800), th = goal.theta;
          goal.tx -= (dx * Math.cos(th) + dy * Math.sin(th)) * k;
          goal.tz -= (-dx * Math.sin(th) + dy * Math.cos(th)) * k;
          goal.ty = heightAt(goal.tx, goal.tz);
        } else {
          goal.theta -= dx * 0.005;
          goal.phi -= dy * 0.004;
        }
        clampGoal();
      };
      const up = (e: PointerEvent) => {
        pts.delete(e.pointerId);
        if (pts.size < 2) pinch = 0;
        drag = null;
        canvas.classList.remove("is-dragging");
      };
      const dbl = (e: MouseEvent) => {
        ray.setFromCamera(ndc(e), camera);
        const hit = ray.intersectObject(terrain)[0];
        if (!hit) return;
        touched();
        Object.assign(goal, { tx: hit.point.x, ty: hit.point.y, tz: hit.point.z, r: goal.r * 0.5 });
        clampGoal();
      };
      const wheel = (e: WheelEvent) => {
        if (!e.ctrlKey) return; // (the wheel alone turns the Seerah's pages)
        e.preventDefault();
        e.stopPropagation();
        touched();
        goal.r *= Math.exp(e.deltaY * 0.01);
        clampGoal();
      };
      const mouse = { x: 0, y: 0 }, par = { x: 0, y: 0 };
      const hover = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        const r = el.getBoundingClientRect();
        mouse.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
        mouse.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      };
      const menu = (e: Event) => e.preventDefault();
      canvas.addEventListener("pointerdown", down);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointermove", hover);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      canvas.addEventListener("dblclick", dbl);
      canvas.addEventListener("wheel", wheel, { passive: false });
      canvas.addEventListener("contextmenu", menu);
      off.push(() => {
        canvas.removeEventListener("pointerdown", down);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointermove", hover);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        canvas.removeEventListener("dblclick", dbl);
        canvas.removeEventListener("wheel", wheel);
        canvas.removeEventListener("contextmenu", menu);
      });

      // ── and its time ──
      setState("ready");
      const clock = new THREE.Clock();
      const p = new THREE.Vector3(), q = new THREE.Vector3();
      let frame = 0;
      // the names kept from lying over each other: a place's moved to a free side (its note dropped
      // when none is), a region's or a route's left out where a place's name is
      const unclutter = () => {
        const placed: number[][] = labs.filter((l) => l.place && l.seen).map((l) => [l.x - 9, l.y - 9, l.x + 9, l.y + 9]);
        const hits = (r: number[]) => placed.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]);
        const boxAt = (l: Label, side: string, small: boolean) => {
          const [fw, fh, nw, nh] = l.size!, bw = small ? nw : fw, bh = small ? nh : fh;
          const x = side === "right" ? l.x + 12 : side === "left" ? l.x - 12 - bw : l.x - bw / 2;
          const y = side === "above" ? l.y - 14 - bh : side === "below" ? l.y + 14 : l.y - bh / 2;
          return [x, y, x + bw, y + bh];
        };
        // (free: on no other name, and not running off the map's edge)
        const W = el.clientWidth, H = el.clientHeight;
        const free = (r: number[]) => !hits(r) && r[0] > 4 && r[1] > 4 && r[2] < W - 4 && r[3] < H - 4;
        for (const l of labs) {
          if (!l.seen || !l.on) continue;
          const inner = l.el.firstElementChild as HTMLElement, name = inner.firstElementChild as HTMLElement;
          if (!l.size) {
            l.el.classList.remove("is-crowded");
            l.size = [inner.offsetWidth, inner.offsetHeight, name.offsetWidth, name.offsetHeight];
          }
          if (!l.place) continue;
          const sides = [...new Set([l.side, l.pref, "right", "left", "above", "below"])];
          let small = false, side = sides.find((s) => free(boxAt(l, s, false)));
          if (!side) {
            small = true;
            side = sides.find((s) => free(boxAt(l, s, true))) ?? l.pref;
          }
          if (side !== l.side) {
            l.el.classList.replace(`is-${l.side}`, `is-${side}`);
            l.side = side;
          }
          l.el.classList.toggle("is-crowded", small);
          placed.push(boxAt(l, side, small));
        }
        for (const l of labs) {
          if (l.place || !l.seen || !l.size) continue;
          const r = [l.x - l.size[0] / 2, l.y - l.size[1] / 2, l.x + l.size[0] / 2, l.y + l.size[1] / 2];
          const hidden = hits(r);
          l.el.classList.toggle("is-hidden", hidden);
          if (!hidden) placed.push(r);
        }
      };
      document.fonts?.ready.then(() => labs.forEach((l) => (l.size = undefined)));
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
        if (rate < 4 && t > 3.2) rate = 4;
        const k = 1 - Math.exp(-dt * rate);
        const c = cur, gl = goal;
        c.r += (gl.r - c.r) * k;
        c.phi += (gl.phi - c.phi) * k;
        c.theta += (gl.theta - c.theta) * k;
        c.tx += (gl.tx - c.tx) * k;
        c.ty += (gl.ty - c.ty) * k;
        c.tz += (gl.tz - c.tz) * k;
        const kp = 1 - Math.exp(-dt * 2.5);
        par.x += (mouse.x - par.x) * kp;
        par.y += (mouse.y - par.y) * kp;
        const th = c.theta + (still ? 0 : Math.sin(t * 0.11) * 0.045 + par.x * 0.06);
        const ph = c.phi + (still ? 0 : par.y * 0.03);
        camera.position.set(c.tx + c.r * Math.sin(ph) * Math.sin(th), c.ty + c.r * Math.cos(ph), c.tz + c.r * Math.sin(ph) * Math.cos(th));
        camera.lookAt(c.tx, c.ty, c.tz);
        fog.near = c.r * 0.8;
        fog.far = c.r * 2.7;
        for (const pn of pins) {
          const a = ease((t - pn.at) / 0.9);
          pn.g.scale.setScalar(Math.max(0.0001, a));
          pn.head.rotation.y = t * 0.6;
          const ph2 = ((t - pn.at) % 2.8) / 2.8;
          pn.ring.scale.setScalar(S * (1 + ph2 * 5));
          (pn.ring.material as THREE.MeshBasicMaterial).opacity = a * (1 - ph2) * (L.dark ? 0.7 : 0.45);
        }
        for (const w of ways) {
          const prog = ease((t - w.at) / (2.2 + w.len / 60));
          w.core.uniforms.uProg.value = w.halo.uniforms.uProg.value = prog;
          w.core.uniforms.uTime.value = w.halo.uniforms.uTime.value = t;
          (w.head.material as THREE.MeshBasicMaterial).opacity = prog >= 0.999 ? Math.min(1, (w.head.material as THREE.MeshBasicMaterial).opacity + dt * 3) : 0;
          const m = w.mover.material as THREE.SpriteMaterial;
          if (prog > 0.999) {
            const lap = 4 + w.len / 25, f = ((t - w.at) % lap) / lap;
            w.mover.position.copy(w.curve.getPointAt(f));
            m.opacity = Math.sin(Math.PI * f) * (L.dark ? 1 : 0.8);
          } else if (prog > 0) {
            w.mover.position.copy(w.curve.getPointAt(prog));
            m.opacity = L.dark ? 1 : 0.8;
          }
        }
        if (!still) for (const sh of shaders) sh.uniforms.uTime.value = t;
        dust.position.x = Math.sin(t * 0.05) * vw * 0.02;
        dust.position.y = Math.sin(t * 0.08) * vw * 0.004;
        dust.rotation.y = Math.sin(t * 0.03) * 0.03;
        renderer.render(scene, camera);
        // the names, laid over where their places are
        const w = el.clientWidth, h = el.clientHeight;
        for (const lb of labs) {
          p.copy(lb.p).project(camera);
          lb.seen = p.z < 1 && Math.abs(p.x) < 1.15 && (mobile ? p.y < 1 - 150 / h && p.y > -1.1 : p.y < 1 - 120 / h && p.y > -1 + 190 / h);
          lb.x = ((p.x + 1) / 2) * w;
          lb.y = ((1 - p.y) / 2) * h;
          lb.el.style.transform = `translate3d(${lb.x}px, ${lb.y}px, 0)`;
          lb.el.style.visibility = lb.seen ? "" : "hidden";
          if (!lb.on && t > lb.at) {
            lb.on = true;
            lb.el.classList.add("is-on");
          }
        }
        if (++frame % 8 === 0) unclutter();
        // north, as the map is turned
        p.set(c.tx, c.ty, c.tz).project(camera);
        q.set(c.tx, c.ty, c.tz - 1).project(camera);
        if (compass.current) compass.current.style.transform = `rotate(${Math.atan2(q.x - p.x, q.y - p.y)}rad)`;
      };
      tick();
    })();

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      off.forEach((f) => f());
      ctl.current = null;
      labels.replaceChildren();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          mat.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [id, name, mood, mobile, side]); // eslint-disable-line react-hooks/exhaustive-deps

  const kinds = [...new Set((spec.routes ?? []).map((r) => r.kind ?? "journey"))];
  return (
    <div ref={box} className={`m3 ${L.dark ? "is-dark" : "is-light"}`} data-map={id} data-ready={state === "ready" || undefined} style={{ touchAction: "pan-y" }}>
      {state === "flat" && <img className="m3-flat" src={`${DIR}${name}.webp`} alt="" />}
      <div ref={layer} className="m3-labels" aria-hidden />
      <div className="m3-keys">
        {kinds.length > 0 && (
          <div className="m3-legend">
            {kinds.map((k) => (
              <span key={k}>
                <i style={{ background: kindColor(k, L) }} />
                {KINDS[k]}
              </span>
            ))}
            {(spec.routes ?? []).some((r) => r.approx) && (
              <span>
                <i className="is-dashed" style={{ color: L.line }} />
                The way approximate
              </span>
            )}
          </div>
        )}
        <span className="m3-credit">Heights: SRTM, smoothed</span>
      </div>
      <div className="m3-btns">
        <button type="button" onClick={() => ctl.current?.zoom(1.6)} aria-label="Closer" title="Closer">
          <Plus size={14} strokeWidth={1.6} />
        </button>
        <button type="button" onClick={() => ctl.current?.zoom(1 / 1.6)} aria-label="Further" title="Further">
          <Minus size={14} strokeWidth={1.6} />
        </button>
        {zoomed && (
          <button type="button" onClick={() => ctl.current?.reset()} aria-label="The whole map" title="The whole map">
            <RotateCcw size={13} strokeWidth={1.6} />
          </button>
        )}
        <div ref={compass} className="m3-compass" title="North">
          <span>N</span>
        </div>
      </div>
      {state === "loading" && <div className="m3-loading s-label">Raising the land…</div>}
      <span className="sr-only">Map: {(spec.places ?? []).map((p) => PLACES[p]?.name).join(", ")}</span>
    </div>
  );
}
