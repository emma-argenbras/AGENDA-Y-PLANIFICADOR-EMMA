/**
 * clasificador.ts — Motor que aplica las reglas 3.2, 3.3 y 3.4 a texto libre.
 *
 * Entrada: una frase escrita o dictada ("cargué pedidos toda la mañana y fui al
 * banco"). Salida: segmentos con categoría asignada y, si corresponde, la marca
 * roja de "NO ES TUYA" con el dueño real.
 *
 * Principio: la app decide, no pregunta. Si no puede decidir, deja el segmento
 * en 'sin_clasificar' y ofrece 8 chips — nunca un formulario.
 */

import type { CategoriaId, PersonaId, TotalesSemana } from './reglas';
import { vigentes } from './config';

export interface Delegacion {
  id: string;
  tarea: string;
  dueno: PersonaId;
  duenoNombre: string;
  excepcion: string | null;
}

export interface Segmento {
  texto: string;
  categoria: CategoriaId | null;
  forzada: boolean;
  delegacion: Delegacion | null;
  decisionPropia: { id: string; texto: string } | null;
  confianza: 'alta' | 'media' | 'baja';
  horas: number;
}

export interface Checkin {
  fecha: string;
  texto: string;
  segmentos: Segmento[];
  creado: number;
  actualizado?: number;
}

interface ConPistas { pistas: string[] }
interface Match<T> { item: T; score: number; hits: string[] }

