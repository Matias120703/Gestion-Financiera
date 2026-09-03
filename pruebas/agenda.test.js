/**
 * Pruebas de la agenda de turnos (migraciones 036 y 037).
 *
 * Un sistema de turnos falla de tres formas, y las tres arruinan la confianza
 * del que lo usa:
 *
 *   · ofrece un hueco que no existe —el mediodía que no trabaja, un feriado,
 *     una hora ya pasada— y el cliente llega a un local cerrado;
 *   · deja que dos personas se queden con el mismo turno;
 *   · pierde el rastro de quién no vino, y la agenda de la semana siguiente
 *     se llena de fantasmas.
 *
 * Las tres tienen su comprobación acá.
 *
 * LO QUE ESTE ENTORNO NO PUEDE PROBAR
 *
 * PGlite corre sobre una sola conexión, así que dos reservas *de verdad*
 * simultáneas no se pueden montar. Lo que se comprueba abajo es la lógica:
 * pedir un horario ya tomado se rechaza. La protección contra la carrera real
 * —`for update` sobre la fila del profesional, que serializa las reservas de
 * esa persona— es el mismo recurso que `anular_movimiento` usa desde la 002 y
 * que la prueba de stock tampoco puede ejercitar. Conviene saberlo antes de
 * creer que este archivo cubre todo.
 */
const H = require('./ayuda-db.js');

let fallos = 0;
let corridas = 0;

