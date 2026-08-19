/**
 * reglas.ts — Lógica de negocio de la Ficha de Rol (secciones 3.1 a 3.7 del brief).
 *
 * ESTO ES CÓDIGO, NO CONFIGURACIÓN.
 * No hay pantalla de ajustes que edite nada de este archivo. Si una regla cambia,
 * cambia acá, se commitea y queda versionada.
 *
 * Los colores son los ocho slots categóricos de la paleta validada (claro y
 * oscuro), asignados en orden fijo: el orden es el mecanismo que garantiza que
 * dos categorías vecinas de una barra apilada se distingan también con daltonismo.
 * No reordenar sin volver a correr el validador.
 *
 * Fuente: Ficha de Rol del 08/08/2026 + Manual de Gestión Comercial.
 */

export type CategoriaId =
  | 'estudio' | 'estrategia' | 'reuniones' | 'equipo'
  | 'ventas' | 'marketing' | 'operativa' | 'personal';

export type PersonaId =
  | 'seba' | 'luciana' | 'leila' | 'potte' | 'jalo'
  | 'sergio' | 'bruno' | 'comex' | 'comercial' | 'emma';

export type Estado = 'verde' | 'amarillo' | 'rojo' | 'gris';

export interface Persona { nombre: string; rol: string; alias: string[]; }

export interface Categoria {
  id: CategoriaId;
  n: number;
  nombre: string;
  color: string;        // superficie clara
  colorOscuro: string;  // superficie oscura
  definicion: string;
  pistas: string[];
  operativa?: boolean;
}

export interface FilaDelegacion {
  id: string;
  tarea: string;
  dueno: PersonaId;
  categoria: CategoriaId;
  forzada: boolean;
  excepcion?: string;
  pistas: string[];
}

export interface DecisionPropia { id: string; texto: string; pistas: string[]; }

export interface TotalesSemana {
  porCategoria: Partial<Record<CategoriaId | 'sin_clasificar', number>>;
  diasConCategoria: Partial<Record<CategoriaId | 'sin_clasificar', number>>;
  total: number;
  diasRegistrados: number;
}

export interface ResultadoUmbral { estado: Estado; valor: number; texto: string; }

export interface Umbral {
  id: string;
  titulo: string;
  regla: string;
  proyectado?: number;
  evaluar(t: TotalesSemana): ResultadoUmbral;
}

export interface Indicador {
  id: 'margen' | 'recompra' | 'caja60';
  titulo: string;
  unidad: string;
  aclaracion: string;
  tipo: 'moneda' | 'entero';
}

export const PERFIL = {
  nombre: 'Emmanuel Van Breedam',
  roles: ['Director General — ArgenBras', 'Director — LTA World Trading'],
  base: 'Concordia, Entre Ríos, Argentina',
  unidades: [
    { id: 'construccion', nombre: 'Construcción', detalle: 'Cielorrasos PVC, aislamientos termoacústicos' },
    { id: 'papeleria', nombre: 'Papelería / Higiene', detalle: 'Doméstico e institucional' },
    { id: 'lta', nombre: 'LTA / Comex', detalle: 'Comercio exterior' }
  ]
};

/** Quién es quién. Se usa para validar la regla "un solo nombre por tarea". */
export const PERSONAS: Record<PersonaId, Persona> = {
  seba:    { nombre: 'Sebastián Van Breedam', rol: 'Director Comercial — Construcción', alias: ['seba', 'sebastian', 'sebastián'] },
  luciana: { nombre: 'Luciana Dalzotto', rol: 'Responsable de área — Papelería/Higiene', alias: ['luciana', 'lu', 'dalzotto'] },
  leila:   { nombre: 'Leila', rol: 'Bancos y compras de oficina', alias: ['leila'] },
  potte:   { nombre: 'Potte', rol: 'Comprobantes IVA y administrativo personal', alias: ['potte'] },
  jalo:    { nombre: 'Jalo', rol: 'Despachos, encomiendas y muestras', alias: ['jalo'] },
  sergio:  { nombre: 'Sergio', rol: 'NF Brasil y coordinación de cargas', alias: ['sergio'] },
  bruno:   { nombre: 'Bruno', rol: 'Redes, contenido y MercadoLibre', alias: ['bruno'] },
  comex:   { nombre: 'Comex', rol: 'Seguimiento operativo de cargas', alias: ['comex'] },
  comercial: { nombre: 'Comercial de la unidad', rol: 'Luciana o Seba según el rubro', alias: ['comercial'] },
  emma:    { nombre: 'Emmanuel (vos)', rol: 'Dirección General', alias: ['emma', 'emmanuel', 'yo'] }
};

