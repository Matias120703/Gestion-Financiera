/**
 * De qué cuenta sale (o a cuál entra) cada pago (01/10/2026, migración 117).
 *
 * Matías: «en Registrar un pago tengo dos bancos, elegí Transferencia, y no
 * me salen las opciones para elegir de cuál banco debitar». Su caso, armado
 * tal cual: una caja, el Atlas (reclama transferencia y tarjeta) y el
 * Continental (un banco que no reclama nada). Con «transferencia» las dos
 * cuentas de banco son posibles y la de siempre es el Atlas.
 *
 * En orden de importancia:
 *   1. pagar una deuda con el Continental elegido baja ESE banco, y con
 *      «Automática» (sin cuenta) cae donde caía: el Atlas. Una cuenta de otro
 *      negocio nunca recibe nada. Sin «anotarlo como gasto» no se mueve nada;
 *   2. lo mismo para lo que pasa por Gastos y la captura (el disparador 074);
 *   3. las cuatro puertas que la 117 abre: pagarle al profesional, cobrar un
 *      servicio, «Atendido, cobrar» y vender un paquete, con sus reglas (solo
 *      quien administra elige, nunca con fiado, nunca la cuenta de otro);
 *   4. traer lo cobrado trabajando a una cuenta de tu personal, con el Pro;
 *   5. el negocio vencido y la personal en Gratis, rechazados como el resto;
 *   6. una sola función por nombre, nada abierto a anon;
 *   7. una cuenta archivada no recibe plata por un insert directo (118): se
 *      descarta y decide la forma de pago, como con la de otro negocio.
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

const CANDADO = 'Se te terminó la prueba';
const ES_DE_PAGO = 'plan Pro';
const NO_EXISTE = 'Esa cuenta no existe';
const SOLO_DUENO = 'Solo el dueño de la cuenta puede elegir';

// Receta A (solo-lectura.test.js:62-65): la prueba termina sola.
const vencer = (db, id) => db.query(
  `update public.suscripciones
   set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
   where empresa_id = $1`, [id]);

(async () => {
  const db = await H.crearBase();
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };
  const crudo = async (sql, args = []) => (await db.query(sql, args)).rows[0];

  const cuentaNueva = async (C, nombre, tipo, saldo, metodos) => (await valor(C.uid,
    'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id', [C.empresaId, nombre, tipo, saldo, metodos])).id;
  const saldos = async (C) => {
    const b = (await valor(C.uid, 'select public.billetera($1) j', [C.empresaId])).j;
    return Object.fromEntries(b.cuentas.map((c) => [c.nombre, Number(c.saldo)]));
  };
  const movimiento = (id) => crudo('select metodo_pago, cuenta_id, monto from public.movimientos where id = $1', [id]);

  // ---- el negocio de Matías ----
  const A = await H.montarEmpresa(db, { email: 'matias@negocio.com', nombre: 'Negocio Matías' });
  const caja = await cuentaNueva(A, 'Caja', 'efectivo', 0, ['efectivo']);
  const atlas = await cuentaNueva(A, 'Atlas', 'banco', 1000000, ['transferencia', 'tarjeta']);
  const conti = await cuentaNueva(A, 'Continental', 'banco', 1000000, []);
  const nombre = { [caja]: 'Caja', [atlas]: 'Atlas', [conti]: 'Continental' };
  const cuentaDe = async (mov) => (mov ? nombre[(await movimiento(mov)).cuenta_id] ?? '(otra o ninguna)' : '(no hay movimiento)');

  // ---- otro negocio, con su propio banco ----
  const B = await H.montarEmpresa(db, { email: 'otro@negocio.com', nombre: 'Otro negocio' });
  const deB = await cuentaNueva(B, 'Banco de B', 'banco', 500000, ['transferencia']);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Registrar un pago de deuda: el caso de Matías');
  // ═══════════════════════════════════════════════════════════
  const deuda = (await valor(A.uid, "select public.crear_deuda($1,'Préstamo','prestamo','Banco',2000000) id", [A.empresaId])).id;
  const pagar = (cuenta, gasto = true) => como(A.uid,
    "select public.registrar_pago_deuda($1,100000,null,$2,'transferencia','',$3) r", [deuda, gasto, cuenta]);

  let antes = await saldos(A);
  let r = await pagar(conti);
  aceptado('pagar por transferencia eligiendo el Continental', r);
  ok('el gasto queda en el Continental', await cuentaDe(r.valor?.rows[0].r.movimiento_id), 'Continental');
  let despues = await saldos(A);
  ok('y baja ESE banco, el otro no se toca',
    [despues.Continental - antes.Continental, despues.Atlas - antes.Atlas], [-100000, 0]);

  antes = despues;
  r = await pagar(null);
  ok('con «Automática» (sin cuenta) cae donde caía: el Atlas, que reclama la transferencia',
    await cuentaDe(r.valor?.rows[0].r.movimiento_id), 'Atlas');
  despues = await saldos(A);
  ok('y baja el Atlas', [despues.Atlas - antes.Atlas, despues.Continental - antes.Continental], [-100000, 0]);

  const saldoB = (await saldos(B))['Banco de B'];
  rechazado('una cuenta de otro negocio se rechaza', await pagar(deB), NO_EXISTE);
  ok('y el banco del otro negocio no se mueve', (await saldos(B))['Banco de B'], saldoB);
  ok('ni queda un pago a medias en la deuda',
    Number((await crudo('select count(*)::int n from public.pagos_deuda where deuda_id = $1', [deuda])).n), 2);

  antes = await saldos(A);
  r = await pagar(conti, false);
  aceptado('sin «Anotarlo también como gasto», el pago se registra igual', r);
  ok('no hay movimiento', r.valor?.rows[0].r.movimiento_id ?? null, null);
  ok('y ningún saldo se mueve, aunque llegue la cuenta', await saldos(A), antes);

  const vendedor = await H.sumarMiembro(db, A.empresaId, 'vende@negocio.com', 'vendedor');
  rechazado('un vendedor no paga deudas (ni elige la cuenta)',
    await como(vendedor, "select public.registrar_pago_deuda($1,1000,null,true,'transferencia','',$2)", [deuda, conti]));

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Gastos y la captura: el disparador respeta la elegida');
  // ═══════════════════════════════════════════════════════════
  // El insert de PantallaGastos y de la captura, con la cuenta que marca ElegirCuenta.
  const gasto = (cuenta, metodo = 'transferencia') => valor(A.uid,
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, descuento,
       monto, costo_total, metodo_pago, contraparte, notas, cuenta_id, origen)
     values ($1,'gasto',public.hoy_empresa($1),'Luz','Servicios',50000,0,50000,0,$2,'','',$3,'manual') returning id`,
    [A.empresaId, metodo, cuenta]);
  ok('un gasto con el Continental elegido cae en el Continental', await cuentaDe((await gasto(conti)).id), 'Continental');
  ok('con «Automática» lo deduce la forma de pago, como hoy', await cuentaDe((await gasto(null)).id), 'Atlas');
  ok('una cuenta de otro negocio se descarta: cae en la de su forma de pago',
    await cuentaDe((await gasto(deB)).id), 'Atlas');
  ok('y el banco del otro negocio sigue igual', (await saldos(B))['Banco de B'], saldoB);

  // La venta de la captura (registrar_venta, 096) con la cuenta.
  const venta = (cuenta, metodo = 'transferencia', uid = A.uid) => como(uid,
    "select public.registrar_venta($1,$2::jsonb,null,'Venta','" + metodo + "','','','manual',0,null,$3) id",
    [A.empresaId, JSON.stringify([{ nombre: 'Algo', cantidad: 1, precio_unitario: 30000 }]), cuenta]);
  r = await venta(conti);
  ok('una venta dictada que entró al Continental, entra al Continental', await cuentaDe(r.valor?.rows[0].id), 'Continental');

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Pagarle al profesional (117)');
  // ═══════════════════════════════════════════════════════════
  const uidPedro = await H.sumarMiembro(db, A.empresaId, 'pedro@negocio.com', 'vendedor');
  const pedro = (await valor(A.uid, "select public.guardar_profesional($1,'Pedro','comision',50,$2) id", [A.empresaId, uidPedro])).id;

  antes = await saldos(A);
  r = await como(A.uid, "select public.pagar_profesional($1,$2,40000,null,'','transferencia',$3) j", [A.empresaId, pedro, conti]);
  aceptado('pagarle por transferencia desde el Continental', r);
  let m = await movimiento(r.valor?.rows[0].j.movimiento);
  ok('queda como transferencia, en el Continental', [m?.metodo_pago, nombre[m?.cuenta_id]], ['transferencia', 'Continental']);
  despues = await saldos(A);
  ok('y baja ese banco', despues.Continental - antes.Continental, -40000);

  r = await como(A.uid, 'select public.pagar_profesional($1,$2,10000) j', [A.empresaId, pedro]);
  m = await movimiento(r.valor?.rows[0].j.movimiento);
  ok('sin los datos nuevos, como siempre: efectivo, a la caja', [m?.metodo_pago, nombre[m?.cuenta_id]], ['efectivo', 'Caja']);

  r = await como(A.uid, "select public.pagar_profesional($1,$2,10000,null,'','transferencia') j", [A.empresaId, pedro]);
  ok('con transferencia y «Automática», al banco de siempre', await cuentaDe(r.valor?.rows[0].j.movimiento), 'Atlas');

  rechazado('fiado no es una forma de pagarle',
    await como(A.uid, "select public.pagar_profesional($1,$2,10000,null,'','credito')", [A.empresaId, pedro]),
    'Esa forma de pago no es válida');
  rechazado('la cuenta de otro negocio, no',
    await como(A.uid, "select public.pagar_profesional($1,$2,10000,null,'','transferencia',$3)", [A.empresaId, pedro, deB]),
    NO_EXISTE);
  rechazado('y pagarle al equipo sigue siendo solo del dueño',
    await como(uidPedro, "select public.pagar_profesional($1,$2,10000,null,'','efectivo',$3)", [A.empresaId, pedro, caja]),
    'Solo el dueño de la cuenta puede pagar');

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Cobrar un servicio y «Atendido, cobrar» (117)');
  // ═══════════════════════════════════════════════════════════
  const corte = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
  const servicio = (uid, metodo, cuenta, prof = pedro) => como(uid,
    `select public.registrar_servicio(p_empresa => $1, p_profesional => $2, p_producto => $3,
       p_metodo_pago => $4, p_cuenta => $5) j`, [A.empresaId, prof, corte, metodo, cuenta]);

  r = await servicio(A.uid, 'transferencia', conti);
  aceptado('cobrar un corte por transferencia al Continental', r);
  m = await movimiento(r.valor?.rows[0].j.movimiento);
  ok('la venta entra al Continental, como transferencia', [m?.metodo_pago, nombre[m?.cuenta_id]], ['transferencia', 'Continental']);
  r = await servicio(A.uid, 'transferencia', null);
  ok('con «Automática», al Atlas', await cuentaDe(r.valor?.rows[0].j.movimiento), 'Atlas');
  r = await como(A.uid, 'select public.registrar_servicio($1,$2,$3) j', [A.empresaId, pedro, corte]);
  ok('como lo llamaba la pantalla vieja: efectivo, a la caja', await cuentaDe(r.valor?.rows[0].j.movimiento), 'Caja');

  rechazado('el profesional carga su corte, pero no elige la cuenta del dueño',
    await servicio(uidPedro, 'transferencia', conti), SOLO_DUENO);
  aceptado('sin cuenta, el profesional sigue cargando lo suyo', await servicio(uidPedro, 'transferencia', null));
  rechazado('la cuenta de otro negocio, no', await servicio(A.uid, 'transferencia', deB), NO_EXISTE);

  // El vendedor alquila una silla (el plan de prueba tiene lugar para tres personas).
  const silla = (await valor(A.uid, "select public.guardar_profesional($1,'Lu','alquiler',null,$2) id", [A.empresaId, vendedor])).id;
  r = await servicio(A.uid, 'transferencia', conti, silla);
  aceptado('con alquiler de silla se anota el corte', r);
  ok('pero no hay venta: la plata nunca fue del local', r.valor?.rows[0].j.movimiento ?? null, null);

  // Los turnos, insertados por el sistema para no depender del horario.
  const turno = async (hora) => (await crudo(
    `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina, cliente_nombre)
     values ($1,$2,$3, now() + make_interval(hours => $4), now() + make_interval(hours => $4) + interval '30 minutes', 'Juan')
     returning id`, [A.empresaId, pedro, corte, hora])).id;

  r = await como(A.uid, "select public.atender_reserva($1,null,'transferencia',$2) j", [await turno(1), conti]);
  aceptado('«Atendido, cobrar» por transferencia al Continental', r);
  ok('entra al Continental', await cuentaDe(r.valor?.rows[0].j.movimiento), 'Continental');
  r = await como(A.uid, 'select public.atender_reserva($1) j', [await turno(2)]);
  ok('con un solo argumento, como hasta hoy: efectivo, a la caja', await cuentaDe(r.valor?.rows[0].j.movimiento), 'Caja');
  const t3 = await turno(3);
  rechazado('la cuenta de otro negocio, no', await como(A.uid, "select public.atender_reserva($1,null,'transferencia',$2)", [t3, deB]), NO_EXISTE);
  ok('y el turno sigue pendiente (no se cobró a medias)',
    (await crudo('select estado from public.turnos_reserva where id = $1', [t3])).estado, 'pendiente');

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Vender un paquete (117)');
  // ═══════════════════════════════════════════════════════════
  const alumno = (await valor(A.uid, 'select public.guardar_cliente($1,$2,$3,$4,$5) id',
    [A.empresaId, 'Juana', '0981222333', '', null])).id;
  const paquete = (uid, metodo, cuenta) => como(uid,
    "select public.vender_paquete($1,$2,'8 clases',8,400000,$3,null,null,$4) j", [A.empresaId, alumno, metodo, cuenta]);

  r = await paquete(A.uid, 'transferencia', conti);
  aceptado('vender un paquete por transferencia al Continental', r);
  ok('entra al Continental', await cuentaDe(r.valor?.rows[0].j.movimiento), 'Continental');
  r = await como(A.uid, "select public.vender_paquete($1,$2,'4 clases',4,200000,'transferencia',null,null) j", [A.empresaId, alumno]);
  ok('con las ocho de antes, al banco de siempre', await cuentaDe(r.valor?.rows[0].j.movimiento), 'Atlas');
  rechazado('fiado con cuenta, no', await paquete(A.uid, 'credito', conti), 'Lo fiado no entra');
  rechazado('quien no administra no elige la cuenta', await paquete(vendedor, 'transferencia', conti), SOLO_DUENO);
  rechazado('ni la cuenta de otro negocio', await paquete(A.uid, 'transferencia', deB), NO_EXISTE);
  ok('el paquete rechazado no quedó creado',
    Number((await crudo('select count(*)::int n from public.paquetes where cliente_id = $1', [alumno])).n), 2);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Traer lo cobrado trabajando, a una cuenta de tu personal');
  // ═══════════════════════════════════════════════════════════
  let personal;
  await H.comoUsuario(db, uidPedro, async () => {
    personal = (await db.query("select public.crear_empresa('Mis finanzas','PYG','Pedro','America/Asuncion','personal') id")).rows[0].id;
  });
  const P = { uid: uidPedro, empresaId: personal };
  const ueno = await cuentaNueva(P, 'Ueno', 'banco', 0, []);
  // Pagos de A a Pedro ya hay (grupo 3): 60.000 en tres pagos.
  r = await como(uidPedro, 'select public.traer_ingreso_de_trabajo($1,$2,$3) j', [A.empresaId, personal, conti]);
  rechazado('una cuenta que no es de tu personal (la del negocio), no', r, NO_EXISTE);
  r = await como(uidPedro, 'select public.traer_ingreso_de_trabajo($1,$2,$3) j', [A.empresaId, personal, ueno]);
  aceptado('traerlo a su banco, el Ueno', r);
  ok('los tres pagos entran al Ueno',
    (await db.query('select cuenta_id from public.movimientos where empresa_id = $1', [personal])).rows.map((x) => x.cuenta_id === ueno),
    [true, true, true]);
  ok('y el Ueno sube lo traído', (await saldos(P)).Ueno, Number(r.valor?.rows[0].j.total));

  await como(A.uid, 'select public.pagar_profesional($1,$2,5000)', [A.empresaId, pedro]);
  r = await como(uidPedro, 'select public.traer_ingreso_de_trabajo($1,$2) j', [A.empresaId, personal]);
  aceptado('con dos argumentos, como hasta hoy', r);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · El negocio vencido y la personal en Gratis, como el resto');
  // ═══════════════════════════════════════════════════════════
  const V = await H.montarEmpresa(db, { email: 'vencido@negocio.com', nombre: 'Negocio vencido' });
  const bancoV = await cuentaNueva(V, 'Banco', 'banco', 100000, ['transferencia']);
  const deudaV = (await valor(V.uid, "select public.crear_deuda($1,'Tarjeta','tarjeta','Banco',300000) id", [V.empresaId])).id;
  const uidAna = await H.sumarMiembro(db, V.empresaId, 'ana@vencido.com', 'vendedor');
  const profV = (await valor(V.uid, "select public.guardar_profesional($1,'Ana','comision',40,$2) id", [V.empresaId, uidAna])).id;
  await vencer(db, V.empresaId);
  rechazado('vencido: pagar una deuda eligiendo la cuenta, no',
    await como(V.uid, "select public.registrar_pago_deuda($1,1000,null,true,'transferencia','',$2)", [deudaV, bancoV]), CANDADO);
  rechazado('vencido: pagarle al equipo desde una cuenta, no',
    await como(V.uid, "select public.pagar_profesional($1,$2,1000,null,'','transferencia',$3)", [V.empresaId, profV, bancoV]), CANDADO);
  ok('y su banco no se movió', Number((await crudo('select public.saldo_cuenta_dinero($1) s', [bancoV])).s), 100000);

  // La personal de Pedro, con su banco, pasa a Gratis al vencer la prueba (110).
  await como(A.uid, 'select public.pagar_profesional($1,$2,7000)', [A.empresaId, pedro]);
  const deudaP = (await valor(uidPedro, "select public.crear_deuda($1,'Visa','tarjeta','Banco',90000) id", [personal])).id;
  await vencer(db, personal);
  rechazado('en Gratis, traerlo a una cuenta elegida es del Pro',
    await como(uidPedro, 'select public.traer_ingreso_de_trabajo($1,$2,$3)', [A.empresaId, personal, ueno]), ES_DE_PAGO);
  rechazado('y pagar una deuda desde el banco, también',
    await como(uidPedro, "select public.registrar_pago_deuda($1,1000,null,true,'transferencia','',$2)", [deudaP, ueno]), ES_DE_PAGO);
  ok('el Ueno no se movió', (await saldos(P)).Ueno, 60000);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Una sola función por nombre, y nada abierto a anon');
  // ═══════════════════════════════════════════════════════════
  const NOMBRES = ['pagar_profesional', 'registrar_servicio', 'atender_reserva', 'vender_paquete',
    'traer_ingreso_de_trabajo', 'registrar_pago_deuda'];
  const lista = `('${NOMBRES.join("','")}')`;
  ok('cada una existe una sola vez (PostgREST no duda a cuál llamar)',
    (await db.query(`select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ${lista} group by p.proname having count(*) > 1`)).rows, []);
  ok('y todas reciben la cuenta',
    (await db.query(`select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ${lista} and not ('p_cuenta' = any(p.proargnames)) order by 1`)).rows, []);
  ok('anon no ejecuta ninguna',
    (await db.query(`select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ${lista} and has_function_privilege('anon', p.oid, 'execute')`)).rows, []);
  ok('quien inicia sesión, todas',
    (await db.query(`select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ${lista} and not has_function_privilege('authenticated', p.oid, 'execute')`)).rows, []);
  ok('security definer y con search_path fijo',
    (await db.query(`select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ${lista}
        and (not p.prosecdef or not coalesce(p.proconfig::text like '%search_path=public%', false))`)).rows, []);

  // La 117 se puede volver a correr sin romper ni duplicar.
  await H.aplicarMigracion(db, '117');
  await H.aplicarMigracion(db, '117');
  ok('aplicada dos veces más, sigue una sola de cada una',
    (await db.query(`select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ${lista} group by p.proname having count(*) > 1`)).rows, []);

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Una cuenta archivada no recibe plata (118)');
  // ═══════════════════════════════════════════════════════════
  // «Ya lo cobré» mandaba la cuenta guardada del sueldo aunque se hubiera
  // quitado: el sueldo entraba en la archivada y no se veía en ningún lado.
  const itau = await cuentaNueva(A, 'Itaú', 'banco', 0, []);
  nombre[itau] = 'Itaú';
  await gasto(itau);
  const quitada = await valor(A.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [A.empresaId, itau]);
  ok('con un movimiento, quitarla la archiva', quitada.j.archivada, true);
  const saldoItau = Number((await crudo('select public.saldo_cuenta_dinero($1) s', [itau])).s);
  ok('y la billetera ya no la muestra', Object.keys(await saldos(A)).includes('Itaú'), false);

  // El insert de «Ya lo cobré» (forma de pago 'otro'), con la cuenta guardada.
  const sueldo = await valor(A.uid,
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, descuento,
       monto, costo_total, metodo_pago, contraparte, notas, cuenta_id, origen)
     values ($1,'ingreso',public.hoy_empresa($1),'Sueldo','Sueldo',3000000,0,3000000,0,'otro','','',$2,'manual') returning id`,
    [A.empresaId, itau]);
  ok('el sueldo con la cuenta archivada no cae en ella', await cuentaDe(sueldo.id), '(otra o ninguna)');
  ok('queda sin cuenta (ninguna recibe «otro»): «Plata sin cuenta» lo lista',
    (await movimiento(sueldo.id)).cuenta_id, null);
  ok('y el saldo de la archivada no se mueve',
    Number((await crudo('select public.saldo_cuenta_dinero($1) s', [itau])).s), saldoItau);

  // Gastos o la captura con una lista vieja: cae en la de su forma de pago.
  antes = await saldos(A);
  ok('un gasto por transferencia con la archivada cae en el Atlas, a la vista',
    await cuentaDe((await gasto(itau)).id), 'Atlas');
  despues = await saldos(A);
  ok('y baja el Atlas, no la archivada',
    [despues.Atlas - antes.Atlas, Number((await crudo('select public.saldo_cuenta_dinero($1) s', [itau])).s)],
    [-50000, saldoItau]);
  ok('la elegida activa se sigue respetando', await cuentaDe((await gasto(conti)).id), 'Continental');

  // Corregir un movimiento viejo de la archivada no lo muda (la rama UPDATE no cambia).
  const viejo = (await crudo('select id from public.movimientos where cuenta_id = $1 limit 1', [itau])).id;
  await crudo("update public.movimientos set descripcion = 'Luz de agosto' where id = $1 returning id", [viejo]);
  ok('editar uno viejo de la archivada no lo cambia de cuenta', await cuentaDe(viejo), 'Itaú');

  // La función: definer, search_path fijo, nadie la ejecuta a mano; y se puede volver a correr.
  await H.aplicarMigracion(db, '118');
  ok('anotar_en_su_cuenta sigue siendo una, definer, con search_path y cerrada',
    (await db.query(`select count(*)::int n, bool_and(p.prosecdef) d,
        bool_and(coalesce(p.proconfig::text like '%search_path=public%', false)) sp,
        bool_or(has_function_privilege('authenticated', p.oid, 'execute')) a
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname = 'anotar_en_su_cuenta'`)).rows[0], { n: 1, d: true, sp: true, a: false });
  ok('y el disparador sigue puesto, antes de insertar o editar',
    (await db.query(`select count(*)::int n from pg_trigger
      where tgname = 'anotar_en_su_cuenta' and tgrelid = 'public.movimientos'::regclass and not tgisinternal`)).rows[0].n, 1);

  console.log(`\n${corridas - fallos}/${corridas} comprobaciones bien.`);
  if (fallos > 0) {
    console.log(`${fallos} FALLARON.`);
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
