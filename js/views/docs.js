/**
 * docs.js — La carpeta de Drive, indexada y consultable.
 *
 * Qué hace: baja el texto de los documentos y responde con los pasajes reales
 * donde está la respuesta, citando el archivo. No parafrasea ni inventa: lo que
 * ves es lo que dice el documento.
 */

import { h, toast, modal, vacio } from '../ui.js';
import * as S from '../store.js';
import * as D from '../drive.js';

let ultimaBusqueda = '';
let ultimosResultados = null;

export async function render(ctx) {
  const [ajustes, indice, conectado] = await Promise.all([
    S.getAjustes(), S.get(S.K.docsIndice, []), D.conectado()
  ]);
  const leibles = indice.filter(d => d.leible);
  ctx.subtitulo(indice.length ? `${leibles.length} documentos indexados` : 'Sin indexar todavía');

  const cont = h('div');

  if (!ajustes.driveClientId) {
    cont.appendChild(h('div.card',
      h('h2', 'Falta conectar Drive'),
      h('p.chico', 'Necesitás pegar una vez el Client ID de Google (está explicado en Ajustes). ' +
        'Es un trámite de 5 minutos y queda hecho para siempre.'),
      h('a.btn.primario', { href: '#/ajustes' }, 'Ir a Ajustes')));
  }

  // ── Buscador ───────────────────────────────────────────────────────────
  const input = h('input', {
    type: 'text', placeholder: 'Preguntá: ¿qué dice la Ficha de Rol sobre…?',
    value: ultimaBusqueda, enterkeyhint: 'search'
  });
  const resultados = h('div');

  const buscar = async () => {
    const q = input.value.trim();
    ultimaBusqueda = q;
    resultados.replaceChildren(h('p.chico', 'Buscando…'));
    if (!q) { resultados.replaceChildren(); return; }
    const r = await D.buscar(q);
    ultimosResultados = r;
    pintarResultados(resultados, r, q, leibles.length);
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });

  cont.appendChild(h('div.card',
    h('div.fila', h('div.crece', input), h('button.btn.primario', { onclick: buscar }, '⌕')),
    h('p.mini', { style: { marginTop: '8px' } },
      'Busca dentro del texto de los documentos, offline. Devuelve el párrafo exacto y de qué archivo salió.')));
  cont.appendChild(resultados);
  if (ultimosResultados && ultimaBusqueda) pintarResultados(resultados, ultimosResultados, ultimaBusqueda, leibles.length);

  // ── Sincronización ─────────────────────────────────────────────────────
  const estado = h('p.mini', ajustes.ultimaSync
    ? 'Última sincronización: ' + new Date(ajustes.ultimaSync).toLocaleString('es-AR')
    : 'Nunca sincronizado.');

  const btnSync = h('button.btn' + (indice.length ? '' : '.primario'), {
    onclick: async () => {
      btnSync.disabled = true;
      const original = btnSync.textContent;
      try {
        await D.sincronizar((i, total, nombre) => {
          btnSync.textContent = `${i}/${total} · ${String(nombre).slice(0, 18)}…`;
        });
        toast('Documentos actualizados.');
        ctx.refrescar();
      } catch (e) {
        btnSync.textContent = original;
        btnSync.disabled = false;
        await modal({ titulo: 'No se pudo sincronizar', cuerpo: String(e.message || e), acciones: [{ texto: 'Entendido', valor: null }] });
      }
    }
  }, indice.length ? 'Actualizar desde Drive' : 'Traer documentos de Drive');

  cont.appendChild(h('div.card',
    h('div.fila.sep', h('div.crece', h('strong', conectado ? 'Drive conectado' : 'Drive sin conectar'), estado), btnSync)));

  // ── Índice ─────────────────────────────────────────────────────────────
  cont.appendChild(h('div.seccion-titulo', 'Archivos'));
  if (!indice.length) {
    cont.appendChild(h('div.card', vacio('Todavía no bajaste nada',
      'La app funciona igual sin esto: el check-in, la agenda y los umbrales no dependen de Drive.')));
    return cont;
  }

  const card = h('div.card');
  for (const d of indice) {
    card.appendChild(h('div.fila.sep', { style: { padding: '9px 0', borderTop: '1px solid var(--linea)' } },
      h('div.crece',
        h('div', d.name),
        h('div.mini', (d.ruta || '') +
          (d.leible ? `${Math.round((d.chars || 0) / 1000)} mil caracteres indexados`
                    : `no se puede leer el contenido (${tipoCorto(d.mimeType)})`) +
          (d.error ? ' · ' + d.error : ''))),
      d.leible ? h('button.btn.chico.fantasma', { onclick: () => verDoc(d) }, 'Ver')
               : (d.webViewLink ? h('a.btn.chico.fantasma', { href: d.webViewLink, target: '_blank', rel: 'noopener' }, 'Abrir') : null)));
  }
  cont.appendChild(card);
  cont.appendChild(h('p.mini', 'Los PDF e imágenes se listan pero no se indexan: no hay lector de PDF en la app.'));
  return cont;
}

function tipoCorto(m) {
  if (!m) return 'tipo desconocido';
  if (m.includes('pdf')) return 'PDF';
  if (m.startsWith('image/')) return 'imagen';
  if (m.includes('spreadsheet')) return 'planilla';
  return m.split('/').pop().slice(0, 24);
}

function pintarResultados(cont, r, q, totalDocs) {
  cont.replaceChildren();
  if (!r.length) {
    cont.appendChild(h('div.card', vacio('Sin coincidencias',
      totalDocs ? `Busqué en ${totalDocs} documentos y no aparece nada con esas palabras. Probá con otras.`
                : 'No hay documentos indexados todavía. Sincronizá con Drive primero.')));
    return;
  }
  cont.appendChild(h('div.seccion-titulo', `${r.length} pasajes encontrados`));
  for (const res of r) {
    const partes = D.resaltar(res.texto, q);
    const p = h('p');
    if (Array.isArray(partes)) {
      for (const x of partes) p.appendChild(x.marca ? h('mark', x.t) : document.createTextNode(x.t));
    } else p.textContent = res.texto;
    cont.appendChild(h('div.card',
      h('div.res', p),
      h('div.fila.sep',
        h('span.mini', res.doc.name),
        res.doc.webViewLink ? h('a.mini', { href: res.doc.webViewLink, target: '_blank', rel: 'noopener' }, 'Abrir en Drive') : null)));
  }
}

async function verDoc(d) {
  const texto = await S.get(S.K.doc(d.id), '');
  await modal({
    titulo: d.name,
    cuerpo: h('pre', {
      style: { whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: '1.5', margin: 0, fontFamily: 'inherit' }
    }, texto.slice(0, 20000) + (texto.length > 20000 ? '\n\n[…]' : '')),
    acciones: [{ texto: 'Cerrar', valor: null }]
  });
}
