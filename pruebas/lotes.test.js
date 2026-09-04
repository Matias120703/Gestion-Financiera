/**
 * Pruebas de los lotes (migraciones 044 y 045).
 *
 * El caso real: Matías compra cuarenta novillos en marzo, les pone plata
 * todos los meses —alimento, sanidad, flete— y recién los vende en octubre.
 * Durante siete meses el sistema le muestra pura pérdida, y un día una
 * ganancia enorme. Ninguna de las dos cosas es verdad: la verdad es del
 * ciclo.
 *
 * Lo que se comprueba acá es que esa segunda vista NO invente una
 * contabilidad paralela. El lote no guarda montos: los saca de los mismos
 * movimientos que ya alimentan el panel y el cierre. Si un gasto se anula, el
 * lote se entera solo. Si un movimiento es de otra empresa, la base
 * directamente no lo deja colgar.
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

  const campo = await H.montarEmpresa(db, { email: 'dueno@estancia.com', nombre: 'Estancia La Esperanza' });
  const uidPeon = await H.sumarMiembro(db, campo.empresaId, 'peon@estancia.com', 'vendedor');

  const llamar = (uid, sql, args) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args) => {
    const r = await llamar(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };
  const crudo = async (sql, args) => (await db.query(sql, args)).rows[0];

  /** Carga un gasto como lo carga la pantalla: insert directo bajo RLS. */
  const gasto = async (uid, empresa, monto, descripcion, lote = null) => {
    const r = await H.intentar(db, uid, () => db.query(
      `insert into public.movimientos
         (empresa_id, tipo, estado, fecha, descripcion, categoria,
          subtotal, descuento, monto, costo_total, metodo_pago, creado_por, lote_id)
       values ($1, 'gasto', 'activo', public.hoy_empresa($1), $2, 'Insumos',
               $3, 0, $3, 0, 'efectivo', $4, $5)
       returning id`,
      [empresa, descripcion, monto, uid, lote]));
    return r.ok ? r.valor.rows[0].id : r;
  };

  const lotes = async (uid, empresa, cerrados = false) =>
    (await valor(uid, 'select public.listar_lotes($1,$2) j', [empresa, cerrados])).j;
  const unLote = async (uid, empresa, id, cerrados = true) =>
    (await lotes(uid, empresa, cerrados)).find((l) => l.id === id);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Abrir el lote');
  // ═══════════════════════════════════════════════════════════

  rechazado('un peón no abre un lote: es decidir cómo se mide el negocio',
    await llamar(uidPeon, "select public.guardar_lote($1,'Novillos corral 3','cabezas',40)",
      [campo.empresaId]),
    'Solo administración');

  rechazado('ni un lote sin nombre',
    await llamar(campo.uid, "select public.guardar_lote($1,'   ')", [campo.empresaId]),
    'necesita un nombre');

  rechazado('ni con una cantidad negativa',
    await llamar(campo.uid, "select public.guardar_lote($1,'Raro','cabezas',-5)", [campo.empresaId]),
    'no puede ser negativa');

  const corral = (await valor(campo.uid,
    "select public.guardar_lote($1,'Novillos corral 3','cabezas',40) as id",
    [campo.empresaId])).id;
  aceptado('el dueño abre el corral con 40 cabezas', { ok: true });

  const abierto = await unLote(campo.uid, campo.empresaId, corral);
  ok('arranca abierto', abierto.estado, 'abierto');
  ok('sin nada puesto', num(abierto.puesto), 0);
  ok('sin nada cobrado', num(abierto.cobrado), 0);
  ok('y sin movimientos', num(abierto.movimientos), 0);
  ok('el peón sí puede verlo, para poder cargarle gastos',
    (await lotes(uidPeon, campo.empresaId)).length, 1);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Ponerle plata durante meses');
  // ═══════════════════════════════════════════════════════════

  const compra = await gasto(campo.uid, campo.empresaId, 5000000, 'Compra de 40 novillos', corral);
  await gasto(uidPeon, campo.empresaId, 800000, 'Balanceado', corral);
  await gasto(uidPeon, campo.empresaId, 300000, 'Sanidad', corral);

  const cargado = await unLote(campo.uid, campo.empresaId, corral);
  ok('lleva puesto lo que se gastó', num(cargado.puesto), 6100000);
  ok('con sus tres movimientos', num(cargado.movimientos), 3);
  ok('todavía no cobró nada', num(cargado.cobrado), 0);
  ok('así que el resultado va en rojo, que es la verdad del ciclo',
    num(cargado.resultado), -6100000);
  ok('y por cabeza también', num(cargado.por_unidad), -152500);

  ok('el peón que carga el balanceado ve lo mismo',
    num((await unLote(uidPeon, campo.empresaId, corral)).puesto), 6100000);

  // Un gasto del mismo negocio pero sin lote no le entra a ninguno.
  await gasto(campo.uid, campo.empresaId, 200000, 'Nafta de la camioneta');
  ok('un gasto suelto no se le carga solo al lote',
    num((await unLote(campo.uid, campo.empresaId, corral)).puesto), 6100000);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Anular un gasto lo saca de la cuenta');
  // ═══════════════════════════════════════════════════════════

  aceptado('se anula la compra, que estaba cargada dos veces',
    await llamar(campo.uid, "select public.anular_movimiento($1,'Estaba duplicada')", [compra]));

  const anulado = await unLote(campo.uid, campo.empresaId, corral);
  ok('el lote se entera solo: no guarda totales propios', num(anulado.puesto), 1100000);
  ok('y deja de contarlo entre sus movimientos', num(anulado.movimientos), 2);

  // Se vuelve a cargar bien, para seguir el ciclo.
  await gasto(campo.uid, campo.empresaId, 5000000, 'Compra de 40 novillos', corral);
  ok('recargada, vuelve a estar', num((await unLote(campo.uid, campo.empresaId, corral)).puesto), 6100000);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Venderlos');
  // ═══════════════════════════════════════════════════════════

  const venta = (await valor(campo.uid,
    `select public.registrar_venta($1, $2::jsonb, null, 'Venta de 40 novillos') as id`,
    [campo.empresaId,
      JSON.stringify([{ nombre: '40 novillos gordos', cantidad: 1, precio_unitario: 9000000 }])])).id;

  ok('recién vendida, la venta todavía no es de ningún lote',
    (await crudo('select lote_id from public.movimientos where id=$1', [venta])).lote_id, null);

  aceptado('se le asigna al corral', await llamar(campo.uid,
    'select public.asignar_a_lote($1,$2)', [venta, corral]));

  const vendido = await unLote(campo.uid, campo.empresaId, corral);
  ok('el lote cobró los nueve millones', num(vendido.cobrado), 9000000);
  ok('y el ciclo cerró en ganancia', num(vendido.resultado), 2900000);
  ok('lo que da por cabeza', num(vendido.por_unidad), 72500);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Nadie le cuelga plata al lote de otro');
  // ═══════════════════════════════════════════════════════════

  const vecino = await H.montarEmpresa(db, { email: 'vecino@otra.com', nombre: 'Estancia del vecino' });

  rechazado('el vecino no lee los lotes ajenos',
    await llamar(vecino.uid, 'select public.listar_lotes($1)', [campo.empresaId]),
    'No pertenecés');

  const gastoVecino = await gasto(vecino.uid, vecino.empresaId, 100000, 'Su propio gasto');
  rechazado('ni le cuelga un gasto suyo al lote del otro',
    await llamar(vecino.uid, 'select public.asignar_a_lote($1,$2)', [gastoVecino, corral]),
    'no es de esta cuenta');

  // Y aunque alguien se saltee la función, la llave compuesta lo frena en la
  // tabla. Se escribe como DUEÑO de la base —sin RLS y sin permisos de por
  // medio— para que lo único que pueda rechazarlo sea la llave misma.
  const comoDueno = async (sql, args) => {
    try { await db.query(sql, args); return { ok: true, error: null }; }
    catch (e) { return { ok: false, error: e.message ?? String(e) }; }
  };

  rechazado('ni la base misma deja escribir esa fila',
    await comoDueno('update public.movimientos set lote_id = $1 where id = $2', [corral, gastoVecino]),
    'foreign key|movimientos_lote_fk');

  rechazado('ni el vecino puede tocar un movimiento ajeno',
    await llamar(vecino.uid, 'select public.asignar_a_lote($1,null)', [venta]),
    'No pertenecés');

  ok('el corral quedó como estaba',
    num((await unLote(campo.uid, campo.empresaId, corral)).cobrado), 9000000);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Sacarle un movimiento');
  // ═══════════════════════════════════════════════════════════

  aceptado('se le saca la venta, que era de otro corral',
    await llamar(campo.uid, 'select public.asignar_a_lote($1,null)', [venta]));
  ok('el lote vuelve a estar sin cobrar',
    num((await unLote(campo.uid, campo.empresaId, corral)).cobrado), 0);

  aceptado('y se le devuelve', await llamar(uidPeon,
    'select public.asignar_a_lote($1,$2)', [venta, corral]));

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Cerrar el ciclo');
  // ═══════════════════════════════════════════════════════════

  rechazado('un peón no cierra un lote',
    await llamar(uidPeon, 'select public.cerrar_lote($1,$2)', [campo.empresaId, corral]),
    'Solo administración');

  rechazado('ni se cierra antes de haberse abierto',
    await llamar(campo.uid, "select public.cerrar_lote($1,$2,'2020-01-01')", [campo.empresaId, corral]),
    'antes de haberse abierto');

  aceptado('el dueño lo cierra', await llamar(campo.uid,
    'select public.cerrar_lote($1,$2)', [campo.empresaId, corral]));

  ok('sale de la lista de lo que está en curso',
    (await lotes(campo.uid, campo.empresaId, false)).length, 0);
  ok('pero sigue estando si se piden los cerrados',
    (await lotes(campo.uid, campo.empresaId, true)).length, 1);
  ok('con su resultado intacto',
    num((await unLote(campo.uid, campo.empresaId, corral)).resultado), 2900000);

  ok('cerrar dos veces avisa que ya estaba',
    (await valor(campo.uid, 'select public.cerrar_lote($1,$2) j', [campo.empresaId, corral])).j.ya_estaba,
    true);

  // Un lote cerrado que recibe una corrección muestra el número corregido:
  // el resultado se calcula, no se congela al cerrar.
  await gasto(campo.uid, campo.empresaId, 100000, 'Flete que faltaba', corral);
  ok('un gasto que aparece después del cierre corrige el resultado igual',
    num((await unLote(campo.uid, campo.empresaId, corral)).resultado), 2800000);

  aceptado('se puede reabrir', await llamar(campo.uid,
    'select public.reabrir_lote($1,$2)', [campo.empresaId, corral]));
  ok('y vuelve a la lista de lo que está en curso',
    (await lotes(campo.uid, campo.empresaId, false)).length, 1);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Borrar solo lo que está vacío');
  // ═══════════════════════════════════════════════════════════

  rechazado('no se borra un lote con plata cargada',
    await llamar(campo.uid, 'select public.borrar_lote($1,$2)', [campo.empresaId, corral]),
    'movimientos cargados');

  const vacio = (await valor(campo.uid,
    "select public.guardar_lote($1,'Corral que abrí por error') as id", [campo.empresaId])).id;
  rechazado('un peón tampoco lo borra',
    await llamar(uidPeon, 'select public.borrar_lote($1,$2)', [campo.empresaId, vacio]),
    'Solo administración');
  aceptado('uno vacío sí', await llamar(campo.uid,
    'select public.borrar_lote($1,$2)', [campo.empresaId, vacio]));

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Lo que todavía no es de ningún lote');
  // ═══════════════════════════════════════════════════════════

  const sueltos = (await valor(campo.uid,
    'select public.movimientos_sin_lote($1, public.hoy_empresa($1) - 30, public.hoy_empresa($1)) j',
    [campo.empresaId])).j;

  ok('aparece la nafta, que no es de ningún corral', sueltos.length, 1);
  ok('y es la que es', sueltos[0].descripcion, 'Nafta de la camioneta');

  ok('el detalle del lote trae sus movimientos',
    (await valor(campo.uid, 'select public.resumen_lote($1,$2) j',
      [campo.empresaId, corral])).j.movimientos.length > 0, true);

  ok('y NO trae el costo reservado del núcleo',
    Object.keys((await valor(campo.uid, 'select public.resumen_lote($1,$2) j',
      [campo.empresaId, corral])).j.movimientos[0]).includes('costo_total'), false);

  rechazado('el vecino no lee el detalle de un lote ajeno',
    await llamar(vecino.uid, 'select public.resumen_lote($1,$2)', [campo.empresaId, corral]),
    'No pertenecés');

  console.log('\n══════════════════════════════════════════════════════════════');
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE LOTES FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE LOTES PASARON`);
  process.exit(0);
})().catch((e) => { console.error('error inesperado:', e); process.exit(2); });
