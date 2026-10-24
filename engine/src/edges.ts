// Edgebanding: which visible edges of each part get veneer tape, and how much tape the job needs.
// Fronts are banded all round; countertops on the front and both ends; end panels on the front
// and top; every other visible panel on its front edge. Hidden edges and parts stay raw.
// Lengths are finished sizes: 0.5mm veneer needs no deduction from the cut size.

import { finishFor } from './model3d.ts';
import type { Catalog, HardwareLine, Part, Style } from './types.ts';

const FACE_AXIS = { x: 0, y: 1, z: 2 } as const;

export function bandFor(p: Part): Part['band'] {
  if (!p.exposed || p.scribe && p.role !== 'top') return undefined; // fillers + scribe strips: trimmed to the wall on site
  const [sx, sy, sz] = p.box.size;
  if (p.role === 'door' || p.role === 'drawerFront') return { edges: 'all round', length: 2 * (sx + sy) };
  if (p.role === 'top') { // an end scribed to a wall stays raw
    const open = 2 - Number(!!p.scribe?.lo) - Number(!!p.scribe?.hi);
    return { edges: ['front', 'front + open end', 'front + ends'][open], length: sx + open * sz };
  }
  if (p.id === 'back-panel') return { edges: 'top + ends', length: sx + 2 * sy };
  if (p.role === 'endPanel') return { edges: 'front + top', length: sy + sz };
  const n = FACE_AXIS[p.faceA[1] as 'x' | 'y' | 'z'];
  if (n === 2) return undefined; // faces the room (plinth front, back): its edges are hidden
  const along = [0, 1].find((a) => a !== n)!; // the in-plane axis that isn't depth
  return { edges: 'front', length: p.box.size[along] };
}

/** Mark every banded part and add the tape to the hardware list, one line per finish. */
export function applyBanding(parts: Part[], style: Style, cat: Catalog): HardwareLine[] {
  if (style.edges !== 'banded') return [];
  const byFinish = new Map<string, number>();
  for (const p of parts) {
    const band = bandFor(p);
    if (!band) continue;
    p.band = band;
    const f = finishFor(p, style);
    byFinish.set(f, (byFinish.get(f) ?? 0) + band.length);
  }
  return [...byFinish].map(([f, mm]) => ({
    item: `Edgebanding, ${style.bandThickness}mm ${cat.finishes[f]?.paint ? 'paint-grade maple' : (cat.finishes[f]?.name ?? f).split(' (')[0].replace(/^Natural /, '')}, pre-glued, 22mm wide (metres, +10%)`,
    qty: Math.ceil((mm / 1000) * 1.1),
  }));
}
