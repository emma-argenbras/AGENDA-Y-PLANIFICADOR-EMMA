import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIG_VACIA, fijarVigentes, idDesde, normalizarConfig, normalizarDelegacion,
  resolver, restablecerVigentes, vigentes, type ConfigApp,
} from './config';
import { CATEGORIAS, DELEGACION, NUMEROS_UMBRAL, PERSONAS } from './reglas';
import { clasificarFragmento, detectarResponsables } from './clasificador';
import { viernesEntre } from './pruebas';

const con = (parche: Partial<ConfigApp>): ConfigApp => ({ ...CONFIG_VACIA, ...parche });

afterEach(() => restablecerVigentes());

describe('sin configuración, vale lo que dice el código', () => {
  it('devuelve los valores de fábrica tal cual', () => {
    const v = resolver();
    expect(v.delegacion).toHaveLength(DELEGACION.length);
    expect(v.categorias).toHaveLength(8);
    expect(v.numeros).toEqual(NUMEROS_UMBRAL);
    expect(Object.keys(v.personas)).toEqual(Object.keys(PERSONAS));
  });

  it('lo guardado por una versión anterior no rompe nada', () => {
    const viejo = normalizarConfig({ personas: null, loQueSea: 1 });
    expect(viejo.version).toBe(1);
    expect(viejo.delegacion).toBeNull();
    expect(resolver(viejo).categorias).toHaveLength(8);
  });
});

describe('editar una sección no toca las demás', () => {
  it('cambiar los umbrales deja la tabla de delegación intacta', () => {
    const v = resolver(con({ umbrales: { ...NUMEROS_UMBRAL, marketingAlto: 10 } }));
    expect(v.numeros.marketingAlto).toBe(10);
    expect(v.delegacion).toHaveLength(DELEGACION.length);
  });

  it('el umbral nuevo es el que evalúa, no el de fábrica', () => {
    const t = { porCategoria: { marketing: 8 }, diasConCategoria: {}, total: 40, diasRegistrados: 5 };
    const fabrica = resolver().umbrales.find(u => u.id === 'marketing')!;
    const tuyo = resolver(con({ umbrales: { ...NUMEROS_UMBRAL, marketingAlto: 10 } }))
      .umbrales.find(u => u.id === 'marketing')!;
    expect(fabrica.evaluar(t).estado).toBe('rojo');
    expect(tuyo.evaluar(t).estado).toBe('amarillo');
  });
});

describe('la regla 3.3 no se puede apagar', () => {
  it('una fila forzada de fábrica sigue siendo forzada aunque lo guardado diga que no', () => {
    const manipulada = DELEGACION.map(f =>
      f.id === 'pedidos' ? { ...f, forzada: false, categoria: 'estrategia' as const } : f);
    const fila = resolver(con({ delegacion: manipulada })).delegacion.find(f => f.id === 'pedidos')!;
    expect(fila.forzada).toBe(true);
    expect(fila.categoria).toBe('operativa');
  });

  it('una fila nueva marcada como forzada queda en ejecución operativa', () => {
    const filas = normalizarDelegacion([
      { id: 'nueva', tarea: 'Cargar el remito', dueno: 'jalo', categoria: 'ventas', forzada: true, pistas: [] },
    ]);
    expect(filas[0]!.categoria).toBe('operativa');
  });

  it('una fila sin tarea no entra: sería una regla que no se puede leer', () => {
    expect(normalizarDelegacion([
      { id: 'x', tarea: '   ', dueno: 'jalo', categoria: 'ventas', forzada: false, pistas: [] },
    ])).toHaveLength(0);
  });
});

describe('las categorías se editan por texto, no por paleta', () => {
  it('el color y el orden salen siempre del código', () => {
    const v = resolver(con({
      categorias: [{ id: 'ventas', nombre: 'Clientes', definicion: 'Otra cosa', pistas: ['cliente'] }],
    }));
    expect(v.categorias.map(c => c.id)).toEqual(CATEGORIAS.map(c => c.id));
    const ventas = v.cat['ventas'];
    expect(ventas.nombre).toBe('Clientes');
    expect(ventas.color).toBe(CATEGORIAS.find(c => c.id === 'ventas')!.color);
  });

  it('una categoría que la configuración no menciona queda como estaba', () => {
    const v = resolver(con({
      categorias: [{ id: 'ventas', nombre: 'Clientes', definicion: 'x', pistas: [] }],
    }));
    expect(v.cat['estudio'].nombre).toBe('Estudio');
  });
});

describe('lo vigente es lo que usa el clasificador', () => {
  it('cambiar el dueño de una fila cambia a quién manda la tarea', () => {
    expect(clasificarFragmento('fui al banco').delegacion?.dueno).toBe('leila');
    fijarVigentes(con({
      delegacion: DELEGACION.map(f => (f.id === 'bancos' ? { ...f, dueno: 'potte' } : f)),
    }));
    expect(clasificarFragmento('fui al banco').delegacion?.dueno).toBe('potte');
    expect(vigentes().delegacion.find(f => f.id === 'bancos')!.dueno).toBe('potte');
  });

  it('una persona agregada desde la app se reconoce por su alias', () => {
    expect(detectarResponsables('lo hace Marina')).toEqual([]);
    fijarVigentes(con({
      personas: [{ id: 'marina', nombre: 'Marina Gómez', rol: 'Compras', alias: ['marina'] }],
    }));
    expect(detectarResponsables('lo hace Marina')).toEqual(['marina']);
  });

  it('una tarea nueva frena una prioridad igual que las de fábrica', () => {
    fijarVigentes(con({
      delegacion: [...DELEGACION, {
        id: 'cobranzas', tarea: 'Llamar por cobranzas', dueno: 'potte',
        categoria: 'operativa', forzada: false, pistas: ['cobranza', 'llam* por deuda'],
      }],
    }));
    expect(clasificarFragmento('revisar cobranzas').delegacion?.tarea).toBe('Llamar por cobranzas');
  });
});

describe('unidades del plan semanal', () => {
  it('salen del perfil y siempre incluyen «toda la empresa»', () => {
    const v = resolver(con({
      perfil: {
        nombre: 'X', roles: [], base: '',
        unidades: [{ id: 'nueva', nombre: 'Unidad Nueva', corto: 'Nueva', detalle: '' }],
      },
    }));
    expect(v.unidades.map(u => u.id)).toEqual(['nueva', 'transversal']);
  });
});

describe('ids para filas nuevas', () => {
  it('salen del texto y nunca se repiten', () => {
    expect(idDesde('Llamar por cobranzas')).toBe('llamar_por_cobranzas');
    expect(idDesde('Trámites bancarios', ['tramites_bancarios'])).toBe('tramites_bancarios_2');
  });

  it('un texto sin letras igual da un id usable', () => {
    expect(idDesde('¿¿¿???')).toBe('item');
  });
});

describe('los viernes de una prueba salen del rango', () => {
  it('del 10/08 al 04/09 son cuatro', () => {
    expect(viernesEntre('2026-08-10', '2026-09-04'))
      .toEqual(['2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04']);
  });

  it('un rango dado vuelta no inventa fechas', () => {
    expect(viernesEntre('2026-09-04', '2026-08-10')).toEqual([]);
  });
});
