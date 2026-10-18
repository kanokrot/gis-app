export function calculateShare(used: number | null | undefined, reported: number | null | undefined): number | null {
  if (used === null || used === undefined || reported === null || reported === undefined) return null;
  if (!Number.isFinite(used) || !Number.isFinite(reported) || reported === 0) return null;
  return (used / reported) * 100;
}

/** Returns -1 for missing values and otherwise the zero-based inclusive band index. */
export function colorBandIndex(value: number | null | undefined, upperBounds: readonly number[]): number {
  if (value === null || value === undefined || !Number.isFinite(value) || upperBounds.length === 0) return -1;
  const index = upperBounds.findIndex((upperBound) => value <= upperBound);
  return index < 0 ? upperBounds.length - 1 : index;
}
