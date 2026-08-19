/**
 * ayuda.ts — Cómo se usa la app, adentro de la app.
 *
 * Está acá para el momento en que dudás, no para leer una vez y olvidar. Es
 * texto fijo: no depende de datos ni de conexión.
 */

import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Duda { pregunta: string; respuesta: string; }

@Component({
  selector: 'app-ayuda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './ayuda.html',
  styleUrl: './ayuda.css',
})
export class Ayuda {
  protected readonly abierta = signal<string | null>(null);

  protected readonly dudas: Duda[] = [
    {
      pregunta: 'Me olvidé de cargar dos días. ¿Arruiné la medición?',
      respuesta: 'No. En «Últimos días», dentro de Hoy, cada día sin registro tiene un botón ' +
        '«Cargar»: escribís la frase igual, aunque sea tarde. Y si pasan dos días seguidos sin ' +
        'cierre, el aviso de la noche deja de ser genérico y te dice cuántos días van.',
    },
    {
      pregunta: 'Clasificó mal algo que escribí.',
      respuesta: 'En la pantalla de confirmación tocás otra categoría y listo. Lo único que no se ' +
        'puede cambiar es lo que la regla de mapeo manda a Ejecución operativa: pedidos, ' +
        'presupuestos, CRM, despachos, NF, listas de precios, bancos y comprobantes van siempre ahí.',
    },
    {
      pregunta: '¿Y si no tengo señal?',
      respuesta: 'Funciona igual. Cargás, se guarda en el teléfono y se sincroniza sola cuando ' +
        'vuelve internet. También abre sin conexión.',
    },
    {
      pregunta: 'Cambio de teléfono. ¿Pierdo todo?',
      respuesta: 'No, mientras entres con tu cuenta de Google: los datos están en tu proyecto de ' +
        'Firebase y aparecen solos. Igual, en Ajustes tenés «Exportar backup».',
    },
    {
      pregunta: '¿Quién puede ver esto?',
      respuesta: 'Nadie más que vos. Las reglas de la base están atadas a tu cuenta: aunque ' +
        'alguien encuentre la dirección de la app y entre con otro Gmail, no puede leer ni ' +
        'escribir nada.',
    },
  ];

  protected alternar(p: string): void {
    this.abierta.set(this.abierta() === p ? null : p);
  }
}
