/**
 * El fiado con fecha de cobro y en cuotas (migración 127, 07/10/2026).
 *
 * Una venta a crédito puede llevar fecha de cobro —una sola o en cuotas— y
 * el negocio recibe un aviso a la mañana el día que le toca cobrar. Lo de
 * siempre («me debe y punto») sigue igual.
 *
 * En orden de importancia:
 *   0. que con la 127 aplicada el código publicado HOY siga andando: las
 *      mismas llamadas, con los mismos argumentos, devuelven lo mismo;
 *   1. que el saldo siga siendo la suma del libro, y que lo «sin fecha» más
 *      lo pendiente de las cuotas sea SIEMPRE ese saldo, después de cada
 *      paso de una secuencia larga de fiar, cobrar, borrar, rearmar y mover;
 *   2. que un cobro parcial, uno de más y un doble toque hagan lo que la
 *      persona espera;
 *   3. que anular la venta, borrar la línea, eliminar al cliente y empezar
 *      de cero se lleven (o no) las cuotas como corresponde;
 *   4. que la cuenta vencida y la personal en Gratis no puedan escribir;
 *   5. que el aviso salga el día que toca, en la zona de cada negocio, y le
 *      llegue a quien puede abrir Fiado y no lo apagó;
 *   6. que las pantallas y la base hablen lo mismo: cada `rpc(...)` de src
 *      se lee del código, se compara con la firma real y se llama con sus
 *      argumentos exactos; y lo que la pantalla muestra suma el saldo del
 *      libro. Para eso usa la cuenta compilada de src/lib (.compilado):
 *      `npm run probar:fiado-fechas` compila antes de correr.
 *
 * Las fechas salen de `hoy_empresa` (la zona del negocio), nunca del reloj
 * de esta máquina.
 */
const fs = require('fs');
const path = require('path');
const H = require('./ayuda-db.js');

let fallos = 0;
let corridas = 0;

function grupo(nombre) {
  console.log(`\n── ${nombre} ${'─'.repeat(Math.max(0, 58 - nombre.length))}`);
}

// Las claves, ordenadas: PostgreSQL devuelve las de un jsonb en SU orden
// (primero las más cortas), y acá lo que se compara es el contenido.
function enOrden(v) {
  if (Array.isArray(v)) return v.map(enOrden);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, enOrden(v[k])]));
  return v;
}

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(enOrden(real)) ?? 'undefined';
  const b = JSON.stringify(enOrden(esperado)) ?? 'undefined';
  if (a !== b) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`);
  } else {
    console.log(`  ✓ ${nombre} → ${a.length > 150 ? `${a.slice(0, 150)}…` : a}`);
  }
}

function rechazado(nombre, resultado, fragmento) {
  corridas++;
  if (resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      NO fue rechazada (devolvió ${JSON.stringify(resultado.valor?.rows ?? resultado.valor)})`);
    return;
  }
  if (fragmento && !new RegExp(fragmento, 'i').test(resultado.error)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      rechazada por otro motivo: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${resultado.error.slice(0, 80)}`);
}

function aceptado(nombre, resultado) {
  corridas++;
  if (!resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      fue rechazada: ${resultado.error}`);
    return false;
  }
  console.log(`  ✓ ${nombre}`);
  return true;
}

// Los ejemplos reales que van a CONTRATO-REAL.md (lo que comparan las pantallas).
const EJEMPLOS = {};
const guardarEjemplo = (clave, valor) => { EJEMPLOS[clave] = valor; return valor; };

// Sumar días a una fecha YYYY-MM-DD. Es aritmética de calendario sobre una
// fecha que ya vino de la base, no una lectura del reloj.
// La base de las pruebas anota la hora con milésimas: dos líneas anotadas
// una atrás de la otra pueden compartirla. Donde importa cuál se anotó
// primero (los pagos sueltos cubren lo más viejo), se deja pasar un instante.
const pausa = () => new Promise((r) => setTimeout(r, 5));

function masDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + n));
  return f.toISOString().slice(0, 10);
}

// Azar con semilla: la secuencia larga es siempre la misma.
function conSemilla(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CANDADO = 'Se te terminó la prueba';
const ES_DE_PAGO = 'plan Pro';

const vencer = (db, id) => db.query(
  `update public.suscripciones
   set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
   where empresa_id = $1`, [id]);
const pagar = (db, id) => H.comoServicio(db, () => db.query(
  "select public.aplicar_suscripcion($1,'pro','activa',now(),now()+interval '30 days','manual')", [id]));

/** Las herramientas de siempre, atadas a una base. */
function herramientas(db) {
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const val = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(`${sql} → ${r.error}`);
    return r.valor.rows[0];
  };
  const J = async (uid, sql, args = []) => (await val(uid, sql, args)).j;
  const filas = async (sql, args = []) => (await db.query(sql, args)).rows;
  const n = async (sql, args = []) => Number((await filas(sql, args))[0].n);
  const hoyDe = async (E) => (await filas('select public.hoy_empresa($1)::text d', [E]))[0].d;
  const saldo = (c) => n('select public.saldo_fiado($1)::numeric n', [c]);
  const sinFecha = (c) => n('select public.sin_fecha_fiado($1)::numeric n', [c]);
  const cuotasDe = async (c) => (await filas(
    `select cuota_id, fio_id, numero::int, de::int, vence_el::text, monto::float8 monto, pagado::float8 pagado,
            pendiente::float8 pendiente, dias, avisado_el::text
     from public.estado_cuotas($1)`, [c]));
  // «pagado/pendiente» de cada cuota, cortito, para leer en la salida.
  const pend = async (c) => (await cuotasDe(c)).map((q) => q.pendiente);
  return { como, val, J, filas, n, hoyDe, saldo, sinFecha, cuotasDe, pend };
}

/**
 * LA PROPIEDAD CENTRAL, en una sola consulta y con la aritmética de la base
 * (nada de coma flotante de JavaScript). Devuelve la lista de lo que NO se
 * cumple: vacía = todo cierra.
 */
async function loQueNoCierra(db, cliente) {
  const r = (await db.query(`
    select
      (public.sin_fecha_fiado($1)
         + coalesce((select sum(e.pendiente) from public.estado_cuotas($1) e), 0)
         = greatest(public.saldo_fiado($1), 0)) as identidad,
      coalesce((select bool_and(e.pagado >= 0 and e.pagado <= e.monto
                                and e.pendiente >= 0 and e.pagado + e.pendiente = e.monto)
                from public.estado_cuotas($1) e), true) as rangos,
      coalesce((select bool_and(
                  coalesce((select sum(c.monto) from public.fiado c
                            where c.fio_id = f.id and c.tipo = 'cobro'), 0) <= f.monto)
                from public.fiado f
                where f.cliente_id = $1 and f.tipo = 'fio'
                  and exists (select 1 from public.fiado_cuotas q where q.fio_id = f.id)), true) as pagos_de_la_deuda,
      coalesce((select bool_and(s.suma = f.monto and s.cuantas = s.ultimo and s.primero = 1)
                from public.fiado f
                join (select q.fio_id, sum(q.monto) suma, count(*) cuantas,
                             max(q.numero) ultimo, min(q.numero) primero
                      from public.fiado_cuotas q group by q.fio_id) s on s.fio_id = f.id
                where f.cliente_id = $1), true) as cuotas_suman_la_linea,
      public.sin_fecha_fiado($1) >= 0 as sin_fecha_no_negativo
  `, [cliente])).rows[0];
  return Object.entries(r).filter(([, v]) => v !== true).map(([k]) => k);
}

