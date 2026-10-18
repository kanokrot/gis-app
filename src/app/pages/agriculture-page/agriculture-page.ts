import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import DotDensityRenderer from '@arcgis/core/renderers/DotDensityRenderer.js';
import ClassBreaksRenderer from '@arcgis/core/renderers/ClassBreaksRenderer.js';
import Graphic from '@arcgis/core/Graphic.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import ArcGISMap from '@arcgis/core/Map.js';
import MapView from '@arcgis/core/views/MapView.js';
import provinceData from './province-data.json';
import {
  calculateShare,
  chooseDotValue,
  dotCount,
  formatAgricultureValue,
  formatRank,
  formatTooltipText,
  rankItems,
  topItems,
} from './agriculture-utils';

type MetricId = 'riceArea' | 'caneArea' | 'machineryShare';
type ProvinceRecord = typeof provinceData.provinces[number];
type DisplayMode = 'colors' | 'dots';

interface MetricOption {
  id: MetricId;
  label: string;
  unit: string;
  sourceYear: string;
  description: string;
  colors: readonly string[];
}

interface LegendItem {
  color: string;
  label: string;
}

interface TopProvince {
  province: string;
  value: number;
  rank: number;
  barWidth: number;
  formattedValue: string;
}

interface TooltipState {
  text: string;
  x: number;
  y: number;
}

const PROVINCE_SERVICE = 'https://services1.arcgis.com/jSaRWj2TDlcN1zOC/ArcGIS/rest/services/Thailand_Province_Boundaries_view/FeatureServer/1';
const PROVINCES: ProvinceRecord[] = provinceData.provinces;
const NO_DATA_COLOR = '#52525b';
const METRICS: readonly MetricOption[] = [
  {
    id: 'riceArea', label: 'Rice area · wet-season 2565/66', unit: 'rai', sourceYear: 'Crop year 2565/66',
    description: 'Planted area for wet-season rice, reported in rai.',
    colors: ['#a87916', '#c09225', '#d4a638', '#e7c05c', '#f3d990'],
  },
  {
    id: 'caneArea', label: 'Forecast planted area (CaneArea) · 2565/66', unit: 'source units', sourceYear: 'Production year 2565/66',
    description: 'CaneArea is described in the supplied dictionary as forecast planted area. Its unit is not confirmed.',
    colors: ['#14532d', '#15803d', '#22a447', '#4ade80', '#a3e635'],
  },
  {
    id: 'machineryShare', label: 'Share of holders reporting any machinery use', unit: '% of reporting holders', sourceYear: 'Year not stated in supplied file; NSO catalog identifies 2566',
    description: 'Holders reporting machine use ÷ holders reporting machinery use. The supplied CSV does not identify machine types or year.',
    colors: ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1'],
  },
];

const FIELD_BY_METRIC: Record<MetricId, string> = {
  riceArea: 'riceArea',
  caneArea: 'caneArea',
  machineryShare: 'machineryShare',
};

@Component({
  selector: 'app-agriculture-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './agriculture-page.html',
  styleUrl: './agriculture-page.css',
})
export class AgriculturePage implements AfterViewInit, OnDestroy {
  @ViewChild('mapNode', { static: true }) private mapNode!: ElementRef<HTMLDivElement>;
  @ViewChild('panelNode', { static: true }) private panelNode!: ElementRef<HTMLElement>;
  private readonly title = inject(Title);
  private view: MapView | null = null;
  private readonly boundaryLayer = new FeatureLayer({
    url: PROVINCE_SERVICE,
    title: 'Thailand province boundaries',
    outFields: ['NAME1'],
    popupEnabled: false,
  });
  private thematicLayer: FeatureLayer | null = null;
  private thematicLayerView: __esri.FeatureLayerView | null = null;
  private provinceGeometries = new Map<string, __esri.Geometry>();
  private destroyed = false;
  private eventHandles: { remove(): void }[] = [];
  private highlightHandle: __esri.Handle | null = null;
  private hoverFrame = 0;
  private hoverSequence = 0;
  private resizeObserver: ResizeObserver | null = null;
  private dotValues: Record<'riceArea' | 'caneArea', number | null> = { riceArea: null, caneArea: null };

  readonly metric = signal<MetricId>('riceArea');
  readonly displayMode = signal<DisplayMode>('colors');
  readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly selectedProvince = signal<string | null>(null);
  readonly selectedRecord = signal<ProvinceRecord | null>(null);
  readonly tooltip = signal<TooltipState | null>(null);
  readonly metrics = METRICS;
  readonly legend = signal<LegendItem[]>([]);

