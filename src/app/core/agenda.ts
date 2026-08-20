/**
 * agenda.ts — Los eventos del día, adentro de la app.
 *
 * No es un calendario genérico: es tu día, con los mismos colores y las mismas
 * reglas que el resto. Un bloque de trabajo que corresponde a otro no entra,
 * igual que una prioridad. Y una reunión no termina hasta que tiene acta.
 *
 * Lo que agendan otros (clientes, el equipo) puede entrar por Google Calendar
 * en solo lectura: eso se ve, pero no se edita acá.
 */

import type { CategoriaId } from './reglas';

export type TipoEvento = 'reunion' | 'cliente' | 'bloque' | 'personal';
export type OrigenEvento = 'app' | 'google';

export interface Evento {
  id: string;
  fecha: string;        // YYYY-MM-DD
  hora: string;         // HH:MM
  minutos: number;
  titulo: string;
  tipo: TipoEvento;
  con?: string;
  nota?: string;
  origen: OrigenEvento;
  googleId?: string;
  /** Reunión de Actas ya creada a partir de este evento. */
  reunionId?: string;
  /** Prioridad del día para la que reservaste este bloque. */
  prioridadId?: string;
  /** Pendiente de la bandeja al que le estás reservando tiempo. */
  pendienteId?: string;
}

/**
 * Cada tipo de evento cae en una de las 8 categorías de tiempo, y usa su mismo
 * color. Así la agenda y los gráficos de la semana hablan el mismo idioma.
 */
export const TIPOS: {
  id: TipoEvento; nombre: string; categoria: CategoriaId; ayuda: string;
}[] = [
  { id: 'reunion', nombre: 'Reunión interna', categoria: 'reuniones',
    ayuda: 'Directorio, área, equipo. Al terminar pide acta.' },
  { id: 'cliente', nombre: 'Cliente o proveedor', categoria: 'ventas',
    ayuda: 'Meets, visitas, negociaciones.' },
  { id: 'bloque', nombre: 'Bloque de trabajo', categoria: 'estrategia',
    ayuda: 'Tiempo reservado para una de tus prioridades.' },
  { id: 'personal', nombre: 'Personal', categoria: 'personal',
    ayuda: 'Todo lo que no es de la empresa.' },
];

export const TIPO = Object.fromEntries(TIPOS.map(t => [t.id, t])) as
  Record<TipoEvento, (typeof TIPOS)[number]>;

export const DURACIONES = [15, 30, 45, 60, 90, 120];

/**
 * Un bloque reservado para algo de la bandeja. Es el puente entre el «qué»
 * (Pendientes) y el «cuándo» (Agenda): el texto no se vuelve a escribir, y el
 * pendiente pasa a saber que tiene hora.
 */
export function bloqueDe(
  texto: string, fecha: string, hora: string, pendienteId?: string, prioridadId?: string,
): Evento {
  return {
    id: crypto.randomUUID(), fecha, hora, minutos: 60,
    titulo: texto, tipo: 'bloque', origen: 'app', pendienteId, prioridadId,
  };
}

export const aMinutos = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export const aHora = (minutos: number): string => {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutos)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const finDe = (e: Evento): number => aMinutos(e.hora) + e.minutos;

export const ordenarDia = (es: readonly Evento[]): Evento[] =>
  [...es].sort((a, b) => aMinutos(a.hora) - aMinutos(b.hora) || a.titulo.localeCompare(b.titulo));

/** Eventos que se pisan entre sí. Dos reuniones a la misma hora es un problema. */
export function solapados(es: readonly Evento[]): Set<string> {
  const orden = ordenarDia(es);
  const choques = new Set<string>();
  for (let i = 0; i < orden.length; i++) {
    for (let j = i + 1; j < orden.length; j++) {
      const a = orden[i]!, b = orden[j]!;
      if (aMinutos(b.hora) >= finDe(a)) break;
      choques.add(a.id);
      choques.add(b.id);
    }
  }
  return choques;
}

export const horasDe = (es: readonly Evento[]): number =>
  Math.round((es.reduce((s, e) => s + e.minutos, 0) / 60) * 10) / 10;

/** Horas comprometidas por tipo, para saber cómo viene la semana antes de vivirla. */
export function horasPorTipo(es: readonly Evento[]): Record<TipoEvento, number> {
  const out = { reunion: 0, cliente: 0, bloque: 0, personal: 0 };
  for (const e of es) out[e.tipo] += e.minutos;
  for (const k of Object.keys(out) as TipoEvento[]) out[k] = Math.round((out[k] / 60) * 10) / 10;
  return out;
}

/**
 * El manual proyecta 16 hs semanales de reuniones internas. Acá se puede ver
 * antes de que pase, no el viernes cuando ya no hay nada que hacer.
 */
export const TOPE_REUNIONES_SEMANA = 16;

export function avisoReuniones(es: readonly Evento[]): string | null {
  const h = horasPorTipo(es).reunion;
  if (h <= TOPE_REUNIONES_SEMANA) return null;
  return `Tenés ${h} hs de reuniones internas agendadas y el manual proyecta ${TOPE_REUNIONES_SEMANA}. `
       + 'Todavía estás a tiempo de sacar alguna.';
}

/** El primer hueco libre de al menos `minutos`, dentro del horario laboral. */
export function primerHueco(es: readonly Evento[], minutos = 60, desde = 8 * 60, hasta = 19 * 60): string | null {
  const orden = ordenarDia(es);
  let libre = desde;
  for (const e of orden) {
    const inicio = aMinutos(e.hora);
    if (inicio - libre >= minutos) return aHora(libre);
    libre = Math.max(libre, finDe(e));
  }
  return hasta - libre >= minutos ? aHora(libre) : null;
}
