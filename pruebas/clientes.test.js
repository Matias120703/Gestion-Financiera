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
  grupo('5 · Cobrar es donde entra la plata');
  // =====================================================================
  {
    const r = await resumen(A.uid, A.empresaId, hoy, hoy);
    // Los 200.000 cobrados entraron como «otro ingreso», no como venta: la
    // venta ya se registró el día que se entregó la mercadería, y contarla
    // otra vez duplicaría la facturación.
    ok('el cobro entró como otro ingreso', Number(r.otros_ingresos), 200000);
    ok('y no como venta', Number(r.ventas), 0);

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

  console.log(`\n${fallos === 0 ? '✓' : '✗'} ${corridas - fallos}/${corridas} pruebas`);
  await db.close();
  process.exit(fallos === 0 ? 0 : 1);
}

principal().catch((e) => { console.error(e); process.exit(1); });
