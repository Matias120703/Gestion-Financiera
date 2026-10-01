/**
 * Lo que falta cobrar se corrige (migración 116, 30/09/2026).
 *
 * El caso de Matías, rubro clases, «Tenis manía»: inscribió a Marianela en
 * la clase de tenis de los lunes y miércoles, puso que todavía no le pagó y
 * se equivocó en el monto: Gs. 8.775.000. La eliminó para volver a cargarla
 * y los Gs. 8.775.000 siguieron en «Por cobrar», al lado de los Gs. 600.000
 * de Matias: «2 alumnos te deben su período», con un solo alumno en la
 * lista. No había cómo corregir el monto.
 *
 * LO QUE SE PRUEBA (cada número es el grupo del mismo número, abajo)
 *
 *   1. El caso exacto: eliminar a Marianela la saca de Por cobrar, del panel
 *      y del reporte, y sus clases de la agenda. Si vuelve con el mismo
 *      teléfono, vuelve sin la deuda.
 *   2. Editar el monto: sube y baja, y el total, el panel y el reporte lo
 *      siguen. Los rechazos: ya cobrado, cero o negativo, quien no
 *      administra, la cuenta vencida, otra empresa.
 *   3. «No lo voy a cobrar»: sin clases se borra con su agenda; con clases
 *      se cierra y su historia queda. La ficha dice, como la tarjeta, si
 *      cada período tuvo clases.
 *   4. Eliminar a un alumno con un período cobrado y otro sin cobrar: lo
 *      cobrado queda en las ventas y los reportes; lo otro se va. Y un
 *      alumno que vuelve con el mismo teléfono no resucita la deuda anulada.
 *   5. Ninguna lectura de «debe» cuenta a un alumno archivado.
 *   6. Anular el cobro en el Historial lo vuelve a dejar por cobrar, y ahí
 *      se corrige. Si el alumno ya se eliminó, lo soltado se anula en el
 *      acto: al volver con el mismo teléfono no trae esa deuda.
 *   7. Eliminar anda siempre, también en un negocio vencido, y la marca que
 *      lo deja pasar no abre nada más.
 *   8. Permisos y search_path de cada función; la 116 aplicada dos veces no
 *      cambia nada.
 *   9. Lo que ya estaba: una base vieja (hasta la 115) con el caso de Matías
 *      ya ocurrido reproduce el error, y al aplicarle la 116 se arregla solo.
 *      Es también el control: sin la 116, Marianela sigue debiendo. Los
 *      cobros anulados antes de la 116 (el bueno cargado a mano, un doble
 *      toque, una devolución) quedan como estaban y solo se listan: la
 *      migración no inventa deudas.
 *  10. La pantalla: la tarjeta y la ficha llegan a todo esto, y la ficha
 *      abierta vuelve a leer cuando la página se refresca.
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

// El de siempre para un negocio vencido (069).
const CANDADO = 'Se te terminó la prueba';
const YA_COBRADO = 'Eso ya se cobró';
const NO_ADMIN = 'dueño o de un administrador';

// Receta de solo-lectura.test.js: la prueba termina sola, nadie toca nada.
const vencer = (db, id) => db.query(
  `update public.suscripciones
   set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
   where empresa_id = $1`, [id]);

const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];

/** Ayudantes contra una base y una empresa: los usan la base nueva y la vieja. */
function ayudantes(db, P) {
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };
  const j = async (sql, args) => (await valor(P.uid, sql, args)).j;
  const uno = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const dia = async (n) => (await uno('select (public.hoy_empresa($1) + $2::int)::text d', [P.empresaId, n])).d;
  const alumno = async (nombre, tel) => (await valor(P.uid,
    'select public.guardar_cliente($1,$2,$3,$4,$5) id', [P.empresaId, nombre, tel, '', null])).id;
  // La clase de tenis: en grupo (108), como la de Matías.
  const inscribir = async (cliente, { desde, hasta, total = null, hora = null, pagado = false, dias = [1, 3], de = '17:00', a = '18:00' }) => {
    const r = await como(P.uid,
      'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) j',
      [P.empresaId, cliente, dias, de, a, desde, hasta, hora, total, pagado, 'efectivo', null, 'Tenis', null, true]);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j;
  };
  const porCobrar = () => j('select public.por_cobrar_alumnos($1) j', [P.empresaId]);
  const panel = async () => j('select public.panel_profe($1, public.hoy_empresa($1), public.hoy_empresa($1)) j', [P.empresaId]);
  const reporte = async (desde, hasta) => j('select public.reporte_alumnos($1,$2,$3) j', [P.empresaId, desde, hasta]);
  const turnosPorVenir = async (paquete) => Number((await uno(
    `select count(*)::int n from public.turnos_reserva
     where paquete_id = $1 and estado in ('pendiente','confirmada') and inicia > now()`, [paquete])).n);
  const turnosDe = async (cliente) => Number((await uno(
    `select count(*)::int n from public.turnos_reserva
     where cliente_id = $1 and estado in ('pendiente','confirmada') and inicia > now()`, [cliente])).n);
  const paquete = (id) => uno('select * from public.paquetes where id = $1', [id]);
  return { como, valor, j, uno, dia, alumno, inscribir, porCobrar, panel, reporte, turnosPorVenir, turnosDe, paquete };
}

