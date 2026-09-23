/**
 * El paquete de clases (migración 088).
 *
 * LO QUE SE PRUEBA
 *
 * Matías eligió «se gana al cobrar»: el paquete se cobra como una venta y
 * listo. Así que lo primero que se prueba es que la plata vaya EXACTAMENTE
 * por el camino de siempre —billetera, ganancia, fiado— y que el paquete no
 * invente plata por su cuenta. Un contador de clases que tocara la ganancia
 * sería contar la misma plata dos veces.
 *
 * Después, el contador: que no se pueda usar más de lo que se pagó, que dos
 * toques juntos no descuenten dos veces la última clase, que un paquete
 * vencido o cerrado no acepte clases, y que deshacer vuelva todo atrás.
 *
 * Y que nadie de afuera toque los paquetes de otro.
 */
const H = require('./ayuda-db.js');

let fallos = 0;
let corridas = 0;

function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a}`);
}

function rechazado(nombre, res, frag) {
  corridas++;
  if (res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      NO fue rechazada`); return; }
  if (frag && !new RegExp(frag, 'i').test(res.error)) {
    fallos++; console.log(`  ✗ ${nombre}\n      otro motivo: ${res.error}`); return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 64)}`);
}

(async () => {
  const db = await H.crearBase();

  const P = await H.montarEmpresa(db, { email: 'profe@ingles.com', nombre: 'Clases de inglés', rubro: 'clases' });
  const Otro = await H.montarEmpresa(db, { email: 'otro@academia.com', nombre: 'Otra academia', rubro: 'clases' });
  // Desde la 102 un profe o un trainer prueban Básico, que es de una sola
  // persona: el ayudante es una silla paga (048), como la compraría él.
  await db.query('update public.suscripciones set tope_vendedores = 1 where empresa_id = $1', [P.empresaId]);
  const ayudante = await H.sumarMiembro(db, P.empresaId, 'ayuda@ingles.com', 'vendedor');

  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };

  // El alumno, con la función de siempre.
  const alumno = (await valor(P.uid,
    'select public.guardar_cliente($1, $2, $3, $4, $5) id',
    [P.empresaId, 'Juan Pérez', '0981111111', '', null])).id;

  const vender = (uid, args) => como(uid,
    'select public.vender_paquete($1,$2,$3,$4,$5,$6,$7,$8) j', args);
  const paquetes = async () => (await valor(P.uid,
    'select public.paquetes_del_alumno($1,$2) j', [P.empresaId, alumno])).j;
  const dar = (uid, paquete, cantidad = 1, extra = {}) => como(uid,
    'select public.dar_clase($1,$2,$3,$4) j',
    [paquete, cantidad, extra.fecha ?? null, extra.motivo ?? 'dada']);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · La plata va por el camino de siempre');
  // ═══════════════════════════════════════════════════════════
  const venta = await vender(P.uid, [P.empresaId, alumno, '8 clases de inglés', 8, 400000, 'efectivo', null, null]);
  ok('se vende', venta.ok, true);
  const { paquete: p1, movimiento: m1 } = venta.valor.rows[0].j;

  const mov = (await db.query(
    'select tipo, monto, cliente_id, metodo_pago from public.movimientos where id = $1', [m1])).rows[0];
  ok('es una venta como cualquier otra', mov.tipo, 'venta');
  ok('por el precio del paquete, completo', Number(mov.monto), 400000);
  ok('a nombre del alumno', mov.cliente_id, alumno);

  // «Se gana al cobrar»: los 400.000 cuentan hoy, enteros.
  const ganancia = (await valor(P.uid,
    'select public.resumen_financiero($1, public.hoy_empresa($1), public.hoy_empresa($1)) j',
    [P.empresaId])).j;
  ok('suma entera en lo cobrado hoy', Number(ganancia.ventas), 400000);
  ok('y sin costo: una clase no tiene mercadería', Number(ganancia.ganancia_bruta), 400000);

  // Dar una clase NO puede tocar la plata: sería contarla dos veces.
  await dar(P.uid, p1);
  const despues = (await valor(P.uid,
    'select public.resumen_financiero($1, public.hoy_empresa($1), public.hoy_empresa($1)) j',
    [P.empresaId])).j;
  ok('dar una clase no cambia lo cobrado', Number(despues.ventas), 400000);
  ok('ni crea movimientos nuevos',
    (await db.query('select count(*)::int n from public.movimientos where empresa_id = $1', [P.empresaId])).rows[0].n, 1);

  // Fiado: si el alumno paga a fin de mes, la deuda aparece sola. La forma
  // de pago del fiado se llama 'credito' (055), y el paquete la respeta
  // porque no valida nada por su cuenta: se lo deja a `registrar_venta`.
  const fiado = await vender(P.uid, [P.empresaId, alumno, 'Paquete fiado', 4, 200000, 'credito', null, null]);
  ok('un paquete fiado se vende igual', fiado.ok, true);
  ok('y el alumno queda debiéndolo',
    Number((await db.query('select public.saldo_fiado($1) s', [alumno])).rows[0].s), 200000);
  // Una forma de pago inventada la frena la venta, no el paquete.
  rechazado('una forma de pago que no existe no pasa',
    await vender(P.uid, [P.empresaId, alumno, 'Raro', 4, 1000, 'trueque', null, null]), 'no es válida');

  // Una clase de prueba gratis: paquete sin venta.
  const gratis = await vender(P.uid, [P.empresaId, alumno, 'Clase de prueba', 1, 0, 'efectivo', null, null]);
  ok('una clase de prueba gratis se anota', gratis.ok, true);
  ok('sin inventar una venta de cero', gratis.valor.rows[0].j.movimiento, null);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · El contador');
  // ═══════════════════════════════════════════════════════════
  let lista = await paquetes();
  let uno = lista.find((x) => x.id === p1);
  ok('después de una clase: usada una', Number(uno.usadas), 1);
  ok('quedan siete', Number(uno.quedan), 7);
  ok('y sigue activo', uno.estado, 'activo');
  ok('con su historia, fechada', uno.historia.length, 1);

  // Hora y media cuenta 1,5: por eso el contador es numeric.
  await dar(P.uid, p1, 1.5);
  uno = (await paquetes()).find((x) => x.id === p1);
  ok('una clase de hora y media descuenta 1,5', Number(uno.quedan), 5.5);

  // La falta que se decidió descontar resta igual, pero no es una clase.
  await dar(P.uid, p1, 1, { motivo: 'falta' });
  uno = (await paquetes()).find((x) => x.id === p1);
  ok('una falta descontada también resta', Number(uno.quedan), 4.5);
  ok('pero queda anotada como falta', uno.historia[0].motivo, 'falta');

  rechazado('no se puede usar más de lo que se pagó',
    await dar(P.uid, p1, 5), 'quedan');
  rechazado('ni descontar cero',
    await dar(P.uid, p1, 0), 'al menos una');
  rechazado('ni un motivo inventado',
    await dar(P.uid, p1, 1, { motivo: 'vacaciones' }), 'ni una falta');

  // Se usa todo: queda terminado y no acepta más.
  await dar(P.uid, p1, 4.5);
  uno = (await paquetes()).find((x) => x.id === p1);
  ok('usado entero queda terminado', uno.estado, 'terminado');
  rechazado('y no acepta una clase más', await dar(P.uid, p1), 'quedan');

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Deshacer lo tocado por error');
  // ═══════════════════════════════════════════════════════════
  const ultima = uno.historia[0].id;
  const vuelta = await como(P.uid, 'select public.deshacer_clase($1) j', [ultima]);
  ok('se deshace', vuelta.ok, true);
  uno = (await paquetes()).find((x) => x.id === p1);
  ok('y la clase vuelve a estar disponible', Number(uno.quedan), 4.5);
  ok('y el paquete vuelve a estar activo', uno.estado, 'activo');
  ok('sin tocar la venta', (await db.query('select estado from public.movimientos where id = $1', [m1])).rows[0].estado, 'activo');

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Vencido y cerrado');
  // ═══════════════════════════════════════════════════════════
  // Vence ayer: no acepta una clase de hoy.
  const hoy = (await db.query('select public.hoy_empresa($1) d', [P.empresaId])).rows[0].d;
  const vence = await vender(P.uid,
    [P.empresaId, alumno, 'Paquete de agosto', 8, 400000, 'efectivo', '2026-08-01', '2026-08-31']);
  const pv = vence.valor.rows[0].j.paquete;
  rechazado('una clase después del vencimiento no entra', await dar(P.uid, pv), 'venció');
  // Pero una clase del 30 anotada tarde sí: importa cuándo fue, no cuándo se cargó.
  const tarde = await dar(P.uid, pv, 1, { fecha: '2026-08-30' });
  ok('una clase dada antes de vencer se anota aunque sea tarde', tarde.ok, true);
  ok('el paquete vencido lo dice',
    (await paquetes()).find((x) => x.id === pv).estado, 'vencido');

  rechazado('no puede vencer antes de venderse',
    await vender(P.uid, [P.empresaId, alumno, 'Al revés', 4, 100, 'efectivo', '2026-09-10', '2026-09-01']),
    'antes de venderse');

  // Cerrar: el alumno abandonó.
  const abierto = (await vender(P.uid, [P.empresaId, alumno, 'Abandonado', 8, 400000, 'efectivo', null, null]))
    .valor.rows[0].j.paquete;
  ok('se cierra',
    (await como(P.uid, 'select public.cerrar_paquete($1, true) j', [abierto])).valor.rows[0].j.estado, 'cerrado');
  rechazado('y cerrado no acepta clases', await dar(P.uid, abierto), 'cerrado');
  ok('pero se puede reabrir: a veces vuelven',
    (await como(P.uid, 'select public.cerrar_paquete($1, false) j', [abierto])).valor.rows[0].j.estado, 'activo');

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Quién puede qué');
  // ═══════════════════════════════════════════════════════════
  // El ayudante da clases, como vende un vendedor.
  ok('un ayudante descuenta una clase', (await dar(ayudante, abierto)).ok, true);
  rechazado('pero no cierra un paquete: es decidir que unas clases pagadas no se dan',
    await como(ayudante, 'select public.cerrar_paquete($1, true)', [abierto]), 'dueño');

  // Otra academia no ve ni toca nada de acá.
  rechazado('otra academia no ve los paquetes',
    await como(Otro.uid, 'select public.paquetes_del_alumno($1,$2)', [P.empresaId, alumno]), 'pertenecés');
  rechazado('ni descuenta clases de acá', await dar(Otro.uid, abierto), 'pertenecés');
  rechazado('ni le vende un paquete a un alumno ajeno',
    await vender(Otro.uid, [Otro.empresaId, alumno, 'Robado', 8, 1, 'efectivo', null, null]), 'no es de esta cuenta');
  rechazado('ni deshace clases de otro',
    await como(Otro.uid, 'select public.deshacer_clase($1)', [uno.historia[0].id]), 'pertenecés');

  // Las tablas no se leen directo: todo pasa por las funciones de arriba.
  rechazado('la tabla de paquetes no se lee directo',
    await como(P.uid, 'select * from public.paquetes'), 'permission denied');
  rechazado('ni la de clases', await como(P.uid, 'select * from public.clases_dadas'), 'permission denied');

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Dos toques a la vez');
  // ═══════════════════════════════════════════════════════════
  // La agenda y el profe tocando la misma reserva no descuentan dos veces.
  const conTurno = (await vender(P.uid, [P.empresaId, alumno, 'Con turno', 8, 1, 'efectivo', null, null]))
    .valor.rows[0].j.paquete;
  // Con los ayudantes de siempre, como lo arma la batería de la agenda.
  const producto = await H.crearProducto(db, P.empresaId, P.uid,
    { nombre: 'Clase', costo: 0, precio: 50000, controla_stock: false });
  const profe = (await valor(P.uid,
    "select public.guardar_profesional($1,$2,'comision',50,$3) as id",
    [P.empresaId, 'Profe', P.uid])).id;
  const turno = (await db.query(
    `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina, cliente_nombre)
     values ($1, $2, $3, now(), now() + interval '1 hour', 'Juan Pérez') returning id`,
    [P.empresaId, profe, producto])).rows[0].id;
  const primera = await como(P.uid, 'select public.dar_clase($1,1,null,$2,$3) j', [conTurno, 'dada', turno]);
  ok('un turno descuenta una vez', primera.ok, true);
  rechazado('y la segunda vez que se toca, no',
    await como(P.uid, 'select public.dar_clase($1,1,null,$2,$3) j', [conTurno, 'dada', turno]), 'duplicate|unique|único');

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE PAQUETES FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE PAQUETES PASARON`);
  process.exit(0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
