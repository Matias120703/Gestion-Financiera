const { resumir, rankingProductos, gastosPorCategoria, serieDiaria, variacion, factorDescuento, esValido, tieneCostos, logradoEnReto } = require('../.compilado/calculos.js');
const { resolverRango, rangoAnterior, diasDelRango, inicioDeSemana, sumarDias, diffDias, finDeMes } = require('../.compilado/fechas.js');
const { dinero, dineroCorto, fechaLegible, decimalesDe } = require('../.compilado/formato.js');
const { fichaDe, tieneSeccion, palabra, rubroVisible, LISTA_RUBROS } = require('../.compilado/rubros.js');

let fallos = 0;
function ok(nombre, real, esperado) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a);
}

// --- Escenario: reto de 10 millones ---
const venta = (o) => ({ estado:'activo', categoria:'Ventas', metodo_pago:'efectivo', descuento:0, subtotal:o.monto, ...o, tipo:'venta' });
const otro  = (o) => ({ estado:'activo', descuento:0, subtotal:o.monto, costo_total:0, metodo_pago:'efectivo', ...o });

const movs = [
  venta({ fecha:'2026-08-10', monto:900000, costo_total:500000,
    movimiento_items:[{producto_id:'p1', nombre:'Perfume Lattafa', cantidad:5, precio_unitario:180000, costo_unitario:100000}] }),
  venta({ fecha:'2026-08-10', monto:300000, costo_total:180000, metodo_pago:'transferencia',
    movimiento_items:[{producto_id:'p2', nombre:'Auricular BT', cantidad:2, precio_unitario:150000, costo_unitario:90000}] }),
  otro({ tipo:'gasto', fecha:'2026-08-10', monto:120000, categoria:'Transporte' }),
  otro({ tipo:'gasto', fecha:'2026-08-11', monto:80000, categoria:'Comida' }),
  otro({ tipo:'ingreso', fecha:'2026-08-11', monto:50000, categoria:'Otros' }),
];

const r = resumir(movs);
ok('ventas', r.ventas, 1200000);
ok('costo mercaderia', r.costoMercaderia, 680000);
ok('ganancia bruta', r.gananciaBruta, 520000);       // 1.200.000 - 680.000
ok('gastos', r.gastos, 200000);
ok('otros ingresos', r.otrosIngresos, 50000);
ok('ganancia neta', r.gananciaNeta, 370000);          // 520.000 + 50.000 - 200.000
ok('unidades', r.unidadesVendidas, 7);
ok('ticket promedio', r.ticketPromedio, 600000);
ok('margen bruto %', Math.round(r.margenBruto*10)/10, 43.3);

const rank = rankingProductos(movs);
ok('ranking largo', rank.length, 2);
ok('ranking 1ro', rank[0].nombre, 'Perfume Lattafa');
ok('ranking 1ro ganancia', rank[0].ganancia, 400000);
ok('ranking participacion', Math.round(rank[0].participacion), 75);

const cat = gastosPorCategoria(movs);
ok('categoria top', cat[0].nombre, 'Transporte');
ok('categoria participacion', cat[0].participacion, 60);

const dias = diasDelRango('2026-08-10','2026-08-12');
ok('dias del rango', dias, ['2026-08-10','2026-08-11','2026-08-12']);
const serie = serieDiaria(movs, dias);
ok('serie dia 1 ventas', serie[0].ventas, 1200000);
ok('serie dia 1 ganancia', serie[0].ganancia, 400000);   // 520.000 bruta - 120.000 transporte
ok('serie dia 2 ganancia', serie[1].ganancia, -30000);   // +50.000 ingreso - 80.000 comida
ok('suma serie = neta', serie.reduce((s,d)=>s+d.ganancia,0), r.gananciaNeta);

// --- Anuladas: no cuentan en ningún lado ---
const conAnulada = [
  ...movs,
  venta({ fecha:'2026-08-10', monto:5000000, costo_total:100, estado:'anulado',
    movimiento_items:[{producto_id:'p1', nombre:'Perfume Lattafa', cantidad:50, precio_unitario:100000, costo_unitario:2}] }),
];
const ra = resumir(conAnulada);
ok('anulada no suma a ventas', ra.ventas, r.ventas);
ok('anulada no suma a ganancia neta', ra.gananciaNeta, r.gananciaNeta);
ok('anulada no suma unidades', ra.unidadesVendidas, r.unidadesVendidas);
ok('anulada no cambia el ticket promedio', ra.ticketPromedio, r.ticketPromedio);
ok('pero queda contada aparte', [ra.ventasAnuladas, ra.montoVentasAnuladas], [1, 5000000]);
ok('anulada fuera del ranking', rankingProductos(conAnulada)[0].unidades, rank[0].unidades);
ok('anulada fuera de la serie diaria', serieDiaria(conAnulada, dias)[0].ventas, 1200000);

// --- Anuladas: solo las VENTAS cuentan como ventas anuladas ---
// anular_movimiento() también anula gastos e ingresos. Una métrica que se
// llama "ventas anuladas" no puede estar contando esas otras cosas.
const mezcla = [
  venta({ fecha:'2026-08-10', monto:500000, costo_total:200000, estado:'anulado',
    movimiento_items:[{producto_id:'p1', nombre:'X', cantidad:1, precio_unitario:500000, costo_unitario:200000}] }),
  otro({ tipo:'gasto',   fecha:'2026-08-10', monto:120000, estado:'anulado', categoria:'Transporte' }),
  otro({ tipo:'gasto',   fecha:'2026-08-10', monto:80000,  estado:'anulado', categoria:'Comida' }),
  otro({ tipo:'ingreso', fecha:'2026-08-11', monto:50000,  estado:'anulado', categoria:'Otros' }),
];
const rm = resumir(mezcla);
ok('1 venta + 2 gastos + 1 ingreso anulados → ventas anuladas', rm.ventasAnuladas, 1);
ok('y el monto es solo el de la venta', rm.montoVentasAnuladas, 500000);
ok('el total de anulados sí cuenta los cuatro', rm.movimientosAnulados, 4);
ok('con su monto total', rm.montoMovimientosAnulados, 750000);
ok('nada de eso suma a ventas', rm.ventas, 0);
ok('ni a gastos', rm.gastos, 0);
ok('ni a otros ingresos', rm.otrosIngresos, 0);
ok('ni a la ganancia neta', rm.gananciaNeta, 0);

const soloGastoAnulado = resumir([otro({ tipo:'gasto', fecha:'2026-08-10', monto:9999, estado:'anulado' })]);
ok('un gasto anulado NO cuenta como venta anulada', soloGastoAnulado.ventasAnuladas, 0);
ok('pero sí como movimiento anulado', soloGastoAnulado.movimientosAnulados, 1);

const soloIngresoAnulado = resumir([otro({ tipo:'ingreso', fecha:'2026-08-10', monto:7777, estado:'anulado' })]);
ok('un ingreso anulado tampoco cuenta como venta anulada', soloIngresoAnulado.ventasAnuladas, 0);
ok('pero sí como movimiento anulado', soloIngresoAnulado.movimientosAnulados, 1);

// --- Sin permiso para ver costos ---
// La base manda costo_total y costo_unitario en null para un vendedor.
// El resumen tiene que avisarlo, no devolver ceros que parezcan datos.
const sinCostos = [
  { ...venta({ fecha:'2026-08-10', monto:300000,
      movimiento_items:[{producto_id:'p1', nombre:'Perfume', cantidad:2, precio_unitario:150000, costo_unitario:null}] }),
    costo_total: null },
  otro({ tipo:'gasto', fecha:'2026-08-10', monto:50000, categoria:'Transporte' }),
];
const rsc = resumir(sinCostos);
ok('avisa que no tiene costos', rsc.conCostos, false);
ok('las ventas sí se ven', rsc.ventas, 300000);
ok('los gastos también', rsc.gastos, 50000);
ok('las unidades también', rsc.unidadesVendidas, 2);
ok('el costo de mercadería queda en cero', rsc.costoMercaderia, 0);
ok('la ganancia bruta NO se inventa', rsc.gananciaBruta, 0);
ok('la ganancia neta tampoco', rsc.gananciaNeta, 0);
ok('ni los márgenes', [rsc.margenBruto, rsc.margenNeto], [0, 0]);
ok('con costos completos sí avisa que están', resumir(movs).conCostos, true);
ok('un periodo sin ventas no se considera sin costos', resumir([otro({tipo:'gasto',fecha:'2026-08-10',monto:1})]).conCostos, true);

// El ranking: lo vendido se ve, la rentabilidad NO se inventa.
const rankSinCosto = rankingProductos(sinCostos);
ok('el ranking sigue mostrando lo vendido', rankSinCosto[0].ingresos, 300000);
ok('y las unidades', rankSinCosto[0].unidades, 2);
ok('el costo queda en null, no en cero', rankSinCosto[0].costo, null);
ok('la ganancia también', rankSinCosto[0].ganancia, null);
ok('y el margen también', rankSinCosto[0].margen, null);
ok('la participación sí se puede calcular', rankSinCosto[0].participacion, 100);

// Con costos completos el ranking sigue dando números.
const rankConCosto = rankingProductos(movs);
ok('con costos, el costo es número', typeof rankConCosto[0].costo, 'number');
ok('la ganancia también', rankConCosto[0].ganancia, 400000);
ok('y el margen también', typeof rankConCosto[0].margen, 'number');

