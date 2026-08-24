/**
 * e2e.mjs — Prueba de punta a punta en un navegador real, contra el build de
 * producción (con service worker).
 *
 *   npm run build
 *   npx http-server dist/agenda/browser -p 8099 -c-1     (en otra terminal)
 *   npm i -D playwright && node tools/e2e.mjs
 *
 * Cubre las reglas que no se pueden romper sin darse cuenta: el bloqueo de la
 * tabla de delegación, el mapeo forzado a Ejecución Operativa, el rechazo de
 * actas con dos responsables, la revisión vencida de la prueba, los gráficos y
 * el funcionamiento offline.
 */

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
  .catch(() => { console.error('Falta Playwright: npm i -D playwright'); process.exit(2); });

const URL = process.env.APP_URL || 'http://127.0.0.1:8099/';
// PDF mínimo con una línea de texto real adentro, para el paso de Documentos.
const PDF_B64 = '255044462d312e340a312030206f626a0a3c3c202f54797065202f436174616c6f67202f5061676573203220302052203e3e0a656e646f626a0a322030206f626a0a3c3c202f54797065202f5061676573202f4b696473205b33203020525d202f436f756e742031203e3e0a656e646f626a0a332030206f626a0a3c3c202f54797065202f50616765202f506172656e74203220302052202f4d65646961426f78205b30203020363132203739325d202f5265736f7572636573203c3c202f466f6e74203c3c202f4631203520302052203e3e203e3e202f436f6e74656e7473203420302052203e3e0a656e646f626a0a342030206f626a0a3c3c202f4c656e677468203738203e3e0a73747265616d0a4254202f46312031342054662037322037303020546420284d617267656e206d696e696d6f206465206369656c6f727261736f73205056433a20333820706f72206369656e746f2920546a2045540a656e6473747265616d0a656e646f626a0a352030206f626a0a3c3c202f54797065202f466f6e74202f53756274797065202f5479706531202f42617365466f6e74202f48656c766574696361203e3e0a656e646f626a0a787265660a3020360a303030303030303030302036353533352066200a30303030303030303039203030303030206e200a30303030303030303538203030303030206e200a30303030303030313135203030303030206e200a30303030303030323431203030303030206e200a30303030303030333639203030303030206e200a747261696c65720a3c3c202f53697a652036202f526f6f74203120302052203e3e0a7374617274787265660a3433390a2525454f460a';
const errores = [];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-AR' });
const p = await ctx.newPage();
p.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
p.on('pageerror', e => errores.push('pageerror: ' + e.message));

/**
 * Un <dialog> modal deja inerte al resto de la página: si el test sigue
 * escribiendo mientras se está cerrando, el re-render le pisa lo que escribió.
 * Después de cada acción de un diálogo hay que esperar a que cierre de verdad.
 */
const sinDialogo = async () => {
  await p.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 10000 });
};

/**
 * Ir a #/config y dejar UNA sección abierta.
 *
 * Ojo: navegar al mismo hash no recarga nada, así que la pantalla conserva qué
 * sección estaba abierta. Tocar la cabecera a ciegas la cerraría.
 */
const abrirSeccion = async (id) => {
  await p.goto(URL + '#/config');
  await p.waitForSelector(`[data-seccion="${id}"]`);
  if (await p.locator(`[data-seccion="${id}"] .cuerpo`).count() === 0) {
    await p.click(`[data-seccion="${id}"] .cabecera`);
  }
  await p.waitForSelector(`[data-seccion="${id}"] .cuerpo`);
};

const paso = async (n, fn) => {
  try { await fn(); console.log('✓', n); }
  catch (e) {
    const m = String(e.message).split('\n').slice(0, 2).join(' | ');
    console.log('✗', n, '→', m);
    if (process.env.DEBUG_E2E) {
      console.log('   URL:', p.url());
      console.log('   main:', (await p.textContent('main').catch(() => '?')).replace(/\s+/g, ' ').slice(0, 400));
      console.log('   dialogs:', await p.locator('dialog[open]').count());
      await p.screenshot({ path: 'fallo.png', fullPage: true }).catch(() => {});
    }
    errores.push(n);
  }
};

await p.goto(URL, { waitUntil: 'networkidle' });

await paso('carga la pantalla Hoy', async () => {
  await p.waitForSelector('h1:has-text("Hoy")');
  await p.waitForSelector('text=Prioridades de hoy');
});

await paso('primer arranque: no inventa una racha que no existe', async () => {
  const t = await p.textContent('main');
  if (/d[ií]as h[áa]biles sin cierre/.test(t)) throw new Error('mostró racha en el primer uso');
});

