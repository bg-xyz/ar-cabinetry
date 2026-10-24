// The planner: turns a measured wall into a design without the user having to know cabinet sizes.
// Input is what the room scan knows about one wall (its length, height and what's along it) and
// what the user is building; output is a run spec the engine builds, plus where it goes and why.
//
// Rules, all in mm along the wall, measured from its left end as you face it:
//   - doors and openings block their width + 2" each side
//   - a toilet blocks 15" each side of its centre line (the code minimum to a vanity side)
//   - tubs, showers and other fixed objects block their own footprint; furniture doesn't (it moves)
//   - a window blocks when its sill is lower than the top of what we're building (a bookcase always;
//     a vanity, console or dresser sits under it). No sill height from the scan: low builds go under.
//   - vanity: pick the stretch that holds the existing sink (that's where the plumbing is), else the
//     widest; largest standard width that fits with 1/2" to spare each side; 60"+ gets two sinks
//   - bookcase: fills the widest clear stretch wall to wall, as tall as the ceiling allows
//   - console, dresser: largest standard width that fits, centred in the widest stretch

import type { CabinetSpec, RunSpec, Style, Zone } from './types.ts';

const IN = 25.4;
export const STANDARD_WIDTHS = [24, 30, 36, 42, 48, 54, 60, 66, 72, 84].map((w) => w * IN);
export const DOUBLE_SINK_MIN = 60 * IN;
const TOILET_CLEAR = 15 * IN;
const DOOR_CLEAR = 2 * IN;
const EDGE = 0.5 * IN;
const HEIGHT = 20 * IN, DEPTH = 20 * IN;
const T = 18; // carcass board (bb18): end panels add this each side

export type Project = 'vanity' | 'bookcase' | 'console' | 'dresser' | 'island';
export const PROJECTS: Project[] = ['vanity', 'bookcase', 'console', 'dresser', 'island'];

export type ObstacleKind = 'door' | 'opening' | 'window' | 'toilet' | 'tub' | 'sink' | 'storage' | 'other';
export interface Obstacle {
  kind: ObstacleKind;
  x0: number;
  x1: number;
  bottom?: number;          // windows: sill height above the floor, when the scan knows it
}

export interface PlanInput {
  project?: Project;        // default vanity
  wallLength: number;
  wallHeight?: number;      // floor to ceiling; bookcases go up to it
  obstacles?: Obstacle[];
  sinkAt?: number;          // centre of the existing sink, if the scan found one
  width?: number;           // force a width instead of the best fit
  style?: Partial<Style> & { preset?: string };
  mounting?: RunSpec['mounting'];
}

export interface Plan {
  project: Project;
  spec: RunSpec;
  x0: number;               // left edge of the cabinets along the wall (end panels sit outside it)
  width: number;            // overall, end panels included
  sinks: number;
  span: [number, number];   // the clear stretch it was fitted into
  spans: [number, number][];
  widthOptions: number[];   // other widths that fit here (the app's Width menu)
  notes: string[];
  // islands stand out in the room: their fronts face the wall (the counters) this far from it
  standoff?: number;
  faceWall?: boolean;
}

const inches = (mm: number) => `${Math.round(mm / IN)}"`;

// A countertop comes off one 8' sheet (2440mm less margins): a longer run needs a joined or stone top.
const MAX_TOP = 2400;
function capToSheet(width: number, notes: string[]): number {
  if (width <= MAX_TOP) return width;
  notes.push(`The top is cut from one 8' sheet, so this tops out at ${inches(MAX_TOP)}; longer needs a joined or stone top.`);
  return MAX_TOP;
}
const feetInches = (mm: number) => { const i = Math.round(mm / IN); return `${Math.floor(i / 12)}' ${i % 12}"`; };

