/**
 * e2e.mjs — Prueba de punta a punta en un navegador real.
 *
 *   npx http-server -p 8099 -c-1        (en otra terminal, desde la raíz del repo)
 *   npm i -D playwright && node tools/e2e.mjs
 *
 * Cubre las reglas que no se pueden romper sin darse cuenta: el bloqueo de la
 * tabla de delegación, el mapeo forzado a Ejecución Operativa, el rechazo de
 * actas con dos responsables, la revisión vencida de la prueba y el offline.
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

const paso = async (n, fn) => { try { await fn(); console.log('✓', n); } catch (e) { console.log('✗', n, '→', e.message.split('\n')[0]); errores.push(n + ': ' + e.message.split('\n')[0]); } };

await p.goto(URL, { waitUntil: 'networkidle' });

await paso('primer arranque: no inventa una racha que no existe', async () => {
  await p.waitForSelector('#vista .seccion-titulo');
  const t = await p.textContent('#vista');
  if (/d[ií]as h[áa]biles sin cierre/.test(t)) throw new Error('mostró racha en el primer uso');
});

await paso('carga la pantalla Hoy', async () => {
  await p.waitForSelector('#vista .seccion-titulo');
  const t = await p.textContent('#titulo-vista');
  if (t.trim() !== 'Hoy') throw new Error('título = ' + t);
});

await paso('bloquea una prioridad de la tabla de delegación', async () => {
  await p.fill('input[placeholder="Agregar prioridad…"]', 'cargar el presupuesto de Ruiz');
  await p.click('button.btn.primario:near(input[placeholder="Agregar prioridad…"])');
  await p.waitForSelector('.modal h3');
  const t = await p.textContent('.modal h3');
  if (!t.includes('NO ES TUYA')) throw new Error('modal dice: ' + t);
  const cuerpo = await p.textContent('.modal');
  if (!cuerpo.includes('Comercial de la unidad')) throw new Error('no nombra al dueño');
});

await paso('deriva la tarea al dueño', async () => {
  await p.click('.modal-acciones .btn.primario');
  await p.waitForSelector('#toast.visible');
});

await paso('acepta una prioridad que sí es tuya', async () => {
  await p.fill('input[placeholder="Agregar prioridad…"]', 'negociar exclusividad con la fábrica de Curitiba');
  await p.click('button.btn.primario:near(input[placeholder="Agregar prioridad…"])');
  await p.waitForSelector('text=negociar exclusividad');
  const t = await p.textContent('#vista');
  if (!t.includes('Prioridades de hoy (1/3)')) throw new Error('contador mal');
});

await paso('check-in de una frase → segmentos clasificados', async () => {
  await p.fill('textarea', 'Cargué pedidos toda la mañana y después tuve reunión de directorio');
  await p.click('button.btn.primario:has-text("Guardar")');
  await p.waitForSelector('.modal .segmento');
  const txt = await p.textContent('.modal');
  if (!txt.includes('NO ES TUYA')) throw new Error('no marcó la fuga');
  if (!txt.includes('Ejecución Operativa')) throw new Error('no aplicó la regla 3.3');
});

await paso('ajusta horas y confirma', async () => {
  await p.click('.modal .segmento:first-child .horas button:first-child');
  await p.click('.modal-acciones .btn.primario');
  await p.waitForSelector('text=Cierre registrado');
});



await paso('semana muestra los 4 umbrales con semáforo', async () => {
  await p.click('#tabs a[data-tab="semana"]');
  await p.waitForSelector('.umbral');
  const n = await p.locator('.umbral').count();
  if (n !== 4) throw new Error('umbrales = ' + n);
  const t = await p.textContent('#vista');
  for (const u of ['Marketing', 'Ejecución operativa', 'Venta y clientes + Estrategia', 'Reuniones internas'])
    if (!t.includes(u)) throw new Error('falta umbral ' + u);
  if (!t.includes('Horas que no eran tuyas')) throw new Error('falta sección de fugas');
});


await paso('prueba de Luciana marca la revisión vencida', async () => {
  await p.click('#tabs a[data-tab="prueba"]');
  await p.waitForSelector('text=Prueba en riesgo');
  const t = await p.textContent('#vista');
  if (!t.includes('Vencida sin registrar')) throw new Error('no marcó la revisión del 14/08');
});

await paso('registra una revisión con el checklist de señales', async () => {
  await p.click('.card:has-text("viernes 21 de agosto") button');
  await p.waitForSelector('.modal');
  await p.click('.modal .chip:has-text("Sí")');
  await p.click('.modal .chip:has-text("Se mantiene o sube")');
  await p.click('.modal .chip:has-text("Resueltos")');
  await p.click('.modal .chip:has-text("No, decide")');
  const nums = p.locator('.modal input[type=number]');
  await nums.nth(0).fill('0');
  await nums.nth(1).fill('2');
  await p.click('.modal-acciones .btn.primario');
  await p.waitForSelector('.card:has-text("viernes 21 de agosto"):has-text("Registrada")');
});


await paso('acta: rechaza dos responsables', async () => {
  await p.click('#tabs a[data-tab="actas"]');
  await p.click('button:has-text("Registrar reunión")');
  await p.fill('.modal input[type=text]', 'Directorio semanal');
  await p.click('.modal-acciones .btn.primario');
  await p.waitForSelector('text=Sin acta');
  await p.click('button:has-text("Escribir acta")');
  await p.fill('.modal input[placeholder="Qué se decidió"]', 'Definir margen mínimo de cielorrasos');
  await p.fill('.modal input[placeholder="Quién lo hace (un solo nombre)"]', 'Luciana y Seba');
  await p.fill('.modal input[type=date]', '2026-08-28');
  await p.click('.modal-acciones .btn.primario');
  await p.waitForSelector('text=Un solo nombre por tarea');
});

await paso('acta: acepta un responsable único y la cierra', async () => {
  await p.click('.modal-acciones .btn.primario');           // "Corregir" reabre el acta
  await p.waitForSelector('.modal input[placeholder="Quién lo hace (un solo nombre)"]');
  await p.fill('.modal input[placeholder="Quién lo hace (un solo nombre)"]', 'Luciana Dalzotto');
  await p.click('.modal-acciones .btn.primario');
  await p.waitForSelector('text=Compromisos abiertos (1)');
});


await paso('docs explica que falta el Client ID', async () => {
  await p.click('#tabs a[data-tab="docs"]');
  await p.waitForSelector('text=Falta conectar Drive');
});

await paso('las otras pantallas abren sin romperse', async () => {
  for (const r of ['delegar', 'reglas', 'indicadores', 'ajustes']) {
    await p.goto(URL + '#/' + r);
    await p.waitForFunction(() => document.querySelector('#titulo-vista').textContent.trim() !== '', null, { timeout: 4000 });
    await p.waitForSelector('#vista .card, #vista .vacio', { timeout: 4000 });
    const t = await p.textContent('#vista');
    if (t.includes('Algo se rompió')) throw new Error('rompió en ' + r);
  }
});

await paso('menú Más lleva a las pantallas secundarias', async () => {
  await p.click('#btn-mas');
  await p.waitForSelector('.modal:has-text("Para delegar")');
  await p.click('.modal a[href="#/delegar"]');
  await p.waitForFunction(() => document.querySelector('#titulo-vista').textContent.includes('delegar'));
  const t = await p.textContent('#vista');
  if (!t.includes('Comercial de la unidad')) throw new Error('no listó la derivación');
  if (!t.includes('Tabla de delegación')) throw new Error('no muestra la tabla de referencia');
});

await paso('indicadores: guarda el mes', async () => {
  await p.goto(URL + '#/indicadores');
  await p.waitForSelector('button:has-text("Cargar agosto 2026")');
  await p.click('button:has-text("Cargar agosto 2026")');
  await p.waitForSelector('.modal input[type=month]');
  const n = p.locator('.modal input[type=number]');
  await n.nth(0).fill('4200000'); await n.nth(1).fill('7'); await n.nth(2).fill('1850000');
  await p.click('.modal-acciones .btn.primario');
  await p.waitForSelector('text=Margen bruto consolidado mensual');
  const t = await p.textContent('#vista');
  if (!t.includes('4.200.000')) throw new Error('no formateó/guardó el margen: ' + t.slice(0, 120));
});

await paso('el service worker queda registrado', async () => {
  const ok = await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return Boolean(r);
  });
  if (!ok) throw new Error('sin SW');
});

await paso('funciona offline', async () => {
  await ctx.setOffline(true);
  await p.goto(URL + '#/hoy');
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('text=Cierre registrado', { timeout: 8000 });
  const t = await p.textContent('#vista');
  if (!t.includes('Prioridades de hoy')) throw new Error('no renderizó offline');
  await ctx.setOffline(false);
});

await b.close();
console.log('\n' + (errores.length ? 'PROBLEMAS:\n- ' + errores.join('\n- ') : 'sin errores de consola ni fallos'));
process.exit(errores.length ? 1 : 0);
