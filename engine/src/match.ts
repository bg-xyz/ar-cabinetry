// Grain matching on the sheet. A match group (a cabinet face, one level of drawer bottoms) is laid
// out on the sheet the way the parts sit in the room, as one rigid block, so the veneer runs on
// from part to part. Fronts are machined from the back, so their block is the mirror image of the
// elevation; flatFrame() maps it exactly the way flatten() maps each part's own drawing.
// A block too big for the largest sheet splits into runs of whole cabinets; a group left with a
// single part is nested on its own.

import { flatFrame } from './flatten.ts';
import { lookup } from './catalog.ts';
import type { Catalog, Design, FlatPart, Part } from './types.ts';

export interface MatchBlock {
  id: string;
  material: string;
  length: number;            // along the grain (sheet x)
  width: number;
  members: { part: FlatPart; x: number; y: number }[];
}

const TOL = 0.5;

function layout(id: string, parts: Part[], flat: Map<string, FlatPart>, spacing: number): MatchBlock {
  const { u, v, uSign } = flatFrame(parts[0]);
  const u0 = Math.min(...parts.map((p) => p.box.min[u]));
  const u1 = Math.max(...parts.map((p) => p.box.min[u] + p.box.size[u]));
  const v0 = Math.min(...parts.map((p) => p.box.min[v]));
  const raw = parts.map((p) => ({
    part: flat.get(p.id)!,
    x: uSign > 0 ? p.box.min[u] - u0 : u1 - (p.box.min[u] + p.box.size[u]),
    y: p.box.min[v] - v0,
    l: p.box.size[u],
  }));
  const stacked = raw.some((a, i) => raw.some((b, j) => j > i && a.x < b.x + b.l - TOL && b.x < a.x + a.l - TOL));
  let members: MatchBlock['members'];
  if (!stacked) {
    // one row (a level of drawer bottoms, a row of doors): close the gaps up to one cutter
    let x = 0;
    members = [...raw].sort((a, b) => a.x - b.x).map((r) => { const m = { part: r.part, x, y: r.y }; x += r.l + spacing; return m; });
  } else {
    // rows and columns (a face): open every gap by one cutter per column / row, layout unchanged
    const rank = (vals: number[]) => {
      const steps: number[] = [];
      for (const q of [...vals].sort((a, b) => a - b)) if (!steps.length || q - steps[steps.length - 1] > TOL) steps.push(q);
      return (q: number) => steps.findIndex((s) => Math.abs(s - q) <= TOL);
    };
    const rx = rank(raw.map((r) => r.x)), ry = rank(raw.map((r) => r.y));
    members = raw.map((r) => ({ part: r.part, x: r.x + rx(r.x) * spacing, y: r.y + ry(r.y) * spacing }));
  }
  const length = Math.max(...members.map((m) => m.x + m.part.length));
  const width = Math.max(...members.map((m) => m.y + m.part.width));
  return { id, material: parts[0].material, length, width, members };
}

function fits(b: MatchBlock, cat: Catalog, margin: number): boolean {
  const m = lookup(cat.materials, b.material, 'material');
  return [m.sheet, m.longSheet].some((s) => !!s && b.length <= s[0] - 2 * margin + 1e-6 && b.width <= s[1] - 2 * margin + 1e-6);
}

/** Lay out the design's match groups as blocks; everything else stays loose for the nester. */
export function matchBlocks(design: Design, flatParts: FlatPart[], cat: Catalog, o: { margin: number; spacing: number }) {
  const flat = new Map(flatParts.map((p) => [p.id, p]));
  const groups = new Map<string, Part[]>();
  for (const p of design.parts) {
    if (!p.match) continue;
    const f = flatFrame(p);
    const key = `${p.match}|${p.material}|${p.faceA}|${f.u}${f.v}${f.uSign}`; // only parts that lie the same way share a block
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const blocks: MatchBlock[] = [];
  const notes: string[] = [];
  for (const [key, parts] of groups) {
    const name = key.split('|')[0];
    const whole = layout(name, parts, flat, o.spacing);
    if (parts.length > 1 && fits(whole, cat, o.margin)) { blocks.push(whole); notes.push(`${name}: ${parts.length} parts from one panel`); continue; }
    // too big: runs of whole cabinets, left to right, as long as each run fits
    const cabs = [...new Set(parts.map((p) => p.cabinet))]
      .sort((a, b) => Math.min(...parts.filter((p) => p.cabinet === a).map((p) => p.box.min[0])) - Math.min(...parts.filter((p) => p.cabinet === b).map((p) => p.box.min[0])));
    const runs: string[][] = [];
    for (const c of cabs) {
      const run = runs[runs.length - 1];
      const trial = run && layout(name, parts.filter((p) => [...run, c].includes(p.cabinet)), flat, o.spacing);
      if (trial && fits(trial, cat, o.margin)) run.push(c); else runs.push([c]);
    }
    let matched = 0;
    for (const run of runs) {
      const ps = parts.filter((p) => run.includes(p.cabinet));
      const b = layout(`${name} (${run.join('-')})`, ps, flat, o.spacing);
      if (ps.length > 1 && fits(b, cat, o.margin)) { blocks.push(b); matched++; }
    }
    if (matched) notes.push(`${name}: too wide for one sheet, matched in ${runs.length} panels (${runs.map((r) => r.join('-')).join(' | ')})`);
  }
  const inBlock = new Set(blocks.flatMap((b) => b.members.map((m) => m.part.id)));
  return { blocks, loose: flatParts.filter((p) => !inBlock.has(p.id)), notes };
}
