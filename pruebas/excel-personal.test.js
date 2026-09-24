/**
 * El reporte de la cuenta personal (contrato 2.5): el libro de Excel y las
 * cuentas que comparte con la pantalla (src/lib/reportes/excel-personal.ts),
 * sobre `.compilado/`.
 *
 * Los agregados se calculan con calculos.ts, que la prueba de reconciliación
 * (agregados.test.js) garantiza igual a la base. Lo que se prueba:
 *
 *   · la tarjeta anuncia exactamente las hojas que trae el archivo, en es y
 *     en pt, con todo cargado y con lo mínimo (sin fijos, fondos ni deudas);
 *   · los cuatro números (Entró, Salió, Guardé, Te quedó) y su período
 *     anterior salen iguales en el Resumen que en las funciones que usa la
 *     pantalla;
 *   · cuántos ciclos entran en un rango (el presupuesto se multiplica por
 *     eso, y no se compara un rango que corta un ciclo por la mitad);
 *   · el presupuesto contra lo gastado, con semáforo;
 *   · los fijos pagados y pendientes con la regla de la base (lo que falta
 *     suma lo mismo que `fijos_por_pagar`);
 *   · las barras de seis ciclos, las deudas del período y las metas;
 *   · Movimientos con la columna Cuenta;
 *   · la conversión a la moneda de la vista no toca un fondo en otra moneda
 *     ni convierte lo que falta.
 */
const ExcelJS = require('exceljs');
const path = require('path');
const P = require('../.compilado/reportes/excel-personal.js');
const { coincidenLasHojas, conversorDe } = require('../.compilado/reportes/comun.js');
const { resumir, gastosPorCategoria, ingresosPorCategoria, serieDiaria, RESUMEN_VACIO } = require('../.compilado/calculos.js');
const { diasDelRango } = require('../.compilado/fechas.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
}

console.log('── Excel de personal ──');

// ------------------------------------------------------------------ las cuentas

// Ciclos del rango: quien cobra el 5.
ok('ciclo del 5 al 4: un ciclo', P.ciclosDelRango('2026-08-05', '2026-09-04', 5), 1);
ok('ciclo en curso (del 5 a hoy): un ciclo', P.ciclosDelRango('2026-09-05', '2026-09-24', 5), 1);
ok('mes calendario para quien cobra el 5: no se compara', P.ciclosDelRango('2026-09-01', '2026-09-24', 5), 0);
ok('tres ciclos del 5', P.ciclosDelRango('2026-06-05', '2026-09-04', 5), 3);
ok('sin día de cobro, el mes es el ciclo', P.ciclosDelRango('2026-09-01', '2026-09-30', null), 1);
ok('sin día de cobro, el año corrido', P.ciclosDelRango('2026-01-01', '2026-09-24', null), 9);
ok('un día suelto no es un ciclo', P.ciclosDelRango('2026-09-24', '2026-09-24', null), 0);
ok('«Todo» pasa del tope: no se compara', P.presupuestoAplica(P.ciclosDelRango('2000-01-01', '2026-09-24', null)), false);
ok('cobra el 31: en febrero cobra el 28', P.ciclosDelRango('2026-02-28', '2026-03-30', 31), 1);

// Salió: la mercadería que la 106 saca de `gastos` vuelve a sumar para una persona.
{
  const r = { ...RESUMEN_VACIO, ingresosTotales: 1000, gastos: 300, comprasMercaderia: 200, mercaderiaAparte: true };
  ok('salió suma la mercadería aparte', P.salioDe(r), 500);
  ok('te quedó = entró − salió', P.teQuedoDe(r), 500);
  ok('sin mercadería aparte, salió es gastos', P.salioDe({ ...r, mercaderiaAparte: false }), 300);
}

