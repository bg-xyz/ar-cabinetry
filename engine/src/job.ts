// Writes the job package: everything a shop needs, from one design.
//
//   parts.json        3D parts (what the AR app and preview draw)
//   sheets/*.dxf      layered CNC files, one per sheet
//   fit-test.dxf      joint-fit coupon: cut it first, tune dadoFit / grooveFit
//   cutlist.csv       every part, size, sheet
//   jobsheet.html     printable: hardware, cut list, sheet maps, warnings, layer legend
//   preview.html      spin-around 3D view (three.js)

import { mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeOp, sheetYield } from './nest.ts';
import { cutSheets } from './sheets.ts';
import type { Sheet } from './nest.ts';
import { sheetDxf, layerFor } from './dxf.ts';
import { fitTest } from './fittest.ts';
import { lookup } from './catalog.ts';
import { fmtBoth } from './units.ts';
import { model3d, TEXTURE_MAPS } from './model3d.ts';
import type { Catalog, Design, FlatPart } from './types.ts';

const TEXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'textures');
const CATALOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'catalog');
const MAPS = TEXTURE_MAPS;

export interface JobOptions { units: 'mm' | 'in'; toolDia: number }

export interface Quote {
  note: string;
  sheets: { material: string; name: string; size: [number, number]; count: number; avgYield: number; each: number; total: number }[];
  hardware: { item: string; qty: number; each: number | null; total: number }[];
  materialsTotal: number;
  hardwareTotal: number;
  cnc: { sheets: number; cutMeters: number; holes: number; pockets: number; tools: string[] };
}

export interface Job { flat: FlatPart[]; sheets: Sheet[]; warnings: string[]; matched: string[]; layers: string[]; quote: Quote }

export function buildJob(design: Design, cat: Catalog, o: JobOptions): Job {
  const warnings = [...design.warnings];
  const { flat, sheets, matched } = cutSheets(design, cat, o.toolDia, warnings);
  const layers = new Set<string>();
  for (const sh of sheets) for (const l of sheetDxf(sh, o.units).layers) layers.add(l);
  return { flat, sheets, warnings, matched, layers: [...layers].sort(), quote: quote(design, sheets, cat, [...layers]) };
}

