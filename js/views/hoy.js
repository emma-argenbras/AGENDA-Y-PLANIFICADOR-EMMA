/**
 * hoy.js — La pantalla que se usa 30 segundos por día.
 *
 * Dos cosas y nada más:
 *  1. Las 3 prioridades (filtradas contra la tabla de delegación).
 *  2. El check-in de una sola pregunta.
 */

import { h, toast, modal, fmtHoras, vacio } from '../ui.js';
import * as S from '../store.js';
import { clasificarCheckin, evaluarPrioridad, clasificarFragmento } from '../classify.js';
import { CATEGORIAS, CAT, PERSONAS } from '../rules.js';
import { PRUEBA } from '../prueba-luciana.js';

const MAX_PRIORIDADES = 3;

export async function render(ctx) {
  const hoy = S.hoyISO();
  ctx.subtitulo(S.fechaLarga(hoy));

  const cont = h('div');
  const [prioridades, checkin, racha] = await Promise.all([
    S.getPrioridades(hoy),
    S.getCheckin(hoy),
    S.rachaSinRegistro(S.sumarDias(hoy, -1))
  ]);

  // ── Aviso de racha: la app no se hace la distraída ──────────────────────
  if (racha >= 2) {
    cont.appendChild(h('div.card.rojo',
      h('h2', `${racha} días hábiles sin cierre de jornada`),
      h('p.chico', 'No es un recordatorio genérico: van ' + racha + ' días seguidos sin registrar nada. ' +
        'El problema que la app tiene que resolver es exactamente este.')));
  } else if (racha === 1) {
    cont.appendChild(h('div.card',
      h('p.chico', 'Ayer no hubo cierre de jornada. Si querés, cargalo igual desde el historial de abajo.')));
  }

  // ── Revisión de la prueba si hoy es viernes de revisión ────────────────
  if (PRUEBA.revisiones.includes(hoy)) {
    cont.appendChild(h('div.card',
      h('div.fila.sep',
        h('div.crece',
          h('h2', 'Hoy toca revisión de Luciana'),
          h('p.mini', '15 minutos. Si las revisiones no se hacen, la prueba se cancela.')),
        h('a.btn.primario.chico', { href: '#/prueba' }, 'Registrar'))));
  }

  cont.appendChild(seccionPrioridades(hoy, prioridades, ctx));
  cont.appendChild(seccionCheckin(hoy, checkin, ctx));
  cont.appendChild(await seccionHistorial(hoy));
  return cont;
}

/* ── Prioridades ─────────────────────────────────────────────────────────── */

