/**
 * actas.ts — Regla 2: el acta se escribe el mismo día.
 * Qué se decidió / quién lo hace / para cuándo. Sin eso, la reunión no cuenta.
 */

import { Component, computed, inject, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { Datos } from '../../data/datos';
import { Avisos } from '../../ui/avisos';
import { Dialogo } from '../../ui/dialogo';
import { validarResponsableUnico } from '../../core/clasificador';
import { PERSONAS } from '../../core/reglas';
import { diasEntre, fechaCorta, fechaLarga, hoyISO } from '../../core/fechas';
import type { Decision, Reunion } from '../../core/modelo';

@Component({
  selector: 'app-actas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialogo],
  templateUrl: './actas.html',
  styleUrl: './actas.css',
})
export class Actas {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);

  protected readonly hoy = hoyISO();
  protected readonly fechaCorta = fechaCorta;
  protected readonly fechaLarga = fechaLarga;
  protected readonly personas = Object.values(PERSONAS).map(p => p.nombre);

  private readonly datosReuniones = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: () => this.datos.reuniones(),
  });

  protected readonly reuniones = computed(() => this.datosReuniones.value() ?? []);
  protected readonly sinActa = computed(() => this.reuniones().filter(r => !r.acta?.length));
  protected readonly conActa = computed(() => this.reuniones().filter(r => r.acta?.length));

  protected readonly compromisos = computed(() =>
    this.reuniones()
      .flatMap(r => (r.acta ?? []).map((a, idx) => ({ ...a, reunion: r, idx })))
      .filter(c => !c.hecho)
      .sort((a, b) => String(a.cuando).localeCompare(String(b.cuando))));

  protected diasDesde(fecha: string): number { return Math.max(0, diasEntre(fecha, this.hoy)); }
  protected vencido(cuando: string): boolean { return Boolean(cuando) && cuando < this.hoy; }

  /* ── Nueva reunión ─────────────────────────────────────────────────────── */

  protected readonly creando = signal(false);
  protected readonly nuevoTitulo = signal('');
  protected readonly nuevaFecha = signal(this.hoy);

  protected async crear(): Promise<void> {
    const titulo = this.nuevoTitulo().trim();
    if (!titulo) return;
    const r: Reunion = {
      id: crypto.randomUUID(), titulo, fecha: this.nuevaFecha() || this.hoy,
      acta: [], creado: Date.now(),
    };
    await this.datos.guardarReuniones([r, ...this.reuniones()]);
    this.creando.set(false);
    this.nuevoTitulo.set('');
    this.nuevaFecha.set(this.hoy);
  }

  /* ── Acta ──────────────────────────────────────────────────────────────── */

  protected readonly editando = signal<Reunion | null>(null);
  protected readonly decisiones = signal<Decision[]>([]);
  protected readonly errorActa = signal('');

  protected abrirActa(r: Reunion): void {
    this.errorActa.set('');
    this.decisiones.set(r.acta?.length
      ? r.acta.map(d => ({ ...d }))
      : [{ que: '', quien: '', cuando: '', hecho: false }]);
    this.editando.set(r);
  }

  protected campo(i: number, campo: keyof Decision, valor: string): void {
    this.decisiones.set(this.decisiones().map((d, j) => (j === i ? { ...d, [campo]: valor } : d)));
  }

  protected agregarDecision(): void {
    this.decisiones.set([...this.decisiones(), { que: '', quien: '', cuando: '', hecho: false }]);
  }

  protected quitarDecision(i: number): void {
    this.decisiones.set(this.decisiones().filter((_, j) => j !== i));
  }

  protected async cerrarActa(): Promise<void> {
    const reunion = this.editando();
    if (!reunion) return;
    const validas = this.decisiones().filter(d => d.que.trim() && d.quien.trim() && d.cuando);
    if (!validas.length) {
      this.errorActa.set('Faltan los 3 campos: qué se decidió, quién lo hace y para cuándo.');
      return;
    }
    for (const d of validas) {
      const v = validarResponsableUnico(d.quien);
      if (!v.ok) {
        this.errorActa.set(`«${d.quien}»: ${v.motivo}`);
        return;
      }
    }
    const actualizadas = this.reuniones().map(r => r.id === reunion.id
      ? {
          ...r,
          acta: validas.map(d => ({ ...d, que: d.que.trim(), quien: d.quien.trim() })),
          cerrada: this.hoy,
          tarde: this.hoy !== r.fecha,
        }
      : r);
    await this.datos.guardarReuniones(actualizadas);
    const tarde = this.hoy !== reunion.fecha;
    this.editando.set(null);
    this.avisos.mostrar(tarde ? 'Acta guardada (fuera del mismo día).' : 'Acta guardada.');
  }

  protected async marcarHecho(reunionId: string, idx: number): Promise<void> {
    await this.datos.guardarReuniones(this.reuniones().map(r => r.id === reunionId
      ? { ...r, acta: r.acta.map((a, j) => (j === idx ? { ...a, hecho: true } : a)) }
      : r));
  }
}
