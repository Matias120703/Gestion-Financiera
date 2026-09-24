/**
 * El reporte del comercio (contrato 2.1): el libro de Excel
 * (src/lib/reportes/excel-comercio.ts) y las cuentas que comparte con la
 * pantalla (src/lib/reportes/comercio.ts), sobre `.compilado/`.
 *
 * Los agregados se calculan con calculos.ts, que la prueba de reconciliación
 * (agregados.test.js) garantiza igual a la base. Lo que se prueba:
 *
 *   · la tarjeta anuncia exactamente las hojas que trae el archivo, en es y
 *     en pt, con todo y con lo mínimo (sin stock, sin fiado, un vendedor);
 *   · la decisión 2: con costo cargado, la compra de mercadería no resta de
 *     la ganancia y va aparte en el Resumen, Gastos, Movimientos y Día por
 *     día, y todas las hojas suman lo mismo; sin costo cargado, resta;
 *   · el aviso de productos sin costo, «¿Reponer?», el inventario valuado,
 *     el fiado por antigüedad, los vendedores y la hoja del contador;
 *   · la conversión a la moneda de la vista no convierte lo que falta.
 */
const ExcelJS = require('exceljs');
const path = require('path');
const { libroComercio, hojasComercio, enLaVistaComercio } = require('../.compilado/reportes/excel-comercio.js');
const {
  aReponer, quietosEnElEstante, valorAlCosto, inventarioConStock, vendidosSinCosto, gastosDelComercio,
  deudoresPorAntiguedad, hayVariosVendedores, comprasDeMercaderia,
} = require('../.compilado/reportes/comercio.js');
const { coincidenLasHojas, conversorDe } = require('../.compilado/reportes/comun.js');
const { resumir, rankingProductos, gastosPorCategoria, serieDiaria, RESUMEN_VACIO } = require('../.compilado/calculos.js');
const { diasDelRango } = require('../.compilado/fechas.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
}

console.log('── Excel de comercio ──');

// ------------------------------------------------------------------ datos

const base = { estado: 'activo', descuento: 0, contraparte: '', notas: '', origen: 'manual', costo_total: 0 };
const item = (id, producto_id, nombre, cantidad, precio, costo) =>
  ({ id, producto_id, nombre, cantidad, precio_unitario: precio, costo_unitario: costo });

