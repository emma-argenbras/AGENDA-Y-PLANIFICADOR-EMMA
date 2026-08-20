/**
 * pruebas.ts — El registro de pruebas de rol.
 *
 * La de Luciana fue la primera; la pantalla Prueba ya no sabe de nadie en
 * particular: muestra la que esté activa y archiva las decididas.
 *
 * Poner a prueba a alguien nuevo es agregar una entrada a esta lista, con la
 * misma forma que la de Luciana: encargo, límites, revisiones con fecha,
 * señales a registrar y las salidas posibles. Es un commit a propósito, como
 * toda regla de este proyecto: queda versionado quién, cuándo y con qué vara.
 */

import { PRUEBA } from './prueba-luciana';
import type { RegistrosPrueba } from './prueba-luciana';

export type PruebaDeRol = typeof PRUEBA;

export const PRUEBAS: PruebaDeRol[] = [
  PRUEBA,
];

export const pruebaPorId = (id: string): PruebaDeRol | null =>
  PRUEBAS.find(p => p.id === id) ?? null;

/**
 * La prueba que hoy pide atención: la más reciente sin decisión tomada.
 * `cierres` dice cuáles ya se decidieron (eso vive en los datos, no acá).
 */
export function pruebaActiva(cierres: Record<string, boolean>): PruebaDeRol | null {
  const abiertas = PRUEBAS.filter(p => !cierres[p.id]);
  return abiertas.length ? abiertas[abiertas.length - 1]! : null;
}

/** Pruebas cuya revisión cae en la fecha dada y todavía están en curso. */
export function pruebasConRevision(fecha: string, cierres: Record<string, boolean>): PruebaDeRol[] {
  return PRUEBAS.filter(p => !cierres[p.id] && p.revisiones.includes(fecha));
}

export const cierreDe = (r: RegistrosPrueba | undefined): boolean => Boolean(r?.__cierre);
