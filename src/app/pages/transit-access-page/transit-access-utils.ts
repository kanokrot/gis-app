export interface PopulationSummary {
  code1Population: number;
  totalPopulation: number;
}

export type AccessDistanceId = '400m' | '500mBusStop' | '1000m';

export function accessShare(summary: PopulationSummary | null | undefined): number | null {
  if (!summary || !Number.isFinite(summary.code1Population) || !Number.isFinite(summary.totalPopulation) || summary.totalPopulation <= 0) return null;
  return (summary.code1Population / summary.totalPopulation) * 100;
}

export function formatAccessShare(summary: PopulationSummary | null | undefined): string {
  const share = accessShare(summary);
  return share === null ? 'No record' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(share)}%`;
}

export function formatPopulation(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'No record';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function normalizeDistrictName(value: string): string {
  return value.trim().replace(/^เขต\s*/, '').replace(/\s+/g, '');
}

const DISTRICT_NAMES_EN: Readonly<Record<string, string>> = {
  'คลองเตย': 'Khlong Toei', 'คลองสาน': 'Khlong San', 'คลองสามวา': 'Khlong Sam Wa', 'คันนายาว': 'Khan Na Yao',
  'จตุจักร': 'Chatuchak', 'จอมทอง': 'Chom Thong', 'ดอนเมือง': 'Don Mueang', 'ดินแดง': 'Din Daeng',
  'ดุสิต': 'Dusit', 'ตลิ่งชัน': 'Taling Chan', 'ทวีวัฒนา': 'Thawi Watthana', 'ทุ่งครุ': 'Thung Khru',
  'ธนบุรี': 'Thon Buri', 'บางเขน': 'Bang Khen', 'บางแค': 'Bang Khae', 'บางกอกใหญ่': 'Bangkok Yai',
  'บางกอกน้อย': 'Bangkok Noi', 'บางกะปิ': 'Bang Kapi', 'บางขุนเทียน': 'Bang Khun Thian', 'บางคอแหลม': 'Bang Kho Laem',
  'บางซื่อ': 'Bang Sue', 'บางนา': 'Bang Na', 'บางบอน': 'Bang Bon', 'บางพลัด': 'Bang Phlat',
  'บางรัก': 'Bang Rak', 'บึงกุ่ม': 'Bueng Kum', 'ปทุมวัน': 'Pathum Wan', 'ประเวศ': 'Prawet',
  'ป้อมปราบศัตรูพ่าย': 'Pom Prap Sattru Phai', 'พญาไท': 'Phaya Thai', 'พระโขนง': 'Phra Khanong', 'พระนคร': 'Phra Nakhon',
  'ภาษีเจริญ': 'Phasi Charoen', 'มีนบุรี': 'Min Buri', 'ยานนาวา': 'Yan Nawa', 'ราชเทวี': 'Ratchathewi',
  'ราษฎร์บูรณะ': 'Rat Burana', 'ลาดกระบัง': 'Lat Krabang', 'ลาดพร้าว': 'Lat Phrao', 'วังทองหลาง': 'Wang Thonglang',
  'วัฒนา': 'Watthana', 'สวนหลวง': 'Suan Luang', 'สะพานสูง': 'Saphan Sung', 'สัมพันธวงศ์': 'Samphanthawong',
  'สาทร': 'Sathon', 'สายไหม': 'Sai Mai', 'หนองแขม': 'Nong Khaem', 'หนองจอก': 'Nong Chok',
  'หลักสี่': 'Lak Si', 'ห้วยขวาง': 'Huai Khwang',
};

export function bilingualDistrictName(thaiName: string): string {
  const englishName = DISTRICT_NAMES_EN[normalizeDistrictName(thaiName)];
  return englishName ? `${thaiName} / ${englishName}` : thaiName;
}

export function canonicalDistrictName(value: string): string | null {
  const normalized = normalizeDistrictName(value);
  if (DISTRICT_NAMES_EN[normalized]) return normalized;
  const english = normalized.toLocaleLowerCase('en-US');
  return Object.entries(DISTRICT_NAMES_EN).find(([, name]) => name.replace(/\s+/g, '').toLocaleLowerCase('en-US') === english)?.[0] ?? null;
}
