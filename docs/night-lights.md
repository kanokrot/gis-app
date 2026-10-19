# Night Lights Explorer

**Route:** [`/night-lights`](../src/app/app.routes.ts)  
**Page implementation:** [`src/app/pages/night-lights-page/night-lights-page.ts`](../src/app/pages/night-lights-page/night-lights-page.ts)

The map displays NASA GIBS VIIRS Black Marble imagery and bundled city markers for Southeast Asia, East Asia, Europe, and a global set. Select a region, city, and summary year to update the local city ranking and profile. At closer scales, a swipe control compares the night imagery with Esri daytime satellite imagery.

## Flow

```mermaid
flowchart TD
    Open[Open /night-lights] --> Map[Create map with NASA night imagery and city layers]
    Map --> Load[Load imagery and bundled city summaries]
    Load --> Ready[Show region, city markers, ranking, and selected city]
    Load -->|Imagery load failure| Retry[Show tile error and retry action]
    Ready --> Region[Choose region]
    Region --> Cities[Update city set and select a city]
    Ready --> Year[Choose 2014 or 2024]
    Year --> Summary[Update local city ranking and profile values]
    Ready --> City[Select a city marker or list item]
    City --> Profile[Update selected city profile and map focus]
    Ready --> Zoom[Zoom the map]
    Zoom --> Deep{Zoom above native imagery level?}
    Deep -->|Yes| Compare[Enable glow styling, day imagery, and swipe]
    Deep -->|No| Overview[Show standard night imagery view]
```

The 2014 and 2024 radiance values, percentage changes, and lit-area values in [`cities.json`](../src/assets/night-lights/cities.json) are illustrative placeholders for interface development. They are not measured VIIRS zonal statistics. The year selector changes these local summaries; it does not change the date of the NASA imagery.

## Data sources and limitations

- Night imagery: [NASA GIBS WMTS](https://gibs.earthdata.nasa.gov/wmts/epsg3857/best), layer `VIIRS_Black_Marble`.
- Daytime imagery for the swipe comparison: [Esri World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer).
- City locations and illustrative summary values: [`src/assets/night-lights/cities.json`](../src/assets/night-lights/cities.json).

Both imagery layers require an internet connection. Do not use the placeholder city values as scientific or measured satellite results.
