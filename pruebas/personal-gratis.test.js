/**
 * La cuenta personal pasa a Gratis (migración 110, 28/09/2026).
 *
 * Matías, 28/09: la cuenta PERSONAL, al terminar sus días de prueba del
 * Pro (5 ese día; 8 desde la migración 123), no se cierra: pasa al plan
 * Gratis y sigue anotando sus gastos y sus ingresos a mano. La voz, la foto, la IA, los comprobantes, los reportes, el
 * Excel, el presupuesto, las deudas, «Me deben» y la billetera son del Pro.
 * «Los negocios no se tocan, así se quedan»: un NEGOCIO vencido sigue con el
 * candado total del 15/09 (069).
 *
 * En orden de importancia:
 *   1. que un negocio vencido siga sin cargar lo que no cargaba;
 *   2. que lo pago no se le escape a la personal en Gratis, por ningún camino;
 *   3. que lo gratis ande de verdad;
 *   4. que en prueba o pagando no se le recorte nada a nadie;
 *   5. que irse siga siendo gratis;
 *   6. que el tipo de cuenta, que ahora decide todo, lo cambie solo la
 *      administración.
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

// El mensaje de la 110 para lo del Pro. Dice que es del Pro, NO que Orden se cerró.
const ES_DE_PAGO = 'plan Pro';
// El de siempre para un negocio (069). rutinas.test.js:639-640 busca el mismo.
const CANDADO = 'Se te terminó la prueba';
// El del tipo de cuenta (110, proteger_empresa).
const SOLO_ADMIN = 'administración de Orden';

// Receta A (solo-lectura.test.js:62-65): la prueba termina sola, nadie toca nada.
const vencer = (db, id) => db.query(
  `update public.suscripciones
   set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
   where empresa_id = $1`, [id]);

// Pagar (permisos.test.js:166-167).
const pagar = (db, id) => H.comoServicio(db, () => db.query(
  "select public.aplicar_suscripcion($1,'pro','activa',now(),now()+interval '30 days','manual')", [id]));

// El insert de PantallaGastos.tsx:316-332 y 364-368, tal cual lo manda la pantalla.
const MOV = `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria,
               subtotal, descuento, monto, costo_total, metodo_pago, contraparte, notas, cuenta_id, origen)
             values ($1,$2,current_date,$3,$4,$5,0,$5,0,'efectivo','','',null,'manual') returning id`;

// Lo del Pro, con cómo se pide. `c` trae los ids armados en la prueba; `n`
// cambia los nombres para que repetir la lista no choque con un «ya existe».
// `candado`: su tabla tiene cuenta_activa_* (el negocio vencido lo tiene
// cerrado desde la 018). Las otras (fiado, billetera) la 110 las cierra para
// la personal en Gratis; al negocio vencido se las cierra la 111, y eso se
// prueba en candado-vencido.test.js.
const LO_PAGO = [
  ['una deuda nueva', true, (c, n) => ["select public.crear_deuda($1,$2,'prestamo','Financiera',100000)", [c.empresaId, `Préstamo ${n}`]]],
  ['pagar una cuota', true, (c) => ['select public.registrar_pago_deuda($1,$2)', [c.deuda, 1000]]],
  ['anotarle a alguien lo que te debe', false, (c) => ["select public.anotar_fiado($1,$2,1000,'asado')", [c.empresaId, c.persona]]],
  ['cobrarle', false, (c) => ['select public.cobrar_fiado($1,$2,500)', [c.empresaId, c.persona]]],
  ['prestarle plata de una cuenta', false, (c) => ["select public.anotar_fiado($1,$2,1000,'préstamo',null,$3)", [c.empresaId, c.persona, c.cuenta]]],
  ['una cuenta en la billetera', false, (c, n) => ["select public.guardar_cuenta_dinero($1,$2,'banco',0,'{}')", [c.empresaId, `Banco ${n}`]]],
  // Un saldo distinto cada vez: no confirmé que el mismo saldo se acepte dos veces.
  ['ajustar un saldo', false, (c, n) => ["select public.ajustar_saldo_cuenta($1,$2,$3,'')", [c.empresaId, c.cuenta, 400000 + n.length]]],
  ['transferir entre cuentas', false, (c) => ['select public.transferir_entre_cuentas($1,$2,$3,$4)', [c.empresaId, c.cuenta, c.cuenta2, 1000]]],
  // «Plata sin cuenta» (083), en /billetera. Solo hace un UPDATE de
  // movimientos: la frenaba el candado, y la 110 le deja pasar ese UPDATE a
  // un gasto de Gratis. Por eso se lo pregunta ella (bloque 13).
  ['ponerle cuenta a la plata suelta', false, (c) => ['select public.asignar_cuenta_a_sueltos($1,$2)', [c.empresaId, c.cuenta]]],
  // (132) Lo que tiene y no es plata (su auto, su terreno) vive en la
  // Billetera, que es del Pro. Su tabla nace con cuenta_activa_bienes, así
  // que al negocio vencido también se le cierra (grupo 5).
  ['anotar algo que tiene (un auto, un terreno)', true, (c, n) => ["select public.guardar_bien($1,$2,'vehiculo',80000000)", [c.empresaId, `Auto ${n}`]]],
  ['un gasto fijo', true, (c, n) => ['select public.guardar_gasto_fijo($1,$2,$3)', [c.empresaId, `Netflix ${n}`, 60000]]],
  ['un ingreso fijo', true, (c, n) => ['select public.guardar_ingreso_fijo($1,$2,$3)', [c.empresaId, `Aguinaldo ${n}`, 500000]]],
  ['el presupuesto', true, (c) => ['select public.guardar_presupuesto($1,$2,$3)', [c.empresaId, 'Ropa', 80000]]],
  ['un fondo de ahorro', true, (c, n) => ['select public.guardar_ahorro($1,$2)', [c.empresaId, `Viaje ${n}`]]],
  ['guardar plata en el fondo', true, (c) => ["select public.mover_ahorro($1,$2,'aporte',1000)", [c.empresaId, c.fondo]]],
  ['una foto del comprobante', true, (c, n) => ["select public.adjuntar($1,'foto',$2,'image/webp',1000,'')", [c.movimiento, `${c.empresaId}/${c.movimiento}/${n}.webp`]]],
  ['una nota de voz', true, (c) => ["select public.adjuntar($1,'audio',null,null,0,'gasté 20 mil')", [c.movimiento]]],
  // D9: las categorías propias viven en Presupuesto, que es del Pro.
  ['una categoría propia', true, (c, n) => ['select public.guardar_categoria_propia($1,$2)', [c.empresaId, `Mascotas ${n}`]]],
  // Una personal anota gastos e ingresos; una venta no es de Gratis (D20).
  // Por registrar_venta (solo-lectura.test.js:122-126), una línea sin
  // producto: el insert directo de una venta lo frena la RLS a cualquiera,
  // pague o no (100:170-178). Ese va aparte, en el grupo 4.
  ['una venta', true, (c) => [
    "select public.registrar_venta($1,$2::jsonb,current_date,'Torta','efectivo','','','manual',0)",
    [c.empresaId, JSON.stringify([{ nombre: 'Torta', cantidad: 1, precio_unitario: 1000 }])]]],
];
const LO_PAGO_CON_CANDADO = LO_PAGO.filter(([, candado]) => candado);

(async () => {
  const db = await H.crearBase();
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const fila = async (uid, sql, args = []) => (await como(uid, sql, args)).valor?.rows[0];
  // Lo mismo que lee el layout: datos_empresa().limites.
  const limites = async (C) => (await fila(C.uid, 'select public.datos_empresa($1) d', [C.empresaId]))?.d?.limites;
  const ia = async (C) => (await fila(C.uid, 'select public.consumir_credito_ia($1) j', [C.empresaId]))?.j;
  const excel = async (C) => (await fila(C.uid, 'select public.puede_bajar_excel($1) p', [C.empresaId]))?.p;
  const planDe = async (id) => (await db.query('select public.plan_efectivo_calculado($1) p', [id])).rows[0].p;
  const contar = async (sql, args) => (await db.query(sql, args)).rows[0].n;
  const cargar = (C, tipo = 'gasto', monto = 25000) =>
    como(C.uid, MOV, [C.empresaId, tipo, tipo === 'gasto' ? 'Súper' : 'Sueldo', tipo === 'gasto' ? 'Comida' : 'Sueldo', monto]);
  const deudaNueva = (C) => como(C.uid, "select public.crear_deuda($1,'Visa','tarjeta','Banco',1000)", [C.empresaId]);
  // Como una función SECURITY DEFINER que actúa por el dueño: sin RLS, pero
  // con su sesión, así que los triggers lo ven a él. Para probar el candado
  // de una tabla que el navegador ni siquiera puede tocar.
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
  // Solo las claves que importan, en un orden fijo.
  const claves = (l, ks) => (l ? Object.fromEntries(ks.map((k) => [k, l[k]])) : l);

  /** Arma, con la cuenta viva, todo lo que después se va a intentar tocar. */
  const armar = async (C) => {
    const c = { ...C };
    c.movimiento = (await cargar(C)).valor.rows[0].id;
    c.deuda = (await fila(C.uid, "select public.crear_deuda($1,'Visa','tarjeta','Banco',100000) id", [C.empresaId])).id;
    c.persona = (await fila(C.uid, "select public.guardar_cliente($1,'Juan','0981 234 567') id", [C.empresaId])).id;
    c.cuenta = (await fila(C.uid, "select public.guardar_cuenta_dinero($1,'Caja','efectivo',500000,'{efectivo}') id", [C.empresaId])).id;
    c.cuenta2 = (await fila(C.uid, "select public.guardar_cuenta_dinero($1,'Atlas','banco',0,'{transferencia}') id", [C.empresaId])).id;
    c.fondo = (await fila(C.uid, "select public.guardar_ahorro($1,'Emergencias') id", [C.empresaId])).id;
    await como(C.uid, "select public.anotar_fiado($1,$2,5000,'previo')", [C.empresaId, c.persona]);
    return c;
  };

  const jefe = await H.crearUsuario(db, 'jefe@orden.app');
  await db.query('insert into public.superadmins (usuario_id, nota) values ($1, $2)', [jefe, 'dueño de Orden']);   // panel.test.js:72-74

  const P = await H.montarEmpresa(db, { email: 'ana@casa.com', nombre: 'Mis finanzas', tipoCuenta: 'personal' });
  const N = await H.montarEmpresa(db, { email: 'duenio@almacen.com', nombre: 'Almacén Rosa' });
  // Una personal que nunca usó la IA: para el primer uso del mes (009:246-263).
  const Q = await H.montarEmpresa(db, { email: 'beto@casa.com', nombre: 'Lo de Beto', tipoCuenta: 'personal' });

  // ═══════════════════════════════════════════════════════════
  grupo('1 · En la prueba, la cuenta personal usa todo');
  // ═══════════════════════════════════════════════════════════
  ok('nace en prueba de Pro (102:243-245)',
    (await db.query('select plan, estado from public.suscripciones where empresa_id=$1', [P.empresaId])).rows[0],
    { plan: 'pro', estado: 'prueba' });
  const p = await armar(P);
  const n = await armar(N);
  ok('armar anda: tiene deuda, persona, dos cuentas y un fondo',
    [p.deuda, p.persona, p.cuenta, p.cuenta2, p.fondo].every(Boolean), true);
  for (const [nombre, , pedir] of LO_PAGO) {
    const [sql, args] = pedir(p, 'prueba');
    aceptado(`en prueba: ${nombre}`, await como(P.uid, sql, args));
  }
  ok('el pago de cuota dejó su fila con movimiento',
    await contar('select count(*)::int n from public.pagos_deuda where empresa_id=$1 and movimiento_id is not null', [P.empresaId]), 1);
  ok('en prueba: la IA', (await ia(P))?.permitido, true);
  ok('en prueba no es la gratis personal', (await limites(P))?.gratis_personal, false);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Terminada la prueba, pasa a Gratis, no al candado');
  // ═══════════════════════════════════════════════════════════
  await vencer(db, P.empresaId);
  await vencer(db, Q.empresaId);
  ok('el plan efectivo es gratis', await planDe(P.empresaId), 'gratis');
  ok('los límites de la gratis personal',
    claves(await limites(P), ['escritura', 'adjuntos', 'excel', 'capturas_mes', 'gratis_personal']),
    { escritura: true, adjuntos: false, excel: false, capturas_mes: 0, gratis_personal: true });
  ok('puede_cargar dice que sí', (await fila(P.uid, 'select public.puede_cargar($1) p', [P.empresaId]))?.p, true);
  ok('pero el Excel no', await excel(P), false);
  const est = (await fila(P.uid, 'select public.estado_cuenta($1) j', [P.empresaId]))?.j;
  ok('estado_cuenta: no está vencida y carga', [est?.vencida, est?.puede_cargar], [false, true]);
  ok('limites_plan(gratis) no se tocó (solo-lectura.test.js:168-171)',
    claves((await db.query("select public.limites_plan('gratis') l")).rows[0].l, ['escritura', 'excel']),
    { escritura: false, excel: true });

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Lo gratis anda: gastos, ingresos, anular, historial');
  // ═══════════════════════════════════════════════════════════
  const g = await cargar(P, 'gasto');
  aceptado('carga un gasto', g);
  aceptado('carga un ingreso', await cargar(P, 'ingreso', 3000000));
  if (g.ok) {
    aceptado('anula el que cargó mal',
      await como(P.uid, 'select public.anular_movimiento($1,$2)', [g.valor.rows[0].id, 'me equivoqué']));   // migracion.test.js:89
  }
  ok('el historial de la prueba sigue ahí',
    (await fila(P.uid, 'select count(*)::int n from public.movimientos where empresa_id=$1 and descripcion=$2', [P.empresaId, 'Súper']))?.n >= 2, true);
  aceptado('ve su resumen', await como(P.uid, 'select public.resumen_personal($1)', [P.empresaId]));   // personal.test.js:708-710
  // D11: el hábito de anotar es justo lo gratis, así que recibe los avisos del día.
  const delDia = await H.comoServicio(db, () => db.query('select public.avisos_del_dia() l').then((x) => x.rows[0].l));
  ok('recibe los avisos del día', delDia.some((x) => x.empresa_id === P.empresaId), true);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Lo del Pro no entra, por ningún camino');
  // ═══════════════════════════════════════════════════════════
  for (const [nombre, , pedir] of LO_PAGO) {
    const [sql, args] = pedir(p, 'gratis');
    const r = await como(P.uid, sql, args);
    rechazado(`gratis: ${nombre}`, r, ES_DE_PAGO);
    if (!r.ok) ok(`  y no dice que Orden se cerró (${nombre})`, /seguir usando Orden/i.test(r.error), false);
  }
  rechazado('ni por la puerta de atrás: un gasto fijo por insert directo',
    await como(P.uid, "insert into public.gastos_fijos (empresa_id, nombre, importe) values ($1,'X',1)", [P.empresaId]),
    'denied|permission|' + ES_DE_PAGO);   // 024:243-246 revoca la escritura directa
  // El candado corre antes que la RLS: una venta por insert directo la frena
  // la 110 con su mensaje, no solo la policy.
  rechazado('ni una venta por insert directo',
    await como(P.uid, `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, descuento, monto, costo_total, metodo_pago)
      values ($1,'venta',current_date,'Torta','General',1000,0,1000,0,'efectivo')`, [P.empresaId]), ES_DE_PAGO);
  // D10: sacar una cuenta de la billetera es manejar la billetera.
  rechazado('ni quitar una cuenta de la billetera',
    await como(P.uid, 'select public.quitar_cuenta_dinero($1,$2)', [P.empresaId, p.cuenta2]), ES_DE_PAGO);
  // Un gasto con una forma de pago que ninguna cuenta toma queda suelto. En
  // Gratis se carga igual, pero ponerle cuenta a mano es del Pro y el saldo
  // no se mueve (sin el bloque 13 de la 110, se aceptaba y el saldo bajaba 70.000).
  const saldoCaja = async () => (await db.query('select public.saldo_cuenta_dinero($1) s', [p.cuenta])).rows[0].s;
  const cajaAntes = await saldoCaja();
  const suelto = await como(P.uid, MOV.replace("'efectivo'", "'otro'"), [P.empresaId, 'gasto', 'Suelto', 'Comida', 70000]);
  aceptado('un gasto que ninguna cuenta toma se carga igual', suelto);
  ok('y queda sin cuenta',
    (await db.query('select cuenta_id from public.movimientos where id=$1', [suelto.valor?.rows[0].id])).rows[0]?.cuenta_id, null);
  rechazado('pero ponerle cuenta a mano, no',
    await como(P.uid, 'select public.asignar_cuenta_a_sueltos($1,$2,$3)', [P.empresaId, p.cuenta, suelto.valor?.rows[0].id]), ES_DE_PAGO);
  ok('y el saldo de la cuenta no se movió', await saldoCaja(), cajaAntes);
  ok('la IA no: con uso previo en el mes', (await ia(P))?.permitido, false);
  ok('la IA no: tampoco en el primer uso del mes', (await ia(Q))?.permitido, false);   // antes de la 110: true
  ok('y el contador no se movió',
    await contar('select count(*)::int n from public.uso_ia where empresa_id=$1', [Q.empresaId]), 0);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Un negocio vencido, igual que el 15/09');
  // ═══════════════════════════════════════════════════════════
  // Fiado, billetera y clases de un negocio vencido, y su «Empezar de cero»
  // con un pago de cuota, los cierra la 111: se prueban en
  // candado-vencido.test.js. `clientes` queda abierto a propósito (099).
  await vencer(db, N.empresaId);
  ok('la pantalla lo tapa entero y no es Gratis',
    claves(await limites(N), ['escritura', 'gratis_personal']), { escritura: false, gratis_personal: false });
  rechazado('ni un gasto', await cargar(N), CANDADO);
  rechazado('ni un ingreso', await cargar(N, 'ingreso'), CANDADO);
  rechazado('ni anular', await como(N.uid, 'select public.anular_movimiento($1,$2)', [n.movimiento, 'x']), CANDADO);
  rechazado('ni una categoría', await como(N.uid, 'select public.guardar_categoria_propia($1,$2)', [N.empresaId, 'Varios']), CANDADO);
  for (const [nombre, , pedir] of LO_PAGO_CON_CANDADO) {
    const [sql, args] = pedir(n, 'negocio');
    rechazado(`negocio vencido: ${nombre}`, await como(N.uid, sql, args), CANDADO);
  }
  const N2 = await H.montarEmpresa(db, { email: 'duenio@kiosco.com', nombre: 'Kiosco' });
  await vencer(db, N2.empresaId);
  ok('ni la IA en el primer uso del mes', (await ia(N2))?.permitido, false);   // antes de la 110: true
  ok('y sin fila de uso', await contar('select count(*)::int n from public.uso_ia where empresa_id=$1', [N2.empresaId]), 0);
  ok('ni el Excel', await excel(N), false);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · La personal que paga recupera todo');
  // ═══════════════════════════════════════════════════════════
  await pagar(db, P.empresaId);
  const lpp = await limites(P);
  ok('con Excel, fotos, capturas y sin marca de Gratis',
    [lpp?.excel, lpp?.adjuntos, lpp?.capturas_mes > 0, lpp?.gratis_personal], [true, true, true, false]);
  p.movimiento = (await cargar(P)).valor.rows[0].id;   // uno nuevo: adjuntos tiene tope por movimiento
  for (const [nombre, , pedir] of LO_PAGO) {
    const [sql, args] = pedir(p, 'pago');
    aceptado(`pagando: ${nombre}`, await como(P.uid, sql, args));
  }
  ok('pagando: la IA', (await ia(P))?.permitido, true);
  ok('pagando: el Excel', await excel(P), true);
  // puede_bajar_excel le contesta solo a quien es de la cuenta: si no, le
  // decía a cualquiera con sesión si una cuenta ajena paga o está en Gratis.
  ok('otra cuenta no puede preguntar por su Excel',
    (await fila(N.uid, 'select public.puede_bajar_excel($1) p', [P.empresaId]))?.p, false);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Llegar a Gratis por cualquier puerta da lo mismo');
  // ═══════════════════════════════════════════════════════════
  const puertas = [
    ['plan gratis y vencida (personal.test.js:684-686)', (id) => db.query(
      "update public.suscripciones set estado='vencida', plan='gratis', periodo_fin = now() - interval '5 days' where empresa_id=$1", [id])],
    ['el webhook la baja a gratis (permisos.test.js:177)', (id) => H.comoServicio(db, () =>
      db.query("select public.aplicar_suscripcion($1,'gratis')", [id]))],
    ['el panel la corta (panel.test.js:234-236)', (id) => H.intentar(db, jefe, () =>
      db.query('select public.cambiar_plan_cuenta($1,$2)', [id, 'gratis']))],
    ['pagó y se le terminó el mes (permisos.test.js:424)', (id) => H.comoServicio(db, () =>
      db.query("select public.aplicar_suscripcion($1,'pro','activa',null,now() - interval '1 day')", [id]))],
  ];
  let i = 0;
  for (const [nombre, llevar] of puertas) {
    i++;
    const X = await H.montarEmpresa(db, { email: `puerta${i}@casa.com`, nombre: `Casa ${i}`, tipoCuenta: 'personal' });
    await llevar(X.empresaId);
    ok(`${nombre}: queda en gratis`, await planDe(X.empresaId), 'gratis');
    aceptado(`${nombre}: carga un gasto`, await cargar(X));
    rechazado(`${nombre}: no una deuda`, await deudaNueva(X), ES_DE_PAGO);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Lo que manda es el tipo de cuenta de hoy');
  // ═══════════════════════════════════════════════════════════
  // cambiar_tipo_cuenta como en panel.test.js:269-273.
  const T = await H.montarEmpresa(db, { email: 'tomas@casa.com', nombre: 'Tomás', tipoCuenta: 'personal' });
  await vencer(db, T.empresaId);
  aceptado('como personal en Gratis, carga', await cargar(T));
  aceptado('la administración la pasa a negocio',
    await H.intentar(db, jefe, () => db.query('select public.cambiar_tipo_cuenta($1,$2)', [T.empresaId, 'emprendedor'])));
  rechazado('como negocio vencido, candado', await cargar(T), CANDADO);
  aceptado('y la vuelve a personal',
    await H.intentar(db, jefe, () => db.query('select public.cambiar_tipo_cuenta($1,$2)', [T.empresaId, 'personal'])));
  aceptado('de vuelta a personal, carga', await cargar(T));

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Recomendar también es gratis; se cobra si el otro paga');
  // ═══════════════════════════════════════════════════════════
  // Q está en Gratis desde el grupo 2. La empresa de Orden, como en comisiones.test.js:62-66.
  const ORDEN = (await H.intentar(db, jefe, () => db.query("select public.crear_empresa('Orden','PYG','Matías') id"))).valor.rows[0].id;
  await H.intentar(db, jefe, () => db.query('select public.definir_empresa_orden($1)', [ORDEN]));
  const cod = (await fila(Q.uid, 'select public.mi_codigo_socio() j'))?.j;
  ok('la personal en Gratis tiene su código', cod?.codigo?.length, 8);   // comisiones.test.js:442-444
  aceptado('y ve su panel de socio', await como(Q.uid, 'select public.mi_panel_socio()'));
  const R = await H.montarEmpresa(db, { email: 'rosa@casa.com', nombre: 'Lo de Rosa', tipoCuenta: 'personal' });
  aceptado('alguien entra con su código',
    await como(R.uid, 'select public.usar_codigo_referido($1,$2) j', [R.empresaId, cod?.codigo]));   // comisiones.test.js:435-437
  await vencer(db, R.empresaId);
  aceptado('el traído, en Gratis, anota', await cargar(R));
  ok('si el traído se queda en Gratis, no hay comisión',
    await contar('select count(*)::int n from public.comisiones where empresa_id=$1', [R.empresaId]), 0);
  const cobro = await H.intentar(db, jefe, () => db.query(
    'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5::numeric,$6::integer) j', [R.empresaId, 'pro', 1, 'transferencia', 40000, null]));   // comisiones.test.js:78-81
  ok('cuando paga su primer mes, sí', cobro.valor?.rows[0].j.comision_generada, true);
  // El Pro personal vale Gs. 40.000 desde la 123 (02/10/2026): la mitad son 20.000.
  ok('la mitad del precio personal (comisiones.test.js, «una cuenta personal usa el precio personal»)',
    Number((await db.query('select monto from public.comisiones where empresa_id=$1', [R.empresaId])).rows[0]?.monto), 20000);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Irse sigue siendo gratis');
  // ═══════════════════════════════════════════════════════════
  // La cuenta del grupo 1, otra vez en Gratis, con sus pagos de cuota.
  await vencer(db, P.empresaId);
  ok('P está en Gratis de nuevo', (await limites(P))?.gratis_personal, true);
  aceptado('borrar una línea del presupuesto (poner 0)',
    await como(P.uid, 'select public.guardar_presupuesto($1,$2,$3)', [P.empresaId, 'Ropa', 0]));   // personal.test.js:712-714
  const pagosAntes = await contar('select count(*)::int n from public.pagos_deuda where empresa_id=$1', [P.empresaId]);
  ok('tiene pagos de cuota atados a un movimiento',
    await contar('select count(*)::int n from public.pagos_deuda where empresa_id=$1 and movimiento_id is not null', [P.empresaId]) > 0, true);
  // cobrar_fiado ya no llena cobro_id (084), pero las filas viejas lo tienen
  // (054): se arma una, sin sesión, para probar ese SET NULL también.
  const fiadoViejo = (await db.query(
    `update public.fiado set cobro_id = (select id from public.movimientos where empresa_id = $1 limit 1)
     where id = (select id from public.fiado where empresa_id = $1 limit 1) returning id`, [P.empresaId])).rows[0].id;
  aceptado('vaciar la cuenta con pagos de cuota', await como(P.uid, 'select public.vaciar_empresa($1,$2)', [P.empresaId, 'Mis finanzas']));
  ok('y quedó sin movimientos', await contar('select count(*)::int n from public.movimientos where empresa_id=$1', [P.empresaId]), 0);
  ok('los pagos de cuota siguen, sin su movimiento',
    [await contar('select count(*)::int n from public.pagos_deuda where empresa_id=$1', [P.empresaId]),
      await contar('select count(*)::int n from public.pagos_deuda where empresa_id=$1 and movimiento_id is not null', [P.empresaId])],
    [pagosAntes, 0]);
  ok('el fiado cobrado perdió su movimiento',
    (await db.query('select cobro_id from public.fiado where id=$1', [fiadoViejo])).rows[0].cobro_id, null);
  rechazado('después, una deuda sigue siendo del Pro (la marca no quedó puesta)', await deudaNueva(P), ES_DE_PAGO);
  rechazado('tocar un pago de cuota desde el navegador, no',
    await como(P.uid, 'update public.pagos_deuda set nota = nota where empresa_id = $1', [P.empresaId]), 'denied|permission|' + ES_DE_PAGO);
  rechazado('ni desde una función, fuera del vaciado',
    await comoFuncion(P.uid, 'update public.pagos_deuda set movimiento_id = null where empresa_id = $1', [P.empresaId]), ES_DE_PAGO);
  const res = await fila(P.uid, 'select public.resumen_borrado_cuenta() r');   // borrado.test.js:195-201
  ok('el resumen de borrado la nombra', res?.r?.se_borran?.map((x) => x.nombre), ['Mis finanzas']);
  const chau = await H.intentarComo(db, 'service_role', null, () =>
    db.query('select public.borrar_datos_de_usuario($1) r', [P.uid]));   // borrado.test.js:252-257
  ok('borrar la cuenta la borra', chau.valor?.rows[0].r.empresas_borradas, 1);

  // ═══════════════════════════════════════════════════════════
  grupo('11 · El panel de Orden la cuenta como Gratis');
  // ═══════════════════════════════════════════════════════════
  const panel = async () => (await H.intentar(db, jefe, () => db.query('select public.resumen_panel() j'))).valor?.rows[0].j;
  const G1 = await H.montarEmpresa(db, { email: 'gise@casa.com', nombre: 'Gise', tipoCuenta: 'personal' });
  const antes = await panel();
  await vencer(db, G1.empresaId);
  const conGratis = await panel();
  ok('una personal que pasa a Gratis no es «vencida»', conGratis.vencidas - antes.vencidas, 0);
  ok('se cuenta en «gratis_personales»', conGratis.gratis_personales - antes.gratis_personales, 1);
  ok('y hay al menos una', conGratis.gratis_personales >= 1, true);
  // Una Pro pagada que venció por fecha sigue con estado 'activa' (solo
  // cambiar_plan_cuenta la pone 'vencida', 103:203): antes contaba «pagando».
  const V = await H.montarEmpresa(db, { email: 'vero@casa.com', nombre: 'Pagó y venció', tipoCuenta: 'personal' });
  const antesV = await panel();
  await db.query(`update public.suscripciones set estado = 'activa', plan = 'pro',
    periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '20 days' where empresa_id = $1`, [V.empresaId]);
  const conV = await panel();
  ok('la Pro vencida por fecha no es «pagando»', conV.pagando - antesV.pagando, 0);
  ok('es Gratis', conV.gratis_personales - antesV.gratis_personales, 1);
  const N3 = await H.montarEmpresa(db, { email: 'duenio@ferreteria.com', nombre: 'Ferretería' });
  const antesN3 = await panel();
  await pagar(db, N3.empresaId);
  ok('un negocio que paga sigue contando en «pagando»', (await panel()).pagando - antesN3.pagando, 1);
  // Un negocio vencido sigue siendo «vencida»: N está vencido desde el grupo 5.
  ok('y un negocio vencido sigue en «vencidas»',
    conV.vencidas, await contar(`select count(*)::int n from public.suscripciones s join public.empresas e on e.id = s.empresa_id
      where s.periodo_fin <= now() and coalesce(e.tipo_cuenta, 'emprendedor') <> 'personal'`));

  // ═══════════════════════════════════════════════════════════
  grupo('12 · La 110 se puede aplicar dos veces');
  // ═══════════════════════════════════════════════════════════
  // La base ya la trae (crearBase aplica todas): esto la aplica dos veces más.
  await H.aplicarMigracion(db, '110');
  await H.aplicarMigracion(db, '110');
  const U = await H.montarEmpresa(db, { email: 'uli@casa.com', nombre: 'Uli', tipoCuenta: 'personal' });
  await vencer(db, U.empresaId);
  aceptado('después de repetirla, la gratis carga un gasto', await cargar(U));
  rechazado('y sigue sin deudas', await deudaNueva(U), ES_DE_PAGO);
  const funciones = ['limites_de_empresa', 'es_gratis_personal', 'puede_bajar_excel', 'exigir_plan_personal',
    'exigir_cuenta_activa', 'puede_cargar', 'datos_empresa', 'estado_cuenta', 'consumir_credito_ia',
    'resumen_panel', 'proteger_empresa', 'vaciar_empresa', 'asignar_cuenta_a_sueltos'];
  const veces = (await db.query(
    `select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = any($1) group by p.proname`, [funciones])).rows;
  ok('cada función existe una sola vez',
    funciones.map((f) => veces.find((v) => v.proname === f)?.n ?? 0), funciones.map(() => 1));
  const disparadores = ['plan_personal_fiado', 'plan_personal_cuentas_dinero', 'plan_personal_ajustes_cuenta'];
  const trg = (await db.query(
    'select tgname, count(*)::int n from pg_trigger where tgname = any($1) group by tgname', [disparadores])).rows;
  ok('cada plan_personal_* existe una sola vez',
    disparadores.map((t) => trg.find((x) => x.tgname === t)?.n ?? 0), disparadores.map(() => 1));
  // (132) `bienes` no tiene plan_personal_*: a la personal en Gratis se la
  // cierra su candado de siempre (exigir_cuenta_activa, 110), que también
  // tiene que seguir una sola vez. Editar, revaluar y quitar son UPDATE de
  // esa tabla: se prueban con una cuenta nueva, que anota en la prueba y
  // después queda en Gratis.
  ok('cuenta_activa_bienes (132) existe una sola vez, antes de insertar o editar',
    (await db.query(`select count(*)::int n, min(pg_get_triggerdef(oid)) def from pg_trigger where tgname = 'cuenta_activa_bienes'`)).rows[0],
    { n: 1, def: 'CREATE TRIGGER cuenta_activa_bienes BEFORE INSERT OR UPDATE ON public.bienes FOR EACH ROW EXECUTE FUNCTION exigir_cuenta_activa()' });
  {
    rechazado('y después de repetir la 110, la gratis sigue sin anotar lo que tiene',
      await como(U.uid, "select public.guardar_bien($1,'Auto','vehiculo',80000000)", [U.empresaId]), ES_DE_PAGO);
    ok('  no quedó nada anotado', await contar('select count(*)::int n from public.bienes where empresa_id = $1', [U.empresaId]), 0);
    const W = await H.montarEmpresa(db, { email: 'walter@casa.com', nombre: 'Lo de Walter', tipoCuenta: 'personal' });
    const autoW = (await fila(W.uid, "select public.guardar_bien($1,'Auto','vehiculo',80000000) id", [W.empresaId]))?.id;
    const filaW = async () => (await db.query('select nombre, valor::int as valor, activo, baja from public.bienes where id = $1', [autoW])).rows[0];
    ok('(una personal anota su auto en la prueba)', await filaW(), { nombre: 'Auto', valor: 80000000, activo: true, baja: null });
    await vencer(db, W.empresaId);
    ok('(y queda en Gratis)', (await db.query('select public.es_gratis_personal($1) g', [W.empresaId])).rows[0].g, true);
    rechazado('en Gratis no le cambia el nombre', await como(W.uid, "select public.guardar_bien($1,'Otro nombre','vehiculo',null,null,'',$2)", [W.empresaId, autoW]), ES_DE_PAGO);
    rechazado('ni el valor', await como(W.uid, 'select public.actualizar_valor_bien($1,$2,1)', [W.empresaId, autoW]), ES_DE_PAGO);
    rechazado('ni lo quita de la lista', await como(W.uid, "select public.quitar_bien($1,$2,'vendido')", [W.empresaId, autoW]), ES_DE_PAGO);
    ok('  lo que anotó queda como lo dejó: vuelve con el Pro', await filaW(), { nombre: 'Auto', valor: 80000000, activo: true, baja: null });
    aceptado('y leerlo sigue andando (la pantalla lo tapa; la base no lo borra)', await como(W.uid, 'select public.patrimonio($1)', [W.empresaId]));
  }

  // ═══════════════════════════════════════════════════════════
  grupo('13 · El tipo de cuenta lo cambia la administración');
  // ═══════════════════════════════════════════════════════════
  const NB = await H.montarEmpresa(db, { email: 'duenio@bazar.com', nombre: 'Bazar' });
  const PG = await H.montarEmpresa(db, { email: 'lu@casa.com', nombre: 'Lu', tipoCuenta: 'personal' });
  await vencer(db, NB.empresaId);
  await vencer(db, PG.empresaId);
  const tipoDe = async (id) => (await db.query('select tipo_cuenta from public.empresas where id=$1', [id])).rows[0].tipo_cuenta;
  rechazado('un negocio vencido no se pasa a personal por su cuenta',
    await como(NB.uid, "update public.empresas set tipo_cuenta = 'personal' where id = $1", [NB.empresaId]), SOLO_ADMIN);
  ok('sigue siendo negocio', await tipoDe(NB.empresaId), 'emprendedor');
  rechazado('y sigue con el candado', await cargar(NB), CANDADO);
  rechazado('la personal en Gratis tampoco se pasa a negocio',
    await como(PG.uid, "update public.empresas set tipo_cuenta = 'emprendedor' where id = $1", [PG.empresaId]), SOLO_ADMIN);
  // Lo que hace PantallaAjustes.tsx:28-32: .update({ nombre, moneda }).
  aceptado('cambiar el nombre sí',
    await como(PG.uid, "update public.empresas set nombre = 'Lu y sus cuentas', moneda = 'PYG' where id = $1", [PG.empresaId]));
  ok('y quedó', (await db.query('select nombre from public.empresas where id=$1', [PG.empresaId])).rows[0].nombre, 'Lu y sus cuentas');
  aceptado('la administración sí lo cambia',
    await H.intentar(db, jefe, () => db.query('select public.cambiar_tipo_cuenta($1,$2)', [NB.empresaId, 'personal'])));
  ok('ahora es personal', await tipoDe(NB.empresaId), 'personal');
  let sinSesion;
  try {
    await db.query("update public.empresas set tipo_cuenta = 'emprendedor' where id = $1", [NB.empresaId]);   // habito.test.js:463
    sinSesion = { ok: true, valor: null, error: null };
  } catch (e) {
    sinSesion = { ok: false, valor: null, error: e.message };
  }
  aceptado('sin sesión (tareas del sistema, pruebas) sigue libre', sinSesion);
  ok('y quedó negocio', await tipoDe(NB.empresaId), 'emprendedor');

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE LA PERSONAL EN GRATIS FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE LA PERSONAL EN GRATIS PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