/** Clear stretches of the wall, after taking out everything the build can't overlap. */
export function freeSpans(wallLength: number, obstacles: Obstacle[] = [], topHeight = 0, lowWindows = false): [number, number][] {
  const blocked: [number, number][] = [];
  for (const o of obstacles) {
    const lo = Math.min(o.x0, o.x1), hi = Math.max(o.x0, o.x1), c = (lo + hi) / 2;
    if (o.kind === 'door' || o.kind === 'opening') blocked.push([lo - DOOR_CLEAR, hi + DOOR_CLEAR]);
    else if (o.kind === 'toilet') blocked.push([Math.min(lo, c - TOILET_CLEAR), Math.max(hi, c + TOILET_CLEAR)]);
    else if (o.kind === 'tub' || o.kind === 'storage' || o.kind === 'other') blocked.push([lo, hi]);
    else if (o.kind === 'window' && (o.bottom !== undefined ? o.bottom < topHeight + IN : lowWindows)) blocked.push([lo, hi]);
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

/** Plan whatever the user is building for this wall. */
export function plan(input: PlanInput): Plan {
  const project = input.project ?? 'vanity';
  if (!PROJECTS.includes(project)) throw new Error(`Unknown project "${project}". Known: ${PROJECTS.join(', ')}`);
  return project === 'vanity' ? planVanity(input) : project === 'bookcase' ? planBookcase(input)
    : project === 'island' ? planIsland(input) : planFurniture(input, project);
}

function noRoom(spans: [number, number][], what: string, need: number): never {
  const widest = spans.reduce((m, [a, b]) => Math.max(m, b - a), 0);
  throw new Error(`No clear stretch of this wall is wide enough for a ${what}: the widest is ${inches(widest)}, and a ${what} needs ${inches(need)}.`);
}

const widest = (spans: [number, number][]) => spans.reduce((m, s) => (s[1] - s[0] > m[1] - m[0] ? s : m));

function obstacleNotes(input: PlanInput, topHeight: number, notes: string[]) {
  if (input.obstacles?.some((o) => o.kind === 'toilet')) notes.push('Kept 15" clear of the toilet centre line.');
  if (input.obstacles?.some((o) => o.kind === 'door' || o.kind === 'opening')) notes.push('Kept 2" clear of door trim.');
  const windows = input.obstacles?.filter((o) => o.kind === 'window') ?? [];
  if (windows.some((o) => o.bottom !== undefined ? o.bottom < topHeight + IN : topHeight > 60 * IN)) notes.push('Kept clear of the window.');
}

export function planVanity(input: PlanInput): Plan {
  const L = input.wallLength;
  const spans = freeSpans(L, input.obstacles, 33 * IN, false);
  const fits = spans.filter(([a, b]) => b - a - 2 * EDGE >= STANDARD_WIDTHS[0]);
  if (!fits.length) noRoom(spans, 'vanity', STANDARD_WIDTHS[0] + 2 * EDGE);
  const sinkAt = input.sinkAt;
  const holdsSink = sinkAt !== undefined ? fits.find(([a, b]) => sinkAt >= a && sinkAt <= b) : undefined;
  const span = holdsSink ?? widest(fits);
  const avail = span[1] - span[0] - 2 * EDGE;

  const notes: string[] = [];
  const widthOptions = STANDARD_WIDTHS.filter((w) => w <= avail + 0.01);
  let width = widthOptions[widthOptions.length - 1];
  if (input.width) {
    width = Math.min(input.width, avail);
    if (input.width > avail + 0.01) notes.push(`${inches(input.width)} doesn't fit here; using ${inches(width)}.`);
  }
  width = capToSheet(width, notes);
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
  obstacleNotes(input, 33 * IN, notes);
  if (holdsSink && sinks === 2) notes.push('Two sinks means a second drain: the plumber adds a branch.');

  const { cabinets, sinkCabinets } = vanityLayout(width);
  const spec: RunSpec = {
    name: `${Math.round(width / IN)}" ${sinks === 2 ? 'double' : 'single'} vanity`,
    units: 'mm',
    style: { preset: 'classic-euro', grainMatch: 'across', ...input.style },
    mounting: input.mounting ?? 'wall-hung',
    elevation: 10.25 * IN,
    cabinets,
    top: { material: 'bb18', overhangSides: 0, overhangFront: 0.5 * IN },
    sinks: sinkCabinets.map((c) => ({ cabinet: c, sink: 'vessel-round-16', faucet: 'vessel-single-hole' })),
  };
  return { project: 'vanity', spec, x0, width, sinks, span, spans, widthOptions, notes };
}

// ---- built-in bookcase -----------------------------------------------------------------------
// Floor to (nearly) ceiling on a toe-kick: closed doors at the bottom, open adjustable shelves
// above, boxes no wider than 36" so shelves don't sag, end panels both sides for the built-in look.

const KICK = 4 * IN;
const CASE_DEPTH = 14 * IN;
const MAX_TALL = 2400;       // end panels (carcass + kick) come off a 2440mm long sheet, less margins
const CEILING_GAP = 1.5 * IN; // scribe strip at the ceiling, and room to tip the boxes up
const BASE_DOORS = 30 * IN;
const MAX_BAY = 36 * IN;

/** Carcass height for this ceiling: as tall as fits, short enough to stand up in the room. */
export function bookcaseHeight(wallHeight = 96 * IN): number {
  const room = wallHeight - KICK;
  let h = Math.min(MAX_TALL - KICK, room - CEILING_GAP);
  // a box is tipped up on its back edge: its diagonal has to clear the ceiling
  while (h > 60 * IN && Math.hypot(h, CASE_DEPTH) > room - 6) h -= 5;
  return Math.max(Math.round(h), Math.round(48 * IN));
}

function bays(total: number, maxBay: number): number[] {
  const n = Math.max(1, Math.ceil(total / maxBay - 0.001));
  return Array.from({ length: n }, () => total / n);
}

export function planBookcase(input: PlanInput): Plan {
  const L = input.wallLength;
  const H = bookcaseHeight(input.wallHeight);
  const topHeight = KICK + H;
  const spans = freeSpans(L, input.obstacles, topHeight, true);
  const minW = 18 * IN + 2 * T + 2 * EDGE;
  const fits = spans.filter(([a, b]) => b - a >= minW);
  if (!fits.length) noRoom(spans, 'bookcase', minW);
  const span = widest(fits);
  const avail = span[1] - span[0] - 2 * EDGE;

  const notes: string[] = [];
  const widthOptions = [36, 48, 60, 72, 84, 96, 108, 120].map((w) => w * IN).filter((w) => w < avail - 0.5 * IN);
  let width = avail;
  if (input.width) {
    width = Math.min(input.width, avail);
    if (input.width > avail + 0.01) notes.push(`${inches(input.width)} doesn't fit here; using ${inches(width)}.`);
  }
  const caseW = Math.floor(width - 2 * T);
  width = caseW + 2 * T;
  const widths = bays(caseW, MAX_BAY);
  const openH = H - BASE_DOORS;
  const shelves = Math.max(1, Math.round(openH / (13 * IN)) - 1);
  const cabinets: CabinetSpec[] = widths.map((w, i) => ({
    id: String.fromCharCode(65 + i), width: w, height: H, depth: CASE_DEPTH,
    zones: [
      { type: 'doors', size: BASE_DOORS, ...(w >= 24 * IN ? { count: 2 } : { count: 1, hinge: i < widths.length / 2 ? 'left' : 'right' }), shelves: 1 } as Zone,
      { type: 'open', size: 'fill', shelves },
    ],
  }));

  const x0 = span[0] + (span[1] - span[0] - width) / 2 + T;
  notes.unshift(input.width
    ? `A ${inches(width)} bookcase, centred in ${inches(span[1] - span[0])} of clear wall.`
    : `Fills ${inches(width)} of wall, ${widths.length} bay${widths.length > 1 ? 's' : ''} of ${inches(widths[0])}, ${feetInches(topHeight)} tall.`);
  const gap = (input.wallHeight ?? 96 * IN) - topHeight;
  notes.push(!input.wallHeight ? 'Sized for an 8\' ceiling.'
    : gap > 3 * IN ? `Tops out at ${feetInches(topHeight)} (the longest plywood sheet); a trim board fills up to your ${feetInches(input.wallHeight)} ceiling.`
    : `Stops ${inches(gap)} below your ${feetInches(input.wallHeight)} ceiling: room to stand it up, plus a scribe strip.`);
  obstacleNotes(input, topHeight, notes);

  const spec: RunSpec = {
    name: `${Math.round(width / IN)}" built-in bookcase`,
    units: 'mm',
    style: { preset: 'classic-euro', grainMatch: 'waterfall', ...input.style }, // tall built-ins: vertical grain
    mounting: 'toe-kick',
    elevation: 0,
    kickHeight: KICK,
    endPanels: 'both',
    cabinets,
  };
  return { project: 'bookcase', spec, x0, width, sinks: 0, span, spans, widthOptions, notes };
}

// ---- console / sideboard and dresser ----------------------------------------------------------
// Low furniture on legs with a top. Console: bays of doors and drawers, doors at the ends.
// Dresser: all drawers, a shallow one on top.

const FURNITURE = {
  console: { name: 'media console', widths: [36, 48, 60, 72, 84], height: 20 * IN, depth: 17 * IN, legs: 6 * IN, bay: 24 * IN },
  dresser: { name: 'dresser', widths: [30, 36, 48, 60, 72], height: 27 * IN, depth: 19 * IN, legs: 5 * IN, bay: 30 * IN },
} as const;

function furnitureBays(project: 'console' | 'dresser', width: number): CabinetSpec[] {
  const f = FURNITURE[project];
  const n = Math.max(project === 'console' ? 2 : 1, Math.round(width / f.bay));
  const w = width / n;
  const drawers = (k: number): Zone[] => Array.from({ length: k }, () => ({ type: 'drawer', size: 'fill' }));
  return Array.from({ length: n }, (_, i): CabinetSpec => {
    let zones: Zone[];
    if (project === 'dresser') zones = [...drawers(3), { type: 'drawer', size: 5 * IN }];
    else if (n === 2) zones = i === 0 ? [{ type: 'doors', size: 'fill', count: 1, hinge: 'left', shelves: 1 }] : drawers(3);
    else zones = i === 0 || i === n - 1
      ? [{ type: 'doors', size: 'fill', count: w >= 24 * IN ? 2 : 1, hinge: i === 0 ? 'left' : 'right', shelves: 1 } as Zone]
      : drawers(3);
    return { id: String.fromCharCode(65 + i), width: w, height: f.height, depth: f.depth, zones };
  });
}

export function planFurniture(input: PlanInput, project: 'console' | 'dresser'): Plan {
  const f = FURNITURE[project];
  const L = input.wallLength;
  const topHeight = f.legs + f.height + T;
  const spans = freeSpans(L, input.obstacles, topHeight, false);
  const sizes = f.widths.map((w) => w * IN);
  const fits = spans.filter(([a, b]) => b - a - 2 * EDGE >= sizes[0]);
  if (!fits.length) noRoom(spans, f.name, sizes[0] + 2 * EDGE);
  const span = widest(fits);
  const avail = span[1] - span[0] - 2 * EDGE;

  const notes: string[] = [];
  const widthOptions = sizes.filter((w) => w <= avail + 0.01);
  let width = widthOptions[widthOptions.length - 1];
  if (input.width) {
    width = Math.min(input.width, avail);
    if (input.width > avail + 0.01) notes.push(`${inches(input.width)} doesn't fit here; using ${inches(width)}.`);
  }
  width = capToSheet(width, notes);
  const cabinets = furnitureBays(project, width);
  const x0 = span[0] + (span[1] - span[0] - width) / 2;
  notes.unshift(`${inches(span[1] - span[0])} clear here, so a ${inches(width)} ${f.name} fits, centred.`);
  if (project === 'console' && width >= 54 * IN) notes.push(`Takes a ${width >= 66 * IN ? 75 : 65}" TV on top.`);
  obstacleNotes(input, topHeight, notes);

  const spec: RunSpec = {
    name: `${Math.round(width / IN)}" ${f.name}`,
    units: 'mm',
    style: { preset: 'classic-euro', grainMatch: 'across', ...input.style },
    mounting: 'legs',
    elevation: f.legs,
    cabinets,
    top: { material: 'bb18', overhangSides: 0, overhangFront: 0 },
  };
  return { project, spec, x0, width, sinks: 0, span, spans, widthOptions, notes };
}

// ---- kitchen island ------------------------------------------------------------------------------
// Tap the wall your counters are on. The island stands 42" in front of 25" counters (the usual aisle),
// its drawers and doors facing them, finished all round: end panels, a finished back, a toe kick, and a
// 12" seating overhang on the room side. Sized to the clear wall less 36" to walk round each end.

const ISLAND_WIDTHS = [48, 60, 72, 84, 90].map((w) => w * IN); // the plywood top comes off an 8' sheet
const COUNTER_DEPTH = 25 * IN, AISLE = 42 * IN, WALK_ROUND = 36 * IN, SEAT = 24 * IN, SEAT_OVERHANG = 12 * IN;

export function planIsland(input: PlanInput): Plan {
  // the island stands out in the room, so doors and windows in the counter wall don't block it:
  // only the kitchen's length along that wall matters
  const span: [number, number] = [0, input.wallLength];
  const spans = [span];
  const avail = span[1] - span[0] - 2 * WALK_ROUND;
  const widthOptions = ISLAND_WIDTHS.filter((w) => w <= avail + 0.01);
  if (!widthOptions.length) throw new Error(`An island needs about ${inches(ISLAND_WIDTHS[0] + 2 * WALK_ROUND)} of kitchen along this wall (${inches(ISLAND_WIDTHS[0])} plus room to walk round it); this one has ${inches(span[1] - span[0])}.`);
  const notes: string[] = [];
  let width = widthOptions[widthOptions.length - 1];
  if (input.width) {
    width = Math.min(input.width, avail);
    if (input.width > avail + 0.01) notes.push(`${inches(input.width)} leaves no room to walk round it; using ${inches(width)}.`);
  }
  width = capToSheet(width, notes);
  const caseW = width - 2 * T;
  const n = Math.max(2, Math.round(caseW / (30 * IN)));
  const w = caseW / n;
  const drawers: Zone[] = [{ type: 'drawer', size: 'fill' }, { type: 'drawer', size: 'fill' }, { type: 'drawer', size: 6 * IN }];
  const cabinets: CabinetSpec[] = Array.from({ length: n }, (_, i) => ({
    id: String.fromCharCode(65 + i), width: w, height: 30.5 * IN, depth: 24 * IN,
    zones: i % 2 === 0 ? drawers : [{ type: 'doors', size: 'fill', ...(w >= 24 * IN ? { count: 2 } : { count: 1, hinge: i < n / 2 ? 'left' : 'right' }), shelves: 1 } as Zone],
  }));
  const seats = Math.floor(width / SEAT);
  notes.unshift(`A ${inches(width)} island: drawers and doors toward your counters, seats for ${seats} on the other side (12" overhang).`);
  notes.push(`Stands ${inches(AISLE)} in front of ${inches(COUNTER_DEPTH)} counters, with ${inches(WALK_ROUND)} to walk round each end.`);
  notes.push('Finished all round: end panels, a finished back and a toe kick. The plywood top can be a template for stone.');
  const spec: RunSpec = {
    name: `${Math.round(width / IN)}" kitchen island`,
    units: 'mm',
    style: { preset: 'classic-euro', grainMatch: 'across', ...input.style },
    mounting: 'toe-kick',
    elevation: 0,
    kickHeight: KICK,
    endPanels: 'both',
    finishedBack: true,
    cabinets,
    top: { material: 'bb18', overhangSides: 0, overhangFront: 0.5 * IN, overhangBack: SEAT_OVERHANG },
  };
  const x0 = span[0] + (span[1] - span[0] - width) / 2 + T;
  return { project: 'island', spec, x0, width, sinks: 0, span, spans, widthOptions, notes, standoff: COUNTER_DEPTH + AISLE, faceWall: true };
}
