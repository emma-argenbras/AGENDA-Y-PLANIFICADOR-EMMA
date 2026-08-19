/**
 * prueba.js — Seguimiento de la prueba de Luciana (sección 4 del brief).
 * Cuenta atrás al 05/09 y checklist de señales en cada revisión de viernes.
 */

import { h, modal, toast } from '../ui.js';
import * as S from '../store.js';
import { PRUEBA, estadoPrueba, diasEntre } from '../prueba-luciana.js';

export async function render(ctx) {
  const hoy = S.hoyISO();
  const registros = await S.getPrueba();
  const est = estadoPrueba(hoy, registros);
  ctx.subtitulo(`${S.fechaCorta(PRUEBA.inicio)} al ${S.fechaCorta(PRUEBA.fin)} · decisión ${S.fechaCorta(PRUEBA.decision)}`);

  const cont = h('div');

  // Cuenta atrás
  const d = est.diasParaDecision;
  cont.appendChild(h('div.card',
    h('div.fila.sep',
      h('div',
        h('div.chico', 'Decisión en Directorio'),
        h('h2', { style: { margin: 0 } },
          d > 0 ? `Faltan ${d} días` : d === 0 ? 'Es hoy' : `Pasaron ${-d} días`)),
      h('div', { style: { textAlign: 'right' } },
        h('div.chico', 'Mejoras propuestas'),
        h('h2', { style: { margin: 0 } }, `${est.mejoras}/${est.objetivoMejoras}`)))));

  if (est.riesgo) {
    cont.appendChild(h('div.card.rojo',
      h('h2', 'Prueba en riesgo'),
      h('p', est.riesgo.texto),
      h('p.mini', PRUEBA.reglaCancelacion)));
  }

  // Revisiones
  cont.appendChild(h('div.seccion-titulo', 'Revisiones de 15 minutos (viernes)'));
  for (const r of est.revisiones) {
    const etiqueta = { hecha: '✓ Registrada', vencida: '⚠ Vencida sin registrar', hoy: '● Es hoy', pendiente: 'Pendiente' }[r.estado];
    cont.appendChild(h('div.card' + (r.estado === 'vencida' ? '.rojo' : ''),
      h('div.fila.sep',
        h('div.crece',
          h('strong', S.fechaLarga(r.fecha)),
          h('div.mini', etiqueta)),
        h('button.btn.chico' + (r.estado === 'hecha' ? '' : '.primario'), {
          onclick: () => registrarRevision(r.fecha, r.datos, ctx)
        }, r.estado === 'hecha' ? 'Ver / editar' : 'Registrar')),
      r.datos ? resumenRevision(r.datos) : null));
  }

  // Encargo y límites
  cont.appendChild(h('div.seccion-titulo', 'El encargo'));
  cont.appendChild(h('div.card',
    h('h3', 'Hace'),
    h('ul.limpia', PRUEBA.encargo.map(x => h('li', x))),
    h('h3', { style: { marginTop: '12px' } }, 'No hace'),
    h('ul.limpia', PRUEBA.noHace.map(x => h('li.chico', x)))));

  // Salidas
  cont.appendChild(h('div.seccion-titulo', `Las 3 salidas del ${S.fechaCorta(PRUEBA.decision)}`));
  const elegida = registros.__cierre?.salida;
  for (const s of PRUEBA.salidas) {
    cont.appendChild(h('div.card', { style: elegida === s.id ? { borderColor: 'var(--verde)' } : {} },
      h('div.fila.sep',
        h('div.crece', h('strong', `${s.id}. ${s.titulo}`), h('div.mini', s.detalle)),
        h('button.btn.chico' + (elegida === s.id ? '.primario' : ''), {
          onclick: () => cerrarPrueba(s, ctx)
        }, elegida === s.id ? 'Elegida' : 'Elegir'))));
  }

  // Pendientes abiertos
  cont.appendChild(h('div.seccion-titulo', 'Pendiente sin resolver'));
  for (const p of PRUEBA.pendientes) {
    const resp = registros[`pendiente:${p.id}`];
    cont.appendChild(h('div.card',
      h('p', p.texto),
      h('p.mini', `Recomendado: ${p.recomendado}. ${p.nota}`),
      h('div.btn-fila',
        ...['Sí', 'No'].map(v => h('button.btn.chico' + (resp === v ? '.primario' : ''), {
          onclick: async () => {
            const regs = await S.getPrueba();
            regs[`pendiente:${p.id}`] = v;
            await S.setPrueba(regs);
            toast(`Anotado: ${v}.`);
            ctx.refrescar();
          }
        }, v)))));
  }
  return cont;
}

