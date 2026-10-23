// Entry point for the phone (JavaScriptCore) and the web: the whole engine in one file, catalog
// included, no file access. Built by `npm run bundle` into app/Resources/plywise-engine.js.
//
//   Plywise.plan(json)   -> { plan, model }   PlanInput in (a measured wall), 3D model + where it goes out
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
import { planVanity } from './planner.ts';
import type { Catalog, RunSpec } from './types.ts';
import type { PlanInput } from './planner.ts';

const cat = { materials, hinges, runners, pulls, sinks, faucets, finishes } as unknown as Catalog;

function model(spec: RunSpec) {
  const d = designRun(spec, cat);
  return { ...model3d(d, cat), finishes: cat.finishes, warnings: d.warnings };
}

function guard(fn: () => unknown): string {
  try { return JSON.stringify(fn()); } catch (e) { return JSON.stringify({ error: e instanceof Error ? e.message : String(e) }); }
}

export const Plywise = {
  version: '0.2.0',
  design: (json: string) => guard(() => model(JSON.parse(json) as RunSpec)),
  plan: (json: string) => guard(() => {
    const p = planVanity(JSON.parse(json) as PlanInput);
    return { plan: { x0: p.x0, width: p.width, sinks: p.sinks, span: p.span, spans: p.spans, notes: p.notes, name: p.spec.name }, model: model(p.spec) };
  }),
};

(globalThis as unknown as { Plywise: typeof Plywise }).Plywise = Plywise;
