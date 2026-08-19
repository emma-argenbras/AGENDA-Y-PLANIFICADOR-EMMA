/**
 * reglas.ts — La Ficha de Rol, solo lectura.
 * No hay nada editable acá a propósito: vive en core/reglas.ts, versionada.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import {
  CATEGORIAS, DECISIONES_PROPIAS, DELEGACION, DOTACION, INDICADORES,
  PERFIL, PERSONAS, REGLAS_SISTEMA, UMBRALES,
} from '../../core/reglas';

@Component({
  selector: 'app-reglas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reglas.html',
})
export class Reglas {
  protected readonly perfil = PERFIL;
  protected readonly decisiones = DECISIONES_PROPIAS;
  protected readonly categorias = CATEGORIAS;
  protected readonly umbrales = UMBRALES;
  protected readonly reglas = REGLAS_SISTEMA;
  protected readonly indicadores = INDICADORES;
  protected readonly vacantes = DOTACION.vacantes;
  protected readonly equipo = Object.values(PERSONAS).filter(p => p.rol);
  protected readonly tabla = DELEGACION.map(d => ({
    tarea: d.tarea,
    dueno: PERSONAS[d.dueno].nombre.split(' ')[0],
    excepcion: d.excepcion ?? '',
    forzada: d.forzada,
  }));
}
