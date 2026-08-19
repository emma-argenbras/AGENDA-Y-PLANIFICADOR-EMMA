/**
 * store.js — Persistencia local (IndexedDB) + utilidades de fecha.
 *
 * Todo vive en el dispositivo. No hay servidor, no hay cuenta, no hay sync.
 * Un solo usuario. Backup = exportar JSON (Ajustes).
 *
 * Diseño defensivo: si IndexedDB falla (modo privado, Safari raro), cae a
 * localStorage y la app sigue funcionando. Nunca tira una pantalla en blanco.
 */

const DB_NAME = 'emma-planner';
const STORE = 'kv';
const LS_PREFIX = 'emma-planner:';

let dbPromise = null;
let usarFallback = false;

function abrirDB() {
  if (usarFallback) return Promise.reject(new Error('fallback'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); }
    catch (e) { usarFallback = true; return reject(e); }
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { usarFallback = true; reject(req.error); };
  });
  return dbPromise;
}

function tx(modo, fn) {
  return abrirDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, modo);
    const req = fn(t.objectStore(STORE));
    t.onerror = () => reject(t.error);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export async function get(clave, porDefecto = null) {
  try {
    const v = await tx('readonly', s => s.get(clave));
    return v === undefined ? porDefecto : v;
  } catch {
    const raw = localStorage.getItem(LS_PREFIX + clave);
    if (raw == null) return porDefecto;
    try { return JSON.parse(raw); } catch { return porDefecto; }
  }
}

export async function set(clave, valor) {
  try {
    await tx('readwrite', s => s.put(valor, clave));
  } catch {
    try { localStorage.setItem(LS_PREFIX + clave, JSON.stringify(valor)); } catch {}
  }
  return valor;
}

export async function del(clave) {
  try { await tx('readwrite', s => s.delete(clave)); }
  catch { localStorage.removeItem(LS_PREFIX + clave); }
}

export async function claves() {
  try { return await tx('readonly', s => s.getAllKeys()); }
  catch {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .map(k => k.slice(LS_PREFIX.length));
  }
}

export async function exportarTodo() {
  const ks = await claves();
  const datos = {};
  for (const k of ks) {
    if (String(k).startsWith('doc:')) continue;      // los documentos se re-bajan de Drive
    datos[k] = await get(k);
  }
  return { app: 'agenda-emma', version: 1, exportado: new Date().toISOString(), datos };
}

export async function importarTodo(json) {
  if (!json || json.app !== 'agenda-emma') throw new Error('Archivo de backup inválido.');
  for (const [k, v] of Object.entries(json.datos || {})) await set(k, v);
}

/* ── Fechas (todo en hora local, formato YYYY-MM-DD) ─────────────────────── */

export function hoyISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function sumarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return hoyISO(d);
}

/** Lunes de la semana de `iso`. */
export function inicioSemana(iso) {
  const d = new Date(iso + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  return sumarDias(iso, -dow);
}

export function diasSemana(lunesISO) {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunesISO, i));
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaLarga(iso) {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export function fechaCorta(iso) {
  const d = new Date(iso + 'T12:00:00');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function esFinDeSemana(iso) {
  const d = new Date(iso + 'T12:00:00').getDay();
  return d === 0 || d === 6;
}

/* ── Dominio ─────────────────────────────────────────────────────────────── */

export const K = {
  checkin: f => `checkin:${f}`,
  prioridades: f => `prio:${f}`,
  reuniones: 'reuniones',
  derivaciones: 'derivaciones',
  prueba: 'prueba:luciana_2026_08',
  indicadores: 'indicadores',
  ajustes: 'ajustes',
  docsIndice: 'docs:indice',
  doc: id => `doc:${id}`,
  driveToken: 'drive:token'
};

export const getCheckin = f => get(K.checkin(f));
export const setCheckin = (f, v) => set(K.checkin(f), v);

export const getPrioridades = f => get(K.prioridades(f), []);
export const setPrioridades = (f, v) => set(K.prioridades(f), v);

export const getReuniones = () => get(K.reuniones, []);
export const setReuniones = v => set(K.reuniones, v);

export const getDerivaciones = () => get(K.derivaciones, []);
export const setDerivaciones = v => set(K.derivaciones, v);

export const getPrueba = () => get(K.prueba, {});
export const setPrueba = v => set(K.prueba, v);

export const getIndicadores = () => get(K.indicadores, []);
export const setIndicadores = v => set(K.indicadores, v);

export const AJUSTES_POR_DEFECTO = {
  driveClientId: '',
  driveFolderId: '1gar-fgb0GdUtS01KdNhDnfWtyJ1MBMkX',
  horaManana: '08:00',
  horaNoche: '20:30',
  notificaciones: false,
  horasDiaPorDefecto: 8,
  primerUso: null
};

/** Se llama una vez, en el primer arranque. */
export async function marcarPrimerUso() {
  const a = await getAjustes();
  if (!a.primerUso) await setAjustes({ primerUso: hoyISO() });
}

export async function getAjustes() {
  return { ...AJUSTES_POR_DEFECTO, ...(await get(K.ajustes, {})) };
}
export async function setAjustes(parcial) {
  const a = { ...(await getAjustes()), ...parcial };
  await set(K.ajustes, a);
  return a;
}

/** Check-ins de un rango de fechas, sin huecos que rompan el cálculo. */
export async function checkinsDe(fechas) {
  const out = [];
  for (const f of fechas) {
    const ck = await getCheckin(f);
    if (ck) out.push({ ...ck, fecha: f });
  }
  return out;
}

/**
 * Días hábiles consecutivos sin check-in, mirando hacia atrás desde `desde`.
 * No cuenta días anteriores al primer uso de la app: sería inventar una deuda
 * que no existe y el aviso perdería sentido.
 */
export async function rachaSinRegistro(desde) {
  const { primerUso } = await getAjustes();
  let racha = 0;
  let f = desde;
  for (let i = 0; i < 30; i++) {
    if (primerUso && f < primerUso) break;
    if (!esFinDeSemana(f)) {
      const ck = await getCheckin(f);
      if (ck) break;
      racha++;
    }
    f = sumarDias(f, -1);
  }
  return racha;
}
