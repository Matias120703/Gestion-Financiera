/**
 * Borrar la cuenta borra también el correo (migración 129, 07/10/2026).
 *
 * Matías: «cuando yo borro una cuenta, me gustaría que también se borre el
 * correo. Estoy tratando de entrar ahora en una cuenta y me parece que ya
 * existe ese correo, pero en realidad no existe porque en mi panel de Orden
 * yo ya la había eliminado.» Y: «si yo elimino la cuenta, me tiene que
 * eliminar todo. Si yo vuelvo a ingresar el mismo correo, tiene que crearse
 * la nueva cuenta.»
 *
 * `borrar_cuenta` (022) borra el negocio y deja a las personas. La 129 suma
 * lo que hace falta para borrar también el usuario de quien queda sin ningún
 * negocio, ver los que ya quedaron sueltos, y no borrar nunca a quien no
 * corresponde.
 *
 * En PGlite no existe Auth: «Auth borra al usuario» se imita con
 * `delete from auth.users` como superusuario y SIN sesión, que es como lo
 * hace Auth (igual que pruebas/borrado.test.js).
 *
 * LO QUE SE PRUEBA (cada número es el grupo del mismo número, abajo)
 *
 *   0. COMPATIBILIDAD: una base hasta la 128; la llamada del panel
 *      publicado a `borrar_cuenta` (leída de git); se aplica la 129; la
 *      misma llamada contesta lo mismo y la función no cambió ni una letra.
 *   1. La anulación: con la 128, a quien anuló algo en un negocio que sigue
 *      no se lo puede borrar; con la 129 sí, y la fecha se sigue exigiendo.
 *   2. Quién se borra: el dueño y su personal, si quedan sin ningún negocio.
 *   3. Quién no, nunca: quien tiene otro negocio, la administración, quien
 *      aprieta el botón, quien recomienda Orden (con su cuenta ya pegada o
 *      cargado por su correo: la identidad de `mi_codigo_socio`).
 *   4. `personas_de_cuenta`: lo que la ficha muestra antes de confirmar.
 *   5. `borrar_cuenta_entera`: solo el servidor, con un actor que administre;
 *      el ensayo no toca nada; de verdad devuelve archivos, videos y personas.
 *   6. `correo_borrable`: la comprobación pegada al borrado, y la carrera.
 *   7. La constancia: correos tapados, nunca enteros.
 *   7 bis. LA TARJETA, PASANDO POR BANCARD: el paso B de la ruta con el
 *      código de verdad (`quitarTarjeta`) contra un Bancard de mentira. Qué
 *      queda escrito cuando Bancard contesta, cuando no, y cuando la tarjeta
 *      ya estaba a medio quitar.
 *   8. `correos_sueltos`: la lista del panel, y el aviso cuando no entran todos.
 *   9. EL SERVIDOR, DE PUNTA A PUNTA: el código de
 *      src/lib/borrar-correo-servidor.ts contra esta base, con un Auth de
 *      mentira. Quién quedó y quién no, la carrera, y Auth fallando.
 *  10. Después de borrar: el token viejo no crea nada; lo ajeno sigue entero.
 *  11. Permisos y forma: quién puede ejecutar cada función, una sola firma,
 *      search_path, sin barras invertidas, aplicada dos veces.
 *  12. Lo que se le dice a quien administra (src/lib/borrar-correo.ts).
 *  13. Las fuentes: las rutas comprueban antes de tocar la clave de
 *      servicio, el orden del borrado, y quién puede pedirle a Auth que borre.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('./ayuda-db.js');
const { borrarCorreo } = require('../.compilado/borrar-correo-servidor.js');
const T = require('../.compilado/borrar-correo.js');
// El paso B de la ruta (la tarjeta), con el código de verdad y un Bancard de
// mentira: nunca se llama a Bancard, y las claves de acá son inventadas.
const { crearBancard } = require('../.compilado/bancard.js');
const { quitarTarjeta } = require('../.compilado/bancard-flujo.js');
const { crearBancardFalso, CLAVES_DE_PRUEBA } = require('./bancard-falso.js');

const RAIZ = path.join(__dirname, '..');
let fallos = 0;
let corridas = 0;

function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a.length > 140 ? `${a.slice(0, 137)}…` : a}`);
}

function rechazado(nombre, res, frag) {
  corridas++;
  if (res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      NO fue rechazada`); return; }
  if (frag && !new RegExp(frag, 'i').test(res.error)) {
    fallos++; console.log(`  ✗ ${nombre}\n      otro motivo: ${res.error}`); return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 70)}`);
}

// Las worktrees traen CRLF: se normaliza antes de buscar nada.
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const archivo129 = () => `supabase/migrations/${H.migraciones().find((f) => f.startsWith('129'))}`;
const BARRA = String.fromCharCode(92);

/**
 * El código de ANTES de la 129, leído de git: el commit anterior al que
 * sumó la migración, o HEAD si todavía no se commiteó. Null si no hay git.
 */
function fuenteDeAntes(ruta) {
  const git = (...args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const alta = git('log', '--format=%H', '--diff-filter=A', '--', archivo129()).trim().split('\n').filter(Boolean).pop();
    const ref = alta ? `${alta}^` : 'HEAD';
    return { ref, texto: git('show', `${ref}:${ruta}`).replace(/\r\n/g, '\n') };
  } catch { return null; }
}

const LAS_SIETE = {
  'public.correo_tapado(text)': [false, false, false],
  'public.motivo_para_no_borrar(uuid,uuid,uuid)': [false, false, false],
  'public.personas_de_cuenta(uuid)': [false, true, false],
  'public.correos_sueltos(integer)': [false, true, false],
  'public.borrar_cuenta_entera(uuid,uuid,text,boolean)': [false, false, true],
  'public.correo_borrable(uuid,uuid,text)': [false, false, true],
  'public.anotar_correo_borrado(uuid,uuid,text,text,text)': [false, false, true],
};
const NOMBRES = Object.keys(LAS_SIETE).map((f) => f.slice('public.'.length, f.indexOf('(')));

