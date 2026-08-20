/**
 * configuracion.ts — La configuración vigente, como señales.
 *
 * Dos caminos hacia el mismo dato, a propósito:
 *  - Las vistas leen `reglas()`, que es una señal: si cambiás el dueño de una
 *    fila, la pantalla se actualiza sola, sin recargar la app.
 *  - Las funciones puras (el clasificador) leen `vigentes()` de core/config.ts,
 *    que este servicio deja sincronizado. Así no hay que pasarles las tablas
 *    por parámetro desde cien lugares.
 *
 * Guardar cualquier sección incrementa el contador de cambios de Datos, que es
 * de lo que cuelgan los `resource()` de las pantallas.
 */

import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Datos } from './datos';
import { hoyISO } from '../core/fechas';
import {
  CONFIG_VACIA, fijarVigentes, normalizarConfig, resolver,
  type ConfigApp, type SeccionConfig,
} from '../core/config';

@Injectable({ providedIn: 'root' })
export class Configuracion {
  private readonly datos = inject(Datos);

  readonly config = signal<ConfigApp>(CONFIG_VACIA);
  readonly cargada = signal(false);

  /** Todo lo que la app usa para decidir, ya resuelto contra los valores de fábrica. */
  readonly reglas = computed(() => resolver(this.config()));

  /** Qué secciones tocaste vos, para poder decirlo en pantalla. */
  readonly editadas = computed(() => this.config().editado);

  readonly hayCambios = computed(() => Object.keys(this.config().editado).length > 0);

  /** Desde qué repositorio se leyó lo que hay cargado ahora mismo. */
  #modoLeido: 'local' | 'nube' | null = null;

  constructor() {
    // Las funciones puras y las señales miran siempre lo mismo.
    effect(() => { fijarVigentes(this.config()); });

    // Al entrar con la cuenta de Google los datos pasan a la nube, y las
    // reglas viven ahí igual que todo lo demás: sin esto, el teléfono seguiría
    // decidiendo con la copia local aunque en la nube el dueño de una tarea
    // sea otro.
    effect(() => {
      const modo = this.datos.modo();
      if (modo === this.#modoLeido) return;
      this.#modoLeido = modo;
      void this.cargar();
    });
  }

  /** Se llama una vez al arrancar, antes de que ninguna pantalla clasifique nada. */
  async cargar(): Promise<ConfigApp> {
    this.#modoLeido = this.datos.modo();
    const cfg = normalizarConfig(await this.datos.config());
    fijarVigentes(cfg);
    this.config.set(cfg);
    this.cargada.set(true);
    return cfg;
  }

  /** Guarda una sección entera. `null` no se usa acá: para eso está restaurar(). */
  async guardar<S extends SeccionConfig>(seccion: S, valor: NonNullable<ConfigApp[S]>): Promise<void> {
    const cfg: ConfigApp = {
      ...this.config(),
      [seccion]: valor,
      editado: { ...this.config().editado, [seccion]: hoyISO() },
    };
    await this.#persistir(cfg);
  }

  /** Vuelve una sección al valor de fábrica que trae el código. */
  async restaurar(seccion: SeccionConfig): Promise<void> {
    const editado = { ...this.config().editado };
    delete editado[seccion];
    await this.#persistir({ ...this.config(), [seccion]: null, editado });
  }

  /** Todo al original. Los datos del día a día no se tocan: esto son las reglas. */
  async restaurarTodo(): Promise<void> {
    await this.#persistir({ ...CONFIG_VACIA });
  }

  async #persistir(cfg: ConfigApp): Promise<void> {
    fijarVigentes(cfg);
    this.config.set(cfg);
    await this.datos.guardarConfig(cfg);
  }
}
