const YEAR_FIELDS = ['Y_2011', 'Y_2012', 'Y_2013', 'Y_2014', 'Y_2015', 'Y_2016', 'Y2017', 'Y_2018', 'Y_2019', 'Y_2020'];

export interface FloodRecurrence {
  frequency: number | null;
  years: number[];
  provinceThai: string | null;
  provinceEnglish: string | null;
}

export function toFloodRecurrence(attributes: Record<string, unknown>): FloodRecurrence {
  const years = YEAR_FIELDS.flatMap((field) => {
    if (Number(attributes[field]) !== 1) return [];
    const match = field.match(/20(\d{2})$/);
    return match ? [2000 + Number(match[1])] : [];
  });
  const rawFrequency = Number(attributes['Freq']);
  return {
    frequency: Number.isFinite(rawFrequency) ? rawFrequency : null,
    years,
    provinceThai: textValue(attributes['PV_TN']),
    provinceEnglish: textValue(attributes['PV_EN']),
  };
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
