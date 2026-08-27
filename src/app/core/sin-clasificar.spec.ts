/**
 * sin-clasificar.spec.ts — Las horas que la app toma y no muestra.
 *
 * El reporte real: «Marketing marca 0 hs pero yo me acuerdo de haber puesto
 * horas de marketing». Dos causas, y las dos escondían trabajo.
 */

import { describe, expect, it } from 'vitest';
import { clasificarFragmento, totalesSemana, type Checkin } from './clasificador';
import { CATEGORIAS } from './reglas';

const seg = (texto: string, horas: number, categoria: string | null) =>
  ({ texto, horas, categoria, forzada: false, delegacion: null, decisionPropia: null, confianza: 'alta' });

describe('el nombre de una categoría es una pista de sí misma', () => {
  it('«trabajé en marketing» cae en Marketing', () => {
    expect(clasificarFragmento('Trabajé en marketing toda la tarde').categoria).toBe('marketing');
  });

  it('vale para todas, no solo para marketing', () => {
    expect(clasificarFragmento('Dediqué la mañana a estrategia').categoria).toBe('estrategia');
    expect(clasificarFragmento('Puro estudio hoy').categoria).toBe('estudio');
  });

  it('las palabras del día a día que faltaban ahora entran', () => {
    for (const f of ['Armamos el folleto', 'Saqué fotos de producto', 'Crear video Construsul']) {
      expect(clasificarFragmento(f).categoria).toBe('marketing');
    }
  });

  it('no se roba lo que ya tenía dueño: la delegación sigue mandando', () => {
    const c = clasificarFragmento('Grabé contenido para redes');
    expect(c.delegacion?.dueno).toBe('bruno');
  });
});

describe('lo que no cae en ninguna categoría no puede desaparecer', () => {
  const semana: Checkin[] = [{
    fecha: '2026-08-24', texto: '', creado: 1,
    segmentos: [
      seg('Meet con Ruiz', 6, 'ventas'),
      seg('algo que la app no supo leer', 2, null),
    ] as never,
  }];

  it('se cuenta aparte, con nombre propio', () => {
    const t = totalesSemana(semana);
    expect(t.porCategoria['sin_clasificar']).toBe(2);
    expect(t.total).toBe(8);
  });

  it('los porcentajes de las ocho más lo suelto dan cien', () => {
    const t = totalesSemana(semana);
    const suma = [...CATEGORIAS.map(c => t.porCategoria[c.id] ?? 0), t.porCategoria['sin_clasificar'] ?? 0]
      .reduce((a, b) => a + b, 0);
    expect(suma).toBe(t.total);
  });

  it('mirando solo las ocho, falta trabajo: eso es lo que se veía en pantalla', () => {
    const t = totalesSemana(semana);
    const soloOcho = CATEGORIAS.reduce((a, c) => a + (t.porCategoria[c.id] ?? 0), 0);
    expect(soloOcho).toBeLessThan(t.total);
  });
});
