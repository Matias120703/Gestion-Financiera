/**
 * El cobro automático con la tarjeta guardada (migraciones 125 y 126).
 *
 * Bancard no hace suscripciones: Orden guarda la tarjeta y programa el cobro.
 * Una tarea corre varias veces por día y le pide a la base, de a una, la
 * cuenta que toca cobrar (`bancard_tomar_cobro`). Acá se prueba esa decisión,
 * moviendo el vencimiento de las cuentas como si pasaran los días.
 *
 * En orden de importancia:
 *
 *   1. A NADIE SE LE COBRA DOS VECES: tomar un cobro lo reserva; la segunda
 *      llamada no devuelve la misma cuenta, ni ese día ni con una operación
 *      sin resolver.
 *   2. SE COBRA ANTES DEL CORTE: el día anterior al vencimiento, no antes.
 *   3. LOS REINTENTOS SON POCOS Y ESPACIADOS (+1 y +4 días), uno por día como
 *      mucho, y después el débito se pausa para siempre (Bancard bloquea 30
 *      días una tarjeta con 7 rechazos en 24 horas).
 *   4. NO SE LE COBRA A QUIEN NO CORRESPONDE: quien canceló, quien fue
 *      cortado, quien quitó la tarjeta, una tarjeta de otro entorno.
 *   5. SE COBRA LO QUE CORRESPONDE: las personas contratadas (o la baja
 *      programada), con la constancia si la tiene ese día.
 *   6. EL AVISO DE VENCIMIENTO sabe quién tiene débito y cuánto se le cobra,
 *      y sigue diciendo lo de antes.
 */
const fs = require('fs');
const path = require('path');
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
    console.log(`  ✓ ${nombre} → ${a.length > 150 ? a.slice(0, 147) + '...' : a}`);
  }
}

const respuesta = (op, importe, extra = {}) => ({
  token: 'f'.repeat(32),
  shop_process_id: String(op),
  response: 'S',
  response_details: 'Procesado Satisfactoriamente',
  currency: 'PYG',
  // El cobro con tarjeta guardada contesta el importe como NÚMERO (manual).
  amount: Number(importe),
  authorization_number: '654321',
  ticket_number: '2117960079',
  response_code: '00',
  response_description: 'Transaccion aprobada',
  security_information: { customer_ip: '190.128.0.1', card_source: 'L', card_country: 'PARAGUAY', version: '0.3', risk_index: '0' },
  ...extra,
});
const rechazo = (op, importe, codigo, descripcion) =>
  respuesta(op, importe, { response: 'N', response_code: codigo, response_description: descripcion, authorization_number: null });

