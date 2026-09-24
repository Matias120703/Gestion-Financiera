/**
 * El libro de Excel del reporte de campo (src/lib/reportes/excel-campo.ts), sobre
 * `.compilado/`.
 *
 * Lo que se cuida (23/09):
 *   · La tarjeta de descarga anuncia las hojas que de verdad trae el libro
 *     (`coincidenLasHojas`), en es y en pt, en agricultura y en ganadería,
 *     con y sin las hojas «si hubo».
 *   · Lo falso que se fue: ni Productos, ni Día por día, ni «No se
 *     registraron ventas» el mes que se liquidó el grano, ni ganancia del mes.
 *   · Los números del Resumen son los del resumen (los mismos de la pantalla)
 *     y cada total de hoja cuadra con su fuente.
 *   · Las columnas nuevas (precio esperado, costo/t, moneda del papel, cuenta,
 *     campaña) salen, y lo que falta queda vacío, nunca en cero.
 *   · El ganadero tiene su hoja Lotes y no una de campañas con columnas agrícolas vacías.
 */
const {
  libroCampo, hojasCampo, enLaVistaCampo, campanasDelPeriodo, costoPorUnidad, porUnidadYDia,
  salioEnElPeriodo, esAgricola,
} = require('../.compilado/reportes/excel-campo.js');
const { coincidenLasHojas, conversorDe } = require('../.compilado/reportes/comun.js');
const { resumir, gastosPorCategoria, RESUMEN_VACIO } = require('../.compilado/calculos.js');
const { fichaDe } = require('../.compilado/rubros.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
}

console.log('── Excel de campo ──');

// ---------------------------------------------------------------------
// Datos de ejemplo: una zafra de soja con insumos en dólares, una
// liquidación de la cooperativa y un ticket de balanza.
// ---------------------------------------------------------------------
const base = { estado: 'activo', descuento: 0, contraparte: '', notas: '', origen: 'manual', costo_total: 0 };
const movs = [
  { ...base, id: 'm1', tipo: 'gasto', fecha: '2026-09-02', descripcion: 'Semilla soja', categoria: 'Semillas',
    subtotal: 30000000, monto: 30000000, metodo_pago: 'transferencia', cuenta_nombre: 'Banco Continental',
    moneda_original: 'USD', monto_original: 4000, cambio: 7500 },
  { ...base, id: 'm2', tipo: 'gasto', fecha: '2026-09-05', descripcion: 'Flete', categoria: 'Flete',
    subtotal: 2000000, monto: 2000000, metodo_pago: 'efectivo' },
  // La venta de la liquidación: entra sin items (100).
  { ...base, id: 'm3', tipo: 'venta', fecha: '2026-09-10', descripcion: 'Liquidación Coop.', categoria: 'Ventas',
    subtotal: 90000000, monto: 90000000, metodo_pago: 'transferencia' },
  { ...base, id: 'm4', tipo: 'ingreso', fecha: '2026-09-12', descripcion: 'Préstamo banco', categoria: 'Préstamo',
    subtotal: 50000000, monto: 50000000, metodo_pago: 'transferencia' },
  // Anulado: figura tachado, no suma.
  { ...base, id: 'm5', tipo: 'gasto', fecha: '2026-09-13', descripcion: 'Error', categoria: 'Flete',
    estado: 'anulado', motivo_anulacion: 'duplicado', subtotal: 999, monto: 999, metodo_pago: 'efectivo' },
];

