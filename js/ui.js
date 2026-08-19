/**
 * ui.js — Helpers de DOM. Sin framework, sin build step.
 */

/** h('div.card', {onclick}, 'texto', hijo) */
export function h(sel, props, ...hijos) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const el = document.createElement(m[1] || 'div');
  for (const t of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (t[0] === '.') el.classList.add(t.slice(1));
    else el.id = t.slice(1);
  }
  if (props && (props.nodeType || Array.isArray(props) || typeof props === 'string')) {
    hijos.unshift(props); props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += ' ' + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const c of hijos.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function vaciar(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

let toastTimer;
export function toast(msg, tipo = 'ok') {
  let t = document.getElementById('toast');
  if (!t) { t = h('div#toast'); document.body.appendChild(t); }
  t.className = 'toast ' + tipo;
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 3200);
}

/** Modal simple. `acciones` = [{texto, tipo, valor}] → resuelve con `valor`. */
export function modal({ titulo, cuerpo, acciones = [{ texto: 'Cerrar', valor: null }] }) {
  return new Promise(resolve => {
    const cerrar = v => { fondo.remove(); resolve(v); };
    const caja = h('div.modal',
      h('h3', titulo),
      typeof cuerpo === 'string' ? h('p', cuerpo) : cuerpo,
      h('div.modal-acciones', acciones.map(a =>
        h('button', { class: 'btn ' + (a.tipo || ''), onclick: () => cerrar(a.valor) }, a.texto)))
    );
    const fondo = h('div.modal-fondo', { onclick: e => { if (e.target === fondo) cerrar(null); } }, caja);
    document.body.appendChild(fondo);
  });
}

export const SEMAFORO = { verde: '🟢', amarillo: '🟡', rojo: '🔴', gris: '⚪' };

export function fmtHoras(h) {
  const r = Math.round((Number(h) || 0) * 10) / 10;
  return Number.isInteger(r) ? `${r} h` : `${r} h`;
}

export function fmtMoneda(n) {
  const v = Number(n) || 0;
  return '$ ' + v.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

/** Bloque vacío pero útil: nunca dejar una pantalla en blanco. */
export function vacio(titulo, texto, accion) {
  return h('div.vacio', h('p.vacio-titulo', titulo), h('p.vacio-texto', texto), accion || null);
}
