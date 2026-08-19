/**
 * actas.js — Regla 2: el acta se escribe el mismo día.
 * Qué se decidió / quién lo hace / para cuándo. Sin eso, la reunión no cuenta.
 */

import { h, modal, toast, vacio } from '../ui.js';
import * as S from '../store.js';
import { validarResponsableUnico } from '../classify.js';
import { PERSONAS } from '../rules.js';

export async function render(ctx) {
  const hoy = S.hoyISO();
  const reuniones = await S.getReuniones();
  const sinActa = reuniones.filter(r => !r.acta?.length);
  ctx.subtitulo(sinActa.length ? `${sinActa.length} sin acta` : 'Todo con acta');

  const cont = h('div');

  cont.appendChild(h('button.btn.primario.ancho', {
    onclick: () => nuevaReunion(ctx)
  }, '+ Registrar reunión'));

  if (sinActa.length) {
    cont.appendChild(h('div.seccion-titulo', 'Sin acta — no cuentan'));
    for (const r of sinActa) {
      const dias = Math.max(0, diasDesde(r.fecha, hoy));
      cont.appendChild(h('div.card.rojo',
        h('div.fila.sep',
          h('div.crece',
            h('strong', r.titulo),
            h('div.mini', `${S.fechaLarga(r.fecha)} · ${dias === 0 ? 'hoy' : `hace ${dias} día(s)`}`)),
          h('button.btn.chico.primario', { onclick: () => escribirActa(r, ctx) }, 'Escribir acta')),
        dias > 0 ? h('p.mini', 'El acta se escribe el mismo día. Esta ya está tarde.') : null));
    }
  }

  // Compromisos vivos que salieron de las actas
  const compromisos = reuniones.flatMap(r => (r.acta || []).map((a, i) => ({ ...a, reunion: r, idx: i })))
    .filter(c => !c.hecho)
    .sort((a, b) => String(a.cuando).localeCompare(String(b.cuando)));

  cont.appendChild(h('div.seccion-titulo', `Compromisos abiertos (${compromisos.length})`));
  if (!compromisos.length) {
    cont.appendChild(h('div.card', vacio('Sin compromisos abiertos',
      'Cada acta genera compromisos con un solo nombre y una fecha. Acá quedan hasta que se cumplen.')));
  } else {
    const card = h('div.card');
    compromisos.forEach(c => {
      const vencido = c.cuando && c.cuando < hoy;
      card.appendChild(h('div.fila', { style: { padding: '9px 0', borderTop: '1px solid var(--linea)' } },
        h('button.chip', {
          onclick: async () => {
            const rs = await S.getReuniones();
            const r = rs.find(x => x.id === c.reunion.id);
            if (r) { r.acta[c.idx].hecho = true; await S.setReuniones(rs); ctx.refrescar(); }
          }
        }, '○'),
        h('div.crece',
          h('div', c.que),
          h('div.mini', `${c.quien} · para ${c.cuando ? S.fechaCorta(c.cuando) : 'sin fecha'}` +
            (vencido ? ' · VENCIDO' : '') + ` · ${c.reunion.titulo}`))));
    });
    cont.appendChild(card);
  }

  // Historial
  const conActa = reuniones.filter(r => r.acta?.length);
  cont.appendChild(h('div.seccion-titulo', `Reuniones con acta (${conActa.length})`));
  if (!conActa.length) {
    cont.appendChild(h('div.card', h('p.chico', 'Todavía ninguna.')));
  } else {
    for (const r of conActa.slice(0, 20)) {
      cont.appendChild(h('div.card',
        h('div.fila.sep',
          h('div.crece', h('strong', r.titulo), h('div.mini', S.fechaLarga(r.fecha) + (r.tarde ? ' · acta tardía' : ''))),
          h('button.btn.chico.fantasma', { onclick: () => escribirActa(r, ctx) }, 'Editar')),
        h('ul.limpia', r.acta.map(a => h('li.chico',
          `${a.hecho ? '✓ ' : ''}${a.que} → ${a.quien} · ${a.cuando ? S.fechaCorta(a.cuando) : 'sin fecha'}`)))));
    }
  }
  return cont;
}

const diasDesde = (a, b) => Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 86400000);

