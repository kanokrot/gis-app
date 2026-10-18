import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import Graphic from '@arcgis/core/Graphic.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import ArcGISMap from '@arcgis/core/Map.js';
import MapView from '@arcgis/core/views/MapView.js';
import provinceData from './province-data.json';
import { calculateShare, colorBandIndex } from './agriculture-utils';

type MetricId = 'riceArea' | 'caneArea' | 'machineryShare';
type ProvinceRecord = typeof provinceData.provinces[number];

interface MetricOption {
  id: MetricId;
  label: string;
  unit: string;
  sourceYear: string;
  description: string;
  colors: readonly string[];
}

const PROVINCE_SERVICE = 'https://services1.arcgis.com/jSaRWj2TDlcN1zOC/ArcGIS/rest/services/Thailand_Province_Boundaries_view/FeatureServer/1';
const PROVINCES: ProvinceRecord[] = provinceData.provinces;
const METRICS: readonly MetricOption[] = [
  {
    id: 'riceArea', label: 'Rice area · wet-season 2565/66', unit: 'rai', sourceYear: 'Crop year 2565/66',
    description: 'Planted area for wet-season rice, reported in rai.',
    colors: ['#164e63', '#0e7490', '#0891b2', '#22d3ee', '#a5f3fc'],
  },
  {
    id: 'caneArea', label: 'Forecast planted area (CaneArea) · 2565/66', unit: 'source value', sourceYear: 'Production year 2565/66',
    description: 'CaneArea is described in the supplied dictionary as forecast planted area. The file does not state its unit.',
    colors: ['#365314', '#4d7c0f', '#65a30d', '#a3e635', '#d9f99d'],
  },
  {
    id: 'machineryShare', label: 'Share of holders reporting any machinery use', unit: '% of reporting holders', sourceYear: 'Year not stated in supplied file; NSO catalog identifies 2566',
    description: 'Holders reporting machine use ÷ holders reporting machinery use. The supplied CSV does not identify machine types or year.',
    colors: ['#713f12', '#a16207', '#ca8a04', '#facc15', '#fef08a'],
  },
];

const NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

@Component({
  selector: 'app-agriculture-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './agriculture-page.html',
  styleUrl: './agriculture-page.css',
})
export class AgriculturePage implements AfterViewInit, OnDestroy {
  @ViewChild('mapNode', { static: true }) private mapNode!: ElementRef<HTMLDivElement>;
  private readonly title = inject(Title);
  private view: MapView | null = null;
  private readonly thematicLayer = new GraphicsLayer({ title: 'Province data comparison' });
  private readonly boundaryLayer = new FeatureLayer({
    url: PROVINCE_SERVICE,
    title: 'Thailand province boundaries',
    outFields: ['NAME1'],
    popupEnabled: false,
    renderer: {
      type: 'simple',
      symbol: { type: 'simple-fill', color: [0, 0, 0, 0], outline: { color: [212, 212, 216, 0.56], width: 0.65 } },
    } as any,
  });
  private provinceGeometries = new Map<string, __esri.Geometry>();
  private destroyed = false;
  private clickHandle: { remove(): void } | null = null;

  readonly metric = signal<MetricId>('riceArea');
  readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly selectedProvince = signal<string | null>(null);
  readonly selectedRecord = signal<ProvinceRecord | null>(null);
  readonly metrics = METRICS;
  readonly legend = signal<{ color: string; label: string }[]>([]);

  constructor() {
    this.title.setTitle('Rice, sugarcane & machinery use by province — Kanokrot Sribuabun');
  }

