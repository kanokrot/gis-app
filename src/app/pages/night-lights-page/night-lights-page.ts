import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import Map from '@arcgis/core/Map.js';
import Graphic from '@arcgis/core/Graphic.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import WMTSLayer from '@arcgis/core/layers/WMTSLayer.js';
import MapView from '@arcgis/core/views/MapView.js';
import Point from '@arcgis/core/geometry/Point.js';
import citiesData from '../../../assets/night-lights/cities.json';

type RegionName = keyof typeof citiesData.regions;
type City = (typeof citiesData.regions)[RegionName][number];
type Year = 2014 | 2024;

const REGIONS: { name: RegionName; center: [number, number]; zoom: number }[] = [
  { name: 'Southeast Asia', center: [108, 11], zoom: 4 },
  { name: 'East Asia', center: [124, 34], zoom: 4 },
  { name: 'Europe', center: [15, 50], zoom: 4 },
  { name: 'World', center: [12, 20], zoom: 2 },
];
const BLACK_MARBLE_MAX_ZOOM = 8;
const CITY_LABEL_ALL_ZOOM = 6;

@Component({
  selector: 'app-night-lights-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './night-lights-page.html',
  styleUrl: './night-lights-page.css',
})
export class NightLightsPage implements AfterViewInit, OnDestroy {
  @ViewChild('mapNode', { static: true }) private mapNode!: ElementRef<HTMLDivElement>;
  private readonly title = inject(Title);
  private view: MapView | null = null;
  private clickHandle: { remove(): void } | null = null;
  private zoomHandle: { remove(): void } | null = null;
  private disposed = false;

  readonly regions = REGIONS;
  readonly activeRegion = signal<RegionName>('Southeast Asia');
  readonly year = signal<Year>(2024);
  readonly selectedCityId = signal<string>('bangkok');
  readonly allCities = Object.values(citiesData.regions).flat() as City[];
  readonly regionCities = signal<City[]>(citiesData.regions['Southeast Asia']);
  readonly selectedCity = signal<City>(citiesData.regions['Southeast Asia'][0]);
  readonly citiesDataNote = `Map imagery: NASA GIBS Black Marble composite. ${citiesData.note}`;

  private readonly cityLayer = new FeatureLayer({
    title: 'City radiance locations',
    source: this.featuresFor(this.allCities),
    definitionExpression: this.cityFilter(citiesData.regions['Southeast Asia']),
    objectIdField: 'OBJECTID',
    fields: [
      { name: 'OBJECTID', alias: 'Object ID', type: 'oid' },
      { name: 'cityId', alias: 'City ID', type: 'string' },
      { name: 'name', alias: 'City', type: 'string' },
      { name: 'radiance2014', alias: '2014 radiance', type: 'double' },
      { name: 'radiance2024', alias: '2024 radiance', type: 'double' },
    ],
    renderer: this.cityRenderer(7),
    labelingInfo: [this.cityLabelInfo()],
    labelsVisible: true,
    popupEnabled: false,
  });
  private readonly selectedLayer = new GraphicsLayer({ title: 'Selected city' });

  constructor() {
    this.title.setTitle('Night Lights Explorer — Kanokrot Sribuabun');
  }

  ngAfterViewInit(): void {
    const nightLights = new WMTSLayer({
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
      activeLayer: { id: 'VIIRS_Black_Marble' },
      title: 'NASA VIIRS Black Marble',
      opacity: 0.96,
    });
    const map = new Map({
      basemap: 'dark-gray-vector',
      layers: [nightLights, this.cityLayer, this.selectedLayer],
    });
    this.view = new MapView({
      container: this.mapNode.nativeElement,
      map,
      center: [108, 11],
      zoom: 4,
      constraints: { minZoom: 2, maxZoom: BLACK_MARBLE_MAX_ZOOM, snapToZoom: false, rotationEnabled: false },
      background: { color: '#05070d' },
      ui: { components: ['attribution'] },
    });
    this.view.when().then(() => {
      if (this.disposed || !this.view) return;
      // The vector dark-gray basemap separates its canvas from the place-label reference layer.
      this.view.map?.basemap?.referenceLayers.removeAll();
      this.zoomHandle = this.view.watch('zoom', () => {
        this.updateCityLabels();
        this.updateCityMarkers();
      });
      this.updateCityLabels();
      this.updateCityMarkers();
      this.clickHandle = this.view.on('click', async (event) => {
        const hit = await this.view?.hitTest(event, { include: this.cityLayer });
        const graphic = hit?.results.find((result) => result.type === 'graphic')?.graphic;
        const id = graphic?.attributes?.['cityId'];
        const city = this.regionCities().find((candidate) => candidate.id === id);
        if (city) this.selectCity(city, false);
      });
      this.highlightSelectedCity();
    }).catch(() => undefined);
    void nightLights.load().catch((error) => console.warn('NASA GIBS Black Marble layer could not load', error));
  }

