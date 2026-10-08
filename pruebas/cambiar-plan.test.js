/**
 * Cambiar de plan con días pagos, por Bancard (migración 130, 07/10/2026).
 *
 * Matías: «Me suscribí al plan Básico. Si la persona quiere cambiar al Pro o
 * al Premium me lleva al WhatsApp. ¿No hay una forma de que se pueda pagar con
 * tarjeta o con QR?»
 *
 * En orden de importancia:
 *
 *   0. LA 130 SE APLICA ANTES QUE EL CÓDIGO Y NO LE CAMBIA NADA A NADIE. Dos
 *      bases iguales hacen lo mismo que hace el código publicado (pagar un
 *      plan, sumar personas, confirmar, revertir, cobrar solo, avisar,
 *      topar el equipo); a una se le aplica la 130 EN EL MEDIO, con pagos a
 *      medio hacer. Las dos tienen que contar lo mismo, paso por paso, sin
 *      ninguna excepción: la única que había era la decisión 4, y va
 *      apagada (ver el punto 4).
 *   1. SUBIR SE COBRA BIEN, AL GUARANÍ: la tabla de ejemplos del diseño, los
 *      días de prueba que no se cobran, el freno, dos cambios seguidos.
 *   2. UN CAMBIO CAMBIA EL PLAN Y NADA MÁS: ni la fecha, ni el período, ni la
 *      comisión del socio; y si la cuenta ya no está como se cotizó, la plata
 *      se anota y el plan no se toca.
 *   3. BAJAR NO COBRA NADA y entra con la renovación: la que cobra la tarea
 *      y la que paga la persona, que no puede adelantarla más de tres días.
 *   4. NO SE PUEDE PAGAR UN PLAN DONDE EL EQUIPO NO ENTRA: LA «DECISIÓN 4»,
 *      QUE VA APAGADA (Matías, 08/10/2026: quien probó con 2 o 3 personas y
 *      deja vencer no podría pagar el Básico con tarjeta, y vencido no tiene
 *      pantalla para sacar gente). Se prueba en sus dos posiciones:
 *        · APAGADA, como va a producción (grupos 0b y 13): nada se frena,
 *          ningún débito se pausa, ningún pago queda «para revisar» y los
 *          avisos prometen el cobro como antes de la 130;
 *        · PRENDIDA (grupos 0c y 13b): a la base de pruebas se le pone la
 *          MISMA función de la migración sin su `return;` (`H.decision4()`),
 *          y todo lo que estas pruebas afirmaban cuando nació prendida sigue
 *          valiendo. Así el código dormido queda cubierto.
 *      El resto de los grupos corre con la base como va a producción.
 *   5. REVERTIR vuelve a la foto, también un cambio que quedó en conflicto.
 *   6. NADIE CON SESIÓN LLAMA A LO QUE ESCRIBE, con los permisos por defecto
 *      de Supabase puestos antes de aplicar.
 *   7. CADA FUNCIÓN QUE SE VUELVE A DEFINIR ES LA DE ANTES salvo lo marcado.
 *
 * El servidor (rutas, `leerPedidoDePago`) y la pantalla tienen sus pruebas en
 * bancard-flujo y bancard-fuentes.
 */
const fs = require('fs');
const path = require('path');
const H = require('./ayuda-db.js');

const RAIZ = path.join(__dirname, '..');
const BARRA = String.fromCharCode(92);
// CRLF normalizado: en un worktree de Windows los fuentes llegan con \r\n.
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');

const MIGRACIONES = H.migraciones();
const ARCHIVO_130 = MIGRACIONES.find((f) => f.startsWith('130'));
/** Lo que hay antes de la 130: lo que está publicado (más lo que otra rama haya sumado). */
const ANTERIORES = MIGRACIONES.filter((f) => f < '130');
const ULTIMA_ANTERIOR = ANTERIORES[ANTERIORES.length - 1].slice(0, 3);

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
  console.log(`  ✓ ${nombre} → rechazada: ${resultado.error.slice(0, 96)}`);
}

/** Lo que Bancard manda de un pago aprobado. */
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
  security_information: { card_source: 'L', card_country: 'PARAGUAY', version: '0.3', risk_index: '0' },
  ...extra,
});
const rechazo = (op, importe, codigo = '51', descripcion = 'NO APROBADA-INSUF.DE FONDOS') => ({
  ...aprobada(op, importe),
  response: 'N',
  response_code: codigo,
  response_description: descripcion,
  authorization_number: null,
});

const FRENO = 'Tu plan actual está pago hasta el';
const NO_VALIDO = 'Ese pedido de pago no es válido';
const EN_CURSO = 'Hay un pago en curso. Esperá a que se confirme y probá de nuevo.';
const equipoNoEntra = (personas, plan, lugares) =>
  `Tu equipo tiene ${personas} personas y el plan ${plan} admite hasta ${lugares}. Achicá el equipo o elegí un plan donde entren todos.`;
const PARA_REVISAR_EQUIPO = 'Pagó un plan con menos lugares que las personas de su equipo';
const PARA_REVISAR_CAMBIO = 'Cambió a un plan con menos lugares que las personas de su equipo';
/** La llave de la decisión 4: la función de la migración, con y sin su `return;`. */
const D4 = H.decision4();

// ─────────────────────────────────────────────────────────────────────────
// Las ayudas, sobre una base
// ─────────────────────────────────────────────────────────────────────────
function herramientas(db) {
  const J = async (sql, p) => (await db.query(sql, p)).rows[0];
  /** Como el servidor: rol service_role, sin sesión. */
  const S = async (sql, p) => (await H.comoServicio(db, () => db.query(sql, p))).rows[0]?.j;
  const intentoS = (sql, p) => H.intentarComo(db, 'service_role', null, () => db.query(sql, p));
  /** Como una persona con sesión. */
  const U = async (uid, sql, p) => (await H.comoUsuario(db, uid, () => db.query(sql, p))).rows[0]?.j;
  const intentoU = (uid, sql, p) => H.intentar(db, uid, () => db.query(sql, p));

  // Las llamadas del código publicado, con los argumentos POR NOMBRE, como
  // los manda PostgREST (src/lib/bancard-flujo.ts, src/app/(app)/plan).
  const SQL = {
    crear: `select public.bancard_crear_operacion(p_empresa => $1, p_usuario => $2, p_entorno => $3, p_tipo => $4,
              p_medio => $5, p_plan => $6, p_periodo => $7, p_personas => $8) j`,
    confirmar: 'select public.bancard_confirmar(p_operacion => $1, p_respuesta => $2, p_fuente => $3) j',
    revertir: `select public.bancard_revertir(p_operacion => $1, p_actor => $2, p_motivo => $3,
                 p_solo_comprobar => $4, p_sin_bancard => $5) j`,
    tomar: 'select public.bancard_tomar_cobro(p_entorno => $1) j',
    bajar: 'select public.bancard_bajar_personas(p_empresa => $1, p_usuario => $2, p_personas => $3) j',
    estado: 'select public.bancard_estado(p_empresa => $1, p_entorno => $2) j',
    cotizarPlan: 'select public.cotizar_plan(p_empresa => $1, p_plan => $2, p_periodo => $3, p_personas => $4) j',
    cotizarPersonas: 'select public.cotizar_personas(p_empresa => $1, p_personas => $2) j',
    ver: 'select public.bancard_operacion_ver(p_operacion => $1) j',
    admin: 'select public.bancard_operaciones_admin(p_empresa => $1, p_limite => $2) j',
    avisos: 'select public.vencimientos_por_avisar() j',
    // Lo nuevo de la 130.
    cotizarCambio: 'select public.cotizar_cambio(p_empresa => $1, p_plan => $2, p_personas => $3) j',
    programar: 'select public.bancard_programar_plan(p_empresa => $1, p_usuario => $2, p_plan => $3) j',
  };

  const crear = (c, entorno, tipo, medio, plan, periodo, personas, uid = c.uid) =>
    S(SQL.crear, [c.empresaId, uid, entorno, tipo, medio, plan, periodo, personas]);
  const intentoCrear = (c, entorno, tipo, medio, plan, periodo, personas, uid = c.uid) =>
    intentoS(SQL.crear, [c.empresaId, uid, entorno, tipo, medio, plan, periodo, personas]);
  const confirmar = (op, respuesta, fuente = 'confirmacion') => S(SQL.confirmar, [op, respuesta, fuente]);
  /** Crear y pagar de una, por el formulario. */
  const pagar = async (c, entorno, plan, periodo, personas, tipo = 'plan') => {
    const o = await crear(c, entorno, tipo, 'formulario', plan, periodo, personas);
    if (!o || !o.operacion) throw new Error(`no se creó el pago de ${c.nombre}: ${JSON.stringify(o)}`);
    const r = await confirmar(o.operacion, aprobada(o.operacion, o.importe));
    return { ...o, r };
  };
  const tomar = (entorno = 'produccion') => S(SQL.tomar, [entorno]);
  const bajar = (c, personas, uid = c.uid) => S(SQL.bajar, [c.empresaId, uid, personas]);
  const estado = (c, entorno = 'produccion', uid = c.uid) => U(uid, SQL.estado, [c.empresaId, entorno]);
  const cotizarCambio = (c, plan, personas = null, uid = c.uid) => U(uid, SQL.cotizarCambio, [c.empresaId, plan, personas]);
  const intentoCotizarCambio = (c, plan, personas = null, uid = c.uid) => intentoU(uid, SQL.cotizarCambio, [c.empresaId, plan, personas]);
  const programar = (c, plan, uid = c.uid) => S(SQL.programar, [c.empresaId, uid, plan]);
  const intentoProgramar = (c, plan, uid = c.uid) => intentoS(SQL.programar, [c.empresaId, uid, plan]);

  const sus = (c) => J(
    `select plan, estado, coalesce(periodo, 'mensual') as periodo, tope_vendedores, importe::float as importe, proveedor_pago,
            periodo_fin::text as fin, periodo_inicio::text as inicio,
            public.plan_efectivo_calculado(empresa_id) as efectivo
       from public.suscripciones where empresa_id = $1`, [c.empresaId]);
  const cuenta = (c) => J(
    `select debito_activo as activo, debito_estado as estado, intentos, ultimo_error as error,
            personas_proxima as personas, plan_proximo as plan
       from public.bancard_cuentas where empresa_id = $1`, [c.empresaId]);
  const programado = async (c) => {
    const f = await cuenta(c);
    return f ? [f.plan, f.personas] : [null, null];
  };
  const opDe = (id) => J('select * from public.bancard_operaciones where id = $1', [id]);
  const tope = async (c) => (await J('select public.tope_de_miembros($1) n', [c.empresaId])).n;
  const miembros = async (c) => (await J('select count(*)::int n from public.miembros where empresa_id = $1', [c.empresaId])).n;
  const renovacion = async (c) => {
    const f = await J('select public.bancard_importe_de_renovacion($1)::float i', [c.empresaId]);
    return f.i;
  };
  const registroDe = async (c, accion) => (await db.query(
    `select accion, actor_id, detalle from public.registro_admin
      where empresa_id = $1 and ($2::text is null or accion = $2) order by created_at, id`, [c.empresaId, accion ?? null])).rows;
  const comisionDe = async (c) => (await db.query(
    `select base::float as base, monto::float as monto, importe::float as importe, estado
       from public.comisiones where empresa_id = $1`, [c.empresaId])).rows;
  const yaPago = async (c) => (await J('select public.cuenta_ya_pago($1) j', [c.empresaId])).j;

  /** El plan vence dentro de tanto (texto de intervalo: '15 days', '2 hours'). No toca lo programado. */
  const venceEn = (c, cuanto) => conLoProgramado(c, () => db.query(
    `update public.suscripciones set periodo_fin = now() + $2::interval where empresa_id = $1`, [c.empresaId, cuanto]));
  /** A la prueba le queda tanto por delante (null = ya terminó hace rato). */
  const pruebaEn = (c, cuanto) => db.query(
    `update public.suscripciones
        set prueba_fin = case when $2::text is null then now() - interval '40 days' else now() + $2::interval end
      where empresa_id = $1`, [c.empresaId, cuanto]);
  /** Pasan N días para esa cuenta: todo lo que tiene fecha se corre para atrás. */
  const pasanDias = (c, n) => conLoProgramado(c, async () => {
    await db.query(`update public.suscripciones set periodo_fin = periodo_fin - make_interval(days => $2::int) where empresa_id = $1`, [c.empresaId, n]);
    await db.query(`update public.bancard_cuentas set ultimo_intento = ultimo_intento - $2::int, ciclo_fin = ciclo_fin - $2::int where empresa_id = $1`, [c.empresaId, n]);
    await db.query(
      `update public.bancard_operaciones
          set created_at = created_at - make_interval(days => $2::int), confirmada_at = confirmada_at - make_interval(days => $2::int)
        where empresa_id = $1`, [c.empresaId, n]);
  });
  /**
   * Mover la fecha a mano dispara `bancard_baja_caduca`, que borra lo
   * programado (es lo que tiene que hacer cuando la suscripción cambia de
   * verdad). Acá el tiempo «pasa» de mentira: lo programado se repone.
   */
  async function conLoProgramado(c, fn) {
    const hay = (await db.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'bancard_cuentas' and column_name = 'plan_proximo'`)).rows.length > 0;
    const antes = (await db.query(
      `select personas_proxima${hay ? ', plan_proximo' : ''} from public.bancard_cuentas where empresa_id = $1`, [c.empresaId])).rows[0];
    const r = await fn();
    if (antes && (antes.personas_proxima !== null || (hay && antes.plan_proximo !== null))) {
      await db.query(
        `update public.bancard_cuentas set personas_proxima = $2${hay ? ', plan_proximo = $3' : ''} where empresa_id = $1`,
        hay ? [c.empresaId, antes.personas_proxima, antes.plan_proximo] : [c.empresaId, antes.personas_proxima]);
    }
    return r;
  }

  /** Carga un movimiento en cada uno de esos días (0 = hoy, 1 = ayer…): la racha. */
  async function cargar(c, haceDias) {
    for (const d of haceDias) {
      await db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
         values ($1, 'gasto', public.hoy_empresa($1) - $2::int, 'Algo', 'Otros', 1000, 1000)`, [c.empresaId, d]);
    }
  }
  /** Guarda una tarjeta: queda activa, con el débito prendido y al día. */
  async function guardarTarjeta(c, entorno = 'produccion') {
    const cat = await S('select public.bancard_crear_catastro($1,$2,$3,$4,$5) j',
      [c.empresaId, c.uid, entorno, '0981123456', 'Autorizo el cobro de cada renovación.']);
    await S('select public.bancard_activar_tarjeta($1,$2,$3,$4) j', [cat.card_id, 'Visa', '0016', 'credit']);
    c.tarjeta = cat.card_id;
    c.pagador = cat.user_id;
    return c;
  }
  /** Saca la cuenta del medio para que la tarea no la tome en otra prueba. */
  const apagar = (c) => db.query('update public.bancard_cuentas set debito_activo = false where empresa_id = $1', [c.empresaId]);

  let serie = 0;
  /** Una cuenta nueva (en prueba), con su nombre a mano. */
  async function nueva(nombre, opciones = {}) {
    const email = `c${++serie}@cambio.test`;
    const c = await H.montarEmpresa(db, { email, nombre, ...opciones });
    c.nombre = nombre;
    c.email = email;
    return c;
  }
  /** Suma personas al equipo (entran con el código, como en la vida real). */
  async function sumarGente(c, cuantas) {
    const uids = [];
    for (let i = 0; i < cuantas; i++) uids.push(await H.sumarMiembro(db, c.empresaId, `p${++serie}@cambio.test`));
    return uids;
  }
  /**
   * Una cuenta con un plan PAGO y vigente: pagó por Bancard, la prueba ya
   * terminó hace rato (salvo que se diga otra cosa) y le falta lo que se pida.
   */
  async function activa(nombre, plan, { periodo = 'mensual', personas = null, falta = '15 days', entorno = 'staging',
    gente = 0, prueba = null, opciones = {} } = {}) {
    const c = await nueva(nombre, opciones);
    await pagar(c, entorno, plan, periodo, personas);
    if (gente) await sumarGente(c, gente);
    await pruebaEn(c, prueba);
    await venceEn(c, falta);
    return c;
  }

  return {
    db, J, S, intentoS, U, intentoU, SQL, crear, intentoCrear, confirmar, pagar, tomar, bajar, estado,
    cotizarCambio, intentoCotizarCambio, programar, intentoProgramar, sus, cuenta, programado, opDe, tope, miembros,
    renovacion, registroDe, comisionDe, yaPago, venceEn, pruebaEn, pasanDias, cargar, guardarTarjeta, apagar,
    nueva, sumarGente, activa,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Para comparar dos bases: todo lo que cambia de una corrida a otra (los
// uuid, los números de pedido, las fechas) se pasa a algo que no cambia.
// ─────────────────────────────────────────────────────────────────────────
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ES_INSTANTE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA = 86400000;

function normalizador(ctx) {
  const dias = (ms) => { const n = Math.round(ms / DIA); return n === 0 ? 0 : n; };
  const fechaADias = (aaaa, mm, dd) => dias(Date.UTC(+aaaa, +mm - 1, +dd) - Date.parse(`${ctx.hoy}T00:00:00Z`));
  const texto = (s) => {
    if (ES_UUID.test(s)) return ctx.nombres.get(s) ?? '‹uuid›';
    if (ES_INSTANTE.test(s) && !Number.isNaN(Date.parse(s))) return `‹en ${dias(Date.parse(s) - Date.now())} días›`;
    if (ES_FECHA.test(s)) { const [a, m, d] = s.split('-'); return `‹fecha ${fechaADias(a, m, d)}›`; }
    return s
      .replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, (_, d, m, a) => `‹fecha ${fechaADias(a, m, d)}›`)
      .replace(/\b1\d{6}\b/g, (n) => ctx.pedidos.get(Number(n)) ?? n);
  };
  const norm = (v, clave) => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return `‹en ${dias(v.getTime() - Date.now())} días›`;
    if (typeof v === 'string') return texto(v);
    if (typeof v === 'number') {
      if (ctx.pedidos.has(v)) return ctx.pedidos.get(v);
      // Los números que Orden le da a Bancard (usuario y tarjeta) salen de
      // secuencias: valen lo mismo en las dos bases, pero no hacen al caso.
      if (clave === 'user_id' || clave === 'card_id' || clave === 'id') return '‹n›';
      return v;
    }
    if (typeof v === 'bigint') return norm(Number(v), clave);
    if (Array.isArray(v)) return v.map((x) => norm(x, clave));
    if (typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) o[k] = norm(v[k], k);
      return o;
    }
    return v;
  };
  return norm;
}

/** `despues`, pero solo con las claves que tenía `antes` (a cualquier profundidad). */
function conLasClavesDe(antes, despues) {
  if (Array.isArray(antes) && Array.isArray(despues) && antes.length === despues.length) {
    return antes.map((a, i) => conLasClavesDe(a, despues[i]));
  }
  if (antes && despues && typeof antes === 'object' && typeof despues === 'object'
      && !Array.isArray(antes) && !Array.isArray(despues)) {
    const o = {};
    for (const k of Object.keys(antes)) o[k] = conLasClavesDe(antes[k], despues[k]);
    return o;
  }
  return despues;
}

/** Las claves que `despues` tiene y `antes` no, con su camino. */
function clavesNuevas(antes, despues, camino = '', juntas = new Set()) {
  if (Array.isArray(antes) && Array.isArray(despues)) {
    despues.forEach((d, i) => clavesNuevas(antes[i], d, `${camino}[]`, juntas));
  } else if (antes && despues && typeof antes === 'object' && typeof despues === 'object') {
    for (const k of Object.keys(despues)) {
      if (!(k in antes)) juntas.add(`${camino}.${k}`);
      else clavesNuevas(antes[k], despues[k], `${camino}.${k}`, juntas);
    }
  }
  return juntas;
}

