import type { MeasurementSummary } from './types';

/** Normalize finite values without overflowing when a range spans both signs. */
export function normalizedPosition(value: number, minimum: number, maximum: number): number {
  if (![value, minimum, maximum].every(Number.isFinite) || minimum > maximum) {
    throw new Error('A quantitative color range needs ordered finite bounds and a finite value.');
  }
  if (minimum === maximum) return 0.5;
  const scale = Math.max(Math.abs(minimum), Math.abs(maximum), Math.abs(value)) || 1;
  const position = (value / scale - minimum / scale) / (maximum / scale - minimum / scale);
  return Math.min(1, Math.max(0, position));
}

/** A display palette. Numeric legends and descriptive statistics carry quantitative meaning. */
export function measurementColors(groups: MeasurementSummary[], minimum: number, maximum: number): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const group of groups) {
    const position = normalizedPosition(group.mean, minimum, maximum);
    const low = [69, 135, 151], high = [239, 191, 117];
    colors[group.structureId] = `rgb(${low.map((value, index) => Math.round(value + (high[index] - value) * position)).join(',')})`;
  }
  return colors;
}
