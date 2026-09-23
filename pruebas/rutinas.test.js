/**
 * Rutinas, medidas y progreso del personal trainer (migración 098).
 *
 * Matías: el trainer necesita rutinas de verdad —ejercicio, series,
 * repeticiones, carga, descanso, nota—, pasárselas al cliente por un link, y
 * anotar peso, medidas y cómo subieron las cargas.
 *
 * LO QUE IMPORTA, EN ESTE ORDEN
 *
 *   · que el link del cliente muestre la rutina y NADA más: ni el teléfono,
 *     ni el apellido, ni la lesión, ni medidas, ni borradores; y que un link
 *     malo, apagado, cambiado o de un cliente archivado no se distinga de
 *     uno inventado;
 *   · que las medidas (datos de salud) sean solo del dueño o de un admin, y
 *     solo con el sí del cliente;
 *   · que ninguna función deje a una empresa tocar lo de otra;
 *   · que guardar no pierda nada: los ids se conservan (los tildes del
 *     celular y el historial de cargas dependen de eso) y dos celulares
 *     editando a la vez no se pisan;
 *   · que copiar entre personas no arrastre el nombre ni las notas de la
 *     otra;
 *   · y que la cuenta vencida deje apagar los links, y muestre la rutina
 *     solo los 30 días de gracia que decidió Matías.
 *
 * La 099 (una persona por teléfono, copias en preparación, y los datos de
 * salud al archivar) se prueba en los grupos 22 a 24, y en lo que cambió
 * del grupo 19.
 */
const H = require('./ayuda-db.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let fallos = 0;
let corridas = 0;

function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

// jsonb guarda las claves en su propio orden (primero las más cortas), que
// no significa nada: se comparan ordenadas. El orden de las listas sí cuenta.
const ordenado = (x) => (Array.isArray(x) ? x.map(ordenado)
  : x && typeof x === 'object' && !(x instanceof Date)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordenado(x[k])]))
    : x);

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(ordenado(real));
  const b = JSON.stringify(ordenado(esperado));
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a.length > 90 ? a.slice(0, 87) + '...' : a}`);
}

function rechazado(nombre, res, frag) {
  corridas++;
  if (res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      NO fue rechazada`); return; }
  if (frag && !new RegExp(frag, 'i').test(res.error)) {
    fallos++; console.log(`  ✗ ${nombre}\n      otro motivo: ${res.error}`); return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 64)}`);
}

function aceptado(nombre, res) {
  corridas++;
  if (!res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      fue rechazada: ${res.error}`); return; }
  console.log(`  ✓ ${nombre}`);
}

const claves = (o) => Object.keys(o ?? {}).sort();

