import type { Style } from './types.ts';

export function lookup<T>(table: Record<string, T>, id: string, what: string): T {
  const item = table[id];
  if (!item) throw new Error(`Unknown ${what} "${id}". Known: ${Object.keys(table).join(', ')}`);
  return item;
}

// Style presets from STYLES.md. A preset is only a set of switch positions. Display names are cities
// (DESIGN.md): plain descriptive words nobody owns: Slab = full overlay, Frame = ply-framed inset,
// Shadow = recessed inset, Flush = flush, push to open.
const base: Style = {
  name: 'Slab',
  mount: 'overlay',
  insetSetback: 0,
  grip: 'pull',
  grainMatch: 'across',
  edges: 'banded',
  bandThickness: 0.5,
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
  leg: 'taper',
  dadoDepth: 6,
  grooveDepth: 6,
  dadoFit: 0.4,    // 0.016"
  grooveFit: 0.5,  // 0.020"
  depthFit: 0.5,
  stretcherWidth: 100,
  carcassFinish: 'birch',
  frontFinish: 'birch',
  topFinish: 'birch',
};

export const STYLE_PRESETS: Record<string, Style> = {
  'classic-euro': base,
  'ply-inset': { ...base, name: 'Frame', mount: 'inset', hinge: 'blum-cliptop-110-inset', edges: 'ply' },
  'recessed-inset': { ...base, name: 'Shadow', mount: 'inset', insetSetback: 15, hinge: 'blum-cliptop-110-inset' },
  'milan-flush': { ...base, name: 'Flush', grip: 'push', pull: 'none' },
};

export function resolveStyle(input: (Partial<Style> & { preset?: string }) | undefined): Style {
  const { preset = 'classic-euro', ...overrides } = input ?? {};
  const p = lookup(STYLE_PRESETS, preset, 'style preset');
  return { ...p, ...overrides };
}
