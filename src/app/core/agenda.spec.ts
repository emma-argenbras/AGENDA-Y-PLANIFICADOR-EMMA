import { describe, expect, it } from 'vitest';
import {
  aHora, aMinutos, avisoReuniones, horasDe, horasPorTipo, ordenarDia,
  primerHueco, solapados, type Evento,
} from './agenda';

const e = (hora: string, minutos: number, over: Partial<Evento> = {}): Evento => ({
  id: hora + '-' + minutos, fecha: '2026-08-20', hora, minutos,
  titulo: 'x', tipo: 'reunion', origen: 'app', ...over,
});

describe('horas', () => {
  it('convierte en los dos sentidos', () => {
    expect(aMinutos('09:30')).toBe(570);
    expect(aHora(570)).toBe('09:30');
    expect(aHora(-10)).toBe('00:00');
    expect(aHora(99999)).toBe('23:59');
  });
});

describe('orden y solapamientos', () => {
  it('ordena por hora', () => {
    expect(ordenarDia([e('14:00', 30), e('09:00', 60)]).map(x => x.hora)).toEqual(['09:00', '14:00']);
  });

  it('detecta dos cosas a la misma hora', () => {
    const choque = solapados([e('09:00', 60), e('09:30', 30), e('14:00', 30)]);
    expect(choque.has('09:00-60')).toBe(true);
    expect(choque.has('09:30-30')).toBe(true);
    expect(choque.has('14:00-30')).toBe(false);
  });

  it('pegado no es solapado', () => {
    expect(solapados([e('09:00', 60), e('10:00', 30)]).size).toBe(0);
  });
});

describe('carga de la semana', () => {
  it('suma horas por tipo', () => {
    const t = horasPorTipo([e('09:00', 60), e('11:00', 90, { tipo: 'cliente' })]);
    expect(t.reunion).toBe(1);
    expect(t.cliente).toBe(1.5);
    expect(horasDe([e('09:00', 60), e('11:00', 90, { tipo: 'cliente' })])).toBe(2.5);
  });

  it('avisa recién cuando las reuniones pasan las 16 hs del manual', () => {
    const pocas = Array.from({ length: 8 }, (_, i) => e(`0${i}:00`.slice(-5), 60));
    expect(avisoReuniones(pocas)).toBeNull();
    const muchas = Array.from({ length: 17 }, (_, i) => e(aHora(i * 60), 60, { id: 'r' + i }));
    expect(avisoReuniones(muchas)).toContain('17 hs');
  });
});

describe('primer hueco libre', () => {
  it('encuentra el hueco entre dos cosas', () => {
    expect(primerHueco([e('08:00', 60), e('10:00', 60)], 60)).toBe('09:00');
  });

  it('arranca a las 8 si el día está vacío', () => {
    expect(primerHueco([], 60)).toBe('08:00');
  });

  it('devuelve null si no entra', () => {
    const lleno = Array.from({ length: 11 }, (_, i) => e(aHora(8 * 60 + i * 60), 60, { id: 'x' + i }));
    expect(primerHueco(lleno, 60)).toBeNull();
  });
});
