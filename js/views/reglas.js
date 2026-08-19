/**
 * reglas.js — La Ficha de Rol, sólo lectura.
 * No hay nada editable acá a propósito: estas reglas viven en el código
 * (js/rules.js), versionadas. Cambiarlas es un commit, no un click.
 */

import { h } from '../ui.js';
import { DECISIONES_PROPIAS, DELEGACION, CATEGORIAS, UMBRALES, REGLAS_SISTEMA, INDICADORES, PERSONAS, PERFIL, DOTACION } from '../rules.js';

export async function render(ctx) {
  ctx.subtitulo('Fijada en código, no en ajustes');
  const cont = h('div');

  cont.appendChild(h('div.card',
    h('h2', PERFIL.nombre),
    h('p.chico', PERFIL.roles.join(' · ')),
    h('p.mini', PERFIL.base)));

  cont.appendChild(h('div.seccion-titulo', 'Las 7 decisiones que son tuyas'));
  cont.appendChild(h('div.card', h('ol.numerada', DECISIONES_PROPIAS.map(d => h('li', d.texto)))));

  cont.appendChild(h('div.seccion-titulo', 'Tabla de delegación'));
  const t = h('div.card');
  for (const d of DELEGACION) {
    t.appendChild(h('div.fila.sep', { style: { padding: '8px 0', borderTop: '1px solid var(--linea)' } },
      h('div.crece',
        h('div', d.tarea),
        d.excepcion ? h('div.mini', d.excepcion) : null,
        d.forzada ? h('div.mini', 'Siempre cuenta como Ejecución Operativa.') : null),
      h('span.chico.nowrap', PERSONAS[d.dueno]?.nombre?.split(' ')[0] || d.dueno)));
  }
  cont.appendChild(t);

  cont.appendChild(h('div.seccion-titulo', 'Las 8 categorías de tiempo'));
  cont.appendChild(h('div.card', CATEGORIAS.map(c =>
    h('div', { style: { padding: '8px 0', borderTop: '1px solid var(--linea)' } },
      h('div.fila', h('span', { style: { color: c.color } }, '●'), h('strong', `${c.n}. ${c.nombre}`)),
      h('div.mini', c.definicion)))));

  cont.appendChild(h('div.seccion-titulo', 'Umbrales de control'));
  cont.appendChild(h('div.card', UMBRALES.map(u =>
    h('div', { style: { padding: '8px 0', borderTop: '1px solid var(--linea)' } },
      h('strong', u.titulo), h('div.mini', u.regla)))));

  cont.appendChild(h('div.seccion-titulo', 'Las 5 reglas que blindan el sistema'));
  cont.appendChild(h('div.card', REGLAS_SISTEMA.map((r, i) =>
    h('div', { style: { padding: '8px 0', borderTop: '1px solid var(--linea)' } },
      h('strong', `${i + 1}. ${r.titulo}`), h('div.mini', r.texto)))));

  cont.appendChild(h('div.seccion-titulo', 'Los 3 indicadores'));
  cont.appendChild(h('div.card', h('ol.numerada', INDICADORES.map(i =>
    h('li', i.titulo, h('div.mini', i.aclaracion))))));

  cont.appendChild(h('div.seccion-titulo', 'Quién hace qué'));
  cont.appendChild(h('div.card', h('ul.limpia', Object.values(PERSONAS)
    .filter(p => p.rol)
    .map(p => h('li', h('div', p.nombre), h('div.mini', p.rol))))));

  if (DOTACION.vacantes.length) {
    cont.appendChild(h('div.seccion-titulo', 'Vacantes abiertas'));
    cont.appendChild(h('div.card.rojo', DOTACION.vacantes.map(v =>
      h('div', h('strong', v.puesto), h('div.mini', v.nota)))));
  }
  return cont;
}
