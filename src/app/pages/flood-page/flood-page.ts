import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import Map from '@arcgis/core/Map.js';
import Graphic from '@arcgis/core/Graphic.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer.js';
import FeatureFilter from '@arcgis/core/layers/support/FeatureFilter.js';
import MapView from '@arcgis/core/views/MapView.js';
import Point from '@arcgis/core/geometry/Point.js';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine.js';
import { buildFloodYearStrip, classifyFloodLocation, FLOOD_RECURRENCE_LEGEND, floodRecurrenceColor, toFloodRecurrence, type FloodLocationStatus, type FloodRecurrence } from './flood-utils';

const FLOOD_SERVICE = 'https://gistdaportal.gistda.or.th/data/rest/services/FL_Flood/flood_freq11_20/MapServer';
const PROVINCE_SERVICE = 'https://services1.arcgis.com/jSaRWj2TDlcN1zOC/ArcGIS/rest/services/Thailand_Province_Boundaries_view/FeatureServer/1';
const POI_SERVICE = 'https://services-ap1.arcgis.com/iA7fZQOnjY9D67Zx/ArcGIS/rest/services/OSM_AS_POIs/FeatureServer/0';
const FLOOD_QUERY_FIELDS = ['Freq', 'Y_2011', 'Y_2012', 'Y_2013', 'Y_2014', 'Y_2015', 'Y_2016', 'Y2017', 'Y_2018', 'Y_2019', 'Y_2020', 'PV_TN', 'PV_EN'];
const SOUTHERN_PROVINCE_CODES = ['80', '90', '93', '84', '96', '94', '95', '92', '86', '91', '82', '81'];
const DEFAULT_FLOOD_OPACITY = 0.78;

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

@Component({
  selector: 'app-flood-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './flood-page.html',
  styleUrl: './flood-page.css',
})
export class FloodPage implements AfterViewInit, OnDestroy {
  @ViewChild('mapNode', { static: true }) private mapNode!: ElementRef<HTMLDivElement>;
  private readonly title = inject(Title);

  readonly selection = signal<FloodRecurrence[]>([]);
  readonly locationStatus = signal<FloodLocationStatus | null>(null);
  readonly selectedProvince = signal<string | null>(null);
  readonly queryBusy = signal(false);
  readonly queryError = signal<string | null>(null);
  readonly serviceError = signal<string | null>(null);
  readonly poiFilterActive = signal(false);
  readonly floodLegend = FLOOD_RECURRENCE_LEGEND;
  readonly floodOpacity = signal(DEFAULT_FLOOD_OPACITY);

  private view: MapView | null = null;
  private clickHandle: { remove(): void } | null = null;
  private disposed = false;

  constructor() {
    this.title.setTitle('Southern Thailand Flood Explorer — Kanokrot Sribuabun');
  }

  private readonly floodLayer = new MapImageLayer({
    url: FLOOD_SERVICE,
    imageMaxWidth: 4096,
    imageMaxHeight: 4096,
    sublayers: [{
      id: 0,
      visible: true,
      opacity: DEFAULT_FLOOD_OPACITY,
      minScale: 5_500_000,
      renderer: {
        type: 'class-breaks',
        field: 'Freq',
        minValue: 0.5,
        classBreakInfos: FLOOD_RECURRENCE_LEGEND.map((entry, index) => ({
          minValue: entry.frequency - 0.5,
          maxValue: entry.frequency + 0.5,
          label: String(entry.frequency),
          symbol: {
            type: 'simple-fill',
            color: [...hexToRgb(floodRecurrenceColor(entry.frequency)!), 0.72],
            outline: { color: [244, 244, 245, 0.3], width: 0.35 },
          },
        })),
      } as any,
    }],
  });

  private readonly clickMarkerLayer = new GraphicsLayer({ title: 'Selected map location' });

  private readonly provinceLayer = new FeatureLayer({
    url: PROVINCE_SERVICE,
    title: 'Thailand province boundaries',
    visible: true,
    outFields: ['NAME1', 'NAME_ENG1', 'ADMIN_ID1'],
    renderer: {
      type: 'simple',
      symbol: {
        type: 'simple-fill',
        color: [0, 0, 0, 0],
        outline: { color: [203, 213, 225, 0.55], width: 0.65 },
      },
    } as any,
    popupEnabled: false,
  });

  private readonly poiLayer = new FeatureLayer({
    url: POI_SERVICE,
    title: 'OpenStreetMap points of interest',
    outFields: ['objectid', 'name', 'name_en', 'amenity', 'healthcare', 'tourism', 'shop'],
    minScale: 1_200_000,
    maxScale: 0,
    renderer: {
      type: 'simple',
      symbol: {
        type: 'simple-marker',
        size: 3,
        color: [228, 228, 231, 0.5],
        outline: { color: [24, 24, 27, 0.72], width: 0.45 },
      },
    } as any,
    popupEnabled: false,
  });