  setRegion(region: RegionName): void {
    this.activeRegion.set(region);
    const cities = region === 'World' ? this.allCities : citiesData.regions[region];
    this.regionCities.set(cities);
    this.cityLayer.definitionExpression = region === 'World' ? '1=1' : this.cityFilter(cities);
    const currentSelection = cities.find((city) => city.id === this.selectedCityId());
    const selectedCity = currentSelection ?? cities.reduce((brightest, city) =>
      this.brightness(city) > this.brightness(brightest) ? city : brightest,
    );
    this.selectCity(selectedCity, false);
    this.updateCityMarkers();
    const destination = this.regions.find((entry) => entry.name === region)!;
    void this.view?.goTo({ center: destination.center, zoom: destination.zoom }, { duration: 850, easing: 'ease-in-out' });
  }

  setYear(year: Year): void {
    this.year.set(year);
  }

  brightness(city: City): number {
    return this.year() === 2014 ? city.radiance2014 : city.radiance2024;
  }

  maxBrightness(): number {
    return Math.max(...this.regionCities().map((city) => this.brightness(city)));
  }

  rankedCities(): City[] {
    return [...this.regionCities()].sort((a, b) => this.brightness(b) - this.brightness(a));
  }

  barWidth(city: City): number {
    return Math.max(4, (this.brightness(city) / this.maxBrightness()) * 100);
  }

  formatRadiance(value: number): string {
    return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value);
  }

  absoluteLongitude(): number {
    return Math.abs(this.selectedCity().longitude);
  }

  selectCity(city: City, flyTo = true): void {
    this.selectedCity.set(city);
    this.selectedCityId.set(city.id);
    this.highlightSelectedCity();
    this.updateCityLabels();
    if (flyTo) void this.view?.goTo({ center: [city.longitude, city.latitude], zoom: Math.max(this.view?.zoom ?? 6, 6) }, { duration: 650 });
  }

  private cityLabelInfo(): __esri.LabelClassProperties {
    const labelAllCities = this.activeRegion() !== 'World' && (this.view?.zoom ?? 0) >= CITY_LABEL_ALL_ZOOM;
    return {
      labelExpressionInfo: { expression: '$feature.name' },
      where: labelAllCities ? '1=1' : `cityId = '${this.selectedCityId()}'`,
      labelPlacement: 'above-right',
      deconflictionStrategy: 'static',
      symbol: {
        type: 'text',
        color: '#fff2cf',
        haloColor: '#05070d',
        haloSize: 2.5,
        font: { family: 'Space Grotesk', size: 11, weight: 'bold' },
      },
    };
  }

  private updateCityLabels(): void {
    this.cityLayer.labelingInfo = [this.cityLabelInfo()];
  }

  private updateCityMarkers(): void {
    const zoom = this.view?.zoom ?? 2;
    const worldScale = this.activeRegion() === 'World' && zoom <= 3;
    this.cityLayer.renderer = this.cityRenderer(worldScale ? 3 : 7);
  }

  private cityFilter(cities: readonly City[]): string {
    return `cityId IN (${cities.map((city) => `'${city.id.replaceAll("'", "''")}'`).join(', ')})`;
  }

  private cityRenderer(size: number): __esri.SimpleRendererProperties & { type: 'simple' } {
    return {
      type: 'simple',
      symbol: {
        type: 'simple-marker',
        style: 'circle',
        size,
        color: '#ffc857',
        outline: { color: '#241b0b', width: size <= 3 ? 0.6 : 1.5 },
      },
    };
  }

  private featuresFor(cities: readonly City[]): Graphic[] {
    return cities.map((city, index) => new Graphic({
      geometry: new Point({ longitude: city.longitude, latitude: city.latitude }),
      attributes: {
        OBJECTID: index + 1,
        cityId: city.id,
        name: city.name,
        radiance2014: city.radiance2014,
        radiance2024: city.radiance2024,
      },
    }));
  }

  private highlightSelectedCity(): void {
    this.selectedLayer.removeAll();
    const city = this.selectedCity();
    this.selectedLayer.add(new Graphic({
      geometry: new Point({ longitude: city.longitude, latitude: city.latitude }),
      symbol: {
        type: 'simple-marker',
        style: 'circle',
        size: 15,
        color: [94, 234, 212, 0.22],
        outline: { color: '#5eead4', width: 2.5 },
      },
    }));
  }

  ngOnDestroy(): void {
    this.disposed = true;
    this.clickHandle?.remove();
    this.zoomHandle?.remove();
    this.view?.destroy();
    this.view = null;
  }
}
