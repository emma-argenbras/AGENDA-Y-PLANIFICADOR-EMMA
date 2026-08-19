/**
 * barras-categoria.ts — En qué se fue la semana.
 *
 * Barras horizontales en ORDEN FIJO de categoría, nunca ordenadas por valor:
 * así la misma fila está siempre en el mismo lugar y dos semanas se comparan de
 * un vistazo. Las categorías en cero se muestran igual — que Estrategia esté
 * vacía es justamente el dato.
 *
 * Cada barra lleva su nombre y su número al lado (etiqueta directa), que es lo
 * que habilita usar los ocho colores en superficie clara.
 */

import { Component, computed, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { CATEGORIAS } from '../../core/reglas';
import { Tema } from '../tema';

@Component({
  selector: 'app-barras-categoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <div class="lista">
        @for (f of filas(); track f.id) {
          <div class="fila-cat" [class.cero]="f.horas === 0">
            <div class="cabeza">
              <span class="nombre">
                <i class="punto" [style.background]="f.color"></i>{{ f.nombre }}
              </span>
              <span class="valor tabular">
                @if (f.horas > 0) { {{ f.horas }} h · {{ f.pct }}% } @else { — }
              </span>
            </div>
            <div class="pista">
              <i [style.width.%]="f.ancho" [style.background]="f.color"></i>
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="vacio">
        <div class="titulo">Todavía no hay datos de esta semana</div>
        <div class="chico">Con un solo cierre de jornada ya se dibuja.</div>
      </div>
    }
  `,
  styles: `
    .lista { display: flex; flex-direction: column; gap: 12px; }
    .cabeza { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 5px; }
    .nombre { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; }
    .valor { font-size: 13px; color: var(--tinta-2); white-space: nowrap; }
    .punto { width: 9px; height: 9px; border-radius: 2px; flex: 0 0 auto; }
    .pista { height: 10px; border-radius: 5px; background: var(--superficie-2); overflow: hidden; }
    .pista > i { display: block; height: 100%; border-radius: 5px; min-width: 4px; }
    .fila-cat.cero .nombre, .fila-cat.cero .valor { color: var(--tinta-3); }
    .fila-cat.cero .pista > i { min-width: 0; }
  `,
})
export class BarrasCategoria {
  readonly porCategoria = input.required<Partial<Record<string, number>>>();
  readonly total = input.required<number>();
  private readonly tema = inject(Tema);

  protected readonly filas = computed(() => {
    const t = this.total();
    const max = Math.max(...CATEGORIAS.map(c => this.porCategoria()[c.id] ?? 0), 0.5);
    return CATEGORIAS.map(c => {
      const horas = Math.round((this.porCategoria()[c.id] ?? 0) * 10) / 10;
      return {
        id: c.id,
        nombre: c.nombre,
        color: this.tema.oscuro() ? c.colorOscuro : c.color,
        horas,
        pct: t ? Math.round((horas / t) * 100) : 0,
        ancho: (horas / max) * 100,
      };
    });
  });
}
