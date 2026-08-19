/**
 * columnas-dia.ts — La forma de la semana, día por día.
 *
 * Una columna apilada por día, con los tramos en el mismo orden fijo de
 * categoría (el orden es lo que garantiza que dos tramos vecinos se distingan
 * también con daltonismo) y 2px de separación entre tramos.
 *
 * Tocar una columna abre el detalle de ese día: en el celular un tooltip al
 * pasar el mouse no existe, así que el detalle es explícito.
 */

import { Component, computed, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CATEGORIAS } from '../../core/reglas';
import { Tema } from '../tema';
import { diaCorto, fechaLarga } from '../../core/fechas';
import type { Checkin } from '../../core/modelo';

@Component({
  selector: 'app-columnas-dia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grafico" role="group" aria-label="Horas por día">
      @for (d of dias(); track d.fecha) {
        <button class="col" type="button" [class.elegido]="elegido() === d.fecha"
                (click)="elegir(d.fecha)"
                [attr.aria-label]="d.titulo + ': ' + d.total + ' horas'">
          <span class="tope tabular">@if (d.total) { {{ d.total }} }</span>
          <span class="pila" [style.height.%]="d.alto">
            @for (p of d.partes; track $index) {
              <i [style.flex-grow]="p.horas" [style.background]="p.color"></i>
            }
          </span>
          <span class="dia" [class.finde]="d.finde">{{ d.letra }}</span>
        </button>
      }
    </div>

    @if (detalle(); as det) {
      <div class="detalle">
        <div class="fila sep">
          <span class="fuerte">{{ det.titulo }}</span>
          <span class="chico tabular">{{ det.total }} h</span>
        </div>
        @if (det.partes.length) {
          <ul class="limpia">
            @for (p of det.partes; track $index) {
              <li class="fila sep" style="border:0;padding:5px 0">
                <span class="fila" style="gap:7px">
                  <i class="punto" [style.background]="p.color"></i>
                  <span class="chico">{{ p.nombre }}</span>
                </span>
                <span class="chico tabular">{{ p.horas }} h</span>
              </li>
            }
          </ul>
        } @else {
          <p class="mini" style="margin:6px 0 0">Sin cierre de jornada este día.</p>
        }
      </div>
    }
  `,
  styles: `
    .grafico {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
      align-items: end;
      height: 176px;
    }
    .col {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 5px;
      height: 100%;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
      color: inherit;
      border-radius: 8px;
    }
    .col.elegido { background: var(--superficie-2); }
    .tope { font-size: 11px; color: var(--tinta-3); height: 14px; }
    .pila {
      width: 100%;
      max-width: 34px;
      min-height: 3px;
      display: flex;
      flex-direction: column-reverse;
      gap: 2px;              /* el hueco de superficie entre tramos */
      border-radius: 4px;
      overflow: hidden;
      background: var(--superficie-2);
    }
    .pila > i { display: block; min-height: 3px; }
    .dia { font-size: 11px; color: var(--tinta-2); text-transform: capitalize; }
    .dia.finde { color: var(--tinta-3); }
    .detalle { margin-top: 14px; border-top: 1px solid var(--linea); padding-top: 12px; }
    .punto { width: 9px; height: 9px; border-radius: 2px; }
  `,
})
export class ColumnasDia {
  readonly fechas = input.required<string[]>();
  readonly checkins = input.required<Checkin[]>();
  readonly diaElegido = output<string | null>();

  private readonly tema = inject(Tema);
  protected readonly elegido = signal<string | null>(null);

  protected readonly dias = computed(() => {
    const oscuro = this.tema.oscuro();
    const filas = this.fechas().map(fecha => {
      const ck = this.checkins().find(c => c.fecha === fecha);
      const porCat = new Map<string, number>();
      for (const s of ck?.segmentos ?? []) {
        if (!s.categoria) continue;
        porCat.set(s.categoria, (porCat.get(s.categoria) ?? 0) + s.horas);
      }
      const partes = CATEGORIAS
        .filter(c => porCat.has(c.id))
        .map(c => ({
          nombre: c.nombre,
          color: oscuro ? c.colorOscuro : c.color,
          horas: Math.round((porCat.get(c.id) ?? 0) * 10) / 10,
        }));
      const total = Math.round(partes.reduce((a, p) => a + p.horas, 0) * 10) / 10;
      const d = new Date(fecha + 'T12:00:00').getDay();
      return { fecha, partes, total, titulo: fechaLarga(fecha), letra: diaCorto(fecha), finde: d === 0 || d === 6 };
    });
    const max = Math.max(...filas.map(f => f.total), 8);
    return filas.map(f => ({ ...f, alto: Math.max(2, (f.total / max) * 100) }));
  });

  protected readonly detalle = computed(() => this.dias().find(d => d.fecha === this.elegido()) ?? null);

  protected elegir(fecha: string): void {
    this.elegido.set(this.elegido() === fecha ? null : fecha);
    this.diaElegido.emit(this.elegido());
  }
}
