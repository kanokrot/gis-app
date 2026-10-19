import { Routes } from '@angular/router';

export const routes: Routes = [    {
        path: '',
        loadComponent: () => import('./pages/home-page/home-page').then(m => m.HomePage)
    },
    {
        path: 'about',
        loadComponent: () => import('./pages/about-page/about-page').then(m => m.AboutPage)
    },
    {
        path: 'article',
        loadComponent: () => import('./pages/article-page/article-page').then(m => m.ArticlePage)
    },
    {
        path: 'project',
        loadComponent: () => import('./pages/project-page/project-page').then(m => m.ProjectPage)
    },
    {
        path: 'uses',
        loadComponent: () => import('./pages/uses-page/uses-page').then(m => m.UsesPage)
    },
        {
        path: 'demo-gis',
        loadComponent: () => import('./pages/demo-gis-page/demo-gis-page').then(m => m.DemoGisPage)
    },
    {
        path: 'flood',
        loadComponent: () => import('./pages/flood-page/flood-page').then(m => m.FloodPage)
    },
    {
        path: 'agriculture',
        loadComponent: () => import('./pages/agriculture-page/agriculture-page').then(m => m.AgriculturePage)
    },
    {
        path: 'transit-access',
        loadComponent: () => import('./pages/transit-access-page/transit-access-page').then(m => m.TransitAccessPage)
    },
    {
        path: 'night-lights',
        loadComponent: () => import('./pages/night-lights-page/night-lights-page').then(m => m.NightLightsPage)
    },
    {
        path: '**',
        loadComponent: () => import('./pages/not-found-page/not-found-page').then(m => m.NotFoundPage)
    },
];
