import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../src/assets/data/bangkok-rail-stations.geojson', import.meta.url);
const outputPath = new URL('../src/assets/data/rail-interchanges.json', import.meta.url);
const stations = JSON.parse(await readFile(sourcePath, 'utf8')).features;
const linesFor = (feature) => String(feature.properties.line || feature.properties.network || '')
  .split(' / ').map((line) => line.trim()).filter(Boolean);
const operatorFor = (line) => line.startsWith('BTS') ? 'BTS'
  : line === 'Airport Rail Link' ? 'ARL'
    : line === 'MRT Blue' ? 'BEM_MRT_BLUE'
      : line === 'MRT Purple' ? 'MRTA_PURPLE'
        : line === 'MRT Yellow' ? 'MRT_YELLOW'
          : line === 'MRT Pink' ? 'MRT_PINK'
            : line.startsWith('SRT') ? 'SRT_RED' : 'UNKNOWN';
const distanceMeters = (a, b) => {
  const radians = Math.PI / 180;
  const latitude = (a[1] + b[1]) * radians / 2;
  const dx = (b[0] - a[0]) * radians * Math.cos(latitude) * 6371000;
  const dy = (b[1] - a[1]) * radians * 6371000;
  return Math.hypot(dx, dy);
};
const pairKey = (a, b) => [a, b].sort().join('|');
const pairs = new Map();
const officialReview = new Map([
  ['station-113|BTS Gold|BTS Silom', 'https://www.bts.co.th/eng/info/GoldLine-info-history.html'],
  ['station-50|MRT Blue|MRT Purple', 'https://www.mrta.co.th/en/chaloem-ratchamongkhon-line/27808'],
  ['station-103|MRT Blue|SRT Red|station-30', 'https://www.srtet.co.th/en/station-information?id=1'],
  ['station-4|Airport Rail Link|BTS Sukhumvit', 'https://btsapp1.bts.co.th/WebApplication/storage_file/files/AW_Travelling_Back_Printed_Dec18.pdf'],
  ['station-26|MRT Blue|MRT Yellow', 'https://www.mrta.co.th/en/news-release/13688'],
  ['station-109|BTS Sukhumvit|MRT Pink', 'https://www.mrta.co.th/en/search-result?category_id=25'],
  ['station-44|BTS Silom|BTS Sukhumvit', 'https://btsapp1.bts.co.th/WebApplication/storage_file/files/AW_Travelling_Back_Printed_Dec18.pdf'],
  ['station-28|BTS Sukhumvit|MRT Blue|station-76', 'https://btsapp1.bts.co.th/WebApplication/storage_file/files/AW_Travelling_Back_Printed_Dec18.pdf'],
  ['station-74|BTS Sukhumvit|MRT Yellow', 'https://www.mrta.co.th/en/the-yellow-line'],
  ['station-21|BTS Silom|MRT Blue', 'https://btsapp1.bts.co.th/WebApplication/storage_file/files/AW_Travelling_Back_Printed_Dec18.pdf'],
  ['station-19|BTS Sukhumvit|MRT Blue', 'https://btsapp1.bts.co.th/WebApplication/storage_file/files/AW_Travelling_Back_Printed_Dec18.pdf'],
  ['station-66|MRT Pink|SRT Red', 'https://www.mrta.co.th/en/search-result?category_id=25'],
  ['station-43|BTS Silom|MRT Blue', 'https://btsapp1.bts.co.th/WebApplication/storage_file/files/AW_Travelling_Back_Printed_Dec18.pdf'],
  ['station-13|BTS Sukhumvit|MRT Blue|station-19', 'https://btsapp1.bts.co.th/WebApplication/storage_file/files/AW_Travelling_Back_Printed_Dec18.pdf']
]);
const addPair = (from, fromLine, to, toLine, meters) => {
  if (fromLine === toLine) return;
  const fromNode = `${from.id}@${fromLine}`;
  const toNode = `${to.id}@${toLine}`;
  const key = pairKey(fromNode, toNode);
  if (pairs.has(key)) return;
  const stationPair = [from.id, to.id].sort();
  const linePair = [fromLine, toLine].sort();
  const reviewKey = stationPair.length > 1 && stationPair[0] !== stationPair[1]
    ? `${stationPair[0]}|${linePair.join('|')}|${stationPair[1]}`
    : `${stationPair[0]}|${linePair.join('|')}`;
  const officialSource = officialReview.get(reviewKey);
  const verified = Boolean(officialSource);
  pairs.set(key, {
    from: { nodeId: fromNode, stationId: from.id, stationName: from.properties.name, line: fromLine, operator: operatorFor(fromLine) },
    to: { nodeId: toNode, stationId: to.id, stationName: to.properties.name, line: toLine, operator: operatorFor(toLine) },
    distanceMeters: Math.round(meters), verified,
    verificationNote: verified ? `Reviewed against the official interchange/route source: ${officialSource}` : 'Generated from OSM line tags / proximity. Review an official route map or station source before enabling this transfer.',
    verificationSourceUrl: officialSource ?? null
  });
};

for (const station of stations) {
  const lines = linesFor(station);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) addPair(station, lines[i], station, lines[j], 0);
  }
}
for (let i = 0; i < stations.length; i++) {
  for (let j = i + 1; j < stations.length; j++) {
    const a = stations[i];
    const b = stations[j];
    const distance = distanceMeters(a.geometry.coordinates, b.geometry.coordinates);
    if (distance > 250) continue;
    for (const aLine of linesFor(a)) for (const bLine of linesFor(b)) {
      if (aLine !== bLine && operatorFor(aLine) !== operatorFor(bLine)) addPair(a, aLine, b, bLine, distance);
    }
  }
}

const result = {
  schemaVersion: 1,
  generatedFrom: 'bangkok-rail-stations.geojson',
  candidateRadiusMeters: 250,
  policy: 'Candidates default to unverified and are excluded from routing until reviewed against an authoritative station or route source. Verified entries include their official review source.',
  transfers: [...pairs.values()].sort((a, b) => a.from.stationName.localeCompare(b.from.stationName) || a.from.line.localeCompare(b.from.line) || a.to.line.localeCompare(b.to.line))
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${result.transfers.length} candidates (${result.transfers.filter((transfer) => !transfer.verified).length} unverified).`);