// Presupuesto contra lo gastado.
{
  const gastos = [
    { nombre: 'Comida', monto: 900, operaciones: 9, participacion: 60 },
    { nombre: 'Transporte', monto: 450, operaciones: 3, participacion: 30 },
    { nombre: 'Regalos', monto: 150, operaciones: 1, participacion: 10 },
  ];
  const plan = [
    { categoria: 'Comida', planeado: 800 },
    { categoria: 'Transporte', planeado: 500 },
    { categoria: 'Salidas', planeado: 300 },
  ];
  const g = P.enQueSeFue(gastos, plan, 1);
  ok('en qué se fue: primero lo gastado, después lo planeado sin gasto',
    g.filas.map((f) => f.nombre), ['Comida', 'Transporte', 'Regalos', 'Salidas']);
  ok('comida se pasó', [g.filas[0].diferencia, g.filas[0].semaforo], [-100, 'pasado']);
  ok('transporte al 90 %: cerca', [g.filas[1].usado, g.filas[1].semaforo], [90, 'cerca']);
  ok('regalos sin plan', [g.filas[2].planeado, g.filas[2].semaforo], [null, null]);
  ok('salidas: planeado sin gastar', [g.filas[3].monto, g.filas[3].diferencia, g.filas[3].semaforo], [0, 300, 'bien']);
  ok('totales del plan', [g.pasadas, g.planeadoTotal, g.gastadoEnPlan, g.gastadoSinPlan], [1, 1600, 1350, 150]);
  const tres = P.enQueSeFue(gastos, plan, 3);
  ok('tres ciclos: el plan por tres', tres.filas[0].planeado, 2400);
  const nada = P.enQueSeFue(gastos, plan, 0);
  ok('rango que corta un ciclo: sin presupuesto', [nada.filas.length, nada.filas.every((f) => f.planeado === null)], [3, true]);
}

// Fijos: la regla de la base, repartida en el orden en que vencen.
{
  const fijos = [
    { nombre: 'Agua', categoria: 'Servicios', importe: 100, dia_del_mes: 20 },
    { nombre: 'Luz', categoria: 'Servicios', importe: 300, dia_del_mes: 10 },
    { nombre: 'Internet', categoria: 'Internet', importe: 200, dia_del_mes: 15 },
    { nombre: 'Bus', categoria: 'Transporte', importe: 150, dia_del_mes: null },
  ];
  const gastos = [
    { nombre: 'Servicios', monto: 350, operaciones: 2, participacion: 50 },
    { nombre: 'Transporte', monto: 400, operaciones: 10, participacion: 50 },
  ];
  const f = P.fijosDelCiclo(fijos, gastos);
  ok('fijos en orden de vencimiento, sin día al final', f.filas.map((x) => x.nombre), ['Luz', 'Internet', 'Agua', 'Bus']);
  ok('estados', f.filas.map((x) => x.estado), ['pagado', 'pendiente', 'parcial', 'pagado']);
  ok('al agua le faltan 50', f.filas[2].falta, 50);
  // La base: suma por categoría de greatest(0, fijos − gastado).
  const base = Math.max(0, 400 - 350) + Math.max(0, 200 - 0) + Math.max(0, 150 - 400);
  ok('lo que falta es lo mismo que fijos_por_pagar', f.falta, base);
  ok('total y cubierto', [f.total, f.cubierto], [750, 500]);
}

// Barras: seis ciclos hasta el fin del rango.
{
  const t = P.ultimosCiclos('2026-09-24', 5, 6);
  ok('seis ciclos', t.length, 6);
  ok('el primero empieza un 5', t[0], { desde: '2026-04-05', hasta: '2026-05-04' });
  ok('el último va hasta hoy', t[5], { desde: '2026-09-05', hasta: '2026-09-24' });
  const m = P.ultimosCiclos('2026-02-10', null, 3);
  ok('sin día: meses, cruzando el año', m, [
    { desde: '2025-12-01', hasta: '2025-12-31' }, { desde: '2026-01-01', hasta: '2026-01-31' }, { desde: '2026-02-01', hasta: '2026-02-10' },
  ]);
  const serie = [
    { fecha: '2026-09-05', ventas: 0, otrosIngresos: 1000, gastos: 200, comprasMercaderia: 0, mercaderiaAparte: false },
    { fecha: '2026-09-04', ventas: 0, otrosIngresos: 0, gastos: 50, comprasMercaderia: 0, mercaderiaAparte: false },
  ];
  const b = P.barrasPorCiclo(t, serie, [0, 0, 0, 0, 10, 300]);
  ok('barras: el día 4 es del ciclo anterior', [b[4].salio, b[5].entro, b[5].salio, b[5].guardo], [50, 1000, 200, 300]);
  ok('etiqueta con día', P.etiquetaTramo('2026-08-05', 5, 'es-PY').startsWith('5 '), true);
}

