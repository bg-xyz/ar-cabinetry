// Parts -> sheets: flatten every part, lay out the grain-matched groups, nest. Pure (no file
// access), so the phone can count sheets as you change the design.

import { flatten } from './flatten.ts';
import { matchBlocks } from './match.ts';
import { nest } from './nest.ts';
import type { Catalog, Design } from './types.ts';

export function cutSheets(design: Design, cat: Catalog, toolDia: number, warnings: string[] = [], quick = false) {
  const flat = design.parts.map((p) => flatten(p, cat, toolDia / 2 + 1));
  const o = { margin: 15, spacing: toolDia + 6, quick };
  const m = matchBlocks(design, flat, cat, o);
  return { flat, sheets: nest(m.loose, cat, o, warnings, m.blocks), matched: m.notes };
}