// Un almacén: compra 1.000.000 de mercadería, vende con costo cargado, fía
// una venta y vende un producto sin costo (margen inflado).
const movimientos = [
  { ...base, id: 'v1', tipo: 'venta', fecha: '2026-09-01', descripcion: 'Venta', categoria: 'Ventas',
    subtotal: 1500000, monto: 1500000, costo_total: 1000000, metodo_pago: 'efectivo',
    cliente_nombre: 'Ana', cuenta_nombre: 'Caja', creado_por_nombre: 'Matías',
    movimiento_items: [item('i1', 'p1', 'Aceite', 10, 150000, 100000)] },
  { ...base, id: 'v2', tipo: 'venta', fecha: '2026-09-02', descripcion: 'Venta fiada', categoria: 'Ventas',
    subtotal: 200000, monto: 200000, costo_total: 0, metodo_pago: 'credito', contraparte: 'Beto',
    creado_por_nombre: 'Lucía',
    movimiento_items: [item('i2', 'p2', 'Pan casero', 20, 10000, 0)] },
  { ...base, id: 'g1', tipo: 'gasto', fecha: '2026-09-01', descripcion: 'Compra al mayorista', categoria: 'Mercadería',
    subtotal: 1000000, monto: 1000000, costo_total: null, metodo_pago: 'transferencia', cuenta_nombre: 'Banco' },
  { ...base, id: 'g2', tipo: 'gasto', fecha: '2026-09-02', descripcion: 'Luz', categoria: 'Servicios',
    subtotal: 100000, monto: 100000, costo_total: null, metodo_pago: 'efectivo' },
  { ...base, id: 'g3', tipo: 'gasto', fecha: '2026-09-03', descripcion: 'IVA', categoria: 'Impuestos',
    subtotal: 50000, monto: 50000, costo_total: null, metodo_pago: 'transferencia' },
];
const productos = [
  { id: 'p1', nombre: 'Aceite', categoria: 'Almacén', costo: 100000, precio: 150000, stock: 2, stock_minimo: 5, controla_stock: true, activo: true },
  { id: 'p2', nombre: 'Pan casero', categoria: 'Panadería', costo: 0, precio: 10000, stock: 0, stock_minimo: 0, controla_stock: false, activo: true },
  { id: 'p3', nombre: 'Yerba', categoria: 'Almacén', costo: 30000, precio: 45000, stock: 10, stock_minimo: 2, controla_stock: true, activo: true },
  { id: 'p4', nombre: 'Velas', categoria: 'Bazar', costo: 0, precio: 5000, stock: 4, stock_minimo: 1, controla_stock: true, activo: true },
  { id: 'p5', nombre: 'Agotado', categoria: 'Bazar', costo: 1000, precio: 2000, stock: 0, stock_minimo: 3, controla_stock: true, activo: true },
];
const fiado = {
  total: 700000, cuantos: 2,
  clientes: [
    { cliente_id: 'c1', nombre: 'Beto', telefono: '', saldo: 200000, desde: '2026-09-02', dias: 5 },
    { cliente_id: 'c2', nombre: 'Carla', telefono: '', saldo: 500000, desde: '2026-06-10', dias: 89 },
  ],
};
const fiadoPeriodo = {
  otorgado: 200000, cobrado: 0,
  clientes: [{ cliente_id: 'c1', nombre: 'Beto', otorgado: 200000, cobrado: 0, saldo_hoy: 200000 }],
};
const vendedores = [
  { user_id: 'u1', nombre: 'Matías', rol: 'propietario', vendido: 1500000, cantidad: 1, ticket_promedio: 1500000, anuladas: 0, monto_anulado: 0 },
  { user_id: 'u2', nombre: 'Lucía', rol: 'vendedor', vendido: 200000, cantidad: 1, ticket_promedio: 200000, anuladas: 1, monto_anulado: 30000 },
];
const cuentas = [{ nombre: 'Caja', saldo: 900000 }, { nombre: 'Banco', saldo: -100000 }];

function datosDe(movs, extras = {}, idioma) {
  const desde = '2026-09-01', hasta = '2026-09-03';
  const previo = { desde: '2026-08-29', hasta: '2026-08-31' };
  return {
    empresa: { nombre: 'Almacén Doña Rosa', moneda: 'PYG', tipo_cuenta: 'emprendedor', rubro: 'comercio' },
    desde, hasta, idioma, jerga: null, previo,
    resumen: resumir(movs),
    resumenPrevio: { ...RESUMEN_VACIO, ventas: 1000000, ventasBrutas: 1000000, ingresosTotales: 1000000, gastos: 400000,
      costoMercaderia: 500000, gananciaBruta: 500000, gananciaNeta: 100000, cantidadVentas: 2, mercaderiaAparte: true },
    categorias: gastosPorCategoria(movs),
    serie: serieDiaria(movs, diasDelRango(desde, hasta, 400)),
    movimientos: movs,
    ranking: rankingProductos(movs),
    productos,
    fiado, fiadoPeriodo, cuentas, vendedores,
    hoy: '2026-09-24',
    ...extras,
  };
}

/** La fila (número) cuya columna B dice `etiqueta`, o null. */
function fila(hoja, etiqueta, col = 2) {
  let n = null;
  hoja.eachRow((f, i) => { if (n === null && f.getCell(col).value === etiqueta) n = i; });
  return n;
}
function textos(hoja) {
  const t = [];
  hoja.eachRow((f) => f.eachCell((c) => { if (typeof c.value === 'string') t.push(c.value); }));
  return t;
}

// ------------------------------------------------------------------ cuentas de la pantalla

