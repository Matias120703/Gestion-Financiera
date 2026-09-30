/**
 * La página de reservas de un negocio vencido se apaga (migración 115,
 * decisión de Matías del 30/09/2026: «se vence y ya no funciona más; cuando
 * paga, vuelve»).
 *
 * Hasta la 115, reservar_publico corría sin sesión y el guardián la dejaba
 * pasar: un negocio vencido con el link prendido seguía mostrando su página
 * y tomando reservas que no podía ni ver ni atender.
 *
 * En orden:
 *   1. vencido, la página contesta EXACTAMENTE como un link apagado: sin
 *      página, sin huecos, sin reservas, con o sin sesión;
 *   2. lo ya reservado no se esconde: el cliente ve su turno y lo cancela,
 *      también si tiene una sesión de Orden abierta; nada se borra;
 *   3. la marca de «cancelar con el enlace» no abre nada más;
 *   4. al volver a pagar, todo vuelve solo (no se guardó nada);
 *   5. en prueba o pagando nada cambia, y el link apagado sigue igual;
 *   6. la personal, igual que antes;
 *   7. los permisos no cambiaron y la 115 se puede aplicar dos veces;
 *   8. la pantalla pública muestra lo mismo para los tres casos, en es y pt.
 */
const fs = require('fs');
const crypto = require('crypto');
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

// El de siempre para un negocio vencido (069).
const CANDADO = 'Se te terminó la prueba';
// El de un link apagado (038), letra por letra.
const NO_DISPONIBLE = 'Esta página de reservas no está disponible.';
const NADA = { existe: false };