function resumenRevision(datos) {
  const linea = PRUEBA.senales.map(s => {
    const v = datos[s.id];
    if (v === undefined || v === '') return null;
    const bien = s.tipo === 'bool' ? v === s.bueno
      : s.tipo === 'opcion' ? v === s.bueno
      : s.mejorEs === 'menor' ? Number(v) <= (s.objetivo ?? 0) : Number(v) >= (s.objetivo ?? 0);
    return h('li.mini', (bien ? '🟢 ' : '🔴 ') + s.pregunta.replace(/\?$/, '') + ': ' +
      (s.tipo === 'bool' ? (v ? 'sí' : 'no') : v));
  }).filter(Boolean);
  return h('ul.limpia', { style: { marginTop: '8px' } }, linea);
}

async function registrarRevision(fecha, datos, ctx) {
  const valores = { ...(datos || {}) };
  const cuerpo = h('div');
  cuerpo.appendChild(h('p.chico', '15 minutos. Las señales son estas y no otras.'));

  for (const s of PRUEBA.senales) {
    const campo = h('div.card' + (s.destacada ? '.rojo' : ''), { style: { marginBottom: '10px' } });
    campo.appendChild(h('div', s.pregunta));
    if (s.ayuda) campo.appendChild(h('div.mini', s.ayuda));

    if (s.tipo === 'bool') {
      const chips = h('div.chips', { style: { marginTop: '8px' } });
      [['Sí', true], ['No', false]].forEach(([t, v]) => {
        const c = h('button.chip' + (valores[s.id] === v ? '.activo' : ''), {
          onclick: () => { valores[s.id] = v; [...chips.children].forEach(x => x.classList.remove('activo')); c.classList.add('activo'); }
        }, t);
        chips.appendChild(c);
      });
      campo.appendChild(chips);
    } else if (s.tipo === 'opcion') {
      const chips = h('div.chips', { style: { marginTop: '8px' } });
      s.opciones.forEach(op => {
        const c = h('button.chip' + (valores[s.id] === op ? '.activo' : ''), {
          onclick: () => { valores[s.id] = op; [...chips.children].forEach(x => x.classList.remove('activo')); c.classList.add('activo'); }
        }, op);
        chips.appendChild(c);
      });
      campo.appendChild(chips);
    } else {
      const inp = h('input', { type: 'number', inputmode: 'numeric', min: 0, value: valores[s.id] ?? '' });
      inp.addEventListener('input', () => { valores[s.id] = inp.value === '' ? '' : Number(inp.value); });
      campo.appendChild(h('div', { style: { marginTop: '8px' } }, inp));
    }
    cuerpo.appendChild(campo);
  }

  const notas = h('textarea', { placeholder: 'Notas de la revisión (opcional)', value: valores.notas || '' });
  notas.addEventListener('input', () => { valores.notas = notas.value; });
  cuerpo.appendChild(h('label.campo', h('span', 'Notas'), notas));

  const r = await modal({
    titulo: 'Revisión ' + S.fechaCorta(fecha),
    cuerpo,
    acciones: [{ texto: 'Guardar', tipo: 'primario', valor: 'ok' }, { texto: 'Cancelar', valor: null }]
  });
  if (r !== 'ok') return;
  const regs = await S.getPrueba();
  regs[fecha] = { ...valores, registrado: Date.now() };
  await S.setPrueba(regs);
  toast('Revisión registrada.');
  ctx.refrescar();
}

async function cerrarPrueba(salida, ctx) {
  const nota = h('textarea', { placeholder: 'Por qué (una línea alcanza)' });
  const r = await modal({
    titulo: `Salida ${salida.id}: ${salida.titulo}`,
    cuerpo: h('div',
      h('p.chico', salida.detalle),
      h('p.mini', 'Es una decisión tuya: incorporación y desvinculación de gente clave (decisión 5).'),
      nota),
    acciones: [{ texto: 'Confirmar decisión', tipo: 'primario', valor: 'ok' }, { texto: 'Cancelar', valor: null }]
  });
  if (r !== 'ok') return;
  const regs = await S.getPrueba();
  regs.__cierre = { salida: salida.id, titulo: salida.titulo, nota: nota.value.trim(), fecha: S.hoyISO() };
  await S.setPrueba(regs);
  toast('Decisión registrada.');
  ctx.refrescar();
}
