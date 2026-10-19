import { Component } from '@angular/core';
import { SegmentedNavComponent } from '../../shared/components/segmented-nav-component/segmented-nav-component';
import { RouterModule } from '@angular/router';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle-component/theme-toggle-component';
import { HomeMarkComponent } from '../../shared/components/home-mark-component/home-mark-component';
import { FooterComponent } from '../home-page/components/footer-component/footer-component';

interface ProjectItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  image?: string;
  highlights?: string[];
  demoRoute?: string;
  sourceUrl?: string;
}

const projectItems: ProjectItem[] = [
  {
    id: 'housebuy',
    title: 'HouseBuy GIS demo',
    description: 'An ArcGIS experiment, not a real estate service: a rotatable map of Thailand’s transport network, OSM places and NYC taxi fares.',
    tags: ['Angular', 'ArcGIS', 'PrimeNG', 'Tailwind'],
    highlights: [
      'Rotatable 2D map with compass, scale bar and coordinate readout',
      'Taxi fare analysis with geohash bins, histogram and filters',
      'OSM places with readable labels and a heatmap when zoomed out',
    ],
    demoRoute: '/demo-gis',
    sourceUrl: undefined,
  },
  {
    id: 'flood-explorer',
    title: 'Southern Thailand Flood Explorer',
    description: 'Historical flood-prone areas from GISTDA for 12 southern provinces, colored by how many times each area flooded between 2011 and 2020. Click the map to check a location. Not a live flood map.',
    tags: ['Angular', 'ArcGIS', 'GISTDA', 'Tailwind'],
    demoRoute: '/flood',
    sourceUrl: undefined,
  },
  {
    id: 'agriculture-explorer',
    title: 'Rice, sugarcane & machinery use by province',
    description: 'A provincial map comparing wet-season rice area, forecast sugarcane planted area and reported machinery use, with hover details, rankings and dot-density mode.',
    tags: ['Angular', 'ArcGIS', 'OAE', 'NSO', 'Tailwind'],
    demoRoute: '/agriculture',
  },
  {
    id: 'transit-access-explorer',
    title: 'Bangkok Transit Access Explorer',
    description: 'A district-level comparison of population summaries for 400 m public transport areas, 500 m bus-stop areas and 1,000 m public transport areas.',
    tags: ['Angular', 'ArcGIS', 'Bangkok', 'Open Data'],
    demoRoute: '/transit-access',
  },
];

@Component({
  selector: 'app-project-page',
  imports: [SegmentedNavComponent, RouterModule, ThemeToggleComponent, HomeMarkComponent, FooterComponent],
  templateUrl: './project-page.html',
  styleUrl: './project-page.css',
})
export class ProjectPage {
  readonly projects = projectItems;
}
