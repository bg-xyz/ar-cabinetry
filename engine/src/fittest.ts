// The fit-test coupon: cut it first, on an offcut. One strip per board thickness that gets
// jointed, each with six slots from +0.1 to +0.6mm over the board's catalog thickness. Slide a
// piece of each real sheet in: the slot it goes into with light hand pressure is that sheet's
// fit. Set it as dadoFit / grooveFit (or correct the measured thickness in the catalog).

import { lookup } from './catalog.ts';
import type { Sheet } from './nest.ts';
import type { Catalog, Design, FlatOp, FlatPart } from './types.ts';

const FITS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
const L = 350, W = 70, PITCH = 45, SLOT_LEN = 45, MARGIN = 15, FIRST = 100; // room on the left for the part label

export function fitTest(design: Design, cat: Catalog): { sheet: Sheet; labels: { x: number; y: number; h: number; s: string }[] } {
  const st = design.style;
  const mat = (id: string) => lookup(cat.materials, id, 'material');
  const used = new Set(design.parts.map((p) => p.role));
  const rows: { board: string; fit: number; depth: number; what: string }[] = [
    { board: st.carcass, fit: st.dadoFit, depth: st.dadoDepth, what: 'dados + rabbets' },
    { board: st.back, fit: st.grooveFit, depth: st.grooveDepth, what: 'back grooves' },
  ];
  if (used.has('drawerSide')) rows.push(
    { board: st.drawerBox, fit: st.dadoFit, depth: mat(st.drawerBox).thickness / 2, what: 'drawer box rabbets' },
    { board: st.drawerBottom, fit: st.grooveFit, depth: st.grooveDepth, what: 'drawer bottom grooves' });
  // one strip per distinct board + depth
  const seen = new Set<string>();
  const strips = rows.filter((r) => { const k = `${r.board}@${r.depth}`; if (seen.has(k)) return false; seen.add(k); return true; });

  const placements: Sheet['placements'] = [];
  const labels: { x: number; y: number; h: number; s: string }[] = [];
  strips.forEach((r, i) => {
    const t = mat(r.board).thickness;
    const ops: FlatOp[] = FITS.map((f, k) => {
      const cx = FIRST + k * PITCH;
      // slots run in from the bottom edge so a board slides in from the side
      return { kind: 'pocket', x0: cx - (t + f) / 2, y0: -5, x1: cx + (t + f) / 2, y1: SLOT_LEN, depth: r.depth, note: `fit +${f}` };
    });
    const part: FlatPart = { id: `FIT-${i + 1}`, name: `Fit test ${mat(r.board).name}`, material: st.carcass,
      thickness: mat(st.carcass).thickness, length: L, width: W, grainLocked: false, ops };
    const y = MARGIN + i * (W + MARGIN);
    placements.push({ part, x: MARGIN, y, rotated: false, w: L, h: W });
    FITS.forEach((f, k) => labels.push({ x: MARGIN + FIRST + k * PITCH - 8, y: y + SLOT_LEN + 4, h: 5, s: `+${f}` }));
    labels.push({ x: MARGIN + 8, y: y + W - 10, h: 5, s: `${t}mm ${r.what}, now +${r.fit}` });
  });
  return { sheet: { material: st.carcass, size: [L + 2 * MARGIN, strips.length * (W + MARGIN) + MARGIN], placements }, labels };
}
