# Agenda EVB — agenda, planificador y asistente de trabajo

PWA de uso personal (un solo usuario) que aplica la **Ficha de Rol del 08/08/2026** de forma
automática: clasifica el tiempo, marca en rojo lo que no es tuyo, no deja entrar como prioridad
propia nada que tenga otro dueño, y sigue la prueba de Luciana con su cuenta atrás.

**Angular 22 + Firebase.** Los datos se sincronizan entre el celular y la compu, y siguen
funcionando sin señal. Si todavía no configuraste Firebase, la app arranca igual en modo local:
nunca queda inutilizable esperando que completes algo.

La lógica de negocio **está escrita en el código y versionada** (`src/app/core/reglas.ts`,
`src/app/core/prueba-luciana.ts`). No hay pantalla de ajustes donde haya que cargarla a mano,
justamente porque si dependiera de eso no se iba a actualizar nunca.

---

## Cómo se usa (30 segundos por día)

| Pantalla | Para qué |
|---|---|
| **Hoy** | Máximo 3 prioridades + el cierre de jornada de una sola pregunta. Se puede dictar por voz. |
| **Agenda** | Tu semana hora por hora, adentro de la app. Eventos propios + importación en solo lectura de Google Calendar. |
| **Pendientes** | La bandeja: todo lo que sabés que hay que hacer. Tope de 20, filtro de delegación y caducidad a los 21 días. |
| **Semana** | Los 3 objetivos de la semana arriba, y debajo el resultado: 4 umbrales con semáforo y tres gráficos. Plan y resultado en la misma pantalla, a propósito. |
| **Actas** | Reunión cerrada = qué se decidió / quién / para cuándo. Sin eso queda «sin acta» y visible. |
| **⋯ → Para delegar** | Todo lo que hiciste vos y tenía otro dueño, agrupado por persona. |
| **⋯ → Indicadores** | Los 3 números que te tocan, con su evolución mensual. |
| **⋯ → Ficha de Rol** | Las 7 decisiones, la tabla de delegación y las 5 reglas, solo lectura. |
| **⋯ → Cómo se usa** | El instructivo, adentro de la app: dónde va cada cosa, los tres momentos del día, los viernes, y qué hacer cuando la app te frena. |
| **⋯ → Prueba** | La prueba de Luciana: revisiones de viernes y decisión del 05/09. |
| **⋯ → Documentos** | La carpeta de Drive indexada. |

### El circuito

Las tres pantallas no se pisan, se encadenan:

```
se te ocurre algo  →  Bandeja  →  se cuelga de un objetivo de la semana
                                        ↓
                            sube a prioridad del día (máx. 3)
                                        ↓
                    la marcás hecha y se cierra sola en la bandeja

un pendiente      →  «Reservar hora»  →  bloque en la agenda, sin reescribirlo

lo que tiene hora  →  Agenda   →  la reunión se cierra con acta
                                        ↓
                    los compromisos a tu nombre vuelven a la bandeja
```

Los compromisos que quedan a tu nombre en un acta entran solos a la bandeja: un acta no es un
lugar donde volver a mirar, la bandeja sí. Y lo que tiene otro dueño no entra en ningún punto de
la cadena — ni como pendiente, ni como prioridad.

Cosas que la app hace sola, sin que haya que configurarlas:

- Si escribís «cargué pedidos» o «fui al banco», eso va **siempre** a Ejecución Operativa aunque la
  agenda dijera otra cosa (regla de mapeo 3.3) y aparece en rojo con el nombre del dueño real. Esa
  categoría queda clavada: la app no te deja cambiarla a mano.
- Si intentás poner como prioridad algo de la tabla de delegación, **no entra**: la única salida es
  pasárselo a quien corresponde.
- Si un acta tiene dos nombres en «quién lo hace», la rechaza (si hay más de un responsable, nadie
  es responsable).
- Si pasan dos días sin cierre de jornada, el aviso deja de ser genérico y lo dice explícitamente.
- Si una revisión de la prueba de Luciana venció sin registrarse, lo marca en rojo: la regla del
  acuerdo dice que la prueba se cancela.
- Si un pendiente lleva 21 días sin ser prioridad, pasa al principio de la bandeja en rojo y solo
  te ofrece tres salidas: hacerlo, delegarlo o matarlo. Tres semanas alcanzan para saber que no
  era urgente.
- Si la bandeja llega a 20, no deja agregar más hasta que cierres, delegues o descartes algo.
- Si ninguna de las prioridades del día aporta a un objetivo de la semana, te lo dice.
- Pendientes y Agenda no se pisan: uno es el **qué** y el otro el **cuándo**. Un pendiente se
  manda a la agenda con «Reservar hora», que le busca el primer hueco libre; y un bloque nuevo se
  puede elegir de la bandeja en vez de tipearlo.
