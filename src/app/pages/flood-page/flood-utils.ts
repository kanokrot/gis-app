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

export const FLOOD_RECURRENCE_LEGEND = [
  { frequency: 1, color: '#2563eb' },
  { frequency: 2, color: '#0ea5e9' },
  { frequency: 3, color: '#14b8a6' },
  { frequency: 4, color: '#22c55e' },
  { frequency: 5, color: '#84cc16' },
  { frequency: 6, color: '#eab308' },
  { frequency: 7, color: '#f97316' },
  { frequency: 8, color: '#ef4444' },
  { frequency: 9, color: '#b91c1c' },
] as const;

export function floodRecurrenceColor(frequency: number): string | null {
  return FLOOD_RECURRENCE_LEGEND.find((entry) => entry.frequency === frequency)?.color ?? null;
}

export function floodRecurrenceLabel(frequency: number): string | null {
  return floodRecurrenceColor(frequency) ? String(frequency) : null;
}

export function buildFloodYearStrip(years: readonly number[]): { year: number; affected: boolean }[] {
  return Array.from({ length: 10 }, (_, index) => {
    const year = 2011 + index;
    return { year, affected: years.includes(year) };
  });
}

export function shouldShowFloodLoading(
  isUpdating: boolean,
  visibleAtCurrentScale: boolean,
  currentScale: number,
  minimumVisibleScale: number,
): boolean {
  return isUpdating && visibleAtCurrentScale && currentScale > 0 && currentScale <= minimumVisibleScale;
}

export function formatFloodFrequency(frequency: number | null): string {
  if (frequency === null) return '—';
  return `${frequency} ${frequency === 1 ? 'time' : 'times'}`;
}

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