/** Vacantes y cambios de dotación vivos, para que la app no mienta. */
export const DOTACION = {
  vacantes: [
    {
      puesto: 'Comercial de Construcción',
      desde: '2026-08-01',
      nota: 'Facundo Benítez se dio de baja en agosto/2026 tras ~3 meses. Sin reemplazo definido.'
    }
  ]
};

/* ────────────────────────────────────────────────────────────────────────────
 * 3.1 — Las 7 decisiones que SON tuyas y de nadie más.
 * Si una tarea cae acá, la app NO la marca como delegable jamás.
 * ────────────────────────────────────────────────────────────────────────── */
export const DECISIONES_PROPIAS: DecisionPropia[] = [
  { id: 'precios',      texto: 'Política de precios y margen mínimo por línea',      pistas: ['politica de precios', 'margen minimo', 'fij* margen', 'defin* precio', 'defin* margen', 'rentabilidad por linea'] },
  { id: 'proveedores',  texto: 'Alta y baja de marcas/fábricas proveedoras',          pistas: ['alta de marca', 'baja de marca', 'nueva fabrica', 'fabrica nueva', 'proveedor nuevo', 'nuevo proveedor', 'representacion de marca'] },
  { id: 'mercados',     texto: 'Apertura de mercados y países nuevos',                pistas: ['mercado nuevo', 'nuevo mercado', 'nuevo pais', 'abr* mercado', 'apertura de mercado', 'export* a'] },
  { id: 'exclusividad', texto: 'Acuerdos de distribución exclusiva',                  pistas: ['exclusividad', 'exclusiv*', 'distribucion exclusiva', 'acuerdo exclusivo'] },
  { id: 'gente_clave',  texto: 'Incorporación y desvinculación de gente clave',       pistas: ['contrat*', 'incorpor*', 'desvincul*', 'desped*', 'busqueda de reemplazo', 'reemplaz*', 'entrevist*', 'candidato', 'cv'] },
  { id: 'comisiones',   texto: 'Esquema de comisiones',                               pistas: ['comision', 'esquema de comision'] },
  { id: 'inversores',   texto: 'Búsqueda y negociación con inversores',               pistas: ['inversor', 'ronda de inversion', 'capital', 'socio inversor'] }
];

/* ────────────────────────────────────────────────────────────────────────────
 * 3.4 — Las 8 categorías de tiempo, con su definición exacta.
 * `operativa: true` marca la categoría 7, que es la que la Ficha de Rol dice
 * que no debería existir en tu semana.
 * ────────────────────────────────────────────────────────────────────────── */
