/**
 * Prueba que la migración 002 se pueda aplicar sobre una instalación que YA
 * está en producción con datos cargados, sin perder nada y sin dejar números
 * incoherentes. Y que se pueda volver a ejecutar sin romper.
 */
const H = require('./ayuda-db.js');

let fallos = 0, corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a}`);
}

(async () => {
  console.log('\n── Migración sobre una base que ya tiene datos ─────────────');

  // 1. Base con SOLO el esquema viejo.
  const db = await H.crearBase({ hasta: '001' });
  const A = await H.montarEmpresa(db, { email: 'viejo@a.com', nombre: 'Negocio Viejo' });
  const p = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Perfume', costo: 100, precio: 150, stock: 20 });

  // 2. Datos cargados con la versión anterior:
  //    la venta vieja guardaba `monto` YA neto de descuento y los items con precio bruto.
  const vender = (items, descuento) => H.comoUsuario(db, A.uid, async () =>
    (await db.query(
      `select public.registrar_venta($1, $2::jsonb, null, '', 'efectivo', '', '', 'manual', $3) as id`,
      [A.empresaId, JSON.stringify(items), descuento])).rows[0].id);

  const ventaSimple = await vender([{ producto_id: p, cantidad: 2, precio_unitario: 150 }], 0);
  const ventaConDescuento = await vender([{ producto_id: p, cantidad: 4, precio_unitario: 150 }], 50);

  const gasto = (await db.query(
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, monto, creado_por)
     values ($1, 'gasto', current_date, 'Nafta', 'Transporte', 90000, $2) returning id`,
    [A.empresaId, A.uid])).rows[0].id;

  const antes = await db.query('select count(*)::int n from public.movimientos');
  ok('datos cargados antes de migrar', antes.rows[0].n, 3);
  ok('la venta con descuento tenía el monto ya neto',
    Number((await H.movimiento(db, ventaConDescuento)).monto), 550); // 600 − 50

  // 3. Aplicamos la migración.
  await H.aplicarMigracion(db, '002');
  console.log('  · migración 002 aplicada');

  ok('no se perdió ningún movimiento',
    (await db.query('select count(*)::int n from public.movimientos')).rows[0].n, 3);

  // 4. El backfill tiene que reconstruir subtotal y descuento correctamente.
  const v1 = await H.movimiento(db, ventaSimple);
  ok('venta sin descuento: subtotal', Number(v1.subtotal), 300);
  ok('venta sin descuento: descuento', Number(v1.descuento), 0);
  ok('venta sin descuento: monto intacto', Number(v1.monto), 300);

  const v2 = await H.movimiento(db, ventaConDescuento);
  ok('venta con descuento: subtotal reconstruido', Number(v2.subtotal), 600);
  ok('venta con descuento: descuento reconstruido', Number(v2.descuento), 50);
  ok('venta con descuento: monto intacto', Number(v2.monto), 550);

  const g = await H.movimiento(db, gasto);
  ok('gasto: subtotal = monto', Number(g.subtotal), 90000);
  ok('gasto: sin descuento', Number(g.descuento), 0);

  ok('todo quedó activo', (await db.query("select count(*)::int n from public.movimientos where estado='activo'")).rows[0].n, 3);
  ok('en toda la tabla se cumple monto = subtotal − descuento',
    (await db.query('select count(*)::int n from public.movimientos where monto <> subtotal - descuento')).rows[0].n, 0);

  ok('las empresas existentes quedaron con suscripción',
    (await db.query('select count(*)::int n from public.suscripciones')).rows[0].n, 1);
  ok('y en su plan actual',
    (await db.query('select plan from public.suscripciones')).rows[0].plan, 'gratis');

  // 5. Idempotencia: volver a ejecutarla no puede romper nada.
  await H.aplicarMigracion(db, '002');
  await H.aplicarMigracion(db, '002');
  console.log('  · migración 002 aplicada 2 veces más');
  ok('sigue habiendo 3 movimientos',
    (await db.query('select count(*)::int n from public.movimientos')).rows[0].n, 3);
  ok('los montos no cambiaron', Number((await H.movimiento(db, ventaConDescuento)).monto), 550);
  ok('los subtotales no se recalcularon mal', Number((await H.movimiento(db, ventaConDescuento)).subtotal), 600);
  ok('no se duplicaron suscripciones',
    (await db.query('select count(*)::int n from public.suscripciones')).rows[0].n, 1);

  // 6. Y la base migrada funciona con las reglas nuevas.
  const stockAntes = await H.stockDe(db, p);
  await H.comoUsuario(db, A.uid, () =>
    db.query('select public.anular_movimiento($1, $2)', [ventaConDescuento, 'Prueba post-migración']));
  ok('anular una venta vieja devuelve el stock', await H.stockDe(db, p), stockAntes + 4);
  ok('y queda anulada', (await H.movimiento(db, ventaConDescuento)).estado, 'anulado');

  const intento = await H.intentar(db, A.uid, () => db.query(
    `insert into public.movimientos (empresa_id, tipo, fecha, subtotal, monto, creado_por)
     values ($1,'venta',current_date,999,999,$2)`, [A.empresaId, A.uid]));
  ok('y las reglas nuevas ya rigen sobre la base vieja', intento.ok, false);

  // 7. Las de las campañas (100 y 101) tienen que poder correr de nuevo
  //    sobre una base que ya las tiene: columnas, constraints, índices,
  //    policies, tablas y funciones, dos veces más, sin romper ni duplicar.
  console.log('\n── Las migraciones 100 y 101, aplicadas de nuevo ───────────');
  const completa = await H.crearBase();
  const C = await H.montarEmpresa(completa, { email: 'sojero@campo.com', nombre: 'Agro Norte', rubro: 'agricultura', moneda: 'USD' });
  const norte = await H.comoUsuario(completa, C.uid, async () =>
    (await completa.query("select public.guardar_lote($1,'Norte','',0,'',null,null,'Soja','Zafra 2026/27',50,415) id", [C.empresaId])).rows[0].id);
  for (const prefijo of ['100', '101', '100', '101']) await H.aplicarMigracion(completa, prefijo);
  console.log('  · migraciones 100 y 101 aplicadas 2 veces más');
  ok('la campaña sigue estando, con sus hectáreas',
    Number((await completa.query('select hectareas::numeric h from public.lotes where id=$1', [norte])).rows[0].h), 50);
  ok('la policy de insert quedó una sola vez',
    (await completa.query("select count(*)::int n from pg_policies where tablename='movimientos' and policyname='movimientos_insert'")).rows[0].n, 1);
  ok('y cada función de las campañas existe una sola vez',
    (await completa.query(`select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ('guardar_lote','crear_deuda','registrar_pago_deuda','registrar_liquidacion','numeros_de_lote')
      group by p.proname having count(*) > 1`)).rows, []);
  ok('la base migrada dos veces sigue contestando',
    (await H.comoUsuario(completa, C.uid, async () =>
      (await completa.query('select public.listar_lotes($1) j', [C.empresaId])).rows[0].j)).length, 1);

  // 8. La 102 (planes por rubro y comisión sobre el precio de lista), dos
  //    veces más sobre la base completa: son todas funciones, pero una firma
  //    duplicada o un grant que falle al repetirse rompería el deploy.
  console.log('\n── La migración 102, aplicada de nuevo ─────────────────────');
  for (const prefijo of ['102', '102']) await H.aplicarMigracion(completa, prefijo);
  console.log('  · migración 102 aplicada 2 veces más');
  ok('cada función de la 102 existe una sola vez',
    (await completa.query(`select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ('planes_de_rubro','plan_de_prueba','base_de_comision',
        'monto_de_comision','crear_empresa','cambiar_rubro','cambiar_plan_cuenta','asignar_referido')
      group by p.proname order by 1`)).rows.map((r) => [r.proname, r.n]),
    [['asignar_referido', 1], ['base_de_comision', 1], ['cambiar_plan_cuenta', 1], ['cambiar_rubro', 1],
      ['crear_empresa', 1], ['monto_de_comision', 1], ['plan_de_prueba', 1], ['planes_de_rubro', 1]]);
  const T = await H.montarEmpresa(completa, { email: 'trainer@fuerza.com', nombre: 'Fuerza', rubro: 'entrenamiento' });
  ok('y la base migrada dos veces hace nacer a un trainer en prueba de Básico',
    (await completa.query('select plan from public.suscripciones where empresa_id = $1', [T.empresaId])).rows[0].plan,
    'basico');
  ok('el agricultor de antes sigue en prueba de Pro, sin que nadie lo tocara',
    (await completa.query('select plan from public.suscripciones where empresa_id = $1', [C.empresaId])).rows[0].plan,
    'pro');

  // 9. La 103 (la comisión guarda lo que entró), dos veces más sobre la base
  //    completa: agrega una columna con su check, rellena y redefine tres
  //    funciones. Nada de eso se puede duplicar al repetirse.
  console.log('\n── La migración 103, aplicada de nuevo ─────────────────────');
  for (const prefijo of ['103', '103']) await H.aplicarMigracion(completa, prefijo);
  console.log('  · migración 103 aplicada 2 veces más');
  ok('la columna importe de comisiones existe una sola vez, como numeric(14,2)',
    (await completa.query(`select data_type, numeric_precision, numeric_scale from information_schema.columns
      where table_schema = 'public' and table_name = 'comisiones' and column_name = 'importe'`)).rows
      .map((r) => [r.data_type, r.numeric_precision, r.numeric_scale]),
    [['numeric', 14, 2]]);
  ok('con un solo check de no negativo',
    (await completa.query(`select count(*)::int n from pg_constraint
      where conrelid = 'public.comisiones'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%importe%'`)).rows[0].n, 1);
  ok('y cada función de la 103 existe una sola vez',
    (await completa.query(`select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ('cambiar_plan_cuenta','asignar_referido','listar_comisiones')
      group by p.proname order by 1`)).rows.map((r) => [r.proname, r.n]),
    [['asignar_referido', 1], ['cambiar_plan_cuenta', 1], ['listar_comisiones', 1]]);

  // 10. La 104 (la tarjeta conoce el Básico y paga la comisión), dos veces
  //     más sobre la base completa: una función con su revoke/grant. Una
  //     segunda firma haría ambigua la llamada del webhook.
  console.log('\n── La migración 104, aplicada de nuevo ─────────────────────');
  for (const prefijo of ['104', '104']) await H.aplicarMigracion(completa, prefijo);
  console.log('  · migración 104 aplicada 2 veces más');
  ok('aplicar_suscripcion existe una sola vez, con la firma de 11 argumentos',
    (await completa.query(`select p.oid::regprocedure::text f from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname = 'aplicar_suscripcion'`)).rows.map((r) => r.f),
    ['aplicar_suscripcion(uuid,text,text,timestamp with time zone,timestamp with time zone,text,text,text,text,text,numeric)']);
  ok('sigue siendo solo de service_role',
    (await completa.query(`select has_function_privilege('authenticated',
      'public.aplicar_suscripcion(uuid,text,text,timestamptz,timestamptz,text,text,text,text,text,numeric)', 'EXECUTE') a,
      has_function_privilege('service_role',
      'public.aplicar_suscripcion(uuid,text,text,timestamptz,timestamptz,text,text,text,text,text,numeric)', 'EXECUTE') s`))
      .rows.map((r) => [r.a, r.s])[0], [false, true]);
  const B4 = await H.montarEmpresa(completa, { email: 'basico@tarjeta104.com', nombre: 'Básico por tarjeta' });
  await H.comoServicio(completa, () => completa.query(
    "select public.aplicar_suscripcion($1,'basico','activa',now(),now()+interval '1 month','stripe',null,null,'mensual','PYG',110000)",
    [B4.empresaId]));
  ok('y la base migrada dos veces deja un Básico por tarjeta como Básico',
    (await completa.query('select s.plan sp, e.plan ep from public.suscripciones s join public.empresas e on e.id = s.empresa_id where e.id = $1',
      [B4.empresaId])).rows.map((r) => [r.sp, r.ep])[0], ['basico', 'basico']);

  // 11. La 105 (la comisión en guaraníes), dos veces más sobre la base
  //     completa. Va DESPUÉS de volver a pasar la 102, que redefine los mismos
  //     dos ayudantes con la regla vieja: acá se comprueba que la 105 los deja
  //     otra vez en guaraníes, sin firmas duplicadas y sin abrirlos a nadie.
  console.log('\n── La migración 105, aplicada de nuevo ─────────────────────');
  for (const prefijo of ['105', '105']) await H.aplicarMigracion(completa, prefijo);
  console.log('  · migración 105 aplicada 2 veces más');
  ok('base_de_comision y monto_de_comision existen una sola vez, con sus firmas',
    (await completa.query(`select p.oid::regprocedure::text f from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ('base_de_comision','monto_de_comision') order by 1`)).rows.map((r) => r.f),
    ['base_de_comision(uuid,text,numeric)', 'monto_de_comision(uuid,numeric,numeric,numeric)']);
  ok('siguen cerradas para authenticated y anon',
    (await completa.query(`select
      has_function_privilege('authenticated', 'public.base_de_comision(uuid,text,numeric)', 'EXECUTE') a,
      has_function_privilege('anon', 'public.monto_de_comision(uuid,numeric,numeric,numeric)', 'EXECUTE') b`))
      .rows.map((r) => [r.a, r.b])[0], [false, false]);
  // El agricultor de antes lleva su campo en dólares y su suscripción no
  // tiene moneda, como todas las de producción: la lista es la de guaraníes.
  ok('y la base migrada dos veces toma la lista en guaraníes para una empresa en dólares',
    (await completa.query('select public.base_de_comision($1,$2,$3) b, public.monto_de_comision($1,$4,$5,$6) m',
      [C.empresaId, 'basico', 90200, 110000, 50, 90200])).rows.map((r) => [Number(r.b), Number(r.m)])[0],
    [110000, 55000]);

  console.log(`\n${'═'.repeat(62)}`);
  console.log(fallos === 0 ? `>>> ${corridas} COMPROBACIONES DE MIGRACIÓN PASARON` : `>>> ${fallos} DE ${corridas} FALLARON`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message, '\n', e.stack); process.exit(1); });
