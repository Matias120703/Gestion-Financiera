const { resumir, rankingProductos, gastosPorCategoria, serieDiaria, variacion, factorDescuento, esValido, tieneCostos, logradoEnReto } = require('../.compilado/calculos.js');
const { resolverRango, rangoAnterior, diasDelRango, inicioDeSemana, sumarDias, diffDias, finDeMes } = require('../.compilado/fechas.js');
const { dinero, dineroCorto, fechaLegible, decimalesDe } = require('../.compilado/formato.js');
const { fichaDe, tieneSeccion, palabra, rubroVisible, LISTA_RUBROS } = require('../.compilado/rubros.js');

let fallos = 0;
/** Comprobaciones que esperan algo; el resumen del final las espera. */
const pendientes = [];
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
  // Sin catálogo en agricultura (100): el grano se vende por la liquidación,
  // dentro de la campaña, y la feria vende con «producto suelto».
  '/productos':    [ true,     true,      true,      false,       false ],
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
  // Las rutinas son solo del personal trainer (098), que no es columna de
  // esta tabla: ninguno de estos cinco las tiene. El trainer se prueba aparte.
  '/rutinas':     [ false,    false,     false,     false,       false ],
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
    // El agricultor tiene barra propia (100): se mide con la de su ficha.
    ['agricultura dueño',  'agricultura', 'emprendedor', fichaDe('agricultura', 'emprendedor').barra],
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
// Agricultura se ofrece desde el 23/09 (decisión de Matías), entre el
// trainer y la ganadería. La prueba con un productor real sigue pendiente;
// eso no se comprueba acá, pero que el rubro esté en la lista sí.
ok('la lista que se ofrece al registrarse',
  LISTA_RUBROS.map((r) => r.clave),
  ['comercio', 'servicios', 'clases', 'entrenamiento', 'agricultura', 'ganaderia']);
ok('agricultura se ofrece al crear una cuenta',
  LISTA_RUBROS.some((r) => r.clave === 'agricultura'), true);
ok('con su nombre en los dos idiomas',
  [rubroVisible(LISTA_RUBROS.find((r) => r.clave === 'agricultura'), 'es').nombre,
    rubroVisible(LISTA_RUBROS.find((r) => r.clave === 'agricultura'), 'pt').nombre.length > 0],
  ['Agricultura', true]);
// La ayuda de la moneda del negocio, solo para el agricultor. Es la moneda
// de SUS DATOS (empresas.moneda), no la de la suscripción, que se cobra
// siempre en guaraníes.
{
  const form = require('fs').readFileSync('src/components/DatosDelNegocio.tsx', 'utf8');
  ok('el alta le explica al agricultor qué moneda elegir',
    /datos\.rubro === 'agricultura'[\s\S]{0,200}t\.registro\.monedaAgricultura/.test(form), true);
  ok('y solo si no es una cuenta personal', /!esPersonal && datos\.rubro === 'agricultura'/.test(form), true);
}

// Clases y cursos (087) estuvo fuera del alta mientras se rehacía (090).
// Vuelve a la lista a pedido de Matías (22/09): un profe tiene que poder
// crear su cuenta.
ok('clases y cursos se ofrece al crear una cuenta',
  LISTA_RUBROS.some((r) => r.clave === 'clases'), true);
ok('con la agenda prendida, que es donde vive cada clase',
  fichaDe('clases', 'emprendedor').secciones['/agenda'], true);
ok('y sin lotes, que ahí no significan nada',
  fichaDe('clases', 'emprendedor').secciones['/lotes'], false);
// Un profe no dice «tengo doce clientes».
ok('a sus clientes les dice alumnos',
  palabra('clases', 'emprendedor', 'clientes', 'Clientes', 'es'), 'Alumnos');
ok('y en portugués también',
  palabra('clases', 'emprendedor', 'clientes', 'Clientes', 'pt'), 'Alunos');
// Un profe no tiene caja que contar a la noche (090).
ok('un profe no cierra el día',
  fichaDe('clases', 'emprendedor').cierraElDia, false);
// Pero una cuenta personal nunca cierra el día, sea cual sea su rubro.
ok('salvo que sea una cuenta personal',
  fichaDe('clases', 'personal').cierraElDia, false);

// Los paquetes (088), solo donde se vende así. A una barbería o a un
// almacén, «vender un paquete de clases» en la ficha del cliente sería ruido
// que confunde. Si algún día otro rubro los necesita, esta lista cambia a
// propósito y no por un interruptor olvidado.
ok('los paquetes están solo en clases y en el trainer',
  ['comercio', 'servicios', 'clases', 'entrenamiento', 'ganaderia', 'agricultura']
    .filter((r) => fichaDe(r, 'emprendedor').paquetes),
  ['clases', 'entrenamiento']);
ok('y nunca en una cuenta personal',
  fichaDe('clases', 'personal').paquetes, false);

// Un profe da sus clases solo (089): lo que cobra es todo suyo, así que no
// hay «Equipo y reparto» que mostrarle. La barbería sí lo conserva.
ok('un profe no tiene equipo ni reparto',
  fichaDe('clases', 'emprendedor').secciones['/reparto'], false);
ok('la barbería lo conserva',
  fichaDe('servicios', 'emprendedor').secciones['/reparto'], true);
// UN PROFE NO COMPRA NI VENDE NADA (090). Matías: «¿cómo vas a comprar y
// vender un curso?». Se van el catálogo con su stock, la pantalla de
// cobrar y el cierre; queda lo que un profe mira.
{
  const s = fichaDe('clases', 'emprendedor').secciones;
  ok('sin catálogo ni stock', s['/productos'], false);
  ok('sin pantalla de cobrar', s['/vender'], false);
  ok('sin cierre del día', s['/cierre'], false);
  ok('con su agenda, sus alumnos, lo que entra y lo que sale',
    [s['/agenda'], s['/clientes'], s['/gastos'], s['/billetera']], [true, true, true, true]);
  // Sin fiado (091): lo que le deben son inscripciones sin cobrar, arriba de
  // sus alumnos. Una venta fiada contaría como cobrado lo que no entró.
  ok('sin fiado: lo que le deben vive en sus alumnos', s['/fiado'], false);
  // Y la barbería no se entera de nada de esto.
  const b = fichaDe('servicios', 'emprendedor').secciones;
  ok('la barbería conserva todo lo suyo',
    [b['/productos'], b['/vender'], b['/cierre']], [true, true, true]);
}
ok('la agenda de a uno es solo del profe y del trainer',
  ['comercio', 'servicios', 'clases', 'entrenamiento', 'ganaderia', 'agricultura']
    .filter((r) => fichaDe(r, 'emprendedor').agendaDeAlumnos),
  ['clases', 'entrenamiento']);

// --- El personal trainer (097) ---
//
// Usa el motor del profe tal cual, con sus palabras. Lo que se comprueba:
// que tenga exactamente las mismas pantallas que el profe, que hable como
// un trainer, y que sea el único con las lesiones a la vista.
// Matías lo pidió en la lista del alta para probarlo como cualquiera (22/09).
ok('el trainer se ofrece al crear una cuenta',
  LISTA_RUBROS.some((r) => r.clave === 'entrenamiento'), true);
// Las mismas pantallas que el profe, más las rutinas (098).
ok('tiene las pantallas del profe, más las rutinas',
  JSON.stringify({ ...fichaDe('entrenamiento', 'emprendedor').secciones, '/rutinas': false }),
  JSON.stringify(fichaDe('clases', 'emprendedor').secciones));
ok('las rutinas son solo del trainer',
  ['comercio', 'servicios', 'clases', 'entrenamiento', 'ganaderia', 'agricultura']
    .filter((r) => fichaDe(r, 'emprendedor').secciones['/rutinas']),
  ['entrenamiento']);
ok('y nunca en una cuenta personal', fichaDe('entrenamiento', 'personal').secciones['/rutinas'], false);

// La barra de abajo (22/09). Matías: «en la barra de abajo tendría que
// aparecer agendas y alumnos». Al trainer, además, sus rutinas.
ok('la barra del trainer: panel, agenda, rutinas y clientes',
  fichaDe('entrenamiento', 'emprendedor').barra, ['/panel', '/agenda', '/rutinas', '/clientes']);
ok('la del profe: panel, agenda, alumnos y gastos',
  fichaDe('clases', 'emprendedor').barra, ['/panel', '/agenda', '/clientes', '/gastos']);
ok('los demás rubros siguen con la de siempre',
  ['comercio', 'servicios', 'ganaderia'].map((r) => fichaDe(r, 'emprendedor').barra), [null, null, null]);
