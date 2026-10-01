/**
 * «También vendo productos» (migración 121, 01/10/2026).
 *
 * Matías: «¿Qué pasa si un profesor de tenis vende raquetas, pelotas…? ¿Cómo
 * va a saber su ganancia de eso?». Un interruptor en Ajustes le prende al
 * profe y al trainer Productos y Vender; el panel, los reportes y el Excel
 * separan lo de las clases de lo de los productos.
 *
 * El caso: «Tenis manía». En un día cobra la inscripción de Juan (400.000),
 * le vende 2 raquetas (350.000, costo 200.000) y 4 tubos de pelotas (25.000,
 * costo 10.000) con 20.000 de descuento, cobra una clase suelta (100.000) y
 * una «Clase de prueba» que quedó en el catálogo como servicio, sin stock
 * (50.000). Gasta 1.000.000 en la compra de las raquetas (Mercadería) y
 * 300.000 de alquiler de la cancha.
 *
 * LO QUE SE PRUEBA (cada número es el grupo del mismo número, abajo)
 *
 *   1. El interruptor: la columna nace en false (también en una base que ya
 *      tenía cuentas), la cambian el dueño y un administrador, no un
 *      vendedor ni otra empresa, y proteger_empresa sigue frenando lo suyo.
 *   2. productos_del_periodo: vendido, costo, ganancia, margen, unidades y
 *      operaciones, con el descuento repartido. NO cuenta el cobro de una
 *      inscripción, una venta suelta ni un servicio del catálogo. El
 *      vendedor ve lo vendido sin costo; un ajeno no lee; un rango inválido
 *      se rechaza.
 *   3. panel_profe: cobrado y gastado iguales a los de la 116; productos y
 *      lo cobrado de las clases. Sin productos, el JSON es el de la 116 más
 *      productos en cero y cobrado_clases igual a lo vendido.
 *   4. reporte_alumnos: lo cobrado por clase y lo cobrado a cada alumno sin
 *      la raqueta; la lista por producto. Sin productos, el de la 116.
 *   5. La regla de la 106 con un profe: la compra de mercadería no resta,
 *      la ganancia neta es la de verdad (la que usa el panel).
 *   6. Apagar no borra nada; anular una venta devuelve el stock y la saca;
 *      empezar de cero no toca el interruptor. El trainer, igual.
 *   7. Lo que ya estaba: una base hasta la 120 con un profe que tiene
 *      productos con stock; la 121 lo lista y no le prende nada.
 *   8. Permisos, search_path, copia exacta de la 116 y sin \u en el SQL.
 *   9. El servicio interno «Clase» (Gs. 0) que deja cada inscripción no
 *      aparece en Productos, en Vender ni en el botón de Ajustes: el catálogo
 *      del profe es solo de productos con stock (`catalogoVisible`).
 *  10. El resto del reparto del descuento no es plata: lo de las clases nunca
 *      queda en -1e-15 («Gs. -0») ni una venta al costo en «perdiste Gs. 0».
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
  else console.log(`  ✓ ${nombre} → ${a.length > 140 ? `${a.slice(0, 137)}…` : a}`);
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

// Las worktrees traen CRLF: se normaliza antes de buscar nada.
const leer = (ruta) => fs.readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const archivo = (prefijo) => `supabase/migrations/${H.migraciones().find((f) => f.startsWith(prefijo))}`;

/** Una función de un .sql, desde su `create or replace` hasta su `grant`. */
const funcion = (sql, nombre, fin) => {
  const i = sql.indexOf(`create or replace function public.${nombre}(`);
  if (i < 0) throw new Error(`no encontré ${nombre}`);
  return sql.slice(i, sql.indexOf(fin, i) + fin.length);
};
const FIN_PANEL = 'grant execute on function public.panel_profe(uuid, date, date) to authenticated;';
const FIN_REPORTE = 'grant execute on function public.reporte_alumnos(uuid, date, date) to authenticated;';

/** La 116 de una función, con otro nombre, para comparar en la misma base. */
const comoLa116 = (sql116, nombre, fin) => funcion(sql116, nombre, fin)
  .split(`public.${nombre}(`).join(`public.${nombre}_116(`);

const sinClaves = (o, claves) => {
  const c = JSON.parse(JSON.stringify(o));
  for (const k of claves) delete c[k];
  return c;
};
const num = (v) => Math.round(Number(v) * 100) / 100;

