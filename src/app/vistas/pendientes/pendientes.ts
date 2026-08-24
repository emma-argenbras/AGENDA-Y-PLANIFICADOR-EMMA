/**
 * pendientes.ts — La bandeja: el único lugar donde va lo que sabés que hay que
 * hacer y todavía no hiciste.
 *
 * No es una lista de tareas infinita, a propósito:
 *  - lo que tiene otro dueño no entra, igual que en las prioridades;
 *  - hay tope de 20, y cuando se llena tenés que cerrar o delegar algo;
 *  - a las tres semanas sin ser prioridad, te obliga a decidir: hacerlo esta
 *    semana, delegarlo o matarlo.
 */

import { Component, computed, inject, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Datos } from '../../data/datos';
import { Avisos } from '../../ui/avisos';
import { Dialogo } from '../../ui/dialogo';
import { evaluarPrioridad, type Delegacion } from '../../core/clasificador';
import {
  DIAS_PARA_DECIDIR, MAX_OBJETIVOS, TOPE_BANDEJA, diasQuieto, estancado, hayLugar,
  ordenar, resumen, type Pendiente, type PlanSemana,
} from '../../core/pendientes';
import type { PersonaId } from '../../core/reglas';
import { Configuracion } from '../../data/configuracion';
import { fechaCorta, hoyISO, inicioSemana, sumarDias } from '../../core/fechas';
import type { Prioridad } from '../../core/modelo';

