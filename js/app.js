/**
 * app.js — Arranque, router por hash y chrome de la app.
 */

import { h, $, vaciar, modal, toast } from './ui.js';
import * as S from './store.js';
import { PRUEBA, estadoPrueba } from './prueba-luciana.js';
import * as N from './notify.js';

const VISTAS = {
  hoy:         { titulo: 'Hoy',           mod: () => import('./views/hoy.js') },
  semana:      { titulo: 'Semana',        mod: () => import('./views/semana.js') },
  prueba:      { titulo: 'Prueba Luciana', mod: () => import('./views/prueba.js') },
  actas:       { titulo: 'Actas',         mod: () => import('./views/actas.js') },
  docs:        { titulo: 'Documentos',    mod: () => import('./views/docs.js') },
  delegar:     { titulo: 'Para delegar',  mod: () => import('./views/delegar.js') },
  reglas:      { titulo: 'Ficha de Rol',  mod: () => import('./views/reglas.js') },
  indicadores: { titulo: 'Indicadores',   mod: () => import('./views/indicadores.js') },
  ajustes:     { titulo: 'Ajustes',       mod: () => import('./views/ajustes.js') }
};

export function ir(ruta) { location.hash = '#/' + ruta; }

async function render() {
  const nombre = (location.hash.replace(/^#\//, '').split('/')[0]) || 'hoy';
  const vista = VISTAS[nombre] || VISTAS.hoy;
  const cont = $('#vista');

  $('#titulo-vista').textContent = vista.titulo;
  $('#subtitulo-vista').textContent = '';
  document.querySelectorAll('#tabs a').forEach(a =>
    a.classList.toggle('activo', a.dataset.tab === nombre));

  try {
    const mod = await vista.mod();
    const nodo = await mod.render({
      subtitulo: t => { $('#subtitulo-vista').textContent = t || ''; },
      refrescar: render,
      ir
    });
    vaciar(cont).appendChild(nodo);
    cont.scrollTop = 0;
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    vaciar(cont).appendChild(
      h('div.card.rojo',
        h('h2', 'Algo se rompió al abrir esta pantalla'),
        h('p.chico', String(e && e.message || e)),
        h('button.btn', { onclick: render }, 'Reintentar')));
  }
  await pintarPendientes();
}

/** Puntitos rojos en los tabs: revisión de la prueba vencida, reuniones sin acta. */
async function pintarPendientes() {
  const hoy = S.hoyISO();
  const [prueba, reuniones] = await Promise.all([S.getPrueba(), S.getReuniones()]);
  const est = estadoPrueba(hoy, prueba);
  marcar('prueba', est.vencidas > 0 || est.revisiones.some(r => r.estado === 'hoy'));
  marcar('actas', reuniones.some(r => !r.acta || !r.acta.length));
}

function marcar(tab, on) {
  const a = document.querySelector(`#tabs a[data-tab="${tab}"]`);
  if (!a) return;
  const pin = a.querySelector('.pin');
  if (on && !pin) a.appendChild(h('i.pin'));
  if (!on && pin) pin.remove();
}

async function menuMas() {
  const opciones = [
    ['delegar', 'Para delegar', 'Lo que hiciste vos y no era tuyo'],
    ['reglas', 'Ficha de Rol', 'Las 7 decisiones, la tabla y las 5 reglas'],
    ['indicadores', 'Indicadores', 'Los 3 números que te tocan'],
    ['ajustes', 'Ajustes', 'Drive, notificaciones, backup']
  ];
  const destino = await modal({
    titulo: 'Más',
    cuerpo: h('ul.limpia', opciones.map(([id, t, sub]) =>
      h('li', h('a.fila.sep', {
        href: '#/' + id, style: { color: 'inherit', textDecoration: 'none' },
        onclick: () => document.querySelector('.modal-fondo')?.remove()
      }, h('div.crece', h('div', t), h('div.mini', sub)), h('span.chico', '›'))))),
    acciones: [{ texto: 'Cerrar', valor: null }]
  });
  if (destino) ir(destino);
}

function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW:', e));
  });
}

addEventListener('hashchange', render);
$('#btn-mas').addEventListener('click', menuMas);
registrarSW();
S.marcarPrimerUso().catch(() => {});
render();
N.programarDelDia().catch(() => {});

// Al volver a la app después de un rato, refrescar por si cambió el día.
let ultimaFecha = S.hoyISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const ahora = S.hoyISO();
  if (ahora !== ultimaFecha) { ultimaFecha = ahora; render(); }
  N.programarDelDia().catch(() => {});
});

export { render };
