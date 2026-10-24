// Entry point for the phone (JavaScriptCore) and the web: the whole engine in one file, catalog
// included, no file access. Built by `npm run bundle` into app/Resources/plywise-engine.js.
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
import { designRun } from './run.ts';
import { model3d } from './model3d.ts';
import { plan } from './planner.ts';
import { cutSheets } from './sheets.ts';
import type { Catalog, RunSpec } from './types.ts';
import type { PlanInput } from './planner.ts';

const cat = { materials, hinges, runners, pulls, sinks, faucets, finishes } as unknown as Catalog;

function model(spec: RunSpec) {
  const d = designRun(spec, cat);
  return { ...model3d(d, cat), finishes: cat.finishes, warnings: d.warnings };
}

// Sheets to buy, as plywood area in 4x8 sheet equivalents, for this design and with grain matching off.
const area = (spec: RunSpec) => cutSheets(designRun(spec, cat), cat, 6.35, [], true).sheets.reduce((a, s) => a + s.size[0] * s.size[1], 0) / (2440 * 1220);
function sheetNote(spec: RunSpec): { sheets: number; sheetsUnmatched: number; note: string } {
  const sheets = area(spec);
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
    const s = sheetNote(p.spec);
    return {
      plan: { project: p.project, x0: p.x0, width: p.width, sinks: p.sinks, span: p.span, spans: p.spans, widthOptions: p.widthOptions,
        notes: [...p.notes, s.note], name: p.spec.name, grainMatch: p.spec.style?.grainMatch ?? 'across', sheets: s.sheets, sheetsUnmatched: s.sheetsUnmatched },
      model: model(p.spec),
    };
  }),
};

(globalThis as unknown as { Plywise: typeof Plywise }).Plywise = Plywise;
