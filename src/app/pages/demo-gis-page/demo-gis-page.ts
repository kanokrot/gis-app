import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import Map from '@arcgis/core/Map.js';
import MapView from '@arcgis/core/views/MapView.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import VectorTileLayer from '@arcgis/core/layers/VectorTileLayer.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import CSVLayer from '@arcgis/core/layers/CSVLayer.js';
import FeatureFilter from '@arcgis/core/layers/support/FeatureFilter.js';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils.js';
import ScaleBar from '@arcgis/core/widgets/ScaleBar.js';
import LOD from '@arcgis/core/layers/support/LOD.js';
import Point from '@arcgis/core/geometry/Point.js';
import Polyline from '@arcgis/core/geometry/Polyline.js';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine.js';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils.js';

const ORANGE = '#ff8a3d';
const FARE_STOPS = [
  { percentile: 0.05, color: '#7c3aed' },
  { percentile: 0.35, color: '#d946ef' },
  { percentile: 0.65, color: '#fb923c' },
  { percentile: 0.95, color: '#fde047' },
];
type FareStop = { value: number; color: string };
const FARE_GRADIENT = `linear-gradient(90deg, ${FARE_STOPS.map((stop) => stop.color).join(', ')})`;
const TAXI_BLOOM = 'bloom(0.9, 0.7px, 0.12)';
const TRANSPORT_BLOOM = 'bloom(0.45, 0.4px, 0)';
const HISTOGRAM_BINS = 12;
const TAXI_BIN_MAX_SCALE = 40000;
const TAXI_MACRO_SCALE = 1000000;
const TAXI_BIN_LEVEL = 6;
const TAXI_BIN_LABEL_MIN = 10;
const TAXI_MIN_ZOOM = 4;
const MAP_MAX_ZOOM = 23;
const TRANSPORT_OVERZOOM = 24;
const POI_LABELING_INFO = [{
  labelExpressionInfo: {
    expression: 'IIF(IsEmpty($feature.name), $feature.name_en, $feature.name)',
  },
  where: 'name IS NOT NULL OR name_en IS NOT NULL',
  labelPlacement: 'above-center',
  deconflictionStrategy: 'static',
  minScale: 20000,
  maxScale: 0,
  symbol: {
    type: 'text',
    color: '#f5f0ff',
    haloColor: '#0b0816',
    haloSize: 1.75,
    font: { family: 'Noto Sans Thai', size: 12, weight: 'bold' },
  },
}];
const TAXI_COORDINATE_WHERE = 'pickup_latitude >= 40.4 AND pickup_latitude <= 41 AND pickup_longitude >= -74.3 AND pickup_longitude <= -73.6';
const TAXI_FIELDS = ['fare_amount', 'passenger_count', 'pickup_datetime', 'pickup_latitude', 'pickup_longitude'];
type TaxiHistogram = {
  bins: { start: number; end: number; count: number; color: string; label: string; tail?: 'low' | 'high' | 'missing' }[];
  count: number;
  min: number | null;
  max: number | null;
  lowerPercentile: number | null;
  upperPercentile: number | null;
  nonPositive: number;
  lowerTail: number;
  upperTail: number;
  unpriced: number;
};

function formatNumber(value: number, fractionDigits: 0 | 2 = 0): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function savedFareDistributionExpanded(): boolean {
  try {
    return typeof window === 'undefined' || window.sessionStorage.getItem('housebuy:fare-distribution-expanded') !== 'false';
  } catch {
    return true;
  }
}

function formatFare(value: number): string {
  return `${value < 0 ? '-$' : '$'}${formatNumber(Math.abs(value), 2)}`;
}

function parseFare(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const fare = Number(value);
  return Number.isFinite(fare) ? fare : null;
}

type TaxiCoordinateGroup = 'zero' | 'missing' | 'outside' | 'valid';

function coordinateGroup(attributes: Record<string, unknown>): TaxiCoordinateGroup {
  const rawLatitude = attributes['pickup_latitude'];
  const rawLongitude = attributes['pickup_longitude'];
  if (rawLatitude === null || rawLatitude === undefined || rawLatitude === ''
    || rawLongitude === null || rawLongitude === undefined || rawLongitude === '') return 'missing';
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'missing';
  if (latitude === 0 || longitude === 0) return 'zero';
  if (latitude < 40.4 || latitude > 41 || longitude < -74.3 || longitude > -73.6) return 'outside';
  return 'valid';
}

