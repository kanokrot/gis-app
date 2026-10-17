import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';

import { routes } from './app.routes';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { ThemeService } from './shared/services/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withFetch()),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark'
        }
      }
    })
  ]
};
