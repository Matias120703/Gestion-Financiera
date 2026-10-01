/**
 * Eliminar a alguien lo saca de la agenda (migración 120, 01/10/2026).
 *
 * El caso de Matías, rubro clases, «Tenis manía»: eliminó a su alumna
 * Marianela, que YA LE HABÍA PAGADO, y le seguía apareciendo la clase de hoy
 * con ella en la Agenda («14:00 Marianela, Tenis» con Clase dada / Mover /
 * No se tuvo la clase) y en el panel («Tus clases de hoy»). «Ella me pagó,
 * perfecto. Si pagó y no vino más, la elimino, y no me tiene que aparecer
 * más en la agenda.»
 *
 * LO QUE SE PRUEBA (cada número es el grupo del mismo número, abajo)
 *
 *   1. El caso exacto: alumna con su período PAGADO y clases de hoy en
 *      adelante. Al eliminarla, sus clases de hoy en adelante se cancelan
 *      (también la de hoy que ya pasó sin marcar), y la venta, el período
 *      pagado (abierto, como en la 116), la clase ya dada y lo de días
 *      anteriores quedan. Una clase de un día anterior sin marcar se puede
 *      seguir marcando. El panel, la vista Día y el calendario de la semana
 *      ya no la tienen; su compañero de la clase en grupo sigue. La lista
 *      de clientes decía antes cuántas clases le iban a salir.
 *   2. Alumna con un período SIN cobrar: lo de la 116 sigue igual. Y el
 *      reporte de un mes pasado («Se terminaron», «Vencieron») no cambia al
 *      eliminar a quien terminó o venció ese mes.
 *   3. Barbería: un cliente con un turno sacado por el link se cancela; su
 *      link lo muestra cancelado, el horario vuelve a quedar libre, el aviso
 *      de la tarde ya no lo cuenta. Lo atendido queda.
 *   4. Negocio vencido: eliminar anda, y la marca no abre nada más.
 *   5. Anular el cobro de alguien ya eliminado: la regla de la 116 sigue
 *      (sin clases se borra; con clases queda cerrado).
 *   6. Lo que ya estaba: una base de antes de la 120 reproduce el error de
 *      Matías (es el control: sin la 120, Marianela sigue en la agenda), y
 *      al aplicarle la 120 se arregla solo, con la lista de a quién tocó.
 *      Los turnos sueltos (barbería, link) de los ya eliminados no se
 *      tocan: se listan; uno de hoy que ya pasó se puede seguir cobrando.
 *      Los reportes de meses pasados no cambian. Aplicarla dos veces no
 *      cancela nada más.
 *   7. Permisos, search_path y copia exacta de cada función redefinida.
 *   8. La pantalla: la confirmación dice cuántas clases o turnos salen de la
 *      agenda, con la palabra del rubro, y ya no dice «no se cancela».
 */
const fs = require('fs');
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

/** Dos textos largos iguales, letra por letra; si no, dónde se separan. */
function igual(nombre, real, esperado) {
  corridas++;
  if (real === esperado) { console.log(`  ✓ ${nombre} → ${real.length} letras iguales`); return; }
  fallos++;
  let i = 0;
  while (i < real.length && real[i] === esperado[i]) i++;
  console.log(`  ✗ ${nombre}\n      se separan en la letra ${i}:\n      obtenido: ${JSON.stringify(real.slice(Math.max(0, i - 60), i + 60))}\n      esperado: ${JSON.stringify(esperado.slice(Math.max(0, i - 60), i + 60))}`);
}

function rechazado(nombre, res, frag) {
  corridas++;
  if (res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      NO fue rechazada`); return; }
  if (frag && !new RegExp(frag, 'i').test(res.error)) {
    fallos++; console.log(`  ✗ ${nombre}\n      otro motivo: ${res.error}`); return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 64)}`);
}

// El de siempre para un negocio vencido (069).
const CANDADO = 'Se te terminó la prueba';
const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];

const vencer = (db, id) => db.query(
  `update public.suscripciones
   set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
   where empresa_id = $1`, [id]);

// Las worktrees traen CRLF: se normaliza antes de buscar nada.
const leer = (ruta) => fs.readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');

/** Ayudantes contra una base y una empresa: los usan la base nueva y la vieja. */
function ayudantes(db, P) {
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(`${sql} → ${r.error}`);
    return r.valor.rows[0];
  };
  const j = async (sql, args) => (await valor(P.uid, sql, args)).j;
  const uno = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const n = async (sql, args = []) => Number((await uno(sql, args)).n);
  const dia = async (d) => (await uno('select (public.hoy_empresa($1) + $2::int)::text d', [P.empresaId, d])).d;
  const alumno = async (nombre, tel) => (await valor(P.uid,
    'select public.guardar_cliente($1,$2,$3,$4,$5) id', [P.empresaId, nombre, tel, '', null])).id;
  // La clase de tenis, en grupo (108), como la de Matías. A las 00:00 por
  // defecto: la clase de hoy ya pasó cuando corre la prueba, sin marcar.
  const inscribir = async (cliente, { desde, hasta, total = 600000, pagado = false, dias = TODOS_LOS_DIAS, de = '00:00', a = '00:30' }) => {
    const r = await como(P.uid,
      'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) j',
      [P.empresaId, cliente, dias, de, a, desde, hasta, null, total, pagado, 'efectivo', null, 'Tenis', null, true]);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const eliminar = (uid, cliente) => como(uid, 'select public.eliminar_cliente($1) r', [cliente]);
  // Lo que la 120 saca de la agenda: pendientes o confirmadas de hoy en
  // adelante, en la hora del negocio.
  const deHoyEnAdelante = (cliente) => n(
    `select count(*)::int n from public.turnos_reserva r join public.empresas e on e.id = r.empresa_id
     where r.cliente_id = $1 and r.estado in ('pendiente','confirmada')
       and (r.inicia at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date >= public.hoy_empresa(e.id)`, [cliente]);
  const reservaDel = async (paquete, fecha) => uno(
    `select r.id, r.estado from public.turnos_reserva r
     where r.paquete_id = $1 and (r.inicia at time zone 'America/Asuncion')::date = $2::date`, [paquete, fecha]);
  const paquete = (id) => uno('select * from public.paquetes where id = $1', [id]);
  const panelHoy = async () => (await j(
    'select public.panel_profe($1, public.hoy_empresa($1), public.hoy_empresa($1)) j', [P.empresaId])).hoy.map((x) => x.alumno).sort();
  const agendaDel = async (fecha) => (await j('select public.agenda_del_dia($1, $2) j', [P.empresaId, fecha]))
    .map((x) => x.cliente).sort();
  return { como, valor, j, uno, n, dia, alumno, inscribir, eliminar, deHoyEnAdelante, reservaDel, paquete, panelHoy, agendaDel };
}

