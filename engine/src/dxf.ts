// Minimal R12 ASCII DXF writer. One file per sheet. Layer names carry the
// operation and depth so a VCarve toolpath template can be applied by layer:
//
//   DRILL_5_D13        5mm holes, 13mm deep   (drill bit)
//   DRILL_8_D11        8mm hinge dowel holes  (drill bit)
//   POCKET_D13         35mm hinge cups etc.   (end mill, pocket)
//   POCKET_D6          dados, rabbets, grooves (end mill, pocket)
//   CUT_INSIDE         through cut-outs       (profile, inside)
//   CUT_OUTSIDE        part outlines          (profile, outside, tabs) - last
//   LABELS, SHEET      reference only, no toolpath
//
// Names use 'p' for a decimal point (R12 layer names allow no '.').

import { placeOp } from './nest.ts';
import type { Sheet } from './nest.ts';
import type { FlatOp } from './types.ts';

const num = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', 'p');
export const DRILL_MAX_DIA = 10; // larger holes are pocketed with an end mill

export function layerFor(op: FlatOp): string {
  switch (op.kind) {
    case 'hole': return op.dia <= DRILL_MAX_DIA ? `DRILL_${num(op.dia)}_D${num(op.depth)}` : `POCKET_D${num(op.depth)}`;
    case 'pocket': return `POCKET_D${num(op.depth)}`;
    case 'cutRect': case 'cutCircle': return 'CUT_INSIDE';
  }
}

const COLORS: Record<string, number> = { SHEET: 8, LABELS: 3, CUT_OUTSIDE: 7, CUT_INSIDE: 1 };
const colorFor = (layer: string) => COLORS[layer] ?? (layer.startsWith('DRILL') ? 5 : 4);

export function sheetDxf(sheet: Sheet, units: 'mm' | 'in'): { dxf: string; layers: string[] } {
  const k = units === 'in' ? 1 / 25.4 : 1;
  const f = (v: number) => (v * k).toFixed(4);
  const ents: string[] = [];
  const layers = new Set<string>(['SHEET', 'LABELS', 'CUT_OUTSIDE']);

  const poly = (layer: string, pts: [number, number][]) => {
    layers.add(layer);
    ents.push(`0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n1\n10\n0\n20\n0\n30\n0`);
    for (const [x, y] of pts) ents.push(`0\nVERTEX\n8\n${layer}\n10\n${f(x)}\n20\n${f(y)}\n30\n0`);
    ents.push(`0\nSEQEND\n8\n${layer}`);
  };
  const rect = (layer: string, x0: number, y0: number, x1: number, y1: number) => poly(layer, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const circle = (layer: string, x: number, y: number, d: number) => {
    layers.add(layer);
    ents.push(`0\nCIRCLE\n8\n${layer}\n10\n${f(x)}\n20\n${f(y)}\n30\n0\n40\n${f(d / 2)}`);
  };
  const text = (x: number, y: number, h: number, s: string) =>
    ents.push(`0\nTEXT\n8\nLABELS\n10\n${f(x)}\n20\n${f(y)}\n30\n0\n40\n${f(h)}\n1\n${s}`);

  rect('SHEET', 0, 0, sheet.size[0], sheet.size[1]);
  for (const pl of sheet.placements) {
    rect('CUT_OUTSIDE', pl.x, pl.y, pl.x + pl.w, pl.y + pl.h);
    for (const raw of pl.part.ops) {
      const op = placeOp(raw, pl);
      const layer = layerFor(op);
      if (op.kind === 'hole' || op.kind === 'cutCircle') circle(layer, op.x, op.y, op.dia);
      else rect(layer, op.x0, op.y0, op.x1, op.y1);
    }
    text(pl.x + 8, pl.y + 8, Math.min(18, pl.h / 4), pl.part.id);
  }

  const layerTable = [...layers].map((l) => `0\nLAYER\n2\n${l}\n70\n0\n62\n${colorFor(l)}\n6\nCONTINUOUS`).join('\n');
  const dxf = [
    `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n${units === 'in' ? 1 : 4}\n0\nENDSEC`,
    `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layers.size}\n${layerTable}\n0\nENDTAB\n0\nENDSEC`,
    `0\nSECTION\n2\nENTITIES\n${ents.join('\n')}\n0\nENDSEC`,
    '0\nEOF\n',
  ].join('\n');
  return { dxf, layers: [...layers] };
}