await paso('bloquea una prioridad de la tabla de delegación', async () => {
  await p.fill('input[placeholder="Agregar prioridad…"]', 'cargar el presupuesto de Ruiz');
  await p.click('button[aria-label="Agregar"]');
  await p.waitForSelector('dialog[open] h2:has-text("NO ES TUYA")');
  const t = await p.textContent('dialog[open]');
  if (!t.includes('Comercial de la unidad')) throw new Error('no nombra al dueño real');
});

await paso('la única salida del bloqueo es derivarla', async () => {
  await p.click('dialog[open] .pie .btn.primario');
  await sinDialogo();
  const t = await p.textContent('main');
  if (t.includes('presupuesto de Ruiz')) throw new Error('la dejó entrar igual');
});

await paso('acepta una prioridad que sí es tuya', async () => {
  await p.fill('input[placeholder="Agregar prioridad…"]', 'negociar exclusividad con la fábrica de Curitiba');
  await p.click('button[aria-label="Agregar"]');
  await p.waitForSelector('text=Prioridades de hoy (1/3)');
});

await paso('se puede corregir una prioridad mal escrita', async () => {
  await p.goto(URL + '#/hoy');
  await p.click('.prioridad .texto-editable');
  await p.waitForSelector('dialog[open]:has-text("Corregir la prioridad")');
  await p.fill('dialog[open] input[type=text]', 'Definir el margen mínimo de cielorrasos');
  await p.click('dialog[open] .pie .btn.primario');
  await sinDialogo();
  await p.waitForSelector('.prioridad:has-text("Definir el margen mínimo de cielorrasos")');
});

await paso('corregir no es la puerta de atrás para saltear la tabla', async () => {
  await p.click('.prioridad .texto-editable');
  await p.waitForSelector('dialog[open]:has-text("Corregir la prioridad")');
  await p.fill('dialog[open] input[type=text]', 'cargar el presupuesto de Ruiz');
  await p.click('dialog[open] .pie .btn.primario');
  // El diálogo NO se cierra: explica de quién es y deja volver a escribir.
  const t = await p.textContent('dialog[open] .error');
  if (!t.includes('Comercial de la unidad')) throw new Error('no nombra al dueño real: ' + t);
  await p.fill('dialog[open] input[type=text]', 'Revisar los números del mes');
  await p.click('dialog[open] .pie .btn.primario');
  await sinDialogo();
  await p.waitForSelector('.prioridad:has-text("Revisar los números del mes")');
});

await paso('check-in de una frase: clasifica y marca lo ajeno', async () => {
  await p.fill('textarea', 'Cargué pedidos toda la mañana y después reunión de directorio');
  await p.click('button:has-text("Guardar")');
  await p.waitForSelector('dialog[open] .segmento');
  const t = await p.textContent('dialog[open]');
  if (!t.includes('NO ES TUYA')) throw new Error('no marcó la fuga');
  if (!t.includes('Ejecución Operativa')) throw new Error('no aplicó la regla de mapeo');
  if ((await p.locator('dialog[open] .segmento').count()) !== 2) throw new Error('no partió la frase en dos');
});

await paso('la categoría forzada no se puede cambiar a mano', async () => {
  const chipsEnForzado = await p.locator('dialog[open] .segmento.no-tuya .chips').count();
  if (chipsEnForzado > 0) throw new Error('dejó elegir categoría en un segmento forzado');
});

await paso('ajusta horas y confirma', async () => {
  await p.locator('dialog[open] .segmento').first().locator('.horas button').first().click();
  await p.click('dialog[open] .pie .btn.primario');
  await sinDialogo();
  await p.waitForSelector('text=Registrado. Esto es lo que quedó');
});

await paso('agenda: se crea un evento y aparece en el día de Hoy', async () => {
  await p.click('#tabs a[href="#/agenda"]');
  await p.waitForSelector('text=Horas agendadas');
  await p.click('button:has-text("+ Agregar al")');
  await p.waitForSelector('dialog[open]');
  await p.fill('dialog[open] input[type=text]', 'Directorio semanal');
  await p.click('dialog[open] .chip:has-text("Reunión interna")');
  await p.fill('dialog[open] input[type=time]', '09:00');
  await p.click('dialog[open] .chip:has-text("1 h")');
  await p.click('dialog[open] .pie .btn.primario');
  await sinDialogo();
  await p.waitForSelector('.evento:has-text("Directorio semanal")');
  await p.click('#tabs a[href="#/hoy"]');
  await p.waitForSelector('.dia-lista:has-text("Directorio semanal")');
});