// Mezcla: un producto con costo y otro sin. Cada uno se resuelve por separado.
const mezclado = [
  { ...venta({ fecha:'2026-08-10', monto:100000,
      movimiento_items:[{producto_id:'con', nombre:'Con costo', cantidad:1, precio_unitario:100000, costo_unitario:40000}] }),
    costo_total: 40000 },
  { ...venta({ fecha:'2026-08-10', monto:200000,
      movimiento_items:[{producto_id:'sin', nombre:'Sin costo', cantidad:1, precio_unitario:200000, costo_unitario:null}] }),
    costo_total: null },
];
const rankMix = rankingProductos(mezclado);
const conC = rankMix.find(x => x.nombre === 'Con costo');
const sinC = rankMix.find(x => x.nombre === 'Sin costo');
ok('el producto con costo conserva su ganancia', conC.ganancia, 60000);
ok('el producto sin costo la deja en null', sinC.ganancia, null);
ok('un solo item sin costo basta para anular la ganancia del producto',
   rankingProductos([
     { ...venta({ fecha:'2026-08-10', monto:300000,
         movimiento_items:[
           {producto_id:'x', nombre:'X', cantidad:1, precio_unitario:100000, costo_unitario:50000},
           {producto_id:'x', nombre:'X', cantidad:1, precio_unitario:200000, costo_unitario:null},
         ] }), costo_total: null },
   ])[0].ganancia, null);

// La serie diaria: mismo criterio.
const serieSinCosto = serieDiaria(sinCostos, ['2026-08-10']);
ok('la serie muestra lo vendido del día', serieSinCosto[0].ventas, 300000);
ok('y los gastos', serieSinCosto[0].gastos, 50000);
ok('pero la ganancia del día queda en null', serieSinCosto[0].ganancia, null);

const serieConCosto = serieDiaria(movs, ['2026-08-10']);
ok('con costos, la ganancia del día es número', typeof serieConCosto[0].ganancia, 'number');

// Un día sin ventas sin costo no se contamina.
const dosDias = serieDiaria([
  { ...venta({ fecha:'2026-08-10', monto:100000,
      movimiento_items:[{producto_id:'a', nombre:'A', cantidad:1, precio_unitario:100000, costo_unitario:null}] }),
    costo_total: null },
  otro({ tipo:'gasto', fecha:'2026-08-11', monto:20000 }),
], ['2026-08-10','2026-08-11']);
ok('el día con la venta sin costo queda en null', dosDias[0].ganancia, null);
ok('el día que solo tiene un gasto sí se puede calcular', dosDias[1].ganancia, -20000);

// Ningún null se disfraza de cero en el resumen tampoco.
ok('el resumen no reporta ganancia falsa', resumir(sinCostos).gananciaBruta, 0);
ok('pero avisa que no tiene costos', resumir(sinCostos).conCostos, false);

ok('un reto por ventas se puede medir sin costos', logradoEnReto(sinCostos, 'ventas'), 300000);
ok('uno por ganancia devuelve null en vez de mentir', logradoEnReto(sinCostos, 'ganancia'), null);
ok('y con costos sí devuelve el número', logradoEnReto(movs, 'ganancia'), resumir(movs).gananciaNeta);

// --- Descuento prorrateado entre productos ---
// A pesa 60% del subtotal y B 40%. Con 10.000 de descuento: A absorbe 6.000, B 4.000.
const conDescuento = [
  venta({ fecha:'2026-08-10', subtotal:100000, descuento:10000, monto:90000, costo_total:40000,
    movimiento_items:[
      {producto_id:'a', nombre:'A', cantidad:1, precio_unitario:60000, costo_unitario:25000},
      {producto_id:'b', nombre:'B', cantidad:1, precio_unitario:40000, costo_unitario:15000},
    ] }),
];
const rd = resumir(conDescuento);
ok('ventas = lo cobrado, no el precio de lista', rd.ventas, 90000);
ok('ventas brutas', rd.ventasBrutas, 100000);
ok('descuentos', rd.descuentos, 10000);
ok('el descuento NO toca el costo', rd.costoMercaderia, 40000);
ok('ganancia bruta con descuento', rd.gananciaBruta, 50000);

const rankD = rankingProductos(conDescuento);
const a = rankD.find(x => x.nombre === 'A'), b = rankD.find(x => x.nombre === 'B');
ok('A absorbe el 60% del descuento', a.descuento, 6000);
ok('B absorbe el 40% del descuento', b.descuento, 4000);
ok('A cobrado', a.ingresos, 54000);
ok('B cobrado', b.ingresos, 36000);
ok('la suma del ranking = ventas del panel', a.ingresos + b.ingresos, rd.ventas);
ok('la suma de descuentos del ranking = descuento total', a.descuento + b.descuento, rd.descuentos);
ok('ganancia de A', a.ganancia, 29000);
ok('ganancia de B', b.ganancia, 21000);
ok('la suma de ganancias = ganancia bruta', a.ganancia + b.ganancia, rd.gananciaBruta);

// --- División por cero ---
const vacio = resumir([]);
ok('sin datos: margen bruto', vacio.margenBruto, 0);
ok('sin datos: margen neto', vacio.margenNeto, 0);
ok('sin datos: ticket promedio', vacio.ticketPromedio, 0);
ok('sin datos: ningún número es NaN',
   Object.values(vacio).filter(v => typeof v === 'number').every(Number.isFinite), true);
const soloGasto = resumir([otro({ tipo:'gasto', fecha:'2026-08-10', monto:5000 })]);
ok('solo gastos: ticket promedio sigue en 0', soloGasto.ticketPromedio, 0);
ok('solo gastos: ganancia neta negativa', soloGasto.gananciaNeta, -5000);
ok('venta de monto 0 no rompe el factor', factorDescuento({ subtotal:0, monto:0 }), 1);

// --- Fechas (13 ago 2026 es jueves) ---
ok('inicio de semana', inicioDeSemana('2026-08-13'), '2026-08-10');
ok('sumar dias cruzando mes', sumarDias('2026-08-31', 1), '2026-09-01');
ok('sumar dias negativo', sumarDias('2026-03-01', -1), '2026-02-28');
ok('fin de mes febrero bisiesto', finDeMes('2028-02-05'), '2028-02-29');
ok('diff dias', diffDias('2026-08-10','2026-08-16'), 6);
const rg = resolverRango('semana','2026-08-13');
ok('rango semana', [rg.desde, rg.hasta], ['2026-08-10','2026-08-13']);
const ant = rangoAnterior({desde:'2026-08-10', hasta:'2026-08-16'});
ok('rango anterior', [ant.desde, ant.hasta], ['2026-08-03','2026-08-09']);
const mp = resolverRango('mes_pasado','2026-08-13');
ok('mes pasado', [mp.desde, mp.hasta], ['2026-07-01','2026-07-31']);

// --- Formato ---
ok('decimales PYG', decimalesDe('PYG'), 0);
ok('dinero PYG', dinero(10000000,'PYG'), 'Gs. 10.000.000');
ok('dinero USD', dinero(1234.5,'USD'), 'US$ 1.234,50');
ok('corto millones', dineroCorto(10000000,'PYG'), 'Gs. 10,0 M');
ok('corto miles', dineroCorto(850000,'PYG'), 'Gs. 850 mil');
// Intl abrevia el mes con punto ('ene.'), que es la forma correcta en español
// y en alemán. El array de meses escrito a mano que había antes lo omitía.
ok('fecha legible sin corrimiento', fechaLegible('2026-01-01'), '1 ene. 2026');
ok('fecha legible en inglés', fechaLegible('2026-01-01', true, 'en-US'), 'Jan 1, 2026');
ok('corto en inglés usa sus abreviaturas',
  dineroCorto(10000000, 'PYG', 'en-US', { mil: 'k', millon: 'M', milMillones: 'B' }), 'Gs. 10.0 M');
ok('variacion', Math.round(variacion(150,100)), 50);
ok('variacion desde cero', variacion(100,0), null);

// --- Qué pantallas existen según el rubro ---
//
// Esta tabla ES el filtro, escrito de forma que se pueda leer de un vistazo.
// Si alguien mueve una sección de rubro, esto lo dice con nombre y apellido
// en vez de dejarlo pasar: fue lo que falló con los lotes, que se
// construyeron para el ganadero y aparecieron también en la barbería.
//
// Vive en TypeScript y no en PostgreSQL porque no protege nada: que a un
// almacén le sobre una pantalla no le filtra un dato a nadie. Pero
// equivocarse acá sí rompe algo — fue el mismo bug que le dejó el cierre del
// día a las cuentas personales durante meses.
const COLUMNAS = [
  ['comercio', 'emprendedor'],
  ['servicios', 'emprendedor'],
  ['ganaderia', 'emprendedor'],
  ['agricultura', 'emprendedor'],
  ['comercio', 'personal'],
];

//                    comercio  servicios  ganadería  agricultura  personal
const MATRIZ = {
  '/panel':        [ true,     true,      true,      true,        true  ],
  '/vender':       [ true,     true,      true,      true,        false ],
  '/gastos':       [ true,     true,      true,      true,        true  ],
  '/deudas':       [ true,     true,      true,      true,        true  ],
  '/productos':    [ true,     true,      true,      true,        false ],
  '/movimientos':  [ true,     true,      true,      true,        true  ],
  '/reportes':     [ true,     true,      true,      true,        true  ],
  '/ajustes':      [ true,     true,      true,      true,        true  ],
  // El día como unidad: solo donde se cierra todos los días.
  '/cierre':       [ true,     true,      false,     false,       false ],
  '/reto':         [ true,     true,      false,     false,       false ],
  // Lo propio de cada uno.
  '/agenda':       [ false,    true,      false,     false,       false ],
  '/reparto':      [ false,    true,      false,     false,       false ],
  '/lotes':        [ false,    false,     true,      true,        false ],
  '/organizacion': [ false,    false,     false,     false,       true  ],
  // Lo que te deben es de todos; los clientes, de todo negocio y no de una
  // persona.
  '/fiado':        [ true,     true,      true,      true,        true  ],
  '/clientes':     [ true,     true,      true,      true,        false ],
  // Cuánto hay en cada banco: una persona y un negocio tienen bancos (074).
  '/billetera':    [ true,     true,      true,      true,        true  ],
};

for (const [ruta, esperado] of Object.entries(MATRIZ)) {
  const real = COLUMNAS.map(([rubro, tipo]) => fichaDe(rubro, tipo).secciones[ruta]);
  ok('secciones de ' + ruta, real, esperado);
}

