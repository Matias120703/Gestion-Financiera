/**
 * Pruebas del corte a solo lectura (migración 018).
 *
 * La promesa que se le hace a la persona tiene dos mitades, y las dos tienen
 * que cumplirse:
 *
 *   · NO PUEDE CARGAR NADA. Por ningún camino: ni gastos por RLS, ni ventas
 *     por RPC, ni deudas, ni pagos, ni comprobantes, ni el cierre del día.
 *     Si alguno se escapa, el corte no sirve para nada.
 *
 *   · SÍ PUEDE VER Y LLEVARSE TODO. El historial completo, los totales y el
 *     Excel. Y puede irse: vaciar el negocio y borrar la cuenta funcionan
 *     igual, porque nadie debería tener que pagar para poder irse.
 */
const H = require('./ayuda-db.js');

let fallos = 0;
let corridas = 0;

function grupo(nombre) {
  console.log(`\n── ${nombre} ${'─'.repeat(Math.max(0, 58 - nombre.length))}`);
}

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`);
  } else {
    console.log(`  ✓ ${nombre} → ${a}`);
  }
}

function rechazado(nombre, resultado, fragmento) {
  corridas++;
  if (resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      NO fue rechazada (devolvió ${JSON.stringify(resultado.valor)})`);
    return;
  }
  if (fragmento && !new RegExp(fragmento, 'i').test(resultado.error)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      rechazada por otro motivo: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre} → rechazada`);
}

function aceptado(nombre, resultado) {
  corridas++;
  if (!resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      fue rechazada: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre}`);
}

/** Mueve el vencimiento al pasado, como si hubieran corrido los días. */
const vencer = (db, empresaId) => db.query(
  `update public.suscripciones
   set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
   where empresa_id = $1`, [empresaId]);

const revivir = (db, empresaId) => db.query(
  `update public.suscripciones
   set plan = 'pro', estado = 'activa', periodo_fin = now() + interval '30 days'
   where empresa_id = $1`, [empresaId]);

