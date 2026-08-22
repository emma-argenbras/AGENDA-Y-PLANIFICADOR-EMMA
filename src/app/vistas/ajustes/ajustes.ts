/**
 * ajustes.ts — La mitad de Configuración que habla del aparato y las cuentas:
 * la nube, Google, los avisos, el aspecto y el backup.
 *
 * No es una pantalla: se dibuja dentro de Configuración. Tener dos lugares
 * separados obligaba a acordarse de en cuál estaba cada cosa, que es
 * exactamente el trabajo que la app tendría que ahorrar.
 */

import { Component, computed, inject, linkedSignal, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { Datos } from '../../data/datos';
import { Drive } from '../../data/drive';
import { Calendario, type Diagnostico } from '../../data/calendario';
import { Firebase } from '../../data/firebase';
import { AvisosPush } from '../../data/avisos-push';
import { Actualizador } from '../../data/actualizador';
import { Avisos } from '../../ui/avisos';
import { Dialogo } from '../../ui/dialogo';
import { Tema, type Preferencia } from '../../ui/tema';
import { hoyISO, inicioSemana, sumarDias } from '../../core/fechas';

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
  protected readonly calendario = inject(Calendario);
  protected readonly push = inject(AvisosPush);
  protected readonly tema = inject(Tema);
  protected readonly actualizador = inject(Actualizador);
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
      const { subidas, yaEstaban } = await this.datos.subirLocalALaNube();
      this.avisos.mostrar(subidas
        ? `${subidas} cosa(s) que estaban solo en este aparato subieron a la nube.`
        : yaEstaban
          ? 'No había nada suelto: la nube ya tenía todo lo de este aparato.'
          : 'Este aparato no tenía nada guardado aparte.');
    } catch (e) { this.error.set(mensaje(e)); }
  }

  /* ── Drive ─────────────────────────────────────────────────────────────── */

  // Arrancan con lo guardado y siguen siendo editables: eso es linkedSignal.
  protected readonly clientId = linkedSignal(() => this.ajustes()?.driveClientId ?? '');
  protected readonly folderId = linkedSignal(() => this.ajustes()?.driveFolderId ?? '');

  /* ── Probar la conexión con Google ─────────────────────────────────────── */

  protected readonly diagnostico = signal<Diagnostico | null>(null);
  protected readonly probando = signal(false);

  /** Una consulta real a Google, para dejar de adivinar de a un paso por vez. */
  protected async probarGoogle(): Promise<void> {
    this.probando.set(true);
    this.diagnostico.set(null);
    try {
      const lunes = inicioSemana(hoyISO());
      this.diagnostico.set(await this.calendario.probar(lunes, sumarDias(lunes, 6)));
    } finally {
      this.probando.set(false);
    }
  }

  /* ── Lo que Google tiene que tener autorizado ──────────────────────────── */

  /**
   * Las dos direcciones van a listas distintas de la consola y no son
   * intercambiables; el error más común es pegar una en el lugar de la otra.
   * Se muestran calculadas, no escritas a mano: son exactamente lo que la app
   * manda, con la barra final y las mayúsculas que correspondan.
   */
  protected readonly uriDeRetorno = this.drive.uriDeRetorno();
  protected readonly origenAutorizado = this.drive.origenAutorizado();
  protected readonly verPermisos = signal(false);

  protected async copiar(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.avisos.mostrar('Copiado. Pegalo en la consola de Google.');
    } catch {
      // Sin portapapeles (pasa en algunos navegadores embebidos): el texto
      // está en un campo, así que se puede seleccionar y copiar a mano.
      this.avisos.mostrar('No pude copiarlo solo: mantené apretado el texto y copialo.');
    }
  }

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
      const lunes = inicioSemana(hoyISO());
      void this.calendario.importar(lunes, sumarDias(lunes, 6)).catch(() => { /* ya se verá en Agenda */ });
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

  /* ── Push con la app cerrada ───────────────────────────────────────────── */

  protected readonly vapid = linkedSignal(() => this.ajustes()?.vapidKey ?? '');
  protected readonly errorPush = signal('');

  protected async activarPush(): Promise<void> {
    // El error va al lado del botón, no al pie de la pantalla: puesto lejos,
    // tocar «Registrar» parecía no hacer nada.
    this.errorPush.set('');
    try {
      if (this.vapid().trim() !== (this.ajustes()?.vapidKey ?? '')) {
        await this.datos.guardarAjustes({ vapidKey: this.vapid().trim() });
      }
      await this.push.activarPush();
      this.avisos.mostrar('Este dispositivo quedó registrado para push.');
    } catch (e) { this.errorPush.set(mensaje(e)); }
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

  protected readonly confirmandoReinstalar = signal(false);

  protected fechaPublicada(): string {
    const d = this.actualizador.publicada();
    return d ? d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  }
}

function mensaje(e: unknown): string { return e instanceof Error ? e.message : String(e); }
