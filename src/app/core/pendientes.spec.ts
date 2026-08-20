import { describe, expect, it } from 'vitest';
import {
  DIAS_PARA_DECIDIR, TOPE_BANDEJA, diasQuieto, estancado, hayLugar,
  ordenar, resumen, type Pendiente,
} from './pendientes';

const HOY = '2026-08-20';
/** Hace n días, en milisegundos. */
const dias = (n: number) => Date.parse(`${HOY}T12:00:00Z`) - n * 86400000;

const p = (over: Partial<Pendiente> = {}): Pendiente => ({
  id: Math.random().toString(36).slice(2),
  texto: 'algo',
  creado: dias(0),
  estado: 'abierto',
  ...over,
});

describe('tope de la bandeja', () => {
  it('deja agregar hasta el tope y ahí frena', () => {
    const llena = Array.from({ length: TOPE_BANDEJA }, () => p());
    expect(hayLugar(llena.slice(0, TOPE_BANDEJA - 1))).toBe(true);
    expect(hayLugar(llena)).toBe(false);
  });

  it('lo cerrado no ocupa lugar', () => {
    const ps = Array.from({ length: TOPE_BANDEJA }, () => p({ estado: 'hecho' }));
    expect(hayLugar(ps)).toBe(true);
    expect(resumen(ps, HOY).abiertos).toBe(0);
  });
});

describe('caducidad: a las tres semanas hay que decidir', () => {
  it('cuenta desde que entró si nunca fue prioridad', () => {
    expect(diasQuieto(p({ creado: dias(5) }), HOY)).toBe(5);
    expect(estancado(p({ creado: dias(5) }), HOY)).toBe(false);
    expect(estancado(p({ creado: dias(DIAS_PARA_DECIDIR) }), HOY)).toBe(true);
  });

  it('haberlo puesto como prioridad reinicia el reloj', () => {
    const viejo = p({ creado: dias(25), ultimaVezPrioridad: '2026-08-19' });
    expect(estancado(viejo, HOY)).toBe(false);
    expect(diasQuieto(viejo, HOY)).toBe(1);
  });

  it('lo cerrado nunca queda estancado', () => {
    expect(estancado(p({ creado: dias(60), estado: 'hecho' }), HOY)).toBe(false);
  });
});

describe('orden de la bandeja', () => {
  it('primero lo que exige decisión, después lo que aporta a un objetivo', () => {
    const nuevoSuelto = p({ texto: 'nuevo suelto', creado: dias(1) });
    const conObjetivo = p({ texto: 'con objetivo', creado: dias(2), objetivoId: 'o1' });
    const viejo = p({ texto: 'viejo', creado: dias(30) });
    const orden = ordenar([nuevoSuelto, conObjetivo, viejo], HOY).map(x => x.texto);
    expect(orden).toEqual(['viejo', 'con objetivo', 'nuevo suelto']);
  });

  it('no lista lo cerrado', () => {
    expect(ordenar([p({ estado: 'delegado' }), p({ estado: 'abierto' })], HOY)).toHaveLength(1);
  });
});

describe('resumen', () => {
  it('cuenta abiertos, estancados y lugar disponible', () => {
    const r = resumen([p(), p({ creado: dias(40) }), p({ estado: 'hecho' })], HOY);
    expect(r).toMatchObject({ abiertos: 2, estancados: 1, lugar: TOPE_BANDEJA - 2, llena: false });
  });
});

describe('a quién le toca un compromiso del acta', () => {
  it('reconoce los tuyos', async () => {
    const { esTuyo } = await import('./pendientes');
    expect(esTuyo('Emmanuel')).toBe(true);
    expect(esTuyo('Emmanuel Van Breedam')).toBe(true);
    expect(esTuyo('yo')).toBe(true);
  });

  it('no confunde a Sebastián Van Breedam con vos', async () => {
    const { esTuyo } = await import('./pendientes');
    expect(esTuyo('Sebastián Van Breedam')).toBe(false);
    expect(esTuyo('Luciana Dalzotto')).toBe(false);
    expect(esTuyo('Leila')).toBe(false);
  });
});
