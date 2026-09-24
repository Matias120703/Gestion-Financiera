/**
 * El libro de Excel del reporte de servicios (src/lib/reportes/excel-servicios.ts), sobre
 * `.compilado/`.
 *
 * Una barbería de ejemplo con los tres casos que la 106 arregló en la base:
 *   · Pedro, a comisión del 50 %: dos cortes de 30.000 y un pago de 15.000
 *     que NO resta otra vez (ya restó como parte de cada corte);
 *   · Luis, que alquila la silla: cobró 50.000 directo y no se le debe nada;
 *   · el dueño, que corta él mismo, y una cera vendida con costo, así que la
 *     compra de mercadería del mes va aparte.
 *
 * Se prueba: que la tarjeta anuncia las hojas que el archivo trae (es y pt,
 * con equipo y sin equipo), que el Resumen dice los números de la pantalla
 * (las mismas funciones puras), que las columnas de Movimientos suman lo que
 * dice su fila de total, lo que falta pagar al equipo, la conversión de
 * moneda y que el archivo se puede volver a abrir.
 */
const ExcelJS = require('exceljs');
const path = require('path');
const S = require('../.compilado/reportes/excel-servicios.js');
const { coincidenLasHojas, conversorDe } = require('../.compilado/reportes/comun.js');
const { fichaDe } = require('../.compilado/rubros.js');
const { RESUMEN_VACIO } = require('../.compilado/calculos.js');
const { fechaLegible } = require('../.compilado/formato.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
}

console.log('── Excel de servicios ──');

