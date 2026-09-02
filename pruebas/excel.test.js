const { construirLibro, nombreArchivo } = require('../.compilado/reporte.js');
const { resumir, rankingProductos, gastosPorCategoria, ingresosPorCategoria, serieDiaria } = require('../.compilado/calculos.js');
const { diasDelRango } = require('../.compilado/fechas.js');

/**
 * El Excel ahora recibe los agregados ya calculados (en producción los calcula
 * PostgreSQL). Acá los calculamos con calculos.ts, que la prueba de
 * reconciliación garantiza equivalente.
 */
const SIN_AHORRO = { aportado: 0, retirado: 0, neto: 0, porFondo: [] };

function libroDe({ empresa, desde, hasta, movimientos, productosBd = [], ahorro = SIN_AHORRO }) {
  const dias = diasDelRango(desde, hasta, 400);
  return construirLibro({
    empresa, desde, hasta,
    resumen: resumir(movimientos),
    ranking: rankingProductos(movimientos),
    categorias: gastosPorCategoria(movimientos),
    ingresos: ingresosPorCategoria(movimientos),
    ahorro,
    serie: serieDiaria(movimientos, dias),
    movimientos,
    productosBd,
  });
}
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const SALIDA = path.join(__dirname, '..', '.compilado', 'reporte.xlsx');

const base = { estado:'activo', descuento:0, contraparte:'', notas:'', origen:'manual', costo_total:0 };
const movimientos = [
  { ...base, id:'m1', tipo:'venta', fecha:'2026-08-10', descripcion:'Venta perfumes', categoria:'Ventas',
    subtotal:900000, monto:900000, costo_total:500000, metodo_pago:'efectivo', contraparte:'Ana',
    movimiento_items:[{id:'i1', producto_id:'p1', nombre:'Perfume Lattafa', cantidad:5, precio_unitario:180000, costo_unitario:100000}] },
  { ...base, id:'m2', tipo:'venta', fecha:'2026-08-11', descripcion:'Auriculares', categoria:'Ventas',
    subtotal:300000, monto:300000, costo_total:180000, metodo_pago:'transferencia', origen:'audio',
    movimiento_items:[{id:'i2', producto_id:'p2', nombre:'Auricular BT', cantidad:2, precio_unitario:150000, costo_unitario:90000}] },
  { ...base, id:'m3', tipo:'gasto', fecha:'2026-08-10', descripcion:'Nafta para el reparto', categoria:'Transporte',
    subtotal:120000, monto:120000, metodo_pago:'efectivo' },
  { ...base, id:'m4', tipo:'ingreso', fecha:'2026-08-12', descripcion:'Aporte socio', categoria:'Otros',
    subtotal:50000, monto:50000, metodo_pago:'transferencia' },
  // Esta venta está anulada: tiene que figurar en el detalle pero no sumar.
  { ...base, id:'m5', tipo:'venta', fecha:'2026-08-11', descripcion:'Venta cancelada', categoria:'Ventas',
    estado:'anulado', motivo_anulacion:'El cliente devolvió',
    subtotal:2000000, monto:2000000, costo_total:900000, metodo_pago:'efectivo',
    movimiento_items:[{id:'i5', producto_id:'p1', nombre:'Perfume Lattafa', cantidad:20, precio_unitario:100000, costo_unitario:45000}] },
];
const productosBd = [
  { id:'p1', nombre:'Perfume Lattafa', categoria:'Perfumes', costo:100000, precio:180000, stock:12, stock_minimo:3, controla_stock:true, activo:true },
  { id:'p2', nombre:'Auricular BT', categoria:'Tecnología', costo:90000, precio:150000, stock:4, stock_minimo:2, controla_stock:true, activo:true },
  { id:'p3', nombre:'Set de cuchillos', categoria:'Hogar', costo:70000, precio:130000, stock:8, stock_minimo:2, controla_stock:true, activo:true },
];

