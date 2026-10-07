/**
 * EL PAGO OCASIONAL CON BANCARD, DE PUNTA A PUNTA (02/10/2026).
 *
 * `src/lib/bancard-flujo.ts` contra una base de verdad (PGlite con las 126
 * migraciones, como `service_role`) y un BANCARD DE MENTIRA
 * (`pruebas/bancard-falso.js`, que vuelve a calcular cada md5 con la fórmula
 * del manual). Nunca se llama a Bancard, ni a staging: no hay claves, y las
 * de acá son inventadas.
 *
 * En orden de importancia:
 *
 *   1. NADIE ACTIVA UN PLAN SIN PAGAR: una confirmación repetida, con otro
 *      importe, con un token inventado o de otro entorno no activa nada (o
 *      activa una sola vez); la pantalla no activa nada.
 *   2. NADIE PAGA DOS VECES: doble clic = el mismo formulario; una operación
 *      viva se resuelve con Bancard antes de abrir otra.
 *   3. EL PREMIUM SE PAGA POR LAS PERSONAS ELEGIDAS, y queda con ese tope.
 *   4. LO QUE QUEDÓ A MEDIAS se consulta y, pasada su vida, se revierte.
 *   5. REVERTIR un pago aprobado pide la reversa a Bancard y deshace el plan.
 *   6. NADA SECRETO queda en un pedido, un evento ni la consola.
 *
 * Lee `.compilado/` (lo arma `probar:bancard` con tsc).
 */
const H = require('./ayuda-db.js');
const { crearBancard, tokens } = require('../.compilado/bancard.js');
const F = require('../.compilado/bancard-flujo.js');
const E = require('../.compilado/bancard-estilos.js');
const { crearBancardFalso, CLAVES_DE_PRUEBA, md5 } = require('./bancard-falso.js');

const CLAVE = CLAVES_DE_PRUEBA.clavePrivada;
const SITIO = 'https://orden.com.py';

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

/**
 * La base como la ve el servidor: `rpc(nombre, args)` con argumentos por
 * nombre, como `supabase.rpc`, corriendo como `service_role`. PGlite tiene
 * una sola conexión: los pedidos van en fila (cada uno en su transacción),
 * así dos caminos «a la vez» se intercalan entre llamada y llamada, igual
 * que dos funciones de Vercel contra la base.
 */
function crearBd(db) {
  let cola = Promise.resolve();
  return {
    llamadas: 0,
    rpc(nombre, args) {
      if (!/^[a-z_]+$/.test(nombre)) throw new Error('nombre de función inválido');
      this.llamadas++;
      const claves = Object.keys(args);
      const sql = `select public.${nombre}(${claves.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as j`;
      const turno = cola.then(async () => {
        try {
          const r = await H.comoServicio(db, () => db.query(sql, claves.map((k) => args[k])));
          return { data: r.rows[0]?.j ?? null, error: null };
        } catch (e) {
          return { data: null, error: { message: e.message ?? String(e), code: e.code ?? '' } };
        }
      });
      cola = turno.then(() => undefined, () => undefined);
      return turno;
    },
  };
}

