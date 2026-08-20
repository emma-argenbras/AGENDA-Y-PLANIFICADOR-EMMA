/**
 * arranque.spec.ts — Nada anterior a la fecha de arranque es una deuda tuya.
 *
 * El caso real que lo motivó: la app reclamaba semanas y revisiones ocurridas
 * antes de que se empezara a usar. Un aviso por algo que pasó antes del primer
 * día no se puede atender, y un aviso que no se puede atender enseña a ignorar
 * todos los demás.
 */

import { describe, expect, it } from 'vitest';
import { estadoPrueba, type PruebaDeRol } from './prueba-luciana';
import { diasQuieto, estancado, resumen, type Pendiente } from './pendientes';

const HOY = '2026-08-20';

const PRUEBA_TEST: PruebaDeRol = {
  id: 'test', persona: 'Alguien',
  inicio: '2026-07-01', fin: '2026-08-28', decision: '2026-08-29', decisionDonde: 'Directorio',
  encargo: [], noHace: [],
  revisiones: ['2026-07-03', '2026-07-10', '2026-08-14', '2026-08-21'],
  duracionRevision: 15, reglaCancelacion: '', senales: [], objetivoMejoras: 4,
  salidas: [], pendientes: [],
};

describe('revisiones anteriores al arranque', () => {
  it('sin fecha de arranque, todo lo pasado sin registrar es deuda', () => {
    const e = estadoPrueba(HOY, {}, PRUEBA_TEST);
    expect(e.vencidas).toBe(3);
    expect(e.riesgo?.texto).toContain('3 revisiones vencidas');
  });

  it('con arranque el 20/08, las tres anteriores dejan de reclamar', () => {
    const e = estadoPrueba(HOY, {}, PRUEBA_TEST, HOY);
    expect(e.vencidas).toBe(0);
    expect(e.previas).toBe(3);
    expect(e.riesgo).toBeNull();
  });

  it('lo posterior al arranque sí cuenta', () => {
    const e = estadoPrueba('2026-08-22', {}, PRUEBA_TEST, '2026-08-18');
    expect(e.previas).toBe(3);   // 03/07, 10/07 y 14/08: todas antes del arranque
    expect(e.vencidas).toBe(1);  // 21/08: pasó estando en uso, esa sí es tuya
    expect(e.riesgo?.texto).toContain('21/08');
  });

  it('una revisión previa que igual registraste queda como hecha', () => {
    const e = estadoPrueba(HOY, { '2026-07-03': { registrado: 1 } }, PRUEBA_TEST, HOY);
    expect(e.hechas).toBe(1);
    expect(e.previas).toBe(2);
  });

  it('el arranque no adelanta lo que todavía no pasó', () => {
    const e = estadoPrueba('2026-08-15', {}, PRUEBA_TEST, '2026-08-01');
    expect(e.revisiones.find(r => r.fecha === '2026-08-21')!.estado).toBe('pendiente');
  });
});

describe('pendientes que vienen de antes', () => {
  const viejo = (): Pendiente => ({
    id: 'p1', texto: 'algo de hace mucho', estado: 'abierto',
    creado: Date.parse('2026-06-01T12:00:00Z'),
  });

  it('sin arranque, un pendiente de junio ya nació estancado', () => {
    expect(diasQuieto(viejo(), HOY)).toBe(80);
    expect(estancado(viejo(), HOY)).toBe(true);
  });

  it('con arranque hoy, la cuenta empieza hoy y no te llena la bandeja de rojos', () => {
    expect(diasQuieto(viejo(), HOY, HOY)).toBe(0);
    expect(estancado(viejo(), HOY, HOY)).toBe(false);
    expect(resumen([viejo()], HOY, HOY).estancados).toBe(0);
  });

  it('pasadas las tres semanas desde el arranque, vuelve a exigir una decisión', () => {
    expect(estancado(viejo(), '2026-09-10', HOY)).toBe(true);
  });

  it('el arranque no borra la antigüedad de lo que entró después', () => {
    const reciente: Pendiente = { ...viejo(), creado: Date.parse('2026-08-18T12:00:00Z') };
    expect(diasQuieto(reciente, HOY, '2026-08-01')).toBe(2);
  });
});