const numeros = {
  movimientos: 3, puesto: 32000000, cobrado: 90000000, resultado: 58000000, por_unidad: 1160000,
  a_cosecha: 10000000, costo: 42000000, costo_ha: 840000, resultado_ha: 1160000,
  kg_cosechados: 150000, kg_vendidos: 120000, kg_sin_vender: 30000, vendido: 90000000,
  precio_promedio: 750000, precio_ref: 750000, rendimiento: 3000, costo_ton: 280000,
  kg_ha_para_cubrir: 1120, falta_cubrir: 0, kg_para_cubrir: 0,
};
const soja = {
  ...numeros, id: 'l1', nombre: 'Norte', unidad: 'hectáreas', cantidad: 50, estado: 'abierto',
  abierto_el: '2026-08-01', cerrado_el: null, notas: '', dias: 55, cultivo: 'Maíz', campana: 'Zafra 2026/27',
  hectareas: 50, precio_esperado: 800000,
};
// Una campaña vieja, cerrada antes del período: no va.
const vieja = { ...soja, id: 'l0', estado: 'cerrado', abierto_el: '2025-09-01', cerrado_el: '2026-03-01' };
// Una que cerró dentro del período: va.
const cerradaEnElPeriodo = { ...soja, id: 'l2', nombre: 'Sur', estado: 'cerrado', abierto_el: '2026-02-01', cerrado_el: '2026-09-15',
  cultivo: 'Soja', costo: null, costo_ha: null, a_cosecha: null, costo_ton: null, kg_ha_para_cubrir: null, falta_cubrir: null,
  precio_esperado: null };
// Una que abrió después del período: no va.
const futura = { ...soja, id: 'l3', abierto_el: '2026-10-01' };

const liquidaciones = [
  { id: 'q1', grupo_id: 'g1', fecha: '2026-09-10', comprador: 'Coop. Colonias Unidas', kg: 120000, precio_tonelada: 750000,
    precio_original: 100, moneda_original: 'USD', cambio: 7500, bruto: 90000000, descuentos: 1350000, compensado: 5000000,
    pagado_con_grano: 0, neto: 83650000, cuenta_id: null, estado: 'activa', movimiento_id: 'm3', notas: '',
    campana: 'Norte · Zafra 2026/27' },
  { id: 'q2', grupo_id: 'g2', fecha: '2026-09-11', comprador: 'Silo X', kg: 1000, precio_tonelada: 700000,
    precio_original: null, moneda_original: null, cambio: null, bruto: 700000, descuentos: null, compensado: null,
    pagado_con_grano: null, neto: 700000, cuenta_id: null, estado: 'anulada', movimiento_id: 'mx', notas: '',
    campana: 'Norte · Zafra 2026/27' },
];
const cosechas = [
  { id: 'c2', lote_id: 'l1', campana: 'Norte · Zafra 2026/27', fecha: '2026-09-09', ticket: 'T-2', destino: 'Coop.',
    kg_brutos: null, kg_netos: 30000, humedad: null },
  { id: 'c1', lote_id: 'l1', campana: 'Norte · Zafra 2026/27', fecha: '2026-09-08', ticket: 'T-1', destino: 'Coop.',
    kg_brutos: 125000, kg_netos: 120000, humedad: 13.5 },
];
const deudas = [
  { id: 'd2', lote_id: 'l1', campana: 'Norte · Zafra 2026/27', nombre: 'Glifosato', acreedor: 'Agro Sur',
    categoria: '', saldo: 4000000, vence_el: null },
  { id: 'd1', lote_id: 'l1', campana: 'Norte · Zafra 2026/27', nombre: 'Semilla', acreedor: 'Casa de insumos',
    categoria: 'Semillas', saldo: 6000000, vence_el: '2027-03-30' },
];

const DESDE = '2026-09-01', HASTA = '2026-09-30';
const resumen = resumir(movs);

