// The 3D model of a design: boxes + which way the grain and plies run + finishes.
// What the web preview and the iPhone app draw. No file access, so it also runs on the phone.
//
// True-to-life grain: given the nested sheets, every part carries where it was cut from
// (sheet, position, turned or not, and how its faces map to the sheet). The renderers take the
// veneer texture from that spot on that sheet, so the model shows the figure the CNC will
// actually cut: matched fronts flow because they were neighbours on the panel, and each sheet,
// and each side of it, has its own figure.

import { lookup } from './catalog.ts';
import { flatFrame } from './flatten.ts';
import type { Sheet } from './nest.ts';
import type { Catalog, Design, Part, Style } from './types.ts';

export const TEXTURE_MAPS = ['color', 'normal', 'roughness'] as const;

// Rectangular through-cuts (notches, plumbing holes) as 3D boxes, so the model shows them.
function cutBoxes(p: Part): { min: number[]; max: number[] }[] {
  const n = ({ x: 0, y: 1, z: 2 } as const)[p.faceA[1] as 'x' | 'y' | 'z'];
  return p.ops.flatMap((o) => {
    if (o.kind !== 'cutRect') return [];
    const min = [0, 1, 2].map((a) => Math.min(o.from[a], o.to[a]));
    const max = [0, 1, 2].map((a) => Math.max(o.from[a], o.to[a]));
    min[n] = p.box.min[n]; max[n] = p.box.min[n] + p.box.size[n];
    return [{ min, max }];
  });
}

// Which finish a part shows. Drawer boxes and hidden backs stay natural birch whatever the style;
// a back you see through open shelving matches the cabinet.
export function finishFor(p: Part, s: Style): string {
  if (p.role === 'door' || p.role === 'drawerFront' || p.role === 'endPanel') return s.frontFinish;
  if (p.role === 'top') return s.topFinish;
  if (p.role.startsWith('drawer') || (p.role === 'back' && !p.exposed)) return 'birch';
  return s.carcassFinish;
}

export interface SheetSpot {
  i: number;            // which sheet
  x: number; y: number; // where the part's drawing sits on it (mm, grain along x)
  rot: boolean;         // turned 90 degrees on the sheet
  w: number;            // the part's drawing width (needed to unturn)
  u: number; v: number; uSign: number; // world axes along / across the part's drawing (flatten.ts)
  faceA: 1 | -1;        // face A (up on the CNC) is the +n or -n face
}

export function model3d(design: Design, cat: Catalog, sheets?: Sheet[]) {
  const spots = new Map<string, SheetSpot>();
  sheets?.forEach((s, i) => s.placements.forEach((pl) => {
    const part = design.parts.find((q) => q.id === pl.part.id);
    if (!part) return;
    const f = flatFrame(part);
    spots.set(pl.part.id, { i, x: pl.x, y: pl.y, rot: pl.rotated, w: pl.part.width, u: f.u, v: f.v, uSign: f.uSign, faceA: f.sign });
  }));
  const finishes = Object.fromEntries([...new Set(design.parts.map((p) => finishFor(p, design.style)))]
    .map((f) => [f, lookup(cat.finishes, f, 'finish')]));
  const textureKeys = [...new Set(Object.values(finishes).flatMap((f) => [f.texture, f.edge]).filter((t): t is string => !!t))];
  return {
    name: design.spec.name, units: 'mm', overall: design.overall, style: design.style.name,
    parts: design.parts.map((p) => ({
      id: p.id, name: p.name, role: p.role, material: p.material, box: p.box, exposed: p.exposed,
      finish: finishFor(p, design.style),
      grainAxis: p.grain,
      texSeed: p.match ?? p.id,   // fallback without sheets: matched parts share one veneer offset
      sheet: spots.get(p.id),
      banded: !!p.band,           // edges show veneer banding instead of ply layers
      thicknessAxis: ({ x: 0, y: 1, z: 2 } as const)[p.faceA[1] as 'x' | 'y' | 'z'],
      plies: lookup(cat.materials, p.material, 'material').plies ?? 7,
      cuts: cutBoxes(p),
    })),
    fixtures: design.fixtures,
    finishes,
    textures: Object.fromEntries(textureKeys.map((k) => [k, Object.fromEntries(TEXTURE_MAPS.map((m) => [m, `textures/${k}/${m}.jpg`]))])),
  };
}
