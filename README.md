# Agenda EVB — agenda, planificador y asistente de trabajo

PWA de uso personal (un solo usuario) que aplica la **Ficha de Rol del 08/08/2026** de forma
automática: clasifica el tiempo, marca en rojo lo que no es tuyo, no deja entrar como prioridad
propia nada que tenga otro dueño, y sigue la prueba de Luciana con su cuenta atrás.

La lógica de negocio **está escrita en el código y versionada** (`js/rules.js`,
`js/prueba-luciana.js`). No hay pantalla de "ajustes" donde haya que cargarla a mano, justamente
porque si dependiera de eso no se iba a actualizar nunca.

---

## Cómo se usa (30 segundos por día)

| Pantalla | Para qué |
|---|---|
| **Hoy** | Máximo 3 prioridades + el cierre de jornada de una sola pregunta ("¿qué te comió más horas hoy?"). Se puede dictar por voz. |
| **Semana** | Los 4 umbrales con semáforo verde/amarillo/rojo y las horas que no eran tuyas. |
| **Prueba** | Las 4 revisiones de viernes, el checklist de señales, la cuenta atrás al 05/09 y las 3 salidas. |
| **Actas** | Reunión cerrada = qué se decidió / quién / para cuándo. Sin eso queda "sin acta" y visible. |
| **Docs** | La carpeta de Drive indexada: preguntás y devuelve el párrafo exacto y de qué archivo salió. |
| **⋯ → Para delegar** | Todo lo que hiciste vos y tenía otro dueño, agrupado por persona. |
| **⋯ → Ficha de Rol** | Las 7 decisiones, la tabla de delegación y las 5 reglas, solo lectura. |
| **⋯ → Indicadores** | Los 3 números que te tocan. Y solo esos. |

Cosas que la app hace sola, sin que haya que configurarlas:

- Si escribís "cargué pedidos" o "fui al banco", eso va **siempre** a Ejecución Operativa aunque la
  agenda dijera otra cosa (regla de mapeo 3.3) y aparece en rojo con el nombre del dueño real.
- Si intentás poner como prioridad algo de la tabla de delegación, **no entra**: la única salida es
  pasárselo a quien corresponde.
- Si un acta tiene dos nombres en "quién lo hace", la rechaza (si hay más de un responsable, nadie
  es responsable).
- Si pasan dos días sin cierre de jornada, el aviso deja de ser genérico y lo dice explícitamente.
- Si una revisión de la prueba de Luciana venció sin registrarse, lo marca en rojo: la regla del
  acuerdo dice que la prueba se cancela.

