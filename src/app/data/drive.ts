/**
 * drive.ts — Lectura de la carpeta de Drive, solo lectura.
 *
 * OAuth directo desde el navegador con Google Identity Services: no hay
 * servidor propio ni secreto de cliente. El token dura una hora y vive en este
 * dispositivo. El texto de los documentos se guarda local, así la búsqueda
 * funciona offline y sin volver a pedir permiso.
 */

import { Injectable, inject, signal } from '@angular/core';
import { Datos } from './datos';
import { K } from './repositorio';
import type { DocIndexado } from '../core/modelo';

const GIS = 'https://accounts.google.com/gsi/client';
// Un solo permiso de Google para las dos cosas que la app lee: los documentos
// de la carpeta y los eventos del calendario. Las dos en modo lectura.
const ALCANCE = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');
const API = 'https://www.googleapis.com/drive/v3';

const EXPORTABLES: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};
const DESCARGABLES = ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/html'];
const PDF = 'application/pdf';

interface ArchivoDrive {
  id: string; name: string; mimeType: string; modifiedTime: string;
  webViewLink?: string; ruta: string;
}

interface Token { access_token: string; expira: number }

interface ClienteToken { requestAccessToken(): void }
interface GoogleGis {
  accounts: {
    oauth2: {
      initTokenClient(o: {
        client_id: string; scope: string; prompt: string;
        callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
        error_callback?: (e: { type?: string }) => void;
      }): ClienteToken;
      revoke(token: string): void;
    };
  };
}

export interface Pasaje { doc: DocIndexado; texto: string; score: number }

@Injectable({ providedIn: 'root' })
export class Drive {
  private readonly datos = inject(Datos);
  readonly progreso = signal<{ hecho: number; total: number; nombre: string } | null>(null);

  #gis: Promise<void> | null = null;

