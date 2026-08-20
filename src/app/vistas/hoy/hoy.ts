/**
 * hoy.ts — La pantalla que se usa treinta segundos por día.
 *
 * Dos cosas y nada más: las 3 prioridades (filtradas contra la tabla de
 * delegación) y el cierre de jornada de una sola pregunta.
 */

import { Component, computed, inject, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Datos } from '../../data/datos';
import { Avisos } from '../../ui/avisos';
import { Dialogo } from '../../ui/dialogo';
import { Tema } from '../../ui/tema';
import { clasificarCheckin, evaluarPrioridad, type Delegacion, type Segmento } from '../../core/clasificador';
import { CATEGORIAS, CAT, type CategoriaId } from '../../core/reglas';
import { esFinDeSemana, fechaCorta, fechaLarga, hoyISO, inicioSemana, sumarDias } from '../../core/fechas';
import { esTuyo, ordenar, type Pendiente } from '../../core/pendientes';
import { TIPO, aHora, aMinutos, ordenarDia, type Evento } from '../../core/agenda';
import { estadoPrueba } from '../../core/prueba-luciana';
import { PRUEBAS, pruebaActiva, pruebasConRevision } from '../../core/pruebas';
import { estadoSemanal } from '../../core/semana';
import type { Checkin, Derivacion, Prioridad } from '../../core/modelo';

const MAX = 3;

interface Reconocedor {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

@Component({
  selector: 'app-hoy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Dialogo],
  templateUrl: './hoy.html',
  styleUrl: './hoy.css',
})
export class Hoy {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);
  protected readonly tema = inject(Tema);

  protected readonly hoy = hoyISO();
  protected readonly fechaLarga = fechaLarga(this.hoy);
  protected readonly categorias = CATEGORIAS;
  /** Revisión de una prueba en curso que cae hoy, si hay alguna. */
  protected readonly revisionHoy = computed(() =>
    pruebasConRevision(this.hoy, this.datosDelDia.value()?.cierres ?? {})[0] ?? null);

  protected readonly texto = signal('');
  protected readonly dictando = signal(false);
  protected readonly puedeDictar = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  /* ── Datos ─────────────────────────────────────────────────────────────── */

