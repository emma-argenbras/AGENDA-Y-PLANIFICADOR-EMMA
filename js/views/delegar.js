/**
 * delegar.js — Todo lo que hiciste vos y tenía otro dueño, agrupado por persona.
 * Es la lista de "qué pasarle a quién", que es el problema real del brief.
 */

import { h, toast, vacio, fmtHoras } from '../ui.js';
import * as S from '../store.js';
import { DELEGACION, PERSONAS } from '../rules.js';

export async function render(ctx) {
  const derivaciones = await S.getDerivaciones();
  const pendientes = derivaciones.filter(d => !d.avisado);
  ctx.subtitulo(pendientes.length ? `${pendientes.length} sin avisar` : 'Nada pendiente de avisar');

  const cont = h('div');

  if (!derivaciones.length) {
    cont.appendChild(h('div.card', vacio('Todavía no hay nada acá',
      'Cuando cargues algo que está en la tabla de delegación —en el cierre del día o como prioridad— ' +
      'aparece acá con el nombre del dueño.')));
  }

  const porDueno = {};
  for (const d of pendientes) (porDueno[d.dueno] = porDueno[d.dueno] || []).push(d);

  for (const [dueno, items] of Object.entries(porDueno)) {
    const horas = items.reduce((a, b) => a + (Number(b.horas) || 0), 0);
    const card = h('div.card.rojo',
      h('div.fila.sep',
        h('h2', { style: { margin: 0 } }, PERSONAS[dueno]?.nombre || dueno),
        horas ? h('span.chico.nowrap', fmtHoras(horas) + ' tuyas') : null),
      PERSONAS[dueno]?.rol ? h('p.mini', PERSONAS[dueno].rol) : null);

    for (const d of items) {
      card.appendChild(h('div.fila', { style: { padding: '9px 0', borderTop: '1px solid var(--linea)' } },
        h('div.crece', h('div', d.texto), h('div.mini', `${d.tarea} · ${S.fechaCorta(d.fecha)}`)),
        h('button.btn.chico', {
          onclick: async () => {
            const todas = await S.getDerivaciones();
            const it = todas.find(x => x.id === d.id);
            if (it) { it.avisado = true; it.avisadoEl = S.hoyISO(); await S.setDerivaciones(todas); }
            toast('Marcado como avisado.');
            ctx.refrescar();
          }
        }, 'Avisado')));
    }
    cont.appendChild(card);
  }

  // Referencia siempre visible de la tabla completa
  cont.appendChild(h('div.seccion-titulo', 'Tabla de delegación (fija)'));
  const tabla = h('div.card');
  for (const d of DELEGACION) {
    tabla.appendChild(h('div.fila.sep', { style: { padding: '8px 0', borderTop: '1px solid var(--linea)' } },
      h('div.crece', h('div', d.tarea), d.excepcion ? h('div.mini', d.excepcion) : null),
      h('span.chico.nowrap', PERSONAS[d.dueno]?.nombre?.split(' ')[0] || d.dueno)));
  }
  cont.appendChild(tabla);

  const avisadas = derivaciones.filter(d => d.avisado);
  if (avisadas.length) {
    cont.appendChild(h('div.seccion-titulo', `Ya avisadas (${avisadas.length})`));
    cont.appendChild(h('div.card', h('ul.limpia', avisadas.slice(0, 25).map(d =>
      h('li.chico', `${d.texto} → ${d.duenoNombre.split(' ')[0]} · ${S.fechaCorta(d.fecha)}`)))));
    cont.appendChild(h('button.btn.chico.fantasma', {
      onclick: async () => {
        await S.setDerivaciones((await S.getDerivaciones()).filter(d => !d.avisado));
        toast('Historial limpio.');
        ctx.refrescar();
      }
    }, 'Limpiar avisadas'));
  }
  return cont;
}
