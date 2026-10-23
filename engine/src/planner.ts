// The planner: turns a measured wall into a design without the user having to know cabinet sizes.
// Input is what the room scan knows about one wall (its length and what's along it); output is a
// run spec the engine builds, plus where it goes on the wall and why.
//
// Rules (bathroom vanity), all in mm along the wall, measured from its left end as you face it:
//   - doors and openings block their width + 2" each side
//   - a toilet blocks 15" each side of its centre line (the code minimum to a vanity side)
//   - tubs, showers and other fixed objects block their own footprint
//   - windows don't block (the vanity sits under them); the old sink doesn't block (it's being replaced)
//   - pick the clear stretch that holds the existing sink (that's where the plumbing is), else the widest
//   - use the largest standard width that fits with 1/2" to spare each side
//   - 60" and up gets two sinks (sink centres stay 30"+ apart); under 60" one sink

import type { CabinetSpec, RunSpec, Style } from './types.ts';

const IN = 25.4;
export const STANDARD_WIDTHS = [24, 30, 36, 42, 48, 54, 60, 66, 72, 84].map((w) => w * IN);
export const DOUBLE_SINK_MIN = 60 * IN;
const TOILET_CLEAR = 15 * IN;
const DOOR_CLEAR = 2 * IN;
const EDGE = 0.5 * IN;
const HEIGHT = 20 * IN, DEPTH = 20 * IN;

export type ObstacleKind = 'door' | 'opening' | 'window' | 'toilet' | 'tub' | 'sink' | 'storage' | 'other';
export interface Obstacle { kind: ObstacleKind; x0: number; x1: number }

export interface PlanInput {
  wallLength: number;
  obstacles?: Obstacle[];
  sinkAt?: number;          // centre of the existing sink, if the scan found one
  width?: number;           // force a width instead of the largest that fits
  style?: Partial<Style> & { preset?: string };
  mounting?: RunSpec['mounting'];
}

export interface Plan {
  spec: RunSpec;
  x0: number;               // left edge of the vanity along the wall
  width: number;
  sinks: number;
  span: [number, number];   // the clear stretch it was fitted into
  spans: [number, number][];
  notes: string[];
}

const inches = (mm: number) => `${Math.round(mm / IN)}"`;

/** Clear stretches of the wall, after taking out everything a vanity can't overlap. */
export function freeSpans(wallLength: number, obstacles: Obstacle[] = []): [number, number][] {
  const blocked: [number, number][] = [];
  for (const o of obstacles) {
    const lo = Math.min(o.x0, o.x1), hi = Math.max(o.x0, o.x1), c = (lo + hi) / 2;
    if (o.kind === 'door' || o.kind === 'opening') blocked.push([lo - DOOR_CLEAR, hi + DOOR_CLEAR]);
    else if (o.kind === 'toilet') blocked.push([Math.min(lo, c - TOILET_CLEAR), Math.max(hi, c + TOILET_CLEAR)]);
    else if (o.kind === 'tub' || o.kind === 'storage' || o.kind === 'other') blocked.push([lo, hi]);
  }
  blocked.sort((a, b) => a[0] - b[0]);
  const spans: [number, number][] = [];
  let x = 0;
  for (const [lo, hi] of blocked) {
    if (lo > x) spans.push([x, Math.min(lo, wallLength)]);
    x = Math.max(x, hi);
  }
  if (x < wallLength) spans.push([x, wallLength]);
  return spans.filter(([a, b]) => b - a > 1);
}

