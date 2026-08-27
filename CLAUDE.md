# Memoria del proyecto — Agenda EVB

Lo que hay que saber antes de tocar nada. El README cuenta **qué hace** la app; esto cuenta
**por qué está hecha así** y qué se rompe si se cambia sin pensar.

## De quién es y para qué

Emmanuel Van Breedam (`emmanuelclubdelmate@gmail.com`), Director General de ArgenBras y
Director de LTA World Trading, en Concordia, Entre Ríos. Tres unidades: Construcción
(cielorrasos PVC, aislamientos), Papelería/Higiene, y LTA/Comex.

Un solo usuario. Se usa **desde el celular, de parado, en menos de 30 segundos**. La compu es
secundaria. Todo lo que tarde o exija concentración no se va a usar, y una función que no se usa
es peor que no tenerla porque ocupa lugar.

El problema real que resuelve no es la falta de un lugar donde anotar: es que el tiempo del
Director se va en tareas que tienen otro dueño. Por eso la app **frena** en vez de solo
registrar.

## Reglas que no se negocian

Están en `src/app/core/reglas.ts` y salen de la Ficha de Rol del 08/08/2026.

- **Regla 3.3**: pedidos, presupuestos, CRM, despachos, NF, listas de precios, bancos y
  comprobantes cuentan SIEMPRE como Ejecución Operativa. Se recalcula desde el código en
  `normalizarDelegacion()`, así que ni un dato guardado a mano puede apagarla. Es justo la que
  uno quiere apagar el día que aprieta.
- **Un solo nombre por tarea**. Si aparece más de uno, nadie es responsable.
- **Filtro de delegación en toda entrada de texto**: prioridades, pendientes y bloques de
  agenda. También al **corregir** un texto ya escrito — si no, alcanzaría con escribirlo torcido
  y arreglarlo después para saltear la regla.
- **Orden y color de las 8 categorías**: no se reordenan. El orden fijo es lo que garantiza que
  dos tramos vecinos de una barra apilada se distingan con daltonismo. Paleta validada con el
  script de la skill dataviz en claro y oscuro.
- **El criterio de cada umbral vive en el código**; los números son editables. Un umbral que se
  corre después de ver el resultado no mide nada.

## Valores de fábrica vs. configuración

El brief original pedía las reglas en el código, no en una pantalla de ajustes: *«si depende de
que yo la actualice, no la voy a actualizar»*. Sigue siendo cierto y `reglas.ts` sigue ahí.

Lo que cambió: eso es el **piso, no el techo**. `core/config.ts` resuelve una capa editable
encima. Cada sección está «de fábrica» o «es tuya», con la fecha, y se puede volver al original.
La distinción es **regla vs. dato**: «un umbral se fija antes de medir» es regla; «son 6 horas»
es dato. Los datos envejecen y esperar un commit para corregirlos hace que la app mienta.

## Errores que ya cometí acá — no repetirlos

- **Nada puede volverse invisible.** Ya pasó tres veces: prioridades sin cerrar bajo una fecha
  vieja, semanas sin cerrar que el ritual solo ofrece viernes y sábado, y horas «sin clasificar»
  que se contaban en el total y no salían en ninguna barra. Si un dato se guarda por fecha,
  preguntarse **dónde vuelve a aparecer**.
- **Un estado que no se puede resolver desde donde se ve, no sirve.** Los carteles de Hoy
  llevaban a la pantalla y no a la acción. La barra gris de «sin clasificar» tenía el botón de
  arreglo media pantalla más arriba.
- **Clasificar es al guardar y queda fijo.** Arreglar el clasificador NO arregla lo ya cargado:
  para eso está «Reclasificar con las reglas de ahora» en Semana.
- **Firestore rechaza `undefined`** y corta la escritura entera. Se limpia en `repo-firestore.ts`,
  única puerta a la nube. No volver a fabricar campos opcionales en `undefined`.
- **No contestar antes de saber dónde vive la sesión.** Todo pasa por `Datos.#puerta()`, que
  espera a que Firebase resuelva. Leer del aparato mientras la nube carga muestra una app vacía;
  escribir ahí pierde el dato para siempre.
- **Un `<dialog>` abierto vuelve inerte la página**: en las pruebas, un paso que falla sin
  cerrarlo tira abajo todos los siguientes. Y el render es asincrónico: esperar el cambio, no
  leer el valor enseguida y concluir que el botón no hizo nada.

## Cómo se verifica

```bash
export PATH=/opt/node24/bin:$PATH     # Angular 22 necesita Node >= 22.22
npx ng build                          # tiene que quedar sin ERROR ni WARNING
npx ng test                           # 126 tests
npx http-server dist/agenda/browser -p 8099 -c-1 --silent &
node tools/e2e.mjs                    # ~50 verificaciones en Chromium real
```

`tools/e2e.mjs` corre contra el build de producción con service worker. Los pasos comparten
estado y corren en orden: si uno cambia un texto que otro busca, hay que **dejarlo como estaba**
al terminar. Playwright está enlazado desde `/opt/node22/lib/node_modules`.

Deploy: push a `claude/pwa-agenda-planificador-go3frt` dispara GitHub Pages (~50 s).

## Lo que depende de él, no de mí

- **El permiso de Google dura una hora** y no hay forma de estirarlo sin servidor. Se renueva de
  a un toque y sin volver a preguntar, porque el consentimiento ya existe. Vive **por aparato**:
  con conectar uno alcanza, porque lo importado sí se sincroniza.
- **Push con la app cerrada**: falta clave VAPID + plan Blaze + desplegar `functions/`. La
  tarjeta lo dice en vez de ofrecer un botón que no puede funcionar.
- En Google Cloud ya están: Drive API, Calendar API, y las dos URIs del cliente «Agenda EVB web».
  La app muestra las direcciones exactas para copiar (Configuración → Google Drive).

## Pendiente

- **IA en la app** — lo pidió y quedó agendado, sin definir. Candidatos: clasificar el cierre en
  lenguaje natural en vez de por palabras, responder preguntas sobre los documentos de Drive,
  sugerir las 3 prioridades. Falta decidir alcance, costo por uso y dónde vive la clave.
- **Automático de verdad para el calendario**: necesita un servidor que guarde el permiso largo
  (Functions + Blaze). Resolvería también el push. Es decisión de costo, suya.

## Cómo trabaja él

Reporta desde el uso real, con capturas, y casi siempre tiene razón aunque el diagnóstico sea
otro. Cuando dice «me parece que hay algo mal», buscar el bug antes de explicar por qué está
bien. Responder en castellano rioplatense, directo, sin adornos. Cuando algo no se puede,
decirlo de una y ofrecer la alternativa concreta con su costo.
