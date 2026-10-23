// Export the designs and textures the iPhone app bundles (npm run app-assets).
//
//   app/Resources/Designs/<spec>.json   3D model (same shape as a job's parts.json), every finish included
//   app/Resources/Textures/<key>/*.jpg  shared texture maps
//
// Until the engine runs on the phone (JavaScriptCore), the app shows these pre-built designs.

import { readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog.ts';
import { designRun } from './run.ts';
import { model3d, TEXTURE_DIR, TEXTURE_MAPS } from './job.ts';
import type { RunSpec } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', 'app', 'Resources');
const APP_SPECS = ['vanity-36-udrawers', 'vanity-48-milan', 'vanity-30-doors', 'vanity-48-run', 'sideboard-60-legs'];

const cat = loadCatalog();
for (const d of ['Designs', 'Textures']) if (existsSync(join(out, d))) rmSync(join(out, d), { recursive: true });
mkdirSync(join(out, 'Designs'), { recursive: true });

APP_SPECS.forEach((name, i) => {
  const spec = JSON.parse(readFileSync(join(here, '..', 'specs', `${name}.json`), 'utf8')) as RunSpec;
  const model = { ...model3d(designRun(spec, cat), cat), finishes: cat.finishes, order: i };
  writeFileSync(join(out, 'Designs', `${basename(name)}.json`), JSON.stringify(model));
  console.log(`Designs/${name}.json`);
});

for (const key of readdirSync(TEXTURE_DIR).filter((k) => !k.includes('.'))) {
  mkdirSync(join(out, 'Textures', key), { recursive: true });
  for (const m of TEXTURE_MAPS) copyFileSync(join(TEXTURE_DIR, key, `${m}.jpg`), join(out, 'Textures', key, `${m}.jpg`));
  console.log(`Textures/${key}/`);
}
