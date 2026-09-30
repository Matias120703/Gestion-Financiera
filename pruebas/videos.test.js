/**
 * Los videos propios del trainer (migración 113, 30/09/2026).
 *
 * Matías, a partir de un entrenador real: el trainer sube SUS videos (él
 * haciendo el ejercicio) a cada ejercicio de su lista, hasta 100 por cuenta
 * y de hasta 60 segundos; el alumno los ve en su link.
 *
 * En orden de importancia:
 *   1. que nadie de afuera toque la tabla ni las funciones del sistema, y que
 *      el alumno reciba lo justo: `clip` sin ruta ni empresa, y rutas para
 *      firmar solo de SU rutina vigente, con el link prendido;
 *   2. que los topes se cumplan en la base: 100 por cuenta (todas las filas,
 *      también las que se están subiendo), 60 s, 15 MB con el tamaño REAL de
 *      Storage, solo MP4, y lo pago con limites_de_empresa;
 *   3. que Storage solo acepte rutas reservadas hace menos de 3 horas por la
 *      misma cuenta, y que un video puesto en un ejercicio no se borre;
 *   4. que no queden archivos pagando para siempre: soltar, limpiar, unir,
 *      borrar un ejercicio y borrar la cuenta;
 *   5. que un vencido no suba ni enganche, pero pueda borrar (limpiar anda
 *      siempre, 018);
 *   6. que la 113 se pueda aplicar dos veces.
 */
const H = require('./ayuda-db.js');
const crypto = require('crypto');

let fallos = 0;
let corridas = 0;

function grupo(nombre) {
  console.log(`\n── ${nombre} ${'─'.repeat(Math.max(0, 58 - nombre.length))}`);
}

// jsonb guarda las claves en su propio orden: se comparan ordenadas.
const ordenado = (x) => (Array.isArray(x) ? x.map(ordenado)
  : x && typeof x === 'object' && !(x instanceof Date)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordenado(x[k])]))
    : x);

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(ordenado(real));
  const b = JSON.stringify(ordenado(esperado));
  if (a !== b) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`);
  } else {
    console.log(`  ✓ ${nombre} → ${a.length > 90 ? a.slice(0, 87) + '...' : a}`);
  }
}

function rechazado(nombre, resultado, fragmento) {
  corridas++;
  if (resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      NO fue rechazada`);
    return;
  }
  if (fragmento && !new RegExp(fragmento, 'i').test(resultado.error)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      rechazada por otro motivo: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${String(resultado.error).split('\n')[0].slice(0, 64)}`);
}

function aceptado(nombre, resultado) {
  corridas++;
  if (!resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      fue rechazada: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre}`);
}

const CANDADO = 'Se te terminó la prueba';
const MB = 1024 * 1024;
const claves = (o) => Object.keys(o ?? {}).sort();

// Receta A (solo-lectura.test.js:62-65): la prueba termina sola.
const vencer = (db, id) => db.query(
  `update public.suscripciones
   set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
   where empresa_id = $1`, [id]);
// Pagar (permisos.test.js:166-167).
const pagar = (db, id, plan = 'basico') => H.comoServicio(db, () => db.query(
  "select public.aplicar_suscripcion($1,$2,'activa',now(),now()+interval '30 days','manual')", [id, plan]));

