import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import Map from '@arcgis/core/Map.js';
import Graphic from '@arcgis/core/Graphic.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import MapImageLayer from '@arcgis/core/layers/MapImageLayer.js';
import MapView from '@arcgis/core/views/MapView.js';
import Point from '@arcgis/core/geometry/Point.js';
import { classifyFloodLocation, toFloodRecurrence, type FloodLocationStatus, type FloodRecurrence } from './flood-utils';

const FLOOD_SERVICE = 'https://gistdaportal.gistda.or.th/data/rest/services/FL_Flood/flood_freq11_20/MapServer';
const PROVINCE_SERVICE = 'https://services1.arcgis.com/jSaRWj2TDlcN1zOC/ArcGIS/rest/services/Thailand_Province_Boundaries_view/FeatureServer/1';
const POI_SERVICE = 'https://services-ap1.arcgis.com/iA7fZQOnjY9D67Zx/ArcGIS/rest/services/OSM_AS_POIs/FeatureServer/0';
const FLOOD_QUERY_FIELDS = ['Freq', 'Y_2011', 'Y_2012', 'Y_2013', 'Y_2014', 'Y_2015', 'Y_2016', 'Y2017', 'Y_2018', 'Y_2019', 'Y_2020', 'PV_TN', 'PV_EN'];

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

  private view: MapView | null = null;
  private clickHandle: { remove(): void } | null = null;
  private disposed = false;

  constructor() {
    this.title.setTitle('Southern Thailand Flood Explorer — Kanokrot Sribuabun');
  }

  private readonly floodLayer = new MapImageLayer({
    url: FLOOD_SERVICE,
    sublayers: [{
      id: 0,
      visible: true,
      opacity: 0.62,
      minScale: 5_500_000,
      renderer: {
        type: 'simple',
        symbol: {
          type: 'simple-fill',
          color: [255, 138, 61, 0.42],
          outline: { color: [255, 177, 112, 0.78], width: 0.55 },
        },
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
    outFields: ['*'],
    minScale: 0,
    maxScale: 1_200_000,
    renderer: {
      type: 'simple',
      symbol: {
        type: 'simple-marker',
        size: 5,
        color: [45, 212, 191, 0.88],
        outline: { color: [8, 20, 24, 0.8], width: 0.6 },
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

  formatYears(years: number[]): string {
    return years.length ? years.join(', ') : 'No year values returned';
  }
}