function datos({ jerga = 'agricultura', idioma = 'es', conCosechas = true, conLiqs = true, conDeudas = true,
  campanas = [soja, cerradaEnElPeriodo], empresa = {} } = {}) {
  return {
    empresa: { nombre: 'Estancia Don Pedro', moneda: 'PYG', tipo_cuenta: 'emprendedor',
      rubro: jerga === 'agricultura' ? 'agricultura' : 'ganaderia', ...empresa },
    desde: DESDE, hasta: HASTA, idioma, jerga,
    resumen, resumenPrevio: RESUMEN_VACIO, previo: { desde: '2026-08-02', hasta: '2026-08-31' },
    categorias: gastosPorCategoria(movs), serie: [], movimientos: movs,
    campanas, liquidaciones: conLiqs ? liquidaciones : [],
    campanaDeMovimiento: { m1: 'Norte · Zafra 2026/27', m3: 'Norte · Zafra 2026/27' },
    cosechas: conCosechas ? cosechas : [], deudas: conDeudas ? deudas : [],
  };
}
const nombres = (libro) => libro.worksheets.map((h) => h.name);
/**
 * Los valores de una fila, tantos como columnas tiene el encabezado de la
 * tabla (fila 6): ExcelJS no devuelve las celdas vacías del final, y una
 * celda vacía es justo lo que se quiere comprobar.
 */
const fila = (hoja, n) => {
  const largo = hoja.getRow(6).cellCount;
  return Array.from({ length: largo }, (_, i) => {
    const v = hoja.getRow(n).getCell(i + 1).value;
    return v === undefined ? null : v;
  });
};
/** La fila cuya primera celda con texto es `etiqueta` (col B del Resumen). */
function valorDe(hoja, etiqueta) {
  let v;
  hoja.eachRow((r) => { if (r.getCell(2).value === etiqueta) v = r.getCell(3).value; });
  return v;
}
function textosDe(hoja) {
  const t = [];
  hoja.eachRow((r) => r.eachCell((c) => { if (typeof c.value === 'string') t.push(c.value); }));
  return t;
}

// ---------------------------------------------------------------------
// 1. Las hojas anunciadas = las del libro, en los dos idiomas y oficios
// ---------------------------------------------------------------------
const agroFicha = fichaDe('agricultura', 'emprendedor');
const ganFicha = fichaDe('ganaderia', 'emprendedor');
ok('agricultura es agrícola', esAgricola(agroFicha.jerga), true);
ok('ganadería no', esAgricola(ganFicha.jerga), false);

for (const idioma of ['es', 'pt']) {
  for (const [oficio, ficha, jerga] of [['agro', agroFicha, 'agricultura'], ['ganadería', ganFicha, null]]) {
    for (const lleno of [true, false]) {
      const libro = libroCampo(datos({ jerga, idioma, conCosechas: lleno, conLiqs: lleno, conDeudas: lleno }));
      ok(`hojas ${oficio} ${idioma} ${lleno ? 'con todo' : 'sin lo que es «si hubo»'}`,
        coincidenLasHojas(hojasCampo(ficha, idioma), nombres(libro)), true);
    }
  }
}

ok('agricultura con todo, en orden',
  nombres(libroCampo(datos())),
  ['Resumen', 'Campañas', 'Cosechas', 'Liquidaciones', 'Movimientos', 'Deudas a cosecha', 'Gastos']);
ok('agricultura en pt',
  nombres(libroCampo(datos({ idioma: 'pt' }))),
  ['Resumo', 'Safras', 'Colheitas', 'Liquidações', 'Lançamentos', 'Dívidas na colheita', 'Despesas']);
ok('agricultura sin cosecha, liquidación ni deudas',
  nombres(libroCampo(datos({ conCosechas: false, conLiqs: false, conDeudas: false }))),
  ['Resumen', 'Campañas', 'Movimientos', 'Gastos']);
// Aunque lleguen, el ganadero no tiene cosechas ni liquidaciones.
ok('ganadería: su hoja Lotes, sin cosechas ni liquidaciones',
  nombres(libroCampo(datos({ jerga: null }))),
  ['Resumen', 'Lotes', 'Movimientos', 'Deudas de los lotes', 'Gastos']);
for (const idioma of ['es', 'pt']) {
  const hojas = nombres(libroCampo(datos({ idioma })));
  ok(`sin Productos ni Día por día (${idioma})`,
    hojas.some((h) => ['Productos', 'Produtos', 'Día por día', 'Dia a dia'].includes(h)), false);
}

