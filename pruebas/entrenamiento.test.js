/**
 * El personal trainer (migración 097).
 *
 * Matías: «ponete en el lugar de un personal trainer». Su día: sabe a quién
 * entrena hoy y a qué hora, sabe quién le debe el mes, marca cada sesión
 * como dada o no, y —lo que un profe de inglés no necesita— antes de
 * empezar tiene que acordarse de las lesiones de cada cliente.
 *
 * LO QUE IMPORTA
 *
 *   · que un trainer use el mismo motor del profe sin nada a medias:
 *     agendar con horario fijo, cobrar, marcar la sesión;
 *   · que las notas del cliente (sus lesiones) lleguen a la agenda del día
 *     y a las sesiones de hoy del panel, pegadas a cada sesión;
 *   · que un cliente sin notas no traiga una nota vacía;
 *   · y que nadie de afuera las lea.
 */
const H = require('./ayuda-db.js');

let fallos = 0;
let corridas = 0;

function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a}`);
}

function rechazado(nombre, res, frag) {
  corridas++;
  if (res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      NO fue rechazada`); return; }
  if (frag && !new RegExp(frag, 'i').test(res.error)) {
    fallos++; console.log(`  ✗ ${nombre}\n      otro motivo: ${res.error}`); return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 64)}`);
}

(async () => {
  const db = await H.crearBase();

  const T = await H.montarEmpresa(db, { email: 'lucas@fuerza.com', nombre: 'Entrená con Lucas', rubro: 'entrenamiento' });
  const Otro = await H.montarEmpresa(db, { email: 'otro@gym.com', nombre: 'Otro trainer', rubro: 'entrenamiento' });

  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };
  const cliente = async (nombre, tel, notas) => (await valor(T.uid,
    'select public.guardar_cliente($1,$2,$3,$4,$5) id', [T.empresaId, nombre, tel, notas, null])).id;

  // Hoy, en Asunción, y qué día de la semana es: las sesiones de hoy del
  // panel se arman con eso.
  const { hoy, dow } = (await db.query(
    "select public.hoy_empresa($1)::text as hoy, extract(dow from public.hoy_empresa($1))::int as dow", [T.empresaId])).rows[0];
  const agendar = (uid, empresa, clienteId, hora, hasta, materia) => como(uid,
    'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) j',
    [empresa, clienteId, [dow], hora, hasta, hoy, hoy, null, 250000, true, 'transferencia', 'Plan de hoy', materia]);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Un cliente con una lesión anotada');
  // ═══════════════════════════════════════════════════════════
  const ana = await cliente('Ana Ruiz', '0981000001', 'Rodilla derecha operada: sin saltos ni sentadilla profunda.');
  const beto = await cliente('Beto Paz', '0981000002', '');
  const caro = await cliente('Caro Sosa', '0981000003', '   ');

  const r1 = await agendar(T.uid, T.empresaId, ana, '07:00', '08:00', 'Piernas y glúteos');
  ok('se agenda a Ana con su horario fijo', r1.ok, true);
  ok('pagado en el momento: es un cobro', r1.valor.rows[0].j.movimiento !== null, true);
  ok('se agenda a Beto', (await agendar(T.uid, T.empresaId, beto, '08:00', '09:00', 'Fuerza')).ok, true);
  ok('y a Caro', (await agendar(T.uid, T.empresaId, caro, '09:00', '10:00', null)).ok, true);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · La lesión, a la vista antes de entrenar');
  // ═══════════════════════════════════════════════════════════
  const agenda = (await valor(T.uid, 'select public.agenda_del_dia($1, $2) j', [T.empresaId, hoy])).j;
  const deAgenda = (n) => agenda.find((x) => x.cliente === n);
  ok('la agenda del día trae la lesión de Ana, pegada a su sesión',
    deAgenda('Ana Ruiz').notas, 'Rodilla derecha operada: sin saltos ni sentadilla profunda.');
  ok('y lo que están trabajando', deAgenda('Ana Ruiz').materia, 'Piernas y glúteos');
  ok('Beto no tiene nada anotado: no trae una nota vacía', deAgenda('Beto Paz').notas, null);
  ok('ni Caro, que tiene solo espacios', deAgenda('Caro Sosa').notas, null);

  const panel = (await valor(T.uid, 'select public.panel_profe($1, $2, $2) j', [T.empresaId, hoy])).j;
  ok('las sesiones de hoy del panel también la traen',
    panel.hoy.find((x) => x.alumno === 'Ana Ruiz').notas, 'Rodilla derecha operada: sin saltos ni sentadilla profunda.');
  ok('ahí tampoco hay notas vacías', panel.hoy.find((x) => x.alumno === 'Beto Paz').notas, null);
  ok('en orden de hora, como se entrena', panel.hoy.map((x) => x.alumno), ['Ana Ruiz', 'Beto Paz', 'Caro Sosa']);

  // Si la lesión cambia, la agenda lo sabe al toque: no es una copia.
  await valor(T.uid, 'select public.guardar_cliente($1,$2,$3,$4,$5) id',
    [T.empresaId, 'Beto Paz', '0981000002', 'Hombro izquierdo: nada por encima de la cabeza.', beto]);
  ok('una lesión nueva aparece en la agenda sin tocar la sesión',
    (await valor(T.uid, 'select public.agenda_del_dia($1, $2) j', [T.empresaId, hoy])).j
      .find((x) => x.cliente === 'Beto Paz').notas, 'Hombro izquierdo: nada por encima de la cabeza.');

  // ═══════════════════════════════════════════════════════════
  grupo('3 · La sesión, como la clase del profe');
  // ═══════════════════════════════════════════════════════════
  const sesionAna = deAgenda('Ana Ruiz').id;
  const dada = await como(T.uid, 'select public.marcar_clase($1, true) j', [sesionAna]);
  ok('se marca la sesión como dada', dada.ok, true);
  ok('y se descuenta del plan', Number(dada.valor.rows[0].j.paquete.usadas), 1);
  const sesionBeto = deAgenda('Beto Paz').id;
  const noTenida = await como(T.uid, 'select public.marcar_clase($1, false, false) j', [sesionBeto]);
  ok('una que no se tuvo, sin descontar: la decide el trainer', Number(noTenida.valor.rows[0].j.paquete.usadas), 0);
  ok('el panel cuenta la sesión dada',
    (await valor(T.uid, 'select public.panel_profe($1, $2, $2) j', [T.empresaId, hoy])).j.clases_periodo, 1);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Nadie de afuera lee una lesión');
  // ═══════════════════════════════════════════════════════════
  rechazado('otro trainer no ve la agenda de Lucas',
    await como(Otro.uid, 'select public.agenda_del_dia($1, $2)', [T.empresaId, hoy]), 'pertenecés');
  rechazado('ni su panel',
    await como(Otro.uid, 'select public.panel_profe($1, $2, $2)', [T.empresaId, hoy]), 'pertenecés');

  // Una barbería no cambia: su agenda sigue igual, con la nota del cliente
  // solo si la tiene (la pantalla la muestra únicamente en el trainer).
  const B = await H.montarEmpresa(db, { email: 'barbero@corte.com', nombre: 'Barbería', rubro: 'servicios' });
  ok('la agenda de una barbería sigue respondiendo',
    Array.isArray((await valor(B.uid, 'select public.agenda_del_dia($1, $2) j', [B.empresaId, hoy])).j), true);

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL TRAINER FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DEL TRAINER PASARON`);
  process.exit(0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
