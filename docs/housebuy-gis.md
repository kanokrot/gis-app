# HouseBuy GIS demo

**Route:** [`/demo-gis`](../src/app/app.routes.ts)  
**Page implementation:** [`src/app/pages/demo-gis-page/`](../src/app/pages/demo-gis-page/demo-gis-page.ts)

HouseBuy is the portfolio's experimental ArcGIS mapping demo. It does not provide property listings or real-estate purchasing services.

## Map setup and layers

The page creates a 2D `MapView` over Bangkok with dark vector and satellite basemap choices. It includes navigation, rotation and north reset, scale, coordinates, and a home view. The operational layers combine a Thailand transport vector-tile service, Bangkok/province boundaries, OSM points of interest, taxi data, and graphics used for demos and selections.

The POI markers and heatmap come from the same OSM feature service but use separate layers and scale ranges. The POI layer appears at close scales (minimum scale denominator 20,000); the heatmap is used farther out. The service and transport styling load asynchronously, so the map can become interactive before every optional layer is ready.

## Taxi fare map

The taxi analysis reads a remote NYC taxi CSV and keeps pickup coordinates in the configured New York City bounds (latitude 40.4–41.0, longitude -74.3–-73.6). Fare and passenger filters apply to the layer and refresh the summary, histogram, and display.

The map changes representation with scale: a macro view at wide scales, geohash-based city bins from approximately 1:1,000,000 to 1:40,000, and individual taxi records at closer scales. Fare color stops are derived from eligible rides grouped at geohash level 6. City bins use the same fixed geohash level and label groups with at least 10 rides. The histogram uses 12 central bins between the 1st and 95th percentiles, with tail bins.

These are visual summaries of the loaded CSV and active filters. They do not establish that fares are representative of current taxi prices or all trips in New York.

## Interactions

- Toggle basemap, POI/heatmap, and taxi fare layers.
- Pan, zoom, rotate, reset north, and return to the Bangkok home view.
- Choose Bangkok to query the province service and draw its outline.
- Draw or clear sample graphics.
- Enable taxi analysis to move the map to NYC; inspect a taxi record or aggregated bin and change fare/passenger filters.

## Key implementation files

- [`demo-gis-page.ts`](../src/app/pages/demo-gis-page/demo-gis-page.ts) — map, services, layers, watchers, and taxi analysis.
- [`demo-gis-page.html`](../src/app/pages/demo-gis-page/demo-gis-page.html) — page controls and display structure.
- [`demo-gis-page.css`](../src/app/pages/demo-gis-page/demo-gis-page.css) and [`demo-gis-overrides.css`](../src/app/pages/demo-gis-page/demo-gis-overrides.css) — page styling.