// Que la tabla de arriba no se quede corta. Si mañana se suma una sección al
// tipo `Seccion`, el compilador obliga a contestarla en los cinco rubros —
// pero no puede obligar a nadie a comprobarla acá. Esto sí.
const enLaFicha = Object.keys(fichaDe('comercio', 'emprendedor').secciones).sort();
ok('la tabla cubre todas las secciones que existen',
  Object.keys(MATRIZ).sort(), enLaFicha);

// --- El ciclo del negocio ---
//
// `ciclosLargos` esconde la racha del panel y en su lugar muestra el
// acumulado del año. Va con quién NO mide su ganancia por día.
const cicloLargo = (rubro, tipo) => fichaDe(rubro, tipo).ciclosLargos;

ok('el ganadero mide por ciclo, no por día', cicloLargo('ganaderia', 'emprendedor'), true);
ok('el agricultor también', cicloLargo('agricultura', 'emprendedor'), true);
ok('el almacén no', cicloLargo('comercio', 'emprendedor'), false);
ok('la peluquería tampoco: cobra hoy lo que hizo hoy',
  cicloLargo('servicios', 'emprendedor'), false);
ok('ni una cuenta personal', cicloLargo('comercio', 'personal'), false);

// Las dos cosas tienen que decir lo mismo: quien no cierra el día es
// exactamente quien mide por ciclo largo. Cuando se contradijeron, a la
// barbería se le escondía la racha y se le mostraba un resumen anual.
ok('cerrar el día y medir por ciclo son la misma pregunta al revés',
  COLUMNAS.map(([r, t]) => fichaDe(r, t).cierraElDia === !cicloLargo(r, t)),
  [true, true, true, true, false]);
ok('salvo la cuenta personal, que no cierra el día ni tiene ciclo largo',
  [fichaDe('comercio', 'personal').cierraElDia, cicloLargo('comercio', 'personal')],
  [false, false]);

// Y que el guardia de cada página conteste lo mismo que el menú: si el menú
// esconde algo pero la página lo deja abrir escribiendo la URL, no está
// escondido.
ok('tieneSeccion contesta igual que la ficha',
  COLUMNAS.every(([r, t]) => Object.keys(MATRIZ)
    .every((ruta) => tieneSeccion(r, t, ruta) === fichaDe(r, t).secciones[ruta])), true);