await paso('agenda: no deja reservarte un bloque para algo de otro', async () => {
  await p.goto(URL + '#/agenda');
  await p.click('button:has-text("+ Agregar al")');
  await p.waitForSelector('dialog[open]');
  await p.fill('dialog[open] input[type=text]', 'cargar los pedidos de la semana');
  await p.click('dialog[open] .chip:has-text("Bloque de trabajo")');
  await p.click('dialog[open] .pie .btn.primario');
  await p.waitForSelector('dialog[open] .error');
  const t = await p.textContent('dialog[open] .error');
  if (!t.includes('Comercial de la unidad')) throw new Error('no nombra al dueño real');
  await p.click('dialog[open] .pie .btn:not(.primario):not(.peligro)');
  await sinDialogo();
});

await paso('agenda: sin permiso de Google lo dice, en vez de decir que nunca entró', async () => {
  await p.goto(URL + '#/agenda');
  await p.waitForSelector('h1:has-text("Agenda")');
  const t = await p.textContent('main');
  // Entrar con la cuenta y darle permiso al calendario son dos cosas distintas.
  // Antes las dos daban el mismo cartel y no se sabía cuál faltaba.
  if (!t.includes('Falta darle permiso a Google')) throw new Error('no distingue permiso de «sin eventos»');
  if (t.includes('Todavía nunca entró')) throw new Error('sigue diciendo que nunca entró');
  await p.waitForSelector('a[href="#/config"]:has-text("conectar")');
});

await paso('agenda: una reunión se puede cerrar con acta', async () => {
  await p.click('.evento:has-text("Directorio semanal") button:has-text("Cerrar con acta")');
  await p.waitForSelector('text=Ya está en Actas');
  await p.goto(URL + '#/actas');
  // queda en la lista de «sin acta», que se muestra en rojo hasta que la cerrás
  await p.waitForSelector('.tarjeta.alerta:has-text("Directorio semanal"):has-text("Escribir acta")');
});

await paso('semana: se definen los 3 objetivos y no entra un cuarto', async () => {
  await p.goto(URL + '#/semana');
  await p.waitForSelector('text=El plan: 3 objetivos');
  for (const o of ['Cerrar exclusividad Curitiba', 'Ordenar pipeline de Construcción', 'Definir margen de cielorrasos']) {
    await p.fill('input[placeholder="Objetivo de la semana…"]', o);
    await p.click('button[aria-label="Agregar"]');
    await p.waitForSelector(`text=${o}`);
  }
  if (await p.locator('input[placeholder="Objetivo de la semana…"]').count()) {
    throw new Error('deja cargar un cuarto objetivo');
  }
});

await paso('bandeja: bloquea lo ajeno y acepta lo tuyo', async () => {
  await p.click('#tabs a[href="#/pendientes"]');
  await p.waitForSelector('text=En la bandeja');
  await p.fill('input[placeholder="¿Qué hay que hacer?"]', 'actualizar la lista de precios de higiene');
  await p.click('button[aria-label="Agregar"]');
  await p.waitForSelector('dialog[open] h2:has-text("NO ES TUYA")');
  const t = await p.textContent('dialog[open]');
  if (!t.includes('Luciana')) throw new Error('no nombra al dueño');
  await p.click('dialog[open] .pie .btn.primario');
  await sinDialogo();

  await p.fill('input[placeholder="¿Qué hay que hacer?"]', 'preparar la propuesta para el inversor de Rosario');
  await p.click('button[aria-label="Agregar"]');
  await p.waitForSelector('.pendiente:has-text("inversor de Rosario")');
});

await paso('bandeja: las acciones secundarias están plegadas hasta que las pedís', async () => {
  const tarjeta = p.locator('.pendiente:has-text("inversor de Rosario")');
  if (await tarjeta.locator('button:has-text("Matarlo")').count()) {
    throw new Error('muestra todo desplegado y la lista deja de leerse de un vistazo');
  }
  await tarjeta.locator('button[aria-label="Más opciones"]').click();
  await tarjeta.locator('button:has-text("Matarlo")').waitFor();
});

await paso('bandeja: el pendiente se cuelga de un objetivo', async () => {
  await p.locator('.pendiente:has-text("inversor de Rosario") .chip:has-text("Cerrar exclusividad Curitiba")').click();
  await p.waitForSelector('.pendiente:has-text("→ Cerrar exclusividad Curitiba")');
});

await paso('hoy: el pendiente sube a prioridad y arrastra su objetivo', async () => {
  await p.click('#tabs a[href="#/hoy"]');
  await p.waitForSelector('text=Los 3 objetivos de esta semana');
  await p.click('button:has-text("Traer de la bandeja")');
  await p.waitForSelector('dialog[open]');
  await p.click('dialog[open] button:has-text("Subir")');
  await sinDialogo();
  await p.waitForSelector('.prioridad:has-text("inversor de Rosario")');
  const t = await p.textContent('.prioridad:has-text("inversor de Rosario")');
  if (!t.includes('Cerrar exclusividad Curitiba')) throw new Error('perdió el objetivo');
  if (!t.includes('de la bandeja')) throw new Error('no marca que vino de la bandeja');
});

