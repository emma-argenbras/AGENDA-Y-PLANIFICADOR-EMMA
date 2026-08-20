/**
 * datos.ts — La única puerta a los datos para toda la app.
 *
 * Elige solo dónde guardar: si hay sesión de Firebase, en la nube; si no, en
 * este dispositivo. Las pantallas nunca preguntan cuál está activo.
 *
 * `cambios` es un contador que sube en cada escritura: las vistas lo usan como
 * dependencia de sus `resource()` y se recalculan solas.
 */

import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Firebase } from './firebase';
import { RepoLocal } from './repo-local';
import { RepoFirestore } from './repo-firestore';
import { K, type Entrada, type Repositorio } from './repositorio';
import { esFinDeSemana, hoyISO, sumarDias } from '../core/fechas';
import {
  AJUSTES_POR_DEFECTO, type Ajustes, type Checkin, type Derivacion,
  type DocIndexado, type FilaIndicadores, type Prioridad, type Reunion,
} from '../core/modelo';
import type { RegistrosPrueba } from '../core/prueba-luciana';
import type { Pendiente, PlanSemana } from '../core/pendientes';
import { bloqueDe, primerHueco, type Evento } from '../core/agenda';

@Injectable({ providedIn: 'root' })
export class Datos {
  private readonly local = inject(RepoLocal);
  readonly firebase = inject(Firebase);