export const CATEGORIAS: Categoria[] = [
  { id: 'estudio', n: 1, nombre: 'Estudio', color: '#2a78d6', colorOscuro: '#3987e5',
    definicion: 'Formación propia, leer, capacitarse.',
    pistas: ['estudi*', 'leer', 'lei', 'leyendo', 'lectura', 'curso', 'capacitacion propia', 'formacion', 'libro', 'webinar', 'aprend*', 'certificacion'] },

  { id: 'estrategia', n: 2, nombre: 'Estrategia y planificación', color: '#eb6834', colorOscuro: '#d95926',
    definicion: 'Pensar el negocio, definir precios, analizar números, planificar.',
    pistas: ['estrategia', 'estrategico', 'planific*', 'pensar el negocio', 'analiz* numero', 'analiz* el mes', 'analisis', 'margen', 'rentabilidad', 'proyeccion', 'proyect* numero', 'presupuesto anual', 'defin* precio', 'politica de precios', 'plan de', 'organizar el ano', 'revis* numero'] },

  { id: 'reuniones', n: 3, nombre: 'Reuniones internas', color: '#1baf7a', colorOscuro: '#199e70',
    definicion: 'Directorio, reuniones por área, reuniones de equipo.',
    pistas: ['directorio', 'reuni*', 'revision con', 'revision de 15', 'uno a uno', 'reunion interna', 'reunion de area', 'reunion de equipo', 'reunion con seba', 'reunion con luciana', 'daily', 'revision semanal', 'comite'] },

  { id: 'equipo', n: 4, nombre: 'Gestión equipo / consultas', color: '#eda100', colorOscuro: '#c98500',
    definicion: 'Responder consultas, desbloquear gente, acompañar, interrupciones.',
    pistas: ['consult*', 'me consultaron', 'interrup*', 'interrump*', 'desbloque*', 'acompan*', 'ayud* a', 'explic* al equipo', 'whatsapp del equipo', 'pregunta del equipo', 'apagar incendios', 'me trajeron problemas'] },

  { id: 'ventas', n: 5, nombre: 'Venta y clientes', color: '#e87ba4', colorOscuro: '#d55181',
    definicion: 'Meets con clientes, negociar, cerrar distribuidores, capacitar clientes.',
    pistas: ['cliente', 'meet con', 'reunion con cliente', 'negoci*', 'distribuidor', 'cerr* venta', 'visit* cliente', 'visita comercial', 'capacit* cliente', 'prospecto', 'llamada con', 'atend* cliente'] },

  { id: 'marketing', n: 6, nombre: 'Marketing', color: '#008300', colorOscuro: '#008300',
    definicion: 'Campañas, redes, ML, métricas, ecommerce, contenido.',
    pistas: ['campana', 'redes', 'instagram', 'facebook', 'contenido', 'reel', 'posteo', 'postear', 'publicidad', 'ads', 'metrica', 'ecommerce', 'tienda online', 'mercadolibre', 'mercado libre', 'catalogo'] },

  { id: 'operativa', n: 7, nombre: 'Ejecución operativa', color: '#4a3aa7', colorOscuro: '#9085e9', operativa: true,
    definicion: 'Cargar pedidos, presupuestos, CRM, despachos, NF, listas de precios, bancos, comprobantes.',
    pistas: ['planilla', 'administrativo', 'factur*', 'remito', 'stock', 'inventario', 'cotiz* flete', 'cargar datos', 'papeleo'] },

  { id: 'personal', n: 8, nombre: 'Personal/admin', color: '#e34948', colorOscuro: '#e66767',
    definicion: 'Todo lo que no es de la empresa.',
    pistas: ['personal', 'familia', 'medico', 'dentista', 'tramite personal', 'casa', 'auto', 'vacaciones', 'gimnasio', 'escuela', 'obra social'] }
];

export const CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c])) as Record<CategoriaId, Categoria>;

/* ────────────────────────────────────────────────────────────────────────────
 * 3.2 — Tabla de delegación obligatoria (tarea → dueño único).
 * 3.3 — Regla de mapeo de tiempo: las filas con `forzada: true` van SIEMPRE a
 *       Ejecución Operativa, aunque la agenda dijera otra cosa. No es
 *       negociable y la app no deja sobreescribirlo a mano.
 * ────────────────────────────────────────────────────────────────────────── */
