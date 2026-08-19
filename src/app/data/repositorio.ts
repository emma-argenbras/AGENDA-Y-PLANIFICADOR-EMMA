/**
 * repositorio.ts — El contrato de persistencia.
 *
 * Hay dos implementaciones intercambiables: IndexedDB (este dispositivo) y
 * Firestore (la nube, con caché offline). Las pantallas no saben cuál está
 * activa: por eso migrar de una a otra no toca ninguna vista.
 *
 * El modelo es clave → valor, con claves ordenables por fecha
 * ("checkin:2026-08-19"), así un rango de fechas es una consulta por rango de
 * claves en las dos implementaciones.
 */

export interface Entrada<T = unknown> { clave: string; valor: T; }

export interface Repositorio {
  readonly nombre: 'local' | 'nube';
  leer<T>(clave: string): Promise<T | null>;
  escribir<T>(clave: string, valor: T): Promise<void>;
  borrar(clave: string): Promise<void>;
  claves(): Promise<string[]>;
  /** Todas las entradas cuya clave cae entre `desde` y `hasta`, inclusive. */
  rango<T>(desde: string, hasta: string): Promise<Entrada<T>[]>;
}

/** Claves canónicas. Un solo lugar para no escribirlas sueltas por ahí. */
export const K = {
  checkin: (fecha: string) => `checkin:${fecha}`,
  prioridades: (fecha: string) => `prio:${fecha}`,
  reuniones: 'reuniones',
  derivaciones: 'derivaciones',
  prueba: 'prueba:luciana_2026_08',
  indicadores: 'indicadores',
  ajustes: 'ajustes',
  docsIndice: 'docs:indice',
  doc: (id: string) => `doc:${id}`,
  driveToken: 'drive:token',
} as const;

/** Rango que abarca todas las claves con ese prefijo. */
export const prefijo = (p: string): [string, string] => [p, p + ''];
