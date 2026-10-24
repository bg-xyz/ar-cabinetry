import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../src/load.ts';
import { designRun } from '../src/run.ts';
import { buildJob } from '../src/job.ts';
import { plan } from '../src/planner.ts';
import type { GrainMatch, Part } from '../src/types.ts';
import type { Placement } from '../src/nest.ts';

const IN = 25.4;
const cat = loadCatalog();
const job = (project: 'dresser' | 'console' | 'vanity' | 'bookcase', wall: number, grainMatch: GrainMatch) => {
  const p = plan({ project, wallLength: wall * IN, style: { preset: 'classic-euro', grainMatch } });
  const d = designRun(p.spec, cat);
  return { d, j: buildJob(d, cat, { units: 'mm', toolDia: 6.35 }) };
};
const where = (j: ReturnType<typeof buildJob>, id: string) => {
  for (const [i, s] of j.sheets.entries()) { const pl = s.placements.find((x) => x.part.id === id); if (pl) return { sheet: i, pl }; }
  throw new Error(`${id} not nested`);
};

// On the sheet the face is the mirror image of the elevation (fronts are machined from the back),
// rows keep their order, and parts sit one cutter apart at most a few mm beyond the real reveal.
function assertMirrored(parts: Part[], j: ReturnType<typeof buildJob>) {
  const at = parts.map((p) => ({ p, ...where(j, p.id) }));
  assert.equal(new Set(at.map((a) => a.sheet)).size, 1, 'all on one sheet');
  for (const a of at) for (const b of at) {
    if (a === b) continue;
    const pa: Placement = a.pl, pb: Placement = b.pl;
    assert.ok(!pa.rotated && !pb.rotated);
    if (a.p.box.min[0] + a.p.box.size[0] <= b.p.box.min[0] + 0.1) assert.ok(pa.x >= pb.x + pb.w, `${a.p.id} left of ${b.p.id} in the room, right of it on the sheet`);
    if (a.p.box.min[1] + a.p.box.size[1] <= b.p.box.min[1] + 0.1) assert.ok(pa.y + pa.h <= pb.y, `${a.p.id} below ${b.p.id}`);
  }
}

test('a dresser face is cut from one panel, mirrored, grain across', () => {
  const { d, j } = job('dresser', 62, 'across');
  const fronts = d.parts.filter((p) => p.role === 'drawerFront');
  assert.equal(fronts.length, 8);
  assert.ok(fronts.every((p) => p.grain === 0));
  assertMirrored(fronts, j);
  assert.ok(j.matched.some((m) => m.startsWith('face: 8 parts')), j.matched.join(' | '));
});

test('waterfall: vertical grain, each bank matched top to bottom', () => {
  const { d, j } = job('dresser', 62, 'waterfall');
  const fronts = d.parts.filter((p) => p.role === 'drawerFront');
  assert.ok(fronts.every((p) => p.grain === 1));
  for (const cab of ['A', 'B']) {
    const bank = fronts.filter((p) => p.cabinet === cab);
    const at = bank.map((p) => where(j, p.id));
    assert.equal(new Set(at.map((a) => a.sheet)).size, 1);
    // stacked drawers line up along the sheet grain, in order
    const xs = bank.map((p, i) => ({ y: p.box.min[1], x: at[i].pl.x })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < xs.length; i++) assert.notEqual(Math.sign(xs[i].x - xs[i - 1].x), 0);
  }
});

test('drawer bottoms at the same level are cut side by side, in order', () => {
  const { d, j } = job('dresser', 62, 'across');
  const bottoms = d.parts.filter((p) => p.role === 'drawerBottom');
  const levels = new Map<number, Part[]>();
  for (const b of bottoms) levels.set(Math.round(b.box.min[1]), [...(levels.get(Math.round(b.box.min[1])) ?? []), b]);
  assert.equal(levels.size, 4);
  for (const row of levels.values()) {
    assert.equal(row.length, 2);
    // seen from above the row is turned 180 degrees on the sheet (same face up), so the grain still runs on
    const [l, r] = row.map((p) => where(j, p.id)).sort((a, b) => a.pl.x - b.pl.x);
    assert.equal(l.sheet, r.sheet);
    assert.equal(l.pl.y, r.pl.y);
    assert.ok(Math.abs(r.pl.x - (l.pl.x + l.pl.w) - (6.35 + 6)) < 0.01, 'one cutter apart');
  }
});

test('a face too wide for one sheet matches in runs of whole cabinets', () => {
  const { j } = job('bookcase', 130, 'across');
  assert.ok(j.matched.some((m) => /panels/.test(m)), j.matched.join(' | '));
});

const plywood = (j: ReturnType<typeof buildJob>) => j.sheets.reduce((a, s) => a + s.size[0] * s.size[1], 0);

test('matching off gives the nester free rein: never more plywood than matched', () => {
  for (const project of ['dresser', 'console', 'vanity', 'bookcase'] as const) for (const wall of [40, 62, 74, 100]) {
    const on = job(project, wall, 'across').j, off = job(project, wall, 'off').j;
    assert.equal(off.matched.length, 0);
    assert.ok(plywood(off) <= plywood(on) + 1, `${project} ${wall}": off ${(plywood(off) / 1e6).toFixed(2)} m2 vs on ${(plywood(on) / 1e6).toFixed(2)} m2`);
  }
});
