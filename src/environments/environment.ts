/**
 * environment.ts — Configuración de Firebase versionada (opcional).
 *
 * Si la dejás vacía, la app arranca en modo local y podés pegar la config desde
 * Ajustes. Si la completás acá, queda en el build y no hay que pegar nada en
 * cada dispositivo. No es información secreta: lo que protege los datos son las
 * reglas de firestore.rules.
 */

import type { ConfigFirebase } from '../app/data/firebase';

export const environment: { produccion: boolean; firebase: ConfigFirebase | null } = {
  produccion: true,
  firebase: null,
};
