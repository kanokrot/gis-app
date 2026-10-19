export interface StationFeature {
  id?: string | number;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: number[] };
}

export interface RailRouteFeature {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

export interface InterchangeCandidate {
  from: { nodeId: string; stationId: string; stationName: string; line: string; operator: string };
  to: { nodeId: string; stationId: string; stationName: string; line: string; operator: string };
  distanceMeters: number;
  verified: boolean;
}

export interface FareGraphNode {
  id: string;
  stationId: string;
  nameTh: string;
  nameEn: string;
  line: string;
  operator: string;
  coordinates: [number, number];
}

export interface FareGraphEdge {
  from: string;
  to: string;
  line: string;
  operator: string;
  type: 'ride' | 'transfer';
  distanceMeters: number;
}

export interface FareGraph {
  nodes: Map<string, FareGraphNode>;
  edges: FareGraphEdge[];
  adjacency: Map<string, FareGraphEdge[]>;
}

export interface FareRoute {
  nodes: FareGraphNode[];
  edges: FareGraphEdge[];
  lineSegments: { line: string; operator: string; stations: FareGraphNode[] }[];
  transfers: FareGraphNode[];
  transferCount: number;
  stationCount: number;
  operators: string[];
  cost: number;
}

const TRANSFER_PENALTY = 4;
const MAX_STATION_TO_TRACK_METERS = 60;
const ENGLISH_STATION_NAMES: Record<string, string> = {
  'สนามกีฬาแห่งชาติ': 'National Stadium', 'ราชเทวี': 'Ratchathewi', 'พญาไท': 'Phaya Thai',
  'อนุสาวรีย์ชัยสมรภูมิ': 'Victory Monument', 'สนามเป้า': 'Sanam Pao', 'อารีย์': 'Ari',
  'เสนาร่วม': 'Sena Ruam', 'สะพานควาย': 'Saphan Khwai', 'หมอชิต': 'Mo Chit',
  'นานา': 'Nana', 'ชิดลม': 'Chit Lom', 'พร้อมพงษ์': 'Phrom Phong', 'อโศก': 'Asok',
  'เพลินจิต': 'Phloen Chit', 'ทองหล่อ': 'Thong Lo', 'เอกมัย': 'Ekkamai', 'พระโขนง': 'Phra Khanong',
  'อ่อนนุช': 'On Nut', 'บางจาก': 'Bang Chak', 'ปุณณวิถี': 'Punnawithi', 'อุดมสุข': 'Udom Suk',
  'บางนา': 'Bang Na', 'แบริ่ง': 'Bearing', 'สำโรง': 'Samrong', 'พู่เจ้า': 'Pu Chao', 'เคหะ': 'Kheha',
  'สยาม': 'Siam', 'กรุงธนบุรี': 'Krung Thon Buri',
  'วงเวียนใหญ่': 'Wongwian Yai', 'ตลาดพลู': 'Talat Phlu', 'วุฒากาศ': 'Wutthakat', 'บางหว้า': 'Bang Wa',
  'สีลม': 'Si Lom', 'หัวลำโพง': 'Hua Lamphong', 'สามย่าน': 'Sam Yan', 'ลุมพินี': 'Lumphini',
  'คลองเตย': 'Khlong Toei', 'ศูนย์การประชุมแห่งชาติสิริกิติ์': 'Queen Sirikit National Convention Centre',
  'สุขุมวิท': 'Sukhumvit', 'เพชรบุรี': 'Phetchaburi', 'พระราม 9': 'Phra Ram 9',
  'ศูนย์วัฒนธรรมแห่งประเทศไทย': 'Thailand Cultural Centre', 'ห้วยขวาง': 'Huai Khwang',
  'สุทธิสาร': 'Sutthisan', 'รัชดาภิเษก': 'Ratchadaphisek', 'ลาดพร้าว': 'Lat Phrao',
  'พหลโยธิน': 'Phahon Yothin', 'สวนจตุจักร': 'Chatuchak Park', 'กำแพงเพชร': 'Kamphaeng Phet',
  'บางซื่อ': 'Bang Sue', 'เตาปูน': 'Tao Poon', 'บางโพ': 'Bang Pho', 'บางอ้อ': 'Bang O',
  'บางพลัด': 'Bang Phlat', 'สิรินธร': 'Sirindhorn', 'บางยี่ขัน': 'Bang Yi Khan',
  'บางขุนนนท์': 'Bang Khun Non', 'ไฟฉาย': 'Fai Chai', 'จรัญฯ 13': 'Charan 13', 'ท่าพระ': 'Tha Phra',
  'อิสรภาพ': 'Itsaraphap', 'สนามไชย': 'Sanam Chai', 'สามยอด': 'Sam Yot', 'วัดมังกร': 'Wat Mangkon',
  'บางไผ่': 'Bang Phai', 'หลักสอง': 'Lak Song', 'บางแค': 'Bang Khae', 'ภาษีเจริญ': 'Phasi Charoen',
  'เพชรเกษม 48': 'Phetkasem 48', 'บางกะปิ': 'Bang Kapi', 'แยกลำสาลี': 'Yaek Lam Sali',
  'หัวหมาก': 'Hua Mak', 'ศรีนุช': 'Si Nut', 'สวนหลวง ร.9': 'Suan Luang Rama IX',
  'ศรีอุดม': 'Si Udom', 'ศรีเอี่ยม': 'Si Iam', 'ศรีลาซาล': 'Si La Salle', 'ศรีแบริ่ง': 'Si Bearing',
  'ศรีด่าน': 'Si Dan', 'ศรีเทพา': 'Si Thepha', 'ทิพวัล': 'Thipphawan', 'วัดพระศรีมหาธาตุ': 'Wat Phra Sri Mahathat',
  'หลักสี่': 'Lak Si', 'แจ้งวัฒนะ 14': 'Chaeng Watthana 14', 'ศูนย์ราชการนนทบุรี': 'Nonthaburi Civic Center',
  'แคราย': 'Khae Rai', 'สนามบินน้ำ': 'Sanambin Nam', 'สามัคคี': 'Samakkhi', 'กรมชลประทาน': 'Royal Irrigation Department',
  'แยกปากเกร็ด': 'Yaek Pak Kret', 'เลี่ยงเมืองปากเกร็ด': 'Pak Kret Bypass', 'ศรีรัช': 'Si Rat',
  'เมืองทองธานี': 'Muang Thong Thani', 'แจ้งวัฒนะ-ปากเกร็ด 28': 'Chaeng Watthana-Pak Kret 28',
  'รามอินทรา 3': 'Ram Inthra 3', 'ลาดปลาเค้า': 'Lat Pla Khao', 'รามอินทรา กม.4': 'Ram Inthra Kor Mor 4',
  'มัยลาภ': 'Maiyalap', 'วัชรพล': 'Vacharaphol', 'รามอินทรา กม.6': 'Ram Inthra Kor Mor 6',
  'คู้บอน': 'Khu Bon', 'รามอินทรา กม.9': 'Ram Inthra Kor Mor 9', 'วงแหวนรามอินทรา': 'Outer Ring Road-Ram Inthra',
  'นพรัตน์': 'Nopparat', 'บางชัน': 'Bang Chan', 'รามคำแหง': 'Ramkhamhaeng', 'มักกะสัน': 'Makkasan',
  'ราชปรารภ': 'Ratchaprarop', 'บ้านทับช้าง': 'Ban Thap Chang', 'ลาดกระบัง': 'Lat Krabang',
  'สุวรรณภูมิ': 'Suvarnabhumi Airport', 'เจริญนคร': 'Charoen Nakhon', 'คลองสาน': 'Khlong San',
  'บางเขน': 'Bang Khen', 'ทุ่งสองห้อง': 'Thung Song Hong', 'วัดเสมียนนารี': 'Wat Samian Nari',
  'รังสิต': 'Rangsit', 'ตลิ่งชัน': 'Taling Chan', 'บางบำหรุ': 'Bang Bumru', 'บางซ่อน': 'Bang Son',
  'กรุงเทพอภิวัฒน์': 'Krung Thep Aphiwat', 'ดอนเมือง': 'Don Mueang', 'หลักหก': 'Lak Hok',
  'วงศ์สว่าง': 'Wong Sawang', 'แยกติวานนท์': 'Yaek Tiwanon', 'กระทรวงสาธารณสุข': 'Ministry of Public Health',
  'บางกระสอ': 'Bang Krasor', 'แยกนนทบุรี 1': 'Yaek Nonthaburi 1', 'สะพานพระนั่งเกล้า': 'Phra Nang Klao Bridge',
  'ไทรม้า': 'Sai Ma', 'สามแยกบางใหญ่': 'Sam Yaek Bang Yai', 'บางรักน้อยท่าอิฐ': 'Bang Rak Noi Tha It',
  'บางพลู': 'Bang Phlu', 'บางรักใหญ่': 'Bang Rak Yai', 'ตลาดบางใหญ่': 'Talad Bang Yai',
  'ปู่เจ้า': 'Pu Chao', 'ช้างเอราวัณ': 'Chang Erawan', 'โรงเรียนนายเรือ': 'Royal Thai Naval Academy',
  'ปากน้ำ': 'Pak Nam', 'ศรีนครินทร์': 'Srinagarindra', 'แพรกษา': 'Phraek Sa', 'สายลวด': 'Sai Luat',
  'หลักหก (ม.รังสิต)': 'Lak Hok (Rangsit University)', 'ห้าแยกลาดพร้าว': 'Ha Yaek Lat Phrao',
  'มหาดไทย': 'Mahat Thai', 'โชคชัย 4': 'Chok Chai 4', 'ศรีกรีฑา': 'Si Kritha',
  'ทะเลสาบเมืองทองธานี': 'Muang Thong Thani Lake', 'ศรีนครินทร์ 38': 'Srinagarindra 38',
  'กลันตัน': 'Kalantan', 'ลาดพร้าว 101': 'Lat Phrao 101', 'ลาดพร้าว 83': 'Lat Phrao 83',
  'ลาดพร้าว 71': 'Lat Phrao 71', 'ภาวนา': 'Phawana', 'มีนบุรี': 'Min Buri',
  'ตลาดมีนบุรี': 'Min Buri Market', 'เศรษฐบุตรบำเพ็ญ': 'Setthabut Bamphen',
  'ราชภัฏพระนคร': 'Rajabhat Phranakhon', 'ศูนย์ราชการเฉลิมพระเกียรติ': 'Government Complex',
  'โทรคมนาคมแห่งชาติ': 'National Telecom', 'รัฐสภา': 'Parliament', 'แยก คปอ.': 'Yaek Kor Por Aor',
  'พหลโยธิน 24': 'Phahon Yothin 24', 'รัชโยธิน': 'Ratchayothin', 'เสนานิคม': 'Sena Nikhom',
  'มหาวิทยาลัยเกษตรศาสตร์': 'Kasetsart University', 'กรมป่าไม้': 'Royal Forest Department',
  'บางบัว': 'Bang Bua', 'สถานีกรมทหารราบที่ 11': '11th Infantry Regiment',
  'พหลโยธิน 59': 'Phahon Yothin 59', 'สายหยุด': 'Sai Yud', 'สะพานใหม่': 'Saphan Mai',
  'โรงพยาบาลภูมิพลอดุลยเดช': 'Bhumibol Adulyadej Hospital', 'พิพิธภัณฑ์กองทัพอากาศ': 'Royal Thai Air Force Museum',
  'คูคต': 'Khu Khot', 'คลองบางไผ่': 'Khlong Bang Phai', 'เคหะฯ': 'Kheha', 'จตุจักร': 'Chatuchak',
  'อิมแพ็ค เมืองทองธานี': 'IMPACT Muang Thong Thani', 'การเคหะ': 'Housing Authority',
  'สุขุมวิท 71': 'Sukhumvit 71', 'โพธิ์นิมิตร': 'Pho Nimit',
};
const lineFor = (feature: { properties: Record<string, unknown> }): string[] =>
  String(feature.properties['line'] ?? feature.properties['network'] ?? '').split(' / ').map((item) => item.trim()).filter(Boolean);

export function operatorForLine(line: string): string {
  if (line === 'BTS Gold') return 'BTS_GOLD';
  if (line.startsWith('BTS')) return 'BTS';
  if (line === 'Airport Rail Link') return 'ARL';
  if (line === 'MRT Blue') return 'BEM_MRT_BLUE';
  if (line === 'MRT Purple') return 'MRTA_PURPLE';
  if (line === 'MRT Yellow') return 'MRT_YELLOW';
  if (line === 'MRT Pink') return 'MRT_PINK';
  if (line.startsWith('SRT')) return 'SRT_RED';
  return 'UNKNOWN';
}

function stationName(feature: StationFeature, language: 'name:en' | 'name:th' | 'name'): string {
  const value = feature.properties[language];
  return typeof value === 'string' ? value : '';
}

function metersBetween(a: [number, number], b: [number, number]): number {
  const latitude = (a[1] + b[1]) * Math.PI / 360;
  const dx = (b[0] - a[0]) * 111320 * Math.cos(latitude);
  const dy = (b[1] - a[1]) * 110574;
  return Math.hypot(dx, dy);
}

function flattenPaths(feature: RailRouteFeature): number[][][] {
  if (feature.geometry.type === 'LineString') return [feature.geometry.coordinates as number[][]];
  if (feature.geometry.type === 'MultiLineString') return feature.geometry.coordinates as number[][][];
  return [];
}

function joinConnectedPaths(paths: number[][][]): number[][][] {
  const remaining = paths.filter((path) => path.length > 1).map((path) => [...path]);
  const joined: number[][][] = [];
  while (remaining.length) {
    let current = remaining.shift()!;
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const aStart = current[0] as [number, number], aEnd = current.at(-1) as [number, number];
        const bStart = candidate[0] as [number, number], bEnd = candidate.at(-1) as [number, number];
        if (metersBetween(aEnd, bStart) <= 35) current = [...current, ...candidate.slice(1)];
        else if (metersBetween(aEnd, bEnd) <= 35) current = [...current, ...candidate.slice(0, -1).reverse()];
        else if (metersBetween(aStart, bEnd) <= 35) current = [...candidate.slice(0, -1), ...current];
        else if (metersBetween(aStart, bStart) <= 35) current = [...candidate.slice(1).reverse(), ...current];
        else continue;
        remaining.splice(i, 1);
        extended = true;
        break;
      }
    }
    joined.push(current);
  }
  return joined;
}