// Deudas del período.
{
  const deudas = [
    { id: 'd1', tipo: 'tarjeta', nombre: 'Visa', acreedor: 'Banco', monto_original: 1000, saldo: 600, cuotas_totales: 10, cuotas_pagadas: 4, monto_cuota: 100, vence_el: '2026-10-10', vencida: false, activa: true },
    { id: 'd2', tipo: 'prestamo', nombre: 'Primo', acreedor: 'Juan', monto_original: 500, saldo: 0, cuotas_totales: null, cuotas_pagadas: 0, monto_cuota: null, vence_el: null, vencida: false, activa: true },
    { id: 'd3', tipo: 'otro', nombre: 'Vieja', acreedor: '', monto_original: 50, saldo: 0, cuotas_totales: null, cuotas_pagadas: 0, monto_cuota: null, vence_el: null, vencida: false, activa: true },
  ];
  const pagos = [
    { deuda_id: 'd1', fecha: '2026-09-10', monto: 100, nota: '' },
    { deuda_id: 'd2', fecha: '2026-09-12', monto: 500, nota: 'saldada' },
  ];
  const d = P.deudasDelReporte(deudas, pagos);
  ok('deudas: abiertas y las saldadas en el período, no las viejas', d.filas.map((x) => x.id), ['d1', 'd2']);
  ok('debés hoy, pagado y próximo', [d.debesHoy, d.pagadoEnPeriodo, d.proximoVencimiento], [600, 600, '2026-10-10']);
}

// Metas: los fondos de hoy con lo guardado en el período, unidos por nombre.
{
  const fondos = [
    { nombre: 'Viaje', moneda: null, saldo: 700, meta: 1000, fecha_limite: '2026-12-31', falta: 300, por_mes: 100 },
    { nombre: 'Dólares', moneda: 'USD', saldo: 50, meta: null, fecha_limite: null, falta: null, por_mes: null },
  ];
  const ahorro = { aportado: 400, retirado: 100, neto: 300, porFondo: [
    { nombre: 'Viaje', aportado: 400, retirado: 0, neto: 400, saldo_hoy: 700 },
    { nombre: 'Cerrado', aportado: 0, retirado: 100, neto: -100, saldo_hoy: 0 },
  ] };
  const m = P.metasDeAhorro(fondos, ahorro);
  ok('metas: los de hoy y el que se movió aunque ya no esté', m.map((x) => [x.nombre, x.guardadoEnPeriodo]), [['Viaje', 400], ['Dólares', 0], ['Cerrado', -100]]);
}

// ------------------------------------------------------------------ el libro

const base = { estado: 'activo', descuento: 0, contraparte: '', notas: '', origen: 'manual', costo_total: 0 };
const movimientos = [
  { ...base, id: 'm1', tipo: 'ingreso', fecha: '2026-09-05', descripcion: 'Sueldo', categoria: 'Sueldo', subtotal: 5000000, monto: 5000000, metodo_pago: 'transferencia', cuenta_nombre: 'Ueno' },
  { ...base, id: 'm2', tipo: 'gasto', fecha: '2026-09-06', descripcion: 'Súper', categoria: 'Comida', subtotal: 900000, monto: 900000, metodo_pago: 'tarjeta', cuenta_nombre: 'Ueno' },
  { ...base, id: 'm3', tipo: 'gasto', fecha: '2026-09-10', descripcion: 'ANDE', categoria: 'Servicios', subtotal: 350000, monto: 350000, metodo_pago: 'efectivo', cuenta_nombre: null },
  { ...base, id: 'm4', tipo: 'gasto', fecha: '2026-09-12', descripcion: 'Cancelado', categoria: 'Comida', subtotal: 80000, monto: 80000, metodo_pago: 'efectivo', estado: 'anulado', motivo_anulacion: 'repetido' },
];
const previos = [
  { ...base, id: 'p1', tipo: 'ingreso', fecha: '2026-08-05', descripcion: 'Sueldo', categoria: 'Sueldo', subtotal: 4000000, monto: 4000000, metodo_pago: 'transferencia' },
  { ...base, id: 'p2', tipo: 'gasto', fecha: '2026-08-06', descripcion: 'Súper', categoria: 'Comida', subtotal: 1000000, monto: 1000000, metodo_pago: 'tarjeta' },
];
const desde = '2026-09-05', hasta = '2026-09-24';

