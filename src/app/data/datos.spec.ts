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
  async rango<T>(desde: string, hasta: string): Promise<{ clave: string; valor: T }[]> {
    return [...this.datos.entries()]
      .filter(([k]) => k >= desde && k <= hasta)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clave, valor]) => ({ clave, valor: valor as T }));
  }
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

describe('prioridades que quedaron abiertas otros días', () => {
  const HOY = '2026-08-22';
  const AYER = '2026-08-21';
  const prio = (id: string, texto: string, hecha = false) =>
    ({ id, texto, hecha, creado: 1, categoria: null });

  async function conDatos() {
    const m = montar(false);
    await m.datos.guardarPrioridades(AYER, [prio('a', 'llamar a Ruiz'), prio('b', 'ya hecha', true)]);
    return m;
  }

  it('se pueden encontrar: no estaban perdidas, estaban bajo otra fecha', async () => {
    const { datos } = await conDatos();
    const abiertas = (await datos.prioridadesEntre('2026-08-15', AYER)).filter(p => !p.hecha);
    expect(abiertas).toHaveLength(1);
    expect(abiertas[0]!.texto).toBe('llamar a Ruiz');
    expect(abiertas[0]!.fecha).toBe(AYER);
  });

  it('se puede marcar hecha una de ayer, sin tocar el resto del día', async () => {
    const { datos } = await conDatos();
    await datos.cerrarPrioridad(AYER, 'a');
    const dia = await datos.prioridades(AYER);
    expect(dia.every(p => p.hecha)).toBe(true);
    expect(dia).toHaveLength(2);
  });

  it('traerla a hoy la mueve: no quedan dos copias de la misma tarea', async () => {
    const { datos } = await conDatos();
    expect(await datos.traerAHoy(AYER, 'a', HOY)).toBe('ok');
    expect((await datos.prioridades(AYER)).map(p => p.id)).toEqual(['b']);
    expect((await datos.prioridades(HOY)).map(p => p.texto)).toEqual(['llamar a Ruiz']);
  });

  it('el tope de tres sigue valiendo para lo que viene de atrás', async () => {
    const { datos } = await conDatos();
    await datos.guardarPrioridades(HOY, [prio('1', 'x'), prio('2', 'y'), prio('3', 'z')]);
    expect(await datos.traerAHoy(AYER, 'a', HOY)).toBe('lleno');
    expect(await datos.prioridades(AYER)).toHaveLength(2);   // no se movió nada
  });

  it('una prioridad hecha que ya no existe no rompe nada', async () => {
    const { datos } = await conDatos();
    expect(await datos.traerAHoy(AYER, 'fantasma', HOY)).toBe('no-esta');
  });
});
