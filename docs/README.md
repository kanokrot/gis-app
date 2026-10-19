# Project guides

This folder documents the data flow, map layers, interactions, and known limits of the interactive GIS projects in this Angular application. The guides describe the implementation currently in the repository; they are not independent data sources.

## Guides

- [HouseBuy GIS demo](housebuy-gis.md) — ArcGIS layer setup and the NYC taxi-fare map.
- [Southern Thailand Flood Explorer](flood-explorer.md) — historical flood recurrence queries and coverage handling.
- [Agriculture by province](agriculture-explorer.md) — province metrics, choropleths, and dot density.
- [Bangkok Transit Access Explorer](bangkok-transit-access.md) — district access summaries, rail overlays, and fare-routing data.
- [Night Lights Explorer](night-lights.md) — NASA night imagery, regional city summaries, and the imagery comparison view.

## Shared application setup

The site is an Angular application. The main route table is [`src/app/app.routes.ts`](../src/app/app.routes.ts); the interactive map pages are lazy-loaded standalone pages. Package versions and the standard setup commands are in the [root README](../README.md).

For local development, install the dependencies and start the Angular development server with `npm install` and `npm start`. `npm run build` creates the production build. The build's `prebuild` hook also runs the article-fetch script, so builds can refresh article data.

## Data and interpretation

Several pages use remote ArcGIS services or source datasets whose fields, reference years, completeness, or redistribution terms are limited. Each guide calls out the relevant caveats. A map visualization is not automatically a ground-truth location, a live hazard warning, or a controlled statistical comparison.
