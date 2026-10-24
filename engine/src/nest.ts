// Sheet nesting with MaxRects (best-short-side-fit). Exposed parts keep their grain along
// the sheet grain; hidden parts may turn 90 degrees if that packs better. Every part is
// padded by one cutter + clearance so neighbours never share a cut line. Grain-matched
// blocks (match.ts) are placed like one big part, never turned, and then unpacked.

import { lookup } from './catalog.ts';
import type { MatchBlock } from './match.ts';
import type { Catalog, FlatOp, FlatPart } from './types.ts';

export interface Placement { part: FlatPart; x: number; y: number; rotated: boolean; w: number; h: number }
export interface Sheet { material: string; size: [number, number]; placements: Placement[] }
export interface NestOptions { margin: number; spacing: number; quick?: boolean } // quick: fewer tries (phone estimates)

interface Rect { x: number; y: number; w: number; h: number }
interface Bin { sheet: Sheet; free: Rect[] }

type Item = FlatPart & { block?: MatchBlock };

// MaxRects is greedy, so the order parts go in matters, and so does which sheet a new bin opens
// on: per material, try a few orders on standard sheets and on long sheets, and keep the least
// plywood (then the fullest last sheet, which leaves the biggest offcut).
type Order = (a: FlatPart, b: FlatPart) => number;
const ORDERS: Order[] = [
  (a, b) => b.length * b.width - a.length * a.width || b.length - a.length,
  (a, b) => b.length - a.length || b.width - a.width,
  (a, b) => b.width - a.width || b.length - a.length,
  (a, b) => b.length + b.width - a.length - a.width,
  (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width) || b.length * b.width - a.length * a.width,
];

export function nest(parts: FlatPart[], cat: Catalog, o: NestOptions, warnings: string[], blocks: MatchBlock[] = []): Sheet[] {
  const byMat = new Map<string, Item[]>();
  const items: Item[] = [...parts, ...blocks.map((b): Item => ({
    id: b.id, name: b.id, material: b.material, thickness: 0, length: b.length, width: b.width, grainLocked: true, ops: [], block: b }))];
  for (const p of items) byMat.set(p.material, [...(byMat.get(p.material) ?? []), p]);

  const sheets: Sheet[] = [];
  const area = (ss: Sheet[]) => ss.reduce((a, s) => a + s.size[0] * s.size[1], 0);
  const lastYield = (ss: Sheet[]) => (ss.length ? sheetYield(ss[ss.length - 1]) : 0);
  for (const [material, list] of byMat) {
    const m = lookup(cat.materials, material, 'material');
    let best: { sheets: Sheet[]; warnings: string[] } | null = null;
    for (const preferLong of m.longSheet ? [false, true] : [false]) for (const order of o.quick ? ORDERS.slice(0, 1) : ORDERS) {
      const w: string[] = [];
      const ss = nestMaterial(material, list, cat, o, w, order, preferLong);
      if (!best || area(ss) < area(best.sheets) - 1 || (Math.abs(area(ss) - area(best.sheets)) <= 1 && lastYield(ss) < lastYield(best.sheets)))
        best = { sheets: ss, warnings: w };
    }
    sheets.push(...best!.sheets);
    warnings.push(...best!.warnings);
  }
  return sheets;
}