// --- La barra de abajo del celular ---
//
// Tenía las columnas escritas a mano (`grid-cols-5`) y la cantidad de
// botones depende del rubro: un ganadero no tiene cierre del día, así que
// le quedaban cuatro botones repartidos en cinco columnas y una franja
// vacía a la derecha. Lo mismo a un vendedor de comercio, que no tiene
// agenda.
{
  const nav = require('fs').readFileSync('src/components/Navegacion.tsx', 'utf8');

  // Las tres barras salen del propio componente: si mañana cambian, esta
  // prueba mide las nuevas y no una copia que quedó vieja.
  // Se corta desde el `= [` y no desde el primer `[`: el primero es el de
  // `Seccion[]`, el tipo, y cortar ahí devolvía una lista vacía — con lo cual
  // todos los rubros parecían tener la misma cantidad de botones y la prueba
  // no comprobaba nada.
  const listaDe = (nombre) => {
    const linea = nav.slice(nav.indexOf('const ' + nombre));
    const desdeIgual = linea.indexOf('= [');
    return linea.slice(desdeIgual + 3, linea.indexOf(']', desdeIgual))
      .split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
  };

  const casos = [
    ['comercio dueño',     'comercio',    'emprendedor', listaDe('EN_BARRA_INFERIOR:')],
    ['servicios dueño',    'servicios',   'emprendedor', listaDe('EN_BARRA_INFERIOR:')],
    ['ganadería dueño',    'ganaderia',   'emprendedor', listaDe('EN_BARRA_INFERIOR:')],
    ['agricultura dueño',  'agricultura', 'emprendedor', listaDe('EN_BARRA_INFERIOR:')],
    ['personal',           'comercio',    'personal',    listaDe('EN_BARRA_INFERIOR_PERSONAL:')],
    ['comercio vendedor',  'comercio',    'emprendedor', listaDe('EN_BARRA_INFERIOR_VENDEDOR:')],
  ];

  // Cuántos botones tiene de verdad cada uno: los fijos que existen para
  // ese rubro, más el de «Más», que está siempre.
  const botones = casos.map(([nombre, rubro, tipo, base]) => [
    nombre,
    base.filter((h) => fichaDe(rubro, tipo).secciones[h]).length + 1,
  ]);

  ok('la barra no tiene la misma cantidad de botones en todos los rubros',
    new Set(botones.map(([, n]) => n)).size > 1, true);

  ok('y el ganadero es de los que tienen menos',
    botones.find(([n]) => n === 'ganadería dueño')[1] < 5, true);

  // Lo que se rompió: un número fijo de columnas para una cantidad de
  // botones que varía. Mientras las columnas se calculen, no puede volver.
  // Se busca por sus clases y no por cómo empieza la etiqueta: la barra pasó a
  // armar la clase con una plantilla (para esconderse con el menú abierto) y
  // buscar `className="` ya no la encontraba.
  // Desde que la barra flota (de vidrio, como la de iPhone) se busca por su
  // clase nueva; el tramo es más largo porque adelante tiene su comentario.
  const desde = nav.indexOf('fixed inset-x-0 bottom-0 z-50 touch-none px-3');
  const barra = nav.slice(desde, desde + 1800);
  // Se miran solo las CLASES y no el texto crudo: el comentario que explica
  // este arreglo nombra el problema viejo, y buscarlo a secas lo encontraría
  // ahí y daría por rota una barra que está bien.
  const clases = (barra.match(/className=("[^"]*"|{`[^`]*`})/g) ?? []).join(' ');
  ok('las columnas de la barra no están escritas a mano',
    /grid-cols-\d/.test(clases), false);
  ok('la barra se encontró', desde > 0, true);
  ok('se calculan a partir de los botones que hay',
    barra.includes('gridTemplateColumns') && nav.includes('const columnas = fijos.length + 1;'), true);
}

// --- Las palabras de cada rubro ---
//
// `palabra()` existía desde que se creó el módulo de rubros y NUNCA se
// llamaba desde ningún lado: estaba escrita, exportada y muerta. Por eso a
// un ganadero el menú le decía «Productos» en vez de «Hacienda», y a un
// agricultor en vez de «Cultivos».
//
// Un mecanismo que nadie llama no da error: simplemente no pasa nada, y eso
// es lo difícil de notar. Por eso se comprueba las dos cosas — que la
// función traduzca, y que el menú la use.
ok('a un ganadero se le dice Hacienda',
  palabra('ganaderia', 'emprendedor', 'productos', 'Productos', 'es'), 'Hacienda');
ok('a un agricultor, Cultivos',
  palabra('agricultura', 'emprendedor', 'productos', 'Productos', 'es'), 'Cultivos');
// «Servicios y productos» desde que la pantalla tiene las dos pestañas: con
// «Servicios» solo, quien iba a cargar lo que revende dudaba del lugar.
ok('a una peluquería, Servicios y productos',
  palabra('servicios', 'emprendedor', 'productos', 'Productos', 'es'), 'Servicios y productos');
ok('y a un almacén no se le cambia nada',
  palabra('comercio', 'emprendedor', 'productos', 'Productos', 'es'), 'Productos');
ok('la peluquería cobra, no vende',
  palabra('servicios', 'emprendedor', 'vender', 'Vender', 'es'), 'Cobrar');

// En portugués cada rubro tiene sus propias palabras (2026-09-16): a un
// ganadero brasileño se le dice «Rebanho», no la palabra genérica.
ok('en portugués, al ganadero se le dice Rebanho',
  palabra('ganaderia', 'emprendedor', 'productos', 'Produtos', 'pt'), 'Rebanho');
ok('a la peluquería, Receber',
  palabra('servicios', 'emprendedor', 'vender', 'Vender', 'pt'), 'Receber');
ok('y en portugués nunca se cuela la palabra en español',
  palabra('agricultura', 'emprendedor', 'productos', 'Produtos', 'pt') !== 'Cultivos', true);
ok('otro idioma sin palabras propias usa la genérica',
  palabra('ganaderia', 'emprendedor', 'productos', 'Products', 'en'), 'Products');
ok('el nombre del rubro al elegirlo, en portugués',
  rubroVisible(fichaDe('ganaderia', 'emprendedor'), 'pt').nombre, 'Pecuária');
ok('y en español no cambia',
  rubroVisible(fichaDe('ganaderia', 'emprendedor'), 'es').nombre, 'Ganadería');
ok('una cuenta personal también tiene su nombre en portugués',
  rubroVisible(fichaDe(null, 'personal'), 'pt').nombre, 'Pessoal');

// Y que el menú la llame de verdad. Sin esto, la función puede volver a
// quedar perfecta y sin usar, que es exactamente lo que pasó.
{
  const nav = require('fs').readFileSync('src/components/Navegacion.tsx', 'utf8');
  ok('el menú usa las palabras del rubro', nav.includes('palabra('), true);
  ok('y se las aplica a productos',
    /suPalabra\('productos'/.test(nav), true);
}

// --- Qué rubros se ofrecen al crear la cuenta ---
//
// Agricultura funciona pero no se ofrece: no se probó con un agricultor de
// verdad. Sacarla de la lista NO la rompe — la ficha sigue entera y una
// cuenta que ya la tenga guardada sigue andando. Por eso se comprueban las
// dos cosas: que no se ofrezca, y que igual siga funcionando.
ok('la lista que se ofrece al registrarse',
  LISTA_RUBROS.map((r) => r.clave), ['comercio', 'servicios', 'ganaderia']);
ok('agricultura no se ofrece',
  LISTA_RUBROS.some((r) => r.clave === 'agricultura'), false);
ok('pero una cuenta que ya la tenga sigue teniendo sus lotes',
  fichaDe('agricultura', 'emprendedor').secciones['/lotes'], true);
ok('y sus palabras',
  palabra('agricultura', 'emprendedor', 'productos', 'Productos', 'es'), 'Cultivos');

ok('un rubro desconocido no rompe: cae en comercio',
  fichaDe('marciano', 'emprendedor').clave, 'comercio');

// --- Ver en otra moneda: la cuenta que decide si el número es cierto ---
//
// La conversión vive pegada a la moneda (`Vista`) para que el símbolo y el
// factor no se puedan separar. Si se separaran, una pantalla mostraría el
// número en guaraníes con el símbolo del dólar — el mismo error que esto
// viene a arreglar, pero en un solo lugar y sin que nadie lo note.
{
  const F = require('../.compilado/formato.js');

  const enDolares = {
    moneda: 'USD', factor: 1 / 7300, propia: 'PYG',
    cotizacion: 7300, desde: '2026-09-09T12:00:00Z',
  };

  // Un string suelto sigue significando «esta moneda, sin convertir». Es lo
  // que reciben los formularios, y romperlo sería guardar dólares como
  // guaraníes.
  ok('un string no convierte nada', F.dinero(5000000, 'PYG', false, 'es-PY'), '5.000.000');
  ok('y sigue poniendo su símbolo', F.dinero(1000, 'PYG', true, 'es-PY'), 'Gs. 1.000');

  ok('5.000.000 al cambio 7.300 son 684,93 dólares',
    F.dinero(5000000, enDolares, false, 'es-PY'), '684,93');
  ok('con el símbolo de la moneda que se está mirando',
    F.dinero(5000000, enDolares, true, 'es-PY'), 'US$ 684,93');

  // Los decimales salen de la moneda de la VISTA, no de la propia. En
  // guaraníes no hay centavos; en dólares sí, y esconderlos acá sería
  // redondear plata en pantalla.
  ok('los centavos aparecen porque el dólar los tiene',
    F.dinero(7300, enDolares, false, 'es-PY'), '1,00');

  // La abreviatura se decide sobre el número YA convertido. Al revés, cinco
  // millones de guaraníes se leerían «US$ 5,0 M»: la escala con una moneda y
  // el símbolo con la otra.
  ok('el corto abrevia sobre lo convertido',
    F.dineroCorto(5000000, enDolares, 'es-PY'), 'US$ 684,93');
  ok('y sin vista abrevia como siempre',
    F.dineroCorto(5000000, 'PYG', 'es-PY'), 'Gs. 5,0 M');

  ok('convertido() da el número solo', Math.round(F.convertido(7300, enDolares)), 1);
  ok('sin vista, el número no se toca', F.convertido(7300, 'PYG'), 7300);

  ok('sabe cuándo está convertida', F.estaConvertida(enDolares), true);
  ok('y cuándo no', F.estaConvertida('PYG'), false);
  // Mirar en la misma moneda no es una conversión: si contara como tal, el
  // cartel de arriba diría «estás viendo en Gs. al cambio 1».
  ok('ver en la propia no cuenta como conversión',
    F.estaConvertida(F.sinConvertir('PYG')), false);

  // Un número que no se puede convertir no puede terminar en pantalla como
  // «NaN» ni como «Infinity» donde iba plata.
  ok('un valor roto no imprime NaN', F.dinero(NaN, enDolares, false, 'es-PY'), '0,00');
  ok('ni el corto', F.dineroCorto(NaN, enDolares, 'es-PY'), 'US$ 0,00');

  // Y el precio de la suscripción, que se muestra sin centavos cuando no los
  // tiene: «US$ 32», no «US$ 32,00».
  ok('un precio redondo va sin centavos', F.precio(32, 'USD', 'es-PY'), 'US$ 32');
  ok('y uno con centavos los muestra', F.precio(9.9, 'USD', 'es-PY'), 'US$ 9,90');
  ok('en guaraníes, como siempre', F.precio(190000, 'PYG', 'es-PY'), 'Gs. 190.000');
}

// --- Los dos caminos de venta mandan el cliente ---
//
// Desde la 055, la base rechaza una venta fiada sin cliente. Eso arregla el
// dato, pero deja un filo: si una pantalla no manda `p_cliente`, elegir
// «Fiado» ahí se convierte en un callejón sin salida — un error del servidor
// sobre algo que la persona ya dio por confirmado, y sin nada que pueda
// hacer al respecto.
//
// Hay DOS caminos que registran ventas y los dos tienen que mandarlo. Esto
// se cuenta, no se comprueba de a uno: contar es lo que agarra al tercero
// que aparezca mañana.
{
  const fs = require('fs');
  const pantallas = ['src/components/PantallaVenta.tsx', 'src/components/CapturaInteligente.tsx'];

  for (const ruta of pantallas) {
    const codigo = fs.readFileSync(ruta, 'utf8');
    const corto = ruta.replace('src/components/', '');
    ok(corto + ' registra ventas', codigo.includes("rpc('registrar_venta'"), true);
    ok(corto + ' manda el cliente', codigo.includes('p_cliente:'), true);
    ok(corto + ' ofrece elegirlo', codigo.includes('<SelectorCliente'), true);
    // Y avisa antes de mandar, en vez de dejar que reviente en el servidor.
    ok(corto + ' avisa antes de fiar sin cliente',
      codigo.includes("metodo_pago === 'credito'") || codigo.includes("metodo === 'credito'"), true);
  }

  // La captura por voz: lo que la IA entendió como «a quién» tiene que
  // llegar ya escrito, y olvidarse al cerrar. Las dos cosas fallaban.
  {
    const cap = fs.readFileSync('src/components/CapturaInteligente.tsx', 'utf8');
    ok('la captura trae el nombre que entendió la IA',
      cap.includes('nombre: interpretado.contraparte'), true);
    const desde = cap.indexOf('function cerrar()');
    const cuerpo = cap.slice(desde, cap.indexOf('\n  }\n', desde));
    ok('y lo olvida al cerrar, para no pegárselo a la venta siguiente',
      desde > 0 && cuerpo.includes('setElegido('), true);
    ok('y solo crea la ficha cuando se fía',
      cap.includes('? await asegurarCliente(empresaId, elegido)'), true);
  }

  // Nadie más llama a registrar_venta. Si aparece un tercer camino, esta
  // línea falla y obliga a mirarlo.
  const todas = [];
  const mirar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = dir + '/' + e.name;
      if (e.isDirectory()) { mirar(r); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      if (fs.readFileSync(r, 'utf8').includes("rpc('registrar_venta'")) todas.push(r.replace('src/', ''));
    }
  };
  mirar('src');
  ok('solo esos dos caminos registran ventas', todas.sort(),
    ['components/CapturaInteligente.tsx', 'components/PantallaVenta.tsx']);
}

// --- Las pantallas de Fiado y Clientes ---
//
// Las funciones de la base se prueban en clientes.test.js. Esto comprueba
// que las pantallas existan y lleguen a ellas, y dos reglas que no se
// ven en la base: que la ficha del cliente se cree al guardar y no
// mientras se escribe, y que el menú ofrezca las dos secciones.
{
  const fs = require('fs');
  const fia = fs.readFileSync('src/components/PantallaFiado.tsx', 'utf8');
  const cli = fs.readFileSync('src/components/PantallaClientes.tsx', 'utf8');
  const nav = fs.readFileSync('src/components/Navegacion.tsx', 'utf8');
  ok('Fiado cobra', fia.includes("rpc('cobrar_fiado'"), true);
  ok('Fiado anota', fia.includes("rpc('anotar_fiado'"), true);
  ok('Fiado deja borrar lo anotado por error', fia.includes("rpc('borrar_linea_fiado'"), true);
  ok('Fiado crea la ficha al guardar, no al escribir', fia.includes('await asegurarCliente('), true);
  ok('Clientes guarda', cli.includes("rpc('guardar_cliente'"), true);
  ok('Clientes muestra el historial de turnos', cli.includes("rpc('historial_cliente'"), true);
  ok('el menú tiene Fiado', nav.includes("href: '/fiado'"), true);
  ok('y Clientes', nav.includes("href: '/clientes'"), true);
  // «Lucas me debe 300 mil» es fiado, no una deuda tuya: la voz no lo conocía.
  const rf = fs.readFileSync('src/components/RevisionFiado.tsx', 'utf8');
  ok('la voz anota lo que te deben en el libro de fiado', rf.includes("rpc('anotar_fiado'"), true);
  ok('y el cobro baja lo que debe, sin sumar como ingreso', rf.includes("rpc('cobrar_fiado'"), true);
  ok('la captura manda el fiado a su propia revisión',
    fs.readFileSync('src/components/CapturaInteligente.tsx', 'utf8').includes('<RevisionFiado'), true);
  ok('una deuda cargada por error se puede eliminar',
    fs.readFileSync('src/components/PantallaDeudas.tsx', 'utf8').includes("rpc('archivar_deuda'"), true);
  // Servicios y productos, separados (estaba en el cuaderno del dueño).
  const pro = fs.readFileSync('src/components/PantallaProductos.tsx', 'utf8');
  ok('productos tiene pestañas de servicios y productos',
    pro.includes("type Tipo = 'servicios' | 'productos'"), true);
  // Los textos viven en el diccionario desde que la pantalla habla portugués.
  const textosEs = fs.readFileSync('src/i18n/textos/es.ts', 'utf8');
  ok('cada pestaña crea lo suyo',
    pro.includes('controla_stock: !enServicios')
      && pro.includes('t.productos.nuevoServicio') && pro.includes('t.productos.nuevoProducto')
      && textosEs.includes("nuevoServicio: '+ Servicio'") && textosEs.includes("nuevoProducto: '+ Producto'"), true);
  ok('el formulario pregunta qué es, sin tilde escondido',
    pro.includes('t.productos.queEs') && textosEs.includes("queEs: 'Qué es'")
      && !pro.includes('t.productos.controlarStock}'), true);
  const pag = fs.readFileSync('src/app/(app)/productos/page.tsx', 'utf8');
  ok('en servicios y oficios siempre hay pestañas',
    pag.includes("ctx.empresa.rubro === 'servicios'"), true);

  // Eliminar, con lo que significa en cada lado (058).
  ok('el cliente se elimina desde su ficha', cli.includes("rpc('eliminar_cliente'"), true);
  // La frase vive en el diccionario desde que la pantalla habla portugués:
  // se mira que la pantalla la use y que el texto siga diciendo qué hacer.
  ok('a quien debe se lo manda a Fiado antes',
    cli.includes('t.clientes.primeroCobrale(')
      && fs.readFileSync('src/i18n/textos/es.ts', 'utf8').includes('primero cobrale o borrá su deuda'), true);
  ok('y eliminar clientes es del administrador',
    fs.readFileSync('src/app/(app)/clientes/page.tsx', 'utf8').includes('puedeEliminar={ctx.esAdmin}'), true);
  ok('lo del catálogo se elimina desde el formulario', pro.includes("rpc('eliminar_producto'"), true);
  ok('y avisa cuando en vez de borrarse quedó pausado', pro.includes("data === 'pausado'"), true);

  // El cierre del día dice lo que «Entró» no dice (057).
  const cie = fs.readFileSync('src/app/(app)/cierre/page.tsx', 'utf8');
  ok('el cierre muestra lo fiado del día', cie.includes('cierre.fiado_vendido'), true);
  ok('y lo cobrado de fiados', cie.includes('cierre.fiado_cobrado'), true);
  // Y la agenda elige el cliente de la lista, y lo manda al reservar.
  const age = fs.readFileSync('src/components/PantallaAgenda.tsx', 'utf8');
  ok('la agenda elige el cliente de la lista', age.includes('<SelectorCliente'), true);
  ok('y lo manda al reservar', age.includes('p_cliente: d.cliente'), true);
  // El texto vive en el diccionario desde que la agenda habla portugués.
  ok('con textos de agenda y no de fiado',
    age.includes('placeholder={t.agenda.nombreQuienViene}')
      && fs.readFileSync('src/i18n/textos/es.ts', 'utf8').includes("nombreQuienViene: 'Nombre de quien viene'"), true);
  // Y se agenda hablando, en el micrófono de siempre: el dueño no quería uno
  // aparte adentro de la agenda.
  ok('la agenda levanta el turno dictado en la captura', age.includes('EVENTO_TURNO_DICTADO'), true);
  ok('y lo dictado completa el mismo formulario, no reserva solo', age.includes('aplicarDictado('), true);
  ok('sin un micrófono aparte adentro de la agenda', age.includes('useGrabacion'), false);
  ok('la captura manda los turnos a la agenda',
    fs.readFileSync('src/components/CapturaInteligente.tsx', 'utf8').includes('sessionStorage.setItem(CLAVE_TURNO_DICTADO'), true);
  ok('la voz agrega al catálogo',
    fs.readFileSync('src/components/RevisionProducto.tsx', 'utf8').includes(".from('productos')"), true);
  ok('y carga clientes',
    fs.readFileSync('src/components/RevisionCliente.tsx', 'utf8').includes("rpc('guardar_cliente'"), true);
  const cap = fs.readFileSync('src/app/api/capturar/route.ts', 'utf8');
  ok('el micrófono de siempre no carga un turno como venta de mañana',
    cap.includes("limpio.tipo === 'venta' && fechaValida > hoy"), true);

  // El panel lo pone al lado de las ventas. No lo resta: la venta existió.
  const pan = fs.readFileSync('src/app/(app)/panel/page.tsx', 'utf8');
  ok('el panel dice cuánto te deben',
    pan.includes('traerResumenFiado(') && pan.includes('href="/fiado"'), true);
  ok('y si esa lectura falla, el panel no se cae',
    pan.includes('traerResumenFiado(ctx.empresa.id).catch(() => null)'), true);
  ok('las páginas existen',
    [fs.existsSync('src/app/(app)/fiado/page.tsx'), fs.existsSync('src/app/(app)/clientes/page.tsx')],
    [true, true]);
}

// --- El panel de Orden no se le anuncia a un cliente ---
//
// El panel de administración se decidió no anunciarlo en ningún lado: «una
// puerta que anuncia que está cerrada invita a golpearla». Ahora hay un
// enlace en el menú, y eso solo es compatible con aquella regla si el enlace
// se dibuja ÚNICAMENTE para quien ya administra Orden.
//
// El permiso de verdad está en PostgreSQL —cada función del panel exige
// `es_superadmin()`—, así que esto no protege datos. Protege otra cosa: que
// un comerciante no vea en su menú una puerta que no es suya y se pregunte
// qué hay adentro.
{
  const nav = require('fs').readFileSync('src/components/Navegacion.tsx', 'utf8');

  // En los DOS menús, y esto se comprueba contando.
  //
  // La primera versión lo puso solo en la barra lateral, que es `lg:flex`:
  // en un celular esa barra no existe. Quien administra desde el teléfono
  // no tenía cómo llegar más que escribiendo la dirección a mano — y el
  // dueño de Orden usa el celular como todos los demás.
  ok('el enlace al panel está en los dos menús: lateral y celular',
    nav.split('href="/admin"').length - 1, 2);

  // Que exista el enlace no dice nada; lo que importa es que esté detrás de
  // la condición. Se busca el bloque entero, no las dos palabras sueltas.
  ok('y está detrás de administraOrden',
    nav.includes('{administraOrden && ('), true);

  // Y que la condición venga de afuera y no tenga un valor por defecto que
  // lo encienda: si el layout se olvidara de pasarla, no tiene que aparecer.
  ok('si no se lo pasan, no se muestra',
    nav.includes('administraOrden = false'), true);

  const layout = require('fs').readFileSync('src/app/(app)/layout.tsx', 'utf8');
  ok('y el layout se la pasa desde el contexto',
    layout.includes('administraOrden={ctx.administraOrden}'), true);

  // El contexto lo pregunta a la base, no lo deduce de nada local.
  const sesion = require('fs').readFileSync('src/lib/sesion.ts', 'utf8');
  ok('que lo pregunta a PostgreSQL', sesion.includes("rpc('es_superadmin')"), true);
  ok('y ante la duda dice que no', sesion.includes('esSuper === true'), true);
}

// --- Los días de prueba: la web y la base tienen que decir lo mismo ---
//
// El número vive en dos lados que no se hablan: `dias_de_prueba()` en la
// migración 049, que es la que escribe la fecha de vencimiento, y
// `DIAS_DE_PRUEBA` en src/lib/precios.ts, que es lo que leen la portada y
// los Términos del servicio.
//
// Si se separan, la web le promete a alguien una prueba que no va a tener, y
// eso no da error en ningún lado: da una página linda con un número falso y
// un reclamo dos semanas después. Por eso se comparan leyendo los archivos.
//
// Se lee el TEXTO y no se importa el módulo porque precios.ts arrastra el
// cliente de Supabase, que no compila suelto en este arnés.
{
  const fs = require('fs');

  // Vive en constantes.ts y no en precios.ts: precios.ts arrastra el cliente
  // de Supabase del servidor, y la pantalla de registro es de navegador. Al
  // importarlo desde ahí, el build se cayó entero.
  const ts = fs.readFileSync('src/lib/constantes.ts', 'utf8');
  const bloque = ts.slice(ts.indexOf('export const DIAS_DE_PRUEBA'));
  const delTs = {
    emprendedor: Number((bloque.match(/emprendedor:\s*(\d+)/) ?? [])[1]),
    personal: Number((bloque.match(/personal:\s*(\d+)/) ?? [])[1]),
  };

  const sql = fs.readFileSync('supabase/migrations/049_prueba_mas_corta.sql', 'utf8');
  const cuerpo = sql.slice(sql.indexOf('function public.dias_de_prueba'));
  const delSql = {
    emprendedor: Number((cuerpo.match(/else\s+(\d+)/) ?? [])[1]),
    personal: Number((cuerpo.match(/when 'personal' then\s+(\d+)/) ?? [])[1]),
  };

  // Antes de comparar, comprobar que se leyó algo. Una expresión que no
  // encuentra nada devuelve NaN, y NaN !== NaN haría fallar la prueba por el
  // motivo equivocado; peor sería que devolviera undefined en los dos lados
  // y pasara sin haber comprobado nada.
  ok('se leyó el número de precios.ts',
    Number.isInteger(delTs.emprendedor) && Number.isInteger(delTs.personal), true);
  ok('y el de la migración',
    Number.isInteger(delSql.emprendedor) && Number.isInteger(delSql.personal), true);

  ok('un negocio: la web dice lo mismo que la base', delTs.emprendedor, delSql.emprendedor);
  ok('una cuenta personal también', delTs.personal, delSql.personal);

  // Y los valores que se decidieron, para que bajarlos sea una decisión y no
  // un descuido.
  ok('un negocio prueba 8 días', delSql.emprendedor, 8);
  ok('una cuenta personal, 5', delSql.personal, 5);

  // Y QUE NO QUEDE NINGUNO ESCRITO A MANO EN NINGÚN LADO.
  //
  // La primera versión de esto miraba solo src/app/page.tsx, y por eso pasó
  // en verde mientras la pantalla de registro seguía prometiendo 20 y 14
  // días —era el primer lugar donde alguien lee el número, justo antes de
  // crear la cuenta—. Una prueba que revisa un archivo cuando el problema
  // puede estar en cualquiera da algo peor que ninguna prueba: da confianza.
  //
  // Ahora se recorre src/ entero.
  {
    const sospechosos = [];
    const mirar = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const ruta = dir + '/' + e.name;
        if (e.isDirectory()) { mirar(ruta); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        // El diccionario define la plantilla «N días de prueba»; ahí el
        // número es un hueco, no un valor.
        if (ruta.includes('/i18n/textos/')) continue;
        const texto = fs.readFileSync(ruta, 'utf8');
        // Un número pegado a «días» en un texto, o metido dentro de la
        // función que arma la frase.
        if (/\b\d+ d[ií]as de prueba\b/.test(texto)
            || /diasPrueba\(\s*\d/.test(texto)
            || /Probar \d+ d/.test(texto)
            || /Empezar los \d+ d/.test(texto)) {
          sospechosos.push(ruta.replace('src/', ''));
        }
      }
    };
    mirar('src');
    ok('ningún archivo escribe los días de prueba a mano', sospechosos, []);

    // Y que los dos lugares que lo muestran de verdad usen el módulo.
    // Desde que la portada habla portugués, el número sale de DIAS_DE_PRUEBA y
    // la palabra «días»/«dias» del diccionario.
    ok('la portada lo lee del módulo',
      fs.readFileSync('src/app/page.tsx', 'utf8').includes('DIAS_DE_PRUEBA.'), true);
    ok('y la pantalla de registro también',
      fs.readFileSync('src/components/DatosDelNegocio.tsx', 'utf8').includes('DIAS_DE_PRUEBA.'), true);
  }
}

// --- El panel de socios no calcula comisiones ---
//
// La comisión la crea la base cuando entra la plata (migración 060), y una
// sola vez por negocio. Si la pantalla también la calculara, un día los dos
// números no iban a coincidir y habría que adivinar cuál es el bueno.
//
// Lo que sí tiene que hacer la pantalla es dejar ajustar el monto: medio año
// cobrado de una vez es mucha plata para partirla con una fórmula. Desde la
// 070 se ajusta mientras está en el saldo, y se paga por retiros.
{
  const fs = require('fs');
  const soc = fs.readFileSync('src/components/PanelSocios.tsx', 'utf8');

  ok('el panel no multiplica por ningún porcentaje',
    /porcentaje\s*\/\s*100|\*\s*0\.5|\/\s*2\b/.test(soc), false);
  ok('los retiros se pagan por la ruta que avisa al socio', soc.includes("fetch('/api/admin/retiros'"), true);
  ok('y deja ajustar el monto de una comisión', soc.includes("rpc('ajustar_comision'") && soc.includes('p_monto:'), true);
  ok('los totales no suman comisiones que ya se retiraron',
    /porPagar: socios\.reduce/.test(soc) && /pagado: socios\.reduce/.test(soc), true);

  const rutaRetiros = fs.readFileSync('src/app/api/admin/retiros/route.ts', 'utf8');
  ok('pagar un retiro le avisa al socio', rutaRetiros.includes('pushPagadoTitulo') && rutaRetiros.includes('avisar('), true);
  ok('en el idioma del socio, no en el de quien paga', rutaRetiros.includes("select('idioma')"), true);
  ok('y el permiso lo decide la base con la sesión de quien llama',
    rutaRetiros.includes("supabase.rpc('marcar_retiro_pagado'") && rutaRetiros.includes("supabase.rpc('rechazar_retiro'"), true);

  const rutaCobrar = fs.readFileSync('src/app/api/socio/cobrar/route.ts', 'utf8');
  ok('el socio elige cuánto retirar', rutaCobrar.includes("rpc('solicitar_retiro'"), true);
  ok('y a la administración le llega el aviso', rutaCobrar.includes('usuarios_de_la_administracion'), true);
  ok('anular es otra acción, no un borrado', soc.includes("rpc('anular_comision'"), true);
  ok('crea socios por la función', soc.includes("rpc('guardar_socio'"), true);

  const pad = fs.readFileSync('src/components/PanelAdmin.tsx', 'utf8');
  // La primera vez que se cobró un referido de verdad, la comisión no nació y
  // la pantalla cerró como si nada. Que eso vuelva a pasar en silencio es lo
  // único que no se puede permitir en un programa de comisiones.
  ok('si la comisión no se genera, la ficha lo grita', pad.includes('faltoComision'), true);
  ok('y si se genera, también lo dice', pad.includes('Se generó la comisión de'), true);
  ok('la ficha del cliente anota quién lo trajo', pad.includes("rpc('asignar_referido'"), true);
  ok('y deja desanotarlo si fue un error', pad.includes("rpc('quitar_referido'"), true);
  ok('pero no ofrece quitarlo cuando ya se pagó',
    pad.includes("referido.comision !== 'pagada'"), true);

  const adm = fs.readFileSync('src/lib/admin.ts', 'utf8');
  ok('las tres lecturas del programa existen',
    ['listar_socios', 'listar_comisiones', 'listar_referidos'].every((f) => adm.includes(f)), true);
}

// --- El código de quien te trajo no se pierde en el camino (061) ---
//
// El socio comparte un enlace y quien entra por ahí casi nunca se registra en
// el acto: mira, se va, vuelve al otro día. El código tiene que sobrevivir a
// eso, y sobre todo tiene que sobrevivir al camino con confirmación por
// correo, que pasa por otra pantalla y es justo el que se olvida.
{
  const fs = require('fs');

  ok('el código del enlace se guarda apenas se pisa el sitio',
    fs.readFileSync('src/app/layout.tsx', 'utf8').includes('<CapturarRef />'), true);
  ok('se usa al crear la cuenta sin confirmación',
    fs.readFileSync('src/app/crear/page.tsx', 'utf8').includes('aplicarRef(supabase'), true);
  ok('y también cuando vuelve por el correo',
    fs.readFileSync('src/app/empezar/page.tsx', 'utf8').includes('aplicarRef(supabase'), true);

  // Si esto falla, un registro se cae por un programa de comisiones.
  const ref = fs.readFileSync('src/lib/referido.ts', 'utf8');
  ok('aplicar el código nunca puede romper un registro', /catch\s*{/.test(ref), true);
  ok('el enlace lo arma un solo lugar', ref.includes('export function enlaceDeSocio'), true);

  // Adivinar códigos ajenos de a uno no puede ser un juego público: el premio
  // por acertar es la comisión de otra persona.
  const campo = fs.readFileSync('src/components/CampoCodigoRef.tsx', 'utf8');
  ok('el campo del registro no consulta la base mientras escribe',
    campo.includes('.rpc('), false);

  const rec = fs.readFileSync('src/components/PantallaRecomendar.tsx', 'utf8');
  ok('el código se pide, no se reparte solo', rec.includes("rpc('mi_codigo_socio')"), true);
  ok('el socio dice dónde cobra', rec.includes("rpc('guardar_donde_cobro'"), true);
  ok('la pantalla no calcula comisiones', /porcentaje\s*\/\s*100|\*\s*0\.5/.test(rec), false);
  // La promesa vive en el diccionario desde que la pantalla habla portugués.
  ok('y dice que se cobra una sola vez',
    rec.includes('r.promesaUnaVez') && fs.readFileSync('src/i18n/textos/es.ts', 'utf8').includes('**una sola vez**'), true);
  // En los DOS menús. Estuvo solo en el del celular: en la computadora, que
  // es donde se trabaja sentado, la pantalla existía y no había cómo llegar.
  const nav = fs.readFileSync('src/components/Navegacion.tsx', 'utf8');
  // Y la tercera, la píldora «Ganá 50%» de la barra de arriba, siempre a la
  // vista como «Gana 50» en Wise.
  ok('hay cómo llegar desde el menú del celular, la barra lateral y la píldora de arriba',
    nav.split('href="/recomendar"').length - 1, 3);
  ok('la píldora de arriba dice cuánto se gana', nav.includes('{t.nav.ganar}'), true);
}

// --- Se pide en el momento, no en un menú (062) ---
//
// Lo que mata a un programa de referidos no es el abuso: es el silencio. Una
// pantalla que hay que ir a buscar da cero. Estas comprobaciones fijan los dos
// momentos y, sobre todo, que las reglas de CUÁNDO pedirlo no se copien en
// cada pantalla: viven en la base, o el día que se agregue un tercer lugar
// alguna se va a quedar afuera.
{
  const fs = require('fs');

  const cie = fs.readFileSync('src/app/(app)/cierre/page.tsx', 'utf8');
  ok('el cierre pregunta si es momento', cie.includes("rpc('momento_de_recomendar'"), true);
  ok('y solo lo ofrece con el día de hoy cerrado en verde',
    cie.includes('cierre.es_hoy && cierre.hubo_actividad && (quedo !== null ? quedo > 0 : entro > salio)'),
    true);
  ok('si esa lectura falla, el cierre no se cae', cie.includes('.catch(() => false)'), true);

  const pla = fs.readFileSync('src/app/(app)/plan/page.tsx', 'utf8');
  ok('y se vuelve a ofrecer al que acaba de pagar', pla.includes('<TarjetaRecomendar'), true);

  const tar = fs.readFileSync('src/components/TarjetaRecomendar.tsx', 'utf8');
  // No mira la base ni vuelve a preguntar: la pantalla ya decidió si la
  // dibuja. Lo único que hace la tarjeta es ofrecer y anotar la respuesta.
  ok('la tarjeta no decide cuándo aparecer',
    tar.includes('.from(') || tar.includes("rpc('momento_de_recomendar'"), false);
  ok('el «ahora no» se guarda por persona, no en el teléfono',
    tar.includes("rpc('posponer_recomendacion')") && !tar.includes('localStorage'), true);
  ok('aceptar es un solo toque: crea el código ahí mismo',
    tar.includes("rpc('mi_codigo_socio')"), true);

  const pan = fs.readFileSync('src/app/(app)/panel/page.tsx', 'utf8');
  ok('el panel avisa cuando a alguien le tocó plata',
    pan.includes("rpc('novedad_comisiones')") && pan.includes('<AvisoComision'), true);
  ok('y ese aviso tampoco puede tirar abajo el panel',
    pan.includes('.catch((): Novedad => ({ hay: false }))'), true);
  ok('el aviso se marca visto para no repetirse',
    fs.readFileSync('src/components/AvisoComision.tsx', 'utf8')
      .includes("rpc('marcar_comisiones_vistas')"), true);
}


// --- El modo oscuro vive en un solo lugar ---
//
// La app es de un comerciante que la abre a las once de la noche con la
// persiana baja. El modo oscuro se hizo dando vuelta la paleta en dos
// archivos —tailwind.config.ts y globals.css— y NO escribiendo `dark:` en
// cada pantalla: con cientos de clases repartidas, el que se olvide queda
// blanco brillante en la cara de alguien.
//
// Eso solo se sostiene si nadie vuelve a escribir un color fijo. Estas
// comprobaciones son la guardia de esa regla, no un detalle de estilo.
{
  const fs = require('fs');
  const path = require('path');

  const conf = fs.readFileSync('tailwind.config.ts', 'utf8');
  ok('los colores son variables, no hexadecimales', conf.includes('rgb(var(--'), true);
  ok('la tarjeta tiene su propio color', conf.includes('superficie:'), true);

  const css = fs.readFileSync('src/app/globals.css', 'utf8');
  ok('la paleta está definida dos veces', css.includes('html.oscuro'), true);
  ok('y el navegador se entera del tema', css.includes('color-scheme: dark'), true);

  // Sin esto la app abre en claro y salta a oscuro un instante después.
  const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
  ok('el tema se aplica antes de pintar', layout.includes('GUION_TEMA'), true);
  ok('y se puede elegir desde Ajustes',
    fs.readFileSync('src/app/(app)/ajustes/page.tsx', 'utf8').includes('<SelectorTema />'), true);

  // El blanco opaco es el que rompe el modo oscuro. Los translúcidos
  // (`bg-white/10` sobre un fondo oscuro) son correctos y se dejan.
  const culpables = [];
  const mirar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) { mirar(ruta); continue; }
      if (!/\.(tsx|ts|css)$/.test(e.name)) continue;
      const texto = fs.readFileSync(ruta, 'utf8');
      if (/(bg|border|divide)-white(?![\/0-9a-z-])/.test(texto)) {
        culpables.push(ruta.replace(/\\/g, '/'));
      }
    }
  };
  mirar('src');
  ok('ningún fondo blanco fijo: la tarjeta es «superficie»', culpables, []);
}