  constructor() {
    this.title.setTitle('Rice, sugarcane & machinery use by province — Kanokrot Sribuabun');
  }

  ngAfterViewInit(): void {
    const map = new ArcGISMap({ basemap: 'dark-gray-vector' });
    this.view = new MapView({
      container: this.mapNode.nativeElement,
      map,
      center: [100.5, 15.5],
      zoom: 5,
      constraints: { minZoom: 4, maxZoom: 18, snapToZoom: false, rotationEnabled: false },
      background: { color: '#09090b' },
      ui: { components: ['attribution', 'zoom'] },
    });
    this.resizeObserver = new ResizeObserver(() => this.updateViewPadding());
    this.resizeObserver.observe(this.panelNode.nativeElement);
    window.addEventListener('resize', this.updateViewPadding);
    this.view.when().then(async () => {
      if (this.destroyed || !this.view) return;
      this.view.ui.move('zoom', 'bottom-right');
      this.updateViewPadding();
      this.eventHandles.push(this.view.on('click', (event) => void this.selectProvinceAt(event)));
      this.eventHandles.push(this.view.on('pointer-move', (event) => this.scheduleHover(event)));
      await this.loadProvinceGeometries();
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
    this.view?.destroy();
    this.view = null;
  }

  readonly updateViewPadding = (): void => {
    if (!this.view) return;
    const mobile = window.innerWidth <= 720;
    const panel = this.panelNode?.nativeElement.getBoundingClientRect();
    const padding = mobile
      ? { left: 0, top: Math.ceil((panel?.height ?? window.innerHeight * 0.55) + 28), right: 0, bottom: 0 }
      : { left: Math.ceil((panel?.width ?? 390) + 48), top: 0, right: 0, bottom: 0 };
    this.view.padding = padding;
  };

  selectMetric(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (!METRICS.some((item) => item.id === value)) return;
    this.metric.set(value as MetricId);
    this.displayMode.set('colors');
    this.drawMetric();
  }

  setDisplayMode(mode: DisplayMode): void {
    if (this.metric() === 'machineryShare') return;
    this.displayMode.set(mode);
    this.drawMetric();
  }

  activeMetric(): MetricOption {
    return METRICS.find((item) => item.id === this.metric())!;
  }

  formatRecordValue(record: ProvinceRecord, metric: MetricId): string {
    return formatAgricultureValue(this.metricValue(record, metric), this.unitFor(metric), metric === 'machineryShare' ? 'share' : 'area');
  }

  formatRecordYear(metric: MetricId): string {
    if (metric === 'machineryShare') return 'Year not stated in supplied file; NSO catalog: 2566';
    return metric === 'riceArea' ? 'Crop year 2565/66' : 'Production year 2565/66';
  }

  rankForSelected(): string {
    const province = this.selectedProvince();
    if (!province) return 'No rank';
    const ranked = this.rankCurrentMetric();
    const entry = ranked.find((item) => item.item.province === province);
    return formatRank(entry?.rank ?? null, ranked.length);
  }

  topTen(): TopProvince[] {
    const entries = topItems(this.rankCurrentMetric());
    const max = entries[0]?.value ?? 1;
    return entries.map(({ item, value, rank }) => ({
      province: item.province,
      value,
      rank,
      barWidth: Math.max(2, (value / max) * 100),
      formattedValue: formatAgricultureValue(value, this.unitFor(this.metric()), this.metric() === 'machineryShare' ? 'share' : 'area'),
    }));
  }

  rankCount(): number {
    return this.rankCurrentMetric().length;
  }

  dotValueForMetric(): number | null {
    if (this.metric() === 'riceArea') return this.dotValues.riceArea;
    if (this.metric() === 'caneArea') return this.dotValues.caneArea;
    return null;
  }

  dotValueLabel(): string {
    const value = this.dotValueForMetric();
    if (value === null) return '';
    const unit = this.metric() === 'riceArea' ? 'rai' : 'source units (unit not confirmed)';
    return `1 dot = ${new Intl.NumberFormat('en-US').format(value)} ${unit}`;
  }

  selectTopProvince(province: string): void {
    const record = PROVINCES.find((item) => item.province === province);
    const geometry = this.provinceGeometries.get(province);
    if (!record || !geometry) return;
    this.setSelectedProvince(record);
    void this.view?.goTo({ target: geometry, padding: this.view.padding }, { duration: 650 }).catch(() => undefined);
  }

  private async loadProvinceGeometries(): Promise<void> {
    try {
      const result = await this.boundaryLayer.queryFeatures({
        where: '1=1', outFields: ['NAME1'], returnGeometry: true, outSpatialReference: { wkid: 4326 },
      });
      if (this.destroyed) return;
      const features: Graphic[] = [];
      let objectId = 1;
      for (const feature of result.features) {
        const name = feature.attributes['NAME1'];
        if (typeof name !== 'string' || !feature.geometry) continue;
        const province = name.trim();
        const record = PROVINCES.find((entry) => entry.province === province);
        if (!record) continue;
        this.provinceGeometries.set(province, feature.geometry);
        features.push(new Graphic({
          geometry: feature.geometry,
          attributes: {
            OBJECTID: objectId++,
            province,
            riceArea: record.riceArea,
            caneArea: record.caneArea,
            machineryShare: calculateShare(record.machineryUsed, record.machineryReported),
          },
        }));
      }
      if (!features.length) throw new Error('No matching province geometries returned');
      this.dotValues = {
        riceArea: chooseDotValue(PROVINCES.map((record) => record.riceArea)),
        caneArea: chooseDotValue(PROVINCES.map((record) => record.caneArea)),
      };
      const layer = new FeatureLayer({
        title: 'Provincial agriculture indicators',
        source: features,
        objectIdField: 'OBJECTID',
        geometryType: 'polygon',
        spatialReference: { wkid: 4326 },
        fields: [
          { name: 'OBJECTID', alias: 'Object ID', type: 'oid' },
          { name: 'province', alias: 'Province', type: 'string' },
          { name: 'riceArea', alias: 'Rice planted area', type: 'double' },
          { name: 'caneArea', alias: 'CaneArea forecast planted area', type: 'double' },
          { name: 'machineryShare', alias: 'Holders reporting machinery use (%)', type: 'double' },
        ],
        popupEnabled: false,
        renderer: this.buildRenderer(),
      });
      this.thematicLayer = layer;
      this.view?.map?.add(layer);
      this.thematicLayerView = this.view ? await this.view.whenLayerView(layer) as __esri.FeatureLayerView : null;
      let extent: __esri.Extent | null = null;
      for (const geometry of this.provinceGeometries.values()) {
        const geometryExtent = geometry.extent;
        if (!geometryExtent) continue;
        extent = extent ? extent.union(geometryExtent) : geometryExtent.clone();
      }
      if (extent && this.view) await this.view.goTo({ target: extent.expand(1.08), padding: this.view.padding }, { duration: 0 });
      this.drawMetric();
      this.loadState.set('ready');
    } catch {
      if (!this.destroyed) this.loadState.set('error');
    }
  }

  private drawMetric(): void {
    if (!this.thematicLayer) return;
    const renderer = this.buildRenderer();
    this.thematicLayer.renderer = renderer;
    if (renderer.type === 'class-breaks') this.legend.set(this.buildColorLegend());
    else this.legend.set([]);
  }

  private buildRenderer(): __esri.Renderer {
    const metric = this.metric();
    if (this.displayMode() === 'dots' && metric !== 'machineryShare') {
      const dotValue = this.dotValueForMetric() ?? 1;
      return new DotDensityRenderer({
        attributes: [{ field: FIELD_BY_METRIC[metric], color: METRICS.find((item) => item.id === metric)!.colors[3], label: this.activeMetric().label }],
        dotValue,
        dotSize: 2,
        dotBlendingEnabled: false,
        backgroundColor: [9, 9, 11, 0],
        outline: { color: [161, 161, 170, 0.8], width: 0.45 },
      });
    }
    const values = rankItems(PROVINCES, (record) => this.metricValue(record, metric)).map((entry) => entry.value).sort((a, b) => a - b);
    const colors = this.activeMetric().colors;
    const breaks = colors.map((_, index) => values[Math.min(values.length - 1, Math.ceil(((index + 1) * values.length) / colors.length) - 1)] ?? 0);
    const classBreakInfos = colors.map((color, index) => ({
      minValue: index === 0 ? values[0] ?? 0 : breaks[index - 1],
      maxValue: breaks[index],
      label: this.legendLabel(index, breaks),
      symbol: { type: 'simple-fill', color: hexToRgb(color, 0.82), outline: { color: [212, 212, 216, 0.72], width: 0.6 } },
    }));
    return new ClassBreaksRenderer({
      field: FIELD_BY_METRIC[metric],
      classBreakInfos,
      defaultLabel: 'No record in supplied file',
      defaultSymbol: { type: 'simple-fill', color: hexToRgb(NO_DATA_COLOR, 0.78), outline: { color: [212, 212, 216, 0.72], width: 0.6 } },
    } as any);
  }

  private buildColorLegend(): LegendItem[] {
    const metric = this.metric();
    const values = rankItems(PROVINCES, (record) => this.metricValue(record, metric)).map((entry) => entry.value).sort((a, b) => a - b);
    if (!values.length) return [];
    const colors = this.activeMetric().colors;
    const breaks = colors.map((_, index) => values[Math.min(values.length - 1, Math.ceil(((index + 1) * values.length) / colors.length) - 1)]);
    return colors.map((color, index) => ({ color, label: this.legendLabel(index, breaks) }));
  }

  private legendLabel(index: number, breaks: readonly number[]): string {
    if (index === 0) return `≤ ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(breaks[index])}`;
    return `> ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(breaks[index - 1])}–≤ ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(breaks[index])}`;
  }

  private async selectProvinceAt(event: __esri.ViewClickEvent): Promise<void> {
    if (!this.view || !this.thematicLayer || !event.mapPoint) return;
    try {
      const hit = await this.view.hitTest(event, { include: this.thematicLayer });
      const name = hit.results.find((result) => result.type === 'graphic')?.graphic.attributes['province'];
      const record = typeof name === 'string' ? PROVINCES.find((item) => item.province === name) : null;
      if (record) this.setSelectedProvince(record);
    } catch {
      this.selectedProvince.set(null);
      this.selectedRecord.set(null);
    }
  }

  private setSelectedProvince(record: ProvinceRecord): void {
    this.selectedProvince.set(record.province);
    this.selectedRecord.set(record);
    if (this.thematicLayer) void this.updateHighlight(record.province);
  }

  private scheduleHover(event: __esri.ViewPointerMoveEvent): void {
    if (this.hoverFrame) return;
    const x = event.x;
    const y = event.y;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      void this.inspectHover(x, y);
    });
  }

