/**
 * repo-local.ts — IndexedDB. Es el modo por defecto y el que nunca falla:
 * funciona sin cuenta, sin internet y sin haber configurado nada.
 */

import { Injectable } from '@angular/core';
import type { Entrada, Repositorio } from './repositorio';

const DB = 'emma-planner';
const STORE = 'kv';
const LS = 'emma-planner:';

@Injectable({ providedIn: 'root' })
export class RepoLocal implements Repositorio {
  readonly nombre = 'local' as const;
  #db: Promise<IDBDatabase> | null = null;
  #sinIndexedDb = false;

  #abrir(): Promise<IDBDatabase> {
    if (this.#sinIndexedDb) return Promise.reject(new Error('sin IndexedDB'));
    this.#db ??= new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try { req = indexedDB.open(DB, 1); }
      catch (e) { this.#sinIndexedDb = true; return reject(e as Error); }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { this.#sinIndexedDb = true; reject(req.error ?? new Error('IndexedDB')); };
    });
    return this.#db;
  }

  async #tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.#abrir();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, modo);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
    });
  }

  async leer<T>(clave: string): Promise<T | null> {
    try {
      const v = await this.#tx<T | undefined>('readonly', s => s.get(clave));
      return v ?? null;
    } catch {
      const raw = localStorage.getItem(LS + clave);
      return raw == null ? null : JSON.parse(raw) as T;
    }
  }

  async escribir<T>(clave: string, valor: T): Promise<void> {
    try { await this.#tx('readwrite', s => s.put(valor, clave)); }
    catch { try { localStorage.setItem(LS + clave, JSON.stringify(valor)); } catch { /* lleno */ } }
  }

  async borrar(clave: string): Promise<void> {
    try { await this.#tx('readwrite', s => s.delete(clave)); }
    catch { localStorage.removeItem(LS + clave); }
  }

  async claves(): Promise<string[]> {
    try { return (await this.#tx<IDBValidKey[]>('readonly', s => s.getAllKeys())).map(String); }
    catch {
      return Object.keys(localStorage).filter(k => k.startsWith(LS)).map(k => k.slice(LS.length));
    }
  }

  async rango<T>(desde: string, hasta: string): Promise<Entrada<T>[]> {
    try {
      const r = IDBKeyRange.bound(desde, hasta);
      const [claves, valores] = await Promise.all([
        this.#tx<IDBValidKey[]>('readonly', s => s.getAllKeys(r)),
        this.#tx<T[]>('readonly', s => s.getAll(r)),
      ]);
      return claves.map((c, i) => ({ clave: String(c), valor: valores[i] as T }));
    } catch {
      const out: Entrada<T>[] = [];
      for (const clave of await this.claves()) {
        if (clave >= desde && clave <= hasta) {
          const valor = await this.leer<T>(clave);
          if (valor !== null) out.push({ clave, valor });
        }
      }
      return out;
    }
  }
}
