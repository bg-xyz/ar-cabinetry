// Fuzz the planner + engine: random walls, obstacles, ceilings, styles and grain settings through every
// build. Every plan must either refuse cleanly (a "wide enough" style message) or design, cut, nest and
// assemble without warnings or collisions. Not part of `npm test` (slow); run: node test/fuzz.ts [runs] [seed]
import { loadCatalog } from '../src/load.ts';
import { designRun } from '../src/run.ts';
import { buildJob } from '../src/job.ts';
import { plan, PROJECTS } from '../src/planner.ts';
import type { Obstacle, PlanInput } from '../src/planner.ts';
import { collisions } from './geometry.ts';

const IN = 25.4;
const cat = loadCatalog();
const runs = Number(process.argv[2] ?? 2000);
let seed = Number(process.argv[3] ?? 7);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);

const presets = ['classic-euro', 'ply-inset', 'recessed-inset', 'milan-flush'];
const grains = ['across', 'waterfall', 'off'] as const;
const finishes = Object.keys(cat.finishes);
const legs = Object.keys(cat.legs);
const refusal = /wide enough|needs about|room to walk round/;

const failures = new Map<string, { n: number; example: string }>();
const fail = (kind: string, input: PlanInput, detail: string) => {
  const f = failures.get(kind) ?? { n: 0, example: '' };
  f.n++;
  if (!f.example) f.example = `${detail}\n    input: ${JSON.stringify(input)}`;
  failures.set(kind, f);
};

let ok = 0, refused = 0;
const reasons = new Map<string, number>();
for (let i = 0; i < runs; i++) {
  const wallLength = between(20, 240) * IN;
  const obstacles: Obstacle[] = [];
  for (let k = Math.floor(rnd() * 4); k > 0; k--) {
    const kind = pick(['door', 'opening', 'window', 'toilet', 'tub', 'sink', 'storage', 'other'] as const);
    const w = kind === 'tub' ? 60 * IN : kind === 'toilet' ? 20 * IN : between(18, 48) * IN;
    const x0 = between(-10, wallLength / IN) * IN;
    obstacles.push({ kind, x0, x1: x0 + w, ...(kind === 'window' && rnd() < 0.7 ? { bottom: between(12, 60) * IN } : {}) });
  }
  const input: PlanInput = {
    project: pick(PROJECTS),
    wallLength,
    wallHeight: rnd() < 0.8 ? between(84, 130) * IN : undefined,
    obstacles,
    sinkAt: rnd() < 0.4 ? between(0, wallLength / IN) * IN : undefined,
    width: rnd() < 0.2 ? between(24, 110) * IN : undefined,
    style: { preset: pick(presets), grainMatch: pick(grains), frontFinish: pick(finishes), carcassFinish: pick(finishes), topFinish: pick(finishes), leg: pick(legs) },
  };
  let p;
  try { p = plan(input); } catch (e) {
    const m = (e as Error).message;
    if (refusal.test(m)) { refused++; const k = `${input.project}: ${m.replace(/\d+"/g, 'N"').slice(0, 70)}`; reasons.set(k, (reasons.get(k) ?? 0) + 1); } else fail(`plan threw: ${m.slice(0, 60)}`, input, m);
    continue;
  }
  try {
    if (p.x0 < -1 || p.x0 + p.width > wallLength + 40) fail('placed off the wall', input, `x0 ${p.x0} width ${p.width} wall ${wallLength}`);
    const d = designRun(p.spec, cat);
    if (d.warnings.length) fail(`warning: ${d.warnings[0].replace(/[A-Z]-?\d*:? ?/, '').slice(0, 60)}`, input, d.warnings.join(' | '));
    buildJob(d, cat, { units: 'in', toolDia: 6.35 });
    const c = collisions(d);
    if (c.length) fail(`collision: ${c[0].replace(/ at .*/, '').replace(/^[A-Z]-/, '').replace(/ x [A-Z]-/, ' x ')}`, input, c[0]);
    ok++;
  } catch (e) {
    fail(`design threw: ${(e as Error).message.replace(/[\d.]+ x [\d.]+/, 'N x N').slice(0, 70)}`, input, (e as Error).message);
  }
}
console.log(`${runs} random plans: ${ok} built clean, ${refused} refused cleanly, ${runs - ok - refused} problems`);
for (const [k, n] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  refused ${n} x ${k}`);
for (const [k, v] of [...failures].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${v.n} x ${k}\n    ${v.example.split('\n').join('\n    ')}`);
process.exit(failures.size ? 1 : 0);