(async () => {
  const libro = libroDe({
    empresa:{ nombre:'Perfumería Aurora', moneda:'PYG' },
    desde:'2026-08-10', hasta:'2026-08-12', movimientos, productosBd,
  });
  const ruta = SALIDA;
  await libro.xlsx.writeFile(ruta);

  // Releemos el archivo para confirmar que Excel lo puede abrir.
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.readFile(ruta);
  const hojas = leido.worksheets.map(h => h.name);
  console.log('hojas:', hojas.join(' | '));

  let fallos = 0;
  const ok = (n, real, esp) => {
    const a=JSON.stringify(real), b=JSON.stringify(esp);
    if (a!==b) { fallos++; console.log('FALLA', n, a, '!=', b); } else console.log('ok  ', n, '→', a);
  };

  ok('5 hojas', hojas.length, 5);
  ok('nombres', hojas, ['Resumen','Productos','Movimientos','Gastos','Día por día']);

  const res = leido.getWorksheet('Resumen');
  ok('titulo empresa', res.getCell('A1').value, 'Perfumería Aurora');

  // Buscamos la fila de ganancia neta en el resumen
  let neta = null, bruta = null;
  res.eachRow(f => {
    const et = f.getCell(2).value;
    if (et === 'Ganancia neta') neta = f.getCell(3).value;
    if (et === 'Ganancia bruta') bruta = f.getCell(3).value;
  });
  ok('ganancia bruta en Excel (sin la anulada)', bruta, 520000);
  ok('ganancia neta en Excel', neta, 450000); // 520.000 bruta + 50.000 ingreso - 120.000 gasto

  const prod = leido.getWorksheet('Productos');
  ok('primer producto', prod.getCell('B7').value, 'Perfume Lattafa');
  ok('unidades (la venta anulada NO suma)', prod.getCell('C7').value, 5);
  ok('cobrado por el producto', prod.getCell('F7').value, 900000);
  ok('ganancia producto', prod.getCell('H7').value, 400000);
  ok('formato moneda aplicado', prod.getCell('D7').numFmt.includes('Gs.'), true);
  ok('fila TOTAL', prod.getCell('B9').value, 'TOTAL');
  ok('total cobrado', prod.getCell('F9').value, 1200000);

  const mov = leido.getWorksheet('Movimientos');
  ok('gasto en negativo', mov.getCell('H8').value, -120000);
  ok('tipo del gasto', mov.getCell('B8').value, 'Gasto');
  ok('orden por fecha', mov.getCell('A7').value, '10 ago. 2026');

  // La anulada tiene que estar visible en el detalle pero marcada y tachada.
  let filaAnulada = null;
  mov.eachRow((f, n) => { if (String(f.getCell(11).value ?? '').startsWith('ANULADA')) filaAnulada = n; });
  ok('la venta anulada figura en el detalle', filaAnulada !== null, true);
  ok('con el motivo', String(mov.getCell(`K${filaAnulada}`).value).includes('El cliente devolvió'), true);
  ok('y aparece tachada', mov.getCell(`C${filaAnulada}`).font.strike, true);

  const dia = leido.getWorksheet('Día por día');
  ok('3 dias + total', dia.getCell('B10').value, 'TOTAL');
  ok('total neto dia a dia', dia.getCell('E10').value, 450000);
  ok('dia 1 ganancia', dia.getCell('E7').value, 280000); // 400.000 margen - 120.000 nafta
  ok('el dia de la anulada solo cuenta la venta valida', dia.getCell('C8').value, 300000);

  ok('nombre archivo', nombreArchivo('Perfumería Aurora','2026-08-10','2026-08-12'), 'Orden Perfumería Aurora 2026-08-10 a 2026-08-12.xlsx');
  ok('nombre archivo un dia', nombreArchivo('Kiosco #1 / SRL','2026-08-10','2026-08-10'), 'Orden Kiosco 1  SRL 2026-08-10.xlsx');

  // Coherencia entre hojas: lo que dice Productos tiene que dar igual que Resumen.
  const totalProductos = prod.getCell('F9').value;
  let ventasResumen = null;
  res.eachRow(f => { if (f.getCell(2).value === 'Ventas cobradas') ventasResumen = f.getCell(3).value; });
  ok('la hoja Productos coincide con la hoja Resumen', totalProductos, ventasResumen);

  // La 002.1 separó ventas anuladas de movimientos anulados.
  let ventasAnuladasResumen = null;
  res.eachRow(f => { if (f.getCell(2).value === 'Ventas anuladas') ventasAnuladasResumen = f.getCell(3).value; });
  ok('el resumen informa 1 venta anulada', ventasAnuladasResumen, 1);

  // Un costo ausente tiene que dejar la celda VACÍA, nunca un cero:
  // en una planilla un cero se suma y se promedia como si fuera un dato real.
  const sinCosto = libroDe({
    empresa:{ nombre:'Sin Costos', moneda:'PYG' },
    desde:'2026-08-10', hasta:'2026-08-10',
    movimientos:[{ ...base, id:'s1', tipo:'venta', fecha:'2026-08-10', descripcion:'Venta', categoria:'Ventas',
      subtotal:300000, monto:300000, costo_total:null, metodo_pago:'efectivo',
      movimiento_items:[{id:'si1', producto_id:'p9', nombre:'Producto', cantidad:2, precio_unitario:150000, costo_unitario:null}] }],
  });
  const rutaSc = path.join(__dirname, '..', '.compilado', 'sin-costos.xlsx');
  await sinCosto.xlsx.writeFile(rutaSc);
  const leidoSc = new ExcelJS.Workbook();
  await leidoSc.xlsx.readFile(rutaSc);
  const prodSc = leidoSc.getWorksheet('Productos');
  ok('con costo oculto, la celda de costo queda vacía', prodSc.getCell('G7').value, null);
  ok('la de ganancia también', prodSc.getCell('H7').value, null);
  ok('y la de margen también', prodSc.getCell('I7').value, null);
  ok('pero lo cobrado sí figura', prodSc.getCell('F7').value, 300000);
  const diaSc = leidoSc.getWorksheet('Día por día');
  ok('la ganancia del día también queda vacía', diaSc.getCell('E7').value, null);
  ok('pero el vendido del día figura', diaSc.getCell('C7').value, 300000);

  console.log('\ntamaño del archivo:', fs.statSync(ruta).size, 'bytes');
  // ---- Una cuenta personal no habla de ventas ----
  //
  // <<No se registraron ventas en este periodo>> acusaba a la persona de no
  // hacer algo que el sistema ni siquiera le ofrece: en una cuenta personal
  // no se vende nada. Y un reporte que solo senala lo que falta no invita a
  // volver a abrirlo.
  const gastoSuelto = { ...base, id:'g1', tipo:'gasto', fecha:'2026-08-10', descripcion:'Supermercado',
    categoria:'Comida', subtotal:80000, monto:80000, costo_total:0, metodo_pago:'efectivo',
    movimiento_items:[] };

  const textoDelResumen = async (empresa, archivo) => {
    const libro = libroDe({ empresa, desde:'2026-08-10', hasta:'2026-08-10', movimientos:[gastoSuelto] });
    const r = path.join(__dirname, '..', '.compilado', archivo);
    await libro.xlsx.writeFile(r);
    const leido = new ExcelJS.Workbook();
    await leido.xlsx.readFile(r);
    let texto = '';
    leido.getWorksheet('Resumen').eachRow((fila) => {
      fila.eachCell((c) => { if (typeof c.value === 'string') texto += c.value + ' '; });
    });
    return texto;
  };

  const tPersonal = await textoDelResumen(
    { nombre:'Mis finanzas', moneda:'PYG', tipo_cuenta:'personal' }, 'personal.xlsx');
  ok('una cuenta personal no dice <<no se registraron ventas>>',
    /no se registraron ventas/i.test(tPersonal), false);
  ok('y en cambio empuja a seguir cargando',
    /anotá tu sueldo|contale al sistema|seguí cargando/i.test(tPersonal), true);

  // Un comercio sin ventas SI lo dice: ahi el dato es real y es un problema.
  const tComercio = await textoDelResumen(
    { nombre:'Perfumeria', moneda:'PYG', tipo_cuenta:'emprendedor' }, 'comercio.xlsx');
  ok('un comercio sin ventas si lo dice',
    /no se registraron ventas/i.test(tComercio), true);
  // ---- En ciclo largo no hay hoja «Dia por dia» ----
  //
  // Para una ganaderia serian 365 filas en cero con tres picos. Una hoja
  // vacia no informa: ocupa y hace dudar del resto del reporte.
  const hojasDe = async (empresa, archivo) => {
    const libro = libroDe({ empresa, desde:'2026-08-01', hasta:'2026-08-10', movimientos:[gastoSuelto] });
    const r = path.join(__dirname, '..', '.compilado', archivo);
    await libro.xlsx.writeFile(r);
    const leido = new ExcelJS.Workbook();
    await leido.xlsx.readFile(r);
    return leido.worksheets.map((h) => h.name);
  };

  const hojasCampo = await hojasDe(
    { nombre:'Estancia', moneda:'PYG', rubro:'ganaderia' }, 'ganaderia.xlsx');
  ok('una ganaderia NO trae la hoja dia por dia',
    hojasCampo.includes('Día por día'), false);
  ok('pero si trae el resto', hojasCampo.includes('Resumen') && hojasCampo.includes('Gastos'), true);

  const hojasTienda = await hojasDe(
    { nombre:'Almacen', moneda:'PYG', rubro:'comercio' }, 'comercio-hojas.xlsx');
  ok('un comercio si la trae', hojasTienda.includes('Día por día'), true);

  // ---- La planilla de una persona no es la de un comercio ----
  //
  // Hasta la 030, alguien que llevaba su sueldo abria el Excel y leia
  // <<Ventas a precio de lista>>, <<Costo de la mercaderia vendida>>,
  // <<Ticket promedio>> y una hoja entera de productos vacia. Un reporte que
  // le habla a alguien de cosas que no hace le ensena que ese archivo no es
  // para el, y no lo vuelve a abrir.
  const movsPersona = [
    { ...base, id:'pp1', tipo:'ingreso', fecha:'2026-08-01', descripcion:'Sueldo de julio',
      categoria:'Sueldo', subtotal:3500000, monto:3500000, metodo_pago:'transferencia' },
    { ...base, id:'pp2', tipo:'ingreso', fecha:'2026-08-14', descripcion:'Changa',
      categoria:'Extras', subtotal:400000, monto:400000, metodo_pago:'efectivo' },
    { ...base, id:'pp3', tipo:'gasto', fecha:'2026-08-02', descripcion:'Supermercado',
      categoria:'Comida', subtotal:600000, monto:600000, metodo_pago:'efectivo' },
    { ...base, id:'pp4', tipo:'gasto', fecha:'2026-08-05', descripcion:'Alquiler',
      categoria:'Alquiler', subtotal:1500000, monto:1500000, metodo_pago:'transferencia' },
  ];
  const cuentaPersonal = { nombre:'Mis finanzas', moneda:'PYG', tipo_cuenta:'personal' };

  const libroP = libroDe({
    empresa: cuentaPersonal, desde:'2026-08-01', hasta:'2026-08-31', movimientos: movsPersona,
  });
  const rutaP = path.join(__dirname, '..', '.compilado', 'personal-completo.xlsx');
  await libroP.xlsx.writeFile(rutaP);
  const leidoP = new ExcelJS.Workbook();
  await leidoP.xlsx.readFile(rutaP);
  const hojasP = leidoP.worksheets.map((h) => h.name);
  console.log('hojas personales:', hojasP.join(' | '));

  ok('la cuenta personal no trae hoja de Productos', hojasP.includes('Productos'), false);
  ok('trae en que se fue y de donde vino',
    hojasP.includes('En qué se fue') && hojasP.includes('De dónde vino'), true);
  ok('sin movimientos de ahorro no aparece la hoja Ahorro', hojasP.includes('Ahorro'), false);

  // Ni una sola palabra de comercio en toda la planilla.
  let textoP = '';
  leidoP.worksheets.forEach((h) => {
    h.eachRow((fila) => {
      fila.eachCell((c) => { if (typeof c.value === 'string') textoP += c.value + ' '; });
    });
  });
  ok('no habla de ventas a precio de lista', /precio de lista/i.test(textoP), false);
  ok('ni de mercaderia', /mercader/i.test(textoP), false);
  ok('ni de ticket promedio', /ticket/i.test(textoP), false);
  ok('ni de ganancia bruta', /ganancia bruta/i.test(textoP), false);
  ok('ni de margen', /margen/i.test(textoP), false);

  // Los numeros, que son el punto.
  const resP = leidoP.getWorksheet('Resumen');
  const buscar = (hoja, etiqueta) => {
    let valor = null;
    hoja.eachRow((f) => { if (f.getCell(2).value === etiqueta) valor = f.getCell(3).value; });
    return valor;
  };
  ok('total que entro', buscar(resP, 'Total que entró'), 3900000);
  ok('total que salio', buscar(resP, 'Total que salió'), 2100000);
  ok('te quedo', buscar(resP, 'Te quedó'), 1800000);
  ok('el sueldo aparece desglosado', buscar(resP, 'Sueldo'), 3500000);

  const vino = leidoP.getWorksheet('De dónde vino');
  ok('la categoria mas grande primero', vino.getCell('B7').value, 'Sueldo');
  ok('con su monto', vino.getCell('C7').value, 3500000);
  ok('y el total coincide con el resumen', vino.getCell('B9').value, 'TOTAL');
  ok('total de ingresos', vino.getCell('C9').value, 3900000);

  const movP = leidoP.getWorksheet('Movimientos');
  ok('la columna del monto es la sexta', movP.getCell('F6').value, 'Monto');
  ok('y no hay columna de descuento ni de costo',
    ['A6','B6','C6','D6','E6','F6','G6'].map((c) => movP.getCell(c).value).join('|'),
    'Fecha|Tipo|Descripción|Categoría|Cómo|Monto|Estado');
  ok('el gasto va en negativo', movP.getCell('F9').value, -1500000);

  const diaP = leidoP.getWorksheet('Día por día');
  ok('el dia por dia habla de entro y salio',
    [diaP.getCell('C6').value, diaP.getCell('D6').value, diaP.getCell('E6').value].join('|'),
    'Entró|Salió|Diferencia');

  // ---- Con ahorro aparece la hoja, y no se mezcla con los gastos ----
  //
  // El ahorro no es un gasto: la plata sigue siendo suya. Si figurara como
  // gasto, su mejor mes se veria como el peor.
  const conAhorro = libroDe({
    empresa: cuentaPersonal, desde:'2026-08-01', hasta:'2026-08-31', movimientos: movsPersona,
    ahorro: {
      aportado: 500000, retirado: 100000, neto: 400000,
      porFondo: [
        { nombre:'Viaje de fin de año', aportado:500000, retirado:0, neto:500000, saldo_hoy:1200000 },
        { nombre:'Emergencias', aportado:0, retirado:100000, neto:-100000, saldo_hoy:300000 },
      ],
    },
  });
  const rutaA = path.join(__dirname, '..', '.compilado', 'personal-ahorro.xlsx');
  await conAhorro.xlsx.writeFile(rutaA);
  const leidoA = new ExcelJS.Workbook();
  await leidoA.xlsx.readFile(rutaA);

  ok('con movimientos de ahorro si aparece la hoja',
    leidoA.worksheets.map((h) => h.name).includes('Ahorro'), true);

  const ahP = leidoA.getWorksheet('Ahorro');
  ok('el fondo que mas crecio va primero', ahP.getCell('B7').value, 'Viaje de fin de año');
  ok('lo retirado va en negativo', ahP.getCell('D8').value, -100000);
  ok('el saldo a hoy figura aparte', ahP.getCell('F7').value, 1200000);
  ok('y el total del periodo no lo suma', ahP.getCell('F9').value, '');

  const resA = leidoA.getWorksheet('Resumen');
  ok('el ahorro no cambia lo que salio', buscar(resA, 'Total que salió'), 2100000);
  ok('ni lo que quedo', buscar(resA, 'Te quedó'), 1800000);
  ok('pero se informa aparte', buscar(resA, 'Guardado en el periodo'), 400000);
  console.log(fallos===0 ? '>>> EXCEL OK' : `>>> ${fallos} FALLAS`);
  process.exit(fallos?1:0);
})();
