/**
 * prueba.ts — Seguimiento de la prueba de Luciana: cuenta atrás al 05/09 y
 * checklist de señales en cada revisión de viernes.
 */

import { Component, computed, inject, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { Datos } from '../../data/datos';
import { Avisos } from '../../ui/avisos';
import { Dialogo } from '../../ui/dialogo';
import { estadoPrueba, type RegistroRevision, type Senal } from '../../core/prueba-luciana';
import { PRUEBAS, pruebaActiva, type PruebaDeRol } from '../../core/pruebas';
import { fechaCorta, fechaLarga, hoyISO } from '../../core/fechas';

@Component({
  selector: 'app-prueba',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialogo],
  templateUrl: './prueba.html',
  styleUrl: './prueba.css',
})
export class Prueba {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);

  /** La prueba en curso, o la última decidida si ya no queda ninguna abierta. */
  protected readonly P = computed<PruebaDeRol>(() => {
    const cierres = this.cierres.value() ?? {};
    return pruebaActiva(cierres) ?? PRUEBAS[PRUEBAS.length - 1]!;
  });

  private readonly cierres = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: () => this.datos.cierresDePruebas(PRUEBAS.map(p => p.id)),
  });

  protected readonly archivadas = computed(() =>
    PRUEBAS.filter(p => (this.cierres.value() ?? {})[p.id] && p.id !== this.P().id));
  protected readonly hoy = hoyISO();
  protected readonly fechaCorta = fechaCorta;
  protected readonly fechaLarga = fechaLarga;

  private readonly registros = resource({
    params: () => ({ v: this.datos.cambios(), id: this.P().id }),
    loader: ({ params }) => this.datos.prueba(params.id),
  });

  protected readonly estado = computed(() => estadoPrueba(this.hoy, this.registros.value() ?? {}, this.P()));
  protected readonly cierre = computed(() => (this.registros.value() ?? {}).__cierre ?? null);

  protected readonly ETIQUETAS: Record<string, string> = {
    hecha: '✓ Registrada',
    vencida: '⚠ Vencida sin registrar',
    hoy: '● Es hoy',
    pendiente: 'Pendiente',
  };

  /* ── Registrar una revisión ────────────────────────────────────────────── */

  protected readonly editando = signal<string | null>(null);
  protected readonly borrador = signal<RegistroRevision>({});

  protected abrir(fecha: string): void {
    const previo = (this.registros.value() ?? {})[fecha];
    this.borrador.set({ ...(previo ?? {}) });
    this.editando.set(fecha);
  }

  protected valor(id: string): unknown { return this.borrador()[id]; }

  protected fijar(id: string, v: unknown): void {
    this.borrador.set({ ...this.borrador(), [id]: v });
  }

  protected async guardar(): Promise<void> {
    const fecha = this.editando();
    if (!fecha) return;
    const regs = { ...(this.registros.value() ?? {}) };
    regs[fecha] = { ...this.borrador(), registrado: Date.now() };
    await this.datos.guardarPrueba(regs, this.P().id);
    this.editando.set(null);
    this.avisos.mostrar('Revisión registrada.');
  }

  /** Verde o rojo por señal, según lo que el acuerdo definió como bueno. */
  protected bien(s: Senal, datos: RegistroRevision | null): boolean | null {
    if (!datos) return null;
    const v = datos[s.id];
    if (v === undefined || v === '') return null;
    if (s.tipo === 'bool' || s.tipo === 'opcion') return v === s.bueno;
    const n = Number(v);
    return s.mejorEs === 'menor' ? n <= (s.objetivo ?? 0) : n >= (s.objetivo ?? 0);
  }

  protected textoValor(s: Senal, datos: RegistroRevision): string {
    const v = datos[s.id];
    if (s.tipo === 'bool') return v ? 'sí' : 'no';
    return String(v ?? '');
  }

  protected senalesConDato(datos: RegistroRevision) {
    return this.P().senales.filter(s => datos[s.id] !== undefined && datos[s.id] !== '');
  }

  /* ── Pendientes y cierre ───────────────────────────────────────────────── */

  protected respuesta(id: string): unknown { return (this.registros.value() ?? {})[`pendiente:${id}`]; }

  protected async responder(id: string, v: string): Promise<void> {
    const regs = { ...(this.registros.value() ?? {}) };
    (regs as Record<string, unknown>)[`pendiente:${id}`] = v;
    await this.datos.guardarPrueba(regs, this.P().id);
    this.avisos.mostrar(`Anotado: ${v}.`);
  }

  protected readonly eligiendo = signal<{ id: string; titulo: string; detalle: string } | null>(null);
  protected readonly nota = signal('');

  protected async confirmarSalida(): Promise<void> {
    const s = this.eligiendo();
    if (!s) return;
    const regs = { ...(this.registros.value() ?? {}) };
    regs.__cierre = { salida: s.id, titulo: s.titulo, nota: this.nota().trim(), fecha: this.hoy };
    await this.datos.guardarPrueba(regs, this.P().id);
    this.eligiendo.set(null);
    this.nota.set('');
    this.avisos.mostrar('Decisión registrada.');
  }
}
