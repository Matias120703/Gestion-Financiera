/**
 * La billetera en otras monedas (migración 131, 08/10/2026).
 *
 * Matías: «Tengo una cuenta bancaria en dólares con 10 mil dólares: ¿cómo la
 * guardo en mi billetera, si solo me aparece la opción de cargar en
 * guaraníes? También en reales.»
 *
 * La 131 toca `saldo_cuenta_dinero` y el disparador `anotar_en_su_cuenta`,
 * por donde pasa TODA la plata de TODAS las cuentas. Por eso, en orden de
 * importancia:
 *
 *   0. PARA QUIEN NO USA OTRA MONEDA NO CAMBIA ABSOLUTAMENTE NADA. Una base
 *      hasta la 130 se carga con cuentas de todos los rubros y plata movida
 *      por todos los caminos que existen hoy. Se clona: dos gemelas
 *      idénticas. Una se queda en la 130; a la otra se le aplica la 131 (con
 *      los privilegios por defecto de Supabase puestos antes).
 *        a. Todo lo que lee el código publicado y todas las tablas dan lo
 *           mismo, CARÁCTER POR CARÁCTER, antes y después de aplicarla, y
 *           aplicándola dos veces más.
 *        b. Del catálogo cambia lo que la 131 dice que cambia, y nada más.
 *        c. Después las dos gemelas siguen trabajando con el MISMO guion (el
 *           código publicado hablándole a la base nueva): cada paso contesta
 *           lo mismo y al final vuelven a dar lo mismo.
 *   1. Guardar, pasar y pagar con una cuenta en otra moneda, con números.
 *   2. Lo que todavía no se puede (Vender, Fiado, Deudas, Reparto…) se
 *      rechaza entero, con un mensaje claro, y no deja nada a medias.
 *   3. Es simétrico: un negocio en dólares con una caja en guaraníes.
 *   4. Nunca se suman monedas distintas.
 *   5. Candados (vencido, Gratis), permisos, idempotencia, cero barras
 *      invertidas, y la copia fiel de cada función que se vuelve a definir.
 */
const fs = require('fs');
const path = require('path');
const H = require('./ayuda-db.js');

const RAIZ = path.join(__dirname, '..');
const BARRA = String.fromCharCode(92);
// CRLF normalizado: en un worktree de Windows los fuentes llegan con \r\n.
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');

const MIGRACIONES = H.migraciones();
const ARCHIVO_131 = MIGRACIONES.find((f) => f.startsWith('131'));
/** Lo que hay antes de la 131: lo que está publicado. */
const ANTERIORES = MIGRACIONES.filter((f) => f < '131');
const ULTIMA_ANTERIOR = ANTERIORES[ANTERIORES.length - 1].slice(0, 3);
/** El SQL que saca la 131 de la base. Fuera de migrations a propósito: lo que hay ahí va a parar a schema.sql. */
const ARCHIVO_ATRAS = 'supabase/vuelta-atras/131_vuelta_atras.sql';

let fallos = 0;
let corridas = 0;

function grupo(nombre) {
  console.log(`\n── ${nombre} ${'─'.repeat(Math.max(0, 58 - nombre.length))}`);
}

/** Las claves de un objeto, en orden: para comparar sin depender del orden en que llegan. */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
    return o;
  }
  return v;
}

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(canon(real));
  const b = JSON.stringify(canon(esperado));
  if (a !== b) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`);
  } else {
    console.log(`  ✓ ${nombre} → ${a.length > 130 ? a.slice(0, 127) + '...' : a}`);
  }
}

function rechazado(nombre, resultado, fragmento) {
  corridas++;
  if (resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      NO fue rechazada (devolvió ${JSON.stringify(resultado.valor && resultado.valor.rows)})`);
    return;
  }
  if (fragmento && !resultado.error.includes(fragmento)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      rechazada por otro motivo: ${resultado.error}\n      se esperaba: ${fragmento}`);
    return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${resultado.error.slice(0, 96)}`);
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

// Los mensajes nuevos de la 131 (están, con su portugués, en src/lib/mensajes-base.ts).
const FALTA_IMPORTE = 'Esa cuenta está en otra moneda: falta cuánto entró o salió en ella.';
const ELEGI_PROPIA = 'Esa cuenta está en otra moneda. Elegí una en tu moneda principal.';
const SOLO_ADMIN = 'Solo quien administra puede usar una cuenta en otra moneda.';
const NO_SE_CAMBIA = 'La moneda de una cuenta no se cambia. Creá otra cuenta.';
const DOS_MONEDAS = 'Son dos monedas: escribí cuánto salió y cuánto entró.';
const UN_SOLO_MONTO = 'Las dos cuentas están en la misma moneda: va un solo monto.';
const CAMBIO_IMPOSIBLE = 'Revisá los montos: ese cambio no puede ser.';
const QUITALAS = 'Tenés cuentas en otra moneda. Quitalas antes de cambiar tu moneda principal.';
const ES_TU_MONEDA = 'Esa es tu moneda: no necesita cotización.';
const NO_EXISTE_PASE = 'Esa transferencia no existe.';
const CUENTA_QUITADA = 'Una de las dos cuentas ya no está en tu billetera: ese pase no se puede deshacer.';
// Los de siempre.
const NO_CONOCEMOS = 'No conocemos esa moneda.';
const NO_EXISTE = 'Esa cuenta no existe.';
const MAYOR_QUE_CERO = 'El monto tiene que ser mayor que cero.';
const CANDADO = 'Se te terminó la prueba';
const ES_DEL_PRO = 'Eso es del plan Pro';
const SOLO_DUENO = 'Solo el dueño de la cuenta puede';

/** Lo que la 131 les suma a las lecturas de siempre: se le resta antes de comparar. */
const CLAVES_NUEVAS = {
  billetera: ['moneda', 'cuentas_otras', 'totales_otras', 'cotizaciones'],
  resumen_personal: ['en_otras_monedas'],
};

const NUEVAS = ['moneda_ajustes_cuenta', 'guardar_cotizacion_moneda', 'deshacer_transferencia', 'transferencias_de_cuenta'];
/** Las que la 131 vuelve a definir, en el orden del archivo, y de qué migración sale la versión anterior. */
const RECOPIADAS = [
  ['saldo_cuenta_dinero', '074'], ['anotar_en_su_cuenta', '118'], ['guardar_cuenta_dinero', '086'],
  ['transferir_entre_cuentas', '074'], ['ajustar_saldo_cuenta', '074'], ['billetera', '086'],
  ['cuentas_para_elegir', '086'], ['resumen_personal', '085'], ['moneda_no_se_reetiqueta', '051'],
];

// El insert de PantallaGastos.tsx y de la captura, como lo manda el código
// publicado: sin `monto_cuenta` (no existe para él).
const MOV = `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, descuento,
    monto, costo_total, metodo_pago, contraparte, notas, cuenta_id, origen)
  values ($1,$2,public.hoy_empresa($1),$3,$4,$5,0,$5,0,$6,'','',$7,'manual') returning id`;
// El mismo, con una campaña (lote) y el id del reparto entre campañas (100).
const MOV_LOTE = `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, descuento,
    monto, costo_total, metodo_pago, contraparte, notas, cuenta_id, origen, lote_id, reparto_id)
  values ($1,$2,public.hoy_empresa($1),$3,$4,$5,0,$5,0,$6,'','',$7,'manual',$8,$9) returning id`;
// El del código NUEVO: Gastos y Otros ingresos mandan cuánto se movió la cuenta.
const MOV_CUENTA = `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, descuento,
    monto, costo_total, metodo_pago, contraparte, notas, cuenta_id, origen, monto_cuenta)
  values ($1,$2,public.hoy_empresa($1),$3,$4,$5,0,$5,0,$6,'','',$7,'manual',$8) returning id`;

// ─────────────────────────────────────────────────────────────────────────
// Las ayudas, sobre una base
// ─────────────────────────────────────────────────────────────────────────
function herramientas(db) {
  const intento = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const val = async (uid, sql, args = []) => {
    const r = await intento(uid, sql, args);
    if (!r.ok) throw new Error(`${sql.replace(/\s+/g, ' ').slice(0, 160)} → ${r.error}`);
    return r.valor.rows[0];
  };
  const J = async (uid, sql, args = []) => (await val(uid, sql, args)).j;
  const filas = async (sql, args = []) => (await db.query(sql, args)).rows;
  const uno = async (sql, args = []) => (await filas(sql, args))[0];
  const n = async (sql, args = []) => Number((await uno(sql, args)).n);
  /** Como el servidor: rol service_role, sin sesión. */
  const servicio = (sql, args = []) => H.intentarComo(db, 'service_role', null, () => db.query(sql, args));
  /** Sin sesión y sin rol: el sistema (el planificador, una función que anota sola). */
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
  const saldo = async (cuenta) => Number((await uno('select public.saldo_cuenta_dinero($1) s', [cuenta])).s);
  const billetera = (C) => J(C.uid, 'select public.billetera($1) j', [C.empresaId]);
  const hoyDe = async (empresa) => (await uno('select public.hoy_empresa($1)::text d', [empresa])).d;
  // Receta de solo-lectura.test.js: la prueba termina sola.
  const vencer = (empresa) => db.query(
    `update public.suscripciones
        set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
      where empresa_id = $1`, [empresa]);
  return { db, intento, val, J, filas, uno, n, servicio, sinSesion, saldo, billetera, hoyDe, vencer };
}

// ─────────────────────────────────────────────────────────────────────────
// LA FOTO: todo lo que lee el código publicado, y todas las tablas.
//
// Qué se lee sale del catálogo de la base de ANTES de la 131 (`planoDe`):
// toda función que no escribe, que una persona con sesión puede llamar y
// que recibe una cuenta sola, con un día o con un período. Son las del
// panel, la billetera, los reportes, el cierre, el Excel y la agenda: no hay
// que acordarse de sumar la próxima.
// ─────────────────────────────────────────────────────────────────────────
async function planoDe(db) {
  const lectoras = (await db.query(
    `select p.proname as nombre, oidvectortypes(p.proargtypes) as args
       from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.provolatile in ('s', 'i')
        and oidvectortypes(p.proargtypes) in ('uuid', 'uuid, date', 'uuid, date, date')
        and has_function_privilege('authenticated', p.oid, 'execute')
      order by 1, 2`)).rows;
  const tablas = new Map();
  for (const c of (await db.query(
    `select table_name as t, column_name as c from information_schema.columns
      where table_schema = 'public' order by table_name, ordinal_position`)).rows) {
    if (!tablas.has(c.t)) tablas.set(c.t, []);
    tablas.get(c.t).push(c.c);
  }
  return { lectoras, tablas };
}

async function foto(db, cuentas, plano) {
  const f = new Map();
  const con131 = (await db.query(
    `select count(*)::int n from information_schema.columns
      where table_schema = 'public' and table_name = 'movimientos' and column_name = 'monto_cuenta'`)).rows[0].n > 0;
  const hoy = (await db.query(`select (now() at time zone 'America/Asuncion')::date::text d`)).rows[0].d;
  const rango = (await db.query('select ($1::date - 60)::text d, ($1::date + 60)::text h', [hoy])).rows[0];

  const llamada = (L) => {
    const args = L.args === 'uuid' ? '$1' : L.args === 'uuid, date' ? '$1, $2::date' : '$1, $2::date, $3::date';
    const quitar = con131 ? CLAVES_NUEVAS[L.nombre] : null;
    return quitar
      ? `select (public.${L.nombre}(${args}) - '{${quitar.join(',')}}'::text[])::text t`
      : `select public.${L.nombre}(${args})::text t`;
  };
  const argumentos = (L, C) => (L.args === 'uuid' ? [C.empresaId] : L.args === 'uuid, date' ? [C.empresaId, hoy] : [C.empresaId, rango.d, rango.h]);

  for (const C of cuentas) {
    // Una transacción por cuenta, con la sesión de su dueño; cada lectura
    // en su punto de retorno, para que un «no» no tumbe las demás.
    await db.exec('begin');
    try {
      await db.exec('set local role authenticated');
      await db.query(`select set_config('orden.uid', $1, true)`, [C.uid]);
      const leerUna = async (clave, sql, args) => {
        await db.exec('savepoint lectura');
        try {
          f.set(clave, [(await db.query(sql, args)).rows[0].t]);
          await db.exec('release savepoint lectura');
        } catch (e) {
          await db.exec('rollback to savepoint lectura');
          f.set(clave, [`NO: ${e.message ?? e}`]);
        }
      };
      for (const L of plano.lectoras) await leerUna(`${L.nombre}(${L.args}) · ${C.clave}`, llamada(L), argumentos(L, C));
      // El historial, con el nombre de la cuenta de cada movimiento (106).
      await leerUna(`pagina_movimientos · ${C.clave}`,
        'select public.pagina_movimientos(p_empresa => $1, p_desde => $2::date, p_hasta => $3::date, p_tamano => 500)::text t',
        [C.empresaId, rango.d, rango.h]);
      // «Plata sin cuenta» (083): lo que la billetera ofrece asignar.
      await leerUna(`movimientos_sin_cuenta · ${C.clave}`, 'select public.movimientos_sin_cuenta(p_empresa => $1)::text t', [C.empresaId]);
      await db.exec('commit');
    } catch (e) {
      try { await db.exec('rollback'); } catch { /* ya abortada */ }
      throw e;
    }
  }

  // El saldo de CADA cuenta de dinero: es la lectura de control que se va a
  // repetir en producción antes y después de aplicar.
  f.set('saldo_cuenta_dinero · todas las cuentas', (await db.query(
    `select c.id || ' = ' || public.saldo_cuenta_dinero(c.id)::text as t from public.cuentas_dinero c order by c.id`)).rows.map((x) => x.t));
  // Lo que arma los avisos del día, sin sesión.
  f.set('avisos_del_dia() · el planificador', [(await db.query('select public.avisos_del_dia()::text t')).rows[0].t]);

  // Las tablas, fila por fila, con las columnas que tenían antes de la 131.
  for (const [tabla, columnas] of plano.tablas) {
    const ahora = (await db.query(
      `select column_name as c from information_schema.columns where table_schema = 'public' and table_name = $1`, [tabla])).rows.map((x) => x.c);
    const nuevas = ahora.filter((c) => !columnas.includes(c));
    f.set(`tabla ${tabla}`, (await db.query(
      `select (to_jsonb(t) - $1::text[])::text as f from public."${tabla}" t`, [nuevas])).rows.map((x) => x.f));
  }
  return f;
}

const INSTANTE = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}(?::?\d{2})?|Z)?/g;
/** Entre dos bases distintas, la hora exacta de cada cosa no puede coincidir: se tapa. */
const sinInstantes = (s) => String(s).replace(INSTANTE, '‹instante›');

/** Dónde empiezan a ser distintos dos textos. */
function primeraDiferencia(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const desde = Math.max(0, i - 60);
  return `en el carácter ${i}: «${a.slice(desde, i + 60)}» ≠ «${b.slice(desde, i + 60)}»`;
}

/**
 * Compara dos fotos. Devuelve cuántos textos miró y la lista de los que no
 * coinciden. `tapar` se aplica fila por fila (y las filas se ordenan después).
 */
function diferencias(antes, despues, tapar = (x) => x) {
  const distintas = [];
  let textos = 0;
  for (const k of new Set([...antes.keys(), ...despues.keys()])) {
    const a = antes.has(k) ? antes.get(k).map(tapar).sort().join('\n') : '‹no estaba›';
    const d = despues.has(k) ? despues.get(k).map(tapar).sort().join('\n') : '‹no está›';
    textos += antes.has(k) ? antes.get(k).length : 0;
    if (a !== d) distintas.push(`${k}: ${primeraDiferencia(a, d)}`);
  }
  return { textos, distintas };
}

/** Las comprobaciones de una comparación de fotos: las que nombra el encargo, una por una, y el resto junto. */
function mismasFotos(titulo, antes, despues, tapar) {
  const { distintas } = diferencias(antes, despues, tapar);
  const de = (prefijo) => distintas.filter((d) => d.startsWith(prefijo));
  const claves = [...antes.keys()];
  const cuantas = (prefijo) => claves.filter((k) => k.startsWith(prefijo)).length;
  const filasDe = (prefijo) => claves.filter((k) => k.startsWith(prefijo)).reduce((s, k) => s + antes.get(k).length, 0);
  const NOMBRADAS = [
    ['billetera(uuid)', 'billetera()'],
    ['cuentas_para_elegir(uuid)', 'cuentas_para_elegir()'],
    ['resumen_personal(uuid)', 'resumen_personal(): el disponible'],
    ['resumen_financiero(', 'resumen_financiero()'],
    ['cierre_del_dia(', 'cierre_del_dia()'],
    ['pagina_movimientos', 'el historial (pagina_movimientos)'],
  ];
  for (const [prefijo, nombre] of NOMBRADAS) {
    ok(`${titulo} · ${nombre} de las ${cuantas(prefijo)} cuentas`, de(prefijo), []);
  }
  ok(`${titulo} · saldo_cuenta_dinero de las ${filasDe('saldo_cuenta_dinero')} cuentas de dinero`, de('saldo_cuenta_dinero'), []);
  const resto = distintas.filter((d) => !d.startsWith('tabla ') && !d.startsWith('saldo_cuenta_dinero')
    && !NOMBRADAS.some(([p]) => d.startsWith(p)));
  const lecturas = claves.filter((k) => !k.startsWith('tabla ')).length;
  ok(`${titulo} · y el resto de lo que se lee (panel, reportes, fiado, deudas, agenda, avisos…): ${lecturas} lecturas en total`, resto, []);
  ok(`${titulo} · las ${cuantas('tabla ')} tablas, fila por fila (${filasDe('tabla ')} filas)`, de('tabla '), []);
}

/** Cada función, disparador, restricción, política, columna y permiso de `public`. */
async function catalogoDe(db) {
  const mapa = async (sql) => new Map((await db.query(sql)).rows.map((r) => [r.k, r.v]));
  return {
    funciones: await mapa(
      `select p.oid::regprocedure::text as k,
              jsonb_build_object('argumentos', pg_get_function_arguments(p.oid), 'devuelve', pg_get_function_result(p.oid),
                'definer', p.prosecdef, 'volatil', p.provolatile, 'config', coalesce(p.proconfig::text, ''),
                'anon', has_function_privilege('anon', p.oid, 'execute'),
                'sesion', has_function_privilege('authenticated', p.oid, 'execute'),
                'servicio', has_function_privilege('service_role', p.oid, 'execute'),
                'cuerpo', md5(p.prosrc))::text as v
         from pg_proc p where p.pronamespace = 'public'::regnamespace`),
    disparadores: await mapa(
      `select c.relname || '.' || t.tgname as k, pg_get_triggerdef(t.oid) as v
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where c.relnamespace = 'public'::regnamespace and not t.tgisinternal`),
    restricciones: await mapa(
      `select c.relname || '.' || k.conname as k, pg_get_constraintdef(k.oid) as v
         from pg_constraint k join pg_class c on c.oid = k.conrelid
        where c.relnamespace = 'public'::regnamespace and k.contype in ('c', 'f', 'p', 'u', 'x')`),
    politicas: await mapa(
      `select tablename || '.' || policyname as k,
              cmd || ' · ' || coalesce(qual, '') || ' · ' || coalesce(with_check, '') || ' · ' || roles::text as v
         from pg_policies where schemaname = 'public'`),
    columnas: await mapa(
      `select table_name || '.' || column_name as k,
              data_type || ' · ' || coalesce(column_default, '') || ' · ' || is_nullable as v
         from information_schema.columns where table_schema = 'public'`),
    indices: await mapa(
      `select tablename || '.' || indexname as k, indexdef as v from pg_indexes where schemaname = 'public'`),
    permisos: await mapa(
      `select r.rol || ' · ' || c.table_name || '.' || c.column_name as k,
              concat_ws(',',
                case when has_column_privilege(r.rol, format('public.%I', c.table_name), c.column_name, 'select') then 'select' end,
                case when has_column_privilege(r.rol, format('public.%I', c.table_name), c.column_name, 'insert') then 'insert' end,
                case when has_column_privilege(r.rol, format('public.%I', c.table_name), c.column_name, 'update') then 'update' end,
                case when has_table_privilege(r.rol, format('public.%I', c.table_name), 'delete') then 'delete' end) as v
         from information_schema.columns c cross join (values ('anon'), ('authenticated')) r(rol)
        where c.table_schema = 'public'`),
    rls: await mapa(
      `select c.relname as k, c.relrowsecurity::text as v from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`),
  };
}

/** Qué apareció, qué desapareció y qué cambió entre dos catálogos. */
function cambiosDe(antes, despues) {
  const nace = [...despues.keys()].filter((k) => !antes.has(k)).sort();
  const muere = [...antes.keys()].filter((k) => !despues.has(k)).sort();
  const cambia = [...antes.keys()].filter((k) => despues.has(k) && antes.get(k) !== despues.get(k)).sort();
  return { nace, muere, cambia };
}

/**
 * El catálogo ENTERO de `public`, para decir que dos bases son la misma
 * objeto por objeto (la vuelta atrás): cada función con su texto y su lista
 * de permisos tal cual está guardada, y cada tabla, columna, restricción,
 * disparador, política, índice y comentario.
 *
 * El texto de las funciones va sin retornos de carro: en un worktree de
 * Windows un archivo puede llegar con CRLF y otro con LF, y eso no es una
 * diferencia. El número de orden de las columnas no se mira: quitar una
 * columna y volver a crearla la deja con otro número y nada más.
 */
