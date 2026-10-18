import { describe, expect, it } from 'vitest';
import {
  calculateShare,
  chooseDotValue,
  colorBandIndex,
  dotCount,
  formatAgricultureValue,
  formatBilingualProvinceName,
  formatRank,
  formatTooltipText,
  rankItems,
  topItems,
} from './agriculture-utils';

describe('agriculture page data utilities', () => {
  it('calculates a reported machinery-use share', () => {
    expect(calculateShare(25, 100)).toBe(25);
  });

  it('keeps missing inputs as no data and does not divide by zero', () => {
    expect(calculateShare(null, 100)).toBeNull();
    expect(calculateShare(10, null)).toBeNull();
    expect(calculateShare(0, 0)).toBeNull();
  });

  it('assigns inclusive color-band boundaries consistently', () => {
    const bounds = [10, 25, 50];
    expect(colorBandIndex(10, bounds)).toBe(0);
    expect(colorBandIndex(10.01, bounds)).toBe(1);
    expect(colorBandIndex(25, bounds)).toBe(1);
    expect(colorBandIndex(50, bounds)).toBe(2);
    expect(colorBandIndex(75, bounds)).toBe(2);
    expect(colorBandIndex(null, bounds)).toBe(-1);
  });

  it('ranks only provinces with recorded values and returns the top ten', () => {
    const ranked = rankItems([
      { province: 'A', value: 10 },
      { province: 'B', value: null },
      { province: 'C', value: 30 },
    ], (item) => item.value);
    expect(ranked.map(({ item, rank }) => [item.province, rank])).toEqual([['C', 1], ['A', 2]]);
    expect(topItems(ranked, 1)).toEqual([ranked[0]]);
  });

  it('chooses a dot value that stays within per-province and national caps', () => {
    const values = [1_000_000, 10_000, null, 500_000];
    const value = chooseDotValue(values)!;
    expect(value).toBe(2500);
    expect(dotCount(1_000_000, value)).toBeLessThanOrEqual(400);
    expect(values.reduce<number>((sum, item) => sum + dotCount(item, value), 0)).toBeLessThanOrEqual(8000);
  });

  it('formats tooltip and detail values without turning missing data into zero', () => {
    expect(formatAgricultureValue(null, 'rai')).toBe('No record in supplied file');
    expect(formatTooltipText('Chiang Mai', null, 'rai')).toBe('Chiang Mai · No record in supplied file');
    expect(formatTooltipText('Chiang Mai', 25, '%', 'share')).toBe('Chiang Mai · 25%');
    expect(formatRank(null, 0)).toBe('No rank');
    expect(formatRank(12, 77)).toBe('12 of 77');
  });

  it('shows Thai and English province names in ranked labels', () => {
    expect(formatBilingualProvinceName('เชียงใหม่')).toBe('เชียงใหม่ / Chiang Mai');
    expect(formatBilingualProvinceName('Unknown')).toBe('Unknown');
  });
});
