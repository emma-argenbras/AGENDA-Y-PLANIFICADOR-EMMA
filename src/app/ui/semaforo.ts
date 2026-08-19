/**
 * semaforo.ts — Estado con color + ícono + palabra.
 * El color nunca viaja solo: hay forma e idioma además del tono.
 */

import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import type { Estado } from '../core/reglas';

const MAPA: Record<Estado, { color: string; palabra: string; d: string }> = {
  verde:    { color: 'var(--bien)',    palabra: 'En orden',   d: 'M4 8.5 7 11.5 12.5 4.5' },
  amarillo: { color: 'var(--aviso)',   palabra: 'Atención',   d: 'M8 3.5v6M8 12.2v.6' },
  rojo:     { color: 'var(--critico)', palabra: 'Fuera de línea', d: 'M4 4l8 8M12 4l-8 8' },
  gris:     { color: 'var(--tinta-3)', palabra: 'Sin datos',  d: 'M4 8h8' },
};

@Component({
  selector: 'app-semaforo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="s" [style.--c]="info().color">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="7.2" fill="none" stroke="var(--c)" stroke-width="1.6"/>
        <path [attr.d]="info().d" fill="none" stroke="var(--c)" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>{{ etiqueta() || info().palabra }}</span>
    </span>
  `,
  styles: `
    .s {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12.5px; font-weight: 680; color: var(--c);
      white-space: nowrap;
    }
    svg { flex: 0 0 auto; }
  `,
})
export class Semaforo {
  readonly estado = input.required<Estado>();
  readonly etiqueta = input('');
  protected readonly info = computed(() => MAPA[this.estado()]);
}
