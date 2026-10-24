// Front elevations of every build across a range of walls, on one page: the synthetic design review.
// Each piece is drawn to scale from the parts the engine made, with its drawer heights, the bottom-to-top
// ratio of each stack and anything the design critic flags. Run: node tools/elevations.ts [out.html]
import { writeFileSync } from 'node:fs';
import { loadCatalog } from '../src/load.ts';
import { designRun } from '../src/run.ts';
import { plan, PROJECTS } from '../src/planner.ts';
import { critique } from '../src/critic.ts';
import type { Design } from '../src/types.ts';

const IN = 25.4;
const cat = loadCatalog();
const out = process.argv[2] ?? 'elevations.html';
const walls = [34, 44, 50, 62, 74, 88, 110];
const S = 0.12; // px per mm

const fill: Record<string, string> = {
  drawerFront: '#dcc19a', door: '#dcc19a', side: '#c8a676', endPanel: '#d4b688', top: '#b9935f',
  plinth: '#3b342c', bottom: '#c8a676', stretcher: '#c8a676', shelf: '#c8a676', back: '#a88a60',
};

function svg(d: Design): string {
  const vis = d.parts.filter((p) => fill[p.role]).sort((a, b) => (a.box.min[2] + a.box.size[2]) - (b.box.min[2] + b.box.size[2]));
  const xs = vis.flatMap((p) => [p.box.min[0], p.box.min[0] + p.box.size[0]]);
  const legs = d.fixtures.filter((f) => f.kind === 'leg' && f.leg);
  const ys = [...vis.flatMap((p) => [p.box.min[1], p.box.min[1] + p.box.size[1]]), ...legs.map((f) => f.leg!.foot[1])];
  const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys, 0), y1 = Math.max(...ys) + 40;
  const W = (x1 - x0) * S, H = (y1 - y0) * S;
  const X = (x: number) => ((x - x0) * S).toFixed(1), Y = (y: number) => ((y1 - y) * S).toFixed(1);
  const rect = (b: { min: number[]; size: number[] }, f: string, extra = '') =>
    `<rect x="${X(b.min[0])}" y="${Y(b.min[1] + b.size[1])}" width="${(b.size[0] * S).toFixed(1)}" height="${(b.size[1] * S).toFixed(1)}" fill="${f}" ${extra}/>`;
  const body = [
    `<line x1="0" x2="${W}" y1="${Y(y0)}" y2="${Y(y0)}" stroke="#999" stroke-width="1"/>`,
    ...legs.map((f) => {
      const l = f.leg!, a = l.topDia / 2, b = l.bottomDia / 2;
      return `<polygon points="${X(l.top[0] - a)},${Y(l.top[1])} ${X(l.top[0] + a)},${Y(l.top[1])} ${X(l.foot[0] + b)},${Y(l.foot[1])} ${X(l.foot[0] - b)},${Y(l.foot[1])}" fill="#8a6a45"/>`;
    }),
    ...vis.map((p) => rect(p.box, fill[p.role], p.role === 'drawerFront' || p.role === 'door' ? 'stroke="#6b5435" stroke-width="0.5"' : '')),
    ...d.fixtures.filter((f) => f.kind === 'pull').map((f) => rect(f.box, '#1c1c1c')),
    ...d.fixtures.filter((f) => f.kind === 'sink' || f.kind === 'faucet').map((f) => rect(f.box, '#eeeeea', 'stroke="#888" stroke-width="0.5"')),
  ];
  return `<svg width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}">${body.join('')}</svg>`;
}

function facts(d: Design): string {
  const cabs = [...new Set(d.parts.filter((p) => p.role === 'side').map((p) => p.cabinet))];
  return cabs.map((c) => {
    const w = d.parts.filter((p) => p.cabinet === c && p.role === 'side').map((p) => p.box.min[0]);
    const width = Math.max(...w) - Math.min(...w) + 18;
    const hs = d.parts.filter((p) => p.cabinet === c && p.role === 'drawerFront').sort((a, b) => a.box.min[1] - b.box.min[1]).map((p) => p.box.size[1]);
    const ratio = hs.length > 1 ? ` (bottom/top ${(hs[0] / hs[hs.length - 1]).toFixed(2)})` : '';
    return `${c} ${(width / IN).toFixed(1)}"${hs.length ? ': ' + hs.map((h) => (h / IN).toFixed(2)).reverse().join(' / ') + ratio : ''}`;
  }).join('<br>');
}

const cards: string[] = [];
let flaws = 0;
for (const project of PROJECTS) for (const L of walls) for (const rhythm of ['golden', 'even'] as const) {
  let p;
  try { p = plan({ project, wallLength: L * IN, wallHeight: 96 * IN, style: { rhythm } }); } catch { continue; }
  if (rhythm === 'even' && L !== 62) continue; // one even example per build, for comparison
  const d = designRun(p.spec, cat);
  const f = critique(d);
  flaws += f.length;
  cards.push(`<figure class="${f.length ? 'bad' : ''}">${svg(d)}<figcaption><b>${d.spec.name}</b> · ${L}" wall · ${rhythm}<br>${facts(d)}${f.map((x) => `<br><span class="flaw">${x.message}</span>`).join('')}</figcaption></figure>`);
}
writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Plywise elevations</title>
<style>body{font:12px/1.4 system-ui;background:#f4f1ec;margin:16px;color:#222}main{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end}
figure{margin:0;background:#fff;padding:10px;border-radius:6px}figure.bad{outline:2px solid #c33}.flaw{color:#c33}figcaption{max-width:420px}</style>
<h1>Elevations: ${cards.length} designs, ${flaws} critic flags</h1><main>${cards.join('')}</main>`);
console.log(`${cards.length} designs, ${flaws} critic flags -> ${out}`);