function projectToPath(point: [number, number], path: number[][]): { distance: number; along: number } {
  let best = { distance: Infinity, along: 0 };
  let accumulated = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i] as [number, number];
    const end = path[i + 1] as [number, number];
    const length = metersBetween(start, end);
    const latitude = (start[1] + end[1] + point[1] * 2) * Math.PI / 720;
    const sx = start[0] * 111320 * Math.cos(latitude), sy = start[1] * 110574;
    const ex = end[0] * 111320 * Math.cos(latitude), ey = end[1] * 110574;
    const px = point[0] * 111320 * Math.cos(latitude), py = point[1] * 110574;
    const vx = ex - sx, vy = ey - sy;
    const fraction = Math.max(0, Math.min(1, ((px - sx) * vx + (py - sy) * vy) / Math.max(1, vx * vx + vy * vy)));
    const nearest = [sx + vx * fraction, sy + vy * fraction];
    const distance = Math.hypot(px - nearest[0], py - nearest[1]);
    if (distance < best.distance) best = { distance, along: accumulated + fraction * length };
    accumulated += length;
  }
  return best;
}

export function buildFareGraph(stations: StationFeature[], routes: RailRouteFeature[], candidates: InterchangeCandidate[]): FareGraph {
  const nodes = new Map<string, FareGraphNode>();
  const edges: FareGraphEdge[] = [];
  const lineNodes = new Map<string, FareGraphNode[]>();
  for (const station of stations) {
    if (station.geometry.type !== 'Point') continue;
    const sourceName = String(station.properties['name:th'] ?? station.properties['name'] ?? '');
    if (/ซอย|ตรงข้าม|วินจักรยานยนต์|สะพานเจริญผล|ตลาดโบ๊เบ๊|ผ่านฟ้าลีลาศ|สะพานหัวช้าง|บ้านสีลม|พาต้าปิ่นเกล้า|เซ็นทรัล|ท่ารถสีลม|สีลม พลาซ่า|โรงพยาบาลสมเด็จพระปิ่นเกล้า|ก่อนสะพาน|หลังสะพาน|พระปิ่นเกล้า|สุขุมวิท 71/.test(sourceName)) continue;
    const stationId = String(station.id ?? station.properties['osm_id'] ?? station.properties['name']);
    const coordinates = station.geometry.coordinates as [number, number];
    for (const line of lineFor(station)) {
      const id = `${stationId}@${line}`;
      const rawName = stationName(station, 'name');
      const name = stationName(station, 'name:en') || (/^[\x00-\x7F]*$/.test(rawName) ? rawName : '') || '';
      const node: FareGraphNode = {
        id, stationId,
        nameTh: stationName(station, 'name:th') || stationName(station, 'name') || stationId,
        nameEn: name || ENGLISH_STATION_NAMES[stationName(station, 'name:th') || stationName(station, 'name')] || '',
        line, operator: operatorForLine(line),
        coordinates,
      };
      nodes.set(id, node);
      const lineList = lineNodes.get(line) ?? [];
      lineList.push(node);
      lineNodes.set(line, lineList);
    }
  }

  for (const route of routes) {
    const line = String(route.properties['line'] ?? '');
    const stationsOnLine = lineNodes.get(line) ?? [];
    for (const path of joinConnectedPaths(flattenPaths(route))) {
      const ordered = stationsOnLine
        .map((node) => ({ node, ...projectToPath(node.coordinates, path) }))
        .filter((item) => item.distance <= MAX_STATION_TO_TRACK_METERS)
        .sort((a, b) => a.along - b.along);
      for (let i = 1; i < ordered.length; i++) {
        const from = ordered[i - 1].node;
        const to = ordered[i].node;
        if (from.id === to.id) continue;
        const distanceMeters = Math.abs(ordered[i].along - ordered[i - 1].along);
        if (edges.some((edge) => edge.type === 'ride' && edge.line === line && ((edge.from === from.id && edge.to === to.id) || (edge.from === to.id && edge.to === from.id)))) continue;
        edges.push({ from: from.id, to: to.id, line, operator: from.operator, type: 'ride', distanceMeters });
      }
    }
  }

  for (const pair of candidates.filter((candidate) => candidate.verified)) {
    if (!nodes.has(pair.from.nodeId) || !nodes.has(pair.to.nodeId)) continue;
    edges.push({ from: pair.from.nodeId, to: pair.to.nodeId, line: `${pair.from.line} / ${pair.to.line}`, operator: pair.from.operator, type: 'transfer', distanceMeters: pair.distanceMeters });
  }
  const adjacency = new Map<string, FareGraphEdge[]>();
  for (const edge of edges) {
    for (const [from, to] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      const list = adjacency.get(from) ?? [];
      list.push({ ...edge, from, to });
      adjacency.set(from, list);
    }
  }
  return { nodes, edges, adjacency };
}