function datos({ idioma, minimo = false } = {}) {
  const resumen = resumir(movimientos);
  const categorias = gastosPorCategoria(movimientos);
  return {
    empresa: { nombre: 'Mis finanzas', moneda: 'PYG', tipo_cuenta: 'personal' },
    desde, hasta, idioma, jerga: null,
    resumen,
    resumenPrevio: resumir(previos),
    previo: { desde: '2026-08-05', hasta: '2026-08-24' },
    categorias,
    serie: serieDiaria(movimientos, diasDelRango(desde, hasta, 400)),
    movimientos,
    ingresos: ingresosPorCategoria(movimientos),
    ahorro: minimo ? { aportado: 0, retirado: 0, neto: 0, porFondo: [] }
      : { aportado: 500000, retirado: 0, neto: 500000, porFondo: [{ nombre: 'Viaje', aportado: 500000, retirado: 0, neto: 500000, saldo_hoy: 2000000 }] },
    diaCobro: 5,
    guardadoPrevio: minimo ? 0 : 250000,
    presupuesto: [{ categoria: 'Comida', planeado: 800000 }, { categoria: 'Salidas', planeado: 300000 }],
    fijos: minimo ? [] : [{ nombre: 'Luz', categoria: 'Servicios', importe: 300000, dia_del_mes: 10 }, { nombre: 'Internet', categoria: 'Internet', importe: 200000, dia_del_mes: 15 }],
    fondos: minimo ? [] : [{ nombre: 'Viaje', moneda: null, saldo: 2000000, meta: 5000000, fecha_limite: '2026-12-31', falta: 3000000, por_mes: 1000000 }],
    deudas: minimo ? [] : [{ id: 'd1', tipo: 'tarjeta', nombre: 'Visa', acreedor: 'Banco', monto_original: 3000000, saldo: 1800000, cuotas_totales: 6, cuotas_pagadas: 2, monto_cuota: 500000, vence_el: '2026-10-10', vencida: false, activa: true }],
    pagosDeuda: minimo ? [] : [{ deuda_id: 'd1', fecha: '2026-09-10', monto: 500000, nota: '' }],
    teDeben: minimo ? null : { totalHoy: 150000, cuantos: 1, devuelto: 50000, prestado: 0 },
  };
}

/** Los valores de una hoja como texto, para buscar. */
function textoDe(hoja) {
  const t = [];
  hoja.eachRow((fila) => fila.eachCell((c) => t.push(String(c.value ?? ''))));
  return t;
}

/** La fila del Resumen cuya columna B dice `etiqueta`: [este, antes, diferencia]. */
function filaDe(hoja, etiqueta) {
  let r = null;
  hoja.eachRow((fila) => {
    if (!r && fila.getCell(2).value === etiqueta) r = [fila.getCell(3).value, fila.getCell(4).value, fila.getCell(5).value];
  });
  return r;
}

