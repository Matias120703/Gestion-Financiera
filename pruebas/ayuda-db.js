/**
 * Levanta un PostgreSQL real (PGlite = Postgres compilado a WebAssembly) con el
 * esquema de Orden, imitando lo que hace Supabase:
 *
 *   · esquema `auth` con `auth.users` y `auth.uid()`;
 *   · roles `anon`, `authenticated` y `service_role`;
 *   · RLS activo de verdad.
 *
 * Las funciones SECURITY DEFINER las crea el superusuario, igual que en Supabase
 * (donde las crea `postgres`), así que saltean RLS exactamente igual que en producción.
 * Para probar una policy hay que ejecutar la consulta con `set role authenticated`,
 * que es lo que hace `comoUsuario()`.
 */
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const RAIZ = path.join(__dirname, '..');

const PREPARACION = `
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- En Supabase auth.uid() sale del JWT: de 'request.jwt.claim.sub' o del
-- 'sub' de 'request.jwt.claims' (así está definida allá, verificado en
-- producción el 24/09/2026). Acá, igual, y si no hay ninguno, de una
-- variable de sesión: 'orden.uid' hace de JWT de quien llama. Los dos
-- primeros los usa resumen_semanal_para (109) para ponerse en los zapatos
-- del destinatario; con solo 'orden.uid' esa función no se podría probar.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
    nullif(current_setting('orden.uid', true), '')
  )::uuid;
$$;

do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin;  exception when duplicate_object then null; end $$;

-- OJO - diferencia conocida con Supabase hosted:
-- alla service_role tiene BYPASSRLS; aca se crea sin ese atributo.
-- Eso hace que este entorno sea MÁS restrictivo que producción, no menos:
-- si algo pasa acá con service_role, pasa allá. Lo que NO se puede concluir
-- desde acá es que algo falle en producción por RLS, porque allá la saltea.
-- Ver el comentario del grupo 2 en pruebas/permisos.test.js.
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;
grant select on auth.users   to authenticated, service_role;
`;

const PERMISOS_BASE = `
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
`;

/**
 * LOS PRIVILEGIOS POR DEFECTO DE SUPABASE, PUESTOS DESDE ANTES DE LA 001.
 *
 * En producción todo lo que se crea en `public` nace abierto a anon,
 * authenticated y service_role, y eso es así desde antes de la primera
 * migración: cada una revoca lo que no quiere. Una base de pruebas armada
 * sin esto es MÁS cerrada que producción, y una comprobación del tipo «la
 * llave de servicio no ejecuta tal función» puede salir verde acá y no ser
 * cierta allá (pasó con la 131). Con `crearBase({ comoSupabase: true })` la
 * base queda armada como la de verdad.
 */
