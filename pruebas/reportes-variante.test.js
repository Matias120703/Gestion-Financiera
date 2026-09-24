/**
 * La arquitectura de los reportes por rubro (23/09), sobre `.compilado/`:
 *
 *   · `varianteDeReporte`: cada rubro cae en el reporte que le corresponde
 *     (el profe y el trainer en alumnos, el ganadero y el agricultor en
 *     campo, la barbería en servicios) y la cuenta personal manda sobre el
 *     rubro que tenga guardado;
 *   · el ciclo de cobro: «Este ciclo» y «Ciclo pasado» con la misma regla que
 *     `fecha_de_cobro` de la base (el 31 en febrero es el 28), y contra qué
 *     se compara la flecha (el mismo tramo del ciclo pasado);
 *   · la tarjeta de descarga dice las hojas que de verdad trae el archivo:
 *     se arma el libro y se compara, rubro por rubro y en los dos idiomas.
 */
const { varianteDeReporte, VARIANTES } = require('../.compilado/reportes/variante.js');
const R = require('../.compilado/reportes/rango.js');
const { coincidenLasHojas, conversorDe } = require('../.compilado/reportes/comun.js');
const { RUBROS, PERSONAL, fichaDe } = require('../.compilado/rubros.js');
const { construirLibro, hojasDelLibroDeHoy, resumenEnLaMoneda } = require('../.compilado/reporte.js');
const { resumir, rankingProductos, gastosPorCategoria, ingresosPorCategoria, serieDiaria } = require('../.compilado/calculos.js');
const { diasDelRango } = require('../.compilado/fechas.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
}

// ---------------------------------------------------------------
console.log('── Qué reporte le toca a cada rubro ──');
const esperado = {
  comercio: 'comercio', servicios: 'servicios', ganaderia: 'campo', agricultura: 'campo',
  clases: 'alumnos', entrenamiento: 'alumnos',
};
for (const rubro of Object.keys(RUBROS)) {
  ok(`${rubro} tiene un reporte decidido en esta prueba`, rubro in esperado, true);
  ok(`${rubro} → ${esperado[rubro]}`, varianteDeReporte(fichaDe(rubro, 'emprendedor'), 'emprendedor'), esperado[rubro]);
  // A una persona se le guarda rubro 'comercio', pero podría quedar otro
  // de una cuenta vieja: manda el tipo de cuenta.
  ok(`personal con rubro ${rubro} → personal`, varianteDeReporte(fichaDe(rubro, 'personal'), 'personal'), 'personal');
}
ok('la ficha personal sola también', varianteDeReporte(PERSONAL, 'personal'), 'personal');
ok('un rubro desconocido cae en comercio', varianteDeReporte(fichaDe('inventado', 'emprendedor'), 'emprendedor'), 'comercio');
ok('las cinco variantes, ni una más', [...VARIANTES].sort(), ['alumnos', 'campo', 'comercio', 'personal', 'servicios']);
// El profe tiene /agenda y no es servicios: lo que decide es el reparto.
ok('agenda sin reparto no es servicios',
  varianteDeReporte({ agendaDeAlumnos: false, ciclosLargos: false, secciones: { '/agenda': true, '/reparto': false } }, 'emprendedor'),
  'comercio');

// ---------------------------------------------------------------
console.log('── El ciclo de cobro ──');
ok('el 31 en febrero es el 28', R.fechaDeCobro('2026-02-10', 31), '2026-02-28');
ok('y en un bisiesto el 29', R.fechaDeCobro('2028-02-01', 31), '2028-02-29');
ok('un día fuera de rango es el 1', R.fechaDeCobro('2026-09-20', 0), '2026-09-01');
ok('antes del cobro, el ciclo empezó el mes pasado', R.inicioDeCiclo('2026-09-03', 5), '2026-08-05');
ok('el mismo día del cobro empieza uno nuevo', R.inicioDeCiclo('2026-09-05', 5), '2026-09-05');
ok('cruzando el año', R.inicioDeCiclo('2026-01-03', 5), '2025-12-05');

ok('este ciclo va del cobro a hoy', R.rangoDeCiclo('ciclo', '2026-09-23', 5),
  { desde: '2026-09-05', hasta: '2026-09-23', clave: 'ciclo' });
ok('el ciclo pasado, de cobro a cobro', R.rangoDeCiclo('ciclo_pasado', '2026-09-23', 5),
  { desde: '2026-08-05', hasta: '2026-09-04', clave: 'ciclo_pasado' });
ok('antes del cobro, el ciclo pasado es el de julio', R.rangoDeCiclo('ciclo_pasado', '2026-09-03', 5),
  { desde: '2026-07-05', hasta: '2026-08-04', clave: 'ciclo_pasado' });
ok('quien cobra el 31, a mediados de marzo', R.rangoDeCiclo('ciclo', '2026-03-15', 31),
  { desde: '2026-02-28', hasta: '2026-03-15', clave: 'ciclo' });
