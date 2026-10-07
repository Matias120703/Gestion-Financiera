/**
 * Bancard en la base (migraciones 124, 125 y 126, 02/10/2026).
 *
 * Matías: que las suscripciones se paguen con tarjeta y QR por Bancard, y
 * que en el Premium «el propietario elige cuántos funcionarios va a querer,
 * y de acuerdo a eso aparece el precio».
 *
 * En orden de importancia:
 *
 *   1. NADIE ACTIVA UN PLAN SIN PAGAR, NI PAGA DE MENOS: el importe sale de
 *      una sola función de la base, se congela en la operación y la
 *      confirmación lo compara; otro importe no activa nada.
 *   2. NADIE PAGA DOS VECES NI SE ACTIVA DOS VECES: una operación viva por
 *      cuenta, y la misma confirmación repetida no toca nada.
 *   3. EL PREMIUM QUEDA CON LAS PERSONAS QUE SE PAGARON.
 *   4. EL 18 % DEL PRIMER MES ES DEL PRIMER PAGO, una vez.
 *   5. LA PLATA DE MENTIRA (staging) no anota ingreso, no paga comisión y no
 *      cuenta como «ya pagó».
 *   6. REVERTIR deshace lo que el pago activó, y «deshacer el último cambio»
 *      ya no se come un pago con tarjeta.
 *   7. UN VENDEDOR NO VE NADA de plata ni de tarjetas, y nadie con sesión
 *      puede llamar a lo que escribe.
 *   8. DE LA RESPUESTA DE BANCARD SE GUARDA LO JUSTO, y a la persona nunca se
 *      le devuelve el número de autorización ni el código (lo prohíbe el
 *      manual).
 *
 * El débito automático (la tarea diaria) está en bancard-cobros.test.js.
 *
 * Lee `.compilado/cotizacion.js` (lo arma `probar:bancard` con tsc).
 */
const fs = require('fs');
const path = require('path');
const H = require('./ayuda-db.js');
const { recalcular } = require('../.compilado/cotizacion.js');

const RAIZ = path.join(__dirname, '..');
const MIGRACIONES = [
  'supabase/migrations/124_bancard_precio_y_tablas.sql',
  'supabase/migrations/125_bancard_pagos.sql',
  'supabase/migrations/126_bancard_reloj_y_avisos.sql',
];

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

function rechazado(nombre, resultado, fragmento) {
  corridas++;
  if (resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      NO fue rechazada (devolvió ${JSON.stringify(resultado.valor && resultado.valor.rows)})`);
    return;
  }
  if (fragmento && !new RegExp(fragmento, 'i').test(resultado.error)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      rechazada por otro motivo: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${resultado.error.slice(0, 80)}`);
}

// CRLF normalizado: en un worktree de Windows los fuentes llegan con \r\n.
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');

/** Lo que Bancard manda de un pago aprobado (con lo que NO se tiene que guardar). */
const aprobada = (op, importe, extra = {}) => ({
  token: 'f'.repeat(32),
  shop_process_id: String(op),
  response: 'S',
  response_details: 'Procesado Satisfactoriamente',
  extended_response_description: 'APROBADA POR EL EMISOR',
  currency: 'PYG',
  amount: `${importe}.00`,
  authorization_number: '654321',
  ticket_number: '2117960079',
  response_code: '00',
  response_description: 'Transaccion aprobada',
  security_information: { customer_ip: '190.128.0.1', card_source: 'L', card_country: 'PARAGUAY', version: '0.3', risk_index: '0' },
  ...extra,
});

const rechazo = (op, importe, codigo = '51', descripcion = 'NO APROBADA-INSUF.DE FONDOS', extra = {}) => ({
  ...aprobada(op, importe),
  response: 'N',
  response_code: codigo,
  response_description: descripcion,
  authorization_number: null,
  ...extra,
});

/** Todas las claves de un JSON, a cualquier profundidad. */
function claves(v, juntas = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => claves(x, juntas));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) { juntas.add(k); claves(x, juntas); }
  }
  return juntas;
}

