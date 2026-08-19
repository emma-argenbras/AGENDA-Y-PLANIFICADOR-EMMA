/**
 * linea-tendencia.ts — Una serie en el tiempo contra una línea de referencia.
 *
 * Se usa para el indicador que manda: qué porcentaje de la semana se fue en
 * Venta y clientes + Estrategia. La línea del 40% no es decorativa: por debajo,
 * la Ficha de Rol dice que el rol de Director no se está ejerciendo.
 *
 * El SVG se dibuja en píxeles reales (medidos con ResizeObserver) en vez de
 * escalar un viewBox: así el trazo es de 2px de verdad y los puntos son
 * redondos, no elipses.
 */

import {
  Component, ElementRef, computed, effect, inject, input, signal, viewChild,
  ChangeDetectionStrategy, afterNextRender,
} from '@angular/core';

export interface PuntoTendencia { etiqueta: string; valor: number | null; detalle?: string; }

@Component({
  selector: 'app-linea-tendencia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="marco" #marco>
      <svg [attr.width]="ancho()" [attr.height]="alto" role="img"
           [attr.aria-label]="descripcion()">
        <!-- referencia -->
        <line [attr.x1]="0" [attr.x2]="ancho()" [attr.y1]="yObjetivo()" [attr.y2]="yObjetivo()"
              stroke="var(--eje)" stroke-width="1" stroke-dasharray="3 4"/>
        <!-- serie -->
        @if (d(); as trazo) {
          <path [attr.d]="trazo" fill="none" stroke="var(--acento)" stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round"/>
        }
        @for (p of puntos_(); track $index) {
          @if (p.y !== null) {
            <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4.5"
                    [attr.fill]="p.ultimo ? 'var(--acento)' : 'var(--superficie)'"
                    stroke="var(--acento)" stroke-width="2"/>
          }
        }
      </svg>
      <div class="marca-objetivo" [style.top.px]="yObjetivo()">{{ objetivoTexto() }}</div>
    </div>

    <div class="eje">
      @for (p of puntos_(); track $index) {
        <span class="tick" [class.ultimo]="p.ultimo">
          <span class="v tabular">@if (p.valor !== null) { {{ p.valor }}{{ sufijo() }} } @else { — }</span>
          <span class="e">{{ p.etiqueta }}</span>
        </span>
      }
    </div>
  `,
  styles: `
    .marco { position: relative; }
    svg { display: block; }
    .marca-objetivo {
      position: absolute;
      right: 0;
      transform: translateY(-50%);
      font-size: 11px;
      color: var(--tinta-3);
      background: var(--superficie);
      padding: 0 4px;
      pointer-events: none;
    }
    .eje { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; margin-top: 6px; }
    .tick { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .tick .v { font-size: 11.5px; color: var(--tinta-2); }
    .tick .e { font-size: 10.5px; color: var(--tinta-3); }
    .tick.ultimo .v { color: var(--tinta); font-weight: 680; }
  `,
})
export class LineaTendencia {
  readonly puntos = input.required<PuntoTendencia[]>();
  readonly objetivo = input<number | null>(null);
  readonly objetivoTexto = input('objetivo');
  readonly maximo = input(100);
  readonly sufijo = input('%');

  protected readonly alto = 120;
  protected readonly ancho = signal(320);
  private readonly marco = viewChild.required<ElementRef<HTMLElement>>('marco');

  constructor() {
    afterNextRender(() => {
      const el = this.marco().nativeElement;
      const ro = new ResizeObserver(() => this.ancho.set(Math.max(120, el.clientWidth)));
      ro.observe(el);
      this.ancho.set(Math.max(120, el.clientWidth));
    });
    effect(() => { this.puntos(); });
  }

  #y(valor: number): number {
    const m = Math.max(this.maximo(), 1);
    const pad = 12;
    return pad + (1 - Math.min(valor, m) / m) * (this.alto - pad * 2);
  }

  protected readonly puntos_ = computed(() => {
    const ps = this.puntos();
    const w = this.ancho();
    const paso = ps.length > 1 ? (w - 16) / (ps.length - 1) : 0;
    return ps.map((p, i) => ({
      ...p,
      x: 8 + paso * i,
      y: p.valor === null ? null : this.#y(p.valor),
      ultimo: i === ps.length - 1,
    }));
  });

  protected readonly d = computed(() => {
    const con = this.puntos_().filter(p => p.y !== null);
    if (con.length < 2) return '';
    return con.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${(p.y as number).toFixed(1)}`).join(' ');
  });

  protected readonly yObjetivo = computed(() => this.#y(this.objetivo() ?? 0));

  protected readonly descripcion = computed(() =>
    this.puntos().map(p => `${p.etiqueta}: ${p.valor ?? 'sin datos'}${this.sufijo()}`).join('; '));
}
