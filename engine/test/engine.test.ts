import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../src/load.ts';
import { designRun } from '../src/run.ts';
import { buildJob, writeJob } from '../src/job.ts';
import type { RunSpec } from '../src/types.ts';
import { collisions, EPS } from './geometry.ts';

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

test('drawers under a sink become U-drawers that clear the drain', () => {
  const d = designRun({ name: 's', units: 'in', mounting: 'wall-hung', elevation: 10,
    cabinets: [{ id: 'A', width: 30, height: 20, depth: 20, zones: [{ type: 'drawer', size: 'fill' }, { type: 'drawer', size: 'fill' }] }],
    top: { material: 'bb18', overhangSides: 0, overhangFront: 0.5 }, sinks: [{ cabinet: 'A', sink: 'vessel-round-16', faucet: 'vessel-single-hole' }] }, cat);
  const drainHole = d.parts.find((p) => p.role === 'top')!.ops.find((o) => o.note === 'sink drain');
  assert.ok(drainHole && drainHole.kind === 'cutCircle');
  const [dx, , dz] = drainHole.at;
  assert.equal(d.parts.filter((p) => p.id.includes('notch-front')).length, 2);
  const pipe = 25; // radius of tailpiece + slip nut
  for (const p of d.parts.filter((q) => q.role.startsWith('drawer') && q.role !== 'drawerFront')) {
    const hitsX = dx + pipe > p.box.min[0] && dx - pipe < p.box.min[0] + p.box.size[0];
    const hitsZ = dz + pipe > p.box.min[2] && dz - pipe < p.box.min[2] + p.box.size[2];
    if (p.role === 'drawerBottom') {
      const cut = p.ops.find((o) => o.kind === 'cutRect');
      assert.ok(cut && cut.kind === 'cutRect', `${p.id} has no notch`);
      assert.ok(dx - pipe >= cut.from[0] && dx + pipe <= cut.to[0] && dz + pipe <= cut.to[2], `${p.id} notch misses the drain`);
    } else assert.ok(!(hitsX && hitsZ), `${p.id} sits on the drain line`);
  }
  assert.ok(!d.warnings.some((w) => w.includes('drain')));
});