  ngAfterViewInit(): void {
    const map = new Map({
      basemap: 'dark-gray-vector',
      layers: [this.floodLayer, this.provinceLayer, this.poiLayer, this.clickMarkerLayer],
    });
    this.view = new MapView({
      container: this.mapNode.nativeElement,
      map,
      center: [99.5, 8.1],
      zoom: 7,
      constraints: { minZoom: 6, maxZoom: 19, snapToZoom: false, rotationEnabled: false },
      background: { color: '#09090b' },
      ui: { components: ['attribution', 'zoom'] },
    });
    this.view.when().then(() => {
      if (this.disposed || !this.view) return;
      this.view.ui.move('zoom', 'bottom-right');
      const layer = this.floodLayer.findSublayerById(0);
      if (!layer) {
        this.serviceError.set('The GISTDA flood layer is unavailable right now. Please try again later.');
        return;
      }
      this.clickHandle = this.view.on('click', (event) => {
        if (!event.mapPoint) return;
        this.clickMarkerLayer.removeAll();
        this.clickMarkerLayer.add(new Graphic({
          geometry: event.mapPoint,
          symbol: {
            type: 'simple-marker',
            style: 'circle',
            size: 12,
            color: '#2dd4bf',
            outline: { color: '#09090b', width: 2 },
          },
        }));
        void this.inspectPoint(event.mapPoint);
      });
      void this.floodLayer.load().catch(() => this.serviceError.set('The GISTDA flood layer is unavailable right now. Please try again later.'));
      void this.provinceLayer.load().catch(() => undefined);
      void this.filterPoisToSouthernThailand();
    }).catch(() => this.serviceError.set('The map could not be opened. Please refresh and try again.'));
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.clickHandle?.remove();
    this.view?.destroy();
    this.view = null;
  }

  private async inspectPoint(point: Point): Promise<void> {
    const sublayer = this.floodLayer.findSublayerById(0);
    if (!sublayer) return;
    this.queryBusy.set(true);
    this.queryError.set(null);
    this.selection.set([]);
    this.locationStatus.set(null);
    this.selectedProvince.set(null);
    try {
      const query = sublayer.createQuery();
      query.geometry = point;
      query.spatialRelationship = 'intersects';
      query.outFields = FLOOD_QUERY_FIELDS;
      query.returnGeometry = false;
      query.num = 12;
      const provinceQuery = this.provinceLayer.queryFeatures({
        geometry: point,
        spatialRelationship: 'intersects',
        outFields: ['NAME1', 'NAME_ENG1', 'ADMIN_ID1'],
        returnGeometry: false,
        num: 1,
      });
      const [floodResult, provinceResult] = await Promise.all([
        sublayer.queryFeatures(query),
        provinceQuery,
      ]);
      if (this.disposed) return;
      const features = floodResult.features.map((feature) => toFloodRecurrence(feature.attributes));
      this.selection.set(features);
      const province = provinceResult?.features[0]?.attributes;
      this.locationStatus.set(classifyFloodLocation(province ?? null, features));
      this.selectedProvince.set(
        features[0]?.provinceEnglish ?? stringValue(province?.['NAME_ENG1']) ?? stringValue(province?.['NAME1']),
      );
    } catch {
      if (!this.disposed) {
        this.queryError.set('Could not check this location because a map service is unavailable. Please try again later.');
      }
    } finally {
      if (!this.disposed) this.queryBusy.set(false);
    }
  }

  private async filterPoisToSouthernThailand(): Promise<void> {
    try {
      const [provinceResult, poiLayerView] = await Promise.all([
        this.provinceLayer.queryFeatures({
          where: `ADMIN_ID1 IN (${SOUTHERN_PROVINCE_CODES.map((code) => `'${code}'`).join(',')})`,
          outFields: ['ADMIN_ID1'],
          returnGeometry: true,
        }),
        this.view!.whenLayerView(this.poiLayer),
      ]);
      const geometries = provinceResult.features.flatMap((feature) => feature.geometry ? [feature.geometry] : []);
      if (this.disposed || geometries.length !== SOUTHERN_PROVINCE_CODES.length) return;
      const southernGeometry = geometryEngine.union(geometries);
      if (!southernGeometry) return;
      poiLayerView.filter = new FeatureFilter({ geometry: southernGeometry, spatialRelationship: 'intersects' });
      this.poiFilterActive.set(true);
    } catch {
      if (!this.disposed) this.poiFilterActive.set(false);
    }
  }

  formatYears(years: number[]): string {
    return years.length ? years.join(', ') : 'No year values returned';
  }

  yearStrip(years: readonly number[]): { year: number; affected: boolean }[] {
    return buildFloodYearStrip(years);
  }

  setFloodOpacity(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    const layer = this.floodLayer.findSublayerById(0);
    if (!layer) return;
    layer.opacity = value;
    this.floodOpacity.set(value);
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
