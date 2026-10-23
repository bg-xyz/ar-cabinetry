// Build every spec in specs/ into ../jobs/<name>/ (npm run samples).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const specs = join(here, '..', 'specs');
let failed = 0;
for (const f of readdirSync(specs).filter((n) => n.endsWith('.json'))) {
  const r = spawnSync(process.execPath, ['--no-warnings', join(here, 'cli.ts'), join(specs, f)], { encoding: 'utf8' });
  if (r.status === 0) console.log(r.stdout.split('\n')[0]);
  else { failed++; console.log(`${f}: FAILED\n  ${(r.stderr.match(/Error: .*/) ?? [r.stderr])[0]}`); }
}
process.exit(failed ? 1 : 0);
