// Fitting a run to the room and holding it together:
//   - scribe fillers where it meets a side wall, and a scribe strip under the ceiling (walls aren't flat
//     or plumb, so these are cut oversize and trimmed to the wall on site)
//   - confirmat holes on the hidden carcass sides only; finished sides show, so nothing goes through them
//   - connector holes between neighbouring boxes, drilled in both sides from the same world point
//   - the installer's kit and the assembly + install steps

import type { CabinetSpec, HardwareLine, Part, RunSpec, SideFastening, Vec3, WorldOp } from './types.ts';

const IN = 25.4;
export const SCRIBE = 19;                     // 3/4" extra on every edge that's trimmed to a wall or ceiling
export const MAX_FILLER = 4 * IN;             // a wider gap at a wall is a design choice, not a filler
export const MAX_CEILING_SCRIBE = 8 * IN;     // a taller gap above a built-in is left open
const MAX_STRIP = 2400;                       // longest piece off an 8' sheet
const STUD = 16 * IN;                         // stud spacing (on centre)

export interface RoomFit { parts: Part[]; hardware: HardwareLine[]; fillerL: number; fillerR: number; ceiling: number }

/**
 * Fillers and the ceiling strip. xL / xR are the outside faces of the run (end panels included),
 * y0..y1 the height a filler covers, faceZ the plane of the fronts (and end panels).
 */
export function roomFit(spec: RunSpec, o: {
  xL: number; xR: number; y0: number; y1: number; faceZ: number; t: number; material: string; floorY: number;
  hasEndPanel: { left: boolean; right: boolean }; boxes: number;
}): RoomFit {
  const parts: Part[] = [], hardware: HardwareLine[] = [];
  const { t, material, faceZ } = o;
  const w = spec.walls ?? {};
  const gapOk = (g?: number): g is number => g !== undefined && g >= 6 && g <= MAX_FILLER + t + 0.01;
  const fillerL = gapOk(w.left) ? w.left : 0, fillerR = gapOk(w.right) ? w.right : 0;
  const h = o.y1 - o.y0;

  for (const [side, gap] of [['L', fillerL], ['R', fillerR]] as const) {
    if (!gap) continue;
    const left = side === 'L';
    const x0 = left ? o.xL - gap : o.xR;
    const wall = left ? 'left' : 'right';
    parts.push({
      id: `filler-${side}`, name: `Scribe filler (${wall} wall)`, cabinet: 'run', role: 'endPanel', material,
      box: { min: [x0, o.y0, faceZ - t], size: [gap, h, t] }, faceA: '+z', grain: 1, exposed: true, ops: [],
      scribe: { axis: 0, lo: left ? SCRIBE : 0, hi: left ? 0 : SCRIBE, edge: 'wall edge' },
    });
    // the backer sits behind the filler against the cabinet, short of the wall, and takes the screws
    const bw = gap - 3;
    if (bw >= 6) parts.push({
      id: `filler-${side}-backer`, name: `Filler backer (${wall})`, cabinet: 'run', role: 'rail', material,
      box: { min: [left ? o.xL - bw : o.xR, o.y0, faceZ - 2 * t], size: [bw, h, t] }, faceA: '+z', grain: 1, exposed: false, ops: [],
    });
    // long enough to bite, short enough not to come out of a narrow backer
    const through = (left ? o.hasEndPanel.left : o.hasEndPanel.right) ? '2"' : bw < 16 ? '1"' : '1-1/4"';
    hardware.push({ item: `Screws, filler backer through the cabinet side from inside (${through}, pre-drill) + glue`, qty: Math.ceil(h / 300) + 1, install: true });
  }

  // ceiling: built-ins without a countertop that stop just short of it
  const topY = o.y1, gapTop = w.ceiling !== undefined ? w.ceiling + o.floorY - topY : 0;
  if (!spec.top && gapTop >= 6 && gapTop <= MAX_CEILING_SCRIBE) {
    const xa = o.xL - fillerL, xb = o.xR + fillerR;
    const n = Math.ceil((xb - xa) / MAX_STRIP);
    const len = (xb - xa) / n;
    const ch = Math.min(gapTop - 6, 75);
    for (let k = 0; k < n; k++) {
      const x0 = xa + k * len;
      parts.push({
        id: `scribe-ceiling-${k + 1}`, name: n > 1 ? `Ceiling scribe strip ${k + 1} of ${n}` : 'Ceiling scribe strip', cabinet: 'run', role: 'endPanel', material,
        box: { min: [x0, topY, faceZ - t], size: [len, gapTop, t] }, faceA: '+z', grain: 0, exposed: true, ops: [],
        scribe: { axis: 1, lo: 0, hi: SCRIBE, edge: 'ceiling edge' },
      });
      // the cleat stands on the cabinet tops (not over the fillers) behind the strip
      const c0 = Math.max(x0, o.xL), c1 = Math.min(x0 + len, o.xR);
      if (ch >= 20 && c1 - c0 > 50) parts.push({
        id: `scribe-cleat-${k + 1}`, name: 'Ceiling strip cleat', cabinet: 'run', role: 'rail', material,
        box: { min: [c0, topY, faceZ - 2 * t], size: [c1 - c0, ch, t] }, faceA: '+z', grain: 0, exposed: false, ops: [],
      });
    }
    hardware.push({ item: 'Screws, ceiling strip cleat down into the cabinet tops (1-1/4") + glue and 18ga pins for the strip', qty: 3 * o.boxes, install: true });
  }
  return { parts, hardware, fillerL, fillerR, ceiling: !spec.top && gapTop >= 6 && gapTop <= MAX_CEILING_SCRIBE ? gapTop : 0 };
}

