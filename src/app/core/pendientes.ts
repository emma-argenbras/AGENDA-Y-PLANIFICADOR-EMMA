/**
 * pendientes.ts — Las reglas de la bandeja y del plan semanal.
 *
 * El brief original era explícito: el problema no era la falta de un lugar
 * donde anotar. Por eso esta bandeja no es una lista de tareas infinita. Tiene
 * tope, tiene caducidad, y todo lo que entra pasa por el mismo filtro de
 * delegación que las prioridades.
 *
 * Las tres salidas de un pendiente son las mismas tres de la Ficha de Rol:
 * lo hacés, lo delegás, o lo matás. No existe «lo dejo ahí».
 */

export type EstadoPendiente = 'abierto' | 'hecho' | 'delegado' | 'descartado';

/**
 * Abierto a propósito: las unidades de negocio se editan desde la app
 * (Configuración → Vos y las unidades) y la lista vigente sale de ahí, no de
 * este archivo. 'transversal' siempre existe: es «toda la empresa».
 */
export type UnidadId = string;

export interface Pendiente {
  id: string;
  texto: string;
  creado: number;
  estado: EstadoPendiente;
  /** Objetivo de la semana al que aporta, si aporta a alguno. */
  objetivoId?: string | null;
  /** Última fecha en la que fue una de las 3 prioridades del día. */
  ultimaVezPrioridad?: string | null;
  cerrado?: number;
  motivo?: string;
}

export interface ObjetivoSemana {
  id: string;
  texto: string;
  unidad: UnidadId;
  hecho: boolean;
}

export interface PlanSemana {
  lunes: string;
  objetivos: ObjetivoSemana[];
  creado: number;
  /** Cierre del viernes: qué pasó con cada objetivo. */
  cerrado?: { fecha: string; nota: string };
}

/** Más de esto y la bandeja deja de ser una bandeja: es un cementerio. */
export const TOPE_BANDEJA = 20;

/** Máximo de objetivos por semana. Tres, igual que las prioridades del día. */
export const MAX_OBJETIVOS = 3;

/** A las tres semanas sin ser prioridad, hay que decidir qué se hace con eso. */
export const DIAS_PARA_DECIDIR = 21;

export const abiertos = (ps: readonly Pendiente[]): Pendiente[] =>
  ps.filter(p => p.estado === 'abierto');

export const hayLugar = (ps: readonly Pendiente[]): boolean =>
  abiertos(ps).length < TOPE_BANDEJA;

/**
 * Días desde que entró o desde la última vez que fue prioridad.
 *
 * `inicio` es la fecha desde la que la app cuenta: un pendiente que entró antes
 * no arrastra esa antigüedad, porque si no, arrancar de cero te llenaría la
 * bandeja de rojos el primer día.
 */
export function diasQuieto(p: Pendiente, hoyISO: string, inicio: string | null = null): number {
  const propia = p.ultimaVezPrioridad ?? new Date(p.creado).toISOString().slice(0, 10);
  const desde = inicio && propia < inicio ? inicio : propia;
  return Math.max(0, Math.round(
    (Date.parse(hoyISO + 'T00:00:00') - Date.parse(desde + 'T00:00:00')) / 86400000));
}

export const estancado = (p: Pendiente, hoyISO: string, inicio: string | null = null): boolean =>
  p.estado === 'abierto' && diasQuieto(p, hoyISO, inicio) >= DIAS_PARA_DECIDIR;

/**
 * Orden de la bandeja: primero lo que exige una decisión, después lo que
 * aporta a un objetivo de esta semana, y al final el resto por antigüedad.
 */
export function ordenar(ps: readonly Pendiente[], hoyISO: string, inicio: string | null = null): Pendiente[] {
  return [...abiertos(ps)].sort((a, b) => {
    const ea = estancado(a, hoyISO, inicio) ? 0 : 1;
    const eb = estancado(b, hoyISO, inicio) ? 0 : 1;
    if (ea !== eb) return ea - eb;
    const oa = a.objetivoId ? 0 : 1;
    const ob = b.objetivoId ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return a.creado - b.creado;
  });
}

export interface ResumenBandeja {
  abiertos: number;
  estancados: number;
  conObjetivo: number;
  lugar: number;
  llena: boolean;
}

export function resumen(ps: readonly Pendiente[], hoyISO: string, inicio: string | null = null): ResumenBandeja {
  const ab = abiertos(ps);
  return {
    abiertos: ab.length,
    estancados: ab.filter(p => estancado(p, hoyISO, inicio)).length,
    conObjetivo: ab.filter(p => p.objetivoId).length,
    lugar: Math.max(0, TOPE_BANDEJA - ab.length),
    llena: ab.length >= TOPE_BANDEJA,
  };
}

/**
 * ¿Este compromiso es tuyo? «Van Breedam» no alcanza como pista: Sebastián
 * también lo es. Tiene que decir Emmanuel, Emma o vos.
 */
export function esTuyo(quien: string): boolean {
  return /(^|\s)(emmanuel|emma|yo)(\s|$)/i.test(quien.trim());
}

/** Progreso del plan: cuántos objetivos están cumplidos y cuántos sin tocar. */
export function progresoPlan(plan: PlanSemana | null, ps: readonly Pendiente[]) {
  const objetivos = plan?.objetivos ?? [];
  return objetivos.map(o => ({
    ...o,
    pendientes: ps.filter(p => p.objetivoId === o.id && p.estado === 'abierto').length,
    cerrados: ps.filter(p => p.objetivoId === o.id && p.estado === 'hecho').length,
  }));
}
