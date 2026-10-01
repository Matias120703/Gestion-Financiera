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

/** Postgres devuelve los enteros grandes como texto; acá se comparan números. */
const num = (v) => Number(v);

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

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Los huecos desde el mostrador');
  //
  // La agenda no se llena sola por el link: el turno que más entra es el del
  // que llama por teléfono. Para ofrecerle horarios hay que leer los huecos,
  // y el motor que los calcula no pregunta de quién es la agenda. Por eso la
  // 040 lo cierra y abre una puerta que sí pregunta.
  // ═══════════════════════════════════════════════════════════

  rechazado('el motor ya no se puede llamar de afuera',
    await llamar(local.uid, 'select * from public.huecos_del_dia($1,$2,$3)', [pedro, lunes, corte]),
    'permission denied|permiso');

  const librePorElMotor = await huecos(lunes);
  const localHuecos = async (uid, emp, prof, prod, fecha) =>
    (await valor(uid, 'select public.huecos_local($1,$2,$3,$4) j', [emp, prof, prod, fecha])).j;

  const delDueno = await localHuecos(local.uid, local.empresaId, pedro, corte, lunes);
  ok('el dueño ve por la puerta nueva exactamente lo que calcula el motor',
    delDueno.length, librePorElMotor);
  ok('y hay huecos de verdad para ofrecer', delDueno.length > 0, true);
  ok('cada uno viene con su hora de fin, para leer «de tal a tal»',
    Object.keys(delDueno[0]).sort(), ['inicia', 'termina']);

  ok('el empleado que atiende el teléfono también los ve',
    (await localHuecos(uidPedro, local.empresaId, pedro, corte, lunes)).length, delDueno.length);

  rechazado('un extraño no ve los horarios libres del local',
    await llamar(otra.uid, 'select public.huecos_local($1,$2,$3,$4)',
      [local.empresaId, pedro, corte, lunes]),
    'No pertenecés');

  // Desde la 048 el profesional tiene que ser miembro. Acá alcanza con el
  // propio dueño: lo que se prueba es el aislamiento entre negocios, no
  // quién corta el pelo.
  const profAjeno = (await valor(otra.uid,
    "select public.guardar_profesional($1,$2,'sueldo',0,$3) as id",
    [otra.empresaId, 'Ajeno', otra.uid])).id;

  ok('pertenecer a un negocio no sirve para espiar al profesional de otro',
    await localHuecos(otra.uid, otra.empresaId, pedro, corte, lunes), []);
  ok('ni al revés: un profesional que no es de esta cuenta no devuelve nada',
    await localHuecos(local.uid, local.empresaId, profAjeno, corte, lunes), []);

  ok('un día que ya pasó no ofrece nada',
    await localHuecos(local.uid, local.empresaId, pedro, corte, '2020-01-06'), []);
  ok('ni una fecha absurda a dos años vista',
    await localHuecos(local.uid, local.empresaId, pedro, corte,
      (await crudo("select (public.hoy_empresa($1) + 400)::date d", [local.empresaId])).d), []);

  ok('un servicio que no se reserva no ofrece horarios',
    await localHuecos(local.uid, local.empresaId, pedro, cera, lunes), []);

  // Y el círculo se cierra: se reserva uno de los huecos que ofreció la
  // puerta, y esa misma puerta deja de ofrecerlo.
  const tomado = delDueno[0].inicia;
  aceptado('se anota por teléfono a quien llamó, en un hueco que ofreció la puerta',
    await llamar(uidPedro, 'select public.reservar($1,$2,$3,$4,$5,$6)',
      [local.empresaId, pedro, corte, tomado, 'Llamó por teléfono', '0982222222']));

  const despues = await localHuecos(local.uid, local.empresaId, pedro, corte, lunes);
  ok('y ese horario ya no se le ofrece a nadie más',
    despues.some((h) => h.inicia === tomado), false);
  ok('los demás siguen libres', despues.length, delDueno.length - 1);

  // ═══════════════════════════════════════════════════════════
  grupo('11 · Mover y cancelar desde el local');
  //
  // Hasta la 041 la única forma de liberar un turno era que el cliente lo
  // cancelara desde su enlace. Adentro del local lo único a mano era «no
  // vino», que es una acusación y no una cancelación: se la come el cliente
  // que sí avisó.
  // ═══════════════════════════════════════════════════════════

  const libres = async (fecha, prod = corte, prof = pedro) =>
    (await valor(local.uid, 'select public.huecos_local($1,$2,$3,$4) j',
      [local.empresaId, prof, prod, fecha])).j.map((h) => h.inicia);

  const estadoDe = async (id) =>
    (await crudo('select estado from public.turnos_reserva where id=$1', [id])).estado;

  const disponibles = await libres(lunes);
  const horaA = disponibles[0];
  const horaB = disponibles[1];

  const turnoA = (await valor(uidPedro, 'select public.reservar($1,$2,$3,$4,$5,$6) j',
    [local.empresaId, pedro, corte, horaA, 'Marta', '0983333333'])).j;
  const turnoB = (await valor(uidPedro, 'select public.reservar($1,$2,$3,$4,$5,$6) j',
    [local.empresaId, pedro, corte, horaB, 'Rosa', '0984444444'])).j;

  // ---- cancelar ----

  rechazado('un extraño no puede cancelar un turno ajeno',
    await llamar(otra.uid, 'select public.cancelar_turno($1)', [turnoA.reserva]),
    'No pertenecés');

  ok('el hueco de Marta está tomado antes de cancelar',
    (await libres(lunes)).includes(horaA), false);

  aceptado('el empleado que atiende el teléfono cancela el turno de Marta',
    await llamar(uidPedro, 'select public.cancelar_turno($1)', [turnoA.reserva]));

  ok('quedó cancelado, no marcado como que no vino', await estadoDe(turnoA.reserva), 'cancelada');
  ok('y el hueco volvió a estar libre para otro',
    (await libres(lunes)).includes(horaA), true);

  ok('cancelar dos veces no rompe nada, avisa que ya estaba',
    (await valor(local.uid, 'select public.cancelar_turno($1) j', [turnoA.reserva])).j.ya_estaba, true);

  // ---- mover ----

  rechazado('un extraño tampoco puede mover un turno ajeno',
    await llamar(otra.uid, 'select public.mover_turno($1,$2,$3)', [turnoB.reserva, pedro, horaA]),
    'No pertenecés');

  rechazado('no se mueve a una hora en la que el local no atiende',
    await llamar(local.uid, 'select public.mover_turno($1,$2,$3)',
      [turnoB.reserva, pedro, await alas('03:00')]),
    'no está disponible');

  rechazado('ni al mismo horario que ya tiene',
    await llamar(local.uid, 'select public.mover_turno($1,$2,$3)', [turnoB.reserva, pedro, horaB]),
    'no está disponible');

  const tokenAntes = (await crudo(
    'select token from public.turnos_reserva where id=$1', [turnoB.reserva])).token;

  aceptado('Rosa llama y lo pasa al hueco que dejó Marta',
    await llamar(uidPedro, 'select public.mover_turno($1,$2,$3)', [turnoB.reserva, pedro, horaA]));

  ok('el turno quedó en el horario nuevo',
    (await crudo('select inicia from public.turnos_reserva where id=$1',
      [turnoB.reserva])).inicia.toISOString(), new Date(horaA).toISOString());
  ok('el horario viejo volvió a estar libre', (await libres(lunes)).includes(horaB), true);
  ok('y el nuevo quedó tomado', (await libres(lunes)).includes(horaA), false);
  ok('el enlace que tiene el cliente sigue siendo el mismo',
    (await crudo('select token from public.turnos_reserva where id=$1', [turnoB.reserva])).token,
    tokenAntes);

  // ---- mover de profesional ----

  const uidJuan = await H.sumarMiembro(db, local.empresaId, 'juan@barberia.com', 'vendedor');
  const juan = (await valor(local.uid,
    "select public.guardar_profesional($1,$2,'comision',40,$3) as id",
    [local.empresaId, 'Juan', uidJuan])).id;
  aceptado('Juan también trabaja los lunes',
    await llamar(local.uid, 'select public.guardar_horario($1,$2,1,$3,$4)',
      [local.empresaId, juan, '08:00', '12:00']));

  const deJuan = await libres(lunes, corte, juan);

  rechazado('no se puede pasar el turno a alguien de otro negocio',
    await llamar(local.uid, 'select public.mover_turno($1,$2,$3)',
      [turnoB.reserva, profAjeno, deJuan[0]]),
    'no está en el equipo');

  aceptado('Pedro se enfermó: el turno pasa a Juan',
    await llamar(local.uid, 'select public.mover_turno($1,$2,$3)',
      [turnoB.reserva, juan, deJuan[0]]));

  ok('el turno ahora es de Juan',
    (await crudo('select profesional_id from public.turnos_reserva where id=$1',
      [turnoB.reserva])).profesional_id, juan);
  ok('y la agenda de Pedro quedó libre a esa hora',
    (await libres(lunes)).includes(horaA), true);

  // ---- lo que ya se cerró no se toca ----

  const turnoC = (await valor(local.uid, 'select public.reservar($1,$2,$3,$4,$5) j',
    [local.empresaId, pedro, corte, horaB, 'Elena'])).j;
  aceptado('se atiende y se cobra a Elena',
    await llamar(local.uid, 'select public.atender_reserva($1)', [turnoC.reserva]));

  rechazado('un turno ya cobrado no se cancela: eso es anular una venta',
    await llamar(local.uid, 'select public.cancelar_turno($1)', [turnoC.reserva]),
    'ya se cerró');
  rechazado('ni se mueve',
    await llamar(local.uid, 'select public.mover_turno($1,$2,$3)',
      [turnoC.reserva, pedro, horaA]),
    'ya se cerró');
  rechazado('y uno cancelado tampoco se mueve',
    await llamar(local.uid, 'select public.mover_turno($1,$2,$3)',
      [turnoA.reserva, pedro, horaA]),
    'ya se cerró');

  // ═══════════════════════════════════════════════════════════
  grupo('12 · Vacaciones: cerrar y reabrir varios días de una');
  //
  // `turnos_excepcion` guarda un día por fila, pero nadie se toma vacaciones
  // de un día. Sin esto, «me voy del 10 al 24» eran catorce llamadas sueltas
  // desde el navegador: si fallaba la séptima, quedaba media vacación
  // cerrada y el link seguía ofreciendo turnos en la otra mitad.
  // ═══════════════════════════════════════════════════════════

  const masDias = async (n) => new Date((await crudo(
    'select ($1::date + $2::int)::date d', [lunes, n])).d).toISOString().slice(0, 10);

  const lunesA = await masDias(28);
  const lunesB = await masDias(35);

  ok('antes de cerrar, ese lunes tiene su día completo de turnos',
    await huecos(lunesA), 14);

  rechazado('un vendedor no manda al local de vacaciones',
    await llamar(uidPedro, 'select public.cerrar_dias($1,$2,$3)', [local.empresaId, lunesA, lunesB]),
    'dueño de la cuenta');

  rechazado('ni se pueden dar vuelta las fechas',
    await llamar(local.uid, 'select public.cerrar_dias($1,$2,$3)', [local.empresaId, lunesB, lunesA]),
    'anterior al primero');

  rechazado('ni cerrar diez años por un error de tipeo',
    await llamar(local.uid, 'select public.cerrar_dias($1,$2,$3)',
      [local.empresaId, lunesA, await masDias(3000)]),
    'más de un año');

  ok('el dueño cierra las dos semanas de una sola vez',
    Number((await valor(local.uid, 'select public.cerrar_dias($1,$2,$3,null,$4) j',
      [local.empresaId, lunesA, lunesB, 'Vacaciones'])).j.dias), 8);

  ok('el primer lunes de las vacaciones no ofrece nada', await huecos(lunesA), 0);
  ok('y el último tampoco', await huecos(lunesB), 0);
  ok('quedó escrito por qué', (await crudo(
    'select motivo from public.turnos_excepcion where empresa_id=$1 and fecha=$2 and profesional_id is null',
    [local.empresaId, lunesA])).motivo, 'Vacaciones');

  aceptado('cerrar el mismo rango dos veces no duplica nada',
    await llamar(local.uid, 'select public.cerrar_dias($1,$2,$3,null,$4)',
      [local.empresaId, lunesA, lunesB, 'Vacaciones']));
  ok('sigue habiendo un solo día por fecha', (await crudo(
    'select count(*)::int n from public.turnos_excepcion where empresa_id=$1 and profesional_id is null',
    [local.empresaId])).n, 8);

  // ---- el día libre de uno no es el feriado del local ----

  aceptado('Pedro se toma un día suyo dentro de esas semanas',
    await llamar(uidPedro, 'select public.cerrar_dias($1,$2,$3,$4,$5)',
      [local.empresaId, lunesA, lunesA, pedro, 'Médico']));

  ok('el dueño reabre el local',
    Number((await valor(local.uid, 'select public.abrir_dias($1,$2,$3) j',
      [local.empresaId, lunesA, lunesB])).j.dias), 8);

  ok('el último lunes volvió a la normalidad', await huecos(lunesB), 14);
  ok('pero el día que Pedro se tomó sigue siendo suyo y sigue cerrado',
    await huecos(lunesA), 0);

  aceptado('y él mismo lo levanta cuando quiere',
    await llamar(uidPedro, 'select public.abrir_dias($1,$2,$3,$4)',
      [local.empresaId, lunesA, lunesA, pedro]));
  ok('ahí sí vuelve a haber turnos', await huecos(lunesA), 14);

  rechazado('un extraño no cierra el local ajeno',
    await llamar(otra.uid, 'select public.cerrar_dias($1,$2,$3)', [local.empresaId, lunesA, lunesB]),
    'dueño de la cuenta');

  // ═══════════════════════════════════════════════════════════
  grupo('13 · Avisarle al cliente que mañana tiene turno');
  //
  // El plantón casi nunca es mala fe: la persona reservó hace diez días y se
  // olvidó. Orden no puede mandarle el mensaje solo —un cliente nunca se
  // registra, así que el push no le llega— pero sí puede dejar constancia de
  // a quién ya se le escribió, y contarle al dueño cuántos le faltan.
  // ═══════════════════════════════════════════════════════════

  // Un turno para mañana, puesto directo: lo que se prueba acá no es reservar
  // —eso ya tiene su grupo— sino qué se sabe de un turno que ya existe.
  const manana = (await db.query(
    `insert into public.turnos_reserva
       (empresa_id, profesional_id, producto_id, inicia, termina,
        cliente_nombre, cliente_telefono, estado)
     values ($1, $2, $3,
       (public.hoy_empresa($1) + 1)::date + time '15:00',
       (public.hoy_empresa($1) + 1)::date + time '15:30',
       'Mañanera', '0981999999', 'pendiente')
     returning id, token`,
    [local.empresaId, pedro, corte])).rows[0];

  const paraManana = async () =>
    (await H.intentarComo(db, 'service_role', null,
      () => db.query('select public.turnos_de_manana() j'))).valor.rows[0].j;

  const delLocal = (lista) => lista.find((x) => x.empresa_id === local.empresaId);

  rechazado('un usuario común no puede preguntar por todas las cuentas a la vez',
    await llamar(local.uid, 'select public.turnos_de_manana()', []),
    'permission denied|permiso');

  ok('la tarea de la noche ve el turno de mañana', num(delLocal(await paraManana()).turnos), 1);
  ok('y que todavía no se le avisó', num(delLocal(await paraManana()).sin_avisar), 1);

  // ---- marcar que ya se le escribió ----

  rechazado('un extraño no marca avisado un turno ajeno',
    await llamar(otra.uid, 'select public.marcar_avisado($1)', [manana.id]),
    'No pertenecés');

  aceptado('el empleado le escribe por WhatsApp y lo marca',
    await llamar(uidPedro, 'select public.marcar_avisado($1)', [manana.id]));

  ok('la tarea de la noche ya no lo cuenta como pendiente',
    num(delLocal(await paraManana()).sin_avisar), 0);
  ok('pero el turno sigue estando', num(delLocal(await paraManana()).turnos), 1);

  aceptado('y se puede desmarcar si se tocó por error',
    await llamar(local.uid, 'select public.marcar_avisado($1,false)', [manana.id]));
  ok('vuelve a figurar como sin avisar', num(delLocal(await paraManana()).sin_avisar), 1);

  // ---- lo que la agenda le da a la pantalla ----

  const mananaISO = new Date((await crudo(
    'select (public.hoy_empresa($1) + 1)::date d', [local.empresaId])).d).toISOString().slice(0, 10);
  const agendaManana = (await valor(uidPedro, 'select public.agenda_del_dia($1,$2) j',
    [local.empresaId, mananaISO])).j;

  ok('la agenda del día trae el turno de mañana', agendaManana.length, 1);
  ok('con el teléfono para poder escribirle', agendaManana[0].telefono, '0981999999');
  ok('diciendo que todavía no se le avisó', agendaManana[0].avisado, false);
  ok('y con su enlace para cancelar, que va dentro del mensaje',
    agendaManana[0].token, manana.token);

  await llamar(local.uid, 'select public.marcar_avisado($1)', [manana.id]);
  ok('marcado, la agenda lo dice',
    (await valor(uidPedro, 'select public.agenda_del_dia($1,$2) j',
      [local.empresaId, mananaISO])).j[0].avisado, true);

  // ---- una cancelada no se le avisa a nadie ----

  await llamar(local.uid, 'select public.cancelar_turno($1)', [manana.id]);
  ok('un turno cancelado desaparece de lo que hay para mañana',
    delLocal(await paraManana()), undefined);

  // ---- poder apagar el aviso ----

  ok('el aviso viene prendido de fábrica',
    (await valor(local.uid, 'select public.mis_preferencias() j', [])).j.aviso_turnos, true);

  aceptado('se puede apagar',
    await llamar(local.uid, 'select public.guardar_preferencias(null,null,null,null,false)', []));
  ok('y queda apagado',
    (await valor(local.uid, 'select public.mis_preferencias() j', [])).j.aviso_turnos, false);

  ok('cambiar solo el idioma no lo vuelve a prender',
    (await valor(local.uid, "select public.guardar_preferencias('es') j", [])).j.aviso_turnos, false);

  // ═══════════════════════════════════════════════════════════
  grupo('14 · La agenda como calendario (072)');
  // ═══════════════════════════════════════════════════════════
  //
  // Cada día dice cuántos turnos tiene y qué tan lleno está. Un calendario
  // que diga «libre» un feriado, o cuente un turno cancelado, es peor que no
  // tenerlo. Un local propio, con un solo barbero, para que las cuentas
  // no dependan de lo que dejaron los grupos anteriores.
  {
    const sur = await H.montarEmpresa(db, { email: 'dueno@barberiasur.com', nombre: 'Barbería Sur' });
    const uidLuis = await H.sumarMiembro(db, sur.empresaId, 'luis@barberiasur.com', 'vendedor');
    const corteSur = await H.crearProducto(db, sur.empresaId, sur.uid,
      { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
    const luis = (await valor(sur.uid,
      "select public.guardar_profesional($1,$2,'comision',50,$3) as id", [sur.empresaId, 'Luis', uidLuis])).id;
    await llamar(sur.uid, 'select public.guardar_horario($1,$2,1,$3,$4)', [sur.empresaId, luis, '08:00', '12:00']);
    await llamar(sur.uid, 'select public.guardar_horario($1,$2,1,$3,$4)', [sur.empresaId, luis, '15:00', '18:00']);
    const lunes2 = (await crudo('select ($1::date + 28) as d', [lunes])).d.toISOString().slice(0, 10);
    const cal = async (uid, desde, dias) => (await valor(uid,
      'select public.agenda_calendario($1, $2::date, ($2::date + $3::int)) j', [sur.empresaId, desde, dias])).j;
    const dia = (lista, offset) => lista[offset];
    const turno = (desde, hasta, estado = 'pendiente') => db.query(
      `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina, cliente_nombre, estado)
       values ($1, $2, $3, ($4::date + $5::time) at time zone 'America/Asuncion',
               ($4::date + $6::time) at time zone 'America/Asuncion', 'Cliente', $7)`,
      [sur.empresaId, luis, corteSur, lunes2, desde, hasta, estado]);

    let semana = await cal(sur.uid, lunes2, 6);
    ok('una semana son siete días', semana.length, 7);
    ok('el lunes atiende 7 horas (8 a 12 y 15 a 18)', dia(semana, 0).abierto_min, 420);
    ok('y sin turnos está libre', [dia(semana, 0).turnos, dia(semana, 0).estado], [0, 'libre']);
    ok('el martes, sin horario, está cerrado', dia(semana, 1).estado, 'cerrado');

    await turno('08:00', '12:00');
    await turno('15:00', '16:30');
    await turno('16:30', '18:00', 'cancelada');
    semana = await cal(sur.uid, lunes2, 6);
    ok('con 5 horas y media tomadas de 7, casi lleno', dia(semana, 0).estado, 'casi');
    ok('un turno cancelado no ocupa ni se cuenta', [dia(semana, 0).turnos, dia(semana, 0).ocupado_min], [2, 330]);
    ok('y dice cuánto queda libre', dia(semana, 0).libre_min, 90);

    await turno('16:30', '18:00');
    semana = await cal(sur.uid, lunes2, 6);
    ok('con todo tomado, lleno', dia(semana, 0).estado, 'lleno');

    // Un feriado el lunes siguiente: cerrado, aunque ese día de la semana trabaje.
    const lunes3 = (await crudo('select ($1::date + 7) as d', [lunes2])).d.toISOString().slice(0, 10);
    aceptado('el dueño cierra por feriado',
      await llamar(sur.uid, 'select public.guardar_excepcion($1,$2,true,null,null,null,$3)',
        [sur.empresaId, lunes3, 'Feriado']));
    const otra = await cal(sur.uid, lunes3, 0);
    ok('un feriado se ve cerrado', [otra[0].abierto_min, otra[0].estado], [0, 'cerrado']);

    aceptado('Luis abre igual ese día, de 9 a 11',
      await llamar(uidLuis, 'select public.guardar_excepcion($1,$2,false,$3,$4,$5,$6)',
        [sur.empresaId, lunes3, luis, '09:00', '11:00', 'Abro igual']));
    ok('y su día especial gana sobre el feriado del local', (await cal(sur.uid, lunes3, 0))[0].abierto_min, 120);

    ok('un vendedor también ve el calendario', (await cal(uidLuis, lunes2, 0))[0].estado, 'lleno');

    const ajeno = await H.montarEmpresa(db, { email: 'dueno@otrolocal.com', nombre: 'Otro Local' });
    rechazado('otro negocio no ve la agenda de este',
      await llamar(ajeno.uid, 'select public.agenda_calendario($1, $2::date, $2::date)', [sur.empresaId, lunes2]),
      'No pertenecés');
    rechazado('ni se puede pedir un año entero',
      await llamar(local.uid, 'select public.agenda_calendario($1, $2::date, ($2::date + 200))', [local.empresaId, lunes2]),
      'tres meses');
    rechazado('ni un rango al revés',
      await llamar(local.uid, 'select public.agenda_calendario($1, $2::date, ($2::date - 1))', [local.empresaId, lunes2]),
      'no es válido');

    // (119) La barbería con horario sigue igual, y ahora dice que lo tiene.
    const igual = await cal(sur.uid, lunes2, 1);
    ok('la barbería con horario sigue en lleno / cerrado, con su horario a la vista (119)',
      [igual[0].estado, igual[1].estado, igual[0].con_horario], ['lleno', 'cerrado', true]);
    ok('y cuenta sus turnos y sus franjas', [igual[0].turnos, igual[0].franjas], [3, 3]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('15 · El calendario que se entiende (119)');
  // ═══════════════════════════════════════════════════════════
  //
  // Matías (01/10): su cuenta de clases, con dos clases agendadas, veía toda
  // la semana gris, «Cerrado», y «0 días con lugar». Sin horario cargado un
  // día no es «cerrado»: no hay con qué medirlo, y se pinta por cantidad.
  {
    const masDias = (iso, n) => {
      const [a, m, d] = iso.split('-').map(Number);
      return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
    };
    const lunesP = masDias(lunes, 35);
    const juevesP = masDias(lunesP, 3);
    const viernesP = masDias(lunesP, 4);

    const profe = await H.montarEmpresa(db, { email: 'profe@clases119.com', nombre: 'Clases de Matías', rubro: 'clases' });
    const alumno = async (nombre, tel) => (await valor(profe.uid,
      'select public.guardar_cliente($1,$2,$3,$4,$5) id', [profe.empresaId, nombre, tel, '', null])).id;
    const inscribir = (cli, dia, desde, hasta, grupo = false) => llamar(profe.uid,
      'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) j',
      [profe.empresaId, cli, [new Date(`${desde}T12:00:00Z`).getUTCDay()], '18:00', '19:00', desde, hasta,
        50000, null, false, 'efectivo', null, 'Inglés', null, grupo]);
    const calP = async (desde, dias) => (await valor(profe.uid,
      'select public.agenda_calendario($1, $2::date, ($2::date + $3::int)) j', [profe.empresaId, desde, dias])).j;

    const ana = await alumno('Ana Benítez', '0982111111');
    const beto = await alumno('Beto Gómez', '0982222333');
    aceptado('el profe inscribe a Ana el jueves', await inscribir(ana, null, juevesP, juevesP));
    aceptado('y a Beto el viernes', await inscribir(beto, null, viernesP, viernesP));

    let semana = await calP(lunesP, 6);
    ok('sin horario cargado ningún día es «cerrado» (el caso de Matías)',
      semana.filter((d) => d.estado === 'cerrado').length, 0);
    ok('todos dicen sin_horario', [...new Set(semana.map((d) => d.estado))], ['sin_horario']);
    ok('y traen la cantidad de cada día', semana.map((d) => d.turnos), [0, 0, 0, 1, 1, 0, 0]);
    ok('las clases, contadas como clases', semana.map((d) => d.franjas), [0, 0, 0, 1, 1, 0, 0]);
    ok('y la cuenta no tiene horario', semana[0].con_horario, false);

    // mi_profesional: el que creó la inscripción, siempre el mismo.
    const prof = (await valor(profe.uid, 'select public.mi_profesional($1) id', [profe.empresaId])).id;
    ok('mi_profesional da el profe que creó la inscripción',
      prof, (await crudo('select id from public.turnos_profesional where empresa_id = $1', [profe.empresaId])).id);
    await valor(profe.uid, 'select public.mi_profesional($1) id', [profe.empresaId]);
    ok('y llamarla de nuevo no crea otro',
      (await crudo('select count(*)::int n from public.turnos_profesional where empresa_id = $1', [profe.empresaId])).n, 1);
    rechazado('otro negocio no la puede usar',
      await llamar(local.uid, 'select public.mi_profesional($1)', [profe.empresaId]), 'No pertenecés');
    rechazado('ni una barbería, que arma su equipo en Equipo y reparto',
      await llamar(local.uid, 'select public.mi_profesional($1)', [local.empresaId]), 'agenda de un profe');

    // Un profe recién creado: sin profesional ni clases, no rompe y se arma solo.
    const nuevo = await H.montarEmpresa(db, { email: 'nuevo@clases119.com', nombre: 'Profe nuevo', rubro: 'entrenamiento' });
    const vacio = (await valor(nuevo.uid,
      'select public.agenda_calendario($1, $2::date, ($2::date + 2)) j', [nuevo.empresaId, lunesP])).j;
    ok('un profe sin nada todavía ve sin_horario, con cero', vacio.map((d) => [d.estado, d.turnos]),
      [['sin_horario', 0], ['sin_horario', 0], ['sin_horario', 0]]);
    const suyo = (await valor(nuevo.uid, 'select public.mi_profesional($1) id', [nuevo.empresaId])).id;
    ok('el trainer que no agendó a nadie ya puede tener su profesional', typeof suyo, 'string');
    aceptado('y cargar su horario antes de agendar a nadie',
      await llamar(nuevo.uid, 'select public.guardar_horario($1,$2,1,$3,$4)', [nuevo.empresaId, suyo, '07:00', '09:00']));
    ok('su lunes ya se mide: libre', (await valor(nuevo.uid,
      'select public.agenda_calendario($1, $2::date, $2::date) j', [nuevo.empresaId, lunesP])).j[0].estado, 'libre');

    // Las vacaciones de alguien sin horario: cerrado, con su motivo.
    aceptado('el trainer se toma el miércoles',
      await llamar(nuevo.uid, 'select public.cerrar_dias($1,$2::date,$2::date,null,$3)', [nuevo.empresaId, masDias(lunesP, 2), 'Vacaciones']));
    const conVacaciones = (await valor(nuevo.uid,
      'select public.agenda_calendario($1, $2::date, ($2::date + 2)) j', [nuevo.empresaId, lunesP])).j[2];
    ok('unas vacaciones son «cerrado», con su motivo', [conVacaciones.estado, conVacaciones.motivo], ['cerrado', 'Vacaciones']);

    // El profe carga su horario: jueves de 17 a 20.
    aceptado('el profe carga su horario del jueves',
      await llamar(profe.uid, 'select public.guardar_horario($1,$2,4,$3,$4)', [profe.empresaId, prof, '17:00', '20:00']));
    semana = await calP(lunesP, 6);
    ok('con horario, el jueves con una clase está libre',
      [semana[3].estado, semana[3].abierto_min, semana[3].ocupado_min], ['libre', 180, 60]);
    ok('el viernes tiene una clase fuera del horario: sin_horario, no «cerrado»', [semana[4].estado, semana[4].turnos], ['sin_horario', 1]);
    ok('y la base la marca fuera; la del jueves, no', [semana[4].fuera, semana[3].fuera], [1, 0]);
    ok('y el sábado, sin horario ni clases, no trabaja: cerrado', semana[5].estado, 'cerrado');
    ok('la cuenta ya dice que tiene horario', semana[0].con_horario, true);
    ok('un día cerrado por no trabajar no trae motivo', semana[5].motivo, null);

    // Una clase en grupo (108): tres alumnos a la misma hora ocupan UNA hora.
    const juevesG = masDias(juevesP, 7);
    for (const [n, tel] of [['Carla', '0983000001'], ['Dani', '0983000002'], ['Eli', '0983000003']]) {
      aceptado(`${n} se suma a la clase en grupo`, await inscribir(await alumno(n, tel), null, juevesG, juevesG, true));
    }
    const grupoDia = (await calP(juevesG, 0))[0];
    ok('tres alumnos en grupo: 3 turnos, 1 clase, 60 minutos ocupados',
      [grupoDia.turnos, grupoDia.franjas, grupoDia.ocupado_min], [3, 1, 60]);
    ok('y el día sigue libre (la 072 decía lleno)', grupoDia.estado, 'libre');
    ok('la clase en grupo cae en el horario: nada fuera', grupoDia.fuera, 0);

    // Las vacaciones del profe sobre un jueves con horario.
    const juevesV = masDias(juevesP, 14);
    aceptado('el profe cierra un jueves por vacaciones',
      await llamar(profe.uid, 'select public.guardar_excepcion($1,$2,true,null,null,null,$3)', [profe.empresaId, juevesV, 'Vacaciones']));
    const vac = (await calP(juevesV, 0))[0];
    ok('un feriado o unas vacaciones: cerrado, con su motivo', [vac.estado, vac.motivo, vac.abierto_min], ['cerrado', 'Vacaciones', 0]);

    // Los días que ya pasaron también dicen cuántas clases tuvieron.
    const pasado = (await crudo("select ((now() at time zone 'America/Asuncion')::date - 10) as d")).d.toISOString().slice(0, 10);
    await db.query(
      `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina, cliente_nombre, estado)
       select $1, $2, r.producto_id, ($3::date + time '18:00') at time zone 'America/Asuncion',
              ($3::date + time '19:00') at time zone 'America/Asuncion', 'Ana', 'atendida'
       from public.turnos_reserva r where r.empresa_id = $1 limit 1`,
      [profe.empresaId, prof, pasado]);
    const yaPaso = (await calP(pasado, 0))[0];
    ok('un día pasado trae su cantidad', [yaPaso.turnos, yaPaso.franjas], [1, 1]);

    // Dos profesionales distintos a la misma hora se siguen sumando.
    const este = await H.montarEmpresa(db, { email: 'dueno@barberiaeste.com', nombre: 'Barbería Este' });
    const corteEste = await H.crearProducto(db, este.empresaId, este.uid,
      { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
    const ids = [];
    for (const n of ['Uno', 'Dos']) {
      const uidN = await H.sumarMiembro(db, este.empresaId, `${n.toLowerCase()}@barberiaeste.com`, 'vendedor');
      const id = (await valor(este.uid, "select public.guardar_profesional($1,$2,'comision',50,$3) as id", [este.empresaId, n, uidN])).id;
      await llamar(este.uid, 'select public.guardar_horario($1,$2,1,$3,$4)', [este.empresaId, id, '09:00', '10:00']);
      ids.push(id);
    }
    for (const id of ids) {
      await db.query(
        `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina, cliente_nombre, estado)
         values ($1, $2, $3, ($4::date + time '09:00') at time zone 'America/Asuncion',
                 ($4::date + time '10:00') at time zone 'America/Asuncion', 'Cliente', 'pendiente')`,
        [este.empresaId, id, corteEste, lunesP]);
    }
    const dosProf = (await valor(este.uid, 'select public.agenda_calendario($1, $2::date, $2::date) j', [este.empresaId, lunesP])).j[0];
    ok('dos barberos a la misma hora ocupan sus dos horas: lleno',
      [dosProf.estado, dosProf.ocupado_min, dosProf.abierto_min, dosProf.franjas], ['lleno', 120, 120, 2]);
    ok('y ninguno queda fuera de su horario', dosProf.fuera, 0);

    // ── Lo ocupado se mide ADENTRO del horario de cada uno ──
    // Hallado en la revisión (01/10): una clase fuera del horario contaba
    // contra el horario. Un profe con horario de 18 a 21 y clases a la
    // mañana veía «Lleno» con la tarde entera libre; los turnos de alguien de
    // vacaciones o sin horario llenaban el horario de otro.
    const reservarEn = (empresaId, prof, prod, dia, desde, hasta) => db.query(
      `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina, cliente_nombre, estado)
       values ($1, $2, $3, ($4::date + $5::time) at time zone 'America/Asuncion',
               ($4::date + $6::time) at time zone 'America/Asuncion', 'Alguien', 'pendiente')`,
      [empresaId, prof, prod, dia, desde, hasta]);
    const nuevoProf = async (empresaId, nombre) => (await crudo(
      "insert into public.turnos_profesional (empresa_id, nombre, reparto) values ($1, $2, 'local') returning id",
      [empresaId, nombre])).id;
    const franja = (empresaId, prof, dow, desde, hasta) => db.query(
      'insert into public.turnos_horario (empresa_id, profesional_id, dia_semana, desde, hasta) values ($1, $2, $3, $4, $5)',
      [empresaId, prof, dow, desde, hasta]);
    const cerrarA = (empresaId, prof, dia, motivo) => db.query(
      'insert into public.turnos_excepcion (empresa_id, profesional_id, fecha, cerrado, motivo) values ($1, $2, $3, true, $4)',
      [empresaId, prof, dia, motivo]);
    const calDe = async (e, dia) => (await valor(e.uid,
      'select public.agenda_calendario($1, $2::date, $2::date) j', [e.empresaId, dia])).j[0];
    const productoDe = (e) => H.crearProducto(db, e.empresaId, e.uid,
      { nombre: 'Clase', costo: 0, precio: 50000, controla_stock: false });
    const martesP = masDias(lunesP, 1);

    // 1. El profe que atiende de 18 a 21 y tiene clases a la mañana.
    const tardes = await H.montarEmpresa(db, { email: 'tardes@clases119.com', nombre: 'Clases de tarde', rubro: 'clases' });
    const tardesProd = await productoDe(tardes);
    const tardesProf = await nuevoProf(tardes.empresaId, 'Ana');
    await franja(tardes.empresaId, tardesProf, 1, '18:00', '21:00');
    await reservarEn(tardes.empresaId, tardesProf, tardesProd, lunesP, '10:00', '12:00');
    await reservarEn(tardes.empresaId, tardesProf, tardesProd, lunesP, '13:00', '15:00');
    let tarde = await calDe(tardes, lunesP);
    ok('horario de 18 a 21 y clases a la mañana: la tarde sigue libre (antes «Lleno»)',
      [tarde.estado, tarde.abierto_min, tarde.ocupado_min, tarde.libre_min], ['libre', 180, 0, 180]);
    ok('y las dos de la mañana quedan marcadas fuera del horario', [tarde.turnos, tarde.fuera], [2, 2]);
    await reservarEn(tardes.empresaId, tardesProf, tardesProd, lunesP, '18:00', '19:00');
    await reservarEn(tardes.empresaId, tardesProf, tardesProd, lunesP, '20:30', '21:30');
    tarde = await calDe(tardes, lunesP);
    ok('la clase de adentro cuenta entera; la que se pasa de las 21, solo su media hora',
      [tarde.ocupado_min, tarde.fuera, tarde.estado], [90, 3, 'libre']);

    // Un horario especial ese día manda sobre el de la semana, también para medir.
    const lunesQ = masDias(lunesP, 7);
    await db.query(
      `insert into public.turnos_excepcion (empresa_id, profesional_id, fecha, cerrado, desde, hasta, motivo)
       values ($1, $2, $3, false, '09:00', '11:00', 'Cambio')`, [tardes.empresaId, tardesProf, lunesQ]);
    await reservarEn(tardes.empresaId, tardesProf, tardesProd, lunesQ, '09:00', '10:00');
    await reservarEn(tardes.empresaId, tardesProf, tardesProd, lunesQ, '18:00', '19:00');
    const cambio = await calDe(tardes, lunesQ);
    ok('con horario especial (9 a 11) la clase de las 18 queda fuera, no la de las 9',
      [cambio.abierto_min, cambio.ocupado_min, cambio.fuera, cambio.estado], [120, 60, 1, 'libre']);

    // 2. Barbería: A se va de vacaciones con 6 h anotadas (cerrar no las
    // mueve) y B, que también atiende de 9 a 17, no tiene nada.
    const barb = await H.montarEmpresa(db, { email: 'dueno@barberia119.com', nombre: 'Barbería 119' });
    const barbProd = await productoDe(barb);
    const pa = await nuevoProf(barb.empresaId, 'A');
    const pb = await nuevoProf(barb.empresaId, 'B');
    for (const p of [pa, pb]) await franja(barb.empresaId, p, 1, '09:00', '17:00');
    for (const [d, h] of [['09:00', '11:00'], ['11:00', '13:00'], ['14:00', '16:00']]) {
      await reservarEn(barb.empresaId, pa, barbProd, lunesP, d, h);
    }
    await cerrarA(barb.empresaId, pa, lunesP, 'Vacaciones');
    const vacA = await calDe(barb, lunesP);
    ok('A de vacaciones con 6 h anotadas y B libre todo el día: libre, no «casi lleno»',
      [vacA.estado, vacA.abierto_min, vacA.ocupado_min, vacA.fuera, vacA.motivo], ['libre', 480, 0, 3, null]);

    // Las vacaciones de uno solo no cierran la cuenta (hallado en la revisión).
    await cerrarA(barb.empresaId, pa, martesP, 'Vacaciones');
    await reservarEn(barb.empresaId, pb, barbProd, martesP, '10:00', '11:00');
    await reservarEn(barb.empresaId, pb, barbProd, martesP, '11:00', '12:00');
    const soloA = await calDe(barb, martesP);
    ok('las vacaciones de A no ponen «Cerrado · Vacaciones» el día que B tiene turnos',
      [soloA.estado, soloA.motivo, soloA.turnos, soloA.fuera], ['sin_horario', null, 2, 2]);
    await cerrarA(barb.empresaId, pb, martesP, 'Vacaciones');
    const losDos = await calDe(barb, martesP);
    ok('si se van los dos, sí: cerrado, con su motivo', [losDos.estado, losDos.motivo], ['cerrado', 'Vacaciones']);
    const lunesF = masDias(lunesP, 14);
    await cerrarA(barb.empresaId, null, lunesF, 'Feriado');
    const feriado = await calDe(barb, lunesF);
    ok('y el feriado del local cierra a todos', [feriado.estado, feriado.motivo, feriado.abierto_min], ['cerrado', 'Feriado', 0]);

    // 3. Cuenta de clases con dos profes. Sin horario: las vacaciones de Ana
    // no cierran el día de Beto. Con horario solo de Ana: las clases de Beto
    // no llenan el horario de ella.
    const dos = await H.montarEmpresa(db, { email: 'dos@clases119.com', nombre: 'Clases de a dos', rubro: 'clases' });
    const dosProd = await productoDe(dos);
    const ana2 = await nuevoProf(dos.empresaId, 'Ana');
    const beto2 = await nuevoProf(dos.empresaId, 'Beto');
    await cerrarA(dos.empresaId, ana2, lunesP, 'Vacaciones');
    await reservarEn(dos.empresaId, beto2, dosProd, lunesP, '18:00', '19:00');
    await reservarEn(dos.empresaId, beto2, dosProd, lunesP, '19:00', '20:00');
    const sinH = await calDe(dos, lunesP);
    ok('sin horario, las vacaciones de Ana no cierran el día de las clases de Beto',
      [sinH.estado, sinH.motivo, sinH.turnos, sinH.con_horario], ['sin_horario', null, 2, false]);
    await franja(dos.empresaId, ana2, 2, '18:00', '21:00');
    for (const [d, h] of [['18:00', '19:00'], ['19:00', '20:00'], ['20:00', '21:00']]) {
      await reservarEn(dos.empresaId, beto2, dosProd, martesP, d, h);
    }
    const deBeto = await calDe(dos, martesP);
    ok('tres clases de Beto, que no tiene horario, no llenan el horario de Ana (antes «Lleno»)',
      [deBeto.estado, deBeto.abierto_min, deBeto.ocupado_min, deBeto.fuera], ['libre', 180, 0, 3]);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE LA AGENDA FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE LA AGENDA PASARON`);
  process.exit(0);
})().catch((e) => { console.error('error inesperado:', e); process.exit(2); });
