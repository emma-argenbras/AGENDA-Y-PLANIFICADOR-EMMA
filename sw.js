/**
 * sw.js — Service worker: la app entera funciona offline.
 *
 * Además dispara los recordatorios cuando el sistema le da lugar
 * (Periodic Background Sync, disponible en Android con la PWA instalada).
 */

const VERSION = 'v1';
const CACHE = `agenda-emma-${VERSION}`;

const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/ui.js', './js/store.js', './js/rules.js', './js/classify.js',
  './js/prueba-luciana.js', './js/drive.js', './js/notify.js',
  './js/views/hoy.js', './js/views/semana.js', './js/views/prueba.js', './js/views/actas.js',
  './js/views/docs.js', './js/views/delegar.js', './js/views/reglas.js',
  './js/views/indicadores.js', './js/views/ajustes.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(u => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Drive y Google: siempre red

  // Navegación: cache primero para abrir instantáneo, con red de respaldo.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cacheado = await caches.match('./index.html');
      if (cacheado) { actualizar(req); return cacheado; }
      try { return await fetch(req); }
      catch { return new Response('Sin conexión y sin copia local.', { status: 503, headers: { 'Content-Type': 'text/plain' } }); }
    })());
    return;
  }

  e.respondWith((async () => {
    const cacheado = await caches.match(req);
    if (cacheado) { actualizar(req); return cacheado; }
    try {
      const r = await fetch(req);
      if (r.ok) (await caches.open(CACHE)).put(req, r.clone());
      return r;
    } catch {
      return cacheado || Response.error();
    }
  })());
});

/** Refresco en segundo plano: la próxima carga ya trae lo nuevo. */
function actualizar(req) {
  fetch(req).then(async r => {
    if (r && r.ok) (await caches.open(CACHE)).put(req, r.clone());
  }).catch(() => {});
}

/* ── Recordatorios ───────────────────────────────────────────────────────── */

self.addEventListener('periodicsync', e => {
  if (e.tag === 'recordatorios') e.waitUntil(revisarRecordatorios());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clientes) {
      if ('focus' in c) { c.navigate?.('./#/hoy'); return c.focus(); }
    }
    return self.clients.openWindow('./#/hoy');
  })());
});

/** Lector mínimo del mismo IndexedDB que usa la app. */
function kv(clave) {
  return new Promise(resolve => {
    const req = indexedDB.open('emma-planner', 1);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) return resolve(null);
      const g = db.transaction('kv', 'readonly').objectStore('kv').get(clave);
      g.onsuccess = () => resolve(g.result ?? null);
      g.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function kvSet(clave, valor) {
  return new Promise(resolve => {
    const req = indexedDB.open('emma-planner', 1);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) return resolve();
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(valor, clave);
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

async function revisarRecordatorios() {
  const ajustes = (await kv('ajustes')) || {};
  if (!ajustes.notificaciones) return;

  const ahora = new Date();
  const hoy = iso(ahora);
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  const ultimo = (await kv('notify:ultimo')) || {};

  const aMinutos = t => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const manana = aMinutos(ajustes.horaManana || '08:00');
  const noche = aMinutos(ajustes.horaNoche || '20:30');

  if (minutos >= manana && minutos < manana + 180 && ultimo.manana !== hoy) {
    const prio = (await kv(`prio:${hoy}`)) || [];
    await self.registration.showNotification(
      prio.length ? `Hoy: ${prio.length} prioridad(es)` : 'Sin prioridades cargadas',
      {
        body: prio.length ? prio.map((p, i) => `${i + 1}. ${p.texto}`).join('\n')
                          : 'Elegí 3 antes de que el día las elija por vos.',
        tag: 'agenda-manana', icon: './icons/icon-192.png', badge: './icons/icon-192.png'
      });
    await kvSet('notify:ultimo', { ...ultimo, manana: hoy });
  }

  if (minutos >= noche && ultimo.noche !== hoy) {
    if (await kv(`checkin:${hoy}`)) return;
    const racha = await rachaSinRegistro(hoy, ajustes.primerUso);
    const explicito = racha >= 2;
    await self.registration.showNotification(
      explicito ? `${racha} días sin cierre de jornada` : '¿Qué te comió más horas hoy?',
      {
        body: explicito
          ? `No es el recordatorio de siempre: van ${racha} días seguidos sin registrar nada. Una frase y listo.`
          : 'Una frase. Treinta segundos.',
        tag: 'agenda-noche', icon: './icons/icon-192.png', badge: './icons/icon-192.png'
      });
    await kvSet('notify:ultimo', { ...ultimo, noche: hoy });
  }
}

/** Días hábiles seguidos sin check-in, contando desde ayer hacia atrás. */
async function rachaSinRegistro(hoyISO, primerUso) {
  let racha = 0;
  const d = new Date(hoyISO + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  for (let i = 0; i < 20; i++) {
    if (primerUso && iso(d) < primerUso) break;
    const dia = d.getDay();
    if (dia !== 0 && dia !== 6) {
      if (await kv(`checkin:${iso(d)}`)) break;
      racha++;
    }
    d.setDate(d.getDate() - 1);
  }
  return racha;
}