(async () => {
  // ═════════════════════════════════════════════════════════════════════
  // PARTE 0 · COMPATIBILIDAD
  //
  // La 127 se aplica en producción ANTES de desplegar el código nuevo.
  // Durante esos minutos el código publicado hoy le habla a la base nueva.
  // Acá se arma una base SIN la 127, se la usa como hoy, se aplica la 127 y
  // se repiten las mismas llamadas, con los argumentos con nombre EXACTOS
  // de cada pantalla (como los manda PostgREST).
  // ═════════════════════════════════════════════════════════════════════
  {
    grupo('0 · Con la 127 aplicada, el código publicado hoy sigue andando');
    const db = await H.crearBase({ hasta: '123' });
    const T = herramientas(db);
    ok('la base de antes no tiene fiado_cuotas (la prueba arranca sin la 127)',
      await T.n("select count(*)::int n from information_schema.tables where table_schema='public' and table_name='fiado_cuotas'"), 0);

    const A = await H.montarEmpresa(db, { email: 'hoy@almacen.com', nombre: 'Almacén de hoy' });
    const E = A.empresaId;
    const U = A.uid;
    const juan = (await T.val(U, "select public.guardar_cliente($1,'Juan Pérez','0981 234 567') id", [E])).id;
    const ana = (await T.val(U, "select public.guardar_cliente($1,'Ana Gómez','0982 111 222') id", [E])).id;
    const caja = (await T.val(U, "select public.guardar_cuenta_dinero($1,'Caja','efectivo',500000,'{efectivo}') id", [E])).id;
    const hoy = await T.hoyDe(E);

    // Las llamadas del código de hoy, tal cual (HEAD a6eea19).
    const LLAMADAS = {
      // PantallaFiado.tsx:199-205
      anotarPantalla: (monto, concepto, cuenta = null) => ['select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_concepto => $4, p_cuenta => $5) r',
        [E, juan, monto, concepto, cuenta]],
      // RevisionFiado.tsx:131-135
      anotarRevision: (monto) => ['select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_concepto => $4, p_fecha => $5, p_cuenta => $6) r',
        [E, ana, monto, 'por voz', hoy, null]],
      // PantallaFiado.tsx:337-340
      cobrarPantalla: (monto, cuenta = null) => ['select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_metodo => $4, p_cuenta => $5) r',
        [E, juan, monto, 'efectivo', cuenta]],
      // RevisionFiado.tsx:122-126
      cobrarRevision: (monto) => ['select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_metodo => $4, p_fecha => $5, p_cuenta => $6) r',
        [E, ana, monto, 'transferencia', hoy, null]],
      // PantallaFiado.tsx:319-321
      libro: (cliente) => ['select public.libro_fiado(p_cliente => $1, p_limite => $2) r', [cliente, 100]],
      // src/lib/fiado.ts:17, RevisionFiado.tsx:84, api/capturar/route.ts:143
      resumen: () => ['select public.resumen_fiado(p_empresa => $1) r', [E]],
      // PantallaFiado.tsx:359
      borrar: (linea) => ['select public.borrar_linea_fiado(p_linea => $1) r', [linea]],
      // PantallaVenta.tsx:341-360 (y CapturaInteligente.tsx:558 con los mismos nombres)
      vender: (cliente) => [`select public.registrar_venta(p_empresa => $1, p_items => $2::jsonb, p_fecha => $3, p_descripcion => $4,
          p_metodo_pago => $5, p_contraparte => $6, p_cliente => $7, p_notas => $8, p_origen => $9, p_descuento => $10, p_cuenta => $11) r`,
        [E, JSON.stringify([{ producto_id: null, nombre: 'Yerba', cantidad: 3, precio_unitario: 20000, costo_unitario: 12000 }]),
          hoy, '', 'credito', 'Juan Pérez', cliente, '', 'manual', 0, null]],
      // Preferencias.tsx:47
      idioma: () => ['select public.guardar_preferencias(p_idioma => $1) r', ['pt']],
      // Preferencias.tsx:103-109
      avisos: () => [`select public.guardar_preferencias(p_aviso_cierre => $1, p_aviso_semanal => $2, p_hora_cierre => $3,
          p_aviso_turnos => $4, p_aviso_diario => $5) r`, [true, false, 21, true, false]],
      // ajustes/page.tsx:280
      misPreferencias: () => ['select public.mis_preferencias() r', []],
    };
    const llamar = async (nombre, ...args) => {
      const [sql, valores] = LLAMADAS[nombre](...args);
      return T.como(U, sql, valores);
    };
    const r = async (nombre, ...args) => {
      const res = await llamar(nombre, ...args);
      if (!res.ok) throw new Error(`${nombre} → ${res.error}`);
      return res.valor.rows[0].r;
    };

    // ---- ANTES de la 127: se usa como hoy ----
    await r('anotarPantalla', 500000, 'Mercadería');
    const lineaVieja = await r('anotarPantalla', 80000, 'Me equivoqué');
    await r('anotarRevision', 300000);
    await r('vender', juan);
    await r('cobrarPantalla', 100000);
    await r('idioma');
    await r('avisos');
    const resumenAntes = await r('resumen');
    const libroAntes = await r('libro', juan);
    const prefsAntes = await r('misPreferencias');
    const clavesDeAntes = {
      resumen: Object.keys(resumenAntes).sort(),
      cliente: Object.keys(resumenAntes.clientes[0]).sort(),
      linea: Object.keys(libroAntes[0]).sort(),
      prefs: Object.keys(prefsAntes).sort(),
    };
    ok('antes: el resumen de siempre', [resumenAntes.total, resumenAntes.cuantos, resumenAntes.clientes.map((c) => [c.nombre, c.saldo])],
      [840000, 2, [['Juan Pérez', 540000], ['Ana Gómez', 300000]]]);

    // ---- se aplica la 127 ----
    const archivo = await H.aplicarMigracion(db, '127');
    console.log(`  · ${archivo} aplicada sobre una base con datos`);

    // ---- DESPUÉS: las mismas llamadas, lo mismo ----
    const resumenDespues = await r('resumen');
    const libroDespues = await r('libro', juan);
    const soloLasDeAntes = (obj, claves) => Object.fromEntries(claves.map((k) => [k, obj[k]]));
    ok('resumen_fiado: total, cuantos y el orden de los clientes, iguales',
      [resumenDespues.total, resumenDespues.cuantos, resumenDespues.clientes.map((c) => c.cliente_id)],
      [resumenAntes.total, resumenAntes.cuantos, resumenAntes.clientes.map((c) => c.cliente_id)]);
    ok('resumen_fiado: cada cliente, con las claves de antes y los mismos valores',
      resumenDespues.clientes.map((c) => soloLasDeAntes(c, clavesDeAntes.cliente)), resumenAntes.clientes);
    ok('resumen_fiado: no perdió ninguna clave',
      clavesDeAntes.resumen.filter((k) => !(k in resumenDespues)), []);
    ok('sin ninguna fecha cargada, todos están en «sin fecha» y lo sin fecha es todo lo que deben',
      resumenDespues.clientes.map((c) => [c.grupo, c.sin_fecha === c.saldo, c.con_fecha, c.proxima]),
      [['sin_fecha', true, 0, null], ['sin_fecha', true, 0, null]]);
    ok('libro_fiado: cada línea, con las claves de antes y los mismos valores',
      libroDespues.map((l) => soloLasDeAntes(l, clavesDeAntes.linea)), libroAntes);
    ok('las claves de antes de una línea', clavesDeAntes.linea,
      ['concepto', 'created_at', 'fecha', 'id', 'monto', 'tipo', 'venta_id']);

    const anotado = await llamar('anotarPantalla', 20000, 'Fideos');
    aceptado('anotar_fiado, como lo llama la pantalla de Fiado', anotado);
    ok('y sigue devolviendo el id de la línea (un uuid suelto)',
      typeof anotado.valor?.rows[0].r === 'string' && anotado.valor.rows[0].r.length === 36, true);
    aceptado('anotar_fiado, como lo llama la revisión por voz', await llamar('anotarRevision', 50000));
    aceptado('anotar_fiado prestando de una cuenta (084)', await llamar('anotarPantalla', 10000, 'Préstamo', caja));

    const cobrado = await llamar('cobrarPantalla', 40000);
    aceptado('cobrar_fiado, como lo llama la pantalla de Fiado', cobrado);
    const jc = cobrado.valor?.rows[0].r ?? {};
    ok('devuelve id y saldo, como siempre', [typeof jc.id, jc.saldo], ['string', 530000]);
    ok('y lo nuevo viene vacío: sin deuda elegida', [jc.sin_fecha, jc.deuda], [530000, null]);
    aceptado('cobrar_fiado, como lo llama la revisión por voz', await llamar('cobrarRevision', 50000));
    aceptado('cobrar_fiado a una cuenta (084)', await llamar('cobrarPantalla', 10000, caja));
    rechazado('cobrar de más se rechaza con el mensaje de siempre',
      await llamar('cobrarPantalla', 999999999), 'Juan Pérez te debe 520.000, no podés cobrarle más que eso');
    ok('el pago suelto no apunta a ninguna deuda',
      await T.n("select count(*)::int n from public.fiado where empresa_id=$1 and tipo='cobro' and fio_id is not null", [E]), 0);

    const venta = await llamar('vender', juan);
    aceptado('registrar_venta fiada, como la llama Vender', venta);
    ok('y dejó su línea en el libro, sin cuotas',
      [await T.n('select count(*)::int n from public.fiado where venta_id=$1', [venta.valor?.rows[0].r]),
        await T.n('select count(*)::int n from public.fiado_cuotas where empresa_id=$1', [E])], [1, 0]);

    aceptado('borrar_linea_fiado, como la llama la pantalla', await llamar('borrar', lineaVieja));

    const prefsDespues = await r('misPreferencias');
    ok('mis_preferencias: las claves de antes, con lo que estaba guardado',
      soloLasDeAntes(prefsDespues, clavesDeAntes.prefs), prefsAntes);
    ok('y lo guardado antes de la 127 no se pisó',
      [prefsDespues.idioma, prefsDespues.aviso_semanal, prefsDespues.hora_cierre, prefsDespues.aviso_diario], ['pt', false, 21, false]);
    ok('el aviso nuevo nace encendido para quien ya tenía preferencias', prefsDespues.aviso_cobros, true);
    aceptado('guardar_preferencias con solo el idioma (el selector de idioma)', await llamar('idioma'));
    const avisos = await llamar('avisos');
    aceptado('guardar_preferencias con los cinco interruptores de hoy', avisos);
    ok('y no tocó el aviso nuevo, que no mandó', avisos.valor?.rows[0].r.aviso_cobros, true);

    // Una sola versión de cada una: con dos, PostgREST no sabría cuál llamar.
    const FUNCIONES = ['anotar_fiado', 'cobrar_fiado', 'guardar_preferencias', 'mis_preferencias', 'resumen_fiado',
      'libro_fiado', 'borrar_linea_fiado', 'anular_borra_el_fiado', 'registrar_venta', 'saldo_fiado',
      'programar_cuotas', 'quitar_cuotas', 'mover_cuota', 'marcar_cuota_avisada', 'detalle_fiado',
      'cuotas_por_cobrar', 'cobros_de_hoy', 'estado_cuotas', 'sin_fecha_fiado', 'partes_fiado',
      'fiado_monto_texto', 'rubro_tiene_fiado'];
    const versiones = async () => {
      const v = await T.filas(
        `select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
         where s.nspname = 'public' and p.proname = any($1) group by p.proname`, [FUNCIONES]);
      return FUNCIONES.map((f) => v.find((x) => x.proname === f)?.n ?? 0);
    };
    ok('cada función existe una sola vez (ninguna versión vieja duplicada)', await versiones(), FUNCIONES.map(() => 1));
    const firmas = async () => Object.fromEntries((await T.filas(
      `select p.proname, pg_get_function_arguments(p.oid) a from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname in ('anotar_fiado','cobrar_fiado','guardar_preferencias')`))
      .map((x) => [x.proname, x.a]));
    ok('los parámetros de siempre, con el mismo nombre y en el mismo orden; lo nuevo al final y con default',
      await firmas(), {
        anotar_fiado: "p_empresa uuid, p_cliente uuid, p_monto numeric, p_concepto text DEFAULT ''::text, p_fecha date DEFAULT NULL::date, p_cuenta uuid DEFAULT NULL::uuid, p_plan jsonb DEFAULT NULL::jsonb",
        cobrar_fiado: "p_empresa uuid, p_cliente uuid, p_monto numeric, p_metodo text DEFAULT 'efectivo'::text, p_fecha date DEFAULT NULL::date, p_cuenta uuid DEFAULT NULL::uuid, p_cuota uuid DEFAULT NULL::uuid",
        guardar_preferencias: 'p_idioma text DEFAULT NULL::text, p_aviso_cierre boolean DEFAULT NULL::boolean, p_aviso_semanal boolean DEFAULT NULL::boolean, p_hora_cierre smallint DEFAULT NULL::smallint, p_aviso_turnos boolean DEFAULT NULL::boolean, p_aviso_diario boolean DEFAULT NULL::boolean, p_aviso_cobros boolean DEFAULT NULL::boolean',
      });
    // Las pruebas viejas las llaman por posición: el sexto sigue siendo la cuenta.
    aceptado('cobrar_fiado por posición: el sexto argumento sigue siendo la cuenta',
      await T.como(U, "select public.cobrar_fiado($1,$2,1000,'efectivo',null,$3)", [E, juan, caja]));

    // ---- IDEMPOTENCIA: la 127 otra vez, ya con cuotas cargadas ----
    grupo('0b · La 127 se puede aplicar dos veces');
    const conPlan = (await T.val(U, "select public.anotar_fiado($1,$2,90000,'Heladera',null,null,$3::jsonb) id",
      [E, ana, JSON.stringify([{ vence_el: masDias(hoy, 10), monto: 30000 }, { vence_el: masDias(hoy, 40), monto: 60000 }])])).id;
    await T.val(U, 'select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 10000, p_cuota => $3)',
      [E, ana, (await T.filas('select id from public.fiado_cuotas where fio_id=$1 and numero=1', [conPlan]))[0].id]);
    await T.val(U, 'select public.guardar_preferencias(p_aviso_cobros => false)');
    // (G1) Y con lo que deja la regla de «el derrame no queda nunca»: un pago
    // re-etiquetado (se le puso fecha a algo ya pagado en parte), un pago
    // PARTIDO al atarlo y un cobro partido entre lo sin fecha y una cuota.
    const beto = (await T.val(U, "select public.guardar_cliente($1,'Beto Partido','0981 555 001') id", [E])).id;
    const libBeto = (await T.val(U, "select public.anotar_fiado($1,$2,40000,'Libreta') id", [E, beto])).id;
    await T.val(U, 'select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 15000)', [E, beto]);
    await T.val(U, 'select public.programar_cuotas(p_fio => $1, p_plan => $2::jsonb)',
      [libBeto, JSON.stringify([{ vence_el: masDias(hoy, 5), monto: 20000 }, { vence_el: masDias(hoy, 35), monto: 20000 }])]);
    await T.val(U, "select public.anotar_fiado($1,$2,7000,'Pan') id", [E, beto]);
    await T.val(U, 'select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 12000)', [E, beto]);
    await pausa();
    const viejaBeto = (await T.val(U, "select public.anotar_fiado($1,$2,10000,'Libreta vieja') id", [E, beto])).id;
    await pausa();
    const nuevaBeto = (await T.val(U, "select public.anotar_fiado($1,$2,20000,'Libreta nueva') id", [E, beto])).id;
    await T.val(U, 'select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 16000)', [E, beto]);
    await T.val(U, 'select public.programar_cuotas(p_fio => $1, p_plan => $2::jsonb)',
      [nuevaBeto, JSON.stringify([{ vence_el: masDias(hoy, 9), monto: 20000 }])]);
    ok('antes de repetir: un pago re-etiquetado (15.000), un cobro partido (7.000 + 5.000) y un pago partido al atarlo (10.000 + 6.000)',
      (await T.filas(
        `select monto::int, case when fio_id = $2 then 'libreta' when fio_id = $3 then 'nueva' when fio_id is null then 'suelto' else 'otra' end de
         from public.fiado where cliente_id = $1 and tipo = 'cobro' order by created_at, (fio_id is null), id`, [beto, libBeto, nuevaBeto])).map((x) => [x.monto, x.de]),
      [[15000, 'libreta'], [7000, 'suelto'], [5000, 'libreta'], [6000, 'nueva'], [10000, 'suelto']]);
    ok('y la libreta vieja sigue sin fecha, pagada', [viejaBeto.length > 0, await T.n('select public.sin_fecha_fiado($1)::numeric n', [beto]),
      await T.n('select greatest(0, p.u - p.f0)::numeric n from public.partes_fiado($1) p', [beto])], [true, 0, 0]);
    const fotoDe = async () => ({
      resumen: await r('resumen'),
      cuotas: await T.filas('select fio_id, numero, vence_el::text, monto::text, avisado_el from public.fiado_cuotas order by fio_id, numero'),
      libro: await T.filas('select id, tipo, monto::text, fio_id, created_at::text from public.fiado order by created_at, id'),
      prefs: await r('misPreferencias'),
    });
    const antesDeRepetir = await fotoDe();
    let segunda = null;
    try { await H.aplicarMigracion(db, '127'); } catch (e) { segunda = e.message; }
    ok('la segunda aplicación no falla', segunda, null);
    ok('y no cambia ni un dato: resumen, cuotas, libro (con los pagos atados y partidos) y preferencias', await fotoDe(), antesDeRepetir);
    ok('cada función sigue existiendo una sola vez', await versiones(), FUNCIONES.map(() => 1));
    ok('(G1) las ayudas internas existen una sola vez y no se le dan a nadie',
      await T.filas(
        `select p.proname, count(*)::int n,
                bool_or(has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) abierta
         from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('fiado_cubierto', 'fiado_atar_a', 'fiado_atar_sueltos') group by p.proname order by p.proname`),
      [{ proname: 'fiado_atar_a', n: 1, abierta: false }, { proname: 'fiado_atar_sueltos', n: 1, abierta: false }, { proname: 'fiado_cubierto', n: 1, abierta: false }]);
    ok('(G1) los guardianes y «empezar de cero» siguen siendo uno solo cada uno',
      (await T.filas(
        `select p.proname, count(*)::int n from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('exigir_cuenta_activa', 'exigir_plan_personal', 'vaciar_empresa') group by p.proname order by p.proname`)).map((x) => x.n), [1, 1, 1]);
    ok('un solo candado, una sola policy, una sola restricción y los tres índices',
      [
        await T.n("select count(*)::int n from pg_trigger where tgrelid = 'public.fiado_cuotas'::regclass and not tgisinternal"),
        await T.n("select count(*)::int n from pg_policies where schemaname='public' and tablename='fiado_cuotas'"),
        await T.n("select count(*)::int n from pg_constraint where conname = 'fiado_fio_solo_en_cobros'"),
        await T.n("select count(*)::int n from pg_indexes where schemaname='public' and tablename='fiado_cuotas' and indexname like 'fiado_cuotas_%_idx'"),
        await T.n("select count(*)::int n from pg_indexes where schemaname='public' and indexname = 'fiado_fio_idx'"),
      ], [1, 1, 1, 3, 1]);
    aceptado('y después sigue cobrando como siempre', await llamar('cobrarPantalla', 1000));

    // (G1, bloque 20) Si se vuelve atrás y se cobra con el código de antes,
    // ese cobro entra suelto aunque pase de lo sin fecha. Al reaplicar la
    // 127 queda atado a la cuota que tapaba: tampoco así queda derrame.
    const derrameBeto = () => T.n('select greatest(0, p.u - p.f0)::numeric n from public.partes_fiado($1) p', [beto]);
    await db.query(
      `insert into public.fiado (empresa_id, cliente_id, tipo, monto, fecha, concepto, metodo)
       select empresa_id, cliente_id, 'cobro', 3000, fecha, 'Pago recibido', 'efectivo' from public.fiado where id = $1`, [libBeto]);
    const betoAntes = [await T.saldo(beto), await T.sinFecha(beto), await T.pend(beto)];
    ok('un pago suelto de más, como lo dejaría el código de antes: tapa 3.000 de una cuota por derrame', [await derrameBeto(), betoAntes], [3000, [31000, 0, [0, 11000, 20000]]]);
    let tercera = null;
    try { await H.aplicarMigracion(db, '127'); } catch (e) { tercera = e.message; }
    ok('al reaplicar la 127 ese pago queda atado a la deuda que tapaba: sin derrame, y nadie debe distinto',
      [tercera, await derrameBeto(), [await T.saldo(beto), await T.sinFecha(beto), await T.pend(beto)],
        (await T.filas("select monto::int from public.fiado where fio_id = $1 and tipo = 'cobro' order by monto", [nuevaBeto])).map((x) => x.monto)],
      [null, 0, betoAntes, [3000, 6000]]);
    const libroBeto = await T.filas('select id, monto::text, fio_id from public.fiado where cliente_id = $1 order by id', [beto]);
    await H.aplicarMigracion(db, '127');
    ok('y aplicada otra vez más, no toca nada', await T.filas('select id, monto::text, fio_id from public.fiado where cliente_id = $1 order by id', [beto]), libroBeto);
    await db.close();
  }

  // ═════════════════════════════════════════════════════════════════════
  // LO DEMÁS, sobre una base completa.
  // ═════════════════════════════════════════════════════════════════════
  const db = await H.crearBase();
  const T = herramientas(db);
  const { como, val, J, filas, n, hoyDe, saldo, sinFecha, cuotasDe, pend } = T;

  const A = await H.montarEmpresa(db, { email: 'lili@almacen.com', nombre: 'Almacén Lili' });
  const E = A.empresaId;
  const U = A.uid;
  const vendedor = await H.sumarMiembro(db, E, 'vendedor@almacen.com', 'vendedor');
  const B = await H.montarEmpresa(db, { email: 'otro@negocio.com', nombre: 'Otro negocio' });
  const hoy = await hoyDe(E);
  const dia = (d) => masDias(hoy, d);

  let cuentaClientes = 0;
  const cliente = async (nombre, C = A) => {
    cuentaClientes++;
    return (await val(C.uid, 'select public.guardar_cliente($1,$2,$3) id',
      [C.empresaId, nombre, `0981 ${String(100000 + cuentaClientes)}`])).id;
  };
  const plan = (pares) => JSON.stringify(pares.map(([d, monto]) => ({ vence_el: typeof d === 'number' ? dia(d) : d, monto })));
  const fiar = async (c, monto, concepto, pares, C = A) => (await val(C.uid,
    'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_concepto => $4, p_plan => $5::jsonb) id',
    [C.empresaId, c, monto, concepto, pares ? plan(pares) : null])).id;
  const vender = async (c, nombre, precio, C = A) => (await val(C.uid,
    "select public.registrar_venta(p_empresa => $1, p_items => $2::jsonb, p_metodo_pago => 'credito', p_cliente => $3) id",
    [C.empresaId, JSON.stringify([{ nombre, cantidad: 1, precio_unitario: precio }]), c])).id;
  const programar = (uid, args) => como(uid,
    'select public.programar_cuotas(p_fio => $1, p_plan => $2::jsonb, p_venta => $3) j', [args.fio ?? null, args.plan ?? null, args.venta ?? null]);
  const cobrar = (c, monto, cuota = null, uid = U, emp = E) => como(uid,
    'select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_cuota => $4) j', [emp, c, monto, cuota]);
  const cuotaN = async (fio, numero) => (await filas('select id from public.fiado_cuotas where fio_id=$1 and numero=$2', [fio, numero]))[0]?.id;
  const resumen = (uid = U, emp = E) => J(uid, 'select public.resumen_fiado($1) j', [emp]);
  const enResumen = async (c) => (await resumen()).clientes.find((x) => x.cliente_id === c);
  const detalle = (c, uid = U) => J(uid, 'select public.detalle_fiado($1) j', [c]);
  const cierra = async (nombre, c) => ok(`${nombre}: sin fecha + pendiente = saldo del libro`, await loQueNoCierra(db, c), []);

  // ===================================================================
  grupo('1 · La tabla, el candado y lo que NO se guarda');
  // ===================================================================
  {
    ok('fiado_cuotas tiene RLS',
      (await filas("select relrowsecurity r from pg_class where oid = 'public.fiado_cuotas'::regclass"))[0].r, true);
    ok('una sola policy, y es de lectura',
      await filas("select policyname, cmd from pg_policies where schemaname='public' and tablename='fiado_cuotas'"),
      [{ policyname: 'fiado_cuotas_select', cmd: 'SELECT' }]);
    ok('el candado de la cuenta vencida está, en INSERT y UPDATE',
      await filas(`select t.tgname, p.proname, (t.tgtype & 4) = 4 as en_insert, (t.tgtype & 16) = 16 as en_update, (t.tgtype & 8) = 8 as en_delete
                   from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                   where t.tgrelid = 'public.fiado_cuotas'::regclass and not t.tgisinternal`),
      [{ tgname: 'cuenta_activa_fiado_cuotas', proname: 'exigir_cuenta_activa', en_insert: true, en_update: true, en_delete: false }]);
    // Como clientes.test.js: esta prueba existe para que nadie agregue una
    // columna creyendo que optimiza algo.
    ok('no hay ninguna columna de «pagada», «estado» o «saldo»',
      (await filas(`select column_name c from information_schema.columns
                    where table_schema='public' and table_name='fiado_cuotas'
                      and (column_name like '%pagad%' or column_name like '%estado%' or column_name like '%saldo%' or column_name like '%pendiente%')`)).map((x) => x.c), []);
    ok('las columnas, exactas',
      (await filas(`select column_name c from information_schema.columns
                    where table_schema='public' and table_name='fiado_cuotas' order by ordinal_position`)).map((x) => x.c),
      ['id', 'empresa_id', 'cliente_id', 'fio_id', 'numero', 'vence_el', 'monto', 'avisado_el', 'creado_por', 'created_at']);

    const c = await cliente('Tabla Pérez');
    const fio = await fiar(c, 9000, 'Prueba', [[5, 9000]]);
    rechazado('un miembro no inserta cuotas a mano',
      await como(U, 'insert into public.fiado_cuotas (empresa_id, cliente_id, fio_id, numero, vence_el, monto) values ($1,$2,$3,2,current_date,1)', [E, c, fio]),
      'denied|permission');
    rechazado('ni las modifica', await como(U, 'update public.fiado_cuotas set monto = 1 where fio_id = $1', [fio]), 'denied|permission');
    rechazado('ni las borra', await como(U, 'delete from public.fiado_cuotas where fio_id = $1', [fio]), 'denied|permission');
    ok('el dueño las lee', (await como(U, 'select count(*)::int n from public.fiado_cuotas where fio_id=$1', [fio])).valor?.rows[0].n, 1);
    ok('otro negocio no las ve (RLS)', (await como(B.uid, 'select count(*)::int n from public.fiado_cuotas where fio_id=$1', [fio])).valor?.rows[0].n, 0);
    // Como superusuario, sin sesión: lo frena la restricción, no un permiso.
    let porLaRestriccion = { ok: true, valor: null, error: null };
    await db.exec('begin');
    try {
      await db.query("insert into public.fiado (empresa_id, cliente_id, tipo, monto, fecha, fio_id) values ($1,$2,'fio',1,current_date,$3)", [E, c, fio]);
    } catch (e) { porLaRestriccion = { ok: false, valor: null, error: e.message }; }
    await db.exec('rollback');
    rechazado('fio_id solo va en un cobro: una línea fiada no puede apuntar a otra', porLaRestriccion, 'fiado_fio_solo_en_cobros');
    for (const f of ['estado_cuotas(uuid)', 'sin_fecha_fiado(uuid)', 'partes_fiado(uuid)', 'fiado_monto_texto(numeric)', 'rubro_tiene_fiado(text,text)', 'cobros_de_hoy()']) {
      ok(`${f}: ni anon ni un usuario la pueden llamar`,
        (await filas(`select has_function_privilege('anon', 'public.${f}', 'execute') a, has_function_privilege('authenticated', 'public.${f}', 'execute') u`))[0],
        { a: false, u: false });
    }
    for (const f of ['programar_cuotas(uuid,jsonb,uuid)', 'quitar_cuotas(uuid)', 'mover_cuota(uuid,date)', 'marcar_cuota_avisada(uuid,boolean)',
      'detalle_fiado(uuid)', 'cuotas_por_cobrar(uuid,date)', 'anotar_fiado(uuid,uuid,numeric,text,date,uuid,jsonb)',
      'cobrar_fiado(uuid,uuid,numeric,text,date,uuid,uuid)']) {
      ok(`${f}: un usuario sí, anon no`,
        (await filas(`select has_function_privilege('anon', 'public.${f}', 'execute') a, has_function_privilege('authenticated', 'public.${f}', 'execute') u`))[0],
        { a: false, u: true });
    }
    ok('cobros_de_hoy es del servicio',
      (await filas("select has_function_privilege('service_role', 'public.cobros_de_hoy()', 'execute') s"))[0].s, true);
    const sql127 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '127_fiado_con_fechas.sql'), 'utf8');
    ok('la 127 no tiene ni una barra invertida', sql127.split(String.fromCharCode(92)).length - 1, 0);
  }

  // ===================================================================
  grupo('2 · Ponerle fechas a una deuda (programar_cuotas)');
  // ===================================================================
  {
    const c = await cliente('Rosa Benítez');
    const fio = await fiar(c, 500000, 'Heladera');
    ok('recién anotada no tiene cuotas: todo es «sin fecha»', [await saldo(c), await sinFecha(c), (await cuotasDe(c)).length], [500000, 500000, 0]);

    // El reparto lo hace la pantalla (src/lib/cuotas.ts): la última lleva el resto.
    const r = await programar(U, { fio, plan: plan([[30, 166666], [60, 166666], [90, 166668]]) });
    aceptado('500.000 en 3 cuotas: 166.666 · 166.666 · 166.668', r);
    const j = guardarEjemplo('programar_cuotas', r.valor?.rows[0].j);
    ok('devuelve la línea, el cliente y las cuotas numeradas',
      [j?.fio_id === fio, j?.cliente_id === c, j?.cuotas.map((q) => [q.numero, q.vence_el, q.monto])],
      [true, true, [[1, dia(30), 166666], [2, dia(60), 166666], [3, dia(90), 166668]]]);
    ok('suman exacto la deuda', (await cuotasDe(c)).reduce((s, q) => s + q.monto, 0), 500000);
    ok('y ahora nada es «sin fecha»: el saldo no cambió', [await saldo(c), await sinFecha(c), await pend(c)], [500000, 0, [166666, 166666, 166668]]);
    await cierra('con cuotas', c);

    const dec = await cliente('Decimal López');
    const fioDec = await fiar(dec, 99.99, 'En dólares');
    aceptado('con decimales: 99,99 en 4 (24,99 × 3 + 25,02)',
      await programar(U, { fio: fioDec, plan: plan([[7, 24.99], [14, 24.99], [21, 24.99], [28, 25.02]]) }));
    ok('y cierra al centavo', [await saldo(dec), await pend(dec)], [99.99, [24.99, 24.99, 24.99, 25.02]]);
    aceptado('un monto con más de dos decimales se redondea al guardar',
      await programar(U, { fio: fioDec, plan: plan([[7, 49.994], [14, 49.996]]) }));
    ok('49,994 + 49,996 → 49,99 + 50,00', await pend(dec), [49.99, 50]);

    rechazado('las cuotas no suman la deuda (de menos)',
      await programar(U, { fio, plan: plan([[30, 200000], [60, 200000]]) }), 'Las cuotas suman 400.000, y la deuda es 500.000');
    rechazado('ni de más', await programar(U, { fio, plan: plan([[30, 300000], [60, 300000]]) }), 'Las cuotas suman 600.000, y la deuda es 500.000');
    rechazado('fechas fuera de orden',
      await programar(U, { fio, plan: plan([[60, 250000], [30, 250000]]) }), 'tienen que ir en orden');
    aceptado('dos cuotas el mismo día sí (no decreciente)', await programar(U, { fio, plan: plan([[30, 250000], [30, 250000]]) }));
    rechazado('cero cuotas', await programar(U, { fio, plan: '[]' }), 'entre 1 y 60');
    rechazado('sin plan', await programar(U, { fio, plan: null }), 'entre 1 y 60');
    rechazado('un plan que no es una lista', await programar(U, { fio, plan: '{"vence_el":"2027-01-01","monto":500000}' }), 'entre 1 y 60');
    rechazado('61 cuotas',
      await programar(U, { fio, plan: JSON.stringify(Array.from({ length: 61 }, () => ({ vence_el: dia(30), monto: 1 }))) }), 'entre 1 y 60');
    const sesenta = Array.from({ length: 60 }, (_, i) => [30 + i, i === 59 ? 500000 - 59 * 8333 : 8333]);
    aceptado('60 cuotas sí', await programar(U, { fio, plan: plan(sesenta) }));
    ok('y son 60', (await cuotasDe(c)).length, 60);
    rechazado('una fecha en el año 2206', await programar(U, { fio, plan: plan([['2206-01-15', 500000]]) }), 'La fecha de la cuota no es válida');
    rechazado('una fecha de 1999', await programar(U, { fio, plan: plan([['1999-12-31', 500000]]) }), 'La fecha de la cuota no es válida');
    rechazado('un 31 de febrero', await programar(U, { fio, plan: plan([['2027-02-31', 500000]]) }), 'La fecha de la cuota no es válida');
    rechazado('un texto que no es una fecha', await programar(U, { fio, plan: plan([['mañana', 500000]]) }), 'La fecha de la cuota no es válida');
    rechazado('una cuota sin fecha', await programar(U, { fio, plan: JSON.stringify([{ monto: 500000 }]) }), 'necesita una fecha y un monto');
    rechazado('una cuota sin monto', await programar(U, { fio, plan: JSON.stringify([{ vence_el: dia(30) }]) }), 'necesita una fecha y un monto');
    rechazado('una cuota de cero', await programar(U, { fio, plan: plan([[30, 0], [60, 500000]]) }), 'necesita una fecha y un monto');
    rechazado('una cuota negativa', await programar(U, { fio, plan: plan([[30, -1], [60, 500001]]) }), 'necesita una fecha y un monto');
    rechazado('un monto que no es un número', await programar(U, { fio, plan: JSON.stringify([{ vence_el: dia(30), monto: 'mucho' }]) }), 'necesita una fecha y un monto');
    rechazado('un «NaN» no pasa por número', await programar(U, { fio, plan: JSON.stringify([{ vence_el: dia(30), monto: 'NaN' }]) }), 'necesita una fecha y un monto');
    ok('ningún rechazo dejó la deuda a medias: siguen las 60', (await cuotasDe(c)).length, 60);

    // Reemplazar: los números vuelven a 1..n y la marca de «ya le escribí» se va.
    await val(U, 'select public.marcar_cuota_avisada($1)', [await cuotaN(fio, 1)]);
    aceptado('rearmar a 2 cuotas reemplaza las 60', await programar(U, { fio, plan: plan([[15, 200000], [45, 300000]]) }));
    ok('quedan numeradas 1 y 2, sin marca de aviso',
      (await filas('select numero::int, vence_el::text, monto::int, avisado_el from public.fiado_cuotas where fio_id=$1 order by numero', [fio])),
      [{ numero: 1, vence_el: dia(15), monto: 200000, avisado_el: null }, { numero: 2, vence_el: dia(45), monto: 300000, avisado_el: null }]);
    aceptado('una fecha ya pasada se acepta: nace atrasada', await programar(U, { fio, plan: plan([[-5, 500000]]) }));
    ok('y sale con días negativos', (await cuotasDe(c)).map((q) => q.dias), [-5]);

    // Por la venta: Vender conoce el id de la venta, no el de la línea.
    const venta = await vender(c, 'TV 32', 450000);
    const porVenta = await programar(U, { venta, plan: plan([[30, 150000], [60, 150000], [90, 150000]]) });
    aceptado('programar por el id de la venta fiada', porVenta);
    ok('y quedó sobre la línea de esa venta',
      (await filas('select venta_id from public.fiado where id=$1', [porVenta.valor?.rows[0].j.fio_id]))[0]?.venta_id, venta);
    const contado = (await val(U, 'select public.registrar_venta($1,$2::jsonb) id',
      [E, JSON.stringify([{ nombre: 'Pan', cantidad: 1, precio_unitario: 5000 }])])).id;
    rechazado('una venta al contado no tiene fiado', await programar(U, { venta: contado, plan: plan([[30, 5000]]) }), 'Esa venta no tiene fiado');
    rechazado('una venta que no existe', await programar(U, { venta: '00000000-0000-0000-0000-000000000000', plan: plan([[30, 5000]]) }), 'Esa venta no tiene fiado');
    rechazado('sin línea ni venta', await programar(U, { plan: plan([[30, 5000]]) }), 'Esa línea no es un fiado');
    rechazado('una línea que no existe', await programar(U, { fio: '00000000-0000-0000-0000-000000000000', plan: plan([[30, 5000]]) }), 'Esa línea no es un fiado');
    const pago = (await cobrar(c, 1000)).valor?.rows[0].j.id;
    rechazado('un pago no es una deuda: no lleva cuotas', await programar(U, { fio: pago, plan: plan([[30, 1000]]) }), 'Esa línea no es un fiado');
    aceptado('el vendedor también pone fechas (el que fía es el que cobra)',
      await programar(vendedor, { fio, plan: plan([[10, 250000], [40, 250000]]) }));

    // Anotar con plan: una sola transacción.
    const antes = await n('select count(*)::int n from public.fiado where cliente_id=$1', [c]);
    rechazado('anotar con un plan que no cierra no anota nada',
      await como(U, 'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 300000, p_plan => $3::jsonb)', [E, c, plan([[30, 100000]])]),
      'Las cuotas suman 100.000, y la deuda es 300.000');
    ok('ni la línea ni las cuotas', await n('select count(*)::int n from public.fiado where cliente_id=$1', [c]), antes);
    const conPlan = await como(U, 'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 300000, p_concepto => $3, p_plan => $4::jsonb) id',
      [E, c, 'Cocina', plan([[30, 100000], [60, 100000], [90, 100000]])]);
    aceptado('anotar con plan anota y programa de una', conPlan);
    ok('devuelve el id de la línea, con sus 3 cuotas',
      await n('select count(*)::int n from public.fiado_cuotas where fio_id=$1', [conPlan.valor?.rows[0].id]), 3);

    ok('la firma vieja de anotar_fiado y la de cobrar_fiado ya no existen',
      (await filas(`select p.proname, pronargs::int n from pg_proc p
                    where p.pronamespace = 'public'::regnamespace and p.proname in ('anotar_fiado','cobrar_fiado') order by 1`)),
      [{ proname: 'anotar_fiado', n: 7 }, { proname: 'cobrar_fiado', n: 7 }]);
    await cierra('después de todo el grupo', c);
  }

  // ===================================================================
  grupo('3 · La propiedad central, después de CADA paso de una secuencia larga');
  // ===================================================================
  {
    const azar = conSemilla(127);
    const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
    const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
    const c = await cliente('Secuencia Larga');
    const otro = await cliente('Testigo Quieto');
    await fiar(otro, 70000, 'Testigo', [[5, 30000], [35, 40000]]);
    const testigoAntes = [await saldo(otro), await sinFecha(otro), await pend(otro)];

    // Un plan al azar que cierra: n cuotas, fechas no decrecientes (a veces
    // ya pasadas), la última con el resto.
    const planAzar = (monto) => {
      const cuantas = Math.min(entre(1, 5), Math.floor(monto / 1000));
      const base = Math.floor(monto / cuantas / 1000) * 1000;
      let d = entre(-20, 20);
      const pares = [];
      for (let i = 0; i < cuantas; i++) {
        pares.push([d, i === cuantas - 1 ? monto - base * (cuantas - 1) : base]);
        d += entre(0, 30);
      }
      return pares;
    };
    const lineas = async (conCuotas) => (await filas(
      `select f.id, f.monto::float8 monto from public.fiado f
       where f.cliente_id=$1 and f.tipo='fio' and f.venta_id is null
         and ${conCuotas ? '' : 'not '}exists (select 1 from public.fiado_cuotas q where q.fio_id = f.id)
       order by f.created_at, f.id`, [c]));
    const pagos = async () => (await filas("select id from public.fiado where cliente_id=$1 and tipo='cobro' order by created_at, id", [c]));

    const PASOS = ['fiar', 'fiar', 'fiar con plan', 'programar', 'programar', 'cobrar suelto', 'cobrar suelto', 'cobrar todo', 'cobrar todo',
      'cobrar cuota', 'cobrar cuota', 'cobrar cuota justa', 'borrar pago', 'quitar', 'rearmar', 'mover', 'mover', 'borrar deuda', 'borrar deuda', 'cobrar de más',
      // (G1) Los caminos por donde nacía el derrame.
      'vender fiado', 'fechar pagada', 'fechar pagada', 'borrar sin fecha pagada', 'borrar sin fecha pagada', 'anular venta pagada', 'anular venta pagada'];
    const hechos = {};
    let conProblemas = 0;
    // (G1) EL DERRAME NO QUEDA NUNCA: después de CADA paso lo suelto no pasa
    // de lo sin fecha. Antes este grupo exigía lo contrario («en varios pasos
    // había pagos sueltos tapando cuotas»): era la red, y era movediza.
    const derrameDe = async () => n('select greatest(0, p.u - p.f0)::numeric n from public.partes_fiado($1) p', [c]);
    let pasosConDerrame = 0;
    let cuotasReabiertasAlFiar = 0;
    let fiadosConCuotasPagadas = 0;
    let todosSeguidosDeFiar = 0;
    let moverFueraDeOrdenAceptado = 0;
    let moverFueraDeOrdenProbados = 0;
    // (G1) Cuántas veces cada camino tuvo que ATAR de verdad (había cuotas
    // pendientes y plata suelta que quedaba de más).
    const ataduras = { 'fechar pagada': 0, 'borrar sin fecha pagada': 0, 'anular venta pagada': 0 };
    let fechadasEnParte = 0;
    // Las líneas sin fecha con lo que cada una tiene cubierto (la regla de antigüedad).
    const cubiertas = async () => (await filas(
      `select k.fio_id, k.monto::float8 monto, k.atado::float8 atado, k.cubierto::float8 cubierto, f.venta_id
       from public.fiado_cubierto($1) k join public.fiado f on f.id = k.fio_id order by f.created_at, f.id`, [c]));
    // Lo cobrado que dice ser de una deuda con cuotas, en total y de una línea.
    const atadoACuotas = () => n(
      `select coalesce(sum(k.monto), 0)::numeric n from public.fiado k
       where k.cliente_id = $1 and k.tipo = 'cobro' and exists (select 1 from public.fiado_cuotas q where q.fio_id = k.fio_id)`, [c]);
    const atadoA = (fio) => n("select coalesce(sum(monto), 0)::numeric n from public.fiado where fio_id = $1 and tipo = 'cobro'", [fio]);
    const libroSuma = () => n("select coalesce(sum(case when tipo = 'fio' then monto else -monto end), 0)::numeric n from public.fiado where cliente_id = $1", [c]);
    // Un paso de preparación: tiene que andar, cerrar y no dejar derrame.
    const preparar = async (paso, que, promesa) => {
      const r = await promesa;
      const mal = r.ok ? await loQueNoCierra(db, c) : [`rechazado: ${r.error}`];
      if (r.ok && await derrameDe() > 0) mal.push('quedó derrame');
      if (mal.length > 0) { fallos++; conProblemas++; console.log(`  ✗ paso ${paso}, preparando (${que}): ${mal.join(', ')}`); }
      return r;
    };
    const fiarSinFecha = (monto, concepto) => como(U, 'select public.anotar_fiado($1,$2,$3,$4) id', [E, c, monto, concepto]);
    const venderFiado = (monto, nombre) => como(U,
      "select public.registrar_venta(p_empresa => $1, p_items => $2::jsonb, p_metodo_pago => 'credito', p_cliente => $3) id",
      [E, JSON.stringify([{ nombre, cantidad: 1, precio_unitario: monto }]), c]);
    const planFijo = (monto) => plan([[10, monto / 2], [40, monto / 2]]);
    let anterior = '';
    for (let paso = 1; paso <= 140; paso++) {
      // Los primeros pasos arman algo; después, al azar. Después de «cobrar
      // todo» SIEMPRE se fía algo sin fecha: es el caso de la revisión (el
      // cliente pagó la TV entera y al otro día se lleva el pan).
      let que = paso === 1 ? 'fiar' : paso === 2 ? 'fiar con plan' : anterior === 'cobrar todo' ? 'fiar' : elegir(PASOS);
      let res = null;
      const extra = [];
      let estado = await cuotasDe(c);
      const pendientes = estado.filter((q) => q.pendiente > 0);
      const s = await saldo(c);
      let pendAntes = Object.fromEntries(estado.map((q) => [q.cuota_id, q.pendiente]));
      const viene = que;

      if (que === 'cobrar todo') {
        // «Todo»: lo que debe, entero y sin elegir cuota.
        if (s <= 0) que = 'nada (no debe)';
        else res = await cobrar(c, s);
      } else if (que === 'fiar') {
        res = await como(U, "select public.anotar_fiado($1,$2,$3,'Libreta')", [E, c, entre(10, 200) * 1000]);
      } else if (que === 'vender fiado') {
        res = await venderFiado(entre(10, 200) * 1000, `Venta ${paso}`);
      } else if (que === 'fiar con plan') {
        const monto = entre(10, 300) * 1000;
        res = await como(U, 'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_concepto => $4, p_plan => $5::jsonb)',
          [E, c, monto, `Compra ${paso}`, plan(planAzar(monto))]);
      } else if (que === 'programar') {
        const l = await lineas(false);
        if (l.length === 0) que = 'nada (sin líneas sin fecha)';
        else { const x = elegir(l); res = await programar(U, { fio: x.id, plan: plan(planAzar(x.monto)) }); }
      } else if (que === 'fechar pagada') {
        // (G1, camino A) «Ponerle fecha» a una línea sin fecha que ya tiene
        // algo pagado con pagos sueltos: eso se le ATA, y es lo que la ficha
        // avisó antes de guardar. Si no hay ninguna pagada EN PARTE, se arma:
        // una libreta y un pago suelto que cubre todo lo sin fecha anterior y
        // la mitad de esa libreta (es la última de la fila).
        let cand = (await cubiertas()).filter((x) => x.cubierto - x.atado > 0);
        if (!cand.some((k) => k.cubierto < k.monto)) {
          const monto = entre(4, 20) * 10000;
          await preparar(paso, 'fiar', fiarSinFecha(monto, `Libreta vieja ${paso}`));
          await preparar(paso, 'cobrar suelto', cobrar(c, (await sinFecha(c)) - monto / 2));
          cand = (await cubiertas()).filter((x) => x.cubierto - x.atado > 0);
        }
        if (cand.length === 0) { fallos++; console.log(`  ✗ paso ${paso}: no se pudo armar una línea sin fecha pagada en parte`); que = 'nada (sin línea pagada)'; }
        else {
          const x = cand.find((k) => k.cubierto < k.monto) ?? elegir(cand);
          const cartel = (await detalle(c)).sin_fecha_lineas.find((l) => l.id === x.fio_id)?.cubierto;
          const deTodasAntes = await atadoACuotas();
          const libroAntes = await libroSuma();
          estado = await cuotasDe(c);
          pendAntes = Object.fromEntries(estado.map((q) => [q.cuota_id, q.pendiente]));
          res = await programar(U, { fio: x.fio_id, plan: plan(planAzar(x.monto)) });
          if (res.ok) {
            const suyo = await atadoA(x.fio_id);
            if (cartel !== x.cubierto) extra.push(`la ficha decía ${cartel} y la regla ${x.cubierto}`);
            if (suyo !== x.cubierto) extra.push(`quedaron atados ${suyo} y la ficha avisó ${x.cubierto}`);
            if (await atadoACuotas() - suyo !== deTodasAntes) extra.push('se movieron pagos de otra deuda');
            if (await libroSuma() !== libroAntes) extra.push('atar cambió el total del libro');
            // Las cuotas de las OTRAS deudas no se enteran.
            if ((await cuotasDe(c)).some((q) => q.fio_id !== x.fio_id && q.pendiente !== pendAntes[q.cuota_id])) extra.push('ponerle fecha movió cuotas de otra deuda');
            ataduras['fechar pagada']++;
            if (x.cubierto < x.monto) fechadasEnParte++;
          }
        }
      } else if (que === 'borrar sin fecha pagada' || que === 'anular venta pagada') {
        // (G1, camino B) Se va una línea sin fecha que estaba cubierta por
        // pagos sueltos, y el cliente tiene cuotas pendientes: la plata que
        // queda de más se ATA a las cuotas que tapa. Si no hay ninguna así,
        // se arma: (una deuda en cuotas,) la línea, y un pago suelto por todo
        // lo sin fecha.
        const deVenta = que === 'anular venta pagada';
        const sirven = async () => {
          const sal = await saldo(c);
          const hayPend = (await cuotasDe(c)).some((q) => q.pendiente > 0);
          return hayPend ? (await cubiertas()).filter((x) => (deVenta ? x.venta_id : !x.venta_id) && x.atado === 0 && x.cubierto > 0 && sal - x.monto >= 0) : [];
        };
        let cand = await sirven();
        if (cand.length === 0) {
          if (pendientes.reduce((a, q) => a + q.pendiente, 0) < 60000) {
            await preparar(paso, 'fiar con plan', como(U,
              'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 120000, p_concepto => $3, p_plan => $4::jsonb)', [E, c, `Para tapar ${paso}`, planFijo(120000)]));
          }
          const monto = entre(2, 5) * 10000;
          await preparar(paso, deVenta ? 'vender fiado' : 'fiar', deVenta ? venderFiado(monto, `Venta pagada ${paso}`) : fiarSinFecha(monto, `Para borrar ${paso}`));
          await preparar(paso, 'cobrar lo sin fecha', cobrar(c, await sinFecha(c)));
          cand = await sirven();
        }
        if (cand.length === 0) { fallos++; console.log(`  ✗ paso ${paso}: no se pudo armar una línea sin fecha pagada para ${que}`); que = 'nada (sin línea pagada)'; }
        else {
          const x = elegir(cand);
          const atadoAntes = await atadoACuotas();
          const libroAntes = await libroSuma();
          const sobraria = Math.max(0, (await n('select (p.u - p.f0)::numeric n from public.partes_fiado($1) p', [c])) + x.monto);
          res = deVenta
            ? await como(U, 'select public.anular_movimiento($1,$2)', [x.venta_id, 'Se devolvió'])
            : await como(U, 'select public.borrar_linea_fiado($1)', [x.fio_id]);
          if (res.ok) {
            if (await libroSuma() !== libroAntes - x.monto) extra.push('el libro no bajó justo por la línea que se fue');
            if (await atadoACuotas() - atadoAntes !== sobraria) extra.push(`sobraban ${sobraria} y se ataron ${await atadoACuotas() - atadoAntes}`);
            if (sobraria > 0) ataduras[que]++;
          }
        }
      } else if (que === 'cobrar suelto') {
        if (s <= 0) que = 'nada (no debe)';
        else {
          // La mitad de las veces, más que lo sin fecha: el sobrante tapa cuotas.
          const sf = await sinFecha(c);
          const piso = azar() < 0.5 && s > sf ? sf : 0;
          res = await cobrar(c, Math.min(s, piso + Math.max(1000, Math.floor(((s - piso) * azar()) / 1000) * 1000)));
        }
      } else if (que === 'cobrar cuota' || que === 'cobrar cuota justa') {
        if (pendientes.length === 0) que = 'nada (sin cuotas pendientes)';
        else {
          const q = elegir(pendientes);
          const falta = estado.filter((x) => x.fio_id === q.fio_id).reduce((a, x) => a + x.pendiente, 0);
          const monto = que === 'cobrar cuota justa' ? q.pendiente : Math.min(falta, Math.max(1000, Math.floor((falta * azar()) / 1000) * 1000));
          res = await cobrar(c, monto, q.cuota_id);
        }
      } else if (que === 'cobrar de más') {
        // Tiene que rechazarse siempre, y no mover nada.
        if (pendientes.length > 0) {
          const q = elegir(pendientes);
          const falta = estado.filter((x) => x.fio_id === q.fio_id).reduce((a, x) => a + x.pendiente, 0);
          res = await cobrar(c, falta + 1000, q.cuota_id);
        } else if (s > 0) res = await cobrar(c, s + 1000);
        else que = 'nada (no debe)';
        if (res && res.ok) { fallos++; console.log(`  ✗ paso ${paso}: cobrar de más NO fue rechazado`); }
        res = null;
      } else if (que === 'borrar pago') {
        const p = await pagos();
        if (p.length === 0) que = 'nada (sin pagos)';
        else res = await como(U, 'select public.borrar_linea_fiado($1)', [elegir(p).id]);
      } else if (que === 'quitar') {
        const l = await lineas(true);
        if (l.length === 0) que = 'nada (sin deudas con cuotas)';
        else res = await como(U, 'select public.quitar_cuotas($1)', [elegir(l).id]);
      } else if (que === 'rearmar') {
        const l = await lineas(true);
        if (l.length === 0) que = 'nada (sin deudas con cuotas)';
        else { const x = elegir(l); res = await programar(U, { fio: x.id, plan: plan(planAzar(x.monto)) }); }
      } else if (que === 'mover') {
        if (estado.length === 0) que = 'nada (sin cuotas)';
        else {
          // (R2.1) Una fecha entre las de sus vecinas: tiene que aceptarse
          // siempre. Y una pasada de la vecina: tiene que rechazarse siempre.
          const q = elegir(estado);
          const suyas = estado.filter((x) => x.fio_id === q.fio_id);
          const antes = suyas.filter((x) => x.numero < q.numero).map((x) => x.dias);
          const despues = suyas.filter((x) => x.numero > q.numero).map((x) => x.dias);
          const piso = antes.length ? Math.max(...antes) : -30;
          const techo = despues.length ? Math.min(...despues) : Math.max(piso, 120);
          if (despues.length) {
            moverFueraDeOrdenProbados++;
            if ((await como(U, 'select public.mover_cuota($1,$2)', [q.cuota_id, dia(techo + 1)])).ok) moverFueraDeOrdenAceptado++;
          }
          if (antes.length) {
            moverFueraDeOrdenProbados++;
            if ((await como(U, 'select public.mover_cuota($1,$2)', [q.cuota_id, dia(piso - 1)])).ok) moverFueraDeOrdenAceptado++;
          }
          res = await como(U, 'select public.mover_cuota($1,$2)', [q.cuota_id, dia(entre(piso, techo))]);
        }
      } else if (que === 'borrar deuda') {
        // Puede rechazarse (tiene pagos, o dejaría el saldo bajo cero): las
        // dos salidas valen, lo que no puede es romper la cuenta.
        const l = [...await lineas(true), ...await lineas(false)];
        if (l.length < 3) que = 'nada (pocas líneas)';
        else res = await como(U, 'select public.borrar_linea_fiado($1)', [elegir(l).id]);
      }

      const clave = `${que}${res ? (res.ok ? '' : ' (rechazado)') : ''}`;
      hechos[clave] = (hechos[clave] ?? 0) + 1;
      // Lo que tiene que andar siempre, si falla es un error de la prueba.
      if (res && !res.ok && que !== 'borrar deuda') {
        fallos++;
        console.log(`  ✗ paso ${paso} (${que}) falló sin deber: ${res.error}`);
      }
      const mal = [...await loQueNoCierra(db, c), ...extra];
      // Las tres pantallas dicen lo mismo que el libro.
      const s2 = await saldo(c);
      const d = await detalle(c);
      const partesDelDetalle = d.sin_fecha + d.deudas.reduce((a, x) => a + x.falta, 0);
      if (Math.abs(partesDelDetalle - Math.max(s2, 0)) > 0.001 || d.saldo !== s2 || s2 !== await libroSuma()) mal.push('detalle_fiado');
      const fila = await enResumen(c);
      if (s2 > 0 && (!fila || Math.abs(fila.sin_fecha + fila.con_fecha - s2) > 0.001 || fila.saldo !== s2 || fila.sin_fecha !== d.sin_fecha)) mal.push('resumen_fiado');
      if (s2 <= 0 && fila) mal.push('resumen_fiado lista a quien no debe');
      // (G1) NO QUEDA DERRAME, sea cual sea el paso: lo suelto no pasa de lo
      // sin fecha. Lo que pasaba queda atado a la deuda que tapa.
      const derrameDespues = await derrameDe();
      if (derrameDespues > 0) { pasosConDerrame++; mal.push(`quedó derrame (${derrameDespues})`); }
      // La ficha dice lo mismo que la regla: lo cubierto de las líneas sin
      // fecha suma lo que los pagos sueltos descuentan de lo sin fecha.
      const cub = await cubiertas();
      if (Math.abs(cub.reduce((a, x) => a + (x.monto - x.cubierto), 0) - d.sin_fecha) > 0.001) mal.push('lo cubierto de las líneas no suma lo sin fecha');
      if (JSON.stringify(d.sin_fecha_lineas.map((l) => [l.id, l.cubierto]).sort()) !== JSON.stringify(cub.map((x) => [x.fio_id, x.cubierto]).sort())) mal.push('detalle_fiado.cubierto');
      // (R3.1) Y por eso fiar algo sin fecha (o vender fiado) no reabre
      // ninguna cuota, nunca.
      if (res?.ok && (que === 'fiar' || que === 'vender fiado')) {
        const despuesDeFiar = await cuotasDe(c);
        if (estado.some((q) => q.pendiente < q.monto)) fiadosConCuotasPagadas++;
        if (despuesDeFiar.some((q) => q.pendiente !== pendAntes[q.cuota_id])) { cuotasReabiertasAlFiar++; mal.push('fiar sin fecha reabrió una cuota'); }
        if (anterior === 'cobrar todo') todosSeguidosDeFiar++;
      }
      anterior = res?.ok ? viene : '';
      if (mal.length > 0) conProblemas++;
      ok(`paso ${String(paso).padStart(3)} · ${clave.padEnd(34)} saldo ${String(s2).padStart(7)} = sin fecha ${String(d.sin_fecha).padStart(7)} + cuotas ${String(d.deudas.reduce((a, x) => a + x.falta, 0)).padStart(7)}`, mal, []);
    }
    console.log(`  · lo que hizo la secuencia: ${JSON.stringify(hechos)}`);
    ok('los 140 pasos cerraron', conProblemas, 0);
    ok('(G1) en ningún paso quedó derrame: lo suelto nunca pasó de lo sin fecha', pasosConDerrame, 0);
    console.log(`  · veces que hubo que atar: ${JSON.stringify(ataduras)}; líneas fechadas pagadas solo en parte: ${fechadasEnParte}`);
    ok('(G1) y se probó de verdad: ponerle fecha a algo ya pagado, borrar una línea sin fecha pagada y anular una venta fiada sin fecha pagada tuvieron que atar',
      [ataduras['fechar pagada'] >= 3, fechadasEnParte >= 2, ataduras['borrar sin fecha pagada'] >= 2, ataduras['anular venta pagada'] >= 2], [true, true, true, true]);
    console.log(`  · fiados sin fecha con cuotas ya pagadas: ${fiadosConCuotasPagadas}; «cobrar todo» seguido de fiar sin fecha: ${todosSeguidosDeFiar}`);
    ok('fiar sin fecha nunca reabrió una cuota pagada, y se probó de verdad (con cuotas pagadas, y después de «cobrar todo»)',
      [cuotasReabiertasAlFiar, fiadosConCuotasPagadas >= 3, todosSeguidosDeFiar >= 2], [0, true, true]);
    console.log(`  · intentos de correr una cuota por encima de su vecina: ${moverFueraDeOrdenProbados}`);
    ok('correr una cuota por encima de su vecina se rechazó siempre (R2.1)', [moverFueraDeOrdenAceptado, moverFueraDeOrdenProbados >= 3], [0, true]);
    ok('la secuencia pasó por todo: fiar, vender fiado, programar, cobrar con y sin cuota, cobrar todo, borrar, quitar, rearmar, mover y los tres caminos del derrame',
      ['fiar', 'vender fiado', 'fiar con plan', 'programar', 'cobrar suelto', 'cobrar todo', 'cobrar cuota', 'cobrar cuota justa', 'borrar pago', 'quitar', 'rearmar', 'mover',
        'fechar pagada', 'borrar sin fecha pagada', 'anular venta pagada']
        .filter((k) => !hechos[k]), []);
    ok('y al otro cliente no se le movió nada', [await saldo(otro), await sinFecha(otro), await pend(otro)], testigoAntes);
  }

  // ===================================================================
  grupo('4 · Cobro parcial');
  // ===================================================================
  let juan;
  let tvJuan;
  {
    juan = await cliente('Juan Pérez');
    tvJuan = await fiar(juan, 450000, 'TV 32', [[0, 150000], [30, 150000], [60, 150000]]);
    const c1 = await cuotaN(tvJuan, 1);
    const r = await cobrar(juan, 100000, c1);
    aceptado('cuota de 150.000, paga 100.000', r);
    const j = guardarEjemplo('cobrar_fiado (con p_cuota, pago parcial)', r.valor?.rows[0].j);
    ok('el saldo bajó 100.000', [j.saldo, await saldo(juan)], [350000, 350000]);
    ok('la cuota quedó a medias: faltan 50.000', (await cuotasDe(juan)).map((q) => [q.numero, q.pagado, q.pendiente]),
      [[1, 100000, 50000], [2, 0, 150000], [3, 0, 150000]]);
    ok('la próxima de esa deuda sigue siendo ESA cuota, por lo que falta',
      [j.deuda.fio_id === tvJuan, j.deuda.falta, j.deuda.proxima.cuota_id === c1, j.deuda.proxima.numero, j.deuda.proxima.de, j.deuda.proxima.pendiente, j.deuda.proxima.dias],
      [true, 350000, true, 1, 3, 50000, 0]);
    const fila = guardarEjemplo('resumen_fiado · un cliente con cuota de hoy a medias', await enResumen(juan));
    ok('en la lista: su próxima cuota es la 1, con 50.000 pendientes, y vence hoy',
      [fila.proxima.cuota_id === c1, fila.proxima.pendiente, fila.proxima.dias, fila.grupo, fila.saldo, fila.sin_fecha, fila.con_fecha],
      [true, 50000, 0, 'hoy', 350000, 0, 350000]);
    ok('el pago quedó apuntando a la deuda, con el concepto de siempre',
      (await filas("select fio_id, concepto, metodo from public.fiado where cliente_id=$1 and tipo='cobro'", [juan])),
      [{ fio_id: tvJuan, concepto: 'Pago recibido', metodo: 'efectivo' }]);
    await cierra('parcial', juan);
  }

  // ===================================================================
  grupo('5 · Cobro de más');
  // ===================================================================
  {
    const c1 = await cuotaN(tvJuan, 1);
    rechazado('contra una cuota, más de lo que falta de esa deuda',
      await cobrar(juan, 350001, c1), 'De esa deuda faltan 350.000, no podés cobrarle más que eso');
    rechazado('sin cuota, más que el saldo: como siempre', await cobrar(juan, 350001), 'Juan Pérez te debe 350.000, no podés cobrarle más que eso');
    ok('ninguno de los dos movió el saldo', await saldo(juan), 350000);

    // Con otra deuda al lado: el tope es el de ESA deuda, no el del cliente.
    const libreta = await fiar(juan, 200000, 'Libreta');
    rechazado('el tope es lo que falta de ESA deuda, aunque el cliente deba más',
      await cobrar(juan, 400000, c1), 'De esa deuda faltan 350.000');
    await val(U, 'select public.borrar_linea_fiado($1)', [libreta]);

    const r = await cobrar(juan, 100000, c1);
    aceptado('más que la cuota (faltaban 50.000) pero menos que la deuda: 100.000', r);
    ok('tapó la cuota 1 y 50.000 de la 2', await pend(juan), [0, 100000, 150000]);
    ok('y la próxima pasó a ser la 2', [r.valor.rows[0].j.deuda.proxima.numero, r.valor.rows[0].j.deuda.proxima.pendiente, r.valor.rows[0].j.deuda.proxima.vence_el], [2, 100000, dia(30)]);
    rechazado('cobrar cero', await cobrar(juan, 0, c1), 'mayor que cero');
    await cierra('de más', juan);
  }

  // ===================================================================
  grupo('6 · Doble toque en «Cobrar»');
  // ===================================================================
  {
    const pedro = await cliente('Pedro Ruiz');
    const fio = await fiar(pedro, 300000, 'Bicicleta', [[0, 100000], [30, 100000], [60, 100000]]);
    const c1 = await cuotaN(fio, 1);
    aceptado('primer toque: la cuota justa', await cobrar(pedro, 100000, c1));
    rechazado('segundo toque, la misma cuota: ya está cobrada', await cobrar(pedro, 100000, c1), 'Esa cuota ya está cobrada');
    ok('el saldo bajó UNA vez', await saldo(pedro), 200000);
    ok('y hay un solo pago en el libro', await n("select count(*)::int n from public.fiado where cliente_id=$1 and tipo='cobro'", [pedro]), 1);
    ok('las otras dos siguen enteras', await pend(pedro), [0, 100000, 100000]);

    // La última cuota: el mensaje sigue hablando de la cuota, no de «no te debe nada».
    await cobrar(pedro, 100000, await cuotaN(fio, 2));
    const c3 = await cuotaN(fio, 3);
    const ultimo = await cobrar(pedro, 100000, c3);
    aceptado('la última cuota', ultimo);
    ok('pagó todo: sin próxima', [ultimo.valor.rows[0].j.saldo, ultimo.valor.rows[0].j.deuda.falta, ultimo.valor.rows[0].j.deuda.proxima], [0, 0, null]);
    rechazado('doble toque en la última', await cobrar(pedro, 100000, c3), 'Esa cuota ya está cobrada');
    rechazado('y sin cuota, el mensaje de siempre', await cobrar(pedro, 1000), 'Pedro Ruiz no te debe nada');
    ok('quien pagó todo ya no sale en «lo que te deben»', await enResumen(pedro), undefined);
    await cierra('doble toque', pedro);
  }

  // ===================================================================
  grupo('7 · Un pago sin elegir: primero lo sin fecha, y lo que sobra queda ATADO a las cuotas que tapa');
  // ===================================================================
  // Antes de la revisión (R3.1) este grupo afirmaba que el pago entraba como
  // UNA línea suelta y que lo que sobraba de lo sin fecha tapaba cuotas «por
  // derrame», calculado al leer. La plata cerraba, pero el derrame se
  // recalculaba en cada lectura: el día que el cliente volvía a llevar algo
  // sin fecha, la compra nueva se lo comía, una cuota ya cobrada reaparecía
  // atrasada (con aviso y WhatsApp de reclamo) y el pan de hoy figuraba
  // pagado. Ahora el cobro se parte y cada parte queda atada a su deuda.
  {
    const lineasDe = async (x) => (await filas(
      "select monto::float8 monto, fio_id, metodo, cuenta_id, fecha::text from public.fiado where cliente_id=$1 and tipo='cobro' order by created_at, (fio_id is not null), monto desc, id", [x]));
    const derrame = (x) => n('select greatest(0, p.u - p.f0)::numeric n from public.partes_fiado($1) p', [x]);

    const c = await cliente('Carlos Díaz');
    await fiar(c, 100, 'Libreta');
    const fio = await fiar(c, 200, 'Con cuotas', [[10, 100], [40, 100]]);
    ok('debe 300: 100 sin fecha y 200 en cuotas', [await saldo(c), await sinFecha(c), await pend(c)], [300, 100, [100, 100]]);
    const r = await cobrar(c, 150);
    aceptado('pago de 150 sin elegir («Todo» o por voz)', r);
    const j = guardarEjemplo('cobrar_fiado (sin p_cuota, partido)', r.valor?.rows[0].j);
    ok('lo sin fecha quedó en 0 y la cuota 1 con 50 pagados', [await sinFecha(c), (await cuotasDe(c)).map((q) => [q.pagado, q.pendiente])], [0, [[50, 50], [0, 100]]]);
    ok('en el libro son DOS líneas: 100 sueltos (la libreta) y 50 atados a la deuda con cuotas',
      (await lineasDe(c)).map((l) => [l.monto, l.fio_id === fio ? 'atado' : l.fio_id]), [[100, null], [50, 'atado']]);
    ok('devuelve las claves de siempre: `id` es la primera línea (la suelta), el saldo, y `deuda` en null porque no se eligió ninguna',
      [Object.keys(j).sort(), (await filas('select fio_id, monto::float8 monto from public.fiado where id=$1', [j.id]))[0], j.saldo, j.sin_fecha, j.deuda, j.lineas],
      [['deuda', 'id', 'lineas', 'saldo', 'sin_fecha'], { fio_id: null, monto: 100 }, 150, 0, null, 2]);
    ok('no quedó plata suelta tapando cuotas (sin derrame)', await derrame(c), 0);
    await cierra('partido', c);

    // LO QUE REPRODUCÍA EL PROBLEMA: vuelve a llevar algo sin fecha.
    await fiar(c, 30, 'Pan');
    ok('se lleva 30 de pan sin fecha: el pan es lo sin fecha, y la cuota sigue con sus 50 pagados',
      [await saldo(c), await sinFecha(c), (await cuotasDe(c)).map((q) => [q.pagado, q.pendiente])], [180, 30, [[50, 50], [0, 100]]]);
    await cierra('después de fiar sin fecha', c);
    rechazado('contra la cuota 1, más de lo que le falta a la deuda (150)', await cobrar(c, 151, await cuotaN(fio, 1)), 'De esa deuda faltan 150');
    const todo = await cobrar(c, 180);
    aceptado('«Todo»: los 180 que quedan', todo);
    ok('30 sueltos (el pan) y 150 atados', [todo.valor.rows[0].j.lineas, (await lineasDe(c)).slice(2).map((l) => [l.monto, l.fio_id === fio])], [2, [[30, false], [150, true]]]);
    ok('todo en 0', [await saldo(c), await sinFecha(c), await pend(c)], [0, 0, [0, 0]]);
    await cierra('todo pagado', c);

    // El caso de la revisión, tal cual (sondas/s4.js): la TV en 3 cuotas ya
    // vencidas, paga todo junto, y hoy se lleva el pan.
    const S4 = await H.montarEmpresa(db, { email: 's4@almacen.com', nombre: 'Almacén Todo y Pan' });
    const juanS4 = await cliente('Juan Pérez', S4);
    const tv = await fiar(juanS4, 300000, 'TV', [[-67, 100000], [-37, 100000], [-7, 100000]], S4);
    const rTodo = await como(S4.uid, 'select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_metodo => $4, p_fecha => $5) j',
      [S4.empresaId, juanS4, 300000, 'efectivo', dia(-80)]);
    aceptado('TV de 300.000 en 3 cuotas vencidas: paga «Todo»', rTodo);
    ok('saldo 0, las tres cuotas pagadas, y el pago quedó atado a la TV (una línea)',
      [await saldo(juanS4), await pend(juanS4), (await lineasDe(juanS4)).map((l) => [l.monto, l.fio_id === tv, l.fecha])],
      [0, [0, 0, 0], [[300000, true, dia(-80)]]]);
    await fiar(juanS4, 50000, 'Pan', null, S4);
    ok('hoy se lleva 50.000 de pan sin fecha: debe el pan, y la TV sigue pagada',
      [await saldo(juanS4), await sinFecha(juanS4), await pend(juanS4)], [50000, 50000, [0, 0, 0]]);
    const resS4 = await resumen(S4.uid, S4.empresaId);
    const filaS4 = resS4.clientes[0];
    ok('la fila: en «sin fecha», sin cuotas atrasadas ni próxima; arriba, nada atrasado',
      [filaS4.grupo, filaS4.sin_fecha, filaS4.con_fecha, filaS4.atrasadas, filaS4.monto_atrasado, filaS4.proxima, resS4.atrasadas, resS4.monto_atrasado],
      ['sin_fecha', 50000, 0, 0, 0, null, 0, 0]);
    const detS4 = await detalle(juanS4, S4.uid);
    ok('la ficha: la TV no falta nada; sin fecha, el pan',
      [detS4.sin_fecha, detS4.deudas.map((x) => [x.concepto, x.pagado, x.falta, x.cuotas.map((q) => q.pendiente)])], [50000, [['TV', 300000, 0, [0, 0, 0]]]]);
    ok('el Excel no lista ninguna cuota por cobrar', await J(S4.uid, 'select public.cuotas_por_cobrar($1) j', [S4.empresaId]), []);
    ok('y el aviso de la mañana no sale: no hay nadie atrasado',
      (await H.comoServicio(db, async () => (await db.query('select public.cobros_de_hoy() j')).rows[0].j)).filter((x) => x.empresa_id === S4.empresaId), []);
    await cierra('Todo y después pan', juanS4);

    // La otra mitad (sondas/s1.js, A2): dos cuotas tapadas con un pago sin
    // elegir, y después un fiado sin fecha más grande que lo pagado.
    const a2 = await cliente('Juan A2', S4);
    await fiar(a2, 300, 'TV', [[-40, 100], [-10, 100], [20, 100]], S4);
    await cobrar(a2, 200, null, S4.uid, S4.empresaId);
    await fiar(a2, 150, 'Pan', null, S4);
    const filaA2 = (await resumen(S4.uid, S4.empresaId)).clientes.find((x) => x.cliente_id === a2);
    ok('cuotas 1 y 2 pagadas sin elegir, después 150 sin fecha: siguen pagadas, y no está atrasado',
      [await sinFecha(a2), await pend(a2), filaA2.grupo, filaA2.atrasadas, filaA2.monto_atrasado, filaA2.proxima.numero, filaA2.proxima.dias],
      [150, [0, 0, 100], 'proxima', 0, 0, 3, 20]);
    await cierra('dos cuotas y después pan', a2);

    // Dos deudas con las fechas intercaladas: el reparto va por fecha de
    // cuota, y en el libro queda una línea por deuda. A una cuenta: un solo
    // movimiento en la billetera, por el total.
    const d2 = await cliente('Dos Deudas');
    const caja7 = (await val(U, "select public.guardar_cuenta_dinero($1,'Caja del grupo 7','efectivo',0,'{efectivo}') id", [E])).id;
    await fiar(d2, 50, 'Libreta');
    const fa = await fiar(d2, 200, 'Deuda A', [[10, 100], [40, 100]]);
    const fb = await fiar(d2, 200, 'Deuda B', [[20, 100], [50, 100]]);
    const r2 = await como(U, "select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 300, p_metodo => 'transferencia', p_cuenta => $3) j", [E, d2, caja7]);
    aceptado('debe 450 (50 sin fecha, A y B en cuotas intercaladas): paga 300 sin elegir, a una cuenta', r2);
    ok('50 sueltos; 150 a la deuda A (su cuota del día 10 y media del 40); 100 a la B (la del día 20)',
      (await lineasDe(d2)).map((l) => [l.monto, l.fio_id === fa ? 'A' : l.fio_id === fb ? 'B' : l.fio_id, l.metodo, l.cuenta_id === caja7, l.fecha]),
      [[50, null, 'transferencia', true, hoy], [150, 'A', 'transferencia', true, hoy], [100, 'B', 'transferencia', true, hoy]]);
    ok('las cuotas, por fecha: A1 pagada, B1 pagada, A2 a medias, B2 entera',
      (await cuotasDe(d2)).map((q) => [q.fio_id === fa ? 'A' : 'B', q.numero, q.pendiente]), [['A', 1, 0], ['B', 1, 0], ['A', 2, 50], ['B', 2, 100]]);
    ok('en la billetera entró UNA vez, por los 300',
      await filas('select monto::float8 monto, tipo from public.ajustes_cuenta where cuenta_id=$1', [caja7]), [{ monto: 300, tipo: 'prestamo' }]);
    ok('`id` es la línea suelta y `lineas` son 3', [(await filas('select fio_id from public.fiado where id=$1', [r2.valor.rows[0].j.id]))[0].fio_id, r2.valor.rows[0].j.lineas, r2.valor.rows[0].j.saldo], [null, 3, 150]);
    await cierra('dos deudas', d2);
    await fiar(d2, 70, 'Pan');
    ok('y fiar sin fecha después no mueve ninguna cuota', [await sinFecha(d2), await pend(d2)], [70, [0, 0, 50, 100]]);
    // Deshacer es borrar cada parte: la cuota vuelve a quedar pendiente sola.
    const deB = (await filas('select id from public.fiado where cliente_id=$1 and fio_id=$2', [d2, fb]))[0].id;
    aceptado('borrar la parte de la deuda B', await como(U, 'select public.borrar_linea_fiado($1)', [deB]));
    ok('reabre la cuota de B y nada más', await pend(d2), [0, 100, 50, 100]);
    await cierra('deshecho en parte', d2);

    // Cuando no llega a las cuotas, o no las hay, es el cobro de siempre.
    const s1 = await cliente('Solo Sin Fecha');
    await fiar(s1, 100, 'Libreta');
    const fs1 = await fiar(s1, 200, 'Con cuotas', [[10, 100], [40, 100]]);
    const r3 = await cobrar(s1, 100);
    ok('un pago que no pasa de lo sin fecha: una sola línea suelta, como siempre',
      [r3.valor.rows[0].j.lineas, r3.valor.rows[0].j.deuda, (await lineasDe(s1)).map((l) => [l.monto, l.fio_id]), await pend(s1)], [1, null, [[100, null]], [100, 100]]);
    const r4 = await cobrar(s1, 120);
    ok('sin nada sin fecha: todo va atado, y `id` es esa línea',
      [r4.valor.rows[0].j.lineas, (await filas('select fio_id, monto::float8 monto from public.fiado where id=$1', [r4.valor.rows[0].j.id]))[0], await pend(s1)],
      [1, { fio_id: fs1, monto: 120 }, [0, 80]]);
    const sinCuotas = await cliente('Sin Cuotas');
    await fiar(sinCuotas, 500, 'Libreta');
    const r5 = await cobrar(sinCuotas, 200);
    ok('quien no tiene cuotas: una línea suelta (lo de la 084)', [r5.valor.rows[0].j.lineas, (await lineasDe(sinCuotas)).map((l) => [l.monto, l.fio_id])], [1, [[200, null]]]);
    await cierra('sin cuotas', sinCuotas);

    // Con centavos: el reparto no pierde ni inventa uno.
    const usd = await cliente('Con Centavos');
    await fiar(usd, 0.5, 'Chicle');
    const fu = await fiar(usd, 100, 'En tres', [[5, 33.33], [35, 33.33], [65, 33.34]]);
    await cobrar(usd, 50);
    ok('100,50 con centavos, paga 50: 0,50 sueltos y 49,50 atados; quedan 0 / 17,16 / 33,34',
      [(await lineasDe(usd)).map((l) => [l.monto, l.fio_id === fu]), await pend(usd), await saldo(usd)], [[[0.5, false], [49.5, true]], [0, 17.16, 33.34], 50.5]);
    await cierra('centavos', usd);

    // ─────────────────────────────────────────────────────────────────
    // (G1) EL DERRAME NO QUEDA NUNCA. Hasta la primera pasada de la revisión
    // quedaba «como red» por dos caminos: ponerle fecha a algo ya pagado en
    // parte (A) y borrar o anular una línea sin fecha ya pagada (B). Ahora
    // los pagos sueltos que sobran se ATAN en la misma transacción.
    // ─────────────────────────────────────────────────────────────────
    const cobrosDe = (x) => filas("select id, monto::float8 monto, fio_id from public.fiado where cliente_id=$1 and tipo='cobro' order by created_at, (fio_id is null), id", [x]);
    const libroDe = async (x, nombres) => (await J(U, 'select public.libro_fiado($1) j', [x]))
      .filter((l) => l.tipo === 'cobro').map((l) => [l.monto, l.fio_id ? nombres[l.fio_id] ?? 'otra' : null]);

    // CASO A (sondas-comprobar/restos.js): Libreta de 400.000, pago suelto de
    // 150.000, se le ponen 2 cuotas de 200.000.
    const ja = await cliente('Juan Caso A');
    const libA = await fiar(ja, 400000, 'Libreta');
    const pagoA = (await cobrar(ja, 150000)).valor.rows[0].j.id;
    ok('A · antes de guardar, la ficha dice que la libreta ya tiene 150.000 cubiertos',
      (await detalle(ja)).sin_fecha_lineas.map((l) => [l.concepto, l.monto, l.cubierto]), [['Libreta', 400000, 150000]]);
    aceptado('A · se le ponen 2 cuotas de 200.000 (la primera, de ayer)', await programar(U, { fio: libA, plan: plan([[-1, 200000], [29, 200000]]) }));
    ok('A · la cuota 1 queda con 50.000 pendientes y NO por derrame: el pago quedó atado a la libreta (la misma línea, re-etiquetada)',
      [await saldo(ja), await sinFecha(ja), await pend(ja), await derrame(ja), await cobrosDe(ja)],
      [250000, 0, [50000, 200000], 0, [{ id: pagoA, monto: 150000, fio_id: libA }]]);
    await cierra('caso A, con fecha', ja);
    await fiar(ja, 100000, 'Pan');
    ok('A · después lleva 100.000 sin fecha: la cuota 1 sigue en 50.000 (antes pasaba a 150.000 y lo nuevo figuraba pagado)',
      [await saldo(ja), await sinFecha(ja), await pend(ja), await derrame(ja)], [350000, 100000, [50000, 200000], 0]);
    const filaA = await enResumen(ja);
    ok('A · la fila: 100.000 sin fecha, 250.000 con fecha y una atrasada por 50.000',
      [filaA.grupo, filaA.sin_fecha, filaA.con_fecha, filaA.atrasadas, filaA.monto_atrasado], ['atrasada', 100000, 250000, 1, 50000]);
    await cierra('caso A, con el pan', ja);

    // A, con varias líneas sin fecha: los pagos sueltos cubren primero lo que
    // se anotó primero, y a cada línea se le ata LO SUYO.
    const va = await cliente('Varias Caso A');
    const viejaA = await fiar(va, 100, 'Libreta vieja');
    await pausa();
    const nuevaA = await fiar(va, 200, 'Libreta nueva');
    aceptado('A · paga 150 por transferencia, a la caja, con fecha de anteayer', await como(U,
      "select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 150, p_metodo => 'transferencia', p_fecha => $3, p_cuenta => $4) j", [E, va, dia(-2), caja7]));
    ok('A · la ficha: la vieja entera (100) y 50 de la nueva',
      (await detalle(va)).sin_fecha_lineas.map((l) => [l.concepto, l.cubierto]), [['Libreta vieja', 100], ['Libreta nueva', 50]]);
    const ajustesAntes = await n('select count(*)::int n from public.ajustes_cuenta where cuenta_id=$1', [caja7]);
    aceptado('A · se le pone fecha a la NUEVA', await programar(U, { fio: nuevaA, plan: plan([[10, 100], [40, 100]]) }));
    ok('A · se le atan sus 50 (no los 100 de la vieja): el pago se PARTE en dos líneas iguales en todo menos el monto',
      (await lineasDe(va)).map((l) => [l.monto, l.fio_id === nuevaA ? 'nueva' : l.fio_id, l.metodo, l.cuenta_id === caja7, l.fecha]),
      [[100, null, 'transferencia', true, dia(-2)], [50, 'nueva', 'transferencia', true, dia(-2)]]);
    ok('A · el libro suma lo mismo, la billetera no se tocó y no queda derrame',
      [await saldo(va), await sinFecha(va), await pend(va), await derrame(va),
        await n('select count(*)::int n from public.ajustes_cuenta where cuenta_id=$1', [caja7]) - ajustesAntes],
      [150, 0, [50, 100], 0, 0]);
    ok('A · las dos partes comparten la hora y el autor',
      await filas("select count(distinct created_at)::int horas, count(distinct creado_por)::int autores, count(*)::int lineas from public.fiado where cliente_id=$1 and tipo='cobro'", [va]),
      [{ horas: 1, autores: 1, lineas: 2 }]);
    {
      // (G4) Dos líneas con la misma hora: el libro las desempata siempre igual
      // (primero la atada, después la suelta).
      const veces = [];
      for (let i = 0; i < 4; i++) veces.push(JSON.stringify(await libroDe(va, { [nuevaA]: 'nueva' })));
      ok('G4 · el pago partido al atarlo sale siempre en el mismo orden: lo atado y después lo suelto',
        [new Set(veces).size, JSON.parse(veces[0])], [1, [[50, 'nueva'], [100, null]]]);
    }
    await cierra('caso A, varias líneas', va);
    aceptado('A · y después a la VIEJA', await programar(U, { fio: viejaA, plan: plan([[5, 100]]) }));
    ok('A · sus 100 quedan atados a ella (la línea que quedaba suelta, re-etiquetada): nace pagada',
      [(await lineasDe(va)).map((l) => [l.monto, l.fio_id === viejaA ? 'vieja' : l.fio_id === nuevaA ? 'nueva' : l.fio_id]), await pend(va), await derrame(va)],
      [[[100, 'vieja'], [50, 'nueva']], [0, 50, 100], 0]);
    await cierra('caso A, las dos con fecha', va);

    // A · Una venta fiada recién hecha a la que se le ponen cuotas en el acto
    // es la última de la fila: NO se lleva pagos viejos.
    const na = await cliente('Venta Caso A');
    await fiar(na, 100, 'Libreta');
    await cobrar(na, 60);
    await pausa();
    const ventaA = await vender(na, 'TV', 300);
    aceptado('A · vende fiado y le pone 2 cuotas en el acto', await programar(U, { venta: ventaA, plan: plan([[10, 150], [40, 150]]) }));
    ok('A · la venta nueva no se lleva el pago de la libreta: sigue suelto y las cuotas, enteras',
      [await sinFecha(na), await pend(na), await derrame(na), (await lineasDe(na)).map((l) => [l.monto, l.fio_id])], [40, [150, 150], 0, [[60, null]]]);
    const conFechaVieja = (await val(U,
      'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 80, p_concepto => $3, p_fecha => $4, p_plan => $5::jsonb) id',
      [E, na, 'Cargado con fecha de hace un mes', dia(-30), plan([[20, 80]])])).id;
    ok('A · ni un fiado nuevo cargado con fecha de hace un mes: la antigüedad es cuándo se anotó, no la fecha que lleva',
      [await sinFecha(na), await n('select count(*)::int n from public.fiado where fio_id=$1', [conFechaVieja]), await derrame(na)], [40, 0, 0]);
    await cierra('caso A, venta nueva', na);

    // A · `quitar_cuotas` sobre una deuda con pagos atados: el pago sigue
    // siendo de ESA línea, que vuelve a estar sin fecha.
    const qa = await cliente('Quita Caso A');
    const libQ = await fiar(qa, 400, 'Libreta');
    await pausa();
    await cobrar(qa, 150);
    await programar(U, { fio: libQ, plan: plan([[5, 200], [35, 200]]) });
    const otraQ = await fiar(qa, 100, 'Otra, más nueva');
    aceptado('A · se le sacan las fechas a la libreta, que tiene 150 atados', await como(U, 'select public.quitar_cuotas($1)', [libQ]));
    ok('A · el pago sigue apuntando a la libreta y cuenta como suyo: la ficha lo muestra cubriendo la libreta, no la otra',
      [await saldo(qa), await sinFecha(qa), await derrame(qa), (await detalle(qa)).sin_fecha_lineas.map((l) => [l.concepto, l.cubierto]),
        (await cobrosDe(qa)).map((l) => [l.monto, l.fio_id === libQ])],
      [350, 350, 0, [['Libreta', 150], ['Otra, más nueva', 0]], [[150, true]]]);
    await cierra('caso A, quitar con pagos atados', qa);
    aceptado('A · ponerle fecha a la OTRA', await programar(U, { fio: otraQ, plan: plan([[3, 100]]) }));
    ok('A · no se lleva el pago de la libreta', [await pend(qa), await sinFecha(qa), await derrame(qa)], [[100], 250, 0]);
    aceptado('A · y volver a ponerle fecha a la libreta', await programar(U, { fio: libQ, plan: plan([[5, 200], [35, 200]]) }));
    ok('A · su pago se reengancha solo: 50 pendientes en su cuota 1',
      [await pend(qa), await sinFecha(qa), await derrame(qa), (await cobrosDe(qa)).map((l) => [l.monto, l.fio_id === libQ])], [[100, 50, 200], 0, 0, [[150, true]]]);
    await cierra('caso A, de vuelta con fecha', qa);

    // CASO B (sondas-comprobar/f1.js, bloque 6): se borra una línea sin fecha
    // que estaba cubierta por un pago suelto, y el cliente tiene otra deuda
    // en cuotas. Antes el pago quedaba suelto tapando la cuota 1 por derrame.
    const red = await cliente('La Red');
    const libreta = await fiar(red, 100, 'Libreta');
    const fr = await fiar(red, 200, 'Con cuotas', [[10, 100], [40, 100]]);
    const pagoRed = (await cobrar(red, 100)).valor.rows[0].j.id;
    aceptado('B · pagó la libreta y después se borra la libreta (056: el saldo alcanza)', await como(U, 'select public.borrar_linea_fiado($1)', [libreta]));
    ok('B · el pago ya no queda suelto: queda ATADO a la deuda en cuotas (la misma línea), y tapa la cuota 1',
      [await saldo(red), await sinFecha(red), await derrame(red), await pend(red), await cobrosDe(red)],
      [100, 0, 0, [0, 100], [{ id: pagoRed, monto: 100, fio_id: fr }]]);
    await cierra('caso B, borrada', red);
    await fiar(red, 50, 'Pan');
    ok('B · y por eso llevar 50 sin fecha no reabre la cuota 1 (antes pasaba a 50 pendientes y el pan figuraba pagado)',
      [await saldo(red), await sinFecha(red), await pend(red), await derrame(red)], [150, 50, [0, 100], 0]);
    const r6 = await cobrar(red, 150);
    ok('B · «Todo»: 50 sueltos (el pan) y los 100 que faltan atados a la deuda; nada de más',
      [r6.valor.rows[0].j.saldo, (await lineasDe(red)).map((l) => [l.monto, l.fio_id === fr]), await pend(red)], [0, [[100, true], [50, false], [100, true]], [0, 0]]);
    await cierra('caso B, pagada', red);

    // B · Si el pago cubría además otra línea sin fecha, se PARTE: sigue
    // suelto lo que cubre lo que queda, y se ata lo que sobra.
    const pb = await cliente('Parte Caso B');
    const libP = await fiar(pb, 100, 'Libreta');
    const fp = await fiar(pb, 200, 'Con cuotas', [[10, 100], [40, 100]]);
    await fiar(pb, 30, 'Pan');
    await cobrar(pb, 130);
    aceptado('B · debía 100 + 30 sin fecha, pagó los 130, y se borra la libreta de 100', await como(U, 'select public.borrar_linea_fiado($1)', [libP]));
    ok('B · el pago se parte: 30 siguen sueltos (el pan) y 100 quedan atados a la cuota 1',
      [await saldo(pb), await sinFecha(pb), await derrame(pb), await pend(pb), (await lineasDe(pb)).map((l) => [l.monto, l.fio_id === fp])],
      [100, 0, 0, [0, 100], [[30, false], [100, true]]]);
    await cierra('caso B, partido', pb);

    // B · Lo mismo anulando una VENTA fiada sin fecha ya pagada.
    const an = await cliente('Anula Caso B');
    const ventaB = await vender(an, 'Silla', 100);
    const fbAn = await fiar(an, 200, 'Con cuotas', [[-3, 100], [27, 100]]);
    await cobrar(an, 100);
    ok('B · antes: la silla (sin fecha) está pagada con un pago suelto y la cuota 1 está atrasada', [await sinFecha(an), await pend(an), (await cobrosDe(an)).map((l) => l.fio_id)], [0, [100, 100], [null]]);
    aceptado('B · se anula la venta (el saldo alcanza por la otra deuda)', await como(U, 'select public.anular_movimiento($1,$2)', [ventaB, 'La devolvió']));
    ok('B · el pago queda atado a la deuda en cuotas, sin derrame',
      [await saldo(an), await sinFecha(an), await derrame(an), await pend(an), (await cobrosDe(an)).map((l) => [l.monto, l.fio_id === fbAn])],
      [100, 0, 0, [0, 100], [[100, true]]]);
    await fiar(an, 30, 'Pan');
    ok('B · y llevar 30 sin fecha no vuelve a dejar atrasada la cuota 1', [await saldo(an), await sinFecha(an), await pend(an), (await enResumen(an)).atrasadas], [130, 30, [0, 100], 0]);
    await cierra('caso B, anulada', an);

    // (G4) Las partes de un cobro partido, siempre en el mismo orden.
    const lo = await cliente('Libro Ordenado');
    await fiar(lo, 100, 'Libreta');
    const uno = await fiar(lo, 200, 'Deuda uno', [[10, 200]]);
    const dos = await fiar(lo, 300, 'Deuda dos', [[20, 300]]);
    ok('G4 · un cobro de 450 se parte en tres', (await cobrar(lo, 450)).valor.rows[0].j.lineas, 3);
    {
      const veces = [];
      for (let i = 0; i < 5; i++) veces.push(JSON.stringify(await libroDe(lo, { [uno]: 'uno', [dos]: 'dos' })));
      ok('G4 · el libro las muestra siempre igual: de la última parte a la primera (lo suelto se anotó primero)',
        [new Set(veces).size, JSON.parse(veces[0])], [1, [[150, 'dos'], [200, 'uno'], [100, null]]]);
      ok('G4 · cada parte quedó anotada un instante después de la anterior',
        await n("select count(distinct created_at)::int n from public.fiado where cliente_id=$1 and tipo='cobro'", [lo]), 3);
      ok('G4 · y la ficha trae el libro en ese mismo orden',
        (await detalle(lo)).libro.map((l) => l.id), (await J(U, 'select public.libro_fiado($1, 500) j', [lo])).map((l) => l.id));
    }

    // El ejemplo del diseño: 100/100/100 con 150 de la deuda y 80 sin elegir.
    const d = await cliente('Diseño Ejemplo');
    await fiar(d, 50, 'Libreta');
    const f2 = await fiar(d, 300, 'Tres cuotas', [[10, 100], [20, 100], [30, 100]]);
    await cobrar(d, 150, await cuotaN(f2, 1));
    ok('con 150 de esa deuda: 0 / 50 / 100', await pend(d), [0, 50, 100]);
    await cobrar(d, 80);
    ok('y 80 sin elegir (50 a la libreta, 30 atados a la deuda): 0 / 20 / 100, sin derrame',
      [await sinFecha(d), await pend(d), await derrame(d), (await lineasDe(d)).map((l) => [l.monto, l.fio_id === f2])],
      [0, [0, 20, 100], 0, [[150, true], [50, false], [30, true]]]);
    await cierra('el ejemplo del diseño', d);
  }

  // ===================================================================
  grupo('8 · Anular una venta fiada con cuotas');
  // ===================================================================
  {
    const c = await cliente('Ana Gómez');
    const venta = await vender(c, 'Heladera', 900000);
    const p = await programar(U, { venta, plan: plan([[30, 300000], [60, 300000], [90, 300000]]) });
    const fio = p.valor.rows[0].j.fio_id;
    ok('la venta fiada tiene 3 cuotas', await n('select count(*)::int n from public.fiado_cuotas where fio_id=$1', [fio]), 3);
    rechazado('desde Fiado no se borra lo que viene de una venta', await como(U, 'select public.borrar_linea_fiado($1)', [fio]), 'anulá la venta');
    aceptado('anular la venta', await como(U, 'select public.anular_movimiento($1,$2)', [venta, 'Me equivoqué']));
    ok('se fue la línea y sus 3 cuotas', [await n('select count(*)::int n from public.fiado where id=$1', [fio]),
      await n('select count(*)::int n from public.fiado_cuotas where cliente_id=$1', [c]), await saldo(c)], [0, 0, 0]);

    // Con una cuota cobrada: frena, AUNQUE el saldo alcance por otra deuda.
    await fiar(c, 1000000, 'Otra deuda, sin fecha');
    const v2 = await vender(c, 'Lavarropas', 600000);
    const p2 = await programar(U, { venta: v2, plan: plan([[30, 200000], [60, 200000], [90, 200000]]) });
    const fio2 = p2.valor.rows[0].j.fio_id;
    const pago = (await cobrar(c, 200000, p2.valor.rows[0].j.cuotas[0].id)).valor.rows[0].j.id;
    ok('debe 1.400.000: borrar la venta de 600.000 no dejaría el saldo bajo cero', await saldo(c), 1400000);
    rechazado('y aun así frena: ese pago era de ESA venta',
      await como(U, 'select public.anular_movimiento($1,$2)', [v2, 'A ver']), 'ya fue cobrada, entera o en parte');
    ok('no se anuló ni se borró nada', [(await filas('select estado from public.movimientos where id=$1', [v2]))[0].estado,
      await n('select count(*)::int n from public.fiado_cuotas where fio_id=$1', [fio2])], ['activo', 3]);
    aceptado('se borra el pago desde Fiado', await como(U, 'select public.borrar_linea_fiado($1)', [pago]));
    ok('la cuota volvió a quedar pendiente sola', (await pend(c)), [200000, 200000, 200000]);
    aceptado('y ahora anular pasa', await como(U, 'select public.anular_movimiento($1,$2)', [v2, 'Ahora sí']));
    ok('quedó solo la otra deuda', [await saldo(c), await sinFecha(c), await n('select count(*)::int n from public.fiado_cuotas where cliente_id=$1', [c])], [1000000, 1000000, 0]);

    // Una venta fiada SIN cuotas con un pago suelto: lo de la 056, igual.
    const s = await cliente('Solo Venta');
    const v3 = await vender(s, 'Silla', 100000);
    await cobrar(s, 40000);
    rechazado('una venta sin cuotas ya cobrada en parte: frena como siempre (056)',
      await como(U, 'select public.anular_movimiento($1,$2)', [v3, 'x']), 'ya fue cobrada');
    await cierra('anular', c);
  }

  // ===================================================================
  grupo('9 · Borrar una línea desde Fiado');
  // ===================================================================
  {
    const c = await cliente('Borra Líneas');
    await fiar(c, 500000, 'Libreta');
    const fio = await fiar(c, 300000, 'Colchón', [[30, 100000], [60, 100000], [90, 100000]]);
    aceptado('una deuda con cuotas y sin pagos se borra', await como(U, 'select public.borrar_linea_fiado($1)', [fio]));
    ok('y sus cuotas se fueron con ella', [await n('select count(*)::int n from public.fiado_cuotas where cliente_id=$1', [c]), await saldo(c)], [0, 500000]);

    const fio2 = await fiar(c, 300000, 'Colchón', [[30, 100000], [60, 100000], [90, 100000]]);
    const pago = (await cobrar(c, 100000, await cuotaN(fio2, 1))).valor.rows[0].j.id;
    ok('debe 700.000: borrar los 300.000 no dejaría el saldo bajo cero', await saldo(c), 700000);
    rechazado('con una cuota cobrada no se borra: primero el pago',
      await como(U, 'select public.borrar_linea_fiado($1)', [fio2]), 'Esa deuda tiene pagos anotados. Borrá primero esos pagos');
    ok('y no se borró', await n('select count(*)::int n from public.fiado_cuotas where fio_id=$1', [fio2]), 3);
    aceptado('borrar el pago de una cuota', await como(U, 'select public.borrar_linea_fiado($1)', [pago]));
    ok('reabre la cuota', [await saldo(c), await pend(c)], [800000, [100000, 100000, 100000]]);
    aceptado('y ahora la deuda sí se borra', await como(U, 'select public.borrar_linea_fiado($1)', [fio2]));
    ok('quedó la libreta sola', [await saldo(c), await sinFecha(c)], [500000, 500000]);

    const deVendedor = (await val(vendedor, 'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 9000, p_plan => $3::jsonb) id', [E, c, plan([[5, 9000]])])).id;
    const otroVendedor = await H.sumarMiembro(db, E, 'vendedor2@almacen.com', 'vendedor');
    rechazado('otro vendedor no borra lo que no anotó', await como(otroVendedor, 'select public.borrar_linea_fiado($1)', [deVendedor]), 'quien la anotó');
    aceptado('quien la anotó sí', await como(vendedor, 'select public.borrar_linea_fiado($1)', [deVendedor]));
    await cierra('borrar', c);

    // (R3.2 y R4.1) El freno no se saltea sacándole antes las fechas: lo que
    // frena son los pagos atados, tenga o no cuotas hoy. Es sondas/s1.js (E):
    // libreta de 100 sin fecha, TV de 200 en 2 cuotas con la 1 cobrada.
    const e = await cliente('Quita Y Borra');
    await fiar(e, 100, 'Libreta');
    const tv = await fiar(e, 200, 'TV', [[-5, 100], [25, 100]]);
    const pagoTv = (await cobrar(e, 100, await cuotaN(tv, 1))).valor.rows[0].j.id;
    aceptado('se le sacan las fechas a la TV', await como(U, 'select public.quitar_cuotas($1)', [tv]));
    ok('debe 200: borrar la TV (200) no dejaría el saldo bajo cero, así que el control de siempre no la frena', await saldo(e), 200);
    rechazado('y aun sin cuotas no se borra: ese pago era de la TV',
      await como(U, 'select public.borrar_linea_fiado($1)', [tv]), 'Esa deuda tiene pagos anotados. Borrá primero esos pagos');
    ok('no se borró nada: la libreta no quedó «pagada» con plata de la TV',
      [await saldo(e), (await filas('select fio_id from public.fiado where id=$1', [pagoTv]))[0].fio_id === tv, await n('select count(*)::int n from public.fiado where id=$1', [tv])],
      [200, true, 1]);
    aceptado('se borra el pago', await como(U, 'select public.borrar_linea_fiado($1)', [pagoTv]));
    aceptado('y ahora la TV sí', await como(U, 'select public.borrar_linea_fiado($1)', [tv]));
    ok('quedó la libreta, entera', [await saldo(e), await sinFecha(e)], [100, 100]);
    ok('ningún pago quedó apuntando a una línea que ya no existe',
      await n('select count(*)::int n from public.fiado c where c.cliente_id=$1 and c.fio_id is not null and not exists (select 1 from public.fiado f where f.id = c.fio_id)', [e]), 0);
    await cierra('quitar y borrar', e);
  }

  // ===================================================================
  grupo('10 · Quitar las cuotas y rearmar');
  // ===================================================================
  {
    const c = await cliente('Quita Rearma');
    await fiar(c, 400000, 'Libreta');
    const fio = await fiar(c, 450000, 'TV', [[-10, 150000], [20, 150000], [50, 150000]]);
    await cobrar(c, 150000, await cuotaN(fio, 1));
    const libroAntes = await filas('select id, tipo, monto::text, fio_id from public.fiado where cliente_id=$1 order by created_at, id', [c]);
    ok('antes: 400.000 sin fecha, cuota 1 pagada', [await saldo(c), await sinFecha(c), await pend(c)], [700000, 400000, [0, 150000, 150000]]);

    const q = await como(U, 'select public.quitar_cuotas($1) j', [fio]);
    aceptado('quitar las cuotas', q);
    guardarEjemplo('quitar_cuotas', q.valor?.rows[0].j);
    ok('devuelve el saldo, que no cambió', q.valor.rows[0].j, { saldo: 700000 });
    ok('el libro quedó idéntico (el pago sigue apuntando a la línea)',
      await filas('select id, tipo, monto::text, fio_id from public.fiado where cliente_id=$1 order by created_at, id', [c]), libroAntes);
    ok('todo pasó a «sin fecha»: 850.000 fiados menos los 150.000 que ahora cuentan como sueltos',
      [await sinFecha(c), (await cuotasDe(c)).length], [700000, 0]);
    await cierra('sin cuotas', c);
    aceptado('quitar dos veces no rompe nada', await como(U, 'select public.quitar_cuotas($1)', [fio]));
    rechazado('quitarle cuotas a algo que no existe', await como(U, 'select public.quitar_cuotas($1)', ['00000000-0000-0000-0000-000000000000']), 'Esa línea no es un fiado');

    aceptado('volver a programarla', await programar(U, { fio, plan: plan([[-10, 150000], [20, 150000], [50, 150000]]) }));
    ok('el pago se reenganchó solo: la cuota 1 otra vez pagada', [await sinFecha(c), await pend(c)], [400000, [0, 150000, 150000]]);

    aceptado('rearmar de 3 a 4 cuotas con 150.000 ya cobrados', await programar(U, { fio, plan: plan([[5, 112500], [35, 112500], [65, 112500], [95, 112500]]) }));
    ok('la cuota 1 nueva quedó pagada y la 2, en parte (37.500 de 112.500)',
      (await cuotasDe(c)).map((x) => [x.numero, x.pagado, x.pendiente]), [[1, 112500, 0], [2, 37500, 75000], [3, 0, 112500], [4, 0, 112500]]);
    ok('y el saldo, el de siempre', await saldo(c), 700000);
    await cierra('rearmado', c);
  }

  // ===================================================================
  grupo('11 · Correr la fecha de una cuota y marcar «ya le escribí»');
  // ===================================================================
  {
    const c = await cliente('Mueve Fechas');
    const fio = await fiar(c, 300000, 'Moto', [[10, 100000], [40, 100000], [70, 100000]]);
    const c1 = await cuotaN(fio, 1);
    const c2 = await cuotaN(fio, 2);
    const m1 = await como(U, 'select public.marcar_cuota_avisada($1) j', [c1]);
    aceptado('marcar que le escribió', m1);
    guardarEjemplo('marcar_cuota_avisada', m1.valor?.rows[0].j);
    ok('guarda el día de hoy del negocio (y dice cuántas marcó: esa sola, que todavía no vence)',
      [m1.valor.rows[0].j, (await cuotasDe(c)).map((x) => x.avisado_el)], [{ avisado_el: hoy, marcadas: 1 }, [hoy, null, null]]);
    ok('desmarcar', (await J(U, 'select public.marcar_cuota_avisada($1, false) j', [c1])), { avisado_el: null, marcadas: 1 });
    await val(U, 'select public.marcar_cuota_avisada($1)', [c1]);

    // (R2.1) ANTES esta prueba exigía que se ACEPTARA correr la cuota 1 para
    // después de la 3, y afirmaba «el pago tapa por número: se pagó la 1
    // aunque venza última». Eso era justamente el problema: la clienta paga
    // la cuota de hoy, Orden marca la que vence en un mes y a ella la deja
    // «atrasada», con aviso y reclamo. Ahora las fechas siguen el orden de
    // los números, que es el orden en que se tapan.
    rechazado('correr la cuota 1 para después de la 3: las fechas van en orden',
      await como(U, 'select public.mover_cuota($1,$2)', [c1, dia(100)]), 'Las fechas de las cuotas tienen que ir en orden');
    rechazado('ni un día después de la 2', await como(U, 'select public.mover_cuota($1,$2)', [c1, dia(41)]), 'tienen que ir en orden');
    rechazado('la 3 antes que la 2', await como(U, 'select public.mover_cuota($1,$2)', [await cuotaN(fio, 3), dia(39)]), 'tienen que ir en orden');
    rechazado('la 2 antes que la 1', await como(U, 'select public.mover_cuota($1,$2)', [c2, dia(9)]), 'tienen que ir en orden');
    rechazado('la 2 después de la 3', await como(U, 'select public.mover_cuota($1,$2)', [c2, dia(71)]), 'tienen que ir en orden');
    ok('ningún rechazo movió una fecha ni borró la marca de aviso',
      (await filas('select vence_el::text, avisado_el::text from public.fiado_cuotas where fio_id=$1 order by numero', [fio])),
      [{ vence_el: dia(10), avisado_el: hoy }, { vence_el: dia(40), avisado_el: null }, { vence_el: dia(70), avisado_el: null }]);

    const mv = await como(U, 'select public.mover_cuota($1,$2) j', [c1, dia(25)]);
    aceptado('correr la cuota 1 quince días, sin pasar a la 2', mv);
    guardarEjemplo('mover_cuota', mv.valor?.rows[0].j);
    ok('devuelve la cuota con su fecha nueva', mv.valor.rows[0].j, { cuota: { id: c1, numero: 1, vence_el: dia(25) } });
    ok('cambió la fecha y se borró la marca: hay que volver a avisar',
      (await filas('select vence_el::text, avisado_el from public.fiado_cuotas where id=$1', [c1]))[0], { vence_el: dia(25), avisado_el: null });
    aceptado('el mismo día que la vecina sí (como al programar)', await como(U, 'select public.mover_cuota($1,$2)', [c1, dia(40)]));
    aceptado('para atrás, sin tope: «me tenía que pagar la semana pasada»', await como(U, 'select public.mover_cuota($1,$2)', [c1, dia(-7)]));
    aceptado('la última, tan lejos como haga falta', await como(U, 'select public.mover_cuota($1,$2)', [await cuotaN(fio, 3), dia(400)]));
    aceptado('y la del medio, entre las dos', await como(U, 'select public.mover_cuota($1,$2)', [c2, dia(60)]));
    await cobrar(c, 100000, c2);
    ok('con las fechas en orden, el pago tapa la que vence primero: la que la pantalla muestra es la que queda pagada',
      (await cuotasDe(c)).map((x) => [x.numero, x.vence_el, x.pendiente]), [[1, dia(-7), 0], [2, dia(60), 100000], [3, dia(400), 100000]]);
    // El orden se cuida también contra una cuota YA PAGADA: si después se
    // borra ese pago, vuelve a estar pendiente y el desorden reaparecería.
    rechazado('la 2 no puede ir antes que la 1, aunque la 1 ya esté pagada',
      await como(U, 'select public.mover_cuota($1,$2)', [c2, dia(-8)]), 'tienen que ir en orden');

    // El escenario de la revisión (sondas/esceptico-mover.js): TV en 3 cuotas,
    // la 1 vencida hace 3 días, la 2 vence hoy. La clienta pide pagar la
    // atrasada «al final».
    const ana = await cliente('Ana Mueve');
    const tvAna = await fiar(ana, 450000, 'TV', [[-3, 150000], [0, 150000], [30, 150000]]);
    rechazado('llevar la cuota 1 atrasada a 45 días (después de la 2 y la 3) se rechaza',
      await como(U, 'select public.mover_cuota($1,$2)', [await cuotaN(tvAna, 1), dia(45)]), 'Las fechas de las cuotas tienen que ir en orden');
    aceptado('lo más que se puede: hasta el día de la 2', await como(U, 'select public.mover_cuota($1,$2)', [await cuotaN(tvAna, 1), dia(0)]));
    const filaAna = await enResumen(ana);
    await cobrar(ana, 150000, filaAna.proxima.cuota_id);
    ok('paga hoy la cuota que la lista le muestra: queda pagada ESA, y lo que sigue es otra cuota de hoy, no una atrasada',
      [filaAna.proxima.numero, (await cuotasDe(ana)).map((x) => [x.numero, x.dias, x.pendiente]), (await enResumen(ana)).atrasadas],
      [1, [[1, 0, 0], [2, 0, 150000], [3, 30, 150000]], 0]);
    const Q11 = require('../.compilado/cuotas.js');
    const fichaAna = Q11.leerDetalleFiado(await detalle(ana));
    ok('y «Rearmar» abre con un plan válido (Guardar no nace apagado)',
      Q11.planValido(fichaAna.deudas[0].cuotas.map((q) => ({ vence_el: q.vence_el, monto: q.monto })), fichaAna.deudas[0].monto, 0), true);
    await cierra('mover, el caso de la revisión', ana);

    // (R2.4) Se le escribe a una PERSONA: la marca cae sobre todas sus cuotas
    // vencidas o de hoy. Es sondas/sonda-ui.js (P3): Pedro, heladera en 3
    // cuotas, la 1 vencida hace 33 días y la 2 hace 3.
    const pedro = await cliente('Pedro Dos Atrasadas');
    const hel = await fiar(pedro, 450000, 'Heladera', [[-33, 150000], [-3, 150000], [27, 150000]]);
    const otra = await fiar(pedro, 80000, 'Otra compra', [[0, 30000], [30, 50000]]);
    const filaPedro = await enResumen(pedro);
    ok('la fila trae 2 atrasadas por 300.000, y su próxima es la cuota 1',
      [filaPedro.atrasadas, filaPedro.monto_atrasado, filaPedro.proxima.numero, filaPedro.proxima.pendiente], [2, 300000, 1, 150000]);
    const marca = await J(U, 'select public.marcar_cuota_avisada(p_cuota => $1) j', [filaPedro.proxima.cuota_id]);
    ok('«Recordarle por WhatsApp» marca las dos atrasadas y la de hoy de la otra compra; las que todavía no vencen, no',
      [marca, (await filas('select fio_id, numero::int, avisado_el::text from public.fiado_cuotas where cliente_id=$1 order by vence_el, numero', [pedro]))
        .map((x) => [x.fio_id === hel ? 'heladera' : 'otra', x.numero, x.avisado_el])],
      [{ avisado_el: hoy, marcadas: 3 }, [['heladera', 1, hoy], ['heladera', 2, hoy], ['otra', 1, hoy], ['heladera', 3, null], ['otra', 2, null]]]);
    ok('desmarcar las desmarca a todas', [await J(U, 'select public.marcar_cuota_avisada($1, false) j', [filaPedro.proxima.cuota_id]),
      await n('select count(*)::int n from public.fiado_cuotas where cliente_id=$1 and avisado_el is not null', [pedro])], [{ avisado_el: null, marcadas: 3 }, 0]);
    // Una cuota ya pagada no se marca: no hay nada que recordarle.
    await cobrar(pedro, 150000, await cuotaN(hel, 1));
    ok('con la 1 ya pagada, marcar por la 2 marca la 2 y la de hoy',
      [await J(U, 'select public.marcar_cuota_avisada($1) j', [await cuotaN(hel, 2)]),
        (await filas('select numero::int, avisado_el::text from public.fiado_cuotas where fio_id=$1 order by numero', [hel])).map((x) => x.avisado_el)],
      [{ avisado_el: hoy, marcadas: 2 }, [null, hoy, null]]);
    // Recordarle una que todavía no venció: esa, y de paso lo vencido.
    ok('marcar por una cuota futura la marca a ella y a lo vencido',
      await J(U, 'select public.marcar_cuota_avisada($1) j', [await cuotaN(otra, 2)]), { avisado_el: hoy, marcadas: 3 });
    const vecino = await cliente('Vecino Quieto');
    await fiar(vecino, 10000, 'x', [[-2, 10000]]);
    await val(U, 'select public.marcar_cuota_avisada($1)', [await cuotaN(hel, 2)]);
    ok('y nunca toca las cuotas de otro cliente', await n('select count(*)::int n from public.fiado_cuotas where cliente_id=$1 and avisado_el is not null', [vecino]), 0);

    rechazado('una fecha en 2206', await como(U, 'select public.mover_cuota($1,$2)', [c1, '2206-01-01']), 'La fecha de la cuota no es válida');
    rechazado('sin fecha', await como(U, 'select public.mover_cuota($1,$2)', [c1, null]), 'La fecha de la cuota no es válida');
    rechazado('una cuota que no existe', await como(U, 'select public.mover_cuota($1,$2)', ['00000000-0000-0000-0000-000000000000', dia(5)]), 'Esa cuota ya no existe');
    rechazado('marcar una cuota que no existe', await como(U, 'select public.marcar_cuota_avisada($1)', ['00000000-0000-0000-0000-000000000000']), 'Esa cuota ya no existe');
    await cierra('mover', c);
  }

  // ===================================================================
  grupo('12 · Eliminar a un cliente');
  // ===================================================================
  {
    const c = await cliente('Carla Deudora');
    const fio = await fiar(c, 80000, 'Zapatillas', [[15, 40000], [45, 40000]]);
    rechazado('con una cuota pendiente no se elimina (120)', await como(U, 'select public.eliminar_cliente($1)', [c]), 'todavía te debe 80.000');
    await cobrar(c, 40000, await cuotaN(fio, 1));
    await cobrar(c, 40000, await cuotaN(fio, 2));
    ok('con todo pagado se archiva', (await val(U, 'select public.eliminar_cliente($1) r', [c])).r, 'archivado');
    ok('sus cuotas quedan como historia, todas pagadas', (await cuotasDe(c)).map((x) => [x.pagado, x.pendiente]), [[40000, 0], [40000, 0]]);
    ok('y no aparece en «lo que te deben»', await enResumen(c), undefined);
    await fiar(c, 25000, 'Volvió', [[-2, 25000]]);
    const fila = await enResumen(c);
    ok('un archivado que vuelve a deber sale en el resumen, con su cuota atrasada',
      [fila?.saldo, fila?.grupo, fila?.atrasadas, fila?.proxima?.dias], [25000, 'atrasada', 1, -2]);
    ok('y sigue archivado', (await detalle(c)).activo, false);
    await cierra('eliminar', c);

    // Borrar al cliente de verdad (sin historia en otras tablas) se lleva todo.
    const x = await cliente('Efímero');
    await fiar(x, 5000, 'x', [[5, 5000]]);
    await db.query('delete from public.clientes where id=$1', [x]);
    ok('si el cliente se borra de la base, no quedan cuotas huérfanas', await n('select count(*)::int n from public.fiado_cuotas where cliente_id=$1', [x]), 0);
  }

  // ===================================================================
  grupo('13 · Empezar de cero (vaciar la cuenta)');
  // ===================================================================
  {
    const V = await H.montarEmpresa(db, { email: 'vacia@negocio.com', nombre: 'Para vaciar' });
    const c = await cliente('Vaciado', V);
    const venta = await vender(c, 'Heladera', 600000, V);
    const p = (await J(V.uid, 'select public.programar_cuotas(p_venta => $1, p_plan => $2::jsonb) j', [venta, plan([[30, 300000], [60, 300000]])]));
    await cobrar(c, 100000, p.cuotas[0].id, V.uid, V.empresaId);
    const mano = await fiar(c, 90000, 'A mano', [[10, 30000], [40, 60000]], V);
    await cobrar(c, 10000, await cuotaN(mano, 1), V.uid, V.empresaId);
    ok('antes: 4 cuotas y 2 pagos atados', [await n('select count(*)::int n from public.fiado_cuotas where empresa_id=$1', [V.empresaId]),
      await n('select count(*)::int n from public.fiado where empresa_id=$1 and fio_id is not null', [V.empresaId])], [4, 2]);
    aceptado('vaciar', await como(V.uid, 'select public.vaciar_empresa($1,$2)', [V.empresaId, 'Para vaciar']));
    ok('se fue la línea de la venta con sus cuotas; lo anotado a mano y las suyas quedan',
      [await n('select count(*)::int n from public.fiado where id=$1', [p.fio_id]),
        (await filas('select fio_id, numero::int from public.fiado_cuotas where empresa_id=$1 order by numero', [V.empresaId]))],
      [0, [{ fio_id: mano, numero: 1 }, { fio_id: mano, numero: 2 }]]);
    // (G1) El pago de la venta quedó sin su deuda (SET NULL). Antes quedaba
    // suelto entero, tapando por derrame las cuotas de lo anotado a mano;
    // ahora lo que tapa (80.000: lo que le faltaba a esa deuda) queda atado
    // a ella y solo lo que sobra de verdad (20.000) sigue suelto.
    ok('el pago de la venta se parte: 80.000 atados a lo anotado a mano (lo que le faltaba) y 20.000 sueltos; el suyo sigue atado',
      (await filas("select monto::int, fio_id from public.fiado where empresa_id=$1 and tipo='cobro' order by monto desc", [V.empresaId])),
      [{ monto: 80000, fio_id: mano }, { monto: 20000, fio_id: null }, { monto: 10000, fio_id: mano }]);
    // Lo de siempre al vaciar: quedan los pagos sin la venta, el saldo puede
    // quedar bajo cero y nadie figura debiendo.
    ok('el libro quedó en −20.000 (pagó 110.000 de 90.000 que quedan) y las partes se recortan a 0',
      [await saldo(c), await sinFecha(c), await pend(c)], [-20000, 0, [0, 0]]);
    await cierra('vaciado', c);

    // Vencida también puede irse: el SET NULL del pago pasa por la marca.
    const W = await H.montarEmpresa(db, { email: 'vacia-vencida@negocio.com', nombre: 'Vencida para vaciar' });
    const cw = await cliente('Vaciado W', W);
    const vw = await vender(cw, 'Mesa', 200000, W);
    const pw = (await J(W.uid, 'select public.programar_cuotas(p_venta => $1, p_plan => $2::jsonb) j', [vw, plan([[30, 200000]])]));
    await cobrar(cw, 50000, pw.cuotas[0].id, W.uid, W.empresaId);
    await vencer(db, W.empresaId);
    aceptado('un negocio vencido con cuotas cobradas también puede vaciar', await como(W.uid, 'select public.vaciar_empresa($1,$2)', [W.empresaId, 'Vencida para vaciar']));
    ok('y le quedó el pago suelto, sin cuotas',
      [await n('select count(*)::int n from public.fiado_cuotas where empresa_id=$1', [W.empresaId]),
        (await filas('select fio_id from public.fiado where empresa_id=$1', [W.empresaId]))], [0, [{ fio_id: null }]]);
  }

  // ===================================================================
  grupo('14 · Cuenta vencida');
  // ===================================================================
  let NV;
  {
    NV = await H.montarEmpresa(db, { email: 'vencida@negocio.com', nombre: 'Negocio vencido' });
    const c = await cliente('Deudor del vencido', NV);
    const fio = await fiar(c, 60000, 'Antes de vencer', [[0, 20000], [30, 40000]], NV);
    const suelta = await fiar(c, 5000, 'Sin fecha', null, NV);
    const c1 = await cuotaN(fio, 1);
    // (R4.1) Para después: una libreta y una deuda en 2 cuotas con la 1 cobrada.
    const pedroV = await cliente('Pedro del vencido', NV);
    await fiar(pedroV, 500000, 'Libreta', null, NV);
    const helV = await fiar(pedroV, 200000, 'Heladera', [[0, 100000], [0, 100000]], NV);
    const pagoV = (await cobrar(pedroV, 100000, await cuotaN(helV, 1), NV.uid, NV.empresaId)).valor.rows[0].j.id;
    // (G1) Para después: una libreta pagada con un pago suelto, un pan, y una deuda en cuotas.
    const rosaV = await cliente('Rosa del vencido', NV);
    const libRosaV = await fiar(rosaV, 100000, 'Libreta', null, NV);
    const cuoRosaV = await fiar(rosaV, 200000, 'Cocina', [[0, 100000], [30, 100000]], NV);
    await fiar(rosaV, 30000, 'Pan', null, NV);
    await cobrar(rosaV, 130000, null, NV.uid, NV.empresaId);
    await vencer(db, NV.empresaId);
    const X = NV.uid;
    rechazado('vencida: ponerle fechas a una deuda', await programar(X, { fio: suelta, plan: plan([[10, 5000]]) }), CANDADO);
    rechazado('vencida: rearmar una que ya tenía', await programar(X, { fio, plan: plan([[10, 60000]]) }), CANDADO);
    ok('y el rearmado rechazado no le borró las cuotas que tenía', await n('select count(*)::int n from public.fiado_cuotas where fio_id=$1', [fio]), 2);
    rechazado('vencida: correr una fecha', await como(X, 'select public.mover_cuota($1,$2)', [c1, dia(5)]), CANDADO);
    rechazado('vencida: marcar que le escribió', await como(X, 'select public.marcar_cuota_avisada($1)', [c1]), CANDADO);
    rechazado('vencida: anotar con plan',
      await como(X, 'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 1000, p_plan => $3::jsonb)', [NV.empresaId, c, plan([[5, 1000]])]), CANDADO);
    rechazado('vencida: cobrar una cuota', await cobrar(c, 20000, c1, X, NV.empresaId), CANDADO);
    rechazado('vencida: cobrar suelto', await cobrar(c, 1000, null, X, NV.empresaId), CANDADO);
    ok('nada cambió', [await saldo(c), await pend(c)], [65000, [20000, 40000]]);
    aceptado('vencida: leer el resumen', await como(X, 'select public.resumen_fiado($1)', [NV.empresaId]));
    aceptado('vencida: leer el detalle', await como(X, 'select public.detalle_fiado($1)', [c]));
    const lista = await H.comoServicio(db, async () => (await db.query('select public.cobros_de_hoy() j')).rows[0].j);
    ok('el aviso de la mañana no la lista, aunque tiene una cuota de hoy', lista.filter((x) => x.empresa_id === NV.empresaId).length, 0);
    aceptado('vencida: sacarle las fechas (es un DELETE) anda', await como(X, 'select public.quitar_cuotas($1)', [fio]));
    ok('y el libro no se movió', [await saldo(c), await sinFecha(c), (await cuotasDe(c)).length], [65000, 65000, 0]);

    // (R4.1) BORRAR anda siempre en una cuenta vencida (111), y si algo lo
    // frena tiene que decir por qué, no mandar a pagar el plan. Antes: con
    // las fechas quitadas el freno no veía el pago atado, el borrado
    // disparaba el SET NULL de `fio_id` (un UPDATE del libro) y contestaba
    // «Se te terminó la prueba». Es sondas/esceptico-candado-borrar.js.
    aceptado('vencida: sacarle las fechas a la heladera', await como(X, 'select public.quitar_cuotas($1)', [helV]));
    const borrarV = await como(X, 'select public.borrar_linea_fiado($1)', [helV]);
    rechazado('vencida: borrar esa deuda, que tiene un pago atado, pide borrar antes el pago', borrarV, 'Esa deuda tiene pagos anotados. Borrá primero esos pagos');
    ok('y no habla del plan', new RegExp(`${CANDADO}|${ES_DE_PAGO}`, 'i').test(borrarV.error ?? ''), false);
    ok('el libro quedó intacto', [await saldo(pedroV), (await filas('select fio_id from public.fiado where id=$1', [pagoV]))[0].fio_id === helV], [600000, true]);
    aceptado('vencida: borrar el pago anda', await como(X, 'select public.borrar_linea_fiado($1)', [pagoV]));
    aceptado('vencida: y después la deuda también', await como(X, 'select public.borrar_linea_fiado($1)', [helV]));
    ok('quedó la libreta', [await saldo(pedroV), await sinFecha(pedroV)], [500000, 500000]);
    await cierra('vencida, borrar', pedroV);

    // (G1) Borrar una línea sin fecha ya pagada, en una cuenta vencida: el
    // borrado anda siempre (111) y el atado de lo que sobra TAMBIÉN, aunque
    // sea un UPDATE y un INSERT sobre el libro (parte el pago en dos).
    const borrarRosa = await como(X, 'select public.borrar_linea_fiado($1)', [libRosaV]);
    aceptado('vencida: borrar una línea sin fecha ya pagada anda', borrarRosa);
    ok('vencida: y lo que sobraba quedó atado a la cuota (100.000), con el pan todavía cubierto (30.000 sueltos): sin derrame',
      [await saldo(rosaV), await sinFecha(rosaV), await pend(rosaV),
        await n('select greatest(0, p.u - p.f0)::numeric n from public.partes_fiado($1) p', [rosaV]),
        (await filas("select monto::int, fio_id from public.fiado where cliente_id=$1 and tipo='cobro' order by monto", [rosaV])).map((l) => [l.monto, l.fio_id === cuoRosaV])],
      [100000, 0, [0, 100000], 0, [[30000, false], [100000, true]]]);
    rechazado('vencida: y eso no abrió ninguna puerta: cobrar sigue cerrado', await cobrar(rosaV, 1000, null, X, NV.empresaId), CANDADO);
    await cierra('vencida, borrar una línea sin fecha pagada', rosaV);
  }

  // ===================================================================
  grupo('15 · La cuenta personal: con el Pro sí, en Gratis no');
  // ===================================================================
  let PP;
  let PG;
  {
    PP = await H.montarEmpresa(db, { email: 'pro@casa.com', nombre: 'Finanzas de Ana', tipoCuenta: 'personal' });
    await pagar(db, PP.empresaId);
    PG = await H.montarEmpresa(db, { email: 'gratis@casa.com', nombre: 'Finanzas de Beto', tipoCuenta: 'personal' });
    const primo = await cliente('Primo Lucas', PG);
    const prestamo = await fiar(primo, 200000, 'Le presté', [[0, 100000], [30, 100000]], PG);
    const suelto = await fiar(primo, 30000, 'Otro', null, PG);
    // (R4.1) Para después: a la tía se le prestó sin fecha y en 2 cuotas, y pagó la 1.
    const tia = await cliente('Tía Marta', PG);
    await fiar(tia, 500000, 'Sin fecha', null, PG);
    const enDos = await fiar(tia, 200000, 'En dos veces', [[0, 100000], [0, 100000]], PG);
    const pagoTia = (await cobrar(tia, 100000, await cuotaN(enDos, 1), PG.uid, PG.empresaId)).valor.rows[0].j.id;
    // (G1) Para después: al tío se le prestó sin fecha (ya lo devolvió) y en cuotas.
    const tio = await cliente('Tío Ramón', PG);
    const sinFechaTio = await fiar(tio, 100000, 'Sin fecha', null, PG);
    const cuotasTio = await fiar(tio, 200000, 'En dos veces', [[0, 100000], [30, 100000]], PG);
    await cobrar(tio, 100000, null, PG.uid, PG.empresaId);
    await vencer(db, PG.empresaId);
    ok('una en Pro y la otra en Gratis',
      [(await filas('select public.es_gratis_personal($1) g', [PP.empresaId]))[0].g, (await filas('select public.es_gratis_personal($1) g', [PG.empresaId]))[0].g], [false, true]);
    rechazado('Gratis: ponerle fechas es del Pro', await programar(PG.uid, { fio: suelto, plan: plan([[10, 30000]]) }), ES_DE_PAGO);
    rechazado('Gratis: correr una fecha', await como(PG.uid, 'select public.mover_cuota($1,$2)', [await cuotaN(prestamo, 1), dia(3)]), ES_DE_PAGO);
    rechazado('Gratis: cobrar una cuota', await cobrar(primo, 1000, await cuotaN(prestamo, 1), PG.uid, PG.empresaId), ES_DE_PAGO);
    ok('Gratis: y no dice que Orden se cerró',
      /seguir usando Orden/i.test((await programar(PG.uid, { fio: suelto, plan: plan([[10, 30000]]) })).error), false);
    aceptado('Gratis: sacar las fechas anda (DELETE)', await como(PG.uid, 'select public.quitar_cuotas($1)', [suelto]));
    // (R4.1) Lo mismo que en la vencida: borrar no es del Pro, y el freno dice por qué.
    aceptado('Gratis: sacarle las fechas a lo de la tía', await como(PG.uid, 'select public.quitar_cuotas($1)', [enDos]));
    const borrarG = await como(PG.uid, 'select public.borrar_linea_fiado($1)', [enDos]);
    rechazado('Gratis: borrar esa deuda, que tiene un pago atado, pide borrar antes el pago', borrarG, 'Esa deuda tiene pagos anotados. Borrá primero esos pagos');
    ok('Gratis: y no dice «Eso es del plan Pro»', new RegExp(`${CANDADO}|${ES_DE_PAGO}`, 'i').test(borrarG.error ?? ''), false);
    aceptado('Gratis: borrar el pago anda', await como(PG.uid, 'select public.borrar_linea_fiado($1)', [pagoTia]));
    aceptado('Gratis: y después la deuda también', await como(PG.uid, 'select public.borrar_linea_fiado($1)', [enDos]));
    ok('Gratis: quedó lo sin fecha', [await saldo(tia), await sinFecha(tia)], [500000, 500000]);
    // (G1) Y borrar una línea sin fecha ya pagada ata el pago que sobra, también en Gratis.
    aceptado('Gratis: borrar un préstamo sin fecha ya devuelto anda', await como(PG.uid, 'select public.borrar_linea_fiado($1)', [sinFechaTio]));
    ok('Gratis: el pago quedó atado al préstamo en cuotas, sin derrame',
      [await saldo(tio), await sinFecha(tio), await pend(tio),
        await n('select greatest(0, p.u - p.f0)::numeric n from public.partes_fiado($1) p', [tio]),
        (await filas("select monto::int, fio_id from public.fiado where cliente_id=$1 and tipo='cobro'", [tio])).map((l) => [l.monto, l.fio_id === cuotasTio])],
      [100000, 0, [0, 100000], 0, [[100000, true]]]);
    rechazado('Gratis: y cobrar sigue siendo del Pro', await cobrar(tio, 1000, null, PG.uid, PG.empresaId), ES_DE_PAGO);
    await cierra('Gratis, borrar una línea sin fecha pagada', tio);

    const amiga = await cliente('Amiga Sol', PP);
    const r = await como(PP.uid, 'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 300000, p_concepto => $3, p_plan => $4::jsonb) id',
      [PP.empresaId, amiga, 'Le presté', plan([[0, 100000], [30, 200000]])]);
    aceptado('Pro: prestar con fechas anda', r);
    aceptado('Pro: y cobrar una cuota', await cobrar(amiga, 50000, await cuotaN(r.valor.rows[0].id, 1), PP.uid, PP.empresaId));
    ok('Pro: queda con la cuota de hoy a medias', await pend(amiga), [50000, 200000]);
  }

  // ===================================================================
  grupo('16 · El resumen: los cuatro grupos y los totales');
  // ===================================================================
  {
    const R = await H.montarEmpresa(db, { email: 'resumen@negocio.com', nombre: 'Para el resumen' });
    const RE = R.empresaId;
    const atrasado = await cliente('Juan Atrasado', R);
    const deHoy = await cliente('Pedro De Hoy', R);
    const proximo = await cliente('Ana Próxima', R);
    const lejano = await cliente('Luis Lejano', R);
    const sinF = await cliente('Carlos Sin Fecha', R);
    const pagado = await cliente('Pago Todo', R);
    // Juan: una atrasada 3 días, otra en 27, y 400.000 de libreta sin fecha.
    const fj = await fiar(atrasado, 300000, 'TV', [[-33, 150000], [-3, 100000], [27, 50000]], R);
    await cobrar(atrasado, 150000, await cuotaN(fj, 1), R.uid, RE);
    await fiar(atrasado, 400000, 'Libreta', null, R);
    await fiar(deHoy, 500000, 'Moto', [[0, 125000], [30, 125000], [60, 125000], [90, 125000]], R);
    await fiar(proximo, 300000, 'Cocina', [[4, 300000]], R);
    await fiar(lejano, 80000, 'Mesa', [[45, 80000]], R);
    await fiar(sinF, 320000, 'Libreta', null, R);
    await fiar(pagado, 10000, 'x', [[1, 10000]], R);
    await cobrar(pagado, 10000, null, R.uid, RE);

    const res = guardarEjemplo('resumen_fiado', await resumen(R.uid, RE));
    ok('las claves de arriba: las de siempre y las nuevas', Object.keys(res).sort(),
      ['atrasadas', 'clientes', 'con_fecha_cuantos', 'cuantos', 'monto_atrasado', 'monto_hoy', 'monto_semana',
        'proximo_vencimiento', 'total', 'vencen_hoy', 'vencen_semana'].sort());
    ok('las claves de cada cliente', Object.keys(res.clientes[0]).sort(),
      ['atrasadas', 'cliente_id', 'con_fecha', 'desde', 'dias', 'grupo', 'monto_atrasado', 'nombre', 'proxima', 'saldo', 'sin_fecha', 'telefono'].sort());
    ok('las claves de la próxima cuota', Object.keys(res.clientes.find((x) => x.proxima).proxima).sort(),
      ['avisado_el', 'cuota_id', 'de', 'dias', 'fio_id', 'numero', 'pendiente', 'vence_el'].sort());
    ok('el orden sigue siendo por saldo, de mayor a menor (quien pagó todo no está)',
      res.clientes.map((x) => [x.nombre, x.saldo]),
      [['Juan Atrasado', 550000], ['Pedro De Hoy', 500000], ['Carlos Sin Fecha', 320000], ['Ana Próxima', 300000], ['Luis Lejano', 80000]]);
    ok('el total y cuántos, como siempre', [res.total, res.cuantos], [1750000, 5]);
    ok('cada uno en su grupo', Object.fromEntries(res.clientes.map((x) => [x.nombre, x.grupo])),
      { 'Juan Atrasado': 'atrasada', 'Pedro De Hoy': 'hoy', 'Carlos Sin Fecha': 'sin_fecha', 'Ana Próxima': 'proxima', 'Luis Lejano': 'proxima' });
    const j = res.clientes[0];
    ok('Juan: su próxima es la atrasada (cuota 2 de 3, hace 3 días), y además tiene 400.000 sin fecha',
      [j.proxima.numero, j.proxima.de, j.proxima.dias, j.proxima.pendiente, j.proxima.vence_el, j.atrasadas, j.monto_atrasado, j.sin_fecha, j.con_fecha],
      [2, 3, -3, 100000, masDias(await hoyDe(RE), -3), 1, 100000, 400000, 150000]);
    ok('Carlos, sin fechas: como siempre', (({ sin_fecha, con_fecha, atrasadas, monto_atrasado, proxima }) => [sin_fecha, con_fecha, atrasadas, monto_atrasado, proxima])(res.clientes[2]),
      [320000, 0, 0, 0, null]);
    ok('para cada uno, sin fecha + con fecha = lo que debe', res.clientes.filter((x) => x.sin_fecha + x.con_fecha !== x.saldo).map((x) => x.nombre), []);
    ok('los totales: 1 atrasada (100.000), 1 de hoy (125.000), 1 esta semana (300.000)',
      [res.atrasadas, res.monto_atrasado, res.vencen_hoy, res.monto_hoy, res.vencen_semana, res.monto_semana],
      [1, 100000, 1, 125000, 1, 300000]);
    ok('el próximo vencimiento es hoy, y 4 clientes tienen fecha', [res.proximo_vencimiento, res.con_fecha_cuantos], [await hoyDe(RE), 4]);
    rechazado('alguien de afuera no lee el resumen', await como(B.uid, 'select public.resumen_fiado($1)', [RE]), 'No pertenecés');

    // (R4.2) El resumen ya no calcula cuotas para quien no tiene ninguna (con
    // 1.500 deudores sin fechas tardaba el triple). Que el atajo no cambie
    // NI UN número: cada fila se vuelve a calcular acá por el camino largo
    // —`estado_cuotas` para todos, tengan o no cuotas— y tiene que dar lo
    // mismo, en este negocio y en el de las pruebas de arriba, que a esta
    // altura tiene de todo (pagos sueltos, atados, derrame, sin cuotas).
    const porElCaminoLargo = async (emp) => (await filas(
      `select s.cliente_id,
              s.saldo::float8 saldo,
              coalesce(q.con_fecha, 0)::float8 con_fecha,
              (case when exists (select 1 from public.fiado_cuotas k where k.cliente_id = s.cliente_id)
                    then public.sin_fecha_fiado(s.cliente_id) else s.saldo end)::float8 sin_fecha,
              coalesce(q.atrasadas, 0)::int atrasadas,
              coalesce(q.monto_atrasado, 0)::float8 monto_atrasado,
              q.proxima
       from (select f.cliente_id, sum(case when f.tipo = 'fio' then f.monto else -f.monto end) saldo
             from public.fiado f where f.empresa_id = $1 group by f.cliente_id) s
       left join lateral (
         select sum(e.pendiente) con_fecha,
                count(*) filter (where e.dias < 0) atrasadas,
                sum(e.pendiente) filter (where e.dias < 0) monto_atrasado,
                (array_agg(e.cuota_id order by e.pos))[1] proxima
         from public.estado_cuotas(s.cliente_id) with ordinality as e(
           cuota_id, fio_id, numero, de, vence_el, monto, pagado, pendiente, dias,
           avisado_el, concepto, fecha_fio, monto_fio, venta_id, pos)
         where e.pendiente > 0) q on true
       where s.saldo > 0
       order by s.cliente_id`, [emp]));
    const delResumen = async (uid, emp) => (await resumen(uid, emp)).clientes
      .map((x) => ({ cliente_id: x.cliente_id, saldo: x.saldo, con_fecha: x.con_fecha, sin_fecha: x.sin_fecha,
        atrasadas: x.atrasadas, monto_atrasado: x.monto_atrasado, proxima: x.proxima?.cuota_id ?? null }))
      .sort((a, b) => (a.cliente_id < b.cliente_id ? -1 : 1));
    ok('el resumen, fila por fila, es igual al calculado por el camino largo (este negocio)', await delResumen(R.uid, RE), await porElCaminoLargo(RE));
    const largoE = await porElCaminoLargo(E);
    ok(`y en el negocio de las pruebas de arriba (${largoE.length} deudores, ${largoE.filter((x) => x.proxima).length} con cuotas pendientes)`, await delResumen(U, E), largoE);
    const totales = await resumen(U, E);
    ok('los totales de arriba salen de las mismas filas',
      [totales.atrasadas, totales.monto_atrasado, totales.con_fecha_cuantos, totales.total],
      [await n(`select count(*)::int n from public.clientes c cross join lateral public.estado_cuotas(c.id) e
                where c.empresa_id=$1 and e.pendiente > 0 and e.dias < 0 and public.saldo_fiado(c.id) > 0`, [E]),
        largoE.reduce((a, x) => a + x.monto_atrasado, 0), largoE.filter((x) => x.proxima).length, largoE.reduce((a, x) => a + x.saldo, 0)]);
    ok('y el atajo está: la función pregunta si el cliente tiene cuotas antes de calcularlas',
      (await filas("select prosrc from pg_proc where proname = 'resumen_fiado' and pronamespace = 'public'::regnamespace"))[0].prosrc
        .includes('where exists (select 1 from public.fiado_cuotas k where k.cliente_id = n.cliente_id)'), true);
    // Con nadie que tenga cuotas: lo de siempre, y las claves nuevas en cero.
    const SF = await H.montarEmpresa(db, { email: 'sinfechas@negocio.com', nombre: 'Sin fechas' });
    for (const [nombre, monto] of [['Uno', 30000], ['Dos', 20000], ['Tres', 10000]]) await fiar(await cliente(nombre, SF), monto, 'Libreta', null, SF);
    const rsf = await resumen(SF.uid, SF.empresaId);
    ok('un negocio sin ninguna fecha: todos en «sin fecha», por todo lo que deben, y arriba nada con fecha',
      [rsf.total, rsf.cuantos, rsf.clientes.map((x) => [x.nombre, x.saldo, x.sin_fecha, x.con_fecha, x.atrasadas, x.monto_atrasado, x.proxima, x.grupo]),
        rsf.atrasadas, rsf.monto_atrasado, rsf.vencen_hoy, rsf.monto_hoy, rsf.vencen_semana, rsf.monto_semana, rsf.proximo_vencimiento, rsf.con_fecha_cuantos],
      [60000, 3, [['Uno', 30000, 30000, 0, 0, 0, null, 'sin_fecha'], ['Dos', 20000, 20000, 0, 0, 0, null, 'sin_fecha'], ['Tres', 10000, 10000, 0, 0, 0, null, 'sin_fecha']],
        0, 0, 0, 0, 0, 0, null, 0]);

    const d = guardarEjemplo('detalle_fiado', await detalle(atrasado, R.uid));
    ok('el detalle de Juan: las claves', Object.keys(d).sort(),
      ['activo', 'cliente_id', 'deudas', 'desde', 'dias', 'libro', 'nombre', 'saldo', 'sin_fecha', 'sin_fecha_lineas', 'telefono'].sort());
    ok('una deuda con sus tres cuotas, lo pagado y lo que falta',
      d.deudas.map((x) => [x.concepto, x.monto, x.pagado, x.falta, x.venta_id, x.cuotas.map((q) => [q.numero, q.de, q.dias, q.monto, q.pagado, q.pendiente])]),
      [['TV', 300000, 150000, 150000, null, [[1, 3, -33, 150000, 150000, 0], [2, 3, -3, 100000, 0, 100000], [3, 3, 27, 50000, 0, 50000]]]]);
    ok('las claves de una deuda y de una cuota',
      [Object.keys(d.deudas[0]).sort(), Object.keys(d.deudas[0].cuotas[0]).sort()],
      [['concepto', 'cuotas', 'falta', 'fecha', 'fio_id', 'monto', 'pagado', 'venta_id'],
        ['avisado_el', 'cuota_id', 'de', 'dias', 'monto', 'numero', 'pagado', 'pendiente', 'vence_el']]);
    ok('lo sin fecha, con su línea y lo que esa línea ya tiene cubierto (nada)',
      [d.sin_fecha, d.sin_fecha_lineas.map((l) => [l.concepto, l.monto, l.cubierto, Object.keys(l).sort().join()])],
      [400000, [['Libreta', 400000, 0, 'concepto,cubierto,fecha,id,monto,venta_id']]]);
    ok('las partes suman el saldo', d.sin_fecha + d.deudas.reduce((a, x) => a + x.falta, 0), d.saldo);
    ok('el libro trae fio_id y metodo en cada línea', d.libro.map((l) => [l.tipo, l.monto, l.fio_id === fj, l.metodo]).sort(),
      [['cobro', 150000, true, 'efectivo'], ['fio', 300000, false, null], ['fio', 400000, false, null]].sort());
    ok('las claves de una línea del libro', Object.keys(d.libro[0]).sort(),
      ['concepto', 'created_at', 'fecha', 'fio_id', 'id', 'metodo', 'monto', 'tipo', 'venta_id']);
    guardarEjemplo('libro_fiado', await J(R.uid, 'select public.libro_fiado(p_cliente => $1, p_limite => 100) j', [atrasado]));
    rechazado('alguien de afuera no lee el detalle', await como(B.uid, 'select public.detalle_fiado($1)', [atrasado]), 'No pertenecés');
    rechazado('el detalle de un cliente que no existe', await como(R.uid, 'select public.detalle_fiado($1)', ['00000000-0000-0000-0000-000000000000']), 'no existe');

    const pc = guardarEjemplo('cuotas_por_cobrar', await J(R.uid, 'select public.cuotas_por_cobrar($1) j', [RE]));
    ok('cuotas_por_cobrar: todas las pendientes, por fecha',
      pc.map((x) => [x.nombre, x.numero, x.de, x.dias, x.pendiente]),
      [['Juan Atrasado', 2, 3, -3, 100000], ['Pedro De Hoy', 1, 4, 0, 125000], ['Ana Próxima', 1, 1, 4, 300000], ['Juan Atrasado', 3, 3, 27, 50000],
        ['Pedro De Hoy', 2, 4, 30, 125000], ['Luis Lejano', 1, 1, 45, 80000], ['Pedro De Hoy', 3, 4, 60, 125000], ['Pedro De Hoy', 4, 4, 90, 125000]]);
    ok('las claves de cada fila', Object.keys(pc[0]).sort(),
      ['avisado_el', 'cliente_id', 'concepto', 'cuota_id', 'de', 'dias', 'nombre', 'numero', 'pendiente', 'telefono', 'vence_el']);
    ok('con «hasta hoy»: solo la atrasada y la de hoy',
      (await J(R.uid, 'select public.cuotas_por_cobrar($1,$2) j', [RE, await hoyDe(RE)])).map((x) => x.nombre), ['Juan Atrasado', 'Pedro De Hoy']);
    rechazado('alguien de afuera no las lee', await como(B.uid, 'select public.cuotas_por_cobrar($1)', [RE]), 'No pertenecés');
  }

  // ===================================================================
  grupo('17 · El aviso de la mañana: a quién le toca cobrar hoy');
  // ===================================================================
  const cobrosDeHoy = async () => H.comoServicio(db, async () => (await db.query('select public.cobros_de_hoy() j')).rows[0].j);
  {
    rechazado('un usuario común no puede pedir la lista de todos los negocios',
      await como(U, 'select public.cobros_de_hoy()'), 'denied|permission');

    // Un negocio por cada atraso: la cuota venció hace N días.
    const DIAS = [0, 1, 2, 3, 4, 7, 14, 21, 22];
    const porDia = {};
    for (const d of DIAS) {
      const X = await H.montarEmpresa(db, { email: `atraso${d}@negocio.com`, nombre: `Atraso ${d}` });
      const c = await cliente(`Deudor ${d}`, X);
      X.cliente = c;
      X.fio = await fiar(c, 50000, 'Compra', [[-d, 50000]], X);
      porDia[d] = X;
    }
    const lista = await cobrosDeHoy();
    const esta = (X) => lista.some((x) => x.empresa_id === X.empresaId);
    ok('se avisa el día que vence, a los 3 días y después una vez por semana (0, 3, 7, 14, 21)',
      Object.fromEntries(DIAS.map((d) => [d, esta(porDia[d])])),
      { 0: true, 1: false, 2: false, 3: true, 4: false, 7: true, 14: true, 21: true, 22: false });

    // El negocio completo: de hoy, atrasadas, a medias, vendedor, apagado.
    const M = await H.montarEmpresa(db, { email: 'manana@negocio.com', nombre: 'Almacén Mañana' });
    const ME = M.empresaId;
    // Cuatro personas: hace falta el plan que las deja entrar (equipo.test.js).
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'negocio')", [ME]));
    const vend = await H.sumarMiembro(db, ME, 'vende@manana.com', 'vendedor');
    const admin = await H.sumarMiembro(db, ME, 'admin@manana.com', 'admin');
    const apagado = await H.sumarMiembro(db, ME, 'apagado@manana.com', 'vendedor');
    await val(apagado, 'select public.guardar_preferencias(p_aviso_cobros => false)');
    await val(admin, "select public.guardar_preferencias(p_idioma => 'pt')");
    const pedro = await cliente('Pedro Ruiz Díaz', M);
    const anaM = await cliente('Ana María Gómez', M);
    const juanM = await cliente('Juan Pérez', M);
    const luis = await cliente('Luis Vera', M);
    const fp = await fiar(pedro, 300000, 'Moto', [[0, 150000], [30, 150000]], M);
    await cobrar(pedro, 20000, await cuotaN(fp, 1), M.uid, ME);            // de hoy, a medias: faltan 130.000
    await fiar(anaM, 300000, 'Cocina', [[0, 300000]], M);                  // de hoy, entera
    const fjm = await fiar(juanM, 150000, 'TV', [[-5, 150000]], M);         // atrasada 5 días (hoy no le toca sola)
    await fiar(luis, 90000, 'Mesa', [[10, 90000]], M);                     // todavía no vence
    const yaPagado = await cliente('Ya Pagó', M);
    const fy = await fiar(yaPagado, 70000, 'Silla', [[0, 70000]], M);
    await cobrar(yaPagado, 70000, await cuotaN(fy, 1), M.uid, ME);         // vencía hoy y ya pagó

    const m1 = (await cobrosDeHoy()).find((x) => x.empresa_id === ME);
    guardarEjemplo('cobros_de_hoy · una empresa', m1);
    ok('las claves de cada empresa', Object.keys(m1).sort(),
      ['atrasadas', 'destinatarios', 'empresa_id', 'fecha', 'hoy', 'moneda', 'nombre', 'personas', 'sin_escribir', 'tipo_cuenta'].sort());
    ok('son tres personas distintas entre lo de hoy y lo atrasado', m1.personas, 3);
    ok('la empresa, su moneda, su tipo y SU día', [m1.nombre, m1.moneda, m1.tipo_cuenta, m1.fecha], ['Almacén Mañana', 'PYG', 'emprendedor', await hoyDe(ME)]);
    ok('hoy: 2 cuotas, 430.000 (lo que FALTA de la que está a medias), nombres de pila por fecha y monto',
      m1.hoy, { cuantas: 2, personas: 2, monto: 430000, nombres: ['Ana', 'Pedro'] });
    ok('atrasadas: va toda la que hay, como contexto, con el atraso más largo',
      m1.atrasadas, { cuantas: 1, personas: 1, monto: 150000, nombres: ['Juan'], dias_max: 5 });
    ok('a ninguno de los tres le escribió todavía', m1.sin_escribir, 3);
    ok('lo reciben el dueño, el vendedor y el admin (en su idioma); quien lo apagó, no',
      m1.destinatarios, [{ user_id: M.uid, idioma: 'es' }, { user_id: vend, idioma: 'es' }, { user_id: admin, idioma: 'pt' }]);

    await val(vend, 'select public.marcar_cuota_avisada($1)', [await cuotaN(fjm, 1)]);
    ok('después de escribirle a Juan, quedan 2 sin escribir', (await cobrosDeHoy()).find((x) => x.empresa_id === ME).sin_escribir, 2);

    // Dos cuotas de la misma persona hoy: cuenta dos cuotas, una persona, un nombre.
    await fiar(anaM, 50000, 'Otra compra', [[0, 50000]], M);
    const m2 = (await cobrosDeHoy()).find((x) => x.empresa_id === ME);
    ok('dos cuotas de Ana hoy: 3 cuotas, 2 personas, y Ana una sola vez', m2.hoy, { cuantas: 3, personas: 2, monto: 480000, nombres: ['Ana', 'Pedro'] });
    ok('y sigue habiendo 2 personas sin escribir (Ana y Pedro), no 3 cuotas', [m2.sin_escribir, m2.personas], [2, 3]);

    // Más de tres personas: los nombres se cortan en tres.
    for (const nombre of ['Berta', 'Ciro', 'Delia']) await fiar(await cliente(`${nombre} Apellido`, M), 1000, 'x', [[0, 1000]], M);
    const m3 = (await cobrosDeHoy()).find((x) => x.empresa_id === ME);
    ok('con cinco personas, tres nombres (los de más plata primero)', [m3.hoy.personas, m3.hoy.nombres], [5, ['Ana', 'Pedro', 'Berta']]);

    // Solo algo atrasado que hoy no toca (5 días) y nada de hoy: no entra.
    const S = await H.montarEmpresa(db, { email: 'soloatraso@negocio.com', nombre: 'Solo atraso 5' });
    await fiar(await cliente('Atrasado 5', S), 10000, 'x', [[-5, 10000]], S);
    ok('un negocio con solo una cuota de hace 5 días hoy no recibe nada', (await cobrosDeHoy()).some((x) => x.empresa_id === S.empresaId), false);
    // Pero si además tiene una de hace 7, entra y cuenta las dos.
    await fiar(await cliente('Atrasado 7', S), 20000, 'x', [[-7, 20000]], S);
    const s2 = (await cobrosDeHoy()).find((x) => x.empresa_id === S.empresaId);
    // (R1.5) Antes acá salía ['Atrasado', 'Atrasado'] y se daba por bueno:
    // dos personas con el mismo nombre de pila no le dicen a nadie a quién
    // cobrarle. Ahora cada una lleva también la palabra que sigue.
    ok('con otra de hace 7 días entra, y la frase cuenta las dos atrasadas (y las distingue)',
      [s2?.hoy, s2?.atrasadas, s2?.personas],
      [{ cuantas: 0, personas: 0, monto: 0, nombres: [] }, { cuantas: 2, personas: 2, monto: 30000, nombres: ['Atrasado 7', 'Atrasado 5'], dias_max: 7 }, 2]);

    // ---------------------------------------------------------------
    // (R1.2 y R2.4) SE CUENTAN PERSONAS, NO CUOTAS. Los tres casos de
    // sondas/aviso-voz.js (S1-S3) y el de sondas/esceptico-personas.js.
    // ---------------------------------------------------------------
    const deLaEmpresa = async (X) => (await cobrosDeHoy()).find((x) => x.empresa_id === X.empresaId);
    // S1 · plan SEMANAL: no pagó la de hace 7 días y hoy vence la segunda.
    // Un solo cliente. Antes: «Hoy te paga Juan. Y 1 atrasado. A 2 todavía
    // no les escribiste».
    const SEM = await H.montarEmpresa(db, { email: 'semanal@negocio.com', nombre: 'Almacén Semanal' });
    const juanSem = await cliente('Juan Pérez', SEM);
    const fSem = await fiar(juanSem, 300000, 'Semanal', [[-7, 100000], [0, 100000], [7, 100000]], SEM);
    const sem = guardarEjemplo('cobros_de_hoy · un solo cliente con una cuota atrasada y otra de hoy', await deLaEmpresa(SEM));
    ok('Juan paga hoy y además debe la de hace 7 días: una cuota en cada parte, y UNA persona en total',
      [sem.hoy, sem.atrasadas, sem.personas],
      [{ cuantas: 1, personas: 1, monto: 100000, nombres: ['Juan'] }, { cuantas: 1, personas: 1, monto: 100000, nombres: ['Juan'], dias_max: 7 }, 1]);
    ok('a UNO no le escribió (no a dos)', sem.sin_escribir, 1);
    ok('los atrasados que no están en lo de hoy: ninguno (personas − hoy.personas)', sem.personas - sem.hoy.personas, 0);
    // El botón de WhatsApp de su fila marca por la cuota más vieja.
    const marcaSem = await J(SEM.uid, 'select public.marcar_cuota_avisada(p_cuota => $1) j', [await cuotaN(fSem, 1)]);
    ok('se le escribe por la atrasada: quedan avisadas las dos (la atrasada y la de hoy) y ya no falta escribirle a nadie',
      [marcaSem.marcadas, (await deLaEmpresa(SEM)).sin_escribir], [2, 0]);

    // S2 y S3, con Juan al lado: Ana con dos compras que vencen hoy, Luis con
    // dos cuotas atrasadas (10 y 3 días).
    const PER = await H.montarEmpresa(db, { email: 'personas@negocio.com', nombre: 'Almacén Personas' });
    const juanP = await cliente('Juan Pérez', PER);
    const anaP = await cliente('Ana Gómez', PER);
    const luisP = await cliente('Luis Vera', PER);
    const fJuanP = await fiar(juanP, 300000, 'Semanal', [[-7, 100000], [0, 100000], [7, 100000]], PER);
    await fiar(anaP, 50000, 'Compra 1', [[0, 50000]], PER);
    await fiar(anaP, 30000, 'Compra 2', [[0, 30000]], PER);
    const fLuisP = await fiar(luisP, 200000, 'Heladera', [[-10, 100000], [-3, 100000]], PER);
    const per = await deLaEmpresa(PER);
    ok('hoy: 3 cuotas de 2 personas (Juan y Ana); atrasadas: 3 cuotas de 2 personas (Luis y Juan); en total, 3 personas',
      [per.hoy, per.atrasadas, per.personas],
      [{ cuantas: 3, personas: 2, monto: 180000, nombres: ['Juan', 'Ana'] },
        { cuantas: 3, personas: 2, monto: 300000, nombres: ['Luis', 'Juan'], dias_max: 10 }, 3]);
    ok('son 6 cuotas sin avisar, pero 3 personas a las que escribirles', per.sin_escribir, 3);
    ok('el atrasado que no paga hoy es uno solo (Luis)', per.personas - per.hoy.personas, 1);
    await val(PER.uid, 'select public.marcar_cuota_avisada($1)', [await cuotaN(fLuisP, 1)]);
    ok('se le escribe a Luis por su cuota más vieja: quedan Juan y Ana', (await deLaEmpresa(PER)).sin_escribir, 2);
    await val(PER.uid, 'select public.marcar_cuota_avisada($1)', [await cuotaN(fJuanP, 2)]);
    ok('a Juan por la de hoy: queda Ana', (await deLaEmpresa(PER)).sin_escribir, 1);
    // (G2) Alcanza con UNA cuota vencida o de hoy sin avisar para volver a
    // contar a la persona: el botón marca todas las suyas de una vez, así que
    // si queda una sin marca es porque venció después del último mensaje.
    await db.query('update public.fiado_cuotas set avisado_el = public.hoy_empresa(empresa_id) where id = (select id from public.fiado_cuotas where cliente_id = $1 order by created_at, id limit 1)', [anaP]);
    ok('G2 · con una sola de las dos cuotas de Ana marcada, a Ana todavía hay que escribirle', (await deLaEmpresa(PER)).sin_escribir, 1);
    const marcaAna = await J(PER.uid, 'select public.marcar_cuota_avisada(p_cuota => $1) j',
      [(await filas('select id from public.fiado_cuotas where cliente_id = $1 order by created_at, id limit 1', [anaP]))[0].id]);
    ok('G2 · con el botón (que marca las dos), ya no', [marcaAna.marcadas, (await deLaEmpresa(PER)).sin_escribir], [2, 0]);
    // (G2) El caso de la revisión (sondas-comprobar/restos.js, B): a Pedro se
    // le escribió hace 7 días por la cuota 1, que sigue impaga, y HOY le
    // vence la 2. Antes no contaba («ya se le escribió»).
    const VIE = await H.montarEmpresa(db, { email: 'marca-vieja@negocio.com', nombre: 'Almacén Marca Vieja' });
    const pedroVie = await cliente('Pedro Ayala', VIE);
    const fVie = await fiar(pedroVie, 300000, 'TV', [[-7, 100000], [0, 100000], [7, 100000]], VIE);
    await db.query('update public.fiado_cuotas set avisado_el = public.hoy_empresa(empresa_id) - 7 where fio_id = $1 and numero = 1', [fVie]);
    const vie = await deLaEmpresa(VIE);
    ok('G2 · se le escribió hace una semana y hoy le vence otra: se lo vuelve a contar',
      [vie.personas, vie.hoy.nombres, vie.atrasadas.nombres, vie.sin_escribir], [1, ['Pedro'], ['Pedro'], 1]);
    await val(VIE.uid, 'select public.marcar_cuota_avisada($1)', [await cuotaN(fVie, 2)]);
    ok('G2 · se le escribe hoy: ya no cuenta, y las dos vencidas quedaron con la marca de hoy (la que todavía no vence, sin marca)',
      [(await deLaEmpresa(VIE)).sin_escribir, (await cuotasDe(pedroVie)).map((q) => q.avisado_el === hoy)], [0, [true, true, false]]);
    await cobrar(pedroVie, 200000, null, VIE.uid, VIE.empresaId);
    await db.query('update public.fiado_cuotas set avisado_el = null where fio_id = $1', [fVie]);
    ok('G2 · una cuota ya pagada sin marca no cuenta: no hay nada que avisar (ni la empresa entra en la lista)', await deLaEmpresa(VIE), undefined);
    // Y la plata no cambió por contar distinto.
    ok('los montos, los de siempre', [(await deLaEmpresa(PER)).hoy.monto, (await deLaEmpresa(PER)).atrasadas.monto], [180000, 300000]);

    // ---------------------------------------------------------------
    // (R1.5) LOS NOMBRES: el tratamiento no es el nombre, y dos con el mismo
    // nombre de pila se distinguen. Es sondas/aviso-voz.js (S7), que daba
    // «Hoy te pagan 3 (Juan, Juan y Don)».
    // ---------------------------------------------------------------
    const NOM = await H.montarEmpresa(db, { email: 'nombres@negocio.com', nombre: 'Almacén Nombres' });
    await fiar(await cliente('Don Pedro Ayala', NOM), 30000, 'x', [[0, 30000]], NOM);
    await fiar(await cliente('Juan Pérez', NOM), 20000, 'x', [[0, 20000]], NOM);
    await fiar(await cliente('Juan Gómez', NOM), 10000, 'x', [[0, 10000]], NOM);
    await fiar(await cliente('Ña Rosa', NOM), 30000, 'x', [[-7, 30000]], NOM);
    await fiar(await cliente('DOÑA Marta López', NOM), 20000, 'x', [[-7, 20000]], NOM);
    await fiar(await cliente('Sra. Carmen Ruiz', NOM), 10000, 'x', [[-7, 10000]], NOM);
    const nom = await deLaEmpresa(NOM);
    ok('«Don Pedro Ayala» es Pedro; los dos Juan llevan el apellido', nom.hoy.nombres, ['Pedro', 'Juan Pérez', 'Juan Gómez']);
    ok('«Ña Rosa», «DOÑA Marta López» y «Sra. Carmen Ruiz»: Rosa, Marta y Carmen', nom.atrasadas.nombres, ['Rosa', 'Marta', 'Carmen']);
    const NO2 = await H.montarEmpresa(db, { email: 'nombres2@negocio.com', nombre: 'Almacén Nombres 2' });
    await fiar(await cliente('Don', NO2), 30000, 'x', [[0, 30000]], NO2);
    await fiar(await cliente('SEÑOR Luis', NO2), 20000, 'x', [[0, 20000]], NO2);
    await fiar(await cliente('Dona  Bia   Souza', NO2), 10000, 'x', [[0, 10000]], NO2);
    await fiar(await cliente('Juan', NO2), 30000, 'x', [[-7, 30000]], NO2);
    await fiar(await cliente('juan Paz', NO2), 20000, 'x', [[-7, 20000]], NO2);
    await fiar(await cliente('Señora Ester', NO2), 10000, 'x', [[-7, 10000]], NO2);
    const no2 = await deLaEmpresa(NO2);
    ok('un «Don» solo se queda como está; «SEÑOR Luis» es Luis; «Dona  Bia» (pt, con espacios de más) es Bia', no2.hoy.nombres, ['Don', 'Luis', 'Bia']);
    ok('dos Juan, aunque uno esté en minúscula: el que tiene apellido lo lleva, el otro no tiene con qué', no2.atrasadas.nombres, ['Juan', 'juan Paz', 'Ester']);
    // El mismo nombre en las dos partes del aviso también se distingue.
    const NO3 = await H.montarEmpresa(db, { email: 'nombres3@negocio.com', nombre: 'Almacén Nombres 3' });
    await fiar(await cliente('Juan Pérez', NO3), 20000, 'x', [[0, 20000]], NO3);
    await fiar(await cliente('Juan Gómez', NO3), 10000, 'x', [[-7, 10000]], NO3);
    const no3 = await deLaEmpresa(NO3);
    ok('un Juan paga hoy y OTRO Juan está atrasado: son dos personas y se las nombra distinto',
      [no3.hoy.nombres, no3.atrasadas.nombres, no3.personas], [['Juan Pérez'], ['Juan Gómez'], 2]);

    // Quién NO: el profe (no tiene Fiado), la personal en Gratis, la vencida.
    const PR = await H.montarEmpresa(db, { email: 'profe@clases.com', nombre: 'Profe de tenis', rubro: 'clases' });
    await fiar(await cliente('Alumno', PR), 10000, 'x', [[0, 10000]], PR);
    const TR = await H.montarEmpresa(db, { email: 'trainer@gym.com', nombre: 'Trainer', rubro: 'entrenamiento' });
    await fiar(await cliente('Cliente', TR), 10000, 'x', [[0, 10000]], TR);
    const GA = await H.montarEmpresa(db, { email: 'campo@ganado.com', nombre: 'Estancia', rubro: 'ganaderia' });
    await fiar(await cliente('Frigorífico', GA), 10000, 'x', [[0, 10000]], GA);
    const fin = await cobrosDeHoy();
    const entra = (X) => fin.some((x) => x.empresa_id === X.empresaId);
    ok('el profe y el trainer no tienen la pantalla de Fiado: no reciben el aviso', [entra(PR), entra(TR)], [false, false]);
    ok('el ganadero sí («me pagan a 30 días»), aunque no reciba el aviso diario', entra(GA), true);
    ok('la personal con Pro sí; la personal en Gratis no; la vencida no', [entra(PP), entra(PG), entra(NV)], [true, false, false]);
    ok('la personal dice que es personal', fin.find((x) => x.empresa_id === PP.empresaId).tipo_cuenta, 'personal');
    ok('va ordenada por nombre del negocio', fin.map((x) => x.nombre), [...fin.map((x) => x.nombre)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  // ===================================================================
  grupo('18 · Zona horaria: «hoy» es el día de cada negocio');
  // ===================================================================
  {
    // Kiritimati (UTC+14) y Honolulu (UTC−10, sin horario de verano) están
    // a 24 horas justas: a cualquier hora que corra esta prueba, en una es
    // exactamente un día más que en la otra.
    const K = await H.montarEmpresa(db, { email: 'kiri@negocio.com', nombre: 'Zona Kiritimati' });
    const N = await H.montarEmpresa(db, { email: 'honolulu@negocio.com', nombre: 'Zona Honolulu' });
    await db.query("update public.empresas set zona_horaria = 'Pacific/Kiritimati' where id = $1", [K.empresaId]);
    await db.query("update public.empresas set zona_horaria = 'Pacific/Honolulu' where id = $1", [N.empresaId]);
    const hoyK = await hoyDe(K.empresaId);
    const hoyN = await hoyDe(N.empresaId);
    ok('en este mismo instante es otro día en cada una', [hoyK !== hoyN, masDias(hoyN, 1) === hoyK], [true, true]);
    const ck = await cliente('Cliente K', K);
    const cn = await cliente('Cliente N', N);
    // La fecha se calcula en SQL, con el «hoy» de cada negocio.
    for (const [X, c] of [[K, ck], [N, cn]]) {
      await val(X.uid, `select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 10000,
          p_plan => jsonb_build_array(jsonb_build_object('vence_el', public.hoy_empresa($1), 'monto', 10000)))`, [X.empresaId, c]);
    }
    ok('para cada una, su cuota vence hoy (dias = 0)', [(await cuotasDe(ck))[0].dias, (await cuotasDe(cn))[0].dias], [0, 0]);
    ok('y las fechas guardadas son distintas', [(await cuotasDe(ck))[0].vence_el, (await cuotasDe(cn))[0].vence_el], [hoyK, hoyN]);
    const lista = await cobrosDeHoy();
    const k = lista.find((x) => x.empresa_id === K.empresaId);
    const nn = lista.find((x) => x.empresa_id === N.empresaId);
    ok('el aviso lista a las dos, cada una con SU fecha', [k?.fecha, k?.hoy.cuantas, nn?.fecha, nn?.hoy.cuantas], [hoyK, 1, hoyN, 1]);
    ok('en el resumen de cada una, vence hoy',
      [(await resumen(K.uid, K.empresaId)).vencen_hoy, (await resumen(N.uid, N.empresaId)).vencen_hoy,
        (await resumen(K.uid, K.empresaId)).clientes[0].grupo, (await resumen(N.uid, N.empresaId)).clientes[0].grupo], [1, 1, 'hoy', 'hoy']);
    // La misma fecha de calendario, vista desde la otra zona, ya no es «hoy».
    const cruzada = (await val(N.uid, 'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 5000, p_plan => $3::jsonb) id',
      [N.empresaId, cn, JSON.stringify([{ vence_el: hoyK, monto: 5000 }])])).id;
    ok('la fecha de «hoy» de Kiritimati, en Honolulu, es mañana',
      (await cuotasDe(cn)).find((q) => q.fio_id === cruzada).dias, 1);
  }

  // ===================================================================
  grupo('19 · Permisos');
  // ===================================================================
  {
    const c = await cliente('Permisos Uno');
    const otro = await cliente('Permisos Dos');
    const fio = await fiar(c, 60000, 'Deuda', [[10, 30000], [40, 30000]]);
    const fioOtro = await fiar(otro, 60000, 'Deuda', [[10, 30000], [40, 30000]]);
    const c1 = await cuotaN(fio, 1);
    const ajeno = await cliente('Cliente de B', B);
    const fioB = await fiar(ajeno, 10000, 'De B', [[10, 10000]], B);

    rechazado('quien no es miembro no programa', await programar(B.uid, { fio, plan: plan([[5, 60000]]) }), 'No pertenecés');
    rechazado('ni quita', await como(B.uid, 'select public.quitar_cuotas($1)', [fio]), 'No pertenecés');
    rechazado('ni mueve', await como(B.uid, 'select public.mover_cuota($1,$2)', [c1, dia(5)]), 'No pertenecés');
    rechazado('ni marca', await como(B.uid, 'select public.marcar_cuota_avisada($1)', [c1]), 'No pertenecés');
    rechazado('ni cobra', await cobrar(c, 1000, c1, B.uid, E), 'No pertenecés');
    rechazado('ni anota con plan', await como(B.uid, 'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 1000, p_plan => $3::jsonb)', [E, c, plan([[5, 1000]])]), 'No pertenecés');
    rechazado('anotarle con plan a un cliente de otra empresa',
      await como(U, 'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 1000, p_plan => $3::jsonb)', [E, ajeno, plan([[5, 1000]])]), 'no es de esta cuenta');
    rechazado('cobrarle a un cliente de otra empresa', await cobrar(ajeno, 1000, null, U, E), 'no es de esta cuenta');
    rechazado('una cuota de OTRO cliente no sirve para cobrarle a este', await cobrar(c, 1000, await cuotaN(fioOtro, 1)), 'Esa cuota ya no existe');
    rechazado('ni una cuota de otra empresa', await cobrar(c, 1000, await cuotaN(fioB, 1)), 'Esa cuota ya no existe');
    rechazado('una cuota que no existe', await cobrar(c, 1000, '00000000-0000-0000-0000-000000000000'), 'Esa cuota ya no existe');
    rechazado('sin sesión no se programa',
      await H.intentarComo(db, 'anon', null, () => db.query('select public.programar_cuotas(p_fio => $1, p_plan => $2::jsonb)', [fio, plan([[5, 60000]])])), 'denied|permission');
    ok('nada de todo eso tocó las cuotas', [await pend(c), await pend(otro), await pend(ajeno)], [[30000, 30000], [30000, 30000], [10000]]);
    aceptado('el vendedor cobra una cuota (el que fía es el que cobra)', await cobrar(c, 30000, c1, vendedor));
    aceptado('y marca que le escribió', await como(vendedor, 'select public.marcar_cuota_avisada($1)', [await cuotaN(fio, 2)]));
    const caja = (await val(U, "select public.guardar_cuenta_dinero($1,'Caja','efectivo',0,'{efectivo}') id", [E])).id;
    rechazado('pero el vendedor no elige en qué cuenta entra (084)',
      await como(vendedor, 'select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 1000, p_cuenta => $3, p_cuota => $4)', [E, c, caja, await cuotaN(fio, 2)]), 'Solo el dueño');
    aceptado('el dueño cobra una cuota a una cuenta',
      await como(U, "select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 1000, p_metodo => 'transferencia', p_cuenta => $3, p_cuota => $4)", [E, c, caja, await cuotaN(fio, 2)]));
    ok('y entró en la cuenta, apuntando a la deuda',
      (await filas("select monto::int, metodo, cuenta_id, fio_id from public.fiado where cliente_id=$1 and tipo='cobro' and cuenta_id is not null", [c])),
      [{ monto: 1000, metodo: 'transferencia', cuenta_id: caja, fio_id: fio }]);
  }

  // ===================================================================
  grupo('20 · Preferencias: poder apagar el aviso');
  // ===================================================================
  {
    const nuevo = await H.crearUsuario(db, 'nuevo@preferencias.com');
    const p0 = await J(nuevo, 'select public.mis_preferencias() j');
    guardarEjemplo('mis_preferencias', p0);
    ok('por defecto, encendido (y lo de siempre, igual)', p0,
      { idioma: 'es', hora_cierre: 20, aviso_cierre: true, aviso_cobros: true, aviso_diario: true, aviso_turnos: true, aviso_semanal: true });
    ok('apagarlo', (await J(nuevo, 'select public.guardar_preferencias(p_aviso_cobros => false) j')).aviso_cobros, false);
    ok('queda guardado', [(await J(nuevo, 'select public.mis_preferencias() j')).aviso_cobros,
      (await filas('select aviso_cobros from public.preferencias where user_id=$1', [nuevo]))[0].aviso_cobros], [false, false]);
    ok('guardar otra cosa no lo vuelve a encender',
      (await J(nuevo, "select public.guardar_preferencias(p_idioma => 'pt', p_aviso_diario => false) j")),
      { idioma: 'pt', hora_cierre: 20, aviso_cierre: true, aviso_cobros: false, aviso_diario: false, aviso_turnos: true, aviso_semanal: true });
    ok('y se vuelve a encender', (await J(nuevo, 'select public.guardar_preferencias(p_aviso_cobros => true) j')).aviso_cobros, true);
    ok('la firma de seis ya no existe: hay una sola, de siete',
      (await filas("select pronargs::int n from pg_proc where pronamespace='public'::regnamespace and proname='guardar_preferencias'")), [{ n: 7 }]);
    rechazado('sin sesión no se guarda', await H.intentarComo(db, 'anon', null, () => db.query('select public.guardar_preferencias(p_aviso_cobros => false)')), 'denied|permission|iniciar sesión');
  }

  // ===================================================================
  grupo('21 · El contrato: cada pantalla llama como la base espera y lee lo que la base manda');
  // ===================================================================
  // Las pantallas se escribieron contra el diseño y la base aparte. Acá se
  // atan: (a) cada `rpc(...)` de src que toca el fiado se lee del código
  // fuente y se compara con la firma REAL de la función; (b) se llama a cada
  // una con los argumentos con nombre exactos de cada pantalla, como los
  // manda PostgREST; (c) lo que devuelve la base pasa por las mismas
  // funciones que usan las pantallas, y las partes tienen que sumar el saldo.
  {
    const RAIZ = path.join(__dirname, '..');
    const leer = (r) => fs.readFileSync(path.join(RAIZ, r), 'utf8').replace(/\r\n/g, '\n');

    // ---- (a) las llamadas, sacadas del código ----
    const DEL_FIADO = ['resumen_fiado', 'detalle_fiado', 'anotar_fiado', 'cobrar_fiado', 'programar_cuotas', 'quitar_cuotas',
      'mover_cuota', 'marcar_cuota_avisada', 'borrar_linea_fiado', 'libro_fiado', 'cuotas_por_cobrar', 'cobros_de_hoy',
      'mis_preferencias', 'guardar_preferencias'];
    const archivos = [];
    const andar = (dir) => {
      for (const f of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
        const r = `${dir}/${f.name}`;
        if (f.isDirectory()) andar(r);
        else if (/[.]tsx?$/.test(f.name)) archivos.push(r);
      }
    };
    andar('src');
    const llamadas = [];
    for (const archivo of archivos.sort()) {
      const s = leer(archivo);
      const re = /[.]rpc[(]\s*'([a-z_]+)'/g;
      let m;
      while ((m = re.exec(s))) {
        if (!DEL_FIADO.includes(m[1])) continue;
        // El objeto de argumentos, de llave a llave (con lo que lleve adentro).
        let i = re.lastIndex;
        while (s[i] === ' ' || s[i] === '\n') i++;
        let objeto = '';
        if (s[i] === ',') {
          const desde = s.indexOf('{', i);
          let hondo = 0;
          let j = desde;
          do { if (s[j] === '{') hondo++; else if (s[j] === '}') hondo--; j++; } while (hondo > 0 && j < s.length);
          objeto = s.slice(desde, j);
        }
        const claves = [...new Set([...objeto.matchAll(/(?:^|[\s,{(])(p_[a-z_]+)\s*:/g)].map((x) => x[1]))];
        llamadas.push({ archivo: archivo.replace(/^src[/]/, ''), funcion: m[1], claves });
      }
    }
    ok('las llamadas al fiado que hay en src, con sus argumentos (si cambia una pantalla, se cambia acá)',
      llamadas.map((l) => `${l.archivo} › ${l.funcion}(${l.claves.join(', ')})`), [
        'app/(app)/ajustes/page.tsx › mis_preferencias()',
        'app/api/capturar/route.ts › resumen_fiado(p_empresa)',
        'components/CapturaInteligente.tsx › programar_cuotas(p_venta, p_plan)',
        'components/PantallaFiado.tsx › anotar_fiado(p_empresa, p_cliente, p_monto, p_concepto, p_cuenta, p_plan)',
        'components/PantallaFiado.tsx › detalle_fiado(p_cliente)',
        'components/PantallaFiado.tsx › cobrar_fiado(p_empresa, p_cliente, p_monto, p_metodo, p_cuenta, p_cuota)',
        'components/PantallaFiado.tsx › quitar_cuotas(p_fio)',
        'components/PantallaFiado.tsx › borrar_linea_fiado(p_linea)',
        'components/PantallaFiado.tsx › mover_cuota(p_cuota, p_vence_el)',
        'components/PantallaFiado.tsx › marcar_cuota_avisada(p_cuota)',
        'components/PantallaFiado.tsx › programar_cuotas(p_fio, p_plan)',
        'components/PantallaVenta.tsx › programar_cuotas(p_venta, p_plan)',
        'components/Preferencias.tsx › guardar_preferencias(p_idioma)',
        'components/Preferencias.tsx › guardar_preferencias(p_aviso_cierre, p_aviso_semanal, p_hora_cierre, p_aviso_turnos, p_aviso_diario, p_aviso_cobros)',
        'components/RevisionFiado.tsx › resumen_fiado(p_empresa)',
        'components/RevisionFiado.tsx › detalle_fiado(p_cliente)',
        'components/RevisionFiado.tsx › cobrar_fiado(p_empresa, p_cliente, p_monto, p_metodo, p_fecha, p_cuenta, p_cuota)',
        'components/RevisionFiado.tsx › anotar_fiado(p_empresa, p_cliente, p_monto, p_concepto, p_fecha, p_cuenta, p_plan)',
        'lib/avisos-diarios.ts › cobros_de_hoy()',
        'lib/fiado.ts › resumen_fiado(p_empresa)',
      ]);

    // Contra la firma real: ningún argumento que la función no tenga, y
    // ninguno obligatorio sin mandar.
    const firmas = Object.fromEntries((await filas(
      `select p.proname, coalesce(p.proargnames, '{}') nombres, p.pronargs::int n, p.pronargdefaults::int con_default
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)`, [DEL_FIADO]))
      .map((x) => [x.proname, x]));
    ok('todas esas funciones existen', DEL_FIADO.filter((f) => !firmas[f]), []);
    ok('ninguna pantalla manda un argumento que la función no tiene',
      llamadas.flatMap((l) => l.claves.filter((k) => !firmas[l.funcion].nombres.slice(0, firmas[l.funcion].n).includes(k))
        .map((k) => `${l.archivo} › ${l.funcion}: ${k}`)), []);
    ok('y ninguna deja sin mandar uno obligatorio',
      llamadas.flatMap((l) => firmas[l.funcion].nombres.slice(0, firmas[l.funcion].n - firmas[l.funcion].con_default)
        .filter((k) => !l.claves.includes(k)).map((k) => `${l.archivo} › ${l.funcion}: falta ${k}`)), []);

    // ---- (b) las mismas llamadas, de verdad ----
    // Los valores van sin `::tipo`: PostgREST manda JSON y es la función la
    // que dice qué es cada cosa.
    const rpc = async (uid, funcion, args = {}) => {
      const nombres = Object.keys(args);
      const sql = `select public.${funcion}(${nombres.map((k, i) => `${k} => $${i + 1}`).join(', ')}) j`;
      const valores = nombres.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
      return como(uid, sql, valores);
    };
    const pide = async (nombre, uid, funcion, args) => {
      const r = await rpc(uid, funcion, args);
      aceptado(nombre, r);
      return r.ok ? r.valor.rows[0].j : null;
    };
    const claves = (o) => Object.keys(o ?? {}).sort();
    const Q = require('../.compilado/cuotas.js');
    const { fraseDeCobros, claveDeCobros } = require('../.compilado/frase-cobros.js');

    const C = await H.montarEmpresa(db, { email: 'contrato@almacen.com', nombre: 'Almacén Contrato' });
    const EC = C.empresaId;
    const UC = C.uid;
    const hoyC = await hoyDe(EC);
    const diaC = (d) => masDias(hoyC, d);
    const nuevoCliente = async (nombre, tel) => (await val(UC, 'select public.guardar_cliente($1,$2,$3) id', [EC, nombre, tel])).id;
    const juan = await nuevoCliente('Juan Contrato', '0981 500 001');
    const pedro = await nuevoCliente('Pedro Contrato', '0981 500 002');
    const ana = await nuevoCliente('Ana Contrato', '0981 500 003');
    const carlos = await nuevoCliente('Carlos Contrato', '0981 500 004');

    // Fiado › «Anotar un fiado», sin fecha y con cuotas (lo que arma `armarPlan`).
    await pide('Fiado: anotar sin fecha', UC, 'anotar_fiado',
      { p_empresa: EC, p_cliente: juan, p_monto: 400000, p_concepto: 'Libreta', p_cuenta: null });
    const planTv = Q.armarPlan({ total: 300000, cuotas: 3, cada: 'mes', primera: diaC(-33), decimales: 0 });
    planTv[1].vence_el = diaC(-3);
    planTv[2].vence_el = diaC(27);
    const tv = await pide('Fiado: anotar con el plan de «¿Cuándo te paga?»', UC, 'anotar_fiado',
      { p_empresa: EC, p_cliente: juan, p_monto: 300000, p_concepto: 'TV 32"', p_cuenta: null, p_plan: planTv });
    // Vender › la venta y, en un segundo paso, las cuotas.
    const venta = (await val(UC,
      "select public.registrar_venta(p_empresa => $1, p_items => $2::jsonb, p_metodo_pago => 'credito', p_cliente => $3) id",
      [EC, JSON.stringify([{ nombre: 'Heladera', cantidad: 1, precio_unitario: 500000 }]), pedro])).id;
    const planVenta = Q.armarPlan({ total: 500000, cuotas: 4, cada: 'semana', primera: hoyC, decimales: 0 });
    const programada = await pide('Vender: programar_cuotas con la venta', UC, 'programar_cuotas', { p_venta: venta, p_plan: planVenta });
    ok('y devuelve la línea, el cliente y las cuotas', [claves(programada), programada?.cuotas?.length, programada?.cliente_id],
      [['cliente_id', 'cuotas', 'fio_id'], 4, pedro]);
    // La voz › el fiado con fecha de cuándo se fió y una sola fecha de cobro.
    await pide('Voz: anotar con fecha y plan de una cuota', UC, 'anotar_fiado',
      { p_empresa: EC, p_cliente: ana, p_monto: 200000, p_concepto: 'por voz', p_fecha: hoyC, p_cuenta: null,
        p_plan: Q.armarPlan({ total: 200000, cuotas: 1, cada: 'mes', primera: diaC(5), decimales: 0 }) });
    await pide('Voz: anotar sin plan', UC, 'anotar_fiado',
      { p_empresa: EC, p_cliente: carlos, p_monto: 320000, p_concepto: '', p_fecha: null, p_cuenta: null });

    // lib/fiado.ts › el resumen, y las claves que el código lee de él.
    const res = await pide('resumen_fiado, como lo pide la página', UC, 'resumen_fiado', { p_empresa: EC });
    const deJuan = res.clientes.find((x) => x.cliente_id === juan);
    const fuenteFiado = leer('src/lib/fiado.ts');
    const leidas = (fuente, patron) => [...new Set([...fuente.matchAll(patron)].map((x) => x[1]))].sort();
    ok('lib/fiado.ts no lee del resumen ninguna clave que la base no mande',
      leidas(fuenteFiado, /\bd[?][.]([a-z_]+)/g).filter((k) => !(k in res)), []);
    ok('ni de cada cliente',
      leidas(fuenteFiado, /\bc[.]([a-z_]+)/g).filter((k) => !(k in deJuan)), []);
    ok('ni de su próxima cuota',
      leidas(fuenteFiado, /\bp[.]([a-z_]+)/g).filter((k) => !(k in deJuan.proxima)), []);
    ok('y lee todas las nuevas (si la base suma una clave, que alguien la mire)',
      [claves(res).filter((k) => !leidas(fuenteFiado, /\bd[?][.]([a-z_]+)/g).includes(k)),
        claves(deJuan).filter((k) => !leidas(fuenteFiado, /\bc[.]([a-z_]+)/g).includes(k)),
        claves(deJuan.proxima).filter((k) => !leidas(fuenteFiado, /\bp[.]([a-z_]+)/g).includes(k))], [[], [], []]);
    const grupos = Q.agruparDeudores(res.clientes);
    ok('los cuatro grupos de la pantalla, armados con lo que mandó la base',
      Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, v.map((x) => x.nombre)])),
      { atrasadas: ['Juan Contrato'], hoy: ['Pedro Contrato'], proximas: ['Ana Contrato'], sinFecha: ['Carlos Contrato'] });
    ok('la fila de Juan: debe 700.000 en total; cuota 1 de 3, atrasada; + 400.000 sin fecha',
      [deJuan.saldo, deJuan.proxima.numero, deJuan.proxima.de, deJuan.proxima.dias, deJuan.proxima.pendiente, deJuan.sin_fecha],
      [700000, 1, 3, -33, 100000, 400000]);
    ok('«Para cobrar» = atrasado + hoy', [res.monto_atrasado + res.monto_hoy, res.atrasadas, res.vencen_hoy, res.con_fecha_cuantos],
      [200000 + 125000, 2, 1, 3]);

    // PantallaFiado y RevisionFiado › la ficha (`leerDetalleFiado`).
    const fuenteCuotas = leer('src/lib/cuotas.ts');
    const lector = fuenteCuotas.slice(fuenteCuotas.indexOf('export function leerDetalleFiado'), fuenteCuotas.indexOf('export function lineasParaFechar'));
    const [parteArriba, resto] = [lector.slice(0, lector.indexOf('sin_fecha_lineas: lista(')), lector.slice(lector.indexOf('sin_fecha_lineas: lista('))];
    const [parteSinFecha, parteLibro] = [resto.slice(0, resto.indexOf('libro: lista(')), resto.slice(resto.indexOf('libro: lista('))];
    const crudo = await pide('detalle_fiado, como lo pide la ficha', UC, 'detalle_fiado', { p_cliente: juan });
    ok('leerDetalleFiado no lee ninguna clave que la base no mande (ficha, deuda, cuota, línea sin fecha, libro)',
      [leidas(parteArriba, /\bd[?][.]([a-z_]+)/g).filter((k) => !(k in crudo)),
        leidas(parteArriba, /\bx[.]([a-z_]+)/g).filter((k) => !(k in crudo.deudas[0])),
        leidas(parteArriba, /\bc[.]([a-z_]+)/g).filter((k) => !(k in crudo.deudas[0].cuotas[0])),
        leidas(parteSinFecha, /\bl[.]([a-z_]+)/g).filter((k) => !(k in crudo.sin_fecha_lineas[0])),
        leidas(parteLibro, /\bl[.]([a-z_]+)/g).filter((k) => !(k in crudo.libro[0]))], [[], [], [], [], []]);
    ok('las claves de la ficha, exactas',
      [claves(crudo), claves(crudo.deudas[0]), claves(crudo.deudas[0].cuotas[0]), claves(crudo.sin_fecha_lineas[0]), claves(crudo.libro[0])],
      [['activo', 'cliente_id', 'desde', 'deudas', 'dias', 'libro', 'nombre', 'saldo', 'sin_fecha', 'sin_fecha_lineas', 'telefono'],
        ['concepto', 'cuotas', 'falta', 'fecha', 'fio_id', 'monto', 'pagado', 'venta_id'],
        ['avisado_el', 'cuota_id', 'de', 'dias', 'monto', 'numero', 'pagado', 'pendiente', 'vence_el'],
        ['concepto', 'cubierto', 'fecha', 'id', 'monto', 'venta_id'],
        ['concepto', 'created_at', 'fecha', 'fio_id', 'id', 'metodo', 'monto', 'tipo', 'venta_id']]);

    // Lo que la pantalla MUESTRA suma el saldo del libro, para los cuatro.
    const fichaDe = async (c) => Q.leerDetalleFiado((await rpc(UC, 'detalle_fiado', { p_cliente: c })).valor.rows[0].j);
    const sumaLoQueSeVe = async (c) => {
      const f = await fichaDe(c);
      const fila = (await rpc(UC, 'resumen_fiado', { p_empresa: EC })).valor.rows[0].j.clientes.find((x) => x.cliente_id === c);
      const enCuotas = f.deudas.reduce((s, d) => s + d.cuotas.reduce((t, q) => t + q.pendiente, 0), 0);
      return {
        libro: await saldo(c), fila: fila?.saldo ?? 0, ficha: f.saldo,
        partes: f.sin_fecha + enCuotas,
        deudasCierran: f.deudas.every((d) => d.falta === d.cuotas.reduce((t, q) => t + q.pendiente, 0) && d.pagado + d.falta === d.monto),
        filaCierra: fila ? fila.sin_fecha + fila.con_fecha === fila.saldo : true,
      };
    };
    const todoIgual = (x) => x.libro === x.fila && x.fila === x.ficha && x.ficha === x.partes && x.deudasCierran && x.filaCierra;
    for (const [nombre, c] of [['Juan', juan], ['Pedro', pedro], ['Ana', ana], ['Carlos', carlos]]) {
      const x = await sumaLoQueSeVe(c);
      ok(`${nombre}: el libro, la fila, la ficha y la suma de sus partes dicen lo mismo (${x.libro})`, todoIgual(x), true);
    }

    // «¿De qué?» › lo que propone, y cobrar con esos mismos números.
    let ficha = await fichaDe(juan);
    const { opciones, elegida } = Q.opcionesDeCobro(ficha);
    ok('«¿De qué?»: la TV (la cuota atrasada), lo sin fecha y todo; elegida la TV, con su cuota',
      [opciones.map((o) => [o.tipo, o.propuesto, o.tope]), elegida === tv, opciones[0].cuota.numero],
      [[['deuda', 100000, 300000], ['sin_fecha', 400000, 700000], ['todo', 700000, 700000]], true, 1]);
    const rechazoTope = await rpc(UC, 'cobrar_fiado',
      { p_empresa: EC, p_cliente: juan, p_monto: opciones[0].tope + 1, p_metodo: 'efectivo', p_cuenta: null, p_cuota: opciones[0].cuota.cuota_id });
    rechazado('un guaraní más que el tope que muestra la pantalla: la base lo frena igual', rechazoTope, 'De esa deuda faltan 300.000');
    const cobro = await pide('Fiado: cobrar la cuota propuesta', UC, 'cobrar_fiado',
      { p_empresa: EC, p_cliente: juan, p_monto: opciones[0].propuesto, p_metodo: 'efectivo', p_cuenta: null, p_cuota: opciones[0].cuota.cuota_id });
    ok('y la pantalla lee el saldo y cuándo vence la próxima',
      [cobro.saldo, cobro.deuda.proxima.vence_el, cobro.deuda.proxima.numero], [600000, diaC(-3), 2]);
    const cobroVoz = await pide('Voz: cobrar una parte de la cuota, con fecha', UC, 'cobrar_fiado',
      { p_empresa: EC, p_cliente: juan, p_monto: 40000, p_metodo: 'transferencia', p_fecha: hoyC, p_cuenta: null,
        p_cuota: Q.opcionesDeCobro(await fichaDe(juan)).opciones[0].cuota.cuota_id });
    ok('la cuota 2 queda a medias y sigue siendo la próxima', [cobroVoz.saldo, cobroVoz.deuda.proxima.numero, cobroVoz.deuda.proxima.pendiente], [560000, 2, 60000]);
    const suelto = await pide('Fiado: cobrar «Todo» o «Lo sin fecha» va sin cuota', UC, 'cobrar_fiado',
      { p_empresa: EC, p_cliente: juan, p_monto: 50000, p_metodo: 'efectivo', p_cuenta: null });
    ok('y baja lo sin fecha, no la cuota', [suelto.saldo, suelto.sin_fecha, suelto.deuda], [510000, 350000, null]);
    ficha = await fichaDe(juan);
    ok('el libro dice de qué fue cada pago: los dos de la TV apuntan a la deuda, el suelto no',
      ficha.libro.filter((l) => l.tipo === 'cobro').map((l) => (l.fio_id ? ficha.deudas.find((d) => d.fio_id === l.fio_id)?.concepto : '(suelto)')).sort(),
      ['(suelto)', 'TV 32"', 'TV 32"']);
    ok('después de tres cobros, todo sigue sumando', todoIgual(await sumaLoQueSeVe(juan)), true);

    // La ficha › escribirle, cambiar una fecha, rearmar, quitar y borrar.
    const c2 = ficha.deudas[0].cuotas.find((q) => q.numero === 2);
    ok('marcar_cuota_avisada', (await pide('Fiado: «le escribí» por la cuota', UC, 'marcar_cuota_avisada', { p_cuota: c2.cuota_id }))?.avisado_el, hoyC);
    ok('y la fila lo sabe: la pantalla compara `avisado_el` con hoy',
      (await rpc(UC, 'resumen_fiado', { p_empresa: EC })).valor.rows[0].j.clientes.find((x) => x.cliente_id === juan).proxima.avisado_el, hoyC);
    const movida = await pide('Fiado: cambiar la fecha de una cuota', UC, 'mover_cuota', { p_cuota: c2.cuota_id, p_vence_el: diaC(2) });
    ok('queda con la fecha nueva', movida?.cuota?.vence_el, diaC(2));
    // F3 (R2.1) · El campo de fecha de la ficha lleva `min` y `max`: las
    // fechas de las cuotas vecinas (`vecinasDe`). Antes no tenía tope y la
    // cuota 1 se podía pasar por encima de la 2: quien pagaba la de hoy
    // quedaba con la de hoy sin pagar. Lo que el campo deja elegir, la base
    // lo acepta; un día más allá, lo rechaza con el mensaje de siempre.
    ficha = await fichaDe(juan);
    const vecinas = Q.vecinasDe(ficha.deudas[0].cuotas, 2);
    ok('F3 · el campo de la cuota 2 va de la fecha de la 1 a la de la 3', vecinas, { min: diaC(-33), max: diaC(27) });
    ok('F3 · la primera no tiene piso y la última no tiene tope',
      [Q.vecinasDe(ficha.deudas[0].cuotas, 1), Q.vecinasDe(ficha.deudas[0].cuotas, 3)], [{ max: diaC(2) }, { min: diaC(2) }]);
    rechazado('F3 · un día después del tope del campo, la base lo rechaza',
      await rpc(UC, 'mover_cuota', { p_cuota: c2.cuota_id, p_vence_el: masDias(vecinas.max, 1) }), 'tienen que ir en orden');
    rechazado('F3 · y un día antes del piso',
      await rpc(UC, 'mover_cuota', { p_cuota: c2.cuota_id, p_vence_el: masDias(vecinas.min, -1) }), 'tienen que ir en orden');
    await pide('F3 · justo en el tope (la misma fecha que la 3) sí', UC, 'mover_cuota', { p_cuota: c2.cuota_id, p_vence_el: vecinas.max });
    await pide('F3 · y justo en el piso', UC, 'mover_cuota', { p_cuota: c2.cuota_id, p_vence_el: vecinas.min });
    await pide('F3 · vuelve a donde estaba', UC, 'mover_cuota', { p_cuota: c2.cuota_id, p_vence_el: diaC(2) });
    ficha = await fichaDe(juan);
    // «Rearmar» abre con el plan que ya tiene, tal como lo arma la pantalla.
    const planActual = ficha.deudas[0].cuotas.map((q) => ({ vence_el: q.vence_el, monto: q.monto }));
    ok('el plan que ya tiene es válido para la pantalla (Guardar no nace apagado)', Q.planValido(planActual, ficha.deudas[0].monto, 0), true);
    await pide('Fiado: rearmar con el mismo plan', UC, 'programar_cuotas', { p_fio: tv, p_plan: planActual });
    await pide('Fiado: rearmar en 6', UC, 'programar_cuotas',
      { p_fio: tv, p_plan: Q.armarPlan({ total: 300000, cuotas: 6, cada: 'quincena', primera: diaC(1), decimales: 0 }) });
    ok('rearmada, lo ya pagado (140.000) tapa las primeras y todo sigue sumando',
      [(await fichaDe(juan)).deudas[0].cuotas.map((q) => q.pendiente), todoIgual(await sumaLoQueSeVe(juan))],
      [[0, 0, 10000, 50000, 50000, 50000], true]);
    // «Ponerle fecha» a la libreta: la línea sale de `lineasParaFechar`.
    ficha = await fichaDe(juan);
    const paraFechar = Q.lineasParaFechar(ficha.sin_fecha_lineas, ficha.sin_fecha);
    ok('«Ponerle fecha» se ofrece en la libreta', paraFechar.map((l) => [l.concepto, l.monto]), [['Libreta', 400000]]);
    await pide('Fiado: ponerle fecha a lo que no tenía', UC, 'programar_cuotas',
      { p_fio: paraFechar[0].id, p_plan: Q.armarPlan({ total: paraFechar[0].monto, cuotas: 1, cada: 'mes', primera: diaC(30), decimales: 0 }) });
    ok('la hoja avisó «Ya cobraste 50.000» (lo que la base manda en `cubierto`)', [paraFechar[0].cubierto, Q.yaCobradoAlFechar(ficha, paraFechar[0], 0)], [50000, 50000]);
    ficha = await fichaDe(juan);
    ok('y eso es lo que quedó atado a esa deuda: el pago de 50.000 dice ser de la libreta, y todo sigue sumando',
      [ficha.sin_fecha, ficha.deudas.find((x) => x.fio_id === paraFechar[0].id).pagado,
        ficha.libro.filter((l) => l.tipo === 'cobro' && l.fio_id === paraFechar[0].id).map((l) => l.monto), todoIgual(await sumaLoQueSeVe(juan))],
      [0, 50000, [50000], true]);
    ok('quitar_cuotas devuelve el saldo, que no cambió',
      (await pide('Fiado: quitar las cuotas', UC, 'quitar_cuotas', { p_fio: paraFechar[0].id }))?.saldo, 510000);
    // Sin las fechas, ese pago sigue siendo de la libreta (ya no hay pagos sueltos).
    ficha = await fichaDe(juan);
    const pagoDeLaLibreta = ficha.libro.find((l) => l.tipo === 'cobro' && l.fio_id === paraFechar[0].id);
    ok('sin las fechas, la ficha sigue mostrando ese pago cubriendo la libreta',
      [ficha.libro.filter((l) => l.tipo === 'cobro' && !l.fio_id).length, ficha.sin_fecha_lineas.map((l) => [l.concepto, l.cubierto])], [0, [['Libreta', 50000]]]);
    rechazado('Fiado: la ✕ de la libreta pide borrar antes ese pago',
      await rpc(UC, 'borrar_linea_fiado', { p_linea: paraFechar[0].id }), 'Esa deuda tiene pagos anotados. Borrá primero esos pagos');
    ok('y ese mensaje tiene su traducción', leer('src/lib/mensajes-base.ts').includes("'Esa deuda tiene pagos anotados. Borrá primero esos pagos.': 'Essa dívida tem pagamentos anotados. Apague primeiro esses pagamentos.'"), true);
    ok('borrar_linea_fiado devuelve el saldo',
      (await pide('Fiado: borrar un pago con la ✕', UC, 'borrar_linea_fiado', { p_linea: pagoDeLaLibreta.id }))?.saldo, 560000);
    ok('y al final, todo sigue sumando', todoIgual(await sumaLoQueSeVe(juan)), true);

    // Ajustes › los interruptores.
    const prefs = await pide('Ajustes: guardar con los seis interruptores', UC, 'guardar_preferencias',
      { p_aviso_cierre: true, p_aviso_semanal: true, p_hora_cierre: 20, p_aviso_turnos: true, p_aviso_diario: true, p_aviso_cobros: true });
    ok('y devuelve `aviso_cobros`, que es lo que pinta el interruptor', prefs?.aviso_cobros, true);
    ok('mis_preferencias también', (await pide('Ajustes: mis_preferencias', UC, 'mis_preferencias'))?.aviso_cobros, true);

    // El aviso de la mañana › de la base a la frase, con el texto de verdad.
    const lista = (await H.comoServicio(db, () => db.query('select public.cobros_de_hoy() j'))).rows[0].j;
    const deLaCuenta = lista.find((x) => x.empresa_id === EC);
    ok('cobros_de_hoy trae la cuenta, con las claves que leen el aviso y la frase',
      [claves(deLaCuenta), claves(deLaCuenta?.hoy), claves(deLaCuenta?.atrasadas), claves(deLaCuenta?.destinatarios?.[0])],
      [['atrasadas', 'destinatarios', 'empresa_id', 'fecha', 'hoy', 'moneda', 'nombre', 'personas', 'sin_escribir', 'tipo_cuenta'],
        ['cuantas', 'monto', 'nombres', 'personas'], ['cuantas', 'dias_max', 'monto', 'nombres', 'personas'], ['idioma', 'user_id']]);
    const es = leer('src/i18n/textos/es.ts');
    const desde = es.indexOf('\n    cobros: {\n');
    const bloque = es.slice(desde, es.indexOf('\n    },\n', desde));
    const textos = new Function(`return {${bloque.slice(bloque.indexOf('{') + 1).replace(/: (string|number)\b/g, '')}};`)();
    const frase = fraseDeCobros(deLaCuenta, textos, 'es-PY');
    ok('y con eso sale la frase: hoy paga Pedro, lleva a Fiado', [frase?.titulo, /^Hoy te paga Pedro: /.test(frase?.cuerpo ?? ''), frase?.url],
      ['Almacén Contrato', true, '/fiado']);
    const reservar = () => H.comoServicio(db, () => db.query(
      'select public.reservar_envio(p_tipo => $1, p_clave => $2, p_user => $3, p_empresa => $4, p_canal => $5) r',
      ['cobros', claveDeCobros(EC, UC, deLaCuenta.fecha), UC, EC, 'push']));
    ok('reservar_envio acepta el aviso de cobros: una vez por persona, cuenta y día',
      [(await reservar()).rows[0].r, (await reservar()).rows[0].r], [true, false]);

    // ---- Las correcciones de la revisión del 07/10, de la base a lo que se lee ----
    // En otra cuenta, para no mover los números de arriba.
    const R = await H.montarEmpresa(db, { email: 'revision@almacen.com', nombre: 'Almacén Revisión' });
    const ER = R.empresaId;
    const UR = R.uid;
    const hoyR = await hoyDe(ER);
    const diaR = (d) => masDias(hoyR, d);
    const clienteR = async (nombre, tel) => (await val(UR, 'select public.guardar_cliente($1,$2,$3) id', [ER, nombre, tel])).id;
    const fichaR = async (c) => Q.leerDetalleFiado((await rpc(UR, 'detalle_fiado', { p_cliente: c })).valor.rows[0].j);
    const filaR = async (c) => (await rpc(UR, 'resumen_fiado', { p_empresa: ER })).valor.rows[0].j.clientes.find((x) => x.cliente_id === c);
    const avisoR = async () => {
      const todas = (await H.comoServicio(db, () => db.query('select public.cobros_de_hoy() j'))).rows[0].j;
      const c = todas.find((x) => x.empresa_id === ER) ?? null;
      return { c, cuerpo: c ? fraseDeCobros(c, textos, 'es-PY')?.cuerpo ?? null : null };
    };
    const gs = (v) => require('../.compilado/formato.js').dinero(v, 'PYG', true, 'es-PY');

    // F4 (R1.2) · El plan semanal: la cuota de hace 7 días sin pagar y la de
    // hoy son de la MISMA persona. El aviso decía «Hoy te paga Juan… Y 1
    // atrasado… A 2 todavía no les escribiste» con un solo cliente.
    const juanR = await clienteR('Juan Semanal', '0981 600 001');
    await pide('F4 · Juan, 300.000 en 3 cuotas semanales: una atrasada 7 días y otra hoy', UR, 'anotar_fiado',
      { p_empresa: ER, p_cliente: juanR, p_monto: 300000, p_concepto: 'Garrafas', p_cuenta: null,
        p_plan: [{ vence_el: diaR(-7), monto: 100000 }, { vence_el: hoyR, monto: 100000 }, { vence_el: diaR(7), monto: 100000 }] });
    let av = await avisoR();
    ok('F4 · la base dice que es una sola persona, en las dos mitades',
      [av.c.personas, av.c.hoy.personas, av.c.atrasadas.personas, av.c.sin_escribir], [1, 1, 1, 1]);
    ok('F4 · y la frase no lo trata como dos: «y debe otros…», a UNO le falta escribir',
      av.cuerpo, `Hoy te paga Juan: ${gs(100000)}. Y debe otros ${gs(100000)} atrasados. A 1 todavía no le escribiste.`);
    let fila = await filaR(juanR);
    ok('F4 · con una sola atrasada la fila sigue hablando de su cuota', [Q.variasAtrasadas(fila), fila.proxima.numero, fila.proxima.dias], [null, 1, -7]);
    // «Recordarle por WhatsApp» manda la próxima cuota, como la pantalla.
    ok('F4 · un toque marca las dos (la atrasada y la de hoy): se le escribió a la persona',
      (await pide('F4 · marcar_cuota_avisada con la próxima', UR, 'marcar_cuota_avisada', { p_cuota: fila.proxima.cuota_id }))?.marcadas, 2);
    av = await avisoR();
    ok('F4 · y el aviso ya no dice que falta escribirle',
      [av.c.sin_escribir, av.cuerpo], [0, `Hoy te paga Juan: ${gs(100000)}. Y debe otros ${gs(100000)} atrasados.`]);

    // F4 (R2.4) · Pedro con DOS cuotas atrasadas (7 y 3 días: las dos avisan
    // hoy) y Ana con una de hoy. La fila decía «Cuota 1 de 3 · 150.000» y el
    // WhatsApp reclamaba esa sola.
    const pedroR = await clienteR('Pedro Heladera', '0981 600 002');
    const anaR = await clienteR('Ana Hoy', '0981 600 003');
    await pide('F4 · Pedro, heladera en 3: dos vencidas', UR, 'anotar_fiado',
      { p_empresa: ER, p_cliente: pedroR, p_monto: 450000, p_concepto: 'Heladera', p_cuenta: null,
        p_plan: [{ vence_el: diaR(-7), monto: 150000 }, { vence_el: diaR(-3), monto: 150000 }, { vence_el: diaR(27), monto: 150000 }] });
    await pide('F4 · Ana, una fecha: hoy', UR, 'anotar_fiado',
      { p_empresa: ER, p_cliente: anaR, p_monto: 80000, p_concepto: '', p_cuenta: null, p_plan: [{ vence_el: hoyR, monto: 80000 }] });
    fila = await filaR(pedroR);
    ok('F4 · la fila de Pedro trae sus dos atrasadas y el total; su próxima es solo la primera',
      [fila.atrasadas, fila.monto_atrasado, fila.proxima.numero, fila.proxima.pendiente], [2, 300000, 1, 150000]);
    ok('F4 · y la pantalla usa el total: «2 cuotas atrasadas · 300.000» (fila y WhatsApp)', Q.variasAtrasadas(fila), { cuantas: 2, monto: 300000 });
    av = await avisoR();
    ok('F4 · tres personas en total: dos pagan hoy, dos tienen atraso, y Juan está en las dos',
      [av.c.personas, av.c.hoy.personas, av.c.atrasadas.personas, av.c.sin_escribir], [3, 2, 2, 2]);
    ok('F4 · mezclados no se cuenta gente (cualquier número se leería mal): solo la plata. Faltan escribir DOS personas, no tres cuotas',
      [av.cuerpo.startsWith(`Hoy te pagan 2: ${gs(180000)} (`),
        av.cuerpo.endsWith(`). Y hay ${gs(400000)} atrasados. A 2 todavía no les escribiste.`)], [true, true]);
    ok('F4 · un toque en el WhatsApp de Pedro marca sus dos vencidas',
      (await pide('F4 · marcar con la próxima de Pedro', UR, 'marcar_cuota_avisada', { p_cuota: fila.proxima.cuota_id }))?.marcadas, 2);
    av = await avisoR();
    ok('F4 · queda una sola persona sin escribir: Ana', [av.c.sin_escribir, av.cuerpo.endsWith('A 1 todavía no le escribiste.')], [1, true]);
    // Juan paga la atrasada: los atrasados que quedan son OTRA gente, y se cuentan.
    fila = await filaR(juanR);
    await pide('F4 · Juan paga su cuota atrasada', UR, 'cobrar_fiado',
      { p_empresa: ER, p_cliente: juanR, p_monto: 100000, p_metodo: 'efectivo', p_cuenta: null, p_cuota: fila.proxima.cuota_id });
    av = await avisoR();
    ok('F4 · ahora el atrasado es otro (Pedro): «Y 1 atrasado»',
      [av.c.personas - av.c.hoy.personas, av.cuerpo.includes(`). Y 1 atrasado: ${gs(300000)}.`)], [1, true]);

    // F8 (R2.3) y G1 · «Ponerle fecha» a algo ya pagado en parte. Las cuotas
    // suman la línea ENTERA y lo cobrado tapa las primeras: la hoja lo avisa
    // antes de guardar con el número que manda la base (`cubierto`), que es
    // EXACTAMENTE lo que programar_cuotas deja atado a esa deuda.
    const lucasR = await clienteR('Lucas Libreta', '0981 600 004');
    await pide('F8 · Lucas, libreta de 400.000 sin fecha', UR, 'anotar_fiado',
      { p_empresa: ER, p_cliente: lucasR, p_monto: 400000, p_concepto: 'Libreta', p_cuenta: null });
    await pide('F8 · paga 150.000 sueltos', UR, 'cobrar_fiado',
      { p_empresa: ER, p_cliente: lucasR, p_monto: 150000, p_metodo: 'efectivo', p_cuenta: null });
    let fichaF8 = await fichaR(lucasR);
    let lineaF8 = Q.lineasParaFechar(fichaF8.sin_fecha_lineas, fichaF8.sin_fecha)[0];
    ok('F8 · debe 250.000 sin fecha, la línea es de 400.000 y la hoja avisa «Ya cobraste 150.000»',
      [fichaF8.sin_fecha, lineaF8.monto, Q.yaCobradoAlFechar(fichaF8, lineaF8, 0)], [250000, 400000, 150000]);
    rechazado('F8 · repartir solo lo que falta (2 × 125.000) no se puede: las cuotas suman la línea',
      await rpc(UR, 'programar_cuotas', { p_fio: lineaF8.id, p_plan: Q.armarPlan({ total: 250000, cuotas: 2, cada: 'mes', primera: diaR(30), decimales: 0 }) }),
      'suman');
    await pide('F8 · se guarda 2 × 200.000', UR, 'programar_cuotas',
      { p_fio: lineaF8.id, p_plan: Q.armarPlan({ total: lineaF8.monto, cuotas: 2, cada: 'mes', primera: diaR(30), decimales: 0 }) });
    fichaF8 = await fichaR(lucasR);
    ok('F8 · y el aviso era verdad: lo cobrado se descontó de la primera cuota, atado a esa deuda',
      [fichaF8.deudas[0].cuotas.map((q) => q.pendiente), fichaF8.libro.filter((l) => l.tipo === 'cobro').map((l) => [l.monto, l.fio_id === lineaF8.id])],
      [[50000, 200000], [[150000, true]]]);
    await pide('G1 · al día siguiente lleva 100.000 sin fecha', UR, 'anotar_fiado',
      { p_empresa: ER, p_cliente: lucasR, p_monto: 100000, p_concepto: 'Pan', p_cuenta: null });
    fichaF8 = await fichaR(lucasR);
    ok('G1 · la cuota 1 sigue con 50.000 pendientes y lo nuevo es lo sin fecha (antes: 150.000 y 0)',
      [fichaF8.deudas[0].cuotas.map((q) => q.pendiente), fichaF8.sin_fecha, (await filaR(lucasR)).sin_fecha], [[50000, 200000], 100000, 100000]);
    // Con otra deuda en cuotas pendiente, el pago suelto SIGUE siendo de la
    // libreta (se cobró cuando la libreta era lo único sin fecha): la hoja lo
    // dice y la base lo ata a la libreta, no a la TV.
    const rosaR = await clienteR('Rosa Dos', '0981 600 005');
    await pide('F8 · Rosa, TV en una cuota a 5 días', UR, 'anotar_fiado',
      { p_empresa: ER, p_cliente: rosaR, p_monto: 300000, p_concepto: 'TV', p_cuenta: null, p_plan: [{ vence_el: diaR(5), monto: 300000 }] });
    await pide('F8 · y libreta de 400.000 sin fecha', UR, 'anotar_fiado',
      { p_empresa: ER, p_cliente: rosaR, p_monto: 400000, p_concepto: 'Libreta', p_cuenta: null });
    await pide('F8 · paga 150.000 sueltos', UR, 'cobrar_fiado',
      { p_empresa: ER, p_cliente: rosaR, p_monto: 150000, p_metodo: 'efectivo', p_cuenta: null });
    fichaF8 = await fichaR(rosaR);
    lineaF8 = Q.lineasParaFechar(fichaF8.sin_fecha_lineas, fichaF8.sin_fecha)[0];
    ok('G1 · con otra deuda en cuotas pendiente, la hoja también dice lo que ya cobró de la libreta', Q.yaCobradoAlFechar(fichaF8, lineaF8, 0), 150000);
    await pide('F8 · se le pone fecha a la libreta', UR, 'programar_cuotas',
      { p_fio: lineaF8.id, p_plan: Q.armarPlan({ total: lineaF8.monto, cuotas: 2, cada: 'mes', primera: diaR(30), decimales: 0 }) });
    fichaF8 = await fichaR(rosaR);
    ok('G1 · y en efecto: los 150.000 quedaron en la libreta (su primera cuota), y la TV sigue entera',
      Object.fromEntries(fichaF8.deudas.map((d) => [d.concepto, d.cuotas.map((q) => q.pendiente)])), { TV: [300000], Libreta: [50000, 200000] });
    // Con varias líneas sin fecha el cartel sirve para CADA una, y el botón
    // va solo en las que todavía tienen algo sin cubrir.
    const ninaR = await clienteR('Nina Varias', '0981 600 016');
    for (const [monto, concepto] of [[100000, 'Enero'], [200000, 'Febrero'], [300000, 'Marzo']]) {
      await pausa();
      await pide(`G1 · Nina, ${concepto} sin fecha`, UR, 'anotar_fiado', { p_empresa: ER, p_cliente: ninaR, p_monto: monto, p_concepto: concepto, p_cuenta: null });
    }
    await pide('G1 · paga 150.000 sueltos', UR, 'cobrar_fiado', { p_empresa: ER, p_cliente: ninaR, p_monto: 150000, p_metodo: 'efectivo', p_cuenta: null });
    fichaF8 = await fichaR(ninaR);
    const botones = Q.lineasParaFechar(fichaF8.sin_fecha_lineas, fichaF8.sin_fecha);
    ok('G1 · tres líneas y un pago de 150.000: Enero ya está pagada (sin botón); Febrero avisa 50.000 y Marzo nada',
      [fichaF8.sin_fecha_lineas.map((l) => [l.concepto, l.cubierto]), botones.map((l) => [l.concepto, Q.yaCobradoAlFechar(fichaF8, l, 0)])],
      [[['Enero', 100000], ['Febrero', 50000], ['Marzo', 0]], [['Febrero', 50000], ['Marzo', 0]]]);
    const febrero = botones.find((l) => l.concepto === 'Febrero');
    await pide('G1 · se le pone fecha a Febrero', UR, 'programar_cuotas',
      { p_fio: febrero.id, p_plan: Q.armarPlan({ total: febrero.monto, cuotas: 2, cada: 'mes', primera: diaR(30), decimales: 0 }) });
    fichaF8 = await fichaR(ninaR);
    ok('G1 · quedaron atados a Febrero sus 50.000, y los 100.000 de Enero siguen sueltos cubriendo Enero',
      [fichaF8.deudas.map((d) => [d.concepto, d.pagado, d.cuotas.map((q) => q.pendiente)]), fichaF8.sin_fecha,
        fichaF8.sin_fecha_lineas.map((l) => [l.concepto, l.cubierto]),
        fichaF8.libro.filter((l) => l.tipo === 'cobro').map((l) => [l.monto, l.fio_id === febrero.id]).sort((a, b) => a[0] - b[0])],
      [[['Febrero', 50000, [50000, 100000]]], 300000, [['Enero', 100000], ['Marzo', 0]], [[50000, true], [100000, false]]]);

    // F1 (R3.1) · «Todo» desde la pantalla: la misma llamada de siempre (sin
    // p_cuota), y lo que la pantalla lee de la respuesta sigue estando.
    const tereR = await clienteR('Tere Todo', '0981 600 006');
    await pide('F1 · Tere, TV en 3 cuotas ya vencidas', UR, 'anotar_fiado',
      { p_empresa: ER, p_cliente: tereR, p_monto: 300000, p_concepto: 'TV', p_cuenta: null,
        p_plan: [{ vence_el: diaR(-67), monto: 100000 }, { vence_el: diaR(-37), monto: 100000 }, { vence_el: diaR(-8), monto: 100000 }] });
    await pide('F1 · y 100.000 de libreta', UR, 'anotar_fiado',
      { p_empresa: ER, p_cliente: tereR, p_monto: 100000, p_concepto: 'Libreta', p_cuenta: null });
    const todo = Q.opcionesDeCobro(await fichaR(tereR)).opciones.find((o) => o.tipo === 'todo');
    const cobroTodo = await pide('F1 · cobrar «Todo», como lo manda la pantalla', UR, 'cobrar_fiado',
      { p_empresa: ER, p_cliente: tereR, p_monto: todo.propuesto, p_metodo: 'efectivo', p_cuenta: null });
    ok('F1 · la respuesta conserva lo que lee la pantalla (`saldo`, `deuda`) y suma `lineas`',
      [claves(cobroTodo), cobroTodo.saldo, cobroTodo.deuda, cobroTodo.lineas], [['deuda', 'id', 'lineas', 'saldo', 'sin_fecha'], 0, null, 2]);
    await pide('F1 · vuelve a llevar pan, sin fecha', UR, 'anotar_fiado',
      { p_empresa: ER, p_cliente: tereR, p_monto: 50000, p_concepto: 'Pan', p_cuenta: null });
    fila = await filaR(tereR);
    const fichaTere = await fichaR(tereR);
    ok('F1 · la fila no la muestra atrasada: debe el pan, sin fecha, y la TV sigue pagada',
      [fila.saldo, fila.sin_fecha, fila.atrasadas, fila.grupo, fila.proxima, fichaTere.deudas.map((d) => d.falta)],
      [50000, 50000, 0, 'sin_fecha', null, [0]]);
    ok('F1 · y el libro de la ficha dice de qué fue cada parte del pago',
      fichaTere.libro.filter((l) => l.tipo === 'cobro').map((l) => [l.monto, l.fio_id ? 'TV' : '(suelto)']).sort((a, b) => a[0] - b[0]),
      [[100000, '(suelto)'], [300000, 'TV']]);
  }

  // Los ejemplos reales, para el contrato que comparan las pantallas.
  if (process.env.FIADO_EJEMPLOS) {
    fs.writeFileSync(process.env.FIADO_EJEMPLOS, JSON.stringify(EJEMPLOS, null, 2));
    console.log(`\n  · ejemplos escritos en ${process.env.FIADO_EJEMPLOS}`);
  }

  console.log(`\n${'═'.repeat(62)}`);
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL FIADO CON FECHAS FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DEL FIADO CON FECHAS PASARON`);
})().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message);
  console.error(e);
  process.exit(1);
});
