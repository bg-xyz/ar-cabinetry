// Build every spec in specs/ into ../jobs/<name>/ (npm run samples).
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const specs = join(here, '..', 'specs');
for (const f of readdirSync(specs).filter((n) => n.endsWith('.json')))
  process.stdout.write(execFileSync(process.execPath, ['--no-warnings', join(here, 'cli.ts'), join(specs, f)]).toString().split('\n')[0] + '\n');
