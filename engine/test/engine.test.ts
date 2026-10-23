import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/catalog.ts';
import { designRun } from '../src/run.ts';
import { buildJob, writeJob } from '../src/job.ts';
import type { Design, Part, RunSpec, Vec3 } from '../src/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const cat = loadCatalog();
const specsDir = join(here, '..', 'specs');
const specs = readdirSync(specsDir).filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(join(specsDir, f), 'utf8')) as RunSpec] as const);

// Extra designs that exercise switches the sample specs don't.
const variants: [string, RunSpec][] = [
  ['inset drawers, no sink', { name: 'inset bank', mounting: 'wall-hung', elevation: 300, style: { preset: 'ply-inset' },
    cabinets: [{ id: 'A', width: 600, height: 700, depth: 550, zones: [{ type: 'drawer', size: 'fill' }, { type: 'drawer', size: 'fill' }, { type: 'drawer', size: 'fill' }] }] }],
  ['recessed inset single door', { name: 'recessed', mounting: 'wall-hung', elevation: 300, style: { preset: 'recessed-inset' },
    cabinets: [{ id: 'A', width: 450, height: 720, depth: 400, zones: [{ type: 'doors', size: 'fill', count: 1, hinge: 'right' }] }] }],
  ['groove grip', { name: 'groove', mounting: 'wall-hung', elevation: 300, style: { grip: 'groove', pull: 'none' },
    cabinets: [{ id: 'A', width: 500, height: 500, depth: 500, zones: [{ type: 'drawer', size: 'fill' }, { type: 'doors', size: 250, count: 2 }] }] }],
];
const all: [string, RunSpec][] = [...specs.map(([f, s]) => [f, s] as [string, RunSpec]), ...variants];

const EPS = 0.05;
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

function collisions(d: Design): string[] {
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

for (const [name, spec] of all) {
  test(`${name}: designs, flattens and nests`, () => {
    const d = designRun(spec, cat);
    const job = buildJob(d, cat, { units: 'in', toolDia: 6.35 }); // flatten throws on any off-part / off-face op
    assert.ok(d.parts.length > 5);
    assert.equal(job.flat.length, d.parts.length);
  });

  test(`${name}: writes a complete job package`, () => {
    const d = designRun(spec, cat);
    const o = { units: 'in' as const, toolDia: 6.35 };
    const dir = mkdtempSync(join(tmpdir(), 'cab-'));
    try {
      const files = writeJob(join(dir, 'job'), d, buildJob(d, cat, o), cat, o, '/*PARTS_JSON*/null');
      for (const f of ['parts.json', 'cutlist.csv', 'jobsheet.html', 'preview.html']) assert.ok(files.includes(f), f);
      assert.ok(files.some((f) => f.endsWith('.dxf')));
      assert.ok(!readFileSync(join(dir, 'job', 'jobsheet.html'), 'utf8').includes('undefined'));
    } finally { rmSync(dir, { recursive: true }); }
  });

  test(`${name}: parts only overlap where joinery was machined`, () => {
    assert.deepEqual(collisions(designRun(spec, cat)), []);
  });

  test(`${name}: fronts keep the global gap and never touch`, () => {
    const d = designRun(spec, cat);
    const fronts = d.parts.filter((p) => p.role === 'door' || p.role === 'drawerFront');
    for (let i = 0; i < fronts.length; i++) for (let j = i + 1; j < fronts.length; j++) {
      const a = fronts[i].box, b = fronts[j].box;
      const gx = Math.max(b.min[0] - (a.min[0] + a.size[0]), a.min[0] - (b.min[0] + b.size[0]));
      const gy = Math.max(b.min[1] - (a.min[1] + a.size[1]), a.min[1] - (b.min[1] + b.size[1]));
      const gap = Math.max(gx, gy);
      assert.ok(gap >= d.style.gap - EPS, `${fronts[i].id} / ${fronts[j].id} gap ${gap.toFixed(2)}`);
    }
  });

  test(`${name}: nesting keeps parts on the sheet and apart`, () => {
    const d = designRun(spec, cat);
    const job = buildJob(d, cat, { units: 'mm', toolDia: 6.35 });
    for (const sh of job.sheets) {
      for (const p of sh.placements) {
        assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= sh.size[0] && p.y + p.h <= sh.size[1], `${p.part.id} off sheet`);
      }
      for (let i = 0; i < sh.placements.length; i++) for (let j = i + 1; j < sh.placements.length; j++) {
        const a = sh.placements[i], b = sh.placements[j];
        const apart = a.x + a.w + 6.35 <= b.x + EPS || b.x + b.w + 6.35 <= a.x + EPS || a.y + a.h + 6.35 <= b.y + EPS || b.y + b.h + 6.35 <= a.y + EPS;
        assert.ok(apart, `${a.part.id} and ${b.part.id} closer than one cutter`);
      }
    }
  });
}

test('drawer box follows Blum: inside width = opening - 42, length = runner - 10', () => {
  const d = designRun(variants[0][1], cat);
  const side = d.parts.find((p) => p.id === 'A-drawer-1-side-L')!;
  const sideR = d.parts.find((p) => p.id === 'A-drawer-1-side-R')!;
  const t = cat.materials[d.style.carcass].thickness;
  const inside = sideR.box.min[0] - (side.box.min[0] + side.box.size[0]);
  assert.equal(Math.round(inside * 10) / 10, 600 - 2 * t - 42);
  assert.ok(cat.runners[d.style.runner].lengths.map((l) => l - 10).includes(side.box.size[2]));
});

test('a drawer under a sink is refused with a warning', () => {
  const d = designRun({ name: 's', units: 'in', mounting: 'wall-hung', elevation: 10, cabinets: [{ id: 'A', width: 30, height: 20, depth: 20, zones: [{ type: 'drawer', size: 'fill' }] }],
    top: { material: 'bb18', overhangSides: 0, overhangFront: 0.5 }, sinks: [{ cabinet: 'A', sink: 'vessel-round-16', faucet: 'vessel-single-hole' }] }, cat);
  assert.ok(d.warnings.some((w) => w.includes('drain')));
  assert.ok(!d.parts.some((p) => p.role === 'drawerSide'));
});