function nestMaterial(material: string, list: Item[], cat: Catalog, o: NestOptions, warnings: string[], order: Order, preferLong: boolean): Sheet[] {
  const sheets: Sheet[] = [];
  {
    // Parts too long for the standard sheet go on the material's long sheet (e.g. 4x8 Baltic
    // birch). They are placed first, so the other parts can use what's left of that sheet.
    const m = lookup(cat.materials, material, 'material');
    const usable = (s: [number, number]) => [s[0] - 2 * o.margin, s[1] - 2 * o.margin] as const;
    const needsLong = (p: Item) => !orientations(p, ...usable(m.sheet)).length;
    const bins: Bin[] = [];

    const tryBin = (bin: Bin, part: Item) => {
      let best: { r: Rect; rotated: boolean; score: number } | null = null;
      for (const rotated of orientations(part, ...usable(bin.sheet.size))) {
        const w = (rotated ? part.width : part.length) + o.spacing, h = (rotated ? part.length : part.width) + o.spacing;
        for (const f of bin.free) {
          if (w > f.w + 1e-6 || h > f.h + 1e-6) continue;
          const score = Math.min(f.w - w, f.h - h) * 1e6 + Math.max(f.w - w, f.h - h);
          if (!best || score < best.score) best = { r: { x: f.x, y: f.y, w, h }, rotated, score };
        }
      }
      return best;
    };

    const sorted = [...list].sort((a, b) => Number(needsLong(b)) - Number(needsLong(a)) || order(a, b));
    for (const part of sorted) {
      let bin = bins.find((b) => tryBin(b, part));
      if (!bin) {
        const longFits = !!m.longSheet && orientations(part, ...usable(m.longSheet)).length > 0;
        const size = needsLong(part) || (preferLong && longFits) ? m.longSheet : m.sheet;
        if (!size || !orientations(part, ...usable(size)).length)
          throw new Error(`${part.id} (${part.length.toFixed(0)} x ${part.width.toFixed(0)}) does not fit any ${m.name} sheet`);
        const sheet: Sheet = { material, size, placements: [] };
        sheets.push(sheet);
        // the free area is grown by one spacing so padded parts can still reach the margin
        bin = { sheet, free: [{ x: o.margin, y: o.margin, w: size[0] - 2 * o.margin + o.spacing, h: size[1] - 2 * o.margin + o.spacing }] };
        bins.push(bin);
      }
      const pick = tryBin(bin, part)!;
      if (part.block) {
        for (const mb of part.block.members)
          bin.sheet.placements.push({ part: mb.part, x: pick.r.x + mb.x, y: pick.r.y + mb.y, rotated: false, w: mb.part.length, h: mb.part.width });
        bin.free = splitFree(bin.free, pick.r);
        continue;
      }
      if (pick.rotated && part.grainLocked) warnings.push(`${part.id}: too long for the sheet with the grain; turned 90 degrees (grain runs across)`);
      bin.sheet.placements.push({ part, x: pick.r.x, y: pick.r.y, rotated: pick.rotated, w: pick.r.w - o.spacing, h: pick.r.h - o.spacing });
      bin.free = splitFree(bin.free, pick.r);
    }
  }
  return sheets;
}

// Allowed orientations: grain-locked parts only turn when they can't fit with the grain;
// matched blocks never turn.
function orientations(part: Item, usableX: number, usableY: number): boolean[] {
  const upright = part.length <= usableX && part.width <= usableY;
  const turned = part.width <= usableX && part.length <= usableY;
  const out: boolean[] = [];
  if (upright) out.push(false);
  if (turned && !part.block && (!part.grainLocked || !upright)) out.push(true);
  return out;
}

function splitFree(free: Rect[], used: Rect): Rect[] {
  const out: Rect[] = [];
  for (const f of free) {
    if (used.x >= f.x + f.w || used.x + used.w <= f.x || used.y >= f.y + f.h || used.y + used.h <= f.y) { out.push(f); continue; }
    if (used.x > f.x) out.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
    if (used.x + used.w < f.x + f.w) out.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
    if (used.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
    if (used.y + used.h < f.y + f.h) out.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
  }
  // drop rectangles contained in another (keep one of any identical pair)
  return out.filter((a, i) => !out.some((b, j) => j !== i &&
    a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w * a.h < b.w * b.h)));
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

// Fraction of the sheet covered by parts.
export const sheetYield = (s: Sheet) => s.placements.reduce((a, p) => a + p.w * p.h, 0) / (s.size[0] * s.size[1]);
