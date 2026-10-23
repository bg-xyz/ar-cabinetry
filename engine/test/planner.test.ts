import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../src/load.ts';
import { designRun } from '../src/run.ts';
import { buildJob } from '../src/job.ts';
import { freeSpans, planVanity, STANDARD_WIDTHS } from '../src/planner.ts';

const IN = 25.4;
const cat = loadCatalog();

test('a 61" wall gets a 60" double vanity with two sinks', () => {
  const p = planVanity({ wallLength: 61 * IN });
  assert.equal(Math.round(p.width / IN), 60);
  assert.equal(p.sinks, 2);
  assert.equal(p.spec.sinks?.length, 2);
});

test('a 40" wall gets a 36" single vanity', () => {
  const p = planVanity({ wallLength: 40 * IN });
  assert.equal(Math.round(p.width / IN), 36);
  assert.equal(p.sinks, 1);
});

test('a door takes its width plus 2" each side off the wall', () => {
  const spans = freeSpans(100 * IN, [{ kind: 'door', x0: 0, x1: 32 * IN }]);
  assert.deepEqual(spans.map(([a, b]) => [Math.round(a / IN), Math.round(b / IN)]), [[34, 100]]);
  const p = planVanity({ wallLength: 100 * IN, obstacles: [{ kind: 'door', x0: 0, x1: 32 * IN }] });
  assert.ok(p.x0 >= 34 * IN && p.x0 + p.width <= 100 * IN);
  assert.equal(Math.round(p.width / IN), 60);
});

test('the vanity stays 15" from the toilet centre line', () => {
  const toilet = { kind: 'toilet' as const, x0: 70 * IN, x1: 90 * IN }; // centre 80"
  const p = planVanity({ wallLength: 110 * IN, obstacles: [toilet] });
  const right = p.x0 + p.width;
  assert.ok(right <= 65 * IN + 0.01, `vanity ends at ${(right / IN).toFixed(1)}"`);
});

test('it centres a single vanity on the existing sink and picks that stretch', () => {
  const p = planVanity({ wallLength: 120 * IN, sinkAt: 24 * IN, obstacles: [{ kind: 'door', x0: 50 * IN, x1: 80 * IN }] });
  assert.equal(p.span[0], 0);
  assert.equal(Math.round(p.width / IN), 42);
  assert.ok(Math.abs(p.x0 + p.width / 2 - 24 * IN) < 1);
});

test('when centring on the old sink does not fit, it slides over and says so', () => {
  const p = planVanity({ wallLength: 120 * IN, sinkAt: 30 * IN, obstacles: [{ kind: 'door', x0: 50 * IN, x1: 80 * IN }] });
  assert.ok(p.x0 + p.width <= 47.5 * IN + 0.01);
  assert.ok(p.notes.some((n) => n.startsWith('Shifted')), p.notes.join(' | '));
});

test('a wall too short says so', () => {
  assert.throws(() => planVanity({ wallLength: 20 * IN }), /wide enough/);
});

// every width the planner can pick must build, flatten and nest
for (const w of STANDARD_WIDTHS) {
  test(`${Math.round(w / IN)}" vanity builds into a valid job`, () => {
    const p = planVanity({ wallLength: w + 2 * IN });
    assert.equal(Math.round(p.width), Math.round(w));
    const d = designRun(p.spec, cat);
    assert.ok(!d.warnings.some((x) => /can't|no room|skipped/i.test(x)), d.warnings.join(' | '));
    const job = buildJob(d, cat, { units: 'in', toolDia: 6.35 });
    assert.ok(job.sheets.length > 0);
    assert.equal(d.parts.filter((x) => x.role === 'top').length, 1);
    assert.equal(d.fixtures.filter((f) => f.kind === 'sink').length, p.sinks);
  });
}