await paso('el puente: un pendiente se reserva en la agenda sin reescribirlo', async () => {
  await p.goto(URL + '#/pendientes');
  const tarjeta = p.locator('.pendiente:has-text("inversor de Rosario")');
  await tarjeta.locator('button[aria-label="Más opciones"]').click();
  await tarjeta.locator('button:has-text("Reservar hora")').click();
  await p.waitForSelector('.aviso.visible');
  // queda con la hora a la vista en la bandeja…
  await tarjeta.locator('text=/⏱/').waitFor();
  // …y aparece en la agenda como bloque venido de la bandeja, sin haberlo tipeado
  await p.goto(URL + '#/agenda');
  await p.waitForSelector('.evento:has-text("inversor de Rosario"):has-text("de la bandeja")');
});

await paso('hoy: marcarla hecha cierra el pendiente en la bandeja', async () => {
  await p.goto(URL + '#/hoy');
  await p.locator('.prioridad:has-text("inversor de Rosario") .marca').click();
  await p.click('#tabs a[href="#/pendientes"]');
  await p.waitForSelector('text=Cerrados (1)');
  if (await p.locator('.pendiente:has-text("inversor de Rosario")').count()) {
    throw new Error('quedó abierto en la bandeja');
  }
});

await paso('semana: 4 umbrales con semáforo y números de cabecera', async () => {
  await p.click('#tabs a[href="#/semana"]');
  await p.waitForSelector('app-semaforo');
  if ((await p.locator('app-semaforo').count()) !== 4) throw new Error('faltan umbrales');
  const t = await p.textContent('main');
  for (const u of ['Marketing', 'Ejecución operativa', 'Venta y clientes + Estrategia', 'Reuniones internas']) {
    if (!t.includes(u)) throw new Error('falta el umbral ' + u);
  }
  if (!t.includes('Horas registradas')) throw new Error('faltan los números de cabecera');
});

await paso('semana: los gráficos dibujan', async () => {
  const barras = await p.locator('app-barras-categoria .fila-cat').count();
  if (barras !== 8) throw new Error('las barras por categoría son ' + barras);
  const columnas = await p.locator('app-columnas-dia .col').count();
  if (columnas !== 7) throw new Error('las columnas por día son ' + columnas);
  const ancho = await p.locator('app-columnas-dia .pila').first().evaluate(el => el.clientHeight);
  if (!ancho) throw new Error('la columna no tiene alto');
});

await paso('semana: la tabla de números existe (accesibilidad)', async () => {
  await p.click('button:has-text("Ver números")');
  await p.waitForSelector('table tbody tr');
  if ((await p.locator('table tbody tr').count()) !== 8) throw new Error('la tabla no lista las 8 categorías');
});

await paso('semana: tocar un día muestra su detalle', async () => {
  await p.locator('app-columnas-dia .col').nth(2).click();
  await p.waitForSelector('app-columnas-dia .detalle');
});

await paso('el ritual: cierra la semana que termina', async () => {
  await p.goto(URL + '#/ritual');
  await p.waitForSelector('text=¿Qué pasó con los 3 objetivos?');
  // se cumplió uno de los tres; los otros dos quedan sin cumplir
  await p.locator('.objetivo:has-text("Cerrar exclusividad Curitiba") .marca').click();
  await p.fill('textarea', 'Semana comida por reuniones.');
  await p.click('button:has-text("Cerrar la semana")');
  await p.waitForSelector('text=Cómo se te fue la semana');
});

await paso('el ritual: muestra los números antes de dejarte planificar', async () => {
  const t = await p.textContent('main');
  if (!t.includes('Días con cierre')) throw new Error('falta el resumen de la semana');
  if (!t.includes('Ejecución operativa')) throw new Error('faltan los umbrales');
  await p.click('button:has-text("Armar la que viene")');
  await p.waitForSelector('text=Tres objetivos para la semana');
});

await paso('el ritual: lo no cumplido vuelve como candidato y se guarda el plan', async () => {
  // el cumplido no vuelve…
  if (await p.locator('.chip:has-text("Cerrar exclusividad Curitiba")').count()) {
    throw new Error('un objetivo ya cumplido volvió como candidato');
  }
  // …y el que quedó a medias sí, con la flecha de arrastre
  const chip = p.locator('.chip:has-text("Ordenar pipeline de Construcción")');
  if (!(await chip.count())) throw new Error('el objetivo sin cumplir no volvió como candidato');
  await chip.click();
  await p.waitForSelector('.objetivo:has-text("Ordenar pipeline de Construcción")');
  await p.click('button:has-text("Guardar la semana")');
  await p.waitForSelector('text=Umbrales de control');   // vuelve a Semana
});