// --- Lo demás del cuaderno de esta vuelta ---
{
  const fs = require('fs');

  // El turno que se guardaba como gasto.
  const ruta = fs.readFileSync('src/app/api/capturar/route.ts', 'utf8');
  ok('un turno sin agenda no se guarda como gasto',
    ruta.includes("datos.tipo === 'turno' && !acciones.tipos.includes('turno')"), true);
  ok('y se contesta que acá no hay agenda', ruta.includes("no_disponible: 'agenda'"), true);
  ok('la captura lo muestra en vez de guardarlo',
    fs.readFileSync('src/components/CapturaInteligente.tsx', 'utf8').includes('datos?.no_disponible'), true);

  // La barra del panel de administración pisaba el reloj del teléfono.
  ok('el panel de Orden respeta el notch',
    fs.readFileSync('src/app/admin/page.tsx', 'utf8').includes('zona-segura-arriba'), true);

  // Ver los datos de un socio no puede obligar a entrar a «editar».
  const soc = fs.readFileSync('src/components/PanelSocios.tsx', 'utf8');
  ok('el socio tiene ficha propia', soc.includes('function FichaSocio'), true);
  ok('con sus datos para transferirle', soc.includes('Para transferirle'), true);
  ok('y cada dato se copia sin transcribirlo', soc.includes('function Copiar'), true);

  // Los datos de cobro, separados como en cualquier formulario de banco.
  const rec = fs.readFileSync('src/components/PantallaRecomendar.tsx', 'utf8');
  ok('el socio carga banco, titular, cuenta y documento',
    ['p_banco', 'p_titular', 'p_cuenta', 'p_documento'].every((c) => rec.includes(c)), true);
}

