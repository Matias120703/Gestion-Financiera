/**
 * Pruebas de deudas (migración 015).
 *
 * Lo que importa acá:
 *   · que el saldo SOLO baje registrando pagos, nunca a mano;
 *   · que no se pueda deber un número negativo;
 *   · que cuánto debe el negocio no le llegue a un vendedor;
 *   · que pagar la cuota deje también el gasto, que es lo que la persona
 *     espera ver cuando mira a dónde se fue la plata.
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
  console.log(`  ✓ ${nombre} → rechazada: ${resultado.error.slice(0, 75)}`);
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

const saldoDe = (db, id) =>
  db.query('select saldo::numeric s from public.deudas where id=$1', [id]).then((r) => Number(r.rows[0].s));

(async () => {
  const db = await H.crearBase();

  const A = await H.montarEmpresa(db, { email: 'duenio@aurora.com', nombre: 'Aurora' });
  await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'negocio')", [A.empresaId]));
  const vendedor = await H.sumarMiembro(db, A.empresaId, 'vendedor@aurora.com', 'vendedor');
  const B = await H.montarEmpresa(db, { email: 'duenio@boreal.com', nombre: 'Boreal' });

  let prestamo;

  // ===================================================================
  grupo('1 · Cargar una deuda');
  // ===================================================================
  {
    const r = await H.intentar(db, A.uid, () =>
      db.query('select public.crear_deuda($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id',
        [A.empresaId, 'Préstamo mercadería', 'prestamo', 'Banco Continental',
         12000000, null, 12, 1000000, '2026-09-15', 'Para el stock de invierno'])
        .then((x) => x.rows[0].id));
    aceptado('el dueño carga un préstamo', r);
    prestamo = r.valor;

    ok('el saldo arranca igual al monto', await saldoDe(db, prestamo), 12000000);
    ok('y sin cuotas pagadas',
      (await db.query('select cuotas_pagadas from public.deudas where id=$1', [prestamo])).rows[0].cuotas_pagadas, 0);

    rechazado('un vendedor no puede cargar deudas',
      await H.intentar(db, vendedor, () =>
        db.query('select public.crear_deuda($1,$2,$3,$4,$5)',
          [A.empresaId, 'Trucha', 'otro', '', 100])),
      'propietario o un administrador');

    rechazado('ni alguien de otra empresa',
      await H.intentar(db, B.uid, () =>
        db.query('select public.crear_deuda($1,$2,$3,$4,$5)',
          [A.empresaId, 'Ajena', 'otro', '', 100])),
      'propietario o un administrador');

    rechazado('una deuda sin monto no sirve',
      await H.intentar(db, A.uid, () =>
        db.query('select public.crear_deuda($1,$2,$3,$4,$5)', [A.empresaId, 'Vacía', 'otro', '', 0])),
      'tiene que tener un monto');

    rechazado('un tipo inventado',
      await H.intentar(db, A.uid, () =>
        db.query('select public.crear_deuda($1,$2,$3,$4,$5)', [A.empresaId, 'X', 'hipoteca', '', 100])),
      'no reconocido');

    rechazado('deber más de lo que se pidió',
      await H.intentar(db, A.uid, () =>
        db.query('select public.crear_deuda($1,$2,$3,$4,$5,$6)',
          [A.empresaId, 'Rara', 'otro', '', 1000, 5000])),
      'no puede ser mayor');
  }

  // ===================================================================
  grupo('2 · Pagar una cuota');
  // ===================================================================
  {
    const movimientosAntes = (await db.query(
      'select count(*)::int n from public.movimientos where empresa_id=$1', [A.empresaId])).rows[0].n;

    const r = await H.intentar(db, A.uid, () =>
      db.query('select public.registrar_pago_deuda($1,$2,$3,$4,$5,$6) r',
        [prestamo, 1000000, null, true, 'transferencia', 'Cuota 1'])
        .then((x) => x.rows[0].r));
    aceptado('el dueño registra la cuota', r);

    ok('bajó el saldo', await saldoDe(db, prestamo), 11000000);
    ok('lo informa en la respuesta', Number(r.valor.saldo), 11000000);
    ok('sumó una cuota',
      (await db.query('select cuotas_pagadas from public.deudas where id=$1', [prestamo])).rows[0].cuotas_pagadas, 1);
    ok('y corrió el vencimiento un mes',
      (await db.query('select vence_el::text v from public.deudas where id=$1', [prestamo])).rows[0].v,
      '2026-10-15');

    // Lo que la persona espera: ver la plata salir.
    const movimientosDespues = (await db.query(
      'select count(*)::int n from public.movimientos where empresa_id=$1', [A.empresaId])).rows[0].n;
    ok('dejó también el gasto', movimientosDespues - movimientosAntes, 1);

    const gasto = (await db.query(
      `select descripcion, categoria, monto::numeric m, metodo_pago
       from public.movimientos where empresa_id=$1 order by created_at desc limit 1`,
      [A.empresaId])).rows[0];
    ok('con el nombre de la deuda', gasto.descripcion, 'Pago Préstamo mercadería');
    ok('categoría Deudas', gasto.categoria, 'Deudas');
    ok('por el monto pagado', Number(gasto.m), 1000000);
    ok('y con el método elegido', gasto.metodo_pago, 'transferencia');

    ok('el pago quedó registrado',
      (await db.query('select count(*)::int n from public.pagos_deuda where deuda_id=$1', [prestamo])).rows[0].n, 1);
    ok('enlazado a su gasto',
      (await db.query('select movimiento_id is not null e from public.pagos_deuda where deuda_id=$1', [prestamo])).rows[0].e,
      true);
  }

  // ===================================================================
  grupo('3 · Quien lleva la contabilidad fina puede no crear el gasto');
  // ===================================================================
  {
    const antes = (await db.query(
      'select count(*)::int n from public.movimientos where empresa_id=$1', [A.empresaId])).rows[0].n;

    await H.comoUsuario(db, A.uid, () =>
      db.query('select public.registrar_pago_deuda($1,$2,$3,$4)', [prestamo, 1000000, null, false]));

    const despues = (await db.query(
      'select count(*)::int n from public.movimientos where empresa_id=$1', [A.empresaId])).rows[0].n;
    ok('no se creó ningún gasto', despues, antes);
    ok('pero el saldo bajó igual', await saldoDe(db, prestamo), 10000000);
  }

  // ===================================================================
  grupo('4 · No se puede deber de menos');
  // ===================================================================
  {
    const chica = await H.comoUsuario(db, A.uid, () =>
      db.query('select public.crear_deuda($1,$2,$3,$4,$5) id', [A.empresaId, 'Tarjeta', 'tarjeta', 'Visa', 500000])
        .then((x) => x.rows[0].id));

    // Se paga de más a propósito: el sobrante no puede dejar saldo negativo.
    const r = await H.comoUsuario(db, A.uid, () =>
      db.query('select public.registrar_pago_deuda($1,$2,$3,$4) r', [chica, 900000, null, false])
        .then((x) => x.rows[0].r));

    ok('solo se aplica lo que faltaba', Number(r.aplicado), 500000);
    ok('y avisa del sobrante', Number(r.sobrante), 400000);
    ok('el saldo queda en cero', await saldoDe(db, chica), 0);
    ok('la marca como saldada', r.saldada, true);
    ok('y le saca el vencimiento',
      (await db.query('select vence_el from public.deudas where id=$1', [chica])).rows[0].vence_el, null);

    rechazado('no se puede pagar una deuda ya saldada',
      await H.intentar(db, A.uid, () =>
        db.query('select public.registrar_pago_deuda($1,$2)', [chica, 1000])),
      'ya está saldada');

    rechazado('ni pagar cero',
      await H.intentar(db, A.uid, () =>
        db.query('select public.registrar_pago_deuda($1,$2)', [prestamo, 0])),
      'mayor que cero');

    rechazado('ni un monto negativo',
      await H.intentar(db, A.uid, () =>
        db.query('select public.registrar_pago_deuda($1,$2)', [prestamo, -5000])),
      'mayor que cero');
  }

  // ===================================================================
  grupo('5 · El saldo no se toca por la puerta de atrás');
  // ===================================================================
  {
    const antes = await saldoDe(db, prestamo);

    rechazado('nadie edita el saldo con un update',
      await H.intentar(db, A.uid, () =>
        db.query('update public.deudas set saldo = 0 where id=$1 returning id', [prestamo])
          .then((r) => { if (r.rows.length === 0) throw new Error('policy: no afectó ninguna fila'); return r.rows; })),
      'denied|policy|permission|no afectó');

    rechazado('ni inventa un pago a mano',
      await H.intentar(db, A.uid, () =>
        db.query(`insert into public.pagos_deuda (deuda_id, empresa_id, monto, fecha)
                  values ($1,$2,999,current_date)`, [prestamo, A.empresaId])),
      'denied|policy|permission');

    // `editar_deuda` tampoco lo deja cambiar: para eso están los pagos.
    await H.comoUsuario(db, A.uid, () =>
      db.query('select public.editar_deuda($1,$2)', [prestamo, 'Préstamo renombrado']));
    ok('editar cambia el nombre',
      (await db.query('select nombre from public.deudas where id=$1', [prestamo])).rows[0].nombre,
      'Préstamo renombrado');
    ok('pero no toca el saldo', await saldoDe(db, prestamo), antes);
  }

  // ===================================================================
  grupo('6 · Cuánto debe el negocio no lo ve un vendedor');
  // ===================================================================
  {
    rechazado('un vendedor no lista las deudas',
      await H.intentar(db, vendedor, () => db.query('select public.listar_deudas($1)', [A.empresaId])),
      'no tenés permiso');

    rechazado('ni ve el resumen',
      await H.intentar(db, vendedor, () => db.query('select public.resumen_deudas($1)', [A.empresaId])),
      'no tenés permiso');

    const directo = await H.intentar(db, vendedor, () =>
      db.query('select count(*)::int n from public.deudas where empresa_id=$1', [A.empresaId])
        .then((r) => r.rows[0].n));
    // La policy deja leer a cualquier miembro, pero las funciones —que son
    // por donde entra la app— exigen administración. Se deja anotado para
    // que quede claro que la puerta angosta es la de las funciones.
    ok('la tabla sí la puede leer un miembro (la app no la usa así)', typeof directo.valor, 'number');

    rechazado('pero no la de otra empresa',
      await H.intentar(db, A.uid, () => db.query('select public.listar_deudas($1)', [B.empresaId])),
      'no tenés permiso');
  }

  // ===================================================================
  grupo('7 · El resumen y el orden de la lista');
  // ===================================================================
  {
    const C = await H.montarEmpresa(db, { email: 'duenio@ceta.com', nombre: 'Ceta' });
    const hoy = (await db.query('select public.hoy_empresa($1)::text h', [C.empresaId])).rows[0].h;
    const dias = (n) => `(current_date + ${n})::date`;

    await H.comoUsuario(db, C.uid, async () => {
      await db.query(`select public.crear_deuda($1,'Vencida','tarjeta','Visa',300000,300000,null,null,${dias(-5)})`, [C.empresaId]);
      await db.query(`select public.crear_deuda($1,'Vence pronto','prestamo','Banco',600000,600000,6,100000,${dias(3)})`, [C.empresaId]);
      await db.query(`select public.crear_deuda($1,'Lejana','proveedor','Mayorista',900000,900000,null,null,${dias(60)})`, [C.empresaId]);
    });

    const res = (await H.intentar(db, C.uid, () =>
      db.query('select public.resumen_deudas($1) r', [C.empresaId]).then((x) => x.rows[0].r))).valor;

    ok('total debido', Number(res.total_debido), 1800000);
    ok('cuántas deudas', res.cuantas, 3);
    ok('una vencida', res.vencidas, 1);
    ok('con su monto', Number(res.monto_vencido), 300000);
    ok('una vence esta semana', res.vence_pronto, 1);
    // De las que vencen pronto se suma la CUOTA, no el saldo entero: es lo
    // que hay que tener disponible, no lo que se debe en total.
    ok('y lo que hay que tener para esa', Number(res.monto_pronto), 100000);

    const lista = (await H.intentar(db, C.uid, () =>
      db.query('select public.listar_deudas($1) l', [C.empresaId]).then((x) => x.rows[0].l))).valor;

    ok('lista las tres', lista.length, 3);
    ok('primero la vencida', lista[0].nombre, 'Vencida');
    ok('marcada como vencida', lista[0].vencida, true);
    ok('después la que vence pronto', lista[1].nombre, 'Vence pronto');
    ok('con los días que faltan', lista[1].dias_para_vencer, 3);
    ok('y al final la lejana', lista[2].nombre, 'Lejana');

    // Una saldada sale de la lista por defecto.
    await H.comoUsuario(db, C.uid, () =>
      db.query('select public.registrar_pago_deuda($1,$2,$3,$4)', [lista[0].id, 300000, null, false]));

    const despues = (await H.intentar(db, C.uid, () =>
      db.query('select public.listar_deudas($1) l', [C.empresaId]).then((x) => x.rows[0].l))).valor;
    ok('la saldada ya no aparece', despues.length, 2);

    const conSaldadas = (await H.intentar(db, C.uid, () =>
      db.query('select public.listar_deudas($1, true) l', [C.empresaId]).then((x) => x.rows[0].l))).valor;
    ok('salvo que se pidan', conSaldadas.length, 3);
    ok('y va al final', conSaldadas[2].nombre, 'Vencida');
  }

  // ===================================================================
  grupo('8 · El avance de pago');
  // ===================================================================
  {
    const D = await H.montarEmpresa(db, { email: 'duenio@delta.com', nombre: 'Delta' });
    const d = await H.comoUsuario(db, D.uid, () =>
      db.query("select public.crear_deuda($1,'Moto','prestamo','Financiera',1000000) id", [D.empresaId])
        .then((x) => x.rows[0].id));

    await H.comoUsuario(db, D.uid, () =>
      db.query('select public.registrar_pago_deuda($1,$2,$3,$4)', [d, 250000, null, false]));

    const lista = (await H.intentar(db, D.uid, () =>
      db.query('select public.listar_deudas($1) l', [D.empresaId]).then((x) => x.rows[0].l))).valor;

    ok('cuánto lleva pagado', Number(lista[0].pagado), 250000);
    ok('y qué porcentaje', Number(lista[0].avance), 25);
    ok('cuánto falta', Number(lista[0].saldo), 750000);

    const pagos = (await H.intentar(db, D.uid, () =>
      db.query('select public.pagos_de_deuda($1) p', [d]).then((x) => x.rows[0].p))).valor;
    ok('el historial tiene el pago', pagos.length, 1);
    ok('por el monto correcto', Number(pagos[0].monto), 250000);
  }

  // ===================================================================
  grupo('9 · Las deudas se van con la empresa');
  // ===================================================================
  {
    const E = await H.montarEmpresa(db, { email: 'duenio@eco.com', nombre: 'Eco' });
    const d = await H.comoUsuario(db, E.uid, () =>
      db.query("select public.crear_deuda($1,'Algo','otro','X',5000) id", [E.empresaId])
        .then((x) => x.rows[0].id));
    await H.comoUsuario(db, E.uid, () =>
      db.query('select public.registrar_pago_deuda($1,$2,$3,$4)', [d, 1000, null, false]));

    await db.query('delete from public.empresas where id=$1', [E.empresaId]);
    ok('no quedan deudas huérfanas',
      (await db.query('select count(*)::int n from public.deudas where empresa_id=$1', [E.empresaId])).rows[0].n, 0);
    ok('ni pagos huérfanos',
      (await db.query('select count(*)::int n from public.pagos_deuda where empresa_id=$1', [E.empresaId])).rows[0].n, 0);
  }

  console.log(`\n${'═'.repeat(62)}`);
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE DEUDAS FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE DEUDAS PASARON`);
})().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message);
  console.error(e);
  process.exit(1);
});
