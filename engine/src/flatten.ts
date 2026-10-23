// Turn a 3D part into the 2D drawing the CNC sees: face A up, length along
// the grain. Every operation is projected from world space, and anything that
// isn't on face A or lands outside the part throws, so bad geometry never
// reaches a machine.

import type { Axis, Face, FlatOp, FlatPart, Part, Vec3 } from './types.ts';
import { lookup } from './catalog.ts';
import type { Catalog } from './types.ts';

const EPS = 0.01;

function faceAxis(face: Face): { n: Axis; sign: 1 | -1 } {
  const n = ({ x: 0, y: 1, z: 2 } as const)[face[1] as 'x' | 'y' | 'z'];
  return { n, sign: face[0] === '+' ? 1 : -1 };
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function flatten(part: Part, cat: Catalog, overcut: number): FlatPart {
  const { min, size } = part.box;
  const { n, sign } = faceAxis(part.faceA);
  const plane = sign > 0 ? min[n] + size[n] : min[n];
  const inPlane = ([0, 1, 2] as Axis[]).filter((a) => a !== n);
  const u: Axis = part.grain !== null && part.grain !== n
    ? part.grain
    : (size[inPlane[0]] >= size[inPlane[1]] ? inPlane[0] : inPlane[1]);
  const v = inPlane.find((a) => a !== u) as Axis;

  // Look at face A from outside (view direction -n): right = f x up.
  const f: Vec3 = [0, 0, 0]; f[n] = -sign;
  const up: Vec3 = [0, 0, 0]; up[v] = 1;
  const uSign = cross(f, up)[u];
  const U = (p: Vec3) => (uSign > 0 ? p[u] - min[u] : min[u] + size[u] - p[u]);
  const V = (p: Vec3) => p[v] - min[v];
  const length = size[u], width = size[v], thickness = size[n];

  const thk = lookup(cat.materials, part.material, 'material').thickness;
  if (Math.abs(thk - thickness) > EPS) throw new Error(`${part.id}: box thickness ${thickness} != material ${thk}`);

  const onFace = (p: Vec3, what: string) => {
    if (Math.abs(p[n] - plane) > EPS) throw new Error(`${part.id}: ${what} is not on face A (${p[n]} vs ${plane})`);
  };
  const inside = (x: number, y: number, r: number, what: string) => {
    if (x - r < -EPS || y - r < -EPS || x + r > length + EPS || y + r > width + EPS)
      throw new Error(`${part.id}: ${what} at (${x.toFixed(1)}, ${y.toFixed(1)}) falls off the part`);
  };
  const deep = (d: number, what: string) => {
    if (d >= thickness - 1) throw new Error(`${part.id}: ${what} depth ${d} leaves less than 1mm in a ${thickness}mm part`);
  };

  const ops: FlatOp[] = part.ops.map((op): FlatOp => {
    if (op.kind === 'hole' || op.kind === 'cutCircle') {
      onFace(op.at, op.note);
      const x = U(op.at), y = V(op.at);
      inside(x, y, op.dia / 2, op.note);
      if (op.kind === 'hole') { deep(op.depth, op.note); return { kind: 'hole', x, y, dia: op.dia, depth: op.depth, note: op.note }; }
      return { kind: 'cutCircle', x, y, dia: op.dia, note: op.note };
    }
    onFace(op.from, op.note); onFace(op.to, op.note);
    let x0 = Math.min(U(op.from), U(op.to)), x1 = Math.max(U(op.from), U(op.to));
    let y0 = Math.min(V(op.from), V(op.to)), y1 = Math.max(V(op.from), V(op.to));
    inside(x0, y0, 0, op.note); inside(x1, y1, 0, op.note);
    if (op.kind === 'cutRect') return { kind: 'cutRect', x0, y0, x1, y1, note: op.note };
    deep(op.depth, op.note);
    // pockets that run off an edge get carried past it so the cutter leaves a clean end
    if (x0 < EPS) x0 = -overcut;
    if (y0 < EPS) y0 = -overcut;
    if (x1 > length - EPS) x1 = length + overcut;
    if (y1 > width - EPS) y1 = width + overcut;
    return { kind: 'pocket', x0, y0, x1, y1, depth: op.depth, note: op.note };
  });

  return {
    id: part.id, name: part.name, material: part.material, thickness,
    length, width, grainLocked: part.exposed && part.grain !== null, ops,
  };
}
