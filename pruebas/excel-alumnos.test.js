/**
 * El libro de Excel del profe y del personal trainer
 * (src/lib/reportes/excel-alumnos.ts), sobre `.compilado/`.
 *
 * Lo que se prueba:
 *   · la tarjeta de descarga anuncia las hojas que de verdad trae el
 *     archivo, en es y en pt, para el profe (sin Progreso) y el trainer (con
 *     Progreso y con sus palabras: «Clientes», «Sesiones»);
 *   · los números del Resumen son los de la pantalla: Cobrado, Gastos y Te
 *     quedó del `resumen_financiero`, con el período anterior al lado;
 *   · la hoja Cobros suma exactamente el «Cobrado» y no lista las anuladas;
 *   · Por cobrar suma las filas (inscripciones + fiado) y nada más;
 *   · lo que falta queda vacío, nunca en cero (el alumno sin paquete activo,
 *     el cobrado por clase sin clases dadas);
 *   · la conversión a la moneda de la vista toca la plata y solo la plata.
 */
const ExcelJS = require('exceljs');
const path = require('path');
const { libroAlumnos, hojasAlumnos, enLaVistaAlumnos, mapearPorCobrar, asistenciaPct, loQueTeDeben } =
  require('../.compilado/reportes/excel-alumnos.js');
const { coincidenLasHojas, conversorDe } = require('../.compilado/reportes/comun.js');
const { fichaDe } = require('../.compilado/rubros.js');
const { resumir, gastosPorCategoria, serieDiaria } = require('../.compilado/calculos.js');
const { diasDelRango } = require('../.compilado/fechas.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
}

// ---------------------------------------------------------------- datos de ejemplo
const base = { estado: 'activo', descuento: 0, contraparte: '', notas: '', origen: 'manual', costo_total: 0 };
const movimientos = [
  // El cobro de una inscripción: venta a costo 0 con el nombre del paquete (095).
  { ...base, id: 'v1', tipo: 'venta', fecha: '2026-09-02', descripcion: '8 clases de inglés', categoria: 'Ventas',
    subtotal: 400000, monto: 400000, metodo_pago: 'Transferencia', contraparte: 'Ana',
    cliente_id: 'c1', cliente_nombre: 'Ana Benítez', cuenta_nombre: 'Banco Atlas',
    movimiento_items: [{ id: 'i1', producto_id: null, nombre: '8 clases de inglés', cantidad: 1, precio_unitario: 400000, costo_unitario: 0 }] },
  { ...base, id: 'v2', tipo: 'venta', fecha: '2026-09-05', descripcion: '4 clases de piano', categoria: 'Ventas',
    subtotal: 250000, monto: 250000, metodo_pago: 'Efectivo', contraparte: 'Bruno',
    cliente_id: 'c2', cliente_nombre: 'Bruno Sosa', cuenta_nombre: 'Efectivo',
    movimiento_items: [{ id: 'i2', producto_id: null, nombre: '4 clases de piano', cantidad: 1, precio_unitario: 250000, costo_unitario: 0 }] },
  // Anulada: figura en Orden pero no es un cobro.
  { ...base, id: 'v3', tipo: 'venta', fecha: '2026-09-06', descripcion: '8 clases de inglés', categoria: 'Ventas',
    estado: 'anulado', motivo_anulacion: 'Se cargó dos veces',
    subtotal: 400000, monto: 400000, metodo_pago: 'Efectivo', cliente_nombre: 'Ana Benítez',
    movimiento_items: [{ id: 'i3', producto_id: null, nombre: '8 clases de inglés', cantidad: 1, precio_unitario: 400000, costo_unitario: 0 }] },
  { ...base, id: 'g1', tipo: 'gasto', fecha: '2026-09-03', descripcion: 'Libros', categoria: 'Materiales',
    subtotal: 90000, monto: 90000, metodo_pago: 'Efectivo', cuenta_nombre: 'Efectivo' },
  { ...base, id: 'g2', tipo: 'gasto', fecha: '2026-09-04', descripcion: 'Internet', categoria: 'Servicios',
    subtotal: 150000, monto: 150000, metodo_pago: 'Débito', cuenta_nombre: 'Banco Atlas' },
  { ...base, id: 'n1', tipo: 'ingreso', fecha: '2026-09-04', descripcion: 'Préstamo de mamá', categoria: 'Otros',
    subtotal: 100000, monto: 100000, metodo_pago: 'Efectivo' },
];
const movimientosPrevios = [
  { ...base, id: 'p1', tipo: 'venta', fecha: '2026-08-10', descripcion: '8 clases de inglés', categoria: 'Ventas',
    subtotal: 500000, monto: 500000, metodo_pago: 'Efectivo',
    movimiento_items: [{ id: 'pi1', producto_id: null, nombre: '8 clases de inglés', cantidad: 1, precio_unitario: 500000, costo_unitario: 0 }] },
  { ...base, id: 'p2', tipo: 'gasto', fecha: '2026-08-11', descripcion: 'Libros', categoria: 'Materiales',
    subtotal: 100000, monto: 100000, metodo_pago: 'Efectivo' },
];

