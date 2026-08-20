/**
 * config.ts — Lo que se puede cambiar desde la app, encima de lo que dice el código.
 *
 * El brief original fue tajante: las reglas van escritas en el código, porque
 * una configuración que hay que mantener es una configuración que nadie
 * mantiene. Eso sigue siendo cierto y por eso reglas.ts sigue existiendo tal
 * cual: la app arranca sabiendo la Ficha de Rol entera, sin que nadie cargue
 * nada.
 *
 * Pero hay una diferencia entre una REGLA y un DATO. «Un umbral se fija antes
 * de medir» es una regla. «El umbral son 6 horas» es un dato. «Las listas de
 * precios tienen un dueño único» es una regla; «ese dueño es Luciana» es un
 * dato. Los datos envejecen —alguien se va, una prueba termina, un número
 * cambia— y esperar un commit para corregirlos es lo que hace que una app
 * empiece a mentir.
 *
 * Entonces: los criterios viven en reglas.ts y no se editan desde ninguna
 * pantalla. Los datos se pueden editar, y cada sección editada queda marcada
 * como «tuya», con la fecha, y con un botón para volver al original.
 *
 * El modelo es a propósito grueso: una sección está de fábrica (null) o es
 * tuya (la lista entera). Sin diffs por campo, que es lo que vuelve
 * imposible de entender por qué la app dice lo que dice.
 */

import {
  CATEGORIAS, DECISIONES_PROPIAS, DELEGACION, DOTACION, INDICADORES,
  NUMEROS_UMBRAL, PERFIL, PERSONAS, REGLAS_SISTEMA, construirUmbrales,
  type Categoria, type CategoriaId, type DecisionPropia, type FilaDelegacion,
  type Indicador, type NumerosUmbral, type Perfil, type Persona, type PersonaConId,
  type PersonaId, type ReglaSistema, type Umbral, type Unidad, type Vacante,
} from './reglas';
import { PRUEBAS, type PruebaDeRol } from './pruebas';

export type SeccionConfig =
  | 'perfil' | 'personas' | 'categorias' | 'delegacion' | 'decisiones'
  | 'umbrales' | 'reglas' | 'indicadores' | 'pruebas' | 'dotacion';

export const SECCIONES: { id: SeccionConfig; titulo: string; resumen: string }[] = [
  { id: 'perfil',      titulo: 'Vos y las unidades',   resumen: 'Tu nombre, tus roles y las unidades de negocio.' },
  { id: 'personas',    titulo: 'El equipo',            resumen: 'Quién es quién y con qué nombres lo escribís.' },
  { id: 'delegacion',  titulo: 'Tabla de delegación',  resumen: 'Cada tarea con un dueño único. Es lo que frena tus prioridades.' },
  { id: 'decisiones',  titulo: 'Decisiones que son tuyas', resumen: 'Lo que la app nunca va a marcar como delegable.' },
  { id: 'categorias',  titulo: 'Categorías de tiempo', resumen: 'Cómo se llama y qué entra en cada una de las 8.' },
  { id: 'umbrales',    titulo: 'Umbrales de control',  resumen: 'Los números de los cuatro semáforos.' },
  { id: 'reglas',      titulo: 'Reglas del sistema',   resumen: 'Las que blindan todo lo demás.' },
  { id: 'indicadores', titulo: 'Indicadores',          resumen: 'Los tres números que te tocan por mes.' },
  { id: 'pruebas',     titulo: 'Pruebas de rol',       resumen: 'Personas a prueba, con fechas de revisión y decisión.' },
  { id: 'dotacion',    titulo: 'Vacantes abiertas',    resumen: 'Puestos sin cubrir, para que la app no mienta.' },
];

/** De una categoría solo se edita el texto: el color y el orden son estructura. */
export interface CategoriaEditable {
  id: CategoriaId;
  nombre: string;
  definicion: string;
  pistas: string[];
}

/** Igual que el indicador, pero sin el tipo de dato, que define la planilla. */
export interface IndicadorEditable {
  id: Indicador['id'];
  titulo: string;
  unidad: string;
  aclaracion: string;
}

/**
 * Cada sección es `null` (vale lo que dice el código) o la lista entera tuya.
 * `editado` guarda la fecha en que tocaste cada una, para poder mostrarlo.
 */
