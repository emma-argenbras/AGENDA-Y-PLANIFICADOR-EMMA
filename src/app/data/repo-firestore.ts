/**
 * repo-firestore.ts — El mismo contrato, contra la nube.
 *
 * Cada documento vive en usuarios/{uid}/kv/{clave}. Firestore mantiene una
 * caché en el dispositivo: si te quedás sin señal la app sigue leyendo y
 * escribiendo, y sincroniza sola cuando vuelve.
 */

import type { Firestore } from 'firebase/firestore';
import type { Entrada, Repositorio } from './repositorio';

/**
 * Firestore rechaza `undefined` y corta la escritura entera: un solo campo
 * opcional sin valor —una reunión sin invitados, un pendiente sin fecha de
 * cierre— tira abajo el día completo con «Unsupported field value: undefined».
 *
 * En JavaScript un campo ausente y un campo en `undefined` son lo mismo, así
 * que se limpia acá, en la única puerta a la nube, en vez de pedirle a cada
 * pantalla que se acuerde. Un campo que no está vuelve a leerse como `undefined`
 * igual, así que nada cambia del lado de la app.
 */
function sinIndefinidos<T>(valor: T): T {
  if (Array.isArray(valor)) {
    // En un arreglo no se puede borrar el elemento sin correr a los que siguen.
    return valor.map(v => (v === undefined ? null : sinIndefinidos(v))) as T;
  }
  if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    const limpio: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) {
      if (v !== undefined) limpio[k] = sinIndefinidos(v);
    }
    return limpio as T;
  }
  return valor;
}

type FirestoreApi = typeof import('firebase/firestore');

export class RepoFirestore implements Repositorio {
  readonly nombre = 'nube' as const;

  constructor(
    private readonly db: Firestore,
    private readonly uid: string,
    private readonly api: FirestoreApi,
  ) {}

  #ref(clave: string) {
    return this.api.doc(this.db, 'usuarios', this.uid, 'kv', clave);
  }

  #col() {
    return this.api.collection(this.db, 'usuarios', this.uid, 'kv');
  }

  async leer<T>(clave: string): Promise<T | null> {
    const d = await this.api.getDoc(this.#ref(clave));
    return d.exists() ? (d.data()['v'] as T) : null;
  }

  async escribir<T>(clave: string, valor: T): Promise<void> {
    await this.api.setDoc(this.#ref(clave), { v: sinIndefinidos(valor), actualizado: Date.now() });
  }

  async borrar(clave: string): Promise<void> {
    await this.api.deleteDoc(this.#ref(clave));
  }

  async claves(): Promise<string[]> {
    const s = await this.api.getDocs(this.#col());
    return s.docs.map(d => d.id);
  }

  async rango<T>(desde: string, hasta: string): Promise<Entrada<T>[]> {
    const q = this.api.query(
      this.#col(),
      this.api.orderBy(this.api.documentId()),
      this.api.startAt(desde),
      this.api.endAt(hasta),
    );
    const s = await this.api.getDocs(q);
    return s.docs.map(d => ({ clave: d.id, valor: d.data()['v'] as T }));
  }
}