// Al agricultor (100): mirar cómo va, la campaña (la cosecha y la liquidación
// viven ahí), cargar un gasto, y vender para el que va a la feria.
ok('la del agricultor: panel, campañas, gastos y vender',
  fichaDe('agricultura', 'emprendedor').barra, ['/panel', '/lotes', '/gastos', '/vender']);
ok('y cada sección de una barra propia existe en su rubro',
  ['clases', 'entrenamiento', 'agricultura'].every((r) => fichaDe(r, 'emprendedor').barra.every((h) => fichaDe(r, 'emprendedor').secciones[h])), true);
{
  const nav = require('fs').readFileSync('src/components/Navegacion.tsx', 'utf8');
  ok('la barra de abajo usa la del rubro', nav.includes('ficha.barra'), true);
  ok('y el menú tiene las rutinas', nav.includes("href: '/rutinas'"), true);
}
ok('a los suyos les dice clientes, no alumnos',
  palabra('entrenamiento', 'emprendedor', 'clientes', 'Clientes', 'es'), 'Clientes');
ok('y a lo que entra, cobrado',
  palabra('entrenamiento', 'emprendedor', 'ventas', 'Ventas', 'es'), 'Cobrado');
ok('no cierra el día', fichaDe('entrenamiento', 'emprendedor').cierraElDia, false);
ok('se llama igual en portugués',
  rubroVisible(fichaDe('entrenamiento', 'emprendedor'), 'pt').nombre, 'Personal trainer');
ok('el trainer y el agricultor hablan con su propia jerga (097, 100)',
  ['comercio', 'servicios', 'clases', 'entrenamiento', 'ganaderia', 'agricultura']
    .filter((r) => fichaDe(r, 'emprendedor').jerga !== null),
  ['entrenamiento', 'agricultura']);
ok('y solo el trainer tiene las notas pegadas a cada sesión',
  ['comercio', 'servicios', 'clases', 'entrenamiento', 'ganaderia', 'agricultura']
    .filter((r) => fichaDe(r, 'emprendedor').notasALaVista),
  ['entrenamiento']);
