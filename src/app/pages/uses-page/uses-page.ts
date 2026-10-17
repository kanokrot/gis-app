import { Component } from '@angular/core';
import { SegmentedNavComponent } from '../../shared/components/segmented-nav-component/segmented-nav-component';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle-component/theme-toggle-component';
import { HomeMarkComponent } from '../../shared/components/home-mark-component/home-mark-component';
import { FooterComponent } from '../home-page/components/footer-component/footer-component';
import packageData from '../../../../package.json';

interface UsesTool {
  name: string;
  description: string;
  version: string;
}

interface UsesCategory {
  name: string;
  tools: UsesTool[];
}

const displayVersion = (version: string): string => {
  const [major, minor] = version.replace(/^[^\d]*/, '').split('.');
  return minor && minor !== '0' ? `${major}.${minor}` : major;
};

@Component({
  selector: 'app-uses-page',
  imports: [SegmentedNavComponent, ThemeToggleComponent, HomeMarkComponent, FooterComponent],
  templateUrl: './uses-page.html',
  styleUrl: './uses-page.css',
})
export class UsesPage {
  readonly primaryDependencies = [
    { name: '@angular/core', version: packageData.dependencies['@angular/core'] },
    { name: '@arcgis/core', version: packageData.dependencies['@arcgis/core'] },
    { name: 'primeng', version: packageData.dependencies.primeng },
    { name: 'tailwindcss', version: packageData.dependencies.tailwindcss },
    { name: 'typescript', version: packageData.devDependencies.typescript },
    { name: 'rxjs', version: packageData.dependencies.rxjs },
    { name: 'vitest', version: packageData.devDependencies.vitest },
  ];

  readonly categories: UsesCategory[] = [
    {
      name: 'web',
      tools: [
        { name: 'Angular', description: 'UI framework', version: displayVersion(packageData.dependencies['@angular/core']) },
        { name: 'TypeScript', description: 'Language', version: displayVersion(packageData.devDependencies.typescript) },
        { name: 'Tailwind CSS', description: 'Styling', version: displayVersion(packageData.dependencies.tailwindcss) },
        { name: 'PrimeNG', description: 'UI components', version: displayVersion(packageData.dependencies.primeng) },
        { name: 'RxJS', description: 'Reactive state', version: displayVersion(packageData.dependencies.rxjs) },
      ],
    },
    {
      name: 'mapping',
      tools: [
        { name: 'ArcGIS Maps SDK for JavaScript', description: 'Maps, layers and views', version: displayVersion(packageData.dependencies['@arcgis/core']) },
        { name: 'ArcGIS Online', description: 'Hosted vector tiles and feature layers', version: 'service' },
        { name: 'OpenStreetMap data', description: 'POIs through an ArcGIS feature service', version: 'data' },
      ],
    },
    {
      name: 'testing & tooling',
      tools: [
        { name: 'Vitest', description: 'Unit tests', version: displayVersion(packageData.devDependencies.vitest) },
        { name: 'Angular CLI', description: 'Dev server and builds', version: displayVersion(packageData.devDependencies['@angular/cli']) },
        { name: 'npm', description: 'Package manager', version: displayVersion(packageData.packageManager.split('@').at(-1)!) },
        { name: 'Git', description: 'Version control', version: '—' },
        { name: 'Windows', description: 'Operating system', version: 'OS' },
      ],
    },
    {
      name: 'writing',
      tools: [
        { name: 'Medium', description: 'Write-ups, synced here by RSS', version: 'blog' },
      ],
    },
  ];
}
