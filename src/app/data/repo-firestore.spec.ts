/**
 * repo-firestore.spec.ts — Lo que rompió de verdad en el teléfono.
 *
 * Firestore rechaza `undefined` y corta la escritura entera:
 *   «Function setDoc() called with invalid data.
 *    Unsupported field value: undefined (found in document …/kv/agenda:2026-08-17)»
 *
 * Una reunión sin invitados o un pendiente sin fecha de cierre alcanzaban para
 * tirar abajo el día completo, y con él la importación del calendario.
 */

import { describe, expect, it, vi } from 'vitest';
import { RepoFirestore } from './repo-firestore';

/** Un doble de Firestore que se pone igual de exigente que el de verdad. */
function fingirFirestore() {
  const escrito: Record<string, unknown> = {};
  const setDoc = vi.fn((ref: { id: string }, datos: unknown) => {
    revisar(datos, 'raíz');
    escrito[ref.id] = datos;
    return Promise.resolve();
  });
  const api = {
    doc: (_db: unknown, ..._ruta: string[]) => ({ id: _ruta[_ruta.length - 1]! }),
    setDoc,
  } as unknown as ConstructorParameters<typeof RepoFirestore>[2];
  return { api, escrito, setDoc };
}

function revisar(v: unknown, donde: string): void {
  if (v === undefined) throw new Error(`Unsupported field value: undefined (en ${donde})`);
  if (Array.isArray(v)) { v.forEach((x, i) => revisar(x, `${donde}[${i}]`)); return; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) revisar(x, `${donde}.${k}`);
  }
}

const repoDe = () => {
  const f = fingirFirestore();
  return { repo: new RepoFirestore({} as never, 'uid1', f.api), ...f };
};

describe('escribir en la nube', () => {
  it('un campo opcional sin valor no tira abajo la escritura', async () => {
    const { repo, escrito } = repoDe();
    const evento = {
      id: 'e1', fecha: '2026-08-17', hora: '08:35', minutos: 30,
      titulo: 'Reunión', tipo: 'reunion', origen: 'app',
      con: undefined, nota: undefined, reunionId: undefined,
    };
    await expect(repo.escribir('agenda:2026-08-17', [evento])).resolves.toBeUndefined();
    const guardado = (escrito['agenda:2026-08-17'] as { v: Record<string, unknown>[] }).v[0]!;
    expect(guardado['titulo']).toBe('Reunión');
    expect('con' in guardado).toBe(false);
  });

  it('un campo ausente se lee igual que uno en undefined, así que no se pierde nada', async () => {
    const { repo, escrito } = repoDe();
    await repo.escribir('x', { a: 1, b: undefined });
    const v = (escrito['x'] as { v: Record<string, unknown> }).v;
    expect(v['b']).toBeUndefined();
    expect(Object.keys(v)).toEqual(['a']);
  });

  it('limpia también lo que está anidado hondo', async () => {
    const { repo } = repoDe();
    await expect(repo.escribir('y', {
      plan: { objetivos: [{ id: 'o1', texto: 'x', cerrado: undefined }] },
    })).resolves.toBeUndefined();
  });

  it('en un arreglo no corre a los que siguen: el hueco queda marcado', async () => {
    const { repo, escrito } = repoDe();
    await repo.escribir('z', { lista: ['a', undefined, 'c'] });
    expect((escrito['z'] as { v: { lista: unknown[] } }).v.lista).toEqual(['a', null, 'c']);
  });

  it('null, 0, cadena vacía y false son valores y se guardan', async () => {
    const { repo, escrito } = repoDe();
    await repo.escribir('w', { a: null, b: 0, c: '', d: false });
    expect((escrito['w'] as { v: unknown }).v).toEqual({ a: null, b: 0, c: '', d: false });
  });

  it('el doble de Firestore es exigente de verdad', () => {
    expect(() => revisar({ a: { b: undefined } }, 'raíz')).toThrow(/undefined/);
  });
});
