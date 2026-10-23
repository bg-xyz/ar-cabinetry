import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Catalog, Style } from './types.ts';

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
  };
}

export function lookup<T>(table: Record<string, T>, id: string, what: string): T {
  const item = table[id];
  if (!item) throw new Error(`Unknown ${what} "${id}". Known: ${Object.keys(table).join(', ')}`);
  return item;
}

// Style presets from STYLES.md. A preset is only a set of switch positions.
const base: Style = {
  name: 'Classic Euro',
  mount: 'overlay',
  insetSetback: 0,
  grip: 'pull',
  gap: 3,
  endReveal: 1.5,
  topReveal: 3,
  bottomReveal: 0,
  carcass: 'bb18',
  back: 'bb6',
  fronts: 'bb18',
  drawerBox: 'bb15',
  drawerBottom: 'bb6',
  hinge: 'blum-cliptop-110-overlay',
  runner: 'blum-tandem-563h',
  pull: 'bar-128',
  dadoDepth: 6,
  grooveDepth: 6,
  stretcherWidth: 100,
};

export const STYLE_PRESETS: Record<string, Style> = {
  'classic-euro': base,
  'ply-inset': { ...base, name: 'Ply Inset', mount: 'inset', hinge: 'blum-cliptop-110-inset' },
  'recessed-inset': { ...base, name: 'Recessed Inset', mount: 'inset', insetSetback: 15, hinge: 'blum-cliptop-110-inset' },
  'milan-flush': { ...base, name: 'Milan Flush (push-to-open)', grip: 'push', pull: 'none' },
};

export function resolveStyle(input: (Partial<Style> & { preset?: string }) | undefined): Style {
  const { preset = 'classic-euro', ...overrides } = input ?? {};
  const p = lookup(STYLE_PRESETS, preset, 'style preset');
  return { ...p, ...overrides };
}