(async () => {
  const db = await H.crearBase();
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const val = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(`${sql} → ${r.error}`);
    return r.valor.rows[0];
  };
  const filas = async (sql, args = []) => (await db.query(sql, args)).rows;
  const n = async (sql, args = []) => Number((await filas(sql, args))[0].n);
  // Sin sesión: exactamente lo que hace un cliente que entra por el link.
  const anon = (sql, args = []) => H.intentarComo(db, 'anon', null, () => db.query(sql, args));
  const J = async (r) => {
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };

  const vencer = (id) => db.query(
    `update public.suscripciones
     set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
     where empresa_id = $1`, [id]);
  const pagar = (id) => H.comoServicio(db, () => db.query(
    "select public.aplicar_suscripcion($1,'pro','activa',now(),now()+interval '30 days','manual')", [id]));

  const hoy = (await filas("select (now() at time zone 'America/Asuncion')::date::text h"))[0].h;
  const dia = async (d) => (await filas('select ($1::date + $2::int)::text d', [hoy, d]))[0].d;
  const fecha = await dia(3);

  /** Una barbería con su agenda armada y su link prendido. */
  const barberia = async (email, nombre, slug) => {
    const B = await H.montarEmpresa(db, { email, nombre, rubro: 'servicios' });
    const E = B.empresaId;
    B.slug = slug;
    B.corte = await H.crearProducto(db, E, B.uid, { nombre: 'Corte', costo: 12000, precio: 50000, controla_stock: false });
    await val(B.uid, 'select public.guardar_servicio_agenda($1,$2,$3)', [E, B.corte, 30]);
    B.prof = (await val(B.uid, "select public.guardar_profesional($1,'Pedro','comision',50,$2) id", [E, B.uid])).id;
    for (let d = 0; d < 7; d++) {
      await val(B.uid, "select public.guardar_horario($1,$2,$3,'08:00','20:00')", [E, B.prof, d]);
    }
    await val(B.uid, "select public.guardar_link_publico($1,$2,true,'','Te esperamos','Calle 1')", [E, slug]);
    return B;
  };
  const pagina = (slug, uid) => (uid
    ? como(uid, 'select public.agenda_publica($1) j', [slug])
    : anon('select public.agenda_publica($1) j', [slug]));
  const huecos = (B, uid, slug = B.slug) => (uid
    ? como(uid, 'select public.huecos_publicos($1,$2,$3,$4) j', [slug, B.prof, B.corte, fecha])
    : anon('select public.huecos_publicos($1,$2,$3,$4) j', [slug, B.prof, B.corte, fecha]));
  const reservar = async (B, nombre, tel, { uid = null, slug = B.slug, hueco = null } = {}) => {
    const h = hueco ?? (await filas('select inicia from public.huecos_del_dia($1,$2,$3) order by 1 limit 1',
      [B.prof, fecha, B.corte]))[0]?.inicia ?? new Date().toISOString();
    const sql = 'select public.reservar_publico($1,$2,$3,$4,$5,$6) j';
    const args = [slug, B.prof, B.corte, h, nombre, tel];
    return uid ? como(uid, sql, args) : anon(sql, args);
  };
  const porToken = async (token) => J(await anon('select public.reserva_por_token($1) j', [token]));
  const reservasDe = (B) => n('select count(*)::int n from public.turnos_reserva where empresa_id=$1', [B.empresaId]);
  const linkDe = async (B) => (await filas(
    'select slug, activo, titulo, mensaje, direccion, updated_at::text from public.turnos_publico where empresa_id=$1', [B.empresaId]))[0];

  const NV = await barberia('duenio@vencida.com', 'Barbería que vence', 'barberia-que-vence');
  const NP = await barberia('duenio@prueba.com', 'Barbería en prueba', 'barberia-en-prueba');
  const NA = await barberia('duenio@paga.com', 'Barbería que paga', 'barberia-que-paga');
  const NM = await barberia('duenio@mes.com', 'Barbería del mes vencido', 'barberia-mes-vencido');
  const NO = await barberia('duenio@apagada.com', 'Barbería apagada', 'barberia-apagada');
  await val(NO.uid, 'select public.guardar_link_publico($1,null,false)', [NO.empresaId]);
  // Alguien que usa Orden (tiene su cuenta y su sesión abierta en el
  // navegador) y además es cliente de la barbería.
  const X = await H.montarEmpresa(db, { email: 'cliente@usaorden.com', nombre: 'Mis cosas', tipoCuenta: 'personal' });

  // Antes de vencer: la página, los huecos, el link y tres reservas.
  const paginaAntes = await J(await pagina(NV.slug));
  const huecosAntes = await J(await huecos(NV));
  const linkAntes = await linkDe(NV);
  const r1 = await J(await reservar(NV, 'Juan por el link', '0981 100 001'));
  const r3 = await J(await reservar(NV, 'Cliente con sesión', '0981 100 003', { uid: X.uid }));
  const r4 = await J(await reservar(NV, 'El dueño probando', '0981 100 004'));
  const hLocal = (await filas('select inicia from public.huecos_del_dia($1,$2,$3) order by 1 limit 1', [NV.prof, fecha, NV.corte]))[0].inicia;
  const r2 = await J(await como(NV.uid, 'select public.reservar($1,$2,$3,$4,$5,$6) j',
    [NV.empresaId, NV.prof, NV.corte, hLocal, 'Llamó por teléfono', '0981 100 002']));
  const r2Antes = (await filas('select estado, inicia::text from public.turnos_reserva where id=$1', [r2.reserva]))[0];
  const reservasAntes = await reservasDe(NV);
  // El cooldown de un minuto por número no es lo que se prueba acá.
  await db.query("update public.turnos_reserva set created_at = now() - interval '5 minutes'");

  await vencer(NV.empresaId);
  await pagar(NA.empresaId);
  await pagar(NM.empresaId);
  await db.query("update public.suscripciones set periodo_fin = now() - interval '1 hour' where empresa_id = $1", [NM.empresaId]);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Vencido: la página contesta como un link apagado');
  // ═══════════════════════════════════════════════════════════
  ok('antes de vencer, la página existía con su barbero y su corte',
    [paginaAntes.existe, paginaAntes.profesionales.map((p) => p.nombre), paginaAntes.profesionales[0].servicios.map((s) => s.nombre)],
    [true, ['Pedro'], ['Corte']]);
  ok('y ofrecía huecos', huecosAntes.length > 0, true);
  ok('en prueba, pagando y vencido: ¿carga?',
    await Promise.all([NP, NA, NV, NM].map(async (B) => (await val(B.uid, 'select public.puede_cargar($1) p', [B.empresaId])).p)),
    [true, true, false, false]);

  const apagada = await J(await pagina(NO.slug));
  const inventada = await J(await pagina('no-existe-esta-barberia'));
  ok('un link apagado y uno inventado contestan lo mismo (038)', [apagada, inventada], [NADA, NADA]);
  ok('vencido: la página no existe, igual que el link apagado', await J(await pagina(NV.slug)), apagada);
  ok('igual con el mes pagado ya vencido', await J(await pagina(NM.slug)), apagada);
  ok('y con sesión de Orden, lo mismo', await J(await pagina(NV.slug, X.uid)), apagada);
  ok('ni el dueño la ve (no se distingue de una que no existe)', await J(await pagina(NV.slug, NV.uid)), apagada);

  ok('los huecos: ninguno, igual que el link apagado',
    [await J(await huecos(NV)), await J(await huecos(NO))], [[], []]);
  ok('con sesión tampoco', await J(await huecos(NV, X.uid)), []);
  ok('aunque se le pida un día que tenía libres', huecosAntes.length > 0 && (await J(await huecos(NV))).length === 0, true);

  const rApagada = await reservar(NO, 'Alguien', '0981 200 001', { hueco: huecosAntes[0] });
  const rVencida = await reservar(NV, 'Alguien', '0981 200 001', { hueco: huecosAntes[5] });
  rechazado('reservar por el link apagado: rechazado', rApagada, NO_DISPONIBLE);
  rechazado('reservar en el vencido, sin sesión: rechazado', rVencida, NO_DISPONIBLE);
  ok('con el mismo mensaje, letra por letra', rVencida.error, rApagada.error);
  const rConSesion = await reservar(NV, 'Alguien', '0981 200 002', { uid: X.uid, hueco: huecosAntes[6] });
  rechazado('con sesión de Orden, tampoco', rConSesion, NO_DISPONIBLE);
  ok('y con el mismo mensaje', rConSesion.error, rApagada.error);
  rechazado('el mes pagado ya vencido tampoco toma turnos', await reservar(NM, 'Alguien', '0981 200 003'), NO_DISPONIBLE);
  ok('no entró ninguna reserva nueva', await reservasDe(NV), reservasAntes);
  rechazado('desde adentro, el dueño sigue sin poder anotar un turno (candado de siempre)',
    await como(NV.uid, 'select public.reservar($1,$2,$3,$4,$5,$6)', [NV.empresaId, NV.prof, NV.corte, huecosAntes[7], 'X', '0981 300 000']), CANDADO);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Lo ya reservado no se esconde');
  // ═══════════════════════════════════════════════════════════
  const vista = await porToken(r1.token);
  ok('el cliente ve su turno con el enlace', [vista.existe, vista.estado, vista.negocio, vista.servicio, vista.con],
    [true, 'pendiente', 'Barbería que vence', 'Corte', 'Pedro']);
  aceptado('y lo cancela sin sesión', await anon('select public.cancelar_reserva($1)', [r1.token]));
  ok('queda cancelado, y lo sigue viendo', [(await porToken(r1.token)).existe, (await porToken(r1.token)).estado], [true, 'cancelada']);
  ok('cancelar dos veces no rompe nada', await J(await anon('select public.cancelar_reserva($1) j', [r1.token])), { cancelada: true, ya_estaba: true });

  // Hasta la 115: «Se te terminó la prueba…», que además le contaba que el
  // negocio no pagó.
  const conSesion = await como(X.uid, 'select public.cancelar_reserva($1) j', [r3.token]);
  aceptado('un cliente con su sesión de Orden abierta también cancela', conSesion);
  ok('y no se entera de nada: la respuesta es la de siempre', conSesion.ok ? conSesion.valor.rows[0].j : conSesion.error, { cancelada: true });
  aceptado('con el enlace, el dueño con su sesión también (sin sesión ya podía)',
    await como(NV.uid, 'select public.cancelar_reserva($1)', [r4.token]));
  ok('las tres quedaron canceladas',
    await n("select count(*)::int n from public.turnos_reserva where token = any($1) and estado = 'cancelada'", [[r1.token, r3.token, r4.token]]), 3);

  ok('ninguna reserva se borró', await reservasDe(NV), reservasAntes);
  ok('la que anotó el local sigue igual',
    (await filas('select estado, inicia::text from public.turnos_reserva where id=$1', [r2.reserva]))[0], r2Antes);
  ok('y su enlace la sigue mostrando', (await porToken(r2.token)).estado, 'pendiente');
  rechazado('desde adentro, cancelar sigue con el candado (es usar la agenda)',
    await como(NV.uid, 'select public.cancelar_turno($1)', [r2.reserva]), CANDADO);
  rechazado('y marcar que no vino también', await como(NV.uid, 'select public.marcar_no_vino($1)', [r2.reserva]), CANDADO);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · La marca de «cancelar con el enlace» no abre nada más');
  // ═══════════════════════════════════════════════════════════
  const marcar = (token) => db.query("select set_config('orden.cancelando_turno', $1, true)", [token]);
  let marcaAlSalir = null;
  const r5 = await J(await como(NP.uid, 'select public.reservar($1,$2,$3,$4,$5,$6) j',
    [NP.empresaId, NP.prof, NP.corte, (await J(await huecos(NP)))[0], 'Para cancelar', '0981 400 001']));
  await H.intentar(db, X.uid, async () => {
    await db.query('select public.cancelar_reserva($1)', [r5.token]);
    marcaAlSalir = (await db.query("select coalesce(current_setting('orden.cancelando_turno', true), '') m")).rows[0].m;
  });
  ok('cancelar_reserva apaga la marca antes de volver', marcaAlSalir, '');
  rechazado('con la marca de otra reserva, el dueño no cancela esta desde adentro',
    await H.intentar(db, NV.uid, async () => {
      await marcar(r1.token);
      return db.query('select public.cancelar_turno($1)', [r2.reserva]);
    }), CANDADO);
  // Como una función SECURITY DEFINER que actúa por el dueño (candado-vencido.test.js).
  const comoFuncion = async (uid, fn) => {
    await db.exec('begin');
    try {
      await db.query(`select set_config('orden.uid', $1, true)`, [uid]);
      const valor = await fn();
      await db.exec('commit');
      return { ok: true, valor, error: null };
    } catch (e) {
      try { await db.exec('rollback'); } catch { /* ya abortada */ }
      return { ok: false, valor: null, error: e.message ?? String(e) };
    }
  };
  rechazado('con la marca de ESA reserva, cambiarle otra cosa no pasa',
    await comoFuncion(NV.uid, async () => {
      await marcar(r2.token);
      return db.query("update public.turnos_reserva set cliente_nombre = 'Otro' where id = $1", [r2.reserva]);
    }), CANDADO);
  const tokenNuevo = crypto.randomUUID();
  rechazado('ni una reserva nueva con el token marcado',
    await comoFuncion(NV.uid, async () => {
      await marcar(tokenNuevo);
      return db.query(
        `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina, cliente_nombre, token)
         values ($1,$2,$3,now() + interval '2 days',now() + interval '2 days 30 minutes','Colado',$4)`,
        [NV.empresaId, NV.prof, NV.corte, tokenNuevo]);
    }), CANDADO);
  ok('la única función que pone la marca es cancelar_reserva',
    (await filas(`select proname from pg_proc where pronamespace = 'public'::regnamespace
       and prosrc ~ 'set_config\\(\\s*''orden\\.cancelando_turno''' order by 1`)).map((x) => x.proname), ['cancelar_reserva']);
  ok('ninguna función de public llama a set_config con un nombre que venga de afuera',
    (await filas(`select proname from pg_proc where pronamespace = 'public'::regnamespace
       and prosrc ~ 'set_config\\(\\s*[^''\\s]'`)).map((x) => x.proname), []);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Cuando paga, vuelve sola');
  // ═══════════════════════════════════════════════════════════
  ok('mientras estuvo vencido, el link no se tocó (no se guardó nada)', await linkDe(NV), linkAntes);
  await pagar(NV.empresaId);
  ok('pagó: la página vuelve, igual que antes', await J(await pagina(NV.slug)), paginaAntes);
  ok('con sus huecos', (await J(await huecos(NV))).length > 0, true);
  aceptado('y toma turnos otra vez', await reservar(NV, 'Volví', '0981 500 001'));
  ok('el link sigue siendo el mismo, sin que nadie lo prenda', await linkDe(NV), linkAntes);
  await pagar(NM.empresaId);
  ok('el del mes vencido, al renovar, también', (await J(await pagina(NM.slug))).existe, true);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · En prueba o pagando nada cambia; el link apagado, tampoco');
  // ═══════════════════════════════════════════════════════════
  for (const [etiqueta, B] of [['en prueba', NP], ['pagando', NA]]) {
    ok(`${etiqueta}: la página existe`, (await J(await pagina(B.slug))).existe, true);
    ok(`${etiqueta}: con huecos`, (await J(await huecos(B))).length > 0, true);
    const r = await reservar(B, 'Cliente', '0981 600 001');
    aceptado(`${etiqueta}: toma turnos`, r);
    if (r.ok) aceptado(`${etiqueta}: y se cancelan con el enlace`, await anon('select public.cancelar_reserva($1)', [r.valor.rows[0].j.token]));
  }
  ok('el link apagado sigue sin página', await J(await pagina(NO.slug)), NADA);
  await val(NO.uid, 'select public.guardar_link_publico($1,null,true)', [NO.empresaId]);
  ok('lo prende el dueño y aparece', (await J(await pagina(NO.slug))).existe, true);
  await val(NO.uid, 'select public.guardar_link_publico($1,null,false)', [NO.empresaId]);
  await vencer(NO.empresaId);
  await pagar(NO.empresaId);
  ok('apagado, vencido y vuelto a pagar: sigue apagado (el link lo decide el dueño)', await J(await pagina(NO.slug)), NADA);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · La personal, igual que antes');
  // ═══════════════════════════════════════════════════════════
  // Una cuenta personal no usa la agenda, pero la base no se lo impide: lo
  // que tenga contesta igual antes y después de la 115, porque para la
  // personal en Gratis puede_cargar es true (110).
  const P = await H.montarEmpresa(db, { email: 'ana@casa.com', nombre: 'Lo de Ana', tipoCuenta: 'personal' });
  await val(P.uid, "select public.guardar_link_publico($1,'lo-de-ana')", [P.empresaId]);
  const personalAntes = await J(await pagina('lo-de-ana'));
  await vencer(P.empresaId);
  ok('en Gratis contesta lo mismo que en prueba', await J(await pagina('lo-de-ana')), personalAntes);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Los permisos no cambiaron');
  // ═══════════════════════════════════════════════════════════
  const FUNCIONES = [
    ['agenda_publica(text)', true, true],
    ['huecos_publicos(text,uuid,uuid,date)', true, true],
    ['reservar_publico(text,uuid,uuid,timestamptz,text,text)', true, true],
    ['reserva_por_token(uuid)', true, true],
    ['cancelar_reserva(uuid)', true, true],
    ['exigir_cuenta_activa()', false, false],
    ['vaciar_empresa(uuid,text)', false, true],
  ];
  const permisos = [];
  for (const [f] of FUNCIONES) {
    const r = (await filas(
      `select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') b,
              p.prosecdef, array_to_string(p.proconfig, ',') cfg
       from pg_proc p where p.oid = $1::regprocedure`, [`public.${f}`]))[0];
    permisos.push([f, r.a, r.b, r.prosecdef, r.cfg]);
  }
  ok('anon y authenticated ejecutan exactamente lo de antes; todas definer con su search_path',
    permisos, FUNCIONES.map(([f, a, b]) => [f, a, b, true, 'search_path=public']));
  await H.aplicarMigracion(db, '115');
  await H.aplicarMigracion(db, '115');
  ok('la 115 se aplica dos veces: cada función existe una sola vez',
    (await filas(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace
       and proname in ('agenda_publica','huecos_publicos','reservar_publico','cancelar_reserva','exigir_cuenta_activa','vaciar_empresa')`))[0].n, 6);
  await vencer(NV.empresaId);
  ok('y después de aplicarla otra vez, el vencido sigue sin página', await J(await pagina(NV.slug)), NADA);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · La pantalla pública');
  // ═══════════════════════════════════════════════════════════
  // Las worktrees traen CRLF: se normaliza antes de buscar nada.
  const leer = (ruta) => fs.readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
  const pagePublica = leer('src/app/r/[slug]/page.tsx');
  ok('page.tsx manda a not-found cuando la base dice que no existe',
    /if \(!datos\?\.existe\) notFound\(\);/.test(pagePublica), true);
  ok('y hay una pantalla propia para eso, al lado', fs.existsSync('src/app/r/[slug]/not-found.tsx'), true);
  const noEncontrada = leer('src/app/r/[slug]/not-found.tsx');
  const CLAVES = ['noDisponible', 'noDisponibleDetalle', 'siYaTeniasTurno'];
  ok('que usa los textos del diccionario', CLAVES.every((c) => noEncontrada.includes(`r.${c}`)), true);
  ok('y no pregunta nada a la base: no puede distinguir los tres casos', /rpc\(|clienteServidor/.test(noEncontrada), false);
  for (const idioma of ['es', 'pt']) {
    const dic = leer(`src/i18n/textos/${idioma}.ts`);
    const bloque = dic.slice(dic.indexOf('reservaPublica: {'), dic.indexOf('\n  },', dic.indexOf('reservaPublica: {')));
    ok(`los tres textos están en ${idioma}`, CLAVES.filter((c) => !new RegExp(`\\n\\s+${c}: '`).test(bloque)), []);
  }

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE LA PÁGINA DEL VENCIDO FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE LA PÁGINA DEL VENCIDO PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