// --- Las hojas de adelante no arrastran lo de atrás ---
//
// Deslizar adentro del menú «Más» movía también la página de abajo: se salía
// del menú, o uno volvía y el panel había quedado en otro lado sin haberlo
// tocado. Se sentía como que la pantalla se resbala.
//
// Y el botón «Más» se prendía por estar abierto, así que en el panel quedaban
// dos luces al mismo tiempo. Una barra donde se prenden dos cosas ya no dice
// dónde estás, que es lo único que tiene que decir.
{
  const fs = require('fs');
  const nav = fs.readFileSync('src/components/Navegacion.tsx', 'utf8');
  const cap = fs.readFileSync('src/components/CapturaInteligente.tsx', 'utf8');

  ok('el menú no deja mover el fondo', nav.includes('useBloquearFondo(abierto)'), true);
  ok('la captura tampoco', cap.includes('useBloquearFondo('), true);
  // Fijar el body es lo que levantaba la barra de abajo y dejaba una franja
  // vacía debajo: la página sale del flujo y lo que estaba pegado al borde
  // queda colgado en el aire. No se vuelve a ese camino.
  const fondo = fs.readFileSync('src/lib/fondo.ts', 'utf8');
  ok('el bloqueo no mueve nada de lugar', fondo.includes("position = 'fixed'"), false);
  ok('y corta el gesto, que es lo único que el iPhone respeta',
    fondo.includes("addEventListener('touchmove'") && fondo.includes('passive: false'), true);
  // Lo que faltaba la segunda vez: con los cuadros ya contra su borde, el
  // gesto pasaba, iOS se lo daba a la pantalla y cuadros y barra rebotaban
  // juntos como una sola cosa.
  ok('mira si lo de adelante ya llegó a su borde', fondo.includes('enElTope') && fondo.includes('enElFondo'), true);
  ok('y le saca el rebote a la pantalla', fondo.includes("overscrollBehavior = 'none'"), true);
  // Y desde CSS, que en el iPhone llega antes que el JavaScript.
  ok('el velo del menú no deja arrastrar', nav.includes('flex touch-none items-center'), true);
  ok('solo los cuadros se desplazan', nav.includes('touch-pan-y grid-cols-3'), true);
  ok('la barra de abajo nunca arrastra la pantalla', nav.includes('bottom-0 z-50 touch-none'), true);
  ok('y la captura igual', cap.includes('flex touch-none items-center') && cap.includes('touch-pan-y overflow-y-auto'), true);

  ok('el menú flota centrado, por encima de todo',
    nav.includes('fixed inset-0 z-[60] flex touch-none items-center justify-center'), true);
  // La solución que eligió el dueño a la barra que «se levantaba»: mientras
  // el menú está abierto la barra no está, y se sale con la X. Lo que no
  // está, no se puede mover.
  ok('con el menú abierto la barra de abajo desaparece', nav.includes("${abierto ? 'hidden' : ''}"), true);
  ok('y se sale con una X', nav.includes('aria-label={t.comun.cerrar}'), true);
  ok('el bloqueo no le toca el overflow a la raíz', fondo.includes("raiz.style.overflow = 'hidden'"), false);
  ok('la captura también', cap.includes('items-center justify-center overscroll-none bg-noche/70'), true);

  // Una sola luz, y es donde estás AHORA: con el menú abierto estás en el
  // menú, no en el panel de atrás.
  ok('con el menú abierto se apaga la sección de atrás',
    nav.includes('activo(ruta, i.href) && !abierto'), true);
  ok('y se prende «Más», que es donde estás',
    nav.includes('abierto || enOtraSeccion'), true);
  ok('los cuadritos flotan: sin tarjeta detrás',
    nav.includes('flex max-h-full w-full max-w-sm flex-col aparecer'), true);
  ok('y la captura también', cap.includes("? 'p-1'"), true);
}

