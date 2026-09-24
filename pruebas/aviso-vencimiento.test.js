/**
 * EL AVISO DE QUE SE VENCE EL PLAN (107).
 *
 * Dos partes:
 *
 *   1. La base (PGlite): `vencimientos_por_avisar()` elige bien a quién y
 *      cuándo —3 días, 1 y el día; al que paga y a la prueba; nunca al plan
 *      gratis, al que ya dijo que no renueva ni al vendedor—, con el precio
 *      de lista en guaraníes y solo para service_role.
 *   2. Lo que se dice (lib/aviso-vencimiento.ts + los textos es/pt): el
 *      precio en guaraníes, ningún número cuando no hay precio, la clave de
 *      «una sola vez», el enlace para pagar y el nombre del negocio escapado.
 *
 * La segunda parte transpila los dos .ts acá mismo (typescript ya está en el
 * proyecto): así esta prueba no depende de que otro paso los compile.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const H = require('./ayuda-db.js');

let fallos = 0;
let corridas = 0;
function grupo(nombre) {
  console.log(`\n── ${nombre} ${'─'.repeat(Math.max(0, 58 - nombre.length))}`);
}
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a}`);
}

/** Carga un .ts de src transpilado a CommonJS. `@/…` apunta a src/…. */
function cargarTs(relativo, reemplazos = {}) {
  const archivo = path.join(__dirname, '..', relativo);
  const fuente = fs.readFileSync(archivo, 'utf8');
  const salida = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const m = new Module(archivo, module);
  m.filename = archivo;
  m.paths = Module._nodeModulePaths(path.dirname(archivo));
  const requerirOriginal = m.require.bind(m);
  m.require = (id) => (id in reemplazos ? reemplazos[id] : requerirOriginal(id));
  m._compile(salida, archivo);
  return m.exports;
}

