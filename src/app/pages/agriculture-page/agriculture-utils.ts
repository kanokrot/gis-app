export type NumericValue = number | null | undefined;

export interface RankedItem<T> {
  item: T;
  value: number;
  rank: number;
}

export function calculateShare(used: NumericValue, reported: NumericValue): number | null {
  if (used === null || used === undefined || reported === null || reported === undefined) return null;
  if (!Number.isFinite(used) || !Number.isFinite(reported) || reported === 0) return null;
  return (used / reported) * 100;
}

export function colorBandIndex(value: NumericValue, upperBounds: readonly number[]): number {
  if (value === null || value === undefined || !Number.isFinite(value) || upperBounds.length === 0) return -1;
  const index = upperBounds.findIndex((upperBound) => value <= upperBound);
  return index < 0 ? upperBounds.length - 1 : index;
}

export function rankItems<T>(items: readonly T[], getValue: (item: T) => NumericValue): RankedItem<T>[] {
  return items
    .map((item) => ({ item, value: getValue(item) }))
    .filter((entry): entry is { item: T; value: number } => entry.value !== null && entry.value !== undefined && Number.isFinite(entry.value))
    .sort((a, b) => b.value - a.value)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function topItems<T>(items: readonly RankedItem<T>[], limit = 10): RankedItem<T>[] {
  return items.slice(0, Math.max(0, limit));
}

export function chooseDotValue(values: readonly NumericValue[], maxPerProvince = 400, maxTotal = 8000): number | null {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value) && value > 0);
  if (!valid.length || maxPerProvince <= 0 || maxTotal <= 0) return null;
  const maxValue = Math.max(...valid);
  const totalValue = valid.reduce((sum, value) => sum + value, 0);
  return Math.max(1, Math.ceil(Math.max(maxValue / maxPerProvince, totalValue / maxTotal)));
}

export function dotCount(value: NumericValue, dotValue: NumericValue): number {
  if (value === null || value === undefined || dotValue === null || dotValue === undefined || dotValue <= 0) return 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value / dotValue);
}

export function formatAgricultureValue(value: NumericValue, unit: string, metric: 'area' | 'share' = 'area'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'No record in supplied file';
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  return metric === 'share' ? `${formatted}%` : `${formatted} ${unit}`;
}

export function formatTooltipText(province: string, value: NumericValue, unit: string, metric: 'area' | 'share' = 'area'): string {
  return `${province} · ${formatAgricultureValue(value, unit, metric)}`;
}

export function formatRank(rank: number | null, availableCount: number): string {
  return rank === null ? 'No rank' : `${rank} of ${availableCount}`;
}
