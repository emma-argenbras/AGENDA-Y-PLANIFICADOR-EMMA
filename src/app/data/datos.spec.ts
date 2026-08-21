/**
 * datos.spec.ts — Dónde escribe la app mientras todavía no sabe dónde escribir.
 *
 * El caso real: prioridades cargadas en el teléfono que no aparecían en la
 * computadora. Restaurar la sesión de Google tarda —cargar la SDK, revalidar
 * el token contra la red— y en ese hueco la app contestaba «los datos viven en
 * este aparato». Lo que se escribía ahí no subía nunca y quedaba invisible
 * desde cualquier otro lado, sin ningún aviso.
 */

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { Datos } from './datos';
import { Firebase, type EstadoNube } from './firebase';
import { RepoLocal } from './repo-local';
import { K, type Repositorio } from './repositorio';

/** Un repositorio de mentira, para ver exactamente qué se escribió y dónde. */
class RepoDePrueba implements Repositorio {
  readonly nombre = 'local' as const;
  readonly datos = new Map<string, unknown>();
  async leer<T>(clave: string): Promise<T | null> { return (this.datos.get(clave) as T) ?? null; }
  async escribir<T>(clave: string, valor: T): Promise<void> { this.datos.set(clave, valor); }
  async borrar(clave: string): Promise<void> { this.datos.delete(clave); }
  async claves(): Promise<string[]> { return [...this.datos.keys()]; }
  async rango<T>(): Promise<{ clave: string; valor: T }[]> { return []; }
}

/** Firebase falso: deja mover el estado de la sesión a mano. */
function firebaseFalso(hayProyecto: boolean) {
  return {
    estado: signal<EstadoNube>(hayProyecto ? 'conectando' : 'sin-config'),
    usuario: signal(null),
    config: signal(hayProyecto ? {} : null),
    hayConfig: () => hayProyecto,
    uid: () => null,
    db: () => null,
  };
}

function montar(hayProyecto: boolean) {
  const local = new RepoDePrueba();
  const firebase = firebaseFalso(hayProyecto);
  TestBed.configureTestingModule({
    providers: [
      Datos,
      { provide: RepoLocal, useValue: local },
      { provide: Firebase, useValue: firebase },
    ],
  });
  const datos = TestBed.inject(Datos);
  TestBed.tick();   // corre el effect que decide el repositorio
  return { datos, local, firebase };
}

/** Deja correr los microtasks pendientes sin depender de un temporizador. */
const respirar = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => TestBed.resetTestingModule());

describe('sin proyecto en la nube', () => {
  it('no espera a nadie: escribe en el aparato y sigue', async () => {
    const { datos, local } = montar(false);
    await datos.escribir('x', 1);
    expect(local.datos.get('x')).toBe(1);
    expect(datos.decidido()).toBe(true);
    expect(datos.modo()).toBe('local');
  });
});

describe('con proyecto, mientras la sesión no resolvió', () => {
  it('no contesta todavía: ni lee ni escribe a ciegas', async () => {
    const { datos } = montar(true);
    expect(datos.decidido()).toBe(false);

    let termino = false;
    void datos.escribir(K.prioridades('2026-08-21'), ['algo']).then(() => { termino = true; });
    await respirar();

    // Acá antes ya había escrito en el aparato, y ahí se quedaba para siempre.
    expect(termino).toBe(false);
  });

  it('cuando se sabe que no hay sesión, sigue contra el aparato', async () => {
    const { datos, local, firebase } = montar(true);
    const escritura = datos.escribir('x', 1);

    firebase.estado.set('desconectado');
    TestBed.tick();
    await escritura;

    expect(datos.decidido()).toBe(true);
    expect(local.datos.get('x')).toBe(1);
  });

  it('una lectura durante la espera tampoco miente con un vacío', async () => {
    const { datos, local, firebase } = montar(true);
    local.datos.set(K.prioridades('2026-08-21'), [{ id: 'p1', texto: 'hola' }]);

    const lectura = datos.prioridades('2026-08-21');
    let resuelta = false;
    void lectura.then(() => { resuelta = true; });
    await respirar();
    expect(resuelta).toBe(false);

    firebase.estado.set('desconectado');
    TestBed.tick();
    expect(await lectura).toHaveLength(1);
  });

  it('un error de Firebase también es una respuesta: no deja la app colgada', async () => {
    const { datos, firebase } = montar(true);
    firebase.estado.set('error');
    TestBed.tick();
    await datos.escribir('x', 1);
    expect(datos.decidido()).toBe(true);
  });
});