export interface ConfigApp {
  version: 1;
  perfil: Perfil | null;
  personas: PersonaConId[] | null;
  categorias: CategoriaEditable[] | null;
  delegacion: FilaDelegacion[] | null;
  decisiones: DecisionPropia[] | null;
  umbrales: NumerosUmbral | null;
  reglas: ReglaSistema[] | null;
  indicadores: IndicadorEditable[] | null;
  pruebas: PruebaDeRol[] | null;
  dotacion: Vacante[] | null;
  editado: Partial<Record<SeccionConfig, string>>;
}

export const CONFIG_VACIA: ConfigApp = {
  version: 1,
  perfil: null,
  personas: null,
  categorias: null,
  delegacion: null,
  decisiones: null,
  umbrales: null,
  reglas: null,
  indicadores: null,
  pruebas: null,
  dotacion: null,
  editado: {},
};

/** Lo que guardó una versión anterior puede venir con secciones que no existían. */
export function normalizarConfig(guardado: unknown): ConfigApp {
  const g = (guardado ?? {}) as Partial<ConfigApp>;
  return { ...CONFIG_VACIA, ...g, version: 1, editado: { ...(g.editado ?? {}) } };
}

export const PERSONAS_FABRICA: PersonaConId[] =
  Object.entries(PERSONAS).map(([id, p]) => ({ id, ...p }));

export const CATEGORIAS_FABRICA: CategoriaEditable[] =
  CATEGORIAS.map(c => ({ id: c.id, nombre: c.nombre, definicion: c.definicion, pistas: [...c.pistas] }));

export const INDICADORES_FABRICA: IndicadorEditable[] =
  INDICADORES.map(i => ({ id: i.id, titulo: i.titulo, unidad: i.unidad, aclaracion: i.aclaracion }));

/**
 * Las filas que la regla 3.3 clava en Ejecución Operativa. No es negociable y
 * por eso no depende de lo que haya guardado: se recalcula siempre desde acá.
 * Se puede cambiar el dueño de la fila —la gente cambia— pero no que la tarea
 * deje de contar como operativa.
 */
export const FORZADAS_DE_FABRICA: ReadonlySet<string> =
  new Set(DELEGACION.filter(f => f.forzada).map(f => f.id));

/**
 * Deja una tabla de delegación consistente con la regla 3.3, venga de donde
 * venga: si la fila es forzada, su categoría es Ejecución Operativa y punto.
 */
export function normalizarDelegacion(filas: readonly FilaDelegacion[]): FilaDelegacion[] {
  return filas
    .filter(f => f && f.id && f.tarea?.trim())
    .map(f => {
      const forzada = FORZADAS_DE_FABRICA.has(f.id) || Boolean(f.forzada);
      return {
        ...f,
        tarea: f.tarea.trim(),
        forzada,
        categoria: forzada ? 'operativa' : f.categoria,
        pistas: (f.pistas ?? []).map(p => p.trim()).filter(Boolean),
      };
    });
}

/** Todo lo que la app usa hoy para decidir, ya resuelto entre código y tus cambios. */
export interface Vigentes {
  perfil: Perfil;
  personas: Record<PersonaId, Persona>;
  personasLista: PersonaConId[];
  categorias: Categoria[];
  cat: Record<CategoriaId, Categoria>;
  delegacion: FilaDelegacion[];
  decisiones: DecisionPropia[];
  numeros: NumerosUmbral;
  umbrales: Umbral[];
  reglas: ReglaSistema[];
  indicadores: Indicador[];
  pruebas: PruebaDeRol[];
  vacantes: Vacante[];
  /** Unidades del plan semanal: las del perfil más «toda la empresa». */
  unidades: { id: string; nombre: string; corto: string }[];
}

const TRANSVERSAL = { id: 'transversal', nombre: 'Toda la empresa', corto: 'Empresa' };

function unidadesDe(perfil: Perfil): Vigentes['unidades'] {
  const propias = perfil.unidades
    .filter(u => u.id && u.nombre?.trim())
    .map(u => ({ id: u.id, nombre: u.nombre.trim(), corto: (u.corto || u.nombre).trim().slice(0, 10) }));
  return [...propias, TRANSVERSAL];
}

