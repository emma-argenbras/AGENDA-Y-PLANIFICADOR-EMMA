/**
 * pruebas.ts — El registro de pruebas de rol.
 *
 * La de Luciana fue la primera; la pantalla Prueba ya no sabe de nadie en
 * particular: muestra la que esté activa y archiva las decididas.
 *
 * Poner a prueba a alguien nuevo es agregar una entrada con la misma forma que
 * la de Luciana: encargo, límites, revisiones con fecha, señales a registrar y
 * las salidas posibles. Se puede hacer desde la app (Configuración → Pruebas
 * de rol) o acá, en el valor de fábrica. Lo que se edita desde la app queda
 * marcado como tuyo y se puede volver a esta lista.
 */

import { PRUEBA } from './prueba-luciana';
import type { PruebaDeRol, RegistrosPrueba } from './prueba-luciana';

export type { PruebaDeRol };

/** Valor de fábrica. La lista vigente puede tener más, o tenerlas editadas. */
export const PRUEBAS: PruebaDeRol[] = [
  PRUEBA,
];

export const pruebaPorId = (id: string, pruebas: readonly PruebaDeRol[] = PRUEBAS): PruebaDeRol | null =>
  pruebas.find(p => p.id === id) ?? null;

/**
 * La prueba que hoy pide atención: la más reciente sin decisión tomada.
 * `cierres` dice cuáles ya se decidieron (eso vive en los datos, no acá).
 */
export function pruebaActiva(
  cierres: Record<string, boolean>,
  pruebas: readonly PruebaDeRol[] = PRUEBAS,
): PruebaDeRol | null {
  const abiertas = pruebas.filter(p => !cierres[p.id]);
  return abiertas.length ? abiertas[abiertas.length - 1]! : null;
}

/** Pruebas cuya revisión cae en la fecha dada y todavía están en curso. */
export function pruebasConRevision(
  fecha: string,
  cierres: Record<string, boolean>,
  pruebas: readonly PruebaDeRol[] = PRUEBAS,
): PruebaDeRol[] {
  return pruebas.filter(p => !cierres[p.id] && p.revisiones.includes(fecha));
}

export const cierreDe = (r: RegistrosPrueba | undefined): boolean => Boolean(r?.__cierre);

/**
 * Los viernes entre dos fechas. Es como se arman las revisiones de una prueba
 * nueva: se elige el rango y las fechas salen solas, porque escribir cuatro
 * fechas a mano en un teléfono es la forma más segura de equivocarse en una.
 */
export function viernesEntre(inicioISO: string, finISO: string): string[] {
  const out: string[] = [];
  const d = new Date(inicioISO + 'T12:00:00');
  const fin = new Date(finISO + 'T12:00:00');
  if (isNaN(d.getTime()) || isNaN(fin.getTime()) || fin < d) return out;
  // Adelantar hasta el primer viernes (día 5).
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  while (d <= fin && out.length < 60) {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    out.push(z.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return out;
}