- Si dos eventos de la agenda se pisan, los marca. Y si las reuniones internas agendadas superan
  las 16 hs del manual, avisa antes de que la semana ocurra, no el viernes.
- Un bloque de trabajo reservado para una tarea de otro no se puede crear: reservarte tiempo para
  eso es la forma más cara de no delegarlo.

Si un día no cargás nada, no se rompe ni queda en blanco: los umbrales quedan en gris («sin
registro») en vez de mentir con ceros.

---

## Los gráficos

Están hechos con una paleta validada, no elegida a ojo: los ocho colores de categoría pasan el
control de contraste y de daltonismo en modo claro y en modo oscuro (los tonos oscuros no son los
claros invertidos, son otro juego validado contra el fondo oscuro).

- **Orden fijo, nunca ordenado por valor.** La misma categoría está siempre en la misma fila, así
  dos semanas se comparan de un vistazo. Las categorías en cero se muestran igual: que Estrategia
  esté vacía es justamente el dato.
- **Cada barra lleva su nombre y su número al lado.** El color acompaña, nunca es la única pista.
- **Hay tabla.** El botón «Ver números» muestra los mismos datos en una tabla.

---

## Publicarla e instalarla en el celular

1. **Activar Pages una vez, a mano**: *Settings → Pages → Build and deployment → Source:
   **GitHub Actions***. El workflow intenta activarlo solo, pero GitHub no le permite al token del
   workflow crear el sitio en este repositorio.
2. Cada push a `main` o a una rama `claude/**` compila el proyecto, corre los tests y publica.
   También se dispara a mano desde *Actions → Deploy PWA a GitHub Pages → Run workflow*.
3. Queda en `https://emma-argenbras.github.io/AGENDA-Y-PLANIFICADOR-EMMA/`.
4. En el celular: abrir esa URL en Chrome (Android) o Safari (iPhone) → *Agregar a pantalla de
   inicio*. Desde ahí abre a pantalla completa y funciona sin internet.

### Sobre la privacidad del repositorio

El repositorio es **público**. Como la app es estática, las reglas de negocio (la tabla de
delegación con los nombres del equipo y el detalle de la prueba) se descargan al navegador y son
legibles por cualquiera que tenga la dirección — eso pasa igual con el repo privado, porque el
sitio publicado es público.

Lo que **nunca** es público son tus datos: viven en tu dispositivo y, si conectás Firebase, en tu
proyecto, con reglas que atan cada documento a tu usuario (`firestore.rules`).

Si preferís que el código no quede a la vista: *Settings → General → Danger Zone → Change
visibility → Private*. Ojo que Pages desde un repositorio privado requiere plan Pro; la alternativa
gratis es Cloudflare Pages o Netlify, que publican desde repos privados.

---

## Firebase

El proyecto es **agenda-y-planificador-emma** y su configuración ya está en
`src/environments/environment.ts`, así que no hay que pegar nada en cada dispositivo.

Esos valores no son secretos: Firebase los publica para que se peguen en el código. Lo que protege
los datos son dos cosas:

1. **`firestore.rules`** — sólo `emmanuelclubdelmate@gmail.com`, con el mail verificado, puede leer
   y escribir, y sólo su propio árbol `usuarios/{uid}`. Todo lo demás está denegado.
2. **Dominios autorizados** de Authentication — el login sólo funciona desde las direcciones
   habilitadas.

Para que la sincronización funcione hay que dejar tres cosas hechas en la consola:

- **Authentication → Comenzar → habilitar Google.** Sin esto el login falla con
  `CONFIGURATION_NOT_FOUND`.
- **Authentication → Settings → Authorized domains** → agregar `emma-argenbras.github.io`.
- **Firestore → Reglas** → pegar el contenido de `firestore.rules` y Publicar (las reglas por
  defecto niegan todo). Con la CLI: `firebase deploy --only firestore:rules`.

Después, en la app: **Ajustes → Entrar**, y si ya venías usando la app en modo local,
**Subir lo de este dispositivo**.

### Push con la app cerrada (opcional)

Los avisos dentro de la app y las notificaciones locales funcionan sin nada de esto. Para que el
recordatorio llegue **con la app cerrada** hay que desplegar las tareas programadas:

```bash
cd functions && npm install && cd ..
firebase deploy --only functions
```

Son tres: las 3 prioridades a la mañana, el cierre a la noche (con el mensaje que cambia a los dos
días sin registro) y el checklist de la revisión de Luciana los viernes. Requiere plan **Blaze**
(tarjeta cargada); con un usuario y tres disparos por día el costo real es prácticamente cero.
Después, en **Ajustes → Registrar** este dispositivo para push, y cargar la `vapidKey` de
*Firebase → Cloud Messaging → Web Push certificates* en la configuración.