/** Cabinets for a vanity of this width: one sink cabinet, sink + drawer bank, or sink | bank | sink. */
export function vanityLayout(width: number): { cabinets: CabinetSpec[]; sinkCabinets: string[] } {
  const twoDrawers = [{ type: 'drawer' as const, size: 'fill' as const }, { type: 'drawer' as const, size: 'fill' as const }];
  const bankDrawers = [{ type: 'drawer' as const, size: 'fill' as const }, { type: 'drawer' as const, size: 'fill' as const }, { type: 'drawer' as const, size: 5 * IN }];
  const box = (id: string, w: number, zones: CabinetSpec['zones']): CabinetSpec => ({ id, width: w, height: HEIGHT, depth: DEPTH, zones });
  if (width < 42 * IN) return { cabinets: [box('A', width, twoDrawers)], sinkCabinets: ['A'] };
  if (width < DOUBLE_SINK_MIN) {
    const bank = 18 * IN;
    return { cabinets: [box('A', width - bank, twoDrawers), box('B', bank, bankDrawers)], sinkCabinets: ['A'] };
  }
  const bank = width >= 84 * IN ? 24 * IN : width >= 66 * IN ? 18 * IN : 12 * IN;
  const side = (width - bank) / 2;
  return { cabinets: [box('A', side, twoDrawers), box('B', bank, bankDrawers), box('C', side, twoDrawers)], sinkCabinets: ['A', 'C'] };
}

export function planVanity(input: PlanInput): Plan {
  const L = input.wallLength;
  const spans = freeSpans(L, input.obstacles);
  const fits = spans.filter(([a, b]) => b - a - 2 * EDGE >= STANDARD_WIDTHS[0]);
  if (!fits.length) {
    const widest = spans.reduce((m, [a, b]) => Math.max(m, b - a), 0);
    throw new Error(`No clear stretch of this wall is wide enough for a vanity: the widest is ${inches(widest)}, and a vanity needs 25".`);
  }
  const sinkAt = input.sinkAt;
  const holdsSink = sinkAt !== undefined ? fits.find(([a, b]) => sinkAt >= a && sinkAt <= b) : undefined;
  const span = holdsSink ?? fits.reduce((m, s) => (s[1] - s[0] > m[1] - m[0] ? s : m));
  const avail = span[1] - span[0] - 2 * EDGE;

  const notes: string[] = [];
  let width = [...STANDARD_WIDTHS].reverse().find((w) => w <= avail + 0.01) ?? STANDARD_WIDTHS[0];
  if (input.width) {
    width = Math.min(input.width, avail);
    if (input.width > avail) notes.push(`${inches(input.width)} doesn't fit here; using ${inches(width)}.`);
  }
  const sinks = width >= DOUBLE_SINK_MIN ? 2 : 1;

  // centre on the old sink when there is one (single sink), else centre in the clear stretch
  const lo = span[0] + EDGE, hi = span[1] - EDGE - width;
  const want = holdsSink && sinks === 1 ? sinkAt! - width / 2 : span[0] + (span[1] - span[0] - width) / 2;
  const x0 = Math.min(Math.max(want, lo), hi);

  notes.unshift(`${inches(span[1] - span[0])} clear here, so a ${inches(width)} ${sinks === 2 ? 'double' : 'single'} vanity fits` +
    (holdsSink ? (sinks === 1 ? ', centred on your existing sink.' : ' around your existing plumbing.') : '.'));
  if (holdsSink && sinks === 1 && Math.abs(x0 - want) > 0.5 * IN)
    notes.push(`Shifted ${inches(Math.abs(x0 - want))} off the old drain to fit; the plumber moves the drain to match.`);
  if (sinks === 1 && width >= 54 * IN) notes.push('A double vanity needs 60" of clear wall.');
  if (input.obstacles?.some((o) => o.kind === 'toilet')) notes.push('Kept 15" clear of the toilet centre line.');
  if (holdsSink && sinks === 2) notes.push('Two sinks means a second drain: the plumber adds a branch.');

  const { cabinets, sinkCabinets } = vanityLayout(width);
  const spec: RunSpec = {
    name: `${Math.round(width / IN)}" ${sinks === 2 ? 'double' : 'single'} vanity`,
    units: 'mm',
    style: input.style ?? { preset: 'classic-euro' },
    mounting: input.mounting ?? 'wall-hung',
    elevation: 10.25 * IN,
    cabinets,
    top: { material: 'bb18', overhangSides: 0, overhangFront: 0.5 * IN },
    sinks: sinkCabinets.map((c) => ({ cabinet: c, sink: 'vessel-round-16', faucet: 'vessel-single-hole' })),
  };
  return { spec, x0, width, sinks, span, spans, notes };
}
