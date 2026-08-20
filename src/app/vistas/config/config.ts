/**
 * config.ts — Cambiar las reglas sin esperar un commit.
 *
 * El brief pedía que la Ficha de Rol viviera en el código y no en una pantalla
 * de ajustes, y sigue viviendo ahí: la app arranca sabiéndola entera. Pero los
 * datos envejecen —alguien se va, una prueba termina, un umbral cambia— y una
 * app que reclama por una realidad vieja es una app que se deja de mirar.
 *
 * Entonces cada sección está en uno de dos estados, y se ve cuál:
 *   · De fábrica: vale lo que dice el código.
 *   · Tuya: la editaste, con la fecha, y hay un botón para volver al original.
 *
 * Lo que NO se edita acá está puesto a propósito: el criterio de cada umbral,
 * el orden y el color de las categorías, y que las filas forzadas cuenten como
 * Ejecución Operativa (regla 3.3). Eso es lo que la app tiene que sostener
 * incluso cuando cambiarlo sería más cómodo.
 */

import { Component, computed, inject, resource, signal, type WritableSignal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Datos } from '../../data/datos';
import { Configuracion } from '../../data/configuracion';
import { Avisos } from '../../ui/avisos';
import { Dialogo } from '../../ui/dialogo';
import { fechaCorta, fechaLarga, hoyISO } from '../../core/fechas';
import { viernesEntre } from '../../core/pruebas';
import type { PruebaDeRol, Senal, TipoSenal } from '../../core/prueba-luciana';
import {
  CATEGORIAS_FABRICA, INDICADORES_FABRICA, SECCIONES, idDesde, usosDePersona,
  type CategoriaEditable, type IndicadorEditable, type SeccionConfig,
} from '../../core/config';
import type {
  DecisionPropia, FilaDelegacion, NumerosUmbral, Perfil, PersonaConId,
  ReglaSistema, Vacante,
} from '../../core/reglas';

@Component({
  selector: 'app-config',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Dialogo],
  templateUrl: './config.html',
  styleUrl: './config.css',
})
export class Config {
  private readonly datos = inject(Datos);
  private readonly avisos = inject(Avisos);
  protected readonly cfg = inject(Configuracion);

  protected readonly hoy = hoyISO();
  protected readonly fechaCorta = fechaCorta;
  protected readonly fechaLarga = fechaLarga;
  protected readonly secciones = SECCIONES;
  protected readonly catsFabrica = CATEGORIAS_FABRICA;

  protected readonly abierta = signal<SeccionConfig | null>(null);
  protected readonly guardando = signal(false);

  /* ── Desde cuándo cuenta la app ────────────────────────────────────────── */

  private readonly ajustes = resource({
    params: () => ({ v: this.datos.cambios() }),
    loader: () => this.datos.ajustes(),
  });

  protected readonly inicio = computed(() => this.ajustes.value()?.inicio ?? null);
  protected readonly primerUso = computed(() => this.ajustes.value()?.primerUso ?? null);
  protected readonly cuentaDesde = computed(() => this.inicio() ?? this.primerUso());
  protected readonly confirmandoArranque = signal(false);

  protected async arrancarHoy(): Promise<void> {
    const f = await this.datos.arrancarHoy();
    this.confirmandoArranque.set(false);
    this.avisos.mostrar(`Listo: la app cuenta desde el ${fechaCorta(f)}.`);
  }

