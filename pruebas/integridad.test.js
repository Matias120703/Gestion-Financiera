/**
 * Pruebas de integridad financiera y seguridad sobre PostgreSQL real.
 *
 * Cada caso simula lo que podría hacer alguien desde la consola del navegador
 * llamando a Supabase directamente, no lo que permite la interfaz.
 */
const H = require('./ayuda-db.js');

let fallos = 0;
let corridas = 0;
let grupoActual = '';

function grupo(nombre) {
  grupoActual = nombre;
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

/** Espera que la operación haya sido rechazada, y que el mensaje tenga sentido. */
function rechazado(nombre, resultado, fragmentoEsperado) {
  corridas++;
  if (resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      la operación NO fue rechazada (devolvió ${JSON.stringify(resultado.valor)})`);
    return;
  }
  if (fragmentoEsperado && !new RegExp(fragmentoEsperado, 'i').test(resultado.error)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      rechazada pero con otro motivo: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${resultado.error.split('\n')[0].slice(0, 78)}`);
}

/**
 * Cuando una policy filtra con USING, PostgreSQL no tira error: simplemente
 * no encuentra filas para modificar. Es igual de seguro que un rechazo (el dato
 * no cambia), pero hay que comprobarlo así: cero filas afectadas y valor intacto.
 */
async function sinEfecto(nombre, resultado, comprobar) {
  corridas++;
  const filas = resultado.ok ? (resultado.valor?.affectedRows ?? resultado.valor?.rowCount ?? 0) : 0;
  const intacto = await comprobar();
  if (resultado.ok && filas > 0) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      modificó ${filas} fila(s)`);
    return;
  }
  if (!intacto) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      no modificó filas pero el dato quedó distinto`);
    return;
  }
  const motivo = resultado.ok ? '0 filas afectadas, dato intacto' : `rechazada: ${resultado.error.split('\n')[0].slice(0, 50)}`;
  console.log(`  ✓ ${nombre} → ${motivo}`);
}