(async () => {
  const db = await H.crearBase();

  const P = await H.montarEmpresa(db, { email: 'tenis@mania.com', nombre: 'Tenis manía', rubro: 'clases' });
  const Otro = await H.montarEmpresa(db, { email: 'otro@academia.com', nombre: 'Otra academia', rubro: 'clases' });
  // Desde la 102 un profe prueba Básico, de una sola persona: el ayudante es
  // una silla paga (048), como la compraría él.
  await db.query('update public.suscripciones set tope_vendedores = 1 where empresa_id = $1', [P.empresaId]);
  const ayudante = await H.sumarMiembro(db, P.empresaId, 'ayudante@mania.com', 'vendedor');

  const A = ayudantes(db, P);
  const { como, valor, j, uno, dia, alumno, inscribir, porCobrar, panel, reporte, turnosPorVenir, turnosDe, paquete } = A;
  const hoy = await dia(0);
  const cambiar = (uid, paq, monto) => como(uid, 'select public.cambiar_precio_paquete($1,$2) j', [paq, monto]);
  const noCobrar = (uid, paq) => como(uid, 'select public.anular_por_cobrar($1) j', [paq]);
  const eliminar = (uid, cliente) => como(uid, 'select public.eliminar_cliente($1) r', [cliente]);

  // Un período que empieza la semana que viene: todas sus clases están por venir.
  const desde = await dia(7);
  const hasta = await dia(37);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · El caso de Matías');
  // ═══════════════════════════════════════════════════════════
  const matias = await alumno('Matias', '0981600000');
  const marianela = await alumno('Marianela', '0982877500');
  const iMatias = await inscribir(matias, { desde, hasta, total: 600000 });
  const iMarianela = await inscribir(marianela, { desde, hasta, total: 8775000 });

  let pc = await porCobrar();
  ok('por cobrar: Gs. 9.375.000, como en su captura', Number(pc.total), 9375000);
  ok('dos alumnos te deben su período', [...new Set(pc.lista.map((x) => x.alumno))].sort(), ['Marianela', 'Matias']);
  ok('ninguno tuvo clases todavía', pc.lista.map((x) => x.tuvo_clases), [false, false]);
  ok('Marianela tiene sus clases en la agenda', (await turnosPorVenir(iMarianela.paquete)) > 0, true);

  const quitada = await eliminar(P.uid, marianela);
  ok('eliminarla anda', quitada.ok ? true : quitada.error, true);
  // Su único rastro era la inscripción mal anotada: anulada, no le queda
  // nada atado y se borra de verdad.
  ok('y sin nada que conservar, se borra de verdad', quitada.valor?.rows[0].r, 'borrado');

  pc = await porCobrar();
  ok('Por cobrar ya no la tiene: Gs. 600.000', Number(pc.total), 600000);
  ok('un alumno te debe su período', pc.lista.map((x) => x.alumno), ['Matias']);
  const pa = await panel();
  ok('el panel dice lo mismo: Gs. 600.000 y un alumno', [Number(pa.por_cobrar), pa.deben], [600000, 1]);
  ok('el reporte también', Number((await reporte(hoy, hoy)).por_cobrar), 600000);
  ok('su inscripción ya no existe', await paquete(iMarianela.paquete), undefined);
  ok('ni sus clases en la agenda', Number((await uno(
    'select count(*)::int n from public.turnos_reserva where paquete_id = $1', [iMarianela.paquete])).n), 0);
  ok('la agenda de un lunes de clase solo tiene a Matias', (await j(
    'select public.agenda_del_dia($1, $2) j', [P.empresaId, (await uno(
      `select (inicia at time zone 'America/Asuncion')::date::text d from public.turnos_reserva
       where paquete_id = $1 order by inicia limit 1`, [iMatias.paquete])).d])).map((x) => x.cliente), ['Matias']);

  // Matías la vuelve a cargar, con el mismo teléfono y el monto bien.
  const marianela2 = await alumno('Marianela', '0982877500');
  ok('vuelve con el mismo teléfono y sin deuda', Number((await porCobrar()).total), 600000);
  ok('y sin inscripciones viejas', (await j('select public.paquetes_del_alumno($1,$2) j', [P.empresaId, marianela2])).length, 0);
  await inscribir(marianela2, { desde, hasta, total: 877500 });
  ok('la inscribe con el monto bien', Number((await porCobrar()).total), 1477500);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Editar el monto');
  // ═══════════════════════════════════════════════════════════
  const sube = await cambiar(P.uid, iMatias.paquete, 650000);
  // jsonb ordena las claves por largo y después por letra.
  ok('se corrige para arriba', sube.ok ? sube.valor.rows[0].j : sube.error,
    { antes: 600000, monto: 650000, paquete: iMatias.paquete });
  ok('el total lo sigue', Number((await porCobrar()).total), 1527500);
  ok('y el panel', Number((await panel()).por_cobrar), 1527500);
  ok('y el reporte', Number((await reporte(hoy, hoy)).por_cobrar), 1527500);
  ok('y la ficha del alumno', Number((await j('select public.paquetes_del_alumno($1,$2) j',
    [P.empresaId, matias])).find((x) => x.id === iMatias.paquete).precio), 650000);
  ok('se corrige para abajo', (await cambiar(P.uid, iMatias.paquete, 500000)).ok, true);
  ok('el total baja', Number((await porCobrar()).total), 1377500);
  ok('el panel también', Number((await panel()).por_cobrar), 1377500);
  ok('sigue siendo una deuda, no una venta: no se creó ningún movimiento',
    Number((await uno('select count(*)::int n from public.movimientos where empresa_id = $1', [P.empresaId])).n), 0);

  // Inscripta por hora: el total corregido ya no es horas × precio por hora.
  const ana = await alumno('Ana', '0983000001');
  const iAna = await inscribir(ana, { desde, hasta, hora: 50000, dias: [5], de: '08:00', a: '09:00' });
  ok('por hora guarda su precio por hora', Number((await paquete(iAna.paquete)).precio_hora), 50000);
  await cambiar(P.uid, iAna.paquete, 180000);
  const anaDespues = await paquete(iAna.paquete);
  ok('al corregir el total, el precio queda cerrado', [Number(anaDespues.precio), anaDespues.precio_hora], [180000, null]);

  // La moneda manda los decimales, como el campo de la pantalla.
  await cambiar(P.uid, iAna.paquete, 180000.4);
  ok('en guaraníes, sin centavos', Number((await paquete(iAna.paquete)).precio), 180000);
  const D = await H.montarEmpresa(db, { email: 'tennis@usd.com', nombre: 'Tennis USD', rubro: 'clases', moneda: 'USD' });
  const AD = ayudantes(db, D);
  const iUsd = await AD.inscribir(await AD.alumno('Bob', '0984000001'), { desde, hasta, total: 120 });
  await H.intentar(db, D.uid, () => db.query('select public.cambiar_precio_paquete($1,$2)', [iUsd.paquete, 99.456]));
  ok('en dólares, con dos decimales', Number((await AD.paquete(iUsd.paquete)).precio), 99.46);

  rechazado('cero no', await cambiar(P.uid, iMatias.paquete, 0), 'mayor que cero');
  rechazado('negativo tampoco', await cambiar(P.uid, iMatias.paquete, -1000), 'mayor que cero');
  rechazado('ni vacío', await cambiar(P.uid, iMatias.paquete, null), 'mayor que cero');
  rechazado('ni centavos de guaraní que redondean a cero', await cambiar(P.uid, iMatias.paquete, 0.4), 'mayor que cero');
  rechazado('ni un monto que no entraría en una venta', await cambiar(P.uid, iMatias.paquete, 1e12), 'demasiado grande');
  rechazado('el ayudante no lo corrige: es del dueño o un administrador',
    await cambiar(ayudante, iMatias.paquete, 1000), NO_ADMIN);
  rechazado('otra academia no lo toca', await cambiar(Otro.uid, iMatias.paquete, 1000), 'pertenecés');
  rechazado('uno que no existe', await cambiar(P.uid, '00000000-0000-0000-0000-000000000000', 1000), 'no existe');
  const regalo = (await valor(P.uid, "select public.vender_paquete($1,$2,'Clase de prueba',1,0,'efectivo',null,null) j",
    [P.empresaId, ana])).j.paquete;
  rechazado('a un paquete de regalo no se le inventa una deuda', await cambiar(P.uid, regalo, 50000), 'nada que cobrar');
  ok('nada de eso cambió el monto', Number((await paquete(iMatias.paquete)).precio), 500000);

  // Ya cobrado: la plata entró y está en el Historial.
  const bea = await alumno('Bea', '0983000002');
  const iBea = await inscribir(bea, { desde, hasta, total: 300000 });
  ok('se cobra', (await como(P.uid, "select public.cobrar_inscripcion($1,'efectivo') j", [iBea.paquete])).ok, true);
  rechazado('lo cobrado no se edita acá: se anula el cobro en el Historial',
    await cambiar(P.uid, iBea.paquete, 200000), `${YA_COBRADO}.*Historial`);

  // Cerrado: primero se reabre.
  const ciro = await alumno('Ciro', '0983000003');
  const iCiro = await inscribir(ciro, { desde, hasta, total: 300000 });
  await como(P.uid, 'select public.cerrar_paquete($1, true)', [iCiro.paquete]);
  rechazado('uno cerrado no se corrige', await cambiar(P.uid, iCiro.paquete, 200000), 'está cerrado');

  // La cuenta vencida: el UPDATE lo frena el candado de paquetes (111).
  const V = await H.montarEmpresa(db, { email: 'vencido@tenis.com', nombre: 'Tenis vencido', rubro: 'clases' });
  const AV = ayudantes(db, V);
  const iVencido = await AV.inscribir(await AV.alumno('Dora', '0985000001'), { desde, hasta, total: 400000 });
  await vencer(db, V.empresaId);
  rechazado('con la cuenta vencida no se corrige', await H.intentar(db, V.uid, () =>
    db.query('select public.cambiar_precio_paquete($1,$2)', [iVencido.paquete, 100000])), CANDADO);
  ok('y el monto quedó como estaba', Number((await AV.paquete(iVencido.paquete)).precio), 400000);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · No lo voy a cobrar');
  // ═══════════════════════════════════════════════════════════
  // Sin clases: lo anotado por error se borra con su agenda.
  const eli = await alumno('Eli', '0983000004');
  const iEli = await inscribir(eli, { desde, hasta, total: 250000 });
  const sinClases = await noCobrar(P.uid, iEli.paquete);
  ok('sin clases, se borra', sinClases.ok ? sinClases.valor.rows[0].j : sinClases.error, { monto: 250000, resultado: 'borrado' });
  ok('ya no está en Por cobrar', (await porCobrar()).lista.some((x) => x.paquete === iEli.paquete), false);
  ok('ni existe', await paquete(iEli.paquete), undefined);
  ok('ni sus clases en la agenda', await turnosDe(eli), 0);
  ok('la alumna sigue en la lista', (await uno('select activo from public.clientes where id = $1', [eli])).activo, true);

  // Con clases: tuvo su primera semana, no pagó y no va a pagar.
  const fio = await alumno('Fio', '0983000005');
  const iFio = await inscribir(fio, { desde: await dia(-14), hasta: await dia(14), total: 400000, dias: TODOS_LOS_DIAS, de: '07:00', a: '08:00' });
  const primera = (await uno('select id from public.turnos_reserva where paquete_id = $1 order by inicia limit 1', [iFio.paquete])).id;
  ok('su primera clase se marca dada', (await como(P.uid, 'select public.marcar_clase($1, true)', [primera])).ok, true);
  ok('Por cobrar sabe que ya tuvo clases',
    (await porCobrar()).lista.find((x) => x.paquete === iFio.paquete).tuvo_clases, true);
  // La ficha tiene su propio «Editar» y avisa lo mismo: la misma respuesta.
  const fichaDe = async (cliente, paq) => (await j('select public.paquetes_del_alumno($1,$2) j',
    [P.empresaId, cliente])).find((x) => x.id === paq);
  ok('la ficha dice lo mismo, período por período',
    [(await fichaDe(fio, iFio.paquete)).tuvo_clases, (await fichaDe(matias, iMatias.paquete)).tuvo_clases], [true, false]);
  const futurasAntes = await turnosPorVenir(iFio.paquete);
  ok('tiene clases por venir', futurasAntes > 0, true);
  const conClases = await noCobrar(P.uid, iFio.paquete);
  ok('con clases, se cierra', conClases.ok ? conClases.valor.rows[0].j.resultado : conClases.error, 'cerrado');
  ok('ya no está en Por cobrar', (await porCobrar()).lista.some((x) => x.paquete === iFio.paquete), false);
  ok('sus clases por venir salen de la agenda', await turnosPorVenir(iFio.paquete), 0);
  ok('la clase que se dio queda, como historia', (await uno(
    "select estado from public.turnos_reserva where id = $1", [primera])).estado, 'atendida');
  const fichaFio = (await j('select public.paquetes_del_alumno($1,$2) j', [P.empresaId, fio]))[0];
  ok('su ficha la muestra cerrada, sin cobrar y con su clase',
    [fichaFio.estado, fichaFio.pagado, fichaFio.historia.length], ['cerrado', false, 1]);
  // Reabrirla es decir que sí se va a cobrar: vuelve a Por cobrar.
  await como(P.uid, 'select public.cerrar_paquete($1, false)', [iFio.paquete]);
  ok('reabrirla la vuelve a poner por cobrar',
    (await porCobrar()).lista.some((x) => x.paquete === iFio.paquete), true);
  await noCobrar(P.uid, iFio.paquete);

  rechazado('el ayudante no la saca', await noCobrar(ayudante, iMatias.paquete), NO_ADMIN);
  rechazado('otra academia tampoco', await noCobrar(Otro.uid, iMatias.paquete), 'pertenecés');
  rechazado('lo cobrado no se saca acá', await noCobrar(P.uid, iBea.paquete), YA_COBRADO);
  rechazado('lo cerrado ya no está por cobrar', await noCobrar(P.uid, iCiro.paquete), 'está cerrado');
  rechazado('un regalo no tiene nada que cobrar', await noCobrar(P.uid, regalo), 'nada que cobrar');
  ok('Matias sigue debiendo lo suyo', (await porCobrar()).lista.some((x) => x.paquete === iMatias.paquete), true);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Eliminar a un alumno con un período cobrado y otro sin cobrar');
  // ═══════════════════════════════════════════════════════════
  const ventasHoy = async () => Number((await j(
    'select public.resumen_financiero($1, public.hoy_empresa($1), public.hoy_empresa($1)) j', [P.empresaId])).ventas);
  const diego = await alumno('Diego', '0983000006');
  const iPagado = await inscribir(diego, { desde: await dia(-14), hasta: await dia(14), total: 350000, pagado: true, dias: [2], de: '10:00', a: '11:00' });
  const iDebe = await inscribir(diego, { desde: await dia(20), hasta: await dia(50), total: 350000, dias: [2], de: '10:00', a: '11:00' });
  const vendidoAntes = await ventasHoy();
  ok('debe el segundo período', (await porCobrar()).lista.some((x) => x.paquete === iDebe.paquete), true);

  const sinDiego = await eliminar(P.uid, diego);
  ok('se elimina: con un cobro, se archiva', sinDiego.ok ? sinDiego.valor.rows[0].r : sinDiego.error, 'archivado');
  ok('lo no cobrado se va', await paquete(iDebe.paquete), undefined);
  ok('con sus clases de la agenda', await turnosPorVenir(iDebe.paquete), 0);
  ok('ya no figura en Por cobrar', (await porCobrar()).lista.some((x) => x.cliente_id === diego), false);
  const pagado = await paquete(iPagado.paquete);
  ok('lo cobrado queda: el período con su venta', pagado.movimiento_id, iPagado.movimiento);
  ok('la venta sigue activa', (await uno('select estado from public.movimientos where id = $1', [iPagado.movimiento])).estado, 'activo');
  ok('y sigue sumando en lo vendido de hoy', await ventasHoy(), vendidoAntes);
  const rep = await reporte(hoy, hoy);
  const filaDiego = rep.alumnos.find((x) => x.cliente_id === diego);
  ok('en el reporte, lo cobrado de Diego sigue: es historia', Number(filaDiego?.cobrado), 350000);
  ok('pero no debe nada', Number(filaDiego?.debe), 0);
  ok('y cuenta en lo cobrado por paquete', rep.por_paquete.some((x) => Number(x.cobrado) >= 350000), true);

  // Con clases dadas y sin cobrar: se cierra, y su clase queda en la historia.
  const elena = await alumno('Elena', '0983000007');
  const iElena = await inscribir(elena, { desde: await dia(-14), hasta: await dia(14), total: 420000, dias: TODOS_LOS_DIAS, de: '12:00', a: '13:00' });
  const claseElena = (await uno('select id from public.turnos_reserva where paquete_id = $1 order by inicia limit 1', [iElena.paquete])).id;
  await como(P.uid, 'select public.marcar_clase($1, true)', [claseElena]);
  const fechaClase = (await uno('select fecha::text f from public.clases_dadas where paquete_id = $1', [iElena.paquete])).f;
  const clasesAntes = Number((await reporte(fechaClase, fechaClase)).clases_dadas);
  ok('se archiva', (await eliminar(P.uid, elena)).valor?.rows[0].r, 'archivado');
  ok('su período queda cerrado, sin cobrar', [(await paquete(iElena.paquete)).cerrado, (await paquete(iElena.paquete)).movimiento_id], [true, null]);
  ok('sin clases por venir en la agenda', await turnosDe(elena), 0);
  ok('la clase que dio sigue en el reporte de ese día', Number((await reporte(fechaClase, fechaClase)).clases_dadas), clasesAntes);
  ok('y no debe nada', (await porCobrar()).lista.some((x) => x.cliente_id === elena), false);

  // Vuelven con el mismo teléfono: la ficha se reactiva, la deuda no.
  ok('Diego vuelve con su misma ficha', await alumno('Diego', '0983000006'), diego);
  ok('Elena también', await alumno('Elena', '0983000007'), elena);
  pc = await porCobrar();
  ok('y ninguno de los dos resucita una deuda', pc.lista.some((x) => [diego, elena].includes(x.cliente_id)), false);
  ok('Diego vuelve con su período pagado', (await j('select public.paquetes_del_alumno($1,$2) j',
    [P.empresaId, diego])).map((x) => [x.id, x.pagado]), [[iPagado.paquete, true]]);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Un alumno archivado no te debe');
  // ═══════════════════════════════════════════════════════════
  // Las lecturas se cuidan solas, aunque la deuda siguiera ahí: se arma a
  // mano, sin pasar por eliminar_cliente (que ya la anula).
  // Nueve días: cae al menos un jueves, y vence dentro de la semana, así que
  // es de «a quién llamar».
  const gus = await alumno('Gus', '0983000008');
  const iGus = await inscribir(gus, { desde: await dia(-3), hasta: await dia(5), total: 1000000, dias: [4], de: '15:00', a: '16:00' });
  const conGus = { pc: Number((await porCobrar()).total), pa: await panel(), rep: await reporte(hoy, hoy) };
  ok('con Gus en la lista, el reporte lo tiene para llamar', conGus.rep.por_terminar.some((x) => x.cliente_id === gus), true);
  await db.query('update public.clientes set activo = false where id = $1', [gus]);
  ok('Por cobrar no lo cuenta', Number((await porCobrar()).total), conGus.pc - 1000000);
  const paSin = await panel();
  ok('el panel no lo cuenta: ni lo que debe, ni como alguien que debe, ni como activo',
    [Number(paSin.por_cobrar), paSin.deben, paSin.alumnos_activos],
    [Number(conGus.pa.por_cobrar) - 1000000, conGus.pa.deben - 1, conGus.pa.alumnos_activos - 1]);
  const repSin = await reporte(hoy, hoy);
  ok('el reporte no lo cuenta en lo que te deben', Number(repSin.por_cobrar), Number(conGus.rep.por_cobrar) - 1000000);
  ok('ni en los activos', repSin.activos, conGus.rep.activos - 1);
  ok('ni en «a quién llamar»', repSin.por_terminar.some((x) => x.cliente_id === gus), false);
  ok('ni le pone un debe en su fila', repSin.alumnos.some((x) => x.cliente_id === gus && Number(x.debe) > 0), false);
  ok('el reporte sigue cerrando: lo que deben es por cobrar + fiado',
    repSin.alumnos.reduce((s, x) => s + Number(x.debe), 0), Number(repSin.por_cobrar) + Number(repSin.fiado_pendiente));
  await db.query('update public.clientes set activo = true where id = $1', [gus]);
  ok('vuelto a la lista, vuelve a deber', Number((await porCobrar()).total), conGus.pc);
  await noCobrar(P.uid, iGus.paquete);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Anular el cobro lo vuelve a dejar por cobrar');
  // ═══════════════════════════════════════════════════════════
  // Bea pagó Gs. 300.000, pero eran Gs. 280.000.
  const movBea = (await paquete(iBea.paquete)).movimiento_id;
  ok('anular su cobro en el Historial', (await como(P.uid, "select public.anular_movimiento($1,'Monto mal')", [movBea])).ok, true);
  ok('la inscripción vuelve a quedar sin cobrar', (await paquete(iBea.paquete)).movimiento_id, null);
  ok('y aparece en Por cobrar', (await porCobrar()).lista.some((x) => x.paquete === iBea.paquete), true);
  ok('ahí se corrige', (await cambiar(P.uid, iBea.paquete, 280000)).ok, true);
  const cobroBien = await como(P.uid, "select public.cobrar_inscripcion($1,'efectivo') j", [iBea.paquete]);
  ok('y se cobra lo que era', cobroBien.ok ? Number(cobroBien.valor.rows[0].j.monto) : cobroBien.error, 280000);
  ok('la venta anulada sigue anulada, en el Historial', (await uno(
    'select estado from public.movimientos where id = $1', [movBea])).estado, 'anulado');

  // Ya eliminado, se le devuelve la plata. Lo soltado no puede quedar
  // abierto a nombre de un archivado: ninguna pantalla llega a sacarlo, y
  // volvería con él. Se anula en el acto, como al eliminarlo.
  const zoe = await alumno('Zoe', '0983000010');
  const iZoe = await inscribir(zoe, { desde, hasta, total: 350000, pagado: true, dias: [1], de: '19:00', a: '20:00' });
  ok('Zoe pagó; al eliminarla, con un cobro, se archiva', (await eliminar(P.uid, zoe)).valor?.rows[0].r, 'archivado');
  ok('su período pagado sigue en la agenda, como siempre', (await turnosPorVenir(iZoe.paquete)) > 0, true);
  ok('se le devuelve la plata: se anula su cobro',
    (await como(P.uid, "select public.anular_movimiento($1,'Devolución')", [iZoe.movimiento])).ok, true);
  ok('sin clases, su período se borra', await paquete(iZoe.paquete), undefined);
  ok('con sus clases de la agenda', await turnosDe(zoe), 0);
  ok('la venta anulada queda en el Historial', (await uno(
    'select estado from public.movimientos where id = $1', [iZoe.movimiento])).estado, 'anulado');
  ok('Zoe vuelve con el mismo teléfono', await alumno('Zoe', '0983000010'), zoe);
  ok('y no trae la deuda de un período ya devuelto',
    (await porCobrar()).lista.some((x) => x.cliente_id === zoe), false);
  ok('ni ese período en su ficha', (await j('select public.paquetes_del_alumno($1,$2) j', [P.empresaId, zoe])).length, 0);

  // Con clases dadas: se cierra, y lo que dio queda.
  const yago = await alumno('Yago', '0983000011');
  const iYago = await inscribir(yago, {
    desde: await dia(-14), hasta: await dia(14), total: 420000, pagado: true, dias: TODOS_LOS_DIAS, de: '20:00', a: '21:00' });
  const claseYago = (await uno('select id from public.turnos_reserva where paquete_id = $1 order by inicia limit 1', [iYago.paquete])).id;
  await como(P.uid, 'select public.marcar_clase($1, true)', [claseYago]);
  ok('Yago, con clases y pagado, se elimina: se archiva', (await eliminar(P.uid, yago)).valor?.rows[0].r, 'archivado');
  ok('se anula su cobro', (await como(P.uid, "select public.anular_movimiento($1,'Devolución')", [iYago.movimiento])).ok, true);
  const pYago = await paquete(iYago.paquete);
  ok('con clases, su período queda cerrado y sin cobrar', [pYago?.cerrado, pYago?.movimiento_id], [true, null]);
  ok('sin clases por venir en la agenda', await turnosPorVenir(iYago.paquete), 0);
  ok('la clase que dio queda', (await uno('select estado from public.turnos_reserva where id = $1', [claseYago])).estado, 'atendida');
  await alumno('Yago', '0983000011');
  ok('vuelve y tampoco trae deuda', (await porCobrar()).lista.some((x) => x.cliente_id === yago), false);
  // Al de la lista, en cambio, solo se le suelta: vuelve a Por cobrar (Bea).

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Eliminar anda siempre, también vencido');
  // ═══════════════════════════════════════════════════════════
  const W = await H.montarEmpresa(db, { email: 'vencida@tenis.com', nombre: 'Tenis que no pagó', rubro: 'clases' });
  const AW = ayudantes(db, W);
  const hugo = await AW.alumno('Hugo', '0986000001');
  const iHugo = await AW.inscribir(hugo, { desde: await dia(-14), hasta: await dia(14), total: 500000, dias: TODOS_LOS_DIAS, de: '06:00', a: '07:00' });
  const claseHugo = (await AW.uno('select id from public.turnos_reserva where paquete_id = $1 order by inicia limit 1', [iHugo.paquete])).id;
  await AW.como(W.uid, 'select public.marcar_clase($1, true)', [claseHugo]);
  const ines = await AW.alumno('Inés', '0986000002');
  const iInes = await AW.inscribir(ines, { desde, hasta, total: 500000, dias: [6], de: '06:00', a: '07:00' });
  const jose = await AW.alumno('José', '0986000003');
  const iJose = await AW.inscribir(jose, { desde, hasta, total: 500000, dias: [0], de: '06:00', a: '07:00' });
  await vencer(db, W.empresaId);
  rechazado('vencido, «No lo voy a cobrar» no cierra uno con clases (cerrar tiene candado, 111)',
    await AW.como(W.uid, 'select public.anular_por_cobrar($1)', [iHugo.paquete]), CANDADO);
  ok('pero sí borra lo anotado por error: borrar no tiene candado (111)',
    (await AW.como(W.uid, 'select public.anular_por_cobrar($1) j', [iInes.paquete])).valor?.rows[0].j.resultado, 'borrado');
  // Eliminar, con la marca puesta y apagada en la misma transacción.
  const conMarca = await H.intentar(db, W.uid, async () => {
    const r = (await db.query('select public.eliminar_cliente($1) r', [hugo])).rows[0].r;
    const marca = (await db.query("select coalesce(current_setting('orden.eliminando_cliente', true), '') m")).rows[0].m;
    return { r, marca };
  });
  ok('vencido, eliminar a Hugo anda', conMarca.ok ? conMarca.valor.r : conMarca.error, 'archivado');
  ok('y apaga la marca antes de volver', conMarca.valor?.marca, '');
  ok('su período queda cerrado', (await AW.paquete(iHugo.paquete)).cerrado, true);
  ok('sus clases por venir salen de la agenda', await AW.turnosPorVenir(iHugo.paquete), 0);

  // La marca no abre nada más: con ella puesta, se intenta cerrar el período
  // de OTRO alumno, o cambiarle el precio al de Hugo, como lo haría una
  // función con la sesión del dueño vencido.
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
  rechazado('con la marca de Hugo no se cierra el período de José',
    await conMarcaDe(hugo, 'update public.paquetes set cerrado = true where id = $1', [iJose.paquete]), CANDADO);
  rechazado('ni se cancelan las clases de José',
    await conMarcaDe(hugo, "update public.turnos_reserva set estado = 'cancelada' where paquete_id = $1", [iJose.paquete]), CANDADO);
  rechazado('ni con la de José se le cambia el precio',
    await conMarcaDe(jose, 'update public.paquetes set precio = 1 where id = $1', [iJose.paquete]), CANDADO);
  rechazado('ni se reabre lo cerrado',
    await conMarcaDe(hugo, 'update public.paquetes set cerrado = false where id = $1', [iHugo.paquete]), CANDADO);
  ok('la única función que pone la marca es eliminar_cliente',
    (await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace
       and prosrc ~ 'set_config\\(\\s*''orden\\.eliminando_cliente''' order by 1`)).rows.map((x) => x.proname), ['eliminar_cliente']);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Permisos de las funciones nuevas');
  // ═══════════════════════════════════════════════════════════
  const FUNCIONES = [
    ['cambiar_precio_paquete(uuid,numeric)', false, true],
    ['anular_por_cobrar(uuid)', false, true],
    ['anular_periodo(uuid)', false, false],
    ['periodo_con_clases(uuid)', false, false],
    ['anular_vuelve_por_cobrar()', false, false],
    ['eliminar_cliente(uuid)', false, true],
    ['por_cobrar_alumnos(uuid)', false, true],
    ['paquetes_del_alumno(uuid,uuid)', false, true],
    ['panel_profe(uuid,date,date)', false, true],
    ['reporte_alumnos(uuid,date,date)', false, true],
    ['exigir_cuenta_activa()', false, false],
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
  const debidoAntes = Number((await porCobrar()).total);
  const paquetesAntes = Number((await uno('select count(*)::int n from public.paquetes')).n);
  await H.aplicarMigracion(db, '116');
  ok('la 116 se aplica dos veces: cada función y el trigger existen una sola vez', [
    Number((await uno(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('cambiar_precio_paquete','anular_por_cobrar','anular_periodo','periodo_con_clases',
                      'anular_vuelve_por_cobrar','eliminar_cliente','por_cobrar_alumnos','panel_profe',
                      'reporte_alumnos','exigir_cuenta_activa','paquetes_del_alumno')`)).n),
    Number((await uno("select count(*)::int n from pg_trigger where tgname = 'anular_vuelve_por_cobrar'")).n),
  ], [11, 1]);
  ok('y aplicarla otra vez no tocó lo que se debe ni borró nada',
    [Number((await porCobrar()).total), Number((await uno('select count(*)::int n from public.paquetes')).n)],
    [debidoAntes, paquetesAntes]);

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Lo que ya estaba: una base de antes de la 116');
  // ═══════════════════════════════════════════════════════════
  // Es el control: con la 115, el error de Matías se reproduce tal cual. Y
  // al aplicarle la 116, se arregla solo.
  const vieja = await H.crearBase({ hasta: '115' });
  const PV = await H.montarEmpresa(vieja, { email: 'tenis@vieja.com', nombre: 'Tenis manía', rubro: 'clases' });
  const V2 = ayudantes(vieja, PV);
  const mV = await V2.alumno('Matias', '0981600000');
  const marV = await V2.alumno('Marianela', '0982877500');
  const desdeV = await V2.dia(7);
  const hastaV = await V2.dia(37);
  await V2.inscribir(mV, { desde: desdeV, hasta: hastaV, total: 600000 });
  const iMarV = await V2.inscribir(marV, { desde: desdeV, hasta: hastaV, total: 8775000 });
  // Cobros anulados antes de la 116. Con la 115 la inscripción quedaba
  // apuntando a su venta anulada, y volver a cobrarla decía «ya está
  // cobrada». Cada uno ya estaba resuelto de otra forma:
  //   · Nico: el cobro se anuló porque estaba mal, y nada más.
  //   · Beto: se anotó Gs. 3.000.000 en vez de 300.000; se anuló, y el cobro
  //     bueno se cargó a mano como una venta suelta.
  //   · Ana: un doble toque vendió dos veces el mismo paquete; la de más se
  //     anuló.
  //   · Carla: su período terminó hace diez días y se le devolvió la plata.
  const nico = await V2.alumno('Nico', '0981700000');
  const iNico = await V2.inscribir(nico, { desde: desdeV, hasta: hastaV, total: 200000, pagado: true, dias: [5], de: '09:00', a: '10:00' });
  await V2.valor(PV.uid, "select public.anular_movimiento($1,'Mal cobrado')", [iNico.movimiento]);
  const beto = await V2.alumno('Beto', '0981700001');
  const iBeto = await V2.inscribir(beto, {
    desde: await V2.dia(-10), hasta: await V2.dia(20), total: 3000000, pagado: true, dias: [4], de: '11:00', a: '12:00' });
  await V2.valor(PV.uid, "select public.anular_movimiento($1,'Monto mal')", [iBeto.movimiento]);
  const reintento = await V2.como(PV.uid, "select public.cobrar_inscripcion($1,'efectivo')", [iBeto.paquete]);
  ok('con la 115, volver a cobrarla decía «ya está cobrada»', reintento.ok ? 'se cobró' : /ya está cobrada/.test(reintento.error), true);
  await V2.valor(PV.uid,
    "select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'efectivo', p_cliente => $3) id",
    [PV.empresaId, JSON.stringify([{ nombre: 'Clases de Beto', cantidad: 1, precio_unitario: 300000 }]), beto]);
  const anaV = await V2.alumno('Ana', '0981700002');
  await V2.valor(PV.uid, "select public.vender_paquete($1,$2,'8 clases',8,400000,'efectivo',null,null) j", [PV.empresaId, anaV]);
  const doble = (await V2.valor(PV.uid, "select public.vender_paquete($1,$2,'8 clases',8,400000,'efectivo',null,null) j",
    [PV.empresaId, anaV])).j;
  await V2.valor(PV.uid, "select public.anular_movimiento($1,'Doble toque')", [doble.movimiento]);
  const carla = await V2.alumno('Carla', '0981700003');
  const iCarla = await V2.inscribir(carla, {
    desde: await V2.dia(-40), hasta: await V2.dia(-10), total: 300000, pagado: true, dias: [6], de: '12:00', a: '13:00' });
  await V2.valor(PV.uid, "select public.anular_movimiento($1,'Devolución')", [iCarla.movimiento]);
  const anulados = [[iNico.paquete, iNico.movimiento], [iBeto.paquete, iBeto.movimiento],
    [doble.paquete, doble.movimiento], [iCarla.paquete, iCarla.movimiento]];
  const apuntan = async () => {
    const r = [];
    for (const [paq] of anulados) r.push((await V2.paquete(paq)).movimiento_id);
    return r;
  };

  ok('sin la 116, eliminar a Marianela la archiva', (await V2.valor(PV.uid, 'select public.eliminar_cliente($1) r', [marV])).r, 'archivado');
  const antes = await V2.porCobrar();
  ok('y sus Gs. 8.775.000 siguen en Por cobrar: el error de la captura', Number(antes.total), 9375000);
  ok('«2 alumnos te deben su período»', new Set(antes.lista.map((x) => x.cliente_id)).size, 2);
  ok('con sus clases en la agenda', (await V2.turnosPorVenir(iMarV.paquete)) > 0, true);
  ok('los cobros anulados figuraban pagados, apuntando a su venta anulada', await apuntan(), anulados.map(([, m]) => m));
  ok('sin la 116 no hay cómo corregir el monto',
    (await V2.como(PV.uid, 'select public.cambiar_precio_paquete($1,$2)', [iMarV.paquete, 877500])).ok, false);
  const reporteAntes = await V2.reporte(await V2.dia(-60), await V2.dia(0));

  // La 116, escuchando lo que avisa, como se vería al aplicarla.
  const avisos = [];
  const sql116 = require('fs').readFileSync(
    `supabase/migrations/${H.migraciones().find((f) => f.startsWith('116'))}`, 'utf8');
  await vieja.exec(sql116, { onNotice: (n) => avisos.push(n.message) });

  const despues = await V2.porCobrar();
  ok('con la 116, Por cobrar ya no la tiene: solo Matias, Gs. 600.000',
    [Number(despues.total), despues.lista.map((x) => x.alumno)], [600000, ['Matias']]);
  ok('su inscripción se anuló', await V2.paquete(iMarV.paquete), undefined);
  ok('y sus clases salieron de la agenda', await V2.turnosDe(marV), 0);
  ok('el panel también: un alumno menos', [Number((await V2.panel()).por_cobrar), (await V2.panel()).deben], [600000, 1]);
  // La migración no inventa deudas: lo que ya estaba resuelto sigue así.
  ok('los cobros anulados de antes quedan como estaban', await apuntan(), anulados.map(([, m]) => m));
  ok('nadie pasa a deber: ni Beto los 3.000.000 mal anotados, ni Ana el doble toque, ni Carla lo devuelto',
    despues.lista.some((x) => [nico, beto, anaV, carla].includes(x.cliente_id)), false);
  const reporteDespues = await V2.reporte(await V2.dia(-60), await V2.dia(0));
  ok('el reporte: lo cobrado no cambia y lo que deben baja solo lo de Marianela',
    [Number(reporteDespues.cobrado), Number(reporteDespues.por_cobrar)],
    [Number(reporteAntes.cobrado), Number(reporteAntes.por_cobrar) - 8775000]);
  ok('y cada uno se lista, con su negocio, su alumno y su monto, para decidir',
    ['Nico', 'Beto', 'Ana', 'Carla'].map((a) => avisos.some((m) => m.includes('cobro anulado antes de hoy')
      && m.includes('«Tenis manía»') && m.includes(` ${a} `))), [true, true, true, true]);
  ok('el de Beto dice su monto', avisos.some((m) => m.includes(' Beto ') && m.includes('3000000')), true);
  ok('lo anulado de Marianela también se lista', avisos.some((m) => m.includes('alumno ya eliminado') && m.includes('Marianela')
    && m.includes('borrado')), true);

  // Si alguno de la lista de verdad se debe, se suelta a mano con la línea
  // del bloque 11, y queda en Por cobrar para corregirlo o cobrarlo.
  await vieja.query('update public.paquetes set movimiento_id = null where id = $1', [iNico.paquete]);
  ok('soltado a mano, Nico aparece en Por cobrar', (await V2.porCobrar()).lista.map((x) => x.alumno).sort(), ['Matias', 'Nico']);
  ok('y se le corrige el monto', (await V2.como(PV.uid, 'select public.cambiar_precio_paquete($1,$2)', [iNico.paquete, 180000])).ok, true);

  ok('si Matías la vuelve a cargar con el mismo teléfono, es su ficha', await V2.alumno('Marianela', '0982877500'), marV);
  ok('y vuelve sin deuda', (await V2.porCobrar()).lista.some((x) => x.cliente_id === marV), false);
  await H.aplicarMigracion(vieja, '116');
  ok('aplicarla otra vez no cambia nada', [Number((await V2.porCobrar()).total), await apuntan()],
    [780000, [null, iBeto.movimiento, doble.movimiento, iCarla.movimiento]]);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · La pantalla llega a todo esto');
  // ═══════════════════════════════════════════════════════════
  // Las worktrees traen CRLF: se normaliza antes de buscar nada.
  const fs = require('fs');
  const leer = (ruta) => fs.readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
  const hoja = leer('src/components/CorregirPorCobrar.tsx');
  const tarjeta = leer('src/components/PaquetesAlumno.tsx');
  const pantalla = leer('src/components/PantallaClientes.tsx');
  const pagina = leer('src/app/(app)/clientes/page.tsx');
  ok('la hoja corrige el monto con cambiar_precio_paquete', hoja.includes("rpc('cambiar_precio_paquete'"), true);
  ok('con el campo de plata de siempre y los decimales de la moneda',
    hoja.includes('<CampoMonto') && hoja.includes('decimales={decimalesDe(moneda)}'), true);
  ok('y saca sin cobrar con anular_por_cobrar, avisando si tuvo clases',
    hoja.includes("rpc('anular_por_cobrar'") && hoja.includes('fila.tuvo_clases ? i.noCobrarConClases : i.noCobrarSinClases'), true);
  ok('«Editar» va junto a «Cobrar», solo para quien administra',
    tarjeta.includes('<CorregirPorCobrar') && /\{esAdmin && \(\s*<button/.test(tarjeta), true);
  ok('la tarjeta se entera cuando la página se refresca', tarjeta.includes('if (inicial) setDatos(inicial);'), true);
  // La ficha abierta: antes leía una sola vez, y tras corregir desde la
  // tarjeta su «Cobrar» seguía mostrando —y pidiendo confirmar— el monto
  // viejo mientras la base cobraba el nuevo.
  ok('la ficha vuelve a leer en cada refresco de la página',
    tarjeta.includes('useEffect(() => { leer(); }, [empresaId, clienteId, porCobrar]);'), true);
  ok('y la pantalla le pasa lo que leyó la página, y el nombre del alumno',
    pantalla.includes('alumno={c.nombre}') && pantalla.includes('deAlumnos={deAlumnos} porCobrar={porCobrar}'), true);
  ok('la ficha tiene su «Editar» junto a «Falta cobrar», solo para quien administra, con la misma hoja',
    /\{t\.inscribir\.faltaCobrar\}[\s\S]{0,600}\{esAdmin && \(\s*<button[\s\S]{0,300}setCorrigiendo\(pq\)/.test(tarjeta)
      && /<CorregirPorCobrar\s+fila=\{\{[\s\S]{0,400}tuvo_clases: corrigiendo\.tuvo_clases/.test(tarjeta), true);
  // Dos hojas en el archivo (la de la tarjeta y la de la ficha): las dos.
  ok('y al guardar, la tarjeta y la ficha vuelven a leer y refrescan la página',
    (tarjeta.match(/alListo=\{async \(\) => \{\s*setCorrigiendo\(null\);\s*await leer\(\);[\s\S]{0,120}?router\.refresh\(\);/g) || []).length, 2);
  ok('la pantalla le pasa quién administra y lo que leyó la página',
    pantalla.includes('esAdmin={puedeEliminar} inicial={porCobrar}'), true);
  ok('eliminar avisa lo que tiene sin cobrar', pantalla.includes('t.clientes.eliminarSinCobrar('), true);
  ok('la página lo lee', pagina.includes("rpc('por_cobrar_alumnos'"), true);
  const textosTodos = ['src/i18n/textos/es.ts', 'src/i18n/textos/pt.ts', 'src/i18n/textos/entrenamiento.ts'].map(leer);
  ok('los textos están en español, en portugués y con las palabras del trainer',
    textosTodos.map((x) => x.includes('eliminarSinCobrar:') && x.includes('noCobrarSinClases:')), [true, true, true]);

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE POR COBRAR FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE POR COBRAR PASARON`);
  process.exit(0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