(async () => {
  // =====================================================================
  grupo('1 · Quién vence y cuándo (vencimientos_por_avisar)');
  // =====================================================================
  const db = await H.crearBase();

  const leer = () => H.comoServicio(db, () =>
    db.query('select public.vencimientos_por_avisar() l').then((x) => x.rows[0].l));
  const de = async (empresaId) => (await leer()).find((x) => x.empresa_id === empresaId);

  // A las 23:59 del día que toca, en Asunción: que no dependa de la hora a la
  // que corre la prueba (mismo truco que habito.test.js con la 071).
  const venceEn = (empresaId, dias, estado = 'activa', plan = 'pro') => db.query(
    `update public.suscripciones set estado = $3, plan = $4,
       periodo_fin = (((now() at time zone 'America/Asuncion')::date + $2::int)::timestamp
                      + interval '23 hours 59 minutes') at time zone 'America/Asuncion'
     where empresa_id = $1`, [empresaId, dias, estado, plan]);

  const precioLista = async (tipo, plan, periodo) => {
    const r = await db.query(
      `select importe from public.precios
       where tipo_cuenta = $1 and plan = $2 and periodo = $3 and moneda = 'PYG' and activo limit 1`,
      [tipo, plan, periodo]);
    return r.rows[0] ? Number(r.rows[0].importe) : null;
  };

  const A = await H.montarEmpresa(db, { email: 'duenio@alfa.com', nombre: 'Alfa' });
  const vendedorA = await H.sumarMiembro(db, A.empresaId, 'vendedor@alfa.com', 'vendedor');
  const adminA = await H.sumarMiembro(db, A.empresaId, 'admin@alfa.com', 'admin');
  await db.query(`update public.suscripciones set periodo = 'mensual', cancela_al_vencer = false where empresa_id = $1`,
    [A.empresaId]);

  await venceEn(A.empresaId, 5);
  ok('con cinco días por delante todavía no se avisa', Boolean(await de(A.empresaId)), false);
  await venceEn(A.empresaId, 3);
  ok('faltando tres días, sí', (await de(A.empresaId))?.dias, 3);
  ok('y es un vencimiento del período pago', (await de(A.empresaId))?.tipo, 'periodo');
  await venceEn(A.empresaId, 2);
  ok('faltando dos no, para no escribirle todos los días', Boolean(await de(A.empresaId)), false);
  await venceEn(A.empresaId, 1);
  ok('faltando uno, sí', (await de(A.empresaId))?.dias, 1);
  await venceEn(A.empresaId, 0);
  ok('el día, sí', (await de(A.empresaId))?.dias, 0);

  const a = await de(A.empresaId);
  ok('la fecha de fin va en la zona del negocio',
    a.fecha_fin, (await db.query(`select ((now() at time zone 'America/Asuncion')::date)::text d`)).rows[0].d);
  ok('trae el plan y el período', [a.plan, a.periodo], ['pro', 'mensual']);
  ok('el precio es el de lista en guaraníes', [Number(a.precio), a.moneda],
    [await precioLista('emprendedor', 'pro', 'mensual'), 'PYG']);
  ok('le llega al dueño y al administrador, no al vendedor',
    a.destinatarios.map((d) => d.user_id).sort(), [A.uid, adminA].sort());
  ok('con su correo', a.destinatarios.find((d) => d.user_id === A.uid).email, 'duenio@alfa.com');
  ok('el vendedor no está', a.destinatarios.some((d) => d.user_id === vendedorA), false);

  // El idioma de cada persona.
  await H.comoUsuario(db, adminA, () => db.query(`select public.guardar_preferencias('pt')`));
  ok('el idioma sale de las preferencias de cada uno',
    (await de(A.empresaId)).destinatarios.find((d) => d.user_id === adminA).idioma, 'pt');
  ok('sin preferencias, español',
    (await de(A.empresaId)).destinatarios.find((d) => d.user_id === A.uid).idioma, 'es');

  // El período pago que venció HOY a la madrugada sigue avisándose: «vence
  // hoy» es verdad y es cuando más sirve.
  await db.query(
    `update public.suscripciones set periodo_fin = (now() at time zone 'America/Asuncion')::date::timestamp
       at time zone 'America/Asuncion' where empresa_id = $1`, [A.empresaId]);
  ok('vencido hoy a las 00:00, el aviso del día sale igual', (await de(A.empresaId))?.dias, 0);

  // Anual: el precio anual.
  await venceEn(A.empresaId, 3);
  await db.query(`update public.suscripciones set periodo = 'anual' where empresa_id = $1`, [A.empresaId]);
  ok('un plan anual trae el precio anual',
    Number((await de(A.empresaId)).precio), await precioLista('emprendedor', 'pro', 'anual'));
  // `periodo` es not null en la tabla; el coalesce a mensual de la 107 es
  // solo resguardo.
  await db.query(`update public.suscripciones set periodo = 'mensual' where empresa_id = $1`, [A.empresaId]);

  // Sin precio de lista: null, nunca un cero.
  await db.query(`update public.precios set activo = false
    where tipo_cuenta = 'emprendedor' and plan = 'pro' and periodo = 'mensual' and moneda = 'PYG'`);
  ok('sin precio de lista activo, el precio es null', (await de(A.empresaId)).precio, null);
  await db.query(`update public.precios set activo = true
    where tipo_cuenta = 'emprendedor' and plan = 'pro' and periodo = 'mensual' and moneda = 'PYG'`);

  // A quién no.
  await db.query(`update public.suscripciones set cancela_al_vencer = true where empresa_id = $1`, [A.empresaId]);
  ok('al que ya dijo que no renueva no se le pide que pague', Boolean(await de(A.empresaId)), false);
  await db.query(`update public.suscripciones set cancela_al_vencer = false where empresa_id = $1`, [A.empresaId]);
  await venceEn(A.empresaId, 3, 'activa', 'gratis');
  ok('el plan gratis no vence nada que pagar', Boolean(await de(A.empresaId)), false);
  await venceEn(A.empresaId, 3, 'vencida', 'pro');
  ok('una cuenta ya vencida no entra', Boolean(await de(A.empresaId)), false);
  await venceEn(A.empresaId, 3, 'morosa', 'pro');
  ok('una morosa tampoco', Boolean(await de(A.empresaId)), false);

  // La prueba: mismas cuentas que el push de la 071.
  await venceEn(A.empresaId, 1, 'prueba', 'pro');
  ok('la prueba que termina mañana entra como prueba', (await de(A.empresaId))?.tipo, 'prueba');
  const lista071 = await H.comoServicio(db, () =>
    db.query('select public.pruebas_por_terminar() l').then((x) => x.rows[0].l));
  ok('y es la misma cuenta que avisa el push de la 071',
    lista071.some((x) => x.empresa_id === A.empresaId), true);
  await db.query(`update public.suscripciones set periodo_fin = now() - interval '1 second'
    where empresa_id = $1`, [A.empresaId]);
  ok('la prueba que ya terminó no se avisa (igual que la 071)', Boolean(await de(A.empresaId)), false);

  // La cuenta personal: su propio precio.
  const P = await H.montarEmpresa(db, { email: 'yo@personal.com', nombre: 'Mis finanzas', tipoCuenta: 'personal' });
  await venceEn(P.empresaId, 3, 'activa', 'pro');
  await db.query(`update public.suscripciones set periodo = 'mensual' where empresa_id = $1`, [P.empresaId]);
  ok('la cuenta personal trae el precio de la cuenta personal',
    Number((await de(P.empresaId)).precio), await precioLista('personal', 'pro', 'mensual'));

  // Solo service_role.
  const r = await H.intentar(db, A.uid, () => db.query('select public.vencimientos_por_avisar()'));
  ok('un cliente no puede pedir la lista de todos', r.ok, false);
  ok('lo rechaza por permiso', /denied|permission/i.test(r.error ?? ''), true);
  const anon = await H.intentarComo(db, 'anon', null, () => db.query('select public.vencimientos_por_avisar()'));
  ok('anon tampoco', anon.ok, false);

  // Idempotente: se vuelve a aplicar sin romper.
  await H.aplicarMigracion(db, '107');
  ok('la migración se aplica dos veces', Boolean(await de(P.empresaId)), true);

  // =====================================================================
  grupo('2 · Lo que se dice (lib/aviso-vencimiento.ts, es y pt)');
  // =====================================================================
  const L = cargarTs('src/lib/aviso-vencimiento.ts');
  const T = cargarTs('src/i18n/textos/aviso-vencimiento.ts', { '@/lib/aviso-vencimiento': L });
  const es = T.avisoVencimientoEs;
  const pt = T.avisoVencimientoPt;

  const base = {
    tipo: 'periodo', empresa_id: 'e1', nombre: 'Pizzería Sur', tipo_cuenta: 'emprendedor',
    plan: 'pro', periodo: 'mensual', fin: '2026-09-28T02:59:00Z', fecha_fin: '2026-09-27', dias: 3,
    moneda: 'PYG', precio: 190000, destinatarios: [],
  };
  const yo = { user_id: 'u1', idioma: 'es', nombre: 'Matías', email: 'm@x.com' };

  ok('el precio va en guaraníes, sin decimales', L.precioEnGuaranies(190000, 'es-PY'), 'Gs. 190.000');
  ok('con el período', L.precioDelPlan(base, es, 'es-PY'), 'Gs. 190.000 por mes');
  ok('anual dice por año', L.precioDelPlan({ ...base, periodo: 'anual' }, es, 'es-PY'), 'Gs. 190.000 por año');
  ok('sin precio, nada', L.precioDelPlan({ ...base, precio: null }, es, 'es-PY'), null);
  ok('precio cero tampoco es dato', L.precioDelPlan({ ...base, precio: 0 }, es, 'es-PY'), null);
  ok('la fecha, sin año', L.fechaDelAviso('2026-09-27', 'es-PY'), '27 de septiembre');
  ok('en portugués', L.fechaDelAviso('2026-09-27', 'pt-BR'), '27 de setembro');
  ok('Premium es el plan negocio', L.nombreDelPlan('negocio', es), 'Premium');

  const push = L.pushDeVencimiento(base, es, 'es-PY');
  ok('el push dice cuántos días faltan', push.titulo, 'Tu plan de Orden vence en 3 días');
  ok('y cuánto cuesta', push.cuerpo.includes('Gs. 190.000 por mes'), true);
  ok('mañana', L.pushDeVencimiento({ ...base, dias: 1 }, es, 'es-PY').titulo, 'Tu plan de Orden vence mañana');
  ok('hoy', L.pushDeVencimiento({ ...base, dias: 0 }, es, 'es-PY').titulo, 'Tu plan de Orden vence hoy');
  ok('sin precio, el push no inventa un número',
    /Gs\.|\d/.test(L.pushDeVencimiento({ ...base, precio: null }, es, 'es-PY').cuerpo), false);
  ok('en portugués', L.pushDeVencimiento({ ...base, dias: 1 }, pt, 'pt-BR').titulo, 'Seu plano do Orden vence amanhã');

  // La clave de una sola vez.
  ok('push: una por cuenta, fecha y momento', L.claveDeEnvio(base, 'push'), 'vence:e1:2026-09-27:3');
  ok('correo: una por persona', L.claveDeEnvio(base, 'email', 'u1'), 'vence_correo:e1:u1:2026-09-27:3');
  ok('el correo de la prueba tiene su propia clave',
    L.claveDeEnvio({ ...base, tipo: 'prueba' }, 'email', 'u1'), 'prueba_correo:e1:u1:2026-09-27:3');
  ok('si paga y el período se corre, el próximo vencimiento vuelve a avisarse',
    L.claveDeEnvio({ ...base, fecha_fin: '2026-10-27' }, 'push') !== L.claveDeEnvio(base, 'push'), true);

  // El correo.
  const c = L.correoDeVencimiento(base, yo, es, 'es-PY', 'https://orden.com.py/');
  ok('el asunto dice el plan y cuándo', c.asunto, 'Tu plan Pro de Orden vence el 27 de septiembre');
  ok('el texto saluda por el nombre', c.texto.startsWith('Hola Matías,'), true);
  ok('dice el precio de renovación', c.texto.includes('Renovación: Gs. 190.000 por mes.'), true);
  ok('dice cómo pagar (una sola fuente)', c.texto.includes(es.comoPagar[L.COMO_SE_PAGA]), true);
  ok('hoy se paga por transferencia', L.COMO_SE_PAGA, 'transferencia');
  ok('el enlace lleva a /plan sin doble barra', c.texto.includes('https://orden.com.py/plan'), true);
  ok('el HTML también', c.html.includes('href="https://orden.com.py/plan"'), true);
  ok('el HTML dice el precio', c.html.includes('Gs. 190.000 por mes'), true);

  const sinPrecio = L.correoDeVencimiento({ ...base, precio: null }, yo, es, 'es-PY', 'https://orden.com.py');
  ok('sin precio, el correo no dice ningún monto', /Gs\./.test(sinPrecio.texto + sinPrecio.html), false);

  const malo = L.correoDeVencimiento({ ...base, nombre: '</td><script>x</script>' }, { ...yo, nombre: '<b>' },
    es, 'es-PY', 'https://orden.com.py');
  ok('el nombre del negocio va escapado', malo.html.includes('<script>'), false);
  ok('el de la persona también', malo.html.includes('Hola <b>'), false);

  const prueba = L.correoDeVencimiento({ ...base, tipo: 'prueba', dias: 1 }, yo, es, 'es-PY', 'https://orden.com.py');
  ok('el correo de la prueba', prueba.asunto, 'Tu prueba de Orden termina mañana, 27 de septiembre');
  ok('con el precio del plan', prueba.texto.includes('Plan Pro: Gs. 190.000 por mes.'), true);
  ok('y su botón', prueba.texto.includes('Activar mi plan: https://orden.com.py/plan'), true);

  const enPt = L.correoDeVencimiento({ ...base, dias: 0 }, { ...yo, idioma: 'pt' }, pt, 'pt-BR', 'https://orden.com.py');
  ok('en portugués', enPt.asunto, 'Seu plano Pro do Orden vence hoje, 27 de setembro');
  ok('con el separador de miles de Brasil', enPt.texto.includes('Gs. 190.000 por mês'), true);
  ok('y cómo pagar en portugués', enPt.texto.includes(pt.comoPagar.transferencia), true);
  ok('sin nombre, un saludo sin espacio suelto', L.correoDeVencimiento(base, { ...yo, nombre: '  ' }, es, 'es-PY', 'x')
    .texto.startsWith('Hola,'), true);

  // Los dos idiomas tienen texto para cada forma de pago.
  ok('cada forma de pago tiene su texto en es y pt',
    ['transferencia', 'tarjeta'].every((k) => es.comoPagar[k] && pt.comoPagar[k]), true);

  console.log(`\n${'═'.repeat(62)}`);
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL AVISO DE VENCIMIENTO FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DEL AVISO DE VENCIMIENTO PASARON`);
})().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message);
  console.error(e);
  process.exit(1);
});