const PRIVILEGIOS_SUPABASE = `
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

function leerSql(rutaRelativa) {
  let sql = fs.readFileSync(path.join(RAIZ, rutaRelativa), 'utf8');
  // pgcrypto no existe en PGlite; gen_random_uuid() ya viene en el núcleo de PG 13+.
  sql = sql.replace(/create extension if not exists "?pgcrypto"?;/gi, '');
  return sql;
}

/** Todas las migraciones, en orden. Se leen del disco: nunca queda una afuera. */
function migraciones() {
  const dir = path.join(RAIZ, 'supabase', 'migrations');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

/**
 * Levanta la base aplicando las migraciones.
 * `hasta` permite parar en una versión anterior para probar el salto
 * (por ejemplo, montar una instalación vieja y después migrarla).
 * `comoSupabase` pone los privilegios por defecto de Supabase antes de la
 * primera migración (ver PRIVILEGIOS_SUPABASE). Sin él, la base de siempre.
 */
async function crearBase({ hasta = null, comoSupabase = false } = {}) {
  const db = await new PGlite();
  await db.exec(PREPARACION);
  if (comoSupabase) await db.exec(PRIVILEGIOS_SUPABASE);

  const lista = migraciones();
  const corte = hasta ? lista.findIndex((f) => f.startsWith(hasta)) : lista.length - 1;
  if (hasta && corte === -1) throw new Error(`No existe la migración ${hasta}`);

  for (let i = 0; i <= corte; i++) {
    await db.exec(leerSql(`supabase/migrations/${lista[i]}`));
    // Supabase otorga por defecto todos los privilegios de tabla a
    // `authenticated` y deja el filtrado fino a RLS. Lo replicamos después de
    // la primera migración para comprobar que las siguientes revocan de verdad.
    if (i === 0) await db.exec(PERMISOS_BASE);
  }
  return db;
}

async function aplicarMigracion(db, prefijo) {
  const archivo = migraciones().find((f) => f.startsWith(prefijo));
  if (!archivo) throw new Error(`No existe la migración ${prefijo}`);
  await db.exec(leerSql(`supabase/migrations/${archivo}`));
  return archivo;
}

/**
 * LA «DECISIÓN 4» DE CAMBIAR DE PLAN, EN SUS DOS POSICIONES (130, 08/10/2026).
 *
 * La decisión 4 (no pagar por Bancard un plan con menos lugares que el
 * equipo) va APAGADA a producción: el cuerpo de
 * `public.pago_de_plan_exige_lugar` empieza con `return;`. Lo que frena,
 * pausa, marca y calla anuncios queda escrito y dormido, y hay que probarlo
 * igual.
 *
 * Esto lee la ÚLTIMA definición de esa función en las migraciones y arma sus
 * dos textos sin escribir nada a mano: el que tiene la llave (`return;` como
 * primera sentencia) y el mismo sin esa línea. Así «prendida» es, letra por
 * letra, la función de la migración sin su primera sentencia: lo que va a
 * traer la migración que la prenda.
 *
 *   const D4 = H.decision4();
 *   D4.apagada              ¿la migración la deja apagada? (hoy: true)
 *   await D4.prender(db)    la base de pruebas, con la decisión prendida
 *   await D4.apagar(db)     y de vuelta apagada
 *   await D4.enLaBase(db)   'apagada' | 'prendida', leyendo la función que quedó
 */
const LLAVE_DECISION_4 = 'pago_de_plan_exige_lugar';

/**
 * En el texto de una función plpgsql, el índice del renglón de su primera
 * sentencia: el que sigue al `begin`, salteando comentarios y renglones
 * vacíos. -1 si no lo encuentra.
 */
function primeraSentencia(lineas) {
  let k = lineas.findIndex((l) => l.trim() === 'begin') + 1;
  if (k === 0) return -1;
  while (k < lineas.length && (lineas[k].trim() === '' || lineas[k].trim().startsWith('--'))) k++;
  return k < lineas.length ? k : -1;
}

function decision4() {
  const abre = `create or replace function public.${LLAVE_DECISION_4}(`;
  const cierra = '$fn$;';
  let hallada = null;
  for (const f of migraciones()) {
    // CRLF normalizado: en un worktree de Windows los fuentes llegan con \r\n.
    const sql = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
    const i = sql.lastIndexOf(abre);
    if (i < 0) continue;
    const fin = sql.indexOf(cierra, i);
    if (fin < 0) throw new Error(`${f}: no encuentro dónde termina ${LLAVE_DECISION_4}`);
    hallada = { archivo: f, texto: sql.slice(i, fin + cierra.length) };
  }
  if (!hallada) throw new Error(`Ninguna migración define ${LLAVE_DECISION_4}`);

  const lineas = hallada.texto.split('\n');
  const k = primeraSentencia(lineas);
  if (k < 0) throw new Error(`${hallada.archivo}: no encuentro la primera sentencia de ${LLAVE_DECISION_4}`);
  const apagada = lineas[k].trim() === 'return;';
  const textoApagada = apagada ? hallada.texto : [...lineas.slice(0, k), '  return;', ...lineas.slice(k)].join('\n');
  const textoPrendida = apagada ? [...lineas.slice(0, k), ...lineas.slice(k + 1)].join('\n') : hallada.texto;

  /** Cómo quedó la función en esa base: se lee su cuerpo del catálogo. */
  const enLaBase = async (db) => {
    const r = await db.query(
      `select p.prosrc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [LLAVE_DECISION_4]);
    if (r.rows.length !== 1) return `hay ${r.rows.length} funciones con ese nombre`;
    const cuerpo = r.rows[0].prosrc.replace(/\r\n/g, '\n').split('\n');
    const j = primeraSentencia(cuerpo);
    if (j < 0) return 'no se entiende';
    return cuerpo[j].trim() === 'return;' ? 'apagada' : 'prendida';
  };

  return {
    nombre: LLAVE_DECISION_4,
    archivo: hallada.archivo,
    apagada,
    textoApagada,
    textoPrendida,
    /** La sentencia con la que empieza el cuerpo cuando está prendida. */
    primeraPrendida: (() => { const l = textoPrendida.split('\n'); return l[primeraSentencia(l)].trim(); })(),
    prender: (db) => db.exec(textoPrendida),
    apagar: (db) => db.exec(textoApagada),
    enLaBase,
  };
}

/** Crea un usuario de Supabase de mentira y devuelve su id. */
async function crearUsuario(db, email) {
  const r = await db.query('insert into auth.users (email) values ($1) returning id', [email]);
  return r.rows[0].id;
}

/**
 * Ejecuta `fn` como ese usuario, con el rol `authenticated`, es decir:
 * con RLS aplicándose de verdad. Así se comporta el navegador del usuario.
 */
async function comoUsuario(db, uid, fn) {
  // Tiene que ser dentro de una transacción: `set local` fuera de una no hace nada.
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query(`select set_config('orden.uid', $1, true)`, [uid ?? '']);
    const r = await fn();
    await db.exec('commit');
    return r;
  } catch (e) {
    try { await db.exec('rollback'); } catch { /* ya abortada */ }
    throw e;
  }
}