export const DELEGACION: FilaDelegacion[] = [
  { id: 'bancos', tarea: 'Trámites bancarios presenciales', dueno: 'leila',
    categoria: 'operativa', forzada: true,
    pistas: ['banco', 'bancari*', 'chequera', 'cheque', 'deposito bancario', 'ir al banco', 'homebanking', 'plazo fijo', 'token del banco'] },

  { id: 'compras_oficina', tarea: 'Compras de oficina e insumos', dueno: 'leila',
    categoria: 'operativa', forzada: false,
    pistas: ['compra de oficina', 'insumo', 'resma', 'articulo de oficina', 'libreria', 'compr* cafe', 'cartucho', 'toner', 'papeleria de oficina'] },

  { id: 'iva', tarea: 'Recopilación de comprobantes IVA', dueno: 'potte',
    categoria: 'operativa', forzada: true,
    pistas: ['comprobante', 'iva', 'libro iva', 'junt* factura', 'rendicion de gastos', 'gasto personal'] },

  { id: 'pedidos', tarea: 'Carga de pedidos y presupuestos', dueno: 'comercial',
    categoria: 'operativa', forzada: true,
    pistas: ['carg* pedido', 'carga de pedidos', 'pedido', 'presupuesto', 'cotizacion', 'nota de pedido', 'orden de compra', 'pas* presupuesto'] },

  { id: 'despachos', tarea: 'Despachos, encomiendas y muestras', dueno: 'jalo',
    categoria: 'operativa', forzada: true,
    pistas: ['despacho', 'encomienda', 'muestra', 'andreani', 'via cargo', 'correo argentino', 'mand* paquete', 'envi* muestra'] },

  { id: 'nf', tarea: 'Emisión/cancelación de NF Brasil', dueno: 'sergio',
    categoria: 'operativa', forzada: true,
    pistas: ['nf', 'nfe', 'nota fiscal', 'factura brasil', 'emit* nf', 'cancel* nf'] },

  { id: 'contenido', tarea: 'Programación y edición de contenido/redes', dueno: 'bruno',
    categoria: 'marketing', forzada: false,
    pistas: ['program* contenido', 'edit* video', 'edicion de video', 'redes', 'instagram', 'reel', 'posteo', 'postear', 'canva', 'grab* contenido', 'grab* reel', 'story', 'stories'] },

  { id: 'mercadolibre', tarea: 'Publicaciones y gestión MercadoLibre', dueno: 'bruno',
    categoria: 'marketing', forzada: false,
    pistas: ['mercadolibre', 'mercado libre', 'publicacion en ml', 'publicacion', 'pregunta de ml', 'reputacion ml'] },

  { id: 'listas', tarea: 'Listas de precios (armado y actualización)', dueno: 'luciana',
    categoria: 'operativa', forzada: true, excepcion: 'Vos solo fijás el margen (decisión 1).',
    pistas: ['lista de precios', 'actualiz* lista', 'arm* lista', 'actualizacion de precios', 'carg* precio'] },

  { id: 'cargas', tarea: 'Seguimiento operativo de cargas', dueno: 'comex',
    categoria: 'operativa', forzada: false,
    pistas: ['seguimiento de carga', 'contenedor', 'booking', 'despachante', 'aduana', 'tracking', 'camion', 'logistica', 'coordin* carga'] },

  { id: 'crm', tarea: 'Actualización de CRM', dueno: 'comercial',
    categoria: 'operativa', forzada: true, excepcion: 'Lo carga el comercial que habló con el cliente.',
    pistas: ['crm', 'carg* crm', 'actualiz* crm', 'carg* contacto', 'pipedrive', 'hubspot'] }
];

/* ────────────────────────────────────────────────────────────────────────────
 * 3.5 — Umbrales de control. Fijados ANTES de medir. No se ajustan post-hoc:
 * cambiar estos números requiere un commit, no un click.
 * Cada evaluador devuelve { estado: 'verde'|'amarillo'|'rojo'|'gris', texto }.
 * ────────────────────────────────────────────────────────────────────────── */