function grupo(nombre) {
  console.log(`\n── ${nombre} ${'─'.repeat(Math.max(0, 58 - nombre.length))}`);
}

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`);
  } else {
    console.log(`  ✓ ${nombre} → ${a}`);
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
  console.log(`  ✓ ${nombre} → rechazada`);
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

(async () => {
  const db = await H.crearBase();

  const local = await H.montarEmpresa(db, { email: 'dueno@peluqueria.com', nombre: 'Peluquería Norte' });
  const uidPedro = await H.sumarMiembro(db, local.empresaId, 'pedro@peluqueria.com', 'vendedor');

  const llamar = (uid, sql, args) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args) => {
    const r = await llamar(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };
  const crudo = async (sql, args) => (await db.query(sql, args)).rows[0];

  const corte = await H.crearProducto(db, local.empresaId, local.uid,
    { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
  const barba = await H.crearProducto(db, local.empresaId, local.uid,
    { nombre: 'Corte + barba', costo: 0, precio: 70000, controla_stock: false });
  const cera = await H.crearProducto(db, local.empresaId, local.uid,
    { nombre: 'Cera', costo: 20000, precio: 35000, stock: 5, controla_stock: true });

  const pedro = (await valor(local.uid,
    "select public.guardar_profesional($1,$2,'comision',50,$3) as id",
    [local.empresaId, 'Pedro', uidPedro])).id;

  // Un lunes futuro fijo, para que la prueba no dependa de qué día se corra.
  const proximoLunes = (await crudo(
    "select (date_trunc('week', (now() at time zone 'America/Asuncion')::date + 14) + interval '0 day')::date as d"
  )).d;
  const lunes = new Date(proximoLunes).toISOString().slice(0, 10);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Sin horario cargado no hay huecos');
  // ═══════════════════════════════════════════════════════════

  const huecos = async (fecha, producto = corte, prof = pedro) =>
    (await db.query('select count(*)::int n from public.huecos_del_dia($1,$2,$3)',
      [prof, fecha, producto])).rows[0].n;

  ok('una agenda vacía no ofrece nada', await huecos(lunes), 0);

  aceptado('el dueño define cuánto dura un corte',
    await llamar(local.uid, 'select public.guardar_servicio_agenda($1,$2,$3)',
      [local.empresaId, corte, 30]));

  aceptado('y cuánto dura el corte con barba',
    await llamar(local.uid, 'select public.guardar_servicio_agenda($1,$2,$3)',
      [local.empresaId, barba, 45]));

  rechazado('un producto con stock no se agenda',
    await llamar(local.uid, 'select public.guardar_servicio_agenda($1,$2,$3)',
      [local.empresaId, cera, 30]),
    'no es un servicio');

  rechazado('ni una duración imposible',
    await llamar(local.uid, 'select public.guardar_servicio_agenda($1,$2,$3)',
      [local.empresaId, corte, 900]),
    'duración');

  ok('con el servicio definido pero sin horario, sigue sin haber huecos',
    await huecos(lunes), 0);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · El horario de la semana');
  // ═══════════════════════════════════════════════════════════

  aceptado('Pedro carga su propio horario del lunes por la mañana',
    await llamar(uidPedro, 'select public.guardar_horario($1,$2,1,$3,$4)',
      [local.empresaId, pedro, '08:00', '12:00']));

  aceptado('y el de la tarde, como franja aparte',
    await llamar(uidPedro, 'select public.guardar_horario($1,$2,1,$3,$4)',
      [local.empresaId, pedro, '15:00', '18:00']));

  rechazado('pero no una franja que se pisa con la suya',
    await llamar(uidPedro, 'select public.guardar_horario($1,$2,1,$3,$4)',
      [local.empresaId, pedro, '11:00', '13:00']),
    'superpone');

  rechazado('ni una que termina antes de empezar',
    await llamar(uidPedro, 'select public.guardar_horario($1,$2,1,$3,$4)',
      [local.empresaId, pedro, '18:00', '15:00']),
    'posterior');

  // 8 a 12 son 8 turnos de 30 min; 15 a 18 son 6. El mediodía NO aparece.
  ok('cortes de 30 minutos: 8 a la mañana y 6 a la tarde', await huecos(lunes), 14);

  // 45 minutos entran 5 veces en 4 horas y 4 en 3 horas.
  ok('con el corte de 45 minutos entran menos turnos', await huecos(lunes, barba), 9);

  const primeros = (await db.query(
    "select to_char(inicia at time zone 'America/Asuncion', 'HH24:MI') as h from public.huecos_del_dia($1,$2,$3) limit 3",
    [pedro, lunes, corte])).rows.map((r) => r.h);
  ok('el primero es a las 8 y van cada media hora', primeros, ['08:00', '08:30', '09:00']);

  const mediodia = (await db.query(
    `select count(*)::int n from public.huecos_del_dia($1,$2,$3)
      where to_char(inicia at time zone 'America/Asuncion', 'HH24:MI') between '12:00' and '14:59'`,
    [pedro, lunes, corte])).rows[0].n;
  ok('el mediodía no se ofrece: no es un turno ocupado, es que no trabaja', mediodia, 0);

  const martes = (await crudo('select ($1::date + 1) as d', [lunes])).d;
  ok('un martes sin horario cargado no ofrece nada',
    await huecos(new Date(martes).toISOString().slice(0, 10)), 0);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · El día que no es como los demás');
  // ═══════════════════════════════════════════════════════════

  aceptado('el dueño cierra el local por feriado',
    await llamar(local.uid, 'select public.guardar_excepcion($1,$2,true,null,null,null,$3)',
      [local.empresaId, lunes, 'Feriado']));

  ok('ese día no hay turnos para nadie', await huecos(lunes), 0);

  aceptado('pero Pedro decide abrir igual, medio día',
    await llamar(uidPedro, 'select public.guardar_excepcion($1,$2,false,$3,$4,$5,$6)',
      [local.empresaId, lunes, pedro, '09:00', '11:00', 'Abro igual']));

  // La excepción de la persona manda sobre la del local.
  ok('la excepción de él gana sobre el feriado del local', await huecos(lunes), 4);

  const exId = (await crudo(
    'select id from public.turnos_excepcion where profesional_id = $1 and fecha = $2', [pedro, lunes])).id;
  aceptado('y puede quitarla', await llamar(uidPedro, 'select public.borrar_excepcion($1,$2)', [local.empresaId, exId]));
  ok('vuelve a mandar el feriado del local', await huecos(lunes), 0);

  const feriadoId = (await crudo(
    'select id from public.turnos_excepcion where profesional_id is null and fecha = $1', [lunes])).id;
  rechazado('un vendedor no levanta el feriado del local',
    await llamar(uidPedro, 'select public.borrar_excepcion($1,$2)', [local.empresaId, feriadoId]),
    'dueño de la cuenta');

  await llamar(local.uid, 'select public.borrar_excepcion($1,$2)', [local.empresaId, feriadoId]);
  ok('sin feriado, la semana vuelve a la normalidad', await huecos(lunes), 14);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Reservar');
  // ═══════════════════════════════════════════════════════════

  const alas = async (hhmm) => (await crudo(
    "select ($1::date + $2::time) at time zone 'America/Asuncion' as t", [lunes, hhmm])).t;

  const nueve = await alas('09:00');

  const r1 = await valor(local.uid,
    'select public.reservar($1,$2,$3,$4,$5,$6) j',
    [local.empresaId, pedro, corte, nueve, 'Juan Pérez', '0981111111']);

  ok('la reserva queda tomada', Boolean(r1.j.reserva), true);
  ok('y trae su enlace para cancelar', Boolean(r1.j.token), true);

  ok('ese hueco ya no se ofrece', await huecos(lunes), 13);

  rechazado('nadie más puede quedarse con el mismo horario',
    await llamar(local.uid, 'select public.reservar($1,$2,$3,$4,$5)',
      [local.empresaId, pedro, corte, nueve, 'Otro cliente']),
    'ya no está disponible');

  rechazado('ni reservar a una hora que no existe en la agenda',
    await llamar(local.uid, 'select public.reservar($1,$2,$3,$4,$5)',
      [local.empresaId, pedro, corte, await alas('03:00'), 'Madrugador']),
    'ya no está disponible');

  rechazado('ni sin nombre',
    await llamar(local.uid, 'select public.reservar($1,$2,$3,$4,$5)',
      [local.empresaId, pedro, corte, await alas('10:00'), '   ']),
    'nombre');

  // Los turnos se cortan del tamaño del servicio: el corte con barba dura 45
  // minutos, así que va cada 45 desde las 8 —08:00, 08:45, 09:30— y no cae
  // en la grilla de media hora del corte simple.
  ok('el corte con barba de las 09:30 está libre antes de reservar',
    (await db.query(
      `select count(*)::int n from public.huecos_del_dia($1,$2,$3)
        where to_char(inicia at time zone 'America/Asuncion', 'HH24:MI') = '09:30'`,
      [pedro, lunes, barba])).rows[0].n, 1);

  await llamar(local.uid, 'select public.reservar($1,$2,$3,$4,$5)',
    [local.empresaId, pedro, barba, await alas('09:30'), 'Ana']);

  // Ese turno ocupa de 09:30 a 10:15, así que se lleva puestos los dos de
  // media hora que se le cruzan.
  const pisados = (await db.query(
    `select count(*)::int n from public.huecos_del_dia($1,$2,$3)
      where to_char(inicia at time zone 'America/Asuncion', 'HH24:MI') in ('09:30','10:00')`,
    [pedro, lunes, corte])).rows[0].n;
  ok('un turno de 45 minutos tapa los dos de 30 que se le cruzan', pisados, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Cancelar libera el hueco');
  // ═══════════════════════════════════════════════════════════

  const antes = await huecos(lunes);
  aceptado('el cliente cancela con su enlace',
    await llamar(local.uid, 'select public.cancelar_reserva($1)', [r1.j.token]));
  ok('y el hueco vuelve a ofrecerse', await huecos(lunes), antes + 1);

  const repetida = await valor(local.uid, 'select public.cancelar_reserva($1) j', [r1.j.token]);
  ok('cancelar dos veces no rompe nada', repetida.j.ya_estaba, true);

  rechazado('un enlace inventado no cancela nada',
    await llamar(local.uid, 'select public.cancelar_reserva($1)',
      ['00000000-0000-0000-0000-000000000000']),
    'no existe');

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Atender: el turno se convierte en venta');
  // ═══════════════════════════════════════════════════════════

  const r2 = await valor(local.uid,
    'select public.reservar($1,$2,$3,$4,$5) j',
    [local.empresaId, pedro, corte, await alas('11:00'), 'Carlos']);

  const cobro = await valor(uidPedro, 'select public.atender_reserva($1) j', [r2.j.reserva]);

  ok('se cobró el precio del servicio', Number(cobro.j.monto), 50000);
  ok('a Pedro le tocan la mitad', Number(cobro.j.parte_profesional), 25000);
  ok('y la reserva queda atendida',
    (await crudo('select estado from public.turnos_reserva where id=$1', [r2.j.reserva])).estado, 'atendida');
  ok('con el corte enganchado',
    Boolean((await crudo('select atribucion_id from public.turnos_reserva where id=$1',
      [r2.j.reserva])).atribucion_id), true);

  rechazado('no se atiende dos veces',
    await llamar(local.uid, 'select public.atender_reserva($1)', [r2.j.reserva]),
    'ya se cerró');

  ok('el cobro entró a la liquidación de Pedro',
    Number((await valor(local.uid, 'select public.liquidacion($1,$2,$3) j',
      [local.empresaId, '2000-01-01', '2100-01-01'])).j.find((x) => x.nombre === 'Pedro').le_toca), 25000);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · El que no vino');
  // ═══════════════════════════════════════════════════════════

  const r3 = await valor(local.uid,
    'select public.reservar($1,$2,$3,$4,$5) j',
    [local.empresaId, pedro, corte, await alas('11:30'), 'Fantasma']);

  aceptado('se marca que no vino',
    await llamar(local.uid, 'select public.marcar_no_vino($1)', [r3.j.reserva]));

  ok('no se le cobró nada a nadie',
    Number((await valor(local.uid, 'select public.liquidacion($1,$2,$3) j',
      [local.empresaId, '2000-01-01', '2100-01-01'])).j.find((x) => x.nombre === 'Pedro').le_toca), 25000);

  rechazado('y no se puede volver a cerrar',
    await llamar(local.uid, 'select public.marcar_no_vino($1)', [r3.j.reserva]),
    'ya se cerró');

  // ═══════════════════════════════════════════════════════════
  grupo('8 · La agenda del día');
  // ═══════════════════════════════════════════════════════════

  const agenda = (await valor(uidPedro, 'select public.agenda_del_dia($1,$2) j', [local.empresaId, lunes])).j;

  ok('están los turnos del día, sin las canceladas', agenda.length, 3);
  ok('en orden de hora',
    agenda.map((x) => x.cliente), ['Ana', 'Carlos', 'Fantasma']);
  ok('con el teléfono a mano', agenda[1].cliente, 'Carlos');

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Aislamiento entre negocios');
  // ═══════════════════════════════════════════════════════════

  const otra = await H.montarEmpresa(db, { email: 'otra@peluqueria.com', nombre: 'Otra Peluquería' });

  rechazado('un extraño no lee la agenda ajena',
    await llamar(otra.uid, 'select public.agenda_del_dia($1)', [local.empresaId]),
    'No pertenecés');

  rechazado('ni reserva en su agenda',
    await llamar(otra.uid, 'select public.reservar($1,$2,$3,$4,$5)',
      [local.empresaId, pedro, corte, await alas('16:00'), 'Colado']),
    'no está en el equipo|No pertenecés');

  ok('ni ve un solo dato de sus clientes',
    (await db.query('select count(*)::int n from public.turnos_reserva')).rows[0].n > 0
      && (await valor(otra.uid, 'select count(*)::int n from public.turnos_reserva')).n === 0, true);

  console.log('\n══════════════════════════════════════════════════════════════');
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE LA AGENDA FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE LA AGENDA PASARON`);
  process.exit(0);
})().catch((e) => { console.error('error inesperado:', e); process.exit(2); });
