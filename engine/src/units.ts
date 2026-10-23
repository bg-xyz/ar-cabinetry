import type { RunSpec } from './types.ts';

export const IN = 25.4;

// Fields in a run spec that hold lengths. Everything else (ids, counts) is left alone.
const LENGTH_KEYS = new Set([
  'width', 'height', 'depth', 'size', 'elevation', 'overhangSides', 'overhangFront',
  'insetSetback', 'gap', 'endReveal', 'topReveal', 'bottomReveal', 'offsetX', 'setback',
  'bottom', 'top', 'dadoDepth', 'grooveDepth', 'stretcherWidth',
]);

function scale(value: unknown, k: number): unknown {
  if (Array.isArray(value)) return value.map((v) => scale(v, k));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = LENGTH_KEYS.has(key) && typeof v === 'number' ? v * k : scale(v, k);
    }
    return out;
  }
  return value;
}

// Specs may be written in inches; the engine always works in mm.
export function specToMm(spec: RunSpec): RunSpec {
  if (spec.units !== 'in') return spec;
  return { ...(scale(spec, IN) as RunSpec), units: 'mm' };
}

export const round = (v: number, step = 0.1) => Math.round(v / step) * step;
export const fmtIn = (mm: number) => `${(mm / IN).toFixed(3)}"`;
export const fmtBoth = (mm: number) => `${round(mm, 0.1).toFixed(1)} mm (${fmtIn(mm)})`;
