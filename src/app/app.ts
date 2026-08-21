import { Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Datos } from './data/datos';
import { Avisos } from './ui/avisos';
import { Actualizador } from './data/actualizador';
import { estadoPrueba } from './core/prueba-luciana';
import { pruebaActiva } from './core/pruebas';
import { Configuracion } from './data/configuracion';
import { fechaCorta, hoyISO } from './core/fechas';
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
  private readonly cfg = inject(Configuracion);

  /**
   * Hay proyecto en la nube pero esta sesión está trabajando contra el aparato.
   * Sin decirlo, la app se ve igual que siempre y simplemente le faltan cosas:
   * la explicación más razonable desde afuera es que se perdieron.
   */
  protected readonly soloEsteAparato = computed(() =>
    this.datos.firebase.hayConfig() && this.datos.decidido() && this.datos.modo() === 'local');

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
      const pruebas = this.cfg.reglas().pruebas;
      const [cierres, reuniones, pendientes, inicio] = await Promise.all([
        this.datos.cierresDePruebas(pruebas.map(p => p.id)),
        this.datos.reuniones(),
        this.datos.pendientes(),
        this.datos.desdeCuando(),
      ]);
      // Una prueba ya decidida no reclama nada: el punto rojo es de las vivas.
      const activa = pruebaActiva(cierres, pruebas);
      const e = activa ? estadoPrueba(hoy, await this.datos.prueba(activa.id), activa, inicio) : null;
      return {
        activa,
        prueba: Boolean(e && (e.vencidas > 0 || e.revisiones.some(r => r.estado === 'hoy'))),
        actas: reuniones.some(r => !r.acta?.length),
        pendientes: resumen(pendientes, hoy, inicio).estancados > 0,
      };
    },
  });

  protected readonly marcas = computed(() =>
    this.pendientes.value() ?? { activa: null, prueba: false, actas: false, pendientes: false });

  /** El menú nombra a quien esté a prueba hoy, no a quien lo estaba cuando se escribió. */
  protected readonly pruebaMenu = computed(() => {
    const a = this.marcas().activa;
    if (!a) return { titulo: 'Pruebas de rol', detalle: 'Nadie a prueba ahora mismo' };
    return {
      titulo: `Prueba de ${a.persona.split(' ')[0]}`,
      detalle: `Revisiones de viernes y decisión del ${fechaCorta(a.decision)}`,
    };
  });

  protected marca(ruta: string): boolean {
    const m = this.marcas();
    return (ruta === '/actas' && m.actas) || (ruta === '/pendientes' && m.pendientes);
  }

  /** La prueba vive en el menú ⋯: si tiene algo pendiente, el botón lo avisa. */
  protected readonly marcaMenu = computed(() => this.marcas().prueba);

  protected cerrarMenu(): void { this.menuAbierto.set(false); }
}