  private async inspectHover(x: number, y: number): Promise<void> {
    if (!this.view || !this.thematicLayer) return;
    const sequence = ++this.hoverSequence;
    try {
      const hit = await this.view.hitTest({ x, y }, { include: this.thematicLayer });
      if (sequence !== this.hoverSequence || this.destroyed) return;
      const graphic = hit.results.find((result) => result.type === 'graphic')?.graphic;
      const name = graphic?.attributes['province'];
      const record = typeof name === 'string' ? PROVINCES.find((item) => item.province === name) : null;
      if (!graphic || !record) {
        this.tooltip.set(null);
        this.mapNode.nativeElement.style.cursor = 'default';
        this.highlightHandle?.remove();
        this.highlightHandle = null;
        return;
      }
      const metric = this.metric();
      this.tooltip.set({
        text: formatTooltipText(record.province, this.metricValue(record, metric), this.unitFor(metric), metric === 'machineryShare' ? 'share' : 'area'),
        x: Math.min(x + 14, Math.max(8, this.mapNode.nativeElement.clientWidth - 280)),
        y: Math.max(8, y - 42),
      });
      this.mapNode.nativeElement.style.cursor = 'pointer';
      await this.updateHighlight(record.province);
    } catch {
      if (sequence === this.hoverSequence) this.tooltip.set(null);
    }
  }

  private async updateHighlight(province: string): Promise<void> {
    if (!this.view || !this.thematicLayer) return;
    try {
      const layerView = this.thematicLayerView ?? await this.view.whenLayerView(this.thematicLayer) as __esri.FeatureLayerView;
      this.thematicLayerView = layerView;
      this.highlightHandle?.remove();
      const feature = this.thematicLayer.source?.find((item) => item.attributes['province'] === province);
      if (feature) this.highlightHandle = layerView.highlight(feature);
    } catch {
      this.highlightHandle?.remove();
      this.highlightHandle = null;
    }
  }

  private rankCurrentMetric() {
    return rankItems(PROVINCES, (record) => this.metricValue(record, this.metric()));
  }

  private metricValue(record: ProvinceRecord, metric: MetricId): number | null {
    if (metric === 'riceArea') return record.riceArea;
    if (metric === 'caneArea') return record.caneArea ?? null;
    return calculateShare(record.machineryUsed, record.machineryReported);
  }

  private unitFor(metric: MetricId): string {
    return metric === 'machineryShare' ? '%' : metric === 'riceArea' ? 'rai' : 'source units (unit not confirmed)';
  }
}

function hexToRgb(hex: string, alpha: number): [number, number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
}
