/**
 * docs.ts — La carpeta de Drive, indexada y consultable.
 * Responde con el párrafo real del documento y de qué archivo salió: no
 * parafrasea ni inventa.
 */

import { Component, computed, inject, resource, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Datos } from '../../data/datos';
import { Drive, type Pasaje } from '../../data/drive';
import { Avisos } from '../../ui/avisos';
import { Dialogo } from '../../ui/dialogo';
import type { DocIndexado } from '../../core/modelo';

@Component({
  selector: 'app-docs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Dialogo],
  templateUrl: './docs.html',
  styleUrl: './docs.css',
})
export class Docs {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);
  protected readonly drive = inject(Drive);

  protected readonly pregunta = signal('');
  protected readonly resultados = signal<Pasaje[] | null>(null);
  protected readonly buscando = signal(false);
  protected readonly sincronizando = signal(false);
  protected readonly error = signal('');
  protected readonly viendo = signal<{ nombre: string; texto: string } | null>(null);

  private readonly estado = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: async () => ({
      indice: await this.datos.docsIndice(),
      ajustes: await this.datos.ajustes(),
      conectado: await this.drive.conectado(),
    }),
  });

  protected readonly indice = computed(() => this.estado.value()?.indice ?? []);
  protected readonly leibles = computed(() => this.indice().filter(d => d.leible).length);
  protected readonly conectado = computed(() => this.estado.value()?.conectado ?? false);
  protected readonly hayClientId = computed(() => Boolean(this.estado.value()?.ajustes.driveClientId));
  protected readonly ultimaSync = computed(() => {
    const t = this.estado.value()?.ajustes.ultimaSync;
    return t ? new Date(t).toLocaleString('es-AR') : null;
  });

  protected async buscar(): Promise<void> {
    const q = this.pregunta().trim();
    if (!q) { this.resultados.set(null); return; }
    this.buscando.set(true);
    try { this.resultados.set(await this.drive.buscar(q)); }
    finally { this.buscando.set(false); }
  }

  protected partes(p: Pasaje) { return this.drive.partir(p.texto, this.pregunta()); }

  protected async sincronizar(): Promise<void> {
    this.sincronizando.set(true);
    this.error.set('');
    try {
      await this.drive.sincronizar();
      this.avisos.mostrar('Documentos actualizados.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.sincronizando.set(false);
    }
  }

  protected async ver(d: DocIndexado): Promise<void> {
    const texto = (await this.datos.doc(d.id)) ?? '';
    this.viendo.set({ nombre: d.name, texto: texto.slice(0, 20000) + (texto.length > 20000 ? '\n\n[…]' : '') });
  }

  protected miles(chars: number | undefined): string {
    return ((chars ?? 0) / 1000).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }

  protected tipoCorto(m: string): string {
    if (m.includes('pdf')) return 'PDF';
    if (m.startsWith('image/')) return 'imagen';
    if (m.includes('spreadsheet')) return 'planilla';
    return m.split('/').pop()?.slice(0, 24) ?? 'archivo';
  }
}