// ---------------------------------------------------------------------
// 2. Resumen: los números del resumen, sin la nota falsa ni ganancia del mes
// ---------------------------------------------------------------------
{
  const libro = libroCampo(datos());
  const h = libro.getWorksheet('Resumen');
  ok('cobrado por ventas = resumen.ventas (incluye la liquidación)', valorDe(h, 'Cobrado por ventas'), resumen.ventas);
  ok('cobrado es el de la liquidación', resumen.ventas, 90000000);
  ok('otros ingresos', valorDe(h, 'Otros ingresos'), resumen.otrosIngresos);
  ok('total que entró', valorDe(h, 'Total que entró'), resumen.ingresosTotales);
  ok('gastos (sin el anulado)', valorDe(h, 'Gastos'), 32000000);
  ok('total que salió', valorDe(h, 'Total que salió'), salioEnElPeriodo(resumen));
  ok('liquidado: solo las activas', valorDe(h, 'Liquidado en el periodo (bruto)'), 90000000);
  ok('kg cosechados del período', valorDe(h, 'kg cosechados en el periodo'), 150000);
  ok('debés a cosecha = Σ saldos', valorDe(h, 'Debés a cosecha (hoy)'), 10000000);
  ok('campañas del período', valorDe(h, 'Campañas abiertas en algún momento del periodo'), 2);
  ok('de esas, cerradas', valorDe(h, 'De esas, ya cerradas'), 1);
  const textos = textosDe(h);
  ok('sin «No se registraron ventas»', textos.some((t) => /No se registraron ventas/.test(t)), false);
  ok('sin ganancia neta ni margen', textos.some((t) => /Ganancia|margen/i.test(t)), false);
  ok('dice que incluye lo liquidado', textos.some((t) => /incluye lo liquidado/.test(t)), true);
  ok('el gasto más grande no es el anulado', textos.some((t) => /Semilla soja/.test(t)), true);
  ok('avisa de lo anulado', textos.some((t) => /Se anularon 1 movimiento/.test(t)), true);

  // Un mes sin ventas: tampoco se dice «No se registraron ventas» (para el campo es lo normal).
  const sinVentas = libroCampo({ ...datos(), resumen: resumir(movs.filter((m) => m.tipo !== 'venta')) });
  ok('mes sin ventas: sin la nota', textosDe(sinVentas.getWorksheet('Resumen')).some((t) => /No se registraron/.test(t)), false);

  // Mercadería aparte (106): va en su renglón y suma en lo que salió.
  const aparte = { ...resumen, mercaderiaAparte: true, comprasMercaderia: 3000000 };
  const libroAparte = libroCampo({ ...datos({ jerga: null }), resumen: aparte });
  const hr = libroAparte.getWorksheet('Resumen');
  ok('mercadería aparte en su renglón', valorDe(hr, 'Compra de mercadería'), 3000000);
  ok('y suma en lo que salió', valorDe(hr, 'Total que salió'), 32000000 + 3000000);
  ok('ganadería: debés atado a los lotes', valorDe(hr, 'Debés atado a los lotes (hoy)'), 10000000);
  ok('sin mercadería aparte no hay renglón', valorDe(h, 'Compra de mercadería'), undefined);
}

