/**
 * EL CORREO DEL LUNES (109).
 *
 * El resumen semanal por correo no salió nunca: la tarea corre con la clave
 * de servicio, sin usuario, y las tres funciones que le dan los números
 * (`resumen_financiero`, `serie_financiera_diaria`, `ranking_productos`)
 * piden sesión. La 109 suma `resumen_semanal_para`, que se pone en los
 * zapatos del destinatario y las llama tal cual.
 *
 * Lo que se prueba:
 *
 *   1. el porqué: sin sesión, las tres dicen que no;
 *   2. que el correo diga EXACTAMENTE lo que el dueño ve en /reportes,
 *      clave por clave (con la regla de la mercadería de la 106 adentro);
 *   3. que cada uno vea lo suyo y nada más: al vendedor la ganancia en null,
 *      a un extraño nada;
 *   4. que solo la tarea programada la pueda llamar;
 *   5. que después de llamarla la sesión quede como estaba;
 *   6. quién recibe el correo: ni la cuenta personal ni el campo, con
 *      `rubro_de_ciclos_largos()` comparada contra `ciclosLargos` de
 *      rubros.ts, rubro por rubro;
 *   7. que la ruta pida los números ANTES de reservar el envío;
 *   8. que la 109 se pueda aplicar dos veces.
 *
 * rubros.ts se transpila acá mismo (como en aviso-vencimiento.test.js): así
 * esta prueba no depende de que otro paso lo compile.
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
  else console.log(`  ✓ ${nombre} → ${a.length > 90 ? a.slice(0, 87) + '...' : a}`);
}
function rechazado(nombre, resultado, fragmento) {
  corridas++;
  if (resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      NO fue rechazada`);
    return;
  }
  if (fragmento && !new RegExp(fragmento, 'i').test(resultado.error)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      rechazada por otro motivo: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre} → rechazada`);
}

/** Carga un .ts de src transpilado a CommonJS. */
function cargarTs(relativo) {
  const archivo = path.join(__dirname, '..', relativo);
  const fuente = fs.readFileSync(archivo, 'utf8');
  const salida = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const m = new Module(archivo, module);
  m.filename = archivo;
  m.paths = Module._nodeModulePaths(path.dirname(archivo));
  m._compile(salida, archivo);
  return m.exports;
}

const num = (v) => (v === null || v === undefined ? v : Number(v));
// jsonb no guarda el orden de las claves: se comparan ordenadas.
const ordenado = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const ordenados = (lista) => lista.map(ordenado);