{
  ok('a reponer: la regla del panel (stock <= mínimo), primero lo que más falta',
    aReponer(productos).map((p) => p.id), ['p1', 'p5']);
  ok('quieto en el estante: con stock de verdad y sin vender (ni servicios ni agotados)',
    quietosEnElEstante(productos, rankingProductos(movimientos)).map((p) => p.id), ['p3', 'p4']);
  ok('plata parada: lo sin costo no suma y se cuenta',
    valorAlCosto(quietosEnElEstante(productos, rankingProductos(movimientos))), { total: 300000, sinCosto: 1 });
  ok('inventario de hoy: solo lo que lleva stock y tiene más de cero, de mayor a menor valor',
    inventarioConStock(productos).map((p) => p.id), ['p3', 'p1', 'p4']);
  ok('vendidos sin costo: el pan casero (costo 0, vendido)',
    vendidosSinCosto(rankingProductos(movimientos)).map((p) => p.nombre), ['Pan casero']);
  ok('un costo que no se ve (null) no es «sin costo»',
    vendidosSinCosto([{ nombre: 'X', producto_id: 'x', costo: null, ingresos: 100 }]).length, 0);

  const cats = gastosPorCategoria(movimientos);
  const conAparte = gastosDelComercio(cats, { mercaderiaAparte: true });
  ok('con la mercadería aparte, la lista no la trae', conAparte.lista.map((c) => c.nombre), ['Servicios', 'Impuestos']);
  ok('y los porcentajes se recalculan sobre lo que queda', Math.round(conAparte.lista.reduce((s, c) => s + c.participacion, 0)), 100);
  ok('la mercadería queda aparte', conAparte.mercaderia, { monto: 1000000, operaciones: 1 });
  const sinAparte = gastosDelComercio(cats, { mercaderiaAparte: false });
  ok('sin costo cargado, la mercadería es un gasto más', sinAparte.lista.map((c) => c.nombre), ['Mercadería', 'Servicios', 'Impuestos']);
  ok('la categoría en portugués también se reconoce',
    gastosDelComercio([{ nombre: 'Mercadoria', monto: 10, operaciones: 1, participacion: 100 }], { mercaderiaAparte: true }).lista.length, 0);

  ok('fiado: de la deuda más vieja a la más nueva', deudoresPorAntiguedad(fiado).map((c) => c.nombre), ['Carla', 'Beto']);
  ok('un solo vendedor no es «varios»', hayVariosVendedores(vendedores.slice(0, 1)), false);

  // Cada compra de mercadería, para ver un gasto mal puesto: solo gastos válidos de esa categoría, lo más nuevo primero.
  const conLuzMalPuesta = [
    ...movimientos,
    { ...base, id: 'g4', tipo: 'gasto', fecha: '2026-09-03', descripcion: 'Luz de agosto', categoria: 'Mercadería', monto: 80000 },
    { ...base, id: 'g5', tipo: 'gasto', fecha: '2026-09-02', descripcion: 'Anulada', categoria: 'Mercadería', monto: 5000, estado: 'anulado' },
    { ...base, id: 'g6', tipo: 'gasto', fecha: '2026-09-02', descripcion: 'Otra', categoria: 'Mercadoria', monto: 7000 },
  ];
  ok('compras de mercadería: sin anuladas ni otras categorías, lo más nuevo primero',
    comprasDeMercaderia(conLuzMalPuesta).map((m) => m.id), ['g4', 'g6', 'g1']);
}

// ------------------------------------------------------------------ el libro

