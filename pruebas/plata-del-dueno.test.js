/**
 * La plata del dueño no es del vendedor (migración 047).
 *
 * EL CASO REAL QUE SE PRUEBA ACÁ
 *
 * El dueño de la barbería paga la cuota de su tarjeta desde Deudas. Eso crea
 * un gasto de verdad, porque la plata salió de verdad. El barbero abre
 * Gastos y no tiene que ver nada de eso — ni el renglón, ni el total, ni la
 * categoría, ni la barra del gráfico de ese día.
 *
 * SE PRUEBA POR LOS DOS CAMINOS, Y ES A PROPÓSITO
 *
 * Las funciones de lectura son `security definer`: no pasan por RLS. La
 * política de RLS, a su vez, no protege los totales porque nadie los pide por
 * ahí. Son dos puertas distintas al mismo cuarto, así que las dos se abren y
 * se comprueba que las dos estén cerradas. Cerrar una sola daba una prueba
 * verde y un sistema abierto.
 *
 * Los roles se cambian de verdad (`set local role` + `orden.uid`), así que
 * nada pasa acá "por ser superusuario".
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

/** Un gasto cargado por esta persona, por el camino que usa la pantalla. */
const cargarGasto = (db, uid, empresa, descripcion, categoria, monto) =>
  H.comoUsuario(db, uid, () => db.query(
    `insert into public.movimientos
       (empresa_id, tipo, fecha, descripcion, categoria,
        subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
     values ($1, 'gasto', current_date, $2, $3, $4, 0, $4, 0, 'efectivo', $5)
     returning id`,
    [empresa, descripcion, categoria, monto, uid],
  ).then((r) => r.rows[0].id));

const cargarIngreso = (db, uid, empresa, descripcion, monto) =>
  H.comoUsuario(db, uid, () => db.query(
    `insert into public.movimientos
       (empresa_id, tipo, fecha, descripcion, categoria,
        subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
     values ($1, 'ingreso', current_date, $2, 'Otros', $3, 0, $3, 0, 'efectivo', $4)
     returning id`,
    [empresa, descripcion, monto, uid],
  ).then((r) => r.rows[0].id));

const resumen = (db, uid, empresa, hoy) =>
  H.comoUsuario(db, uid, () =>
    db.query('select public.resumen_financiero($1, $2, $3) r', [empresa, hoy, hoy])
      .then((r) => r.rows[0].r));

const categorias = (db, uid, empresa, hoy) =>
  H.comoUsuario(db, uid, () =>
    db.query('select public.gastos_por_categoria($1, $2, $3) c', [empresa, hoy, hoy])
      .then((r) => r.rows[0].c));

const pagina = (db, uid, empresa, hoy) =>
  H.comoUsuario(db, uid, () =>
    db.query('select public.pagina_movimientos($1, $2, $3) p', [empresa, hoy, hoy])
      .then((r) => r.rows[0].p.movimientos));

const serie = (db, uid, empresa, hoy) =>
  H.comoUsuario(db, uid, () =>
    db.query('select public.serie_financiera_diaria($1, $2, $3) s', [empresa, hoy, hoy])
      .then((r) => r.rows[0].s));

const contar = (db, uid, empresa, hoy) =>
  H.comoUsuario(db, uid, () =>
    db.query('select public.contar_movimientos($1, $2, $3) n', [empresa, hoy, hoy])
      .then((r) => Number(r.rows[0].n)));

const listar = (db, uid, empresa, hoy) =>
  H.comoUsuario(db, uid, () =>
    db.query('select public.listar_movimientos($1, $2, $3) m', [empresa, hoy, hoy])
      .then((r) => r.rows[0].m));

/** La consulta directa: lo que puede hacer cualquiera desde el navegador. */
const porRLS = (db, uid, empresa) =>
  H.comoUsuario(db, uid, () =>
    db.query('select descripcion from public.movimientos where empresa_id=$1 order by descripcion', [empresa])
      .then((r) => r.rows.map((f) => f.descripcion)));

const descripciones = (lista) => lista.map((m) => m.descripcion).sort();