function seccionPrioridades(fecha, prioridades, ctx) {
  const wrap = h('div');
  const encabezado = h('div.seccion-titulo');
  wrap.appendChild(encabezado);

  const lista = h('div');
  const pintar = () => {
    encabezado.textContent = `Prioridades de hoy (${prioridades.length}/${MAX_PRIORIDADES})`;
    lista.replaceChildren();
    if (!prioridades.length) {
      lista.appendChild(vacio('Sin prioridades cargadas',
        'Tres como máximo. Si algo está en la tabla de delegación, la app no lo va a dejar entrar.'));
    }
    prioridades.forEach((p, i) => {
      const cat = CAT[p.clasificacion?.categoria];
      lista.appendChild(h('div.card',
        h('div.fila',
          h('button.chip', {
            onclick: async () => {
              p.hecha = !p.hecha;
              await S.setPrioridades(fecha, prioridades);
              pintar();
            }
          }, p.hecha ? '✓' : '○'),
          h('div.crece',
            h('div', { class: p.hecha ? 'tachado' : '' }, p.texto),
            cat ? h('div.mini', cat.nombre) : null),
          h('button.btn.chico.fantasma', {
            onclick: async () => {
              prioridades.splice(i, 1);
              await S.setPrioridades(fecha, prioridades);
              pintar();
            }
          }, '✕'))));
    });
  };
  pintar();
  wrap.appendChild(lista);

  const input = h('input', { type: 'text', placeholder: 'Agregar prioridad…', enterkeyhint: 'done' });
  const agregar = async () => {
    const texto = input.value.trim();
    if (!texto) return;
    if (prioridades.length >= MAX_PRIORIDADES) {
      toast('Ya tenés 3. Sacá una antes de agregar otra.', 'error');
      return;
    }
    const ev = evaluarPrioridad(texto);
    if (!ev.permitida) {
      await bloqueoDelegacion(texto, ev, fecha);
      input.value = '';
      ctx.refrescar();
      return;
    }
    prioridades.push({ id: crypto.randomUUID(), texto, hecha: false, creado: Date.now(), clasificacion: ev.clasificacion });
    await S.setPrioridades(fecha, prioridades);
    input.value = '';
    pintar();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') agregar(); });

  wrap.appendChild(h('div.fila', { style: { marginTop: '4px' } },
    h('div.crece', input),
    h('button.btn.primario', { onclick: agregar }, '+')));
  return wrap;
}

/** Pantalla roja: esto no entra como prioridad tuya. La única salida es derivarlo. */
async function bloqueoDelegacion(texto, ev, fecha) {
  const d = ev.delegacion;
  const r = await modal({
    titulo: 'NO ES TUYA',
    cuerpo: h('div',
      h('p', h('strong', texto)),
      h('p', h('span.badge.no-tuya', 'Dueño: ' + d.duenoNombre)),
      h('p.chico', `Tabla de delegación: «${d.tarea}» → ${d.duenoNombre}.`),
      d.excepcion ? h('p.chico', d.excepcion) : null,
      h('p.chico', 'Test de la hora: si lo puede hacer alguien que cobra menos que vos, no es tuyo. ' +
        'Sin excepción de "es más rápido si lo hago yo".')),
    acciones: [
      { texto: 'Pasárselo a ' + primerNombre(d.duenoNombre), tipo: 'primario', valor: 'derivar' },
      { texto: 'Reescribir', valor: null }
    ]
  });
  if (r === 'derivar') {
    const derivaciones = await S.getDerivaciones();
    derivaciones.unshift({
      id: crypto.randomUUID(), texto, dueno: d.dueno, duenoNombre: d.duenoNombre,
      tarea: d.tarea, fecha, origen: 'prioridad', avisado: false, creado: Date.now()
    });
    await S.setDerivaciones(derivaciones);
    toast(`Anotado para pasarle a ${primerNombre(d.duenoNombre)}.`);
  }
}

const primerNombre = n => String(n).split(' ')[0];

/* ── Check-in ────────────────────────────────────────────────────────────── */

function seccionCheckin(fecha, checkin, ctx) {
  const wrap = h('div');
  wrap.appendChild(h('div.seccion-titulo', 'Cierre de jornada'));

  if (checkin) {
    wrap.appendChild(resumenCheckin(fecha, checkin, ctx));
    return wrap;
  }

  const ta = h('textarea', {
    placeholder: '¿Qué te comió más horas hoy?',
    enterkeyhint: 'done'
  });

  const botones = h('div.btn-fila', { style: { marginTop: '10px' } },
    h('button.btn.primario.crece', {
      onclick: async () => {
        const texto = ta.value.trim();
        if (!texto) { toast('Escribí una frase, aunque sea corta.', 'error'); return; }
        const ajustes = await S.getAjustes();
        const { segmentos } = clasificarCheckin(texto, ajustes.horasDiaPorDefecto);
        await editarSegmentos(fecha, { fecha, texto, segmentos, creado: Date.now() }, ctx);
      }
    }, 'Guardar'));

  const dictado = botonDictado(ta);
  if (dictado) botones.appendChild(dictado);

  wrap.appendChild(h('div.card',
    h('p.chico', 'Una sola pregunta. Se registra lo que pasó, no lo que estaba planificado.'),
    ta, botones));
  return wrap;
}

/** Dictado por voz si el navegador lo soporta. Si no, ni aparece el botón. */
function botonDictado(ta) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  let rec = null, activo = false;
  const btn = h('button.btn', { type: 'button' }, '🎤 Dictar');
  btn.onclick = () => {
    if (activo) { rec?.stop(); return; }
    rec = new SR();
    rec.lang = 'es-AR';
    rec.interimResults = true;
    rec.continuous = false;
    const base = ta.value ? ta.value.trim() + ' ' : '';
    rec.onresult = e => {
      let t = '';
      for (const r of e.results) t += r[0].transcript;
      ta.value = base + t;
    };
    rec.onerror = () => { activo = false; btn.textContent = '🎤 Dictar'; toast('No se pudo usar el micrófono.', 'error'); };
    rec.onend = () => { activo = false; btn.textContent = '🎤 Dictar'; };
    try { rec.start(); activo = true; btn.textContent = '■ Parar'; }
    catch { toast('No se pudo iniciar el dictado.', 'error'); }
  };
  return btn;
}

