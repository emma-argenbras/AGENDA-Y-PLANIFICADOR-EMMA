/**
 * environment.ts — Configuración del proyecto de Firebase.
 *
 * Estos valores NO son secretos: viajan en cualquier app web y Firebase los
 * publica en su propia consola para que se peguen en el código. Lo que protege
 * los datos son dos cosas, las dos activas:
 *
 *   1. firestore.rules — sólo la cuenta emmanuelclubdelmate@gmail.com puede
 *      leer y escribir, y sólo su propio árbol de documentos.
 *   2. Los dominios autorizados de Authentication — el login sólo funciona
 *      desde las direcciones que vos habilitaste.
 *
 * Si algún día querés apuntar a otro proyecto sin recompilar, se puede pegar
 * otra configuración desde Ajustes: la del dispositivo le gana a esta.
 */

import type { ConfigFirebase } from '../app/data/firebase';

export const environment: { produccion: boolean; firebase: ConfigFirebase | null } = {
  produccion: true,
  firebase: {
    apiKey: 'AIzaSyAbAYdsuPHFX_GUA0rOrT9rg8jhD7P4FU0',
    authDomain: 'agenda-y-planificador-emma.firebaseapp.com',
    projectId: 'agenda-y-planificador-emma',
    storageBucket: 'agenda-y-planificador-emma.firebasestorage.app',
    messagingSenderId: '162261027097',
    appId: '1:162261027097:web:d7d5c980fb6564f219dd88',
    // Firebase → Cloud Messaging → Web Push certificates. Sólo hace falta para
    // el push con la app cerrada; todo lo demás anda sin esto.
    vapidKey: '',
  },
};
