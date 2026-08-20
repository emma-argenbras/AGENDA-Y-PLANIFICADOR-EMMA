/**
 * reglas.ts — La Ficha de Rol, para leerla de un tirón.
 *
 * Acá no se edita nada: es la vista de lectura. Lo que muestra es lo que la
 * app está usando hoy para decidir —el valor de fábrica con tus cambios
 * encima—, no el archivo del código. Para cambiar algo está Configuración,
 * que es un lugar distinto a propósito: mirar las reglas y cambiarlas son dos
 * momentos diferentes, y mezclarlos hace que uno termine tocando el umbral en
 * vez de aceptar lo que dice.
 */

import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Configuracion } from '../../data/configuracion';

@Component({
  selector: 'app-reglas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './reglas.html',
})
export class Reglas {
  private readonly cfg = inject(Configuracion);

  protected readonly perfil = computed(() => this.cfg.reglas().perfil);
  protected readonly decisiones = computed(() => this.cfg.reglas().decisiones);
  protected readonly categorias = computed(() => this.cfg.reglas().categorias);
  protected readonly umbrales = computed(() => this.cfg.reglas().umbrales);
  protected readonly reglas = computed(() => this.cfg.reglas().reglas);
  protected readonly indicadores = computed(() => this.cfg.reglas().indicadores);
  protected readonly vacantes = computed(() => this.cfg.reglas().vacantes);
  protected readonly equipo = computed(() => this.cfg.reglas().personasLista.filter(p => p.rol));

  protected readonly tabla = computed(() => {
    const { delegacion, personas } = this.cfg.reglas();
    return delegacion.map(d => ({
      tarea: d.tarea,
      dueno: (personas[d.dueno]?.nombre ?? d.dueno).split(' ')[0],
      excepcion: d.excepcion ?? '',
      forzada: d.forzada,
    }));
  });

  /** Qué secciones dejaron de ser las del código porque las cambiaste vos. */
  protected readonly editadas = computed(() => Object.keys(this.cfg.editadas()).length);
}
