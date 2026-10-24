import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../src/load.ts';
import { designRun } from '../src/run.ts';
import { plan, PROJECTS } from '../src/planner.ts';
import { critique } from '../src/critic.ts';
import { GOLDEN_MINOR, PHI, graduate } from '../src/proportion.ts';
import type { Design, RunSpec } from '../src/types.ts';

const IN = 25.4;
const cat = loadCatalog();
const fronts = (d: Design, cab: string) => d.parts.filter((p) => p.cabinet === cab && p.role === 'drawerFront')
  .sort((a, b) => a.box.min[1] - b.box.min[1]).map((p) => p.box.size[1]);
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol * Math.max(a, b);

test('a graduated stack steps by one ratio and the bottom drawer is phi x the top', () => {
  for (const n of [2, 3, 4, 5]) {
    const hs = graduate(n, 900);
    assert.ok(near(hs.reduce((a, b) => a + b, 0), 900, 1e-9));
    assert.ok(near(hs[0] / hs[n - 1], PHI), `n=${n}`);
    for (let i = 2; i < n; i++) assert.ok(near(hs[i - 2] / hs[i - 1], hs[i - 1] / hs[i]));
  }
  // a short stack eases off rather than make a top drawer too shallow to use
  const tight = graduate(5, 600);
  assert.ok(tight[4] >= 4.5 * IN - 0.01 && tight[0] > tight[4]);
});

test('a dresser graduates golden from the top, and every drawer relates to the one above it the same way', () => {
  const d = designRun(plan({ project: 'dresser', wallLength: 70 * IN }).spec, cat);
  const hs = fronts(d, 'A');
  assert.equal(hs.length, 4);
  assert.ok(near(hs[0] / hs[3], PHI));
  assert.ok(near(hs[0] / hs[1], hs[1] / hs[2]) && near(hs[1] / hs[2], hs[2] / hs[3]));
});

test('a 48" vanity: the drawer bank takes the golden section and its top drawer lines up with the sink drawer', () => {
  const p = plan({ project: 'vanity', wallLength: 50 * IN });
  const [a, b] = p.spec.cabinets;
  assert.ok(Math.abs(b.width - 48 * IN * GOLDEN_MINOR) < IN / 4);
  const d = designRun(p.spec, cat);
  const fa = fronts(d, 'A'), fb = fronts(d, 'B');
  assert.equal(fa.length, 2); assert.equal(fb.length, 3);
  assert.ok(Math.abs(fa[1] - fb[2]) < 0.5, 'shared top drawer');
  assert.ok(near(fb[0] / fb[2], PHI));
  assert.equal(a.zones.length, 2);
});

test('a double vanity: each sink cabinet is phi x the bank between them', () => {
  const p = plan({ project: 'vanity', wallLength: 74 * IN });
  const [a, b, c] = p.spec.cabinets;
  assert.equal(a.width, c.width);
  assert.ok(near(a.width / b.width, PHI, 0.02));
});

test('rhythm "even" makes equal drawers, but the top drawer line still lines up along the run', () => {
  const p = plan({ project: 'vanity', wallLength: 50 * IN, style: { rhythm: 'even' } });
  const d = designRun(p.spec, cat);
  const fa = fronts(d, 'A'), fb = fronts(d, 'B');
  assert.ok(near(fb[0], fb[1]) && near(fb[1], fb[2]));
  assert.ok(Math.abs(fa[1] - fb[2]) < 0.5);
  assert.deepEqual(critique(d), []);
});

test('drawer pulls scale with the front: about a third of its width', () => {
  const d = designRun(plan({ project: 'dresser', wallLength: 40 * IN }).spec, cat);
  const pull = d.fixtures.find((f) => f.kind === 'pull')!;
  const front = d.parts.find((p) => p.role === 'drawerFront')!;
  const r = pull.box.size[0] / front.box.size[0];
  assert.ok(r > 0.25 && r < 0.45, `pull ${pull.box.size[0]} on ${front.box.size[0]}`);
  assert.ok(d.hardware.some((h) => /Bar pull, (256|320)mm/.test(h.item)));
  const fixed = designRun(plan({ project: 'dresser', wallLength: 40 * IN, style: { pullSizing: 'fixed' } }).spec, cat);
  assert.ok(fixed.hardware.some((h) => /Bar pull, 128mm/.test(h.item)) && !fixed.hardware.some((h) => /256mm/.test(h.item)));
});

test('the bookcase base stops near the golden section of its height', () => {
  const p = plan({ project: 'bookcase', wallLength: 100 * IN, wallHeight: 96 * IN });
  const base = p.spec.cabinets[0].zones[0].size as number;
  const total = (p.spec.kickHeight ?? 0) + p.spec.cabinets[0].height;
  assert.ok(Math.abs((base + (p.spec.kickHeight ?? 0)) / total - GOLDEN_MINOR) < 0.02);
});

test('the critic catches what the eye would: a top-heavy stack, near-miss widths, a wide door, a lost pull', () => {
  const spec: RunSpec = {
    name: 'bad', units: 'mm', mounting: 'legs', elevation: 150,
    cabinets: [
      { id: 'A', width: 600, height: 700, depth: 450, zones: [{ type: 'drawer', size: 200 }, { type: 'drawer', size: 'fill' }] },
      { id: 'B', width: 620, height: 700, depth: 450, zones: [{ type: 'drawer', size: 'fill' }, { type: 'drawer', size: 'fill' }, { type: 'drawer', size: 'fill' }] },
      { id: 'C', width: 760, height: 700, depth: 450, zones: [{ type: 'doors', size: 'fill', count: 1 }] },
    ],
    style: { pullSizing: 'fixed', pull: 'bar-96' },
  };
  const rules = new Set(critique(designRun(spec, cat)).map((f) => f.rule));
  for (const r of ['rhythm', 'near-miss', 'door', 'symmetry', 'top-line']) assert.ok(rules.has(r), `missing ${r}: ${[...rules]}`);
  const wide: RunSpec = { ...spec, cabinets: [{ id: 'A', width: 1000, height: 400, depth: 450, zones: [{ type: 'drawer', size: 'fill' }] }] };
  assert.ok(critique(designRun(wide, cat)).some((f) => f.rule === 'pull' && /lost/.test(f.message)));
});

test('every planned build passes the critic across a range of walls', () => {
  for (const project of PROJECTS)
    for (const L of [40, 52, 66, 80, 100, 130, 180]) {
      let p;
      try { p = plan({ project, wallLength: L * IN, wallHeight: 100 * IN }); } catch { continue; }
      const f = critique(designRun(p.spec, cat));
      assert.deepEqual(f.map((x) => x.message), [], `${project} on ${L}"`);
    }
});