(async () => {
  const db = await H.crearBase();

  const comoUsuario = async (uid, sql, args = []) => {
    const r = await H.intentar(db, uid, () => db.query(sql, args));
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const comoServicio = (sql, args = []) =>
    H.intentarComo(db, 'service_role', null, () => db.query(sql, args));
  const paraServicio = async (sql, args = []) => {
    const r = await comoServicio(sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const semanaPara = (empresa, uid, desde, hasta) => comoServicio(
    'select public.resumen_semanal_para($1,$2,$3,$4) j', [empresa, uid, desde, hasta]);
  const gasto = (uid, empresa, fecha, categoria, monto) => H.intentar(db, uid, () => db.query(
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, metodo_pago, creado_por)
     values ($1,'gasto',$2,'Gasto',$3,$4,$4,'efectivo',auth.uid()) returning id`,
    [empresa, fecha, categoria, monto]));

  // Un almacén que carga el costo, una semana entera (lunes a domingo):
  // vende arroz y yerba, compra mercadería (que va aparte, 106), paga nafta.
  const A = await H.montarEmpresa(db, { email: 'dueno@almacen.com', nombre: 'Almacén Don Pedro' });
  const vendA = await H.sumarMiembro(db, A.empresaId, 'caja@almacen.com', 'vendedor');
  const adminA = await H.sumarMiembro(db, A.empresaId, 'admin@almacen.com', 'admin');
  const arroz = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Arroz', costo: 6000, precio: 10000, stock: 100 });
  const yerba = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Yerba', costo: 12000, precio: 18000, stock: 100 });
  const desde = '2026-03-02';
  const hasta = '2026-03-08';
  const vender = (uid, producto, cantidad, fecha) => H.intentar(db, uid, () => db.query(
    'select public.registrar_venta($1,$2::jsonb,$3) id',
    [A.empresaId, JSON.stringify([{ producto_id: producto, cantidad }]), fecha]));
  await vender(A.uid, arroz, 10, '2026-03-02');
  await vender(vendA, yerba, 3, '2026-03-04');
  await vender(A.uid, arroz, 4, '2026-03-07');
  await gasto(A.uid, A.empresaId, '2026-03-03', 'Mercadería', 500000);
  await gasto(A.uid, A.empresaId, '2026-03-05', 'Transporte', 20000);
  await gasto(vendA, A.empresaId, '2026-03-06', 'Limpieza', 5000);

  // =====================================================================
  grupo('1 · Por qué no salía: sin sesión, los números dicen que no');
  // =====================================================================
  // En Supabase service_role conserva el EXECUTE sobre las tres (los
  // privilegios por defecto del esquema se lo dan y las migraciones solo lo
  // revocan de public y anon; verificado en producción el 24/09/2026). Acá
  // no hay privilegios por defecto: se le da, para que la llamada llegue a
  // la misma pared que allá y no a otra.
  await db.exec(`
    grant execute on function public.resumen_financiero(uuid, date, date) to service_role;
    grant execute on function public.serie_financiera_diaria(uuid, date, date) to service_role;
    grant execute on function public.ranking_productos(uuid, date, date, integer) to service_role;`);
  for (const [nombre, sql] of [
    ['resumen_financiero', 'select public.resumen_financiero($1,$2,$3)'],
    ['serie_financiera_diaria', 'select public.serie_financiera_diaria($1,$2,$3)'],
    ['ranking_productos', 'select public.ranking_productos($1,$2,$3,1)'],
  ]) {
    rechazado(`${nombre} con la clave de servicio y sin usuario`,
      await comoServicio(sql, [A.empresaId, desde, hasta]), 'Necesitás iniciar sesión');
  }

  // =====================================================================
  grupo('2 · Lo mismo que el dueño ve en /reportes, clave por clave');
  // =====================================================================
  const delDueno = {
    resumen: await comoUsuario(A.uid, 'select public.resumen_financiero($1,$2,$3) j', [A.empresaId, desde, hasta]),
    serie: await comoUsuario(A.uid, 'select public.serie_financiera_diaria($1,$2,$3) j', [A.empresaId, desde, hasta]),
    ranking: await comoUsuario(A.uid, 'select public.ranking_productos($1,$2,$3,1) j', [A.empresaId, desde, hasta]),
  };
  const r = await semanaPara(A.empresaId, A.uid, desde, hasta);
  ok('con la clave de servicio, ahora sí contesta', r.ok, true);
  const s = r.valor.rows[0].j;

  ok('trae el resumen, la serie y el más vendido', Object.keys(s).sort(), ['ranking', 'resumen', 'serie']);
  ok('el resumen tiene todas las claves de resumen_financiero, ni una menos',
    Object.keys(s.resumen).sort(), Object.keys(delDueno.resumen).sort());
  ok('y cada una dice lo mismo', ordenado(s.resumen), ordenado(delDueno.resumen));
  ok('la serie es la misma, día por día', ordenados(s.serie), ordenados(delDueno.serie));
  ok('siete días, de lunes a domingo', s.serie.map((d) => d.fecha), [
    '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']);
  ok('el más vendido es el mismo', ordenados(s.ranking), ordenados(delDueno.ranking));
  ok('y es uno solo', s.ranking.length, 1);

  // Los números de verdad, para que «lo mismo» no sea «lo mismo de mal».
  // Ventas: 14 arroz × 10.000 + 3 yerba × 18.000 = 194.000; costo 84.000 + 36.000.
  ok('vendió 194.000 en 3 ventas', [num(s.resumen.ventas), num(s.resumen.cantidad_ventas)], [194000, 3]);
  ok('la mercadería va aparte, como decidió la 106',
    [s.resumen.mercaderia_aparte, num(s.resumen.compras_mercaderia)], [true, 500000]);
  ok('y no entra en los gastos: nafta y limpieza', num(s.resumen.gastos), 25000);
  ok('al dueño le llega la ganancia: 194.000 − 120.000 − 25.000', num(s.resumen.ganancia_neta), 49000);
  ok('el más vendido es el arroz', [s.ranking[0].nombre, num(s.ranking[0].unidades)], ['Arroz', 14]);

  // =====================================================================
  grupo('3 · Cada uno ve lo suyo, ni más ni menos');
  // =====================================================================
  const delAdmin = await comoUsuario(adminA, 'select public.resumen_financiero($1,$2,$3) j', [A.empresaId, desde, hasta]);
  const sAdmin = (await semanaPara(A.empresaId, adminA, desde, hasta)).valor.rows[0].j;
  ok('al administrador, lo mismo que ve él', ordenado(sAdmin.resumen), ordenado(delAdmin));
  ok('con la ganancia', num(sAdmin.resumen.ganancia_neta), 49000);

  // `destinatarios_resumen_semanal` ya deja afuera al vendedor, pero si
  // alguien lo llamara para él, le llegaría lo que ve él: sin ganancia.
  const vendedorVe = {
    resumen: await comoUsuario(vendA, 'select public.resumen_financiero($1,$2,$3) j', [A.empresaId, desde, hasta]),
    serie: await comoUsuario(vendA, 'select public.serie_financiera_diaria($1,$2,$3) j', [A.empresaId, desde, hasta]),
    ranking: await comoUsuario(vendA, 'select public.ranking_productos($1,$2,$3,1) j', [A.empresaId, desde, hasta]),
  };
  const sVend = (await semanaPara(A.empresaId, vendA, desde, hasta)).valor.rows[0].j;
  ok('al vendedor, el resumen que ve él', ordenado(sVend.resumen), ordenado(vendedorVe.resumen));
  ok('la serie que ve él', ordenados(sVend.serie), ordenados(vendedorVe.serie));
  ok('el ranking que ve él', ordenados(sVend.ranking), ordenados(vendedorVe.ranking));
  ok('sin ganancia ni margen', [sVend.resumen.ganancia_neta, sVend.resumen.margen_neto, sVend.resumen.costo_mercaderia],
    [null, null, null]);
  ok('sin costo en el más vendido', [sVend.ranking[0].costo, sVend.ranking[0].ganancia], [null, null]);
  ok('sin ganancia en ningún día', sVend.serie.every((d) => d.ganancia === null), true);
  ok('y de los gastos, solo los que cargó él (047)', num(sVend.resumen.gastos), 5000);

  const B = await H.montarEmpresa(db, { email: 'dueno@otro.com', nombre: 'Otro negocio' });
  rechazado('a alguien de otro negocio, nada',
    await semanaPara(A.empresaId, B.uid, desde, hasta), 'No pertenecés a esta empresa');
  rechazado('sin decir para quién, nada',
    await semanaPara(A.empresaId, null, desde, hasta), 'Falta para quién es el resumen');
  rechazado('con las fechas al revés, lo que diría el reporte',
    await semanaPara(A.empresaId, A.uid, hasta, desde), 'El rango de fechas no es válido');

  // =====================================================================
  grupo('4 · Solo la tarea programada la puede llamar');
  // =====================================================================
  const llamar = 'select public.resumen_semanal_para($1,$2,$3,$4) j';
  rechazado('anon no', await H.intentarComo(db, 'anon', null, () =>
    db.query(llamar, [A.empresaId, A.uid, desde, hasta])), 'permission denied');
  rechazado('ni el propio dueño con su sesión: para eso tiene /reportes',
    await H.intentar(db, A.uid, () => db.query(llamar, [A.empresaId, A.uid, desde, hasta])), 'permission denied');
  const privilegio = async (rol) => (await db.query(
    `select has_function_privilege($1, 'public.resumen_semanal_para(uuid, uuid, date, date)', 'execute') p`,
    [rol])).rows[0].p;
  ok('privilegios: anon, authenticated, service_role',
    [await privilegio('anon'), await privilegio('authenticated'), await privilegio('service_role')],
    [false, false, true]);
  ok('destinatarios_resumen_semanal sigue siendo solo de service_role',
    [(await db.query(`select has_function_privilege('authenticated', 'public.destinatarios_resumen_semanal()', 'execute') p`)).rows[0].p,
     (await db.query(`select has_function_privilege('service_role', 'public.destinatarios_resumen_semanal()', 'execute') p`)).rows[0].p],
    [false, true]);

  // =====================================================================
  grupo('5 · Después de llamarla, la sesión queda como estaba');
  // =====================================================================
  const despues = await H.intentarComo(db, 'service_role', null, async () => {
    await db.query(llamar, [A.empresaId, A.uid, desde, hasta]);
    const uid = (await db.query('select auth.uid() u')).rows[0].u;
    const resumen = await db.query('savepoint antes')
      .then(() => db.query('select public.resumen_financiero($1,$2,$3)', [A.empresaId, desde, hasta]))
      .then(() => 'contestó', async (e) => { await db.query('rollback to savepoint antes'); return e.message; });
    return { uid, resumen };
  });
  ok('en la misma transacción, auth.uid() vuelve a ser null', despues.valor?.uid, null);
  ok('y el resumen vuelve a pedir sesión: no quedó nadie adentro', despues.valor?.resumen, 'Necesitás iniciar sesión.');

  // Si ya había claims (los que PostgREST pone con la clave de servicio),
  // quedan los mismos, letra por letra.
  const claims = JSON.stringify({ role: 'service_role', iss: 'supabase' });
  const conClaims = await H.intentarComo(db, 'service_role', null, async () => {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await db.query(llamar, [A.empresaId, A.uid, desde, hasta]);
    return (await db.query(`select current_setting('request.jwt.claims', true) c,
                                   current_setting('request.jwt.claim.sub', true) s`)).rows[0];
  });
  ok('los claims de antes quedan intactos', conClaims.valor?.c, claims);
  ok('y el claim suelto, vacío como estaba', conClaims.valor?.s, '');

  // =====================================================================
  grupo('6 · Quién recibe el correo');
  // =====================================================================
  const { fichaDe, RUBROS } = cargarTs('src/lib/rubros.ts');

  // Un negocio de cada tipo, todos con algo cargado esta semana (si no,
  // la 010 los deja afuera por inactivos y la prueba no probaría nada).
  const hoy = (await db.query('select public.hoy_empresa($1)::text d', [A.empresaId])).rows[0].d;
  const cuentas = {};
  for (const [clave, datos] of [
    ['servicios', { rubro: 'servicios' }],
    ['clases', { rubro: 'clases' }],
    ['entrenamiento', { rubro: 'entrenamiento' }],
    ['ganaderia', { rubro: 'ganaderia' }],
    ['agricultura', { rubro: 'agricultura' }],
    ['personal', { tipoCuenta: 'personal' }],
  ]) {
    const c = await H.montarEmpresa(db, { email: `dueno@${clave}.com`, nombre: `Cuenta ${clave}`, ...datos });
    const g = await gasto(c.uid, c.empresaId, hoy, 'General', 1000);
    if (!g.ok) throw new Error(`no se pudo cargar un gasto en ${clave}: ${g.error}`);
    cuentas[clave] = c;
  }
  await gasto(A.uid, A.empresaId, hoy, 'Transporte', 1000);

  const destinos = await paraServicio('select public.destinatarios_resumen_semanal() j');
  const recibe = (empresa) => destinos.some((d) => d.empresa_id === empresa);
  ok('el almacén, sí', recibe(A.empresaId), true);
  ok('la barbería, sí', recibe(cuentas.servicios.empresaId), true);
  ok('el profe, sí: cobra clases todas las semanas', recibe(cuentas.clases.empresaId), true);
  ok('el trainer, sí', recibe(cuentas.entrenamiento.empresaId), true);
  ok('el ganadero, no: vende dos o tres veces al año', recibe(cuentas.ganaderia.empresaId), false);
  ok('el agricultor, tampoco', recibe(cuentas.agricultura.empresaId), false);
  ok('la cuenta personal, no: no vende', recibe(cuentas.personal.empresaId), false);
  ok('del almacén, el dueño y el administrador; el vendedor no',
    destinos.filter((d) => d.empresa_id === A.empresaId).map((d) => d.user_id).sort(), [A.uid, adminA].sort());

  // El espejo: la base y rubros.ts contestan igual, rubro por rubro.
  const distintos = [];
  for (const rubro of [...Object.keys(RUBROS), 'un_rubro_que_no_existe', null]) {
    for (const tipo of ['emprendedor', 'personal']) {
      const base = (await db.query('select public.rubro_de_ciclos_largos($1, $2) c', [rubro, tipo])).rows[0].c;
      const ficha = fichaDe(rubro, tipo).ciclosLargos;
      if (base !== ficha) distintos.push({ rubro, tipo, base, ficha });
    }
  }
  ok('rubro_de_ciclos_largos() dice lo mismo que ciclosLargos, rubro por rubro y tipo por tipo', distintos, []);
  ok('y sin tipo de cuenta, como un emprendedor',
    (await db.query(`select public.rubro_de_ciclos_largos('ganaderia') c`)).rows[0].c, true);

  // =====================================================================
  grupo('7 · La ruta: primero los números, después la reserva');
  // =====================================================================
  const ruta = fs.readFileSync(path.join(__dirname, '..', 'src/app/api/tareas/resumen-semanal/route.ts'), 'utf8');
  const posicion = (texto) => ruta.indexOf(texto);
  ok('pide los números a resumen_semanal_para', posicion("rpc('resumen_semanal_para'") > 0, true);
  ok('ya no llama sin sesión a las funciones del reporte',
    /rpc\('(resumen_financiero|serie_financiera_diaria|ranking_productos)'/.test(ruta), false);
  ok('reserva el envío DESPUÉS de tener los números',
    posicion("rpc('resumen_semanal_para'") < posicion("rpc('reservar_envio'"), true);
  ok('y después de ver si hubo algo en la semana',
    posicion('salteados += 1; continue; }') < posicion("rpc('reservar_envio'"), true);
  ok('sin correo configurado no reserva nada',
    posicion('correoConfigurado()') > 0 && posicion('correoConfigurado()') < posicion("rpc('reservar_envio'"), true);

  // =====================================================================
  grupo('8 · La 109, aplicada dos veces más');
  // =====================================================================
  await H.aplicarMigracion(db, '109');
  await H.aplicarMigracion(db, '109');
  ok('cada función existe una sola vez',
    (await db.query(`select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public'
        and p.proname in ('resumen_semanal_para', 'rubro_de_ciclos_largos', 'destinatarios_resumen_semanal')
      group by p.proname order by 1`)).rows.map((x) => [x.proname, x.n]),
    [['destinatarios_resumen_semanal', 1], ['resumen_semanal_para', 1], ['rubro_de_ciclos_largos', 1]]);
  ok('y siguen contestando igual',
    ordenado((await semanaPara(A.empresaId, A.uid, desde, hasta)).valor.rows[0].j.resumen), ordenado(delDueno.resumen));
  ok('con los mismos permisos',
    [await privilegio('anon'), await privilegio('authenticated'), await privilegio('service_role')],
    [false, false, true]);

  console.log(`\n${'═'.repeat(62)}`);
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL CORREO DEL LUNES FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DEL CORREO DEL LUNES PASARON`);
})().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message);
  console.error(e);
  process.exit(1);
});
