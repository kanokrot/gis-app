import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import LabelClass from '@arcgis/core/layers/support/LabelClass.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import Point from '@arcgis/core/geometry/Point.js';
import ArcGISMap from '@arcgis/core/Map.js';
import SimpleRenderer from '@arcgis/core/renderers/SimpleRenderer.js';
import UniqueValueRenderer from '@arcgis/core/renderers/UniqueValueRenderer.js';
import { contains } from '@arcgis/core/geometry/geometryEngine.js';
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol.js';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol.js';
import PictureMarkerSymbol from '@arcgis/core/symbols/PictureMarkerSymbol.js';
import TextSymbol from '@arcgis/core/symbols/TextSymbol.js';
import Polyline from '@arcgis/core/geometry/Polyline.js';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils.js';
import MapView from '@arcgis/core/views/MapView.js';
import fareData from '../../../assets/data/fares.json';
import { buildFareGraph, FareGraph, FareGraphNode, FareRoute, findFareRoute, InterchangeCandidate, operatorForLine, routeDistanceFare, StationFeature, RailRouteFeature } from './fare-routing';
import transitData from './transit-access-data.json';
import { AccessDistanceId, accessShare, bilingualDistrictName, canonicalDistrictName, formatAccessShare, formatPopulation } from './transit-access-utils';

type DistrictRecord = typeof transitData.districts[number];
interface RailLineProperties {
  line?: string;
  name?: string;
  'name:th'?: string;
  network?: string;
  colour?: string;
  [key: string]: unknown;
}

type RailLineCollection = {
  type: 'FeatureCollection';
  features: { type: 'Feature'; properties: RailLineProperties; geometry: { type: string; coordinates: unknown } }[];
};
type RailStationsCollection = {
  type: 'FeatureCollection';
  features: { type: 'Feature'; id?: string | number; properties: Record<string, unknown>; geometry: { type: string; coordinates: number[] } }[];
};

interface DistanceOption {
  id: AccessDistanceId;
  label: string;
  shortLabel: string;
}

interface MapLabel {
  text: string;
  x: number;
  y: number;
}

const DISTRICT_SERVICE = 'https://services1.arcgis.com/jSaRWj2TDlcN1zOC/ArcGIS/rest/services/TH_Bangkok_District/FeatureServer/0';
const RAIL_LINES_URL = new URL('/assets/data/bangkok-rail-lines.geojson', document.baseURI).toString();
const RAIL_STATIONS_URL = new URL('/assets/data/bangkok-rail-stations.geojson', document.baseURI).toString();
const RAIL_INTERCHANGES_URL = new URL('/assets/data/rail-interchanges.json', document.baseURI).toString();
const THERMAL_COLORS = ['#2f6bff', '#00e5d0', '#7dff4a', '#ffd400', '#ff4d2e'];
const RAIL_FALLBACKS = [
  { line: 'BTS Sukhumvit', color: '#7ac943', match: /sukhumvit|สุขุมวิท/i },
  { line: 'BTS Silom', color: '#00775a', match: /silom|สีลม/i },
  { line: 'BTS Gold', color: '#d9a441', match: /gold|สีทอง/i },
  { line: 'MRT Blue', color: '#2a62d6', match: /mrt\s*blue|blue.*mrt|สีน้ำเงิน/i },
  { line: 'MRT Purple', color: '#9b4dca', match: /purple|สีม่วง/i },
  { line: 'MRT Yellow', color: '#f5c400', match: /yellow|สีเหลือง/i },
  { line: 'MRT Pink', color: '#f06292', match: /pink|สีชมพู/i },
  { line: 'Airport Rail Link', color: '#e53935', match: /airport rail|airport link|\barl\b|ท่าอากาศยาน/i },
  { line: 'SRT Light Red', color: '#ff7b6b', match: /light red|สีแดงอ่อน/i },
  { line: 'SRT Dark Red', color: '#a3202f', match: /dark red|สีแดงเข้ม|srt.*red|red.*srt|สายสีแดง/i },
];
const DISTANCES: readonly DistanceOption[] = [
  { id: '400m', label: '400 m · Public transport layer', shortLabel: '400 m' },
  { id: '500mBusStop', label: '500 m · Bus-stop layer', shortLabel: '500 m · Bus' },
  { id: '1000m', label: '1,000 m · Public transport layer', shortLabel: '1,000 m' },
];

@Component({
  selector: 'app-transit-access-page',
  standalone: true,
  templateUrl: './transit-access-page.html',
  styleUrl: './transit-access-page.css',
})
export class TransitAccessPage implements AfterViewInit, OnDestroy {
  @ViewChild('mapNode', { static: true }) private mapNode!: ElementRef<HTMLDivElement>;
  @ViewChild('panelNode', { static: true }) private panelNode!: ElementRef<HTMLElement>;
  private readonly title = inject(Title);
  private view: MapView | null = null;
  private districtLayer: FeatureLayer | null = null;
  private districtLayerView: __esri.FeatureLayerView | null = null;
  private railCasingLayer: GeoJSONLayer | null = null;
  private railLinesLayer: GeoJSONLayer | null = null;
  private railStationsLayer: GeoJSONLayer | null = null;
  private regularStationsLayer: GeoJSONLayer | null = null;
  private stationHaloLayer: GraphicsLayer | null = null;
  private regularHaloLayer: GraphicsLayer | null = null;
  private stationCoreLayer: GraphicsLayer | null = null;
  private routeHighlightLayer: GraphicsLayer | null = null;
  private fareGraph: FareGraph | null = null;
  private stationFeatures: StationFeature[] = [];
  private fareOperators = fareData.operators;
  private stationHalos: { graphic: Graphic; district: DistrictRecord | null; size: number }[] = [];
  private haloImageCache = new Map<string, string>();
  private railColors: { line: string; color: string }[] = [];
  private railDataUrl: string | null = null;
  private districtGraphics = new Map<string, Graphic>();
  private selectionGraphics: Graphic[] = [];
  private geometryExtents: __esri.Extent[] = [];
  private eventHandles: { remove(): void }[] = [];
  private highlightHandle: __esri.Handle | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private hoverFrame = 0;
  private hoverSequence = 0;
  private pendingPointer: { x: number; y: number } | null = null;
  private destroyed = false;

