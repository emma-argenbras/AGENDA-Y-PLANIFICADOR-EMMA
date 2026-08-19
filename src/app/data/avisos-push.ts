/**
 * avisos-push.ts — Recordatorios.
 *
 * Dos capas, de la más confiable a la menos:
 *  1. El banner al abrir la app: nunca falla, funciona hasta sin permisos.
 *  2. Notificación local mientras la app está abierta o instalada.
 *  3. Push de verdad con FCM: llega con la app cerrada, pero necesita que la
 *     función programada de Firebase esté desplegada (functions/).
 *
 * Regla del brief: si pasan dos días sin responder, el mensaje deja de ser
 * genérico y lo dice explícitamente.
 */

import { Injectable, inject, signal } from '@angular/core';
import { Datos } from './datos';
import { Firebase } from './firebase';
import { hoyISO, sumarDias } from '../core/fechas';

@Injectable({ providedIn: 'root' })
export class AvisosPush {
  private readonly datos = inject(Datos);
  private readonly firebase = inject(Firebase);
  readonly tokenPush = signal<string | null>(null);

  readonly soportado = typeof Notification !== 'undefined';

  get permiso(): NotificationPermission | 'no soportado' {
    return this.soportado ? Notification.permission : 'no soportado';
  }

  async pedirPermiso(): Promise<void> {
    if (!this.soportado) throw new Error('Este navegador no soporta notificaciones.');
    const p = await Notification.requestPermission();
    if (p !== 'granted') throw new Error('No diste permiso para notificaciones.');
  }

  async mensajeManana(fecha = hoyISO()): Promise<{ titulo: string; cuerpo: string }> {
    const prio = await this.datos.prioridades(fecha);
    if (!prio.length) {
      return { titulo: 'Sin prioridades cargadas', cuerpo: 'Elegí 3 antes de que el día las elija por vos.' };
    }
    return {
      titulo: `Hoy: ${prio.length} prioridad(es)`,
      cuerpo: prio.map((p, i) => `${i + 1}. ${p.texto}`).join('\n'),
    };
  }

  async mensajeNoche(fecha = hoyISO()): Promise<{ titulo: string; cuerpo: string } | null> {
    if (await this.datos.checkin(fecha)) return null;
    const racha = await this.datos.rachaSinRegistro(sumarDias(fecha, -1));
    if (racha >= 2) {
      return {
        titulo: `${racha} días sin cierre de jornada`,
        cuerpo: `No es el recordatorio de siempre: van ${racha} días seguidos sin registrar nada. Una frase y listo.`,
      };
    }
    return { titulo: '¿Qué te comió más horas hoy?', cuerpo: 'Una frase. Treinta segundos.' };
  }

  async mostrar(titulo: string, cuerpo: string, tag = 'agenda'): Promise<boolean> {
    if (!this.soportado || Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker?.ready.catch(() => null);
    const opciones: NotificationOptions = { body: cuerpo, tag, icon: 'icons/icon-192x192.png' };
    if (reg) await reg.showNotification(titulo, opciones);
    else new Notification(titulo, opciones);
    return true;
  }

  /** Avisos del día mientras la app esté abierta. Los timers no sobreviven al cierre. */
  #timers: ReturnType<typeof setTimeout>[] = [];

  async programarDelDia(): Promise<void> {
    this.#timers.forEach(clearTimeout);
    this.#timers = [];
    const a = await this.datos.ajustes();
    if (!a.notificaciones || this.permiso !== 'granted') return;

    const ahora = new Date();
    for (const [hora, cual] of [[a.horaManana, 'manana'], [a.horaNoche, 'noche']] as const) {
      const [hh, mm] = String(hora).split(':').map(Number);
      const t = new Date(ahora);
      t.setHours(hh ?? 8, mm ?? 0, 0, 0);
      const delta = t.getTime() - ahora.getTime();
      if (delta <= 0 || delta > 20 * 3600 * 1000) continue;
      this.#timers.push(setTimeout(async () => {
        const msg = cual === 'manana' ? await this.mensajeManana() : await this.mensajeNoche();
        if (msg) await this.mostrar(msg.titulo, msg.cuerpo, 'agenda-' + cual);
      }, delta));
    }
  }

  /**
   * Registra este dispositivo para push. El envío lo hace la función programada
   * de Firebase; sin ella desplegada, esto guarda el token y nada más.
   */
  async activarPush(): Promise<string> {
    const app = this.firebase.app();
    const cfg = this.firebase.config();
    if (!app || !cfg) throw new Error('Primero configurá Firebase en Ajustes.');
    if (!cfg.vapidKey) throw new Error('Falta la clave VAPID (Firebase → Cloud Messaging → Web Push certificates).');
    await this.pedirPermiso();

    const { getMessaging, getToken, onMessage, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) throw new Error('Este navegador no soporta push. En iPhone hay que instalar la app en la pantalla de inicio.');

    const messaging = getMessaging(app);
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: registration });
    if (!token) throw new Error('Google no devolvió un token de push.');

    await this.datos.escribir('fcm:token', { token, dispositivo: navigator.userAgent.slice(0, 120), fecha: Date.now() });
    this.tokenPush.set(token);
    onMessage(messaging, carga => {
      const n = carga.notification;
      if (n?.title) void this.mostrar(n.title, n.body ?? '', 'agenda-push');
    });
    return token;
  }
}
