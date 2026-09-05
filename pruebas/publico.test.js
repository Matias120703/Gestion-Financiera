/**
 * Pruebas de la puerta pública de reservas (migración 038).
 *
 * Es la primera superficie de Orden que toca alguien SIN CUENTA, así que es
 * la que más se puede romper. La migración 012 cerró `anon` a propósito, con
 * el argumento de que el permiso no debería depender de que nadie se
 * equivoque nunca dentro de una función. Este archivo existe para comprobar
 * que la puerta quedó del ancho exacto:
 *
 *   · que lo público no diga QUIÉN ocupa un horario tomado —si lo dijera, el
 *     barbero habría publicado la agenda de sus clientes en internet—;
 *   · que el link de un negocio no sirva para espiar la agenda de otro;
 *   · que un formulario abierto en internet no se pueda llenar cien veces;
 *   · y que `anon` no pueda ejecutar NADA que no sean las cuatro funciones
 *     que se le abrieron.
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

  const local = await H.montarEmpresa(db, { email: 'dueno@barberia.com', nombre: 'Barbería Ñandutí' });
  const otro = await H.montarEmpresa(db, { email: 'otro@barberia.com', nombre: 'Barbería Ñandutí' });

  const llamar = (uid, sql, args) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args) => {
    const r = await llamar(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };
  const crudo = async (sql, args) => (await db.query(sql, args)).rows[0];

  // Sin sesión: exactamente lo que hace un cliente que entra por el link.
  const comoNadie = (sql, args) =>
    H.intentarComo(db, 'anon', null, () => db.query(sql, args));
  const valorPublico = async (sql, args) => {
    const r = await comoNadie(sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };

  const corte = await H.crearProducto(db, local.empresaId, local.uid,
    { nombre: 'Corte', costo: 12000, precio: 50000, controla_stock: false });
  const cera = await H.crearProducto(db, local.empresaId, local.uid,
    { nombre: 'Cera', costo: 20000, precio: 35000, stock: 5, controla_stock: true });

  const pedro = (await valor(local.uid,
    "select public.guardar_profesional($1,$2,'comision',50) as id",
    [local.empresaId, 'Pedro'])).id;
  const ana = (await valor(local.uid,
    "select public.guardar_profesional($1,$2,'local') as id",
    [local.empresaId, 'Ana sin horario'])).id;
  const ajeno = (await valor(otro.uid,
    "select public.guardar_profesional($1,$2,'local') as id",
    [otro.empresaId, 'De la otra cuadra'])).id;

  await llamar(local.uid, 'select public.guardar_servicio_agenda($1,$2,$3)', [local.empresaId, corte, 30]);

  const lunes = (await crudo(
    "select to_char(date_trunc('week', (now() at time zone 'America/Asuncion')::date + 14), 'YYYY-MM-DD') as d")).d;

  await llamar(local.uid, 'select public.guardar_horario($1,$2,1,$3,$4)',
    [local.empresaId, pedro, '09:00', '12:00']);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · El link se arma solo, y es para siempre');
  // ═══════════════════════════════════════════════════════════

  ok('los acentos y la ñ se limpian',
    (await crudo("select public.slug_de('Barbería Ñandutí del Sur') as s")).s, 'barberia-nanduti-del-sur');
  ok('y los símbolos también',
    (await crudo("select public.slug_de('  Kiosco #1 / SRL  ') as s")).s, 'kiosco-1-srl');

  const link1 = (await valor(local.uid, 'select public.guardar_link_publico($1) j', [local.empresaId])).j;
  ok('se genera del nombre del negocio', link1.slug, 'barberia-nanduti');

  // Dos negocios con el mismo nombre no pueden compartir dirección.
  const link2 = (await valor(otro.uid, 'select public.guardar_link_publico($1) j', [otro.empresaId])).j;
  ok('el segundo con el mismo nombre recibe otro', link2.slug, 'barberia-nanduti-2');

  const cambio = (await valor(local.uid, "select public.guardar_link_publico($1,'pedro-cortes') j",
    [local.empresaId])).j;
  ok('el dueño puede cambiarlo', cambio.slug, 'pedro-cortes');

  // LA REGLA QUE NO SE NEGOCIA: el viejo queda quemado. Si se reasignara, un
  // cliente que entra por un posteo de hace un año terminaría reservando con
  // otro barbero.
  ok('el link viejo queda quemado para siempre',
    (await crudo("select public.slug_disponible('barberia-nanduti') as d")).d, false);

  rechazado('y nadie más lo puede tomar',
    await llamar(otro.uid, "select public.guardar_link_publico($1,'barberia-nanduti')", [otro.empresaId]),
    'ya está tomado');

  rechazado('un vendedor no toca el link',
    await llamar(otro.uid, "select public.guardar_link_publico($1,'lo-que-sea')", [local.empresaId]),
    'dueño de la cuenta');

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Lo que ve un desconocido');
  // ═══════════════════════════════════════════════════════════

  const publica = (await valorPublico("select public.agenda_publica('pedro-cortes') j")).j;

  ok('la página existe', publica.existe, true);
  ok('con el nombre del negocio', publica.negocio, 'Barbería Ñandutí');
  ok('y quien atiende', publica.profesionales.map((p) => p.nombre), ['Pedro']);
  ok('Ana no aparece: no tiene horario cargado',
    publica.profesionales.some((p) => p.nombre.startsWith('Ana')), false);
  ok('el corte se ofrece con su precio',
    publica.profesionales[0].servicios.map((s) => [s.nombre, Number(s.precio)]), [['Corte', 50000]]);

  // Lo que NO puede salir de acá.
  const texto = JSON.stringify(publica);
  ok('no se filtra el costo del servicio', texto.includes('12000'), false);
  ok('ni un producto con stock', texto.includes('Cera'), false);
  ok('ni el id de la empresa', texto.includes(local.empresaId), false);

  const apagada = (await valorPublico("select public.agenda_publica('no-existe-esto') j")).j;
  ok('un link inexistente no existe', apagada.existe, false);

  await llamar(local.uid, 'select public.guardar_link_publico($1,null,false)', [local.empresaId]);
  ok('y uno apagado contesta lo mismo, para no delatar quién usa Orden',
    (await valorPublico("select public.agenda_publica('pedro-cortes') j")).j.existe, false);
  await llamar(local.uid, 'select public.guardar_link_publico($1,null,true)', [local.empresaId]);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Los huecos, sin decir de quién');
  // ═══════════════════════════════════════════════════════════

  const huecosPub = async (slug, prof, fecha) =>
    (await valorPublico('select public.huecos_publicos($1,$2,$3,$4) j', [slug, prof, corte, fecha])).j;

  const libres = await huecosPub('pedro-cortes', pedro, lunes);
  ok('se ofrecen los seis turnos de la mañana', libres.length, 6);
  ok('y son solo horarios, sin nombres',
    libres.every((h) => typeof h === 'string'), true);

  ok('con el link de otro negocio no se ve nada',
    (await huecosPub('barberia-nanduti-2', pedro, lunes)).length, 0);
  ok('ni con un profesional que no es del local',
    (await huecosPub('pedro-cortes', ajeno, lunes)).length, 0);

  const ayer = (await crudo("select to_char((now() at time zone 'America/Asuncion')::date - 1, 'YYYY-MM-DD') as d")).d;
  ok('ni para ayer', (await huecosPub('pedro-cortes', pedro, ayer)).length, 0);

  const lejano = (await crudo("select to_char((now() at time zone 'America/Asuncion')::date + 200, 'YYYY-MM-DD') as d")).d;
  ok('ni para dentro de siete meses', (await huecosPub('pedro-cortes', pedro, lejano)).length, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Reservar sin cuenta');
  // ═══════════════════════════════════════════════════════════

  const reservar = (slug, prof, hora, nombre, tel) =>
    comoNadie('select public.reservar_publico($1,$2,$3,$4,$5,$6) j',
      [slug, prof, corte, hora, nombre, tel]);

  const r = await valorPublico(
    'select public.reservar_publico($1,$2,$3,$4,$5,$6) j',
    ['pedro-cortes', pedro, corte, libres[0], 'Juan Cliente', '0981222333']);

  ok('el turno queda tomado', Boolean(r.j.reserva), true);
  ok('y se lleva su enlace para cancelar', Boolean(r.j.token), true);
  ok('ese hueco ya no se ofrece', (await huecosPub('pedro-cortes', pedro, lunes)).length, 5);

  ok('la reserva queda marcada como pública',
    (await crudo('select origen from public.turnos_reserva where id=$1', [r.j.reserva])).origen, 'publico');

  rechazado('sin nombre no se reserva',
    await reservar('pedro-cortes', pedro, libres[1], '  ', '0981222333'), 'nombre');
  rechazado('ni sin un teléfono de verdad',
    await reservar('pedro-cortes', pedro, libres[1], 'Juan', '12'), 'teléfono');
  rechazado('ni a una hora que no está libre',
    await reservar('pedro-cortes', pedro, libres[0], 'Otro', '0982000000'),
    'ya no está disponible');

  // El link de un negocio no sirve para escribir en la agenda de otro.
  rechazado('el link de una barbería no reserva con el barbero de otra',
    await reservar('barberia-nanduti-2', pedro, libres[1], 'Colado', '0983000000'),
    'no atiende en este local');

  // ═══════════════════════════════════════════════════════════
  grupo('5 · El freno de abuso');
  // ═══════════════════════════════════════════════════════════

  // El mismo número, uno atrás de otro: el cooldown lo corta.
  rechazado('no se pueden encadenar reservas desde el mismo número',
    await reservar('pedro-cortes', pedro, libres[1], 'Juan', '0981222333'),
    'Esperá un momento');

  // Se simula que pasó el minuto, para poder probar el tope de pendientes.
  await db.query("update public.turnos_reserva set created_at = now() - interval '5 minutes'");
  await valorPublico('select public.reservar_publico($1,$2,$3,$4,$5,$6) j',
    ['pedro-cortes', pedro, corte, libres[1], 'Juan', '0981222333']);
  await db.query("update public.turnos_reserva set created_at = now() - interval '5 minutes'");
  await valorPublico('select public.reservar_publico($1,$2,$3,$4,$5,$6) j',
    ['pedro-cortes', pedro, corte, libres[2], 'Juan', '0981222333']);
  await db.query("update public.turnos_reserva set created_at = now() - interval '5 minutes'");

  rechazado('con tres turnos abiertos, el cuarto no entra',
    await reservar('pedro-cortes', pedro, libres[3], 'Juan', '0981222333'),
    'varios turnos reservados');

  aceptado('pero otro número reserva sin problema',
    await reservar('pedro-cortes', pedro, libres[3], 'Otra persona', '0984111222'));

  aceptado('el dueño puede bloquear un número',
    await llamar(local.uid, "select public.bloquear_telefono($1,$2,'Nunca viene')",
      [local.empresaId, '0984111222']));

  await db.query("update public.turnos_reserva set created_at = now() - interval '5 minutes'");
  rechazado('y ese número deja de poder reservar',
    await reservar('pedro-cortes', pedro, libres[4], 'Otra persona', '0984111222'),
    'Comunicate con el local');

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Cancelar con el enlace');
  // ═══════════════════════════════════════════════════════════

  const vista = (await valorPublico('select public.reserva_por_token($1) j', [r.j.token])).j;
  ok('con el token se ve la reserva', vista.existe, true);
  ok('con el servicio y con quién', [vista.servicio, vista.con], ['Corte', 'Pedro']);
  ok('pero no trae el teléfono de nadie', JSON.stringify(vista).includes('0981222333'), false);

  const antes = (await huecosPub('pedro-cortes', pedro, lunes)).length;
  aceptado('el cliente cancela sin tener cuenta',
    await comoNadie('select public.cancelar_reserva($1)', [r.j.token]));
  ok('y el hueco vuelve a ofrecerse', (await huecosPub('pedro-cortes', pedro, lunes)).length, antes + 1);

  ok('un token inventado no revela nada',
    (await valorPublico('select public.reserva_por_token($1) j',
      ['00000000-0000-0000-0000-000000000000'])).j.existe, false);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · La puerta quedó del ancho exacto');
  // ═══════════════════════════════════════════════════════════

  // Lo que `anon` puede ejecutar de todo el módulo de turnos y reparto.
  const abiertas = (await db.query(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege('anon', p.oid, 'execute')
        and (p.proname like 'turnos%' or p.proname in
             ('registrar_servicio','guardar_profesional','borrar_profesional',
              'guardar_precio_profesional','precio_de_servicio','pagar_profesional',
              'resumen_reparto','liquidacion','mis_servicios','reservar','atender_reserva',
              'marcar_no_vino','agenda_del_dia','huecos_del_dia','guardar_horario',
              'guardar_excepcion','borrar_horario','borrar_excepcion','puede_agendar',
              'guardar_servicio_agenda','guardar_link_publico','bloquear_telefono',
              'slug_disponible','agenda_publica','huecos_publicos','reservar_publico',
              'reserva_por_token','cancelar_reserva','slug_de'))
      order by 1`)).rows.map((x) => x.proname);

  ok('anon solo ejecuta las de la puerta pública', abiertas,
    ['agenda_publica', 'cancelar_reserva', 'huecos_publicos', 'reserva_por_token',
      'reservar_publico', 'slug_de']);

  // Y ninguna tabla del módulo se lee sin sesión.
  const tablas = ['turnos_profesional', 'turnos_reserva', 'turnos_atribucion',
    'turnos_publico', 'turnos_pago', 'turnos_bloqueo'];
  let leidas = 0;
  for (const t of tablas) {
    const r2 = await H.intentarComo(db, 'anon', null, () => db.query(`select 1 from public.${t} limit 1`));
    if (r2.ok) leidas += 1;
  }
  ok('ninguna tabla del módulo se lee sin sesión', leidas, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · El middleware deja pasar lo público y nada más');
  // ═══════════════════════════════════════════════════════════
  //
  // Sin esto la página no funcionaba para NADIE: el middleware mandaba a
  // /ingresar a cualquiera sin sesión, o sea a todos los clientes.
  //
  // Y la forma de arreglarlo tiene su propia trampa: '/r' a secas es prefijo
  // de '/reportes' y de '/reparto', así que abrir la puerta sin la barra
  // final publicaría dos pantallas del negocio. Por eso se comprueba acá y
  // no se confía en haberlo mirado una vez.
  {
    const fuente = require('fs').readFileSync('src/middleware.ts', 'utf8');
    const bloque = fuente.slice(fuente.indexOf('const PUBLICAS'), fuente.indexOf('];', fuente.indexOf('const PUBLICAS')));
    // Sin las líneas de comentario: adentro del bloque se explica por qué no
    // alcanza con '/r', y esas comillas no son rutas.
    const PUBLICAS = [...bloque
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
      .matchAll(/'([^']+)'/g)].map((m) => m[1]);

    ok('se leyeron las rutas y no los comentarios', PUBLICAS.includes('/r/'), true);
    const esPublica = (ruta) => ruta === '/' || PUBLICAS.some((p) => ruta.startsWith(p));

    ok('la página de reservas se abre sin sesión', esPublica('/r/barberia-juan'), true);
    ok('y el enlace del turno también', esPublica('/turno/abc-123'), true);

    const privadas = ['/panel', '/reportes', '/reparto', '/reto', '/productos',
      '/organizacion', '/ajustes', '/vender', '/movimientos', '/deudas', '/cierre', '/lotes'];
    ok('ninguna pantalla del negocio quedó abierta de paso',
      privadas.filter((r) => esPublica(r)), []);

    // ---- las tareas programadas ----
    //
    // Vercel Cron llama con un Bearer y sin cookie de sesión. Si estas rutas
    // no son públicas para el middleware, las manda a /ingresar y la tarea no
    // corre NUNCA: no falla ruidosamente, simplemente no pasa nada. Así
    // estuvieron el recordatorio de la noche y el resumen semanal desde que
    // se escribieron, con la tabla `envios` vacía como única señal.
    ok('la tarea de la noche puede ser llamada por el cron',
      esPublica('/api/tareas/recordatorio'), true);
    ok('el resumen semanal también', esPublica('/api/tareas/resumen-semanal'), true);
    ok('y la de los turnos de mañana', esPublica('/api/tareas/turnos-manana'), true);

    // La dispara el navegador de quien reservó, que no tiene cuenta.
    ok('el aviso de una reserva nueva también entra sin sesión',
      esPublica('/api/aviso-reserva'), true);

    ok('pero eso no abre el resto de la API',
      ['/api/pagos/checkout', '/api/pagos/webhook', '/api/capturar']
        .filter((r) => esPublica(r)), []);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Lo que protege de verdad a las tareas programadas');
  // ═══════════════════════════════════════════════════════════
  //
  // Abrirlas en el middleware es seguro por UNA razón: cada ruta comprueba el
  // secreto por su cuenta. Si alguien agrega una tarea nueva y se olvida de
  // esa línea, queda una ruta con la clave de servicio abierta a quien
  // adivine la URL. El middleware ya no la va a tapar, así que lo tapa esto.
  {
    const fs = require('fs');
    const dir = 'src/app/api/tareas';
    const tareas = fs.readdirSync(dir);

    ok('hay tareas para revisar', tareas.length > 0, true);

    const sinGuarda = tareas.filter((t) => {
      const ruta = `${dir}/${t}/route.ts`;
      if (!fs.existsSync(ruta)) return true;
      return !fs.readFileSync(ruta, 'utf8').includes('cronAutorizado(request)');
    });
    ok('todas exigen el secreto antes de hacer nada', sinGuarda, []);

    // Y al revés: que cada cron declarado en vercel.json tenga su ruta. Un
    // cron apuntando a una ruta que no existe se ejecuta igual, sin avisar,
    // y no hace nada — que es exactamente lo difícil de notar.
    const crons = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).crons ?? [];
    ok('vercel.json declara las tres tareas', crons.length, 3);
    const huerfanos = crons
      .map((c) => c.path)
      .filter((p) => !fs.existsSync(`src/app${p}/route.ts`));
    ok('ningún cron apunta a una ruta que no existe', huerfanos, []);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Avisarle al local que entró una reserva');
  //
  // El sentido del link es que el cliente reserve solo. Si nadie le avisa al
  // barbero, tiene que entrar a la agenda cada rato — y con las reservas para
  // el mismo día no se enteraba nunca, porque la tarea de la tarde solo mira
  // las de mañana.
  //
  // La dispara el navegador de quien reservó, sin sesión, así que lo que se
  // comprueba acá es que eso no se pueda abusar.
  // ═══════════════════════════════════════════════════════════

  const avisoDe = async (token, minutos) =>
    (await H.intentarComo(db, 'service_role', null, () => db.query(
      'select public.aviso_de_reserva($1,$2) j', [token, minutos ?? 5]))).valor.rows[0].j;

  const tokenDe = async (reservaId) =>
    (await crudo('select token from public.turnos_reserva where id=$1', [reservaId])).token;

  // Una reserva NUEVA y con un teléfono nuevo: la de Juan ya la canceló el
  // grupo 6, y los números que se usaron antes arrastran el freno de abuso.
  const huecosAhora = await huecosPub('pedro-cortes', pedro, lunes);
  const rAviso = await valorPublico(
    'select public.reservar_publico($1,$2,$3,$4,$5,$6) j',
    ['pedro-cortes', pedro, corte, huecosAhora[0], 'Marta Recién', '0985121212']);

  const tokenMarta = await tokenDe(rAviso.j.reserva);
  const aviso = await avisoDe(tokenMarta);

  ok('la reserva recién hecha se puede anunciar', aviso !== null, true);
  ok('dice quién reservó', aviso.cliente, 'Marta Recién');
  ok('y qué se hace', aviso.servicio, 'Corte');
  ok('con el nombre del local, que es el título del aviso', aviso.negocio, 'Barbería Ñandutí');
  ok('y con quién', aviso.profesional, 'Pedro');
  ok('la hora viene armada en la zona del local', /^\d{2}:\d{2}$/.test(aviso.hora), true);

  // El teléfono del cliente NO viaja hasta una notificación: se lee en la
  // agenda, no en la pantalla de bloqueo de un celular.
  ok('el aviso no lleva el teléfono del cliente',
    Object.keys(aviso).includes('telefono'), false);
  ok('y sabe si es para hoy, para mañana o para otro día',
    [typeof aviso.es_hoy, typeof aviso.es_manana], ['boolean', 'boolean']);

  // ---- lo que NO puede disparar un aviso ----

  ok('un token inventado no anuncia nada',
    await avisoDe('00000000-0000-0000-0000-000000000000'), null);

  // El enlace para cancelar queda en manos del cliente PARA SIEMPRE. Sin la
  // ventana de tiempo, serviría para hacerle sonar el teléfono al barbero
  // cuando se le antoje, meses después.
  await db.query(
    "update public.turnos_reserva set created_at = now() - interval '2 hours' where id=$1",
    [rAviso.j.reserva]);
  ok('el mismo token, un rato después, ya no anuncia nada', await avisoDe(tokenMarta), null);

  // Y una cancelada tampoco se anuncia como nueva.
  const librosAhora = await huecosPub('pedro-cortes', pedro, lunes);
  const r2 = await valorPublico(
    'select public.reservar_publico($1,$2,$3,$4,$5,$6) j',
    ['pedro-cortes', pedro, corte, librosAhora[0], 'Se arrepintió', '0989777666']);
  const token2 = await tokenDe(r2.j.reserva);
  ok('antes de cancelar sí se anuncia', (await avisoDe(token2)) !== null, true);
  await comoNadie('select public.cancelar_reserva($1)', [token2]);
  ok('cancelada, ya no', await avisoDe(token2), null);

  // ---- quién puede preguntarlo ----

  rechazado('un desconocido no puede pedir los datos del aviso',
    await comoNadie('select public.aviso_de_reserva($1)', [tokenMarta]),
    'permission denied|permiso');
  rechazado('ni alguien con sesión: para eso está la agenda',
    await llamar(local.uid, 'select public.aviso_de_reserva($1)', [tokenMarta]),
    'permission denied|permiso');

  // ═══════════════════════════════════════════════════════════
  grupo('11 · Los archivos de la portada ni pasan por el middleware');
  // ═══════════════════════════════════════════════════════════
  //
  // Un archivo estático que pasa por el middleware se convierte, para quien
  // no tiene sesión, en una redirección al login EN LUGAR del archivo. Y no
  // falla ruidosamente: la imagen no aparece, el video no arranca, y no hay
  // ni un error que lo explique.
  //
  // Pasó de verdad: los .mp4 de la portada se quedaban en el login mientras
  // sus portadas .jpg cargaban bien, porque el matcher contemplaba las
  // extensiones de imagen y ninguna de video. Nadie sin cuenta —o sea, todo
  // el que llega a la portada— habría podido ver un solo video.
  {
    const fuente = require('fs').readFileSync('src/middleware.ts', 'utf8');
    // El texto entre comillas de `matcher: ['…']`. En el archivo las barras
    // van dobles porque ahí son una cadena de TypeScript; la expresión que
    // Next usa de verdad tiene una sola, así que hay que deshacerlas.
    const patron = fuente.match(/matcher:\s*\['([^']+)'\]/)[1].replace(/\\\\/g, '\\');
    const pasaPorElMiddleware = (ruta) => new RegExp('^' + patron + '$').test(ruta);

    // Sin este control, un patrón mal leído haría pasar todas las
    // comprobaciones de abajo sin comprobar nada.
    ok('el patrón se leyó entero', patron.startsWith('/(') && patron.endsWith(')'), true);
    ok('y una ruta cualquiera del negocio pasa por el middleware',
      pasaPorElMiddleware('/panel'), true);

    // Lo que TIENE que esquivarlo.
    const estaticos = [
      '/videos/cargar-venta.mp4',
      '/videos/cargar-venta.webm',
      '/videos/cargar-venta.jpg',
      '/iconos/icono-512.png',
      '/manifest.webmanifest',
      '/sw.js',
    ];
    ok('ningún archivo de la portada pasa por el control de sesión',
      estaticos.filter((r) => pasaPorElMiddleware(r)), []);

    // Y lo que SÍ tiene que pasar, para que aflojar el patrón no abra la app.
    const pantallas = ['/panel', '/reportes', '/lotes', '/agenda', '/vender', '/ajustes'];
    ok('las pantallas del negocio siguen pasando por el control',
      pantallas.filter((r) => !pasaPorElMiddleware(r)), []);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE LA PUERTA PÚBLICA FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE LA PUERTA PÚBLICA PASARON`);
  process.exit(0);
})().catch((e) => { console.error('error inesperado:', e); process.exit(2); });
