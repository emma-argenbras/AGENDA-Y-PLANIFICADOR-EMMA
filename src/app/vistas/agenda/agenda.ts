/**
 * agenda.ts — Tu semana, hora por hora, adentro de la app.
 *
 * Lo que creás acá es tuyo y vive en la app. Lo que viene de Google Calendar
 * aparece marcado y en solo lectura: es lo que agendaron otros.
 */

import { Component, computed, effect, inject, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Datos } from '../../data/datos';
import { Calendario } from '../../data/calendario';
import { Avisos } from '../../ui/avisos';
import { Dialogo } from '../../ui/dialogo';
import { Tema } from '../../ui/tema';
import {
  DURACIONES, TIPO, TIPOS, aHora, aMinutos, avisoReuniones, horasDe, horasPorTipo,
  ordenarDia, primerHueco, solapados, type Evento, type TipoEvento,
} from '../../core/agenda';
import { CAT } from '../../core/reglas';
import { evaluarPrioridad } from '../../core/clasificador';
import { diaCorto, diasSemana, fechaCorta, fechaLarga, hoyISO, inicioSemana, sumarDias } from '../../core/fechas';
import { PRUEBAS, pruebasConRevision } from '../../core/pruebas';

@Component({
  selector: 'app-agenda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Dialogo],
  templateUrl: './agenda.html',
  styleUrl: './agenda.css',
})
export class Agenda {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);
  protected readonly calendario = inject(Calendario);
  private readonly tema = inject(Tema);

  protected readonly hoy = hoyISO();
  protected readonly tipos = TIPOS;
  protected readonly duraciones = DURACIONES;
  protected readonly fechaCorta = fechaCorta;
  protected readonly fechaLarga = fechaLarga;
  protected readonly diaCorto = diaCorto;

  protected readonly lunes = signal(inicioSemana(this.hoy));
  protected readonly diaAbierto = signal<string>(this.hoy);

  constructor() {
    // Lo de Google entra solo al abrir la pantalla y al cambiar de semana.
    effect(() => {
      const lunes = this.lunes();
      void this.calendario.importarSiCorresponde(lunes, sumarDias(lunes, 6));
    });
  }
  protected readonly esSemanaActual = computed(() => this.lunes() === inicioSemana(this.hoy));
  protected readonly fechas = computed(() => diasSemana(this.lunes()));

  private readonly datosSemana = resource({
    params: () => ({ lunes: this.lunes(), v: this.datos.cambios() }),
    loader: async ({ params }) => ({
      eventos: await this.datos.eventosEntre(params.lunes, sumarDias(params.lunes, 6)),
      ajustes: await this.datos.ajustes(),
      prioridades: await this.datos.prioridades(this.hoy),
      pendientes: (await this.datos.pendientes()).filter(x => x.estado === 'abierto').slice(0, 6),
      cierres: await this.datos.cierresDePruebas(PRUEBAS.map(p => p.id)),
    }),
  });

  protected readonly eventos = computed(() => this.datosSemana.value()?.eventos ?? []);
  protected readonly choques = computed(() => solapados(this.eventos()));
  protected readonly horas = computed(() => horasDe(this.eventos()));
  protected readonly porTipo = computed(() => horasPorTipo(this.eventos()));
  protected readonly aviso = computed(() => avisoReuniones(this.eventos()));
  protected readonly ultimaSync = computed(() => {
    const t = this.datosSemana.value()?.ajustes.ultimaSyncCalendario;
    return t ? new Date(t).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : null;
  });

  protected readonly dias = computed(() => this.fechas().map(fecha => {
    const del = ordenarDia(this.eventos().filter(e => e.fecha === fecha));
    return {
      fecha,
      etiqueta: fechaLarga(fecha),
      corto: diaCorto(fecha),
      esHoy: fecha === this.hoy,
      eventos: del,
      horas: horasDe(del),
      revision: pruebasConRevision(fecha, this.datosSemana.value()?.cierres ?? {}).length > 0,
    };
  }));

  protected readonly diaSeleccionado = computed(() =>
    this.dias().find(d => d.fecha === this.diaAbierto()) ?? this.dias()[0] ?? null);

  /** Lo que ya está anotado en otro lado: se elige, no se vuelve a escribir. */
  protected readonly sugerencias = computed(() => {
    const d = this.datosSemana.value();
    if (!d) return [];
    const dePrioridades = d.prioridades.filter(p => !p.hecha)
      .map(p => ({ texto: p.texto, pendienteId: p.pendienteId ?? undefined, prioridadId: p.id }));
    const yaEstan = new Set(dePrioridades.map(x => x.texto));
    const dePendientes = d.pendientes
      .filter(p => !yaEstan.has(p.texto))
      .map(p => ({ texto: p.texto, pendienteId: p.id, prioridadId: undefined }));
    return [...dePrioridades, ...dePendientes].slice(0, 8);
  });

  protected elegirSugerencia(s: { texto: string; pendienteId?: string; prioridadId?: string }): void {
    const e = this.editando();
    if (!e) return;
    this.bloqueoTexto.set('');
    this.editando.set({ ...e, titulo: s.texto, pendienteId: s.pendienteId, prioridadId: s.prioridadId });
  }

  protected color(e: Evento): string {
    const c = CAT[TIPO[e.tipo].categoria];
    return this.tema.oscuro() ? c.colorOscuro : c.color;
  }

  protected fin(e: Evento): string { return aHora(aMinutos(e.hora) + e.minutos); }
  protected choca(e: Evento): boolean { return this.choques().has(e.id); }
  protected mover(semanas: number): void { this.lunes.set(sumarDias(this.lunes(), semanas * 7)); }

  /* ── Alta y edición ────────────────────────────────────────────────────── */

  protected readonly editando = signal<Evento | null>(null);
  protected readonly esNuevo = signal(false);
  protected readonly bloqueoTexto = signal('');

  protected nuevo(fecha: string): void {
    const delDia = this.eventos().filter(e => e.fecha === fecha);
    this.bloqueoTexto.set('');
    this.esNuevo.set(true);
    this.editando.set({
      id: crypto.randomUUID(), fecha, hora: primerHueco(delDia, 60) ?? '09:00',
      minutos: 60, titulo: '', tipo: 'reunion', origen: 'app',
    });
  }

  protected abrir(e: Evento): void {
    if (e.origen === 'google') return;   // lo de Google se mira, no se edita
    this.bloqueoTexto.set('');
    this.esNuevo.set(false);
    this.editando.set({ ...e });
  }

  protected campo<K extends keyof Evento>(clave: K, valor: Evento[K]): void {
    const e = this.editando();
    if (e) this.editando.set({ ...e, [clave]: valor });
  }

  protected async guardar(): Promise<void> {
    const e = this.editando();
    if (!e || !e.titulo.trim()) return;

    // Un bloque de trabajo que es de otro no entra, igual que una prioridad.
    // En una reunión no se bloquea: podés estar invitado a algo que no es tuyo.
    if (e.tipo === 'bloque') {
      const ev = evaluarPrioridad(e.titulo);
      if (!ev.permitida && ev.delegacion) {
        this.bloqueoTexto.set(
          `«${ev.delegacion.tarea}» es de ${ev.delegacion.duenoNombre}. Reservar tu tiempo para eso `
          + 'es la forma más cara de no delegarlo.');
        return;
      }
    }

    const limpio = { ...e, titulo: e.titulo.trim() };
    if (this.esNuevo()) await this.datos.agregarEvento(limpio);
    else await this.datos.actualizarEvento(limpio.fecha, limpio.id, limpio);
    this.editando.set(null);
  }

  protected async borrar(): Promise<void> {
    const e = this.editando();
    if (!e) return;
    await this.datos.borrarEvento(e.fecha, e.id);
    this.editando.set(null);
    this.avisos.mostrar('Evento borrado.');
  }

  /* ── Google Calendar ───────────────────────────────────────────────────── */

  protected readonly errorImport = signal('');

  protected async importar(): Promise<void> {
    this.errorImport.set('');
    try {
      const n = await this.calendario.importar(this.lunes(), sumarDias(this.lunes(), 6));
      this.avisos.mostrar(n ? `${n} evento(s) traídos de Google.` : 'No había eventos esa semana.');
    } catch (e) {
      this.errorImport.set(e instanceof Error ? e.message : String(e));
    }
  }

  /* ── Reunión → acta ────────────────────────────────────────────────────── */

  protected async aActas(e: Evento): Promise<void> {
    const reuniones = await this.datos.reuniones();
    const id = crypto.randomUUID();
    await this.datos.guardarReuniones([{
      id, titulo: e.titulo, fecha: e.fecha, acta: [], creado: Date.now(),
    }, ...reuniones]);
    await this.datos.actualizarEvento(e.fecha, e.id, { reunionId: id });
    this.avisos.mostrar('Quedó en Actas esperando los 3 campos.');
  }
}