  readonly cambios = signal(0);
  readonly modo = computed<'local' | 'nube'>(() => (this.#nube() ? 'nube' : 'local'));
  readonly sincronizando = signal(false);

  #nube = signal<RepoFirestore | null>(null);

  constructor() {
    effect(() => {
      const uid = this.firebase.uid();
      const db = this.firebase.db();
      if (!uid || !db) { this.#nube.set(null); return; }
      void import('firebase/firestore').then(api => {
        this.#nube.set(new RepoFirestore(db, uid, api));
        this.cambios.update(v => v + 1);
      });
    });
  }

  get repo(): Repositorio { return this.#nube() ?? this.local; }

  #tocar(): void { this.cambios.update(v => v + 1); }

  async escribir<T>(clave: string, valor: T): Promise<void> {
    await this.repo.escribir(clave, valor);
    this.#tocar();
  }

  async borrar(clave: string): Promise<void> {
    await this.repo.borrar(clave);
    this.#tocar();
  }

  /* ── Agenda ────────────────────────────────────────────────────────────── */

  async eventos(fecha: string): Promise<Evento[]> {
    return (await this.repo.leer<Evento[]>(K.agenda(fecha))) ?? [];
  }

  guardarEventos(fecha: string, es: Evento[]) { return this.escribir(K.agenda(fecha), es); }

  /** Eventos de un rango, con la fecha ya puesta en cada uno. */
  async eventosEntre(desde: string, hasta: string): Promise<Evento[]> {
    const filas = await this.repo.rango<Evento[]>(K.agenda(desde), K.agenda(hasta));
    return filas.flatMap(f => (f.valor ?? []).map(e => ({ ...e, fecha: f.clave.slice('agenda:'.length) })));
  }

  async agregarEvento(e: Evento): Promise<void> {
    await this.guardarEventos(e.fecha, [...(await this.eventos(e.fecha)), e]);
  }

  async actualizarEvento(fecha: string, id: string, cambio: Partial<Evento>): Promise<void> {
    await this.guardarEventos(fecha,
      (await this.eventos(fecha)).map(e => (e.id === id ? { ...e, ...cambio } : e)));
  }

  /**
   * Reserva una hora para algo de la bandeja, en el primer hueco libre del día.
   * Devuelve el evento creado, o null si ese día ya no entra nada.
   */
  async reservarBloque(
    texto: string, fecha: string, pendienteId?: string, prioridadId?: string,
  ): Promise<Evento | null> {
    const delDia = await this.eventos(fecha);
    const hora = primerHueco(delDia, 60);
    if (!hora) return null;
    const e = bloqueDe(texto, fecha, hora, pendienteId, prioridadId);
    await this.guardarEventos(fecha, [...delDia, e]);
    return e;
  }

  async borrarEvento(fecha: string, id: string): Promise<void> {
    await this.guardarEventos(fecha, (await this.eventos(fecha)).filter(e => e.id !== id));
  }

  /* ── Cierre de jornada ─────────────────────────────────────────────────── */

  checkin(fecha: string) { return this.repo.leer<Checkin>(K.checkin(fecha)); }
  guardarCheckin(fecha: string, ck: Checkin) { return this.escribir(K.checkin(fecha), ck); }
  borrarCheckin(fecha: string) { return this.borrar(K.checkin(fecha)); }

  /** Check-ins entre dos fechas, sin huecos que rompan los cálculos. */
  async checkinsEntre(desde: string, hasta: string): Promise<Checkin[]> {
    const filas: Entrada<Checkin>[] = await this.repo.rango<Checkin>(K.checkin(desde), K.checkin(hasta));
    return filas
      .map(f => ({ ...f.valor, fecha: f.clave.slice('checkin:'.length) }))
      .filter(c => Array.isArray(c.segmentos))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  /* ── Prioridades ───────────────────────────────────────────────────────── */

  async prioridades(fecha: string): Promise<Prioridad[]> {
    return (await this.repo.leer<Prioridad[]>(K.prioridades(fecha))) ?? [];
  }
  guardarPrioridades(fecha: string, p: Prioridad[]) { return this.escribir(K.prioridades(fecha), p); }

  /* ── Reuniones y actas ─────────────────────────────────────────────────── */

  async reuniones(): Promise<Reunion[]> { return (await this.repo.leer<Reunion[]>(K.reuniones)) ?? []; }
  guardarReuniones(r: Reunion[]) { return this.escribir(K.reuniones, r); }

  /* ── Derivaciones ──────────────────────────────────────────────────────── */

  async derivaciones(): Promise<Derivacion[]> { return (await this.repo.leer<Derivacion[]>(K.derivaciones)) ?? []; }
  guardarDerivaciones(d: Derivacion[]) { return this.escribir(K.derivaciones, d); }

  async agregarDerivaciones(nuevas: Derivacion[]): Promise<void> {
    if (!nuevas.length) return;
    await this.guardarDerivaciones([...nuevas, ...(await this.derivaciones())]);
  }

  /* ── Bandeja de pendientes ─────────────────────────────────────────────── */

  async pendientes(): Promise<Pendiente[]> {
    return (await this.repo.leer<Pendiente[]>(K.pendientes)) ?? [];
  }
  guardarPendientes(p: Pendiente[]) { return this.escribir(K.pendientes, p); }

  async agregarPendiente(p: Pendiente): Promise<void> {
    await this.guardarPendientes([...(await this.pendientes()), p]);
  }

  async actualizarPendiente(id: string, cambio: Partial<Pendiente>): Promise<void> {
    await this.guardarPendientes(
      (await this.pendientes()).map(p => (p.id === id ? { ...p, ...cambio } : p)));
  }

  /* ── Plan de la semana ─────────────────────────────────────────────────── */

  plan(lunes: string) { return this.repo.leer<PlanSemana>(K.plan(lunes)); }
  guardarPlan(plan: PlanSemana) { return this.escribir(K.plan(plan.lunes), plan); }

  /* ── Prueba de Luciana ─────────────────────────────────────────────────── */

  async prueba(): Promise<RegistrosPrueba> { return (await this.repo.leer<RegistrosPrueba>(K.prueba)) ?? {}; }
  guardarPrueba(p: RegistrosPrueba) { return this.escribir(K.prueba, p); }

  /* ── Indicadores ───────────────────────────────────────────────────────── */

  async indicadores(): Promise<FilaIndicadores[]> {
    return (await this.repo.leer<FilaIndicadores[]>(K.indicadores)) ?? [];
  }
  guardarIndicadores(i: FilaIndicadores[]) { return this.escribir(K.indicadores, i); }

  /* ── Documentos de Drive ───────────────────────────────────────────────── */

  async docsIndice(): Promise<DocIndexado[]> { return (await this.repo.leer<DocIndexado[]>(K.docsIndice)) ?? []; }
  guardarDocsIndice(d: DocIndexado[]) { return this.escribir(K.docsIndice, d); }
  /**
   * El permiso de Google (Drive y Calendar) NUNCA sale de este dispositivo.
   * Guardarlo en la nube sería subir a una base una llave que abre tu Drive:
   * aunque las reglas la protejan, el token no tiene por qué viajar. Además se
   * vence en una hora y se vuelve a pedir solo, así que no hay nada que ganar.
   */
  tokenGoogle<T>() { return this.local.leer<T>(K.driveToken); }
  guardarTokenGoogle<T>(t: T) { return this.local.escribir(K.driveToken, t); }
  borrarTokenGoogle() { return this.local.borrar(K.driveToken); }

  /** El texto de los documentos siempre queda local: es mucho volumen y se re-baja. */
  doc(id: string) { return this.local.leer<string>(K.doc(id)); }
  guardarDoc(id: string, texto: string) { return this.local.escribir(K.doc(id), texto); }
  borrarDoc(id: string) { return this.local.borrar(K.doc(id)); }

  /* ── Ajustes ───────────────────────────────────────────────────────────── */

  async ajustes(): Promise<Ajustes> {
    return { ...AJUSTES_POR_DEFECTO, ...((await this.repo.leer<Partial<Ajustes>>(K.ajustes)) ?? {}) };
  }

  async guardarAjustes(parcial: Partial<Ajustes>): Promise<Ajustes> {
    const a = { ...(await this.ajustes()), ...parcial };
    await this.escribir(K.ajustes, a);
    return a;
  }

  async marcarPrimerUso(): Promise<void> {
    const a = await this.ajustes();
    if (!a.primerUso) await this.guardarAjustes({ primerUso: hoyISO() });
  }

  /**
   * Días hábiles seguidos sin cierre de jornada, mirando hacia atrás.
   * Nunca cuenta días anteriores al primer uso: sería inventar una deuda.
   */
  async rachaSinRegistro(desde: string): Promise<number> {
    const { primerUso } = await this.ajustes();
    let racha = 0;
    let f = desde;
    for (let i = 0; i < 30; i++) {
      if (primerUso && f < primerUso) break;
      if (!esFinDeSemana(f)) {
        if (await this.checkin(f)) break;
        racha++;
      }
      f = sumarDias(f, -1);
    }
    return racha;
  }

  /* ── Backup y migración ────────────────────────────────────────────────── */

  async exportar(): Promise<object> {
    const datos: Record<string, unknown> = {};
    for (const clave of await this.repo.claves()) {
      if (clave.startsWith('doc:') || clave.startsWith('drive:')) continue;
      datos[clave] = await this.repo.leer(clave);
    }
    return { app: 'agenda-emma', version: 2, exportado: new Date().toISOString(), datos };
  }

  async importar(json: unknown): Promise<number> {
    const j = json as { app?: string; datos?: Record<string, unknown> };
    if (j?.app !== 'agenda-emma') throw new Error('Ese archivo no es un backup de esta app.');
    let n = 0;
    for (const [clave, valor] of Object.entries(j.datos ?? {})) {
      await this.repo.escribir(clave, valor);
      n++;
    }
    this.#tocar();
    return n;
  }

  /** Sube lo que hay en este dispositivo a la nube. Se usa una sola vez. */
  async subirLocalALaNube(): Promise<number> {
    const nube = this.#nube();
    if (!nube) throw new Error('Primero entrá con tu cuenta de Google.');
    this.sincronizando.set(true);
    try {
      let n = 0;
      for (const clave of await this.local.claves()) {
        if (clave.startsWith('doc:') || clave.startsWith('drive:')) continue;
        const valor = await this.local.leer(clave);
        if (valor === null) continue;
        await nube.escribir(clave, valor);
        n++;
      }
      this.#tocar();
      return n;
    } finally {
      this.sincronizando.set(false);
    }
  }

  async borrarTodo(): Promise<void> {
    for (const clave of await this.repo.claves()) await this.repo.borrar(clave);
    this.#tocar();
  }
}
