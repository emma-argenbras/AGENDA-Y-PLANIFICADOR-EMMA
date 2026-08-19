import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Datos } from './data/datos';
import { Avisos } from './ui/avisos';
import { Actualizador } from './data/actualizador';
import { estadoPrueba } from './core/prueba-luciana';
import { hoyISO } from './core/fechas';

interface Tab { ruta: string; texto: string; icono: string; }

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly datos = inject(Datos);
  private readonly router = inject(Router);
  protected readonly avisos = inject(Avisos);
  protected readonly actualizador = inject(Actualizador);

  protected readonly tabs: Tab[] = [
    { ruta: '/hoy', texto: 'Hoy', icono: 'M12 3v18M3 12h18' },
    { ruta: '/semana', texto: 'Semana', icono: 'M3 6h18M3 12h18M3 18h12' },
    { ruta: '/prueba', texto: 'Prueba', icono: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18' },
    { ruta: '/actas', texto: 'Actas', icono: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5' },
    { ruta: '/docs', texto: 'Docs', icono: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5 21 21' },
  ];

  protected readonly menuAbierto = signal(false);

  protected readonly titulo = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.routerState.snapshot.root.firstChild?.title ?? 'Hoy'),
    ),
    { initialValue: 'Hoy' },
  );

  /** Puntitos de pendiente en los tabs. */
  private readonly pendientes = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: async () => {
      const [prueba, reuniones] = await Promise.all([this.datos.prueba(), this.datos.reuniones()]);
      const e = estadoPrueba(hoyISO(), prueba);
      return {
        prueba: e.vencidas > 0 || e.revisiones.some(r => r.estado === 'hoy'),
        actas: reuniones.some(r => !r.acta?.length),
      };
    },
  });

  protected readonly marcas = computed(() => this.pendientes.value() ?? { prueba: false, actas: false });

  protected marca(ruta: string): boolean {
    const m = this.marcas();
    return (ruta === '/prueba' && m.prueba) || (ruta === '/actas' && m.actas);
  }

  protected cerrarMenu(): void { this.menuAbierto.set(false); }
}