(async () => {
  const db = await H.crearBase();
  const E = await H.montarEmpresa(db, { email: 'duenio@tienda.com', nombre: 'Perfumeria Zurik' });
  const producto = await H.crearProducto(db, E.empresaId, E.uid, {
    nombre: 'Perfume Lattafa', categoria: 'Perfumes', costo: 90000, precio: 150000, stock: 10,
  });

  // Historial cargado MIENTRAS la cuenta estaba viva.
  await H.comoUsuario(db, E.uid, async () => {
    await db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria,
                                       subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
       values ($1, 'gasto', current_date, 'Combustible', 'Transporte',
               100000, 0, 100000, 0, 'efectivo', $2)`, [E.empresaId, E.uid]);
    await db.query('select public.crear_deuda($1, $2, $3, $4, $5)',
      [E.empresaId, 'Tarjeta Visa', 'tarjeta', 'Banco Atlas', 5000000]);
  });

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Con la cuenta al día se carga normal');

  aceptado('un gasto entra',
    await H.intentar(db, E.uid, () => db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria,
                                       subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
       values ($1, 'gasto', current_date, 'Delivery', 'Transporte',
               50000, 0, 50000, 0, 'efectivo', $2)`, [E.empresaId, E.uid])));

  ok('y la base dice que puede cargar',
    (await H.intentar(db, E.uid, () => db.query('select public.puede_cargar($1) p', [E.empresaId])))
      .valor.rows[0].p, true);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Vencida: no entra nada, por ningún camino');

  await vencer(db, E.empresaId);

  ok('el plan efectivo cae', (await db.query('select public.plan_efectivo_calculado($1) p', [E.empresaId])).rows[0].p, 'gratis');
  ok('y ya no puede cargar',
    (await H.intentar(db, E.uid, () => db.query('select public.puede_cargar($1) p', [E.empresaId])))
      .valor.rows[0].p, false);

  rechazado('un gasto por RLS',
    await H.intentar(db, E.uid, () => db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria,
                                       subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
       values ($1, 'gasto', current_date, 'Otro', 'Otros',
               10000, 0, 10000, 0, 'efectivo', $2)`, [E.empresaId, E.uid])),
    'prueba|activar el plan');

  rechazado('una venta por RPC',
    await H.intentar(db, E.uid, () => db.query(
      `select public.registrar_venta($1, $2::jsonb, current_date, 'Venta', 'efectivo', '', '', 'manual', 0)`,
      [E.empresaId, JSON.stringify([{ producto_id: producto, nombre: 'Perfume', cantidad: 1, precio_unitario: 150000 }])])),
    'prueba|activar el plan');

  rechazado('una deuda nueva',
    await H.intentar(db, E.uid, () => db.query('select public.crear_deuda($1, $2, $3, $4, $5)',
      [E.empresaId, 'Prestamo', 'prestamo', 'Financiera', 1000000])),
    'prueba|activar el plan');

  const deudaId = (await db.query('select id from public.deudas where empresa_id = $1 limit 1', [E.empresaId])).rows[0].id;
  rechazado('un pago de deuda',
    await H.intentar(db, E.uid, () => db.query('select public.registrar_pago_deuda($1, $2)', [deudaId, 100000])),
    'prueba|activar el plan');

  rechazado('un producto nuevo',
    await H.intentar(db, E.uid, () => db.query(
      `insert into public.productos (empresa_id, nombre, categoria, costo, precio, stock, stock_minimo, controla_stock)
       values ($1, 'Nuevo', 'Perfumes', 1000, 2000, 5, 1, true)`, [E.empresaId])),
    'prueba|activar el plan');

  rechazado('cambiarle el precio a uno que ya existe',
    await H.intentar(db, E.uid, () => db.query(
      'update public.productos set precio = 999999 where id = $1', [producto])),
    'prueba|activar el plan');

  rechazado('el cierre del día',
    await H.intentar(db, E.uid, () => db.query('select public.marcar_cierre($1)', [E.empresaId])),
    'prueba|activar el plan');

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Pero sigue viendo TODO lo suyo');

  const historial = await H.intentar(db, E.uid,
    () => db.query('select count(*)::int n from public.movimientos where empresa_id = $1', [E.empresaId]));
  ok('el historial completo sigue ahí', historial.valor.rows[0].n, 2);

  const suDeuda = await H.intentar(db, E.uid,
    () => db.query('select public.listar_deudas($1) j', [E.empresaId]));
  ok('y sus deudas también', suDeuda.valor.rows[0].j.length, 1);

  const susProductos = await H.intentar(db, E.uid,
    () => db.query('select count(*)::int n from public.productos where empresa_id = $1', [E.empresaId]));
  ok('y su catálogo', susProductos.valor.rows[0].n, 1);

  ok('el Excel sigue habilitado',
    (await db.query("select (public.limites_plan('gratis')->>'excel')::boolean e")).rows[0].e, true);
  ok('la IA no, porque igual no podría guardar',
    (await db.query("select (public.limites_plan('gratis')->>'capturas_mes')::int c")).rows[0].c, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Y puede irse sin pagar');

  aceptado('vaciar el negocio funciona vencida',
    await H.intentar(db, E.uid, () => db.query('select public.vaciar_empresa($1, $2)',
      [E.empresaId, 'Perfumeria Zurik'])));

  ok('y de verdad se vació',
    (await db.query('select count(*)::int n from public.movimientos where empresa_id = $1', [E.empresaId])).rows[0].n, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · La pantalla puede explicarlo antes del choque');

  const estado = (await H.intentar(db, E.uid,
    () => db.query('select public.estado_cuenta($1) j', [E.empresaId]))).valor.rows[0].j;
  ok('dice que está vencida', estado.vencida, true);
  ok('y que no puede cargar', estado.puede_cargar, false);
  ok('y que hay que avisar', estado.avisar, true);

  rechazado('un desconocido no lo consulta',
    await H.intentar(db, await H.crearUsuario(db, 'ajeno@correo.com'),
      () => db.query('select public.estado_cuenta($1)', [E.empresaId])),
    'No pertenecés');

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Y cuando paga, vuelve todo');

  await revivir(db, E.empresaId);

  ok('puede cargar de nuevo',
    (await H.intentar(db, E.uid, () => db.query('select public.puede_cargar($1) p', [E.empresaId])))
      .valor.rows[0].p, true);

  aceptado('y el gasto entra',
    await H.intentar(db, E.uid, () => db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria,
                                       subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
       values ($1, 'gasto', current_date, 'Ya pagué', 'Otros',
               20000, 0, 20000, 0, 'efectivo', $2)`, [E.empresaId, E.uid])));

  const luego = (await H.intentar(db, E.uid,
    () => db.query('select public.estado_cuenta($1) j', [E.empresaId]))).valor.rows[0].j;
  ok('y el estado lo refleja', luego.vencida, false);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · El sistema sigue pudiendo escribir aunque la cuenta esté vencida');

  await vencer(db, E.empresaId);

  // Sin sesión = webhook de pagos, tarea programada o migración. Va como
  // superusuario y NO con `set role authenticated`, que es exactamente lo
  // que hace `service_role` en Supabase. Si esto se bloqueara, un pago no se
  // podría registrar justo cuando más falta hace.
  //
  // (Con el rol `authenticated` y sin uid lo frenaría antes la RLS, que
  // exige es_miembro(). Por eso la prueba tiene que correr así y no con
  // H.intentar.)
  let paso = { ok: true, error: null };
  try {
    await db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria,
                                       subtotal, descuento, monto, costo_total, metodo_pago)
       values ($1, 'gasto', current_date, 'Ajuste del sistema', 'Otros',
               1, 0, 1, 0, 'efectivo')`, [E.empresaId]);
  } catch (e) {
    paso = { ok: false, error: e.message };
  }
  aceptado('una escritura de sistema pasa igual', paso);

  // Y que quede claro que el trigger sigue puesto para quien sí tiene sesión.
  rechazado('pero la persona sigue sin poder',
    await H.intentar(db, E.uid, () => db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria,
                                       subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
       values ($1, 'gasto', current_date, 'Intento', 'Otros',
               5000, 0, 5000, 0, 'efectivo', $2)`, [E.empresaId, E.uid])),
    'prueba|activar el plan');

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE SOLO LECTURA FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE SOLO LECTURA PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
