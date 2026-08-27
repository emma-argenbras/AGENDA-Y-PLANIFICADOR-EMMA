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
import { Configuracion } from '../../data/configuracion';
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
  private readonly cfg = inject(Configuracion);

  protected readonly filas = computed(() => {
    const t = this.total();
    const categorias = this.cfg.reglas().categorias;
    const sueltas = Math.round((this.porCategoria()['sin_clasificar'] ?? 0) * 10) / 10;
    const max = Math.max(...categorias.map(c => this.porCategoria()[c.id] ?? 0), sueltas, 0.5);

    const filas = categorias.map(c => ({
      id: c.id as string,
      nombre: c.nombre,
      color: this.tema.oscuro() ? c.colorOscuro : c.color,
      horas: Math.round((this.porCategoria()[c.id] ?? 0) * 10) / 10,
      pct: 0,
      ancho: 0,
    }));

    // Lo que no cayó en ninguna categoría también son horas del día. Contarlas
    // en el total y no mostrarlas hacía dos cosas malas a la vez: escondía
    // trabajo y bajaba el porcentaje de todo lo demás, así que los ocho
    // números eran menores de lo que correspondía y la suma no daba cien.
    //
    // Gris a propósito: no es una categoría más, es la falta de una.
    if (sueltas > 0) {
      filas.push({
        id: 'sin_clasificar',
        nombre: 'Sin clasificar',
        color: this.tema.oscuro() ? '#6b7280' : '#9ca3af',
        horas: sueltas, pct: 0, ancho: 0,
      });
    }

    return filas.map(f => ({
      ...f,
      pct: t ? Math.round((f.horas / t) * 100) : 0,
      ancho: (f.horas / max) * 100,
    }));
  });
}
