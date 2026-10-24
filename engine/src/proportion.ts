// Proportion: how the fronts of a stack and the boxes of a run are sized so the piece just looks right.
//
// The golden ratio (phi = 1.618) is the rule we use, the same proportion furniture makers have
// graduated drawers by for centuries:
//   - a stack of drawers steps up from top to bottom by one constant ratio, and the bottom drawer is
//     always phi times the top one, however many drawers there are (2 drawers: one step of phi;
//     3: two steps of 1.272; 4: three of 1.174). Every drawer relates to the one above it the same way.
//   - across a run, the top drawer line lines up: every drawer stack of the same height shares the top
//     drawer's height, and the drawers below it graduate in the space that's left. The eye follows one
//     unbroken line along the piece, and the pulls (which sit near the top of each front) line up too.
//   - a drawer bank beside a sink cabinet, or the closed base of a bookcase, takes the golden section
//     (0.382) of the whole.
// style.rhythm = 'even' turns graduation off (all 'fill' drawers equal), for people who want that.

import type { CabinetSpec, Pull, Style, Zone } from './types.ts';

export const PHI = (1 + Math.sqrt(5)) / 2;
/** The smaller part of a golden section: a : b = b : (a + b) when a = 0.382 of the whole. */
export const GOLDEN_MINOR = 1 / (PHI * PHI);
/** The smallest front a graduated stack makes on top: below this a drawer box gets too shallow to use. */
export const MIN_TOP_FRONT = 4.5 * 25.4;

/** Height of a front stack's region (fronts plus the gaps between them, inside the reveals). */
export function frontRegion(H: number, style: Style, t: number): number {
  return style.mount === 'inset' ? H - 2 * t - 2 * style.gap : H - style.topReveal - style.bottomReveal;
}

/** n heights bottom to top that add up to total, each the one above it times one ratio, bottom = phi x top.
 *  The spread eases off when the top front would come out shallower than minTop. */
export function graduate(n: number, total: number, minTop = MIN_TOP_FRONT): number[] {
  if (n <= 1) return [total];
  for (let spread = 1; spread >= 0; spread -= 0.05) {
    const r = Math.pow(PHI, Math.max(spread, 0) / (n - 1));
    const w = Array.from({ length: n }, (_, i) => Math.pow(r, n - 1 - i)); // bottom first
    const sum = w.reduce((a, b) => a + b, 0);
    const hs = w.map((x) => (x / sum) * total);
    if (hs[n - 1] >= minTop || spread <= 0) return hs;
  }
  return Array.from({ length: n }, () => total / n);
}

const pureDrawers = (zones: Zone[]) => zones.length >= 2 && zones.every((z) => z.type === 'drawer' && z.size === 'fill');

/** Fixes the drawer heights of every all-drawer cabinet in a run so their top drawer lines line up.
 *  The cabinet with the most drawers leads; the others share its top drawer and graduate below it
 *  (or split the rest evenly, when the rhythm is even). */
export function alignRun(cabinets: CabinetSpec[], style: Style, t: number): CabinetSpec[] {
  const split = (n: number, total: number, minTop?: number) =>
    (style.rhythm ?? 'golden') === 'golden' ? graduate(n, total, minTop) : Array.from({ length: n }, () => total / n);
  const out = cabinets.map((c) => ({ ...c, zones: [...c.zones] }));
  const groups = new Map<number, CabinetSpec[]>();
  for (const c of out) if (pureDrawers(c.zones)) {
    const k = Math.round(c.height);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const group of groups.values()) {
    const lead = group.reduce((m, c) => (c.zones.length > m.zones.length ? c : m));
    const avail = (n: number, c: CabinetSpec) => frontRegion(c.height, style, t) - style.gap * (n - 1);
    const leadHs = split(lead.zones.length, avail(lead.zones.length, lead));
    const top = leadHs[leadHs.length - 1];
    for (const c of group) {
      const n = c.zones.length;
      let hs: number[];
      if (n === lead.zones.length) hs = leadHs;
      else {
        const rest = split(n - 1, avail(n, c) - top, top);
        hs = rest[rest.length - 1] >= top - 0.01 ? [...rest, top] : split(n, avail(n, c));
      }
      c.zones = hs.map((h) => ({ type: 'drawer', size: h }));
    }
  }
  return out;
}

/** Splits a cabinet's front region between its zones (bottom to top). Numbers are fixed front heights;
 *  'fill' fronts share what's left, graduated golden (or even). */
export function splitZones(zones: Zone[], avail: number, rhythm: Style['rhythm']): number[] {
  const fixed = zones.reduce((a, z) => a + (typeof z.size === 'number' ? z.size : 0), 0);
  const fill = zones.map((z, i) => ({ z, i })).filter(({ z }) => z.size === 'fill');
  const rest = avail - fixed;
  const out = zones.map((z) => (typeof z.size === 'number' ? z.size : 0));
  // open shelving shares evenly with everything (its shelves are adjustable anyway)
  const golden = (rhythm ?? 'golden') === 'golden' && fill.length > 1 && fill.every(({ z }) => z.type !== 'open');
  // a fixed drawer straight above the stack: the fronts below it stay clearly bigger than it
  const lastFill = fill.length ? fill[fill.length - 1].i : -1;
  const above = zones[lastFill + 1];
  const minTop = above?.type === 'drawer' && typeof above.size === 'number' ? Math.max(MIN_TOP_FRONT, above.size * 1.1) : MIN_TOP_FRONT;
  const hs = golden ? graduate(fill.length, rest, minTop) : fill.map(() => rest / fill.length);
  fill.forEach(({ i }, k) => { out[i] = hs[k]; });
  return out;
}

/** Splits a width into a golden pair, the smaller part rounded to a 1/4". */
export function goldenSplit(width: number, round = 25.4 / 4): [major: number, minor: number] {
  const minor = Math.round((width * GOLDEN_MINOR) / round) * round;
  return [width - minor, minor];
}

/** A drawer's pull, scaled to the front: about a third of its width, from the chosen pull's family and
 *  never shorter than the chosen one. A wide drawer with a little pull looks like a mistake. */
export function pullForFront(pulls: Record<string, Pull>, chosen: Pull, frontW: number, sizing: Style['pullSizing']): Pull {
  if ((sizing ?? 'scale') === 'fixed' || !chosen.family || !chosen.length) return chosen;
  const want = frontW / 3;
  const options = Object.values(pulls).filter((p) => p.family === chosen.family && p.length && p.length >= chosen.length! && p.length + 80 <= frontW);
  return options.reduce((best, p) => (Math.abs(p.length! - want) < Math.abs(best.length! - want) ? p : best), chosen);
}
