/**
 * calendario.ts — Traer de Google Calendar lo que agendan otros.
 *
 * Solo lectura, y el mismo permiso de Google que ya usa Drive. Sirve para que
 * las reuniones que te ponen clientes o el equipo aparezcan al lado de tus
 * prioridades, sin tener que abrir otra app.
 *
 * Lo importado no se edita acá: se marca con su origen y, si querés cambiarlo,
 * lo cambiás donde nació. Lo que creás vos vive solo en esta app.
 */

import { Injectable, inject, signal } from '@angular/core';
import { Datos } from './datos';
import { Drive } from './drive';
import { aHora, aMinutos, type Evento, type TipoEvento } from '../core/agenda';

const API = 'https://www.googleapis.com/calendar/v3';

interface EventoGoogle {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean }[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
}

const FRESCURA_MS = 30 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class Calendario {
  private readonly datos = inject(Datos);
  private readonly drive = inject(Drive);

  readonly importando = signal(false);

  /**
   * Importación automática: se dispara sola al entrar a la Agenda, al abrir la
   * app y después de conectar Google. Solo actúa si ya hay permiso vigente
   * —nunca abre ventanas de Google por su cuenta— y si lo traído tiene más de
   * media hora. Los errores acá son silenciosos: para eso está el botón manual.
   */
  async importarSiCorresponde(desdeISO: string, hastaISO: string): Promise<void> {
    if (this.importando()) return;
    try {
      if (!(await this.drive.conectado())) return;
      const { ultimaSyncCalendario } = await this.datos.ajustes();
      if (ultimaSyncCalendario && Date.now() - ultimaSyncCalendario < FRESCURA_MS) return;
      await this.importar(desdeISO, hastaISO);
    } catch { /* sin red o permiso vencido: el botón manual lo dice mejor */ }
  }

  /**
   * Trae los eventos de un rango y los mezcla con lo que ya está guardado.
   * Lo tuyo nunca se pisa: solo se reemplaza lo que vino de Google antes.
   */
  async importar(desdeISO: string, hastaISO: string): Promise<number> {
    this.importando.set(true);
    try {
      const token = await this.drive.conectar();
      const url = `${API}/calendars/primary/events`
        + `?timeMin=${encodeURIComponent(desdeISO + 'T00:00:00-03:00')}`
        + `&timeMax=${encodeURIComponent(hastaISO + 'T23:59:59-03:00')}`
        + '&singleEvents=true&orderBy=startTime&maxResults=250';
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (r.status === 401 || r.status === 403) {
        throw new Error('Google rechazó el permiso de Calendar. Revisá que la API esté activada '
          + 'y volvé a conectar desde Ajustes para que te pida el permiso nuevo.');
      }
      if (!r.ok) throw new Error(`Calendar respondió ${r.status}.`);

      const data = await r.json() as { items?: EventoGoogle[] };
      const porFecha = new Map<string, Evento[]>();
      for (const g of data.items ?? []) {
        const e = convertir(g);
        if (!e) continue;
        porFecha.set(e.fecha, [...(porFecha.get(e.fecha) ?? []), e]);
      }

      let total = 0;
      // Un día que falla no puede llevarse puesta la semana entera: se anota
      // y se sigue. Antes, un solo evento con un campo raro dejaba la agenda
      // completa sin importar y sin explicación.
      const fallados: string[] = [];
      let primerError: unknown = null;
      const fechas = new Set([...porFecha.keys(), ...fechasEntre(desdeISO, hastaISO)]);
      for (const fecha of fechas) {
        try {
          const previos = await this.datos.eventos(fecha);
          const mios = previos.filter(e => e.origen !== 'google');
          const deGoogle = porFecha.get(fecha) ?? [];
          // Si ya lo habías cerrado con acta, se respeta ese vínculo.
          const conVinculos = deGoogle.map(e => {
            const antes = previos.find(p => p.googleId === e.googleId);
            return antes?.reunionId ? { ...e, reunionId: antes.reunionId } : e;
          });
          if (!mios.length && !conVinculos.length && !previos.length) continue;
          await this.datos.guardarEventos(fecha, [...mios, ...conVinculos]);
          total += conVinculos.length;
        } catch (err) {
          fallados.push(fecha);
          primerError ??= err;
        }
      }

      if (fallados.length) {
        // No se marca como al día: la próxima vez tiene que volver a intentar.
        const detalle = primerError instanceof Error ? primerError.message : String(primerError);
        throw new Error(`${fallados.length} día(s) no se pudieron guardar (${fallados.join(', ')}): ${detalle}`);
      }
      await this.datos.guardarAjustes({ ultimaSyncCalendario: Date.now() });
      return total;
    } finally {
      this.importando.set(false);
    }
  }
}

function fechasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const d = new Date(desde + 'T12:00:00');
  const fin = new Date(hasta + 'T12:00:00');
  while (d <= fin) {
    out.push(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Un evento de Google en el formato de la app. Los de todo el día se ignoran. */
function convertir(g: EventoGoogle): Evento | null {
  if (g.status === 'cancelled' || !g.start?.dateTime || !g.end?.dateTime) return null;
  const inicio = new Date(g.start.dateTime);
  const fin = new Date(g.end.dateTime);
  const local = new Date(inicio.getTime() - inicio.getTimezoneOffset() * 60000);
  const minutos = Math.max(15, Math.round((fin.getTime() - inicio.getTime()) / 60000));
  const invitados = (g.attendees ?? []).filter(a => !a.self);
  const con = invitados.map(a => a.displayName || a.email).filter(Boolean).slice(0, 3).join(', ');
  const nota = g.location?.trim() ?? '';

  return {
    id: 'g:' + g.id,
    googleId: g.id,
    fecha: local.toISOString().slice(0, 10),
    hora: aHora(aMinutos(local.toISOString().slice(11, 16))),
    minutos,
    titulo: g.summary?.trim() || '(sin título)',
    tipo: adivinarTipo(g),
    origen: 'google',
    // Campos opcionales: se ponen solo si tienen algo. Un campo en `undefined`
    // no es lo mismo que un campo ausente para todos los que lo reciben.
    ...(con ? { con } : {}),
    ...(nota ? { nota } : {}),
  };
}

/**
 * Con quién estás dice bastante: si hay gente de afuera, es cliente; si son
 * todos de la casa, es reunión interna. No siempre acierta y se puede corregir.
 */
function adivinarTipo(g: EventoGoogle): TipoEvento {
  const invitados = (g.attendees ?? []).filter(a => !a.self);
  if (!invitados.length) return 'bloque';
  const propio = (g.organizer?.email ?? '').split('@')[1] ?? '';
  const deAfuera = invitados.some(a => (a.email ?? '').split('@')[1] !== propio);
  return deAfuera ? 'cliente' : 'reunion';
}
