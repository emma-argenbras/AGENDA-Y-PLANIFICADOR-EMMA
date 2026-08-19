/**
 * ajustes.ts — Lo único configurable: nube, Drive, avisos, tema y backup.
 * Las reglas de negocio no están acá a propósito.
 */

import { Component, computed, inject, linkedSignal, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { Datos } from '../../data/datos';
import { Drive } from '../../data/drive';
import { Firebase } from '../../data/firebase';
import { AvisosPush } from '../../data/avisos-push';
import { Avisos } from '../../ui/avisos';
import { Dialogo } from '../../ui/dialogo';
import { Tema, type Preferencia } from '../../ui/tema';
import { hoyISO } from '../../core/fechas';

@Component({
  selector: 'app-ajustes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialogo],
  templateUrl: './ajustes.html',
  styleUrl: './ajustes.css',
})
export class Ajustes {
  protected readonly datos = inject(Datos);
  protected readonly firebase = inject(Firebase);
  protected readonly drive = inject(Drive);
  protected readonly push = inject(AvisosPush);
  protected readonly tema = inject(Tema);
  private readonly avisos = inject(Avisos);

  protected readonly temas: { id: Preferencia; texto: string }[] = [
    { id: 'auto', texto: 'Automático' },
    { id: 'claro', texto: 'Claro' },
    { id: 'oscuro', texto: 'Oscuro' },
  ];

  private readonly estado = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: async () => ({ ajustes: await this.datos.ajustes(), driveOk: await this.drive.conectado() }),
  });

  protected readonly ajustes = computed(() => this.estado.value()?.ajustes ?? null);
  protected readonly driveOk = computed(() => this.estado.value()?.driveOk ?? false);
  protected readonly error = signal('');
  protected readonly ayudaFirebase = signal(false);
  protected readonly ayudaDrive = signal(false);
  protected readonly configTexto = signal('');
  protected readonly correo = computed(() => this.firebase.usuario()?.email ?? '');

  /* ── Nube ──────────────────────────────────────────────────────────────── */

  protected guardarConfig(): void {
    this.error.set('');
    try { this.firebase.guardarConfig(this.configTexto()); }
    catch (e) { this.error.set(mensaje(e)); }
  }

  protected async entrar(): Promise<void> {
    this.error.set('');
    try { await this.firebase.entrar(); this.avisos.mostrar('Conectado.'); }
    catch (e) { this.error.set(mensaje(e)); }
  }

  protected async salir(): Promise<void> {
    await this.firebase.salir();
    this.avisos.mostrar('Sesión cerrada. Seguís usando la app en modo local.');
  }

  protected async subir(): Promise<void> {
    this.error.set('');
    try {
      const n = await this.datos.subirLocalALaNube();
      this.avisos.mostrar(`${n} registros subidos a la nube.`);
    } catch (e) { this.error.set(mensaje(e)); }
  }

  /* ── Drive ─────────────────────────────────────────────────────────────── */

  // Arrancan con lo guardado y siguen siendo editables: eso es linkedSignal.
  protected readonly clientId = linkedSignal(() => this.ajustes()?.driveClientId ?? '');
  protected readonly folderId = linkedSignal(() => this.ajustes()?.driveFolderId ?? '');

  protected async guardarDrive(): Promise<void> {
    await this.datos.guardarAjustes({
      driveClientId: this.clientId().trim(),
      driveFolderId: this.folderId().trim(),
    });
    this.avisos.mostrar('Guardado.');
  }

  protected async conectarDrive(): Promise<void> {
    this.error.set('');
    try {
      await this.guardarDrive();
      await this.drive.conectar();
      this.avisos.mostrar('Drive conectado.');
      this.datos.cambios.update(v => v + 1);
    } catch (e) { this.error.set(mensaje(e)); }
  }

  protected async desconectarDrive(): Promise<void> {
    await this.drive.desconectar();
    this.datos.cambios.update(v => v + 1);
    this.avisos.mostrar('Drive desconectado.');
  }

  /* ── Avisos ────────────────────────────────────────────────────────────── */

  protected readonly manana = linkedSignal(() => this.ajustes()?.horaManana ?? '08:00');
  protected readonly noche = linkedSignal(() => this.ajustes()?.horaNoche ?? '20:30');

  protected async activarAvisos(): Promise<void> {
    this.error.set('');
    try {
      if (this.push.permiso !== 'granted') await this.push.pedirPermiso();
      await this.datos.guardarAjustes({
        horaManana: this.manana(),
        horaNoche: this.noche(),
        notificaciones: true,
      });
      await this.push.programarDelDia();
      this.avisos.mostrar('Avisos activados.');
    } catch (e) { this.error.set(mensaje(e)); }
  }

  protected async apagarAvisos(): Promise<void> {
    await this.datos.guardarAjustes({ notificaciones: false });
    this.avisos.mostrar('Avisos apagados.');
  }

  protected async probarAviso(): Promise<void> {
    const m = (await this.push.mensajeNoche())
      ?? { titulo: 'Ya cerraste el día', cuerpo: 'Este sería el aviso de la noche.' };
    if (!(await this.push.mostrar(m.titulo, m.cuerpo, 'prueba'))) {
      this.avisos.mostrar('Primero activá los avisos.');
    }
  }

  protected async activarPush(): Promise<void> {
    this.error.set('');
    try {
      await this.push.activarPush();
      this.avisos.mostrar('Este dispositivo quedó registrado para push.');
    } catch (e) { this.error.set(mensaje(e)); }
  }

  /* ── Tema ──────────────────────────────────────────────────────────────── */

  protected async elegirTema(t: Preferencia): Promise<void> {
    this.tema.preferencia.set(t);
    await this.datos.guardarAjustes({ tema: t });
  }

  /* ── Datos ─────────────────────────────────────────────────────────────── */

  protected async exportar(): Promise<void> {
    const json = await this.datos.exportar();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agenda-emma-${hoyISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  protected importar(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    void f.text()
      .then(t => this.datos.importar(JSON.parse(t)))
      .then(n => this.avisos.mostrar(`${n} registros importados.`))
      .catch(err => this.error.set(mensaje(err)));
  }

  protected readonly confirmandoBorrado = signal(false);

  protected async borrarTodo(): Promise<void> {
    await this.datos.borrarTodo();
    this.confirmandoBorrado.set(false);
    this.avisos.mostrar('Listo, todo limpio.');
  }

  protected async buscarActualizacion(): Promise<void> {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    for (const r of regs) await r.update();
    this.avisos.mostrar('Buscando versión nueva…');
    setTimeout(() => location.reload(), 1200);
  }
}

function mensaje(e: unknown): string { return e instanceof Error ? e.message : String(e); }