(async () => {
  for (const idioma of ['es', 'pt']) {
    for (const minimo of [false, true]) {
      const d = datos({ idioma, minimo });
      const libro = P.libroPersonal(d);
      const nombres = libro.worksheets.map((h) => h.name);
      ok(`hojas anunciadas = hojas reales (${idioma}${minimo ? ', mínimo' : ''})`,
        coincidenLasHojas(P.hojasPersonal(null, idioma), nombres), true);
      if (!minimo) ok(`con todo, trae las ocho hojas (${idioma})`, nombres.length, 8);
      else ok(`mínimo: sin fijos, ahorro ni deudas (${idioma})`, nombres.length, 5);
      // Que se pueda escribir de verdad (un merge mal hecho revienta acá).
      await libro.xlsx.writeBuffer();
    }
  }

  const d = datos({ idioma: 'es' });
  const libro = P.libroPersonal(d);
  const buf = await libro.xlsx.writeBuffer();
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(buf);
  await libro.xlsx.writeFile(path.join(__dirname, '..', '.compilado', 'personal-por-ciclo.xlsx'));

  // Los cuatro números: los mismos que calcula la pantalla.
  const res = leido.getWorksheet('Resumen');
  const r = d.resumen, rp = d.resumenPrevio;
  ok('Entró: este, antes y diferencia', filaDe(res, 'Entró'), [P.entroDe(r), P.entroDe(rp), P.entroDe(r) - P.entroDe(rp)]);
  ok('Salió sin el anulado', filaDe(res, 'Salió'), [1250000, 1000000, 250000]);
  ok('Guardé contra el anterior', filaDe(res, 'Guardé'), [500000, 250000, 250000]);
  ok('Te quedó', filaDe(res, 'Te quedó'), [3750000, 3000000, 750000]);
  ok('el Resumen aclara lo devuelto', textoDe(res).some((x) => x.includes('no suma en «Entró»')), true);

  // En qué se fue con presupuesto.
  const eq = leido.getWorksheet('En qué se fue');
  let comida = null;
  eq.eachRow((f) => { if (f.getCell(2).value === 'Comida') comida = [f.getCell(3).value, f.getCell(6).value, f.getCell(7).value]; });
  ok('comida: gastado, plan y diferencia', comida, [900000, 800000, -100000]);
  ok('salidas aparece aunque no se gastó', textoDe(eq).includes('Salidas'), true);
  ok('nota del plan de hoy', textoDe(eq).some((x) => x.startsWith('El presupuesto es el de hoy')), true);

  // Fijos: la luz pagada (se gastaron 350.000 en Servicios), internet pendiente.
  const fj = leido.getWorksheet('Gastos fijos');
  ok('fijos: estados', textoDe(fj).filter((x) => x === 'Pagado' || x === 'Pendiente'), ['Pagado', 'Pendiente']);
  // Con todos cubiertos, el TOTAL dice «Pagado», no «Falta Gs. 0».
  {
    const todo = P.libroPersonal({ ...datos({ idioma: 'es' }), fijos: [{ nombre: 'Luz', categoria: 'Servicios', importe: 300000, dia_del_mes: 10 }] });
    const t2 = textoDe(todo.getWorksheet('Gastos fijos'));
    ok('fijos cubiertos: el total dice Pagado', [t2.filter((x) => x === 'Pagado').length, t2.some((x) => x.startsWith('Falta'))], [2, false]);
  }

  // Deudas: saldo de hoy y el pago del período.
  const de = leido.getWorksheet('Deudas');
  ok('deudas: la cuota y el pago', [textoDe(de).includes('2 de 6'), textoDe(de).includes('1800000'), textoDe(de).includes('500000')], [true, true, true]);

  // Movimientos: la columna Cuenta.
  const mv = leido.getWorksheet('Movimientos');
  ok('Movimientos: encabezado Cuenta', mv.getRow(6).getCell(5).value, 'Cuenta');
  ok('Movimientos: la cuenta de cada uno', [mv.getRow(7).getCell(5).value, mv.getRow(9).getCell(5).value], ['Ueno', '—']);

  // Un rango que corta el ciclo: sin presupuesto y sin estado de fijos.
  {
    const corte = P.libroPersonal({ ...datos({ idioma: 'es' }), desde: '2026-09-01' });
    const eq2 = corte.getWorksheet('En qué se fue');
    ok('rango cortado: explica en vez de comparar', textoDe(eq2).some((x) => x.startsWith('El presupuesto se mide de cobro a cobro')), true);
    ok('rango cortado: fijos sin estado', textoDe(corte.getWorksheet('Gastos fijos')).includes('Pagado'), false);
  }

  // La moneda de la vista: se convierte lo de la cuenta, no el fondo en dólares ni lo que falta.
  {
    const c = conversorDe({ moneda: 'USD', propia: 'PYG', factor: 1 / 8000 });
    const e = P.enLaVistaPersonal({
      diaCobro: 5, guardadoPrevio: 80000,
      presupuesto: [{ categoria: 'Comida', planeado: 800000 }],
      fijos: [{ nombre: 'Luz', categoria: 'Servicios', importe: 400000, dia_del_mes: 10 }],
      fondos: [
        { nombre: 'Viaje', moneda: null, saldo: 800000, meta: null, fecha_limite: null, falta: null, por_mes: null },
        { nombre: 'Dólares', moneda: 'USD', saldo: 50, meta: 100, fecha_limite: null, falta: 50, por_mes: null },
      ],
      deudas: [{ id: 'd', tipo: 'otro', nombre: 'x', acreedor: '', monto_original: 800000, saldo: 400000, cuotas_totales: null, cuotas_pagadas: 0, monto_cuota: null, vence_el: null, vencida: false, activa: true }],
      pagosDeuda: [{ deuda_id: 'd', fecha: '2026-09-10', monto: 8000, nota: '' }],
      teDeben: { totalHoy: 16000, cuantos: 1, devuelto: 0, prestado: 8000 },
    }, c);
    ok('vista: plan, fijo y guardado', [e.presupuesto[0].planeado, e.fijos[0].importe, e.guardadoPrevio], [100, 50, 10]);
    ok('vista: el fondo en la cuenta se convierte, el de dólares no', [e.fondos[0].saldo, e.fondos[1].saldo, e.fondos[1].meta], [100, 50, 100]);
    ok('vista: lo que falta sigue faltando', [e.fondos[0].meta, e.deudas[0].monto_cuota], [null, null]);
    ok('vista: deudas, pagos y te deben', [e.deudas[0].saldo, e.pagosDeuda[0].monto, e.teDeben.totalHoy, e.teDeben.prestado], [50, 1, 2, 1]);
  }

  console.log(`\n${corridas} comprobaciones, ${fallos} fallos`);
  process.exit(fallos > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
