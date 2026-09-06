const { resumir, rankingProductos, gastosPorCategoria, serieDiaria, variacion, factorDescuento, esValido, tieneCostos, logradoEnReto } = require('../.compilado/calculos.js');
const { resolverRango, rangoAnterior, diasDelRango, inicioDeSemana, sumarDias, diffDias, finDeMes } = require('../.compilado/fechas.js');
const { dinero, dineroCorto, fechaLegible, decimalesDe } = require('../.compilado/formato.js');
const { fichaDe, tieneSeccion, palabra, LISTA_RUBROS } = require('../.compilado/rubros.js');

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
  const desde = nav.indexOf("<nav className=\"zona-segura-abajo");
  const barra = nav.slice(desde, desde + 900);
  // Se miran solo las CLASES y no el texto crudo: el comentario que explica
  // este arreglo nombra el problema viejo, y buscarlo a secas lo encontraría
  // ahí y daría por rota una barra que está bien.
  const clases = (barra.match(/className="[^"]*"/g) ?? []).join(' ');
  ok('las columnas de la barra no están escritas a mano',
    /grid-cols-\d/.test(clases), false);
  ok('se calculan a partir de los botones que hay',
    barra.includes('gridTemplateColumns'), true);
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
ok('a una peluquería, Servicios',
  palabra('servicios', 'emprendedor', 'productos', 'Productos', 'es'), 'Servicios');
ok('y a un almacén no se le cambia nada',
  palabra('comercio', 'emprendedor', 'productos', 'Productos', 'es'), 'Productos');
ok('la peluquería cobra, no vende',
  palabra('servicios', 'emprendedor', 'vender', 'Vender', 'es'), 'Cobrar');

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

console.log(fallos === 0 ? '\n>>> TODAS LAS PRUEBAS PASARON' : `\n>>> ${fallos} FALLAS`);
process.exit(fallos ? 1 : 0);
