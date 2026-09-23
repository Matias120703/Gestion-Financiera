const { construirLibro, nombreArchivo } = require('../.compilado/reporte.js');
const { resumir, rankingProductos, gastosPorCategoria, ingresosPorCategoria, serieDiaria } = require('../.compilado/calculos.js');
const { diasDelRango } = require('../.compilado/fechas.js');

/**
 * El Excel ahora recibe los agregados ya calculados (en producción los calcula
 * PostgreSQL). Acá los calculamos con calculos.ts, que la prueba de
 * reconciliación garantiza equivalente.
 */
const SIN_AHORRO = { aportado: 0, retirado: 0, neto: 0, porFondo: [] };

function libroDe({ empresa, desde, hasta, movimientos, productosBd = [], ahorro = SIN_AHORRO, idioma }) {
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
    idioma,
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
  // ---- En la moneda que se está mirando (051) ----
  //
  // Si el negocio mira sus números en dólares, el Excel sale en dólares, con
  // el mismo cambio que las pantallas. Hasta acá salía siempre en la moneda
  // propia: bajar el archivo mostraba otros números que los que se veían.
  const { enLaMonedaDeLaVista, RESUMEN_PLATA, RESUMEN_NO_PLATA } = require('../.compilado/reporte.js');
  const { simboloDe } = require('../.compilado/formato.js');
  const US = simboloDe('USD');
  const r2 = (v) => Math.round(Number(v) * 100) / 100;
  const vistaUsd = { moneda:'USD', factor:1/7500, propia:'PYG', cotizacion:7500, desde:'2026-09-01T12:00:00Z' };
  const datosAurora = {
    empresa:{ nombre:'Perfumería Aurora', moneda:'PYG' }, desde:'2026-08-10', hasta:'2026-08-12',
    resumen: resumir(movimientos), ranking: rankingProductos(movimientos),
    categorias: gastosPorCategoria(movimientos), ingresos: ingresosPorCategoria(movimientos),
    ahorro: SIN_AHORRO, serie: serieDiaria(movimientos, diasDelRango('2026-08-10', '2026-08-12', 400)),
    movimientos, productosBd,
  };
  const rutaUsd = path.join(__dirname, '..', '.compilado', 'en-dolares.xlsx');
  await construirLibro(enLaMonedaDeLaVista(datosAurora, vistaUsd)).xlsx.writeFile(rutaUsd);
  const leidoUsd = new ExcelJS.Workbook();
  await leidoUsd.xlsx.readFile(rutaUsd);

  const resUsd = leidoUsd.getWorksheet('Resumen');
  ok('la ganancia neta sale en dólares', r2(buscar(resUsd, 'Ganancia neta')), 60);   // 450.000 / 7.500
  ok('las ventas también', r2(buscar(resUsd, 'Ventas cobradas')), 160);              // 1.200.000 / 7.500
  const prodUsd = leidoUsd.getWorksheet('Productos');
  ok('las celdas tienen el formato del dólar', prodUsd.getCell('D7').numFmt.includes(US), true);
  ok('y no el del guaraní', prodUsd.getCell('D7').numFmt.includes('Gs.'), false);
  ok('el margen no se convierte: es un porcentaje', prodUsd.getCell('I7').value, prod.getCell('I7').value);
  ok('las unidades tampoco', prodUsd.getCell('C7').value, 5);
  ok('el detalle también va convertido', r2(leidoUsd.getWorksheet('Movimientos').getCell('H8').value), -16);
  const arriba = String(resUsd.getCell('A3').value);
  ok('arriba dice en qué moneda', arriba.includes(`En ${US}`), true);
  ok('y a qué cambio', arriba.includes('7.500'), true);

  // El candado: un campo de plata nuevo en el resumen que nadie clasifique
  // saldría en guaraníes con el símbolo del dólar.
  ok('cada campo del resumen está clasificado como plata o no',
    Object.keys(datosAurora.resumen).filter((k) => !RESUMEN_PLATA.includes(k) && !RESUMEN_NO_PLATA.includes(k)), []);
  ok('un costo que no se ve sigue sin verse, no pasa a cero',
    enLaMonedaDeLaVista({ ...datosAurora, ranking: [{ ...datosAurora.ranking[0], costo: null, ganancia: null }] }, vistaUsd)
      .ranking[0].costo, null);
  ok('sin otra moneda, los datos no se tocan',
    enLaMonedaDeLaVista(datosAurora, { moneda:'PYG', factor:1, propia:'PYG', cotizacion:null, desde:null }) === datosAurora,
    true);
  ok('el nombre del archivo dice la moneda',
    nombreArchivo('Perfumería Aurora','2026-08-10','2026-08-12','USD'),
    'Orden Perfumería Aurora 2026-08-10 a 2026-08-12 en USD.xlsx');

  // ---- En portugués ----
  //
  // El archivo sale en el idioma de quien lo baja. En el libro en portugués
  // no puede quedar ninguna celda con un texto del libro en español.
  const { textosExcel } = require('../.compilado/reporte-textos.js');
  const TX_ES = textosExcel('es');
  const TX_PT = textosExcel('pt');
  ok('los dos idiomas tienen las mismas claves',
    Object.keys(TX_PT).sort().join('|'), Object.keys(TX_ES).sort().join('|'));
  ok('sin idioma, el Excel sale en español', textosExcel(undefined) === TX_ES, true);

  // Las frases que cambian de un idioma al otro. Las que se escriben igual
  // en los dos («Resultado», «Subtotal») no delatan nada.
  const soloEnEspanol = new Set();
  for (const clave of Object.keys(TX_ES)) {
    const a = TX_ES[clave];
    const b = TX_PT[clave];
    const pares = Array.isArray(a) ? a.map((x, i) => [x, b[i]]) : typeof a === 'string' ? [[a, b]] : [];
    for (const [x, y] of pares) if (x && x !== y && clave !== 'locale') soloEnEspanol.add(x);
  }
  // Y las frases armadas con datos, que no están en la lista de arriba.
  const armadaEnEspanol = /\b(periodo|gastaste|cargaste|guardaste|operaciones|margen|ganancia|veces|días)\b/i;

  const leerTextos = async (libroX, nombre) => {
    const ruta = path.join(__dirname, '..', '.compilado', nombre);
    await libroX.xlsx.writeFile(ruta);
    const l = new ExcelJS.Workbook();
    await l.xlsx.readFile(ruta);
    const celdas = [];
    l.worksheets.forEach((h) => h.eachRow((f) => f.eachCell((c) => {
      if (typeof c.value === 'string') celdas.push(c.value);
    })));
    return { l, celdas };
  };

  const negocioPt = await leerTextos(libroDe({
    empresa:{ nombre:'Perfumería Aurora', moneda:'PYG' },
    desde:'2026-08-10', hasta:'2026-08-12', movimientos, productosBd, idioma:'pt',
  }), 'negocio-pt.xlsx');
  ok('las hojas del negocio en portugués', negocioPt.l.worksheets.map((h) => h.name),
    ['Resumo','Produtos','Lançamentos','Despesas','Dia a dia']);
  ok('el título del resumen', negocioPt.l.getWorksheet('Resumo').getCell('A2').value, 'RESUMO EXECUTIVO');
  ok('el periodo', String(negocioPt.l.getWorksheet('Resumo').getCell('A3').value).startsWith('Período: '), true);
  ok('ninguna celda fija del negocio queda en español',
    negocioPt.celdas.filter((c) => soloEnEspanol.has(c)), []);
  ok('ni una frase armada', negocioPt.celdas.filter((c) => armadaEnEspanol.test(c)), []);
  ok('los mismos números que en español',
    buscar(negocioPt.l.getWorksheet('Resumo'), 'Lucro líquido'), buscar(leido.getWorksheet('Resumen'), 'Ganancia neta'));
  const tiposPt = new Set();
  negocioPt.l.getWorksheet('Lançamentos').eachRow((f, n) => {
    if (n > 6 && f.getCell(2).value) tiposPt.add(f.getCell(2).value);
  });
  ok('el tipo de cada lançamento', [...tiposPt].sort(), ['Despesa','Entrada','Venda']);

  const personaPt = await leerTextos(libroDe({
    empresa: cuentaPersonal, desde:'2026-08-01', hasta:'2026-08-31', movimientos: movsPersona, idioma:'pt',
    ahorro: {
      aportado: 500000, retirado: 100000, neto: 400000,
      porFondo: [
        { nombre:'Viaje', aportado:500000, retirado:0, neto:500000, saldo_hoy:1200000 },
        { nombre:'Emergencias', aportado:0, retirado:100000, neto:-100000, saldo_hoy:300000 },
      ],
    },
  }), 'personal-pt.xlsx');
  ok('las hojas de una persona en portugués', personaPt.l.worksheets.map((h) => h.name),
    ['Resumo','Pra onde foi','De onde veio','Reserva','Lançamentos','Dia a dia']);
  ok('ninguna celda fija de la persona queda en español',
    personaPt.celdas.filter((c) => soloEnEspanol.has(c)), []);
  ok('ni una frase armada de la persona', personaPt.celdas.filter((c) => armadaEnEspanol.test(c)), []);
  ok('sobrou lo mismo que te quedó', buscar(personaPt.l.getWorksheet('Resumo'), 'Sobrou'), 1800000);

  const usdPt = await leerTextos(
    construirLibro(enLaMonedaDeLaVista({ ...datosAurora, idioma:'pt' }, vistaUsd)), 'en-dolares-pt.xlsx');
  ok('el cambio también se explica en portugués',
    String(usdPt.l.getWorksheet('Resumo').getCell('A3').value).includes('ao câmbio de'), true);
  // Las categorías y las formas de pago se guardan en español y las traduce
  // la ruta antes de armar el libro. Si la ruta deja de hacerlo, un brasileño
  // leería «Alquiler» y «efectivo» en un Excel en portugués.
  const rutaExcel = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'api', 'excel', 'route.ts'), 'utf8');
  ok('la ruta traduce las categorías', rutaExcel.includes('categorias: categorias.map(conNombreVisible)')
    && rutaExcel.includes('ingresos: ingresos.map(conNombreVisible)')
    && rutaExcel.includes('categoria: categoriaVisible(t, m.categoria)'), true);
  ok('y las formas de pago', rutaExcel.includes('metodo_pago: metodoVisible(t, m.metodo_pago)'), true);
  ok('y le pasa el idioma al libro y al nombre del archivo',
    /\n\s+idioma,\n\s+\}, vista\)\);/.test(rutaExcel.replace(/\r/g, ''))
    && rutaExcel.includes(': undefined, idioma);'), true);
  ok('el nombre del archivo en portugués',
    nombreArchivo('Perfumería Aurora','2026-08-10','2026-08-12','USD','pt'),
    'Orden Perfumería Aurora 2026-08-10 a 2026-08-12 em USD.xlsx');

  // ---- Las campañas y las liquidaciones del campo (100) ----
  //
  // El ejemplo canónico del contrato: «Norte · Soja · Zafra 2026/27 ·
  // 50 ha» en un negocio en dólares, con la liquidación de 30.000 kg a
  // 415 que deja 1.630 de neto. Los números llegan de la base
  // (`numeros_de_lote`): el Excel no recalcula ninguno, solo los pone.
  console.log('\n── Campañas (100) ──');
  const campanaNorte = {
    id:'l1', nombre:'Norte', unidad:'ha', cantidad:50, estado:'abierto', abierto_el:'2026-09-15', cerrado_el:null,
    notas:'', dias:209, cultivo:'Soja', campana:'Zafra 2026/27', hectareas:50, precio_esperado:415,
    movimientos:9, puesto:21420, cobrado:12450, resultado:-8970, por_unidad:-179.4, a_cosecha:0, costo:21420,
    costo_ha:428.4, resultado_ha:-179.4, kg_cosechados:30000, kg_vendidos:30000, kg_sin_vender:0, vendido:12450,
    precio_promedio:415, precio_ref:415, rendimiento:600, costo_ton:714, kg_ha_para_cubrir:1032.29,
    falta_cubrir:8970, kg_para_cubrir:21614,
  };
  // Un lote de años anteriores que ya no tiene por qué aparecer lo filtra la ruta; acá, uno cerrado del período.
  const campanaSur = {
    ...campanaNorte, id:'l2', nombre:'Sur', cultivo:'Maíz', campana:'Zafriña 2027', hectareas:20, cantidad:20,
    estado:'cerrado', abierto_el:'2027-01-10', cerrado_el:'2027-04-20', puesto:4000, cobrado:5000, resultado:1000,
    a_cosecha:1500, costo:5500, costo_ha:275, resultado_ha:50, kg_cosechados:10000, kg_vendidos:8000,
    kg_sin_vender:2000, vendido:1600, precio_promedio:200, rendimiento:500,
  };
  const liqNorte = {
    id:'q1', grupo_id:'g1', fecha:'2027-04-12', comprador:'Cooperativa', kg:30000, precio_tonelada:415,
    precio_original:null, moneda_original:null, cambio:null, bruto:12450, descuentos:1040, compensado:4800,
    pagado_con_grano:4980, neto:1630, cuenta_id:null, estado:'activa', movimiento_id:'v1', notas:'',
    campana:'Norte · Zafra 2026/27',
  };
  // La misma, cargada antes y anulada: figura tachada y no suma.
  const liqAnulada = { ...liqNorte, id:'q0', grupo_id:'g0', fecha:'2027-04-10', estado:'anulada' };
  const movsCampo = [
    { ...base, id:'g1', tipo:'gasto', fecha:'2026-09-20', descripcion:'Semilla', categoria:'Semilla',
      subtotal:3400, monto:3400, metodo_pago:'efectivo' },
    { ...base, id:'g2', tipo:'gasto', fecha:'2026-09-21', descripcion:'Contador', categoria:'Otros',
      subtotal:200, monto:200, metodo_pago:'efectivo' },
  ];
  const datosCampo = (extra = {}) => ({
    empresa:{ nombre:'Chacra Norte', moneda:'USD', rubro:'agricultura' },
    desde:'2026-09-01', hasta:'2027-04-30',
    resumen: resumir(movsCampo), ranking: rankingProductos(movsCampo),
    categorias: gastosPorCategoria(movsCampo), ingresos: ingresosPorCategoria(movsCampo),
    ahorro: SIN_AHORRO, serie: serieDiaria(movsCampo, diasDelRango('2026-09-01', '2027-04-30', 400)),
    movimientos: movsCampo, productosBd: [],
    campanas: [campanaNorte, campanaSur],
    liquidaciones: [liqNorte, liqAnulada],
    campanaDeMovimiento: { g1: 'Norte · Zafra 2026/27' },
    ...extra,
  });
  const leerLibro = async (libroX, nombre) => {
    const ruta = path.join(__dirname, '..', '.compilado', nombre);
    await libroX.xlsx.writeFile(ruta);
    const l = new ExcelJS.Workbook();
    await l.xlsx.readFile(ruta);
    return l;
  };

  const campoLeido = await leerLibro(construirLibro(datosCampo()), 'campo.xlsx');
  ok('las campañas van segundas, después del resumen',
    campoLeido.worksheets.map((h) => h.name), ['Resumen','Campañas','Liquidaciones','Productos','Movimientos','Gastos']);

  const hc = campoLeido.getWorksheet('Campañas');
  ok('una fila por campaña: el lote', hc.getCell('A7').value, 'Norte');
  ok('el cultivo y la campaña', [hc.getCell('B7').value, hc.getCell('C7').value], ['Soja','Zafra 2026/27']);
  ok('las hectáreas', hc.getCell('D7').value, 50);
  ok('el estado', [hc.getCell('E7').value, hc.getCell('E8').value], ['Abierta','Cerrada']);
  ok('sin fecha de cierre la celda queda vacía', hc.getCell('G7').value, null);
  ok('puesto, a cosecha y costo tal cual la base',
    [hc.getCell('H7').value, hc.getCell('I7').value, hc.getCell('J7').value], [21420, 0, 21420]);
  ok('costo por hectárea', hc.getCell('K7').value, 428.4);
  ok('cobrado y resultado', [hc.getCell('L7').value, hc.getCell('M7').value], [12450, -8970]);
  ok('resultado por hectárea', hc.getCell('N7').value, -179.4);
  ok('kilos cosechados, kg/ha y vendidos',
    [hc.getCell('O7').value, hc.getCell('P7').value, hc.getCell('Q7').value], [30000, 600, 30000]);
  ok('precio promedio por tonelada', hc.getCell('R7').value, 415);
  ok('kilos sin vender', [hc.getCell('S7').value, hc.getCell('S8').value], [0, 2000]);
  ok('la plata con formato de dólares', String(hc.getCell('J7').numFmt).includes('US$'), true);
  ok('el resultado negativo en rojo', hc.getCell('M7').font.color.argb, 'FFC0392B');
  ok('fila TOTAL', hc.getCell('A9').value, 'TOTAL');
  ok('total de hectáreas, costo y resultado',
    [hc.getCell('D9').value, hc.getCell('J9').value, hc.getCell('M9').value], [70, 26920, -7970]);
  ok('el por hectárea no se suma', [hc.getCell('K9').value, hc.getCell('N9').value, hc.getCell('P9').value], [null, null, null]);
  ok('el precio promedio del total es vendido / kilos', hc.getCell('R9').value, Math.round((14050 / 38000) * 1000 * 100) / 100);
  let notaCaja = false;
  hc.eachRow((f) => { if (String(f.getCell(1).value ?? '').startsWith('Puesto, cobrado y resultado son de caja')) notaCaja = true; });
  ok('y dice que es de caja', notaCaja, true);

  const hl = campoLeido.getWorksheet('Liquidaciones');
  ok('las liquidaciones por fecha: primero la anulada', [hl.getCell('A7').value, hl.getCell('A8').value].map((v) => String(v).slice(0, 2)), ['10', '12']);
  ok('la campaña con su nombre', hl.getCell('B8').value, 'Norte · Zafra 2026/27');
  ok('el papel tal cual: kg, precio, bruto',
    [hl.getCell('D8').value, hl.getCell('E8').value, hl.getCell('F8').value], [30000, 415, 12450]);
  ok('descuentos, compensado y grano',
    [hl.getCell('G8').value, hl.getCell('H8').value, hl.getCell('I8').value], [1040, 4800, 4980]);
  ok('el neto que acreditó el banco', hl.getCell('J8').value, 1630);
  ok('la anulada tachada', hl.getCell('F7').font.strike, true);
  ok('y dice ANULADA', hl.getCell('K7').value, 'ANULADA');
  ok('el total no suma la anulada', [hl.getCell('D9').value, hl.getCell('F9').value, hl.getCell('J9').value], [30000, 12450, 1630]);
  ok('bruto − descuentos − compensado − grano = neto, en el total',
    hl.getCell('F9').value - hl.getCell('G9').value - hl.getCell('H9').value - hl.getCell('I9').value, hl.getCell('J9').value);

  const hm = campoLeido.getWorksheet('Movimientos');
  ok('Movimientos suma la columna Campaña al final', hm.getCell('L6').value, 'Campaña');
  ok('con el nombre de la campaña', hm.getCell('L7').value, 'Norte · Zafra 2026/27');
  ok('y vacía si no es de ninguna', hm.getCell('L8').value || '', '');
  ok('las columnas de siempre no se corren', hm.getCell('K6').value, 'Estado');

  // Un comercio no ve nada de esto, aunque le lleguen datos de campañas.
  const comercioConCampanas = await leerLibro(construirLibro(datosCampo({
    empresa:{ nombre:'Almacen', moneda:'PYG', rubro:'comercio' },
  })), 'comercio-campanas.xlsx');
  ok('un comercio no trae hojas de campañas',
    comercioConCampanas.worksheets.map((h) => h.name).filter((n) => n === 'Campañas' || n === 'Liquidaciones'), []);
  ok('ni la columna Campaña', comercioConCampanas.getWorksheet('Movimientos').getCell('L6').value, null);

  // El ganadero: la hoja de campañas sí (con sus lotes), la de liquidaciones
  // solo si hubo alguna. Una hoja vacía no informa.
  const ganaderoSinLiq = await leerLibro(construirLibro(datosCampo({
    empresa:{ nombre:'Estancia', moneda:'PYG', rubro:'ganaderia' }, campanas: [], liquidaciones: [],
  })), 'ganaderia-campanas.xlsx');
  const hojasGanadero = ganaderoSinLiq.worksheets.map((h) => h.name);
  ok('un ganadero sin lotes igual ve la hoja, con su aviso', hojasGanadero.includes('Campañas'), true);
  ok('y el aviso', ganaderoSinLiq.getWorksheet('Campañas').getCell('A7').value, 'Todavía no hay campañas cargadas.');
  ok('sin liquidaciones no hay hoja de liquidaciones', hojasGanadero.includes('Liquidaciones'), false);

  // El sojero en dólares que mira en guaraníes: la cotización guardada es
  // 1/6.000 (100) y el Excel lo dice como se piensa, «1 US$ = Gs. 6.000».
  const vistaGs = { moneda:'PYG', factor:1 / 0.0001666666667, propia:'USD', cotizacion:0.0001666666667, desde:'2026-09-01T12:00:00Z' };
  const campoEnGs = await leerLibro(construirLibro(enLaMonedaDeLaVista(datosCampo(), vistaGs)), 'campo-gs.xlsx');
  const hcGs = campoEnGs.getWorksheet('Campañas');
  ok('el cambio se dice al revés: 1 US$ = Gs. 6.000', String(hcGs.getCell('A3').value).includes('1 US$ = Gs. 6.000'), true);
  ok('el costo en guaraníes', Math.round(hcGs.getCell('J7').value), 128520000);
  ok('el costo por hectárea también', Math.round(hcGs.getCell('K7').value), 2570400);
  ok('los kilos no se convierten', [hcGs.getCell('O7').value, hcGs.getCell('P7').value], [30000, 600]);
  ok('las hectáreas tampoco', hcGs.getCell('D7').value, 50);
  ok('el neto de la liquidación en guaraníes', Math.round(campoEnGs.getWorksheet('Liquidaciones').getCell('J8').value), 9780000);
  ok('con formato de guaraníes', String(hcGs.getCell('J7').numFmt).includes('Gs.'), true);
  ok('los datos originales no se tocan', campanaNorte.costo, 21420);

  // En portugués: «Safras», y ninguna celda fija en español.
  const campoPt = await leerTextos(construirLibro(datosCampo({ idioma:'pt' })), 'campo-pt.xlsx');
  ok('las hojas del campo en portugués', campoPt.l.worksheets.map((h) => h.name).slice(0, 3), ['Resumo','Safras','Liquidações']);
  ok('la columna del lote dice «Lote» también en portugués', campoPt.l.getWorksheet('Safras').getCell('A6').value, 'Lote');
  ok('ninguna celda fija del campo queda en español',
    campoPt.celdas.filter((c) => soloEnEspanol.has(c)), []);

  // La ruta: lee la ficha, no una lista de rubros escrita a mano.
  const reporteTs = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'reporte.ts'), 'utf8');
  ok('el Excel pregunta a la ficha si es de ciclo largo',
    reporteTs.includes("fichaDe(empresa.rubro, empresa.tipo_cuenta ?? 'emprendedor').ciclosLargos")
    && !reporteTs.includes("empresa.rubro === 'ganaderia'"), true);
  ok('la ruta trae lo del campo solo en ciclo largo',
    rutaExcel.includes('fichaDe(empresa.rubro, empresa.tipo_cuenta).ciclosLargos')
    && rutaExcel.includes('await datosDelCampo('), true);

  console.log(fallos===0 ? '>>> EXCEL OK' : `>>> ${fallos} FALLAS`);
  process.exit(fallos?1:0);
})();