ok('una cuenta personal no tiene jerga', fichaDe('entrenamiento', 'personal').jerga, null);
{
  // Las palabras llegan solas a cada pantalla: si alguien saca la fusión
  // del hook o el proveedor del layout, el trainer vuelve a leer «clase».
  const leer = (r) => require('fs').readFileSync(r, 'utf8');
  const cli = leer('src/i18n/cliente.tsx');
  ok('los textos del navegador traen la jerga', /useTextos[\s\S]*conJerga\(/.test(cli), true);
  ok('el layout la reparte a todas las pantallas', leer('src/app/(app)/layout.tsx').includes('<ProveedorJerga jerga='), true);
  ok('y el panel, que se arma en el servidor, también', leer('src/app/(app)/panel/page.tsx').includes('conJerga(await textos()'), true);
  const jer = leer('src/i18n/textos/entrenamiento.ts');
  ok('el trainer da sesiones, no clases', jer.includes("claseDada: 'Sesión dada'") && jer.includes("claseDada: 'Sessão dada'"), true);
  ok('y sus notas son de salud', jer.includes("notas: 'Salud y lesiones'"), true);
  ok('agendar pide la salud de alguien nuevo', leer('src/components/PantallaAgenda.tsx').includes('pedirSalud={notasALaVista}'), true);

  // El agricultor (100): usa los lotes del ganadero, pero dice «campaña» y
  // «a cosecha». La jerga tiene que estar registrada, o el menú le sigue
  // diciendo «Lotes».
  const agri = leer('src/i18n/textos/agricultura.ts');
  ok('la jerga del agricultor está registrada', /agricultura: \{ es: agriculturaEs, pt: agriculturaPt \}/.test(leer('src/i18n/jergas.ts')), true);
  ok('el menú le dice Campañas / Safras', agri.includes("lotes: 'Campañas'") && agri.includes("lotes: 'Safras'"), true);
  ok('abre una campaña, no un lote', agri.includes("nuevo: 'Abrir una campaña'") && agri.includes("nuevo: 'Abrir uma safra'"), true);
  ok('y lo que debe es a cosecha / na colheita', agri.includes("aCosecha: 'A cosecha'") && agri.includes("aCosecha: 'Na colheita'"), true);
  // El diccionario neutro no dice «campaña»: eso es de la jerga.
  const neutro = leer('src/i18n/textos/campanas.ts');
  ok('el diccionario neutro habla de lote y ciclo', neutro.includes("titulo: 'Abrir un lote'") && neutro.includes("campana: 'Ciclo'"), true);
  ok('y está enchufado en es.ts y pt.ts',
    leer('src/i18n/textos/es.ts').includes('campanas: campanasEs,') && leer('src/i18n/textos/pt.ts').includes('campanas: campanasPt,')
    && leer('src/i18n/textos/es.ts').includes('gastosCampana: gastosCampanaEs,') && leer('src/i18n/textos/pt.ts').includes('panelCampo: panelCampoPt,'), true);
}

// --- Las rutinas del trainer, dentro de lo que ya usa (098) ---
//
// La agenda y el panel muestran la rutina de cada sesión y «Ver» la abre
// para cambiar la carga ahí mismo; la ficha de Clientes lleva a su carpeta;
// agendar a alguien nuevo ofrece medirlo y armarle la rutina; y el candado
// de la cuenta vencida deja apagar los links. Se leen las fuentes: si alguien
// saca una pieza, esto lo dice antes que un trainer.
{
  const fs = require('fs');
  const leer = (r) => fs.readFileSync(r, 'utf8');
  const hoja = leer('src/components/rutinas/HojaRutinaSesion.tsx');
  const age = leer('src/components/PantallaAgenda.tsx');
  const agePag = leer('src/app/(app)/agenda/page.tsx');
  const agLib = leer('src/lib/agenda.ts');
  const pan = leer('src/app/(app)/panel/page.tsx');
  const panProfe = leer('src/components/PanelProfe.tsx');
  const cli = leer('src/components/PantallaClientes.tsx');
  const cliPag = leer('src/app/(app)/clientes/page.tsx');
  const ins = leer('src/components/InscribirAlumno.tsx');
  const can = leer('src/components/CandadoCuenta.tsx');
  const lay = leer('src/app/(app)/layout.tsx');

  // La agenda y el panel.
  ok('la agenda del día pide la rutina de cada sesión',
    agLib.includes("rpc('rutinas_de_la_agenda'") && agePag.includes('traerRutinasDeLaAgenda('), true);
  ok('solo en la cuenta del trainer', /conRutinas = ficha\.secciones\['\/rutinas'\]/.test(agePag), true);
  ok('y si falla, la agenda sale igual', /traerRutinasDeLaAgenda\([^)]*\)\.catch\(/.test(agePag), true);
  ok('la sesión muestra su rutina, cruzada por id de reserva',
    age.includes('<RutinaDeLaSesion') && age.includes('rutinas[r.id].rutina_id'), true);
  ok('«Tus sesiones de hoy» del panel también',
    pan.includes("fichaProfe.secciones['/rutinas']") && /traerRutinasDeLaAgenda\([^)]*\)\.catch\(/.test(pan)
      && panProfe.includes('<RutinaDeLaSesion') && panProfe.includes('rutinas[c.id].rutina_id'), true);

  // La hoja «Ver».
  ok('«Ver» abre la rutina entera', hoja.includes("rpc('rutina', { p_empresa: empresaId, p_rutina: rutinaId })"), true);
  ok('y la carga se cambia ahí mismo, con cambiar_carga', hoja.includes("rpc('cambiar_carga'"), true);
  ok('con los botones de unidad del editor', hoja.includes('UNIDADES_CARGA.map') && hoja.includes('conUnidad(carga, u)'), true);
  ok('solo en la vigente', hoja.includes("rutina?.estado === 'vigente'") && hoja.includes('editando?.id === e.id && vigente'), true);
  ok('las repeticiones que no se tocaron no se mandan',
    hoja.includes('p_reps: nuevasReps === ejercicio.reps ? null : nuevasReps'), true);
  ok('con las lesiones arriba y el camino a su carpeta',
    hoja.includes('rutina?.cliente_notas') && hoja.includes('href={`/rutinas/cliente/${rutina.cliente_id}`}'), true);
  {
    // «+2,5 / −2,5» se prueba de verdad: la función se saca del componente,
    // se transpila y se corre con la librería compilada. Nunca pone unidad.
    const ts = require('typescript');
    const { normalizarCarga, unidadDe, LARGOS } = require('../.compilado/rutina-texto.js');
    const fuente = /export function sumarACarga[\s\S]*?\r?\n\}\r?\n/.exec(hoja);
    ok('la hoja tiene su «+2,5»', Boolean(fuente), true);
    const js = fuente ? ts.transpileModule(fuente[0].replace(/^export /, ''), {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText : 'function sumarACarga() { return undefined; }';
    const sumarACarga = new Function('normalizarCarga', 'unidadDe', 'LARGOS', `${js}\nreturn sumarACarga;`)(
      normalizarCarga, unidadDe, LARGOS);
    ok('40 kg + 2,5', sumarACarga('40 kg', 2.5), '42,5 kg');
    ok('42,5 kg − 2,5', sumarACarga('42,5 kg', -2.5), '40 kg');
    ok('«40kg» pegado queda prolijo', sumarACarga('40kg', 2.5), '42,5 kg');
    ok('las libras se suman en libras', sumarACarga('25 lb', 2.5), '27,5 lb');
    ok('con el punto que ya usaba', sumarACarga('12.5 lb', 2.5), '15 lb');
    ok('lo que va después de la unidad se queda', sumarACarga('20 kg c/lado', 2.5), '22,5 kg c/lado');
    ok('un número solo no gana unidad: sin «+2,5»', sumarACarga('40', 2.5), null);
    ok('la placa tampoco', sumarACarga('placa 7', 2.5), null);
    ok('ni una banda', sumarACarga('banda roja', 2.5), null);
    ok('con dos números no se sabe a cuál', [sumarACarga('2x20 kg', 2.5), sumarACarga('20-25 kg', 2.5)], [null, null]);
    ok('y no baja de cero', sumarACarga('2,5 kg', -2.5), null);
  }

  // Clientes.
  ok('la ficha del trainer trae su rutina de rutinas_de',
    cliPag.includes("rpc('rutinas_de', { p_empresa: empresaId, p_todos: true })") && cliPag.includes("'/rutinas')"), true);
  ok('y lleva a su carpeta', cli.includes('href={`/rutinas/cliente/${c.id}`}'), true);
  ok('con «Mandar por WhatsApp» si tiene una vigente', /\{vigente && \(\s*<MandarRutina/.test(cli), true);
  ok('si no se pudo leer, no dice «Sin rutina»', cli.includes('rutina={rutinas ? (rutinas[c.id]'), true);

  // Agendar a alguien nuevo.
  ok('agendar a alguien nuevo devuelve su id', ins.includes('esNuevo ? { id: cliente'), true);
  ok('y la agenda ofrece medirlo y armarle la rutina',
    age.includes('/rutinas/cliente/${siguiente.id}?ver=progreso&anotar=1') && age.includes('/rutinas/nueva?cliente=${siguiente.id}'), true);
  ok('las medidas, solo a quien las puede ver',
    /\{esAdmin && \(\s*<Link\s+href=\{`\/rutinas\/cliente\/\$\{siguiente\.id\}\?ver=progreso/.test(age), true);
  ok('solo en la cuenta del trainer', age.includes('if (conRutinas && nuevo)'), true);

  // El candado.
  ok('el candado ofrece apagar los links de rutina', can.includes("rpc('apagar_enlaces_rutina', { p_empresa: empresaId })"), true);
  ok('pregunta antes y dice cuántos apagó', can.includes('p.apagarLinksPregunta') && can.includes('p.linksApagados(apagados)'), true);
  ok('solo al trainer, y a quien administra',
    lay.includes("const apagarLinks = bloqueada && ctx.esAdmin && ficha.secciones['/rutinas']")
      && lay.includes('apagarLinks={apagarLinks}'), true);

  // --- Lo que encontró la revisión de las pantallas (099) ---
  // Cada uno de estos era un hallazgo real: se lee la fuente para que no
  // vuelva sin que alguien lo note.
  const copiar = leer('src/components/rutinas/panel/Copiar.tsx');
  const carpeta = leer('src/components/rutinas/CarpetaCliente.tsx');
  const mandar = leer('src/components/rutinas/MandarRutina.tsx');
  const anotar = leer('src/components/rutinas/AnotarControl.tsx');
  const progreso = leer('src/components/rutinas/ProgresoCliente.tsx');
  const rutinas = leer('src/components/rutinas/PantallaRutinas.tsx');
  const priv = leer('src/app/privacidad/page.tsx');
  const es = leer('src/i18n/textos/es.ts');
  const pt = leer('src/i18n/textos/pt.ts');
  const panelTextos = leer('src/i18n/textos/rutinas-panel.ts');
  const publica = leer('src/i18n/textos/rutina-publica.ts');

  // Copiar de otra persona o de una plantilla: siempre como su próxima, que
  // el cliente no ve hasta «Activar». Antes, sin vigente, quedaba vigente en
  // el acto, con las notas (y las lesiones) de la otra persona en su link.
  ok('toda copia hacia un cliente nace como borrador (p_borrador)',
    copiar.includes('p_borrador: true') && /p_con_notas: true, p_borrador: true/.test(carpeta), true);
  ok('y la carpeta ya no arma copias en el editor sin guardar', /editorConCopia|\?desde=/.test(carpeta), false);
  ok('con una próxima ya armada no se elige a esa persona', copiar.includes('deshabilitado: !!x.borrador_id,'), true);
  ok('ni se ofrecen copias en su carpeta', carpeta.includes('tieneProxima={!!borrador}'), true);
  ok('los textos dicen la verdad nueva: nada llega al link hasta activarla',
    /revisalas: '[^']*hasta que la actives/.test(panelTextos) && /usarPlantillaAyuda: '[^']*cuando la actives/.test(panelTextos)
      && !/al guardarla'/.test(panelTextos), true);

  // El link, el «Copiado», el control repetido y «Para atender».
  ok('prender o crear el link refresca lo de alrededor', (mandar.match(/router\.refresh\(\)/g) || []).length >= 2, true);
  ok('el «Copiado» de la vigente sale al pie de su tarjeta, no arriba de todo',
    carpeta.includes("setAviso({ texto: c.textoCopiado, donde: 'vigente' })") && carpeta.includes("{avisoAca('vigente')}"), true);
  ok('un control del mismo día se avisa ANTES de mandar, con qué cambia',
    /if \(mismoDia\) \{\s*const cambia = loQueCambia\(mismoDia, datos\);\s*if \(cambia\.length\) \{ setCompletar/.test(anotar), true);
  ok('y se puede corregir ese control en vez de completarlo',
    anotar.includes('onCorregir(mismoDia)') && progreso.includes('onCorregir={(m)'), true);
  // Sin `key`, React conservaba la hoja: «Corregir ese control» mostraba lo
  // recién tipeado y al guardar borraba lo que ese control tenía.
  ok('«Corregir ese control» monta la hoja de nuevo con ese control (key)',
    /<AnotarControl\s+(?:\/\/[^\n]*\n\s*)*key=\{hoja\.control\?\.id \?\? 'nuevo'\}/.test(progreso), true);
  // El nombre de respaldo de una copia, en el idioma de la pantalla.
  ok('la copia manda el nombre de respaldo en el idioma de la pantalla',
    copiar.includes('p_nombre_vacio: t.rutinasEditor.datos.nombrePorDefecto'), true);
  ok('«sin rutina» con la próxima armada lleva a activarla, no a armar otra',
    /if \(c\?\.borrador_id\) \{\s*return <Link href=\{`\/rutinas\/cliente\/\$\{cliente\}`\} className=\{clase\}>\{l\.verLaProxima\}/.test(rutinas), true);

  // Un teléfono que ya es de otra persona: se pregunta antes de crear a nadie.
  ok('antes de crear a alguien nuevo se busca su teléfono', ins.includes("rpc('buscar_clientes'") && ins.includes('p_texto: digitos'), true);
  // La búsqueda es por «contiene» y ordena por nombre: con seis, la ficha
  // con el número entero podía quedar afuera y no había pregunta.
  ok('y se pide el tope de la función (50), no un puñado', ins.includes('p_limite: 50') && !ins.includes('p_limite: 6'), true);
  ok('con otro nombre se pregunta, con dos salidas',
    ins.includes('i.siEs(mismaPersona.nombre)') && ins.includes('i.noSacarTelefono') && ins.includes("telefono: ''"), true);
  ok('y quien ya existía no es «nuevo»', ins.includes('!el.id && !existia'), true);
  ok('los textos de la pregunta, en los dos idiomas',
    ['mismoTelefono:', 'siEs:', 'noSacarTelefono:'].every((k) => es.includes(k) && pt.includes(k)), true);

  // Eliminar y la privacidad dicen lo que la 099 hace al archivar.
  ok('la confirmación de eliminar del trainer avisa qué se borra',
    cli.includes('conSalud={conRutinas}') && cli.includes('t.clientes.eliminarConSalud(c.nombre)'), true);
  ok('en los dos idiomas', es.includes('eliminarConSalud:') && pt.includes('eliminarConSalud:'), true);
  // Al archivar, las notas se borran en todo rubro (099): el texto general lo dice.
  ok('y eliminar dice, en todo rubro, que las notas se borran',
    /eliminarDetalle: \(nombre: string\) => `[^`]*sus notas se borran\.`/.test(es)
      && /eliminarDetalle: \(nombre: string\) => `[^`]*as anotações são apagadas\.`/.test(pt), true);
  ok('la privacidad: al archivar se borran medidas, consentimiento y lesiones',
    /borra sus medidas, su consentimiento y «Salud y lesiones»/.test(priv), true);
  ok('ya no promete «llevarte todo» en el Excel', priv.includes('llevarte todo'), false);
  ok('y dice que rutinas y medidas no van en el Excel', /no van en el Excel/.test(priv) && /no\s+van en ese Excel/.test(priv), true);
  ok('los menores: con el acuerdo de madre, padre o tutor', /entrenás a menores/.test(priv), true);

  // El portugués no asume que el cliente es varón, y «Siguiente» no promete
  // medidas a quien no las ve.
  ok('el portugués no dice «dele» en la hoja de la sesión', /evolução dele/.test(pt), false);
  ok('ni «Bom treino» al terminar', /listoPorHoy: '[^']*Bom treino/.test(publica), false);
  ok('«Siguiente» no promete medidas a quien no las ve', /siguienteDetalle: \(nombre: string\) => `[^`]*medidas/.test(es), false);
}
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

// --- Los planes de cada rubro: la ficha y la base tienen que decir lo mismo (102) ---
//
// Mismo problema que los días de prueba: la lista vive en dos lados. La
// ficha del rubro (`planes`, en rubros.ts) decide qué tarjetas ve la
// pantalla de planes y qué acepta el checkout; `planes_de_rubro()` (102)
// decide con qué plan arranca la prueba. Si se separan, a un profe se le
// regala una prueba de Pro que después la pantalla no le deja contratar.
//
// Acá no alcanza con leer un número del archivo: la función devuelve una
// lista según rubro y tipo de cuenta, y leer un `case` con expresiones
// regulares se rompe con el primer cambio de formato. Así que se levanta un
// PostgreSQL en blanco (PGlite, el mismo de las pruebas de la base), se crea
// SOLO esa función tal como está escrita en la migración —no lee tablas, no
// necesita el resto— y se le pregunta rubro por rubro.
{
  const fs = require('fs');
  const { RUBROS } = require('../.compilado/rubros.js');

  // Lo que decidió Matías (23/09). Escrito acá para que cambiarlo sea una
  // decisión y no un descuido en la ficha.
  const planesDe = (rubro, tipo) => [...fichaDe(rubro, tipo).planes];
  ok('comercio y servicios: los tres',
    [planesDe('comercio', 'emprendedor'), planesDe('servicios', 'emprendedor')],
    [['basico', 'pro', 'negocio'], ['basico', 'pro', 'negocio']]);
  ok('clases y trainer: solo el Básico',
    [planesDe('clases', 'emprendedor'), planesDe('entrenamiento', 'emprendedor')], [['basico'], ['basico']]);
  ok('agricultura y ganadería: Básico y Pro',
    [planesDe('agricultura', 'emprendedor'), planesDe('ganaderia', 'emprendedor')],
    [['basico', 'pro'], ['basico', 'pro']]);
  ok('una cuenta personal: su único plan pago, como antes',
    ['comercio', 'clases', 'agricultura'].map((r) => planesDe(r, 'personal')), [['pro'], ['pro'], ['pro']]);
  const orden = ['basico', 'pro', 'negocio'];
  ok('cada lista va de menor a mayor y sin repetidos',
    Object.keys(RUBROS).filter((r) => {
      const l = planesDe(r, 'emprendedor');
      return l.length === 0 || l.some((p, i) => i > 0 && orden.indexOf(p) <= orden.indexOf(l[i - 1]));
    }), []);

  // La pantalla y el checkout leen la ficha; ninguno escribe la lista a mano.
  const pantallaPlan = fs.readFileSync('src/app/(app)/plan/page.tsx', 'utf8');
  ok('la pantalla de planes muestra los del rubro', pantallaPlan.includes('ficha.planes.includes('), true);
  ok('sin la lista de tres escrita a mano', pantallaPlan.includes("['basico', 'pro', 'negocio']"), false);
  ok('y con la jerga del oficio', pantallaPlan.includes('conJerga(await textos(), ficha.jerga'), true);
  const checkout = fs.readFileSync('src/app/api/pagos/checkout/route.ts', 'utf8');
  ok('el checkout rechaza un plan que el rubro no ofrece',
    checkout.includes('.planes.includes(plan)') && checkout.includes('s.planNoEsDeTuRubro'), true);

  // Los nombres de los roles salen del diccionario (102), así el campo lee
  // «Encargado» y el portugués no lee «Propietario».
  ok('NOMBRE_ROL ya no existe',
    fs.readFileSync('src/lib/permisos.ts', 'utf8').includes('export const NOMBRE_ROL'), false);
  ok('el equipo lee el rol del diccionario',
    fs.readFileSync('src/components/Equipo.tsx', 'utf8').includes('t.roles[m.rol]'), true);
  // jergas.ts no compila suelto en este arnés (importa los diccionarios
  // enteros); alcanza con mirar el texto de la jerga.
  const agro = fs.readFileSync('src/i18n/textos/agricultura.ts', 'utf8');
  ok('en el campo el vendedor es el encargado',
    agro.includes("vendedor: 'Encargado'") && agro.includes("vendedor: 'Encarregado'"), true);

  // Y la base. Sin la migración, falla: una comprobación que se saltea sola
  // cuando falta lo que tiene que comprobar da confianza sin haber mirado.
  const ruta = 'supabase/migrations/102_planes_por_rubro_y_comision.sql';
  if (!fs.existsSync(ruta)) {
    ok('existe la migración 102 con planes_de_rubro()', false, true);
  } else {
    const sql = fs.readFileSync(ruta, 'utf8');

    /** El `create function` entero, del principio al `;` después del cuerpo. */
    const definicion = (nombre) => {
      const inicio = sql.search(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nombre}\\s*\\(`, 'i'));
      if (inicio < 0) return null;
      const apertura = /\$([A-Za-z_]*)\$/g;
      apertura.lastIndex = inicio;
      const tag = apertura.exec(sql);
      if (!tag) return null;
      const cierre = sql.indexOf(tag[0], tag.index + tag[0].length);
      if (cierre < 0) return null;
      const fin = sql.indexOf(';', cierre + tag[0].length);
      return sql.slice(inicio, fin < 0 ? undefined : fin + 1);
    };

    const defPlanes = definicion('planes_de_rubro');
    const defPrueba = definicion('plan_de_prueba');
    ok('la 102 define planes_de_rubro()', defPlanes !== null, true);
    ok('y plan_de_prueba()', defPrueba !== null, true);

    if (defPlanes) {
      pendientes.push((async () => {
        const { PGlite } = require('@electric-sql/pglite');
        const db = await new PGlite();
        try {
          await db.exec(defPlanes);
          if (defPrueba) await db.exec(defPrueba);

          const tipos = ['emprendedor', 'personal'];
          const distintos = [];
          const pruebaDistinta = [];
          for (const rubro of Object.keys(RUBROS)) {
            for (const tipo of tipos) {
              const esperado = planesDe(rubro, tipo);
              const { rows } = await db.query('select public.planes_de_rubro($1, $2) as p', [rubro, tipo]);
              const real = rows[0].p;
              if (JSON.stringify(real) !== JSON.stringify(esperado)) {
                distintos.push(`${rubro}/${tipo}: base ${JSON.stringify(real)}, ficha ${JSON.stringify(esperado)}`);
              }
              // La prueba arranca en Pro si el rubro lo ofrece; si no, en
              // el más alto que tenga (clases y trainer → Básico).
              if (defPrueba) {
                const deLaPrueba = esperado.includes('pro') ? 'pro' : esperado[esperado.length - 1];
                const r2 = await db.query('select public.plan_de_prueba($1, $2) as p', [rubro, tipo]);
                if (r2.rows[0].p !== deLaPrueba) {
                  pruebaDistinta.push(`${rubro}/${tipo}: base ${r2.rows[0].p}, esperado ${deLaPrueba}`);
                }
              }
            }
          }
          ok('planes_de_rubro() dice lo mismo que la ficha, rubro por rubro y tipo por tipo', distintos, []);
          if (defPrueba) ok('plan_de_prueba(): Pro si lo ofrece, si no el más alto', pruebaDistinta, []);

          // Sin tipo de cuenta es un negocio: el valor por defecto de la firma.
          const { rows } = await db.query("select public.planes_de_rubro('clases') as p");
          ok('sin tipo de cuenta, la de un negocio', rows[0].p, planesDe('clases', 'emprendedor'));
        } catch (e) {
          ok('se pudo crear y consultar planes_de_rubro() de la 102', String(e && e.message || e), 'sin error');
        } finally {
          await db.close();
        }
      })());
    }
  }
}

// --- La comisión del socio es la mitad del PRECIO DE LISTA (102) ---
//
// Antes era la mitad de lo que entraba, y los textos lo decían así: «la
// mitad de su primer pago». Con un descuento o un pago anual ese número ya
// no es el que se paga, y una promesa de plata que no coincide con lo que
// llega es un reclamo. Ningún texto visible puede volver a decirlo.
{
  const fs = require('fs');
  const viejas = [
    /mitad de su primer pago/i, /mitad del primer pago/i, /mitad de ese pago/i, /la mitad es tuya/i,
    /metade do primeiro pagamento/i, /metade desse pagamento/i, /metade é sua/i,
  ];
  const archivos = ['src/i18n/textos/es.ts', 'src/i18n/textos/pt.ts', 'src/components/PantallaRecomendar.tsx'];
  const quedan = [];
  for (const a of archivos) {
    const texto = fs.readFileSync(a, 'utf8');
    for (const v of viejas) if (v.test(texto)) quedan.push(`${a}: ${v}`);
  }
  ok('ningún texto promete la mitad de lo que se pagó', quedan, []);
  const es = fs.readFileSync('src/i18n/textos/es.ts', 'utf8');
  const pt = fs.readFileSync('src/i18n/textos/pt.ts', 'utf8');
  ok('y la letra chica lo explica, en los dos idiomas',
    es.includes('te llevás la mitad del precio de lista de un mes. Lo que pague después ya no entra.')
    && pt.includes('você fica com metade do preço de tabela de um mês.'), true);
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

  // 2026-09-17: nadie quedaba anotado y la base no tenía ni el rechazo. El
  // código vivía solo en `localStorage`, que no viaja cuando el correo de
  // confirmación se abre desde la app de Gmail ni cuando el enlace se abre
  // dentro de WhatsApp y la cuenta se crea después en otro navegador. Ahora
  // el código va guardado EN LA CUENTA desde el registro.
  ok('el código se guarda en la cuenta al registrarse',
    /data:\s*{\s*ref:/.test(fs.readFileSync('src/app/crear/page.tsx', 'utf8')), true);
  ok('y se lo busca ahí cuando el navegador no lo tiene', ref.includes('user_metadata'), true);
  ok('una vez usado se olvida, para que no valga en la próxima empresa',
    /updateUser\(\{\s*data:\s*\{\s*ref:\s*null/.test(ref), true);

  // El orden importa: primero este navegador, después el enlace que se está
  // abriendo, y al final la cuenta.
  {
    const { codigoDeInvitacion, CLAVE_REF } = require('../.compilado/referido.js');
    const guardado = {};
    global.localStorage = {
      getItem: (k) => guardado[k] ?? null,
      setItem: (k, v) => { guardado[k] = v; },
      removeItem: (k) => { delete guardado[k]; },
    };
    global.window = { location: { search: '' } };
    const cuentaCon = (valor) => ({
      rpc: async () => ({ error: null }),
      auth: { getUser: async () => ({ data: { user: { user_metadata: { ref: valor } } } }) },
    });
    const sinCuenta = { rpc: async () => ({ error: null }) };

    pendientes.push((async () => {
      ok('sin nada guardado no hay código', await codigoDeInvitacion(sinCuenta), null);

      global.window.location.search = '?ref=abcd1234';
      ok('el código del enlace sirve aunque no esté guardado',
        await codigoDeInvitacion(sinCuenta), 'ABCD1234');

      global.window.location.search = '';
      ok('el que quedó en la cuenta sirve cuando el navegador no tiene nada',
        await codigoDeInvitacion(cuentaCon('efgh5678')), 'EFGH5678');
      ok('un código torcido en la cuenta se ignora',
        await codigoDeInvitacion(cuentaCon('nada')), null);

      guardado[CLAVE_REF] = JSON.stringify({ codigo: 'AAAA1111', desde: Date.now() });
      global.window.location.search = '?ref=BBBB2222';
      ok('manda el de este navegador: es el primero que llegó',
        await codigoDeInvitacion(cuentaCon('CCCC3333')), 'AAAA1111');

      delete global.localStorage;
      delete global.window;
    })());
  }

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
  ok('y la captura igual', cap.includes('flex touch-none justify-center') && cap.includes('touch-pan-y overflow-y-auto'), true);

  ok('el menú flota centrado, por encima de todo',
    nav.includes('fixed inset-0 z-[60] flex touch-none items-center justify-center'), true);
  // La solución que eligió el dueño a la barra que «se levantaba»: mientras
  // el menú está abierto la barra no está, y se sale con la X. Lo que no
  // está, no se puede mover.
  ok('con el menú abierto la barra de abajo desaparece', nav.includes("${abierto ? 'hidden' : ''}"), true);
  ok('y se sale con una X', nav.includes('aria-label={t.comun.cerrar}'), true);
  ok('el bloqueo no le toca el overflow a la raíz', fondo.includes("raiz.style.overflow = 'hidden'"), false);
  ok('la captura también', cap.includes('justify-center overscroll-none bg-noche/70') && cap.includes("'items-center pt-6'"), true);
  // Menos al escribir: centrado, el teclado del celular le tapaba los botones.
  ok('al escribir, el cuadro va arriba y deja lugar al teclado',
    cap.includes("modo === 'texto' ? 'items-start") && cap.includes('sm:items-center'), true);
  // Una sola caja se desplaza: con dos, en el iPhone Guardar quedaba afuera.
  ok('la revisión no tiene su propia caja con scroll',
    ['CapturaInteligente', 'RevisionCliente', 'RevisionFiado', 'RevisionProducto']
      .some((n) => fs.readFileSync(`src/components/${n}.tsx`, 'utf8').includes('max-h-[78vh]')), false);

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
      rachaLinea: (d) => `R${d}`,
    },
    tarde: {
      negocio: 'TN', personal: 'TP',
      negocioRacha: (d) => `TNR${d}`, personalRacha: (d) => `TPR${d}`,
    },
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
      rachaLinea: (d) => `R${d}`,
    },
  };
  const dia = (o = {}) => ({ ventas: 0, ingresos: 0, gastos: 0, ganancia: 0, cargados: 0, ...o });
  const cuenta = (hoy, ayer, tipo = 'emprendedor', racha) =>
    ({ nombre: 'Kiosco', moneda: 'PYG', tipo_cuenta: tipo, hoy: dia(hoy), ayer: dia(ayer), racha });
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

  // --- La racha, con más fuerza para no necesitar un widget (076) ---
  //
  // No hay widget de pantalla de inicio para una PWA: eso pide una app
  // nativa en cada tienda. Mientras tanto, los avisos dicen la racha.
  ok('un solo día no alcanza para mencionar la racha',
    fraseDelDia('manana', cuenta({}, {}, 'emprendedor', { dias: 1, en_riesgo: false }), tx, 'es-PY').cuerpo,
    'NADA');
  ok('mañana: la racha de ayer se agrega al final',
    fraseDelDia('manana', cuenta({}, {}, 'emprendedor', { dias: 3, en_riesgo: false }), tx, 'es-PY').cuerpo,
    'NADA R3');
  ok('tarde: sin racha en riesgo, el empujón genérico',
    fraseDelDia('tarde', cuenta({}, {}, 'emprendedor', { dias: 3, en_riesgo: false }), tx, 'es-PY').cuerpo,
    'TN');
  ok('tarde: con la racha en riesgo, el empujón pega más fuerte',
    fraseDelDia('tarde', cuenta({}, {}, 'emprendedor', { dias: 5, en_riesgo: true }), tx, 'es-PY').cuerpo,
    'TNR5');
  ok('tarde, cuenta personal: su propio empujón con racha',
    fraseDelDia('tarde', cuenta({}, {}, 'personal', { dias: 4, en_riesgo: true }), tx, 'es-PY').cuerpo,
    'TPR4');
  ok('noche: la racha de hoy se agrega al final',
    fraseDelDia('noche', cuenta({ gastos: 5000, ganancia: -5000, cargados: 1 }, {}, 'emprendedor', { dias: 6, en_riesgo: false }), tx, 'es-PY').cuerpo,
    `SV:${gs(5000)} R6`);
  ok('sin racha en la cuenta, no explota ni la menciona',
    fraseDelDia('manana', cuenta({}, {}), tx, 'es-PY').cuerpo, 'NADA');

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
  // De qué cuenta salió la plata, elegido a mano (075), y desde la 083 se
  // pregunta SIEMPRE que haya una cuenta. Antes solo con dos o más: con una
  // sola no se preguntaba, y si su forma de pago no coincidía, el gasto se
  // guardaba fuera de la billetera sin que nadie se enterara.
  const gas = fs.readFileSync('src/components/PantallaGastos.tsx', 'utf8');
  ok('el gasto puede decir de qué cuenta salió', gas.includes('cuenta_id: cuentaId || null'), true);
  ok('y se pregunta desde la primera cuenta', gas.includes('cuentas.length > 0'), true);
  // «Automática» sin decir a dónde es una apuesta, no una opción.
  ok('«automática» dice a qué cuenta va a ir', gas.includes('t.gastos.iraA('), true);
  ok('y avisa cuando no va a ir a ninguna', gas.includes('t.gastos.noVaANinguna'), true);

  // Lo que ya quedó fuera de la billetera se ve y se arregla (083).
  const bill = fs.readFileSync('src/components/PantallaBilletera.tsx', 'utf8');
  ok('la billetera muestra lo que quedó afuera', bill.includes('<PlataSinCuenta'), true);
  ok('y avisa qué forma de pago no tiene cuenta', bill.includes('b.metodoSinCuenta('), true);
  const sueltos = fs.readFileSync('src/components/PlataSinCuenta.tsx', 'utf8');
  ok('se puede ubicar de a uno y todos juntos',
    sueltos.includes('asignar(c.id, m.id)') && sueltos.includes('asignar(c.id, null)'), true);
  // No se manda a una cuenta cualquiera para que el total cierre: eso sería
  // cambiar un número que miente por otro que miente distinto.
  ok('pero no se elige ninguna sola', sueltos.includes('cuentas[0]'), false);
  const org = fs.readFileSync('src/components/PantallaOrganizacion.tsx', 'utf8');
  ok('el sueldo guarda en qué cuenta se cobra', org.includes('p_cuenta: d.cuentaId || null'), true);
  ok('y el ingreso suelto también cae donde se diga', org.includes('cuenta_id: d.cuentaId || null'), true);

  // El plan Básico: el negocio entero para una sola persona (077).
  // `precios.ts` importa el cliente del servidor, así que no se compila
  // suelto: se mira el archivo, que igual es el que manda la pantalla.
  const precios = fs.readFileSync('src/lib/precios.ts', 'utf8');
  ok('hay tres planes que se venden',
    precios.includes("PLANES_PAGOS = ['basico', 'pro', 'negocio']"), true);
  ok('y el Básico es de uno solo', /basico:.*miembros: 1/.test(precios), true);
  // Desde la 102 la pantalla no escribe la lista: ofrece los del rubro
  // (ver «Los planes de cada rubro»). Un comercio sigue viendo los tres.
  ok('la pantalla de planes le ofrece los tres a un comercio',
    fs.readFileSync('src/app/(app)/plan/page.tsx', 'utf8').includes('ficha.planes.includes(')
    && JSON.stringify(fichaDe('comercio', 'emprendedor').planes) === JSON.stringify(['basico', 'pro', 'negocio']), true);

  // El descuento que se gana usando Orden en la prueba (078).
  ok('el panel muestra cómo va el descuento',
    fs.readFileSync('src/app/(app)/panel/page.tsx', 'utf8').includes('<TarjetaDescuento'), true);
  ok('y la portada lo cuenta antes de registrarse',
    fs.readFileSync('src/app/page.tsx', 'utf8').includes('p.descuentoPrueba('), true);
  ok('los números de la promo salen de la base, no del código',
    fs.readFileSync('src/app/page.tsx', 'utf8').includes("rpc('promo_de_la_prueba')"), true);

  // El descuento que se mantiene mientras la racha siga viva (079). Las dos
  // etapas hablan distinto: una felicita por lo ganado, la otra pide
  // sostenerlo. Si las pantallas usaran el mismo texto, al que ya paga le
  // prometeríamos un descuento «en su primer mes» que ya pasó.
  ok('la tarjeta cambia de voz cuando la cuenta ya paga',
    fs.readFileSync('src/components/Racha.tsx', 'utf8').includes("descuento.fase === 'constancia'"), true);
  ok('y «Tu plan» también',
    fs.readFileSync('src/app/(app)/plan/page.tsx', 'utf8').includes('t.plan.constanciaEnPrecio('), true);
  ok('la administración ve cuánto cobrarle a quien mantiene la racha',
    fs.readFileSync('src/components/PanelAdmin.tsx', 'utf8').includes('Mantiene su racha'), true);
  ok('y la portada cuenta la segunda mitad del trato',
    fs.readFileSync('src/app/page.tsx', 'utf8').includes('p.descuentoConstancia('), true);

  // Apenas pagó es cuando escucha: el aviso de plan activo le dice cómo
  // pagar menos el mes que viene.
  const activacion = fs.readFileSync('src/app/api/admin/aviso-activacion/route.ts', 'utf8');
  ok('el aviso de plan activo invita a mantener la racha', activacion.includes('t.conRacha('), true);
  ok('con los números de la base, no escritos en el código',
    activacion.includes("servicio.rpc('promo_de_la_prueba')"), true);
  ok('y le dice el nombre real de su plan', activacion.includes('NOMBRE_DEL_PLAN[suscripcion.plan'), true);

  // El panel personal ya no repite totales: arriba está la billetera (la
  // plata de verdad) y abajo lo que ella no dice.
  const panelPersonal = fs.readFileSync('src/components/PanelPersonal.tsx', 'utf8');
  ok('el panel personal no vuelve a mostrar el disponible',
    panelPersonal.includes('resumen.disponible'), false);
  ok('ni los ingresos del período', panelPersonal.includes('t.organizacion.entro'), false);
  ok('y sí los gastos, el ahorro y las deudas',
    panelPersonal.includes('t.organizacion.salio')
      && panelPersonal.includes('t.panelPersonal.guardado')
      && panelPersonal.includes('t.nav.deudas'), true);
  // Y el disponible no se perdió: vive donde se calcula y se edita.
  ok('el disponible sigue en Organización',
    fs.readFileSync('src/components/PantallaOrganizacion.tsx', 'utf8').includes('t.organizacion.teQuedan'), true);

  // Las cuentas de la billetera se deslizan de costado (081): con seis
  // cuentas en vertical, todo lo demás quedaba abajo del pliegue.
  const billeteraPanel = fs.readFileSync('src/components/BilleteraPanel.tsx', 'utf8');
  ok('la billetera del panel se desliza',
    billeteraPanel.includes('snap-x') && billeteraPanel.includes('overflow-x-auto'), true);

  // La racha también en la cuenta personal (080). Llevaba siempre a /cierre,
  // que una cuenta personal no tiene, y por eso nunca se le mostraba.
  ok('la tarjeta de racha acepta a dónde llevar',
    fs.readFileSync('src/components/Racha.tsx', 'utf8').includes("destino = '/cierre'"), true);
  ok('y el panel personal la muestra apuntando a Gastos',
    fs.readFileSync('src/app/(app)/panel/page.tsx', 'utf8').includes('destino="/gastos"'), true);

  // Ahorrar es cargar (080): a quien hoy solo guardó plata no se le dice
  // «todavía no cargaste nada».
  ok('el aviso de la tarde mira también el ahorro',
    fs.readFileSync('src/lib/frases-del-dia.ts', 'utf8').includes('n(cuenta.hoy.ahorros) > 0'), true);

  // «Probar»: separa «no llega el aviso» de «no había nada que decir».
  const probar = fs.readFileSync('src/app/api/avisos/probar/route.ts', 'utf8');
  ok('el aviso de prueba se manda a uno mismo', probar.includes('avisar(user.id'), true);
  // Sin `request.json()` no hay parámetro que mandar: el destinatario sale
  // de la sesión y de ningún otro lado.
  ok('y no acepta a quién avisar', probar.includes('request.json'), false);
  ok('Ajustes tiene el botón de probar',
    fs.readFileSync('src/components/Preferencias.tsx', 'utf8').includes("fetch('/api/avisos/probar'"), true);

  // La señal de que se está cambiando de pantalla.
  //
  // Esta comprobación existe porque volver a poner `loading.tsx` cuesta una
  // tarde: con Next 15 la barrera de espera que crea ese archivo no se
  // resuelve nunca y TODAS las pantallas de adentro se quedan en el
  // esqueleto gris, en producción igual que en desarrollo. Se descartó que
  // fuera el idioma, las cookies, o que el esqueleto fuera del navegador o
  // del servidor: es el archivo. Si alguien lo vuelve a crear, que se entere
  // acá y no por un cliente que ve gris para siempre.
  ok('no hay loading.tsx en las pantallas de adentro',
    fs.existsSync('src/app/(app)/loading.tsx'), false);
  const barra = fs.readFileSync('src/components/BarraDeCarga.tsx', 'utf8');
  ok('la barra de carga la reemplaza',
    fs.readFileSync('src/app/(app)/layout.tsx', 'utf8').includes('<BarraDeCarga />'), true);
  // Con estado de React la barra aparecía medio segundo tarde: navegar es
  // una transición y el cambio de estado se va con ella.
  ok('y se enciende tocando el DOM, no con estado',
    barra.includes('classList.add') && !barra.includes('useState'), true);

  // El sueldo que no se acreditaba el día que se cobra.
  //
  // Orden ya sabía que faltaba —lo dice `cobro_pendiente`— pero dejaba el
  // cartel ahí, y acreditarlo pedía ir a cargar el ingreso a mano repitiendo
  // el monto y la cuenta que Orden ya tiene guardados.
  const orgn = fs.readFileSync('src/components/PantallaOrganizacion.tsx', 'utf8');
  ok('el cobro pendiente trae el botón para acreditarlo',
    orgn.includes('t.organizacion.yaLoCobre'), true);
  // La fecha es la del arranque del ciclo, que es el día de cobro: si lo
  // marcás tres días después, el sueldo sigue siendo del día que lo cobraste.
  ok('y lo acredita con la fecha del cobro, no con la de hoy',
    orgn.includes('fecha: resumen.desde'), true);
  ok('en la cuenta donde se cobra, que ya estaba guardada',
    orgn.includes('cuenta_id: f.cuenta_id || null'), true);

  // Los montos se leen mientras se escriben (3.1). En guaraníes,
  // «1500000» y «150000» se distinguen contando ceros, y uno se equivoca en
  // su propia contabilidad por uno de menos.
  const campoMonto = fs.readFileSync('src/components/CampoMonto.tsx', 'utf8');
  // No puede ser type="number": el navegador no deja formatear su contenido.
  ok('el campo de plata es de texto, con teclado numérico',
    campoMonto.includes('type="text"') && campoMonto.includes('inputMode="decimal"'), true);
  // Sin esto, corregir un dígito del medio manda el cursor al final y se
  // vuelve imposible arreglar un número sin borrarlo entero.
  ok('y devuelve el cursor donde estaba', campoMonto.includes('setSelectionRange'), true);
  for (const p of ['src/components/PantallaGastos.tsx', 'src/components/PantallaFiado.tsx']) {
    ok(`${p.split('/').pop()} usa el campo con separadores`,
      fs.readFileSync(p, 'utf8').includes('<CampoMonto'), true);
  }

  // Ideas para recomendar: el que no sabe qué decir, no escribe.
  const rec2 = fs.readFileSync('src/components/PantallaRecomendar.tsx', 'utf8');
  ok('las invitaciones traen ideas de qué decir', rec2.includes('<Ideas enlace'), true);
  ok('con un mensaje por situación',
    fs.readFileSync('src/i18n/textos/es.ts', 'utf8').includes('ideas: ['), true);

  const panelAdmin = fs.readFileSync('src/components/PanelAdmin.tsx', 'utf8');
  ok('activar un plan avisa al cliente', panelAdmin.includes('avisarActivacion('), true);

  // Los avisos decían el nombre de la cuenta, y diez cuentas personales se
  // llaman «Mis finanzas»: no se sabía quién era ninguna. Va el nombre de la
  // persona, tanto para la administración como para quien la trajo.
  const nueva = fs.readFileSync('src/app/api/avisos/cuenta-nueva/route.ts', 'utf8');
  ok('el aviso de cuenta nueva dice quién se registró', nueva.includes('Se registró ${persona}'), true);
  ok('y al socio también le dice quién entró', nueva.includes('t.entroTitulo(persona)'), true);
  ok('la comisión también nombra a la persona',
    fs.readFileSync('src/app/api/admin/aviso-activacion/route.ts', 'utf8').includes('t.comisionTitulo(persona)'), true);
  ok('el nombre de la persona lo resuelve un solo lugar',
    fs.readFileSync('src/lib/avisos.ts', 'utf8').includes('export async function nombreDeLaPersona'), true);

  // Activar el mes dejaba la ficha abierta con un cartel adentro: había que
  // cerrarla a mano para ver la lista al día.
  ok('activar cierra la ficha y recarga con el resultado arriba',
    /onHecho\(\[contar\?\.\(data\), comision\]/.test(panelAdmin), true);
  ok('y el resultado dice de quién es la cuenta', panelAdmin.includes('la cuenta de ${quienEs(cuenta)} quedó activa'), true);
}

// --- La tarjeta conoce el Básico ---
// El webhook convertía todo lo que no fuera 'negocio' en 'pro': un Básico
// pagado con tarjeta quedaba Pro. Y el checkout pedía los precios solo por
// moneda: una cuenta personal pagaba el Pro de un negocio.
{
  const fs = require('fs');
  const { esPlanPago, estadoDeStripe, planDeMetadatos, planParaAplicar, NOMBRE_DE_PRODUCTO } = require('../.compilado/pagos.js');

  ok('los tres planes pagos, y nada más',
    ['basico', 'pro', 'negocio', 'gratis', 'Pro', 'premium', '', null, undefined, 3].map(esPlanPago),
    [true, true, true, false, false, false, false, false, false, false]);

  ok('la sesión y la suscripción: metadata.plan',
    ['basico', 'pro', 'negocio'].map((plan) => planDeMetadatos({ metadata: { plan } })), ['basico', 'pro', 'negocio']);
  ok('un Básico ya no sale Pro', planDeMetadatos({ metadata: { plan: 'basico' } }), 'basico');
  ok('la factura: subscription_details.metadata',
    planDeMetadatos({ metadata: {}, subscription_details: { metadata: { plan: 'basico' } } }), 'basico');
  ok('la factura con la API nueva: parent.subscription_details.metadata',
    planDeMetadatos({ metadata: {}, parent: { subscription_details: { metadata: { plan: 'negocio' } } } }), 'negocio');
  ok('sin plan, o con uno raro: null, no Pro',
    [{}, { metadata: {} }, { metadata: { plan: 'gratis' } }, { metadata: { plan: 'enterprise' } },
      { metadata: { plan: 'PRO' } }, null, undefined].map(planDeMetadatos),
    [null, null, null, null, null, null, null]);
  ok('uno raro arriba no se tapa con uno válido abajo',
    planDeMetadatos({ metadata: { plan: 'enterprise' }, subscription_details: { metadata: { plan: 'negocio' } } }), null);

  ok('con plan en los metadatos, ese, sea cual sea el estado',
    ['activa', 'prueba', 'morosa', 'cancelada'].map((e) => planParaAplicar('basico', e, 'negocio')),
    ['basico', 'basico', 'basico', 'basico']);
  ok('sin plan, activar no adivina',
    [planParaAplicar(null, 'activa', 'pro'), planParaAplicar(null, 'prueba', 'basico')], [null, null]);
  ok('sin plan, morosa o cancelada siguen con el que tenía',
    [planParaAplicar(null, 'morosa', 'basico'), planParaAplicar(null, 'cancelada', 'negocio')], ['basico', 'negocio']);
  ok('y si no tenía uno pago, tampoco se inventa',
    [planParaAplicar(null, 'morosa', 'gratis'), planParaAplicar(null, 'cancelada', null)], [null, null]);

  // Un status de Stripe que no se conoce ya no cae en 'activa': con el importe
  // al lado, la 104 lo tomaba como cobro y le generaba la comisión al socio.
  const sub = (status, extra = {}) => estadoDeStripe('customer.subscription.updated', { status, ...extra });
  ok('los status que se conocen',
    ['active', 'trialing', 'past_due', 'unpaid', 'canceled'].map((s) => sub(s)),
    ['activa', 'prueba', 'morosa', 'morosa', 'cancelada']);
  ok('incomplete, incomplete_expired, paused, raro o ausente: no se aplica',
    ['incomplete', 'incomplete_expired', 'paused', 'ACTIVE', 'algo', '', null, undefined].map((s) => sub(s)),
    [null, null, null, null, null, null, null, null]);
  ok('sin objeto, tampoco', [estadoDeStripe('customer.subscription.created', undefined),
    estadoDeStripe('customer.subscription.created', {})], [null, null]);
  ok('cancela al vencer: lo que estaba al día pasa a cancelada',
    [sub('active', { cancel_at_period_end: true }), sub('trialing', { cancel_at_period_end: true })],
    ['cancelada', 'cancelada']);
  ok('cancela al vencer no convierte un incomplete ni una morosa en cancelada (conservaría el plan)',
    [sub('incomplete', { cancel_at_period_end: true }), sub('incomplete_expired', { cancel_at_period_end: true }),
      sub('past_due', { cancel_at_period_end: true })],
    [null, null, 'morosa']);
  ok('la sesión de checkout activa solo con el pago confirmado',
    ['paid', 'unpaid', 'no_payment_required', undefined].map((payment_status) =>
      estadoDeStripe('checkout.session.completed', { status: 'complete', payment_status })),
    ['activa', null, null, null]);

  ok('el resumen de la tarjeta dice el nombre de la pantalla',
    NOMBRE_DE_PRODUCTO, { basico: 'Orden Básico', pro: 'Orden Pro', negocio: 'Orden Premium' });

  const checkout = fs.readFileSync('src/app/api/pagos/checkout/route.ts', 'utf8');
  ok('el checkout deja pasar los tres planes', checkout.includes('if (!esPlanPago(plan))'), true);
  ok('y ya no solo pro y negocio', checkout.includes("plan !== 'pro' && plan !== 'negocio'"), false);
  ok('el precio sale de la lista de su tipo de cuenta',
    /lista_precios', \{\s*p_moneda: moneda, p_tipo: empresa\.tipo_cuenta/.test(checkout)
    && checkout.includes('p.tipo_cuenta === empresa.tipo_cuenta'), true);

  // Sin comentarios: el que cuenta cómo era antes no es código.
  const webhook = fs.readFileSync('src/app/api/pagos/webhook/route.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('el webhook ya no convierte todo en pro',
    webhook.includes("=== 'negocio' ? 'negocio' : 'pro'") || webhook.includes("?? 'pro'"), false);
  ok('lee el plan con planDeMetadatos', (webhook.match(/planDeMetadatos\(objeto\)/g) || []).length, 2);
  ok('el webhook toma el estado de estadoDeStripe y corta si no hay uno',
    /const estado = estadoDeStripe\(tipo, objeto\);\s*if \(!estado\) \{/.test(webhook), true);
  ok('y ya no tiene el «si no, activa»', /:\s*'activa';/.test(webhook) || webhook.includes("?? 'active'"), false);

  // Vender en el celular: todo lo que se toca en la barra oscura, 44 px.
  const venta = fs.readFileSync('src/components/PantallaVenta.tsx', 'utf8');
  const barra = venta.slice(venta.indexOf('barra de cobro (celular)'), venta.indexOf('{detalleAbierto && ('));
  ok('la barra de cobro no tiene controles de menos de 44 px',
    (barra.match(/min-h-\[(\d+)px\]/g) || []).map((m) => Number(m.match(/\d+/)[0])).filter((n) => n < 44), []);
  ok('vaciar el carrito, 44 px', /onClick=\{onLimpiar\} className="[^"]*min-h-\[44px\]/.test(venta), true);
  ok('«Cambiar» de la moneda vista, 44 px',
    fs.readFileSync('src/components/AvisoMonedaVista.tsx', 'utf8').includes('min-h-[44px]'), true);
}

// --- La suscripción se cobra siempre en guaraníes (23/09) ---
// Bancard deja una sola moneda y Matías eligió guaraníes. El precio grande
// va en guaraníes, «≈ US$ 19» chico al lado (de las filas en dólares, que no
// se cobran), y se fue el selector Gs / US$. Sin comentarios en el código
// que se mira: el que cuenta cómo era antes no es código.
{
  const fs = require('fs');
  const sinComentarios = (ruta) => fs.readFileSync(ruta, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const precios = sinComentarios('src/lib/precios.ts');
  const plan = sinComentarios('src/app/(app)/plan/page.tsx');
  const portada = sinComentarios('src/app/page.tsx');
  const boton = sinComentarios('src/components/BotonPagar.tsx');
  const selector = sinComentarios('src/components/SelectorCobro.tsx');

  ok('monedaDeCobro() ya no depende del idioma ni de lo elegido: guaraníes',
    /export function monedaDeCobro\(\)[^{]*\{\s*return MONEDA_DE_LA_SUSCRIPCION;\s*\}/.test(precios)
    && /MONEDA_DE_LA_SUSCRIPCION = 'PYG'/.test(precios), true);
  ok('el botón de pagar manda PYG siempre y no recibe moneda',
    [boton.includes("MONEDA_DEL_COBRO = 'PYG'"), boton.includes('moneda: MONEDA_DEL_COBRO'),
      /moneda: string;/.test(boton)], [true, true, false]);
  ok('la pantalla de planes no pasa moneda al botón', /<BotonPagar[^>]*moneda=/.test(plan), false);
  ok('ni lee ?moneda= ni ofrece monedas',
    [plan.includes('searchParams.moneda'), plan.includes('MONEDAS_DE_COBRO'), portada.includes('searchParams'),
      portada.includes('MONEDAS_DE_COBRO'), portada.includes('?moneda=')], [false, false, false, false, false]);
  ok('el selector solo elige el período', [selector.includes("ir('moneda'"), selector.includes('monedas')], [false, false]);
  ok('la referencia en dólares sale de la fila del mismo plan y período',
    [plan.includes('precioDe(referencia, plan, periodo)'),
      /buscar\(referencia, x\.tipo_cuenta, x\.plan, x\.periodo\)/.test(portada)], [true, true]);
  ok('y solo si hay precio en guaraníes al lado', /referencia=\{precio && enDolares/.test(plan), true);
  ok('la línea de cómo se cobra, en las dos pantallas',
    [plan.includes('t.plan.cobroEnGuaranies'), portada.includes('t.plan.cobroEnGuaranies')], [true, true]);
  ok('el aviso de «los dólares son de referencia, se arregla por WhatsApp» se fue',
    portada.includes('preciosDolares'), false);

  // El servidor tampoco acepta otra moneda: un pedido armado a mano con
  // `moneda: 'USD'` (o sin moneda, que antes caía en dólares) cobraba en
  // dólares y dejaba `suscripciones.moneda = 'USD'`, y la comisión del socio
  // se calculaba sobre la lista en dólares.
  const checkoutSinComentarios = sinComentarios('src/app/api/pagos/checkout/route.ts');
  ok('el checkout cobra siempre en guaraníes e ignora la moneda del pedido',
    [checkoutSinComentarios.includes('const moneda = MONEDA_DE_LA_SUSCRIPCION;'),
      checkoutSinComentarios.includes('cuerpo?.moneda'), checkoutSinComentarios.includes("'USD'")],
    [true, false, false]);

  const es = require('fs').readFileSync('src/i18n/textos/es.ts', 'utf8');
  const pt = require('fs').readFileSync('src/i18n/textos/pt.ts', 'utf8');
  ok('la línea en español, como la dijo Matías',
    es.includes("cobroEnGuaranies: 'Se cobra en guaraníes. Si tu tarjeta es de otro país, tu banco lo convierte.'"), true);
  ok('y en portugués',
    pt.includes("cobroEnGuaranies: 'Cobrado em guaranis. Se o seu cartão for de outro país, o seu banco faz a conversão.'"), true);
  ok('la ayuda del agricultor, en los dos idiomas',
    [es.includes("monedaAgricultura: 'Si comprás los insumos y vendés el grano en dólares, elegí dólares. Si vendés en guaraníes al acopiador o en la feria, elegí guaraníes.'"),
      pt.includes("monedaAgricultura: 'Se você compra os insumos e vende o grão em dólares, escolha dólares. Se vende em guaranis para o cerealista ou na feira, escolha guaranis.'")],
    [true, true]);
}

// Las comprobaciones que esperan algo (una función async) se anotan en
// `pendientes` y el resumen las espera. Sin esto se imprimirían después del
// `process.exit` y una falla ahí no bajaría la bandera: pasaría inadvertida.
Promise.all(pendientes).then(() => {
  console.log(fallos === 0 ? '\n>>> TODAS LAS PRUEBAS PASARON' : `\n>>> ${fallos} FALLAS`);
  process.exit(fallos ? 1 : 0);
});
