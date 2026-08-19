/**
 * dialogo.ts — Envoltorio del <dialog> nativo: backdrop, foco y Escape los pone
 * el navegador, así que no hay que reimplementar nada de eso.
 */

import {
  Component, ElementRef, effect, input, output, viewChild, ChangeDetectionStrategy,
} from '@angular/core';

@Component({
  selector: 'app-dialogo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg (close)="cerrar.emit()" (click)="fondo($event)">
      <div class="cuerpo">
        <h2>{{ titulo() }}</h2>
        @if (bajada()) { <p class="chico" style="margin:0 0 14px">{{ bajada() }}</p> }
        <ng-content />
      </div>
      <div class="pie">
        <ng-content select="[pie]" />
      </div>
    </dialog>
  `,
})
export class Dialogo {
  readonly abierto = input(false);
  readonly titulo = input('');
  readonly bajada = input('');
  readonly cerrar = output<void>();
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.abierto() && !el.open) el.showModal();
      if (!this.abierto() && el.open) el.close();
    });
  }

  /** Tocar fuera de la caja cierra, como espera cualquiera en el celular. */
  protected fondo(e: MouseEvent): void {
    if (e.target === this.dlg().nativeElement) this.cerrar.emit();
  }
}
