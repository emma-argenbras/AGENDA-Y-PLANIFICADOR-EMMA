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
import { bloqueDe, primerHueco, sinRepetidos, type Evento } from '../core/agenda';

/**
 * Cuánto vale una lectura ya hecha. Quince segundos alcanzan para que ir y
 * volver entre pestañas sea instantáneo, y son pocos para que algo cargado en
 * otro aparato tarde en aparecer más que antes.
 */
const FRESCO_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class Datos {
  private readonly local = inject(RepoLocal);
  readonly firebase = inject(Firebase);

  readonly cambios = signal(0);
  readonly modo = computed<'local' | 'nube'>(() => (this.#nube() ? 'nube' : 'local'));
  readonly sincronizando = signal(false);

  #nube = signal<RepoFirestore | null>(null);

  /**
   * Si ya se sabe dónde vive esta sesión: en la nube o en el aparato.
   *
   * Restaurar la sesión de Google tarda: hay que cargar la SDK y revalidar el
   * token contra la red. Hasta que eso termina, la app no sabe cuál de los dos
   * repositorios es el bueno —y antes contestaba «el del aparato», que a los
   * dos segundos dejaba de ser cierto—.
   *
   * El costo de esa mentira no era estético. Una prioridad cargada en esos
   * segundos se escribía en el teléfono y no subía nunca: quedaba invisible
   * desde cualquier otro aparato, sin ningún aviso. Ahora toda lectura y toda
   * escritura esperan a que esto se decida.
   */
  readonly decidido = signal(false);

  #resolverListo!: () => void;
  readonly #listo = new Promise<void>(r => { this.#resolverListo = r; });

  /** Lo escrito en el aparato mientras se esperaba a la nube, para subirlo después. */
  #huerfanas = new Set<string>();

  constructor() {
    // Sin proyecto configurado no hay nada que esperar: es local y punto.
    if (!this.firebase.hayConfig()) this.#decidir();

    // Y si la sesión no resuelve —sin señal, Google caído—, la app abre igual
    // contra el aparato. Esperar para siempre sería peor que trabajar local.
    setTimeout(() => this.#decidir(), 8000);

    effect(() => {
      const estado = this.firebase.estado();
      const uid = this.firebase.uid();
      const db = this.firebase.db();
      if (!uid || !db) {
        this.#nube.set(null);
        // 'conectando' todavía no dice nada: recién ahí se sabe que no hay sesión.
        if (estado === 'sin-config' || estado === 'desconectado' || estado === 'error') this.#decidir();
        return;
      }
      void import('firebase/firestore').then(async api => {
        const nube = new RepoFirestore(db, uid, api);
        await this.#rescatar(nube);
        this.#nube.set(nube);
        this.#decidir();
        this.#tocar();
      });
    });
  }

  #decidir(): void {
    if (this.decidido()) return;
    this.decidido.set(true);
    this.#resolverListo();
  }

  /**
   * Sube lo que quedó escrito en el aparato mientras la nube no estaba lista.
   * Con la espera de arriba esto casi nunca tiene trabajo; existe para el caso
   * en que la sesión llegó tarde, después de que la app se cansó de esperar.
   */
  async #rescatar(nube: RepoFirestore): Promise<void> {
    if (!this.#huerfanas.size) return;
    const claves = [...this.#huerfanas];
    this.#huerfanas.clear();
    for (const clave of claves) {
      const valor = await this.local.leer(clave);
      if (valor !== null) await nube.escribir(clave, valor).catch(() => { /* se reintenta al próximo cambio */ });
    }
  }

  /**
   * La única puerta a los datos. Espera a que se sepa cuál es el repositorio
   * bueno: leer del aparato mientras la nube carga muestra una app vacía, y
   * escribir ahí pierde el dato.
   */
  async #puerta(): Promise<Repositorio> {
    await this.#listo;
    return this.#nube() ?? this.local;
  }

  /* ── Caché de lectura ──────────────────────────────────────────────────── */

  /**
   * Cambiar de pestaña destruye la pantalla anterior y arma la siguiente de
   * cero, así que cada viaje volvía a pedir todo: la pantalla Hoy sola son
   * diez consultas, y en fila india contra la nube eso se siente como una
   * recarga cada vez.
   *
   * Quince segundos alcanzan para que ir y volver entre pestañas sea
   * instantáneo, y son pocos para que algo cargado en otro aparato aparezca
   * igual de rápido que antes. Cualquier escritura tira la caché entera: es
   * más barato volver a pedir que razonar qué quedó viejo.
   */
  #cache = new Map<string, { valor: unknown; hasta: number }>();

  #cacheado<T>(clave: string): { hay: boolean; valor: T } {
    const e = this.#cache.get(clave);
    if (!e || e.hasta < Date.now()) return { hay: false, valor: null as T };
    return { hay: true, valor: e.valor as T };
  }

  #guardarEnCache(clave: string, valor: unknown): void {
    this.#cache.set(clave, { valor, hasta: Date.now() + FRESCO_MS });
  }

  async #leer<T>(clave: string): Promise<T | null> {
    const c = this.#cacheado<T | null>(clave);
    if (c.hay) return c.valor;
    const valor = await (await this.#puerta()).leer<T>(clave);
    this.#guardarEnCache(clave, valor);
    return valor;
  }

  async #rango<T>(desde: string, hasta: string): Promise<Entrada<T>[]> {
    const clave = `\u0000rango\u0000${desde}\u0000${hasta}`;
    const c = this.#cacheado<Entrada<T>[]>(clave);
    if (c.hay) return c.valor;
    const filas = await (await this.#puerta()).rango<T>(desde, hasta);
    this.#guardarEnCache(clave, filas);
    return filas;
  }

  #tocar(): void {
    this.#cache.clear();
    this.cambios.update(v => v + 1);
  }

  async escribir<T>(clave: string, valor: T): Promise<void> {
    const repo = await this.#puerta();
    await repo.escribir(clave, valor);
    // Escrito en el aparato habiendo proyecto configurado: todavía puede subir.
    if (repo === this.local && this.firebase.hayConfig()) this.#huerfanas.add(clave);
    this.#tocar();
  }

  async borrar(clave: string): Promise<void> {
    await (await this.#puerta()).borrar(clave);
    this.#tocar();
  }

  /* ── Agenda ────────────────────────────────────────────────────────────── */

  /**
   * Al leer también se filtran los repetidos, no solo al guardar: lo que quedó
   * duplicado antes de que existiera esa defensa se ve una sola vez, sin tener
   * que ir a borrarlo a mano.
   */
  async eventos(fecha: string): Promise<Evento[]> {
    return sinRepetidos((await this.#leer<Evento[]>(K.agenda(fecha))) ?? []);
  }

  /**
   * Todos los eventos de un día pasan por acá.
   *
   * Guardar es leer-modificar-escribir, así que dos escrituras que se cruzan
   * —tocar «Guardar» dos veces, o la importación de Google corriendo mientras
   * creás algo— pueden dejar el mismo evento dos veces en la lista. Un id
   * repetido nunca son dos cosas distintas: se queda la última versión, en el
   * lugar donde ya estaba.
   */
  guardarEventos(fecha: string, es: Evento[]) {
    return this.escribir(K.agenda(fecha), sinRepetidos(es));
  }

  /** Eventos de un rango, con la fecha ya puesta en cada uno. */
  async eventosEntre(desde: string, hasta: string): Promise<Evento[]> {
    const filas = await this.#rango<Evento[]>(K.agenda(desde), K.agenda(hasta));
    return filas.flatMap(f =>
      sinRepetidos(f.valor ?? []).map(e => ({ ...e, fecha: f.clave.slice('agenda:'.length) })));
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

  async checkin(fecha: string) { return await this.#leer<Checkin>(K.checkin(fecha)); }
  guardarCheckin(fecha: string, ck: Checkin) { return this.escribir(K.checkin(fecha), ck); }
  borrarCheckin(fecha: string) { return this.borrar(K.checkin(fecha)); }

  /** Check-ins entre dos fechas, sin huecos que rompan los cálculos. */
  async checkinsEntre(desde: string, hasta: string): Promise<Checkin[]> {
    const filas: Entrada<Checkin>[] = await this.#rango<Checkin>(K.checkin(desde), K.checkin(hasta));
    return filas
      .map(f => ({ ...f.valor, fecha: f.clave.slice('checkin:'.length) }))
      .filter(c => Array.isArray(c.segmentos))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  /* ── Prioridades ───────────────────────────────────────────────────────── */

  /**
   * Prioridades de varios días, con su fecha puesta.
   *
   * Las prioridades se guardan por día, así que una que no se cerró ayer no
   * aparece en ningún lado hoy: no se perdió, quedó guardada bajo una fecha
   * que ya nadie mira. Eso se siente igual que perderla.
   */
  async prioridadesEntre(desde: string, hasta: string): Promise<(Prioridad & { fecha: string })[]> {
    const filas = await this.#rango<Prioridad[]>(
      K.prioridades(desde), K.prioridades(hasta));
    return filas.flatMap(f => (f.valor ?? []).map(p =>
      ({ ...p, fecha: f.clave.slice('prio:'.length) })));
  }

  /**
   * Corrige el texto de un objetivo de la semana.
   *
   * Un objetivo es un resultado, no una tarea: no pasa por la tabla de
   * delegación —«que Higiene no caiga» no tiene un dueño distinto de vos— así
   * que corregirlo es corregir el texto y nada más.
   */
  async renombrarObjetivo(lunes: string, id: string, texto: string): Promise<void> {
    const plan = await this.plan(lunes);
    if (!plan) return;
    await this.guardarPlan({
      ...plan,
      objetivos: plan.objetivos.map(o => (o.id === id ? { ...o, texto } : o)),
    });
  }

  /**
   * Corrige el texto de una prioridad, de hoy o de cualquier día.
   *
   * La categoría se recalcula con el texto nuevo: si no, una prioridad
   * corregida seguiría contando las horas donde la puso el texto viejo, que es
   * la clase de error que después no se encuentra.
   */
  async renombrarPrioridad(
    fecha: string, id: string, texto: string, categoria: string | null,
  ): Promise<void> {
    const dia = await this.prioridades(fecha);
    await this.guardarPrioridades(fecha,
      dia.map(p => (p.id === id ? { ...p, texto, categoria } : p)));
  }

  /** Marca hecha una prioridad de cualquier día, no solo del de hoy. */
  async cerrarPrioridad(fecha: string, id: string): Promise<void> {
    const dia = await this.prioridades(fecha);
    await this.guardarPrioridades(fecha, dia.map(p => (p.id === id ? { ...p, hecha: true } : p)));
  }

  /**
   * Trae a hoy algo que quedó abierto otro día. Se mueve, no se copia: dos
   * copias de la misma tarea en dos días es la forma más rápida de que ninguna
   * de las dos se sienta real.
   */
  async traerAHoy(fecha: string, id: string, hoy: string): Promise<'ok' | 'lleno' | 'no-esta'> {
    const dia = await this.prioridades(fecha);
    const p = dia.find(x => x.id === id);
    if (!p) return 'no-esta';
    const deHoy = await this.prioridades(hoy);
    if (deHoy.filter(x => !x.hecha).length >= 3) return 'lleno';
    await this.guardarPrioridades(fecha, dia.filter(x => x.id !== id));
    await this.guardarPrioridades(hoy, [...deHoy, { ...p, creado: Date.now() }]);
    return 'ok';
  }

  async prioridades(fecha: string): Promise<Prioridad[]> {
    return (await this.#leer<Prioridad[]>(K.prioridades(fecha))) ?? [];
  }
  guardarPrioridades(fecha: string, p: Prioridad[]) { return this.escribir(K.prioridades(fecha), p); }

  /* ── Reuniones y actas ─────────────────────────────────────────────────── */

  async reuniones(): Promise<Reunion[]> { return (await this.#leer<Reunion[]>(K.reuniones)) ?? []; }
  guardarReuniones(r: Reunion[]) { return this.escribir(K.reuniones, r); }

  /* ── Derivaciones ──────────────────────────────────────────────────────── */

  async derivaciones(): Promise<Derivacion[]> { return (await this.#leer<Derivacion[]>(K.derivaciones)) ?? []; }
  guardarDerivaciones(d: Derivacion[]) { return this.escribir(K.derivaciones, d); }

  async agregarDerivaciones(nuevas: Derivacion[]): Promise<void> {
    if (!nuevas.length) return;
    await this.guardarDerivaciones([...nuevas, ...(await this.derivaciones())]);
  }

  /* ── Bandeja de pendientes ─────────────────────────────────────────────── */

  async pendientes(): Promise<Pendiente[]> {
    return (await this.#leer<Pendiente[]>(K.pendientes)) ?? [];
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

  async plan(lunes: string) { return await this.#leer<PlanSemana>(K.plan(lunes)); }
  guardarPlan(plan: PlanSemana) { return this.escribir(K.plan(plan.lunes), plan); }

  /* ── Prueba de Luciana ─────────────────────────────────────────────────── */

  async prueba(id = 'luciana_2026_08'): Promise<RegistrosPrueba> {
    return (await this.#leer<RegistrosPrueba>(K.prueba(id))) ?? {};
  }
  guardarPrueba(p: RegistrosPrueba, id = 'luciana_2026_08') { return this.escribir(K.prueba(id), p); }

  /** Qué pruebas de rol ya tienen la decisión tomada. */
  async cierresDePruebas(ids: readonly string[]): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    for (const id of ids) out[id] = Boolean((await this.prueba(id)).__cierre);
    return out;
  }

  /* ── Indicadores ───────────────────────────────────────────────────────── */

  async indicadores(): Promise<FilaIndicadores[]> {
    return (await this.#leer<FilaIndicadores[]>(K.indicadores)) ?? [];
  }
  guardarIndicadores(i: FilaIndicadores[]) { return this.escribir(K.indicadores, i); }

  /* ── Documentos de Drive ───────────────────────────────────────────────── */

  async docsIndice(): Promise<DocIndexado[]> { return (await this.#leer<DocIndexado[]>(K.docsIndice)) ?? []; }
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

  /* ── Configuración (las reglas editables) ──────────────────────────────── */

  async config<T>(): Promise<T | null> { return await this.#leer<T>(K.config); }
  guardarConfig<T>(c: T) { return this.escribir(K.config, c); }

  /* ── Ajustes ───────────────────────────────────────────────────────────── */

  async ajustes(): Promise<Ajustes> {
    const guardado = (await this.#leer<Partial<Ajustes>>(K.ajustes)) ?? {};
    const a = { ...AJUSTES_POR_DEFECTO, ...guardado };
    // Un campo vacío guardado en versiones anteriores no tapa el valor de fábrica.
    if (!a.driveClientId) a.driveClientId = AJUSTES_POR_DEFECTO.driveClientId;
    if (!a.driveFolderId) a.driveFolderId = AJUSTES_POR_DEFECTO.driveFolderId;
    return a;
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
   * Desde qué día cuenta la app.
   *
   * `primerUso` lo pone la app sola la primera vez que abrís. `inicio` lo
   * ponés vos, y gana: sirve para arrancar de cero sin borrar nada, que es lo
   * que hace falta cuando la app te reclama semanas que ocurrieron antes de
   * que la usaras. Un reclamo por algo anterior al primer día es la forma más
   * rápida de que dejes de mirar los avisos.
   */
  async desdeCuando(): Promise<string | null> {
    const a = await this.ajustes();
    return a.inicio ?? a.primerUso ?? null;
  }

  /** Empezar a contar desde hoy. No borra un solo dato: solo corre la línea. */
  async arrancarHoy(): Promise<string> {
    const hoy = hoyISO();
    await this.guardarAjustes({ inicio: hoy });
    return hoy;
  }

  /**
   * Días hábiles seguidos sin cierre de jornada, mirando hacia atrás.
   * Nunca cruza la fecha de arranque: sería inventar una deuda.
   */
  async rachaSinRegistro(desde: string): Promise<number> {
    const inicio = await this.desdeCuando();
    let racha = 0;
    let f = desde;
    for (let i = 0; i < 30; i++) {
      if (inicio && f < inicio) break;
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
    for (const clave of await (await this.#puerta()).claves()) {
      if (clave.startsWith('doc:') || clave.startsWith('drive:')) continue;
      datos[clave] = await (await this.#puerta()).leer(clave);
    }
    return { app: 'agenda-emma', version: 2, exportado: new Date().toISOString(), datos };
  }

  async importar(json: unknown): Promise<number> {
    const j = json as { app?: string; datos?: Record<string, unknown> };
    if (j?.app !== 'agenda-emma') throw new Error('Ese archivo no es un backup de esta app.');
    let n = 0;
    for (const [clave, valor] of Object.entries(j.datos ?? {})) {
      await (await this.#puerta()).escribir(clave, valor);
      n++;
    }
    this.#tocar();
    return n;
  }

  /** Sube lo que hay en este dispositivo a la nube. Se usa una sola vez. */
  async subirLocalALaNube(): Promise<{ subidas: number; yaEstaban: number }> {
    const nube = this.#nube();
    if (!nube) throw new Error('Primero entrá con tu cuenta de Google.');
    this.sincronizando.set(true);
    try {
      let subidas = 0;
      let yaEstaban = 0;
      for (const clave of await this.local.claves()) {
        // El texto de los documentos y la llave de Google no van a la nube.
        if (clave.startsWith('doc:') || clave.startsWith('drive:')) continue;
        const valor = await this.local.leer(clave);
        if (valor === null) continue;
        // Lo que la nube ya tiene no se pisa. Sin esto, una copia vieja que
        // quedó en un aparato podría tapar algo más nuevo cargado en otro, y
        // la única forma de darse cuenta sería extrañar el dato.
        if ((await nube.leer(clave)) !== null) { yaEstaban++; continue; }
        await nube.escribir(clave, valor);
        subidas++;
      }
      this.#tocar();
      return { subidas, yaEstaban };
    } finally {
      this.sincronizando.set(false);
    }
  }

  /**
   * Borra los datos de los dos lados.
   *
   * Antes vaciaba solo el que estuviera activo: borrando desde la nube, la
   * copia del aparato quedaba entera y volvía a aparecer en cuanto la app
   * arrancaba sin sesión. Un «borrar todo» que deja cosas es peor que no
   * tenerlo, porque el que lo usó se quedó tranquilo.
   */
  async borrarTodo(): Promise<void> {
    const repo = await this.#puerta();
    for (const clave of await repo.claves()) await repo.borrar(clave);
    if (repo !== this.local) {
      for (const clave of await this.local.claves()) await this.local.borrar(clave);
    }
    this.#tocar();
  }
}