export const UMBRALES: Umbral[] = [
  {
    id: 'marketing',
    titulo: 'Marketing',
    regla: '>6 hs/sem = falta contratar a alguien. <3 hs/sem = no era un problema real.',
    evaluar(t: TotalesSemana): ResultadoUmbral {
      const h = t.porCategoria['marketing'] ?? 0;
      if (t.total === 0) return { estado: 'gris', valor: h, texto: 'Sin registro esta semana.' };
      if (h > 6) return { estado: 'rojo', valor: h, texto: `${fmtH(h)} en marketing: falta contratar a alguien para esto.` };
      if (h < 3) return { estado: 'verde', valor: h, texto: `${fmtH(h)}: no era un problema real.` };
      return { estado: 'amarillo', valor: h, texto: `${fmtH(h)}: zona de observación (3–6 hs).` };
    }
  },
  {
    id: 'operativa',
    titulo: 'Ejecución operativa',
    regla: 'Cada hora acá es una hora que la Ficha de Rol dice que no debería existir. Cualquier valor >0 sostenido es una alerta.',
    evaluar(t: TotalesSemana): ResultadoUmbral {
      const h = t.porCategoria['operativa'] ?? 0;
      const dias = t.diasConCategoria['operativa'] ?? 0;
      if (t.total === 0) return { estado: 'gris', valor: h, texto: 'Sin registro esta semana.' };
      if (h === 0) return { estado: 'verde', valor: 0, texto: 'Cero horas operativas. Así tiene que quedar.' };
      if (dias >= 3) return { estado: 'rojo', valor: h, texto: `${fmtH(h)} repartidas en ${dias} días: es sostenido, no una excepción. Hay tareas que no delegaste.` };
      if (h >= 2) return {
        estado: 'rojo', valor: h,
        texto: dias > 1
          ? `${fmtH(h)} en ${dias} días: media jornada haciendo lo que tiene otro dueño.`
          : `${fmtH(h)} en un solo día: media jornada haciendo lo que tiene otro dueño.`,
      };
      return { estado: 'amarillo', valor: h, texto: `${fmtH(h)}: no debería existir ninguna. Mirá quién debía hacerlas.` };
    }
  },
  {
    id: 'rol_director',
    titulo: 'Venta y clientes + Estrategia',
    regla: 'Si sumadas no llegan al 40% del total semanal, el rol de Director no se está ejerciendo.',
    evaluar(t: TotalesSemana): ResultadoUmbral {
      const h = (t.porCategoria['ventas'] ?? 0) + (t.porCategoria['estrategia'] ?? 0);
      if (t.total === 0) return { estado: 'gris', valor: 0, texto: 'Sin registro esta semana.' };
      const pct = Math.round((h / t.total) * 100);
      if (pct >= 40) return { estado: 'verde', valor: pct, texto: `${pct}% del tiempo (${fmtH(h)}). El rol se está ejerciendo.` };
      if (pct >= 30) return { estado: 'amarillo', valor: pct, texto: `${pct}% — por debajo del 40% mínimo.` };
      return { estado: 'rojo', valor: pct, texto: `${pct}%: el rol de Director no se está ejerciendo esta semana.` };
    }
  },
  {
    id: 'reuniones',
    titulo: 'Reuniones internas',
    regla: 'El manual proyecta 16 hs semanales. Comparar contra el real.',
    proyectado: 16,
    evaluar(t: TotalesSemana): ResultadoUmbral {
      const h = t.porCategoria['reuniones'] ?? 0;
      if (t.total === 0) return { estado: 'gris', valor: h, texto: 'Sin registro esta semana.' };
      const d = h - 16;
      if (h <= 16) return { estado: 'verde', valor: h, texto: `${fmtH(h)} vs 16 hs proyectadas (${fmtH(Math.abs(d))} por debajo).` };
      if (h <= 20) return { estado: 'amarillo', valor: h, texto: `${fmtH(h)} vs 16 proyectadas: ${fmtH(d)} de más.` };
      return { estado: 'rojo', valor: h, texto: `${fmtH(h)} vs 16 proyectadas: ${fmtH(d)} de más. Las reuniones se comieron la semana.` };
    }
  }
];

/* ────────────────────────────────────────────────────────────────────────────
 * 3.6 — Las 5 reglas que blindan el sistema.
 * ────────────────────────────────────────────────────────────────────────── */
export const REGLAS_SISTEMA = [
  { id: 'un_nombre', titulo: 'Un solo nombre por tarea', texto: 'Si aparece más de un responsable, nadie es responsable.' },
  { id: 'acta_mismo_dia', titulo: 'Acta el mismo día', texto: 'Qué se decidió, quién lo hace, para cuándo. Sin acta, la reunión no cuenta.' },
  { id: 'criterios', titulo: 'Criterios escritos, no aprobación previa', texto: 'Criterios por área + revisión semanal por excepción.' },
  { id: 'personal_aparte', titulo: 'Personal nunca se mezcla', texto: 'Gastos y trámites personales van a Potte/Leila, planilla aparte.' },
  { id: 'test_hora', titulo: 'Test de la hora', texto: 'Si la tarea la puede hacer alguien que cobra menos que vos por hora, no es tuya. Sin excepción de "es más rápido si lo hago yo".' }
];

/* ────────────────────────────────────────────────────────────────────────────
 * 3.7 — Los 3 indicadores que sí te corresponde mirar. Y solo estos.
 * ────────────────────────────────────────────────────────────────────────── */
export const INDICADORES: Indicador[] = [
  { id: 'margen', titulo: 'Margen bruto consolidado mensual', unidad: '$', aclaracion: 'ArgenBras + LTA. No facturación.', tipo: 'moneda' },
  { id: 'recompra', titulo: 'Clientes nuevos con segunda compra', unidad: 'clientes', aclaracion: 'No cuenta el primer pedido.', tipo: 'entero' },
  { id: 'caja60', titulo: 'Flujo de caja proyectado a 60 días', unidad: '$', aclaracion: 'A 60 días, no a 7.', tipo: 'moneda' }
];

function fmtH(h: number): string {
  const r = Math.round(h * 10) / 10;
  return `${r} h`;
}