(async () => {
  const db = await H.crearBase();
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(`${sql} → ${r.error}`);
    return r.valor.rows[0];
  };
  const J = async (uid, sql, args = []) => (await valor(uid, sql, args)).j;
  const fila = async (q, args = []) => (await db.query(q, args)).rows[0];
  const contar = async (q, args = []) => Number((await fila(q, args)).n);
  const servicio = (sql, args = []) => H.intentarComo(db, 'service_role', null, () => db.query(sql, args));
  const anon = (sql, args = []) => H.intentarComo(db, 'anon', null, () => db.query(sql, args));

  let nTrainer = 0;
  const trainer = async (nombre = 'Entrená con Lucas') => {
    nTrainer++;
    return H.montarEmpresa(db, { email: `trainer${nTrainer}@fuerza.com`, nombre: `${nombre} ${nTrainer}`, rubro: 'entrenamiento' });
  };
  const ejercicio = async (C, nombre, video = null) =>
    (await J(C.uid, 'select public.guardar_ejercicio($1,$2,null,$3,$4,true,null) j', [C.empresaId, nombre, '', video])).id;
  const reservar = (C, seg = 30, bytes = 8 * MB, emp = C.empresaId) =>
    como(C.uid, 'select public.reservar_video($1,$2,$3) j', [emp, seg, bytes]);
  const reservarOk = async (C, seg = 30, bytes = 8 * MB) => {
    const r = await reservar(C, seg, bytes);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const poner = (C, ej, video, emp = C.empresaId) =>
    como(C.uid, 'select public.poner_video_ejercicio($1,$2,$3) j', [emp, ej, video]);
  const ponerOk = async (C, ej, video) => {
    const r = await poner(C, ej, video);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const estado = async (id) => (await fila('select estado from public.videos where id=$1', [id]))?.estado ?? null;
  const videoDe = async (ej) => (await fila('select video_id from public.ejercicios where id=$1', [ej]))?.video_id ?? null;

  const T = await trainer();
  const Otro = await trainer('Otro trainer');
  const P = await H.montarEmpresa(db, { email: 'ana@casa.com', nombre: 'Mis finanzas', tipoCuenta: 'personal' });
  const PP = await H.montarEmpresa(db, { email: 'beto@casa.com', nombre: 'Lo de Beto', tipoCuenta: 'personal' });
  await pagar(db, PP.empresaId, 'pro');
  const TA = await trainer('Trainer que paga');
  await pagar(db, TA.empresaId);
  const TV = await trainer('Trainer vencido');
  await vencer(db, TV.empresaId);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Cerrado: la tabla y las funciones del sistema');
  // ═══════════════════════════════════════════════════════════
  rechazado('anon no lee videos', await anon('select * from public.videos'), 'permission denied');
  rechazado('ni alguien con sesión lee videos directo', await como(T.uid, 'select * from public.videos'), 'permission denied');
  rechazado('ni escribe directo',
    await como(T.uid, 'insert into public.videos (empresa_id, segundos, bytes) values ($1, 10, 100)', [T.empresaId]),
    'permission denied');
  const permiso = async (rol, firma) => (await fila(
    'select has_function_privilege($1, $2, \'execute\') p', [rol, firma])).p;
  for (const f of ['public.video_en_storage(text)', 'public.soltar_video_de_ejercicio()']) {
    ok(`nadie de afuera llama a ${f.split('(')[0].slice(7)}`,
      [await permiso('anon', f), await permiso('authenticated', f)], [false, false]);
  }
  const DEL_SISTEMA = [
    ['videos_por_token', 'select public.videos_por_token($1) j', [crypto.randomUUID()]],
    ['videos_para_limpiar', 'select public.videos_para_limpiar() j', []],
    ['videos_limpiados', "select public.videos_limpiados('{}'::text[]) j", []],
    ['videos_a_borrar', 'select public.videos_a_borrar($1) j', [T.uid]],
  ];
  for (const [nombre, sql, args] of DEL_SISTEMA) {
    rechazado(`authenticated no llama a ${nombre}`, await como(T.uid, sql, args), 'permission denied');
    rechazado(`ni anon a ${nombre}`, await anon(sql, args), 'permission denied');
    aceptado(`service_role sí llama a ${nombre}`, await servicio(sql, args));
  }
  for (const f of ['reservar_video(uuid, numeric, integer)', 'poner_video_ejercicio(uuid, uuid, uuid)',
    'soltar_videos(uuid, uuid[])', 'videos_por_soltar(uuid)', 'videos_de_la_cuenta(uuid)',
    'puede_subir_video(uuid)', 'video_visible(text)', 'video_subible(text)', 'video_borrable(text)']) {
    ok(`${f.split('(')[0]}: authenticated sí, anon no`,
      [await permiso('authenticated', `public.${f}`), await permiso('anon', `public.${f}`)], [true, false]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Los límites: 100 en cada plan pago, 0 en Gratis y en la personal');
  // ═══════════════════════════════════════════════════════════
  const limPlan = async (p) => (await fila("select (public.limites_plan($1)->>'videos')::int v", [p])).v;
  ok('limites_plan: basico, pro, negocio y gratis',
    [await limPlan('basico'), await limPlan('pro'), await limPlan('negocio'), await limPlan('gratis')], [100, 100, 100, 0]);
  const limEmp = async (id) => (await fila("select (public.limites_de_empresa($1)->>'videos')::int v", [id])).v;
  // Revisión (30/09): en la prueba, limite_videos_en_prueba() (20); pagando, el del plan (100).
  ok('limites_de_empresa: trainer en prueba (20) y pagando (100)', [await limEmp(T.empresaId), await limEmp(TA.empresaId)], [20, 100]);
  ok('una personal en prueba y una que paga: 0', [await limEmp(P.empresaId), await limEmp(PP.empresaId)], [0, 0]);
  ok('un trainer vencido: 0', await limEmp(TV.empresaId), 0);
  const puede = async (C, emp = C.empresaId) => (await valor(C.uid, 'select public.puede_subir_video($1) p', [emp])).p;
  ok('puede_subir_video: en prueba, pagando, vencido',
    [await puede(T), await puede(TA), await puede(TV)], [true, true, false]);
  ok('una cuenta ajena no le pregunta a otra', await puede(Otro, T.empresaId), false);
  ok('una personal no', [await puede(P), await puede(PP)], [false, false]);
  ok('datos_empresa().limites trae la clave videos',
    (await J(T.uid, 'select public.datos_empresa($1) j', [T.empresaId]))?.limites?.videos, 20);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Reservar');
  // ═══════════════════════════════════════════════════════════
  const r3 = await reservarOk(T, 30.24, 8 * MB);
  ok('devuelve {id, ruta}', claves(r3), ['id', 'ruta']);
  ok('la ruta es el id y .mp4, sin la empresa', r3.ruta, `${r3.id}.mp4`);
  const f3 = await fila('select estado, segundos::float s, bytes, creado_por from public.videos where id=$1', [r3.id]);
  ok('queda subiendo, redondeada a un decimal y con quién la reservó', [f3.estado, f3.s, f3.bytes, f3.creado_por], ['subiendo', 30.2, 8 * MB, T.uid]);
  rechazado('0 segundos', await reservar(T, 0), 'hasta 60 segundos');
  rechazado('61 segundos', await reservar(T, 61), 'hasta 60 segundos');
  rechazado('sin segundos', await reservar(T, null), 'hasta 60 segundos');
  aceptado('60,5 entra (redondeo del codificador)', await reservar(T, 60.5));
  rechazado('0 bytes', await reservar(T, 30, 0), 'pesa demasiado');
  rechazado('15728641 bytes', await reservar(T, 30, 15 * MB + 1), 'pesa demasiado');
  aceptado('15 MB justos entran', await reservar(T, 30, 15 * MB));
  rechazado('para otra empresa', await reservar(Otro, 30, MB, T.empresaId), 'No pertenecés a esta empresa');
  rechazado('vencido: el mensaje del candado', await reservar(TV), CANDADO);
  rechazado('una personal en prueba', await reservar(P), 'Tu plan no incluye videos propios');
  rechazado('una personal que paga', await reservar(PP), 'Tu plan no incluye videos propios');
  ok('y ninguna dejó filas', await contar('select count(*)::int n from public.videos where empresa_id = any($1)',
    [[TV.empresaId, P.empresaId, PP.empresaId]]), 0);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · El tope de 100');
  // ═══════════════════════════════════════════════════════════
  const T4 = await trainer('Cien videos');
  await pagar(db, T4.empresaId);
  const ids4 = [];
  let entraron = 0;
  for (let i = 0; i < 100; i++) {
    const r = await reservar(T4, 20, MB);
    if (r.ok) { entraron++; ids4.push(r.valor.rows[0].j.id); }
  }
  ok('entran 100 reservas', entraron, 100);
  rechazado('la 101 no', await reservar(T4, 20, MB), 'Llegaste al tope de videos de tu cuenta');
  ok('soltar una reserva cuyo archivo no está',
    (await valor(T4.uid, 'select public.soltar_videos($1,$2) n', [T4.empresaId, [ids4[0]]])).n, 1);
  const otra4 = await reservar(T4, 20, MB);
  aceptado('y entra otra', otra4);
  rechazado('pero no dos', await reservar(T4, 20, MB), 'Llegaste al tope');
  await db.query("update public.videos set estado_at = now() - interval '4 hours' where id = $1", [ids4[1]]);
  aceptado('una reserva de hace 4 horas se libera sola al reservar', await reservar(T4, 20, MB));
  ok('y ya no está', await estado(ids4[1]), null);
  // Una puesta en un ejercicio nunca se suelta.
  const ej4 = await ejercicio(T4, 'Sentadilla');
  await ponerOk(T4, ej4, ids4[2]);
  ok('soltar una lista no hace nada',
    (await valor(T4.uid, 'select public.soltar_videos($1,$2) n', [T4.empresaId, [ids4[2]]])).n, 0);
  ok('y sigue lista', await estado(ids4[2]), 'listo');
  ok('soltar ids de otra cuenta no hace nada',
    (await valor(T.uid, 'select public.soltar_videos($1,$2) n', [T.empresaId, [ids4[3]]])).n, 0);
  ok('soltar null no rompe', (await valor(T4.uid, 'select public.soltar_videos($1,null) n', [T4.empresaId])).n, 0);
  rechazado('soltar en otra empresa', await como(Otro.uid, 'select public.soltar_videos($1,$2)', [T4.empresaId, [ids4[3]]]),
    'No pertenecés');
  // Soltar libera: pasar a borrando no.
  await db.query("update public.videos set estado = 'borrando' where id = $1", [ids4[3]]);
  const vps = await J(T4.uid, 'select public.videos_por_soltar($1) j', [T4.empresaId]);
  ok('videos_por_soltar trae los soltados, con su ruta', vps.map((x) => x.id), [ids4[3]]);
  ok('con sus claves', claves(vps[0]), ['id', 'ruta']);
  const cupo4 = await J(T4.uid, 'select public.videos_de_la_cuenta($1) j', [T4.empresaId]);
  ok('videos_de_la_cuenta cuenta todas las filas (también la que se está borrando)', cupo4, { usados: 100, tope: 100, tope_plan: 100 });

  // ═══════════════════════════════════════════════════════════
  grupo('4b · En la prueba, menos (revisión del 30/09)');
  // ═══════════════════════════════════════════════════════════
  // Una prueba sin pagar podía dejar 100 × 15 MB = 1,5 GB que nadie borra.
  ok('limite_videos_en_prueba: 20', (await fila('select public.limite_videos_en_prueba() n')).n, 20);
  const TP = await trainer('Prueba gratis');
  let enPrueba = 0;
  for (let i = 0; i < 20; i++) if ((await reservar(TP, 20, MB)).ok) enPrueba++;
  ok('en la prueba entran 20 reservas', enPrueba, 20);
  rechazado('la 21 no, y el mensaje dice por qué', await reservar(TP, 20, MB), 'En la prueba se pueden subir menos videos');
  ok('videos_de_la_cuenta en la prueba: el tope y el del plan', await J(TP.uid, 'select public.videos_de_la_cuenta($1) j', [TP.empresaId]),
    { usados: 20, tope: 20, tope_plan: 100 });
  await pagar(db, TP.empresaId);
  aceptado('al pagar, vuelve el tope del plan', await reservar(TP, 20, MB));
  ok('y videos_de_la_cuenta lo dice', (await J(TP.uid, 'select public.videos_de_la_cuenta($1) j', [TP.empresaId])).tope, 100);
  ok('una personal en prueba sigue en 0 (no 20)', await limEmp(P.empresaId), 0);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Poner un video en un ejercicio (sin Storage)');
  // ═══════════════════════════════════════════════════════════
  const sentadilla = await ejercicio(T, 'Sentadilla con barra', 'https://youtu.be/sentadilla');
  const prensa = await ejercicio(T, 'Prensa');
  const ajeno = await ejercicio(Otro, 'Remo');
  const v5 = await reservarOk(T, 42, 6 * MB);
  const p5 = await ponerOk(T, sentadilla, v5.id);
  ok('devuelve el video', p5, { video: { id: v5.id, bytes: 6 * MB, seg: 42, ruta: v5.ruta } });
  ok('queda listo y en el ejercicio', [await estado(v5.id), await videoDe(sentadilla)], ['listo', v5.id]);
  ok('el link sigue guardado', (await fila('select video_url from public.ejercicios where id=$1', [sentadilla])).video_url,
    'https://youtu.be/sentadilla');
  const v5b = await reservarOk(T, 10, MB);
  rechazado('en un ejercicio de otra empresa', await poner(T, ajeno, v5b.id), 'Ese ejercicio no existe');
  const vOtro = await reservarOk(Otro, 10, MB);
  rechazado('un video de otra empresa', await poner(T, prensa, vOtro.id), 'Ese video no existe');
  rechazado('otra empresa con mis ids', await poner(Otro, prensa, v5b.id, T.empresaId), 'No pertenecés');
  rechazado('un video ya puesto', await poner(T, prensa, v5.id), 'ya está puesto en un ejercicio');
  rechazado('un video que no existe', await poner(T, prensa, crypto.randomUUID()), 'Ese video no existe');
  ok('y nada cambió', [await videoDe(prensa), await estado(v5b.id)], [null, 'subiendo']);
  // Reemplazar: el viejo pasa a borrando.
  await ponerOk(T, sentadilla, v5b.id);
  ok('reemplazar: el nuevo listo, el viejo borrando', [await estado(v5b.id), await estado(v5.id)], ['listo', 'borrando']);
  ok('y el ejercicio apunta al nuevo', await videoDe(sentadilla), v5b.id);
  // Quitar.
  const v5c = await reservarOk(T, 15, MB);
  await ponerOk(T, prensa, v5c.id);
  ok('quitar devuelve video null', await ponerOk(T, prensa, null), { video: null });
  ok('y el video pasa a borrando', [await videoDe(prensa), await estado(v5c.id)], [null, 'borrando']);
  // Un vencido no engancha.
  const T5 = await trainer('Se vence');
  const ej5 = await ejercicio(T5, 'Plancha');
  const v5v = await reservarOk(T5, 20, MB);
  await vencer(db, T5.empresaId);
  rechazado('vencido: no engancha', await poner(T5, ej5, v5v.id), CANDADO);
  ok('y el video sigue subiendo, sin ejercicio', [await estado(v5v.id), await videoDe(ej5)], ['subiendo', null]);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Lo que ve el alumno');
  // ═══════════════════════════════════════════════════════════
  const cliente = async (C, nombre, tel) => (await valor(C.uid,
    'select public.guardar_cliente($1,$2,$3,$4,$5) id', [C.empresaId, nombre, tel, '', null])).id;
  const renglon = (nombre) => ({ nombre, series: 3, reps: '10', carga: '', descanso_seg: 60, nota: '', junto_al_anterior: false });
  const armarRutina = async (C, cli, ejercicios) => J(C.uid, 'select public.guardar_rutina($1,$2::jsonb,null,$3,null) j',
    [C.empresaId, JSON.stringify({ nombre: 'Rutina', notas: '', semanas: null,
      dias: [{ nombre: 'Día A', notas: '', ejercicios: ejercicios.map(renglon) }] }), cli]);
  const publico = async (token) => {
    const r = await anon('select public.rutina_por_token($1) j', [token]);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const porToken = async (token) => {
    const r = await servicio('select public.videos_por_token($1) j', [token]);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const ana = await cliente(T, 'Ana Ruiz', '0981 000 001');
  const rutAna = await armarRutina(T, ana, ['Sentadilla con barra', 'Prensa', 'Sentadilla con barra']);
  const tokenAna = rutAna.token;
  ok('la rutina quedó vigente, con link', [rutAna.estado, typeof tokenAna], ['vigente', 'string']);
  const pub6 = await publico(tokenAna);
  const ejs6 = pub6.rutina.dias[0].ejercicios;
  ok('las claves de cada ejercicio suman clip',
    claves(ejs6[0]), ['carga', 'clip', 'como', 'descanso_seg', 'id', 'junto', 'nombre', 'nota', 'orden', 'reps', 'series', 'video']);
  ok('con video listo: clip {id, bytes, seg}', ejs6[0].clip, { id: v5b.id, bytes: MB, seg: 10 });
  ok('sin video propio: clip null', ejs6[1].clip, null);
  ok('el link sigue viajando aparte', ejs6[0].video, 'https://youtu.be/sentadilla');
  const texto6 = JSON.stringify(pub6);
  ok('sin la ruta ni la empresa', [texto6.includes('.mp4'), texto6.includes(T.empresaId), texto6.includes('ruta')], [false, false, false]);
  const tp6 = await porToken(tokenAna);
  ok('videos_por_token: las rutas de la vigente, sin repetir', tp6, [{ id: v5b.id, ruta: v5b.ruta }]);
  ok('un token inventado: []', await porToken(crypto.randomUUID()), []);
  // Un video que se está subiendo o borrando no sale.
  const v6 = await reservarOk(T, 12, MB);
  ok('uno que se está subiendo no sale', (await porToken(tokenAna)).map((x) => x.id), [v5b.id]);
  await ponerOk(T, prensa, v6.id);
  ok('puesto en Prensa, sale', (await porToken(tokenAna)).map((x) => x.id).sort(), [v5b.id, v6.id].sort());
  ok('y el alumno lo ve', (await publico(tokenAna)).rutina.dias[0].ejercicios[1].clip?.id, v6.id);
  // Apagado, cambiado, archivado.
  await valor(T.uid, 'select public.activar_enlace_rutina($1,$2,false) x', [T.empresaId, ana]);
  ok('link apagado: []', await porToken(tokenAna), []);
  await valor(T.uid, 'select public.activar_enlace_rutina($1,$2,true) x', [T.empresaId, ana]);
  ok('prendido de nuevo: vuelven', (await porToken(tokenAna)).length, 2);
  const tokenNuevo = (await J(T.uid, 'select public.renovar_enlace_rutina($1,$2) j', [T.empresaId, ana])).token;
  ok('link cambiado: el viejo da []', await porToken(tokenAna), []);
  ok('el nuevo anda', (await porToken(tokenNuevo)).length, 2);
  const beto = await cliente(T, 'Beto Paz', '0981 000 002');
  const tokenBeto = (await armarRutina(T, beto, ['Sentadilla con barra'])).token;
  ok('Beto también ve el video', (await porToken(tokenBeto)).map((x) => x.id), [v5b.id]);
  ok('eliminar a Beto lo archiva', (await valor(T.uid, 'select public.eliminar_cliente($1) r', [beto])).r, 'archivado');
  ok('alumno archivado: []', await porToken(tokenBeto), []);
  // 30 días de gracia.
  const T6 = await trainer('Gracia');
  const ej6 = await ejercicio(T6, 'Burpee');
  await ponerOk(T6, ej6, (await reservarOk(T6, 25, MB)).id);
  const cli6 = await cliente(T6, 'Carla', '0981 000 003');
  const token6 = (await armarRutina(T6, cli6, ['Burpee'])).token;
  const vencerHace = (dias) => db.query(
    `update public.suscripciones set periodo_fin = now() - ($2 || ' days')::interval, prueba_fin = now() - ($2 || ' days')::interval
     where empresa_id = $1`, [T6.empresaId, String(dias)]);
  await vencerHace(10);
  ok('vencida hace 10 días: el alumno sigue viendo el video',
    [(await publico(token6)).rutina?.dias[0].ejercicios[0].clip?.seg, (await porToken(token6)).length], [25, 1]);
  await vencerHace(31);
  const pub31 = await publico(token6);
  ok('a los 31 días: renovar y sin rutina', [pub31.renovar, pub31.rutina], [true, null]);
  ok('y videos_por_token: []', await porToken(token6), []);
  ok('los archivos no se borran por vencer', await contar('select count(*)::int n from public.videos where empresa_id=$1', [T6.empresaId]), 1);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · La biblioteca');
  // ═══════════════════════════════════════════════════════════
  const bib = await J(T.uid, 'select public.ejercicios_de($1) j', [T.empresaId]);
  ok('ejercicios_de suma la clave video', claves(bib[0]),
    ['activo', 'grupo', 'id', 'indicaciones', 'nombre', 'usos', 'video', 'video_url']);
  ok('con su video: {id, bytes, seg, ruta}', bib.find((e) => e.id === sentadilla).video,
    { id: v5b.id, bytes: MB, seg: 10, ruta: v5b.ruta });
  const sinVideo = await ejercicio(T, 'Estocadas');
  ok('sin video: null', (await J(T.uid, 'select public.ejercicios_de($1) j', [T.empresaId])).find((e) => e.id === sinVideo).video, null);
  const usadosT = await contar('select count(*)::int n from public.videos where empresa_id=$1', [T.empresaId]);
  ok('videos_de_la_cuenta: todas las filas y el tope', await J(T.uid, 'select public.videos_de_la_cuenta($1) j', [T.empresaId]),
    { usados: usadosT, tope: 20, tope_plan: 100 });
  ok('para un vencido el tope es 0', (await J(TV.uid, 'select public.videos_de_la_cuenta($1) j', [TV.empresaId])).tope, 0);
  rechazado('de otra cuenta no', await como(Otro.uid, 'select public.videos_de_la_cuenta($1)', [T.empresaId]), 'No pertenecés');
  rechazado('ni su biblioteca', await como(Otro.uid, 'select public.ejercicios_de($1)', [T.empresaId]), 'No pertenecés');

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Unir y borrar no dejan videos sueltos');
  // ═══════════════════════════════════════════════════════════
  const T8 = await trainer('Unir');
  const guardarEj = (C, nombre, id) => J(C.uid, 'select public.guardar_ejercicio($1,$2,null,$3,null,true,$4) j',
    [C.empresaId, nombre, '', id]);
  const a8 = await ejercicio(T8, 'Sentadilla');
  const b8 = await ejercicio(T8, 'Sentadila');
  const vb8 = await reservarOk(T8, 30, MB);
  await ponerOk(T8, b8, vb8.id);
  const u8 = await guardarEj(T8, 'Sentadilla', b8);
  ok('renombrar el mal escrito los une', [u8.id, u8.unido], [a8, true]);
  ok('el que queda se lleva el video del otro, y sigue listo', [await videoDe(a8), await estado(vb8.id)], [vb8.id, 'listo']);
  const c8 = await ejercicio(T8, 'Sentadila');
  const vc8 = await reservarOk(T8, 30, MB);
  await ponerOk(T8, c8, vc8.id);
  await guardarEj(T8, 'Sentadilla', c8);
  ok('si los dos tenían: el que queda conserva el suyo', await videoDe(a8), vb8.id);
  ok('y el del que se fue pasa a borrando', await estado(vc8.id), 'borrando');
  const d8 = await ejercicio(T8, 'Burpee');
  const vd8 = await reservarOk(T8, 30, MB);
  await ponerOk(T8, d8, vd8.id);
  aceptado('borrar un ejercicio con video', await como(T8.uid, 'select public.borrar_ejercicio($1,$2)', [T8.empresaId, d8]));
  ok('su video pasa a borrando', await estado(vd8.id), 'borrando');
  const e8 = await ejercicio(T8, 'Plancha');
  const ve8 = await reservarOk(T8, 30, MB);
  await ponerOk(T8, e8, ve8.id);
  await vencer(db, T8.empresaId);
  aceptado('un vencido puede borrar un ejercicio con video (limpiar anda siempre)',
    await como(T8.uid, 'select public.borrar_ejercicio($1,$2)', [T8.empresaId, e8]));
  ok('y su video pasa a borrando', await estado(ve8.id), 'borrando');
  // Los soltados antes ya se fueron solos: cada reserva nueva limpia los que
  // no tienen archivo (sin Storage, ninguno lo tiene).
  ok('reservar ya limpió los soltados de antes', [await estado(vc8.id), await estado(vd8.id)], [null, null]);
  ok('el vencido ve lo que tiene que borrar',
    (await J(T8.uid, 'select public.videos_por_soltar($1) j', [T8.empresaId])).map((x) => x.id), [ve8.id]);
  ok('y lo suelta (sin Storage, ya no está)', (await valor(T8.uid, 'select public.soltar_videos($1,$2) n',
    [T8.empresaId, [vc8.id, vd8.id, ve8.id]])).n, 1);
  rechazado('pero no reserva', await reservar(T8), CANDADO);
  rechazado('ni quita un video (es cargar: UPDATE de ejercicios)', await poner(T8, a8, null), CANDADO);

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Storage: el bucket, las policies y el tamaño real');
  // ═══════════════════════════════════════════════════════════
  // PGlite no trae el esquema storage de Supabase: se arma uno de mentira con
  // lo justo y se vuelve a aplicar la 113, que ahora sí crea el bucket y las
  // policies. Dos veces: es idempotente.
  await db.exec(`
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (
      bucket_id text, name text, metadata jsonb, created_at timestamptz default now());
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, delete on storage.objects to authenticated;
  `);
  await H.aplicarMigracion(db, '113');
  await H.aplicarMigracion(db, '113');
  const bucket = await fila("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'videos'");
  ok('el bucket es privado, de 15 MB y solo MP4',
    [bucket.public, Number(bucket.file_size_limit), bucket.allowed_mime_types], [false, 15728640, ['video/mp4']]);
  ok('hay exactamente las tres policies',
    (await db.query("select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1")).rows
      .map((x) => `${x.policyname}:${x.cmd}`), ['videos_borrar:DELETE', 'videos_subir:INSERT', 'videos_ver:SELECT']);

  const meta = (bytes, mime = 'video/mp4') => JSON.stringify({ size: bytes, mimetype: mime });
  const subir = (C, ruta, bucketId = 'videos', bytes = MB, mime = 'video/mp4') => como(C.uid,
    'insert into storage.objects (bucket_id, name, metadata) values ($1,$2,$3::jsonb)', [bucketId, ruta, meta(bytes, mime)]);
  const borrarObj = (C, ruta) => como(C.uid, "delete from storage.objects where bucket_id = 'videos' and name = $1", [ruta]);
  const hayObjeto = async (ruta) => contar("select count(*)::int n from storage.objects where bucket_id = 'videos' and name = $1", [ruta]);

  const T9 = await trainer('Storage');
  const ej9 = await ejercicio(T9, 'Sentadilla');
  const r9 = await reservarOk(T9, 30, MB);
  aceptado('sube a una ruta reservada', await subir(T9, r9.ruta));
  rechazado('no a una ruta inventada', await subir(T9, `${crypto.randomUUID()}.mp4`), 'row-level security|policy');
  const r9otro = await reservarOk(Otro, 30, MB);
  rechazado('ni a la reserva de otra cuenta', await subir(T9, r9otro.ruta), 'row-level security|policy');
  const r9viejo = await reservarOk(T9, 30, MB);
  await db.query("update public.videos set estado_at = now() - interval '4 hours' where id = $1", [r9viejo.id]);
  rechazado('ni a una reserva de hace 4 horas', await subir(T9, r9viejo.ruta), 'row-level security|policy');
  const T9v = await trainer('Storage vencido');
  const r9v = await reservarOk(T9v, 30, MB);
  await vencer(db, T9v.empresaId);
  rechazado('ni un vencido a su propia reserva', await subir(T9v, r9v.ruta), 'row-level security|policy');
  const r9b = await reservarOk(T9, 30, MB);
  rechazado('ni a otro bucket', await subir(T9, r9b.ruta, 'comprobantes'), 'row-level security|policy');

  const verObj = async (C, ruta) => (await valor(C.uid,
    "select count(*)::int n from storage.objects where bucket_id = 'videos' and name = $1", [ruta])).n;
  ok('el dueño ve su archivo; otra cuenta no', [await verObj(T9, r9.ruta), await verObj(Otro, r9.ruta)], [1, 0]);

  // poner_video_ejercicio con el tamaño y el tipo REALES.
  rechazado('sin archivo: no terminó de subir', await poner(T9, ej9, r9b.id), 'no terminó de subir');
  const r9q = await reservarOk(T9, 30, MB);
  await subir(T9, r9q.ruta, 'videos', MB, 'video/quicktime');
  rechazado('un .mov rotulado quicktime', await poner(T9, ej9, r9q.id), 'tiene que ser MP4');
  const r9g = await reservarOk(T9, 30, MB);
  // El bucket real frena 20 MB; acá se mete por atrás para ver que la base también.
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('videos', $1, $2::jsonb)", [r9g.ruta, meta(20 * MB)]);
  rechazado('un archivo de 20 MB', await poner(T9, ej9, r9g.id), 'pesa demasiado');
  const r9c = await reservarOk(T9, 30, MB);
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('videos', $1, $2::jsonb)", [r9c.ruta, meta(0)]);
  rechazado('un archivo vacío: no terminó de subir', await poner(T9, ej9, r9c.id), 'no terminó de subir');
  ok('ninguno quedó puesto', await videoDe(ej9), null);
  // Declaró 1 MB, subió 3 MB: vale lo que hay en Storage.
  await db.query("update storage.objects set metadata = $2::jsonb where name = $1", [r9.ruta, meta(3 * MB)]);
  const p9 = await ponerOk(T9, ej9, r9.id);
  ok('bien: guarda el tamaño REAL', [p9.video.bytes, Number((await fila('select bytes from public.videos where id=$1', [r9.id])).bytes)],
    [3 * MB, 3 * MB]);
  ok('soltar no suelta si el archivo sigue', (await valor(T9.uid, 'select public.soltar_videos($1,$2) n', [T9.empresaId, [r9q.id]])).n, 0);

  // Borrar desde el navegador: el puesto no, el soltado sí.
  const borrado9 = await borrarObj(T9, r9.ruta);
  ok('un video puesto en un ejercicio no se borra', [borrado9.ok && borrado9.valor.affectedRows, await hayObjeto(r9.ruta)], [0, 1]);
  const r9d = await reservarOk(T9, 30, MB);
  await subir(T9, r9d.ruta);
  await ponerOk(T9, ej9, r9d.id);
  ok('reemplazado, el viejo pasa a borrando', await estado(r9.id), 'borrando');
  const borrado9b = await borrarObj(T9, r9.ruta);
  ok('y ese sí se borra', [borrado9b.ok && borrado9b.valor.affectedRows, await hayObjeto(r9.ruta)], [1, 0]);
  ok('otra cuenta no borra lo mío', [(await borrarObj(Otro, r9q.ruta)).valor?.affectedRows, await hayObjeto(r9q.ruta)], [0, 1]);
  // El circuito del navegador: videos_por_soltar → remove → soltar_videos.
  await borrarObj(T9, r9q.ruta);
  ok('borrado el archivo, soltar sí suelta',
    (await valor(T9.uid, 'select public.soltar_videos($1,$2) n', [T9.empresaId, [r9.id, r9q.id]])).n, 2);
  ok('video_en_storage ve el archivo que hay', (await fila('select public.video_en_storage($1) v', [r9d.ruta])).v, true);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · El reloj de la limpieza');
  // ═══════════════════════════════════════════════════════════
  const T10 = await trainer('Limpieza');
  const ej10 = await ejercicio(T10, 'Remo');
  const soltadoViejo = await reservarOk(T10, 20, MB);
  await subir(T10, soltadoViejo.ruta);
  await ponerOk(T10, ej10, soltadoViejo.id);
  await ponerOk(T10, ej10, null);
  const soltadoNuevo = await reservarOk(T10, 20, MB);
  await subir(T10, soltadoNuevo.ruta);
  await ponerOk(T10, ej10, soltadoNuevo.id);
  await ponerOk(T10, ej10, null);
  await db.query("update public.videos set estado_at = now() - interval '11 minutes' where id = $1", [soltadoViejo.id]);
  const reservaVieja = await reservarOk(T10, 20, MB);
  await subir(T10, reservaVieja.ruta);
  await db.query("update public.videos set estado_at = now() - interval '4 hours' where id = $1", [reservaVieja.id]);
  const reservaNueva = await reservarOk(T10, 20, MB);
  const huerfano = `${crypto.randomUUID()}.mp4`;
  const huerfanoNuevo = `${crypto.randomUUID()}.mp4`;
  await db.query(`insert into storage.objects (bucket_id, name, metadata, created_at)
    values ('videos', $1, $3::jsonb, now() - interval '4 hours'), ('videos', $2, $3::jsonb, now())`, [huerfano, huerfanoNuevo, meta(MB)]);
  const limpiar = await servicio('select public.videos_para_limpiar() j');
  const lista10 = limpiar.ok ? limpiar.valor.rows[0].j : [];
  const esta = (r) => lista10.includes(r);
  ok('trae el soltado hace más de 10 min, la reserva de más de 3 h y el huérfano viejo',
    [esta(soltadoViejo.ruta), esta(reservaVieja.ruta), esta(huerfano)], [true, true, true]);
  ok('y no el soltado recién, la reserva nueva, el huérfano nuevo ni uno listo',
    [esta(soltadoNuevo.ruta), esta(reservaNueva.ruta), esta(huerfanoNuevo), esta(r9d.ruta)], [false, false, false, false]);
  // La ruta del cron borra los archivos; después, las filas.
  await db.query("delete from storage.objects where bucket_id = 'videos' and name = any($1)", [lista10]);
  const limpiados = await servicio('select public.videos_limpiados($1) n', [[...lista10, r9d.ruta]]);
  ok('videos_limpiados borra solo esas filas (no la lista)', limpiados.ok && limpiados.valor.rows[0].n, 2);
  ok('quedan el soltado recién, la reserva nueva y el listo',
    [await estado(soltadoViejo.id), await estado(reservaVieja.id), await estado(soltadoNuevo.id), await estado(reservaNueva.id), await estado(r9d.id)],
    [null, null, 'borrando', 'subiendo', 'listo']);
  ok('una fila cuyo archivo sigue no se borra',
    (await servicio('select public.videos_limpiados($1) n', [[r9d.ruta]])).valor?.rows[0].n, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('11 · Borrar la cuenta se lleva los videos');
  // ═══════════════════════════════════════════════════════════
  const T11 = await trainer('Se va');
  const ej11 = await ejercicio(T11, 'Sentadilla');
  const v11 = await reservarOk(T11, 20, MB);
  await subir(T11, v11.ruta);
  await ponerOk(T11, ej11, v11.id);
  const v11b = await reservarOk(T11, 20, MB);
  const cli11 = await cliente(T11, 'Dora', '0981 000 011');
  await armarRutina(T11, cli11, ['Sentadilla']);
  const rutas11 = await servicio('select public.videos_a_borrar($1) j', [T11.uid]);
  ok('videos_a_borrar: las rutas de la cuenta del trainer', (rutas11.valor?.rows[0].j ?? []).sort(), [v11.ruta, v11b.ruta].sort());
  const E12 = await trainer('Con equipo');
  await db.query('update public.suscripciones set tope_vendedores = 1 where empresa_id = $1', [E12.empresaId]);
  await H.sumarMiembro(db, E12.empresaId, 'ayudante@fuerza.com', 'vendedor');
  await reservarOk(E12, 20, MB);
  ok('de una cuenta con más gente, nada', (await servicio('select public.videos_a_borrar($1) j', [E12.uid])).valor?.rows[0].j, []);
  aceptado('borrar_datos_de_usuario con videos y ejercicios con video',
    await servicio('select public.borrar_datos_de_usuario($1) j', [T11.uid]));
  ok('no quedó ninguna fila de esa cuenta',
    [await contar('select count(*)::int n from public.videos where empresa_id=$1', [T11.empresaId]),
      await contar('select count(*)::int n from public.ejercicios where empresa_id=$1', [T11.empresaId])], [0, 0]);

  // ═══════════════════════════════════════════════════════════
  grupo('12 · El candado y la 113 dos veces');
  // ═══════════════════════════════════════════════════════════
  // crearBase la aplicó una vez y el grupo 9, dos más. Una más acá.
  await H.aplicarMigracion(db, '113');
  const trg = (await db.query(
    "select tgname, tgtype from pg_trigger where tgname in ('cuenta_activa_videos', 'ejercicio_suelta_video')")).rows;
  const candado = trg.filter((x) => x.tgname === 'cuenta_activa_videos');
  ok('cuenta_activa_videos existe una vez', candado.length, 1);
  // tgtype: 1 fila, 2 antes, 4 insert, 8 delete, 16 update.
  ok('y es solo BEFORE INSERT por fila', candado[0] && [candado[0].tgtype & 1, candado[0].tgtype & 2, candado[0].tgtype & 4,
    candado[0].tgtype & 8, candado[0].tgtype & 16], [1, 2, 4, 0, 0]);
  const suelta = trg.filter((x) => x.tgname === 'ejercicio_suelta_video');
  ok('ejercicio_suelta_video existe una vez, AFTER UPDATE y DELETE',
    [suelta.length, suelta[0] && [suelta[0].tgtype & 2, suelta[0].tgtype & 8, suelta[0].tgtype & 16]], [1, [0, 8, 16]]);
  ok('la clave del ejercicio al video existe una vez',
    await contar("select count(*)::int n from pg_constraint where conname = 'ejercicios_video_fk'"), 1);
  const NUEVAS = ['limite_segundos_video', 'limite_bytes_video', 'limite_videos_en_prueba', 'soltar_video_de_ejercicio', 'video_en_storage',
    'puede_subir_video', 'video_visible', 'video_subible', 'video_borrable', 'reservar_video', 'poner_video_ejercicio',
    'soltar_videos', 'videos_por_soltar', 'videos_de_la_cuenta', 'videos_por_token', 'videos_para_limpiar',
    'videos_limpiados', 'videos_a_borrar', 'ejercicios_de', 'guardar_ejercicio', 'rutina_por_token',
    'limites_plan', 'limites_de_empresa'];
  const veces = (await db.query(
    `select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = any($1) group by p.proname`, [NUEVAS])).rows;
  ok('cada función existe una sola vez', NUEVAS.filter((f) => (veces.find((v) => v.proname === f)?.n ?? 0) !== 1), []);
  const sinRuta = (await db.query(
    `select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = any($1) and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`, [NUEVAS])).rows;
  ok('todas las security definer tienen search_path', sinRuta.map((x) => x.proname), []);
  const abiertas = (await db.query(
    `select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = any($1) and p.prosecdef
       and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`, [NUEVAS])).rows.map((x) => x.proname);
  ok('para anon, solo rutina_por_token', abiertas, ['rutina_por_token']);
  ok('después de repetirla, los datos siguen', [await estado(r9d.id), await videoDe(ej9)], ['listo', r9d.id]);
  rechazado('y un vencido sigue sin reservar', await reservar(TV), CANDADO);
  aceptado('y uno en prueba sí', await reservar(T));

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE LOS VIDEOS PROPIOS FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE LOS VIDEOS PROPIOS PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
