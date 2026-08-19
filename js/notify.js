/**
 * notify.js — Recordatorios locales.
 *
 * Sin servidor propio no hay Web Push de verdad, así que esto usa
 * notificaciones locales: se programan mientras la app está abierta y, en
 * Android con la PWA instalada, también por Periodic Background Sync.
 * Lo que nunca falla es el aviso dentro de la app al abrirla (banner de racha).
 *
 * Regla del brief: si pasan dos días sin responder, el mensaje deja de ser
 * genérico y lo dice explícitamente.
 */

import * as S from './store.js';

export function soportado() { return 'Notification' in window; }

export async function pedirPermiso() {
  if (!soportado()) throw new Error('Este navegador no soporta notificaciones.');
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('No diste permiso para notificaciones.');
  await pedirPeriodicSync();
  return true;
}

async function pedirPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg || !('periodicSync' in reg)) return false;
    const estado = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (estado.state !== 'granted') return false;
    await reg.periodicSync.register('recordatorios', { minInterval: 60 * 60 * 1000 });
    return true;
  } catch { return false; }
}

/** Mensaje de la mañana: las 3 prioridades. */
export async function textoManana(fecha = S.hoyISO()) {
  const prio = await S.getPrioridades(fecha);
  if (!prio.length) {
    return { titulo: 'Sin prioridades cargadas', cuerpo: 'Elegí 3 antes de que el día las elija por vos.' };
  }
  return {
    titulo: `Hoy: ${prio.length} prioridad(es)`,
    cuerpo: prio.map((p, i) => `${i + 1}. ${p.texto}`).join('\n')
  };
}

/** Mensaje de la noche: el check-in de una frase, con memoria de la racha. */
export async function textoNoche(fecha = S.hoyISO()) {
  const yaHizo = await S.getCheckin(fecha);
  if (yaHizo) return null;
  const racha = await S.rachaSinRegistro(S.sumarDias(fecha, -1));
  if (racha >= 2) {
    return {
      titulo: `${racha} días sin cierre de jornada`,
      cuerpo: 'No es el recordatorio de siempre: van ' + racha + ' días seguidos sin registrar nada. Una frase y listo.'
    };
  }
  return { titulo: '¿Qué te comió más horas hoy?', cuerpo: 'Una frase. Treinta segundos.' };
}

export async function mostrar({ titulo, cuerpo, tag }) {
  if (!soportado() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker?.ready.catch(() => null);
  const opciones = { body: cuerpo, tag, icon: './icons/icon-192.png', badge: './icons/icon-192.png', data: { url: './#/hoy' } };
  if (reg) await reg.showNotification(titulo, opciones);
  else new Notification(titulo, opciones);
  return true;
}

/**
 * Programa los avisos del día mientras la app esté abierta.
 * Se vuelve a llamar en cada arranque; los timers no sobreviven al cierre.
 */
let timers = [];
export async function programarDelDia() {
  timers.forEach(clearTimeout);
  timers = [];
  const a = await S.getAjustes();
  if (!a.notificaciones || Notification.permission !== 'granted') return;

  const ahora = new Date();
  for (const [hora, cual] of [[a.horaManana, 'manana'], [a.horaNoche, 'noche']]) {
    const [hh, mm] = String(hora).split(':').map(Number);
    const t = new Date(ahora);
    t.setHours(hh || 8, mm || 0, 0, 0);
    const delta = t - ahora;
    if (delta <= 0 || delta > 20 * 3600 * 1000) continue;
    timers.push(setTimeout(async () => {
      const msg = cual === 'manana' ? await textoManana() : await textoNoche();
      if (msg) await mostrar({ ...msg, tag: 'agenda-' + cual });
    }, delta));
  }
}