/** Paso 2: confirmar categorías y horas. Todo a un toque, sin formularios. */
async function editarSegmentos(fecha, ck, ctx) {
  const cuerpo = h('div');
  const pintar = () => {
    cuerpo.replaceChildren();
    ck.segmentos.forEach((s, i) => cuerpo.appendChild(tarjetaSegmento(s, () => pintar())));
    const total = ck.segmentos.reduce((a, b) => a + (b.horas || 0), 0);
    cuerpo.appendChild(h('p.chico', `Total del día: ${fmtHoras(total)}`));
  };
  pintar();

  const r = await modal({
    titulo: 'Así lo registro',
    cuerpo,
    acciones: [
      { texto: 'Confirmar', tipo: 'primario', valor: 'ok' },
      { texto: 'Cancelar', valor: null }
    ]
  });
  if (r !== 'ok') return;

  ck.actualizado = Date.now();
  await S.setCheckin(fecha, ck);

  // Lo que apareció y no era tuyo queda anotado para delegar.
  const nuevas = ck.segmentos.filter(s => s.delegacion);
  if (nuevas.length) {
    const derivaciones = await S.getDerivaciones();
    for (const s of nuevas) {
      derivaciones.unshift({
        id: crypto.randomUUID(), texto: s.texto, dueno: s.delegacion.dueno,
        duenoNombre: s.delegacion.duenoNombre, tarea: s.delegacion.tarea,
        fecha, origen: 'checkin', avisado: false, creado: Date.now(), horas: s.horas
      });
    }
    await S.setDerivaciones(derivaciones);
  }
  toast('Cierre guardado.');
  ctx.refrescar();
}

function tarjetaSegmento(s, repintar) {
  const cat = CAT[s.categoria];
  const card = h('div.segmento' + (s.delegacion ? '.no-tuya' : ''));
  card.appendChild(h('div.txt', s.texto));

  if (s.delegacion) {
    card.appendChild(h('p', h('span.badge.no-tuya', 'NO ES TUYA → ' + s.delegacion.duenoNombre)));
    card.appendChild(h('p.mini', `«${s.delegacion.tarea}» tiene un solo dueño y no sos vos.` +
      (s.delegacion.excepcion ? ' ' + s.delegacion.excepcion : '')));
  }
  if (s.decisionPropia) {
    card.appendChild(h('p', h('span.badge.propia', 'DECISIÓN TUYA'), ' ', h('span.mini', s.decisionPropia.texto)));
  }

  if (s.forzada) {
    card.appendChild(h('p.mini', `Categoría: ${cat?.nombre}. Fijada por la regla de mapeo: ` +
      'esto va siempre a Ejecución Operativa, aunque la agenda dijera otra cosa.'));
  } else {
    const chips = h('div.chips');
    CATEGORIAS.forEach(c => chips.appendChild(h('button.chip' + (c.id === s.categoria ? '.activo' : ''), {
      onclick: () => { s.categoria = c.id; repintar(); }
    }, c.nombre)));
    if (!s.categoria) card.appendChild(h('p.mini', 'No pude clasificarlo. Elegí una:'));
    card.appendChild(chips);
  }

  card.appendChild(h('div.horas', { style: { marginTop: '10px' } },
    h('button', { onclick: () => { s.horas = Math.max(0.5, (s.horas || 0) - 0.5); repintar(); } }, '−'),
    h('div.val', fmtHoras(s.horas || 0)),
    h('button', { onclick: () => { s.horas = Math.min(16, (s.horas || 0) + 0.5); repintar(); } }, '+')));
  return card;
}