async function principal() {
  const db = await H.crearBase();
  const J = async (sql, p) => (await db.query(sql, p)).rows[0];

  /** Un servidor de Orden contra un Bancard de mentira de ese entorno. */
  function armar(entorno = 'produccion') {
    const falso = crearBancardFalso({ entorno });
    const bancard = crearBancard({ entorno, clavePublica: CLAVES_DE_PRUEBA.clavePublica, clavePrivada: CLAVE, con3ds: true }, falso.transporte);
    const avisos = [];
    const registro = [];
    const bd = crearBd(db);
    const d = {
      bd, bancard, entorno, clavePrivada: CLAVE, sitio: SITIO,
      avisar: async (r) => { avisos.push(r); },
      registrar: (t) => registro.push(t),
    };
    return { d, falso, avisos, registro, bd };
  }

  // ---- la administración, la empresa de Orden y un socio
  const jefe = await H.montarEmpresa(db, { email: 'matias@orden.test', nombre: 'Orden SA' });
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe.uid]);
  await H.comoUsuario(db, jefe.uid, () => db.query('select public.definir_empresa_orden($1)', [jefe.empresaId]));
  await db.query(`insert into public.socios (nombre, codigo, activo) values ('Socio Uno', 'SOCIO1', true)`);
  const referir = (c) => H.comoUsuario(db, jefe.uid, () => db.query('select public.asignar_referido($1,$2,$3)', [c.empresaId, 'SOCIO1', '']));

  const sus = (c) => J(
    `select plan, estado, periodo, moneda, importe::float as importe, proveedor_pago, tope_vendedores,
            periodo_fin::text as fin, public.plan_efectivo_calculado(empresa_id) as efectivo
       from public.suscripciones where empresa_id = $1`, [c.empresaId]);
  const opDe = (id) => J('select * from public.bancard_operaciones where id = $1', [id]);
  const ingresos = async (frag) => (await db.query(
    `select monto::float as monto, metodo_pago, estado::text as estado
       from public.movimientos where empresa_id = $1 and tipo = 'ingreso' and descripcion like $2 order by created_at`,
    [jefe.empresaId, `%${frag}%`])).rows;
  const registroDe = async (c) => (await db.query(
    `select accion, detalle from public.registro_admin
      where empresa_id = $1 and accion not in ('asignar_referido') order by created_at`, [c.empresaId])).rows;
  const eventos = async (op) => (await db.query(
    'select tipo, ok, clave from public.bancard_eventos where operacion_id = $1 order by id', [op])).rows;
  const rutas = (falso) => falso.pedidos.map((p) => p.ruta);
  const cuerpo = (falso, op) => JSON.stringify(falso.confirmacionDe(op));
  /**
   * La baja de personas como la pide la ruta /api/pagos/bancard/personas
   * (revisión 07/10): por el servidor, con quién lo pide y si esa cuenta ve
   * Bancard. Antes estas pruebas llamaban `bancard_bajar_personas` con la
   * sesión del dueño; esa firma ya no existe (escribía aunque la cuenta no
   * viera Bancard).
   */
  const bdDeLaBaja = crearBd(db);
  const bajar = (c, uid, personas, veBancard = true) =>
    F.programarBajaDePersonas(bdDeLaBaja, { empresa: c.empresaId, usuario: uid, personas, veBancard });
  const proximaDe = async (c) => (await J('select personas_proxima from public.bancard_cuentas where empresa_id = $1', [c.empresaId]))?.personas_proxima ?? null;

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Pago ocasional entero: formulario → confirmación → plan activo');
  // ═══════════════════════════════════════════════════════════
  const A = await H.montarEmpresa(db, { email: 'a@negocio.test', nombre: 'Despensa Sur' });
  {
    const { d, falso, avisos } = armar('produccion');
    const r = await F.iniciarPago(d, { empresa: A.empresaId, usuario: A.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    ok('la base cotiza y congela; Bancard abre el formulario',
      [r.estado, r.importe, typeof r.processId, r.reusada, r.entorno], ['listo', 190000, 'string', false, 'produccion']);

    const sb = falso.pedidos.find((p) => p.ruta === '/single_buy');
    ok('single_buy: el importe de la base, en PYG, con la descripción y la vuelta a su pantalla',
      [sb.cuerpo.operation.shop_process_id, sb.cuerpo.operation.amount, sb.cuerpo.operation.currency,
        sb.cuerpo.operation.description, sb.cuerpo.operation.return_url, sb.cuerpo.operation.cancel_url],
      [r.operacion, '190000.00', 'PYG', 'Orden Pro', `${SITIO}/plan/pago/${r.operacion}`, `${SITIO}/plan/pago/${r.operacion}`]);
    ok('y el md5 que firmó el cliente es el del manual',
      sb.cuerpo.operation.token, md5(CLAVE + r.operacion + '190000.00' + 'PYG'));

    const op0 = await opDe(r.operacion);
    ok('la operación queda creada, con el process_id guardado (para reusarlo) y el importe congelado',
      [op0.estado, op0.process_id === r.processId, Number(op0.importe), op0.medio, op0.entorno], ['creada', true, 190000, 'formulario', 'produccion']);
    ok('volver a la pantalla NO activa nada: la cuenta sigue en prueba', (await sus(A)).estado, 'prueba');

    // La persona paga en el formulario (tarjeta, QR…) y Bancard confirma.
    falso.pagar(r.operacion);
    const conf = await F.recibirConfirmacion(d, cuerpo(falso, r.operacion));
    ok('la confirmación de Bancard: 200 {"status":"success"}', conf, { http: 200, cuerpo: { status: 'success' } });

    const s = await sus(A);
    ok('el plan queda activo: Pro mensual, en guaraníes, por Bancard',
      [s.plan, s.estado, s.periodo, s.moneda, s.importe, s.proveedor_pago, s.efectivo],
      ['pro', 'activa', 'mensual', 'PYG', 190000, 'bancard', 'pro']);
    ok('la operación queda pagada, por la confirmación', [(await opDe(r.operacion)).estado, (await opDe(r.operacion)).fuente], ['pagada', 'confirmacion']);
    ok('el ingreso en las finanzas de Orden: bruto, con tarjeta', await ingresos(`Bancard ${r.operacion}`),
      [{ monto: 190000, metodo_pago: 'tarjeta', estado: 'activo' }]);
    ok('y el renglón que dice «ya pagó» (vía Bancard)',
      (await registroDe(A)).map((x) => [x.accion, x.detalle.via, Number(x.detalle.importe)]), [['cambiar_plan', 'bancard', 190000]]);
    ok('se avisa una vez, con la descripción de Bancard para el comprobante',
      [avisos.length, avisos[0]?.aprobada, avisos[0]?.ya, avisos[0]?.descripcion_respuesta, typeof avisos[0]?.fecha],
      [1, true, false, 'Transaccion aprobada', 'string']);
    ok('el aviso no trae nada que no se pueda mostrar',
      ['authorization_number', 'response_code', 'token', 'process_id'].filter((k) => JSON.stringify(avisos[0]).includes(k)), []);

    // La pantalla de vuelta le pregunta a Bancard igual: no cambia nada.
    const fin = s.fin;
    ok('la consulta de la pantalla de vuelta: «pagada», sin tocar nada', await F.resolverOperacion(d, r.operacion), 'pagada');
    ok('ni la fecha, ni el ingreso, ni un segundo aviso',
      [(await sus(A)).fin === fin, (await ingresos(`Bancard ${r.operacion}`)).length, avisos.length], [true, 1, 1]);
    ok('quedó anotada la consulta (marca «Recibimos pedido de confirmación»)',
      [(await opDe(r.operacion)).consultas, (await eventos(r.operacion)).map((e) => `${e.tipo}:${e.clave}`)],
      [1, ['single_buy:null', 'confirmacion:aprobada', 'consulta:null']]);
    ok('la lectura de servicio cuenta las consultas',
      (await J('select public.bancard_operacion_interna($1) j', [r.operacion])).j.consultas, 1);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Premium: se paga por las personas elegidas');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso, avisos } = armar('produccion');
    const B = await H.montarEmpresa(db, { email: 'b@negocio.test', nombre: 'Kiosco Norte' });
    await referir(B);
    const r = await F.iniciarPago(d, { empresa: B.empresaId, usuario: B.uid, tipo: 'plan', plan: 'negocio', periodo: 'mensual', personas: 6 });
    ok('Premium con 6 personas: 250.000 + 2 × 60.000 = 370.000', [r.estado, r.importe, r.desglose.personas_extra, r.desglose.extras], ['listo', 370000, 2, 120000]);
    falso.pagar(r.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, r.operacion));
    const s = await sus(B);
    ok('activo con tope 5 vendedores (6 con el dueño), no las 15 del plan', [s.plan, s.estado, s.tope_vendedores], ['negocio', 'activa', 5]);
    const com = (await db.query('select base::float as base, monto::float as monto, movimiento_id is not null as atada from public.comisiones where empresa_id = $1', [B.empresaId])).rows;
    ok('la comisión del socio: sobre la lista en guaraníes (250.000), una sola, atada a su ingreso',
      com, [{ base: 250000, monto: 125000, atada: true }]);
    ok('y el aviso trae la comisión para el push del socio', [avisos[0].comision?.monto, avisos[0].comision?.nombre], [125000, 'Socio Uno']);

    const C = await H.montarEmpresa(db, { email: 'c@negocio.test', nombre: 'Ferretería Este' });
    const ra = await F.iniciarPago(d, { empresa: C.empresaId, usuario: C.uid, tipo: 'plan', plan: 'negocio', periodo: 'anual', personas: 6 });
    ok('el año con 6 personas: 2.750.000 + 2 × 60.000 × 11 = 4.070.000', ra.importe, 4070000);
    falso.pagar(ra.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, ra.operacion));
    const sa = await sus(C);
    const meses = (await J(`select extract(month from age(periodo_fin, now()))::int + 12 * extract(year from age(periodo_fin, now()))::int m
                             from public.suscripciones where empresa_id = $1`, [C.empresaId])).m;
    ok('queda «anual», tope 5, y con 12 meses por delante después de la prueba',
      [sa.periodo, sa.tope_vendedores, meses >= 12], ['anual', 5, true]);

    const fuera = await F.iniciarPago(d, { empresa: C.empresaId, usuario: C.uid, tipo: 'plan', plan: 'negocio', periodo: 'mensual', personas: 3 });
    ok('menos de 4 personas: lo frena la base, con su mensaje', [fuera.estado, /entre 4 y 15/.test(fuera.mensaje)], ['error_base', true]);

    // SUMAR PERSONAS después de pagar (la regla propuesta a Matías): se
    // paga hoy, prorrateado por los días que faltan, y queda para las
    // renovaciones. Kiosco Norte pagó 6; con 15 días por delante suma 2.
    await db.query(`update public.suscripciones set periodo_fin = now() + interval '15 days' where empresa_id = $1`, [B.empresaId]);
    const finAntes = (await sus(B)).fin;
    const rp = await F.iniciarPago(d, { empresa: B.empresaId, usuario: B.uid, tipo: 'personas', plan: null, periodo: null, personas: 8 });
    ok('sumar 2 personas con 15 días por delante: 2 × 60.000 × 15/30 = 60.000, descripción «Orden mas personas»',
      [rp.estado, rp.importe, rp.desglose.personas_sumadas, rp.desglose.dias_restantes,
        falso.pedidos.filter((p) => p.ruta === '/single_buy').at(-1).cuerpo.operation.description],
      ['listo', 60000, 2, 15, 'Orden mas personas']);
    ok('la operación es de tipo personas, sobre el plan y el período que ya tiene', [(await opDe(rp.operacion)).tipo, (await opDe(rp.operacion)).plan, (await opDe(rp.operacion)).periodo], ['personas', 'negocio', 'mensual']);
    falso.pagar(rp.operacion);
    ok('la confirmación: 200', (await F.recibirConfirmacion(d, cuerpo(falso, rp.operacion))).http, 200);
    const sp = await sus(B);
    ok('entran en el acto: tope 7 (8 con el dueño), y las fechas no se mueven',
      [sp.tope_vendedores, sp.fin === finAntes, sp.plan, sp.estado], [7, true, 'negocio', 'activa']);
    ok('se anotó el ingreso en Orden y el renglón bancard_personas; la comisión del socio sigue siendo una',
      [(await ingresos(`Bancard ${rp.operacion}`)).map((i) => i.monto), (await registroDe(B)).filter((r) => r.accion === 'bancard_personas').length,
        (await db.query('select count(*)::int n from public.comisiones where empresa_id = $1', [B.empresaId])).rows[0].n],
      [[60000], 1, 1]);
    ok('sumar menos de las que ya tiene: lo frena la base',
      [(await F.iniciarPago(d, { empresa: B.empresaId, usuario: B.uid, tipo: 'personas', plan: null, periodo: null, personas: 7 })).estado], ['error_base']);

    // BAJAR rige desde la próxima renovación: no cobra, y nunca por debajo del equipo de hoy.
    const baja = await bajar(B, B.uid, 5);
    ok('bajar a 5 desde la próxima renovación: queda programado, sin operación ni cobro',
      [baja.estado, baja.proxima, await proximaDe(B), (await sus(B)).tope_vendedores,
        (await db.query('select count(*)::int n from public.bancard_operaciones where empresa_id = $1', [B.empresaId])).rows[0].n],
      ['listo', 5, 5, 7, 2]);
    await H.sumarMiembro(db, B.empresaId, 'v2@kiosco.test');
    await H.sumarMiembro(db, B.empresaId, 'v3@kiosco.test');
    await H.sumarMiembro(db, B.empresaId, 'v4@kiosco.test');
    await H.sumarMiembro(db, B.empresaId, 'v5@kiosco.test');
    // Revisión 03/10: la baja programada a 5 cierra la puerta en 5 (tope_de_miembros).
    let sexto = null;
    try { await H.sumarMiembro(db, B.empresaId, 'v6-bloqueado@kiosco.test'); } catch (e) { sexto = e.message; }
    ok('con la baja programada a 5, el sexto no entra por el código', [/ya tiene sus 5 personas/.test(sexto ?? ''), (await J('select public.tope_de_miembros($1) n', [B.empresaId])).n], [true, 5]);
    const deshacer = await bajar(B, B.uid, null);
    ok('null deshace la baja', [deshacer.estado, deshacer.proxima, await proximaDe(B)], ['listo', null, null]);
    await H.sumarMiembro(db, B.empresaId, 'v6@kiosco.test');
    ok('sin la baja, vuelve a entrar (son 6 de 8)', (await J('select count(*)::int n from public.miembros where empresa_id = $1', [B.empresaId])).n, 6);
    const menos = await bajar(B, B.uid, 4);
    ok('con 6 en el equipo no se puede bajar a 4', [menos.estado, /menos personas de las que hoy tiene tu equipo/.test(menos.mensaje ?? '')], ['error_base', true]);
    const vend = await H.sumarMiembro(db, B.empresaId, 'v7@kiosco.test');
    const delVendedor = await bajar(B, vend, 7);
    ok('un vendedor no puede bajar ni subir nada (lo dice la base, con quién lo pide)', [delVendedor.estado, delVendedor.codigo, await proximaDe(B)], ['error_base', '42501', null]);

    // Revisión 07/10 (R1.1, sonda-bajar-sin-bancard.js): la baja no puede
    // escribir para una cuenta que no ve Bancard. Con Bancard apagado, una
    // llamada directa bajaba el tope del equipo en el acto a un período pago
    // por más personas. Ahora la función es del servidor y la regla es de
    // `programarBajaDePersonas`: programar exige ver Bancard; deshacer, no.
    const antes = bdDeLaBaja.llamadas;
    const sinVer = await bajar(B, B.uid, 7, false);
    ok('una cuenta que no ve Bancard no puede programar una baja: ni siquiera se llama a la base, y el tope no se mueve',
      [sinVer.estado, bdDeLaBaja.llamadas - antes, await proximaDe(B), (await J('select public.tope_de_miembros($1) n', [B.empresaId])).n], ['no_disponible', 0, null, 8]);
    const conSesion = await H.intentar(db, B.uid, () => db.query('select public.bancard_bajar_personas($1, $2, 7) j', [B.empresaId, B.uid]));
    ok('y la función ya no se puede llamar con la sesión, ni siendo el dueño', [conSesion.ok, /permission denied/.test(conSesion.error ?? '')], [false, true]);
    ok('la firma vieja (empresa, personas) no existe más',
      /does not exist/.test((await H.intentar(db, B.uid, () => db.query('select public.bancard_bajar_personas($1, 7) j', [B.empresaId]))).error ?? ''), true);
    // Deshacer se permite siempre: si después de programarla se le
    // deshabilita Bancard, no puede quedar atrapada con el tope bajado.
    await bajar(B, B.uid, 7);
    ok('con una baja programada a 7, el tope ya es 7', [await proximaDe(B), (await J('select public.tope_de_miembros($1) n', [B.empresaId])).n], [7, 7]);
    const deshaceSinVer = await bajar(B, B.uid, null, false);
    ok('deshacerla se permite aunque la cuenta ya no vea Bancard: vuelve a lo contratado',
      [deshaceSinVer.estado, await proximaDe(B), (await J('select public.tope_de_miembros($1) n', [B.empresaId])).n], ['listo', null, 8]);
    ok('pero no a cualquiera: otro dueño no deshace la baja de una cuenta ajena',
      await (async () => {
        await bajar(B, B.uid, 7);
        const ajeno = await bajar(B, A.uid, null, false);
        const quedo = await proximaDe(B);
        await bajar(B, B.uid, null);
        return [ajeno.estado, ajeno.codigo, quedo];
      })(), ['error_base', '42501', 7]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Doble clic y operaciones vivas: nadie paga dos veces');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('produccion');
    const D = await H.montarEmpresa(db, { email: 'd@negocio.test', nombre: 'Librería Sol' });
    const p = { empresa: D.empresaId, usuario: D.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null };
    const r1 = await F.iniciarPago(d, p);
    const r2 = await F.iniciarPago(d, p);
    ok('doble clic: la misma operación y el mismo formulario', [r2.estado, r2.operacion === r1.operacion, r2.processId === r1.processId, r2.reusada], ['listo', true, true, true]);
    ok('y Bancard recibió un solo pedido de pago', rutas(falso).filter((x) => x === '/single_buy').length, 1);

    // Cambia de idea: Básico. La de Pro se resuelve primero (no pagó → reversa).
    const r3 = await F.iniciarPago(d, { ...p, plan: 'basico' });
    ok('otra cosa con una viva: se le pregunta a Bancard, se revierte la abandonada y se abre la nueva',
      [r3.estado, r3.operacion !== r1.operacion, r3.importe, (await opDe(r1.operacion)).estado],
      ['listo', true, 110000, 'vencida']);
    ok('pedidos a Bancard: single_buy, consulta, rollback, single_buy',
      rutas(falso), ['/single_buy', '/single_buy/confirmations', '/single_buy/rollback', '/single_buy']);

    // Pagó, pero la confirmación nunca llegó; vuelve y quiere pagar otra cosa.
    falso.pagar(r3.operacion);
    const r4 = await F.iniciarPago(d, { ...p, plan: 'pro' });
    ok('si la viva resulta pagada: «ya pagada», sin abrir otro formulario', [r4.estado, r4.operacion], ['ya_pagada', r3.operacion]);
    ok('y el plan quedó activo con lo que pagó (Básico)', [(await sus(D)).plan, (await sus(D)).estado, (await opDe(r3.operacion)).fuente], ['basico', 'activa', 'consulta']);
    ok('ningún single_buy de más', rutas(falso).filter((x) => x === '/single_buy').length, 2);

    // Con el plan pago y vigente no se cambia de plan por Bancard.
    const r5 = await F.iniciarPago(d, { ...p, plan: 'pro' });
    ok('cambiar de plan con días pagos: lo frena la base («escribinos»)', [r5.estado, /está pago hasta el/.test(r5.mensaje)], ['error_base', true]);
    const r6 = await F.iniciarPago(d, { ...p, plan: 'basico' });
    ok('renovar el mismo plan sí: suma otro período', [r6.estado, r6.importe], ['listo', 110000]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('4 · La confirmación: repetida, en paralelo, vacía, desconocida');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso, avisos } = armar('produccion');
    const G = await H.montarEmpresa(db, { email: 'g@negocio.test', nombre: 'Taller Uno' });
    const r = await F.iniciarPago(d, { empresa: G.empresaId, usuario: G.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pagar(r.operacion);
    const tres = [];
    for (let i = 0; i < 3; i++) tres.push(await F.recibirConfirmacion(d, cuerpo(falso, r.operacion)));
    ok('la misma confirmación tres veces: 200 las tres', tres.map((x) => x.http), [200, 200, 200]);
    const fin1 = (await sus(G)).fin;
    ok('una sola activación: un ingreso, un renglón, un aviso',
      [(await ingresos(`Bancard ${r.operacion}`)).length, (await registroDe(G)).length, avisos.length], [1, 1, 1]);
    await F.recibirConfirmacion(d, cuerpo(falso, r.operacion));
    ok('y la fecha no se corre', (await sus(G)).fin, fin1);

    // Confirmación y consulta a la vez (la persona vuelve justo cuando llega).
    const Hh = await H.montarEmpresa(db, { email: 'h@negocio.test', nombre: 'Bar Dos' });
    const rp = await F.iniciarPago(d, { empresa: Hh.empresaId, usuario: Hh.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pagar(rp.operacion);
    const [c, q] = await Promise.all([
      F.recibirConfirmacion(d, cuerpo(falso, rp.operacion)),
      F.resolverOperacion(d, rp.operacion),
    ]);
    ok('confirmación y consulta en paralelo: las dos bien', [c.http, q], [200, 'pagada']);
    ok('y UNA activación', [(await ingresos(`Bancard ${rp.operacion}`)).length, (await registroDe(Hh)).length, avisos.length], [1, 1, 2]);

    ok('cuerpo vacío (monitoreo): 200 sin hacer nada',
      [await F.recibirConfirmacion(d, ''), await F.recibirConfirmacion(d, '   '), await F.recibirConfirmacion(d, '{}'), await F.recibirConfirmacion(d, 'null')].map((x) => x.http),
      [200, 200, 200, 200]);
    ok('algo que no es JSON: 400', (await F.recibirConfirmacion(d, 'hola')).http, 400);
    ok('un pedido sin número de pedido usable: 400',
      (await F.recibirConfirmacion(d, JSON.stringify({ operation: { shop_process_id: 'abc', token: 'f'.repeat(32) } }))).http, 400);

    const ajena = { operation: { token: tokens.confirm(CLAVE, '777', '5000.00'), shop_process_id: '777', response: 'S', response_code: '00', amount: '5000.00', currency: 'PYG' } };
    const cuentas = (await J('select count(*)::int n from public.bancard_operaciones')).n;
    ok('un pedido que Orden no creó (el «Cliente de prueba» del portal), con token válido: 200',
      (await F.recibirConfirmacion(d, JSON.stringify(ajena))).http, 200);
    ok('sin crear ni tocar nada, y anotado como «desconocida»',
      [(await J('select count(*)::int n from public.bancard_operaciones')).n, (await eventos(777)).map((e) => e.clave)], [cuentas, ['desconocida']]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Abusos: token inventado, importe cambiado, otro entorno, operación ajena');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso, avisos } = armar('produccion');
    const K = await H.montarEmpresa(db, { email: 'k@negocio.test', nombre: 'Granja Kappa' });
    const r = await F.iniciarPago(d, { empresa: K.empresaId, usuario: K.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });

    // Sin pagar, alguien manda una confirmación «aprobada» con un md5 inventado.
    const inventada = { operation: { ...falso.confirmacionDe(r.operacion).operation, response: 'S', response_code: '00', token: 'a'.repeat(32) } };
    ok('token inventado y Bancard dice que no se pagó: 400', (await F.recibirConfirmacion(d, JSON.stringify(inventada))).http, 400);
    ok('y nada se activó; la operación sigue viva (no se da por abandonada)',
      [(await sus(K)).estado, (await opDe(r.operacion)).estado, (await eventos(r.operacion)).map((e) => `${e.tipo}:${e.clave}`).slice(-2)],
      ['prueba', 'creada', ['consulta:PaymentNotFoundError', 'confirmacion:token_invalido']]);

    // El mismo POST otra vez enseguida: no se le vuelve a preguntar a Bancard
    // (una consulta por minuto por operación, revisión 03/10).
    const consultasAntes = falso.pedidos.filter((p) => p.ruta === '/single_buy/confirmations').length;
    ok('el mismo POST inventado un segundo después: 400 sin otra consulta a Bancard, y una sola fila más',
      [(await F.recibirConfirmacion(d, JSON.stringify(inventada))).http,
        falso.pedidos.filter((p) => p.ruta === '/single_buy/confirmations').length - consultasAntes,
        (await eventos(r.operacion)).slice(-2).map((e) => `${e.tipo}:${e.clave}`)],
      [400, 0, ['confirmacion:token_invalido', 'confirmacion:token_invalido']]);

    // Token que no coincide (otra clave en Vercel) pero Bancard SÍ tiene el pago.
    falso.pagar(r.operacion);
    await db.query(`update public.bancard_eventos set created_at = created_at - interval '2 minutes' where operacion_id = $1 and tipo = 'consulta'`, [r.operacion]);
    ok('token que no coincide pero Bancard, consultado con nuestra clave (pasado el minuto), confirma: 200',
      (await F.recibirConfirmacion(d, JSON.stringify(inventada))).http, 200);
    ok('y se activa con lo que dijo Bancard', [(await sus(K)).estado, (await opDe(r.operacion)).fuente], ['activa', 'consulta']);

    // Importe cambiado: Bancard confirma Gs. 1 (con su md5 válido para ese importe).
    const L = await H.montarEmpresa(db, { email: 'l@negocio.test', nombre: 'Bazar Lima' });
    const rl = await F.iniciarPago(d, { empresa: L.empresaId, usuario: L.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pagar(rl.operacion, { amount: '1.00' });
    const cambiada = falso.confirmacionDe(rl.operacion);
    cambiada.operation.token = tokens.confirm(CLAVE, String(rl.operacion), '1.00');
    ok('importe cambiado: 200 (se recibió), pero NO activa', (await F.recibirConfirmacion(d, JSON.stringify(cambiada))).http, 200);
    ok('la operación queda incierta y para revisar; la cuenta, en prueba',
      [(await opDe(rl.operacion)).estado, (await opDe(rl.operacion)).revisar, (await sus(L)).estado],
      ['incierta', 'Bancard confirmó otro importe o moneda', 'prueba']);
    ok('ni un ingreso', (await ingresos(`Bancard ${rl.operacion}`)).length, 0);
    ok('y se le avisa a la administración (otro importe)', avisos.some((x) => x.ok === false && x.motivo === 'importe' && x.operacion === rl.operacion), true);

    // Una confirmación de staging llega al servidor de producción.
    const st = armar('staging');
    const M = await H.montarEmpresa(db, { email: 'm@negocio.test', nombre: 'Cuenta de prueba' });
    const rs = await F.iniciarPago(st.d, { empresa: M.empresaId, usuario: M.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    st.falso.pagar(rs.operacion);
    ok('una operación de staging confirmada en el servidor de producción: 200 sin tocar nada',
      [(await F.recibirConfirmacion(d, cuerpo(st.falso, rs.operacion))).http, (await opDe(rs.operacion)).estado, (await sus(M)).estado],
      [200, 'creada', 'prueba']);
    const pedidosAntes = falso.pedidos.length;
    ok('y producción no le pregunta a Bancard por una de staging', [await F.resolverOperacion(d, rs.operacion), falso.pedidos.length === pedidosAntes], ['sigue', true]);

    // Operación ajena: otra cuenta, un vendedor.
    const N = await H.montarEmpresa(db, { email: 'n@negocio.test', nombre: 'Otro negocio' });
    const ajena = await F.iniciarPago(d, { empresa: K.empresaId, usuario: N.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    ok('pagar el plan de una cuenta ajena: lo frena la base', [ajena.estado, ajena.codigo, /Solo el dueño/.test(ajena.mensaje)], ['error_base', '42501', true]);
    const vend = await H.sumarMiembro(db, K.empresaId, 'vend@kappa.test');
    const delVendedor = await F.iniciarPago(d, { empresa: K.empresaId, usuario: vend, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    ok('ni un vendedor de la misma cuenta', [delVendedor.estado, delVendedor.codigo], ['error_base', '42501']);
    const ver = await H.intentar(db, N.uid, () => db.query('select public.bancard_operacion_ver($1) j', [r.operacion]));
    ok('ver el pago de otro: «Ese pago no existe» (igual que si no existiera)', [ver.ok, /Ese pago no existe/.test(ver.error)], [false, true]);
    const verVend = await H.intentar(db, vend, () => db.query('select public.bancard_operacion_ver($1) j', [r.operacion]));
    ok('tampoco el vendedor', verVend.ok, false);
    const mio = (await H.comoUsuario(db, K.uid, () => db.query('select public.bancard_operacion_ver($1) j', [r.operacion]))).rows[0].j;
    ok('el dueño sí, y sin autorización ni código (los prohíbe el manual)',
      [mio.estado, mio.descripcion_respuesta, JSON.stringify(mio).includes('authorization'), JSON.stringify(mio).includes('response_code')],
      ['pagada', 'Transaccion aprobada', false, false]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Rechazo, reintento en el mismo formulario, y Bancard caído');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso, avisos } = armar('produccion');
    const P = await H.montarEmpresa(db, { email: 'p@negocio.test', nombre: 'Peluquería Pía' });
    const r = await F.iniciarPago(d, { empresa: P.empresaId, usuario: P.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.rechazar(r.operacion, '51', 'NO APROBADA-INSUF.DE FONDOS');
    ok('Bancard confirma un rechazo: 200', (await F.recibirConfirmacion(d, cuerpo(falso, r.operacion))).http, 200);
    ok('la operación queda rechazada, con el texto de Bancard; el plan no cambia',
      [(await opDe(r.operacion)).estado, (await opDe(r.operacion)).respuesta.response_description, (await sus(P)).estado],
      ['rechazada', 'NO APROBADA-INSUF.DE FONDOS', 'prueba']);
    falso.pagar(r.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, r.operacion));
    ok('si después paga en el mismo formulario y Bancard lo confirma: pagada', [(await opDe(r.operacion)).estado, (await sus(P)).estado], ['pagada', 'activa']);
    ok('avisos: el rechazo (para la parte del débito) y la aprobación', avisos.map((a) => a.aprobada), [false, true]);

    const Q = await H.montarEmpresa(db, { email: 'q@negocio.test', nombre: 'Quiosco Q' });
    falso.programar('/single_buy', { json: { status: 'error', messages: [{ key: 'InvalidPublicKeyError', level: 'error', dsc: 'Invalid Public key' }] } });
    const malo = await F.iniciarPago(d, { empresa: Q.empresaId, usuario: Q.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    const opMala = (await J('select * from public.bancard_operaciones where empresa_id = $1', [Q.empresaId]));
    ok('single_buy que falla: error de Bancard, operación vencida y sin process_id',
      [malo.estado, malo.clave, opMala.estado, opMala.process_id, opMala.motivo], ['error_bancard', 'InvalidPublicKeyError', 'vencida', null, 'InvalidPublicKeyError']);
    falso.programar('/single_buy', 'red');
    const sinRed = await F.iniciarPago(d, { empresa: Q.empresaId, usuario: Q.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    ok('sin red: tampoco queda nada vivo', [sinRed.estado, sinRed.clave,
      (await J(`select count(*)::int n from public.bancard_operaciones where empresa_id = $1 and estado in ('creada','en_3ds','incierta')`, [Q.empresaId])).n],
    ['error_bancard', 'red', 0]);
    const reintento = await F.iniciarPago(d, { empresa: Q.empresaId, usuario: Q.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    ok('y al volver a probar se abre normal', reintento.estado, 'listo');

    // Bancard no contesta la consulta: nada cambia.
    falso.programar('/single_buy/confirmations', { status: 403, texto: '<html>Bloqueado</html>' });
    ok('consulta bloqueada (403 en HTML): «incierta», nada cambia',
      [await F.resolverOperacion(d, reintento.operacion), (await opDe(reintento.operacion)).estado], ['incierta', 'creada']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Lo que quedó a medias: la conciliación');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('produccion');
    const R = await H.montarEmpresa(db, { email: 'r@negocio.test', nombre: 'Rotisería R' });
    const r = await F.iniciarPago(d, { empresa: R.empresaId, usuario: R.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    const hace = (min) => db.query(`update public.bancard_operaciones set created_at = now() - make_interval(mins => $2) where id = $1`, [r.operacion, min]);

    await hace(5);
    let res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('con 5 minutos todavía no se mira', [res.revisadas, (await opDe(r.operacion)).estado], [0, 'creada']);

    await hace(12);
    falso.pedidos.length = 0;
    res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('a los 12 minutos: solo se consulta (un QR se puede estar pagando)',
      [res.revisadas, res.siguen, rutas(falso), (await opDe(r.operacion)).estado], [1, 1, ['/single_buy/confirmations'], 'creada']);

    await hace(31);
    falso.pedidos.length = 0;
    res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('a los 31 minutos sin pago: consulta + reversa, y cerrada',
      [res.vencidas, rutas(falso), (await opDe(r.operacion)).estado], [1, ['/single_buy/confirmations', '/single_buy/rollback'], 'vencida']);

    // Un QR que se pagó después de la reversa: la plata entró, el plan se activa.
    falso.compras.get(r.operacion).estado = 'pagada';
    ok('un pago que entra tarde y Bancard confirma: se activa igual', [(await F.recibirConfirmacion(d, cuerpo(falso, r.operacion))).http,
      (await opDe(r.operacion)).estado, (await sus(R)).estado, (await opDe(r.operacion)).revisar],
    [200, 'pagada', 'activa', 'Pago que entró tarde, sobre una operación ya vencida']);

    // La confirmación se perdió: la conciliación la encuentra.
    const S2 = await H.montarEmpresa(db, { email: 's@negocio.test', nombre: 'Sastrería S' });
    const r2 = await F.iniciarPago(d, { empresa: S2.empresaId, usuario: S2.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pagar(r2.operacion);
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '11 minutes' where id = $1`, [r2.operacion]);
    res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('un pago cuya confirmación nunca llegó: la conciliación lo activa', [res.pagadas, (await sus(S2)).estado], [1, 'activa']);

    // Una viva del otro entorno, vieja: se cierra sin llamar a Bancard.
    const st = armar('staging');
    const S3 = await H.montarEmpresa(db, { email: 's3@negocio.test', nombre: 'Staging viejo' });
    const r3 = await F.iniciarPago(st.d, { empresa: S3.empresaId, usuario: S3.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '61 minutes' where id = $1`, [r3.operacion]);
    falso.pedidos.length = 0;
    res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('una operación vieja de staging en el servidor de producción: se cierra sin llamar a Bancard',
      [res.deOtroEntorno, (await opDe(r3.operacion)).estado, falso.pedidos.length], [1, 'vencida', 0]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Revertir un pago aprobado (el rollback de la lista de tests)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('produccion');
    const T = await H.montarEmpresa(db, { email: 't@negocio.test', nombre: 'Tienda T' });
    const antes = await sus(T);
    const r = await F.iniciarPago(d, { empresa: T.empresaId, usuario: T.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pagar(r.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, r.operacion));

    const noJefe = await F.revertirPago(d, { operacion: r.operacion, actor: T.uid, motivo: 'quiero', sinBancard: false });
    ok('solo la administración revierte (lo dice la base)', [noJefe.ok, noJefe.motivo], [false, 'base']);
    ok('y sin pedirle nada a Bancard', rutas(falso).includes('/single_buy/rollback'), false);

    const rv = await F.revertirPago(d, { operacion: r.operacion, actor: jefe.uid, motivo: 'prueba de certificación', sinBancard: false });
    ok('la reversa: Bancard la hace (RollbackSuccessful) y Orden deshace el plan', [rv.ok, rv.bancard, rv.datos.estado], [true, 'revertida', 'prueba']);
    const s = await sus(T);
    ok('la cuenta vuelve a como estaba (en prueba, misma fecha)', [s.plan, s.estado, s.fin === antes.fin], ['pro', 'prueba', true]);
    ok('el ingreso queda anulado y la operación revertida',
      [(await ingresos(`Bancard ${r.operacion}`))[0].estado, (await opDe(r.operacion)).estado], ['anulado', 'revertida']);
    ok('el pedido a Bancard fue el rollback del manual (token con "0.00")',
      falso.pedidos.filter((p) => p.ruta === '/single_buy/rollback').map((p) => [p.cuerpo.operation.shop_process_id, p.cuerpo.operation.token]),
      [[String(r.operacion), md5(CLAVE + r.operacion + 'rollback' + '0.00')]]);

    // Bancard avisa la reversa a la URL de confirmación (token con "0.00"): se anota.
    ok('el aviso de reversa que manda Bancard: 200 y nada más', (await F.recibirConfirmacion(d, JSON.stringify(falso.confirmacionDeReversa(r.operacion)))).http, 200);
    ok('una aprobación que llega sobre una revertida no reactiva nada',
      [(await F.recibirConfirmacion(d, cuerpo(falso, r.operacion))).http, (await sus(T)).estado, (await opDe(r.operacion)).estado], [200, 'prueba', 'revertida']);

    // Cuponada: Bancard ya no revierte. La base no se toca.
    const U = await H.montarEmpresa(db, { email: 'u@negocio.test', nombre: 'Uno Más' });
    const ru = await F.iniciarPago(d, { empresa: U.empresaId, usuario: U.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pagar(ru.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, ru.operacion));
    falso.cuponar(ru.operacion);
    const cup = await F.revertirPago(d, { operacion: ru.operacion, actor: jefe.uid, motivo: 'error', sinBancard: false });
    ok('cuponada (TransactionAlreadyConfirmed): no se toca la base', [cup.ok, cup.motivo, (await opDe(ru.operacion)).estado, (await sus(U)).estado],
      [false, 'cuponada', 'pagada', 'activa']);
    falso.pedidos.length = 0;
    const sb = await F.revertirPago(d, { operacion: ru.operacion, actor: jefe.uid, motivo: 'anulado por el portal', sinBancard: true });
    ok('«ya lo anulé por el portal»: sin pedirle nada a Bancard, Orden deshace', [sb.ok, sb.bancard, falso.pedidos.length, (await opDe(ru.operacion)).estado],
      [true, 'sin_bancard', 0, 'revertida']);

    // Un aviso de reversa sobre un pago que sigue pagado: queda para revisar.
    const V = await H.montarEmpresa(db, { email: 'v@negocio.test', nombre: 'Verdulería V' });
    const rv2 = await F.iniciarPago(d, { empresa: V.empresaId, usuario: V.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pagar(rv2.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, rv2.operacion));
    await F.recibirConfirmacion(d, JSON.stringify(falso.confirmacionDeReversa(rv2.operacion)));
    ok('Bancard avisa una reversa de un pago que Orden tiene pagado: no revierte sola, queda para revisar',
      [(await opDe(rv2.operacion)).estado, (await opDe(rv2.operacion)).revisar, (await sus(V)).estado], ['pagada', 'Bancard avisó una reversa', 'activa']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Staging: plata de mentira');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('staging');
    const W = await H.montarEmpresa(db, { email: 'w@bancard.test', nombre: 'Prueba para Bancard' });
    await referir(W);
    const r = await F.iniciarPago(d, { empresa: W.empresaId, usuario: W.uid, tipo: 'plan', plan: 'negocio', periodo: 'mensual', personas: 4 });
    ok('staging usa el host de staging', falso.pedidos[0].url.startsWith('https://vpos.infonet.com.py:8888/vpos/api/0.3/'), true);
    falso.pagar(r.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, r.operacion));
    ok('activa el plan de la cuenta de prueba, sin ingreso ni comisión',
      [(await sus(W)).estado, (await sus(W)).tope_vendedores, (await ingresos(`Bancard ${r.operacion}`)).length,
        (await J('select count(*)::int n from public.comisiones where empresa_id = $1', [W.empresaId])).n],
      ['activa', 3, 0, 0]);
    ok('su renglón es «bancard_prueba»', (await registroDe(W)).map((x) => x.accion), ['bancard_prueba']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Sin claves, con la base caída, y el tope de 25 segundos');
  // ═══════════════════════════════════════════════════════════
  {
    ok('sin configurar: cuerpo vacío → 200, lo demás → 503',
      [F.recibirSinConfigurar(''), F.recibirSinConfigurar('{}'), F.recibirSinConfigurar('{"operation":{"shop_process_id":"1"}}')].map((x) => x.http),
      [200, 200, 503]);
    ok('esConfirmacionVacia', [F.esConfirmacionVacia(''), F.esConfirmacionVacia('[]'), F.esConfirmacionVacia('{"operation":{}}'), F.esConfirmacionVacia('x')],
      [true, true, false, false]);

    const { d, falso } = armar('produccion');
    const X = await H.montarEmpresa(db, { email: 'x@negocio.test', nombre: 'Equis' });
    const r = await F.iniciarPago(d, { empresa: X.empresaId, usuario: X.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pagar(r.operacion);
    const caida = { ...d, bd: { rpc: async () => ({ data: null, error: { message: 'connection refused', code: '' } }) } };
    ok('la base no contesta: 503 (Bancard puede reintentar; la conciliación igual la resuelve)',
      (await F.recibirConfirmacion(caida, cuerpo(falso, r.operacion))).http, 503);
    const colgada = { ...d, bd: { rpc: () => new Promise(() => undefined) } };
    const t0 = Date.now();
    ok('la base se cuelga: se contesta 503 antes del tope', [(await F.recibirConfirmacion(colgada, cuerpo(falso, r.operacion), { topeMs: 80 })).http, Date.now() - t0 < 2000],
      [503, true]);
    ok('y la operación sigue viva para la conciliación', (await opDe(r.operacion)).estado, 'creada');
    const enLaBase = await F.iniciarPago(caida, { empresa: X.empresaId, usuario: X.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    ok('iniciar con la base caída: error de la base, sin llamar a Bancard', [enLaBase.estado, falso.pedidos.filter((p) => p.ruta === '/single_buy').length], ['error_base', 1]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('11 · Probar conexión (/admin)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('staging');
    ok('Bancard contesta «no existe el pedido 1»: bien', (await F.probarConexion(d)).resultado, 'bien');
    falso.programar('/single_buy/confirmations', { json: { status: 'error', messages: [{ key: 'InvalidTokenError' }] } });
    ok('firma rechazada: claves', (await F.probarConexion(d)).resultado, 'claves');
    falso.programar('/single_buy/confirmations', { status: 403, texto: '<!doctype html><title>Attention Required</title>' });
    ok('una página en vez de datos: bloqueo', (await F.probarConexion(d)).resultado, 'bloqueo');
    falso.programar('/single_buy/confirmations', 'red');
    ok('sin red: red', (await F.probarConexion(d)).resultado, 'red');
  }

  // ═══════════════════════════════════════════════════════════
  grupo('12 · Los colores del formulario');
  // ═══════════════════════════════════════════════════════════
  {
    const est = E.estilosBancard({ verde: '#48dc82', superficie: '#222321', texto: 'no-es-color' });
    ok('exactamente las 18 claves de color que acepta Bancard', Object.keys(est).sort(), [...E.CLAVES_DE_COLOR].sort());
    ok('todas en #rrggbb', Object.values(est).every((v) => /^#[0-9a-f]{6}$/.test(v)), true);
    ok('el botón y la pestaña, con el verde de Orden; lo que no es un color cae al de respaldo',
      [est['button-background-color'], est['form-background-color'], est['input-text-color']], ['#48dc82', '#222321', E.PALETA_CLARA.texto]);
    ok('las variables del tema («72 220 130») pasan a #rrggbb',
      [E.colorDeVariable(' 72 220 130 ', '#000000'), E.colorDeVariable('300 1 1', '#000000'), E.colorDeVariable('', '#123456')],
      ['#48dc82', '#000000', '#123456']);
    ok('las opciones de lista no se mandan (quedan las del portal)',
      ['input-border-radius', 'form-font-size', 'form-font-family', 'floating-placeholder'].filter((k) => k in est), []);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('13 · Nada secreto en los pedidos, los eventos ni el registro');
  // ═══════════════════════════════════════════════════════════
  {
    const espiado = [];
    const originales = {};
    for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
      originales[m] = console[m];
      console[m] = (...a) => { espiado.push(a.map(String).join(' ')); };
    }
    const { d, falso, registro } = armar('produccion');
    let r;
    try {
      const Y = await H.montarEmpresa(db, { email: 'y@negocio.test', nombre: 'Ye' });
      r = await F.iniciarPago(d, { empresa: Y.empresaId, usuario: Y.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
      falso.pagar(r.operacion);
      await F.recibirConfirmacion(d, cuerpo(falso, r.operacion));
      await F.recibirConfirmacion(d, JSON.stringify({ operation: { ...falso.confirmacionDe(r.operacion).operation, token: 'b'.repeat(32) } }));
      await F.resolverOperacion(d, r.operacion);
      await F.revertirPago(d, { operacion: r.operacion, actor: jefe.uid, motivo: 'prueba', sinBancard: false });
    } finally {
      for (const m of Object.keys(originales)) console[m] = originales[m];
    }
    ok('ningún pedido a Bancard lleva test_client', falso.todoLoPedido().includes('test_client'), false);
    ok('ni la clave privada en plano', falso.todoLoPedido().includes(CLAVE), false);

    const guardado = JSON.stringify((await db.query('select detalle, clave from public.bancard_eventos')).rows);
    const tokensDePedidos = falso.pedidos.map((p) => p.cuerpo?.operation?.token).filter(Boolean);
    const confToken = falso.confirmacionDe(r.operacion).operation.token;
    ok('los eventos guardados no tienen la clave, ni tokens, ni la IP de la persona, ni el process_id',
      [guardado.includes(CLAVE), tokensDePedidos.some((t) => guardado.includes(t)), guardado.includes(confToken),
        guardado.includes('190.128.0.1'), guardado.includes(r.processId), guardado.includes('"token"')],
      [false, false, false, false, false, false]);
    const respuesta = JSON.stringify((await opDe(r.operacion)).respuesta);
    ok('la respuesta guardada en la operación, saneada', [respuesta.includes('190.128.0.1'), respuesta.includes(confToken)], [false, false]);
    const todo = espiado.join('\n') + registro.join('\n');
    ok('la consola y el registro del servidor: sin la clave, sin tokens, sin process_id',
      [todo.includes(CLAVE), tokensDePedidos.some((t) => todo.includes(t)), todo.includes(r.processId)], [false, false, false]);
  }

  // ═══════════════════════════════════════════════════════════
  // LA TARJETA GUARDADA Y EL COBRO AUTOMÁTICO (parte 3)
  // ═══════════════════════════════════════════════════════════
  //
  //   1. UNA TARJETA SE DA POR GUARDADA CUANDO BANCARD LA LISTA, no cuando el
  //      formulario dice «éxito»; y de ella queda solo marca, últimos cuatro
  //      y tipo: ni el número, ni el vencimiento, ni el alias.
  //   2. EL COBRO CON TOKEN: aprobado, rechazado, 3D Secure, alias vencido
  //      (un reintento), Bancard que no contesta (incierta: NUNCA un segundo
  //      charge; la conciliación lo resuelve), Bancard que no acepta el
  //      pedido (nada se cobró), la tarjeta que ya no está.
  //   3. LA TAREA: cobra el día anterior al vencimiento; rechazo → reintentos
  //      +1 y +4 y después vence como cualquier cuenta; dos corridas a la vez
  //      cobran UNA vez; a quien quitó la tarjeta no se le cobra; lo que no
  //      se puede cotizar se pausa y se avisa; la tarjeta por vencer se mira
  //      en vivo y se avisa.
  //   4. QUITAR RIGE EN EL ACTO aunque Bancard no conteste.
  //   5. EL ALIAS NO QUEDA EN NINGÚN LADO.

  const simple = (ruta) => ruta.replace(/^\/users\/[0-9]+\/cards$/, 'users_cards');
  const tarjetaDe = (id) => J('select * from public.bancard_tarjetas where id = $1', [id]);
  const cuentaDe = (c) => J('select * from public.bancard_cuentas where empresa_id = $1', [c.empresaId]);
  const pagadorDe = (c) => J(`select id from public.bancard_pagadores where empresa_id = $1 and entorno = 'produccion'`, [c.empresaId]);
  const charges = (falso) => falso.pedidos.filter((p) => p.ruta === '/charge').length;
  /** El plan vence dentro de N días (al mediodía, para que la hora de la prueba no importe). */
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
  const apagar = (c) => db.query('update public.bancard_cuentas set debito_activo = false where empresa_id = $1', [c.empresaId]);
  const consentimiento = 'Autorizo a Orden a cobrar de esta tarjeta el precio de mi plan en cada renovación, hasta que la quite.';
  /** El catastro entero: Orden lo pide, la persona lo termina en Bancard, Orden lo verifica. */
  async function guardarTarjeta(d, falso, c, datos = {}) {
    const r = await F.iniciarCatastro(d, { empresa: c.empresaId, usuario: c.uid, telefono: '0981123456', consentimiento });
    if (r.estado !== 'listo') throw new Error(`no se pudo pedir el catastro: ${JSON.stringify(r)}`);
    falso.completarCatastro(r.processId, datos);
    const v = await F.verificarTarjeta(d, { tarjeta: r.tarjeta, empresa: c.empresaId });
    if (!v.guardada) throw new Error(`no se guardó la tarjeta: ${JSON.stringify(v)}`);
    return r.tarjeta;
  }
  /** Una cuenta que ya pagó un Pro mensual por el formulario (así está activa). */
  async function cuentaActiva(d, falso, email, nombre) {
    const c = await H.montarEmpresa(db, { email, nombre });
    const r = await F.iniciarPago(d, { empresa: c.empresaId, usuario: c.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pagar(r.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, r.operacion));
    return c;
  }

  // ═══════════════════════════════════════════════════════════
  grupo('14 · Guardar la tarjeta: Bancard decide, no el formulario');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('produccion');
    const C = await H.montarEmpresa(db, { email: 'cat@negocio.test', nombre: 'Catastro SA' });

    const sinTel = await F.iniciarCatastro(d, { empresa: C.empresaId, usuario: C.uid, telefono: null, consentimiento });
    ok('sin teléfono en la cuenta: Bancard lo exige, la pantalla lo pide', [sinTel.estado, /tel/i.test(sinTel.mensaje)], ['falta_telefono', true]);
    ok('y no se le pidió nada a Bancard', falso.pedidos.length, 0);

    const r = await F.iniciarCatastro(d, { empresa: C.empresaId, usuario: C.uid, telefono: '0981 123 456', consentimiento });
    const pagador = Number((await pagadorDe(C)).id);
    ok('con teléfono: Bancard abre el catastro', [r.estado, typeof r.processId, r.entorno, Number.isInteger(r.tarjeta)], ['listo', 'string', 'produccion', true]);
    const cn = falso.pedidos.find((p) => p.ruta === '/cards/new');
    ok('cards/new: el card_id y el user_id que puso Orden, teléfono y correo como texto, y la vuelta a /plan/tarjeta/<id>',
      [cn.cuerpo.operation.card_id, cn.cuerpo.operation.user_id, typeof cn.cuerpo.operation.user_cell_phone, cn.cuerpo.operation.user_mail, cn.cuerpo.operation.return_url],
      [r.tarjeta, pagador, 'string', 'cat@negocio.test', `${SITIO}/plan/tarjeta/${r.tarjeta}`]);
    ok('con el md5 del manual (card_id + user_id + request_new_card)', cn.cuerpo.operation.token, md5(CLAVE + r.tarjeta + pagador + 'request_new_card'));
    ok('el user_id arranca en 5001 y el card_id en 101 (enteros de 19)', [pagador >= 5001, r.tarjeta >= 101], [true, true]);
    ok('la tarjeta queda pendiente, y el consentimiento guardado con quién, cuándo y qué texto',
      [(await tarjetaDe(r.tarjeta)).estado, (await cuentaDe(C)).aceptado_por, (await cuentaDe(C)).aceptado_texto, (await cuentaDe(C)).aceptado_at !== null],
      ['pendiente', C.uid, consentimiento, true]);
    ok('el teléfono quedó en la ficha de la cuenta', (await J('select telefono from public.ficha_cliente where empresa_id = $1', [C.empresaId])).telefono, '0981 123 456');

    // El formulario dijo «add_new_card_success», pero Bancard no la tiene.
    falso.pedidos.length = 0;
    const v0 = await F.verificarTarjeta(d, { tarjeta: r.tarjeta, empresa: C.empresaId });
    ok('el formulario dijo «éxito» pero Bancard no la lista: NO se guarda, queda fallida',
      [v0.guardada, v0.motivo, (await tarjetaDe(r.tarjeta)).estado, (await cuentaDe(C)).tarjeta_id], [false, 'no_esta', 'fallida', null]);
    const uc = falso.pedidos.find((p) => /^\/users\/[0-9]+\/cards$/.test(p.ruta));
    ok('se le pidió la lista a Bancard (users_cards, POST), con el md5 del manual',
      [uc.method, uc.cuerpo.operation.token], ['POST', md5(CLAVE + pagador + 'request_user_cards')]);

    // Esta vez la persona termina el formulario y Bancard la tiene.
    const r2 = await F.iniciarCatastro(d, { empresa: C.empresaId, usuario: C.uid, telefono: null, consentimiento });
    ok('la segunda vez no hace falta el teléfono: ya quedó en la ficha', r2.estado, 'listo');
    falso.completarCatastro(r2.processId, { marca: 'MasterCard', enmascarado: '5400********0014', vencimiento: '08/30', tipo: 'credit' });
    const v = await F.verificarTarjeta(d, { tarjeta: r2.tarjeta, empresa: C.empresaId });
    ok('Bancard la lista: guardada, con marca y últimos cuatro', [v.guardada, v.marca, v.ultimos4, v.ya], [true, 'MasterCard', '0014', false]);
    const fila = await tarjetaDe(r2.tarjeta);
    ok('en la base: activa, es la del débito, débito al día', [fila.estado, fila.marca, fila.ultimos4, fila.tipo, Number((await cuentaDe(C)).tarjeta_id), (await cuentaDe(C)).debito_activo, (await cuentaDe(C)).debito_estado],
      ['activa', 'MasterCard', '0014', 'credit', r2.tarjeta, true, 'al_dia']);
    const todo = JSON.stringify((await db.query('select * from public.bancard_tarjetas')).rows) + JSON.stringify((await db.query('select * from public.bancard_eventos')).rows);
    ok('y en ningún lado quedó el enmascarado entero, el vencimiento ni un alias', [todo.includes('5400****'), todo.includes('08/30'), /alias/.test(todo)], [false, false, false]);
    ok('verificar de nuevo: ya estaba (idempotente)', (await F.verificarTarjeta(d, { tarjeta: r2.tarjeta })).ya, true);
    ok('otra cuenta no puede verificarla', (await F.verificarTarjeta(d, { tarjeta: r2.tarjeta, empresa: A.empresaId })).motivo, 'ajena');
    ok('una que no existe', (await F.verificarTarjeta(d, { tarjeta: 999999 })).motivo, 'desconocida');

    // Cambiar de tarjeta: la nueva queda, la anterior se borra en Bancard.
    const r3 = await F.iniciarCatastro(d, { empresa: C.empresaId, usuario: C.uid, telefono: null, consentimiento });
    falso.completarCatastro(r3.processId, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    falso.pedidos.length = 0;
    const v3 = await F.verificarTarjeta(d, { tarjeta: r3.tarjeta, empresa: C.empresaId });
    ok('cambiar de tarjeta: la nueva queda activa y es la del débito; la anterior, quitada',
      [v3.guardada, v3.ultimos4, (await tarjetaDe(r3.tarjeta)).estado, (await tarjetaDe(r2.tarjeta)).estado, Number((await cuentaDe(C)).tarjeta_id)],
      [true, '0016', 'activa', 'quitada', r3.tarjeta]);
    ok('y la anterior se borró en Bancard con el alias de la MISMA lista (un DELETE con el md5 del manual)',
      [rutas(falso).map(simple), falso.pedidos.filter((p) => p.method === 'DELETE').length, falso.tarjetasDe(pagador).map((t) => t.cardId)],
      [['users_cards', 'users_cards'], 1, [r3.tarjeta]]);
    const del = falso.pedidos.find((p) => p.method === 'DELETE');
    ok('el DELETE lleva el JSON en el cuerpo y el token delete_card + user_id + alias',
      del.cuerpo.operation.token, md5(CLAVE + 'delete_card' + pagador + del.cuerpo.operation.alias_token));

    // Bancard no abre el catastro.
    falso.programar('/cards/new', { json: { status: 'error', messages: [{ key: 'InvalidPublicKeyError', level: 'error', dsc: 'Invalid Public key' }] } });
    const malo = await F.iniciarCatastro(d, { empresa: C.empresaId, usuario: C.uid, telefono: null, consentimiento });
    const ultima = (await J('select id, estado, motivo from public.bancard_tarjetas where empresa_id = $1 order by id desc limit 1', [C.empresaId]));
    ok('si Bancard no abre el catastro: error con su clave, y la tarjeta queda fallida', [malo.estado, malo.clave, ultima.estado, ultima.motivo], ['error_bancard', 'InvalidPublicKeyError', 'fallida', 'InvalidPublicKeyError']);
    ok('la activa sigue siendo la Visa', Number((await cuentaDe(C)).tarjeta_id), r3.tarjeta);

    // Bancard no contesta la verificación: no se da por fallida; la conciliación vuelve.
    const D2 = await H.montarEmpresa(db, { email: 'cat2@negocio.test', nombre: 'Catastro Dos' });
    const r4 = await F.iniciarCatastro(d, { empresa: D2.empresaId, usuario: D2.uid, telefono: '0981123456', consentimiento });
    falso.programar(/^\/users\/[0-9]+\/cards$/, 'red');
    const v4 = await F.verificarTarjeta(d, { tarjeta: r4.tarjeta, empresa: D2.empresaId });
    ok('Bancard no contesta la verificación: no se sabe todavía (sigue pendiente)', [v4.guardada, v4.motivo, (await tarjetaDe(r4.tarjeta)).estado], [false, 'bancard', 'pendiente']);
    falso.completarCatastro(r4.processId, { marca: 'Visa', enmascarado: '4000********0016' });
    let res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('recién pedida, la conciliación todavía no la mira', [res.tarjetasVerificadas, (await tarjetaDe(r4.tarjeta)).estado], [0, 'pendiente']);
    await db.query(`update public.bancard_tarjetas set created_at = now() - interval '31 minutes' where id = $1`, [r4.tarjeta]);
    res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('a los 31 minutos la conciliación le pregunta a Bancard y la activa', [res.tarjetasVerificadas, res.tarjetasGuardadas, (await tarjetaDe(r4.tarjeta)).estado], [1, 1, 'activa']);
    const r5 = await F.iniciarCatastro(d, { empresa: D2.empresaId, usuario: D2.uid, telefono: null, consentimiento });
    await db.query(`update public.bancard_tarjetas set created_at = now() - interval '31 minutes' where id = $1`, [r5.tarjeta]);
    res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('un catastro abandonado de más de 30 minutos: fallida', [res.tarjetasVerificadas, res.tarjetasGuardadas, (await tarjetaDe(r5.tarjeta)).estado], [1, 0, 'fallida']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('15 · Cobrar con la tarjeta guardada (la persona delante)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso, avisos } = armar('produccion');
    const P = await H.montarEmpresa(db, { email: 'tok@negocio.test', nombre: 'Token SRL' });
    const pedido = { empresa: P.empresaId, usuario: P.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null };
    ok('sin tarjeta guardada no hay cobro con token (lo dice la base)',
      [(await F.cobrarConTarjeta(d, pedido)).estado, /tarjeta guardada/.test((await F.cobrarConTarjeta(d, pedido)).mensaje)], ['error_base', true]);
    const tarjeta = await guardarTarjeta(d, falso, P, { marca: 'Visa', enmascarado: '4000********0016' });
    const pagador = Number((await pagadorDe(P)).id);

    falso.pedidos.length = 0;
    const c1 = await F.cobrarConTarjeta(d, pedido);
    ok('cobro aprobado en el mismo pedido: pagada, y el plan activo por Bancard',
      [c1.estado, c1.descripcion, (await sus(P)).estado, (await sus(P)).proveedor_pago, (await sus(P)).importe], ['pagada', 'Transaccion aprobada', 'activa', 'bancard', 190000]);
    ok('pedidos: la lista de tarjetas (alias recién pedido) y el charge', rutas(falso).map(simple), ['users_cards', '/charge']);
    const ch = falso.pedidos.find((p) => p.ruta === '/charge');
    ok('charge: importe "190000.00", una cuota, PYG, alias de esa lista, la vuelta a su pantalla y confirmation.process_id',
      [ch.cuerpo.operation.shop_process_id, ch.cuerpo.operation.amount, ch.cuerpo.operation.number_of_payments, ch.cuerpo.operation.currency,
        typeof ch.cuerpo.operation.alias_token, ch.cuerpo.operation.return_url, ch.cuerpo.operation.extra_response_attributes, ch.cuerpo.operation.description],
      [c1.operacion, '190000.00', 1, 'PYG', 'string', `${SITIO}/plan/pago/${c1.operacion}`, ['confirmation.process_id'], 'Orden Pro']);
    ok('con el md5 del manual (shop_process_id + charge + amount + currency + alias)',
      ch.cuerpo.operation.token, md5(CLAVE + c1.operacion + 'charge' + '190000.00' + 'PYG' + ch.cuerpo.operation.alias_token));
    const op1 = await opDe(c1.operacion);
    ok('la operación: pagada por «charge», con tarjeta, origen usuario; el aviso lleva la tarjeta para el comprobante',
      [op1.fuente, op1.medio, op1.origen, Number(op1.tarjeta_id), avisos[0]?.aprobada, avisos[0]?.tarjeta], ['charge', 'token', 'usuario', tarjeta, true, { marca: 'Visa', ultimos4: '0016' }]);
    const fin1 = (await sus(P)).fin;
    ok('la confirmación que Bancard manda después por la URL: 200 y nada cambia (ya estaba pagada)',
      [(await F.recibirConfirmacion(d, cuerpo(falso, c1.operacion))).http, (await sus(P)).fin === fin1, avisos.length, (await ingresos(`Bancard ${c1.operacion}`)).length], [200, true, 1, 1]);

    // Rechazado por el banco.
    falso.proximoCobro({ tipo: 'rechazar', codigo: '51', descripcion: 'NO APROBADA-INSUF.DE FONDOS' });
    const c2 = await F.cobrarConTarjeta(d, pedido);
    ok('rechazado por el banco: rechazada con el texto de Bancard y su clase; el plan no cambia',
      [c2.estado, c2.descripcion, c2.clase, (await opDe(c2.operacion)).estado, (await sus(P)).fin === fin1], ['rechazada', 'NO APROBADA-INSUF.DE FONDOS', 'fondos', 'rechazada', true]);
    ok('el aviso del rechazo dice que fue con la persona delante (no se manda push)', [avisos.at(-1).aprobada, avisos.at(-1).origen], [false, 'usuario']);
    ok('la cuenta guarda el último error para mostrarlo', (await cuentaDe(P)).ultimo_error, 'NO APROBADA-INSUF.DE FONDOS');

    // 3D Secure.
    falso.proximoCobro({ tipo: '3ds' });
    const c3 = await F.cobrarConTarjeta(d, pedido);
    ok('el banco pide 3D Secure: en_3ds con el process_id para abrir el formulario, y la operación lo guarda',
      [c3.estado, typeof c3.processId, (await opDe(c3.operacion)).estado, (await opDe(c3.operacion)).process_id === c3.processId], ['en_3ds', 'string', 'en_3ds', true]);
    ok('mientras espera a la persona, otro intento recibe «en curso» (se consulta, no se vence)', (await F.cobrarConTarjeta(d, pedido)).estado, 'en_curso');
    falso.pagar(c3.operacion);
    ok('la persona confirma en el banco y Bancard manda la confirmación: pagada',
      [(await F.recibirConfirmacion(d, cuerpo(falso, c3.operacion))).http, (await opDe(c3.operacion)).estado, (await opDe(c3.operacion)).fuente], [200, 'pagada', 'confirmacion']);

    // Alias vencido en el medio: se pide la lista de nuevo y se reintenta una vez.
    falso.programar('/charge', { json: { status: 'error', messages: [{ key: 'CardAliasTokenExpiredError', level: 'error', dsc: 'The card alias token has expired.' }] } });
    falso.pedidos.length = 0;
    const c4 = await F.cobrarConTarjeta(d, pedido);
    ok('alias vencido: se pide la lista de nuevo y se reintenta UNA vez', [c4.estado, rutas(falso).map(simple)], ['pagada', ['users_cards', '/charge', 'users_cards', '/charge']]);

    // Bancard cobró pero la respuesta se cortó: incierta, y NUNCA otro charge.
    falso.programar('/charge', async (pedido, init) => {
      await falso.transporte(pedido.url, init);
      return new Promise(() => undefined);
    });
    falso.pedidos.length = 0;
    const c5 = await F.cobrarConTarjeta(d, pedido, { esperaMs: 150 });
    ok('Bancard no contesta el cobro a tiempo: incierta', [c5.estado, (await opDe(c5.operacion)).estado], ['incierta', 'incierta']);
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '11 minutes' where id = $1`, [c5.operacion]);
    const antesDeConciliar = charges(falso);
    const res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('la conciliación consulta y Bancard dice que sí se cobró: se activa, sin un segundo charge',
      [res.pagadas, (await opDe(c5.operacion)).estado, (await opDe(c5.operacion)).fuente, charges(falso) - antesDeConciliar], [1, 'pagada', 'consulta', 0]);

    // Bancard no acepta el pedido (no es el banco rechazando).
    falso.programar('/charge', { json: { status: 'error', messages: [{ key: 'CardBlockedError', level: 'error', dsc: 'The card for the user is blocked.' }] } });
    const c7 = await F.cobrarConTarjeta(d, pedido);
    ok('CardBlockedError: nada se cobró, la operación vence con esa clave y el débito se pausa',
      [c7.estado, c7.clave, (await opDe(c7.operacion)).estado, (await opDe(c7.operacion)).motivo, (await cuentaDe(P)).debito_estado], ['vencida', 'CardBlockedError', 'vencida', 'CardBlockedError', 'pausado']);

    // La tarjeta ya no está en Bancard.
    falso.programar(/^\/users\/[0-9]+\/cards$/, { json: { status: 'success', cards: [] } });
    const c8 = await F.cobrarConTarjeta(d, pedido);
    ok('la tarjeta ya no está en Bancard: se da por quitada (débito apagado) y la operación vence sin cobrar',
      [c8.estado, c8.clave, (await tarjetaDe(tarjeta)).estado, (await cuentaDe(P)).debito_activo, (await cuentaDe(P)).tarjeta_id], ['vencida', 'CardNotFoundError', 'quitada', false, null]);
    ok('y ya no se puede cobrar con token', (await F.cobrarConTarjeta(d, pedido)).estado, 'error_base');
    ok('los pedidos nombran al pagador de Orden, nunca el número de la tarjeta', falso.todoLoPedido().includes('4000********0016'), false);
    void pagador;
  }

  // ═══════════════════════════════════════════════════════════
  grupo('16 · La tarea de cobros: el día anterior, los reintentos, dos corridas, la tarjeta quitada');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso, avisos } = armar('produccion');
    const correr = () => F.correrCobros(d, { hastaMs: Date.now() + 120_000 }, { esperaMs: 2_000 });

    // Cobro que entra.
    const T = await cuentaActiva(d, falso, 't1@cobros.test', 'Cobro que entra');
    await guardarTarjeta(d, falso, T, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    await venceEn(T, 2);
    let res = await correr();
    ok('faltan 2 días: la tarea no toma nada', [res.tomados, res.pagados, res.tarjetasRevisadas], [0, 0, 0]);

    await pasanDias(T, 1);
    falso.pedidos.length = 0;
    avisos.length = 0;
    res = await correr();
    ok('el día anterior al vencimiento: toma el cobro y entra', [res.tomados, res.pagados, rutas(falso).map(simple)], [1, 1, ['users_cards', '/charge']]);
    const opT = await J(`select * from public.bancard_operaciones where empresa_id = $1 and origen = 'automatico' order by id desc limit 1`, [T.empresaId]);
    ok('la operación: automática, con token, pagada por «charge», sin persona',
      [opT.origen, opT.medio, opT.estado, opT.fuente, opT.usuario_id, Number(opT.importe)], ['automatico', 'token', 'pagada', 'charge', null, 190000]);
    ok('el plan se renovó un mes desde su vencimiento (no se le comen días) y el débito volvió a cero',
      [(await sus(T)).efectivo,
        (await J(`select (s.periodo_fin = (o.antes->>'periodo_fin')::timestamptz + interval '1 month') v from public.suscripciones s, public.bancard_operaciones o where s.empresa_id = $1 and o.id = $2`, [T.empresaId, opT.id])).v,
        (await cuentaDe(T)).debito_estado, (await cuentaDe(T)).intentos],
      ['pro', true, 'al_dia', 0]);
    ok('el aviso de plan activo sale con la tarjeta (para el comprobante «lo cobramos de tu Visa»)',
      [avisos.length, avisos[0].aprobada, avisos[0].origen, avisos[0].tarjeta, avisos[0].destinatarios.length], [1, true, 'automatico', { marca: 'Visa', ultimos4: '0016' }, 1]);
    ok('la tarea otra vez el mismo día: nada que cobrar', (await correr()).tomados, 0);

    // Rechazo y reintentos.
    await venceEn(T, 1);
    await db.query('update public.bancard_cuentas set ultimo_intento = ultimo_intento - 30 where empresa_id = $1', [T.empresaId]);
    await db.query(`update public.bancard_operaciones set created_at = created_at - interval '30 days' where empresa_id = $1`, [T.empresaId]);
    falso.pedidos.length = 0;
    avisos.length = 0;
    falso.proximoCobro({ tipo: 'rechazar', codigo: '51', descripcion: 'NO APROBADA-INSUF.DE FONDOS' });
    res = await correr();
    ok('rechazado por fondos el día anterior: reintentando, y se avisa qué hacer (próximo intento = vencimiento + 1)',
      [res.tomados, res.rechazados, (await cuentaDe(T)).debito_estado, avisos.at(-1).aprobada, avisos.at(-1).origen, avisos.at(-1).clase,
        avisos.at(-1).descripcion, typeof avisos.at(-1).proximo_intento, typeof avisos.at(-1).ciclo_fin],
      [1, 1, 'reintentando', false, 'automatico', 'fondos', 'NO APROBADA-INSUF.DE FONDOS', 'string', 'string']);
    await pasanDias(T, 1);
    ok('el día del vencimiento: no se intenta', (await correr()).tomados, 0);
    await pasanDias(T, 1);
    falso.proximoCobro({ tipo: 'rechazar', codigo: '51', descripcion: 'NO APROBADA-INSUF.DE FONDOS' });
    res = await correr();
    ok('vencimiento + 1: segundo intento, rechazado otra vez; la cuenta ya está cortada', [res.tomados, res.rechazados, (await sus(T)).efectivo], [1, 1, 'gratis']);
    await pasanDias(T, 1);
    ok('+2: no', (await correr()).tomados, 0);
    await pasanDias(T, 1);
    ok('+3: no', (await correr()).tomados, 0);
    await pasanDias(T, 1);
    falso.proximoCobro({ tipo: 'rechazar', codigo: '51', descripcion: 'NO APROBADA-INSUF.DE FONDOS' });
    res = await correr();
    ok('+4: tercer y último intento; rechazado → el débito queda pausado y el aviso ya no promete otro intento',
      [res.tomados, res.rechazados, (await cuentaDe(T)).debito_estado, avisos.at(-1).proximo_intento, avisos.at(-1).origen], [1, 1, 'pausado', null, 'automatico']);
    ok('en total tres charges para ese vencimiento, ni uno más', charges(falso), 3);
    await pasanDias(T, 1);
    ok('al agotar los reintentos: nunca más; la cuenta venció como cualquier otra y nada se borró',
      [(await correr()).tomados, (await sus(T)).plan, (await sus(T)).estado, (await sus(T)).efectivo], [0, 'pro', 'activa', 'gratis']);
    await apagar(T);

    // Dos corridas a la vez: un solo cobro.
    const T2 = await cuentaActiva(d, falso, 't2@cobros.test', 'Dos corridas');
    await guardarTarjeta(d, falso, T2, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    await venceEn(T2, 1);
    falso.pedidos.length = 0;
    const [a, b] = await Promise.all([correr(), correr()]);
    ok('la tarea corriendo dos veces a la vez: UN cobro, un charge, un pago', [a.tomados + b.tomados, a.pagados + b.pagados, charges(falso),
      (await J(`select count(*)::int n from public.bancard_operaciones where empresa_id = $1 and origen = 'automatico'`, [T2.empresaId])).n],
    [1, 1, 1, 1]);
    await apagar(T2);

    // Tarjeta quitada: no se cobra.
    const T3 = await cuentaActiva(d, falso, 't3@cobros.test', 'Quitó la tarjeta');
    await guardarTarjeta(d, falso, T3, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    await venceEn(T3, 1);
    const q = await F.quitarTarjeta(d, { empresa: T3.empresaId, usuario: T3.uid });
    ok('quitó la tarjeta (Bancard sano): en el acto, y Bancard también la borró', [q.ok, q.pendienteEnBancard, (await tarjetaDe(q.tarjeta)).estado, (await cuentaDe(T3)).debito_activo], [true, false, 'quitada', false]);
    falso.pedidos.length = 0;
    res = await correr();
    ok('a quien quitó la tarjeta no se le cobra: ni charge ni operación', [res.tomados, charges(falso),
      (await J(`select count(*)::int n from public.bancard_operaciones where empresa_id = $1 and origen = 'automatico'`, [T3.empresaId])).n], [0, 0, 0]);

    // No se puede cotizar: se pausa y se avisa a la administración, sin tumbar la tarea.
    const T4 = await cuentaActiva(d, falso, 't4@cobros.test', 'Sin precio');
    await guardarTarjeta(d, falso, T4, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    await venceEn(T4, 1);
    await db.query(`update public.precios set activo = false where plan = 'pro' and tipo_cuenta = 'emprendedor' and moneda = 'PYG' and periodo = 'mensual'`);
    avisos.length = 0;
    res = await correr();
    ok('un débito que no se puede cotizar: pausado, aviso a la administración, y la tarea sigue',
      [res.pausados, res.tomados, (await cuentaDe(T4)).debito_estado, avisos.at(-1).aviso, avisos.at(-1).empresa_id, /precio/.test(avisos.at(-1).motivo)],
      [1, 0, 'pausado', 'pausada', T4.empresaId, true]);
    await db.query(`update public.precios set activo = true where plan = 'pro' and tipo_cuenta = 'emprendedor' and moneda = 'PYG' and periodo = 'mensual'`);
    await apagar(T4);

    // La tarjeta por vencer se mira en vivo (el vencimiento no se guarda).
    const T5 = await cuentaActiva(d, falso, 't5@cobros.test', 'Tarjeta por vencer');
    await guardarTarjeta(d, falso, T5, { marca: 'MasterCard', enmascarado: '5400********0014', vencimiento: '01/20' });
    const T6 = await cuentaActiva(d, falso, 't6@cobros.test', 'Tarjeta sana');
    await guardarTarjeta(d, falso, T6, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/40' });
    await venceEn(T5, 5);
    await venceEn(T6, 5);
    avisos.length = 0;
    falso.pedidos.length = 0;
    res = await correr();
    ok('a 5 días del vencimiento se le piden a Bancard las dos tarjetas; solo la vencida se avisa',
      [res.tarjetasRevisadas, res.tarjetasPorVencer, res.tomados, rutas(falso).map(simple), avisos.map((x) => [x.aviso, x.empresa_id, x.marca, x.ultimos4, x.destinatarios.length])],
      [2, 1, 0, ['users_cards', 'users_cards'], [['tarjeta_vence', T5.empresaId, 'MasterCard', '0014', 1]]]);
    ok('el vencimiento no quedó guardado en ningún lado', JSON.stringify((await db.query('select * from public.bancard_tarjetas')).rows).includes('01/20'), false);
    await apagar(T5);
    await apagar(T6);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('17 · Quitar la tarjeta con Bancard caído: rige igual');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('produccion');
    const Q = await H.montarEmpresa(db, { email: 'quitar@negocio.test', nombre: 'Quitar SA' });
    const tarjeta = await guardarTarjeta(d, falso, Q, { marca: 'Visa', enmascarado: '4000********0016' });
    const pagador = Number((await pagadorDe(Q)).id);

    falso.programar(/^\/users\/[0-9]+\/cards$/, 'red');
    const q = await F.quitarTarjeta(d, { empresa: Q.empresaId, usuario: Q.uid });
    ok('Bancard caído: la tarjeta queda por quitar, pero el débito ya está apagado y ya no es la de la cuenta',
      [q.ok, q.pendienteEnBancard, (await tarjetaDe(tarjeta)).estado, (await cuentaDe(Q)).debito_activo, (await cuentaDe(Q)).tarjeta_id], [true, true, 'por_quitar', false, null]);
    ok('Bancard todavía la tiene', falso.tarjetasDe(pagador).length, 1);
    ok('y la base ya no la da como tarjeta de la cuenta', await J(`select public.bancard_datos_de_tarjeta($1, 'produccion') j`, [Q.empresaId]).then((x) => x.j), null);

    falso.pedidos.length = 0;
    const res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    const del = falso.pedidos.find((p) => p.method === 'DELETE');
    ok('la conciliación termina el borrado: lista + DELETE con alias recién pedido, y quitada',
      [res.tarjetasQuitadas, rutas(falso).map(simple), (await tarjetaDe(tarjeta)).estado, falso.tarjetasDe(pagador).length,
        del.cuerpo.operation.token === md5(CLAVE + 'delete_card' + pagador + del.cuerpo.operation.alias_token)],
      [1, ['users_cards', 'users_cards'], 'quitada', 0, true]);
    ok('sin tarjeta no hay nada que quitar', (await F.quitarTarjeta(d, { empresa: Q.empresaId, usuario: Q.uid })).motivo, 'sin_tarjeta');

    const vend = await H.sumarMiembro(db, Q.empresaId, 'vend@quitar.test');
    await guardarTarjeta(d, falso, Q, { marca: 'Visa', enmascarado: '4000********0016' });
    const noPuede = await F.quitarTarjeta(d, { empresa: Q.empresaId, usuario: vend });
    ok('un vendedor no puede quitar la tarjeta de la cuenta (lo frena la base)', [noPuede.ok, noPuede.motivo, /Solo el dueño/.test(noPuede.mensaje)], [false, 'base', true]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('18 · ¿La tarjeta vence antes del cobro?');
  // ═══════════════════════════════════════════════════════════
  {
    ok('vence en 08/30 y el cobro es en 2026: no', F.tarjetaVenceAntes('08/30', '2026-11-13'), false);
    ok('vence en 10/26 y el cobro es el 13/11/2026: sí', F.tarjetaVenceAntes('10/26', '2026-11-13'), true);
    ok('vence en 11/26 y el cobro es el 13/11/2026: no (vale hasta fin de mes)', F.tarjetaVenceAntes('11/26', '2026-11-13'), false);
    ok('con el año de cuatro cifras', F.tarjetaVenceAntes('01/2026', '2026-11-13'), true);
    ok('algo que no se entiende: no se avisa', [F.tarjetaVenceAntes('', '2026-11-13'), F.tarjetaVenceAntes('13/30', '2026-11-13'), F.tarjetaVenceAntes('08/30', 'x')], [false, false, false]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('19 · El alias no queda en ningún lado');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso, avisos, registro } = armar('produccion');
    const Z = await H.montarEmpresa(db, { email: 'z@negocio.test', nombre: 'Zeta' });
    await guardarTarjeta(d, falso, Z, { marca: 'Visa', enmascarado: '4000********0016' });
    await F.cobrarConTarjeta(d, { empresa: Z.empresaId, usuario: Z.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    await F.quitarTarjeta(d, { empresa: Z.empresaId, usuario: Z.uid });
    const aliases = falso.pedidos.map((p) => p.cuerpo?.operation?.alias_token).filter(Boolean);
    ok('se usaron alias (uno por operación)', aliases.length >= 2, true);
    const guardado = JSON.stringify((await db.query('select * from public.bancard_eventos')).rows)
      + JSON.stringify((await db.query('select * from public.bancard_operaciones')).rows)
      + JSON.stringify((await db.query('select * from public.bancard_tarjetas')).rows)
      + JSON.stringify((await db.query('select * from public.bancard_cuentas')).rows);
    ok('ningún alias quedó en la base', aliases.some((a) => guardado.includes(a)), false);
    ok('ni en los avisos ni en el registro del servidor', aliases.some((a) => (JSON.stringify(avisos) + registro.join('\n')).includes(a)), false);
    ok('ni la clave privada ni test_client en ningún pedido', [falso.todoLoPedido().includes(CLAVE), falso.todoLoPedido().includes('test_client')], [false, false]);
  }

  // ═══════════════════════════════════════════════════════════
  // LA REVISIÓN DEL 03/10 (lente: la plata). Una prueba por hallazgo.
  // ═══════════════════════════════════════════════════════════
  const rollbacks = (falso) => falso.pedidos.filter((p) => p.ruta === '/single_buy/rollback').map((p) => Number(p.cuerpo.operation.shop_process_id));
  const consultas = (falso) => falso.pedidos.filter((p) => p.ruta === '/single_buy/confirmations').length;
  const filasDe = async (op) => (await J('select count(*)::int n from public.bancard_eventos where operacion_id = $1', [op])).n;
  const conteoEventos = async () => (await J('select count(*)::int n from public.bancard_eventos')).n;
  /** Una cuenta que pagó un Premium mensual por N personas. */
  async function premiumPago(d, falso, email, nombre, personas) {
    const c = await H.montarEmpresa(db, { email, nombre });
    const r = await F.iniciarPago(d, { empresa: c.empresaId, usuario: c.uid, tipo: 'plan', plan: 'negocio', periodo: 'mensual', personas });
    falso.pagar(r.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, r.operacion));
    return c;
  }

  // ═══════════════════════════════════════════════════════════
  grupo('20 · «Sumar personas» rechazada el último día y pagada después de renovar: no entra (hallazgo 1)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso, avisos } = armar('produccion');
    const K = await premiumPago(d, falso, 'h1@revision.test', 'Kiosco K', 4);
    ok('Premium pagado por 4: tope 3', (await sus(K)).tope_vendedores, 3);
    await db.query(`update public.suscripciones set periodo_fin = now() + interval '20 hours' where empresa_id = $1`, [K.empresaId]);
    const rp = await F.iniciarPago(d, { empresa: K.empresaId, usuario: K.uid, tipo: 'personas', plan: null, periodo: null, personas: 15 });
    ok('el último día pide sumar 11 personas: un día de prorrateo, Gs. 22.000', [rp.estado, rp.importe, rp.desglose.dias_restantes], ['listo', 22000, 1]);
    falso.rechazar(rp.operacion, '51', 'NO APROBADA-INSUF.DE FONDOS');
    await F.recibirConfirmacion(d, cuerpo(falso, rp.operacion));
    ok('la hace rechazar: queda rechazada', (await opDe(rp.operacion)).estado, 'rechazada');

    // Renueva por 4: al abrir otro pago, la rechazada se cierra en Bancard.
    falso.pedidos.length = 0;
    const rr = await F.iniciarPago(d, { empresa: K.empresaId, usuario: K.uid, tipo: 'plan', plan: 'negocio', periodo: 'mensual', personas: 4 });
    ok('al abrir la renovación, la rechazada recibe la reversa y queda vencida como «reemplazada»',
      [rr.estado, rollbacks(falso), (await opDe(rp.operacion)).estado, (await opDe(rp.operacion)).motivo], ['listo', [rp.operacion], 'vencida', 'reemplazada']);
    falso.pagar(rr.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, rr.operacion));
    const s2 = await sus(K);
    ok('renovó por 4: mes nuevo, tope 3', [s2.estado, s2.tope_vendedores], ['activa', 3]);

    // Vuelve al iframe viejo y paga los 22.000 (si Bancard lo dejara).
    avisos.length = 0;
    falso.pagar(rp.operacion);
    const conf = await F.recibirConfirmacion(d, cuerpo(falso, rp.operacion));
    const s3 = await sus(K);
    const op = await opDe(rp.operacion);
    ok('la aprobación tardía: 200, la plata se anota, pero NO suma personas al período nuevo',
      [conf.http, op.estado, op.revisar, s3.tope_vendedores, (await J('select public.tope_de_miembros($1) n', [K.empresaId])).n, (await ingresos(`Bancard ${rp.operacion}`)).length],
      [200, 'pagada', 'Sumó personas sobre un período ya renovado: resolver a mano', 3, 4, 1]);
    ok('y se le avisa a la administración, sin «plan activo» para la persona', [avisos.length, avisos[0]?.conflicto, avisos[0]?.revisar], [1, true, op.revisar]);
    ok('ningún renglón del registro (no cuenta como pago de personas)', (await registroDe(K)).filter((r) => r.accion === 'bancard_personas').length, 0);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('21 · El 18 % del primer pago no se cobra dos veces con rechazadas viejas (hallazgo 2)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('produccion');
    const L = await H.montarEmpresa(db, { email: 'h2@revision.test', nombre: 'Librería L' });
    await db.query('update public.suscripciones set racha_objetivo = 1 where empresa_id = $1', [L.empresaId]);
    await db.query(`insert into public.movimientos (empresa_id, tipo, estado, fecha, descripcion, categoria, subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por)
      values ($1, 'ingreso', 'activo', public.hoy_empresa($1), 'venta', 'Ventas', 1000, 0, 1000, 0, 'efectivo', '', $2)`, [L.empresaId, L.uid]);
    const pro = { empresa: L.empresaId, usuario: L.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null };
    const a = await F.iniciarPago(d, pro);
    ok('A: el primer pago con el 18 %: 155.800', [a.importe, a.desglose.descuento_fase], [155800, 'prueba']);
    falso.rechazar(a.operacion, '51');
    await F.recibirConfirmacion(d, cuerpo(falso, a.operacion));
    const a2 = await F.iniciarPago(d, pro);
    falso.rechazar(a2.operacion, '05');
    await F.recibirConfirmacion(d, cuerpo(falso, a2.operacion));
    ok('A rechazada; al abrir A2, A quedó cerrada en Bancard', [(await opDe(a.operacion)).estado, (await opDe(a.operacion)).motivo], ['vencida', 'reemplazada']);

    falso.pedidos.length = 0;
    const b = await F.iniciarPago(d, pro);
    ok('B (todavía el primer pago): 155.800, y A2 también se cierra', [b.importe, rollbacks(falso), (await opDe(a2.operacion)).estado], [155800, [a2.operacion], 'vencida']);
    falso.pagar(b.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, b.operacion));
    const fin1 = (await sus(L)).fin;
    ok('tras pagar B: activa, y una cotización nueva ya es sin descuento',
      [(await sus(L)).estado, (await J('select public.precio_de_la_cuenta($1, $2, $3, null) j', [L.empresaId, 'pro', 'mensual'])).j.total], ['activa', 190000]);

    // Vuelve a los iframes de A y A2 (tiene sus process_id) y paga 155.800 en cada uno.
    for (const op of [a.operacion, a2.operacion]) {
      falso.pagar(op);
      const conf = await F.recibirConfirmacion(d, cuerpo(falso, op));
      ok(`la aprobación tardía de ${op === a.operacion ? 'A' : 'A2'}: 200, pagada, pero marcada y sin activar`,
        [conf.http, (await opDe(op)).estado, (await opDe(op)).revisar, (await sus(L)).fin === fin1],
        [200, 'pagada', 'Pagó una operación vieja con el descuento del primer pago: resolver a mano', true]);
    }
    ok('un solo renglón «cambiar_plan» (el de B) y tres ingresos anotados (la plata entró, la mira una persona)',
      [(await registroDe(L)).filter((r) => r.accion === 'cambiar_plan').length, (await ingresos('Librería L')).length], [1, 3]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('22 · Renovar por menos e invitar hasta el tope viejo antes de confirmar (hallazgo 3)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso, avisos } = armar('produccion');
    const U2 = await premiumPago(d, falso, 'h3@revision.test', 'Ultramarinos U', 8);
    await bajar(U2, U2.uid, 4);
    ok('con la baja programada a 4, el tope ya es 4', (await J('select public.tope_de_miembros($1) n', [U2.empresaId])).n, 4);
    // Revisión 07/10 (R3.3): mover el vencimiento a mano (acá, la prueba; en
    // la vida real, una renovación activada desde /admin) hace caducar la
    // baja programada: el disparador de `suscripciones` la borra. Por eso se
    // programa de nuevo DESPUÉS de mover la fecha.
    await db.query(`update public.suscripciones set periodo_fin = now() + interval '1 day' where empresa_id = $1`, [U2.empresaId]);
    ok('mover el vencimiento por fuera de Bancard borra la baja programada: vuelve lo contratado (8)',
      [await proximaDe(U2), (await J('select public.tope_de_miembros($1) n', [U2.empresaId])).n], [null, 8]);
    await bajar(U2, U2.uid, 4);
    const ren = await F.iniciarPago(d, { empresa: U2.empresaId, usuario: U2.uid, tipo: 'plan', plan: 'negocio', periodo: 'mensual', personas: 4 });
    ok('la renovación por 4 queda abierta (viva): Gs. 250.000', [ren.estado, ren.importe], ['listo', 250000]);
    let unidos = 0;
    let frenado = '';
    for (const e of ['u2', 'u3', 'u4', 'u5', 'u6']) {
      try { await H.sumarMiembro(db, U2.empresaId, `${e}@revision.test`); unidos++; } catch (err) { frenado = err.message; }
    }
    ok('con el formulario abierto entran hasta 4 (la renovación viva manda), el quinto no',
      [unidos, /ya tiene sus 4 personas/.test(frenado)], [3, true]);
    // Si igual hay más gente (sumada a mano), al confirmar se cuenta.
    for (const e of ['u7', 'u8', 'u9', 'u10']) {
      const uid = await H.crearUsuario(db, `${e}@revision.test`);
      await db.query(`insert into public.miembros (empresa_id, user_id, nombre, rol) values ($1, $2, 'A mano', 'vendedor')`, [U2.empresaId, uid]);
    }
    avisos.length = 0;
    falso.pagar(ren.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, ren.operacion));
    const s = await sus(U2);
    ok('pagó por 4 con 8 en el equipo: tope 3 (lo pagado) y queda para que lo mire la administración',
      [s.tope_vendedores, (await opDe(ren.operacion)).revisar, avisos[0]?.revisar], [3, 'Pagó por menos personas de las que hoy tiene el equipo', 'Pagó por menos personas de las que hoy tiene el equipo']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('23 · La URL pública no es un amplificador (hallazgos 4 y 12)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('produccion');
    const M = await cuentaActiva(d, falso, 'h4@revision.test', 'Mercería M');
    const pagada = (await J(`select id from public.bancard_operaciones where empresa_id = $1 order by id limit 1`, [M.empresaId])).id;
    const inventado = (op) => JSON.stringify({ operation: { shop_process_id: String(op), token: 'a'.repeat(32), amount: '1.00' } });

    // (a) Sobre una operación terminada: nada que consultar.
    falso.pedidos.length = 0;
    const antes = await filasDe(pagada);
    const rs = [];
    for (let i = 0; i < 5; i++) rs.push((await F.recibirConfirmacion(d, inventado(pagada))).http);
    ok('5 POST con token inventado sobre una pagada: 200 los cinco, CERO consultas a Bancard y UNA sola fila (una por operación y día)',
      [rs, consultas(falso), (await filasDe(pagada)) - antes,
        (await db.query(`select distinct clave from public.bancard_eventos where operacion_id = $1 and tipo = 'confirmacion' and clave like 'token_invalido%'`, [pagada])).rows.map((x) => x.clave)],
      [[200, 200, 200, 200, 200], 0, 1, ['token_invalido_cerrada']]);

    // (b) Sobre una viva: una consulta por minuto (el resto en el grupo 5).
    const r = await F.iniciarPago(d, { empresa: M.empresaId, usuario: M.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pedidos.length = 0;
    for (let i = 0; i < 5; i++) await F.recibirConfirmacion(d, inventado(r.operacion));
    ok('5 POST sobre una viva en el mismo minuto: UNA consulta a Bancard y una sola vez «consultas»',
      [consultas(falso), (await opDe(r.operacion)).consultas], [1, 1]);

    // (c) Lo que no es un pedido no deja fila.
    const n0 = await conteoEventos();
    for (const c of ['', '{}', 'null', 'hola', '{"operation":{}}', '{"operation":{"shop_process_id":"abc","token":"' + 'f'.repeat(32) + '"}}']) {
      await F.recibirConfirmacion(d, c);
    }
    ok('vacío, no JSON e inválido: ni una fila en bancard_eventos', (await conteoEventos()) - n0, 0);

    // (d) Un número desconocido: una fila por día.
    const ajena = { operation: { token: tokens.confirm(CLAVE, '999777', '5000.00'), shop_process_id: '999777', response: 'S', response_code: '00', amount: '5000.00', currency: 'PYG' } };
    for (let i = 0; i < 4; i++) await F.recibirConfirmacion(d, JSON.stringify(ajena));
    ok('el mismo número desconocido cuatro veces: 200 y una sola fila', await filasDe(999777), 1);

    // (e) La pantalla que sondea: una consulta cada 10 segundos.
    falso.pedidos.length = 0;
    const e1 = await F.resolverOperacion(d, r.operacion, { noRepetirAntesDeS: 10 });
    const e2 = await F.resolverOperacion(d, r.operacion, { noRepetirAntesDeS: 10 });
    ok('resolverOperacion con el freno: la segunda vez no llama a Bancard', [e1, e2, consultas(falso)], ['sigue', 'sigue', 0]);
    await db.query(`update public.bancard_eventos set created_at = created_at - interval '11 seconds' where operacion_id = $1 and tipo = 'consulta'`, [r.operacion]);
    await F.resolverOperacion(d, r.operacion, { noRepetirAntesDeS: 10 });
    ok('pasados los 10 segundos, sí', consultas(falso), 1);

    // (f) Un cobro con tarjeta guardada: la confirmación puede venir firmada con la fórmula del charge.
    await guardarTarjeta(d, falso, M, { marca: 'Visa', enmascarado: '4000********0016' });
    await F.resolverOperacion(d, r.operacion, { vencerSiNoPago: true });
    const ct = await F.cobrarConTarjeta(d, { empresa: M.empresaId, usuario: M.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.pedidos.length = 0;
    const deCharge = await F.recibirConfirmacion(d, inventado(ct.operacion));
    ok('token que no coincide sobre un cobro con token ya pagado: 200, sin consulta, anotado como «token_de_charge_cerrada»',
      [ct.estado, deCharge.http, consultas(falso), (await eventos(ct.operacion)).at(-1).clave], ['pagada', 200, 0, 'token_de_charge_cerrada']);
    falso.proximoCobro({ tipo: '3ds' });
    const c3 = await F.cobrarConTarjeta(d, { empresa: M.empresaId, usuario: M.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    falso.programar('/single_buy/confirmations', 'red');
    const en3ds = await F.recibirConfirmacion(d, inventado(c3.operacion));
    ok('sobre un 3D Secure vivo con Bancard caído: 200 igual (no 400), «token_de_charge», y la operación sigue viva',
      [c3.estado, en3ds.http, (await eventos(c3.operacion)).at(-1).clave, (await opDe(c3.operacion)).estado], ['en_3ds', 200, 'token_de_charge', 'en_3ds']);

    // (g) El registro se purga.
    await db.query(`insert into public.bancard_eventos (operacion_id, entorno, tipo, ok, created_at) values (1, 'produccion', 'consulta', true, now() - interval '91 days'), (1, 'produccion', 'consulta', true, now() - interval '89 days')`);
    await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('la conciliación borra lo de más de 90 días y deja lo demás',
      (await db.query(`select count(*)::int n from public.bancard_eventos where operacion_id = 1`)).rows[0].n, 1);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('24 · Un fallo de infraestructura no quema el intento del débito (hallazgo 5)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('produccion');
    const correr = () => F.correrCobros(d, { hastaMs: Date.now() + 120_000 }, { esperaMs: 2_000 });
    const A2 = await cuentaActiva(d, falso, 'h5@revision.test', 'Red caída');
    await guardarTarjeta(d, falso, A2, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    await venceEn(A2, 1);
    falso.programar(/^\/users\/[0-9]+\/cards$/, 'red');
    let res = await correr();
    const c1 = await cuentaDe(A2);
    ok('día −1 sin red: la operación vence sin charge y el intento se DEVUELVE (sigue siendo el primero)',
      [res.tomados, res.vencidos, charges(falso), c1.intentos, c1.debito_estado, c1.ultimo_intento !== null], [1, 1, 0, 0, 'al_dia', true]);
    ok('el mismo día no se insiste (un intento por día)', (await correr()).tomados, 0);
    await pasanDias(A2, 1);
    res = await correr();
    ok('el día del vencimiento: se vuelve a intentar y entra, antes del corte', [res.tomados, res.pagados, (await sus(A2)).efectivo, (await cuentaDe(A2)).intentos], [1, 1, 'pro', 0]);

    // Un pedido que Bancard no aceptó tampoco cuenta; una tarjeta que Bancard dice que no sirve, sí (pausa).
    await venceEn(A2, 1);
    await db.query('update public.bancard_cuentas set ultimo_intento = ultimo_intento - 30 where empresa_id = $1', [A2.empresaId]);
    await db.query(`update public.bancard_operaciones set created_at = created_at - interval '30 days' where empresa_id = $1`, [A2.empresaId]);
    falso.programar('/charge', { json: { status: 'error', messages: [{ key: 'InvalidOperationError', level: 'error', dsc: 'x' }] } });
    res = await correr();
    ok('Bancard no acepta el charge (no es el banco): vencida y el intento vuelve a 0', [res.vencidos, (await cuentaDe(A2)).intentos], [1, 0]);
    await pasanDias(A2, 1);
    falso.programar('/charge', { json: { status: 'error', messages: [{ key: 'CardBlockedError', level: 'error', dsc: 'x' }] } });
    res = await correr();
    ok('CardBlockedError: cuenta y pausa el débito', [res.vencidos, (await cuentaDe(A2)).intentos, (await cuentaDe(A2)).debito_estado], [1, 1, 'pausado']);
    await apagar(A2);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('25 · Reintentar sobre un cobro con token incierto espera 10 minutos (hallazgo 6)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('produccion');
    const B2 = await cuentaActiva(d, falso, 'h6@revision.test', 'Doble cobro');
    await guardarTarjeta(d, falso, B2, { marca: 'Visa', enmascarado: '4000********0016' });
    const pedido = { empresa: B2.empresaId, usuario: B2.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null };
    falso.programar('/charge', (p) => {
      falso.compras.set(p.cuerpo.operation.shop_process_id, { amount: p.cuerpo.operation.amount, estado: 'pendiente', medio: 'token' });
      return new Promise(() => undefined);
    });
    const c1 = await F.cobrarConTarjeta(d, pedido, { esperaMs: 150 });
    ok('el charge se cuelga: incierta', c1.estado, 'incierta');
    falso.pedidos.length = 0;
    const c2 = await F.cobrarConTarjeta(d, pedido, { esperaMs: 2_000 });
    ok('tocar «Pagar con mi Visa» enseguida: «en curso», sin reversa ni segundo charge',
      [c2.estado, c2.operacion, rutas(falso)], ['en_curso', c1.operacion, []]);
    const f2 = await F.iniciarPago(d, pedido);
    ok('ni con el formulario', [f2.estado, rutas(falso)], ['en_curso', []]);
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '11 minutes' where id = $1`, [c1.operacion]);
    const c3 = await F.cobrarConTarjeta(d, pedido, { esperaMs: 2_000 });
    ok('pasados los 10 minutos del manual: se consulta, se revierte la incierta y recién ahí se cobra otra',
      [c3.estado, c3.operacion !== c1.operacion, rutas(falso).map(simple), (await opDe(c1.operacion)).estado],
      ['pagada', true, ['/single_buy/confirmations', '/single_buy/rollback', 'users_cards', '/charge'], 'vencida']);
    await apagar(B2);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('26 · Una cuenta en prueba nunca se cobra sola, tenga o no la tarjeta guardada (07/10)');
  // ═══════════════════════════════════════════════════════════
  // Este grupo afirmaba lo contrario desde el 03/10 («la tarjeta guardada en
  // la prueba la convierte»: el día anterior al fin de la prueba se cobraba
  // sola). La revisión final lo deshizo (R3.1, gravedad alta): toda prueba
  // nace con el plan Pro, así que cobrarla sola era cobrarle el Pro
  // (Gs. 190.000) a un negocio que nunca eligió plan y quizá quería el
  // Básico (110.000); y una prueba YA vencida que guardaba la tarjeta era
  // cobrada dentro de la hora. La prueba sí puede guardar la tarjeta: le
  // sirve para pagar con un toque cuando elige su plan, y desde ese primer
  // pago las renovaciones son automáticas.
  {
    const { d, falso, avisos } = armar('produccion');
    const correr = () => F.correrCobros(d, { hastaMs: Date.now() + 120_000 }, { esperaMs: 2_000 });
    const estadoDe = async (c) => (await H.comoUsuario(db, c.uid, () => db.query(`select public.bancard_estado($1,'produccion') j`, [c.empresaId]))).rows[0].j;
    const operacionesDe = async (c) => (await J('select count(*)::int n from public.bancard_operaciones where empresa_id = $1', [c.empresaId])).n;

    // La prueba vigente, con la tarjeta guardada a tiempo.
    const T2 = await H.montarEmpresa(db, { email: 'h7@revision.test', nombre: 'En prueba' });
    await guardarTarjeta(d, falso, T2, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    await venceEn(T2, 1);
    const est = await estadoDe(T2);
    ok('en prueba, con la tarjeta guardada: la pantalla tiene la tarjeta y ni fecha ni importe de ningún cobro',
      [(await sus(T2)).estado, est.tarjeta?.ultimos4, est.debito.activo, est.debito.estado, est.debito.fecha_cobro, est.debito.importe],
      ['prueba', '0016', true, 'al_dia', null, null]);
    const fila = ((await H.comoServicio(db, () => db.query('select public.vencimientos_por_avisar() j'))).rows[0].j || []).find((x) => x.empresa_id === T2.empresaId);
    ok('el aviso del fin de la prueba sale como siempre, sin débito (el correo no promete un cobro)', [fila?.tipo, fila?.debito ?? null], ['prueba', null]);
    falso.pedidos.length = 0;
    avisos.length = 0;
    let res = await correr();
    ok('el día anterior al fin de la prueba la tarea NO la cobra: ni la toma, ni revisa su tarjeta, ni le habla a Bancard',
      [res.tomados, res.pagados, res.pausados, res.tarjetasRevisadas, rutas(falso), (await sus(T2)).estado, await operacionesDe(T2), avisos.length],
      [0, 0, 0, 0, [], 'prueba', 0, 0]);

    // R3.1: la prueba YA vencida que guarda la tarjeta (antes: cobrada en la corrida siguiente, por el Pro).
    const V2 = await H.montarEmpresa(db, { email: 'r31@revision.test', nombre: 'Prueba vencida' });
    await venceEn(V2, -2);
    await guardarTarjeta(d, falso, V2, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    falso.pedidos.length = 0;
    res = await correr();
    ok('una prueba vencida hace 2 días que guarda la tarjeta: la corrida siguiente no le cobra nada y el débito no se pausa',
      [res.tomados, res.pausados, charges(falso), (await sus(V2)).estado, (await sus(V2)).efectivo, (await cuentaDe(V2)).debito_estado, await operacionesDe(V2),
        (await estadoDe(V2)).debito.fecha_cobro, (await estadoDe(V2)).debito.importe],
      [0, 0, 0, 'prueba', 'gratis', 'al_dia', 0, null, null]);

    // Lo que sí: elige SU plan y paga con un toque; desde ahí se renueva sola.
    const toque = await F.cobrarConTarjeta(d, { empresa: V2.empresaId, usuario: V2.uid, tipo: 'plan', plan: 'basico', periodo: 'mensual', personas: null }, { esperaMs: 2_000 });
    ok('elige el Básico y paga con la tarjeta guardada: Gs. 110.000 (no los 190.000 del Pro), y queda activa en SU plan',
      [toque.estado, Number((await opDe(toque.operacion)).importe), (await opDe(toque.operacion)).origen, (await sus(V2)).plan, (await sus(V2)).estado, (await sus(V2)).efectivo],
      ['pagada', 110000, 'usuario', 'basico', 'activa', 'basico']);
    const estV = await estadoDe(V2);
    ok('y recién ahora la pantalla tiene fecha e importe del próximo cobro', [estV.debito.fecha_cobro !== null, estV.debito.importe], [true, 110000]);
    await venceEn(V2, 1);
    await db.query('update public.bancard_cuentas set ultimo_intento = ultimo_intento - 30 where empresa_id = $1', [V2.empresaId]);
    await db.query(`update public.bancard_operaciones set created_at = created_at - interval '30 days' where empresa_id = $1`, [V2.empresaId]);
    avisos.length = 0;
    res = await correr();
    const renovacion = await J(`select * from public.bancard_operaciones where empresa_id = $1 and origen = 'automatico' order by id desc limit 1`, [V2.empresaId]);
    ok('la renovación siguiente sí la cobra la tarea, sola: su Básico',
      [res.tomados, res.pagados, renovacion?.plan, Number(renovacion?.importe), avisos[0]?.origen], [1, 1, 'basico', 110000, 'automatico']);
    await apagar(T2);
    await apagar(V2);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('27 · RollbackSuccessful en la conciliación: la aprobación tardía no activa (hallazgo 8)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso, avisos } = armar('produccion');
    const R2 = await H.montarEmpresa(db, { email: 'h8@revision.test', nombre: 'Rollback real' });
    const r = await F.iniciarPago(d, { empresa: R2.empresaId, usuario: R2.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '31 minutes' where id = $1`, [r.operacion]);
    falso.programar('/single_buy/rollback', { json: { status: 'success', messages: [{ key: 'RollbackSuccessful', level: 'info', dsc: 'Rollback correcto.' }] } });
    const res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('la reversa encontró plata y la devolvió: vencida con el motivo de verdad',
      [res.vencidas, (await opDe(r.operacion)).estado, (await opDe(r.operacion)).motivo], [1, 'vencida', 'RollbackSuccessful']);
    avisos.length = 0;
    falso.pagar(r.operacion);
    const conf = await F.recibirConfirmacion(d, cuerpo(falso, r.operacion));
    ok('la aprobación de ese pago devuelto: 200, no activa, ni ingreso, y queda para revisar',
      [conf.http, (await opDe(r.operacion)).estado, (await opDe(r.operacion)).revisar, (await sus(R2)).estado, (await ingresos(`Bancard ${r.operacion}`)).length],
      [200, 'vencida', 'Aprobación sobre un pago que Bancard ya revirtió', 'prueba', 0]);
    ok('y la administración se entera', [avisos.length, avisos[0]?.motivo], [1, 'revertida']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('28 · Las rechazadas se cierran en Bancard (hallazgos 1 y 2, la reversa)');
  // ═══════════════════════════════════════════════════════════
  {
    const { d, falso } = armar('produccion');
    const C2 = await H.montarEmpresa(db, { email: 'h9@revision.test', nombre: 'Rechazos' });
    const p = { empresa: C2.empresaId, usuario: C2.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null };
    const a = await F.iniciarPago(d, p);
    falso.rechazar(a.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, a.operacion));
    // Reintento en el mismo formulario, minutos después: sigue abierta.
    ok('recién rechazada: la conciliación todavía no la toca (el reintento en el mismo formulario)',
      [(await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 })).rechazadasCerradas, (await opDe(a.operacion)).estado], [0, 'rechazada']);
    await db.query(`update public.bancard_operaciones set updated_at = now() - interval '11 minutes' where id = $1`, [a.operacion]);
    falso.programar('/single_buy/rollback', 'red');
    ok('a los 11 minutos: se le manda la reversa; si Bancard no contesta, sigue rechazada para la próxima',
      [(await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 })).rechazadasCerradas, (await opDe(a.operacion)).estado], [0, 'rechazada']);
    falso.pedidos.length = 0;
    const res = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    ok('la vez siguiente la cierra: reversa (sin pago = correcto) y «reemplazada»',
      [res.rechazadasCerradas, rollbacks(falso), (await opDe(a.operacion)).estado, (await opDe(a.operacion)).motivo], [1, [a.operacion], 'vencida', 'reemplazada']);
    ok('una rechazada solo pasa a vencida por esa puerta: cerrarla «porque sí» no cambia nada',
      await (async () => {
        const b = await F.iniciarPago(d, p);
        falso.rechazar(b.operacion);
        await F.recibirConfirmacion(d, cuerpo(falso, b.operacion));
        const x = (await H.comoServicio(db, () => db.query(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"abandonada"}') j`, [b.operacion]))).rows[0].j;
        return [x.cambio, (await opDe(b.operacion)).estado];
      })(), [false, 'rechazada']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('29 · Una reversa que Bancard SÍ hizo sobre una operación que quedó pagada deja rastro (07/10)');
  // ═══════════════════════════════════════════════════════════
  // R3.2 (sonda plata-2-flujo.js, bloques A1 y A2; el control A3 es el grupo
  // 27). Entre que Orden decide mandar la reversa y Bancard la hace, entra el
  // pago y otra función de Vercel procesa su confirmación. Bancard devuelve
  // la plata y en Orden la operación queda «pagada», con el plan activo y el
  // ingreso anotado. Antes no quedaba nada escrito ni se avisaba a nadie, y
  // la conciliación la contaba como «rechazada cerrada» o «vencida».
  {
    const { d, falso, avisos, registro } = armar('produccion');
    const pro = (c) => ({ empresa: c.empresaId, usuario: c.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null });
    const TEXTO = 'Bancard devolvió este pago (reversa) y el plan quedó activo: revertirlo a mano';
    /** En el medio de la reversa: la persona paga y OTRA función procesa la confirmación de Bancard. */
    const pagaEnElMedio = (op) => falso.programar('/single_buy/rollback', async () => {
      falso.pagar(op);
      await F.recibirConfirmacion(armar('produccion').d, cuerpo(falso, op));
      return 'atender';
    });
    const deReversa = () => avisos.filter((a) => a.aviso === 'reversa_sobre_pagada');

    // A1 · una rechazada de formulario de 11 minutos: la conciliación le manda la reversa.
    const C1 = await H.montarEmpresa(db, { email: 'a1@reversa.test', nombre: 'Carrera rechazada' });
    const r1 = await F.iniciarPago(d, pro(C1));
    falso.rechazar(r1.operacion);
    await F.recibirConfirmacion(d, cuerpo(falso, r1.operacion));
    await db.query(`update public.bancard_operaciones set updated_at = now() - interval '11 minutes' where id = $1`, [r1.operacion]);
    pagaEnElMedio(r1.operacion);
    avisos.length = 0;
    const res1 = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    const o1 = await opDe(r1.operacion);
    ok('A1: Bancard devolvió la plata y en Orden el pago sigue pagado, con el plan activo y el ingreso anotado (no se toca solo)',
      [falso.compras.get(r1.operacion).estado, o1.estado, (await sus(C1)).estado, await ingresos(`Bancard ${r1.operacion}`)],
      ['revertida', 'pagada', 'activa', [{ monto: 190000, metodo_pago: 'tarjeta', estado: 'activo' }]]);
    ok('pero ahora queda escrito para revisar', o1.revisar, TEXTO);
    ok('y la administración recibe UN aviso, con el pedido, la cuenta y el importe',
      deReversa().map((a) => [a.operacion, a.nombre, Number(a.importe), a.entorno, a.empresa_id === C1.empresaId]),
      [[r1.operacion, 'Carrera rechazada', 190000, 'produccion', true]]);
    ok('la conciliación no la cuenta como «rechazada cerrada»', res1.rechazadasCerradas, 0);
    ok('y queda en el registro del servidor', registro.some((t) => t.includes(`reversa hecha en Bancard sobre un pago que quedó activo · pedido ${r1.operacion}`)), true);
    ok('el aviso no lleva nada secreto', ['token', 'process_id', 'authorization_number', 'response_code'].filter((k) => JSON.stringify(deReversa()).includes(k)), []);

    // A2 · un formulario de 31 minutos: la consulta dice «sin pago», la persona paga, y sale la reversa.
    const C2 = await H.montarEmpresa(db, { email: 'a2@reversa.test', nombre: 'Carrera abandonada' });
    const r2 = await F.iniciarPago(d, pro(C2));
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '31 minutes' where id = $1`, [r2.operacion]);
    pagaEnElMedio(r2.operacion);
    avisos.length = 0;
    const res2 = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    const o2 = await opDe(r2.operacion);
    ok('A2: lo mismo con un formulario que se iba a vencer: la conciliación informa «pagada», no «vencida»',
      [res2.pagadas, res2.vencidas, falso.compras.get(r2.operacion).estado, o2.estado, o2.revisar, (await sus(C2)).estado, deReversa().map((a) => a.operacion)],
      [1, 0, 'revertida', 'pagada', TEXTO, 'activa', [r2.operacion]]);

    // Lo mismo por la puerta de resolverOperacion (la pantalla de vuelta, «Consultar a Bancard»).
    const C3 = await H.montarEmpresa(db, { email: 'a3@reversa.test', nombre: 'Carrera consultada' });
    const r3 = await F.iniciarPago(d, pro(C3));
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '31 minutes' where id = $1`, [r3.operacion]);
    pagaEnElMedio(r3.operacion);
    avisos.length = 0;
    ok('resolverOperacion devuelve «pagada» cuando la base no la cerró porque ya estaba pagada',
      [await F.resolverOperacion(d, r3.operacion, { vencerSiNoPago: true }), (await opDe(r3.operacion)).revisar, deReversa().length], ['pagada', TEXTO, 1]);
    // Un solo aviso: la base devuelve `revisar: true` solo la primera vez.
    const otraVez = (await H.comoServicio(db, () => db.query(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"RollbackSuccessful"}') j`, [r3.operacion]))).rows[0].j;
    ok('si el cierre se repite, la base ya no pide otro aviso', [otraVez.cambio, otraVez.estado, otraVez.revisar], [false, 'pagada', false]);

    // Lo de siempre no cambió: una reversa sin pago cierra y no avisa nada.
    const C4 = await H.montarEmpresa(db, { email: 'a4@reversa.test', nombre: 'Sin carrera' });
    const r4 = await F.iniciarPago(d, pro(C4));
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '31 minutes' where id = $1`, [r4.operacion]);
    avisos.length = 0;
    ok('un formulario abandonado sin pago: vencida, «abandonada», sin aviso',
      [await F.resolverOperacion(d, r4.operacion, { vencerSiNoPago: true }), (await opDe(r4.operacion)).estado, (await opDe(r4.operacion)).motivo, (await opDe(r4.operacion)).revisar, avisos.length],
      ['vencida', 'vencida', 'abandonada', null, 0]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('30 · Un 5xx de Bancard al cobrar con la tarjeta guardada no es «no se cobró» (07/10)');
  // ═══════════════════════════════════════════════════════════
  // R3.4 (sondas plata-2-flujo.js bloque E y esceptico-de-502.js). Bancard
  // cobra, y la respuesta que vuelve es un 502 con JSON (un proxy en el
  // medio). Antes: clase 'bancard' → «no se cobró» → vencida y el intento
  // devuelto → al día siguiente, OTRO cobro: dos cobros, un mes. Ahora un
  // 5xx queda incierta y la conciliación le pregunta a Bancard.
  {
    const { d, falso } = armar('produccion');
    const correr = () => F.correrCobros(d, { hastaMs: Date.now() + 120_000 }, { esperaMs: 2_000 });
    const ultimaAuto = (c) => J(`select * from public.bancard_operaciones where empresa_id = $1 and origen = 'automatico' order by id desc limit 1`, [c.empresaId]);
    const hace15 = (op) => db.query(`update public.bancard_operaciones set created_at = now() - interval '15 minutes' where id = $1`, [op]);
    /** Cuántos cobros con token de esa cuenta aprobó Bancard de verdad. */
    const cobradosEnBancard = async (c) => (await db.query(`select id from public.bancard_operaciones where empresa_id = $1 and medio = 'token'`, [c.empresaId]))
      .rows.filter((o) => falso.compras.get(Number(o.id))?.estado === 'pagada').length;
    /** Bancard procesa el cobro (lo aprueba) y lo que vuelve es otra cosa. */
    const cobraYContesta = (status, json) => falso.programar('/charge', async (p, init) => {
      await falso.transporte(p.url, init);
      return { status, json };
    });
    const nueva = async (email, nombre) => {
      const c = await cuentaActiva(d, falso, email, nombre);
      await guardarTarjeta(d, falso, c, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
      await venceEn(c, 1);
      return c;
    };

    for (const [nombre, email, status, json] of [
      ['X1 · 502 con JSON de un proxy', 'x1@5xx.test', 502, { message: 'Bad Gateway' }],
      ['X2 · 500 con status error', 'x2@5xx.test', 500, { status: 'error', messages: [{ key: 'InternalError', level: 'error', dsc: 'x' }] }],
    ]) {
      const c = await nueva(email, nombre);
      cobraYContesta(status, json);
      const res = await correr();
      let o = await ultimaAuto(c);
      ok(`${nombre}, y Bancard SÍ cobró: queda incierta (no «vencida») y el intento no se devuelve`,
        [res.tomados, res.inciertos, res.vencidos, o.estado, (await cuentaDe(c)).intentos, falso.compras.get(Number(o.id)).estado],
        [1, 1, 0, 'incierta', 1, 'pagada']);
      ok('el mismo día no se le manda otro cobro encima', [(await correr()).tomados, charges(falso) >= 1], [0, true]);
      await hace15(o.id);
      const con = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
      o = await opDe(o.id);
      ok('la conciliación le pregunta a Bancard y la da por pagada: el plan se renueva una vez',
        [con.pagadas, o.estado, o.fuente, o.revisar, (await sus(c)).efectivo, (await cuentaDe(c)).debito_estado], [1, 'pagada', 'consulta', null, 'pro', 'al_dia']);
      await pasanDias(c, 1);
      ok('al día siguiente no hay nada que cobrar: UN solo cobro en Bancard (antes eran dos)', [(await correr()).tomados, await cobradosEnBancard(c)], [0, 1]);
      await apagar(c);
    }

    // X3 · 503 y Bancard NO cobró: incierta igual; la consulta dice que no existe y recién ahí se devuelve el intento.
    const X3 = await nueva('x3@5xx.test', 'X3 · 503 sin cobro');
    falso.programar('/charge', { status: 503, json: { message: 'Service Unavailable' } });
    let res = await correr();
    let o3 = await ultimaAuto(X3);
    ok('X3 · 503 y Bancard NO cobró: también incierta (no se puede saber sin preguntar)', [res.inciertos, res.vencidos, o3.estado, (await cuentaDe(X3)).intentos], [1, 0, 'incierta', 1]);
    await hace15(o3.id);
    const con3 = await F.correrConciliacion(d, { hastaMs: Date.now() + 60_000 });
    o3 = await opDe(o3.id);
    ok('la conciliación consulta: Bancard no la conoce → vencida, y el intento vuelve',
      [con3.vencidas, o3.estado, o3.motivo, (await cuentaDe(X3)).intentos, (await cuentaDe(X3)).debito_estado], [1, 'vencida', 'BuyNotFoundError', 0, 'al_dia']);
    await pasanDias(X3, 1);
    res = await correr();
    ok('al día siguiente se cobra, una sola vez', [res.tomados, res.pagados, await cobradosEnBancard(X3)], [1, 1, 1]);
    await apagar(X3);

    // X4 · un «no» de Bancard por debajo de 500 sigue cerrando en el acto, como siempre.
    const X4 = await nueva('x4@5xx.test', 'X4 · 422');
    falso.programar('/charge', { status: 422, json: { status: 'error', messages: [{ key: 'InvalidJsonError', level: 'error', dsc: 'x' }] } });
    res = await correr();
    const o4 = await ultimaAuto(X4);
    ok('X4 · 422 con status error (Bancard no aceptó el pedido): vencida en el acto y el intento vuelve, como antes',
      [res.vencidos, res.inciertos, o4.estado, o4.motivo, (await cuentaDe(X4)).intentos], [1, 0, 'vencida', 'InvalidJsonError', 0]);
    await apagar(X4);

    // Con la persona delante es el mismo cobro: «incierta», y no se le ofrece pagar de nuevo.
    const X5 = await cuentaActiva(d, falso, 'x5@5xx.test', 'X5 · con la persona');
    await guardarTarjeta(d, falso, X5, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    cobraYContesta(502, { message: 'Bad Gateway' });
    const pedido = { empresa: X5.empresaId, usuario: X5.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null };
    const c5 = await F.cobrarConTarjeta(d, pedido, { esperaMs: 2_000 });
    const charges5 = charges(falso);
    const otro = await F.cobrarConTarjeta(d, pedido, { esperaMs: 2_000 });
    ok('«Pagar con mi Visa» con un 502: incierta; tocar de nuevo no manda otro cobro («en curso»)',
      [c5.estado, otro.estado, otro.operacion === c5.operacion, charges(falso) - charges5], ['incierta', 'en_curso', true, 0]);
    await apagar(X5);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('31 · Revertir un cobro pausa el débito: no se vuelve a cobrar al día siguiente (07/10)');
  // ═══════════════════════════════════════════════════════════
  // R3.5 (sonda plata-3-prueba-y-reversa.js, bloque R). El cliente reclama,
  // la administración revierte el cobro automático el mismo día, la
  // suscripción vuelve a «vence mañana»… y el débito seguía al día: la tarea
  // le cobraba otra vez al día siguiente.
  {
    const { d, falso } = armar('produccion');
    const correr = () => F.correrCobros(d, { hastaMs: Date.now() + 120_000 }, { esperaMs: 2_000 });
    const MOTIVO = 'Pago revertido por la administración';
    const R = await cuentaActiva(d, falso, 'r35@revision.test', 'Reversa y débito');
    await guardarTarjeta(d, falso, R, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    await venceEn(R, 1);
    let res = await correr();
    const cobro = await J(`select * from public.bancard_operaciones where empresa_id = $1 and origen = 'automatico' order by id desc limit 1`, [R.empresaId]);
    ok('el cobro automático del día anterior entra', [res.pagados, cobro.estado], [1, 'pagada']);

    const rv = await F.revertirPago(d, { operacion: Number(cobro.id), actor: jefe.uid, motivo: 'el cliente pidió la devolución', sinBancard: false });
    const cta = await cuentaDe(R);
    ok('la administración lo revierte: Bancard devuelve la plata, Orden deshace el plan y PAUSA el débito, con su motivo',
      [rv.ok, rv.bancard, rv.datos.debito_pausado, (await opDe(cobro.id)).estado, cta.debito_activo, cta.debito_estado, cta.ultimo_error, cta.ultimo_codigo],
      [true, 'revertida', true, 'revertida', true, 'pausado', MOTIVO, null]);
    ok('el mismo día la tarea no toma nada', (await correr()).tomados, 0);
    await pasanDias(R, 1);
    const antes = charges(falso);
    res = await correr();
    ok('y al día siguiente TAMPOCO (antes: otro cobro de 190.000 a la misma tarjeta)', [res.tomados, res.pagados, charges(falso) - antes], [0, 0, 0]);
    const est = (await H.comoUsuario(db, R.uid, () => db.query(`select public.bancard_estado($1,'produccion') j`, [R.empresaId]))).rows[0].j;
    ok('lo que lee la pantalla: pausado, con ese motivo y sin fecha de cobro (ahí dice «te devolvimos el último pago», no «no pudimos cobrar»)',
      [est.debito.estado, est.debito.ultimo_error, est.debito.fecha_cobro, est.tarjeta?.ultimos4], ['pausado', MOTIVO, null, '0016']);

    const mano = await F.cobrarConTarjeta(d, { empresa: R.empresaId, usuario: R.uid, tipo: 'plan', plan: 'pro', periodo: 'mensual', personas: null }, { esperaMs: 2_000 });
    const despues = await cuentaDe(R);
    ok('pagar a mano lo destraba, como cualquier pausado', [mano.estado, despues.debito_estado, despues.ultimo_error, (await sus(R)).efectivo], ['pagada', 'al_dia', null, 'pro']);
    await apagar(R);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('32 · El catastro que falla deja dicho por qué, y el navegador no decide (07/10)');
  // ═══════════════════════════════════════════════════════════
  //
  // Matías probó cinco veces guardar su tarjeta en el ambiente de prueba y la
  // pantalla solo decía «No se pudo guardar la tarjeta.». En el registro quedó
  // «users_cards ok 200» con el detalle vacío: no se sabía cuántas tarjetas
  // devolvió Bancard ni qué contestó el formulario (la pantalla lo tiraba).
  //
  // Ahora lo que dijo el formulario queda anotado (`catastro_formulario`) y la
  // lista dice cuántas vinieron y con qué `card_id`. Y sigue decidiendo
  // Bancard: un «add_new_card_success» que manda el navegador no guarda nada,
  // y un «add_new_card_fail» no impide guardar la que Bancard sí lista.
  {
    const Fm = require('../.compilado/bancard-formulario.js');
    const { d, falso, registro } = armar('produccion');
    const K = await H.montarEmpresa(db, { email: 'cedula@negocio.test', nombre: 'Cédula Mal SA' });
    /** Los eventos de una tarjeta, con el detalle ordenado por clave (jsonb no guarda el orden). */
    const eventosDeTarjeta = async (id) => (await db.query(
      'select tipo, ok, clave, http, detalle from public.bancard_eventos where tarjeta_id = $1 order by id', [id])).rows
      .map((e) => [e.tipo, e.ok, e.clave, e.http, Object.entries(e.detalle).sort()]);
    const delFormulario = async (id) => (await J(
      `select count(*)::int n from public.bancard_eventos where tarjeta_id = $1 and tipo = 'catastro_formulario'`, [id])).n;
    const pedir = async (c = K) => {
      const r = await F.iniciarCatastro(d, { empresa: c.empresaId, usuario: c.uid, telefono: '0981123456', consentimiento });
      if (r.estado !== 'listo') throw new Error(`no se pudo pedir el catastro: ${JSON.stringify(r)}`);
      return r;
    };

    // Bancard rechaza el catastro adentro del iframe (en pruebas: la cédula no es la que acepta).
    const r1 = await pedir();
    const v1 = await F.verificarTarjeta(d, {
      tarjeta: r1.tarjeta, empresa: K.empresaId,
      formulario: { mensaje: 'add_new_card_fail', detalle: 'Los datos ingresados no son correctos' },
    });
    ok('catastro rechazado en el formulario: no se guarda y queda fallida, como antes',
      [v1.guardada, v1.motivo, (await tarjetaDe(r1.tarjeta)).estado, (await cuentaDe(K)).tarjeta_id], [false, 'no_esta', 'fallida', null]);
    ok('y ahora se sabe por qué: quedó lo que dijo el formulario (con su descripción) y que Bancard listó cero tarjetas',
      await eventosDeTarjeta(r1.tarjeta),
      [
        ['cards_new', true, null, 200, []],
        ['catastro_formulario', false, 'add_new_card_fail', null, [['descripcion', 'Los datos ingresados no son correctos']]],
        ['users_cards', true, null, 200, [['cuantas', 0], ['ids', '']]],
      ]);

    // El navegador miente: manda «éxito» y Bancard no tiene la tarjeta.
    const r2 = await pedir();
    falso.pedidos.length = 0;
    const v2 = await F.verificarTarjeta(d, {
      tarjeta: r2.tarjeta, empresa: K.empresaId, formulario: { mensaje: 'add_new_card_success', detalle: '' },
    });
    ok('un «add_new_card_success» que manda el navegador NO alcanza: no se guarda, queda fallida y sin tarjeta para el débito',
      [v2.guardada, v2.motivo, (await tarjetaDe(r2.tarjeta)).estado, (await cuentaDe(K)).tarjeta_id], [false, 'no_esta', 'fallida', null]);
    ok('se le preguntó igual a Bancard (un users_cards), y quedó anotado lo que dijo cada uno',
      [rutas(falso).map(simple), (await eventosDeTarjeta(r2.tarjeta)).slice(1)],
      [['users_cards'], [
        ['catastro_formulario', true, 'add_new_card_success', null, []],
        ['users_cards', true, null, 200, [['cuantas', 0], ['ids', '']]],
      ]]);

    // El catastro sale bien: guardada como siempre.
    const r3 = await pedir();
    falso.completarCatastro(r3.processId, { marca: 'Visa', enmascarado: '4000********0016', vencimiento: '12/30' });
    const v3 = await F.verificarTarjeta(d, {
      tarjeta: r3.tarjeta, empresa: K.empresaId, formulario: { mensaje: 'add_new_card_success', detalle: '' },
    });
    ok('con el catastro bien: guardada como antes, con marca y últimos cuatro, y es la del débito',
      [v3.guardada, v3.marca, v3.ultimos4, v3.ya, (await tarjetaDe(r3.tarjeta)).estado, Number((await cuentaDe(K)).tarjeta_id), (await cuentaDe(K)).debito_activo],
      [true, 'Visa', '0016', false, 'activa', r3.tarjeta, true]);
    ok('y la lista quedó anotada con cuántas vinieron y su card_id',
      (await eventosDeTarjeta(r3.tarjeta)).slice(1),
      [
        ['catastro_formulario', true, 'add_new_card_success', null, []],
        ['users_cards', true, null, 200, [['cuantas', 1], ['ids', String(r3.tarjeta)]]],
      ]);

    // Al revés: el formulario dice que falló y Bancard la tiene. Decide Bancard.
    const r4 = await pedir();
    falso.completarCatastro(r4.processId, { marca: 'MasterCard', enmascarado: '5400********0014', vencimiento: '08/30' });
    falso.pedidos.length = 0;
    const v4 = await F.verificarTarjeta(d, {
      tarjeta: r4.tarjeta, empresa: K.empresaId, formulario: { mensaje: 'add_new_card_fail', detalle: 'Tarjeta inválida' },
    });
    ok('y al revés: el formulario dice «falló» pero Bancard la lista → guardada (y la anterior, quitada)',
      [v4.guardada, v4.ultimos4, (await tarjetaDe(r4.tarjeta)).estado, (await tarjetaDe(r3.tarjeta)).estado], [true, '0014', 'activa', 'quitada']);
    ok('con dos tarjetas en Bancard, el detalle trae las dos («101,104»)',
      (await eventosDeTarjeta(r4.tarjeta)).slice(1),
      [
        ['catastro_formulario', false, 'add_new_card_fail', null, [['descripcion', 'Tarjeta inválida']]],
        ['users_cards', true, null, 200, [['cuantas', 2], ['ids', `${r3.tarjeta},${r4.tarjeta}`]]],
      ]);

    // Sin formulario (la conciliación, la tarea diaria): no se inventa nada.
    const v4b = await F.verificarTarjeta(d, { tarjeta: r4.tarjeta, empresa: K.empresaId });
    ok('sin formulario no se anota ningún `catastro_formulario` (y verificar sigue siendo idempotente)',
      [v4b.guardada, v4b.ya, await delFormulario(r4.tarjeta)], [true, true, 1]);

    // Nadie anota sobre la tarjeta de otra cuenta, ni con basura en lugar de textos.
    const vAjena = await F.verificarTarjeta(d, {
      tarjeta: r4.tarjeta, empresa: A.empresaId, formulario: { mensaje: 'add_new_card_success', detalle: 'de otra cuenta' },
    });
    ok('otra cuenta no puede dejar nada anotado sobre una tarjeta ajena', [vAjena.guardada, vAjena.motivo, await delFormulario(r4.tarjeta)], [false, 'ajena', 1]);
    await F.verificarTarjeta(d, { tarjeta: r4.tarjeta, empresa: K.empresaId, formulario: 'add_new_card_success' });
    await F.verificarTarjeta(d, { tarjeta: r4.tarjeta, empresa: K.empresaId, formulario: { mensaje: 5, detalle: { a: 1 } } });
    ok('lo que no son textos no se anota', await delFormulario(r4.tarjeta), 1);

    // Lo que llega sucio (el navegador puede mandar cualquier cosa) se anota limpio y corto.
    // En otra cuenta: una cuenta puede pedir hasta cinco catastros por día.
    const K2 = await H.montarEmpresa(db, { email: 'sucio@negocio.test', nombre: 'Sucio SRL' });
    const r5 = await pedir(K2);
    await F.verificarTarjeta(d, {
      tarjeta: r5.tarjeta, empresa: K2.empresaId,
      formulario: { mensaje: 'x'.repeat(300), detalle: `<b>Rechazada</b> <script>alert(1)</script> 4000 1234 5678 9010 ${'y'.repeat(400)}` },
    });
    const sucio = (await J(`select clave, detalle from public.bancard_eventos where tarjeta_id = $1 and tipo = 'catastro_formulario'`, [r5.tarjeta]));
    ok('sucio y largo: la clave en 80, la descripción en 200, sin etiquetas y sin nada que parezca un número de tarjeta',
      [sucio.clave.length, sucio.detalle.descripcion.length, /[<>]/.test(sucio.detalle.descripcion), /[0-9]{4}/.test(sucio.detalle.descripcion),
        sucio.detalle.descripcion.startsWith('Rechazada alert(1) … yyy')],
      [80, 200, false, false, true]);

    // Nada de la tarjeta ni de las claves en lo que se anotó.
    const pedidas = [r1, r2, r3, r4, r5];
    const aliasUsados = falso.pedidos.map((p) => p.cuerpo?.operation?.alias_token).filter(Boolean);
    const anotado = JSON.stringify((await db.query(
      'select * from public.bancard_eventos where tarjeta_id = any($1::bigint[])', [pedidas.map((r) => r.tarjeta)])).rows) + registro.join('\n');
    ok('en esos eventos no quedó el número enmascarado, el vencimiento, un alias, el process_id ni la clave',
      [aliasUsados.length >= 1, anotado.includes('4000****'), anotado.includes('5400****'), anotado.includes('12/30'), anotado.includes('08/30'),
        /alias/i.test(anotado), aliasUsados.some((a) => anotado.includes(a)), pedidas.some((r) => anotado.includes(r.processId)), anotado.includes(CLAVE)],
      [true, false, false, false, false, false, false, false, false]);

    // La lectura de lo que avisa el formulario, sola.
    ok('como lo manda la librería al responseHandler: { message, details, return_url }',
      Fm.leerLoQueDijoElFormulario({ message: 'add_new_card_fail', details: 'Cédula inválida', return_url: `${SITIO}/plan/tarjeta/101` }),
      { mensaje: 'add_new_card_fail', detalle: 'Cédula inválida' });
    ok('como lo nombra el manual y llega en la dirección de vuelta: { status, description }',
      [Fm.leerLoQueDijoElFormulario({ status: 'add_new_card_success', description: null }),
        Fm.leerLoQueDijoElFormulario({ status: 'add_new_card_fail', description: 'No se pudo catastrar' })],
      [{ mensaje: 'add_new_card_success', detalle: '' }, { mensaje: 'add_new_card_fail', detalle: 'No se pudo catastrar' }]);
    ok('como texto JSON, y lo que ya leyó Orden ({ mensaje, detalle }) vuelve a pasar igual',
      [Fm.leerLoQueDijoElFormulario('{"message":"payment_fail","details":"Sin fondos"}'),
        Fm.leerLoQueDijoElFormulario({ mensaje: 'add_new_card_fail', detalle: 'Cédula inválida' })],
      [{ mensaje: 'payment_fail', detalle: 'Sin fondos' }, { mensaje: 'add_new_card_fail', detalle: 'Cédula inválida' }]);
    ok('lo que no es texto, o no trae nada, es null',
      [null, undefined, 7, 'hola', '', {}, [{ message: 'x' }], { message: 5, details: { a: 1 } }, { message: '   ', details: '<br>' }, 'z'.repeat(5000)]
        .map((v) => Fm.leerLoQueDijoElFormulario(v)),
      [null, null, null, null, null, null, null, null, null, null]);
    ok('cada texto se recorta a 200 y queda en una línea',
      (() => {
        const l = Fm.leerLoQueDijoElFormulario({ message: 'm'.repeat(999), details: `uno\n\tdos\u0000tres ${'d'.repeat(999)}` });
        return [l.mensaje.length, l.detalle.length, l.detalle.startsWith('uno dos tres ddd')];
      })(), [200, 200, true]);
    ok('a la persona se le muestra la descripción y, si no vino, el estado',
      [Fm.textoDeLoQueDijo({ mensaje: 'add_new_card_fail', detalle: 'Cédula inválida' }), Fm.textoDeLoQueDijo({ mensaje: 'add_new_card_fail', detalle: '' }),
        Fm.textoDeLoQueDijo(null), Fm.textoDeLoQueDijo(undefined)],
      ['Cédula inválida', 'add_new_card_fail', '', '']);
    ok('el estado que cuenta como «éxito» del catastro es el del manual', Fm.CATASTRO_CON_EXITO, 'add_new_card_success');
  }

  console.log(`\n${corridas - fallos}/${corridas} comprobaciones del pago ocasional con Bancard.`);
  if (fallos > 0) {
    console.log(`${fallos} fallaron.`);
    process.exit(1);
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
