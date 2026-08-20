/**
 * semana.ts — Los 4 umbrales con semáforo, y los gráficos que explican por qué
 * están así. Sin datos no miente con ceros: queda en gris y lo dice.
 */

import { Component, computed, inject, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Dialogo } from '../../ui/dialogo';
import { Avisos } from '../../ui/avisos';
import {
  MAX_OBJETIVOS, progresoPlan,
  type PlanSemana, type UnidadId,
} from '../../core/pendientes';
import { Configuracion } from '../../data/configuracion';
import { Datos } from '../../data/datos';
import { Semaforo } from '../../ui/semaforo';
import { BarrasCategoria } from '../../ui/graficos/barras-categoria';
import { ColumnasDia } from '../../ui/graficos/columnas-dia';
import { LineaTendencia, type PuntoTendencia } from '../../ui/graficos/linea-tendencia';
import { fugasDelegacion, totalesSemana } from '../../core/clasificador';

import { diasSemana, esFinDeSemana, fechaCorta, hoyISO, inicioSemana, sumarDias } from '../../core/fechas';

const SEMANAS_TENDENCIA = 8;

@Component({
  selector: 'app-semana',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Dialogo, Semaforo, BarrasCategoria, ColumnasDia, LineaTendencia],
  templateUrl: './semana.html',
  styleUrl: './semana.css',
})
export class Semana {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);
  private readonly cfg = inject(Configuracion);

  protected readonly hoy = hoyISO();
  protected readonly lunes = signal(inicioSemana(this.hoy));
  protected readonly categorias = computed(() => this.cfg.reglas().categorias);
  protected readonly verNumeros = signal(false);

  protected readonly esSemanaActual = computed(() => this.lunes() === inicioSemana(this.hoy));
  protected readonly fechas = computed(() => diasSemana(this.lunes()));
  protected readonly rotulo = computed(() =>
    `${fechaCorta(this.fechas()[0]!)} al ${fechaCorta(this.fechas()[6]!)}`);

  private readonly datosSemana = resource({
    params: () => ({ lunes: this.lunes(), v: this.datos.cambios() }),
    loader: async ({ params }) => {
      const desdeTendencia = sumarDias(params.lunes, -7 * (SEMANAS_TENDENCIA - 1));
      const todo = await this.datos.checkinsEntre(desdeTendencia, sumarDias(params.lunes, 6));
      const dias = diasSemana(params.lunes);
      return {
        todo,
        semana: todo.filter(c => dias.includes(c.fecha)),
        plan: await this.datos.plan(params.lunes),
        pendientes: await this.datos.pendientes(),
      };
    },
  });

  protected readonly checkins = computed(() => this.datosSemana.value()?.semana ?? []);
  protected readonly totales = computed(() => totalesSemana(this.checkins()));
  protected readonly fugas = computed(() => fugasDelegacion(this.checkins()));
  protected readonly horasFuga = computed(() => redondear(this.fugas().reduce((a, f) => a + f.horas, 0)));

  protected readonly umbrales = computed(() =>
    this.cfg.reglas().umbrales.map(u => ({ ...u, resultado: u.evaluar(this.totales()) })));

  protected readonly habiles = computed(() => this.fechas().filter(f => !esFinDeSemana(f)));
  protected readonly conCierre = computed(() =>
    this.habiles().filter(f => this.checkins().some(c => c.fecha === f)).length);

  protected readonly totalHoras = computed(() => redondear(this.totales().total));

  protected readonly pctRol = computed(() => {
    const t = this.totales();
    if (!t.total) return null;
    return Math.round((((t.porCategoria['ventas'] ?? 0) + (t.porCategoria['estrategia'] ?? 0)) / t.total) * 100);
  });

  /** Ocho semanas de "% del tiempo en el rol de Director", contra el piso del 40%. */
  protected readonly tendencia = computed<PuntoTendencia[]>(() => {
    const todo = this.datosSemana.value()?.todo ?? [];
    return Array.from({ length: SEMANAS_TENDENCIA }, (_, i) => {
      const lunes = sumarDias(this.lunes(), -7 * (SEMANAS_TENDENCIA - 1 - i));
      const dias = diasSemana(lunes);
      const t = totalesSemana(todo.filter(c => dias.includes(c.fecha)));
      return {
        etiqueta: fechaCorta(lunes),
        valor: t.total
          ? Math.round((((t.porCategoria['ventas'] ?? 0) + (t.porCategoria['estrategia'] ?? 0)) / t.total) * 100)
          : null,
      };
    });
  });

  protected readonly hayTendencia = computed(() => this.tendencia().some(p => p.valor !== null));

  protected readonly filasNumeros = computed(() => {
    const t = this.totales();
    return this.cfg.reglas().categorias.map(c => ({
      nombre: c.nombre,
      horas: redondear(t.porCategoria[c.id] ?? 0),
      pct: t.total ? Math.round(((t.porCategoria[c.id] ?? 0) / t.total) * 100) : 0,
    }));
  });

  protected mover(semanas: number): void { this.lunes.set(sumarDias(this.lunes(), semanas * 7)); }

  /* ── Plan de la semana ─────────────────────────────────────────────────── */

  protected readonly MAX_OBJETIVOS = MAX_OBJETIVOS;
  protected readonly unidades = computed(() => this.cfg.reglas().unidades);

  protected readonly plan = computed<PlanSemana | null>(() => this.datosSemana.value()?.plan ?? null);
  protected readonly objetivos = computed(() =>
    progresoPlan(this.plan(), this.datosSemana.value()?.pendientes ?? []));
  protected readonly cumplidos = computed(() => this.objetivos().filter(o => o.hecho).length);

  protected readonly nuevoObjetivo = signal('');
  protected readonly unidadNueva = signal<UnidadId>('transversal');

  protected async agregarObjetivo(): Promise<void> {
    const texto = this.nuevoObjetivo().trim();
    if (!texto) return;
    const actual = this.plan();
    if ((actual?.objetivos.length ?? 0) >= MAX_OBJETIVOS) {
      this.avisos.mostrar(`Tres objetivos por semana. Sacá uno antes de agregar otro.`);
      return;
    }
    const plan: PlanSemana = actual ?? { lunes: this.lunes(), objetivos: [], creado: Date.now() };
    plan.objetivos = [...plan.objetivos, {
      id: crypto.randomUUID(), texto, unidad: this.unidadNueva(), hecho: false,
    }];
    await this.datos.guardarPlan(plan);
    this.nuevoObjetivo.set('');
  }

  protected async alternarObjetivo(id: string): Promise<void> {
    const plan = this.plan();
    if (!plan) return;
    await this.datos.guardarPlan({
      ...plan,
      objetivos: plan.objetivos.map(o => (o.id === id ? { ...o, hecho: !o.hecho } : o)),
    });
  }

  protected async quitarObjetivo(id: string): Promise<void> {
    const plan = this.plan();
    if (!plan) return;
    await this.datos.guardarPlan({ ...plan, objetivos: plan.objetivos.filter(o => o.id !== id) });
  }

  protected nombreUnidad(id: UnidadId): string {
    return this.cfg.reglas().unidades.find(u => u.id === id)?.corto ?? '';
  }

  /* ── Cierre del viernes ────────────────────────────────────────────────── */

  protected readonly cerrando = signal(false);
  protected readonly notaCierre = signal('');

  protected async cerrarSemana(): Promise<void> {
    const plan = this.plan();
    if (!plan) return;
    await this.datos.guardarPlan({
      ...plan,
      cerrado: { fecha: this.hoy, nota: this.notaCierre().trim() },
    });
    this.cerrando.set(false);
    this.notaCierre.set('');
    this.avisos.mostrar('Semana cerrada.');
  }
}

function redondear(n: number): number { return Math.round(n * 10) / 10; }