await paso('prueba: lo anterior a la instalación no reclama nada', async () => {
  await p.goto(URL + '#/prueba');
  await p.waitForSelector('h1:has-text("Prueba de rol")');
  const t = await p.textContent('main');
  // La revisión del 14/08 es anterior al primer uso: no puede ser una deuda.
  if (t.includes('Vencida sin registrar')) throw new Error('reclama una revisión anterior al arranque');
  if (!t.includes('Antes de que empezaras a usar la app')) throw new Error('no la marcó como previa');
  if (!/Faltan \d+ días|Es hoy|Pasaron/.test(t)) throw new Error('no hay cuenta atrás');
});

await paso('prueba: con la fecha de arranque atrasada, la revisión sí vence', async () => {
  await p.goto(URL + '#/config');
  await p.fill('.arranque input[type="date"]', '2026-08-01');
  await p.goto(URL + '#/prueba');
  await p.waitForSelector('text=Prueba en riesgo');
  const t = await p.textContent('main');
  if (!t.includes('Vencida sin registrar')) throw new Error('no marcó la revisión del 14/08');
  // Y vuelta a dejarlo como estaba para los pasos que siguen.
  await p.goto(URL + '#/config');
  await p.click('.arranque button:has-text("Volver al primer día")');
  await p.waitForSelector('.arranque button:has-text("Empezar a contar desde hoy")');
});

await paso('prueba: registrar una revisión con el checklist', async () => {
  await p.goto(URL + '#/prueba');
  await p.waitForSelector('h1:has-text("Prueba de rol")');
  await p.locator('.tarjeta:has-text("viernes 21 de agosto") button').click();
  await p.waitForSelector('dialog[open] .senal');
  await p.locator('dialog[open] .senal').nth(0).locator('.chip:has-text("Sí")').click();
  await p.locator('dialog[open] .chip:has-text("Se mantiene o sube")').click();
  await p.locator('dialog[open] .chip:has-text("Resueltos")').click();
  await p.locator('dialog[open] .chip:has-text("No, decide")').click();
  const nums = p.locator('dialog[open] input[type=number]');
  await nums.nth(0).fill('0');
  await nums.nth(1).fill('2');
  await p.click('dialog[open] .pie .btn.primario');
  await sinDialogo();
  await p.waitForSelector('.tarjeta:has-text("viernes 21 de agosto"):has-text("Registrada")');
});

await paso('actas: rechaza dos responsables', async () => {
  await p.goto(URL + '#/actas');
  await p.click('button:has-text("Registrar reunión")');
  await p.fill('dialog[open] input[type=text]', 'Directorio semanal');
  await p.click('dialog[open] .pie .btn.primario');
  await sinDialogo();
  await p.waitForSelector('text=Sin acta');
  await p.locator('.tarjeta:has-text("Directorio semanal") button:has-text("Escribir acta")').first().click();
  await p.fill('dialog[open] input[list=personas]', 'Luciana y Seba');
  await p.locator('dialog[open] .decision input[type=text]').first().fill('Definir margen de cielorrasos');
  await p.fill('dialog[open] input[type=date]', '2026-08-28');
  await p.click('dialog[open] .pie .btn.primario');
  await p.waitForSelector('dialog[open] .error');
});

await paso('actas: acepta un responsable único y deja el compromiso abierto', async () => {
  await p.fill('dialog[open] input[list=personas]', 'Luciana Dalzotto');
  await p.click('dialog[open] .pie .btn.primario');
  await sinDialogo();
  await p.waitForSelector('text=Compromisos abiertos (1)');
});

await paso('actas: un compromiso tuyo cae solo en la bandeja', async () => {
  await p.goto(URL + '#/actas');
  await p.click('button:has-text("Registrar reunión")');
  await p.fill('dialog[open] input[type=text]', 'Comité de precios');
  await p.click('dialog[open] .pie .btn.primario');
  await p.locator('.tarjeta:has-text("Comité de precios") button:has-text("Escribir acta")').first().click();
  await p.locator('dialog[open] .decision input[type=text]').first().fill('Revisar el esquema de comisiones');
  await p.fill('dialog[open] input[list=personas]', 'Emmanuel Van Breedam');
  await p.fill('dialog[open] input[type=date]', '2026-08-31');
  await p.click('dialog[open] .pie .btn.primario');
  await sinDialogo();
  await p.waitForSelector('text=fueron a la bandeja');
  await p.goto(URL + '#/pendientes');
  await p.waitForSelector('.pendiente:has-text("esquema de comisiones")');
});