function aceptado(nombre, resultado) {
  corridas++;
  if (!resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      debía funcionar pero falló: ${resultado.error}`);
    return false;
  }
  console.log(`  ✓ ${nombre}`);
  return true;
}

const vender = (db, empresaId, items, extra = {}) =>
  db.query(
    `select public.registrar_venta($1, $2::jsonb, $3, $4, $5, $6, $7, $8::origen_captura, $9) as id`,
    [
      empresaId, JSON.stringify(items), extra.fecha ?? null, extra.descripcion ?? '',
      extra.metodo ?? 'efectivo', extra.contraparte ?? '', extra.notas ?? '',
      extra.origen ?? 'manual', extra.descuento ?? 0,
    ],
  ).then((r) => r.rows[0].id);

async function principal() {
  const db = await H.crearBase();

  // Empresa A con dueño, un admin y un vendedor. Empresa B aparte.
  const A = await H.montarEmpresa(db, { email: 'dueno@a.com', nombre: 'Perfumería Aurora' });
  const adminA = await H.sumarMiembro(db, A.empresaId, 'admin@a.com', 'admin');
  const vendedorA = await H.sumarMiembro(db, A.empresaId, 'vendedor@a.com', 'vendedor');
  const B = await H.montarEmpresa(db, { email: 'dueno@b.com', nombre: 'Kiosco Beta' });
  const externo = await H.crearUsuario(db, 'nadie@ninguna.com');

  // =====================================================================
  grupo('1 · Venta normal');
  // =====================================================================
  {
    const p = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Perfume', costo: 100, precio: 150, stock: 10 });
    let ventaId;
    const r = await H.intentar(db, A.uid, async () => {
      ventaId = await vender(db, A.empresaId, [{ producto_id: p, cantidad: 2, precio_unitario: 150 }]);
      return ventaId;
    });
    aceptado('la venta se registra', r);

    const mv = await H.movimiento(db, r.valor);
    ok('subtotal', Number(mv.subtotal), 300);
    ok('descuento', Number(mv.descuento), 0);
    ok('total cobrado', Number(mv.monto), 300);
    ok('costo de mercadería', Number(mv.costo_total), 200);
    ok('ganancia bruta', Number(mv.monto) - Number(mv.costo_total), 100);
    ok('estado', mv.estado, 'activo');
    ok('queda registrado quién la cargó', mv.creado_por, A.uid);
    ok('stock descontado', await H.stockDe(db, p), 8);

    const items = await H.itemsDe(db, r.valor);
    ok('un solo item', items.length, 1);
    ok('el item marca que movió stock', items[0].afecto_stock, true);
  }

  // =====================================================================
  grupo('2 · Cambiar el costo después no toca las ventas viejas');
  // =====================================================================
  {
    const p = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Difusor', costo: 100, precio: 150, stock: 10 });
    const venta = await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ producto_id: p, cantidad: 2 }]));
    aceptado('venta con el costo viejo', venta);

    await H.comoUsuario(db, A.uid, () => db.query('update public.productos set costo = 120 where id = $1', [p]));
    ok('el producto ahora cuesta más', Number((await db.query('select costo from public.productos where id=$1', [p])).rows[0].costo), 120);

    const mv = await H.movimiento(db, venta.valor);
    ok('el costo histórico de la venta NO cambió', Number(mv.costo_total), 200);
    ok('el item conserva su costo', Number((await H.itemsDe(db, venta.valor))[0].costo_unitario), 100);
  }

  // =====================================================================
  grupo('3 · Costo manipulado desde el cliente');
  // =====================================================================
  {
    const p = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Crema', costo: 100, precio: 150, stock: 10 });
    // El atacante manda costo_unitario = 1 para inflar la ganancia.
    const venta = await H.intentar(db, A.uid, () =>
      vender(db, A.empresaId, [{ producto_id: p, cantidad: 2, precio_unitario: 150, costo_unitario: 1 }]));
    aceptado('la venta entra igual', venta);

    const mv = await H.movimiento(db, venta.valor);
    ok('la base IGNORA el costo del cliente', Number(mv.costo_total), 200);
    ok('el item guarda el costo real del catálogo', Number((await H.itemsDe(db, venta.valor))[0].costo_unitario), 100);
    ok('la ganancia no se puede inflar', Number(mv.monto) - Number(mv.costo_total), 100);
  }

  // =====================================================================
  grupo('4 · Producto suelto (fuera del catálogo)');
  // =====================================================================
  {
    const venta = await H.intentar(db, A.uid, () =>
      vender(db, A.empresaId, [{ nombre: 'Cargador tipo C', cantidad: 3, precio_unitario: 50000, costo_unitario: 30000 }]));
    aceptado('se acepta con costo manual', venta);

    const mv = await H.movimiento(db, venta.valor);
    ok('total', Number(mv.monto), 150000);
    ok('costo manual aceptado', Number(mv.costo_total), 90000);
    const it = (await H.itemsDe(db, venta.valor))[0];
    ok('no queda vinculado a ningún producto', it.producto_id, null);
    ok('no mueve stock', it.afecto_stock, false);

    rechazado('producto suelto sin nombre',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ cantidad: 1, precio_unitario: 100 }])),
      'nombre');
    rechazado('cantidad cero',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ nombre: 'X', cantidad: 0, precio_unitario: 100 }])),
      'cantidad');
    rechazado('cantidad negativa',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ nombre: 'X', cantidad: -5, precio_unitario: 100 }])),
      'cantidad');
    rechazado('precio negativo',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ nombre: 'X', cantidad: 1, precio_unitario: -100 }])),
      'precio');
    rechazado('costo negativo',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ nombre: 'X', cantidad: 1, precio_unitario: 10, costo_unitario: -5 }])),
      'costo');
    rechazado('venta sin items',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [])),
      'al menos un producto');
    rechazado('cantidad no numérica',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ nombre: 'X', cantidad: 'muchos', precio_unitario: 10 }])),
      'cantidad');
    rechazado('forma de cobro inventada',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ nombre: 'X', cantidad: 1, precio_unitario: 10 }], { metodo: 'cripto' })),
      'cobro');
  }

  // =====================================================================
  grupo('5 · Descuentos');
  // =====================================================================
  {
    const p = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Set regalo', costo: 60, precio: 150, stock: 20 });
    const venta = await H.intentar(db, A.uid, () =>
      vender(db, A.empresaId, [{ producto_id: p, cantidad: 2 }], { descuento: 50 }));
    aceptado('venta con descuento', venta);

    const mv = await H.movimiento(db, venta.valor);
    ok('subtotal bruto', Number(mv.subtotal), 300);
    ok('descuento guardado aparte', Number(mv.descuento), 50);
    ok('total cobrado', Number(mv.monto), 250);
    ok('el descuento NO cambia el costo', Number(mv.costo_total), 120);
    ok('ganancia = total − costo', Number(mv.monto) - Number(mv.costo_total), 130);

    rechazado('descuento mayor que el subtotal',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ producto_id: p, cantidad: 1 }], { descuento: 500 })),
      'mayor que el subtotal');
    rechazado('descuento negativo',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ producto_id: p, cantidad: 1 }], { descuento: -10 })),
      'negativo');

    // La restricción de la tabla también aguanta un UPDATE hecho a mano.
    rechazado('romper la coherencia subtotal/descuento/total a mano',
      await H.intentar(db, null, () => db.query('update public.movimientos set monto = 999 where id = $1', [venta.valor])),
      'movimientos_total_coherente|permission|denied|policy');
  }

  // =====================================================================
  grupo('6 · Stock flexible (negativo permitido)');
  // =====================================================================
  {
    const p = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Auricular', costo: 50, precio: 90, stock: 1 });
    const venta = await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ producto_id: p, cantidad: 3 }]));
    aceptado('vender más de lo que hay está permitido', venta);
    ok('el stock queda en negativo', await H.stockDe(db, p), -2);
    ok('la venta es válida igual', (await H.movimiento(db, venta.valor)).estado, 'activo');

    // Y si la empresa decide ponerse estricta, la misma lógica lo bloquea.
    await db.query('update public.empresas set permitir_stock_negativo = false where id = $1', [A.empresaId]);
    const p2 = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Reloj', costo: 50, precio: 90, stock: 1 });
    rechazado('con la empresa en modo estricto, se rechaza',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ producto_id: p2, cantidad: 3 }])),
      'stock suficiente');
    ok('y el stock quedó intacto (rollback)', await H.stockDe(db, p2), 1);
    await db.query('update public.empresas set permitir_stock_negativo = true where id = $1', [A.empresaId]);
  }

  // =====================================================================
  grupo('7 · Anulación de ventas');
  // =====================================================================
  {
    const p = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Vela aromática', costo: 40, precio: 100, stock: 10 });
    const venta = await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ producto_id: p, cantidad: 2 }]));
    ok('stock después de vender', await H.stockDe(db, p), 8);

    const anul = await H.intentar(db, A.uid, () =>
      db.query('select public.anular_movimiento($1, $2)', [venta.valor, 'El cliente devolvió todo']));
    aceptado('se anula', anul);
    ok('el stock volvió', await H.stockDe(db, p), 10);

    const mv = await H.movimiento(db, venta.valor);
    ok('estado', mv.estado, 'anulado');
    ok('queda registrado quién anuló', mv.anulado_por, A.uid);
    ok('queda registrado cuándo', mv.anulado_at !== null, true);
    ok('queda registrado el motivo', mv.motivo_anulacion, 'El cliente devolvió todo');
    ok('la venta sigue en la base (no se borró)', mv.id, venta.valor);

    // ---- idempotencia ----
    const otra = await H.intentar(db, A.uid, () =>
      db.query('select public.anular_movimiento($1, $2)', [venta.valor, 'otra vez']));
    rechazado('anular dos veces se rechaza', otra, 'ya estaba anulado');
    ok('el stock NO se devolvió dos veces', await H.stockDe(db, p), 10);

    rechazado('un movimiento anulado no se puede reactivar',
      await H.intentar(db, null, () => db.query("update public.movimientos set estado='activo' where id=$1", [venta.valor])),
      'no se puede reactivar|permission|denied');
  }

  // =====================================================================
  grupo('8 · Las ventas anuladas no cuentan');
  // =====================================================================
  {
    const emp = (await H.montarEmpresa(db, { email: 'limpia@c.com', nombre: 'Empresa Limpia' }));
    const p = await H.crearProducto(db, emp.empresaId, emp.uid, { nombre: 'Único', costo: 100, precio: 200, stock: 100 });
    const v1 = await H.intentar(db, emp.uid, () => vender(db, emp.empresaId, [{ producto_id: p, cantidad: 1 }]));
    const v2 = await H.intentar(db, emp.uid, () => vender(db, emp.empresaId, [{ producto_id: p, cantidad: 3 }]));
    await H.intentar(db, emp.uid, () => db.query('select public.anular_movimiento($1, null)', [v2.valor]));

    const r = await db.query(
      `select coalesce(sum(monto),0)::float as ventas,
              coalesce(sum(costo_total),0)::float as costo,
              count(*)::int as operaciones
       from public.movimientos
       where empresa_id = $1 and tipo = 'venta' and estado = 'activo'`,
      [emp.empresaId],
    );
    ok('ventas válidas', r.rows[0].ventas, 200);
    ok('costo de ventas válidas', r.rows[0].costo, 100);
    ok('operaciones válidas', r.rows[0].operaciones, 1);
    ok('la anulada sigue existiendo para el historial',
      (await db.query("select count(*)::int n from public.movimientos where empresa_id=$1 and estado='anulado'", [emp.empresaId])).rows[0].n, 1);
    ok('el stock refleja solo la venta válida', await H.stockDe(db, p), 99);
  }

  // =====================================================================
  grupo('9 · Reemplazar una venta (la "edición" segura)');
  // =====================================================================
  {
    const pa = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Camisa', costo: 50, precio: 120, stock: 10 });
    const pb = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Pantalón', costo: 80, precio: 200, stock: 10 });
    const original = await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ producto_id: pa, cantidad: 2 }]));
    ok('stock de camisa tras la venta original', await H.stockDe(db, pa), 8);

    const nueva = await H.intentar(db, A.uid, () =>
      db.query(
        'select public.reemplazar_venta($1, $2::jsonb, null, $3, $4, $5, $6, $7) as id',
        [original.valor, JSON.stringify([
          { producto_id: pa, cantidad: 1 },
          { producto_id: pb, cantidad: 1 },
        ]), 'Corregida', 'efectivo', '', '', 0],
      ).then((r) => r.rows[0].id));
    aceptado('se reemplaza en una sola operación', nueva);

    ok('la original quedó anulada', (await H.movimiento(db, original.valor)).estado, 'anulado');
    ok('stock de camisa: devuelto 2, descontado 1', await H.stockDe(db, pa), 9);
    ok('stock de pantalón: descontado 1', await H.stockDe(db, pb), 9);
    const mv = await H.movimiento(db, nueva.valor);
    ok('total de la venta corregida', Number(mv.monto), 320);
    ok('costo de la venta corregida', Number(mv.costo_total), 130);
    ok('queda registrado que fue una corrección', mv.actualizado_por, A.uid);
  }

  // =====================================================================
  grupo('10 · No se puede escribir una venta salteando la RPC');
  // =====================================================================
  {
    rechazado('insertar una venta directamente',
      await H.intentar(db, A.uid, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, descuento, monto, costo_total, creado_por)
         values ($1, 'venta', current_date, 'Venta trucha', 'Ventas', 5000000, 0, 5000000, 0, $2)`,
        [A.empresaId, A.uid])),
      'policy|denied|permission');

    rechazado('insertar una venta con costo cero desde otro ángulo',
      await H.intentar(db, adminA, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, monto, subtotal, costo_total, creado_por)
         values ($1, 'venta', current_date, 999999, 999999, 0, $2)`,
        [A.empresaId, adminA])),
      'policy|denied|permission');

    // Buscamos una venta real para intentar ensuciarla.
    const alguna = (await db.query(
      "select id from public.movimientos where empresa_id=$1 and tipo='venta' and estado='activo' limit 1", [A.empresaId])).rows[0].id;

    rechazado('insertar un item con costo falso en una venta existente',
      await H.intentar(db, A.uid, () => db.query(
        `insert into public.movimiento_items (movimiento_id, empresa_id, nombre, cantidad, precio_unitario, costo_unitario)
         values ($1, $2, 'Item fantasma', 1, 100, 0)`,
        [alguna, A.empresaId])),
      'policy|denied|permission');

    rechazado('borrar los items de una venta',
      await H.intentar(db, A.uid, () => db.query('delete from public.movimiento_items where movimiento_id = $1', [alguna])),
      'policy|denied|permission');

    rechazado('borrar la venta entera (dejaría el stock descuadrado)',
      await H.intentar(db, A.uid, () => db.query('delete from public.movimientos where id = $1', [alguna])),
      'policy|denied|permission');

    rechazado('cambiar el monto de una venta a mano',
      await H.intentar(db, A.uid, () => db.query('update public.movimientos set monto = 1 where id = $1', [alguna])),
      'policy|denied|permission');

    rechazado('marcar una venta como anulada a mano (sin devolver stock)',
      await H.intentar(db, adminA, () => db.query(
        "update public.movimientos set estado='anulado', anulado_por=$2, anulado_at=now() where id = $1", [alguna, adminA])),
      'policy|denied|permission');
  }

  // =====================================================================
  grupo('11 · Gastos y otros ingresos siguen funcionando');
  // =====================================================================
  {
    const gasto = await H.intentar(db, vendedorA, () => db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, metodo_pago)
       values ($1, 'gasto', current_date, 'Nafta', 'Transporte', 120000, 120000, 'efectivo') returning id`,
      [A.empresaId]).then((r) => r.rows[0].id));
    aceptado('un vendedor puede cargar un gasto', gasto);
    ok('creado_por se completa solo', (await H.movimiento(db, gasto.valor)).creado_por, vendedorA);

    const ingreso = await H.intentar(db, A.uid, () => db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
       values ($1, 'ingreso', current_date, 'Aporte de socio', 'Otros', 50000, 50000) returning id`,
      [A.empresaId]).then((r) => r.rows[0].id));
    aceptado('se puede cargar otro ingreso', ingreso);

    rechazado('un gasto no puede llevar descuento',
      await H.intentar(db, A.uid, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, subtotal, descuento, monto)
         values ($1, 'gasto', current_date, 100, 20, 80)`, [A.empresaId])),
      'policy|denied|solo_venta');

    rechazado('un gasto no puede inventar costo de mercadería',
      await H.intentar(db, A.uid, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, subtotal, monto, costo_total)
         values ($1, 'gasto', current_date, 100, 100, 999)`, [A.empresaId])),
      'policy|denied|solo_venta');

    rechazado('no se puede cargar un gasto a nombre de otro',
      await H.intentar(db, vendedorA, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, subtotal, monto, creado_por)
         values ($1, 'gasto', current_date, 100, 100, $2)`, [A.empresaId, A.uid])),
      'policy|denied');

    rechazado('no se puede fechar un gasto en el futuro lejano',
      await H.intentar(db, A.uid, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, subtotal, monto)
         values ($1, 'gasto', current_date + 400, 100, 100)`, [A.empresaId])),
      'policy|denied|fecha');

    // El borde, no solo el caso absurdo. La policy tolera un día de más
    // porque el teléfono puede ir adelantado respecto de Asunción; dos ya
    // es plata que no entró. La pantalla de Organización tapa su fecha con
    // este mismo tope, y si alguien lo mueve acá tiene que romperse algo.
    rechazado('ni pasado mañana, que es el borde real',
      await H.intentar(db, A.uid, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, subtotal, monto)
         values ($1, 'gasto', current_date + 2, 100, 100)`, [A.empresaId])),
      'policy|denied|fecha');

    // Anulación de un gasto: sin stock, pero con la misma auditoría.
    const anul = await H.intentar(db, A.uid, () => db.query('select public.anular_movimiento($1, $2)', [gasto.valor, 'Cargado dos veces']));
    aceptado('un gasto también se anula', anul);
    ok('el gasto queda anulado', (await H.movimiento(db, gasto.valor)).estado, 'anulado');
  }

  // =====================================================================
  grupo('12 · Aislamiento entre empresas');
  // =====================================================================
  {
    const pB = await H.crearProducto(db, B.empresaId, B.uid, { nombre: 'Producto de B', costo: 10, precio: 20, stock: 5 });

    rechazado('A intenta vender un producto de B',
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ producto_id: pB, cantidad: 1 }])),
      'no pertenece a esta empresa');
    ok('el stock de B quedó intacto', await H.stockDe(db, pB), 5);

    rechazado('A intenta registrar una venta dentro de la empresa B',
      await H.intentar(db, A.uid, () => vender(db, B.empresaId, [{ nombre: 'X', cantidad: 1, precio_unitario: 10 }])),
      'No pertenecés a esta empresa');

    const ventaB = await H.intentar(db, B.uid, () => vender(db, B.empresaId, [{ producto_id: pB, cantidad: 1 }]));
    rechazado('A intenta anular una venta de B',
      await H.intentar(db, A.uid, () => db.query('select public.anular_movimiento($1, null)', [ventaB.valor])),
      'No pertenecés a esta empresa');

    await H.comoUsuario(db, A.uid, async () => {
      const m = await db.query('select count(*)::int n from public.movimientos where empresa_id = $1', [B.empresaId]);
      ok('A no ve ni un movimiento de B', m.rows[0].n, 0);
      const pr = await db.query('select count(*)::int n from public.productos where empresa_id = $1', [B.empresaId]);
      ok('A no ve ni un producto de B', pr.rows[0].n, 0);
      const it = await db.query('select count(*)::int n from public.movimiento_items where empresa_id = $1', [B.empresaId]);
      ok('A no ve ni un item de B', it.rows[0].n, 0);
      const em = await db.query('select count(*)::int n from public.empresas where id = $1', [B.empresaId]);
      ok('A no ve la empresa B', em.rows[0].n, 0);
    });

    rechazado('mover un movimiento de una empresa a otra',
      await H.intentar(db, A.uid, () => db.query(
        'update public.movimientos set empresa_id = $1 where empresa_id = $2', [B.empresaId, A.empresaId])),
      'policy|denied|permission|no puede cambiar de empresa');

    // Usuario sin ninguna empresa.
    await H.comoUsuario(db, externo, async () => {
      const e = await db.query('select count(*)::int n from public.empresas');
      ok('un usuario externo no ve ninguna empresa', e.rows[0].n, 0);
      const m = await db.query('select count(*)::int n from public.movimientos');
      ok('un usuario externo no ve ningún movimiento', m.rows[0].n, 0);
      const p = await db.query('select count(*)::int n from public.productos');
      ok('un usuario externo no ve ningún producto', p.rows[0].n, 0);
    });

    rechazado('un usuario externo intenta cargar un gasto en A',
      await H.intentar(db, externo, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, subtotal, monto) values ($1,'gasto',current_date,1,1)`,
        [A.empresaId])),
      'policy|denied');

    rechazado('un usuario externo intenta vender en A',
      await H.intentar(db, externo, () => vender(db, A.empresaId, [{ nombre: 'X', cantidad: 1, precio_unitario: 1 }])),
      'No pertenecés a esta empresa');

    rechazado('sin sesión no se puede vender',
      await H.intentar(db, null, () => vender(db, A.empresaId, [{ nombre: 'X', cantidad: 1, precio_unitario: 1 }])),
      'iniciar sesión');
  }

  // =====================================================================
  grupo('13 · Lo que puede y no puede un vendedor');
  // =====================================================================
  {
    const p = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Gorra', costo: 30, precio: 70, stock: 10 });

    const v = await H.intentar(db, vendedorA, () => vender(db, A.empresaId, [{ producto_id: p, cantidad: 1 }]));
    aceptado('un vendedor SÍ puede vender', v);
    ok('y eso mueve el stock', await H.stockDe(db, p), 9);

    const valorProducto = async (col) =>
      Number((await db.query(`select ${col} from public.productos where id = $1`, [p])).rows[0][col]);

    await sinEfecto('un vendedor NO puede cambiar el costo de un producto',
      await H.intentar(db, vendedorA, () => db.query('update public.productos set costo = 1 where id = $1', [p])),
      async () => await valorProducto('costo') === 30);

    await sinEfecto('un vendedor NO puede cambiar el precio del catálogo',
      await H.intentar(db, vendedorA, () => db.query('update public.productos set precio = 999999 where id = $1', [p])),
      async () => await valorProducto('precio') === 70);

    await sinEfecto('un vendedor NO puede inventar stock',
      await H.intentar(db, vendedorA, () => db.query('update public.productos set stock = 9999 where id = $1', [p])),
      async () => await valorProducto('stock') === 9);

    rechazado('un vendedor NO puede crear productos',
      await H.intentar(db, vendedorA, () => db.query(
        `insert into public.productos (empresa_id, nombre, costo, precio) values ($1, 'Trucho', 0, 100)`, [A.empresaId])),
      'policy|denied|permission');

    await sinEfecto('un vendedor NO puede borrar productos',
      await H.intentar(db, vendedorA, () => db.query('delete from public.productos where id = $1', [p])),
      async () => (await db.query('select count(*)::int n from public.productos where id=$1', [p])).rows[0].n === 1);

    rechazado('un vendedor NO puede definir el reto',
      await H.intentar(db, vendedorA, () => db.query(
        `insert into public.retos (empresa_id, nombre, meta, fecha_inicio, fecha_fin)
         values ($1, 'Meta trucha', 1, current_date, current_date)`, [A.empresaId])),
      'policy|denied|permission');

    await sinEfecto('un vendedor NO puede cambiar los datos de la empresa',
      await H.intentar(db, vendedorA, () => db.query("update public.empresas set nombre='Mía' where id=$1", [A.empresaId])),
      async () => (await db.query('select nombre from public.empresas where id=$1', [A.empresaId])).rows[0].nombre !== 'Mía');

    // Anulaciones: solo lo propio y solo del día.
    const propia = await H.intentar(db, vendedorA, () => vender(db, A.empresaId, [{ producto_id: p, cantidad: 1 }]));
    const anulPropia = await H.intentar(db, vendedorA, () => db.query('select public.anular_movimiento($1, null)', [propia.valor]));
    aceptado('un vendedor SÍ puede anular su venta del día', anulPropia);

    const ajena = await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ producto_id: p, cantidad: 1 }]));
    rechazado('un vendedor NO puede anular la venta de otro',
      await H.intentar(db, vendedorA, () => db.query('select public.anular_movimiento($1, null)', [ajena.valor])),
      'administrador');

    // Una venta suya pero de ayer: tampoco.
    const vieja = await H.intentar(db, vendedorA, () =>
      vender(db, A.empresaId, [{ producto_id: p, cantidad: 1 }], { fecha: '2026-08-01' }));
    rechazado('un vendedor NO puede anular su venta de días anteriores',
      await H.intentar(db, vendedorA, () => db.query('select public.anular_movimiento($1, null)', [vieja.valor])),
      'administrador');
    aceptado('pero un admin sí',
      await H.intentar(db, adminA, () => db.query('select public.anular_movimiento($1, $2)', [vieja.valor, 'Corrección'])));
  }

  // =====================================================================
  grupo('14 · Roles y escalada de privilegios');
  // =====================================================================
  {
    const rolDe = async (uid) =>
      (await db.query('select rol from public.miembros where empresa_id=$1 and user_id=$2', [A.empresaId, uid])).rows[0].rol;

    await sinEfecto('un vendedor se asciende a admin',
      await H.intentar(db, vendedorA, () => db.query(
        "update public.miembros set rol='admin' where empresa_id=$1 and user_id=$2", [A.empresaId, vendedorA])),
      async () => await rolDe(vendedorA) === 'vendedor');

    rechazado('un admin se asciende a propietario',
      await H.intentar(db, adminA, () => db.query(
        "update public.miembros set rol='propietario' where empresa_id=$1 and user_id=$2", [A.empresaId, adminA])),
      'tu propio rol|propiedad');

    rechazado('un admin nombra propietario a un tercero',
      await H.intentar(db, adminA, () => db.query(
        "update public.miembros set rol='propietario' where empresa_id=$1 and user_id=$2", [A.empresaId, vendedorA])),
      'propiedad');

    rechazado('un admin degrada al propietario',
      await H.intentar(db, adminA, () => db.query(
        "update public.miembros set rol='vendedor' where empresa_id=$1 and user_id=$2", [A.empresaId, A.uid])),
      'propietario');

    rechazado('un admin se muda a otra empresa',
      await H.intentar(db, adminA, () => db.query(
        'update public.miembros set empresa_id=$1 where empresa_id=$2 and user_id=$3', [B.empresaId, A.empresaId, adminA])),
      'policy|denied|no se puede mover');

    rechazado('un vendedor se suma solo a otra empresa',
      await H.intentar(db, vendedorA, () => db.query(
        `insert into public.miembros (empresa_id, user_id, nombre, rol) values ($1,$2,'Intruso','admin')`,
        [B.empresaId, vendedorA])),
      'policy|denied|permission');

    await sinEfecto('un admin se borra a sí mismo para reingresar como dueño',
      await H.intentar(db, adminA, () => db.query(
        'delete from public.miembros where empresa_id=$1 and user_id=$2', [A.empresaId, adminA])),
      async () => (await db.query('select count(*)::int n from public.miembros where empresa_id=$1 and user_id=$2', [A.empresaId, adminA])).rows[0].n === 1);

    aceptado('un admin SÍ puede cambiar el rol de un vendedor a admin',
      await H.intentar(db, A.uid, () => db.query(
        "update public.miembros set rol='admin' where empresa_id=$1 and user_id=$2", [A.empresaId, vendedorA])));
    // Lo dejamos como estaba para el resto de las pruebas.
    await db.query("update public.miembros set rol='vendedor' where empresa_id=$1 and user_id=$2", [A.empresaId, vendedorA]);
  }

  // =====================================================================
  grupo('15 · El plan de suscripción no se eleva desde el cliente');
  // =====================================================================
  {
    // Desde la 009 toda empresa nace con 14 días de prueba de `pro`. Por eso
    // la escalada que hay que probar es hacia `negocio`: intentar poner `pro`
    // cuando ya está en `pro` no cambia nada, el trigger no tiene qué frenar
    // y la prueba pasaría sin haber probado absolutamente nada.
    ok('la empresa arranca con la prueba de pro',
      (await db.query('select plan from public.empresas where id=$1', [A.empresaId])).rows[0].plan, 'pro');
    ok('y la suscripción queda en estado prueba',
      (await db.query('select estado from public.suscripciones where empresa_id=$1', [A.empresaId])).rows[0].estado, 'prueba');

    rechazado('el propietario intenta pasarse a negocio',
      await H.intentar(db, A.uid, () => db.query("update public.empresas set plan='negocio' where id=$1", [A.empresaId])),
      'sistema de suscripciones');

    rechazado('un admin intenta pasarse a negocio',
      await H.intentar(db, adminA, () => db.query("update public.empresas set plan='negocio' where id=$1", [A.empresaId])),
      'sistema de suscripciones');

    rechazado('cambiar el plan junto con el nombre para disimular',
      await H.intentar(db, A.uid, () => db.query("update public.empresas set nombre='Aurora SA', plan='negocio' where id=$1", [A.empresaId])),
      'sistema de suscripciones');

    rechazado('estirarse la prueba a mano',
      await H.intentar(db, A.uid, () => db.query(
        "update public.suscripciones set periodo_fin = now() + interval '10 years' where empresa_id=$1", [A.empresaId])),
      'policy|denied|permission');

    rechazado('escribir directo en la tabla de suscripciones',
      await H.intentar(db, A.uid, () => db.query("update public.suscripciones set plan='negocio' where empresa_id=$1", [A.empresaId])),
      'policy|denied|permission');

    rechazado('insertar una suscripción propia',
      await H.intentar(db, A.uid, () => db.query(
        "insert into public.suscripciones (empresa_id, plan) values ($1,'negocio')", [A.empresaId])),
      'policy|denied|permission');

    rechazado('llamar a aplicar_suscripcion desde el cliente',
      await H.intentar(db, A.uid, () => db.query("select public.aplicar_suscripcion($1,'negocio')", [A.empresaId])),
      'permission|denied|no existe|does not exist');

    rechazado('regalarse una prueba nueva',
      await H.intentar(db, A.uid, () => db.query("select public.iniciar_prueba($1)", [A.empresaId])),
      'permission|denied|no existe|does not exist');

    ok('sigue sin poder elegir su plan',
      (await db.query('select plan from public.empresas where id=$1', [A.empresaId])).rows[0].plan, 'pro');

    // El backend con clave de servicio sí puede.
    await db.query("select public.aplicar_suscripcion($1,'pro','activa',now(),now()+interval '30 days','manual')", [A.empresaId]);
    ok('el backend sí puede activar pro', (await db.query('select plan from public.empresas where id=$1', [A.empresaId])).rows[0].plan, 'pro');
    ok('y queda registrado en suscripciones',
      (await db.query('select plan, estado from public.suscripciones where empresa_id=$1', [A.empresaId])).rows[0].plan, 'pro');

    await H.comoUsuario(db, A.uid, async () => {
      const s = await db.query('select plan from public.suscripciones where empresa_id=$1', [A.empresaId]);
      ok('el usuario puede LEER su suscripción', s.rows[0].plan, 'pro');
    });
  }

  // =====================================================================
  grupo('16 · Identidad de la empresa');
  // =====================================================================
  {
    // Desde la 003 el código vive en empresa_accesos, que no tiene ninguna
    // policy de escritura: nadie lo puede cambiar desde el cliente.
    rechazado('cambiar el código de acceso a mano',
      await H.intentar(db, A.uid, () => db.query("update public.empresa_accesos set codigo='HACKEADO' where empresa_id=$1", [A.empresaId])),
      'policy|denied|permission');

    rechazado('crear un acceso propio para otra empresa',
      await H.intentar(db, A.uid, () => db.query(
        "insert into public.empresa_accesos (empresa_id, codigo) values ($1, 'MIOMIO01')", [B.empresaId])),
      'policy|denied|permission');

    // La 013 separó el mensaje de identidad en dos, para poder dejar pasar
    // el único caso legítimo: que la clave foránea ponga `creada_por` en null
    // cuando se borra esa cuenta. Apropiarse de una empresa sigue prohibido.
    rechazado('cambiar quién creó la empresa',
      await H.intentar(db, A.uid, () => db.query('update public.empresas set creada_por=$2 where id=$1', [A.empresaId, vendedorA])),
      'quién creó la empresa');

    rechazado('ponerse como creador de una empresa que no tiene creador',
      await H.intentar(db, A.uid, () => db.query('update public.empresas set creada_por=null where id=$1', [A.empresaId])
        .then(async () => {
          // Si el paso anterior pasara, el intento real sería reclamarla.
          await db.query('update public.empresas set creada_por=$2 where id=$1', [A.empresaId, vendedorA]);
        })),
      'quién creó la empresa|denied|policy');

    aceptado('cambiar el nombre y la moneda SÍ se puede',
      await H.intentar(db, A.uid, () => db.query("update public.empresas set nombre='Aurora Perfumes', moneda='USD' where id=$1", [A.empresaId])));
  }

  // =====================================================================
  grupo('17 · Concurrencia del stock');
  // =====================================================================
  {
    const p = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Mate', costo: 100, precio: 200, stock: 100 });
    // 20 ventas seguidas de 3 unidades: si el descuento fuera "leer, calcular, escribir"
    // el resultado sería impredecible. Con `stock = stock - cantidad` es exacto.
    for (let i = 0; i < 20; i++) {
      await H.intentar(db, A.uid, () => vender(db, A.empresaId, [{ producto_id: p, cantidad: 3 }]));
    }
    ok('stock tras 20 ventas de 3 unidades', await H.stockDe(db, p), 40);

    const total = await db.query(
      `select sum(i.cantidad)::float c from public.movimiento_items i
       join public.movimientos m on m.id = i.movimiento_id
       where i.producto_id = $1 and m.estado = 'activo'`, [p]);
    ok('unidades vendidas registradas', total.rows[0].c, 60);
    ok('stock inicial − vendido = stock actual', 100 - total.rows[0].c, await H.stockDe(db, p));
  }

  // =====================================================================
  grupo('17b · Cada cuenta decide su propio día');
  // =====================================================================
  //
  // Hasta la 032, media docena de lugares centrales preguntaban qué día es
  // en Asunción, sin importar dónde estuviera el negocio. Mientras todos los
  // clientes estuvieron en Paraguay no se notó — que es la forma más
  // peligrosa de un error.
  //
  // Las dos zonas de acá son los extremos del planeta: Kiritimati va +14 y
  // Midway −11. Veinticinco horas de diferencia, así que sus fechas locales
  // NUNCA coinciden, a ninguna hora del día. Eso hace que esta prueba no
  // dependa del momento en que se corra.
  {
    const lejos = await H.montarEmpresa(db, { email: 'lejos@a.com', nombre: 'Adelantada' });
    const atras = await H.montarEmpresa(db, { email: 'atras@a.com', nombre: 'Atrasada' });

    await db.query("update public.empresas set zona_horaria = 'Pacific/Kiritimati' where id = $1", [lejos.empresaId]);
    await db.query("update public.empresas set zona_horaria = 'Pacific/Midway' where id = $1", [atras.empresaId]);

    const hoyDe = async (id) =>
      (await db.query('select public.hoy_empresa($1) as d', [id])).rows[0].d;

    const dLejos = await hoyDe(lejos.empresaId);

    // La comparación se hace EN SQL a propósito. Hacerla en JavaScript sobre
    // el texto de las fechas ordena por el nombre del día —«Wed» contra
    // «Tue»— y da verdadero o falso según la semana, no según el dato.
    ok('dos negocios en extremos opuestos no están en el mismo día',
      (await db.query('select public.hoy_empresa($1) > public.hoy_empresa($2) as distinto',
        [lejos.empresaId, atras.empresaId])).rows[0].distinto, true);

    // El corazón del arreglo: la policy compara contra el día de LA EMPRESA.
    // Con la versión vieja, el «mañana» de Kiritimati era pasado mañana en
    // Asunción y esto se rechazaba.
    aceptado('la cuenta adelantada carga con su propio mañana',
      await H.intentar(db, lejos.uid, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
         values ($1, 'gasto', public.hoy_empresa($1) + 1, 'Gasto de mañana', 'Varios', 1000, 1000)`,
        [lejos.empresaId])));

    aceptado('y la atrasada también, con el suyo',
      await H.intentar(db, atras.uid, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
         values ($1, 'gasto', public.hoy_empresa($1) + 1, 'Gasto de mañana', 'Varios', 1000, 1000)`,
        [atras.empresaId])));

    // El borde sigue siendo un borde: un día más ya no.
    rechazado('pero ninguna puede saltar dos días',
      await H.intentar(db, lejos.uid, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
         values ($1, 'gasto', public.hoy_empresa($1) + 2, 'Pasado mañana', 'Varios', 1000, 1000)`,
        [lejos.empresaId])),
      'policy|denied|fecha');

    // La fecha por defecto ya no la pone Asunción: la pone el trigger de la
    // 032, con la zona de la empresa. Un `default` de columna no puede mirar
    // `empresa_id`, por eso hizo falta un trigger.
    await H.intentar(db, lejos.uid, () => db.query(
      `insert into public.movimientos (empresa_id, tipo, descripcion, categoria, subtotal, monto)
       values ($1, 'gasto', 'Sin fecha', 'Varios', 1000, 1000)`,
      [lejos.empresaId]));

    const sinFecha = (await db.query(
      "select fecha from public.movimientos where empresa_id = $1 and descripcion = 'Sin fecha'",
      [lejos.empresaId])).rows[0].fecha;

    ok('sin fecha, se completa con el día de la empresa',
      String(sinFecha), String(dLejos));

    // Y una venta, que pasa por otra puerta: registrar_venta valida el rango
    // por su cuenta, así que tenía el mismo error por duplicado.
    const prodLejos = await H.crearProducto(db, lejos.empresaId, lejos.uid,
      { nombre: 'Producto lejano', costo: 100, precio: 200, stock: 10 });

    aceptado('una venta también se fecha con el día de su empresa',
      await H.intentar(db, lejos.uid, () => db.query(
        `select public.registrar_venta($1, $2::jsonb, public.hoy_empresa($1) + 1) as id`,
        [lejos.empresaId, JSON.stringify([{ producto_id: prodLejos, cantidad: 1, precio_unitario: 200 }])])));

    rechazado('y tampoco puede irse dos días',
      await H.intentar(db, lejos.uid, () => db.query(
        `select public.registrar_venta($1, $2::jsonb, public.hoy_empresa($1) + 2) as id`,
        [lejos.empresaId, JSON.stringify([{ producto_id: prodLejos, cantidad: 1, precio_unitario: 200 }])])),
      'fecha');
  }

  // =====================================================================
  grupo('18 · Invariante global: nada quedó descuadrado');
  // =====================================================================
  {
    const desc = await db.query(`
      select count(*)::int n from public.movimientos m
      where m.tipo = 'venta'
        and abs(m.subtotal - coalesce((
          select sum(i.cantidad * i.precio_unitario) from public.movimiento_items i where i.movimiento_id = m.id
        ), 0)) > 0.01`);
    ok('ninguna venta tiene el subtotal distinto a la suma de sus items', desc.rows[0].n, 0);

    const costo = await db.query(`
      select count(*)::int n from public.movimientos m
      where m.tipo = 'venta'
        and abs(m.costo_total - coalesce((
          select sum(i.cantidad * i.costo_unitario) from public.movimiento_items i where i.movimiento_id = m.id
        ), 0)) > 0.01`);
    ok('ninguna venta tiene el costo distinto a la suma de sus items', costo.rows[0].n, 0);

    const total = await db.query(
      'select count(*)::int n from public.movimientos where monto <> subtotal - descuento');
    ok('en ninguna fila monto ≠ subtotal − descuento', total.rows[0].n, 0);

    const sinItems = await db.query(`
      select count(*)::int n from public.movimientos m
      where m.tipo='venta' and not exists (select 1 from public.movimiento_items i where i.movimiento_id = m.id)`);
    ok('ninguna venta quedó sin items', sinItems.rows[0].n, 0);

    const huerfanos = await db.query(`
      select count(*)::int n from public.movimiento_items i
      join public.movimientos m on m.id = i.movimiento_id
      where i.empresa_id <> m.empresa_id`);
    ok('ningún item pertenece a otra empresa que su movimiento', huerfanos.rows[0].n, 0);

    const anuladas = await db.query(`
      select count(*)::int n from public.movimientos
      where estado='anulado' and (anulado_por is null or anulado_at is null)`);
    ok('toda anulación tiene autor y fecha', anuladas.rows[0].n, 0);
  }

  console.log(`\n${'═'.repeat(62)}`);
  if (fallos === 0) {
    console.log(`>>> ${corridas} COMPROBACIONES DE INTEGRIDAD PASARON`);
  } else {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES FALLARON`);
  }
  process.exit(fallos ? 1 : 0);
}

principal().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message ?? e);
  console.error(e.stack);
  process.exit(1);
});
