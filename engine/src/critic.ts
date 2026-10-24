// The design critic: looks at a finished design the way a designer would and lists what the eye would
// catch. The planner should never make a design with a flaw; the fuzz tester runs every random room
// through this, and the app can show the passed rules ("12 proportion checks passed").
//
// Rules (fronts and boxes as built, in mm):
//   rhythm      going up a stack, no front is taller than the one below it
//   near-miss   two neighbouring drawers or boxes that are almost, but not quite, the same size
//   top-line    drawer stacks of the same height share one top drawer line along the run
//   symmetry    a run of three or more boxes mirrors about its centre
//   door        a door leaf no wider than 24", and not squat (at least 0.6 as tall as it is wide)
//   drawer      no drawer front wider than 42" (runners and the front itself sag), none under 4" tall
//   pull        a drawer pull between 1/6 and 2/3 of its front's width, and inside the front
//   shelves     open shelves 7" to 16" apart

import type { Design, Part } from './types.ts';

export interface Finding { rule: string; cabinet?: string; message: string }
export const RULES = ['rhythm', 'near-miss', 'top-line', 'symmetry', 'door', 'drawer', 'pull', 'shelves'] as const;

const IN = 25.4;
const inch = (mm: number) => `${(mm / IN).toFixed(2)}"`;
const nearMiss = (a: number, b: number, lo = 1.012, hi = 1.06) => { const r = Math.max(a, b) / Math.min(a, b); return r > lo && r < hi; };