  readonly distance = signal<AccessDistanceId>('400m');
  readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly railLoadState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly railErrors = signal<string[]>([]);
  readonly railVisible = signal(true);
  readonly halosVisible = signal(false);
  readonly dockExpanded = signal(this.readPreference('transit-access-dock-expanded', this.defaultDockExpanded()));
  readonly rankingExpanded = signal(false);
  readonly railLegend = signal<{ line: string; color: string }[]>([]);
  readonly selectedDistrict = signal<DistrictRecord | null>(null);
  readonly fareCardOpen = signal(this.defaultPlannerExpanded());
  readonly fareEndpoint = signal<'from' | 'to'>('from');
  readonly fromSearch = signal('');
  readonly toSearch = signal('');
  readonly fromStationId = signal('');
  readonly toStationId = signal('');
  readonly fareMessage = signal('Choose an origin and destination station.');
  readonly fareMode = signal<'current' | 'common-2027'>('current');
  readonly fareResult = signal('');
  readonly fareRoute = signal<FareRoute | null>(null);
  readonly fareStationOptions = signal<FareGraphNode[]>([]);
  readonly hoveredDistrict = signal<string | null>(null);
  readonly tooltip = signal<MapLabel | null>(null);
  readonly mapCoordinates = signal('13.7500° N  ·  100.5500° E');
  readonly distances = DISTANCES;
  readonly data = transitData;

  constructor() {
    this.title.setTitle('Bangkok Transit Access Explorer — Kanokrot Sribuabun');
  }

  ngAfterViewInit(): void {
    const map = new ArcGISMap({ basemap: 'dark-gray-vector' });
    this.view = new MapView({
      container: this.mapNode.nativeElement,
      map,
      center: [100.55, 13.75],
      zoom: 10,
      constraints: { minZoom: 9, maxZoom: 18, snapToZoom: false, rotationEnabled: false },
      background: { color: '#09090b' },
      ui: { components: [] },
    });
    this.view.ui.padding = { left: 0, top: 0, right: 0, bottom: 0 };
    this.resizeObserver = new ResizeObserver(() => this.updateViewPadding());
    this.resizeObserver.observe(this.panelNode.nativeElement);
    window.addEventListener('resize', this.updateViewPadding);
    this.view.when().then(async () => {
      if (this.destroyed || !this.view) return;
      this.view.map?.basemap?.baseLayers.forEach((layer) => layer.opacity = 0.32);
      this.view.map?.basemap?.referenceLayers.forEach((layer) => layer.visible = false);
      this.eventHandles.push(reactiveUtils.watch(() => this.view?.zoom, () => {
        this.refreshStationHalos();
        this.refreshRailWidths();
      }));
      this.updateViewPadding();
      this.eventHandles.push(this.view.on('click', (event) => void this.selectMapTarget(event)));
      this.eventHandles.push(this.view.on('pointer-move', (event) => this.scheduleHover(event)));
      await this.loadDistricts();
    }).catch(() => {
      if (!this.destroyed) this.loadState.set('error');
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.eventHandles.forEach((handle) => handle.remove());
    this.highlightHandle?.remove();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.updateViewPadding);
    if (this.hoverFrame) cancelAnimationFrame(this.hoverFrame);
    if (this.railDataUrl) URL.revokeObjectURL(this.railDataUrl);
    this.view?.destroy();
    this.view = null;
  }

  readonly updateViewPadding = (): void => {
    if (!this.view) return;
    const wideLayout = window.innerWidth >= 650;
    const dockHeight = this.panelNode.nativeElement.getBoundingClientRect().height;
    const plannerWidth = Math.min(372, window.innerWidth - 32);
    const padding = {
      left: wideLayout ? Math.min(170, window.innerWidth * 0.18) : 0,
      top: 64,
      right: wideLayout ? plannerWidth + 32 : 0,
      bottom: dockHeight + 64,
    };
    this.view.padding = padding;
  };

  selectDistance(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as AccessDistanceId;
    this.selectDistanceId(value);
  }

  selectDistanceId(value: AccessDistanceId): void {
    if (!DISTANCES.some((option) => option.id === value)) return;
    this.distance.set(value);
    if (this.districtLayer) this.districtLayer.renderer = this.buildRenderer();
    this.refreshStationHalos();
  }

  toggleRailLayers(): void {
    const visible = !this.railVisible();
    this.railVisible.set(visible);
    if (this.railCasingLayer) this.railCasingLayer.visible = visible;
    if (this.railLinesLayer) this.railLinesLayer.visible = visible;
    if (this.railStationsLayer) this.railStationsLayer.visible = visible;
    if (this.regularStationsLayer) this.regularStationsLayer.visible = visible;
    if (this.stationHaloLayer) this.stationHaloLayer.visible = visible && this.halosVisible();
    if (this.regularHaloLayer) this.regularHaloLayer.visible = visible && this.halosVisible();
    if (this.stationCoreLayer) this.stationCoreLayer.visible = visible;
  }

  toggleHalos(): void {
    const visible = !this.halosVisible();
    this.halosVisible.set(visible);
    if (this.stationHaloLayer) this.stationHaloLayer.visible = visible && this.railVisible();
    if (this.regularHaloLayer) this.regularHaloLayer.visible = visible && this.railVisible();
  }

  toggleDock(): void {
    const expanded = !this.dockExpanded();
    this.dockExpanded.set(expanded);
    this.writePreference('transit-access-dock-expanded', expanded);
    this.updateViewPadding();
  }

  zoomBy(delta: number): void {
    if (!this.view) return;
    const zoom = this.view.zoom + delta;
    this.view.zoom = Math.max(9, Math.min(18, zoom));
  }

  toggleRanking(): void {
    const expanded = !this.rankingExpanded();
    this.rankingExpanded.set(expanded);
    this.writePreference('transit-access-ranking-expanded', expanded);
  }

  toggleFareCard(): void {
    this.fareCardOpen.update((open) => !open);
    if (!this.fareCardOpen()) this.fareEndpoint.set('from');
  }

  stationOptions(endpoint: 'from' | 'to'): FareGraphNode[] {
    const query = (endpoint === 'from' ? this.fromSearch() : this.toSearch()).trim().toLocaleLowerCase();
    const byStation = new Map<string, FareGraphNode>();
    for (const node of this.fareStationOptions()) {
      if (!query || `${node.nameTh} ${node.nameEn} ${node.line}`.toLocaleLowerCase().includes(query)) {
        if (!byStation.has(node.stationId)) byStation.set(node.stationId, node);
      }
    }
    return [...byStation.values()]
      .sort((a, b) => {
        const score = (node: FareGraphNode): number => !query ? 0
          : node.nameTh.toLocaleLowerCase() === query || node.nameEn.toLocaleLowerCase() === query ? 0
            : node.nameTh.toLocaleLowerCase().startsWith(query) || node.nameEn.toLocaleLowerCase().startsWith(query) ? 1 : 2;
        return score(a) - score(b) || a.nameEn.localeCompare(b.nameEn) || a.nameTh.localeCompare(b.nameTh);
      })
      .slice(0, 8);
  }

  updateStationSearch(endpoint: 'from' | 'to', event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    if (endpoint === 'from') { this.fromSearch.set(query); this.fromStationId.set(''); }
    else { this.toSearch.set(query); this.toStationId.set(''); }
    this.calculateFareRoute();
  }

  handleStationKeydown(event: KeyboardEvent, endpoint: 'from' | 'to'): void {
    const options = this.stationOptions(endpoint);
    if (event.key === 'Enter' && options.length) {
      event.preventDefault();
      this.chooseFareStation(endpoint, options[0]);
    } else if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault();
      document.getElementById(`${endpoint}-station-option-0`)?.focus();
    } else if (event.key === 'Escape') {
      if (endpoint === 'from') this.fromSearch.set(''); else this.toSearch.set('');
    }
  }