ok('y su ciclo pasado', R.rangoDeCiclo('ciclo_pasado', '2026-03-15', 31),
  { desde: '2026-01-31', hasta: '2026-02-27', clave: 'ciclo_pasado' });

console.log('── Contra qué se compara ──');
ok('este ciclo contra el mismo tramo del pasado',
  R.rangoPrevio({ desde: '2026-09-05', hasta: '2026-09-23' }, 5), { desde: '2026-08-05', hasta: '2026-08-23' });
ok('el ciclo pasado contra el ciclo entero anterior',
  R.rangoPrevio({ desde: '2026-08-05', hasta: '2026-09-04' }, 5), { desde: '2026-07-05', hasta: '2026-08-04' });
ok('el tramo no se pasa del final del ciclo anterior (febrero es corto)',
  R.rangoPrevio({ desde: '2026-02-28', hasta: '2026-03-30' }, 31), { desde: '2026-01-31', hasta: '2026-02-27' });
ok('un mes calendario se compara como en el panel',
  R.rangoPrevio({ desde: '2026-09-01', hasta: '2026-09-23' }, 5), { desde: '2026-08-09', hasta: '2026-08-31' });
ok('tres meses que empiezan un día de cobro no son un ciclo',
  R.rangoPrevio({ desde: '2026-06-05', hasta: '2026-09-04' }, 5), { desde: '2026-03-05', hasta: '2026-06-04' });
ok('un negocio no mide por ciclo',
  R.rangoPrevio({ desde: '2026-09-05', hasta: '2026-09-23' }, null), { desde: '2026-08-17', hasta: '2026-09-04' });

console.log('── El rango que piden los parámetros ──');
const hoy = '2026-09-23';
ok('una persona que cobra el 5 entra por su ciclo', R.rangoDeReporte({}, hoy, 5, 'ciclo'),
  { desde: '2026-09-05', hasta: hoy, clave: 'ciclo' });
ok('sin día de cobro, un enlace a «ciclo» cae en el mes', R.rangoDeReporte({ rango: 'ciclo' }, hoy, null, 'hoy'),
  { desde: '2026-09-01', hasta: hoy, clave: 'mes' });
ok('y «ciclo pasado» en el mes pasado', R.rangoDeReporte({ rango: 'ciclo_pasado' }, hoy, null, 'hoy'),
  { desde: '2026-08-01', hasta: '2026-08-31', clave: 'mes_pasado' });
ok('una clave inventada es hoy', R.rangoDeReporte({ rango: 'cualquiera' }, hoy, 5, 'ciclo'),
  { desde: hoy, hasta: hoy, clave: 'hoy' });
ok('personalizado al revés se da vuelta',
  R.rangoDeReporte({ rango: 'personalizado', desde: '2026-09-10', hasta: '2026-09-01' }, hoy, null, 'hoy'),
  { desde: '2026-09-01', hasta: '2026-09-10', clave: 'personalizado' });
ok('personalizado con una fecha rota usa hoy',
  R.rangoDeReporte({ rango: 'personalizado', desde: 'ayer', hasta: '2026-09-30' }, hoy, null, 'hoy'),
  { desde: hoy, hasta: '2026-09-30', clave: 'personalizado' });

// ---------------------------------------------------------------
console.log('── La moneda de la vista ──');
const c = conversorDe({ moneda: 'USD', propia: 'PYG', factor: 1 / 7500 });
ok('convierte', c.x(450000), 60);
ok('lo que falta sigue faltando', c.xn(null), null);
const sin = conversorDe({ moneda: 'PYG', propia: 'PYG', factor: 1 });
ok('sin vista no toca nada', [sin.convierte, sin.x(123.456)], [false, 123.456]);
const rUsd = resumenEnLaMoneda(resumir([]), c);
ok('el resumen anterior también se convierte (y un cero sigue cero)', rUsd.ventas, 0);

// ---------------------------------------------------------------
console.log('── Las hojas anunciadas contra las del archivo ──');
ok('iguales', coincidenLasHojas([{ nombre: 'A' }, { nombre: 'B' }], ['A', 'B']), true);
ok('la condicional puede faltar', coincidenLasHojas([{ nombre: 'A' }, { nombre: 'B', siHay: true }, { nombre: 'C' }], ['A', 'C']), true);
ok('o estar', coincidenLasHojas([{ nombre: 'A' }, { nombre: 'B', siHay: true }, { nombre: 'C' }], ['A', 'B', 'C']), true);
ok('la fija no puede faltar', coincidenLasHojas([{ nombre: 'A' }, { nombre: 'B' }], ['A']), false);
ok('ni sobrar una', coincidenLasHojas([{ nombre: 'A' }], ['A', 'Z']), false);
ok('ni cambiar el orden', coincidenLasHojas([{ nombre: 'A' }, { nombre: 'B' }], ['B', 'A']), false);

