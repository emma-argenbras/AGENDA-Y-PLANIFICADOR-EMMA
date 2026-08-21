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

export interface Diagnostico { ok: boolean; titulo: string; detalle: string }

@Injectable({ providedIn: 'root' })
export class Calendario {
  private readonly datos = inject(Datos);
  private readonly drive = inject(Drive);

  readonly importando = signal(false);

  /**
   * Lo último que salió mal, aunque haya sido en la importación automática.
   *
   * Antes esto se tragaba en silencio: la pantalla decía «todavía nunca entró»
   * y no había forma de saber si faltaba un permiso, si la API estaba apagada
   * o si simplemente no había eventos. Un fallo invisible es peor que uno
   * feo.
   */
  readonly error = signal('');

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
    } catch (e) {
      // No se corta nada por esto —la agenda propia sigue andando— pero queda
      // dicho, que es distinto de quedar escondido.
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * Una sola consulta de verdad a Google, para dejar de adivinar.
   *
   * Recorre exactamente el mismo camino que la importación —mismo permiso,
   * misma dirección, misma cuenta— y cuenta qué volvió. Cada paso que puede
   * fallar tiene su propia respuesta, así el siguiente movimiento nunca queda
   * a criterio de quien lo lee.
   */
  async probar(desdeISO: string, hastaISO: string): Promise<Diagnostico> {
    if (!(await this.drive.conectado())) {
      return {
        ok: false,
        titulo: 'Este dispositivo todavía no tiene permiso',
        detalle: 'Entrar con la cuenta y darle permiso al calendario son dos cosas distintas, y el '
          + 'permiso vale por aparato. Tocá «Conectar con Google» acá arriba.',
      };
    }
    if (!(await this.drive.tieneCalendario())) {
      return {
        ok: false,
        titulo: 'Falta el permiso de Calendar',
        detalle: 'Diste el de Drive pero no el de Calendar: en la pantalla de Google quedó una '
          + 'casilla sin tildar. Tocá Desconectar y volvé a conectar marcando las dos.',
      };
    }
    try {
      const token = await this.drive.conectar();
      const r = await fetch(this.#url(desdeISO, hastaISO), { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) {
        return { ok: false, titulo: 'Google rechazó el pedido', detalle: explicar(r.status, await r.text().catch(() => '')) };
      }
      const data = await r.json() as { items?: EventoGoogle[] };
      const utiles = (data.items ?? []).filter(g => convertir(g));
      if (!utiles.length) {
        return {
          ok: true,
          titulo: 'Google contesta bien, pero esa semana está vacía',
          detalle: 'La conexión funciona. Los eventos de todo el día no se traen: la app solo '
            + 'muestra lo que ocupa una hora concreta.',
        };
      }
      return {
        ok: true,
        titulo: `Todo bien: ${utiles.length} evento(s) esta semana`,
        detalle: 'Ya deberías verlos en la Agenda.',
      };
    } catch (e) {
      return {
        ok: false,
        titulo: 'No se pudo llegar a Google',
        detalle: e instanceof Error ? e.message : String(e),
      };
    }
  }

  #url(desdeISO: string, hastaISO: string): string {
    return `${API}/calendars/primary/events`
      + `?timeMin=${encodeURIComponent(desdeISO + 'T00:00:00-03:00')}`
      + `&timeMax=${encodeURIComponent(hastaISO + 'T23:59:59-03:00')}`
      + '&singleEvents=true&orderBy=startTime&maxResults=250';
  }

  /**
   * Trae los eventos de un rango y los mezcla con lo que ya está guardado.
   * Lo tuyo nunca se pisa: solo se reemplaza lo que vino de Google antes.
   */
  async importar(desdeISO: string, hastaISO: string): Promise<number> {
    this.importando.set(true);
    this.error.set('');
    try {
      if (!(await this.drive.tieneCalendario())) {
        throw new Error('El permiso de Calendar quedó sin tildar cuando conectaste con Google. '
          + 'Andá a Ajustes, tocá Desconectar y volvé a conectar marcando las DOS casillas.');
      }
      const token = await this.drive.conectar();
      const r = await fetch(this.#url(desdeISO, hastaISO), { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) throw new Error(explicar(r.status, await r.text().catch(() => '')));

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

/**
 * Google contesta 403 por dos motivos muy distintos y con el mismo número, y
 * el paso a seguir no se parece en nada: uno se arregla en la consola de
 * Google y el otro volviendo a dar el permiso desde el teléfono. Decir
 * «Calendar respondió 403» deja al usuario adivinando entre las dos.
 */
export function explicar(status: number, cuerpo: string): string {
  const t = cuerpo.toLowerCase();

  if (t.includes('accessnotconfigured') || t.includes('has not been used in project')
      || t.includes('is disabled')) {
    return 'La API de Google Calendar está apagada en el proyecto. Entrá a '
      + 'console.cloud.google.com → APIs y servicios → Biblioteca, buscá «Google Calendar API» '
      + 'y tocá Habilitar. Después esperá un minuto y volvé a probar.';
  }
  if (t.includes('scope') || t.includes('insufficient')) {
    return 'Al token le falta el permiso de Calendar. Andá a Ajustes, tocá Desconectar y volvé '
      + 'a conectar marcando las DOS casillas de permiso.';
  }
  if (status === 401) {
    return 'El permiso de Google venció. Volvé a conectar desde Ajustes.';
  }
  if (status === 403) {
    return 'Google rechazó el pedido a Calendar. Suele ser la API apagada en el proyecto o el '
      + 'permiso sin tildar: probá primero volviendo a conectar desde Ajustes.';
  }
  if (status === 404) {
    return 'Esa cuenta de Google no tiene un calendario principal.';
  }
  if (status >= 500) {
    return `Google está con problemas (${status}). Probá de nuevo en un rato.`;
  }
  return `Calendar respondió ${status}.`;
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