  handleStationOptionKeydown(event: KeyboardEvent, endpoint: 'from' | 'to', index: number): void {
    const options = this.stationOptions(endpoint);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
      document.getElementById(`${endpoint}-station-option-${next}`)?.focus();
    } else if (event.key === 'Escape') {
      (document.getElementById(`${endpoint}-station-search`) as HTMLInputElement | null)?.focus();
    } else if (event.key === 'Enter' && options[index]) {
      event.preventDefault();
      this.chooseFareStation(endpoint, options[index]);
      (document.getElementById(`${endpoint}-station-search`) as HTMLInputElement | null)?.focus();
    }
  }

  chooseFareStation(endpoint: 'from' | 'to', node: FareGraphNode): void {
    if (endpoint === 'from') {
      this.fromStationId.set(node.stationId);
      this.fromSearch.set(this.stationLabel(node));
    } else {
      this.toStationId.set(node.stationId);
      this.toSearch.set(this.stationLabel(node));
    }
    this.calculateFareRoute();
  }

  stationLabel(node: FareGraphNode): string {
    return node.nameEn ? `${node.nameEn} / ${node.nameTh}` : node.nameTh;
  }

  selectExampleRoute(from: string, to: string): void {
    const find = (name: string): FareGraphNode | undefined => this.fareStationOptions().find((node) => node.nameEn.toLocaleLowerCase() === name.toLocaleLowerCase());
    const origin = find(from);
    const destination = find(to);
    if (!origin || !destination) return;
    this.chooseFareStation('from', origin);
    this.chooseFareStation('to', destination);
  }

  transferPairs(route: FareRoute): [FareGraphNode, FareGraphNode][] {
    const pairs: [FareGraphNode, FareGraphNode][] = [];
    for (let index = 0; index + 1 < route.transfers.length; index += 2) pairs.push([route.transfers[index], route.transfers[index + 1]]);
    return pairs;
  }

  operatorColor(operator: string): string {
    return ({ BTS: '#73c947', BTS_GOLD: '#d9a441', BEM_MRT_BLUE: '#2a62d6', MRTA_PURPLE: '#9b4dca', MRT_YELLOW: '#e6c51c', MRT_PINK: '#f06292', ARL: '#e53935', SRT_RED: '#ff7b6b' } as Record<string, string>)[operator] ?? '#aeb9c9';
  }

  lineColor(line: string): string {
    return this.railColors.find((item) => item.line === line)?.color ?? '#00e5d0';
  }

  swapFareStations(): void {
    const fromId = this.fromStationId();
    const fromLabel = this.fromSearch();
    this.fromStationId.set(this.toStationId());
    this.fromSearch.set(this.toSearch());
    this.toStationId.set(fromId);
    this.toSearch.set(fromLabel);
    this.calculateFareRoute();
  }

  setFareMode(mode: 'current' | 'common-2027'): void {
    if (mode === 'common-2027') return;
    this.fareMode.set(mode);
    this.calculateFareRoute();
  }

  fareBreakdown(): { key: string; name: string; sourceUrl: string; asOf: string; amount: number | null; message: string }[] {
    const route = this.fareRoute();
    if (!route) return [];
    return route.operators.map((key) => {
      const fare = this.fareOperators[key as keyof typeof fareData.operators];
      const result = routeDistanceFare(route, key, fare);
      return { key, name: fare?.name ?? key, sourceUrl: fare?.sourceUrl ?? '', asOf: fare?.asOf ?? '', amount: result.amount, message: result.amount === null ? `Fare unavailable for ${fare?.name ?? key}` : `${result.amount} THB` };
    });
  }

  fareTotal(): number | null {
    const breakdown = this.fareBreakdown();
    return breakdown.length && breakdown.every((entry) => entry.amount !== null)
      ? breakdown.reduce((sum, entry) => sum + (entry.amount ?? 0), 0)
      : null;
  }

  fareSources(): { name: string; url: string }[] {
    const selected = this.fareBreakdown().filter((entry) => entry.sourceUrl).map((entry) => ({ name: entry.name, url: entry.sourceUrl }));
    return selected.length ? selected : Object.values(this.fareOperators).map((entry) => ({ name: entry.name, url: entry.sourceUrl }));
  }

  fareAsOfText(): string {
    const dates = this.fareBreakdown().map((entry) => entry.asOf).filter(Boolean);
    return dates.length ? [...new Set(dates)].join(', ') : 'not published';
  }

  private calculateFareRoute(): void {
    if (!this.fareGraph || !this.fromStationId() || !this.toStationId()) {
      this.fareRoute.set(null);
      this.fareResult.set('');
      this.clearRouteHighlight();
      this.fareMessage.set('Choose an origin and destination station.');
      return;
    }
    if (this.fareMode() === 'common-2027') {
      this.fareRoute.set(null);
      this.clearRouteHighlight();
      this.fareMessage.set('Common fare rules are a disabled placeholder until official rules are published.');
      return;
    }
    const route = findFareRoute(this.fareGraph, this.fromStationId(), this.toStationId());
    this.fareRoute.set(route);
    this.fareResult.set('');
    if (!route) {
      this.clearRouteHighlight();
      this.fareMessage.set(this.fromStationId() === this.toStationId() ? 'Choose two different stations.' : 'No route found using verified rail links. Unverified interchanges are excluded.');
      return;
    }
    this.fareMessage.set(`${route.stationCount} stations · ${route.transferCount} verified interchange${route.transferCount === 1 ? '' : 's'}`);
    this.drawRouteHighlight(route);
  }

  private drawRouteHighlight(route: FareRoute): void {
    if (!this.view?.map) return;
    this.clearRouteHighlight();
    if (this.railLinesLayer) this.railLinesLayer.opacity = 0.25;
    if (this.railCasingLayer) this.railCasingLayer.opacity = 0.25;
    if (this.stationHaloLayer) this.stationHaloLayer.opacity = 0.25;
    if (this.regularHaloLayer) this.regularHaloLayer.opacity = 0.25;
    const layer = new GraphicsLayer({ title: 'Fare calculator route highlight', listMode: 'hide' });
    for (const edge of route.edges) {
      const path = [this.fareGraph!.nodes.get(edge.from)!.coordinates, this.fareGraph!.nodes.get(edge.to)!.coordinates];
      const geometry = new Polyline({ paths: [path], spatialReference: { wkid: 4326 } });
      if (edge.type === 'transfer') {
        layer.add(new Graphic({ geometry, symbol: new SimpleLineSymbol({ color: '#ffffff', width: 2, style: 'dash', cap: 'round', join: 'round' }) }));
      } else {
        layer.add(new Graphic({ geometry, symbol: new SimpleLineSymbol({ color: '#ffffff', width: 15, cap: 'round', join: 'round' }) }));
        layer.add(new Graphic({ geometry, symbol: new SimpleLineSymbol({ color: this.lineColor(edge.line), width: 9, cap: 'round', join: 'round' }) }));
      }
    }
    const from = route.nodes[0], to = route.nodes.at(-1)!;
    for (const [node, label, color] of [[from, 'A', '#00e5d0'], [to, 'B', '#ff4d2e']] as const) {
      const geometry = new Point({ longitude: node.coordinates[0], latitude: node.coordinates[1], spatialReference: { wkid: 4326 } });
      layer.add(new Graphic({ geometry, symbol: new SimpleMarkerSymbol({ style: 'circle', size: 7.5, color, outline: { color: '#ffffff', width: 1.1 } }) }));
      layer.add(new Graphic({ geometry, symbol: new TextSymbol({ text: `${label} · ${node.nameEn}`, color: '#ffffff', haloColor: '#020409', haloSize: 3, yoffset: 14, font: { family: 'Arial', size: 10, weight: 'bold' } }) }));
    }
    for (const [index, node] of route.transfers.entries()) {
      const geometry = new Point({ longitude: node.coordinates[0], latitude: node.coordinates[1], spatialReference: { wkid: 4326 } });
      layer.add(new Graphic({ geometry, symbol: new TextSymbol({ text: node.nameEn, color: '#ffffff', haloColor: '#020409', haloSize: 3, xoffset: index % 2 ? 34 : -34, yoffset: -12, font: { family: 'Arial', size: 9, weight: 'bold' } }) }));
    }
    this.routeHighlightLayer = layer;
    this.view.map.add(layer);
    const routePoints = route.nodes.map((node) => node.coordinates);
    const center: [number, number] = [
      routePoints.reduce((sum, point) => sum + point[0], 0) / routePoints.length,
      routePoints.reduce((sum, point) => sum + point[1], 0) / routePoints.length,
    ];
    void this.view.goTo({ center }, { duration: 250 }).catch(() => undefined);
  }

  private clearRouteHighlight(): void {
    if (this.routeHighlightLayer && this.view?.map) this.view.map.remove(this.routeHighlightLayer);
    this.routeHighlightLayer = null;
    if (this.railLinesLayer) this.railLinesLayer.opacity = 1;
    if (this.railCasingLayer) this.railCasingLayer.opacity = 1;
    if (this.stationHaloLayer) this.stationHaloLayer.opacity = 1;
    if (this.regularHaloLayer) this.regularHaloLayer.opacity = 1;
  }

  getShare(record: DistrictRecord, id: AccessDistanceId): number | null {
    return accessShare(record.metrics[id]);
  }

  formatShare(record: DistrictRecord, id: AccessDistanceId): string {
    return formatAccessShare(record.metrics[id]);
  }

  formatPopulation(value: number | null | undefined): string {
    return formatPopulation(value);
  }

  distanceLabel(id: AccessDistanceId): string {
    return DISTANCES.find((option) => option.id === id)?.shortLabel ?? id;
  }

  topDistricts(): DistrictRecord[] {
    return [...transitData.districts]
      .sort((a, b) => (this.getShare(b, '500mBusStop') ?? -1) - (this.getShare(a, '500mBusStop') ?? -1))
      .slice(0, 5);
  }

  sortedDistricts(): DistrictRecord[] {
    return [...transitData.districts].sort((a, b) => (this.getShare(b, this.distance()) ?? -1) - (this.getShare(a, this.distance()) ?? -1));
  }

  rankFor(record: DistrictRecord, id: AccessDistanceId): number | string {
    if (this.getShare(record, id) === null) return 'No rank';
    return this.sortedDistricts().findIndex((item) => item.district === record.district) + 1;
  }

  accessColor(share: number | null): string {
    if (share === null) return '#687384';
    const bucket = Math.max(0, Math.min(4, Math.floor(share / 20)));
    return THERMAL_COLORS[bucket];
  }

  histogramHeight(record: DistrictRecord): number {
    return Math.max(2, Math.min(100, (this.getShare(record, this.distance()) ?? 0)));
  }

  selectFromList(record: DistrictRecord): void {
    this.selectDistrict(record);
    const graphic = this.districtGraphics.get(record.district);
    const extent = graphic?.geometry?.extent;
    if (extent && this.view) void this.view.goTo({ target: extent.expand(1.45) }, { duration: 350 }).catch(() => undefined);
  }

  clearMapHover(): void {
    this.hoverSequence++;
    this.tooltip.set(null);
    this.hoveredDistrict.set(null);
    this.mapNode.nativeElement.style.cursor = 'default';
    const selected = this.selectedDistrict();
    const graphic = selected ? this.districtGraphics.get(selected.district) : undefined;
    if (graphic && this.districtLayerView) {
      this.highlightHandle?.remove();
      this.highlightHandle = this.districtLayerView.highlight(graphic);
    } else {
      this.highlightHandle?.remove();
      this.highlightHandle = null;
    }
  }

  bilingualName(name: string): string {
    return bilingualDistrictName(name);
  }

  selectedSummary(): DistrictRecord | null {
    return this.selectedDistrict();
  }

  private async loadDistricts(): Promise<void> {
    try {
      const source = new FeatureLayer({
        url: DISTRICT_SERVICE,
        title: 'Bangkok district boundaries',
        outFields: ['AMP_NAMT', 'AMP_NAME', 'PROV_CODE'],
        popupEnabled: false,
      });
      const result = await source.queryFeatures({
        where: "PROV_CODE = '10'",
        outFields: ['AMP_NAMT', 'AMP_NAME', 'PROV_CODE'],
        returnGeometry: true,
        outSpatialReference: { wkid: 4326 },
      });
      if (this.destroyed) return;
      const records = new Map(transitData.districts.map((record) => [record.district, record]));
      const features: Graphic[] = [];
      let objectId = 1;
      for (const feature of result.features) {
        const sourceNames = [feature.attributes['AMP_NAMT'], feature.attributes['AMP_NAME']]
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
        const canonicalName = sourceNames.map(canonicalDistrictName).find((name) => name !== null);
        const record = canonicalName ? records.get(canonicalName) : undefined;
        if (!record || !feature.geometry) continue;
        const geometryExtent = feature.geometry.extent;
        if (!geometryExtent) continue;
        this.geometryExtents.push(geometryExtent);
        const graphic = new Graphic({
          geometry: feature.geometry,
          attributes: {
            OBJECTID: objectId++, district: record.district,
            share400: accessShare(record.metrics['400m']),
            share500: accessShare(record.metrics['500mBusStop']),
            share1000: accessShare(record.metrics['1000m']),
          },
        });
        this.districtGraphics.set(record.district, graphic);
        features.push(graphic);
      }
      if (features.length < 45) throw new Error('District names did not match the supplied summary table');
      const layer = new FeatureLayer({
        title: 'Population in mapped transit-access areas',
        source: features,
        objectIdField: 'OBJECTID',
        geometryType: 'polygon',
        spatialReference: { wkid: 4326 },
        fields: [
          { name: 'OBJECTID', alias: 'Object ID', type: 'oid' },
          { name: 'district', alias: 'District', type: 'string' },
          { name: 'share400', alias: '400 m population share (%)', type: 'double' },
          { name: 'share500', alias: '500 m bus-stop population share (%)', type: 'double' },
          { name: 'share1000', alias: '1,000 m population share (%)', type: 'double' },
        ],
        popupEnabled: false,
        renderer: this.buildRenderer(),
        labelsVisible: true,
        labelingInfo: [new LabelClass({
          labelExpressionInfo: { expression: '$feature.district' },
          labelPlacement: 'always-horizontal',
          minScale: 50000,
          symbol: new TextSymbol({
            color: '#e6eaf2',
            haloColor: '#020409',
            haloSize: 2,
            font: { family: 'JetBrains Mono', size: 8, weight: 'normal' },
          }),
        })],
      });
      this.districtLayer = layer;
      this.view?.map?.add(layer);
      this.districtLayerView = this.view ? await this.view.whenLayerView(layer) as __esri.FeatureLayerView : null;
      const extent = this.geometryExtents.reduce<__esri.Extent | null>((current, next) => current ? current.union(next) : next.clone(), null);
      if (extent && this.view) await this.view.goTo({ target: extent.expand(1.08), padding: this.view.padding }, { duration: 0 });
      this.loadState.set('ready');
      await this.loadRailLayers();
    } catch {
      if (!this.destroyed) this.loadState.set('error');
    }
  }

  private buildRenderer(): __esri.Renderer {
    return new SimpleRenderer({
      symbol: {
        type: 'simple-fill',
        color: [2, 4, 9, 5],
        outline: { color: [96, 124, 145, 175], width: 0.65 },
      },
    });
  }

  private async loadRailLayers(): Promise<void> {
    const errors: string[] = [];
    const haloLayer = new GraphicsLayer({ title: 'District-level station access halos', visible: false });
    const regularHaloLayer = new GraphicsLayer({ title: 'District-level station access halos', visible: false, minScale: 120000 });
    this.stationHaloLayer = haloLayer;
    this.regularHaloLayer = regularHaloLayer;
    this.view?.map?.addMany([haloLayer, regularHaloLayer]);
    let lineData: RailLineCollection | null = null;
    let stationData: RailStationsCollection | null = null;

    try {
      const response = await fetch(RAIL_LINES_URL);
      if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
      lineData = await response.json() as RailLineCollection;
      if (!lineData?.features.length) throw new Error('GeoJSON contains no rail route features');
    } catch (error) {
      console.error('Rail route data failed to load', { url: RAIL_LINES_URL, error });
      errors.push('Rail routes could not be loaded.');
    }

    if (lineData) {
      try {
        const uniqueLines = new Map<string, string>();
        for (const feature of lineData.features) {
          const line = displayRailLine(feature.properties);
          const color = resolveRailColor(feature.properties);
          feature.properties.colour = color;
          uniqueLines.set(line + '|' + color, line);
        }
        this.railColors = [...uniqueLines].map(([key, line]) => ({ line, color: key.slice(key.lastIndexOf('|') + 1) }));
        this.railLegend.set(this.railColors);
        this.railDataUrl = URL.createObjectURL(new Blob([JSON.stringify(lineData)], { type: 'application/geo+json' }));

        const casingLayer = new GeoJSONLayer({
          url: this.railDataUrl,
          title: 'OpenStreetMap rail route casing',
          copyright: '© OpenStreetMap contributors',
          renderer: this.buildCasingRenderer(),
          outFields: ['*'],
        });
        const lineLayer = new GeoJSONLayer({
          url: this.railDataUrl,
          title: 'OpenStreetMap rail routes',
          copyright: '© OpenStreetMap contributors',
          renderer: this.buildRailCoreRenderer(),
          outFields: ['*'],
        });
        await Promise.all([casingLayer.load(), lineLayer.load()]);
        if (!this.destroyed && this.view) {
          this.railCasingLayer = casingLayer;
          this.railLinesLayer = lineLayer;
          this.view.map?.addMany([casingLayer, lineLayer]);
        }
      } catch (error) {
        console.error('Rail route layers failed to load', { url: RAIL_LINES_URL, error });
        errors.push('Rail routes could not be rendered.');
      }
    }

    let stationLayer: GeoJSONLayer | null = null;
    try {
      const response = await fetch(RAIL_STATIONS_URL);
      if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + response.statusText);
      stationData = await response.json() as RailStationsCollection;
      if (!stationData?.features.length) throw new Error('GeoJSON contains no rail station features');
      stationLayer = new GeoJSONLayer({
        url: RAIL_STATIONS_URL,
        title: 'OpenStreetMap rail stations',
        copyright: '© OpenStreetMap contributors',
        definitionExpression: "interchange = 'yes'",
        outFields: ['*'],
        renderer: new SimpleRenderer({
          symbol: new SimpleMarkerSymbol({ style: 'circle', size: 2.25, color: '#ffffff', outline: { color: [0, 0, 0, 0], width: 0 } }),
        }),
        labelsVisible: true,
        labelingInfo: [
          new LabelClass({
            where: "interchange = 'yes'",
            labelExpressionInfo: { expression: '$feature.name' },
            labelPlacement: 'above-center',
            minScale: 200000,
            symbol: this.stationLabelSymbol(),
          }),
          new LabelClass({
            where: "interchange <> 'yes'",
            labelExpressionInfo: { expression: '$feature.name' },
            labelPlacement: 'above-center',
            minScale: 65000,
            symbol: this.stationLabelSymbol(),
          }),
        ],
      });
      const regularStationsLayer = new GeoJSONLayer({
        url: RAIL_STATIONS_URL,
        title: 'OpenStreetMap rail stations',
        copyright: '© OpenStreetMap contributors',
        definitionExpression: "interchange <> 'yes'",
        minScale: 120000,
        outFields: ['*'],
        renderer: new SimpleRenderer({
          symbol: new SimpleMarkerSymbol({ style: 'circle', size: 2.25, color: '#ffffff', outline: { color: [0, 0, 0, 0], width: 0 } }),
        }),
        labelsVisible: true,
        labelingInfo: [new LabelClass({
          labelExpressionInfo: { expression: '$feature.name' },
          labelPlacement: 'above-center',
          minScale: 65000,
          symbol: this.stationLabelSymbol(),
        })],
      });
      await Promise.all([stationLayer.load(), regularStationsLayer.load()]);
      if (!this.destroyed && this.view) {
        this.railStationsLayer = stationLayer;
        this.regularStationsLayer = regularStationsLayer;
        const stationCoreLayer = new GraphicsLayer({ title: 'Station interchange rings', visible: true, listMode: 'hide' });
        this.stationCoreLayer = stationCoreLayer;
        this.view.map?.addMany([stationCoreLayer, regularStationsLayer, stationLayer]);
      }
    } catch (error) {
      console.error('Rail stations failed to load', { url: RAIL_STATIONS_URL, error });
      errors.push('Rail stations could not be loaded.');
    }

    if (stationData && lineData) {
      try {
        const response = await fetch(RAIL_INTERCHANGES_URL);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const interchangeData = await response.json() as { transfers: InterchangeCandidate[] };
        this.stationFeatures = stationData.features as StationFeature[];
        this.fareGraph = buildFareGraph(this.stationFeatures, lineData.features as RailRouteFeature[], interchangeData.transfers);
        this.fareStationOptions.set([...this.fareGraph.nodes.values()].sort((a, b) => a.nameEn.localeCompare(b.nameEn) || a.nameTh.localeCompare(b.nameTh)));
      } catch (error) {
        console.error('Fare graph could not be built', error);
        errors.push('Fare calculator graph could not be loaded.');
      }
    }

    try {
      if (!stationData) throw new Error('Station data is unavailable; station geometries are required for halos');
      for (const station of stationData.features) {
        if (station.geometry.type !== 'Point') continue;
        const [x, y] = station.geometry.coordinates;
        const stationGeometry = new Point({ longitude: x, latitude: y, spatialReference: { wkid: 4326 } });
        const containing = [...this.districtGraphics.entries()].find(([, district]) =>
          district.geometry && contains(district.geometry, stationGeometry),
        );
        const districtRecord = containing
          ? transitData.districts.find((record) => record.district === containing[0]) ?? null
          : null;
        const interchange = String(station.properties['interchange'] ?? '').toLowerCase() === 'yes';
        const targetLayer = interchange ? haloLayer : regularHaloLayer;
        const size = interchange ? 24 : 16;
        const graphic = new Graphic({ geometry: stationGeometry, symbol: this.stationHaloSymbol(districtRecord, size) });
        targetLayer.add(graphic);
        this.stationHalos.push({ graphic, district: districtRecord, size });
        if (interchange && this.stationCoreLayer) {
          this.stationCoreLayer.add(new Graphic({ geometry: stationGeometry, symbol: new SimpleMarkerSymbol({ style: 'circle', size: 5.25, color: [2, 4, 9, 175], outline: { color: '#ffffff', width: 0.6 } }) }));
        }
      }
    } catch (error) {
      console.error('Access halos failed to load', { url: RAIL_STATIONS_URL, error });
      errors.push('Access halos could not be created from station locations.');
    }

    if (!this.destroyed) {
      this.railErrors.set(errors);
      this.railLoadState.set(errors.length ? 'error' : 'ready');
    }
  }

  private stationHaloSymbol(record: DistrictRecord | null, size: number): PictureMarkerSymbol {
    const color = record ? this.accessColor(this.getShare(record, this.distance())) : '#687384';
    let url = this.haloImageCache.get(color);
    if (!url) {
      const canvas = document.createElement('canvas');
      canvas.width = 48;
      canvas.height = 48;
      const context = canvas.getContext('2d');
      if (context) {
        const gradient = context.createRadialGradient(24, 24, 0, 24, 24, 24);
        gradient.addColorStop(0, `${color}b3`);
        gradient.addColorStop(0.42, `${color}80`);
        gradient.addColorStop(0.72, `${color}24`);
        gradient.addColorStop(1, `${color}00`);
        context.fillStyle = gradient;
        context.fillRect(0, 0, 48, 48);
        url = canvas.toDataURL('image/png');
      } else {
        url = '';
      }
      this.haloImageCache.set(color, url);
    }
    return new PictureMarkerSymbol({ url, width: size, height: size });
  }

  private stationLabelSymbol(): TextSymbol {
    return new TextSymbol({
      color: '#ffffff',
      haloColor: '#020409',
      haloSize: 3.5,
      font: { family: 'Arial', size: 9, weight: 'bold' },
    });
  }

  private railCoreWidth(): number {
    return Math.max(3, Math.min(7, 5 + ((this.view?.zoom ?? 10) - 10) * 0.4));
  }

  private buildRailCoreRenderer(): UniqueValueRenderer {
    const width = this.railCoreWidth();
    return new UniqueValueRenderer({
      field: 'colour',
      uniqueValueInfos: this.railColors.map(({ line, color }) => ({
        value: color,
        label: line,
        symbol: new SimpleLineSymbol({ color, width, style: 'solid', cap: 'round', join: 'round' }),
      })),
      defaultSymbol: new SimpleLineSymbol({ color: '#cfd6e4', width: Math.max(3, width), cap: 'round', join: 'round' }),
    });
  }

  private buildCasingRenderer(): SimpleRenderer {
    return new SimpleRenderer({
      symbol: new SimpleLineSymbol({
        color: '#020409',
        width: this.railCoreWidth() + 3,
        style: 'solid',
        cap: 'round',
        join: 'round',
      }),
    });
  }

  private refreshRailWidths(): void {
    if (this.railLinesLayer) this.railLinesLayer.renderer = this.buildRailCoreRenderer();
    if (this.railCasingLayer) this.railCasingLayer.renderer = this.buildCasingRenderer();
  }

  private refreshStationHalos(): void {
    for (const item of this.stationHalos) item.graphic.symbol = this.stationHaloSymbol(item.district, item.size);
  }

  private defaultPlannerExpanded(): boolean {
    return typeof window === 'undefined' || window.innerWidth >= 900;
  }

  private defaultDockExpanded(): boolean {
    return typeof window === 'undefined' || window.innerWidth >= 900;
  }

  private readPreference(key: string, fallback: boolean): boolean {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value === 'true';
    } catch {
      return fallback;
    }
  }

  private writePreference(key: string, value: boolean): void {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Keep the page usable when browser storage is disabled.
    }
  }

  private async selectMapTarget(event: __esri.ViewClickEvent): Promise<void> {
    if (!this.view) return;
    try {
      const stationLayers = [this.railStationsLayer, this.regularStationsLayer].filter((layer): layer is GeoJSONLayer => !!layer);
      if (stationLayers.length) {
        const stationHit = await this.view.hitTest(event, { include: stationLayers });
        const graphic = stationHit.results.find((item) => item.type === 'graphic')?.graphic;
        if (graphic?.geometry?.type === 'point') {
          const point = graphic.geometry as __esri.Point;
          if (point.longitude == null || point.latitude == null) return;
          let nearest: FareGraphNode | null = null;
          let nearestDistance = Infinity;
          for (const node of this.fareStationOptions()) {
            const distance = Math.hypot((node.coordinates[0] - point.longitude) * 85000, (node.coordinates[1] - point.latitude) * 111000);
            if (distance < nearestDistance) { nearest = node; nearestDistance = distance; }
          }
          if (nearest && nearestDistance < 60) {
            this.fareCardOpen.set(true);
            this.chooseFareStation(this.fareEndpoint(), nearest);
            this.fareEndpoint.set(this.fareEndpoint() === 'from' ? 'to' : 'from');
            return;
          }
        }
      }
      if (!this.districtLayer) return;
      const hit = await this.view.hitTest(event, { include: this.districtLayer });
      const district = hit.results.find((item) => item.type === 'graphic')?.graphic.attributes['district'];
      if (typeof district !== 'string') return;
      const record = transitData.districts.find((item) => item.district === district);
      if (record) this.selectDistrict(record);
    } catch {
      this.selectedDistrict.set(null);
    }
  }

  private selectDistrict(record: DistrictRecord): void {
    this.selectedDistrict.set(record);
    this.hoveredDistrict.set(null);
    const graphic = this.districtGraphics.get(record.district);
    if (graphic && this.districtLayerView) {
      this.highlightHandle?.remove();
      this.highlightHandle = this.districtLayerView.highlight(graphic);
    }
    this.drawSelectionMark(graphic, record);
  }

  private drawSelectionMark(graphic: Graphic | undefined, record: DistrictRecord): void {
    if (!this.view || !graphic?.geometry) return;
    this.selectionGraphics.forEach((item) => this.view?.graphics.remove(item));
    const center = graphic.geometry.extent?.center;
    this.selectionGraphics = [
      new Graphic({
        geometry: graphic.geometry,
        symbol: { type: 'simple-fill', color: [0, 0, 0, 0], outline: { color: [230, 234, 242, 245], width: 2, style: 'dash' } },
      }),
    ];
    if (center) {
      this.selectionGraphics.push(new Graphic({
        geometry: center,
        symbol: { type: 'simple-marker', style: 'cross', size: 20, color: [0, 0, 0, 0], outline: { color: [230, 234, 242, 245], width: 1.5 } },
      }));
      this.selectionGraphics.push(new Graphic({
        geometry: center,
        symbol: new TextSymbol({ text: bilingualDistrictName(record.district), color: '#fff', haloColor: '#020409', haloSize: 3, yoffset: 20, font: { family: 'JetBrains Mono', size: 10, weight: 'bold' } }),
      }));
    }
    this.view.graphics.addMany(this.selectionGraphics);
  }

  private scheduleHover(event: __esri.ViewPointerMoveEvent): void {
    const mapPoint = this.view?.toMap({ x: event.x, y: event.y });
    if (mapPoint?.latitude != null && mapPoint.longitude != null) {
      this.mapCoordinates.set(`${mapPoint.latitude.toFixed(4)}° N  ·  ${mapPoint.longitude.toFixed(4)}° E`);
    }
    this.pendingPointer = { x: event.x, y: event.y };
    if (this.hoverFrame) return;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      const point = this.pendingPointer;
      if (point) void this.inspectHover(point.x, point.y);
    });
  }

  private async inspectHover(x: number, y: number): Promise<void> {
    if (!this.view || !this.districtLayer) return;
    const sequence = ++this.hoverSequence;
    try {
      const hit = await this.view.hitTest({ x, y }, { include: this.districtLayer });
      if (this.destroyed || sequence !== this.hoverSequence) return;
      const district = hit.results.find((item) => item.type === 'graphic')?.graphic.attributes['district'];
      if (typeof district !== 'string') {
        this.tooltip.set(null);
        this.hoveredDistrict.set(null);
        this.highlightHandle?.remove();
        this.highlightHandle = null;
        this.mapNode.nativeElement.style.cursor = 'default';
        return;
      }
      const record = transitData.districts.find((item) => item.district === district);
      if (!record) return;
      this.hoveredDistrict.set(district);
      this.tooltip.set({ text: `${bilingualDistrictName(district)} · ${formatAccessShare(record.metrics[this.distance()])}`, x: Math.min(x + 14, this.mapNode.nativeElement.clientWidth - 200), y: Math.max(8, y - 38) });
      this.mapNode.nativeElement.style.cursor = 'pointer';
      const graphic = this.districtGraphics.get(district);
      if (graphic && this.districtLayerView) {
        this.highlightHandle?.remove();
        this.highlightHandle = this.districtLayerView.highlight(graphic);
      }
    } catch {
      this.tooltip.set(null);
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function resolveRailColor(properties: RailLineProperties): string {
  const source = typeof properties.colour === 'string' ? properties.colour.trim() : '';
  const normalized = /^#[\da-f]{6}$/i.test(source) ? source : /^#[\da-f]{3}$/i.test(source)
    ? '#' + source.slice(1).split('').map((digit) => digit + digit).join('')
    : '';
  if (normalized) {
    const [red, green, blue] = hexToRgb(normalized);
    if (Math.min(red, green, blue) < 230 || Math.max(red, green, blue) - Math.min(red, green, blue) > 18) return normalized;
  }
  const details = [properties.line, properties.name, properties['name:th'], properties.network].filter(Boolean).join(' ');
  return RAIL_FALLBACKS.find((item) => item.match.test(details))?.color ?? '#8793a5';
}

function displayRailLine(properties: RailLineProperties): string {
  const line = String(properties.line ?? properties.name ?? 'Rail route');
  if (/^mrt pink$/i.test(line) && /เมืองทองธานี|extension/i.test(String(properties.name ?? properties['name:th'] ?? ''))) {
    return 'MRT Pink extension';
  }
  if (/^srt red$/i.test(line)) {
    const name = [properties.name, properties['name:th']].filter(Boolean).join(' ');
    if (/light red|สีแดงอ่อน/i.test(name)) return 'SRT Light Red';
    if (/dark red|สีแดงเข้ม/i.test(name)) return 'SRT Dark Red';
  }
  return line;
}

function buildTerminalBadges(stations: RailStationsCollection, routes: RailLineCollection | null): Map<string, { system: string; color: string }[]> {
  const badges = new Map<string, { system: string; color: string }[]>();
  if (!routes) return badges;
  const graphs = new Map<string, { line: string; color: string; neighbors: Map<string, Set<string>>; points: Map<string, number[]> }>();
  for (const feature of routes.features) {
    const line = displayRailLine(feature.properties);
    const color = resolveRailColor(feature.properties);
    const groupKey = line + '|' + color;
    const graph = graphs.get(groupKey) ?? { line, color, neighbors: new Map<string, Set<string>>(), points: new Map<string, number[]>() };
    graphs.set(groupKey, graph);
    const paths = feature.geometry.type === 'LineString'
      ? [feature.geometry.coordinates as number[][]]
      : feature.geometry.type === 'MultiLineString'
        ? feature.geometry.coordinates as number[][][]
        : [];
    for (const path of paths) {
      if (path.length < 2) continue;
      const first = path[0];
      const last = path[path.length - 1];
      const firstKey = coordinateKey(first);
      const lastKey = coordinateKey(last);
      if (firstKey === lastKey) continue;
      graph.points.set(firstKey, first);
      graph.points.set(lastKey, last);
      const firstNeighbors = graph.neighbors.get(firstKey) ?? new Set<string>();
      const lastNeighbors = graph.neighbors.get(lastKey) ?? new Set<string>();
      firstNeighbors.add(lastKey);
      lastNeighbors.add(firstKey);
      graph.neighbors.set(firstKey, firstNeighbors);
      graph.neighbors.set(lastKey, lastNeighbors);
    }
  }

  for (const graph of graphs.values()) {
    const system = /airport rail|\barl\b/i.test(graph.line) ? 'ARL'
      : /^bts/i.test(graph.line) ? 'BTS'
        : /^mrt/i.test(graph.line) ? 'MRT'
          : /^srt/i.test(graph.line) ? 'SRT' : '';
    if (!system) continue;
    const endpoints = [...graph.neighbors].filter(([, neighbors]) => neighbors.size === 1).map(([key]) => graph.points.get(key)!);
    for (const endpoint of endpoints) {
      let nearest: RailStationsCollection['features'][number] | null = null;
      let nearestDistance = Infinity;
      for (const station of stations.features) {
        if (station.geometry.type !== 'Point') continue;
        const distance = distanceMeters(endpoint, station.geometry.coordinates);
        if (distance < nearestDistance) {
          nearest = station;
          nearestDistance = distance;
        }
      }
      if (!nearest || nearestDistance > 250) continue;
      const key = stationIdentity(nearest.properties, nearest.geometry.coordinates);
      const list = badges.get(key) ?? [];
      if (!list.some((item) => item.system === system && item.color === graph.color)) list.push({ system, color: graph.color });
      badges.set(key, list);
    }
  }
  return badges;
}

function stationIdentity(properties: Record<string, unknown>, coordinates: number[]): string {
  const id = properties['osm_id'];
  return id == null ? coordinateKey(coordinates) : String(id);
}

function coordinateKey(coordinates: number[]): string {
  return coordinates[0].toFixed(5) + ',' + coordinates[1].toFixed(5);
}

function distanceMeters(a: number[], b: number[]): number {
  const radians = (value: number) => value * Math.PI / 180;
  const latDelta = radians(b[1] - a[1]);
  const lonDelta = radians(b[0] - a[0]);
  const halfChord = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(lonDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(halfChord), Math.sqrt(1 - halfChord));
}

