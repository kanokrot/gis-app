import { describe, expect, it } from 'vitest';
import { buildFloodYearStrip, classifyFloodLocation, floodRecurrenceColor, floodRecurrenceLabel, toFloodRecurrence } from './flood-utils';

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

describe('flood recurrence legend', () => {
  it('matches recurrence values 1–9 to the map ramp and numeric legend labels', () => {
    expect(Array.from({ length: 9 }, (_, index) => index + 1).map((frequency) => [
      floodRecurrenceColor(frequency),
      floodRecurrenceLabel(frequency),
    ])).toEqual([
      ['#2563eb', '1'], ['#0ea5e9', '2'], ['#14b8a6', '3'],
      ['#22c55e', '4'], ['#84cc16', '5'], ['#eab308', '6'],
      ['#f97316', '7'], ['#ef4444', '8'], ['#b91c1c', '9'],
    ]);
  });

  it('returns no color or label for unsupported recurrence values', () => {
    expect(floodRecurrenceColor(0)).toBeNull();
    expect(floodRecurrenceLabel(10)).toBeNull();
  });
});

describe('buildFloodYearStrip', () => {
  it('creates all ten years and marks only years with recorded flooding', () => {
    const strip = buildFloodYearStrip([2011, 2014, 2020]);

    expect(strip).toHaveLength(10);
    expect(strip.filter((entry) => entry.affected).map((entry) => entry.year)).toEqual([2011, 2014, 2020]);
    expect(strip[1]).toEqual({ year: 2012, affected: false });
  });

  it('keeps the entire period visible when no flood years were recorded', () => {
    expect(buildFloodYearStrip([]).every((entry) => !entry.affected)).toBe(true);
  });
});
