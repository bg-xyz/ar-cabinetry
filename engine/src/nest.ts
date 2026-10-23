// Simple shelf nesting: parts sorted by width, laid along the sheet's long
// side in rows. Exposed parts keep their grain along the sheet grain; hidden
// parts may turn 90 degrees. Good enough to cut a test piece; a real nester
// can replace this later without touching anything else.

import { lookup } from './catalog.ts';
import type { Catalog, FlatOp, FlatPart } from './types.ts';

export interface Placement { part: FlatPart; x: number; y: number; rotated: boolean; w: number; h: number }
export interface Sheet { material: string; size: [number, number]; placements: Placement[] }
export interface NestOptions { margin: number; spacing: number }

interface Shelf { sheet: Sheet; y: number; h: number; x: number }

export function nest(parts: FlatPart[], cat: Catalog, o: NestOptions, warnings: string[]): Sheet[] {
  const sheets: Sheet[] = [];
  const byMat = new Map<string, FlatPart[]>();
  for (const p of parts) byMat.set(p.material, [...(byMat.get(p.material) ?? []), p]);

  for (const [material, list] of byMat) {
    const size = lookup(cat.materials, material, 'material').sheet;
    const [SX, SY] = size;
    const usableX = SX - 2 * o.margin, usableY = SY - 2 * o.margin;
    const shelves: Shelf[] = [];
    const matSheets: Sheet[] = [];
    const sorted = [...list].sort((a, b) => Math.min(b.width, b.length) - Math.min(a.width, a.length) || b.length - a.length);

    for (const part of sorted) {
      let rotated = part.length > usableX;
      if (!part.grainLocked && !rotated && part.width > part.length && part.width <= usableX) rotated = true;
      if (rotated && part.grainLocked) warnings.push(`${part.id}: too long for the sheet with the grain; turned 90 degrees (grain runs across)`);
      const w = rotated ? part.width : part.length, h = rotated ? part.length : part.width;
      if (w > usableX || h > usableY) throw new Error(`${part.id} (${part.length} x ${part.width}) does not fit a ${SX} x ${SY} sheet`);

      let shelf = shelves.find((s) => s.x + w <= o.margin + usableX && h <= s.h);
      if (!shelf) {
        const sheet = matSheets.find((sh) => {
          const top = shelves.filter((s) => s.sheet === sh).reduce((a, s) => Math.max(a, s.y + s.h + o.spacing), o.margin);
          return top + h <= o.margin + usableY;
        });
        const target = sheet ?? (() => { const s: Sheet = { material, size, placements: [] }; matSheets.push(s); return s; })();
        const y = shelves.filter((s) => s.sheet === target).reduce((a, s) => Math.max(a, s.y + s.h + o.spacing), o.margin);
        shelf = { sheet: target, y, h, x: o.margin };
        shelves.push(shelf);
      }
      shelf.sheet.placements.push({ part, x: shelf.x, y: shelf.y, rotated, w, h });
      shelf.x += w + o.spacing;
    }
    sheets.push(...matSheets);
  }
  return sheets;
}

// Part-local op -> sheet coordinates (rotation is +90 degrees, face A stays up).
export function placeOp(op: FlatOp, pl: Placement): FlatOp {
  const tx = (x: number, y: number): [number, number] =>
    pl.rotated ? [pl.x + (pl.part.width - y), pl.y + x] : [pl.x + x, pl.y + y];
  if (op.kind === 'hole' || op.kind === 'cutCircle') {
    const [x, y] = tx(op.x, op.y);
    return { ...op, x, y };
  }
  const [ax, ay] = tx(op.x0, op.y0), [bx, by] = tx(op.x1, op.y1);
  return { ...op, x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
}