async function catalogoEntero(db) {
  const mapa = async (sql) => new Map((await db.query(sql)).rows.map((r) => [r.k, r.v]));
  return {
    funciones: await mapa(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k,
              jsonb_build_object('argumentos', pg_get_function_arguments(p.oid), 'devuelve', pg_get_function_result(p.oid),
                'volatil', p.provolatile, 'definer', p.prosecdef, 'config', coalesce(p.proconfig::text, ''),
                'lenguaje', p.prolang::regproc::text, 'estricta', p.proisstrict,
                'permisos', (select coalesce(array_agg(a::text order by a::text), '{}') from unnest(p.proacl) a),
                'sin_permisos_propios', p.proacl is null,
                'cuerpo', replace(p.prosrc, chr(13), ''))::text as v
         from pg_proc p where p.pronamespace = 'public'::regnamespace`),
    tablas: await mapa(
      `select c.relname as k,
              jsonb_build_object('clase', c.relkind, 'rls', c.relrowsecurity, 'forzada', c.relforcerowsecurity,
                'permisos', (select coalesce(array_agg(a::text order by a::text), '{}') from unnest(c.relacl) a))::text as v
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'S')`),
    columnas: await mapa(
      `select c.relname || '.' || a.attname as k,
              jsonb_build_object('tipo', format_type(a.atttypid, a.atttypmod), 'obligatoria', a.attnotnull,
                'por_defecto', pg_get_expr(d.adbin, d.adrelid),
                'permisos', (select coalesce(array_agg(x::text order by x::text), '{}') from unnest(a.attacl) x))::text as v
         from pg_attribute a join pg_class c on c.oid = a.attrelid
         left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped`),
    restricciones: await mapa(
      `select c.relname || '.' || k.conname as k, pg_get_constraintdef(k.oid) || ' · validada=' || k.convalidated as v
         from pg_constraint k join pg_class c on c.oid = k.conrelid where c.relnamespace = 'public'::regnamespace`),
    disparadores: await mapa(
      `select c.relname || '.' || t.tgname as k, pg_get_triggerdef(t.oid) || ' · ' || t.tgenabled::text as v
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where c.relnamespace = 'public'::regnamespace and not t.tgisinternal`),
    politicas: await mapa(
      `select tablename || '.' || policyname as k,
              coalesce(cmd, '') || ' · ' || coalesce(roles::text, '') || ' · ' || coalesce(qual, '') || ' · ' || coalesce(with_check, '') as v
         from pg_policies where schemaname = 'public'`),
    indices: await mapa(
      `select tablename || '.' || indexname as k, indexdef as v from pg_indexes where schemaname = 'public'`),
    comentarios: await mapa(
      `select c.relname || '.' || a.attname as k, col_description(c.oid, a.attnum) as v
         from pg_attribute a join pg_class c on c.oid = a.attrelid
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
          and col_description(c.oid, a.attnum) is not null`),
  };
}

/** Las diferencias entre dos catálogos enteros, dichas una por una, y cuántos objetos se miraron. */
function diferenciasDeCatalogo(antes, despues) {
  const distintos = [];
  let objetos = 0;
  for (const clase of Object.keys(antes)) {
    objetos += antes[clase].size;
    const d = cambiosDe(antes[clase], despues[clase]);
    for (const k of d.nace) distintos.push(`${clase}: sobra ${k}`);
    for (const k of d.muere) distintos.push(`${clase}: falta ${k}`);
    for (const k of d.cambia) distintos.push(`${clase}: cambió ${k}`);
  }
  return { objetos, distintos };
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
// EL GUION: lo que hace el código publicado, por todos los caminos por los
// que hoy se mueve plata. Corre dos veces: la ronda 1 arma las cuentas (en
// la base de antes de la 131); la ronda 2 la corren las dos gemelas, una
// con la 131 y otra sin ella.
//
// `hacer` es un paso que tiene que andar; `probar`, uno que puede contestar
// que no (y entonces lo que importa es que conteste lo MISMO en las dos).
// Todo queda anotado en `pasos`.
// ─────────────────────────────────────────────────────────────────────────
async function guion(db, ctx, r) {
  const T = herramientas(db);
  const pasos = [];
  const anotar = (nombre, res) => {
    // Ida y vuelta por JSON: una fecha deja de ser un objeto y se puede comparar como texto.
    pasos.push([nombre, res.ok ? { ok: JSON.parse(JSON.stringify(res.valor.rows[0] ?? null)) } : { no: res.error }]);
    return res;
  };
  const probar = async (nombre, uid, sql, args = []) => anotar(nombre, await T.intento(uid, sql, args));
  const hacer = async (nombre, uid, sql, args = []) => {
    const res = await probar(nombre, uid, sql, args);
    if (!res.ok) throw new Error(`ronda ${r} · ${nombre}: ${res.error}`);
    return res.valor.rows[0] ?? {};
  };
  const hacerServicio = async (nombre, sql, args = []) => {
    const res = anotar(nombre, await T.servicio(sql, args));
    if (!res.ok) throw new Error(`ronda ${r} · ${nombre}: ${res.error}`);
    return res.valor.rows[0] ?? {};
  };

  const s = String(r);
  const hoy = (await T.uno(`select (now() at time zone 'America/Asuncion')::date::text d`)).d;
  const dia = async (d) => (await T.uno('select ($1::date + $2::int)::text d', [hoy, d])).d;
  const redondo = (x) => Math.round(x * 100) / 100;
  /** Un importe para esa cuenta: en guaraníes, o en su moneda con centavos. Cada ronda, otros números. */
  const m = (C, g) => (C.moneda === 'PYG' ? g + r * 100 : redondo(g / 7000 + r * 0.11));
  const cuotas = (montos) => JSON.stringify(montos.map((monto, i) => ({ vence_el: `2027-0${i + 1}-15`, monto })));
  const items = (cantidad, precio, nombre, producto = null) => JSON.stringify(
    [{ ...(producto ? { producto_id: producto } : {}), nombre, cantidad, precio_unitario: precio }]);

  const montar = async (clave, nombre, opciones = {}) => {
    const C = await H.montarEmpresa(db, { email: `${clave}@gemelas.test`, nombre, ...opciones });
    Object.assign(C, { clave, nombre, moneda: opciones.moneda ?? 'PYG', rubro: opciones.rubro ?? 'comercio' });
    ctx.cuentas[clave] = C;
    return C;
  };
  const montarPersonal = async (clave, uid, nombre) => {
    const id = (await T.val(uid, `select public.crear_empresa($1,'PYG','Pedro','America/Asuncion','personal') id`, [nombre])).id;
    const P = { clave, nombre, uid, empresaId: id, moneda: 'PYG', rubro: 'personal' };
    ctx.cuentas[clave] = P;
    return P;
  };

  /** Lo que tiene cualquier cuenta: billetera, gastos, ingresos, ventas, fiado, deudas, anulaciones. */
  const comun = async (C, { ventas = true } = {}) => {
    const E = C.empresaId;
    const D = C.uid;
    const de = (nombre) => `${C.clave} · ${nombre}`;
    const X = {};

    // ---- la billetera, como la llama PantallaBilletera.tsx (por nombre, sin `p_moneda`)
    const crear = async (nombre, tipo, saldoInicial, metodos, color = null) => (await hacer(de(`crear la cuenta «${nombre}»`), D,
      `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => $2, p_tipo => $3, p_saldo_inicial => $4,
         p_metodos => $5, p_id => null, p_color => $6) id`, [E, nombre, tipo, saldoInicial, metodos, color])).id;
    X.caja = await crear(`Caja ${s}`, 'efectivo', m(C, 500000), ['efectivo']);
    X.banco = await crear(`Banco ${s}`, 'banco', m(C, 3000000), ['transferencia', 'tarjeta'], 'azul');
    X.otro = await crear(`Otro banco ${s}`, 'banco', m(C, 1000000), []);
    X.vieja = await crear(`Cuenta vieja ${s}`, 'billetera', m(C, 70000), ['otro']);
    X.sinUso = await crear(`Sin uso ${s}`, 'banco', 0, []);
    await hacer(de('editar una cuenta: nombre, color y formas de pago'), D,
      `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => $2, p_tipo => 'banco', p_saldo_inicial => 0,
         p_metodos => $3, p_id => $4, p_color => 'verde') id`, [E, `Otro banco ${s} bis`, ['credito'], X.otro]);
    await hacer(de('pasar del banco a la caja (por nombre, como la pantalla)'), D,
      `select public.transferir_entre_cuentas(p_empresa => $1, p_desde => $2, p_hacia => $3, p_monto => $4, p_nota => '') j`,
      [E, X.banco, X.caja, m(C, 100000)]);
    await hacer(de('pasar de la caja al otro banco (por posición, con decimales)'), D,
      'select public.transferir_entre_cuentas($1,$2,$3,$4) j', [E, X.caja, X.otro, m(C, 20000) + 0.555]);
    await probar(de('pasar a la misma cuenta: no'), D, 'select public.transferir_entre_cuentas($1,$2,$3,$4) j', [E, X.caja, X.caja, 10]);
    await probar(de('pasar cero: no'), D, 'select public.transferir_entre_cuentas($1,$2,$3,$4) j', [E, X.caja, X.banco, 0]);
    await probar(de('pasar a la cuenta de otra empresa: no'), D, 'select public.transferir_entre_cuentas($1,$2,$3,$4) j', [E, X.caja, ctx.ajena, 10]);
    await hacer(de('ajustar la caja a lo contado'), D,
      `select public.ajustar_saldo_cuenta(p_empresa => $1, p_cuenta => $2, p_saldo_real => $3, p_nota => 'conté la caja') j`,
      [E, X.caja, m(C, 480000) + 0.444]);
    await hacer(de('ajustar sin diferencia'), D, 'select public.ajustar_saldo_cuenta($1,$2,$3) j', [E, X.sinUso, 0]);

    // ---- gastos y otros ingresos: el insert de PantallaGastos.tsx
    const mov = async (nombre, tipo, descripcion, categoria, monto, metodo, cuenta, uid = D) => (await hacer(de(nombre), uid, MOV,
      [E, tipo, descripcion, categoria, monto, metodo, cuenta])).id;
    X.gastoEfectivo = await mov('gasto en efectivo, sin elegir cuenta', 'gasto', `Luz ${s}`, 'Servicios', m(C, 150000), 'efectivo', null);
    await mov('gasto por transferencia, eligiendo el otro banco', 'gasto', `Alquiler ${s}`, 'Alquiler', m(C, 800000), 'transferencia', X.otro);
    X.gastoTarjeta = await mov('gasto con tarjeta', 'gasto', `Nafta ${s}`, 'Transporte', m(C, 90000), 'tarjeta', null);
    await mov('otro ingreso, a la cuenta que recibe «otro»', 'ingreso', `Reintegro ${s}`, 'Otros', m(C, 30000), 'otro', null);
    await mov('otro ingreso por transferencia, eligiendo la caja', 'ingreso', `Devolución ${s}`, 'Otros', m(C, 45000), 'transferencia', X.caja);
    await hacer(de('quitar la cuenta vieja: tiene historia, se archiva'), D,
      'select public.quitar_cuenta_dinero(p_empresa => $1, p_id => $2) j', [E, X.vieja]);
    await hacer(de('quitar la cuenta sin uso: tiene un ajuste en cero, ¿se borra?'), D,
      'select public.quitar_cuenta_dinero(p_empresa => $1, p_id => $2) j', [E, X.sinUso]);
    X.suelto1 = await mov('un ingreso «otro» que ya no recibe ninguna cuenta: queda suelto', 'ingreso', `Suelto A ${s}`, 'Otros', m(C, 25000), 'otro', null);
    await mov('otro suelto', 'gasto', `Suelto B ${s}`, 'Otros', m(C, 12000), 'otro', null);
    await mov('un gasto con la cuenta archivada: cae por su forma de pago (118)', 'gasto', `Lista vieja ${s}`, 'Servicios', m(C, 40000), 'transferencia', X.vieja);
    await mov('un gasto con la cuenta de OTRA empresa: se descarta', 'gasto', `Cuenta ajena ${s}`, 'Servicios', m(C, 41000), 'tarjeta', ctx.ajena);
    await hacer(de('«Plata sin cuenta»: asignar un suelto al banco'), D,
      'select public.asignar_cuenta_a_sueltos(p_empresa => $1, p_cuenta => $2, p_movimiento => $3) j', [E, X.banco, X.suelto1]);
    if (C.vendedor) {
      await mov('el vendedor carga un gasto: cae por su forma de pago', 'gasto', `Bolsas ${s}`, 'Insumos', m(C, 18000), 'efectivo', null, C.vendedor);
      await probar(de('el vendedor no ve la billetera'), C.vendedor, 'select public.billetera($1) j', [E]);
      await probar(de('ni las cuentas para elegir'), C.vendedor, 'select public.cuentas_para_elegir(p_empresa => $1) j', [E]);
    }

    // ---- el fiado anotado a mano, con y sin cuotas, prestando y cobrando con cuenta
    X.cliente = (await hacer(de('un cliente'), D, 'select public.guardar_cliente($1,$2,$3) id', [E, `Juan ${s}`, `0981 23${s} 567`])).id;
    await hacer(de('prestarle plata desde la caja (fiado a mano)'), D,
      `select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_concepto => $4, p_cuenta => $5) id`,
      [E, X.cliente, m(C, 40000), 'le presté', X.caja]);
    const c1 = m(C, 30000);
    const c2 = m(C, 31000);
    await hacer(de('fiado a mano en dos cuotas, desde el banco'), D,
      `select public.anotar_fiado($1,$2,$3,'en dos veces',null,$4,$5::jsonb) id`, [E, X.cliente, redondo(c1 + c2), X.banco, cuotas([c1, c2])]);
    const sinCuenta = (await hacer(de('fiado a mano sin cuenta'), D, `select public.anotar_fiado($1,$2,$3,'a cuenta') id`, [E, X.cliente, m(C, 3000)])).id;
    await hacer(de('cobrarle en efectivo, a la caja (se reparte entre las cuotas)'), D,
      `select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_metodo => $4, p_cuenta => $5) j`,
      [E, X.cliente, m(C, 20000), 'efectivo', X.caja]);
    await hacer(de('cobrarle sin elegir cuenta'), D, 'select public.cobrar_fiado($1,$2,$3) j', [E, X.cliente, m(C, 5000)]);
    await probar(de('borrar una línea del fiado'), D, 'select public.borrar_linea_fiado(p_linea => $1) j', [sinCuenta]);

    // ---- ventas: efectivo, por transferencia eligiendo cuenta, con descuento, fiada y en cuotas
    if (ventas) {
      X.producto = await H.crearProducto(db, E, D, { nombre: `Shampoo ${s}`, costo: m(C, 20000), precio: m(C, 35000), stock: 50 });
      X.ventaEfectivo = (await hacer(de('venta en efectivo'), D, 'select public.registrar_venta($1,$2) id',
        [E, items(2, m(C, 35000), `Shampoo ${s}`, X.producto)])).id;
      X.ventaBanco = (await hacer(de('venta por transferencia, eligiendo el otro banco'), D,
        `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'transferencia', p_cuenta => $3) id`,
        [E, items(1, m(C, 60000), 'Crema'), X.otro])).id;
      await hacer(de('venta con tarjeta y descuento'), D,
        `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'tarjeta', p_descuento => $3) id`,
        [E, items(3, m(C, 10000), 'Jabón'), m(C, 2000)]);
      if (C.vendedor) {
        await hacer(de('el vendedor vende: cae por la forma de pago'), C.vendedor,
          `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'transferencia') id`, [E, items(1, m(C, 22000), 'Peine')]);
        await probar(de('el vendedor no elige la cuenta'), C.vendedor,
          `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'transferencia', p_cuenta => $3) id`,
          [E, items(1, m(C, 22000), 'Peine'), X.otro]);
      }
      await probar(de('venta con la cuenta de otra empresa: no'), D,
        `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'transferencia', p_cuenta => $3) id`,
        [E, items(1, m(C, 22000), 'Peine'), ctx.ajena]);
      const f1 = m(C, 40000);
      const f2 = m(C, 42000);
      X.ventaFiada = (await hacer(de('venta fiada'), D,
        `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'credito', p_cliente => $3) id`,
        [E, items(1, redondo(f1 + f2), 'Perfume'), X.cliente])).id;
      const plan = (await hacer(de('la venta fiada, en dos cuotas'), D,
        'select public.programar_cuotas(p_venta => $1, p_plan => $2::jsonb) j', [X.ventaFiada, cuotas([f1, f2])])).j;
      await hacer(de('cobrar parte de la primera cuota, por transferencia al banco'), D,
        `select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_metodo => 'transferencia', p_cuenta => $4, p_cuota => $5) j`,
        [E, X.cliente, m(C, 10000), X.banco, plan.cuotas[0].id]);
      await hacer(de('anular la venta por transferencia'), D, `select public.anular_movimiento($1,'me equivoqué') id`, [X.ventaBanco]);
    }

    // ---- deudas y sus pagos
    X.deuda = (await hacer(de('una deuda'), D, `select public.crear_deuda($1,$2,'tarjeta','Banco',$3) id`, [E, `Visa ${s}`, m(C, 900000)])).id;
    await hacer(de('pagarla desde el otro banco, anotando el gasto'), D,
      `select public.registrar_pago_deuda(p_deuda => $1, p_monto => $2, p_crear_gasto => true, p_metodo => 'transferencia', p_nota => '', p_cuenta => $3) j`,
      [X.deuda, m(C, 100000), X.otro]);
    await hacer(de('un pago sin anotar gasto'), D, 'select public.registrar_pago_deuda($1,$2,null,false) j', [X.deuda, m(C, 50000)]);
    const pago = (await hacer(de('un pago por defecto (efectivo)'), D, 'select public.registrar_pago_deuda($1,$2) j', [X.deuda, m(C, 20000)])).j;
    await hacer(de('deshacer ese pago'), D, 'select public.anular_pago_deuda($1) j', [pago.pago_id]);
    await probar(de('pagar con la cuenta de otra empresa: no'), D,
      `select public.registrar_pago_deuda($1,$2,null,true,'transferencia','',$3) j`, [X.deuda, m(C, 1000), ctx.ajena]);

    // ---- anulaciones y cierre
    await hacer(de('anular el gasto con tarjeta'), D, `select public.anular_movimiento($1,'duplicado') id`, [X.gastoTarjeta]);
    await probar(de('cerrar el día'), D, 'select public.marcar_cierre($1) d', [E]);
    return X;
  };

  /** Servicios con reparto: cobrar un servicio, «Atendido, cobrar», pagarle al equipo, una silla. */
  const deServicios = async (C, X) => {
    const E = C.empresaId;
    const D = C.uid;
    const de = (nombre) => `${C.clave} · ${nombre}`;
    if (r === 1) {
      C.corte = await H.crearProducto(db, E, D, { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
      C.empleado = await H.sumarMiembro(db, E, 'pedro@gemelas.test', 'vendedor');
      C.prof = (await hacer(de('un profesional a comisión'), D, `select public.guardar_profesional($1,'Pedro','comision',50,$2) id`, [E, C.empleado])).id;
      C.inquilino = await H.sumarMiembro(db, E, 'silla@gemelas.test', 'vendedor');
      C.silla = (await hacer(de('una silla alquilada'), D, `select public.guardar_profesional($1,'Lu','alquiler',null,$2) id`, [E, C.inquilino])).id;
    }
    await hacer(de('cobrar un corte por transferencia, al otro banco'), D,
      `select public.registrar_servicio(p_empresa => $1, p_profesional => $2, p_producto => $3, p_precio => $4,
         p_metodo_pago => 'transferencia', p_cuenta => $5) j`, [E, C.prof, C.corte, m(C, 55000), X.otro]);
    await hacer(de('cobrar un corte como la pantalla vieja (efectivo)'), D, 'select public.registrar_servicio($1,$2,$3) j', [E, C.prof, C.corte]);
    await hacer(de('el profesional carga el suyo, sin elegir cuenta'), C.empleado,
      `select public.registrar_servicio(p_empresa => $1, p_profesional => $2, p_producto => $3, p_metodo_pago => 'tarjeta') j`, [E, C.prof, C.corte]);
    await probar(de('el profesional no elige la cuenta del dueño'), C.empleado,
      `select public.registrar_servicio(p_empresa => $1, p_profesional => $2, p_producto => $3, p_metodo_pago => 'tarjeta', p_cuenta => $4) j`,
      [E, C.prof, C.corte, X.banco]);
    await hacer(de('un corte en la silla alquilada: sin venta'), D,
      `select public.registrar_servicio(p_empresa => $1, p_profesional => $2, p_producto => $3, p_metodo_pago => 'transferencia', p_cuenta => $4) j`,
      [E, C.silla, C.corte, X.banco]);
    // Los turnos, a una hora fija de un día fijo: nada depende del reloj.
    const turno = async (hora) => (await T.uno(
      `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina, cliente_nombre)
       values ($1,$2,$3, ($4::date + $5::time) at time zone 'America/Asuncion',
               ($4::date + $5::time + interval '30 minutes') at time zone 'America/Asuncion', 'Juan') returning id`,
      [E, C.prof, C.corte, await dia(r), hora])).id;
    await hacer(de('«Atendido, cobrar» con tarjeta, al banco'), D,
      `select public.atender_reserva($1,$2,'tarjeta',$3) j`, [await turno('10:00'), m(C, 52000), X.banco]);
    await hacer(de('«Atendido, cobrar» como hasta hoy'), D, 'select public.atender_reserva($1) j', [await turno('11:00')]);
    await hacer(de('pagarle al profesional por transferencia, desde el banco'), D,
      `select public.pagar_profesional($1,$2,$3,null,'','transferencia',$4) j`, [E, C.prof, m(C, 40000), X.banco]);
    await hacer(de('pagarle como siempre (efectivo)'), D, 'select public.pagar_profesional($1,$2,$3) j', [E, C.prof, m(C, 10000)]);
    await probar(de('pagarle desde la cuenta de otra empresa: no'), D,
      `select public.pagar_profesional($1,$2,$3,null,'','transferencia',$4) j`, [E, C.prof, m(C, 10000), ctx.ajena]);
  };

  /** Clases: paquetes e inscripciones, cobrando a una cuenta. */
  const deClases = async (C, X) => {
    const E = C.empresaId;
    const D = C.uid;
    const de = (nombre) => `${C.clave} · ${nombre}`;
    const alumno = (await hacer(de('un alumno'), D, 'select public.guardar_cliente($1,$2,$3) id', [E, `Matías ${s}`, `0981 11${s} 111`])).id;
    const alumna = (await hacer(de('una alumna'), D, 'select public.guardar_cliente($1,$2,$3) id', [E, `Ana ${s}`, `0982 22${s} 222`])).id;
    const paquete = (await hacer(de('vender un paquete por transferencia, al otro banco'), D,
      `select public.vender_paquete($1,$2,'8 clases',8,$3,'transferencia',null,null,$4) j`, [E, alumno, m(C, 400000), X.otro])).j;
    await hacer(de('dar una clase del paquete'), D, `select public.dar_clase($1,1,null,'dada',null) j`, [paquete.paquete]);
    await hacer(de('un paquete como siempre (efectivo)'), D, `select public.vender_paquete($1,$2,'4 clases',4,$3) j`, [E, alumno, m(C, 200000)]);
    const desde = `${14 + 2 * r}:00`;
    const hasta = `${15 + 2 * r}:00`;
    await hacer(de('inscribir a una alumna, pagado por transferencia al banco'), D,
      `select public.inscribir_alumno(p_empresa => $1, p_cliente => $2, p_dias => $3::smallint[], p_hora_desde => $4::time,
         p_hora_hasta => $5::time, p_desde => $6::date, p_hasta => $7::date, p_precio_hora => $8, p_pagado => true,
         p_metodo => 'transferencia', p_nombre => 'Mes de inglés', p_cuenta => $9) j`,
      [E, alumna, [1, 2, 3, 4, 5], desde, hasta, await dia(1), await dia(14), m(C, 50000), X.banco]);
    const sinCobrar = (await hacer(de('inscribir sin cobrar'), D,
      `select public.inscribir_alumno(p_empresa => $1, p_cliente => $2, p_dias => $3::smallint[], p_hora_desde => $4::time,
         p_hora_hasta => $5::time, p_desde => $6::date, p_hasta => $7::date, p_precio_hora => $8, p_pagado => false) j`,
      [E, alumno, [6], desde, hasta, await dia(1), await dia(21), m(C, 50000)])).j;
    await hacer(de('cobrar esa inscripción en efectivo, a la caja'), D,
      `select public.cobrar_inscripcion($1,'efectivo',null,$2) j`, [sinCobrar.paquete, X.caja]);
    await probar(de('vender un paquete a la cuenta de otra empresa: no'), D,
      `select public.vender_paquete($1,$2,'8 clases',8,$3,'transferencia',null,null,$4) j`, [E, alumno, m(C, 400000), ctx.ajena]);
  };

  /** Ganadería: lotes con gastos y una venta. */
  const deGanaderia = async (C) => {
    const E = C.empresaId;
    const D = C.uid;
    const de = (nombre) => `${C.clave} · ${nombre}`;
    const corral = (await hacer(de('un lote de novillos'), D, `select public.guardar_lote($1,$2,'cabezas',40) id`, [E, `Novillos ${s}`])).id;
    await hacer(de('balanceado para el lote'), D, MOV_LOTE, [E, 'gasto', `Balanceado ${s}`, 'Alimento', m(C, 800000), 'transferencia', null, corral, null]);
    const venta = (await hacer(de('vender un novillo'), D, 'select public.registrar_venta($1,$2) id', [E, items(1, m(C, 3000000), 'Novillo')])).id;
    await hacer(de('la venta, a su lote'), D, 'select public.asignar_a_lote($1,$2)', [venta, corral]);
    const terneros = (await hacer(de('un lote de terneros'), D, `select public.guardar_lote($1,$2,'cabezas',10) id`, [E, `Terneros ${s}`])).id;
    await hacer(de('vacunas'), D, MOV_LOTE, [E, 'gasto', `Vacunas ${s}`, 'Sanidad', m(C, 200000), 'efectivo', null, terneros, null]);
    await hacer(de('cerrar el lote de terneros'), D, 'select public.cerrar_lote($1,$2)', [E, terneros]);
  };

  /** Agricultura: campañas, un gasto repartido, deudas a cosecha y el papel del silo. */
  const deCampo = async (C, X) => {
    const E = C.empresaId;
    const D = C.uid;
    const de = (nombre) => `${C.clave} · ${nombre}`;
    const abrir = async (nombre, cultivo, ha) => (await hacer(de(`abrir la campaña ${nombre}`), D,
      `select public.guardar_lote($1,$2,'',0,'',null,null,$3,$4,$5,2500000) id`, [E, `${nombre} ${s}`, cultivo, `Zafra ${2025 + r}/${26 + r}`, ha])).id;
    const norte = await abrir('Norte', 'Soja', 50);
    const sur = await abrir('Sur', 'Maíz', 20);
    await hacer(de('semilla para una campaña'), D, MOV_LOTE, [E, 'gasto', `Semilla ${s}`, 'Semilla', m(C, 3400000), 'transferencia', X.banco, norte, null]);
    const reparto = `00000000-0000-4000-8000-00000000000${s}`;
    await hacer(de('gasoil repartido entre las dos campañas (1/2)'), D, MOV_LOTE, [E, 'gasto', `1/2 · Gasoil ${s}`, 'Combustible', m(C, 500000), 'efectivo', null, norte, reparto]);
    await hacer(de('gasoil repartido entre las dos campañas (2/2)'), D, MOV_LOTE, [E, 'gasto', `2/2 · Gasoil ${s}`, 'Combustible', m(C, 200000), 'efectivo', null, sur, reparto]);
    const deuda = async (nombre, monto, lote, categoria) => (await hacer(de(`deuda a cosecha: ${nombre}`), D,
      'select public.crear_deuda($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) id',
      [E, `${nombre} ${s}`, 'proveedor', 'Agrofértil', monto, null, null, null, null, '', lote, categoria])).id;
    const agro = await deuda('Agroquímicos', 4800000, norte, 'Agroquímicos');
    const semilla = await deuda('Semilla fiada', 1000000, sur, 'Semilla');
    await hacer(de('pagar parte de la semilla fiada, desde el banco'), D,
      `select public.registrar_pago_deuda($1,$2,$3,true,'transferencia','A cuenta',$4,null,null) j`, [semilla, 400000, hoy, X.banco]);
    const cosechar = (lote, kg, ticket) => hacer(de(`cosecha ${ticket}`), D,
      `select public.registrar_cosecha($1,$2,$3,$4,null,14.5,'Coop',$5,'',null) id`, [E, lote, hoy, kg, `${ticket}-${s}`]);
    await cosechar(norte, 31000, 'R-1');
    await cosechar(sur, 2000, 'R-2');
    const liquidar = (nombre, grupoId, precio, partes, cuenta) => hacer(de(nombre), D,
      `select public.registrar_liquidacion($1,$2,$3,'Coop San Juan',$4,$5::jsonb,$6,'transferencia','Papel') j`,
      [E, grupoId, hoy, precio, JSON.stringify(partes), cuenta]);
    await liquidar('el papel del silo: descuentos, la deuda que se cobró y el alquiler en kilos', `00000000-0000-4000-9000-0000000000${s}1`, 2500000, [{
      lote_id: norte, kg: 30000,
      descuentos: [{ categoria: 'Secado y acopio', monto: 500000 }],
      deudas: [{ deuda_id: agro, monto: 4800000 }],
      grano: [{ categoria: 'Arrendamiento', monto: 10000000, descripcion: 'kilos del dueño' }],
    }], X.banco);
    await liquidar('canje puro: neto cero y sin cuenta', `00000000-0000-4000-9000-0000000000${s}2`, 400000, [{
      lote_id: sur, kg: 1000, grano: [{ categoria: 'Arrendamiento', monto: 400000, descripcion: 'canje' }],
    }], null);
    const anulado = `00000000-0000-4000-9000-0000000000${s}3`;
    await liquidar('un papel mal cargado', anulado, 2500000, [{ lote_id: norte, kg: 1000, deudas: [{ deuda_id: semilla, monto: 100000 }] }], X.banco);
    await hacer(de('anular ese papel'), D, `select public.anular_liquidacion($1,$2,'mal cargado') j`, [E, anulado]);
    await probar(de('un papel a la cuenta de otra empresa: no'), D,
      `select public.registrar_liquidacion($1,$2,$3,'Coop San Juan',$4,$5::jsonb,$6,'transferencia','Papel') j`,
      [E, `00000000-0000-4000-9000-0000000000${s}4`, hoy, 2500000, JSON.stringify([{ lote_id: norte, kg: 10 }]), ctx.ajena]);
  };

  /** La cuenta personal en Pro: presupuesto, sueldo, ahorros (también en dólares) y lo cobrado trabajando. */
  const dePersonal = async (P, X, negocio) => {
    const E = P.empresaId;
    const D = P.uid;
    const de = (nombre) => `${P.clave} · ${nombre}`;
    await hacer(de('presupuesto de comida'), D, 'select public.guardar_presupuesto($1,$2,$3)', [E, `Comida ${s}`, m(P, 300000)]);
    await hacer(de('un gasto fijo'), D, `select public.guardar_gasto_fijo($1,$2,$3,'Servicios',10)`, [E, `Wifi ${s}`, m(P, 120000)]);
    const sueldo = m(P, 3000000);
    await hacer(de('el sueldo, con la cuenta donde lo cobra'), D,
      'select public.guardar_ingreso_fijo($1,$2,$3,5,$4,null,$5)', [E, `Sueldo ${s}`, sueldo, r === 1, X.banco]);
    // «Ya lo cobré» (PantallaOrganizacion.tsx): un ingreso «otro», con la cuenta guardada.
    await hacer(de('«Ya lo cobré»: el sueldo entra en su banco'), D, MOV, [E, 'ingreso', `Sueldo ${s}`, 'Sueldo', sueldo, 'otro', X.banco]);
    const fondo = (await hacer(de('un fondo de ahorro'), D, 'select public.guardar_ahorro($1,$2,$3) id', [E, `Viaje ${s}`, m(P, 2000000)])).id;
    await hacer(de('guardar en el fondo'), D, `select public.mover_ahorro($1,$2,'aporte',$3) j`, [E, fondo, m(P, 300000)]);
    await hacer(de('sacar del fondo'), D, `select public.mover_ahorro($1,$2,'retiro',$3) j`, [E, fondo, m(P, 50000)]);
    const dolares = (await hacer(de('un fondo en dólares (073)'), D,
      `select public.guardar_ahorro(p_empresa => $1, p_nombre => $2, p_meta => 1000, p_moneda => 'USD') id`, [E, `Dólares ${s}`])).id;
    await hacer(de('guardar dólares, diciendo cuánto fue en guaraníes'), D,
      `select public.mover_ahorro(p_empresa => $1, p_ahorro => $2, p_tipo => 'aporte', p_monto => $3, p_monto_local => $4) j`,
      [E, dolares, 100 + r, m(P, 740000)]);
    await hacer(de('traer lo cobrado trabajando, a su banco'), D, 'select public.traer_ingreso_de_trabajo($1,$2,$3) j', [negocio.empresaId, E, X.banco]);
    await probar(de('traerlo a una cuenta del negocio: no'), D, 'select public.traer_ingreso_de_trabajo($1,$2,$3) j', [negocio.empresaId, E, ctx.ajena]);
    await hacer(de('su resumen'), D, 'select public.resumen_personal($1) j', [E]);
  };

  /** Lo que una cuenta con candado intenta y no puede (y lo poco que sí). */
  const conCandado = async (C, X) => {
    const E = C.empresaId;
    const D = C.uid;
    const de = (nombre) => `${C.clave} · ${nombre}`;
    await probar(de('crear una cuenta'), D,
      `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => $2, p_tipo => 'banco', p_saldo_inicial => 0, p_metodos => '{}', p_id => null, p_color => null) id`,
      [E, `Nueva ${s}`]);
    await probar(de('editar una cuenta'), D,
      `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => 'Otro nombre', p_tipo => 'banco', p_saldo_inicial => 0, p_metodos => '{}', p_id => $2, p_color => null) id`,
      [E, X.banco]);
    await probar(de('pasar plata'), D, 'select public.transferir_entre_cuentas($1,$2,$3,$4) j', [E, X.banco, X.caja, 1000 + r]);
    await probar(de('ajustar un saldo'), D, 'select public.ajustar_saldo_cuenta($1,$2,$3) j', [E, X.caja, 1000 + r]);
    await probar(de('quitar una cuenta'), D, 'select public.quitar_cuenta_dinero($1,$2) j', [E, X.otro]);
    await probar(de('un gasto a mano, sin cuenta'), D, MOV, [E, 'gasto', `Súper ${s}`, 'Comida', m(C, 25000), 'efectivo', null]);
    await probar(de('un gasto a mano, con una cuenta armada en el pedido'), D, MOV, [E, 'gasto', `Farmacia ${s}`, 'Salud', m(C, 15000), 'transferencia', X.otro]);
    await probar(de('un ingreso a mano'), D, MOV, [E, 'ingreso', `Changa ${s}`, 'Otros', m(C, 60000), 'transferencia', null]);
    await probar(de('una venta'), D, 'select public.registrar_venta($1,$2) id', [E, items(1, m(C, 1000), 'Algo')]);
    await probar(de('prestar plata desde la caja'), D,
      `select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_concepto => 'no', p_cuenta => $4) id`, [E, X.cliente, 1000, X.caja]);
    await probar(de('asignar lo suelto'), D, 'select public.asignar_cuenta_a_sueltos($1,$2) j', [E, X.banco]);
    await probar(de('ver la billetera'), D, 'select public.billetera($1) j', [E]);
    await probar(de('ver las cuentas para elegir'), D, 'select public.cuentas_para_elegir(p_empresa => $1) j', [E]);
  };

  /** Pagar el plan con Bancard, de verdad: Orden anota su ingreso SIN sesión, y si fallara se lo calla (125, 130). */
  const pagarPorBancard = async (C) => {
    const o = (await hacerServicio(`${C.clave} · pedir el pago del plan por Bancard`,
      `select public.bancard_crear_operacion($1,$2,'produccion','plan','formulario','pro','mensual',null) j`, [C.empresaId, C.uid])).j;
    await hacerServicio(`${C.clave} · Bancard confirma: Orden anota su ingreso con tarjeta`,
      `select public.bancard_confirmar($1,$2,'confirmacion') j`,
      [o.operacion, { response: 'S', response_code: '00', amount: `${o.importe}.00`, currency: 'PYG', shop_process_id: String(o.operacion) }]);
  };

  // ════════════════════════════════════════════════════════════════════
  const Q = ctx.cuentas;
  if (r === 1) {
    // La cuenta de Orden: ahí cae lo que cobra Bancard.
    const jefe = await montar('orden', 'Orden SA');
    await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe.uid]);
    await T.val(jefe.uid, 'select public.definir_empresa_orden($1)', [jefe.empresaId]);
    ctx.ajena = (await T.val(jefe.uid, `select public.guardar_cuenta_dinero($1,'Banco de Orden','banco',0,'{}') id`, [jefe.empresaId])).id;
    await montar('comercio', 'Almacén Luna');
    Q.comercio.vendedor = await H.sumarMiembro(db, Q.comercio.empresaId, 'vende@gemelas.test', 'vendedor');
    await montar('dolares', 'Importadora Sur', { moneda: 'USD' });
    await montar('servicios', 'Barbería Centro', { rubro: 'servicios' });
    await montar('clases', 'Instituto Norte', { rubro: 'clases' });
    await montar('ganaderia', 'Estancia La Paz', { rubro: 'ganaderia' });
    await montar('agricultura', 'Chacra Don Luis', { rubro: 'agricultura' });
    await montar('vencida', 'Kiosco Vencido');
    await montar('cero', 'Bazar De Cero');
    await montar('paga', 'Ferretería Paga');
  }
  const X = {};
  X.orden = await comun(Q.orden);
  X.comercio = await comun(Q.comercio);
  X.dolares = await comun(Q.dolares);
  X.servicios = await comun(Q.servicios);
  await deServicios(Q.servicios, X.servicios);
  X.clases = await comun(Q.clases);
  await deClases(Q.clases, X.clases);
  X.ganaderia = await comun(Q.ganaderia);
  await deGanaderia(Q.ganaderia);
  X.agricultura = await comun(Q.agricultura);
  await deCampo(Q.agricultura, X.agricultura);

  // La personal en Pro de Pedro, que trabaja en la barbería.
  if (r === 1) await montarPersonal('personal', Q.servicios.empleado, 'Mis finanzas');
  X.personal = await comun(Q.personal, { ventas: false });
  await dePersonal(Q.personal, X.personal, Q.servicios);

  // La personal que quedó en Gratis: se cargó en la prueba y la prueba terminó (110).
  if (r === 1) {
    const uid = await H.crearUsuario(db, 'gratis@gemelas.test');
    await montarPersonal('gratis', uid, 'Finanzas en Gratis');
    ctx.gratis = await comun(Q.gratis, { ventas: false });
    await T.vencer(Q.gratis.empresaId);
  }
  await conCandado(Q.gratis, ctx.gratis);

  // El negocio vencido: se cargó en la prueba y no pagó (111).
  if (r === 1) {
    ctx.vencida = await comun(Q.vencida);
    await T.vencer(Q.vencida.empresaId);
  }
  await conCandado(Q.vencida, ctx.vencida);

  // «Empezar de cero»: se carga y se vacía (115).
  await comun(Q.cero);
  await hacer('cero · empezar de cero', Q.cero.uid, 'select public.vaciar_empresa($1,$2) j', [Q.cero.empresaId, Q.cero.nombre]);
  await mov0(Q.cero);

  // Bancard: en la ronda 1 paga una ferretería; en la 2, el bazar.
  await pagarPorBancard(r === 1 ? Q.paga : Q.cero);

  // Y en la ronda 2 la administración borra entera la ferretería (129): sus
  // movimientos y sus cuentas se van en cascada, y el SET NULL de
  // `movimientos.cuenta_id` es un UPDATE que pasa por el disparador.
  if (r === 2) {
    anotar('paga · la administración borra la cuenta entera', await T.servicio(
      'select public.borrar_cuenta_entera(p_actor => $1, p_empresa => $2, p_confirmacion => $3, p_solo_comprobar => false) j',
      [Q.orden.uid, Q.paga.empresaId, Q.paga.nombre]));
  }

  async function mov0(C) {
    await hacer(`${C.clave} · y después de vaciar, un gasto`, C.uid, MOV, [C.empresaId, 'gasto', `Primero ${s}`, 'Servicios', m(C, 77000), 'efectivo', null]);
  }

  return pasos;
}

async function principal() {
  const t0 = Date.now();
  const sql131 = leer(`supabase/migrations/${ARCHIVO_131}`);
  console.log(`La 131 es ${ARCHIVO_131}; lo de antes llega hasta la ${ULTIMA_ANTERIOR}.`);

  // ═════════════════════════════════════════════════════════════════════
  // PARTE 0 · PARA QUIEN NO USA OTRA MONEDA NO CAMBIA NADA
  // ═════════════════════════════════════════════════════════════════════
  grupo('0 · Dos gemelas cargadas por todos los caminos: una se queda en la 130, a la otra se le aplica la 131');
  let B = await H.crearBase({ hasta: ULTIMA_ANTERIOR });
  ok('la base de antes no tiene nada de la 131',
    [(await B.query(`select count(*)::int n from information_schema.columns where table_schema = 'public' and column_name in ('monto_cuenta') and table_name = 'movimientos'`)).rows[0].n,
      (await B.query(`select count(*)::int n from pg_proc where proname = any($1)`, [NUEVAS])).rows[0].n], [0, 0]);
  const ctx = { cuentas: {}, ajena: null };
  const pasos1 = await guion(B, ctx, 1);
  const cuentas = Object.values(ctx.cuentas);
  const plano = await planoDe(B);
  const contar = async (db) => (await db.query(
    `select (select count(*)::int from public.movimientos) as movimientos,
            (select count(*)::int from public.movimientos where estado = 'anulado') as anulados,
            (select count(*)::int from public.movimientos where cuenta_id is null and estado = 'activo') as sueltos,
            (select count(*)::int from public.cuentas_dinero) as cuentas,
            (select count(*)::int from public.cuentas_dinero where not activa) as archivadas,
            (select count(*)::int from public.ajustes_cuenta) as ajustes,
            (select count(*)::int from public.ajustes_cuenta where tipo = 'prestamo') as prestamos,
            (select count(*)::int from public.fiado_cuotas) as cuotas,
            (select count(*)::int from public.liquidaciones) as liquidaciones,
            (select count(*)::int from public.movimientos_ahorro) as ahorros`)).rows[0];
  const cargado = await contar(B);
  console.log(`  · ronda 1: ${pasos1.length} pasos en ${cuentas.length} cuentas (${cuentas.map((c) => c.clave).join(', ')})`);
  console.log(`  · quedó cargado: ${JSON.stringify(cargado)}`);
  ok('el guion movió plata de verdad por todos lados (si no, las comparaciones no probarían nada)',
    [cargado.movimientos > 150, cargado.anulados > 20, cargado.sueltos > 5, cargado.cuentas > 40, cargado.archivadas > 8,
      cargado.ajustes > 80, cargado.prestamos > 30, cargado.cuotas > 20, cargado.liquidaciones > 0, cargado.ahorros > 0],
    [true, true, true, true, true, true, true, true, true, true]);
  ok('se leen las funciones que el encargo nombra, y muchas más',
    [['billetera', 'cuentas_para_elegir', 'resumen_personal', 'resumen_financiero', 'cierre_del_dia', 'serie_financiera_diaria',
      'resumen_fiado', 'resumen_deudas', 'listar_movimientos', 'gastos_por_categoria', 'cobros_por_metodo', 'panel_profe', 'resumen_reparto',
      'liquidacion', 'por_cobrar_alumnos', 'racha_empresa', 'estado_cuenta'].filter((f) => !plano.lectoras.some((l) => l.nombre === f)),
    plano.lectoras.length > 60], [[], true]);

  const antes = await foto(B, cuentas, plano);
  const control = await foto(B, cuentas, plano);
  ok('la foto es estable: dos fotos seguidas, sin tocar nada, dan lo mismo', diferencias(antes, control).distintas, []);
  const catalogoAntes = await catalogoDe(B);

  // ---- las gemelas
  const A = await B.clone();
  ok('la gemela es exacta: en el clon todo se lee igual, carácter por carácter', diferencias(antes, await foto(A, cuentas, plano)).distintas, []);

  // ---- a una se le aplica la 131, con los privilegios por defecto de Supabase puestos antes
  await B.exec('alter default privileges in schema public grant execute on functions to anon, authenticated, service_role');
  await B.exec('alter default privileges in schema public grant all on tables to anon, authenticated, service_role');
  await B.exec('create function public.zz_control_de_privilegios() returns integer language sql as $f$ select 1 $f$');
  const control131 = (await B.query(
    `select has_function_privilege('anon', 'public.zz_control_de_privilegios()', 'EXECUTE') as anon,
            has_function_privilege('service_role', 'public.zz_control_de_privilegios()', 'EXECUTE') as servicio`)).rows[0];
  await B.exec('drop function public.zz_control_de_privilegios()');
  ok('los privilegios por defecto de Supabase estaban puestos (una función cualquiera nacía abierta a anon y al servidor)',
    [control131.anon, control131.servicio], [true, true]);
  const aplicada = await H.aplicarMigracion(B, '131');
  console.log(`  · ${aplicada} aplicada sobre la base cargada`);

  const despues = await foto(B, cuentas, plano);
  mismasFotos('antes y después de aplicarla', antes, despues);
  ok('ningún movimiento ganó un importe de cuenta y ninguna cuenta ganó una moneda: las columnas nuevas están vacías',
    [(await B.query('select count(*)::int n from public.movimientos where monto_cuenta is not null')).rows[0].n,
      (await B.query('select count(*)::int n from public.cuentas_dinero where moneda is not null')).rows[0].n,
      (await B.query('select count(*)::int n from public.cotizaciones_moneda')).rows[0].n], [0, 0, 0]);

  let dosVeces = null;
  try { await H.aplicarMigracion(B, '131'); await H.aplicarMigracion(B, '131'); } catch (e) { dosVeces = e.message; }
  ok('aplicada dos veces más, no falla', dosVeces, null);
  ok('  y todo sigue leyéndose igual, carácter por carácter', diferencias(antes, await foto(B, cuentas, plano)).distintas, []);
  const catalogoDespues = await catalogoDe(B);

  // ═════════════════════════════════════════════════════════════════════
  grupo('0b · Del catálogo cambia lo que la 131 dice que cambia, y nada más');
  // ═════════════════════════════════════════════════════════════════════
  {
    const f = cambiosDe(catalogoAntes.funciones, catalogoDespues.funciones);
    ok('funciones que desaparecen: las tres firmas viejas', f.muere, [
      'cuentas_para_elegir(uuid)',
      'guardar_cuenta_dinero(uuid,text,text,numeric,text[],uuid,text)',
      'transferir_entre_cuentas(uuid,uuid,uuid,numeric,text)'].sort());
    ok('funciones que nacen: esas tres con su parámetro nuevo al final, y las cuatro nuevas', f.nace, [
      'cuentas_para_elegir(uuid,boolean)',
      'deshacer_transferencia(uuid,uuid)',
      'guardar_cotizacion_moneda(uuid,text,numeric)',
      'guardar_cuenta_dinero(uuid,text,text,numeric,text[],uuid,text,text)',
      'moneda_ajustes_cuenta()',
      'transferencias_de_cuenta(uuid,uuid,integer)',
      'transferir_entre_cuentas(uuid,uuid,uuid,numeric,text,numeric)'].sort());
    const MISMA_FIRMA = ['ajustar_saldo_cuenta(uuid,uuid,numeric,text)', 'anotar_en_su_cuenta()', 'billetera(uuid)',
      'moneda_no_se_reetiqueta()', 'resumen_personal(uuid)', 'saldo_cuenta_dinero(uuid)'];
    ok('funciones que cambian: las seis que se redefinen con la misma firma. Ninguna otra de la base se tocó',
      [f.cambia, catalogoAntes.funciones.size > 350], [MISMA_FIRMA, true]);
    const sinCuerpo = (texto) => { const o = JSON.parse(texto); delete o.cuerpo; return o; };
    ok('  y de esas seis cambió SOLO el cuerpo: argumentos, lo que devuelven, definer, search_path y quién las ejecuta, iguales',
      MISMA_FIRMA.filter((k) => JSON.stringify(sinCuerpo(catalogoAntes.funciones.get(k))) !== JSON.stringify(sinCuerpo(catalogoDespues.funciones.get(k)))), []);
    // Las tres que ganan un parámetro: lo mismo que la vieja, salvo los argumentos y el cuerpo.
    const aparte = (texto) => { const o = JSON.parse(texto); delete o.cuerpo; delete o.argumentos; return o; };
    for (const [vieja, nueva, parametro] of [
      ['guardar_cuenta_dinero(uuid,text,text,numeric,text[],uuid,text)', 'guardar_cuenta_dinero(uuid,text,text,numeric,text[],uuid,text,text)', ', p_moneda text DEFAULT NULL::text'],
      ['transferir_entre_cuentas(uuid,uuid,uuid,numeric,text)', 'transferir_entre_cuentas(uuid,uuid,uuid,numeric,text,numeric)', ', p_monto_hacia numeric DEFAULT NULL::numeric'],
      ['cuentas_para_elegir(uuid)', 'cuentas_para_elegir(uuid,boolean)', ', p_otras_monedas boolean DEFAULT false'],
    ]) {
      const a = JSON.parse(catalogoAntes.funciones.get(vieja));
      const d = JSON.parse(catalogoDespues.funciones.get(nueva));
      ok(`${nueva.split('(')[0]}: los argumentos de siempre, igual escritos, más uno al final con valor por defecto; lo demás, igual`,
        [d.argumentos === a.argumentos + parametro, aparte(catalogoDespues.funciones.get(nueva))],
        [true, aparte(catalogoAntes.funciones.get(vieja))]);
    }

    const t = cambiosDe(catalogoAntes.disparadores, catalogoDespues.disparadores);
    ok('disparadores: nacen dos, ninguno cambia ni desaparece', [t.nace, t.muere, t.cambia],
      [['ajustes_cuenta.moneda_ajustes_cuenta', 'cotizaciones_moneda.cuenta_activa_cotizaciones_moneda'], [], []]);
    ok('  el de los movimientos sigue siendo el mismo, antes de insertar o editar',
      catalogoDespues.disparadores.get('movimientos.anotar_en_su_cuenta'),
      'CREATE TRIGGER anotar_en_su_cuenta BEFORE INSERT OR UPDATE ON public.movimientos FOR EACH ROW EXECUTE FUNCTION anotar_en_su_cuenta()');
    const k = cambiosDe(catalogoAntes.restricciones, catalogoDespues.restricciones);
    ok('restricciones: nacen las de las columnas y la tabla nuevas, ninguna cambia ni desaparece', [k.nace, k.muere, k.cambia], [[
      'cotizaciones_moneda.cotizaciones_moneda_empresa_id_fkey', 'cotizaciones_moneda.cotizaciones_moneda_moneda_check',
      'cotizaciones_moneda.cotizaciones_moneda_pkey', 'cotizaciones_moneda.cotizaciones_moneda_valor_check',
      'cuentas_dinero.cuentas_dinero_moneda_conocida', 'cuentas_dinero.cuentas_dinero_otra_moneda_sin_formas',
      'movimientos.movimientos_monto_cuenta_check'], [], []]);
    const c = cambiosDe(catalogoAntes.columnas, catalogoDespues.columnas);
    ok('columnas: dos nuevas en lo que existía (las dos sin valor por defecto: null) y la tabla de cotizaciones', [c.nace, c.muere, c.cambia], [[
      'cotizaciones_moneda.empresa_id', 'cotizaciones_moneda.moneda', 'cotizaciones_moneda.updated_at', 'cotizaciones_moneda.valor',
      'cuentas_dinero.moneda', 'movimientos.monto_cuenta'], [], []]);
    ok('  las dos, sin valor por defecto y aceptando null', [catalogoDespues.columnas.get('cuentas_dinero.moneda'), catalogoDespues.columnas.get('movimientos.monto_cuenta')],
      ['text ·  · YES', 'numeric ·  · YES']);
    const p = cambiosDe(catalogoAntes.politicas, catalogoDespues.politicas);
    ok('políticas: ninguna nace, cambia ni desaparece (la del insert de los movimientos es la de siempre)', [p.nace, p.muere, p.cambia], [[], [], []]);
    const i = cambiosDe(catalogoAntes.indices, catalogoDespues.indices);
    ok('índices: solo la clave de la tabla nueva', [i.nace, i.muere, i.cambia], [['cotizaciones_moneda.cotizaciones_moneda_pkey'], [], []]);
    const rls = cambiosDe(catalogoAntes.rls, catalogoDespues.rls);
    ok('la tabla nueva nace con RLS, y ninguna otra cambió', [rls.nace, rls.muere, rls.cambia, catalogoDespues.rls.get('cotizaciones_moneda')],
      [['cotizaciones_moneda'], [], [], 'true']);
    const pe = cambiosDe(catalogoAntes.permisos, catalogoDespues.permisos);
    ok('permisos de tablas y columnas: en lo que ya existía, ni uno cambió', [pe.muere, pe.cambia], [[], []]);
    ok('  y en lo nuevo, uno solo: quien tiene sesión lee (y manda al cargar) `monto_cuenta`. Nadie toca la moneda de una cuenta ni las cotizaciones',
      pe.nace.map((x) => [x, catalogoDespues.permisos.get(x)]).filter(([, v]) => v !== ''), [['authenticated · movimientos.monto_cuenta', 'select,insert']]);
    ok('  (se miraron las ocho columnas nuevas, para anon y para la sesión)', pe.nace.length, 12);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('0c · Las gemelas siguen trabajando: el mismo guion del código publicado, con la 131 y sin ella');
  // ═════════════════════════════════════════════════════════════════════
  {
    // La gemela con la 131 sigue en una copia fresca de sí misma: así las dos
    // arrancan la ronda 2 igual de nuevas (la de siempre tiene guardados los
    // planes de la ronda 1, y el cambio de más abajo le llegaría tarde en las
    // funciones que ya usó).
    { const fresca = await B.clone(); await B.close(); B = fresca; }
    // Para que las dos generen los MISMOS identificadores y números, y se
    // puedan comparar sin adivinar qué fila es cuál: los uuid salen de un
    // contador (solo acá, en las bases de prueba) y las secuencias arrancan
    // del mismo lugar (un clon las deja unos números adelante).
    const secuencias = async (db) => new Map((await db.query(
      `select format('%I.%I', schemaname, sequencename) as s, coalesce(last_value, 0)::text as v from pg_sequences where schemaname = 'public'`)).rows.map((x) => [x.s, Number(x.v)]));
    const [enA, enB] = [await secuencias(A), await secuencias(B)];
    for (const [nombre, valor] of enB) {
      for (const db of [A, B]) await db.query('select setval($1::regclass, $2::bigint)', [nombre, Math.max(valor, enA.get(nombre) ?? 0) + 1000]);
    }
    for (const db of [A, B]) {
      await db.exec(`
        create sequence public.zz_uuid_de_las_gemelas;
        grant usage on sequence public.zz_uuid_de_las_gemelas to public;
        create or replace function pg_catalog.gen_random_uuid() returns uuid language sql volatile
        as $f$ select md5('gemela-' || nextval('public.zz_uuid_de_las_gemelas')::text)::uuid $f$;`);
    }
    const hoyAntes = (await A.query(`select (now() at time zone 'America/Asuncion')::date::text d`)).rows[0].d;
    const pasosA = await guion(A, ctx, 2);
    const pasosB = await guion(B, ctx, 2);
    const cargadoA = await contar(A);
    const cargadoB = await contar(B);
    console.log(`  · ronda 2: ${pasosA.length} pasos en cada gemela; quedó cargado: ${JSON.stringify(cargadoB)}`);
    ok('la ronda 2 también movió plata de verdad, en las dos, y lo mismo',
      [cargadoB.movimientos > cargado.movimientos + 150, cargadoB.ajustes > cargado.ajustes + 80, cargadoB.cuentas > cargado.cuentas + 30, cargadoA],
      [true, true, true, cargadoB]);

    // ---- cada paso contesta lo mismo
    const nuevasAlContestar = new Set();
    const distintos = [];
    const sinQue = [];
    pasosA.forEach(([nombre, a], idx) => {
      const [nombreB, b] = pasosB[idx] ?? ['‹falta›', null];
      for (const clave of clavesNuevas(a, b)) nuevasAlContestar.add(clave);
      const ta = sinInstantes(JSON.stringify(canon(a)));
      const tb = sinInstantes(JSON.stringify(canon(conLasClavesDe(a, b))));
      if (nombre !== nombreB || ta !== tb) distintos.push(`${nombre}: ${primeraDiferencia(ta, tb)}`);
      if (a.no) sinQue.push(nombre);
    });
    ok(`los ${pasosA.length} pasos contestan lo mismo en las dos (los ${sinQue.length} que dicen que no, con el mismo mensaje)`,
      [pasosB.length, distintos], [pasosA.length, []]);
    ok('lo único que la base nueva contesta de más son las claves nuevas de la 131: el código publicado no las lee',
      [...nuevasAlContestar].sort(), ['.ok.j.cotizaciones', '.ok.j.cuentas_otras', '.ok.j.en_otras_monedas', '.ok.j.entro', '.ok.j.moneda',
        '.ok.j.moneda_desde', '.ok.j.moneda_hacia', '.ok.j.salio', '.ok.j.totales_otras'].sort());

    // ---- y al final se lee lo mismo
    const fotoA = await foto(A, cuentas, plano);
    const fotoB = await foto(B, cuentas, plano);
    ok('las fotos del final no son las del principio (si no, esto no compararía nada)',
      diferencias(antes, fotoB, sinInstantes).distintas.length > 100, true);
    mismasFotos('al final, la gemela sin la 131 y la gemela con la 131', fotoA, fotoB, sinInstantes);
    ok('con la 131 y el código publicado, nadie pudo crear una cuenta en otra moneda ni anotar un importe de cuenta',
      [(await B.query('select count(*)::int n from public.movimientos where monto_cuenta is not null')).rows[0].n,
        (await B.query('select count(*)::int n from public.cuentas_dinero where moneda is not null')).rows[0].n,
        (await B.query('select count(*)::int n from public.cotizaciones_moneda')).rows[0].n], [0, 0, 0]);
    // Lo de Bancard: el ingreso de Orden nace sin sesión y adentro de un
    // «exception when others». Si el disparador nuevo fallara ahí, el
    // ingreso no se anotaría y nadie vería un error.
    const ingresosBancard = (db) => db.query(
      `select m.descripcion like '%Bancard%' as bancard, m.metodo_pago::text as metodo, m.monto > 0 as cobrado, m.estado::text as estado,
              (select c.nombre from public.cuentas_dinero c where c.id = m.cuenta_id) as cuenta
         from public.movimientos m where m.empresa_id = $1 and m.categoria = 'Suscripciones' order by m.created_at`, [ctx.cuentas.orden.empresaId]).then((x) => x.rows);
    ok('los dos pagos por Bancard dejaron su ingreso en la cuenta de Orden que recibe la tarjeta: uno antes de la 131 y otro después',
      await ingresosBancard(B), [
        { bancard: true, metodo: 'tarjeta', cobrado: true, estado: 'activo', cuenta: 'Banco 1' },
        { bancard: true, metodo: 'tarjeta', cobrado: true, estado: 'activo', cuenta: 'Banco 2' }]);
    ok('  igual que en la gemela sin la 131', await ingresosBancard(A), await ingresosBancard(B));
    const quedaDeLaBorrada = (db) => db.query(
      `select (select count(*)::int from public.empresas where id = $1) as empresa,
              (select count(*)::int from public.movimientos where empresa_id = $1) as movimientos,
              (select count(*)::int from public.cuentas_dinero where empresa_id = $1) as cuentas`, [ctx.cuentas.paga.empresaId]).then((x) => x.rows[0]);
    ok('la cuenta que la administración borró entera se fue con sus movimientos y sus cuentas, en las dos',
      [await quedaDeLaBorrada(B), await quedaDeLaBorrada(A)], [{ empresa: 0, movimientos: 0, cuentas: 0 }, { empresa: 0, movimientos: 0, cuentas: 0 }]);
    const hoyDespues = (await B.query(`select (now() at time zone 'America/Asuncion')::date::text d`)).rows[0].d;
    ok('(la prueba no cruzó la medianoche: si esto falla, lo de arriba no vale y hay que volver a correrla)', hoyDespues, hoyAntes);
  }
  await A.close();
  console.log(`\n(${Math.round((Date.now() - t0) / 1000)} s hasta acá)`);

  // ═════════════════════════════════════════════════════════════════════
  // PARTE 1 · CON NÚMEROS, SOBRE UNA BASE COMPLETA (todas las migraciones)
  // ═════════════════════════════════════════════════════════════════════
  const db = await H.crearBase();
  const T = herramientas(db);
  const { intento, val, J, filas, uno, n, saldo } = T;

  const items = (cantidad, precio, nombre = 'Shampoo') => JSON.stringify([{ nombre, cantidad, precio_unitario: precio }]);
  /** Crear una cuenta: sin moneda, la llamada de la pantalla publicada; con moneda, la de la pantalla nueva. */
  const crearCuenta = (C, nombre, tipo, saldoInicial, metodos = [], moneda = undefined) => intento(C.uid,
    moneda === undefined
      ? `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => $2, p_tipo => $3, p_saldo_inicial => $4,
           p_metodos => $5, p_id => null, p_color => null) id`
      : `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => $2, p_tipo => $3, p_saldo_inicial => $4,
           p_metodos => $5, p_id => null, p_color => null, p_moneda => $6) id`,
    moneda === undefined ? [C.empresaId, nombre, tipo, saldoInicial, metodos] : [C.empresaId, nombre, tipo, saldoInicial, metodos, moneda]);
  const cuenta = async (...a) => {
    const r = await crearCuenta(...a);
    if (!r.ok) throw new Error(`crear la cuenta «${a[1]}» → ${r.error}`);
    return r.valor.rows[0].id;
  };
  const editar = (C, id, nombre, tipo, metodos, moneda = undefined) => intento(C.uid,
    moneda === undefined
      ? `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => $2, p_tipo => $3, p_saldo_inicial => 0,
           p_metodos => $4, p_id => $5, p_color => 'verde') id`
      : `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => $2, p_tipo => $3, p_saldo_inicial => 0,
           p_metodos => $4, p_id => $5, p_color => 'verde', p_moneda => $6) id`,
    moneda === undefined ? [C.empresaId, nombre, tipo, metodos, id] : [C.empresaId, nombre, tipo, metodos, id, moneda]);
  /** Pasar plata: con un importe, la llamada de la pantalla publicada; con dos, la nueva. */
  const transferir = (C, desde, hacia, monto, montoHacia = undefined) => intento(C.uid,
    montoHacia === undefined
      ? `select public.transferir_entre_cuentas(p_empresa => $1, p_desde => $2, p_hacia => $3, p_monto => $4, p_nota => '') j`
      : `select public.transferir_entre_cuentas(p_empresa => $1, p_desde => $2, p_hacia => $3, p_monto => $4, p_nota => '', p_monto_hacia => $5) j`,
    montoHacia === undefined ? [C.empresaId, desde, hacia, monto] : [C.empresaId, desde, hacia, monto, montoHacia]);
  const pase = async (...a) => {
    const r = await transferir(...a);
    if (!r.ok) throw new Error(`transferir → ${r.error}`);
    return r.valor.rows[0].j;
  };
  const deshacer = (C, par, uid = C.uid) => intento(uid, 'select public.deshacer_transferencia(p_empresa => $1, p_par => $2) j', [C.empresaId, par]);
  const ajustar = (C, id, real) => intento(C.uid,
    `select public.ajustar_saldo_cuenta(p_empresa => $1, p_cuenta => $2, p_saldo_real => $3, p_nota => '') j`, [C.empresaId, id, real]);
  /** El insert de Gastos y Otros ingresos del código nuevo: con cuánto se movió la cuenta. */
  const cargar = (C, cuentaId, monto, montoCuenta, { tipo = 'gasto', metodo = 'tarjeta', uid = C.uid, descripcion = 'Suscripción' } = {}) => intento(uid,
    MOV_CUENTA, [C.empresaId, tipo, descripcion, 'Servicios', monto, metodo, cuentaId, montoCuenta]);
  const fila = (id) => uno(
    `select cuenta_id, monto::float as monto, monto_cuenta::float as monto_cuenta, estado::text as estado, metodo_pago::text as metodo
       from public.movimientos where id = $1`, [id]);
  const cotizar = (C, moneda, valor, uid = C.uid) => intento(uid,
    'select public.guardar_cotizacion_moneda(p_empresa => $1, p_moneda => $2, p_valor => $3) j', [C.empresaId, moneda, valor]);
  const paraElegir = (C, otras = undefined) => J(C.uid,
    otras === undefined ? 'select public.cuentas_para_elegir(p_empresa => $1) j' : 'select public.cuentas_para_elegir(p_empresa => $1, p_otras_monedas => $2) j',
    otras === undefined ? [C.empresaId] : [C.empresaId, otras]);
  const cliente = async (C, nombre, telefono) => (await val(C.uid, 'select public.guardar_cliente($1,$2,$3) id', [C.empresaId, nombre, telefono])).id;
  const personal = async (email, nombre) => {
    const uid = await H.crearUsuario(db, email);
    const id = (await val(uid, `select public.crear_empresa($1,'PYG','Pedro','America/Asuncion','personal') id`, [nombre])).id;
    return { uid, empresaId: id, nombre };
  };
  /** Toda la base, tabla por tabla: para decir «no quedó nada a medias» de verdad. */
  const TABLAS = (await filas(
    `select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)).map((x) => x.t);
  const todaLaBase = async () => {
    const m = new Map();
    for (const t of TABLAS) {
      const r = await uno(`select count(*)::int as n, coalesce(md5(string_agg(f, '|' order by f)), '') as h from (select to_jsonb(x)::text as f from public."${t}" x) s`);
      m.set(t, `${r.n}:${r.h}`);
    }
    return m;
  };
  const tocadas = (antes, despues) => TABLAS.filter((t) => antes.get(t) !== despues.get(t));
  const UUID_QUE_NO_EXISTE = '00000000-0000-4000-8000-000000000000';

  // ═════════════════════════════════════════════════════════════════════
  grupo('1 · Quien no usa otra moneda: la billetera de siempre, con los números escritos a mano');
  // ═════════════════════════════════════════════════════════════════════
  const N = await H.montarEmpresa(db, { email: 'duenia@almacen.test', nombre: 'Almacén Luna' });
  N.nombre = 'Almacén Luna';
  const vendedor = await H.sumarMiembro(db, N.empresaId, 'vende@almacen.test', 'vendedor');
  const hoy = await T.hoyDe(N.empresaId);
  const resumen = (C) => J(C.uid, 'select public.resumen_financiero($1,$2::date,$3::date) j', [C.empresaId, hoy, hoy]);
  const cierre = (C) => J(C.uid, 'select public.cierre_del_dia($1) j', [C.empresaId]);

  const caja = await cuenta(N, 'Efectivo', 'efectivo', 500000, ['efectivo']);
  const itau = await cuenta(N, 'Itaú', 'banco', 20000000, ['transferencia', 'tarjeta']);
  await val(N.uid, 'select public.registrar_venta($1,$2) id', [N.empresaId, items(2, 35000)]);
  await val(N.uid, `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'transferencia', p_cuenta => $3) id`,
    [N.empresaId, items(1, 30000, 'Crema'), itau]);
  await val(N.uid, MOV, [N.empresaId, 'gasto', 'Luz', 'Servicios', 150000, 'efectivo', null]);
  await val(N.uid, MOV, [N.empresaId, 'gasto', 'Internet', 'Servicios', 50000, 'transferencia', null]);
  const suelto = (await val(N.uid, MOV, [N.empresaId, 'ingreso', 'Reintegro', 'Otros', 25000, 'otro', null])).id;
  await val(N.uid, `select public.ajustar_saldo_cuenta(p_empresa => $1, p_cuenta => $2, p_saldo_real => $3, p_nota => '') j`, [N.empresaId, caja, 400000]);
  const paseViejo = await pase(N, itau, caja, 100000);
  const juan = await cliente(N, 'Juan Pérez', '0981 234 567');
  await val(N.uid, `select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_concepto => $4, p_cuenta => $5) id`,
    [N.empresaId, juan, 40000, 'le presté', caja]);
  {
    // Efectivo: 500.000 + 70.000 de la venta − 150.000 de la luz = 420.000;
    //   ajustada a 400.000 (−20.000); + 100.000 que vinieron del Itaú; − 40.000 prestados = 460.000.
    // Itaú: 20.000.000 + 30.000 de la venta − 50.000 de internet − 100.000 que fueron a la caja = 19.880.000.
    const b = await T.billetera(N);
    ok('billetera(): las cuatro claves de siempre', { cuentas: b.cuentas, total: b.total, sin_cuenta: b.sin_cuenta, metodos_sin_cuenta: b.metodos_sin_cuenta }, {
      cuentas: [
        { id: caja, nombre: 'Efectivo', tipo: 'efectivo', color: null, metodos: ['efectivo'], saldo: 460000, entro_mes: 70000, salio_mes: 150000 },
        { id: itau, nombre: 'Itaú', tipo: 'banco', color: null, metodos: ['tarjeta', 'transferencia'], saldo: 19880000, entro_mes: 30000, salio_mes: 50000 },
      ],
      total: 20340000,
      sin_cuenta: { cantidad: 1, neto: 25000, desde: hoy },
      metodos_sin_cuenta: ['credito', 'otro'],
    });
    ok('  y las cuatro nuevas: la moneda del negocio, y nada en otras monedas',
      { moneda: b.moneda, cuentas_otras: b.cuentas_otras, totales_otras: b.totales_otras, cotizaciones: b.cotizaciones },
      { moneda: 'PYG', cuentas_otras: [], totales_otras: [], cotizaciones: [] });
    ok('  ni una clave más', Object.keys(b).sort(), ['cotizaciones', 'cuentas', 'cuentas_otras', 'metodos_sin_cuenta', 'moneda', 'sin_cuenta', 'total', 'totales_otras']);
    ok('el pase de siempre contesta `ok` y `par`, como siempre (y ahora, además, cuánto salió y cuánto entró)',
      { ...paseViejo, par: typeof paseViejo.par }, { ok: true, par: 'string', salio: 100000, entro: 100000, moneda_desde: 'PYG', moneda_hacia: 'PYG' });
    ok('cuentas_para_elegir(): las cinco claves de siempre, y solo esas', (await paraElegir(N)).map((c) => Object.keys(c).sort().join(',')),
      ['color,id,metodos,nombre,tipo', 'color,id,metodos,nombre,tipo']);
    aceptado('editar con los siete argumentos de la pantalla publicada', await editar(N, itau, 'Itaú', 'banco', ['transferencia', 'tarjeta']));
    aceptado('pasar plata con cuatro argumentos por posición', await intento(N.uid, 'select public.transferir_entre_cuentas($1,$2,$3,$4) j', [N.empresaId, itau, caja, 1000]));
    aceptado('  y de vuelta', await intento(N.uid, 'select public.transferir_entre_cuentas($1,$2,$3,$4,$5) j', [N.empresaId, caja, itau, 1000, 'vuelta']));
  }
  // La fórmula de la 074, escrita acá otra vez: para una cuenta propia el saldo es ESE, letra por letra.
  const FORMULA_074 = `
    select c.nombre,
           (c.saldo_inicial
            + coalesce((select sum(case when m.tipo = 'gasto' then -m.monto else m.monto end)
                        from public.movimientos m
                        where m.cuenta_id = c.id and m.empresa_id = c.empresa_id and m.estado = 'activo'), 0)
            + coalesce((select sum(a.monto) from public.ajustes_cuenta a where a.cuenta_id = c.id), 0))::text as de_la_074,
           public.saldo_cuenta_dinero(c.id)::text as de_hoy
      from public.cuentas_dinero c where c.moneda is null`;
  {
    const comparadas = await filas(FORMULA_074);
    ok('el saldo de cada cuenta propia es el de la fórmula de la 074, como texto',
      [comparadas.length, comparadas.filter((x) => x.de_la_074 !== x.de_hoy)], [2, []]);
  }
  // La personal, con su disponible.
  const P = await personal('sueldo@correo.test', 'Mis finanzas');
  await cuenta(P, 'Billetera', 'efectivo', 100000, ['efectivo']);
  await cuenta(P, 'Ueno', 'banco', 3000000, ['transferencia']);
  await val(P.uid, MOV, [P.empresaId, 'gasto', 'Súper', 'Comida', 25000, 'efectivo', null]);
  const porDia = (rp, disponible) => {
    const dias = Math.max(1, Math.round((Date.parse(rp.hasta) - Date.parse(hoy)) / 86400000) + 1);
    return Math.abs(rp.por_dia - disponible / dias) < 0.006;
  };
  {
    const rp = await J(P.uid, 'select public.resumen_personal($1) j', [P.empresaId]);
    ok('resumen_personal(): el disponible sale de sus dos cuentas (100.000 − 25.000 + 3.000.000), y no hay nada en otras monedas',
      [rp.en_cuentas, rp.disponible, porDia(rp, 3075000), rp.desde_la_billetera, rp.en_otras_monedas], [3075000, 3075000, true, true, []]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('2 · Guardar plata en otra moneda: los diez mil dólares de Matías');
  // ═════════════════════════════════════════════════════════════════════
  const atlas = await cuenta(N, 'Atlas dólares', 'banco', 10000, [], 'USD');
  {
    const b = await T.billetera(N);
    ok('la cuenta tiene US$ 10.000', await saldo(atlas), 10000);
    ok('el total de siempre NO se movió (no son guaraníes) y la cuenta no aparece entre las de siempre',
      [b.total, b.cuentas.map((c) => c.id)], [20340000, [caja, itau]]);
    ok('está en las cuentas en otra moneda, con la suya escrita',
      b.cuentas_otras, [{ id: atlas, nombre: 'Atlas dólares', tipo: 'banco', color: null, metodos: [], moneda: 'USD', saldo: 10000, entro_mes: 0, salio_mes: 0 }]);
    ok('y hay un total de dólares, aparte', b.totales_otras, [{ moneda: 'USD', total: 10000, cuentas: 1 }]);
    ok('quien pide las cuentas para cobrar sin la bandera (toda pantalla salvo Gastos) no la recibe',
      [(await paraElegir(N)).map((c) => c.id), (await paraElegir(N, false)).map((c) => c.id)], [[caja, itau], [caja, itau]]);
  }
  const binance = await cuenta(N, 'Binance', 'billetera', 350, ['transferencia', 'efectivo'], 'USD');
  ok('si le mandan formas de pago se guardan vacías, y no se las saca a las demás',
    await filas('select nombre, moneda, metodos from public.cuentas_dinero where empresa_id = $1 order by orden', [N.empresaId]), [
      { nombre: 'Efectivo', moneda: null, metodos: ['efectivo'] },
      { nombre: 'Itaú', moneda: null, metodos: ['tarjeta', 'transferencia'] },
      { nombre: 'Atlas dólares', moneda: 'USD', metodos: [] },
      { nombre: 'Binance', moneda: 'USD', metodos: [] }]);
  {
    const id = (await val(N.uid, MOV, [N.empresaId, 'ingreso', 'Cobro', 'Otros', 45000, 'transferencia', null])).id;
    ok('un ingreso por transferencia sin cuenta cae en el Itaú, nunca en una de dólares',
      await fila(id), { cuenta_id: itau, monto: 45000, monto_cuenta: null, estado: 'activo', metodo: 'transferencia' });
    ok('dos cuentas en dólares: un solo total de dólares', (await T.billetera(N)).totales_otras, [{ moneda: 'USD', total: 10350, cuentas: 2 }]);
  }
  // El Itaú quedó en 19.925.000.
  const M = await H.montarEmpresa(db, { email: 'kiosco@kiosco.test', nombre: 'Kiosco Sol' });
  {
    await cuenta(M, 'Ueno', 'banco', 1000, ['transferencia'], 'PYG');
    await cuenta(M, 'Familiar', 'banco', 2000, [], ' pyg ');
    const b = await T.billetera(M);
    ok('con la moneda del negocio escrita, la cuenta es propia: se guarda en null, con sus formas de pago, entre las de siempre',
      [await filas('select nombre, moneda, metodos from public.cuentas_dinero where empresa_id = $1 order by orden', [M.empresaId]), b.total, b.cuentas_otras],
      [[{ nombre: 'Ueno', moneda: null, metodos: ['transferencia'] }, { nombre: 'Familiar', moneda: null, metodos: [] }], 3000, []]);
    rechazado('una moneda que Orden no conoce', await crearCuenta(M, 'Libras', 'banco', 10, [], 'GBP'), NO_CONOCEMOS);
    ok('  y no quedó creada', await n('select count(*) n from public.cuentas_dinero where empresa_id = $1', [M.empresaId]), 2);
  }
  rechazado('editar la de dólares diciendo que es en reales', await editar(N, atlas, 'Atlas dólares', 'banco', [], 'BRL'), NO_SE_CAMBIA);
  rechazado('  ni diciendo que es en la moneda del negocio', await editar(N, atlas, 'Atlas dólares', 'banco', [], 'PYG'), NO_SE_CAMBIA);
  rechazado('  ni una propia a dólares', await editar(N, caja, 'Efectivo', 'efectivo', ['efectivo'], 'USD'), NO_SE_CAMBIA);
  rechazado('  ni a una moneda que no existe', await editar(N, atlas, 'Atlas dólares', 'banco', [], 'XXX'), NO_CONOCEMOS);
  rechazado('editar una cuenta que no existe contesta que no existe, no lo de la moneda',
    await editar(N, UUID_QUE_NO_EXISTE, 'Fantasma', 'banco', [], 'USD'), NO_EXISTE);
  aceptado('editar la de dólares como la pantalla publicada (sin la moneda), mandándole la tarjeta', await editar(N, atlas, 'Atlas dólares', 'banco', ['tarjeta']));
  aceptado('editarla diciendo la misma moneda, en minúscula', await editar(N, atlas, 'Atlas dólares', 'banco', [], 'usd'));
  aceptado('editar una propia diciendo la moneda del negocio', await editar(N, caja, 'Efectivo', 'efectivo', ['efectivo'], 'PYG'));
  ok('después de editar: conserva su moneda, sigue sin formas de pago, y el Itaú conserva la tarjeta',
    await filas(`select nombre, moneda, metodos, color from public.cuentas_dinero where id = any($1) order by orden`, [[caja, itau, atlas]]), [
      { nombre: 'Efectivo', moneda: null, metodos: ['efectivo'], color: 'verde' },
      { nombre: 'Itaú', moneda: null, metodos: ['tarjeta', 'transferencia'], color: 'verde' },
      { nombre: 'Atlas dólares', moneda: 'USD', metodos: [], color: 'verde' }]);
  {
    const redondeo = await cuenta(N, 'Redondeo', 'banco', 10000.555, [], 'USD');
    ok('en dólares, el saldo inicial va con dos decimales (10000,555 → 10000,56)', await saldo(redondeo), 10000.56);
    ok('  sin historia, quitarla la borra', (await J(N.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [N.empresaId, redondeo])).archivada, false);
  }
  // El caso simétrico se arma acá: un negocio en dólares.
  const U = await H.montarEmpresa(db, { email: 'importa@sur.test', nombre: 'Importadora Sur', moneda: 'USD' });
  U.nombre = 'Importadora Sur';
  const cajaU = await cuenta(U, 'Caja', 'efectivo', 5000, ['efectivo']);
  const bancoU = await cuenta(U, 'Banco', 'banco', 20000, ['transferencia', 'tarjeta']);
  {
    const redondeo = await cuenta(U, 'Redondeo', 'efectivo', 7400000.6, [], 'PYG');
    ok('en un negocio en dólares, una caja en guaraníes no tiene centavos (7.400.000,6 → 7.400.001)', await saldo(redondeo), 7400001);
    await val(U.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [U.empresaId, redondeo]);
  }
  {
    for (let i = 0; i < 10; i++) await cuenta(M, `Propia ${i}`, 'banco', 0, []);
    for (let i = 0; i < 8; i++) await cuenta(M, `Dólares ${i}`, 'banco', 1, [], 'USD');
    rechazado('el tope de 20 cuenta las propias y las otras: la número 21, en dólares', await crearCuenta(M, 'Una más', 'banco', 0, [], 'USD'), 'Ya tenés 20 cuentas');
    rechazado('  y la número 21, propia', await crearCuenta(M, 'Una más', 'banco', 0, []), 'Ya tenés 20 cuentas');
    const b = await T.billetera(M);
    ok('  doce propias y ocho en dólares', [b.cuentas.length, b.total, b.totales_otras], [12, 3000, [{ moneda: 'USD', total: 8, cuentas: 8 }]]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('3 · Pasar plata entre monedas: dos importes, cuánto salió y cuánto entró');
  // ═════════════════════════════════════════════════════════════════════
  const periodoAntes = JSON.stringify(canon(await resumen(N)));
  const cierreAntes = JSON.stringify(canon(await cierre(N)));
  const pase1 = await pase(N, itau, atlas, 7400000, 1000);
  ok('comprar mil dólares: contesta lo que salió y lo que entró, cada uno en su moneda',
    { ...pase1, par: typeof pase1.par }, { ok: true, par: 'string', salio: 7400000, entro: 1000, moneda_desde: 'PYG', moneda_hacia: 'USD' });
  ok('el Itaú bajó Gs. 7.400.000 y el Atlas subió US$ 1.000', [await saldo(itau), await saldo(atlas)], [12525000, 11000]);
  ok('son las dos filas de siempre, con el mismo `par` y montos distintos',
    await filas('select cuenta_id, tipo, monto::float as monto from public.ajustes_cuenta where par = $1 order by monto', [pase1.par]),
    [{ cuenta_id: itau, tipo: 'transferencia', monto: -7400000 }, { cuenta_id: atlas, tipo: 'transferencia', monto: 1000 }]);
  const pase2 = await pase(N, atlas, itau, 1000, 7600000);
  ok('venderlos más caros: el Atlas vuelve a US$ 10.000 y el Itaú queda Gs. 200.000 arriba de donde estaba',
    [await saldo(atlas), await saldo(itau), (await saldo(itau)) - 19925000], [10000, 20125000, 200000]);
  ok('cambiar de moneda no es ganar ni gastar: el período y el cierre del día no se enteraron',
    [JSON.stringify(canon(await resumen(N))) === periodoAntes, JSON.stringify(canon(await cierre(N))) === cierreAntes], [true, true]);
  {
    const filasAntes = await n('select count(*) n from public.ajustes_cuenta where empresa_id = $1', [N.empresaId]);
    rechazado('entre dos monedas, sin decir cuánto entró', await transferir(N, itau, atlas, 7400000), DOS_MONEDAS);
    rechazado('  ni con cero', await transferir(N, itau, atlas, 7400000, 0), DOS_MONEDAS);
    rechazado('  ni con un negativo', await transferir(N, itau, atlas, 7400000, -5), DOS_MONEDAS);
    rechazado('entre dos propias, con dos importes distintos', await transferir(N, itau, caja, 100000, 99000), UN_SOLO_MONTO);
    rechazado('un lado que redondea a cero: US$ 0,004', await transferir(N, itau, atlas, 100, 0.004), MAYOR_QUE_CERO);
    rechazado('  o el otro: Gs. 0,4', await transferir(N, itau, atlas, 0.4, 1), MAYOR_QUE_CERO);
    rechazado('un cambio que no puede ser: 1 contra un billón', await transferir(N, itau, atlas, 1, 1000000000000), CAMBIO_IMPOSIBLE);
    rechazado('  y al revés', await transferir(N, itau, atlas, 1000000000000, 1), CAMBIO_IMPOSIBLE);
    rechazado('hacia una cuenta de otra empresa', await transferir(N, itau, cajaU, 100, 1), NO_EXISTE);
    ok('nada de lo rechazado dejó una fila ni movió un saldo',
      [await n('select count(*) n from public.ajustes_cuenta where empresa_id = $1', [N.empresaId]), await saldo(itau), await saldo(atlas), await saldo(caja)],
      [filasAntes, 20125000, 10000, 460000]);
    aceptado('entre dos propias, con el mismo importe repetido', await transferir(N, itau, caja, 5000, 5000));
    aceptado('entre dos propias, como siempre', await transferir(N, caja, itau, 5000));
    ok('  y quedaron donde estaban', [await saldo(itau), await saldo(caja)], [20125000, 460000]);
  }
  {
    const j = await pase(N, atlas, itau, 1000.555, 7400000.4);
    ok('cada lado se redondea a SU moneda: salen US$ 1.000,56 y entran Gs. 7.400.000',
      [j.salio, j.entro, await saldo(atlas), await saldo(itau)], [1000.56, 7400000, 8999.44, 27525000]);
    aceptado('  (se deshace, para seguir)', await deshacer(N, j.par));
  }
  const paseDolares = await pase(N, atlas, binance, 250.555);
  ok('entre dos cuentas en dólares: un solo monto, con centavos',
    [paseDolares.salio, paseDolares.entro, paseDolares.moneda_desde, paseDolares.moneda_hacia, await saldo(atlas), await saldo(binance)],
    [250.56, 250.56, 'USD', 'USD', 9749.44, 600.56]);
  rechazado('  y con dos importes distintos, no', await transferir(N, atlas, binance, 100, 99), UN_SOLO_MONTO);
  ok('  el total de dólares no cambió: cambió dónde están', (await T.billetera(N)).totales_otras, [{ moneda: 'USD', total: 10350, cuentas: 2 }]);
  {
    const lista = await J(N.uid, 'select public.transferencias_de_cuenta(p_empresa => $1, p_cuenta => $2) j', [N.empresaId, atlas]);
    ok('los últimos pases del Atlas: el más nuevo primero; su importe con signo y en dólares, el de la otra cuenta en la suya',
      lista.map((x) => [x.par, x.fecha, x.monto, x.moneda, x.otra_cuenta, x.otra_moneda, x.otro_monto]), [
        [paseDolares.par, hoy, -250.56, 'USD', 'Binance', 'USD', 250.56],
        [pase2.par, hoy, -1000, 'USD', 'Itaú', 'PYG', 7600000],
        [pase1.par, hoy, 1000, 'USD', 'Itaú', 'PYG', -7400000]]);
    ok('  con estas claves', Object.keys(lista[0]).sort(), ['fecha', 'moneda', 'monto', 'nota', 'otra_activa', 'otra_cuenta', 'otra_moneda', 'otro_monto', 'par']);
    ok('  y mientras la otra cuenta siga en la billetera, `otra_activa` dice que sí', lista.map((x) => x.otra_activa), [true, true, true]);
    const cuantos = async (limite) => (await J(N.uid, 'select public.transferencias_de_cuenta($1,$2,$3) j', [N.empresaId, atlas, limite])).length;
    ok('  el límite: 1, 0 (da uno), 999 (da todos, hasta 50) y null (10)', [await cuantos(1), await cuantos(0), await cuantos(999), await cuantos(null)], [1, 1, 3, 3]);
    const delItau = await J(N.uid, 'select public.transferencias_de_cuenta($1,$2) j', [N.empresaId, itau]);
    ok('  el mismo pase, visto desde el Itaú', delItau.filter((x) => x.par === pase2.par).map((x) => [x.monto, x.moneda, x.otra_cuenta, x.otra_moneda, x.otro_monto]),
      [[7600000, 'PYG', 'Atlas dólares', 'USD', -1000]]);
    rechazado('los pases de una cuenta de otra empresa', await intento(N.uid, 'select public.transferencias_de_cuenta($1,$2) j', [N.empresaId, cajaU]), NO_EXISTE);
    rechazado('un vendedor no los ve', await intento(vendedor, 'select public.transferencias_de_cuenta($1,$2) j', [N.empresaId, atlas]), 'Solo el dueño de la cuenta puede ver esto.');
  }
  {
    rechazado('un vendedor no deshace un pase', await deshacer(N, paseDolares.par, vendedor), SOLO_DUENO);
    const r = await deshacer(N, paseDolares.par);
    ok('deshacer el pase entre las de dólares: contesta las dos cuentas (de la que salió, a la que entró)',
      r.ok ? r.valor.rows[0].j : r.error, { ok: true, cuentas: [atlas, binance] });
    ok('  se fueron las dos filas juntas y los saldos volvieron',
      [await n('select count(*) n from public.ajustes_cuenta where par = $1', [paseDolares.par]), await saldo(atlas), await saldo(binance)], [0, 10000, 350]);
    rechazado('deshacerlo otra vez', await deshacer(N, paseDolares.par), NO_EXISTE_PASE);
    rechazado('un pase que no existe', await deshacer(N, UUID_QUE_NO_EXISTE), NO_EXISTE_PASE);
    rechazado('sin decir cuál', await deshacer(N, null), NO_EXISTE_PASE);
    const paseU = await pase(U, cajaU, bancoU, 100);
    rechazado('el pase de otra empresa', await deshacer(N, paseU.par), NO_EXISTE_PASE);
    rechazado('  ni diciendo que la empresa es la otra', await deshacer(U, paseU.par, N.uid), SOLO_DUENO);
    const ajuste = (await uno(`select id from public.ajustes_cuenta where empresa_id = $1 and tipo = 'ajuste' limit 1`, [N.empresaId])).id;
    const prestamo = (await uno(`select id from public.ajustes_cuenta where empresa_id = $1 and tipo = 'prestamo' limit 1`, [N.empresaId])).id;
    rechazado('el id de un ajuste de saldo no es un pase', await deshacer(N, ajuste), NO_EXISTE_PASE);
    rechazado('  ni el de un préstamo del fiado', await deshacer(N, prestamo), NO_EXISTE_PASE);
    ok('  y los tres siguen ahí', await n('select count(*) n from public.ajustes_cuenta where id = any($1) or par = $2', [[ajuste, prestamo], paseU.par]), 4);
    const viejo = await deshacer(N, paseViejo.par);
    ok('también deshace uno entre dos cuentas propias: los Gs. 100.000 vuelven del Efectivo al Itaú',
      [viejo.ok ? viejo.valor.rows[0].j : viejo.error, await saldo(itau), await saldo(caja)], [{ ok: true, cuentas: [itau, caja] }, 20225000, 360000]);
  }
  {
    let r = await ajustar(N, atlas, 9987.456);
    ok('ajustar la de dólares a lo que dice el banco: la diferencia, con centavos',
      [r.valor.rows[0].j.antes, r.valor.rows[0].j.diferencia, await saldo(atlas)], [10000, -12.54, 9987.46]);
    r = await ajustar(N, atlas, 10000);
    ok('  y de vuelta', [r.valor.rows[0].j.diferencia, await saldo(atlas)], [12.54, 10000]);
    r = await ajustar(N, caja, 360000.555);
    ok('una propia se ajusta como siempre, con dos decimales', [r.valor.rows[0].j.diferencia, await saldo(caja)], [0.56, 360000.56]);
    await ajustar(N, caja, 360000);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('4 · Pagar un gasto y anotar un ingreso con la cuenta en dólares');
  // ═════════════════════════════════════════════════════════════════════
  const periodo0 = await resumen(N);
  let r = await cargar(N, atlas, 116727, 15.99);
  aceptado('pagar una suscripción de US$ 15,99 con la cuenta en dólares (Gs. 116.727)', r);
  const gastoUsd = r.valor.rows[0].id;
  ok('el gasto queda en guaraníes, como siempre; y la cuenta anota sus dólares',
    await fila(gastoUsd), { cuenta_id: atlas, monto: 116727, monto_cuenta: 15.99, estado: 'activo', metodo: 'tarjeta' });
  ok('la cuenta baja US$ 15,99', await saldo(atlas), 9984.01);
  ok('en el período, el gasto pesa por su monto en guaraníes', (await resumen(N)).gastos - periodo0.gastos, 116727);
  ok('el Itaú, que es quien recibe la tarjeta, no se enteró', await saldo(itau), 20225000);
  r = await cargar(N, atlas, 730000, 100, { tipo: 'ingreso', metodo: 'transferencia', descripcion: 'Me pagaron en dólares' });
  ok('un otro ingreso: +US$ 100 en la cuenta y Gs. 730.000 en los ingresos del período',
    [await saldo(atlas), (await resumen(N)).otros_ingresos - periodo0.otros_ingresos, (await fila(r.valor.rows[0].id)).monto_cuenta], [10084.01, 730000, 100]);
  {
    const b = await T.billetera(N);
    // Entró: los US$ 100 del ingreso + los US$ 1.000 del primer pase. Salió: los 15,99 del gasto + los 1.000 del segundo pase.
    ok('la billetera cuenta lo que entró y salió este mes por la de dólares, en dólares (sus movimientos y sus pases)',
      b.cuentas_otras.filter((c) => c.id === atlas).map((c) => [c.saldo, c.entro_mes, c.salio_mes]), [[10084.01, 1100, 1015.99]]);
    ok('el total de siempre sigue siendo solo guaraníes: Itaú + Efectivo', b.total, 20585000);
  }
  {
    const antes = await todaLaBase();
    rechazado('con la cuenta en dólares y SIN decir cuánto salió en ella (el insert de la pantalla publicada)',
      await intento(N.uid, MOV, [N.empresaId, 'gasto', 'Sin importe', 'Servicios', 50000, 'tarjeta', atlas]), FALTA_IMPORTE);
    rechazado('  con el importe en null', await cargar(N, atlas, 50000, null), FALTA_IMPORTE);
    rechazado('  con cero', await cargar(N, atlas, 50000, 0), FALTA_IMPORTE);
    rechazado('  con un negativo', await cargar(N, atlas, 50000, -15.99), FALTA_IMPORTE);
    rechazado('  con algo que redondea a cero (US$ 0,004)', await cargar(N, atlas, 50000, 0.004), FALTA_IMPORTE);
    rechazado('un vendedor que arma el pedido a mano con la cuenta en dólares', await cargar(N, atlas, 50000, 6.85, { uid: vendedor }), SOLO_ADMIN);
    ok('la base no convierte sola ni inventa un número: no quedó nada', tocadas(antes, await todaLaBase()), []);
  }
  r = await cargar(N, itau, 50000, 6.85);
  ok('con una cuenta propia, el importe de cuenta que venga se guarda en null',
    [await fila(r.valor.rows[0].id), await saldo(itau)], [{ cuenta_id: itau, monto: 50000, monto_cuenta: null, estado: 'activo', metodo: 'tarjeta' }, 20175000]);
  r = await cargar(N, null, 30000, 4.1, { metodo: 'otro' });
  ok('  y sin cuenta, también', await fila(r.valor.rows[0].id), { cuenta_id: null, monto: 30000, monto_cuenta: null, estado: 'activo', metodo: 'otro' });
  r = await cargar(N, atlas, 116800, 15.999);
  ok('el importe de la cuenta se redondea a su moneda: US$ 15,999 → 16,00', [(await fila(r.valor.rows[0].id)).monto_cuenta, await saldo(atlas)], [16, 10068.01]);
  {
    const anulado = await intento(N.uid, `select public.anular_movimiento($1,'me equivoqué') id`, [gastoUsd]);
    aceptado('anular el gasto de US$ 15,99', anulado);
    ok('la cuenta recupera EXACTAMENTE los dólares que salieron (no los de la cotización de hoy), y el movimiento conserva su importe',
      [await saldo(atlas), await fila(gastoUsd)], [10084, { cuenta_id: atlas, monto: 116727, monto_cuenta: 15.99, estado: 'anulado', metodo: 'tarjeta' }]);
    ok('y el gasto sale del período', (await resumen(N)).gastos - periodo0.gastos, 50000 + 30000 + 116800);
  }
  ok('con la bandera (Gastos): las propias con sus cinco claves y, después, las de otra moneda con tres más',
    (await paraElegir(N, true)).map((c) => [c.nombre, Object.keys(c).sort().join(','), c.moneda ?? null, c.otra ?? null, c.cotizacion ?? null]), [
      ['Efectivo', 'color,id,metodos,nombre,tipo', null, null, null],
      ['Itaú', 'color,id,metodos,nombre,tipo', null, null, null],
      ['Atlas dólares', 'color,cotizacion,id,metodos,moneda,nombre,otra,tipo', 'USD', true, null],
      ['Binance', 'color,cotizacion,id,metodos,moneda,nombre,otra,tipo', 'USD', true, null]]);
  rechazado('un vendedor no las ve, con bandera o sin ella',
    await intento(vendedor, 'select public.cuentas_para_elegir(p_empresa => $1, p_otras_monedas => true) j', [N.empresaId]), 'Solo el dueño de la cuenta puede ver esto.');
  {
    // EL ATAJO DEL DISPARADOR. Anular, cambiar el lote o completar la
    // descripción no tocan la cuenta ni lo que se movió en ella: no se vuelve
    // a validar nada. Si ese atajo se perdiera en una copia futura de la
    // función, el peón que le pone la campaña a un gasto que el dueño pagó
    // con la cuenta en dólares leería «Solo quien administra…»: asignar_a_lote
    // pide ser del equipo, no administrar. (El dueño que anula pasa igual con
    // el atajo o sin él: por eso esto se prueba con quien NO administra.)
    const E = await H.montarEmpresa(db, { email: 'dueno@estancia.test', nombre: 'Estancia La Paz', rubro: 'ganaderia' });
    const peon = await H.sumarMiembro(db, E.empresaId, 'peon@estancia.test', 'vendedor');
    const dolaresE = await cuenta(E, 'Banco en dólares', 'banco', 10000, [], 'USD');
    const corral = (await val(E.uid, `select public.guardar_lote($1,'Novillos corral 3','cabezas',40) id`, [E.empresaId])).id;
    r = await cargar(E, dolaresE, 740000, 100, { metodo: 'transferencia', descripcion: 'Vacunas' });
    const vacunas = r.ok ? r.valor.rows[0].id : null;
    ok('(el dueño paga las vacunas con la cuenta en dólares: Gs. 740.000 por US$ 100)',
      [r.ok ? (await fila(vacunas)).monto_cuenta : r.error, await saldo(dolaresE)], [100, 9900]);
    rechazado('quien no administra no carga un gasto con esa cuenta', await cargar(E, dolaresE, 74000, 10, { uid: peon }), SOLO_ADMIN);
    const enCampana = () => uno(
      `select lote_id, cuenta_id, monto::float as monto, monto_cuenta::float as monto_cuenta, estado::text as estado
         from public.movimientos where id = $1`, [vacunas]);
    aceptado('pero sí le pone la campaña al que cargó el dueño: eso no toca la cuenta ni los montos, y no se vuelve a validar nada',
      await intento(peon, 'select public.asignar_a_lote($1,$2)', [vacunas, corral]));
    ok('  el gasto quedó en su campaña, con su importe en dólares intacto, y la cuenta no se movió',
      [await enCampana(), await saldo(dolaresE)],
      [{ lote_id: corral, cuenta_id: dolaresE, monto: 740000, monto_cuenta: 100, estado: 'activo' }, 9900]);
    aceptado('  y también se la saca', await intento(peon, 'select public.asignar_a_lote($1,null)', [vacunas]));
    ok('  igual: ni el importe ni el saldo', [await enCampana(), await saldo(dolaresE)],
      [{ lote_id: null, cuenta_id: dolaresE, monto: 740000, monto_cuenta: 100, estado: 'activo' }, 9900]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('5 · Lo que todavía no se puede con una cuenta en otra moneda: se rechaza entero y no queda nada a medias');
  // ═════════════════════════════════════════════════════════════════════
  {
    // Lo que hace falta para llamar a cada puerta, en el almacén.
    const deuda = (await val(N.uid, `select public.crear_deuda($1,'Préstamo','prestamo','Banco',2000000) id`, [N.empresaId])).id;
    const uidPedro = await H.sumarMiembro(db, N.empresaId, 'pedro@almacen.test', 'vendedor');
    const pedro = (await val(N.uid, `select public.guardar_profesional($1,'Pedro','comision',50,$2) id`, [N.empresaId, uidPedro])).id;
    const corte = await H.crearProducto(db, N.empresaId, N.uid, { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
    const turno = (await uno(
      `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina, cliente_nombre)
       values ($1,$2,$3, now() + interval '1 hour', now() + interval '90 minutes', 'Juan') returning id`, [N.empresaId, pedro, corte])).id;
    const alumno = await cliente(N, 'Juana', '0981 222 333');
    await val(N.uid, 'select public.pagar_profesional($1,$2,$3) j', [N.empresaId, pedro, 60000]);
    const venta = (await val(N.uid, `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'credito', p_cliente => $3) id`,
      [N.empresaId, items(1, 90000, 'Perfume'), juan])).id;
    const plan = (await val(N.uid, 'select public.programar_cuotas(p_venta => $1, p_plan => $2::jsonb) j',
      [venta, JSON.stringify([{ vence_el: '2027-01-15', monto: 45000 }, { vence_el: '2027-02-15', monto: 45000 }])])).j;
    // La personal de Pedro, con una cuenta en dólares.
    const PP = { uid: uidPedro, nombre: 'Lo de Pedro' };
    PP.empresaId = (await val(uidPedro, `select public.crear_empresa('Lo de Pedro','PYG','Pedro','America/Asuncion','personal') id`)).id;
    const dolaresPedro = await cuenta(PP, 'Dólares', 'banco', 100, [], 'USD');
    // Un instituto y una chacra, con la suya.
    const K = await H.montarEmpresa(db, { email: 'profe@instituto.test', nombre: 'Instituto Norte', rubro: 'clases' });
    const dolaresK = await cuenta(K, 'Dólares', 'banco', 100, [], 'USD');
    const alumnaK = await cliente(K, 'Ana', '0982 222 222');
    const dias = async (d) => (await uno('select ($1::date + $2::int)::text d', [hoy, d])).d;
    const sinCobrar = (await val(K.uid,
      `select public.inscribir_alumno(p_empresa => $1, p_cliente => $2, p_dias => $3::smallint[], p_hora_desde => '10:00'::time,
         p_hora_hasta => '11:00'::time, p_desde => $4::date, p_hasta => $5::date, p_precio_hora => 50000, p_pagado => false) j`,
      [K.empresaId, alumnaK, [1, 2, 3, 4, 5], await dias(1), await dias(14)])).j;
    const G = await H.montarEmpresa(db, { email: 'luis@chacra.test', nombre: 'Chacra Don Luis', rubro: 'agricultura' });
    const dolaresG = await cuenta(G, 'Dólares', 'banco', 100, [], 'USD');
    const norte = (await val(G.uid, `select public.guardar_lote($1,'Norte','',0,'',null,null,'Soja','Zafra 2026/27',50,2500000) id`, [G.empresaId])).id;
    await val(G.uid, `select public.registrar_cosecha($1,$2,$3,31000,null,14.5,'Coop','R-1','',null) id`, [G.empresaId, norte, hoy]);

    const PUERTAS = [
      ['Vender (registrar_venta)', N.uid, `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'transferencia', p_cuenta => $3) id`,
        [N.empresaId, items(1, 30000, 'Crema'), atlas], FALTA_IMPORTE],
      ['Deudas: registrar un pago con su gasto (registrar_pago_deuda)', N.uid,
        `select public.registrar_pago_deuda($1,100000,null,true,'transferencia','',$2) j`, [deuda, atlas], FALTA_IMPORTE],
      ['Reparto: pagarle al equipo (pagar_profesional)', N.uid,
        `select public.pagar_profesional($1,$2,40000,null,'','transferencia',$3) j`, [N.empresaId, pedro, atlas], FALTA_IMPORTE],
      ['Reparto: cobrar un servicio (registrar_servicio)', N.uid,
        `select public.registrar_servicio(p_empresa => $1, p_profesional => $2, p_producto => $3, p_metodo_pago => 'transferencia', p_cuenta => $4) j`,
        [N.empresaId, pedro, corte, atlas], FALTA_IMPORTE],
      ['Agenda: «Atendido, cobrar» (atender_reserva)', N.uid, `select public.atender_reserva($1,null,'transferencia',$2) j`, [turno, atlas], FALTA_IMPORTE],
      ['Alumnos: vender un paquete (vender_paquete)', N.uid,
        `select public.vender_paquete($1,$2,'8 clases',8,400000,'transferencia',null,null,$3) j`, [N.empresaId, alumno, atlas], FALTA_IMPORTE],
      ['Alumnos: cobrar una inscripción (cobrar_inscripcion)', K.uid, `select public.cobrar_inscripcion($1,'transferencia',null,$2) j`, [sinCobrar.paquete, dolaresK], FALTA_IMPORTE],
      ['Alumnos: inscribir cobrando (inscribir_alumno)', K.uid,
        `select public.inscribir_alumno(p_empresa => $1, p_cliente => $2, p_dias => $3::smallint[], p_hora_desde => '15:00'::time,
           p_hora_hasta => '16:00'::time, p_desde => $4::date, p_hasta => $5::date, p_precio_hora => 50000, p_pagado => true,
           p_metodo => 'transferencia', p_cuenta => $6) j`, [K.empresaId, alumnaK, [1, 2, 3, 4, 5], await dias(1), await dias(14), dolaresK], FALTA_IMPORTE],
      ['Lotes: el papel del silo (registrar_liquidacion)', G.uid,
        `select public.registrar_liquidacion($1,$2,$3,'Coop San Juan',2500000,$4::jsonb,$5,'transferencia','Papel') j`,
        [G.empresaId, '00000000-0000-4000-9000-000000000001', hoy, JSON.stringify([{ lote_id: norte, kg: 30000, descuentos: [{ categoria: 'Secado y acopio', monto: 500000 }] }]), dolaresG], FALTA_IMPORTE],
      ['Presupuesto: traer lo cobrado trabajando (traer_ingreso_de_trabajo)', uidPedro,
        'select public.traer_ingreso_de_trabajo($1,$2,$3) j', [N.empresaId, PP.empresaId, dolaresPedro], FALTA_IMPORTE],
      ['Billetera: «Plata sin cuenta», un movimiento (asignar_cuenta_a_sueltos)', N.uid,
        'select public.asignar_cuenta_a_sueltos(p_empresa => $1, p_cuenta => $2, p_movimiento => $3) j', [N.empresaId, atlas, suelto], FALTA_IMPORTE],
      ['Billetera: «Plata sin cuenta», todos', N.uid, 'select public.asignar_cuenta_a_sueltos(p_empresa => $1, p_cuenta => $2) j', [N.empresaId, atlas], FALTA_IMPORTE],
      ['Fiado: prestar plata (anotar_fiado)', N.uid,
        `select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_concepto => $4, p_cuenta => $5) id`, [N.empresaId, juan, 40000, 'le presté', atlas], ELEGI_PROPIA],
      ['Fiado: prestar en cuotas', N.uid, `select public.anotar_fiado($1,$2,60000,'en dos veces',null,$3,$4::jsonb) id`,
        [N.empresaId, juan, atlas, JSON.stringify([{ vence_el: '2027-03-15', monto: 30000 }, { vence_el: '2027-04-15', monto: 30000 }])], ELEGI_PROPIA],
      ['Fiado: cobrar (cobrar_fiado), repartiendo entre las cuotas', N.uid,
        `select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_metodo => 'transferencia', p_cuenta => $4) j`, [N.empresaId, juan, 60000, atlas], ELEGI_PROPIA],
      ['Fiado: cobrar una cuota', N.uid,
        `select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_metodo => 'transferencia', p_cuenta => $4, p_cuota => $5) j`,
        [N.empresaId, juan, 10000, atlas, plan.cuotas[0].id], ELEGI_PROPIA],
    ];
    const antes = await todaLaBase();
    const saldosAntes = [await saldo(atlas), await saldo(dolaresK), await saldo(dolaresG), await saldo(dolaresPedro)];
    for (const [nombre, uid, sql, args, mensaje] of PUERTAS) {
      rechazado(nombre, await intento(uid, sql, args), mensaje);
      corridas++;
      const sucias = tocadas(antes, await todaLaBase());
      if (sucias.length > 0) { fallos++; console.log(`  ✗   y dejó algo a medias en: ${sucias.join(', ')}`); }
    }
    ok(`las ${PUERTAS.length} puertas: después de cada una, las ${TABLAS.length} tablas de la base quedaron idénticas (ni venta, ni pago, ni línea de fiado, ni cuota, ni turno cobrado)`,
      tocadas(antes, await todaLaBase()), []);
    ok('  y las cuentas en dólares no se movieron', [await saldo(atlas), await saldo(dolaresK), await saldo(dolaresG), await saldo(dolaresPedro)], saldosAntes);
    ok('  el turno sigue pendiente y lo suelto sigue suelto',
      [(await uno('select estado::text e from public.turnos_reserva where id = $1', [turno])).e, (await fila(suelto)).cuenta_id], ['pendiente', null]);

    // Lo que SÍ pasa, porque no mueve la cuenta.
    r = await intento(N.uid, `select public.registrar_pago_deuda($1,1000,null,false,'transferencia','',$2) j`, [deuda, atlas]);
    ok('un pago de deuda SIN anotar el gasto no crea ningún movimiento: no hay nada que rechazar, y la cuenta en dólares no se mueve',
      [r.ok, r.ok ? r.valor.rows[0].j.movimiento_id ?? null : r.error, await saldo(atlas)], [true, null, saldosAntes[0]]);
    // Y con una cuenta propia, todas esas puertas siguen andando (una de cada tipo).
    aceptado('con una cuenta propia, Vender sigue andando', await intento(N.uid,
      `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'transferencia', p_cuenta => $3) id`, [N.empresaId, items(1, 30000, 'Crema'), itau]));
    aceptado('  y cobrar una cuota del fiado', await intento(N.uid,
      `select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => $3, p_metodo => 'transferencia', p_cuenta => $4, p_cuota => $5) j`,
      [N.empresaId, juan, 10000, itau, plan.cuotas[0].id]));
    aceptado('  y asignar lo suelto', await intento(N.uid, 'select public.asignar_cuenta_a_sueltos(p_empresa => $1, p_cuenta => $2, p_movimiento => $3) j', [N.empresaId, itau, suelto]));
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('6 · Archivar, empezar de cero y los candados');
  // ═════════════════════════════════════════════════════════════════════
  {
    const wise = await cuenta(N, 'Wise', 'billetera', 500, [], 'USD');
    await pase(N, atlas, wise, 84);
    const antes = (await T.billetera(N)).totales_otras;
    const q = await J(N.uid, 'select public.quitar_cuenta_dinero(p_empresa => $1, p_id => $2) j', [N.empresaId, wise]);
    const b = await T.billetera(N);
    ok('quitar una cuenta en dólares con historia la archiva; sale de las cuentas y del total de dólares, con lo que tenía',
      [q.archivada, antes, b.totales_otras, b.cuentas_otras.map((c) => c.nombre), await saldo(wise)],
      [true, [{ moneda: 'USD', total: 10934, cuentas: 3 }], [{ moneda: 'USD', total: 10350, cuentas: 2 }], ['Atlas dólares', 'Binance'], 584]);
    rechazado('pasarle plata a la archivada', await transferir(N, atlas, wise, 10), NO_EXISTE);
    ok('ni aparece para elegir', (await paraElegir(N, true)).map((c) => c.nombre), ['Efectivo', 'Itaú', 'Atlas dólares', 'Binance']);

    // UN GASTO MANDADO CON SU IMPORTE EN DÓLARES PARA UNA CUENTA QUE YA NO
    // ESTÁ. Gastos quedó abierto en otro teléfono, con la lista de antes:
    // manda la Wise y «US$ 2,70». La regla de la 118 descarta la archivada y
    // lo mandaría por su forma de pago: saldrían Gs. 20.000 del Itaú con la
    // pantalla diciendo «Salen US$ 2,70 de Wise». Se rechaza entero.
    const itauAntes = await saldo(itau);
    {
      const antesDe = await todaLaBase();
      rechazado('un gasto con su importe en dólares para la cuenta archivada (una lista vieja): no sale de otra cuenta, se rechaza',
        await cargar(N, wise, 20000, 2.7), NO_EXISTE);
      rechazado('  también si esa forma de pago no la recibe ninguna cuenta (quedaría suelto)', await cargar(N, wise, 20000, 2.7, { metodo: 'otro' }), NO_EXISTE);
      rechazado('  o si es un ingreso', await cargar(N, wise, 20000, 2.7, { tipo: 'ingreso', metodo: 'transferencia' }), NO_EXISTE);
      rechazado('con el importe para una cuenta de OTRO negocio', await cargar(N, cajaU, 20000, 2.7), NO_EXISTE);
      rechazado('  o para una que no existe (se borró)', await cargar(N, UUID_QUE_NO_EXISTE, 20000, 2.7), NO_EXISTE);
      ok('nada de eso tocó la base: ni el Itaú, ni la Wise, ni una fila', [tocadas(antesDe, await todaLaBase()), await saldo(itau), await saldo(wise)], [[], itauAntes, 584]);
    }
    // El código publicado no manda `monto_cuenta` (para él no existe): con
    // la misma cuenta archivada sigue valiendo la regla de la 118, tal cual.
    r = await intento(N.uid, MOV, [N.empresaId, 'gasto', 'Lista vieja', 'Servicios', 20000, 'tarjeta', wise]);
    ok('el mismo gasto SIN importe de cuenta (lo que manda el código publicado) cae por su forma de pago, como con cualquier archivada (118)',
      [r.ok ? await fila(r.valor.rows[0].id) : r.error, (await saldo(itau)) - itauAntes, await saldo(wise)],
      [{ cuenta_id: itau, monto: 20000, monto_cuenta: null, estado: 'activo', metodo: 'tarjeta' }, -20000, 584]);
    r = await intento(N.uid, MOV, [N.empresaId, 'gasto', 'Cuenta ajena', 'Servicios', 1000, 'tarjeta', cajaU]);
    ok('  y con la cuenta de otro negocio, igual que siempre: se descarta', r.ok ? (await fila(r.valor.rows[0].id)).cuenta_id : r.error, itau);
    r = await cargar(N, itau, 1000, 0.14);
    ok('  con una cuenta propia que sí está, el importe de más se guarda en null, como antes',
      r.ok ? await fila(r.valor.rows[0].id) : r.error, { cuenta_id: itau, monto: 1000, monto_cuenta: null, estado: 'activo', metodo: 'tarjeta' });
  }
  {
    // DESHACER UN PASE CUANDO UNA DE SUS DOS CUENTAS YA SE QUITÓ. Una
    // archivada no se ve, no se reactiva y no acepta pases: borrar el pase
    // le devolvería (o le sacaría) plata a una cuenta que nadie ve, y lo
    // que está a la vista ganaría o perdería ese importe sin contraparte.
    const D = await H.montarEmpresa(db, { email: 'pases@archivados.test', nombre: 'Pases Archivados' });
    const itauD = await cuenta(D, 'Itaú', 'banco', 20000000, ['transferencia', 'tarjeta']);
    const atlasD = await cuenta(D, 'Atlas dólares', 'banco', 10000, [], 'USD');
    const quitar = async (id) => (await J(D.uid, 'select public.quitar_cuenta_dinero(p_empresa => $1, p_id => $2) j', [D.empresaId, id])).archivada;
    const aLaVista = async () => { const b = await T.billetera(D); return [b.total, b.totales_otras.map((t) => [t.moneda, t.total])]; };
    const pasesDe = async (id) => (await J(D.uid, 'select public.transferencias_de_cuenta($1,$2) j', [D.empresaId, id]))
      .map((x) => [x.otra_cuenta, x.monto, x.otro_monto, x.otra_activa]);

    // (a) Se quitó la cuenta DE LA QUE SALIÓ. «Caja vieja» (Gs. 9.000.000)
    //     compró US$ 1.000 y después se quitó. Deshacer hacía desaparecer
    //     esos US$ 1.000 de la vista y devolvía Gs. 7.400.000 a la archivada.
    const cajaVieja = await cuenta(D, 'Caja vieja', 'efectivo', 9000000, []);
    const compra = await pase(D, cajaVieja, atlasD, 7400000, 1000);
    ok('(quitar la caja que compró los dólares: queda archivada, con lo que tenía)', [await quitar(cajaVieja), await saldo(cajaVieja)], [true, 1600000]);
    ok('el pase se sigue viendo en la cuenta en dólares, y dice que la otra ya no está',
      await pasesDe(atlasD), [['Caja vieja', 1000, -7400000, false]]);
    let antesDe = await todaLaBase();
    let vista = await aLaVista();
    rechazado('deshacer un pase cuya cuenta de origen está archivada', await deshacer(D, compra.par), CUENTA_QUITADA);
    ok('  no se deshizo nada: las dos filas siguen, ningún saldo cambió y lo que se ve es lo mismo (Gs. 20.000.000 y US$ 11.000)',
      [tocadas(antesDe, await todaLaBase()), await n('select count(*) n from public.ajustes_cuenta where par = $1', [compra.par]),
        await saldo(atlasD), await saldo(cajaVieja), await aLaVista(), vista],
      [[], 2, 11000, 1600000, vista, [20000000, [['USD', 11000]]]]);

    // (b) Se quitó la cuenta A LA QUE ENTRÓ. Se vendieron US$ 1.000 a una
    //     caja de paso, la caja los depositó en el Itaú y, en cero, se quitó.
    //     Deshacer hacía aparecer US$ 1.000 que ya se habían cambiado y
    //     depositado, y dejaba la archivada en -7.400.000.
    const cajaDePaso = await cuenta(D, 'Caja de paso', 'efectivo', 0, []);
    const venta = await pase(D, atlasD, cajaDePaso, 1000, 7400000);
    const deposito = await pase(D, cajaDePaso, itauD, 7400000);
    ok('(quitar la caja de paso, ya en cero: tiene historia, queda archivada)', [await quitar(cajaDePaso), await saldo(cajaDePaso)], [true, 0]);
    antesDe = await todaLaBase();
    vista = await aLaVista();
    rechazado('deshacer un pase cuya cuenta de destino está archivada', await deshacer(D, venta.par), CUENTA_QUITADA);
    rechazado('  y el otro pase de esa caja, entre dos cuentas propias', await deshacer(D, deposito.par), CUENTA_QUITADA);
    ok('  no se deshizo nada: lo que se ve sigue siendo Gs. 27.400.000 y US$ 10.000, y la archivada sigue en cero',
      [tocadas(antesDe, await todaLaBase()), await saldo(atlasD), await saldo(itauD), await saldo(cajaDePaso), await aLaVista(), vista],
      [[], 10000, 27400000, 0, vista, [27400000, [['USD', 10000]]]]);
    ok('  desde el Itaú también se ve que la otra cuenta de ese pase ya no está', await pasesDe(itauD), [['Caja de paso', 7400000, -7400000, false]]);

    // (c) Entre dos cuentas que siguen en la billetera, se deshace como siempre.
    const otraCompra = await pase(D, itauD, atlasD, 740000, 100);
    ok('un pase entre dos cuentas activas dice `otra_activa: true`…',
      (await pasesDe(atlasD)).filter(([nombre]) => nombre === 'Itaú'), [['Itaú', 100, -740000, true]]);
    aceptado('  …y se deshace', await deshacer(D, otraCompra.par));
    ok('  la plata volvió a las dos', [await saldo(itauD), await saldo(atlasD)], [27400000, 10000]);

    // (d) El vencido lee primero su candado, también con una archivada en el pase.
    await T.vencer(D.empresaId);
    rechazado('vencido, con una cuenta archivada en el pase: habla el candado, no esto', await deshacer(D, compra.par), CANDADO);
  }
  {
    // Empezar de cero (115).
    const Z = await H.montarEmpresa(db, { email: 'bazar@cero.test', nombre: 'Bazar De Cero' });
    Z.nombre = 'Bazar De Cero';
    const cajaZ = await cuenta(Z, 'Caja', 'efectivo', 1000000, ['efectivo']);
    const dolaresZ = await cuenta(Z, 'Dólares', 'banco', 2000, [], 'USD');
    await pase(Z, cajaZ, dolaresZ, 740000, 100);
    await ajustar(Z, dolaresZ, 2105.5);
    aceptado('(un gasto con la de dólares, antes de vaciar)', await cargar(Z, dolaresZ, 116727, 15.99));
    await val(Z.uid, MOV, [Z.empresaId, 'gasto', 'Luz', 'Servicios', 50000, 'efectivo', null]);
    aceptado('(y una cotización)', await cotizar(Z, 'USD', 7400));
    ok('antes de vaciar: 2.000 + 100 del pase + 5,50 del ajuste − 15,99 del gasto', [await saldo(dolaresZ), await saldo(cajaZ)], [2089.51, 210000]);
    aceptado('empezar de cero', await intento(Z.uid, 'select public.vaciar_empresa($1,$2) j', [Z.empresaId, Z.nombre]));
    ok('se van los movimientos; cada cuenta vuelve a su saldo inicial más sus ajustes y pases, en SU moneda; la cotización queda',
      [await n('select count(*) n from public.movimientos where empresa_id = $1', [Z.empresaId]), await saldo(dolaresZ), await saldo(cajaZ),
        await filas('select moneda, valor::float as valor from public.cotizaciones_moneda where empresa_id = $1', [Z.empresaId])],
      [0, 2105.5, 260000, [{ moneda: 'USD', valor: 7400 }]]);
  }
  {
    // Borrar la cuenta entera (129): los movimientos y las cuentas se van en
    // cascada, y el SET NULL de `movimientos.cuenta_id` pasa por el disparador.
    const jefe = await H.crearUsuario(db, 'jefe@orden.test');
    await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe]);
    const X = await H.montarEmpresa(db, { email: 'se-va@negocio.test', nombre: 'Negocio Que Se Va' });
    const cajaX = await cuenta(X, 'Caja', 'efectivo', 1000000, ['efectivo']);
    const dolaresX = await cuenta(X, 'Dólares', 'banco', 2000, [], 'USD');
    await pase(X, cajaX, dolaresX, 740000, 100);
    aceptado('(un negocio con un gasto pagado en dólares, un pase y una cotización)', await cargar(X, dolaresX, 116727, 15.99));
    await val(X.uid, MOV, [X.empresaId, 'gasto', 'Luz', 'Servicios', 50000, 'efectivo', null]);
    await cotizar(X, 'USD', 7400);
    aceptado('la administración lo borra entero', await T.servicio(
      'select public.borrar_cuenta_entera(p_actor => $1, p_empresa => $2, p_confirmacion => $3, p_solo_comprobar => false) j',
      [jefe, X.empresaId, 'Negocio Que Se Va']));
    ok('  y no queda nada suyo: ni la cuenta, ni sus cuentas de dinero, ni movimientos, ni pases, ni cotizaciones',
      await uno(`select (select count(*)::int from public.empresas where id = $1) as empresa,
                        (select count(*)::int from public.cuentas_dinero where empresa_id = $1) as cuentas,
                        (select count(*)::int from public.movimientos where empresa_id = $1) as movimientos,
                        (select count(*)::int from public.ajustes_cuenta where empresa_id = $1) as pases,
                        (select count(*)::int from public.cotizaciones_moneda where empresa_id = $1) as cotizaciones`, [X.empresaId]),
      { empresa: 0, cuentas: 0, movimientos: 0, pases: 0, cotizaciones: 0 });
  }
  {
    // El negocio vencido (111).
    const V = await H.montarEmpresa(db, { email: 'kiosco@vencido.test', nombre: 'Kiosco Vencido' });
    const cajaV = await cuenta(V, 'Caja', 'efectivo', 1000000, ['efectivo']);
    const dolaresV = await cuenta(V, 'Dólares', 'banco', 500, [], 'USD');
    const paseV = await pase(V, cajaV, dolaresV, 74000, 10);
    await cotizar(V, 'USD', 7400);
    await T.vencer(V.empresaId);
    const antes = await todaLaBase();
    rechazado('vencido: crear una cuenta en dólares', await crearCuenta(V, 'Otra', 'banco', 10, [], 'USD'), CANDADO);
    rechazado('vencido: pasar plata entre monedas', await transferir(V, cajaV, dolaresV, 74000, 10), CANDADO);
    rechazado('vencido: ajustar la de dólares', await ajustar(V, dolaresV, 400), CANDADO);
    rechazado('vencido: cambiar la cotización', await cotizar(V, 'USD', 7500), CANDADO);
    rechazado('vencido: guardar una cotización nueva', await cotizar(V, 'BRL', 1350), CANDADO);
    rechazado('vencido: borrar la cotización', await cotizar(V, 'USD', null), CANDADO);
    rechazado('vencido: deshacer un pase (el borrado no pasa por el candado: habla igual)', await deshacer(V, paseV.par), CANDADO);
    rechazado('vencido: un gasto con la de dólares', await cargar(V, dolaresV, 116727, 15.99), CANDADO);
    rechazado('vencido: y si además no dice el importe, lee eso (ese control dispara antes que el candado); tampoco entra',
      await intento(V.uid, MOV, [V.empresaId, 'gasto', 'Sin importe', 'Servicios', 50000, 'tarjeta', dolaresV]), FALTA_IMPORTE);
    rechazado('vencido: quitar la cuenta', await intento(V.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [V.empresaId, dolaresV]), CANDADO);
    ok('vencido: nada de eso tocó la base', tocadas(antes, await todaLaBase()), []);
    const b = await T.billetera(V);
    ok('vencido: leer sigue andando (la billetera, los pases y las cuentas para elegir)',
      [b.totales_otras, b.cotizaciones.map((c) => [c.moneda, c.valor]),
        (await J(V.uid, 'select public.transferencias_de_cuenta($1,$2) j', [V.empresaId, dolaresV])).length, (await paraElegir(V, true)).length],
      [[{ moneda: 'USD', total: 510, cuentas: 1 }], [['USD', 7400]], 1, 2]);
  }
  {
    // La personal en Gratis (110).
    const F = await personal('gratis@correo.test', 'Finanzas en Gratis');
    const cajaF = await cuenta(F, 'Billetera', 'efectivo', 300000, ['efectivo']);
    const dolaresF = await cuenta(F, 'Dólares', 'banco', 500, [], 'USD');
    const paseF = await pase(F, cajaF, dolaresF, 74000, 10);
    await cotizar(F, 'USD', 7400);
    // Y una cuenta en dólares que quitó cuando todavía estaba en la prueba.
    const viejaF = await cuenta(F, 'Dólares viejos', 'banco', 50, [], 'USD');
    await ajustar(F, viejaF, 60);
    await val(F.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [F.empresaId, viejaF]);
    await T.vencer(F.empresaId);
    ok('(la personal quedó en Gratis)', (await uno('select public.es_gratis_personal($1) g', [F.empresaId])).g, true);
    const antes = await todaLaBase();
    rechazado('Gratis: crear una cuenta en dólares', await crearCuenta(F, 'Otra', 'banco', 10, [], 'USD'), ES_DEL_PRO);
    rechazado('Gratis: pasar plata entre monedas', await transferir(F, cajaF, dolaresF, 74000, 10), ES_DEL_PRO);
    rechazado('Gratis: ajustar la de dólares', await ajustar(F, dolaresF, 400), ES_DEL_PRO);
    rechazado('Gratis: cambiar la cotización', await cotizar(F, 'USD', 7500), ES_DEL_PRO);
    rechazado('Gratis: borrar la cotización', await cotizar(F, 'USD', null), ES_DEL_PRO);
    rechazado('Gratis: deshacer un pase', await deshacer(F, paseF.par), ES_DEL_PRO);
    ok('Gratis: nada de eso tocó la base', tocadas(antes, await todaLaBase()), []);
    r = await cargar(F, dolaresF, 116727, 15.99, { metodo: 'efectivo' });
    ok('Gratis: un gasto armado a mano con la cuenta en dólares cae por su forma de pago, como todos sus gastos; la de dólares no se mueve',
      [r.ok ? await fila(r.valor.rows[0].id) : r.error, await saldo(dolaresF), await saldo(cajaF)],
      [{ cuenta_id: cajaF, monto: 116727, monto_cuenta: null, estado: 'activo', metodo: 'efectivo' }, 510, 300000 - 74000 - 116727]);
    r = await intento(F.uid, MOV, [F.empresaId, 'gasto', 'Sin importe', 'Comida', 1000, 'transferencia', dolaresF]);
    ok('  y sin importe, igual: nadie recibe la transferencia, queda sin cuenta',
      r.ok ? await fila(r.valor.rows[0].id) : r.error, { cuenta_id: null, monto: 1000, monto_cuenta: null, estado: 'activo', metodo: 'transferencia' });
    r = await cargar(F, viejaF, 5000, 0.7, { metodo: 'efectivo' });
    ok('  y con una cuenta en dólares ya archivada en el pedido, lo mismo: en Gratis nadie elige cuenta, cae por su forma de pago',
      [r.ok ? await fila(r.valor.rows[0].id) : r.error, await saldo(viejaF), (await uno('select activa from public.cuentas_dinero where id = $1', [viejaF])).activa],
      [{ cuenta_id: cajaF, monto: 5000, monto_cuenta: null, estado: 'activo', metodo: 'efectivo' }, 60, false]);
    ok('Gratis: las cuentas en otra moneda quedan como las dejó', (await T.billetera(F)).totales_otras, [{ moneda: 'USD', total: 510, cuentas: 1 }]);
  }
  {
    // El disponible de la personal.
    await cuenta(P, 'Dólares', 'banco', 10000, [], 'USD');
    let rp = await J(P.uid, 'select public.resumen_personal($1) j', [P.empresaId]);
    ok('personal con una cuenta en dólares: el disponible sigue saliendo SOLO de las propias; los dólares van aparte',
      [rp.en_cuentas, rp.disponible, porDia(rp, 3075000), rp.en_otras_monedas], [3075000, 3075000, true, [{ moneda: 'USD', total: 10000 }]]);
    await cuenta(P, 'Reales', 'efectivo', 500, [], 'BRL');
    await cuenta(P, 'Más dólares', 'billetera', 250.5, [], 'USD');
    rp = await J(P.uid, 'select public.resumen_personal($1) j', [P.empresaId]);
    ok('  con reales y más dólares: un total por moneda, en orden, y el disponible igual',
      [rp.disponible, rp.en_otras_monedas], [3075000, [{ moneda: 'BRL', total: 500 }, { moneda: 'USD', total: 10250.5 }]]);
    const S = await personal('solo@dolares.test', 'Solo dólares');
    const antes = await J(S.uid, 'select public.resumen_personal($1) j', [S.empresaId]);
    await cuenta(S, 'Dólares', 'banco', 500, [], 'USD');
    rp = await J(S.uid, 'select public.resumen_personal($1) j', [S.empresaId]);
    ok('quien tiene SOLO una cuenta en dólares queda con el cálculo por ciclo, como quien no cargó ninguna (no le aparece «disponible: 500»)',
      [rp.desde_la_billetera ?? null, rp.en_cuentas ?? null, rp.disponible, rp.en_otras_monedas, { ...rp, en_otras_monedas: [] }],
      [null, null, antes.disponible, [{ moneda: 'USD', total: 500 }], antes]);
    const b = await T.billetera(S);
    ok('  y la billetera no le reclama formas de pago sin cuenta: no tiene ninguna propia', [b.total, b.cuentas, b.metodos_sin_cuenta], [0, [], []]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('7 · Es simétrico: un negocio en dólares con una caja en guaraníes (y uno en reales con una en dólares)');
  // ═════════════════════════════════════════════════════════════════════
  {
    const cajaG = await cuenta(U, 'Caja guaraníes', 'efectivo', 7400000.4, [], 'PYG');
    let b = await T.billetera(U);
    ok('la moneda del negocio es el dólar; su total, en dólares e intacto; los guaraníes, aparte y sin centavos',
      [b.moneda, b.total, b.cuentas.map((c) => c.nombre), b.cuentas_otras.map((c) => [c.nombre, c.moneda, c.saldo]), b.totales_otras],
      ['USD', 25000, ['Caja', 'Banco'], [['Caja guaraníes', 'PYG', 7400000]], [{ moneda: 'PYG', total: 7400000, cuentas: 1 }]]);
    const j = await pase(U, bancoU, cajaG, 500, 3700000);
    ok('pasar del banco a la caja en guaraníes: salen US$ 500, entran Gs. 3.700.000',
      [{ ...j, par: null }, await saldo(bancoU), await saldo(cajaG)],
      [{ ok: true, par: null, salio: 500, entro: 3700000, moneda_desde: 'USD', moneda_hacia: 'PYG' }, 19600, 11100000]);
    const g0 = (await resumen(U)).gastos;
    r = await cargar(U, cajaG, 300, 2190000, { metodo: 'efectivo', descripcion: 'Flete' });
    const flete = r.valor.rows[0].id;
    ok('un gasto de US$ 300 pagado con Gs. 2.190.000 de la caja: el gasto queda en dólares, la caja baja en guaraníes',
      [await fila(flete), await saldo(cajaG), (await resumen(U)).gastos - g0, await saldo(cajaU)],
      [{ cuenta_id: cajaG, monto: 300, monto_cuenta: 2190000, estado: 'activo', metodo: 'efectivo' }, 8910000, 300, 4900]);
    aceptado('anularlo', await intento(U.uid, `select public.anular_movimiento($1,'me equivoqué') id`, [flete]));
    ok('  la caja recupera sus guaraníes', await saldo(cajaG), 11100000);
    r = await cargar(U, cajaG, 10.5, 77700.6, { metodo: 'efectivo', descripcion: 'Yerba' });
    ok('del lado del guaraní no hay centavos: 77.700,6 → 77.701', [(await fila(r.valor.rows[0].id)).monto_cuenta, await saldo(cajaG)], [77701, 11022299]);
    rechazado('  y lo que redondea a cero guaraníes, no', await cargar(U, cajaG, 10, 0.4, { metodo: 'efectivo' }), FALTA_IMPORTE);
    const vuelta = await pase(U, cajaG, bancoU, 740000.4, 100.555);
    ok('la vuelta: salen Gs. 740.000 (sin centavos) y entran US$ 100,56', [vuelta.salio, vuelta.entro, await saldo(cajaG), await saldo(bancoU)], [740000, 100.56, 10282299, 19700.56]);
    r = await ajustar(U, cajaG, 10281299.6);
    ok('ajustarla: la diferencia, sin centavos', [r.valor.rows[0].j.diferencia, await saldo(cajaG)], [-999, 10281300]);
    ok('ni una fila de esa caja tiene centavos',
      [await n('select count(*) n from public.ajustes_cuenta where cuenta_id = $1 and monto <> round(monto)', [cajaG]),
        await n('select count(*) n from public.movimientos where cuenta_id = $1 and monto_cuenta <> round(monto_cuenta)', [cajaG])], [0, 0]);
    rechazado('el fiado tampoco presta desde ahí', await intento(U.uid,
      `select public.anotar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 10, p_concepto => 'no', p_cuenta => $3) id`,
      [U.empresaId, await cliente(U, 'Ana', '0981 111 222'), cajaG]), ELEGI_PROPIA);
    rechazado('ni se vende a esa caja', await intento(U.uid,
      `select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'efectivo', p_cuenta => $3) id`, [U.empresaId, items(1, 10, 'Crema'), cajaG]), FALTA_IMPORTE);
    rechazado('la cotización de su propia moneda (el dólar), no', await cotizar(U, 'USD', 1), ES_TU_MONEDA);
    r = await cotizar(U, 'PYG', 0.0001351351);
    ok('la del guaraní se guarda en la misma dirección que todas: cuánto vale 1 guaraní en dólares (1 / 7400)',
      [r.valor.rows[0].j.moneda, r.valor.rows[0].j.valor], ['PYG', 0.0001351351]);
    b = await T.billetera(U);
    ok('y al final: dólares por un lado, guaraníes por el otro',
      [b.total, b.totales_otras, (await paraElegir(U, true)).filter((c) => c.otra).map((c) => [c.nombre, c.moneda, c.cotizacion])],
      [24600.56, [{ moneda: 'PYG', total: 10281300, cuentas: 1 }], [['Caja guaraníes', 'PYG', 0.0001351351]]]);
    rechazado('y su caja de siempre, en dólares, tampoco se pasa a guaraníes',
      await editar(U, cajaU, 'Caja', 'efectivo', ['efectivo'], 'PYG'), NO_SE_CAMBIA);
  }
  {
    const R = await H.montarEmpresa(db, { email: 'loja@brasil.test', nombre: 'Loja Brasil', moneda: 'BRL' });
    const contaR = await cuenta(R, 'Conta', 'banco', 50000, ['transferencia']);
    const dolaresR = await cuenta(R, 'Dólares', 'banco', 0, [], 'USD');
    const j = await pase(R, contaR, dolaresR, 5400.505, 1000.255);
    ok('un negocio en reales con una cuenta en dólares: dos importes, cada uno con sus centavos',
      [{ ...j, par: null }, await saldo(contaR), await saldo(dolaresR), (await T.billetera(R)).moneda],
      [{ ok: true, par: null, salio: 5400.51, entro: 1000.26, moneda_desde: 'BRL', moneda_hacia: 'USD' }, 44599.49, 1000.26, 'BRL']);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('8 · La cotización la escribe la persona, y no entra en ningún saldo');
  // ═════════════════════════════════════════════════════════════════════
  {
    const saldosAntes = JSON.stringify(await filas('select id, public.saldo_cuenta_dinero(id)::text s from public.cuentas_dinero order by id'));
    const periodoN = JSON.stringify(canon(await resumen(N)));
    r = await cotizar(N, ' usd ', 7400);
    const guardada = r.ok ? r.valor.rows[0].j : { error: r.error };
    ok('guardar a cuánto está el dólar', [guardada.moneda, guardada.valor, typeof guardada.desde], ['USD', 7400, 'string']);
    ok('aparece en la billetera con su fecha, y en las cuentas para elegir de Gastos',
      [(await T.billetera(N)).cotizaciones, (await paraElegir(N, true)).filter((c) => c.otra).map((c) => c.cotizacion)],
      [[{ moneda: 'USD', valor: 7400, desde: guardada.desde }], [7400, 7400]]);
    await cotizar(N, 'USD', 7350);
    await cotizar(N, 'BRL', 1350.5);
    ok('una por moneda: guardar de nuevo la pisa',
      await filas('select moneda, valor::float as valor from public.cotizaciones_moneda where empresa_id = $1 order by moneda', [N.empresaId]),
      [{ moneda: 'BRL', valor: 1350.5 }, { moneda: 'USD', valor: 7350 }]);
    rechazado('la de la moneda propia', await cotizar(N, 'PYG', 1), ES_TU_MONEDA);
    rechazado('una moneda que no existe', await cotizar(N, 'XXX', 10), NO_CONOCEMOS);
    rechazado('sin moneda', await cotizar(N, null, 10), NO_CONOCEMOS);
    rechazado('en cero', await cotizar(N, 'USD', 0), 'Poné a cuánto está el cambio');
    rechazado('negativa', await cotizar(N, 'USD', -7400), 'Poné a cuánto está el cambio');
    rechazado('tan chica que se guardaría como cero', await cotizar(N, 'USD', 0.00000000001), 'Poné a cuánto está el cambio');
    rechazado('con ceros de más', await cotizar(N, 'USD', 100000001), 'Esa cotización es demasiado grande');
    rechazado('un vendedor', await cotizar(N, 'USD', 7500, vendedor), SOLO_DUENO);
    rechazado('alguien de otra empresa', await cotizar(N, 'USD', 7500, U.uid), SOLO_DUENO);
    r = await cotizar(N, 'BRL', null);
    ok('con el valor en null se borra', [r.ok ? r.valor.rows[0].j : r.error, await n('select count(*) n from public.cotizaciones_moneda where empresa_id = $1', [N.empresaId])],
      [{ moneda: 'BRL', valor: null, desde: null }, 1]);
    aceptado('  borrar una que no hay no es un error', await cotizar(N, 'EUR', null));
    ok('nada de esto movió un saldo ni el período: la cotización solo sirve para el «≈»',
      [JSON.stringify(await filas('select id, public.saldo_cuenta_dinero(id)::text s from public.cuentas_dinero order by id')) === saldosAntes,
        JSON.stringify(canon(await resumen(N))) === periodoN], [true, true]);
  }
  {
    // La moneda del negocio (051).
    const cambiarMoneda = (C, moneda) => T.sinSesion('update public.empresas set moneda = $2 where id = $1', [C.empresaId, moneda]);
    const monedaDe = async (C) => (await uno('select moneda from public.empresas where id = $1', [C.empresaId])).moneda;
    const S1 = await H.montarEmpresa(db, { email: 'nuevo@negocio.test', nombre: 'Negocio Nuevo' });
    const cajaS = await cuenta(S1, 'Caja', 'efectivo', 1000, ['efectivo']);
    const dolaresS = await cuenta(S1, 'Dólares', 'banco', 500, [], 'USD');
    await cotizar(S1, 'USD', 7400);
    rechazado('sin movimientos pero con una cuenta ACTIVA en otra moneda, la moneda del negocio no se cambia', await cambiarMoneda(S1, 'USD'), QUITALAS);
    ok('  y sigue como estaba', await monedaDe(S1), 'PYG');
    await pase(S1, cajaS, dolaresS, 740, 0.1);
    ok('quitada esa cuenta (queda archivada, tiene un pase)', (await J(S1.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [S1.empresaId, dolaresS])).archivada, true);
    aceptado('  se puede', await cambiarMoneda(S1, 'BRL'));
    const b = await T.billetera(S1);
    ok('  la moneda cambió, las cotizaciones (que eran contra la anterior) se borraron y la caja propia la siguió',
      [await monedaDe(S1), b.moneda, b.cotizaciones, await n('select count(*) n from public.cotizaciones_moneda where empresa_id = $1', [S1.empresaId]), b.cuentas.map((c) => c.nombre), b.cuentas_otras],
      ['BRL', 'BRL', [], 0, ['Caja'], []]);
    aceptado('guardar el nombre sin tocar la moneda no pasa por nada de esto',
      await T.sinSesion(`update public.empresas set nombre = 'Negocio Nuevo SA' where id = $1`, [S1.empresaId]));
    rechazado('y con movimientos, el mensaje de siempre de la 051 va primero', await cambiarMoneda(N, 'USD'), 'Ya tenés movimientos cargados');
    ok('  el almacén conserva sus cotizaciones', await n('select count(*) n from public.cotizaciones_moneda where empresa_id = $1', [N.empresaId]), 1);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('9 · Nunca se suman monedas distintas');
  // ═════════════════════════════════════════════════════════════════════
  {
    await cuenta(N, 'Reales', 'efectivo', 500, [], 'BRL');
    const b = await T.billetera(N);
    const suma = (lista) => Math.round(lista.reduce((s, c) => s + c.saldo, 0) * 100) / 100;
    const propias = suma(b.cuentas);
    const porMoneda = {};
    for (const c of b.cuentas_otras) porMoneda[c.moneda] = Math.round(((porMoneda[c.moneda] ?? 0) + c.saldo) * 100) / 100;
    ok('el almacén tiene guaraníes, dólares y reales', [b.cuentas.length, Object.keys(porMoneda).sort()], [2, ['BRL', 'USD']]);
    ok('`total` es la suma de las cuentas en guaraníes y de NINGUNA más', [b.total, b.total === propias], [propias, true]);
    ok('cada total de `totales_otras` es la suma de las cuentas de ESA moneda, una fila por moneda, ordenadas',
      b.totales_otras.map((t) => [t.moneda, t.total, t.cuentas]),
      [['BRL', porMoneda.BRL, b.cuentas_otras.filter((c) => c.moneda === 'BRL').length], ['USD', porMoneda.USD, b.cuentas_otras.filter((c) => c.moneda === 'USD').length]]);
    const todos = JSON.stringify(b);
    const mezclas = [propias + porMoneda.USD, propias + porMoneda.BRL, porMoneda.USD + porMoneda.BRL, propias + porMoneda.USD + porMoneda.BRL];
    ok('en toda la respuesta no hay ningún número que sea la suma de dos monedas', mezclas.filter((x) => todos.includes(String(Math.round(x * 100) / 100))), []);

    // Y en la base no hay otra función que sume saldos de cuentas: estas son
    // TODAS las que leen un saldo. Si mañana aparece otra, esta lista falla
    // y obliga a mirar que no mezcle monedas.
    const leenSaldos = (await filas(
      `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
          and (p.prosrc like '%saldo_cuenta_dinero%' or p.prosrc like '%saldo_inicial%') order by 1`)).map((x) => x.proname);
    ok('las funciones de la base que leen el saldo de una cuenta son estas seis', leenSaldos,
      ['ajustar_saldo_cuenta', 'asignar_cuenta_a_sueltos', 'billetera', 'guardar_cuenta_dinero', 'resumen_personal', 'saldo_cuenta_dinero']);
    const cuerpo = async (nombre) => (await uno(`select prosrc from pg_proc where pronamespace = 'public'::regnamespace and proname = $1`, [nombre])).prosrc;
    const veces = (texto, parte) => texto.split(parte).length - 1;
    for (const nombre of ['billetera', 'resumen_personal']) {
      const src = await cuerpo(nombre);
      // Cada vez que recorre las cuentas activas, o son las propias o son las de otra moneda (y ahí agrupa por moneda).
      const recorre = veces(src, 'c.activa');
      const propias2 = veces(src, 'c.activa and c.moneda is null');
      const otras = veces(src, 'c.activa and c.moneda is not null');
      ok(`${nombre}(): las ${recorre} veces que recorre las cuentas activas dice de qué moneda (${propias2} las propias, ${otras} las otras), y las otras van agrupadas por moneda`,
        [recorre === propias2 + otras, propias2 > 0, otras > 0, /group by (c\.moneda|x->>'moneda')/.test(src)], [true, true, true, true]);
    }
    ok('ajustar, asignar y guardar miran UNA cuenta por vez: ninguna suma varias',
      (await Promise.all(['ajustar_saldo_cuenta', 'asignar_cuenta_a_sueltos', 'guardar_cuenta_dinero'].map(cuerpo))).filter((src) => /sum\s*\(/i.test(src)).length, 0);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('10 · Lo que anota el sistema sin sesión (como el ingreso de Bancard)');
  // ═════════════════════════════════════════════════════════════════════
  {
    const O = await H.montarEmpresa(db, { email: 'orden@orden.test', nombre: 'Orden SA' });
    const bancoO = await cuenta(O, 'Banco', 'banco', 0, ['tarjeta', 'transferencia']);
    const dolaresO = await cuenta(O, 'Dólares', 'banco', 1000, [], 'USD');
    // El insert de bancard_confirmar (130): sin sesión, con tarjeta y sin cuenta.
    const BANCARD = `insert into public.movimientos (empresa_id, tipo, estado, fecha, descripcion, categoria,
        subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por)
      values ($1, 'ingreso', 'activo', public.hoy_empresa($1), 'Suscripción Cliente · Bancard 1000001', 'Suscripciones',
        190000, 0, 190000, 0, 'tarjeta', 'Cliente', null) returning id`;
    r = await T.sinSesion(BANCARD, [O.empresaId]);
    ok('cae en la cuenta propia que recibe la tarjeta, sin importe de cuenta, y la de dólares no se mueve',
      [r.ok ? await fila(r.valor.rows[0].id) : r.error, await saldo(bancoO), await saldo(dolaresO)],
      [{ cuenta_id: bancoO, monto: 190000, monto_cuenta: null, estado: 'activo', metodo: 'tarjeta' }, 190000, 1000]);
    // Aunque la única cuenta fuera en dólares: una cuenta en otra moneda no reclama nada.
    await val(O.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [O.empresaId, bancoO]);
    r = await T.sinSesion(BANCARD, [O.empresaId]);
    ok('y si no hubiera ninguna propia, queda sin cuenta: tampoco falla, que ahí nadie vería el error',
      [r.ok ? await fila(r.valor.rows[0].id) : r.error, await saldo(dolaresO)],
      [{ cuenta_id: null, monto: 190000, monto_cuenta: null, estado: 'activo', metodo: 'tarjeta' }, 1000]);
    ok('ninguna cuenta en otra moneda de toda la base reclama una forma de pago (lo cuida un CHECK)',
      [await n('select count(*) n from public.cuentas_dinero where moneda is not null and cardinality(metodos) > 0'),
        (await T.sinSesion(`update public.cuentas_dinero set metodos = '{tarjeta}' where id = $1`, [dolaresO])).error?.includes('cuentas_dinero_otra_moneda_sin_formas') ?? false], [0, true]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('11 · Las reglas, miradas en toda la base al terminar');
  // ═════════════════════════════════════════════════════════════════════
  {
    ok('I2 · ningún movimiento tiene importe de cuenta en una cuenta propia o sin cuenta',
      await n(`select count(*) n from public.movimientos m left join public.cuentas_dinero c on c.id = m.cuenta_id
               where m.monto_cuenta is not null and (c.id is null or c.moneda is null)`), 0);
    ok('I2 · y ninguno vive en una cuenta en otra moneda sin su importe (activo o anulado)',
      await n(`select count(*) n from public.movimientos m join public.cuentas_dinero c on c.id = m.cuenta_id
               where c.moneda is not null and m.monto_cuenta is null`), 0);
    ok('  (hay de los dos: la regla se miró sobre algo)',
      [await n('select count(*) n from public.movimientos where monto_cuenta is not null') > 3, await n('select count(*) n from public.movimientos where monto_cuenta is null') > 10], [true, true]);
    ok('I3 · ningún préstamo del fiado cayó en una cuenta en otra moneda',
      await n(`select count(*) n from public.ajustes_cuenta a join public.cuentas_dinero c on c.id = a.cuenta_id where a.tipo = 'prestamo' and c.moneda is not null`), 0);
    ok('I1 · ninguna cuenta en otra moneda reclama formas de pago', await n('select count(*) n from public.cuentas_dinero where moneda is not null and cardinality(metodos) > 0'), 0);
    ok('ninguna cuenta ACTIVA dice, como «otra», la moneda de su propio negocio',
      await n(`select count(*) n from public.cuentas_dinero c join public.empresas e on e.id = c.empresa_id where c.activa and c.moneda = e.moneda`), 0);
    ok('I6 · el saldo de una cuenta en otra moneda no suma nunca `monto`: es su saldo inicial, sus importes de cuenta y sus ajustes',
      await filas(`select c.nombre from public.cuentas_dinero c where c.moneda is not null and public.saldo_cuenta_dinero(c.id) <> c.saldo_inicial
          + coalesce((select sum(case when m.tipo = 'gasto' then -m.monto_cuenta else m.monto_cuenta end) from public.movimientos m
                      where m.cuenta_id = c.id and m.estado = 'activo'), 0)
          + coalesce((select sum(a.monto) from public.ajustes_cuenta a where a.cuenta_id = c.id), 0)`), []);
    const comparadas = await filas(FORMULA_074);
    ok(`y el saldo de las ${comparadas.length} cuentas propias de esta base sigue siendo el de la fórmula de la 074, como texto`,
      [comparadas.length > 20, comparadas.filter((x) => x.de_la_074 !== x.de_hoy)], [true, []]);
  }
  await db.close();

  // ═════════════════════════════════════════════════════════════════════
  grupo('12 · Permisos, en una base armada como producción (los privilegios por defecto de Supabase desde antes de la 001)');
  // ═════════════════════════════════════════════════════════════════════
  // La gemela B recibió esos privilegios recién antes de la 131: sus
  // funciones de siempre habían nacido cerradas, y mirar ahí «la llave de
  // servicio no ejecuta ninguna de las trece» daba verde sin ser cierto en
  // producción, donde están puestos desde antes de la primera migración. Esta
  // base se arma como la de verdad y dice lo que va a pasar al aplicar: qué
  // cambia de permisos, y qué queda exactamente como está hoy.
  const PR = await H.crearBase({ hasta: ULTIMA_ANTERIOR, comoSupabase: true });
  const TODAS = [...RECOPIADAS.map(([nombre]) => nombre), ...NUEVAS];
  /** Quién ejecuta cada una: A sin sesión · S con sesión · V la llave de servicio · P cualquiera (PUBLIC). */
  const quienEjecuta = async (base) => Object.fromEntries((await base.query(
    `select p.proname as nombre,
            case when has_function_privilege('anon', p.oid, 'execute') then 'A' else '-' end
         || case when has_function_privilege('authenticated', p.oid, 'execute') then 'S' else '-' end
         || case when has_function_privilege('service_role', p.oid, 'execute') then 'V' else '-' end
         || case when exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                              where a.grantee = 0 and a.privilege_type = 'EXECUTE') then 'P' else '-' end as quien
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1) order by 1`, [TODAS])).rows.map((x) => [x.nombre, x.quien]));
  // Un negocio que trabaja con el código publicado, antes de la 131.
  const Y = await H.montarEmpresa(PR, { email: 'duenia@produccion.test', nombre: 'Como Producción' });
  /** Lo que hace el código publicado, sobre la base que sea: crear una cuenta, cargar algo, pasar plata. */
  const publicado = (base) => {
    const TT = herramientas(base);
    return {
      cuenta: async (nombre, tipo, saldoInicial, metodos) => (await TT.val(Y.uid,
        `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => $2, p_tipo => $3, p_saldo_inicial => $4,
           p_metodos => $5, p_id => null, p_color => null) id`, [Y.empresaId, nombre, tipo, saldoInicial, metodos])).id,
      cargar: (tipo, descripcion, monto, metodo) => TT.intento(Y.uid, MOV, [Y.empresaId, tipo, descripcion, 'Servicios', monto, metodo, null]),
      pasar: (desde, hacia, monto) => TT.intento(Y.uid,
        `select public.transferir_entre_cuentas(p_empresa => $1, p_desde => $2, p_hacia => $3, p_monto => $4, p_nota => '') j`, [Y.empresaId, desde, hacia, monto]),
      /** Lo que lee: la billetera (sin las claves que suma la 131), las cuentas para elegir y cada saldo. */
      lee: async () => {
        const b = await TT.J(Y.uid, 'select public.billetera($1) j', [Y.empresaId]);
        for (const k of CLAVES_NUEVAS.billetera) delete b[k];
        return JSON.stringify(canon([b, await TT.J(Y.uid, 'select public.cuentas_para_elegir(p_empresa => $1) j', [Y.empresaId]),
          await TT.filas('select nombre, public.saldo_cuenta_dinero(id)::text as saldo from public.cuentas_dinero where empresa_id = $1 order by orden', [Y.empresaId])]));
      },
    };
  };
  const cajaY = await publicado(PR).cuenta('Efectivo', 'efectivo', 500000, ['efectivo']);
  const bancoY = await publicado(PR).cuenta('Banco', 'banco', 12000000, ['transferencia', 'tarjeta']);
  aceptado('(un negocio trabaja con el código publicado antes de la 131: dos cuentas, un gasto…)', await publicado(PR).cargar('gasto', 'Luz', 350000, 'transferencia'));
  aceptado('(…y un pase)', await publicado(PR).pasar(bancoY, cajaY, 250000));
  const quien130 = await quienEjecuta(PR);
  const entero130 = await catalogoEntero(PR);
  await H.aplicarMigracion(PR, '131');
  const quien131 = await quienEjecuta(PR);
  const entero131 = await catalogoEntero(PR);
  // Una copia con la 131 recién puesta y sin ninguna cuenta en otra moneda: para la vuelta atrás (grupo 14).
  const VA = await PR.clone();
  {
    ok('antes de la 131, como está hoy producción: las nueve cerradas a quien no inició sesión, y la llave de servicio las ejecuta todas (A sin sesión · S con sesión · V llave de servicio · P cualquiera)',
      quien130, {
        ajustar_saldo_cuenta: '-SV-', anotar_en_su_cuenta: '--V-', billetera: '-SV-', cuentas_para_elegir: '-SV-', guardar_cuenta_dinero: '-SV-',
        moneda_no_se_reetiqueta: '--V-', resumen_personal: '-SV-', saldo_cuenta_dinero: '--V-', transferir_entre_cuentas: '-SV-',
      });
    ok('después de la 131: las trece, una por una',
      quien131, {
        ajustar_saldo_cuenta: '-SV-', anotar_en_su_cuenta: '--V-', billetera: '-SV-', cuentas_para_elegir: '-S--', deshacer_transferencia: '-S--',
        guardar_cotizacion_moneda: '-S--', guardar_cuenta_dinero: '-S--', moneda_ajustes_cuenta: '----', moneda_no_se_reetiqueta: '--V-',
        resumen_personal: '-SV-', saldo_cuenta_dinero: '--V-', transferencias_de_cuenta: '-S--', transferir_entre_cuentas: '-S--',
      });
    ok('lo ÚNICO que cambia de permisos en lo que ya existía: las tres que se borran y se crean pierden la llave de servicio. Las otras seis quedan exactamente como están hoy',
      Object.keys(quien130).filter((k) => quien130[k] !== quien131[k]).map((k) => `${k}: ${quien130[k]} → ${quien131[k]}`),
      ['cuentas_para_elegir: -SV- → -S--', 'guardar_cuenta_dinero: -SV- → -S--', 'transferir_entre_cuentas: -SV- → -S--']);
    ok('ninguna de las trece queda abierta a quien no inició sesión, ni a cualquiera',
      Object.entries(quien131).filter(([, v]) => v[0] !== '-' || v[3] !== '-').map(([k]) => k), []);
    ok('con sesión se llaman estas nueve, y solo estas', Object.entries(quien131).filter(([, v]) => v[1] === 'S').map(([k]) => k).sort(),
      ['ajustar_saldo_cuenta', 'billetera', 'cuentas_para_elegir', 'deshacer_transferencia', 'guardar_cotizacion_moneda', 'guardar_cuenta_dinero',
        'resumen_personal', 'transferencias_de_cuenta', 'transferir_entre_cuentas']);
    ok('las otras cuatro (el saldo y los tres disparadores) no están abiertas a la sesión', Object.entries(quien131).filter(([, v]) => v[1] !== 'S').map(([k]) => k).sort(),
      ['anotar_en_su_cuenta', 'moneda_ajustes_cuenta', 'moneda_no_se_reetiqueta', 'saldo_cuenta_dinero']);
    ok('la llave de servicio conserva las seis que ya ejecuta hoy, y no gana ninguna: la 131 no le abre nada a nadie',
      Object.entries(quien131).filter(([, v]) => v[2] === 'V').map(([k]) => k).sort(),
      ['ajustar_saldo_cuenta', 'anotar_en_su_cuenta', 'billetera', 'moneda_no_se_reetiqueta', 'resumen_personal', 'saldo_cuenta_dinero']);
    const deLas13 = [...(await catalogoDe(PR)).funciones].filter(([firma]) => TODAS.includes(firma.split('(')[0])).map(([firma, v]) => [firma, JSON.parse(v)]);
    ok('son trece, y hay una sola función por nombre (PostgREST no duda a cuál llamar)',
      [deLas13.length, new Set(deLas13.map(([firma]) => firma.split('(')[0])).size], [13, 13]);
    ok('todas son security definer con search_path fijo', deLas13.filter(([, v]) => !v.definer || v.config !== '{search_path=public}').map(([firma]) => firma), []);
    ok('las que solo leen no escriben (stable): el saldo, la billetera, las cuentas para elegir, el resumen y los pases',
      deLas13.filter(([, v]) => v.volatil === 's').map(([firma]) => firma.split('(')[0]).sort(),
      ['billetera', 'cuentas_para_elegir', 'resumen_personal', 'saldo_cuenta_dinero', 'transferencias_de_cuenta']);

    // Y de verdad: con el rol de quien no inició sesión y con el del servidor.
    const X = await H.montarEmpresa(PR, { email: 'permisos@produccion.test', nombre: 'Negocio Permisos' });
    const comoRol = (rol) => (sql, args) => H.intentarComo(PR, rol, null, () => PR.query(sql, args));
    {
      const como = comoRol('anon');
      rechazado('sin sesión: la billetera', await como('select public.billetera($1)', [X.empresaId]), 'permission denied');
      rechazado('sin sesión: crear una cuenta en dólares',
        await como(`select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => 'X', p_moneda => 'USD')`, [X.empresaId]), 'permission denied');
      rechazado('sin sesión: guardar una cotización', await como(`select public.guardar_cotizacion_moneda($1,'USD',7400)`, [X.empresaId]), 'permission denied');
      rechazado('sin sesión: deshacer un pase', await como('select public.deshacer_transferencia($1,$2)', [X.empresaId, X.empresaId]), 'permission denied');
      rechazado('sin sesión: los pases de una cuenta', await como('select public.transferencias_de_cuenta($1,$2)', [Y.empresaId, cajaY]), 'permission denied');
      rechazado('sin sesión: el saldo de una cuenta', await como('select public.saldo_cuenta_dinero($1)', [cajaY]), 'permission denied');
    }
    {
      const como = comoRol('service_role');
      rechazado('la llave de servicio: crear una cuenta en dólares (la perdió)',
        await como(`select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => 'X', p_moneda => 'USD')`, [X.empresaId]), 'permission denied');
      rechazado('la llave de servicio: pasar plata (la perdió)',
        await como('select public.transferir_entre_cuentas($1,$2,$3,$4)', [Y.empresaId, bancoY, cajaY, 1000]), 'permission denied');
      rechazado('la llave de servicio: las cuentas para elegir (la perdió)', await como('select public.cuentas_para_elegir($1)', [Y.empresaId]), 'permission denied');
      rechazado('la llave de servicio: guardar una cotización (nueva: nunca la tuvo)', await como(`select public.guardar_cotizacion_moneda($1,'USD',7400)`, [X.empresaId]), 'permission denied');
      rechazado('la llave de servicio: deshacer un pase (nueva)', await como('select public.deshacer_transferencia($1,$2)', [X.empresaId, X.empresaId]), 'permission denied');
      rechazado('la llave de servicio: los pases de una cuenta (nueva)', await como('select public.transferencias_de_cuenta($1,$2)', [Y.empresaId, cajaY]), 'permission denied');
      // Las que conserva, como hoy: las ejecuta, y por dentro le contestan que no es quien dice.
      rechazado('la llave de servicio: la billetera la ejecuta, como hoy, y por dentro le contesta que no',
        await como('select public.billetera($1)', [Y.empresaId]), 'Solo el dueño de la cuenta puede ver esto.');
      rechazado('  ajustar un saldo: igual', await como('select public.ajustar_saldo_cuenta($1,$2,$3)', [Y.empresaId, cajaY, 1]), 'Solo el dueño de la cuenta puede tocar esto.');
      const rp = await como('select public.resumen_personal($1)', [Y.empresaId]);
      ok('  el resumen personal: igual (lo rechaza la función, no el permiso)', [rp.ok, String(rp.error).includes('permission denied')], [false, false]);
      const s = await como('select public.saldo_cuenta_dinero($1)::float as s', [cajaY]);
      ok('  el saldo de una cuenta lo lee, como hoy: la 131 no se lo abre ni se lo cierra', s.ok ? s.valor.rows[0].s : s.error, 750000);
      ok('  y nada de eso movió un saldo', await herramientas(PR).saldo(cajaY), 750000);
    }
    for (const rol of ['anon', 'authenticated']) {
      rechazado(`${rol}: leer la tabla de cotizaciones directo`,
        await H.intentarComo(PR, rol, X.uid, () => PR.query('select * from public.cotizaciones_moneda')), 'permission denied');
      rechazado(`${rol}: escribirla directo`,
        await H.intentarComo(PR, rol, X.uid, () => PR.query(`insert into public.cotizaciones_moneda (empresa_id, moneda, valor) values ($1,'USD',1)`, [X.empresaId])), 'permission denied');
      rechazado(`${rol}: ponerle moneda a una cuenta directo`,
        await H.intentarComo(PR, rol, X.uid, () => PR.query(`update public.cuentas_dinero set moneda = 'USD'`)), 'permission denied');
    }
    aceptado('con sesión, el dueño sí crea su cuenta en dólares (por la función)',
      await H.intentar(PR, X.uid, () => PR.query(`select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => 'Dólares', p_moneda => 'USD')`, [X.empresaId])));
    aceptado('  y lee `monto_cuenta` de sus movimientos',
      await H.intentar(PR, X.uid, () => PR.query('select id, monto, monto_cuenta from public.movimientos where empresa_id = $1', [X.empresaId])));
  }
  await PR.close();
  {
    ok('cada disparador nuevo está una sola vez, después de aplicarla tres veces',
      (await B.query(`select c.relname || '.' || t.tgname as d, count(*)::int as n from pg_trigger t join pg_class c on c.oid = t.tgrelid
                       where t.tgname in ('moneda_ajustes_cuenta', 'cuenta_activa_cotizaciones_moneda', 'anotar_en_su_cuenta', 'moneda_no_se_reetiqueta')
                         and not t.tgisinternal group by 1 order by 1`)).rows,
      [{ d: 'ajustes_cuenta.moneda_ajustes_cuenta', n: 1 }, { d: 'cotizaciones_moneda.cuenta_activa_cotizaciones_moneda', n: 1 },
        { d: 'empresas.moneda_no_se_reetiqueta', n: 1 }, { d: 'movimientos.anotar_en_su_cuenta', n: 1 }]);
    // El orden en que disparan en `ajustes_cuenta` (alfabético): el candado
    // primero, para que el vencido lea su mensaje y no el de la moneda.
    ok('en los ajustes, el candado dispara antes que el de la moneda',
      (await B.query(`select tgname from pg_trigger where tgrelid = 'public.ajustes_cuenta'::regclass and not tgisinternal order by tgname`)).rows.map((x) => x.tgname),
      ['cuenta_activa_ajustes_cuenta', 'moneda_ajustes_cuenta', 'plan_personal_ajustes_cuenta']);
  }
  await B.close();

  // ═════════════════════════════════════════════════════════════════════
  grupo('13 · El archivo: sin barras invertidas, y cada función que se vuelve a definir es su última versión salvo lo marcado «(131)»');
  // ═════════════════════════════════════════════════════════════════════
  {
    ok('la 131 no tiene ni una barra invertida (el MCP las duplica al aplicar)', sql131.split(BARRA).length - 1, 0);
    ok('ni abre o cierra una transacción por su cuenta', /^\s*(begin|commit|rollback)\s*;/im.test(sql131), false);
    ok('cada mensaje nuevo tiene su portugués en mensajes-base.ts',
      [FALTA_IMPORTE, ELEGI_PROPIA, SOLO_ADMIN, NO_SE_CAMBIA, DOS_MONEDAS, UN_SOLO_MONTO, CAMBIO_IMPOSIBLE, QUITALAS, ES_TU_MONEDA, NO_EXISTE_PASE, CUENTA_QUITADA]
        .filter((m) => !sql131.includes(`'${m}'`) || !leer('src/lib/mensajes-base.ts').includes(`'${m}': '`)), []);

    const MARCA = '(131)';
    const cuerpo = (sql, nombre) => {
      const i = sql.lastIndexOf(`create or replace function public.${nombre}(`);
      if (i < 0) return null;
      const fin = sql.indexOf('$fn$;', i);
      return fin < 0 ? null : sql.slice(i, fin + '$fn$;'.length);
    };
    const fuentes = new Map(ANTERIORES.map((f) => [f, leer(`supabase/migrations/${f}`)]));
    /** La última definición antes de la 131, y en qué archivo está. */
    const anterior = (nombre) => {
      let hallada = null;
      for (const [f, sql] of fuentes) { const c = cuerpo(sql, nombre); if (c) hallada = { archivo: f, texto: c }; }
      return hallada;
    };
    const definidas = [...sql131.matchAll(/^create or replace function public[.](\w+)[(]/gm)].map((x) => x[1]);
    ok('la 131 define trece funciones: las que ya existían son estas nueve, en este orden',
      definidas.filter((nombre) => anterior(nombre)), RECOPIADAS.map(([nombre]) => nombre));
    ok('  y las otras cuatro son nuevas (ninguna pisa algo que ya existía)', definidas.filter((nombre) => !anterior(nombre)).sort(), [...NUEVAS].sort());
    ok('  cada firma vieja se borra justo antes de crear la nueva',
      ['guardar_cuenta_dinero', 'transferir_entre_cuentas', 'cuentas_para_elegir'].map((nombre) =>
        new RegExp(`drop function if exists public[.]${nombre}[(][^;]*[)];\\n\\ncreate or replace function public[.]${nombre}[(]`).test(sql131)), [true, true, true]);

    // Las líneas de la versión anterior que ya no están tal cual: cada una
    // se reemplazó por líneas marcadas. Son estas, y ninguna más. En el
    // disparador por el que pasa toda la plata, ninguna.
    const REEMPLAZADAS = {
      saldo_cuenta_dinero: [
        "       + coalesce((select sum(case when m.tipo = 'gasto' then -m.monto else m.monto end)",
      ],
      transferir_entre_cuentas: [
        "    (p_empresa, p_desde, 'transferencia', -p_monto, v_par, v_hoy, left(coalesce(trim(p_nota), ''), 200), auth.uid()),",
        "    (p_empresa, p_hacia, 'transferencia',  p_monto, v_par, v_hoy, left(coalesce(trim(p_nota), ''), 200), auth.uid());",
        "  return jsonb_build_object('ok', true, 'par', v_par);",
      ],
      billetera: [
        '  where c.empresa_id = p_empresa and c.activa;',
        '                    where c2.empresa_id = p_empresa and c2.activa)',
      ],
      cuentas_para_elegir: [
        'create or replace function public.cuentas_para_elegir(p_empresa uuid)',
        '  where c.empresa_id = p_empresa and c.activa;',
      ],
      resumen_personal: [
        '  from public.cuentas_dinero c where c.empresa_id = p_empresa and c.activa;',
        '  from public.cuentas_dinero c where c.empresa_id = p_empresa and c.activa;',
      ],
    };
    for (const [nombre, origen] of RECOPIADAS) {
      const antesDe = anterior(nombre);
      const ahora = cuerpo(sql131, nombre).split('\n');
      const deAntes = antesDe.texto.split('\n');
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
      const esperado = [origen, [], REEMPLAZADAS[nombre] ?? []];
      corridas++;
      if (JSON.stringify([antesDe.archivo.slice(0, 3), sobran, reemplazadas]) === JSON.stringify(esperado)) {
        console.log(`  ✓ ${nombre}: es la de la ${origen} → ${deAntes.length - reemplazadas.length} líneas iguales, `
          + `${ahora.length - sinMarca.length} marcadas, ${reemplazadas.length} reemplazadas`);
      } else {
        fallos++;
        console.log(`  ✗ ${nombre}: no es su versión anterior más lo marcado\n      sale de: ${antesDe.archivo}\n      líneas sin marca que no son de antes: ${JSON.stringify(sobran.slice(0, 6))}`
          + `\n      líneas de antes que faltan: ${JSON.stringify(reemplazadas)}\n      se esperaban estas: ${JSON.stringify(esperado[2])}`);
      }
    }
    // Y en la base queda lo que dice el archivo: el cuerpo de cada una de
    // las trece, en una base armada de cero, es el de la 131.
    const fresca = await H.crearBase();
    const enLaBase = new Map((await fresca.query(
      `select p.proname as nombre, p.prosrc as cuerpo from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)`,
      [definidas])).rows.map((x) => [x.nombre, x.cuerpo.replace(/\r\n/g, '\n')]));
    ok('en una base armada de cero, el cuerpo de las trece es, letra por letra, el del archivo',
      definidas.filter((nombre) => {
        const texto = cuerpo(sql131, nombre);
        const dentro = texto.slice(texto.indexOf('$fn$') + '$fn$'.length, texto.lastIndexOf('$fn$'));
        return enLaBase.get(nombre) !== dentro;
      }), []);
    await fresca.close();

    // ---- el archivo de vuelta atrás (se corre de verdad en el grupo 14) ----
    const atras = leer(ARCHIVO_ATRAS);
    ok('la 131 dice cómo se vuelve atrás, con qué archivo, y desde cuándo la base ya no se vuelve atrás',
      [sql131.includes('-- SI HAY QUE VOLVER ATRÁS'), sql131.includes(ARCHIVO_ATRAS), sql131.includes('EL PUNTO DE NO RETORNO')], [true, true, true]);
    ok('la vuelta atrás no vive en supabase/migrations (todo .sql de ahí va a parar a schema.sql), y no tiene ni una barra invertida',
      [MIGRACIONES.filter((f) => /atras/i.test(f)), leer('supabase/schema.sql').includes('VUELTA ATRÁS DE LA 131'), atras.split(BARRA).length - 1], [[], false, 0]);
    ok('  ni abre o cierra una transacción por su cuenta: se manda entera, de una vez', /^\s*(begin|commit|rollback)\s*;/im.test(atras), false);
    ok('devuelve las nueve funciones que la 131 vuelve a definir, y ninguna más',
      [...atras.matchAll(/^create or replace function public[.](\w+)[(]/gm)].map((x) => x[1]), RECOPIADAS.map(([nombre]) => nombre));
    ok('  cada una es, letra por letra, su última definición anterior a la 131',
      RECOPIADAS.filter(([nombre]) => cuerpo(atras, nombre) !== anterior(nombre).texto).map(([nombre]) => nombre), []);
    // El orden no es opcional. Con la columna quitada y el disparador de la
    // 131 todavía puesto, ningún movimiento de nadie se puede cargar (el
    // grupo 14 lo muestra).
    const ORDEN = [
      'do $guarda$',
      'drop trigger if exists moneda_ajustes_cuenta on public.ajustes_cuenta;',
      'drop function if exists public.moneda_ajustes_cuenta();',
      'drop function if exists public.guardar_cotizacion_moneda(uuid, text, numeric);',
      'drop function if exists public.deshacer_transferencia(uuid, uuid);',
      'drop function if exists public.transferencias_de_cuenta(uuid, uuid, integer);',
      'drop function if exists public.guardar_cuenta_dinero(uuid, text, text, numeric, text[], uuid, text, text);',
      'drop function if exists public.transferir_entre_cuentas(uuid, uuid, uuid, numeric, text, numeric);',
      'drop function if exists public.cuentas_para_elegir(uuid, boolean);',
      ...RECOPIADAS.map(([nombre]) => `\ncreate or replace function public.${nombre}(`),
      '\nalter table public.movimientos drop column if exists monto_cuenta;',
      '\nalter table public.cuentas_dinero drop constraint if exists cuentas_dinero_otra_moneda_sin_formas;',
      '\nalter table public.cuentas_dinero drop constraint if exists cuentas_dinero_moneda_conocida;',
      '\nalter table public.cuentas_dinero drop column if exists moneda;',
      '\ndrop table if exists public.cotizaciones_moneda;',
    ];
    const lugares = ORDEN.map((texto) => atras.indexOf(texto));
    ok('el orden: la guarda; afuera lo nuevo; las nueve funciones; y RECIÉN DESPUÉS las columnas, las restricciones y la tabla',
      [ORDEN.filter((_, i) => lugares[i] < 0), lugares.every((lugar, i) => i === 0 || lugar > lugares[i - 1]),
        atras.indexOf('\nalter table public.movimientos drop column if exists monto_cuenta;') > atras.lastIndexOf('$fn$;')],
      [[], true, true]);
    ok('  y la guarda mira las cuentas (también las archivadas) y los movimientos, antes de tocar nada',
      [atras.includes("execute 'select count(*) from public.cuentas_dinero where moneda is not null' into v_cuentas;"),
        atras.includes("execute 'select count(*) from public.movimientos where monto_cuenta is not null' into v_movimientos;"),
        atras.indexOf('raise exception') < atras.indexOf('drop trigger if exists')], [true, true, true]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('14 · La vuelta atrás, en la base armada como producción: la 131 y después el archivo dejan la base de la 130');
  // ═════════════════════════════════════════════════════════════════════
  {
    const sqlAtras = leer(ARCHIVO_ATRAS);
    const correr = async (base, sql) => { try { await base.exec(sql); return null; } catch (e) { return e.message ?? String(e); } };
    /** Todas las tablas, fila por fila, sin las dos columnas y la tabla que la vuelta atrás quita. */
    const QUITADAS = { movimientos: ['monto_cuenta'], cuentas_dinero: ['moneda'] };
    const datosDe = async (base) => {
      const m = new Map();
      const tablas = (await base.query(
        `select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)).rows.map((x) => x.t);
      for (const t of tablas.filter((x) => x !== 'cotizaciones_moneda')) {
        const fila = (await base.query(
          `select count(*)::int as n, coalesce(md5(string_agg(f, '|' order by f)), '') as h
             from (select (to_jsonb(x) - $1::text[])::text as f from public."${t}" x) s`, [QUITADAS[t] ?? []])).rows[0];
        m.set(t, `${fila.n}:${fila.h}`);
      }
      return m;
    };
    const P131 = publicado(VA);
    const TV = herramientas(VA);

    // ---- A. Sin ninguna cuenta en otra moneda: se vuelve atrás entero.
    aceptado('con la 131 puesta, el código publicado sigue trabajando: un ingreso', await P131.cargar('ingreso', 'Alquiler', 900000, 'efectivo'));
    aceptado('  y un pase', await P131.pasar(bancoY, cajaY, 100000));
    const lee131 = await P131.lee();
    const datos131 = await datosDe(VA);
    ok('(antes de volver atrás no hay nada en otra moneda: ni cuentas, ni importes de cuenta, ni cotizaciones)',
      [await TV.n('select count(*) n from public.cuentas_dinero where moneda is not null'),
        await TV.n('select count(*) n from public.movimientos where monto_cuenta is not null'), await TV.n('select count(*) n from public.cotizaciones_moneda')], [0, 0, 0]);
    // Por qué el orden del archivo no es opcional: una vuelta atrás a medias.
    {
      const aMedias = await VA.clone();
      await aMedias.exec('alter table public.movimientos drop column monto_cuenta');
      rechazado('una vuelta atrás a medias (quitar la columna y dejar el disparador de la 131) frena TODOS los movimientos: por eso el archivo devuelve primero las funciones',
        await H.intentar(aMedias, Y.uid, () => aMedias.query(MOV, [Y.empresaId, 'gasto', 'Pan', 'Servicios', 5000, 'efectivo', null])), 'has no field "monto_cuenta"');
      await aMedias.close();
    }
    ok('la vuelta atrás corre sin error', await correr(VA, sqlAtras), null);
    const enteroAtras = await catalogoEntero(VA);
    {
      const d = diferenciasDeCatalogo(entero130, enteroAtras);
      ok(`el catálogo quedó como el de la ${ULTIMA_ANTERIOR}: cada función con su texto y sus permisos, cada tabla, columna, restricción, disparador, política, índice y comentario`,
        [d.distintos, d.objetos > 2000], [[], true]);
      console.log(`  · ${d.objetos} objetos comparados, ${d.distintos.length} diferencias`);
      const contra131 = diferenciasDeCatalogo(entero131, enteroAtras);
      ok('  (y no es que la comparación no vea nada: contra el de la 131 hay diferencias, y son las que la 131 había traído)',
        [contra131.distintos.length > 25, contra131.distintos.filter((x) => /^funciones: (falta|sobra) /.test(x)).sort()], [true, [
          'funciones: falta cuentas_para_elegir(p_empresa uuid, p_otras_monedas boolean)',
          'funciones: falta deshacer_transferencia(p_empresa uuid, p_par uuid)',
          'funciones: falta guardar_cotizacion_moneda(p_empresa uuid, p_moneda text, p_valor numeric)',
          'funciones: falta guardar_cuenta_dinero(p_empresa uuid, p_nombre text, p_tipo text, p_saldo_inicial numeric, p_metodos text[], p_id uuid, p_color text, p_moneda text)',
          'funciones: falta moneda_ajustes_cuenta()',
          'funciones: falta transferencias_de_cuenta(p_empresa uuid, p_cuenta uuid, p_limite integer)',
          'funciones: falta transferir_entre_cuentas(p_empresa uuid, p_desde uuid, p_hacia uuid, p_monto numeric, p_nota text, p_monto_hacia numeric)',
          'funciones: sobra cuentas_para_elegir(p_empresa uuid)',
          'funciones: sobra guardar_cuenta_dinero(p_empresa uuid, p_nombre text, p_tipo text, p_saldo_inicial numeric, p_metodos text[], p_id uuid, p_color text)',
          'funciones: sobra transferir_entre_cuentas(p_empresa uuid, p_desde uuid, p_hacia uuid, p_monto numeric, p_nota text)',
        ]]);
    }
    ok('las tres que la 131 había dejado solo para la sesión vuelven a quedar como hoy: para la sesión y para la llave de servicio',
      await quienEjecuta(VA), quien130);
    ok('lo que lee el código publicado es lo mismo que leía con la 131 puesta, carácter por carácter', (await publicado(VA).lee()) === lee131, true);
    {
      const d = cambiosDe(datos131, await datosDe(VA));
      ok(`ni una fila de ninguna de las ${datos131.size} tablas cambió (se fueron dos columnas vacías y una tabla vacía)`, [d.nace, d.muere, d.cambia], [[], [], []]);
    }
    ok('se fueron las dos columnas, las dos restricciones y la tabla',
      [await TV.n(`select count(*) n from information_schema.columns where table_schema = 'public'
                    and ((table_name = 'movimientos' and column_name = 'monto_cuenta') or (table_name = 'cuentas_dinero' and column_name = 'moneda'))`),
        await TV.n(`select count(*) n from pg_constraint where conname in ('cuentas_dinero_moneda_conocida', 'cuentas_dinero_otra_moneda_sin_formas')`),
        (await TV.uno(`select to_regclass('public.cotizaciones_moneda') is null as se_fue`)).se_fue], [0, 0, true]);
    aceptado('después de volver atrás el código publicado sigue trabajando: un gasto', await publicado(VA).cargar('gasto', 'Después de volver', 1000, 'efectivo'));
    aceptado('  un pase', await publicado(VA).pasar(cajaY, bancoY, 5000));
    ok('  y una cuenta nueva', typeof (await publicado(VA).cuenta('Otra', 'banco', 0, [])), 'string');
    ok('corrida otra vez, no falla (ya no hay nada que mirar ni que quitar)', await correr(VA, sqlAtras), null);
    ok('  y el catálogo sigue siendo el de antes de la 131', diferenciasDeCatalogo(entero130, await catalogoEntero(VA)).distintos, []);

    // ---- B. La 131 se vuelve a aplicar encima.
    ok('la 131 se puede volver a aplicar encima', await correr(VA, sql131), null);
    ok('  y deja lo mismo que la primera vez', diferenciasDeCatalogo(entero131, await catalogoEntero(VA)).distintos, []);

    // ---- C. EL PUNTO DE NO RETORNO: con una cuenta en otra moneda, se niega.
    const dolaresY = (await TV.val(Y.uid,
      `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => 'Banco en dólares', p_tipo => 'banco', p_saldo_inicial => 10000, p_moneda => 'USD') id`, [Y.empresaId])).id;
    await TV.val(Y.uid, `select public.transferir_entre_cuentas(p_empresa => $1, p_desde => $2, p_hacia => $3, p_monto => 7400000, p_nota => '', p_monto_hacia => 1000) j`,
      [Y.empresaId, bancoY, dolaresY]);
    await TV.val(Y.uid, MOV_CUENTA, [Y.empresaId, 'gasto', 'Hosting', 'Servicios', 116727, 'tarjeta', dolaresY, 15.99]);
    await TV.val(Y.uid, `select public.guardar_cotizacion_moneda($1,'USD',7400) j`, [Y.empresaId]);
    ok('(el dueño crea su cuenta en dólares: US$ 10.000, compra 1.000 más y paga un hosting de 15,99)', await TV.saldo(dolaresY), 10984.01);
    const NO_SE_VUELVE = 'La base ya no se vuelve atrás; lo que se vuelve atrás es el código.';
    const seNiega = async (nombre, cuantas) => {
      const catalogoAntes = await catalogoEntero(VA);
      const datosAntes = await datosDe(VA);
      const error = await correr(VA, sqlAtras);
      ok(nombre, [String(error).includes(cuantas), String(error).includes(NO_SE_VUELVE)], [true, true]);
      ok('  y no tocó nada: ni el catálogo ni una fila', [diferenciasDeCatalogo(catalogoAntes, await catalogoEntero(VA)).distintos, cambiosDe(datosAntes, await datosDe(VA)).cambia], [[], []]);
    };
    await seNiega('con una cuenta en dólares y un gasto pagado con ella, la vuelta atrás SE NIEGA y dice por qué', 'Hay 1 cuentas en otra moneda y 1 movimientos con su importe de cuenta');
    ok('  la cuenta en dólares sigue con sus dólares, aparte del total', [await TV.saldo(dolaresY), (await TV.billetera(Y)).totales_otras], [10984.01, [{ moneda: 'USD', total: 10984.01, cuentas: 1 }]]);
    // Sin esa guarda, la misma vuelta atrás no da error y mezcla las monedas.
    {
      const sinGuarda = await VA.clone();
      const totalCon131 = (await herramientas(sinGuarda).billetera(Y)).total;
      ok('sin la guarda no daría error…', await correr(sinGuarda, sqlAtras.slice(sqlAtras.indexOf('drop trigger if exists moneda_ajustes_cuenta'))), null);
      const b = await herramientas(sinGuarda).billetera(Y);
      ok('  …y la billetera sumaría dólares y guaraníes como si fueran lo mismo: «Banco en dólares» en -105.727 (10.000 + 1.000 - 116.727), adentro del total',
        [b.cuentas.filter((c) => c.nombre === 'Banco en dólares').map((c) => c.saldo), b.total - totalCon131], [[-105727], -105727]);
      await sinGuarda.close();
    }
    await TV.val(Y.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [Y.empresaId, dolaresY]);
    await seNiega('con esa cuenta ya quitada (archivada, con su saldo y sus pases), también se niega', 'Hay 1 cuentas en otra moneda y 1 movimientos con su importe de cuenta');
    // La otra mitad de la guarda, sola: un importe de cuenta escrito y ninguna cuenta con moneda (no pasa por la app; se arma a mano).
    await VA.exec(`update public.cuentas_dinero set moneda = null where moneda is not null`);
    await seNiega('y alcanza con un solo movimiento que tenga escrito su importe de cuenta', 'Hay 0 cuentas en otra moneda y 1 movimientos con su importe de cuenta');
  }
  await VA.close();

  console.log(`\n${'═'.repeat(62)}`);
  console.log(fallos === 0
    ? `>>> ${corridas} COMPROBACIONES DE LA BILLETERA EN OTRAS MONEDAS PASARON (${Math.round((Date.now() - t0) / 1000)} s)`
    : `>>> ${fallos} DE ${corridas} COMPROBACIONES DE LA BILLETERA EN OTRAS MONEDAS FALLARON`);
  process.exit(fallos ? 1 : 0);
}

principal().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message ?? e, e.stack ?? '');
  process.exit(1);
});
