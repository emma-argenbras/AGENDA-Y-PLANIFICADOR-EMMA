/**
 * delegar.ts — Todo lo que hiciste vos y tenía otro dueño, agrupado por persona.
 * Es la lista de "qué pasarle a quién", que es el problema real del brief.
 */

import { Component, computed, inject, resource, ChangeDetectionStrategy } from '@angular/core';
import { Datos } from '../../data/datos';
import { Avisos } from '../../ui/avisos';
import { DELEGACION, PERSONAS } from '../../core/reglas';
import { fechaCorta } from '../../core/fechas';
import type { Derivacion } from '../../core/modelo';

@Component({
  selector: 'app-delegar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delegar.html',
})
export class Delegar {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);

  protected readonly fechaCorta = fechaCorta;
  protected readonly tabla = DELEGACION.map(d => ({
    tarea: d.tarea,
    excepcion: d.excepcion ?? '',
    dueno: PERSONAS[d.dueno].nombre.split(' ')[0],
  }));

  private readonly lista = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: () => this.datos.derivaciones(),
  });

  protected readonly todas = computed<Derivacion[]>(() => this.lista.value() ?? []);
  protected readonly pendientes = computed(() => this.todas().filter(d => !d.avisado));
  protected readonly avisadas = computed(() => this.todas().filter(d => d.avisado));

  protected readonly grupos = computed(() => {
    const mapa = new Map<string, { nombre: string; rol: string; horas: number; items: Derivacion[] }>();
    for (const d of this.pendientes()) {
      const g = mapa.get(d.dueno) ?? {
        nombre: PERSONAS[d.dueno]?.nombre ?? d.dueno,
        rol: PERSONAS[d.dueno]?.rol ?? '',
        horas: 0,
        items: [],
      };
      g.horas += Number(d.horas) || 0;
      g.items.push(d);
      mapa.set(d.dueno, g);
    }
    return [...mapa.values()]
      .map(g => ({ ...g, horas: Math.round(g.horas * 10) / 10 }))
      .sort((a, b) => b.horas - a.horas);
  });

  protected async avisado(d: Derivacion): Promise<void> {
    await this.datos.guardarDerivaciones(this.todas().map(x =>
      x.id === d.id ? { ...x, avisado: true, avisadoEl: new Date().toISOString().slice(0, 10) } : x));
    this.avisos.mostrar('Marcado como avisado.');
  }

  protected async limpiar(): Promise<void> {
    await this.datos.guardarDerivaciones(this.pendientes());
    this.avisos.mostrar('Historial limpio.');
  }
}
