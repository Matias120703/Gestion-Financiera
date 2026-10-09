/**
 * Lo que tenés y no es plata: el patrimonio (migración 132, 08/10/2026).
 *
 * Matías: «También tiene que ver lo que sería patrimonios; por ejemplo, un
 * auto, un terreno, lo que sea.»
 *
 * La 132 es una tabla nueva (`bienes`) y cuatro funciones nuevas. Lo que
 * esta prueba cuida, en orden de importancia:
 *
 *   A. AL APLICARLA NO CAMBIA NADA DE LO QUE EXISTE. En una base armada como
 *      producción (los privilegios por defecto de Supabase desde antes de la
 *      001) y hasta la 131, se guarda el catálogo entero, todas las tablas
 *      fila por fila y lo que lee el código publicado. Se aplica la 132: del
 *      catálogo solo APARECEN la tabla y las cuatro funciones; lo demás queda
 *      idéntico, carácter por carácter.
 *   B. UN BIEN ES UNA ANOTACIÓN. Cada llamada a una función de bienes, de
 *      todo este archivo, deja iguales los movimientos, los ajustes y el
 *      saldo de cada cuenta. Y ninguna función que ya existía lee la tabla.
 *   C. `patrimonio()` devuelve cada parte EN SU MONEDA y sin convertir, y
 *      cada número es el que la persona ya ve en otra pantalla: la plata es
 *      la de `billetera()`, lo que te deben el de `resumen_fiado()`, lo que
 *      debés el de `resumen_deudas()`, lo guardado el de
 *      `resumen_personal()` y la mercadería el «Invertido en stock» de
 *      Productos.
 *   D. Los quince puntos de la sección 7.7 del diseño (los grupos 1 a 15).
 *   E. Permisos, idempotencia, cero barras invertidas y la vuelta atrás.
 *
 * Necesita .compilado (lo arma `npm run probar:bienes`): usa la cuenta de la
 * mercadería de src/lib/reportes/comercio.ts y el mapa de mensajes en
 * portugués.
 */
const fs = require('fs');
const path = require('path');
const H = require('./ayuda-db.js');
const { valorAlCosto } = require('../.compilado/reportes/comercio.js');
const { MENSAJES_PT } = require('../.compilado/mensajes-base.js');

const RAIZ = path.join(__dirname, '..');
const BARRA = String.fromCharCode(92);
// CRLF normalizado: en un worktree de Windows los fuentes llegan con \r\n.
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');

const MIGRACIONES = H.migraciones();
const ARCHIVO_132 = MIGRACIONES.find((f) => f.startsWith('132'));
/** Lo que hay antes de la 132: lo que está publicado. */
const ANTERIORES = MIGRACIONES.filter((f) => f < '132');
const ULTIMA_ANTERIOR = ANTERIORES[ANTERIORES.length - 1].slice(0, 3);
/** El SQL que saca la 132 de la base. Fuera de migrations a propósito: lo que hay ahí va a parar a schema.sql. */
const ARCHIVO_ATRAS = 'supabase/vuelta-atras/132_vuelta_atras.sql';

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

// Los mensajes nuevos de la 132 (están, con su portugués, en src/lib/mensajes-base.ts).
const PONELE_NOMBRE = 'Ponele un nombre, para saber qué es.';
const TIPO_NO_EXISTE = 'Ese tipo de bien no existe.';
const PONE_VALOR = 'Poné cuánto vale hoy, aunque sea un aproximado.';
const YA_NO_ESTA = 'Eso ya no está en tu lista.';
const TOPE = 'Ya tenés 100 cosas anotadas. Quitá alguna antes de sumar otra.';
const MOTIVO_NO_EXISTE = 'Ese motivo no existe.';
const NUEVOS = [PONELE_NOMBRE, TIPO_NO_EXISTE, PONE_VALOR, YA_NO_ESTA, TOPE, MOTIVO_NO_EXISTE];
// Los de siempre.
const NO_CONOCEMOS = 'No conocemos esa moneda.';
const MONTO_GRANDE = 'Ese monto es demasiado grande. Revisá los ceros.';
const SOLO_DUENO_VER = 'Solo el dueño de la cuenta puede ver esto.';
const SOLO_DUENO_TOCAR = 'Solo el dueño de la cuenta puede tocar esto.';
const CANDADO = 'Se te terminó la prueba';
const ES_DEL_PRO = 'Eso es del plan Pro';

/** Las cuatro funciones de la 132, con su firma como la escribe el catálogo. */
const NUEVAS = {
  guardar_bien: 'guardar_bien(p_empresa uuid, p_nombre text, p_tipo text, p_valor numeric, p_moneda text, p_nota text, p_id uuid)',
  actualizar_valor_bien: 'actualizar_valor_bien(p_empresa uuid, p_id uuid, p_valor numeric, p_moneda text)',
  quitar_bien: 'quitar_bien(p_empresa uuid, p_id uuid, p_motivo text)',
  patrimonio: 'patrimonio(p_empresa uuid)',
};
const NOMBRES_NUEVAS = Object.keys(NUEVAS);
/** Las columnas de `bienes`, como dice la sección 7.2 del diseño. */
const COLUMNAS = ['id', 'empresa_id', 'nombre', 'tipo', 'valor', 'moneda', 'valor_al', 'nota', 'activo', 'baja', 'baja_el',
  'creado_por', 'created_at', 'updated_at'];
/** Las claves de `patrimonio()`, como dice la sección 7.3. */
const CLAVES = ['ahorro_apartado', 'bienes', 'bienes_por_moneda', 'cotizaciones', 'debes', 'mercaderia', 'moneda', 'plata',
  'plata_de_ahorros', 'te_deben'];

// El insert de PantallaGastos.tsx, como lo manda el código publicado.
const MOV = `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, descuento,
    monto, costo_total, metodo_pago, contraparte, notas, cuenta_id, origen)
  values ($1,$2,public.hoy_empresa($1),$3,$4,$5,0,$5,0,$6,'','',$7,'manual') returning id`;
