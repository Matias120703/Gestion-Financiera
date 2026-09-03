/**
 * Pruebas de «traer lo que cobré» a la cuenta personal (migración 039).
 *
 * El caso real: Pedro corta en la barbería de Matías, cobra el 50% por
 * comisión, y además lleva su propia cuenta personal en Orden. Cuando el
 * dueño le paga, Pedro quiere que ese ingreso aparezca en SU cuenta sin
 * volver a escribir el número.
 *
 * Lo que se comprueba no es solo que funcione: es que no se pueda usar para
 * fisgonear ni para inflar la cuenta de otro. La lectura cruza la frontera
 * de empresa_id a propósito —por identidad, no por membresía— y eso tiene
 * que quedar exactamente tan angosto como se diseñó.
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

function aceptado(nombre, resultado) {
  corridas++;
  if (!resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      fue rechazada: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre}`);
}

const num = (v) => Number(v);

(async () => {
  const db = await H.crearBase();

  const llamar = (uid, sql, args) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args) => {
    const r = await llamar(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };
  const crudo = async (sql, args) => (await db.query(sql, args)).rows[0];
  const filas = async (sql, args) => (await db.query(sql, args)).rows;

  // ---- la barbería ----
  const barberia = await H.montarEmpresa(db, { email: 'dueno@barberia.com', nombre: 'Barbería Ñandutí' });
  const uidPedro = await H.sumarMiembro(db, barberia.empresaId, 'pedro@barberia.com', 'vendedor');
  const corte = await H.crearProducto(db, barberia.empresaId, barberia.uid,
    { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
  const pedroProf = (await valor(barberia.uid,
    "select public.guardar_profesional($1,$2,'comision',50,$3) as id",
    [barberia.empresaId, 'Pedro', uidPedro])).id;

  // Pedro también lleva su propia cuenta personal, aparte de la barbería.
  let pedroPersonal;
  await H.comoUsuario(db, uidPedro, async () => {
    const r = await db.query(
      'select public.crear_empresa($1,$2,$3,$4,$5) as id',
      ['Mis finanzas', 'PYG', 'Pedro', 'America/Asuncion', 'personal']);
    pedroPersonal = r.rows[0].id;
  });

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Sin nada pagado todavía, no hay nada pendiente');
  // ═══════════════════════════════════════════════════════════

  ok('Pedro no tiene nada para traer', (await valor(uidPedro, 'select public.trabajos_pendientes() j', [])).j, []);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Cobrar no es lo mismo que le paguen');
  // ═══════════════════════════════════════════════════════════

  await llamar(uidPedro, 'select public.registrar_servicio($1,$2,$3)', [barberia.empresaId, pedroProf, corte]);

  ok('un corte cobrado todavía no aparece como pendiente de traer',
    (await valor(uidPedro, 'select public.trabajos_pendientes() j', [])).j, []);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Recién cuando el dueño le paga, aparece');
  // ═══════════════════════════════════════════════════════════

  await llamar(barberia.uid, 'select public.pagar_profesional($1,$2,$3)', [barberia.empresaId, pedroProf, 15000]);

  const pend = (await valor(uidPedro, 'select public.trabajos_pendientes() j', [])).j;
  ok('ahora sí figura un negocio pendiente', pend.length, 1);
  ok('con el nombre de la barbería', pend[0].negocio, 'Barbería Ñandutí');
  ok('y los 15.000 que le pagaron', num(pend[0].pendiente), 15000);

  rechazado('un vendedor sin trabajo en ningún lado no puede ejecutar la de traer contra un negocio ajeno',
    await llamar(uidPedro, 'select public.traer_ingreso_de_trabajo($1,$2)',
      [barberia.empresaId, barberia.empresaId]),
    'cuenta personal');

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Traerlo, con la fecha real del pago');
  // ═══════════════════════════════════════════════════════════

  const antes = await crudo(
    "select count(*)::int n from public.movimientos where empresa_id=$1", [pedroPersonal]);
  ok('la cuenta personal arranca sin movimientos', antes.n, 0);

  const traido = await valor(uidPedro, 'select public.traer_ingreso_de_trabajo($1,$2) j',
    [barberia.empresaId, pedroPersonal]);
  ok('trajo un movimiento', num(traido.j.movimientos), 1);
  ok('por 15.000', num(traido.j.total), 15000);

  const mov = await crudo(
    "select tipo, monto, categoria, descripcion, fecha, contraparte from public.movimientos where empresa_id=$1",
    [pedroPersonal]);
  ok('quedó como ingreso', mov.tipo, 'ingreso');
  ok('por el monto pagado', num(mov.monto), 15000);
  ok('en la categoría de comisión', mov.categoria, 'Extra');
  ok('con el nombre del negocio en la descripción', mov.descripcion, 'Cobrado en Barbería Ñandutí');
  ok('y el negocio como contraparte', mov.contraparte, 'Barbería Ñandutí');

  const pago = await crudo(
    'select fecha from public.turnos_pago where profesional_id=$1', [pedroProf]);
  ok('con la fecha real del pago, no la de hoy', mov.fecha, pago.fecha);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · No se puede traer dos veces el mismo pago');
  // ═══════════════════════════════════════════════════════════

  ok('ya no queda nada pendiente', (await valor(uidPedro, 'select public.trabajos_pendientes() j', [])).j, []);

  rechazado('volver a traer del mismo negocio no encuentra nada',
    await llamar(uidPedro, 'select public.traer_ingreso_de_trabajo($1,$2)',
      [barberia.empresaId, pedroPersonal]),
    'nada pendiente');

  ok('sigue habiendo un solo movimiento en la cuenta personal',
    (await crudo("select count(*)::int n from public.movimientos where empresa_id=$1", [pedroPersonal])).n, 1);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Dos pagos separados traen dos movimientos, cada uno con su día');
  // ═══════════════════════════════════════════════════════════

  await llamar(uidPedro, 'select public.registrar_servicio($1,$2,$3)', [barberia.empresaId, pedroProf, corte]);
  await llamar(barberia.uid, "select public.pagar_profesional($1,$2,$3,public.hoy_empresa($1) - 5)",
    [barberia.empresaId, pedroProf, 10000]);

  await llamar(uidPedro, 'select public.registrar_servicio($1,$2,$3)', [barberia.empresaId, pedroProf, corte]);
  await llamar(barberia.uid, "select public.pagar_profesional($1,$2,$3,public.hoy_empresa($1))",
    [barberia.empresaId, pedroProf, 25000]);

  const traido2 = await valor(uidPedro, 'select public.traer_ingreso_de_trabajo($1,$2) j',
    [barberia.empresaId, pedroPersonal]);
  ok('trajo los dos pagos de una', num(traido2.j.movimientos), 2);
  ok('por el total de los dos', num(traido2.j.total), 35000);

  // No exige que sean distintas entre sí —dos pagos distintos pueden caer el
  // mismo día sin que nada esté mal—, exige que cada una sea la fecha REAL
  // del pago que representa, no la del día en que se tocó el botón.
  const fechasMovimientos = (await filas(
    "select fecha from public.movimientos where empresa_id=$1 and descripcion like 'Cobrado%' order by fecha",
    [pedroPersonal])).map((f) => String(f.fecha));
  const fechasPagos = (await filas(
    'select fecha from public.turnos_pago where profesional_id=$1 order by fecha',
    [pedroProf])).map((f) => String(f.fecha));
  ok('cada movimiento quedó con la fecha real de su pago, no la de hoy',
    fechasMovimientos, fechasPagos);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Nadie trae ni ve el trabajo de otro');
  // ═══════════════════════════════════════════════════════════

  const ana = await H.montarEmpresa(db, { email: 'ana@aparte.com', nombre: 'Cuenta de Ana' });
  await H.comoUsuario(db, ana.uid, async () => {
    const r = await db.query(
      'select public.crear_empresa($1,$2,$3,$4,$5) as id',
      ['Mis finanzas', 'PYG', 'Ana', 'America/Asuncion', 'personal']);
    ana.personal = r.rows[0].id;
  });

  ok('Ana, que no trabaja en la barbería, no tiene nada pendiente',
    (await valor(ana.uid, 'select public.trabajos_pendientes() j', [])).j, []);

  rechazado('Ana no puede traer el pago de Pedro a su propia cuenta',
    await llamar(ana.uid, 'select public.traer_ingreso_de_trabajo($1,$2)',
      [barberia.empresaId, ana.personal]),
    'No trabajás');

  rechazado('ni Pedro puede traer SU pago a la cuenta de Ana',
    await llamar(uidPedro, 'select public.traer_ingreso_de_trabajo($1,$2)',
      [barberia.empresaId, ana.personal]),
    'no es tuya');

  // Un tercer pago pendiente, para probar el intento cruzado sin vaciarlo.
  await llamar(uidPedro, 'select public.registrar_servicio($1,$2,$3)', [barberia.empresaId, pedroProf, corte]);
  await llamar(barberia.uid, 'select public.pagar_profesional($1,$2,$3)', [barberia.empresaId, pedroProf, 12000]);

  rechazado('ni el dueño del negocio puede traerlo a SU PROPIA cuenta personal: no es su plata',
    await llamar(barberia.uid, 'select public.traer_ingreso_de_trabajo($1,$2)',
      [barberia.empresaId, barberia.empresaId]),
    'No trabajás');

  ok('sigue esperando a que Pedro lo traiga él mismo',
    num((await valor(uidPedro, 'select public.trabajos_pendientes() j', [])).j[0].pendiente), 12000);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · No se puede traer a una cuenta que no es personal');
  // ═══════════════════════════════════════════════════════════

  rechazado('un vendedor no le puede pasar el negocio como si fuera su cuenta',
    await llamar(uidPedro, 'select public.traer_ingreso_de_trabajo($1,$2)',
      [barberia.empresaId, barberia.empresaId]),
    'cuenta personal');

  console.log('\n══════════════════════════════════════════════════════════════');
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE INGRESO DE TRABAJO FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE INGRESO DE TRABAJO PASARON`);
  process.exit(0);
})().catch((e) => { console.error('error inesperado:', e); process.exit(2); });
