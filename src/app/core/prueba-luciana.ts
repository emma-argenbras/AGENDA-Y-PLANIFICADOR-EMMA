/**
 * prueba-luciana.ts — Sección 4 del brief: la primera prueba de rol.
 *
 * Prueba de 4 semanas: 10/08/2026 → 04/09/2026. Decisión el 05/09 en Directorio.
 *
 * Es el valor de fábrica. Las fechas de una prueba son lo primero que se pone
 * viejo, así que se pueden editar desde la app (Configuración → Pruebas de
 * rol) sin esperar un commit.
 */

export type TipoSenal = 'bool' | 'num' | 'opcion';

export interface Senal {
  id: string;
  tipo: TipoSenal;
  pregunta: string;
  bueno?: boolean | string;
  objetivo?: number;
  mejorEs?: 'menor' | 'mayor';
  opciones?: string[];
  ayuda?: string;
  destacada?: boolean;
}

export interface RegistroRevision {
  [clave: string]: unknown;
  registrado?: number;
}

export type RegistrosPrueba = Record<string, RegistroRevision | undefined> & {
  __cierre?: { salida: string; titulo: string; nota: string; fecha: string };
};

export interface SalidaPrueba { id: string; titulo: string; detalle: string; }

export interface PendientePrueba { id: string; texto: string; recomendado: string; nota: string; }

/**
 * La forma de una prueba de rol. Encargo, límites, revisiones con fecha,
 * señales y las salidas posibles: sin las cinco cosas, no es una prueba, es
 * una expectativa.
 */
export interface PruebaDeRol {
  id: string;
  persona: string;
  inicio: string;
  fin: string;
  decision: string;
  decisionDonde: string;
  encargo: string[];
  noHace: string[];
  /** Revisiones de 15 min, todos los viernes. */
  revisiones: string[];
  duracionRevision: number;
  /** Regla explícita del acuerdo. La app la hace visible, no la suaviza. */
  reglaCancelacion: string;
  /** Señales a registrar en CADA revisión. */
  senales: Senal[];
  objetivoMejoras: number;
  /** Las salidas posibles el día de la decisión. Se elige una, no se inventa otra. */
  salidas: SalidaPrueba[];
  /** Pendientes sin resolver, con la recomendación explícita. */
  pendientes: PendientePrueba[];
}

export const PRUEBA: PruebaDeRol = {
  id: 'luciana_2026_08',
  persona: 'Luciana Dalzotto',
  inicio: '2026-08-10',
  fin: '2026-09-04',
  decision: '2026-09-05',
  decisionDonde: 'Directorio',

  encargo: [
    'Ordenar el flujo de prospectos de todos los rubros: recibir, calificar y derivar con ficha completa.',
    'Sostener el pipeline huérfano de Construcción (contacto en menos de 72 hs).',
    'Coordinar cargas con Sergio.',
    'Traer 1 mejora de proceso por semana.'
  ],

  noHace: [
    'No cierra ventas de Construcción.',
    'No tiene gente a cargo.',
    'No cambia de título durante la prueba.',
    'No cambia de comisión durante la prueba.'
  ],

  /** Revisiones de 15 min, todos los viernes. */
  revisiones: ['2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04'],
  duracionRevision: 15,

  /** Regla explícita del acuerdo. La app la hace visible, no la suaviza. */
  reglaCancelacion: 'Si las revisiones no se hacen, la prueba se cancela.',

  /** Señales a registrar en CADA revisión. */
  senales: [
    { id: 'fichas',    tipo: 'bool',  pregunta: '¿Las derivaciones fueron con ficha completa?', bueno: true },
    { id: 'sin72',     tipo: 'num',   pregunta: 'Prospectos sin contactar +72 hs', objetivo: 0, mejorEs: 'menor',
      ayuda: 'Objetivo: cero.' },
    { id: 'higiene',   tipo: 'opcion', pregunta: 'Higiene vs julio (facturación / clientes activos)',
      opciones: ['Se mantiene o sube', 'Cae'], bueno: 'Se mantiene o sube', destacada: true,
      ayuda: 'La señal más importante: si Higiene cae, la prueba está costando el negocio base.' },
    { id: 'resuelve',  tipo: 'opcion', pregunta: '¿Trae problemas resueltos o solo reportados?',
      opciones: ['Resueltos', 'Solo reportados'], bueno: 'Resueltos' },
    { id: 'mejoras',   tipo: 'num',   pregunta: 'Mejoras propuestas sin pedírselas (esta semana)', objetivo: 1, mejorEs: 'mayor',
      ayuda: 'Objetivo acumulado: 4 en 4 semanas.' },
    { id: 'permisos',  tipo: 'opcion', pregunta: '¿Pide permiso para cosas que puede decidir sola?',
      opciones: ['No, decide', 'Sí, pide permiso'], bueno: 'No, decide' }
  ],

  objetivoMejoras: 4,

  /** Las tres salidas posibles el 05/09. Se elige una, no se inventa una cuarta. */
  salidas: [
    { id: 'A', titulo: 'Responsable multi-rubro', detalle: 'Con gente a cargo.' },
    { id: 'B', titulo: 'Coordinadora Comercial', detalle: 'Sin gente a cargo.' },
    { id: 'C', titulo: 'Vuelve a Higiene exclusivo', detalle: 'Y se contrata un Responsable de Construcción dedicado.' }
  ],

  /** Pendiente sin resolver, con la recomendación explícita del brief. */
  pendientes: [
    {
      id: 'reemplazo_facundo',
      texto: '¿Se busca reemplazo de Facundo en paralelo a la prueba?',
      recomendado: 'Sí',
      nota: 'Decisión 5 de la Ficha de Rol: incorporación de gente clave es tuya y de nadie más.'
    }
  ]
};

