// A run = cabinets side by side along one wall, plus what spans them
// (countertop, sinks, plumbing). This is what the app designs for a wall.

import { lookup, resolveStyle } from './catalog.ts';
import { buildCabinet } from './cabinet.ts';
import { alignRun } from './proportion.ts';
import { applyBanding } from './edges.ts';
import { fasten, installKit, installSteps, roomFit, SCRIBE } from './install.ts';
import type { CabinetOptions } from './cabinet.ts';
import { specToMm } from './units.ts';
import type { Catalog, Design, Fixture, HardwareLine, Part, RunSpec, Vec3, WorldOp } from './types.ts';

const shift = (v: Vec3, dx: number): Vec3 => [v[0] + dx, v[1], v[2]];

function translate(p: Part, dx: number): Part {
  return {
    ...p,
    box: { min: shift(p.box.min, dx), size: p.box.size },
    ops: p.ops.map((op): WorldOp => {
      if (op.kind === 'hole' || op.kind === 'cutCircle') return { ...op, at: shift(op.at, dx) };
      return { ...op, from: shift(op.from, dx), to: shift(op.to, dx) };
    }),
  };
}

export function designRun(input: RunSpec, cat: Catalog): Design {
  const mm = specToMm(input);
  const style = resolveStyle(mm.style);
  const warnings: string[] = [];
  const parts: Part[] = [];
  const hardware: HardwareLine[] = [];
  const fixtures: Fixture[] = [];
  const t = lookup(cat.materials, style.carcass, 'material').thickness;
  // drawer stacks graduated golden, top drawer lines lined up along the run (proportion.ts)
  const spec = { ...mm, cabinets: alignRun(mm.cabinets, style, t) };
  const bt = lookup(cat.materials, style.back, 'material').thickness;

  if (!spec.cabinets.length) throw new Error('A run needs at least one cabinet');
  const H = spec.cabinets[0].height, D = spec.cabinets[0].depth;
  if (spec.top && spec.cabinets.some((c) => c.height !== H || c.depth !== D))
    throw new Error('Cabinets under one countertop must share height and depth');

  const ft = lookup(cat.materials, style.fronts, 'material').thickness;
  const kickH = spec.kickHeight ?? 100, kickBack = spec.kickSetback ?? 75;
  const elev = spec.mounting === 'toe-kick' ? kickH : spec.elevation;
  const ends = spec.endPanels ?? 'none';
  const panelL = ends === 'both' || ends === 'left', panelR = ends === 'both' || ends === 'right';
  const frontDepth = style.mount === 'overlay' ? ft : 0;
  const topT = spec.top ? lookup(cat.materials, spec.top.material, 'material').thickness : 0;
  const topFrontZ = D + frontDepth + (spec.top?.overhangFront ?? 0);

  // sinks first: they decide where plumbing blocks drawers and where the back is cut
  const xAt: Record<string, number> = {};
  let x = 0;
  for (const c of spec.cabinets) { xAt[c.id] = x; x += c.width; }
  const totalW = x;

  const topOps: WorldOp[] = [];
  const cabOpts: Record<string, CabinetOptions> = {};
  for (const sk of spec.sinks ?? []) {
    if (!spec.top) throw new Error('A vessel sink needs a countertop (add "top" to the run)');
    const cab = spec.cabinets.find((c) => c.id === sk.cabinet);
    if (!cab) throw new Error(`Sink refers to unknown cabinet "${sk.cabinet}"`);
    const sink = lookup(cat.sinks, sk.sink, 'sink');
    const faucet = lookup(cat.faucets, sk.faucet, 'faucet');
    const cx = xAt[cab.id] + cab.width / 2 + (sk.offsetX ?? 0);
    // default: centred on the top, pushed forward just enough for the faucet to fit behind the bowl
    const faucetFits = 40 + faucet.holeDia / 2 + faucet.gapBehindBowl + sink.bowl[1] / 2;
    const cz = sk.setback !== undefined ? topFrontZ - sk.setback : Math.max(topFrontZ / 2, faucetFits);
    if (cz + sink.bowl[1] / 2 > topFrontZ) warnings.push('Sink bowl hangs past the front edge of the countertop');
    const fz = cz - sink.bowl[1] / 2 - faucet.gapBehindBowl;
    const yTop = H + topT;
    topOps.push({ kind: 'cutCircle', at: [cx, yTop, cz], dia: sink.drainHole, note: 'sink drain' });
    fixtures.push({ kind: 'sink', shape: sink.bowl[0] === sink.bowl[1] ? 'round' : 'box', name: sink.name,
      box: { min: [cx - sink.bowl[0] / 2, yTop, cz - sink.bowl[1] / 2], size: [sink.bowl[0], 130, sink.bowl[1]] } });
    fixtures.push({ kind: 'faucet', shape: 'round', name: faucet.name,
      box: { min: [cx - 15, yTop, fz - 15], size: [30, 300, 30] } });
    if (fz - faucet.holeDia / 2 < 40) warnings.push(`Faucet hole is ${Math.round(fz)}mm from the wall: too tight. Move the sink forward or use a wall-mount faucet.`);
    else topOps.push({ kind: 'cutCircle', at: [cx, yTop, fz], dia: faucet.holeDia, note: 'faucet' });
    if (cx - sink.bowl[0] / 2 < -(spec.top.overhangSides) || cx + sink.bowl[0] / 2 > totalW + spec.top.overhangSides)
      warnings.push('Sink bowl hangs past the end of the countertop');
    hardware.push({ item: sink.name, qty: 1, buy: sink.buy }, { item: faucet.name, qty: 1, buy: faucet.buy },
      { item: 'Pop-up drain + P-trap kit (vessel, no overflow)', qty: 1 });

    // drain + trap run straight back to the wall: nothing may sit behind the drain
    const local = cx - xAt[cab.id];
    const pl = spec.plumbing ?? { width: 300, bottom: 380, top: 640 };
    const y0 = Math.max(pl.bottom - elev, t + 40);
    const y1 = Math.min(pl.top - elev, H - t - 40);
    const backZ = t + bt; // back panel face A plane (see cabinet.ts: back sits at z = t)
    const cut: WorldOp[] = y1 - y0 > 50
      ? [{ kind: 'cutRect', from: [Math.max(local - pl.width / 2, t + 30), y0, backZ], to: [Math.min(local + pl.width / 2, cab.width - t - 30), y1, backZ], note: 'plumbing' }]
      : [];
    if (!cut.length) warnings.push(`${cab.id}: plumbing rough-in (${pl.bottom}-${pl.top}mm above floor) misses the cabinet back; check the hanging height`);
    cabOpts[cab.id] = { drain: { x: local, clearZ: cz + 50, width: 220 }, backCutouts: cut };
  }

  // where it meets the room: scribe fillers at side walls, a strip under the ceiling
  const epT = t, epY0 = spec.mounting === 'toe-kick' ? -kickH : 0;
  const fit = roomFit(spec, {
    xL: panelL ? -epT : 0, xR: totalW + (panelR ? epT : 0), y0: epY0, y1: H, faceZ: D + frontDepth, t, material: style.carcass,
    floorY: -elev, hasEndPanel: { left: panelL, right: panelR }, boxes: spec.cabinets.length,
  });
  const fillerL = fit.fillerL > 0, fillerR = fit.fillerR > 0;

  spec.cabinets.forEach((c, i) => {
    if (c.knee) { parts.push(...knee(c.id, xAt[c.id], c.width, H, D, t, style.carcass)); return; }
    // an end panel or a filler beside the end box: its fronts run out to the full gap
    const endGap = { left: (panelL || fillerL) && i === 0, right: (panelR || fillerR) && i === spec.cabinets.length - 1 };
    const r = buildCabinet(c, style, cat, { ...cabOpts[c.id], endGap });
    parts.push(...r.parts.map((p) => translate(p, xAt[c.id])));
    hardware.push(...r.hardware);
    fixtures.push(...r.fixtures.map((f) => ({ ...f, box: { min: shift(f.box.min, xAt[c.id]), size: f.box.size } })));
    warnings.push(...r.warnings);
    if (spec.mounting === 'toe-kick') parts.push(...plinth(c.id, xAt[c.id], c.width, c.depth, t, kickH, kickBack, style.carcass));
  });

  // legs belong to the run: four corners, plus a centre pair under the joint nearest the middle of a long run
  if (spec.mounting === 'legs') {
    const xs = [60, totalW - 60];
    if (totalW > 1200) {
      const joints = spec.cabinets.slice(1).map((c) => xAt[c.id]);
      xs.push(joints.length ? joints.reduce((a, b) => (Math.abs(b - totalW / 2) < Math.abs(a - totalW / 2) ? b : a)) : totalW / 2);
    }
    const leg = lookup(cat.legs, style.leg, 'leg');
    const veneer = (f: string) => !!cat.finishes[f]?.texture;
    const finish = leg.wood === 'match' ? (veneer(style.carcassFinish) ? style.carcassFinish : 'walnut') : leg.wood;
    const inset = 30 + leg.topDia / 2; // plate inside the bottom, clear of the sides
    const reach = Math.tan((leg.splay * Math.PI) / 180) * elev;
    for (const lx of xs) for (const lz of [inset, D - inset]) {
      const x = lx === 60 ? inset : lx === totalW - 60 ? totalW - inset : lx;
      // splay outward from the run's centre (end legs on the diagonal, middle legs straight out)
      const dx = x === inset ? -1 : x === totalW - inset ? 1 : 0, dz = lz === inset ? -1 : 1;
      const len = Math.hypot(dx, dz) || 1;
      const top: Vec3 = [x, 0, lz], foot: Vec3 = [x + (dx / len) * reach, -elev, lz + (dz / len) * reach];
      const r = leg.topDia / 2;
      fixtures.push({ kind: 'leg', shape: 'taper', name: leg.name, box: { min: [Math.min(top[0], foot[0]) - r, -elev, Math.min(top[2], foot[2]) - r],
        size: [Math.abs(foot[0] - top[0]) + 2 * r, elev, Math.abs(foot[2] - top[2]) + 2 * r] },
        leg: { top, foot, topDia: leg.topDia, bottomDia: leg.bottomDia, ferrule: leg.ferrule, finish } });
    }
    const woodName = finish ? `${(cat.finishes[finish]?.name ?? finish).split(' (')[0].replace(' veneer', '')}, ` : '';
    hardware.push({ item: `${leg.name} (${woodName}${Math.round(elev)}mm / ${(elev / 25.4).toFixed(1)}" tall) + ${leg.plate}`, qty: xs.length * 2, buy: leg.buy });
  }

  // flush-face end panels: same finish as the fronts, down to the floor on floor-standing runs
  const endPanel = (side: 'L' | 'R', x0: number): Part => ({
    id: `end-panel-${side}`, name: `End panel (${side === 'L' ? 'left' : 'right'})`, cabinet: 'run', role: 'endPanel', material: style.carcass,
    box: { min: [x0, epY0, 0], size: [epT, H - epY0, D + frontDepth] }, faceA: side === 'L' ? '-x' : '+x', grain: 1, exposed: true, ops: [],
  });
  if (panelL) parts.push(endPanel('L', -epT));
  if (panelR) parts.push(endPanel('R', totalW));
  if (panelL || panelR) hardware.push({ item: 'Screws, end panel to cabinet side (from inside, 1-1/4")', qty: 6 * (Number(panelL) + Number(panelR)) });

  // islands: a finished panel across the back (and the end panels' back edges), down to the floor
  const backT = spec.finishedBack ? epT : 0;
  if (spec.finishedBack) {
    const x0 = panelL ? -epT : 0, x1 = totalW + (panelR ? epT : 0);
    parts.push({ id: 'back-panel', name: 'Finished back panel', cabinet: 'run', role: 'endPanel', material: style.carcass,
      box: { min: [x0, epY0, -backT], size: [x1 - x0, H - epY0, backT] }, faceA: '-z', grain: 0, exposed: true, ops: [] });
    hardware.push({ item: 'Screws, back panel to cabinet backs (from inside, 1-1/4")', qty: 4 * spec.cabinets.length });
  }

  if (spec.top) {
    // at a wall the top runs over the filler to it, cut 3/4" long to scribe
    const oh = spec.top.overhangSides;
    const left = (fillerL ? -fit.fillerL : -oh) - (panelL ? epT : 0), right = totalW + (fillerR ? fit.fillerR : oh) + (panelR ? epT : 0);
    const back = -backT - (spec.top.overhangBack ?? 0);
    parts.push({
      id: 'top', name: 'Countertop', cabinet: 'run', role: 'top', material: spec.top.material,
      box: { min: [left, H, back], size: [right - left, topT, topFrontZ - back] },
      faceA: '+y', grain: 0, exposed: true, ops: topOps,
      ...(fillerL || fillerR ? { scribe: { axis: 0 as const, lo: fillerL ? SCRIBE : 0, hi: fillerR ? SCRIBE : 0, edge: 'wall end' } } : {}),
    });
  }
  parts.push(...fit.parts);
  hardware.push(...fit.hardware);

  // screws: confirmats only where the side is hidden; finished sides are glued + pocket-screwed from inside
  const n = spec.cabinets.length;
  const why = (i: number, side: 'L' | 'R'): string | null => {
    const first = side === 'L' ? i === 0 : i === n - 1;
    const next = first ? undefined : spec.cabinets[side === 'L' ? i - 1 : i + 1];
    if (next?.knee) return null;   // beside a knee space: it shows
    if (next) return `against ${next.id}`;
    if (side === 'L' ? panelL : panelR) return 'behind the end panel';
    if (side === 'L' ? fillerL : fillerR) return 'against the wall, behind the scribe filler';
    return null;
  };
  const fastening = fasten(parts, spec.cabinets, why);
  hardware.push(...fastening.hardware, ...installKit(spec, totalW, spec.mounting === 'legs'));

  hardware.push(...applyBanding(parts, style, cat));

  // grain matching: the whole face is one group; drawer bottoms group by level (same height = side by side)
  if (style.grainMatch !== 'off') for (const p of parts) {
    if (p.role === 'door' || p.role === 'drawerFront') p.match = 'face';
    else if (p.role === 'drawerBottom') p.match = `drawer bottoms @${Math.round(p.box.min[1])}`;
  }

  const install = installSteps(spec, { banded: style.edges === 'banded', sides: fastening.sides, fit, legs: spec.mounting === 'legs', elevation: elev, kickHeight: kickH });
  return {
    spec, style, parts, hardware: mergeHardware(hardware), fixtures, warnings, sides: fastening.sides, install,
    overall: { width: totalW + (panelL ? epT : 0) + (panelR ? epT : 0), height: H + topT, depth: topFrontZ + backT + (spec.top?.overhangBack ?? 0), elevation: elev },
  };
}