// ------------------------------------------------------------------ datos
const resumen = {
  ...RESUMEN_VACIO,
  ventas: 125000, ventasBrutas: 125000, descuentos: 0, otrosIngresos: 80000, ingresosTotales: 205000,
  costoMercaderia: 40000, gananciaBruta: 85000, gastos: 100000, gananciaNeta: 65000,
  comprasMercaderia: 60000, mercaderiaAparte: true, pagadoAProfesionales: 15000,
  margenBruto: 68, margenNeto: 52, cantidadVentas: 4, ticketPromedio: 31250, unidadesVendidas: 4,
  ventasAnuladas: 1, montoVentasAnuladas: 30000, movimientosAnulados: 1, montoMovimientosAnulados: 30000,
  conCostos: true,
};
const resumenPrevio = {
  ...RESUMEN_VACIO, ventas: 90000, ventasBrutas: 90000, ingresosTotales: 90000, costoMercaderia: 30000,
  gananciaBruta: 60000, gastos: 40000, gananciaNeta: 20000, cantidadVentas: 3, conCostos: true,
};
const liq = (x) => ({
  porcentaje: null, activo: true, cortes: 0, cobrado: 0, le_toca: 0, del_local: 0, pagado: 0, le_debe: 0,
  cobro_directo: 0, ...x,
});
const liquidacion = [
  liq({ id: 'pedro', nombre: 'Pedro', reparto: 'comision', porcentaje: 50, cortes: 2, cobrado: 60000,
    le_toca: 30000, del_local: 30000, pagado: 15000, le_debe: 15000 }),
  liq({ id: 'duenio', nombre: 'Marta', reparto: 'local', cortes: 1, cobrado: 40000, del_local: 40000 }),
  liq({ id: 'luis', nombre: 'Luis', reparto: 'alquiler', cortes: 1, cobrado: 50000, cobro_directo: 50000 }),
];
const liquidacionAcumulada = [
  liq({ id: 'pedro', nombre: 'Pedro', reparto: 'comision', porcentaje: 50, le_debe: 25000 }),
  liq({ id: 'duenio', nombre: 'Marta', reparto: 'local' }),
  liq({ id: 'luis', nombre: 'Luis', reparto: 'alquiler', cobro_directo: 200000 }),
  // Ya no trabaja acá y todavía se le debe: tiene que aparecer.
  liq({ id: 'ana', nombre: 'Ana', reparto: 'comision', porcentaje: 40, activo: false, le_debe: 5000 }),
];
const corte = (id, profesional, fecha, monto, pp, anulado = false) => ({
  id, profesional, servicio: 'Corte', fecha, monto, parte_profesional: pp, parte_local: monto - pp,
  reparto: pp === monto ? 'alquiler' : pp > 0 ? 'comision' : 'local', anulado,
});
const reparto = {
  mis_cortes: 40000, de_mi_equipo: 30000, mercaderia: 15000, otros_ingresos: 80000,
  ganancia_bruta: 85000, total: 165000,
  cortes: [
    corte('a1', 'Pedro', '2026-09-02', 30000, 15000), corte('a2', 'Pedro', '2026-09-03', 30000, 15000),
    corte('a3', 'Marta', '2026-09-02', 40000, 0), corte('a4', 'Luis', '2026-09-03', 50000, 50000),
    corte('a5', 'Pedro', '2026-09-03', 30000, 15000, true),
  ],
};
const turnos = {
  total: 6,
  por_estado: { pendiente: 0, confirmada: 0, atendida: 4, no_vino: 1, cancelada: 1 },
  por_origen: { local: 4, publico: 2 },
  por_profesional: [
    { id: 'pedro', nombre: 'Pedro', total: 4, atendidas: 2, no_vino: 1, canceladas: 1, pendientes: 0 },
    { id: 'luis', nombre: 'Luis', total: 2, atendidas: 2, no_vino: 0, canceladas: 0, pendientes: 0 },
  ],
  por_servicio: [{ producto_id: 'p-corte', nombre: 'Corte', total: 6, atendidas: 4 }],
  clientes: [{ cliente_id: 'c1', nombre: 'Juan', visitas: 2, ultima: '2026-09-03' }],
};
const ranking = [
  { nombre: 'Corte', producto_id: 'p-corte', unidades: 3, ingresosBrutos: 100000, descuento: 0, ingresos: 100000,
    costo: 30000, ganancia: 70000, margen: 70, operaciones: 3, participacion: 80 },
  { nombre: 'Cera', producto_id: 'p-cera', unidades: 1, ingresosBrutos: 25000, descuento: 0, ingresos: 25000,
    costo: 10000, ganancia: 15000, margen: 60, operaciones: 1, participacion: 20 },
];
const productos = [
  { id: 'p-corte', nombre: 'Corte', controla_stock: false, stock: 0, stock_minimo: 0, costo: 0, precio: 30000 },
  { id: 'p-cera', nombre: 'Cera', controla_stock: true, stock: 2, stock_minimo: 3, costo: 10000, precio: 25000 },
  { id: 'p-gel', nombre: 'Gel', controla_stock: true, stock: 10, stock_minimo: 2, costo: 5000, precio: 15000 },
];
const categorias = [
  { nombre: 'Alquiler', monto: 100000, operaciones: 1, participacion: 62.5 },
  { nombre: 'Mercadería', monto: 60000, operaciones: 1, participacion: 37.5 },
];
const serie = [
  { fecha: '2026-09-02', ventas: 70000, gastos: 100000, otrosIngresos: 80000, ganancia: 35000,
    comprasMercaderia: 60000, mercaderiaAparte: true, pagadoAProfesionales: 0 },
  { fecha: '2026-09-03', ventas: 55000, gastos: 0, otrosIngresos: 0, ganancia: 30000,
    comprasMercaderia: 0, mercaderiaAparte: true, pagadoAProfesionales: 15000 },
];
const mov = (x) => ({
  empresa_id: 'e', estado: 'activo', descripcion: '', categoria: 'Ventas', subtotal: x.monto, descuento: 0,
  costo_total: 0, metodo_pago: 'efectivo', contraparte: null, notas: null, origen: 'manual', creado_por: null,
  created_at: '2026-09-02T10:00:00Z', anulado_por: null, anulado_at: null, motivo_anulacion: null,
  actualizado_por: null, updated_at: null, cuenta_nombre: 'Caja', ...x,
});
const movimientos = [
  mov({ id: 'm1', tipo: 'venta', fecha: '2026-09-02', descripcion: 'Corte', monto: 30000, costo_total: 15000, cliente_nombre: 'Juan' }),
  mov({ id: 'm2', tipo: 'venta', fecha: '2026-09-03', descripcion: 'Corte', monto: 30000, costo_total: 15000 }),
  mov({ id: 'm3', tipo: 'venta', fecha: '2026-09-02', descripcion: 'Corte', monto: 40000, costo_total: 0 }),
  mov({ id: 'm4', tipo: 'venta', fecha: '2026-09-03', descripcion: 'Cera', monto: 25000, costo_total: 10000 }),
  mov({ id: 'm5', tipo: 'ingreso', fecha: '2026-09-02', descripcion: 'Alquiler de silla · Luis', categoria: 'Otros', monto: 80000 }),
  mov({ id: 'm6', tipo: 'gasto', fecha: '2026-09-03', descripcion: 'Pago a Pedro', categoria: 'Sueldos', monto: 15000 }),
  mov({ id: 'm7', tipo: 'gasto', fecha: '2026-09-02', descripcion: 'Alquiler del local', categoria: 'Alquiler', monto: 100000 }),
  mov({ id: 'm8', tipo: 'gasto', fecha: '2026-09-02', descripcion: 'Ceras y geles', categoria: 'Mercadería', monto: 60000 }),
  mov({ id: 'm9', tipo: 'venta', fecha: '2026-09-03', descripcion: 'Corte', monto: 30000, costo_total: 15000,
    estado: 'anulado', motivo_anulacion: 'se cargó dos veces' }),
];
const pagos = [{ fecha: '2026-09-03', profesional: 'Pedro', monto: 15000, de_comision: true, notas: '', movimiento_id: 'm6' }];
const profesionalDeMovimiento = { m1: 'Pedro', m2: 'Pedro', m3: 'Marta', m6: 'Pedro', m9: 'Pedro' };

