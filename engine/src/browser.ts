// Entry point for the phone (JavaScriptCore) and the web: the whole engine in one file, catalog
// included, no file access. Built by `npm run bundle` into dist/plywise-engine.js (the share page and the apps load it).
//
//   Plywise.plan(json)   -> { plan, model }   PlanInput in (a measured wall + what's being built), 3D model + where it goes out
//   Plywise.design(json) -> model              any RunSpec -> 3D model
// Strings in and out, so Swift only deals with JSON. Errors come back as { error }.

import materials from '../catalog/materials.json' with { type: 'json' };
import hinges from '../catalog/hinges.json' with { type: 'json' };
import runners from '../catalog/runners.json' with { type: 'json' };
import pulls from '../catalog/pulls.json' with { type: 'json' };
import sinks from '../catalog/sinks.json' with { type: 'json' };
import faucets from '../catalog/faucets.json' with { type: 'json' };
import finishes from '../catalog/finishes.json' with { type: 'json' };
import legs from '../catalog/legs.json' with { type: 'json' };
import prices from '../catalog/prices.json' with { type: 'json' };
import { designRun } from './run.ts';
import { model3d } from './model3d.ts';
import { plan } from './planner.ts';
import { critique, proportionNote, RULES } from './critic.ts';
import { cutSheets } from './sheets.ts';
import type { Sheet } from './nest.ts';
import type { Catalog, Design, RunSpec } from './types.ts';
import type { PlanInput } from './planner.ts';

const cat = { materials, hinges, runners, pulls, sinks, faucets, finishes, legs } as unknown as Catalog;

// The model's veneer comes from where each part is cut on the sheet (true-to-life grain).
function model(spec: RunSpec) {
  const d = designRun(spec, cat);
  const sheets = cutSheets(d, cat, 6.35, [], true).sheets;
  const flags = critique(d);
  const proportion = { rhythm: d.style.rhythm ?? 'golden', checks: RULES.length, flags: flags.map((f) => f.message), note: proportionNote(d, flags) };
  return { ...model3d(d, cat, sheets), finishes: cat.finishes, warnings: d.warnings, sheetArea: sheetArea(sheets), cost: cost(d, sheets), proportion };
}

// What it costs in materials, from the same rough prices the job quote uses (catalog/prices.json).
type Prices = { materials: Record<string, { sheet: number; longSheet?: number }>; hardware: { match: string; each: number }[] };
function cost(d: Design, sheets: Sheet[]): { materials: number; hardware: number } {
  const pr = prices as unknown as Prices;
  let materials = 0;
  for (const s of sheets) {
    const m = cat.materials[s.material], p = pr.materials[s.material];
    const long = !!m?.longSheet && s.size[0] === m.longSheet[0] && s.size[1] === m.longSheet[1];
    materials += (long ? p?.longSheet : p?.sheet) ?? 0;
  }
  let hardware = 0;
  for (const h of d.hardware) hardware += (pr.hardware.find((x) => h.item.toLowerCase().includes(x.match.toLowerCase()))?.each ?? 0) * h.qty;
  return { materials, hardware };
}
const dollars = (n: number) => `$${(Math.round(n / 10) * 10).toLocaleString('en-US')}`;

// Sheets to buy, as plywood area in 4x8 sheet equivalents, for this design and with grain matching off.
const sheetArea = (sheets: { size: [number, number] }[]) => sheets.reduce((a, s) => a + s.size[0] * s.size[1], 0) / (2440 * 1220);
const area = (spec: RunSpec) => sheetArea(cutSheets(designRun(spec, cat), cat, 6.35, [], true).sheets);
function sheetNote(spec: RunSpec, sheets: number): { sheets: number; sheetsUnmatched: number; note: string } {
  const off = spec.style?.grainMatch === 'off' ? sheets : area({ ...spec, style: { ...spec.style, grainMatch: 'off' } });
  const f = (n: number) => n.toFixed(1);
  const note = spec.style?.grainMatch === 'off' ? `Grain matching off: about ${f(sheets)} sheets of plywood.`
    : off < sheets - 0.05 ? `Grain-matched fronts: about ${f(sheets)} sheets of plywood (${f(off)} with matching off).`
    : `Grain-matched fronts at no extra plywood: about ${f(sheets)} sheets.`;
  return { sheets, sheetsUnmatched: off, note };
}

function guard(fn: () => unknown): string {
  try { return JSON.stringify(fn()); } catch (e) { return JSON.stringify({ error: e instanceof Error ? e.message : String(e) }); }
}

export const Plywise = {
  version: '0.3.0',
  design: (json: string) => guard(() => model(JSON.parse(json) as RunSpec)),
  plan: (json: string) => guard(() => {
    const p = plan(JSON.parse(json) as PlanInput);
    const m = model(p.spec);
    const s = sheetNote(p.spec, m.sheetArea);
    const priceNote = `About ${dollars(m.cost.materials + m.cost.hardware)} in plywood and hardware (${dollars(m.cost.materials)} + ${dollars(m.cost.hardware)}); the shop's cutting and finishing are extra.`;
    return {
      plan: { project: p.project, x0: p.x0, width: p.width, sinks: p.sinks, span: p.span, spans: p.spans, widthOptions: p.widthOptions,
        standoff: p.standoff, faceWall: p.faceWall ?? false,
        notes: [p.notes[0], priceNote, m.proportion.note, ...p.notes.slice(1), s.note], name: p.spec.name, proportion: m.proportion.note,
        // the design itself, for share links (plywise.xyz/d/#...): numbers to 0.1mm keeps links short
        specJSON: JSON.stringify(p.spec, (_k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)), grainMatch: p.spec.style?.grainMatch ?? 'across', sheets: s.sheets, sheetsUnmatched: s.sheetsUnmatched },
      model: m,
    };
  }),
};

(globalThis as unknown as { Plywise: typeof Plywise }).Plywise = Plywise;