async function nuevaReunion(ctx) {
  const titulo = h('input', { type: 'text', placeholder: 'Directorio, reunión con Seba, comité de precios…' });
  const fecha = h('input', { type: 'date', value: S.hoyISO() });
  const r = await modal({
    titulo: 'Nueva reunión',
    cuerpo: h('div',
      h('label.campo', h('span', 'Qué reunión'), titulo),
      h('label.campo', h('span', 'Cuándo'), fecha),
      h('p.mini', 'Al cerrarla te va a pedir los 3 campos del acta. Sin eso, la reunión no cuenta.')),
    acciones: [{ texto: 'Crear', tipo: 'primario', valor: 'ok' }, { texto: 'Cancelar', valor: null }]
  });
  if (r !== 'ok' || !titulo.value.trim()) return;
  const reuniones = await S.getReuniones();
  reuniones.unshift({
    id: crypto.randomUUID(), titulo: titulo.value.trim(), fecha: fecha.value || S.hoyISO(),
    acta: [], creado: Date.now()
  });
  await S.setReuniones(reuniones);
  ctx.refrescar();
}

/** Los 3 campos obligatorios. No se puede cerrar sin al menos una decisión completa. */
async function escribirActa(reunion, ctx) {
  const decisiones = (reunion.acta || []).map(a => ({ ...a }));
  if (!decisiones.length) decisiones.push({ que: '', quien: '', cuando: '' });

  const cuerpo = h('div');
  const lista = h('div');
  const error = h('p.mini', { style: { color: 'var(--rojo)' } }, '');

  const pintar = () => {
    lista.replaceChildren();
    decisiones.forEach((d, i) => {
      const que = h('input', { type: 'text', placeholder: 'Qué se decidió', value: d.que || '' });
      que.addEventListener('input', () => { d.que = que.value; });

      const quien = h('input', { type: 'text', placeholder: 'Quién lo hace (un solo nombre)', value: d.quien || '', list: 'personas' });
      quien.addEventListener('input', () => { d.quien = quien.value; });

      const cuando = h('input', { type: 'date', value: d.cuando || '' });
      cuando.addEventListener('input', () => { d.cuando = cuando.value; });

      lista.appendChild(h('div.card', { style: { marginBottom: '10px' } },
        h('label.campo', h('span', 'Qué se decidió'), que),
        h('label.campo', h('span', 'Quién lo hace'), quien),
        h('label.campo', h('span', 'Para cuándo'), cuando),
        decisiones.length > 1
          ? h('button.btn.chico.fantasma', { onclick: () => { decisiones.splice(i, 1); pintar(); } }, 'Quitar')
          : null));
    });
  };
  pintar();

  cuerpo.appendChild(h('datalist#personas', Object.values(PERSONAS).map(p => h('option', { value: p.nombre }))));
  cuerpo.appendChild(lista);
  cuerpo.appendChild(h('button.btn.chico', { onclick: () => { decisiones.push({ que: '', quien: '', cuando: '' }); pintar(); } }, '+ Otra decisión'));
  cuerpo.appendChild(error);

  const r = await modal({
    titulo: 'Acta — ' + reunion.titulo,
    cuerpo,
    acciones: [
      { texto: 'Cerrar reunión', tipo: 'primario', valor: 'ok' },
      { texto: 'Dejar sin acta', valor: null }
    ]
  });
  if (r !== 'ok') return;

  const validas = decisiones.filter(d => d.que.trim() && d.quien.trim() && d.cuando);
  if (!validas.length) {
    toast('Faltan los 3 campos: qué, quién y para cuándo. Queda sin acta.', 'error');
    return;
  }
  for (const d of validas) {
    const v = validarResponsableUnico(d.quien);
    if (!v.ok) {
      await modal({
        titulo: 'Un solo nombre por tarea',
        cuerpo: h('div',
          h('p', `«${d.quien}» — ${v.motivo}`),
          h('p.mini', 'Regla 1: si aparece más de un responsable, nadie es responsable.')),
        acciones: [{ texto: 'Corregir', tipo: 'primario', valor: null }]
      });
      return escribirActa({ ...reunion, acta: decisiones }, ctx);
    }
  }

  const reuniones = await S.getReuniones();
  const item = reuniones.find(x => x.id === reunion.id);
  if (item) {
    item.acta = validas.map(d => ({ ...d, que: d.que.trim(), quien: d.quien.trim(), hecho: d.hecho || false }));
    item.cerrada = S.hoyISO();
    item.tarde = item.cerrada !== item.fecha;
    await S.setReuniones(reuniones);
  }
  toast(item?.tarde ? 'Acta guardada (fuera del mismo día).' : 'Acta guardada.');
  ctx.refrescar();
}