const base = { estado: 'activo', descuento: 0, contraparte: '', notas: '', origen: 'manual', costo_total: 0 };
const movs = [
  { ...base, id: 'm1', tipo: 'venta', fecha: '2026-09-10', descripcion: 'Venta', categoria: 'Ventas',
    subtotal: 100000, monto: 100000, costo_total: 60000, metodo_pago: 'efectivo',
    movimiento_items: [{ id: 'i1', producto_id: 'p1', nombre: 'Algo', cantidad: 1, precio_unitario: 100000, costo_unitario: 60000 }] },
  { ...base, id: 'm2', tipo: 'gasto', fecha: '2026-09-11', descripcion: 'Luz', categoria: 'Servicios',
    subtotal: 20000, monto: 20000, metodo_pago: 'efectivo' },
];
const SIN_AHORRO = { aportado: 0, retirado: 0, neto: 0, porFondo: [] };
const CON_AHORRO = { aportado: 50000, retirado: 0, neto: 50000,
  porFondo: [{ ahorro_id: 'a1', nombre: 'Vacaciones', aportado: 50000, retirado: 0, neto: 50000, saldo_hoy: 50000 }] };
const liq = {
  id: 'q1', grupo_id: 'g1', fecha: '2026-09-12', comprador: 'Coop', kg: 30000, precio_tonelada: 415,
  precio_original: null, moneda_original: null, cambio: null, bruto: 12450, descuentos: 1040, compensado: 0,
  pagado_con_grano: 0, neto: 11410, cuenta_id: null, estado: 'activa', movimiento_id: 'v1', notas: '', campana: 'Norte',
};

function libro(empresa, extra = {}) {
  return construirLibro({
    empresa, desde: '2026-09-01', hasta: '2026-09-30',
    resumen: resumir(movs), ranking: rankingProductos(movs), categorias: gastosPorCategoria(movs),
    ingresos: ingresosPorCategoria(movs), ahorro: SIN_AHORRO,
    serie: serieDiaria(movs, diasDelRango('2026-09-01', '2026-09-30', 400)),
    movimientos: movs, productosBd: [], ...extra,
  });
}

const casos = [];
for (const idioma of ['es', 'pt']) {
  for (const rubro of Object.keys(RUBROS)) {
    const empresa = { nombre: 'X', moneda: 'PYG', rubro, tipo_cuenta: 'emprendedor' };
    const campo = fichaDe(rubro, 'emprendedor').ciclosLargos;
    // Como la ruta: al campo siempre le llegan sus campañas (aunque sean cero).
    casos.push([`${rubro} ${idioma}`, empresa, { idioma, ...(campo ? { campanas: [], liquidaciones: [] } : {}) }]);
    if (campo) casos.push([`${rubro} ${idioma} con liquidación`, empresa, { idioma, campanas: [], liquidaciones: [liq] }]);
  }
  const persona = { nombre: 'Ana', moneda: 'PYG', rubro: 'comercio', tipo_cuenta: 'personal' };
  casos.push([`personal ${idioma}`, persona, { idioma }]);
  casos.push([`personal ${idioma} con ahorro`, persona, { idioma, ahorro: CON_AHORRO }]);
}
for (const [nombre, empresa, extra] of casos) {
  const reales = libro(empresa, extra).worksheets.map((h) => h.name);
  const anunciadas = hojasDelLibroDeHoy(empresa, extra.idioma);
  const bien = coincidenLasHojas(anunciadas, reales);
  if (!bien) console.log('  ', nombre, 'anuncia', anunciadas.map((h) => h.nombre + (h.siHay ? '?' : '')), 'y trae', reales);
  ok(`la tarjeta dice lo que trae el archivo: ${nombre}`, bien, true);
}
// Clases, entrenamiento y campo, mientras usen el libro de hoy: sin la hoja
// de productos (margen 100 %, o vacía con grano vendido) ni el día por día.
for (const rubro of ['clases', 'entrenamiento', 'agricultura', 'ganaderia']) {
  for (const idioma of ['es', 'pt']) {
    const empresa = { nombre: 'X', moneda: 'PYG', rubro, tipo_cuenta: 'emprendedor' };
    const campo = fichaDe(rubro, 'emprendedor').ciclosLargos;
    const hojas = libro(empresa, { idioma, ...(campo ? { campanas: [], liquidaciones: [] } : {}) }).worksheets.map((h) => h.name);
    const tx = require('../.compilado/reporte-textos.js').textosExcel(idioma);
    ok(`${rubro} ${idioma}: sin hoja de productos`, hojas.includes(tx.hojaProductos), false);
    ok(`${rubro} ${idioma}: sin día por día`, hojas.includes(tx.hojaDiaPorDia), false);
  }
}
// El comercio y la barbería la siguen teniendo.
ok('el comercio sigue con productos',
  hojasDelLibroDeHoy({ rubro: 'comercio', tipo_cuenta: 'emprendedor' }, 'es').map((h) => h.nombre),
  ['Resumen', 'Productos', 'Movimientos', 'Gastos', 'Día por día']);
ok('al campo ya no se le anuncia día por día',
  hojasDelLibroDeHoy({ rubro: 'agricultura', tipo_cuenta: 'emprendedor' }, 'es').some((h) => h.nombre === 'Día por día'), false);

console.log(`\n${corridas} comprobaciones, ${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
