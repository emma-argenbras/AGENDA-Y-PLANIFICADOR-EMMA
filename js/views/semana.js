/**
 * semana.js — Los 4 umbrales con semáforo. Sin gráficos complejos.
 */

import { h, SEMAFORO, fmtHoras, vacio } from '../ui.js';
import * as S from '../store.js';
import { totalesSemana, fugasDelegacion } from '../classify.js';
import { UMBRALES, CATEGORIAS, CAT } from '../rules.js';

let lunesActual = null;

export async function render(ctx) {
  const hoy = S.hoyISO();
  lunesActual = lunesActual || S.inicioSemana(hoy);
  const fechas = S.diasSemana(lunesActual);
  ctx.subtitulo(`${S.fechaCorta(fechas[0])} al ${S.fechaCorta(fechas[6])}`);

  const checkins = await S.checkinsDe(fechas);
  const t = totalesSemana(checkins);
  const cont = h('div');

  // Navegación de semanas
  cont.appendChild(h('div.fila.sep', { style: { marginBottom: '12px' } },
    h('button.btn.chico', { onclick: () => { lunesActual = S.sumarDias(lunesActual, -7); ctx.refrescar(); } }, '‹ Anterior'),
    h('span.chico', lunesActual === S.inicioSemana(hoy) ? 'Semana actual' : ''),
    h('button.btn.chico', {
      disabled: lunesActual >= S.inicioSemana(hoy),
      onclick: () => { lunesActual = S.sumarDias(lunesActual, 7); ctx.refrescar(); }
    }, 'Siguiente ›')));

  const habiles = fechas.filter(f => !S.esFinDeSemana(f));
  const registrados = habiles.filter(f => checkins.some(c => c.fecha === f)).length;

  cont.appendChild(h('div.card',
    h('div.fila.sep',
      h('div', h('div.chico', 'Horas registradas'), h('h2', { style: { margin: 0 } }, fmtHoras(t.total))),
      h('div', { style: { textAlign: 'right' } },
        h('div.chico', 'Días hábiles con cierre'),
        h('h2', { style: { margin: 0 } }, `${registrados}/${habiles.length}`)))));

  // ── Los 4 umbrales ─────────────────────────────────────────────────────
  cont.appendChild(h('div.seccion-titulo', 'Umbrales de control'));
  for (const u of UMBRALES) {
    const r = u.evaluar(t);
    cont.appendChild(h('div.card' + (r.estado === 'rojo' ? '.rojo' : ''),
      h('div.umbral',
        h('div.luz', SEMAFORO[r.estado]),
        h('div.crece',
          h('div.titulo', u.titulo),
          h('div', r.texto),
          h('div.regla', u.regla)))));
  }

  // ── Reparto por categoría ──────────────────────────────────────────────
  cont.appendChild(h('div.seccion-titulo', 'En qué se fue la semana'));
  if (t.total === 0) {
    cont.appendChild(h('div.card', vacio('Todavía no hay datos de esta semana',
      'Con un solo cierre de jornada ya se dibuja. Los umbrales quedan en gris hasta entonces, no en cero.')));
  } else {
    const card = h('div.card');
    const orden = [...CATEGORIAS].sort((a, b) => (t.porCategoria[b.id] || 0) - (t.porCategoria[a.id] || 0));
    for (const c of orden) {
      const hs = t.porCategoria[c.id] || 0;
      if (!hs) continue;
      const pct = Math.round((hs / t.total) * 100);
      card.appendChild(h('div', { style: { marginBottom: '12px' } },
        h('div.fila.sep', h('span', c.nombre), h('span.chico', `${fmtHoras(hs)} · ${pct}%`)),
        h('div.barra', h('i', { style: { width: pct + '%', background: c.color } }))));
    }
    const sin = t.porCategoria.sin_clasificar || 0;
    if (sin) card.appendChild(h('p.mini', `${fmtHoras(sin)} sin clasificar.`));
    cont.appendChild(card);
  }

  // ── Fugas de la tabla de delegación ────────────────────────────────────
  const fugas = fugasDelegacion(checkins);
  cont.appendChild(h('div.seccion-titulo', 'Horas que no eran tuyas'));
  if (!fugas.length) {
    cont.appendChild(h('div.card', h('p.chico',
      t.total ? 'Ninguna tarea de la tabla de delegación apareció esta semana.'
              : 'Sin registro: no se puede saber todavía.')));
  } else {
    const card = h('div.card.rojo');
    const total = fugas.reduce((a, b) => a + b.horas, 0);
    card.appendChild(h('h2', `${fmtHoras(total)} en tareas con otro dueño`));
    for (const f of fugas) {
      card.appendChild(h('div', { style: { padding: '8px 0', borderTop: '1px solid var(--linea)' } },
        h('div.fila.sep', h('strong', f.nombre), h('span.chico.nowrap', fmtHoras(f.horas))),
        h('div.mini', f.tareas.join(' · '))));
    }
    card.appendChild(h('a.btn.chico', { href: '#/delegar', style: { marginTop: '10px', display: 'inline-block' } },
      'Ver qué pasarle a cada uno'));
    cont.appendChild(card);
  }

  // ── Detalle por día ────────────────────────────────────────────────────
  cont.appendChild(h('div.seccion-titulo', 'Día por día'));
  const lista = h('ul.limpia');
  for (const f of fechas) {
    const ck = checkins.find(c => c.fecha === f);
    const hs = ck ? ck.segmentos.reduce((a, b) => a + (b.horas || 0), 0) : 0;
    lista.appendChild(h('li', h('div.fila.sep',
      h('div.crece',
        h('div', S.fechaLarga(f)),
        h('div.mini', ck ? ck.texto.slice(0, 80) : (S.esFinDeSemana(f) ? '—' : 'Sin cierre de jornada'))),
      h('span.chico.nowrap', ck ? fmtHoras(hs) : ''))));
  }
  cont.appendChild(h('div.card', lista));
  return cont;
}