// ─────────────────────────────────────────────────────────────────────────
// EL GUION: lo que hace el código publicado, igual en las dos bases.
//
// `enElMedio` corre entre la primera mitad y la segunda. En una base no hace
// nada; en la otra aplica la 130. Así la segunda mitad confirma, revierte y
// cobra cosas que nacieron ANTES de la 130, que es lo que va a pasar en
// producción el día que se aplique.
// ─────────────────────────────────────────────────────────────────────────
async function guion(db, enElMedio) {
  const T = herramientas(db);
  const { J, S, intentoS, U, intentoU, SQL } = T;
  const ctx = { nombres: new Map(), pedidos: new Map(), hoy: null };
  const norm = normalizador(ctx);
  const pasos = [];
  const paso = (nombre, valor) => { pasos.push([nombre, norm(valor)]); };
  /** Cada pedido tiene su nombre: los números de pedido no tienen por qué coincidir. */
  const pedido = (nombre, o) => { if (o && o.operacion) ctx.pedidos.set(Number(o.operacion), `‹pedido ${nombre}›`); return o; };
  const error = (r) => (r.ok ? { ok: true, valor: r.valor.rows[0]?.j ?? null } : { error: r.error });

  const cuentas = {};
  const montar = async (clave, nombre, opciones = {}) => {
    const c = await H.montarEmpresa(db, { email: `${clave}@compat.test`, nombre, ...opciones });
    c.nombre = nombre;
    c.clave = clave;
    ctx.nombres.set(c.empresaId, `‹empresa ${clave}›`);
    ctx.nombres.set(c.uid, `‹dueño ${clave}›`);
    cuentas[clave] = c;
    return c;
  };
  const gente = async (c, cuantas) => {
    for (let i = 0; i < cuantas; i++) {
      const uid = await H.sumarMiembro(db, c.empresaId, `${c.clave}-${i}@compat.test`);
      ctx.nombres.set(uid, `‹persona ${c.clave} ${i}›`);
    }
  };
  const crear = async (nombre, c, entorno, tipo, medio, plan, periodo, personas) =>
    pedido(nombre, await T.crear(c, entorno, tipo, medio, plan, periodo, personas));
  const fotoDe = async (c) => ({
    suscripcion: await J(
      `select plan, estado, periodo, tope_vendedores, importe::float as importe, proveedor_pago, moneda,
              periodo_fin, public.plan_efectivo_calculado(empresa_id) as efectivo
         from public.suscripciones where empresa_id = $1`, [c.empresaId]),
    bancard: await J(
      `select debito_activo, debito_estado, intentos, ultimo_error, ultimo_codigo, personas_proxima,
              ciclo_fin::text as ciclo_fin, ultimo_intento::text as ultimo_intento
         from public.bancard_cuentas where empresa_id = $1`, [c.empresaId]) ?? null,
    pedidos: (await db.query(
      `select id, tipo, medio, origen, plan, periodo, personas, estado, importe::float as importe, lista::float as lista,
              extras::float as extras, descuento::float as descuento, descripcion, revisar, fuente, vence_despues,
              (ingreso_id is not null) as con_ingreso, (comision_id is not null) as con_comision
         from public.bancard_operaciones where empresa_id = $1 order by id`, [c.empresaId])).rows,
    registro: (await db.query(
      `select accion, detalle - 'ingreso_id' - 'deshecho_at' as detalle from public.registro_admin
        where empresa_id = $1 order by created_at, id`, [c.empresaId])).rows,
    comision: (await db.query(
      `select base::float as base, monto::float as monto, importe::float as importe, estado
         from public.comisiones where empresa_id = $1`, [c.empresaId])).rows,
    tope: (await J('select public.tope_de_miembros(p_empresa => $1) n', [c.empresaId])).n,
  });
  const ingresosDeOrden = async () => (await db.query(
    `select descripcion, monto::float as monto, metodo_pago, estado::text as estado
       from public.movimientos where empresa_id = $1 and tipo = 'ingreso' order by created_at, id`, [jefe.empresaId])).rows;

  // ---- la administración, la empresa de Orden y un socio
  const jefe = await montar('orden', 'Orden SA');
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe.uid]);
  await H.comoUsuario(db, jefe.uid, () => db.query('select public.definir_empresa_orden($1)', [jefe.empresaId]));
  await db.query(`insert into public.socios (nombre, codigo, activo) values ('Socio Uno', 'SOCIO1', true)`);
  ctx.hoy = (await J('select public.hoy_empresa($1)::text d', [jefe.empresaId])).d;
  const cobrarAMano = (c, plan, importe, vendedores = null, meses = 1) =>
    U(jefe.uid, 'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5,$6) j', [c.empresaId, plan, meses, '', importe, vendedores]);

  // ══════════════ PRIMERA MITAD (en las dos bases, sin la 130) ══════════════

  // 1 · Sola, paga el Básico el primer día.
  const sola = await montar('sola', 'Kiosco de una persona');
  const o1 = await crear('básico de sola', sola, 'produccion', 'plan', 'formulario', 'basico', 'mensual', null);
  paso('crear un pago de plan (Básico)', o1);
  paso('  y confirmarlo', await T.confirmar(o1.operacion, aprobada(o1.operacion, o1.importe)));
  paso('  cómo queda la cuenta', await fotoDe(sola));

  // 2 · Tres personas, con socio, pagan el Pro. Ese pago se revierte DESPUÉS.
  const tres = await montar('tres', 'Despensa de tres');
  await gente(tres, 2);
  await H.comoUsuario(db, jefe.uid, () => db.query('select public.asignar_referido($1,$2,$3)', [tres.empresaId, 'SOCIO1', '']));
  const o2 = await crear('pro de tres', tres, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
  paso('el Pro de tres personas, con socio: la confirmación trae la comisión', await T.confirmar(o2.operacion, aprobada(o2.operacion, o2.importe), 'consulta'));
  paso('  cómo queda', await fotoDe(tres));

  // 3 · Premium de 6, con cuatro personas. «Sumar hasta 8» queda A MEDIO PAGAR.
  const premium = await montar('premium', 'Ferretería de seis');
  const o3 = await crear('premium de 6', premium, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 6);
  await T.confirmar(o3.operacion, aprobada(o3.operacion, o3.importe));
  await gente(premium, 3);
  await db.query(`update public.suscripciones set periodo_fin = now() + interval '15 days', prueba_fin = now() - interval '30 days' where empresa_id = $1`, [premium.empresaId]);
  paso('cotizar sumar personas (de 6 a 8, 15 días)', await U(premium.uid, SQL.cotizarPersonas, [premium.empresaId, 8]));
  const o3b = await crear('sumar 2 a premium', premium, 'produccion', 'personas', 'formulario', null, null, 8);
  await S('select public.bancard_guardar_proceso($1,$2) j', [o3b.operacion, 'pf*compat']);
  paso('crear «sumar personas»: queda viva, sin pagar todavía', o3b);

  // 4 · Con tarjeta guardada: la tarea le crea el cobro, que queda A MEDIO COBRAR.
  const debito = await montar('debito', 'Almacén con débito');
  const o4 = await crear('pro de débito', debito, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
  await T.confirmar(o4.operacion, aprobada(o4.operacion, o4.importe));
  await T.guardarTarjeta(debito);
  await db.query(`update public.suscripciones set periodo_fin = now() + interval '1 day', prueba_fin = now() - interval '30 days' where empresa_id = $1`, [debito.empresaId]);
  const cobro4 = pedido('cobro automático de débito', await T.tomar());
  paso('la tarea toma el cobro del día anterior al vencimiento', cobro4);
  paso('  y no lo toma dos veces', await T.tomar());

  // 5 · Staging: plata de mentira, el año, 5 personas.
  const prueba = await montar('staging', 'Cuenta de prueba');
  const o5 = await crear('premium anual en staging', prueba, 'staging', 'plan', 'formulario', 'negocio', 'anual', 5);
  paso('un pago de staging (Premium anual de 5)', await T.confirmar(o5.operacion, aprobada(o5.operacion, o5.importe)));
  paso('  cómo queda', await fotoDe(prueba));

  // 6 · Un pago viejo de otro plan, que va a entrar DESPUÉS con el Premium activo.
  const cruzada = await montar('cruzada', 'Dos pagos cruzados');
  const o6 = await crear('pro viejo de cruzada', cruzada, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
  await S(`select public.bancard_cerrar_operacion($1,'vencida','{}') j`, [o6.operacion]);
  const o6b = await crear('premium de cruzada', cruzada, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 8);
  await T.confirmar(o6b.operacion, aprobada(o6b.operacion, o6b.importe));

  // 7 · Las que el aviso de vencimiento tiene que nombrar.
  const enPrueba = await montar('aviso-prueba', 'Aviso en prueba');
  await db.query(`update public.suscripciones set periodo_fin = now() + interval '3 days', prueba_fin = now() + interval '3 days' where empresa_id = $1`, [enPrueba.empresaId]);
  const aMano = await montar('aviso-mano', 'Aviso sin tarjeta');
  await cobrarAMano(aMano, 'pro', 190000);
  await U(jefe.uid, 'select public.habilitar_bancard($1,true) j', [aMano.empresaId]);
  await db.query(`update public.suscripciones set periodo_fin = now() + interval '1 day' where empresa_id = $1`, [aMano.empresaId]);
  const conTarjeta = await montar('aviso-tarjeta', 'Aviso con tarjeta');
  const o7 = await crear('premium de aviso', conTarjeta, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 5);
  await T.confirmar(o7.operacion, aprobada(o7.operacion, o7.importe));
  await T.guardarTarjeta(conTarjeta);
  await db.query(`update public.suscripciones set periodo_fin = now() + interval '3 days', prueba_fin = now() - interval '30 days' where empresa_id = $1`, [conTarjeta.empresaId]);

  // 8 · Pro pago y vigente: el freno de cambiar de plan con días pagos.
  const frenada = await montar('frenada', 'Pro con días pagos');
  const o8 = await crear('pro de frenada', frenada, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
  await T.confirmar(o8.operacion, aprobada(o8.operacion, o8.importe));

  // 9 · Tres personas en la prueba y un pago del Básico YA CREADO (la decisión 4
  //     no existía, y con la 130 va apagada): se confirma al final, fuera del
  //     guion.
  const apretada = await montar('apretada', 'Tres en un Básico');
  await gente(apretada, 2);
  const o9 = await crear('básico de apretada', apretada, 'produccion', 'plan', 'formulario', 'basico', 'mensual', null);
  paso('un Básico con tres personas en el equipo se podía crear', o9);

  // ══════════════ EN EL MEDIO ══════════════
  /** Todo lo que el código publicado LEE, cuenta por cuenta. */
  const lecturas = async () => {
    const todo = {};
    for (const c of Object.values(cuentas)) {
      const leido = {};
      for (const entorno of ['produccion', 'staging']) leido[`estado ${entorno}`] = error(await intentoU(c.uid, SQL.estado, [c.empresaId, entorno]));
      for (const [plan, personas] of [['basico', null], ['pro', null], ['negocio', 4], ['negocio', 8]]) {
        for (const periodo of ['mensual', 'anual']) {
          leido[`cotizar ${plan} ${periodo} ${personas ?? ''}`] = error(await intentoU(c.uid, SQL.cotizarPlan, [c.empresaId, plan, periodo, personas]));
        }
      }
      leido['cotizar sumar 9'] = error(await intentoU(c.uid, SQL.cotizarPersonas, [c.empresaId, 9]));
      leido['pagos (administración)'] = error(await intentoU(jefe.uid, SQL.admin, [c.empresaId, 50]));
      leido.tope = (await J('select public.tope_de_miembros(p_empresa => $1) n', [c.empresaId])).n;
      leido['personas de renovación'] = (await J('select public.bancard_personas_de_renovacion($1) n', [c.empresaId])).n;
      leido['importe de renovación'] = (await J('select public.bancard_importe_de_renovacion($1)::float n', [c.empresaId])).n;
      leido.foto = await fotoDe(c);
      todo[c.clave] = leido;
    }
    todo['aviso de vencimiento'] = await S(SQL.avisos);
    todo['por conciliar'] = await S(`select public.bancard_por_conciliar('produccion') j`);
    todo['ingresos de Orden'] = await ingresosDeOrden();
    return norm(todo);
  };
  await enElMedio({ T, cuentas, jefe, lecturas });

  // ══════════════ SEGUNDA MITAD (en una de las dos, ya con la 130) ══════════════

  // 3 · «Sumar personas», que había quedado viva.
  paso('la misma «sumar personas» se reusa (doble clic)', await T.crear(premium, 'produccion', 'personas', 'formulario', null, null, 8));
  paso('se confirma la «sumar personas» que nació antes', await T.confirmar(o3b.operacion, aprobada(o3b.operacion, o3b.importe)));
  paso('  cómo queda el Premium', await fotoDe(premium));
  paso('bajar a 6 personas desde la próxima renovación', await T.bajar(premium, 6));
  paso('  el tope baja en el acto', (await J('select public.tope_de_miembros(p_empresa => $1) n', [premium.empresaId])).n);
  paso('  renovar por otra cantidad se rechaza', error(await T.intentoCrear(premium, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 8)));
  const o3c = await crear('renovación de premium por 6', premium, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 6);
  paso('  la renovación por 6 se confirma y aplica la baja', await T.confirmar(o3c.operacion, aprobada(o3c.operacion, o3c.importe)));
  paso('  cómo queda', await fotoDe(premium));
  paso('  lo que ve la pantalla', await U(premium.uid, SQL.estado, [premium.empresaId, 'produccion']));

  // 4 · El cobro automático que había quedado a medio cobrar.
  paso('el cobro automático que nació antes: aprobado', await T.confirmar(cobro4.operacion, aprobada(cobro4.operacion, cobro4.importe), 'charge'));
  paso('  cómo queda', await fotoDe(debito));
  // Otro vencimiento: rechazado, y sus dos reintentos.
  await db.query(`update public.suscripciones set periodo_fin = now() + interval '1 day' where empresa_id = $1`, [debito.empresaId]);
  await db.query('update public.bancard_cuentas set ultimo_intento = ultimo_intento - 31 where empresa_id = $1', [debito.empresaId]);
  await db.query(`update public.bancard_operaciones set created_at = created_at - interval '31 days', confirmada_at = confirmada_at - interval '31 days' where empresa_id = $1`, [debito.empresaId]);
  const cobro4b = pedido('segundo cobro de débito', await T.tomar());
  paso('al mes siguiente, otra vez el día anterior', cobro4b);
  paso('  rechazado por fondos: reintenta', await T.confirmar(cobro4b.operacion, rechazo(cobro4b.operacion, cobro4b.importe), 'charge'));
  await T.pasanDias(debito, 2);
  const cobro4c = pedido('reintento de débito', await T.tomar());
  paso('  el reintento del día +1 cobra lo mismo', cobro4c);
  paso('  y entra: se renueva desde hoy', await T.confirmar(cobro4c.operacion, aprobada(cobro4c.operacion, cobro4c.importe), 'charge'));
  paso('  cómo queda', await fotoDe(debito));
  paso('  nadie más para cobrar', await T.tomar());

  // 2 · Revertir el pago que entró ANTES de la 130.
  const revertir = (op, comprobar = false, sinBancard = false) =>
    intentoS(SQL.revertir, [op, jefe.uid, 'Prueba de reversa', comprobar, sinBancard]);
  paso('revertir (solo comprobar) el Pro de tres', error(await revertir(o2.operacion, true)));
  paso('revertirlo de verdad: vuelve a la prueba, anula el ingreso y borra la comisión', error(await revertir(o2.operacion)));
  paso('  cómo queda', await fotoDe(tres));
  paso('  revertirlo dos veces', error(await revertir(o2.operacion)));
  const o2b = await crear('pro de tres, otra vez', tres, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
  paso('vuelve a pagar: la comisión nace de nuevo', await T.confirmar(o2b.operacion, aprobada(o2b.operacion, o2b.importe)));
  const o2c = await crear('renovación de tres', tres, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
  await T.confirmar(o2c.operacion, aprobada(o2c.operacion, o2c.importe));
  paso('con un pago posterior, el anterior no se revierte', error(await revertir(o2b.operacion, true)));
  // Pasa un día para todo lo de esa cuenta (el último pago sigue siendo el último).
  await db.query(`update public.bancard_operaciones set created_at = created_at - interval '1 day', confirmada_at = confirmada_at - interval '1 day' where empresa_id = $1`, [tres.empresaId]);
  await db.query(`update public.registro_admin set created_at = created_at - interval '1 day' where empresa_id = $1`, [tres.empresaId]);
  paso('al día siguiente: por el portal', error(await revertir(o2c.operacion)));
  paso('  y marcándolo «ya lo anulé»', error(await revertir(o2c.operacion, false, true)));
  paso('  cómo queda', await fotoDe(tres));
  paso('«deshacer el último cambio» sigue sin comerse un pago de Bancard',
    error(await intentoU(jefe.uid, 'select public.deshacer_ultimo_cambio($1) j', [tres.empresaId])));

  // 6 · El pago viejo de otro plan entra con el Premium activo.
  paso('un pago viejo de Pro con el Premium activo: conflicto, no le baja el plan',
    await T.confirmar(o6.operacion, aprobada(o6.operacion, o6.importe)));
  paso('  cómo queda', await fotoDe(cruzada));

  // 8 · El freno y los rechazos de siempre.
  paso('cambiar de plan con días pagos por el pago de plan: el freno', error(await T.intentoCrear(frenada, 'produccion', 'plan', 'formulario', 'basico', 'mensual', null)));
  paso('  hacia arriba también', error(await T.intentoCrear(frenada, 'produccion', 'plan', 'formulario', 'negocio', 'mensual', 4)));
  paso('  renovar el mismo plan, por año: pasa', await crear('pro anual de frenada', frenada, 'produccion', 'plan', 'formulario', 'pro', 'anual', null));
  paso('un tipo que no existe', error(await T.intentoCrear(sola, 'produccion', 'regalo', 'formulario', 'pro', 'mensual', null)));
  paso('un vendedor no paga', error(await T.intentoCrear(tres, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null,
    [...ctx.nombres.entries()].find(([, n]) => n === '‹persona tres 0›')[0])));
  paso('con tarjeta guardada y sin tarjeta', error(await T.intentoCrear(sola, 'produccion', 'plan', 'token', 'basico', 'mensual', null)));

  // 10 · Otro importe, y después el bueno.
  const importe = await montar('importe', 'Importe equivocado');
  const o10 = await crear('pro de importe', importe, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
  paso('una confirmación por otro importe no activa', await T.confirmar(o10.operacion, aprobada(o10.operacion, 1)));
  paso('  un rechazo', await T.confirmar(o10.operacion, rechazo(o10.operacion, o10.importe, '05', 'NO APROBADO')));
  paso('  y la buena', await T.confirmar(o10.operacion, aprobada(o10.operacion, o10.importe), 'consulta'));
  paso('  dos veces: «ya»', await T.confirmar(o10.operacion, aprobada(o10.operacion, o10.importe)));
  paso('  cómo queda', await fotoDe(importe));
  paso('  lo que ve quien pagó', await U(importe.uid, SQL.ver, [o10.operacion]));

  // 11 · Una cuenta personal.
  const persona = await montar('persona', 'Gastos de Ana', { tipoCuenta: 'personal' });
  const o11 = await crear('pro personal', persona, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
  paso('el Pro de una cuenta personal', await T.confirmar(o11.operacion, aprobada(o11.operacion, o11.importe)));
  paso('  cómo queda', await fotoDe(persona));

  // 12 · El tope de personas, en la puerta.
  const llena = await montar('llena', 'Pro con sus tres');
  const o12 = await crear('pro de llena', llena, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
  await T.confirmar(o12.operacion, aprobada(o12.operacion, o12.importe));
  await gente(llena, 2);
  const cuarto = await H.crearUsuario(db, 'cuarto@compat.test');
  paso('la cuarta persona no entra a un Pro', error(await intentoU(cuarto, 'select public.unirse_empresa($1, $2) j', [await H.codigoDe(db, llena.empresaId), 'Cuarto'])));
  paso('  y el Básico sigue siendo de una', error(await intentoU(cuarto, 'select public.unirse_empresa($1, $2) j', [await H.codigoDe(db, sola.empresaId), 'Cuarto'])));

  // Y todo lo que se lee, al final.
  paso('TODO lo que lee el código publicado, cuenta por cuenta, al terminar', await lecturas());

  return { T, pasos, cuentas, jefe, ctx, norm, pedidoApretada: o9 };
}

/** Cada función de `public`: su firma, qué devuelve, cómo corre y quién la puede llamar. */
async function catalogo(db) {
  const filas = (await db.query(
    `select p.oid::regprocedure::text as firma, p.proname as nombre, p.prorettype::regtype::text as devuelve,
            p.prosecdef as definer, p.provolatile::text as volatil, coalesce(p.proconfig::text, '') as config,
            has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as sesion,
            has_function_privilege('service_role', p.oid, 'EXECUTE') as servicio
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)).rows;
  return new Map(filas.map((f) => [f.firma, f]));
}

// 08/10: son trece. Se sumó `pago_de_plan_sin_lugar`, la hermana de la llave
// de la decisión 4 que contesta sí o no (por ella preguntan la marca «para
// revisar» y lo que se anuncia), para que TODO se apague con una sola línea.
const NUEVAS = ['bancard_plan_de_renovacion', 'bancard_programar_plan', 'bancard_rechazadas_abiertas', 'bancard_renovacion_frenada',
  'cotizar_cambio', 'dias_para_adelantar_la_baja',
  'exigir_lugar_para_el_equipo', 'lugares_del_plan', 'nivel_de_plan', 'nombre_de_plan', 'pago_de_plan_exige_lugar',
  'pago_de_plan_sin_lugar', 'prorrateo_de_plan'];
/** Las que la 130 vuelve a definir, y de qué migración sale la versión anterior. */
const RECOPIADAS = ['bancard_descripcion', 'bancard_personas_de_renovacion', 'bancard_importe_de_renovacion',
  'bancard_crear_operacion_interna', 'bancard_confirmar', 'bancard_revertir', 'bancard_tomar_cobro', 'bancard_estado',
  'bancard_bajar_personas', 'tope_de_miembros', 'bancard_baja_caduca', 'vencimientos_por_avisar'];

async function principal() {
  const t0 = Date.now();
  const sql130 = leer(`supabase/migrations/${ARCHIVO_130}`);
  console.log(`La 130 es ${ARCHIVO_130}; lo de antes llega hasta la ${ULTIMA_ANTERIOR}.`);

  // ═════════════════════════════════════════════════════════════════════
  // PARTE 0 · COMPATIBILIDAD
  //
  // La 130 se aplica en producción ANTES de publicar el código nuevo.
  // Mientras tanto, el código de hoy le habla a la base nueva.
  // ═════════════════════════════════════════════════════════════════════
  grupo('0 · Dos bases, el mismo guion: una sin la 130, la otra con la 130 aplicada en el medio');
  const baseSin = await H.crearBase({ hasta: ULTIMA_ANTERIOR });
  ok('la base de antes no tiene nada de la 130',
    [(await baseSin.query(`select count(*)::int n from information_schema.columns where table_name = 'bancard_cuentas' and column_name = 'plan_proximo'`)).rows[0].n,
      (await baseSin.query(`select count(*)::int n from pg_proc where proname = any($1)`, [NUEVAS])).rows[0].n], [0, 0]);
  const sin = await guion(baseSin, async () => {});

  const db = await H.crearBase({ hasta: ULTIMA_ANTERIOR });
  let medio = null;
  const con = await guion(db, async ({ lecturas }) => {
    const leidoAntes = await lecturas();
    const catalogoAntes = await catalogo(db);
    // Supabase le da EXECUTE a anon, authenticated y service_role sobre toda
    // función nueva (privilegios por defecto del esquema). Se ponen ANTES de
    // aplicar: así se ve que la 130 revoca de verdad.
    await db.exec('alter default privileges in schema public grant execute on functions to anon, authenticated, service_role');
    await db.exec('create function public.zz_control_de_privilegios() returns integer language sql as $f$ select 1 $f$');
    const control = (await db.query(
      `select has_function_privilege('anon', 'public.zz_control_de_privilegios()', 'EXECUTE') as anon,
              has_function_privilege('authenticated', 'public.zz_control_de_privilegios()', 'EXECUTE') as sesion`)).rows[0];
    await db.exec('drop function public.zz_control_de_privilegios()');
    const archivo = await H.aplicarMigracion(db, '130');
    const leidoDespues = await lecturas();
    const catalogoDespues = await catalogo(db);
    let segunda = null;
    try { await H.aplicarMigracion(db, '130'); } catch (e) { segunda = e.message; }
    medio = { leidoAntes, leidoDespues, leidoDosVeces: await lecturas(), catalogoAntes, catalogoDespues,
      catalogoDosVeces: await catalogo(db), control, archivo, segunda };
  });
  console.log(`  · ${medio.archivo} aplicada en el medio del guion, sobre una base con pagos a medio hacer`);

  // ---- las mismas cuentas, antes y después de aplicarla
  ok('los privilegios por defecto de Supabase estaban puestos (una función cualquiera nacía abierta a anon)',
    [medio.control.anon, medio.control.sesion], [true, true]);
  const nuevasAlLeer = new Set();
  for (const clave of Object.keys(medio.leidoAntes)) {
    const a = medio.leidoAntes[clave];
    const d = medio.leidoDespues[clave];
    ok(`lo que se lee de «${clave}» es igual antes y después de aplicarla`, conLasClavesDe(a, d), a);
    for (const k of clavesNuevas(a, d)) nuevasAlLeer.add(k.replace(/\[\]/g, ''));
  }
  ok('y lo ÚNICO que se suma al leer son estas claves (nadie las lee todavía)', [...nuevasAlLeer].sort(),
    ['.estado produccion.valor.miembros', '.estado produccion.valor.plan_proximo', '.estado produccion.valor.plan_proximo_pagable',
      '.estado staging.valor.miembros', '.estado staging.valor.plan_proximo', '.estado staging.valor.plan_proximo_pagable',
      '.plan_renovacion', '.precio_renovacion']);
  ok('con nada programado, las claves nuevas no dicen nada',
    [Object.values(medio.leidoDespues).map((l) => l['estado produccion']?.valor).filter((e) => e && (e.plan_proximo !== null || e.plan_proximo_pagable !== false)),
      medio.leidoDespues['aviso de vencimiento'].filter((f) => f.plan_renovacion !== f.plan || f.precio_renovacion !== f.precio)],
    [[], []]);
  ok('el aviso de vencimiento nombra a las cuatro cuentas que tocan (1 y 3 días), como siempre',
    medio.leidoDespues['aviso de vencimiento'].map((f) => [f.dias, f.nombre, f.plan, f.importe]),
    [[1, 'Almacén con débito', 'pro', 190000], [1, 'Aviso sin tarjeta', 'pro', 190000], [3, 'Aviso con tarjeta', 'negocio', 310000], [3, 'Aviso en prueba', 'pro', 190000]]);

  // ---- las funciones: ninguna cambia de firma, de permisos ni de forma de correr
  const cambiadas = [];
  for (const [firma, f] of medio.catalogoAntes) {
    const g = medio.catalogoDespues.get(firma);
    if (!g || JSON.stringify(g) !== JSON.stringify(f)) cambiadas.push(firma);
  }
  ok(`de las ${medio.catalogoAntes.size} funciones que había, ninguna cambió de firma, de lo que devuelve, de permisos ni de search_path`, cambiadas, []);
  ok('las funciones nuevas son estas trece, una firma cada una',
    [...medio.catalogoDespues.values()].filter((f) => !medio.catalogoAntes.has(f.firma)).map((f) => f.nombre).sort(), NUEVAS);
  ok('y de las que se vuelven a definir sigue habiendo una sola de cada una (con dos, PostgREST no sabría cuál llamar)',
    RECOPIADAS.map((n) => [...medio.catalogoDespues.values()].filter((f) => f.nombre === n).length), RECOPIADAS.map(() => 1));
  ok('aplicarla dos veces seguidas: sin error, se lee lo mismo y el catálogo es el mismo',
    [medio.segunda, JSON.stringify(medio.leidoDosVeces) === JSON.stringify(medio.leidoDespues),
      JSON.stringify([...medio.catalogoDosVeces]) === JSON.stringify([...medio.catalogoDespues])], [null, true, true]);

  // ---- el guion entero, paso por paso
  grupo('0a · Paso por paso, las dos bases cuentan lo mismo');
  ok('los mismos pasos, en el mismo orden', con.pasos.map((p) => p[0]), sin.pasos.map((p) => p[0]));
  const nuevasEnElGuion = new Set();
  for (let i = 0; i < sin.pasos.length; i++) {
    const [nombre, a] = sin.pasos[i];
    const d = con.pasos[i]?.[1];
    for (const k of clavesNuevas(a, d)) nuevasEnElGuion.add(k.replace(/\[\]/g, '').replace(/^\.[^.]+(?=\.(estado |pagos |foto))/, ''));
    if (nombre.startsWith('TODO lo que lee')) {
      for (const clave of Object.keys(a)) ok(`igual al terminar · ${clave}`, conLasClavesDe(a[clave], d?.[clave]), a[clave]);
    } else {
      ok(`igual · ${nombre.trim()}`, conLasClavesDe(a, d), a);
    }
  }
  ok('y lo ÚNICO que la base nueva dice de más en todo el guion',
    [...nuevasEnElGuion].sort(),
    [ // cada fila del aviso de vencimiento
      '.aviso de vencimiento.plan_renovacion', '.aviso de vencimiento.precio_renovacion',
      // bancard_estado (leído al final, en los dos entornos)
      '.estado produccion.valor.miembros', '.estado produccion.valor.plan_proximo', '.estado produccion.valor.plan_proximo_pagable',
      '.estado staging.valor.miembros', '.estado staging.valor.plan_proximo', '.estado staging.valor.plan_proximo_pagable',
      // el renglón de una reversa (leído al final)
      '.foto.registro.detalle.personas_de_mas',
      // bancard_estado (el paso «lo que ve la pantalla»)
      '.miembros',
      // la foto `antes` de un pago, que ve la administración
      '.pagos (administración).valor.operaciones.antes.conflicto', '.pagos (administración).valor.operaciones.antes.plan_proximo',
      // la respuesta de bancard_confirmar; y otra vez bancard_estado
      '.plan_antes', '.plan_proximo', '.plan_proximo_pagable',
      // el renglón de una reversa y la respuesta de bancard_revertir
      '.registro.detalle.personas_de_mas',
      '.valor.personas_de_mas']);

  // ═════════════════════════════════════════════════════════════════════
  // LA DECISIÓN 4, CASO POR CASO, PARA EL CÓDIGO PUBLICADO
  //
  // Es lo único de la 130 que le podía cambiar algo a quien usa el código
  // de hoy, y solo a una cuenta con más personas en el equipo que lugares
  // tiene el plan que paga. Va APAGADA. Los mismos cuatro casos se corren
  // tres veces:
  //   · sobre la base SIN la 130 (lo de antes);
  //   · sobre la base CON la 130, como va a producción (0b): lo mismo;
  //   · sobre esa misma base con la decisión PRENDIDA (0c): lo que estas
  //     pruebas afirmaban cuando la 130 la traía prendida.
  // `yaCreado` es el pago del caso c: uno que nació antes y se confirma acá.
  // ═════════════════════════════════════════════════════════════════════
  const decision4 = async (G, yaCreado = { pedido: G.pedidoApretada, cuenta: G.cuentas.apretada }) => {
    const T = G.T;
    const jefe = G.jefe;
    const cobrarAMano = (c, plan, importe, vendedores = null) =>
      T.U(jefe.uid, 'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5,$6) j', [c.empresaId, plan, 1, '', importe, vendedores]);
    const r = {};
    const texto = (x) => (x.ok ? x.valor.rows[0].j : x.error);

    // a. Un pago a mano: tres personas en la prueba quieren el Básico (1 lugar).
    const p1 = await T.nueva('Tres quieren el Básico');
    await T.sumarGente(p1, 2);
    r.aMano = texto(await T.intentoCrear(p1, 'produccion', 'plan', 'formulario', 'basico', 'mensual', null));
    r.aManoPedidos = (await T.J('select count(*)::int n from public.bancard_operaciones where empresa_id = $1', [p1.empresaId])).n;
    // …y el Pro (3 lugares), que les alcanza, sigue igual.
    const p2 = await T.nueva('Tres quieren el Pro');
    await T.sumarGente(p2, 2);
    r.elQueAlcanza = (await T.crear(p2, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null)).importe;
    // La cotización de la pantalla publicada no cambia: muestra el precio.
    r.cotizacion = (await T.U(p1.uid, T.SQL.cotizarPlan, [p1.empresaId, 'basico', 'mensual', null])).total;

    // b. El cobro automático: un Pro con cinco personas (la administración
    //    lo pasó de un Premium sin número al Pro por transferencia).
    const p3 = await T.nueva('Cinco en un Pro');
    await cobrarAMano(p3, 'negocio', 250000);
    await T.sumarGente(p3, 4);
    await cobrarAMano(p3, 'pro', 190000);
    await T.guardarTarjeta(p3);
    await T.db.query(`update public.suscripciones set periodo_fin = now() + interval '1 day' where empresa_id = $1`, [p3.empresaId]);
    const tomado = await T.tomar();
    r.automatico = tomado && tomado.operacion ? { importe: tomado.importe, descripcion: tomado.descripcion }
      : { pausada: tomado?.pausada === p3.empresaId, motivo: tomado?.motivo };
    r.debito = await T.J('select debito_estado as estado, ultimo_error as error from public.bancard_cuentas where empresa_id = $1', [p3.empresaId]);
    r.suscripcion = [(await T.sus(p3)).plan, (await T.sus(p3)).estado];
    // Fuera del camino de la tarea: estos casos se corren más de una vez
    // sobre la misma base, y las pruebas de más abajo esperan otras cuentas.
    await T.apagar(p3);

    // c. Un pago que ya estaba creado (el Básico de «Tres en un Básico», del
    //    guion: nació antes de la 130) y se confirma después.
    const o9 = yaCreado.pedido;
    const conf = await T.confirmar(o9.operacion, aprobada(o9.operacion, o9.importe));
    const apretada = yaCreado.cuenta;
    r.yaCreado = { aprobada: conf.aprobada, conflicto: conf.conflicto, revisar: conf.revisar,
      plan: (await T.sus(apretada)).plan, estado: (await T.sus(apretada)).estado, tope: await T.tope(apretada),
      miembros: await T.miembros(apretada), paraRevisar: (await T.opDe(o9.operacion)).revisar };

    // d. Lo que se le ANUNCIA (revisión 08/10). Un Básico con tres personas
    //    (activado por transferencia: la administración no mira el equipo),
    //    con su tarjeta guardada, que vence mañana. Y uno igual, de una sola
    //    persona, de control. Solo se llama lo que el código publicado llama.
    const anuncio = async (nombre, gente) => {
      const c = await T.nueva(nombre);
      if (gente) await T.sumarGente(c, gente);
      await cobrarAMano(c, 'basico', 110000);
      await T.guardarTarjeta(c);
      await T.db.query(`update public.suscripciones set periodo_fin = now() + interval '1 day' where empresa_id = $1`, [c.empresaId]);
      const fila = (await T.S(T.SQL.avisos)).find((f) => f.empresa_id === c.empresaId);
      const e = await T.estado(c);
      // Fuera del camino de la tarea: las pruebas de más abajo esperan otras cuentas.
      await T.apagar(c);
      return { dias: fila.dias, importe: Number(fila.importe), debito: fila.debito && [fila.debito.marca, fila.debito.ultimos4],
        estado: e.debito.estado, conFecha: e.debito.fecha_cobro !== null, proximoCobro: e.debito.importe };
    };
    r.anuncioDeTres = await anuncio('Kiosco de tres con Básico', 2);
    r.anuncioDeUno = await anuncio('Kiosco de uno con Básico', 0);
    return r;
  };
  /** Lo que se anuncia cuando el cobro automático va a salir, y lo que se lee cuando un pago de plan se creó. */
  const ANUNCIADO = { dias: 1, importe: 110000, debito: ['Visa', '0016'], estado: 'al_dia', conFecha: true, proximoCobro: 110000 };
  const SIN_MARCA = { aprobada: true, conflicto: false, revisar: null, plan: 'basico', estado: 'activa', tope: 1, miembros: 3, paraRevisar: null };
  /** Los cuatro casos, sin lo que cambia de una base a otra (el número de pedido, las fechas del desglose). */
  const loQueCuenta = (d) => ({ ...d, aMano: typeof d.aMano === 'string' ? d.aMano : { importe: d.aMano.importe, descripcion: d.aMano.descripcion } });

  // ═════════════════════════════════════════════════════════════════════
  grupo('0b · La decisión 4 APAGADA, como va a producción: a la cuenta con más gente que lugares tampoco le cambia nada');
  // ═════════════════════════════════════════════════════════════════════
  ok('la 130 la trae apagada: `pago_de_plan_exige_lugar` empieza con «return;», y así quedó en la base al aplicarla',
    [D4.archivo, D4.apagada, await D4.enLaBase(db)], [ARCHIVO_130, true, 'apagada']);
  ok('  prenderla es sacar UNA línea: sin el «return;», lo primero que hace es exigir el lugar',
    [D4.textoApagada.split('\n').length - D4.textoPrendida.split('\n').length,
      D4.textoApagada.split('\n').filter((l) => !D4.textoPrendida.split('\n').includes(l)).map((l) => l.trim()), D4.primeraPrendida],
    [1, ['return;'], 'perform public.exigir_lugar_para_el_equipo(p_empresa, p_plan, p_personas);']);
  const d4sin = await decision4(sin);
  const d4con = await decision4(con);
  ok('a. NADA SE FRENA: tres personas en la prueba pagan el Básico (de una), antes y después de la 130',
    [[d4sin.aMano.importe, d4sin.aManoPedidos], [d4con.aMano.importe, d4con.aManoPedidos]], [[110000, 1], [110000, 1]]);
  ok('a. el plan que les alcanza (Pro, tres lugares) se paga igual en las dos', [d4sin.elQueAlcanza, d4con.elQueAlcanza], [190000, 190000]);
  ok('a. y la cotización que muestra la pantalla publicada no cambia', [d4sin.cotizacion, d4con.cotizacion], [110000, 110000]);
  ok('b. NADA SE PAUSA: la tarea le cobra el Pro a un equipo de cinco, antes y después; el débito sigue al día',
    [[d4sin.automatico, d4sin.debito], [d4con.automatico, d4con.debito]],
    [1, 2].map(() => [{ importe: 190000, descripcion: 'Orden Pro' }, { estado: 'al_dia', error: null }]));
  ok('b. en ninguna de las dos se le toca el plan', [d4sin.suscripcion, d4con.suscripcion], [['pro', 'activa'], ['pro', 'activa']]);
  ok('c. NADA SE MARCA: un Básico ya creado para un equipo de tres se activa sin quedar «para revisar», antes y después',
    [d4sin.yaCreado, d4con.yaCreado], [SIN_MARCA, SIN_MARCA]);
  ok('d. LOS AVISOS PROMETEN EL COBRO COMO ANTES: al Básico de tres con tarjeta, el aviso de vencimiento y «Próximo cobro» le anuncian el cobro automático',
    [d4sin.anuncioDeTres, d4con.anuncioDeTres], [ANUNCIADO, ANUNCIADO]);
  ok('d. y a la cuenta donde el equipo sí entra, igual en las dos', [d4sin.anuncioDeUno, d4con.anuncioDeUno], [ANUNCIADO, ANUNCIADO]);
  ok('los cuatro casos enteros: la base con la 130 contesta lo mismo que la base sin la 130', loQueCuenta(d4con), loQueCuenta(d4sin));
  await baseSin.close();

  // ═════════════════════════════════════════════════════════════════════
  grupo('0c · La decisión 4 PRENDIDA (la misma función de la 130, sin su «return;»): lo que cambiaría, caso por caso');
  // ═════════════════════════════════════════════════════════════════════
  {
    // El caso c necesita un pago que nació con la decisión APAGADA y se
    // confirma con ella prendida: es lo que va a pasar con los pagos a medio
    // hacer el día que se prenda.
    const otraApretada = await con.T.nueva('Otros tres en un Básico');
    await con.T.sumarGente(otraApretada, 2);
    const o9b = await con.T.crear(otraApretada, 'produccion', 'plan', 'formulario', 'basico', 'mensual', null);
    ok('todavía apagada: el Básico de otro equipo de tres se crea, y queda a medio pagar', [o9b.importe, typeof o9b.operacion], [110000, 'number']);
    await D4.prender(db);
    ok('prendida en la base de pruebas', await D4.enLaBase(db), 'prendida');
    const d4 = await decision4(con, { pedido: o9b, cuenta: otraApretada });
    ok('a. ANTES: tres personas pagaban el Básico (de una) y se quedaban las tres', [d4sin.aMano.importe, d4sin.aManoPedidos], [110000, 1]);
    ok('a. PRENDIDA: el pago se frena y dice qué hacer; no se crea nada', [d4.aMano, d4.aManoPedidos],
      [equipoNoEntra(3, 'Básico', 1), 0]);
    ok('a. el plan que les alcanza (Pro, tres lugares) se paga igual', [d4sin.elQueAlcanza, d4.elQueAlcanza], [190000, 190000]);
    ok('a. y la cotización que muestra la pantalla publicada no cambia', [d4sin.cotizacion, d4.cotizacion], [110000, 110000]);
    ok('b. ANTES: la tarea le cobraba el Pro a un equipo de cinco',
      [d4sin.automatico, d4sin.debito], [{ importe: 190000, descripcion: 'Orden Pro' }, { estado: 'al_dia', error: null }]);
    ok('b. PRENDIDA: no se crea el cobro; el débito queda pausado con el motivo y la tarea le avisa a la administración',
      [d4.automatico, d4.debito],
      [{ pausada: true, motivo: equipoNoEntra(5, 'Pro', 3) }, { estado: 'pausado', error: equipoNoEntra(5, 'Pro', 3) }]);
    ok('b. en ninguna de las dos se le toca el plan', [d4sin.suscripcion, d4.suscripcion], [['pro', 'activa'], ['pro', 'activa']]);
    ok('c. ANTES: un Básico ya creado para un equipo de tres se activaba sin decir nada', d4sin.yaCreado, SIN_MARCA);
    ok('c. PRENDIDA: se activa IGUAL (la plata entró), y queda para que lo mire la administración', d4.yaCreado,
      { aprobada: true, conflicto: false, revisar: PARA_REVISAR_EQUIPO, plan: 'basico', estado: 'activa', tope: 1, miembros: 3,
        paraRevisar: PARA_REVISAR_EQUIPO });
    // d. La tarea no le va a cobrar (caso b): entonces nadie se lo puede anunciar.
    ok('d. ANTES: al Básico de tres con tarjeta, el aviso de vencimiento y «Próximo cobro» le anunciaban el cobro automático',
      d4sin.anuncioDeTres, ANUNCIADO);
    ok('d. PRENDIDA: el aviso va sin «debito» (le dice que pague) y la pantalla sin fecha de cobro: no se promete lo que la tarea va a frenar',
      d4.anuncioDeTres, { dias: 1, importe: 110000, debito: null, estado: 'al_dia', conFecha: false, proximoCobro: 110000 });
    ok('d. a la cuenta donde el equipo sí entra se le sigue anunciando, igual en las dos',
      [d4sin.anuncioDeUno, d4.anuncioDeUno], [ANUNCIADO, ANUNCIADO]);
    await D4.apagar(db);
    ok('y de vuelta apagada, como la deja la 130: lo que sigue corre como va a producción', await D4.enLaBase(db), 'apagada');
  }

  // De acá en adelante, lo nuevo: sobre la base a la que se le aplicó la 130
  // con datos adentro.
  const T = con.T;
  const { J, S, intentoS, U, intentoU, SQL } = T;
  const jefe = con.jefe;
  const cobrarAMano = (c, plan, importe, vendedores = null, meses = 1) =>
    U(jefe.uid, 'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5,$6) j', [c.empresaId, plan, meses, '', importe, vendedores]);
  const referir = (c) => H.comoUsuario(db, jefe.uid, () => db.query('select public.asignar_referido($1,$2,$3)', [c.empresaId, 'SOCIO1', '']));
  const ingresosDe = async (op) => (await db.query(
    `select monto::float as monto, estado::text as estado from public.movimientos
      where empresa_id = $1 and tipo = 'ingreso' and descripcion like $2 order by created_at`, [jefe.empresaId, `%Bancard ${op}`])).rows;
  const revertir = (op, comprobar = false, sinBancard = false) =>
    intentoS(SQL.revertir, [op, jefe.uid, 'Prueba de reversa', comprobar, sinBancard]);
  const cerrar = (op, clave = 'abandonada') => S(`select public.bancard_cerrar_operacion($1,'vencida',$2) j`, [op, { clave }]);
  const mismaFecha = async (c, instante) =>
    (await J('select ($2::timestamptz = periodo_fin) v from public.suscripciones where empresa_id = $1', [c.empresaId, instante])).v;
  /** Sube de plan y lo paga. */
  const subir = async (c, plan, personas = null, entorno = 'staging') => {
    const o = await T.crear(c, entorno, 'cambio', 'formulario', plan, null, personas);
    if (!o || !o.operacion) throw new Error(`no se creó el cambio de ${c.nombre}: ${JSON.stringify(o)}`);
    const r = await T.confirmar(o.operacion, aprobada(o.operacion, o.importe));
    return { ...o, r };
  };
  const rango = (n) => Array.from({ length: n }, (_, i) => i);
  /** Lo que contestó una llamada que puede fallar: el json, o el texto del error. */
  const j = (r) => (r.ok ? r.valor.rows[0].j : r.error);
  const mensaje = (r) => (r.ok ? '(no fue rechazada)' : r.error);

  // ═════════════════════════════════════════════════════════════════════
  grupo('1 · Subir: la tabla de ejemplos del diseño, al guaraní');
  // ═════════════════════════════════════════════════════════════════════
  const basM = await T.activa('Básico por mes', 'basico');
  const proM = await T.activa('Pro por mes', 'pro');
  const basA = await T.activa('Básico por año', 'basico', { periodo: 'anual', falta: '200 days' });
  const proA = await T.activa('Pro por año', 'pro', { periodo: 'anual', falta: '200 days' });
  {
    const q = await T.cotizarCambio(basM, 'pro');
    ok('Básico → Pro con 15 días por delante: la mitad de los 80.000 de diferencia',
      [q.plan_antes, q.plan, q.periodo, q.precio_antes, q.precio, q.diferencia, q.dias_restantes, q.dias_gratis, q.dias_pagos,
        q.dias_cobrados, q.dias_del_periodo, q.importe, q.total, q.moneda],
      ['basico', 'pro', 'mensual', 110000, 190000, 80000, 15, 0, 15, 15, 30, 40000, 40000, 'PYG']);
    ok('la fecha que devuelve es la del vencimiento, que no cambia', await mismaFecha(basM, q.vence_hasta), true);
    ok('y dice cuánto sale el plan nuevo desde la renovación: sin descuento, las dos iguales',
      [q.renovacion, q.renovacion_hoy, q.descuento_fase, q.descuento_porcentaje, q.personas, q.personas_min, q.miembros],
      [190000, 190000, null, 0, null, null, 1]);
    ok('las claves de la cotización, todas', Object.keys(q).sort(),
      ['descuento_fase', 'descuento_porcentaje', 'dias_cobrados', 'dias_del_periodo', 'dias_gratis', 'dias_pagos', 'dias_restantes',
        'diferencia', 'importe', 'miembros', 'moneda', 'periodo', 'personas', 'personas_incluidas', 'personas_max', 'personas_min',
        'plan', 'plan_antes', 'precio', 'precio_antes', 'precio_por_persona', 'renovacion', 'renovacion_hoy', 'total', 'vence_hasta']);
    const p6 = await T.cotizarCambio(basM, 'negocio', 6);
    ok('al Premium se eligen las personas: de 6, (250.000 + 2 × 60.000) − 110.000 = 260.000 por mes',
      [p6.precio, p6.diferencia, p6.importe, p6.personas, p6.personas_min, p6.personas_max, p6.personas_incluidas, p6.precio_por_persona, p6.renovacion],
      [370000, 260000, 130000, 6, 4, 15, 4, 60000, 370000]);

    /** El importe con cada cantidad de días por delante. */
    const fila = async (c, plan, personas, faltas) => {
      const r = [];
      for (const f of faltas) { await T.venceEn(c, f); r.push((await T.cotizarCambio(c, plan, personas)).importe); }
      return r;
    };
    // «Falta 1 día» = vence en dos horas. «Recién pagado» = 31 días (un mes de 31).
    const MES = ['2 hours', '15 days', '29 days', '31 days'];
    ok('por mes · Básico → Pro (diferencia 80.000): 1, 15, 29 días y recién pagado',
      await fila(basM, 'pro', null, MES), [2667, 40000, 77333, 80000]);
    ok('por mes · Básico → Premium de 4 (140.000)', await fila(basM, 'negocio', 4, MES), [4667, 70000, 135333, 140000]);
    ok('por mes · Básico → Premium de 6 (260.000)', await fila(basM, 'negocio', 6, MES), [8667, 130000, 251333, 260000]);
    ok('por mes · Pro → Premium de 4 (60.000)', await fila(proM, 'negocio', 4, MES), [2000, 30000, 58000, 60000]);
    // Con 10 días de prueba arrastrados (pagó con 10 días de prueba por delante: 41).
    await T.pruebaEn(basM, '10 days');
    await T.pruebaEn(proM, '10 days');
    ok('por mes · con 10 días de prueba por delante (41 en total): la diferencia de un mes, ni un guaraní más',
      [...await fila(basM, 'pro', null, ['41 days']), ...await fila(basM, 'negocio', 4, ['41 days']),
        ...await fila(basM, 'negocio', 6, ['41 days']), ...await fila(proM, 'negocio', 4, ['41 days'])],
      [80000, 140000, 260000, 60000]);
    await T.pruebaEn(basM, null);
    await T.pruebaEn(proM, null);

    // El año: sobre 365 días, con la lista de 11 meses.
    const ANIO = ['2 hours', '15 days', '29 days', '200 days', '366 days'];
    const a = await T.cotizarCambio(basA, 'pro');
    ok('por año · la diferencia sale sola de la lista de 11 meses: 2.090.000 − 1.210.000',
      [a.periodo, a.precio_antes, a.precio, a.diferencia, a.dias_del_periodo], ['anual', 1210000, 2090000, 880000, 365]);
    ok('por año · Básico → Pro (880.000): 1, 15, 29, 200 días y recién pagado',
      await fila(basA, 'pro', null, ANIO), [2411, 36164, 69918, 482192, 880000]);
    ok('por año · Básico → Premium de 4 (1.540.000)', await fila(basA, 'negocio', 4, ANIO), [4219, 63288, 122356, 843836, 1540000]);
    ok('por año · Básico → Premium de 6 (2.860.000)', await fila(basA, 'negocio', 6, ANIO), [7836, 117534, 227233, 1567123, 2860000]);
    ok('por año · Pro → Premium de 4 (660.000); el más chico que puede salir es 1.808',
      await fila(proA, 'negocio', 4, ANIO), [1808, 27123, 52438, 361644, 660000]);
  }

  await T.venceEn(basM, '15 days');
  await T.venceEn(proM, '15 days');
  await T.venceEn(basA, '200 days');
  await T.venceEn(proA, '200 days');

  // ═════════════════════════════════════════════════════════════════════
  grupo('2 · Qué días se cobran: los de prueba no; los pagos, todos');
  // ═════════════════════════════════════════════════════════════════════
  {
    /** [días que faltan, de prueba, pagos, cobrados, importe] de Básico → Pro. */
    const dias = async (c, falta, prueba = null) => {
      await T.pruebaEn(c, prueba);
      await T.venceEn(c, falta);
      const q = await T.cotizarCambio(c, 'pro');
      return [q.dias_restantes, q.dias_gratis, q.dias_pagos, q.dias_cobrados, q.importe];
    };
    ok('recién pagado en un mes de 31 días: se cobran 30, la diferencia de un mes', await dias(basM, '31 days'), [31, 0, 31, 30, 80000]);
    ok('en un mes de 30', await dias(basM, '30 days'), [30, 0, 30, 30, 80000]);
    ok('recién pagado en FEBRERO (28 días): 74.667, no 80.000. La base es 30 fija, como en «sumar personas»: se deja así y queda escrito',
      await dias(basM, '28 days'), [28, 0, 28, 28, 74667]);
    ok('pagó con 10 días de prueba por delante (41): esos 10 no se cobran', await dias(basM, '41 days', '10 days'), [41, 10, 31, 30, 80000]);
    ok('  y a mitad de esos días de prueba (quedan 4 de prueba, 35 en total) sigue siendo el mes entero',
      await dias(basM, '35 days', '4 days'), [35, 4, 31, 30, 80000]);
    ok('los mismos 41 días, todos PAGOS (renovó antes de subir): se cobran los 41', await dias(basM, '41 days'), [41, 0, 41, 41, 109333]);
    ok('51 días pagos: 136.000 (con el tope del diseño pagaba 80.000 y se llevaba 21 días de regalo)', await dias(basM, '51 days'), [51, 0, 51, 51, 136000]);
    ok('62 días pagos (dos meses de 31): todavía se puede', await dias(basM, '62 days'), [62, 0, 62, 62, 165333]);
    await T.venceEn(basM, '63 days');
    rechazado('63 días pagos (más de dos períodos): el freno de siempre', await T.intentoCotizarCambio(basM, 'pro'), FRENO);
    await T.venceEn(basM, '365 days');
    rechazado('una cuenta activada por transferencia por 12 meses (365 días, «mensual»): el freno', await T.intentoCotizarCambio(basM, 'pro'), FRENO);
    ok('la prueba estirada por la administración (66 días, 35 de prueba): paga el mes, no cae en el freno',
      await dias(basM, '66 days', '35 days'), [66, 35, 31, 30, 80000]);
    ok('si los días de prueba llegaran hasta el vencimiento, igual se cobra un día (nunca Gs. 1)',
      await dias(basM, '5 days', '10 days'), [5, 4, 1, 1, 2667]);
    ok('por año · recién pagado en un año de 366 días: se cobran 365', await dias(basA, '366 days'), [366, 0, 366, 365, 880000]);
    ok('por año · con 10 días de prueba por delante (376)', await dias(basA, '376 days', '10 days'), [376, 10, 366, 365, 880000]);
    ok('por año · 387 días pagos: se cobran los 387', await dias(basA, '387 days'), [387, 0, 387, 387, 933041]);
    ok('por año · 732 días (dos años): todavía', await dias(basA, '732 days'), [732, 0, 732, 732, 1764822]);
    await T.venceEn(basA, '733 days');
    rechazado('por año · 733: el freno', await T.intentoCotizarCambio(basA, 'pro'), FRENO);
    await T.pruebaEn(basM, null); await T.venceEn(basM, '15 days');
    await T.pruebaEn(basA, null); await T.venceEn(basA, '200 days');

    // Dos cambios seguidos cuestan lo mismo que uno.
    for (const [falta, uno, dos, junto] of [['15 days', 40000, 30000, 70000], ['29 days', 77333, 58000, 135333], ['31 days', 80000, 60000, 140000]]) {
      const escalera = await T.activa(`En dos pasos (${falta})`, 'basico', { falta });
      const directo = await T.activa(`De una (${falta})`, 'basico', { falta });
      const s1 = await subir(escalera, 'pro');
      const s2 = await subir(escalera, 'negocio', 4);
      const d1 = await subir(directo, 'negocio', 4);
      ok(`Básico → Pro → Premium de 4 con ${falta}: ${uno} + ${dos} = lo mismo que de una`,
        [s1.importe, s2.importe, s1.importe + s2.importe, d1.importe, (await T.sus(escalera)).plan, (await T.sus(directo)).plan],
        [uno, dos, junto, junto, 'negocio', 'negocio']);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('3 · Lo que no se puede cotizar');
  // ═════════════════════════════════════════════════════════════════════
  const vendedorPro = (await T.sumarGente(proM, 1))[0];
  const ajeno = await T.nueva('Otro negocio');
  {
    rechazado('al mismo plan', await T.intentoCotizarCambio(proM, 'pro'), NO_VALIDO);
    rechazado('a un plan más bajo (bajar no se cobra: se programa)', await T.intentoCotizarCambio(proM, 'basico'), NO_VALIDO);
    rechazado('a un plan que no existe', await T.intentoCotizarCambio(proM, 'oro'), NO_VALIDO);
    rechazado('a «gratis»', await T.intentoCotizarCambio(proM, 'gratis'), NO_VALIDO);
    rechazado('sin decir a cuál', await T.intentoCotizarCambio(proM, null), NO_VALIDO);
    rechazado('Premium sin decir cuántas personas', await T.intentoCotizarCambio(proM, 'negocio', null), 'cuántas personas');
    rechazado('Premium de 3', await T.intentoCotizarCambio(proM, 'negocio', 3), 'entre 4 y 15');
    rechazado('Premium de 16', await T.intentoCotizarCambio(proM, 'negocio', 16), 'entre 4 y 15');
    rechazado('Pro con cantidad de personas', await T.intentoCotizarCambio(basM, 'pro', 5), 'no lleva cantidad de personas');
    const campo = await T.activa('Estancia', 'basico', { opciones: { rubro: 'ganaderia' } });
    rechazado('un plan que su rubro no ofrece (el campo no tiene Premium)', await T.intentoCotizarCambio(campo, 'negocio', 4), 'no está disponible para tu rubro');
    ok('  y el que sí ofrece, sí', (await T.cotizarCambio(campo, 'pro')).importe, 40000);
    rechazado('un vendedor no ve cuánto cuesta', await T.intentoCotizarCambio(proM, 'negocio', 4, vendedorPro), 'Solo el dueño de la cuenta puede ver esto');
    rechazado('el dueño de OTRA cuenta, tampoco', await T.intentoCotizarCambio(proM, 'negocio', 4, ajeno.uid), 'Solo el dueño de la cuenta puede ver esto');
    ok('la administración de Orden sí', (await T.cotizarCambio(proM, 'negocio', 4, jefe.uid)).importe, 30000);

    // Si un día la diferencia fuera cero o negativa (los precios viven en una tabla).
    const precioPro = `update public.precios set importe = $1 where tipo_cuenta = 'emprendedor' and plan = 'pro' and moneda = 'PYG' and periodo = 'mensual'`;
    await db.query(precioPro, [110000]);
    rechazado('con el Pro al precio del Básico (diferencia cero): el freno, nunca un cobro de Gs. 1', await T.intentoCotizarCambio(basM, 'pro'), FRENO);
    await db.query(precioPro, [90000]);
    rechazado('y con el Pro más barato que el Básico (diferencia negativa)', await T.intentoCotizarCambio(basM, 'pro'), FRENO);
    await db.query(precioPro, [190000]);
    ok('con el precio de vuelta, vuelve a cotizar', (await T.cotizarCambio(basM, 'pro')).importe, 40000);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('4 · Crear el pago de un cambio: todo congelado, y el período es el de la cuenta');
  // ═════════════════════════════════════════════════════════════════════
  // Pagó el Básico en STAGING (no cuenta como «ya pagó») y sube en PRODUCCIÓN.
  const sube = await T.activa('Sube al Pro', 'basico');
  let opSube;
  {
    ok('las descripciones del cambio entran en los 20 caracteres de Bancard, en ASCII',
      (await db.query(`select public.bancard_descripcion('cambio', p) d from unnest(array['pro','negocio','basico', null]) p`))
        .rows.map((r) => [r.d, r.d.length <= 20, /^[ -~]+$/.test(r.d)]),
      [['Orden cambio Pro', true, true], ['Orden cambio Premium', true, true], ['Orden cambio de plan', true, true], ['Orden cambio de plan', true, true]]);
    ok('y las de siempre no cambiaron',
      (await db.query(`select public.bancard_descripcion(t, p) d from (values ('plan','basico'),('plan','pro'),('plan','negocio'),('personas','negocio')) v(t, p)`)).rows.map((r) => r.d),
      ['Orden Basico', 'Orden Pro', 'Orden Premium', 'Orden mas personas']);

    const cotizado = await T.cotizarCambio(sube, 'pro');
    // El navegador no manda período; si alguien mandara «anual», se ignora.
    opSube = await T.crear(sube, 'produccion', 'cambio', 'formulario', 'pro', 'anual', null);
    const fila = await T.opDe(opSube.operacion);
    ok('el pago del cambio: el importe sale de la base y la descripción dice qué es',
      [opSube.importe, opSube.moneda, opSube.descripcion, opSube.reusada], [40000, 'PYG', 'Orden cambio Pro', false]);
    ok('la operación guarda el plan de DESTINO y el período de la CUENTA (se pidió «anual» y quedó «mensual»)',
      [fila.tipo, fila.plan, fila.periodo, fila.personas, fila.medio, fila.origen, fila.estado, fila.entorno],
      ['cambio', 'pro', 'mensual', null, 'formulario', 'usuario', 'creada', 'produccion']);
    ok('lista = el importe; sin extras ni descuento',
      [Number(fila.lista), Number(fila.extras), Number(fila.descuento), Number(fila.importe)], [40000, 0, 0, 40000]);
    ok('el desglose congelado es, letra por letra, lo que la pantalla cotizó', opSube.desglose, cotizado);

    await S('select public.bancard_guardar_proceso($1,$2) j', [opSube.operacion, 'pf*cambio']);
    const misma = await T.crear(sube, 'produccion', 'cambio', 'formulario', 'pro', null, null);
    ok('doble clic: la MISMA operación (sin período en el pedido, que es como lo manda la pantalla)',
      [misma.operacion === opSube.operacion, misma.reusada, misma.process_id, misma.importe], [true, true, 'pf*cambio', 40000]);
    ok('otro pedido con ese vivo: no se crea nada',
      [await T.crear(sube, 'produccion', 'cambio', 'formulario', 'negocio', null, 4), await T.crear(sube, 'produccion', 'plan', 'formulario', 'basico', 'mensual', null)],
      [{ viva: opSube.operacion, medio: 'formulario', estado: 'creada' }, { viva: opSube.operacion, medio: 'formulario', estado: 'creada' }]);
    ok('sigue habiendo una sola operación viva de esa cuenta',
      (await J(`select count(*)::int n from public.bancard_operaciones where empresa_id = $1 and estado = 'creada'`, [sube.empresaId])).n, 1);

    rechazado('un vendedor no puede iniciar un cambio', await T.intentoCrear(proM, 'staging', 'cambio', 'formulario', 'negocio', null, 4, vendedorPro), 'Solo el dueño de la cuenta puede pagar');
    rechazado('ni el dueño de otra cuenta', await T.intentoCrear(proM, 'staging', 'cambio', 'formulario', 'negocio', null, 4, ajeno.uid), 'Solo el dueño de la cuenta puede pagar');
    rechazado('al mismo plan, por el pago', await T.intentoCrear(proM, 'staging', 'cambio', 'formulario', 'pro', null, null), NO_VALIDO);
    rechazado('hacia abajo, por el pago', await T.intentoCrear(proM, 'staging', 'cambio', 'formulario', 'basico', null, null), NO_VALIDO);
    rechazado('las validaciones del precio también frenan acá', await T.intentoCrear(proM, 'staging', 'cambio', 'formulario', 'negocio', null, 3), 'entre 4 y 15');
    rechazado('con la tarjeta guardada y sin tarjeta', await T.intentoCrear(proM, 'staging', 'cambio', 'token', 'negocio', null, 4), 'No hay una tarjeta guardada');
    rechazado('y cambiar de plan por el pago de plan sigue frenado, como antes', await T.intentoCrear(proM, 'staging', 'plan', 'formulario', 'negocio', 'mensual', 4), FRENO);

    // Con la tarjeta guardada.
    const conVisa = await T.activa('Sube con su tarjeta', 'basico');
    await T.guardarTarjeta(conVisa, 'staging');
    const ot = await T.crear(conVisa, 'staging', 'cambio', 'token', 'negocio', null, 6);
    ok('con la tarjeta guardada: la operación trae el usuario y la tarjeta de Bancard, y el Premium sus personas',
      [ot.importe, ot.descripcion, ot.user_id === conVisa.pagador, ot.card_id === conVisa.tarjeta, (await T.opDe(ot.operacion)).personas, (await T.opDe(ot.operacion)).medio],
      [130000, 'Orden cambio Premium', true, true, 6, 'token']);
    await T.confirmar(ot.operacion, aprobada(ot.operacion, ot.importe, { amount: 130000 }), 'charge');
    ok('  y al confirmarse queda en Premium con las 6 que pagó',
      [(await T.sus(conVisa)).plan, (await T.sus(conVisa)).tope_vendedores, await T.tope(conVisa)], ['negocio', 5, 6]);
    await T.apagar(conVisa);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('5 · Confirmar un cambio: cambia el plan y NADA más');
  // ═════════════════════════════════════════════════════════════════════
  {
    const antes = await T.sus(sube);
    const yaAntes = await T.yaPago(sube);

    // ---- otro importe, y un rechazo: no cambia nada
    const mal = await T.confirmar(opSube.operacion, aprobada(opSube.operacion, 39999));
    ok('una confirmación por otro importe no activa', [mal.ok, mal.motivo, (await T.opDe(opSube.operacion)).estado, (await T.sus(sube)).plan],
      [false, 'importe', 'incierta', 'basico']);
    const no = await T.confirmar(opSube.operacion, rechazo(opSube.operacion, 40000));
    ok('un rechazo tampoco: el plan, la fecha y el tope siguen iguales',
      [no.aprobada, no.plan_antes, (await T.opDe(opSube.operacion)).estado, JSON.stringify(await T.sus(sube)) === JSON.stringify(antes)],
      [false, 'basico', 'rechazada', true]);

    // ---- la buena (un reintento adentro del mismo formulario)
    const r = await T.confirmar(opSube.operacion, aprobada(opSube.operacion, 40000), 'consulta');
    ok('aprobada: dice de qué plan a qué plan, y que no hubo conflicto',
      [r.ok, r.aprobada, r.ya, r.tipo, r.plan_antes, r.plan, r.periodo, r.personas, r.importe, r.conflicto, r.comision],
      [true, true, false, 'cambio', 'basico', 'pro', 'mensual', null, 40000, false, null]);
    const d = await T.sus(sube);
    ok('EL PLAN cambia…', [d.plan, d.efectivo, (await J('select plan from public.empresas where id = $1', [sube.empresaId])).plan], ['pro', 'pro', 'pro']);
    ok('…y nada más: la misma fecha de vencimiento, el mismo inicio, el mismo período, el mismo importe guardado, el mismo estado y medio de pago',
      [d.fin === antes.fin, d.inicio === antes.inicio, d.periodo === antes.periodo, d.importe === antes.importe, d.estado, d.proveedor_pago === antes.proveedor_pago],
      [true, true, true, true, 'activa', true]);
    ok('la confirmación dice hasta cuándo: la fecha de siempre', await mismaFecha(sube, r.vence), true);
    ok('el Pro no lleva tope propio: vale el de su plan (3)', [d.tope_vendedores, await T.tope(sube)], [null, 3]);
    const fila = await T.opDe(opSube.operacion);
    ok('la operación guarda la foto de antes (para revertir), con lo programado y si hubo conflicto',
      [fila.estado, fila.fuente, fila.antes.plan, fila.antes.tope_vendedores, fila.antes.plan_proximo, fila.antes.personas_proxima, fila.antes.conflicto,
        await mismaFecha(sube, fila.vence_despues), await mismaFecha(sube, fila.antes.periodo_fin)],
      ['pagada', 'consulta', 'basico', null, null, null, false, true, true]);
    ok('el ingreso de Orden se anota por el importe del cambio (producción)', await ingresosDe(opSube.operacion), [{ monto: 40000, estado: 'activo' }]);
    const reg = (await T.registroDe(sube)).filter((x) => x.detalle.operacion === opSube.operacion);
    ok('su renglón es «bancard_cambio», no «cambiar_plan»: de Básico a Pro, 0 meses, misma fecha',
      reg.map((x) => [x.accion, x.actor_id, x.detalle.plan_antes, x.detalle.plan_despues, x.detalle.meses, x.detalle.importe, x.detalle.tipo,
        x.detalle.vence_antes === x.detalle.vence_despues, x.detalle.tope_antes, x.detalle.tope_despues, x.detalle.via]),
      [['bancard_cambio', null, 'basico', 'pro', 0, 40000, 'cambio', true, null, null, 'bancard']]);
    ok('por eso NO cuenta como «ya pagó» (ni como primer pago): sigue como estaba', [yaAntes, await T.yaPago(sube)], [false, false]);
    ok('y no nació ninguna comisión', await T.comisionDe(sube), []);

    // ---- la misma confirmación otra vez
    const foto = JSON.stringify([await T.sus(sube), await ingresosDe(opSube.operacion), (await T.registroDe(sube)).length]);
    const r2 = await T.confirmar(opSube.operacion, aprobada(opSube.operacion, 40000));
    ok('la segunda confirmación dice «ya» y no toca nada',
      [r2.ya, r2.aprobada, r2.plan_antes, JSON.stringify([await T.sus(sube), await ingresosDe(opSube.operacion), (await T.registroDe(sube)).length]) === foto],
      [true, true, 'basico', true]);

    // ---- en staging: plata de mentira
    const enStaging = await T.activa('Sube en staging', 'basico');
    const os = await subir(enStaging, 'negocio', 6);
    ok('en staging el cambio se ACTIVA (Premium de 6: tope 5 vendedores), pero sin ingreso',
      [os.r.aprobada, (await T.sus(enStaging)).plan, (await T.sus(enStaging)).tope_vendedores, await T.tope(enStaging), (await ingresosDe(os.operacion)).length],
      [true, 'negocio', 5, 6, 0]);
    ok('y su renglón se llama «bancard_prueba», como todo lo de staging',
      (await T.registroDe(enStaging)).filter((x) => x.detalle.operacion === os.operacion).map((x) => [x.accion, x.detalle.tipo, x.detalle.plan_despues, x.detalle.meses, x.detalle.tope_despues]),
      [['bancard_prueba', 'cambio', 'negocio', 0, 5]]);
    const est = await T.estado(enStaging, 'staging');
    ok('desde ahí es un Premium con cantidad como cualquier otro: la pantalla ve sus personas',
      est.personas, { max: 15, min: 4, proxima: null, miembros: 1, contratadas: 6 });

    // ---- el último día
    const ultimo = await T.activa('Sube el último día', 'basico', { falta: '2 hours' });
    const finUltimo = (await T.sus(ultimo)).fin;
    const ou = await subir(ultimo, 'negocio', 4);
    ok('subir el último día (vence en dos horas) se puede: un día de diferencia, y la fecha no se mueve',
      [ou.importe, ou.desglose.dias_cobrados, (await T.sus(ultimo)).plan, (await T.sus(ultimo)).fin === finUltimo], [4667, 1, 'negocio', true]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('6 · Si la cuenta ya no está como se cotizó: la plata se anota y el plan no se toca');
  // ═════════════════════════════════════════════════════════════════════
  let enConflicto;   // un cambio que quedó en conflicto, para revertirlo más abajo
  {
    const MOTIVO = 'Pagó un cambio de plan y la cuenta ya no está como cuando se cotizó: resolver a mano';
    const conflicto = async (c, o) => {
      const r = await T.confirmar(o.operacion, aprobada(o.operacion, o.importe));
      const f = await T.opDe(o.operacion);
      return [r.aprobada, r.conflicto, r.revisar, f.estado, f.antes.conflicto, (await ingresosDe(o.operacion)).length,
        (await T.registroDe(c)).filter((x) => x.detalle.operacion === o.operacion).length];
    };

    // a. Renovó en el medio (el formulario viejo se paga después).
    const a = await T.activa('Renovó en el medio', 'basico', { entorno: 'produccion' });
    const oa = await T.crear(a, 'produccion', 'cambio', 'formulario', 'pro', null, null);
    await cerrar(oa.operacion);
    await T.pagar(a, 'produccion', 'basico', 'mensual', null);
    const finA = (await T.sus(a)).fin;
    ok('a. cotizó con 15 días, renovó el Básico, y después entra el pago viejo del cambio: conflicto, la plata se anota, sin renglón',
      await conflicto(a, oa), [true, true, MOTIVO, 'pagada', true, 1, 0]);
    ok('   sigue en Básico con su fecha nueva: no se le dio un mes de Pro por la diferencia de 15 días',
      [(await T.sus(a)).plan, (await T.sus(a)).fin === finA], ['basico', true]);

    // b. El plan de origen cambió.
    const b = await T.activa('Cambió dos veces', 'basico', { entorno: 'produccion' });
    const ob = await T.crear(b, 'produccion', 'cambio', 'formulario', 'negocio', null, 4);
    await cerrar(ob.operacion);
    await subir(b, 'pro', null, 'produccion');
    ok('b. cotizó Básico → Premium, subió al Pro por otro pago, y entra el primero: conflicto', await conflicto(b, ob), [true, true, MOTIVO, 'pagada', true, 1, 0]);
    ok('   queda en el Pro: no pasa al Premium por la diferencia contra el Básico', [(await T.sus(b)).plan, (await T.sus(b)).tope_vendedores], ['pro', null]);

    // c. Venció mientras pagaba (la operación estaba viva).
    enConflicto = await T.activa('Venció mientras pagaba', 'basico', { entorno: 'produccion', falta: '2 hours' });
    const oc = await T.crear(enConflicto, 'produccion', 'cambio', 'formulario', 'pro', null, null);
    await db.query(`update public.suscripciones set periodo_fin = now() - interval '10 minutes' where empresa_id = $1`, [enConflicto.empresaId]);
    ok('c. pagó Gs. 2.667 diez minutos después de vencer: conflicto', await conflicto(enConflicto, oc), [true, true, MOTIVO, 'pagada', true, 1, 0]);
    ok('   sigue en Básico, vencida', [(await T.sus(enConflicto)).plan, (await T.sus(enConflicto)).efectivo], ['basico', 'gratis']);
    enConflicto.operacion = oc.operacion;

    // d. Entra tarde, pero con todo igual: activa, y queda para revisar.
    const dd = await T.activa('Paga tarde, todo igual', 'basico');
    const od = await T.crear(dd, 'staging', 'cambio', 'formulario', 'pro', null, null);
    await cerrar(od.operacion);
    const rd = await T.confirmar(od.operacion, aprobada(od.operacion, od.importe));
    ok('d. una operación vencida que entra tarde con la cuenta igual que al cotizar: activa, y lo mira la administración',
      [rd.conflicto, rd.revisar, (await T.sus(dd)).plan], [false, 'Pago que entró tarde, sobre una operación ya vencida', 'pro']);

    // e. La administración la activó por transferencia en el medio.
    const e = await T.activa('Activada a mano en el medio', 'basico', { entorno: 'produccion' });
    const oe = await T.crear(e, 'produccion', 'cambio', 'formulario', 'pro', null, null);
    await cobrarAMano(e, 'basico', 110000);
    ok('e. con el pago vivo, la administración le sumó un mes por transferencia: la fecha ya no es la cotizada → conflicto',
      await conflicto(e, oe), [true, true, MOTIVO, 'pagada', true, 1, 0]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('7 · Después de subir: la renovación, el cobro automático y «sumar personas»');
  // ═════════════════════════════════════════════════════════════════════
  {
    ok('la renovación del que subió al Pro sale Gs. 190.000', await T.renovacion(sube), 190000);

    // Con el descuento de constancia ganado: pagó en producción y lleva 30 días seguidos.
    const constante = await T.activa('Constante', 'basico', { entorno: 'produccion' });
    await T.cargar(constante, rango(30));
    const q = await T.cotizarCambio(constante, 'pro');
    ok('con la constancia ganada, lo de HOY es igual (la diferencia va sin descuento)…',
      [q.importe, q.diferencia, q.precio_antes, q.precio], [40000, 80000, 110000, 190000]);
    ok('…y la cotización dice los dos números de la renovación: de lista y con su descuento de hoy',
      [q.renovacion, q.renovacion_hoy, q.descuento_fase, q.descuento_porcentaje], [190000, 180500, 'constancia', 5]);
    ok('que es lo mismo que dice la cotización del plan de siempre',
      (await U(constante.uid, SQL.cotizarPlan, [constante.empresaId, 'pro', 'mensual', null])).total, 180500);
    await T.guardarTarjeta(constante);
    const oc = await subir(constante, 'pro', null, 'produccion');
    const est = await T.estado(constante);
    ok('paga 40.000, y el «Próximo cobro» de la pantalla muestra el mismo 180.500 que prometió la hoja',
      [oc.importe, await T.renovacion(constante), est.debito.importe, est.plan_proximo], [40000, 180500, 180500, null]);
    const p6 = await T.cotizarCambio(constante, 'negocio', 6);
    ok('al Premium de 6: hoy 90.000 (180.000 × 15/30); la renovación 370.000, con su descuento 351.500',
      [p6.importe, p6.renovacion, p6.renovacion_hoy], [90000, 370000, 351500]);

    // En staging con la racha de la prueba ganada: no hay «ya pagó», no hay descuento.
    const enRacha = await T.nueva('Racha de la prueba, en staging');
    await db.query(
      `update public.suscripciones set created_at = now() - interval '19 days', prueba_fin = now() + interval '1 day',
              periodo_fin = now() + interval '1 day' where empresa_id = $1`, [enRacha.empresaId]);
    await T.cargar(enRacha, rango(20));
    const primer = await T.crear(enRacha, 'staging', 'plan', 'formulario', 'basico', 'mensual', null);
    await T.confirmar(primer.operacion, aprobada(primer.operacion, primer.importe));
    await T.pruebaEn(enRacha, null);
    await T.venceEn(enRacha, '15 days');
    const qr = await T.cotizarCambio(enRacha, 'pro');
    ok('quien pagó su primer mes con el 18 % de la racha (Básico a 90.200) sube al Pro por lo mismo que todos: sin descuento',
      [primer.importe, primer.desglose.descuento_fase, qr.importe, qr.renovacion, qr.renovacion_hoy, qr.descuento_fase],
      [90200, 'prueba', 40000, 190000, 190000, null]);

    // El cobro automático, después de subir, cobra el plan nuevo.
    await T.venceEn(constante, '1 day');
    const cobro = await T.tomar();
    ok('el día anterior al vencimiento la tarea cobra el plan NUEVO, con su descuento',
      [cobro.empresa_id === constante.empresaId, cobro.importe, cobro.descripcion, (await T.opDe(cobro.operacion)).plan], [true, 180500, 'Orden Pro', 'pro']);
    await T.confirmar(cobro.operacion, aprobada(cobro.operacion, cobro.importe, { amount: 180500 }), 'charge');
    ok('  y se renueva el Pro un mes más', [(await T.sus(constante)).plan, (await T.sus(constante)).importe], ['pro', 180500]);
    await T.apagar(constante);

    // «Sumar personas» sobre el Premium recién cambiado.
    const crece = await T.activa('Sube y después suma', 'basico');
    await subir(crece, 'negocio', 6);
    const mas = await U(crece.uid, SQL.cotizarPersonas, [crece.empresaId, 8]);
    ok('«sumar personas» anda sola sobre el Premium recién cambiado: de 6 a 8 con 15 días, 60.000',
      [mas.personas_antes, mas.personas, mas.importe], [6, 8, 60000]);
    await T.pagar(crece, 'staging', null, null, 8, 'personas');
    ok('  y la renovación pasa a ser por 8: 250.000 + 4 × 60.000', [(await T.sus(crece)).tope_vendedores, await T.renovacion(crece)], [7, 490000]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('8 · El socio que recomendó: un cambio no le paga ni le gasta la comisión');
  // ═════════════════════════════════════════════════════════════════════
  {
    // El socio se anotó DESPUÉS del primer pago: cobra con el próximo.
    const tarde = await T.activa('Socio anotado después', 'basico', { entorno: 'produccion' });
    await referir(tarde);
    ok('todavía no cobró nada por este negocio', await T.comisionDe(tarde), []);
    const oc = await subir(tarde, 'pro', null, 'produccion');
    ok('el «próximo pago» es el cambio de Gs. 40.000: NO se lleva los 40.000, y la única comisión del negocio sigue sin gastar',
      [oc.importe, oc.r.comision, await T.comisionDe(tarde), (await T.opDe(oc.operacion)).comision_id], [40000, null, [], null]);
    const ren = await T.pagar(tarde, 'produccion', 'pro', 'mensual', null);
    ok('cobra con la RENOVACIÓN del Pro: la mitad de un mes de lista, Gs. 95.000',
      [ren.importe, ren.r.comision.monto, await T.comisionDe(tarde)], [190000, 95000, [{ base: 190000, monto: 95000, importe: 190000, estado: 'por_pagar' }]]);

    // El socio ya cobró por el Básico: se queda con eso.
    const antes = await T.nueva('Socio anotado antes');
    await referir(antes);
    await T.pagar(antes, 'produccion', 'basico', 'mensual', null);
    await T.pruebaEn(antes, null);
    await T.venceEn(antes, '15 days');
    const comBasico = await T.comisionDe(antes);
    const op = await subir(antes, 'negocio', 4, 'produccion');
    ok('si ya cobró por el Básico (55.000) y el cliente sube al Premium, la comisión no se recalcula',
      [comBasico, op.importe, op.r.comision, await T.comisionDe(antes)],
      [[{ base: 110000, monto: 55000, importe: 110000, estado: 'por_pagar' }], 70000, null,
        [{ base: 110000, monto: 55000, importe: 110000, estado: 'por_pagar' }]]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('9 · Revertir un cambio desde la administración');
  // ═════════════════════════════════════════════════════════════════════
  {
    // ---- vuelve a la foto, no pausa el débito, y dice cuánta gente quedó de más
    const v = await T.activa('Se arrepiente', 'basico', { entorno: 'produccion' });
    await T.guardarTarjeta(v);
    const antes = await T.sus(v);
    const o = await subir(v, 'negocio', 6, 'produccion');
    await T.sumarGente(v, 4);
    ok('subió al Premium de 6 e invitó a cuatro: son cinco en el equipo', [(await T.sus(v)).plan, await T.miembros(v), await T.tope(v)], ['negocio', 5, 6]);
    rechazado('el dueño no puede revertir su propio pago', await intentoS(SQL.revertir, [o.operacion, v.uid, 'x', false, false]), 'administración de Orden');
    ok('«solo comprobar» dice que se puede y no toca nada', [j(await revertir(o.operacion, true)), (await T.sus(v)).plan], [{ puede: true }, 'negocio']);
    const rev = j(await revertir(o.operacion));
    ok('revertir: vuelve al Básico, anula el ingreso, NO pausa el débito, y avisa que quedaron 4 personas de más',
      [rev.ok, rev.plan, rev.estado, rev.ingreso_anulado, rev.comision, rev.debito_pausado, rev.personas_de_mas],
      [true, 'basico', 'activa', true, null, false, 4]);
    ok('la suscripción quedó EXACTAMENTE como antes del cambio (con la misma fecha)', await T.sus(v), antes);
    ok('no se echó a nadie: siguen los cinco, y el tope vuelve a ser el del Básico', [await T.miembros(v), await T.tope(v)], [5, 1]);
    ok('el débito sigue al día: la próxima renovación sale sola, por el plan de antes',
      [(await T.cuenta(v)).estado, (await T.cuenta(v)).error, await T.renovacion(v)], ['al_dia', null, 110000]);
    ok('el ingreso quedó anulado (no borrado) y la operación revertida',
      [await ingresosDe(o.operacion), (await T.opDe(o.operacion)).estado], [[{ monto: 130000, estado: 'anulado' }], 'revertida']);
    ok('el renglón del cambio quedó deshecho, y el de la reversa dice cuánta gente quedó de más',
      (await T.registroDe(v)).filter((x) => ['bancard_cambio', 'bancard_reversa'].includes(x.accion))
        .map((x) => [x.accion, x.detalle.deshecho ?? null, x.detalle.personas_de_mas ?? null, x.detalle.volvio_a_plan ?? null]),
      [['bancard_cambio', true, null, null], ['bancard_reversa', null, 4, 'basico']]);
    rechazado('revertir dos veces', await revertir(o.operacion), 'no está aprobado');
    await T.apagar(v);

    // ---- lo programado vuelve de la foto
    const conBaja = await T.activa('Tenía una baja programada', 'pro');
    await T.programar(conBaja, 'basico');
    const ob = await subir(conBaja, 'negocio', 4);
    ok('con una baja al Básico programada, sube al Premium: la baja se cancela', [(await T.sus(conBaja)).plan, await T.programado(conBaja)], ['negocio', [null, null]]);
    const rb = j(await revertir(ob.operacion));
    ok('y al revertir vuelve el Pro CON su baja programada, como estaba', [rb.plan, (await T.sus(conBaja)).plan, await T.programado(conBaja), rb.personas_de_mas],
      ['pro', 'pro', ['basico', null], 0]);

    // ---- «tiene que ser lo último que tocó la cuenta»
    const OTROS = 'hubo otros cambios en la cuenta';
    const seguido = await T.activa('Cambió y después sumó', 'basico');
    const o1 = await subir(seguido, 'negocio', 4);
    await T.pagar(seguido, 'staging', null, null, 6, 'personas');
    rechazado('si después del cambio sumó personas', await revertir(o1.operacion, true), OTROS);
    const renovo = await T.activa('Cambió y después renovó', 'basico');
    const o2 = await subir(renovo, 'pro');
    await T.pagar(renovo, 'staging', 'pro', 'mensual', null);
    rechazado('si después renovó', await revertir(o2.operacion, true), OTROS);
    const dos = await T.activa('Cambió dos veces seguidas', 'basico', { entorno: 'produccion' });
    const o3 = await subir(dos, 'pro', null, 'produccion');
    const o4 = await subir(dos, 'negocio', 4, 'produccion');
    rechazado('el primero de dos cambios', await revertir(o3.operacion, true), OTROS);
    ok('el último sí', j(await revertir(o4.operacion, true)), { puede: true });
    const aMano = await T.activa('Cambió y la activaron a mano', 'basico');
    const o5 = await subir(aMano, 'pro');
    await cobrarAMano(aMano, 'pro', 190000);
    rechazado('si después la administración la activó por transferencia', await revertir(o5.operacion, true), OTROS);
    // Los dos chequeos propios del cambio, aislados (sin ningún renglón ni pago posterior).
    const movida = await T.activa('Le movieron la fecha', 'basico');
    const o6 = await subir(movida, 'pro');
    await db.query(`update public.suscripciones set periodo_fin = periodo_fin + interval '1 day' where empresa_id = $1`, [movida.empresaId]);
    rechazado('si la fecha ya no es la que dejó el cambio', await revertir(o6.operacion, true), OTROS);
    const otroPlan = await T.activa('Le cambiaron el plan', 'basico');
    const o7 = await subir(otroPlan, 'pro');
    await db.query(`update public.suscripciones set plan = 'negocio' where empresa_id = $1`, [otroPlan.empresaId]);
    rechazado('si el plan ya no es el que dejó el cambio', await revertir(o7.operacion, true), OTROS);

    // ---- al día siguiente
    const ayer = await T.activa('Cambió ayer', 'basico');
    const o8 = await subir(ayer, 'pro');
    // Pasa un día para todo lo de esa cuenta (el cambio sigue siendo lo último).
    await db.query(`update public.bancard_operaciones set created_at = created_at - interval '1 day', confirmada_at = confirmada_at - interval '1 day' where empresa_id = $1`, [ayer.empresaId]);
    await db.query(`update public.registro_admin set created_at = created_at - interval '1 day' where empresa_id = $1`, [ayer.empresaId]);
    rechazado('al día siguiente Bancard ya no revierte: por el portal', await revertir(o8.operacion), 'Ya pasó el día del pago');
    ok('y marcándolo «ya lo anulé por el portal» deshace lo mismo', [j(await revertir(o8.operacion, false, true)).plan, (await T.sus(ayer)).plan], ['basico', 'basico']);

    // ---- un cambio que quedó en CONFLICTO es el que más hay que poder devolver
    await T.guardarTarjeta(enConflicto);
    const antesC = await T.sus(enConflicto);
    const rc = j(await revertir(enConflicto.operacion));
    ok('el cambio que entró con la cuenta ya vencida (plata anotada, plan sin tocar) se puede revertir',
      [rc.ok, rc.plan, rc.ingreso_anulado, rc.debito_pausado, (await T.opDe(enConflicto.operacion)).estado], [true, 'basico', true, false, 'revertida']);
    ok('  y la cuenta queda igual que estaba', await T.sus(enConflicto), antesC);
    await T.apagar(enConflicto);

    // ---- …y se puede devolver TAMBIÉN después de que la cuenta pagó otra cosa (revisión 08/10)
    // Lo normal después de un conflicto: la persona quedó con el candado y
    // paga un plan enseguida. Antes, desde ahí el conflicto ya no se podía
    // devolver ni marcar: «Después de ese pago hubo otros cambios…».
    const siguio = await T.activa('Conflicto y después paga', 'basico', { entorno: 'produccion', falta: '2 hours' });
    const oc2 = await T.crear(siguio, 'produccion', 'cambio', 'formulario', 'negocio', null, 15);
    await db.query(`update public.suscripciones set periodo_fin = now() - interval '10 minutes' where empresa_id = $1`, [siguio.empresaId]);
    const rc2 = await T.confirmar(oc2.operacion, aprobada(oc2.operacion, oc2.importe));
    const p15 = await T.pagar(siguio, 'produccion', 'negocio', 'mensual', 15);
    await T.venceEn(siguio, '20 days');
    await T.bajar(siguio, 10);
    const antesS = [await T.sus(siguio), await T.programado(siguio), await T.cuenta(siguio)];
    ok('Básico a 2 horas: cotiza el Premium de 15 por Gs. 26.667, paga vencido (conflicto), y después paga el Premium de 15 entero y programa bajar a 10',
      [oc2.importe, rc2.conflicto, p15.importe, antesS[0].plan, antesS[0].tope_vendedores, antesS[1]], [26667, true, 910000, 'negocio', 14, [null, 10]]);
    ok('el MISMO día, «solo comprobar» dice que el conflicto se puede revertir (antes: «hubo otros cambios en la cuenta»)',
      j(await revertir(oc2.operacion, true)), { puede: true });
    // Al otro día (lo que pasa si el débito renovó a la noche).
    await db.query(`update public.bancard_operaciones set created_at = created_at - interval '1 day', confirmada_at = confirmada_at - interval '1 day' where empresa_id = $1`, [siguio.empresaId]);
    await db.query(`update public.registro_admin set created_at = created_at - interval '1 day' where empresa_id = $1`, [siguio.empresaId]);
    rechazado('al otro día Bancard ya no revierte: por el portal, como cualquier pago', await revertir(oc2.operacion), 'Ya pasó el día del pago');
    const rs = j(await revertir(oc2.operacion, false, true));
    ok('y marcado «ya lo anulé por el portal»: pasa, anula el ingreso, no pausa nada, y contesta la cuenta de HOY (no la foto de cuando quedó vencida)',
      [rs.ok, rs.plan, rs.estado, rs.ingreso_anulado, rs.debito_pausado, rs.personas_de_mas, (await T.opDe(oc2.operacion)).estado],
      [true, 'negocio', 'activa', true, false, 0, 'revertida']);
    ok('la suscripción, lo programado DESPUÉS y el débito no se movieron: no se repone ninguna foto',
      [await T.sus(siguio), await T.programado(siguio), await T.cuenta(siguio)], antesS);
    ok('quedó anulado solo el ingreso del conflicto; el del Premium sigue, y su pago y su renglón también',
      [await ingresosDe(oc2.operacion), await ingresosDe(p15.operacion), (await T.opDe(p15.operacion)).estado,
        (await T.registroDe(siguio, 'cambiar_plan')).map((x) => x.detalle.deshecho ?? null)],
      [[{ monto: 26667, estado: 'anulado' }], [{ monto: 910000, estado: 'activo' }], 'pagada', [null, null]]);
    ok('y el renglón de la reversa dice a qué quedó la cuenta: como está',
      (await T.registroDe(siguio, 'bancard_reversa')).map((x) => [x.detalle.operacion, x.detalle.importe, x.detalle.volvio_a_plan, x.detalle.sin_bancard, x.detalle.ingreso_anulado]),
      [[oc2.operacion, 26667, 'negocio', true, true]]);
    // Solo para un CAMBIO: un pago de plan en conflicto se revierte como siempre (lo publicado).
    const dePlanC = await T.nueva('Pago de plan en conflicto, y renueva');
    const viejoC = await T.crear(dePlanC, 'produccion', 'plan', 'formulario', 'basico', 'mensual', null);
    await cerrar(viejoC.operacion);
    await T.pagar(dePlanC, 'produccion', 'pro', 'mensual', null);
    const rvC = await T.confirmar(viejoC.operacion, aprobada(viejoC.operacion, viejoC.importe));
    await T.pagar(dePlanC, 'produccion', 'pro', 'mensual', null);
    rechazado('un pago de PLAN que quedó en conflicto, con otro pago después, sigue sin revertirse: eso no cambió',
      rvC.conflicto === true ? await revertir(viejoC.operacion, true) : { ok: true, valor: { rows: ['no quedó en conflicto'] } }, OTROS);

    // ---- el débito queda COMO ESTABA: uno pausado no vuelve a cobrar solo (revisión 08/10)
    const debitoDe = (c) => J(
      `select debito_estado as estado, intentos, ciclo_fin::text as ciclo, ultimo_error as error, ultimo_codigo as codigo
         from public.bancard_cuentas where empresa_id = $1`, [c.empresaId]);
    // a. Pausado porque la administración le devolvió una renovación.
    const frenado = await T.activa('Débito pausado, sube y se arrepiente', 'basico', { entorno: 'produccion', falta: '5 days' });
    await T.guardarTarjeta(frenado);
    const adelantada = await T.pagar(frenado, 'produccion', 'basico', 'mensual', null);
    await revertir(adelantada.operacion);
    const debitoAntes = await debitoDe(frenado);
    const sf = await subir(frenado, 'pro', null, 'produccion');
    ok('con el débito pausado («Pago revertido por la administración») sube al Pro: ese pago lo destraba, como cualquier pago',
      [debitoAntes, sf.importe, (await debitoDe(frenado)).estado, (await T.opDe(sf.operacion)).antes.debito?.estado ?? null],
      [{ estado: 'pausado', intentos: 0, ciclo: null, error: 'Pago revertido por la administración', codigo: null }, 13333, 'al_dia', 'pausado']);
    const rf = j(await revertir(sf.operacion));
    ok('le devuelven el cambio: el débito vuelve a quedar PAUSADO, con el motivo que tenía (antes quedaba al día)',
      [rf.debito_pausado, await debitoDe(frenado), (await T.sus(frenado)).plan], [true, debitoAntes, 'basico']);
    await T.venceEn(frenado, '1 day');
    ok('  y el día anterior al vencimiento la tarea NO le cobra sola (antes: Gs. 110.000 de «Orden Basico»)', await T.tomar(), null);
    await T.apagar(frenado);
    // b. Pausado por un rechazo de la tarjeta: vuelve con sus intentos, su vencimiento y su código.
    const rebotada = await T.activa('Tarjeta vencida, sube y se arrepiente', 'basico', { entorno: 'produccion', falta: '1 day' });
    await T.guardarTarjeta(rebotada);
    const intento = await T.tomar();
    await T.confirmar(intento.operacion, rechazo(intento.operacion, intento.importe, '54', 'TARJETA VENCIDA'), 'charge');
    const debitoRebotado = await debitoDe(rebotada);
    const sr = await subir(rebotada, 'pro', null, 'produccion');
    const rr = j(await revertir(sr.operacion));
    ok('pausado por «TARJETA VENCIDA» (1 intento, código 54): sube, le devuelven, y queda exactamente como estaba',
      [intento.empresa_id === rebotada.empresaId, debitoRebotado.estado, debitoRebotado.intentos, debitoRebotado.error, debitoRebotado.codigo,
        rr.debito_pausado, JSON.stringify(await debitoDe(rebotada)) === JSON.stringify(debitoRebotado)],
      [true, 'pausado', 1, 'TARJETA VENCIDA', '54', true, true]);
    await T.apagar(rebotada);
    // c. Si después del cambio guardó OTRA tarjeta, eso lo destrabó a propósito: no se vuelve a pausar.
    const otraTarjeta = await T.activa('Pausado, sube, cambia la tarjeta y le devuelven', 'basico', { entorno: 'produccion', falta: '5 days' });
    await T.guardarTarjeta(otraTarjeta);
    await revertir((await T.pagar(otraTarjeta, 'produccion', 'basico', 'mensual', null)).operacion);
    const so = await subir(otraTarjeta, 'pro', null, 'produccion');
    await T.guardarTarjeta(otraTarjeta);
    const ro = j(await revertir(so.operacion));
    ok('pausado → sube → guarda otra tarjeta → le devuelven el cambio: el débito sigue al día (la tarjeta nueva lo destrabó)',
      [ro.ok, ro.debito_pausado, (await debitoDe(otraTarjeta)).estado], [true, false, 'al_dia']);
    await T.apagar(otraTarjeta);

    // ---- una reversa que no mueve la suscripción no rompe «una sola baja»
    // Premium de 8 con baja a 6 programada; un pago viejo de otro plan entra
    // y queda en conflicto (su foto guarda la baja a 6); la persona programa
    // el Pro; la administración devuelve el pago viejo.
    const lio = await T.nueva('Reversa sin mover nada');
    const viejo = await T.crear(lio, 'produccion', 'plan', 'formulario', 'pro', 'mensual', null);
    await cerrar(viejo.operacion);
    await T.pagar(lio, 'produccion', 'negocio', 'mensual', 8);
    await T.pruebaEn(lio, null);
    await T.venceEn(lio, '15 days');
    await T.bajar(lio, 6);
    const rv = await T.confirmar(viejo.operacion, aprobada(viejo.operacion, viejo.importe));
    await T.programar(lio, 'pro');
    ok('el pago viejo quedó en conflicto con la baja a 6 en su foto, y después se programó el Pro',
      [rv.conflicto, (await T.opDe(viejo.operacion)).antes.personas_proxima, await T.programado(lio)], [true, 6, ['pro', null]]);
    const rl = await revertir(viejo.operacion);
    ok('revertir ese pago no rompe la restricción «una sola baja»: lo programado vuelve de la foto en una sola sentencia',
      [rl.ok, rl.error, await T.programado(lio), (await T.sus(lio)).plan], [true, null, [null, 6], 'negocio']);

    // ---- los de siempre siguen pausando el débito
    const dePlan = await T.activa('Revierte una renovación', 'pro', { entorno: 'produccion' });
    await T.guardarTarjeta(dePlan);
    const r1 = await T.pagar(dePlan, 'produccion', 'pro', 'mensual', null);
    ok('revertir un pago de PLAN sigue pausando el débito', [j(await revertir(r1.operacion)).debito_pausado, (await T.cuenta(dePlan)).estado], [true, 'pausado']);
    const dePersonas = await T.activa('Revierte un sumar personas', 'negocio', { personas: 4, entorno: 'produccion' });
    await T.guardarTarjeta(dePersonas);
    const r2 = await T.pagar(dePersonas, 'produccion', null, null, 6, 'personas');
    ok('y uno de «sumar personas» también', [j(await revertir(r2.operacion)).debito_pausado, (await T.cuenta(dePersonas)).estado, (await T.sus(dePersonas)).tope_vendedores],
      [true, 'pausado', 3]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('10 · Bajar de plan: se programa, no se cobra, y se puede deshacer');
  // ═════════════════════════════════════════════════════════════════════
  {
    const baja = await T.activa('Baja al Básico', 'pro', { entorno: 'produccion' });
    const fotoAntes = JSON.stringify([await T.sus(baja), (await J('select count(*)::int n from public.bancard_operaciones where empresa_id = $1', [baja.empresaId])).n]);
    ok('antes de programar: el tope es el del Pro y no hay nada programado', [await T.tope(baja), await T.programado(baja)], [3, [null, null]]);
    const p = await T.programar(baja, 'basico');
    ok('programar la baja: dice el plan que viene, el de hoy, hasta cuándo y cuánto se va a cobrar',
      [p.plan_proximo, p.plan, p.importe, await mismaFecha(baja, p.vence), Object.keys(p).sort()],
      ['basico', 'pro', 110000, true, ['importe', 'plan', 'plan_proximo', 'vence']]);
    ok('no cobra ni cambia nada: la suscripción igual, ningún pago nuevo',
      JSON.stringify([await T.sus(baja), (await J('select count(*)::int n from public.bancard_operaciones where empresa_id = $1', [baja.empresaId])).n]) === fotoAntes, true);
    ok('queda anotado en el historial de la cuenta, con quién lo pidió',
      (await T.registroDe(baja, 'bancard_plan_programado')).map((x) => [x.actor_id === baja.uid, x.detalle.plan_antes, x.detalle.plan_proximo, x.detalle.habia]),
      [[true, 'pro', 'basico', null]]);
    ok('el tope de personas baja EN EL ACTO al del plan que viene (1)', await T.tope(baja), 1);
    const intruso = await H.crearUsuario(db, 'intruso@cambio.test');
    rechazado('y nadie más puede entrar al equipo mientras esté programado',
      await intentoU(intruso, 'select public.unirse_empresa($1, $2)', [await H.codigoDe(db, baja.empresaId), 'Intruso']), 'ya tiene sus 1 personas');
    const e1 = await T.estado(baja);
    ok('la pantalla lo ve: el plan que viene, que todavía no se puede pagar a mano (faltan 15 días), y el próximo cobro ya es el del Básico',
      [e1.plan_proximo, e1.plan_proximo_pagable, e1.debito.importe, e1.miembros, e1.personas], ['basico', false, 110000, 1, null]);
    ok('lo que se renueva: el plan programado, sin personas, por su precio',
      [(await J('select public.bancard_plan_de_renovacion($1) p', [baja.empresaId])).p, (await J('select public.bancard_personas_de_renovacion($1) n', [baja.empresaId])).n, await T.renovacion(baja)],
      ['basico', null, 110000]);
    const u = await T.programar(baja, null);
    ok('deshacer: vuelve todo, y dice cuánto vuelve a salir la renovación',
      [u.plan_proximo, u.plan, u.importe, await T.programado(baja), await T.tope(baja), (await T.estado(baja)).plan_proximo, (await T.estado(baja)).debito.importe],
      [null, 'pro', 190000, [null, null], 3, null, 190000]);
    ok('deshacer sin nada programado no hace nada (ni deja renglón)',
      [(await T.programar(baja, null)).plan_proximo, (await T.registroDe(baja, 'bancard_plan_programado')).map((x) => x.detalle.plan_proximo)], [null, ['basico', null]]);

    // Con la constancia ganada, el importe que dice es el que se va a cobrar.
    await T.cargar(baja, rango(30));
    ok('con el descuento de constancia: la renovación del Básico va a ser 104.500, y eso contesta', (await T.programar(baja, 'basico')).importe, 104500);
    await T.programar(baja, null);

    // ---- el equipo tiene que entrar en el plan nuevo
    const equipo = await T.activa('Premium de 6 con dos personas', 'negocio', { personas: 6, gente: 1 });
    ok('un Premium de 6 con 2 personas puede bajar al Pro (3 lugares): Gs. 190.000 en la renovación',
      [(await T.programar(equipo, 'pro')).importe, await T.tope(equipo), (await T.estado(equipo, 'staging')).personas.proxima], [190000, 3, null]);
    rechazado('pero no al Básico (1 lugar)', await T.intentoProgramar(equipo, 'basico'), equipoNoEntra(2, 'Básico', 1).slice(0, 60));
    await T.programar(equipo, null);
    await T.sumarGente(equipo, 2);
    rechazado('con 4 personas ya no entra en el Pro: se dice qué hacer, y no se echa a nadie', await T.intentoProgramar(equipo, 'pro'), equipoNoEntra(4, 'Pro', 3).slice(0, 60));
    ok('  y nada quedó programado', [await T.programado(equipo), await T.miembros(equipo)], [[null, null], 4]);

    // ---- una sola cosa programada por vez
    const dosBajas = await T.activa('Baja de personas y de plan', 'negocio', { personas: 8, gente: 1 });
    await T.bajar(dosBajas, 6);
    ok('con una baja a 6 personas programada…', await T.programado(dosBajas), [null, 6]);
    await T.programar(dosBajas, 'pro');
    ok('…programar el Pro la reemplaza', [await T.programado(dosBajas), await T.renovacion(dosBajas), await T.tope(dosBajas)], [['pro', null], 190000, 3]);
    const b = await T.bajar(dosBajas, 6);
    ok('y programar otra vez las personas reemplaza al plan (misma respuesta de siempre)',
      [b, await T.programado(dosBajas), await T.renovacion(dosBajas), await T.tope(dosBajas)],
      [{ importe: 370000, contratadas: 8, personas_proxima: 6 }, [null, 6], 370000, 6]);
    await T.programar(dosBajas, 'pro');
    ok('deshacer la de personas (null) no toca la de plan', [(await T.bajar(dosBajas, null)).personas_proxima, await T.programado(dosBajas)], [null, ['pro', null]]);
    // Con un pago en curso, la baja de personas no puede llevarse puesta la de
    // plan: ese pago puede ser la renovación por el plan programado.
    const vivoDos = await T.crear(dosBajas, 'staging', 'plan', 'formulario', 'negocio', 'mensual', 8);
    ok('con un pago en curso, programar una baja de personas NO borra la de plan: contesta que hay un pago en curso',
      [mensaje(await intentoS(SQL.bajar, [dosBajas.empresaId, dosBajas.uid, 6])), await T.programado(dosBajas)], [EN_CURSO, ['pro', null]]);
    await cerrar(vivoDos.operacion);
    await T.programar(dosBajas, null);
    const vivoTres = await T.crear(dosBajas, 'staging', 'plan', 'formulario', 'negocio', 'mensual', 8);
    ok('  sin baja de plan programada, la de personas anda con un pago en curso, como siempre (eso no cambió)',
      [(await T.bajar(dosBajas, 6)).personas_proxima, await T.programado(dosBajas)], [6, [null, 6]]);
    await cerrar(vivoTres.operacion);
    await T.programar(dosBajas, 'pro');
    rechazado('la base no deja las dos a la vez ni a mano',
      await H.intentarComo(db, 'postgres', null, () => db.query('update public.bancard_cuentas set personas_proxima = 6 where empresa_id = $1', [dosBajas.empresaId])),
      'bancard_cuentas_una_sola_baja');
    rechazado('ni programar el Premium (nunca es el destino de una baja)',
      await H.intentarComo(db, 'postgres', null, () => db.query(`update public.bancard_cuentas set plan_proximo = 'negocio' where empresa_id = $1`, [dosBajas.empresaId])),
      'bancard_cuentas_plan_proximo_check');

    // ---- lo que no se puede programar
    rechazado('al mismo plan', await T.intentoProgramar(baja, 'pro'), NO_VALIDO);
    rechazado('a un plan más alto (subir se paga)', await T.intentoProgramar(baja, 'negocio'), NO_VALIDO);
    rechazado('a «gratis»', await T.intentoProgramar(baja, 'gratis'), NO_VALIDO);
    rechazado('a un plan que no existe', await T.intentoProgramar(baja, 'oro'), NO_VALIDO);
    rechazado('desde el Básico no hay a dónde bajar', await T.intentoProgramar(basM, 'basico'), NO_VALIDO);
    const vendBaja = (await T.sumarGente(baja, 1))[0];
    rechazado('un vendedor no programa', await T.intentoProgramar(baja, 'basico', vendBaja), 'Solo el dueño de la cuenta puede pagar');
    rechazado('ni el dueño de otra cuenta', await T.intentoProgramar(baja, 'basico', ajeno.uid), 'Solo el dueño de la cuenta puede pagar');
    rechazado('ni nadie (sin persona no hay baja)', await T.intentoProgramar(baja, 'basico', null), 'Solo el dueño de la cuenta puede pagar');
    // Un Premium que quedó en un rubro que solo ofrece el Básico.
    const profe = await T.nueva('Profe con Premium viejo', { rubro: 'clases' });
    await cobrarAMano(profe, 'negocio', 250000, 3);
    rechazado('a un plan que su rubro no ofrece: lo dice la fuente del precio', await T.intentoProgramar(profe, 'pro'), 'no está disponible para tu rubro');
    ok('  y al que sí ofrece, sí', (await T.programar(profe, 'basico')).plan_proximo, 'basico');

    // ---- con un pago en curso: ni programar ni deshacer
    const ocupado = await T.activa('Con un pago en curso', 'pro');
    await T.programar(ocupado, 'basico');
    await T.programar(ocupado, null);
    const vivo = await T.crear(ocupado, 'staging', 'plan', 'formulario', 'pro', 'mensual', null);
    rechazado('con un pago en curso no se programa', await T.intentoProgramar(ocupado, 'basico'), EN_CURSO);
    await cerrar(vivo.operacion);
    ok('  cerrado ese pago, sí', (await T.programar(ocupado, 'basico')).plan_proximo, 'basico');

    // ---- deshacer se puede siempre (menos con un pago en curso)
    await T.venceEn(ocupado, '-1 day');
    rechazado('con la cuenta vencida ya no se programa nada', await T.intentoProgramar(ocupado, 'basico'), NO_VALIDO);
    ok('pero lo que estaba programado se puede deshacer igual', [(await T.programar(ocupado, null)).plan_proximo, await T.programado(ocupado)], [null, [null, null]]);

    // ---- caduca sola cuando la suscripción cambia por cualquier camino
    const c1 = await T.activa('Caduca por transferencia', 'pro');
    await T.programar(c1, 'basico');
    await cobrarAMano(c1, 'pro', 190000);
    ok('la administración la activa por transferencia: la baja programada se borra sola', [await T.programado(c1), await T.tope(c1)], [[null, null], 3]);
    const c2 = await T.activa('Caduca por sumar personas', 'negocio', { personas: 4 });
    await T.programar(c2, 'pro');
    await T.pagar(c2, 'staging', null, null, 6, 'personas');
    ok('paga por sumar personas: la baja de plan se borra (pagó por tener ese Premium)', [await T.programado(c2), await T.tope(c2), await T.renovacion(c2)], [[null, null], 6, 370000]);
    const c3 = await T.activa('Caduca por subir', 'pro');
    await T.programar(c3, 'basico');
    await subir(c3, 'negocio', 4);
    ok('sube de plan pagando: la baja se borra', [await T.programado(c3), (await T.sus(c3)).plan, await T.renovacion(c3)], [[null, null], 'negocio', 250000]);

    // ---- un formulario RECHAZADO sigue pagable en Bancard: también es «un pago en curso» (revisión 08/10)
    // Con el Básico programado y a tres días, la persona abre la renovación
    // del Básico y el banco la rechaza. La operación queda 'rechazada' (no
    // viva), pero su formulario sigue abierto hasta que alguien lo cierra.
    // Si ahí deshace la baja y después paga ese formulario, entraba como
    // «pagó un plan distinto», sin renovar, y el débito cobraba el Pro.
    const abiertas = async (c, entorno = null, plan = null) =>
      S('select public.bancard_rechazadas_abiertas(p_empresa => $1, p_entorno => $2, p_plan => $3) j', [c.empresaId, entorno, plan]);
    /** Abre el formulario de un pago de plan y el banco lo rechaza. */
    const rechazada = async (c, plan, personas = null, { conFormulario = true } = {}) => {
      const o = await T.crear(c, 'staging', 'plan', 'formulario', plan, 'mensual', personas);
      if (!o || !o.operacion) throw new Error(`no se creó el pago de ${c.nombre}: ${JSON.stringify(o)}`);
      if (conFormulario) await S('select public.bancard_guardar_proceso($1,$2) j', [o.operacion, `pf*${o.operacion}`]);
      await T.confirmar(o.operacion, rechazo(o.operacion, o.importe));
      return o;
    };
    const rech = await T.activa('Rechazo y quiere seguir', 'pro', { falta: '3 days' });
    await T.programar(rech, 'basico');
    const or1 = await rechazada(rech, 'basico');
    ok('a tres días, con el Básico programado: abre la renovación del Básico (Gs. 110.000) y el banco la rechaza; ya no es un pago vivo, pero su formulario sigue abierto',
      [or1.importe, (await T.opDe(or1.operacion)).estado, (await T.estado(rech, 'staging')).viva, await abiertas(rech), await abiertas(rech, 'staging', 'basico')],
      [110000, 'rechazada', null, [or1.operacion], [or1.operacion]]);
    ok('  la lista se puede pedir por plan y por ambiente: nada del Pro, nada en producción',
      [await abiertas(rech, null, 'pro'), await abiertas(rech, 'produccion', null), await abiertas(proM)], [[], [], []]);
    ok('«Seguir con el Pro» (deshacer) contesta que hay un pago en curso, y la baja sigue programada (antes: deshacía, y pagar ese formulario cobraba dos veces)',
      [mensaje(await T.intentoProgramar(rech, null)), await T.programado(rech)], [EN_CURSO, ['basico', null]]);
    ok('  volver a programar lo MISMO no borra nada: pasa', (await T.programar(rech, 'basico')).plan_proximo, 'basico');
    // Lo que hace el servidor al reintentar (y la conciliación a los diez minutos): cerrarla con la reversa.
    await cerrar(or1.operacion, 'reemplazada');
    ok('cerrado ese formulario en Bancard, deshace', [await abiertas(rech), (await T.programar(rech, null)).plan_proximo, await T.programado(rech)], [[], null, [null, null]]);

    // Por qué se frena: pagado tarde con la baja todavía programada, ese formulario renueva bien.
    const tarde = await T.activa('Rechazo y paga tarde', 'pro', { falta: '3 days' });
    await T.programar(tarde, 'basico');
    const or2 = await rechazada(tarde, 'basico');
    const rt2 = await T.confirmar(or2.operacion, aprobada(or2.operacion, or2.importe));
    ok('si no deshizo, el mismo formulario pagado después del rechazo renueva al Básico, sin conflicto: por eso la baja no se toca mientras siga abierto',
      [rt2.aprobada, rt2.conflicto, (await T.sus(tarde)).plan, await T.programado(tarde)], [true, false, 'basico', [null, null]]);

    // Solo traba el formulario de ESE plan, abierto de verdad y de hoy.
    const otro = await T.activa('Rechazo del plan actual', 'pro', { falta: '3 days' });
    await T.programar(otro, 'basico');
    const or3 = await rechazada(otro, 'pro');
    ok('un rechazo de la renovación del plan ACTUAL (el Pro) no traba: pagado tarde renueva el Pro y listo',
      [await abiertas(otro, null, 'basico'), await abiertas(otro), (await T.programar(otro, null)).plan_proximo], [[], [or3.operacion], null]);
    const sinForm = await T.activa('Rechazo sin formulario', 'pro', { falta: '3 days' });
    await T.programar(sinForm, 'basico');
    await rechazada(sinForm, 'basico', null, { conFormulario: false });
    ok('una rechazada que nunca llegó a tener formulario en Bancard no traba (no hay nada que se pueda pagar)',
      [await abiertas(sinForm), (await T.programar(sinForm, null)).plan_proximo], [[], null]);
    const vieja = await T.activa('Rechazo de ayer', 'pro', { falta: '3 days' });
    await T.programar(vieja, 'basico');
    const or5 = await rechazada(vieja, 'basico');
    await db.query(`update public.bancard_operaciones set created_at = created_at - interval '25 hours' where id = $1`, [or5.operacion]);
    ok('ni una de hace más de un día (la misma ventana que usa el pago para cerrarlas)',
      [await abiertas(vieja), (await T.programar(vieja, null)).plan_proximo], [[], null]);

    // REEMPLAZAR lo programado es lo mismo que deshacerlo; y la baja de personas, que borra la de plan, también.
    const premiumR = await T.activa('Premium con el Pro programado y un rechazo', 'negocio', { personas: 8, falta: '3 days' });
    await T.programar(premiumR, 'pro');
    const or6 = await rechazada(premiumR, 'pro');
    ok('Premium con el Pro programado y la renovación del Pro rechazada: programar el Básico en su lugar, no',
      [mensaje(await T.intentoProgramar(premiumR, 'basico')), await T.programado(premiumR)], [EN_CURSO, ['pro', null]]);
    ok('  ni bajar personas, que borraría esa baja de plan', [mensaje(await intentoS(SQL.bajar, [premiumR.empresaId, premiumR.uid, 6])), await T.programado(premiumR)],
      [EN_CURSO, ['pro', null]]);
    await cerrar(or6.operacion, 'reemplazada');
    ok('  cerrado el formulario, las dos cosas se pueden', [(await T.bajar(premiumR, 6)).personas_proxima, await T.programado(premiumR)], [6, [null, 6]]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('11 · La baja entra con la renovación: la cobra la tarea');
  // ═════════════════════════════════════════════════════════════════════
  {
    const d1 = await T.activa('Baja con débito', 'pro', { entorno: 'produccion' });
    await referir(d1);              // el socio se anotó después del primer pago: cobra con la renovación
    await T.guardarTarjeta(d1);
    await T.venceEn(d1, '1 day');
    await T.programar(d1, 'basico');
    const finViejo = (await T.sus(d1)).fin;

    // ---- el aviso de vencimiento
    const sinTarjeta = await T.activa('Baja sin tarjeta', 'negocio', { personas: 5, falta: '3 days' });
    await T.programar(sinTarjeta, 'pro');
    const filas = await S(SQL.avisos);
    const f1 = filas.find((f) => f.empresa_id === d1.empresaId);
    const f2 = filas.find((f) => f.empresa_id === sinTarjeta.empresaId);
    ok('el aviso: «plan» y «precio» siguen siendo los de HOY, y suma los de la renovación; el importe es lo que se va a cobrar',
      [f1.dias, f1.plan, Number(f1.precio), f1.plan_renovacion, Number(f1.precio_renovacion), Number(f1.importe), f1.debito.marca, f1.debito.ultimos4],
      [1, 'pro', 190000, 'basico', 110000, 110000, 'Visa', '0016']);
    ok('  de Premium de 5 (310.000) a Pro, sin tarjeta: avisa 190.000 y que paga la persona',
      [f2.dias, f2.plan, Number(f2.precio), f2.plan_renovacion, Number(f2.precio_renovacion), Number(f2.importe), f2.debito],
      [3, 'negocio', 250000, 'pro', 190000, 190000, null]);
    ok('  y en las cuentas sin nada programado las dos claves nuevas repiten las de siempre',
      filas.filter((f) => ![d1.empresaId, sinTarjeta.empresaId].includes(f.empresa_id))
        .filter((f) => f.plan_renovacion !== f.plan || Number(f.precio_renovacion) !== Number(f.precio)).map((f) => f.nombre), []);

    // ---- la tarea
    const cobro = await T.tomar();
    const fila = await T.opDe(cobro.operacion);
    ok('el día anterior la tarea crea la renovación por el plan PROGRAMADO: el freno no la para',
      [cobro.empresa_id === d1.empresaId, cobro.importe, cobro.descripcion, cobro.intento, fila.tipo, fila.plan, fila.periodo, fila.origen, fila.medio, fila.personas],
      [true, 110000, 'Orden Basico', 1, 'plan', 'basico', 'mensual', 'automatico', 'token', null]);

    // ---- con ese cobro en curso no se toca lo programado (si no: plata anotada sin renovar, y al otro día el plan alto)
    ok('con el cobro en curso, DESHACER contesta que hay un pago en curso', mensaje(await T.intentoProgramar(d1, null)), EN_CURSO);
    ok('  y volver a programar, lo mismo', mensaje(await T.intentoProgramar(d1, 'basico')), EN_CURSO);
    ok('  la baja sigue programada', await T.programado(d1), ['basico', null]);

    const r = await T.confirmar(cobro.operacion, aprobada(cobro.operacion, 110000, { amount: 110000 }), 'charge');
    const s = await T.sus(d1);
    ok('entra el cobro: SIN conflicto, queda el plan más bajo, un período más desde la fecha que tenía, y nada programado',
      [r.aprobada, r.conflicto, r.revisar, s.plan, s.tope_vendedores, await T.tope(d1), await T.programado(d1),
        (await J(`select ($1::timestamptz = $2::timestamptz + interval '1 month') v`, [s.fin, finViejo])).v],
      [true, false, null, 'basico', null, 1, [null, null], true]);
    ok('es un pago de plan común: renglón «cambiar_plan» de Pro a Básico por un mes, y la comisión de siempre sobre el plan que se renovó',
      [(await T.registroDe(d1, 'cambiar_plan')).slice(-1).map((x) => [x.detalle.plan_antes, x.detalle.plan_despues, x.detalle.meses, x.detalle.importe]),
        r.comision.monto, await T.comisionDe(d1)],
      [[['pro', 'basico', 1, 110000]], 55000, [{ base: 110000, monto: 55000, importe: 110000, estado: 'por_pagar' }]]);
    ok('la foto de ese pago guarda la baja que había', [(await T.opDe(cobro.operacion)).antes.plan, (await T.opDe(cobro.operacion)).antes.plan_proximo], ['pro', 'basico']);

    const rev = j(await revertir(cobro.operacion));
    ok('revertir esa renovación: vuelve el plan alto, la fecha vieja y la baja programada; el débito se pausa, como en todo pago de plan',
      [rev.plan, (await T.sus(d1)).plan, (await T.sus(d1)).fin === finViejo, await T.programado(d1), rev.debito_pausado, rev.comision],
      ['pro', 'pro', true, ['basico', null], true, 'borrada']);
    await T.apagar(d1);

    // ---- si la tarjeta rebota: no cambia nada, y los reintentos cobran lo mismo
    const d2 = await T.activa('Baja y la tarjeta rebota', 'pro', { entorno: 'produccion' });
    await T.guardarTarjeta(d2);
    await T.venceEn(d2, '1 day');
    await T.programar(d2, 'basico');
    const i1 = await T.tomar();
    await T.confirmar(i1.operacion, rechazo(i1.operacion, 110000), 'charge');
    ok('rechazado: sigue con su plan y con la baja programada', [i1.importe, (await T.sus(d2)).plan, await T.programado(d2), (await T.cuenta(d2)).estado],
      [110000, 'pro', ['basico', null], 'reintentando']);
    await T.pasanDias(d2, 2);
    const i2 = await T.tomar();
    ok('el reintento del día +1 (ya vencida) cobra el mismo plan y el mismo importe anunciado',
      [i2.intento, i2.importe, i2.descripcion, (await T.opDe(i2.operacion)).plan, (await T.sus(d2)).efectivo], [2, 110000, 'Orden Basico', 'basico', 'gratis']);
    await T.confirmar(i2.operacion, rechazo(i2.operacion, 110000), 'charge');
    await T.pasanDias(d2, 3);
    const i3 = await T.tomar();
    ok('y el del día +4, también', [i3.intento, i3.importe, (await T.opDe(i3.operacion)).plan], [3, 110000, 'basico']);
    const r3 = await T.confirmar(i3.operacion, aprobada(i3.operacion, 110000), 'charge');
    ok('si entra en el último intento: plan más bajo desde hoy, sin conflicto',
      [r3.conflicto, (await T.sus(d2)).plan, (await T.sus(d2)).efectivo, await T.programado(d2)], [false, 'basico', 'basico', [null, null]]);
    await T.apagar(d2);

    // ---- un pago viejo de un TERCER plan sigue siendo un conflicto
    const tercero = await T.nueva('Un tercer plan');
    const viejoB = await T.crear(tercero, 'staging', 'plan', 'formulario', 'basico', 'mensual', null);
    await cerrar(viejoB.operacion);
    await T.pagar(tercero, 'staging', 'negocio', 'mensual', 4);
    await T.pruebaEn(tercero, null);
    await T.venceEn(tercero, '15 days');
    await T.programar(tercero, 'pro');
    const rt = await T.confirmar(viejoB.operacion, aprobada(viejoB.operacion, viejoB.importe));
    ok('Premium con el Pro programado, y entra un pago viejo del BÁSICO (ni el que tiene ni el que programó): conflicto, no le baja el plan',
      [rt.conflicto, rt.revisar, (await T.sus(tercero)).plan, await T.programado(tercero)],
      [true, 'Pagó un plan distinto del que tiene activo: resolver a mano', 'negocio', ['pro', null]]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('12 · …o la paga la persona, pero no antes de los últimos tres días');
  // ═════════════════════════════════════════════════════════════════════
  {
    ok('los días de adelanto son los del primer aviso de vencimiento', (await J('select public.dias_para_adelantar_la_baja() n')).n, 3);
    const m = await T.activa('Baja y paga a mano', 'pro', { falta: '10 days' });
    await T.programar(m, 'basico');
    const pagable = async () => { const e = await T.estado(m, 'staging'); return [e.plan_proximo, e.plan_proximo_pagable]; };
    // Pagarlo antes le baja el plan en el momento: pierde días que ya pagó.
    rechazado('con 10 días por delante, pagar el plan programado: el freno (perdería 10 días del plan alto)',
      await T.intentoCrear(m, 'staging', 'plan', 'formulario', 'basico', 'mensual', null), FRENO);
    ok('  y la pantalla sabe que todavía no se puede', await pagable(), ['basico', false]);
    await T.venceEn(m, '4 days');
    rechazado('con 4 días, todavía no', await T.intentoCrear(m, 'staging', 'plan', 'formulario', 'basico', 'mensual', null), FRENO);
    const auto = (await db.query(
      `select public.bancard_crear_operacion_interna($1, null, 'staging', 'plan', 'formulario', 'automatico', 'basico', 'mensual', null) j`, [m.empresaId])).rows[0].j;
    ok('pedido por la tarea pasa siempre, falte lo que falte', [auto.importe, auto.descripcion], [110000, 'Orden Basico']);
    await cerrar(auto.operacion);
    await T.venceEn(m, '3 days');
    ok('con 3 días (los del aviso) ya se puede', await pagable(), ['basico', true]);
    rechazado('  un TERCER plan sigue frenado', await T.intentoCrear(m, 'staging', 'plan', 'formulario', 'negocio', 'mensual', 4), FRENO);
    const o = await T.crear(m, 'staging', 'plan', 'formulario', 'basico', 'anual', null);
    ok('  el pago del plan programado se crea (y puede elegir pagarlo por año, como en cualquier renovación)',
      [o.importe, o.descripcion, o.desglose.periodo], [1210000, 'Orden Basico', 'anual']);
    // Ya creado, se confirma «tarde»: la regla del conflicto no lleva la ventana de días.
    await T.venceEn(m, '10 days');
    const fin10 = (await T.sus(m)).fin;
    const r = await T.confirmar(o.operacion, aprobada(o.operacion, o.importe));
    const s = await T.sus(m);
    ok('un pago del plan programado que ya estaba creado activa aunque falten 10 días: sin conflicto, plan más bajo, un año más',
      [r.conflicto, s.plan, s.periodo, await T.programado(m), (await J(`select ($1::timestamptz = $2::timestamptz + interval '12 months') v`, [s.fin, fin10])).v],
      [false, 'basico', 'anual', [null, null], true]);

    // ---- renovar a mano el plan ACTUAL pasa y borra la baja
    const sigue = await T.activa('Programó y renueva lo que tiene', 'pro');
    await T.programar(sigue, 'basico');
    const os = await T.pagar(sigue, 'staging', 'pro', 'mensual', null);
    ok('renovar a mano el plan actual pasa, y borra la baja programada',
      [os.importe, os.r.conflicto, (await T.sus(sigue)).plan, await T.programado(sigue), await T.tope(sigue)], [190000, false, 'pro', [null, null], 3]);
    const premium = await T.activa('Premium que programó el Pro', 'negocio', { personas: 6 });
    await T.programar(premium, 'pro');
    rechazado('renovar a mano ese Premium por MENOS personas de las que tiene: no (sería bajar personas sin programarlo)',
      await T.intentoCrear(premium, 'staging', 'plan', 'formulario', 'negocio', 'mensual', 5), 'Sumar personas');
    rechazado('  ni por más', await T.intentoCrear(premium, 'staging', 'plan', 'formulario', 'negocio', 'mensual', 7), 'Sumar personas');
    const op = await T.pagar(premium, 'staging', 'negocio', 'mensual', 6);
    ok('  por las que tiene, sí: sigue en Premium de 6 y la baja se borra',
      [op.importe, (await T.sus(premium)).plan, (await T.sus(premium)).tope_vendedores, await T.programado(premium)], [370000, 'negocio', 5, [null, null]]);

    // ---- vencida con una baja programada
    const vencio = await T.activa('Programó y venció', 'pro');
    await T.programar(vencio, 'basico');
    await T.venceEn(vencio, '-1 day');
    const ev = await T.estado(vencio, 'staging');
    ok('vencida con la baja programada: la baja sigue (la cobran los reintentos) y ya se puede pagar a mano', [ev.plan_proximo, ev.plan_proximo_pagable], ['basico', true]);
    await T.pagar(vencio, 'staging', 'pro', 'mensual', null);
    ok('  si paga a mano otro plan (el Pro que tenía), la baja se borra', [(await T.sus(vencio)).plan, await T.programado(vencio)], ['pro', [null, null]]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('13 · La decisión 4 APAGADA, como va a producción: se paga, se cobra solo, se anuncia y se confirma sin mirar el equipo');
  // ═════════════════════════════════════════════════════════════════════
  {
    ok('la base está como la deja la 130: con la llave puesta', await D4.enLaBase(db), 'apagada');

    // El caso por el que Matías la apagó: probó con tres personas (la prueba
    // es Pro), dejó vencer, y quiere pagar el Básico con tarjeta. Vencido no
    // tiene pantalla para sacar gente del equipo.
    const tres = await T.nueva('Probó con tres y dejó vencer');
    await T.sumarGente(tres, 2);
    await T.venceEn(tres, '-2 days');
    await T.pruebaEn(tres, null);
    ok('  (la cuenta: vencida, sin plan, con tres personas)', [(await T.sus(tres)).estado, (await T.sus(tres)).efectivo, await T.miembros(tres)], ['prueba', 'gratis', 3]);
    const ot = await T.pagar(tres, 'staging', 'basico', 'mensual', null);
    ok('probó con tres personas, dejó vencer y paga el Básico (una): PASA. Se activa, no queda «para revisar» y no se echa a nadie',
      [ot.importe, ot.r.aprobada, ot.r.conflicto, ot.r.revisar ?? null, (await T.opDe(ot.operacion)).revisar,
        (await T.sus(tres)).plan, (await T.sus(tres)).estado, await T.miembros(tres)],
      [110000, true, false, null, null, 'basico', 'activa', 3]);
    ok('  el tope del Básico sigue siendo uno: los tres quedan, pero no entra nadie más', await T.tope(tres), 1);

    // Lo que se le ANUNCIA y lo que cobra la tarea: un Básico de tres personas
    // (activado por transferencia) con su tarjeta, que vence mañana.
    const anunciada = await T.nueva('Tres con Básico y tarjeta, sin freno');
    await T.sumarGente(anunciada, 2);
    await cobrarAMano(anunciada, 'basico', 110000);
    await T.guardarTarjeta(anunciada, 'staging');
    await T.venceEn(anunciada, '1 day');
    const fila = (await S(SQL.avisos)).find((f) => f.empresa_id === anunciada.empresaId);
    const ea = await T.estado(anunciada, 'staging');
    ok('un Básico de tres personas con tarjeta, que vence mañana: la renovación NO está frenada; el aviso anuncia el cobro automático y la pantalla da la fecha',
      [(await J('select public.bancard_renovacion_frenada($1) v', [anunciada.empresaId])).v, fila.debito && [fila.debito.marca, fila.debito.ultimos4],
        ea.debito.fecha_cobro !== null, ea.debito.importe],
      [false, ['Visa', '0016'], true, 110000]);
    const cobro = await T.tomar('staging');
    ok('  y la tarea le cobra lo anunciado: crea el cobro del Básico, y el débito sigue al día (nada se pausa)',
      [cobro?.empresa_id === anunciada.empresaId, cobro?.importe, cobro?.descripcion, (await T.cuenta(anunciada)).estado, (await T.cuenta(anunciada)).error],
      [true, 110000, 'Orden Basico', 'al_dia', null]);
    const rcobro = await T.confirmar(cobro.operacion, aprobada(cobro.operacion, cobro.importe), 'charge');
    ok('  el cobro entra: renovado por un mes más, sin conflicto y sin marca',
      [rcobro.aprobada, rcobro.conflicto, (await T.opDe(cobro.operacion)).revisar, (await T.sus(anunciada)).plan], [true, false, null, 'basico']);
    await T.apagar(anunciada);

    // Subir de plan con gente de más (una cuenta que armó la administración).
    const armada = await T.nueva('Básico con cinco, sin freno');
    await cobrarAMano(armada, 'negocio', 250000);
    await T.sumarGente(armada, 4);
    await cobrarAMano(armada, 'basico', 110000);
    await T.pruebaEn(armada, null);
    await T.venceEn(armada, '15 days');
    ok('un Básico con cinco personas cotiza subir al Pro (tres lugares): la hoja da su importe, (190.000 − 110.000) × 15/30',
      (await T.cotizarCambio(armada, 'pro')).importe, 40000);
    rechazado('  al Premium de 4 sigue sin poder (el mensaje de siempre): eso es la cantidad de personas del Premium (124), no la decisión 4',
      await T.intentoCotizarCambio(armada, 'negocio', 4), 'entre 5 y 15');
    ok('  al Premium de 5, sí: (310.000 − 110.000) × 15/30', (await T.cotizarCambio(armada, 'negocio', 5)).importe, 100000);
    const oa = await subir(armada, 'pro');
    ok('  y lo paga: queda Pro con las cinco adentro, y ese cambio NO queda «para revisar»',
      [oa.importe, oa.r.aprobada, oa.r.conflicto, oa.r.revisar ?? null, (await T.opDe(oa.operacion)).revisar, (await T.sus(armada)).plan, await T.miembros(armada)],
      [40000, true, false, null, null, 'pro', 5]);
    ok('  renovar el Pro que ahora tiene, también pasa',
      (await T.crear(armada, 'staging', 'plan', 'formulario', 'pro', 'mensual', null)).importe, 190000);

    // ---- LO QUE NO ES LA DECISIÓN 4 SIGUE PRENDIDO
    const quiereBajar = await T.activa('Pro de dos que quiere bajar', 'pro', { gente: 1 });
    rechazado('programar una BAJA sigue exigiendo que el equipo entre en el plan más bajo: un Pro de dos no baja al Básico',
      await T.intentoProgramar(quiereBajar, 'basico'), equipoNoEntra(2, 'Básico', 1).slice(0, 60));
    ok('  no quedó nada programado', await T.programado(quiereBajar), [null, null]);
    // Gente que entra entre crear un cambio AL PREMIUM y confirmarlo: el
    // equipo se cuenta al confirmar (como en el pago de un Premium, 125).
    const colados = await T.activa('Entró gente en el medio, sin freno', 'basico');
    const ocol = await T.crear(colados, 'staging', 'cambio', 'formulario', 'negocio', null, 4);
    for (let i = 0; i < 4; i++) {
      const uid = await H.crearUsuario(db, `colado${i}@cambio.test`);
      await db.query(`insert into public.miembros (empresa_id, user_id, nombre, rol) values ($1, $2, 'Colado', 'vendedor')`, [colados.empresaId, uid]);
    }
    const rcol = await T.confirmar(ocol.operacion, aprobada(ocol.operacion, ocol.importe));
    ok('un cambio al Premium de 4 que se confirma con cinco en el equipo queda «para revisar» igual: eso es la cantidad de personas del Premium, no la decisión 4',
      [rcol.conflicto, rcol.revisar, (await T.sus(colados)).plan, (await T.sus(colados)).tope_vendedores, await T.miembros(colados)],
      [false, PARA_REVISAR_CAMBIO, 'negocio', 3, 5]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('13b · La decisión 4 PRENDIDA (la misma función, sin su «return;»): no se puede pagar un plan donde el equipo no entra, ni dejando vencer');
  // ═════════════════════════════════════════════════════════════════════
  {
    await D4.prender(db);
    ok('prendida en la base de pruebas: todo lo de este grupo es lo que se afirmaba cuando la 130 la traía prendida', await D4.enLaBase(db), 'prendida');
    const { traducirMensajeAPortugues } = require('../.compilado/mensajes-base.js');
    // El caso de todos los días: un negocio que probó con tres personas (la prueba es Pro).
    const tres = await T.nueva('Probó con tres');
    await T.sumarGente(tres, 2);
    ok('probó con tres personas y quiere pagar el Básico (una): se frena, y dice qué hacer',
      mensaje(await T.intentoCrear(tres, 'staging', 'plan', 'formulario', 'basico', 'anual', null)), equipoNoEntra(3, 'Básico', 1));
    ok('  el mensaje, en portugués, con los tres datos en su lugar', traducirMensajeAPortugues(equipoNoEntra(3, 'Básico', 1)),
      'Sua equipe tem 3 pessoas e o plano Básico admite até 1. Reduza a equipe ou escolha um plano em que caibam todos.');
    ok('  y el otro mensaje nuevo', traducirMensajeAPortugues(EN_CURSO), 'Há um pagamento em andamento. Espere a confirmação e tente de novo.');

    // La decisión vive en UNA función: se apaga ahí, y nada más. Acá se apaga
    // con el texto que trae la migración (el que va a producción).
    await db.exec('begin');
    await db.exec(D4.textoApagada);
    const sinRegla = (await db.query(SQL.crear, [tres.empresaId, tres.uid, 'staging', 'plan', 'formulario', 'basico', 'mensual', null])).rows[0].j;
    await db.exec('rollback');
    ok('con esa única función apagada (en una transacción que se deshace), el mismo pago pasa: la decisión está en un solo lugar', sinRegla.importe, 110000);
    ok('  y de vuelta, frena', mensaje(await T.intentoCrear(tres, 'staging', 'plan', 'formulario', 'basico', 'mensual', null)), equipoNoEntra(3, 'Básico', 1));
    ok('el plan donde entran (Pro, tres lugares) se paga como siempre', (await T.pagar(tres, 'staging', 'pro', 'mensual', null)).importe, 190000);

    // Lo que se le ANUNCIA a la persona le pregunta a esa misma función
    // (revisión 08/10): si la tarea no va a cobrar, ni el aviso de
    // vencimiento ni «Próximo cobro» pueden decir que sí.
    const anunciada = await T.nueva('Tres con Básico y tarjeta');
    await T.sumarGente(anunciada, 2);
    await cobrarAMano(anunciada, 'basico', 110000);
    await T.guardarTarjeta(anunciada, 'staging');
    await T.venceEn(anunciada, '1 day');
    /** [¿frenada?, ¿el aviso anuncia el débito?, ¿la pantalla da fecha de cobro?], sin abrir otra transacción. */
    const anuncio = async () => {
      await db.query(`select set_config('orden.uid', $1, true)`, [anunciada.uid]);
      const fila = (await db.query(SQL.avisos)).rows[0].j.find((f) => f.empresa_id === anunciada.empresaId);
      const e = (await db.query(SQL.estado, [anunciada.empresaId, 'staging'])).rows[0].j;
      return [(await J('select public.bancard_renovacion_frenada($1) v', [anunciada.empresaId])).v, fila.debito !== null, e.debito.fecha_cobro !== null];
    };
    await db.exec('begin');
    const conLaRegla = await anuncio();
    await db.exec('rollback');
    ok('un Básico de tres personas con tarjeta, que vence mañana: la renovación está frenada, y no se anuncia ningún cobro automático', conLaRegla, [true, false, false]);
    ok('  a una cuenta donde el equipo entra no le cambia nada', (await J('select public.bancard_renovacion_frenada($1) v', [basM.empresaId])).v, false);
    // La otra perilla que deja escrita la migración: que no frene el cobro automático.
    await db.exec('begin');
    await db.exec(`create or replace function public.pago_de_plan_exige_lugar(p_empresa uuid, p_plan text, p_personas integer, p_origen text)
      returns void language plpgsql stable security definer set search_path = public as $f$
      begin
        if p_origen = 'automatico' then return; end if;
        perform public.exigir_lugar_para_el_equipo(p_empresa, p_plan, p_personas);
      end $f$`);
    const soloAMano = await anuncio();
    let aMano = '(pasó)';
    try { await db.query(SQL.crear, [anunciada.empresaId, anunciada.uid, 'staging', 'plan', 'formulario', 'basico', 'mensual', null]); } catch (e) { aMano = e.message; }
    await db.exec('rollback');
    ok('si se decide que la regla no frene el cobro automático (una línea en esa función), el anuncio vuelve solo; pagar a mano sigue frenado',
      [soloAMano, aMano], [[false, true, true], equipoNoEntra(3, 'Básico', 1)]);
    await db.exec('begin');
    await db.exec(D4.textoApagada);
    const apagada = await anuncio();
    await db.exec('rollback');
    ok('y con la decisión 4 apagada del todo, también: no quedó repetida en otro lado', [apagada, await (async () => {
      await db.exec('begin'); const v = await anuncio(); await db.exec('rollback'); return v;
    })()], [[false, true, true], [true, false, false]]);
    await T.apagar(anunciada);

    // «Ni dejando vencer»: el agujero.
    const vence = await T.activa('Premium que deja vencer', 'negocio', { personas: 6, gente: 3 });
    await T.venceEn(vence, '-2 days');
    ok('un Premium con cuatro personas deja vencer y quiere pagar el Básico: no',
      mensaje(await T.intentoCrear(vence, 'staging', 'plan', 'formulario', 'basico', 'mensual', null)), equipoNoEntra(4, 'Básico', 1));
    ok('  ni el Pro (tres lugares)', mensaje(await T.intentoCrear(vence, 'staging', 'plan', 'formulario', 'pro', 'mensual', null)), equipoNoEntra(4, 'Pro', 3));
    rechazado('  ni el Premium por menos que el equipo (eso ya era así)', await T.intentoCrear(vence, 'staging', 'plan', 'formulario', 'negocio', 'mensual', 3), 'entre 4 y 15');
    const ov = await T.pagar(vence, 'staging', 'negocio', 'mensual', 4);
    ok('  el plan donde entran, sí: Premium de 4', [ov.importe, (await T.sus(vence)).tope_vendedores, await T.tope(vence), await T.miembros(vence)], [250000, 3, 4, 4]);

    // Subir de plan con gente de más (una cuenta que armó la administración).
    const armada = await T.nueva('Básico con cinco');
    await cobrarAMano(armada, 'negocio', 250000);
    await T.sumarGente(armada, 4);
    await cobrarAMano(armada, 'basico', 110000);
    await T.pruebaEn(armada, null);
    await T.venceEn(armada, '15 days');
    ok('un Básico con cinco personas quiere subir al Pro (tres): la hoja ya lo dice al cotizar',
      mensaje(await T.intentoCotizarCambio(armada, 'pro')), equipoNoEntra(5, 'Pro', 3));
    ok('  y el pago, lo mismo', mensaje(await T.intentoCrear(armada, 'staging', 'cambio', 'formulario', 'pro', null, null)), equipoNoEntra(5, 'Pro', 3));
    rechazado('  al Premium de 4 tampoco (el mensaje de siempre)', await T.intentoCotizarCambio(armada, 'negocio', 4), 'entre 5 y 15');
    ok('  al Premium de 5, sí: (310.000 − 110.000) × 15/30', (await T.cotizarCambio(armada, 'negocio', 5)).importe, 100000);
    ok('  renovar el Básico que tiene, tampoco: tiene que entrar el equipo',
      mensaje(await T.intentoCrear(armada, 'staging', 'plan', 'formulario', 'basico', 'mensual', null)), equipoNoEntra(5, 'Básico', 1));

    // Gente que entra entre crear el cambio y confirmarlo.
    const carrera = await T.activa('Entró gente en el medio', 'basico');
    const oc = await T.crear(carrera, 'staging', 'cambio', 'formulario', 'negocio', null, 4);
    for (let i = 0; i < 4; i++) {
      const uid = await H.crearUsuario(db, `carrera${i}@cambio.test`);
      await db.query(`insert into public.miembros (empresa_id, user_id, nombre, rol) values ($1, $2, 'Colado', 'vendedor')`, [carrera.empresaId, uid]);
    }
    const rc = await T.confirmar(oc.operacion, aprobada(oc.operacion, oc.importe));
    ok('si entre crear el cambio y confirmarlo el equipo creció por encima de lo pagado: se activa por lo pagado y lo mira una persona',
      [rc.conflicto, rc.revisar, (await T.sus(carrera)).plan, (await T.sus(carrera)).tope_vendedores, await T.miembros(carrera)],
      [false, 'Cambió a un plan con menos lugares que las personas de su equipo', 'negocio', 3, 5]);

    // Lo mismo en un cambio AL PRO, que es la decisión 4 del lado de la
    // confirmación (08/10: esa marca le pregunta a la misma llave). Al crear
    // entraban; en el medio entró gente por encima de los tres lugares.
    const carreraPro = await T.activa('Entró gente en el medio, hacia el Pro', 'basico');
    const ocp = await T.crear(carreraPro, 'staging', 'cambio', 'formulario', 'pro', null, null);
    for (let i = 0; i < 4; i++) {
      const uid = await H.crearUsuario(db, `carrerapro${i}@cambio.test`);
      await db.query(`insert into public.miembros (empresa_id, user_id, nombre, rol) values ($1, $2, 'Colado', 'vendedor')`, [carreraPro.empresaId, uid]);
    }
    const rcp = await T.confirmar(ocp.operacion, aprobada(ocp.operacion, ocp.importe));
    ok('y en un cambio al Pro, igual: con cinco personas al confirmar, se activa el Pro y lo mira una persona',
      [rcp.conflicto, rcp.revisar, (await T.opDe(ocp.operacion)).revisar, (await T.sus(carreraPro)).plan, await T.miembros(carreraPro)],
      [false, PARA_REVISAR_CAMBIO, PARA_REVISAR_CAMBIO, 'pro', 5]);
    // …y esa marca sale de la llave, no de una cuenta aparte: con la función
    // como va a producción, el mismo cambio no queda marcado.
    const sinMarca = await T.activa('Entró gente en el medio, hacia el Pro, apagada', 'basico');
    const osm = await T.crear(sinMarca, 'staging', 'cambio', 'formulario', 'pro', null, null);
    for (let i = 0; i < 4; i++) {
      const uid = await H.crearUsuario(db, `sinmarca${i}@cambio.test`);
      await db.query(`insert into public.miembros (empresa_id, user_id, nombre, rol) values ($1, $2, 'Colado', 'vendedor')`, [sinMarca.empresaId, uid]);
    }
    await db.exec('begin');
    await db.exec(D4.textoApagada);
    const rsm =(await db.query(SQL.confirmar, [osm.operacion, aprobada(osm.operacion, osm.importe), 'confirmacion'])).rows[0].j;
    await db.exec('rollback');
    ok('  con la llave puesta (en una transacción que se deshace), ese mismo cambio se activa sin marca', [rsm.aprobada, rsm.conflicto, rsm.revisar ?? null], [true, false, null]);

    await D4.apagar(db);
    ok('y de vuelta apagada, como la deja la 130: lo que sigue corre como va a producción', await D4.enLaBase(db), 'apagada');
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('14 · En prueba, vencidas y personales: nada de lo nuevo, y todo lo de antes');
  // ═════════════════════════════════════════════════════════════════════
  {
    const enPrueba = await T.nueva('Sigue en prueba');
    rechazado('en prueba no hay cambio que cotizar', await T.intentoCotizarCambio(enPrueba, 'negocio', 4), NO_VALIDO);
    rechazado('  ni que pagar', await T.intentoCrear(enPrueba, 'staging', 'cambio', 'formulario', 'negocio', null, 4), NO_VALIDO);
    rechazado('  ni baja que programar', await T.intentoProgramar(enPrueba, 'basico'), NO_VALIDO);
    ok('  la pantalla no ve nada programado', [(await T.estado(enPrueba, 'staging')).plan_proximo, (await T.estado(enPrueba, 'staging')).plan_proximo_pagable], [null, false]);
    await T.guardarTarjeta(enPrueba);
    await db.query(`update public.suscripciones set periodo_fin = now() + interval '1 day', prueba_fin = now() + interval '1 day' where empresa_id = $1`, [enPrueba.empresaId]);
    ok('  y una cuenta en prueba sigue sin cobrarse sola', await T.tomar(), null);
    const oe = await T.pagar(enPrueba, 'produccion', 'basico', 'mensual', null);
    ok('  paga el plan que elige, entero, por el camino de siempre', [oe.importe, (await T.sus(enPrueba)).plan, (await T.sus(enPrueba)).estado], [110000, 'basico', 'activa']);
    await T.apagar(enPrueba);

    const vencida = await T.activa('Venció hace tres días', 'pro', { falta: '-3 days' });
    rechazado('vencida no hay cambio que cotizar', await T.intentoCotizarCambio(vencida, 'negocio', 4), NO_VALIDO);
    rechazado('  ni que pagar', await T.intentoCrear(vencida, 'staging', 'cambio', 'formulario', 'negocio', null, 4), NO_VALIDO);
    rechazado('  ni baja que programar', await T.intentoProgramar(vencida, 'basico'), NO_VALIDO);
    const ov = await T.pagar(vencida, 'staging', 'basico', 'mensual', null);
    ok('  paga el plan que quiera, entero, y arranca hoy', [ov.importe, (await T.sus(vencida)).plan, (await T.sus(vencida)).efectivo], [110000, 'basico', 'basico']);

    const personal = await T.activa('Cuenta personal', 'pro', { opciones: { tipoCuenta: 'personal' } });
    rechazado('una cuenta personal tiene un solo plan pago: no hay a qué subir', await T.intentoCotizarCambio(personal, 'negocio', 4), NO_VALIDO);
    rechazado('  ni por el pago', await T.intentoCrear(personal, 'staging', 'cambio', 'formulario', 'negocio', null, 4), NO_VALIDO);
    rechazado('  ni a qué bajar', await T.intentoProgramar(personal, 'basico'), NO_VALIDO);
    ok('  y renueva su Pro como siempre: Gs. 40.000', (await T.pagar(personal, 'staging', 'pro', 'mensual', null)).importe, 40000);

    const profe = await T.activa('Profe de inglés', 'basico', { opciones: { rubro: 'clases' } });
    rechazado('el profe (su rubro solo ofrece el Básico) no tiene a qué subir', await T.intentoCotizarCambio(profe, 'pro'), 'no está disponible para tu rubro');
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('15 · Permisos, con los privilegios por defecto de Supabase puestos antes de aplicar');
  // ═════════════════════════════════════════════════════════════════════
  {
    const cat = [...(await catalogo(db)).values()];
    // [anon, con sesión, servidor, security definer, search_path fijo]
    const de = (n) => cat.filter((f) => f.nombre === n).map((f) => [f.anon, f.sesion, f.servicio, f.definer, /search_path=public/.test(f.config)]);
    ok('cotizar_cambio: solo con sesión (adentro exige ser quien administra la cuenta)', de('cotizar_cambio'), [[false, true, false, true, true]]);
    ok('bancard_programar_plan: solo el servidor', de('bancard_programar_plan'), [[false, false, true, true, true]]);
    ok('las internas que leen datos: nadie de afuera, ni el servidor directo',
      ['prorrateo_de_plan', 'bancard_plan_de_renovacion', 'exigir_lugar_para_el_equipo', 'pago_de_plan_exige_lugar', 'pago_de_plan_sin_lugar', 'bancard_renovacion_frenada'].map((n) => de(n)[0]),
      [1, 2, 3, 4, 5, 6].map(() => [false, false, false, true, true]));
    ok('bancard_rechazadas_abiertas (qué formularios rechazados hay que cerrar en Bancard): solo el servidor',
      de('bancard_rechazadas_abiertas'), [[false, false, true, true, true]]);
    ok('las que solo devuelven un número o un nombre: tampoco',
      ['nivel_de_plan', 'nombre_de_plan', 'dias_para_adelantar_la_baja', 'lugares_del_plan'].map((n) => de(n)[0]),
      [1, 2, 3, 4].map(() => [false, false, false, false, true]));

    const llamadas = [
      ['prorrateo_de_plan', 'select public.prorrateo_de_plan($1,$2,$3)', [basM.empresaId, 'pro', null]],
      ['bancard_plan_de_renovacion', 'select public.bancard_plan_de_renovacion($1)', [basM.empresaId]],
      ['bancard_programar_plan', 'select public.bancard_programar_plan($1,$2,$3)', [proM.empresaId, proM.uid, 'basico']],
      ['exigir_lugar_para_el_equipo', 'select public.exigir_lugar_para_el_equipo($1,$2,$3)', [basM.empresaId, 'pro', null]],
      ['pago_de_plan_exige_lugar', 'select public.pago_de_plan_exige_lugar($1,$2,$3,$4)', [basM.empresaId, 'pro', null, 'usuario']],
      ['nivel_de_plan', `select public.nivel_de_plan('pro')`, []],
      ['nombre_de_plan', `select public.nombre_de_plan('pro')`, []],
      ['dias_para_adelantar_la_baja', 'select public.dias_para_adelantar_la_baja()', []],
      ['lugares_del_plan', `select public.lugares_del_plan('pro', 4)`, []],
      ['bancard_crear_operacion (un cambio)', SQL.crear, [basM.empresaId, basM.uid, 'staging', 'cambio', 'formulario', 'pro', null, null]],
      // Las dos de la revisión del 08/10 van al final: las listas de abajo se arman por posición.
      ['bancard_renovacion_frenada', 'select public.bancard_renovacion_frenada($1)', [basM.empresaId]],
      ['bancard_rechazadas_abiertas', 'select public.bancard_rechazadas_abiertas($1,$2,$3)', [basM.empresaId, null, null]],
      // La hermana de la llave de la decisión 4 (08/10): también al final.
      ['pago_de_plan_sin_lugar', 'select public.pago_de_plan_sin_lugar($1,$2,$3,$4)', [basM.empresaId, 'pro', null, 'usuario']],
    ];
    for (const [quien, rol, uid] of [['el dueño', 'authenticated', basM.uid], ['la administración con sesión', 'authenticated', jefe.uid], ['sin sesión', 'anon', null]]) {
      const pasaron = [];
      for (const [nombre, sql, p] of llamadas) {
        const r = await H.intentarComo(db, rol, uid, () => db.query(sql, p));
        if (r.ok || !/permission denied/i.test(r.error)) pasaron.push(nombre);
      }
      ok(`${quien}: llamar directo a lo que escribe o a lo interno → denegado`, pasaron, []);
    }
    rechazado('sin sesión tampoco se cotiza un cambio', await H.intentarComo(db, 'anon', null, () => db.query(SQL.cotizarCambio, [basM.empresaId, 'pro', null])), 'permission denied');
    const delServidor = [];
    for (const [nombre, sql, p] of [['cotizar_cambio', SQL.cotizarCambio, [basM.empresaId, 'pro', null]], ...llamadas.slice(0, 2), ...llamadas.slice(3, 9), llamadas[10], llamadas[12]]) {
      const r = await intentoS(sql, p);
      if (r.ok || !/permission denied/i.test(r.error)) delServidor.push(nombre);
    }
    ok('el servidor (service_role) tampoco llama directo a la cotización de la pantalla ni a las internas', delServidor, []);
    rechazado('la columna nueva no se lee con sesión (la tabla no le da permisos a nadie)',
      await intentoU(basM.uid, 'select plan_proximo from public.bancard_cuentas', []), 'permission denied');
    rechazado('ni se escribe', await intentoU(proM.uid, `update public.bancard_cuentas set plan_proximo = 'basico'`, []), 'permission denied');
    ok('después de todos esos intentos no quedó nada programado ni ningún pago a medias en esas dos cuentas',
      [await T.programado(basM), await T.programado(proM),
        (await J(`select count(*)::int n from public.bancard_operaciones where empresa_id = any($1) and estado = 'creada'`, [[basM.empresaId, proM.empresaId]])).n],
      [[null, null], [null, null], 0]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('16 · La forma de la migración: sin barras, idempotente, la restricción de «tipo» y la guarda');
  // ═════════════════════════════════════════════════════════════════════
  {
    ok('la 130 no tiene ni una barra invertida (el MCP con el que se aplica las duplica)', sql130.includes(BARRA), false);
    ok('ni crea ni saca ningún disparador: el de la baja que caduca es el de la 125', /^\s*(create|drop)\s+trigger/im.test(sql130), false);
    const sobreTipo = async (base) => (await base.query(
      `select c.conname, pg_get_constraintdef(c.oid) as def from pg_constraint c
        where c.conrelid = 'public.bancard_operaciones'::regclass and c.contype = 'c'
          and c.conkey = array[(select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'tipo')]
        order by 1`)).rows;
    const lasDemas = async (base) => (await base.query(
      `select c.conrelid::regclass::text || '.' || c.conname as n from pg_constraint c
        where c.conrelid in ('public.bancard_operaciones'::regclass, 'public.bancard_cuentas'::regclass)
          and not (c.conrelid = 'public.bancard_operaciones'::regclass and c.contype = 'c'
                   and c.conkey = array[(select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'tipo')])
        order by 1`)).rows.map((r) => r.n);
    ok('queda UNA restricción sobre «tipo», con los tres tipos',
      (await sobreTipo(db)).map((r) => [r.conname, ['plan', 'personas', 'cambio'].every((t) => r.def.includes(`'${t}'`))]), [['bancard_operaciones_tipo_check', true]]);
    rechazado('un tipo inventado no entra ni a mano',
      await H.intentarComo(db, 'postgres', null, () => db.query(
        `insert into public.bancard_operaciones (empresa_id, entorno, tipo, medio, origen, plan, periodo, desglose, lista, importe, descripcion)
         values ($1,'staging','regalo','formulario','usuario','pro','mensual','{}',1,1,'x')`, [ajeno.empresaId])), 'bancard_operaciones_tipo_check');
    rechazado('ni por el pago', await T.intentoCrear(ajeno, 'staging', 'regalo', 'formulario', 'pro', 'mensual', null), NO_VALIDO);

    // ---- una vez más, sobre la base llena de pagos y de bajas programadas
    const cuenta = async () => JSON.stringify([
      (await db.query(`select estado, tipo, count(*)::int n, sum(importe)::float total from public.bancard_operaciones group by 1, 2 order by 1, 2`)).rows,
      (await db.query(`select count(*)::int n, count(plan_proximo)::int planes, count(personas_proxima)::int personas from public.bancard_cuentas`)).rows,
      (await J('select last_value::int n from public.bancard_operacion_seq')).n,
      (await db.query(`select plan, estado, count(*)::int n from public.suscripciones group by 1, 2 order by 1, 2`)).rows,
      await lasDemas(db), await sobreTipo(db),
      [...(await catalogo(db)).values()],
    ]);
    const antes = await cuenta();
    let error = null;
    try { await H.aplicarMigracion(db, '130'); } catch (e) { error = e.message; }
    ok('aplicada una tercera vez, sobre la base con todo lo de esta prueba adentro: sin error', error, null);
    ok('  y no tocó ningún pago, ninguna baja programada, ninguna restricción, ninguna función ni ningún permiso', await cuenta() === antes, true);
    ok('  había bajas programadas de verdad para no tocar',
      (await db.query(`select count(plan_proximo)::int planes, count(personas_proxima)::int personas from public.bancard_cuentas`)).rows[0].planes > 0, true);
    ok('  el disparador de la baja sigue siendo uno solo', (await J(`select count(*)::int n from pg_trigger where tgname = 'bancard_baja_caduca'`)).n, 1);
    ok('  y todo sigue andando: una cuenta nueva sube de plan',
      (await subir(await T.activa('Después de reaplicar', 'basico'), 'pro')).r.aprobada, true);

    // ---- si en producción la restricción de «tipo» se llamara distinto (o hubiera dos)
    const rara = await H.crearBase({ hasta: ULTIMA_ANTERIOR });
    const demasAntes = await lasDemas(rara);
    await rara.exec('alter table public.bancard_operaciones rename constraint bancard_operaciones_tipo_check to puesta_con_otro_nombre');
    await rara.exec(`alter table public.bancard_operaciones add constraint y_otra_mas check (tipo <> 'nada')`);
    ok('una base donde la restricción de «tipo» no se llama como uno adivinaría, y además hay otra',
      (await sobreTipo(rara)).map((r) => r.conname), ['puesta_con_otro_nombre', 'y_otra_mas']);
    await H.aplicarMigracion(rara, '130');
    ok('  con la 130 queda UNA, la buena: se buscan en el catálogo, no por un nombre',
      (await sobreTipo(rara)).map((r) => [r.conname, r.def.includes(`'cambio'`)]), [['bancard_operaciones_tipo_check', true]]);
    const demasDespues = await lasDemas(rara);
    ok('  y de las demás restricciones de esas dos tablas no falta ninguna; se suman las dos de la baja de plan',
      [demasAntes.length > 20, demasAntes.filter((n) => !demasDespues.includes(n)), demasDespues.filter((n) => !demasAntes.includes(n))],
      [true, [], ['bancard_cuentas.bancard_cuentas_plan_proximo_check', 'bancard_cuentas.bancard_cuentas_una_sola_baja']]);
    await rara.close();

    // ---- la guarda: sin la 124, la 125 y la 126 no toca nada
    for (const [hasta, falta] of [['123', 'bancard_cuentas'], ['125', '126']]) {
      const sola = await H.crearBase({ hasta });
      let err = null;
      try { await H.aplicarMigracion(sola, '130'); } catch (e) { err = e.message; }
      ok(`sobre una base hasta la ${hasta}: se niega con un mensaje claro y no deja nada a medias`,
        [/^Falta aplicar la 124, la 125 y la 126 antes que la 130: no existe/.test(err ?? ''), (err ?? '').includes(falta),
          (await sola.query(`select count(*)::int n from pg_proc where proname = any($1)`, [NUEVAS])).rows[0].n], [true, true, 0]);
      await sola.close();
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('17 · Cada función que se vuelve a definir es su última versión, salvo lo marcado «(130)»');
  // ═════════════════════════════════════════════════════════════════════
  {
    const MARCA = '(130)';
    const cuerpo = (sql, nombre) => {
      const i = sql.indexOf(`create or replace function public.${nombre}(`);
      if (i < 0) return null;
      const fin = sql.indexOf('$fn$;', i);
      return fin < 0 ? null : sql.slice(i, fin + '$fn$;'.length);
    };
    const fuentes = new Map(ANTERIORES.map((f) => [f, leer(`supabase/migrations/${f}`)]));
    /** La última definición antes de la 130, y en qué archivo está. */
    const anterior = (nombre) => {
      let hallada = null;
      for (const [f, sql] of fuentes) { const c = cuerpo(sql, nombre); if (c) hallada = { archivo: f, texto: c }; }
      return hallada;
    };
    const definidas = [...sql130.matchAll(/^create or replace function public[.](\w+)[(]/gm)].map((x) => x[1]);
    ok('la 130 define veinticinco funciones: las que ya existían son estas doce, en este orden', definidas.filter((n) => anterior(n)), RECOPIADAS);
    ok('  y las otras trece son nuevas (ninguna pisa algo que ya existía)', definidas.filter((n) => !anterior(n)).sort(), NUEVAS);

    // Las líneas de la versión anterior que ya no están tal cual: cada una
    // se reemplazó por una línea marcada. Son estas, y ninguna más.
    const REEMPLAZADAS = {
      bancard_crear_operacion_interna: [
        "     or p_tipo is null or p_tipo not in ('plan', 'personas')",
        '       and p_personas is distinct from public.bancard_personas_de_renovacion(p_empresa) then',
      ],
      bancard_confirmar: [
        "        'plan_despues',   case when v_op.tipo = 'plan' then v_op.plan else v_sus.plan end,",
      ],
      bancard_revertir: [
        "         and r.accion in ('cambiar_plan', 'extender_prueba', 'bancard_personas')",
        '  where empresa_id = v_op.empresa_id and debito_activo;',
        "    and accion in ('cambiar_plan', 'bancard_personas', 'bancard_prueba')",
      ],
    };
    for (const nombre of RECOPIADAS) {
      const antes = anterior(nombre);
      const ahora = cuerpo(sql130, nombre).split('\n');
      const deAntes = antes.texto.split('\n');
      const sinMarca = ahora.filter((l) => !l.includes(MARCA));
      // Lo que queda sin las líneas marcadas tiene que ser la versión
      // anterior, en orden; lo que falte de la anterior son las reemplazadas.
      const reemplazadas = [];
      let k = 0;
      for (const l of deAntes) {
        if (k < sinMarca.length && sinMarca[k] === l) k++;
        else reemplazadas.push(l);
      }
      const sobran = sinMarca.slice(k);
      const esperado = [nombre === 'vencimientos_por_avisar' ? '126' : '125', [], REEMPLAZADAS[nombre] ?? []];
      corridas++;
      if (JSON.stringify([antes.archivo.slice(0, 3), sobran, reemplazadas]) === JSON.stringify(esperado)) {
        console.log(`  ✓ ${nombre}: es la de la ${antes.archivo.slice(0, 3)} → ${deAntes.length - reemplazadas.length} líneas iguales, `
          + `${ahora.length - sinMarca.length} marcadas, ${reemplazadas.length} reemplazadas`);
      } else {
        fallos++;
        console.log(`  ✗ ${nombre}: no es su versión anterior más lo marcado\n      sale de: ${antes.archivo}\n      líneas sin marca que no son de antes: ${JSON.stringify(sobran.slice(0, 6))}`
          + `\n      líneas de antes que faltan: ${JSON.stringify(reemplazadas)}\n      se esperaban estas: ${JSON.stringify(esperado[2])}`);
      }
    }
  }

  await db.close();

  console.log(`\n${'═'.repeat(62)}`);
  console.log(fallos === 0
    ? `>>> ${corridas} COMPROBACIONES DE CAMBIAR DE PLAN PASARON (${Math.round((Date.now() - t0) / 1000)} s)`
    : `>>> ${fallos} DE ${corridas} COMPROBACIONES DE CAMBIAR DE PLAN FALLARON`);
  process.exit(fallos ? 1 : 0);
}

principal().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message ?? e, e.stack ?? '');
  process.exit(1);
});
