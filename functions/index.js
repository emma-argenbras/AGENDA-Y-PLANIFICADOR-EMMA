/**
 * functions/index.js — Los recordatorios que llegan con la app cerrada.
 *
 * Es lo único que la app no puede hacer sola desde el teléfono: un push
 * programado necesita algo que corra aunque nadie abra nada. Son tres tareas:
 *
 *   mañana  — las 3 prioridades del día.
 *   noche   — el cierre de una frase. Si van dos días sin registro, el mensaje
 *             deja de ser genérico y lo dice explícitamente (regla del brief).
 *   viernes — el checklist de la revisión de Luciana, mientras dure la prueba.
 *
 * Lee los mismos documentos que la app (usuarios/{uid}/kv) y envía a los
 * tokens que cada dispositivo dejó registrado en fcm:token.
 *
 * Desplegar:  firebase deploy --only functions
 * Requiere plan Blaze (las tareas programadas no existen en el plan gratis).
 * El costo real con un usuario y tres disparos por día es prácticamente cero.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

const ZONA = 'America/Argentina/Buenos_Aires';
const REGION = 'southamerica-east1';

/** Fechas en hora de Concordia, no en UTC: si no, el "hoy" se corre de día. */
function hoyISO(desplazamientoDias = 0) {
  const ahora = new Date(Date.now() + desplazamientoDias * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

function esFinDeSemana(iso) {
  const d = new Date(iso + 'T12:00:00Z').getUTCDay();
  return d === 0 || d === 6;
}

function sumarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function usuarios() {
  const snap = await db.collection('usuarios').listDocuments();
  return snap.map(d => d.id);
}

async function kv(uid, clave) {
  const d = await db.doc(`usuarios/${uid}/kv/${clave}`).get();
  return d.exists ? d.data().v : null;
}

async function enviar(uid, titulo, cuerpo, tag) {
  const registro = await kv(uid, 'fcm:token');
  const token = registro && registro.token;
  if (!token) return false;
  try {
    await getMessaging().send({
      token,
      webpush: {
        notification: { title: titulo, body: cuerpo, tag, icon: '/icons/icon-192x192.png' },
        fcmOptions: { link: '/#/hoy' },
      },
    });
    return true;
  } catch (e) {
    // Token vencido o dispositivo desinstalado: se limpia y sigue.
    if (String(e.code || '').includes('registration-token-not-registered')) {
      await db.doc(`usuarios/${uid}/kv/fcm:token`).delete();
    }
    console.error('push falló', uid, e.message);
    return false;
  }
}

/** Días hábiles seguidos sin cierre de jornada, sin contar antes del primer uso. */
async function rachaSinRegistro(uid, desde) {
  const ajustes = (await kv(uid, 'ajustes')) || {};
  let racha = 0;
  let f = desde;
  for (let i = 0; i < 20; i++) {
    if (ajustes.primerUso && f < ajustes.primerUso) break;
    if (!esFinDeSemana(f)) {
      if (await kv(uid, `checkin:${f}`)) break;
      racha++;
    }
    f = sumarDias(f, -1);
  }
  return racha;
}

exports.recordatorioManana = onSchedule(
  { schedule: '0 8 * * 1-5', timeZone: ZONA, region: REGION },
  async () => {
    const hoy = hoyISO();
    for (const uid of await usuarios()) {
      const ajustes = (await kv(uid, 'ajustes')) || {};
      if (!ajustes.notificaciones) continue;
      const prio = (await kv(uid, `prio:${hoy}`)) || [];
      const titulo = prio.length ? `Hoy: ${prio.length} prioridad(es)` : 'Sin prioridades cargadas';
      const cuerpo = prio.length
        ? prio.map((p, i) => `${i + 1}. ${p.texto}`).join('\n')
        : 'Elegí 3 antes de que el día las elija por vos.';
      await enviar(uid, titulo, cuerpo, 'agenda-manana');
    }
  },
);

exports.recordatorioNoche = onSchedule(
  { schedule: '30 20 * * 1-5', timeZone: ZONA, region: REGION },
  async () => {
    const hoy = hoyISO();
    for (const uid of await usuarios()) {
      const ajustes = (await kv(uid, 'ajustes')) || {};
      if (!ajustes.notificaciones) continue;
      if (await kv(uid, `checkin:${hoy}`)) continue;

      const racha = await rachaSinRegistro(uid, sumarDias(hoy, -1));
      const explicito = racha >= 2;
      await enviar(
        uid,
        explicito ? `${racha} días sin cierre de jornada` : '¿Qué te comió más horas hoy?',
        explicito
          ? `No es el recordatorio de siempre: van ${racha} días seguidos sin registrar nada. Una frase y listo.`
          : 'Una frase. Treinta segundos.',
        'agenda-noche',
      );
    }
  },
);

/** Lunes de la semana de una fecha, en formato ISO. */
function lunesDe(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * El ritual semanal. Sin esto el planificador existe pero nadie lo abre: los
 * demás recordatorios son todos diarios, y una semana no se planifica sola.
 */
exports.recordatorioCierreSemana = onSchedule(
  { schedule: '0 17 * * 5', timeZone: ZONA, region: REGION },
  async () => {
    const lunes = lunesDe(hoyISO());
    for (const uid of await usuarios()) {
      const ajustes = (await kv(uid, 'ajustes')) || {};
      if (!ajustes.notificaciones) continue;
      const plan = await kv(uid, `plan:${lunes}`);
      if (!plan || plan.cerrado) continue;
      const cumplidos = (plan.objetivos || []).filter(o => o.hecho).length;
      const total = (plan.objetivos || []).length;
      await enviar(
        uid,
        'Cerrá la semana',
        `Vas ${cumplidos} de ${total} objetivos. Cinco minutos: marcás lo que se cumplió y elegís los tres de la semana que viene.`,
        'agenda-cierre-semana',
      );
    }
  },
);

exports.recordatorioPlanSemana = onSchedule(
  { schedule: '0 19 * * 0', timeZone: ZONA, region: REGION },
  async () => {
    const lunes = sumarDias(lunesDe(hoyISO()), 7);
    for (const uid of await usuarios()) {
      const ajustes = (await kv(uid, 'ajustes')) || {};
      if (!ajustes.notificaciones) continue;
      if (await kv(uid, `plan:${lunes}`)) continue;   // ya la armaste
      await enviar(
        uid,
        'Mañana arranca la semana sin plan',
        'Tres objetivos y listo. Si el lunes empieza sin ellos, lo urgente elige por vos.',
        'agenda-plan-semana',
      );
    }
  },
);

// Las cuatro revisiones de la prueba de Luciana: 14/08, 21/08, 28/08 y 04/09.
const REVISIONES = ['2026-08-14', '2026-08-21', '2026-08-28', '2026-09-04'];

exports.recordatorioRevision = onSchedule(
  { schedule: '0 9 * * 5', timeZone: ZONA, region: REGION },
  async () => {
    const hoy = hoyISO();
    if (!REVISIONES.includes(hoy)) return;
    for (const uid of await usuarios()) {
      const prueba = (await kv(uid, 'prueba:luciana_2026_08')) || {};
      if (prueba[hoy]) continue;
      const vencidas = REVISIONES.filter(f => f < hoy && !prueba[f]).length;
      await enviar(
        uid,
        'Hoy: revisión de 15 minutos con Luciana',
        vencidas
          ? `Fichas completas, prospectos +72 hs, Higiene, problemas resueltos, mejoras y permisos. Van ${vencidas} revisiones sin registrar: si no se hacen, la prueba se cancela.`
          : 'Fichas completas, prospectos +72 hs, Higiene, problemas resueltos, mejoras y permisos.',
        'agenda-revision',
      );
    }
  },
);