export function normalizar(txt: string | null | undefined): string {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const _reCache = new Map<string, RegExp>();

/**
 * Construye la expresión de una pista.
 *  - "margen"      → margen / margenes (plural simple)
 *  - "analiz*"     → analizar, analizando, analicé... (raíz)
 *  - "lista de precios" tolera hasta 2 palabras cortas intercaladas
 *    ("lista de los precios", "cargué el pedido").
 */
function pistaToRegex(pista: string): RegExp {
  let re = _reCache.get(pista);
  if (re) return re;
  const partes = pista.split(' ').map(w =>
    w.endsWith('*') ? escapeRe(w.slice(0, -1)) + '[a-z0-9]*' : escapeRe(w) + '(?:s|es)?'
  );
  re = new RegExp('(^|[^a-z0-9])' + partes.join('\\s+(?:[a-z]{1,4}\\s+){0,2}') + '([^a-z0-9]|$)');
  _reCache.set(pista, re);
  return re;
}

/** Coincidencia por palabra completa. Devuelve el largo de la pista como score. */
function matchPista(norm: string, pista: string): number {
  return pistaToRegex(pista).test(norm) ? pista.length : 0;
}

function mejorMatch<T extends ConPistas>(norm: string, items: readonly T[]): Match<T> | null {
  let best: Match<T> | null = null;
  for (const item of items) {
    let score = 0;
    const hits: string[] = [];
    for (const p of item.pistas) {
      const s = matchPista(norm, p);
      if (s > score) score = s;
      if (s) hits.push(p);
    }
    if (score && (!best || score > best.score)) best = { item, score, hits };
  }
  return best;
}

/**
 * Separadores que puso alguien a propósito: renglones, puntos, punto y coma.
 * Un punto entre dígitos no separa nada: es «1.5 h».
 */
const SEPARA_FUERTE = /\n+|(?<![0-9])[.;]+(?![0-9])/;

/** Los que hay que adivinar, porque también aparecen dentro de una sola idea. */
const SEPARA_BLANDO =
  /,\s*|\s+y\s+|\s+e\s+|\s+\+\s+|\s+tambien\s+|\s+también\s+|\s+ademas\s+|\s+además\s+/i;

const partir = (texto: string, re: RegExp): string[] =>
  texto.split(re).map(s => s.trim()).filter(s => normalizar(s).length >= 3);

/** ¿El fragmento dice algo por sí solo, o es un pedazo suelto de una frase? */
function diceAlgo(fragmento: string): boolean {
  const c = clasificarFragmento(fragmento);
  return c.categoria !== null || c.delegacion !== null;
}

/**
 * Divide el cierre del día en fragmentos clasificables.
 *
 * Si separaste vos —con puntos o renglones— se respeta eso y nada más. Antes
 * se seguía cortando por comas y por «y» aunque hubiera puntos, así que quien
 * se tomaba el trabajo de separar igual veía sus cosas partidas de nuevo.
 *
 * Sin separación explícita hay que adivinar, porque «cargué pedidos y fui al
 * banco» son dos cosas y hay que contarlas aparte. Pero se parte solo si cada
 * pedazo dice algo por su cuenta: «reunión con Seba, Luciana y Bruno» son tres
 * nombres de una misma reunión, no tres reuniones, y partirla repartía las
 * horas del día entre pedazos que no significan nada.
 */
export function segmentar(texto: string): string[] {
  const limpio = (texto || '').trim();
  if (!limpio) return [];

  const fuertes = partir(limpio, SEPARA_FUERTE);
  if (fuertes.length > 1) return fuertes;

  const blandos = partir(limpio, SEPARA_BLANDO);
  if (blandos.length > 1 && blandos.every(diceAlgo)) return blandos;

  return fuertes.length ? fuertes : [limpio];
}

/**
 * Clasifica UN fragmento.
 * Orden de precedencia:
 *  1. Tabla de delegación (3.2). Si la fila es `forzada`, la categoría queda
 *     clavada en Ejecución Operativa por la regla 3.3 y no se puede cambiar.
 *  2. Decisiones propias (3.1) — nunca se marcan como delegables.
 *  3. Pistas de categoría (3.4).
 */
export function clasificarFragmento(texto: string): Segmento {
  const v = vigentes();
  const norm = normalizar(texto);
  const del = mejorMatch(norm, v.delegacion);
  const propia = mejorMatch(norm, v.decisiones);
  const cat = mejorMatch(norm, v.categorias);

  const res: Segmento = {
    texto: (texto || '').trim(),
    categoria: null,
    forzada: false,
    delegacion: null,
    decisionPropia: null,
    confianza: 'baja',
    horas: 0,
  };

  if (propia) {
    res.decisionPropia = { id: propia.item.id, texto: propia.item.texto };
  }

  if (del) {
    const d = del.item;
    // Una decisión propia MÁS específica que la fila de delegación gana:
    // "definir el margen" es tuyo aunque la frase mencione la lista de precios.
    const propiaGana = propia && propia.score > del.score && !d.forzada;
    if (!propiaGana) {
      res.delegacion = {
        id: d.id,
        tarea: d.tarea,
        dueno: d.dueno,
        duenoNombre: v.personas[d.dueno]?.nombre || d.dueno,
        excepcion: d.excepcion || null
      };
      res.categoria = d.categoria;
      res.forzada = Boolean(d.forzada);
      res.confianza = 'alta';
      return res;
    }
  }

  if (propia) {
    res.categoria = 'estrategia';
    res.confianza = propia.score >= 8 ? 'alta' : 'media';
    return res;
  }

  if (cat) {
    res.categoria = cat.item.id;
    res.confianza = cat.score >= 8 ? 'alta' : 'media';
    return res;
  }

  res.categoria = null; // sin_clasificar: la UI muestra los 8 chips
  return res;
}

/**
 * Clasifica un check-in completo y reparte horas.
 * `horasDia` por defecto 8: si no ajusta nada, igual queda un registro usable.
 */
export function clasificarCheckin(texto: string, horasDia = 8): { segmentos: Segmento[]; horasDia: number } {
  const segmentos = segmentar(texto).map(clasificarFragmento);
  if (!segmentos.length) return { segmentos: [], horasDia };
  const pesoTotal = segmentos.reduce((s, x) => s + Math.max(3, x.texto.length), 0);
  segmentos.forEach(s => {
    const bruto = (Math.max(3, s.texto.length) / pesoTotal) * horasDia;
    s.horas = Math.max(0.25, Math.round(bruto * 4) / 4); // pasos de cuarto de hora
  });
  return { segmentos, horasDia };
}

/**
 * Filtro para prioridades del día (punto 3 del brief): nada de la tabla 3.2
 * puede entrar como prioridad tuya.
 */
export function evaluarPrioridad(texto: string) {
  const c = clasificarFragmento(texto);
  if (c.delegacion) {
    return {
      permitida: false,
      motivo: `Esto es de ${c.delegacion.duenoNombre}: ${c.delegacion.tarea}.`,
      delegacion: c.delegacion,
      clasificacion: c
    };
  }
  return { permitida: true, clasificacion: c };
}

/**
 * Regla 3.6.1 — un solo nombre por tarea.
 * Devuelve los responsables detectados; con más de uno, nadie es responsable.
 */
export function detectarResponsables(texto: string): PersonaId[] {
  const norm = normalizar(texto);
  const encontrados = new Set<PersonaId>();
  for (const [id, p] of Object.entries(vigentes().personas)) {
    for (const alias of p.alias) {
      if (matchPista(norm, normalizar(alias))) { encontrados.add(id as PersonaId); break; }
    }
  }
  return [...encontrados];
}

export function validarResponsableUnico(texto: string) {
  const t = (texto || '').trim();
  if (!t) return { ok: false, motivo: 'Falta el responsable.' };
  const ids = detectarResponsables(t);
  const separadores = /( y | e |\/|,|&| o )/i.test(t);
  if (ids.length > 1 || (separadores && ids.length !== 1)) {
    const personas = vigentes().personas;
    return {
      ok: false,
      motivo: 'Más de un responsable: si aparece más de un nombre, nadie es responsable (regla 1).',
      detectados: ids.map(i => personas[i]?.nombre ?? i)
    };
  }
  const personas = vigentes().personas;
  return { ok: true, detectados: ids.map(i => personas[i]?.nombre || t) };
}

/** Totales semanales para los umbrales de 3.5. */
export function totalesSemana(checkins: readonly Checkin[]): TotalesSemana {
  const porCategoria: Record<string, number> = {};
  const diasConCategoria: Record<string, number> = {};
  let total = 0;
  const dias = new Set<string>();
  for (const ck of checkins) {
    if (!ck?.segmentos?.length) continue;
    dias.add(ck.fecha);
    const vistas = new Set<string>();
    for (const s of ck.segmentos) {
      const cat = s.categoria || 'sin_clasificar';
      const h = Number(s.horas) || 0;
      porCategoria[cat] = (porCategoria[cat] || 0) + h;
      total += h;
      if (!vistas.has(cat)) { diasConCategoria[cat] = (diasConCategoria[cat] || 0) + 1; vistas.add(cat); }
    }
  }
  return { porCategoria, diasConCategoria, total, diasRegistrados: dias.size } as TotalesSemana;
}

/** Tareas de la tabla 3.2 que hiciste vos, agrupadas por dueño real. */
export function fugasDelegacion(checkins: readonly Checkin[]) {
  const porDueno: Record<string, { dueno: string; nombre: string; horas: number; tareas: Set<string>; veces: number }> = {};
  for (const ck of checkins) {
    for (const s of ck?.segmentos ?? []) {
      if (!s.delegacion) continue;
      const k = s.delegacion.dueno;
      porDueno[k] ??= { dueno: k, nombre: s.delegacion.duenoNombre, horas: 0, tareas: new Set(), veces: 0 };
      porDueno[k].horas += Number(s.horas) || 0;
      porDueno[k].tareas.add(s.delegacion.tarea);
      porDueno[k].veces++;
    }
  }
  return Object.values(porDueno)
    .map(x => ({ ...x, tareas: [...x.tareas] }))
    .sort((a, b) => b.horas - a.horas);
}