async function principal() {
  const db = await H.crearBase();

  const J = async (sql, p) => (await db.query(sql, p)).rows[0];
  const S = async (sql, p) => (await H.comoServicio(db, () => db.query(sql, p))).rows[0]?.j;
  const U = async (uid, sql, p) => (await H.comoUsuario(db, uid, () => db.query(sql, p))).rows[0]?.j;

  const jefe = await H.montarEmpresa(db, { email: 'matias@orden.test', nombre: 'Orden SA' });
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe.uid]);
  await H.comoUsuario(db, jefe.uid, () => db.query('select public.definir_empresa_orden($1)', [jefe.empresaId]));

  const tomar = (entorno = 'produccion') => S('select public.bancard_tomar_cobro($1) j', [entorno]);
  const confirmar = (op, r, fuente = 'charge') => S('select public.bancard_confirmar($1,$2,$3) j', [op, r, fuente]);
  const crear = (c, entorno, tipo, medio, plan, periodo, personas) =>
    S('select public.bancard_crear_operacion($1,$2,$3,$4,$5,$6,$7,$8) j', [c.empresaId, c.uid, entorno, tipo, medio, plan, periodo, personas]);
  const cuenta = (c) => J(
    `select debito_activo as activo, debito_estado as estado, intentos, ultimo_error as error,
            (ciclo_fin - public.hoy_empresa(empresa_id)) as ciclo, (ultimo_intento - public.hoy_empresa(empresa_id)) as ultimo,
            personas_proxima as proxima
       from public.bancard_cuentas where empresa_id = $1`, [c.empresaId]);
  const sus = (c) => J(
    `select plan, estado, periodo, tope_vendedores, ((periodo_fin at time zone 'America/Asuncion')::date - public.hoy_empresa(empresa_id)) as dias,
            public.plan_efectivo_calculado(empresa_id) as efectivo
       from public.suscripciones where empresa_id = $1`, [c.empresaId]);
  const opDe = (id) => J('select * from public.bancard_operaciones where id = $1', [id]);

  /** El plan vence dentro de N días (al mediodía de ese día, para que la hora de la prueba no importe). */
  const venceEn = (c, n) => db.query(
    `update public.suscripciones
        set periodo_fin = ((public.hoy_empresa(empresa_id) + $2::int)::timestamp + interval '12 hours') at time zone 'America/Asuncion'
      where empresa_id = $1`, [c.empresaId, n]);
  /** Pasan N días para esa cuenta: todo lo que tiene fecha se corre para atrás. */
  async function pasanDias(c, n) {
    await db.query(`update public.suscripciones set periodo_fin = periodo_fin - make_interval(days => $2::int) where empresa_id = $1`, [c.empresaId, n]);
    await db.query(`update public.bancard_cuentas set ultimo_intento = ultimo_intento - $2::int, ciclo_fin = ciclo_fin - $2::int where empresa_id = $1`, [c.empresaId, n]);
    await db.query(
      `update public.bancard_operaciones
          set created_at = created_at - make_interval(days => $2::int), confirmada_at = confirmada_at - make_interval(days => $2::int)
        where empresa_id = $1`, [c.empresaId, n]);
  }
  /** Saca la cuenta del medio para que no la tome otra prueba. */
  const apagar = (c) => db.query('update public.bancard_cuentas set debito_activo = false where empresa_id = $1', [c.empresaId]);

  let serie = 0;
  /** Una cuenta que ya pagó por Bancard, con su tarjeta guardada y el débito al día. */
  async function conDebito({ nombre, plan = 'pro', personas = null, periodo = 'mensual', dias, entorno = 'produccion', tipoCuenta }) {
    const email = `c${++serie}@cobros.test`;
    const c = await H.montarEmpresa(db, { email, nombre, tipoCuenta });
    c.email = email;
    const o = await crear(c, entorno, 'plan', 'formulario', plan, periodo, personas);
    await confirmar(o.operacion, respuesta(o.operacion, o.importe, { amount: `${o.importe}.00` }), 'confirmacion');
    const cat = await S('select public.bancard_crear_catastro($1,$2,$3,$4,$5) j', [c.empresaId, c.uid, entorno, '0981123456', 'Autorizo el cobro de cada renovación.']);
    await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j', [cat.card_id, 'Visa', '0016', 'credit']);
    c.tarjeta = cat.card_id;
    c.pagador = cat.user_id;
    if (dias !== undefined) await venceEn(c, dias);
    return c;
  }

  ok('los días del cobro: el anterior al vencimiento, y reintentos +1 y +4',
    (await J('select public.bancard_dias_de_cobro() d')).d, [-1, 1, 4]);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Toca el día anterior al vencimiento, y se toma una sola vez');
  // ═══════════════════════════════════════════════════════════
  const A = await conDebito({ nombre: 'Almacén Uno', dias: 2 });
  let opA;
  {
    ok('recién guardada la tarjeta: débito activo y al día, sin intentos',
      await cuenta(A), { activo: true, estado: 'al_dia', intentos: 0, error: null, ciclo: null, ultimo: null, proxima: null });
    ok('faltan 2 días: todavía no toca', await tomar(), null);
    ok('y no se creó ninguna operación',
      (await J(`select count(*)::int n from public.bancard_operaciones where empresa_id = $1 and origen = 'automatico'`, [A.empresaId])).n, 0);

    await pasanDias(A, 1);
    ok('pasa un día: el plan vence mañana y la cuenta sigue con su plan', [(await sus(A)).dias, (await sus(A)).efectivo], [1, 'pro']);
    opA = await tomar();
    ok('el día anterior al vencimiento SÍ toca: devuelve lo que hace falta para cobrar',
      [opA.empresa_id, opA.importe, opA.descripcion, opA.user_id, opA.card_id, opA.intento, typeof opA.operacion],
      [A.empresaId, 190000, 'Orden Pro', A.pagador, A.tarjeta, 1, 'number']);
    const fila = await opDe(opA.operacion);
    ok('la operación ya quedó creada: automática, con tarjeta guardada, sin persona, con el importe congelado',
      [fila.estado, fila.origen, fila.medio, fila.tipo, fila.usuario_id, fila.plan, fila.periodo, Number(fila.importe), Number(fila.tarjeta_id), fila.entorno],
      ['creada', 'automatico', 'token', 'plan', null, 'pro', 'mensual', 190000, A.tarjeta, 'produccion']);
    ok('y la cuenta anotó el intento: de este vencimiento, el primero, hoy',
      await cuenta(A), { activo: true, estado: 'al_dia', intentos: 1, error: null, ciclo: 1, ultimo: 0, proxima: null });

    ok('la segunda llamada, enseguida: null (no se cobra dos veces)', await tomar(), null);
    ok('y la tercera', await tomar(), null);
    ok('sigue habiendo una sola operación automática',
      (await J(`select count(*)::int n from public.bancard_operaciones where empresa_id = $1 and origen = 'automatico'`, [A.empresaId])).n, 1);

    // Aunque la operación ya se haya resuelto, ese día no se vuelve a tomar.
    const r = await confirmar(opA.operacion, rechazo(opA.operacion, 190000, '51', 'NO APROBADA-INSUF.DE FONDOS'));
    ok('rechazada por fondos: el débito queda «reintentando» y dice cuándo es el próximo intento (vencimiento + 1)',
      [r.aprobada, r.clase, r.debito_estado, r.origen,
        (await J(`select ($1::date - public.hoy_empresa($2)) d`, [r.proximo_intento, A.empresaId])).d,
        r.tarjeta, r.destinatarios.length],
      [false, 'fondos', 'reintentando', 'automatico', 2, { marca: 'Visa', ultimos4: '0016' }, 1]);
    ok('el mismo día, ya rechazada: no se vuelve a tomar (un intento por día)', await tomar(), null);
    ok('la cuenta guarda el error para mostrárselo',
      [(await cuenta(A)).estado, (await cuenta(A)).error], ['reintentando', 'NO APROBADA-INSUF.DE FONDOS']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Los reintentos: +1 y +4 días, y después nunca más');
  // ═══════════════════════════════════════════════════════════
  {
    await pasanDias(A, 1);
    ok('el día del vencimiento: no toca (el reintento es al día siguiente)', [(await sus(A)).dias, await tomar()], [0, null]);

    await pasanDias(A, 1);
    ok('venció ayer: la cuenta ya está cortada, como cualquier otra', [(await sus(A)).dias, (await sus(A)).efectivo, (await sus(A)).estado], [-1, 'gratis', 'activa']);
    const i2 = await tomar();
    ok('vencimiento + 1: segundo intento, por el mismo importe', [i2.empresa_id, i2.intento, i2.importe], [A.empresaId, 2, 190000]);
    ok('es otra operación (un número de pedido nuevo por intento)', i2.operacion !== opA.operacion, true);
    const r2 = await confirmar(i2.operacion, rechazo(i2.operacion, 190000, '51', 'NO APROBADA-INSUF.DE FONDOS'));
    ok('rechazado otra vez: sigue reintentando; el próximo es el día +4',
      [r2.debito_estado, (await J(`select ($1::date - public.hoy_empresa($2)) d`, [r2.proximo_intento, A.empresaId])).d], ['reintentando', 3]);
    ok('el mismo día no', await tomar(), null);

    await pasanDias(A, 1);
    ok('vencimiento + 2: no', await tomar(), null);
    await pasanDias(A, 1);
    ok('vencimiento + 3: no', await tomar(), null);
    await pasanDias(A, 1);
    const i3 = await tomar();
    ok('vencimiento + 4: tercer y último intento', [(await sus(A)).dias, i3.intento], [-4, 3]);
    const r3 = await confirmar(i3.operacion, rechazo(i3.operacion, 190000, '51', 'NO APROBADA-INSUF.DE FONDOS'));
    ok('rechazado: el débito queda PAUSADO y ya no hay próximo intento',
      [r3.debito_estado, r3.proximo_intento, (await cuenta(A)).estado, (await cuenta(A)).intentos], ['pausado', null, 'pausado', 3]);

    const despues = [];
    for (let d = 0; d < 5; d++) { await pasanDias(A, 1); despues.push(await tomar()); }
    ok('los cinco días siguientes: nunca más', despues, [null, null, null, null, null]);
    ok('en total fueron tres cobros, ni uno más',
      (await db.query(`select estado, count(*)::int n from public.bancard_operaciones where empresa_id = $1 and origen = 'automatico' group by 1`, [A.empresaId])).rows,
      [{ estado: 'rechazada', n: 3 }]);
    ok('la cuenta venció como cualquier otra: no se borró nada, sigue su plan guardado',
      [(await sus(A)).plan, (await sus(A)).estado, (await sus(A)).efectivo], ['pro', 'activa', 'gratis']);

    // La persona entra y paga (con QR, con otra tarjeta): el débito se destraba.
    const manual = await crear(A, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    await confirmar(manual.operacion, respuesta(manual.operacion, manual.importe), 'confirmacion');
    ok('pagar a mano destraba el débito pausado y arranca un ciclo nuevo',
      [await cuenta(A), (await sus(A)).efectivo],
      [{ activo: true, estado: 'al_dia', intentos: 0, error: null, ciclo: null, ultimo: -5, proxima: null }, 'pro']);
    await apagar(A);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Una tarjeta que no sirve se pausa al primer rechazo; un cobro aprobado arranca de cero');
  // ═══════════════════════════════════════════════════════════
  {
    const T = await conDebito({ nombre: 'Tarjeta vencida', dias: 1 });
    const t1 = await tomar();
    const rt = await confirmar(t1.operacion, rechazo(t1.operacion, 190000, '54', 'TARJETA VENCIDA'));
    ok('código 54 (tarjeta vencida): clase «tarjeta» → pausado al primer rechazo, sin reintentos',
      [rt.clase, rt.debito_estado, rt.proximo_intento, (await cuenta(T)).intentos], ['tarjeta', 'pausado', null, 1]);
    await pasanDias(T, 2);
    ok('y no se reintenta', await tomar(), null);
    await apagar(T);

    // Aprobado al primer intento.
    const B = await conDebito({ nombre: 'Paga bien', dias: 1 });
    const b1 = await tomar();
    const rb = await confirmar(b1.operacion, respuesta(b1.operacion, b1.importe));
    ok('cobro aprobado: el plan se renueva un mes desde su vencimiento (no se le comen días)',
      [rb.aprobada, rb.origen, rb.medio, rb.tarjeta, (await sus(B)).efectivo,
        (await J(`select (s.periodo_fin = (o.antes->>'periodo_fin')::timestamptz + interval '1 month') v
                    from public.suscripciones s, public.bancard_operaciones o where s.empresa_id = $1 and o.id = $2`, [B.empresaId, b1.operacion])).v],
      [true, 'automatico', 'token', { marca: 'Visa', ultimos4: '0016' }, 'pro', true]);
    ok('y el débito queda al día, con el ciclo en cero',
      await cuenta(B), { activo: true, estado: 'al_dia', intentos: 0, error: null, ciclo: null, ultimo: 0, proxima: null });
    ok('quedó el ingreso en las finanzas de Orden y el renglón del registro, como cualquier pago',
      [(await db.query(`select count(*)::int n from public.movimientos where empresa_id = $1 and descripcion like $2`, [jefe.empresaId, `%Bancard ${b1.operacion}`])).rows[0].n,
        (await db.query(`select count(*)::int n from public.registro_admin where empresa_id = $1 and accion = 'cambiar_plan' and detalle->>'operacion' = $2`, [B.empresaId, String(b1.operacion)])).rows[0].n],
      [1, 1]);
    ok('ese día no se vuelve a tomar', await tomar(), null);
    // Al mes siguiente, de nuevo el día anterior.
    await venceEn(B, 1);
    await db.query('update public.bancard_cuentas set ultimo_intento = ultimo_intento - 30 where empresa_id = $1', [B.empresaId]);
    await db.query(`update public.bancard_operaciones set created_at = created_at - interval '30 days' where empresa_id = $1`, [B.empresaId]);
    const b2 = await tomar();
    ok('el mes siguiente: otra vez el primer intento de un ciclo nuevo', [b2.empresa_id, b2.intento], [B.empresaId, 1]);

    // Rechazado el día anterior, aprobado en el reintento (ya vencida).
    await confirmar(b2.operacion, rechazo(b2.operacion, 190000, '91', 'EMISOR EN CIERRE - INTENTE OTRA VEZ'));
    ok('un rechazo transitorio (91) también reintenta', (await cuenta(B)).estado, 'reintentando');
    await pasanDias(B, 2);
    const b3 = await tomar();
    const rb3 = await confirmar(b3.operacion, respuesta(b3.operacion, b3.importe));
    ok('aprobado en el reintento, con la cuenta ya vencida: arranca hoy, un mes entero',
      [b3.intento, rb3.aprobada, (await sus(B)).efectivo,
        (await J(`select (periodo_fin between now() + interval '1 month' - interval '1 minute' and now() + interval '1 month') v from public.suscripciones where empresa_id = $1`, [B.empresaId])).v,
        (await cuenta(B)).estado, (await cuenta(B)).intentos],
      [2, true, 'pro', true, 'al_dia', 0]);
    await apagar(B);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('4 · A quién NO se le cobra');
  // ═══════════════════════════════════════════════════════════
  {
    // Canceló: «cancela al vencer».
    const C1 = await conDebito({ nombre: 'Canceló', dias: 1 });
    await db.query('update public.suscripciones set cancela_al_vencer = true where empresa_id = $1', [C1.empresaId]);
    ok('quien pidió que no se renueve: no se le cobra', await tomar(), null);
    await apagar(C1);

    // La administración le cortó el servicio.
    const C2 = await conDebito({ nombre: 'Cortada', dias: 1 });
    await U(jefe.uid, 'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5,$6) j', [C2.empresaId, 'gratis', 1, '', null, null]);
    ok('una cuenta cortada por la administración: no', [(await sus(C2)).estado, await tomar()], ['vencida', null]);
    await apagar(C2);

    // Quitó la tarjeta: rige en el momento del pedido.
    const C3 = await conDebito({ nombre: 'Quitó la tarjeta', dias: 1 });
    await S(`select public.bancard_quitar_tarjeta($1,$2,'pedido') j`, [C3.tarjeta, C3.uid]);
    ok('quien quitó la tarjeta (aunque Bancard todavía no la haya borrado): no', await tomar(), null);

    // Una tarjeta de staging no se cobra desde producción, ni al revés.
    const C4 = await conDebito({ nombre: 'De staging', dias: 1, entorno: 'staging' });
    ok('una tarjeta guardada en staging: la tarea de producción no la toma', await tomar('produccion'), null);
    const c4 = await tomar('staging');
    ok('la de staging sí (y la operación queda en staging)',
      [c4.empresa_id, (await opDe(c4.operacion)).entorno], [C4.empresaId, 'staging']);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"prueba"}') j`, [c4.operacion]);
    await apagar(C4);

    // La persona está pagando en este momento: hay una operación viva.
    const C5 = await conDebito({ nombre: 'Pagando ahora', dias: 1 });
    const viva = await crear(C5, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    ok('con una operación viva de la persona, la tarea no cobra por atrás', await tomar(), null);
    ok('y al revés: con el cobro automático en curso, la persona recibe «viva»',
      await (async () => {
        await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [viva.operacion]);
        const t = await tomar();
        const otra = await crear(C5, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
        await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [t.operacion]);
        return [t.empresa_id === C5.empresaId, otra];
      })(),
      [true, { viva: (await J(`select max(id)::int id from public.bancard_operaciones where empresa_id = $1`, [C5.empresaId])).id, medio: 'token', estado: 'creada' }]);
    await apagar(C5);

    // Débito pausado, o esperando que la persona confirme (3D Secure).
    const C6 = await conDebito({ nombre: 'Pide 3DS', dias: 1 });
    const c6 = await tomar();
    await S(`select public.bancard_cerrar_operacion($1,'en_3ds','{"process_id":"pf*3ds"}') j`, [c6.operacion]);
    ok('el cobro automático que pide 3D Secure: el débito queda «requiere_3ds» (hace falta la persona)',
      [(await cuenta(C6)).estado, (await opDe(c6.operacion)).estado, (await opDe(c6.operacion)).process_id], ['requiere_3ds', 'en_3ds', 'pf*3ds']);
    ok('la persona, que administra la cuenta, recibe el process_id para confirmar (la inició la tarea)',
      (await U(C6.uid, 'select public.bancard_operacion_ver($1) j', [c6.operacion])).process_id, 'pf*3ds');
    await pasanDias(C6, 2);
    ok('mientras tanto no se intenta otro cobro', await tomar(), null);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [c6.operacion]);
    ok('si nadie confirmó y la operación vence, el débito vuelve a «reintentando»', (await cuenta(C6)).estado, 'reintentando');
    const c6b = await tomar();
    ok('y el reintento sale el día que toca', [c6b.empresa_id, c6b.intento], [C6.empresaId, 2]);
    await S(`select public.bancard_cerrar_operacion($1,'en_3ds','{"process_id":"pf*3ds2"}') j`, [c6b.operacion]);
    const r6 = await confirmar(c6b.operacion, respuesta(c6b.operacion, c6b.importe, { amount: '190000.00' }), 'confirmacion');
    ok('si la persona confirma el 3D Secure, la confirmación de Bancard paga y el débito queda al día',
      [r6.aprobada, (await cuenta(C6)).estado, (await sus(C6)).efectivo], [true, 'al_dia', 'pro']);
    await apagar(C6);

    // Tarjeta bloqueada 30 días.
    const C7 = await conDebito({ nombre: 'Bloqueada', dias: 1 });
    await db.query(`update public.bancard_tarjetas set bloqueada_hasta = now() + interval '10 days' where id = $1`, [C7.tarjeta]);
    ok('una tarjeta bloqueada por Bancard: no se le manda nada', await tomar(), null);
    await db.query(`update public.bancard_tarjetas set bloqueada_hasta = now() - interval '1 day' where id = $1`, [C7.tarjeta]);
    ok('cuando pasa el bloqueo, sí', (await tomar()).empresa_id, C7.empresaId);
    await apagar(C7);
    await db.query(`update public.bancard_operaciones set estado = 'vencida' where empresa_id = $1 and estado = 'creada'`, [C7.empresaId]);

    // Bancard dice que la tarjeta ya no existe o está bloqueada (error del pedido, no un rechazo).
    const C8 = await conDebito({ nombre: 'Bancard no la tiene', dias: 1 });
    const c8 = await tomar();
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"CardBlockedError"}') j`, [c8.operacion]);
    ok('si Bancard contesta CardBlockedError, la operación vence con ese motivo y el débito se pausa',
      [(await opDe(c8.operacion)).estado, (await opDe(c8.operacion)).motivo, (await cuenta(C8)).estado, (await cuenta(C8)).error],
      ['vencida', 'CardBlockedError', 'pausado', 'CardBlockedError']);
    await apagar(C8);

    // Un corte: la operación queda incierta y NO se cobra de nuevo.
    const C9 = await conDebito({ nombre: 'Se cortó el cobro', dias: 1 });
    const c9 = await tomar();
    await S(`select public.bancard_cerrar_operacion($1,'incierta','{}') j`, [c9.operacion]);
    await pasanDias(C9, 2);
    ok('un cobro que quedó incierto (se cortó): los días siguientes NO se manda otro hasta resolverlo', await tomar(), null);
    const r9 = await confirmar(c9.operacion, respuesta(c9.operacion, c9.importe), 'consulta');
    ok('la conciliación consulta y Bancard dice que se había cobrado: se activa, una vez',
      [r9.aprobada, (await opDe(c9.operacion)).fuente, (await sus(C9)).efectivo, await tomar()], [true, 'consulta', 'pro', null]);
    await apagar(C9);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Cuánto se cobra: las personas del Premium, la baja programada, la constancia');
  // ═══════════════════════════════════════════════════════════
  {
    const P = await conDebito({ nombre: 'Premium de ocho', plan: 'negocio', personas: 8, dias: 1 });
    for (let i = 0; i < 4; i++) await H.sumarMiembro(db, P.empresaId, `p${i}@premium.test`);
    ok('Premium con 8 contratadas: tope 7 vendedores', (await sus(P)).tope_vendedores, 7);
    ok('la baja a 6 queda programada (5 en el equipo)',
      (await U(P.uid, 'select public.bancard_bajar_personas($1,$2) j', [P.empresaId, 6])).personas_proxima, 6);
    const p1 = await tomar();
    ok('el cobro automático es por la cantidad programada: 250.000 + 2 × 60.000',
      [p1.empresa_id, p1.importe, (await opDe(p1.operacion)).personas, (await opDe(p1.operacion)).desglose.personas_extra], [P.empresaId, 370000, 6, 2]);
    await confirmar(p1.operacion, respuesta(p1.operacion, p1.importe));
    ok('al aprobarse se aplica la baja (tope 5) y se limpia lo programado',
      [(await sus(P)).tope_vendedores, (await cuenta(P)).proxima, (await J('select public.tope_de_miembros($1) n', [P.empresaId])).n], [5, null, 6]);

    // El mes siguiente: lo contratado (6). Pero el equipo creció… no puede: el tope es 6.
    await venceEn(P, 1);
    await db.query('update public.bancard_cuentas set ultimo_intento = ultimo_intento - 30 where empresa_id = $1', [P.empresaId]);
    const p2 = await tomar();
    ok('el mes siguiente cobra por lo contratado (6)', [p2.importe, (await opDe(p2.operacion)).personas], [370000, 6]);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [p2.operacion]);
    await apagar(P);

    // Nunca por menos que el equipo de hoy. Y (revisión 03/10) la baja
    // programada cierra la puerta: con la baja a 5, el sexto no entra por el
    // código (tope_de_miembros). Si igual hay más gente (sumada a mano), se
    // cobra por la gente, no por la baja.
    const Q = await conDebito({ nombre: 'Baja que quedó corta', plan: 'negocio', personas: 8, dias: 1 });
    for (let i = 0; i < 4; i++) await H.sumarMiembro(db, Q.empresaId, `q${i}@premium.test`);
    await U(Q.uid, 'select public.bancard_bajar_personas($1,$2) j', [Q.empresaId, 5]);
    let sexto = null;
    try { await H.sumarMiembro(db, Q.empresaId, 'q-sexto@premium.test'); } catch (e) { sexto = e.message; }
    ok('programó bajar a 5 (con 5 en el equipo): el tope ya es 5 y un sexto no entra por el código',
      [(await J('select public.tope_de_miembros($1) n', [Q.empresaId])).n, /ya tiene sus 5 personas/.test(sexto ?? '')], [5, true]);
    for (let i = 4; i < 6; i++) {
      const uid = await H.crearUsuario(db, `q${i}@premium.test`);
      await db.query(`insert into public.miembros (empresa_id, user_id, nombre, rol) values ($1, $2, 'A mano', 'vendedor')`, [Q.empresaId, uid]);
    }
    const q1 = await tomar();
    ok('si igual son 7 (sumados a mano): se cobra por 7, no por 5',
      [q1.importe, (await opDe(q1.operacion)).personas], [430000, 7]);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [q1.operacion]);
    await apagar(Q);

    // La constancia del día del cobro.
    const K = await conDebito({ nombre: 'Constante', dias: 1 });
    for (let d = 0; d < 30; d++) {
      await db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
         values ($1, 'gasto', public.hoy_empresa($1) - $2::int, 'Algo', 'Otros', 1000, 1000)`, [K.empresaId, d]);
    }
    const k1 = await tomar();
    ok('quien lleva 30 días seguidos cargando: la renovación automática lleva el 5 % de constancia',
      [k1.importe, (await opDe(k1.operacion)).desglose.descuento_fase, Number((await opDe(k1.operacion)).descuento)], [180500, 'constancia', 9500]);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [k1.operacion]);
    await apagar(K);

    // El año.
    const Y = await conDebito({ nombre: 'Paga el año', plan: 'negocio', personas: 5, periodo: 'anual', dias: 1 });
    const y1 = await tomar();
    ok('un plan anual se renueva por el año: (250.000 + 60.000) × 11',
      [y1.importe, (await opDe(y1.operacion)).periodo], [3410000, 'anual']);
    await confirmar(y1.operacion, respuesta(y1.operacion, y1.importe));
    ok('y deja otros 12 meses', [(await sus(Y)).periodo, (await sus(Y)).dias > 360], ['anual', true]);
    await apagar(Y);

    // Cuenta personal.
    const R = await conDebito({ nombre: 'Persona', tipoCuenta: 'personal', dias: 1 });
    const r1 = await tomar();
    ok('una cuenta personal: Gs. 40.000, sin personas', [r1.importe, (await opDe(r1.operacion)).personas], [40000, null]);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [r1.operacion]);
    await apagar(R);

    // No se puede cotizar: se pausa y se avisa, no revienta la tarea.
    const Z = await conDebito({ nombre: 'Sin precio', plan: 'basico', dias: 1 });
    await db.query(`update public.precios set activo = false where plan = 'basico' and tipo_cuenta = 'emprendedor' and moneda = 'PYG' and periodo = 'mensual'`);
    const z1 = await tomar();
    ok('si no se puede cotizar (falta el precio): no lanza, pausa el débito y lo devuelve para avisar',
      [z1, (await cuenta(Z)).estado, (await cuenta(Z)).error],
      [{ motivo: 'Ese plan no tiene precio cargado.', pausada: Z.empresaId }, 'pausado', 'Ese plan no tiene precio cargado.']);
    ok('y no dejó ninguna operación a medias',
      (await J(`select count(*)::int n from public.bancard_operaciones where empresa_id = $1 and origen = 'automatico'`, [Z.empresaId])).n, 0);
    await db.query(`update public.precios set activo = true where plan = 'basico'`);
    ok('la próxima llamada sigue con las demás (esta ya no molesta)', await tomar(), null);
    await apagar(Z);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Si la tarea no corrió un día; varias cuentas; la ventana que se cierra');
  // ═══════════════════════════════════════════════════════════
  {
    // No corrió el día anterior: vence hoy.
    const F = await conDebito({ nombre: 'La tarea no corrió', dias: 0 });
    const f1 = await tomar();
    ok('si ayer la tarea no corrió, hoy recupera el primer intento', [f1.empresa_id, f1.intento], [F.empresaId, 1]);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [f1.operacion]);
    await apagar(F);

    // Dos cuentas que tocan el mismo día: de a una, la que vence antes primero.
    const G1 = await conDebito({ nombre: 'Vence mañana', dias: 1 });
    const G2 = await conDebito({ nombre: 'Venció ayer sin intentos', dias: -1 });
    const g = [await tomar(), await tomar(), await tomar()];
    ok('dos cuentas que tocan: una por llamada, primero la que vence antes, y después null',
      g.map((x) => x && x.empresa_id), [G2.empresaId, G1.empresaId, null]);
    ok('cada una con su primer intento', [g[0].intento, g[1].intento], [1, 1]);
    for (const x of g.slice(0, 2)) await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [x.operacion]);
    await apagar(G1);
    await apagar(G2);

    // La ventana: hasta 2 días después del último reintento (+4 + 2 = +6).
    const V1 = await conDebito({ nombre: 'Borde de la ventana', dias: -6 });
    const v1 = await tomar();
    ok('venció hace 6 días y nunca se intentó: todavía entra', [v1.empresa_id, v1.intento], [V1.empresaId, 1]);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [v1.operacion]);
    await apagar(V1);
    const V2 = await conDebito({ nombre: 'Fuera de la ventana', dias: -7 });
    ok('venció hace 7 días: ya no se cobra solo, y el débito queda pausado', [await tomar(), (await cuenta(V2)).estado], [null, 'pausado']);
    await apagar(V2);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('7 · La conciliación y el aviso de «tu tarjeta vence»');
  // ═══════════════════════════════════════════════════════════
  {
    const conciliar = (entorno = 'produccion') => S('select public.bancard_por_conciliar($1) j', [entorno]);
    const limpio = await conciliar();
    ok('sin nada pendiente: todo vacío',
      [limpio.operaciones, limpio.tarjetas_pendientes, limpio.de_otro_entorno], [[], [], []]);

    const N = await H.montarEmpresa(db, { email: 'n@cobros.test', nombre: 'Abandonó el formulario' });
    const n1 = await crear(N, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    ok('una operación recién creada todavía no se concilia (el manual: esperar 10 minutos)', (await conciliar()).operaciones, []);
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '12 minutes' where id = $1`, [n1.operacion]);
    ok('a los 12 minutos: se consulta, pero todavía no se vence',
      (await conciliar()).operaciones, [{ id: n1.operacion, medio: 'formulario', estado: 'creada', origen: 'usuario', entorno: 'produccion', minutos: 12, vencida: false }]);
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '31 minutes' where id = $1`, [n1.operacion]);
    ok('a los 31: vencida (consulta, y si no pagó, reversa)', (await conciliar()).operaciones.map((o) => [o.id, o.vencida]), [[n1.operacion, true]]);
    await S(`select public.bancard_cerrar_operacion($1,'en_3ds','{"process_id":"x"}') j`, [n1.operacion]);
    ok('una que espera el 3D Secure tiene 60 minutos', (await conciliar()).operaciones.map((o) => [o.estado, o.vencida]), [['en_3ds', false]]);
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '61 minutes' where id = $1`, [n1.operacion]);
    ok('y a los 61 vence', (await conciliar()).operaciones.map((o) => [o.estado, o.vencida]), [['en_3ds', true]]);
    const otro = await conciliar('staging');
    ok('desde el otro entorno no se consulta: se cierra sin llamar a Bancard',
      [otro.operaciones, otro.de_otro_entorno], [[], [n1.operacion]]);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [n1.operacion]);

    const cat = await S('select public.bancard_crear_catastro($1,$2,$3,$4,$5) j', [N.empresaId, N.uid, 'produccion', '0981123456', 'Autorizo']);
    ok('un catastro recién pedido no se revisa todavía', (await conciliar()).tarjetas_pendientes, []);
    await db.query(`update public.bancard_tarjetas set created_at = now() - interval '31 minutes' where id = $1`, [cat.card_id]);
    ok('a los 31 minutos sin terminar: la conciliación lo verifica en Bancard',
      (await conciliar()).tarjetas_pendientes, [{ card_id: cat.card_id, user_id: cat.user_id, empresa_id: N.empresaId, tarjeta_id: cat.card_id }]);
    await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j', [cat.card_id, 'Visa', '0016', 'credit']);
    await S(`select public.bancard_quitar_tarjeta($1,$2,'pedido') j`, [cat.card_id, N.uid]);
    ok('una tarjeta que la persona quitó y Bancard todavía no borró: queda para reintentar el borrado',
      (await conciliar()).tarjetas_por_quitar.filter((t) => t.empresa_id === N.empresaId),
      [{ card_id: cat.card_id, user_id: cat.user_id, empresa_id: N.empresaId, tarjeta_id: cat.card_id }]);

    // Tarjeta por vencer: las cuentas al día que se cobran en 5 días menos 1.
    const W = await conDebito({ nombre: 'Vence en cinco', dias: 5 });
    const W2 = await conDebito({ nombre: 'Vence en cuatro', dias: 4 });
    const porRevisar = await S(`select public.bancard_tarjetas_por_revisar('produccion') j`);
    ok('a 5 días del vencimiento se revisa la tarjeta (el vencimiento no se guarda: se le pide a Bancard)',
      porRevisar.map((x) => [x.empresa_id, x.user_id, x.card_id, x.marca, x.ultimos4,
        x.destinatarios.map((d) => d.email)]),
      [[W.empresaId, W.pagador, W.tarjeta, 'Visa', '0016', [W.email]]]);
    ok('y dice qué día es el cobro: el anterior al vencimiento',
      (await J(`select ($1::date - public.hoy_empresa($3)) cobro, ($2::date - public.hoy_empresa($3)) fin`, [porRevisar[0].fecha_cobro, porRevisar[0].fecha_fin, W.empresaId])),
      { cobro: 4, fin: 5 });
    ok('en staging no hay ninguna', await S(`select public.bancard_tarjetas_por_revisar('staging') j`), []);
    await apagar(W);
    await apagar(W2);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('8 · El aviso de vencimiento sabe de Bancard, y sigue diciendo lo de antes');
  // ═══════════════════════════════════════════════════════════
  {
    // Todas las cuentas de las pruebas de arriba quedan lejos de vencer.
    await db.query(`update public.suscripciones set periodo_fin = now() + interval '200 days' where periodo_fin is not null`);

    const D1 = await conDebito({ nombre: 'Aviso con débito', plan: 'negocio', personas: 6, dias: 3 });
    const D2 = await H.montarEmpresa(db, { email: 'd2@cobros.test', nombre: 'Aviso sin Bancard' });
    await U(jefe.uid, 'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5,$6) j', [D2.empresaId, 'pro', 1, '', 190000, null]);
    await venceEn(D2, 1);
    const D3 = await H.montarEmpresa(db, { email: 'd3@cobros.test', nombre: 'Aviso habilitada' });
    await U(jefe.uid, 'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5,$6) j', [D3.empresaId, 'pro', 1, '', 190000, null]);
    await U(jefe.uid, 'select public.habilitar_bancard($1,true) j', [D3.empresaId]);
    await venceEn(D3, 0);
    const D4 = await H.montarEmpresa(db, { email: 'd4@cobros.test', nombre: 'Aviso en prueba' });
    await venceEn(D4, 3);
    const D5 = await conDebito({ nombre: 'Aviso con débito pausado', dias: 3 });
    await db.query(`update public.bancard_cuentas set debito_estado = 'pausado' where empresa_id = $1`, [D5.empresaId]);

    const filas = await S('select public.vencimientos_por_avisar() j');
    const de = (c) => filas.find((f) => f.empresa_id === c.empresaId);
    ok('avisa a las mismas cuentas de siempre (0, 1 y 3 días), en el orden de siempre',
      filas.map((f) => [f.dias, f.nombre]),
      [[0, 'Aviso habilitada'], [1, 'Aviso sin Bancard'], [3, 'Aviso con débito'], [3, 'Aviso con débito pausado'], [3, 'Aviso en prueba']]);
    ok('cada fila trae lo de antes más tres claves nuevas',
      Object.keys(de(D1)).sort(),
      ['bancard', 'debito', 'destinatarios', 'dias', 'empresa_id', 'fecha_fin', 'fin', 'importe', 'moneda', 'nombre',
        'periodo', 'plan', 'precio', 'tipo', 'tipo_cuenta']);
    ok('lo de antes, igual: tipo, plan, período, moneda, y el precio DE LISTA',
      [de(D1).tipo, de(D1).plan, de(D1).periodo, de(D1).moneda, Number(de(D1).precio), de(D1).tipo_cuenta, de(D1).destinatarios.length],
      ['periodo', 'negocio', 'mensual', 'PYG', 250000, 'emprendedor', 1]);
    const cobro = (await J(`select ($1::date - public.hoy_empresa($2)) d`, [de(D1).debito.fecha_cobro, D1.empresaId])).d;
    ok('con débito al día: la tarjeta, el día del cobro (el anterior al vencimiento) y lo que de verdad se le cobra (con sus 6 personas)',
      [de(D1).debito.marca, de(D1).debito.ultimos4, cobro, de(D1).importe, de(D1).bancard], ['Visa', '0016', 2, 370000, false]);
    ok('sin Bancard: sin débito, no habilitada; el importe es el de su plan',
      [de(D2).debito, de(D2).bancard, de(D2).importe, Number(de(D2).precio)], [null, false, 190000, 190000]);
    ok('habilitada a mano: lo dice, y sin débito', [de(D3).debito, de(D3).bancard], [null, true]);
    ok('una prueba que termina: tipo «prueba», sin débito, con el precio de su plan',
      [de(D4).tipo, de(D4).debito, de(D4).bancard, de(D4).importe], ['prueba', null, false, 190000]);
    ok('con el débito pausado NO promete un cobro automático: le toca pagar a la persona',
      [de(D5).debito, de(D5).importe], [null, 190000]);

    const fuente = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '126_bancard_reloj_y_avisos.sql'), 'utf8').replace(/\r\n/g, '\n');
    ok('sigue siendo solo del servidor',
      [fuente.includes('revoke all on function public.vencimientos_por_avisar() from public, anon, authenticated;'),
        fuente.includes('grant execute on function public.vencimientos_por_avisar() to service_role;'),
        (await H.intentarComo(db, 'authenticated', jefe.uid, () => db.query('select public.vencimientos_por_avisar()'))).ok],
      [true, true, false]);

    // Lo que ve la persona en su plan: cuándo es el próximo cobro.
    const estado = await U(D1.uid, `select public.bancard_estado($1,'produccion') j`, [D1.empresaId]);
    ok('la pantalla del plan dice la tarjeta, el próximo cobro y su importe',
      [estado.tarjeta.marca, estado.tarjeta.ultimos4, estado.debito.activo, estado.debito.estado, estado.debito.importe,
        (await J(`select ($1::date - public.hoy_empresa($2)) d`, [estado.debito.fecha_cobro, D1.empresaId])).d],
      ['Visa', '0016', true, 'al_dia', 370000, 2]);
    ok('y con el débito pausado no promete fecha',
      (await U(D5.uid, `select public.bancard_estado($1,'produccion') j`, [D5.empresaId])).debito.fecha_cobro, null);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('9 · La revisión del 03/10: lo anunciado se cobra, el intento se devuelve, la prueba se convierte');
  // ═══════════════════════════════════════════════════════════
  {
    await db.query(`update public.suscripciones set periodo_fin = now() + interval '200 days' where periodo_fin is not null`);

    // Hallazgo 9: el aviso dijo 180.500 (constancia); el reintento, con la
    // cuenta ya cortada y la racha rota por el candado, cobra lo mismo.
    const K2 = await conDebito({ nombre: 'Constante dos', dias: 1 });
    for (let d = 0; d < 30; d++) {
      await db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
         values ($1, 'gasto', public.hoy_empresa($1) - $2::int, 'Algo', 'Otros', 1000, 1000)`, [K2.empresaId, d]);
    }
    const k1 = await tomar();
    ok('día −1: 180.500 con la constancia (lo que dice el aviso)', [k1.importe, (await opDe(k1.operacion)).desglose.descuento_fase], [180500, 'constancia']);
    await confirmar(k1.operacion, rechazo(k1.operacion, 180500, '91', 'EMISOR EN CIERRE - INTENTE OTRA VEZ'));
    await pasanDias(K2, 2);
    await db.query(`update public.movimientos set fecha = fecha - 4 where empresa_id = $1 and categoria = 'Otros'`, [K2.empresaId]);
    ok('día +1: la cuenta está cortada y una cotización nueva ya no tiene la constancia',
      [(await sus(K2)).efectivo, (await J('select public.bancard_importe_de_renovacion($1)::float i', [K2.empresaId])).i], ['gratis', 190000]);
    const k2 = await tomar();
    const o2 = await opDe(k2.operacion);
    ok('el reintento cobra los 180.500 anunciados, con el descuento del primer intento del ciclo',
      [k2.intento, k2.importe, Number(o2.importe), Number(o2.descuento), o2.desglose.descuento_fase, o2.desglose.anunciado_en], [2, 180500, 180500, 9500, 'constancia', k1.operacion]);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"prueba"}') j`, [k2.operacion]);
    await apagar(K2);

    // Hallazgo 5: un cobro que no llegó al banco devuelve el intento.
    const I = await conDebito({ nombre: 'Sin red', dias: 1 });
    const i1 = await tomar();
    ok('tomado: intento 1', (await cuenta(I)).intentos, 1);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"red"}') j`, [i1.operacion]);
    ok('vencida por la red (sin charge): el intento vuelve a 0, el día queda usado', [(await cuenta(I)).intentos, (await cuenta(I)).ultimo], [0, 0]);
    ok('ese día no se vuelve a tomar', await tomar(), null);
    await pasanDias(I, 1);
    const i2 = await tomar();
    ok('al día siguiente sigue siendo el primer intento', i2.intento, 1);
    await S(`select public.bancard_cerrar_operacion($1,'incierta','{}') j`, [i2.operacion]);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"abandonada"}') j`, [i2.operacion]);
    ok('una incierta que la conciliación cierra sin pago: también se devuelve', (await cuenta(I)).intentos, 0);
    await pasanDias(I, 1);
    const i3 = await tomar();
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"CardNotFoundError"}') j`, [i3.operacion]);
    ok('pero si Bancard dice que la tarjeta ya no está, cuenta y pausa', [(await cuenta(I)).intentos, (await cuenta(I)).estado], [1, 'pausado']);
    await apagar(I);

    // Hallazgo 7: la cuenta en prueba con la tarjeta guardada se cobra al terminar la prueba.
    const P2 = await H.montarEmpresa(db, { email: 'prueba-con-tarjeta@cobros.test', nombre: 'Prueba con tarjeta' });
    const cat = await S('select public.bancard_crear_catastro($1,$2,$3,$4,$5) j', [P2.empresaId, P2.uid, 'produccion', '0981123456', 'Autorizo el cobro de cada renovación.']);
    await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j', [cat.card_id, 'Visa', '0016', 'credit']);
    await venceEn(P2, 1);
    const estP = await U(P2.uid, `select public.bancard_estado($1,'produccion') j`, [P2.empresaId]);
    ok('en prueba: la pantalla dice el próximo cobro (el día anterior al fin de la prueba) y cuánto',
      [(await sus(P2)).estado, (await J(`select ($1::date - public.hoy_empresa($2)) d`, [estP.debito.fecha_cobro, P2.empresaId])).d, estP.debito.importe], ['prueba', 0, 190000]);
    const p1 = await tomar();
    ok('la tarea la toma: su plan de la prueba, Gs. 190.000', [p1.empresa_id, p1.importe, (await opDe(p1.operacion)).plan], [P2.empresaId, 190000, 'pro']);
    const rp = await confirmar(p1.operacion, respuesta(p1.operacion, p1.importe));
    ok('aprobado: la prueba termina y sigue el plan, un mes desde el fin de la prueba',
      [rp.aprobada, (await sus(P2)).estado, (await sus(P2)).efectivo,
        (await J(`select (s.periodo_fin = (o.antes->>'periodo_fin')::timestamptz + interval '1 month') v from public.suscripciones s, public.bancard_operaciones o where s.empresa_id = $1 and o.id = $2`, [P2.empresaId, p1.operacion])).v],
      [true, 'activa', 'pro', true]);
    await apagar(P2);
  }

  await db.close();

  console.log(`\n${'═'.repeat(62)}`);
  console.log(fallos === 0
    ? `>>> ${corridas} COMPROBACIONES DEL COBRO AUTOMÁTICO PASARON`
    : `>>> ${fallos} DE ${corridas} COMPROBACIONES DEL COBRO AUTOMÁTICO FALLARON`);
  process.exit(fallos ? 1 : 0);
}

principal().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message ?? e, e.stack ?? '');
  process.exit(1);
});
