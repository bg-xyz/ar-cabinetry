// One cabinet = the box primitive + a front layout + hardware rules.
// Built in the cabinet's own frame (origin back-left-bottom of the carcass);
// run.ts moves it into place along the wall.

import { lookup } from './catalog.ts';
import type {
  CabinetSpec, Catalog, Fixture, HardwareLine, Part, Style, Vec3, WorldOp, Zone,
} from './types.ts';

export interface CabinetOptions {
  clearFromBack?: number;  // nothing may sit behind this z (sink drain + trap)
  backCutouts?: WorldOp[]; // added to the back panel (plumbing)
}

export interface CabinetResult {
  parts: Part[];
  hardware: HardwareLine[];
  fixtures: Fixture[];
  warnings: string[];
  frontDepth: number;      // how far fronts stand proud of the carcass (overlay)
}

const FIT = 0.2;   // dado clearance for glued joints
const GFIT = 0.3;  // groove clearance for backs and drawer bottoms

const floorTo = (v: number, step: number) => Math.floor(v / step) * step;

export function buildCabinet(spec: CabinetSpec, style: Style, cat: Catalog, opts: CabinetOptions = {}): CabinetResult {
  const W = spec.width, H = spec.height, D = spec.depth;
  const mat = (id: string) => lookup(cat.materials, id, 'material');
  const t = mat(style.carcass).thickness;
  const bt = mat(style.back).thickness;
  const ft = mat(style.fronts).thickness;
  const dd = style.dadoDepth, gd = style.grooveDepth, sw = style.stretcherWidth;
  const bs = t; // back sits forward of the rear edge by one board: room for the hanging rail
  const inset = style.mount === 'inset';
  const s = inset ? style.insetSetback : 0;
  const hs = inset ? s + ft : 0;          // carcass front edge -> back face of the fronts
  const frontBackZ = inset ? D - s - ft : D;
  const id = (name: string) => `${spec.id}-${name}`;

  const parts: Part[] = [];
  const hardware: HardwareLine[] = [];
  const fixtures: Fixture[] = [];
  const warnings: string[] = [];
  const add = (p: Omit<Part, 'cabinet'>) => { const full = { ...p, cabinet: spec.id }; parts.push(full); return full; };
  const hw = (item: string, qty: number, buy?: string | null) => hardware.push({ item, qty, buy });

  if (W < 150 || H < 150 || D < 200) throw new Error(`${spec.id}: cabinet ${W}x${H}x${D} is too small`);

  // ---- carcass ------------------------------------------------------------
  const sideOps = (x: number): WorldOp[] => [
    { kind: 'pocket', from: [x, 0, 0], to: [x, t + FIT, D], depth: dd, note: 'bottom rabbet' },
    { kind: 'pocket', from: [x, H - t - FIT, 0], to: [x, H, D], depth: dd, note: 'top rabbet (stretchers)' },
    { kind: 'pocket', from: [x, t - 1, bs], to: [x, H - t + 1, bs + bt + GFIT], depth: gd, note: 'back groove' },
  ];
  const sideL = add({ id: id('side-L'), name: 'Left side', role: 'side', material: style.carcass,
    box: { min: [0, 0, 0], size: [t, H, D] }, faceA: '+x', grain: 1, exposed: true, ops: sideOps(t) });
  const sideR = add({ id: id('side-R'), name: 'Right side', role: 'side', material: style.carcass,
    box: { min: [W - t, 0, 0], size: [t, H, D] }, faceA: '-x', grain: 1, exposed: true, ops: sideOps(W - t) });

  const between = W - 2 * t + 2 * dd - 2 * FIT; // panels captured in the side rabbets
  const bx = t - dd + FIT;
  add({ id: id('bottom'), name: 'Bottom', role: 'bottom', material: style.carcass,
    box: { min: [bx, 0, 0], size: [between, t, D] }, faceA: '+y', grain: 0, exposed: true,
    ops: [{ kind: 'pocket', from: [bx, t, bs], to: [bx + between, t, bs + bt + GFIT], depth: gd, note: 'back groove' }] });
  add({ id: id('stretcher-F'), name: 'Front stretcher', role: 'stretcher', material: style.carcass,
    box: { min: [bx, H - t, D - sw], size: [between, t, sw] }, faceA: '+y', grain: 0, exposed: false, ops: [] });
  add({ id: id('stretcher-R'), name: 'Rear stretcher', role: 'stretcher', material: style.carcass,
    box: { min: [bx, H - t, 0], size: [between, t, sw] }, faceA: '-y', grain: 0, exposed: false,
    ops: [{ kind: 'pocket', from: [bx, H - t, bs], to: [bx + between, H - t, bs + bt + GFIT], depth: gd, note: 'back groove' }] });
  add({ id: id('rail'), name: 'Hanging rail', role: 'rail', material: style.carcass,
    box: { min: [t, H - t - 100, 0], size: [W - 2 * t, 100, bs] }, faceA: '+z', grain: 0, exposed: false, ops: [] });
  const backW = W - 2 * t + 2 * gd - 1, backH = H - 2 * t + 2 * gd - 1;
  add({ id: id('back'), name: 'Back', role: 'back', material: style.back,
    box: { min: [t - gd + 0.5, t - gd + 0.5, bs], size: [backW, backH, bt] }, faceA: '+z', grain: 1, exposed: false,
    ops: opts.backCutouts ?? [] });

  // ---- front layout ---------------------------------------------------------
  const region = inset
    ? { x0: t + style.gap, x1: W - t - style.gap, y0: t + style.gap, y1: H - t - style.gap }
    : { x0: style.endReveal, x1: W - style.endReveal, y0: style.bottomReveal, y1: H - style.topReveal };
  const heights = splitHeights(spec.zones, region.y1 - region.y0 - style.gap * (spec.zones.length - 1), spec.id, warnings);

  let y = region.y0;
  const zoneSpans = spec.zones.map((zone, i) => {
    const span = { zone, y0: y, y1: y + heights[i] };
    y += heights[i] + style.gap;
    return span;
  });

  const hinge = lookup(cat.hinges, style.hinge, 'hinge');
  const pull = lookup(cat.pulls, style.pull, 'pull');
  if (hinge.mount !== style.mount && spec.zones.some((z) => z.type === 'doors'))
    warnings.push(`${spec.id}: hinge "${style.hinge}" is for ${hinge.mount} doors but the style is ${style.mount}`);

  const gripOps = (x0: number, x1: number, y1: number, pullX: number): WorldOp[] => {
    if (style.grip === 'groove')
      return [{ kind: 'pocket', from: [x0, y1 - 20, frontBackZ], to: [x1, y1, frontBackZ], depth: ft - 6, note: 'finger groove' }];
    if (style.grip === 'push' || !pull.holes.length) return [];
    const py = y1 - pull.fromTopEdge;
    const [sx, sy, sz] = pull.size ?? [pull.holes[pull.holes.length - 1] - pull.holes[0] + 30, 12, 30];
    fixtures.push({ kind: 'pull', shape: 'box', name: pull.name, box: { min: [pullX - sx / 2, py - sy / 2, frontBackZ + ft], size: [sx, sy, sz] } });
    return pull.holes.flatMap((o): WorldOp[] => {
      const at: Vec3 = [pullX + o, py, frontBackZ];
      const hole: WorldOp = { kind: 'hole', at, dia: pull.holeDia, depth: pull.holeDepth ?? 0, thru: pull.thru, note: 'pull' };
      // through-bolted pulls: counterbore the screw head flush into the back of the front
      return pull.thru ? [hole, { kind: 'hole', at, dia: 11, depth: 3, note: 'pull screw counterbore' }] : [hole];
    });
  };
  const gripHardware = (n: number) => {
    if (style.grip === 'pull' && pull.holes.length) hw(pull.name, n, pull.buy);
    if (style.grip === 'push') hw('Blum TIP-ON push-to-open (pick door/drawer version)', n);
  };

  zoneSpans.forEach(({ zone, y0, y1 }, zi) => {
    const fz: Vec3 = [0, y0, frontBackZ];
    if (zone.type === 'doors') {
      const xm = (region.x0 + region.x1) / 2;
      const doors = zone.count === 2
        ? [{ x0: region.x0, x1: xm - style.gap / 2, side: 'left' as const }, { x0: xm + style.gap / 2, x1: region.x1, side: 'right' as const }]
        : [{ x0: region.x0, x1: region.x1, side: zone.hinge ?? 'left' }];
      for (const [di, d] of doors.entries()) {
        const dh = y1 - y0;
        const hingeYs = dh > 1000 ? [y0 + 100, (y0 + y1) / 2, y1 - 100] : dh < 300 ? [y0 + 70, y1 - 70] : [y0 + 100, y1 - 100];
        const cupX = d.side === 'left' ? d.x0 + hinge.cupEdgeDistance + hinge.cupDia / 2 : d.x1 - hinge.cupEdgeDistance - hinge.cupDia / 2;
        const dowelX = cupX + (d.side === 'left' ? hinge.dowelOffset : -hinge.dowelOffset);
        const ops: WorldOp[] = [];
        for (const hy of hingeYs) {
          ops.push({ kind: 'hole', at: [cupX, hy, frontBackZ], dia: hinge.cupDia, depth: hinge.cupDepth, note: 'hinge cup' });
          for (const dy of [-hinge.dowelPitch / 2, hinge.dowelPitch / 2])
            ops.push({ kind: 'hole', at: [dowelX, hy + dy, frontBackZ], dia: hinge.dowelDia, depth: hinge.dowelDepth, note: 'hinge dowel' });
          const side = d.side === 'left' ? sideL : sideR;
          const sx = d.side === 'left' ? t : W - t;
          const pz = D - hinge.plate.setbackFromFront - (inset ? s : 0);
          for (const dy of [-hinge.plate.holeSpacing / 2, hinge.plate.holeSpacing / 2])
            side.ops.push({ kind: 'hole', at: [sx, hy + dy, pz], dia: hinge.plate.holeDia, depth: hinge.plate.holeDepth, note: 'hinge plate' });
        }
        const pullX = d.side === 'left' ? d.x1 - (pull.fromOpeningEdge ?? 100) : d.x0 + (pull.fromOpeningEdge ?? 100);
        ops.push(...gripOps(d.x0, d.x1, y1, pullX));
        add({ id: id(`door-${zi + 1}${doors.length > 1 ? 'LR'[di] : ''}`), name: `Door (${d.side} hinge)`, role: 'door',
          material: style.fronts, box: { min: [d.x0, fz[1], fz[2]], size: [d.x1 - d.x0, dh, ft] },
          faceA: '-z', grain: 1, exposed: true, ops });
        hw(hinge.name.split(' + ')[0], hingeYs.length);
        hw(hinge.plate.name, hingeYs.length);
        gripHardware(1);
      }
      return;
    }

    // drawer: front + box + runners
    const ops = gripOps(region.x0, region.x1, y1, (region.x0 + region.x1) / 2);
    add({ id: id(`drawer-${zi + 1}-front`), name: 'Drawer front', role: 'drawerFront', material: style.fronts,
      box: { min: [region.x0, y0, frontBackZ], size: [region.x1 - region.x0, y1 - y0, ft] },
      faceA: '-z', grain: 0, exposed: true, ops });
    gripHardware(1);

    const above = zoneSpans[zi + 1];
    const runnerY = Math.max(t, inset ? y0 - style.gap : y0);
    const ceiling = above ? (above.zone.type === 'drawer' ? Math.max(t, inset ? above.y0 - style.gap : above.y0) : above.y0) : H - t;
    addDrawerBox({ zi, runnerY, ceiling });
  });

  function addDrawerBox({ zi, runnerY, ceiling }: { zi: number; runnerY: number; ceiling: number }) {
    const r = lookup(cat.runners, style.runner, 'runner');
    const ds = mat(style.drawerBox).thickness;
    const bb = mat(style.drawerBottom).thickness;
    if (ds > r.maxSideThickness) warnings.push(`${spec.id}: drawer sides ${ds}mm are thicker than ${r.name} allows (${r.maxSideThickness}mm)`);

    const runnerFront = D - hs - r.frontSetback;
    const backLimit = Math.max(bs + bt + 5, opts.clearFromBack ?? 0);
    const len = [...r.lengths].reverse().find((l) => runnerFront - l >= backLimit);
    if (!len) {
      warnings.push(`${spec.id}: drawer ${zi + 1} has no room for a runner (needs ${r.lengths[0]}mm, has ${Math.round(runnerFront - backLimit)}mm). ` +
        (opts.clearFromBack ? 'The sink drain is in the way: use doors here, or a U-drawer (not built yet).' : 'Cabinet is too shallow.'));
      return;
    }
    const bh = floorTo(ceiling - runnerY - r.topClearance, 5);
    if (bh < 60) { warnings.push(`${spec.id}: drawer ${zi + 1} box would be only ${bh}mm tall; skipped`); return; }

    const LW = W - 2 * t;
    const inner = LW - r.insideWidthDeduction;
    const x0 = t + (LW - inner - 2 * ds) / 2, x1 = x0 + inner + 2 * ds;
    const L = len - r.lengthDeduction;
    const zf = runnerFront, zb = zf - L;
    const y0 = runnerY, y1 = runnerY + bh;
    const rec = r.bottomRecess;
    const rd = ds / 2;                         // rabbet depth for the box front/back
    const df = ds;                             // box front/back use the side material
    const fb = mat(style.drawerBox).thickness;
    const p = `drawer-${zi + 1}`;
    const grooveY: [number, number] = [y0 + rec, y0 + rec + bb + GFIT];

    const boxSide = (x: number, face: '+x' | '-x', name: string) => add({
      id: id(`${p}-side-${name}`), name: `Drawer side ${name}`, role: 'drawerSide', material: style.drawerBox,
      box: { min: [face === '+x' ? x0 : x1 - ds, y0, zb], size: [ds, bh, L] }, faceA: face, grain: 2, exposed: false,
      ops: [
        { kind: 'pocket', from: [x, y0, zf - df - FIT], to: [x, y1, zf], depth: rd, note: 'rabbet for box front' },
        { kind: 'pocket', from: [x, y0, zb], to: [x, y1, zb + df + FIT], depth: rd, note: 'rabbet for box back' },
        { kind: 'pocket', from: [x, grooveY[0], zb], to: [x, grooveY[1], zf], depth: gd, note: 'bottom groove' },
      ],
    });
    boxSide(x0 + ds, '+x', 'L');
    boxSide(x1 - ds, '-x', 'R');

    const midX0 = x0 + ds - rd + FIT / 2, midW = x1 - x0 - 2 * ds + 2 * rd - FIT;
    add({ id: id(`${p}-box-front`), name: 'Drawer box front', role: 'drawerBoxFront', material: style.drawerBox,
      box: { min: [midX0, y0, zf - df], size: [midW, bh, df] }, faceA: '-z', grain: 0, exposed: false,
      ops: [{ kind: 'pocket', from: [midX0, grooveY[0], zf - df], to: [midX0 + midW, grooveY[1], zf - df], depth: gd, note: 'bottom groove' }] });
    const backY0 = y0 + rec + bb;
    add({ id: id(`${p}-box-back`), name: 'Drawer box back', role: 'drawerBack', material: style.drawerBox,
      box: { min: [midX0, backY0, zb], size: [midW, y1 - backY0, df] }, faceA: '-z', grain: 0, exposed: false,
      ops: [x0 + r.rearHook.fromSide, x1 - r.rearHook.fromSide].map((hx): WorldOp => ({
        kind: 'hole', at: [hx, backY0 + r.rearHook.aboveBottomPanel, zb], dia: r.rearHook.dia, depth: r.rearHook.depth, note: 'runner rear hook',
      })) });
    add({ id: id(`${p}-bottom`), name: 'Drawer bottom', role: 'drawerBottom', material: style.drawerBottom,
      box: { min: [x0 + ds - gd + 0.5, y0 + rec, zb], size: [x1 - x0 - 2 * ds + 2 * gd - 1, bb, zf - df + gd - 0.5 - zb] },
      faceA: '+y', grain: null, exposed: false, ops: [] });

    // runner screw holes on the 32mm grid, front hole on the 37mm line
    const hy = runnerY + r.holeAboveRunnerBottom;
    const first = D - hs - r.firstHoleFromFront;
    const steps = Math.floor((len - r.firstHoleFromFront - 20) / 32);
    const holeZ = [first, first - 32 * steps];
    if (len >= 400) holeZ.splice(1, 0, first - 32 * Math.round(steps / 2));
    for (const [side, sx] of [[sideL, t], [sideR, W - t]] as const)
      for (const z of holeZ)
        side.ops.push({ kind: 'hole', at: [sx, hy, z], dia: r.holeDia, depth: r.holeDepth, note: 'runner screw' });
    hw(`${r.name}, ${Math.round(len / 25.4)}" (${len}mm) pair + locking devices`, 1);
  }

  return { parts, hardware, fixtures, warnings, frontDepth: inset ? 0 : ft };
}

function splitHeights(zones: Zone[], avail: number, cab: string, warnings: string[]): number[] {
  const fixed = zones.reduce((a, z) => a + (typeof z.size === 'number' ? z.size : 0), 0);
  const fills = zones.filter((z) => z.size === 'fill').length;
  if (fills) {
    const each = (avail - fixed) / fills;
    if (each < 80) throw new Error(`${cab}: fixed front sizes leave only ${Math.round(each)}mm for the 'fill' fronts`);
    return zones.map((z) => (typeof z.size === 'number' ? z.size : each));
  }
  if (Math.abs(fixed - avail) > 0.5) {
    warnings.push(`${cab}: front sizes add up to ${fixed.toFixed(1)}mm but ${avail.toFixed(1)}mm is available; scaled to fit`);
    return zones.map((z) => (z.size as number) * (avail / fixed));
  }
  return zones.map((z) => z.size as number);
}