// ---------------------------------------------------------------------
// 3. Campañas: las 19 de siempre + 4 nuevas; lo que falta, vacío
// ---------------------------------------------------------------------
{
  const h = libroCampo(datos()).getWorksheet('Campañas');
  const titulos = fila(h, 6);
  ok('23 columnas', titulos.length, 23);
  ok('las nuevas al final', titulos.slice(19), ['Precio esperado/t', 'Costo/t', 'kg/ha para cubrir', 'Falta cubrir']);
  const norte = fila(h, 7);
  ok('cultivo en el idioma del archivo', norte[1], 'Maíz');
  ok('extras de la campaña', norte.slice(19), [800000, 280000, 1120, 0]);
  const sur = fila(h, 8);
  ok('costo que no se ve: vacío, no cero', [sur[9], sur[10], sur[20], sur[22]], [null, null, null, null]);
  ok('precio esperado sin cargar: vacío', sur[19], null);
  const total = fila(h, 9);
  ok('total: hectáreas', total[3], 100);
  ok('total: costo solo de lo que se ve', total[9], 42000000);
  ok('total: cobrado', total[11], 180000000);
  ok('total: precio promedio no se promedia entre cultivos distintos', total[17], null);
  ok('total: falta cubrir', total[22], 0);
  const pt = libroCampo(datos({ idioma: 'pt' })).getWorksheet('Safras');
  ok('cultivo en pt', fila(pt, 7)[1], 'Milho');

  const unCultivo = libroCampo(datos({ campanas: [soja] })).getWorksheet('Campañas');
  ok('un solo cultivo: precio promedio como la base', fila(unCultivo, 8)[17], 750000);
  const vacia = libroCampo(datos({ campanas: [] })).getWorksheet('Campañas');
  ok('sin campañas: lo dice', fila(vacia, 7)[0], 'Todavía no hay campañas cargadas.');
}

// ---------------------------------------------------------------------
// 4. Cosechas, Liquidaciones y Deudas
// ---------------------------------------------------------------------
{
  const libro = libroCampo(datos());
  const c = libro.getWorksheet('Cosechas');
  ok('cosechas: columnas', fila(c, 6), ['Fecha', 'Campaña', 'Ticket', 'Destino', 'kg brutos', 'kg netos', 'Humedad %']);
  ok('cosechas por fecha', fila(c, 7)[2], 'T-1');
  ok('kg brutos que faltan: vacío', fila(c, 8)[4], null);
  ok('cosechas: total netos', fila(c, 9)[5], 150000);
  ok('cosechas: total brutos de lo que hay', fila(c, 9)[4], 125000);

  const q = libro.getWorksheet('Liquidaciones');
  ok('liquidaciones: 14 columnas', fila(q, 6).length, 14);
  ok('moneda y precio del papel', fila(q, 7).slice(11), ['USD', 100, 7500]);
  ok('sin moneda del papel: vacío', fila(q, 8).slice(11), ['', null, null]);
  ok('total sin la anulada', fila(q, 9)[5], 90000000);
  ok('neto sin la anulada', fila(q, 9)[9], 83650000);

  const d = libro.getWorksheet('Deudas a cosecha');
  ok('deudas: primero lo que vence', fila(d, 7)[0], 'Casa de insumos');
  ok('sin categoría: «Deudas»', fila(d, 8)[2], 'Deudas');
  ok('deudas: total', fila(d, 9)[4], 10000000);
}

// ---------------------------------------------------------------------
// 5. Movimientos: cuenta, moneda original, campaña, y el total cuadra
// ---------------------------------------------------------------------
{
  const h = libroCampo(datos()).getWorksheet('Movimientos');
  const titulos = fila(h, 6);
  ok('movimientos: columnas', titulos, [
    'Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cobro/Pago', 'Cuenta', 'Monto',
    'Moneda original', 'Monto original', 'Cambio', 'Campaña', 'Estado',
  ]);
  ok('sin costo ni ganancia por fila', titulos.some((t) => /Costo|Ganancia/.test(t)), false);
  const semilla = fila(h, 7);
  ok('gasto en dólares: cuenta, monto y moneda original', [semilla[5], semilla[6], semilla[7], semilla[8], semilla[9], semilla[10]],
    ['Banco Continental', -30000000, 'USD', 4000, 7500, 'Norte · Zafra 2026/27']);
  const flete = fila(h, 8);
  ok('sin moneda original: vacío', [flete[7], flete[8], flete[9], flete[10]], ['', null, null, '']);
  // El total es la suma de las filas válidas.
  const sumaFilas = movs.filter((m) => m.estado === 'activo').reduce((s, m) => s + (m.tipo === 'gasto' ? -1 : 1) * m.monto, 0);
  ok('total = suma de las válidas', fila(h, 7 + movs.length)[6], sumaFilas);
  let tachada = false;
  h.eachRow((r) => { if (r.getCell(3).value === 'Error' && r.getCell(3).font && r.getCell(3).font.strike) tachada = true; });
  ok('la anulada va tachada', tachada, true);

  const gan = libroCampo(datos({ jerga: null })).getWorksheet('Movimientos');
  ok('ganadería: columna Lote', fila(gan, 6)[10], 'Lote');
}

