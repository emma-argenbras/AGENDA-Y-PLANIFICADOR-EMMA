/**
 * repo-firestore.ts — El mismo contrato, contra la nube.
 *
 * Cada documento vive en usuarios/{uid}/kv/{clave}. Firestore mantiene una
 * caché en el dispositivo: si te quedás sin señal la app sigue leyendo y
 * escribiendo, y sincroniza sola cuando vuelve.
 */

import type { Firestore } from 'firebase/firestore';
import type { Entrada, Repositorio } from './repositorio';

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
    await this.api.setDoc(this.#ref(clave), { v: valor, actualizado: Date.now() });
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
