// Loads the catalog JSON files from disk (Node). The phone bundle imports them directly instead.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Catalog } from './types.ts';

const here = dirname(fileURLToPath(import.meta.url));

export function loadCatalog(dir = join(here, '..', 'catalog')): Catalog {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
  return {
    materials: read('materials'),
    hinges: read('hinges'),
    runners: read('runners'),
    pulls: read('pulls'),
    sinks: read('sinks'),
    faucets: read('faucets'),
    finishes: read('finishes'),
    legs: read('legs'),
  };
}
