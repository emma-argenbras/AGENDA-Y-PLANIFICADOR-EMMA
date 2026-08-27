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
import type { CategoriaId } from '../../core/reglas';
import { Datos } from '../../data/datos';
import { Semaforo } from '../../ui/semaforo';
import { BarrasCategoria } from '../../ui/graficos/barras-categoria';
import { ColumnasDia } from '../../ui/graficos/columnas-dia';
import { LineaTendencia, type PuntoTendencia } from '../../ui/graficos/linea-tendencia';
import { fugasDelegacion, totalesSemana } from '../../core/clasificador';

import { diasSemana, esFinDeSemana, fechaCorta, hoyISO, inicioSemana, sumarDias , duracion } from '../../core/fechas';

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
  protected readonly fechaCorta = fechaCorta;
  protected readonly duracion = duracion;
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
      const [todo, plan, planAnterior, pendientes] = await Promise.all([
        this.datos.checkinsEntre(desdeTendencia, sumarDias(params.lunes, 6)),
        this.datos.plan(params.lunes),
        this.datos.plan(sumarDias(params.lunes, -7)),
        this.datos.pendientes(),
      ]);
      const dias = diasSemana(params.lunes);
      return { todo, semana: todo.filter(c => dias.includes(c.fecha)), plan, planAnterior, pendientes };
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
    const filas = this.cfg.reglas().categorias.map(c => ({
      nombre: c.nombre,
      horas: redondear(t.porCategoria[c.id] ?? 0),
      pct: t.total ? Math.round(((t.porCategoria[c.id] ?? 0) / t.total) * 100) : 0,
    }));
    const sueltas = t.porCategoria['sin_clasificar'] ?? 0;
    if (sueltas > 0) {
      filas.push({
        nombre: 'Sin clasificar',
        horas: redondear(sueltas),
        pct: t.total ? Math.round((sueltas / t.total) * 100) : 0,
      });
    }
    return filas;
  });

  /* ── Rescatar las horas que no cayeron en ninguna categoría ────────────── */

  /**
   * Un fragmento sin categoría se cuenta en el total y no aparece en ninguna
   * barra: son horas que la app te tomó y no te muestra. Acá se listan con su
   * día, para poder decirle a cuál pertenecen.
   */
  protected readonly sueltos = computed(() =>
    this.checkins().flatMap(ck => ck.segmentos
      .map((s, i) => ({ fecha: ck.fecha, i, texto: s.texto, horas: s.horas, cat: s.categoria }))
      .filter(x => !x.cat)));

  protected readonly horasSueltas = computed(() =>
    redondear(this.sueltos().reduce((a, s) => a + s.horas, 0)));

  protected readonly clasificando = signal(false);

  protected async asignar(x: { fecha: string; i: number }, id: CategoriaId): Promise<void> {
    const ck = this.checkins().find(c => c.fecha === x.fecha);
    if (!ck) return;
    await this.datos.guardarCheckin(x.fecha, {
      ...ck,
      segmentos: ck.segmentos.map((s, j) => (j === x.i ? { ...s, categoria: id } : s)),
      actualizado: Date.now(),
    });
    this.avisos.mostrar('Asignada. Ya suma donde corresponde.');
  }

  protected mover(semanas: number): void { this.lunes.set(sumarDias(this.lunes(), semanas * 7)); }

  /**
   * Una semana que se pasó sin cerrar no volvía a aparecer nunca: el ritual la
   * ofrece viernes y sábado, y pasado ese rato quedaba enterrada con sus
   * objetivos adentro. Cerrarla tarde sigue sirviendo; no cerrarla nunca hace
   * que la siguiente se arme sin saber qué pasó.
   */
  protected readonly anteriorSinCerrar = computed(() => {
    const p = this.datosSemana.value()?.planAnterior;
    return p && !p.cerrado && p.objetivos.length ? p : null;
  });

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

  /* ── Corregir el texto de un objetivo ──────────────────────────────────── */

  protected readonly corrigiendo = signal<{ id: string; texto: string } | null>(null);
  protected readonly textoCorregido = signal('');

  protected corregir(o: { id: string; texto: string }): void {
    this.textoCorregido.set(o.texto);
    this.corrigiendo.set(o);
  }

  protected async guardarCorreccion(): Promise<void> {
    const o = this.corrigiendo();
    const texto = this.textoCorregido().trim();
    if (!o || !texto) return;
    if (texto !== o.texto) await this.datos.renombrarObjetivo(this.lunes(), o.id, texto);
    this.corrigiendo.set(null);
    this.avisos.mostrar('Objetivo corregido.');
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