export function findFareRoute(graph: FareGraph, fromStationId: string, toStationId: string): FareRoute | null {
  const starts = [...graph.nodes.values()].filter((node) => node.stationId === fromStationId).map((node) => node.id);
  const ends = new Set([...graph.nodes.values()].filter((node) => node.stationId === toStationId).map((node) => node.id));
  if (!starts.length || !ends.size) return null;
  if (fromStationId === toStationId) return null;
  const distance = new Map<string, number>();
  const previous = new Map<string, FareGraphEdge>();
  const visited = new Set<string>();
  for (const start of starts) distance.set(start, 0);
  while (true) {
    let current: string | null = null;
    let best = Infinity;
    for (const [node, cost] of distance) if (!visited.has(node) && cost < best) { best = cost; current = node; }
    if (current === null) return null;
    if (ends.has(current)) break;
    visited.add(current);
    for (const edge of graph.adjacency.get(current) ?? []) {
      const next = edge.to;
      const weight = edge.type === 'transfer' ? TRANSFER_PENALTY : 1;
      const candidate = best + weight;
      if (candidate < (distance.get(next) ?? Infinity)) { distance.set(next, candidate); previous.set(next, edge); }
    }
  }
  const end = [...ends].sort((a, b) => (distance.get(a) ?? Infinity) - (distance.get(b) ?? Infinity))[0];
  const pathEdges: FareGraphEdge[] = [];
  let cursor = end;
  while (previous.has(cursor)) { const edge = previous.get(cursor)!; pathEdges.unshift(edge); cursor = edge.from; }
  const pathNodes = [graph.nodes.get(cursor)!, ...pathEdges.map((edge) => graph.nodes.get(edge.to)!)];
  if (pathNodes.length < 2) return null;
  const lineSegments: FareRoute['lineSegments'] = [];
  for (let i = 0; i < pathEdges.length; i++) {
    const edge = pathEdges[i];
    if (edge.type === 'transfer') continue;
    let segment = lineSegments.at(-1);
    if (!segment || segment.line !== edge.line) {
      segment = { line: edge.line, operator: edge.operator, stations: [pathNodes[i]] };
      lineSegments.push(segment);
    }
    segment.stations.push(pathNodes[i + 1]);
  }
  const transfers = pathEdges.flatMap((edge, index) => edge.type === 'transfer' ? [pathNodes[index], pathNodes[index + 1]] : []);
  const operators = [...new Set(pathEdges.filter((edge) => edge.type === 'ride').map((edge) => edge.operator))];
  return { nodes: pathNodes, edges: pathEdges, lineSegments, transfers, transferCount: pathEdges.filter((edge) => edge.type === 'transfer').length, stationCount: new Set(pathNodes.map((node) => node.stationId)).size, operators, cost: distance.get(end) ?? Infinity };
}

