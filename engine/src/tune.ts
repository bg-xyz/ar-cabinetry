// Tune: the settings panel. Exact overall height and depth (width goes through the planner, which
// knows the clear wall), how many sections across, what the fronts are, drawers per stack. The planner's
// design is the starting point; every change stays inside what the engine builds well, and anything it
// had to adjust comes back as a note ("5 drawers fit at this height").

import { designRun } from './run.ts';
import { critique } from './critic.ts';
import { GOLDEN_MINOR, PHI, graduate } from './proportion.ts';
import type { Catalog, CabinetSpec, Design, RunSpec, Zone } from './types.ts';
import type { Project } from './planner.ts';

const IN = 25.4;
export type Fronts = 'drawers' | 'doors' | 'open' | 'mixed';

export interface Tune {
  height?: number;     // overall, floor to the top, mm
  depth?: number;      // overall, wall to the front, mm
  sections?: number;   // boxes across
  fronts?: Fronts;
  drawers?: number;    // per stack
}

export interface TuneRanges {
  height: [number, number];
  depth: [number, number];
  sections: [number, number] | null;   // null: the build fixes it (sinks, knee spaces)
  fronts: Fronts[];
  drawers: [number, number];
  current: { width: number; height: number; depth: number; sections: number; fronts: Fronts; drawers: number };
  /** heights where width : height is phi, phi squared or 1 : phi (within range): the classic proportions */
  golden: number[];
}

const LIMITS: Record<Project, { height: [number, number]; depth: [number, number]; sections: boolean; fronts: Fronts[] }> = {
  vanity: { height: [28, 38], depth: [16, 24], sections: false, fronts: ['drawers', 'doors', 'mixed'] },
  console: { height: [16, 34], depth: [13, 22], sections: true, fronts: ['drawers', 'doors', 'open', 'mixed'] },
  dresser: { height: [24, 56], depth: [15, 24], sections: true, fronts: ['drawers', 'mixed'] },
  bookcase: { height: [36, 96], depth: [10, 18], sections: true, fronts: ['doors', 'drawers', 'open'] },
  desk: { height: [28, 31], depth: [18, 30], sections: false, fronts: ['drawers', 'doors'] },
  bar: { height: [34, 42], depth: [16, 25], sections: true, fronts: ['drawers', 'doors', 'mixed'] },
  island: { height: [34, 38], depth: [30, 48], sections: false, fronts: ['drawers', 'doors', 'mixed'] },
};
const MAX_BOX = { bookcase: 36 * IN, other: 48 * IN }, MIN_BOX = 12 * IN;

const boxes = (s: RunSpec) => s.cabinets.filter((c) => !c.knee);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const inch = (mm: number) => `${Math.round(mm / IN * 4) / 4}"`;
const top = (d: Design) => d.overall.height + d.overall.elevation;

/** What a cabinet's fronts are, read back from its zones (a bookcase: its closed base). */
function frontsOf(c: CabinetSpec, project: Project): Fronts {
  const z = project === 'bookcase' ? (c.zones.length > 1 ? c.zones.slice(0, -1) : c.zones) : c.zones;
  const kinds = new Set(z.map((x) => x.type));
  if (kinds.size === 1) return kinds.has('drawer') ? 'drawers' : kinds.has('doors') ? 'doors' : 'open';
  return kinds.has('open') && !kinds.has('drawer') ? 'open' : 'mixed';
}
const drawersOf = (c: CabinetSpec) => c.zones.filter((z) => z.type === 'drawer').length;

/** The ranges and current values for the panel. */
export function tuneRanges(spec: RunSpec, project: Project, d: Design): TuneRanges {
  const L = LIMITS[project];
  let [hMin, hMax] = L.height.map((x) => x * IN) as [number, number];
  if (spec.walls?.ceiling) hMax = Math.min(hMax, spec.walls.ceiling - 1.5 * IN);
  if (project === 'bookcase') hMax = Math.min(hMax, 2400);
  const bx = boxes(spec);
  const total = bx.reduce((a, c) => a + c.width, 0);
  const lead = bx.find((c) => !(spec.sinks ?? []).some((s) => s.cabinet === c.id)) ?? bx[0];
  const sections: [number, number] | null = L.sections
    ? [Math.max(1, Math.ceil(total / (project === 'bookcase' ? MAX_BOX.bookcase : MAX_BOX.other) - 0.001)), Math.max(1, Math.floor(total / MIN_BOX))]
    : null;
  const w = d.overall.width;
  const golden = [w / PHI, w / (PHI * PHI), w * PHI].filter((h) => h >= hMin && h <= hMax).map((h) => Math.round(h / (IN / 4)) * (IN / 4));
  return {
    height: [hMin, Math.max(hMin, hMax)], depth: L.depth.map((x) => x * IN) as [number, number], sections, fronts: L.fronts, drawers: [1, 6],
    current: { width: w, height: top(d), depth: d.overall.depth, sections: bx.length, fronts: frontsOf(lead, project), drawers: Math.max(...bx.map(drawersOf)) },
    golden,
  };
}

