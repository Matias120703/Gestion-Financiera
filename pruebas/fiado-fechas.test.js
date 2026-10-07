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
    const fotoDe = async () => ({
      resumen: await r('resumen'),
      cuotas: await T.filas('select fio_id, numero, vence_el::text, monto::text, avisado_el from public.fiado_cuotas order by fio_id, numero'),
      libro: await T.filas('select id, tipo, monto::text, fio_id from public.fiado order by created_at, id'),
      prefs: await r('misPreferencias'),
    });
    const antesDeRepetir = await fotoDe();
    let segunda = null;
    try { await H.aplicarMigracion(db, '127'); } catch (e) { segunda = e.message; }
    ok('la segunda aplicación no falla', segunda, null);
    ok('y no cambia ni un dato: resumen, cuotas, libro y preferencias', await fotoDe(), antesDeRepetir);
    ok('cada función sigue existiendo una sola vez', await versiones(), FUNCIONES.map(() => 1));
    ok('un solo candado, una sola policy, una sola restricción y los tres índices',
      [
        await T.n("select count(*)::int n from pg_trigger where tgrelid = 'public.fiado_cuotas'::regclass and not tgisinternal"),
        await T.n("select count(*)::int n from pg_policies where schemaname='public' and tablename='fiado_cuotas'"),
        await T.n("select count(*)::int n from pg_constraint where conname = 'fiado_fio_solo_en_cobros'"),
        await T.n("select count(*)::int n from pg_indexes where schemaname='public' and tablename='fiado_cuotas' and indexname like 'fiado_cuotas_%_idx'"),
        await T.n("select count(*)::int n from pg_indexes where schemaname='public' and indexname = 'fiado_fio_idx'"),
      ], [1, 1, 1, 3, 1]);
    aceptado('y después sigue cobrando como siempre', await llamar('cobrarPantalla', 1000));
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

    const PASOS = ['fiar', 'fiar con plan', 'programar', 'cobrar suelto', 'cobrar suelto', 'cobrar cuota', 'cobrar cuota', 'cobrar cuota justa',
      'borrar pago', 'quitar', 'rearmar', 'mover', 'borrar deuda', 'cobrar de más'];
    const hechos = {};
    let conProblemas = 0;
    // Pasos en los que lo suelto superó a lo sin fecha y tapó cuotas: si la
    // secuencia nunca pasa por ahí, la segunda pasada de la regla no se probó.
    let conDerrame = 0;
    for (let paso = 1; paso <= 60; paso++) {
      // Los primeros pasos arman algo; después, al azar.
      let que = paso === 1 ? 'fiar' : paso === 2 ? 'fiar con plan' : elegir(PASOS);
      let res = null;
      const estado = await cuotasDe(c);
      const pendientes = estado.filter((q) => q.pendiente > 0);
      const s = await saldo(c);

      if (que === 'fiar') {
        res = await como(U, "select public.anotar_fiado($1,$2,$3,'Libreta')", [E, c, entre(10, 200) * 1000]);
      } else if (que === 'fiar con plan') {
        const monto = entre(10, 300) * 1000;
        res = await como(U, 'select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_concepto => $4, p_plan => $5::jsonb)',
          [E, c, monto, `Compra ${paso}`, plan(planAzar(monto))]);
      } else if (que === 'programar') {
        const l = await lineas(false);
        if (l.length === 0) que = 'nada (sin líneas sin fecha)';
        else { const x = elegir(l); res = await programar(U, { fio: x.id, plan: plan(planAzar(x.monto)) }); }
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
        else res = await como(U, 'select public.mover_cuota($1,$2)', [elegir(estado).cuota_id, dia(entre(-30, 120))]);
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
      const mal = await loQueNoCierra(db, c);
      // Las tres pantallas dicen lo mismo que el libro.
      const s2 = await saldo(c);
      const d = await detalle(c);
      const partesDelDetalle = d.sin_fecha + d.deudas.reduce((a, x) => a + x.falta, 0);
      if (Math.abs(partesDelDetalle - Math.max(s2, 0)) > 0.001 || d.saldo !== s2) mal.push('detalle_fiado');
      const fila = await enResumen(c);
      if (s2 > 0 && (!fila || Math.abs(fila.sin_fecha + fila.con_fecha - s2) > 0.001 || fila.saldo !== s2)) mal.push('resumen_fiado');
      if (s2 <= 0 && fila) mal.push('resumen_fiado lista a quien no debe');
      if (mal.length > 0) conProblemas++;
      if ((await filas('select (p.u > p.f0) d from public.partes_fiado($1) p', [c]))[0].d && d.deudas.length > 0) conDerrame++;
      ok(`paso ${String(paso).padStart(2)} · ${clave.padEnd(34)} saldo ${String(s2).padStart(7)} = sin fecha ${String(d.sin_fecha).padStart(7)} + cuotas ${String(d.deudas.reduce((a, x) => a + x.falta, 0)).padStart(7)}`, mal, []);
    }
    console.log(`  · lo que hizo la secuencia: ${JSON.stringify(hechos)}`);
    ok('los 60 pasos cerraron', conProblemas, 0);
    console.log(`  · pasos con derrame (pagos sueltos tapando cuotas): ${conDerrame}`);
    ok('y en varios de ellos había pagos sueltos tapando cuotas (la segunda pasada de la regla)', conDerrame >= 5, true);
    ok('la secuencia pasó por todo: fiar, programar, cobrar con y sin cuota, borrar, quitar, rearmar y mover',
      ['fiar', 'fiar con plan', 'programar', 'cobrar suelto', 'cobrar cuota', 'cobrar cuota justa', 'borrar pago', 'quitar', 'rearmar', 'mover']
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
  grupo('7 · Un pago suelto: primero lo sin fecha, lo que sobra tapa cuotas (derrame)');
  // ===================================================================
  {
    const c = await cliente('Carlos Díaz');
    await fiar(c, 100, 'Libreta');
    const fio = await fiar(c, 200, 'Con cuotas', [[10, 100], [40, 100]]);
    ok('debe 300: 100 sin fecha y 200 en cuotas', [await saldo(c), await sinFecha(c), await pend(c)], [300, 100, [100, 100]]);
    const r = await cobrar(c, 150);
    aceptado('pago suelto de 150 («Todo» o por voz, sin elegir)', r);
    guardarEjemplo('cobrar_fiado (sin p_cuota)', r.valor?.rows[0].j);
    ok('lo sin fecha quedó en 0 y la cuota 1 con 50 pagados', [await sinFecha(c), (await cuotasDe(c)).map((q) => [q.pagado, q.pendiente])], [0, [[50, 50], [0, 100]]]);
    ok('el pago suelto no apunta a ninguna deuda', r.valor.rows[0].j.deuda, null);
    await cierra('derrame', c);
    rechazado('contra la cuota 1, más de lo que le falta a la deuda (150)', await cobrar(c, 151, await cuotaN(fio, 1)), 'De esa deuda faltan 150');
    aceptado('«Todo»: los 150 que quedan, sueltos', await cobrar(c, 150));
    ok('todo en 0', [await saldo(c), await sinFecha(c), await pend(c)], [0, 0, [0, 0]]);
    await cierra('todo pagado', c);

    // El ejemplo del diseño: 100/100/100 con 150 de la deuda y 30 de derrame.
    const d = await cliente('Diseño Ejemplo');
    await fiar(d, 50, 'Libreta');
    const f2 = await fiar(d, 300, 'Tres cuotas', [[10, 100], [20, 100], [30, 100]]);
    await cobrar(d, 150, await cuotaN(f2, 1));
    ok('con 150 de esa deuda: 0 / 50 / 100', await pend(d), [0, 50, 100]);
    await cobrar(d, 80);
    ok('y 80 sueltos (50 a la libreta, 30 de derrame): 0 / 20 / 100', [await sinFecha(d), await pend(d)], [0, [0, 20, 100]]);
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
      await como(U, 'select public.borrar_linea_fiado($1)', [fio2]), 'Esa deuda tiene cuotas ya cobradas. Borrá primero esos pagos');
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
    ok('guarda el día de hoy del negocio', [m1.valor.rows[0].j, (await cuotasDe(c))[0].avisado_el], [{ avisado_el: hoy }, hoy]);
    ok('desmarcar', (await J(U, 'select public.marcar_cuota_avisada($1, false) j', [c1])), { avisado_el: null });
    await val(U, 'select public.marcar_cuota_avisada($1)', [c1]);

    const mv = await como(U, 'select public.mover_cuota($1,$2) j', [c1, dia(100)]);
    aceptado('correr la cuota 1 para después de la 3', mv);
    guardarEjemplo('mover_cuota', mv.valor?.rows[0].j);
    ok('devuelve la cuota con su fecha nueva', mv.valor.rows[0].j, { cuota: { id: c1, numero: 1, vence_el: dia(100) } });
    ok('cambió la fecha y se borró la marca: hay que volver a avisar',
      (await filas('select vence_el::text, avisado_el from public.fiado_cuotas where id=$1', [c1]))[0], { vence_el: dia(100), avisado_el: null });
    await cobrar(c, 100000, c2);
    ok('el pago tapa por NÚMERO, no por fecha: se pagó la 1 aunque venza última',
      (await cuotasDe(c)).map((x) => [x.numero, x.vence_el, x.pendiente]), [[2, dia(40), 100000], [3, dia(70), 100000], [1, dia(100), 0]]);
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
    ok('el pago de la venta quedó suelto (fio_id null); el de lo anotado a mano sigue atado',
      (await filas("select monto::int, fio_id from public.fiado where empresa_id=$1 and tipo='cobro' order by monto desc", [V.empresaId])),
      [{ monto: 100000, fio_id: null }, { monto: 10000, fio_id: mano }]);
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
    await vencer(db, PG.empresaId);
    ok('una en Pro y la otra en Gratis',
      [(await filas('select public.es_gratis_personal($1) g', [PP.empresaId]))[0].g, (await filas('select public.es_gratis_personal($1) g', [PG.empresaId]))[0].g], [false, true]);
    rechazado('Gratis: ponerle fechas es del Pro', await programar(PG.uid, { fio: suelto, plan: plan([[10, 30000]]) }), ES_DE_PAGO);
    rechazado('Gratis: correr una fecha', await como(PG.uid, 'select public.mover_cuota($1,$2)', [await cuotaN(prestamo, 1), dia(3)]), ES_DE_PAGO);
    rechazado('Gratis: cobrar una cuota', await cobrar(primo, 1000, await cuotaN(prestamo, 1), PG.uid, PG.empresaId), ES_DE_PAGO);
    ok('Gratis: y no dice que Orden se cerró',
      /seguir usando Orden/i.test((await programar(PG.uid, { fio: suelto, plan: plan([[10, 30000]]) })).error), false);
    aceptado('Gratis: sacar las fechas anda (DELETE)', await como(PG.uid, 'select public.quitar_cuotas($1)', [suelto]));

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
    ok('lo sin fecha, con su línea', [d.sin_fecha, d.sin_fecha_lineas.map((l) => [l.concepto, l.monto, Object.keys(l).sort().join()])],
      [400000, [['Libreta', 400000, 'concepto,fecha,id,monto,venta_id']]]);
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
      ['atrasadas', 'destinatarios', 'empresa_id', 'fecha', 'hoy', 'moneda', 'nombre', 'sin_escribir', 'tipo_cuenta'].sort());
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
    ok('con otra de hace 7 días entra, y la frase cuenta las dos atrasadas',
      [s2?.hoy, s2?.atrasadas], [{ cuantas: 0, personas: 0, monto: 0, nombres: [] }, { cuantas: 2, personas: 2, monto: 30000, nombres: ['Atrasado', 'Atrasado'], dias_max: 7 }]);

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
        ['concepto', 'fecha', 'id', 'monto', 'venta_id'],
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
    ok('el pago suelto de 50.000 queda tapando esa fecha (derrame) y todo sigue sumando',
      [(await fichaDe(juan)).sin_fecha, todoIgual(await sumaLoQueSeVe(juan))], [0, true]);
    ok('quitar_cuotas devuelve el saldo, que no cambió',
      (await pide('Fiado: quitar las cuotas', UC, 'quitar_cuotas', { p_fio: paraFechar[0].id }))?.saldo, 510000);
    const pagoSuelto = (await fichaDe(juan)).libro.find((l) => l.tipo === 'cobro' && !l.fio_id);
    ok('borrar_linea_fiado devuelve el saldo',
      (await pide('Fiado: borrar un pago con la ✕', UC, 'borrar_linea_fiado', { p_linea: pagoSuelto.id }))?.saldo, 560000);
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
      [['atrasadas', 'destinatarios', 'empresa_id', 'fecha', 'hoy', 'moneda', 'nombre', 'sin_escribir', 'tipo_cuenta'],
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
