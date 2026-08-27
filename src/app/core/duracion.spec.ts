/**
 * duracion.spec.ts — Con pasos de cuarto de hora aparecen los 0,75, y nadie
 * anota que estuvo cero coma setenta y cinco horas en una reunión.
 */

import { describe, expect, it } from 'vitest';
import { duracion } from './fechas';

describe('horas en el idioma en que se piensan', () => {
  it('menos de una hora se dice en minutos', () => {
    expect(duracion(0.25)).toBe('15 min');
    expect(duracion(0.75)).toBe('45 min');
  });

  it('las horas justas no arrastran minutos', () => {
    expect(duracion(1)).toBe('1 h');
    expect(duracion(8)).toBe('8 h');
  });

  it('lo mezclado se lee de un vistazo', () => {
    expect(duracion(1.25)).toBe('1 h 15');
    expect(duracion(2.75)).toBe('2 h 45');
  });

  it('cero es cero, no «0 h»', () => {
    expect(duracion(0)).toBe('0 min');
  });
});
