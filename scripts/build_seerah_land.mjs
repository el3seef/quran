// The Seerah's maps: the land around Arabia (Natural Earth, public domain, from world-atlas's
// land-50m.json) cut to the region, simplified and projected, written to src/seerah/land.ts.
//   node scripts/build_seerah_land.mjs path/to/land-50m.json
import { readFileSync, writeFileSync } from "node:fs";

const [W, E, S, N] = [24, 62, 8, 38]; // the region: Egypt and Abyssinia to Oman, Yemen to Syria and Iraq
const SCALE = 30; // units to a degree of latitude
const K = Math.cos((23 * Math.PI) / 180); // (a degree of longitude, shorter at these latitudes)
const px = ([lon, lat]) => [+((lon - W) * SCALE * K).toFixed(1), +((N - lat) * SCALE).toFixed(1)];

const topo = JSON.parse(readFileSync(process.argv[2], "utf8"));
const { scale, translate } = topo.transform;
// (the arcs, delta-encoded and quantized)
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => ((x += dx), (y += dy), [x * scale[0] + translate[0], y * scale[1] + translate[1]]));
});
const ring = (ids) =>
  ids.flatMap((i, k) => {
    const a = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
    return k ? a.slice(1) : a;
  });

// a ring cut to the region (Sutherland–Hodgman, one edge at a time)
function clip(pts) {
  const edges = [
    (p) => p[0] >= W, (p) => p[0] <= E, (p) => p[1] >= S, (p) => p[1] <= N,
  ];
  const cross = [
    (a, b) => [W, a[1] + ((b[1] - a[1]) * (W - a[0])) / (b[0] - a[0])],
    (a, b) => [E, a[1] + ((b[1] - a[1]) * (E - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (S - a[1])) / (b[1] - a[1]), S],
    (a, b) => [a[0] + ((b[0] - a[0]) * (N - a[1])) / (b[1] - a[1]), N],
  ];
  let out = pts;
  edges.forEach((inside, e) => {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross[e](prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross[e](prev, cur));
    }
  });
  return out;
}

// fewer points, the shape kept (Douglas–Peucker, in degrees)
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = pts[a], [x2, y2] = pts[b];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
    let far = -1, d = 0;
    for (let i = a + 1; i < b; i++) {
      const dd = Math.abs((x2 - x1) * (y1 - pts[i][1]) - (x1 - pts[i][0]) * (y2 - y1)) / len;
      if (dd > d) (d = dd), (far = i);
    }
    if (d > tol && far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

let d = "", rings = 0, points = 0;
for (const g of topo.objects.land.geometries) {
  const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
  for (const poly of polys)
    for (const r of poly) {
      const c = simplify(clip(ring(r)), 0.012);
      if (c.length < 3) continue;
      const p = c.map(px);
      // (islands too small to see at this scale left out)
      const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
      if (Math.max(...xs) - Math.min(...xs) < 2 && Math.max(...ys) - Math.min(...ys) < 2) continue;
      d += "M" + p.map((q) => q.join(",")).join("L") + "Z";
      rings++;
      points += p.length;
    }
}
const size = px([E, S]);
writeFileSync(
  new URL("../src/seerah/land.ts", import.meta.url),
  `// The land around Arabia, from Natural Earth (public domain), cut, simplified and projected by
// scripts/build_seerah_land.mjs. Do not edit by hand.
export const REGION = { W: ${W}, E: ${E}, S: ${S}, N: ${N}, SCALE: ${SCALE}, K: ${K} };
export const SIZE = { w: ${size[0]}, h: ${size[1]} };
export const LAND = "${d}";
`,
);
console.log(`${rings} rings, ${points} points, ${(d.length / 1024).toFixed(0)} KB, size ${size}`);
