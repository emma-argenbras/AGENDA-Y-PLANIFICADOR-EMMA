import { describe, expect, it } from 'vitest';
import { candidatos, estadoSemanal, resumenCierre } from './semana';
import type { PlanSemana } from './pendientes';

const plan = (over: Partial<PlanSemana> = {}): PlanSemana => ({
  lunes: '2026-08-17',
  objetivos: [
    { id: '1', texto: 'Cerrar Curitiba', unidad: 'lta', hecho: true },
    { id: '2', texto: 'Margen cielorrasos', unidad: 'construccion', hecho: false },
    { id: '3', texto: 'Reemplazo de Facundo', unidad: 'construccion', hecho: false },
  ],
  creado: 0,
  ...over,
});

describe('el momento de la semana', () => {
  it('el viernes con objetivos sin cerrar, toca cerrar', () => {
    const e = estadoSemanal('2026-08-21', plan(), null);
    expect(e.momento).toBe('cerrar');
    expect(e.lunes).toBe('2026-08-17');
  });

  it('el viernes con la semana ya cerrada, no molesta', () => {
    const cerrado = plan({ cerrado: { fecha: '2026-08-21', nota: '' } });
    expect(estadoSemanal('2026-08-21', cerrado, null).momento).toBe('nada');
  });

  it('el domingo sin plan de la próxima, toca armar la que viene', () => {
    const e = estadoSemanal('2026-08-23', plan(), null);
    expect(e.momento).toBe('armar');
    expect(e.lunes).toBe('2026-08-24');
  });

  it('el domingo con la próxima ya armada, no molesta', () => {
    expect(estadoSemanal('2026-08-23', plan(), plan({ lunes: '2026-08-24' })).momento).toBe('nada');
  });

  it('el lunes sin plan, avisa que la semana arrancó sin rumbo', () => {
    const e = estadoSemanal('2026-08-24', null, null);
    expect(e.momento).toBe('armar');
    expect(e.lunes).toBe('2026-08-24');
    expect(e.titulo).toContain('arrancó sin plan');
  });

  it('el miércoles no interrumpe, aunque no haya plan', () => {
    expect(estadoSemanal('2026-08-19', null, null).momento).toBe('nada');
  });
});

describe('cierre de la semana', () => {
  it('cuenta lo cumplido y lo que quedó', () => {
    const r = resumenCierre(plan());
    expect(r.cumplidos).toBe(1);
    expect(r.total).toBe(3);
    expect(r.pct).toBe(33);
    expect(r.sinCumplir.map(o => o.texto)).toEqual(['Margen cielorrasos', 'Reemplazo de Facundo']);
  });

  it('sin plan no inventa porcentajes', () => {
    expect(resumenCierre(null).pct).toBeNull();
  });

  it('lo que no se cumplió vuelve como candidato', () => {
    expect(candidatos(plan())).toEqual(['Margen cielorrasos', 'Reemplazo de Facundo']);
  });
});

describe('la guía de pasos', () => {
  // Regla: con cierre son tres pasos (1,2,3 → índices 0,1,2); sin cierre son
  // dos y se arranca en el 2 (→ índice 0). Un desfase acá resalta el paso
  // equivocado, que es lo que pasaba.
  const indice = (paso: number, hayQueCerrar: boolean) => paso - (hayQueCerrar ? 1 : 2);

  it('con semana por cerrar, el primer paso es el primero', () => {
    expect(indice(1, true)).toBe(0);
    expect(indice(2, true)).toBe(1);
    expect(indice(3, true)).toBe(2);
  });

  it('sin nada que cerrar, la guía tiene dos pasos', () => {
    expect(indice(2, false)).toBe(0);
    expect(indice(3, false)).toBe(1);
  });
});
