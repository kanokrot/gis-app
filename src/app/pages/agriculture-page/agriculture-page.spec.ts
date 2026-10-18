import { describe, expect, it } from 'vitest';
import { calculateShare, colorBandIndex } from './agriculture-utils';

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
});
