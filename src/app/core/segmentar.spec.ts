/**
 * segmentar.spec.ts — Cómo se parte el cierre del día.
 *
 * El reporte real: «cargo tipo jeroglífico cada cosa separada por puntos y así
 * y todo me divide las cosas». Separar a mano y que igual te partan la frase
 * es peor que no separar nada: uno hizo el trabajo dos veces.
 */

import { describe, expect, it } from 'vitest';
import { clasificarCheckin, segmentar } from './clasificador';

describe('cuando separás vos, manda lo tuyo', () => {
  it('los puntos separan, y adentro de cada parte no se toca nada', () => {
    expect(segmentar('Reunión con Seba, Luciana y Bruno. Fui al banco.')).toEqual([
      'Reunión con Seba, Luciana y Bruno',
      'Fui al banco',
    ]);
  });

  it('los renglones cuentan igual que los puntos', () => {
    expect(segmentar('Analicé los números del mes\nMeet con Ruiz, Pérez y González')).toEqual([
      'Analicé los números del mes',
      'Meet con Ruiz, Pérez y González',
    ]);
  });

  it('un punto final no es una separación: no parte nada', () => {
    expect(segmentar('Estuve toda la tarde con la lista de precios.'))
      .toEqual(['Estuve toda la tarde con la lista de precios']);
  });

  it('un decimal no parte la frase al medio', () => {
    expect(segmentar('Reunión de 1.5 horas con el equipo'))
      .toEqual(['Reunión de 1.5 horas con el equipo']);
  });
});

describe('sin separación explícita hay que adivinar', () => {
  it('dos cosas distintas unidas por «y» sí se separan', () => {
    expect(segmentar('cargué pedidos toda la mañana y fui al banco')).toEqual([
      'cargué pedidos toda la mañana',
      'fui al banco',
    ]);
  });

  it('una lista de nombres no son varias reuniones', () => {
    // Cada pedazo suelto —«Luciana», «Bruno»— no dice nada por su cuenta.
    expect(segmentar('reunión con Seba, Luciana y Bruno'))
      .toEqual(['reunión con Seba, Luciana y Bruno']);
  });

  it('una frase sola queda entera', () => {
    expect(segmentar('estudié dos capítulos')).toEqual(['estudié dos capítulos']);
  });

  it('el texto vacío no inventa un fragmento', () => {
    expect(segmentar('   ')).toEqual([]);
  });
});

describe('el reparto de horas llega al cuarto de hora', () => {
  it('los pedazos caen en múltiplos de 15 minutos', () => {
    const { segmentos } = clasificarCheckin(
      'Meet con Ruiz. Cargué el CRM. Analicé los números del mes. Fui al banco.', 8);
    expect(segmentos).toHaveLength(4);
    for (const s of segmentos) {
      expect(Math.round(s.horas * 60) % 15).toBe(0);
      expect(s.horas).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('el total sigue pareciéndose al día declarado', () => {
    const { segmentos } = clasificarCheckin('Meet con Ruiz. Fui al banco.', 8);
    expect(segmentos.reduce((a, s) => a + s.horas, 0)).toBeCloseTo(8, 0);
  });
});