// Knee space (desks): no box. A desk rail under the front of the top stiffens it across the gap, and a
// cleat on the wall carries its back edge; both are pocket-screwed to the boxes or end panel beside them.
function knee(id: string, x0: number, W: number, H: number, D: number, t: number, material: string): Part[] {
  return [
    { id: `${id}-desk-rail`, name: 'Desk rail (stiffens the top over the knee space)', cabinet: id, role: 'rail', material,
      box: { min: [x0, H - 90, D - 40 - t], size: [W, 90, t] }, faceA: '+z', grain: 0, exposed: true, ops: [] },
    { id: `${id}-wall-cleat`, name: 'Wall cleat (screwed to the studs, carries the back of the top)', cabinet: id, role: 'rail', material,
      box: { min: [x0, H - 75, 0], size: [W, 75, t] }, faceA: '+z', grain: 0, exposed: false, ops: [] },
  ];
}

// Toe-kick plinth under one cabinet: a ladder of front rail (set back for toes), back rail
// and cross pieces, glued and screwed. It sits at y < 0, below the carcass.
function plinth(cab: string, x0: number, W: number, D: number, t: number, h: number, back: number, material: string): Part[] {
  const p = (name: string, min: Vec3, size: Vec3, faceA: Part['faceA'], grain: 0 | 1 | 2, exposed: boolean): Part =>
    ({ id: `${cab}-plinth-${name}`, name: `Plinth ${name}`, cabinet: cab, role: 'plinth', material, box: { min, size }, faceA, grain, exposed, ops: [] });
  const fz = D - back - t;
  const out = [
    p('front', [x0, -h, fz], [W, h, t], '+z', 0, true),
    p('back', [x0, -h, 0], [W, h, t], '+z', 0, false),
  ];
  const n = Math.max(2, Math.ceil(W / 600) + 1);
  for (let i = 0; i < n; i++) {
    const cx = x0 + (i === 0 ? 0 : i === n - 1 ? W - t : (W * i) / (n - 1) - t / 2);
    out.push(p(`cross-${i + 1}`, [cx, -h, t], [t, h, fz - t], '+x', 2, false));
  }
  return out;
}

function mergeHardware(lines: HardwareLine[]): HardwareLine[] {
  const m = new Map<string, HardwareLine>();
  for (const l of lines) {
    const prev = m.get(l.item);
    if (prev) prev.qty += l.qty; else m.set(l.item, { ...l });
  }
  return [...m.values()];
}