await paso('delegar: agrupa por dueño lo que no era tuyo', async () => {
  await p.goto(URL + '#/delegar');
  await p.waitForSelector('text=Tabla de delegación (fija)');
  const t = await p.textContent('main');
  if (!t.includes('Comercial de la unidad')) throw new Error('no listó la derivación');
});

await paso('las otras pantallas abren sin romperse', async () => {
  for (const r of ['reglas', 'indicadores', 'ajustes', 'docs']) {
    await p.goto(URL + '#/' + r);
    await p.waitForSelector('main .tarjeta', { timeout: 5000 });
  }
});

await paso('documentos: lee un PDF de Drive y lo deja buscable', async () => {
  // Contexto propio con los service workers bloqueados: el de la app captura
  // los fetch y la intercepción de Playwright nunca los vería. Se responde a
  // la API de Drive desde acá para recorrer el camino real —listar, bajar,
  // extraer el texto, indexar y buscar— sin red ni cuenta de Google.
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p2 = await ctx2.newPage();
  const ID = 'archivo-pdf-1';
  try {
    await p2.route('**/drive/v3/files?*', r => r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ files: [{
        id: ID, name: 'Manual de Gestión Comercial.pdf', mimeType: 'application/pdf',
        modifiedTime: '2026-08-01T10:00:00Z',
      }] }),
    }));
    await p2.route('**/drive/v3/files/' + ID + '?alt=media*', r => r.fulfill({
      status: 200, contentType: 'application/pdf', body: Buffer.from(PDF_B64, 'hex'),
    }));
    // Con permiso guardado, la agenda importa sola: si este pedido no se
    // responde acá, sale a la red de verdad y la página nunca termina de cargar.
    await p2.route('**/calendar/v3/**', r => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }),
    }));

    // permiso de Google ya concedido y guardado en el dispositivo
    await p2.goto(URL + '#/docs', { waitUntil: 'networkidle' });
    await p2.evaluate(async () => {
      const db = await new Promise(res => {
        const q = indexedDB.open('emma-planner', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('kv');
        q.onsuccess = () => res(q.result);
      });
      const poner = (k, v) => new Promise(res => {
        const t = db.transaction('kv', 'readwrite');
        t.objectStore('kv').put(v, k);
        t.oncomplete = res;
      });
      await poner('drive:token', { access_token: 'de-prueba', expira: Date.now() + 3600_000 });
      await poner('ajustes', { driveClientId: 'de-prueba.apps.googleusercontent.com' });
    });
    await p2.reload({ waitUntil: 'networkidle' });

    await p2.click('button:has-text("Traer documentos")');
    await p2.waitForSelector('text=Manual de Gestión Comercial.pdf', { timeout: 40000 });
    await p2.waitForSelector('text=/caracteres indexados/', { timeout: 40000 });

    // y el texto que estaba adentro del PDF ahora se busca
    await p2.fill('input[placeholder="Preguntá: ¿qué dice la Ficha de Rol sobre…?"]', 'margen cielorrasos');
    await p2.click('button[aria-label="Buscar"]');
    await p2.waitForSelector('mark:has-text("cielorrasos")', { timeout: 20000 });
    const t = await p2.textContent('main');
    if (!t.includes('38 por ciento')) throw new Error('no encontró el texto que estaba dentro del PDF');
  } finally {
    await ctx2.close();
  }
});

await paso('configuración: abre desde el menú y todo arranca de fábrica', async () => {
  await p.goto(URL + '#/hoy');
  await p.click('button[aria-label="Más pantallas"]');
  await p.click('.menu a[href="#/config"]');
  await p.waitForSelector('h1:has-text("Configuración")');
  // El menú tiene una sola entrada de configuración: no hay dos lugares.
  if (await p.locator('.menu a[href="#/ajustes"]').count()) throw new Error('quedó Ajustes suelto en el menú');
  const secciones = await p.locator('[data-seccion]').count();
  if (secciones < 9) throw new Error('faltan secciones: ' + secciones);
  const fabrica = await p.locator('.marca.fabrica').count();
  if (fabrica !== secciones) throw new Error('alguna sección no arranca de fábrica');
});

await paso('configuración: la fecha de arranque se fija desde la app', async () => {
  await p.goto(URL + '#/config');
  await p.click('button:has-text("Empezar a contar desde hoy")');
  await p.waitForSelector('dialog[open]');
  await p.click('dialog[open] button:has-text("Sí, arrancar hoy")');
  await sinDialogo();
  await p.waitForSelector('.arranque:has-text("La app cuenta desde el")');
  const valor = await p.inputValue('.arranque input[type="date"]');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error('no guardó la fecha: ' + valor);
});

