/**
 * tema.ts — Claro u oscuro. Los gráficos consultan `oscuro()` para elegir el
 * paso de color correcto: la paleta oscura no es la clara invertida, es otra
 * validada contra la superficie oscura.
 */

import { Injectable, effect, signal } from '@angular/core';

export type Preferencia = 'auto' | 'claro' | 'oscuro';

@Injectable({ providedIn: 'root' })
export class Tema {
  readonly preferencia = signal<Preferencia>('auto');
  readonly oscuro = signal(false);
  readonly #sistema = matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.#sistema.addEventListener('change', () => this.#recalcular());
    effect(() => { this.preferencia(); this.#recalcular(); });
  }

  #recalcular(): void {
    const p = this.preferencia();
    const oscuro = p === 'oscuro' || (p === 'auto' && this.#sistema.matches);
    this.oscuro.set(oscuro);
    const raiz = document.documentElement;
    if (p === 'auto') raiz.removeAttribute('data-theme');
    else raiz.setAttribute('data-theme', p);
    document.querySelector('meta[name=theme-color]')
      ?.setAttribute('content', oscuro ? '#0d0d0d' : '#f9f9f7');
  }
}