  async conectado(): Promise<boolean> { return (await this.#token()) !== null; }

  async #token(): Promise<string | null> {
    const t = await this.datos.tokenGoogle<Token>();
    return t && t.expira > Date.now() + 60_000 ? t.access_token : null;
  }

  #cargarGis(): Promise<void> {
    this.#gis ??= new Promise<void>((resolve, reject) => {
      if ((window as unknown as { google?: GoogleGis }).google?.accounts?.oauth2) return resolve();
      const s = document.createElement('script');
      s.src = GIS; s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar Google (¿estás sin internet?).'));
      document.head.appendChild(s);
    });
    return this.#gis;
  }

  async conectar(): Promise<string> {
    const guardado = await this.#token();
    if (guardado) return guardado;

    const { driveClientId } = await this.datos.ajustes();
    if (!driveClientId) throw new Error('Falta el Client ID de Google. Cargalo en Ajustes.');
    await this.#cargarGis();
    const google = (window as unknown as { google: GoogleGis }).google;

    return new Promise<string>((resolve, reject) => {
      const cliente = google.accounts.oauth2.initTokenClient({
        client_id: driveClientId,
        scope: ALCANCE,
        prompt: '',
        callback: async r => {
          if (r.error || !r.access_token) return reject(new Error(traducir(r.error)));
          await this.datos.guardarTokenGoogle<Token>({
            access_token: r.access_token,
            expira: Date.now() + (Number(r.expires_in ?? 3600) - 60) * 1000,
          });
          resolve(r.access_token);
        },
        error_callback: e => reject(new Error(traducir(e.type))),
      });
      cliente.requestAccessToken();
    });
  }

  async desconectar(): Promise<void> {
    const t = await this.datos.tokenGoogle<Token>();
    const google = (window as unknown as { google?: GoogleGis }).google;
    if (t?.access_token && google) { try { google.accounts.oauth2.revoke(t.access_token); } catch { /* ya vencido */ } }
    await this.datos.borrarTokenGoogle();
  }

  async #api(url: string): Promise<Response> {
    const token = (await this.#token()) ?? (await this.conectar());
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401) {
      await this.datos.borrarTokenGoogle();
      throw new Error('La sesión de Google venció. Volvé a conectar.');
    }
    if (!r.ok) throw new Error(`Drive respondió ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return r;
  }

  async listar(carpeta: string): Promise<ArchivoDrive[]> {
    const campos = 'files(id,name,mimeType,modifiedTime,webViewLink),nextPageToken';
    const salida: ArchivoDrive[] = [];
    const cola: { id: string; ruta: string }[] = [{ id: carpeta, ruta: '' }];
    let vueltas = 0;

    while (cola.length && vueltas++ < 60) {
      const actual = cola.shift()!;
      let pageToken = '';
      do {
        const url = `${API}/files?q=${encodeURIComponent(`'${actual.id}' in parents and trashed=false`)}`
          + `&fields=${encodeURIComponent(campos)}&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`
          + (pageToken ? `&pageToken=${pageToken}` : '');
        const data = await (await this.#api(url)).json() as {
          files?: Omit<ArchivoDrive, 'ruta'>[]; nextPageToken?: string;
        };
        for (const f of data.files ?? []) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            cola.push({ id: f.id, ruta: actual.ruta + f.name + '/' });
          } else {
            salida.push({ ...f, ruta: actual.ruta });
          }
        }
        pageToken = data.nextPageToken ?? '';
      } while (pageToken);
    }
    return salida;
  }

  esLeible(mime: string): boolean {
    return Boolean(EXPORTABLES[mime]) || DESCARGABLES.includes(mime) || mime === PDF;
  }

  async texto(a: ArchivoDrive): Promise<string | null> {
    if (a.mimeType === PDF) {
      const datos = await (await this.#api(`${API}/files/${a.id}?alt=media&supportsAllDrives=true`)).arrayBuffer();
      const { textoDePdf } = await import('./pdf');
      const r = await textoDePdf(datos);
      if (r.escaneado) {
        throw new Error(`Es un PDF escaneado (${r.paginas} pág.): son imágenes, no texto.`);
      }
      return r.texto;
    }
    const exportable = EXPORTABLES[a.mimeType];
    if (exportable) {
      return (await this.#api(`${API}/files/${a.id}/export?mimeType=${encodeURIComponent(exportable)}`)).text();
    }
    if (DESCARGABLES.includes(a.mimeType)) {
      return (await this.#api(`${API}/files/${a.id}?alt=media&supportsAllDrives=true`)).text();
    }
    return null;
  }

  /** Baja lo que cambió y deja todo indexado en el dispositivo. */
  async sincronizar(): Promise<DocIndexado[]> {
    const { driveFolderId } = await this.datos.ajustes();
    if (!driveFolderId) throw new Error('Falta el ID de la carpeta de Drive.');

    const archivos = await this.listar(driveFolderId);
    const previo = await this.datos.docsIndice();
    const porId = new Map(previo.map(d => [d.id, d]));
    const indice: DocIndexado[] = [];

    let i = 0;
    for (const f of archivos) {
      this.progreso.set({ hecho: ++i, total: archivos.length, nombre: f.name });
      const anterior = porId.get(f.id);
      if (anterior?.leible && anterior.modifiedTime === f.modifiedTime) {
        indice.push({ ...anterior, name: f.name, ruta: f.ruta });
        continue;
      }
      const base: DocIndexado = {
        id: f.id, name: f.name, ruta: f.ruta, mimeType: f.mimeType,
        modifiedTime: f.modifiedTime, leible: false, webViewLink: f.webViewLink,
      };
      if (!this.esLeible(f.mimeType)) { indice.push(base); continue; }
      try {
        const texto = (await this.texto(f)) ?? '';
        await this.datos.guardarDoc(f.id, texto);
        indice.push({ ...base, leible: true, chars: texto.length });
      } catch (e) {
        indice.push({ ...base, error: e instanceof Error ? e.message : String(e) });
      }
    }

    for (const viejo of previo) {
      if (!indice.some(d => d.id === viejo.id)) await this.datos.borrarDoc(viejo.id);
    }
    await this.datos.guardarDocsIndice(indice);
    await this.datos.guardarAjustes({ ultimaSync: Date.now() });
    this.progreso.set(null);
    return indice;
  }

  /* ── Búsqueda local ────────────────────────────────────────────────────── */

  async buscar(pregunta: string, limite = 6): Promise<Pasaje[]> {
    const q = termos(pregunta);
    if (!q.length) return [];
    const indice = await this.datos.docsIndice();
    const salida: Pasaje[] = [];

    for (const doc of indice) {
      if (!doc.leible) continue;
      const texto = await this.datos.doc(doc.id);
      if (!texto) continue;
      const nombre = normalizar(doc.name);
      for (const parrafo of texto.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 25)) {
        const pn = normalizar(parrafo);
        let score = 0, distintos = 0;
        for (const t of q) {
          const veces = pn.split(t).length - 1;
          if (veces) { score += Math.min(veces, 4) * (t.length > 5 ? 2 : 1); distintos++; }
        }
        if (!score) continue;
        score *= 1 + distintos / q.length;          // premia cubrir la pregunta entera
        if (q.some(t => nombre.includes(t))) score *= 1.4;
        salida.push({ doc, texto: parrafo.slice(0, 700), score });
      }
    }
    return salida.sort((a, b) => b.score - a.score).slice(0, limite);
  }

  /** Parte un pasaje en trozos marcados y sin marcar, para resaltar en pantalla. */
  partir(texto: string, pregunta: string): { t: string; marca: boolean }[] {
    const q = termos(pregunta);
    if (!q.length) return [{ t: texto, marca: false }];
    const re = new RegExp('(' + q.map(escapeRe).join('|') + ')', 'gi');
    const partes: { t: string; marca: boolean }[] = [];
    let ultimo = 0;
    for (const m of normalizar(texto).matchAll(re)) {
      const i = m.index ?? 0;
      if (i > ultimo) partes.push({ t: texto.slice(ultimo, i), marca: false });
      partes.push({ t: texto.slice(i, i + m[0].length), marca: true });
      ultimo = i + m[0].length;
    }
    partes.push({ t: texto.slice(ultimo), marca: false });
    return partes;
  }
}

const VACIAS = new Set(['que', 'cual', 'como', 'para', 'con', 'los', 'las', 'del', 'una', 'uno',
                        'por', 'sobre', 'donde', 'cuando', 'dice', 'esta', 'este', 'hay', 'mis', 'sus']);

const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termos = (q: string) => normalizar(q).split(/[^a-z0-9]+/).filter(t => t.length > 2 && !VACIAS.has(t));

function traducir(tipo: string | undefined): string {
  const t = String(tipo ?? '');
  if (t.includes('popup')) return 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes.';
  if (t.includes('access_denied')) return 'Google rechazó el permiso. Revisá que la cuenta sea la dueña de la carpeta.';
  return 'No se pudo conectar con Google' + (t ? `: ${t}` : '.');
}
