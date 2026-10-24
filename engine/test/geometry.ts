// Geometry checks shared by the tests: parts may only overlap where joinery was machined.
import type { Design, Part, Vec3 } from '../src/types.ts';

export const EPS = 0.05;

const faceInfo = (p: Part) => {
  const n = { x: 0, y: 1, z: 2 }[p.faceA[1] as 'x' | 'y' | 'z'];
  return { n, sign: p.faceA[0] === '+' ? 1 : -1 };
};

// A pocket op as a solid: its face rectangle pushed `depth` into the part.
function pocketSolids(p: Part): { lo: Vec3; hi: Vec3 }[] {
  const { n, sign } = faceInfo(p);
  return p.ops.flatMap((op) => {
    if (op.kind !== 'pocket') return [];
    const lo: Vec3 = [0, 1, 2].map((a) => Math.min(op.from[a], op.to[a])) as Vec3;
    const hi: Vec3 = [0, 1, 2].map((a) => Math.max(op.from[a], op.to[a])) as Vec3;
    if (sign > 0) lo[n] = hi[n] - op.depth; else hi[n] = lo[n] + op.depth;
    return [{ lo, hi }];
  });
}

const within = (pt: Vec3, s: { lo: Vec3; hi: Vec3 }) => pt.every((v, a) => v >= s.lo[a] - EPS && v <= s.hi[a] + EPS);

export function collisions(d: Design): string[] {
  const bad: string[] = [];
  const solids = new Map(d.parts.map((p) => [p.id, pocketSolids(p)]));
  for (let i = 0; i < d.parts.length; i++) for (let j = i + 1; j < d.parts.length; j++) {
    const a = d.parts[i], b = d.parts[j];
    const lo = [0, 1, 2].map((k) => Math.max(a.box.min[k], b.box.min[k])) as Vec3;
    const hi = [0, 1, 2].map((k) => Math.min(a.box.min[k] + a.box.size[k], b.box.min[k] + b.box.size[k])) as Vec3;
    if (hi.some((h, k) => h - lo[k] <= EPS)) continue; // touching or apart
    // every sample point of the overlap must be wood that a pocket removed
    const cuts = [...solids.get(a.id)!, ...solids.get(b.id)!];
    const steps = 4;
    for (let x = 0; x <= steps; x++) for (let y = 0; y <= steps; y++) for (let z = 0; z <= steps; z++) {
      const f = (k: number, s: number) => lo[k] + (hi[k] - lo[k]) * (0.02 + 0.96 * s / steps);
      const pt: Vec3 = [f(0, x), f(1, y), f(2, z)];
      if (!cuts.some((c) => within(pt, c))) { bad.push(`${a.id} x ${b.id} at ${pt.map((v) => v.toFixed(1)).join(',')}`); x = y = z = steps + 1; }
    }
  }
  return bad;
}