await paso('configuración: la regla 3.3 no se puede apagar', async () => {
  await abrirSeccion('delegacion');
  await p.waitForSelector('[data-fila="pedidos"]');
  // Carga de pedidos es forzada: no hay selector de categoría, hay candado.
  if (await p.locator('[data-fila="pedidos"] [data-campo="categoria"]').count() !== 0) {
    throw new Error('deja cambiar la categoría de una fila forzada');
  }
  await p.waitForSelector('[data-fila="pedidos"] .clavada');
  // Compras de oficina no es forzada: esa sí se puede recategorizar.
  if (await p.locator('[data-fila="compras_oficina"] [data-campo="categoria"]').count() !== 1) {
    throw new Error('no deja cambiar la categoría de una fila común');
  }
});

await paso('configuración: cambiar el dueño cambia a quién te manda la app', async () => {
  await abrirSeccion('delegacion');
  await p.waitForSelector('[data-fila="bancos"]');
  await p.selectOption('[data-fila="bancos"] [data-campo="dueno"]', 'potte');
  await p.click('[data-seccion="delegacion"] button:has-text("Guardar")');
  await p.waitForSelector('[data-seccion="delegacion"] .marca:not(.fabrica)');

  await p.goto(URL + '#/hoy');
  await p.waitForSelector('input[placeholder="Agregar prioridad…"]');
  await p.fill('input[placeholder="Agregar prioridad…"]', 'ir al banco a la mañana');
  await p.click('button[aria-label="Agregar"]');
  await p.waitForSelector('dialog[open] h2:has-text("NO ES TUYA")');
  const t = await p.textContent('dialog[open]');
  if (!t.includes('Potte')) throw new Error('sigue mandando al dueño viejo: ' + t.slice(0, 120));
  await p.click('dialog[open] button:has-text("Reescribir")');
  await sinDialogo();
});

await paso('configuración: volver al original deshace el cambio', async () => {
  await abrirSeccion('delegacion');
  await p.click('[data-seccion="delegacion"] button:has-text("Volver al original")');
  await p.waitForSelector('dialog[open]');
  await p.click('dialog[open] button.peligro:has-text("Volver al original")');
  await sinDialogo();
  await p.waitForSelector('[data-seccion="delegacion"] .marca.fabrica');

  await p.goto(URL + '#/hoy');
  await p.waitForSelector('input[placeholder="Agregar prioridad…"]');
  await p.fill('input[placeholder="Agregar prioridad…"]', 'ir al banco a la mañana');
  await p.click('button[aria-label="Agregar"]');
  await p.waitForSelector('dialog[open] h2:has-text("NO ES TUYA")');
  const t = await p.textContent('dialog[open]');
  if (!t.includes('Leila')) throw new Error('no volvió al dueño de fábrica: ' + t.slice(0, 120));
  await p.click('dialog[open] button:has-text("Reescribir")');
  await sinDialogo();
});

await paso('configuración: un umbral editado cambia el semáforo', async () => {
  await abrirSeccion('umbrales');
  await p.waitForSelector('[data-seccion="umbrales"] input[type="number"]');
  const piso = p.locator('[data-seccion="umbrales"] input[type="number"]').nth(4); // rolPiso
  await piso.fill('90');
  await p.click('[data-seccion="umbrales"] button:has-text("Guardar")');
  await p.waitForSelector('[data-seccion="umbrales"] .marca:not(.fabrica)');
  await p.goto(URL + '#/semana');
  await p.waitForSelector('text=Venta y clientes + Estrategia');
  const t = await p.textContent('main');
  if (!t.includes('90%')) throw new Error('el semáforo sigue mostrando el umbral viejo');
});

await paso('configuración: se puede poner a alguien nuevo a prueba', async () => {
  await abrirSeccion('pruebas');
  const habia = await p.locator('[data-prueba]').count();
  await p.click('[data-seccion="pruebas"] button:has-text("+ Poner a alguien a prueba")');
  // Esperar a que la fila nueva esté dibujada: escribir antes de eso deja lo
  // tipeado en el aire, porque el siguiente render lo pisa.
  await p.waitForFunction(n => document.querySelectorAll('[data-prueba]').length === n,
                          habia + 1, { timeout: 10000 });
  const nueva = p.locator('[data-prueba]').last();
  await nueva.locator('input[placeholder="Quién"]').fill('Marina Gómez');
  await p.waitForFunction(() => {
    const c = document.querySelectorAll('[data-prueba] input[placeholder="Quién"]');
    return c[c.length - 1]?.value === 'Marina Gómez';
  }, null, { timeout: 10000 });
  const revisiones = await nueva.locator('.fecha').count();
  if (revisiones < 3) throw new Error('no calculó los viernes del rango: ' + revisiones);
  await p.click('[data-seccion="pruebas"] button:has-text("Guardar")');
  await p.waitForSelector('[data-seccion="pruebas"] .marca:not(.fabrica)');
  await p.goto(URL + '#/prueba');
  await p.waitForSelector('h1:has-text("Prueba de rol")');
  const t = await p.textContent('main');
  if (!t.includes('Marina')) throw new Error('la pantalla no muestra la prueba nueva');
});