/** Igual que comoUsuario pero envuelto en una transacción propia. */
async function enTransaccion(db, fn) {
  await db.exec('begin');
  try {
    const r = await fn();
    await db.exec('commit');
    return r;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}

/**
 * Corre algo como usuario autenticado dentro de una transacción y devuelve
 * `{ ok, error }` en vez de tirar la excepción. Cómodo para probar rechazos.
 */
async function intentar(db, uid, fn) {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query(`select set_config('orden.uid', $1, true)`, [uid ?? '']);
    const valor = await fn();
    await db.exec('commit');
    return { ok: true, valor, error: null };
  } catch (e) {
    try { await db.exec('rollback'); } catch { /* ya abortada */ }
    return { ok: false, valor: null, error: e.message ?? String(e) };
  }
}

/** Atajo: crea empresa + productos y devuelve todo lo necesario para las pruebas. */
async function montarEmpresa(db, { email, nombre, moneda = 'PYG', rubro, tipoCuenta }) {
  const uid = await crearUsuario(db, email);
  let empresaId;
  await comoUsuario(db, uid, async () => {
    // Sin rubro se llama con tres argumentos, como siempre: así las pruebas
    // que ya existían siguen pasando por exactamente el mismo camino.
    //
    // Con rubro se usa la firma larga A PROPÓSITO, porque `crear_empresa` es
    // donde un rubro desconocido falla en silencio —lo convierte en
    // 'comercio' sin avisar— y probarlo por otro lado no probaría nada.
    const r = rubro || tipoCuenta
      ? await db.query('select public.crear_empresa($1, $2, $3, $4, $5, $6) as id',
          [nombre, moneda, 'Dueño', 'America/Asuncion', tipoCuenta ?? 'emprendedor', rubro ?? 'comercio'])
      : await db.query('select public.crear_empresa($1, $2, $3) as id', [nombre, moneda, 'Dueño']);
    empresaId = r.rows[0].id;
  });
  return { uid, empresaId };
}

async function codigoDe(db, empresaId) {
  const conNueva = await db.query(
    "select count(*)::int n from information_schema.tables where table_schema='public' and table_name='empresa_accesos'");
  if (conNueva.rows[0].n > 0) {
    return (await db.query('select codigo from public.empresa_accesos where empresa_id = $1', [empresaId])).rows[0].codigo;
  }
  return (await db.query('select codigo_acceso from public.empresas where id = $1', [empresaId])).rows[0].codigo_acceso;
}

async function sumarMiembro(db, empresaId, email, rol) {
  const uid = await crearUsuario(db, email);
  const cod = await codigoDe(db, empresaId);
  await comoUsuario(db, uid, async () => {
    await db.query('select public.unirse_empresa($1, $2)', [cod, email]);
  });
  if (rol && rol !== 'vendedor') {
    // El ascenso lo hace el sistema, no el propio usuario.
    await db.query('update public.miembros set rol = $1 where empresa_id = $2 and user_id = $3', [rol, empresaId, uid]);
  }
  return uid;
}

async function crearProducto(db, empresaId, uidAdmin, datos) {
  let id;
  await comoUsuario(db, uidAdmin, async () => {
    const r = await db.query(
      `insert into public.productos (empresa_id, nombre, categoria, costo, precio, stock, stock_minimo, controla_stock)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [empresaId, datos.nombre, datos.categoria ?? 'General', datos.costo, datos.precio,
       datos.stock ?? 0, datos.stock_minimo ?? 0, datos.controla_stock ?? true],
    );
    id = r.rows[0].id;
  });
  return id;
}

async function stockDe(db, productoId) {
  const r = await db.query('select stock from public.productos where id = $1', [productoId]);
  return Number(r.rows[0].stock);
}

/** Ejecuta algo con el rol real `service_role` de Supabase (no superusuario). */
async function comoServicio(db, fn) {
  await db.exec('begin');
  try {
    await db.exec('set local role service_role');
    const r = await fn();
    await db.exec('commit');
    return r;
  } catch (e) {
    try { await db.exec('rollback'); } catch { /* ya abortada */ }
    throw e;
  }
}

/** Como comoServicio pero devolviendo { ok, error } en vez de tirar. */
async function intentarComo(db, rol, uid, fn) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${rol}`);
    await db.query(`select set_config('orden.uid', $1, true)`, [uid ?? '']);
    const valor = await fn();
    await db.exec('commit');
    return { ok: true, valor, error: null };
  } catch (e) {
    try { await db.exec('rollback'); } catch { /* ya abortada */ }
    return { ok: false, valor: null, error: e.message ?? String(e) };
  }
}

async function movimiento(db, id) {
  const r = await db.query('select * from public.movimientos where id = $1', [id]);
  return r.rows[0];
}

async function itemsDe(db, movimientoId) {
  const r = await db.query('select * from public.movimiento_items where movimiento_id = $1 order by nombre', [movimientoId]);
  return r.rows;
}

module.exports = {
  crearBase, aplicarMigracion, migraciones, decision4, crearUsuario, comoUsuario, comoServicio,
  enTransaccion, intentar, intentarComo, montarEmpresa, sumarMiembro, codigoDe,
  crearProducto, stockDe, movimiento, itemsDe,
};
