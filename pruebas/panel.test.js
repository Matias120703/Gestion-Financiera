/**
 * Pruebas del panel de administración (migración 016).
 *
 * Lo que importa acá, en orden de importancia:
 *
 *   · que NADIE que no sea superadmin pueda tocar el panel;
 *   · que el panel NO devuelva plata de nadie — ni un monto, ni una venta,
 *     ni una deuda. Esta es la promesa que se le hace al comerciante y la
 *     única forma de sostenerla es una prueba que falle si alguien agrega
 *     un campo de más sin pensarlo;
 *   · que nadie se pueda hacer superadmin solo;
 *   · que activar un plan sume días en vez de comérselos;
 *   · que la prueba se pueda estirar pero nunca acortar;
 *   · que todo lo que hace el panel quede registrado.
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
  console.log(`  ✓ ${nombre} → rechazada: ${resultado.error.slice(0, 70)}`);
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

/** Palabras que NUNCA pueden aparecer en lo que devuelve el panel. */
const PROHIBIDAS = [
  'monto', 'subtotal', 'total', 'ganancia', 'saldo', 'deuda', 'costo',
  'precio', 'descripcion', 'categoria', 'acreedor', 'producto',
];

(async () => {
  const db = await H.crearBase();

  // ── el dueño del sistema ──
  const uidJefe = await H.crearUsuario(db, 'jefe@orden.app');
  await db.query('insert into public.superadmins (usuario_id, nota) values ($1, $2)',
    [uidJefe, 'dueño de Orden']);

  // ── dos clientes de verdad ──
  const comercio = await H.montarEmpresa(db, { email: 'duenio@tienda.com', nombre: 'Perfumeria Zurik' });
  const persona = await H.crearUsuario(db, 'ana@correo.com');
  let empresaPersonal;
  await H.comoUsuario(db, persona, async () => {
    const r = await db.query(
      'select public.crear_empresa($1, $2, $3, $4, $5) as id',
      ['Finanzas de Ana', 'PYG', 'Ana', 'America/Asuncion', 'personal']);
    empresaPersonal = r.rows[0].id;
  });

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Tipo de cuenta y largo de la prueba');

  const tipoComercio = await db.query(
    'select tipo_cuenta from public.empresas where id = $1', [comercio.empresaId]);
  ok('lo que ya existía es comercio', tipoComercio.rows[0].tipo_cuenta, 'emprendedor');

  const tipoPersona = await db.query(
    'select tipo_cuenta from public.empresas where id = $1', [empresaPersonal]);
  ok('la cuenta personal se guarda como tal', tipoPersona.rows[0].tipo_cuenta, 'personal');

  const dias = await db.query(
    'select public.dias_de_prueba($1) p, public.dias_de_prueba($2) e', ['personal', 'emprendedor']);
  ok('personal prueba 14 días', dias.rows[0].p, 14);
  ok('emprendedor prueba 20 días', dias.rows[0].e, 20);

  const pruebaPersona = await db.query(
    `select round(extract(epoch from (prueba_fin - now())) / 86400)::int d
     from public.suscripciones where empresa_id = $1`, [empresaPersonal]);
  ok('la cuenta personal nació con 14 días', pruebaPersona.rows[0].d, 14);

  const pruebaComercio = await db.query(
    `select round(extract(epoch from (prueba_fin - now())) / 86400)::int d
     from public.suscripciones where empresa_id = $1`, [comercio.empresaId]);
  ok('el comercio nació con 20 días', pruebaComercio.rows[0].d, 20);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · El panel es solo del dueño del sistema');

  rechazado('un comerciante no lista cuentas',
    await H.intentar(db, comercio.uid, () => db.query('select public.listar_cuentas()')),
    'solo para la administración');

  rechazado('un comerciante no ve el resumen',
    await H.intentar(db, comercio.uid, () => db.query('select public.resumen_panel()')),
    'solo para la administración');

  rechazado('un comerciante no cambia planes',
    await H.intentar(db, comercio.uid,
      () => db.query('select public.cambiar_plan_cuenta($1, $2)', [comercio.empresaId, 'negocio'])),
    'solo para la administración');

  rechazado('ni siquiera el suyo propio',
    await H.intentar(db, comercio.uid,
      () => db.query('select public.extender_prueba($1, $2)', [comercio.empresaId, 90])),
    'solo para la administración');

  rechazado('un desconocido tampoco',
    await H.intentar(db, persona, () => db.query('select public.historial_cuenta($1)', [comercio.empresaId])),
    'solo para la administración');

  aceptado('el dueño del sistema sí',
    await H.intentar(db, uidJefe, () => db.query('select public.listar_cuentas()')));

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Nadie se hace superadmin solo');

  rechazado('un usuario no se agrega a superadmins',
    await H.intentar(db, comercio.uid,
      () => db.query('insert into public.superadmins (usuario_id) values ($1)', [comercio.uid])));

  rechazado('ni se cuela en la tabla de otro modo',
    await H.intentar(db, persona,
      () => db.query('update public.superadmins set usuario_id = $1', [persona])));

  const veOtros = await H.intentar(db, comercio.uid,
    () => db.query('select count(*)::int n from public.superadmins'));
  ok('un usuario común no ve quiénes son', veOtros.valor.rows[0].n, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · El panel no devuelve la plata de nadie');

  // Se le carga movimiento y deuda al comercio para que HAYA plata que filtrar.
  // El movimiento va directo como superusuario, igual que en las otras suites:
  // lo que se prueba acá no es cómo se carga una venta sino qué sale por el
  // panel después.
  await db.query(
    `insert into public.movimientos (empresa_id, tipo, estado, fecha, descripcion, categoria,
                                     subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
     values ($1, 'venta', 'activo', current_date, 'Venta de perfumes', 'Ventas',
             4500000, 0, 4500000, 1200000, 'efectivo', $2)`,
    [comercio.empresaId, comercio.uid]);

  await H.comoUsuario(db, comercio.uid, async () => {
    await db.query('select public.crear_deuda($1, $2, $3, $4, $5)',
      [comercio.empresaId, 'Tarjeta Visa', 'tarjeta', 'Banco Atlas', 5000000]);
  });

  const lista = (await H.intentar(db, uidJefe,
    () => db.query('select public.listar_cuentas() j'))).valor.rows[0].j;

  ok('lista las dos cuentas', lista.length, 2);

  const fila = lista.find((f) => f.empresa_id === comercio.empresaId);
  const texto = JSON.stringify(fila).toLowerCase();

  for (const palabra of PROHIBIDAS) {
    corridas++;
    if (texto.includes(palabra)) {
      fallos++;
      console.log(`  ✗ el panel filtró "${palabra}"\n      en: ${texto.slice(0, 160)}`);
    } else {
      console.log(`  ✓ no aparece "${palabra}"`);
    }
  }

  corridas++;
  if (texto.includes('4500000') || texto.includes('5000000') || texto.includes('1200000')) {
    fallos++;
    console.log('  ✗ el panel filtró un monto concreto');
  } else {
    console.log('  ✓ no aparece ningún monto cargado');
  }

  ok('sí sabe cuántos movimientos hay', fila.movimientos, 1);
  ok('y con quién hablar', fila.correo, 'duenio@tienda.com');
  ok('y en qué plan está', fila.plan, 'pro');

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Activar un plan cuando entra la transferencia');

  const activada = (await H.intentar(db, uidJefe,
    () => db.query('select public.cambiar_plan_cuenta($1, $2, $3, $4) j',
      [comercio.empresaId, 'negocio', 1, 'transferencia 26/08']))).valor.rows[0].j;

  ok('queda en el plan pedido', activada.plan, 'negocio');
  ok('y activa, no en prueba', activada.estado, 'activa');

  const planReal = await db.query('select public.plan_efectivo_calculado($1) p', [comercio.empresaId]);
  ok('el plan efectivo lo refleja', planReal.rows[0].p, 'negocio');

  const espejo = await db.query('select plan from public.empresas where id = $1', [comercio.empresaId]);
  ok('el espejo en empresas dice que paga', espejo.rows[0].plan, 'pro');

  // Pagar de nuevo antes de que venza no puede comerle los días que le quedan.
  const antes = await db.query(
    'select periodo_fin from public.suscripciones where empresa_id = $1', [comercio.empresaId]);
  await H.intentar(db, uidJefe,
    () => db.query('select public.cambiar_plan_cuenta($1, $2, $3)', [comercio.empresaId, 'negocio', 1]));
  const despues = await db.query(
    'select periodo_fin from public.suscripciones where empresa_id = $1', [comercio.empresaId]);
  ok('pagar dos meses seguidos suma, no reemplaza',
    new Date(despues.rows[0].periodo_fin) > new Date(antes.rows[0].periodo_fin), true);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Cortar el servicio');

  const cortada = (await H.intentar(db, uidJefe,
    () => db.query('select public.cambiar_plan_cuenta($1, $2) j', [empresaPersonal, 'gratis'])))
    .valor.rows[0].j;
  ok('baja a gratis', cortada.plan, 'gratis');
  ok('y queda vencida', cortada.estado, 'vencida');

  const efectivoCortado = await db.query(
    'select public.plan_efectivo_calculado($1) p', [empresaPersonal]);
  ok('el plan efectivo ya no paga', efectivoCortado.rows[0].p, 'gratis');

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Estirar la prueba, nunca acortarla');

  const finAntes = (await db.query(
    'select periodo_fin from public.suscripciones where empresa_id = $1', [empresaPersonal]))
    .rows[0].periodo_fin;

  const estirada = (await H.intentar(db, uidJefe,
    () => db.query('select public.extender_prueba($1, $2, $3) j',
      [empresaPersonal, 5, 'dijo que transfiere el lunes']))).valor.rows[0].j;

  ok('vuelve a estar en prueba',
    (await db.query('select estado from public.suscripciones where empresa_id = $1', [empresaPersonal]))
      .rows[0].estado, 'prueba');
  ok('y con más tiempo que antes', new Date(estirada.periodo_fin) > new Date(finAntes), true);

  // Un valor absurdo se recorta, no rompe.
  const topeado = (await H.intentar(db, uidJefe,
    () => db.query('select public.extender_prueba($1, $2) j', [empresaPersonal, 5000])))
    .valor.rows[0].j;
  ok('90 días es el máximo', topeado.dias, 90);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Cambiar de personal a comercio sin perder nada');

  await H.intentar(db, uidJefe,
    () => db.query('select public.cambiar_tipo_cuenta($1, $2)', [empresaPersonal, 'emprendedor']));
  ok('ahora es comercio',
    (await db.query('select tipo_cuenta from public.empresas where id = $1', [empresaPersonal]))
      .rows[0].tipo_cuenta, 'emprendedor');

  rechazado('un tipo inventado se rechaza',
    await H.intentar(db, uidJefe,
      () => db.query('select public.cambiar_tipo_cuenta($1, $2)', [empresaPersonal, 'vip'])),
    'desconocido');

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Todo lo que toca el panel queda anotado');

  const historial = (await H.intentar(db, uidJefe,
    () => db.query('select public.historial_cuenta($1) j', [empresaPersonal]))).valor.rows[0].j;

  ok('hay registro de lo hecho', historial.length >= 4, true);
  ok('con quién lo hizo', historial[0].quien, 'jefe@orden.app');

  const acciones = historial.map((h) => h.accion).sort();
  ok('y qué se hizo', [...new Set(acciones)],
    ['cambiar_plan', 'cambiar_tipo', 'extender_prueba']);

  const corte = historial.find((h) => h.accion === 'cambiar_plan');
  ok('guarda cómo estaba antes', corte.detalle.plan_antes, 'pro');
  ok('y cómo quedó', corte.detalle.plan_despues, 'gratis');

  const ajeno = await H.intentar(db, comercio.uid,
    () => db.query('select count(*)::int n from public.registro_admin'));
  ok('un usuario común no lee el registro', ajeno.valor.rows[0].n, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · El resumen de arriba');

  const resumen = (await H.intentar(db, uidJefe,
    () => db.query('select public.resumen_panel() j'))).valor.rows[0].j;

  ok('cuenta las dos', resumen.cuentas, 2);
  ok('sabe cuántas pagan', resumen.pagando, 1);
  ok('y no filtra plata', PROHIBIDAS.some((p) => JSON.stringify(resumen).toLowerCase().includes(p)), false);

  // ═══════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL PANEL FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DEL PANEL PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
