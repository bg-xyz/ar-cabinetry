// The settings panel: exact sizes, sections, fronts and drawers, repaired to stay well made.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { loadCatalog } from '../src/load.ts';
import { designRun } from '../src/run.ts';
import { critique } from '../src/critic.ts';
import { plan } from '../src/planner.ts';
import { tuneRanges, tuneSpec } from '../src/tune.ts';

const IN = 25.4;
const cat = loadCatalog();
const near = (a: number, b: number, tol = 2) => Math.abs(a - b) <= tol;

test('height and depth come out exactly as asked', () => {
  const p = plan({ project: 'dresser', wallLength: 100 * IN });
  const { spec, notes } = tuneSpec(p.spec, 'dresser', { height: 36 * IN, depth: 20 * IN }, cat);
  const d = designRun(spec, cat);
  assert.ok(near(d.overall.height + d.overall.elevation, 36 * IN), `${(d.overall.height + d.overall.elevation) / IN}"`);
  assert.ok(near(d.overall.depth, 20 * IN), `${d.overall.depth / IN}"`);
  assert.deepEqual(notes, []);
  assert.deepEqual(critique(d), []);
});

test('out-of-range sizes are clamped and say so', () => {
  const p = plan({ project: 'vanity', wallLength: 60 * IN });
  const { spec, notes } = tuneSpec(p.spec, 'vanity', { height: 50 * IN }, cat);
  const d = designRun(spec, cat);
  assert.ok(near(d.overall.height + d.overall.elevation, 38 * IN));
  assert.match(notes.join(' '), /38" tall is as tall/);
});

test('sections, fronts and drawers', () => {
  const p = plan({ project: 'console', wallLength: 100 * IN });
  const t = tuneSpec(p.spec, 'console', { sections: 3, fronts: 'drawers', drawers: 3 }, cat);
  assert.equal(t.spec.cabinets.length, 3);
  assert.ok(t.spec.cabinets.every((c) => c.zones.length === 3 && c.zones.every((z) => z.type === 'drawer')));
  assert.deepEqual(critique(designRun(t.spec, cat)), []);
  const open = tuneSpec(p.spec, 'console', { fronts: 'open' }, cat);
  assert.ok(open.spec.cabinets.every((c) => c.zones.every((z) => z.type === 'open')));
  const mixed = tuneSpec(p.spec, 'console', { fronts: 'mixed', height: 30 * IN }, cat);
  assert.ok(mixed.spec.cabinets.every((c) => c.zones[0].type === 'doors' && c.zones.at(-1)!.type === 'drawer'));
});

test('too many drawers for the height: fewer, and it says so', () => {
  const p = plan({ project: 'console', wallLength: 80 * IN });
  const t = tuneSpec(p.spec, 'console', { drawers: 6 }, cat);
  const n = Math.max(...t.spec.cabinets.map((c) => c.zones.filter((z) => z.type === 'drawer').length));
  assert.ok(n < 6, `${n} drawers`);
  assert.match(t.notes.join(' '), /fit well at this height/);
  assert.deepEqual(critique(designRun(t.spec, cat)), []);
});

test('a bookcase base can be drawers; a low bookcase re-spaces its shelves', () => {
  const p = plan({ project: 'bookcase', wallLength: 96 * IN, wallHeight: 96 * IN });
  const t = tuneSpec(p.spec, 'bookcase', { fronts: 'drawers', drawers: 3, height: 60 * IN }, cat);
  const d = designRun(t.spec, cat);
  assert.ok(near(d.overall.height + d.overall.elevation, 60 * IN));
  assert.ok(t.spec.cabinets.every((c) => c.zones.filter((z) => z.type === 'drawer').length === 3 && c.zones.at(-1)!.type === 'open'));
  assert.deepEqual(critique(d), []);
});

test('sinks and knee spaces keep their sections; ranges say what can change', () => {
  const v = plan({ project: 'vanity', wallLength: 72 * IN });
  const r = tuneRanges(v.spec, 'vanity', designRun(v.spec, cat));
  assert.equal(r.sections, null);
  assert.deepEqual(r.fronts, ['drawers', 'doors', 'mixed']);
  assert.ok(r.golden.every((h) => h >= r.height[0] && h <= r.height[1]));
  const desk = plan({ project: 'desk', wallLength: 84 * IN });
  const t = tuneSpec(desk.spec, 'desk', { fronts: 'doors', depth: 26 * IN }, cat);
  assert.equal(t.spec.cabinets.length, desk.spec.cabinets.length);
  assert.ok(t.spec.cabinets.filter((c) => c.knee).every((c) => c.zones.length === desk.spec.cabinets.find((x) => x.id === c.id)!.zones.length));
});

test('random tunes all build clean (300 of them)', () => {
  const r = spawnSync(process.execPath, ['--no-warnings', new URL('./fuzz_tune.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), '300', '3'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout.slice(-800));
});
