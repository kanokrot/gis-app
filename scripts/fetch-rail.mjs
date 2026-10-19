import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'src/assets/data');
const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const bbox = '(13.35,100.10,14.30,101.00)';
const query = `
[out:json][timeout:180];
(
  relation["route"~"^(subway|light_rail|train|monorail)$"]${bbox};
  node["railway"~"^(station|halt|tram_stop)$"]${bbox};
  node["public_transport"~"^(station|stop_position|platform)$"]${bbox};
);
out body geom;
`;

const fallbackPalette = [
  { line: 'BTS Sukhumvit', color: '#7ac943', match: /sukhumvit|สุขุมวิท/ },
  { line: 'BTS Silom', color: '#00775a', match: /silom|สีลม/ },
  { line: 'BTS Gold', color: '#d9a441', match: /gold(?: line)?|สายสีทอง|บีทีเอสสายสีทอง/ },
  { line: 'MRT Blue', color: '#2a62d6', match: /mrt.*blue|blue.*mrt|blue line|สีน้ำเงิน/ },
  { line: 'MRT Purple', color: '#9b4dca', match: /purple|สีม่วง/ },
  { line: 'MRT Yellow', color: '#f5c400', match: /yellow|สีเหลือง/ },
  { line: 'MRT Pink', color: '#f06292', match: /pink|สีชมพู/ },
  { line: 'Airport Rail Link', color: '#e53935', match: /airport rail|airport link|arl/ },
  { line: 'SRT Red', color: '#a3202f', match: /srt.*red|red.*srt|red line|dark red|light red|รถไฟฟ้าสายสีแดง/ },
];

function classify(tags = {}) {
  const names = [tags.name, tags['name:en'], tags['name:th'], tags.ref].filter(Boolean).join(' ').toLocaleLowerCase('en');
  const namedLine = fallbackPalette.find((item) => item.match.test(names));
  if (namedLine) return namedLine;
  const network = [tags.network, tags.operator].filter(Boolean).join(' ').toLocaleLowerCase('en');
  return fallbackPalette.find((item) => item.match.test(network)) ?? null;
}

function routeProperties(element, classification) {
  const tags = element.tags ?? {};
  const osmColour = tags.colour ?? tags.color ?? '';
  return {
    name: tags.name ?? tags['name:en'] ?? tags.ref ?? classification.line,
    'name:th': tags['name:th'] ?? '',
    network: tags.network ?? classification.line,
    operator: tags.operator ?? '',
    colour: osmColour || classification.color,
    colour_source: osmColour ? 'openstreetmap' : 'fallback',
    line: classification.line,
    route_type: tags.route ?? '',
    osm_id: element.id,
  };
}

async function fetchOverpass() {
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'BangkokTransitAccessExplorer/1.0 (OSM data export)',
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(220_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`Overpass endpoint failed: ${endpoint} (${error.message})`);
    }
  }
  throw lastError ?? new Error('No Overpass endpoint responded');
}

function toLineFeatures(elements) {
  const output = [];
  const routeById = new Map();
  for (const relation of elements.filter((item) => item.type === 'relation' && item.tags?.route)) {
    const classification = classify(relation.tags);
    if (!classification) continue;
    const properties = routeProperties(relation, classification);
    const paths = [];
    const seenWays = new Set();
    for (const member of relation.members ?? []) {
      if (member.type !== 'way' || !Array.isArray(member.geometry) || member.geometry.length < 2 || seenWays.has(member.ref)) continue;
      seenWays.add(member.ref);
      paths.push(member.geometry.map(({ lon, lat }) => [lon, lat]));
    }
    if (paths.length) {
      routeById.set(relation.id, { properties, classification });
      output.push({ type: 'Feature', id: `relation-${relation.id}`, properties, geometry: { type: 'MultiLineString', coordinates: paths } });
    }
  }
  return { features: output, routeById };
}

