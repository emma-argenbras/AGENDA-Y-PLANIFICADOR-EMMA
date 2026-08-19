import { describe, expect, it } from 'vitest';
import {
  clasificarCheckin, clasificarFragmento, evaluarPrioridad,
  totalesSemana, fugasDelegacion, validarResponsableUnico, type Checkin,
} from './clasificador';
import { UMBRALES } from './reglas';
import { estadoPrueba } from './prueba-luciana';

describe('tabla de delegación (3.2)', () => {
  it('marca la tarea con su dueño único', () => {
    const casos: [string, string][] = [
      ['cargué pedidos toda la mañana', 'Comercial de la unidad'],
      ['fui al banco a llevar cheques', 'Leila'],
      ['junté los comprobantes de IVA', 'Potte'],
      ['emití las NF de Brasil', 'Sergio'],
      ['mandé las muestras por encomienda', 'Jalo'],
      ['grabé reels para instagram', 'Bruno'],
      ['actualicé la lista de precios', 'Luciana Dalzotto'],
      ['cargué el CRM', 'Comercial de la unidad'],
    ];
    for (const [texto, dueno] of casos) {
      expect(clasificarFragmento(texto).delegacion?.duenoNombre, texto).toBe(dueno);
    }
  });

  it('no deja entrar una tarea ajena como prioridad propia', () => {
    const r = evaluarPrioridad('cargar el presupuesto de Ruiz');
    expect(r.permitida).toBe(false);
    expect(r.motivo).toContain('Comercial de la unidad');
  });

  it('deja pasar lo que sí es una decisión tuya', () => {
    expect(evaluarPrioridad('negociar exclusividad con la fábrica de Curitiba').permitida).toBe(true);
    expect(evaluarPrioridad('definir el margen mínimo de cielorrasos').permitida).toBe(true);
  });
});

describe('regla de mapeo de tiempo (3.3)', () => {
  it('manda a Ejecución Operativa lo operativo, aunque la agenda dijera otra cosa', () => {
    for (const t of ['cargué pedidos', 'fui al banco', 'emití NF', 'actualicé la lista de precios']) {
      const s = clasificarFragmento(t);
      expect(s.categoria, t).toBe('operativa');
      expect(s.forzada, t).toBe(true);
    }
  });

  it('la categoría forzada no es opinable: viene marcada para que la UI la bloquee', () => {
    expect(clasificarFragmento('cargué pedidos').forzada).toBe(true);
    expect(clasificarFragmento('reunión de directorio').forzada).toBe(false);
  });
});

describe('clasificación de texto libre (3.4)', () => {
  it('reparte una frase en segmentos con categoría', () => {
    const { segmentos } = clasificarCheckin('Cargué pedidos toda la mañana y después reunión de directorio');
    expect(segmentos).toHaveLength(2);
    expect(segmentos[0]!.categoria).toBe('operativa');
    expect(segmentos[1]!.categoria).toBe('reuniones');
    expect(segmentos.reduce((a, s) => a + s.horas, 0)).toBeCloseTo(8, 0);
  });

  it('entiende verbos conjugados, no solo el infinitivo', () => {
    expect(clasificarFragmento('estuve analizando los números del mes').categoria).toBe('estrategia');
    expect(clasificarFragmento('entrevisté a dos candidatos').decisionPropia?.id).toBe('gente_clave');
    expect(clasificarFragmento('estudié un curso de comex').categoria).toBe('estudio');
  });

  it('deja sin clasificar lo que no puede decidir, en vez de inventar', () => {
    expect(clasificarFragmento('mmm no sé').categoria).toBeNull();
  });
});

describe('regla del responsable único (3.6.1)', () => {
  it('rechaza dos nombres y acepta uno', () => {
    expect(validarResponsableUnico('Luciana y Seba').ok).toBe(false);
    expect(validarResponsableUnico('Luciana Dalzotto').ok).toBe(true);
    expect(validarResponsableUnico('').ok).toBe(false);
  });
});