/** Doors that suit this width: a pair from 24", else one leaf hinged toward the nearer end. */
function sizeDoors(zones: Zone[], w: number, i: number, n: number): Zone[] {
  return zones.map((z) => (z.type !== 'doors' ? z
    : w >= 24 * IN ? { ...z, count: 2 as const, hinge: undefined } : { ...z, count: 1 as const, hinge: i < n / 2 ? 'left' as const : 'right' as const }));
}

/** Open shelves for this height: none under 18", else about a foot apart, the largest gap (they graduate
 *  by the square root of phi) no more than 15". */
function shelvesFor(h: number): number {
  if (h < 18 * IN) return 0;
  let n = Math.max(1, Math.round(h / (13 * IN)) - 1);
  while (graduate(n + 1, h - 120, 0, Math.sqrt(PHI))[0] + 60 > 15 * IN) n++;
  return n;
}

/** New fronts for one box. */
function frontsFor(c: CabinetSpec, project: Project, fronts: Fronts, k: number, i: number, n: number): Zone[] {
  const drawers = (m: number): Zone[] => Array.from({ length: m }, () => ({ type: 'drawer', size: 'fill' }));
  if (project === 'bookcase') {
    // the closed base changes; the open shelving above stays
    const [base, ...rest] = c.zones;
    const baseH = typeof base.size === 'number' ? base.size : c.height * GOLDEN_MINOR;
    const above = rest.length ? rest : [{ type: 'open', size: 'fill', shelves: shelvesFor(c.height - baseH) } as Zone];
    if (fronts === 'open') return [{ type: 'open', size: 'fill', shelves: shelvesFor(c.height) }];
    if (fronts === 'drawers') return [...graduate(k, baseH - (k - 1) * 3).map((s): Zone => ({ type: 'drawer', size: Math.round(s) })), ...above];
    return sizeDoors([{ type: 'doors', size: baseH, count: 1, shelves: 1 }, ...above], c.width, i, n);
  }
  if (fronts === 'drawers') return drawers(k);
  if (fronts === 'open') return [{ type: 'open', size: 'fill', shelves: shelvesFor(c.height) }];
  if (fronts === 'doors') return sizeDoors([{ type: 'doors', size: 'fill', count: 1, shelves: c.height > 20 * IN ? 1 : 0 }], c.width, i, n);
  // mixed: drawers on top (a golden share of the height between them), doors below
  const top = Math.max(5 * IN, Math.min(8 * IN, c.height * 0.236));
  if (c.height - top < 10 * IN) return drawers(Math.min(k, 3));   // too low for doors under a drawer
  const m = Math.max(1, Math.min(k, 2, Math.floor((c.height - 10 * IN) / top)));
  return sizeDoors([{ type: 'doors', size: 'fill', count: 1, shelves: c.height > 24 * IN ? 1 : 0 },
    ...Array.from({ length: m }, (): Zone => ({ type: 'drawer', size: Math.round(top) }))], c.width, i, n);
}

type Working = Tune & { shelfBias?: number };

