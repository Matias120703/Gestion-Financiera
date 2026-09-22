/**
 * Inscribir a un alumno (migración 091).
 *
 * El ejemplo de Matías, tal cual: «Matías va a tener clases lunes, martes y
 * jueves de 6 a 7 de la tarde. Yo cobro 50.000 la hora. Automáticamente se
 * calcula cuánto sería en el plazo que marqué».
 *
 * Octubre de 2026 arranca un jueves. Lunes, martes y jueves de octubre son
 * 5+4… en total 13 días: 13 clases de una hora, Gs. 650.000.
 *
 * LO QUE IMPORTA
 *
 *   · que la cuenta dé lo que el profe haría a mano;
 *   · que las clases aparezcan en la agenda a la hora de Asunción, no a la
 *     del servidor;
 *   · que un horario ya ocupado frene TODA la inscripción, no la mitad;
 *   · que se gane al cobrar: sin pagar no hay venta, y aparece por cobrar;
 *   · que cerrar una inscripción libere el horario;
 *   · y que el cobro entre al banco donde llegó la plata (095).
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

// Lunes, martes y jueves, con la numeración de PostgreSQL (0 = domingo).
const LMJ = [1, 2, 4];

(async () => {
  const db = await H.crearBase();

  const P = await H.montarEmpresa(db, { email: 'profe@ingles.com', nombre: 'Clases de inglés', rubro: 'clases' });
  const Otro = await H.montarEmpresa(db, { email: 'otro@academia.com', nombre: 'Otra academia', rubro: 'clases' });

  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };
  const alumno = async (nombre, tel) => (await valor(P.uid,
    'select public.guardar_cliente($1,$2,$3,$4,$5) id', [P.empresaId, nombre, tel, '', null])).id;

  const matias = await alumno('Matías Aranda', '0981111111');
  const ana = await alumno('Ana Benítez', '0982222222');

  const previa = async (args) => (await valor(P.uid,
    'select public.vista_previa_inscripcion($1,$2,$3,$4,$5,$6,$7,$8) j', [P.empresaId, ...args])).j;
  const paquetesDe = async (cliente) => (await valor(P.uid,
    'select public.paquetes_del_alumno($1,$2) j', [P.empresaId, cliente])).j;
  const inscribir = (uid, empresa, cliente, args) => como(uid,
    'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) j',
    [empresa, cliente, ...args]);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · La cuenta que haría el profe a mano');
  // ═══════════════════════════════════════════════════════════
  const oct = await previa([LMJ, '18:00', '19:00', '2026-10-01', '2026-10-31', 50000, null]);
  ok('lunes, martes y jueves de octubre son 13 clases', oct.clases, 13);
  ok('de una hora cada una: 13 horas', Number(oct.horas), 13);
  ok('a Gs. 50.000 la hora: Gs. 650.000', Number(oct.total), 650000);

  const horaYMedia = await previa([LMJ, '18:00', '19:30', '2026-10-01', '2026-10-31', 50000, null]);
  ok('si la clase es de hora y media, cobra hora y media', Number(horaYMedia.total), 975000);

  const cerrado = await previa([LMJ, '18:00', '19:00', '2026-10-01', '2026-10-31', null, 300000]);
  ok('con precio cerrado, manda el precio cerrado', Number(cerrado.total), 300000);
  ok('y las clases se cuentan igual', cerrado.clases, 13);

  const aMedias = await previa([[], '18:00', '19:00', '2026-10-01', '2026-10-31', 50000, null]);
  ok('un formulario a medio completar da ceros, no un error', aMedias.clases, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Inscribir, pagado en el momento');
  // ═══════════════════════════════════════════════════════════
  const r1 = await inscribir(P.uid, P.empresaId, matias,
    [LMJ, '18:00', '19:00', '2026-10-01', '2026-10-31', 50000, null, true, 'transferencia', 'Octubre · L M J 18:00']);
  ok('se inscribe', r1.ok, true);
  const i1 = r1.valor.rows[0].j;
  ok('con sus 13 clases', i1.clases, 13);
  ok('y el total calculado', Number(i1.total), 650000);

  const turnos = (await db.query(
    `select to_char(inicia at time zone 'America/Asuncion', 'YYYY-MM-DD HH24:MI') as a,
            estado, cliente_id, paquete_id
     from public.turnos_reserva where paquete_id = $1 order by inicia`, [i1.paquete])).rows;
  ok('las 13 clases están en la agenda', turnos.length, 13);
  ok('la primera, el jueves 1 a las 18:00 de Asunción', turnos[0].a, '2026-10-01 18:00');
  ok('la última, el jueves 29', turnos[12].a, '2026-10-29 18:00');
  ok('confirmadas: ya se acordaron por WhatsApp', [...new Set(turnos.map((t) => t.estado))], ['confirmada']);
  ok('cada una sabe de qué alumno es', turnos.every((t) => t.cliente_id === matias), true);

  const venta = (await db.query(
    'select tipo, monto, metodo_pago, cliente_id from public.movimientos where id = $1', [i1.movimiento])).rows[0];
  ok('pagado: es un cobro como cualquier otro', venta.tipo, 'venta');
  ok('por el total', Number(venta.monto), 650000);
  ok('con la forma de pago que dijo', venta.metodo_pago, 'transferencia');

  // Sin catálogo ni equipo cargado: la agenda los necesita y el profe no
  // tiene por qué saberlo.
  const prof = (await db.query(
    'select reparto, user_id from public.turnos_profesional where empresa_id = $1', [P.empresaId])).rows;
  ok('él quedó como el que da las clases', prof.length, 1);
  ok('sin comisión: todo es suyo', prof[0].reparto, 'local');
  ok('y es él', prof[0].user_id, P.uid);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Un horario ocupado frena todo');
  // ═══════════════════════════════════════════════════════════
  // Ana quiere los jueves de 18:30 a 19:30: se pisa con Matías.
  const choca = await previa([[4], '18:30', '19:30', '2026-10-01', '2026-10-31', 50000, null]);
  ok('la vista previa avisa con quién choca', choca.choques[0].alumno, 'Matías Aranda');
  ok('los cinco jueves', choca.choques.length, 5);
  rechazado('y no deja inscribir',
    await inscribir(P.uid, P.empresaId, ana,
      [[4], '18:30', '19:30', '2026-10-01', '2026-10-31', 50000, null, false, 'efectivo', null]),
    'ya tenés a Matías');
  ok('ni media inscripción: Ana no tiene ninguna clase',
    (await db.query('select count(*)::int n from public.turnos_reserva where cliente_id = $1', [ana])).rows[0].n, 0);

  // Justo después, sin pisarse, sí.
  const pegada = await inscribir(P.uid, P.empresaId, ana,
    [[4], '19:00', '20:00', '2026-10-01', '2026-10-31', 50000, null, false, 'efectivo', null]);
  ok('una clase que empieza cuando termina la otra sí entra', pegada.ok, true);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Se gana al cobrar');
  // ═══════════════════════════════════════════════════════════
  const iAna = pegada.valor.rows[0].j;
  ok('sin pagar no hay venta', iAna.movimiento, null);

  let porCobrar = (await valor(P.uid, 'select public.por_cobrar_alumnos($1) j', [P.empresaId])).j;
  ok('aparece por cobrar', porCobrar.lista.map((x) => x.alumno), ['Ana Benítez']);
  ok('por su total: cinco jueves', Number(porCobrar.total), 250000);

  // Hoy entró lo de Matías, que pagó al inscribirse. Lo de Ana no entró, y
  // no puede aparecer como cobrado: es exactamente «se gana al cobrar».
  const hoy = (await valor(P.uid,
    'select public.resumen_financiero($1, public.hoy_empresa($1), public.hoy_empresa($1)) j', [P.empresaId])).j;
  ok('lo cobrado hoy es solo lo que entró: lo de Matías, no lo de Ana', Number(hoy.ventas), 650000);

  const pago = await como(P.uid, 'select public.cobrar_inscripcion($1,$2) j', [iAna.paquete, 'efectivo']);
  ok('Ana paga', pago.ok, true);
  porCobrar = (await valor(P.uid, 'select public.por_cobrar_alumnos($1) j', [P.empresaId])).j;
  ok('y deja de estar por cobrar', porCobrar.lista.length, 0);
  rechazado('no se cobra dos veces',
    await como(P.uid, 'select public.cobrar_inscripcion($1,$2)', [iAna.paquete, 'efectivo']), 'ya está cobrada');
  // Sobre una SIN cobrar: si no, la rechazaría por estar cobrada y esta
  // prueba pasaría por el motivo equivocado.
  const dani = await alumno('Dani Ortiz', '0985555555');
  const sinCobrar = (await inscribir(P.uid, P.empresaId, dani,
    [[5], '08:00', '09:00', '2026-10-01', '2026-10-31', 50000, null, false, 'efectivo', null])).valor.rows[0].j;
  rechazado('y el fiado no es un pago: ya está por cobrar',
    await como(P.uid, 'select public.cobrar_inscripcion($1,$2)', [sinCobrar.paquete, 'credito']), 'ya queda por cobrar');

  // ═══════════════════════════════════════════════════════════
  grupo('5 · El alumno que deja');
  // ═══════════════════════════════════════════════════════════
  // Una inscripción futura, para que tenga clases por delante.
  const bruno = await alumno('Bruno Gómez', '0983333333');
  const futura = (await inscribir(P.uid, P.empresaId, bruno,
    [[3], '10:00', '11:00', '2030-03-01', '2030-03-31', 40000, null, false, 'efectivo', null])).valor.rows[0].j;
  await como(P.uid, 'select public.cerrar_paquete($1, true)', [futura.paquete]);
  ok('cerrar saca sus clases de la agenda',
    (await db.query(`select count(*)::int n from public.turnos_reserva
                     where paquete_id = $1 and estado = 'confirmada'`, [futura.paquete])).rows[0].n, 0);
  ok('y el que dejó no queda por cobrar',
    (await valor(P.uid, 'select public.por_cobrar_alumnos($1) j', [P.empresaId])).j.lista
      .some((x) => x.alumno === 'Bruno Gómez'), false);

  // El horario quedó libre: se lo puede dar a otro.
  const otroAlumno = await alumno('Carla Ruiz', '0984444444');
  ok('ese horario queda libre para otro',
    (await inscribir(P.uid, P.empresaId, otroAlumno,
      [[3], '10:00', '11:00', '2030-03-01', '2030-03-31', 40000, null, false, 'efectivo', null])).ok, true);

  // Y si Bruno vuelve, sus clases no le pisan el lugar a Carla.
  await como(P.uid, 'select public.cerrar_paquete($1, false)', [futura.paquete]);
  ok('reabrir no le pisa el horario a quien lo tomó',
    (await db.query(`select count(*)::int n from public.turnos_reserva
                     where paquete_id = $1 and estado = 'confirmada'`, [futura.paquete])).rows[0].n, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Lo que no tiene sentido no entra');
  // ═══════════════════════════════════════════════════════════
  const mal = (args) => inscribir(P.uid, P.empresaId, matias, args);
  rechazado('sin días', await mal([[], '18:00', '19:00', '2027-01-01', '2027-01-31', 1, null, false, 'efectivo', null]), 'al menos un día');
  rechazado('terminando antes de empezar',
    await mal([LMJ, '19:00', '18:00', '2027-01-01', '2027-01-31', 1, null, false, 'efectivo', null]), 'terminar después');
  rechazado('un período al revés',
    await mal([LMJ, '18:00', '19:00', '2027-01-31', '2027-01-01', 1, null, false, 'efectivo', null]), 'período');
  rechazado('más de un año de una vez',
    await mal([LMJ, '18:00', '19:00', '2027-01-01', '2029-01-01', 1, null, false, 'efectivo', null]), 'un año');
  rechazado('sin precio',
    await mal([LMJ, '18:00', '19:00', '2027-01-01', '2027-01-31', null, null, false, 'efectivo', null]), 'cuánto cobrás');
  rechazado('un período en el que no cae ninguno de esos días',
    await mal([[0], '18:00', '19:00', '2027-01-04', '2027-01-05', 1, null, false, 'efectivo', null]), 'ningún día');

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Nadie de afuera');
  // ═══════════════════════════════════════════════════════════
  rechazado('otra academia no inscribe a un alumno de acá',
    await inscribir(Otro.uid, Otro.empresaId, matias,
      [LMJ, '08:00', '09:00', '2027-02-01', '2027-02-28', 1, null, false, 'efectivo', null]), 'no es de esta cuenta');
  rechazado('ni mira por cobrar de acá',
    await como(Otro.uid, 'select public.por_cobrar_alumnos($1)', [P.empresaId]), 'pertenecés');
  rechazado('ni cobra una inscripción de acá',
    await como(Otro.uid, 'select public.cobrar_inscripcion($1,$2)', [i1.paquete, 'efectivo']), 'pertenecés');

  // ═══════════════════════════════════════════════════════════
  grupo('8 · La clase del día (092)');
  // ═══════════════════════════════════════════════════════════
  // Matías: «atendido y cobrar no se puede, porque yo ya cobré por
  // adelantado. Lo que puedo marcar es que la clase se tuvo, o que no».
  const clases = (await db.query(
    'select id from public.turnos_reserva where paquete_id = $1 order by inicia', [i1.paquete])).rows.map((r) => r.id);
  const agenda = (await valor(P.uid, "select public.agenda_del_dia($1, '2026-10-01') j", [P.empresaId])).j;
  ok('la agenda del día dice de qué inscripción es cada clase', agenda[0].paquete_id, i1.paquete);

  const movsAntes = (await db.query('select count(*)::int n from public.movimientos where empresa_id = $1', [P.empresaId])).rows[0].n;
  const dada = await como(P.uid, 'select public.marcar_clase($1, true) j', [clases[0]]);
  ok('se marca la clase como dada', dada.ok, true);
  ok('y se descuenta del período', Number(dada.valor.rows[0].j.paquete.usadas), 1);
  ok('sin cobrar nada: ya estaba cobrado',
    (await db.query('select count(*)::int n from public.movimientos where empresa_id = $1', [P.empresaId])).rows[0].n, movsAntes);
  ok('en la agenda queda dada',
    (await db.query('select estado from public.turnos_reserva where id = $1', [clases[0]])).rows[0].estado, 'atendida');
  rechazado('y no se marca dos veces', await como(P.uid, 'select public.marcar_clase($1, true)', [clases[0]]), 'ya se cerró');

  // La clase que no se tuvo: en cada falta se decide si se descuenta.
  const perdida = await como(P.uid, 'select public.marcar_clase($1, false, true) j', [clases[1]]);
  ok('no se tuvo y se descuenta: cuenta como falta', Number(perdida.valor.rows[0].j.paquete.usadas), 2);
  const guardada = await como(P.uid, 'select public.marcar_clase($1, false, false) j', [clases[2]]);
  ok('no se tuvo y NO se descuenta: la clase sigue disponible', Number(guardada.valor.rows[0].j.paquete.usadas), 2);
  ok('las dos quedan como no tenidas en la agenda',
    (await db.query('select estado from public.turnos_reserva where id in ($1,$2)', [clases[1], clases[2]])).rows.map((r) => r.estado), ['no_vino', 'no_vino']);
  ok('y en la historia del alumno se distingue la falta',
    (await paquetesDe(matias)).find((x) => x.id === i1.paquete).historia.map((h) => h.motivo).sort(), ['dada', 'falta']);

  // La racha del profe: marcar la clase es su «cargué algo hoy».
  ok('el día de la clase dada cuenta para la racha',
    (await db.query("select public.dias_cargados($1, '2026-12-31') d", [P.empresaId])).rows.map((r) => r.d.toISOString().slice(0, 10)).includes('2026-10-01'), true);

  // El panel del profe: sin vendido ni ganancia bruta.
  const panel = (await valor(P.uid, "select public.panel_profe($1, '2026-10-01', '2026-10-31') j", [P.empresaId])).j;
  ok('cuenta las clases dadas del período', panel.clases_periodo, 1);
  ok('sabe cuántos alumnos activos tiene', panel.alumnos_activos >= 1, true);
  ok('y cuánto le falta cobrar', Number(panel.por_cobrar) > 0, true);
  rechazado('un turno que no es de una inscripción no se marca así',
    await como(P.uid, 'select public.marcar_clase($1, true)', ['00000000-0000-0000-0000-000000000000']), 'no existe');

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Qué se le enseña (094)');
  // ═══════════════════════════════════════════════════════════
  // Matías: «especificar qué se le va a enseñar a ese alumno: inglés,
  // matemática, o algo distinto». Se anota al inscribir y se ve donde se
  // mira el día.
  const conMateria = (uid, cliente, args, materia) => como(uid,
    'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) j',
    [P.empresaId, cliente, ...args, materia]);
  const eva = await alumno('Eva Giménez', '0986666666');
  const ingles = await conMateria(P.uid, eva,
    [[6], '09:00', '10:00', '2026-10-01', '2026-10-31', 50000, null, false, 'efectivo', null], '  Inglés  ');
  ok('se inscribe con su materia', ingles.ok, true);
  const pqEva = (await paquetesDe(eva))[0];
  ok('la ficha dice qué se le enseña, sin los espacios de más', pqEva.materia, 'Inglés');

  // Sábado 3 de octubre: la clase de Eva.
  const agendaSab = (await valor(P.uid, "select public.agenda_del_dia($1, '2026-10-03') j", [P.empresaId])).j;
  ok('la agenda del día muestra la materia de la clase',
    agendaSab.find((x) => x.cliente === 'Eva Giménez').materia, 'Inglés');
  ok('y la clase que no dijo materia queda sin ella, sin inventarla',
    (await valor(P.uid, "select public.agenda_del_dia($1, '2026-10-01') j", [P.empresaId])).j
      .find((x) => x.cliente === 'Matías Aranda').materia, null);
  ok('lo que falta cobrar también la dice',
    (await valor(P.uid, 'select public.por_cobrar_alumnos($1) j', [P.empresaId])).j.lista
      .find((x) => x.alumno === 'Eva Giménez').materia, 'Inglés');

  // Las que ya usó, para sugerirlas: la más usada primero.
  const fede = await alumno('Fede Rojas', '0987777777');
  await conMateria(P.uid, fede,
    [[6], '10:00', '11:00', '2026-10-01', '2026-10-31', 50000, null, false, 'efectivo', null], 'Matemática');
  await conMateria(P.uid, fede,
    [[0], '10:00', '11:00', '2026-10-01', '2026-10-31', 50000, null, false, 'efectivo', null], 'Inglés');
  ok('sugiere las que ya usó, la más usada primero',
    (await valor(P.uid, 'select public.materias_usadas($1) j', [P.empresaId])).j, ['Inglés', 'Matemática']);

  // Vacía es «no se dijo», no una materia en blanco.
  const gabi = await alumno('Gabi Paredes', '0988888888');
  await conMateria(P.uid, gabi,
    [[6], '11:00', '12:00', '2026-10-01', '2026-10-31', 50000, null, false, 'efectivo', null], '   ');
  ok('una materia vacía se guarda como no dicha', (await paquetesDe(gabi))[0].materia, null);
  ok('y no aparece entre las sugerencias',
    (await valor(P.uid, 'select public.materias_usadas($1) j', [P.empresaId])).j.includes(''), false);
  rechazado('otra academia no ve las materias de acá',
    await como(Otro.uid, 'select public.materias_usadas($1)', [P.empresaId]), 'pertenecés');

  // ═══════════════════════════════════════════════════════════
  grupo('10 · El cobro dice a qué banco entró (095)');
  // ═══════════════════════════════════════════════════════════
  // Matías: «si se me transfirió en mi Continental y en Orden se me carga
  // en el Atlas, no tiene sentido». Tres cuentas, como en su billetera: las
  // transferencias caen por defecto en el Atlas; el Continental no reclama
  // ninguna forma de pago.
  const cuenta = async (nombre, tipo, metodos) => (await valor(P.uid,
    'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id', [P.empresaId, nombre, tipo, 0, metodos])).id;
  const enMano = await cuenta('Efectivo', 'efectivo', ['efectivo']);
  const atlas = await cuenta('Atlas', 'banco', ['transferencia', 'tarjeta']);
  const continental = await cuenta('Continental', 'banco', []);
  const deOtro = (await valor(Otro.uid,
    'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id', [Otro.empresaId, 'Banco de otro', 'banco', 0, []])).id;
  const saldo = async (id) => Number((await valor(P.uid, 'select public.billetera($1) j', [P.empresaId])).j
    .cuentas.find((c) => c.id === id).saldo);
  const cuentaDe = async (mov) => (await db.query(
    'select cuenta_id from public.movimientos where id = $1', [mov])).rows[0].cuenta_id;

  // Una inscripción sin pagar, de Gs. 200.000 cerrado, para cobrar después.
  // Los miércoles de mayo de 2027, cada uno a su hora: no se pisan.
  const sinPagar = async (nombre, tel, desde, hasta) => {
    const id = await alumno(nombre, tel);
    const r = await inscribir(P.uid, P.empresaId, id,
      [[3], desde, hasta, '2027-05-01', '2027-05-31', null, 200000, false, 'efectivo', null]);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j.paquete;
  };
  const cobrar = (uid, paquete, metodo, cuentaId) => como(uid,
    'select public.cobrar_inscripcion($1,$2,null,$3) j', [paquete, metodo, cuentaId]);

  const pqHugo = await sinPagar('Hugo Vera', '0989000001', '06:00', '07:00');
  const atlasAntes = await saldo(atlas);
  const alContinental = await cobrar(P.uid, pqHugo, 'transferencia', continental);
  ok('se cobra una transferencia diciendo el banco', alContinental.ok, true);
  const movHugo = alContinental.valor.rows[0].j.movimiento;
  ok('entra al Continental, que es donde llegó', await cuentaDe(movHugo), continental);
  ok('y el Continental la suma', await saldo(continental), 200000);
  ok('el Atlas no se entera', await saldo(atlas), atlasAntes);
  ok('sigue siendo una transferencia', (await db.query(
    'select metodo_pago from public.movimientos where id = $1', [movHugo])).rows[0].metodo_pago, 'transferencia');

  const pqIris = await sinPagar('Iris Mereles', '0989000002', '07:00', '08:00');
  const sinDecir = await cobrar(P.uid, pqIris, 'transferencia', null);
  ok('si no se dice el banco, va al de las transferencias, como siempre',
    await cuentaDe(sinDecir.valor.rows[0].j.movimiento), atlas);

  const pqJuan = await sinPagar('Juan Duarte', '0989000003', '08:00', '09:00');
  rechazado('no entra en la cuenta de otra empresa', await cobrar(P.uid, pqJuan, 'transferencia', deOtro), 'no existe');
  ok('y ese rechazo no deja nada cobrado a medias', (await db.query(
    'select movimiento_id from public.paquetes where id = $1', [pqJuan])).rows[0].movimiento_id, null);

  // Un ayudante cobra, pero no decide dónde queda la plata del dueño.
  const ayudante = await H.sumarMiembro(db, P.empresaId, 'ayudante@ingles.com', 'vendedor');
  rechazado('un vendedor no elige la cuenta', await cobrar(ayudante, pqJuan, 'transferencia', continental), 'dueño');
  const delAyudante = await cobrar(ayudante, pqJuan, 'efectivo', null);
  ok('pero cobra igual, y va a la cuenta de esa forma de pago',
    await cuentaDe(delAyudante.valor.rows[0].j.movimiento), enMano);

  // Al inscribir, pagado en el momento, también se elige el banco.
  const kevin = await alumno('Kevin Ortiz', '0989000004');
  const conCuenta = (args) => como(P.uid,
    'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) j', [P.empresaId, kevin, ...args]);
  const pagadoAlInscribir = await conCuenta(
    [[3], '09:00', '10:00', '2027-05-01', '2027-05-31', null, 150000, true, 'transferencia', null, 'Guitarra', continental]);
  ok('inscribir pagado en el Continental', pagadoAlInscribir.ok, true);
  ok('lo deja en el Continental', await cuentaDe(pagadoAlInscribir.valor.rows[0].j.movimiento), continental);
  ok('que ya suma los dos cobros', await saldo(continental), 350000);

  rechazado('ni al inscribir se cobra en la cuenta de otro',
    await conCuenta([[3], '11:00', '12:00', '2027-05-01', '2027-05-31', null, 150000, true, 'transferencia', null, null, deOtro]),
    'no existe');
  // Los miércoles de mayo de 2027 son cuatro: solo los de la primera.
  ok('y esa inscripción rechazada no dejó clases en la agenda', (await db.query(
    'select count(*)::int n from public.turnos_reserva where cliente_id = $1', [kevin])).rows[0].n, 4);

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE INSCRIPCIONES FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE INSCRIPCIONES PASARON`);
  process.exit(0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
