/**
 * Clientes y fiado (migraciones 052 a 055).
 *
 * LOS DOS PROBLEMAS QUE CIERRA
 *
 * 1. El nombre y el teléfono de quien reservaba quedaban sueltos dentro de
 *    cada reserva. Si Juan venía diez veces había diez reservas y ningún
 *    Juan: sin historial, sin última visita, y escribiendo el número de
 *    nuevo cada vez.
 *
 * 2. «Fiado» era una etiqueta. Se podía marcar una venta como fiada y esa
 *    venta sumaba como ingreso del día igual que si te hubieran pagado en
 *    efectivo — sin guardar quién debe ni si alguna vez pagó.
 *
 * LO QUE MÁS SE PRUEBA ACÁ
 *
 * Que el saldo salga de sumar el libro y no de un número guardado, y que
 * después de fiar, cobrar y anular, la plata que el sistema dice tener sea
 * la que hay de verdad.
 */
const H = require('./ayuda-db.js');

let fallos = 0, corridas = 0;

function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a}`);
}

function rechazado(nombre, res, frag) {
  corridas++;
  if (res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      NO fue rechazada`); return; }
  if (frag && !new RegExp(frag, 'i').test(res.error)) {
    fallos++; console.log(`  ✗ ${nombre}\n      otro motivo: ${res.error}`); return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 60)}`);
}

function aceptado(nombre, res) {
  corridas++;
  if (!res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      falló: ${res.error}`); return false; }
  console.log(`  ✓ ${nombre}`);
  return true;
}

const uno = (r) => r.rows[0];