export function critique(d: Design): Finding[] {
  const out: Finding[] = [];
  const by = new Map<string, Part[]>();
  for (const p of d.parts) by.set(p.cabinet, [...(by.get(p.cabinet) ?? []), p]);
  const cabs = [...by.entries()].filter(([, ps]) => ps.some((p) => p.role === 'side'))
    .map(([id, ps]) => {
      const sides = ps.filter((p) => p.role === 'side').map((p) => p.box);
      const x0 = Math.min(...sides.map((b) => b.min[0])), x1 = Math.max(...sides.map((b) => b.min[0] + b.size[0]));
      const y0 = Math.min(...sides.map((b) => b.min[1])), y1 = Math.max(...sides.map((b) => b.min[1] + b.size[1]));
      const drawers = ps.filter((p) => p.role === 'drawerFront').sort((a, b) => a.box.min[1] - b.box.min[1]);
      const doors = ps.filter((p) => p.role === 'door');
      return { id, parts: ps, x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, drawers, doors };
    })
    .sort((a, b) => a.x0 - b.x0);

  for (const c of cabs) {
    // rhythm + near misses up the stack (drawers that sit directly on top of each other)
    for (let i = 1; i < c.drawers.length; i++) {
      const lo = c.drawers[i - 1].box, hi = c.drawers[i].box;
      if (hi.size[1] > lo.size[1] + 1) out.push({ rule: 'rhythm', cabinet: c.id, message: `${c.id}: drawer ${i + 1} (${inch(hi.size[1])}) is taller than the one below it (${inch(lo.size[1])})` });
      else if (nearMiss(hi.size[1], lo.size[1])) out.push({ rule: 'near-miss', cabinet: c.id, message: `${c.id}: drawers ${i} and ${i + 1} are almost the same height (${inch(lo.size[1])} / ${inch(hi.size[1])}): make them equal or clearly different` });
    }
    for (const f of c.drawers) {
      if (f.box.size[0] > 42 * IN) out.push({ rule: 'drawer', cabinet: c.id, message: `${c.id}: a ${inch(f.box.size[0])} wide drawer front sags; split the box` });
      if (f.box.size[1] < 4 * IN - 0.5) out.push({ rule: 'drawer', cabinet: c.id, message: `${c.id}: a ${inch(f.box.size[1])} drawer front is a sliver` });
    }
    for (const f of c.doors) {
      const [w, h] = f.box.size;
      if (w > 24 * IN + 0.5) out.push({ rule: 'door', cabinet: c.id, message: `${c.id}: a ${inch(w)} wide door leaf sags and swings into the room; use a pair` });
      if (h / w < 0.6) out.push({ rule: 'door', cabinet: c.id, message: `${c.id}: a ${inch(w)} x ${inch(h)} door is squat` });
    }

    // open shelves: the gaps between shelves, fixed shelves and the top that no door covers
    const fronts = [...c.doors, ...c.drawers];
    const covered = (lo: number, hi: number) => fronts.some((f) => f.box.min[1] < hi - 5 && f.box.min[1] + f.box.size[1] > lo + 5);
    const levels = c.parts.filter((p) => p.role === 'shelf' || p.role === 'stretcher' || p.role === 'bottom').map((p) => p.box.min[1] + p.box.size[1] / 2);
    const tops = [...new Set(levels.map((y) => Math.round(y)))].sort((a, b) => a - b);
    for (let i = 1; i < tops.length; i++) {
      if (covered(tops[i - 1], tops[i])) continue;
      const gap = tops[i] - tops[i - 1];
      if (gap < 7 * IN || gap > 16 * IN) out.push({ rule: 'shelves', cabinet: c.id, message: `${c.id}: open shelves ${inch(gap)} apart (7"-16" reads as shelving)` });
    }
  }

  // pulls on drawer fronts: scaled to the front, and fully on it
  for (const f of d.fixtures.filter((x) => x.kind === 'pull')) {
    const cx = f.box.min[0] + f.box.size[0] / 2, cy = f.box.min[1] + f.box.size[1] / 2;
    const front = d.parts.find((p) => (p.role === 'drawerFront' || p.role === 'door') && cx >= p.box.min[0] && cx <= p.box.min[0] + p.box.size[0] && cy >= p.box.min[1] && cy <= p.box.min[1] + p.box.size[1]);
    if (!front) { out.push({ rule: 'pull', message: `a pull at x ${inch(cx)} isn't on any front` }); continue; }
    if (f.box.min[0] < front.box.min[0] - 0.5 || f.box.min[0] + f.box.size[0] > front.box.min[0] + front.box.size[0] + 0.5)
      out.push({ rule: 'pull', cabinet: front.cabinet, message: `${front.cabinet}: a pull hangs off its front` });
    if (front.role !== 'drawerFront') continue;
    const r = f.box.size[0] / front.box.size[0];
    if (r < 1 / 6 || r > 2 / 3) out.push({ rule: 'pull', cabinet: front.cabinet, message: `${front.cabinet}: a ${inch(f.box.size[0])} pull on a ${inch(front.box.size[0])} drawer looks ${r < 1 / 6 ? 'lost' : 'crowded'}` });
  }

  // along the run: one top drawer line, no near-miss box widths, mirrored when 3+
  const stacks = cabs.filter((c) => c.drawers.length >= 2);
  for (let i = 1; i < stacks.length; i++) {
    const a = stacks[i - 1], b = stacks[i];
    if (Math.abs(a.y0 - b.y0) > 1 || Math.abs(a.h - b.h) > 1) continue;
    const ta = a.drawers[a.drawers.length - 1].box, tb = b.drawers[b.drawers.length - 1].box;
    if (Math.abs(ta.min[1] - tb.min[1]) > 0.75 || Math.abs(ta.size[1] - tb.size[1]) > 0.75)
      out.push({ rule: 'top-line', cabinet: b.id, message: `${a.id} and ${b.id}: top drawers don't line up (${inch(ta.size[1])} vs ${inch(tb.size[1])})` });
  }
  for (let i = 1; i < cabs.length; i++)
    if (nearMiss(cabs[i - 1].w, cabs[i].w, 1.012, 1.08)) out.push({ rule: 'near-miss', cabinet: cabs[i].id, message: `${cabs[i - 1].id} and ${cabs[i].id} are almost the same width (${inch(cabs[i - 1].w)} / ${inch(cabs[i].w)})` });
  if (cabs.length >= 3)
    for (let i = 0; i < cabs.length / 2; i++) {
      const a = cabs[i], b = cabs[cabs.length - 1 - i];
      if (Math.abs(a.w - b.w) > 1) out.push({ rule: 'symmetry', cabinet: b.id, message: `${a.id} and ${b.id} mirror each other but are ${inch(a.w)} and ${inch(b.w)}` });
    }
  return out;
}

/** One line on the proportions of a design, for the app and the job sheet. */
export function proportionNote(d: Design, flags = critique(d)): string {
  const golden = (d.style.rhythm ?? 'golden') === 'golden';
  const stacks = [...new Set(d.parts.filter((p) => p.role === 'drawerFront').map((p) => p.cabinet))]
    .filter((c) => d.parts.filter((p) => p.cabinet === c && p.role === 'drawerFront').length >= 2);
  const bits: string[] = [];
  if (stacks.length && golden) bits.push('drawers graduate by the golden ratio, 1 : 1.618 top to bottom');
  if (stacks.length && !golden) bits.push('drawers all one height');
  if (stacks.length > 1) bits.push('one top drawer line runs across');
  if (d.parts.some((p) => p.role === 'shelf' && p.name === 'Fixed shelf') && d.parts.some((p) => p.role === 'door')) bits.push('the closed base rises to the golden section of the height');
  const head = bits.length ? `${golden ? 'Golden proportions' : 'Proportions'}: ${bits.join(', ')}. ` : '';
  const passed = RULES.length - new Set(flags.map((f) => f.rule)).size;
  return `${head}${flags.length ? `Passes ${passed} of ${RULES.length} proportion checks.` : `Passes all ${RULES.length} proportion checks.`}`;
}
