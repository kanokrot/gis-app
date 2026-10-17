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
    id: 'portfolio',
    title: 'This portfolio',
    description: 'The site you’re on: Angular, Tailwind and PrimeNG, with write-ups synced from Medium by RSS.',
    tags: ['Angular', 'Tailwind', 'PrimeNG', 'RSS'],
    sourceUrl: undefined,
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