// ---- fastening ---------------------------------------------------------------------------------

const plane = (p: Part) => (p.faceA[0] === '+' ? p.box.min[0] + p.box.size[0] : p.box.min[0]);
type Spot = [number, number]; // y, z on a side

/** Positions along a panel edge: 40mm in from each end, no more than 250mm apart. */
function spread(z0: number, z1: number): number[] {
  if (z1 - z0 < 120) return [(z0 + z1) / 2];
  const a = z0 + 40, b = z1 - 40, n = Math.ceil((b - a) / 250);
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

/** Room on a side for a hole at (y, z): clear of holes already there, runner bodies and hinge plates. */
function clear(side: Part, [y, z]: Spot, r: number, connector: boolean): boolean {
  const [, y0, z0] = side.box.min, [, h, d] = side.box.size;
  if (y - r < y0 + 2 || y + r > y0 + h - 2 || z - r < z0 + 2 || z + r > z0 + d - 2) return false;
  for (const op of side.ops) {
    if (op.kind !== 'hole') continue;
    const [, oy, oz] = op.at;
    if (Math.hypot(oy - y, oz - z) < r + op.dia / 2 + 3) return false;
    if (!connector) continue;
    // connector heads stand proud inside the box: keep them off the runners and hinge plates
    if (op.note === 'runner screw' && Math.abs(oy - y) < 25) return false;
    if (op.note === 'hinge plate' && Math.hypot(oy - y, oz - z) < 32) return false;
  }
  return true;
}

const tries = [0, 16, -16, 32, -32, 48, -48];

export interface Fastening { hardware: HardwareLine[]; sides: SideFastening[] }

/**
 * Drill the carcass screw holes. `hidden(i, side)` says why a side's outside face is hidden
 * (a neighbouring box, an end panel, a wall) or null when it's a finished side that shows.
 */
export function fasten(parts: Part[], cabinets: CabinetSpec[], hidden: (i: number, side: 'L' | 'R') => string | null): Fastening {
  const sides: SideFastening[] = [];
  let confirmats = 0, pockets = 0, connectors = 0;
  const sideOf = (c: string, s: 'L' | 'R') => parts.find((p) => p.id === `${c}-side-${s}`);

  cabinets.forEach((c, i) => {
    const joints = parts.filter((p) => p.cabinet === c.id &&
      (p.role === 'bottom' || p.role === 'stretcher' || p.id.endsWith('-rail') || p.id.includes('-fixed-shelf-')));
    for (const s of ['L', 'R'] as const) {
      const side = sideOf(c.id, s);
      if (!side) continue;
      const why = hidden(i, s);
      if (!why) {
        sides.push({ part: side.id, finished: true, why: i === 0 || i === cabinets.length - 1 ? 'end of the run, shows in the room' : 'shows' });
        pockets += joints.reduce((a, j) => a + (j.id.endsWith('-rail') ? 1 : 2), 0);
        continue;
      }
      sides.push({ part: side.id, finished: false, why });
      const x = plane(side);
      for (const j of joints) {
        const [, jy, jz] = j.box.min, [, jh, jd] = j.box.size;
        const spots: Spot[] = j.id.endsWith('-rail')
          ? [[jy + 25, jz + jd / 2], [jy + jh - 25, jz + jd / 2]]
          : spread(jz, jz + jd).map((z) => [jy + jh / 2, z]);
        for (const [y, z] of spots) {
          const dz = tries.find((d) => {
            const zz = Math.min(Math.max(z + d, jz + 10), jz + jd - 10);
            return clear(side, [y, zz], 2.5, false);
          });
          if (dz === undefined) continue;
          const zz = Math.min(Math.max(z + dz, jz + 10), jz + jd - 10);
          side.ops.push({ kind: 'hole', at: [x, y, zz], dia: 5, depth: 0, thru: true, note: 'confirmat' });
          confirmats++;
        }
      }
    }
  });

  // neighbouring boxes: connector holes through both sides at the same spot, so they can't miss
  for (let i = 0; i + 1 < cabinets.length; i++) {
    const a = sideOf(cabinets[i].id, 'R'), b = sideOf(cabinets[i + 1].id, 'L');
    if (!a || !b) continue;
    const H = Math.min(a.box.size[1], b.box.size[1]), y0 = Math.max(a.box.min[1], b.box.min[1]);
    const d = Math.min(a.box.min[2] + a.box.size[2], b.box.min[2] + b.box.size[2]);
    const rows = H > 1200 ? 3 : 2;
    const ys = Array.from({ length: rows }, (_, k) => y0 + 80 + ((H - 160) * k) / (rows - 1));
    for (const z of [d - 60, 90]) for (const y of ys) {
      const dy = tries.find((o) => clear(a, [y + o, z], 2.5, true) && clear(b, [y + o, z], 2.5, true));
      if (dy === undefined) continue;
      const at = (p: Part): Vec3 => [plane(p), y + dy, z];
      const hole = (p: Part): WorldOp => ({ kind: 'hole', at: at(p), dia: 5, depth: 0, thru: true, note: 'cabinet connector' });
      a.ops.push(hole(a)); b.ops.push(hole(b));
      connectors++;
    }
  }

  const hardware: HardwareLine[] = [];
  if (confirmats) hardware.push({ item: 'Confirmat screws, 7x50mm (hidden sides: holes drilled; open with a confirmat step drill)', qty: confirmats });
  if (pockets) hardware.push({ item: 'Pocket screws, 1-1/4" fine thread (finished sides: from the hidden faces, no screws through the side)', qty: pockets });
  if (connectors) hardware.push({ item: 'Cabinet connector screws, 5mm hole, for 2 x 18mm sides (joining boxes)', qty: connectors });
  return { hardware, sides };
}

// ---- install ------------------------------------------------------------------------------------

const inch = (mm: number) => {
  const q = Math.round(mm / IN * 4) / 4, whole = Math.floor(q), frac = q - whole;
  return `${whole || ''}${frac ? `${whole ? '-' : ''}${{ 0.25: '1/4', 0.5: '1/2', 0.75: '3/4' }[frac]}` : whole ? '' : '0'}"`;
};

/** The installer's kit for this run: what fixes it to the building. */
export function installKit(spec: RunSpec, totalW: number, legs: boolean): HardwareLine[] {
  const kit: HardwareLine[] = [];
  const studs = spec.cabinets.reduce((a, c) => a + Math.max(1, Math.ceil(c.width / STUD)), 0);
  if (spec.finishedBack) {
    kit.push({ item: 'Island floor cleats: 2x2 blocks screwed to the floor inside the plinth (or L-brackets), + screws', qty: 4, install: true });
  } else if (legs) {
    kit.push({ item: 'Anti-tip kit (furniture strap or bracket, to a wall stud)', qty: totalW > 1200 ? 2 : 1, install: true });
  } else {
    kit.push({ item: '#10 x 3" washer-head cabinet screws, through the hanging rail into studs', qty: 2 * studs, install: true });
    kit.push({ item: 'Composite shims (bundle)', qty: 1, install: true });
  }
  if (spec.top) kit.push({ item: 'Screws, countertop from below through the stretchers (1-1/4")', qty: 4 * spec.cabinets.length, install: true });
  if (spec.sinks?.length) kit.push({ item: 'Clear silicone (top to wall, sink and faucet bases)', qty: 1, install: true });
  return kit;
}

/** Assembly and install steps, in the order the job gets built and fitted. */
export function installSteps(spec: RunSpec, o: {
  banded: boolean; sides: SideFastening[]; fit: RoomFit; legs: boolean; elevation: number; kickHeight: number;
}): string[] {
  const steps: string[] = [];
  const name = (id: string) => id.replace(/^(\w+)-side-L$/, '$1 left side').replace(/^(\w+)-side-R$/, '$1 right side');
  const hiddenSides = o.sides.filter((s) => !s.finished), finished = o.sides.filter((s) => s.finished);
  if (o.banded) steps.push('Band the edges listed in the Band column before anything is glued.');
  steps.push('Dry-fit each box first. Then glue the rabbets and dados, run glue in the back groove (not on the panel faces), slide the back in and check the box is square by measuring its diagonals.');
  if (hiddenSides.length) steps.push(`Hidden sides (${hiddenSides.map((s) => name(s.part)).join(', ')}) are drilled for confirmats: clamp the box, run a confirmat step drill through each 5mm hole from the outside into the panel edge, and drive 7x50mm confirmats flush so neighbouring boxes butt tight.`);
  if (finished.length) steps.push(`Finished sides (${finished.map((s) => name(s.part)).join(', ')}) show in the room, so no screws go through them. Glue and clamp those joints, then add pocket screws from the hidden faces: the top of the bottom panel (under the drawers), the top of the stretchers (under the countertop) and the underside of fixed shelves.`);
  if (spec.cabinets.some((c) => c.knee)) steps.push('Knee space: screw the wall cleat into the studs, level with the box tops, and pocket-screw the desk rail between the boxes (or box and end panel) on each side of the knee space. The top screws down to both.');
  if (spec.cabinets.some((c, i) => i > 0 && !c.knee && !spec.cabinets[i - 1].knee)) steps.push('Clamp neighbouring boxes flush at the front and top and join them with connector screws through the matching 5mm holes.');

  if (spec.finishedBack) steps.push('Set the island where it goes, level it with shims under the plinth, and fix it to the floor with cleats or brackets inside the plinth so it can\'t slide.');
  else if (o.legs) steps.push('Screw the legs on (plates on the marked spots), set the piece against the wall and fit the anti-tip strap into a stud. Dressers and consoles tip forward when drawers are pulled out; don\'t skip it.');
  else if (spec.mounting === 'wall-hung') steps.push(`Mark the studs. Screw a straight board to the wall, level, with its top edge ${inch(o.elevation)} above the floor, as a ledger to rest the boxes on. Set the boxes on it, shim behind them where the wall dips (the boxes go plumb, they don't follow the wall), and screw through the back and hanging rail into every stud, two screws per stud. A box with no stud behind it needs blocking in the wall or toggle bolts rated for the load: a vanity with a full sink is heavy.`);
  else steps.push(`Set the boxes on their plinths, ${inch(o.kickHeight)} toe kick. Level them front to back and side to side with shims under the plinth, then screw through the back and hanging rail into the studs. Tall pieces must be screwed to the wall before anything goes on the shelves.`);

  const fillers = [o.fit.fillerL && `left (${inch(o.fit.fillerL)})`, o.fit.fillerR && `right (${inch(o.fit.fillerR)})`].filter(Boolean);
  if (fillers.length) steps.push(`Scribe filler${fillers.length > 1 ? 's' : ''} at the ${fillers.join(' and ')} wall${fillers.length > 1 ? 's' : ''}: ${fillers.length > 1 ? 'each is' : 'it is'} cut 3/4" wider than the gap so there is wood to trim. Hold it plumb against the wall, set a compass to the widest gap, run it down the wall to draw the line, plane or jigsaw to the line with a slight back-bevel, then glue it to its backer and screw through the cabinet side from inside.`);
  if (o.fit.ceiling) steps.push(`Ceiling strip (${inch(o.fit.ceiling)} gap): cut 3/4" taller than the gap. Scribe it to the ceiling the same way, screw its cleat down into the cabinet tops, and glue and pin the strip to the cleat.`);
  if (spec.top) {
    const walls = fillers.length ? ` Its ${fillers.length > 1 ? 'ends are' : 'wall end is'} cut 3/4" long: scribe ${fillers.length > 1 ? 'them' : 'it'} to the wall${fillers.length > 1 ? 's' : ''} first.` : '';
    steps.push(`Countertop:${walls} Set it on and screw up through the stretchers.${spec.sinks?.length ? ' The sink and faucet holes are already cut; fit them, then run a bead of silicone where the top meets the wall.' : ''}`);
  }
  if (spec.mounting === 'toe-kick') steps.push('Floors aren\'t flat: if a gap shows under the plinth front, scribe a thin kick board to the floor and glue it on.');
  steps.push('Hang the doors and drawer fronts last. Adjust the hinges and the drawer front adjusters for even gaps all round.');
  return steps;
}