await paso('configuración: se puede dejar todo como venía', async () => {
  await p.goto(URL + '#/config');
  await p.click('button:has-text("Volver todas las reglas al original")');
  await p.waitForSelector('dialog[open]');
  await p.click('dialog[open] button.peligro:has-text("Volver al original")');
  await sinDialogo();
  const editadas = await p.locator('.marca:not(.fabrica)').count();
  if (editadas !== 0) throw new Error('quedaron secciones editadas: ' + editadas);
});

await paso('el instructivo abre desde el menú y los desplegables funcionan', async () => {
  await p.goto(URL + '#/hoy');
  await p.click('button[aria-label="Más pantallas"]');
  await p.click('.menu a[href="#/ayuda"]');
  await p.waitForSelector('h1:has-text("Cómo se usa")');
  const t = await p.textContent('main');
  if (!t.includes('¿qué te comió más horas hoy?')) throw new Error('falta el cierre de jornada');
  if (!t.includes('NO ES TUYA')) throw new Error('falta la explicación del bloqueo');
  await p.locator('.duda button').first().click();
  await p.waitForSelector('.duda p');
});

await paso('configuración: hay botón de actualización manual', async () => {
  await p.goto(URL + '#/config');
  await p.waitForSelector('text=Versión de la app');
  const publicada = await p.textContent('.tarjeta:has-text("Publicada")');
  if (!/Publicada: \d/.test(publicada)) throw new Error('no muestra la fecha de la versión publicada');
  await p.click('button:has-text("Buscar ahora")');
  await p.locator('text=Ya tenés la última versión')
    .or(p.locator('text=Hay una versión nueva'))
    .first().waitFor({ timeout: 20000 });
});

await paso('configuración: muestra la dirección exacta que Google tiene que autorizar', async () => {
  await p.goto(URL + '#/config');
  await p.click('button:has-text("redirect_uri_mismatch")');
  const campos = p.locator('input[readonly]');
  const uri = await campos.nth(0).inputValue();
  const origen = await campos.nth(1).inputValue();
  // Son dos listas distintas de la consola de Google y no son intercambiables:
  // la de vuelta lleva la carpeta y la barra final, el origen no lleva ninguna.
  if (!uri.endsWith('/')) throw new Error('la dirección de vuelta tiene que terminar en barra: ' + uri);
  if (origen.endsWith('/')) throw new Error('el origen no lleva barra final: ' + origen);
  if (!uri.startsWith(origen + '/')) throw new Error(`no cuelgan del mismo origen: ${uri} / ${origen}`);
  if (!/^https?:\/\//.test(origen)) throw new Error('el origen no es una dirección: ' + origen);
});

await paso('configuración: probar la conexión dice qué falta, en un toque', async () => {
  await p.goto(URL + '#/config');
  await p.click('button:has-text("Probar la conexión con Google")');
  // Sin permiso en este aparato, la respuesta tiene que ser esa y no un error genérico.
  await p.waitForSelector('.tarjeta.alerta:has-text("no tiene permiso")', { timeout: 20000 });
  const t = await p.textContent('.tarjeta.alerta:has-text("no tiene permiso")');
  if (!t.includes('por aparato')) throw new Error('no explica que el permiso no viaja entre aparatos');
});

await paso('configuración: se puede cambiar el tema', async () => {
  await p.goto(URL + '#/config');
  await p.click('.chip:has-text("Oscuro")');
  await p.waitForFunction(() => document.documentElement.dataset.theme === 'oscuro');
});

await paso('el service worker queda registrado', async () => {
  await p.goto(URL + '#/hoy');
  const ok = await p.evaluate(async () => {
    for (let i = 0; i < 40; i++) {
      if (await navigator.serviceWorker.getRegistration()) return true;
      await new Promise(r => setTimeout(r, 250));
    }
    return false;
  });
  if (!ok) throw new Error('sin service worker');
});

await paso('funciona offline y conserva los datos', async () => {
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('text=Registrado. Esto es lo que quedó', { timeout: 10000 });
  await ctx.setOffline(false);
});

await b.close();
console.log('\n' + (errores.length ? 'PROBLEMAS:\n- ' + errores.join('\n- ') : 'sin errores de consola ni fallos'));
process.exit(errores.length ? 1 : 0);
