/**
 * Pruebas de «Orden lleva las finanzas de Orden» (migración 019).
 *
 * Lo que importa:
 *
 *   · que activar el plan de un cliente anote el cobro como ingreso propio;
 *   · que si ese anotado falla, la cuenta del cliente se active IGUAL —quien
 *     pagó tiene que poder trabajar, pase lo que pase con nuestra contabilidad;
 *   · que la empresa de Orden solo pueda ser una empresa propia, nunca la de
 *     un cliente;
 *   · que una cuenta personal no admita una segunda persona, aunque alguien
 *     comparta el código por WhatsApp.
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

(async () => {
  const db = await H.crearBase();

  // El dueño del sistema, con su propia empresa.
  const uidJefe = await H.crearUsuario(db, 'jefe@orden.app');
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [uidJefe]);

  let empresaOrden;
  await H.comoUsuario(db, uidJefe, async () => {
    const r = await db.query('select public.crear_empresa($1,$2,$3) as id', ['Orden', 'PYG', 'Matías']);
    empresaOrden = r.rows[0].id;
  });

  // Un cliente.
  const cliente = await H.montarEmpresa(db, { email: 'duenio@tienda.com', nombre: 'Perfumeria Zurik' });

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Elegir cuál es la empresa de Orden');

  const sinElegir = (await H.intentar(db, uidJefe,
    () => db.query('select public.finanzas_orden() j'))).valor.rows[0].j;
  ok('sin elegir, la pantalla lo sabe', sinElegir.configurada, false);

  rechazado('no se puede apuntar a la empresa de un cliente',
    await H.intentar(db, uidJefe,
      () => db.query('select public.definir_empresa_orden($1)', [cliente.empresaId])),
    'empresa tuya');

  rechazado('y un cliente no puede elegir nada',
    await H.intentar(db, cliente.uid,
      () => db.query('select public.definir_empresa_orden($1)', [cliente.empresaId])),
    'administración de Orden');

  aceptado('el dueño elige la suya',
    await H.intentar(db, uidJefe,
      () => db.query('select public.definir_empresa_orden($1)', [empresaOrden])));

  ok('y queda configurada',
    (await H.intentar(db, uidJefe, () => db.query('select public.finanzas_orden() j')))
      .valor.rows[0].j.configurada, true);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Cobrar a un cliente anota el ingreso');

  const cobro = (await H.intentar(db, uidJefe,
    () => db.query('select public.cambiar_plan_cuenta($1,$2,$3,$4,$5) j',
      [cliente.empresaId, 'pro', 1, 'transferencia 27/08', 190000]))).valor.rows[0].j;

  ok('el cliente queda activo', cobro.estado, 'activa');
  ok('y el ingreso se anotó', cobro.ingreso_anotado, true);
  ok('sin avisos', cobro.aviso, null);

  const mov = (await db.query(
    `select tipo, categoria, monto::numeric, contraparte, descripcion
     from public.movimientos where empresa_id = $1`, [empresaOrden])).rows[0];
  ok('es un ingreso', mov.tipo, 'ingreso');
  ok('en la categoría correcta', mov.categoria, 'Suscripciones');
  ok('por el importe cobrado', Number(mov.monto), 190000);
  ok('y dice de quién vino', mov.contraparte, 'Perfumeria Zurik');

  const finanzas = (await H.intentar(db, uidJefe,
    () => db.query('select public.finanzas_orden() j'))).valor.rows[0].j;
  ok('las finanzas lo reflejan', Number(finanzas.cobrado_mes), 190000);
  ok('y cuenta el cobro', Number(finanzas.cobros_mes), 1);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Cortar el servicio no inventa ingresos');

  await H.intentar(db, uidJefe,
    () => db.query('select public.cambiar_plan_cuenta($1,$2)', [cliente.empresaId, 'gratis']));
  ok('sigue habiendo un solo movimiento',
    (await db.query('select count(*)::int n from public.movimientos where empresa_id=$1', [empresaOrden])).rows[0].n, 1);

  // Cobrarse a uno mismo tampoco.
  const propio = (await H.intentar(db, uidJefe,
    () => db.query('select public.cambiar_plan_cuenta($1,$2,$3,$4,$5) j',
      [empresaOrden, 'pro', 1, '', 190000]))).valor.rows[0].j;
  ok('activarse a uno mismo no anota ingreso', propio.ingreso_anotado, false);
  ok('y lo explica', /ES tu empresa/i.test(propio.aviso ?? ''), true);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Si el ingreso falla, el cliente igual se activa');

  // La empresa de Orden se vence: el trigger de la 018 va a rechazar el
  // movimiento. Es el escenario real de «se me venció mi propia cuenta».
  await db.query(
    `update public.suscripciones set plan='gratis', estado='vencida',
     periodo_fin = now() - interval '1 day' where empresa_id = $1`, [empresaOrden]);

  const igual = (await H.intentar(db, uidJefe,
    () => db.query('select public.cambiar_plan_cuenta($1,$2,$3,$4,$5) j',
      [cliente.empresaId, 'negocio', 1, '', 250000]))).valor.rows[0].j;

  ok('el cliente SE ACTIVA igual', igual.estado, 'activa');
  ok('en el plan que pagó', igual.plan, 'negocio');
  ok('pero el ingreso no se anotó', igual.ingreso_anotado, false);
  ok('y se avisa por qué', /no se pudo anotar/i.test(igual.aviso ?? ''), true);

  ok('el cliente quedó pago de verdad',
    (await db.query('select public.plan_efectivo_calculado($1) p', [cliente.empresaId])).rows[0].p,
    'negocio');

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Una cuenta personal es de una sola persona');

  const persona = await H.crearUsuario(db, 'ana@correo.com');
  let empresaPersonal;
  await H.comoUsuario(db, persona, async () => {
    const r = await db.query('select public.crear_empresa($1,$2,$3,$4,$5) as id',
      ['Mis finanzas', 'PYG', 'Ana', 'America/Asuncion', 'personal']);
    empresaPersonal = r.rows[0].id;
  });

  const codigo = await H.codigoDe(db, empresaPersonal);
  const otro = await H.crearUsuario(db, 'otro@correo.com');

  rechazado('nadie se suma con el código, aunque lo tenga',
    await H.intentar(db, otro, () => db.query('select public.unirse_empresa($1,$2)', [codigo, 'Colado'])),
    'cuenta personal');

  ok('sigue habiendo una sola persona',
    (await db.query('select count(*)::int n from public.miembros where empresa_id=$1', [empresaPersonal])).rows[0].n, 1);

  // Y en un comercio se sigue pudiendo, que es el punto.
  const codigoComercio = await H.codigoDe(db, cliente.empresaId);
  aceptado('en un comercio sí entra un vendedor',
    await H.intentar(db, otro, () => db.query('select public.unirse_empresa($1,$2)', [codigoComercio, 'Vendedor'])));

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Nada de esto se le filtra a un cliente');

  rechazado('un cliente no ve las finanzas de Orden',
    await H.intentar(db, cliente.uid, () => db.query('select public.finanzas_orden()')),
    'administración de Orden');

  const ve = await H.intentar(db, cliente.uid,
    () => db.query('select count(*)::int n from public.ajustes_orden'));
  ok('ni sabe qué empresa es la de Orden', ve.valor.rows[0].n, 0);

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE ORDEN-NEGOCIO FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE ORDEN-NEGOCIO PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