(async () => {
  const releer = async (libro) => {
    const buf = await libro.xlsx.writeBuffer();
    const l = new ExcelJS.Workbook();
    await l.xlsx.load(buf);
    return l;
  };

  // ---- con todo: costo cargado, stock, fiado, dos vendedores ----
  const datos = datosDe(movimientos);
  const r = datos.resumen;
  ok('la regla 8 de calculos: con costo cargado, la mercadería va aparte', [r.mercaderiaAparte, r.gastos, r.comprasMercaderia], [true, 150000, 1000000]);
  ok('ganancia neta: 1.700.000 − 1.000.000 de costo − 150.000 de gastos', r.gananciaNeta, 550000);

  const libro = await releer(libroComercio(datos));
  const nombres = libro.worksheets.map((h) => h.name);
  ok('hojas con todo', nombres,
    ['Resumen', 'Productos', 'Inventario valuado', 'Fiado', 'Movimientos', 'Gastos', 'Día por día', 'Vendedores', 'Para tu contador']);
  ok('la tarjeta anuncia lo que trae (es)', coincidenLasHojas(hojasComercio(null, 'es'), nombres), true);

  // Resumen
  const res = libro.getWorksheet('Resumen');
  ok('Resumen: ganancia neta = la del resumen de la base', res.getCell(`C${fila(res, 'Ganancia neta')}`).value, r.gananciaNeta);
  ok('Resumen: los gastos dicen que van sin la mercadería',
    res.getCell(`C${fila(res, 'Gastos (sin la compra de mercadería)')}`).value, 150000);
  ok('Resumen: la compra de mercadería aparte', res.getCell(`C${fila(res, 'Compras de mercadería')}`).value, 1000000);
  ok('Resumen: con su nota de que no resta',
    res.getCell(`F${fila(res, 'Compras de mercadería')}`).value, 'no resta: lo vendido ya descuenta su costo');
  const fNeta = fila(res, 'Ganancia neta');
  ok('Resumen: la columna Antes', res.getCell(`D${fNeta}`).value, 100000);
  ok('Resumen: el cambio como porcentaje de Excel (+450 %)', res.getCell(`E${fNeta}`).value, 4.5);
  ok('Resumen: sin nada antes dice «antes: nada», no un porcentaje',
    res.getCell(`E${fila(res, 'Otros ingresos')}`).value, null);
  ok('Resumen: la caja es la suma de las cuentas', res.getCell(`C${fila(res, 'Total en tus cuentas')}`).value, 800000);
  ok('Resumen: la caja no tiene columna Antes (es foto de hoy)', res.getCell(`D${fila(res, 'Caja')}`).value, null);
  ok('Resumen: te deben hoy', res.getCell(`C${fila(res, 'Te deben hoy')}`).value, 700000);
  const notas = textos(res);
  ok('Resumen: aviso de 1 producto sin costo',
    notas.includes('1 producto se vendió sin costo cargado: su margen sale inflado (ver la hoja Productos).'), true);
  ok('Resumen: el gasto más grande no es la compra de mercadería (no es gasto)',
    notas.some((t) => t.startsWith('El gasto más grande: Luz')), true);

  // Productos
  const prod = libro.getWorksheet('Productos');
  const fPan = fila(prod, 'Pan casero');
  ok('Productos: el pan sin costo va marcado', prod.getCell(`N${fPan}`).value, 'Sin costo: margen inflado');
  ok('Productos: sin stock controlado, las columnas de stock quedan vacías (no en cero)',
    [prod.getCell(`K${fPan}`).value, prod.getCell(`L${fPan}`).value], [null, null]);
  const fAceite = fila(prod, 'Aceite');
  ok('Productos: el aceite con stock de hoy, mínimo y a reponer',
    [prod.getCell(`K${fAceite}`).value, prod.getCell(`L${fAceite}`).value, prod.getCell(`M${fAceite}`).value], [2, 5, 'Sí']);
  ok('Productos: total cobrado = ventas del resumen', prod.getCell(`F${fila(prod, 'TOTAL')}`).value, r.ventas);

  // Inventario
  const inv = libro.getWorksheet('Inventario valuado');
  ok('Inventario: total al costo (yerba 300.000 + aceite 200.000, las velas sin costo no suman)',
    inv.getCell(`F${fila(inv, 'TOTAL')}`).value, 500000);
  ok('Inventario: el producto sin costo queda con el valor vacío', inv.getCell(`F${fila(inv, 'Velas')}`).value, null);

  // Fiado
  const fia = libro.getWorksheet('Fiado');
  ok('Fiado: primero la deuda más vieja', fia.getCell('B8').value, 'Carla');
  ok('Fiado: la columna de días', fia.getCell('E8').value, 89);

  // Movimientos
  const mov = libro.getWorksheet('Movimientos');
  const cab = [];
  mov.getRow(6).eachCell((c) => cab.push(c.value));
  ok('Movimientos: las columnas nuevas al final', cab.slice(-3), ['Cliente', 'Cuenta', 'Cargó']);
  const fCompra = fila(mov, 'Compra al mayorista', 3);
  ok('Movimientos: la compra de mercadería resta de la plata', mov.getCell(`H${fCompra}`).value, -1000000);
  ok('Movimientos: pero no tiene ganancia (va aparte)', mov.getCell(`J${fCompra}`).value, null);
  ok('Movimientos: el cliente (o la contraparte) y la cuenta',
    [mov.getCell(`L${fila(mov, 'Venta fiada', 3)}`).value, mov.getCell(`M${fCompra}`).value], ['Beto', 'Banco']);
  const fTot = fila(mov, 'TOTAL DEL PERIODO (sin anuladas)', 3);
  let sumaH = 0, sumaJ = 0;
  for (let i = 7; i < fTot; i++) { sumaH += mov.getCell(`H${i}`).value || 0; sumaJ += mov.getCell(`J${i}`).value || 0; }
  ok('Movimientos: el total de Cobrado es la suma de las filas', mov.getCell(`H${fTot}`).value, sumaH);
  ok('Movimientos: el total de Ganancia es la suma de las filas y la ganancia neta', [mov.getCell(`J${fTot}`).value, sumaJ], [r.gananciaNeta, r.gananciaNeta]);

  // Gastos
  const gas = libro.getWorksheet('Gastos');
  const fGTot = fila(gas, 'TOTAL');
  const enLista = [];
  for (let i = 7; i < fGTot; i++) enLista.push(gas.getCell(`B${i}`).value);
  ok('Gastos: sin la mercadería en la lista', enLista, ['Servicios', 'Impuestos']);
  ok('Gastos: el total = los gastos del resumen', gas.getCell(`C${fila(gas, 'TOTAL')}`).value, 150000);
  ok('Gastos: la mercadería aparte, abajo', textos(gas).includes('COMPRASTE MERCADERÍA · APARTE, NO RESTA DE LA GANANCIA'), true);
  ok('Gastos: cada compra de mercadería con su descripción', textos(gas).includes('CADA COMPRA DE MERCADERÍA'), true);
  const fCompraG = fila(gas, 'Compra al mayorista');
  ok('Gastos: la compra con su monto y su fecha', fCompraG && [gas.getCell(`C${fCompraG}`).value, typeof gas.getCell(`D${fCompraG}`).value], [1000000, 'string']);

  // Día por día
  const dia = libro.getWorksheet('Día por día');
  ok('Día por día: con la columna de la mercadería', dia.getCell('E6').value, 'Compraste mercadería');
  const fDTot = fila(dia, 'TOTAL');
  let sumaDia = 0;
  for (let i = 7; i < fDTot; i++) sumaDia += dia.getCell(`F${i}`).value || 0;
  ok('Día por día: la suma de los días da la ganancia neta del resumen', [sumaDia, dia.getCell(`F${fDTot}`).value], [r.gananciaNeta, r.gananciaNeta]);

  // Vendedores
  const ven = libro.getWorksheet('Vendedores');
  ok('Vendedores: con su rol', ven.getCell('B7').value, 'Matías · Dueño');
  ok('Vendedores: el total vendido = ventas del resumen', ven.getCell(`C${fila(ven, 'TOTAL')}`).value, r.ventas);

  // Para tu contador
  const con = libro.getWorksheet('Para tu contador');
  ok('Contador: Impuestos en la lista de gastos', con.getCell(`C${fila(con, 'Impuestos')}`).value, 50000);
  ok('Contador: las compras de mercadería en su línea', con.getCell(`C${fila(con, 'Compras de mercadería')}`).value, 1000000);
  const etInv = textos(con).find((t) => t.startsWith('Inventario valuado al'));
  ok('Contador: el inventario valuado al día de descarga', con.getCell(`C${fila(con, etInv)}`).value, 500000);
  ok('Contador: aclara que no reemplaza el registro de la SET', textos(con).some((t) => t.includes('SET')), true);

  // ---- portugués ----
  const libroPt = await releer(libroComercio(datosDe(movimientos, {}, 'pt')));
  const nombresPt = libroPt.worksheets.map((h) => h.name);
  ok('hojas en pt', nombresPt,
    ['Resumo', 'Produtos', 'Estoque valorizado', 'Fiado', 'Lançamentos', 'Despesas', 'Dia a dia', 'Vendedores', 'Para o contador']);
  ok('la tarjeta anuncia lo que trae (pt)', coincidenLasHojas(hojasComercio(null, 'pt'), nombresPt), true);

  // ---- lo mínimo: sin stock, sin fiado, un solo vendedor, sin costo cargado ----
  const sinCostoMovs = movimientos
    .filter((m) => m.id !== 'v1')
    .concat([{ ...base, id: 'v3', tipo: 'venta', fecha: '2026-09-03', descripcion: 'Venta', categoria: 'Ventas',
      subtotal: 300000, monto: 300000, costo_total: 0, metodo_pago: 'efectivo',
      movimiento_items: [item('i3', null, 'Varios', 1, 300000, 0)] }]);
  const minimo = datosDe(sinCostoMovs, {
    productos: productos.map((p) => ({ ...p, controla_stock: false })),
    fiado: { total: 0, cuantos: 0, clientes: [] },
    fiadoPeriodo: { otorgado: 0, cobrado: 0, clientes: [] },
    vendedores: vendedores.slice(0, 1),
    cuentas: null,
  });
  const rm = minimo.resumen;
  ok('sin costo cargado, la mercadería resta como gasto', [rm.mercaderiaAparte, rm.gastos], [false, 1150000]);
  const libroMin = await releer(libroComercio(minimo));
  const nombresMin = libroMin.worksheets.map((h) => h.name);
  ok('hojas con lo mínimo', nombresMin, ['Resumen', 'Productos', 'Movimientos', 'Gastos', 'Día por día', 'Para tu contador']);
  ok('la tarjeta sigue diciendo la verdad con lo mínimo', coincidenLasHojas(hojasComercio(null, 'es'), nombresMin), true);
  const resMin = libroMin.getWorksheet('Resumen');
  ok('sin costo: «Gastos operativos» incluye la mercadería', resMin.getCell(`C${fila(resMin, 'Gastos operativos')}`).value, 1150000);
  ok('sin costo: la nota dice que resta', resMin.getCell(`F${fila(resMin, 'Compras de mercadería')}`).value,
    'resta como gasto: tus ventas no tienen costo cargado');
  ok('sin costo: el aviso de la regla distinta en el período anterior', textos(resMin).some((t) => t.startsWith('En el período anterior')), true);
  ok('sin cuentas, sin bloque de caja', fila(resMin, 'Total en tus cuentas'), null);
  ok('sin fiado, sin bloque de fiado', fila(resMin, 'Te deben hoy'), null);
  const diaMin = libroMin.getWorksheet('Día por día');
  ok('sin costo: Día por día sin la columna de la mercadería (ya está en Gastado)', diaMin.getCell('E6').value, 'Ganancia del día');
  const gasMin = libroMin.getWorksheet('Gastos');
  ok('sin costo: la mercadería en la lista de gastos', fila(gasMin, 'Mercadería') !== null, true);
  ok('sin costo: el total de gastos la incluye', gasMin.getCell(`C${fila(gasMin, 'TOTAL')}`).value, 1150000);
  ok('sin costo: sin la lista de cada compra (ya resta como gasto)', textos(gasMin).includes('CADA COMPRA DE MERCADERÍA'), false);
  const movMin = libroMin.getWorksheet('Movimientos');
  ok('sin costo: la compra tiene ganancia (resta)', movMin.getCell(`J${fila(movMin, 'Compra al mayorista', 3)}`).value, -1000000);

  // ---- la moneda de la vista (051) ----
  const c = conversorDe({ moneda: 'USD', propia: 'PYG', factor: 1 / 8000 });
  const v = enLaVistaComercio({ fiado, fiadoPeriodo, cuentas, vendedores }, c);
  ok('en la vista: el fiado de hoy', v.fiado.total, 87.5);
  ok('en la vista: el saldo de cada cuenta', v.cuentas.map((k) => k.saldo), [112.5, -12.5]);
  ok('en la vista: los días no se convierten', v.fiado.clientes[1].dias, 89);
  const vNull = enLaVistaComercio({ fiado: null, fiadoPeriodo: null, cuentas: null,
    vendedores: [{ ...vendedores[0], ticket_promedio: null }] }, c);
  ok('en la vista: lo que falta sigue faltando', [vNull.fiado, vNull.cuentas, vNull.vendedores[0].ticket_promedio], [null, null, null]);
  const sinConvertir = { fiado, fiadoPeriodo, cuentas, vendedores };
  ok('sin conversión, lo mismo', enLaVistaComercio(sinConvertir, conversorDe({ moneda: 'PYG', propia: 'PYG', factor: 1 })) === sinConvertir, true);

  void path;
  console.log(`\n${corridas} comprobaciones, ${fallos} fallos`);
  process.exit(fallos > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