function apply(spec0: RunSpec, project: Project, t: Working, cat: Catalog, notes: string[]): RunSpec {
  const spec = clone(spec0);
  const L = LIMITS[project];
  const sinks = new Set((spec.sinks ?? []).map((s) => s.cabinet));

  // sections across: the same overall width in n equal boxes, keeping the build's pattern (ends like the
  // first box, every other one inside like the second)
  if (t.sections && L.sections) {
    const bx = boxes(spec);
    const total = bx.reduce((a, c) => a + c.width, 0);
    const lo = Math.max(1, Math.ceil(total / (project === 'bookcase' ? MAX_BOX.bookcase : MAX_BOX.other) - 0.001)), hi = Math.max(1, Math.floor(total / MIN_BOX));
    const n = clamp(Math.round(t.sections), lo, hi);
    if (n !== Math.round(t.sections)) notes.push(n < t.sections ? `${n} sections at most: a box narrower than 12" is all sides.` : `${n} sections at least: a box wider than ${project === 'bookcase' ? 36 : 48}" sags.`);
    if (n !== bx.length) {
      const w = total / n;
      spec.cabinets = Array.from({ length: n }, (_, i): CabinetSpec => {
        const fromEnd = Math.min(i, n - 1 - i);
        const src = bx.length > 1 && fromEnd % 2 === 1 ? bx[1] : bx[0];
        return { ...clone(src), id: String.fromCharCode(65 + i), width: w, zones: sizeDoors(clone(src.zones), w, i, n) };
      });
    }
  }

  // height and depth: measure, then move every box by the difference
  const d = designRun(spec, cat);
  if (t.height) {
    const r = tuneRanges(spec, project, d).height;
    const want = clamp(t.height, r[0], r[1]);
    if (Math.abs(want - t.height) > 1) notes.push(`${inch(want)} tall is as ${want < t.height ? 'tall' : 'low'} as a ${project} goes here.`);
    const delta = want - top(d);
    for (const c of spec.cabinets) {
      c.height += delta;
      // fixed bookcase bases scale with the height so the golden section holds
      if (project === 'bookcase' && typeof c.zones[0].size === 'number' && c.zones.length > 1) {
        const k = (c.height) / (c.height - delta);
        c.zones = c.zones.map((z) => (typeof z.size === 'number' ? { ...z, size: Math.round(z.size * k) } : z));
      }
    }
  }
  if (t.depth) {
    const [lo, hi] = L.depth.map((x) => x * IN);
    const want = clamp(t.depth, lo, hi);
    if (Math.abs(want - t.depth) > 1) notes.push(`${inch(want)} deep is the ${want < t.depth ? 'most' : 'least'} for a ${project}.`);
    const delta = want - d.overall.depth;
    for (const c of spec.cabinets) c.depth += delta;
  }

  // fronts and drawers per stack (after the height, so fixed drawers are sized for the box they're in)
  if (t.fronts || t.drawers) {
    const list = spec.cabinets;
    const n = list.filter((c) => !c.knee).length;
    let i = 0;
    for (const c of list) {
      if (c.knee) continue;
      const fronts = t.fronts && L.fronts.includes(t.fronts) ? t.fronts : frontsOf(c, project);
      const have = drawersOf(c);
      // a sink box keeps at most two drawers (they wrap the drain)
      const k = clamp(Math.round(t.drawers ?? (have || 3)), 1, sinks.has(c.id) ? 2 : 6);
      c.zones = frontsFor(c, project, fronts, k, i++, n);
    }
  }

  // open shelving re-spaced for the boxes as they now are
  for (const c of spec.cabinets) {
    const fills = c.zones.filter((z) => z.size === 'fill');
    if (fills.length !== 1 || fills[0].type !== 'open') continue;
    const fixed = c.zones.reduce((a, z) => a + (typeof z.size === 'number' ? z.size : 0), 0);
    const h = c.height - fixed;
    c.zones = c.zones.map((z) => (z.type === 'open' ? { ...z, shelves: Math.max(h < 18 * IN ? 0 : 1, shelvesFor(h) + (t.shelfBias ?? 0)) } : z));
  }
  return spec;
}

/** Applies a tune to a planned design. Repairs what it can (fewer drawers when they'd be slivers, more
 *  sections when fronts would sag, shelves re-spaced) and says what it changed. */
export function tuneSpec(spec0: RunSpec, project: Project, tune: Tune, cat: Catalog): { spec: RunSpec; notes: string[] } {
  const notes: string[] = [];
  const t: Working = { ...tune };
  const said: string[] = [];
  const maxSections = tuneRanges(spec0, project, designRun(spec0, cat)).sections?.[1] ?? 0;
  let spec = spec0;
  for (let attempt = 0; attempt < 12; attempt++) {
    notes.length = 0;
    try {
      spec = apply(spec0, project, t, cat, notes);
      const d = designRun(spec, cat);
      const flags = critique(d);
      const k = t.drawers ?? drawersMax(spec);
      const shallow = d.warnings.some((w) => /no room for a runner/.test(w));
      const sliver = flags.some((f) => /sliver/.test(f.message) || (f.rule === 'near-miss' && /drawers \d+ and/.test(f.message)));
      const sag = flags.some((f) => /sags/.test(f.message));
      const squat = flags.some((f) => /squat/.test(f.message));
      const shelves = flags.find((f) => f.rule === 'shelves');
      if (shallow) { t.depth = d.overall.depth + IN; said[0] = `Drawers need the depth: made it ${inch(t.depth)} deep.`; continue; }
      if (sliver && k > 1) { t.drawers = k - 1; said[1] = `${k - 1} drawer${k > 2 ? 's' : ''} fit well at this height.`; continue; }
      if (sag && LIMITS[project].sections && boxes(spec).length < maxSections) { t.sections = boxes(spec).length + 1; said[2] = `${t.sections} sections, so no front is wide enough to sag.`; continue; }
      if (squat) {
        if (t.fronts === 'mixed' && k > 1) { t.drawers = 1; continue; }
        if (LIMITS[project].sections && boxes(spec).length < maxSections) { t.sections = boxes(spec).length + 1; said[2] = `${t.sections} sections, so the doors aren't squat.`; continue; }
        if (t.fronts !== 'drawers') { t.fronts = 'drawers'; said[3] = 'Doors that low would be squat: drawers instead.'; continue; }
      }
      if (shelves && Math.abs(t.shelfBias ?? 0) < 3) {
        const gap = Number(/([\d.]+)" apart/.exec(shelves.message)?.[1] ?? 12);
        t.shelfBias = (t.shelfBias ?? 0) + (gap > 16 ? 1 : -1);
        continue;
      }
      break;
    } catch (e) {
      return { spec: spec0, notes: [`Couldn't build that: ${(e as Error).message}`] };
    }
  }
  return { spec, notes: [...notes, ...said.filter(Boolean)] };
}

const drawersMax = (s: RunSpec) => Math.max(1, ...boxes(s).map(drawersOf));
