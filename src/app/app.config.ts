import {
  ApplicationConfig, inject, provideAppInitializer,
  provideBrowserGlobalErrorListeners, isDevMode,
} from '@angular/core';
import { provideRouter, withHashLocation, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { Datos } from './data/datos';
import { Calendario } from './data/calendario';
import { Drive } from './data/drive';
import { inicioSemana, hoyISO, sumarDias } from './core/fechas';
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
      // Todo lo que se inyecta va junto y antes del primer await: después de
      // un await ya no hay contexto de inyección y Angular tira NG0203.
      const datos = inject(Datos);
      const tema = inject(Tema);
      const drive = inject(Drive);
      const calendario = inject(Calendario);
      // Si volvemos de la pantalla de permisos de Google, el token viene en la
      // dirección: hay que levantarlo y limpiarla antes de que el router mire.
      await drive.recibirDeGoogle().catch(() => false);

      const ajustes = await datos.ajustes();
      tema.preferencia.set(ajustes.tema);
      await datos.marcarPrimerUso();
      // Sin esperar: que el arranque no dependa de Google.
      const lunes = inicioSemana(hoyISO());
      setTimeout(() => void calendario.importarSiCorresponde(lunes, sumarDias(lunes, 6)), 3000);
    }),
  ],
};
