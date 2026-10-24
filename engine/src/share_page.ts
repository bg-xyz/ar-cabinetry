// Builds the share page, plywise.xyz/d/#<design>: the 3D viewer, but it designs at load time from
// the design in the link (base64url JSON of a RunSpec, finishes included), with the same engine the
// apps run (dist/plywise-engine.js, from `npm run bundle`). No server, nothing personal in the link.
//
//   node src/share_page.ts [outDir]      default ../site/d
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEXTURE_MAPS } from './model3d.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, '..', '..', 'site', 'd');
const engine = join(here, '..', 'dist', 'plywise-engine.js');
const textures = join(here, '..', 'textures');
const sample = readFileSync(join(here, '..', 'specs', 'dresser-60-walnut.json'), 'utf8');

const loader = `(() => {
  // the design is in the link: plywise.xyz/d/#<base64url JSON>; without one, a sample
  addEventListener('hashchange', () => location.reload());
  let spec = ${sample.trim()};
  try {
    if (location.hash.length > 1) {
      const b = location.hash.slice(1).replace(/-/g, '+').replace(/_/g, '/');
      spec = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))));
    }
  } catch (e) { console.warn('Plywise: could not read the design in this link', e); }
  window.__spec = spec;   // "Edit with any AI" copies it
  const m = JSON.parse(Plywise.design(JSON.stringify(spec)));
  if (m.error) throw new Error(m.error);
  const keys = new Set(Object.values(m.finishes).flatMap((f) => [f.texture, f.edge]).filter(Boolean));
  m.textures = Object.fromEntries([...keys].map((k) => [k, { color: 'textures/' + k + '/color.jpg', normal: 'textures/' + k + '/normal.jpg', roughness: 'textures/' + k + '/roughness.jpg' }]));
  return m;
})()`;

let html = readFileSync(join(here, '..', 'viewer', 'preview.html'), 'utf8');
if (!html.includes('/*PARTS_JSON*/null')) throw new Error('viewer placeholder missing');
html = html.replace('/*PARTS_JSON*/null', () => loader)
  .replace('<title>Cabinet preview</title>', '<title>A Plywise design</title>\n<meta name="description" content="A cabinet designed for a real wall with Plywise: spin it, change the wood, see it in your room.">\n<script src="engine.js"></script>')
  .replace('<div id="hover"></div>', `<a id="brand" href="/" style="position:absolute;top:12px;right:12px;padding:8px 12px;border-radius:4px;background:rgba(255,255,255,.92);color:#1c1915;font:600 13px system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,.12)">Plywise · Built for your walls →</a>\n<div id="hover"></div>`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), html);
copyFileSync(engine, join(out, 'engine.js'));
for (const k of readdirSync(textures).filter((n) => !n.includes('.'))) {
  mkdirSync(join(out, 'textures', k), { recursive: true });
  for (const m of TEXTURE_MAPS) if (existsSync(join(textures, k, `${m}.jpg`))) copyFileSync(join(textures, k, `${m}.jpg`), join(out, 'textures', k, `${m}.jpg`));
}
console.log(`share page -> ${out}`);