async function principal() {
  const db = await H.crearBase();

  const A = await H.montarEmpresa(db, { email: 'dueno@almacen.com', nombre: 'Almacén Doña Rosa' });
  const B = await H.montarEmpresa(db, { email: 'otro@kiosco.com', nombre: 'Kiosco de la esquina' });
  const hoy = uno(await db.query('select current_date::text d')).d;

  const prod = await H.crearProducto(db, A.empresaId, A.uid, {
    nombre: 'Yerba', precio: 30000, costo: 20000, stock: 100, controla_stock: true,
  });

  const como = (uid, sql, args) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return uno(r.valor);
  };

  const saldo = async (cliente) =>
    Number(uno(await db.query('select public.saldo_fiado($1) s', [cliente])).s);

  const resumen = async (uid, empresa, desde, hasta) =>
    (await valor(uid, 'select public.resumen_financiero($1,$2,$3) r', [empresa, desde, hasta])).r;

  // =====================================================================
  grupo('1 · La identidad es el teléfono, no el nombre');
  // =====================================================================
  let juan;
  {
    juan = (await valor(A.uid,
      "select public.guardar_cliente($1,'Juan','0981 234 567') id", [A.empresaId])).id;
    ok('se crea el cliente', typeof juan === 'string', true);

    // El mismo número escrito de otra manera es la misma persona. Sin esto,
    // el historial de Juan quedaría partido en tres sin que nadie lo note.
    const otra = (await valor(A.uid,
      "select public.guardar_cliente($1,'Juan Pérez','0981234567') id", [A.empresaId])).id;
    ok('el mismo número escrito distinto no crea otro', otra, juan);
    ok('y se queda con el nombre más nuevo',
      uno(await db.query('select nombre from public.clientes where id=$1', [juan])).nombre,
      'Juan Pérez');

    ok('hay un solo cliente',
      Number(uno(await db.query(
        'select count(*)::int n from public.clientes where empresa_id=$1', [A.empresaId])).n), 1);

    // Dos personas distintas con el mismo nombre y sin teléfono son dos
    // fichas: no hay con qué distinguirlas, y unirlas sería peor.
    await valor(A.uid, "select public.guardar_cliente($1,'Señora del kiosco','') id", [A.empresaId]);
    await valor(A.uid, "select public.guardar_cliente($1,'Señora del kiosco','') id", [A.empresaId]);
    ok('sin teléfono, cada uno es una ficha aparte',
      Number(uno(await db.query(
        "select count(*)::int n from public.clientes where empresa_id=$1 and telefono=''",
        [A.empresaId])).n), 2);

    // Un dedazo no es un teléfono.
    const corto = (await valor(A.uid,
      "select public.guardar_cliente($1,'Dedazo','12') id", [A.empresaId])).id;
    ok('un número imposible se guarda vacío, no se guarda mal',
      uno(await db.query('select telefono from public.clientes where id=$1', [corto])).telefono, '');
  }

  // =====================================================================
  grupo('2 · Un cliente no cruza de negocio');
  // =====================================================================
  {
    rechazado('no se puede editar el cliente de otra empresa',
      await como(B.uid, "select public.guardar_cliente($1,'Robado','0999',' ',$2)",
        [B.empresaId, juan]),
      'no es de esta cuenta');

    // El candado estructural: ni con un UPDATE directo de dueño de la base.
    const cruce = await db.query(
      `select count(*)::int n from public.clientes where id=$1 and empresa_id=$2`,
      [juan, B.empresaId]);
    ok('y no aparece en la otra empresa', Number(uno(cruce).n), 0);
  }

  // =====================================================================
  grupo('3 · Reservar deja el cliente registrado');
  // =====================================================================
  {
    const barbero = await H.sumarMiembro(db, A.empresaId, 'barbero@almacen.com', 'vendedor');
    const corte = await H.crearProducto(db, A.empresaId, A.uid,
      { nombre: 'Corte', precio: 50000, costo: 0, controla_stock: false });
    const prof = (await valor(A.uid,
      "select public.guardar_profesional($1,'Barbero','comision',50,$2) id",
      [A.empresaId, barbero])).id;
    await valor(A.uid, 'select public.guardar_servicio_agenda($1,$2,$3) j',
      [A.empresaId, corte, 30]);
    await valor(A.uid, 'select public.guardar_horario($1,$2,1,$3,$4) j',
      [A.empresaId, prof, '08:00', '18:00']);

    // Un lunes futuro, para no depender de qué día se corra la prueba.
    const lunes = uno(await db.query(
      `select (date_trunc('week', current_date + interval '14 days'))::date::text d`)).d;

    const r = await valor(A.uid,
      "select public.reservar($1,$2,$3,($4 || ' 10:00')::timestamptz,'Marta','0985 111 222') j",
      [A.empresaId, prof, corte, lunes]);

    const reserva = r.j.reserva;
    const conCliente = uno(await db.query(
      'select cliente_id from public.turnos_reserva where id=$1', [reserva]));
    ok('la reserva quedó con cliente', conCliente.cliente_id !== null, true);

    const marta = uno(await db.query(
      "select id, nombre from public.clientes where empresa_id=$1 and telefono_norm='0985111222'",
      [A.empresaId]));
    ok('y se creó la ficha de Marta', marta.nombre, 'Marta');
    ok('es la misma que apunta la reserva', conCliente.cliente_id, marta.id);

    // Segunda reserva del mismo número: NO crea otra ficha.
    await valor(A.uid,
      "select public.reservar($1,$2,$3,($4 || ' 11:00')::timestamptz,'Marta G.','0985111222') j",
      [A.empresaId, prof, corte, lunes]);
    ok('volver a reservar no duplica la ficha',
      Number(uno(await db.query(
        "select count(*)::int n from public.clientes where empresa_id=$1 and telefono_norm='0985111222'",
        [A.empresaId])).n), 1);

    const hist = (await valor(A.uid, 'select public.historial_cliente($1) h', [marta.id])).h;
    ok('y su historial tiene los dos turnos', hist.length, 2);

    // Sin teléfono no se inventa una ficha: una lista llena de fantasmas no
    // sirve para nada y ensucia la búsqueda para siempre.
    const antes = Number(uno(await db.query(
      'select count(*)::int n from public.clientes where empresa_id=$1', [A.empresaId])).n);
    await valor(A.uid,
      "select public.reservar($1,$2,$3,($4 || ' 12:00')::timestamptz,'Alguien','') j",
      [A.empresaId, prof, corte, lunes]);
    ok('una reserva sin teléfono no crea cliente',
      Number(uno(await db.query(
        'select count(*)::int n from public.clientes where empresa_id=$1', [A.empresaId])).n), antes);
  }

  // =====================================================================
  grupo('4 · El saldo se suma, no se guarda');
  // =====================================================================
  {
    ok('al principio no debe nada', await saldo(juan), 0);

    await valor(A.uid, "select public.anotar_fiado($1,$2,500000,'Mercadería') id",
      [A.empresaId, juan]);
    ok('le fiaste 500.000', await saldo(juan), 500000);

    await valor(A.uid, "select public.anotar_fiado($1,$2,300000,'Más mercadería') id",
      [A.empresaId, juan]);
    ok('y otros 300.000: debe 800.000', await saldo(juan), 800000);

    await valor(A.uid, 'select public.cobrar_fiado($1,$2,200000) j', [A.empresaId, juan]);
    ok('te pagó 200.000: quedan 600.000', await saldo(juan), 600000);

    // No existe una columna `saldo` que se pueda desincronizar. Esta prueba
    // existe para que nadie la agregue creyendo que optimiza algo.
    ok('no hay ninguna columna de saldo guardado',
      Number(uno(await db.query(
        `select count(*)::int n from information_schema.columns
         where table_name='clientes' and column_name like '%saldo%'`)).n), 0);
  }

  // =====================================================================
  grupo('5 · Cobrar baja la deuda y no suma como ganancia (056)');
  // =====================================================================
  {
    const r = await resumen(A.uid, A.empresaId, hoy, hoy);
    // Hasta la 056 esta línea afirmaba que el cobro entraba como «otro
    // ingreso», y pasaba. Era el error escrito como regla: la ganancia se
    // calcula con ventas + otros ingresos, así que una venta fiada contaba
    // dos veces. Y estos 200.000 ni siquiera vienen de una venta: son de lo
    // anotado a mano, y un préstamo que vuelve no es ganancia.
    ok('cobrar no crea un ingreso', Number(r.otros_ingresos), 0);
    ok('ni una venta', Number(r.ventas), 0);

    rechazado('no se puede cobrar más de lo que se debe',
      await como(A.uid, 'select public.cobrar_fiado($1,$2,999999999)', [A.empresaId, juan]),
      'no podés cobrarle más');

    const nadie = (await valor(A.uid,
      "select public.guardar_cliente($1,'No debe nada','0971 000 111') id", [A.empresaId])).id;
    rechazado('ni a quien no debe nada',
      await como(A.uid, 'select public.cobrar_fiado($1,$2,1000)', [A.empresaId, nadie]),
      'no te debe nada');
  }

  // =====================================================================
  grupo('6 · Una venta fiada deja una deuda, no un ingreso');
  // =====================================================================
  let ventaFiada;
  {
    const antesSaldo = await saldo(juan);

    ventaFiada = (await valor(A.uid,
      `select public.registrar_venta($1,$2::jsonb,$3,'','credito','','','manual',0,$4) id`,
      [A.empresaId, JSON.stringify([{ producto_id: prod, cantidad: 2, precio_unitario: 30000 }]),
       hoy, juan])).id;

    ok('la deuda subió por el monto de la venta', await saldo(juan), antesSaldo + 60000);

    const linea = uno(await db.query(
      "select tipo, monto, concepto from public.fiado where venta_id=$1", [ventaFiada]));
    ok('quedó anotada en el libro', linea.tipo, 'fio');
    ok('por lo que se vendió', Number(linea.monto), 60000);
    ok('y dice qué se llevó', linea.concepto, 'Yerba x2');

    ok('la venta guarda a quién se le vendió',
      uno(await db.query('select cliente_id from public.movimientos where id=$1',
        [ventaFiada])).cliente_id, juan);

    // Este era el agujero: fiar sin decir a quién dejaba una deuda que nadie
    // puede cobrar y un ingreso que nunca se cierra.
    rechazado('no se puede fiar sin decir a quién',
      await como(A.uid,
        `select public.registrar_venta($1,$2::jsonb,$3,'','credito','','','manual',0)`,
        [A.empresaId, JSON.stringify([{ producto_id: prod, cantidad: 1, precio_unitario: 30000 }]), hoy]),
      'hay que decir a quién');

    // Y el stock sí se movió: la mercadería salió del local igual.
    ok('el stock bajó, porque la yerba se la llevó',
      Number(await H.stockDe(db, prod)), 98);
  }

  // =====================================================================
  grupo('7 · Lo que te deben, todo junto');
  // =====================================================================
  {
    const r = (await valor(A.uid, 'select public.resumen_fiado($1) j', [A.empresaId])).j;
    ok('el total es la suma de los saldos', Number(r.total), await saldo(juan));
    ok('y hay un solo cliente debiendo', Number(r.cuantos), 1);
    ok('con su nombre', r.clientes[0].nombre, 'Juan Pérez');
    ok('y desde cuándo', typeof r.clientes[0].dias, 'number');

    const libro = (await valor(A.uid, 'select public.libro_fiado($1) j', [juan])).j;
    ok('el libro tiene las cuatro líneas', libro.length, 4);
    ok('tres que suman y una que resta',
      [libro.filter((l) => l.tipo === 'fio').length, libro.filter((l) => l.tipo === 'cobro').length],
      [3, 1]);
  }

  // =====================================================================
  grupo('8 · Anular una venta fiada borra la deuda');
  // =====================================================================
  {
    const antes = await saldo(juan);

    aceptado('se anula la venta',
      await como(A.uid, 'select public.anular_movimiento($1,$2)', [ventaFiada, 'Me equivoqué']));

    // Sin esto, la línea quedaría reclamando plata por una venta que se
    // deshizo, y el cliente vendría a discutir con razón.
    ok('la deuda bajó lo que valía esa venta', await saldo(juan), antes - 60000);
    ok('y la línea ya no está en el libro',
      Number(uno(await db.query(
        'select count(*)::int n from public.fiado where venta_id=$1', [ventaFiada])).n), 0);

    // Pero si ya cobró, no se borra en silencio: dejaría el saldo negativo.
    const pepe = (await valor(A.uid,
      "select public.guardar_cliente($1,'Pepe','0976 555 444') id", [A.empresaId])).id;
    const v2 = (await valor(A.uid,
      `select public.registrar_venta($1,$2::jsonb,$3,'','credito','','','manual',0,$4) id`,
      [A.empresaId, JSON.stringify([{ producto_id: prod, cantidad: 1, precio_unitario: 30000 }]),
       hoy, pepe])).id;
    await valor(A.uid, 'select public.cobrar_fiado($1,$2,30000) j', [A.empresaId, pepe]);
    ok('Pepe pagó todo', await saldo(pepe), 0);

    rechazado('anular una venta ya cobrada se frena y explica',
      await como(A.uid, 'select public.anular_movimiento($1,$2)', [v2, 'A ver']),
      'ya fue cobrada');
    ok('y el saldo no quedó en negativo', await saldo(pepe), 0);
  }

  // =====================================================================
  grupo('9 · Quién puede ver y tocar esto');
  // =====================================================================
  {
    rechazado('alguien de otra empresa no ve el resumen',
      await como(B.uid, 'select public.resumen_fiado($1)', [A.empresaId]),
      'no pertenecés');
    rechazado('ni el libro de un cliente ajeno',
      await como(B.uid, 'select public.libro_fiado($1)', [juan]),
      'no pertenecés');
    rechazado('ni puede anotar una deuda en la cuenta de otro',
      await como(B.uid, 'select public.anotar_fiado($1,$2,1000)', [A.empresaId, juan]),
      'no pertenecés');
    rechazado('ni cobrarla',
      await como(B.uid, 'select public.cobrar_fiado($1,$2,1000)', [A.empresaId, juan]),
      'no pertenecés');

    // El libro no se escribe a mano desde el cliente: hay que pasar por las
    // funciones, que son las que validan el cliente y el tope.
    rechazado('nadie escribe el libro directo',
      await como(A.uid,
        `insert into public.fiado (empresa_id, cliente_id, tipo, monto, fecha)
         values ($1,$2,'fio',1,current_date)`, [A.empresaId, juan]),
      'denied|policy|permission');
  }

  // =====================================================================
  grupo('10 · Una venta fiada cobrada cuenta una sola vez (056)');
  // =====================================================================
  {
    const ana = (await valor(A.uid,
      "select public.guardar_cliente($1,'Ana','0981 777 888') id", [A.empresaId])).id;

    const antes = await resumen(A.uid, A.empresaId, hoy, hoy);
    await valor(A.uid,
      `select public.registrar_venta($1,$2::jsonb,$3,'','credito','','','manual',0,$4) id`,
      [A.empresaId, JSON.stringify([{ producto_id: prod, cantidad: 1, precio_unitario: 30000 }]),
       hoy, ana]);
    const vendida = await resumen(A.uid, A.empresaId, hoy, hoy);
    ok('la venta fiada suma una vez a las ventas',
      Number(vendida.ventas) - Number(antes.ventas), 30000);

    await valor(A.uid, "select public.cobrar_fiado($1,$2,30000,'transferencia') j", [A.empresaId, ana]);
    const cobrada = await resumen(A.uid, A.empresaId, hoy, hoy);

    // El centro de la 056: cobrar no puede volver a sumar.
    ok('cobrarla no suma otra vez a los ingresos',
      Number(cobrada.otros_ingresos) - Number(vendida.otros_ingresos), 0);
    ok('ni a la ganancia',
      Number(cobrada.ganancia_neta) - Number(vendida.ganancia_neta), 0);
    ok('la deuda quedó en cero', await saldo(ana), 0);
    ok('y quedó anotado cómo pagó',
      uno(await db.query("select metodo from public.fiado where cliente_id=$1 and tipo='cobro'", [ana])).metodo,
      'transferencia');
    ok('sin crear ningún movimiento de cobro',
      Number(uno(await db.query(
        "select count(*)::int n from public.movimientos where empresa_id=$1 and categoria='Fiado'",
        [A.empresaId])).n), 0);

    rechazado('una forma de cobro inventada se rechaza',
      await como(A.uid, "select public.cobrar_fiado($1,$2,1,'trueque')", [A.empresaId, juan]),
      'no es válida');
  }

  // =====================================================================
  grupo('11 · Borrar lo anotado por error (056)');
  // =====================================================================
  {
    const beto = (await valor(A.uid,
      "select public.guardar_cliente($1,'Beto','0982 111 222') id", [A.empresaId])).id;
    const linea = (await valor(A.uid,
      "select public.anotar_fiado($1,$2,100000,'Préstamo') id", [A.empresaId, beto])).id;
    await valor(A.uid, 'select public.cobrar_fiado($1,$2,40000) j', [A.empresaId, beto]);
    ok('debe 60.000', await saldo(beto), 60000);

    // Borrar la deuda con parte ya pagada dejaría el saldo en negativo.
    rechazado('no se borra lo fiado si ya pagó parte',
      await como(A.uid, 'select public.borrar_linea_fiado($1)', [linea]),
      'Borrá primero el pago');

    const cobro = uno(await db.query(
      "select id from public.fiado where cliente_id=$1 and tipo='cobro'", [beto])).id;
    aceptado('se borra el pago', await como(A.uid, 'select public.borrar_linea_fiado($1)', [cobro]));
    ok('y vuelve a deber lo de antes', await saldo(beto), 100000);
    aceptado('ahora sí se borra lo fiado', await como(A.uid, 'select public.borrar_linea_fiado($1)', [linea]));
    ok('y no debe nada', await saldo(beto), 0);

    // Lo que vino de una venta se deshace anulando la venta, que además
    // devuelve el stock.
    const v = (await valor(A.uid,
      `select public.registrar_venta($1,$2::jsonb,$3,'','credito','','','manual',0,$4) id`,
      [A.empresaId, JSON.stringify([{ producto_id: prod, cantidad: 1, precio_unitario: 30000 }]),
       hoy, beto])).id;
    const deVenta = uno(await db.query(
      'select id from public.fiado where venta_id=$1', [v])).id;
    rechazado('lo de una venta no se borra acá',
      await como(A.uid, 'select public.borrar_linea_fiado($1)', [deVenta]),
      'anulá la venta');

    rechazado('y alguien de otra empresa no borra nada',
      await como(B.uid, 'select public.borrar_linea_fiado($1)', [deVenta]),
      'no pertenecés');
  }

  // =====================================================================
  grupo('12 · El cierre del día sabe del fiado (057)');
  // =====================================================================
  {
    const C = await H.montarEmpresa(db, { email: 'cierre@local.com', nombre: 'Panadería' });
    const pan = await H.crearProducto(db, C.empresaId, C.uid,
      { nombre: 'Pan', precio: 10000, costo: 5000, stock: 100, controla_stock: true });
    const rosa = (await valor(C.uid,
      "select public.guardar_cliente($1,'Rosa','0983 444 555') id", [C.empresaId])).id;

    // El día del negocio y no el del servidor: cerca de medianoche no son el
    // mismo, y la prueba fallaría según la hora a la que se corra.
    const diaMenos = async (n) => uno(await db.query(
      'select (public.hoy_empresa($1) - $2::int)::text d', [C.empresaId, n])).d;
    const hoyC = await diaMenos(0);
    const ayer = await diaMenos(1);
    const hace3 = await diaMenos(3);

    const vender = (fecha, cantidad, metodo, cliente) => valor(C.uid,
      `select public.registrar_venta($1,$2::jsonb,$3,'',$4,'','','manual',0,$5) id`,
      [C.empresaId, JSON.stringify([{ producto_id: pan, cantidad, precio_unitario: 10000 }]),
       fecha, metodo, cliente ?? null]);

    // Ayer se le fiaron 50.000 a Rosa. Hoy: 20.000 en efectivo, 30.000
    // fiado, y Rosa paga 10.000 de lo de ayer.
    await vender(ayer, 5, 'credito', rosa);
    await vender(hoyC, 2, 'efectivo');
    await vender(hoyC, 3, 'credito', rosa);
    await valor(C.uid, "select public.cobrar_fiado($1,$2,10000,'efectivo',$3::date) j",
      [C.empresaId, rosa, hoyC]);

    const cie = (await valor(C.uid, 'select public.cierre_del_dia($1,$2::date) c',
      [C.empresaId, hoyC])).c;
    ok('las ventas del día siguen siendo todas', Number(cie.resumen.ventas), 50000);
    ok('de eso, lo fiado', Number(cie.fiado_vendido), 30000);
    ok('y lo cobrado de fiados', Number(cie.fiado_cobrado), 10000);

    // Un día en que solo se cobró un fiado tuvo plata que entró: no puede
    // salir «sin actividad». (El cobro se fecha antes de la deuda solo para
    // tener un día sin ninguna venta; lo que se prueba es el cierre.)
    await valor(C.uid, "select public.cobrar_fiado($1,$2,5000,'efectivo',$3::date) j",
      [C.empresaId, rosa, hace3]);
    const soloCobro = (await valor(C.uid, 'select public.cierre_del_dia($1,$2::date) c',
      [C.empresaId, hace3])).c;
    ok('ese día no hubo ventas', Number(soloCobro.resumen.ventas), 0);
    ok('pero sí un cobro', Number(soloCobro.fiado_cobrado), 5000);
    ok('y no sale «sin actividad»', soloCobro.hubo_actividad, true);
  }

  // =====================================================================
  grupo('13 · Agendar con un cliente elegido, aunque no tenga teléfono (057)');
  // =====================================================================
  {
    const E = await H.montarEmpresa(db, { email: 'agenda@local.com', nombre: 'Barbería Elsa' });
    const corteE = await H.crearProducto(db, E.empresaId, E.uid,
      { nombre: 'Corte', precio: 50000, costo: 0, controla_stock: false });
    const profE = (await valor(E.uid,
      "select public.guardar_profesional($1,'La dueña','local',null,$2) id", [E.empresaId, E.uid])).id;
    await valor(E.uid, 'select public.guardar_servicio_agenda($1,$2,$3) j', [E.empresaId, corteE, 30]);
    await valor(E.uid, 'select public.guardar_horario($1,$2,1,$3,$4) j',
      [E.empresaId, profE, '08:00', '18:00']);
    // Un lunes futuro, para no depender de qué día se corra la prueba.
    const lunesE = uno(await db.query(
      `select (date_trunc('week', current_date + interval '14 days'))::date::text d`)).d;

    // Una clienta cargada sin teléfono. Antes de la 057 su turno quedaba
    // suelto: el trigger de la 053 solo sabe atar por teléfono.
    const elsa = (await valor(E.uid,
      "select public.guardar_cliente($1,'Doña Elsa','') id", [E.empresaId])).id;
    const r = await valor(E.uid,
      "select public.reservar($1,$2,$3,($4 || ' 10:00')::timestamptz,'Doña Elsa','','local',$5) j",
      [E.empresaId, profE, corteE, lunesE, elsa]);
    ok('el turno quedó atado a la clienta elegida',
      uno(await db.query('select cliente_id from public.turnos_reserva where id=$1', [r.j.reserva])).cliente_id,
      elsa);

    // Sin elegir y sin teléfono sigue como antes: no se inventan clientes.
    const r2 = await valor(E.uid,
      "select public.reservar($1,$2,$3,($4 || ' 11:00')::timestamptz,'Alguien','') j",
      [E.empresaId, profE, corteE, lunesE]);
    ok('sin elegir y sin teléfono, sigue sin cliente',
      uno(await db.query('select cliente_id from public.turnos_reserva where id=$1', [r2.j.reserva])).cliente_id,
      null);

    rechazado('no se puede agendar con el cliente de otro negocio',
      await como(E.uid,
        "select public.reservar($1,$2,$3,($4 || ' 12:00')::timestamptz,'Juan','','local',$5)",
        [E.empresaId, profE, corteE, lunesE, juan]),
      'no es de esta cuenta');

    // La firma vieja tiene que estar muerta, o PostgREST no sabe cuál llamar.
    ok('queda una sola función reservar',
      Number(uno(await db.query("select count(*)::int n from pg_proc where proname='reservar'")).n), 1);
  }

  // =====================================================================
  // 14 a 16 · ELIMINAR (058). En un negocio aparte, para que lo que se
  // borra acá no le cambie nada a los grupos de arriba.
  // =====================================================================
  const D = await H.montarEmpresa(db, { email: 'duena@tienda.com', nombre: 'Tienda Lucía' });
  const vendedora = await H.sumarMiembro(db, D.empresaId, 'vende@tienda.com', 'vendedor');
  const remera = await H.crearProducto(db, D.empresaId, D.uid,
    { nombre: 'Remera', precio: 80000, costo: 40000, stock: 50, controla_stock: true });
  const hoyD = uno(await db.query('select public.hoy_empresa($1)::text d', [D.empresaId])).d;
  const clienteD = async (nombre, tel) => (await valor(D.uid,
    'select public.guardar_cliente($1,$2,$3) id', [D.empresaId, nombre, tel])).id;
  const cuenta = async (sql, args) => Number(uno(await db.query(sql, args)).n);
  const eliminarCliente = async (id) =>
    (await valor(D.uid, 'select public.eliminar_cliente($1) r', [id])).r;
  const eliminarProducto = async (id) =>
    (await valor(D.uid, 'select public.eliminar_producto($1) r', [id])).r;
  const enLista = async (id) =>
    (await valor(D.uid, 'select public.lista_clientes($1) j', [D.empresaId])).j.some((c) => c.id === id);

  // =====================================================================
  grupo('14 · Eliminar un cliente sin perder lo que te debe (058)');
  // =====================================================================
  {
    const repetido = await clienteD('Lucas', '');
    ok('sin nada atado, se borra de verdad', await eliminarCliente(repetido), 'borrado');
    ok('y no queda la ficha',
      await cuenta('select count(*)::int n from public.clientes where id=$1', [repetido]), 0);

    // El libro de fiado cuelga de la ficha con borrado en cascada (054):
    // borrarla borraría la deuda. Esta es la prueba que importa.
    const carla = await clienteD('Carla', '0984 123 456');
    await valor(D.uid,
      `select public.registrar_venta($1,$2::jsonb,$3,'','credito','','','manual',0,$4) id`,
      [D.empresaId, JSON.stringify([{ producto_id: remera, cantidad: 1, precio_unitario: 80000 }]),
       hoyD, carla]);
    rechazado('a quien te debe no se lo elimina',
      await como(D.uid, 'select public.eliminar_cliente($1)', [carla]), 'todavía te debe 80.000');
    ok('y la deuda sigue entera', await saldo(carla), 80000);

    // Pagó todo. Ahora sí, pero se archiva: tiene una venta y un libro.
    await valor(D.uid, 'select public.cobrar_fiado($1,$2,80000) j', [D.empresaId, carla]);
    ok('con historia, se archiva en vez de borrarse', await eliminarCliente(carla), 'archivado');
    ok('el libro de fiado quedó entero',
      await cuenta('select count(*)::int n from public.fiado where cliente_id=$1', [carla]), 2);
    ok('la venta sigue diciendo a quién',
      await cuenta('select count(*)::int n from public.movimientos where cliente_id=$1', [carla]), 1);
    ok('no aparece en la lista', await enLista(carla), false);
    ok('ni al buscar para vender',
      (await valor(D.uid, "select public.buscar_clientes($1,'Carla') j", [D.empresaId])).j.length, 0);

    // Vuelve con el mismo número: es la misma persona, con su historia.
    ok('si vuelve con el mismo teléfono, es la misma ficha',
      await clienteD('Carla M.', '0984123456'), carla);
    ok('y reaparece en la lista', await enLista(carla), true);

    const tina = await clienteD('Tina', '');
    rechazado('una vendedora no elimina clientes',
      await como(vendedora, 'select public.eliminar_cliente($1)', [tina]),
      'dueño o de un administrador');
    rechazado('ni alguien de otro negocio',
      await como(B.uid, 'select public.eliminar_cliente($1)', [tina]), 'no pertenecés');
    ok('y Tina sigue ahí',
      await cuenta('select count(*)::int n from public.clientes where id=$1 and activo', [tina]), 1);
  }

  // =====================================================================
  grupo('15 · El teléfono de una ficha eliminada queda libre (058)');
  // =====================================================================
  {
    // La misma persona cargada dos veces: «Guille», con teléfono y un fiado
    // ya pagado, y «Guillermo», sin teléfono. Se elimina la primera y a la
    // segunda se le pone el número. Hasta la 058 el índice único lo frenaba
    // con «ya existe algo con ese nombre», que encima hablaba del nombre.
    const guille = await clienteD('Guille', '0982 776 920');
    await valor(D.uid, "select public.anotar_fiado($1,$2,10000,'Prueba') id", [D.empresaId, guille]);
    await valor(D.uid, 'select public.cobrar_fiado($1,$2,10000) j', [D.empresaId, guille]);
    ok('Guille se archiva', await eliminarCliente(guille), 'archivado');

    const guillermo = await clienteD('Guillermo', '');
    aceptado('a Guillermo se le puede poner ese número',
      await como(D.uid, "select public.guardar_cliente($1,'Guillermo','0982776920','',$2)",
        [D.empresaId, guillermo]));
    ok('el número quedó en Guillermo',
      uno(await db.query('select telefono_norm from public.clientes where id=$1', [guillermo])).telefono_norm,
      '0982776920');
    ok('la ficha vieja lo soltó sin perder su libro',
      [uno(await db.query('select telefono from public.clientes where id=$1', [guille])).telefono,
       await cuenta('select count(*)::int n from public.fiado where cliente_id=$1', [guille])],
      ['', 2]);

    // Con una ficha activa, en cambio, no se pisa: se dice de quién es.
    await clienteD('Pedro', '0991 000 222');
    rechazado('el teléfono de una ficha activa no se pisa',
      await como(D.uid, "select public.guardar_cliente($1,'Guillermo','0991000222','',$2)",
        [D.empresaId, guillermo]),
      'ya es de «Pedro»');
  }

  // =====================================================================
  grupo('16 · Eliminar del catálogo: lo usado se pausa, lo nuevo se borra (058)');
  // =====================================================================
  {
    const activo = async (id) =>
      uno(await db.query('select activo from public.productos where id=$1', [id])).activo;

    // Cargado por error y nunca vendido: se va de verdad.
    const mal = await H.crearProducto(db, D.empresaId, D.uid,
      { nombre: 'Remra', precio: 80000, costo: 40000 });
    ok('lo que nunca se vendió se borra', await eliminarProducto(mal), 'borrado');
    ok('y no queda en el catálogo',
      await cuenta('select count(*)::int n from public.productos where id=$1', [mal]), 0);

    // La remera ya se vendió (grupo 14): se pausa, y la venta no la suelta.
    ok('lo vendido se pausa en vez de borrarse', await eliminarProducto(remera), 'pausado');
    ok('queda pausado', await activo(remera), false);
    ok('y la venta sigue atada a su producto',
      await cuenta('select count(*)::int n from public.movimiento_items where producto_id=$1', [remera]), 1);

    // Un servicio con turnos tampoco se borra: un turno no puede quedar sin
    // su servicio.
    const corte = await H.crearProducto(db, D.empresaId, D.uid,
      { nombre: 'Corte', precio: 50000, costo: 0, controla_stock: false });
    const prof = (await valor(D.uid,
      "select public.guardar_profesional($1,'Vendedora','comision',50,$2) id",
      [D.empresaId, vendedora])).id;
    await valor(D.uid, 'select public.guardar_servicio_agenda($1,$2,$3) j', [D.empresaId, corte, 30]);
    await valor(D.uid, 'select public.guardar_horario($1,$2,1,$3,$4) j',
      [D.empresaId, prof, '08:00', '18:00']);
    const lunes = uno(await db.query(
      `select (date_trunc('week', current_date + interval '14 days'))::date::text d`)).d;
    await valor(D.uid,
      "select public.reservar($1,$2,$3,($4 || ' 10:00')::timestamptz,'Nora','0975 333 444') j",
      [D.empresaId, prof, corte, lunes]);
    ok('un servicio con turnos se pausa', await eliminarProducto(corte), 'pausado');

    // Con duración en la agenda pero ningún turno: se borra, y se lleva la
    // duración, que sin el servicio no significa nada.
    const barba = await H.crearProducto(db, D.empresaId, D.uid,
      { nombre: 'Barba', precio: 30000, costo: 0, controla_stock: false });
    await valor(D.uid, 'select public.guardar_servicio_agenda($1,$2,$3) j', [D.empresaId, barba, 20]);
    ok('un servicio sin turnos se borra', await eliminarProducto(barba), 'borrado');
    ok('y se lleva su duración de la agenda',
      await cuenta('select count(*)::int n from public.turnos_servicio where producto_id=$1', [barba]), 0);

    rechazado('una vendedora no elimina del catálogo',
      await como(vendedora, 'select public.eliminar_producto($1)', [corte]),
      'dueño o de un administrador');
    rechazado('ni alguien de otro negocio',
      await como(B.uid, 'select public.eliminar_producto($1)', [corte]), 'no pertenecés');
  }

  grupo('17 · Prestar plata sale de una cuenta, y no es un gasto (084)');
  {
    // Fiar una venta y prestar plata se anotaban igual, y son dos cosas
    // distintas: en la venta entregás mercadería y de tus cuentas no sale
    // nada; en el préstamo sale plata de verdad.
    const caja = (await valor(A.uid,
      "select public.guardar_cuenta_dinero($1,'Caja','efectivo',500000,'{efectivo}') id",
      [A.empresaId])).id;
    const saldoCaja = async () => Number(uno(await db.query(
      'select public.saldo_cuenta_dinero($1) s', [caja])).s);
    const gastosDelMes = async () => Number(uno(await db.query(
      `select coalesce(sum(monto),0) g from public.movimientos
        where empresa_id=$1 and estado='activo' and tipo='gasto'`, [A.empresaId])).g);

    ok('la caja arranca con lo que se cargó', await saldoCaja(), 500000);
    const gastosAntes = await gastosDelMes();
    const deudaAntes = await saldo(juan);

    // Sin cuenta: es una venta fiada, no sale plata de ningún lado.
    const sinCuenta = await valor(A.uid,
      "select public.anotar_fiado($1,$2,80000,'Le fié dos remeras') id", [A.empresaId, juan]);
    ok('fiar una venta no toca el saldo', await saldoCaja(), 500000);
    ok('y el fiado no recuerda ninguna cuenta',
      uno(await db.query('select cuenta_id from public.fiado where id=$1', [sinCuenta.id])).cuenta_id, null);

    // Con cuenta: le prestaste plata, y esa plata salió.
    const prestado = await valor(A.uid,
      "select public.anotar_fiado($1,$2,300000,'Le presté',null,$3) id",
      [A.empresaId, juan, caja]);
    ok('prestar baja el saldo de la cuenta elegida', await saldoCaja(), 200000);
    ok('el fiado recuerda de dónde salió',
      uno(await db.query('select cuenta_id from public.fiado where id=$1', [prestado.id])).cuenta_id, caja);

    // LO QUE MÁS IMPORTA: no es un gasto. Anotarlo como tal le inflaría los
    // gastos del mes y le bajaría la ganancia neta por algo que no perdió.
    ok('y NO aparece como gasto', await gastosDelMes(), gastosAntes);
    const ajuste = uno(await db.query(
      `select tipo, monto::numeric m, nota from public.ajustes_cuenta
        where cuenta_id=$1 order by created_at desc limit 1`, [caja]));
    ok('queda como un ajuste de tipo préstamo', ajuste.tipo, 'prestamo');
    ok('por el monto, en negativo', Number(ajuste.m), -300000);
    ok('y dice a quién le prestaste', /Juan/.test(ajuste.nota), true);

    // Las dos deudas suman: lo fiado más lo prestado. Se mide el salto y
    // no el total, porque Juan ya venía debiendo de los grupos anteriores.
    ok('el cliente debe las dos cosas', await saldo(juan) - deudaAntes, 380000);

    rechazado('una cuenta de otro negocio no sirve',
      await como(A.uid, 'select public.anotar_fiado($1,$2,1000,$4,null,$3)',
        [A.empresaId, juan,
         (await valor(B.uid, "select public.guardar_cuenta_dinero($1,'Ajena','banco',0,'{}') id",
           [B.empresaId])).id, 'x']),
      'no existe');

    // Y cobrar entra en la cuenta que se elija, por el mismo camino: un
    // ajuste. Volver a crear el ingreso que sacó la 056 inflaría la
    // ganancia, que es exactamente lo que esa migración vino a arreglar.
    const ingresosAntes = Number(uno(await db.query(
      `select coalesce(sum(monto),0) i from public.movimientos
        where empresa_id=$1 and estado='activo' and tipo='ingreso'`, [A.empresaId])).i);

    await valor(A.uid, "select public.cobrar_fiado($1,$2,100000,'transferencia',null,$3) j",
      [A.empresaId, juan, caja]);
    ok('cobrar con cuenta sube ese saldo', await saldoCaja(), 300000);
    ok('y NO crea ningún ingreso', Number(uno(await db.query(
      `select coalesce(sum(monto),0) i from public.movimientos
        where empresa_id=$1 and estado='activo' and tipo='ingreso'`, [A.empresaId])).i), ingresosAntes);
    ok('el cobro recuerda en qué cuenta entró',
      uno(await db.query(
        "select cuenta_id from public.fiado where empresa_id=$1 and tipo='cobro' order by created_at desc limit 1",
        [A.empresaId])).cuenta_id, caja);

    // Sin cuenta no se toca ningún saldo: si te pagaron en efectivo y no
    // llevás caja en Orden, no hay nada que mover.
    await valor(A.uid, "select public.cobrar_fiado($1,$2,50000,'efectivo') j", [A.empresaId, juan]);
    ok('sin cuenta elegida el saldo no se mueve', await saldoCaja(), 300000);

    const vendedorA = await H.sumarMiembro(db, A.empresaId, 'vende@alfa.com', 'vendedor');
    rechazado('y un vendedor no saca plata de la billetera',
      await como(vendedorA, 'select public.anotar_fiado($1,$2,1000,$4,null,$3)',
        [A.empresaId, juan, caja, 'x']),
      'billetera');
  }

  console.log(`\n${fallos === 0 ? '✓' : '✗'} ${corridas - fallos}/${corridas} pruebas`);
  await db.close();
  process.exit(fallos === 0 ? 0 : 1);
}

principal().catch((e) => { console.error(e); process.exit(1); });