async function principal() {
  const db = await H.crearBase();

  // ---- las ayudas, sobre esta base
  const J = async (sql, p) => (await db.query(sql, p)).rows[0];
  /** Como el servidor: rol service_role, sin sesión. */
  const S = async (sql, p) => (await H.comoServicio(db, () => db.query(sql, p))).rows[0]?.j;
  const intentoS = (sql, p) => H.intentarComo(db, 'service_role', null, () => db.query(sql, p));
  /** Como una persona con sesión. */
  const U = async (uid, sql, p) => (await H.comoUsuario(db, uid, () => db.query(sql, p))).rows[0]?.j;
  const intentoU = (uid, sql, p) => H.intentar(db, uid, () => db.query(sql, p));

  const crear = (c, entorno, tipo, medio, plan, periodo, personas, uid = c.uid) =>
    S('select public.bancard_crear_operacion($1,$2,$3,$4,$5,$6,$7,$8) j',
      [c.empresaId, uid, entorno, tipo, medio, plan, periodo, personas]);
  const intentoCrear = (c, entorno, tipo, medio, plan, periodo, personas, uid = c.uid) =>
    intentoS('select public.bancard_crear_operacion($1,$2,$3,$4,$5,$6,$7,$8) j',
      [c.empresaId, uid, entorno, tipo, medio, plan, periodo, personas]);
  const confirmar = (op, respuesta, fuente = 'confirmacion') =>
    S('select public.bancard_confirmar($1,$2,$3) j', [op, respuesta, fuente]);
  /** Crear y pagar de una. */
  const pagar = async (c, entorno, plan, periodo, personas) => {
    const o = await crear(c, entorno, 'plan', 'formulario', plan, periodo, personas);
    const r = await confirmar(o.operacion, aprobada(o.operacion, o.importe));
    return { ...o, r };
  };

  const sus = (c) => J(
    `select plan, estado, periodo, moneda, importe::float as importe, proveedor_pago, tope_vendedores,
            periodo_fin::text as fin, public.plan_efectivo_calculado(empresa_id) as efectivo
       from public.suscripciones where empresa_id = $1`, [c.empresaId]);
  const opDe = (id) => J('select * from public.bancard_operaciones where id = $1', [id]);
  const precio = async (c, plan, periodo, personas) =>
    (await J('select public.precio_de_la_cuenta($1,$2,$3,$4) j', [c.empresaId, plan, periodo, personas])).j;
  const cotizar = (c, plan, periodo, personas, uid = c.uid) =>
    U(uid, 'select public.cotizar_plan($1,$2,$3,$4) j', [c.empresaId, plan, periodo, personas]);

  /** Carga un movimiento en cada uno de esos días (0 = hoy, 1 = ayer…). */
  async function cargar(c, haceDias) {
    for (const d of haceDias) {
      await db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
         values ($1, 'gasto', public.hoy_empresa($1) - $2::int, 'Algo', 'Otros', 1000, 1000)`, [c.empresaId, d]);
    }
  }
  /** La suscripción como si la cuenta hubiera nacido hace N días, con la prueba de su tipo. */
  async function nacio(c, haceDias) {
    await db.query(
      `update public.suscripciones s
          set created_at  = now() - make_interval(days => $2::int),
              prueba_fin  = now() - make_interval(days => $2::int) + make_interval(days => public.dias_de_prueba(e.tipo_cuenta)),
              periodo_fin = now() - make_interval(days => $2::int) + make_interval(days => public.dias_de_prueba(e.tipo_cuenta))
         from public.empresas e
        where s.empresa_id = $1 and e.id = s.empresa_id`, [c.empresaId, haceDias]);
  }
  const rango = (n) => Array.from({ length: n }, (_, i) => i);

  // ---- la administración, la empresa de Orden y un socio
  const jefe = await H.montarEmpresa(db, { email: 'matias@orden.test', nombre: 'Orden SA' });
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe.uid]);
  await H.comoUsuario(db, jefe.uid, () => db.query('select public.definir_empresa_orden($1)', [jefe.empresaId]));
  await db.query(`insert into public.socios (nombre, codigo, activo) values ('Socio Uno', 'SOCIO1', true), ('Socio Dos', 'SOCIO2', true)`);
  const referir = (c, codigo = 'SOCIO1') =>
    H.comoUsuario(db, jefe.uid, () => db.query('select public.asignar_referido($1,$2,$3)', [c.empresaId, codigo, '']));
  const cobrarAMano = (c, plan, importe, vendedores = null, meses = 1) =>
    U(jefe.uid, 'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5,$6) j', [c.empresaId, plan, meses, '', importe, vendedores]);
  const ingresos = async (frag) => (await db.query(
    `select descripcion, monto::float as monto, metodo_pago, estado::text as estado, creado_por
       from public.movimientos where empresa_id = $1 and tipo = 'ingreso' and descripcion like $2 order by created_at`,
    [jefe.empresaId, `%${frag}%`])).rows;
  const comisionDe = async (c) => (await db.query(
    `select base::float as base, monto::float as monto, importe::float as importe, estado, movimiento_id
       from public.comisiones where empresa_id = $1`, [c.empresaId])).rows;
  const registroDe = async (c, accion) => (await db.query(
    `select accion, actor_id, detalle from public.registro_admin
      where empresa_id = $1 and ($2::text is null or accion = $2) order by created_at`, [c.empresaId, accion ?? null])).rows;
  const yaPago = async (c) => (await J('select public.cuenta_ya_pago($1) j', [c.empresaId])).j;

  // ═══════════════════════════════════════════════════════════
  grupo('1 · El precio: una sola fuente, con sus reglas');
  // ═══════════════════════════════════════════════════════════
  const A = await H.montarEmpresa(db, { email: 'a@negocio.test', nombre: 'Despensa Sur' });
  {
    ok('personas_incluidas_premium() es la constante de la pantalla',
      [(await J('select public.personas_incluidas_premium() n')).n,
        Number((leer('src/lib/constantes.ts').match(/export const PERSONAS_INCLUIDAS_PREMIUM = (\d+);/) ?? [])[1])],
      [4, 4]);
    ok('el año se cobra por 11 meses; el redondeo es al guaraní',
      [(await J("select public.meses_que_se_cobran('anual') n")).n, (await J("select public.meses_que_se_cobran('mensual') n")).n,
        Number((await J('select public.redondeo_de_cobro(66600.4) n')).n), Number((await J('select public.redondeo_de_cobro(723287.67) n')).n)],
      [11, 1, 66600, 723288]);

    const p4 = await cotizar(A, 'negocio', 'mensual', 4);
    ok('Premium con 4 personas, por mes: Gs. 250.000 (las 4 vienen en el precio)',
      [p4.total, p4.lista, p4.extras, p4.personas_extra, p4.personas_incluidas, p4.moneda], [250000, 250000, 0, 0, 4, 'PYG']);
    const p6 = await cotizar(A, 'negocio', 'mensual', 6);
    ok('con 6: Premium 250.000 + 2 personas más × 60.000 = 370.000 (el ejemplo de Matías)',
      [p6.lista, p6.personas_extra, p6.precio_por_persona, p6.extras, p6.total], [250000, 2, 60000, 120000, 370000]);
    ok('con 15, el tope del plan: 910.000', (await cotizar(A, 'negocio', 'mensual', 15)).total, 910000);
    const a6 = await cotizar(A, 'negocio', 'anual', 6);
    ok('el año con 6: todo por 11 meses, 12 de servicio → 4.070.000',
      [a6.lista, a6.extras, a6.total, a6.meses_cobrados, a6.meses_de_servicio], [2750000, 1320000, 4070000, 11, 12]);
    ok('Básico 110.000 y 1.210.000; Pro 190.000 y 2.090.000',
      [(await cotizar(A, 'basico', 'mensual', null)).total, (await cotizar(A, 'basico', 'anual', null)).total,
        (await cotizar(A, 'pro', 'mensual', null)).total, (await cotizar(A, 'pro', 'anual', null)).total],
      [110000, 1210000, 190000, 2090000]);
    ok('un plan sin cantidad de personas no las trae',
      [(await cotizar(A, 'pro', 'mensual', null)).personas, (await cotizar(A, 'pro', 'mensual', null)).personas_min], [null, null]);
    ok('sin descuento: no hay fase, y dice que es el primer pago',
      [p6.descuento_fase, p6.descuento, p6.descuento_porcentaje, p6.primer_pago], [null, 0, 0, true]);
    ok('la referencia en dólares acompaña: 42 + 2 × 11 = 64', [p4.referencia_usd, p6.referencia_usd], [42, 64]);
    ok('y dice hasta cuándo queda activo: un mes después del fin de la prueba',
      (await J(`select ($1::timestamptz = s.periodo_fin + interval '1 month') as v
                  from public.suscripciones s where s.empresa_id = $2`, [p6.vence_hasta, A.empresaId])).v, true);

    // ---- los rechazos
    rechazado('Premium con 3 personas (menos de las incluidas)',
      await intentoU(A.uid, 'select public.cotizar_plan($1,$2,$3,$4)', [A.empresaId, 'negocio', 'mensual', 3]), 'entre 4 y 15');
    rechazado('Premium con 16 (más que el tope)',
      await intentoU(A.uid, 'select public.cotizar_plan($1,$2,$3,$4)', [A.empresaId, 'negocio', 'mensual', 16]), 'entre 4 y 15');
    rechazado('Premium sin decir cuántas',
      await intentoU(A.uid, 'select public.cotizar_plan($1,$2,$3,$4)', [A.empresaId, 'negocio', 'mensual', null]), 'cuántas personas');
    rechazado('Pro con cantidad de personas',
      await intentoU(A.uid, 'select public.cotizar_plan($1,$2,$3,$4)', [A.empresaId, 'pro', 'mensual', 5]), 'no lleva cantidad');
    rechazado('un plan que no existe',
      await intentoU(A.uid, 'select public.cotizar_plan($1,$2,$3,$4)', [A.empresaId, 'oro', 'mensual', null]), 'Plan desconocido');
    rechazado('gratis no se cotiza',
      await intentoU(A.uid, 'select public.cotizar_plan($1,$2,$3,$4)', [A.empresaId, 'gratis', 'mensual', null]), 'Plan desconocido');
    rechazado('un período que no existe',
      await intentoU(A.uid, 'select public.cotizar_plan($1,$2,$3,$4)', [A.empresaId, 'pro', 'semanal', null]), 'período de cobro');

    const clases = await H.montarEmpresa(db, { email: 'profe@clases.test', nombre: 'Clases de inglés', rubro: 'clases' });
    rechazado('un plan fuera de su rubro (clases solo tiene Básico)',
      await intentoU(clases.uid, 'select public.cotizar_plan($1,$2,$3,$4)', [clases.empresaId, 'negocio', 'mensual', 4]), 'no está disponible para tu rubro');
    ok('y el de su rubro, sí', (await cotizar(clases, 'basico', 'mensual', null)).total, 110000);
    // …salvo que ya lo tenga pago: la lista de un rubro puede cambiar.
    await cobrarAMano(clases, 'pro', 190000);
    ok('el plan que ya paga se puede renovar aunque su rubro no lo ofrezca',
      (await cotizar(clases, 'pro', 'mensual', null)).total, 190000);

    const persona = await H.montarEmpresa(db, { email: 'yo@persona.test', nombre: 'Mis gastos', tipoCuenta: 'personal' });
    rechazado('una cuenta personal con Premium',
      await intentoU(persona.uid, 'select public.cotizar_plan($1,$2,$3,$4)', [persona.empresaId, 'negocio', 'mensual', 4]), 'no está disponible');
    ok('el Pro personal: 40.000 y 440.000',
      [(await cotizar(persona, 'pro', 'mensual', null)).total, (await cotizar(persona, 'pro', 'anual', null)).total], [40000, 440000]);

    // ---- no menos personas que el equipo de hoy
    const equipo = await H.montarEmpresa(db, { email: 'duenio@equipo.test', nombre: 'Ferretería Centro' });
    await cobrarAMano(equipo, 'negocio', null);
    for (let i = 0; i < 5; i++) await H.sumarMiembro(db, equipo.empresaId, `vend${i}@equipo.test`);
    rechazado('con 6 personas en el equipo no se puede pagar por 5',
      await intentoU(equipo.uid, 'select public.cotizar_plan($1,$2,$3,$4)', [equipo.empresaId, 'negocio', 'mensual', 5]), 'entre 6 y 15');
    const pe = await cotizar(equipo, 'negocio', 'mensual', 6);
    ok('por 6 sí, y la cotización dice el mínimo', [pe.total, pe.personas_min, pe.miembros], [370000, 6, 6]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('2 · El descuento: la prueba, la constancia y el espejo de la pantalla');
  // ═══════════════════════════════════════════════════════════
  // B juntó los 20 días seguidos de su prueba: 18 % en su primer pago.
  const B = await H.montarEmpresa(db, { email: 'b@negocio.test', nombre: 'Kiosco Norte' });
  await nacio(B, 19);
  await cargar(B, rango(20));
  // C ya paga (por transferencia) y lleva 30 días seguidos: 5 % de constancia.
  const C = await H.montarEmpresa(db, { email: 'c@negocio.test', nombre: 'Librería Sol' });
  await cobrarAMano(C, 'negocio', 310000, 4);
  await cargar(C, rango(30));
  // P, cuenta personal, juntó sus 8 días: 5 %.
  const P = await H.montarEmpresa(db, { email: 'p@persona.test', nombre: 'Gastos de Pedro', tipoCuenta: 'personal' });
  await nacio(P, 7);
  await cargar(P, rango(8));
  {
    const dueno = await U(B.uid, 'select public.descuento_por_racha($1) j', [B.empresaId]);
    ok('descuento_por_racha contesta lo de siempre: fase prueba, 20 de 20, 18 %',
      [dueno.fase, dueno.objetivo, dueno.mejor, dueno.logrado, Number(dueno.porcentaje), dueno.vigente, dueno.faltan],
      ['prueba', 20, 20, true, 18, true, 0]);
    ok('y es, letra por letra, lo que dice la interna',
      dueno, (await J('select public.descuento_de_la_cuenta($1) j', [B.empresaId])).j);
    const vend = await H.sumarMiembro(db, B.empresaId, 'vend@kiosco.test');
    rechazado('un vendedor sigue sin poder verlo',
      await intentoU(vend, 'select public.descuento_por_racha($1)', [B.empresaId]), 'due[nñ]o');
    rechazado('el servidor sin sesión sigue sin poder llamar a descuento_por_racha',
      await intentoS('select public.descuento_por_racha($1)', [B.empresaId]), 'permission denied');
    rechazado('ni a la interna directo',
      await intentoS('select public.descuento_de_la_cuenta($1)', [B.empresaId]), 'permission denied');
    rechazado('ni a precio_de_la_cuenta directo',
      await intentoS('select public.precio_de_la_cuenta($1,$2,$3,$4)', [B.empresaId, 'pro', 'mensual', null]), 'permission denied');
    // …pero al iniciar un pago, la cadena de funciones llega: se ve en el grupo 3.

    const b6 = await cotizar(B, 'negocio', 'mensual', 6);
    ok('Premium con 6 y el 18 % de la prueba: descuento 66.600 (sobre el mes con sus personas), total 303.400',
      [b6.descuento_fase, b6.descuento_porcentaje, b6.descuento_base, b6.descuento, b6.total, b6.primer_pago],
      ['prueba', 18, 370000, 66600, 303400, true]);
    const b6a = await cotizar(B, 'negocio', 'anual', 6);
    ok('el año con 6 y el 18 %: el descuento es sobre UN mes → 4.003.400',
      [b6a.subtotal, b6a.descuento, b6a.total], [4070000, 66600, 4003400]);
    ok('Pro con el 18 %: 190.000 − 34.200', (await cotizar(B, 'pro', 'mensual', null)).total, 155800);

    const pp = await cotizar(P, 'pro', 'mensual', null);
    ok('el Pro personal con su 5 %: 38.000', [pp.descuento_fase, pp.descuento_porcentaje, pp.descuento, pp.total], ['prueba', 5, 2000, 38000]);

    const c6 = await precio(C, 'negocio', 'mensual', 6);
    ok('quien ya paga y lleva 30 días seguidos: 5 % de constancia → 370.000 − 18.500',
      [c6.descuento_fase, c6.descuento_porcentaje, c6.descuento, c6.total, c6.primer_pago], ['constancia', 5, 18500, 351500, false]);

    // ---- el espejo de la pantalla: 12 cantidades × 2 períodos × 3 casos
    for (const [nombre, cuenta, fase] of [['sin descuento', A, null], ['con el de la prueba', B, 'prueba'], ['con la constancia', C, 'constancia']]) {
      for (const periodo of ['mensual', 'anual']) {
        const base = await precio(cuenta, 'negocio', periodo, 4);
        const distintas = [];
        const totales = [];
        for (let n = 4; n <= 15; n++) {
          const deLaBase = await precio(cuenta, 'negocio', periodo, n);
          const espejo = recalcular(base, n);
          totales.push(deLaBase.total);
          for (const k of Object.keys(deLaBase)) {
            if (JSON.stringify(deLaBase[k]) !== JSON.stringify(espejo[k])) distintas.push(`${n} personas · ${k}: base ${deLaBase[k]}, pantalla ${espejo[k]}`);
          }
        }
        ok(`recalcular() da lo mismo que la base de 4 a 15 personas · ${nombre} · ${periodo}`,
          [base.descuento_fase, distintas], [fase, []]);
        ok(`  y el precio sube con cada persona (${periodo}, ${nombre})`,
          totales.every((t, i) => i === 0 || t > totales[i - 1]), true);
      }
    }
    const b4 = await precio(B, 'negocio', 'mensual', 4);
    ok('el espejo acomoda una cantidad fuera de rango en vez de inventar un precio',
      [recalcular(b4, 2).personas, recalcular(b4, 99).personas, recalcular(b4, 99).total], [4, 15, (await precio(B, 'negocio', 'mensual', 15)).total]);
    const proB = await precio(B, 'pro', 'mensual', null);
    ok('y a un plan sin personas no le cambia nada', recalcular(proB, 9), proB);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Iniciar un pago: quién, y una sola operación viva');
  // ═══════════════════════════════════════════════════════════
  const vendedorA = await H.sumarMiembro(db, A.empresaId, 'vendedor@despensa.test');
  const adminA = await H.sumarMiembro(db, A.empresaId, 'admin@despensa.test', 'admin');
  const ajeno = await H.montarEmpresa(db, { email: 'otro@negocio.test', nombre: 'Otro negocio' });
  let opA;
  {
    rechazado('un vendedor no puede iniciar un pago',
      await intentoCrear(A, 'staging', 'plan', 'formulario', 'pro', 'mensual', null, vendedorA), 'Solo el dueño de la cuenta puede pagar');
    rechazado('el dueño de OTRA cuenta, tampoco',
      await intentoCrear(A, 'staging', 'plan', 'formulario', 'pro', 'mensual', null, ajeno.uid), 'Solo el dueño de la cuenta puede pagar');
    rechazado('sin persona no hay pago (eso es solo de la tarea diaria)',
      await intentoCrear(A, 'staging', 'plan', 'formulario', 'pro', 'mensual', null, null), 'Solo el dueño de la cuenta puede pagar');
    rechazado('un entorno, un tipo o un medio que no existen',
      await intentoCrear(A, 'pruebas', 'plan', 'formulario', 'pro', 'mensual', null), 'no es válido');
    rechazado('  (tipo)', await intentoCrear(A, 'staging', 'regalo', 'formulario', 'pro', 'mensual', null), 'no es válido');
    rechazado('  (medio)', await intentoCrear(A, 'staging', 'plan', 'efectivo', 'pro', 'mensual', null), 'no es válido');
    rechazado('las validaciones del precio también frenan acá',
      await intentoCrear(A, 'staging', 'plan', 'formulario', 'negocio', 'mensual', 3), 'entre 4 y 15');
    ok('y nada de eso dejó una operación', (await J('select count(*)::int n from public.bancard_operaciones')).n, 0);

    opA = await crear(A, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 6);
    ok('el dueño inicia: el número de pedido arranca en 1.000.001 y el importe sale de la base',
      [opA.operacion, opA.importe, opA.moneda, opA.descripcion, opA.reusada, opA.desglose.total, opA.desglose.personas],
      [1000001, 370000, 'PYG', 'Orden Premium', false, 370000, 6]);
    const fila = await opDe(opA.operacion);
    ok('la operación guarda todo lo elegido, congelado',
      [fila.estado, fila.tipo, fila.medio, fila.origen, fila.plan, fila.periodo, fila.personas, fila.entorno,
        Number(fila.lista), Number(fila.extras), Number(fila.descuento), Number(fila.importe), fila.usuario_id === A.uid],
      ['creada', 'plan', 'formulario', 'usuario', 'negocio', 'mensual', 6, 'produccion', 250000, 120000, 0, 370000, true]);
    ok('las descripciones entran en los 20 caracteres de Bancard, en ASCII',
      (await db.query(`select public.bancard_descripcion(t, p) d from (values ('plan','basico'),('plan','pro'),('plan','negocio'),('personas','negocio')) v(t, p)`))
        .rows.map((r) => [r.d, r.d.length <= 20, /^[ -~]+$/.test(r.d)]),
      [['Orden Basico', true, true], ['Orden Pro', true, true], ['Orden Premium', true, true], ['Orden mas personas', true, true]]);

    // Doble clic ANTES de que Bancard conteste: todavía no hay process_id.
    const otra = await crear(A, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 6);
    ok('la misma llamada sin process_id todavía: avisa que hay una viva, no crea otra',
      otra, { viva: 1000001, medio: 'formulario', estado: 'creada' });

    ok('guardar el process_id que dio Bancard',
      await S('select public.bancard_guardar_proceso($1,$2) j', [opA.operacion, 'pf*0001abcdef']), { ok: true });
    const misma = await crear(A, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 6);
    ok('ahora la misma llamada devuelve LA MISMA operación, con su process_id (doble clic, cerrar y abrir)',
      [misma.operacion, misma.reusada, misma.process_id, misma.importe], [1000001, true, 'pf*0001abcdef', 370000]);
    ok('otra cantidad de personas: no es la misma → viva',
      await crear(A, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 7), { viva: 1000001, medio: 'formulario', estado: 'creada' });
    ok('otro plan → viva',
      await crear(A, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null), { viva: 1000001, medio: 'formulario', estado: 'creada' });
    const delAdmin = await crear(A, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 6, adminA);
    ok('lo mismo pero pedido por OTRA persona de la cuenta: viva, y sin el process_id del otro',
      [delAdmin, 'process_id' in delAdmin], [{ viva: 1000001, medio: 'formulario', estado: 'creada' }, false]);
    ok('sigue habiendo una sola operación', (await J('select count(*)::int n from public.bancard_operaciones')).n, 1);
    rechazado('y el índice no deja meter una segunda viva ni a mano',
      await H.intentarComo(db, 'postgres', null, () => db.query(
        `insert into public.bancard_operaciones (empresa_id, entorno, tipo, medio, origen, plan, periodo, desglose, lista, importe, descripcion)
         values ($1,'produccion','plan','formulario','usuario','pro','mensual','{}',190000,190000,'Orden Pro')`, [A.empresaId])),
      'bancard_operaciones_una_viva');

    // Pasados 10 minutos ya no se reusa: el servidor la resuelve primero.
    await db.query(`update public.bancard_operaciones set created_at = now() - interval '11 minutes' where id = $1`, [opA.operacion]);
    ok('a los 11 minutos ya no se reusa', await crear(A, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 6),
      { viva: 1000001, medio: 'formulario', estado: 'creada' });
    await db.query(`update public.bancard_operaciones set created_at = now() where id = $1`, [opA.operacion]);

    ok('lo que lee el servidor de una operación: sin process_id ni respuesta',
      [await S('select public.bancard_operacion_interna($1) j', [opA.operacion]).then((x) => Object.keys(x).sort()),
        await S('select public.bancard_operacion_interna($1) j', [424242])],
      [['card_id', 'consulta_hace', 'consultas', 'empresa_id', 'entorno', 'estado', 'importe', 'medio', 'minutos', 'operacion', 'origen', 'tipo', 'user_id'], undefined]);

    // El freno de abuso: 20 operaciones por día.
    const abusa = await H.montarEmpresa(db, { email: 'abusa@negocio.test', nombre: 'Muchos clics' });
    for (let i = 0; i < 20; i++) {
      const o = await crear(abusa, 'staging', 'plan', 'formulario', 'pro', 'mensual', null);
      await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"abandonada"}') j`, [o.operacion]);
    }
    rechazado('la operación número 21 del día',
      await intentoCrear(abusa, 'staging', 'plan', 'formulario', 'pro', 'mensual', null), 'Demasiados intentos hoy');
    ok('y las 20 quedaron vencidas con su motivo',
      (await db.query(`select estado, motivo, count(*)::int n from public.bancard_operaciones where empresa_id = $1 group by 1, 2`, [abusa.empresaId])).rows,
      [{ estado: 'vencida', motivo: 'abandonada', n: 20 }]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Confirmar: el único lugar donde un pago activa un plan');
  // ═══════════════════════════════════════════════════════════
  {
    await referir(A);
    const antes = await sus(A);
    ok('antes de pagar: en prueba, sin tope, sin moneda', [antes.plan, antes.estado, antes.tope_vendedores, antes.moneda], ['pro', 'prueba', null, null]);

    // ---- otro importe: NO activa
    const mal = await confirmar(opA.operacion, aprobada(opA.operacion, 1));
    ok('una confirmación aprobada por Gs. 1: no activa', [mal.ok, mal.motivo], [false, 'importe']);
    ok('queda incierta y para revisar, y la cuenta igual que antes',
      [(await opDe(opA.operacion)).estado, (await opDe(opA.operacion)).revisar, (await sus(A)).estado, (await sus(A)).fin === antes.fin],
      ['incierta', 'Bancard confirmó otro importe o moneda', 'prueba', true]);
    const usd = await confirmar(opA.operacion, aprobada(opA.operacion, opA.importe, { currency: 'USD' }));
    ok('ni el mismo número en otra moneda', [usd.ok, usd.motivo, (await sus(A)).estado], [false, 'importe', 'prueba']);
    const basura = await confirmar(opA.operacion, aprobada(opA.operacion, opA.importe, { amount: '370000.00; drop table' }));
    ok('ni un importe que no es un número', [basura.ok, basura.motivo], [false, 'importe']);
    ok('una respuesta que no dice ni S ni N (la del 3D Secure, toda vacía) no toca nada',
      [(await confirmar(opA.operacion, { response: null, response_code: null, process_id: 'x' })).motivo, (await opDe(opA.operacion)).estado],
      ['sin_respuesta', 'incierta']);
    rechazado('una fuente que no existe',
      await intentoS('select public.bancard_confirmar($1,$2,$3)', [opA.operacion, aprobada(opA.operacion, opA.importe), 'navegador']), 'no es válido');
    ok('un pedido que Orden no creó: no lanza, dice «desconocida»',
      await confirmar(424242, aprobada(424242, 100)), { ok: false, motivo: 'desconocida' });

    // ---- el importe correcto, como lo manda la consulta
    const r1 = await confirmar(opA.operacion, aprobada(opA.operacion, opA.importe), 'consulta');
    ok('la confirmación con el importe de la operación: aprobada, primera vez',
      [r1.ok, r1.aprobada, r1.ya, r1.plan, r1.periodo, r1.personas, r1.importe, r1.entorno, r1.conflicto],
      [true, true, false, 'negocio', 'mensual', 6, 370000, 'produccion', false]);
    ok('trae a quién avisarle (dueño y administradores, no el vendedor) y la comisión que nació',
      [r1.destinatarios.map((d) => d.email).sort(), r1.comision.monto, r1.comision.nombre, r1.nombre],
      [['a@negocio.test', 'admin@despensa.test'], 125000, 'Socio Uno', 'Despensa Sur']);

    const despues = await sus(A);
    ok('la cuenta queda activa en Premium, en guaraníes, por Bancard',
      [despues.plan, despues.estado, despues.periodo, despues.moneda, despues.importe, despues.proveedor_pago, despues.efectivo],
      ['negocio', 'activa', 'mensual', 'PYG', 370000, 'bancard', 'negocio']);
    ok('CON LAS PERSONAS QUE PAGÓ: tope 5 vendedores (6 con el dueño), no las 15 del plan',
      [despues.tope_vendedores, (await J('select public.tope_de_miembros($1) n', [A.empresaId])).n], [5, 6]);
    ok('pagar en la prueba no le come días: el mes se suma después del fin de la prueba',
      (await J(`select ($1::timestamptz = $2::timestamptz + interval '1 month') v`, [despues.fin, antes.fin])).v, true);

    const ing = await ingresos(`Bancard ${opA.operacion}`);
    ok('el cobro quedó anotado en las finanzas de Orden: bruto, con tarjeta, hecho por el sistema',
      ing, [{ descripcion: `Suscripción Despensa Sur · Bancard ${opA.operacion}`, monto: 370000, metodo_pago: 'tarjeta', estado: 'activo', creado_por: null }]);
    const com = await comisionDe(A);
    ok('la comisión nació una vez: la mitad de un mes de lista del Premium (250.000), sin las personas extra',
      com.map((c) => [c.base, c.monto, c.importe, c.estado, c.movimiento_id !== null]), [[250000, 125000, 370000, 'por_pagar', true]]);
    const fila = await opDe(opA.operacion);
    ok('y quedó atada a ese ingreso (si se anula, la comisión se cae sola)',
      [com[0].movimiento_id === fila.ingreso_id, fila.comision_id !== null], [true, true]);
    const reg = await registroDe(A, 'cambiar_plan');
    ok('el registro guarda el renglón «cambiar_plan» con su importe, hecho por el sistema, vía Bancard',
      reg.map((r) => [r.actor_id, r.detalle.plan_antes, r.detalle.plan_despues, r.detalle.estado_antes, r.detalle.estado_despues,
        r.detalle.importe, r.detalle.meses, r.detalle.tope_antes, r.detalle.tope_despues, r.detalle.via, r.detalle.operacion,
        r.detalle.nota, r.detalle.ingreso_id === fila.ingreso_id]),
      [[null, 'pro', 'negocio', 'prueba', 'activa', 370000, 1, null, 5, 'bancard', opA.operacion, `Bancard · pedido ${opA.operacion}`, true]]);
    ok('la operación quedó pagada, con su fuente, la foto de antes y hasta cuándo dejó la cuenta',
      [fila.estado, fila.fuente, fila.antes.plan, fila.antes.estado, fila.antes.tope_vendedores, fila.confirmada_at !== null,
        (await J('select ($1::timestamptz = $2::timestamptz) v', [fila.vence_despues, despues.fin])).v],
      ['pagada', 'consulta', 'pro', 'prueba', null, true, true]);
    ok('el «revisar» del importe equivocado quedó (alguien mandó otra cosa antes): lo ve la administración',
      fila.revisar, 'Bancard confirmó otro importe o moneda');
    ok('«ya pagó» ahora es un hecho', await yaPago(A), true);

    // ---- usar_codigo_referido ya ve el pago
    const sinSocio = await H.montarEmpresa(db, { email: 'sinsocio@negocio.test', nombre: 'Sin socio' });
    await pagar(sinSocio, 'produccion', 'pro', 'mensual', null);
    rechazado('una cuenta que pagó por Bancard ya no puede canjear un código de socio',
      await intentoU(sinSocio.uid, 'select public.usar_codigo_referido($1,$2)', [sinSocio.empresaId, 'SOCIO2']), 'ya pagó');
    ok('y pagó sin socio: sin comisión, con ingreso', [(await comisionDe(sinSocio)).length, (await ingresos('Sin socio')).length], [0, 1]);
    ok('Pro no lleva tope propio: vale el de su plan (3)',
      [(await sus(sinSocio)).tope_vendedores, (await J('select public.tope_de_miembros($1) n', [sinSocio.empresaId])).n], [null, 3]);

    // ---- LA MISMA CONFIRMACIÓN, OTRA VEZ (y otra): no toca nada
    const foto = async () => JSON.stringify([
      await sus(A), await ingresos(`Bancard ${opA.operacion}`), await comisionDe(A), (await registroDe(A)).length,
      (await opDe(opA.operacion)).confirmada_at,
    ]);
    const f1 = await foto();
    const r2 = await confirmar(opA.operacion, aprobada(opA.operacion, opA.importe), 'confirmacion');
    const r3 = await confirmar(opA.operacion, aprobada(opA.operacion, opA.importe), 'charge');
    ok('la segunda y la tercera dicen «ya»', [[r2.ok, r2.ya, r2.aprobada], [r3.ok, r3.ya, r3.aprobada]], [[true, true, true], [true, true, true]]);
    ok('y no avisan de nuevo: no traen destinatarios ni comisión', ['destinatarios' in r2, 'comision' in r2], [false, false]);
    ok('una sola activación, un ingreso, una comisión, un renglón, la misma fecha', await foto(), f1);
    ok('ni un rechazo que llegue después la desactiva',
      [(await confirmar(opA.operacion, rechazo(opA.operacion, opA.importe))).ya, (await opDe(opA.operacion)).estado, await foto() === f1],
      [true, 'pagada', true]);

    // ---- el año
    const anual = await H.montarEmpresa(db, { email: 'anual@negocio.test', nombre: 'Paga el año' });
    await db.query(`update public.suscripciones set periodo_fin = now() - interval '5 days', prueba_fin = now() - interval '5 days' where empresa_id = $1`, [anual.empresaId]);
    const oa = await pagar(anual, 'produccion', 'negocio', 'anual', 4);
    const sa = await sus(anual);
    ok('el año: se cobran 11 meses (2.750.000) y queda período anual',
      [oa.importe, sa.periodo, sa.plan, sa.estado, sa.tope_vendedores], [2750000, 'anual', 'negocio', 'activa', 3]);
    ok('con la prueba ya vencida arranca hoy: 12 meses de servicio desde ahora',
      (await J(`select ($1::timestamptz between now() + interval '12 months' - interval '1 minute' and now() + interval '12 months') v`, [sa.fin])).v, true);
    ok('el renglón dice 12 meses', (await registroDe(anual, 'cambiar_plan'))[0].detalle.meses, 12);

    // ---- pagar por adelantado suma
    const antesDeRenovar = (await sus(sinSocio)).fin;
    const reno = await pagar(sinSocio, 'produccion', 'pro', 'mensual', null);
    ok('renovar antes de que venza suma otro mes al final (no se le comen días)',
      [(await J(`select ($1::timestamptz = $2::timestamptz + interval '1 month') v`, [(await sus(sinSocio)).fin, antesDeRenovar])).v, reno.r.aprobada],
      [true, true]);

    // ---- Básico
    const basico = await H.montarEmpresa(db, { email: 'basico@negocio.test', nombre: 'Solo yo' });
    const ob = await pagar(basico, 'produccion', 'basico', 'mensual', null);
    ok('Básico: 110.000, activa, sin tope propio (una persona, la del plan)',
      [ob.importe, (await sus(basico)).plan, (await sus(basico)).tope_vendedores, (await J('select public.tope_de_miembros($1) n', [basico.empresaId])).n],
      [110000, 'basico', null, 1]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('5 · El primer pago lleva el 18 %; el segundo no; y no vuelve');
  // ═══════════════════════════════════════════════════════════
  {
    // Acá es donde el servidor, sin sesión, llega al descuento por la cadena
    // de funciones (crear → precio_de_la_cuenta → descuento_de_la_cuenta).
    const o1 = await crear(B, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 6);
    ok('primer pago de B: el servidor sin sesión cotiza con el 18 % → 303.400',
      [o1.importe, o1.desglose.descuento_fase, o1.desglose.descuento, Number((await opDe(o1.operacion)).descuento)],
      [303400, 'prueba', 66600, 66600]);
    await referir(B);
    await confirmar(o1.operacion, aprobada(o1.operacion, 303400));
    ok('la comisión: la mitad de un mes de lista, aunque haya pagado con descuento',
      (await comisionDe(B)).map((c) => [c.base, c.monto, c.importe]), [[250000, 125000, 303400]]);

    const q2 = await cotizar(B, 'negocio', 'mensual', 6);
    ok('el segundo pago ya no lleva el 18 %: 370.000 (y la constancia todavía no la juntó: 20 de 30)',
      [q2.descuento_fase, q2.descuento, q2.total, q2.primer_pago], [null, 0, 370000, false]);

    // La administración le corta el servicio: la racha de la prueba sigue
    // «lograda» en los hechos, y antes de la 124 el 18 % reaparecía.
    await cobrarAMano(B, 'gratis', null);
    const dCortada = (await J('select public.descuento_de_la_cuenta($1) j', [B.empresaId])).j;
    const q3 = await cotizar(B, 'negocio', 'mensual', 6);
    ok('cuenta que pagó y fue cortada: los hechos dicen «prueba lograda», pero el 18 % NO vuelve',
      [(await sus(B)).estado, dCortada.fase, dCortada.logrado, q3.descuento_fase, q3.total, q3.primer_pago],
      ['vencida', 'prueba', true, null, 370000, false]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Rechazos, reintentos en el mismo formulario y pagos que llegan tarde');
  // ═══════════════════════════════════════════════════════════
  const D = await H.montarEmpresa(db, { email: 'd@negocio.test', nombre: 'Verdulería Luna' });
  {
    const antes = await sus(D);
    const o = await crear(D, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    const r = await confirmar(o.operacion, rechazo(o.operacion, o.importe, '05', 'NO APROBADO'));
    ok('un rechazo: no activa, y dice por qué con el texto de Bancard',
      [r.ok, r.aprobada, r.ya, r.descripcion, r.clase, (await opDe(o.operacion)).estado, (await sus(D)).estado, (await sus(D)).fin === antes.fin],
      [true, false, false, 'NO APROBADO', 'otro', 'rechazada', 'prueba', true]);
    ok('un rechazo no deja ingreso, ni renglón, ni «ya pagó»',
      [(await ingresos('Verdulería')).length, (await registroDe(D)).length, await yaPago(D)], [0, 0, false]);
    ok('el mismo rechazo otra vez: «ya», sin tocar nada',
      [(await confirmar(o.operacion, rechazo(o.operacion, o.importe, '05', 'NO APROBADO'))).ya, (await opDe(o.operacion)).estado], [true, 'rechazada']);

    // La persona prueba otra tarjeta ADENTRO del mismo formulario y pasa.
    const r2 = await confirmar(o.operacion, aprobada(o.operacion, o.importe), 'consulta');
    ok('rechazada → pagada si después Bancard dice aprobada (reintento en el mismo formulario)',
      [r2.aprobada, r2.ya, (await opDe(o.operacion)).estado, (await sus(D)).estado, (await opDe(o.operacion)).revisar],
      [true, false, 'pagada', 'activa', null]);

    // ---- un pago que entra tarde, sobre una operación que Orden ya venció
    const tarde = await H.montarEmpresa(db, { email: 'tarde@negocio.test', nombre: 'Paga tarde' });
    const ot = await crear(tarde, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [ot.operacion]);
    const rt = await confirmar(ot.operacion, aprobada(ot.operacion, ot.importe), 'consulta');
    ok('vencida → pagada: la plata entró, el plan se activa, y queda para que lo mire la administración',
      [rt.aprobada, (await opDe(ot.operacion)).estado, (await sus(tarde)).estado, (await opDe(ot.operacion)).revisar],
      [true, 'pagada', 'activa', 'Pago que entró tarde, sobre una operación ya vencida']);

    // ---- una aprobación vieja de OTRO plan no le baja el plan a nadie
    const lio = await H.montarEmpresa(db, { email: 'lio@negocio.test', nombre: 'Dos pagos cruzados' });
    const viejo = await crear(lio, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [viejo.operacion]);
    await pagar(lio, 'produccion', 'negocio', 'mensual', 8);
    const finPremium = (await sus(lio)).fin;
    const cruzado = await confirmar(viejo.operacion, aprobada(viejo.operacion, viejo.importe), 'confirmacion');
    ok('un pago viejo de Pro que entra con el Premium ya activo: NO le baja el plan ni las personas',
      [cruzado.aprobada, cruzado.conflicto, (await sus(lio)).plan, (await sus(lio)).tope_vendedores, (await sus(lio)).fin === finPremium],
      [true, true, 'negocio', 7, true]);
    ok('la plata se anota igual y queda para resolver a mano',
      [(await opDe(viejo.operacion)).estado, (await opDe(viejo.operacion)).revisar, (await ingresos('Dos pagos cruzados')).length],
      ['pagada', 'Pagó un plan distinto del que tiene activo: resolver a mano', 2]);

    // ---- cerrar sin respuesta de pago: la máquina de estados
    const m = await H.montarEmpresa(db, { email: 'maquina@negocio.test', nombre: 'Estados' });
    const o1 = await crear(m, 'staging', 'plan', 'formulario', 'pro', 'mensual', null);
    ok('creada → en_3ds guarda el process_id',
      [await S(`select public.bancard_cerrar_operacion($1,'en_3ds','{"process_id":"pf*3ds"}') j`, [o1.operacion]),
        (await opDe(o1.operacion)).process_id], [{ ok: true, cambio: true, estado: 'en_3ds' }, 'pf*3ds']);
    ok('en_3ds → incierta no existe: no cambia',
      await S(`select public.bancard_cerrar_operacion($1,'incierta','{}') j`, [o1.operacion]), { ok: true, cambio: false, estado: 'en_3ds' });
    ok('en_3ds sigue siendo «viva»: no deja iniciar otra',
      await crear(m, 'staging', 'plan', 'formulario', 'pro', 'mensual', null), { viva: o1.operacion, medio: 'formulario', estado: 'en_3ds' });
    ok('en_3ds → vencida', (await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [o1.operacion])).estado, 'vencida');
    ok('sobre una vencida, cerrar de nuevo no hace nada',
      await S(`select public.bancard_cerrar_operacion($1,'incierta','{}') j`, [o1.operacion]), { ok: true, cambio: false, estado: 'vencida' });
    const o2 = await crear(m, 'staging', 'plan', 'formulario', 'pro', 'mensual', null);
    ok('creada → incierta → vencida',
      [(await S(`select public.bancard_cerrar_operacion($1,'incierta','{}') j`, [o2.operacion])).estado,
        (await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [o2.operacion])).estado], ['incierta', 'vencida']);
    const o3 = await pagar(m, 'staging', 'pro', 'mensual', null);
    ok('sobre una pagada, cerrar no hace nada',
      [await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [o3.operacion]), (await opDe(o3.operacion)).estado],
      [{ ok: true, cambio: false, estado: 'pagada' }, 'pagada']);
    rechazado('no se puede «cerrar» a pagada: eso es solo de bancard_confirmar',
      await intentoS(`select public.bancard_cerrar_operacion($1,'pagada','{}')`, [o2.operacion]), 'no es válido');
    ok('guardar un process_id en una que ya no está creada: no',
      await S('select public.bancard_guardar_proceso($1,$2) j', [o3.operacion, 'otro']), { ok: false });
    ok('una nota para la administración',
      [await S('select public.bancard_marcar_revisar($1,$2) j', [o2.operacion, 'Bancard avisó una reversa']), (await opDe(o2.operacion)).revisar],
      [{ ok: true }, 'Bancard avisó una reversa']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Staging: plata de mentira');
  // ═══════════════════════════════════════════════════════════
  const T = await H.montarEmpresa(db, { email: 'certificador@bancard.test', nombre: 'Cuenta de prueba Bancard' });
  {
    await referir(T);
    const o = await pagar(T, 'staging', 'negocio', 'anual', 5);
    const s = await sus(T);
    ok('un pago de staging ACTIVA el plan de la cuenta de prueba, con sus personas y su período',
      [o.r.aprobada, s.plan, s.estado, s.periodo, s.tope_vendedores, s.efectivo], [true, 'negocio', 'activa', 'anual', 4, 'negocio']);
    ok('pero NO anota ingreso en las finanzas de Orden', (await ingresos('Cuenta de prueba Bancard')).length, 0);
    ok('NO genera comisión (aunque la cuenta tenga socio)', [(await comisionDe(T)).length, o.r.comision], [0, null]);
    ok('su renglón se llama «bancard_prueba», no «cambiar_plan»',
      (await registroDe(T)).filter((r) => r.accion !== 'asignar_referido').map((r) => [r.accion, r.detalle.via, r.detalle.importe]),
      [['bancard_prueba', 'bancard', 3410000]]);
    ok('y NO cuenta como «ya pagó»', await yaPago(T), false);
    ok('la operación guarda que fue de staging, sin ingreso ni comisión',
      [(await opDe(o.operacion)).entorno, (await opDe(o.operacion)).ingreso_id, (await opDe(o.operacion)).comision_id], ['staging', null, null]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Revertir un pago, y «deshacer el último cambio»');
  // ═══════════════════════════════════════════════════════════
  {
    const revertir = (op, actor, motivo, comprobar = false, sinBancard = false) =>
      intentoS('select public.bancard_revertir($1,$2,$3,$4,$5) j', [op, actor, motivo, comprobar, sinBancard]);

    // E: paga y se revierte el mismo día.
    const E = await H.montarEmpresa(db, { email: 'e@negocio.test', nombre: 'Panadería Trigo' });
    await referir(E);
    const antes = await sus(E);
    const o = await pagar(E, 'produccion', 'negocio', 'mensual', 5);
    ok('E pagó: activa, comisión por pagar, ingreso activo',
      [(await sus(E)).estado, (await comisionDe(E)).map((c) => c.estado), (await ingresos('Panadería Trigo')).map((i) => i.estado)],
      ['activa', ['por_pagar'], ['activo']]);

    rechazado('el dueño de la cuenta no puede revertir (no es de la administración)',
      await revertir(o.operacion, E.uid, 'me arrepentí'), 'administración de Orden');
    rechazado('sin actor, tampoco', await revertir(o.operacion, null, 'x'), 'administración de Orden');
    rechazado('un pago que no existe', await revertir(424242, jefe.uid, 'x'), 'Ese pago no existe');
    const sinPagar = await crear(ajeno, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    rechazado('una operación que no está aprobada', await revertir(sinPagar.operacion, jefe.uid, 'x'), 'no está aprobado');

    const comprobar = await revertir(o.operacion, jefe.uid, '', true);
    ok('«solo comprobar» dice que se puede y NO toca nada',
      [comprobar.valor.rows[0].j, (await opDe(o.operacion)).estado, (await sus(E)).estado], [{ puede: true }, 'pagada', 'activa']);

    const rev = (await revertir(o.operacion, jefe.uid, 'Prueba de reversa para la lista de tests')).valor.rows[0].j;
    ok('revertir: vuelve al plan y al estado de antes, anula el ingreso y borra la comisión',
      [rev.ok, rev.plan, rev.estado, rev.ingreso_anulado, rev.comision], [true, 'pro', 'prueba', true, 'borrada']);
    const s = await sus(E);
    ok('la suscripción quedó EXACTAMENTE como antes del pago',
      [s.plan, s.estado, s.periodo, s.moneda, s.importe, s.proveedor_pago, s.tope_vendedores, s.fin],
      [antes.plan, antes.estado, antes.periodo, antes.moneda, antes.importe, antes.proveedor_pago, antes.tope_vendedores, antes.fin]);
    ok('y el espejo empresas.plan también', (await J('select plan from public.empresas where id = $1', [E.empresaId])).plan, 'pro');
    ok('el ingreso no se borró: quedó anulado, con quién y por qué',
      (await db.query(`select estado::text as estado, anulado_por, motivo_anulacion from public.movimientos where id = $1`, [(await opDe(o.operacion)).ingreso_id])).rows,
      [{ estado: 'anulado', anulado_por: jefe.uid, motivo_anulacion: `Se revirtió el pago de Bancard ${o.operacion}` }]);
    ok('la comisión se fue (no quedó anulada ocupando el lugar)', (await comisionDe(E)).length, 0);
    const fila = await opDe(o.operacion);
    ok('la operación quedó revertida, con quién, cuándo y el motivo',
      [fila.estado, fila.revertida_por, fila.revertida_at !== null, fila.motivo],
      ['revertida', jefe.uid, true, 'Prueba de reversa para la lista de tests']);
    ok('el renglón del pago quedó marcado como deshecho, y hay uno de la reversa',
      (await registroDe(E)).filter((r) => r.accion !== 'asignar_referido').map((r) => [r.accion, r.detalle.deshecho ?? null, r.actor_id]),
      [['cambiar_plan', true, null], ['bancard_reversa', null, jefe.uid]]);
    ok('y «ya pagó» vuelve a ser falso: el próximo pago es otra vez el primero', await yaPago(E), false);
    rechazado('revertir dos veces', await revertir(o.operacion, jefe.uid, 'x'), 'no está aprobado');

    // Una aprobación que llega sobre la revertida NO activa.
    const sobre = await confirmar(o.operacion, aprobada(o.operacion, o.importe));
    ok('una aprobación sobre una operación revertida: no activa, queda para revisar',
      [sobre.ok, sobre.motivo, (await sus(E)).estado, (await opDe(o.operacion)).estado, (await opDe(o.operacion)).revisar],
      [false, 'revertida', 'prueba', 'revertida', 'Aprobación sobre una operación revertida']);

    // Un pago de verdad después de la reversa vuelve a generar la comisión.
    const o2 = await pagar(E, 'produccion', 'negocio', 'mensual', 5);
    ok('un pago posterior vuelve a generar la comisión del socio',
      (await comisionDe(E)).map((c) => [c.monto, c.estado, c.movimiento_id !== null]), [[125000, 'por_pagar', true]]);

    // ---- al día siguiente
    await db.query(`update public.bancard_operaciones set confirmada_at = confirmada_at - interval '1 day' where id = $1`, [o2.operacion]);
    rechazado('al día siguiente Bancard ya no revierte: se tramita por el portal',
      await revertir(o2.operacion, jefe.uid, 'tarde'), 'Ya pasó el día del pago');
    ok('y la cuenta sigue activa', (await sus(E)).estado, 'activa');
    const sinB = await revertir(o2.operacion, jefe.uid, 'Anulado por el portal de comercios', false, true);
    ok('con «ya lo anulé por el portal» sí se marca, y deshace lo mismo',
      [sinB.ok, sinB.valor?.rows[0].j.estado, (await sus(E)).estado, (await comisionDe(E)).length], [true, 'prueba', 'prueba', 0]);

    // ---- una comisión que ya se le pagó al socio no se toca
    const F = await H.montarEmpresa(db, { email: 'f@negocio.test', nombre: 'Carnicería Don Tito' });
    await referir(F);
    const of = await pagar(F, 'produccion', 'pro', 'mensual', null);
    const comF = (await db.query('select id from public.comisiones where empresa_id = $1', [F.empresaId])).rows[0].id;
    await U(jefe.uid, 'select public.marcar_comision_pagada($1,$2::numeric,$3,$4) j', [comF, null, 'transferencia', '']);
    const rf = (await revertir(of.operacion, jefe.uid, 'x')).valor.rows[0].j;
    ok('si la comisión ya se pagó, la reversa la deja y lo dice',
      [rf.comision, (await comisionDe(F)).map((c) => c.estado)], ['ya_pagada', ['pagada']]);

    // ---- con cambios posteriores
    const G = await H.montarEmpresa(db, { email: 'g@negocio.test', nombre: 'Taller Rueda' });
    const og1 = await pagar(G, 'produccion', 'pro', 'mensual', null);
    const og2 = await pagar(G, 'produccion', 'pro', 'mensual', null);
    rechazado('revertir un pago cuando después hubo otro',
      await revertir(og1.operacion, jefe.uid, 'x'), 'hubo otros cambios en la cuenta');
    ok('el último sí se puede', (await revertir(og2.operacion, jefe.uid, '', true)).valor.rows[0].j, { puede: true });
    await cobrarAMano(G, 'pro', 190000);
    rechazado('y si después la administración activó por transferencia, tampoco',
      await revertir(og2.operacion, jefe.uid, 'x'), 'hubo otros cambios en la cuenta');

    // ---- deshacer_ultimo_cambio: el caso de la sonda
    // Transferencia y después tarjeta: «deshacer» rebobinaba al estado de
    // antes de la transferencia y se comía el período pagado con tarjeta.
    const Hh = await H.montarEmpresa(db, { email: 'h@negocio.test', nombre: 'Bazar Estrella' });
    await cobrarAMano(Hh, 'pro', 190000);
    await pagar(Hh, 'produccion', 'pro', 'mensual', null);
    const fotoH = JSON.stringify([await sus(Hh), await ingresos('Bazar Estrella'), (await registroDe(Hh)).length]);
    rechazado('«deshacer el último cambio» sobre un pago de Bancard se niega',
      await intentoU(jefe.uid, 'select public.deshacer_ultimo_cambio($1)', [Hh.empresaId]), 'pago con Bancard');
    ok('y no tocó nada: ni la fecha, ni los ingresos, ni el registro',
      JSON.stringify([await sus(Hh), await ingresos('Bazar Estrella'), (await registroDe(Hh)).length]), fotoH);
    // Un pago de staging después de una transferencia: tampoco se deshace por detrás.
    const I = await H.montarEmpresa(db, { email: 'i@negocio.test', nombre: 'Mercería Hilo' });
    await cobrarAMano(I, 'pro', 190000);
    await pagar(I, 'staging', 'pro', 'mensual', null);
    rechazado('ni cuando el último renglón es una transferencia pero después hubo un pago de Bancard (staging)',
      await intentoU(jefe.uid, 'select public.deshacer_ultimo_cambio($1)', [I.empresaId]), 'pago con Bancard');
    // Y lo de siempre sigue andando.
    const K = await H.montarEmpresa(db, { email: 'k@negocio.test', nombre: 'Sin Bancard' });
    await cobrarAMano(K, 'pro', 190000);
    const dk = await intentoU(jefe.uid, 'select public.deshacer_ultimo_cambio($1) j', [K.empresaId]);
    ok('deshacer una transferencia, sin Bancard de por medio, anda como siempre',
      [dk.ok, dk.valor?.rows[0].j.estado, dk.valor?.rows[0].j.ingreso_anulado], [true, 'prueba', true]);
    rechazado('y un cliente sigue sin poder usarlo',
      await intentoU(K.uid, 'select public.deshacer_ultimo_cambio($1)', [K.empresaId]), 'administración de Orden');
  }

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Cambiar la cantidad de personas del Premium');
  // ═══════════════════════════════════════════════════════════
  {
    const L = await H.montarEmpresa(db, { email: 'l@negocio.test', nombre: 'Distribuidora Río' });
    await pagar(L, 'produccion', 'negocio', 'mensual', 6);
    // Le faltan exactamente 15 días.
    await db.query(`update public.suscripciones set periodo_fin = now() + interval '15 days' where empresa_id = $1`, [L.empresaId]);
    const finL = (await sus(L)).fin;

    const pr = await U(L.uid, 'select public.cotizar_personas($1,$2) j', [L.empresaId, 8]);
    ok('sumar de 6 a 8 con 15 días por delante: 2 × 60.000 × 15/30 = 60.000',
      [pr.personas_antes, pr.personas, pr.personas_sumadas, pr.dias_restantes, pr.dias_del_periodo, pr.importe, pr.total],
      [6, 8, 2, 15, 30, 60000, 60000]);
    rechazado('«sumar» a las mismas que ya tiene',
      await intentoU(L.uid, 'select public.cotizar_personas($1,$2)', [L.empresaId, 6]), 'Ya tenés esa cantidad');
    rechazado('o a menos', await intentoU(L.uid, 'select public.cotizar_personas($1,$2)', [L.empresaId, 5]), 'Ya tenés esa cantidad');
    rechazado('o a más del tope', await intentoU(L.uid, 'select public.cotizar_personas($1,$2)', [L.empresaId, 16]), 'entre 7 y 15');

    // En el año: sobre 365 días y por los 11 meses que se cobran.
    await db.query(`update public.suscripciones set periodo = 'anual', periodo_fin = now() + interval '200 days' where empresa_id = $1`, [L.empresaId]);
    ok('en un plan anual, a 200 días: 2 × 660.000 × 200/365 = 723.288',
      (await U(L.uid, 'select public.cotizar_personas($1,$2) j', [L.empresaId, 8])).importe, 723288);
    await db.query(`update public.suscripciones set periodo = 'mensual', periodo_fin = $2::timestamptz where empresa_id = $1`, [L.empresaId, finL]);

    // Renovar un Premium vigente es por lo que tiene.
    rechazado('renovar el Premium vigente con OTRA cantidad no va por el pago del plan',
      await intentoCrear(L, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 9), 'Sumar personas');
    rechazado('ni cambiar de plan con días pagos',
      await intentoCrear(L, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null), 'Tu plan actual está pago hasta el');

    const o = await crear(L, 'produccion', 'personas', 'formulario', null, null, 8);
    ok('la operación de «sumar personas» congela el prorrateo, sobre el plan y el período que tiene',
      [o.importe, o.descripcion, (await opDe(o.operacion)).tipo, (await opDe(o.operacion)).plan, (await opDe(o.operacion)).periodo, (await opDe(o.operacion)).personas],
      [60000, 'Orden mas personas', 'personas', 'negocio', 'mensual', 8]);
    // Si el pago se rechaza, no cambia nada.
    await confirmar(o.operacion, rechazo(o.operacion, o.importe));
    ok('si el pago del prorrateo se rechaza, siguen siendo 6', (await sus(L)).tope_vendedores, 5);
    const o2 = await crear(L, 'produccion', 'personas', 'formulario', null, null, 8);
    const r = await confirmar(o2.operacion, aprobada(o2.operacion, o2.importe));
    ok('al confirmarse sube el tope a 7 vendedores (8 personas) y NO mueve la fecha ni el plan',
      [r.aprobada, (await sus(L)).tope_vendedores, (await sus(L)).fin === finL, (await sus(L)).plan, (await sus(L)).importe],
      [true, 7, true, 'negocio', 370000]);
    ok('queda su renglón «bancard_personas» y su ingreso',
      [(await registroDe(L, 'bancard_personas')).map((x) => [x.detalle.importe, x.detalle.tope_antes, x.detalle.tope_despues, x.detalle.meses]),
        (await ingresos(`Bancard ${o2.operacion}`)).map((i) => i.monto)],
      [[[60000, 5, 7, 0]], [60000]]);
    ok('y desde la próxima renovación paga por 8: 250.000 + 4 × 60.000',
      (await U(L.uid, `select public.bancard_estado($1,'produccion') j`, [L.empresaId])).debito.importe, 490000);

    // ---- bajar: desde la próxima renovación, nunca menos que el equipo
    for (let i = 0; i < 4; i++) await H.sumarMiembro(db, L.empresaId, `emp${i}@rio.test`);
    const vendL = (await db.query(`select user_id from public.miembros where empresa_id = $1 and rol = 'vendedor' limit 1`, [L.empresaId])).rows[0].user_id;
    rechazado('con 5 personas en el equipo no se puede bajar a 4',
      await intentoU(L.uid, 'select public.bancard_bajar_personas($1,$2)', [L.empresaId, 4]), 'menos personas de las que hoy tiene tu equipo');
    rechazado('«bajar» a las mismas o a más no es bajar',
      await intentoU(L.uid, 'select public.bancard_bajar_personas($1,$2)', [L.empresaId, 8]), 'Sumar personas');
    rechazado('un vendedor no puede',
      await intentoU(vendL, 'select public.bancard_bajar_personas($1,$2)', [L.empresaId, 6]), 'Solo el dueño de la cuenta');
    const baja = await U(L.uid, 'select public.bancard_bajar_personas($1,$2) j', [L.empresaId, 6]);
    ok('bajar a 6: no cobra nada, queda programado, y dice cuánto va a pagar',
      [baja, (await sus(L)).tope_vendedores], [{ importe: 370000, contratadas: 8, personas_proxima: 6 }, 7]);
    rechazado('la renovación tiene que ser por la cantidad programada',
      await intentoCrear(L, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 8), 'Sumar personas');
    const renueva = await pagar(L, 'produccion', 'negocio', 'mensual', 6);
    ok('al renovar se aplica la baja (tope 5) y se limpia lo programado',
      [renueva.importe, (await sus(L)).tope_vendedores,
        (await J('select personas_proxima from public.bancard_cuentas where empresa_id = $1', [L.empresaId])).personas_proxima],
      [370000, 5, null]);
    ok('deshacer una baja programada: null',
      [(await U(L.uid, 'select public.bancard_bajar_personas($1,$2) j', [L.empresaId, 5])).personas_proxima,
        (await U(L.uid, 'select public.bancard_bajar_personas($1,$2) j', [L.empresaId, null])).personas_proxima], [5, null]);

    // ---- el Premium viejo «sin número» (activado a mano con 15 por el precio base)
    const viejo = await H.montarEmpresa(db, { email: 'viejo@negocio.test', nombre: 'Premium sin número' });
    await cobrarAMano(viejo, 'negocio', 250000);
    ok('un Premium activado a mano sin número deja entrar 15', (await J('select public.tope_de_miembros($1) n', [viejo.empresaId])).n, 15);
    rechazado('no se le puede «sumar personas»: primero renueva eligiendo cuántas son',
      await intentoU(viejo.uid, 'select public.cotizar_personas($1,$2)', [viejo.empresaId, 8]), 'Primero renová tu plan');
    rechazado('ni «bajar»', await intentoU(viejo.uid, 'select public.bancard_bajar_personas($1,$2)', [viejo.empresaId, 4]), 'Primero renová tu plan');
    await pagar(viejo, 'produccion', 'negocio', 'mensual', 4);
    ok('al renovar por Bancard eligiendo 4, queda con 4: nunca más 15 por 250.000',
      [(await sus(viejo)).tope_vendedores, (await J('select public.tope_de_miembros($1) n', [viejo.empresaId])).n], [3, 4]);

    rechazado('sumar personas en un plan que no es Premium',
      await intentoU(A.uid, 'select public.cotizar_personas($1,$2)', [ajeno.empresaId, 8]), 'due[nñ]o');
    rechazado('  (y siendo el dueño, en Pro)',
      await intentoU(ajeno.uid, 'select public.cotizar_personas($1,$2)', [ajeno.empresaId, 8]), 'no lleva cantidad de personas');
  }

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Las tarjetas guardadas');
  // ═══════════════════════════════════════════════════════════
  const M = await H.montarEmpresa(db, { email: 'm@negocio.test', nombre: 'Heladería Polo' });
  {
    const catastro = (c, uid, entorno, telefono, texto) =>
      intentoS('select public.bancard_crear_catastro($1,$2,$3,$4,$5) j', [c.empresaId, uid, entorno, telefono, texto]);
    const TEXTO = 'Autorizo a Orden a cobrar de esta tarjeta el precio de mi plan en cada renovación, hasta que la quite.';
    const vendM = await H.sumarMiembro(db, M.empresaId, 'vend@heladeria.test');

    rechazado('un vendedor no puede guardar una tarjeta', await catastro(M, vendM, 'staging', '0981123456', TEXTO), 'Solo el dueño de la cuenta');
    rechazado('otra cuenta, tampoco', await catastro(M, ajeno.uid, 'staging', '0981123456', TEXTO), 'Solo el dueño de la cuenta');
    rechazado('sin teléfono (la cuenta no tiene uno): se lo pide', await catastro(M, M.uid, 'staging', null, TEXTO), 'Falta un teléfono');

    const c1 = (await catastro(M, M.uid, 'staging', ' 0981 123456 ', TEXTO)).valor.rows[0].j;
    ok('pedir el catastro: el usuario de Bancard arranca en 5001 y la tarjeta en 101; el correo es el de la persona',
      [c1.user_id >= 5001, c1.card_id >= 101, c1.telefono, c1.email], [true, true, '0981 123456', 'm@negocio.test']);
    const cuenta = await J('select * from public.bancard_cuentas where empresa_id = $1', [M.empresaId]);
    ok('queda guardado el consentimiento: quién, cuándo y qué texto aceptó',
      [cuenta.aceptado_por, cuenta.aceptado_at !== null, cuenta.aceptado_texto, cuenta.debito_activo], [M.uid, true, TEXTO, false]);
    ok('y el teléfono quedó en la ficha: la próxima vez no hace falta escribirlo',
      [(await J('select telefono from public.ficha_cliente where empresa_id = $1', [M.empresaId])).telefono,
        (await catastro(M, M.uid, 'staging', '', TEXTO)).ok], ['0981 123456', true]);
    ok('la tarjeta nace pendiente: todavía no es de nadie',
      [(await J('select estado, marca, ultimos4 from public.bancard_tarjetas where id = $1', [c1.card_id])),
        await S(`select public.bancard_datos_de_tarjeta($1,'staging') j`, [M.empresaId])],
      [{ estado: 'pendiente', marca: null, ultimos4: null }, undefined]);
    rechazado('con una tarjeta pendiente no se puede cobrar «con mi tarjeta»',
      await intentoCrear(M, 'staging', 'plan', 'token', 'pro', 'mensual', null), 'No hay una tarjeta guardada');

    const act = await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j', [c1.card_id, 'Visa', '0016', 'credit']);
    ok('Bancard la tiene: queda activa con marca, últimos 4 y tipo, y el débito prendido',
      [act.ok, act.ya, act.anterior, act.marca, act.ultimos4,
        (await J('select debito_activo, debito_estado, tarjeta_id from public.bancard_cuentas where empresa_id = $1', [M.empresaId]))],
      [true, false, null, 'Visa', '0016', { debito_activo: true, debito_estado: 'al_dia', tarjeta_id: c1.card_id }]);
    ok('activarla otra vez no cambia nada',
      [(await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j', [c1.card_id, 'Otra', '9999', 'debit'])).ya,
        (await J('select marca, ultimos4 from public.bancard_tarjetas where id = $1', [c1.card_id]))],
      [true, { marca: 'Visa', ultimos4: '0016' }]);
    ok('unos «últimos 4» que no son cuatro números no se guardan',
      [(await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j',
        [(await catastro(M, M.uid, 'produccion', '', TEXTO)).valor.rows[0].j.card_id, 'Mastercard', '5418********0014', 'otro'])).ultimos4],
      [null]);
    ok('la tabla no tiene dónde guardar el número, el vencimiento, el código ni el alias',
      (await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'bancard_tarjetas' order by 1`))
        .rows.map((r) => r.column_name),
      ['activada_at', 'bloqueada_hasta', 'creada_por', 'created_at', 'empresa_id', 'entorno', 'estado', 'id', 'marca',
        'motivo', 'pagador_id', 'quitada_at', 'quitada_por', 'tipo', 'ultimos4']);

    // ---- cambiar la tarjeta: la vieja queda por quitar
    const c2 = (await catastro(M, M.uid, 'staging', '', TEXTO)).valor.rows[0].j;
    ok('el usuario de Bancard es el mismo (uno por cuenta y entorno); la tarjeta, otra',
      [c2.user_id === c1.user_id, c2.card_id !== c1.card_id], [true, true]);
    const act2 = await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j', [c2.card_id, 'Mastercard', '0014', 'debit']);
    ok('al activar la nueva, la anterior pasa a «por quitar» y se devuelve para borrarla en Bancard',
      [act2.anterior, (await J('select estado from public.bancard_tarjetas where id = $1', [c1.card_id])).estado], [c1.card_id, 'por_quitar']);
    ok('una sola activa por cuenta y entorno',
      (await db.query(`select entorno, count(*)::int n from public.bancard_tarjetas where empresa_id = $1 and estado = 'activa' group by 1 order by 1`, [M.empresaId])).rows,
      [{ entorno: 'produccion', n: 1 }, { entorno: 'staging', n: 1 }]);
    rechazado('y el índice no deja dos activas ni a mano',
      await H.intentarComo(db, 'postgres', null, () => db.query(`update public.bancard_tarjetas set estado = 'activa' where id = $1`, [c1.card_id])),
      'bancard_tarjetas_una_activa');
    ok('la vieja, ya borrada en Bancard: quitada (lo hace la conciliación, sin persona)',
      [(await S(`select public.bancard_quitar_tarjeta($1,null,'hecho') j`, [c1.card_id])).estado], ['quitada']);
    ok('lo que el servidor necesita para pedirle la tarjeta a Bancard',
      await S(`select public.bancard_datos_de_tarjeta($1,'staging') j`, [M.empresaId]),
      { marca: 'Mastercard', card_id: c2.card_id, user_id: c2.user_id, ultimos4: '0014', tarjeta_id: c2.card_id });

    // ---- un catastro que no se terminó
    const c3 = (await catastro(M, M.uid, 'staging', '', TEXTO)).valor.rows[0].j;
    ok('pendiente → fallida si Bancard no la tiene',
      [await S('select public.bancard_tarjeta_fallida($1,$2) j', [c3.card_id, 'add_new_card_fail']),
        (await J('select estado, motivo from public.bancard_tarjetas where id = $1', [c3.card_id]))],
      [{ ok: true }, { estado: 'fallida', motivo: 'add_new_card_fail' }]);
    ok('marcar fallida una que ya está activa: no', await S('select public.bancard_tarjeta_fallida($1,$2) j', [c2.card_id, 'x']), { ok: false });
    rechazado('seis pedidos de catastro en un día: frena', await catastro(M, M.uid, 'staging', '', TEXTO), 'Demasiados intentos hoy');

    // ---- cobrar con la tarjeta guardada
    const ot = await crear(M, 'staging', 'plan', 'token', 'pro', 'mensual', null);
    ok('la operación con tarjeta guardada trae los dos números para Bancard y guarda cuál tarjeta fue',
      [ot.user_id, ot.card_id, (await opDe(ot.operacion)).medio, Number((await opDe(ot.operacion)).tarjeta_id)],
      [c2.user_id, c2.card_id, 'token', c2.card_id]);
    const rt = await confirmar(ot.operacion, rechazo(ot.operacion, ot.importe, '51', 'NO APROBADA-INSUF.DE FONDOS'), 'charge');
    ok('rechazada por fondos: la clase es «fondos», dice con qué tarjeta, y el débito NO se pausa (la persona estaba delante)',
      [rt.clase, rt.tarjeta, rt.debito_estado, rt.proximo_intento], ['fondos', { marca: 'Mastercard', ultimos4: '0014' }, 'al_dia', null]);
    ok('la cuenta guarda el último error para mostrarlo',
      await J('select ultimo_error, ultimo_codigo from public.bancard_cuentas where empresa_id = $1', [M.empresaId]),
      { ultimo_error: 'NO APROBADA-INSUF.DE FONDOS', ultimo_codigo: '51' });
    for (let i = 0; i < 2; i++) {
      const x = await crear(M, 'staging', 'plan', 'token', 'pro', 'mensual', null);
      await confirmar(x.operacion, rechazo(x.operacion, x.importe), 'charge');
    }
    rechazado('al tercer rechazo en 24 horas con esa tarjeta, frena a la persona (Bancard bloquea a los 7)',
      await intentoCrear(M, 'staging', 'plan', 'token', 'pro', 'mensual', null), 'Probaste varias veces con esta tarjeta');
    ok('pero puede pagar por el formulario (otra tarjeta, QR)',
      (await crear(M, 'staging', 'plan', 'formulario', 'pro', 'mensual', null)).importe, 190000);
    const viva = (await J(`select id from public.bancard_operaciones where empresa_id = $1 and estado = 'creada'`, [M.empresaId])).id;
    const pagoQr = await confirmar(viva, aprobada(viva, 190000));
    ok('y pagar por cualquier medio limpia el error del débito',
      [pagoQr.aprobada, await J('select debito_estado, ultimo_error, intentos from public.bancard_cuentas where empresa_id = $1', [M.empresaId])],
      [true, { debito_estado: 'al_dia', ultimo_error: null, intentos: 0 }]);

    // ---- el bloqueo de 30 días del manual
    await db.query(`update public.bancard_operaciones set created_at = created_at - interval '2 days' where empresa_id = $1`, [M.empresaId]);
    const ob = await crear(M, 'staging', 'plan', 'token', 'pro', 'mensual', null);
    await confirmar(ob.operacion, rechazo(ob.operacion, ob.importe, '05', 'MANDATO MC MAC 03 y 21',
      { extended_response_description: 'INHABILITACIÓN 30 DIAS EN COMERCIO' }), 'charge');
    ok('la respuesta «INHABILITACIÓN 30 DIAS EN COMERCIO» bloquea la tarjeta 30 días y pausa el débito',
      [(await J(`select (bloqueada_hasta between now() + interval '29 days' and now() + interval '31 days') v from public.bancard_tarjetas where id = $1`, [c2.card_id])).v,
        (await J('select debito_estado from public.bancard_cuentas where empresa_id = $1', [M.empresaId])).debito_estado],
      [true, 'pausado']);
    rechazado('con la tarjeta bloqueada no se inicia otro cobro con ella',
      await intentoCrear(M, 'staging', 'plan', 'token', 'pro', 'mensual', null), 'Probaste varias veces con esta tarjeta');
    await db.query('update public.bancard_tarjetas set bloqueada_hasta = null where id = $1', [c2.card_id]);

    // ---- una tarjeta de staging no sirve para cobrar en producción
    await db.query(`update public.bancard_tarjetas set estado = 'quitada' where empresa_id = $1 and entorno = 'produccion'`, [M.empresaId]);
    rechazado('una tarjeta guardada en staging no existe en producción',
      await intentoCrear(M, 'produccion', 'plan', 'token', 'pro', 'mensual', null), 'No hay una tarjeta guardada');

    // ---- quitar la tarjeta: el débito se apaga EN EL PEDIDO
    rechazado('un vendedor no puede quitarla',
      await intentoS(`select public.bancard_quitar_tarjeta($1,$2,'pedido')`, [c2.card_id, vendM]), 'Solo el dueño de la cuenta');
    rechazado('ni el pedido sin persona',
      await intentoS(`select public.bancard_quitar_tarjeta($1,null,'pedido')`, [c2.card_id]), 'Solo el dueño de la cuenta');
    const q1 = await S(`select public.bancard_quitar_tarjeta($1,$2,'pedido') j`, [c2.card_id, M.uid]);
    ok('quitar, paso «pedido»: la tarjeta queda por quitar y el débito YA está apagado (aunque Bancard no conteste)',
      [q1.estado, q1.user_id, q1.card_id,
        await J('select debito_activo, tarjeta_id from public.bancard_cuentas where empresa_id = $1', [M.empresaId])],
      ['por_quitar', c2.user_id, c2.card_id, { debito_activo: false, tarjeta_id: null }]);
    rechazado('desde ese momento no se puede cobrar con ella',
      await intentoCrear(M, 'staging', 'plan', 'token', 'pro', 'mensual', null), 'No hay una tarjeta guardada');
    ok('el pedido repetido no rompe nada', (await S(`select public.bancard_quitar_tarjeta($1,$2,'pedido') j`, [c2.card_id, M.uid])).estado, 'por_quitar');
    const q2 = await S(`select public.bancard_quitar_tarjeta($1,$2,'hecho') j`, [c2.card_id, M.uid]);
    ok('paso «hecho»: quitada, con quién y cuándo',
      [q2.estado, await J('select quitada_por, quitada_at is not null as cuando from public.bancard_tarjetas where id = $1', [c2.card_id])],
      ['quitada', { quitada_por: M.uid, cuando: true }]);
    rechazado('una tarjeta que no existe', await intentoS(`select public.bancard_quitar_tarjeta(424242,$1,'pedido')`, [M.uid]), 'No hay una tarjeta guardada');
    ok('una que quedó fallida y la persona terminó tarde: si Bancard la tiene, se activa',
      [(await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j', [c3.card_id, 'Visa', '0016', 'credit'])).ok,
        (await J('select estado from public.bancard_tarjetas where id = $1', [c3.card_id])).estado], [true, 'activa']);
    ok('y una quitada no revive',
      await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j', [c2.card_id, 'Visa', '0016', 'credit']), { ok: false, motivo: 'quitada' });
  }

  // ═══════════════════════════════════════════════════════════
  grupo('11 · Lo que leen las pantallas');
  // ═══════════════════════════════════════════════════════════
  {
    ok('bancard_acceso: el dueño administra, no es de la administración, y su cuenta no está habilitada',
      await U(A.uid, 'select public.bancard_acceso($1) j', [A.empresaId]), { admin: true, habilitada: false, superadmin: false });
    ok('el vendedor es de la cuenta pero no la administra',
      await U(vendedorA, 'select public.bancard_acceso($1) j', [A.empresaId]), { admin: false, habilitada: false, superadmin: false });
    rechazado('uno de afuera no puede ni preguntar',
      await intentoU(ajeno.uid, 'select public.bancard_acceso($1)', [A.empresaId]), 'No pertenecés a esta empresa');
    ok('la administración en su propia cuenta',
      await U(jefe.uid, 'select public.bancard_acceso($1) j', [jefe.empresaId]), { admin: true, habilitada: false, superadmin: true });

    // ---- habilitar una cuenta puntual (la del certificador)
    rechazado('un cliente no puede habilitarse solo',
      await intentoU(T.uid, 'select public.habilitar_bancard($1,true)', [T.empresaId]), 'administración de Orden');
    ok('la administración habilita la cuenta de prueba',
      await U(jefe.uid, 'select public.habilitar_bancard($1,true) j', [T.empresaId]), { habilitada: true });
    ok('y ahora esa cuenta, y solo esa, figura habilitada',
      [(await U(T.uid, 'select public.bancard_acceso($1) j', [T.empresaId])).habilitada,
        (await U(A.uid, 'select public.bancard_acceso($1) j', [A.empresaId])).habilitada], [true, false]);
    ok('queda en el registro quién la habilitó',
      (await registroDe(T, 'habilitar_bancard')).map((r) => [r.actor_id, r.detalle]), [[jefe.uid, { habilitada: true }]]);
    ok('y se puede apagar',
      [await U(jefe.uid, 'select public.habilitar_bancard($1,false) j', [T.empresaId]),
        (await U(T.uid, 'select public.bancard_acceso($1) j', [T.empresaId])).habilitada], [{ habilitada: false }, false]);
    rechazado('habilitar una cuenta que no existe',
      await intentoU(jefe.uid, `select public.habilitar_bancard('00000000-0000-0000-0000-000000000000',true)`, []), 'Esa cuenta no existe');

    // ---- cotizar, el estado y una operación: solo quien administra ESA cuenta
    for (const [quien, uid] of [['un vendedor', vendedorA], ['el dueño de otra cuenta', ajeno.uid]]) {
      rechazado(`${quien} no puede cotizar`,
        await intentoU(uid, 'select public.cotizar_plan($1,$2,$3,$4)', [A.empresaId, 'pro', 'mensual', null]), 'due[nñ]o');
      rechazado(`  ni ver el estado de Bancard de la cuenta`,
        await intentoU(uid, `select public.bancard_estado($1,'produccion')`, [A.empresaId]), 'due[nñ]o');
      rechazado(`  ni ver un pago: para él «no existe»`,
        await intentoU(uid, 'select public.bancard_operacion_ver($1)', [opA.operacion]), 'Ese pago no existe');
    }
    rechazado('un pago que de verdad no existe contesta lo mismo',
      await intentoU(A.uid, 'select public.bancard_operacion_ver($1)', [424242]), 'Ese pago no existe');
    ok('el administrador de la cuenta sí cotiza y ve',
      [(await cotizar(A, 'pro', 'mensual', null, adminA)).plan,
        (await U(adminA, 'select public.bancard_operacion_ver($1) j', [opA.operacion])).estado], ['pro', 'pagada']);
    ok('y la administración de Orden, cualquiera',
      (await U(jefe.uid, 'select public.bancard_operacion_ver($1) j', [opA.operacion])).operacion, opA.operacion);

    // ---- el comprobante: solo lo que el manual deja mostrar
    const ver = await U(A.uid, 'select public.bancard_operacion_ver($1) j', [opA.operacion]);
    ok('el comprobante trae fecha, número de pedido, importe y la descripción de la respuesta',
      [ver.operacion, ver.importe, ver.moneda, ver.descripcion_respuesta, typeof ver.fecha, ver.estado, ver.plan, ver.periodo, ver.personas],
      [opA.operacion, 370000, 'PYG', 'Transaccion aprobada', 'string', 'pagada', 'negocio', 'mensual', 6]);
    const prohibidas = ['authorization_number', 'response_code', 'extended_response_description', 'security_information',
      'ticket_number', 'customer_ip', 'token', 'respuesta', 'antes', 'autorizacion', 'codigo', 'ticket'];
    ok('y NO trae el número de autorización, el código, la respuesta extendida ni los datos de seguridad (se recorre el JSON entero)',
      [...claves(ver)].filter((k) => prohibidas.includes(k)), []);
    ok('ni sus valores escondidos en otro campo',
      ['654321', '2117960079', 'APROBADA POR EL EMISOR', '190.128.0.1'].filter((v) => JSON.stringify(ver).includes(v)), []);
    ok('una pagada ya no entrega el process_id', ver.process_id, null);

    // ---- el process_id: solo a quien inició, y solo mientras hace falta
    const N = await H.montarEmpresa(db, { email: 'n@negocio.test', nombre: 'Proceso' });
    const adminN = await H.sumarMiembro(db, N.empresaId, 'admin@proceso.test', 'admin');
    const on = await crear(N, 'staging', 'plan', 'formulario', 'pro', 'mensual', null);
    await S('select public.bancard_guardar_proceso($1,$2) j', [on.operacion, 'pf*secreto']);
    ok('quien inició el pago recibe el process_id; otro administrador de la misma cuenta, no',
      [(await U(N.uid, 'select public.bancard_operacion_ver($1) j', [on.operacion])).process_id,
        (await U(adminN, 'select public.bancard_operacion_ver($1) j', [on.operacion])).process_id,
        (await U(jefe.uid, 'select public.bancard_operacion_ver($1) j', [on.operacion])).process_id],
      ['pf*secreto', null, null]);

    const est = await U(N.uid, `select public.bancard_estado($1,'staging') j`, [N.empresaId]);
    ok('el estado muestra la operación viva, sin tarjeta, sin personas (no es Premium) y sin pagos',
      [est.viva.operacion, est.viva.estado, est.viva.puede_3ds, est.tarjeta, est.debito.activo, est.personas, est.ultimo_pago],
      [on.operacion, 'creada', false, null, false, null, null]);
    await S(`select public.bancard_cerrar_operacion($1,'en_3ds','{"process_id":"pf*3ds"}') j`, [on.operacion]);
    ok('si el banco pide confirmar, lo dice',
      (await U(N.uid, `select public.bancard_estado($1,'staging') j`, [N.empresaId])).viva.puede_3ds, true);
    const estA = await U(A.uid, `select public.bancard_estado($1,'produccion') j`, [A.empresaId]);
    ok('en un Premium, las personas: contratadas, en uso, mínimo y máximo; y el último pago',
      [estA.personas, estA.ultimo_pago.operacion, estA.ultimo_pago.importe, estA.debito.importe],
      [{ max: 15, min: 4, proxima: null, miembros: 3, contratadas: 6 }, opA.operacion, 370000, 370000]);
    ok('el estado tampoco trae nada de la respuesta de Bancard',
      [...claves(estA)].filter((k) => prohibidas.includes(k)), []);

    // ---- la administración: todo
    rechazado('un cliente no ve los pagos de administración',
      await intentoU(A.uid, 'select public.bancard_operaciones_admin($1)', [A.empresaId]), 'administración de Orden');
    const adm = await U(jefe.uid, 'select public.bancard_operaciones_admin($1) j', [A.empresaId]);
    ok('la administración ve la autorización, el ticket, el código, la respuesta saneada y si se puede revertir',
      adm.operaciones.map((o) => [o.operacion, o.estado, o.autorizacion, o.ticket, o.codigo, o.descripcion, o.puede_revertir, o.revisar, o.empresa]),
      [[opA.operacion, 'pagada', '654321', '2117960079', '00', 'Transaccion aprobada', true, 'Bancard confirmó otro importe o moneda', 'Despensa Sur']]);
    ok('y arriba, si la cuenta está habilitada', adm.habilitada, false);
    const todas = await U(jefe.uid, 'select public.bancard_operaciones_admin() j', []);
    ok('sin cuenta: las de todas, con las que hay que revisar primero',
      [todas.operaciones.length, todas.operaciones.slice(0, 3).every((o) => o.revisar !== null), todas.habilitada], [50, true, null]);
    ok('cuando no se puede revertir, dice por qué',
      todas.operaciones.filter((o) => o.estado === 'pagada' && !o.puede_revertir).map((o) => o.por_que_no).filter((x) => !x), []);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('12 · De la respuesta de Bancard se guarda lo justo');
  // ═══════════════════════════════════════════════════════════
  {
    const R = await H.montarEmpresa(db, { email: 'r@negocio.test', nombre: 'Saneado' });
    const o = await crear(R, 'staging', 'plan', 'formulario', 'pro', 'mensual', null);
    const sucia = aprobada(o.operacion, o.importe, {
      token: 'TOKEN-QUE-NO-SE-GUARDA',
      alias_token: 'ALIAS-QUE-NO-SE-GUARDA',
      process_id: 'PROCESO-QUE-NO-SE-GUARDA',
      billing_response: { status: 'success', data: { invoice_number: 'FACTURA-QUE-NO-SE-GUARDA' } },
      iva_ticket_number: 'IVA-QUE-NO-SE-GUARDA',
      campo_nuevo_de_bancard: 'ALGO-QUE-NO-SE-GUARDA',
      security_information: { customer_ip: 'IP-QUE-NO-SE-GUARDA', card_source: 'I', card_country: 'Croacia', version: '0.3', risk_index: '0', otro: 'OTRO-QUE-NO-SE-GUARDA' },
    });
    await confirmar(o.operacion, sucia);
    const guardada = (await opDe(o.operacion)).respuesta;
    ok('de la respuesta quedan solo estas claves',
      [Object.keys(guardada).sort(), Object.keys(guardada.security_information).sort()],
      [['amount', 'authorization_number', 'currency', 'extended_response_description', 'response', 'response_code',
        'response_description', 'response_details', 'security_information', 'ticket_number'],
      ['card_country', 'card_source', 'risk_index']]);
    ok('y nada de lo que no se guarda', JSON.stringify(guardada).includes('QUE-NO-SE-GUARDA'), false);

    // Un rechazo, igual.
    const R2 = await H.montarEmpresa(db, { email: 'r2@negocio.test', nombre: 'Saneado dos' });
    const o2 = await crear(R2, 'staging', 'plan', 'formulario', 'pro', 'mensual', null);
    await confirmar(o2.operacion, rechazo(o2.operacion, o2.importe, '05', 'NO APROBADO', { token: 'TOKEN-QUE-NO-SE-GUARDA', security_information: { customer_ip: 'IP-QUE-NO-SE-GUARDA' } }));
    ok('la respuesta de un rechazo también se sanea',
      JSON.stringify((await opDe(o2.operacion)).respuesta).includes('QUE-NO-SE-GUARDA'), false);

    // Los eventos del registro.
    await S('select public.bancard_anotar_evento($1,$2,$3,$4,$5,$6,$7,$8)', [o.operacion, null, 'staging', 'confirmacion', true, null, 200, {
      operation: sucia,
      token: 'TOKEN-QUE-NO-SE-GUARDA',
      alias_token: 'ALIAS-QUE-NO-SE-GUARDA',
      process_id: 'PROCESO-QUE-NO-SE-GUARDA',
      public_key: 'CLAVE-QUE-NO-SE-GUARDA',
      user_mail: 'correo-QUE-NO-SE-GUARDA@x.com',
      user_cell_phone: 'TELEFONO-QUE-NO-SE-GUARDA',
      pedido: { public_key: 'CLAVE-QUE-NO-SE-GUARDA', operation: { token: 'TOKEN-QUE-NO-SE-GUARDA' } },
      cards: [{ alias_token: 'ALIAS-QUE-NO-SE-GUARDA', card_masked_number: 'ENMASCARADO-QUE-NO-SE-GUARDA' }],
      messages: [{ key: 'InvalidTokenError', level: 'error', dsc: 'Invalid token', token: 'TOKEN-QUE-NO-SE-GUARDA' }],
      nota: 'una nota suelta sí',
      minutos: 12,
    }]);
    await S('select public.bancard_anotar_evento($1,$2,$3,$4,$5,$6,$7,$8)', [o.operacion, null, 'staging', 'consulta', true, null, 200, { confirmation: sucia }]);
    await S('select public.bancard_anotar_evento($1,$2,$3,$4,$5,$6,$7,$8)', [424242, null, 'staging', 'confirmacion', false, 'desconocida', 200, null]);
    const eventos = (await db.query('select * from public.bancard_eventos order by id')).rows;
    ok('los eventos se guardan saneados: ni tokens, ni alias, ni process_id, ni claves, ni correo, ni teléfono, ni objetos sueltos',
      [eventos.length, JSON.stringify(eventos).includes('QUE-NO-SE-GUARDA')], [3, false]);
    ok('y queda lo que sirve para entender qué pasó',
      [Object.keys(eventos[0].detalle).sort(), eventos[0].detalle.messages, eventos[0].detalle.operation.response_code, eventos[1].detalle.confirmation.authorization_number],
      [['messages', 'minutos', 'nota', 'operation'], [{ dsc: 'Invalid token', key: 'InvalidTokenError', level: 'error' }], '00', '654321']);
    ok('un evento de un pedido que Orden no creó también se anota (el cliente de prueba del portal)',
      [Number(eventos[2].operacion_id), eventos[2].clave, eventos[2].ok, eventos[2].detalle], [424242, 'desconocida', false, {}]);
    ok('cada consulta se cuenta en la operación', (await opDe(o.operacion)).consultas, 1);
    ok('la administración ve los eventos de cada operación',
      (await U(jefe.uid, 'select public.bancard_operaciones_admin($1) j', [R.empresaId])).operaciones[0].eventos.map((e) => e.tipo).sort(),
      ['confirmacion', 'consulta']);
    ok('ninguna fila de la base tiene nada de eso',
      (await db.query(`select count(*)::int n from public.bancard_operaciones where respuesta::text like '%QUE-NO-SE-GUARDA%' or desglose::text like '%QUE-NO-SE-GUARDA%'`)).rows[0].n, 0);

    ok('la clasificación de los rechazos, con y sin el cero',
      (await db.query(`select c, public.bancard_clase_de_rechazo(c) k from unnest(array['51','61','6','91','54','14','9G','9g','5C','55','05','12','', null]) c`))
        .rows.map((r) => `${r.c}:${r.k}`),
      ['51:fondos', '61:fondos', '6:transitorio', '91:transitorio', '54:tarjeta', '14:tarjeta', '9G:tarjeta', '9g:tarjeta',
        '5C:titular', '55:titular', '05:otro', '12:otro', ':otro', 'null:otro']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('13 · Permisos: las tablas no se tocan y lo que escribe es del servidor');
  // ═══════════════════════════════════════════════════════════
  {
    const TABLAS = ['bancard_cuentas', 'bancard_pagadores', 'bancard_tarjetas', 'bancard_operaciones', 'bancard_eventos'];
    ok('las cinco tablas existen, con RLS y SIN ninguna policy',
      (await db.query(
        `select c.relname, c.relrowsecurity, (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
           from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname like 'bancard\\_%' and c.relkind = 'r' order by 1`)).rows
        .map((r) => [r.relname, r.relrowsecurity, r.policies]),
      [...TABLAS].sort().map((t) => [t, true, 0]));
    ok('ni anon ni authenticated tienen ningún privilegio sobre ellas',
      (await db.query(
        `select t, r, p from unnest($1::text[]) t, unnest(array['anon','authenticated']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE']) p
          where has_table_privilege(r, 'public.' || t, p)`, [TABLAS])).rows, []);
    ok('ni sobre las secuencias',
      (await db.query(
        `select s, r from unnest(array['bancard_operacion_seq','bancard_pagador_seq','bancard_tarjeta_seq','bancard_eventos_id_seq']) s,
                unnest(array['anon','authenticated']) r where has_sequence_privilege(r, 'public.' || s, 'USAGE')`)).rows, []);

    const quienes = [['el dueño', 'authenticated', A.uid], ['un administrador', 'authenticated', adminA],
      ['un vendedor', 'authenticated', vendedorA], ['uno de afuera', 'authenticated', ajeno.uid],
      ['la administración de Orden (con sesión)', 'authenticated', jefe.uid], ['sin sesión', 'anon', null]];
    for (const [quien, rol, uid] of quienes) {
      const leidas = [];
      for (const t of TABLAS) {
        const r = await H.intentarComo(db, rol, uid, () => db.query(`select * from public.${t} limit 1`));
        if (r.ok || !/permission denied/i.test(r.error)) leidas.push(t);
      }
      ok(`${quien}: select directo a cada tabla bancard_* → denegado`, leidas, []);
    }
    for (const [sql, nombre] of [
      [`insert into public.bancard_cuentas (empresa_id, habilitada) values ('${A.empresaId}', true)`, 'habilitarse a mano'],
      [`update public.bancard_operaciones set estado = 'pagada'`, 'marcarse un pago como pagado'],
      [`update public.bancard_operaciones set importe = 1`, 'cambiar un importe'],
      [`delete from public.bancard_eventos`, 'borrar el registro'],
    ]) {
      rechazado(`el dueño no puede ${nombre}`, await intentoU(A.uid, sql, []), 'permission denied');
    }

    // Toda función nueva de Bancard, por catálogo: lo abierto a una sesión es
    // esta lista y nada más; a quien no inició sesión, nada.
    const paraSesion = ['bancard_acceso', 'bancard_bajar_personas', 'bancard_estado', 'bancard_operacion_ver',
      'bancard_operaciones_admin', 'cotizar_personas', 'cotizar_plan', 'habilitar_bancard'];
    const INTERNAS = ['precio_de_la_cuenta', 'prorrateo_de_personas', 'descuento_de_la_cuenta', 'cuenta_ya_pago'];
    const funciones = (await db.query(
      `select p.proname, p.prosecdef,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as sesion,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as servicio
         from pg_proc p where p.pronamespace = 'public'::regnamespace
          and (p.proname like 'bancard\\_%' or p.proname = any($1) or p.proname = any($2)) order by 1`, [paraSesion, INTERNAS])).rows;
    ok('se encontraron las funciones de Bancard', funciones.length >= 40, true);
    ok('abiertas a una sesión: exactamente las de las pantallas y la administración',
      funciones.filter((f) => f.sesion).map((f) => f.proname), paraSesion);
    ok('abiertas a quien no inició sesión: ninguna', funciones.filter((f) => f.anon).map((f) => f.proname), []);
    const delServidor = ['bancard_activar_tarjeta', 'bancard_anotar_evento', 'bancard_cerrar_operacion', 'bancard_confirmar',
      'bancard_crear_catastro', 'bancard_crear_operacion', 'bancard_datos_de_tarjeta', 'bancard_guardar_proceso',
      'bancard_marcar_revisar', 'bancard_operacion_interna', 'bancard_por_conciliar', 'bancard_quitar_tarjeta',
      'bancard_revertir', 'bancard_tarjeta_fallida', 'bancard_tarjeta_interna', 'bancard_tarjetas_por_revisar', 'bancard_tomar_cobro'];
    ok('el servidor puede ejecutar lo que le toca',
      delServidor.filter((n) => !funciones.find((f) => f.proname === n && f.servicio)), []);
    ok('y la interna de crear operación (la de la tarea diaria, sin persona) no la puede llamar ni el servidor directo',
      funciones.filter((f) => f.proname === 'bancard_crear_operacion_interna').map((f) => [f.anon, f.sesion, f.servicio]), [[false, false, false]]);
    ok('todas las que llevan security definer… lo llevan (y permisos.test.js comprueba su search_path)',
      funciones.filter((f) => !f.prosecdef).map((f) => f.proname).sort(),
      ['bancard_catastros_por_dia', 'bancard_clase_de_rechazo', 'bancard_descripcion', 'bancard_dias_de_cobro', 'bancard_minutos_de_3ds',
        'bancard_minutos_de_vida', 'bancard_operaciones_por_dia', 'bancard_sanear', 'bancard_sanear_detalle', 'bancard_tope_de_rechazos']);

    // Y llamándolas de verdad.
    const llamadas = [
      ['bancard_confirmar', 'select public.bancard_confirmar($1,$2,$3)', [opA.operacion, aprobada(opA.operacion, 370000), 'confirmacion']],
      ['bancard_crear_operacion', 'select public.bancard_crear_operacion($1,$2,$3,$4,$5,$6,$7,$8)', [A.empresaId, A.uid, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null]],
      ['bancard_crear_operacion_interna', 'select public.bancard_crear_operacion_interna($1,$2,$3,$4,$5,$6,$7,$8,$9)', [A.empresaId, null, 'produccion', 'plan', 'token', 'automatico', 'pro', 'mensual', null]],
      ['bancard_cerrar_operacion', `select public.bancard_cerrar_operacion($1,'vencida','{}')`, [opA.operacion]],
      ['bancard_revertir', 'select public.bancard_revertir($1,$2,$3)', [opA.operacion, jefe.uid, 'x']],
      ['bancard_crear_catastro', 'select public.bancard_crear_catastro($1,$2,$3,$4,$5)', [A.empresaId, A.uid, 'produccion', '0981', 'x']],
      ['bancard_activar_tarjeta', `select public.bancard_activar_tarjeta(101,'Visa','0016','credit')`, []],
      ['bancard_quitar_tarjeta', `select public.bancard_quitar_tarjeta(101,$1,'pedido')`, [A.uid]],
      ['bancard_tomar_cobro', `select public.bancard_tomar_cobro('produccion')`, []],
      ['bancard_por_conciliar', `select public.bancard_por_conciliar('produccion')`, []],
      ['bancard_anotar_evento', `select public.bancard_anotar_evento(1,null,'x','x',true,null,200,'{}')`, []],
      ['bancard_operacion_interna', 'select public.bancard_operacion_interna($1)', [opA.operacion]],
      ['bancard_datos_de_tarjeta', `select public.bancard_datos_de_tarjeta($1,'produccion')`, [A.empresaId]],
      ['precio_de_la_cuenta', 'select public.precio_de_la_cuenta($1,$2,$3,$4)', [A.empresaId, 'pro', 'mensual', null]],
      ['cuenta_ya_pago', 'select public.cuenta_ya_pago($1)', [A.empresaId]],
      ['aplicar_suscripcion', `select public.aplicar_suscripcion($1,'negocio')`, [A.empresaId]],
    ];
    for (const [quien, rol, uid] of [['el dueño', 'authenticated', A.uid], ['la administración con sesión', 'authenticated', jefe.uid], ['sin sesión', 'anon', null]]) {
      const pasaron = [];
      for (const [nombre, sql, p] of llamadas) {
        const r = await H.intentarComo(db, rol, uid, () => db.query(sql, p));
        if (r.ok || !/permission denied/i.test(r.error)) pasaron.push(nombre);
      }
      ok(`${quien}: llamar directo a lo que escribe o a lo interno → denegado`, pasaron, []);
    }
    rechazado('sin sesión tampoco se cotiza', await H.intentarComo(db, 'anon', null, () =>
      db.query('select public.cotizar_plan($1,$2,$3,$4)', [A.empresaId, 'pro', 'mensual', null])), 'permission denied');
    rechazado('ni se pregunta el acceso', await H.intentarComo(db, 'anon', null, () =>
      db.query('select public.bancard_acceso($1)', [A.empresaId])), 'permission denied');
    ok('después de todos esos intentos, el pago de A sigue igual', [(await opDe(opA.operacion)).estado, (await sus(A)).plan], ['pagada', 'negocio']);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('13b · Borrar la cuenta se lleva lo de Bancard, y lo cobrado queda');
  // ═══════════════════════════════════════════════════════════
  {
    const X = await H.montarEmpresa(db, { email: 'sevá@negocio.test', nombre: 'Se va de Orden' });
    await referir(X);
    const o = await pagar(X, 'produccion', 'pro', 'mensual', null);
    const cat = await S('select public.bancard_crear_catastro($1,$2,$3,$4,$5) j', [X.empresaId, X.uid, 'produccion', '0981123456', 'Autorizo']);
    await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j', [cat.card_id, 'Visa', '0016', 'credit']);
    await S('select public.bancard_anotar_evento($1,$2,$3,$4,$5,$6,$7,$8)', [o.operacion, null, 'produccion', 'confirmacion', true, null, 200, {}]);
    const cuantas = async () => (await db.query(
      `select (select count(*)::int from public.bancard_operaciones where empresa_id = $1) as operaciones,
              (select count(*)::int from public.bancard_tarjetas where empresa_id = $1) as tarjetas,
              (select count(*)::int from public.bancard_pagadores where empresa_id = $1) as pagadores,
              (select count(*)::int from public.bancard_cuentas where empresa_id = $1) as cuentas`, [X.empresaId])).rows[0];
    ok('antes de borrar: su pago, su tarjeta, su usuario de Bancard y su débito',
      await cuantas(), { operaciones: 1, tarjetas: 1, pagadores: 1, cuentas: 1 });
    const borrado = await H.intentarComo(db, 'service_role', null, () => db.query('select public.borrar_datos_de_usuario($1) r', [X.uid]));
    ok('borrar la cuenta anda con las tablas nuevas (ninguna llave lo frena)',
      [borrado.ok, borrado.valor?.rows[0].r.empresas_borradas], [true, 1]);
    ok('y se lleva todo lo de Bancard de esa cuenta', await cuantas(), { operaciones: 0, tarjetas: 0, pagadores: 0, cuentas: 0 });
    ok('lo cobrado queda en las finanzas de Orden, y el registro de lo hablado con Bancard también',
      [(await ingresos(`Bancard ${o.operacion}`)).map((i) => [i.monto, i.estado]),
        (await J('select count(*)::int n from public.bancard_eventos where operacion_id = $1', [o.operacion])).n],
      [[[190000, 'activo']], 1]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('13c · La revisión del 03/10, en la base');
  // ═══════════════════════════════════════════════════════════
  {
    // Hallazgo 10: sumar personas cancela una baja programada menor.
    const L2 = await H.montarEmpresa(db, { email: 'l2@negocio.test', nombre: 'Baja y suma' });
    await pagar(L2, 'produccion', 'negocio', 'mensual', 8);
    await db.query(`update public.suscripciones set periodo_fin = now() + interval '15 days' where empresa_id = $1`, [L2.empresaId]);
    await U(L2.uid, 'select public.bancard_bajar_personas($1,$2) j', [L2.empresaId, 6]);
    const op = await crear(L2, 'produccion', 'personas', 'formulario', null, null, 10);
    ok('baja programada a 6 y después suma hasta 10: paga 2 × 60.000 × 15/30', op.importe, 60000);
    await confirmar(op.operacion, aprobada(op.operacion, op.importe));
    ok('al confirmar: tope 9, la baja a 6 se cancela y la renovación es por 10',
      [(await sus(L2)).tope_vendedores, (await J('select personas_proxima from public.bancard_cuentas where empresa_id = $1', [L2.empresaId])).personas_proxima,
        (await J('select public.bancard_importe_de_renovacion($1)::float i', [L2.empresaId])).i], [9, null, 610000]);

    // Hallazgo 3: el tope mira la renovación viva por menos personas y la baja programada.
    await U(L2.uid, 'select public.bancard_bajar_personas($1,$2) j', [L2.empresaId, 5]);
    ok('con la baja a 5: tope_de_miembros 5', (await J('select public.tope_de_miembros($1) n', [L2.empresaId])).n, 5);
    await U(L2.uid, 'select public.bancard_bajar_personas($1,$2) j', [L2.empresaId, null]);
    await db.query(`update public.suscripciones set periodo_fin = now() + interval '1 day' where empresa_id = $1`, [L2.empresaId]);
    await U(L2.uid, 'select public.bancard_bajar_personas($1,$2) j', [L2.empresaId, 4]);
    const ren = await crear(L2, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 4);
    ok('con la renovación por 4 abierta: tope 4; cerrada, vuelve la baja (4) y sin baja, 10',
      await (async () => {
        const a = (await J('select public.tope_de_miembros($1) n', [L2.empresaId])).n;
        await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [ren.operacion]);
        const b = (await J('select public.tope_de_miembros($1) n', [L2.empresaId])).n;
        await U(L2.uid, 'select public.bancard_bajar_personas($1,$2) j', [L2.empresaId, null]);
        const c = (await J('select public.tope_de_miembros($1) n', [L2.empresaId])).n;
        return [a, b, c];
      })(), [4, 4, 10]);

    // Hallazgo 8: una vencida con RollbackSuccessful no se activa con una aprobación tardía.
    const R2 = await H.montarEmpresa(db, { email: 'devuelto@negocio.test', nombre: 'Devuelto' });
    const o8 = await crear(R2, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"RollbackSuccessful"}') j`, [o8.operacion]);
    const r8 = await confirmar(o8.operacion, aprobada(o8.operacion, o8.importe));
    ok('aprobación sobre un pago que Bancard devolvió: no activa, motivo «revertida», queda para revisar',
      [r8.ok, r8.motivo, (await opDe(o8.operacion)).estado, (await opDe(o8.operacion)).revisar, (await sus(R2)).estado],
      [false, 'revertida', 'vencida', 'Aprobación sobre un pago que Bancard ya revirtió', 'prueba']);

    // Hallazgos 1 y 2: rechazada → vencida solo cuando el servidor la cerró en Bancard.
    const o9 = await crear(R2, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    await confirmar(o9.operacion, rechazo(o9.operacion, o9.importe));
    ok('una rechazada no se vence «porque sí»', (await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"abandonada"}') j`, [o9.operacion])).cambio, false);
    ok('sí con «reemplazada» (la reversa ya salió)',
      [(await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"reemplazada"}') j`, [o9.operacion])).estado, (await opDe(o9.operacion)).motivo], ['vencida', 'reemplazada']);
    ok('y al crear otra operación, la base devuelve las rechazadas que quedan por cerrar',
      await (async () => {
        const a = await crear(R2, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
        await S('select public.bancard_guardar_proceso($1,$2) j', [a.operacion, 'pf*rech']);
        await confirmar(a.operacion, rechazo(a.operacion, a.importe));
        const b = await crear(R2, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
        await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [b.operacion]);
        return b.reemplaza;
      })(), [(await J('select max(id)::int id from public.bancard_operaciones where empresa_id = $1 and estado = $2', [R2.empresaId, 'rechazada'])).id]);

    // Hallazgo 2 en la base: una vencida del primer pago, pagada después de que la cuenta ya pagó.
    const V2 = await H.montarEmpresa(db, { email: 'v2@negocio.test', nombre: 'Primer pago dos veces' });
    const vieja = await crear(V2, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    ok('la operación vieja dice que es el primer pago', vieja.desglose.primer_pago, true);
    await S(`select public.bancard_cerrar_operacion($1,'vencida','{"clave":"abandonada"}') j`, [vieja.operacion]);
    await pagar(V2, 'produccion', 'pro', 'mensual', null);
    const finV = (await sus(V2)).fin;
    const rv = await confirmar(vieja.operacion, aprobada(vieja.operacion, vieja.importe));
    ok('la vieja aprobada después: conflicto, no suma un mes, la plata se anota',
      [rv.aprobada, rv.conflicto, rv.revisar, (await sus(V2)).fin === finV, (await ingresos(`Bancard ${vieja.operacion}`)).length],
      [true, true, 'Pagó una operación vieja con el descuento del primer pago: resolver a mano', true, 1]);
    ok('y no deja renglón «cambiar_plan» (sigue habiendo uno solo)', (await registroDe(V2, 'cambiar_plan')).length, 1);

    // Hallazgo 1 en la base: «sumar personas» de un período ya renovado.
    const P3 = await H.montarEmpresa(db, { email: 'p3@negocio.test', nombre: 'Período viejo' });
    await pagar(P3, 'produccion', 'negocio', 'mensual', 4);
    await db.query(`update public.suscripciones set periodo_fin = now() + interval '20 hours' where empresa_id = $1`, [P3.empresaId]);
    const mas = await crear(P3, 'produccion', 'personas', 'formulario', null, null, 15);
    await confirmar(mas.operacion, rechazo(mas.operacion, mas.importe));
    await pagar(P3, 'produccion', 'negocio', 'mensual', 4);
    const rm = await confirmar(mas.operacion, aprobada(mas.operacion, mas.importe));
    ok('las 11 personas del período viejo (Gs. 22.000) no entran al período nuevo',
      [mas.importe, rm.conflicto, rm.revisar, (await sus(P3)).tope_vendedores], [22000, true, 'Sumó personas sobre un período ya renovado: resolver a mano', 3]);

    // Hallazgo 4: el registro se purga y lo desconocido se anota una vez por día.
    await db.query(`insert into public.bancard_eventos (operacion_id, entorno, tipo, ok, created_at) values (7, 'produccion', 'consulta', true, now() - interval '100 days'), (7, 'produccion', 'consulta', true, now() - interval '20 days'), (7, 'produccion', 'consulta', true, now() - interval '10 days')`);
    ok('bancard_purgar_eventos: borra lo de más de 90 días y nunca menos de 30 (pedir 5 días borra solo lo de 100; lo de 20 queda)',
      [await S('select public.bancard_purgar_eventos($1) j', [5]), (await J('select count(*)::int n from public.bancard_eventos where operacion_id = 7')).n,
        await S('select public.bancard_purgar_eventos($1) j', [90])], [1, 2, 0]);
    for (let i = 0; i < 3; i++) await S(`select public.bancard_anotar_evento($1, null, 'produccion', 'confirmacion', true, 'desconocida', 200, '{}') j`, [424242]);
    for (let i = 0; i < 2; i++) await S(`select public.bancard_anotar_evento($1, null, 'produccion', 'confirmacion', false, 'token_invalido', 400, '{}') j`, [424242]);
    for (let i = 0; i < 3; i++) await S(`select public.bancard_anotar_evento($1, null, 'produccion', 'confirmacion', true, 'token_invalido_cerrada', 200, '{}') j`, [424242]);
    ok('«desconocida» y «token_invalido_cerrada» tres veces: una fila cada una; lo de una viva, una por vez',
      (await db.query(`select clave, count(*)::int n from public.bancard_eventos where operacion_id = 424242 group by 1 order by 1`)).rows,
      [{ clave: 'desconocida', n: 1 }, { clave: 'token_invalido', n: 2 }, { clave: 'token_invalido_cerrada', n: 1 }]);
    ok('y solo el servidor purga', (await H.intentarComo(db, 'authenticated', L2.uid, () => db.query('select public.bancard_purgar_eventos(90)'))).ok, false);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('14 · Las migraciones, como texto, y aplicadas dos veces');
  // ═══════════════════════════════════════════════════════════
  {
    for (const m of MIGRACIONES) {
      const sql = leer(m);
      // El MCP con el que se aplican convierte las secuencias de escape y
      // deja las barras dobles (rompió una función el 30/09).
      ok(`${path.basename(m)} · sin barras invertidas`, sql.includes('\\'), false);
      ok(`${path.basename(m)} · sin ninguna clave ni tarjeta escrita`,
        [/[0-9]{13,19}/.test(sql.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '')), /[a-zA-Z0-9]{32,}/.test(sql.replace(/[a-zA-Z_]{32,}/g, ''))], [false, false]);
      const definer = [...sql.matchAll(/create or replace function public\.(\w+)\([^$]*?\$fn\$/g)]
        .filter((x) => x[0].includes('security definer') && !x[0].includes('set search_path = public'));
      ok(`${path.basename(m)} · toda función security definer fija su search_path`, definer.map((x) => x[1]), []);
    }
    const s125 = leer(MIGRACIONES[1]);
    const s126 = leer(MIGRACIONES[2]);
    ok('el reloj: los cobros cada hora de 09:07 a 18:07 de Paraguay y la conciliación cada 10 minutos, por disparar_tarea',
      [s126.includes("'orden-cobros-bancard', '7 12-21 * * *'"), s126.includes("'/api/tareas/cobros-bancard'"),
        s126.includes("'orden-conciliar-bancard', '*/10 * * * *'"), s126.includes("'/api/tareas/conciliar-bancard'"),
        /exception when others then\s+raise notice 'Sin pg_cron/.test(s126)], [true, true, true, true, true]);
    ok('y esas rutas son de las que disparar_tarea acepta',
      ['/api/tareas/cobros-bancard', '/api/tareas/conciliar-bancard'].map((r) => /^\/api\/tareas\/[a-z-]+$/.test(r)), [true, true]);
    ok('vercel.json no se tocó: el reloj es pg_cron', JSON.parse(leer('vercel.json')).crons.length, 6);
    ok('aplicar_suscripcion y cambiar_plan_cuenta no se redefinen',
      [s125.includes('function public.aplicar_suscripcion'), s125.includes('function public.cambiar_plan_cuenta')], [false, false]);
    // «Copia exacta + cambio mínimo» de deshacer_ultimo_cambio: sacando el
    // bloque nuevo, el cuerpo es el de la 022.
    const cuerpo = (sql, nombre) => {
      const desde = sql.lastIndexOf(`create or replace function public.${nombre}(`);
      return sql.slice(desde, sql.indexOf('end $fn$;', desde));
    };
    const de022 = cuerpo(leer('supabase/migrations/022_ficha_y_correcciones.sql'), 'deshacer_ultimo_cambio');
    const de125 = cuerpo(s125, 'deshacer_ultimo_cambio');
    const bloque = de125.slice(de125.indexOf('  -- 125: un pago de Bancard no se deshace desde acá.'), de125.indexOf('  -- Ya se deshizo:'));
    ok('deshacer_ultimo_cambio es la de la 022 más un solo bloque',
      [bloque.length > 100, de125.replace(bloque, '') === de022], [true, true]);
    const de107 = cuerpo(leer('supabase/migrations/107_aviso_de_vencimiento.sql'), 'vencimientos_por_avisar');
    const de126 = cuerpo(s126, 'vencimientos_por_avisar');
    const nuevas = de126.slice(de126.indexOf('      ),\n      -- 126: la tarjeta de la que se va a cobrar'), de126.indexOf('\n    ) as x'));
    ok('vencimientos_por_avisar es la de la 107 más tres claves',
      [nuevas.length > 100, de126.replace(nuevas, '      )') === de107], [true, true]);
    const de048 = cuerpo(leer('supabase/migrations/048_las_sillas_se_pagan.sql'), 'tope_de_miembros');
    const tope125 = cuerpo(s125, 'tope_de_miembros');
    ok('tope_de_miembros es la de la 048 (mismo tope de siempre) envuelta en un least con lo de Bancard',
      [tope125.includes("(public.limites_plan(public.plan_efectivo_calculado(p_empresa))->>'miembros')::integer"),
        de048.includes("(public.limites_plan(public.plan_efectivo_calculado(p_empresa))->>'miembros')::integer"),
        tope125.includes('select s.tope_vendedores + 1'), tope125.includes('least('), tope125.includes('personas_proxima'),
        tope125.includes("o.estado in ('creada', 'en_3ds', 'incierta')")],
      [true, true, true, true, true, true]);
    const de123 = cuerpo(leer('supabase/migrations/123_precios_prueba_y_descuentos.sql'), 'descuento_por_racha');
    const de124 = cuerpo(leer(MIGRACIONES[0]), 'descuento_de_la_cuenta');
    const guarda = `  if not public.es_admin(p_empresa) and not public.es_superadmin() then\n    raise exception 'Solo el dueño de la cuenta puede ver esto.' using errcode = '42501';\n  end if;\n\n`;
    ok('descuento_de_la_cuenta es el cuerpo de descuento_por_racha (123) sin la guarda de sesión',
      [de123.includes(guarda), de123.replace(guarda, '').replace('descuento_por_racha', 'descuento_de_la_cuenta') === de124], [true, true]);

    // ---- idempotentes: aplicadas otra vez sobre la base con datos
    const cuenta = async () => JSON.stringify([
      (await J('select count(*)::int n from public.bancard_operaciones')).n,
      (await J('select count(*)::int n from public.bancard_tarjetas')).n,
      (await J('select count(*)::int n from public.bancard_eventos')).n,
      (await J('select count(*)::int n from public.bancard_cuentas')).n,
      (await J('select last_value::int n from public.bancard_operacion_seq')).n,
      await sus(A),
    ]);
    const antes = await cuenta();
    let error = null;
    try { for (const m of MIGRACIONES) await db.exec(leer(m)); } catch (e) { error = e.message; }
    ok('las tres migraciones se aplican otra vez sin error', error, null);
    ok('y no tocan ningún dato ni reinician las secuencias', await cuenta(), antes);
    ok('los permisos siguen cerrados después de aplicarlas dos veces',
      [(await H.intentarComo(db, 'authenticated', A.uid, () => db.query('select * from public.bancard_operaciones'))).ok,
        (await H.intentarComo(db, 'authenticated', A.uid, () => db.query('select public.bancard_confirmar(1,$1,$2)', [{}, 'consulta']))).ok],
      [false, false]);
    const nueva = await H.montarEmpresa(db, { email: 'despues@negocio.test', nombre: 'Después de reaplicar' });
    ok('y todo sigue andando: una cuenta nueva paga',
      [(await pagar(nueva, 'produccion', 'pro', 'mensual', null)).r.aprobada, (await sus(nueva)).estado], [true, 'activa']);
  }

  await db.close();

  console.log(`\n${'═'.repeat(62)}`);
  console.log(fallos === 0
    ? `>>> ${corridas} COMPROBACIONES DE BANCARD EN LA BASE PASARON`
    : `>>> ${fallos} DE ${corridas} COMPROBACIONES DE BANCARD EN LA BASE FALLARON`);
  process.exit(fallos ? 1 : 0);
}

principal().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message ?? e, e.stack ?? '');
  process.exit(1);
});