function resumenCheckin(fecha, ck, ctx) {
  const card = h('div.card');
  card.appendChild(h('p.chico', 'Cierre registrado. Esto es lo que quedó:'));
  for (const s of ck.segmentos) {
    const cat = CAT[s.categoria];
    card.appendChild(h('div.fila.sep', { style: { padding: '7px 0', borderTop: '1px solid var(--linea)' } },
      h('div.crece',
        h('div', s.texto),
        h('div.mini', (cat?.nombre || 'Sin categoría') + (s.delegacion ? ' · era de ' + s.delegacion.duenoNombre : ''))),
      h('div.nowrap' + (s.delegacion ? '.chico' : '.chico'), fmtHoras(s.horas))));
  }
  card.appendChild(h('div.btn-fila', { style: { marginTop: '12px' } },
    h('button.btn.chico', {
      onclick: () => editarSegmentos(fecha, { ...ck, segmentos: ck.segmentos.map(x => ({ ...x })) }, ctx)
    }, 'Ajustar'),
    h('button.btn.chico.fantasma', {
      onclick: async () => {
        const ok = await modal({
          titulo: '¿Borrar el cierre de hoy?', cuerpo: 'Vas a poder cargarlo de nuevo.',
          acciones: [{ texto: 'Borrar', tipo: 'peligro', valor: true }, { texto: 'No', valor: false }]
        });
        if (ok) { await S.del(S.K.checkin(fecha)); ctx.refrescar(); }
      }
    }, 'Borrar')));
  return card;
}

/* ── Historial corto: los últimos 7 días, para cargar lo que falta ───────── */

async function seccionHistorial(hoy) {
  const wrap = h('div');
  wrap.appendChild(h('div.seccion-titulo', 'Últimos días'));
  const fechas = Array.from({ length: 7 }, (_, i) => S.sumarDias(hoy, -i - 1));
  const lista = h('ul.limpia');
  for (const f of fechas) {
    const ck = await S.getCheckin(f);
    const total = ck ? ck.segmentos.reduce((a, b) => a + (b.horas || 0), 0) : 0;
    lista.appendChild(h('li',
      h('div.fila.sep',
        h('div.crece',
          h('div', S.fechaLarga(f)),
          h('div.mini', ck ? ck.texto.slice(0, 70) : (S.esFinDeSemana(f) ? 'Fin de semana' : 'Sin registro'))),
        ck ? h('span.chico.nowrap', fmtHoras(total))
           : h('button.btn.chico', { onclick: () => cargarDiaPasado(f) }, 'Cargar'))));
  }
  wrap.appendChild(h('div.card', lista));
  return wrap;
}

async function cargarDiaPasado(fecha) {
  const ta = h('textarea', { placeholder: '¿Qué te comió más horas ese día?' });
  const r = await modal({
    titulo: S.fechaLarga(fecha),
    cuerpo: h('div', h('p.chico', 'Mejor tarde que nunca: sirve igual para la semana.'), ta),
    acciones: [{ texto: 'Guardar', tipo: 'primario', valor: 'ok' }, { texto: 'Cancelar', valor: null }]
  });
  if (r !== 'ok' || !ta.value.trim()) return;
  const ajustes = await S.getAjustes();
  const { segmentos } = clasificarCheckin(ta.value.trim(), ajustes.horasDiaPorDefecto);
  await editarSegmentos(fecha, { fecha, texto: ta.value.trim(), segmentos, creado: Date.now() },
    { refrescar: () => location.reload() });
}