Si un día no cargás nada, no se rompe ni queda en blanco: los umbrales quedan en gris ("sin
registro") en vez de mentir con ceros.

---

## Publicarla e instalarla en el celular

1. **Activar Pages una vez, a mano**: *Settings → Pages → Build and deployment → Source:
   **GitHub Actions***. El workflow intenta activarlo solo (`enablement: true`), pero GitHub no le
   permite al token del workflow crear el sitio en este repositorio: falla con *"Create Pages site
   failed: Resource not accessible by integration"* hasta que lo actives vos. Es un solo click y
   queda hecho para siempre.
2. Con Pages activado, volvé a *Actions → Deploy PWA a GitHub Pages* y usá *Re-run jobs* en la
   última corrida (o hacé cualquier push). El workflow `.github/workflows/pages.yml` publica el repo entero en cada push a `main` o a una rama
   `claude/**`. Como el repositorio todavía no tiene `main`, publica desde esta rama tal cual
   está; cuando la mergees a `main`, sigue funcionando igual. También se puede disparar a mano desde
   *Actions → Deploy PWA a GitHub Pages → Run workflow*.
3. Queda en `https://emma-argenbras.github.io/AGENDA-Y-PLANIFICADOR-EMMA/`.
4. En el celular: abrir esa URL en Chrome (Android) o Safari (iPhone) → *Agregar a pantalla de
   inicio*. Desde ahí abre a pantalla completa y funciona sin internet.

Para probarla en la compu: `npx http-server -p 8080 -c-1` y abrir `http://localhost:8080`.

Hay una prueba automática que abre la app en un navegador real y verifica las reglas que no se
pueden romper sin darse cuenta (el bloqueo de la tabla de delegación, el mapeo forzado a Ejecución
Operativa, el rechazo de actas con dos responsables, la revisión vencida de la prueba y el
funcionamiento offline):

```bash
npx http-server -p 8099 -c-1     # en una terminal
npm i -D playwright && node tools/e2e.mjs
```

---

### Sobre la privacidad del repositorio

El repositorio es **público**. Como la app es estática, las reglas de negocio (la tabla de
delegación con los nombres del equipo, los umbrales y el detalle de la prueba de Luciana) se
descargan al navegador y son legibles por cualquiera que tenga la dirección — eso pasa igual con el
repo privado, porque el sitio publicado es público.

Lo que **nunca** sale del teléfono son tus datos: los cierres de jornada, las prioridades, las actas
y las revisiones viven solo en el dispositivo.

Si preferís que el código no quede a la vista: *Settings → General → Danger Zone → Change
visibility → Private*. Ojo que GitHub Pages desde un repositorio privado requiere plan Pro; la
alternativa gratis es publicarlo en Cloudflare Pages o Netlify, que sí publican desde repos
privados, y ahí además se le puede poner contraseña al sitio.

## Conectar la carpeta de Drive (trámite de 5 minutos, una sola vez)

La app lee la carpeta `1gar-fgb0GdUtS01KdNhDnfWtyJ1MBMkX` en **solo lectura**, con tu propia cuenta,
directo desde el navegador. No hay servidor intermedio ni secreto guardado en ningún lado.

1. [console.cloud.google.com](https://console.cloud.google.com) con `emmanuelclubdelmate@gmail.com` → crear un proyecto.
2. *APIs y servicios → Biblioteca* → activar **Google Drive API**.
3. *Pantalla de consentimiento OAuth* → Externo → agregarte como usuario de prueba.
4. *Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web*.
5. En **Orígenes de JavaScript autorizados** poner `https://emma-argenbras.github.io`
   (y `http://localhost:8080` si vas a probar en la compu).
6. Copiar el Client ID y pegarlo en **Ajustes** de la app. Listo para siempre.

Después, *Docs → Traer documentos de Drive*: baja el texto de los Google Docs, Sheets y Slides de la
carpeta y los deja **indexados en el teléfono**, así la búsqueda anda offline y sin volver a pedir
permiso. Los PDF e imágenes se listan pero no se leen (no hay lector de PDF adentro de la app).

---

## Las decisiones técnicas del punto 7, con el trade-off de cada una

Están tomadas, pero son reversibles. Esto es lo que se ganó y lo que se resignó.

### 1. PWA sin build step, alojada en GitHub Pages

**Elegido:** HTML + JavaScript de módulos nativos, sin React, sin bundler, sin `npm install`.
Se sirve estático desde el mismo repo.

- **A favor:** se instala en el celular como una app, anda offline, costo cero, no hay nada que se
  pudra (no hay 400 dependencias que actualizar), y cualquier cambio es *editar un archivo y pushear*.
  Una app nativa habría necesitado cuenta de desarrollador, builds y revisiones de tienda para algo
  que usa una sola persona.
- **En contra:** en iPhone las notificaciones exigen tenerla agregada a la pantalla de inicio, y no
  hay integración profunda con el sistema (widgets, Siri). Si algún día querés widgets nativos, esto
  hay que rehacerlo.

### 2. Todo vive en el dispositivo (IndexedDB), sin servidor ni base de datos

- **A favor:** cero costo fijo, cero mantenimiento, cero superficie de ataque: los datos del negocio
  no viajan a ningún lado. Arranca instantáneo y funciona sin señal.
- **En contra:** los datos están en *ese* teléfono. Si lo cambiás, hay que **Ajustes → Exportar
  backup** e importar en el nuevo. No hay sincronización entre teléfono y compu.
- **Si molesta:** el paso natural es guardar el backup automático en un archivo de la misma carpeta
  de Drive. Requiere subir el scope de Drive de `readonly` a `drive.file`.

### 3. OAuth de Google desde el navegador, no sincronización manual

- **A favor:** un solo trámite y después la app trae sola lo que cambió en Drive. Solo pide permiso
  de **lectura**; el token dura una hora y no se guarda ningún refresh token ni client secret.
- **En contra:** hay que crear el Client ID una vez a mano (paso de arriba), y cada tanto Google
  vuelve a pedir el permiso. Sin backend no hay forma de evitar eso.
- **Alternativa descartada:** exportar los documentos a mano y pegarlos en la app — más simple de
  programar, pero depende de que alguien lo haga todas las semanas. Ya sabemos cómo termina eso.

### 4. Búsqueda de texto local, no embeddings/RAG

**Elegido:** el texto completo de los documentos se guarda en el teléfono y la búsqueda es por
palabras, con puntaje por párrafo. Devuelve **el párrafo textual** y el archivo de donde salió.

- **A favor:** son pocos archivos y son documentos de reglas, no una biblioteca: buscar "margen
  mínimo" encuentra lo que hay que encontrar. Anda offline, gratis, instantáneo, y **no inventa
  nada** — leés lo que dice el documento, no una paráfrasis.
- **En contra:** no responde preguntas conceptuales que exijan cruzar tres documentos y redactar una
  conclusión ("¿es coherente el esquema de comisiones con el margen mínimo?"). Para eso hace falta
  un modelo, y un modelo en el navegador significa poner una API key en el teléfono y pagar por uso.
- **Si hace falta:** el enganche está aislado en `js/drive.js` (`buscar()`), que ya devuelve los
  pasajes rankeados listos para mandárselos a un modelo. Es un cambio contenido, no una reescritura.

### 5. Notificaciones locales, no push server (etapa 2)

- **Hoy:** aviso a la mañana con las 3 prioridades y a la noche pidiendo el cierre; con la PWA
  instalada en Android también se disparan con la app cerrada (Periodic Background Sync). El aviso
  que **nunca** falla es el banner al abrir la app, que dice cuántos días seguidos van sin registro.
- **Límite honesto:** sin un servidor propio no hay push garantizado con la app cerrada, y en iPhone
  eso es más restrictivo todavía. Un push de verdad necesita un backend mínimo con claves VAPID.

---

## Estructura

```
index.html              Shell y navegación
css/app.css             Estilos (mobile-first, oscuro y claro)
sw.js                   Service worker: offline + recordatorios
manifest.webmanifest    Instalación como app
js/rules.js             ★ Secciones 3.1 a 3.7: decisiones propias, tabla de delegación,
                          8 categorías, 4 umbrales, 5 reglas, 3 indicadores
js/prueba-luciana.js    ★ Sección 4: prueba, revisiones, señales, salidas
js/classify.js          Motor: texto libre → categoría + dueño real (aplica 3.2 y 3.3)
js/store.js             IndexedDB, fechas, backup
js/drive.js             Drive solo lectura + índice y búsqueda local
js/notify.js            Recordatorios
js/ui.js                Helpers de DOM
js/views/*.js           Una pantalla por archivo
tools/make-icons.py     Genera los íconos PNG (sin dependencias)
```

★ = las reglas del negocio. Para cambiar un umbral, un dueño o una categoría se edita ese archivo y
se commitea. Eso es a propósito: obliga a que quede registro de cuándo cambió la regla y por qué.

---

## Qué falta (etapa 2, según el orden del brief)

- Push real con servidor de notificaciones (VAPID) para que los avisos lleguen con la app cerrada en
  cualquier teléfono.
- Backup automático a Drive.
- Lectura de PDFs.
- Respuestas redactadas sobre los documentos (hoy devuelve los pasajes exactos).