(async () => {
  const db = await H.crearBase();
  const sql120 = leer(`supabase/migrations/${H.migraciones().find((f) => f.startsWith('120'))}`);

  const P = await H.montarEmpresa(db, { email: 'tenis@mania.com', nombre: 'Tenis manía', rubro: 'clases' });
  const A = ayudantes(db, P);
  const { como, valor, j, uno, n, dia, alumno, inscribir, eliminar, deHoyEnAdelante, reservaDel, paquete, panelHoy, agendaDel } = A;
  const hoy = await dia(0);
  const manana = await dia(1);
  const ventasHoy = async () => Number((await j(
    'select public.resumen_financiero($1, public.hoy_empresa($1), public.hoy_empresa($1)) j', [P.empresaId])).ventas);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · El caso de Matías: Marianela pagó y no vino más');
  // ═══════════════════════════════════════════════════════════
  // Todos los días a las 00:00, de hace una semana a dentro de veinte días,
  // con Matias en la misma clase (en grupo, 108). Marianela pagó entero.
  const matias = await alumno('Matias', '0981600000');
  const marianela = await alumno('Marianela', '0982877500');
  const desde = await dia(-7);
  const hasta = await dia(20);
  const iMatias = await inscribir(matias, { desde, hasta, total: 600000 });
  const iMarianela = await inscribir(marianela, { desde, hasta, total: 877500, pagado: true });
  ok('Marianela pagó: su período tiene su venta', Boolean(iMarianela.movimiento), true);

  // La primera semana vino: la clase de hace siete días se marca dada.
  const dada = await reservaDel(iMarianela.paquete, desde);
  ok('su clase de hace una semana se marca dada', (await como(P.uid, 'select public.marcar_clase($1, true)', [dada.id])).ok, true);
  // La de hace tres días quedó sin marcar: es de un día anterior.
  const sinMarcar = await reservaDel(iMarianela.paquete, await dia(-3));
  ok('la de hace tres días quedó sin marcar', sinMarcar.estado, 'confirmada');
  const deHoy = await reservaDel(iMarianela.paquete, hoy);
  ok('la de hoy (00:00) ya pasó y está sin marcar, como en su captura', deHoy.estado, 'confirmada');

  ok('el panel de hoy la tiene, con Matias', await panelHoy(), ['Marianela', 'Matias']);
  ok('la vista Día de hoy también', await agendaDel(hoy), ['Marianela', 'Matias']);
  const porVenir = await deHoyEnAdelante(marianela);
  ok('tiene clases de hoy en adelante: hoy y los veinte días que vienen', porVenir, 21);
  const enLista = (await j('select public.lista_clientes($1) j', [P.empresaId])).find((c) => c.id === marianela);
  ok('la lista de clientes dice cuántas le salen, antes de confirmar', enLista?.por_venir, porVenir);
  const semana = async () => (await j('select public.agenda_calendario($1, $2, $3) j', [P.empresaId, hoy, await dia(6)]))
    .map((x) => x.turnos);
  ok('el calendario de la semana cuenta dos por día', await semana(), [2, 2, 2, 2, 2, 2, 2]);
  const vendidoAntes = await ventasHoy();
  const clasesDadasAntes = await n('select count(*)::int n from public.clases_dadas where paquete_id = $1', [iMarianela.paquete]);

  const quitada = await eliminar(P.uid, marianela);
  ok('eliminarla anda; con un cobro, se archiva', quitada.ok ? quitada.valor.rows[0].r : quitada.error, 'archivado');

  ok('sus clases de hoy en adelante salen de la agenda', await deHoyEnAdelante(marianela), 0);
  ok('canceladas, no borradas: siguen siendo historia', await n(
    `select count(*)::int n from public.turnos_reserva where paquete_id = $1 and estado = 'cancelada'`,
    [iMarianela.paquete]), porVenir);
  ok('también la de hoy que ya había pasado sin marcar', (await reservaDel(iMarianela.paquete, hoy)).estado, 'cancelada');
  ok('el panel de hoy ya no la tiene: solo Matias', await panelHoy(), ['Matias']);
  ok('la vista Día de hoy tampoco', await agendaDel(hoy), ['Matias']);
  ok('ni la de mañana', await agendaDel(manana), ['Matias']);
  ok('el calendario cuenta uno por día', await semana(), [1, 1, 1, 1, 1, 1, 1]);
  ok('Matias, en la misma clase, sigue con todas las suyas', await deHoyEnAdelante(matias), 21);

  const pM = await paquete(iMarianela.paquete);
  ok('su período pagado sigue abierto, como lo dejaba la 116: no hace falta cerrarlo', pM.cerrado, false);
  ok('y sigue con su venta', pM.movimiento_id, iMarianela.movimiento);
  ok('la venta sigue activa', (await uno('select estado from public.movimientos where id = $1', [iMarianela.movimiento])).estado, 'activo');
  ok('y sigue sumando en lo vendido de hoy', await ventasHoy(), vendidoAntes);
  ok('la clase que se dio queda dada', (await reservaDel(iMarianela.paquete, desde)).estado, 'atendida');
  ok('y descontada', await n('select count(*)::int n from public.clases_dadas where paquete_id = $1', [iMarianela.paquete]), clasesDadasAntes);
  ok('la de hace tres días, sin marcar, queda como estaba: es historia', (await reservaDel(iMarianela.paquete, await dia(-3))).estado, 'confirmada');
  const rep = await j('select public.reporte_alumnos($1,$2,$3) j', [P.empresaId, desde, hoy]);
  const fila = rep.alumnos.find((x) => x.cliente_id === marianela);
  ok('en el reporte, lo que pagó y la clase que dio siguen: es historia', [Number(fila?.cobrado), Number(fila?.clases)], [877500, 1]);
  ok('pero no figura como activa', rep.activos, 1);
  ok('no figura en la lista', (await j('select public.lista_clientes($1) j', [P.empresaId])).some((c) => c.id === marianela), false);
  ok('Por cobrar no la tiene (nunca debió)', (await j('select public.por_cobrar_alumnos($1) j', [P.empresaId]))
    .lista.some((x) => x.cliente_id === marianela), false);
  ok('ni el panel la cuenta como alumna activa', (await j(
    'select public.panel_profe($1, public.hoy_empresa($1), public.hoy_empresa($1)) j', [P.empresaId])).alumnos_activos, 1);

  // Vino hace tres días y el profe no lo anotó. Con el período abierto,
  // «Clase dada» en la agenda de ese día anda y la clase entra al reporte.
  // (Si eliminar cerrara el período, dar_clase la rechazaba: «Ese paquete
  // está cerrado».)
  const marcada = await como(P.uid, 'select public.marcar_clase($1, true)', [sinMarcar.id]);
  ok('la clase de hace tres días se puede marcar dada después de eliminarla', marcada.ok ? true : marcada.error, true);
  const rep2 = await j('select public.reporte_alumnos($1,$2,$3) j', [P.empresaId, desde, hoy]);
  ok('y entra al reporte: dos clases dadas', Number(rep2.alumnos.find((x) => x.cliente_id === marianela)?.clases), 2);

  // Si vuelve con el mismo teléfono: su ficha, con su período pagado (sigue
  // abierto) y sin nada en la agenda hasta que el profe lo decida.
  ok('si vuelve con el mismo teléfono, es su ficha', await alumno('Marianela', '0982877500'), marianela);
  const ficha = await j('select public.paquetes_del_alumno($1,$2) j', [P.empresaId, marianela]);
  ok('con su período pagado', ficha.map((x) => [x.estado, x.pagado]), [['activo', true]]);
  ok('y la agenda de mañana sigue sin ella', await agendaDel(manana), ['Matias']);
  // Se va de nuevo, para que no moleste en lo que sigue.
  await eliminar(P.uid, marianela);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Sin cobrar: lo de la 116 sigue igual');
  // ═══════════════════════════════════════════════════════════
  // Sin clases: lo anotado por error se borra con su agenda, y ella también.
  const eli = await alumno('Eli', '0983000004');
  const iEli = await inscribir(eli, { desde: await dia(7), hasta: await dia(37), dias: [1, 3], de: '17:00', a: '18:00' });
  ok('sin clases y sin cobrar: se borra de verdad', (await eliminar(P.uid, eli)).valor?.rows[0].r, 'borrado');
  ok('su período ya no existe', await paquete(iEli.paquete), undefined);
  ok('ni sus clases', await n('select count(*)::int n from public.turnos_reserva where paquete_id = $1', [iEli.paquete]), 0);

  // Con clases: se cierra sin cobrar; la clase que dio queda.
  const elena = await alumno('Elena', '0983000007');
  const iElena = await inscribir(elena, { desde: await dia(-14), hasta: await dia(14), total: 420000, de: '12:00', a: '13:00' });
  const claseElena = (await uno('select id from public.turnos_reserva where paquete_id = $1 order by inicia limit 1', [iElena.paquete])).id;
  await valor(P.uid, 'select public.marcar_clase($1, true)', [claseElena]);
  ok('con clases y sin cobrar: se archiva', (await eliminar(P.uid, elena)).valor?.rows[0].r, 'archivado');
  ok('su período queda cerrado y sin cobrar', [(await paquete(iElena.paquete)).cerrado, (await paquete(iElena.paquete)).movimiento_id], [true, null]);
  ok('sin clases de hoy en adelante', await deHoyEnAdelante(elena), 0);
  ok('la que dio queda', (await uno('select estado from public.turnos_reserva where id = $1', [claseElena])).estado, 'atendida');
  ok('y no debe nada', (await j('select public.por_cobrar_alumnos($1) j', [P.empresaId])).lista.some((x) => x.cliente_id === elena), false);

  // Uno pagado y otro sin cobrar a la vez: lo sin cobrar se borra, lo
  // pagado sigue abierto, y nada queda en la agenda.
  const diego = await alumno('Diego', '0983000006');
  const iPagado = await inscribir(diego, { desde: await dia(-14), hasta: await dia(14), total: 350000, pagado: true, dias: [2], de: '10:00', a: '11:00' });
  const iDebe = await inscribir(diego, { desde: await dia(20), hasta: await dia(50), total: 350000, dias: [2], de: '10:00', a: '11:00' });
  ok('Diego: se archiva', (await eliminar(P.uid, diego)).valor?.rows[0].r, 'archivado');
  ok('lo sin cobrar se fue (116)', await paquete(iDebe.paquete), undefined);
  ok('lo pagado sigue abierto con su venta, como en la 116', [(await paquete(iPagado.paquete)).cerrado, (await paquete(iPagado.paquete)).movimiento_id], [false, iPagado.movimiento]);
  ok('y nada suyo queda en la agenda (120)', await deHoyEnAdelante(diego), 0);

  // El reporte de un mes pasado: Ana terminó su paquete de dos clases y a
  // Beto se le venció el suyo, los dos hace un mes. Eliminarlos hoy no
  // los saca de «Se terminaron» y «Vencieron» de ese mes (reporte_alumnos
  // cuenta solo paquetes sin cerrar: eliminar no cierra nada).
  const ana = await alumno('Ana', '0983000020');
  const iAna = await inscribir(ana, { desde: await dia(-35), hasta: await dia(-34), total: 100000, pagado: true, de: '08:00', a: '09:00' });
  for (const x of (await db.query('select id from public.turnos_reserva where paquete_id = $1', [iAna.paquete])).rows) {
    await valor(P.uid, 'select public.marcar_clase($1, true)', [x.id]);
  }
  const beto = await alumno('Beto', '0983000021');
  await inscribir(beto, { desde: await dia(-40), hasta: await dia(-31), total: 100000, pagado: true, de: '07:00', a: '08:00' });
  const mesPasado = async () => {
    const pq = (await j('select public.reporte_alumnos($1,$2,$3) j', [P.empresaId, await dia(-45), await dia(-25)])).paquetes;
    return [pq.terminados, pq.vencidos];
  };
  ok('el reporte de hace un mes: uno terminó y uno venció', await mesPasado(), [1, 1]);
  ok('Ana y Beto se archivan', [(await eliminar(P.uid, ana)).valor?.rows[0].r, (await eliminar(P.uid, beto)).valor?.rows[0].r], ['archivado', 'archivado']);
  ok('y el reporte de ese mes sigue igual', await mesPasado(), [1, 1]);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Barbería: el turno sacado por el link se cancela');
  // ═══════════════════════════════════════════════════════════
  const B = await H.montarEmpresa(db, { email: 'duenio@barba.com', nombre: 'Barbería Lucas', rubro: 'servicios' });
  const AB = ayudantes(db, B);
  const corte = await H.crearProducto(db, B.empresaId, B.uid, { nombre: 'Corte', costo: 12000, precio: 50000, controla_stock: false });
  await AB.valor(B.uid, 'select public.guardar_servicio_agenda($1,$2,$3)', [B.empresaId, corte, 30]);
  const prof = (await AB.valor(B.uid, "select public.guardar_profesional($1,'Pedro','comision',50,$2) id", [B.empresaId, B.uid])).id;
  for (let d = 0; d < 7; d++) await AB.valor(B.uid, "select public.guardar_horario($1,$2,$3,'08:00','20:00')", [B.empresaId, prof, d]);
  await AB.valor(B.uid, "select public.guardar_link_publico($1,'barberia-lucas',true,'','Te esperamos','Calle 1')", [B.empresaId]);
  const mananaB = await AB.dia(1);
  const hueco = (await AB.uno('select inicia from public.huecos_del_dia($1,$2,$3) order by 1 limit 1', [prof, mananaB, corte])).inicia;
  // Sin sesión: exactamente lo que hace un cliente que entra por el link.
  const reservado = await H.intentarComo(db, 'anon', null, () => db.query(
    'select public.reservar_publico($1,$2,$3,$4,$5,$6) j', ['barberia-lucas', prof, corte, hueco, 'Toto Barba', '0983100010']));
  ok('Toto saca un turno para mañana por el link', reservado.ok ? true : reservado.error, true);
  const token = reservado.valor?.rows[0].j.token;
  const toto = (await AB.uno('select cliente_id from public.turnos_reserva where token = $1', [token])).cliente_id;
  ok('la reserva le dejó su ficha (053)', Boolean(toto), true);
  // Lo que ya pasó con él: un corte atendido la semana pasada y uno de
  // anteayer que nadie marcó; y uno de hoy temprano, sin marcar.
  const insertar = (inicia, estado) => db.query(
    `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina,
       cliente_nombre, cliente_telefono, cliente_id, estado, origen)
     values ($1,$2,$3,$4::timestamptz,$4::timestamptz + interval '30 minutes','Toto Barba','0983100010',$5,$6,'local')
     returning id`, [B.empresaId, prof, corte, inicia, toto, estado]);
  const enHora = async (fecha, hora) => (await AB.uno(
    "select (($1::date + $2::time) at time zone 'America/Asuncion')::text t", [fecha, hora])).t;
  const atendido = (await insertar(await enHora(await AB.dia(-7), '09:00'), 'atendida')).rows[0].id;
  const olvidado = (await insertar(await enHora(await AB.dia(-2), '09:00'), 'confirmada')).rows[0].id;
  const temprano = (await insertar(await enHora(await AB.dia(0), '00:00'), 'confirmada')).rows[0].id;
  const totoEnLista = (await AB.j('select public.lista_clientes($1) j', [B.empresaId])).find((c) => c.id === toto);
  ok('la lista dice que tiene dos turnos de hoy en adelante', totoEnLista?.por_venir, 2);
  ok('mañana no sale en los huecos del link: está tomado',
    (await AB.uno('select count(*)::int n from public.huecos_del_dia($1,$2,$3) where inicia = $4', [prof, mananaB, corte, hueco])).n, 0);
  const avisoTarde = async () => ((await AB.uno('select public.turnos_de_manana() j')).j
    .find((x) => x.empresa_id === B.empresaId)?.turnos) ?? 0;
  ok('el aviso de la tarde lo cuenta para mañana', await avisoTarde(), 1);

  ok('eliminarlo anda; con turnos, se archiva', (await AB.eliminar(B.uid, toto)).valor?.rows[0].r, 'archivado');
  ok('su turno del link queda cancelado', (await AB.uno('select estado from public.turnos_reserva where token = $1', [token])).estado, 'cancelada');
  ok('y el de hoy temprano, sin marcar, también', (await AB.uno('select estado from public.turnos_reserva where id = $1', [temprano])).estado, 'cancelada');
  ok('su link se lo muestra cancelado', (await H.intentarComo(db, 'anon', null, () => db.query(
    'select public.reserva_por_token($1) j', [token]))).valor?.rows[0].j.estado, 'cancelada');
  ok('el horario vuelve a quedar libre en el link',
    (await AB.uno('select count(*)::int n from public.huecos_del_dia($1,$2,$3) where inicia = $4', [prof, mananaB, corte, hueco])).n, 1);
  ok('la agenda de mañana ya no lo tiene', (await AB.j('select public.agenda_del_dia($1,$2) j', [B.empresaId, mananaB])).length, 0);
  ok('ni la de hoy', (await AB.j('select public.agenda_del_dia($1,$2) j', [B.empresaId, await AB.dia(0)])).length, 0);
  ok('el aviso de la tarde ya no lo cuenta', await avisoTarde(), 0);
  ok('lo atendido queda atendido', (await AB.uno('select estado from public.turnos_reserva where id = $1', [atendido])).estado, 'atendida');
  ok('lo de anteayer sin marcar queda como estaba', (await AB.uno('select estado from public.turnos_reserva where id = $1', [olvidado])).estado, 'confirmada');
  const porEstado = (await AB.j('select public.reporte_turnos($1,$2,$3) j', [B.empresaId, mananaB, mananaB])).por_estado;
  ok('el reporte de turnos lo cuenta como cancelado, no como vigente',
    [porEstado.cancelada, porEstado.pendiente, porEstado.confirmada], [1, 0, 0]);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Negocio vencido: eliminar anda y la marca no abre nada más');
  // ═══════════════════════════════════════════════════════════
  const W = await H.montarEmpresa(db, { email: 'vencida@tenis.com', nombre: 'Tenis que no pagó', rubro: 'clases' });
  const AW = ayudantes(db, W);
  const hugo = await AW.alumno('Hugo', '0986000001');
  const iHugo = await AW.inscribir(hugo, { desde: await AW.dia(-7), hasta: await AW.dia(14), total: 500000, pagado: true, de: '06:00', a: '07:00' });
  const claseHugo = (await AW.uno('select id from public.turnos_reserva where paquete_id = $1 order by inicia limit 1', [iHugo.paquete])).id;
  await AW.valor(W.uid, 'select public.marcar_clase($1, true)', [claseHugo]);
  const jose = await AW.alumno('José', '0986000003');
  const iJose = await AW.inscribir(jose, { desde: await AW.dia(-7), hasta: await AW.dia(14), total: 500000, pagado: true, de: '07:00', a: '08:00' });
  await vencer(db, W.empresaId);
  // Sin la marca, el candado frena lo mismo que eliminar hace por dentro.
  rechazado('vencido, cerrar un paquete a mano no anda (candado, 111)',
    await AW.como(W.uid, 'select public.cerrar_paquete($1, true)', [iJose.paquete]), CANDADO);
  rechazado('ni cancelar un turno desde la agenda',
    await AW.como(W.uid, 'select public.cancelar_turno($1)', [(await AW.uno(
      "select id from public.turnos_reserva where paquete_id = $1 and inicia > now() order by inicia limit 1", [iJose.paquete])).id]), CANDADO);

  const conMarca = await H.intentar(db, W.uid, async () => {
    const r = (await db.query('select public.eliminar_cliente($1) r', [hugo])).rows[0].r;
    const marca = (await db.query("select coalesce(current_setting('orden.eliminando_cliente', true), '') m")).rows[0].m;
    return { r, marca };
  });
  ok('vencido, eliminar a Hugo (pagado, con clases) anda', conMarca.ok ? conMarca.valor.r : conMarca.error, 'archivado');
  ok('y apaga la marca antes de volver', conMarca.valor?.marca, '');
  ok('su período pagado sigue abierto', (await AW.paquete(iHugo.paquete)).cerrado, false);
  ok('sus clases de hoy en adelante salen de la agenda', await AW.deHoyEnAdelante(hugo), 0);
  ok('la que dio queda', (await AW.uno('select estado from public.turnos_reserva where id = $1', [claseHugo])).estado, 'atendida');
  ok('José, el otro alumno, sigue con sus clases', (await AW.deHoyEnAdelante(jose)) > 0, true);

  // La marca puesta a mano, como lo haría una función con la sesión del
  // dueño vencido: solo deja cerrar los paquetes y cancelar las reservas de
  // ESE alumno.
  const conMarcaDe = async (cliente, sql, args) => {
    await db.exec('begin');
    try {
      await db.query("select set_config('orden.uid', $1, true)", [W.uid]);
      await db.query("select set_config('orden.eliminando_cliente', $1, true)", [cliente]);
      await db.query(sql, args);
      await db.exec('commit');
      return { ok: true, error: null };
    } catch (e) {
      try { await db.exec('rollback'); } catch { /* ya abortada */ }
      return { ok: false, error: e.message ?? String(e) };
    }
  };
  const unaDeHugo = (await AW.uno(
    "select id from public.turnos_reserva where paquete_id = $1 and estado = 'cancelada' order by inicia desc limit 1", [iHugo.paquete])).id;
  const unaDeJose = (await AW.uno(
    "select id from public.turnos_reserva where paquete_id = $1 and inicia > now() order by inicia limit 1", [iJose.paquete])).id;
  rechazado('con la marca de Hugo no se cancelan las clases de José',
    await conMarcaDe(hugo, "update public.turnos_reserva set estado = 'cancelada' where id = $1", [unaDeJose]), CANDADO);
  rechazado('ni se cierra el período de José',
    await conMarcaDe(hugo, 'update public.paquetes set cerrado = true where id = $1', [iJose.paquete]), CANDADO);
  rechazado('ni se vuelve a confirmar una clase de Hugo',
    await conMarcaDe(hugo, "update public.turnos_reserva set estado = 'confirmada' where id = $1", [unaDeHugo]), CANDADO);
  rechazado('ni se marca atendida',
    await conMarcaDe(hugo, "update public.turnos_reserva set estado = 'atendida' where id = $1", [unaDeHugo]), CANDADO);
  rechazado('ni se le cambia el precio a su período',
    await conMarcaDe(hugo, 'update public.paquetes set precio = 1 where id = $1', [iHugo.paquete]), CANDADO);
  rechazado('ni se le agenda una clase nueva (un INSERT nunca pasa)',
    await conMarcaDe(hugo, `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina,
       cliente_nombre, cliente_telefono, cliente_id, estado, origen)
       select empresa_id, profesional_id, producto_id, inicia + interval '60 days', termina + interval '60 days',
              cliente_nombre, cliente_telefono, cliente_id, 'confirmada', 'local'
       from public.turnos_reserva where id = $1`, [unaDeHugo]), CANDADO);
  ok('la única función que pone la marca sigue siendo eliminar_cliente',
    (await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace
       and prosrc ~ 'set_config\\(\\s*''orden\\.eliminando_cliente''' order by 1`)).rows.map((x) => x.proname), ['eliminar_cliente']);
  ok('el guardián no se tocó: la 120 no lo redefine (vale el de la 116)',
    /function public\.exigir_cuenta_activa\(/.test(sql120), false);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Anular el cobro de alguien ya eliminado (116, sigue)');
  // ═══════════════════════════════════════════════════════════
  // Zoe pagó y no tuvo ninguna clase. Al eliminarla, lo pagado sigue
  // abierto y sin nada en la agenda; si después se le devuelve la plata, la
  // 116 (anular_vuelve_por_cobrar, que la 120 no toca) lo borra con su agenda.
  const zoe = await alumno('Zoe', '0983000010');
  const iZoe = await inscribir(zoe, { desde: await dia(7), hasta: await dia(37), total: 350000, pagado: true, dias: [1], de: '19:00', a: '20:00' });
  ok('Zoe se archiva', (await eliminar(P.uid, zoe)).valor?.rows[0].r, 'archivado');
  ok('su período pagado sigue abierto, sin clases en la agenda', [(await paquete(iZoe.paquete)).cerrado, await deHoyEnAdelante(zoe)], [false, 0]);
  ok('se le devuelve la plata', (await como(P.uid, "select public.anular_movimiento($1,'Devolución')", [iZoe.movimiento])).ok, true);
  ok('sin clases, su período se borra (116)', await paquete(iZoe.paquete), undefined);
  ok('con sus reservas', await n('select count(*)::int n from public.turnos_reserva where paquete_id = $1', [iZoe.paquete]), 0);
  ok('la venta anulada queda en el Historial', (await uno('select estado from public.movimientos where id = $1', [iZoe.movimiento])).estado, 'anulado');
  ok('si vuelve, no trae ese período', (await j('select public.paquetes_del_alumno($1,$2) j', [P.empresaId, await alumno('Zoe', '0983000010')])).length, 0);

  // Yago pagó y tuvo una clase: devuelta la plata, queda cerrado y su clase también.
  const yago = await alumno('Yago', '0983000011');
  const iYago = await inscribir(yago, { desde: await dia(-14), hasta: await dia(14), total: 420000, pagado: true, de: '20:00', a: '21:00' });
  const claseYago = (await uno('select id from public.turnos_reserva where paquete_id = $1 order by inicia limit 1', [iYago.paquete])).id;
  await valor(P.uid, 'select public.marcar_clase($1, true)', [claseYago]);
  ok('Yago se archiva', (await eliminar(P.uid, yago)).valor?.rows[0].r, 'archivado');
  ok('se le devuelve la plata', (await como(P.uid, "select public.anular_movimiento($1,'Devolución')", [iYago.movimiento])).ok, true);
  ok('con clases, su período queda cerrado y sin cobrar', [(await paquete(iYago.paquete))?.cerrado, (await paquete(iYago.paquete))?.movimiento_id], [true, null]);
  ok('la clase que dio queda', (await uno('select estado from public.turnos_reserva where id = $1', [claseYago])).estado, 'atendida');
  ok('y no vuelve a Por cobrar', (await j('select public.por_cobrar_alumnos($1) j', [P.empresaId])).lista.some((x) => x.cliente_id === yago), false);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Lo que ya estaba: una base de antes de la 120');
  // ═══════════════════════════════════════════════════════════
  // Es el control: con la base de antes, el error de Matías se reproduce
  // tal cual. Y al aplicarle la 120, se arregla solo.
  const previa = H.migraciones().filter((f) => f < '120').pop().slice(0, 3);
  const vieja = await H.crearBase({ hasta: previa });
  const PV = await H.montarEmpresa(vieja, { email: 'tenis@vieja.com', nombre: 'Tenis manía', rubro: 'clases' });
  const V = ayudantes(vieja, PV);
  const hoyV = await V.dia(0);
  const mV = await V.alumno('Matias', '0981600000');
  const marV = await V.alumno('Marianela', '0982877500');
  const desdeV = await V.dia(-7);
  await V.inscribir(mV, { desde: desdeV, hasta: await V.dia(20) });
  const iMarV = await V.inscribir(marV, { desde: desdeV, hasta: await V.dia(20), total: 877500, pagado: true });
  await V.valor(PV.uid, 'select public.marcar_clase($1, true)', [(await V.reservaDel(iMarV.paquete, desdeV)).id]);
  ok(`sin la 120 (base hasta la ${previa}), eliminar a Marianela la archiva`, (await V.eliminar(PV.uid, marV)).valor?.rows[0].r, 'archivado');
  ok('y sigue en el panel de hoy: el error de la captura', await V.panelHoy(), ['Marianela', 'Matias']);
  ok('y en la vista Día', await V.agendaDel(hoyV), ['Marianela', 'Matias']);
  ok('con todas sus clases de hoy en adelante', await V.deHoyEnAdelante(marV), 21);
  ok('y su período pagado abierto', (await V.paquete(iMarV.paquete)).cerrado, false);
  // Una barbería de antes, con un cliente eliminado y su turno del link.
  const BV = await H.montarEmpresa(vieja, { email: 'duenio@barba-vieja.com', nombre: 'Barbería vieja', rubro: 'servicios' });
  const ABV = ayudantes(vieja, BV);
  const corteV = await H.crearProducto(vieja, BV.empresaId, BV.uid, { nombre: 'Corte', costo: 12000, precio: 50000, controla_stock: false });
  await ABV.valor(BV.uid, 'select public.guardar_servicio_agenda($1,$2,$3)', [BV.empresaId, corteV, 30]);
  const profV = (await ABV.valor(BV.uid, "select public.guardar_profesional($1,'Pedro','comision',50,$2) id", [BV.empresaId, BV.uid])).id;
  for (let d = 0; d < 7; d++) await ABV.valor(BV.uid, "select public.guardar_horario($1,$2,$3,'08:00','20:00')", [BV.empresaId, profV, d]);
  await ABV.valor(BV.uid, "select public.guardar_link_publico($1,'barberia-vieja',true,'','Te esperamos','Calle 1')", [BV.empresaId]);
  const mananaV = await ABV.dia(1);
  const huecoV = (await ABV.uno('select inicia from public.huecos_del_dia($1,$2,$3) order by 1 limit 1', [profV, mananaV, corteV])).inicia;
  const tokenV = (await H.intentarComo(vieja, 'anon', null, () => vieja.query(
    'select public.reservar_publico($1,$2,$3,$4,$5,$6) j', ['barberia-vieja', profV, corteV, huecoV, 'Toto Viejo', '0983100099'])))
    .valor.rows[0].j.token;
  const totoV = (await ABV.uno('select cliente_id from public.turnos_reserva where token = $1', [tokenV])).cliente_id;
  // Y uno de hoy a las 00:00, ya pasado: vino y el dueño lo cobra a la noche.
  // (La base vieja no tiene comienzo_de_hoy: las 00:00 de hoy, a mano.)
  const hoyTempranoV = (await vieja.query(
    `with t as (select public.hoy_empresa($1)::timestamp at time zone 'America/Asuncion' as inicia)
     insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina,
       cliente_nombre, cliente_telefono, cliente_id, estado, origen)
     select $1, $2, $3, t.inicia, t.inicia + interval '30 minutes', 'Toto Viejo', '0983100099', $4, 'confirmada', 'local'
     from t
     returning id`, [BV.empresaId, profV, corteV, totoV])).rows[0].id;
  ok('sin la 120, eliminar al cliente de la barbería lo archiva', (await ABV.eliminar(BV.uid, totoV)).valor?.rows[0].r, 'archivado');
  ok('y su turno del link sigue en pie («no se cancela», decía la pantalla)', (await ABV.uno('select estado from public.turnos_reserva where token = $1', [tokenV])).estado, 'pendiente');
  // Uno ya eliminado sin nada por darse: la 120 no tiene nada que hacerle.
  const quieto = await V.alumno('Quieto', '0981700010');
  await V.inscribir(quieto, { desde: await V.dia(-30), hasta: await V.dia(-20), total: 100000, pagado: true, dias: [2], de: '09:00', a: '10:00' });
  await vieja.query('update public.paquetes set cerrado = true where cliente_id = $1', [quieto]);
  await V.eliminar(PV.uid, quieto);
  // Ana terminó y a Beto se le venció su paquete hace un mes; los dos ya
  // eliminados. El reporte de ese mes no puede cambiar al aplicar la 120.
  const anaV = await V.alumno('Ana', '0981700020');
  const iAnaV = await V.inscribir(anaV, { desde: await V.dia(-35), hasta: await V.dia(-34), total: 100000, pagado: true, de: '08:00', a: '09:00' });
  for (const x of (await vieja.query('select id from public.turnos_reserva where paquete_id = $1', [iAnaV.paquete])).rows) {
    await V.valor(PV.uid, 'select public.marcar_clase($1, true)', [x.id]);
  }
  const betoV = await V.alumno('Beto', '0981700021');
  await V.inscribir(betoV, { desde: await V.dia(-40), hasta: await V.dia(-31), total: 100000, pagado: true, de: '07:00', a: '08:00' });
  await V.eliminar(PV.uid, anaV);
  await V.eliminar(PV.uid, betoV);
  const mesPasadoV = async () => {
    const pq = (await V.j('select public.reporte_alumnos($1,$2,$3) j', [PV.empresaId, await V.dia(-45), await V.dia(-25)])).paquetes;
    return [pq.terminados, pq.vencidos];
  };
  ok('sin la 120, el reporte de hace un mes: uno terminó y uno venció', await mesPasadoV(), [1, 1]);
  const ventasAntes = await V.n("select count(*)::int n from public.movimientos where estado = 'activo'");

  // La 120, escuchando lo que avisa, como se vería al aplicarla.
  const avisos = [];
  await vieja.exec(sql120, { onNotice: (x) => avisos.push(x.message) });

  ok('con la 120, el panel de hoy ya no la tiene', await V.panelHoy(), ['Matias']);
  ok('ni la vista Día', await V.agendaDel(hoyV), ['Matias']);
  ok('sus clases de hoy en adelante, canceladas', await V.deHoyEnAdelante(marV), 0);
  ok('su período pagado sigue abierto y con su venta', [(await V.paquete(iMarV.paquete)).cerrado, (await V.paquete(iMarV.paquete)).movimiento_id], [false, iMarV.movimiento]);
  ok('la clase que dio queda', (await V.reservaDel(iMarV.paquete, desdeV)).estado, 'atendida');
  ok('Matias sigue con las suyas', await V.deHoyEnAdelante(mV), 21);
  ok('el reporte de hace un mes no cambia: ningún paquete se cerró', await mesPasadoV(), [1, 1]);
  ok('ningún paquete de un eliminado se cerró', await V.n(
    `select count(*)::int n from public.paquetes p join public.clientes c on c.id = p.cliente_id
     where not c.activo and not p.cerrado`), 3);
  // Los turnos sueltos de la barbería: se les había dicho «no se cancela».
  ok('el turno del link de la barbería queda como estaba', (await ABV.uno('select estado from public.turnos_reserva where token = $1', [tokenV])).estado, 'pendiente');
  ok('y el de hoy temprano también', (await ABV.uno('select estado from public.turnos_reserva where id = $1', [hoyTempranoV])).estado, 'confirmada');
  ok('ninguna venta se tocó', await V.n("select count(*)::int n from public.movimientos where estado = 'activo'"), ventasAntes);
  const linea = (negocio, nombre) => avisos.find((m) => m.startsWith('120: ya eliminado') && m.includes(`«${negocio}» · ${nombre} ·`));
  ok('Marianela sale en la lista, con su negocio y sus 21 clases',
    / · 21 canceladas \(\d\d\/\d\d\/\d{4} 00:00 a \d\d\/\d\d\/\d{4} 00:00\)$/.test(linea('Tenis manía', 'Marianela') ?? ''), true);
  ok('el que no tenía nada por darse no se lista', Boolean(linea('Tenis manía', 'Quieto')), false);
  ok('ni los que terminaron o vencieron', [Boolean(linea('Tenis manía', 'Ana')), Boolean(linea('Tenis manía', 'Beto'))], [false, false]);
  ok('ni el de la barbería entre los cancelados', Boolean(linea('Barbería vieja', 'Toto Viejo')), false);
  ok('y el total', avisos.some((m) => m === '120: 1 alumnos ya eliminados: 21 clases canceladas.'), true);
  const sueltos = avisos.filter((m) => m.startsWith('120: turno suelto de un cliente ya eliminado, queda como estaba: «Barbería vieja» · Toto Viejo · '));
  ok('sus dos turnos sueltos se listan, sin tocarlos, con el origen y la reserva',
    [sueltos.length, sueltos.some((m) => m.includes('origen publico')), sueltos.some((m) => m.includes(`reserva ${hoyTempranoV}`))], [2, true, true]);
  ok('y cuántos son', avisos.some((m) => m.startsWith('120: 2 turnos sueltos de clientes ya eliminados quedan como estaban')), true);

  // El de hoy temprano se puede seguir cobrando desde la agenda, con la
  // comisión de Pedro (si la 120 lo cancelaba: «Esa reserva ya se cerró»).
  const cobrado = await ABV.como(BV.uid, 'select public.atender_reserva($1) j', [hoyTempranoV]);
  ok('el turno de hoy que ya pasó se cobra igual', cobrado.ok ? true : cobrado.error, true);
  // Y la clase de Marianela de hace tres días, que no se marcó, se puede
  // marcar: su período sigue abierto.
  const marcadaV = await V.como(PV.uid, 'select public.marcar_clase($1, true)', [(await V.reservaDel(iMarV.paquete, await V.dia(-3))).id]);
  ok('la clase de Marianela de hace tres días se puede marcar dada', marcadaV.ok ? true : marcadaV.error, true);

  const avisos2 = [];
  await vieja.exec(sql120, { onNotice: (x) => avisos2.push(x.message) });
  ok('aplicarla otra vez no cancela a nadie', avisos2.filter((m) => m.startsWith('120: ya eliminado') || /alumnos ya eliminados/.test(m)), []);
  ok('el turno del link sigue listado, y sigue en pie',
    [avisos2.filter((m) => m.startsWith('120: turno suelto')).length,
      (await ABV.uno('select estado from public.turnos_reserva where token = $1', [tokenV])).estado], [1, 'pendiente']);
  ok('ni cambia nada', [await V.panelHoy(), await V.deHoyEnAdelante(mV), (await V.paquete(iMarV.paquete)).cerrado], [['Matias'], 21, false]);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Permisos y copia exacta');
  // ═══════════════════════════════════════════════════════════
  const FUNCIONES = [
    ['comienzo_de_hoy(uuid)', false, false],
    ['eliminar_cliente(uuid)', false, true],
    ['lista_clientes(uuid,text,integer)', false, true],
  ];
  const permisos = [];
  for (const [f] of FUNCIONES) {
    const r = (await db.query(
      `select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') b,
              p.prosecdef, array_to_string(p.proconfig, ',') cfg
       from pg_proc p where p.oid = $1::regprocedure`, [`public.${f}`])).rows[0];
    permisos.push([f, r.a, r.b, r.prosecdef, r.cfg]);
  }
  ok('quién ejecuta qué; todas definer con su search_path',
    permisos, FUNCIONES.map(([f, a, b]) => [f, a, b, true, 'search_path=public']));

  // Copia exacta: sacando lo marcado «120», cada función es la de su última
  // versión, letra por letra.
  const sql116 = leer(`supabase/migrations/${H.migraciones().find((f) => f.startsWith('116'))}`);
  const sql053 = leer(`supabase/migrations/${H.migraciones().find((f) => f.startsWith('053'))}`);
  const funcion = (sql, nombre, fin) => {
    const i = sql.indexOf(`create or replace function public.${nombre}(`);
    return sql.slice(i, sql.indexOf(fin, i) + fin.length);
  };
  const FIN_ELIMINAR = 'grant execute on function public.eliminar_cliente(uuid) to authenticated;';
  const elim120 = funcion(sql120, 'eliminar_cliente', FIN_ELIMINAR)
    .replace(/\n\n  -- \(120\) «Si pagó[\s\S]*?(?=\n  perform set_config\('orden\.eliminando_cliente', '', true\);)/, '');
  igual('eliminar_cliente: la de la 116 más el paso marcado «120»', elim120, funcion(sql116, 'eliminar_cliente', FIN_ELIMINAR));
  // Eliminar no cierra nada: ni un UPDATE de paquetes, y la regla de la 116
  // para un cobro anulado después de eliminar queda como estaba.
  ok('la 120 no cierra ningún paquete', /update\s+public\.paquetes/i.test(sql120), false);
  ok('ni redefine anular_vuelve_por_cobrar: vale la de la 116',
    /function public\.anular_vuelve_por_cobrar\(/.test(sql120), false);
  const FIN_LISTA = 'grant execute on function public.lista_clientes(uuid, text, integer) to authenticated;';
  const lista120 = funcion(sql120, 'lista_clientes', FIN_LISTA)
    .replace(/\n  -- \(120\)\n  v_desde timestamptz;/, '')
    .replace(/\n  -- \(120\)\n  v_desde := public\.comienzo_de_hoy\(p_empresa\);/, '')
    .replace(/,\n      -- \(120\) Lo que eliminar_cliente le sacaría de la agenda\.\n      coalesce\(t\.por_venir, 0\)::int  as por_venir/, '')
    .replace(/,\n        -- \(120\)\n        count\(\*\) filter \(\n          where r\.estado in \('pendiente', 'confirmada'\) and r\.inicia >= v_desde\n        \)::int as por_venir/, '');
  igual('lista_clientes: la de la 053 más la clave marcada «120»', lista120, funcion(sql053, 'lista_clientes', FIN_LISTA));
  ok('la 120 no manda \\u en el SQL', /\\u[0-9a-fA-F]{4}/.test(sql120), false);

  const antes7 = await n('select count(*)::int n from public.turnos_reserva where estado = \'cancelada\'');
  await H.aplicarMigracion(db, '120');
  ok('la 120 se aplica dos veces: cada función existe una sola vez',
    await n(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('comienzo_de_hoy','eliminar_cliente','lista_clientes')`), 3);
  ok('y no canceló nada más', await n('select count(*)::int n from public.turnos_reserva where estado = \'cancelada\''), antes7);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · La pantalla dice la verdad antes de confirmar');
  // ═══════════════════════════════════════════════════════════
  const pantalla = leer('src/components/PantallaClientes.tsx');
  const lib = leer('src/lib/clientes.ts');
  const tipos = leer('src/lib/tipos.ts');
  const es = leer('src/i18n/textos/es.ts');
  const pt = leer('src/i18n/textos/pt.ts');
  const ent = leer('src/i18n/textos/entrenamiento.ts');
  ok('la lista trae cuántas tiene de hoy en adelante', lib.includes('por_venir: Number(c.por_venir ?? 0)') && /por_venir: number;/.test(tipos), true);
  ok('la ficha se lo pasa a la confirmación, con el rubro',
    pantalla.includes('porVenir={c.por_venir}') && pantalla.includes('deAlumnos={deAlumnos}\n            />'), true);
  ok('la confirmación lo dice: clases para un profe o un trainer, turnos para los demás',
    pantalla.includes('{porVenir > 0 && (')
      && pantalla.includes('deAlumnos ? t.clientes.eliminarClasesPorVenir(porVenir) : t.clientes.eliminarTurnosPorVenir(porVenir)'), true);
  ok('y sigue avisando lo que no se cobró', pantalla.includes('t.clientes.eliminarSinCobrar('), true);
  // Ningún texto ni pantalla dice ya que el turno no se cancela.
  const todoSrc = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = `${dir}/${e.name}`;
      if (e.isDirectory()) recorrer(r);
      else if (/\.(ts|tsx)$/.test(e.name)) todoSrc.push(leer(r));
    }
  };
  recorrer('src');
  ok('«turnoNoSeCancela» no quedó en ningún lado', todoSrc.some((x) => x.includes('turnoNoSeCancela')), false);
  ok('ni «no se cancela» / «não é cancelad» en los textos de clientes',
    [es, pt, ent].some((x) => /no se cancela\.|não é cancelad[ao]\./.test(x)), false);
  ok('en español y en portugués, los dos textos',
    [es, pt].map((x) => x.includes('eliminarTurnosPorVenir:') && x.includes('eliminarClasesPorVenir:')), [true, true]);
  ok('el profe lee clases, salgan pagadas o no',
    /eliminarClasesPorVenir:[\s\S]{0,80}'Tiene 1 clase de hoy en adelante: sale de tu agenda, esté pagada o no\.'[\s\S]{0,40}`Tiene \$\{n\} clases de hoy en adelante: salen de tu agenda, estén pagadas o no\.`/.test(es), true);
  ok('la barbería lee turnos que se cancelan',
    /`Tiene \$\{n\} turnos de hoy en adelante: se cancelan y salen de tu agenda\.`/.test(es), true);
  ok('el trainer lee sesiones, en los dos idiomas',
    /eliminarClasesPorVenir:[\s\S]{0,120}`Tiene \$\{n\} sesiones de hoy en adelante/.test(ent)
      && /eliminarClasesPorVenir:[\s\S]{0,120}`Tem \$\{n\} sessões de hoje em diante/.test(ent), true);

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE ELIMINAR Y LA AGENDA FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE ELIMINAR Y LA AGENDA PASARON`);
  process.exit(0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