const reporte = {
  clases_dadas: 10, faltas: 2,
  por_semana: [
    { semana: '2026-08-31', dadas: 4, faltas: 1 },
    { semana: '2026-09-07', dadas: 6, faltas: 1 },
  ],
  cobrado: 650000, cobrado_por_clase: 65000,
  por_cobrar: 300000, fiado_pendiente: 50000,
  activos: 2, nuevos: 1,
  paquetes: { vendidos: 2, terminados: 1, vencidos: 1, renovaron: 1 },
  por_terminar: [{ paquete: 'q2', cliente_id: 'c2', alumno: 'Bruno Sosa', nombre: '4 clases de piano', quedan: 1, vence_el: null }],
  alumnos: [
    { cliente_id: 'c1', nombre: 'Ana Benítez', clases: 6, faltas: 1, cobrado: 400000, debe: 0, debe_inscripciones: 0, debe_fiado: 0,
      paquete: '8 clases de inglés', materia: 'Inglés', usadas: 6, quedan: 2, vence_el: '2026-10-01', ultima_clase: '2026-09-10' },
    { cliente_id: 'c2', nombre: 'Bruno Sosa', clases: 3, faltas: 1, cobrado: 250000, debe: 50000, debe_inscripciones: 0, debe_fiado: 50000,
      paquete: '4 clases de piano', materia: 'Piano', usadas: 3, quedan: 1, vence_el: null, ultima_clase: '2026-09-09' },
    // Sin paquete activo: sus columnas de paquete tienen que quedar vacías, no en cero.
    { cliente_id: 'c3', nombre: 'Carla Duarte', clases: 1, faltas: 0, cobrado: 0, debe: 300000, debe_inscripciones: 300000, debe_fiado: 0,
      paquete: null, materia: null, usadas: null, quedan: null, vence_el: null, ultima_clase: '2026-09-01' },
  ],
  por_paquete: [{ nombre: '8 clases de inglés', vendidos: 1, cobrado: 400000 }, { nombre: '4 clases de piano', vendidos: 1, cobrado: 250000 }],
  por_materia: [],
};
const porCobrar = mapearPorCobrar({
  total: '300000',
  lista: [{ paquete: 'q3', cliente_id: 'c3', alumno: 'Carla Duarte', nombre: '8 clases', materia: null, monto: '300000', desde: '2026-09-01', hasta: null }],
});
const progreso = {
  medidos: 2, con_peso: 1, cambio_peso: -1.5, con_cintura: 1, cambio_cintura: -2, con_grasa: 0, cambio_grasa: null,
  sin_medir_30: 1, sin_rutina: 1,
  clientes: [
    { cliente_id: 'c1', nombre: 'Ana Benítez', activo: true, mediciones: 2,
      peso_inicial: 70, peso_final: 68.5, peso_cambio: -1.5, cintura_inicial: 80, cintura_final: 78, cintura_cambio: -2,
      grasa_inicial: null, grasa_final: null, grasa_cambio: null, grasa_metodo: null,
      ultima_medicion: '2026-09-10', dias_sin_medir: 5, sin_medir_30: false, rutina_vigente: 'Fuerza A' },
    { cliente_id: 'c2', nombre: 'Bruno Sosa', activo: true, mediciones: 0,
      peso_inicial: null, peso_final: null, peso_cambio: null, cintura_inicial: null, cintura_final: null, cintura_cambio: null,
      grasa_inicial: null, grasa_final: null, grasa_cambio: null, grasa_metodo: null,
      ultima_medicion: '2026-07-01', dias_sin_medir: 76, sin_medir_30: true, rutina_vigente: null },
  ],
};

