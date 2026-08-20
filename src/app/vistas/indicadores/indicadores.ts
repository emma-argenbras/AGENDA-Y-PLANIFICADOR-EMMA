/**
 * indicadores.ts — Los 3 números que te corresponde mirar. Y solo esos.
 * Facturación, unidades y visitas no entran acá a propósito.
 */

import { Component, computed, inject, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { Datos } from '../../data/datos';
import { Avisos } from '../../ui/avisos';
import { Dialogo } from '../../ui/dialogo';
import { LineaTendencia, type PuntoTendencia } from '../../ui/graficos/linea-tendencia';
import { Configuracion } from '../../data/configuracion';
import { hoyISO, mesLargo } from '../../core/fechas';
import type { FilaIndicadores } from '../../core/modelo';

type ClaveIndicador = 'margen' | 'recompra' | 'caja60';

@Component({
  selector: 'app-indicadores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialogo, LineaTendencia],
  templateUrl: './indicadores.html',
})
export class Indicadores {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);

  private readonly cfg = inject(Configuracion);
  protected readonly definiciones = computed(() => this.cfg.reglas().indicadores);
  protected readonly mesLargo = mesLargo;
  protected readonly mesActual = hoyISO().slice(0, 7);

  private readonly filas = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: () => this.datos.indicadores(),
  });

  protected readonly meses = computed(() =>
    [...(this.filas.value() ?? [])].sort((a, b) => b.mes.localeCompare(a.mes)));

  protected readonly hayDatos = computed(() => this.meses().length > 0);
  protected readonly cargadoEsteMes = computed(() => this.meses().some(m => m.mes === this.mesActual));

  /** Serie de los últimos 12 meses para el gráfico de cada indicador. */
  protected serie(clave: ClaveIndicador): PuntoTendencia[] {
    return [...this.meses()]
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12)
      .map(f => ({ etiqueta: f.mes.slice(5) + '/' + f.mes.slice(2, 4), valor: f[clave] }));
  }

  protected maximo(clave: ClaveIndicador): number {
    const vs = this.meses().map(m => m[clave] ?? 0);
    return Math.max(...vs, 1) * 1.15;
  }

  protected sufijo(clave: ClaveIndicador): string { return clave === 'recompra' ? '' : ''; }

  protected valores(clave: ClaveIndicador) {
    return this.meses()
      .filter(m => m[clave] !== null && m[clave] !== undefined)
      .slice(0, 12)
      .map((m, i, arr) => {
        const prev = arr[i + 1];
        const delta = prev && prev[clave] !== null ? (m[clave] as number) - (prev[clave] as number) : null;
        return { mes: m.mes, valor: m[clave] as number, delta };
      });
  }

  protected formato(clave: ClaveIndicador, v: number): string {
    if (clave === 'recompra') return String(v);
    return '$ ' + v.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  /* ── Carga ─────────────────────────────────────────────────────────────── */

  protected readonly editando = signal(false);
  protected readonly mes = signal(this.mesActual);
  protected readonly borrador = signal<Record<ClaveIndicador, string>>({ margen: '', recompra: '', caja60: '' });

  protected abrir(): void {
    const actual = this.meses().find(m => m.mes === this.mesActual);
    this.mes.set(this.mesActual);
    this.borrador.set({
      margen: actual?.margen != null ? String(actual.margen) : '',
      recompra: actual?.recompra != null ? String(actual.recompra) : '',
      caja60: actual?.caja60 != null ? String(actual.caja60) : '',
    });
    this.editando.set(true);
  }

  protected fijar(clave: ClaveIndicador, v: string): void {
    this.borrador.set({ ...this.borrador(), [clave]: v });
  }

  protected async guardar(): Promise<void> {
    const m = this.mes() || this.mesActual;
    const b = this.borrador();
    const fila: FilaIndicadores = {
      mes: m,
      margen: b.margen === '' ? null : Number(b.margen),
      recompra: b.recompra === '' ? null : Number(b.recompra),
      caja60: b.caja60 === '' ? null : Number(b.caja60),
    };
    const resto = (this.filas.value() ?? []).filter(f => f.mes !== m);
    await this.datos.guardarIndicadores([...resto, fila]);
    this.editando.set(false);
    this.avisos.mostrar('Indicadores guardados.');
  }
}