function stationCoordinates(element) {
  if (element.type !== 'node' || !Number.isFinite(element.lon) || !Number.isFinite(element.lat)) return null;
  return [element.lon, element.lat];
}

function distanceMeters(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function stationFeatures(elements, routeById) {
  const routesByStation = new Map();
  for (const relation of elements.filter((item) => item.type === 'relation' && routeById.has(item.id))) {
    const route = routeById.get(relation.id);
    for (const member of relation.members ?? []) {
      if (member.type !== 'node' || !/stop|platform|station/i.test(member.role ?? '')) continue;
      const routes = routesByStation.get(member.ref) ?? [];
      routes.push(route);
      routesByStation.set(member.ref, routes);
    }
  }

  const candidates = [];
  for (const element of elements.filter((item) => item.type === 'node')) {
    const coordinates = stationCoordinates(element);
    if (!coordinates) continue;
    const tags = element.tags ?? {};
    const routes = routesByStation.get(element.id) ?? [];
    const directClassification = classify(tags);
    if (!routes.length && !directClassification) continue;
    const classifications = routes.length ? routes.map((route) => route.classification) : [directClassification];
    const unique = [...new Map(classifications.filter(Boolean).map((item) => [item.line, item])).values()];
    if (!unique.length) continue;
    candidates.push({ element, coordinates, routes, classifications: unique, tags });
  }

  const groups = [];
  for (const candidate of candidates) {
    const rawName = candidate.tags.name ?? candidate.tags['name:en'] ?? candidate.tags['name:th'] ?? `Rail stop ${candidate.element.id}`;
    const normalizedName = rawName.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]/gu, '');
    let group = groups.find((item) => item.normalizedName === normalizedName && distanceMeters(item.coordinates, candidate.coordinates) <= 500);
    if (!group) {
      group = { normalizedName, coordinates: candidate.coordinates, members: [], lines: new Map() };
      groups.push(group);
    }
    group.members.push(candidate);
    candidate.classifications.forEach((line) => group.lines.set(line.line, line));
  }

  return groups.map((group, index) => {
    const first = group.members[0];
    const tags = first.tags;
    const lines = [...group.lines.values()];
    const properties = routeProperties(first.element, lines[0]);
    properties.name = tags.name ?? tags['name:en'] ?? tags.ref ?? properties.name;
    properties['name:th'] = tags['name:th'] ?? '';
    properties.network = tags.network ?? lines.map((line) => line.line).join(' / ');
    properties.operator = tags.operator ?? [...new Set(group.members.flatMap((item) => item.routes.map((route) => route.properties.operator).filter(Boolean)))].join(' / ');
    properties.colour = tags.colour ?? tags.color ?? lines[0].color;
    properties.colour_source = tags.colour || tags.color ? 'openstreetmap' : 'fallback';
    properties.line = lines.map((line) => line.line).join(' / ');
    properties.routeCount = lines.length;
    properties.interchange = lines.length > 1 ? 'yes' : 'no';
    return {
      type: 'Feature', id: `station-${index + 1}`, properties,
      geometry: { type: 'Point', coordinates: group.coordinates },
    };
  });
}

const elements = (await fetchOverpass()).elements ?? [];
const lineResult = toLineFeatures(elements);
const stations = stationFeatures(elements, lineResult.routeById);
if (!lineResult.features.length) throw new Error('No target rail route relation geometries were found in the requested bounding box.');
if (!stations.length) throw new Error('No target rail station nodes were found in the requested bounding box.');

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'bangkok-rail-lines.geojson'), `${JSON.stringify({ type: 'FeatureCollection', features: lineResult.features })}\n`);
await writeFile(resolve(outDir, 'bangkok-rail-stations.geojson'), `${JSON.stringify({ type: 'FeatureCollection', features: stations })}\n`);
console.log(`Wrote ${lineResult.features.length} rail route features and ${stations.length} grouped station features to ${outDir}`);
