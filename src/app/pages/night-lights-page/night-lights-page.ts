import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import Map from '@arcgis/core/Map.js';
import Graphic from '@arcgis/core/Graphic.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import WMTSLayer from '@arcgis/core/layers/WMTSLayer.js';
import TileLayer from '@arcgis/core/layers/TileLayer.js';
import MapView from '@arcgis/core/views/MapView.js';
import Swipe from '@arcgis/core/widgets/Swipe.js';
import Point from '@arcgis/core/geometry/Point.js';
import TextSymbol from '@arcgis/core/symbols/TextSymbol.js';
import citiesData from '../../../assets/night-lights/cities.json';

type RegionName = keyof typeof citiesData.regions;
type City = (typeof citiesData.regions)[RegionName][number];
type Year = 2014 | 2024;
type GlowIntensity = 'low' | 'medium' | 'high';

const REGIONS: { name: RegionName; center: [number, number]; zoom: number }[] = [
  { name: 'Southeast Asia', center: [108, 11], zoom: 4 },
  { name: 'East Asia', center: [124, 34], zoom: 4 },
  { name: 'Europe', center: [15, 50], zoom: 4 },
  { name: 'World', center: [12, 20], zoom: 2 },
];
const BLACK_MARBLE_NATIVE_MAX_ZOOM = 8;
const DEEP_ZOOM_MAX_ZOOM = 14;
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
  private nightLights: WMTSLayer | null = null;
  private dayImagery: TileLayer | null = null;
  private swipe: Swipe | null = null;
  private worldScaleMarkers: boolean | null = null;
  private cityLabelKey = '';

  readonly regions = REGIONS;
  readonly glowLevels: GlowIntensity[] = ['low', 'medium', 'high'];
  readonly activeRegion = signal<RegionName>('Southeast Asia');
  readonly year = signal<Year>(2024);
  readonly deepZoom = signal(false);
  readonly glowIntensity = signal<GlowIntensity>('medium');
  readonly selectedCityId = signal<string>('bangkok');
  readonly allCities = Object.values(citiesData.regions).flat() as City[];
  readonly regionCities = signal<City[]>(citiesData.regions['Southeast Asia']);
  readonly selectedCity = signal<City>(citiesData.regions['Southeast Asia'][0]);
  readonly citiesDataNote = `Map imagery: NASA GIBS Black Marble composite. ${citiesData.note}`;

  private readonly cityLayer = new GraphicsLayer({ title: 'City radiance locations' });
  private readonly cityLabelsLayer = new GraphicsLayer({ title: 'City labels' });
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
    const dayImagery = new TileLayer({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
      title: 'Esri World Imagery',
      opacity: 0,
    });
    this.nightLights = nightLights;
    this.dayImagery = dayImagery;
    const map = new Map({
      basemap: 'dark-gray-vector',
      layers: [dayImagery, nightLights, this.cityLayer, this.cityLabelsLayer, this.selectedLayer],
    });
    this.view = new MapView({
      container: this.mapNode.nativeElement,
      map,
      center: [108, 11],
      zoom: 4,
      constraints: { minZoom: 2, maxZoom: DEEP_ZOOM_MAX_ZOOM, snapToZoom: false, rotationEnabled: false },
      background: { color: '#05070d' },
      ui: { components: ['attribution'] },
    });
    this.view.when().then(() => {
      if (this.disposed || !this.view) return;
      // The vector dark-gray basemap separates its canvas from the place-label reference layer.
      this.view.map?.basemap?.referenceLayers.removeAll();
      this.swipe = new Swipe({
        view: this.view,
        direction: 'vertical',
        position: 50,
        leadingLayers: [nightLights],
        trailingLayers: [dayImagery],
        dragLabel: 'Swipe to compare night lights and daytime satellite imagery',
      });
      this.view.ui.add(this.swipe, 'manual');
      this.swipe.visible = false;
      this.zoomHandle = this.view.watch('zoom', () => {
        this.updateDeepZoom();
        this.updateCityLabels();
        this.updateCityMarkers();
      });
      this.updateDeepZoom();
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
    void Promise.all([nightLights.load(), dayImagery.load()]).catch((error) => console.warn('Night Lights imagery could not load', error));
  }

  setGlowIntensity(intensity: GlowIntensity): void {
    this.glowIntensity.set(intensity);
    this.updateDeepZoom();
  }

  setRegion(region: RegionName): void {
    this.activeRegion.set(region);
    const cities = region === 'World' ? this.allCities : citiesData.regions[region];
    this.regionCities.set(cities);
    const currentSelection = cities.find((city) => city.id === this.selectedCityId());
    const selectedCity = currentSelection ?? cities.reduce((brightest, city) =>
      this.brightness(city) > this.brightness(brightest) ? city : brightest,
    );
    this.selectCity(selectedCity, false);
    this.updateCityMarkers(true);
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

  cityRank(city: City): number {
    return this.rankedCities().findIndex((candidate) => candidate.id === city.id) + 1;
  }

  changeLabel(city: City): string {
    return `${city.changePercent > 0 ? '+' : ''}${city.changePercent}%`;
  }

  sparklinePath(city: City): string {
    const first = city.radiance2014;
    const last = city.radiance2024;
    const low = Math.min(first, last);
    const high = Math.max(first, last);
    const y = (value: number): number => high === low ? 18 : 28 - ((value - low) / (high - low)) * 20;
    return `M 5 ${y(first).toFixed(1)} L 115 ${y(last).toFixed(1)}`;
  }

  sparklineEndY(city: City): number {
    const first = city.radiance2014;
    const last = city.radiance2024;
    const low = Math.min(first, last);
    const high = Math.max(first, last);
    return high === low ? 18 : 28 - ((last - low) / (high - low)) * 20;
  }

  sparklineLabel(city: City): string {
    return `Radiance from 2014 (${this.formatRadiance(city.radiance2014)}) to 2024 (${this.formatRadiance(city.radiance2024)}) relative units`;
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

  private citiesToLabel(): City[] {
    const labelAllCities = !this.deepZoom() && this.activeRegion() !== 'World' && (this.view?.zoom ?? 0) >= CITY_LABEL_ALL_ZOOM;
    return labelAllCities
      ? this.regionCities()
      : this.regionCities().filter((city) => city.id === this.selectedCityId());
  }

  private updateCityLabels(): void {
    const cities = this.citiesToLabel();
    const labelKey = cities.map((city) => city.id).join('|');
    if (labelKey === this.cityLabelKey) return;
    this.cityLabelKey = labelKey;
    this.cityLabelsLayer.removeAll();
    this.cityLabelsLayer.addMany(cities.map((city) => new Graphic({
      geometry: new Point({ longitude: city.longitude, latitude: city.latitude }),
      symbol: new TextSymbol({
        text: city.name,
        color: '#fff2cf',
        haloColor: '#05070d',
        haloSize: 2.5,
        xoffset: 10,
        yoffset: 12,
        // ArcGIS rasterizes map text from its own font catalog; external page fonts are not registered there.
        font: { family: 'Arial', size: 11, weight: 'bold' },
      }),
    })));
  }

  private updateCityMarkers(force = false): void {
    const zoom = this.view?.zoom ?? 2;
    const worldScale = this.activeRegion() === 'World' && zoom <= 3;
    if (!force && this.worldScaleMarkers === worldScale) return;
    this.worldScaleMarkers = worldScale;
    this.cityLayer.removeAll();
    this.cityLayer.addMany(this.regionCities().map((city) => new Graphic({
      geometry: new Point({ longitude: city.longitude, latitude: city.latitude }),
      attributes: { cityId: city.id },
      symbol: {
        type: 'simple-marker',
        style: 'circle',
        size: worldScale ? 3 : 7,
        color: '#ffc857',
        outline: { color: '#241b0b', width: worldScale ? 0.6 : 1.5 },
      },
    })));
  }

  private updateDeepZoom(): void {
    const zoom = this.view?.zoom ?? 2;
    const isDeep = zoom > BLACK_MARBLE_NATIVE_MAX_ZOOM;
    this.deepZoom.set(isDeep);

    const intensity = {
      low: { opacity: 0.48, blur: 2 },
      medium: { opacity: 0.68, blur: 3 },
      high: { opacity: 0.88, blur: 4 },
    }[this.glowIntensity()];
    const dayFade = isDeep ? Math.min(1, Math.max(0, (zoom - BLACK_MARBLE_NATIVE_MAX_ZOOM) / 1.2)) : 0;
    const scaledBlur = Math.min(18, Math.round(intensity.blur * 2 ** Math.max(0, zoom - BLACK_MARBLE_NATIVE_MAX_ZOOM)));

    if (this.nightLights) {
      this.nightLights.blendMode = isDeep ? 'screen' : 'normal';
      this.nightLights.opacity = isDeep ? intensity.opacity : 0.96;
      this.nightLights.effect = isDeep ? `blur(${scaledBlur}px) brightness(1.3)` : null;
    }
    if (this.dayImagery) this.dayImagery.opacity = dayFade;
    if (this.swipe) this.swipe.visible = isDeep;
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