(async () => {
  // La base como la de producción ANTES de la 098. Supabase le da a `anon`
  // y a `authenticated` todos los permisos sobre cada tabla y cada función
  // nueva de `public` (pg_default_acl, leído en producción: arwdDxtm y X).
  // El arnés no lo imita: en PGlite una tabla nueva nace cerrada, y el
  // grupo 1 pasaría aunque la 098 no tuviera ningún `revoke`. Con esto, si
  // alguien borra uno, el grupo 1 lo nota.
  const db = await H.crearBase({ hasta: '097' });
  await db.exec(`
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
  for (const f of H.migraciones().filter((m) => m >= '098')) await H.aplicarMigracion(db, f.slice(0, 3));

  const T = await H.montarEmpresa(db, { email: 'lucas@fuerza.com', nombre: 'Entrená con Lucas', rubro: 'entrenamiento' });
  const Otro = await H.montarEmpresa(db, { email: 'otro@gym.com', nombre: 'Otro trainer', rubro: 'entrenamiento' });
  // La que cobra en el mostrador: es del equipo, pero no es admin.
  // Desde la 102 un profe o un trainer prueban Básico, que es de una sola
  // persona: el ayudante es una silla paga (048), como la compraría él.
  await db.query('update public.suscripciones set tope_vendedores = 1 where empresa_id = $1', [T.empresaId]);
  const recepcion = await H.sumarMiembro(db, T.empresaId, 'recepcion@fuerza.com', 'vendedor');
  const E = T.empresaId;

  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(`${sql} → ${r.error}`);
    return r.valor.rows[0];
  };
  const J = async (uid, sql, args = []) => (await valor(uid, sql, args)).j;
  const fila = async (q, args = []) => (await db.query(q, args)).rows[0];
  const cuenta = async (q, args = []) => Number((await fila(q, args)).n);
  const cliente = async (quien, nombre, tel = '', notas = '') => (await valor(quien.uid,
    'select public.guardar_cliente($1,$2,$3,$4,$5) id', [quien.empresaId, nombre, tel, notas, null])).id;

  const { hoy, dow } = await fila(
    'select public.hoy_empresa($1)::text as hoy, extract(dow from public.hoy_empresa($1))::int as dow', [E]);
  const dia = async (n) => (await fila('select ($1::date + $2::int)::text d', [hoy, n])).d;

  const guardar = (uid, datos, { id = null, cli = null, version = null, empresa = E } = {}) =>
    como(uid, 'select public.guardar_rutina($1, $2::jsonb, $3, $4, $5) j',
      [empresa, JSON.stringify(datos), id, cli, version]);
  const guardarOk = async (uid, datos, opc) => {
    const r = await guardar(uid, datos, opc);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const leer = (uid, id, empresa = E) => J(uid, 'select public.rutina($1,$2) j', [empresa, id]);
  const copiar = (uid, origen, cli = null, conNotas = true, empresa = E) =>
    como(uid, 'select public.copiar_rutina($1,$2,$3,$4) j', [empresa, origen, cli, conNotas]);
  const copiarOk = async (...a) => {
    const r = await copiar(...a);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const publico = async (token) => {
    const r = await H.intentarComo(db, 'anon', null, () =>
      db.query('select public.rutina_por_token($1) j', [token]));
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const NADA = '{"existe":false}';
  const anotar = (uid, cli, fecha, datos, consiente = false, id = null, empresa = E) =>
    como(uid, 'select public.anotar_medicion($1,$2,$3,$4::jsonb,$5,$6) j',
      [empresa, cli, fecha, JSON.stringify(datos), consiente, id]);
  const carga = (uid, renglon, c, reps = null, empresa = E) =>
    como(uid, 'select public.cambiar_carga($1,$2,$3,$4) j', [empresa, renglon, c, reps]);
  const ejercicio = (uid, nombre, { grupo = null, ind = '', video = null, activo = true, id = null, empresa = E } = {}) =>
    como(uid, 'select public.guardar_ejercicio($1,$2,$3,$4,$5,$6,$7) j', [empresa, nombre, grupo, ind, video, activo, id]);
  const renglon = (r, nombre) => r.dias.flatMap((d) => d.ejercicios).find((e) => e.nombre === nombre);

  // Lo que el editor manda al guardar, armado desde lo que leyó.
  const aDatos = (r) => ({
    nombre: r.nombre,
    notas: r.notas,
    semanas: r.semanas,
    dias: r.dias.map((d) => ({
      id: d.id,
      nombre: d.nombre,
      notas: d.notas,
      ejercicios: d.ejercicios.map((e) => ({
        id: e.id, ejercicio_id: e.ejercicio_id, series: e.series, reps: e.reps, carga: e.carga,
        descanso_seg: e.descanso_seg, nota: e.nota, junto_al_anterior: e.junto_al_anterior,
      })),
    })),
  });

  const LESION = 'Rodilla derecha operada: sin saltos ni sentadilla profunda.';
  const ana = await cliente(T, 'Ana Ruiz', '0981 000 001', LESION);
  const beto = await cliente(T, 'Beto Paz', '0981000002', 'Hombro izquierdo: nada por encima de la cabeza.');
  const deOtro = await cliente(Otro, 'Zoe Otra', '0981999999', '');

  const rutinaAna = {
    nombre: 'Rutina de Ana',
    notas: 'Tomá agua entre series. Cuidado con la rodilla, Ana.',
    semanas: 6,
    dias: [
      { nombre: 'Día A · Piernas', notas: 'Entrada en calor: 5 minutos de bici.', ejercicios: [
        { nombre: 'Sentadilla con barra', series: 4, reps: '8-10', carga: '40 kg', descanso_seg: 90, nota: 'Sin pasar los 90°, Ana.', junto_al_anterior: false },
        { nombre: 'Prensa', series: 3, reps: '12', carga: '100 kg', descanso_seg: 60, nota: '', junto_al_anterior: false },
        { nombre: 'Estocadas', series: 3, reps: '10 c/lado', carga: '', descanso_seg: null, nota: '', junto_al_anterior: true },
      ] },
      { nombre: 'Día B · Torso', notas: '', ejercicios: [
        { nombre: 'Press banca', series: 4, reps: '10', carga: '25 lb', descanso_seg: 90, nota: 'Codos a 45°.', junto_al_anterior: false },
        { nombre: 'Remo con mancuerna', series: 3, reps: '12', carga: 'banda roja', descanso_seg: 60, nota: '', junto_al_anterior: false },
      ] },
    ],
  };

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Las tablas nuevas no se leen ni se escriben directo');
  // ═══════════════════════════════════════════════════════════
  const TABLAS = ['ejercicios', 'rutinas', 'rutina_dias', 'rutina_ejercicios', 'rutina_enlaces',
    'fichas_entreno', 'mediciones', 'cargas_historial'];
  for (const t of TABLAS) {
    rechazado(`anon no lee ${t}`,
      await H.intentarComo(db, 'anon', null, () => db.query(`select * from public.${t}`)), 'permission denied');
    rechazado(`ni alguien con sesión lee ${t} directo`,
      await como(T.uid, `select * from public.${t}`), 'permission denied');
  }
  rechazado('ni escribe directo en la biblioteca',
    await como(T.uid, "insert into public.ejercicios (empresa_id, nombre) values ($1, 'Trampa')", [E]),
    'permission denied');
  rechazado('anon no llama a las funciones del trainer',
    await H.intentarComo(db, 'anon', null, () => db.query('select public.rutinas_de($1)', [E])),
    'permission denied');
  // Los ayudantes son security definer y no preguntan por la empresa: abiertos,
  // cualquiera leería una rutina ajena con `rutina_json` o crearía links.
  const AYUDANTES = [
    ["clave_ejercicio('x')", []], ["uuid_o_null('x')", []], ['cliente_entrenando($1)', [ana]],
    ['rutina_json($1, true)', [ana]], ["ejercicio_por_nombre($1, 'x')", [E]],
    ['destino_nueva_rutina($1, $2)', [E, ana]], ['asegurar_enlace_rutina($1, $2)', [E, ana]],
    ["sin_nombre_de_persona('x', 'y')", []],
  ];
  for (const [f, a] of AYUDANTES) {
    rechazado(`nadie de afuera llama a ${f.split('(')[0]}`, await como(T.uid, `select public.${f}`, a), 'permission denied');
    rechazado(`ni anon a ${f.split('(')[0]}`,
      await H.intentarComo(db, 'anon', null, () => db.query(`select public.${f}`, a)), 'permission denied');
  }

  // ═══════════════════════════════════════════════════════════
  grupo('2 · La biblioteca de ejercicios');
  // ═══════════════════════════════════════════════════════════
  const r2 = await ejercicio(T.uid, 'Sentadilla con barra',
    { grupo: 'piernas', ind: 'Espalda recta, rodillas afuera.', video: 'https://youtu.be/sentadilla' });
  ok('se crea un ejercicio', claves(r2.valor?.rows[0].j), ['id', 'unido']);
  const sentadilla = r2.valor.rows[0].j.id;
  ok('y no se unió con nada', r2.valor.rows[0].j.unido, false);
  rechazado('el mismo nombre en mayúsculas y con espacios de más',
    await ejercicio(T.uid, '  SENTADILLA   CON BARRA '), 'Ya tenés un ejercicio que se llama así');
  rechazado('o con una tilde de más', await ejercicio(T.uid, 'Sentadílla con bárra'), 'Ya tenés un ejercicio');
  rechazado('un video que no es https', await ejercicio(T.uid, 'Burpee', { video: 'http://youtu.be/x' }), 'https://');
  rechazado('ni un texto suelto', await ejercicio(T.uid, 'Burpee', { video: 'youtube.com/burpee' }), 'https://');
  rechazado('un grupo que no existe', await ejercicio(T.uid, 'Burpee', { grupo: 'brazo' }), 'Ese grupo de ejercicios no existe');
  rechazado('sin nombre', await ejercicio(T.uid, '   '), 'le falta el nombre');
  const biblio = await J(T.uid, 'select public.ejercicios_de($1) j', [E]);
  ok('la biblioteca lo lista con sus datos', claves(biblio[0]),
    ['activo', 'grupo', 'id', 'indicaciones', 'nombre', 'usos', 'video_url']);
  ok('todavía sin usos', biblio.find((e) => e.id === sentadilla).usos, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Plantilla, vigente y próxima: una de cada una');
  // ═══════════════════════════════════════════════════════════
  const plantilla = await guardarOk(T.uid, {
    nombre: 'Principiante 3 días', notas: '', semanas: 4,
    dias: [{ nombre: 'Full body', notas: '', ejercicios: [
      { nombre: 'Sentadilla con barra', series: 3, reps: '12', carga: '', descanso_seg: 60, nota: '', junto_al_anterior: false },
    ] }],
  });
  ok('sin cliente es una plantilla', [plantilla.estado, plantilla.token, plantilla.version], ['plantilla', null, 1]);

  const g3 = await guardarOk(T.uid, rutinaAna, { cli: ana });
  const anaV = g3.id;
  ok('la primera de Ana queda vigente', g3.estado, 'vigente');
  ok('y ya trae el link para mandar por WhatsApp', typeof g3.token === 'string' && g3.token.length === 36, true);
  const tokenAna = g3.token;
  ok('arranca hoy', (await leer(T.uid, anaV)).desde, hoy);
  ok('la sentadilla por nombre usó la de la biblioteca',
    await cuenta("select count(*)::int n from public.ejercicios where empresa_id=$1 and clave='sentadilla con barra'", [E]), 1);

  const g3b = await guardarOk(T.uid, { ...rutinaAna, nombre: 'Próxima de Ana' }, { cli: ana });
  const anaB = g3b.id;
  ok('la segunda, con una vigente, es la próxima (borrador)', [g3b.estado, g3b.token], ['borrador', null]);
  rechazado('una tercera no: ya hay una en preparación',
    await guardar(T.uid, rutinaAna, { cli: ana }), 'ya tiene una próxima rutina en preparación');
  rechazado('para un cliente de otra cuenta, no',
    await guardar(T.uid, rutinaAna, { cli: deOtro }), 'Ese cliente no es de esta cuenta');

  let choco = '';
  try {
    await db.query("insert into public.rutinas (empresa_id, cliente_id, estado, nombre, desde) values ($1,$2,'vigente','Otra',current_date)", [E, ana]);
  } catch (e) { choco = e.message; }
  ok('la base misma no deja dos vigentes', /rutinas_una_vigente/.test(choco), true);
  choco = '';
  try {
    await db.query("insert into public.rutinas (empresa_id, cliente_id, estado, nombre) values ($1,$2,'borrador','Otra')", [E, ana]);
  } catch (e) { choco = e.message; }
  ok('ni dos borradores', /rutinas_un_borrador/.test(choco), true);

  const unDia = (ejs = []) => ({ nombre: 'Día', notas: '', ejercicios: ejs });
  const ej = (o = {}) => ({ nombre: 'Plancha', series: 3, reps: '45 s', carga: '', descanso_seg: 30, nota: '', junto_al_anterior: false, ...o });
  rechazado('sin días', await guardar(T.uid, { nombre: 'X', notas: '', semanas: null, dias: [] }), 'entre 1 y 10 días');
  rechazado('con 11 días',
    await guardar(T.uid, { nombre: 'X', notas: '', semanas: null, dias: Array.from({ length: 11 }, () => unDia()) }), 'entre 1 y 10 días');
  rechazado('con 31 ejercicios en un día',
    await guardar(T.uid, { nombre: 'X', notas: '', semanas: null, dias: [unDia(Array.from({ length: 31 }, () => ej()))] }), 'como máximo 30');
  rechazado('un ejercicio sin nombre ni id',
    await guardar(T.uid, { nombre: 'X', notas: '', semanas: null, dias: [unDia([ej({ nombre: '  ' })])] }), 'le falta el nombre');
  rechazado('sin nombre de rutina', await guardar(T.uid, { nombre: ' ', notas: '', semanas: null, dias: [unDia()] }), 'nombre a la rutina');
  rechazado('una carga que no entra', await guardar(T.uid,
    { nombre: 'X', notas: '', semanas: null, dias: [unDia([ej({ carga: '25 lb por lado con la barra olímpica' })])] }), 'hasta 24 letras');
  rechazado('21 series', await guardar(T.uid, { nombre: 'X', notas: '', semanas: null, dias: [unDia([ej({ series: 21 })])] }), 'de 1 a 20');
  rechazado('semanas de más', await guardar(T.uid, { nombre: 'X', notas: '', semanas: 60, dias: [unDia()] }), 'de 1 a 52');
  ok('ninguno de esos dejó nada a medias',
    await cuenta("select count(*)::int n from public.rutinas where empresa_id=$1 and nombre='X'", [E]), 0);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Guardar conserva los ids de días y ejercicios');
  // ═══════════════════════════════════════════════════════════
  const r4 = await leer(T.uid, anaV);
  const [dA, dB] = r4.dias;
  const [sent, prensa, estoc] = dA.ejercicios;
  const [press, remo] = dB.ejercicios;
  const d4 = aDatos(r4);
  // El día B pasa primero; la estocada se muda al B y queda primera (con la
  // marca de superserie, que el primero de un día no puede tener); la
  // prensa se saca; entra una plancha nueva.
  const nuevoB = { ...d4.dias[1], ejercicios: [
    { ...d4.dias[0].ejercicios[2], junto_al_anterior: true },
    ...d4.dias[1].ejercicios,
    { nombre: 'Plancha', series: 3, reps: '45 s', carga: '', descanso_seg: 30, nota: '', junto_al_anterior: false },
  ] };
  const nuevoA = { ...d4.dias[0], ejercicios: [d4.dias[0].ejercicios[0]] };
  const g4 = await guardarOk(T.uid, { ...d4, dias: [nuevoB, nuevoA] }, { id: anaV, version: r4.version });
  const r4b = await leer(T.uid, anaV);
  ok('los días conservan su id', r4b.dias.map((d) => d.id), [dB.id, dA.id]);
  ok('y cambiaron de orden', r4b.dias.map((d) => d.orden), [1, 2]);
  ok('el día B tiene lo que se le mandó, en orden', r4b.dias[0].ejercicios.map((e) => e.nombre),
    ['Estocadas', 'Press banca', 'Remo con mancuerna', 'Plancha']);
  ok('los renglones que quedaron conservan su id (la estocada se mudó de día con el suyo)',
    r4b.dias[0].ejercicios.slice(0, 3).map((e) => e.id), [estoc.id, press.id, remo.id]);
  ok('la sentadilla también', r4b.dias[1].ejercicios.map((e) => e.id), [sent.id]);
  ok('el primero de un día no va «junto al anterior»', r4b.dias[0].ejercicios[0].junto_al_anterior, false);
  ok('la plancha es un renglón nuevo',
    [sent.id, prensa.id, estoc.id, press.id, remo.id].includes(r4b.dias[0].ejercicios[3].id), false);
  ok('la prensa que no llegó se borró de la rutina',
    await cuenta('select count(*)::int n from public.rutina_ejercicios where id=$1', [prensa.id]), 0);
  ok('pero sigue en la biblioteca',
    await cuenta("select count(*)::int n from public.ejercicios where empresa_id=$1 and nombre='Prensa'", [E]), 1);
  ok('la versión sube', [g4.version, r4b.version], [2, 2]);
  ok('lo que ve el cliente cambió de fecha', r4b.updated_at !== r4.updated_at, true);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Dos celulares editando a la vez');
  // ═══════════════════════════════════════════════════════════
  rechazado('guardar con una versión vieja frena',
    await guardar(T.uid, aDatos(r4b), { id: anaV, version: 1 }), 'Alguien cambió esta rutina');
  ok('y no tocó nada', (await leer(T.uid, anaV)).version, 2);
  const g5 = await guardarOk(T.uid, aDatos(r4b), { id: anaV, version: 2 });
  ok('con la versión al día, pasa', g5.version, 3);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Un ejercicio por nombre entra una sola vez');
  // ═══════════════════════════════════════════════════════════
  const variantes = ['Sentadilla búlgara', 'SENTADILLA BULGARA', '  sentadilla   búlgara ', 'Sentadílla Búlgara'];
  const p6 = await guardarOk(T.uid, {
    nombre: 'Piernas', notas: '', semanas: null,
    dias: [{ nombre: 'Único', notas: '', ejercicios: variantes.map((n) => ej({ nombre: n })) }],
  });
  ok('cuatro formas de escribirlo, un solo ejercicio',
    await cuenta("select count(*)::int n from public.ejercicios where empresa_id=$1 and clave='sentadilla bulgara'", [E]), 1);
  const r6 = await leer(T.uid, p6.id);
  ok('y los cuatro renglones apuntan a él', new Set(r6.dias[0].ejercicios.map((e) => e.ejercicio_id)).size, 1);
  ok('guardado como se escribió la primera vez', r6.dias[0].ejercicios[0].nombre, 'Sentadilla búlgara');

  const bulgara = r6.dias[0].ejercicios[0].ejercicio_id;
  await valor(T.uid, 'select public.guardar_ejercicio($1,$2,$3,$4,$5,$6,$7) j', [E, 'Sentadilla búlgara', null, '', null, false, bulgara]);
  ok('apagado', (await fila('select activo from public.ejercicios where id=$1', [bulgara])).activo, false);
  await guardarOk(T.uid, { nombre: 'Otra de piernas', notas: '', semanas: null,
    dias: [{ nombre: 'Único', notas: '', ejercicios: [ej({ nombre: 'sentadilla bulgara' })] }] });
  ok('usarlo de nuevo por nombre lo prende', (await fila('select activo from public.ejercicios where id=$1', [bulgara])).activo, true);

  const ajeno = (await valor(Otro.uid, 'select public.guardar_ejercicio($1,$2) j', [Otro.empresaId, 'Peso muerto'])).j.id;
  rechazado('un ejercicio de otra cuenta, por id, no existe para esta',
    await guardar(T.uid, { nombre: 'X', notas: '', semanas: null, dias: [unDia([{ ...ej(), nombre: undefined, ejercicio_id: ajeno }])] }),
    'Ese ejercicio no existe');
  rechazado('ni un id roto', await guardar(T.uid,
    { nombre: 'X', notas: '', semanas: null, dias: [unDia([{ ...ej(), ejercicio_id: 'no-es-un-id' }])] }), 'Ese ejercicio no existe');

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Subir la carga, y la historia de cómo subió');
  // ═══════════════════════════════════════════════════════════
  const hist = () => cuenta('select count(*)::int n from public.cargas_historial where cliente_id=$1', [ana]);
  const sentAna = renglon(await leer(T.uid, anaV), 'Sentadilla con barra');
  const vAntes = (await leer(T.uid, anaV)).version;
  const c1 = await carga(T.uid, sentAna.id, '45 kg');
  ok('se cambia la carga desde la agenda', c1.valor?.rows[0].j, { carga: '45 kg', reps: '8-10' });
  ok('sin tocar las repeticiones si no se mandan', renglon(await leer(T.uid, anaV), 'Sentadilla con barra').reps, '8-10');
  const h1 = await fila('select * from public.cargas_historial where cliente_id=$1 order by created_at desc limit 1', [ana]);
  ok('queda en la historia: de 40 a 45', [h1.carga_antes, h1.carga_despues, h1.reps_antes, h1.reps_despues, h1.ejercicio_id],
    ['40 kg', '45 kg', '8-10', '8-10', sentadilla]);
  ok('con la fecha de hoy', h1.fecha.toISOString().slice(0, 10), hoy);
  ok('y la rutina suma una versión: un editor abierto se entera', (await leer(T.uid, anaV)).version, vAntes + 1);
  ok('también las repeticiones', (await carga(T.uid, sentAna.id, '45 kg', '6-8')).valor.rows[0].j, { carga: '45 kg', reps: '6-8' });
  const n7 = await hist();
  ok('lo mismo otra vez no anota nada', ((await carga(T.uid, sentAna.id, '45 kg', '6-8')).ok && await hist()) === n7, true);
  rechazado('una carga larga', await carga(T.uid, sentAna.id, 'la barra olímpica más dos discos'), 'hasta 24 letras');
  // Dos celulares a la vez (el editor guarda, la agenda sube la carga) no se
  // pueden probar en PGlite, que tiene una sola conexión. Lo que sí se puede
  // mirar es que las dos tomen los candados en el mismo orden —primero la
  // rutina, después el renglón—: al revés, PostgreSQL corta a una con
  // «deadlock detected».
  const cuerpo = async (firma) => (await fila(`select pg_get_functiondef('public.${firma}'::regprocedure) d`)).d;
  const candado = (def, tabla) => def.search(new RegExp(`from public\\.${tabla}\\s+where[^;]*for update`));
  const defCarga = await cuerpo('cambiar_carga(uuid,uuid,text,text)');
  const defGuardar = await cuerpo('guardar_rutina(uuid,jsonb,uuid,uuid,integer)');
  ok('cambiar_carga bloquea la rutina antes que el renglón',
    [candado(defCarga, 'rutinas') >= 0, candado(defCarga, 'rutinas') < candado(defCarga, 'rutina_ejercicios')], [true, true]);
  ok('guardar_rutina también empieza por la rutina (y no bloquea renglones antes)',
    [candado(defGuardar, 'rutinas') >= 0, candado(defGuardar, 'rutina_ejercicios')], [true, -1]);

  const borrAna = await leer(T.uid, anaB);
  rechazado('en la próxima (borrador) no: no se está entrenando',
    await carga(T.uid, borrAna.dias[0].ejercicios[0].id, '50 kg'), 'Solo se cambia la carga de la rutina vigente');

  // Editar la vigente en el editor también es subir la carga.
  const r7 = await leer(T.uid, anaV);
  const d7 = aDatos(r7);
  d7.dias[0].ejercicios.find((e) => e.id === press.id).carga = '30 lb';
  await guardarOk(T.uid, d7, { id: anaV, version: r7.version });
  const h2 = await fila('select * from public.cargas_historial where cliente_id=$1 order by created_at desc limit 1', [ana]);
  ok('editar la vigente también deja historia', [h2.carga_antes, h2.carga_despues, h2.rutina_id], ['25 lb', '30 lb', anaV]);
  const n7b = await hist();
  const d7b = aDatos(borrAna);
  d7b.dias[0].ejercicios[0].carga = '99 kg';
  await guardarOk(T.uid, d7b, { id: anaB });
  ok('editar la próxima no (nadie la está entrenando)', await hist(), n7b);
  // Cambiar un ejercicio por otro no es subir la carga de nada.
  const r7c = await leer(T.uid, anaV);
  const d7c = aDatos(r7c);
  const plancha7 = d7c.dias[0].ejercicios.find((e) => e.id === r7c.dias[0].ejercicios[3].id);
  delete plancha7.ejercicio_id; plancha7.nombre = 'Plancha lateral'; plancha7.carga = '5 kg';
  await guardarOk(T.uid, d7c, { id: anaV });
  ok('cambiar el ejercicio por otro no se cuenta como avance', await hist(), n7b);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Unir dos ejercicios, borrar uno que no se usa');
  // ═══════════════════════════════════════════════════════════
  const sentadila = (await valor(T.uid, 'select public.guardar_ejercicio($1,$2) j', [E, 'Sentadila'])).j.id;
  const rp = await leer(T.uid, plantilla.id);
  const dp = aDatos(rp);
  dp.dias[0].ejercicios.push({ ...ej(), ejercicio_id: sentadila, nombre: undefined });
  await guardarOk(T.uid, dp, { id: plantilla.id });
  // Una carga anotada con el nombre mal escrito (como la dejaría la fase 2).
  await db.query(`insert into public.cargas_historial (empresa_id, cliente_id, ejercicio_id, fecha, carga_antes, carga_despues)
                  values ($1,$2,$3,$4,'20 kg','25 kg')`, [E, ana, sentadila, await dia(-20)]);
  rechazado('la recepción no une ejercicios',
    await ejercicio(recepcion, 'Sentadilla con barra', { id: sentadila }), 'Unir dos ejercicios es del dueño');
  const u8 = await ejercicio(T.uid, 'sentadilla con barra', { id: sentadila, ind: 'otra', video: 'https://youtu.be/otro' });
  ok('renombrar al nombre de otro los une', u8.valor?.rows[0].j, { id: sentadilla, unido: true });
  ok('el mal escrito ya no existe', await cuenta('select count(*)::int n from public.ejercicios where id=$1', [sentadila]), 0);
  ok('la plantilla ahora dice Sentadilla con barra',
    (await leer(T.uid, plantilla.id)).dias[0].ejercicios.map((e) => e.nombre), ['Sentadilla con barra', 'Sentadilla con barra']);
  ok('la historia se mudó con él',
    await cuenta('select count(*)::int n from public.cargas_historial where ejercicio_id=$1', [sentadilla]), 3);
  const sent8 = await fila('select indicaciones, video_url from public.ejercicios where id=$1', [sentadilla]);
  ok('el que queda conserva su «cómo se hace» y su video', [sent8.indicaciones, sent8.video_url],
    ['Espalda recta, rodillas afuera.', 'https://youtu.be/sentadilla']);
  const ren8 = await ejercicio(T.uid, 'Prensa 45°', { id: (await fila("select id from public.ejercicios where empresa_id=$1 and nombre='Prensa'", [E])).id });
  ok('renombrar sin chocar no une', ren8.valor?.rows[0].j.unido, false);
  rechazado('lo que está en una rutina no se borra', await como(T.uid, 'select public.borrar_ejercicio($1,$2)', [E, sentadilla]),
    'apagalo en vez de borrarlo');
  const burpee = (await valor(T.uid, 'select public.guardar_ejercicio($1,$2) j', [E, 'Burpee'])).j.id;
  rechazado('la recepción no borra ejercicios', await como(recepcion, 'select public.borrar_ejercicio($1,$2)', [E, burpee]),
    'Borrar un ejercicio es del dueño');
  aceptado('lo que nunca se usó, sí', await como(T.uid, 'select public.borrar_ejercicio($1,$2)', [E, burpee]));
  ok('la biblioteca cuenta dónde se usa',
    (await J(T.uid, 'select public.ejercicios_de($1) j', [E])).find((e) => e.id === sentadilla).usos,
    await cuenta('select count(*)::int n from public.rutina_ejercicios where ejercicio_id=$1', [sentadilla]));

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Copiar entre personas no arrastra a la otra');
  // ═══════════════════════════════════════════════════════════
  const c9 = await copiarOk(T.uid, anaV, beto, false);
  ok('Beto, que no tenía, la recibe vigente y con su link', [c9.estado, typeof c9.token], ['vigente', 'string']);
  const betoV = c9.id;
  const tokenBeto = c9.token;
  const rb = await leer(T.uid, betoV);
  ok('sin el nombre de Ana: «Rutina de Ana» → «Rutina»', rb.nombre, 'Rutina');
  ok('«Copiar sin las notas» vacía las de la rutina, los días y los ejercicios',
    [rb.notas, ...rb.dias.map((d) => d.notas), ...rb.dias.flatMap((d) => d.ejercicios.map((e) => e.nota))].every((x) => x === ''), true);
  // La de Ana la nombraba en el nombre, en las notas y en la nota de un
  // ejercicio («Sin pasar los 90°, Ana.»).
  ok('en toda la rutina de Beto no queda ni una vez «Ana»', /\bAna\b/i.test(JSON.stringify(rb)), false);
  ok('los mismos ejercicios, las mismas cargas',
    rb.dias.map((d) => d.ejercicios.map((e) => `${e.nombre}|${e.carga}`)),
    (await leer(T.uid, anaV)).dias.map((d) => d.ejercicios.map((e) => `${e.nombre}|${e.carga}`)));
  ok('y sabe de dónde salió', (await fila('select origen_id from public.rutinas where id=$1', [betoV])).origen_id, anaV);

  const aPlantilla = async (nombre) => {
    const rbA = await leer(T.uid, anaB);
    await guardarOk(T.uid, { ...aDatos(rbA), nombre }, { id: anaB });
    return (await leer(T.uid, (await copiarOk(T.uid, anaB)).id)).nombre;
  };
  ok('«Semana ANA fuerte» → «Semana fuerte» (sin romper «Semana»)', await aPlantilla('Semana ANA fuerte'), 'Semana fuerte');
  ok('«Fuerza base Ana» → «Fuerza base»', await aPlantilla('Fuerza base Ana'), 'Fuerza base');
  ok('«Fuerza de Ana» → «Rutina»: no queda colgando un «de»', await aPlantilla('Fuerza de Ana'), 'Rutina');
  ok('«ana» sola → «Rutina»', await aPlantilla('ana'), 'Rutina');
  // El nombre ENTERO de la persona, no solo el de pila: con dos «Ana» en el
  // negocio, el trainer escribe el apellido en la rutina.
  ok('«Rutina de Ana Ruiz» → «Rutina»: el apellido tampoco viaja', await aPlantilla('Rutina de Ana Ruiz'), 'Rutina');
  ok('«Ana Ruiz · fuerza» → «fuerza», sin el separador colgando', await aPlantilla('Ana Ruiz · fuerza'), 'fuerza');
  ok('«Fuerza (Ruiz)» → «Fuerza», sin paréntesis vacíos', await aPlantilla('Fuerza (Ruiz)'), 'Fuerza');
  ok('«Rutina de Ana · piernas» → «Rutina · piernas»', await aPlantilla('Rutina de Ana · piernas'), 'Rutina · piernas');
  ok('«Mariana fuerte» no se toca: «Ana» no rompe otra palabra', await aPlantilla('Mariana fuerte'), 'Mariana fuerte');

  // Nombres con tildes, con dos nombres de pila y con un espacio duro
  // (U+00A0: así llega un nombre pegado desde los contactos o WhatsApp).
  const mj = await cliente(T, 'María José Pérez', '0981000020');
  const pedro = await cliente(T, 'Pedro Gómez', '0981000021');
  const mjV = (await guardarOk(T.uid, { ...rutinaAna, nombre: 'Rutina de María José Pérez',
    notas: 'José: cuidá la espalda.' }, { cli: mj })).id;
  const cPedro = await copiarOk(T.uid, mjV, pedro, false);
  const pubPedro = await publico(cPedro.token);
  ok('copiada a Pedro: «Rutina de María José Pérez» → «Rutina»', pubPedro.rutina.nombre, 'Rutina');
  ok('en el link de Pedro no queda ninguna palabra del nombre de María José',
    ['María', 'José', 'Pérez'].filter((p) => JSON.stringify(pubPedro).includes(p)), []);
  const aPlantillaDe = async (id, nombre) => {
    await guardarOk(T.uid, { ...aDatos(await leer(T.uid, id)), nombre }, { id });
    return (await leer(T.uid, (await copiarOk(T.uid, id)).id)).nombre;
  };
  ok('«Treino da María» → «Rutina»: tampoco queda colgando un «da»', await aPlantillaDe(mjV, 'Treino da María'), 'Rutina');
  ok('«Treino da María José · Pérez» → «Treino»', await aPlantillaDe(mjV, 'Treino da María José · Pérez'), 'Treino');
  ok('las mayúsculas y las tildes no la esconden: «RUTINA DE JOSE»', await aPlantillaDe(mjV, 'RUTINA DE JOSE'), 'Rutina');
  for (const c of [mj, pedro]) await valor(T.uid, 'select public.eliminar_cliente($1) r', [c]);
  const conNotas = await leer(T.uid, (await copiarOk(T.uid, anaV)).id);
  ok('guardar como plantilla CON notas las conserva', conNotas.notas, rutinaAna.notas);
  ok('pero el nombre igual sale limpio', conNotas.nombre, 'Rutina');

  aceptado('la próxima (borrador) la borra cualquiera del equipo',
    await como(recepcion, 'select public.borrar_rutina($1,$2)', [E, anaB]));
  const c9b = await copiarOk(T.uid, anaV, ana);
  const anaB2 = c9b.id;
  const rAnaB2 = await leer(T.uid, anaB2);
  ok('«Armar la próxima» (misma persona) queda en preparación', [c9b.estado, c9b.token], ['borrador', null]);
  ok('y conserva todo: nombre y notas', [rAnaB2.nombre, rAnaB2.notas], ['Rutina de Ana', rutinaAna.notas]);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Activar la próxima, terminar, borrar');
  // ═══════════════════════════════════════════════════════════
  const a10 = await J(T.uid, 'select public.activar_rutina($1,$2) j', [E, anaB2]);
  ok('activar devuelve el mismo link de siempre', a10, { id: anaB2, token: tokenAna });
  const vieja = await fila('select estado, hasta::text from public.rutinas where id=$1', [anaV]);
  ok('la que estaba pasa a la historia, hasta hoy', [vieja.estado, vieja.hasta], ['anterior', hoy]);
  const nueva = await leer(T.uid, anaB2);
  ok('la próxima queda vigente desde hoy', [nueva.estado, nueva.desde, nueva.hasta], ['vigente', hoy, null]);
  rechazado('activar una que no está en preparación',
    await como(T.uid, 'select public.activar_rutina($1,$2)', [E, anaB2]), 'Solo se puede activar una rutina en preparación');
  rechazado('una anterior no se edita', await guardar(T.uid, aDatos(await leer(T.uid, anaV)), { id: anaV }), 'Esa rutina ya terminó');
  rechazado('ni se borra', await como(T.uid, 'select public.borrar_rutina($1,$2)', [E, anaV]), 'no se borran: quedan como historia');
  rechazado('la vigente tampoco se borra', await como(T.uid, 'select public.borrar_rutina($1,$2)', [E, anaB2]), 'no se borran');
  aceptado('terminar la vigente', await como(T.uid, 'select public.terminar_rutina($1,$2)', [E, anaB2]));
  rechazado('terminarla otra vez', await como(T.uid, 'select public.terminar_rutina($1,$2)', [E, anaB2]), 'no está vigente');
  const sinRutina = await publico(tokenAna);
  ok('sin vigente, el link sigue andando y dice que se está preparando',
    [sinRutina.existe, sinRutina.rutina, sinRutina.actualizada], [true, null, null]);
  rechazado('la recepción no borra una plantilla',
    await como(recepcion, 'select public.borrar_rutina($1,$2)', [E, p6.id]), 'Borrar una plantilla es del dueño');
  aceptado('el dueño sí', await como(T.uid, 'select public.borrar_rutina($1,$2)', [E, p6.id]));
  const anaV3 = (await copiarOk(T.uid, anaV, ana)).id;
  ok('rearmar desde una anterior de la misma persona la deja vigente', (await leer(T.uid, anaV3)).estado, 'vigente');
  const carpeta10 = await J(T.uid, 'select public.rutinas_del_cliente($1,$2) j', [E, ana]);
  ok('la carpeta muestra las dos anteriores, la más nueva primero', carpeta10.anteriores.map((a) => a.id), [anaB2, anaV]);

  // «Terminar» con la próxima ya armada: queda sin vigente y con un
  // borrador. La pantalla muestra «Sin rutina», y sus tres botones tienen
  // que andar: la nueva nace vigente (el contrato: «vigente si no tiene vigente»).
  const uma = await cliente(T, 'Uma Terminada', '0981000022');
  const simple = (nombre) => ({ nombre, notas: '', semanas: null, dias: [unDia([ej()])] });
  const umaV = (await guardarOk(T.uid, simple('Uno'), { cli: uma })).id;
  const umaB = (await guardarOk(T.uid, simple('Dos'), { cli: uma })).id;
  await valor(T.uid, 'select public.terminar_rutina($1,$2) x', [E, umaV]);
  const g10 = await guardar(T.uid, simple('Tres'), { cli: uma });
  ok('sin vigente y con la próxima armada, «Armar desde cero» la deja vigente', g10.ok && g10.valor.rows[0].j.estado, 'vigente');
  ok('y la próxima sigue ahí, en preparación', (await fila('select estado from public.rutinas where id=$1', [umaB])).estado, 'borrador');
  if (g10.ok) await valor(T.uid, 'select public.terminar_rutina($1,$2) x', [E, g10.valor.rows[0].j.id]);
  const c10 = await copiar(T.uid, plantilla.id, uma);
  ok('lo mismo con «Usar una plantilla»', c10.ok && c10.valor.rows[0].j.estado, 'vigente');
  rechazado('con la vigente y la próxima, una tercera no', await guardar(T.uid, simple('Cuatro'), { cli: uma }),
    'ya tiene una próxima rutina en preparación');
  await valor(T.uid, 'select public.eliminar_cliente($1) r', [uma]);

  // ═══════════════════════════════════════════════════════════
  grupo('11 · El link del cliente: lo justo, y nada más');
  // ═══════════════════════════════════════════════════════════
  await guardarOk(T.uid, { nombre: 'Secreta próxima', notas: '', semanas: null, dias: [unDia([ej()])] }, { cli: ana });
  const pub = await publico(tokenAna);
  ok('anon lo abre sin sesión', pub.existe, true);
  ok('las claves de arriba son exactamente estas', claves(pub), ['actualizada', 'existe', 'negocio', 'nombre', 'renovar', 'rutina']);
  ok('las de la rutina', claves(pub.rutina), ['desde', 'dias', 'nombre', 'notas']);
  ok('las de cada día', claves(pub.rutina.dias[0]), ['ejercicios', 'nombre', 'notas', 'orden']);
  ok('las de cada ejercicio', claves(pub.rutina.dias[0].ejercicios[0]),
    ['carga', 'como', 'descanso_seg', 'id', 'junto', 'nombre', 'nota', 'orden', 'reps', 'series', 'video']);
  ok('solo el nombre de pila', pub.nombre, 'Ana');
  // `guardar_cliente` solo recorta espacios comunes: un nombre pegado desde
  // los contactos trae un espacio duro, un tabulador o un salto de línea, y
  // cortar solo en « » dejaría ver el apellido.
  for (const [nombre, tel, pila, apellido] of [
    ['Nico Paz Rojas', '0981000031', 'Nico', 'Paz'],
    ['Olga\tSosa', '0981000032', 'Olga', 'Sosa'],
    ['Pía\nVera', '0981000033', 'Pía', 'Vera'],
  ]) {
    const id = await cliente(T, nombre, tel);
    const p = await publico((await copiarOk(T.uid, plantilla.id, id)).token);
    ok(`«${JSON.stringify(nombre).slice(1, -1)}» → «${pila}», sin el apellido`, [p.nombre, JSON.stringify(p).includes(apellido)], [pila, false]);
    await valor(T.uid, 'select public.eliminar_cliente($1) r', [id]);
  }
  ok('el negocio', pub.negocio, 'Entrená con Lucas');
  ok('no hay que renovar', pub.renovar, false);
  ok('la vigente, con su fecha', [pub.rutina.nombre, pub.rutina.desde], ['Rutina de Ana', hoy]);
  const texto = JSON.stringify(pub);
  ok('ni el apellido', texto.includes('Ruiz'), false);
  ok('ni el teléfono', /0981/.test(texto), false);
  ok('ni la lesión', texto.includes('Rodilla derecha'), false);
  ok('ni la próxima en preparación', texto.includes('Secreta'), false);
  const rV3 = await leer(T.uid, anaV3);
  const idsInternos = [anaV3, ana, E, ...rV3.dias.map((d) => d.id), ...rV3.dias.flatMap((d) => d.ejercicios.map((e) => e.ejercicio_id))];
  ok('ni ids internos (rutina, cliente, empresa, días, biblioteca)', idsInternos.filter((id) => texto.includes(id)), []);
  const idsViejos = (await leer(T.uid, anaV)).dias.flatMap((d) => d.ejercicios.map((e) => e.id));
  ok('ni renglones de las anteriores', idsViejos.filter((id) => texto.includes(id)), []);
  ok('los ids de renglón sí: son los tildes del celular',
    pub.rutina.dias.flatMap((d) => d.ejercicios.map((e) => e.id)), rV3.dias.flatMap((d) => d.ejercicios.map((e) => e.id)));
  ok('el «cómo se hace» y el video salen de la biblioteca',
    [renglon(pub.rutina, 'Sentadilla con barra').como, renglon(pub.rutina, 'Sentadilla con barra').video],
    ['Espalda recta, rodillas afuera.', 'https://youtu.be/sentadilla']);
  ok('las claves de la base no se cuelan al link', /cliente|empresa|ejercicio_id|telefono|notas_/.test(Object.keys(pub).join()), false);

  const malo = await publico(crypto.randomUUID());
  ok('un token inventado', JSON.stringify(malo), NADA);
  await valor(T.uid, 'select public.activar_enlace_rutina($1,$2,false) as x', [E, ana]);
  ok('un link apagado: idéntico', JSON.stringify(await publico(tokenAna)), NADA);
  await valor(T.uid, 'select public.activar_enlace_rutina($1,$2,true) as x', [E, ana]);
  ok('prendido de nuevo, anda', (await publico(tokenAna)).existe, true);
  const ren11 = await J(T.uid, 'select public.renovar_enlace_rutina($1,$2) j', [E, ana]);
  ok('cambiar el link da otro token, prendido', [ren11.token !== tokenAna, ren11.activo], [true, true]);
  ok('el viejo: idéntico a uno inventado', JSON.stringify(await publico(tokenAna)), NADA);
  ok('el nuevo anda', (await publico(ren11.token)).nombre, 'Ana');
  const tokenAna2 = ren11.token;
  ok('enlace_rutina devuelve el de ahora', await J(T.uid, 'select public.enlace_rutina($1,$2) j', [E, ana]),
    { token: tokenAna2, activo: true });

  ok('Beto tiene rutina y link', (await publico(tokenBeto)).existe, true);
  ok('eliminar a Beto, que tiene rutinas, lo archiva', (await valor(T.uid, 'select public.eliminar_cliente($1) r', [beto])).r, 'archivado');
  ok('y su link: idéntico a uno inventado', JSON.stringify(await publico(tokenBeto)), NADA);
  ok('su rutina sigue ahí', await cuenta('select count(*)::int n from public.rutinas where cliente_id=$1', [beto]), 1);

  await valor(T.uid, "select public.cambiar_rubro($1,'clases') j", [E]);
  ok('si el negocio deja de ser de entrenamiento: idéntico', JSON.stringify(await publico(tokenAna2)), NADA);
  await valor(T.uid, "select public.cambiar_rubro($1,'entrenamiento') j", [E]);
  ok('vuelve a ser trainer: anda', (await publico(tokenAna2)).existe, true);

  // ═══════════════════════════════════════════════════════════
  grupo('12 · Cuenta vencida: 30 días de gracia, y los links se pueden apagar');
  // ═══════════════════════════════════════════════════════════
  const vencer = (sql) => db.query(`update public.suscripciones set ${sql} where empresa_id=$1`, [E]);
  await vencer("periodo_fin = now() - interval '10 days'");
  ok('vencida', (await fila('select public.puede_cargar($1) p', [E])).p, false);
  const g12 = await publico(tokenAna2);
  ok('a los 10 días, el cliente sigue viendo su rutina', [g12.renovar, g12.rutina?.nombre], [false, 'Rutina de Ana']);
  rechazado('pero el trainer no carga nada', await guardar(T.uid, rutinaAna, { id: anaV3 }), 'Se te terminó la prueba');
  rechazado('ni cambia una carga', await carga(T.uid, rV3.dias[0].ejercicios[0].id, '1 kg'), 'Se te terminó la prueba');
  const activos12 = await cuenta('select count(*)::int n from public.rutina_enlaces where empresa_id=$1 and activo', [E]);
  rechazado('apagar todos es del dueño o un admin',
    await como(recepcion, 'select public.apagar_enlaces_rutina($1) n', [E]), 'Apagar todos los links es del dueño');
  const ap = await como(T.uid, 'select public.apagar_enlaces_rutina($1) n', [E]);
  ok('con la cuenta vencida, apaga todos sus links y dice cuántos', ap.ok && ap.valor.rows[0].n, activos12);
  ok('ya no queda ninguno prendido', await cuenta('select count(*)::int n from public.rutina_enlaces where empresa_id=$1 and activo', [E]), 0);
  aceptado('prender uno también anda vencida',
    await como(T.uid, 'select public.activar_enlace_rutina($1,$2,true)', [E, ana]));
  const ren12 = await como(T.uid, 'select public.renovar_enlace_rutina($1,$2) j', [E, ana]);
  aceptado('y cambiarlo', ren12);
  const tokenAna3 = ren12.valor.rows[0].j.token;
  await vencer("periodo_fin = now() - interval '31 days'");
  ok('a los 31 días: hay que renovar, sin rutina', await publico(tokenAna3),
    { existe: true, negocio: 'Entrená con Lucas', nombre: 'Ana', renovar: true, actualizada: null, rutina: null });
  await vencer("estado = 'vencida', periodo_fin = null");
  ok('vencida sin fecha de fin: también renovar', (await publico(tokenAna3)).renovar, true);
  await vencer("estado = 'prueba', periodo_fin = now() + interval '14 days'");
  ok('pagó: vuelve la rutina', [(await publico(tokenAna3)).renovar, (await publico(tokenAna3)).rutina !== null], [false, true]);

  // ═══════════════════════════════════════════════════════════
  grupo('13 · Las medidas: solo el dueño, y con el sí del cliente');
  // ═══════════════════════════════════════════════════════════
  rechazado('la recepción no anota medidas',
    await anotar(recepcion, ana, hoy, { peso_kg: 80 }, true), 'Las medidas y el progreso son del dueño');
  rechazado('sin el sí del cliente, no',
    await anotar(T.uid, ana, hoy, { peso_kg: 80 }), 'confirmá que el cliente está de acuerdo');
  const m1 = await anotar(T.uid, ana, hoy, { peso_kg: 80, altura_cm: 165, nota: 'a la mañana' }, true);
  ok('con el sí, se anota', m1.ok && [m1.valor.rows[0].j.fusionada, m1.valor.rows[0].j.cambios], [false, []]);
  const ficha = await fila('select consiente_medidas_at, consiente_por from public.fichas_entreno where cliente_id=$1', [ana]);
  ok('el sí queda en la ficha, con quién lo registró', [ficha.consiente_medidas_at !== null, ficha.consiente_por], [true, T.uid]);
  const m2 = await anotar(T.uid, ana, hoy, { peso_kg: 79.5, cintura_cm: '80', nota: 'a la tarde', basura: 1 });
  ok('el mismo día se completa, no se duplica (y ya no pide el sí)', m2.ok && m2.valor.rows[0].j.fusionada, true);
  ok('y dice qué cambió de lo que ya tenía valor', m2.valor.rows[0].j.cambios, [
    { campo: 'peso_kg', antes: 80, despues: 79.5 },
    { campo: 'nota', antes: 'a la mañana', despues: 'a la tarde' },
  ]);
  ok('mismo id', m2.valor.rows[0].j.id, m1.valor.rows[0].j.id);
  const m2f = await fila('select peso_kg::float p, altura_cm::float a, cintura_cm::float c, nota from public.mediciones where id=$1', [m1.valor.rows[0].j.id]);
  ok('lo que no llegó quedó (la altura)', [m2f.p, m2f.a, m2f.c, m2f.nota], [79.5, 165, 80, 'a la tarde']);
  ok('un control por día', await cuenta('select count(*)::int n from public.mediciones where cliente_id=$1', [ana]), 1);
  rechazado('una fecha futura', await anotar(T.uid, ana, await dia(1), { peso_kg: 80 }), 'no puede ser futura');
  rechazado('una fecha de antes del 2000', await anotar(T.uid, ana, '1999-12-31', { peso_kg: 80 }), 'Esa fecha no es válida');
  rechazado('sin ninguna medida', await anotar(T.uid, ana, await dia(-1), {}), 'Anotá al menos una medida');
  rechazado('solo una nota tampoco', await anotar(T.uid, ana, await dia(-1), { nota: 'nada' }), 'Anotá al menos una medida');
  rechazado('la grasa sin su método', await anotar(T.uid, ana, await dia(-1), { grasa_pct: 22 }), 'va con su método');
  rechazado('una medida que no es un número', await anotar(T.uid, ana, await dia(-1), { peso_kg: 'ochenta' }), 'tiene que ser un número');
  rechazado('un número que ni entra en la columna', await anotar(T.uid, ana, await dia(-1), { peso_kg: 8000 }), 'fuera de rango');
  const m3 = await anotar(T.uid, ana, await dia(-1), { peso_kg: '80,5', grasa_pct: 22, grasa_metodo: 'balanza' });
  ok('con coma, como lo escribe cualquiera', m3.ok && Number((await fila('select peso_kg from public.mediciones where id=$1', [m3.valor.rows[0].j.id])).peso_kg), 80.5);
  const m3id = m3.valor.rows[0].j.id;
  rechazado('mover un control a un día que ya tiene otro',
    await anotar(T.uid, ana, hoy, { peso_kg: 80.5 }, false, m3id), 'Ya hay un control ese día: editá ese');
  aceptado('a un día libre, sí', await anotar(T.uid, ana, await dia(-2), { peso_kg: 80.4 }, false, m3id));
  const m3b = await anotar(T.uid, ana, null, { cuello_cm: 34 }, false, m3id);
  ok('editar sin mandar la fecha no la mueve a hoy',
    m3b.ok && (await fila('select fecha::text f from public.mediciones where id=$1', [m3id])).f, await dia(-2));
  ok('editar no es completar', [m3b.valor.rows[0].j.fusionada, m3b.valor.rows[0].j.cambios], [false, []]);
  rechazado('la recepción no borra un control', await como(recepcion, 'select public.borrar_medicion($1,$2)', [E, m3id]), 'dueño o de un administrador');
  const m4 = (await anotar(T.uid, ana, await dia(-3), { peso_kg: 81 })).valor.rows[0].j.id;
  aceptado('el dueño sí', await como(T.uid, 'select public.borrar_medicion($1,$2)', [E, m4]));
  rechazado('otra vez: ya no existe', await como(T.uid, 'select public.borrar_medicion($1,$2)', [E, m4]), 'Ese control no existe');

  // ═══════════════════════════════════════════════════════════
  grupo('14 · Los rangos de las medidas, en el borde');
  // ═══════════════════════════════════════════════════════════
  // Los mismos números que el contrato y los check de la 098 (y que
  // src/lib/medidas.ts). El mínimo y el máximo pasan; una décima afuera, no.
  const RANGOS = [
    ['peso_kg', 20, 300], ['altura_cm', 100, 230], ['cintura_cm', 40, 200], ['cadera_cm', 50, 200],
    ['pecho_cm', 50, 180], ['brazo_cm', 15, 75], ['muslo_cm', 30, 110], ['grasa_pct', 3, 70],
    ['pantorrilla_cm', 20, 70], ['cuello_cm', 25, 65],
  ];
  const rango = await cliente(T, 'Rango Prueba', '0981555000');
  const fRango = await dia(-50);
  const con = (k, v) => (k === 'grasa_pct' ? { grasa_pct: v, grasa_metodo: 'plicometro' } : { [k]: v });
  let errCheck = '';
  let primero = true;
  for (const [k, min, max] of RANGOS) {
    const abajo = Math.round((min - 0.1) * 10) / 10;
    const arriba = Math.round((max + 0.1) * 10) / 10;
    aceptado(`${k}: ${min} (el mínimo) pasa`, await anotar(T.uid, rango, fRango, con(k, min), primero));
    primero = false;
    aceptado(`${k}: ${max} (el máximo) pasa`, await anotar(T.uid, rango, fRango, con(k, max)));
    const r1 = await anotar(T.uid, rango, fRango, con(k, abajo));
    rechazado(`${k}: ${abajo} no`, r1, 'violates check constraint "mediciones_');
    rechazado(`${k}: ${arriba} no`, await anotar(T.uid, rango, fRango, con(k, arriba)), 'violates check constraint "mediciones_');
    errCheck = r1.error ?? errCheck;
  }
  // La pantalla tiene que avisar con los mismos números que frena la base,
  // y la persona leer «fuera de rango» y no la jerga del check. Las dos
  // librerías se leen compiladas (probar:calculos las compila en
  // .compilado/). Si no están, la prueba FALLA: saltearla en silencio
  // dejaría pasar en verde una pantalla y una base desalineadas.
  const libMedidas = path.join(__dirname, '..', '.compilado', 'medidas.js');
  const libErrores = path.join(__dirname, '..', '.compilado', 'errores.js');
  ok('existe .compilado/medidas.js (compilar src/lib/medidas.ts antes)', fs.existsSync(libMedidas), true);
  ok('existe .compilado/errores.js (compilar src/lib/errores.ts antes)', fs.existsSync(libErrores), true);
  if (fs.existsSync(libMedidas)) {
    const { MEDIDAS } = require(libMedidas);
    ok('src/lib/medidas.ts avisa con los mismos rangos que frena la base',
      MEDIDAS.map((m) => [m.clave, m.minimo, m.maximo]).sort(), RANGOS.map((r) => [...r]).sort());
  }
  if (fs.existsSync(libErrores)) {
    const { mensajeDeError } = require(libErrores);
    ok('la persona lee «fuera de rango», no la jerga del check', mensajeDeError({ message: errCheck }),
      'Ese valor está fuera de rango. Revisalo.');
  }

  // ═══════════════════════════════════════════════════════════
  grupo('15 · El progreso de una persona');
  // ═══════════════════════════════════════════════════════════
  const prog = await J(T.uid, 'select public.progreso_de($1,$2) j', [E, ana]);
  ok('las claves', claves(prog), ['cargas', 'cliente', 'consiente_medidas_at', 'mediciones', 'rutina_vigente']);
  ok('el cliente', claves(prog.cliente), ['id', 'nombre', 'telefono']);
  ok('cada control, con todas sus medidas', claves(prog.mediciones[0]), ['altura_cm', 'brazo_cm', 'cadera_cm', 'cintura_cm',
    'cuello_cm', 'fecha', 'grasa_metodo', 'grasa_pct', 'id', 'muslo_cm', 'nota', 'pantorrilla_cm', 'pecho_cm', 'peso_kg']);
  ok('en orden de fecha, del primero al último', prog.mediciones.map((m) => m.fecha), [await dia(-2), hoy]);
  ok('la rutina vigente', prog.rutina_vigente, { nombre: 'Rutina de Ana', desde: hoy });
  const cSent = prog.cargas.find((c) => c.ejercicio_id === sentadilla);
  ok('cómo subió la sentadilla, en orden de fecha', cSent.cambios.map((c) => `${c.fecha} ${c.carga_antes}→${c.carga_despues}`),
    [`${await dia(-20)} 20 kg→25 kg`, `${hoy} 40 kg→45 kg`, `${hoy} 45 kg→45 kg`]);
  ok('cada cambio con sus claves', claves(cSent.cambios[0]), ['carga_antes', 'carga_despues', 'fecha', 'reps_antes', 'reps_despues']);
  ok('agrupado por ejercicio', prog.cargas.map((c) => c.nombre), ['Press banca', 'Sentadilla con barra']);
  rechazado('la recepción no ve el progreso', await como(recepcion, 'select public.progreso_de($1,$2)', [E, ana]), 'dueño o de un administrador');

  // ═══════════════════════════════════════════════════════════
  grupo('16 · «Para atender» mira solo a quien entrena');
  // ═══════════════════════════════════════════════════════════
  const caro = await cliente(T, 'Caro Sosa', '0981000003');
  const dani = await cliente(T, 'Dani Vera', '0981000004');
  const fede = await cliente(T, 'Fede Luna', '0981000005');
  const ins = await como(T.uid, 'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) j',
    [E, caro, [dow], '07:00', '08:00', hoy, hoy, null, 250000, true, 'transferencia', 'Plan de hoy', null]);
  aceptado('Caro se agenda hoy, con su plan', ins);
  await guardarOk(T.uid, { nombre: 'Fede fuerza', notas: '', semanas: null, dias: [unDia([ej()])] }, { cli: fede });
  aceptado('Fede tiene un control de hace 40 días', await anotar(T.uid, fede, await dia(-40), { peso_kg: 90 }, true));
  // La de Ana: arrancó hace una semana y se dijo «cambiarla en 1 semana».
  const r16 = await leer(T.uid, anaV3);
  await guardarOk(T.uid, { ...aDatos(r16), semanas: 1, desde: await dia(-7) }, { id: anaV3 });
  const lista = await J(T.uid, 'select public.rutinas_de($1) j', [E]);
  ok('las claves', claves(lista), ['clientes', 'para_atender', 'plantillas']);
  ok('los que entrenan, por nombre (Beto está archivado, Dani no entrena)', lista.clientes.map((c) => c.nombre),
    ['Ana Ruiz', 'Caro Sosa', 'Fede Luna']);
  ok('cada uno con sus claves', claves(lista.clientes[0]),
    ['borrador_id', 'enlace', 'entrenando', 'id', 'nombre', 'telefono', 'ultima_medicion', 'vigente']);
  const anaL = lista.clientes.find((c) => c.id === ana);
  ok('la vigente de Ana y cuándo cambiarla', [anaL.vigente.id, anaL.vigente.desde, anaL.vigente.cambia_el],
    [anaV3, await dia(-7), hoy]);
  ok('su vigente con sus claves', claves(anaL.vigente), ['cambia_el', 'desde', 'id', 'nombre', 'semanas', 'updated_at']);
  ok('su próxima en preparación y su link', [typeof anaL.borrador_id, anaL.enlace], ['string', { token: tokenAna3, activo: true }]);
  ok('para atender', lista.para_atender.map((p) => `${p.nombre}:${p.motivo}`),
    ['Ana Ruiz:cambiar', 'Caro Sosa:sin_rutina', 'Fede Luna:medir']);
  ok('con sus claves', claves(lista.para_atender[0]), ['cliente_id', 'motivo', 'nombre']);
  const todos = await J(T.uid, 'select public.rutinas_de($1, true) j', [E]);
  ok('«Ver todos» suma a los que no entrenan', todos.clientes.find((c) => c.id === dani)?.entrenando, false);
  ok('pero no los pone en «para atender»', todos.para_atender.some((p) => p.cliente_id === dani), false);
  const listaRec = await J(recepcion, 'select public.rutinas_de($1) j', [E]);
  ok('la recepción no ve cuándo se midió nadie', listaRec.clientes.map((c) => c.ultima_medicion), [null, null, null]);
  ok('ni «medir» en para atender', listaRec.para_atender.map((p) => p.motivo), ['cambiar', 'sin_rutina']);
  ok('el dueño sí', lista.clientes.find((c) => c.id === fede).ultima_medicion, await dia(-40));
  const plant = lista.plantillas.find((p) => p.id === plantilla.id);
  ok('las plantillas, con cuántos días y ejercicios', [plant.dias, plant.ejercicios, claves(plant)],
    [1, 2, ['dias', 'ejercicios', 'id', 'nombre', 'semanas', 'updated_at']]);

  // Cada camino de «entrenando», por separado. Caro tiene a la vez el plan y
  // el turno de hoy, y Dani no tiene nada: con ellos dos solos la prueba
  // pasaría aunque se rompiera un camino entero, o el «no cancelado», o el
  // estado del plan. Es la regla que evita que «sin rutina» liste para
  // siempre a cada ex cliente.
  const turno = (cli, nombre, dias, estado = 'pendiente', horas = 0) => db.query(
    `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina,
                                        cliente_nombre, cliente_id, estado)
     select empresa_id, profesional_id, producto_id,
            inicia + make_interval(days => $2::int, hours => $5::int),
            termina + make_interval(days => $2::int, hours => $5::int), $3, $4, $6
     from public.turnos_reserva where cliente_id = $1 order by inicia limit 1`,
    [caro, dias, nombre, cli, horas, estado]);
  const plan = async (cli, vence = null) => (await db.query(
    `insert into public.paquetes (empresa_id, cliente_id, nombre, clases, precio, vence_el)
     values ($1, $2, 'Plan mensual', 8, 250000, $3) returning id`, [E, cli, vence])).rows[0].id;
  const caminos = [];
  const camino = async (nombre, tel, entrena, preparar) => {
    const id = await cliente(T, nombre, tel);
    await preparar(id, nombre);
    caminos.push({ id, nombre, entrena });
  };
  await camino('Turno en 10 días', '0981000041', true, (id, n) => turno(id, n, 10));
  await camino('Turno hace 30 días', '0981000042', true, (id, n) => turno(id, n, -30));
  await camino('Turno hace 31 días', '0981000043', false, (id, n) => turno(id, n, -31));
  await camino('Turno cancelado hoy', '0981000044', false, (id, n) => turno(id, n, 0, 'cancelada', 2));
  await camino('Plan activo, sin turnos', '0981000045', true, (id) => plan(id));
  await camino('Plan cerrado', '0981000046', false, async (id) =>
    valor(T.uid, 'select public.cerrar_paquete($1) j', [await plan(id)]));
  await camino('Plan vencido', '0981000047', false, async (id) => plan(id, await dia(-1)));
  const todos16 = await J(T.uid, 'select public.rutinas_de($1, true) j', [E]);
  for (const c of caminos) {
    ok(`${c.nombre}: ${c.entrena ? 'entrena' : 'no entrena'}, y ${c.entrena ? 'está' : 'no está'} en «para atender»`, [
      todos16.clientes.find((x) => x.id === c.id)?.entrenando,
      todos16.para_atender.some((p) => p.cliente_id === c.id && p.motivo === 'sin_rutina'),
    ], [c.entrena, c.entrena]);
  }
  // Fuera de la lista para lo que sigue.
  await db.query('update public.clientes set activo = false where id = any($1::uuid[])', [caminos.map((c) => c.id)]);

  // ═══════════════════════════════════════════════════════════
  grupo('17 · La rutina de cada sesión de la agenda');
  // ═══════════════════════════════════════════════════════════
  ok('Caro sin rutina: la agenda no trae nada', await J(T.uid, 'select public.rutinas_de_la_agenda($1,$2) j', [E, hoy]), {});
  const caroV = (await guardarOk(T.uid, { nombre: 'Caro inicial', notas: '', semanas: 4, dias: [unDia([ej()])] }, { cli: caro })).id;
  const agenda = await J(T.uid, 'select public.agenda_del_dia($1,$2) j', [E, hoy]);
  const sesion = agenda.find((x) => x.cliente === 'Caro Sosa').id;
  const expected = {};
  expected[sesion] = { nombre: 'Caro inicial', rutina_id: caroV };
  ok('con rutina: la sesión de hoy la trae, por id de reserva',
    await J(T.uid, 'select public.rutinas_de_la_agenda($1) j', [E]), expected);
  ok('otro día, nada', await J(T.uid, 'select public.rutinas_de_la_agenda($1,$2) j', [E, await dia(-1)]), {});

  // ═══════════════════════════════════════════════════════════
  grupo('18 · La carpeta y la rutina: la lesión la ve el equipo, nunca el cliente');
  // ═══════════════════════════════════════════════════════════
  const carp = await J(T.uid, 'select public.rutinas_del_cliente($1,$2) j', [E, ana]);
  ok('las claves de la carpeta', claves(carp), ['anteriores', 'borrador', 'cliente', 'enlace', 'entrenando', 'vigente']);
  ok('el cliente', claves(carp.cliente), ['id', 'nombre', 'notas', 'telefono']);
  ok('el dueño ve «Salud y lesiones»', carp.cliente.notas, LESION);
  ok('la vigente, entera', claves(carp.vigente), ['cliente_id', 'cliente_nombre', 'cliente_notas', 'desde', 'dias', 'estado',
    'hasta', 'id', 'nombre', 'notas', 'semanas', 'updated_at', 'version']);
  ok('cada día', claves(carp.vigente.dias[0]), ['ejercicios', 'id', 'nombre', 'notas', 'orden']);
  ok('cada ejercicio', claves(carp.vigente.dias[0].ejercicios[0]), ['carga', 'descanso_seg', 'ejercicio_id', 'grupo', 'id',
    'indicaciones', 'junto_al_anterior', 'nombre', 'nota', 'orden', 'reps', 'series', 'video_url']);
  ok('la próxima y las anteriores', [claves(carp.borrador), claves(carp.anteriores[0])],
    [['id', 'nombre', 'updated_at'], ['desde', 'hasta', 'id', 'nombre']]);
  ok('el link y si entrena', [carp.enlace, carp.entrenando], [{ token: tokenAna3, activo: true }, true]);
  const carpRec = await J(recepcion, 'select public.rutinas_del_cliente($1,$2) j', [E, ana]);
  // Todo el equipo la ve: quien entrena a Ana tiene que saber de su rodilla,
  // sea el dueño o no. Lo que es solo del dueño son las medidas (grupo 13).
  ok('alguien del equipo también la ve en la carpeta', [carpRec.cliente.notas, carpRec.vigente.cliente_notas], [LESION, LESION]);
  ok('y en el editor', (await leer(recepcion, anaV3)).cliente_notas, LESION);
  ok('el dueño sí, para el aviso en ámbar', (await leer(T.uid, anaV3)).cliente_notas, LESION);
  ok('una plantilla no tiene lesiones de nadie', (await leer(T.uid, plantilla.id)).cliente_notas, null);
  ok('y la lesión nunca se copió a la rutina', JSON.stringify((await leer(T.uid, anaV3)).dias).includes('Rodilla derecha'), false);

  // ═══════════════════════════════════════════════════════════
  grupo('19 · Eliminar un cliente con historia de entrenamiento lo archiva');
  // ═══════════════════════════════════════════════════════════
  const eliminar = async (id) => (await valor(T.uid, 'select public.eliminar_cliente($1) r', [id])).r;
  const gabi = await cliente(T, 'Gabi Medida', '0981000006');
  await anotar(T.uid, gabi, hoy, { peso_kg: 60 }, true);
  ok('con medidas, se archiva', await eliminar(gabi), 'archivado');
  // Hasta la 099 las medidas seguían ahí, sin ninguna pantalla que llegara
  // a ellas. Ahora se van con la ficha (grupo 24).
  ok('y sus medidas se borran con la ficha (099)', await cuenta('select count(*)::int n from public.mediciones where cliente_id=$1', [gabi]), 0);
  const ivo = await cliente(T, 'Ivo Carga', '0981000007');
  await db.query(`insert into public.cargas_historial (empresa_id, cliente_id, ejercicio_id, fecha, carga_antes, carga_despues)
                  values ($1,$2,$3,$4,'10 kg','12 kg')`, [E, ivo, sentadilla, hoy]);
  ok('con cargas anotadas, se archiva', await eliminar(ivo), 'archivado');
  const hugo = await cliente(T, 'Hugo Link', '0981000008');
  await valor(T.uid, 'select public.enlace_rutina($1,$2) j', [E, hugo]);
  ok('con solo un link (sin rutina), se borra de verdad', await eliminar(hugo), 'borrado');
  ok('y el link se va con él', await cuenta('select count(*)::int n from public.rutina_enlaces where cliente_id=$1', [hugo]), 0);
  const nadie = await cliente(T, 'Nadie', '');
  ok('sin nada, se borra como siempre', await eliminar(nadie), 'borrado');

  // Un teléfono compartido (madre e hija, una pareja): hasta la 099,
  // `guardar_cliente` (052) tomaba el teléfono repetido como la misma
  // persona y reactivaba la ficha archivada con el nombre nuevo. Ahora, con
  // rutinas en la ficha, a la otra persona la frena (grupo 23). Y si vuelve
  // la MISMA persona, la ficha se reactiva, pero el link que tenía en su
  // celular no puede volver a andar solo: cambió de token y está apagado
  // hasta que el trainer lo prenda.
  const lia = await cliente(T, 'Lía Ruiz', '0981 000 050', 'Rodilla operada');
  const liaV = await guardarOk(T.uid, { nombre: 'Fuerza base', notas: 'Cuidado con la rodilla.', semanas: null,
    dias: [unDia([ej()])] }, { cli: lia });
  ok('Lía, con rutina, se archiva', await eliminar(lia), 'archivado');
  ok('y su link: idéntico a uno inventado', JSON.stringify(await publico(liaV.token)), NADA);
  ok('la misma persona, con su nombre y su teléfono: es la misma ficha', await cliente(T, 'Lía Ruiz', '0981000050'), lia);
  ok('y el link viejo de Lía sigue muerto', JSON.stringify(await publico(liaV.token)), NADA);
  const en19 = await J(T.uid, 'select public.enlace_rutina($1,$2) j', [E, lia]);
  ok('la ficha reactivada tiene otro token, y apagado hasta que el trainer lo prenda',
    [en19.token !== liaV.token, en19.activo], [true, false]);
  ok('archivar sin link no crea uno', await cuenta('select count(*)::int n from public.rutina_enlaces where cliente_id=$1', [gabi]), 0);
  // Otra persona con el teléfono de Lía, archivada: hasta la 099 la ficha
  // de Lía se reactivaba con el nombre nuevo. Ahora, con rutinas en la
  // ficha, Mora nace con la suya y el número deja de ser de Lía, que se
  // queda archivada con sus rutinas por id (el grupo 23 lo mira de cerca).
  ok('Lía se archiva otra vez', await eliminar(lia), 'archivado');
  const mora = await cliente(T, 'Mora Gómez', '0981000050');
  ok('otra persona con su teléfono ya no reactiva la ficha de Lía: nace con la suya (099)',
    [mora !== lia, await fila('select nombre, telefono, activo from public.clientes where id=$1', [lia])],
    [true, { nombre: 'Lía Ruiz', telefono: '', activo: false }]);
  ok('y la rutina de Lía sigue siendo de Lía', (await fila('select cliente_id from public.rutinas where id=$1', [liaV.id])).cliente_id, lia);
  ok('Mora, con el número y sin nada heredado', await fila('select telefono, notas from public.clientes where id=$1', [mora]), { telefono: '0981000050', notas: '' });

  // ═══════════════════════════════════════════════════════════
  grupo('20 · Otra empresa no toca nada');
  // ═══════════════════════════════════════════════════════════
  const O = Otro.uid;
  const OE = Otro.empresaId;
  const renglonAna = rV3.dias[0].ejercicios[0].id;
  const medAna = m1.valor.rows[0].j.id;
  const conMiEmpresa = [
    ['ejercicios_de', 'select public.ejercicios_de($1)', [E]],
    ['guardar_ejercicio', 'select public.guardar_ejercicio($1,$2)', [E, 'Intruso']],
    ['borrar_ejercicio', 'select public.borrar_ejercicio($1,$2)', [E, sentadilla]],
    ['rutinas_de', 'select public.rutinas_de($1)', [E]],
    ['rutinas_del_cliente', 'select public.rutinas_del_cliente($1,$2)', [E, ana]],
    ['rutina', 'select public.rutina($1,$2)', [E, anaV3]],
    ['guardar_rutina', 'select public.guardar_rutina($1,$2::jsonb,$3)', [E, JSON.stringify(rutinaAna), anaV3]],
    ['copiar_rutina', 'select public.copiar_rutina($1,$2)', [E, anaV3]],
    ['activar_rutina', 'select public.activar_rutina($1,$2)', [E, anaV3]],
    ['terminar_rutina', 'select public.terminar_rutina($1,$2)', [E, anaV3]],
    ['borrar_rutina', 'select public.borrar_rutina($1,$2)', [E, plantilla.id]],
    ['cambiar_carga', 'select public.cambiar_carga($1,$2,$3)', [E, renglonAna, '1 kg']],
    ['enlace_rutina', 'select public.enlace_rutina($1,$2)', [E, ana]],
    ['renovar_enlace_rutina', 'select public.renovar_enlace_rutina($1,$2)', [E, ana]],
    ['activar_enlace_rutina', 'select public.activar_enlace_rutina($1,$2,false)', [E, ana]],
    ['apagar_enlaces_rutina', 'select public.apagar_enlaces_rutina($1)', [E]],
    ['anotar_medicion', 'select public.anotar_medicion($1,$2,$3,$4::jsonb,true)', [E, ana, hoy, '{"peso_kg":50}']],
    ['borrar_medicion', 'select public.borrar_medicion($1,$2)', [E, medAna]],
    ['progreso_de', 'select public.progreso_de($1,$2)', [E, ana]],
    ['rutinas_de_la_agenda', 'select public.rutinas_de_la_agenda($1)', [E]],
  ];
  for (const [f, q, a] of conMiEmpresa) rechazado(`${f} con la empresa de Lucas`, await como(O, q, a), 'No pertenecés a esta empresa');

  // Con SU empresa y las filas de Lucas: para ella no existen.
  const suPlantilla = (await valor(O, 'select public.guardar_rutina($1,$2::jsonb) j', [OE, JSON.stringify(
    { nombre: 'Suya', notas: '', semanas: null, dias: [unDia([ej({ nombre: 'Peso muerto' })])] })])).j.id;
  const conSuEmpresa = [
    ['guardar_ejercicio', 'select public.guardar_ejercicio($1,$2,null,$3,null,true,$4)', [OE, 'Robada', '', sentadilla], 'Ese ejercicio no existe'],
    ['borrar_ejercicio', 'select public.borrar_ejercicio($1,$2)', [OE, sentadilla], 'Ese ejercicio no existe'],
    ['rutinas_del_cliente', 'select public.rutinas_del_cliente($1,$2)', [OE, ana], 'Ese cliente no es de esta cuenta'],
    ['rutina', 'select public.rutina($1,$2)', [OE, anaV3], 'Esa rutina no existe'],
    ['guardar_rutina (editar)', 'select public.guardar_rutina($1,$2::jsonb,$3)', [OE, JSON.stringify(rutinaAna), anaV3], 'Esa rutina no existe'],
    ['guardar_rutina (para su cliente)', 'select public.guardar_rutina($1,$2::jsonb,null,$3)', [OE, JSON.stringify(rutinaAna), ana], 'Ese cliente no es de esta cuenta'],
    ['copiar_rutina (la de Lucas)', 'select public.copiar_rutina($1,$2)', [OE, anaV3], 'Esa rutina no existe'],
    ['copiar_rutina (a su cliente)', 'select public.copiar_rutina($1,$2,$3)', [OE, suPlantilla, ana], 'Ese cliente no es de esta cuenta'],
    ['activar_rutina', 'select public.activar_rutina($1,$2)', [OE, anaV3], 'Esa rutina no existe'],
    ['terminar_rutina', 'select public.terminar_rutina($1,$2)', [OE, anaV3], 'Esa rutina no existe'],
    ['borrar_rutina', 'select public.borrar_rutina($1,$2)', [OE, plantilla.id], 'Esa rutina no existe'],
    ['cambiar_carga', 'select public.cambiar_carga($1,$2,$3)', [OE, renglonAna, '1 kg'], 'Ese ejercicio no existe'],
    ['enlace_rutina', 'select public.enlace_rutina($1,$2)', [OE, ana], 'Ese cliente no es de esta cuenta'],
    ['renovar_enlace_rutina', 'select public.renovar_enlace_rutina($1,$2)', [OE, ana], 'Ese cliente no es de esta cuenta'],
    ['activar_enlace_rutina', 'select public.activar_enlace_rutina($1,$2,false)', [OE, ana], 'Ese cliente no es de esta cuenta'],
    ['anotar_medicion', 'select public.anotar_medicion($1,$2,$3,$4::jsonb,true)', [OE, ana, hoy, '{"peso_kg":50}'], 'Ese cliente no es de esta cuenta'],
    ['borrar_medicion', 'select public.borrar_medicion($1,$2)', [OE, medAna], 'Ese control no existe'],
    ['progreso_de', 'select public.progreso_de($1,$2)', [OE, ana], 'Ese cliente no es de esta cuenta'],
  ];
  for (const [f, q, a, frag] of conSuEmpresa) rechazado(`${f} con su empresa y lo de Lucas`, await como(O, q, a), frag);
  ok('apagar sus links no apaga los de Lucas', (await valor(O, 'select public.apagar_enlaces_rutina($1) n', [OE])).n, 0);
  ok('el de Ana sigue prendido', (await publico(tokenAna3)).existe, true);
  ok('su biblioteca no tiene nada de Lucas',
    (await J(O, 'select public.ejercicios_de($1) j', [OE])).map((e) => e.nombre).sort(), ['Peso muerto']);
  ok('su lista no tiene clientes de Lucas',
    (await J(O, 'select public.rutinas_de($1, true) j', [OE])).clientes.map((c) => c.nombre), ['Zoe Otra']);
  ok('su agenda no trae sesiones de Lucas', await J(O, 'select public.rutinas_de_la_agenda($1) j', [OE]), {});
  ok('y nada de lo de Lucas cambió', [
    await cuenta('select count(*)::int n from public.rutinas where empresa_id=$1', [E]) > 0,
    (await leer(T.uid, anaV3)).estado,
    await cuenta('select count(*)::int n from public.mediciones where id=$1', [medAna]),
  ], [true, 'vigente', 1]);

  // ═══════════════════════════════════════════════════════════
  grupo('21 · Borrar una cuenta con todo cargado');
  // ═══════════════════════════════════════════════════════════
  const jefe = await H.crearUsuario(db, 'jefe@orden.com');
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe]);
  const cargarTodo = async (K) => {
    const k1 = await cliente(K, 'Kari Uno', '0982000001', 'Lumbar');
    const k2 = await cliente(K, 'Kike Dos', '0982000002');
    const kp = (await guardarOk(K.uid, { ...rutinaAna, nombre: 'Base' }, { empresa: K.empresaId })).id;
    const kv = (await copiarOk(K.uid, kp, k1, true, K.empresaId)).id;
    const kb = (await copiarOk(K.uid, kv, k1, true, K.empresaId)).id;
    await valor(K.uid, 'select public.activar_rutina($1,$2) j', [K.empresaId, kb]);
    const rk = await leer(K.uid, kb, K.empresaId);
    await valor(K.uid, 'select public.cambiar_carga($1,$2,$3) j', [K.empresaId, rk.dias[0].ejercicios[0].id, '50 kg']);
    await copiarOk(K.uid, kb, k2, false, K.empresaId);
    await valor(K.uid, 'select public.anotar_medicion($1,$2,$3,$4::jsonb,true) j', [K.empresaId, k1, hoy, '{"peso_kg":70}']);
    await valor(K.uid, 'select public.copiar_rutina($1,$2,$3) j', [K.empresaId, kp, k2]);
  };
  const cuentasDe = async (id) => {
    const n = [];
    for (const t of TABLAS) n.push(await cuenta(`select count(*)::int n from public.${t} where empresa_id=$1`, [id]));
    return n;
  };
  const K = await H.montarEmpresa(db, { email: 'kari@fit.com', nombre: 'Kari Fit', rubro: 'entrenamiento' });
  await cargarTodo(K);
  ok('la cuenta tiene de todo en las ocho tablas', (await cuentasDe(K.empresaId)).every((n) => n > 0), true);
  aceptado('borrar_cuenta la borra entera', await como(jefe, 'select public.borrar_cuenta($1,$2)', [K.empresaId, 'Kari Fit']));
  ok('sin dejar nada en ninguna tabla nueva', await cuentasDe(K.empresaId), [0, 0, 0, 0, 0, 0, 0, 0]);

  const L = await H.montarEmpresa(db, { email: 'lali@fit.com', nombre: 'Lali Fit', rubro: 'entrenamiento' });
  await cargarTodo(L);
  await db.query("update public.suscripciones set periodo_fin = now() - interval '60 days' where empresa_id=$1", [L.empresaId]);
  aceptado('también con la cuenta vencida hace dos meses',
    await como(jefe, 'select public.borrar_cuenta($1,$2)', [L.empresaId, 'Lali Fit']));
  ok('sin dejar nada', await cuentasDe(L.empresaId), [0, 0, 0, 0, 0, 0, 0, 0]);
  ok('y lo de Lucas sigue entero', (await leer(T.uid, anaV3)).nombre, 'Rutina de Ana');

  // ═══════════════════════════════════════════════════════════
  grupo('22 · Copiar a alguien sin rutina: en preparación si se pide (099)');
  // ═══════════════════════════════════════════════════════════
  // «Usar para un cliente», «Copiar la de otro cliente» y «Armar una nueva
  // a partir de esta» iban derecho a vigente si la persona no tenía rutina,
  // y si ya tenía el link en el celular (después de «Terminar»), la veía
  // antes de que el trainer la revisara, con las notas de la otra persona.
  // Con p_borrador la copia nace en preparación: nada llega al link hasta
  // «Activar la próxima». Sin cliente (una plantilla), p_borrador no dice nada.
  const copiarB = (uid, origen, cli, conNotas, borrador, empresa = E) =>
    como(uid, 'select public.copiar_rutina($1,$2,$3,$4,$5) j', [empresa, origen, cli, conNotas, borrador]);
  const copiarBOk = async (...a) => {
    const r = await copiarB(...a);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const enlacesDe = (cli) => cuenta('select count(*)::int n from public.rutina_enlaces where cliente_id=$1', [cli]);
  const carpetaDe = (cli) => J(T.uid, 'select public.rutinas_del_cliente($1,$2) j', [E, cli]);

  // La firma vieja se fue: con las dos, la llamada de cuatro argumentos
  // sería ambigua y PostgreSQL no sabría cuál llamar.
  ok('queda una sola copiar_rutina, la de seis argumentos',
    (await db.query("select pg_get_function_identity_arguments(oid) a from pg_proc where proname='copiar_rutina' and pronamespace='public'::regnamespace")).rows.map((r) => r.a),
    ['p_empresa uuid, p_origen uuid, p_cliente uuid, p_con_notas boolean, p_borrador boolean, p_nombre_vacio text']);
  rechazado('anon no la llama', await H.intentarComo(db, 'anon', null, () =>
    db.query('select public.copiar_rutina($1,$2,$3,$4,$5)', [E, anaV3, null, true, true])), 'permission denied');
  rechazado('ni otra empresa con la de Lucas', await copiarB(O, anaV3, null, true, true), 'No pertenecés a esta empresa');

  // Rita tuvo rutina y el trainer la terminó: tiene el link en el celular y
  // no tiene vigente. Es el caso que destapó todo.
  const rita = await cliente(T, 'Rita Nueva', '0983000001');
  const ritaVieja = await guardarOk(T.uid, simple('Rita inicial'), { cli: rita });
  const tokenRita = ritaVieja.token;
  await valor(T.uid, 'select public.terminar_rutina($1,$2) x', [E, ritaVieja.id]);
  ok('Rita: link prendido y sin vigente («preparando»)',
    [(await publico(tokenRita)).existe, (await publico(tokenRita)).rutina], [true, null]);
  const c22 = await copiarBOk(T.uid, anaV3, rita, false, true);
  ok('la de Ana copiada con p_borrador: nace en preparación, sin token',
    [claves(c22), c22.estado, c22.token], [['estado', 'id', 'token'], 'borrador', null]);
  const r22 = await leer(T.uid, c22.id);
  ok('sin fecha de inicio, sin el nombre de Ana y sin sus notas', [r22.desde, r22.nombre, r22.notas], [null, 'Rutina', '']);
  ok('en el link de Rita no llegó nada', (await publico(tokenRita)).rutina, null);
  const carpRita = await carpetaDe(rita);
  ok('en su carpeta: sin vigente, con la próxima', [carpRita.vigente, carpRita.borrador?.id], [null, c22.id]);
  rechazado('otra copia en preparación, no: ya tiene una',
    await copiarB(T.uid, plantilla.id, rita, true, true), 'ya tiene una próxima rutina en preparación');
  ok('y no dejó nada a medias', (await carpetaDe(rita)).borrador.id, c22.id);

  // «Activar la próxima» sin una vigente que reemplazar.
  const a22 = await J(T.uid, 'select public.activar_rutina($1,$2) j', [E, c22.id]);
  ok('activar sin vigente previa devuelve el link de siempre', a22, { id: c22.id, token: tokenRita });
  const r22b = await leer(T.uid, c22.id);
  ok('queda vigente desde hoy', [r22b.estado, r22b.desde, r22b.hasta], ['vigente', hoy, null]);
  ok('recién ahora Rita la ve, sin ninguna palabra de Ana',
    [(await publico(tokenRita)).rutina?.nombre, /\bAna\b/i.test(JSON.stringify(await publico(tokenRita)))], ['Rutina', false]);
  ok('y su carpeta ya no tiene próxima', (await carpetaDe(rita)).borrador, null);

  // Nico no tiene nada, ni link: «Usar una plantilla» en preparación no le
  // crea el link; activar sí.
  const nico = await cliente(T, 'Nico Cero', '0983000002');
  const nombrePlantilla = (await leer(T.uid, plantilla.id)).nombre;
  const c22n = await copiarBOk(T.uid, plantilla.id, nico, true, true);
  ok('«Usar una plantilla» para alguien sin nada: en preparación', [c22n.estado, c22n.token], ['borrador', null]);
  ok('sin crearle el link todavía', await enlacesDe(nico), 0);
  const a22n = await J(T.uid, 'select public.activar_rutina($1,$2) j', [E, c22n.id]);
  ok('activar le crea el link, prendido', [typeof a22n.token, (await carpetaDe(nico)).enlace], ['string', { token: a22n.token, activo: true }]);
  ok('y ve la plantilla con su nombre', (await publico(a22n.token)).rutina?.nombre, nombrePlantilla);
  // Con vigente, p_borrador no cambia nada: la próxima, como siempre.
  const c22v = await copiarBOk(T.uid, plantilla.id, nico, true, true);
  ok('con vigente, p_borrador es la próxima de siempre', [c22v.estado, c22v.token], ['borrador', null]);
  rechazado('una tercera con p_borrador, no', await copiarB(T.uid, plantilla.id, nico, true, true), 'ya tiene una próxima');
  rechazado('ni sin él', await copiar(T.uid, plantilla.id, nico), 'ya tiene una próxima');

  // Lo de siempre sigue igual: sin p_borrador (o en false), vigente al instante.
  const olga = await cliente(T, 'Olga Cuatro', '0983000003');
  const c22o = await copiarOk(T.uid, plantilla.id, olga, true);
  ok('la llamada de cuatro argumentos sigue andando: vigente, con link',
    [c22o.estado, typeof c22o.token, await enlacesDe(olga)], ['vigente', 'string', 1]);
  const pia = await cliente(T, 'Pía Falso', '0983000004');
  const c22f = await copiarBOk(T.uid, anaV3, pia, true, false);
  ok('con p_borrador en false, también', [c22f.estado, typeof c22f.token, (await leer(T.uid, c22f.id)).desde], ['vigente', 'string', hoy]);
  // Una plantilla no tiene link ni preparación.
  const c22p = await copiarBOk(T.uid, anaV3, null, true, true);
  ok('sin cliente, p_borrador no dice nada: es una plantilla',
    [c22p.estado, c22p.token, (await leer(T.uid, c22p.id)).cliente_id], ['plantilla', null, null]);
  await valor(T.uid, 'select public.borrar_rutina($1,$2) x', [E, c22p.id]);

  // El nombre de respaldo lo manda la pantalla en su idioma (p_nombre_vacio):
  // «Rutina» llegaba al link de un cliente brasileño. Se prueba copiando la
  // de Ana como plantilla (su nombre queda vacío al sacarle «Ana»).
  const nombreConRespaldo = async (respaldo) => {
    const r = await como(T.uid, 'select public.copiar_rutina($1,$2,$3,$4,$5,$6) j', [E, anaV3, null, true, false, respaldo]);
    if (!r.ok) throw new Error(r.error);
    const id = r.valor.rows[0].j.id;
    const nombre = (await leer(T.uid, id)).nombre;
    await valor(T.uid, 'select public.borrar_rutina($1,$2) x', [E, id]);
    return nombre;
  };
  ok('el nombre de respaldo, en el idioma de la pantalla: «Treino»', await nombreConRespaldo('Treino'), 'Treino');
  ok('sin mandarlo, «Rutina» como siempre', (await leer(T.uid, c22.id)).nombre, 'Rutina');
  ok('vacío, en blanco o nulo: «Rutina»',
    [await nombreConRespaldo(''), await nombreConRespaldo('   '), await nombreConRespaldo(null)], ['Rutina', 'Rutina', 'Rutina']);
  ok('largo de más, se recorta a lo que entra (60)', await nombreConRespaldo(' ' + 'T'.repeat(70)), 'T'.repeat(60));

  // ═══════════════════════════════════════════════════════════
  grupo('23 · Un teléfono es de una persona: Laura no hereda la ficha de Ana (099)');
  // ═══════════════════════════════════════════════════════════
  // Desde la 052 el teléfono es la identidad: un número repetido es la misma
  // persona, y la ficha se renombra y se reactiva. En un almacén o una
  // barbería está bien. Con datos de entrenamiento, no: «Laura» con el
  // teléfono de «Ana» heredaba sus medidas, sus lesiones, su rutina, la
  // historia de sus cargas y su consentimiento.
  const gc = (nombre, tel, notas = '', uid = T.uid, empresa = E) =>
    como(uid, 'select public.guardar_cliente($1,$2,$3,$4) id', [empresa, nombre, tel, notas]);
  const idDe = async (...a) => {
    const r = await gc(...a);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].id;
  };
  const fichaDe = (id) => fila('select nombre, telefono, notas, activo from public.clientes where id=$1', [id]);
  // [rutinas, mediciones, fichas_entreno, cargas_historial] de una persona.
  const rastro = async (id) => [
    await cuenta('select count(*)::int n from public.rutinas where cliente_id=$1', [id]),
    await cuenta('select count(*)::int n from public.mediciones where cliente_id=$1', [id]),
    await cuenta('select count(*)::int n from public.fichas_entreno where cliente_id=$1', [id]),
    await cuenta('select count(*)::int n from public.cargas_historial where cliente_id=$1', [id]),
  ];
  const NO_ES_ELLA = 'Si es otra persona, dejá el teléfono vacío o elegila de la lista';

  const anaM = await idDe('Ana Medina', '0983 100 001', 'Lumbar: nada de peso muerto.');
  await valor(T.uid, 'select public.anotar_medicion($1,$2,$3,$4::jsonb,true) j', [E, anaM, hoy, '{"peso_kg":62}']);
  const antes23 = await fichaDe(anaM);
  const total23 = await cuenta('select count(*)::int n from public.clientes where empresa_id=$1', [E]);
  rechazado('Laura con el teléfono de Ana, que tiene medidas: se frena y dice de quién es',
    await gc('Laura Díaz', '0983100001'), `Ese teléfono ya es de «Ana Medina». ${NO_ES_ELLA}`);
  ok('la ficha de Ana no se tocó', await fichaDe(anaM), antes23);
  ok('sus medidas y su sí siguen siendo de ella', await rastro(anaM), [0, 1, 1, 0]);
  ok('y Laura no quedó cargada', await cuenta('select count(*)::int n from public.clientes where empresa_id=$1', [E]), total23);
  rechazado('escrito de otra manera, el mismo número', await gc('Laura Díaz', '(0983) 100-001'), 'ya es de «Ana Medina»');

  // Cualquiera de los cuatro rastros alcanza.
  const conRutina = await idDe('Bea Rutina', '0983100002');
  await guardarOk(T.uid, simple('Base de Bea'), { cli: conRutina });
  rechazado('con una rutina y nada más', await gc('Cami Otra', '0983100002'), 'ya es de «Bea Rutina»');
  // Archivada, Bea no está en ninguna lista para «elegirla»: el número queda
  // libre, como en la rama con id (058). Cami nace con su ficha; la de Bea
  // se queda archivada, con su rutina y sin el número.
  ok('Bea se archiva', await eliminar(conRutina), 'archivado');
  const cami = await idDe('Cami Otra', '0983100002');
  ok('archivada, el número queda libre: Cami nace con su propia ficha', [cami !== conRutina, await fichaDe(cami)],
    [true, { nombre: 'Cami Otra', telefono: '0983100002', notas: '', activo: true }]);
  ok('y Bea se queda archivada, con su rutina y sin el número', [await fichaDe(conRutina), await rastro(conRutina)],
    [{ nombre: 'Bea Rutina', telefono: '', notas: '', activo: false }, [1, 0, 0, 0]]);
  ok('el número ahora es de Cami, que no tiene nada: si escriben «Bea Rutina» con él, es la ficha de Cami (052)',
    await idDe('Bea Rutina', '0983100002'), cami);
  const conFicha = await idDe('Dora Ficha', '0983100003');
  const mD = (await anotar(T.uid, conFicha, hoy, { peso_kg: 70 }, true)).valor.rows[0].j.id;
  await valor(T.uid, 'select public.borrar_medicion($1,$2) x', [E, mD]);
  ok('Dora: sin medidas, pero con el sí en la ficha', await rastro(conFicha), [0, 0, 1, 0]);
  rechazado('con solo el sí en la ficha', await gc('Eli Otra', '0983100003'), 'ya es de «Dora Ficha»');
  const conCarga = await idDe('Flor Carga', '0983100004');
  await db.query(`insert into public.cargas_historial (empresa_id, cliente_id, ejercicio_id, fecha, carga_antes, carga_despues)
                  values ($1,$2,$3,$4,'10 kg','12 kg')`, [E, conCarga, sentadilla, hoy]);
  rechazado('con solo una carga anotada', await gc('Gina Otra', '0983100004'), 'ya es de «Flor Carga»');

  // La misma persona, escrita de otra manera: la misma ficha, como siempre.
  ok('«ANA  MEDINA» con su teléfono: es ella, y se renombra como siempre',
    [await idDe('ANA  MEDINA', '0983100001'), (await fichaDe(anaM)).nombre], [anaM, 'ANA  MEDINA']);
  ok('«Ána Medina» también', await idDe('Ána Medina', '0983-100-001'), anaM);
  ok('«ana medina» también', await idDe('ana medina', '0983100001', 'Lumbar, y ahora el hombro.'), anaM);
  ok('con sus notas nuevas, sus medidas y su sí', [(await fichaDe(anaM)).notas, await rastro(anaM)], ['Lumbar, y ahora el hombro.', [0, 1, 1, 0]]);
  await idDe('Ana Medina', '0983100001');

  // Sin datos de entrenamiento, nada cambia: se renombra, se reactiva,
  // conserva las notas (este negocio, la barbería, el almacén).
  const hilda = await idDe('Hilda Vacía', '0983100005', 'Le gusta el mate.');
  ok('Laura con el teléfono de alguien sin datos de entrenamiento: la misma ficha, como siempre',
    await idDe('Laura Díaz', '0983100005'), hilda);
  ok('renombrada, con sus notas', await fichaDe(hilda), { nombre: 'Laura Díaz', telefono: '0983100005', notas: 'Le gusta el mate.', activo: true });
  rechazado('editar otra ficha con el número de Ana: el mensaje de la 058, como siempre',
    await como(T.uid, 'select public.guardar_cliente($1,$2,$3,$4,$5)', [E, 'Laura Díaz', '0983100001', '', hilda]),
    'ya es de «Ana Medina». Si son la misma persona, eliminá la ficha que sobra');
  ok('otra empresa con el mismo número: otra persona, sin chocar', (await idDe('Ana Medina', '0983100001', '', O, OE)) !== anaM, true);
  const B = await H.montarEmpresa(db, { email: 'barba@barberia.com', nombre: 'Barbería Sur', rubro: 'servicios' });
  const pepe = await idDe('Pepe Barba', '0983100010', 'Corte clásico, navaja.', B.uid, B.empresaId);
  ok('en una barbería, «Toto» con el teléfono de «Pepe» es la misma ficha, como desde la 052',
    await idDe('Toto Barba', '0983100010', '', B.uid, B.empresaId), pepe);
  ok('renombrada y con sus notas', [(await fichaDe(pepe)).nombre, (await fichaDe(pepe)).notas], ['Toto Barba', 'Corte clásico, navaja.']);

  // ═══════════════════════════════════════════════════════════
  grupo('24 · Archivar a alguien se lleva sus medidas, su sí y sus lesiones (099)');
  // ═══════════════════════════════════════════════════════════
  // Archivado, ninguna pantalla llega a su Progreso ni a su ficha: sus
  // medidas, su consentimiento y «Salud y lesiones» quedaban guardados sin
  // forma de borrarlos (Ley 7593/2025). Las rutinas y cómo subieron sus
  // cargas se quedan: son el trabajo del trainer, y no se ven en ningún link.
  const cata = await idDe('Cata Salud', '0983 200 001', 'Asma: inhalador a mano.');
  await anotar(T.uid, cata, await dia(-7), { peso_kg: 70, cintura_cm: 80 }, true);
  await anotar(T.uid, cata, hoy, { peso_kg: 69 });
  const cataV = await guardarOk(T.uid, simple('Base de Cata'), { cli: cata });
  const cataB = await copiarOk(T.uid, cataV.id, cata);
  const rCata = await leer(T.uid, cataV.id);
  await valor(T.uid, 'select public.cambiar_carga($1,$2,$3) j', [E, rCata.dias[0].ejercicios[0].id, '20 kg']);
  const tokenCata = cataV.token;
  ok('Cata: dos controles, el sí, vigente y próxima, una carga anotada, link prendido',
    [await rastro(cata), (await publico(tokenCata)).rutina?.nombre], [[2, 2, 1, 1], 'Base de Cata']);
  ok('se archiva', await eliminar(cata), 'archivado');
  ok('sus medidas y su sí se fueron; sus rutinas y sus cargas quedan', await rastro(cata), [2, 0, 0, 1]);
  ok('y «Salud y lesiones» quedó vacío', await fichaDe(cata), { nombre: 'Cata Salud', telefono: '0983 200 001', notas: '', activo: false });
  ok('las rutinas siguen con su estado',
    (await db.query('select estado from public.rutinas where cliente_id=$1', [cata])).rows.map((r) => r.estado).sort(), ['borrador', 'vigente']);
  const en24 = await fila('select activo, token from public.rutina_enlaces where cliente_id=$1', [cata]);
  ok('el link quedó apagado y con otro token', [en24.activo, en24.token !== tokenCata], [false, true]);
  ok('el link viejo: idéntico a uno inventado', JSON.stringify(await publico(tokenCata)), NADA);
  ok('y el nuevo, apagado, también', JSON.stringify(await publico(en24.token)), NADA);

  // Vuelve la misma persona: su ficha, sin medidas, y el sí se pide de nuevo.
  ok('vuelve con su nombre y su teléfono: la misma ficha, activa',
    [await idDe('Cata Salud', '0983200001'), (await fichaDe(cata)).activo], [cata, true]);
  const pCata = await J(T.uid, 'select public.progreso_de($1,$2) j', [E, cata]);
  ok('su progreso arranca de cero: sin medidas, sin el sí', [pCata.mediciones, pCata.consiente_medidas_at], [[], null]);
  ok('pero con su rutina vigente y cómo subió su carga', [pCata.rutina_vigente?.nombre, pCata.cargas.length], ['Base de Cata', 1]);
  rechazado('anotar sin volver a preguntarle, no', await anotar(T.uid, cata, hoy, { peso_kg: 68 }), 'confirmá que el cliente está de acuerdo');
  aceptado('con el sí de nuevo, sí', await anotar(T.uid, cata, hoy, { peso_kg: 68 }, true));
  const carpCata = await carpetaDe(cata);
  ok('su carpeta la espera: la vigente, la próxima y el link, apagado hasta que el trainer lo prenda',
    [carpCata.vigente?.id, carpCata.borrador?.id, carpCata.enlace?.activo], [cataV.id, cataB.id, false]);

  // Con la cuenta vencida también: los candados de la 098 son de insert y
  // update, y archivar es un update en clientes y un delete en las medidas.
  const dina = await idDe('Dina Vencida', '0983200002', 'Rodilla.');
  await anotar(T.uid, dina, hoy, { peso_kg: 55 }, true);
  await guardarOk(T.uid, simple('Base de Dina'), { cli: dina });
  await vencer("periodo_fin = now() - interval '10 days'");
  ok('con la cuenta vencida también se archiva, y se lleva lo mismo',
    [await eliminar(dina), await rastro(dina), (await fichaDe(dina)).notas], ['archivado', [1, 0, 0, 0], '']);
  await vencer("estado = 'prueba', periodo_fin = now() + interval '14 days'");

  // Para todos los rubros: en «Notas» de una barbería también puede ir «es
  // alérgica a…», y la pantalla lo dice al eliminar («sus notas se borran»).
  // Toto (el Pepe del grupo 23) tiene historia de fiado: se archiva.
  await valor(B.uid, "select public.anotar_fiado($1,$2,10000,'Corte') id", [B.empresaId, pepe]);
  await valor(B.uid, 'select public.cobrar_fiado($1,$2,10000) j', [B.empresaId, pepe]);
  ok('en la barbería también: al archivar, las notas se borran',
    [(await valor(B.uid, 'select public.eliminar_cliente($1) r', [pepe])).r, await fichaDe(pepe)],
    ['archivado', { nombre: 'Toto Barba', telefono: '0983100010', notas: '', activo: false }]);
  ok('y si vuelve con su teléfono, vuelve a su ficha, sin ellas',
    [await idDe('Toto Barba', '0983100010', '', B.uid, B.empresaId), (await fichaDe(pepe)).notas], [pepe, '']);

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE RUTINAS FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE RUTINAS PASARON`);
  process.exit(0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