// ---------------------------------------------------------------------
// 6. Ganadería: la hoja Lotes y sus cuentas por unidad
// ---------------------------------------------------------------------
{
  const novillos = { ...soja, id: 'n1', nombre: 'Novillos corral 3', unidad: 'cabezas', cantidad: 40, dias: 200,
    hectareas: null, cultivo: '', campana: '', costo: 80000000, por_unidad: 500000, resultado: 20000000 };
  ok('costo por cabeza', costoPorUnidad(novillos), 2000000);
  ok('por cabeza y día', porUnidadYDia(novillos), 2500);
  ok('sin cantidad: sin costo por unidad', costoPorUnidad({ costo: 100, cantidad: 0 }), null);
  ok('costo que no se ve: null', costoPorUnidad({ costo: null, cantidad: 10 }), null);
  ok('cero días: null', porUnidadYDia({ por_unidad: 10, dias: 0 }), null);

  const h = libroCampo(datos({ jerga: null, campanas: [novillos] })).getWorksheet('Lotes');
  ok('lotes: columnas', fila(h, 6).length, 15);
  ok('lotes: sin hectáreas ni kilos', fila(h, 6).some((t) => /ha|kg/.test(t)), false);
  const f = fila(h, 7);
  ok('lote: cantidad, unidad, días', [f[1], f[2], f[6]], [40, 'cabezas', 200]);
  ok('lote: por unidad', [f[10], f[13], f[14]], [2000000, 500000, 2500]);
  ok('lotes: la cantidad no se suma', fila(h, 8)[1], null);
}

// ---------------------------------------------------------------------
// 7. Qué campañas van, y la moneda de la vista
// ---------------------------------------------------------------------
ok('campañas del período', campanasDelPeriodo([vieja, soja, cerradaEnElPeriodo, futura], DESDE, HASTA).map((l) => l.id),
  ['l1', 'l2']);

{
  const c = conversorDe({ moneda: 'USD', propia: 'PYG', factor: 1 / 7500 });
  const v = enLaVistaCampo({ cosechas, deudas }, c);
  ok('deuda en dólares', v.deudas.map((d) => d.saldo), [533.333333, 800]);
  ok('los kilos no se convierten', v.cosechas.map((x) => x.kg_netos), [30000, 120000]);
  const igual = enLaVistaCampo({ cosechas, deudas }, conversorDe({ moneda: 'PYG', propia: 'PYG', factor: 1 }));
  ok('sin conversión, lo mismo', igual.deudas[0].saldo, 4000000);
  const usd = libroCampo(datos({ empresa: { moneda: 'USD', conversion: { propia: 'PYG', cotizacion: 7500, desde: '2026-09-01' } } }));
  ok('en USD: el formato dice dólares', /US\$/.test(usd.getWorksheet('Resumen').getCell('C7').numFmt || ''), true);
}

(async () => {
  // Que el archivo se pueda escribir entero (un merge mal hecho rompe acá).
  for (const jerga of ['agricultura', null]) {
    for (const idioma of ['es', 'pt']) {
      const buffer = await libroCampo(datos({ jerga, idioma })).xlsx.writeBuffer();
      ok(`se escribe (${jerga ?? 'ganadería'} ${idioma})`, buffer.byteLength > 1000, true);
    }
  }
  console.log(`\n${corridas} comprobaciones, ${fallos} fallos`);
  process.exit(fallos > 0 ? 1 : 0);
})();
