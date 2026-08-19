/**
 * drive.js — Lectura de la carpeta de Drive (solo lectura).
 *
 * OAuth directo desde el navegador con Google Identity Services: no hay
 * servidor propio, no hay secreto de cliente, no hay refresh token guardado en
 * ningún lado. El token de acceso dura ~1 hora y vive en este dispositivo.
 * Alcance pedido: drive.readonly (además, sólo se lee la carpeta configurada).
 *
 * Los documentos se bajan como texto plano y quedan en IndexedDB: después la
 * búsqueda funciona offline y sin volver a pedir nada.
 */

import * as S from './store.js';

const GIS = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const API = 'https://www.googleapis.com/drive/v3';

const EXPORTABLES = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv'
};
const DESCARGABLES = ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/html'];

let gisCargado = null;
function cargarGIS() {
  if (gisCargado) return gisCargado;
  gisCargado = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('No se pudo cargar Google Identity Services (¿estás sin internet?).'));
    document.head.appendChild(s);
  });
  return gisCargado;
}

export async function tokenGuardado() {
  const t = await S.get(S.K.driveToken);
  if (t && t.expira > Date.now() + 60000) return t.access_token;
  return null;
}

export async function conectado() { return Boolean(await tokenGuardado()); }

/**
 * Pide (o renueva) el token. `interactivo` en false intenta sin mostrar nada;
 * Google igual puede exigir interacción la primera vez.
 */
export async function conectar({ interactivo = true } = {}) {
  const guardado = await tokenGuardado();
  if (guardado) return guardado;

  const { driveClientId } = await S.getAjustes();
  if (!driveClientId) throw new Error('Falta el Client ID de Google. Cargalo en Ajustes.');

  await cargarGIS();
  return new Promise((resolve, reject) => {
    const cliente = google.accounts.oauth2.initTokenClient({
      client_id: driveClientId,
      scope: SCOPE,
      prompt: interactivo ? '' : 'none',
      callback: async resp => {
        if (resp.error) return reject(new Error(descifrarError(resp)));
        await S.set(S.K.driveToken, {
          access_token: resp.access_token,
          expira: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000
        });
        resolve(resp.access_token);
      },
      error_callback: err => reject(new Error(descifrarError(err)))
    });
    cliente.requestAccessToken();
  });
}

function descifrarError(e) {
  const t = e?.type || e?.error || '';
  if (String(t).includes('popup')) return 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes y probá de nuevo.';
  if (String(t).includes('access_denied')) return 'Google rechazó el permiso. Revisá que la cuenta sea la dueña de la carpeta.';
  return 'No se pudo conectar con Google: ' + (e?.error_description || t || 'error desconocido');
}

export async function desconectar() {
  const t = await S.get(S.K.driveToken);
  if (t?.access_token && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(t.access_token); } catch {}
  }
  await S.del(S.K.driveToken);
}