/** Ayudantes contra una base y una empresa. */
function ayudantes(db, P) {
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(`${sql} → ${r.error}`);
    return r.valor.rows[0];
  };
  const j = async (sql, args, uid = P.uid) => (await valor(uid, sql, args)).j;
  const uno = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const hoy = async () => (await uno('select public.hoy_empresa($1)::text d', [P.empresaId])).d;
  const cliente = async (nombre, tel) => (await valor(P.uid,
    'select public.guardar_cliente($1,$2,$3,$4,$5) id', [P.empresaId, nombre, tel, '', null])).id;
  const inscribir = async (c, dia, total, pagado = true) => valor(P.uid,
    'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) j',
    [P.empresaId, c, [0, 1, 2, 3, 4, 5, 6], '17:00', '18:00', dia, dia, null, total, pagado, 'efectivo', null, 'Tenis', null, true]);
  const vender = async (items, extra = {}) => (await valor(P.uid,
    `select public.registrar_venta(p_empresa => $1, p_items => $2::jsonb, p_descuento => $3, p_cliente => $4) id`,
    [P.empresaId, JSON.stringify(items), extra.descuento ?? 0, extra.cliente ?? null])).id;
  const gasto = (dia, descripcion, categoria, monto) => como(P.uid,
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, metodo_pago, creado_por)
     values ($1,'gasto',$2,$3,$4,$5,$5,'efectivo',auth.uid())`, [P.empresaId, dia, descripcion, categoria, monto]);
  const panel = (dia, uid) => j('select public.panel_profe($1,$2,$2) j', [P.empresaId, dia], uid);
  const panel116 = (dia, uid) => j('select public.panel_profe_116($1,$2,$2) j', [P.empresaId, dia], uid);
  const reporte = (dia, uid) => j('select public.reporte_alumnos($1,$2,$2) j', [P.empresaId, dia], uid);
  const reporte116 = (dia, uid) => j('select public.reporte_alumnos_116($1,$2,$2) j', [P.empresaId, dia], uid);
  const productos = (dia, uid) => j('select public.productos_del_periodo($1,$2,$2) j', [P.empresaId, dia], uid);
  const resumen = (dia) => j('select public.resumen_financiero($1,$2,$2) j', [P.empresaId, dia]);
  const interruptor = async () => (await uno('select vende_productos v from public.empresas where id = $1', [P.empresaId])).v;
  const prender = async (uid, v) => {
    const r = await como(uid, 'update public.empresas set vende_productos = $2 where id = $1 returning id', [P.empresaId, v]);
    return r.ok ? r.valor.rows.length : r.error;
  };
  return { como, valor, j, uno, hoy, cliente, inscribir, vender, gasto, panel, panel116, reporte, reporte116, productos, resumen, interruptor, prender };
}

(async () => {
  const t0 = Date.now();
  const db = await H.crearBase();
  const sql116 = leer(archivo('116'));
  const sql121 = leer(archivo('121'));
  // Las de la 116 con otro nombre, en la misma base: así se compara contra
  // «lo de hoy» con los mismos datos y los mismos ids.
  await db.exec(comoLa116(sql116, 'panel_profe', FIN_PANEL));
  await db.exec(comoLa116(sql116, 'reporte_alumnos', FIN_REPORTE));
  console.log(`base con la 121 en ${Math.round((Date.now() - t0) / 1000)} s`);

  const P = await H.montarEmpresa(db, { email: 'tenis@mania.com', nombre: 'Tenis manía', rubro: 'clases' });
  const A = ayudantes(db, P);
  const hoy = await A.hoy();

  // ═══════════════════════════════════════════════════════════
  grupo('1 · El interruptor');
  // ═══════════════════════════════════════════════════════════
  const col = await A.uno(`select data_type, is_nullable, column_default from information_schema.columns
                           where table_schema = 'public' and table_name = 'empresas' and column_name = 'vende_productos'`);
  ok('empresas.vende_productos: boolean, no nulo, en false', [col.data_type, col.is_nullable, col.column_default], ['boolean', 'NO', 'false']);
  ok('un profe nuevo lo tiene apagado', await A.interruptor(), false);

  await db.query('update public.suscripciones set tope_vendedores = 2 where empresa_id = $1', [P.empresaId]);
  const vendedor = await H.sumarMiembro(db, P.empresaId, 'ayudante@mania.com', 'vendedor');
  const admin = await H.sumarMiembro(db, P.empresaId, 'socia@mania.com', 'admin');
  const Otro = await H.montarEmpresa(db, { email: 'otro@club.com', nombre: 'Otro club', rubro: 'clases' });

  ok('el dueño lo prende (1 fila)', await A.prender(P.uid, true), 1);
  ok('queda prendido', await A.interruptor(), true);
  ok('un vendedor no lo puede apagar (0 filas)', await A.prender(vendedor, false), 0);
  ok('otra empresa tampoco (0 filas)', await A.prender(Otro.uid, false), 0);
  ok('sigue prendido', await A.interruptor(), true);
  ok('un administrador sí (1 fila)', await A.prender(admin, false), 1);
  ok('el dueño lo vuelve a prender', await A.prender(P.uid, true), 1);
  rechazado('proteger_empresa sigue frenando el tipo de cuenta',
    await A.como(P.uid, `update public.empresas set tipo_cuenta = 'personal' where id = $1`, [P.empresaId]), 'tipo de cuenta');
  rechazado('y el plan',
    await A.como(P.uid, `update public.empresas set plan = 'negocio' where id = $1`, [P.empresaId]), 'plan');

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Lo vendido del catálogo (productos_del_periodo)');
  // ═══════════════════════════════════════════════════════════
  const raqueta = await H.crearProducto(db, P.empresaId, P.uid, { nombre: 'Raqueta', costo: 200000, precio: 350000, stock: 5 });
  const pelotas = await H.crearProducto(db, P.empresaId, P.uid, { nombre: 'Tubo de pelotas', costo: 10000, precio: 25000, stock: 50 });
  // Un servicio del catálogo, sin stock: lo que quedó de antes de la 090.
  const servicio = await H.crearProducto(db, P.empresaId, P.uid, { nombre: 'Clase de prueba', costo: 0, precio: 50000, controla_stock: false });

  const juan = await A.cliente('Juan', '0981111111');
  await A.inscribir(juan, hoy, 400000, true);
  const paq = (await db.query('select id, movimiento_id from public.paquetes where cliente_id = $1', [juan])).rows[0];
  ok('la inscripción quedó cobrada', Boolean(paq.movimiento_id), true);
  await A.valor(P.uid, 'select public.dar_clase($1, 1, $2) j', [paq.id, hoy]);

  const venta = await A.vender([{ producto_id: raqueta, cantidad: 2 }, { producto_id: pelotas, cantidad: 4 }], { descuento: 20000, cliente: juan });
  await A.vender([{ nombre: 'Clase suelta', cantidad: 1, precio_unitario: 100000 }]);
  await A.vender([{ producto_id: servicio, cantidad: 1 }]);
  await A.gasto(hoy, 'Raquetas', 'Mercadería', 1000000);
  await A.gasto(hoy, 'Cancha', 'Alquiler', 300000);
  ok('el stock bajó', [await H.stockDe(db, raqueta), await H.stockDe(db, pelotas)], [3, 46]);

  const pr = await A.productos(hoy);
  ok('vendido, costo y ganancia (con los 20.000 de descuento repartidos)',
    [num(pr.vendido), num(pr.costo), num(pr.ganancia)], [780000, 440000, 340000]);
  ok('unidades y operaciones', [num(pr.unidades), pr.operaciones], [6, 1]);
  ok('margen sobre lo vendido', Math.round(Number(pr.margen) * 10) / 10, 43.6);
  ok('por producto: nombre, unidades, vendido, costo, ganancia',
    pr.lista.map((x) => [x.nombre, num(x.unidades), num(x.vendido), num(x.costo), num(x.ganancia)]),
    [['Raqueta', 2, 682500, 400000, 282500], ['Tubo de pelotas', 4, 97500, 40000, 57500]]);
  ok('la lista lleva el id de cada producto', pr.lista.map((x) => x.producto_id), [raqueta, pelotas]);
  ok('ni la inscripción, ni la clase suelta, ni el servicio del catálogo son productos',
    pr.lista.some((x) => /Clase|Tenis/.test(x.nombre)), false);

  const prV = await A.productos(hoy, vendedor);
  ok('el vendedor ve lo vendido, sin costo, ganancia ni margen',
    [num(prV.vendido), prV.costo, prV.ganancia, prV.margen, prV.lista.map((x) => [x.costo, x.ganancia])],
    [780000, null, null, null, [[null, null], [null, null]]]);
  rechazado('otra empresa no lee',
    await A.como(Otro.uid, 'select public.productos_del_periodo($1,$2,$2) j', [P.empresaId, hoy]), 'No pertenecés');
  rechazado('un rango al revés se rechaza',
    await A.como(P.uid, `select public.productos_del_periodo($1, $2::date, $2::date - 1) j`, [P.empresaId, hoy]), 'rango');
  const ayer = await A.productos((await A.uno('select ($1::date - 1)::text d', [hoy])).d);
  ok('un día sin ventas: todo en cero y la lista vacía',
    [num(ayer.vendido), num(ayer.costo), num(ayer.ganancia), ayer.margen, ayer.lista], [0, 0, 0, null, []]);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · El panel del profe');
  // ═══════════════════════════════════════════════════════════
  const pa = await A.panel(hoy);
  const pa116 = await A.panel116(hoy);
  ok('cobrado y gastado, como en la 116', [num(pa.cobrado), num(pa.gastado)], [num(pa116.cobrado), num(pa116.gastado)]);
  ok('cobrado: todo lo que entró', [num(pa.cobrado), num(pa.gastado)], [1330000, 1300000]);
  ok('lo vendido del catálogo, aparte', [num(pa.productos.vendido), num(pa.productos.ganancia)], [780000, 340000]);
  ok('lo cobrado de las clases: inscripción + clase suelta + servicio', num(pa.cobrado_clases), 550000);
  ok('el resto del panel es el de la 116, letra por letra',
    sinClaves(pa, ['productos', 'cobrado_clases']), pa116);
  const paV = await A.panel(hoy, vendedor);
  ok('al vendedor, sin costo ni ganancia', [num(paV.productos.vendido), paV.productos.costo, paV.productos.ganancia], [780000, null, null]);

  // Sin productos: el profe de inglés que nunca vendió nada.
  const Q = await H.montarEmpresa(db, { email: 'ingles@profe.com', nombre: 'Inglés con Ana', rubro: 'clases' });
  const B = ayudantes(db, Q);
  const ana = await B.cliente('Ana', '0982222222');
  await B.inscribir(ana, hoy, 300000, true);
  await B.gasto(hoy, 'Libros', 'Materiales', 90000);
  const pb = await B.panel(hoy);
  ok('sin productos: productos en cero',
    [num(pb.productos.vendido), num(pb.productos.costo), num(pb.productos.ganancia), pb.productos.lista], [0, 0, 0, []]);
  ok('y lo cobrado de las clases es todo lo vendido', num(pb.cobrado_clases), 300000);
  ok('el resto, igual al de la 116', sinClaves(pb, ['productos', 'cobrado_clases']), await B.panel116(hoy));

  // ═══════════════════════════════════════════════════════════
  grupo('4 · El reporte de alumnos');
  // ═══════════════════════════════════════════════════════════
  const re = await A.reporte(hoy);
  const re116 = await A.reporte116(hoy);
  ok('cobrado, como en la 116 (todas las ventas)', [num(re.cobrado), num(re116.cobrado)], [1330000, 1330000]);
  ok('lo cobrado de las clases es el mismo del panel', num(re.cobrado_clases), num(pa.cobrado_clases));
  ok('cobrado − clases = lo vendido del catálogo', num(re.cobrado) - num(re.cobrado_clases), num(re.productos.vendido));
  ok('cobrado por clase: solo lo de las clases (antes contaba las raquetas)',
    [num(re.cobrado_por_clase), num(re116.cobrado_por_clase)], [550000, 1330000]);
  ok('lo cobrado a Juan: su inscripción, sin las raquetas que se le vendieron',
    [re.alumnos.map((a) => [a.nombre, num(a.cobrado)]), re116.alumnos.map((a) => [a.nombre, num(a.cobrado)])],
    [[['Juan', 400000]], [['Juan', 1180000]]]);
  ok('la lista por producto', re.productos.lista.map((x) => x.nombre), ['Raqueta', 'Tubo de pelotas']);
  ok('cobrado por paquete y por materia no cambian', [re.por_paquete, re.por_materia], [re116.por_paquete, re116.por_materia]);
  const comoEn116 = sinClaves(re, ['productos', 'cobrado_clases', 'cobrado_por_clase', 'alumnos']);
  ok('todo lo demás, igual al de la 116', comoEn116, sinClaves(re116, ['cobrado_por_clase', 'alumnos']));
  const rb = await B.reporte(hoy);
  ok('sin productos: cobrado_clases = cobrado, y productos en cero',
    [num(rb.cobrado_clases), num(rb.cobrado), num(rb.productos.vendido)], [300000, 300000, 0]);
  ok('sin productos: el reporte es el de la 116', sinClaves(rb, ['productos', 'cobrado_clases']), await B.reporte116(hoy));

  // ═══════════════════════════════════════════════════════════
  grupo('5 · La regla de la 106, con un profe');
  // ═══════════════════════════════════════════════════════════
  const rs = await A.resumen(hoy);
  ok('con costo cargado, la compra de mercadería va aparte',
    [rs.mercaderia_aparte, num(rs.compras_mercaderia), num(rs.gastos)], [true, 1000000, 300000]);
  ok('costo de lo vendido = el de los productos (las clases van a costo 0)', num(rs.costo_mercaderia), 440000);
  ok('ganancia neta: 1.330.000 − 440.000 − 300.000 (antes el panel decía 30.000)',
    [num(rs.ganancia_neta), num(pa.cobrado) - num(pa.gastado)], [590000, 30000]);
  const rsB = await B.resumen(hoy);
  ok('sin productos, la ganancia neta es cobrado − gastado (el «Te queda» de siempre)',
    num(rsB.ganancia_neta), num(pb.cobrado) - num(pb.gastado));

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Apagar no borra nada; anular devuelve; el trainer');
  // ═══════════════════════════════════════════════════════════
  const cuantos = async () => Number((await A.uno('select count(*)::int n from public.productos where empresa_id = $1 and activo', [P.empresaId])).n);
  const antesDeApagar = await cuantos();
  ok('se apaga', await A.prender(P.uid, false), 1);
  ok('los productos siguen ahí, con su stock', [await cuantos(), await H.stockDe(db, raqueta)], [antesDeApagar, 3]);
  ok('la venta sigue activa', (await A.uno('select estado from public.movimientos where id = $1', [venta])).estado, 'activo');
  ok('y sigue en el panel y en el reporte',
    [num((await A.panel(hoy)).productos.vendido), num((await A.reporte(hoy)).productos.vendido)], [780000, 780000]);
  ok('al prenderlo de nuevo, todo igual', [await A.prender(P.uid, true), num((await A.productos(hoy)).vendido)], [1, 780000]);
  await A.valor(P.uid, 'select public.anular_movimiento($1, $2)', [venta, 'Se cargó mal']);
  ok('anular la venta devuelve el stock', [await H.stockDe(db, raqueta), await H.stockDe(db, pelotas)], [5, 50]);
  const tras = await A.panel(hoy);
  ok('y la saca de los productos y de lo cobrado', [num(tras.productos.vendido), num(tras.cobrado_clases), num(tras.cobrado)], [0, 550000, 550000]);

  // El trainer: la proteína.
  const T = await H.montarEmpresa(db, { email: 'trainer@fit.com', nombre: 'Fit con Leo', rubro: 'entrenamiento' });
  const C = ayudantes(db, T);
  const proteina = await H.crearProducto(db, T.empresaId, T.uid, { nombre: 'Proteína', costo: 150000, precio: 220000, stock: 10 });
  const marta = await C.cliente('Marta', '0983333333');
  await C.inscribir(marta, hoy, 500000, true);
  await C.vender([{ producto_id: proteina, cantidad: 2 }], { cliente: marta });
  const pt = await C.panel(hoy);
  ok('el trainer: la proteína aparte de sus sesiones',
    [num(pt.cobrado), num(pt.cobrado_clases), num(pt.productos.vendido), num(pt.productos.ganancia)], [940000, 500000, 440000, 140000]);

  // Empezar de cero es borrar los datos, no los ajustes: el interruptor queda.
  ok('el trainer lo prende', await C.prender(T.uid, true), 1);
  const vacio = await C.como(T.uid, 'select public.vaciar_empresa($1, $2) r', [T.empresaId, 'Fit con Leo']);
  ok('empezar de cero anda', vacio.ok || vacio.error, true);
  ok('y el interruptor sigue prendido', await C.interruptor(), true);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Lo que ya estaba (una base hasta la 120)');
  // ═══════════════════════════════════════════════════════════
  const vieja = await H.crearBase({ hasta: '120' });
  const V = await H.montarEmpresa(vieja, { email: 'viejo@tenis.com', nombre: 'Tenis de antes', rubro: 'clases' });
  await H.crearProducto(vieja, V.empresaId, V.uid, { nombre: 'Grip', costo: 5000, precio: 15000, stock: 20 });
  await H.crearProducto(vieja, V.empresaId, V.uid, { nombre: 'Clase', costo: 0, precio: 80000, controla_stock: false });
  const Alm = await H.montarEmpresa(vieja, { email: 'kiosco@x.com', nombre: 'Kiosco', rubro: 'comercio' });
  await H.crearProducto(vieja, Alm.empresaId, Alm.uid, { nombre: 'Yerba', costo: 10000, precio: 15000, stock: 20 });
  ok('antes de la 121 la columna no existe',
    Number((await vieja.query(`select count(*)::int n from information_schema.columns
      where table_name = 'empresas' and column_name = 'vende_productos'`)).rows[0].n), 0);
  const avisos = [];
  await vieja.exec(sql121, { onNotice: (x) => avisos.push(x.message) });
  ok('la 121 lista al profe que ya tenía productos con stock (y a nadie más)',
    avisos.filter((m) => m.startsWith('121:')),
    ['121: «Tenis de antes» da clases y tiene 1 productos con stock: el interruptor queda apagado (se prende en Ajustes).']);
  ok('y no le prende nada: todas las cuentas en false',
    (await vieja.query('select bool_or(vende_productos) b, count(*)::int n from public.empresas')).rows[0], { b: false, n: 2 });
  const avisos2 = [];
  await vieja.exec(sql121, { onNotice: (x) => avisos2.push(x.message) });
  ok('aplicarla dos veces: lo mismo, una función de cada una',
    [avisos2.filter((m) => m.startsWith('121:')).length,
      Number((await vieja.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('productos_del_periodo','panel_profe','reporte_alumnos')`)).rows[0].n)], [1, 3]);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Permisos, search_path y copia exacta');
  // ═══════════════════════════════════════════════════════════
  const FUNCIONES = ['productos_del_periodo(uuid,date,date)', 'panel_profe(uuid,date,date)', 'reporte_alumnos(uuid,date,date)'];
  const permisos = [];
  for (const f of FUNCIONES) {
    const r = (await db.query(
      `select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') b,
              has_function_privilege('public', $1, 'execute') c, p.prosecdef, p.provolatile, array_to_string(p.proconfig, ',') cfg
       from pg_proc p where p.oid = $1::regprocedure`, [`public.${f}`])).rows[0];
    permisos.push([f, r.a, r.b, r.c, r.prosecdef, r.provolatile, r.cfg]);
  }
  ok('solo authenticated; definer, stable, con su search_path',
    permisos, FUNCIONES.map((f) => [f, false, true, false, true, 's', 'search_path=public']));

  // Copia exacta: sacando lo marcado «(121)», cada función es la de la 116.
  const panel121 = funcion(sql121, 'panel_profe', FIN_PANEL)
    .replace('  -- (121)\n  v_productos jsonb;\n', '')
    .replace(/  -- \(121\) Lo vendido del catálogo[\s\S]*?v_productos := public\.productos_del_periodo\(p_empresa, p_desde, p_hasta\);\n/, '')
    .replace(/,\n    -- \(121\) La raqueta[\s\S]*?(?=\n  \) into v_res;)/, '');
  igual('panel_profe: la de la 116 más lo marcado (121)', panel121, funcion(sql116, 'panel_profe', FIN_PANEL));
  const reporte121 = funcion(sql121, 'reporte_alumnos', FIN_REPORTE)
    .replace('  -- (121)\n  v_dec  integer;\n', '')
    .replace(/  -- \(121\) Lo de los productos, redondeado a la moneda[\s\S]*?v_dec := coalesce\(\(select public\.decimales_de\(moneda\) from public\.empresas where id = p_empresa\), 2\);\n/, '')
    .replace(/  -- \(121\) Lo que de cada venta es un producto[\s\S]*?\n  \),\n(?=  fiado as \()/, '')
    .replace(/-- \(121\) Lo cobrado de sus clases[^\n]*\n {11}coalesce\(\(select round\(sum\(v\.monto - coalesce\(pr\.neto, 0\)\), v_dec\) from ventas v\n {21}left join prod pr on pr\.movimiento_id = v\.id\n {21}where v\.cliente_id = c\.id\), 0\) as cobrado,/,
      'coalesce((select sum(v.monto) from ventas v where v.cliente_id = c.id), 0) as cobrado,')
    .replace(/ {4}-- \(121\) Lo cobrado de las clases: todo lo cobrado[\s\S]*?'cobrado_clases', [^\n]*\n/, '')
    .replace(/-- \(121\) Por clase cuenta solo lo de las clases\.\n {18}then \(coalesce\(\(select sum\(monto\) from ventas\), 0\) - round\(coalesce\(\(select sum\(neto\) from prod\), 0\), v_dec\)\) \/ sum\(k\.cantidad\)/,
      'then coalesce((select sum(monto) from ventas), 0) / sum(k.cantidad)')
    .replace(/,\n {4}-- \(121\) El catálogo del período, aparte de las clases\.\n {4}'productos', public\.productos_del_periodo\(p_empresa, p_desde, p_hasta\)(?=\n  \) into v_res;)/, '');
  igual('reporte_alumnos: la de la 116 más lo marcado (121)', reporte121, funcion(sql116, 'reporte_alumnos', FIN_REPORTE));
  ok('la 121 no manda \\u en el SQL', /\\u[0-9a-fA-F]{4}/.test(sql121), false);
  ok('ni toca proteger_empresa, registrar_venta ni resumen_financiero',
    ['proteger_empresa', 'registrar_venta', 'resumen_financiero'].filter((f) => sql121.includes(`function public.${f}(`)), []);
  ok('ni lo de la 119 y la 120',
    ['agenda_calendario', 'mi_profesional', 'comienzo_de_hoy', 'eliminar_cliente', 'lista_clientes']
      .filter((f) => sql121.includes(`function public.${f}(`)), []);
  // Los dos mensajes de productos_del_periodo ya tienen su portugués.
  const mensajes = leer('src/lib/mensajes-base.ts');
  ok('sus mensajes de error ya están traducidos',
    ['No pertenecés a esta empresa.', 'El rango de fechas no es válido.'].map((m) => mensajes.includes(m)), [true, true]);

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Productos y Vender, sin el servicio interno «Clase»');
  // ═══════════════════════════════════════════════════════════
  // inscribir_alumno (108) llama a profe_y_clase (091), que deja en
  // `productos` un servicio «Clase» a precio 0, sin stock y activo. Las
  // pantallas lo esconden con la ficha (`catalogoVisible`, rubros.ts): el
  // catálogo del profe y del trainer es solo de productos con stock.
  const { catalogoVisible, catalogoSoloConStock, fichaDeLaCuenta } = require('../.compilado/rubros.js');
  const filaEmpresa = (id) => A.uno('select rubro, tipo_cuenta, vende_productos from public.empresas where id = $1', [id]);
  const catalogo = async (E, pausados = false) => {
    const r = await H.intentar(db, E.uid, () => db.query('select public.listar_productos($1, $2) j', [E.empresaId, pausados]));
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0].j ?? [];
  };
  const nombres = (lista) => lista.map((x) => x.nombre).sort();

  const deP = await catalogo(P, true);
  const claseP = deP.find((x) => x.nombre === 'Clase');
  ok('la inscripción le dejó a la base el servicio «Clase» (Gs. 0, sin stock, activo)',
    claseP ? [Number(claseP.precio), claseP.controla_stock, claseP.activo] : null, [0, false, true]);
  const fichaP = fichaDeLaCuenta(await filaEmpresa(P.empresaId));
  ok('con el interruptor prendido tiene Productos y Vender', [fichaP.secciones['/productos'], fichaP.secciones['/vender']], [true, true]);
  ok('y su catálogo es solo de productos con stock', catalogoSoloConStock(fichaP), true);
  ok('Productos (con los pausados) no muestra «Clase» ni el servicio viejo', nombres(catalogoVisible(fichaP, deP)), ['Raqueta', 'Tubo de pelotas']);
  ok('Vender y la voz (los activos), tampoco', nombres(catalogoVisible(fichaP, await catalogo(P))), ['Raqueta', 'Tubo de pelotas']);
  const activos = async (soloStock) => Number((await A.uno(
    `select count(*)::int n from public.productos where empresa_id = $1 and activo${soloStock ? ' and controla_stock' : ''}`, [P.empresaId])).n);
  ok('el botón de Ajustes cuenta lo mismo que Productos (sin el filtro contaba la «Clase» y el servicio)',
    [await activos(true), await activos(false)], [2, 4]);

  // Un profe que recién lo prende y solo inscribió: no tiene nada que vender.
  const N = await H.montarEmpresa(db, { email: 'padel@leo.com', nombre: 'Pádel con Leo', rubro: 'clases' });
  const NB = ayudantes(db, N);
  await NB.inscribir(await NB.cliente('Leo', '0984444444'), hoy, 200000, true);
  ok('lo prende', await NB.prender(N.uid, true), 1);
  const fichaN = fichaDeLaCuenta(await filaEmpresa(N.empresaId));
  const deN = await catalogo(N);
  ok('en la base solo está la «Clase»', nombres(deN), ['Clase']);
  ok('Productos y Vender arrancan vacíos: sale «Cargar productos», no una «Clase» a Gs. 0', catalogoVisible(fichaN, deN), []);
  // Las inscripciones siguientes usan la misma «Clase», que sigue escondida.
  // Que no se vea importa también por esto: si el profe la pausara desde
  // Productos, profe_y_clase (091) intentaría crear otra con el mismo nombre
  // y la próxima inscripción fallaría (productos_empresa_id_nombre_key).
  await NB.inscribir(await NB.cliente('Ema', '0985555555'), hoy, 200000, true);
  const deN2 = await catalogo(N, true);
  ok('la segunda inscripción usa la misma «Clase»', deN2.filter((x) => x.nombre === 'Clase').length, 1);
  ok('que sigue sin verse', catalogoVisible(fichaN, deN2), []);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · El resto del reparto del descuento no es plata');
  // ═══════════════════════════════════════════════════════════
  // 2/3 se corta en el dígito 20: una raqueta de 300.000 con 100.000 de
  // descuento daba 200.000,000000000000001 vendido y -1e-15 de clases
  // («Gs. -0»). La plata sale redondeada a la moneda (decimales_de, 033).
  const exacto = (v) => [Number(v), Object.is(Number(v), -0)];
  const R = await H.montarEmpresa(db, { email: 'resto@tenis.com', nombre: 'Tenis del resto', rubro: 'clases' });
  const RA = ayudantes(db, R);
  const raq300 = await H.crearProducto(db, R.empresaId, R.uid, { nombre: 'Raqueta', costo: 100000, precio: 300000, stock: 5 });
  await RA.vender([{ producto_id: raq300, cantidad: 1 }], { descuento: 100000 });
  const pR = await RA.panel(hoy);
  const rR = await RA.reporte(hoy);
  ok('lo de las clases es 0 exacto, en el panel y en el reporte (no -1e-15)',
    [exacto(pR.cobrado_clases), exacto(rR.cobrado_clases)], [[0, false], [0, false]]);
  ok('lo vendido es lo que se cobró, sin restos',
    [Number(pR.productos.vendido), Number(pR.productos.lista[0].vendido), Number(pR.productos.ganancia)], [200000, 200000, 100000]);

  const C2 = await H.montarEmpresa(db, { email: 'alcosto@tenis.com', nombre: 'Tenis al costo', rubro: 'clases' });
  const C2A = ayudantes(db, C2);
  const raq700 = await H.crearProducto(db, C2.empresaId, C2.uid, { nombre: 'Raqueta', costo: 100000, precio: 700000, stock: 5 });
  await C2A.vender([{ producto_id: raq700, cantidad: 1 }], { descuento: 600000 });
  const prC2 = await C2A.productos(hoy);
  ok('vendida al costo: ganancia y margen 0 exactos (no -2e-15, «perdiste Gs. 0»)',
    [exacto(prC2.ganancia), exacto(prC2.lista[0].ganancia), exacto(prC2.margen)], [[0, false], [0, false], [0, false]]);

  // Una clase suelta y una raqueta en la misma venta, con 1 guaraní de
  // descuento: la parte de la raqueta es 199.999,33… En guaraníes, entero.
  const M = await H.montarEmpresa(db, { email: 'mixta@tenis.com', nombre: 'Tenis mixto', rubro: 'clases' });
  const MA = ayudantes(db, M);
  const raq200 = await H.crearProducto(db, M.empresaId, M.uid, { nombre: 'Raqueta', costo: 150000, precio: 200000, stock: 5 });
  await MA.vender([{ nombre: 'Clase suelta', cantidad: 1, precio_unitario: 100000 }, { producto_id: raq200, cantidad: 1 }], { descuento: 1 });
  const pM = await MA.panel(hoy);
  const rM = await MA.reporte(hoy);
  ok('en guaraníes, lo vendido y lo de las clases son enteros y suman lo cobrado',
    [Number(pM.productos.vendido), Number(pM.cobrado_clases), Number(pM.cobrado), Number(pM.productos.vendido) + Number(pM.cobrado_clases)],
    [199999, 100000, 299999, 299999]);
  ok('el reporte dice lo mismo que el panel', [Number(rM.cobrado_clases), Number(rM.productos.vendido)], [100000, 199999]);
  ok('y la ganancia también es entera', Number(pM.productos.ganancia), 49999);

  // En dólares, a dos decimales: tres productos de 10 con 10 de descuento.
  const U = await H.montarEmpresa(db, { email: 'usd@tenis.com', nombre: 'Tennis USD', rubro: 'clases', moneda: 'USD' });
  const UA = ayudantes(db, U);
  const usd = [];
  for (const nombre of ['Grip', 'Muñequera', 'Vincha']) {
    usd.push(await H.crearProducto(db, U.empresaId, U.uid, { nombre, costo: 5, precio: 10, stock: 10 }));
  }
  await UA.vender(usd.map((id) => ({ producto_id: id, cantidad: 1 })), { descuento: 10 });
  const pU = await UA.panel(hoy);
  ok('en dólares: lo vendido es lo cobrado y lo de las clases, 0 exacto',
    [Number(pU.productos.vendido), exacto(pU.cobrado_clases), Number(pU.productos.ganancia)], [20, [0, false], 5]);
  ok('cada producto, a dos decimales', pU.productos.lista.map((x) => Number(x.vendido)), [6.67, 6.67, 6.67]);

  console.log(`\nlisto en ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE «TAMBIÉN VENDO PRODUCTOS» FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE «TAMBIÉN VENDO PRODUCTOS» PASARON`);
  process.exit(0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
