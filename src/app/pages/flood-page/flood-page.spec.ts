import { describe, expect, it } from 'vitest';
import { classifyFloodLocation, toFloodRecurrence } from './flood-utils';

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

describe('classifyFloodLocation', () => {
  it('reports flood when a flood polygon intersects the point', () => {
    expect(classifyFloodLocation({ NAME_ENG1: 'BANGKOK', ADMIN_ID1: '10' }, [
      toFloodRecurrence({ Freq: 1, Y_2011: 1 }),
    ])).toBe('flood');
  });

  it('recognizes covered provinces by their actual province code', () => {
    expect(classifyFloodLocation({ NAME_ENG1: 'PHANGNGA', ADMIN_ID1: '82' }, [])).toBe('covered-empty');
  });

  it('recognizes covered provinces when names differ by punctuation and case', () => {
    expect(classifyFloodLocation({ NAME_ENG1: 'KRABI', ADMIN_ID1: '81' }, [])).toBe('covered-empty');
  });

  it('reports outside for a province not in the dataset coverage', () => {
    expect(classifyFloodLocation({ NAME_ENG1: 'BANGKOK', ADMIN_ID1: '10' }, [])).toBe('outside');
  });
});
