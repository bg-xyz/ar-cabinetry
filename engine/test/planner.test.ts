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
  // wall to wall: the end panels at the walls give way to scribe fillers
  const fill = p.width + (p.spec.walls?.left ?? 0) + (p.spec.walls?.right ?? 0);
  assert.ok(Math.abs(fill - 130 * IN) < 1, `fills ${fill / IN}"`);
  assert.equal(p.spec.endPanels, 'none');
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
const projects: Project[] = ['vanity', 'bookcase', 'console', 'dresser', 'desk', 'bar'];
for (const project of projects) for (const wall of project === 'desk' ? [52, 66, 80, 100, 150] : [40, 52, 66, 80, 100, 150]) for (const ceiling of project === 'bookcase' ? [84, 96, 108] : [96]) {
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

// ---- fitting the room: scribe fillers, ceiling strip, screws only where they're hidden ----------

const cutSize = (p: ReturnType<typeof plan>, id: string) => {
  const j = buildJob(designRun(p.spec, cat), cat, { units: 'mm', toolDia: 6.35 });
  return j.flat.find((f) => f.id === id)!;
};

test('a vanity in an alcove gets scribe fillers both sides, and the top runs to the walls cut long', () => {
  const p = planVanity({ wallLength: 50 * IN });
  assert.equal(Math.round(p.width / IN), 48);
  assert.ok(Math.abs(p.spec.walls!.left! - IN) < 0.5 && Math.abs(p.spec.walls!.right! - IN) < 0.5, JSON.stringify(p.spec.walls));
  const d = designRun(p.spec, cat);
  const fl = d.parts.find((x) => x.id === 'filler-L')!, top = d.parts.find((x) => x.id === 'top')!;
  assert.ok(Math.abs(fl.box.size[0] - IN) < 0.5);
  assert.ok(Math.abs(top.box.size[0] - 50 * IN) < 0.5, `top ${top.box.size[0] / IN}"`); // wall to wall
  assert.equal(top.band?.edges, 'front');                                                 // scribed ends stay raw
  assert.ok(Math.abs(cutSize(p, 'top').length - (50 * IN + 2 * 19)) < 0.5);             // 3/4" to scribe each end
  assert.ok(Math.abs(cutSize(p, 'filler-L').width - (IN + 19)) < 0.5);
  assert.ok(d.parts.some((x) => x.id === 'filler-R-backer'));
  assert.ok(d.sides.every((s) => !s.finished), JSON.stringify(d.sides));                 // walls hide both ends
  assert.ok(d.hardware.some((h) => /filler backer/.test(h.item) && h.install));
  assert.deepEqual(collisions(d), []);
});

test('a vanity standing free on a long wall has finished ends: no screws through them', () => {
  const p = planVanity({ wallLength: 120 * IN, obstacles: [{ kind: 'door', x0: 0, x1: 30 * IN }, { kind: 'door', x0: 70 * IN, x1: 120 * IN }] });
  assert.equal(p.spec.walls, undefined);
  const d = designRun(p.spec, cat);
  const ends = d.sides.filter((s) => s.finished).map((s) => s.part);
  const last = p.spec.cabinets[p.spec.cabinets.length - 1].id;
  assert.deepEqual(ends.sort(), [`A-side-L`, `${last}-side-R`].sort());
  for (const id of ends) assert.ok(!d.parts.find((x) => x.id === id)!.ops.some((o) => o.note === 'confirmat'), id);
  assert.ok(d.hardware.some((h) => /Pocket screws/.test(h.item)));
  assert.ok(d.install.some((s) => /Finished sides .*no screws go through them/.test(s)));
  if (p.spec.cabinets.length > 1) assert.ok(d.parts.find((x) => x.id === 'A-side-R')!.ops.some((o) => o.note === 'confirmat'));
});

test('connector holes line up through neighbouring sides and stay off the runners', () => {
  const d = designRun(planVanity({ wallLength: 61 * IN }).spec, cat);
  const a = d.parts.find((x) => x.id === 'A-side-R')!, b = d.parts.find((x) => x.id === 'B-side-L')!;
  const holes = (p: typeof a) => p.ops.filter((o) => o.kind === 'hole' && o.note === 'cabinet connector') as Extract<typeof a.ops[number], { kind: 'hole' }>[];
  assert.ok(holes(a).length >= 3);
  assert.deepEqual(holes(a).map((h) => [h.at[1], h.at[2]]), holes(b).map((h) => [h.at[1], h.at[2]]));
  const runners = a.ops.filter((o) => o.kind === 'hole' && o.note === 'runner screw').map((o) => (o as { at: number[] }).at[1]);
  for (const h of holes(a)) assert.ok(runners.every((y) => Math.abs(y - h.at[1]) >= 25), `connector at y ${h.at[1]}`);
});

test('a built-in bookcase gets a ceiling scribe strip on a cleat, cut tall to scribe', () => {
  const p = plan({ project: 'bookcase', wallLength: 100 * IN, wallHeight: 96 * IN });
  const d = designRun(p.spec, cat);
  const strip = d.parts.find((x) => x.id === 'scribe-ceiling-1')!;
  assert.ok(strip && d.parts.some((x) => x.id === 'scribe-cleat-1'));
  const top = d.overall.height + d.overall.elevation;
  assert.ok(Math.abs(top + strip.box.size[1] - 96 * IN) < 0.5, 'reaches the ceiling');
  assert.ok(Math.abs(cutSize(p, 'scribe-ceiling-1').width - strip.box.size[1] - 19) < 0.5);
  assert.deepEqual(collisions(d), []);
  // a 12' ceiling is too far above for a strip
  assert.ok(!designRun(plan({ project: 'bookcase', wallLength: 100 * IN, wallHeight: 144 * IN }).spec, cat).parts.some((x) => x.id.startsWith('scribe-')));
});

test('furniture on legs comes with an anti-tip kit; islands fix to the floor; every island side is hidden', () => {
  assert.ok(designRun(plan({ project: 'dresser', wallLength: 80 * IN }).spec, cat).hardware.some((h) => /Anti-tip/.test(h.item) && h.install));
  const isl = designRun(plan({ project: 'island', wallLength: 180 * IN }).spec, cat);
  assert.ok(isl.sides.every((s) => !s.finished));
  assert.ok(isl.hardware.some((h) => /floor cleats/.test(h.item)));
});

test('a desk: file pedestals in the golden section, a 30"+ knee space carried on a desk rail and a wall cleat', () => {
  for (const [wall, peds] of [[50, 1], [62, 1], [74, 2], [100, 2]] as const) {
    const p = plan({ project: 'desk', wallLength: wall * IN });
    const knee = p.spec.cabinets.find((c) => c.knee)!;
    assert.equal(p.spec.cabinets.filter((c) => !c.knee).length, peds, `${wall}"`);
    assert.ok(knee.width >= 30 * IN - 0.5, `${wall}": knee ${knee.width / IN}"`);
    const d = designRun(p.spec, cat);
    assert.ok(d.parts.some((x) => x.id === `${knee.id}-desk-rail`) && d.parts.some((x) => x.id === `${knee.id}-wall-cleat`));
    assert.ok(!d.parts.some((x) => x.cabinet === knee.id && x.role === 'side'), 'no box in the knee space');
    const top = d.parts.find((x) => x.role === 'top')!;
    assert.ok(Math.abs(top.box.min[1] + top.box.size[1] + 4 * IN - 30 * IN) < 1, 'writing height 30"');
    // sides beside the knee show: no confirmats through them, and no connectors across the knee
    for (const s of d.sides.filter((x) => /side/.test(x.part))) {
      const i = p.spec.cabinets.findIndex((c) => s.part.startsWith(`${c.id}-`));
      const next = p.spec.cabinets[s.part.endsWith('-L') ? i - 1 : i + 1];
      if (next?.knee) assert.equal(s.finished, true, s.part);
    }
    assert.ok(!d.hardware.some((h) => /connector/.test(h.item)));
    assert.ok(d.install.some((x) => /Knee space/.test(x)));
    const flat = buildJob(d, cat, { units: 'in', toolDia: 6.35 });
    assert.ok(flat);
  }
  const one = plan({ project: 'desk', wallLength: 62 * IN }).spec.cabinets;
  assert.ok(Math.abs(one.find((c) => !c.knee)!.width / (one[0].width + one[1].width) - 0.382) < 0.02);
});

test('a coffee bar: 36" counter wall to wall, bays no wider than 36", mirrored', () => {
  const p = plan({ project: 'bar', wallLength: 88 * IN });
  const ws = p.spec.cabinets.map((c) => c.width);
  assert.ok(ws.every((w) => w <= 36 * IN + 0.5));
  const kinds = p.spec.cabinets.map((c) => c.zones[0].type);
  assert.deepEqual(kinds, [...kinds].reverse());
  assert.ok(p.spec.walls?.left !== undefined && p.spec.walls?.right !== undefined, 'fillers at both walls');
  const d = designRun(p.spec, cat);
  const top = d.parts.find((x) => x.role === 'top')!;
  assert.ok(Math.abs(top.box.min[1] + top.box.size[1] + 4 * IN - 36 * IN) < 1, 'counter height 36"');
  assert.ok(top.box.size[0] <= 2400 + 0.5);
  // a long wall: stops short of the walls, end panels both ends
  const long = plan({ project: 'bar', wallLength: 150 * IN });
  assert.equal(long.spec.endPanels, 'both');
  assert.ok(!long.spec.walls);
});
