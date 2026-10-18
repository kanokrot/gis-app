const YEAR_FIELDS = ['Y_2011', 'Y_2012', 'Y_2013', 'Y_2014', 'Y_2015', 'Y_2016', 'Y2017', 'Y_2018', 'Y_2019', 'Y_2020'];

export const SOUTHERN_PROVINCES = [
  'Nakhon Si Thammarat',
  'Songkhla',
  'Phatthalung',
  'Surat Thani',
  'Narathiwat',
  'Pattani',
  'Yala',
  'Trang',
  'Chumphon',
  'Satun',
  'Phang-nga',
  'Krabi',
] as const;

const PROVINCE_CODES: Record<(typeof SOUTHERN_PROVINCES)[number], string> = {
  'Nakhon Si Thammarat': '80',
  Songkhla: '90',
  Phatthalung: '93',
  'Surat Thani': '84',
  Narathiwat: '96',
  Pattani: '94',
  Yala: '95',
  Trang: '92',
  Chumphon: '86',
  Satun: '91',
  'Phang-nga': '82',
  Krabi: '81',
};

export interface FloodRecurrence {
  frequency: number | null;
  years: number[];
  provinceThai: string | null;
  provinceEnglish: string | null;
}

export type FloodLocationStatus = 'flood' | 'covered-empty' | 'outside';

export function classifyFloodLocation(
  provinceAttributes: Record<string, unknown> | null,
  floodRecords: readonly FloodRecurrence[],
): FloodLocationStatus {
  if (floodRecords.length) return 'flood';

  const boundaryName = normalizeProvince(provinceAttributes?.['NAME_ENG1']);
  const boundaryCode = textValue(provinceAttributes?.['ADMIN_ID1']);
  const covered = SOUTHERN_PROVINCES.some((name) =>
    normalizeProvince(name) === boundaryName || PROVINCE_CODES[name] === boundaryCode,
  );

  return covered ? 'covered-empty' : 'outside';
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

function normalizeProvince(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z]/g, '') : '';
}