// What a shop needs to price the job: sheets, hardware, and how much machining there is.
function quote(design: Design, sheets: Sheet[], cat: Catalog, layers: string[]): Quote {
  const prices = JSON.parse(readFileSync(join(CATALOG, 'prices.json'), 'utf8')) as {
    note: string; materials: Record<string, { sheet: number; longSheet?: number }>; hardware: { match: string; each: number }[] };
  const groups = new Map<string, Quote['sheets'][number]>();
  for (const sh of sheets) {
    const m = lookup(cat.materials, sh.material, 'material');
    const long = !!m.longSheet && sh.size[0] === m.longSheet[0] && sh.size[1] === m.longSheet[1];
    const key = `${sh.material}${long ? '@long' : ''}`;
    const each = (long ? prices.materials[sh.material]?.longSheet : prices.materials[sh.material]?.sheet) ?? 0;
    const g = groups.get(key) ?? { material: sh.material, name: m.name, size: sh.size, count: 0, avgYield: 0, each, total: 0 };
    g.avgYield = (g.avgYield * g.count + sheetYield(sh)) / (g.count + 1);
    g.count++;
    g.total = g.count * each;
    groups.set(key, g);
  }
  const hardware = design.hardware.map((h) => {
    const p = prices.hardware.find((x) => h.item.toLowerCase().includes(x.match.toLowerCase()));
    return { item: h.item, qty: h.qty, each: p?.each ?? null, total: (p?.each ?? 0) * h.qty };
  });
  let cut = 0, holes = 0, pockets = 0;
  for (const sh of sheets) for (const pl of sh.placements) {
    cut += 2 * (pl.w + pl.h);
    for (const op of pl.part.ops) {
      if (op.kind === 'hole') holes++;
      else if (op.kind === 'pocket') pockets++;
      else if (op.kind === 'cutRect') cut += 2 * (op.x1 - op.x0 + op.y1 - op.y0);
      else cut += Math.PI * op.dia;
    }
  }
  const tools = [...new Set(layers.filter((l) => l.startsWith('DRILL_')).map((l) => `${l.split('_')[1].replace('p', '.')}mm drill`))];
  if (layers.some((l) => l.startsWith('POCKET_'))) tools.push('end mill (pockets)');
  tools.push('compression bit (cut-outs + profiles)');
  const sheetsOut = [...groups.values()];
  return {
    note: prices.note, sheets: sheetsOut, hardware,
    materialsTotal: sheetsOut.reduce((a, s) => a + s.total, 0),
    hardwareTotal: hardware.reduce((a, h) => a + h.total, 0),
    cnc: { sheets: sheets.length, cutMeters: cut / 1000, holes, pockets, tools },
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export const TEXTURE_DIR = TEXTURES;
export { model3d, TEXTURE_MAPS };

export function writeJob(dir: string, design: Design, job: Job, cat: Catalog, o: JobOptions, viewerTemplate: string): string[] {
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(join(dir, 'sheets'), { recursive: true });
  const written: string[] = [];
  const put = (name: string, body: string) => { writeFileSync(join(dir, name), body); written.push(name); };

  const parts3d = model3d(design, cat);
  const textureKeys = Object.keys(parts3d.textures);
  put('parts.json', JSON.stringify(parts3d, null, 1));
  put('quote.json', JSON.stringify(job.quote, null, 1));
  for (const k of textureKeys) {
    mkdirSync(join(dir, 'textures', k), { recursive: true });
    for (const m of MAPS) copyFileSync(join(TEXTURES, k, `${m}.jpg`), join(dir, 'textures', k, `${m}.jpg`));
  }
  // the preview embeds its textures so it works by double-click (browsers block file:// textures in WebGL)
  const allKeys = [...new Set(Object.values(cat.finishes).flatMap((f) => [f.texture, f.edge]).filter((t): t is string => !!t))];
  const embedded = {
    ...parts3d,
    finishes: cat.finishes,
    textures: Object.fromEntries(allKeys.map((k) => [k, Object.fromEntries(MAPS.map((m) =>
      [m, `data:image/jpeg;base64,${readFileSync(join(TEXTURES, k, `${m}.jpg`)).toString('base64')}`]))])),
  };

  const sheetOf = new Map<string, string>();
  job.sheets.forEach((sh, i) => {
    const name = `sheets/sheet-${String(i + 1).padStart(2, '0')}-${sh.material}.dxf`;
    put(name, sheetDxf(sh, o.units).dxf);
    for (const pl of sh.placements) sheetOf.set(pl.part.id, `${i + 1}`);
  });

  const ft = fitTest(design, cat);
  put('fit-test.dxf', sheetDxf(ft.sheet, o.units, ft.labels).dxf);

  const rows = job.flat.map((p) => [p.id, p.name, lookup(cat.materials, p.material, 'material').name, p.thickness.toFixed(1),
    p.length.toFixed(1), p.width.toFixed(1), (p.length / 25.4).toFixed(3), (p.width / 25.4).toFixed(3),
    p.grainLocked ? 'yes' : 'no', sheetOf.get(p.id) ?? '']);
  put('cutlist.csv', [['id', 'name', 'material', 'thickness_mm', 'length_mm', 'width_mm', 'length_in', 'width_in', 'grain_matters', 'sheet'], ...rows]
    .map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n');

  put('jobsheet.html', jobSheet(design, job, cat, o, rows));
  put('preview.html', viewerTemplate.replace('/*PARTS_JSON*/null', () => JSON.stringify(embedded)));
  return written;
}

const usd = (v: number) => `$${v.toFixed(v < 10 ? 2 : 0)}`;
function summary(q: Quote): string {
  return `<table><tr><th>Sheets</th><th>Size (mm)</th><th>Qty</th><th>Avg. yield</th><th>Each</th><th>Total</th></tr>
${q.sheets.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.size[0]} &times; ${s.size[1]}</td><td>${s.count}</td><td>${Math.round(s.avgYield * 100)}%</td><td>${usd(s.each)}</td><td>${usd(s.total)}</td></tr>`).join('')}
<tr><th colspan="5">Plywood</th><th>${usd(q.materialsTotal)}</th></tr>
<tr><th colspan="5">Hardware (see list below)</th><th>${usd(q.hardwareTotal)}</th></tr>
<tr><th colspan="5">Materials + hardware estimate</th><th>${usd(q.materialsTotal + q.hardwareTotal)}</th></tr></table>
<p>CNC: <b>${q.cnc.sheets}</b> sheets, <b>${q.cnc.cutMeters.toFixed(1)} m</b> of through-cuts, <b>${q.cnc.holes}</b> holes, <b>${q.cnc.pockets}</b> pockets. Bits: ${q.cnc.tools.map(esc).join(', ')}.
<br><small>${esc(q.note)} Labour, finishing and machine time are not included.</small></p>`;
}

function sheetSvg(sh: Sheet): string {
  const [SX, SY] = sh.size;
  const s = 560 / Math.max(SX, SY);
  const Y = (y: number) => (SY - y) * s; // DXF y-up -> SVG y-down
  const out: string[] = [`<svg viewBox="0 0 ${SX * s} ${SY * s}" width="${SX * s}" height="${SY * s}" class="sheet">`,
    `<rect x="0" y="0" width="${SX * s}" height="${SY * s}" class="stock"/>`];
  for (const pl of sh.placements) {
    out.push(`<rect x="${pl.x * s}" y="${Y(pl.y + pl.h)}" width="${pl.w * s}" height="${pl.h * s}" class="part"/>`);
    for (const raw of pl.part.ops) {
      const op = placeOp(raw, pl);
      const cls = layerFor(op).split('_')[0].toLowerCase();
      if (op.kind === 'hole' || op.kind === 'cutCircle') out.push(`<circle cx="${op.x * s}" cy="${Y(op.y)}" r="${Math.max(op.dia / 2 * s, 0.8)}" class="${cls}"/>`);
      else out.push(`<rect x="${op.x0 * s}" y="${Y(op.y1)}" width="${(op.x1 - op.x0) * s}" height="${(op.y1 - op.y0) * s}" class="${cls}"/>`);
    }
    out.push(`<text x="${pl.x * s + 3}" y="${Y(pl.y + pl.h) + 10}">${esc(pl.part.id)}</text>`);
  }
  out.push('</svg>');
  return out.join('');
}

function jobSheet(design: Design, job: Job, cat: Catalog, o: JobOptions, rows: string[][]): string {
  const ov = design.overall;
  const verify = new Set<string>();
  const st = design.style;
  for (const [table, id] of [[cat.hinges, st.hinge], [cat.runners, st.runner], [cat.pulls, st.pull]] as const) {
    const v = (table as Record<string, { name: string; verify?: string }>)[id];
    if (v?.verify) verify.add(`<b>${esc(v.name)}</b>: ${esc(v.verify)}`);
  }
  for (const m of new Set(design.parts.map((p) => p.material))) {
    const mm = cat.materials[m];
    if (mm.verify) verify.add(`<b>${esc(mm.name)}</b> (${mm.thickness}mm): ${esc(mm.verify)}`);
  }
  verify.add(`<b>Joint fit</b>: cut <code>fit-test.dxf</code> first, on an offcut. Slide a piece of each sheet into its strip: the slot it takes with light hand pressure is your fit (now dados +${st.dadoFit}mm, grooves +${st.grooveFit}mm, panel ends ${st.depthFit}mm short of the dado bottom for glue). Plywood varies sheet to sheet; glue swells the joint, so err loose.`);
  const layerHelp: Record<string, string> = {
    SHEET: 'sheet outline, reference only', LABELS: 'part ids, reference only',
    CUT_OUTSIDE: 'profile OUTSIDE, through, with tabs; run LAST', CUT_INSIDE: 'profile INSIDE, through (sink, faucet, plumbing holes)',
  };
  const mm = (s: string) => s.replace('p', '.');
  const describe = (l: string) => {
    if (layerHelp[l]) return layerHelp[l];
    const [kind, size, depth] = l.split('_');
    if (kind === 'DRILL') return `drill ${mm(size)}mm holes, ${depth === 'THRU' ? 'through (into spoilboard)' : `${mm(depth.slice(1))}mm deep`}`;
    return `pocket ${mm(size.slice(1))}mm deep (end mill)`;
  };

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(design.spec.name)} - job sheet</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#222;max-width:1200px}
h1{margin:0 0 4px}h2{margin-top:28px;border-bottom:2px solid #c99a5b;padding-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f4ede1}
.warn{background:#fff3cd;border:1px solid #e0c060;padding:8px 12px;border-radius:6px}
.verify{background:#eef4ff;border:1px solid #9bb5e8;padding:8px 12px;border-radius:6px}
.sheets{display:flex;flex-wrap:wrap;gap:18px}.sheets figure{margin:0}
svg.sheet .stock{fill:#f7f1e6;stroke:#999}svg.sheet .part{fill:#e8d3a6;stroke:#5a4630;stroke-width:.8}
svg.sheet .pocket{fill:#b98d52;opacity:.75}svg.sheet .drill{fill:#2a5db0}svg.sheet .cut{fill:#fff;stroke:#c00}
svg.sheet text{font-size:8px;fill:#333}code{background:#f2f2f2;padding:1px 4px;border-radius:3px}
</style></head><body>
<h1>${esc(design.spec.name)}</h1>
<div>Style: <b>${esc(st.name)}</b> (${st.mount}${st.mount === 'inset' && st.insetSetback ? `, fronts recessed ${st.insetSetback}mm` : ''}, grip: ${st.grip}) &middot;
Overall ${fmtBoth(ov.width)} W &times; ${fmtBoth(ov.height)} H &times; ${fmtBoth(ov.depth)} D &middot; hung with the carcass bottom ${fmtBoth(ov.elevation)} above the floor</div>
<div>CNC files: ${job.sheets.length} sheet(s), units <b>${o.units}</b>, laid out for a ${o.toolDia}mm cutter. Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.</div>
<h2>Job summary</h2>${summary(job.quote)}
<h2>Grain</h2><p>${st.grainMatch === 'off' ? 'Not matched: every part nested on its own for the best yield.'
  : `Matched ${st.grainMatch === 'waterfall' ? '(waterfall: vertical grain flowing down each stack)' : '(across: horizontal grain flowing from front to front)'}. Matched parts sit side by side on the sheet in the order they hang; keep them in sequence and don't swap them.`}</p>
${job.matched.length ? `<ul>${job.matched.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
${job.warnings.length ? `<h2>Warnings</h2><div class="warn"><ul>${job.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
<h2>Check before cutting</h2><div class="verify"><ul>${[...verify].map((v) => `<li>${v}</li>`).join('')}</ul></div>
<h2>Hardware</h2><table><tr><th>Qty</th><th>Item</th><th>Est.</th><th>Buy</th></tr>
${job.quote.hardware.map((h, i) => `<tr><td>${h.qty}</td><td>${esc(h.item)}</td><td>${h.each === null ? '' : usd(h.total)}</td><td>${design.hardware[i].buy ? `<a href="${esc(design.hardware[i].buy!)}">link</a>` : ''}</td></tr>`).join('')}</table>
<h2>CNC layers</h2><p>Each layer is one toolpath. Suggested order for manual tool changes: all <code>DRILL_*</code> (drill bits), then all <code>POCKET_*</code> (one end mill), then <code>CUT_INSIDE</code>, then <code>CUT_OUTSIDE</code> last.</p>
<table><tr><th>Layer</th><th>Toolpath</th></tr>${job.layers.map((l) => `<tr><td><code>${l}</code></td><td>${describe(l)}</td></tr>`).join('')}</table>
<h2>Sheets</h2><div class="sheets">${job.sheets.map((sh, i) => `<figure>${sheetSvg(sh)}<figcaption>Sheet ${i + 1}: ${esc(lookup(cat.materials, sh.material, 'material').name)} (${sh.size[0]} &times; ${sh.size[1]}), ${sh.placements.length} parts</figcaption></figure>`).join('')}</div>
<h2>Cut list</h2><table><tr><th>Id</th><th>Part</th><th>Material</th><th>T mm</th><th>L mm</th><th>W mm</th><th>L in</th><th>W in</th><th>Grain matters</th><th>Sheet</th></tr>
${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
</body></html>`;
}