function percentile(sortedValues: number[], fraction: number): number {
  const position = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

function taxiRenderer(byFare: boolean, fareStops: FareStop[]): any {
  return {
    type: 'simple',
    symbol: {
      type: 'simple-marker',
      size: 5,
      color: [255, 138, 61, 0.85],
      outline: { width: 0 },
    },
    visualVariables: [
      ...(byFare && fareStops.length ? [{ type: 'color', field: 'fare_amount', stops: fareStops }] : []),
      { type: 'size', field: 'fare_amount', stops: [{ value: 5, size: 4 }, { value: 30, size: 10 }] },
    ],
  };
}

function taxiBinning(byFare: boolean, fareStops: FareStop[]): any {
  return {
    type: 'binning',
    fixedBinLevel: TAXI_BIN_LEVEL,
    maxScale: TAXI_BIN_MAX_SCALE,
    labelsVisible: true,
    fields: [
      { name: 'ride_count', onStatisticField: 'fare_amount', statisticType: 'count' },
      { name: 'average_fare', onStatisticField: 'fare_amount', statisticType: 'avg' },
    ],
    renderer: {
      type: 'simple',
      symbol: {
        type: 'simple-fill',
        color: byFare && fareStops.length ? fareStops[0].color : ORANGE,
        outline: { color: [124, 58, 237, 0.45], width: 0.5 },
      },
      visualVariables: byFare && fareStops.length ? [{ type: 'color', field: 'average_fare', stops: fareStops }] : [],
    },
    labelingInfo: [{
      labelExpressionInfo: { expression: `IIF($feature.ride_count >= ${TAXI_BIN_LABEL_MIN}, Text($feature.ride_count, '#,###'), '')` },
      symbol: {
        type: 'text', color: '#f5f0ff', haloColor: '#0b0816', haloSize: 1.75,
        font: { family: 'Noto Sans Thai', size: 12, weight: 'bold' },
      },
      labelPlacement: 'center-center',
      deconflictionStrategy: 'static',
    }],
    popupEnabled: false,
    popupTemplate: {
      title: 'Taxi fares in this area',
      outFields: ['ride_count', 'average_fare'],
      content: (event: any) => {
        const attrs = event.graphic.attributes ?? {};
        const countValue = attrs.ride_count == null ? null : Number(attrs.ride_count);
        const count = countValue === null ? '—' : `${formatNumber(countValue)} ${countValue === 1 ? 'ride' : 'rides'}`;
        const averageFare = Number(attrs.average_fare);
        const average = attrs.average_fare == null ? '—' : Number.isFinite(averageFare) ? formatFare(averageFare) : escapeHtml(attrs.average_fare);
        const color = Number.isFinite(averageFare) ? fareColor(averageFare, fareStops) : '#ffffff';
        return `<div class="taxi-popup"><div class="taxi-popup__fare" style="color:${color}">${escapeHtml(count)}</div><div class="taxi-popup__row"><span>Average fare</span><b>${escapeHtml(average)}</b></div></div>`;
      },
      overwriteActions: true,
      actions: [],
    },
  };
}

function fareColor(value: number, fareStops: FareStop[]): string {
  if (!Number.isFinite(value)) return '#ffffff';
  if (!fareStops.length) return FARE_STOPS[0].color;
  if (value <= fareStops[0].value) return fareStops[0].color;
  for (let i = 1; i < fareStops.length; i++) {
    const upper = fareStops[i];
    const lower = fareStops[i - 1];
    if (value <= upper.value) {
      const t = (value - lower.value) / (upper.value - lower.value);
      const a = lower.color.match(/[\da-f]{2}/gi)!.map((v) => parseInt(v, 16));
      const b = upper.color.match(/[\da-f]{2}/gi)!.map((v) => parseInt(v, 16));
      return `rgb(${a.map((channel, index) => Math.round(channel + (b[index] - channel) * t)).join(',')})`;
    }
  }
  return fareStops[fareStops.length - 1].color;
}

function encodeGeohash(longitude: number, latitude: number, precision: number): string {
  const alphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
  let lonMin = -180, lonMax = 180, latMin = -90, latMax = 90;
  let isLongitude = true, bit = 0, character = 0, hash = '';
  while (hash.length < precision) {
    if (isLongitude) {
      const midpoint = (lonMin + lonMax) / 2;
      if (longitude >= midpoint) { character |= 1 << (4 - bit); lonMin = midpoint; } else lonMax = midpoint;
    } else {
      const midpoint = (latMin + latMax) / 2;
      if (latitude >= midpoint) { character |= 1 << (4 - bit); latMin = midpoint; } else latMax = midpoint;
    }
    isLongitude = !isLongitude;
    if (bit < 4) bit++;
    else { hash += alphabet[character]; bit = 0; character = 0; }
  }
  return hash;
}

function deriveFareStops(features: any[]): { stops: FareStop[]; populatedBins: number; eligibleBins: number; groupedRides: number } {
  const bins = new globalThis.Map<string, { rides: number; pricedRides: number; sum: number }>();
  let groupedRides = 0;
  for (const feature of features) {
    const attributes = feature.attributes ?? {};
    if (coordinateGroup(attributes) !== 'valid') continue;
    const fare = parseFare(attributes.fare_amount);
    const latitude = Number(attributes.pickup_latitude);
    const longitude = Number(attributes.pickup_longitude);
    const key = encodeGeohash(longitude, latitude, TAXI_BIN_LEVEL);
    const bin = bins.get(key) ?? { rides: 0, pricedRides: 0, sum: 0 };
    bin.rides++;
    if (fare !== null) {
      bin.pricedRides++;
      bin.sum += fare;
    }
    bins.set(key, bin);
    groupedRides++;
  }
  const means = [...bins.values()]
    .filter((bin) => bin.rides >= TAXI_BIN_LABEL_MIN && bin.pricedRides > 0)
    .map((bin) => bin.sum / bin.pricedRides)
    .sort((a, b) => a - b);
  const stops = means.length
    ? FARE_STOPS.map((stop) => ({ value: percentile(means, stop.percentile), color: stop.color }))
    : [];
  return { stops, populatedBins: bins.size, eligibleBins: means.length, groupedRides };
}

function fareGradient(stops: FareStop[]): string {
  if (stops.length < 2) return FARE_GRADIENT;
  const min = stops[0].value;
  const span = stops[stops.length - 1].value - min;
  const colorStops = stops.map((stop) => `${stop.color} ${span > 0 ? ((stop.value - min) / span * 100).toFixed(2) : 0}%`);
  return `linear-gradient(90deg, ${colorStops.join(', ')})`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

// Known transportation classes use dedicated neon hues; remaining line layers use the orange fallback.
function neonFor(sourceLayer: string): string {
  if (sourceLayer.startsWith('EXPRESSWAY')) return ORANGE;
  if (sourceLayer.startsWith('L_TRANS_DOUBLE')) return '#d946ef';
  if (sourceLayer.startsWith('L_TRANS_SINGLELINE')) return '#d946ef';
  if (sourceLayer.startsWith('RAILWAY')) return '#8b5cf6';
  if (sourceLayer.startsWith('MASSTRANSIT')) return '#8b5cf6';
  if (sourceLayer.startsWith('BOAT') || sourceLayer.startsWith('FERRY')) return '#a78bfa';
  return ORANGE;
}

@Component({
  selector: 'app-demo-gis-page',
  templateUrl: './demo-gis-page.html',
  styleUrl: './demo-gis-page.css',
})
export class DemoGisPage implements AfterViewInit, OnDestroy {
  @ViewChild('mapViewNode', { static: true }) private mapViewEl!: ElementRef<HTMLDivElement>;
  @ViewChild('scaleBarNode', { static: true }) private scaleBarEl!: ElementRef<HTMLDivElement>;
  @ViewChild('rightPanel') private rightPanelEl?: ElementRef<HTMLElement>;

  readonly minZoom = TAXI_MIN_ZOOM;
  readonly maxZoom = MAP_MAX_ZOOM;
  mapZoom = signal(14);
  map: Map | null = null;
  mapView: MapView | null = null;

  transportOn = signal(true);
  poiOn = signal(true);
  taxiOn = signal(false);
  byFare = signal(true);
  taxiLoading = signal(false);
  taxiCount = signal<number | null>(null);
  taxiAverage = signal<number | null>(null);
  taxiMaximum = signal<number | null>(null);
  taxiHistogramCount = signal<number | null>(null);
  taxiExcludedCount = signal<number | null>(null);
  taxiRawCount = signal<number | null>(null);
  taxiNonPositive = signal<number | null>(null);
  taxiLowerPercentile = signal<number | null>(null);
  taxiUpperPercentile = signal<number | null>(null);
  taxiLowerTail = signal(0);
  taxiUpperTail = signal(0);
  taxiBins = signal<TaxiHistogram['bins']>([]);
  taxiFareMin = signal<number | null>(null);
  taxiFareMax = signal<number | null>(null);
  taxiDomainMin = signal<number | null>(null);
  taxiDomainMax = signal<number | null>(null);
  passengerMode = signal<'all' | '1' | '2' | '3+'>('all');
  taxiSourceNotice = signal(false);
  taxiAnalysisExpanded = signal(true);
  fareDistributionExpanded = signal(savedFareDistributionExpanded());
  panelCollapsed = signal(false);
  rightPanelOpen = signal(false);
  rightPanelTab = signal<'analysis' | 'selection'>('analysis');
  transportZoomLabel = signal('Vector tile · checking style');
  mapRotation = signal(0);
  cursorCoordinates = signal('');
  satelliteBasemap = signal(false);
  selectedTaxi = signal<{ kind: 'point' | 'bin'; fare?: number | null; passengers?: string; pickup?: string; rides?: number | null; averageFare?: number | null; longitude?: number; latitude?: number; widthKm?: number; heightKm?: number } | null>(null);
  selectedPoi = signal<{ title: string; latitude: number | null; longitude: number | null; tags: { key: string; value: string }[] } | null>(null);
  fareStops = signal<FareStop[]>([]);
  fareGradient = signal(FARE_GRADIENT);

  private drawLayer = new GraphicsLayer();
  private boundaryLayer = new GraphicsLayer();
  private taxiMacroLayer = new GraphicsLayer({ visible: false, title: 'NYC taxi data' });
  private taxiSelectionLayer = new GraphicsLayer({ title: 'Selected taxi feature' });

  private transportLayer = new VectorTileLayer({
    url: 'https://tiles.arcgis.com/tiles/jSaRWj2TDlcN1zOC/arcgis/rest/services/Thailand_Transportation/VectorTileServer',
    effect: TRANSPORT_BLOOM,
  });

  private poiLayer = new FeatureLayer({
    url: 'https://services-ap1.arcgis.com/iA7fZQOnjY9D67Zx/ArcGIS/rest/services/OSM_AS_POIs/FeatureServer/0',
    outFields: ['*'],
    minScale: 20000,
    renderer: {
      type: 'simple',
      symbol: { type: 'simple-marker', size: 5, color: [255, 79, 163, 0.9], outline: { width: 0 } },
    } as any,
    popupEnabled: false,
  });

  private heatLayer = new FeatureLayer({
    url: 'https://services-ap1.arcgis.com/iA7fZQOnjY9D67Zx/ArcGIS/rest/services/OSM_AS_POIs/FeatureServer/0',
    maxScale: 20000,
    labelsVisible: false,
    labelingInfo: [],
    renderer: {
      type: 'heatmap',
      radius: 12,
      colorStops: [
        { ratio: 0, color: 'rgba(13,8,135,0)' },
        { ratio: 0.2, color: 'rgba(106,0,168,0.55)' },
        { ratio: 0.45, color: 'rgba(177,42,144,0.75)' },
        { ratio: 0.7, color: 'rgba(252,166,54,0.9)' },
        { ratio: 1, color: 'rgba(240,249,33,1)' },
      ],
    } as any,
  });

  private provinceLayer = new FeatureLayer({
    url: 'https://services1.arcgis.com/jSaRWj2TDlcN1zOC/ArcGIS/rest/services/Thailand_Province_Boundaries_view/FeatureServer/1',
    outFields: ['*'],
  });

  private taxiLayer = new CSVLayer({
    url: 'https://raw.githubusercontent.com/jeffprosise/Machine-Learning/refs/heads/master/Data/taxi-fares.csv',
    copyright: 'New York City Taxi Data',
    latitudeField: 'pickup_latitude',
    longitudeField: 'pickup_longitude',
    outFields: TAXI_FIELDS,
    popupEnabled: false,
    visible: false,
    effect: TAXI_BLOOM,
    featureReduction: taxiBinning(true, []),
    renderer: taxiRenderer(true, []),
    popupTemplate: {
      title: 'Taxi ride',
      outFields: TAXI_FIELDS,
      overwriteActions: true,
      actions: [],
      content: (event: any) => {
        const attrs = event.graphic.attributes ?? {};
        const rawFare = attrs.fare_amount;
        const fare = parseFare(rawFare);
        const fareText = rawFare == null ? '—' : fare !== null ? formatFare(fare) : escapeHtml(rawFare);
        const rawPassengers = attrs.passenger_count;
        const passengers = rawPassengers == null
          ? '—'
          : Number.isFinite(Number(rawPassengers)) ? formatNumber(Number(rawPassengers)) : escapeHtml(rawPassengers);
        const rawPickup = attrs.pickup_datetime;
        const date = rawPickup == null ? null : new Date(rawPickup);
        const pickup = rawPickup == null
          ? '—'
          : date && !Number.isNaN(date.getTime())
            ? escapeHtml(new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date))
            : escapeHtml(rawPickup);
        const fareStyle = fare !== null ? ` style="color:${fareColor(fare, this.fareStops())}"` : '';
        return `<div class="taxi-popup"><div class="taxi-popup__fare"${fareStyle}>${fareText}</div><div class="taxi-popup__row"><span>Passengers</span><b>${passengers}</b></div><div class="taxi-popup__row"><span>Pickup time</span><b>${pickup}</b></div></div>`;
      },
    },
  });

  private taxiLayerView: any = null;
  private transportLayerView: any = null;
  private transportOriginalLineAudit: any[] = [];
  private appliedReferenceOpacity: number | null = null;
  private appliedReferenceBasemap: string | null = null;
  private stationaryHandle: { remove(): void } | null = null;
  private scaleHandle: { remove(): void } | null = null;
  private zoomHandle: { remove(): void } | null = null;
  private popupHandle: { remove(): void } | null = null;
  private rotationHandle: { remove(): void } | null = null;
  private clickHandle: { remove(): void } | null = null;
  private pointerHandle: { remove(): void } | null = null;
  private transportDiagnosticHandle: { remove(): void } | null = null;
  private scaleBar: ScaleBar | null = null;
  private pointerFrame: number | null = null;
  private focusFrame: number | null = null;
  private pendingMapPoint: Point | null = null;
  private taxiCentroid: [number, number] | null = null;
  private taxiFilteredCount = 0;
  private taxiDisplayMode: 'macro' | 'city' | 'street' | null = null;
  private transportStyleExtended = false;
  private refreshTimer: number | null = null;
  private noticeTimer: number | null = null;
  private queryVersion = 0;
  private destroyed = false;
  private taxiHistogramCache = new globalThis.Map<string, TaxiHistogram>();

  ngAfterViewInit(): void {
    this.map = new Map({
      basemap: 'dark-gray-vector', // If this fails to load, try 'streets-night-vector'.
      layers: [this.heatLayer, this.poiLayer, this.taxiLayer, this.transportLayer, this.taxiMacroLayer, this.boundaryLayer, this.drawLayer, this.taxiSelectionLayer],
    });

    this.mapView = new MapView({
      container: this.mapViewEl.nativeElement,
      map: this.map,
      center: [100.5347, 13.7466], // Siam area
      zoom: 14, // Transportation layers start appearing at zoom 14.
      background: { color: '#07060f' },
      constraints: {
        minZoom: TAXI_MIN_ZOOM,
        maxZoom: MAP_MAX_ZOOM,
        snapToZoom: true,
        rotationEnabled: true,
      },
      ui: { components: ['attribution'] },
    });

    this.mapView.popup = { dockEnabled: false } as any;
    this.scaleHandle = reactiveUtils.watch(() => this.mapView!.scale, (scale) => this.applyTaxiScale(scale));
    this.zoomHandle = reactiveUtils.watch(() => this.mapView!.zoom, (zoom) => this.mapZoom.set(zoom));
    this.rotationHandle = reactiveUtils.watch(() => this.mapView!.rotation, (rotation) => this.mapRotation.set(rotation));
    this.applyTaxiScale(this.mapView.scale);
    this.scaleBar = new ScaleBar({ view: this.mapView, container: this.scaleBarEl.nativeElement, unit: 'metric', style: 'line' });
    this.pointerHandle = this.mapView.on('pointer-move', (event) => {
      this.pendingMapPoint = event.mapPoint ?? null;
      if (this.pointerFrame !== null) return;
      this.pointerFrame = window.requestAnimationFrame(() => {
        this.pointerFrame = null;
        const point = this.pendingMapPoint;
        if (!point) return;
        const geographic = webMercatorUtils.webMercatorToGeographic(point) as Point;
        if (geographic.latitude == null || geographic.longitude == null) return;
        this.cursorCoordinates.set(`${geographic.latitude.toFixed(4)}, ${geographic.longitude.toFixed(4)}`);
      });
    });
    this.clickHandle = this.mapView.on('click', (event) => { void this.handleMapClick(event); });
    const basemap = this.map.basemap;
    basemap?.load().then(async () => {
      await this.mapView?.when();
      this.extendBasemapLODsFromActiveView();
      this.logBasemapReferenceLayers(basemap);
      this.applyBasemapOpacity();
      this.logBasemapZoomLimits('initial-basemap-loaded');
    }).catch((error) => console.warn('basemap styling', error));
    void this.poiLayer.load().then(() => this.applyPoiLabels()).catch((error) => {
      console.error('[POI labels] service layer load failed', error);
    });
    this.mapView.whenLayerView(this.taxiLayer).then((layerView) => {
      if (this.destroyed) return;
      this.taxiLayerView = layerView;
      this.applyTaxiFilter();
      this.applyTaxiScale(this.mapView!.scale);
      this.stationaryHandle = reactiveUtils.watch(() => this.mapView!.stationary, (stationary) => {
        if (stationary && this.taxiOn()) this.scheduleTaxiRefresh();
      });
      if (this.taxiOn()) this.scheduleTaxiRefresh();
    }).catch((error) => { if (!this.destroyed) console.error('taxi layer view', error); });
    this.mapView.whenLayerView(this.transportLayer).then((layerView) => {
      if (this.destroyed) return;
      this.transportLayerView = layerView;
      this.logTransportState('layer-view-created');
      this.transportDiagnosticHandle = reactiveUtils.watch(() => this.mapView!.stationary, (stationary) => {
        if (stationary) this.logTransportState('view-stationary');
      });
    }).catch((error) => { if (!this.destroyed) console.error('transport layer view', error); });
    this.mapView.when().then(() => {
      if (!this.destroyed && this.taxiOn()) this.scheduleTaxiRefresh();
    }).catch(() => undefined);

    this.transportLayer.when(() => { void this.extendTransportZoomRange(); }).catch((e) => {
      this.transportZoomLabel.set('Thailand · style load failed');
      console.error('transport layer', e);
    });
  }

  private extendBasemapLODsFromActiveView(): void {
    const view = this.mapView;
    const basemapLayers = (this.map?.basemap as any)?.baseLayers?.toArray?.() ?? [];
    const tiledBaseLayer = basemapLayers.find((layer: any) => layer.tileInfo?.lods?.length);
    const nativeLods = tiledBaseLayer?.tileInfo?.lods ?? (view as any)?.constraintsInfo?.lods ?? view?.constraints.effectiveLODs;
    if (!view || !nativeLods?.length) {
      console.warn('[Basemap zoom] native basemap LODs unavailable; retaining the basemap-provided range');
      return;
    }
    const lodSource = tiledBaseLayer ? `${tiledBaseLayer.type} tileInfo` : (view as any).constraintsInfo?.lods ? 'MapView constraintsInfo' : 'effective MapView LODs';
    const before = { center: view.center?.toJSON(), zoom: view.zoom, extent: view.extent?.toJSON() };
    const lods = nativeLods.map((lod: any) => new LOD({ level: lod.level, scale: lod.scale, resolution: lod.resolution }));
    let last = lods[lods.length - 1];
    while (last.level < MAP_MAX_ZOOM) {
      last = new LOD({ level: last.level + 1, scale: last.scale / 2, resolution: last.resolution / 2 });
      lods.push(last);
    }
    view.constraints.lods = lods;
    console.info('[Basemap zoom] extended native LOD grid for overzoom', {
      lodSource,
      nativeLastLevel: nativeLods[nativeLods.length - 1].level,
      nativeLastScale: nativeLods[nativeLods.length - 1].scale,
      appliedLastLevel: lods[lods.length - 1].level,
      appliedLastScale: lods[lods.length - 1].scale,
      before,
      after: { center: view.center?.toJSON(), zoom: view.zoom, extent: view.extent?.toJSON() },
      effectiveMinZoom: view.constraints.effectiveMinZoom,
      effectiveMaxZoom: view.constraints.effectiveMaxZoom,
      effectiveLODCount: view.constraints.effectiveLODs?.length ?? 0,
    });
  }

  private async extendTransportZoomRange(): Promise<void> {
    if (this.transportStyleExtended) return;
    const style = (this.transportLayer as any).currentStyleInfo?.style;
    if (!style || !Array.isArray(style.layers)) {
      this.transportZoomLabel.set('Thailand · zoom range unavailable');
      this.applyNeon();
      return;
    }
    const originalMaxZoom = Math.max(0, ...style.layers.map((layer: any) => Number(layer.maxzoom ?? 0)));
    const sourceMaxZooms = Object.fromEntries(Object.entries(style.sources ?? {}).map(([id, source]: [string, any]) => [id, source.maxzoom ?? null]));
    const originalLineLayers = style.layers.filter((layer: any) => layer.type === 'line').map((layer: any) => ({
      id: layer.id,
      sourceLayer: layer['source-layer'] ?? null,
      minzoom: layer.minzoom ?? 0,
      maxzoom: layer.maxzoom ?? null,
      color: layer.paint?.['line-color'] ?? null,
    }));
    const nonLineLayers = style.layers.filter((layer: any) => layer.type !== 'line').map((layer: any) => ({
      id: layer.id,
      type: layer.type,
      sourceLayer: layer['source-layer'] ?? null,
      iconImage: layer.layout?.['icon-image'] ?? null,
      iconColor: layer.paint?.['icon-color'] ?? null,
      textField: layer.layout?.['text-field'] ?? null,
      textColor: layer.paint?.['text-color'] ?? null,
      textHaloColor: layer.paint?.['text-halo-color'] ?? null,
      minzoom: layer.minzoom ?? 0,
      maxzoom: layer.maxzoom ?? null,
    }));
    this.transportOriginalLineAudit = originalLineLayers;
    const recognized = (sourceLayer: string) => /^(EXPRESSWAY|L_TRANS_DOUBLE|L_TRANS_SINGLELINE|RAILWAY|MASSTRANSIT|BOAT|FERRY)/i.test(sourceLayer);
    const zoomAnomalies = originalLineLayers.filter((layer: any) => Number(layer.minzoom) < 14);
    const uncoveredLineLayers = originalLineLayers.filter((layer: any) => !recognized(String(layer.sourceLayer ?? '')));
    console.info('[Transport style] original line layer audit', {
      sourceMaxZooms,
      lineLayerCount: originalLineLayers.length,
      minzoomBelow14OrUnset: zoomAnomalies,
      sourceLayersWithoutDedicatedNeonMapping: uncoveredLineLayers,
    });
    console.info('[Transport style] visual suspect audit from currentStyleInfo', {
      nonLineLayerCount: nonLineLayers.length,
      nonLineLayers,
      textSymbolLayers: nonLineLayers.filter((layer: any) => layer.type === 'symbol' && layer.textField),
      paleLineLayers: originalLineLayers.filter((layer: any) => this.isPaleStyleColor(layer.color)),
    });
    const extended = {
      ...style,
      layers: style.layers
        .filter((layer: any) => layer.type !== 'line' || Number(layer.minzoom ?? 0) >= 14)
        .map((layer: any) => {
          if (layer.type === 'line') {
            return {
              ...layer,
              maxzoom: TRANSPORT_OVERZOOM,
              paint: { ...layer.paint, 'line-color': neonFor(String(layer['source-layer'] ?? '')) },
            };
          }
          if (layer.type === 'symbol') {
            const railwayIcon = String(layer['source-layer'] ?? '').startsWith('RAILWAY') && layer.paint?.['icon-color'];
            return {
              ...layer,
              ...(railwayIcon ? { paint: { ...layer.paint, 'icon-color': '#8b5cf6' } } : {}),
              ...(layer.layout?.['text-field'] ? { layout: { ...layer.layout, visibility: 'none' } } : {}),
            };
          }
          return layer;
        }),
    };
    try {
      if (extended.layers.length !== style.layers.length || extended.layers.some((layer: any, index: number) => layer !== style.layers[index])) {
        await this.transportLayer.loadStyle(extended);
      }
      for (const layer of style.layers) {
        if (layer.type === 'symbol' && layer.layout?.['text-field']) {
          this.transportLayer.setStyleLayerVisibility(layer.id, 'none');
        }
      }
      const appliedStyle = (this.transportLayer as any).currentStyleInfo?.style;
      const appliedTextLayers = (appliedStyle?.layers ?? []).filter((layer: any) => layer.type === 'symbol' && layer.layout?.['text-field']);
      const visibleTextLayers = appliedTextLayers.filter((layer: any) => this.transportLayer.getStyleLayerVisibility(layer.id) !== 'none');
      if (visibleTextLayers.length) throw new Error(`Transport text symbols remained visible: ${visibleTextLayers.map((layer: any) => layer.id).join(', ')}`);
      const appliedLines = (appliedStyle?.layers ?? []).filter((layer: any) => layer.type === 'line');
      const appliedMinimum = appliedLines.length ? Math.min(...appliedLines.map((layer: any) => Number(layer.minzoom ?? 0))) : null;
      const appliedMaximum = appliedLines.length ? Math.max(...appliedLines.map((layer: any) => Number(layer.maxzoom ?? TRANSPORT_OVERZOOM))) : null;
      const appliedBelow14 = appliedLines.filter((layer: any) => Number(layer.minzoom ?? 0) < 14);
      if (!appliedLines.length || appliedBelow14.length || appliedMinimum !== 14 || appliedMaximum !== TRANSPORT_OVERZOOM) {
        throw new Error(`Applied transport line zoom range failed verification: ${appliedMinimum}–${appliedMaximum}; below14=${appliedBelow14.length}`);
      }
      this.transportStyleExtended = true;
      this.transportZoomLabel.set(`Thailand · zoom ${appliedMinimum}–${appliedMaximum}`);
      console.info('[Transport style] zoom extension', {
        originalMaxZoom,
        originalLineLayers,
        sourceMaxZooms,
        renderedMaxZoom: Math.max(0, ...extended.layers.map((layer: any) => Number(layer.maxzoom ?? 0))),
        tileMaxLevel: Math.max(0, ...(this.transportLayer.tileInfo?.lods?.map((lod) => lod.level) ?? [])),
        lowZoomLineLayersHidden: originalLineLayers.filter((layer: any) => Number(layer.minzoom ?? 0) < 14).length,
        appliedLineLayerCount: appliedLines.length,
        appliedLineZoomRange: { min: appliedMinimum, max: appliedMaximum },
        appliedLineLayersBelow14: appliedBelow14.map((layer: any) => ({ id: layer.id, sourceLayer: layer['source-layer'], minzoom: layer.minzoom })),
        transportTextSymbolLayersHidden: appliedTextLayers.map((layer: any) => ({ id: layer.id, sourceLayer: layer['source-layer'] ?? null, textField: layer.layout?.['text-field'] ?? null, textColor: layer.paint?.['text-color'] ?? null, textHaloColor: layer.paint?.['text-halo-color'] ?? null, visibility: this.transportLayer.getStyleLayerVisibility(layer.id) })),
        appliedRailwaySymbols: (appliedStyle?.layers ?? []).filter((layer: any) => layer.type === 'symbol' && String(layer['source-layer'] ?? '').startsWith('RAILWAY')).map((layer: any) => ({ id: layer.id, sourceLayer: layer['source-layer'], iconImage: layer.layout?.['icon-image'] ?? null, iconColor: layer.paint?.['icon-color'] ?? null })),
        lineLayersExtended: extended.layers.filter((layer: any) => layer.type === 'line').length,
      });
      this.applyNeon();
      this.logTransportState('style-ready');
    } catch (error) {
      console.error('[Transport style] loadStyle failed; applying per-style-layer fallback', { originalMaxZoom, error });
      this.applyTransportStyleLayerFallback(style);
    }
  }

  private applyTransportStyleLayerFallback(style: any): void {
    const lines = style.layers.filter((layer: any) => layer.type === 'line');
    const hiddenLowZoom: string[] = [];
    try {
      style.layers.forEach((layer: any, index: number) => {
        if (layer.type === 'line' && Number(layer.minzoom ?? 0) < 14) {
          this.transportLayer.setStyleLayerVisibility(layer.id, 'none');
          hiddenLowZoom.push(layer.id);
        } else if (layer.type === 'line') {
          this.transportLayer.setStyleLayer({
            ...layer,
            maxzoom: TRANSPORT_OVERZOOM,
            paint: { ...layer.paint, 'line-color': neonFor(String(layer['source-layer'] ?? '')) },
          }, index);
        } else if (layer.type === 'symbol') {
          if (String(layer['source-layer'] ?? '').startsWith('RAILWAY') && layer.paint?.['icon-color']) {
            this.transportLayer.setPaintProperties(layer.id, { 'icon-color': '#8b5cf6' });
          }
          if (layer.layout?.['text-field']) this.transportLayer.setStyleLayerVisibility(layer.id, 'none');
        }
      });
      const visibleLines = lines
        .filter((layer: any) => !hiddenLowZoom.includes(layer.id))
        .map((layer: any) => this.transportLayer.getStyleLayer(layer.id))
        .filter((layer: any) => layer && this.transportLayer.getStyleLayerVisibility(layer.id) !== 'none');
      const minZoom = visibleLines.length ? Math.min(...visibleLines.map((layer: any) => Number(layer.minzoom ?? 0))) : null;
      const maxZoom = visibleLines.length ? Math.max(...visibleLines.map((layer: any) => Number(layer.maxzoom ?? 0))) : null;
      const verified = minZoom === 14 && maxZoom === TRANSPORT_OVERZOOM && hiddenLowZoom.length === lines.filter((layer: any) => Number(layer.minzoom ?? 0) < 14).length;
      console.info('[Transport style] per-layer fallback audit', {
        visibleLineCount: visibleLines.length,
        visibleLineZoomRange: { min: minZoom, max: maxZoom },
        hiddenLineCountBelow14: hiddenLowZoom.length,
        hiddenLowZoomLineIds: hiddenLowZoom,
        verified,
      });
      if (verified) {
        this.transportStyleExtended = true;
        this.transportZoomLabel.set(`Thailand · zoom ${minZoom}–${maxZoom}`);
        this.applyNeon();
      } else {
        this.transportZoomLabel.set('Thailand · style zoom range not verified');
        console.error('[Transport style] per-layer fallback could not verify the requested visible range', { minZoom, maxZoom, hiddenLowZoom });
      }
    } catch (error) {
      this.transportZoomLabel.set('Thailand · style zoom range not applied');
      console.error('[Transport style] per-layer fallback failed', { error, hiddenLowZoom });
    }
  }

  private applyNeon(): void {
    const styleLayers = ((this.transportLayer as any).currentStyleInfo?.style?.layers ?? []) as any[];
    let painted = 0;
    const lineLayerAudit: any[] = [];
    const railwaySymbols = styleLayers.filter((layer) => layer.type === 'symbol' && String(layer['source-layer'] ?? '').startsWith('RAILWAY'));
    const railwaySymbolAudit = railwaySymbols.map((layer) => ({
      id: layer.id,
      sourceLayer: layer['source-layer'] ?? null,
      iconImage: layer.layout?.['icon-image'] ?? null,
      originalIconColor: layer.paint?.['icon-color'] ?? null,
    }));
    for (const l of styleLayers) {
      if (l.type === 'line') {
        const originalColor = l.paint?.['line-color'] ?? null;
        const color = neonFor(String(l['source-layer'] ?? ''));
        if (color) {
          this.transportLayer.setPaintProperties(l.id, { 'line-color': color });
          painted++;
          lineLayerAudit.push({ id: l.id, sourceLayer: l['source-layer'] ?? null, minzoom: l.minzoom ?? 0, maxzoom: l.maxzoom ?? null, originalColor, neonColor: color });
        }
      } else if (l.type === 'symbol') {
        if (String(l['source-layer'] ?? '').startsWith('RAILWAY') && l.paint?.['icon-color']) {
          this.transportLayer.setPaintProperties(l.id, { 'icon-color': '#8b5cf6' });
        }
        if (l.layout?.['text-field']) this.transportLayer.setStyleLayerVisibility(l.id, 'none');
      }
    }
    console.info('[Transport style] neon paint applied', {
      styleLayers: styleLayers.length,
      paintedLineLayers: painted,
      lineLayerAudit,
      lineZoomRanges: styleLayers.filter((layer) => layer.type === 'line').map((layer) => ({ id: layer.id, sourceLayer: layer['source-layer'], minzoom: layer.minzoom ?? null, maxzoom: layer.maxzoom ?? null, lineWidth: layer.paint?.['line-width'] ?? null })),
      layerEffect: this.transportLayer.effect,
      tileLevels: this.transportLayer.tileInfo?.lods?.map((lod) => lod.level) ?? [],
      sourceMaxZooms: Object.fromEntries(Object.entries((this.transportLayer as any).currentStyleInfo?.style?.sources ?? {}).map(([id, source]: [string, any]) => [id, source.maxzoom ?? null])),
      layerScaleRange: { minScale: this.transportLayer.minScale, maxScale: this.transportLayer.maxScale },
      railwaySymbolLayersRecolored: railwaySymbolAudit.map((layer) => ({ ...layer, appliedIconColor: '#8b5cf6' })),
    });
  }

  private isPaleStyleColor(color: unknown): boolean {
    if (typeof color !== 'string') return false;
    const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
    if (!hex) return false;
    const expanded = hex.length === 3 ? [...hex].map((channel) => channel + channel).join('') : hex;
    const [red, green, blue] = expanded.match(/[\da-f]{2}/gi)!.map((channel) => parseInt(channel, 16));
    return (red + green + blue) / 3 >= 220;
  }

  private logBasemapZoomLimits(reason: string): void {
    const view = this.mapView;
    const basemap = this.map?.basemap;
    if (!view || !basemap) return;
    const effectiveLODs = view.constraints.effectiveLODs ?? [];
    console.info('[Map zoom] effective limits', {
      reason,
      basemap: basemap.id,
      effectiveMaxZoom: view.constraints.effectiveMaxZoom,
      effectiveMinZoom: view.constraints.effectiveMinZoom,
      effectiveLODCount: effectiveLODs.length,
      lastEffectiveLOD: effectiveLODs.length ? effectiveLODs[effectiveLODs.length - 1] : null,
      configuredConstraints: {
        minZoom: view.constraints.minZoom,
        maxZoom: view.constraints.maxZoom,
        snapToZoom: view.constraints.snapToZoom,
        explicitLODCount: view.constraints.lods?.length ?? 0,
      },
      basemapLayers: basemap.baseLayers.map((layer: any) => {
        const lods = layer.tileInfo?.lods ?? [];
        return {
          id: layer.id,
          type: layer.type,
          minScale: layer.minScale,
          maxScale: layer.maxScale,
          lodCount: lods.length,
          lastLOD: lods.length ? lods[lods.length - 1] : null,
        };
      }),
    });
  }

  private logTransportState(reason: string): void {
    const view = this.mapView;
    const layerView = this.transportLayerView;
    const styleLayers = ((this.transportLayer as any).currentStyleInfo?.style?.layers ?? []) as any[];
    console.info('[Transport view] diagnostic', {
      reason,
      visible: this.transportLayer.visible,
      suspended: layerView?.suspended ?? null,
      hasVisibleFeatures: layerView?.hasVisibleFeatures ?? null,
      updating: layerView?.updating ?? null,
      zoom: view?.zoom ?? null,
      scale: view?.scale ?? null,
      layerMinScale: this.transportLayer.minScale,
      layerMaxScale: this.transportLayer.maxScale,
      tileLevels: this.transportLayer.tileInfo?.lods?.map((lod) => lod.level) ?? [],
      sourceMaxZooms: Object.fromEntries(Object.entries((this.transportLayer as any).currentStyleInfo?.style?.sources ?? {}).map(([id, source]: [string, any]) => [id, source.maxzoom ?? null])),
      maxStyleZoom: styleLayers.reduce((max, layer) => Math.max(max, Number(layer.maxzoom ?? 0)), 0),
      lineLayerCount: styleLayers.filter((layer) => layer.type === 'line').length,
      styleLinesActiveAtCurrentZoom: this.transportOriginalLineAudit.filter((layer) => {
        const zoom = view?.zoom ?? -1;
        return zoom >= Number(layer.minzoom ?? 0) && (layer.maxzoom == null || zoom < Number(layer.maxzoom));
      }),
    });
  }

  private applyTaxiScale(scale: number): void {
    const macro = scale > TAXI_MACRO_SCALE;
    const city = scale <= TAXI_MACRO_SCALE && scale > TAXI_BIN_MAX_SCALE;
    const streets = scale <= TAXI_BIN_MAX_SCALE;
    const mode = macro ? 'macro' : city ? 'city' : 'street';
    this.taxiLayer.visible = this.taxiOn() && !macro && !!this.taxiLayerView;
    this.taxiMacroLayer.visible = this.taxiOn() && macro;
    this.taxiLayer.featureReduction = city ? taxiBinning(this.byFare(), this.fareStops()) : null;
    this.taxiLayer.effect = streets ? TAXI_BLOOM : null;
    if (this.taxiDisplayMode !== mode) {
      this.taxiDisplayMode = mode;
      console.info('[Taxi layer] scale mode', { mode, scale, rotation: this.mapView?.rotation ?? 0, featureReduction: city ? 'binning' : 'none', bloom: streets ? TAXI_BLOOM : null });
    }
    this.applyBasemapOpacity();
  }

  private applyBasemapOpacity(): void {
    const basemap = this.map?.basemap;
    if (!basemap) return;
    basemap.baseLayers.forEach((layer) => { layer.opacity = this.satelliteBasemap() ? 1 : 0.62; });
    const dimLabels = this.taxiOn() && (this.taxiDisplayMode === 'city' || this.taxiDisplayMode === 'macro');
    const referenceOpacity = dimLabels
      ? (this.taxiDisplayMode === 'macro' ? (this.satelliteBasemap() ? 0.82 : 0.68) : (this.satelliteBasemap() ? 0.72 : 0.46))
      : 1;
    const basemapId = basemap.id ?? (this.satelliteBasemap() ? 'satellite' : 'dark-gray-vector');
    const needsReferenceUpdate = basemap.referenceLayers.some((layer) => layer.opacity !== referenceOpacity);
    if (this.appliedReferenceOpacity !== referenceOpacity || this.appliedReferenceBasemap !== basemapId || needsReferenceUpdate) {
      basemap.referenceLayers.forEach((layer) => { layer.opacity = referenceOpacity; });
      this.appliedReferenceOpacity = referenceOpacity;
      this.appliedReferenceBasemap = basemapId;
      console.info('[Basemap labels] reference opacity', { basemap: basemapId, mode: this.taxiDisplayMode, taxiOn: this.taxiOn(), opacity: referenceOpacity });
    }
  }

  private applyPoiLabels(): void {
    console.info('[POI labels] loaded service metadata', {
      labelsVisible: this.poiLayer.labelsVisible,
      labelingInfo: this.poiLayer.labelingInfo?.map((labelClass) => labelClass.toJSON()) ?? [],
      fields: this.poiLayer.fields.map(({ name, type }) => ({ name, type })),
    });
    this.poiLayer.labelingInfo = POI_LABELING_INFO as any;
    this.poiLayer.labelsVisible = true;
    console.info('[POI labels] app style applied', {
      labelingInfo: this.poiLayer.labelingInfo?.map((labelClass) => labelClass.toJSON()) ?? [],
      labelsVisible: this.poiLayer.labelsVisible,
      effect: this.poiLayer.effect,
    });
  }

  private logBasemapReferenceLayers(basemap: __esri.Basemap): void {
    console.info('[Basemap references] loaded', {
      basemap: basemap.id,
      count: basemap.referenceLayers.length,
      layers: basemap.referenceLayers.map((layer) => ({ id: layer.id, title: layer.title, type: layer.type })),
    });
  }

  toggleLayer(which: 'transport' | 'poi' | 'taxi'): void {
    const target = {
      transport: { layer: this.transportLayer, state: this.transportOn },
      poi: { layer: this.poiLayer, state: this.poiOn },
      taxi: { layer: this.taxiLayer, state: this.taxiOn },
    }[which];
    const next = !target.state();
    target.state.set(next);
    target.layer.visible = which === 'taxi' && next && !this.taxiLayerView ? false : next;
    if (which === 'poi') this.heatLayer.visible = next;
    if (which === 'taxi' && next) {
      this.openTaxiPanel('analysis');
      this.taxiSourceNotice.set(true);
      if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
      this.noticeTimer = window.setTimeout(() => this.taxiSourceNotice.set(false), 5000);
      this.goToNewYork(2000);
      this.scheduleTaxiRefresh();
      this.applyTaxiScale(this.mapView?.scale ?? 0);
    } else if (which === 'taxi') {
      if (this.selectedTaxi()) {
        this.clearSelection();
        this.rightPanelTab.set('analysis');
      }
      if (this.rightPanelTab() === 'analysis') this.rightPanelOpen.set(false);
      this.taxiLoading.set(false);
      this.queryVersion++;
      this.applyTaxiScale(this.mapView?.scale ?? 0);
      if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    }
  }

  togglePanel(): void {
    this.panelCollapsed.update((collapsed) => !collapsed);
  }

  toggleRightPanel(): void {
    if (this.rightPanelOpen()) this.closeTaxiPanel();
    else this.openTaxiPanel('analysis');
  }

  openTaxiPanel(tab: 'analysis' | 'selection' = 'analysis'): void {
    this.rightPanelTab.set(tab);
    this.rightPanelOpen.set(true);
    if (window.matchMedia('(max-width: 719.98px)').matches) this.panelCollapsed.set(true);
    if (this.focusFrame !== null) window.cancelAnimationFrame(this.focusFrame);
    this.focusFrame = window.requestAnimationFrame(() => {
      this.focusFrame = null;
      this.rightPanelEl?.nativeElement.focus();
    });
  }

  setRightPanelTab(tab: 'analysis' | 'selection'): void {
    this.rightPanelTab.set(tab);
  }

  inspectorTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const tabs = Array.from((event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    if (!tabs.length) return;
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const currentIndex = tabs.indexOf(event.currentTarget as HTMLElement);
    const next = tabs[(currentIndex + direction + tabs.length) % tabs.length];
    next.focus();
    next.click();
  }

  fareColorFor(value: number): string { return fareColor(value, this.fareStops()); }

  formatCoordinate(value: number | null | undefined): string {
    return value == null ? '—' : value.toFixed(4);
  }

  closeTaxiPanel(): void {
    this.clearSelection();
    this.rightPanelOpen.set(false);
    if (window.matchMedia('(max-width: 719.98px)').matches) this.panelCollapsed.set(false);
  }

  rotateMap(degrees: number): void {
    if (this.mapView) void this.mapView.goTo({ rotation: this.mapView.rotation + degrees }, { duration: 280 });
  }

  resetNorth(): void {
    if (!this.mapView || Math.abs(this.mapView.rotation) < 0.1) return;
    void this.mapView.goTo({ rotation: 0 }, { duration: 450 });
  }

  isMapFacingNorth(): boolean {
    return Math.abs(this.mapRotation()) < 0.1;
  }

  compassAriaLabel(): string {
    return this.isMapFacingNorth() ? 'Map is facing north' : 'Reset map rotation to north';
  }

  home(): void {
    if (this.mapView) void this.mapView.goTo({ center: [100.5347, 13.7466], zoom: 14, rotation: 0 }, { duration: 850 });
  }

  toggleBasemap(): void {
    if (!this.map) return;
    this.satelliteBasemap.update((satellite) => !satellite);
    this.map.basemap = this.satelliteBasemap() ? 'satellite' : 'dark-gray-vector';
    const selectedBasemap = this.map.basemap;
    if (!selectedBasemap) return;
    void selectedBasemap.load().then(async () => {
      this.logBasemapReferenceLayers(selectedBasemap);
      this.applyBasemapOpacity();
      this.logBasemapZoomLimits('basemap-switched');
      this.applyNeon();
      this.logTransportState('basemap-switched');
    })
      .catch((error) => {
        console.warn('Basemap unavailable; returning to dark-gray-vector', error);
        this.satelliteBasemap.set(false);
        if (this.map) {
          this.map.basemap = 'dark-gray-vector';
          void this.map.basemap?.load().then(async () => {
            if (this.map?.basemap) this.logBasemapReferenceLayers(this.map.basemap);
            this.applyBasemapOpacity();
            this.logBasemapZoomLimits('satellite-fallback-to-dark-gray-vector');
            this.applyNeon();
          }).catch((fallbackError) => console.error('dark basemap fallback failed', fallbackError));
        }
      });
  }

  private async handleMapClick(event: any): Promise<void> {
    const view = this.mapView;
    if (!view) return;
    try {
      const hit = await view.hitTest(event, { include: [this.taxiLayer, this.taxiMacroLayer, this.poiLayer] });
      const graphics = hit.results
        .filter((item: any) => item.type === 'graphic')
        .map((item: any) => item.graphic)
        .filter((graphic: any) => graphic.layer === this.taxiLayer || graphic.layer === this.taxiMacroLayer || graphic.layer === this.poiLayer);
      const result = (this.taxiOn() ? graphics.find((graphic: any) => graphic.layer === this.taxiLayer || graphic.layer === this.taxiMacroLayer) : null)
        ?? (this.poiOn() ? graphics.find((graphic: any) => graphic.layer === this.poiLayer && this.poiHasDetails(graphic.attributes)) : null);
      if (!result) {
        this.clearSelection();
        return;
      }
      const graphic = result;
      if (graphic.layer === this.taxiMacroLayer) {
        this.goToNewYork(700);
        return;
      }
      const attrs = graphic.attributes ?? {};
      if (graphic.layer === this.poiLayer) {
        const skip = new Set(['objectid', 'fid', 'globalid', 'osm_id', 'id']);
        const tags = Object.entries(attrs)
          .filter(([key, value]) => value !== null && value !== undefined && value !== '' && !skip.has(key.toLowerCase()))
          .map(([key, value]) => ({ key, value: String(value) }));
        if (!tags.length) {
          this.clearSelection();
          return;
        }
        const geometry = graphic.geometry as Point | null;
        const geographic = geometry
          ? geometry.spatialReference?.isWebMercator ? webMercatorUtils.webMercatorToGeographic(geometry) as Point : geometry
          : null;
        const title = String(attrs.name || attrs.amenity || attrs.place || attrs.shop || attrs.tourism || attrs.leisure || 'Selected place');
        this.selectedTaxi.set(null);
        this.selectedPoi.set({ title, latitude: geographic?.latitude ?? null, longitude: geographic?.longitude ?? null, tags });
        this.drawTaxiSelection(graphic.geometry);
        this.openTaxiPanel('selection');
        return;
      }
      const isBin = attrs.ride_count !== undefined || attrs.average_fare !== undefined;
      this.selectedPoi.set(null);
      if (isBin && graphic.geometry?.extent) {
        const extent = graphic.geometry.extent;
        const center = extent.center;
        const geographicCenter = webMercatorUtils.webMercatorToGeographic(center) as Point;
        const horizontal = new Polyline({ paths: [[[extent.xmin, extent.ymin], [extent.xmax, extent.ymin]]], spatialReference: extent.spatialReference });
        const vertical = new Polyline({ paths: [[[extent.xmin, extent.ymin], [extent.xmin, extent.ymax]]], spatialReference: extent.spatialReference });
        this.selectedTaxi.set({
          kind: 'bin', longitude: geographicCenter.longitude ?? undefined,
          latitude: geographicCenter.latitude ?? undefined,
          widthKm: geometryEngine.geodesicLength(horizontal, 'kilometers') ?? 0,
          heightKm: geometryEngine.geodesicLength(vertical, 'kilometers') ?? 0,
          rides: attrs.ride_count == null ? null : Number(attrs.ride_count),
          averageFare: parseFare(attrs.average_fare),
        });
        this.drawTaxiSelection(graphic.geometry);
      } else {
        const fare = parseFare(attrs.fare_amount);
        const rawPickup = attrs.pickup_datetime;
        const date = rawPickup == null ? null : new Date(rawPickup);
        const pickup = rawPickup == null ? '—' : date && !Number.isNaN(date.getTime())
          ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : String(rawPickup);
        const passengers = attrs.passenger_count == null ? '—' : formatNumber(Number(attrs.passenger_count));
        this.selectedTaxi.set({ kind: 'point', fare, passengers, pickup });
        this.selectedPoi.set(null);
        this.drawTaxiSelection(graphic.geometry);
      }
      this.openTaxiPanel('selection');
    } catch (error) {
      console.error('taxi hit test', error);
    }
  }

  private poiHasDetails(attributes: Record<string, unknown> | null | undefined): boolean {
    const skip = new Set(['objectid', 'fid', 'globalid', 'osm_id', 'id']);
    return Object.entries(attributes ?? {}).some(([key, value]) => value !== null && value !== undefined && value !== '' && !skip.has(key.toLowerCase()));
  }

  private drawTaxiSelection(geometry: any): void {
    this.taxiSelectionLayer.removeAll();
    const isPoint = geometry?.type === 'point';
    this.taxiSelectionLayer.add(new Graphic({
      geometry,
      symbol: isPoint
        ? { type: 'simple-marker', style: 'circle', size: 18, color: [0, 0, 0, 0], outline: { color: '#fde047', width: 2.5 } } as any
        : { type: 'simple-fill', color: [217, 70, 239, 0.04], outline: { color: '#fde047', width: 2.5, style: 'solid' } } as any,
    }));
  }

  closeInspection(): void { this.closeTaxiPanel(); }

  clearSelection(): void {
    this.selectedTaxi.set(null);
    this.selectedPoi.set(null);
    this.taxiSelectionLayer.removeAll();
  }

  toggleTaxiAnalysis(): void {
    this.taxiAnalysisExpanded.update((expanded) => !expanded);
  }

  setFareDistributionExpanded(event: Event): void {
    const expanded = (event.currentTarget as HTMLDetailsElement).open;
    this.fareDistributionExpanded.set(expanded);
    try { window.sessionStorage.setItem('housebuy:fare-distribution-expanded', String(expanded)); } catch { /* Session preference is optional. */ }
  }

  setColourMode(byFare: boolean): void {
    this.byFare.set(byFare);
    this.taxiLayer.renderer = taxiRenderer(byFare, this.fareStops());
    this.applyTaxiScale(this.mapView?.scale ?? 0);
  }

  zoomNewYork(): void {
    this.goToNewYork(1200);
  }

  private goToNewYork(duration: number): void {
    const view = this.mapView;
    if (!view) return;
    const go = () => view.goTo({ center: [-73.98, 40.75], zoom: Math.max(12, TAXI_MIN_ZOOM) }, { duration });
    if (view.ready) go();
    else void view.when().then(go).catch(() => undefined);
  }

  setPassengerMode(mode: 'all' | '1' | '2' | '3+'): void {
    this.passengerMode.set(mode);
    this.applyTaxiFilter();
    this.scheduleTaxiRefresh();
  }

  setFareBound(bound: 'min' | 'max', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const min = this.taxiDomainMin();
    const max = this.taxiDomainMax();
    if (min === null || max === null) return;
    if (bound === 'min') this.taxiFareMin.set(Math.min(value, this.taxiFareMax() ?? max));
    else this.taxiFareMax.set(Math.max(value, this.taxiFareMin() ?? min));
    this.applyTaxiFilter();
    this.scheduleTaxiRefresh();
  }

  resetTaxiFilter(): void {
    this.taxiFareMin.set(null);
    this.taxiFareMax.set(null);
    this.passengerMode.set('all');
    this.applyTaxiFilter();
    this.scheduleTaxiRefresh();
  }

  private passengerWhere(): string {
    switch (this.passengerMode()) {
      case '1': return 'passenger_count = 1';
      case '2': return 'passenger_count = 2';
      case '3+': return 'passenger_count >= 3';
      default: return '1=1';
    }
  }

  private applyTaxiFilter(): void {
    if (!this.taxiLayerView) return;
    this.taxiLayerView.filter = new FeatureFilter({ where: this.taxiFilterWhere() });
  }

  private taxiFilterWhere(): string {
    const clauses = [TAXI_COORDINATE_WHERE, this.passengerWhere()];
    const min = this.taxiFareMin();
    const max = this.taxiFareMax();
    if (min !== null) clauses.push(`fare_amount >= ${min}`);
    if (max !== null) clauses.push(`fare_amount <= ${max}`);
    return clauses.join(' AND ');
  }

  fareScaleLabel(): string {
    return `Fare color stops: ${this.fareStops().map((stop) => formatFare(stop.value)).join(', ')}`;
  }

  fareScaleLabelVisible(index: number): boolean {
    const stops = this.fareStops();
    const last = stops.length - 1;
    if (index === 0) return true;
    if (index === last) return this.fareStopPosition(index) - this.fareStopPosition(0) >= 18;
    const position = this.fareStopPosition(index);
    return position - this.fareStopPosition(0) >= 18
      && this.fareStopPosition(last) - position >= 18;
  }

  taxiBinHeight(count: number): number {
    const peak = Math.max(1, ...this.taxiBins().map((bin) => bin.count));
    return count === 0 ? 0 : Math.max(8, Math.sqrt(count / peak) * 100);
  }

  fareStep(): number {
    const min = this.taxiDomainMin();
    const max = this.taxiDomainMax();
    return min === null || max === null ? 1 : Math.max((max - min) / 200, 0.01);
  }

  formatCount(value: number | null): string {
    return value === null ? '—' : formatNumber(value);
  }

  formatCurrency(value: number | null): string {
    return value === null ? '—' : formatFare(value);
  }

  formatFare(value: number | null): string {
    return value === null ? '—' : formatFare(value);
  }

  fareStopPosition(index: number): number {
    const stops = this.fareStops();
    if (stops.length < 2) return 0;
    const span = stops[stops.length - 1].value - stops[0].value;
    return span > 0 ? (stops[index].value - stops[0].value) / span * 100 : index / (stops.length - 1) * 100;
  }

  private scheduleTaxiRefresh(): void {
    if (!this.taxiOn() || this.destroyed) return;
    const version = ++this.queryVersion;
    this.taxiLoading.set(true);
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshTaxiAnalysis(version);
    }, 350);
  }

  private histogramForFilteredRides(base: TaxiHistogram, features: any[], queryTotal: number): TaxiHistogram {
    if (features.length !== queryTotal) {
      throw new Error(`Filtered taxi histogram received ${features.length} features but queryFeatureCount returned ${queryTotal}`);
    }
    if (base.min === null || base.max === null || base.lowerPercentile === null || base.upperPercentile === null) {
      const bins = base.bins.map((bin) => ({ ...bin, count: queryTotal }));
      if (bins.reduce((sum, bin) => sum + bin.count, 0) !== queryTotal) throw new Error('Unpriced taxi histogram total mismatch');
      return { ...base, bins, count: queryTotal, unpriced: queryTotal, nonPositive: 0, lowerTail: 0, upperTail: 0 };
    }
    const bins = base.bins.map((bin) => ({ ...bin, count: 0 }));
    const lowIndex = bins.findIndex((bin) => bin.tail === 'low');
    const highIndex = bins.findIndex((bin) => bin.tail === 'high');
    const unpricedIndex = bins.findIndex((bin) => bin.tail === 'missing');
    const middleIndices = bins.map((bin, index) => ({ bin, index })).filter(({ bin }) => !bin.tail).map(({ index }) => index);
    const width = (base.upperPercentile - base.lowerPercentile) / HISTOGRAM_BINS;
    let nonPositive = 0;
    let lowerTail = 0;
    let upperTail = 0;
    let unpriced = 0;
    for (const feature of features) {
      const fare = parseFare(feature.attributes?.fare_amount);
      if (fare === null) {
        unpriced++;
        if (unpricedIndex >= 0) bins[unpricedIndex].count++;
      } else if (fare <= 0) {
        nonPositive++;
        if (fare < base.lowerPercentile) { lowerTail++; bins[lowIndex].count++; }
        else if (fare > base.upperPercentile) { upperTail++; bins[highIndex].count++; }
        else {
          const position = width === 0 ? Math.floor(HISTOGRAM_BINS / 2) : Math.min(HISTOGRAM_BINS - 1, Math.floor((fare - base.lowerPercentile) / width));
          bins[middleIndices[position]].count++;
        }
      } else if (fare < base.lowerPercentile) {
        lowerTail++;
        bins[lowIndex].count++;
      } else if (fare > base.upperPercentile) {
        upperTail++;
        bins[highIndex].count++;
      } else {
        const position = width === 0 ? Math.floor(HISTOGRAM_BINS / 2) : Math.min(HISTOGRAM_BINS - 1, Math.floor((fare - base.lowerPercentile) / width));
        bins[middleIndices[position]].count++;
      }
    }
    const binTotal = bins.reduce((sum, bin) => sum + bin.count, 0);
    if (binTotal !== queryTotal) throw new Error(`Filtered taxi histogram bins total ${binTotal} does not match queryFeatureCount ${queryTotal}`);
    console.info('[Taxi analysis] active-filter histogram totals', { binTotal, queryTotal, lowerTail, upperTail, nonPositive, unpriced });
    return { ...base, bins, count: queryTotal, nonPositive, lowerTail, upperTail, unpriced };
  }

  private async refreshTaxiAnalysis(version: number): Promise<void> {
    if (version !== this.queryVersion || this.destroyed) return;
    try {
      if (!this.mapView || !this.taxiLayerView || !this.taxiOn()) return;
      const extent = this.mapView.ready ? this.mapView.extent?.clone() : null;
      let histogramPromise: Promise<TaxiHistogram>;
      const cachedHistogram = this.taxiHistogramCache.get('all');
      if (cachedHistogram) {
        histogramPromise = Promise.resolve(cachedHistogram);
      } else {
        histogramPromise = Promise.all([
          this.taxiLayer.queryFeatures({ where: TAXI_COORDINATE_WHERE, outFields: TAXI_FIELDS, returnGeometry: false }),
          this.taxiLayer.queryFeatures({ where: '1=1', outFields: TAXI_FIELDS, returnGeometry: false }),
          this.taxiLayer.queryFeatureCount({ where: TAXI_COORDINATE_WHERE }),
          this.taxiLayer.queryFeatureCount({ where: '1=1' }),
        ]).then(([result, rawResult, queryTotal, rawTotal]) => {
          const coordinateCounts: Record<TaxiCoordinateGroup, number> = { zero: 0, missing: 0, outside: 0, valid: 0 };
          const diagnosticBins = new globalThis.Map<string, { rides: number; latitude: number; longitude: number }>();
          for (const feature of rawResult.features) {
            const attributes = feature.attributes ?? {};
            coordinateCounts[coordinateGroup(attributes)]++;
            const latitude = Number(attributes.pickup_latitude);
            const longitude = Number(attributes.pickup_longitude);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
            const key = encodeGeohash(longitude, latitude, TAXI_BIN_LEVEL);
            const bin = diagnosticBins.get(key) ?? { rides: 0, latitude: 0, longitude: 0 };
            bin.rides++;
            bin.latitude += latitude;
            bin.longitude += longitude;
            diagnosticBins.set(key, bin);
          }
          this.taxiExcludedCount.set(rawTotal - queryTotal);
          this.taxiRawCount.set(rawTotal);
          console.info('[Taxi analysis] pickup coordinate audit', {
            bounds: { latitude: '40.4–41.0', longitude: '-74.3–-73.6' },
            groups: coordinateCounts,
            queryTotal: rawTotal,
            retainedByCoordinateWhere: queryTotal,
            geohashLevel6LabelMatches: [984, 14, 28].map((count) => ({
              count,
              totalBins: [...diagnosticBins.values()].filter((bin) => bin.rides === count).length,
              examples: [...diagnosticBins].filter(([, bin]) => bin.rides === count).slice(0, 5).map(([geohash, bin]) => ({
                geohash,
                center: [bin.longitude / bin.rides, bin.latitude / bin.rides],
                group: coordinateGroup({ pickup_longitude: bin.longitude / bin.rides, pickup_latitude: bin.latitude / bin.rides }),
              })),
            })),
          });
          if (rawResult.features.length !== rawTotal || result.features.length !== queryTotal) {
            throw new Error('Taxi coordinate query result counts do not match queryFeatureCount');
          }
          const ramp = deriveFareStops(result.features);
          this.fareStops.set(ramp.stops);
          this.fareGradient.set(fareGradient(ramp.stops));
          this.taxiLayer.renderer = taxiRenderer(this.byFare(), ramp.stops);
          this.applyTaxiScale(this.mapView?.scale ?? 0);
          console.info('[Taxi analysis] bin fare ramp', {
            geohashLevel: TAXI_BIN_LEVEL,
            groupedRides: ramp.groupedRides,
            populatedBins: ramp.populatedBins,
            eligibleBins: ramp.eligibleBins,
            stops: ramp.stops.map((stop) => ({ fare: formatFare(stop.value), color: stop.color })),
          });
          const records = result.features
            .map((feature: any) => parseFare(feature.attributes.fare_amount))
            .filter((fare: number | null): fare is number => fare !== null);
          if (!records.length) {
            const count = result.features.length;
            const empty: TaxiHistogram = {
              bins: count ? [{ start: 0, end: 0, count, color: '#ffffff', label: 'No fare', tail: 'missing' }] : [],
              count, min: null, max: null, lowerPercentile: null, upperPercentile: null,
              nonPositive: 0, lowerTail: 0, upperTail: 0, unpriced: count,
            };
            const binTotal = empty.bins.reduce((sum, bin) => sum + bin.count, 0);
            if (binTotal !== queryTotal) throw new Error('Taxi histogram bins do not match queryFeatureCount');
            console.info('[Taxi analysis] histogram totals', { binTotal, queryTotal });
            this.taxiHistogramCache.set('all', empty);
            return empty;
          }
          const sorted = [...records].sort((a, b) => a - b);
          const min = sorted[0];
          const max = sorted[sorted.length - 1];
          const lowerPercentile = percentile(sorted, 0.01);
          const upperPercentile = percentile(sorted, 0.95);
          const width = (upperPercentile - lowerPercentile) / HISTOGRAM_BINS;
          const counts = Array.from({ length: HISTOGRAM_BINS }, () => 0);
          let lowerTail = 0;
          let upperTail = 0;
          let nonPositive = 0;
          for (const fare of records) {
            if (fare <= 0) nonPositive++;
            if (fare < lowerPercentile) lowerTail++;
            else if (fare > upperPercentile) upperTail++;
            else {
              const index = width === 0
                ? Math.floor(HISTOGRAM_BINS / 2)
                : Math.min(HISTOGRAM_BINS - 1, Math.floor((fare - lowerPercentile) / width));
              counts[index]++;
            }
          }
          const bins: TaxiHistogram['bins'] = [
            { start: min, end: lowerPercentile, count: lowerTail, color: FARE_STOPS[0].color, label: `< ${formatFare(lowerPercentile)}`, tail: 'low' },
            ...counts.map((count, index) => {
              const start = width === 0 ? lowerPercentile : lowerPercentile + index * width;
              const end = width === 0 ? upperPercentile : index === HISTOGRAM_BINS - 1 ? upperPercentile : start + width;
              return { start, end, count, color: fareColor((start + end) / 2, ramp.stops), label: `${formatFare(start)}–${formatFare(end)}` };
            }),
            { start: upperPercentile, end: max, count: upperTail, color: FARE_STOPS[FARE_STOPS.length - 1].color, label: `> ${formatFare(upperPercentile)}`, tail: 'high' },
          ];
          const unpriced = result.features.length - records.length;
          if (unpriced) bins.push({ start: 0, end: 0, count: unpriced, color: '#ffffff', label: 'No fare', tail: 'missing' });
          const histogram: TaxiHistogram = {
            bins, count: result.features.length, min, max, lowerPercentile, upperPercentile,
            nonPositive, lowerTail, upperTail, unpriced,
          };
          const binTotal = bins.reduce((sum, bin) => sum + bin.count, 0);
          if (binTotal !== queryTotal || result.features.length !== queryTotal) {
            console.error('[Taxi analysis] histogram total mismatch', { binTotal, queryTotal, queryFeatures: result.features.length });
            throw new Error('Taxi histogram bins do not match queryFeatureCount');
          }
          console.info('[Taxi analysis] histogram totals', { binTotal, queryTotal, nonPositive, lowerTail, upperTail, unpriced });
          this.taxiHistogramCache.set('all', histogram);
          return histogram;
        });
      }
      const filterWhere = this.taxiFilterWhere();
      const [visible, visibleCount, histogram, filteredRecords, filteredCount] = await Promise.all([
        extent
          ? this.taxiLayer.queryFeatures({ where: filterWhere, geometry: extent, outFields: TAXI_FIELDS, returnGeometry: false })
          : Promise.resolve(null),
        extent
          ? this.taxiLayer.queryFeatureCount({ where: filterWhere, geometry: extent })
          : Promise.resolve(null),
        histogramPromise,
        this.taxiLayer.queryFeatures({ where: filterWhere, outFields: TAXI_FIELDS, returnGeometry: true }),
        this.taxiLayer.queryFeatureCount({ where: filterWhere }),
      ]);
      if (version !== this.queryVersion || !this.taxiOn()) return;
      if (filteredRecords.features.length !== filteredCount) {
        console.error('[Taxi analysis] filtered centroid count mismatch', { featureCount: filteredRecords.features.length, queryFeatureCount: filteredCount, where: this.taxiFilterWhere() });
        this.taxiCentroid = null;
      } else {
        const coordinates = filteredRecords.features.map((feature: any) => feature.attributes ?? {}).filter((attributes: any) => coordinateGroup(attributes) === 'valid');
        this.taxiCentroid = coordinates.length
          ? [coordinates.reduce((sum: number, attributes: any) => sum + Number(attributes.pickup_longitude), 0) / coordinates.length,
            coordinates.reduce((sum: number, attributes: any) => sum + Number(attributes.pickup_latitude), 0) / coordinates.length]
          : null;
        console.info('[Taxi analysis] filtered centroid', { filter: this.taxiFilterWhere(), queryFeatureCount: filteredCount, validCoordinates: coordinates.length, centroid: this.taxiCentroid });
      }
      this.taxiFilteredCount = filteredCount;
      this.updateTaxiMacroMarker(filteredCount);
      const viewFeatureCount = visible?.features.length ?? null;
      if (viewFeatureCount !== visibleCount) {
        console.warn('[Taxi analysis] visible extent result/count differs', { featureCount: viewFeatureCount, queryFeatureCount: visibleCount, extent: extent?.toJSON(), where: filterWhere });
      }
      console.info('[Taxi analysis] filtered dataset vs current extent', {
        filteredDatasetCount: filteredCount,
        currentExtentCount: visibleCount,
        outsideCurrentExtent: visibleCount === null ? null : filteredCount - visibleCount,
        extent: extent?.toJSON(),
        where: filterWhere,
      });
      const fares = visible?.features
        .map((feature: any) => parseFare(feature.attributes.fare_amount))
        .filter((fare: number | null): fare is number => fare !== null) ?? [];
      this.taxiCount.set(visibleCount);
      this.taxiAverage.set(fares.length ? fares.reduce((sum: number, value: number) => sum + value, 0) / fares.length : null);
      this.taxiMaximum.set(fares.length ? Math.max(...fares) : null);

      this.taxiDomainMin.set(histogram.min);
      this.taxiDomainMax.set(histogram.max);
      const filteredHistogram = this.histogramForFilteredRides(histogram, filteredRecords.features, filteredCount);
      this.taxiBins.set(filteredHistogram.bins);
      this.taxiHistogramCount.set(filteredHistogram.count);
      this.taxiNonPositive.set(filteredHistogram.nonPositive);
      this.taxiLowerPercentile.set(histogram.lowerPercentile);
      this.taxiUpperPercentile.set(histogram.upperPercentile);
      this.taxiLowerTail.set(filteredHistogram.lowerTail);
      this.taxiUpperTail.set(filteredHistogram.upperTail);
    } catch (error) {
      if (version !== this.queryVersion || this.destroyed) return;
      console.error('taxi analysis query', error);
      this.taxiCount.set(null);
      this.taxiAverage.set(null);
      this.taxiMaximum.set(null);
      this.taxiBins.set([]);
      this.taxiHistogramCount.set(null);
      this.taxiNonPositive.set(null);
    } finally {
      if (version === this.queryVersion && !this.destroyed) this.taxiLoading.set(false);
    }
  }

  private updateTaxiMacroMarker(count: number): void {
    this.taxiMacroLayer.removeAll();
    this.taxiMacroLayer.effect = 'bloom(1.3, 1px, 0)';
    if (!this.taxiCentroid) return;
    const [longitude, latitude] = this.taxiCentroid;
    this.taxiMacroLayer.addMany([
      new Graphic({
        geometry: new Point({ longitude, latitude }),
        attributes: { kind: 'centroid' },
        symbol: { type: 'simple-marker', size: 26, color: '#ff8a3d', outline: { color: '#fff2d6', width: 2 } } as any,
      }),
      new Graphic({
        geometry: new Point({ longitude, latitude }),
        attributes: { kind: 'label' },
        symbol: {
          type: 'text', text: `NYC taxi data · ${formatNumber(count)} rides`, color: '#fff',
          backgroundColor: '#120d22', borderLineColor: '#d946ef', borderLineSize: 1,
          haloColor: '#07060f', haloSize: 2, xoffset: 88, yoffset: 34,
          font: { size: 12, weight: 'bold' },
        } as any,
      }),
    ]);
  }

  drawDemo(): void {
    this.mapView?.goTo({ center: [100.5242847, 13.7321502], zoom: 14 });
    this.drawLayer.removeAll();

    const pink: any = { type: 'simple-marker', color: [255, 79, 163], outline: { color: [255, 255, 255], width: 1 } };
    const line: any = { type: 'simple-line', color: [255, 138, 61], width: 3 };
    const fill: any = { type: 'simple-fill', color: [255, 79, 163, 0.35], outline: { color: [255, 138, 61], width: 2 } };

    this.drawLayer.addMany([
      new Graphic({
        geometry: { type: 'point', longitude: 100.524209276, latitude: 13.723754772 } as any,
        symbol: pink,
      }),
      new Graphic({
        geometry: {
          type: 'polyline',
          paths: [
            [100.512246726, 13.734446479],
            [100.517553977, 13.729728516],
            [100.522366322, 13.724611763],
          ],
        } as any,
        symbol: line,
      }),
      new Graphic({
        geometry: {
          type: 'polygon',
          rings: [
            [100.514281395, 13.734285121],
            [100.524031709, 13.740545628],
            [100.536322674, 13.736390983],
            [100.532695494, 13.730132215],
            [100.522622498, 13.726082494],
          ],
        } as any,
        symbol: fill,
        attributes: { Name: 'Graphic', Description: 'I am a polygon' },
        popupTemplate: { title: '{Name}', content: '{Description}' } as any,
      }),
    ]);
  }

  clearDraw(): void {
    this.drawLayer.removeAll();
  }

  zoomBangkok(): void {
    this.provinceLayer
      .queryFeatures({
        where: "NAME1='กรุงเทพมหานคร'", // Hard-coded condition.
        returnGeometry: true,
        outFields: ['*'],
        num: 1,
      })
      .then((result) => {
        const feature = result.features[0];
        if (!feature) return;
        this.boundaryLayer.removeAll();
        this.boundaryLayer.add(
          new Graphic({
            geometry: feature.geometry,
            symbol: {
              type: 'simple-fill',
              color: [255, 79, 163, 0.06],
              outline: { color: [255, 138, 61], width: 2.5, style: 'dash' },
            } as any,
          }),
        );
        this.mapView?.goTo({ target: feature.geometry, padding: 40 }, { duration: 1200, easing: 'ease-in-out' });
      })
      .catch((e) => console.error('province query', e));
  }

  zoomIn(): void {
    if (this.mapView) this.mapView.goTo({ zoom: Math.min(MAP_MAX_ZOOM, this.mapView.zoom + 1) }, { duration: 250 });
  }

  zoomOut(): void {
    if (this.mapView) this.mapView.goTo({ zoom: Math.max(TAXI_MIN_ZOOM, this.mapView.zoom - 1) }, { duration: 250 });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.queryVersion++;
    this.stationaryHandle?.remove();
    this.scaleHandle?.remove();
    this.zoomHandle?.remove();
    this.popupHandle?.remove();
    this.rotationHandle?.remove();
    this.clickHandle?.remove();
    this.pointerHandle?.remove();
    this.transportDiagnosticHandle?.remove();
    if (this.pointerFrame !== null) window.cancelAnimationFrame(this.pointerFrame);
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.mapView?.destroy();
    if (this.focusFrame !== null) window.cancelAnimationFrame(this.focusFrame);
  }
}
