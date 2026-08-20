/** modelo.ts — Las formas de los datos que guarda la app. */

import type { Segmento } from './clasificador';
import type { PersonaId } from './reglas';

export type { Checkin, Segmento, Delegacion } from './clasificador';

export interface Prioridad {
  id: string;
  texto: string;
  hecha: boolean;
  creado: number;
  categoria: string | null;
  /** Si salió de la bandeja, para cerrarla junta cuando la marcás hecha. */
  pendienteId?: string | null;
  /** Objetivo de la semana al que aporta, si aporta a alguno. */
  objetivoId?: string | null;
}

export interface Decision {
  que: string;
  quien: string;
  cuando: string;
  hecho: boolean;
}

export interface Reunion {
  id: string;
  titulo: string;
  fecha: string;
  acta: Decision[];
  creado: number;
  cerrada?: string;
  tarde?: boolean;
}

export interface Derivacion {
  id: string;
  texto: string;
  dueno: PersonaId;
  duenoNombre: string;
  tarea: string;
  fecha: string;
  origen: 'prioridad' | 'checkin';
  avisado: boolean;
  avisadoEl?: string;
  creado: number;
  horas?: number;
}

export interface FilaIndicadores {
  mes: string;
  margen: number | null;
  recompra: number | null;
  caja60: number | null;
}

export interface Ajustes {
  driveClientId: string;
  driveFolderId: string;
  horaManana: string;
  horaNoche: string;
  notificaciones: boolean;
  horasDiaPorDefecto: number;
  primerUso: string | null;
  ultimaSync: number | null;
  ultimaSyncCalendario: number | null;
  tema: 'auto' | 'claro' | 'oscuro';
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  driveClientId: '',
  driveFolderId: '1gar-fgb0GdUtS01KdNhDnfWtyJ1MBMkX',
  horaManana: '08:00',
  horaNoche: '20:30',
  notificaciones: false,
  horasDiaPorDefecto: 8,
  primerUso: null,
  ultimaSync: null,
  ultimaSyncCalendario: null,
  tema: 'auto',
};

export interface DocIndexado {
  id: string;
  name: string;
  ruta: string;
  mimeType: string;
  modifiedTime: string;
  leible: boolean;
  chars?: number;
  error?: string;
  webViewLink?: string;
}

export type { Segmento as SegmentoCheckin };
export type SegmentoConHoras = Segmento;