// --- La portada cuenta lo de recomendar, y deja elegir los colores ---
//
// El programa de socios no sirve de nada si la gente se entera adentro: el
// que lo va a compartir todavía no entró. Y la aclaración va CON los precios,
// porque es donde alguien está haciendo la cuenta de cuánto le sale.
{
  const fs = require('fs');
  const portada = fs.readFileSync('src/app/page.tsx', 'utf8');
  // Los textos de la portada viven en el diccionario desde que habla
  // portugués: la estructura se mira en page.tsx y las frases en es.ts.
  const textosPortada = fs.readFileSync('src/i18n/textos/es.ts', 'utf8');

  ok('la portada tiene el sol y la luna', portada.includes('<BotonTema />'), true);
  ok('y cuenta cómo se gana recomendando', portada.includes('id="recomendar"'), true);
  ok('con los tres pasos', portada.split('<Paso').length - 1, 3);
  ok('diciendo que se cobra una sola vez y no todos los meses',
    textosPortada.includes('Una sola vez por cada cuenta'), true);
  ok('se aclara que también vale una persona, no solo un negocio',
    textosPortada.includes('las dos cuentas valen igual'), true);
  ok('los precios aclaran que está en todos los planes',
    textosPortada.includes('Las invitaciones están en todos los planes'), true);
  // Desde el candado del 2026-09-15 una cuenta vencida no entra. La portada
  // lo prometía al revés; se mira el texto que se muestra, no el comentario.
  const lineaPrecios = textosPortada.split(/\r?\n/).find((l) => l.trim().startsWith('preciosBajada:')) ?? '';
  ok('la portada ya no promete que se sigue entrando con la cuenta vencida',
    /seguís entrando|bajando tu Excel/.test(lineaPrecios), false);
  ok('y dice que los datos no se borran', lineaPrecios.includes('no se borran'), true);
  ok('y la pantalla de planes de adentro también lleva ahí',
    fs.readFileSync('src/app/(app)/plan/page.tsx', 'utf8').includes('href="/recomendar"'), true);

  // Dos íconos, no tres: «como el teléfono» es una preferencia y vive en
  // Ajustes. Acá se elige a propósito.
  const boton = fs.readFileSync('src/components/BotonTema.tsx', 'utf8');
  ok('el botón de la portada no ofrece «como el sistema»',
    boton.includes("elegir('sistema')"), false);
}

