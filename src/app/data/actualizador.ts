/**
 * actualizador.ts — Control manual de versiones.
 *
 * La app se actualiza sola, pero "sola" quiere decir la próxima vez que la
 * abras del todo, y eso con una PWA instalada puede tardar. Por eso hay un
 * botón para forzarlo cuando querés, y un aviso cuando hay algo nuevo.
 */

import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

export type EstadoActualizacion =
  | 'inactivo' | 'buscando' | 'al-dia' | 'hay-nueva' | 'sin-service-worker' | 'error';

@Injectable({ providedIn: 'root' })
export class Actualizador {
  private readonly sw = inject(SwUpdate);

  readonly estado = signal<EstadoActualizacion>('inactivo');
  readonly detalle = signal('');
  readonly publicada = signal<Date | null>(null);

  constructor() {
    if (!this.sw.isEnabled) {
      this.estado.set('sin-service-worker');
      return;
    }
    // Si el service worker descarga una versión nueva por su cuenta, avisamos.
    this.sw.versionUpdates.subscribe(ev => {
      if (ev.type === 'VERSION_READY') {
        this.estado.set('hay-nueva');
        this.detalle.set('Hay una versión nueva lista para instalar.');
      }
      if (ev.type === 'VERSION_INSTALLATION_FAILED') {
        this.estado.set('error');
        this.detalle.set('La descarga de la versión nueva falló. Probá de nuevo con señal.');
      }
    });
    void this.leerFecha();
    this.#revisarSolo();
  }

  #ultimaRevision = 0;

  /**
   * El service worker solo mira si hay algo nuevo cuando cargás la página, y
   * una app instalada puede quedarse días sin cargar de cero. Entonces
   * revisamos también cada media hora y cada vez que volvés a la app.
   */
  #revisarSolo(): void {
    const revisar = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - this.#ultimaRevision < 10 * 60 * 1000) return;
      this.#ultimaRevision = Date.now();
      try { await this.sw.checkForUpdate(); } catch { /* sin señal */ }
      void this.leerFecha();
    };
    setInterval(() => void revisar(), 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => void revisar());
    setTimeout(() => void revisar(), 5000);
  }

  /** Fecha de compilación de lo que hay publicado en el servidor. */
  private async leerFecha(): Promise<void> {
    try {
      const r = await fetch('ngsw.json?v=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json() as { timestamp?: number };
      if (j.timestamp) this.publicada.set(new Date(j.timestamp));
    } catch { /* sin señal: no pasa nada */ }
  }

  async buscar(): Promise<void> {
    if (!this.sw.isEnabled) {
      this.estado.set('sin-service-worker');
      this.detalle.set('Estás abriendo la app desde el navegador sin instalar, o en modo desarrollo.');
      return;
    }
    this.estado.set('buscando');
    this.detalle.set('');
    this.#ultimaRevision = Date.now();
    try {
      const hay = await this.sw.checkForUpdate();
      await this.leerFecha();
      if (hay) {
        this.estado.set('hay-nueva');
        this.detalle.set('Hay una versión nueva lista para instalar.');
      } else {
        this.estado.set('al-dia');
        this.detalle.set('Ya tenés la última versión.');
      }
    } catch (e) {
      this.estado.set('error');
      this.detalle.set(e instanceof Error ? e.message : 'No se pudo consultar. ¿Estás sin señal?');
    }
  }

  /** Activa la versión descargada y recarga. */
  async aplicar(): Promise<void> {
    try { await this.sw.activateUpdate(); } catch { /* igual recargamos */ }
    location.reload();
  }

  /**
   * El botón de último recurso: borra el service worker y todo lo cacheado, y
   * vuelve a bajar la app entera. No toca tus datos — los cierres, prioridades
   * y actas quedan donde están.
   */
  async reinstalar(): Promise<void> {
    this.estado.set('buscando');
    this.detalle.set('Bajando la app de nuevo…');
    try {
      // Solo lo de esta app. En GitHub Pages todos los proyectos comparten
      // dirección, así que barrer todo se llevaría puesto lo de al lado.
      const base = document.baseURI;
      const ruta = new URL(base).pathname;

      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      for (const r of regs) {
        if (base.startsWith(r.scope)) await r.unregister();
      }

      if ('caches' in window) {
        for (const k of await caches.keys()) {
          if (k.includes(ruta) || (ruta === '/' && k.startsWith('ngsw'))) await caches.delete(k);
        }
      }
    } catch { /* seguimos igual: la recarga hace el resto */ }
    location.reload();
  }
}
