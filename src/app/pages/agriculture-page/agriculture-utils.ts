export type NumericValue = number | null | undefined;

export interface RankedItem<T> {
  item: T;
  value: number;
  rank: number;
}

const ENGLISH_PROVINCE_NAMES: Readonly<Record<string, string>> = {
  'กรุงเทพมหานคร': 'Bangkok',
  'กระบี่': 'Krabi',
  'กาญจนบุรี': 'Kanchanaburi',
  'กาฬสินธุ์': 'Kalasin',
  'กำแพงเพชร': 'Kamphaeng Phet',
  'ขอนแก่น': 'Khon Kaen',
  'จันทบุรี': 'Chanthaburi',
  'ฉะเชิงเทรา': 'Chachoengsao',
  'ชลบุรี': 'Chon Buri',
  'ชัยนาท': 'Chai Nat',
  'ชัยภูมิ': 'Chaiyaphum',
  'ชุมพร': 'Chumphon',
  'เชียงราย': 'Chiang Rai',
  'เชียงใหม่': 'Chiang Mai',
  'ตรัง': 'Trang',
  'ตราด': 'Trat',
  'ตาก': 'Tak',
  'นครนายก': 'Nakhon Nayok',
  'นครปฐม': 'Nakhon Pathom',
  'นครพนม': 'Nakhon Phanom',
  'นครราชสีมา': 'Nakhon Ratchasima',
  'นครศรีธรรมราช': 'Nakhon Si Thammarat',
  'นครสวรรค์': 'Nakhon Sawan',
  'นนทบุรี': 'Nonthaburi',
  'นราธิวาส': 'Narathiwat',
  'น่าน': 'Nan',
  'บึงกาฬ': 'Bueng Kan',
  'บุรีรัมย์': 'Buriram',
  'ปทุมธานี': 'Pathum Thani',
  'ประจวบคีรีขันธ์': 'Prachuap Khiri Khan',
  'ปราจีนบุรี': 'Prachin Buri',
  'ปัตตานี': 'Pattani',
  'พระนครศรีอยุธยา': 'Phra Nakhon Si Ayutthaya',
  'พะเยา': 'Phayao',
  'พังงา': 'Phang Nga',
  'พัทลุง': 'Phatthalung',
  'พิจิตร': 'Phichit',
  'พิษณุโลก': 'Phitsanulok',
  'เพชรบุรี': 'Phetchaburi',
  'เพชรบูรณ์': 'Phetchabun',
  'แพร่': 'Phrae',
  'ภูเก็ต': 'Phuket',
  'มหาสารคาม': 'Maha Sarakham',
  'มุกดาหาร': 'Mukdahan',
  'แม่ฮ่องสอน': 'Mae Hong Son',
  'ยโสธร': 'Yasothon',
  'ยะลา': 'Yala',
  'ร้อยเอ็ด': 'Roi Et',
  'ระนอง': 'Ranong',
  'ระยอง': 'Rayong',
  'ราชบุรี': 'Ratchaburi',
  'ลพบุรี': 'Lop Buri',
  'ลำปาง': 'Lampang',
  'ลำพูน': 'Lamphun',
  'เลย': 'Loei',
  'ศรีสะเกษ': 'Sisaket',
  'สกลนคร': 'Sakon Nakhon',
  'สงขลา': 'Songkhla',
  'สตูล': 'Satun',
  'สมุทรปราการ': 'Samut Prakan',
  'สมุทรสงคราม': 'Samut Songkhram',
  'สมุทรสาคร': 'Samut Sakhon',
  'สระแก้ว': 'Sa Kaeo',
  'สระบุรี': 'Saraburi',
  'สิงห์บุรี': 'Sing Buri',
  'สุโขทัย': 'Sukhothai',
  'สุพรรณบุรี': 'Suphan Buri',
  'สุราษฎร์ธานี': 'Surat Thani',
  'สุรินทร์': 'Surin',
  'หนองคาย': 'Nong Khai',
  'หนองบัวลำภู': 'Nong Bua Lamphu',
  'อ่างทอง': 'Ang Thong',
  'อุดรธานี': 'Udon Thani',
  'อุตรดิตถ์': 'Uttaradit',
  'อุทัยธานี': 'Uthai Thani',
  'อุบลราชธานี': 'Ubon Ratchathani',
  'อำนาจเจริญ': 'Amnat Charoen',
};

export function formatBilingualProvinceName(thaiName: string): string {
  const englishName = ENGLISH_PROVINCE_NAMES[thaiName];
  return englishName ? `${thaiName} / ${englishName}` : thaiName;
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
