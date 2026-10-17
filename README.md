# GIS App

A personal portfolio website built with Angular. Its **HouseBuy** page appears in Projects as **Project: Real Estate**. HouseBuy is an experimental ArcGIS mapping demo; it is not a real estate buying or selling service, and it does not provide live property listings.

## Features

### Portfolio website

- Home page with profile content, articles, and portfolio navigation.
- About, Articles, Projects, Speaking, and Uses pages.
- HouseBuy GIS demo linked from the Projects page.

### HouseBuy GIS demo

- Rotatable 2D map with compass and north reset, metric scale bar, live coordinate readout, home view, and dark/satellite basemap toggle.
- Graphics layer demo with point, line, and polygon graphics, plus a clear action.
- Neon-styled Thailand Transportation vector-tile network.
- OSM points of interest with halo labels at close scales and a heatmap at wider scales.
- Bangkok boundary query and outline from a province feature service.
- New York City taxi fare analysis from a CSV layer: geohash-based fare ramp, fare-colored points, aggregated map bins, histogram, passenger and fare filters, summary metrics, and an inspector for selected places, rides, and bins.

## Tech stack

Versions below are the ranges declared in `package.json`.

| Technology | Version |
| --- | --- |
| Angular | `^21.0.0` (CLI/build `^21.0.5`) |
| ArcGIS Maps SDK for JavaScript | `@arcgis/core ^4.34.8`; map components package `^4.34.9` |
| PrimeNG | `^21.0.2` |
| Tailwind CSS | `^4.1.18` |
| RxJS | `~7.8.0` |
| TypeScript | `~5.9.2` |
| Vitest | `^4.0.8` |
| npm package manager | `11.7.0` |

## Getting started

Use Node.js and npm compatible with the installed Angular toolchain, then run:

```bash
npm install
npm start
```

The development server is provided by Angular CLI. The other package scripts are:

```bash
npm run watch  # Development build in watch mode
npm run build  # Production build
npm test       # Run the configured test command
```

## Routes

Routes are lazy-loaded in `src/app/app.routes.ts`.

| Path | Page |
| --- | --- |
| `/` | Home |
| `/about` | About |
| `/article` | Article |
| `/project` | Projects |
| `/speaking` | Speaking |
| `/uses` | Uses |
| `/demo-gis` | HouseBuy GIS demo |
| Any unmatched path | Not Found |

## Application flow

### Website navigation

```mermaid
flowchart TD
    Browser[Browser] --> Routes[Angular routes]
    Routes --> Home[Home page]
    Routes --> About[About page]
    Routes --> Article[Article page]
    Routes --> Projects[Projects page]
    Routes --> Speaking[Speaking page]
    Routes --> Uses[Uses page]
    Routes --> GIS[HouseBuy demo]
    Projects -->|Project: Real Estate link| GIS
    Routes -. unmatched URL .-> Fallback
```

### HouseBuy startup and layer requests

`ngAfterViewInit()` creates the map and view first. Basemap loading, POI loading, layer-view creation, and vector-tile style loading are then started independently; there is no serial wait for every layer before the map is usable.

```mermaid
flowchart TD
    Init[ngAfterViewInit] --> Map[Create Map with dark-gray-vector]
    Map --> Layers[Add operational layers in configured order]
    Layers --> View[Create MapView at Bangkok center, zoom 14]
    View --> Widgets[Create scale bar, coordinate pointer handler, click handler]
    View --> Watches[Watch scale, zoom, and rotation]
    Watches --> TaxiScale[Apply initial taxi scale mode]
    View --> BaseLoad[Load active basemap asynchronously]
    BaseLoad --> BaseReady[Wait for MapView, extend basemap zoom levels, apply reference opacity]
    View --> POILoad[Load OSM POI layer asynchronously]
    POILoad --> POIStyle[Log service metadata, apply app POI labels]
    View --> TaxiView[Create taxi layer view asynchronously]
    TaxiView --> TaxiReady[Apply taxi filter and current scale mode]
    View --> TransportView[Create transport layer view asynchronously]
    View --> TransportLoad[Load transport vector-tile style asynchronously]
    TransportLoad --> TransportStyle[Extend zoom range and apply neon styling]
    TaxiReady -->|When taxi is enabled| Analysis[Schedule taxi analysis]
```

The map's operational layer order is heatmap, POI, taxi CSV, transport vector tiles, taxi macro graphics, Bangkok boundary graphics, demo graphics, and taxi selection graphics. Later graphics layers are available for drawing selections and overlays. POI and heatmap use the same OSM service but are separate layers.

### Map interactions and scale-dependent content

