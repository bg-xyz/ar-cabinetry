// Writes the job package: everything a shop needs, from one design.
//
//   parts.json        3D parts (what the AR app and preview draw)
//   sheets/*.dxf      layered CNC files, one per sheet
//   cutlist.csv       every part, size, sheet
//   jobsheet.html     printable: hardware, cut list, sheet maps, warnings, layer legend
//   preview.html      spin-around 3D view (three.js)

import { mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { flatten } from './flatten.ts';
import { nest, placeOp } from './nest.ts';
import type { Sheet } from './nest.ts';
import { sheetDxf, layerFor } from './dxf.ts';
import { lookup } from './catalog.ts';
import { fmtBoth } from './units.ts';
import type { Catalog, Design, FlatPart, Part, Style } from './types.ts';

const TEXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'textures');
const MAPS = ['color', 'normal', 'roughness'] as const;

// Which finish a part shows. Drawer boxes and backs stay natural birch whatever the style.
export function finishFor(p: Part, s: Style): string {
  if (p.role === 'door' || p.role === 'drawerFront') return s.frontFinish;
  if (p.role === 'top') return s.topFinish;
  if (p.role.startsWith('drawer') || p.role === 'back') return 'birch';
  return s.carcassFinish;
}

export interface JobOptions { units: 'mm' | 'in'; toolDia: number }

export interface Job { flat: FlatPart[]; sheets: Sheet[]; warnings: string[]; layers: string[] }

export function buildJob(design: Design, cat: Catalog, o: JobOptions): Job {
  const warnings = [...design.warnings];
  const overcut = o.toolDia / 2 + 1;
  const flat = design.parts.map((p) => flatten(p, cat, overcut));
  const sheets = nest(flat, cat, { margin: 15, spacing: o.toolDia + 6 }, warnings);
  const layers = new Set<string>();
  for (const sh of sheets) for (const l of sheetDxf(sh, o.units).layers) layers.add(l);
  return { flat, sheets, warnings, layers: [...layers].sort() };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

export function writeJob(dir: string, design: Design, job: Job, cat: Catalog, o: JobOptions, viewerTemplate: string): string[] {
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(join(dir, 'sheets'), { recursive: true });
  const written: string[] = [];
  const put = (name: string, body: string) => { writeFileSync(join(dir, name), body); written.push(name); };

  // 3D model for the preview and the AR app: boxes + which way the grain and plies run
  const finishes = Object.fromEntries([...new Set(design.parts.map((p) => finishFor(p, design.style)))]
    .map((f) => [f, lookup(cat.finishes, f, 'finish')]));
  const textureKeys = [...new Set(Object.values(finishes).flatMap((f) => [f.texture, f.edge]).filter((t): t is string => !!t))];
  const parts3d = {
    name: design.spec.name, units: 'mm', overall: design.overall, style: design.style.name,
    parts: design.parts.map((p) => ({
      id: p.id, name: p.name, role: p.role, material: p.material, box: p.box, exposed: p.exposed,
      finish: finishFor(p, design.style),
      grainAxis: p.grain,
      thicknessAxis: ({ x: 0, y: 1, z: 2 } as const)[p.faceA[1] as 'x' | 'y' | 'z'],
      plies: lookup(cat.materials, p.material, 'material').plies ?? 7,
    })),
    fixtures: design.fixtures,
    finishes,
    textures: Object.fromEntries(textureKeys.map((k) => [k, Object.fromEntries(MAPS.map((m) => [m, `textures/${k}/${m}.jpg`]))])),
  };
  put('parts.json', JSON.stringify(parts3d, null, 1));
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

  const rows = job.flat.map((p) => [p.id, p.name, lookup(cat.materials, p.material, 'material').name, p.thickness.toFixed(1),
    p.length.toFixed(1), p.width.toFixed(1), (p.length / 25.4).toFixed(3), (p.width / 25.4).toFixed(3),
    p.grainLocked ? 'yes' : 'no', sheetOf.get(p.id) ?? '']);
  put('cutlist.csv', [['id', 'name', 'material', 'thickness_mm', 'length_mm', 'width_mm', 'length_in', 'width_in', 'grain_matters', 'sheet'], ...rows]
    .map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n');

  put('jobsheet.html', jobSheet(design, job, cat, o, rows));
  put('preview.html', viewerTemplate.replace('/*PARTS_JSON*/null', () => JSON.stringify(embedded)));
  return written;
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
${job.warnings.length ? `<h2>Warnings</h2><div class="warn"><ul>${job.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
<h2>Check before cutting</h2><div class="verify"><ul>${[...verify].map((v) => `<li>${v}</li>`).join('')}</ul></div>
<h2>Hardware</h2><table><tr><th>Qty</th><th>Item</th><th>Buy</th></tr>
${design.hardware.map((h) => `<tr><td>${h.qty}</td><td>${esc(h.item)}</td><td>${h.buy ? `<a href="${esc(h.buy)}">link</a>` : ''}</td></tr>`).join('')}</table>
<h2>CNC layers</h2><p>Each layer is one toolpath. Suggested order for manual tool changes: all <code>DRILL_*</code> (drill bits), then all <code>POCKET_*</code> (one end mill), then <code>CUT_INSIDE</code>, then <code>CUT_OUTSIDE</code> last.</p>
<table><tr><th>Layer</th><th>Toolpath</th></tr>${job.layers.map((l) => `<tr><td><code>${l}</code></td><td>${describe(l)}</td></tr>`).join('')}</table>
<h2>Sheets</h2><div class="sheets">${job.sheets.map((sh, i) => `<figure>${sheetSvg(sh)}<figcaption>Sheet ${i + 1}: ${esc(lookup(cat.materials, sh.material, 'material').name)} (${sh.size[0]} &times; ${sh.size[1]}), ${sh.placements.length} parts</figcaption></figure>`).join('')}</div>
<h2>Cut list</h2><table><tr><th>Id</th><th>Part</th><th>Material</th><th>T mm</th><th>L mm</th><th>W mm</th><th>L in</th><th>W in</th><th>Grain matters</th><th>Sheet</th></tr>
${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
</body></html>`;
}