export function routeDistanceFare(route: FareRoute, operator: string, fareEntry: { status: string; fareRuleType: string | null; fareTable: unknown[] }): { amount: number | null; reason: string } {
  if (fareEntry.status !== 'available' || !fareEntry.fareTable.length) return { amount: null, reason: 'Official fare table is unavailable for the selected operator.' };
  const operatorLegs: FareGraphEdge[][] = [];
  let activeLeg: FareGraphEdge[] | null = null;
  for (let i = 0; i < route.edges.length; i++) {
    const edge = route.edges[i];
    if (edge.type === 'transfer') {
      if (route.nodes[i].operator !== route.nodes[i + 1].operator) activeLeg = null;
      continue;
    }
    if (edge.operator !== operator) { activeLeg = null; continue; }
    if (!activeLeg) { activeLeg = []; operatorLegs.push(activeLeg); }
    activeLeg.push(edge);
  }
  if (!operatorLegs.length) return { amount: 0, reason: '' };
  const table = fareEntry.fareTable as Record<string, number>[];
  let total = 0;
  for (const rides of operatorLegs) {
    let amount: number | undefined;
    if (fareEntry.fareRuleType === 'flat') amount = table[0]?.['amount'];
    else if (fareEntry.fareRuleType === 'by station count') {
      const stationCount = new Set(rides.flatMap((edge) => [edge.from.split('@')[0], edge.to.split('@')[0]])).size;
      amount = table.find((item) => item['stationCount'] === stationCount)?.['amount'];
      if (!Number.isFinite(amount)) return { amount: null, reason: `No fare table row for ${stationCount} stations.` };
    } else if (fareEntry.fareRuleType === 'by distance') {
      const distanceMeters = rides.reduce((sum, edge) => sum + edge.distanceMeters, 0);
      amount = table.filter((item) => item['maxMeters'] >= distanceMeters).sort((a, b) => a['maxMeters'] - b['maxMeters'])[0]?.['amount'];
      if (!Number.isFinite(amount)) return { amount: null, reason: `No distance fare row for ${Math.round(distanceMeters)} metres.` };
    } else return { amount: null, reason: 'Fare rule type is missing or unsupported.' };
    if (!Number.isFinite(amount)) return { amount: null, reason: 'Fare value is missing from fares.json.' };
    total += amount!;
  }
  return { amount: total, reason: '' };
}