// --- Cómo instalar Orden (agregar a la pantalla de inicio) ---
//
// En iPhone, los avisos push NO FUNCIONAN sin este paso — es una regla de
// Apple, no de Orden. Antes había una sola frase suelta y nadie sabía qué
// hacer con ella. Ahora hay una guía con pasos, en dos lugares que comparten
// el mismo componente para no desactualizarse por separado.
{
  const fs = require('fs');

  ok('existe la página pública, compartible por enlace',
    fs.existsSync('src/app/instalar/page.tsx'), true);

  const guia = fs.readFileSync('src/components/GuiaInstalar.tsx', 'utf8');
  ok('la guía distingue iPhone de Android', guia.includes("'iphone' | 'android'"), true);
  ok('y dice el paso que más se salta: abrirla desde el ícono nuevo',
    fs.readFileSync('src/i18n/textos/es.ts', 'utf8').includes('no desde Safari'), true);
  ok('en portugués también',
    fs.readFileSync('src/i18n/textos/pt.ts', 'utf8').includes('não pelo Safari'), true);

  const pub = fs.readFileSync('src/app/instalar/page.tsx', 'utf8');
  ok('la página pública usa el mismo componente que Ajustes',
    pub.includes('<GuiaInstalar'), true);
  // Era estática; pasó a dinámica para salir en el idioma de quien la abre.
  // Lo que importa de verdad es que no pida sesión.
  ok('no exige haber iniciado sesión',
    !pub.includes('contextoObligatorio') && !pub.includes('getUser') && !pub.includes('redirect('), true);

  const prefs = fs.readFileSync('src/components/Preferencias.tsx', 'utf8');
  ok('en Ajustes, la guía aparece en el momento exacto en que hace falta',
    prefs.includes('esIphoneSinInstalar() && (') && prefs.includes('<GuiaInstalar compacta'), true);
  ok('y desde ahí se puede compartir el enlace suelto',
    prefs.includes('href="/instalar"'), true);

  // La primera vez que se probó, el enlace a la guía mandaba al login: la
  // página no estaba en la lista de públicas del middleware. Un enlace para
  // compartir que pide sesión no sirve para nada.
  ok('la guía se abre sin haber iniciado sesión',
    fs.readFileSync('src/middleware.ts', 'utf8').includes("'/instalar'"), true);
  // En los iOS nuevos Safari esconde «Compartir» adentro de «···».
  ok('la guía de iPhone contempla Compartir escondido en los tres puntos',
    // Los pasos viven en el diccionario desde que la guía habla portugués.
    fs.readFileSync('src/i18n/textos/es.ts', 'utf8').includes('tres puntos «···»'), true);
  // Primero quedó como un enlace chiquito en el pie, a otra página, y el
  // dueño no la encontró. Tiene que ser una sección visible de la portada,
  // con la guía adentro y un acceso arriba.
  const portadaInst = fs.readFileSync('src/app/page.tsx', 'utf8');
  ok('la portada tiene la sección de instalar, con la guía adentro',
    portadaInst.includes('id="instalar"') && portadaInst.includes('<GuiaInstalar />'), true);
  ok('y un acceso arriba, al lado de Precios', portadaInst.includes('href="#instalar"'), true);
  ok('la web de presentación enlaza la guía',
    portadaInst.includes('href="/instalar"'), true);
}

// --- Lo que le dice Orden a cada uno, todos los días (071) ---
//
// La base da los números; esta función elige la frase. Lo que se prueba acá
// son las reglas: a la tarde solo a quien no cargó, a la noche solo a quien
// cargó, y el porcentaje contra ayer solo si ayer hubo ventas.
{
  const fs = require('fs');
  const { fraseDelDia, comparacionConAyer } = require('../.compilado/frases-del-dia.js');
  const tx = {
    manana: {
      negocioConVentas: (v, g) => `V:${v} G:${g}`,
      negocioConPerdida: (v, p) => `V:${v} P:${p}`,
      negocioSoloGastos: (g) => `SG:${g}`,
      negocioNada: 'NADA',
      personalConGastos: (g) => `PG:${g}`,
      personalSoloIngresos: (i) => `PI:${i}`,
      personalNada: 'PNADA',
    },
    tarde: { negocio: 'TN', personal: 'TP' },
    noche: {
      titulo: (n) => `Día en ${n}`,
      negocio: (v, c, g, gan) => `V:${v}${c} G:${g} GAN:${gan}`,
      negocioConPerdida: (v, c, g, p) => `V:${v}${c} G:${g} P:${p}`,
      negocioSinVentas: (g) => `SV:${g}`,
      personal: (i, g) => `I:${i} G:${g}`,
      personalSoloGastos: (g) => `G:${g}`,
      personalSoloIngresos: (i) => `I:${i}`,
      masQueAyer: (p) => ` +${p}%`,
      menosQueAyer: (p) => ` -${p}%`,
      igualQueAyer: ' =',
    },
  };
  const dia = (o = {}) => ({ ventas: 0, ingresos: 0, gastos: 0, ganancia: 0, cargados: 0, ...o });
  const cuenta = (hoy, ayer, tipo = 'emprendedor') => ({ nombre: 'Kiosco', moneda: 'PYG', tipo_cuenta: tipo, hoy: dia(hoy), ayer: dia(ayer) });
  const gs = (n) => dinero(n, 'PYG', true, 'es-PY');

  ok('mañana: ayer vendió y ganó',
    fraseDelDia('manana', cuenta({}, { ventas: 200000, ganancia: 90000, cargados: 3 }), tx, 'es-PY').cuerpo,
    `V:${gs(200000)} G:${gs(90000)}`);
  ok('mañana: ayer vendió pero perdió, se dice en positivo cuánto',
    fraseDelDia('manana', cuenta({}, { ventas: 50000, ganancia: -30000, cargados: 2 }), tx, 'es-PY').cuerpo,
    `V:${gs(50000)} P:${gs(30000)}`);
  ok('mañana: ayer no cargó nada, igual hay un empujón',
    fraseDelDia('manana', cuenta({}, {}), tx, 'es-PY').cuerpo, 'NADA');
  ok('mañana: el título es el nombre de la cuenta',
    fraseDelDia('manana', cuenta({}, {}), tx, 'es-PY').titulo, 'Kiosco');
  ok('mañana, cuenta personal: habla de gastos, no de ventas',
    fraseDelDia('manana', cuenta({}, { gastos: 40000, cargados: 1 }, 'personal'), tx, 'es-PY').cuerpo, `PG:${gs(40000)}`);

  ok('tarde: a quien ya cargó no se le escribe',
    fraseDelDia('tarde', cuenta({ cargados: 1 }, {}), tx, 'es-PY'), null);
  ok('tarde: a quien no cargó, sí',
    fraseDelDia('tarde', cuenta({}, {}), tx, 'es-PY').cuerpo, 'TN');
  ok('tarde, cuenta personal: su propia frase',
    fraseDelDia('tarde', cuenta({}, {}, 'personal'), tx, 'es-PY').cuerpo, 'TP');

  ok('noche: un día vacío no tiene resumen',
    fraseDelDia('noche', cuenta({}, {}), tx, 'es-PY'), null);
  ok('noche: vendió más que ayer, con el porcentaje',
    fraseDelDia('noche', cuenta({ ventas: 110000, gastos: 10000, ganancia: 60000, cargados: 4 }, { ventas: 100000 }), tx, 'es-PY').cuerpo,
    `V:${gs(110000)} +10% G:${gs(10000)} GAN:${gs(60000)}`);
  ok('noche: sin ventas ayer no hay porcentaje contra cero',
    comparacionConAyer(110000, 0, tx.noche), '');
  ok('noche: menos que ayer', comparacionConAyer(98000, 100000, tx.noche), ' -2%');
  ok('noche: igual que ayer', comparacionConAyer(100000, 100000, tx.noche), ' =');
  ok('noche: el título dice de qué cuenta es',
    fraseDelDia('noche', cuenta({ ventas: 1, ganancia: 1, cargados: 1 }, {}), tx, 'es-PY').titulo, 'Día en Kiosco');
  ok('noche: solo gastos',
    fraseDelDia('noche', cuenta({ gastos: 5000, ganancia: -5000, cargados: 1 }, {}), tx, 'es-PY').cuerpo, `SV:${gs(5000)}`);
  ok('noche, cuenta personal: entró y gastó',
    fraseDelDia('noche', cuenta({ ingresos: 300000, gastos: 50000, cargados: 2 }, {}, 'personal'), tx, 'es-PY').cuerpo,
    `I:${gs(300000)} G:${gs(50000)}`);

  // Las tres corridas existen y cada una a su hora (Hobby: una vez por día cada una).
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rutas = vercel.crons.map((c) => c.path);
  ok('las tres corridas del día están programadas',
    ['manana', 'tarde', 'noche'].every((m) => rutas.includes(`/api/tareas/avisos-${m}`)), true);
  ok('y ninguna corre más de una vez por día',
    vercel.crons.every((c) => /^\d+ \d+ \* \* [\d*]$/.test(c.schedule)), true);

  const es = fs.readFileSync('src/i18n/textos/es.ts', 'utf8');
  ok('las frases están en el diccionario, no en la ruta', es.includes('  notificaciones: {'), true);
  const ruta = fs.readFileSync('src/lib/avisos-diarios.ts', 'utf8');
  ok('una vez por persona, momento y día', ruta.includes("rpc('reservar_envio'") && ruta.includes('cuenta.fecha'), true);
  ok('y en el idioma de cada uno', ruta.includes('diccionario(idioma)'), true);

  const empezar = fs.readFileSync('src/app/empezar/page.tsx', 'utf8');
  const crear = fs.readFileSync('src/app/crear/page.tsx', 'utf8');
  ok('las dos puertas de registro avisan la cuenta nueva',
    empezar.includes('avisarCuentaNueva(') && crear.includes('avisarCuentaNueva('), true);
  ok('activar un plan avisa al cliente', fs.readFileSync('src/components/PanelAdmin.tsx', 'utf8').includes('avisarActivacion('), true);
}

console.log(fallos === 0 ? '\n>>> TODAS LAS PRUEBAS PASARON' : `\n>>> ${fallos} FALLAS`);
process.exit(fallos ? 1 : 0);
