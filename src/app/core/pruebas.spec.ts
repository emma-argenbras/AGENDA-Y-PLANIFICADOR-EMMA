import { describe, expect, it } from 'vitest';
import { PRUEBAS, pruebaActiva, pruebaPorId, pruebasConRevision } from './pruebas';

describe('registro de pruebas de rol', () => {
  it('la de Luciana está registrada y se encuentra por id', () => {
    expect(PRUEBAS.length).toBeGreaterThan(0);
    expect(pruebaPorId('luciana_2026_08')?.persona).toBe('Luciana Dalzotto');
    expect(pruebaPorId('inexistente')).toBeNull();
  });

  it('activa es la última sin decisión', () => {
    expect(pruebaActiva({})?.id).toBe('luciana_2026_08');
    expect(pruebaActiva({ luciana_2026_08: true })).toBeNull();
  });

  it('las revisiones dejan de avisar cuando la prueba se decidió', () => {
    expect(pruebasConRevision('2026-08-21', {})).toHaveLength(1);
    expect(pruebasConRevision('2026-08-21', { luciana_2026_08: true })).toHaveLength(0);
    expect(pruebasConRevision('2026-08-20', {})).toHaveLength(0);
  });
});
