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

const paso = async (n, fn) => {
  try { await fn(); console.log('✓', n); }
  catch (e) {
    const m = String(e.message).split('\n').slice(0, 2).join(' | ');
    console.log('✗', n, '→', m);
    if (process.env.DEBUG_E2E && errores.length === 0) {
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

await paso('prueba de Luciana: revisión vencida y cuenta atrás', async () => {
  await p.goto(URL + '#/prueba');
  await p.waitForSelector('text=Prueba en riesgo');
  const t = await p.textContent('main');
  if (!t.includes('Vencida sin registrar')) throw new Error('no marcó la revisión del 14/08');
  if (!/Faltan \d+ días|Es hoy|Pasaron/.test(t)) throw new Error('no hay cuenta atrás');
});

await paso('prueba: registrar una revisión con el checklist', async () => {
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

await paso('ajustes: hay botón de actualización manual', async () => {
  await p.goto(URL + '#/ajustes');
  await p.waitForSelector('text=Versión de la app');
  const publicada = await p.textContent('.tarjeta:has-text("Publicada")');
  if (!/Publicada: \d/.test(publicada)) throw new Error('no muestra la fecha de la versión publicada');
  await p.click('button:has-text("Buscar ahora")');
  await p.locator('text=Ya tenés la última versión')
    .or(p.locator('text=Hay una versión nueva'))
    .first().waitFor({ timeout: 20000 });
});

await paso('ajustes: se puede cambiar el tema', async () => {
  await p.goto(URL + '#/ajustes');
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