const desde = '2026-09-01', hasta = '2026-09-15';
function datosDe({ rubro, idioma, conProgreso }) {
  const ficha = fichaDe(rubro, 'emprendedor');
  return {
    empresa: { nombre: 'Clases de Ana', moneda: 'PYG', tipo_cuenta: 'emprendedor', rubro },
    desde, hasta, idioma, jerga: ficha.jerga,
    resumen: resumir(movimientos),
    resumenPrevio: resumir(movimientosPrevios),
    previo: { desde: '2026-08-17', hasta: '2026-08-31' },
    categorias: gastosPorCategoria(movimientos),
    serie: serieDiaria(movimientos, diasDelRango(desde, hasta, 400)),
    movimientos,
    alumnos: reporte,
    porCobrar,
    progreso: conProgreso ? progreso : null,
  };
}

/** La fila de una hoja cuyo texto de la columna `col` es `texto`. */
function filaCon(hoja, col, texto) {
  let hallada = null;
  hoja.eachRow((fila) => { if (!hallada && fila.getCell(col).value === texto) hallada = fila; });
  return hallada;
}

(async () => {
  // ---------------------------------------------------------------- las hojas
  console.log('── Excel de alumnos: las hojas que anuncia la tarjeta ──');
  for (const idioma of ['es', 'pt']) {
    for (const rubro of ['clases', 'entrenamiento']) {
      const ficha = fichaDe(rubro, 'emprendedor');
      const trainer = rubro === 'entrenamiento';
      const libro = libroAlumnos(datosDe({ rubro, idioma, conProgreso: trainer }));
      const reales = libro.worksheets.map((h) => h.name);
      ok(`${rubro}/${idioma}: la tarjeta coincide con el libro`, coincidenLasHojas(hojasAlumnos(ficha, idioma), reales), true);
      ok(`${rubro}/${idioma}: ${trainer ? 'con' : 'sin'} Progreso`, reales.length, trainer ? 7 : 6);
    }
  }
  ok('profe: la hoja de alumnos', hojasAlumnos(fichaDe('clases', 'emprendedor'), 'es').map((h) => h.nombre),
    ['Resumen', 'Por cobrar', 'Cobros', 'Asistencia', 'Alumnos', 'Gastos']);
  ok('trainer: sus palabras y su hoja de progreso', hojasAlumnos(fichaDe('entrenamiento', 'emprendedor'), 'es').map((h) => h.nombre),
    ['Resumen', 'Por cobrar', 'Cobros', 'Asistencia', 'Clientes', 'Gastos', 'Progreso']);
  ok('profe en pt', hojasAlumnos(fichaDe('clases', 'emprendedor'), 'pt').map((h) => h.nombre),
    ['Resumo', 'A receber', 'Recebimentos', 'Frequência', 'Alunos', 'Despesas']);
  ok('ningún nombre de hoja pasa de 31 letras (Excel lo rechaza)',
    [...hojasAlumnos(fichaDe('entrenamiento', 'emprendedor'), 'es'), ...hojasAlumnos(fichaDe('entrenamiento', 'emprendedor'), 'pt')]
      .every((h) => h.nombre.length <= 31), true);

  // ---------------------------------------------------------------- el resumen
  console.log('── El Resumen dice lo mismo que la pantalla ──');
  const d = datosDe({ rubro: 'clases', idioma: 'es', conProgreso: false });
  const libro = libroAlumnos(d);
  const res = libro.getWorksheet('Resumen');
  const r = d.resumen, rp = d.resumenPrevio;
  ok('Cobrado = ventas válidas (sin la anulada)', r.ventas, 650000);
  ok('Resumen: Cobrado', filaCon(res, 2, 'Cobrado').getCell(3).value, r.ventas);
  ok('Resumen: Cobrado antes', filaCon(res, 2, 'Cobrado').getCell(4).value, rp.ventas);
  ok('Resumen: Gastos', filaCon(res, 2, 'Gastos').getCell(3).value, 240000);
  ok('Resumen: Gastos antes', filaCon(res, 2, 'Gastos').getCell(4).value, 100000);
  ok('Resumen: Te quedó = ganancia neta del resumen', filaCon(res, 2, 'Te quedó').getCell(3).value, r.gananciaNeta);
  ok('Te quedó: cobrado + otros ingresos − gastos', r.gananciaNeta, 650000 + 100000 - 240000);
  ok('Resumen: otros ingresos aparte, con su aclaración', filaCon(res, 2, 'Otros ingresos').getCell(3).value, 100000);
  ok('Resumen: clases dadas', filaCon(res, 2, 'Clases dadas').getCell(3).value, 10);
  ok('Resumen: faltas', filaCon(res, 2, 'Faltas').getCell(3).value, 2);
  ok('Resumen: cobrado por clase (de la base)', filaCon(res, 2, 'Cobrado por clase').getCell(3).value, 65000);
  ok('Resumen: por cobrar = inscripciones + fiado', filaCon(res, 2, 'Total por cobrar').getCell(3).value, 350000);
  ok('Resumen: sin margen ni ticket ni unidades',
    [filaCon(res, 2, 'Ganancia bruta'), filaCon(res, 2, 'Ticket promedio'), filaCon(res, 2, 'Unidades vendidas')], [null, null, null]);

  // Sin clases dadas no hay «cobrado por clase»: ni la fila, ni un cero.
  const sinClases = libroAlumnos({ ...d, alumnos: { ...reporte, clases_dadas: 0, faltas: 0, por_semana: [], cobrado_por_clase: null } });
  ok('sin clases: no hay fila de cobrado por clase', filaCon(sinClases.getWorksheet('Resumen'), 2, 'Cobrado por clase'), null);
  ok('sin clases: Asistencia lo dice en vez de una tabla de ceros',
    sinClases.getWorksheet('Asistencia').getCell('A6').value, 'No se marcaron clases ni faltas en este período.');

  // ---------------------------------------------------------------- cobros
  console.log('── Cobros: el libro de ingresos ──');
  const cobros = libro.getWorksheet('Cobros');
  const filasCobros = [];
  cobros.eachRow((fila, n) => { if (n > 6 && typeof fila.getCell(6).value === 'number') filasCobros.push(fila); });
  const total = filasCobros.pop();
  ok('Cobros: una fila por venta válida', filasCobros.length, 2);
  ok('Cobros: el total es el Cobrado', total.getCell(6).value, r.ventas);
  ok('Cobros: las filas suman el total', filasCobros.reduce((s, f) => s + f.getCell(6).value, 0), r.ventas);
  ok('Cobros: alumno, paquete, forma y cuenta',
    [2, 3, 4, 5].map((c) => filasCobros[0].getCell(c).value), ['Ana Benítez', '8 clases de inglés', 'Transferencia', 'Banco Atlas']);

  // ---------------------------------------------------------------- por cobrar
  console.log('── Por cobrar, a hoy ──');
  const deben = loQueTeDeben(d);
  ok('lo que te deben: inscripciones + fiado', [deben.inscripciones, deben.fiado, deben.total], [300000, 50000, 350000]);
  const pc = libro.getWorksheet('Por cobrar');
  ok('Por cobrar: la inscripción', [pc.getCell('A7').value, pc.getCell('B7').value, pc.getCell('F7').value], ['Carla Duarte', '8 clases', 300000]);
  ok('Por cobrar: el fiado', [pc.getCell('A8').value, pc.getCell('B8').value, pc.getCell('F8').value], ['Bruno Sosa', 'Fiado (saldo)', 50000]);
  ok('Por cobrar: el total', pc.getCell('F9').value, 350000);
  const nadie = libroAlumnos({ ...d, porCobrar: { total: 0, lista: [] }, alumnos: { ...reporte, fiado_pendiente: 0, alumnos: reporte.alumnos.map((a) => ({ ...a, debe_fiado: 0 })) } });
  ok('Por cobrar: sin deudas lo dice', nadie.getWorksheet('Por cobrar').getCell('A7').value, 'Nadie te debe nada a hoy.');

  // ---------------------------------------------------------------- asistencia y alumnos
  console.log('── Asistencia y alumnos ──');
  ok('asistencia: 10 de 12', Math.round(asistenciaPct(10, 2) * 10) / 10, 83.3);
  ok('asistencia sin nada: no hay número', asistenciaPct(0, 0), null);
  const asis = libro.getWorksheet('Asistencia');
  const totalAsis = filaCon(asis, 1, 'TOTAL');
  ok('Asistencia: el total por semana es el del período', [totalAsis.getCell(2).value, totalAsis.getCell(3).value], [10, 2]);
  const alumnos = libro.getWorksheet('Alumnos');
  const carla = filaCon(alumnos, 1, 'Carla Duarte');
  ok('Alumnos: sin paquete activo, usadas y quedan vacías (no cero)', [carla.getCell(4).value, carla.getCell(5).value], [null, null]);
  ok('Alumnos: lo que debe hoy', carla.getCell(10).value, 300000);
  ok('Alumnos: una fila por alumno', [1, 2, 3].map((i) => alumnos.getCell(`A${6 + i}`).value), ['Ana Benítez', 'Bruno Sosa', 'Carla Duarte']);

  // ---------------------------------------------------------------- gastos
  const gastos = libro.getWorksheet('Gastos');
  ok('Gastos: el total por categoría es el del resumen', filaCon(gastos, 2, 'TOTAL').getCell(3).value, r.gastos);
  ok('Gastos: cada gasto, con su cuenta', filaCon(gastos, 2, 'Internet').getCell(5).value, 'Banco Atlas');

  // ---------------------------------------------------------------- el trainer
  console.log('── El trainer: sus palabras y su progreso ──');
  const lt = libroAlumnos(datosDe({ rubro: 'entrenamiento', idioma: 'es', conProgreso: true }));
  ok('trainer: «Sesiones dadas» en el Resumen', filaCon(lt.getWorksheet('Resumen'), 2, 'Sesiones dadas').getCell(3).value, 10);
  ok('trainer: «Cobrado por sesión»', filaCon(lt.getWorksheet('Resumen'), 2, 'Cobrado por sesión').getCell(3).value, 65000);
  const prog = lt.getWorksheet('Progreso');
  const ana = filaCon(prog, 1, 'Ana Benítez');
  ok('Progreso: peso inicial, final y cambio', [3, 4, 5].map((c) => ana.getCell(c).value), [70, 68.5, -1.5]);
  ok('Progreso: sin grasa comparable, vacía', ana.getCell(11).value, null);
  const bruno = filaCon(prog, 1, 'Bruno Sosa');
  ok('Progreso: días sin medirse', bruno.getCell(14).value, 76);
  ok('Progreso: sin rutina lo dice', bruno.getCell(15).value, 'sin rutina');
  const prom = filaCon(prog, 1, 'PROMEDIO');
  ok('Progreso: el promedio es el de la base', [prom.getCell(5).value, prom.getCell(8).value, prom.getCell(11).value], [-1.5, -2, null]);
  const ltPt = libroAlumnos(datosDe({ rubro: 'entrenamiento', idioma: 'pt', conProgreso: true }));
  ok('trainer pt: «Sessões dadas»', filaCon(ltPt.getWorksheet('Resumo'), 2, 'Sessões dadas').getCell(3).value, 10);

  // ---------------------------------------------------------------- la moneda de la vista
  console.log('── En la moneda de la vista ──');
  const c = conversorDe({ moneda: 'USD', propia: 'PYG', factor: 1 / 8000 });
  const v = enLaVistaAlumnos({ alumnos: reporte, porCobrar, progreso }, c);
  ok('se convierte lo cobrado', v.alumnos.cobrado, 81.25);
  ok('se convierte lo cobrado por clase', v.alumnos.cobrado_por_clase, 8.125);
  ok('se convierte lo que se debe', [v.porCobrar.total, v.porCobrar.lista[0].monto, v.alumnos.alumnos[1].debe_fiado], [37.5, 37.5, 6.25]);
  ok('no se convierten las clases ni los alumnos', [v.alumnos.clases_dadas, v.alumnos.activos, v.alumnos.alumnos[0].usadas], [10, 2, 6]);
  ok('lo que falta sigue faltando', enLaVistaAlumnos({ alumnos: { ...reporte, cobrado_por_clase: null }, porCobrar, progreso: null }, c).alumnos.cobrado_por_clase, null);
  ok('las medidas no son plata', v.progreso.clientes[0].peso_final, 68.5);
  const igual = conversorDe({ moneda: 'PYG', propia: 'PYG', factor: 1 });
  ok('sin conversión, lo mismo', enLaVistaAlumnos({ alumnos: reporte, porCobrar, progreso: null }, igual).alumnos.cobrado, 650000);

  // ---------------------------------------------------------------- se abre
  const salida = path.join(__dirname, '..', '.compilado', 'reporte-alumnos.xlsx');
  await lt.xlsx.writeFile(salida);
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.readFile(salida);
  ok('el archivo se escribe y se vuelve a abrir', leido.worksheets.map((h) => h.name), lt.worksheets.map((h) => h.name));

  console.log(`\n${corridas} comprobaciones, ${fallos} fallos`);
  process.exit(fallos > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