async function api(url) {
  const token = await conectar({ interactivo: false }).catch(() => null) || await conectar();
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 401) {
    await S.del(S.K.driveToken);
    throw new Error('La sesión de Google venció. Volvé a conectar.');
  }
  if (!r.ok) throw new Error(`Drive respondió ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r;
}

/** Lista la carpeta y sus subcarpetas (un nivel de recursión razonable). */
export async function listarCarpeta(folderId, profundidad = 3) {
  const campos = 'files(id,name,mimeType,modifiedTime,size,webViewLink),nextPageToken';
  const salida = [];
  const pendientes = [{ id: folderId, ruta: '' }];
  let nivel = 0;

  while (pendientes.length && nivel < profundidad * 50) {
    const { id, ruta } = pendientes.shift();
    let pageToken = '';
    do {
      const url = `${API}/files?q=${encodeURIComponent(`'${id}' in parents and trashed=false`)}` +
        `&fields=${encodeURIComponent(campos)}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true` +
        (pageToken ? `&pageToken=${pageToken}` : '');
      const data = await (await api(url)).json();
      for (const f of data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          pendientes.push({ id: f.id, ruta: ruta + f.name + '/' });
        } else {
          salida.push({ ...f, ruta });
        }
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    nivel++;
  }
  return salida;
}

export function esLeible(mime) {
  return Boolean(EXPORTABLES[mime]) || DESCARGABLES.includes(mime);
}

export async function textoDe(archivo) {
  if (EXPORTABLES[archivo.mimeType]) {
    const r = await api(`${API}/files/${archivo.id}/export?mimeType=${encodeURIComponent(EXPORTABLES[archivo.mimeType])}`);
    return await r.text();
  }
  if (DESCARGABLES.includes(archivo.mimeType)) {
    const r = await api(`${API}/files/${archivo.id}?alt=media&supportsAllDrives=true`);
    return await r.text();
  }
  return null;
}

/**
 * Sincroniza la carpeta: baja el texto de lo que cambió y lo deja indexado.
 * `onProgreso(hecho, total, nombre)` para que la UI no parezca colgada.
 */
export async function sincronizar(onProgreso = () => {}) {
  const { driveFolderId } = await S.getAjustes();
  if (!driveFolderId) throw new Error('Falta el ID de la carpeta de Drive.');

  const archivos = await listarCarpeta(driveFolderId);
  const indicePrevio = await S.get(S.K.docsIndice, []);
  const previoPorId = Object.fromEntries(indicePrevio.map(d => [d.id, d]));
  const indice = [];
  let i = 0;

  for (const f of archivos) {
    i++;
    onProgreso(i, archivos.length, f.name);
    const prev = previoPorId[f.id];
    const leible = esLeible(f.mimeType);

    if (prev && prev.modifiedTime === f.modifiedTime && prev.leible) {
      indice.push({ ...prev, ruta: f.ruta, name: f.name });
      continue;
    }
    if (!leible) {
      indice.push({ id: f.id, name: f.name, ruta: f.ruta, mimeType: f.mimeType, modifiedTime: f.modifiedTime, leible: false, webViewLink: f.webViewLink });
      continue;
    }
    try {
      const texto = await textoDe(f);
      await S.set(S.K.doc(f.id), texto || '');
      indice.push({
        id: f.id, name: f.name, ruta: f.ruta, mimeType: f.mimeType, modifiedTime: f.modifiedTime,
        leible: true, chars: (texto || '').length, webViewLink: f.webViewLink
      });
    } catch (e) {
      indice.push({ id: f.id, name: f.name, ruta: f.ruta, mimeType: f.mimeType, modifiedTime: f.modifiedTime, leible: false, error: String(e.message || e), webViewLink: f.webViewLink });
    }
  }

  // Limpiar documentos que ya no están en la carpeta
  for (const viejo of indicePrevio) {
    if (!indice.some(d => d.id === viejo.id)) await S.del(S.K.doc(viejo.id));
  }
  await S.set(S.K.docsIndice, indice);
  await S.setAjustes({ ultimaSync: Date.now() });
  return indice;
}

/* ── Búsqueda local sobre lo que ya se bajó ──────────────────────────────── */

const normalizar = t => (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const VACIAS = new Set(['que', 'cual', 'como', 'para', 'con', 'los', 'las', 'del', 'una', 'uno', 'por', 'sobre', 'donde', 'cuando', 'dice', 'esta', 'este', 'hay', 'the', 'and', 'mis', 'sus']);

function tokens(q) {
  return normalizar(q).split(/[^a-z0-9áéíóúñ]+/i).filter(t => t.length > 2 && !VACIAS.has(t));
}

/**
 * Responde una pregunta con los pasajes reales de los documentos.
 * No inventa: devuelve el texto tal cual está escrito, con la fuente.
 */
export async function buscar(pregunta, limite = 6) {
  const q = tokens(pregunta);
  if (!q.length) return [];
  const indice = await S.get(S.K.docsIndice, []);
  const resultados = [];

  for (const doc of indice) {
    if (!doc.leible) continue;
    const texto = await S.get(S.K.doc(doc.id), '');
    if (!texto) continue;
    const parrafos = texto.split(/\n\s*\n|\r\n\s*\r\n/).map(p => p.trim()).filter(p => p.length > 25);
    const nombreNorm = normalizar(doc.name);

    for (const p of parrafos) {
      const pn = normalizar(p);
      let score = 0, distintos = 0;
      for (const t of q) {
        const veces = pn.split(t).length - 1;
        if (veces) { score += Math.min(veces, 4) * (t.length > 5 ? 2 : 1); distintos++; }
      }
      if (!score) continue;
      score *= 1 + distintos / q.length;                       // premia cubrir la pregunta entera
      if (q.some(t => nombreNorm.includes(t))) score *= 1.4;   // premia el documento cuyo título pega
      resultados.push({ doc, texto: p.slice(0, 700), score });
    }
  }
  return resultados.sort((a, b) => b.score - a.score).slice(0, limite);
}

export function resaltar(texto, pregunta) {
  const q = tokens(pregunta);
  if (!q.length) return texto;
  const re = new RegExp('(' + q.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  const partes = [];
  let ultimo = 0;
  const norm = normalizar(texto);
  for (const m of norm.matchAll(re)) {
    partes.push({ t: texto.slice(ultimo, m.index), marca: false });
    partes.push({ t: texto.slice(m.index, m.index + m[0].length), marca: true });
    ultimo = m.index + m[0].length;
  }
  partes.push({ t: texto.slice(ultimo), marca: false });
  return partes;
}