// El de Gastos con una cuenta en otra moneda (131): manda cuánto se movió la cuenta.
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
  const saldo = async (cuenta) => Number((await uno('select public.saldo_cuenta_dinero($1) s', [cuenta])).s);
  const hoyDe = async (empresa) => (await uno('select public.hoy_empresa($1)::text d', [empresa])).d;
  // Receta de solo-lectura.test.js: la prueba termina sola.
  const vencer = (empresa) => db.query(
    `update public.suscripciones
        set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
      where empresa_id = $1`, [empresa]);

  // ---- la plata, entera: para decir de cada llamada que no la tocó ----
  const estado = { llamadas: 0, movieron: [] };
  const plataDe = async () => JSON.stringify(await uno(
    `select
       (select count(*)::int from public.movimientos) as movimientos,
       (select count(*)::int from public.ajustes_cuenta) as ajustes,
       (select coalesce(md5(string_agg(to_jsonb(m)::text, '|' order by m.id)), '') from public.movimientos m) as h_movimientos,
       (select coalesce(md5(string_agg(to_jsonb(a)::text, '|' order by a.id)), '') from public.ajustes_cuenta a) as h_ajustes,
       (select coalesce(md5(string_agg(to_jsonb(c)::text || '=' || public.saldo_cuenta_dinero(c.id)::text, '|' order by c.id)), '')
          from public.cuentas_dinero c) as h_cuentas`));
  /** Corre una llamada a una función de bienes y anota si movió un movimiento, un ajuste o un saldo. */
  const quieta = async (etiqueta, fn) => {
    const antes = await plataDe();
    const r = await fn();
    estado.llamadas++;
    if ((await plataDe()) !== antes) estado.movieron.push(etiqueta);
    return r;
  };

  // ---- las cuatro funciones, como las va a llamar la pantalla (por nombre) ----
  /** Anotar algo. Lo que no se nombra en `d` no se manda: vale el valor por defecto de la función. */
  const anotar = (C, d, uid = C.uid) => {
    const campos = [['p_empresa', C.empresaId]];
    for (const [k, p] of [['nombre', 'p_nombre'], ['tipo', 'p_tipo'], ['valor', 'p_valor'], ['moneda', 'p_moneda'], ['nota', 'p_nota'], ['id', 'p_id']]) {
      if (k in d) campos.push([p, d[k]]);
    }
    const sql = `select public.guardar_bien(${campos.map(([p], i) => `${p} => $${i + 1}`).join(', ')}) id`;
    return quieta('guardar_bien', () => intento(uid, sql, campos.map(([, v]) => v)));
  };
  const bien = async (C, d) => {
    const r = await anotar(C, d);
    if (!r.ok) throw new Error(`anotar «${d.nombre}» → ${r.error}`);
    return r.valor.rows[0].id;
  };
  const actualizar = (C, id, valor, moneda = undefined, uid = C.uid) => quieta('actualizar_valor_bien', () => intento(uid,
    moneda === undefined
      ? 'select public.actualizar_valor_bien(p_empresa => $1, p_id => $2, p_valor => $3) j'
      : 'select public.actualizar_valor_bien(p_empresa => $1, p_id => $2, p_valor => $3, p_moneda => $4) j',
    moneda === undefined ? [C.empresaId, id, valor] : [C.empresaId, id, valor, moneda]));
  const quitar = (C, id, motivo = undefined, uid = C.uid) => quieta('quitar_bien', () => intento(uid,
    motivo === undefined
      ? 'select public.quitar_bien(p_empresa => $1, p_id => $2) j'
      : 'select public.quitar_bien(p_empresa => $1, p_id => $2, p_motivo => $3) j',
    motivo === undefined ? [C.empresaId, id] : [C.empresaId, id, motivo]));
  const pedirPatrimonio = (C, uid = C.uid) => quieta('patrimonio', () => intento(uid, 'select public.patrimonio(p_empresa => $1) j', [C.empresaId]));
  const patrimonio = async (C) => {
    const r = await pedirPatrimonio(C);
    if (!r.ok) throw new Error(`patrimonio → ${r.error}`);
    return r.valor.rows[0].j;
  };
  /** La fila, como quedó guardada. */
  const filaBien = (id) => uno(
    `select nombre, tipo, valor::float as valor, moneda, valor_al::text as valor_al, nota, activo, baja, baja_el::text as baja_el, creado_por
       from public.bienes where id = $1`, [id]);

  // ---- lo de siempre, para armar las cuentas ----
  const billetera = (C) => J(C.uid, 'select public.billetera($1) j', [C.empresaId]);
  const cuenta = async (C, nombre, tipo, saldoInicial, metodos = [], moneda = null) => (await val(C.uid,
    `select public.guardar_cuenta_dinero(p_empresa => $1, p_nombre => $2, p_tipo => $3, p_saldo_inicial => $4, p_metodos => $5, p_moneda => $6) id`,
    [C.empresaId, nombre, tipo, saldoInicial, metodos, moneda])).id;
  const pase = (C, desde, hacia, monto, montoHacia = null) => J(C.uid,
    `select public.transferir_entre_cuentas(p_empresa => $1, p_desde => $2, p_hacia => $3, p_monto => $4, p_nota => '', p_monto_hacia => $5) j`,
    [C.empresaId, desde, hacia, monto, montoHacia]);
  const cotizar = (C, moneda, valor) => J(C.uid, 'select public.guardar_cotizacion_moneda(p_empresa => $1, p_moneda => $2, p_valor => $3) j', [C.empresaId, moneda, valor]);
  const deuda = async (C, nombre, monto) => (await val(C.uid, `select public.crear_deuda($1,$2,'prestamo','Financiera',$3) id`, [C.empresaId, nombre, monto])).id;
  const cliente = async (C, nombre, telefono) => (await val(C.uid, 'select public.guardar_cliente($1,$2,$3) id', [C.empresaId, nombre, telefono])).id;
  const personal = async (email, nombre) => {
    const uid = await H.crearUsuario(db, email);
    const id = (await val(uid, `select public.crear_empresa($1,'PYG','Pedro','America/Asuncion','personal') id`, [nombre])).id;
    return { uid, empresaId: id, nombre };
  };

  // ---- toda la base, tabla por tabla ----
  const tablas = async () => (await filas(
    `select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)).map((x) => x.t);
  const todaLaBase = async () => {
    const m = new Map();
    for (const t of await tablas()) {
      const r = await uno(`select count(*)::int as n, coalesce(md5(string_agg(f, '|' order by f)), '') as h from (select to_jsonb(x)::text as f from public."${t}" x) s`);
      m.set(t, `${r.n}:${r.h}`);
    }
    return m;
  };
  const tocadas = (antes, despues) => [...new Set([...antes.keys(), ...despues.keys()])].filter((t) => antes.get(t) !== despues.get(t)).sort();

  return { db, intento, val, J, filas, uno, n, saldo, hoyDe, vencer, estado, quieta, anotar, bien, actualizar, quitar, pedirPatrimonio,
    patrimonio, filaBien, billetera, cuenta, pase, cotizar, deuda, cliente, personal, todaLaBase, tocadas };
}

/**
 * El catálogo ENTERO de `public` (el mismo de billetera-monedas.test.js):
 * cada función con su texto y su lista de permisos tal cual está guardada, y
 * cada tabla, columna, restricción, disparador, política, índice y
 * comentario. El texto de las funciones va sin retornos de carro.
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

/** Qué apareció, qué desapareció y qué cambió entre dos mapas. */
function cambiosDe(antes, despues) {
  const nace = [...despues.keys()].filter((k) => !antes.has(k)).sort();
  const muere = [...antes.keys()].filter((k) => !despues.has(k)).sort();
  const cambia = [...antes.keys()].filter((k) => despues.has(k) && antes.get(k) !== despues.get(k)).sort();
  return { nace, muere, cambia };
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

/** Quién ejecuta cada función: A sin sesión · S con sesión · V la llave de servicio · P cualquiera (PUBLIC). */
const quienEjecuta = async (base, nombres) => Object.fromEntries((await base.query(
  `select p.proname as nombre,
          case when has_function_privilege('anon', p.oid, 'execute') then 'A' else '-' end
       || case when has_function_privilege('authenticated', p.oid, 'execute') then 'S' else '-' end
       || case when has_function_privilege('service_role', p.oid, 'execute') then 'V' else '-' end
       || case when exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                            where a.grantee = 0 and a.privilege_type = 'EXECUTE') then 'P' else '-' end as quien
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1) order by 1`, [nombres])).rows.map((x) => [x.nombre, x.quien]));

const porNombre = (lista) => [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre));

async function principal() {
  const t0 = Date.now();
  const sql132 = leer(`supabase/migrations/${ARCHIVO_132}`);
  const sqlAtras = leer(ARCHIVO_ATRAS);
  const correr = async (base, sql) => { try { await base.exec(sql); return null; } catch (e) { return e.message ?? String(e); } };

  // ═════════════════════════════════════════════════════════════════════
  grupo(`A · Una base armada como producción, hasta la ${ULTIMA_ANTERIOR}: se le aplica la 132 y no cambia nada de lo que existe`);
  // ═════════════════════════════════════════════════════════════════════
  const PR = await H.crearBase({ hasta: ULTIMA_ANTERIOR, comoSupabase: true });
  const TP = herramientas(PR);
  // Un negocio que trabaja con el código publicado: cuentas (una en dólares),
  // un gasto, un pase entre monedas, una cotización, fiado, una deuda y
  // mercadería. Y una cuenta personal con un fondo de ahorro.
  const Y = await H.montarEmpresa(PR, { email: 'duenia@produccion.test', nombre: 'Como Producción' });
  const cajaY = await TP.cuenta(Y, 'Efectivo', 'efectivo', 500000, ['efectivo']);
  const bancoY = await TP.cuenta(Y, 'Banco', 'banco', 12000000, ['transferencia', 'tarjeta']);
  const dolaresY = await TP.cuenta(Y, 'Dólares', 'banco', 10000, [], 'USD');
  await TP.val(Y.uid, MOV, [Y.empresaId, 'gasto', 'Luz', 'Servicios', 350000, 'transferencia', null]);
  await TP.pase(Y, bancoY, dolaresY, 7400000, 1000);
  await TP.cotizar(Y, 'USD', 7400);
  const juanY = await TP.cliente(Y, 'Juan Pérez', '0981 234 567');
  await TP.val(Y.uid, `select public.anotar_fiado($1,$2,40000,'yerba')`, [Y.empresaId, juanY]);
  await TP.deuda(Y, 'Préstamo', 1000000);
  await H.crearProducto(PR, Y.empresaId, Y.uid, { nombre: 'Shampoo', costo: 20000, precio: 35000, stock: 10 });
  const Q = await TP.personal('ahorra@produccion.test', 'Finanzas de Pedro');
  await TP.cuenta(Q, 'Billetera', 'efectivo', 900000, ['efectivo']);
  const fondoQ = (await TP.val(Q.uid, `select public.guardar_ahorro($1,'Viaje') id`, [Q.empresaId])).id;
  await TP.val(Q.uid, `select public.mover_ahorro(p_empresa => $1, p_ahorro => $2, p_tipo => 'aporte', p_monto => 200000) j`, [Q.empresaId, fondoQ]);

  /** Lo que lee el código publicado, como texto: la billetera, el fiado, las deudas, el catálogo, el resumen personal y cada saldo. */
  const lee = async (T) => JSON.stringify(canon([
    await T.J(Y.uid, 'select public.billetera($1) j', [Y.empresaId]),
    await T.J(Y.uid, 'select public.cuentas_para_elegir(p_empresa => $1, p_otras_monedas => true) j', [Y.empresaId]),
    await T.J(Y.uid, 'select public.resumen_fiado($1) j', [Y.empresaId]),
    await T.J(Y.uid, 'select public.resumen_deudas($1) j', [Y.empresaId]),
    await T.J(Y.uid, 'select public.listar_productos($1, true) j', [Y.empresaId]),
    await T.J(Y.uid, 'select public.resumen_financiero($1, public.hoy_empresa($1), public.hoy_empresa($1)) j', [Y.empresaId]),
    await T.J(Q.uid, 'select public.resumen_personal($1) j', [Q.empresaId]),
    await T.J(Q.uid, 'select public.billetera($1) j', [Q.empresaId]),
    await T.filas('select nombre, public.saldo_cuenta_dinero(id)::text as saldo from public.cuentas_dinero order by empresa_id, orden, created_at'),
  ]));

  const entero131 = await catalogoEntero(PR);
  const datos131 = await TP.todaLaBase();
  const lee131 = await lee(TP);
  ok(`(antes de la 132: ni la tabla ni ninguna de las cuatro funciones existe)`,
    [(await TP.uno(`select to_regclass('public.bienes') is null as falta`)).falta,
      await TP.n('select count(*) n from pg_proc where pronamespace = $1::regnamespace and proname = any($2)', ['public', NOMBRES_NUEVAS])], [true, 0]);

  ok('la 132 se aplica sin error', await correr(PR, sql132), null);
  const entero132 = await catalogoEntero(PR);
  // Una copia con la 132 recién puesta y sin nada anotado: para la vuelta atrás (grupo 17).
  const VA = await PR.clone();
  {
    const porClase = Object.fromEntries(Object.keys(entero131).map((clase) => [clase, cambiosDe(entero131[clase], entero132[clase])]));
    const objetos = Object.values(entero131).reduce((s, m) => s + m.size, 0);
    ok('NADA de lo que existía cambió: ninguna función (ni su texto ni sus permisos), tabla, columna, restricción, disparador, política, índice ni comentario',
      Object.entries(porClase).flatMap(([clase, d]) => d.cambia.map((k) => `${clase}: cambió ${k}`)), []);
    ok('  y nada de lo que existía desapareció',
      Object.entries(porClase).flatMap(([clase, d]) => d.muere.map((k) => `${clase}: falta ${k}`)), []);
    console.log(`  · ${objetos} objetos del catálogo de la ${ULTIMA_ANTERIOR} comparados uno por uno`);
    ok('  (se miró algo: más de 2.000 objetos, y más de 400 funciones con su texto y su lista de permisos)',
      [objetos > 2000, entero131.funciones.size > 400], [true, true]);
    ok('lo que APARECE: cuatro funciones, y son estas', porClase.funciones.nace, Object.values(NUEVAS).sort());
    ok('  una tabla', porClase.tablas.nace, ['bienes']);
    ok('  sus catorce columnas, las de la sección 7.2', porClase.columnas.nace, COLUMNAS.map((c) => `bienes.${c}`).sort());
    ok('  un disparador: el candado de siempre, sobre la tabla nueva', porClase.disparadores.nace, ['bienes.cuenta_activa_bienes']);
    ok('  dos índices', porClase.indices.nace, ['bienes.bienes_empresa_idx', 'bienes.bienes_pkey']);
    ok('  ninguna política (no se lee ni se escribe directo)', porClase.politicas.nace, []);
    ok('  restricciones y comentarios: solo de la tabla nueva',
      [...porClase.restricciones.nace, ...porClase.comentarios.nace].filter((k) => !k.startsWith('bienes.')), []);
    ok('  y entre las restricciones están la moneda, el tipo, el valor mayor que cero, la baja coherente y las dos referencias',
      ['bienes.bienes_moneda_check', 'bienes.bienes_tipo_check', 'bienes.bienes_valor_check', 'bienes.bienes_baja_coherente',
        'bienes.bienes_empresa_id_fkey', 'bienes.bienes_creado_por_fkey', 'bienes.bienes_pkey'].filter((k) => !porClase.restricciones.nace.includes(k)), []);
    ok('  la tabla nueva no apunta a movimientos ni a cuentas: solo a la empresa (y se va con ella) y a quien la anotó',
      (await TP.filas(`select k.conname, k.confrelid::regclass::text as apunta, k.confdeltype::text as al_borrar
                         from pg_constraint k where k.conrelid = 'public.bienes'::regclass and k.contype = 'f' order by 1`)),
      [{ conname: 'bienes_creado_por_fkey', apunta: 'auth.users', al_borrar: 'n' }, { conname: 'bienes_empresa_id_fkey', apunta: 'empresas', al_borrar: 'c' }]);

    const datos132 = await TP.todaLaBase();
    ok(`ni una fila de ninguna de las ${datos131.size} tablas que había cambió; la nueva nace vacía`,
      [TP.tocadas(datos131, datos132), datos132.get('bienes')], [['bienes'], '0:']);
    ok('lo que lee el código publicado da lo mismo, carácter por carácter (billetera, fiado, deudas, catálogo, resumen del día, resumen personal y cada saldo)',
      [(await lee(TP)) === lee131, lee131.length > 3000], [true, true]);

    // Aplicada dos veces más: deja lo mismo.
    ok('se aplica una segunda vez sin error', await correr(PR, sql132), null);
    ok('  y una tercera', await correr(PR, sql132), null);
    ok('  y el catálogo queda exactamente como la primera vez: no duplica ni cambia nada',
      diferenciasDeCatalogo(entero132, await catalogoEntero(PR)).distintos, []);
    ok('  ni una fila tocada', TP.tocadas(datos132, await TP.todaLaBase()), []);
    ok('  y lo que lee el código publicado sigue igual', (await lee(TP)) === lee131, true);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('B · Permisos, en esa base armada como producción');
  // ═════════════════════════════════════════════════════════════════════
  {
    ok('las cuatro funciones: solo con sesión. Ni sin sesión, ni la llave de servicio, ni cualquiera (A sin sesión · S con sesión · V llave de servicio · P cualquiera)',
      await quienEjecuta(PR, NOMBRES_NUEVAS),
      { actualizar_valor_bien: '-S--', guardar_bien: '-S--', patrimonio: '-S--', quitar_bien: '-S--' });
    const deLaTabla = async (tabla) => Object.fromEntries((await TP.filas(
      `select r.rol, concat_ws(',',
                case when has_table_privilege(r.rol, $1, 'select') then 'select' end,
                case when has_table_privilege(r.rol, $1, 'insert') then 'insert' end,
                case when has_table_privilege(r.rol, $1, 'update') then 'update' end,
                case when has_table_privilege(r.rol, $1, 'delete') then 'delete' end) as puede
         from (values ('anon'), ('authenticated')) r(rol)`, [tabla])).map((x) => [x.rol, x.puede]));
    ok('la tabla: ni sin sesión ni con sesión se lee o se escribe directo', await deLaTabla('public.bienes'), { anon: '', authenticated: '' });
    ok('  ni por una columna suelta',
      await TP.n(`select count(*) n from information_schema.columns c cross join (values ('anon'), ('authenticated')) r(rol)
                   where c.table_schema = 'public' and c.table_name = 'bienes'
                     and (has_column_privilege(r.rol, 'public.bienes', c.column_name, 'select')
                       or has_column_privilege(r.rol, 'public.bienes', c.column_name, 'insert')
                       or has_column_privilege(r.rol, 'public.bienes', c.column_name, 'update'))`), 0);
    ok('  con RLS prendido, sin ninguna política, y con los mismos permisos que la tabla de cotizaciones de la 131',
      [JSON.parse(entero132.tablas.get('bienes')).rls, await TP.n(`select count(*) n from pg_policies where schemaname = 'public' and tablename = 'bienes'`),
        JSON.parse(entero132.tablas.get('bienes')).permisos], [true, 0, JSON.parse(entero132.tablas.get('cotizaciones_moneda')).permisos]);
    const deLas4 = [...entero132.funciones].filter(([firma]) => NOMBRES_NUEVAS.includes(firma.split('(')[0])).map(([firma, v]) => [firma, JSON.parse(v)]);
    ok('son cuatro, una sola por nombre (PostgREST no duda a cuál llamar)',
      [deLas4.length, new Set(deLas4.map(([firma]) => firma.split('(')[0])).size], [4, 4]);
    ok('todas security definer con search_path fijo', deLas4.filter(([, v]) => !v.definer || v.config !== '{search_path=public}').map(([firma]) => firma), []);
    ok('la que solo lee no escribe (stable): patrimonio. Las otras tres escriben',
      deLas4.filter(([, v]) => v.volatil === 's').map(([firma]) => firma.split('(')[0]), ['patrimonio']);
    ok('y devuelven lo que dice el diseño', Object.fromEntries(deLas4.map(([firma, v]) => [firma.split('(')[0], v.devuelve])),
      { guardar_bien: 'uuid', actualizar_valor_bien: 'jsonb', quitar_bien: 'jsonb', patrimonio: 'jsonb' });
    ok('con sus valores por defecto: la pantalla puede mandar solo lo que hace falta',
      Object.fromEntries(deLas4.map(([firma, v]) => [firma.split('(')[0], v.argumentos])), {
        guardar_bien: "p_empresa uuid, p_nombre text, p_tipo text DEFAULT 'otro'::text, p_valor numeric DEFAULT NULL::numeric, p_moneda text DEFAULT NULL::text, p_nota text DEFAULT ''::text, p_id uuid DEFAULT NULL::uuid",
        actualizar_valor_bien: 'p_empresa uuid, p_id uuid, p_valor numeric, p_moneda text DEFAULT NULL::text',
        quitar_bien: "p_empresa uuid, p_id uuid, p_motivo text DEFAULT 'quitado'::text",
        patrimonio: 'p_empresa uuid',
      });

    // Con sesión, quien administra sí: anota su auto y su terreno.
    const autoY = await TP.bien(Y, { nombre: 'Toyota Hilux', tipo: 'vehiculo', valor: 80000000 });
    const terrenoY = await TP.bien(Y, { nombre: 'Terreno en Luque', tipo: 'terreno', valor: 30000, moneda: 'USD' });
    ok('con sesión, la dueña anota su auto y su terreno y los lee',
      porNombre((await TP.patrimonio(Y)).bienes).map((b) => [b.nombre, b.valor, b.moneda]), [['Terreno en Luque', 30000, 'USD'], ['Toyota Hilux', 80000000, 'PYG']]);
    const socia = await H.sumarMiembro(PR, Y.empresaId, 'socia@produccion.test', 'admin');
    aceptado('quien administra sin ser la dueña (rol admin) también, como la billetera y las deudas', await TP.pedirPatrimonio(Y, socia));
    // Un vendedor (es del negocio, pero no administra) y otra empresa.
    const vendedor = await H.sumarMiembro(PR, Y.empresaId, 'vende@produccion.test', 'vendedor');
    const X = await H.montarEmpresa(PR, { email: 'otra@produccion.test', nombre: 'Otro Negocio' });
    const fotoY = await TP.todaLaBase();
    const bienesY = async () => JSON.stringify(await TP.filas('select * from public.bienes where empresa_id = $1 order by id', [Y.empresaId]));
    const filasY = await bienesY();

    // De verdad, con cada rol.
    const comoRol = (rol, uid = null) => (sql, args) => H.intentarComo(PR, rol, uid, () => PR.query(sql, args));
    for (const [quien, como] of [['sin sesión', comoRol('anon')], ['la llave de servicio', comoRol('service_role')]]) {
      rechazado(`${quien}: leer el patrimonio`, await como('select public.patrimonio($1)', [Y.empresaId]), 'permission denied');
      rechazado(`${quien}: anotar un bien`, await como(`select public.guardar_bien($1,'Auto','vehiculo',1000)`, [Y.empresaId]), 'permission denied');
      rechazado(`${quien}: cambiarle el valor a uno`, await como('select public.actualizar_valor_bien($1,$2,1)', [Y.empresaId, autoY]), 'permission denied');
      rechazado(`${quien}: quitar uno`, await como('select public.quitar_bien($1,$2)', [Y.empresaId, autoY]), 'permission denied');
    }
    for (const [quien, rol, uid] of [['sin sesión', 'anon', null], ['con sesión, la dueña', 'authenticated', Y.uid]]) {
      const como = comoRol(rol, uid);
      rechazado(`${quien}: leer la tabla directo`, await como('select * from public.bienes'), 'permission denied');
      rechazado(`${quien}: insertar directo`,
        await como(`insert into public.bienes (empresa_id, nombre, valor, moneda, valor_al) values ($1,'Por atrás',1,'PYG',current_date)`, [Y.empresaId]), 'permission denied');
      rechazado(`${quien}: cambiar un valor directo`, await como('update public.bienes set valor = 1'), 'permission denied');
      rechazado(`${quien}: borrar directo`, await como('delete from public.bienes'), 'permission denied');
    }

    // El vendedor.
    rechazado('un vendedor no lee el patrimonio', await TP.pedirPatrimonio(Y, vendedor), SOLO_DUENO_VER);
    rechazado('  ni anota un bien', await TP.anotar(Y, { nombre: 'Moto', tipo: 'vehiculo', valor: 9000000 }, vendedor), SOLO_DUENO_TOCAR);
    rechazado('  ni le cambia el nombre a uno', await TP.anotar(Y, { nombre: 'Mío', id: autoY }, vendedor), SOLO_DUENO_TOCAR);
    rechazado('  ni le cambia el valor', await TP.actualizar(Y, autoY, 1, undefined, vendedor), SOLO_DUENO_TOCAR);
    rechazado('  ni lo quita', await TP.quitar(Y, autoY, 'vendido', vendedor), SOLO_DUENO_TOCAR);
    rechazado('  ni lee la tabla directo', await comoRol('authenticated', vendedor)('select * from public.bienes'), 'permission denied');

    // La otra empresa.
    rechazado('otra empresa no lee el patrimonio ajeno', await TP.pedirPatrimonio(Y, X.uid), SOLO_DUENO_VER);
    rechazado('  ni anota en la cuenta ajena', await TP.anotar(Y, { nombre: 'Colado', valor: 1 }, X.uid), SOLO_DUENO_TOCAR);
    rechazado('  ni le cambia el valor a un bien ajeno diciendo que es de la otra', await TP.actualizar(Y, autoY, 1, undefined, X.uid), SOLO_DUENO_TOCAR);
    rechazado('  ni lo quita', await TP.quitar(Y, autoY, 'quitado', X.uid), SOLO_DUENO_TOCAR);
    // Y con su propia empresa por delante y el id ajeno: para la base ese bien no está en SU lista.
    rechazado('con SU empresa y el id de un bien ajeno: editarlo', await TP.anotar(X, { nombre: 'Mío', id: autoY }), YA_NO_ESTA);
    rechazado('  cambiarle el valor', await TP.actualizar(X, autoY, 1), YA_NO_ESTA);
    rechazado('  quitarlo', await TP.quitar(X, terrenoY, 'vendido'), YA_NO_ESTA);
    const pX = await TP.patrimonio(X);
    ok('y en su patrimonio no ve nada de la otra: ni bienes, ni plata, ni cotizaciones',
      [pX.bienes, pX.bienes_por_moneda, pX.plata, pX.cotizaciones, pX.debes, pX.te_deben, pX.mercaderia], [[], [], [{ moneda: 'PYG', total: 0 }], [], 0, 0, 0]);
    ok('nada de todo eso tocó una fila: los bienes de la dueña siguen como estaban, y el resto de la base también',
      [(await bienesY()) === filasY, TP.tocadas(fotoY, await TP.todaLaBase())], [true, []]);
    ok(`y ninguna de las ${TP.estado.llamadas} llamadas a funciones de bienes en esta base movió un movimiento, un ajuste ni un saldo`, TP.estado.movieron, []);
  }
  await PR.close();

  // ═════════════════════════════════════════════════════════════════════
  // LOS QUINCE PUNTOS DE LA SECCIÓN 7.7, SOBRE UNA BASE COMPLETA
  // ═════════════════════════════════════════════════════════════════════
  const db = await H.crearBase();
  const T = herramientas(db);
  const { intento, val, J, filas, uno, n, saldo } = T;
  let r;

  // ═════════════════════════════════════════════════════════════════════
  grupo('1 · Anotar algo que tenés');
  // ═════════════════════════════════════════════════════════════════════
  const N = await H.montarEmpresa(db, { email: 'duenia@almacen.test', nombre: 'Almacén Luna' });
  N.nombre = 'Almacén Luna';
  const hoy = await T.hoyDe(N.empresaId);
  const cajaN = await T.cuenta(N, 'Efectivo', 'efectivo', 500000, ['efectivo']);
  const itauN = await T.cuenta(N, 'Itaú', 'banco', 20000000, ['transferencia', 'tarjeta']);
  await val(N.uid, MOV, [N.empresaId, 'gasto', 'Luz', 'Servicios', 150000, 'efectivo', null]);
  await T.pase(N, itauN, cajaN, 100000);
  // Lo que ve la dueña en sus pantallas de siempre, antes de anotar nada: tiene que seguir igual hasta el final (grupo 6).
  const P1 = await T.personal('sueldo@correo.test', 'Mis finanzas');
  await T.cuenta(P1, 'Billetera', 'efectivo', 100000, ['efectivo']);
  await T.cuenta(P1, 'Ueno', 'banco', 3000000, ['transferencia']);
  const pantallas = async () => JSON.stringify(canon([
    await T.billetera(N),
    await J(N.uid, 'select public.resumen_financiero($1,$2::date,$2::date) j', [N.empresaId, hoy]),
    await J(N.uid, 'select public.cierre_del_dia($1) j', [N.empresaId]),
    await J(N.uid, 'select public.resumen_deudas($1) j', [N.empresaId]),
    await J(N.uid, 'select public.resumen_fiado($1) j', [N.empresaId]),
    await J(P1.uid, 'select public.resumen_personal($1) j', [P1.empresaId]),
    await T.billetera(P1),
  ]));
  const pantallasAntes = await pantallas();
  const todoAntes = await T.todaLaBase();

  r = await T.anotar(N, { nombre: 'Toyota Hilux', tipo: 'vehiculo', valor: 80000000, moneda: 'PYG' });
  aceptado('un auto, con su valor y su moneda', r);
  const auto = r.valor.rows[0].id;
  ok('  queda anotado con lo que se escribió, la fecha de hoy, quién lo anotó, y en la lista',
    await T.filaBien(auto),
    { nombre: 'Toyota Hilux', tipo: 'vehiculo', valor: 80000000, moneda: 'PYG', valor_al: hoy, nota: '', activo: true, baja: null, baja_el: null, creado_por: N.uid });
  // Lo mínimo que puede mandar la pantalla: empresa, nombre, tipo y valor (por posición, como en una llamada corta).
  r = await T.quieta('guardar_bien', () => intento(N.uid, `select public.guardar_bien($1,$2,$3,$4) id`, [N.empresaId, 'Casa de Lambaré', 'casa', 350000000]));
  aceptado('sin moneda (empresa, nombre, tipo y valor)', r);
  const casa = r.valor.rows[0].id;
  ok('  va en la moneda del negocio', (await T.filaBien(casa)).moneda, 'PYG');
  const terreno = await T.bien(N, { nombre: '  Terreno en Luque  ', tipo: 'terreno', valor: 30000, moneda: ' usd ', nota: '  12 x 30, con título  ' });
  ok('la moneda se acepta en minúsculas y con espacios; el nombre y la nota, sin los espacios de los costados',
    await T.filaBien(terreno), { nombre: 'Terreno en Luque', tipo: 'terreno', valor: 30000, moneda: 'USD', valor_al: hoy, nota: '12 x 30, con título', activo: true, baja: null, baja_el: null, creado_por: N.uid });
  const sinTipo = await T.bien(N, { nombre: 'Cuadro', valor: 1500000 });
  const tipoNulo = await T.bien(N, { nombre: 'Reloj', tipo: null, valor: 900000 });
  ok('sin tipo (o con el tipo vacío) es «otro»', [(await T.filaBien(sinTipo)).tipo, (await T.filaBien(tipoNulo)).tipo], ['otro', 'otro']);
  for (const tipo of ['vehiculo', 'terreno', 'casa', 'maquina', 'animales', 'otro']) {
    r = await T.anotar(N, { nombre: `Algo de tipo ${tipo}`, tipo, valor: 1000 });
    ok(`el tipo «${tipo}» existe`, r.ok ? (await T.filaBien(r.valor.rows[0].id)).tipo : r.error, tipo);
    await T.quitar(N, r.valor.rows[0].id);
  }
  for (const moneda of ['PYG', 'USD', 'ARS', 'BRL', 'EUR']) {
    r = await T.anotar(N, { nombre: `Algo en ${moneda}`, valor: 1000, moneda });
    ok(`la moneda ${moneda} se conoce`, r.ok ? (await T.filaBien(r.valor.rows[0].id)).moneda : r.error, moneda);
    await T.quitar(N, r.valor.rows[0].id);
  }
  const cuantosAntes = await n('select count(*) n from public.bienes');
  rechazado('una moneda que no conocemos', await T.anotar(N, { nombre: 'Reloj', valor: 100, moneda: 'GBP' }), NO_CONOCEMOS);
  rechazado('  o que no es una moneda', await T.anotar(N, { nombre: 'Reloj', valor: 100, moneda: 'dólares' }), NO_CONOCEMOS);
  rechazado('valor cero', await T.anotar(N, { nombre: 'Reloj', valor: 0 }), PONE_VALOR);
  rechazado('valor negativo', await T.anotar(N, { nombre: 'Reloj', valor: -5000 }), PONE_VALOR);
  rechazado('sin valor (null)', await T.anotar(N, { nombre: 'Reloj', valor: null }), PONE_VALOR);
  rechazado('  o sin mandarlo', await T.anotar(N, { nombre: 'Reloj' }), PONE_VALOR);
  rechazado('nombre vacío', await T.anotar(N, { nombre: '', valor: 100 }), PONELE_NOMBRE);
  rechazado('  solo espacios', await T.anotar(N, { nombre: '   ', valor: 100 }), PONELE_NOMBRE);
  rechazado('  o null', await T.anotar(N, { nombre: null, valor: 100 }), PONELE_NOMBRE);
  rechazado('un tipo que no existe', await T.anotar(N, { nombre: 'Lancha', tipo: 'barco', valor: 100 }), TIPO_NO_EXISTE);
  rechazado('un valor con ceros de más (no entra en la columna): se dice, no revienta', await T.anotar(N, { nombre: 'Estancia', valor: 1000000000000 }), MONTO_GRANDE);
  ok('nada de lo rechazado quedó anotado', await n('select count(*) n from public.bienes'), cuantosAntes);
  {
    const largo = await T.bien(N, { nombre: 'A'.repeat(80), valor: 1000, nota: 'n'.repeat(250) });
    const f = await T.filaBien(largo);
    ok('un nombre de más de 60 letras y una nota de más de 200 se cortan: no es motivo para no guardar', [f.nombre.length, f.nota.length], [60, 200]);
    await T.quitar(N, largo);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('2 · El valor, con los decimales de SU moneda');
  // ═════════════════════════════════════════════════════════════════════
  {
    const enDolares = await T.bien(N, { nombre: 'Campo', tipo: 'terreno', valor: 30000.555, moneda: 'USD' });
    const enGuaranies = await T.bien(N, { nombre: 'Camión', tipo: 'vehiculo', valor: 80000000.4, moneda: 'PYG' });
    const haciaArriba = await T.bien(N, { nombre: 'Acoplado', tipo: 'vehiculo', valor: 80000000.5 });
    const enReales = await T.bien(N, { nombre: 'Departamento en Foz', tipo: 'casa', valor: 250000.005, moneda: 'BRL' });
    ok('US$ 30.000,555 queda en 30.000,56; Gs. 80.000.000,4 en 80.000.000; ,5 sube; R$ 250.000,005 en 250.000,01',
      [(await T.filaBien(enDolares)).valor, (await T.filaBien(enGuaranies)).valor, (await T.filaBien(haciaArriba)).valor, (await T.filaBien(enReales)).valor],
      [30000.56, 80000000, 80000001, 250000.01]);
    rechazado('lo que redondea a cero no es un valor: medio centavo de dólar', await T.anotar(N, { nombre: 'Nada', valor: 0.004, moneda: 'USD' }), PONE_VALOR);
    rechazado('  ni cuarenta céntimos de guaraní', await T.anotar(N, { nombre: 'Nada', valor: 0.4 }), PONE_VALOR);
    aceptado('  un centavo de dólar sí', await T.anotar(N, { nombre: 'Un centavo', valor: 0.005, moneda: 'USD' }));
    for (const id of [enDolares, enGuaranies, haciaArriba, enReales]) await T.quitar(N, id);
    await T.quitar(N, (await uno(`select id from public.bienes where nombre = 'Un centavo' and activo`)).id);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('3 · Editar cambia el nombre, el tipo y la nota. El valor y la moneda, no');
  // ═════════════════════════════════════════════════════════════════════
  // La estimación del auto es vieja (se retrocede la fecha a mano, sin sesión, como lo haría el paso del tiempo).
  await db.query(`update public.bienes set valor_al = '2025-03-10' where id = $1`, [auto]);
  aceptado('editar el auto mandando, además, otro valor y otra moneda',
    await T.anotar(N, { id: auto, nombre: 'Hilux 2018', tipo: 'maquina', nota: 'la blanca', valor: 1, moneda: 'USD' }));
  ok('  cambiaron el nombre, el tipo y la nota; el valor, la moneda y la fecha de la estimación quedaron como estaban',
    await T.filaBien(auto),
    { nombre: 'Hilux 2018', tipo: 'maquina', valor: 80000000, moneda: 'PYG', valor_al: '2025-03-10', nota: 'la blanca', activo: true, baja: null, baja_el: null, creado_por: N.uid });
  aceptado('  aunque el valor y la moneda que lleguen no sirvan: al editar ni se miran',
    await T.anotar(N, { id: auto, nombre: 'Toyota Hilux', tipo: 'vehiculo', nota: '', valor: -1, moneda: 'XXX' }));
  ok('  y vuelve a llamarse como antes, con su valor intacto', [(await T.filaBien(auto)).nombre, (await T.filaBien(auto)).valor, (await T.filaBien(auto)).moneda], ['Toyota Hilux', 80000000, 'PYG']);
  rechazado('editar dejándolo sin nombre', await T.anotar(N, { id: auto, nombre: ' ' }), PONELE_NOMBRE);
  rechazado('editar con un tipo que no existe', await T.anotar(N, { id: auto, nombre: 'Toyota Hilux', tipo: 'barco' }), TIPO_NO_EXISTE);
  rechazado('editar algo que no existe', await T.anotar(N, { id: '00000000-0000-4000-8000-000000000000', nombre: 'Fantasma' }), YA_NO_ESTA);
  ok('  nada de eso lo cambió', await T.filaBien(auto),
    { nombre: 'Toyota Hilux', tipo: 'vehiculo', valor: 80000000, moneda: 'PYG', valor_al: '2025-03-10', nota: '', activo: true, baja: null, baja_el: null, creado_por: N.uid });

  // ═════════════════════════════════════════════════════════════════════
  grupo('4 · Actualizar cuánto vale');
  // ═════════════════════════════════════════════════════════════════════
  r = await T.actualizar(N, auto, 85000000.4);
  ok('devuelve lo que valía y lo que vale, con esas cuatro claves', r.ok ? r.valor.rows[0].j : r.error, { antes: 80000000, antes_moneda: 'PYG', ahora: 85000000, moneda: 'PYG' });
  ok('  y queda el valor nuevo con la fecha de HOY (la estimación dejó de ser vieja); nada más cambió',
    await T.filaBien(auto),
    { nombre: 'Toyota Hilux', tipo: 'vehiculo', valor: 85000000, moneda: 'PYG', valor_al: hoy, nota: '', activo: true, baja: null, baja_el: null, creado_por: N.uid });
  r = await T.actualizar(N, auto, 11500.555, 'usd');
  ok('con otra moneda cambia la moneda (pasar a dólares lo anotado en guaraníes): el número lo escribe la persona, la base no convierte',
    r.ok ? r.valor.rows[0].j : r.error, { antes: 85000000, antes_moneda: 'PYG', ahora: 11500.56, moneda: 'USD' });
  ok('  queda en dólares, con centavos', [(await T.filaBien(auto)).valor, (await T.filaBien(auto)).moneda], [11500.56, 'USD']);
  r = await T.actualizar(N, auto, 80000000.4, 'PYG');
  ok('  y de vuelta a guaraníes, sin centavos', r.ok ? r.valor.rows[0].j : r.error, { antes: 11500.56, antes_moneda: 'USD', ahora: 80000000, moneda: 'PYG' });
  rechazado('actualizar a cero', await T.actualizar(N, auto, 0), PONE_VALOR);
  rechazado('  a un negativo', await T.actualizar(N, auto, -1), PONE_VALOR);
  rechazado('  a nada', await T.actualizar(N, auto, null), PONE_VALOR);
  rechazado('  a algo que redondea a cero en su moneda', await T.actualizar(N, auto, 0.3), PONE_VALOR);
  rechazado('  con ceros de más', await T.actualizar(N, auto, 1000000000000), MONTO_GRANDE);
  rechazado('  a una moneda que no conocemos', await T.actualizar(N, auto, 100, 'GBP'), NO_CONOCEMOS);
  rechazado('  o algo que no existe', await T.actualizar(N, '00000000-0000-4000-8000-000000000000', 100), YA_NO_ESTA);
  ok('  nada de eso lo cambió', [(await T.filaBien(auto)).valor, (await T.filaBien(auto)).moneda, (await T.filaBien(auto)).valor_al], [80000000, 'PYG', hoy]);

  // ═════════════════════════════════════════════════════════════════════
  grupo('5 · Ya no lo tengo: lo vendí, o sacarlo de la lista');
  // ═════════════════════════════════════════════════════════════════════
  {
    for (const id of [casa, sinTipo, tipoNulo]) await T.quitar(N, id);
    const moto = await T.bien(N, { nombre: 'Moto', tipo: 'vehiculo', valor: 9000000 });
    const heladera = await T.bien(N, { nombre: 'Heladera', tipo: 'otro', valor: 500, moneda: 'USD' });
    let p = await T.patrimonio(N);
    ok('antes: cuatro cosas en la lista, y un total por moneda',
      [porNombre(p.bienes).map((b) => b.nombre), p.bienes_por_moneda],
      [['Heladera', 'Moto', 'Terreno en Luque', 'Toyota Hilux'], [{ moneda: 'PYG', total: 89000000 }, { moneda: 'USD', total: 30500 }]]);
    const filasAntes = await n('select count(*) n from public.bienes');

    r = await T.quitar(N, moto, 'vendido');
    ok('«lo vendí» contesta ok', r.ok ? r.valor.rows[0].j : r.error, { ok: true });
    ok('  la fila queda, apagada, con el motivo y la fecha de hoy', await T.filaBien(moto),
      { nombre: 'Moto', tipo: 'vehiculo', valor: 9000000, moneda: 'PYG', valor_al: hoy, nota: '', activo: false, baja: 'vendido', baja_el: hoy, creado_por: N.uid });
    r = await T.quitar(N, heladera);
    ok('«sacarlo de la lista» (sin motivo) es «quitado»', r.ok ? [(await T.filaBien(heladera)).baja, (await T.filaBien(heladera)).activo] : r.error, ['quitado', false]);
    p = await T.patrimonio(N);
    ok('salieron de la lista y de los totales por moneda',
      [porNombre(p.bienes).map((b) => b.nombre), p.bienes_por_moneda],
      [['Terreno en Luque', 'Toyota Hilux'], [{ moneda: 'PYG', total: 80000000 }, { moneda: 'USD', total: 30000 }]]);
    ok('y no se borró ninguna fila', await n('select count(*) n from public.bienes'), filasAntes);
    ok('VENDERLO NO ANOTA NINGÚN INGRESO: ni un movimiento ni un ajuste nuevos (la plata la anota la persona, donde siempre)',
      [await n(`select count(*) n from public.movimientos where empresa_id = $1`, [N.empresaId]), await n('select count(*) n from public.ajustes_cuenta where empresa_id = $1', [N.empresaId])], [1, 2]);
    rechazado('quitarlo dos veces', await T.quitar(N, moto, 'vendido'), YA_NO_ESTA);
    rechazado('  aunque sea con el otro motivo', await T.quitar(N, moto, 'quitado'), YA_NO_ESTA);
    rechazado('un motivo que no existe', await T.quitar(N, auto, 'regalado'), MOTIVO_NO_EXISTE);
    ok('  y el auto sigue en la lista', (await T.filaBien(auto)).activo, true);
    rechazado('editar lo que ya se quitó', await T.anotar(N, { id: moto, nombre: 'Moto vieja' }), YA_NO_ESTA);
    rechazado('cambiarle el valor a lo que ya se quitó', await T.actualizar(N, moto, 1), YA_NO_ESTA);
    ok('  lo quitado quedó como estaba', [(await T.filaBien(moto)).nombre, (await T.filaBien(moto)).valor, (await T.filaBien(moto)).baja], ['Moto', 9000000, 'vendido']);
    ok('ninguna fila rompe la regla: en la lista y sin baja, o fuera de la lista con su motivo y su fecha',
      await n(`select count(*) n from public.bienes where not ((activo and baja is null and baja_el is null) or (not activo and baja is not null and baja_el is not null))`), 0);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('6 · Un bien es una anotación: no crea ni cambia un movimiento, un ajuste ni un saldo');
  // ═════════════════════════════════════════════════════════════════════
  {
    ok('después de todo lo de arriba (anotar, editar, actualizar, quitar y leer), en TODA la base solo cambió una tabla',
      T.tocadas(todoAntes, await T.todaLaBase()), ['bienes']);
    ok('  los saldos son los de antes de anotar nada: Efectivo 500.000 − 150.000 + 100.000 e Itaú 20.000.000 − 100.000',
      [await saldo(cajaN), await saldo(itauN)], [450000, 19900000]);
    ok('  y lo que la dueña ve en sus pantallas de siempre (la billetera, el resumen del día, el cierre, las deudas, el fiado; y el disponible de la cuenta personal) no cambió ni una letra',
      (await pantallas()) === pantallasAntes, true);
    ok('ninguna función que ya existía lee ni escribe la tabla: ni un reporte, ni el Excel, ni el panel, ni un aviso, ni el resumen semanal, ni la ganancia',
      (await filas(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc ilike '%bienes%' order by 1`)).map((x) => x.proname),
      [...NOMBRES_NUEVAS].sort());
    ok('  ni ninguna vista ni ninguna política', [
      await n(`select count(*) n from pg_views where schemaname = 'public' and definition ilike '%bienes%'`),
      await n(`select count(*) n from pg_policies where schemaname = 'public' and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%bienes%'`)], [0, 0]);
    ok('  y las tres que escriben no nombran ninguna otra tabla para escribir: sus únicos insert y update son de `bienes`',
      (await filas(`select p.proname, p.prosrc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)`, [NOMBRES_NUEVAS]))
        .flatMap((f) => [...f.prosrc.matchAll(/(insert\s+into|update|delete\s+from)\s+(public[.]\w+)/gi)].map((m) => `${f.proname}: ${m[1].toLowerCase().replace(/\s+/g, ' ')} ${m[2]}`))
        .filter((x) => !x.endsWith(' public.bienes')).sort(), []);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('7 · patrimonio(): el ejemplo del diseño, clave por clave');
  // ═════════════════════════════════════════════════════════════════════
  // Gs. 5.000.000 en el banco, US$ 10.000 en otra cuenta, un auto de
  // Gs. 80.000.000, un terreno de US$ 30.000, una deuda de Gs. 12.000.000 y
  // el dólar a 7.400.
  const E = await H.montarEmpresa(db, { email: 'matias@ejemplo.test', nombre: 'El Ejemplo' });
  const bancoE = await T.cuenta(E, 'Banco', 'banco', 5000000, ['transferencia', 'tarjeta']);
  const dolaresE = await T.cuenta(E, 'Cuenta en dólares', 'banco', 10000, [], 'USD');
  const autoE = await T.bien(E, { nombre: 'Toyota Hilux', tipo: 'vehiculo', valor: 80000000 });
  const terrenoE = await T.bien(E, { nombre: 'Terreno en Luque', tipo: 'terreno', valor: 30000, moneda: 'USD' });
  await T.deuda(E, 'Préstamo del auto', 12000000);
  await T.cotizar(E, 'USD', 7400);
  // Para que el orden de la lista no dependa del reloj de la prueba: el auto se anotó una hora antes.
  await db.query(`update public.bienes set created_at = created_at - interval '1 hour' where id = $1`, [autoE]);
  {
    const p = await T.patrimonio(E);
    const b = await T.billetera(E);
    // Tal cual llega a la pantalla: es el contrato de quien la construye.
    console.log(`  · patrimonio() del ejemplo, tal cual: ${JSON.stringify(p)}`);
    ok('las diez claves de la sección 7.3, y ni una más', Object.keys(p).sort(), CLAVES);
    ok('el ejemplo entero', { ...p, bienes: porNombre(p.bienes), cotizaciones: p.cotizaciones.map((c) => ({ ...c, desde: typeof c.desde })) }, {
      moneda: 'PYG',
      bienes: [
        { id: terrenoE, nombre: 'Terreno en Luque', tipo: 'terreno', valor: 30000, moneda: 'USD', valor_al: hoy, nota: '' },
        { id: autoE, nombre: 'Toyota Hilux', tipo: 'vehiculo', valor: 80000000, moneda: 'PYG', valor_al: hoy, nota: '' },
      ],
      plata: [{ moneda: 'PYG', total: 5000000 }, { moneda: 'USD', total: 10000 }],
      plata_de_ahorros: false,
      ahorro_apartado: 0,
      te_deben: 0,
      mercaderia: 0,
      bienes_por_moneda: [{ moneda: 'PYG', total: 80000000 }, { moneda: 'USD', total: 30000 }],
      debes: 12000000,
      cotizaciones: [{ moneda: 'USD', valor: 7400, desde: 'string' }],
    });
    ok('cada bien trae sus siete claves, y solo esas', p.bienes.map((x) => Object.keys(x).sort().join(',')),
      ['id,moneda,nombre,nota,tipo,valor,valor_al', 'id,moneda,nombre,nota,tipo,valor,valor_al']);
    ok('la lista sale en el orden en que se anotó: primero el auto', p.bienes.map((x) => x.nombre), ['Toyota Hilux', 'Terreno en Luque']);
    ok('las cotizaciones son las mismas de la billetera (la misma tabla de la 131), con su fecha', p.cotizaciones, b.cotizaciones);
    // La cuenta que va a hacer la pantalla con esto (no la hace la base): sale con lo que hay.
    const cambio = Object.fromEntries(p.cotizaciones.map((c) => [c.moneda, c.valor]));
    cambio[p.moneda] = 1;
    const de = (lista, moneda) => (lista.find((x) => x.moneda === moneda) ?? { total: 0 }).total;
    const neto = (moneda) => de(p.plata, moneda) + de(p.bienes_por_moneda, moneda)
      + (moneda === p.moneda ? p.te_deben + p.mercaderia - p.debes : 0);
    const monedas = [...new Set([...p.plata, ...p.bienes_por_moneda].map((x) => x.moneda))];
    ok('con estas partes la pantalla llega a «Tengo en total ≈ Gs. 369.000.000» (73.000.000 en guaraníes + 40.000 dólares a 7.400), y a ≈ US$ 49.864,86 al revés',
      [neto('PYG'), neto('USD'), monedas.reduce((s, m) => s + neto(m) * cambio[m], 0),
        Math.round(monedas.reduce((s, m) => s + neto(m) * cambio[m], 0) / 7400 * 100) / 100], [73000000, 40000, 369000000, 49864.86]);
    ok('LA BASE NO CONVIRTIÓ NADA: ningún número de patrimonio() es una mezcla; sin la cotización escrita, devuelve exactamente lo mismo',
      await (async () => {
        await T.cotizar(E, 'USD', null);
        const sin = await T.patrimonio(E);
        await db.query(`insert into public.cotizaciones_moneda (empresa_id, moneda, valor, updated_at) values ($1,'USD',7400,$2)`, [E.empresaId, p.cotizaciones[0].desde]);
        return [sin.cotizaciones, JSON.stringify(canon({ ...sin, cotizaciones: p.cotizaciones })) === JSON.stringify(canon(p)),
          JSON.stringify(canon(await T.patrimonio(E))) === JSON.stringify(canon(p))];
      })(), [[], true, true]);
  }
  // TRES MONEDAS: la plata de patrimonio() es, moneda por moneda, la de billetera().
  {
    const cajaE = await T.cuenta(E, 'Caja', 'efectivo', 300000, ['efectivo']);
    const realesE = await T.cuenta(E, 'Reales', 'efectivo', 2500.5, [], 'BRL');
    const binanceE = await T.cuenta(E, 'Binance', 'billetera', 250.25, [], 'USD');
    const viejaE = await T.cuenta(E, 'Dólares viejos', 'banco', 777, [], 'USD');
    await val(E.uid, MOV, [E.empresaId, 'gasto', 'Luz', 'Servicios', 50000, 'efectivo', null]);                    // sale de la Caja
    await val(E.uid, MOV, [E.empresaId, 'ingreso', 'Alquiler', 'Otros', 900000, 'transferencia', null]);           // entra al Banco
    await val(E.uid, MOV, [E.empresaId, 'ingreso', 'Reintegro', 'Otros', 25000, 'otro', null]);                    // suelto: sin cuenta
    await val(E.uid, MOV_CUENTA, [E.empresaId, 'gasto', 'Hosting', 'Servicios', 116727, 'tarjeta', dolaresE, 15.99]);  // US$ 15,99 de la cuenta en dólares
    await T.pase(E, bancoE, dolaresE, 740000, 100);                                                                // compra US$ 100
    await T.pase(E, binanceE, realesE, 100, 540);                                                                  // US$ 100 → R$ 540
    await val(E.uid, `select public.ajustar_saldo_cuenta(p_empresa => $1, p_cuenta => $2, p_saldo_real => $3, p_nota => '') j`, [E.empresaId, realesE, 3000]);
    await val(E.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [E.empresaId, viejaE]);                         // sin historia: se borra
    const archivadaE = await T.cuenta(E, 'Wise', 'billetera', 500, [], 'USD');
    await T.pase(E, dolaresE, archivadaE, 84);
    await val(E.uid, 'select public.quitar_cuenta_dinero($1,$2) j', [E.empresaId, archivadaE]);                     // con historia: archivada, con US$ 584
    const b = await T.billetera(E);
    const p = await T.patrimonio(E);
    // Guaraníes: Banco 5.000.000 + 900.000 − 740.000 = 5.160.000; Caja 300.000 − 50.000 = 250.000.
    // Dólares: 10.000 − 15,99 + 100 − 84 = 10.000,01; Binance 250,25 − 100 = 150,25. Reales: ajustados a 3.000.
    ok('con cuentas en tres monedas: un total por moneda, primero la del negocio y después las otras por código (los números, a mano)',
      p.plata, [{ moneda: 'PYG', total: 5410000 }, { moneda: 'BRL', total: 3000 }, { moneda: 'USD', total: 10150.26 }]);
    ok('la propia es `billetera().total`', [p.plata[0].moneda, p.plata[0].total], [b.moneda, b.total]);
    ok('y cada una de las otras es su renglón de `billetera().totales_otras`',
      p.plata.slice(1), b.totales_otras.map((t) => ({ moneda: t.moneda, total: t.total })));
    // Los dos números tal cual salen de la base, sin pasar por JavaScript.
    const textos = await val(E.uid,
      `select (public.billetera($1) ->> 'total') as de_la_billetera, (public.patrimonio($1) -> 'plata' -> 0 ->> 'total') as del_patrimonio,
              (select string_agg(x ->> 'total', '|' order by x ->> 'moneda') from jsonb_array_elements(public.billetera($1) -> 'totales_otras') x) as otras_billetera,
              (select string_agg(x ->> 'total', '|' order by x ->> 'moneda') from jsonb_array_elements(public.patrimonio($1) -> 'plata') x
                where x ->> 'moneda' <> 'PYG') as otras_patrimonio`, [E.empresaId]);
    ok('  también como texto, cifra por cifra', [textos.del_patrimonio, textos.otras_patrimonio], [textos.de_la_billetera, textos.otras_billetera]);
    ok('  y es la suma del saldo de cada cuenta activa (la función que usa la billetera), agrupada por su moneda',
      p.plata, await (async () => {
        const porMoneda = new Map([['PYG', 0]]);
        for (const c of await filas(`select coalesce(c.moneda, 'PYG') as moneda, public.saldo_cuenta_dinero(c.id)::float as s
                                       from public.cuentas_dinero c where c.empresa_id = $1 and c.activa`, [E.empresaId])) {
          porMoneda.set(c.moneda, Math.round(((porMoneda.get(c.moneda) ?? 0) + c.s) * 100) / 100);
        }
        return [...porMoneda].sort(([a], [z]) => (a !== 'PYG') - (z !== 'PYG') || a.localeCompare(z)).map(([moneda, total]) => ({ moneda, total }));
      })());
    ok('la cuenta archivada (con sus US$ 584) no entra, igual que en la billetera; la plata sin cuenta (Gs. 25.000) tampoco, igual que en «Tu plata»',
      [await saldo(archivadaE), b.sin_cuenta.neto, p.plata.find((x) => x.moneda === 'USD').total], [584, 25000, 10150.26]);
    ok('nunca se suman monedas: ningún total de patrimonio() es la suma de dos monedas distintas',
      [p.plata.length, new Set(p.plata.map((x) => x.moneda)).size, p.bienes_por_moneda.length, new Set(p.bienes_por_moneda.map((x) => x.moneda)).size], [3, 3, 2, 2]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('8 · Los ahorros no se suman: ya están adentro de la plata');
  // ═════════════════════════════════════════════════════════════════════
  const ahorro = async (C, nombre, moneda = null) => (await val(C.uid, 'select public.guardar_ahorro(p_empresa => $1, p_nombre => $2, p_moneda => $3) id', [C.empresaId, nombre, moneda])).id;
  const mover = (C, fondo, tipo, monto, local = null) => val(C.uid,
    'select public.mover_ahorro(p_empresa => $1, p_ahorro => $2, p_tipo => $3, p_monto => $4, p_monto_local => $5) j', [C.empresaId, fondo, tipo, monto, local]);
  const resumenPersonal = (C) => J(C.uid, 'select public.resumen_personal($1) j', [C.empresaId]);
  {
    // CON CUENTAS. P1 tiene Gs. 100.000 en la billetera y Gs. 3.000.000 en Ueno.
    await T.bien(P1, { nombre: 'Moto', tipo: 'vehiculo', valor: 9000000 });
    const antes = await T.patrimonio(P1);
    ok('con cuentas y sin fondos: la plata son las cuentas, y nada guardado', [antes.plata, antes.plata_de_ahorros, antes.ahorro_apartado], [[{ moneda: 'PYG', total: 3100000 }], false, 0]);
    const viaje = await ahorro(P1, 'Viaje');
    await mover(P1, viaje, 'aporte', 500000);
    let p = await T.patrimonio(P1);
    let rp = await resumenPersonal(P1);
    ok('guardar Gs. 500.000 en un fondo NO cambia la plata (no salieron de ninguna cuenta) y sube lo guardado',
      [p.plata, p.plata_de_ahorros, p.ahorro_apartado], [antes.plata, false, 500000]);
    ok('  lo guardado es el `ahorro_total` del resumen personal', p.ahorro_apartado, rp.ahorro_total);
    const dolares = await ahorro(P1, 'Dólares', 'USD');
    await mover(P1, dolares, 'aporte', 100, 750000);
    await mover(P1, viaje, 'retiro', 200000);
    p = await T.patrimonio(P1);
    rp = await resumenPersonal(P1);
    ok('con un fondo en dólares (US$ 100 que costaron Gs. 750.000) y un retiro de Gs. 200.000: lo guardado va en la moneda de la cuenta, como en «Disponible»',
      [p.plata, p.ahorro_apartado, rp.ahorro_total, p.plata_de_ahorros], [antes.plata, 1050000, 1050000, false]);
    ok('  la plata sigue siendo la de la billetera, y «Disponible» sigue saliendo de ahí menos lo guardado',
      [p.plata[0].total, (await T.billetera(P1)).total, rp.en_cuentas, rp.disponible], [3100000, 3100000, 3100000, 3100000 - 1050000]);
  }
  {
    // SIN NINGUNA CUENTA Y CON FONDOS: la excepción de la 085. La plata son los fondos.
    const P2 = await T.personal('ahorrista@correo.test', 'Sin cuentas');
    let p = await T.patrimonio(P2);
    ok('sin cuentas y sin fondos: la plata es cero en su moneda (el renglón «Plata» está siempre), y no sale de ahorros',
      [p.plata, p.plata_de_ahorros, p.ahorro_apartado], [[{ moneda: 'PYG', total: 0 }], false, 0]);
    const enDolares = await ahorro(P2, 'Dólares', 'USD');
    await mover(P2, enDolares, 'aporte', 300, 2220000);
    p = await T.patrimonio(P2);
    ok('con un fondo en dólares y ninguna cuenta: `plata_de_ahorros`, y la plata son los US$ 300 del fondo (la propia sigue estando, en cero)',
      [p.plata_de_ahorros, p.plata, p.ahorro_apartado], [true, [{ moneda: 'PYG', total: 0 }, { moneda: 'USD', total: 300 }], 0]);
    const propio = await ahorro(P2, 'Emergencias');
    await mover(P2, propio, 'aporte', 400000);
    await mover(P2, enDolares, 'retiro', 50, 380000);
    p = await T.patrimonio(P2);
    const rp = await resumenPersonal(P2);
    ok('con otro fondo en su moneda: la plata por moneda, cada fondo en la SUYA (no lo que costó)',
      [p.plata_de_ahorros, p.plata], [true, [{ moneda: 'PYG', total: 400000 }, { moneda: 'USD', total: 250 }]]);
    ok('  son los saldos de los fondos que muestra el Presupuesto (`resumen_personal().ahorros`), agrupados por su moneda',
      p.plata, [...rp.ahorros.reduce((m, a) => m.set(a.moneda ?? 'PYG', (m.get(a.moneda ?? 'PYG') ?? 0) + a.saldo), new Map([['PYG', 0]]))]
        .sort(([a], [z]) => (a !== 'PYG') - (z !== 'PYG') || a.localeCompare(z)).map(([moneda, total]) => ({ moneda, total })));
    ok('  y ahí lo guardado va en cero: no hay un «de eso», es todo (el resumen personal sigue diciendo lo que costó)',
      [p.ahorro_apartado, rp.ahorro_total], [0, 400000 + 2220000 - 380000]);
    // Un fondo en una moneda que la billetera no conoce: la base de ahorros acepta cualquier sigla (073).
    const libras = await ahorro(P2, 'Libras', 'GBP');
    await mover(P2, libras, 'aporte', 50, 500000);
    p = await T.patrimonio(P2);
    ok('un fondo en libras sale con su código, en su lugar', p.plata, [{ moneda: 'PYG', total: 400000 }, { moneda: 'GBP', total: 50 }, { moneda: 'USD', total: 250 }]);
    rechazado('  (para esa moneda no se puede escribir cotización: la pantalla no puede dar un «≈» ni ofrecer el enlace)',
      await T.intento(P2.uid, `select public.guardar_cotizacion_moneda($1,'GBP',9800) j`, [P2.empresaId]), NO_CONOCEMOS);
    // En cuanto tiene UNA cuenta, la que sea, vuelve la regla de siempre: nunca se mezclan cuentas y fondos.
    await T.cuenta(P2, 'Dólares en el banco', 'banco', 1000, [], 'USD');
    p = await T.patrimonio(P2);
    // Lo guardado, en su moneda: 400.000 + 2.220.000 − 380.000 + 500.000 de las libras.
    ok('en cuanto carga una cuenta (aunque sea en dólares) la plata vuelven a ser las cuentas y los fondos pasan a «guardado»: no se cuentan dos veces',
      [p.plata_de_ahorros, p.plata, p.ahorro_apartado, (await resumenPersonal(P2)).ahorro_total],
      [false, [{ moneda: 'PYG', total: 0 }, { moneda: 'USD', total: 1000 }], 2740000, 2740000]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('9 · Lo que te deben, lo que debés y la mercadería: el número de su pantalla');
  // ═════════════════════════════════════════════════════════════════════
  {
    const C = await H.montarEmpresa(db, { email: 'bazar@comercio.test', nombre: 'Bazar Sol' });
    await T.bien(C, { nombre: 'Local', tipo: 'casa', valor: 200000000 });
    // TE DEBEN. Juan debe 25.000 (le fió 40.000 y pagó 15.000); Ana pagó todo; Luis debe 7.500.
    const juan = await T.cliente(C, 'Juan Pérez', '0981 234 567');
    const ana = await T.cliente(C, 'Ana Gómez', '0982 111 222');
    const luis = await T.cliente(C, 'Luis Benítez', '0983 333 444');
    await val(C.uid, `select public.anotar_fiado($1,$2,40000,'yerba')`, [C.empresaId, juan]);
    await val(C.uid, 'select public.cobrar_fiado($1,$2,15000)', [C.empresaId, juan]);
    await val(C.uid, `select public.anotar_fiado($1,$2,10000,'pan')`, [C.empresaId, ana]);
    await val(C.uid, 'select public.cobrar_fiado($1,$2,10000)', [C.empresaId, ana]);
    await val(C.uid, `select public.anotar_fiado($1,$2,7500,'leche')`, [C.empresaId, luis]);
    // DEBÉS. Un préstamo de 12.000.000 con 2.000.000 pagados, y una tarjeta de 500.000 archivada.
    const prestamo = await T.deuda(C, 'Préstamo', 12000000);
    await val(C.uid, 'select public.registrar_pago_deuda(p_deuda => $1, p_monto => $2, p_crear_gasto => false) j', [prestamo, 2000000]);
    const tarjeta = await T.deuda(C, 'Tarjeta vieja', 500000);
    await val(C.uid, 'select public.archivar_deuda($1)', [tarjeta]);
    // MERCADERÍA.
    const prod = (d) => H.crearProducto(db, C.empresaId, C.uid, d);
    await prod({ nombre: 'Shampoo', costo: 20000, precio: 35000, stock: 10 });                  //  10 × 20.000    =  200.000
    await prod({ nombre: 'Crema sin costo', costo: 0, precio: 30000, stock: 5 });               //  sin costo: no suma
    const jabon = await prod({ nombre: 'Jabón pausado', costo: 5000, precio: 9000, stock: 100 });  //  inactivo: no suma
    const aceite = await prod({ nombre: 'Aceite', costo: 15000, precio: 22000, stock: 0 });     //  −3 × 15.000    =  −45.000 (se vendió de más)
    await prod({ nombre: 'Queso', costo: 33333.33, precio: 50000, stock: 1.5 });                //  1,5 × 33.333,33 = 49.999,995
    const corte = await prod({ nombre: 'Corte de pelo', costo: 8000, precio: 40000, stock: 0, controla_stock: false });  // un servicio: no es mercadería
    await db.query('update public.productos set activo = false where id = $1', [jabon]);
    await db.query('update public.productos set stock = -3 where id = $1', [aceite]);
    await db.query('update public.productos set stock = 4 where id = $1', [corte]);   // un servicio con un número viejo en stock: tampoco
    const ESPERADA = 204999.995;   // 200.000 − 45.000 + 49.999,995, a mano

    const p = await T.patrimonio(C);
    const rf = await J(C.uid, 'select public.resumen_fiado($1) j', [C.empresaId]);
    const rd = await J(C.uid, 'select public.resumen_deudas($1) j', [C.empresaId]);
    ok('te deben Gs. 32.500 (Juan 25.000 + Luis 7.500; Ana ya pagó): el `total` de resumen_fiado()', [p.te_deben, rf.total, rf.cuantos], [32500, 32500, 2]);
    ok('debés Gs. 10.000.000 (el préstamo menos lo pagado; la archivada no cuenta): el `total_debido` de resumen_deudas()', [p.debes, rd.total_debido, rd.cuantas], [10000000, 10000000, 1]);
    ok('la mercadería, a precio de costo: Gs. 204.999,995 (el producto sin costo, el pausado y el servicio no suman; el de stock negativo resta, como en Productos)',
      p.mercaderia, ESPERADA);
    // La misma cuenta, con las funciones de la pantalla sobre lo que le llega a la pantalla.
    const catalogo = await J(C.uid, 'select public.listar_productos($1, true) j', [C.empresaId]);
    const productosActivos = catalogo.filter((x) => x.activo && x.controla_stock);               // PantallaProductos.tsx: `p.activo && esProducto(p)`
    const invertido = productosActivos.reduce((s, x) => s + Number(x.stock) * Number(x.costo ?? 0), 0);   // «Invertido en stock»
    const alCosto = valorAlCosto(productosActivos);                                              // lib/reportes/comercio.ts
    ok('  es el «Invertido en stock» de la pantalla de Productos, y lo que da `valorAlCosto` sobre los mismos productos',
      [catalogo.length, productosActivos.length, Math.abs(invertido - ESPERADA) < 1e-6, Math.abs(alCosto.total - ESPERADA) < 1e-6, alCosto.sinCosto,
        Math.abs(p.mercaderia - invertido) < 1e-6], [6, 4, true, true, 1, true]);
    ok('  y en pantalla se lee igual: redondeado a guaraníes, Gs. 205.000 en los dos lados', [Math.round(p.mercaderia), Math.round(invertido)], [205000, 205000]);
    ok('todo eso va en la moneda del negocio, cada número por separado, sin sumarlos entre sí',
      [p.moneda, p.plata, p.bienes_por_moneda, p.ahorro_apartado], ['PYG', [{ moneda: 'PYG', total: 0 }], [{ moneda: 'PYG', total: 200000000 }], 0]);
    // Cobrar el fiado y pagar la deuda mueven los dos números a la par.
    await val(C.uid, 'select public.cobrar_fiado($1,$2,7500)', [C.empresaId, luis]);
    await val(C.uid, 'select public.registrar_pago_deuda(p_deuda => $1, p_monto => $2, p_crear_gasto => false) j', [prestamo, 10000000]);
    const p2 = await T.patrimonio(C);
    ok('cuando Luis paga y el préstamo se termina, siguen siendo los de sus pantallas: te deben 25.000 y no debés nada',
      [p2.te_deben, (await J(C.uid, 'select public.resumen_fiado($1) j', [C.empresaId])).total, p2.debes,
        (await J(C.uid, 'select public.resumen_deudas($1) j', [C.empresaId])).total_debido], [25000, 25000, 0, 0]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('10 · Es simétrico: un negocio en dólares con un bien en guaraníes');
  // ═════════════════════════════════════════════════════════════════════
  {
    const U = await H.montarEmpresa(db, { email: 'productor@campo.test', nombre: 'Estancia La Paz', moneda: 'USD' });
    await T.cuenta(U, 'Banco', 'banco', 20000, ['transferencia']);
    await T.cuenta(U, 'Caja en guaraníes', 'efectivo', 7400000.4, [], 'PYG');
    const tractor = await T.bien(U, { nombre: 'Tractor', tipo: 'maquina', valor: 45000.005 });                        // sin moneda: la del negocio
    await T.bien(U, { nombre: 'Campo', tipo: 'terreno', valor: 30000, moneda: 'USD' });
    const lote = await T.bien(U, { nombre: 'Lote en Luque', tipo: 'terreno', valor: 74000000.4, moneda: 'PYG' });
    await T.deuda(U, 'Crédito del tractor', 15000);
    await T.cotizar(U, 'PYG', 1 / 7400);
    const p = await T.patrimonio(U);
    ok('la moneda del negocio es el dólar: sin decirla, el tractor queda en dólares y con centavos; el lote en guaraníes, sin centavos',
      [(await T.filaBien(tractor)).moneda, (await T.filaBien(tractor)).valor, (await T.filaBien(lote)).moneda, (await T.filaBien(lote)).valor],
      ['USD', 45000.01, 'PYG', 74000000]);
    ok('las mismas claves, con «propia» y «otra» al revés', { ...p, bienes: p.bienes.length, cotizaciones: p.cotizaciones.map((c) => [c.moneda, c.valor]) }, {
      moneda: 'USD',
      bienes: 3,
      plata: [{ moneda: 'USD', total: 20000 }, { moneda: 'PYG', total: 7400000 }],
      plata_de_ahorros: false,
      ahorro_apartado: 0,
      te_deben: 0,
      mercaderia: 0,
      bienes_por_moneda: [{ moneda: 'USD', total: 75000.01 }, { moneda: 'PYG', total: 74000000 }],
      debes: 15000,
      cotizaciones: [['PYG', 0.0001351351]],
    });
    const b = await T.billetera(U);
    ok('y la plata es la de su billetera: el total en dólares, y los guaraníes aparte',
      p.plata, [{ moneda: b.moneda, total: b.total }, ...b.totales_otras.map((t) => ({ moneda: t.moneda, total: t.total }))]);
  }
  {
    // La moneda de un bien va escrita: si el negocio corrige su moneda (sin movimientos, 051), el terreno no se reetiqueta.
    const M = await H.montarEmpresa(db, { email: 'nuevo@negocio.test', nombre: 'Recién Creado' });
    const terrenoM = await T.bien(M, { nombre: 'Terreno', tipo: 'terreno', valor: 250000000 });
    aceptado('un negocio sin movimientos corrige su moneda a dólares (lo de Ajustes)',
      await intento(M.uid, `update public.empresas set moneda = 'USD' where id = $1`, [M.empresaId]));
    const p = await T.patrimonio(M);
    ok('su terreno sigue valiendo Gs. 250.000.000: no pasó a «US$ 250.000.000»',
      [p.moneda, (await T.filaBien(terrenoM)).moneda, p.bienes_por_moneda, p.plata], ['USD', 'PYG', [{ moneda: 'PYG', total: 250000000 }], [{ moneda: 'USD', total: 0 }]]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('11 · Quién puede (los roles, con los privilegios de producción, están en el grupo B)');
  // ═════════════════════════════════════════════════════════════════════
  {
    const vendedor = await H.sumarMiembro(db, N.empresaId, 'vende@almacen.test', 'vendedor');
    const fotoN = await T.todaLaBase();
    rechazado('un vendedor no lee el patrimonio', await T.pedirPatrimonio(N, vendedor), SOLO_DUENO_VER);
    rechazado('  ni anota', await T.anotar(N, { nombre: 'Moto', valor: 1000 }, vendedor), SOLO_DUENO_TOCAR);
    rechazado('  ni edita', await T.anotar(N, { id: auto, nombre: 'Mío' }, vendedor), SOLO_DUENO_TOCAR);
    rechazado('  ni actualiza un valor', await T.actualizar(N, auto, 1, undefined, vendedor), SOLO_DUENO_TOCAR);
    rechazado('  ni quita', await T.quitar(N, auto, 'vendido', vendedor), SOLO_DUENO_TOCAR);
    rechazado('otra empresa no lee este patrimonio', await T.pedirPatrimonio(N, E.uid), SOLO_DUENO_VER);
    rechazado('  ni toca un bien de acá con su propia empresa por delante', await T.actualizar(E, auto, 1), YA_NO_ESTA);
    rechazado('  ni lo quita', await T.quitar(E, auto, 'vendido'), YA_NO_ESTA);
    ok('  y en el suyo no aparece nada de acá', (await T.patrimonio(E)).bienes.map((x) => x.id).sort(), [autoE, terrenoE].sort());
    rechazado('sin sesión (el sistema, sin nadie adentro) tampoco se anota nada',
      await (async () => { try { return { ok: true, valor: await db.query(`select public.guardar_bien($1,'Fantasma','otro',1)`, [N.empresaId]) }; } catch (e) { return { ok: false, error: e.message }; } })(),
      SOLO_DUENO_TOCAR);
    ok('nada de eso tocó la base', T.tocadas(fotoN, await T.todaLaBase()), []);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('12 · El negocio vencido y la personal en Gratis');
  // ═════════════════════════════════════════════════════════════════════
  {
    const V = await H.montarEmpresa(db, { email: 'kiosco@vencido.test', nombre: 'Kiosco Vencido' });
    await T.cuenta(V, 'Caja', 'efectivo', 1000000, ['efectivo']);
    const camioneta = await T.bien(V, { nombre: 'Camioneta', tipo: 'vehiculo', valor: 50000000 });
    await T.vencer(V.empresaId);
    const antes = await T.todaLaBase();
    rechazado('vencido: no anota', await T.anotar(V, { nombre: 'Moto', valor: 9000000 }), CANDADO);
    rechazado('vencido: no edita', await T.anotar(V, { id: camioneta, nombre: 'Camioneta vieja' }), CANDADO);
    rechazado('vencido: no actualiza el valor', await T.actualizar(V, camioneta, 45000000), CANDADO);
    rechazado('vencido: no quita (quitar es un cambio, no un borrado: el candado lo cubre solo)', await T.quitar(V, camioneta, 'vendido'), CANDADO);
    ok('vencido: nada de eso tocó la base', T.tocadas(antes, await T.todaLaBase()), []);
    const p = await T.patrimonio(V);
    ok('vencido: leer sigue andando', [p.bienes.map((x) => [x.nombre, x.valor]), p.plata], [[['Camioneta', 50000000]], [{ moneda: 'PYG', total: 1000000 }]]);
  }
  {
    const F = await T.personal('gratis@correo.test', 'Finanzas en Gratis');
    await T.cuenta(F, 'Billetera', 'efectivo', 300000, ['efectivo']);
    const autoF = await T.bien(F, { nombre: 'Auto', tipo: 'vehiculo', valor: 40000000 });
    await T.vencer(F.empresaId);
    ok('(la personal quedó en Gratis)', (await uno('select public.es_gratis_personal($1) g', [F.empresaId])).g, true);
    const antes = await T.todaLaBase();
    for (const [nombre, pedir] of [
      ['no anota', () => T.anotar(F, { nombre: 'Moto', valor: 9000000 })],
      ['no edita', () => T.anotar(F, { id: autoF, nombre: 'Auto viejo' })],
      ['no actualiza el valor', () => T.actualizar(F, autoF, 35000000)],
      ['no quita', () => T.quitar(F, autoF, 'quitado')],
    ]) {
      const res = await pedir();
      rechazado(`Gratis: ${nombre}`, res, ES_DEL_PRO);
      if (!res.ok) ok(`  y no dice que Orden se cerró (${nombre})`, /seguir usando Orden/i.test(res.error), false);
    }
    ok('Gratis: nada de eso tocó la base', T.tocadas(antes, await T.todaLaBase()), []);
    ok('Gratis: lo anotado queda guardado (la pantalla lo tapa con el candado de la sección; la base lo sigue teniendo)',
      (await T.patrimonio(F)).bienes.map((x) => [x.nombre, x.valor]), [['Auto', 40000000]]);
    await H.comoServicio(db, () => db.query(`select public.aplicar_suscripcion($1,'pro','activa',now(),now()+interval '30 days','manual')`, [F.empresaId]));
    aceptado('y vuelve con el Pro: paga y actualiza el valor de su auto', await T.actualizar(F, autoF, 35000000));
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('13 · Hasta 100 cosas en la lista');
  // ═════════════════════════════════════════════════════════════════════
  {
    const L = await H.montarEmpresa(db, { email: 'coleccionista@lista.test', nombre: 'Muchas Cosas' });
    const ids = [];
    for (let i = 1; i <= 100; i++) ids.push(await T.bien(L, { nombre: `Cosa ${i}`, valor: 1000 * i }));
    ok('se anotan cien', [(await T.patrimonio(L)).bienes.length, (await T.patrimonio(L)).bienes_por_moneda], [100, [{ moneda: 'PYG', total: 5050000 }]]);
    rechazado('la ciento uno, no', await T.anotar(L, { nombre: 'Cosa 101', valor: 1 }), TOPE);
    aceptado('editar una de las cien sí se puede', await T.anotar(L, { id: ids[0], nombre: 'Cosa uno' }));
    aceptado('quitando una…', await T.quitar(L, ids[99], 'vendido'));
    aceptado('  …entra otra: las quitadas no cuentan', await T.anotar(L, { nombre: 'Cosa nueva', valor: 5 }));
    rechazado('  y otra vez está lleno', await T.anotar(L, { nombre: 'Una más', valor: 1 }), TOPE);
    ok('  cien en la lista, ciento una filas', [await n('select count(*) n from public.bienes where empresa_id = $1 and activo', [L.empresaId]),
      await n('select count(*) n from public.bienes where empresa_id = $1', [L.empresaId])], [100, 101]);
    ok('el tope es por cuenta: la de al lado sigue anotando', (await T.anotar(E, { nombre: 'Bicicleta', valor: 1500000 })).ok, true);
    await T.quitar(E, (await uno(`select id from public.bienes where empresa_id = $1 and nombre = 'Bicicleta'`, [E.empresaId])).id);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('14 · «Empezar de cero»: lo que tenés queda');
  // ═════════════════════════════════════════════════════════════════════
  {
    const Z = await H.montarEmpresa(db, { email: 'bazar@cero.test', nombre: 'Bazar De Cero' });
    const cajaZ = await T.cuenta(Z, 'Caja', 'efectivo', 1000000, ['efectivo']);
    await T.cuenta(Z, 'Dólares', 'banco', 2000, [], 'USD');
    await val(Z.uid, MOV, [Z.empresaId, 'gasto', 'Luz', 'Servicios', 50000, 'efectivo', null]);
    await H.crearProducto(db, Z.empresaId, Z.uid, { nombre: 'Shampoo', costo: 20000, precio: 35000, stock: 10 });
    await T.cotizar(Z, 'USD', 7400);
    const autoZ = await T.bien(Z, { nombre: 'Auto', tipo: 'vehiculo', valor: 60000000 });
    const vendidoZ = await T.bien(Z, { nombre: 'Moto', tipo: 'vehiculo', valor: 7000000 });
    await T.quitar(Z, vendidoZ, 'vendido');
    const filasZ = async () => JSON.stringify(await filas('select * from public.bienes where empresa_id = $1 order by id', [Z.empresaId]));
    const antes = await filasZ();
    const pAntes = await T.patrimonio(Z);
    ok('(antes de vaciar: plata 950.000, mercadería 200.000 y un auto)', [pAntes.plata, pAntes.mercaderia, pAntes.bienes.map((x) => x.id)],
      [[{ moneda: 'PYG', total: 950000 }, { moneda: 'USD', total: 2000 }], 200000, [autoZ]]);
    aceptado('empezar de cero', await intento(Z.uid, 'select public.vaciar_empresa($1,$2) j', [Z.empresaId, 'Bazar De Cero']));
    const p = await T.patrimonio(Z);
    ok('los bienes quedan, fila por fila (también lo ya vendido)', (await filasZ()) === antes, true);
    ok('  y el patrimonio muestra lo que quedó: el auto, la cotización, la caja en su saldo inicial y ninguna mercadería',
      [p.bienes.map((x) => [x.id, x.valor]), p.cotizaciones.map((c) => [c.moneda, c.valor]), p.plata, p.mercaderia, await saldo(cajaZ)],
      [[[autoZ, 60000000]], [['USD', 7400]], [{ moneda: 'PYG', total: 1000000 }, { moneda: 'USD', total: 2000 }], 0, 1000000]);
    aceptado('  y se puede seguir anotando', await T.anotar(Z, { nombre: 'Terreno', tipo: 'terreno', valor: 20000, moneda: 'USD' }));
  }
  {
    // Borrar la cuenta entera (129): los bienes se van con ella.
    const jefe = await H.crearUsuario(db, 'jefe@orden.test');
    await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe]);
    const X = await H.montarEmpresa(db, { email: 'se-va@negocio.test', nombre: 'Negocio Que Se Va' });
    await T.bien(X, { nombre: 'Auto', tipo: 'vehiculo', valor: 60000000 });
    const otros = await n('select count(*) n from public.bienes where empresa_id <> $1', [X.empresaId]);
    aceptado('la administración borra una cuenta entera', await H.intentarComo(db, 'service_role', null, () => db.query(
      'select public.borrar_cuenta_entera(p_actor => $1, p_empresa => $2, p_confirmacion => $3, p_solo_comprobar => false) j', [jefe, X.empresaId, 'Negocio Que Se Va'])));
    ok('  y sus bienes se van con ella; los de las demás quedan',
      [await n('select count(*) n from public.bienes where empresa_id = $1', [X.empresaId]), await n('select count(*) n from public.bienes')], [0, otros]);
  }
  {
    // Si se borra el usuario que anotó algo, la anotación queda (sin su nombre).
    const S = await H.montarEmpresa(db, { email: 'dos@socios.test', nombre: 'Dos Socios' });
    const socio = await H.sumarMiembro(db, S.empresaId, 'socio@socios.test', 'admin');
    r = await T.anotar(S, { nombre: 'Galpón', tipo: 'casa', valor: 90000000 }, socio);
    const galpon = r.valor.rows[0].id;
    ok('(lo anota el socio que administra)', (await T.filaBien(galpon)).creado_por, socio);
    await T.vencer(S.empresaId);
    await db.query('delete from auth.users where id = $1', [socio]);
    ok('se borra ese usuario (con el negocio vencido): el galpón sigue en la lista, sin quién lo anotó',
      [(await T.filaBien(galpon)).creado_por, (await T.filaBien(galpon)).activo, (await T.patrimonio(S)).bienes.map((x) => x.nombre)], [null, true, ['Galpón']]);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('15 · La 132 aplicada dos veces más no duplica nada');
  // ═════════════════════════════════════════════════════════════════════
  {
    const bienesAntes = await uno(`select count(*)::int as n, coalesce(md5(string_agg(to_jsonb(b)::text, '|' order by b.id)), '') as h from public.bienes b`);
    ok('una vez más', await correr(db, sql132), null);
    ok('y otra', await correr(db, sql132), null);
    ok('cada función existe una sola vez',
      (await filas(`select p.proname, count(*)::int as n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1) group by 1 order by 1`, [NOMBRES_NUEVAS])),
      [...NOMBRES_NUEVAS].sort().map((proname) => ({ proname, n: 1 })));
    ok('el candado de la tabla, una sola vez, antes de insertar o editar, con la función de siempre',
      (await filas(`select t.tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t where t.tgrelid = 'public.bienes'::regclass and not t.tgisinternal`)),
      [{ tgname: 'cuenta_activa_bienes', def: 'CREATE TRIGGER cuenta_activa_bienes BEFORE INSERT OR UPDATE ON public.bienes FOR EACH ROW EXECUTE FUNCTION exigir_cuenta_activa()' }]);
    ok('lo anotado no se tocó: las mismas filas', await uno(`select count(*)::int as n, coalesce(md5(string_agg(to_jsonb(b)::text, '|' order by b.id)), '') as h from public.bienes b`), bienesAntes);
    ok('las cuatro: security definer con search_path fijo',
      (await filas(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)
                      and (not p.prosecdef or coalesce(p.proconfig::text, '') <> '{search_path=public}')`, [NOMBRES_NUEVAS])), []);
    ok('y quien no inició sesión no ejecuta ninguna (tampoco «cualquiera»)', await quienEjecuta(db, NOMBRES_NUEVAS),
      { actualizar_valor_bien: '-S--', guardar_bien: '-S--', patrimonio: '-S--', quitar_bien: '-S--' });
    rechazado('  de verdad: sin sesión, el patrimonio', await H.intentarComo(db, 'anon', null, () => db.query('select public.patrimonio($1)', [N.empresaId])), 'permission denied');
    aceptado('después de repetirla, todo sigue andando: anotar', await T.anotar(N, { nombre: 'Bicicleta', valor: 1200000 }));
    ok('  y leer', (await T.patrimonio(N)).bienes.map((x) => x.nombre).sort(), ['Bicicleta', 'Terreno en Luque', 'Toyota Hilux']);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('6 (al terminar) · Ninguna llamada de todo el archivo movió plata');
  // ═════════════════════════════════════════════════════════════════════
  {
    ok(`de las ${T.estado.llamadas} llamadas a guardar_bien, actualizar_valor_bien, quitar_bien y patrimonio de esta base, ninguna creó ni cambió un movimiento, un ajuste ni el saldo de una cuenta`,
      [T.estado.movieron, T.estado.llamadas > 200], [[], true]);
    ok('  (y había plata que cuidar: movimientos, ajustes y cuentas de varias empresas)',
      [await n('select count(*) n from public.movimientos') > 3, await n('select count(*) n from public.ajustes_cuenta') > 5, await n('select count(*) n from public.cuentas_dinero') > 10], [true, true, true]);
    ok('ninguna tabla apunta a `bienes`: no hay movimiento, ajuste ni cuenta que se pueda atar a un bien',
      await n(`select count(*) n from pg_constraint where contype = 'f' and confrelid = 'public.bienes'::regclass`), 0);
  }

  // ═════════════════════════════════════════════════════════════════════
  grupo('16 · El archivo: sin barras invertidas, y no vuelve a definir nada de lo que existe');
  // ═════════════════════════════════════════════════════════════════════
  {
    ok('la 132 no tiene ni una barra invertida (el MCP las duplica al aplicar)', sql132.split(BARRA).length - 1, 0);
    ok('la vuelta atrás tampoco', sqlAtras.split(BARRA).length - 1, 0);
    ok('ninguna de las dos abre o cierra una transacción por su cuenta', [/^\s*(begin|commit|rollback)\s*;/im.test(sql132), /^\s*(begin|commit|rollback)\s*;/im.test(sqlAtras)], [false, false]);

    const definidas = [...sql132.matchAll(/^create or replace function public[.](\w+)[(]/gm)].map((x) => x[1]);
    ok('define cuatro funciones, y son las del diseño', [...definidas].sort(), [...NOMBRES_NUEVAS].sort());
    ok('  no hay otra manera de crear una función escondida en el archivo', [...sql132.matchAll(/create\s+(or\s+replace\s+)?function/gi)].length, 4);
    const fuentes = ANTERIORES.map((f) => [f, leer(`supabase/migrations/${f}`)]);
    ok(`NINGUNA existía antes: en las ${ANTERIORES.length} migraciones anteriores no hay una función con esos nombres`,
      NOMBRES_NUEVAS.flatMap((nombre) => fuentes.filter(([, sql]) => new RegExp(`function\\s+(public[.])?${nombre}\\s*[(]`, 'i').test(sql)).map(([f]) => `${nombre} en ${f}`)), []);
    ok('  ni una tabla con ese nombre', fuentes.filter(([, sql]) => /create\s+table\s+(if\s+not\s+exists\s+)?(public[.])?bienes\b/i.test(sql)).map(([f]) => f), []);
    // Lo único que el archivo le hace a la base, sentencia por sentencia (sin comentarios ni cuerpos de función).
    const sinCuerpos = sql132.replace(/[$]fn[$][^]*?[$]fn[$]/g, () => '$fn$…$fn$').replace(/[$]guarda[$][^]*?[$]guarda[$]/g, () => '$guarda$…$guarda$')
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    const sentencias = sinCuerpos.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const clase = (s) => {
      if (s === 'do $guarda$…$guarda$') return 'la guarda';
      if (/^create table if not exists public[.]bienes \(/.test(s)) return 'crea la tabla bienes';
      if (s === 'create index if not exists bienes_empresa_idx on public.bienes (empresa_id) where activo') return 'crea su índice';
      if (s === 'alter table public.bienes enable row level security') return 'le prende RLS';
      if (s === 'revoke all on public.bienes from anon, authenticated') return 'la cierra a anon y a la sesión';
      if (s === 'drop trigger if exists cuenta_activa_bienes on public.bienes') return 'quita su candado (para volver a ponerlo)';
      if (s === 'create trigger cuenta_activa_bienes before insert or update on public.bienes for each row execute function public.exigir_cuenta_activa()') return 'pone su candado';
      if (/^comment on (table public[.]bienes|column public[.]bienes[.]\w+) is '/.test(s)) return 'comenta la tabla';
      const f = /^create or replace function public[.](\w+)\(/.exec(s);
      if (f && NOMBRES_NUEVAS.includes(f[1])) return `crea ${f[1]}`;
      const q = /^revoke all on function public[.](\w+)\([^)]*\) from public, anon, service_role$/.exec(s);
      if (q && NOMBRES_NUEVAS.includes(q[1])) return `cierra ${q[1]}`;
      const g = /^grant execute on function public[.](\w+)\([^)]*\) to authenticated$/.exec(s);
      if (g && NOMBRES_NUEVAS.includes(g[1])) return `abre ${g[1]} a la sesión`;
      return `¿? ${s.slice(0, 90)}`;
    };
    const hechas = sentencias.map(clase);
    ok('cada sentencia del archivo es de la tabla nueva o de una de las cuatro funciones nuevas: no hay un alter, un drop, un grant ni un revoke sobre nada que ya existiera',
      hechas.filter((x) => x.startsWith('¿?')), []);
    ok(`  son ${sentencias.length}: la guarda, la tabla con su índice, su RLS, su cierre y su candado, sus comentarios, y por cada función crearla, cerrarla y abrirla a la sesión`,
      [hechas.filter((x) => !x.startsWith('comenta')).sort(), hechas.filter((x) => x.startsWith('comenta')).length], [[
        'la guarda', 'crea la tabla bienes', 'crea su índice', 'le prende RLS', 'la cierra a anon y a la sesión', 'quita su candado (para volver a ponerlo)', 'pone su candado',
        ...NOMBRES_NUEVAS.flatMap((f) => [`crea ${f}`, `cierra ${f}`, `abre ${f} a la sesión`]),
      ].sort(), 5]);

    // Los mensajes.
    const mensajes = [...sql132.matchAll(/raise exception\s+'((?:[^']|'')*)'/gi)].map((m) => m[1]);
    const deFunciones = [...new Set(mensajes.filter((m) => !m.startsWith('Falta aplicar')))];
    ok('cada mensaje nuevo está en la 132 y tiene su portugués en mensajes-base.ts',
      NUEVOS.filter((m) => !deFunciones.includes(m) || !MENSAJES_PT[m]), []);
    ok('  y los demás que usa son mensajes que ya existían, con su portugués',
      deFunciones.filter((m) => !NUEVOS.includes(m)).sort().map((m) => [m, Boolean(MENSAJES_PT[m]), fuentes.some(([, sql]) => sql.includes(`'${m}'`))]),
      [[MONTO_GRANDE, true, true], [NO_CONOCEMOS, true, true], [SOLO_DUENO_TOCAR, true, true], [SOLO_DUENO_VER, true, true]]);
    ok('ningún mensaje nombra una moneda: es simétrico', mensajes.filter((m) => /guaran|d[oó]lar|reales|pesos|euros|Gs[.]|US[$]|R[$]/i.test(m)), []);

    // En la base queda lo que dice el archivo.
    const cuerpo = (sql, nombre) => {
      const i = sql.lastIndexOf(`create or replace function public.${nombre}(`);
      const fin = sql.indexOf('$fn$;', i);
      const texto = sql.slice(i, fin + '$fn$;'.length);
      return texto.slice(texto.indexOf('$fn$') + '$fn$'.length, texto.lastIndexOf('$fn$'));
    };
    const enLaBase = new Map((await filas(
      `select p.proname as nombre, p.prosrc as cuerpo from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)`,
      [NOMBRES_NUEVAS])).map((x) => [x.nombre, x.cuerpo.replace(/\r\n/g, '\n')]));
    ok('en la base, el cuerpo de las cuatro es, letra por letra, el del archivo', NOMBRES_NUEVAS.filter((nombre) => enLaBase.get(nombre) !== cuerpo(sql132, nombre)), []);
    const dePatrimonio = cuerpo(sql132, 'patrimonio');
    ok('patrimonio() les PREGUNTA a las funciones de siempre: la plata y las cotizaciones a la billetera, lo que te deben al fiado y lo que debés a las deudas',
      ['v_billetera := public.billetera(p_empresa);', 'public.resumen_fiado(p_empresa)', 'public.resumen_deudas(p_empresa)', 'public.saldo_ahorro(a.id)',
        "v_billetera ->> 'total'", "v_billetera -> 'totales_otras'", "v_billetera -> 'cotizaciones'"].filter((x) => !dePatrimonio.includes(x)), []);
    ok('  no suma por su lado el saldo de ninguna cuenta ni lee las cotizaciones: ni nombra esas tablas',
      ['saldo_cuenta_dinero', 'saldo_inicial', 'cuentas_dinero', 'ajustes_cuenta', 'cotizaciones_moneda', 'public.movimientos ', 'public.fiado', 'public.deudas']
        .filter((x) => dePatrimonio.includes(x)), []);
    ok('  y no convierte: no multiplica ni divide nada por una cotización (la única multiplicación es stock × costo)',
      [...dePatrimonio.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').matchAll(/[^\s(]+\s*[*/]\s*[^\s)]+/g)].map((m) => m[0]), ['p.stock * p.costo']);

    // schema.sql y la vuelta atrás.
    const esquema = leer('supabase/schema.sql');
    ok('schema.sql trae la 132 entera (npm run esquema), y no la vuelta atrás',
      [esquema.includes(`##  ${ARCHIVO_132}`), esquema.includes(sql132.trim()), esquema.includes('VUELTA ATRÁS DE LA 132')], [true, true, false]);
    ok('la 132 dice cómo se vuelve atrás y con qué archivo', [sql132.includes('-- SI HAY QUE VOLVER ATRÁS'), sql132.includes(ARCHIVO_ATRAS)], [true, true]);
    ok('la vuelta atrás no vive en supabase/migrations', MIGRACIONES.filter((f) => /atras/i.test(f)), []);
    ok('  y es: la guarda, afuera las cuatro funciones y afuera la tabla. No vuelve a crear ni a tocar nada más',
      sqlAtras.replace(/[$]guarda[$][^]*?[$]guarda[$]/g, () => '$guarda$…$guarda$').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
        .split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean), [
        'do $guarda$…$guarda$',
        'drop function if exists public.patrimonio(uuid)',
        'drop function if exists public.quitar_bien(uuid, uuid, text)',
        'drop function if exists public.actualizar_valor_bien(uuid, uuid, numeric, text)',
        'drop function if exists public.guardar_bien(uuid, text, text, numeric, text, text, uuid)',
        'drop table if exists public.bienes',
      ]);
  }
  await db.close();

  // ═════════════════════════════════════════════════════════════════════
  grupo(`17 · La vuelta atrás, en la base armada como producción: la 132 y después el archivo dejan la base de la ${ULTIMA_ANTERIOR}`);
  // ═════════════════════════════════════════════════════════════════════
  {
    const TV = herramientas(VA);
    // ---- A. Sin nada anotado: se vuelve atrás entera.
    ok('(con la 132 recién puesta no hay nada anotado)', await TV.n('select count(*) n from public.bienes'), 0);
    ok('la vuelta atrás corre sin error', await correr(VA, sqlAtras), null);
    {
      const d = diferenciasDeCatalogo(entero131, await catalogoEntero(VA));
      ok(`el catálogo quedó como el de la ${ULTIMA_ANTERIOR}: cada función con su texto y sus permisos, cada tabla, columna, restricción, disparador, política, índice y comentario`,
        [d.distintos, d.objetos > 2000], [[], true]);
      console.log(`  · ${d.objetos} objetos comparados, ${d.distintos.length} diferencias`);
      const contra132 = diferenciasDeCatalogo(entero132, await catalogoEntero(VA));
      ok('  (y no es que la comparación no vea nada: contra el de la 132 faltan justo las cuatro funciones y la tabla)',
        [contra132.distintos.filter((x) => /^(funciones|tablas): /.test(x)).sort(), contra132.distintos.every((x) => / falta (bienes|guardar_bien|actualizar_valor_bien|quitar_bien|patrimonio)\b/.test(x))],
        [[...Object.values(NUEVAS).map((f) => `funciones: falta ${f}`), 'tablas: falta bienes'].sort(), true]);
    }
    ok('ni una fila de ninguna tabla cambió', TV.tocadas(datos131, await TV.todaLaBase()), []);
    ok('y lo que lee el código publicado es lo mismo que antes de la 132, carácter por carácter', (await lee(TV)) === lee131, true);
    ok('corrida otra vez, no falla (ya no hay nada que mirar ni que quitar)', await correr(VA, sqlAtras), null);
    ok('  y el catálogo sigue siendo el de antes', diferenciasDeCatalogo(entero131, await catalogoEntero(VA)).distintos, []);

    // ---- B. La 132 se vuelve a aplicar encima.
    ok('la 132 se puede volver a aplicar encima', await correr(VA, sql132), null);
    ok('  y deja lo mismo que la primera vez', diferenciasDeCatalogo(entero132, await catalogoEntero(VA)).distintos, []);

    // ---- C. Con algo anotado, se niega.
    const autoV = await TV.bien(Y, { nombre: 'Toyota Hilux', tipo: 'vehiculo', valor: 80000000 });
    const seNiega = async (nombre, cuantas) => {
      const catalogoAntes = await catalogoEntero(VA);
      const datosAntes = await TV.todaLaBase();
      const error = await correr(VA, sqlAtras);
      ok(nombre, [String(error).includes(cuantas), String(error).includes('Lo que se vuelve atrás es el código')], [true, true]);
      ok('  y no tocó nada: ni el catálogo ni una fila', [diferenciasDeCatalogo(catalogoAntes, await catalogoEntero(VA)).distintos, TV.tocadas(datosAntes, await TV.todaLaBase())], [[], []]);
    };
    await seNiega('con un auto anotado, la vuelta atrás SE NIEGA y dice por qué (borraría lo que la persona escribió)', 'Hay 1 cosas anotadas');
    ok('  el auto sigue ahí', (await TV.patrimonio(Y)).bienes.map((x) => [x.nombre, x.valor]), [['Toyota Hilux', 80000000]]);
    await TV.quitar(Y, autoV, 'vendido');
    await seNiega('con ese auto ya vendido (fuera de la lista, pero escrito), también se niega', 'Hay 1 cosas anotadas');
    await VA.exec('delete from public.bienes');
    ok('recién con la tabla vacía (una decisión que se toma a mano) la vuelta atrás corre', await correr(VA, sqlAtras), null);
    ok('  y la base vuelve a ser la de antes', diferenciasDeCatalogo(entero131, await catalogoEntero(VA)).distintos, []);
  }
  await VA.close();

  console.log(`\n${'═'.repeat(62)}`);
  console.log(fallos === 0
    ? `>>> ${corridas} COMPROBACIONES DEL PATRIMONIO (BIENES) PASARON (${Math.round((Date.now() - t0) / 1000)} s)`
    : `>>> ${fallos} DE ${corridas} COMPROBACIONES DEL PATRIMONIO (BIENES) FALLARON`);
  process.exit(fallos ? 1 : 0);
}

principal().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message ?? e, e.stack ?? '');
  process.exit(1);
});