```mermaid
flowchart TD
    User[User map interaction] --> Navigate[Pan or zoom the MapView]
    User --> Rotate[Rotate with map gestures or rotation buttons]
    Rotate --> Compass[Compass reflects rotation; click resets north]
    Navigate --> Scale[Scale watcher updates map zoom and taxi display mode]
    User --> Pointer[Move pointer]
    Pointer --> Coordinates[Convert map point to geographic coordinates]
    User --> Home[Home button]
    Home --> BangkokHome[Go to Bangkok center, zoom 14, rotation 0]
    User --> BaseToggle[Toggle basemap]
    BaseToggle --> BaseLoaded[Load selected basemap]
    BaseLoaded --> RefreshBase[Reapply reference opacity and transport styling]
    User --> POIToggle[Toggle Points of interest]
    POIToggle --> POIAndHeat[Toggle POI and heatmap layers together]
    Scale --> CloseScale{Map scale <= 1:20,000?}
    CloseScale -->|Yes| ClosePOI[POI markers and labels are in scale range]
    CloseScale -->|Yes| HeatOff[Heatmap is outside its maxScale range]
    CloseScale -->|No| HeatOn[Heatmap is in scale range]
    CloseScale -->|No| POIOff[POI layer is outside its minScale range]
    User --> BangkokQuery[Choose Bangkok]
    BangkokQuery --> Query[Query province service for NAME1 = กรุงเทพมหานคร]
    Query --> Outline[Draw boundary graphic and zoom to its geometry]
    User --> DemoGraphics[Choose Draw demo or Clear]
    DemoGraphics --> Draw[Add sample point, line, and polygon]
    DemoGraphics --> Clear[Remove demo graphics]
    User --> ClickMap[Click a place or taxi feature]
    ClickMap --> HitTest[Hit test taxi, macro, and POI layers]
    HitTest --> Inspector[Show selected place, ride, or bin in inspector]
```

The POI switch enables both OSM layers. Their scale limits determine which renderer is in range: POI has `minScale: 20000`, while heatmap has `maxScale: 20000`. Taxi display modes are macro beyond scale 1:1,000,000, city bins between 1:1,000,000 and 1:40,000, and individual points at scale 1:40,000 or closer. City bins use fixed geohash level 6 and show ride-count labels from 10 rides upward.

### Taxi fare analysis

```mermaid
flowchart TD
    Enable[Enable Taxi fares] --> NYC[Move map to New York City and open Analysis]
    NYC --> CSV[Load/query taxi-fares.csv]
    CSV --> Validate[Filter valid NYC pickup coordinates]
    Validate --> Geohash[Group valid pickups by geohash level 6]
    Geohash --> Ramp[Derive fare color stops from grouped rides]
    Ramp --> Render[Render fare-colored points or aggregate map bins by scale]
    CSV --> Stats[Query current filters and map extent]
    Controls[Change fare range or passenger count] --> Filter[Apply FeatureFilter and schedule refresh]
    Filter --> Stats
    Stats --> Aggregate[Aggregate counts and average fares; calculate summary statistics]
    Aggregate --> Histogram[Build 12-bin fare histogram with percentile tails]
    Histogram --> Panel[Update metrics, fare scale, and histogram]
    Aggregate --> Macro[Update macro centroid/count marker at wide scales]
    Render --> Click[Click a taxi point or bin]
    Click --> Inspector[Show ride details or bin count and average fare]
```

The initial fare ramp uses geohash groups for eligible NYC rides; the map's city-scale aggregation is ArcGIS feature reduction with fixed bin level 6. Fare and passenger filters update the feature-layer filter and trigger refreshed queries. Summary metrics are scoped to the current map extent; the histogram covers the filtered dataset and uses 12 central bins between P1 and P95 plus tails.

## Data sources

HouseBuy requests these remote sources, so an internet connection is required:

- [Thailand_Transportation vector tile service](https://tiles.arcgis.com/tiles/jSaRWj2TDlcN1zOC/arcgis/rest/services/Thailand_Transportation/VectorTileServer) — transport network.
- [OSM_AS_POIs feature service](https://services-ap1.arcgis.com/iA7fZQOnjY9D67Zx/ArcGIS/rest/services/OSM_AS_POIs/FeatureServer/0) — points of interest and heatmap.
- [Thailand_Province_Boundaries_view feature service](https://services1.arcgis.com/jSaRWj2TDlcN1zOC/ArcGIS/rest/services/Thailand_Province_Boundaries_view/FeatureServer/1) — Bangkok boundary query.
- [jeffprosise/Machine-Learning taxi-fares.csv](https://github.com/jeffprosise/Machine-Learning/blob/master/Data/taxi-fares.csv) — New York City pickup coordinates and fare attributes.

## Known limitations

- HouseBuy is an ArcGIS experiment, not a real estate marketplace or transaction system.
- The latest production build reported an initial bundle of **878.60 kB**, above the configured **500 kB** budget.
- Diagnostic `console` logging remains in `src/app/pages/demo-gis-page/demo-gis-page.ts`.