  protected async fijarInicio(valor: string): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return;
    await this.datos.guardarAjustes({ inicio: valor });
    this.avisos.mostrar(`Cuenta desde el ${fechaCorta(valor)}.`);
  }

  protected async borrarInicio(): Promise<void> {
    await this.datos.guardarAjustes({ inicio: null });
    this.avisos.mostrar('Vuelve a contar desde el primer día que abriste la app.');
  }

  /* ── Estado de cada sección ────────────────────────────────────────────── */

  protected editada(s: SeccionConfig): string | null { return this.cfg.editadas()[s] ?? null; }

  protected alternar(s: SeccionConfig): void {
    if (this.abierta() === s) { this.abierta.set(null); return; }
    this.#cargarBorrador(s);
    this.abierta.set(s);
  }

  protected cancelar(): void { this.abierta.set(null); }

  /* ── Borradores ────────────────────────────────────────────────────────── */

  protected readonly bPerfil = signal<Perfil>({ nombre: '', roles: [], base: '', unidades: [] });
  protected readonly bPersonas = signal<PersonaConId[]>([]);
  protected readonly bDelegacion = signal<FilaDelegacion[]>([]);
  protected readonly bDecisiones = signal<DecisionPropia[]>([]);
  protected readonly bCategorias = signal<CategoriaEditable[]>([]);
  protected readonly bUmbrales = signal<NumerosUmbral | null>(null);
  protected readonly bReglas = signal<ReglaSistema[]>([]);
  protected readonly bIndicadores = signal<IndicadorEditable[]>([]);
  protected readonly bPruebas = signal<PruebaDeRol[]>([]);
  protected readonly bDotacion = signal<Vacante[]>([]);

  #cargarBorrador(s: SeccionConfig): void {
    const v = this.cfg.reglas();
    const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
    switch (s) {
      case 'perfil': this.bPerfil.set(copia(v.perfil)); break;
      case 'personas': this.bPersonas.set(copia(v.personasLista)); break;
      case 'delegacion': this.bDelegacion.set(copia(v.delegacion)); break;
      case 'decisiones': this.bDecisiones.set(copia(v.decisiones)); break;
      case 'categorias':
        this.bCategorias.set(v.categorias.map(c =>
          ({ id: c.id, nombre: c.nombre, definicion: c.definicion, pistas: [...c.pistas] })));
        break;
      case 'umbrales': this.bUmbrales.set(copia(v.numeros)); break;
      case 'reglas': this.bReglas.set(copia(v.reglas)); break;
      case 'indicadores':
        this.bIndicadores.set(v.indicadores.map(i =>
          ({ id: i.id, titulo: i.titulo, unidad: i.unidad, aclaracion: i.aclaracion })));
        break;
      case 'pruebas': this.bPruebas.set(copia(v.pruebas)); break;
      case 'dotacion': this.bDotacion.set(copia(v.vacantes)); break;
    }
  }

  /* ── Ayudas de edición, usadas por la plantilla ────────────────────────── */

  protected txt(e: Event): string { return (e.target as HTMLInputElement | HTMLTextAreaElement).value; }
  protected num(e: Event): number { return Number((e.target as HTMLInputElement).value); }

  /** Una frase por línea: en un teléfono es lo único cómodo para una lista. */
  protected lineas(xs: readonly string[]): string { return xs.join('\n'); }
  protected deLineas(v: string): string[] { return v.split('\n').map(x => x.trim()).filter(Boolean); }

  /** Las pistas y los alias son palabras sueltas: van separadas por coma. */
  protected comas(xs: readonly string[]): string { return xs.join(', '); }
  protected deComas(v: string): string[] { return v.split(',').map(x => x.trim()).filter(Boolean); }

  protected editar<T extends object>(s: WritableSignal<T[]>, i: number, parche: Partial<T>): void {
    s.update(xs => xs.map((x, k) => (k === i ? { ...x, ...parche } : x)));
  }

  protected quitar<T>(s: WritableSignal<T[]>, i: number): void {
    s.update(xs => xs.filter((_, k) => k !== i));
  }

  protected mover<T>(s: WritableSignal<T[]>, i: number, d: number): void {
    s.update(xs => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const copia = [...xs];
      [copia[i], copia[j]] = [copia[j]!, copia[i]!];
      return copia;
    });
  }

  /* ── Agregar filas ─────────────────────────────────────────────────────── */

  protected agregarUnidad(): void {
    this.bPerfil.update(p => ({
      ...p,
      unidades: [...p.unidades, { id: idDesde('unidad', p.unidades.map(u => u.id)), nombre: '', corto: '', detalle: '' }],
    }));
  }

  protected quitarUnidad(i: number): void {
    this.bPerfil.update(p => ({ ...p, unidades: p.unidades.filter((_, k) => k !== i) }));
  }

  protected agregarPersona(): void {
    this.bPersonas.update(xs => [...xs, { id: idDesde('persona', xs.map(x => x.id)), nombre: '', rol: '', alias: [] }]);
  }

  /** No se borra a alguien que todavía es dueño de una tarea: quedaría huérfana. */
  protected quitarPersona(i: number): void {
    const p = this.bPersonas()[i];
    if (!p) return;
    const usos = this.bDelegacion().length
      ? this.bDelegacion().filter(f => f.dueno === p.id).map(f => f.tarea)
      : usosDePersona(p.id, this.cfg.reglas());
    if (usos.length) {
      this.avisos.mostrar(`${p.nombre || 'Esa persona'} todavía es dueño de: ${usos[0]}. Cambiá el dueño primero.`);
      return;
    }
    this.quitar(this.bPersonas, i);
  }

  protected agregarFila(): void {
    this.bDelegacion.update(xs => [...xs, {
      id: idDesde('tarea', xs.map(x => x.id)),
      tarea: '',
      dueno: this.bPersonas()[0]?.id ?? this.cfg.reglas().personasLista[0]?.id ?? 'emma',
      categoria: 'operativa',
      forzada: false,
      pistas: [],
    }]);
  }

  protected agregarDecision(): void {
    this.bDecisiones.update(xs => [...xs, { id: idDesde('decision', xs.map(x => x.id)), texto: '', pistas: [] }]);
  }

  protected agregarRegla(): void {
    this.bReglas.update(xs => [...xs, { id: idDesde('regla', xs.map(x => x.id)), titulo: '', texto: '' }]);
  }

  protected agregarVacante(): void {
    this.bDotacion.update(xs => [...xs, { puesto: '', desde: this.hoy, nota: '' }]);
  }

  /* ── Delegación: lo que la regla 3.3 no deja tocar ─────────────────────── */

  protected readonly personasParaElegir = computed(() => {
    const b = this.bPersonas();
    return b.length ? b : this.cfg.reglas().personasLista;
  });

  protected nombreDe(id: string): string {
    return this.personasParaElegir().find(p => p.id === id)?.nombre ?? id;
  }

  /* ── Pruebas de rol ────────────────────────────────────────────────────── */

  protected readonly TIPOS_SENAL: { id: TipoSenal; nombre: string }[] = [
    { id: 'bool', nombre: 'Sí / No' },
    { id: 'num', nombre: 'Un número' },
    { id: 'opcion', nombre: 'Elegir una opción' },
  ];

  protected agregarPrueba(): void {
    const inicio = this.hoy;
    const fin = sumar(inicio, 28);
    this.bPruebas.update(xs => [...xs, {
      id: idDesde('prueba_' + inicio, xs.map(x => x.id)),
      persona: '',
      inicio,
      fin,
      decision: sumar(fin, 1),
      decisionDonde: 'Directorio',
      encargo: [],
      noHace: [],
      revisiones: viernesEntre(inicio, fin),
      duracionRevision: 15,
      reglaCancelacion: 'Si las revisiones no se hacen, la prueba se cancela.',
      senales: [],
      objetivoMejoras: 4,
      salidas: [],
      pendientes: [],
    }]);
  }

  /** Cambiar el rango recalcula los viernes: escribir cuatro fechas a mano falla. */
  protected rango(i: number, campo: 'inicio' | 'fin', valor: string): void {
    this.bPruebas.update(xs => xs.map((p, k) => {
      if (k !== i) return p;
      const siguiente = { ...p, [campo]: valor };
      return { ...siguiente, revisiones: viernesEntre(siguiente.inicio, siguiente.fin) };
    }));
  }

  protected agregarSenal(i: number): void {
    this.bPruebas.update(xs => xs.map((p, k) => k !== i ? p : {
      ...p,
      senales: [...p.senales, {
        id: idDesde('senal', p.senales.map(s => s.id)),
        tipo: 'bool' as TipoSenal,
        pregunta: '',
      }],
    }));
  }

  protected editarSenal(iP: number, iS: number, parche: Partial<Senal>): void {
    this.bPruebas.update(xs => xs.map((p, k) => k !== iP ? p : {
      ...p,
      senales: p.senales.map((s, j) => (j === iS ? { ...s, ...parche } : s)),
    }));
  }

  protected quitarSenal(iP: number, iS: number): void {
    this.bPruebas.update(xs => xs.map((p, k) => k !== iP ? p : {
      ...p, senales: p.senales.filter((_, j) => j !== iS),
    }));
  }

  protected agregarSalida(i: number): void {
    this.bPruebas.update(xs => xs.map((p, k) => k !== i ? p : {
      ...p,
      salidas: [...p.salidas, { id: String.fromCharCode(65 + p.salidas.length), titulo: '', detalle: '' }],
    }));
  }

  protected editarSalida(iP: number, iS: number, parche: Partial<{ titulo: string; detalle: string }>): void {
    this.bPruebas.update(xs => xs.map((p, k) => k !== iP ? p : {
      ...p, salidas: p.salidas.map((s, j) => (j === iS ? { ...s, ...parche } : s)),
    }));
  }

  protected quitarSalida(iP: number, iS: number): void {
    this.bPruebas.update(xs => xs.map((p, k) => k !== iP ? p : {
      ...p, salidas: p.salidas.filter((_, j) => j !== iS),
    }));
  }

  protected editarPrueba(i: number, parche: Partial<PruebaDeRol>): void {
    this.bPruebas.update(xs => xs.map((p, k) => (k === i ? { ...p, ...parche } : p)));
  }

  /* ── Guardar y restaurar ───────────────────────────────────────────────── */

  protected async guardar(s: SeccionConfig): Promise<void> {
    const problema = this.#validar(s);
    if (problema) { this.avisos.mostrar(problema); return; }
    this.guardando.set(true);
    try {
      switch (s) {
        case 'perfil': await this.cfg.guardar('perfil', this.bPerfil()); break;
        case 'personas': await this.cfg.guardar('personas', this.bPersonas()); break;
        case 'delegacion': await this.cfg.guardar('delegacion', this.bDelegacion()); break;
        case 'decisiones': await this.cfg.guardar('decisiones', this.bDecisiones()); break;
        case 'categorias': await this.cfg.guardar('categorias', this.bCategorias()); break;
        case 'umbrales': await this.cfg.guardar('umbrales', this.bUmbrales()!); break;
        case 'reglas': await this.cfg.guardar('reglas', this.bReglas()); break;
        case 'indicadores': await this.cfg.guardar('indicadores', this.bIndicadores()); break;
        case 'pruebas': await this.cfg.guardar('pruebas', this.bPruebas()); break;
        case 'dotacion': await this.cfg.guardar('dotacion', this.bDotacion()); break;
      }
      this.abierta.set(null);
      this.avisos.mostrar('Guardado. La app ya usa esto.');
    } finally {
      this.guardando.set(false);
    }
  }

  #validar(s: SeccionConfig): string | null {
    if (s === 'personas' && this.bPersonas().some(p => !p.nombre.trim())) {
      return 'Hay una persona sin nombre.';
    }
    if (s === 'delegacion') {
      const vacia = this.bDelegacion().find(f => !f.tarea.trim());
      if (vacia) return 'Hay una fila sin tarea.';
      const ids = this.personasParaElegir().map(p => p.id);
      const huerfana = this.bDelegacion().find(f => !ids.includes(f.dueno));
      if (huerfana) return `«${huerfana.tarea}» no tiene un dueño válido.`;
    }
    if (s === 'umbrales') {
      const n = this.bUmbrales();
      if (!n) return 'Faltan los números.';
      if (Object.values(n).some(x => !Number.isFinite(x) || x < 0)) return 'Hay un número inválido.';
      if (n.marketingBajo > n.marketingAlto) return 'El piso de marketing no puede ser mayor que el techo.';
      if (n.rolAviso > n.rolPiso) return 'El aviso del rol no puede ser mayor que el piso.';
      if (n.reunionesTolerancia < n.reunionesProyectadas) return 'La tolerancia de reuniones no puede ser menor que lo proyectado.';
    }
    if (s === 'pruebas') {
      const mala = this.bPruebas().find(p => !p.persona.trim());
      if (mala) return 'Hay una prueba sin persona.';
      const fechas = this.bPruebas().find(p => p.fin < p.inicio || p.decision < p.fin);
      if (fechas) return `Las fechas de ${fechas.persona} no cierran: inicio, fin y después la decisión.`;
    }
    return null;
  }

  protected readonly restaurando = signal<SeccionConfig | 'todo' | null>(null);

  protected async confirmarRestaurar(): Promise<void> {
    const s = this.restaurando();
    if (!s) return;
    if (s === 'todo') await this.cfg.restaurarTodo();
    else await this.cfg.restaurar(s);
    this.restaurando.set(null);
    this.abierta.set(null);
    this.avisos.mostrar('Volvió al original.');
  }

  protected tituloDe(s: SeccionConfig | 'todo' | null): string {
    if (!s) return '';
    if (s === 'todo') return 'toda la configuración';
    return SECCIONES.find(x => x.id === s)?.titulo ?? s;
  }
}

function sumar(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