  ngAfterViewInit(): void {
    const map = new ArcGISMap({ basemap: 'dark-gray-vector', layers: [this.thematicLayer, this.boundaryLayer] });
    this.view = new MapView({
      container: this.mapNode.nativeElement,
      map,
      center: [101, 15.5],
      zoom: 5,
      constraints: { minZoom: 4, maxZoom: 18, snapToZoom: false, rotationEnabled: false },
      background: { color: '#09090b' },
      ui: { components: ['attribution', 'zoom'] },
    });
    this.view.when().then(async () => {
      if (this.destroyed || !this.view) return;
      this.view.ui.move('zoom', 'bottom-right');
      this.clickHandle = this.view.on('click', (event) => void this.selectProvinceAt(event));
      await this.loadProvinceGeometries();
    }).catch(() => {
      if (!this.destroyed) this.loadState.set('error');
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clickHandle?.remove();
    this.view?.destroy();
    this.view = null;
  }

  selectMetric(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (!METRICS.some((item) => item.id === value)) return;
    this.metric.set(value as MetricId);
    this.drawProvinces();
  }

  activeMetric(): MetricOption {
    return METRICS.find((item) => item.id === this.metric())!;
  }

  formatValue(value: number | null | undefined): string {
    return value === null || value === undefined ? 'No record' : NUMBER_FORMAT.format(value);
  }

  formatSelectedValue(record: ProvinceRecord | null): string {
    if (!record) return '—';
    const value = this.metricValue(record, this.metric());
    if (value === null) return 'No record in supplied file';
    if (this.metric() === 'machineryShare') return `${NUMBER_FORMAT.format(value)}%`;
    return `${NUMBER_FORMAT.format(value)} ${this.activeMetric().unit}`;
  }

  private async loadProvinceGeometries(): Promise<void> {
    try {
      const result = await this.boundaryLayer.queryFeatures({
        where: '1=1', outFields: ['NAME1'], returnGeometry: true,
      });
      if (this.destroyed) return;
      for (const feature of result.features) {
        const name = feature.attributes['NAME1'];
        if (typeof name === 'string' && feature.geometry) this.provinceGeometries.set(name.trim(), feature.geometry);
      }
      if (!this.provinceGeometries.size) throw new Error('No province geometries returned');
      this.drawProvinces();
      this.loadState.set('ready');
    } catch {
      if (!this.destroyed) this.loadState.set('error');
    }
  }

  private drawProvinces(): void {
    if (!this.provinceGeometries.size) return;
    const metric = this.metric();
    const values = PROVINCES
      .map((record) => this.metricValue(record, metric))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    if (!values.length) return;
    const colors = this.activeMetric().colors;
    const breaks = colors.map((_, index) => values[Math.min(values.length - 1, Math.ceil(((index + 1) * values.length) / colors.length) - 1)]);
    this.legend.set(colors.map((color, index) => ({
      color,
      label: index === 0
        ? `≤ ${NUMBER_FORMAT.format(breaks[index])}`
        : `> ${NUMBER_FORMAT.format(breaks[index - 1])}–≤ ${NUMBER_FORMAT.format(breaks[index])}`,
    })));
    const graphics: Graphic[] = [];
    for (const record of PROVINCES) {
      const geometry = this.provinceGeometries.get(record.province);
      if (!geometry) continue;
      const value = this.metricValue(record, metric);
      const colorIndex = colorBandIndex(value, breaks);
      const color = colorIndex < 0 ? '#3f3f46' : colors[colorIndex];
      const selected = record.province === this.selectedProvince();
      graphics.push(new Graphic({
        geometry,
        attributes: { province: record.province, value },
        symbol: {
          type: 'simple-fill', color: hexToRgb(color, value === null ? 0.36 : 0.72),
          outline: { color: selected ? [45, 212, 191, 1] : [212, 212, 216, 0.68], width: selected ? 2 : 0.55 },
        } as any,
      }));
    }
    this.thematicLayer.removeAll();
    this.thematicLayer.addMany(graphics);
  }

  private async selectProvinceAt(event: __esri.ViewClickEvent): Promise<void> {
    if (!this.view || !event.mapPoint) return;
    try {
      const hit = await this.view.hitTest(event, { include: this.thematicLayer });
      const name = hit.results.find((result) => result.type === 'graphic')?.graphic.attributes['province'];
      if (typeof name !== 'string') {
        this.selectedProvince.set(null);
        this.selectedRecord.set(null);
        this.drawProvinces();
        return;
      }
      const record = PROVINCES.find((item) => item.province === name) ?? null;
      this.selectedProvince.set(name);
      this.selectedRecord.set(record);
      this.drawProvinces();
    } catch {
      this.selectedProvince.set(null);
      this.selectedRecord.set(null);
    }
  }

  private metricValue(record: ProvinceRecord, metric: MetricId): number | null {
    if (metric === 'riceArea') return record.riceArea;
    if (metric === 'caneArea') return record.caneArea ?? null;
    return calculateShare(record.machineryUsed, record.machineryReported);
  }
}

function hexToRgb(hex: string, alpha: number): [number, number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
}