/**
 * El color y el orden de las categorías salen SIEMPRE del código: el orden fijo
 * es el mecanismo que garantiza que dos tramos vecinos de una barra apilada se
 * distingan también con daltonismo. Se edita el texto, no la paleta.
 */
function categoriasDe(edit: readonly CategoriaEditable[] | null): Categoria[] {
  if (!edit) return CATEGORIAS;
  const porId = new Map(edit.map(c => [c.id, c]));
  return CATEGORIAS.map(base => {
    const e = porId.get(base.id);
    if (!e) return base;
    return {
      ...base,
      nombre: e.nombre?.trim() || base.nombre,
      definicion: e.definicion?.trim() || base.definicion,
      pistas: (e.pistas ?? []).map(p => p.trim()).filter(Boolean),
    };
  });
}

function indicadoresDe(edit: readonly IndicadorEditable[] | null): Indicador[] {
  if (!edit) return INDICADORES;
  const porId = new Map(edit.map(i => [i.id, i]));
  return INDICADORES.map(base => {
    const e = porId.get(base.id);
    if (!e) return base;
    return {
      ...base,
      titulo: e.titulo?.trim() || base.titulo,
      unidad: e.unidad?.trim() || base.unidad,
      aclaracion: e.aclaracion?.trim() ?? base.aclaracion,
    };
  });
}

/** Resuelve la configuración contra los valores de fábrica. Función pura. */
export function resolver(cfg: ConfigApp = CONFIG_VACIA): Vigentes {
  const perfil = cfg.perfil ?? PERFIL;
  const personasLista = cfg.personas ?? PERSONAS_FABRICA;
  const personas: Record<PersonaId, Persona> = {};
  for (const p of personasLista) {
    if (!p?.id || !p.nombre?.trim()) continue;
    personas[p.id] = { nombre: p.nombre.trim(), rol: p.rol ?? '', alias: (p.alias ?? []).filter(Boolean) };
  }
  const numeros = cfg.umbrales ?? NUMEROS_UMBRAL;
  const categorias = categoriasDe(cfg.categorias);

  return {
    perfil,
    personas,
    personasLista,
    categorias,
    cat: Object.fromEntries(categorias.map(c => [c.id, c])) as Record<CategoriaId, Categoria>,
    delegacion: normalizarDelegacion(cfg.delegacion ?? DELEGACION),
    decisiones: cfg.decisiones ?? DECISIONES_PROPIAS,
    numeros,
    umbrales: construirUmbrales(numeros),
    reglas: cfg.reglas ?? REGLAS_SISTEMA,
    indicadores: indicadoresDe(cfg.indicadores),
    pruebas: cfg.pruebas ?? PRUEBAS,
    vacantes: cfg.dotacion ?? DOTACION.vacantes,
    unidades: unidadesDe(perfil),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Lo vigente, para las funciones puras.
 *
 * El clasificador es una función suelta que se llama desde media app y desde
 * los tests; pasarle las tablas en cada llamada sería ruido en cien lugares.
 * Vive acá un único valor vigente que el servicio de configuración fija una
 * vez al arrancar y cada vez que se guarda algo. Las vistas no lo usan: ellas
 * leen señales, para que un cambio se vea sin recargar.
 * ────────────────────────────────────────────────────────────────────────── */

let _vigentes: Vigentes = resolver();

export const vigentes = (): Vigentes => _vigentes;

export function fijarVigentes(cfg: ConfigApp): Vigentes {
  _vigentes = resolver(cfg);
  return _vigentes;
}

/** Solo para tests: vuelve todo al valor de fábrica. */
export function restablecerVigentes(): void { _vigentes = resolver(); }

/* ── Ayudas para editar sin romper ───────────────────────────────────────── */

/** Id legible a partir de un texto, para filas y personas nuevas. */
export function idDesde(texto: string, existentes: readonly string[] = []): string {
  const base = (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'item';
  if (!existentes.includes(base)) return base;
  for (let i = 2; i < 999; i++) if (!existentes.includes(`${base}_${i}`)) return `${base}_${i}`;
  return `${base}_${existentes.length}`;
}

/** Dónde se está usando una persona: no se borra a alguien que tiene tareas. */
export function usosDePersona(id: PersonaId, v: Vigentes): string[] {
  return v.delegacion.filter(f => f.dueno === id).map(f => f.tarea);
}
