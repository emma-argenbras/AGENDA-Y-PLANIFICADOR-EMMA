import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Datos } from './data/datos';
import { Avisos } from './ui/avisos';
import { Actualizador } from './data/actualizador';
import { estadoPrueba } from './core/prueba-luciana';
import { PRUEBAS, pruebaActiva } from './core/pruebas';
import { hoyISO } from './core/fechas';
import { resumen } from './core/pendientes';

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
    { ruta: '/agenda', texto: 'Agenda', icono: 'M4 5h16v15H4zM4 9h16M9 5V3M15 5V3M8 13h3M8 17h6' },
    { ruta: '/pendientes', texto: 'Pendientes', icono: 'M4 6h16M4 12h16M4 18h9M20 17l-3 3-1.6-1.6' },
    { ruta: '/semana', texto: 'Semana', icono: 'M4 19V9M9 19V5M14 19v-7M19 19v-4M3 19h18' },
    { ruta: '/actas', texto: 'Actas', icono: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5' },
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
      const hoy = hoyISO();
      const [cierres, reuniones, pendientes] = await Promise.all([
        this.datos.cierresDePruebas(PRUEBAS.map(p => p.id)),
        this.datos.reuniones(),
        this.datos.pendientes(),
      ]);
      // Una prueba ya decidida no reclama nada: el punto rojo es de las vivas.
      const activa = pruebaActiva(cierres);
      const e = activa ? estadoPrueba(hoy, await this.datos.prueba(activa.id), activa) : null;
      return {
        prueba: Boolean(e && (e.vencidas > 0 || e.revisiones.some(r => r.estado === 'hoy'))),
        actas: reuniones.some(r => !r.acta?.length),
        pendientes: resumen(pendientes, hoy).estancados > 0,
      };
    },
  });

  protected readonly marcas = computed(() =>
    this.pendientes.value() ?? { prueba: false, actas: false, pendientes: false });

  protected marca(ruta: string): boolean {
    const m = this.marcas();
    return (ruta === '/actas' && m.actas) || (ruta === '/pendientes' && m.pendientes);
  }

  /** La prueba vive en el menú ⋯: si tiene algo pendiente, el botón lo avisa. */
  protected readonly marcaMenu = computed(() => this.marcas().prueba);

  protected cerrarMenu(): void { this.menuAbierto.set(false); }
}
