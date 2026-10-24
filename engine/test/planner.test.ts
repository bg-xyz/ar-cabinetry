import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../src/load.ts';
import { designRun } from '../src/run.ts';
import { buildJob } from '../src/job.ts';
import { bookcaseHeight, freeSpans, plan, planVanity, STANDARD_WIDTHS } from '../src/planner.ts';
import type { Project } from '../src/planner.ts';
import { collisions } from './geometry.ts';

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

// ---- other projects ----------------------------------------------------------------------------

test('a window over a vanity is fine; a low window blocks a bookcase', () => {
  const win = { kind: 'window' as const, x0: 40 * IN, x1: 76 * IN, bottom: 36 * IN };
  assert.equal(planVanity({ wallLength: 120 * IN, obstacles: [win] }).span[1], 120 * IN);
  const b = plan({ project: 'bookcase', wallLength: 120 * IN, obstacles: [win] });
  assert.ok(b.x0 + b.width <= 40 * IN + 18 + 0.01 || b.x0 - 18 >= 76 * IN - 0.01, `bookcase at ${b.x0}`);
  assert.ok(b.notes.some((n) => /window/.test(n)), b.notes.join(' | '));
});

test('a console goes under a window with a high sill, not one with a low sill', () => {
  const high = { kind: 'window' as const, x0: 30 * IN, x1: 70 * IN, bottom: 40 * IN };
  const low = { ...high, bottom: 18 * IN };
  assert.equal(Math.round(plan({ project: 'console', wallLength: 100 * IN, obstacles: [high] }).width / IN), 84);
  assert.equal(Math.round(plan({ project: 'console', wallLength: 120 * IN, obstacles: [low] }).width / IN), 48);
});

test('a bookcase fills the wall and stays under the ceiling, with room to tip it up', () => {
  const p = plan({ project: 'bookcase', wallLength: 130 * IN, wallHeight: 96 * IN });
  assert.ok(Math.abs(p.width - 129 * IN) < 25, `width ${p.width / IN}`);
  assert.ok(p.spec.cabinets.every((c) => c.width <= 36 * IN + 0.01));
  const d = designRun(p.spec, cat);
  const top = d.overall.height + d.overall.elevation;
  assert.ok(top <= 96 * IN - IN, `top at ${top / IN}"`);
  const c = p.spec.cabinets[0];
  assert.ok(Math.hypot(c.height, c.depth) < 96 * IN - 4 * IN);
  assert.ok(d.parts.some((x) => x.name === 'Fixed shelf'));
  assert.ok(d.parts.some((x) => x.name === 'Top panel'));
});

test('a low ceiling makes a shorter bookcase', () => {
  assert.ok(bookcaseHeight(84 * IN) < bookcaseHeight(96 * IN));
  assert.ok(bookcaseHeight(120 * IN) + 4 * IN <= 2400);
});

test('a 72" dresser is two banks of drawers, a 36" one is a single bank', () => {
  assert.equal(plan({ project: 'dresser', wallLength: 74 * IN }).spec.cabinets.length, 2);
  assert.equal(plan({ project: 'dresser', wallLength: 38 * IN }).spec.cabinets.length, 1);
});

// every project at a spread of wall lengths and ceilings must build, cut and assemble cleanly
const projects: Project[] = ['vanity', 'bookcase', 'console', 'dresser'];
for (const project of projects) for (const wall of [40, 52, 66, 80, 100, 150]) for (const ceiling of project === 'bookcase' ? [84, 96, 108] : [96]) {
  test(`${project} on a ${wall}" wall${project === 'bookcase' ? `, ${ceiling}" ceiling` : ''}: valid job, clean joinery`, () => {
    const p = plan({ project, wallLength: wall * IN, wallHeight: ceiling * IN });
    assert.ok(p.width <= wall * IN - IN + 0.01, `width ${p.width / IN}"`);
    assert.ok(p.x0 >= 0 && p.widthOptions.length > 0);
    const d = designRun(p.spec, cat);
    assert.ok(!d.warnings.length, d.warnings.join(' | '));
    assert.ok(Math.abs(d.overall.width - p.width) < 0.5, `model ${d.overall.width} vs plan ${p.width}`);
    buildJob(d, cat, { units: 'in', toolDia: 6.35 });
    assert.deepEqual(collisions(d), []);
  });
}

test('a kitchen island: finished all round, seating overhang, faces the counters', () => {
  const p = plan({ project: 'island', wallLength: 180 * IN });
  assert.equal(Math.round(p.width / IN), 90);
  assert.equal(p.faceWall, true);
  assert.ok(p.standoff && Math.abs(p.standoff - 67 * IN) < 1);
  const d = designRun(p.spec, cat);
  const top = d.parts.find((x) => x.role === 'top')!;
  assert.ok(top.box.min[2] <= -(12 * IN), 'top overhangs the back for seats');
  assert.ok(d.parts.some((x) => x.id === 'back-panel' && x.band));
  assert.throws(() => plan({ project: 'island', wallLength: 100 * IN }), /room to walk round/);
});

for (const wall of [120, 132, 150, 180, 240]) {
  test(`island on a ${wall}" kitchen wall: valid job, clean joinery`, () => {
    const p = plan({ project: 'island', wallLength: wall * IN });
    const d = designRun(p.spec, cat);
    assert.ok(!d.warnings.length, d.warnings.join(' | '));
    assert.ok(Math.abs(d.overall.width - p.width) < 0.5);
    buildJob(d, cat, { units: 'in', toolDia: 6.35 });
    assert.deepEqual(collisions(d), []);
  });
}

test('an island ignores doors in the counter wall (it stands out in the room)', () => {
  const p = plan({ project: 'island', wallLength: 160 * IN, obstacles: [{ kind: 'door', x0: 60 * IN, x1: 92 * IN }] });
  assert.equal(Math.round(p.width / IN), 84);
});
