// A run = cabinets side by side along one wall, plus what spans them
// (countertop, sinks, plumbing). This is what the app designs for a wall.

import { lookup, resolveStyle } from './catalog.ts';
import { buildCabinet } from './cabinet.ts';
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
  const spec = specToMm(input);
  const style = resolveStyle(spec.style);
  const warnings: string[] = [];
  const parts: Part[] = [];
  const hardware: HardwareLine[] = [];
  const fixtures: Fixture[] = [];
  const t = lookup(cat.materials, style.carcass, 'material').thickness;
  const bt = lookup(cat.materials, style.back, 'material').thickness;

  if (!spec.cabinets.length) throw new Error('A run needs at least one cabinet');
  const H = spec.cabinets[0].height, D = spec.cabinets[0].depth;
  if (spec.top && spec.cabinets.some((c) => c.height !== H || c.depth !== D))
    throw new Error('Cabinets under one countertop must share height and depth');

  const ft = lookup(cat.materials, style.fronts, 'material').thickness;
  const frontDepth = style.mount === 'overlay' ? ft : 0;
  const topT = spec.top ? lookup(cat.materials, spec.top.material, 'material').thickness : 0;
  const topFrontZ = D + frontDepth + (spec.top?.overhangFront ?? 0);

  // sinks first: they decide where plumbing blocks drawers and where the back is cut
  const xAt: Record<string, number> = {};
  let x = 0;
  for (const c of spec.cabinets) { xAt[c.id] = x; x += c.width; }
  const totalW = x;

  const topOps: WorldOp[] = [];
  const cabOpts: Record<string, { clearFromBack?: number; backCutouts?: WorldOp[] }> = {};
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
    const y0 = Math.max(pl.bottom - spec.elevation, t + 40);
    const y1 = Math.min(pl.top - spec.elevation, H - t - 40);
    const backZ = t + bt; // back panel face A plane (see cabinet.ts: back sits at z = t)
    const cut: WorldOp[] = y1 - y0 > 50
      ? [{ kind: 'cutRect', from: [Math.max(local - pl.width / 2, t + 30), y0, backZ], to: [Math.min(local + pl.width / 2, cab.width - t - 30), y1, backZ], note: 'plumbing' }]
      : [];
    if (!cut.length) warnings.push(`${cab.id}: plumbing rough-in (${pl.bottom}-${pl.top}mm above floor) misses the cabinet back; check the hanging height`);
    cabOpts[cab.id] = { clearFromBack: cz + 50, backCutouts: cut };
  }

  for (const c of spec.cabinets) {
    const r = buildCabinet(c, style, cat, cabOpts[c.id]);
    parts.push(...r.parts.map((p) => translate(p, xAt[c.id])));
    hardware.push(...r.hardware);
    fixtures.push(...r.fixtures.map((f) => ({ ...f, box: { min: shift(f.box.min, xAt[c.id]), size: f.box.size } })));
    warnings.push(...r.warnings);
  }

  if (spec.top) {
    const oh = spec.top.overhangSides;
    parts.push({
      id: 'top', name: 'Countertop', cabinet: 'run', role: 'top', material: spec.top.material,
      box: { min: [-oh, H, 0], size: [totalW + 2 * oh, topT, topFrontZ] },
      faceA: '+y', grain: 0, exposed: true, ops: topOps,
    });
  }

  hardware.push(
    { item: 'Confirmat / cabinet screws (carcass, 7x50mm)', qty: spec.cabinets.length * 16 },
    { item: 'Wall screws for hanging rail (into studs)', qty: spec.cabinets.length * 4 },
  );
  if (spec.cabinets.length > 1) hardware.push({ item: 'Cabinet connector bolts (joining boxes)', qty: (spec.cabinets.length - 1) * 4 });

  return {
    spec, style, parts, hardware: mergeHardware(hardware), fixtures, warnings,
    overall: { width: totalW, height: H + topT, depth: topFrontZ, elevation: spec.elevation },
  };
}

function mergeHardware(lines: HardwareLine[]): HardwareLine[] {
  const m = new Map<string, HardwareLine>();
  for (const l of lines) {
    const prev = m.get(l.item);
    if (prev) prev.qty += l.qty; else m.set(l.item, { ...l });
  }
  return [...m.values()];
}