---

## Conectar la carpeta de Drive (opcional)

La app lee la carpeta `1gar-fgb0GdUtS01KdNhDnfWtyJ1MBMkX` en **solo lectura**, con tu cuenta,
directo desde el navegador.

1. [console.cloud.google.com](https://console.cloud.google.com) → el mismo proyecto de Firebase.
2. APIs y servicios → Biblioteca → activar **Google Drive API**.
3. Pantalla de consentimiento OAuth → Externo → agregarte como usuario de prueba.
4. Credenciales → Crear credenciales → ID de cliente OAuth → Aplicación web.
5. En **Orígenes de JavaScript autorizados**: `https://emma-argenbras.github.io`
   (y `http://localhost:4200` para probar local).
6. Pegar el Client ID en **Ajustes**.

Después, *Docs → Traer documentos*: baja el texto de los Google Docs, Sheets y Slides y los deja
indexados en el teléfono, así la búsqueda anda offline. Los PDF e imágenes se listan pero no se
leen. Devuelve el párrafo textual del documento, no una interpretación.

El mismo permiso habilita **Agenda → Importar semana**, que trae de Google Calendar lo que
agendaron otros. Para eso hay que activar también la **Google Calendar API** en el mismo proyecto
de Google Cloud. Si ya habías conectado Drive antes de esto, la primera importación te va a pedir
el permiso de nuevo: ahora incluye el calendario.

---

## Desarrollo

```bash
npm install
npm start                      # http://localhost:4200
npm test                       # 38 tests de las reglas de negocio (vitest)
npm run build                  # build de producción
npm run servir:dist            # sirve el build en :8099
npm i -D playwright && npm run test:e2e   # 33 verificaciones en un navegador real
npm run iconos                 # regenera los íconos PNG (sin dependencias)
```

Requiere Node 24 (lo pide Angular 22).

### Actualizar la app

La app se actualiza sola al abrirla, pero con una PWA instalada eso puede tardar un ciclo. En
**Ajustes → Versión de la app** están los dos controles manuales:

- **Buscar ahora** — consulta si hay una versión nueva publicada y la instala.
- **Forzar recarga completa** — borra el service worker y todo lo cacheado y baja la app de cero.
  Ninguna de las dos toca los datos.

Cuando el service worker detecta una versión nueva por su cuenta, aparece una barra arriba con el
botón para instalarla.

### Estructura

```
src/app/core/reglas.ts          ★ Secciones 3.1 a 3.7: decisiones propias, tabla de delegación,
                                  8 categorías, 4 umbrales, 5 reglas, 3 indicadores
src/app/core/prueba-luciana.ts  ★ Sección 4: prueba, revisiones, señales, salidas
src/app/core/agenda.ts          ★ Reglas de la agenda: tipos, solapamientos, carga de la semana
src/app/core/pendientes.ts      ★ Reglas de la bandeja y del plan: tope, caducidad, orden
src/app/core/clasificador.ts    Motor: texto libre → categoría + dueño real
src/app/core/fechas.ts          Fechas en hora local
src/app/data/                   Firestore, sesión de Google, repositorio local, Drive, avisos
src/app/ui/graficos/            Los tres gráficos
src/app/vistas/                 Una pantalla por carpeta
functions/                      Tareas programadas de push
firestore.rules                 Cada documento atado a tu usuario
tools/e2e.mjs                   Prueba de punta a punta
tools/make-icons.py             Genera los íconos PNG
```

★ = las reglas del negocio. Para cambiar un umbral, un dueño o una categoría se edita ese archivo y
se commitea. Eso es a propósito: obliga a que quede registro de cuándo cambió la regla y por qué.

### Decisiones técnicas

- **Angular 22** (lo último; 21 pasó a LTS), zoneless, componentes standalone y señales.
- **SDK de Firebase directa, sin `@angular/fire`**: ese paquete todavía pide Angular 20, así que
  usarlo obligaba a quedarse dos versiones atrás. La SDK modular se integra bien con señales.
- **Firestore con caché offline** (`persistentLocalCache`), y un repositorio local con IndexedDB
  detrás de la misma interfaz: por eso la app funciona idéntico con nube y sin nube.
- **Rutas con `#`**: GitHub Pages sirve estáticos y así un enlace profundo recargado nunca da 404.
- **Búsqueda de documentos local, no RAG**: son pocos archivos y son documentos de reglas. Devuelve
  el párrafo textual, sin inventar. El enganche para mandarle esos pasajes a un modelo está aislado
  en `Drive.buscar()`.
