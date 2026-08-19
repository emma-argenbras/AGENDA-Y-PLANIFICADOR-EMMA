/**
 * indicadores.js — Los 3 números que te corresponde mirar. Y solo esos.
 * Carga mensual, tres campos. No hay dashboard porque no hace falta.
 */

import { h, modal, toast, fmtMoneda, vacio } from '../ui.js';
import * as S from '../store.js';
import { INDICADORES } from '../rules.js';

export async function render(ctx) {
  const datos = await S.getIndicadores();
  const mes = S.hoyISO().slice(0, 7);
  ctx.subtitulo('Margen, recompra y caja a 60 días');

  const cont = h('div');
  cont.appendChild(h('div.card', h('p.chico',
    'Los otros números son de otros. Facturación, unidades y visitas no entran acá a propósito.')));

  cont.appendChild(h('button.btn.primario.ancho', { onclick: () => cargarMes(mes, datos, ctx) },
    datos.some(d => d.mes === mes) ? 'Editar ' + mesLargo(mes) : '+ Cargar ' + mesLargo(mes)));

  const ordenados = [...datos].sort((a, b) => b.mes.localeCompare(a.mes));
  if (!ordenados.length) {
    cont.appendChild(h('div.card', vacio('Sin datos todavía',
      'Se carga una vez por mes. Tres números, treinta segundos.')));
    return cont;
  }

  for (const ind of INDICADORES) {
    const card = h('div.card');
    card.appendChild(h('h2', ind.titulo));
    card.appendChild(h('p.mini', ind.aclaracion));
    for (const d of ordenados.slice(0, 12)) {
      const v = d[ind.id];
      if (v == null || v === '') continue;
      const prev = ordenados.find(x => x.mes < d.mes && x[ind.id] != null && x[ind.id] !== '');
      const delta = prev ? Number(v) - Number(prev[ind.id]) : null;
      card.appendChild(h('div.fila.sep', { style: { padding: '7px 0', borderTop: '1px solid var(--linea)' } },
        h('span.chico', mesLargo(d.mes)),
        h('span', ind.tipo === 'moneda' ? fmtMoneda(v) : String(v),
          delta != null ? h('span.mini', ` ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toLocaleString('es-AR')}`) : null)));
    }
    cont.appendChild(card);
  }
  return cont;
}

function mesLargo(m) {
  const [a, mm] = m.split('-');
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${nombres[Number(mm) - 1]} ${a}`;
}

async function cargarMes(mes, datos, ctx) {
  const actual = datos.find(d => d.mes === mes) || { mes };
  const inputs = {};
  const cuerpo = h('div');
  const selMes = h('input', { type: 'month', value: mes });
  cuerpo.appendChild(h('label.campo', h('span', 'Mes'), selMes));
  for (const ind of INDICADORES) {
    const i = h('input', { type: 'number', inputmode: 'decimal', value: actual[ind.id] ?? '' });
    inputs[ind.id] = i;
    cuerpo.appendChild(h('label.campo', h('span', `${ind.titulo} (${ind.unidad})`), i, h('div.mini', ind.aclaracion)));
  }
  const r = await modal({
    titulo: 'Indicadores del mes', cuerpo,
    acciones: [{ texto: 'Guardar', tipo: 'primario', valor: 'ok' }, { texto: 'Cancelar', valor: null }]
  });
  if (r !== 'ok') return;
  const m = selMes.value || mes;
  const todos = await S.getIndicadores();
  const item = todos.find(d => d.mes === m) || { mes: m };
  for (const ind of INDICADORES) {
    const v = inputs[ind.id].value;
    item[ind.id] = v === '' ? null : Number(v);
  }
  if (!todos.includes(item)) todos.push(item);
  await S.setIndicadores(todos);
  toast('Indicadores guardados.');
  ctx.refrescar();
}
