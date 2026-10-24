// Fuzz the settings panel: random plans, then random tunes (height, depth, sections, fronts, drawers).
// Every tune must build (no throw, no runner warnings) and pass the design critic, or say why it can't.
//   node test/fuzz_tune.ts [count] [seed]

import { loadCatalog } from '../src/load.ts';
import { designRun } from '../src/run.ts';
import { critique } from '../src/critic.ts';
import { plan, PROJECTS } from '../src/planner.ts';
import { tuneRanges, tuneSpec, type Fronts, type Tune } from '../src/tune.ts';

const IN = 25.4;
const count = Number(process.argv[2] ?? 1500);
let seed = Number(process.argv[3] ?? 7);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const cat = loadCatalog();

let ok = 0, refused = 0, problems = 0;
const seen = new Map<string, number>();
for (let i = 0; i < count; i++) {
  const project = pick(PROJECTS);
  let p;
  try { p = plan({ project, wallLength: (60 + rnd() * 120) * IN, wallHeight: (90 + rnd() * 30) * IN, style: { preset: pick(['classic-euro', 'ply-inset', 'recessed-inset', 'milan-flush']) } }); }
  catch { refused++; continue; }
  const r = tuneRanges(p.spec, project, designRun(p.spec, cat));
  const t: Tune = {};
  if (rnd() < 0.6) t.height = r.height[0] + rnd() * (r.height[1] - r.height[0]);
  if (rnd() < 0.5) t.depth = r.depth[0] + rnd() * (r.depth[1] - r.depth[0]);
  if (r.sections && rnd() < 0.5) t.sections = r.sections[0] + Math.floor(rnd() * (r.sections[1] - r.sections[0] + 1));
  if (rnd() < 0.6) t.fronts = pick(r.fronts as Fronts[]);
  if (rnd() < 0.5) t.drawers = 1 + Math.floor(rnd() * 6);
  const out = tuneSpec(p.spec, project, t, cat);
  if (out.notes.some((n) => n.startsWith("Couldn't"))) { refused++; const k = `${project}: ${out.notes[0].slice(0, 90)}`; seen.set(k, (seen.get(k) ?? 0) + 1); continue; }
  const d = designRun(out.spec, cat);
  const bad = [...critique(d).map((f) => `${f.rule}: ${f.message.replace(/[\d.]+"/g, 'N"')}`), ...d.warnings.filter((w) => /runner|no room/.test(w))];
  if (bad.length) {
    problems++;
    const k = `${project}: ${bad[0].slice(0, 90)}`;
    if (!seen.has(k)) console.log(k, '\n   tune', JSON.stringify(t));
    seen.set(k, (seen.get(k) ?? 0) + 1);
  } else ok++;
}
for (const [k, n] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n} x ${k}`);
console.log(`${count} tunes: ${ok} clean, ${refused} refused, ${problems} with critic flags`);
process.exit(problems ? 1 : 0);