  private readonly datosDelDia = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: async () => ({
      prioridades: await this.datos.prioridades(this.hoy),
      checkin: await this.datos.checkin(this.hoy),
      racha: await this.datos.rachaSinRegistro(sumarDias(this.hoy, -1)),
      ultimos: await this.#ultimosDias(),
      plan: await this.datos.plan(inicioSemana(this.hoy)),
      eventos: await this.datos.eventos(this.hoy),
      cierres: await this.datos.cierresDePruebas(PRUEBAS.map(p => p.id)),
      planProximo: await this.datos.plan(sumarDias(inicioSemana(this.hoy), 7)),
      pendientes: await this.datos.pendientes(),
      reuniones: await this.datos.reuniones(),
    }),
  });

  protected readonly cargando = computed(() => this.datosDelDia.isLoading());
  protected readonly prioridades = computed(() => this.datosDelDia.value()?.prioridades ?? []);
  protected readonly checkin = computed(() => this.datosDelDia.value()?.checkin ?? null);
  protected readonly racha = computed(() => this.datosDelDia.value()?.racha ?? 0);
  protected readonly ultimos = computed(() => this.datosDelDia.value()?.ultimos ?? []);
  protected readonly totalHoy = computed(() =>
    (this.checkin()?.segmentos ?? []).reduce((a, s) => a + (s.horas || 0), 0));

  /* ── Tu día ────────────────────────────────────────────────────────────── */

  protected readonly eventos = computed<Evento[]>(() =>
    ordenarDia(this.datosDelDia.value()?.eventos ?? []));

  protected readonly horasAgendadas = computed(() =>
    Math.round((this.eventos().reduce((s, e) => s + e.minutos, 0) / 60) * 10) / 10);

  /** Lo que todavía no pasó, que es lo único que sirve mirar a mitad de día. */
  protected readonly proximos = computed(() => {
    const ahora = new Date().getHours() * 60 + new Date().getMinutes();
    return this.eventos().filter(e => aMinutos(e.hora) + e.minutos >= ahora);
  });

  protected fin(e: Evento): string { return aHora(aMinutos(e.hora) + e.minutos); }

  protected colorEvento(e: Evento): string {
    const c = CAT[TIPO[e.tipo].categoria];
    return this.tema.oscuro() ? c.colorOscuro : c.color;
  }

  /** La prueba salió de las pestañas: si hay algo vencido, se avisa acá. */
  private readonly registrosActiva = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: async () => {
      const cierres = await this.datos.cierresDePruebas(PRUEBAS.map(p => p.id));
      const activa = pruebaActiva(cierres);
      return activa ? { activa, registros: await this.datos.prueba(activa.id) } : null;
    },
  });

  protected readonly pruebaVencida = computed(() => {
    const r = this.registrosActiva.value();
    return r ? estadoPrueba(this.hoy, r.registros, r.activa).vencidas : 0;
  });

  /** Viernes o domingo: la app te lleva al ritual semanal en vez de esperarte. */
  protected readonly ritual = computed(() => estadoSemanal(
    this.hoy,
    this.datosDelDia.value()?.plan ?? null,
    this.datosDelDia.value()?.planProximo ?? null,
  ));

  /* ── El plan de la semana, atado al día ────────────────────────────────── */

  protected readonly objetivos = computed(() => this.datosDelDia.value()?.plan?.objetivos ?? []);

  /** Prioridades de hoy que no aportan a ningún objetivo de la semana. */
  protected readonly sinRumbo = computed(() =>
    this.objetivos().length > 0
    && this.prioridades().length > 0
    && !this.prioridades().some(p => p.objetivoId));

  protected nombreObjetivo(id: string | null | undefined): string {
    return this.objetivos().find(o => o.id === id)?.texto ?? '';
  }

  /* ── La bandeja, a un toque ────────────────────────────────────────────── */

  protected readonly eligiendo = signal(false);
  protected readonly bandeja = computed<Pendiente[]>(() => {
    const yaEstan = new Set(this.prioridades().map(p => p.pendienteId).filter(Boolean));
    return ordenar(this.datosDelDia.value()?.pendientes ?? [], this.hoy)
      .filter(p => !yaEstan.has(p.id));
  });

  protected async desdeBandeja(p: Pendiente): Promise<void> {
    if (this.prioridades().length >= MAX) {
      this.avisos.mostrar('Ya tenés 3. Sacá una antes de agregar otra.');
      return;
    }
    await this.datos.guardarPrioridades(this.hoy, [...this.prioridades(), {
      id: crypto.randomUUID(), texto: p.texto, hecha: false, creado: Date.now(),
      categoria: evaluarPrioridad(p.texto).clasificacion.categoria,
      pendienteId: p.id, objetivoId: p.objetivoId ?? null,
    }]);
    await this.datos.actualizarPendiente(p.id, { ultimaVezPrioridad: this.hoy });
    this.eligiendo.set(false);
  }

  /* ── Compromisos de actas que caen hoy ─────────────────────────────────── */

  protected readonly compromisos = computed(() => {
    return (this.datosDelDia.value()?.reuniones ?? [])
      .flatMap(r => (r.acta ?? []).map((a, idx) => ({ ...a, reunion: r.titulo, reunionId: r.id, idx })))
      .filter(c => !c.hecho && c.cuando && c.cuando <= this.hoy && esTuyo(c.quien))
      .sort((a, b) => a.cuando.localeCompare(b.cuando));
  });

  protected readonly fechaCorta = fechaCorta;
  protected vencido(cuando: string): boolean { return cuando < this.hoy; }

  protected async cumplirCompromiso(reunionId: string, idx: number): Promise<void> {
    const reuniones = this.datosDelDia.value()?.reuniones ?? [];
    await this.datos.guardarReuniones(reuniones.map(r => r.id === reunionId
      ? { ...r, acta: r.acta.map((a, j) => (j === idx ? { ...a, hecho: true } : a)) }
      : r));
    this.avisos.mostrar('Compromiso cumplido.');
  }

  async #ultimosDias() {
    const desde = sumarDias(this.hoy, -7);
    const previos = await this.datos.checkinsEntre(desde, sumarDias(this.hoy, -1));
    return Array.from({ length: 7 }, (_, i) => {
      const fecha = sumarDias(this.hoy, -i - 1);
      const ck = previos.find(c => c.fecha === fecha) ?? null;
      return {
        fecha,
        etiqueta: fechaLarga(fecha),
        finde: esFinDeSemana(fecha),
        resumen: ck ? ck.texto.slice(0, 70) : (esFinDeSemana(fecha) ? 'Fin de semana' : 'Sin registro'),
        horas: ck ? ck.segmentos.reduce((a, s) => a + (s.horas || 0), 0) : 0,
        hay: Boolean(ck),
      };
    });
  }

  /* ── Prioridades ───────────────────────────────────────────────────────── */

  protected readonly nueva = signal('');
  protected readonly objetivoElegido = signal<string | null>(null);
  protected readonly bloqueo = signal<{ texto: string; delegacion: Delegacion } | null>(null);

  protected async agregar(): Promise<void> {
    const texto = this.nueva().trim();
    if (!texto) return;
    if (this.prioridades().length >= MAX) {
      this.avisos.mostrar('Ya tenés 3. Sacá una antes de agregar otra.');
      return;
    }
    const ev = evaluarPrioridad(texto);
    if (!ev.permitida && ev.delegacion) {
      this.bloqueo.set({ texto, delegacion: ev.delegacion });
      return;
    }
    const p: Prioridad = {
      id: crypto.randomUUID(), texto, hecha: false, creado: Date.now(),
      categoria: ev.clasificacion.categoria,
      objetivoId: this.objetivoElegido(),
    };
    await this.datos.guardarPrioridades(this.hoy, [...this.prioridades(), p]);
    this.nueva.set('');
  }

  protected async alternar(p: Prioridad): Promise<void> {
    const hecha = !p.hecha;
    await this.datos.guardarPrioridades(this.hoy,
      this.prioridades().map(x => (x.id === p.id ? { ...x, hecha } : x)));
    // Si salió de la bandeja, se cierra sola: una cosa hecha se marca una vez.
    if (p.pendienteId) {
      await this.datos.actualizarPendiente(p.pendienteId, hecha
        ? { estado: 'hecho', cerrado: Date.now() }
        : { estado: 'abierto', cerrado: undefined });
    }
  }

  /** Le pone hora a una prioridad, en el primer hueco libre de hoy. */
  protected async reservar(p: Prioridad): Promise<void> {
    if (this.bloqueDe(p)) return;
    const e = await this.datos.reservarBloque(p.texto, this.hoy, p.pendienteId ?? undefined, p.id);
    this.avisos.mostrar(e
      ? `Bloque reservado ${e.hora}.`
      : 'Hoy ya no entra un bloque de una hora.');
  }

  protected bloqueDe(p: Prioridad): Evento | null {
    return this.eventos().find(e => e.prioridadId === p.id
      || (!!p.pendienteId && e.pendienteId === p.pendienteId)) ?? null;
  }

  protected async quitar(p: Prioridad): Promise<void> {
    await this.datos.guardarPrioridades(this.hoy, this.prioridades().filter(x => x.id !== p.id));
  }

  protected async derivarBloqueada(): Promise<void> {
    const b = this.bloqueo();
    if (!b) return;
    await this.datos.agregarDerivaciones([{
      id: crypto.randomUUID(), texto: b.texto, dueno: b.delegacion.dueno,
      duenoNombre: b.delegacion.duenoNombre, tarea: b.delegacion.tarea,
      fecha: this.hoy, origen: 'prioridad', avisado: false, creado: Date.now(),
    }]);
    this.avisos.mostrar(`Anotado para pasarle a ${this.primerNombre(b.delegacion.duenoNombre)}.`);
    this.bloqueo.set(null);
    this.nueva.set('');
  }

  protected primerNombre(n: string): string { return n.split(' ')[0] ?? n; }
  protected nombreCategoria(id: string | null): string { return id ? CAT[id as CategoriaId].nombre : ''; }

  /* ── Cierre de jornada ─────────────────────────────────────────────────── */

  protected readonly editor = signal<{ fecha: string; texto: string; segmentos: Segmento[] } | null>(null);
  protected readonly totalEditor = computed(() =>
    (this.editor()?.segmentos ?? []).reduce((a, s) => a + s.horas, 0));

  protected async abrirEditor(): Promise<void> {
    const texto = this.texto().trim();
    if (!texto) { this.avisos.mostrar('Escribí una frase, aunque sea corta.'); return; }
    await this.#editar(this.hoy, texto);
  }

  async #editar(fecha: string, texto: string): Promise<void> {
    const { horasDiaPorDefecto } = await this.datos.ajustes();
    const { segmentos } = clasificarCheckin(texto, horasDiaPorDefecto);
    this.editor.set({ fecha, texto, segmentos });
  }

  protected ajustarHoras(s: Segmento, delta: number): void {
    const e = this.editor();
    if (!e) return;
    this.editor.set({
      ...e,
      segmentos: e.segmentos.map(x =>
        x === s ? { ...x, horas: Math.min(16, Math.max(0.5, x.horas + delta)) } : x),
    });
  }

  /** La categoría forzada por la regla 3.3 no se puede tocar, a propósito. */
  protected elegirCategoria(s: Segmento, id: CategoriaId): void {
    const e = this.editor();
    if (!e || s.forzada) return;
    this.editor.set({ ...e, segmentos: e.segmentos.map(x => (x === s ? { ...x, categoria: id } : x)) });
  }

  protected async confirmar(): Promise<void> {
    const e = this.editor();
    if (!e) return;
    const ck: Checkin = {
      fecha: e.fecha, texto: e.texto, segmentos: e.segmentos,
      creado: Date.now(), actualizado: Date.now(),
    };
    await this.datos.guardarCheckin(e.fecha, ck);

    const derivaciones: Derivacion[] = e.segmentos
      .filter(s => s.delegacion)
      .map(s => ({
        id: crypto.randomUUID(), texto: s.texto, dueno: s.delegacion!.dueno,
        duenoNombre: s.delegacion!.duenoNombre, tarea: s.delegacion!.tarea,
        fecha: e.fecha, origen: 'checkin' as const, avisado: false,
        creado: Date.now(), horas: s.horas,
      }));
    await this.datos.agregarDerivaciones(derivaciones);

    this.editor.set(null);
    this.texto.set('');
    this.avisos.mostrar('Cierre guardado.');
  }

  protected async reabrir(): Promise<void> {
    const ck = this.checkin();
    if (ck) this.editor.set({ fecha: this.hoy, texto: ck.texto, segmentos: ck.segmentos.map(s => ({ ...s })) });
  }

  protected async borrarCierre(): Promise<void> {
    await this.datos.borrarCheckin(this.hoy);
    this.avisos.mostrar('Cierre borrado.');
  }

  /* ── Días anteriores ───────────────────────────────────────────────────── */

  protected readonly diaPasado = signal<string | null>(null);
  protected readonly textoPasado = signal('');

  protected async guardarDiaPasado(): Promise<void> {
    const fecha = this.diaPasado();
    const texto = this.textoPasado().trim();
    if (!fecha || !texto) return;
    this.diaPasado.set(null);
    this.textoPasado.set('');
    await this.#editar(fecha, texto);
  }

  /* ── Dictado ───────────────────────────────────────────────────────────── */

  #rec: Reconocedor | null = null;

  protected dictar(): void {
    if (this.dictando()) { this.#rec?.stop(); return; }
    const Ctor = (window as unknown as Record<string, new () => Reconocedor>)['SpeechRecognition']
      ?? (window as unknown as Record<string, new () => Reconocedor>)['webkitSpeechRecognition'];
    if (!Ctor) return;
    const rec = new Ctor();
    this.#rec = rec;
    rec.lang = 'es-AR';
    rec.interimResults = true;
    rec.continuous = false;
    const base = this.texto() ? this.texto().trim() + ' ' : '';
    rec.onresult = e => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i]?.[0]?.transcript ?? '';
      this.texto.set(base + t);
    };
    rec.onerror = () => { this.dictando.set(false); this.avisos.mostrar('No se pudo usar el micrófono.'); };
    rec.onend = () => this.dictando.set(false);
    try { rec.start(); this.dictando.set(true); }
    catch { this.avisos.mostrar('No se pudo iniciar el dictado.'); }
  }

  protected color(s: Segmento): string {
    if (!s.categoria) return 'var(--tinta-3)';
    const c = CAT[s.categoria];
    return this.tema.oscuro() ? c.colorOscuro : c.color;
  }
}
