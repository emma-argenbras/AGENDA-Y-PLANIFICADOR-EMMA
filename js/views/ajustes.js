/**
 * ajustes.js — Lo único configurable: conexión con Drive, horarios de aviso y
 * backup. Las reglas de negocio no están acá a propósito.
 */

import { h, toast, modal } from '../ui.js';
import * as S from '../store.js';
import * as D from '../drive.js';
import * as N from '../notify.js';

export async function render(ctx) {
  const a = await S.getAjustes();
  const conectado = await D.conectado();
  ctx.subtitulo('Drive, avisos y backup');
  const cont = h('div');

  // ── Drive ──────────────────────────────────────────────────────────────
  cont.appendChild(h('div.seccion-titulo', 'Google Drive (solo lectura)'));
  const clientId = h('input', { type: 'text', placeholder: '123456-abc.apps.googleusercontent.com', value: a.driveClientId || '' });
  const folderId = h('input', { type: 'text', value: a.driveFolderId || '' });

  cont.appendChild(h('div.card',
    h('label.campo', h('span', 'Client ID de Google'), clientId),
    h('label.campo', h('span', 'ID de la carpeta'), folderId),
    h('div.btn-fila',
      h('button.btn.primario', {
        onclick: async () => {
          await S.setAjustes({ driveClientId: clientId.value.trim(), driveFolderId: folderId.value.trim() });
          toast('Guardado.');
        }
      }, 'Guardar'),
      conectado
        ? h('button.btn', { onclick: async () => { await D.desconectar(); toast('Desconectado.'); ctx.refrescar(); } }, 'Desconectar')
        : h('button.btn', {
            onclick: async () => {
              try {
                await S.setAjustes({ driveClientId: clientId.value.trim(), driveFolderId: folderId.value.trim() });
                await D.conectar();
                toast('Conectado a Drive.');
                ctx.refrescar();
              } catch (e) {
                await modal({ titulo: 'No se pudo conectar', cuerpo: String(e.message || e), acciones: [{ texto: 'Cerrar', valor: null }] });
              }
            }
          }, 'Conectar con Google')),
    h('p.mini', { style: { marginTop: '10px' } },
      conectado ? 'Conectado. El permiso dura una hora y se renueva solo cuando usás la app.'
                : 'Sin conectar. La app funciona igual: Drive solo agrega la búsqueda en tus documentos.'),
    h('button.btn.chico.fantasma', { style: { marginTop: '8px' }, onclick: comoSacarClientId }, 'Cómo saco el Client ID')));

  // ── Notificaciones ─────────────────────────────────────────────────────
  cont.appendChild(h('div.seccion-titulo', 'Avisos'));
  const manana = h('input', { type: 'time', value: a.horaManana });
  const noche = h('input', { type: 'time', value: a.horaNoche });
  const permiso = N.soportado() ? Notification.permission : 'no soportado';

  cont.appendChild(h('div.card',
    h('label.campo', h('span', 'A la mañana: las 3 prioridades'), manana),
    h('label.campo', h('span', 'A la noche: el cierre de una frase'), noche),
    h('div.btn-fila',
      h('button.btn.primario', {
        onclick: async () => {
          try {
            if (permiso !== 'granted') await N.pedirPermiso();
            await S.setAjustes({ horaManana: manana.value, horaNoche: noche.value, notificaciones: true });
            await N.programarDelDia();
            toast('Avisos activados.');
            ctx.refrescar();
          } catch (e) { toast(String(e.message || e), 'error'); }
        }
      }, a.notificaciones && permiso === 'granted' ? 'Guardar horarios' : 'Activar avisos'),
      a.notificaciones
        ? h('button.btn', { onclick: async () => { await S.setAjustes({ notificaciones: false }); toast('Avisos apagados.'); ctx.refrescar(); } }, 'Apagar')
        : null,
      h('button.btn.chico', {
        onclick: async () => {
          const m = await N.textoNoche() || { titulo: 'Ya cerraste el día', cuerpo: 'Este sería el aviso de la noche.' };
          const ok = await N.mostrar({ ...m, tag: 'prueba' });
          if (!ok) toast('Primero activá los avisos.', 'error');
        }
      }, 'Probar')),
    h('p.mini', { style: { marginTop: '8px' } },
      'Permiso del navegador: ' + permiso + '. Sin servidor de push, los avisos se disparan con la app instalada; ' +
      'el aviso que nunca falla es el que ves al abrirla.')));

  // ── Datos ──────────────────────────────────────────────────────────────
  cont.appendChild(h('div.seccion-titulo', 'Tus datos'));
  cont.appendChild(h('div.card',
    h('p.chico', 'Todo vive en este dispositivo. No hay servidor ni cuenta: si cambiás de teléfono, exportá y volvé a importar.'),
    h('div.btn-fila',
      h('button.btn', {
        onclick: async () => {
          const json = await S.exportarTodo();
          const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a2 = h('a', { href: url, download: `agenda-emma-${S.hoyISO()}.json` });
          document.body.appendChild(a2); a2.click(); a2.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
      }, 'Exportar backup'),
      h('button.btn', {
        onclick: () => {
          const inp = h('input', { type: 'file', accept: 'application/json' });
          inp.onchange = async () => {
            try {
              const txt = await inp.files[0].text();
              await S.importarTodo(JSON.parse(txt));
              toast('Backup importado.');
              ctx.refrescar();
            } catch (e) { toast(String(e.message || e), 'error'); }
          };
          inp.click();
        }
      }, 'Importar backup'),
      h('button.btn.peligro', {
        onclick: async () => {
          const ok = await modal({
            titulo: '¿Borrar todo?',
            cuerpo: 'Se borran check-ins, prioridades, actas y la prueba de Luciana. Las reglas de la Ficha de Rol quedan (están en el código).',
            acciones: [{ texto: 'Borrar todo', tipo: 'peligro', valor: true }, { texto: 'No', valor: false }]
          });
          if (!ok) return;
          for (const k of await S.claves()) await S.del(k);
          toast('Listo, todo limpio.');
          ctx.refrescar();
        }
      }, 'Borrar todo'))));

  cont.appendChild(h('div.seccion-titulo', 'Sobre la app'));
  cont.appendChild(h('div.card',
    h('p.mini', 'Agenda EVB — uso personal, un solo usuario. ' +
      'La Ficha de Rol, la tabla de delegación, las 8 categorías y los 4 umbrales están escritos en el código ' +
      '(js/rules.js) y versionados en el repositorio. No se editan desde acá por diseño.'),
    h('button.btn.chico.fantasma', {
      onclick: async () => {
        const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
        for (const r of regs) await r.update();
        toast('Buscando versión nueva…');
        setTimeout(() => location.reload(), 1200);
      }
    }, 'Buscar actualización')));
  return cont;
}

async function comoSacarClientId() {
  await modal({
    titulo: 'Client ID de Google (una sola vez)',
    cuerpo: h('div',
      h('ol.numerada',
        h('li', 'Entrá a console.cloud.google.com con emmanuelclubdelmate@gmail.com y creá un proyecto.'),
        h('li', 'APIs y servicios → Biblioteca → activá "Google Drive API".'),
        h('li', 'Pantalla de consentimiento OAuth: tipo Externo, y agregate a vos mismo como usuario de prueba.'),
        h('li', 'Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web.'),
        h('li', 'En "Orígenes de JavaScript autorizados" poné la dirección donde abrís la app ' +
                '(la de GitHub Pages, y http://localhost:8080 si probás local).'),
        h('li', 'Copiá el Client ID que termina en .apps.googleusercontent.com y pegalo acá.')),
      h('p.mini', 'No hace falta client secret: la app pide solo permiso de lectura y el token vive en tu teléfono.')),
    acciones: [{ texto: 'Entendido', valor: null }]
  });
}
