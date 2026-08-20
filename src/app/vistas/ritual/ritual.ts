/**
 * ritual.ts — Cerrar la semana que termina y armar la que viene, en un solo
 * recorrido guiado.
 *
 * Es el único lugar de la app que te lleva de la mano paso por paso, y es a
 * propósito: son los cinco minutos de la semana en los que se decide en qué se
 * va a ir la semana siguiente. El resto de las pantallas se usan de a ratos;
 * esta se usa una vez y hasta el final.
 */

import { Component, computed, inject, linkedSignal, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Datos } from '../../data/datos';
import { Avisos } from '../../ui/avisos';
import { Semaforo } from '../../ui/semaforo';
import { BarrasCategoria } from '../../ui/graficos/barras-categoria';
import { candidatos, estadoSemanal, resumenCierre } from '../../core/semana';
import { MAX_OBJETIVOS, type ObjetivoSemana, type PlanSemana, type UnidadId } from '../../core/pendientes';
import { Configuracion } from '../../data/configuracion';
import { fugasDelegacion, totalesSemana } from '../../core/clasificador';
import { UMBRALES } from '../../core/reglas';
import { diasSemana, esFinDeSemana, fechaCorta, hoyISO, inicioSemana, sumarDias } from '../../core/fechas';

@Component({
  selector: 'app-ritual',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Semaforo, BarrasCategoria],
  templateUrl: './ritual.html',
  styleUrl: './ritual.css',
})
export class Ritual {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);
  private readonly router = inject(Router);

  protected readonly hoy = hoyISO();
  private readonly cfg = inject(Configuracion);
  protected readonly unidades = computed(() => this.cfg.reglas().unidades);
  protected readonly fechaCorta = fechaCorta;
  protected readonly max = MAX_OBJETIVOS;

  private readonly lunesActual = inicioSemana(this.hoy);

  private readonly estado = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: async () => {
      const lunesProximo = sumarDias(this.lunesActual, 7);
      return {
        plan: await this.datos.plan(this.lunesActual),
        planProximo: await this.datos.plan(lunesProximo),
        checkins: await this.datos.checkinsEntre(this.lunesActual, sumarDias(this.lunesActual, 6)),
        pendientes: (await this.datos.pendientes()).filter(p => p.estado === 'abierto'),
        lunesProximo,
      };
    },
  });

  protected readonly plan = computed(() => this.estado.value()?.plan ?? null);
  protected readonly cierre = computed(() => resumenCierre(this.plan()));
  protected readonly momento = computed(() =>
    estadoSemanal(this.hoy, this.plan(), this.estado.value()?.planProximo ?? null));

  /** La semana que vas a planificar: la que viene, o esta si arrancó sin plan. */
  protected readonly lunesDestino = computed(() => {
    const m = this.momento();
    return m.momento === 'armar' ? m.lunes : (this.estado.value()?.lunesProximo ?? this.lunesActual);
  });

  protected readonly hayQueCerrar = computed(() => Boolean(this.plan()) && !this.plan()?.cerrado);

  /* ── Números de la semana que termina ──────────────────────────────────── */

  protected readonly totales = computed(() => totalesSemana(this.estado.value()?.checkins ?? []));
  protected readonly umbrales = computed(() =>
    UMBRALES.map(u => ({ titulo: u.titulo, resultado: u.evaluar(this.totales()) })));
  protected readonly fugas = computed(() => fugasDelegacion(this.estado.value()?.checkins ?? []));
  protected readonly horasFuga = computed(() =>
    Math.round(this.fugas().reduce((a, f) => a + f.horas, 0) * 10) / 10);
  protected readonly diasConCierre = computed(() => {
    const ck = this.estado.value()?.checkins ?? [];
    return diasSemana(this.lunesActual).filter(f => !esFinDeSemana(f) && ck.some(c => c.fecha === f)).length;
  });

  /* ── Paso a paso ───────────────────────────────────────────────────────── */

  /**
   * El paso inicial depende de si hay una semana sin cerrar, y eso recién se
   * sabe cuando cargaron los datos: decidirlo antes hace que el cierre se
   * saltee siempre. Por eso arranca cuando el dato llega, y a partir de ahí
   * manda la navegación del usuario.
   */
  protected readonly paso = linkedSignal<{ cargado: boolean; cerrar: boolean }, number>({
    source: () => ({ cargado: this.estado.hasValue(), cerrar: this.hayQueCerrar() }),
    computation: (fuente, previo) => {
      if (!fuente.cargado) return 1;
      if (previo?.source.cargado) return previo.value;
      return fuente.cerrar ? 1 : 2;
    },
  });

  protected readonly pasos = computed(() =>
    this.hayQueCerrar()
      ? ['Cerrar la que termina', 'Mirar los números', 'Armar la que viene']
      : ['Mirar los números', 'Armar la que viene']);

  /**
   * Posición dentro de la guía, en base cero. Con cierre, los pasos 1-2-3
   * son los índices 0-1-2; sin cierre, la guía tiene dos pasos y el 2 es el 0.
   */
  protected readonly indice = computed(() => this.paso() - (this.hayQueCerrar() ? 1 : 2));

  protected avanzar(): void {
    if (this.paso() >= 3) return;
    this.paso.set(this.paso() + 1);
    scrollTo(0, 0);
  }

  protected volver(): void {
    const minimo = this.hayQueCerrar() ? 1 : 2;
    if (this.paso() > minimo) { this.paso.set(this.paso() - 1); scrollTo(0, 0); }
  }

  /* ── Paso 1: cerrar ────────────────────────────────────────────────────── */

  protected readonly nota = signal('');

  protected async alternar(o: ObjetivoSemana): Promise<void> {
    const p = this.plan();
    if (!p) return;
    await this.datos.guardarPlan({
      ...p,
      objetivos: p.objetivos.map(x => (x.id === o.id ? { ...x, hecho: !x.hecho } : x)),
    });
  }

  protected async cerrarSemana(): Promise<void> {
    const p = this.plan();
    if (!p) return;
    await this.datos.guardarPlan({ ...p, cerrado: { fecha: this.hoy, nota: this.nota().trim() } });
    this.avisos.mostrar('Semana cerrada.');
    this.avanzar();
  }

  /* ── Paso 3: armar ─────────────────────────────────────────────────────── */

  protected readonly nuevos = signal<ObjetivoSemana[]>([]);
  protected readonly texto = signal('');
  protected readonly unidad = signal<UnidadId>('transversal');

  /** Lo que no se cumplió y lo que espera en la bandeja: no se escribe de nuevo. */
  protected readonly sugerencias = computed(() => {
    const puestos = new Set(this.nuevos().map(o => o.texto));
    const arrastre = candidatos(this.plan()).map(t => ({ texto: t, arrastre: true }));
    const bandeja = (this.estado.value()?.pendientes ?? [])
      .slice(0, 6).map(p => ({ texto: p.texto, arrastre: false }));
    return [...arrastre, ...bandeja].filter(s => !puestos.has(s.texto)).slice(0, 8);
  });

  protected agregar(texto?: string): void {
    const t = (texto ?? this.texto()).trim();
    if (!t) return;
    if (this.nuevos().length >= this.max) {
      this.avisos.mostrar('Tres objetivos por semana. Es el límite y es el punto.');
      return;
    }
    this.nuevos.set([...this.nuevos(), {
      id: crypto.randomUUID(), texto: t, unidad: this.unidad(), hecho: false,
    }]);
    this.texto.set('');
  }

  protected quitar(id: string): void {
    this.nuevos.set(this.nuevos().filter(o => o.id !== id));
  }

  protected nombreUnidad(id: UnidadId): string {
    return this.cfg.reglas().unidades.find(u => u.id === id)?.corto ?? '';
  }

  protected async guardarPlan(): Promise<void> {
    if (!this.nuevos().length) {
      this.avisos.mostrar('Elegí al menos un objetivo.');
      return;
    }
    const plan: PlanSemana = {
      lunes: this.lunesDestino(),
      objetivos: this.nuevos(),
      creado: Date.now(),
    };
    await this.datos.guardarPlan(plan);
    this.avisos.mostrar(`Semana del ${fechaCorta(plan.lunes)} armada.`);
    await this.router.navigate(['/semana']);
  }
}
