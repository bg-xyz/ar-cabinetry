// The 3D model of a design: boxes + which way the grain and plies run + finishes.
// What the web preview and the iPhone app draw. No file access, so it also runs on the phone.

import { lookup } from './catalog.ts';
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

// Which finish a part shows. Drawer boxes and backs stay natural birch whatever the style.
export function finishFor(p: Part, s: Style): string {
  if (p.role === 'door' || p.role === 'drawerFront' || p.role === 'endPanel') return s.frontFinish;
  if (p.role === 'top') return s.topFinish;
  if (p.role.startsWith('drawer') || p.role === 'back') return 'birch';
  return s.carcassFinish;
}

export function model3d(design: Design, cat: Catalog) {
  const finishes = Object.fromEntries([...new Set(design.parts.map((p) => finishFor(p, design.style)))]
    .map((f) => [f, lookup(cat.finishes, f, 'finish')]));
  const textureKeys = [...new Set(Object.values(finishes).flatMap((f) => [f.texture, f.edge]).filter((t): t is string => !!t))];
  return {
    name: design.spec.name, units: 'mm', overall: design.overall, style: design.style.name,
    parts: design.parts.map((p) => ({
      id: p.id, name: p.name, role: p.role, material: p.material, box: p.box, exposed: p.exposed,
      finish: finishFor(p, design.style),
      grainAxis: p.grain,
      thicknessAxis: ({ x: 0, y: 1, z: 2 } as const)[p.faceA[1] as 'x' | 'y' | 'z'],
      plies: lookup(cat.materials, p.material, 'material').plies ?? 7,
      cuts: cutBoxes(p),
    })),
    fixtures: design.fixtures,
    finishes,
    textures: Object.fromEntries(textureKeys.map((k) => [k, Object.fromEntries(TEXTURE_MAPS.map((m) => [m, `textures/${k}/${m}.jpg`]))])),
  };
}
