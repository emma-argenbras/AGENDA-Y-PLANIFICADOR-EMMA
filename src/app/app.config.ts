import {
  ApplicationConfig, inject, provideAppInitializer,
  provideBrowserGlobalErrorListeners, isDevMode,
} from '@angular/core';
import { provideRouter, withHashLocation, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { Datos } from './data/datos';
import { Tema } from './ui/tema';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Rutas con # : GitHub Pages sirve estáticos, y así un enlace profundo
    // recargado nunca da 404 antes de que el service worker esté instalado.
    provideRouter(routes, withHashLocation(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideAppInitializer(async () => {
      const datos = inject(Datos);
      const tema = inject(Tema);
      const ajustes = await datos.ajustes();
      tema.preferencia.set(ajustes.tema);
      await datos.marcarPrimerUso();
    }),
  ],
};
