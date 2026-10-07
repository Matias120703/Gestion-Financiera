/**
 * El candado del negocio vencido, completo (migración 111, 30/09/2026).
 *
 * La regla es la del 15/09 (069): un NEGOCIO vencido no usa nada salvo
 * /plan, y sus datos no se borran. La pantalla lo tapa entero, pero la base
 * todavía le dejaba anotar fiado, manejar la billetera y dar clases por API,
 * y no lo dejaba «Empezar de cero» si tenía un pago de cuota o un turno
 * cobrado. La 110 los dejó anotados como tareas aparte; la 111 los cierra.
 *
 * En orden de importancia:
 *   1. que un negocio vencido no escriba fiado, billetera ni clases, por
 *      ningún camino;
 *   2. que irse siga siendo gratis: vaciar con un pago de cuota, un turno
 *      cobrado, una silla alquilada y un paquete cobrado;
 *   3. que lo que tiene que andar siempre ande: clientes (099), también un
 *      alumno que solo tiene un paquete (112), bloquear un teléfono de la
 *      agenda pública (turnos_bloqueo, abierta a propósito) y los DELETE;
 *   4. que en prueba o pagando no se le recorte nada a nadie;
 *   5. que la personal en Gratis siga exactamente como en la 110;
 *   6. que el sistema (sin sesión) siga libre, y que la marca de «vaciar»
 *      no se pueda usar para abrir el candado;
 *   7. que subir un comprobante a Storage pregunte por el plan.
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

// El de siempre para un negocio (069). personal-gratis.test.js busca el mismo.
const CANDADO = 'Se te terminó la prueba';
// El de la 110 para lo del Pro en una personal en Gratis.
const ES_DE_PAGO = 'plan Pro';

// Receta A (solo-lectura.test.js:62-65): la prueba termina sola, nadie toca nada.
const vencer = (db, id) => db.query(
  `update public.suscripciones
   set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
   where empresa_id = $1`, [id]);

// Pagar (permisos.test.js:166-167).
const pagar = (db, id) => H.comoServicio(db, () => db.query(
  "select public.aplicar_suscripcion($1,'pro','activa',now(),now()+interval '30 days','manual')", [id]));

// El insert de PantallaGastos.tsx, como en personal-gratis.test.js.
const MOV = `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria,
               subtotal, descuento, monto, costo_total, metodo_pago, contraparte, notas, cuenta_id, origen)
             values ($1,$2,current_date,$3,$4,$5,0,$5,0,'efectivo','','',null,'manual') returning id`;

// Lo que la 111 le cierra a un negocio vencido, con cómo se pide. `c` trae
// los ids armados; `n` cambia los nombres para que repetir la lista no choque
// con un «ya existe». `billetera`: también es lo que la 110 le cerró a la
// personal en Gratis (fiado y billetera), para el grupo 6.
const LO_QUE_SE_CIERRA = [
  ['anotarle fiado a alguien', true, (c) => ["select public.anotar_fiado($1,$2,1000,'asado')", [c.empresaId, c.persona]]],
  ['cobrarle', true, (c) => ['select public.cobrar_fiado($1,$2,500)', [c.empresaId, c.persona]]],
  ['prestarle plata de una cuenta', true, (c) => ["select public.anotar_fiado($1,$2,1000,'préstamo',null,$3)", [c.empresaId, c.persona, c.cuenta]]],
  ['cobrarle a una cuenta', true, (c) => ["select public.cobrar_fiado($1,$2,500,'efectivo',null,$3)", [c.empresaId, c.persona, c.cuenta]]],
  ['una cuenta nueva en la billetera', true, (c, n) => ["select public.guardar_cuenta_dinero($1,$2,'banco',0,'{}')", [c.empresaId, `Banco ${n}`]]],
  ['cambiarle el nombre a una cuenta', true, (c, n) => ["select public.guardar_cuenta_dinero($1,$2,'banco',0,'{transferencia}',$3)", [c.empresaId, `Atlas ${n}`, c.cuenta2]]],
  // Un saldo distinto cada vez, como en personal-gratis.test.js.
  ['ajustar un saldo', true, (c, n) => ["select public.ajustar_saldo_cuenta($1,$2,$3,'')", [c.empresaId, c.cuenta, 400000 + n.length]]],
  ['transferir entre cuentas', true, (c) => ['select public.transferir_entre_cuentas($1,$2,$3,$4)', [c.empresaId, c.cuenta, c.cuenta2, 1000]]],
  // Con precio lo frenaba ya registrar_venta (movimientos tiene candado); de
  // regalo no escribía movimientos y pasaba.
  ['vender un paquete de regalo', false, (c, n) => ["select public.vender_paquete($1,$2,$3,4,0,'efectivo',null,null)", [c.empresaId, c.alumno, `Regalo ${n}`]]],
  ['dar una clase', false, (c) => ["select public.dar_clase($1,1,null,'dada',null)", [c.paquete]]],
  ['cerrar un paquete', false, (c) => ['select public.cerrar_paquete($1,true)', [c.paqueteRegalo]]],
  // (127) El fiado con fecha de cobro y en cuotas: todo lo que escribe en
  // fiado_cuotas o en el libro. `billetera` en true: también es del Pro
  // para la personal en Gratis (grupo 6). Sacar las fechas es un DELETE y
  // anda siempre: va en el grupo 3.
  ['ponerle fechas a un fiado', true, (c) => ['select public.programar_cuotas(p_fio => $1, p_plan => $2::jsonb)',
    [c.lineaFiado, JSON.stringify([{ vence_el: c.fechaCuota, monto: 1000 }, { vence_el: c.fechaCuota, monto: 2000 }])]]],
  ['correr la fecha de una cuota', true, (c) => ['select public.mover_cuota($1,$2)', [c.cuota, c.fechaCuota]]],
  ['marcar que le escribió por una cuota', true, (c) => ['select public.marcar_cuota_avisada($1)', [c.cuota]]],
  ['anotar un fiado en cuotas', true, (c) => ["select public.anotar_fiado($1,$2,1000,'en cuotas',null,null,$3::jsonb)",
    [c.empresaId, c.persona, JSON.stringify([{ vence_el: c.fechaCuota, monto: 400 }, { vence_el: c.fechaCuota, monto: 600 }])]]],
  ['cobrar una cuota', true, (c) => ['select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 100, p_cuota => $3)',
    [c.empresaId, c.persona, c.cuota]]],
  // Al final a propósito: en prueba y pagando la archiva de verdad, y
  // después ya no se le podría transferir.
  ['archivar una cuenta con movimientos', true, (c) => ['select public.quitar_cuenta_dinero($1,$2)', [c.empresaId, c.cuenta2]]],
];
const LO_DE_LA_BILLETERA = LO_QUE_SE_CIERRA.filter(([, billetera]) => billetera);

(async () => {
  const db = await H.crearBase();
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const fila = async (uid, sql, args = []) => (await como(uid, sql, args)).valor?.rows[0];
  const contar = async (sql, args) => (await db.query(sql, args)).rows[0].n;
  // Como una función SECURITY DEFINER que actúa por el dueño: sin RLS, pero
  // con su sesión, así que los triggers lo ven a él (personal-gratis.test.js).
  const comoFuncion = async (uid, sql, args = []) => {
    await db.exec('begin');
    try {
      await db.query(`select set_config('orden.uid', $1, true)`, [uid]);
      const valor = await db.query(sql, args);
      await db.exec('commit');
      return { ok: true, valor, error: null };
    } catch (e) {
      try { await db.exec('rollback'); } catch { /* ya abortada */ }
      return { ok: false, valor: null, error: e.message ?? String(e) };
    }
  };
  // Sin sesión: superusuario sin orden.uid, como el cron o un webhook
  // (solo-lectura.test.js, grupo 7).
  const sinSesion = async (sql, args = []) => {
    await db.exec('begin');
    try {
      const valor = await db.query(sql, args);
      await db.exec('commit');
      return { ok: true, valor, error: null };
    } catch (e) {
      try { await db.exec('rollback'); } catch { /* ya abortada */ }
      return { ok: false, valor: null, error: e.message ?? String(e) };
    }
  };
  const nombreDe = async (id) => (await db.query('select nombre from public.empresas where id=$1', [id])).rows[0].nombre;
  const vaciar = async (C) => como(C.uid, 'select public.vaciar_empresa($1,$2) j', [C.empresaId, await nombreDe(C.empresaId)]);
  const val = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(`${sql} → ${r.error}`);
    return r.valor.rows[0];
  };

  /**
   * Arma, con la cuenta viva (en prueba), todo lo que después se va a
   * intentar tocar. `negocio`: además la agenda (turno cobrado y silla
   * alquilada) y las clases (paquetes), que una personal no tiene.
   */
  const armar = async (C, { negocio = true } = {}) => {
    const c = { ...C };
    const E = C.empresaId;
    const U = C.uid;
    c.persona = (await val(U, "select public.guardar_cliente($1,'Juan','0981 234 567') id", [E])).id;
    // Con historia y sin deuda: eliminarla la archiva (099:377-405).
    c.personaSaldada = (await val(U, "select public.guardar_cliente($1,'Rosa','0981 765 432') id", [E])).id;
    c.cuenta = (await val(U, "select public.guardar_cuenta_dinero($1,'Caja','efectivo',500000,'{efectivo}') id", [E])).id;
    c.cuenta2 = (await val(U, "select public.guardar_cuenta_dinero($1,'Atlas','banco',0,'{transferencia}') id", [E])).id;
    c.cuentaVacia = (await val(U, "select public.guardar_cuenta_dinero($1,'Sin uso','banco',0,'{}') id", [E])).id;
    await val(U, 'select public.transferir_entre_cuentas($1,$2,$3,$4)', [E, c.cuenta, c.cuenta2, 1000]);
    await val(U, "select public.anotar_fiado($1,$2,5000,'previo')", [E, c.persona]);
    c.lineaFiado = (await val(U, "select public.anotar_fiado($1,$2,3000,'otra') id", [E, c.persona])).id;
    // (127) Una deuda en dos cuotas, armada con la cuenta viva.
    c.fechaCuota = (await db.query('select (public.hoy_empresa($1) + 30)::text d', [E])).rows[0].d;
    c.lineaCuotas = (await val(U, "select public.anotar_fiado($1,$2,2000,'en dos veces',null,null,$3::jsonb) id",
      [E, c.persona, JSON.stringify([{ vence_el: c.fechaCuota, monto: 1000 }, { vence_el: c.fechaCuota, monto: 1000 }])])).id;
    c.cuota = (await db.query('select id from public.fiado_cuotas where fio_id = $1 and numero = 1', [c.lineaCuotas])).rows[0].id;
    await val(U, "select public.anotar_fiado($1,$2,2000,'una vez')", [E, c.personaSaldada]);
    await val(U, 'select public.cobrar_fiado($1,$2,2000)', [E, c.personaSaldada]);
    // Un pago de cuota: pagos_deuda.movimiento_id (015), SET NULL al vaciar.
    c.deuda = (await val(U, "select public.crear_deuda($1,'Visa','tarjeta','Banco',100000) id", [E])).id;
    await val(U, 'select public.registrar_pago_deuda($1,$2)', [c.deuda, 1000]);
    // Una línea de fiado vieja (054-055) con su cobro atado a un movimiento:
    // desde la 056 cobrar_fiado ya no llena cobro_id, así que se ata sin sesión.
    const mov = (await val(U, MOV, [E, 'ingreso', 'Cobro viejo', 'Cobros', 100])).id;
    await db.query(
      `update public.fiado set cobro_id = $2
       where id = (select id from public.fiado where empresa_id = $1 and tipo = 'cobro' limit 1)`, [E, mov]);
    if (!negocio) return c;

    // La agenda (sillas.test.js, reparto.test.js): un turno cobrado y pagado
    // al profesional (turnos_pago.movimiento_id) y una silla alquilada (una
    // atribución sin movimiento que apunta al producto).
    c.corte = await H.crearProducto(db, E, U, { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
    c.prof = (await val(U, "select public.guardar_profesional($1,'Pedro','comision',50,$2) id", [E, U])).id;
    await val(U, 'select public.registrar_servicio($1,$2,$3)', [E, c.prof, c.corte]);
    await val(U, 'select public.pagar_profesional($1,$2,$3)', [E, c.prof, 15000]);
    // Quien alquila la silla tiene que ser del negocio (048).
    const inquilino = await H.sumarMiembro(db, E, `silla-${E.slice(0, 8)}@orden.app`, 'vendedor');
    c.silla = (await val(U, "select public.guardar_profesional($1,'Silla','alquiler',null,$2) id", [E, inquilino])).id;
    await val(U, 'select public.registrar_servicio($1,$2,$3)', [E, c.silla, c.corte]);

    // Las clases (paquetes.test.js): un paquete cobrado (paquetes.movimiento_id),
    // uno de regalo y una clase dada.
    c.alumno = (await val(U, "select public.guardar_cliente($1,'Matías','0981 111 111') id", [E])).id;
    c.paquete = (await val(U, "select public.vender_paquete($1,$2,'8 clases',8,400000,'efectivo',null,null) j", [E, c.alumno])).j.paquete;
    c.paqueteRegalo = (await val(U, "select public.vender_paquete($1,$2,'Prueba',2,0,'efectivo',null,null) j", [E, c.alumno])).j.paquete;
    await val(U, "select public.dar_clase($1,1,null,'dada',null)", [c.paquete]);
    c.clase = (await db.query('select id from public.clases_dadas where paquete_id=$1 limit 1', [c.paquete])).rows[0].id;
    // Un alumno con un paquete de regalo y nada más: sin venta, sin fiado,
    // sin reservas. Hasta la 112, eliminarlo chocaba con el RESTRICT de
    // paquetes.cliente_id (088) en vez de archivarlo.
    c.alumnoRegalo = (await val(U, "select public.guardar_cliente($1,'Lucía','0981 222 222') id", [E])).id;
    c.paqueteSuelto = (await val(U, "select public.vender_paquete($1,$2,'Clase de prueba',1,0,'efectivo',null,null) j", [E, c.alumnoRegalo])).j.paquete;
    return c;
  };

  // Cuatro negocios iguales y una personal, cada uno en su estado.
  const NP = await armar(await H.montarEmpresa(db, { email: 'duenio@prueba.com', nombre: 'Academia en prueba' }));
  const NA = await armar(await H.montarEmpresa(db, { email: 'duenio@paga.com', nombre: 'Academia que paga' }));
  const NV = await armar(await H.montarEmpresa(db, { email: 'duenio@vencida.com', nombre: 'Academia vencida' }));
  const NR = await armar(await H.montarEmpresa(db, { email: 'duenio@vuelve.com', nombre: 'Academia que vuelve' }));
  NR.admin = await H.sumarMiembro(db, NR.empresaId, 'admin@vuelve.com', 'admin');
  const P = await armar(await H.montarEmpresa(db, { email: 'ana@casa.com', nombre: 'Mis finanzas', tipoCuenta: 'personal' }), { negocio: false });
  await pagar(db, NA.empresaId);
  await vencer(db, NV.empresaId);
  await vencer(db, NR.empresaId);
  await vencer(db, P.empresaId);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Armado: cada cuenta en su estado');
  // ═══════════════════════════════════════════════════════════
  const escribe = async (C) => (await fila(C.uid, 'select public.puede_cargar($1) p', [C.empresaId]))?.p;
  const gratis = async (id) => (await db.query('select public.es_gratis_personal($1) g', [id])).rows[0].g;
  ok('en prueba, pagando y vencido: ¿carga?',
    [await escribe(NP), await escribe(NA), await escribe(NV), await escribe(NR)], [true, true, false, false]);
  ok('la personal vencida está en Gratis (carga, pero es Gratis)', [await escribe(P), await gratis(P.empresaId)], [true, true]);
  ok('el negocio armado tiene pago de cuota, turno pagado, silla, paquete y fiado cobrado',
    [
      await contar('select count(*)::int n from public.pagos_deuda where empresa_id=$1 and movimiento_id is not null', [NV.empresaId]),
      await contar('select count(*)::int n from public.turnos_pago where empresa_id=$1 and movimiento_id is not null', [NV.empresaId]),
      await contar('select count(*)::int n from public.turnos_atribucion where empresa_id=$1 and movimiento_id is null and producto_id is not null', [NV.empresaId]),
      await contar('select count(*)::int n from public.paquetes where empresa_id=$1 and movimiento_id is not null', [NV.empresaId]),
      await contar('select count(*)::int n from public.fiado where empresa_id=$1 and cobro_id is not null', [NV.empresaId]),
    ], [1, 1, 1, 1, 1]);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Un negocio vencido no escribe fiado, billetera ni clases');
  // ═══════════════════════════════════════════════════════════
  const fiadoAntes = await contar('select count(*)::int n from public.fiado where empresa_id=$1', [NV.empresaId]);
  // La billetera entera, fila por fila: contar solo las activas no alcanza,
  // porque una cuenta nueva (+1) y una archivada (−1) se compensan.
  const cuentasDe = async (id) => (await db.query(
    'select id, nombre, activa, saldo_inicial::text saldo from public.cuentas_dinero where empresa_id=$1 order by id', [id])).rows;
  const filasDe = async (tabla, id) => contar(`select count(*)::int n from public.${tabla} where empresa_id=$1`, [id]);
  const cuentasAntes = await cuentasDe(NV.empresaId);
  const otrasAntes = [await filasDe('ajustes_cuenta', NV.empresaId), await filasDe('paquetes', NV.empresaId),
    await filasDe('clases_dadas', NV.empresaId)];
  for (const [nombre, , pedir] of LO_QUE_SE_CIERRA) {
    const [sql, args] = pedir(NV, 'vencido');
    rechazado(`vencido: ${nombre}`, await como(NV.uid, sql, args), CANDADO);
  }
  ok('y no quedó ninguna línea de fiado nueva',
    await contar('select count(*)::int n from public.fiado where empresa_id=$1', [NV.empresaId]), fiadoAntes);
  ok('ni una cuota nueva, movida o marcada (127)',
    (await db.query('select numero, vence_el::text, monto::int, avisado_el from public.fiado_cuotas where empresa_id=$1 order by fio_id, numero', [NV.empresaId])).rows,
    [{ numero: 1, vence_el: NV.fechaCuota, monto: 1000, avisado_el: null }, { numero: 2, vence_el: NV.fechaCuota, monto: 1000, avisado_el: null }]);
  const cuentasDespues = await cuentasDe(NV.empresaId);
  ok('ni una cuenta nueva', cuentasDespues.length, cuentasAntes.length);
  ok('ni una archivada',
    cuentasDespues.filter((x) => !x.activa).length, cuentasAntes.filter((x) => !x.activa).length);
  ok('ni una con otro nombre o saldo inicial', cuentasDespues, cuentasAntes);
  ok('ni un ajuste, un paquete o una clase nuevos',
    [await filasDe('ajustes_cuenta', NV.empresaId), await filasDe('paquetes', NV.empresaId),
      await filasDe('clases_dadas', NV.empresaId)], otrasAntes);
  // Desde el navegador estas tablas ni se tocan (sin grants): el candado es
  // para las funciones. Se prueba igual, con su sesión y sin RLS.
  rechazado('desde el navegador, fiado ni se toca',
    await como(NV.uid, "insert into public.fiado (empresa_id, cliente_id, tipo, monto, fecha) values ($1,$2,'fio',1,current_date)",
      [NV.empresaId, NV.persona]), `denied|permission|${CANDADO}`);
  const DIRECTO = [
    ['un INSERT de fiado', "insert into public.fiado (empresa_id, cliente_id, tipo, monto, fecha, concepto) values ($1,$2,'fio',1,current_date,'x') returning id", (c) => [c.empresaId, c.persona]],
    ['un UPDATE de fiado', "update public.fiado set concepto = 'cambiado' where empresa_id = $1 returning id", (c) => [c.empresaId]],
    ['un INSERT de fiado_cuotas', "insert into public.fiado_cuotas (empresa_id, cliente_id, fio_id, numero, vence_el, monto) values ($1,$2,$3,9,current_date,1) returning id", (c) => [c.empresaId, c.persona, c.lineaCuotas]],
    ['un UPDATE de fiado_cuotas', 'update public.fiado_cuotas set avisado_el = current_date where empresa_id = $1 returning id', (c) => [c.empresaId]],
    ['un INSERT de cuentas_dinero', "insert into public.cuentas_dinero (empresa_id, nombre, tipo) values ($1,'Por atrás','banco') returning id", (c) => [c.empresaId]],
    ['un UPDATE de cuentas_dinero', "update public.cuentas_dinero set saldo_inicial = 999999 where id = $1 returning id", (c) => [c.cuenta]],
    ['un INSERT de ajustes_cuenta', "insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, fecha) values ($1,$2,'ajuste',1,current_date) returning id", (c) => [c.empresaId, c.cuenta]],
    ['un UPDATE de ajustes_cuenta', "update public.ajustes_cuenta set nota = 'cambiada' where empresa_id = $1 returning id", (c) => [c.empresaId]],
    ['un INSERT de paquetes', "insert into public.paquetes (empresa_id, cliente_id, nombre, clases, precio) values ($1,$2,'Por atrás',4,0) returning id", (c) => [c.empresaId, c.alumno]],
    ['un UPDATE de paquetes', 'update public.paquetes set clases = 100 where id = $1 returning id', (c) => [c.paquete]],
    ['un INSERT de clases_dadas', "insert into public.clases_dadas (empresa_id, paquete_id, fecha, cantidad) values ($1,$2,current_date,1) returning id", (c) => [c.empresaId, c.paquete]],
    ['un UPDATE de clases_dadas', "update public.clases_dadas set cantidad = 0.5 where id = $1 returning id", (c) => [c.clase]],
  ];
  for (const [nombre, sql, args] of DIRECTO) {
    rechazado(`ni desde una función: ${nombre}`, await comoFuncion(NV.uid, sql, args(NV)), CANDADO);
  }
  ok('el saldo inicial de la caja no se movió',
    Number((await db.query('select saldo_inicial from public.cuentas_dinero where id=$1', [NV.cuenta])).rows[0].saldo_inicial), 500000);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Lo que anda siempre sigue andando');
  // ═══════════════════════════════════════════════════════════
  // D19 (099): archivar o eliminar a una persona anda siempre. `clientes`
  // no tiene candado, a propósito.
  const nueva = await como(NV.uid, "select public.guardar_cliente($1,'Nueva','0982 000 000') id", [NV.empresaId]);
  aceptado('crear una persona', nueva);
  ok('eliminar una sin historia la borra',
    (await fila(NV.uid, 'select public.eliminar_cliente($1) r', [nueva.valor?.rows[0].id]))?.r, 'borrado');
  ok('eliminar una con historia la archiva',
    (await fila(NV.uid, 'select public.eliminar_cliente($1) r', [NV.personaSaldada]))?.r, 'archivado');
  ok('y quedó archivada',
    (await db.query('select activo from public.clientes where id=$1', [NV.personaSaldada])).rows[0].activo, false);
  // 112: un alumno con solo un paquete de regalo. Antes, «violates RESTRICT
  // setting of foreign key constraint paquetes_cliente_id_fkey».
  ok('eliminar un alumno que solo tiene un paquete lo archiva',
    (await fila(NV.uid, 'select public.eliminar_cliente($1) r', [NV.alumnoRegalo]))?.r, 'archivado');
  ok('y su paquete sigue ahí, a su nombre',
    await contar('select count(*)::int n from public.paquetes where id=$1 and cliente_id=$2', [NV.paqueteSuelto, NV.alumnoRegalo]), 1);
  // turnos_bloqueo queda abierta a propósito (111): su página pública sigue
  // prendida y no la puede apagar, así que bloquear un número que le llena
  // la agenda de reservas falsas es seguridad, como apagar un link (098).
  aceptado('bloquear un teléfono de la agenda pública',
    await como(NV.uid, "select public.bloquear_telefono($1,'0981 000 111','reservas falsas')", [NV.empresaId]));
  ok('y quedó bloqueado',
    await contar('select count(*)::int n from public.turnos_bloqueo where empresa_id=$1', [NV.empresaId]), 1);
  // Los DELETE quedan libres (018): borrar no es cargar.
  aceptado('borrar una línea de fiado', await como(NV.uid, 'select public.borrar_linea_fiado($1)', [NV.lineaFiado]));
  // (127) Sacarle las fechas a una deuda es borrar el calendario: el libro
  // no cambia, así que anda como cualquier DELETE.
  aceptado('sacarle las fechas a un fiado', await como(NV.uid, 'select public.quitar_cuotas($1)', [NV.lineaCuotas]));
  ok('y se fueron las cuotas, no la deuda',
    [await contar('select count(*)::int n from public.fiado_cuotas where empresa_id=$1', [NV.empresaId]),
      await contar('select count(*)::int n from public.fiado where id=$1', [NV.lineaCuotas])], [0, 1]);
  ok('sacar una cuenta sin uso la borra (no la archiva)',
    (await fila(NV.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [NV.empresaId, NV.cuentaVacia]))?.j, { ok: true, archivada: false });
  aceptado('deshacer una clase mal anotada', await como(NV.uid, 'select public.deshacer_clase($1)', [NV.clase]));
  // Sigue viendo lo suyo por la base (la pantalla lo tapa, pero no se borra nada).
  ok('su fiado sigue ahí',
    (await fila(NV.uid, 'select count(*)::int n from public.fiado where empresa_id=$1', [NV.empresaId]))?.n, fiadoAntes - 1);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Irse sigue siendo gratis: «Empezar de cero» vencido');
  // ═══════════════════════════════════════════════════════════
  const r = await vaciar(NV);
  aceptado('vaciar con pago de cuota, turno cobrado, silla alquilada, paquete cobrado y fiado cobrado', r);
  ok('se fueron los movimientos y los productos',
    [await contar('select count(*)::int n from public.movimientos where empresa_id=$1', [NV.empresaId]),
      await contar('select count(*)::int n from public.productos where empresa_id=$1', [NV.empresaId])], [0, 0]);
  ok('los pagos de cuota y de profesionales quedan, sin su movimiento',
    [await contar('select count(*)::int n from public.pagos_deuda where empresa_id=$1', [NV.empresaId]),
      await contar('select count(movimiento_id)::int n from public.pagos_deuda where empresa_id=$1', [NV.empresaId]),
      await contar('select count(*)::int n from public.turnos_pago where empresa_id=$1', [NV.empresaId]),
      await contar('select count(movimiento_id)::int n from public.turnos_pago where empresa_id=$1', [NV.empresaId])],
    [1, 0, 1, 0]);
  // Los paquetes se van con sus ventas desde la 115: sin venta, figuraban
  // como «por cobrar» (empezar-de-cero.test.js, grupo 8).
  ok('la silla quedó sin producto, los paquetes se fueron con su venta y el fiado sin cobro',
    [await contar('select count(producto_id)::int n from public.turnos_atribucion where empresa_id=$1', [NV.empresaId]),
      await contar('select count(*)::int n from public.paquetes where empresa_id=$1', [NV.empresaId]),
      await contar('select count(cobro_id)::int n from public.fiado where empresa_id=$1', [NV.empresaId])],
    [0, 0, 0]);
  rechazado('después, el fiado sigue cerrado (la marca no quedó puesta)',
    await como(NV.uid, "select public.anotar_fiado($1,$2,1000,'x')", [NV.empresaId, NV.persona]), CANDADO);
  rechazado('y la billetera también',
    await como(NV.uid, "select public.guardar_cuenta_dinero($1,'Caja 3','efectivo',0,'{efectivo}',$2)", [NV.empresaId, NV.cuenta]), CANDADO);
  // Solo un pago de cuota y un turno cobrado: lo que la 110 dejaba roto.
  const NC = await H.montarEmpresa(db, { email: 'duenio@cuota.com', nombre: 'Barbería con cuota' });
  {
    const deuda = (await val(NC.uid, "select public.crear_deuda($1,'Visa','tarjeta','Banco',100000) id", [NC.empresaId])).id;
    await val(NC.uid, 'select public.registrar_pago_deuda($1,$2)', [deuda, 1000]);
    const corte = await H.crearProducto(db, NC.empresaId, NC.uid, { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
    const prof = (await val(NC.uid, "select public.guardar_profesional($1,'Pedro','comision',50,$2) id", [NC.empresaId, NC.uid])).id;
    await val(NC.uid, 'select public.registrar_servicio($1,$2,$3)', [NC.empresaId, prof, corte]);
    await val(NC.uid, 'select public.pagar_profesional($1,$2,$3)', [NC.empresaId, prof, 15000]);
    await vencer(db, NC.empresaId);
  }
  aceptado('vaciar un negocio vencido con solo un pago de cuota y un turno cobrado', await vaciar(NC));

  // ═══════════════════════════════════════════════════════════
  grupo('5 · En prueba o pagando, no cambia nada');
  // ═══════════════════════════════════════════════════════════
  for (const [etiqueta, C] of [['en prueba', NP], ['pagando', NA]]) {
    for (const [nombre, , pedir] of LO_QUE_SE_CIERRA) {
      const [sql, args] = pedir(C, etiqueta);
      aceptado(`${etiqueta}: ${nombre}`, await como(C.uid, sql, args));
    }
    aceptado(`${etiqueta}: crear una persona`, await como(C.uid, "select public.guardar_cliente($1,'Otra','0983 000 000')", [C.empresaId]));
    ok(`${etiqueta}: archivar una persona`,
      (await fila(C.uid, 'select public.eliminar_cliente($1) r', [C.personaSaldada]))?.r, 'archivado');
    ok(`${etiqueta}: eliminar un alumno que solo tiene un paquete lo archiva (112)`,
      (await fila(C.uid, 'select public.eliminar_cliente($1) r', [C.alumnoRegalo]))?.r, 'archivado');
    aceptado(`${etiqueta}: vaciar con pago de cuota, turno cobrado, silla y paquete`, await vaciar(C));
    ok(`${etiqueta}: y quedó vacío`,
      await contar('select count(*)::int n from public.movimientos where empresa_id=$1', [C.empresaId]), 0);
    aceptado(`${etiqueta}: después de vaciar, sigue anotando fiado`,
      await como(C.uid, "select public.anotar_fiado($1,$2,1000,'después')", [C.empresaId, C.persona]));
  }

  // ═══════════════════════════════════════════════════════════
  grupo('6 · La personal en Gratis, igual que en la 110');
  // ═══════════════════════════════════════════════════════════
  aceptado('carga un gasto', await como(P.uid, MOV, [P.empresaId, 'gasto', 'Súper', 'Comida', 25000]));
  aceptado('carga un ingreso', await como(P.uid, MOV, [P.empresaId, 'ingreso', 'Sueldo', 'Sueldo', 3000000]));
  for (const [nombre, , pedir] of LO_DE_LA_BILLETERA) {
    const [sql, args] = pedir(P, 'gratis');
    const res = await como(P.uid, sql, args);
    rechazado(`gratis: ${nombre}`, res, ES_DE_PAGO);
    if (!res.ok) ok(`  y no dice que Orden se cerró (${nombre})`, /seguir usando Orden/i.test(res.error), false);
  }
  rechazado('gratis: una deuda nueva', await como(P.uid, "select public.crear_deuda($1,'V','tarjeta','B',1)", [P.empresaId]), ES_DE_PAGO);
  aceptado('gratis: crear una persona', await como(P.uid, "select public.guardar_cliente($1,'Z','')", [P.empresaId]));
  ok('gratis: archivar una persona',
    (await fila(P.uid, 'select public.eliminar_cliente($1) r', [P.personaSaldada]))?.r, 'archivado');
  aceptado('gratis: borrar una línea de fiado', await como(P.uid, 'select public.borrar_linea_fiado($1)', [P.lineaFiado]));
  rechazado('gratis: tocar un pago de cuota desde una función, fuera del vaciado',
    await comoFuncion(P.uid, 'update public.pagos_deuda set movimiento_id = null where empresa_id = $1', [P.empresaId]), ES_DE_PAGO);
  aceptado('gratis: vaciar con pago de cuota y fiado cobrado', await vaciar(P));
  ok('gratis: y quedó vacía', await contar('select count(*)::int n from public.movimientos where empresa_id=$1', [P.empresaId]), 0);
  rechazado('gratis: después, una deuda sigue siendo del Pro',
    await como(P.uid, "select public.crear_deuda($1,'V','tarjeta','B',1)", [P.empresaId]), ES_DE_PAGO);
  aceptado('gratis: y un gasto sigue entrando', await como(P.uid, MOV, [P.empresaId, 'gasto', 'Pan', 'Comida', 5000]));

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Sin sesión, el sistema sigue libre');
  // ═══════════════════════════════════════════════════════════
  // Tareas programadas, webhooks, service_role: auth.uid() es null.
  aceptado('un INSERT de fiado a un negocio vencido',
    await sinSesion("insert into public.fiado (empresa_id, cliente_id, tipo, monto, fecha, concepto) values ($1,$2,'fio',1,current_date,'sistema')", [NR.empresaId, NR.persona]));
  aceptado('un INSERT de cuentas_dinero',
    await sinSesion("insert into public.cuentas_dinero (empresa_id, nombre, tipo) values ($1,'Sistema','banco')", [NR.empresaId]));
  aceptado('un UPDATE de cuentas_dinero',
    await sinSesion("update public.cuentas_dinero set nombre = 'Caja chica' where id = $1", [NR.cuenta]));
  aceptado('un INSERT de ajustes_cuenta',
    await sinSesion("insert into public.ajustes_cuenta (empresa_id, cuenta_id, tipo, monto, fecha) values ($1,$2,'ajuste',1,current_date)", [NR.empresaId, NR.cuenta]));
  aceptado('un UPDATE de paquetes',
    await sinSesion('update public.paquetes set vence_el = null where id = $1', [NR.paquete]));
  aceptado('un INSERT de clases_dadas',
    await sinSesion("insert into public.clases_dadas (empresa_id, paquete_id, fecha, cantidad) values ($1,$2,current_date,1)", [NR.empresaId, NR.paquete]));
  rechazado('pero la persona sigue sin poder',
    await como(NR.uid, "select public.anotar_fiado($1,$2,1000,'x')", [NR.empresaId, NR.persona]), CANDADO);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · La marca de «vaciar» no abre el candado');
  // ═══════════════════════════════════════════════════════════
  // Desde el navegador no se puede poner: PostgREST no deja mandar un SET
  // ni llamar a set_config (no está en los esquemas que expone). Acá se
  // pone con SQL crudo, que es lo máximo a lo que llega una prueba: aun así,
  // un INSERT no pasa y la marca de otra empresa no sirve.
  const marcar = (emp) => db.query("select set_config('orden.vaciando', $1, true)", [emp]);
  rechazado('con la marca puesta a mano, anotar fiado (un INSERT) no pasa',
    await H.intentar(db, NR.uid, async () => {
      await marcar(NR.empresaId);
      return db.query("select public.anotar_fiado($1,$2,1000,'x')", [NR.empresaId, NR.persona]);
    }), CANDADO);
  rechazado('ni un gasto',
    await H.intentar(db, NR.uid, async () => {
      await marcar(NR.empresaId);
      return db.query(MOV, [NR.empresaId, 'gasto', 'x', 'Comida', 1]);
    }), CANDADO);
  rechazado('la marca de otra empresa no abre un UPDATE de esta',
    await H.intentar(db, NR.uid, async () => {
      await marcar(NA.empresaId);
      return db.query("select public.guardar_cuenta_dinero($1,'Caja X','efectivo',0,'{efectivo}',$2)", [NR.empresaId, NR.cuenta]);
    }), CANDADO);
  rechazado('vaciar con el nombre mal no llega a ponerla',
    await como(NR.uid, 'select public.vaciar_empresa($1,$2)', [NR.empresaId, 'otro nombre']), 'nombre exacto');
  rechazado('un administrador no puede vaciar',
    await como(NR.admin, 'select public.vaciar_empresa($1,$2)', [NR.empresaId, await nombreDe(NR.empresaId)]), 'propietario');
  let marcaAlSalir = null;
  rechazado('vaciar y, en la misma transacción, tocar la billetera: no pasa',
    await H.intentar(db, NR.uid, async () => {
      await db.query('select public.vaciar_empresa($1,$2)', [NR.empresaId, await nombreDe(NR.empresaId)]);
      marcaAlSalir = (await db.query("select coalesce(current_setting('orden.vaciando', true), '') m")).rows[0].m;
      return db.query("select public.guardar_cuenta_dinero($1,'Caja Y','efectivo',0,'{efectivo}',$2)", [NR.empresaId, NR.cuenta]);
    }), CANDADO);
  ok('vaciar apaga la marca antes de volver', marcaAlSalir, '');
  ok('y como la transacción se deshizo, sus movimientos siguen ahí',
    await contar('select count(*)::int n from public.movimientos where empresa_id=$1', [NR.empresaId]) > 0, true);
  ok('no hay un set_config en public que PostgREST pueda exponer',
    await contar("select count(*)::int n from pg_proc where proname = 'set_config' and pronamespace = 'public'::regnamespace"), 0);
  ok('la única función que pone la marca es vaciar_empresa',
    (await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace
       and prosrc ~ 'set_config\\(\\s*''orden\\.vaciando''' order by 1`)).rows.map((x) => x.proname), ['vaciar_empresa']);
  ok('ninguna función de public llama a set_config con un nombre que venga de afuera',
    (await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace
       and prosrc ~ 'set_config\\(\\s*[^''\\s]'`)).rows.map((x) => x.proname), []);
  ok('ni trae un SET orden.* propio',
    (await db.query(`select proname from pg_proc p where exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'orden.%')`)).rows.map((x) => x.proname), []);

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Cuando paga, vuelve todo');
  // ═══════════════════════════════════════════════════════════
  const lineasAntes = await contar('select count(*)::int n from public.fiado where empresa_id=$1', [NR.empresaId]);
  ok('mientras tanto, no se le borró nada', lineasAntes >= 4, true);
  await pagar(db, NR.empresaId);
  aceptado('pagó: anota fiado otra vez', await como(NR.uid, "select public.anotar_fiado($1,$2,1000,'volví')", [NR.empresaId, NR.persona]));
  aceptado('maneja la billetera', await como(NR.uid, "select public.ajustar_saldo_cuenta($1,$2,$3,'')", [NR.empresaId, NR.cuenta, 123456]));
  aceptado('da clases', await como(NR.uid, "select public.dar_clase($1,1,null,'dada',null)", [NR.paquete]));
  ok('y el fiado de antes sigue ahí',
    await contar('select count(*)::int n from public.fiado where empresa_id=$1', [NR.empresaId]), lineasAntes + 1);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Subir un comprobante pregunta por el plan');
  // ═══════════════════════════════════════════════════════════
  const adjunta = async (C, emp = C.empresaId) => (await fila(C.uid, 'select public.puede_adjuntar($1) p', [emp]))?.p;
  const PP = await H.montarEmpresa(db, { email: 'beto@casa.com', nombre: 'Lo de Beto', tipoCuenta: 'personal' });
  ok('negocio en prueba, pagando y vencido',
    [await adjunta(NP), await adjunta(NA), await adjunta(NV)], [true, true, false]);
  ok('personal en prueba y en Gratis', [await adjunta(PP), await adjunta(P)], [true, false]);
  ok('una cuenta ajena no le pregunta a otra', await adjunta(NV, NA.empresaId), false);
  const permiso = async (rol) => (await db.query(
    "select has_function_privilege($1, 'public.puede_adjuntar(uuid)', 'execute') p", [rol])).rows[0].p;
  ok('la llama authenticated (la policy corre con su permiso), no anon',
    [await permiso('authenticated'), await permiso('anon')], [true, false]);

  // PGlite no trae el esquema storage de Supabase: se arma uno de mentira con
  // lo justo (storage.objects con RLS y storage.foldername) y se vuelve a
  // aplicar la 111, que ahora sí crea la policy. Dos veces: es idempotente.
  await db.exec(`
    create schema if not exists storage;
    create table if not exists storage.objects (bucket_id text, name text);
    alter table storage.objects enable row level security;
    create or replace function storage.foldername(name text) returns text[]
    language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
    $$;
    grant usage on schema storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
  `);
  await H.aplicarMigracion(db, '111');
  await H.aplicarMigracion(db, '111');
  const politicas = (await db.query(
    "select policyname, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects'")).rows;
  ok('hay una sola policy de subida', politicas.map((x) => x.policyname), ['comprobantes_subir']);
  ok('y pregunta por puede_adjuntar', /puede_adjuntar/.test(politicas[0]?.with_check ?? ''), true);
  const subir = (C, ruta, bucket = 'comprobantes') => como(C.uid,
    'insert into storage.objects (bucket_id, name) values ($1,$2)', [bucket, ruta]);
  const ruta = (C) => `${C.empresaId}/${C.empresaId}/1-ticket.webp`;
  aceptado('sube: negocio en prueba', await subir(NP, ruta(NP)));
  aceptado('sube: negocio que paga', await subir(NA, ruta(NA)));
  aceptado('sube: personal en prueba', await subir(PP, ruta(PP)));
  rechazado('no sube: negocio vencido', await subir(NV, ruta(NV)), 'row-level security|policy');
  rechazado('no sube: personal en Gratis', await subir(P, ruta(P)), 'row-level security|policy');
  rechazado('no sube: a la carpeta de otra cuenta', await subir(NP, ruta(NA)), 'row-level security|policy');
  rechazado('no sube: a otro bucket', await subir(NP, ruta(NP), 'otro'), 'row-level security|policy');
  await pagar(db, P.empresaId);
  aceptado('la personal que paga vuelve a subir', await subir(P, ruta(P)));

  // ═══════════════════════════════════════════════════════════
  grupo('11 · La 111 se puede aplicar dos veces');
  // ═══════════════════════════════════════════════════════════
  // crearBase ya la aplicó una vez y el grupo 10, dos más.
  const disparadores = ['cuenta_activa_fiado', 'cuenta_activa_cuentas_dinero', 'cuenta_activa_ajustes_cuenta',
    'cuenta_activa_paquetes', 'cuenta_activa_clases_dadas', 'plan_personal_fiado'];
  const trg = (await db.query(
    'select tgname, count(*)::int n from pg_trigger where tgname = any($1) group by tgname', [disparadores])).rows;
  ok('cada disparador existe una sola vez',
    disparadores.map((t) => trg.find((x) => x.tgname === t)?.n ?? 0), disparadores.map(() => 1));
  ok('clientes sigue sin candado',
    await contar("select count(*)::int n from pg_trigger where tgrelid = 'public.clientes'::regclass and tgname like 'cuenta_activa%'"), 0);
  ok('turnos_bloqueo tampoco, a propósito',
    await contar("select count(*)::int n from pg_trigger where tgrelid = 'public.turnos_bloqueo'::regclass and tgname like 'cuenta_activa%'"), 0);
  const funciones = ['exigir_cuenta_activa', 'puede_adjuntar'];
  const veces = (await db.query(
    `select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = any($1) group by p.proname`, [funciones])).rows;
  ok('cada función existe una sola vez',
    funciones.map((f) => veces.find((v) => v.proname === f)?.n ?? 0), funciones.map(() => 1));
  const NV2 = await armar(await H.montarEmpresa(db, { email: 'duenio@otra.com', nombre: 'Otra academia' }));
  await vencer(db, NV2.empresaId);
  rechazado('después de repetirla, un vencido sigue sin fiado',
    await como(NV2.uid, "select public.anotar_fiado($1,$2,1000,'x')", [NV2.empresaId, NV2.persona]), CANDADO);
  aceptado('y sigue pudiendo vaciar', await vaciar(NV2));

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL CANDADO DEL NEGOCIO VENCIDO FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DEL CANDADO DEL NEGOCIO VENCIDO PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