@Component({
  selector: 'app-pendientes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Dialogo],
  templateUrl: './pendientes.html',
  styleUrl: './pendientes.css',
})
export class Pendientes {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);
  private readonly cfg = inject(Configuracion);

  protected readonly hoy = hoyISO();
  protected readonly TOPE = TOPE_BANDEJA;
  protected readonly DIAS = DIAS_PARA_DECIDIR;
  protected readonly MAX_OBJETIVOS = MAX_OBJETIVOS;
  protected readonly duenos = computed(() => {
    const { delegacion, personas } = this.cfg.reglas();
    return delegacion
      .map(d => ({ id: d.dueno, nombre: personas[d.dueno]?.nombre ?? d.dueno }))
      .filter((v, i, a) => a.findIndex(x => x.id === v.id) === i);
  });

  private readonly estado = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: async () => ({
      pendientes: await this.datos.pendientes(),
      plan: await this.datos.plan(inicioSemana(this.hoy)),
      prioridades: await this.datos.prioridades(this.hoy),
      eventos: await this.datos.eventosEntre(this.hoy, sumarDias(this.hoy, 7)),
      inicio: await this.datos.desdeCuando(),
    }),
  });

  protected readonly todos = computed<Pendiente[]>(() => this.estado.value()?.pendientes ?? []);
  protected readonly plan = computed<PlanSemana | null>(() => this.estado.value()?.plan ?? null);
  protected readonly prioridadesHoy = computed(() => this.estado.value()?.prioridades ?? []);
  protected readonly lista = computed(() => ordenar(this.todos(), this.hoy, this.inicio()));
  protected readonly inicio = computed(() => this.estado.value()?.inicio ?? null);
  protected readonly resumen = computed(() => resumen(this.todos(), this.hoy, this.inicio()));
  protected readonly cerrados = computed(() =>
    this.todos().filter(p => p.estado !== 'abierto').sort((a, b) => (b.cerrado ?? 0) - (a.cerrado ?? 0)));

  protected readonly objetivos = computed(() => this.plan()?.objetivos ?? []);

  protected diasQuieto(p: Pendiente): number { return diasQuieto(p, this.hoy, this.inicio()); }

  /** «hoy» / «1 día» / «12 días»: los plurales rotos se notan. */
  protected antiguedad(p: Pendiente): string {
    const d = diasQuieto(p, this.hoy, this.inicio());
    if (d === 0) return 'entró hoy';
    return d === 1 ? 'hace 1 día' : `hace ${d} días`;
  }

  /** Las acciones secundarias sólo aparecen si las pedís: la lista se lee de un vistazo. */
  protected readonly abierto = signal<string | null>(null);
  protected alternarDetalle(id: string): void {
    this.abierto.set(this.abierto() === id ? null : id);
  }
  protected verDetalle(p: Pendiente): boolean {
    return this.abierto() === p.id || estancado(p, this.hoy, this.inicio());
  }
  protected estancado(p: Pendiente): boolean { return estancado(p, this.hoy, this.inicio()); }
  /** Bloque de agenda reservado para este pendiente, si tiene uno. */
  protected bloque(p: Pendiente) {
    return (this.estado.value()?.eventos ?? []).find(e => e.pendienteId === p.id) ?? null;
  }

  protected textoBloque(p: Pendiente): string {
    const b = this.bloque(p);
    if (!b) return '';
    return b.fecha === this.hoy ? `hoy ${b.hora}` : `${fechaCorta(b.fecha)} ${b.hora}`;
  }

  protected async reservar(p: Pendiente): Promise<void> {
    const e = await this.datos.reservarBloque(p.texto, this.hoy, p.id);
    this.avisos.mostrar(e
      ? `Bloque reservado hoy ${e.hora}.`
      : 'Hoy no entra un bloque de una hora. Movelo en Agenda.');
  }

  protected esPrioridadHoy(p: Pendiente): boolean {
    return this.prioridadesHoy().some(x => x.pendienteId === p.id);
  }
  protected nombreObjetivo(id: string | null | undefined): string {
    return this.objetivos().find(o => o.id === id)?.texto ?? '';
  }

  /* ── Alta ──────────────────────────────────────────────────────────────── */

  protected readonly nuevo = signal('');
  protected readonly objetivoNuevo = signal<string | null>(null);
  protected readonly bloqueo = signal<{ texto: string; delegacion: Delegacion } | null>(null);

  /* ── Corregir el texto de un pendiente ─────────────────────────────────── */

  protected readonly corrigiendo = signal<Pendiente | null>(null);
  protected readonly textoCorregido = signal('');
  protected readonly errorCorreccion = signal('');

  protected corregir(p: Pendiente): void {
    this.errorCorreccion.set('');
    this.textoCorregido.set(p.texto);
    this.corrigiendo.set(p);
  }

  protected async guardarCorreccion(): Promise<void> {
    const p = this.corrigiendo();
    const texto = this.textoCorregido().trim();
    if (!p || !texto) return;
    if (texto === p.texto) { this.corrigiendo.set(null); return; }

    // El mismo filtro que al escribirlo: corregir no puede ser la puerta de
    // atrás para meter en la bandeja algo que tiene otro dueño.
    const ev = evaluarPrioridad(texto);
    if (!ev.permitida && ev.delegacion) {
      this.errorCorreccion.set(
        `Así escrito es de ${ev.delegacion.duenoNombre}: ${ev.delegacion.tarea}.`);
      return;
    }
    await this.datos.actualizarPendiente(p.id, { texto });
    this.corrigiendo.set(null);
    this.avisos.mostrar('Corregido.');
  }

  protected async agregar(): Promise<void> {
    const texto = this.nuevo().trim();
    if (!texto) return;
    if (!hayLugar(this.todos())) {
      this.avisos.mostrar(`La bandeja está llena (${TOPE_BANDEJA}). Cerrá o delegá algo primero.`);
      return;
    }
    const ev = evaluarPrioridad(texto);
    if (!ev.permitida && ev.delegacion) {
      this.bloqueo.set({ texto, delegacion: ev.delegacion });
      return;
    }
    await this.datos.agregarPendiente({
      id: crypto.randomUUID(), texto, creado: Date.now(), estado: 'abierto',
      objetivoId: this.objetivoNuevo(), ultimaVezPrioridad: null,
    });
    this.nuevo.set('');
  }

  protected async derivarBloqueado(): Promise<void> {
    const b = this.bloqueo();
    if (!b) return;
    await this.datos.agregarDerivaciones([{
      id: crypto.randomUUID(), texto: b.texto, dueno: b.delegacion.dueno,
      duenoNombre: b.delegacion.duenoNombre, tarea: b.delegacion.tarea,
      fecha: this.hoy, origen: 'prioridad', avisado: false, creado: Date.now(),
    }]);
    this.avisos.mostrar(`Anotado para pasarle a ${b.delegacion.duenoNombre.split(' ')[0]}.`);
    this.bloqueo.set(null);
    this.nuevo.set('');
  }

  /* ── Las tres salidas ──────────────────────────────────────────────────── */

  /** Hacerlo: sube a las 3 prioridades de hoy. */
  protected async aPrioridad(p: Pendiente): Promise<void> {
    const prio = this.prioridadesHoy();
    if (prio.length >= 3) {
      this.avisos.mostrar('Ya tenés 3 prioridades hoy. Sacá una antes.');
      return;
    }
    const nueva: Prioridad = {
      id: crypto.randomUUID(), texto: p.texto, hecha: false, creado: Date.now(),
      categoria: evaluarPrioridad(p.texto).clasificacion.categoria,
      pendienteId: p.id, objetivoId: p.objetivoId ?? null,
    };
    await this.datos.guardarPrioridades(this.hoy, [...prio, nueva]);
    await this.datos.actualizarPendiente(p.id, { ultimaVezPrioridad: this.hoy });
    this.avisos.mostrar('Va como prioridad de hoy.');
  }

  protected async marcarHecho(p: Pendiente): Promise<void> {
    await this.datos.actualizarPendiente(p.id, { estado: 'hecho', cerrado: Date.now() });
    this.avisos.mostrar('Hecho.');
  }

  protected readonly delegando = signal<Pendiente | null>(null);

  protected async delegarA(dueno: PersonaId): Promise<void> {
    const p = this.delegando();
    if (!p) return;
    const nombre = this.cfg.reglas().personas[dueno]?.nombre ?? dueno;
    await this.datos.agregarDerivaciones([{
      id: crypto.randomUUID(), texto: p.texto, dueno,
      duenoNombre: nombre, tarea: 'Delegado desde pendientes',
      fecha: this.hoy, origen: 'prioridad', avisado: false, creado: Date.now(),
    }]);
    await this.datos.actualizarPendiente(p.id, {
      estado: 'delegado', cerrado: Date.now(), motivo: nombre,
    });
    this.delegando.set(null);
    this.avisos.mostrar(`Pasó a ${nombre.split(' ')[0]}.`);
  }

  protected readonly matando = signal<Pendiente | null>(null);
  protected readonly motivo = signal('');

  protected async matar(): Promise<void> {
    const p = this.matando();
    if (!p) return;
    await this.datos.actualizarPendiente(p.id, {
      estado: 'descartado', cerrado: Date.now(), motivo: this.motivo().trim(),
    });
    this.matando.set(null);
    this.motivo.set('');
    this.avisos.mostrar('Descartado. Una cosa menos.');
  }

  protected async cambiarObjetivo(p: Pendiente, objetivoId: string | null): Promise<void> {
    await this.datos.actualizarPendiente(p.id, { objetivoId });
  }

  protected async reabrir(p: Pendiente): Promise<void> {
    await this.datos.actualizarPendiente(p.id, {
      estado: 'abierto', cerrado: undefined, ultimaVezPrioridad: this.hoy,
    });
  }
}
