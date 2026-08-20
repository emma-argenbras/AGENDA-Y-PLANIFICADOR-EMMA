/**
 * semana.ts — El ritual semanal: cerrar la que termina, armar la que viene.
 *
 * El planificador existía pero nada te llevaba a usarlo: los recordatorios eran
 * todos diarios. Un plan semanal que hay que acordarse de armar es un plan
 * semanal que no se arma.
 *
 * Dos momentos, y la app sabe en cuál estás:
 *   - Viernes y sábado: cerrás la semana que termina.
 *   - Domingo a martes: armás la que viene (o la que ya empezó, si llegaste tarde).
 */

import { inicioSemana, sumarDias } from './fechas';
import type { ObjetivoSemana, PlanSemana } from './pendientes';

export type MomentoSemanal = 'cerrar' | 'armar' | 'nada';

export interface EstadoSemanal {
  momento: MomentoSemanal;
  /** Semana sobre la que hay que actuar. */
  lunes: string;
  titulo: string;
  motivo: string;
}

const dow = (iso: string): number => new Date(iso + 'T12:00:00').getDay();

/**
 * Qué corresponde hacer hoy. `plan` es el de la semana en curso y `planProximo`
 * el de la que viene; cualquiera de los dos puede no existir todavía.
 */
export function estadoSemanal(
  hoy: string,
  plan: PlanSemana | null,
  planProximo: PlanSemana | null,
): EstadoSemanal {
  const lunesActual = inicioSemana(hoy);
  const lunesProximo = sumarDias(lunesActual, 7);
  const d = dow(hoy);

  // Viernes o sábado, con una semana planificada sin cerrar.
  if ((d === 5 || d === 6) && plan && !plan.cerrado) {
    return {
      momento: 'cerrar',
      lunes: lunesActual,
      titulo: 'Cerrá la semana',
      motivo: 'Tenés 3 objetivos sin cerrar. Son cinco minutos y es lo que hace que la próxima sirva.',
    };
  }

  // Domingo: la semana que viene todavía no tiene plan.
  if (d === 0 && !planProximo) {
    return {
      momento: 'armar',
      lunes: lunesProximo,
      titulo: 'Armá la semana que viene',
      motivo: 'Tres objetivos. Si el lunes arranca sin ellos, lo urgente elige por vos.',
    };
  }

  // Lunes o martes sin plan: llegaste tarde, pero todavía sirve.
  if ((d === 1 || d === 2) && !plan) {
    return {
      momento: 'armar',
      lunes: lunesActual,
      titulo: 'La semana arrancó sin plan',
      motivo: 'Todavía estás a tiempo de elegir los 3 objetivos.',
    };
  }

  return { momento: 'nada', lunes: lunesActual, titulo: '', motivo: '' };
}

export interface ResumenCierre {
  cumplidos: number;
  total: number;
  sinCumplir: ObjetivoSemana[];
  /** Porcentaje de objetivos cumplidos, o null si no había objetivos. */
  pct: number | null;
}

export function resumenCierre(plan: PlanSemana | null): ResumenCierre {
  const objetivos = plan?.objetivos ?? [];
  const cumplidos = objetivos.filter(o => o.hecho).length;
  return {
    cumplidos,
    total: objetivos.length,
    sinCumplir: objetivos.filter(o => !o.hecho),
    pct: objetivos.length ? Math.round((cumplidos / objetivos.length) * 100) : null,
  };
}

/**
 * Lo que no se cumplió no se tira: vuelve como candidato de la semana que
 * viene. Arrastrar el mismo objetivo tres semanas seguidas es información.
 */
export function candidatos(planAnterior: PlanSemana | null): string[] {
  return (planAnterior?.objetivos ?? []).filter(o => !o.hecho).map(o => o.texto);
}