(async () => {
  const t0 = Date.now();
  const db = await H.crearBase({ hasta: '128' });
  console.log(`base hasta la 128 en ${Math.round((Date.now() - t0) / 1000)} s`);

  // Con la sesión de alguien (el navegador) y con la clave de servicio (el servidor).
  const sesion = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const servidor = (sql, args = []) => H.intentarComo(db, 'service_role', '', () => db.query(sql, args));
  /** Una función de la base como la llama el servidor (`supabase.rpc`, con la clave de servicio). */
  const rpcDelServidor = async (funcion, args) => {
    const claves = Object.keys(args);
    const res = await servidor(`select public.${funcion}(${claves.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, claves.map((k) => args[k]));
    return res.ok ? { data: res.valor.rows[0].r, error: null } : { data: null, error: { code: 'XX000', message: res.error } };
  };
  const r = (res) => { if (!res.ok) throw new Error(res.error); return res.valor.rows[0].r; };
  const fila = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const existe = async (uid) => (await fila('select count(*)::int n from auth.users where id = $1', [uid])).n === 1;
  /** Como lo hace Auth: superusuario, sin sesión. */
  const authBorra = async (uid) => {
    try { await db.query('delete from auth.users where id = $1', [uid]); return 'PASA'; }
    catch (e) { return String(e.message).split('\n')[0]; }
  };
  const gasto = (P, uid, texto, monto) => H.comoUsuario(db, uid, () => db.query(
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
     values ($1,'gasto', current_date, $2, 'Varios', $3, $3)`, [P.empresaId, texto, monto]));
  /** Mete a alguien en un negocio por abajo: el plan de prueba deja tres personas. */
  const meter = (empresaId, uid, nombre, rol) => db.query(
    'insert into public.miembros (empresa_id, user_id, nombre, rol) values ($1,$2,$3,$4)', [empresaId, uid, nombre, rol]);

  const jefe = await H.crearUsuario(db, 'jefe@orden.test');
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe]);

  // ═══════════════════════════════════════════════════════════
  grupo('0 · Compatibilidad: el panel publicado, con la base de después');
  // ═══════════════════════════════════════════════════════════
  // Un ex empleado que anuló un gasto en un negocio que sigue (grupo 1).
  const vivo = await H.montarEmpresa(db, { email: 'duenio@vivo.test', nombre: 'Sigue vivo' });
  const ex = await H.sumarMiembro(db, vivo.empresaId, 'ex@vivo.test', 'admin');
  await gasto(vivo, ex, 'mal cargado', 1000);
  const movAnulado = (await fila('select id from public.movimientos where empresa_id = $1', [vivo.empresaId])).id;
  await H.comoUsuario(db, ex, () => db.query('select public.anular_movimiento($1,$2)', [movAnulado, 'me equivoqué']));
  await H.comoUsuario(db, vivo.uid, () => db.query('select public.quitar_miembro($1,$2)', [vivo.empresaId, ex]));
  const borrarAlExCon128 = await authBorra(ex);

  // Cómo llama el panel publicado.
  const antes = fuenteDeAntes('src/components/PanelAdmin.tsx');
  if (!antes) {
    console.log('  · sin git no se puede leer el panel de antes: se usa la llamada de siempre');
  } else {
    console.log(`  · el panel de antes: ${antes.ref}`);
    ok('el panel publicado llama a borrar_cuenta desde el navegador, con p_empresa y p_confirmacion',
      /rpc\('borrar_cuenta', \{\s*p_empresa: cuenta\.empresa_id,\s*p_confirmacion: confirmaBorrado,\s*\}\)/.test(antes.texto), true);
  }
  const comoElPanelDeAntes = (empresaId, nombre) => sesion(jefe,
    'select public.borrar_cuenta(p_empresa => $1, p_confirmacion => $2) as r', [empresaId, nombre]);
  const forma = (x) => Object.fromEntries(Object.keys(x).sort().map((k) => [k, typeof x[k]]));
  const definicion = async () => (await fila(`select pg_get_functiondef('public.borrar_cuenta(uuid,text)'::regprocedure) as d`)).d;
  const permisosDe = async (firma) => {
    const p = await fila(`select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') b,
      has_function_privilege('service_role', $1, 'execute') c`, [firma]);
    return [p.a, p.b, p.c];
  };

  const viejo1 = await H.montarEmpresa(db, { email: 'uno@viejo.test', nombre: 'Viejo uno' });
  const fotoAntes = r(await comoElPanelDeAntes(viejo1.empresaId, 'Viejo uno'));
  const defAntes = await definicion();
  const permisosAntes = await permisosDe('public.borrar_cuenta(uuid,text)');
  ok('antes de la 129 no existe ninguna de las siete funciones',
    (await db.query(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and proname = any($1)`, [NOMBRES])).rows.length, 0);

  // COMO EN SUPABASE: allá toda función nueva nace ejecutable por anon,
  // authenticated y service_role (privilegios por defecto del proyecto),
  // además de PUBLIC. La base de las pruebas no lo imita, y sin esto un
  // «revoke» al que le falte un rol pasaría igual (acá nadie lo tendría de
  // entrada). Se pone justo antes de la 129: sus funciones nacen como allá.
  await db.exec('alter default privileges in schema public grant execute on functions to anon, authenticated, service_role');
  await H.aplicarMigracion(db, '129');
  console.log('  · 129 aplicada (con los privilegios por defecto de Supabase)');
  // Que la imitación funcione: una función cualquiera, sin revoke, queda abierta a los tres.
  await db.exec('create function public._abierta_de_prueba() returns int language sql as $f$ select 1 $f$');
  ok('la imitación anda: una función sin revoke queda abierta a los tres roles', await permisosDe('public._abierta_de_prueba()'), [true, true, true]);
  await db.exec('drop function public._abierta_de_prueba()');
  await db.exec('alter default privileges in schema public revoke execute on functions from anon, authenticated, service_role');

  ok('borrar_cuenta(uuid, text) no cambió ni una letra', (await definicion()) === defAntes, true);
  ok('ni sus permisos (anon no, la sesión sí)', [await permisosDe('public.borrar_cuenta(uuid,text)'), permisosAntes],
    [[false, true, permisosAntes[2]], permisosAntes]);
  const viejo2 = await H.montarEmpresa(db, { email: 'dos@viejo.test', nombre: 'Viejo dos' });
  const fotoDespues = r(await comoElPanelDeAntes(viejo2.empresaId, 'Viejo dos'));
  ok('el panel publicado recibe las mismas claves, con los mismos tipos',
    [forma(fotoAntes), forma(fotoDespues)],
    [{ borrada: 'boolean', movimientos: 'number', nombre: 'string' }, { borrada: 'boolean', movimientos: 'number', nombre: 'string' }]);
  ok('y ninguna de las que el panel publicado interpreta',
    ['aviso', 'por_enlace', 'comision_generada'].filter((k) => k in fotoDespues), []);
  ok('con el nombre mal escrito sigue rechazando igual',
    (await comoElPanelDeAntes(vivo.empresaId, 'sigue vivo')).error.includes('nombre exacto'), true);
  ok('su constancia es la de siempre',
    Object.keys((await fila(`select detalle from public.registro_admin where accion = 'borrar_cuenta' and detalle ->> 'nombre' = 'Viejo dos'`)).detalle).sort(),
    ['movimientos', 'nombre', 'personas']);
  ok('por ese camino viejo el usuario queda (como hoy)', await existe(viejo2.uid), true);
  ok('y ahora se lo ve: aparece en correos_sueltos',
    r(await sesion(jefe, 'select public.correos_sueltos() as r')).some((x) => x.correo === 'dos@viejo.test'), true);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · La anulación ya no frena, y sigue pidiendo la fecha');
  // ═══════════════════════════════════════════════════════════
  ok('con la 128, a quien anuló en un negocio que sigue no se lo podía borrar',
    borrarAlExCon128.includes('movimientos_anulacion_auditada'), true);
  ok('la restricción nueva pide solo el cuándo',
    (await fila(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'movimientos_anulacion_auditada'`)).d
      .replace(/::\w+/g, '').replace(/[()]/g, ''),
    `CHECK estado = 'activo' OR anulado_at IS NOT NULL`);
  ok('hay una sola con ese nombre',
    (await fila(`select count(*)::int n from pg_constraint where conname = 'movimientos_anulacion_auditada'`)).n, 1);
  ok('con la 129, el mismo borrado pasa', await authBorra(ex), 'PASA');
  ok('el movimiento sigue anulado, con fecha y motivo, sin autor',
    await fila(`select estado::text, anulado_at is not null as con_fecha, anulado_por is null as sin_autor, motivo_anulacion
      from public.movimientos where id = $1`, [movAnulado]),
    { estado: 'anulado', con_fecha: true, sin_autor: true, motivo_anulacion: 'me equivoqué' });
  let sinFecha;
  try { await db.query('update public.movimientos set anulado_at = null where id = $1', [movAnulado]); sinFecha = 'PASA'; }
  catch (e) { sinFecha = e.message; }
  ok('una anulación sin fecha se sigue rechazando', sinFecha.includes('movimientos_anulacion_auditada'), true);
  await gasto(vivo, vivo.uid, 'otro', 500);
  const mov2 = (await fila(`select id from public.movimientos where empresa_id = $1 and estado = 'activo'`, [vivo.empresaId])).id;
  rechazado('nadie anula a mano desde el navegador (ni con fecha)',
    await sesion(vivo.uid, `update public.movimientos set estado = 'anulado', anulado_at = now() where id = $1`, [mov2]), 'denied|permiso');
  ok('anular_movimiento anda igual', (await sesion(vivo.uid, 'select public.anular_movimiento($1,$2)', [mov2, 'prueba'])).ok, true);
  ok('y sigue escribiendo quién y cuándo',
    await fila('select anulado_por = $2 as quien, anulado_at is not null as cuando from public.movimientos where id = $1', [mov2, vivo.uid]),
    { quien: true, cuando: true });

  // ═══════════════════════════════════════════════════════════
  // EL ESCENARIO: «Negocio A», con una persona de cada clase adentro.
  // ═══════════════════════════════════════════════════════════
  const A = await H.montarEmpresa(db, { email: 'duenio@a.test', nombre: 'Negocio A' });
  const vendedor = await H.sumarMiembro(db, A.empresaId, 'vendedor@a.test', 'vendedor');
  const encargada = await H.sumarMiembro(db, A.empresaId, 'encargada@a.test', 'admin');
  // Trabaja en A y además tiene su cuenta personal.
  const conOtro = await H.crearUsuario(db, 'conotro@a.test');
  await meter(A.empresaId, conOtro, 'Con otro', 'admin');
  let loSuyo;
  await H.comoUsuario(db, conOtro, async () => {
    loSuyo = (await db.query('select public.crear_empresa($1,$2,$3) as id', ['Lo mío', 'PYG', 'Con otro'])).rows[0].id;
  });
  // Trabaja en A y recomienda Orden (socio con cuenta).
  const socio = await H.crearUsuario(db, 'socio@a.test');
  await meter(A.empresaId, socio, 'Socio', 'vendedor');
  const codigoSocio = await sesion(socio, 'select public.mi_codigo_socio() as r');
  if (!codigoSocio.ok) throw new Error(`mi_codigo_socio: ${codigoSocio.error}`);
  // La administración también está adentro (una cuenta de prueba propia).
  await meter(A.empresaId, jefe, 'Jefe', 'vendedor');
  const jefa = await H.crearUsuario(db, 'jefa@orden.test');
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefa]);
  await meter(A.empresaId, jefa, 'Jefa', 'vendedor');
  // El que va a correr: se crea un negocio justo después de que borren A.
  const corredor = await H.crearUsuario(db, 'corredor@a.test');
  await meter(A.empresaId, corredor, 'Corredor', 'vendedor');
  // El orden de llegada, a mano: dos altas en el mismo instante lo dejarían al azar.
  const EN_ORDEN = [A.uid, vendedor, encargada, conOtro, socio, jefe, jefa, corredor];
  for (let i = 0; i < EN_ORDEN.length; i++) {
    await db.query(`update public.miembros set created_at = now() - interval '1 day' + ($3::int) * interval '1 minute'
      where empresa_id = $1 and user_id = $2`, [A.empresaId, EN_ORDEN[i], i]);
  }
  // Un comprobante, un video y una tarjeta guardada.
  await gasto(A, A.uid, 'con foto', 700);
  const movA = (await fila('select id from public.movimientos where empresa_id = $1', [A.empresaId])).id;
  const rutaFoto = `${A.empresaId}/${movA}/a.webp`;
  await db.query(`insert into public.adjuntos (empresa_id, movimiento_id, tipo, ruta, mime, bytes) values ($1,$2,'foto',$3,'image/webp',10)`,
    [A.empresaId, movA, rutaFoto]);
  const video = (await fila(`insert into public.videos (empresa_id, segundos, bytes, estado) values ($1, 10, 1000, 'listo') returning ruta`, [A.empresaId])).ruta;
  // La tarjeta es de «staging»: desde un servidor en producción no se alcanza
  // (el grupo 7 bis hace el camino con Bancard; acá nadie se la pide).
  const pagador = Number((await fila(`insert into public.bancard_pagadores (empresa_id, entorno) values ($1, 'staging') returning id`, [A.empresaId])).id);
  const tarjetaA = Number((await fila(`insert into public.bancard_tarjetas (empresa_id, pagador_id, entorno, estado, marca, ultimos4, tipo)
    values ($1, $2, 'staging', 'activa', 'Visa', '0016', 'credit') returning id`, [A.empresaId, pagador])).id);

  // Otros, fuera de A.
  const suelto = await H.crearUsuario(db, 'suelto@nadie.test');
  const comun = await H.montarEmpresa(db, { email: 'comun@otro.test', nombre: 'Otro negocio' });
  // Un negocio sin nadie adentro (le borraron el usuario desde Supabase).
  const hueco = await H.montarEmpresa(db, { email: 'fantasma@hueco.test', nombre: 'Hueco' });
  await authBorra(hueco.uid);
  // UNA SOCIA CARGADA POR SU CORREO (revisión del 07/10). La administración
  // la anotó en «Socios» ANTES de que tuviera cuenta. Después se registró con
  // ese correo y armó su negocio; todavía no pidió su código, así que su fila
  // de socios sigue sin usuario: la base la reconoce por el correo
  // (`mi_codigo_socio`). Con mayúsculas y espacios, como se escribe a mano.
  const GUARDAR_SOCIO = `select public.guardar_socio(p_socio => $1, p_nombre => $2, p_telefono => '', p_email => $3) as r`;
  const altaSocia = r(await sesion(jefe, GUARDAR_SOCIO, [null, 'Socia', ' Socia@Correo.test ']));
  const socia = await H.montarEmpresa(db, { email: 'socia@correo.test', nombre: 'De la socia' });

  const motivo = async (uid, actor = jefe, empresa = null) =>
    (await fila('select public.motivo_para_no_borrar($1,$2,$3) m', [uid, actor, empresa])).m;

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Quién se borra: el dueño y su personal, si quedan sin nada');
  // ═══════════════════════════════════════════════════════════
  ok('el dueño que solo tenía ese negocio', await motivo(A.uid, jefe, A.empresaId), null);
  ok('el vendedor que solo trabajaba ahí', await motivo(vendedor, jefe, A.empresaId), null);
  ok('la encargada (admin) que solo trabajaba ahí', await motivo(encargada, jefe, A.empresaId), null);
  ok('pero mientras el negocio exista, ninguno está suelto (sin decir cuál se borra, su membresía cuenta)',
    [await motivo(A.uid), await motivo(vendedor), await motivo(encargada)], ['otro_negocio', 'otro_negocio', 'otro_negocio']);
  ok('el que ya no tiene ningún negocio', await motivo(suelto), null);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Quién no se borra nunca');
  // ═══════════════════════════════════════════════════════════
  ok('quien tiene otro negocio', await motivo(conOtro, jefe, A.empresaId), 'otro_negocio');
  ok('quien recomienda Orden (socio con cuenta)', await motivo(socio, jefe, A.empresaId), 'socio');
  ok('quien aprieta el botón', await motivo(jefe, jefe, A.empresaId), 'vos');
  ok('otra persona de la administración', await motivo(jefa, jefe, A.empresaId), 'administracion');
  ok('y si la que aprieta es ella, al revés', [await motivo(jefa, jefa, A.empresaId), await motivo(jefe, jefa, A.empresaId)], ['vos', 'administracion']);
  ok('la administración sin ningún negocio tampoco', await motivo(jefa, jefe, null), 'administracion');
  ok('un socio suelto tampoco', await (async () => {
    const s2 = await H.crearUsuario(db, 'socio2@nadie.test');
    const c = await sesion(s2, 'select public.mi_codigo_socio() as r');
    if (!c.ok) throw new Error(c.error);
    return motivo(s2);
  })(), 'socio');
  // Cargada por su correo: es la misma persona para la base, la misma regla.
  ok('la socia cargada por su correo se registró después: su fila sigue sin usuario',
    await fila('select email, user_id is null as sin_usuario from public.socios where id = $1', [altaSocia.id]), { email: 'socia@correo.test', sin_usuario: true });
  ok('también recomienda Orden: al borrar su negocio, su correo se queda', await motivo(socia.uid, jefe, socia.empresaId), 'socio');
  const altaOtra = r(await sesion(jefe, GUARDAR_SOCIO, [null, 'Otra', 'otra@correo.test']));
  const otraSocia = await H.crearUsuario(db, 'otra@correo.test');
  ok('y suelta, sin ningún negocio, igual', await motivo(otraSocia), 'socio');
  // Lo que NO pone candado: un socio cargado sin correo y un usuario sin correo
  // no son «el mismo correo».
  r(await sesion(jefe, GUARDAR_SOCIO, [null, 'Sin correo', '']));
  const sinCorreo = (await fila('insert into auth.users (email) values (null) returning id')).id;
  ok('un socio cargado sin correo no le pone candado a nadie (ni a quien no tiene correo, ni a un suelto cualquiera)',
    [await motivo(sinCorreo), await motivo(suelto)], [null, null]);
  await authBorra(sinCorreo);
  // La salida para la administración: sacarle el correo a ese socio en «Socios».
  r(await sesion(jefe, GUARDAR_SOCIO, [altaOtra.id, 'Otra', '']));
  ok('si en «Socios» se le saca el correo, el candado se abre', await motivo(otraSocia), null);
  await authBorra(otraSocia);
  ok('un id que no existe no es un candado: ya no está',
    [await motivo('00000000-0000-0000-0000-000000000001'), await motivo(null)], ['no_existe', 'no_existe']);
  ok('un cliente común, dueño de su negocio', await motivo(comun.uid), 'otro_negocio');
  ok('sin actor no se cae: sigue protegiendo a los demás', [await motivo(jefe, null), await motivo(conOtro, null)], ['administracion', 'otro_negocio']);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · personas_de_cuenta: lo que la ficha muestra antes de confirmar');
  // ═══════════════════════════════════════════════════════════
  const ficha = r(await sesion(jefe, 'select public.personas_de_cuenta($1) as r', [A.empresaId]));
  const ESPERADAS = [
    ['duenio@a.test', 'propietario', null],
    ['vendedor@a.test', 'vendedor', null],
    ['encargada@a.test', 'admin', null],
    ['conotro@a.test', 'admin', 'otro_negocio'],
    ['socio@a.test', 'vendedor', 'socio'],
    ['jefe@orden.test', 'vendedor', 'vos'],
    ['jefa@orden.test', 'vendedor', 'administracion'],
    ['corredor@a.test', 'vendedor', null],
  ];
  ok('quién está, primero el dueño, y qué le pasa a cada correo',
    ficha.personas.map((p) => [p.correo, p.rol, p.motivo]), ESPERADAS);
  ok('se_borra es «sin motivo»', ficha.personas.every((p) => p.se_borra === (p.motivo === null)), true);
  ok('claves exactas de cada persona (sin ids de usuario)', Object.keys(ficha.personas[0]).sort(), ['correo', 'motivo', 'nombre', 'rol', 'se_borra']);
  ok('y avisa que tiene una tarjeta guardada', [Object.keys(ficha).sort(), ficha.tarjeta], [['personas', 'tarjeta'], true]);
  ok('la ficha del negocio de la socia cargada por correo la muestra con su candado',
    r(await sesion(jefe, 'select public.personas_de_cuenta($1) as r', [socia.empresaId])).personas.map((p) => [p.correo, p.se_borra, p.motivo]),
    [['socia@correo.test', false, 'socio']]);
  ok('un negocio sin nadie adentro', r(await sesion(jefe, 'select public.personas_de_cuenta($1) as r', [hueco.empresaId])), { tarjeta: false, personas: [] });
  ok('una cuenta que no existe', r(await sesion(jefe, 'select public.personas_de_cuenta($1) as r', ['00000000-0000-0000-0000-000000000002'])), { tarjeta: false, personas: [] });
  rechazado('un cliente común no la puede leer', await sesion(comun.uid, 'select public.personas_de_cuenta($1) as r', [A.empresaId]), 'administración de Orden');
  rechazado('ni de su propio negocio', await sesion(comun.uid, 'select public.personas_de_cuenta($1) as r', [comun.empresaId]), 'administración de Orden');
  rechazado('sin sesión, ni llamarla', await H.intentarComo(db, 'anon', null, () => db.query('select public.personas_de_cuenta($1) as r', [A.empresaId])), 'permission denied');
  rechazado('con la clave de servicio tampoco (es de la sesión)', await servidor('select public.personas_de_cuenta($1) as r', [A.empresaId]), 'permission denied');

  // ═══════════════════════════════════════════════════════════
  grupo('5 · borrar_cuenta_entera: solo el servidor, con un actor que administre');
  // ═══════════════════════════════════════════════════════════
  const ENTERA = 'select public.borrar_cuenta_entera(p_actor => $1, p_empresa => $2, p_confirmacion => $3, p_solo_comprobar => $4) as r';
  rechazado('desde el navegador, ni la administración', await sesion(jefe, ENTERA, [jefe, A.empresaId, 'Negocio A', false]), 'permission denied');
  rechazado('sin sesión tampoco', await H.intentarComo(db, 'anon', null, () => db.query(ENTERA, [jefe, A.empresaId, 'Negocio A', false])), 'permission denied');
  rechazado('con un actor que no administra, no', await servidor(ENTERA, [comun.uid, A.empresaId, 'Negocio A', false]), 'administración de Orden');
  rechazado('ni el dueño de la propia cuenta', await servidor(ENTERA, [A.uid, A.empresaId, 'Negocio A', false]), 'administración de Orden');
  rechazado('sin actor, no', await servidor(ENTERA, [null, A.empresaId, 'Negocio A', false]), 'administración de Orden');
  rechazado('ni en el ensayo', await servidor(ENTERA, [comun.uid, A.empresaId, 'Negocio A', true]), 'administración de Orden');
  rechazado('sin el nombre exacto, no', await servidor(ENTERA, [jefe, A.empresaId, 'negocio a', false]), 'nombre exacto: Negocio A');
  rechazado('con el nombre vacío, no', await servidor(ENTERA, [jefe, A.empresaId, null, false]), 'nombre exacto');
  rechazado('una cuenta que no existe', await servidor(ENTERA, [jefe, '00000000-0000-0000-0000-000000000002', 'Negocio A', false]), 'Esa cuenta no existe');
  ok('después de todos esos intentos, la cuenta sigue entera',
    await fila(`select (select count(*)::int from public.empresas where id = $1) empresa, (select count(*)::int from public.miembros where empresa_id = $1) personas,
      (select count(*)::int from public.registro_admin where detalle ->> 'nombre' = 'Negocio A') constancias`, [A.empresaId]),
    { empresa: 1, personas: 8, constancias: 0 });

  const ensayo = r(await servidor(ENTERA, [jefe, A.empresaId, 'Negocio A', true]));
  ok('el ensayo: dice que no borró, y trae las mismas personas que vio la ficha',
    [ensayo.borrada, ensayo.nombre, ensayo.movimientos, ensayo.tarjeta, ensayo.personas.map((p) => [p.correo, p.rol, p.motivo])],
    [false, 'Negocio A', 1, true, ESPERADAS]);
  ok('sin rutas (no hay nada que borrar todavía)', [ensayo.archivos, ensayo.videos], [[], []]);
  ok('y no borró ni anotó nada',
    await fila(`select (select count(*)::int from public.empresas where id = $1) empresa, (select count(*)::int from public.adjuntos where empresa_id = $1) fotos,
      (select count(*)::int from public.registro_admin where detalle ->> 'nombre' = 'Negocio A') constancias`, [A.empresaId]),
    { empresa: 1, fotos: 1, constancias: 0 });

  // Con el nombre con espacios a los costados, como la 022.
  const hecho = r(await servidor(ENTERA, [jefe, A.empresaId, '  Negocio A ', false]));
  ok('de verdad: la cuenta ya no está',
    [hecho.borrada, hecho.nombre, hecho.movimientos, (await fila('select count(*)::int n from public.empresas where id = $1', [A.empresaId])).n,
      (await fila('select count(*)::int n from public.miembros where empresa_id = $1', [A.empresaId])).n],
    [true, 'Negocio A', 1, 0, 0]);
  ok('devuelve las rutas de los comprobantes y de los videos', [hecho.archivos, hecho.videos], [[rutaFoto], [video]]);
  ok('y las personas, cada una con su id y su motivo',
    [hecho.personas.map((p) => [p.correo, p.rol, p.motivo]), hecho.personas.map((p) => p.usuario)],
    [ESPERADAS, EN_ORDEN]);
  ok('claves exactas de la respuesta', Object.keys(hecho).sort(), ['archivos', 'borrada', 'movimientos', 'nombre', 'personas', 'tarjeta', 'videos']);
  ok('se llevó la tarjeta y el pagador (por eso Bancard va antes)',
    await fila(`select (select count(*)::int from public.bancard_tarjetas where empresa_id = $1) tarjetas, (select count(*)::int from public.bancard_pagadores where empresa_id = $1) pagadores`, [A.empresaId]),
    { tarjetas: 0, pagadores: 0 });
  ok('los usuarios todavía están: los borra Auth, después', [await existe(A.uid), await existe(vendedor), await existe(encargada)], [true, true, true]);
  rechazado('dos veces: la segunda dice que no existe', await servidor(ENTERA, [jefe, A.empresaId, 'Negocio A', false]), 'Esa cuenta no existe');
  const sinNadie = r(await servidor(ENTERA, [jefe, hueco.empresaId, 'Hueco', false]));
  ok('un negocio sin nadie adentro se borra y no devuelve personas', [sinNadie.borrada, sinNadie.personas, sinNadie.tarjeta], [true, [], false]);
  const deLaSocia = r(await servidor(ENTERA, [jefe, socia.empresaId, 'De la socia', false]));
  ok('el negocio de la socia cargada por correo se borra, y a ella la deja',
    [deLaSocia.borrada, deLaSocia.personas.map((p) => [p.correo, p.motivo])], [true, [['socia@correo.test', 'socio']]]);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · correo_borrable: la comprobación pegada al borrado');
  // ═══════════════════════════════════════════════════════════
  const borrable = async (uid, conf = null, actor = jefe) =>
    r(await servidor('select public.correo_borrable(p_actor => $1, p_usuario => $2, p_confirmacion => $3) as r', [actor, uid, conf]));
  ok('el dueño que quedó sin nada', await borrable(A.uid), { correo: 'duenio@a.test', motivo: null, borrable: true });
  ok('el vendedor y la encargada que quedaron sin nada', [(await borrable(vendedor)).borrable, (await borrable(encargada)).borrable], [true, true]);
  ok('quien tiene otro negocio', await borrable(conOtro), { correo: 'conotro@a.test', motivo: 'otro_negocio', borrable: false });
  ok('quien recomienda Orden', (await borrable(socio)).motivo, 'socio');
  ok('quien aprieta el botón', (await borrable(jefe)).motivo, 'vos');
  ok('otra persona de la administración', (await borrable(jefa)).motivo, 'administracion');
  ok('uno que no existe', await borrable('00000000-0000-0000-0000-000000000001'), { correo: '', motivo: 'no_existe', borrable: false });
  ok('el suelto, con el correo mal escrito', await borrable(suelto, 'suelto@nadie.tes'), { correo: 'suelto@nadie.test', motivo: 'confirmacion', borrable: false });
  ok('con el correo de OTRO', (await borrable(suelto, 'duenio@a.test')).motivo, 'confirmacion');
  ok('con la confirmación vacía (no es lo mismo que no mandarla)', (await borrable(suelto, '')).motivo, 'confirmacion');
  ok('con el correo bien, aunque tenga mayúsculas y espacios', (await borrable(suelto, '  Suelto@Nadie.test ')).borrable, true);
  ok('la confirmación no le gana a un candado', (await borrable(socio, 'socio@a.test')).motivo, 'socio');
  ok('la socia cargada por su correo, ya sin negocio: tampoco, ni escribiéndolo',
    await borrable(socia.uid, 'socia@correo.test'), { correo: 'socia@correo.test', motivo: 'socio', borrable: false });
  // LA CARRERA: con la sesión abierta, el corredor se crea un negocio justo ahora.
  ok('el corredor, antes de correr, se podía borrar', (await borrable(corredor)).borrable, true);
  let justoATiempo;
  await H.comoUsuario(db, corredor, async () => {
    justoATiempo = (await db.query('select public.crear_empresa($1,$2,$3) as id', ['Justo a tiempo', 'PYG', 'Corredor'])).rows[0].id;
  });
  ok('si se creó un negocio en el medio, ya no', await borrable(corredor), { correo: 'corredor@a.test', motivo: 'otro_negocio', borrable: false });
  rechazado('con un actor que no administra, no contesta', await servidor('select public.correo_borrable($1,$2) as r', [comun.uid, suelto]), 'administración de Orden');
  rechazado('sin actor tampoco', await servidor('select public.correo_borrable($1,$2) as r', [null, suelto]), 'administración de Orden');
  rechazado('desde el navegador no se puede llamar', await sesion(jefe, 'select public.correo_borrable($1,$2) as r', [jefe, suelto]), 'permission denied');
  ok('y no borra nada: solo contesta', await existe(suelto), true);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · La constancia: tapada, nunca entera');
  // ═══════════════════════════════════════════════════════════
  const constancia = await fila(`select actor_id, empresa_id, detalle from public.registro_admin where accion = 'borrar_cuenta' and detalle ->> 'nombre' = 'Negocio A'`);
  ok('quién la borró; la cuenta ya quedó en null', [constancia.actor_id === jefe, constancia.empresa_id], [true, null]);
  ok('lo de la 022 sigue igual: nombre, movimientos y personas (un número)',
    [constancia.detalle.nombre, constancia.detalle.movimientos, constancia.detalle.personas], ['Negocio A', 1, 8]);
  ok('lo nuevo: el id de la cuenta, fotos, videos y si tenía tarjeta',
    [constancia.detalle.empresa === A.empresaId, constancia.detalle.fotos, constancia.detalle.videos, constancia.detalle.tenia_tarjeta], [true, 1, 1, true]);
  ok('y la tarjeta que nadie le pidió a Bancard (era del otro entorno): con lo que hace falta para pedírselo a mano',
    constancia.detalle.tarjetas_sin_confirmar, [{ entorno: 'staging', pagador, tarjeta: tarjetaA }]);
  ok('claves exactas de la constancia', Object.keys(constancia.detalle).sort(),
    ['correos', 'empresa', 'fotos', 'movimientos', 'nombre', 'personas', 'se_quedan', 'tarjetas_sin_confirmar', 'tenia_tarjeta', 'videos']);
  ok('los correos que se iban a borrar, tapados', constancia.detalle.correos, ['du***@a.test', 've***@a.test', 'en***@a.test', 'co***@a.test']);
  ok('y los que se quedan, tapados y con su motivo', constancia.detalle.se_quedan,
    [{ correo: 'co***@a.test', motivo: 'otro_negocio' }, { correo: 'so***@a.test', motivo: 'socio' },
      { correo: 'je***@orden.test', motivo: 'vos' }, { correo: 'je***@orden.test', motivo: 'administracion' }]);
  const ANOTAR = 'select public.anotar_correo_borrado(p_actor => $1, p_usuario => $2, p_correo => $3, p_origen => $4, p_cuenta => $5) as r';
  ok('si el usuario todavía existe, no anota', r(await servidor(ANOTAR, [jefe, suelto, 'suelto@nadie.test', 'suelto', null])), { anotado: false });
  ok('ni una fila', (await fila(`select count(*)::int n from public.registro_admin where accion = 'borrar_correo'`)).n, 0);
  rechazado('anotar exige un actor de la administración', await servidor(ANOTAR, [comun.uid, suelto, 'x@x.test', 'suelto', null]), 'administración de Orden');
  rechazado('y no se llama desde el navegador', await sesion(jefe, ANOTAR, [jefe, suelto, 'x@x.test', 'suelto', null]), 'permission denied');
  ok('correo_tapado',
    await fila(`select public.correo_tapado('matias@correo.test') a, public.correo_tapado('a@b.test') b, public.correo_tapado('') c,
      public.correo_tapado('sinarroba') d, public.correo_tapado(null) e, public.correo_tapado('  ab@c.test ') f, public.correo_tapado('@c.test') g`),
    { a: 'ma***@correo.test', b: 'a***@b.test', c: '', d: '***', e: '', f: 'ab***@c.test', g: '***' });

  // ═══════════════════════════════════════════════════════════
  grupo('7 bis · La tarjeta guardada, pasando por Bancard');
  // ═══════════════════════════════════════════════════════════
  // La ruta hace A (ensayo) → B (pedirle la tarjeta a Bancard) → C (borrar).
  // Los grupos de arriba van de A a C; en la vida real, cuando C corre, B ya
  // sacó la tarjeta de «activa». Acá B es el código de verdad
  // (`quitarTarjeta`, con la administración como quien lo pide) contra un
  // Bancard de mentira. Lo que se cuida: que lo único que queda escrito de
  // una cuenta borrada no diga «no tenía tarjeta» justo cuando Bancard la
  // sigue teniendo.
  const falso = crearBancardFalso({ entorno: 'produccion' });
  const bancardDePrueba = {
    bd: { rpc: rpcDelServidor },
    bancard: crearBancard({ entorno: 'produccion', clavePublica: CLAVES_DE_PRUEBA.clavePublica, clavePrivada: CLAVES_DE_PRUEBA.clavePrivada, con3ds: true }, falso.transporte),
    entorno: 'produccion', clavePrivada: CLAVES_DE_PRUEBA.clavePrivada, sitio: 'https://orden.test',
    avisar: async () => {}, registrar: () => {},
  };
  const bancardNoContesta = () => falso.programar(/^\/users\/[0-9]+\/cards$/, 'red');
  /** Una cuenta con una tarjeta activa que Bancard tiene guardada. */
  const cuentaConTarjeta = async (nombre, correo) => {
    const c = await H.montarEmpresa(db, { email: correo, nombre });
    const suPagador = Number((await fila(`insert into public.bancard_pagadores (empresa_id, entorno) values ($1, 'produccion') returning id`, [c.empresaId])).id);
    const tarjeta = Number((await fila(`insert into public.bancard_tarjetas (empresa_id, pagador_id, entorno, estado, marca, ultimos4, tipo)
      values ($1, $2, 'produccion', 'activa', 'Visa', '0016', 'credit') returning id`, [c.empresaId, suPagador])).id);
    falso.registrarTarjeta(suPagador, tarjeta);
    return { ...c, nombre, pagador: suPagador, tarjeta };
  };
  const estadoDeTarjeta = async (c) => (c.tarjeta ? (await fila('select estado from public.bancard_tarjetas where id = $1', [c.tarjeta]))?.estado ?? null : null);
  /** De A a C, como la ruta: qué leyó el ensayo, qué contestó B, cómo estaba la tarjeta al borrar, y qué quedó escrito. */
  const deAaC = async (c) => {
    const visto = r(await servidor(ENTERA, [jefe, c.empresaId, c.nombre, true]));
    const b = await quitarTarjeta(bancardDePrueba, { empresa: c.empresaId, usuario: jefe });
    const alBorrar = await estadoDeTarjeta(c);
    const borrada = r(await servidor(ENTERA, [jefe, c.empresaId, c.nombre, false])).borrada;
    const escrito = (await fila(`select detalle from public.registro_admin where accion = 'borrar_cuenta' and detalle ->> 'nombre' = $1`, [c.nombre])).detalle;
    return {
      ensayo: visto.tarjeta, pasoB: b.ok ? (b.pendienteEnBancard ? 'pendiente' : 'quitada') : b.motivo, alBorrar, borrada,
      tenia_tarjeta: escrito.tenia_tarjeta, sin_confirmar: escrito.tarjetas_sin_confirmar,
    };
  };

  const conRespuesta = await cuentaConTarjeta('Tarjeta uno', 'uno@tarjeta.test');
  ok('Bancard contesta: la borra; queda escrito que TENÍA tarjeta y que no hay ninguna sin confirmar',
    await deAaC(conRespuesta), { ensayo: true, pasoB: 'quitada', alBorrar: 'quitada', borrada: true, tenia_tarjeta: true, sin_confirmar: [] });
  ok('y Bancard ya no la tiene', falso.tarjetasDe(conRespuesta.pagador).length, 0);

  const sinRespuesta = await cuentaConTarjeta('Tarjeta dos', 'dos@tarjeta.test');
  bancardNoContesta();
  ok('Bancard NO contesta: la cuenta se borra igual, y queda escrito con qué pedírselo a mano',
    await deAaC(sinRespuesta), { ensayo: true, pasoB: 'pendiente', alBorrar: 'por_quitar', borrada: true, tenia_tarjeta: true,
      sin_confirmar: [{ entorno: 'produccion', pagador: sinRespuesta.pagador, tarjeta: sinRespuesta.tarjeta }] });
  ok('Bancard la sigue teniendo, y en la base no queda ni la tarjeta ni el pagador: la constancia es el único rastro',
    [falso.tarjetasDe(sinRespuesta.pagador).length, await fila(`select (select count(*)::int from public.bancard_tarjetas where id = $1) tarjetas,
      (select count(*)::int from public.bancard_pagadores where id = $2) pagadores`, [sinRespuesta.tarjeta, sinRespuesta.pagador])],
    [1, { tarjetas: 0, pagadores: 0 }]);

  // Ya estaba a medio quitar: un intento anterior que se cortó entre B y C, o
  // el dueño tocó «Eliminar tarjeta» y Bancard no confirmó.
  const aMedias = await cuentaConTarjeta('Tarjeta tres', 'tres@tarjeta.test');
  bancardNoContesta();
  const elDuenio = await quitarTarjeta(bancardDePrueba, { empresa: aMedias.empresaId, usuario: aMedias.uid });
  ok('el dueño la quitó y Bancard no confirmó: queda por quitar, anotada para que la conciliación termine',
    [elDuenio.ok && elDuenio.pendienteEnBancard, await estadoDeTarjeta(aMedias),
      (await rpcDelServidor('bancard_por_conciliar', { p_entorno: 'produccion', p_limite: 10 })).data.tarjetas_por_quitar.map((x) => Number(x.tarjeta_id))],
    [true, 'por_quitar', [aMedias.tarjeta]]);
  ok('la ficha avisa que tiene una tarjeta guardada: Bancard la sigue teniendo',
    r(await sesion(jefe, 'select public.personas_de_cuenta($1) as r', [aMedias.empresaId])).tarjeta, true);
  // El ensayo dice que hay tarjeta y el paso B contesta «sin_tarjeta» (solo
  // sabe pedir la activa): con eso la ruta contesta «fallo», en ámbar (grupo
  // 13). Si el ensayo dijera que no, saldría «sin_tarjeta», en verde.
  ok('al borrar esa cuenta: el ensayo ve la tarjeta, el servidor ya no la puede pedir, y quedan escritos sus números',
    await deAaC(aMedias), { ensayo: true, pasoB: 'sin_tarjeta', alBorrar: 'por_quitar', borrada: true, tenia_tarjeta: true,
      sin_confirmar: [{ entorno: 'produccion', pagador: aMedias.pagador, tarjeta: aMedias.tarjeta }] });
  ok('la conciliación ya no la encuentra (se fue con la cuenta)',
    (await rpcDelServidor('bancard_por_conciliar', { p_entorno: 'produccion', p_limite: 10 })).data.tarjetas_por_quitar, []);

  const sinTarjeta = { ...(await H.montarEmpresa(db, { email: 'cuatro@tarjeta.test', nombre: 'Tarjeta ninguna' })), nombre: 'Tarjeta ninguna' };
  ok('una cuenta que nunca guardó una tarjeta: nada que avisar ni que anotar',
    await deAaC(sinTarjeta), { ensayo: false, pasoB: 'sin_tarjeta', alBorrar: null, borrada: true, tenia_tarjeta: false, sin_confirmar: [] });
  // Sus dueños quedaron sueltos: se van, para que las listas de abajo sean las del escenario.
  for (const c of [conRespuesta, sinRespuesta, aMedias, sinTarjeta]) await authBorra(c.uid);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · correos_sueltos: la lista del panel');
  // ═══════════════════════════════════════════════════════════
  const lista1 = r(await sesion(jefe, 'select public.correos_sueltos() as r'));
  const en = (lista, correo) => lista.find((x) => x.correo === correo);
  ok('están los que quedaron sin negocio (los de A, los del camino viejo, el suelto)',
    ['duenio@a.test', 'vendedor@a.test', 'encargada@a.test', 'socio@a.test', 'suelto@nadie.test', 'uno@viejo.test', 'dos@viejo.test', 'socio2@nadie.test']
      .filter((c) => !en(lista1, c)), []);
  ok('no está la administración (ni quien aprieta ni la otra), ni quien tiene negocio',
    ['jefe@orden.test', 'jefa@orden.test', 'conotro@a.test', 'corredor@a.test', 'comun@otro.test', 'duenio@vivo.test'].filter((c) => en(lista1, c)), []);
  ok('quien recomienda Orden aparece, con su candado', [en(lista1, 'socio@a.test').se_puede, en(lista1, 'socio@a.test').motivo], [false, 'socio']);
  ok('la socia cargada por su correo también: aparece y no se ofrece borrarla', [en(lista1, 'socia@correo.test').se_puede, en(lista1, 'socia@correo.test').motivo], [false, 'socio']);
  ok('los demás se pueden borrar', lista1.filter((x) => !x.se_puede).map((x) => x.correo).sort(), ['socia@correo.test', 'socio2@nadie.test', 'socio@a.test']);
  ok('claves exactas', Object.keys(lista1[0]).sort(),
    ['con_codigo', 'confirmado', 'correo', 'creado', 'motivo', 'reciente', 'se_puede', 'ultimo_ingreso', 'usuario']);
  ok('el id es el del usuario (lo manda la pantalla para borrarlo)', en(lista1, 'suelto@nadie.test').usuario, suelto);
  // La regla del panel (pruebas/panel.test.js): ni plata ni datos de ningún negocio.
  const PROHIBIDAS = ['monto', 'subtotal', 'total', 'ganancia', 'saldo', 'deuda', 'costo', 'precio', 'descripcion', 'categoria', 'acreedor', 'producto'];
  ok('ni una palabra de plata ni de negocio en la lista', PROHIBIDAS.filter((p) => JSON.stringify(lista1).toLowerCase().includes(p)), []);
  ok('ni en lo que muestra la ficha', PROHIBIDAS.filter((p) => JSON.stringify(ficha).toLowerCase().includes(p)), []);
  ok('sin las columnas de fecha de Auth no falla: vienen vacías',
    [en(lista1, 'suelto@nadie.test').creado, en(lista1, 'suelto@nadie.test').ultimo_ingreso, en(lista1, 'suelto@nadie.test').confirmado,
      en(lista1, 'suelto@nadie.test').reciente, en(lista1, 'suelto@nadie.test').con_codigo],
    [null, null, false, false, false]);
  rechazado('un cliente común no la lee', await sesion(comun.uid, 'select public.correos_sueltos() as r'), 'administración de Orden');
  rechazado('sin sesión, ni llamarla', await H.intentarComo(db, 'anon', null, () => db.query('select public.correos_sueltos() as r')), 'permission denied');
  rechazado('con la clave de servicio tampoco', await servidor('select public.correos_sueltos() as r'), 'permission denied');
  // Ahora con las columnas que tiene Auth de verdad (solo en esta prueba).
  await db.exec(`alter table auth.users add column if not exists created_at timestamptz;
                 alter table auth.users add column if not exists last_sign_in_at timestamptz;
                 alter table auth.users add column if not exists email_confirmed_at timestamptz;
                 alter table auth.users add column if not exists raw_user_meta_data jsonb;
                 alter table auth.users add column if not exists encrypted_password text;`);
  await db.query(`update auth.users set created_at = now() - interval '40 days', last_sign_in_at = now() - interval '3 days',
                  email_confirmed_at = now() - interval '40 days', encrypted_password = 'SECRETO-DE-PRUEBA' where id = $1`, [A.uid]);
  await db.query(`update auth.users set created_at = now() - interval '1 day', raw_user_meta_data = '{"ref":"ABC123"}' where id = $1`, [suelto]);
  const lista2 = r(await sesion(jefe, 'select public.correos_sueltos() as r'));
  const deA = en(lista2, 'duenio@a.test');
  const deS = en(lista2, 'suelto@nadie.test');
  ok('con las columnas: el dueño viejo (fechas, confirmado, ni reciente ni con código)',
    [typeof deA.creado, typeof deA.ultimo_ingreso, deA.confirmado, deA.reciente, deA.con_codigo], ['string', 'string', true, false, false]);
  ok('y el que se registró ayer con el enlace de un socio (sin confirmar, reciente, con código)',
    [deS.ultimo_ingreso, deS.confirmado, deS.reciente, deS.con_codigo], [null, false, true, true]);
  ok('el más nuevo va primero', lista2[0].correo, 'suelto@nadie.test');
  ok('de la fila de Auth no sale nada más (ni la contraseña cifrada)', JSON.stringify(lista2).includes('SECRETO-DE-PRUEBA'), false);
  ok('el tope: con 1 trae uno, y nunca menos',
    [r(await sesion(jefe, 'select public.correos_sueltos(1) as r')).length, r(await sesion(jefe, 'select public.correos_sueltos(0) as r')).length], [1, 1]);
  // CUANDO NO ENTRAN TODOS (revisión del 07/10). La lista va del más nuevo al
  // más viejo y se corta: los que se caen son justo los que quedaron de
  // cuentas borradas hace tiempo. El panel pide UNO MÁS que lo que muestra
  // (src/lib/admin.ts, grupo 13): si llega, sabe que hay más y lo dice. Pidiendo
  // justo el tope, el correo viejo no aparecía y nada avisaba que faltaba.
  const TOPE = T.TOPE_DE_SUELTOS;
  await db.query(`insert into auth.users (email, created_at) values ('viejo@borrada.test', now() - interval '90 days')`);
  await db.query(`insert into auth.users (email, created_at)
    select 'nuevo' || g || '@registro.test', now() - (g || ' minutes')::interval from generate_series(1, $1::int) g`, [TOPE]);
  const loQueLlega = r(await sesion(jefe, 'select public.correos_sueltos($1) as r', [TOPE + 1]));
  const aLaVista = T.sueltosALaVista(loQueLlega);
  ok('con más sueltos que el tope: se muestran los más nuevos, el viejo no entra, y el panel SABE que hay más',
    [TOPE, loQueLlega.length, aLaVista.visibles.length, aLaVista.visibles[0].correo, aLaVista.visibles.some((x) => x.correo === 'viejo@borrada.test'), aLaVista.hayMas],
    [200, 201, 200, 'nuevo1@registro.test', false, true]);
  ok('la base deja pedir uno más que el tope (corta recién en 500)',
    r(await sesion(jefe, 'select public.correos_sueltos(9999) as r')).some((x) => x.correo === 'viejo@borrada.test'), true);
  await db.query(`delete from auth.users where email = 'viejo@borrada.test' or email like 'nuevo%@registro.test'`);
  ok('sin esos, la lista vuelve a entrar entera y no se avisa nada',
    T.sueltosALaVista(r(await sesion(jefe, 'select public.correos_sueltos($1) as r', [TOPE + 1]))).hayMas, false);

  // ═══════════════════════════════════════════════════════════
  grupo('9 · El servidor, de punta a punta (el código de verdad, con un Auth de mentira)');
  // ═══════════════════════════════════════════════════════════
  // Lo que `borrarCorreo` necesita del cliente de servicio: llamar funciones
  // con la clave de servicio y pedirle a Auth que borre. Acá, la misma base.
  const servicioDePrueba = ({ authFalla = false } = {}) => {
    const llamadas = [];
    return {
      llamadas,
      rpc: async (funcion, args) => { llamadas.push(funcion); return rpcDelServidor(funcion, args); },
      auth: { admin: { deleteUser: async (id) => {
        llamadas.push('deleteUser');
        if (authFalla) return { error: { status: 500, code: 'unexpected_failure' } };
        try {
          const res = await db.query('delete from auth.users where id = $1', [id]);
          return (res.affectedRows ?? 0) === 0 ? { error: { status: 404, code: 'user_not_found' } } : { error: null };
        } catch { return { error: { status: 500, code: 'unexpected_failure' } }; }
      } } },
    };
  };
  const callado = async (fn) => { const o = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = o; } };

  // El paso E de la ruta, con las personas que devolvió la base al borrar A.
  // A la encargada, Auth le falla (después se reintenta desde la lista).
  const resultado = [];
  for (const p of hecho.personas) {
    if (p.motivo) { resultado.push([p.correo, 'se_queda', p.motivo]); continue; }
    const s = servicioDePrueba({ authFalla: p.correo === 'encargada@a.test' });
    const x = await callado(() => borrarCorreo(s, { actor: jefe, usuario: p.usuario, origen: 'cuenta', cuenta: hecho.nombre, correo: p.correo }));
    resultado.push([p.correo, x.estado, x.estado === 'se_queda' ? x.motivo : null, s.llamadas.join(' → ')]);
  }
  ok('cada persona de «Negocio A»: qué pasó y qué se llamó, en orden', resultado, [
    ['duenio@a.test', 'borrado', null, 'correo_borrable → deleteUser → anotar_correo_borrado'],
    ['vendedor@a.test', 'borrado', null, 'correo_borrable → deleteUser → anotar_correo_borrado'],
    ['encargada@a.test', 'fallo', null, 'correo_borrable → deleteUser'],
    ['conotro@a.test', 'se_queda', 'otro_negocio'],
    ['socio@a.test', 'se_queda', 'socio'],
    ['jefe@orden.test', 'se_queda', 'vos'],
    ['jefa@orden.test', 'se_queda', 'administracion'],
    // La base lo había dado por borrable; en el medio se creó un negocio.
    ['corredor@a.test', 'se_queda', 'otro_negocio', 'correo_borrable'],
  ]);
  ok('se fueron el dueño y el vendedor', [await existe(A.uid), await existe(vendedor)], [false, false]);
  ok('siguen: la encargada (falló Auth), quien tiene otro negocio, el socio, la administración y el corredor',
    [await existe(encargada), await existe(conOtro), await existe(socio), await existe(jefe), await existe(jefa), await existe(corredor)],
    [true, true, true, true, true, true]);
  ok('la administración sigue administrando', (await fila('select count(*)::int n from public.superadmins')).n, 2);
  ok('el negocio del que corrió sigue con su dueño',
    (await fila(`select count(*)::int n from public.miembros where empresa_id = $1 and user_id = $2 and rol = 'propietario'`, [justoATiempo, corredor])).n, 1);
  ok('la cuenta personal de quien tenía otro negocio, igual',
    (await fila(`select count(*)::int n from public.miembros where empresa_id = $1 and user_id = $2 and rol = 'propietario'`, [loSuyo, conOtro])).n, 1);
  ok('el socio conserva su código', (await fila('select count(*)::int n from public.socios where user_id = $1', [socio])).n, 1);
  ok('una constancia por cada correo borrado de verdad, tapada, con la cuenta',
    (await db.query(`select detalle, actor_id from public.registro_admin where accion = 'borrar_correo' order by created_at, detalle ->> 'correo'`)).rows
      .map((x) => [x.actor_id === jefe, x.detalle.correo, x.detalle.origen, x.detalle.cuenta, [A.uid, vendedor].includes(x.detalle.usuario)]).sort(),
    [[true, 'du***@a.test', 'cuenta', 'Negocio A', true], [true, 've***@a.test', 'cuenta', 'Negocio A', true]]);
  ok('ningún correo entero en todo el registro',
    (await fila(`select count(*)::int n from public.registro_admin where detalle::text like '%duenio@a.test%' or detalle::text like '%vendedor@a.test%'
      or detalle::text like '%encargada@a.test%' or detalle::text like '%conotro@a.test%' or detalle::text like '%socio@a.test%'`)).n, 0);

  // Lo que falló quedó a la vista, y se reintenta desde «Correos sin cuenta».
  const lista3 = r(await sesion(jefe, 'select public.correos_sueltos() as r'));
  ok('la que no se pudo borrar aparece en la lista, y los borrados ya no',
    [!!en(lista3, 'encargada@a.test'), en(lista3, 'encargada@a.test')?.se_puede, !!en(lista3, 'duenio@a.test'), !!en(lista3, 'vendedor@a.test')],
    [true, true, false, false]);
  const sueltoCon = (uid, confirmacion, opciones) => {
    const s = servicioDePrueba(opciones);
    return callado(() => borrarCorreo(s, { actor: jefe, usuario: uid, confirmacion, origen: 'suelto' })).then((x) => ({ ...x, llamadas: s.llamadas.join(' → ') }));
  };
  ok('desde la lista, con el correo mal escrito: no se borra ni se le pide a Auth',
    await sueltoCon(encargada, 'encargada@a.tes'), { estado: 'se_queda', correo: 'encargada@a.test', motivo: 'confirmacion', llamadas: 'correo_borrable' });
  ok('con el correo de otra persona, tampoco',
    [(await sueltoCon(encargada, 'suelto@nadie.test')).estado, await existe(encargada), await existe(suelto)], ['se_queda', true, true]);
  ok('con el correo bien escrito: se borra',
    await sueltoCon(encargada, ' Encargada@A.test '), { estado: 'borrado', correo: 'encargada@a.test', llamadas: 'correo_borrable → deleteUser → anotar_correo_borrado' });
  ok('y queda su constancia, con origen «suelto» y sin cuenta',
    (await fila(`select detalle from public.registro_admin where accion = 'borrar_correo' and detalle ->> 'usuario' = $1`, [encargada])).detalle,
    { correo: 'en***@a.test', cuenta: null, origen: 'suelto', usuario: encargada });
  ok('apretar dos veces no es un error: ya no estaba',
    await sueltoCon(encargada, 'encargada@a.test'), { estado: 'ya_no_estaba', correo: '', llamadas: 'correo_borrable' });
  ok('el socio no se borra ni escribiendo su correo',
    [await sueltoCon(socio, 'socio@a.test'), await existe(socio)], [{ estado: 'se_queda', correo: 'socio@a.test', motivo: 'socio', llamadas: 'correo_borrable' }, true]);
  ok('la socia cargada por su correo tampoco: ni se le pide a Auth',
    [await sueltoCon(socia.uid, 'socia@correo.test'), await existe(socia.uid)],
    [{ estado: 'se_queda', correo: 'socia@correo.test', motivo: 'socio', llamadas: 'correo_borrable' }, true]);
  // Sin `r()`: si a la socia se la hubiera borrado, esto tiene que fallar, no tumbar la prueba.
  const suCodigo = await sesion(socia.uid, 'select public.mi_codigo_socio() as r');
  ok('y su fila la esperó: cuando pide su código recibe el de siempre, pegado a su cuenta',
    [suCodigo.ok && suCodigo.valor.rows[0].r.codigo === altaSocia.codigo,
      (await fila('select user_id = $2 as suya from public.socios where id = $1', [altaSocia.id, socia.uid])).suya === true], [true, true]);
  ok('la administración tampoco, ni a sí misma',
    [(await sueltoCon(jefa, 'jefa@orden.test')).motivo, (await sueltoCon(jefe, 'jefe@orden.test')).motivo, await existe(jefa), await existe(jefe)],
    ['administracion', 'vos', true, true]);
  ok('quien tiene un negocio tampoco, aunque alguien mande su id',
    [(await sueltoCon(comun.uid, 'comun@otro.test')).motivo, await existe(comun.uid)], ['otro_negocio', true]);
  // Un actor que no administra: la base no contesta y no se toca a nadie.
  const sFalso = servicioDePrueba();
  ok('con un actor que no administra, falla y no le pide nada a Auth',
    [(await callado(() => borrarCorreo(sFalso, { actor: comun.uid, usuario: suelto, confirmacion: 'suelto@nadie.test', origen: 'suelto' }))).estado, sFalso.llamadas, await existe(suelto)],
    ['fallo', ['correo_borrable'], true]);
  // Una base que contesta algo raro no alcanza para borrar.
  const sRaro = { llamadas: [], rpc: async () => ({ data: { borrable: true, motivo: 'algo_nuevo', correo: 'suelto@nadie.test' }, error: null }),
    auth: { admin: { deleteUser: async () => { sRaro.llamadas.push('deleteUser'); return { error: null }; } } } };
  ok('un motivo que el código no conoce es un «no»',
    [(await callado(() => borrarCorreo(sRaro, { actor: jefe, usuario: suelto, origen: 'suelto', confirmacion: 'x' }))).estado, sRaro.llamadas], ['fallo', []]);
  const sSinBorrable = { llamadas: [], rpc: async () => ({ data: { motivo: null, correo: 'suelto@nadie.test' }, error: null }),
    auth: { admin: { deleteUser: async () => { sSinBorrable.llamadas.push('deleteUser'); return { error: null }; } } } };
  ok('sin un «borrable: true» entero, tampoco',
    [(await callado(() => borrarCorreo(sSinBorrable, { actor: jefe, usuario: suelto, origen: 'suelto', confirmacion: 'x' }))).estado, sSinBorrable.llamadas], ['fallo', []]);
  const sRoto = { rpc: async () => { throw new Error('se cortó'); }, auth: { admin: { deleteUser: async () => ({ error: null }) } } };
  ok('si la base no contesta, falla sin borrar',
    (await callado(() => borrarCorreo(sRoto, { actor: jefe, usuario: suelto, origen: 'suelto', correo: 'conocido@a.test' }))), { estado: 'fallo', correo: 'conocido@a.test' });
  // Auth lo borró pero la constancia no se pudo escribir: está borrado igual.
  const sSinNota = servicioDePrueba();
  const rpcDeVerdad = sSinNota.rpc;
  sSinNota.rpc = async (f, a) => (f === 'anotar_correo_borrado' ? { data: null, error: { code: 'XX000' } } : rpcDeVerdad(f, a));
  ok('si falla solo la constancia, el correo quedó borrado y así se dice',
    [(await callado(() => borrarCorreo(sSinNota, { actor: jefe, usuario: suelto, confirmacion: 'suelto@nadie.test', origen: 'suelto' }))).estado, await existe(suelto)],
    ['borrado', false]);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Después de borrar');
  // ═══════════════════════════════════════════════════════════
  rechazado('con el token viejo no puede crear un negocio (no nace uno fantasma)',
    await sesion(A.uid, 'select public.crear_empresa($1,$2,$3) as r', ['Fantasma', 'PYG', 'X']), 'foreign key');
  rechazado('ni unirse a uno',
    await sesion(A.uid, 'select public.unirse_empresa($1,$2)', [await H.codigoDe(db, comun.empresaId), 'x']), 'foreign key');
  ok('de esa persona no queda nada propio',
    await fila(`select (select count(*)::int from public.miembros where user_id = $1) miembros, (select count(*)::int from public.preferencias where user_id = $1) preferencias,
      (select count(*)::int from public.superadmins where usuario_id = $1) administracion`, [A.uid]),
    { miembros: 0, preferencias: 0, administracion: 0 });
  ok('lo ajeno sigue entero: el negocio donde el ex empleado había cargado',
    await fila(`select (select count(*)::int from public.empresas where id = $1) empresa, (select count(*)::int from public.movimientos where empresa_id = $1) movimientos,
      (select count(*)::int from public.miembros where empresa_id = $1) personas`, [vivo.empresaId]),
    { empresa: 1, movimientos: 2, personas: 1 });
  ok('y el de un cliente cualquiera',
    (await fila(`select count(*)::int n from public.miembros where empresa_id = $1 and rol = 'propietario'`, [comun.empresaId])).n, 1);
  // «Si yo vuelvo a ingresar el mismo correo, tiene que crearse la nueva cuenta.»
  const deNuevo = await H.montarEmpresa(db, { email: 'duenio@a.test', nombre: 'Negocio A' });
  ok('el mismo correo se registra de nuevo: usuario nuevo, cuenta nueva',
    [deNuevo.uid !== A.uid, deNuevo.empresaId !== A.empresaId, (await fila('select count(*)::int n from public.miembros where user_id = $1', [deNuevo.uid])).n], [true, true, 1]);

  // ═══════════════════════════════════════════════════════════
  grupo('11 · Permisos y forma');
  // ═══════════════════════════════════════════════════════════
  for (const [firma, esperado] of Object.entries(LAS_SIETE)) {
    ok(`${firma} → anon / sesión / servidor`, await permisosDe(firma), esperado);
  }
  const formas = (await db.query(`
    select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any($1) order by 1`, [[...NOMBRES, 'borrar_cuenta']])).rows;
  ok('una sola firma de cada una (y de borrar_cuenta)', formas.map((f) => f.proname).sort(), [...NOMBRES, 'borrar_cuenta'].sort());
  ok('todas con el search_path fijo', formas.filter((f) => JSON.stringify(f.proconfig) !== JSON.stringify(['search_path=public'])).map((f) => f.proname), []);
  ok('definer todas menos correo_tapado (que no lee nada)', formas.filter((f) => !f.prosecdef).map((f) => f.proname), ['correo_tapado']);
  const sql129 = leer(archivo129());
  ok('la 129 no tiene ni una barra invertida', sql129.includes(BARRA), false);
  ok('ni en lo que quedó guardado en la base',
    (await fila(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any($1) and position(chr(92) in p.prosrc) > 0`, [NOMBRES])).n, 0);
  ok('no nombra de auth.users otra columna que id y email',
    [...sinComentariosSql(sql129).matchAll(/\bu\.(\w+)/g)].map((m) => m[1]).filter((c, i, a) => a.indexOf(c) === i).sort(), ['email', 'id']);
  ok('ni toca a borrar_cuenta, ni borra de auth.users por su cuenta',
    [/function\s+public\.borrar_cuenta\s*\(/i.test(sql129), /delete\s+from\s+auth\./i.test(sinComentariosSql(sql129))], [false, false]);
  ok('ningún mensaje nuevo: los tres que lanza ya existían',
    [...new Set([...sql129.matchAll(/raise exception\s+'((?:[^']|'')*)'/gi)].map((m) => m[1]))].sort(),
    ['Esa cuenta no existe.', 'Este panel es solo para la administración de Orden.', 'Para borrar hay que escribir el nombre exacto: %']);
  // Dos veces: contesta igual y no duplica nada.
  const fotoForma = async () => ({
    funciones: (await db.query(`select p.oid::regprocedure::text f, pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any($1) order by 1`, [[...NOMBRES, 'borrar_cuenta']])).rows,
    permisos: await Promise.all(Object.keys(LAS_SIETE).map(permisosDe)),
    restriccion: (await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'movimientos_anulacion_auditada'`)).rows,
    lista: r(await sesion(jefe, 'select public.correos_sueltos() as r')),
  });
  const antesDeRepetir = await fotoForma();
  await H.aplicarMigracion(db, '129');
  ok('aplicada dos veces, queda igual', JSON.stringify(await fotoForma()) === JSON.stringify(antesDeRepetir), true);

  // ═══════════════════════════════════════════════════════════
  grupo('12 · Lo que se le dice a quien administra');
  // ═══════════════════════════════════════════════════════════
  const base = { ok: true, nombre: 'Negocio A', movimientos: 12, correos: [], tarjeta: 'sin_tarjeta', archivos: 0, archivos_sin_borrar: 0 };
  ok('una cuenta sin nadie', [T.mensajeDeCuentaBorrada(base), T.hayOjo(base)], ['Listo: se borró «Negocio A».', false]);
  const uno = { ...base, correos: [{ correo: 'a@a.test', estado: 'borrado', motivo: null }] };
  ok('con un correo', [T.mensajeDeCuentaBorrada(uno), T.hayOjo(uno)], ['Listo: se borró «Negocio A». También se borró el correo de a@a.test.', false]);
  const varios = { ...base, tarjeta: 'quitada', correos: [
    { correo: 'a@a.test', estado: 'borrado', motivo: null }, { correo: 'b@a.test', estado: 'ya_no_estaba', motivo: null },
    { correo: 'c@a.test', estado: 'borrado', motivo: null }, { correo: 'd@a.test', estado: 'se_queda', motivo: 'otro_negocio' },
    { correo: 'e@a.test', estado: 'se_queda', motivo: 'socio' }] };
  ok('con varios, uno que tiene otro negocio, un socio y la tarjeta quitada: todo en verde',
    [T.mensajeDeCuentaBorrada(varios), T.hayOjo(varios)],
    ['Listo: se borró «Negocio A». También se borraron 3 correos: a@a.test, b@a.test y c@a.test. No se borró el correo de d@a.test: tiene otro negocio. '
      + 'No se borró el correo de e@a.test: recomienda Orden. Bancard borró la tarjeta guardada.', false]);
  const mal = { ...base, tarjeta: 'pendiente', archivos: 14, archivos_sin_borrar: 3, correos: [
    { correo: 'a@a.test', estado: 'borrado', motivo: null }, { correo: 'f@a.test', estado: 'fallo', motivo: null }] };
  ok('con algo a medias: se dice qué, y va en ámbar',
    [T.mensajeDeCuentaBorrada(mal), T.hayOjo(mal)],
    ['Listo: se borró «Negocio A». También se borró el correo de a@a.test. Ojo: no se pudo borrar el correo de f@a.test. Quedó más abajo, en «Correos sin cuenta». '
      + 'Ojo: Bancard no confirmó que borró la tarjeta guardada. Orden ya no la puede cobrar. Ojo: quedaron 3 archivos sin borrar.', true]);
  ok('cada cosa pendiente, sola, alcanza para el ámbar',
    [T.hayOjo({ ...base, correos: [{ correo: 'x', estado: 'fallo', motivo: null }] }), T.hayOjo({ ...base, tarjeta: 'pendiente' }), T.hayOjo({ ...base, tarjeta: 'fallo' }),
      T.hayOjo({ ...base, tarjeta: 'sin_configurar' }), T.hayOjo({ ...base, archivos_sin_borrar: 1 }), T.hayOjo({ ...base, tarjeta: 'quitada' }),
      T.hayOjo({ ...base, correos: [{ correo: 'x', estado: 'se_queda', motivo: 'vos' }] })],
    [true, true, true, true, true, false, false]);
  ok('todo lo que va en ámbar dice «Ojo»',
    [{ ...base, correos: [{ correo: 'x@a.test', estado: 'fallo', motivo: null }, { correo: 'y@a.test', estado: 'fallo', motivo: null }] },
      { ...base, tarjeta: 'fallo' }, { ...base, tarjeta: 'sin_configurar' }, { ...base, archivos_sin_borrar: 1 }]
      .map((d) => T.mensajeDeCuentaBorrada(d).replace('Listo: se borró «Negocio A». ', '')),
    ['Ojo: no se pudieron borrar 2 correos: x@a.test y y@a.test. Quedaron más abajo, en «Correos sin cuenta».',
      'Ojo: no se le pudo pedir a Bancard que borre la tarjeta guardada.',
      'Ojo: tenía una tarjeta guardada y este servidor no tiene Bancard: no se le pidió que la borre.',
      'Ojo: quedó 1 archivo sin borrar.']);
  ok('los motivos, en palabras', ['otro_negocio', 'administracion', 'vos', 'socio', 'uno_nuevo', null].map(T.textoDeMotivo),
    ['tiene otro negocio', 'administra Orden', 'sos vos', 'recomienda Orden', 'la base no lo permite', 'la base no lo permite']);
  ok('la lista en palabras', [T.enPalabras([]), T.enPalabras(['a']), T.enPalabras(['a', 'b']), T.enPalabras(['a', 'b', 'c'])], ['', 'a', 'a y b', 'a, b y c']);
  ok('el correo escrito a mano: igual que la base (mayúsculas y espacios no cuentan; vacío no es nada)',
    [T.mismoCorreo(' Ana@A.test ', 'ana@a.test'), T.mismoCorreo('ana@a.tes', 'ana@a.test'), T.mismoCorreo('', ''), T.mismoCorreo('  ', 'ana@a.test')],
    [true, false, false, false]);
  ok('después de borrar uno de la lista',
    [T.mensajeDeCorreoBorrado('borrado', 'ana@a.test'), T.mensajeDeCorreoBorrado('ya_no_estaba', 'ana@a.test')],
    ['Listo: se borró el correo ana@a.test. Ya se puede registrar de nuevo.', 'Ese correo ya estaba borrado.']);
  ok('si el pedido se corta, también es ámbar y manda a mirar las listas',
    [T.BORRADO_SIN_RESPUESTA.startsWith('Ojo:'), T.BORRADO_SIN_RESPUESTA.includes('«Correos sin cuenta»')], [true, true]);
  const deLargo = (n) => T.sueltosALaVista(Array.from({ length: n }, (_, i) => i));
  ok('la lista de sueltos: hasta el tope entra entera; con uno más se muestran los primeros y se sabe que hay más',
    [T.sueltosALaVista([]), deLargo(200).hayMas, deLargo(200).visibles.length, deLargo(201).hayMas, deLargo(201).visibles.length, deLargo(201).visibles[199]],
    [{ visibles: [], hayMas: false }, false, 200, true, 200, 199]);

  // ═══════════════════════════════════════════════════════════
  grupo('13 · Las fuentes');
  // ═══════════════════════════════════════════════════════════
  const RUTA_CUENTAS = 'src/app/api/admin/cuentas/borrar/route.ts';
  const RUTA_CORREOS = 'src/app/api/admin/correos/borrar/route.ts';
  const antesQue = (s, ...marcas) => {
    const pos = marcas.map((m) => s.indexOf(m));
    return pos.every((p, i) => p >= 0 && (i === 0 || pos[i - 1] < p));
  };
  for (const ruta of [RUTA_CUENTAS, RUTA_CORREOS]) {
    const s = sinComentarios(leer(ruta));
    ok(`${ruta.split('/').slice(3, 5).join('/')}: sesión (401), administración (403, estricto), y recién después el pedido y la clave de servicio`,
      [s.includes('status: 401'), s.includes('status: 403'), s.includes('esSuper !== true'),
        antesQue(s, 'supabase.auth.getUser()', "rpc('es_superadmin')", 'request.json(', 'clienteDeServicio('),
        // La guarda usa el cliente de la sesión, no el de servicio.
        /const supabase = clienteServidor\(\);/.test(s), /supabase\.rpc\('es_superadmin'\)/.test(s)],
      [true, true, true, true, true, true]);
    ok('corre en Node, sin caché y con su tiempo',
      [s.includes("runtime = 'nodejs'"), s.includes("dynamic = 'force-dynamic'"), /export const maxDuration = \d+;/.test(s)], [true, true, true]);
    ok('no le pide a Auth que borre por su cuenta (va por la pieza compartida) ni lee tablas',
      [s.includes('deleteUser('), s.includes('borrarCorreo('), [...s.matchAll(/(\w+)\.from\(/g)].map((m) => m[1]).filter((x) => x !== 'storage')], [false, true, []]);
  }
  const cuentas = sinComentarios(leer(RUTA_CUENTAS));
  const post = cuentas.slice(cuentas.indexOf('export async function POST'), cuentas.search(/\n(?:async )?function /));
  ok('la ruta de cuentas: ensayo → tarjeta → borrado → archivos → correos',
    antesQue(post, 'p_solo_comprobar: true', 'quitarTarjeta(', 'p_solo_comprobar: false', ".from('comprobantes').remove(", 'borrarCorreo('), true);
  // Que el ensayo CORTE: sin esa línea, con el nombre mal escrito la ruta
  // seguiría y le quitaría la tarjeta a la cuenta antes de fallar.
  ok('si el ensayo dice que no, la ruta corta ahí: antes de tocar la tarjeta',
    antesQue(post, 'p_solo_comprobar: true', 'if (ensayo.error) return noSePudo(', 'quitarTarjeta('), true);
  // La tarjeta que el ensayo vio y el paso B no pudo pedir (por quitar, o del
  // otro entorno: grupo 7 bis) es «fallo», en ámbar; nunca «sin_tarjeta».
  ok('lo que el ensayo vio de la tarjeta decide entre «fallo» y «sin_tarjeta»',
    [post.includes('const teniaTarjeta = (ensayo.data as { tarjeta?: unknown } | null)?.tarjeta === true;'),
      (post.match(/tarjeta = teniaTarjeta \? 'fallo' : 'sin_tarjeta';/g) ?? []).length, T.hayOjo({ ...base, tarjeta: 'fallo' }), T.hayOjo({ ...base, tarjeta: 'sin_tarjeta' })],
    [true, 2, true, false]);
  ok('borra los videos también, y de a 100', [post.includes(".from('videos').remove("), /i \+= 100/.test(cuentas)], [true, true]);
  ok('del pedido lee la cuenta y el nombre escrito, y nada más (ninguna lista de personas)',
    [...new Set([...cuentas.matchAll(/cuerpo\.(\w+)/g)].map((m) => m[1]))].sort(), ['confirmacion', 'empresa']);
  ok('las personas salen de lo que devolvió la base al borrar', /soloPersonas\(hecho\.personas\)/.test(post), true);
  ok('y el actor es siempre el de la sesión (a quién se borra, lo que dijo la base)',
    [[...new Set([...post.matchAll(/\b(?:p_actor|actor): ([\w.]+)/g)].map((m) => m[1]))], [...new Set([...post.matchAll(/\busuario: ([\w.]+)/g)].map((m) => m[1]))].sort()],
    [['user.id'], ['persona.usuario', 'user.id']]);
  ok('después del borrado contesta siempre que sí (un solo «ok: true», al final)',
    [(post.match(/ok: true/g) ?? []).length, post.lastIndexOf('ok: true') > post.indexOf('borrarCorreo(')], [1, true]);
  const correosRuta = sinComentarios(leer(RUTA_CORREOS));
  ok('la ruta de correos lee el usuario y el correo escrito, y nada más',
    [...new Set([...correosRuta.matchAll(/cuerpo\.(\w+)/g)].map((m) => m[1]))].sort(), ['confirmacion', 'usuario']);
  ok('sin el correo escrito no llega a la base', antesQue(correosRuta, 'if (!confirmacion)', 'clienteDeServicio(', 'borrarCorreo('), true);
  // Sin «confirmacion» en esa llamada la base no compara nada: con cualquier
  // texto se borraría el usuario cuyo id venga en el pedido.
  ok('y el correo escrito LLEGA a la base: es ella la que lo compara con el de ese usuario',
    [correosRuta.includes("borrarCorreo(servicio, { actor: user.id, usuario, confirmacion, origen: 'suelto' })"), (correosRuta.match(/borrarCorreo\(/g) ?? []).length],
    [true, 1]);

  const pieza = sinComentarios(leer('src/lib/borrar-correo-servidor.ts'));
  ok('la pieza compartida: la base dice que sí → Auth borra → queda la constancia',
    antesQue(pieza, "'correo_borrable'", 'dicho.borrable !== true', 'servicio.auth.admin.deleteUser(', "'anotar_correo_borrado'"), true);
  ok('y a Auth se le pide en un solo lugar', (pieza.match(/\.deleteUser\(/g) ?? []).length, 1);
  ok('y no importa nada de Supabase ni de Next (por eso se puede probar acá)',
    [...pieza.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['./tipos']);

  // Quién le puede pedir a Auth que borre a alguien, en todo src/.
  const conDeleteUser = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { recorrer(rel); continue; }
      if (/\.(ts|tsx)$/.test(e.name) && /deleteUser\s*\(|auth\.admin/.test(sinComentarios(leer(rel)))) conDeleteUser.push(rel);
    }
  };
  recorrer('src');
  ok('en todo src/, solo dos archivos le piden a Auth que borre',
    conDeleteUser.sort(), ['src/app/api/cuenta/borrar/route.ts', 'src/lib/borrar-correo-servidor.ts']);

  const panel = leer('src/components/PanelAdmin.tsx');
  const panelSin = sinComentarios(panel);
  ok('el panel ya no borra la cuenta desde el navegador: va por el servidor',
    [panelSin.includes("rpc('borrar_cuenta'"), panelSin.includes("fetch('/api/admin/cuentas/borrar'"), panelSin.includes("rpc('personas_de_cuenta'")], [false, true, true]);
  ok('y manda la cuenta y el nombre escrito, nada más',
    panelSin.includes('body: JSON.stringify({ empresa: cuenta.empresa_id, confirmacion: confirmaBorrado })'), true);
  ok('el botón se sigue habilitando solo con el nombre exacto',
    panelSin.includes("disabled={ocupado || confirmaBorrado.trim() !== cuenta.nombre}"), true);
  ok('las cadenas que otras pruebas atan siguen ahí',
    ['faltoComision', 'onHecho([contar?.(data), comision]', '<p role="alert" className="rounded-xl bg-rojo-claro px-3.5', 'Mantiene su racha',
      'avisarActivacion(', 'En un Premium escribí siempre el número', "rpc('asignar_referido'", "rpc('quitar_referido'"].filter((c) => !panel.includes(c)), []);
  ok('el cartel va en ámbar cuando quedó algo a medias', /ojo \? 'bg-ambar-claro' : 'bg-verde-claro'/.test(panelSin), true);
  ok('y la ficha le avisa al panel que quedó algo a medias (sin eso, el cartel saldría verde)',
    panelSin.includes('onHecho(mensajeDeCuentaBorrada(hecha), hayOjo(hecha));'), true);
  // En el teléfono la lista de cuentas queda debajo de la primera pantalla: sin
  // subir, el cartel (lo único que dice qué quedó a medias) no se llega a ver.
  const alCerrarLaFicha = panelSin.slice(panelSin.indexOf('<FichaCuenta'), panelSin.indexOf('/>', panelSin.indexOf('<FichaCuenta')));
  ok('después de una acción de la ficha la página sube al cartel, y solo si hay algo que leer',
    [alCerrarLaFicha.includes("setHecho(mensaje ?? '');"), alCerrarLaFicha.includes("if (mensaje) window.scrollTo({ top: 0, behavior: 'smooth' });"),
      (panelSin.match(/window\.scrollTo\(\{ top: 0/g) ?? []).length],
    [true, true, 2]);

  const lista = leer('src/components/CorreosSueltos.tsx');
  const listaSin = sinComentarios(lista);
  ok('la lista de sueltos: por la ruta, con el correo escrito a mano para habilitar el botón',
    [listaSin.includes("fetch('/api/admin/correos/borrar'"), listaSin.includes('disabled={borrando || !mismoCorreo(escrito, elegido.correo)}'),
      listaSin.includes('body: JSON.stringify({ usuario: elegido.usuario, confirmacion: escrito })')], [true, true, true]);
  ok('colores por variables, ventana con Hoja, textos en el componente (como todo /admin)',
    [/\bbg-white(?!\/)|\bbg-black\b|\bdark:/.test(lista), listaSin.includes('fixed inset-0'), listaSin.includes('useTextos'), listaSin.includes('<Hoja'),
      lista.startsWith("'use client'")], [false, false, false, true, true]);
  ok('no hay «borrar todos»', /borrar todos|todos los correos/i.test(listaSin), false);
  ok('la lista muestra lo que entra y avisa cuando hay más (título y cartel)',
    [listaSin.includes('const { visibles, hayMas } = sueltosALaVista(sueltos ?? []);'), listaSin.includes('{visibles.map((s) => ('), /\{sueltos\.map\(/.test(listaSin),
      listaSin.includes('{hayMas ? `Más de ${cuantos}` : cuantos}'), /\{hayMas && \(\s*<p [^>]*>\s*Se muestran los \{cuantos\} más nuevos\. Hay más correos sin cuenta/.test(listaSin)],
    [true, true, false, true, true]);

  const admin = sinComentarios(leer('src/lib/admin.ts'));
  ok('la lista se lee con la sesión (no con la clave de servicio) y no tira el panel si falla',
    [admin.includes("rpc('correos_sueltos'"), admin.includes('clienteDeServicio'), /if \(error\) return null;/.test(admin)], [true, false, true]);
  ok('y pide uno más que el tope, para saber si quedó cortada',
    admin.includes("rpc('correos_sueltos', { p_limite: TOPE_DE_SUELTOS + 1 })"), true);
  ok('y la página la pide y la pasa', [leer('src/app/admin/page.tsx').includes('traerCorreosSueltos()'), leer('src/app/admin/page.tsx').includes('sueltos={sueltos}')], [true, true]);

  const medio = leer('src/middleware.ts');
  const PUBLICAS = [...medio.slice(medio.indexOf('const PUBLICAS = ['), medio.indexOf('];', medio.indexOf('const PUBLICAS = [')))
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  ok('el middleware no abre las rutas de la administración',
    [PUBLICAS.includes('/r/'), ['/api/admin/cuentas/borrar', '/api/admin/correos/borrar'].filter((x) => PUBLICAS.some((p) => x.startsWith(p)))], [true, []]);
  const servicioTs = leer('src/lib/supabase/servicio.ts');
  ok('servicio.ts escribe la excepción nueva y conserva las de antes',
    ['/api/admin/cuentas/borrar', '/api/admin/correos/borrar', '/rutina/[token]/videos', '/api/pagos/bancard/'].filter((x) => !servicioTs.includes(x)), []);
  const propia = leer('src/app/api/cuenta/borrar/route.ts');
  ok('«Borrar mi cuenta» no se tocó',
    ['quitarTarjeta(d, {', '.catch(() => undefined)', "'videos_a_borrar'", ".from('videos').remove(", 'auth.admin.deleteUser(user.id)'].filter((x) => !propia.includes(x)), []);
  ok('ningún loading.tsx en lo nuevo',
    ['src/app/api/admin/cuentas/borrar', 'src/app/api/admin/correos/borrar', 'src/app/admin'].filter((d) => fs.existsSync(path.join(RAIZ, d, 'loading.tsx'))), []);

  console.log(`\n${corridas} comprobaciones, ${fallos} fallos, ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

/** El SQL sin sus comentarios de línea (los «--»). */
function sinComentariosSql(sql) {
  return sql.split('\n').map((l) => { const i = l.indexOf('--'); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
}