const datos = (x = {}) => ({
  empresa: { nombre: 'Barbería Norte', moneda: 'PYG', tipo_cuenta: 'emprendedor', rubro: 'servicios' },
  desde: '2026-09-02', hasta: '2026-09-03', idioma: 'es', jerga: null,
  resumen, resumenPrevio, previo: { desde: '2026-08-31', hasta: '2026-09-01' },
  categorias, serie, movimientos, ranking, productos,
  reparto, liquidacion, liquidacionAcumulada, pagos, turnos, profesionalDeMovimiento,
  ...x,
});

// Busca en la columna `col` la fila cuya celda dice `texto` y devuelve la fila.
function filaCon(h, col, texto) {
  let hallada = null;
  h.eachRow((fila) => { if (!hallada && fila.getCell(col).value === texto) hallada = fila; });
  return hallada;
}

(async () => {
  const ficha = fichaDe('servicios', 'emprendedor');

  // ---------------------------------------------------------------- las cuentas puras
  console.log('· las cuentas que comparten la pantalla y el Excel');
  ok('el desglose del local cierra con la ganancia bruta',
    S.cuentaDelLocal(resumen, reparto, liquidacion), { misCortes: 40000, deMiEquipo: 30000, productos: 15000, quedo: 85000 });
  ok('si el desglose no cierra, no se muestra',
    S.cuentaDelLocal(resumen, { ...reparto, mercaderia: 14000 }, liquidacion), null);
  ok('sin equipo que reparta, no hay desglose',
    S.cuentaDelLocal(resumen, reparto, liquidacion.map((l) => ({ ...l, cortes: 0 }))), null);
  ok('sin costos a la vista, no hay desglose',
    S.cuentaDelLocal({ ...resumen, conCostos: false }, reparto, liquidacion), null);

  const sep = S.separarRanking([...ranking, { ...ranking[1], nombre: 'Gel', producto_id: 'p-gel', costo: 0, ganancia: 15000, margen: 100 }], productos);
  ok('los servicios van por un lado', sep.servicios.map((p) => p.nombre), ['Corte']);
  ok('la mercadería por otro', sep.mercaderia.map((p) => p.nombre), ['Cera', 'Gel']);
  ok('el gel vendido con costo 0 se avisa', sep.sinCosto, 1);
  ok('un servicio con costo 0 NO se avisa (es un corte propio)',
    S.separarRanking([{ ...ranking[0], costo: 0 }], productos).sinCosto, 0);
  ok('a reponer: lo que está en el mínimo o debajo, solo con stock', S.aReponer(productos).map((p) => p.nombre), ['Cera']);

  const g = S.gastosVisibles(categorias, resumen);
  ok('con la mercadería aparte, sale de la lista', g.filas.map((c) => c.nombre), ['Alquiler']);
  ok('la lista suma lo mismo que «Gastos»', g.filas.reduce((s, c) => s + c.monto, 0), resumen.gastos);
  ok('y el porcentaje se recalcula', g.filas[0].participacion, 100);
  ok('compraste mercadería, aparte', g.comprasAparte, 60000);
  ok('sin costo cargado, la mercadería resta como siempre',
    S.gastosVisibles(categorias, { ...resumen, mercaderiaAparte: false }).filas.length, 2);
  ok('«Mercadoria» (pt) también se reconoce',
    S.gastosVisibles([{ ...categorias[1], nombre: 'Mercadoria' }], resumen).filas.length, 0);

  const equipo = S.filasDelEquipo(liquidacion, liquidacionAcumulada, turnos);
  ok('el equipo: los del período y quien ya no está pero se le debe', equipo.map((e) => e.nombre), ['Pedro', 'Marta', 'Luis', 'Ana']);
  const luis = equipo.find((e) => e.id === 'luis');
  // Los cortes del que alquila son suyos: «le toca» los cuenta (no puede
  // decir 0 mientras cada corte es de él); lo que lo separa es «falta pagar».
  ok('a quien alquila la silla le toca todo lo suyo', luis.le_toca, 50000);
  ok('ni «falta pagar»', luis.falta, 0);
  ok('su cobro directo se ve aparte', luis.cobro_directo, 50000);
  ok('cobrado = para el local + le toca, en cada fila del período',
    equipo.slice(0, 3).map((e) => e.cobrado - e.del_local - e.le_toca), [0, 0, 0]);
  // La 106 puede devolver `le_toca` sin lo cobrado directo (hoy) o con él
  // (el arreglo propuesto para /reparto, que saca el alquiler solo de
  // le_debe). El reporte tiene que decir lo mismo con las dos.
  const conLoDirecto = liquidacion.map((l) => (l.id === 'luis' ? { ...l, le_toca: 50000 } : l));
  ok('«le toca» da lo mismo con cualquiera de las dos versiones de la 106',
    S.filasDelEquipo(conLoDirecto, liquidacionAcumulada, turnos).map((e) => [e.le_toca, e.falta]),
    equipo.map((e) => [e.le_toca, e.falta]));
  ok('a Pedro le falta lo del período y lo de antes', equipo[0].falta, 25000);
  ok('sus turnos', equipo[0].turnos, { atendidas: 2, no_vino: 1, canceladas: 1, pendientes: 0, total: 4 });
  ok('Marta no tuvo turnos: null, no cero', equipo[1].turnos, null);
  ok('Ana: sin nada en el período, con su deuda', [equipo[3].cortes, equipo[3].falta], [0, 5000]);
  ok('falta pagar al equipo', S.faltaPagarAlEquipo(equipo), 30000);
  ok('un adelanto no descuenta la deuda de otro',
    S.faltaPagarAlEquipo([{ falta: -10000 }, { falta: 4000 }, { falta: null }]), 4000);

  const fuera = S.fueraDeLaGanancia(movimientos, pagos, resumen);
  ok('fuera de la ganancia: el pago a comisión y la compra aparte',
    Array.from(fuera.entries()), [['m6', 'comision'], ['m8', 'mercaderia']]);

  // ---------------------------------------------------------------- las hojas
  console.log('· las hojas que anuncia la tarjeta');
  for (const idioma of ['es', 'pt']) {
    const libro = S.libroServicios(datos({ idioma }));
    const nombres = libro.worksheets.map((h) => h.name);
    ok(`${idioma}: la tarjeta coincide con el libro (con equipo)`, coincidenLasHojas(S.hojasServicios(ficha, idioma), nombres), true);
    ok(`${idioma}: trae todas`, nombres.length, 8);
    // Un taller sin equipo y sin agenda: ni Por profesional ni Turnos.
    const solo = S.libroServicios(datos({
      idioma, liquidacion: [], liquidacionAcumulada: [], pagos: [], profesionalDeMovimiento: {},
      reparto: { ...reparto, mis_cortes: 0, de_mi_equipo: 0, mercaderia: 85000, cortes: [] },
      turnos: { total: 0, por_estado: { pendiente: 0, confirmada: 0, atendida: 0, no_vino: 0, cancelada: 0 },
        por_origen: { local: 0, publico: 0 }, por_profesional: [], por_servicio: [], clientes: [] },
    }));
    const nombresSolo = solo.worksheets.map((h) => h.name);
    ok(`${idioma}: la tarjeta coincide con el libro (sin equipo ni agenda)`, coincidenLasHojas(S.hojasServicios(ficha, idioma), nombresSolo), true);
    ok(`${idioma}: sin equipo ni agenda son 6`, nombresSolo.length, 6);
    ok(`${idioma}: sin equipo, Movimientos no trae la columna Profesional`,
      solo.getWorksheet(nombresSolo[3]).getRow(6).values.includes(idioma === 'pt' ? 'Profissional' : 'Profesional'), false);
  }
  ok('la hoja de servicios lleva la palabra de la ficha',
    S.hojasServicios(ficha, 'es').map((h) => h.nombre),
    ['Resumen', 'Por profesional', 'Turnos', 'Servicios y productos', 'Movimientos', 'Gastos', 'Día por día', 'Para tu contador']);
  ok('en portugués también',
    S.hojasServicios(ficha, 'pt').map((h) => h.nombre),
    ['Resumo', 'Por profissional', 'Horários', 'Serviços e produtos', 'Lançamentos', 'Despesas', 'Dia a dia', 'Para o contador']);

  // ---------------------------------------------------------------- lo que dice cada hoja
  console.log('· los números de cada hoja');
  const libro = S.libroServicios(datos());
  const salida = path.join(__dirname, '..', '.compilado', 'reporte-servicios.xlsx');
  await libro.xlsx.writeFile(salida);
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.readFile(salida);
  ok('el archivo se vuelve a abrir', leido.worksheets.length, 8);

  const res = leido.getWorksheet('Resumen');
  ok('Resumen: el nombre del negocio', res.getCell('A1').value, 'Barbería Norte');
  const cob = filaCon(res, 2, 'Cobrado');
  ok('Resumen: cobrado, ahora y antes', [cob.getCell(3).value, cob.getCell(4).value], [125000, 90000]);
  const quedo = filaCon(res, 2, 'Quedó para el local');
  ok('Resumen: quedó para el local = ganancia bruta', [quedo.getCell(3).value, quedo.getCell(4).value], [85000, 60000]);
  ok('Resumen: el desglose (tus servicios)', filaCon(res, 2, 'Tus servicios').getCell(3).value, 40000);
  ok('Resumen: gastos del local', filaCon(res, 2, 'Gastos del local').getCell(3).value, -100000);
  ok('Resumen: la mercadería aparte', filaCon(res, 2, 'Compraste mercadería').getCell(3).value, 60000);
  ok('Resumen: lo pagado a comisión, aparte', filaCon(res, 2, 'Pagado al equipo a comisión').getCell(3).value, 15000);
  const neta = filaCon(res, 2, 'Ganancia neta');
  ok('Resumen: ganancia neta, ahora y antes', [neta.getCell(3).value, neta.getCell(4).value], [65000, 20000]);
  ok('Resumen: turnos atendidos', filaCon(res, 2, 'Atendidos').getCell(3).value, 4);
  ok('Resumen: falta pagar al equipo, a la última fecha del período',
    filaCon(res, 2, `Falta pagar al equipo al ${fechaLegible('2026-09-03', true, 'es-PY')}`).getCell(3).value, 30000);

  const eq = leido.getWorksheet('Por profesional');
  const filaLuis = filaCon(eq, 1, 'Luis');
  // Le toca 50.000 (sus cortes son suyos), los cobró directo, y no se le debe nada.
  ok('Por profesional: Luis cobró directo y no se le debe', [filaLuis.getCell(6).value, filaLuis.getCell(8).value, filaLuis.getCell(9).value], [50000, 50000, 0]);
  ok('Por profesional: en el TOTAL, Cobró = Para el local + Le toca',
    (() => { const t = filaCon(eq, 1, 'TOTAL'); return t.getCell(4).value - t.getCell(5).value - t.getCell(6).value; })(), 0);
  ok('Por profesional: Pedro, a comisión', filaCon(eq, 1, 'Pedro').getCell(2).value, 'Comisión 50%');
  ok('Por profesional: Ana ya no está', filaCon(eq, 1, 'Ana').getCell(2).value, 'Comisión 40% · ya no está');
  ok('Por profesional: el total de lo que falta', filaCon(eq, 1, 'TOTAL').getCell(9).value, 30000);

  const tur = leido.getWorksheet('Turnos');
  ok('Turnos: el total por estado', filaCon(tur, 1, 'TOTAL').getCell(2).value, 6);
  ok('Turnos: por el link', filaCon(tur, 1, 'Por tu link de reservas').getCell(2).value, 2);
  ok('Turnos: el cliente que más vuelve, sin teléfono', filaCon(tur, 1, 'Juan').values.slice(1, 4).length, 3);

  const serv = leido.getWorksheet('Servicios y productos');
  ok('Servicios: el corte arriba', serv.getCell('B7').value, 'Corte');
  ok('Servicios: la cera en su tabla', !!filaCon(serv, 2, 'Cera'), true);
  ok('Servicios: la cera está para reponer', !!filaCon(serv, 1, 'A REPONER (1)'), true);

  // Movimientos: las columnas de plata suman lo que dice el total.
  const movs = leido.getWorksheet('Movimientos');
  const cab = movs.getRow(6).values;
  const cMonto = cab.indexOf('Monto');
  const cLocal = cab.indexOf('Para el local');
  const cNota = cab.indexOf('Nota');
  ok('Movimientos: trae Cuenta, Cliente y Profesional',
    ['Cuenta', 'Cliente', 'Profesional'].every((c) => cab.includes(c)), true);
  let sumaMonto = 0, sumaLocal = 0, total = null;
  movs.eachRow((fila, n) => {
    if (n < 7) return;
    if (fila.getCell(3).value === 'TOTAL DEL PERIODO (sin anuladas)') { total = fila; return; }
    const estado = fila.getCell(cab.indexOf('Estado')).value;
    if (estado !== 'Válida') return;
    sumaMonto += Number(fila.getCell(cMonto).value ?? 0);
    sumaLocal += Number(fila.getCell(cLocal).value ?? 0);
  });
  ok('Movimientos: la columna «Para el local» suma la ganancia neta', [sumaLocal, total.getCell(cLocal).value], [65000, 65000]);
  ok('Movimientos: la columna «Monto» suma la caja', [sumaMonto, total.getCell(cMonto).value], [30000, 30000]);
  ok('Movimientos: el pago a Pedro lleva su nota', filaCon(movs, 3, 'Pago a Pedro').getCell(cNota).value,
    'Pago al equipo: ya restó en cada servicio');
  ok('Movimientos: el cliente del corte', filaCon(movs, cab.indexOf('Cliente'), 'Juan').getCell(cab.indexOf('Profesional')).value, 'Pedro');

  const gas = leido.getWorksheet('Gastos');
  ok('Gastos: el total es el del resumen', filaCon(gas, 2, 'TOTAL').getCell(3).value, 100000);
  ok('Gastos: la mercadería no está en la lista', filaCon(gas, 2, 'Mercadería'), null);
  ok('Gastos: va aparte, afuera del total',
    filaCon(gas, 2, 'Compraste mercadería (ya resta el costo de lo vendido)').getCell(3).value, 60000);

  const dia = leido.getWorksheet('Día por día');
  const totDia = filaCon(dia, 2, 'TOTAL');
  ok('Día por día: la cabecera dice Cobrado', dia.getRow(6).getCell(3).value, 'Cobrado');
  ok('Día por día: el total es la ganancia neta', totDia.getCell(6).value, 65000);
  ok('Día por día: la suma de los días da lo mismo', serie.reduce((s, d) => s + d.ganancia, 0), 65000);

  const cont = leido.getWorksheet('Para tu contador');
  ok('Contador: total que salió de la caja', filaCon(cont, 2, 'Total que salió').getCell(3).value, 175000);
  let aclaraSet = false;
  cont.eachRow((f) => { if (String(f.getCell(2).value ?? '').includes('SET')) aclaraSet = true; });
  ok('Contador: aclara que no reemplaza a la SET', aclaraSet, true);

  // ---------------------------------------------------------------- moneda de la vista
  console.log('· en la moneda de la vista');
  const extras = { reparto, liquidacion, liquidacionAcumulada, pagos, turnos, profesionalDeMovimiento };
  const igual = conversorDe({ moneda: 'PYG', propia: 'PYG', factor: 1 });
  ok('sin conversión, es lo mismo', S.enLaVistaServicios(extras, igual) === extras, true);
  const usd = S.enLaVistaServicios(extras, conversorDe({ moneda: 'USD', propia: 'PYG', factor: 1 / 7500 }));
  ok('le debe a Pedro, en dólares', usd.liquidacionAcumulada[0].le_debe, 3.333333);
  ok('el cobro directo de Luis, en dólares', usd.liquidacion[2].cobro_directo, 6.666667);
  ok('el desglose, en dólares', usd.reparto.ganancia_bruta, 11.333333);
  ok('cada corte, en dólares', usd.reparto.cortes[0].monto, 4);
  ok('el pago, en dólares', usd.pagos[0].monto, 2);
  ok('los turnos no son plata', usd.turnos, turnos);
  const libroUsd = S.libroServicios(datos({ empresa: { nombre: 'Barbería Norte', moneda: 'USD', tipo_cuenta: 'emprendedor', rubro: 'servicios' } }));
  ok('el libro en dólares lleva el símbolo del dólar',
    String(filaCon(libroUsd.getWorksheet('Resumen'), 2, 'Cobrado').getCell(3).numFmt).includes('US$'), true);

  console.log(`\n${corridas} comprobaciones, ${fallos} fallos`);
  process.exit(fallos > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