async function principal() {
  const db = await H.crearBase();

  const A = await H.montarEmpresa(db, { email: 'dueno@barberia.com', nombre: 'Barbería Central' });
  // Cuatro personas no entran en Pro (tope 3), y el tope funciona: la
  // primera corrida de esta prueba se cayó justo ahí. Se sube el plan,
  // que es lo que haría el negocio de verdad antes de sumar al cuarto.
  await db.query("update public.suscripciones set plan='negocio' where empresa_id=$1", [A.empresaId]);

  const admin = await H.sumarMiembro(db, A.empresaId, 'encargado@barberia.com', 'admin');
  const barbero = await H.sumarMiembro(db, A.empresaId, 'barbero@barberia.com', 'vendedor');
  const otroBarbero = await H.sumarMiembro(db, A.empresaId, 'otro@barberia.com', 'vendedor');
  const hoy = (await db.query('select current_date::text d')).rows[0].d;

  const producto = await H.crearProducto(db, A.empresaId, A.uid, {
    nombre: 'Corte', precio: 50000, costo: 0,
  });

  // =====================================================================
  grupo('1 · La escena: el dueño paga su tarjeta y el barbero carga nafta');
  // =====================================================================

  // El camino de verdad: una deuda del negocio y su pago. Esto es lo que
  // genera el gasto «Pago ...» que el barbero estaba leyendo.
  const deuda = await H.comoUsuario(db, A.uid, () => db.query(
    'select public.crear_deuda($1,$2,$3,$4,$5) id',
    [A.empresaId, 'Tarjeta Visa', 'tarjeta', 'Banco', 6000000],
  ).then((r) => r.rows[0].id));

  await H.comoUsuario(db, A.uid, () =>
    db.query('select public.registrar_pago_deuda($1, $2)', [deuda, 2000000]));

  const gastoDelBarbero = await cargarGasto(
    db, barbero, A.empresaId, 'Nafta de la moto', 'Transporte', 50000);
  await cargarGasto(db, otroBarbero, A.empresaId, 'Toallas', 'Insumos', 30000);
  await cargarIngreso(db, A.uid, A.empresaId, 'Alquiler del local de arriba', 1500000);

  // Una venta, que es del negocio y la ve todo el mundo.
  await H.comoUsuario(db, barbero, () => db.query(
    `select public.registrar_venta($1, $2::jsonb, $3, '', 'efectivo', '', '', 'manual', 0) as id`,
    [A.empresaId, JSON.stringify([{ producto_id: producto, cantidad: 1, precio_unitario: 50000 }]), hoy],
  ));

  ok('el pago de la deuda existe como gasto',
    (await db.query(
      `select count(*)::int n from public.movimientos
       where empresa_id=$1 and tipo='gasto' and descripcion like 'Pago %'`, [A.empresaId])).rows[0].n, 1);

  // =====================================================================
  grupo('2 · Los totales: lo que dice el panel y los indicadores');
  // =====================================================================
  {
    const delDueno = await resumen(db, A.uid, A.empresaId, hoy);
    const delBarbero = await resumen(db, barbero, A.empresaId, hoy);
    const delAdmin = await resumen(db, admin, A.empresaId, hoy);

    // 2.000.000 (tarjeta) + 50.000 (nafta) + 30.000 (toallas)
    ok('el dueño ve los gastos enteros', Number(delDueno.gastos), 2080000);
    ok('el administrador también', Number(delAdmin.gastos), 2080000);
    ok('el barbero ve SOLO lo suyo', Number(delBarbero.gastos), 50000);

    ok('el dueño ve el alquiler que cobró', Number(delDueno.otros_ingresos), 1500000);
    ok('y el barbero no lo ve', Number(delBarbero.otros_ingresos), 0);

    // La venta es del negocio: eso no cambia, y no tiene que cambiar.
    ok('la venta la ven los dos igual',
      [Number(delDueno.ventas), Number(delBarbero.ventas)], [50000, 50000]);

    // Lo de la 003 sigue en pie: el margen no es suyo.
    ok('y el barbero sigue sin ver rentabilidad', delBarbero.ganancia_neta, null);
  }

  // =====================================================================
  grupo('3 · El gráfico del día');
  // =====================================================================
  {
    const dueno = (await serie(db, A.uid, A.empresaId, hoy))[0];
    const suya = (await serie(db, barbero, A.empresaId, hoy))[0];

    ok('la barra del dueño trae todo', Number(dueno.gastos), 2080000);
    ok('la del barbero, solo lo suyo', Number(suya.gastos), 50000);
    ok('sin el alquiler tampoco acá', Number(suya.otros_ingresos), 0);
  }

  // =====================================================================
  grupo('4 · Las categorías de gasto');
  // =====================================================================
  {
    const dueno = (await categorias(db, A.uid, A.empresaId, hoy)).map((c) => c.nombre).sort();
    const suyas = (await categorias(db, barbero, A.empresaId, hoy)).map((c) => c.nombre).sort();

    ok('el dueño ve las tres', dueno, ['Deudas', 'Insumos', 'Transporte']);
    // Sin esto, «Deudas · 2.000.000» seguía siendo el titular de la pantalla
    // aunque el renglón de abajo hubiera desaparecido.
    ok('el barbero ve solo la suya', suyas, ['Transporte']);
  }

  // =====================================================================
  grupo('5 · La lista de movimientos');
  // =====================================================================
  {
    const dueno = descripciones(await pagina(db, A.uid, A.empresaId, hoy));
    const suyos = descripciones(await pagina(db, barbero, A.empresaId, hoy));

    ok('el dueño ve los cinco renglones', dueno.length, 5);
    // La venta se describe con lo que se vendió ('Corte x1'), no con la
    // palabra 'Venta': lo primero que escribí acá estaba mal, no el código.
    ok('el barbero ve su gasto y la venta', suyos, ['Corte x1', 'Nafta de la moto']);
    ok('y no ve el pago de la tarjeta',
      suyos.some((d) => d.startsWith('Pago ')), false);
    ok('ni el gasto del otro barbero', suyos.includes('Toallas'), false);
  }

  // =====================================================================
  grupo('6 · La consulta directa, sin pasar por ninguna función');
  // =====================================================================
  {
    // Esta es la puerta que no controlamos: la clave del navegador es
    // pública y cualquiera puede pedir la tabla. Si RLS estuviera abierta,
    // todo lo de arriba sería decoración.
    const dueno = await porRLS(db, A.uid, A.empresaId);
    const suyos = await porRLS(db, barbero, A.empresaId);

    ok('el dueño llega a los cinco', dueno.length, 5);
    ok('el barbero, a dos', suyos.sort(), ['Corte x1', 'Nafta de la moto']);
    ok('la tarjeta no sale ni por acá',
      suyos.some((d) => d.startsWith('Pago ')), false);
  }

  // =====================================================================
  grupo('7 · Los dos caminos que hoy no usa ninguna pantalla');
  // =====================================================================
  {
    ok('contar: el dueño cuenta cinco', await contar(db, A.uid, A.empresaId, hoy), 5);
    ok('contar: el barbero cuenta dos', await contar(db, barbero, A.empresaId, hoy), 2);

    ok('listar: el dueño trae cinco', (await listar(db, A.uid, A.empresaId, hoy)).length, 5);
    ok('listar: el barbero trae dos', (await listar(db, barbero, A.empresaId, hoy)).length, 2);
  }

  // =====================================================================
  grupo('8 · Que el barbero siga pudiendo trabajar');
  // =====================================================================
  {
    // Un cierre que protege de más también es un error: si el barbero no
    // puede ver ni corregir su propio gasto, dejó de poder hacer su trabajo.
    const suyos = await pagina(db, barbero, A.empresaId, hoy);
    ok('ve su propio gasto entero',
      Number(suyos.find((m) => m.descripcion === 'Nafta de la moto').monto), 50000);

    const anulada = await H.intentar(db, barbero, () =>
      db.query('select public.anular_movimiento($1, $2)', [gastoDelBarbero, 'Me equivoqué']));
    ok('y lo puede anular el mismo día', anulada.ok, true);

    ok('el dueño ve el gasto anulado',
      Number((await resumen(db, A.uid, A.empresaId, hoy)).gastos), 2030000);
  }

  // =====================================================================
  grupo('9 · Un vendedor no gana nada cambiando de empresa');
  // =====================================================================
  {
    // El filtro nuevo mira `creado_por`. Un id de usuario es un id en todas
    // las empresas, así que había que comprobar que el corte por empresa
    // sigue siendo el primero y no lo reemplaza el corte por autor.
    const B = await H.montarEmpresa(db, { email: 'dueno@otra.com', nombre: 'Otro Local' });
    await cargarGasto(db, B.uid, B.empresaId, 'Gasto ajeno', 'General', 900000);

    const intento = await H.intentarComo(db, 'authenticated', barbero, () =>
      db.query('select public.resumen_financiero($1, $2, $3) r', [B.empresaId, hoy, hoy]));
    ok('no puede ni preguntar por una empresa que no es suya', intento.ok, false);
    ok('y el motivo es el correcto',
      /no pertenecés/i.test(intento.error ?? ''), true);
  }

  console.log(`\n${fallos === 0 ? '✓' : '✗'} ${corridas - fallos}/${corridas} pruebas`);
  await db.close();
  process.exit(fallos === 0 ? 0 : 1);
}

principal().catch((e) => { console.error(e); process.exit(1); });