describe('umbrales de control (3.5)', () => {
  const semana = (porCategoria: Record<string, number>, diasConCategoria: Record<string, number> = {}) => ({
    porCategoria,
    diasConCategoria,
    total: Object.values(porCategoria).reduce((a, b) => a + b, 0),
    diasRegistrados: 5,
  });
  const umbral = (id: string) => UMBRALES.find(u => u.id === id)!;

  it('sin datos quedan en gris, no en cero', () => {
    for (const u of UMBRALES) expect(u.evaluar(semana({})).estado).toBe('gris');
  });

  it('marketing: más de 6 hs pide contratar, menos de 3 no era un problema', () => {
    expect(umbral('marketing').evaluar(semana({ marketing: 7, ventas: 5 })).estado).toBe('rojo');
    expect(umbral('marketing').evaluar(semana({ marketing: 2, ventas: 5 })).estado).toBe('verde');
    expect(umbral('marketing').evaluar(semana({ marketing: 4, ventas: 5 })).estado).toBe('amarillo');
  });

  it('ejecución operativa: cero es lo único verde', () => {
    expect(umbral('operativa').evaluar(semana({ ventas: 10 })).estado).toBe('verde');
    expect(umbral('operativa').evaluar(semana({ operativa: 1, ventas: 10 }, { operativa: 1 })).estado).toBe('amarillo');
    expect(umbral('operativa').evaluar(semana({ operativa: 3, ventas: 10 }, { operativa: 3 })).estado).toBe('rojo');
  });

  it('rol de Director: por debajo del 40% no se está ejerciendo', () => {
    expect(umbral('rol_director').evaluar(semana({ ventas: 10, estrategia: 10, reuniones: 20 })).estado).toBe('verde');
    expect(umbral('rol_director').evaluar(semana({ ventas: 2, reuniones: 38 })).estado).toBe('rojo');
  });

  it('reuniones: se compara contra las 16 hs del manual', () => {
    expect(umbral('reuniones').evaluar(semana({ reuniones: 12, ventas: 20 })).estado).toBe('verde');
    expect(umbral('reuniones').evaluar(semana({ reuniones: 25, ventas: 20 })).estado).toBe('rojo');
  });
});

describe('totales y fugas de la semana', () => {
  const checkins: Checkin[] = [{
    fecha: '2026-08-19',
    texto: 'Cargué pedidos y reunión de directorio',
    creado: 0,
    segmentos: clasificarCheckin('Cargué pedidos y reunión de directorio').segmentos,
  }];

  it('suma horas por categoría', () => {
    const t = totalesSemana(checkins);
    expect(t.total).toBeCloseTo(8, 0);
    expect(t.diasRegistrados).toBe(1);
    expect(t.porCategoria['operativa']).toBeGreaterThan(0);
  });

  it('agrupa por dueño real lo que no era tuyo', () => {
    const fugas = fugasDelegacion(checkins);
    expect(fugas).toHaveLength(1);
    expect(fugas[0]!.nombre).toBe('Comercial de la unidad');
  });
});

describe('prueba de Luciana (sección 4)', () => {
  it('el 19/08 la revisión del 14/08 está vencida y la prueba queda en riesgo', () => {
    const e = estadoPrueba('2026-08-19', {});
    expect(e.vencidas).toBe(1);
    expect(e.riesgo?.nivel).toBe('rojo');
    expect(e.diasParaDecision).toBe(17);
  });

  it('registrar la revisión saca el riesgo', () => {
    const e = estadoPrueba('2026-08-19', { '2026-08-14': { mejoras: 1, higiene: 'Se mantiene o sube' } });
    expect(e.vencidas).toBe(0);
    expect(e.riesgo).toBeNull();
    expect(e.mejoras).toBe(1);
  });

  it('si Higiene cae, es alerta aunque las revisiones estén al día', () => {
    const e = estadoPrueba('2026-08-19', { '2026-08-14': { higiene: 'Cae' } });
    expect(e.riesgo?.nivel).toBe('rojo');
    expect(e.riesgo?.texto).toContain('Higiene');
  });
});
