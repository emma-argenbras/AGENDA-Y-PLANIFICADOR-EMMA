/** avisos.ts — Mensajito flotante. Nada más. */

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Avisos {
  readonly texto = signal('');
  readonly visible = signal(false);
  #t: ReturnType<typeof setTimeout> | undefined;

  mostrar(texto: string): void {
    this.texto.set(texto);
    this.visible.set(true);
    clearTimeout(this.#t);
    this.#t = setTimeout(() => this.visible.set(false), 3200);
  }
}
