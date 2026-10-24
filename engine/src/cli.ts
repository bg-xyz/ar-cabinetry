// node src/cli.ts <spec.json> [--out <dir>] [--units in|mm] [--tool <mm>] [--open]
//
// Reads a run spec, designs it, and writes the job package.

import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadCatalog } from './load.ts';
import { designRun } from './run.ts';
import { buildJob, writeJob } from './job.ts';
import type { RunSpec } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const specPath = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!specPath) {
  console.error('usage: node src/cli.ts <spec.json> [--out dir] [--units in|mm] [--tool mm] [--open]');
  process.exit(1);
}

const units = flag('units', 'in') as 'in' | 'mm';
const toolDia = Number(flag('tool', '6.35'));
const out = resolve(flag('out', join(here, '..', '..', 'jobs', basename(specPath, '.json'))));

const cat = loadCatalog();
const spec = JSON.parse(readFileSync(specPath, 'utf8')) as RunSpec;
const design = designRun(spec, cat);
const job = buildJob(design, cat, { units, toolDia });
const files = writeJob(out, design, job, cat, { units, toolDia }, readFileSync(join(here, '..', 'viewer', 'preview.html'), 'utf8'));

console.log(`${design.spec.name}: ${design.parts.length} parts on ${job.sheets.length} sheet(s) -> ${out}`);
for (const f of files) console.log(`  ${f}`);
for (const w of job.warnings) console.log(`  WARNING: ${w}`);

if (args.includes('--open')) {
  for (const f of ['preview.html', 'jobsheet.html'])
    spawn('cmd', ['/c', 'start', '', join(out, f)], { detached: true, stdio: 'ignore' }).unref();
}
