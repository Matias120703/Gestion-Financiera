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

  console.log(`\n${'═'.repeat(62)}`);
  console.log(fallos === 0 ? `>>> ${corridas} COMPROBACIONES DE MIGRACIÓN PASARON` : `>>> ${fallos} DE ${corridas} FALLARON`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message, '\n', e.stack); process.exit(1); });
