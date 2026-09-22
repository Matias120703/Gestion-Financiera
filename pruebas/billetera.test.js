/**
 * La billetera: cuánto hay en cada banco (migración 074).
 *
 * LO QUE SE PRUEBA ES QUE EL SALDO DIGA LA VERDAD
 *
 * Un saldo que se mueve solo es una promesa grande: si una venta cae en la
 * cuenta equivocada, se cuenta dos veces o una anulada sigue sumando, la
 * persona mira su banco, ve otro número y deja de creerle a toda la app.
 *
 * Por eso se prueba cada puerta: la venta, el gasto, la anulación, el cambio
 * de forma de pago, lo cargado antes de crear la cuenta, el ajuste, la
 * transferencia. Y que nadie de afuera pueda meter plata en el saldo de otro.
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

function aceptado(nombre, res) {
  corridas++;
  if (!res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      falló: ${res.error}`); return; }
  console.log(`  ✓ ${nombre}`);
}

(async () => {
  const db = await H.crearBase();

  const A = await H.montarEmpresa(db, { email: 'duena@kiosco.com', nombre: 'Kiosco Ana' });
  const B = await H.montarEmpresa(db, { email: 'dueno@otro.com', nombre: 'Otro negocio' });
  const vendedor = await H.sumarMiembro(db, A.empresaId, 'vende@kiosco.com', 'vendedor');

  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };
  const billetera = async (uid = A.uid, empresa = A.empresaId) =>
    (await valor(uid, 'select public.billetera($1) j', [empresa])).j;
  const saldoDe = async (id) => Number((await billetera()).cuentas.find((c) => c.id === id)?.saldo);

  // Un movimiento cargado como superusuario: acá se prueba a qué cuenta va y
  // cuánto suma, no el permiso para vender (eso tiene sus propias pruebas).
  const cargar = async (empresa, tipo, monto, metodo, extra = {}) => (await db.query(
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, metodo_pago, cuenta_id)
     values ($1, $2, public.hoy_empresa($1), 'Prueba', 'General', $3, $3, $4, $5) returning id, cuenta_id`,
    [empresa, tipo, monto, metodo, extra.cuenta ?? null])).rows[0];

  // Antes de crear las cuentas: esto ya está dentro del saldo que se escribe al crearlas.
  const viejo = await cargar(A.empresaId, 'ingreso', 999999, 'efectivo');

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Crear las cuentas');
  // ═══════════════════════════════════════════════════════════
  const efectivo = (await valor(A.uid,
    'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id',
    [A.empresaId, 'Efectivo', 'efectivo', 100000, ['efectivo']])).id;
  const familiar = (await valor(A.uid,
    'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id',
    [A.empresaId, 'Banco Familiar', 'banco', 500000, ['transferencia', 'tarjeta']])).id;

  let b = await billetera();
  ok('las dos cuentas aparecen', b.cuentas.map((c) => c.nombre), ['Efectivo', 'Banco Familiar']);
  ok('cada una con el saldo que se escribió', [await saldoDe(efectivo), await saldoDe(familiar)], [100000, 500000]);
  ok('y el total suma las dos', Number(b.total), 600000);
  ok('lo cargado antes no se cuenta dos veces', viejo.cuenta_id, null);

  rechazado('una cuenta sin nombre no',
    await como(A.uid, 'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5)', [A.empresaId, ' ', 'banco', 0, []]),
    'nombre');

  // ═══════════════════════════════════════════════════════════
  grupo('2 · El saldo se mueve con lo que se carga');
  // ═══════════════════════════════════════════════════════════
  const cobro = await cargar(A.empresaId, 'venta', 50000, 'efectivo');
  ok('una venta en efectivo va a Efectivo', cobro.cuenta_id, efectivo);
  ok('y suma', await saldoDe(efectivo), 150000);

  const luz = await cargar(A.empresaId, 'gasto', 20000, 'transferencia');
  ok('un gasto por transferencia va al banco', luz.cuenta_id, familiar);
  ok('y resta', await saldoDe(familiar), 480000);

  const tarjeta = await cargar(A.empresaId, 'venta', 30000, 'tarjeta');
  ok('lo cobrado con tarjeta, también al banco', await saldoDe(familiar), 510000);

  // Anulada no suma: la venta que no fue no está en ningún banco.
  await db.query(`update public.movimientos set estado = 'anulado', anulado_por = $2, anulado_at = now(),
    motivo_anulacion = 'error' where id = $1`, [tarjeta.id, A.uid]);
  ok('una venta anulada deja de sumar', await saldoDe(familiar), 480000);

  // Se corrige la forma de pago: el gasto se muda de cuenta.
  await db.query(`update public.movimientos set metodo_pago = 'efectivo' where id = $1`, [luz.id]);
  ok('cambiar la forma de pago lo muda de cuenta',
    [await saldoDe(familiar), await saldoDe(efectivo)], [500000, 130000]);

  const suelto = await cargar(A.empresaId, 'ingreso', 7000, 'credito');
  ok('una forma de pago sin cuenta no cae en ninguna', suelto.cuenta_id, null);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Cada forma de pago, en una sola cuenta');
  // ═══════════════════════════════════════════════════════════
  const itau = (await valor(A.uid,
    'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id',
    [A.empresaId, 'Itaú', 'banco', 0, ['transferencia']])).id;
  b = await billetera();
  ok('marcar transferencia en el Itaú la saca del Familiar',
    b.cuentas.find((c) => c.id === familiar).metodos, ['tarjeta']);
  ok('las transferencias nuevas van al Itaú',
    (await cargar(A.empresaId, 'ingreso', 80000, 'transferencia')).cuenta_id, itau);
  ok('y las viejas se quedan donde estaban', await saldoDe(familiar), 500000);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Ajustar y transferir');
  // ═══════════════════════════════════════════════════════════
  const ajuste = await valor(A.uid, 'select public.ajustar_saldo_cuenta($1,$2,$3,$4) j',
    [A.empresaId, familiar, 497500, 'comisión del banco']);
  ok('ajustar a lo que dice el banco deja la diferencia', Number(ajuste.j.diferencia), -2500);
  ok('y el saldo queda en lo real', await saldoDe(familiar), 497500);
  ok('sin tocar el saldo con que se creó',
    Number((await db.query('select saldo_inicial from public.cuentas_dinero where id=$1', [familiar])).rows[0].saldo_inicial), 500000);

  const totalAntes = Number((await billetera()).total);
  aceptado('pasar 100.000 del banco al efectivo',
    await como(A.uid, 'select public.transferir_entre_cuentas($1,$2,$3,$4)', [A.empresaId, familiar, efectivo, 100000]));
  ok('sale de una y entra en la otra', [await saldoDe(familiar), await saldoDe(efectivo)], [397500, 230000]);
  ok('y el total no cambia: no es un gasto', Number((await billetera()).total), totalAntes);

  rechazado('ni a la misma cuenta',
    await como(A.uid, 'select public.transferir_entre_cuentas($1,$2,$3,$4)', [A.empresaId, familiar, familiar, 10]),
    'dos cuentas distintas');

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Quitar una cuenta');
  // ═══════════════════════════════════════════════════════════
  const vacia = (await valor(A.uid, 'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id',
    [A.empresaId, 'Tigo Money', 'billetera', 0, []])).id;
  ok('una cuenta sin historia se borra',
    (await valor(A.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [A.empresaId, vacia])).j.archivada, false);
  ok('una con historia se archiva',
    (await valor(A.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [A.empresaId, itau])).j.archivada, true);
  ok('y deja de verse en la billetera', (await billetera()).cuentas.some((c) => c.id === itau), false);
  ok('ni recibe transferencias nuevas', (await cargar(A.empresaId, 'ingreso', 1000, 'transferencia')).cuenta_id, null);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Nadie mira ni toca la plata de otro');
  // ═══════════════════════════════════════════════════════════
  rechazado('un vendedor no ve la billetera',
    await como(vendedor, 'select public.billetera($1)', [A.empresaId]), 'dueño');
  rechazado('ni crea cuentas',
    await como(vendedor, 'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5)', [A.empresaId, 'Mía', 'banco', 0, []]), 'dueño');
  rechazado('otro negocio no ve la billetera ajena',
    await como(B.uid, 'select public.billetera($1)', [A.empresaId]), 'dueño');
  rechazado('ni la ajusta',
    await como(B.uid, 'select public.ajustar_saldo_cuenta($1,$2,$3,$4)', [A.empresaId, efectivo, 1, '']), 'dueño');

  const antes = await saldoDe(efectivo);
  const colado = await cargar(B.empresaId, 'ingreso', 5000000, 'efectivo', { cuenta: efectivo });
  ok('un movimiento de otro negocio no entra en una cuenta ajena aunque la nombre', colado.cuenta_id, null);
  ok('y el saldo de la dueña no se mueve', await saldoDe(efectivo), antes);

  rechazado('las tablas no se leen directo',
    await como(A.uid, 'select * from public.cuentas_dinero'), 'permission denied');

  // ═══════════════════════════════════════════════════════════
  grupo('9 · La cuenta elegida a mano (075)');
  // ═══════════════════════════════════════════════════════════
  //
  // Con dos bancos, «transferencia» no dice a cuál de los dos. Quien carga
  // el gasto puede decirlo, y lo que diga manda sobre el reparto por forma
  // de pago de la 074.
  const segundoBanco = (await valor(A.uid,
    'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id',
    [A.empresaId, 'Banco Atlas', 'banco', 0, []])).id;

  const saldoAntesAtlas = await saldoDe(segundoBanco);
  const saldoAntesFamiliar = await saldoDe(familiar);
  const aMano = await cargar(A.empresaId, 'gasto', 30000, 'transferencia', { cuenta: segundoBanco });
  ok('la cuenta elegida gana sobre la forma de pago', aMano.cuenta_id, segundoBanco);
  ok('y el gasto sale de esa', await saldoDe(segundoBanco), saldoAntesAtlas - 30000);
  ok('la otra queda igual', await saldoDe(familiar), saldoAntesFamiliar);

  // Las cuentas para llenar el selector: sin saldo y solo para quien administra.
  const paraElegir = (await valor(A.uid, 'select public.cuentas_para_elegir($1) j', [A.empresaId])).j;
  ok('el selector trae las cuentas activas', paraElegir.map((c) => c.nombre),
    ['Efectivo', 'Banco Familiar', 'Banco Atlas']);
  // Lleva las formas de pago para poder decir a dónde iría «automática»
  // (083), pero NUNCA el saldo: quien carga un gasto no tiene por qué
  // enterarse de cuánta plata hay en cada cuenta.
  ok('y sin el saldo adentro', Object.keys(paraElegir[0]).sort(), ['color', 'id', 'metodos', 'nombre', 'tipo']);
  rechazado('un vendedor no elige cuentas',
    await como(vendedor, 'select public.cuentas_para_elegir($1)', [A.empresaId]), 'dueño');

  // El sueldo se cobra siempre en el mismo lado, así que se guarda una vez.
  const sueldo = (await valor(A.uid,
    'select public.guardar_ingreso_fijo($1,$2,$3,$4,$5,$6,$7) id',
    [A.empresaId, 'Sueldo', 3000000, 30, true, null, segundoBanco])).id;
  ok('el ingreso fijo recuerda dónde se cobra',
    (await db.query('select cuenta_id from public.ingresos_fijos where id = $1', [sueldo])).rows[0].cuenta_id,
    segundoBanco);

  aceptado('y se puede dejar sin definir',
    await como(A.uid, 'select public.guardar_ingreso_fijo($1,$2,$3,$4,$5,$6,$7)',
      [A.empresaId, 'Sueldo', 3000000, 30, true, sueldo, null]));
  ok('queda en null', (await db.query('select cuenta_id from public.ingresos_fijos where id = $1', [sueldo])).rows[0].cuenta_id, null);

  rechazado('una cuenta de otro negocio no se acepta ni acá',
    await como(A.uid, 'select public.guardar_ingreso_fijo($1,$2,$3,$4,$5,$6,$7)',
      [A.empresaId, 'Sueldo', 3000000, 30, true, sueldo,
        (await valor(B.uid, 'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id',
          [B.empresaId, 'Ajena', 'banco', 0, []])).id]),
    'no existe');

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Lo que quedó fuera de la billetera (083)');
  // ═══════════════════════════════════════════════════════════
  //
  // Cada forma de pago vive en UNA cuenta. La que no tiene casa hace que el
  // movimiento se guarde sin cuenta y desaparezca del saldo sin avisar. En
  // la base real había Gs. 13.000.000 así. Acá no se adivina dónde va: se
  // muestra y se da cómo asignarlo.
  const C = await H.montarEmpresa(db, { email: 'duenio@charlie.com', nombre: 'Charlie' });
  const caja = (await valor(C.uid,
    'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id',
    [C.empresaId, 'Caja', 'efectivo', 100000, ['efectivo']])).id;

  const billeteraC = async () => (await valor(C.uid, 'select public.billetera($1) j', [C.empresaId])).j;

  ok('con todo asignado no hay nada suelto', (await billeteraC()).sin_cuenta.cantidad, 0);
  ok('pero sí avisa qué formas de pago no tienen cuenta',
    (await billeteraC()).metodos_sin_cuenta, ['credito', 'otro', 'tarjeta', 'transferencia']);

  // Un gasto con una forma de pago que no reclama nadie.
  const gastoSuelto = await cargar(C.empresaId, 'gasto', 45000, 'otro');
  ok('el movimiento quedó sin cuenta', gastoSuelto.cuenta_id, null);
  ok('y el saldo de la caja no lo vio', Number((await billeteraC()).cuentas[0].saldo), 100000);

  let bC = await billeteraC();
  ok('la billetera lo cuenta aparte', [bC.sin_cuenta.cantidad, Number(bC.sin_cuenta.neto)], [1, -45000]);
  ok('y el total sigue siendo solo lo de las cuentas', Number(bC.total), 100000);

  // Un ingreso suelto por el mismo monto no son 45.000 más de desajuste: es cero.
  await cargar(C.empresaId, 'ingreso', 45000, 'otro');
  bC = await billeteraC();
  ok('el neto no suma lo que se cancela', [bC.sin_cuenta.cantidad, Number(bC.sin_cuenta.neto)], [2, 0]);

  const lista = (await valor(C.uid, 'select public.movimientos_sin_cuenta($1) j', [C.empresaId])).j;
  ok('la lista los trae con su forma de pago', lista.length, 2);
  ok('y dice cuál fue', [...new Set(lista.map((x) => x.metodo_pago))], ['otro']);

  // Asignar uno solo.
  const uno = await H.intentar(db, C.uid, () =>
    db.query('select public.asignar_cuenta_a_sueltos($1,$2,$3) j', [C.empresaId, caja, lista[0].id])
      .then((x) => x.rows[0].j));
  aceptado('se puede asignar de a uno', uno);
  ok('y solo movió ese', uno.valor.asignados, 1);
  ok('ahora queda uno suelto', (await billeteraC()).sin_cuenta.cantidad, 1);

  // Y el resto de una.
  const resto = (await valor(C.uid, 'select public.asignar_cuenta_a_sueltos($1,$2) j', [C.empresaId, caja])).j;
  ok('el resto se asigna junto', resto.asignados, 1);
  ok('no queda nada afuera', (await billeteraC()).sin_cuenta.cantidad, 0);
  ok('y la caja ahora refleja los dos: se cancelan entre sí', Number((await billeteraC()).cuentas[0].saldo), 100000);

  // Lo que ya tenía cuenta no se toca desde acá.
  const yaAsignado = (await valor(C.uid, 'select public.asignar_cuenta_a_sueltos($1,$2) j', [C.empresaId, caja])).j;
  ok('volver a correrlo no mueve nada', yaAsignado.asignados, 0);

  const vendedorC = await H.sumarMiembro(db, C.empresaId, 'vende@charlie.com', 'vendedor');
  rechazado('un vendedor no ve lo que quedó suelto',
    await como(vendedorC, 'select public.movimientos_sin_cuenta($1)', [C.empresaId]), 'dueño');

  // ═══════════════════════════════════════════════════════════
  grupo('11 · El color de cada cuenta (086)');
  // ═══════════════════════════════════════════════════════════
  //
  // La lista de bancos vive en la pantalla, no acá: el Atlas es rojo
  // porque se llama Atlas, y para eso no hace falta base. Lo que sí hace
  // falta guardar es el color que alguien elige a mano, que le gana a
  // cualquier cosa que adivinemos por el nombre.

  // El color se lee con la conexión de servicio y no como A: la tabla no
  // se lee directo desde la app, y eso ya tiene su prueba más arriba.
  const colorDe = async (id) =>
    (await db.query('select color from public.cuentas_dinero where id = $1', [id])).rows[0].color;

  const conti = (await valor(A.uid,
    'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id',
    [A.empresaId, 'Banco Continental', 'banco', 0, []])).id;
  ok('una cuenta nueva no trae color propio', await colorDe(conti), null);

  await valor(A.uid, 'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5,$6,$7) id',
    [A.empresaId, 'Banco Continental', 'banco', 0, [], conti, 'violeta']);
  ok('el elegido a mano se guarda', await colorDe(conti), 'violeta');

  // Y llega a las dos funciones que arman cuentas para mostrar: sin esto
  // la columna existe y no la ve nadie.
  ok('viaja hasta el selector',
    (await valor(A.uid, 'select public.cuentas_para_elegir($1) j', [A.empresaId])).j
      .find((c) => c.id === conti).color, 'violeta');
  ok('y hasta la billetera',
    (await billetera()).cuentas.find((c) => c.id === conti).color, 'violeta');

  // Un color inventado no impide guardar: se ignora. Rechazar ahí dejaría
  // a alguien sin poder corregir el nombre de su banco por culpa de un
  // color, que es lo de menos de esa pantalla.
  await valor(A.uid, 'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5,$6,$7) id',
    [A.empresaId, 'Banco Continental', 'banco', 0, [], conti, 'fucsia']);
  ok('uno que no existe se ignora, no rechaza', await colorDe(conti), null);

  // Y la tabla tampoco lo acepta por la puerta de atrás.
  const forzado = await db.query(
    'update public.cuentas_dinero set color = $1 where id = $2', ['dorado', conti],
  ).then(() => ({ ok: true }), (e) => ({ ok: false, error: String(e.message || e) }));
  rechazado('la columna no acepta cualquier cosa', forzado, 'color');

  // ═══════════════════════════════════════════════════════════
  grupo('12 · Al cobrar, a qué banco entró (096)');
  // ═══════════════════════════════════════════════════════════
  // Matías: «al cobrar, si selecciono transferencia, me debería aparecer
  // la opción de a cuál banco se me va a acreditar». Un almacén con dos
  // bancos: las transferencias caen solas en el Atlas.
  const Al = await H.montarEmpresa(db, { email: 'dueno@almacen.com', nombre: 'Almacén Don Luis' });
  const cajero = await H.sumarMiembro(db, Al.empresaId, 'cajero@almacen.com', 'vendedor');
  const nueva = async (nombre, tipo, metodos, uid = Al.uid, empresa = Al.empresaId) => (await valor(uid,
    'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id', [empresa, nombre, tipo, 0, metodos])).id;
  const cajaAl = await nueva('Efectivo', 'efectivo', ['efectivo']);
  const atlas = await nueva('Atlas', 'banco', ['transferencia']);
  const conti2 = await nueva('Continental', 'banco', []);
  const ajena = await nueva('Banco de otro', 'banco', [], B.uid, B.empresaId);
  const saldoAl = async (id) => Number((await billetera(Al.uid, Al.empresaId)).cuentas.find((c) => c.id === id)?.saldo);
  const vender = (uid, metodo, cuentaId, extra = {}) => como(uid,
    'select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => $3, p_cuenta => $4, p_cliente => $5) id',
    [Al.empresaId, JSON.stringify([{ nombre: 'Yerba', cantidad: 1, precio_unitario: 25000 }]), metodo, cuentaId, extra.cliente ?? null]);
  const cuentaDelMov = async (id) => (await db.query('select cuenta_id from public.movimientos where id = $1', [id])).rows[0].cuenta_id;

  const alConti = await vender(Al.uid, 'transferencia', conti2);
  aceptado('se cobra una transferencia diciendo el banco', alConti);
  ok('entra al Continental, donde llegó la plata', await cuentaDelMov(alConti.valor.rows[0].id), conti2);
  ok('el Continental la suma y el Atlas no', [await saldoAl(conti2), await saldoAl(atlas)], [25000, 0]);

  const comoSiempre = await vender(Al.uid, 'transferencia', null);
  ok('sin decir el banco, va al de las transferencias',
    await cuentaDelMov(comoSiempre.valor.rows[0].id), atlas);
  ok('y una venta de siempre, sin el parámetro nuevo, sigue igual', (await valor(Al.uid,
    'select public.registrar_venta($1, $2) id',
    [Al.empresaId, JSON.stringify([{ nombre: 'Pan', cantidad: 2, precio_unitario: 1000 }])])).id !== null, true);
  ok('en efectivo, a la caja', await saldoAl(cajaAl), 2000);

  rechazado('no entra en la cuenta de otra empresa', await vender(Al.uid, 'transferencia', ajena), 'no existe');
  rechazado('un cajero no elige dónde queda la plata del dueño', await vender(cajero, 'transferencia', conti2), 'dueño');
  aceptado('pero vende igual, sin elegir', await vender(cajero, 'transferencia', null));

  const vecino = (await valor(Al.uid, 'select public.guardar_cliente($1,$2,$3,$4,$5) id',
    [Al.empresaId, 'Vecino Ramírez', '0981000000', '', null])).id;
  rechazado('lo fiado no entra en ningún banco', await vender(Al.uid, 'credito', conti2, { cliente: vecino }), 'fiado');
  ok('y nada de eso dejó ventas a medias', (await db.query(
    "select count(*)::int n from public.movimientos where empresa_id = $1 and tipo = 'venta'", [Al.empresaId])).rows[0].n, 4);

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE LA BILLETERA FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE LA BILLETERA PASARON`);
  process.exit(0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
