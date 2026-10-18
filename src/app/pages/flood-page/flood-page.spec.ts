import { describe, expect, it } from 'vitest';
import { toFloodRecurrence } from './flood-utils';

describe('toFloodRecurrence', () => {
  it('converts observed binary year fields and preserves province labels', () => {
    const result = toFloodRecurrence({
      Freq: 2,
      Y_2011: 1,
      Y_2012: 0,
      Y_2013: 1,
      Y_2014: null,
      Y2017: 0,
      PV_TN: 'สงขลา',
      PV_EN: 'Songkhla',
    });

    expect(result).toEqual({
      frequency: 2,
      years: [2011, 2013],
      provinceThai: 'สงขลา',
      provinceEnglish: 'Songkhla',
    });
  });

  it('returns an empty year list and null frequency for missing values', () => {
    expect(toFloodRecurrence({})).toEqual({
      frequency: null,
      years: [],
      provinceThai: null,
      provinceEnglish: null,
    });
  });
});