export type EstadoRevision = 'hecha' | 'vencida' | 'hoy' | 'pendiente' | 'previa';

/**
 * Estado de la prueba según la fecha de hoy y lo registrado.
 * Nunca devuelve vacío: si no hay datos, dice exactamente eso.
 *
 * `inicio` es la fecha desde la que la app cuenta. Una revisión anterior a esa
 * fecha queda 'previa': no se registró y no se va a registrar, pero tampoco es
 * una deuda tuya —pasó antes de que empezaras a usar esto—. Reclamar por algo
 * que ocurrió antes del primer día es la forma más rápida de que dejes de
 * mirar los avisos.
 */
export function estadoPrueba(
  hoyISO: string,
  registros: RegistrosPrueba = {},
  prueba: PruebaDeRol = PRUEBA,
  inicio: string | null = null,
) {
  const revisiones = prueba.revisiones.map(fecha => {
    const reg = registros[fecha];
    let estado: EstadoRevision;
    if (reg) estado = 'hecha';
    else if (inicio && fecha < inicio) estado = 'previa';
    else if (fecha < hoyISO) estado = 'vencida';
    else if (fecha === hoyISO) estado = 'hoy';
    else estado = 'pendiente';
    return { fecha, estado, datos: reg || null };
  });

  const vencidas = revisiones.filter(r => r.estado === 'vencida');
  const hechas = revisiones.filter(r => r.estado === 'hecha');
  const mejoras = hechas.reduce((s, r) => s + (Number(r.datos?.['mejoras']) || 0), 0);
  const higieneCae = hechas.some(r => r.datos?.['higiene'] === 'Cae');

  let riesgo: { nivel: 'rojo'; texto: string } | null = null;
  if (vencidas.length >= 2) {
    riesgo = { nivel: 'rojo', texto: `${vencidas.length} revisiones vencidas sin registrar: ${vencidas.map(v => v.fecha.slice(8) + '/' + v.fecha.slice(5, 7)).join(', ')}.` };
  } else if (vencidas.length === 1) {
    riesgo = { nivel: 'rojo', texto: `La revisión del ${vencidas[0].fecha.slice(8)}/${vencidas[0].fecha.slice(5, 7)} quedó sin registrar.` };
  } else if (higieneCae) {
    riesgo = { nivel: 'rojo', texto: 'Higiene cayó en al menos una revisión: es la señal más importante de la prueba.' };
  }

  return {
    revisiones,
    previas: revisiones.filter(r => r.estado === 'previa').length,
    hechas: hechas.length,
    vencidas: vencidas.length,
    mejoras,
    objetivoMejoras: prueba.objetivoMejoras,
    diasParaDecision: diasEntre(hoyISO, prueba.decision),
    riesgo,
    cerrada: Boolean(registros.__cierre),
    cierre: registros.__cierre || null
  };
}

export function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = Date.parse(desdeISO + 'T00:00:00');
  const b = Date.parse(hastaISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
