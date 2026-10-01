/**
 * «Subir planilla» en Productos (122): cómo se lee la lista de productos de
 * un negocio, venga como venga.
 *
 * El corpus se arma cada vez, en una carpeta temporal, con el mismo generador
 * que lo describe (pruebas/planillas-catalogo/generar.js): las planillas de
 * verdad —el sistema de caja, la distribuidora con una hoja por rubro, la
 * casera con títulos y totales, el CSV del Excel en español, la de Google
 * Sheets con su hoja de ventas, 20.000 filas…— y para cada una lo que el
 * negocio quiso decir. De la 21 a la 29, las que encontró la revisión del
 * 01/10 (el registro de ventas con más filas que el catálogo, los EAN que
 * Excel pasó a 7,84E+12, los POS en inglés, «Precio x mayor», el precio sin
 * marca al lado del «c/IVA», el CSV en UTF-16, la categoría combinada a lo
 * ancho, los ceros a la izquierda, los montos negativos): cada una con TODOS
 * sus productos comparados, no solo los primeros. Cada archivo hace el camino de verdad: el .xlsx por
 * `leerXlsx` (como la ruta), en corto por JSON (como viaja al celular) y de
 * vuelta; el CSV por `libroDesdeCsv` (como lo lee el navegador). Después,
 * `leerCatalogo` y se compara: las hojas usadas, qué columna se tomó para
 * cada dato, cuántos productos, los primeros tal cual, los problemas y los
 * avisos.
 *
 * Y las protecciones: la zip bomba, el archivo enorme, el link que no es de
 * Google, la planilla de más de 30.000 filas y la respuesta que no entra.
 *
 * Variable CORPUS_DIR: usar un corpus ya armado (para mirar rápido).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const P = require('../.compilado/planilla.js');
const X = require('../.compilado/planilla-xlsx.js');
const G = require('../.compilado/enlace-sheets.js');
const C = require('../.compilado/catalogo-planilla.js');
const { generarCorpus } = require('./planillas-catalogo/generar.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real) ?? 'undefined', b = JSON.stringify(esperado) ?? 'undefined';
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a.length > 140 ? a.slice(0, 137) + '...' : a);
}

const OPCIONES_RUTA = { topes: P.TOPES_CATALOGO, ocultas: true, numeros: true };

/** El camino de verdad: el .xlsx como la ruta y de vuelta en corto; el CSV como el navegador. */
async function leerArchivo(ruta) {
  const bytes = new Uint8Array(fs.readFileSync(ruta));
  // Como ElegirPlanilla: .csv, .tsv y .txt se leen en el navegador.
  if (/\.(csv|tsv|txt)$/i.test(ruta)) return { libro: P.libroDesdeCsv(bytes, P.TOPES_CATALOGO), json: null };
  const libro = await X.leerXlsx(bytes, OPCIONES_RUTA);
  if (libro.error) throw new Error(`${path.basename(ruta)}: ${libro.error}`);
  const json = JSON.stringify({ libro: P.libroACompacto(libro) });
  return { libro: P.compactoALibro(JSON.parse(json).libro), json };
}

/** Lo que dice esperado.json de cada aviso: el código, antes de los dos puntos. */
const codigoDeAviso = (a) => a.split(':')[0].trim();
const sinOculta = (t) => t.replace(/\s*\(oculta\)$/, '');

/** El bloque principal usado (el de más filas). */
function principal(r) {
  return r.bloques.filter((b) => b.usado).sort((a, b) => b.filas - a.filas)[0];
}
const titulosDelMapeo = (b) => Object.fromEntries(Object.entries(b.mapeo).map(([campo, k]) => [campo, b.columnas[k].titulo]));

(async () => {
  const propia = !process.env.CORPUS_DIR;
  const dir = process.env.CORPUS_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'orden-corpus-'));
  let esperado;
  const t0 = Date.now();
  if (propia) {
    esperado = await generarCorpus(dir);
    fs.writeFileSync(path.join(dir, 'esperado.json'), JSON.stringify(esperado));
  } else {
    esperado = JSON.parse(fs.readFileSync(path.join(dir, 'esperado.json'), 'utf8'));
  }
  console.log(`corpus: ${esperado.length} planillas en ${Date.now() - t0} ms (${dir})`);

  try {
    // ═══════════════════════════════════════════════════════════
    console.log('\n── 1 · el corpus entero ──');
    // ═══════════════════════════════════════════════════════════
    const resultados = {};
    for (const e of esperado) {
      const { libro, json } = await leerArchivo(path.join(dir, e.archivo));
      const t = Date.now();
      const r = C.leerCatalogo(libro);
      const ms = Date.now() - t;
      resultados[e.archivo] = { r, libro, json, ms };
      const id = e.archivo.replace(/\.(xlsx|csv|txt)$/, '');

      ok(`${id} · hojas usadas`, r.hojas.filter((h) => h.usada).map((h) => h.nombre), e.hojas.usadas);
      ok(`${id} · ${e.productos} productos`, r.productos.length, e.productos);
      ok(`${id} · problemas`, {
        sin_nombre: r.problemas.sin_nombre.cuantos, sin_precio: r.problemas.sin_precio.cuantos,
        precio_menor_costo: r.problemas.precio_menor_costo.cuantos, repetidos: r.problemas.repetidos.cuantos,
        monto_invalido: r.problemas.monto_invalido.cuantos,
      }, { ...e.problemas, monto_invalido: e.problemas.monto_invalido ?? 0 });
      ok(`${id} · avisos`, r.avisos.map((a) => a.codigo).sort(), e.avisos.map(codigoDeAviso).sort());

      if (e.mapeo && !e.sinEncabezado && !e.bloques) {
        const esperadoMapeo = Object.fromEntries(Object.entries(e.mapeo).map(([k, v]) => [k, sinOculta(v)]));
        const real = titulosDelMapeo(principal(r));
        ok(`${id} · qué columna es cada dato`, Object.fromEntries(Object.keys(esperadoMapeo).sort().map((k) => [k, real[k] ?? null])),
          Object.fromEntries(Object.keys(esperadoMapeo).sort().map((k) => [k, esperadoMapeo[k]])));
        ok(`${id} · y nada más`, Object.keys(real).sort(), Object.keys(esperadoMapeo).sort());
      }
      if (e.primeros) {
        const campos = Object.keys(e.primeros[0]).filter((c) => c !== 'controla_stock');
        const comoNombre = id.startsWith('07') ? (n) => C.claveProducto(n) : (n) => n;
        const recorte = (p) => Object.fromEntries(campos.map((c) => [c, c === 'nombre' ? comoNombre(p[c]) : p[c] ?? null]));
        ok(`${id} · los primeros, tal cual`, r.productos.slice(0, e.primeros.length).map(recorte), e.primeros.map(recorte));
        if ('controla_stock' in e.primeros[0]) {
          ok(`${id} · servicio o producto`, r.productos.slice(0, e.primeros.length).map((p) => !p.servicio), e.primeros.map((p) => p.controla_stock));
        }
      }
      if (e.ignoradas) {
        const nombres = e.ignoradas.map((x) => x.split(' (')[0]);
        ok(`${id} · las columnas que no se usan se nombran`, nombres.filter((n) => !r.columnasNoUsadas.includes(n)), []);
      }
      // TODOS los productos, cada uno con lo suyo (21 a 29): el precio de cada
      // uno es el de venta, no el mayorista, ni el sin IVA, ni el de la venta.
      if (e.todos) {
        const campos = Object.keys(e.todos[0]);
        const recorte = (p) => JSON.stringify(Object.fromEntries(campos.map((c) => [c, p?.[c] ?? null])));
        const mal = r.productos.map((p, i) => [recorte(p), recorte(e.todos[i])]).filter(([a, b]) => a !== b);
        ok(`${id} · los ${e.todos.length}, cada uno con lo suyo (${campos.join(', ')})`,
          { cuantos: r.productos.length, mal: mal.length, primero: mal[0] ?? null }, { cuantos: e.todos.length, mal: 0, primero: null });
      }
    }

    // Lo que cada planilla tiene de particular.
    const R = (archivo) => resultados[archivo].r;
    ok('01 · el código EAN que llegó como número queda como texto, sin notación científica',
      R('01_caja_py_sistema.xlsx').productos.slice(0, 2).map((p) => p.codigo), ['7840001000073', '7840001000141']);
    ok('01 · los nombres en MAYÚSCULAS quedan como vienen; sin columna de categoría, ninguna',
      [R('01_caja_py_sistema.xlsx').productos[0].nombre, R('01_caja_py_sistema.xlsx').productos[0].categoria], ['GASEOSA COCA-COLA 500ML', null]);
    const r02 = R('02_distribuidora_varias_hojas.xlsx');
    ok('02 · la portada no es una lista; las tres hojas de rubro sí, con el mismo encabezado',
      r02.hojas.map((h) => [h.nombre, h.esCatalogo, h.usada]), [['Portada', false, false], ['Bebidas', true, true], ['Limpieza', true, true], ['Almacén', true, true]]);
    ok('02 · la categoría es el nombre de cada hoja', [...new Set(r02.productos.map((p) => p.categoria))], ['Bebidas', 'Limpieza', 'Almacén']);
    ok('02 · el precio mayorista se nombra como no usado', r02.avisos.find((a) => a.codigo === 'otro_precio_no_usado').columnas, ['Precio mayorista']);
    ok('02 · la unidad «UN» → un', [...new Set(r02.productos.map((p) => p.unidad))], ['un']);
    const r03 = R('03_casera_titulos_colores_totales.xlsx');
    ok('03 · los subtítulos BEBIDAS, LÁCTEOS, LIMPIEZA son la categoría, tal como están escritos',
      [...new Set(r03.productos.map((p) => p.categoria))], ['BEBIDAS', 'LÁCTEOS', 'LIMPIEZA']);
    ok('03 · el TOTAL y la nota del pie no son productos', [r03.descartadas.totales, r03.descartadas.notas >= 1, r03.productos.some((p) => /TOTAL|Actualizado/.test(p.nombre))], [1, true, false]);
    ok('04 · Windows-1252: «Azúcar» con tilde; coma decimal y puntos de miles',
      [R('04_csv_punto_y_coma_coma_decimal.csv').productos.some((p) => p.nombre.startsWith('Azúcar')), R('04_csv_punto_y_coma_coma_decimal.csv').productos[3].costo],
      [true, 11050.5]);
    ok('05 · «Gs. 15.000», «₲7.500.-», «15.000 Gs» y «12 un.»: todos enteros y bien',
      R('05_montos_con_gs.xlsx').productos.every((p) => Number.isInteger(p.costo) && Number.isInteger(p.precio) && p.costo > 999), true);
    const r07 = R('07_sin_codigo.xlsx');
    ok('07 · el espacio duro y los espacios de más salen del nombre', [r07.productos[1].nombre, r07.productos[3].nombre],
      ['Yerba Mate Pajarito 1kg', 'Yerba Kurupí Menta y Limón 1kg']);
    const r08 = R('08_codigos_repetidos.xlsx');
    const e08 = esperado.find((e) => e.archivo === '08_codigos_repetidos.xlsx');
    ok('08 · el repetido por código: queda el último (precio nuevo, stock 99)',
      r08.productos.filter((p) => p.codigo === e08.detalle.repetidos[0].codigo).map((p) => p.stock), [99]);
    ok('08 · los repetidos se listan con su fila', r08.problemas.repetidos.ejemplos.map((p) => p.fila), [4, 9]);
    ok('08 · el mismo nombre con otro código son dos productos', r08.productos.filter((p) => p.nombre === e08.detalle.mismoNombreOtroCodigo.nombre).length, 2);
    ok('09 · el precio es el RESULTADO de la fórmula', R('09_formulas_precio_costo_x13.xlsx').productos.every((p) => p.precio === Math.round(p.costo * 1.3 / 100) * 100), true);
    ok('09b · fórmulas sin calcular: el aviso nombra la columna', R('09b_formulas_sin_calcular.xlsx').avisos.find((a) => a.codigo === 'formulas_sin_calcular').columnas, ['Precio']);
    ok('09b · y las 20 quedan sin precio (no se crean)', R('09b_formulas_sin_calcular.xlsx').sinPrecio.length, 20);
    ok('10 · «R$ 1.234,56» y números con formato de reales', R('10_portugues.xlsx').productos.slice(0, 4).map((p) => p.precio), [17.15, 12.54, 5.23, 21.31]);
    const r12 = R('12_celdas_vacias_filas_basura.xlsx');
    ok('12 · «consultar», «s/p» y #N/A: sin precio, con lo que decía', r12.problemas.sin_precio.ejemplos.map((p) => p.valor ?? null), ['consultar', 's/p', null]);
    ok('12 · el precio menor al costo se carga igual (es un aviso)', [r12.problemas.precio_menor_costo.ejemplos[0].nombre, r12.productos.some((p) => p.nombre === 'Promo Pilsen + hielo')],
      ['Promo Pilsen + hielo', true]);
    ok('12 · «Item» (1, 2, 3) no es el nombre ni el código', principal(r12).mapeo.codigo, undefined);
    ok('12 · guiones, «x», «N/A» y «Total de artículos» no son productos',
      r12.productos.concat(r12.sinPrecio).filter((p) => /^(-|x|N\/A)$|Total/.test(p.nombre)).length, 0);
    const r13 = R('13_dos_tablas_misma_hoja.xlsx');
    const b13 = r13.bloques.filter((b) => b.usado);
    ok('13 · dos tablas lado a lado, cada una con su título como categoría',
      b13.map((b) => [b.titulo, b.filas, titulosDelMapeo(b)]),
      [['BEBIDAS', 12, { nombre: 'Producto', codigo: 'Código', precio: 'Precio', stock: 'Stock' }],
        ['ALMACÉN', 10, { nombre: 'Producto', codigo: 'Código', precio: 'Precio', stock: 'Stock' }]]);
    ok('13 · el «Resumen» de abajo no es una lista', r13.bloques.filter((b) => !b.esCatalogo).length >= 1 && !r13.productos.some((p) => /Bebidas|Almacén/.test(p.nombre)), true);
    const r14 = R('14_google_sheets_export.xlsx');
    ok('14 · la hoja «Ventas» es un registro: no se elige', r14.hojas.map((h) => [h.nombre, h.esCatalogo, h.usada]), [['Hoja 1', true, true], ['Ventas', false, false]]);
    const r15 = R('15_columnas_ocultas_y_filtro.xlsx');
    ok('15 · la columna de costo oculta se lee (y se marca), y las 18 filas del filtro se cargan avisando',
      [principal(r15).columnas[principal(r15).mapeo.costo].oculta, r15.avisos.find((a) => a.codigo === 'filas_ocultas')], [true, { codigo: 'filas_ocultas', cuantas: 18, incluidas: true }]);
    const r15b = C.leerCatalogo(resultados['15_columnas_ocultas_y_filtro.xlsx'].libro, { incluirOcultas: false });
    ok('15 · «dejarlas afuera»: 22 productos y el aviso lo dice', [r15b.productos.length, r15b.avisos.find((a) => a.codigo === 'filas_ocultas')],
      [22, { codigo: 'filas_ocultas', cuantas: 18, incluidas: false }]);
    ok('16 · «Precio» combinado sobre «Compra | Venta»', titulosDelMapeo(principal(R('16_encabezado_doble.xlsx'))),
      { nombre: 'Producto', codigo: 'Código', precio: 'Precio Venta', costo: 'Precio Compra', stock: 'Stock' });
    const b17 = principal(R('17_sin_encabezado.csv'));
    ok('17 · sin títulos, por lo que hay en cada columna (y la primera fila es un producto)',
      [b17.sinEncabezado, b17.mapeo, R('17_sin_encabezado.csv').productos[0].fila], [true, { codigo: 0, nombre: 1, precio: 3, costo: 2, stock: 4 }, 1]);
    ok('18 · «$1,234.50»: coma de miles y punto decimal', R('18_formato_us_comas.csv').productos.slice(0, 2).map((p) => [p.costo, p.precio]), [[425, 630], [1226, 1616]]);
    const r19 = principal(R('19_marca_proveedor_iva.xlsx'));
    ok('19 · con y sin IVA, se toma con IVA; «Rubro» gana a «Sub rubro»; «Mínimo» es el aviso de reponer',
      [r19.columnas[r19.mapeo.costo].titulo, r19.columnas[r19.mapeo.precio].titulo, r19.columnas[r19.mapeo.categoria].titulo, r19.columnas[r19.mapeo.stock_minimo].titulo],
      ['Costo c/IVA', 'Precio c/IVA', 'Rubro', 'Mínimo']);
    const r20 = R('20_barberia_servicios_y_productos.xlsx');
    ok('20 · una tabla de servicios y abajo otra de productos', r20.bloques.filter((b) => b.usado).map((b) => [b.servicio, b.filas]), [[true, 6], [false, 3]]);
    ok('20 · el servicio nace sin costo ni stock; el producto, con los suyos',
      [r20.productos[0].costo, r20.productos[0].stock, r20.productos[6].costo, r20.productos[6].stock], [null, null, 18000, 12]);
    ok('20 · «Duración» se nombra como no usada', r20.avisos.find((a) => a.codigo === 'datos_no_usados').columnas, ['Duración']);
    ok('20 · subida desde la pestaña de Servicios: lo mismo (el título manda)',
      C.leerCatalogo(resultados['20_barberia_servicios_y_productos.xlsx'].libro, { tipo: 'servicios' }).productos.map((p) => p.servicio),
      [true, true, true, true, true, true, false, false, false]);

    // ── Lo que encontró la revisión del 01/10 (21 a 29) ──
    const r21 = R('21_catalogo_y_ventas.xlsx');
    ok('21 · «Ventas» (300 filas, con precio) es un registro: se lee, pero por defecto se usa «Productos» (80)',
      r21.hojas.map((h) => [h.nombre, h.esCatalogo, h.usada]), [['Productos', true, true], ['Ventas', true, false]]);
    ok('21 · ni la categoría «Ventas» ni el stock de lo vendido', [r21.productos.some((p) => p.categoria === 'Ventas'), r21.productos[0].stock],
      [false, esperado.find((e) => e.archivo === '21_catalogo_y_ventas.xlsx').todos[0].stock]);
    const r21conVentas = C.leerCatalogo(resultados['21_catalogo_y_ventas.xlsx'].libro, { hojas: { Ventas: true } });
    const bVentas = r21conVentas.bloques.find((b) => b.hoja === 'Ventas');
    ok('21 · sumada con los chips: se usa, su «Cantidad» (lo vendido) no es el stock, y no le pone «Ventas» de categoría a nadie',
      [bVentas.usado, bVentas.mapeo.stock, titulosDelMapeo(bVentas).precio, [...new Set(r21conVentas.productos.map((p) => p.categoria))]], [true, undefined, 'Precio Unitario', [null]]);
    const r21b = R('21b_lista_y_ventas_con_cliente.xlsx');
    ok('21b · «Ventas Septiembre» (250, con Cliente y Precio) no gana a «Lista de precios» (200), y no la vuelve categoría',
      [r21b.hojas.map((h) => h.usada), [...new Set(r21b.productos.map((p) => p.categoria))]], [[true, false], [null]]);
    const unRegistro = P.libroDesdeCsv(new TextEncoder().encode(['Fecha;Producto;Cantidad;Precio', '01/09/2026;Coca-Cola 2L;3;13000', '02/09/2026;Pilsen lata;6;7000'].join('\n')), P.TOPES_CATALOGO);
    ok('un registro de ventas solo (no hay otra hoja): se lee igual, sin la cantidad vendida como stock',
      C.leerCatalogo(unRegistro).productos.map((p) => [p.nombre, p.precio, p.stock]), [['Coca-Cola 2L', 13000, null], ['Pilsen lata', 7000, null]]);
    const conVencimiento = P.libroDesdeCsv(new TextEncoder().encode(['Código;Producto;Stock;Fecha de vencimiento', 'A1;Amoxicilina 500;30;12/2027', 'A2;Ibuprofeno 400;12;03/2027'].join('\n')), P.TOPES_CATALOGO);
    ok('«Fecha de vencimiento» (la farmacia) no hace registro a una lista de stock', C.leerCatalogo(conVencimiento).sinPrecio.map((p) => [p.codigo, p.stock]), [['A1', 30], ['A2', 12]]);

    for (const archivo of ['22_ean_cientifico_excel.csv', '22b_ean_redondeado.xlsx', '22c_ean_texto_cientifico.xlsx']) {
      const r = R(archivo);
      ok(`${archivo.split('_')[0]} · los códigos que rompió Excel no se usan: 50 productos, ninguno con «7,84E+12», y el aviso lo dice`,
        [r.productos.length, r.productos.filter((p) => p.codigo !== null).length, r.avisos.find((a) => a.codigo === 'codigos_no_usados')],
        [50, 0, { codigo: 'codigos_no_usados', columnas: ['Código'], cientificos: true }]);
    }
    ok('22d · el EAN completo con formato científico sí se usa', R('22d_ean_formato_cientifico.xlsx').productos.slice(0, 2).map((p) => p.codigo),
      esperado.find((e) => e.archivo === '22d_ean_formato_cientifico.xlsx').todos.slice(0, 2).map((p) => p.codigo));
    const pocosCientificos = P.libroDesdeCsv(new TextEncoder().encode(['Código;Producto;Precio', '7840001000073;Coca-Cola 500ml;5000', '7,84E+12;Fanta 2L;12000', '7840001000141;Sprite 2L;11000'].join('\n')), P.TOPES_CATALOGO);
    const rPocos = C.leerCatalogo(pocosCientificos);
    ok('un «7,84E+12» suelto: ese no es código (se busca por el nombre), los demás sí, y se avisa',
      [rPocos.productos.map((p) => p.codigo), rPocos.avisos.find((a) => a.codigo === 'codigos_no_usados')?.cientificos],
      [['7840001000073', null, '7840001000141'], true]);
    const codRubro = P.libroDesdeCsv(new TextEncoder().encode(['Cód.;Producto;Precio', ...Array.from({ length: 12 }, (_, i) => `${i < 6 ? 'BEB' : 'ALM'};Producto ${i};${1000 + i}`)].join('\n')), P.TOPES_CATALOGO);
    const rRubro = C.leerCatalogo(codRubro);
    ok('una columna «Cód.» que es el mismo para toda la sección: no se usa (12 productos, no 2) y se avisa sin hablar de Excel',
      [rRubro.productos.length, rRubro.problemas.repetidos.cuantos, rRubro.avisos.find((a) => a.codigo === 'codigos_no_usados')], [12, 0, { codigo: 'codigos_no_usados', columnas: ['Cód.'], cientificos: false }]);
    const b22 = principal(R('22_ean_cientifico_excel.csv'));
    ok('elegida a mano, la columna de código se usa igual (el negocio decide; los «7,84E+12» no)',
      C.leerCatalogo(resultados['22_ean_cientifico_excel.csv'].libro, { mapeo: { [b22.firma]: { codigo: 0 } } }).productos.every((p) => p.codigo === null), true);

    ok('23 · «supply_price» y «Purchase Price» son el costo; «inventory_…» el stock; «reorder_point_…» el mínimo',
      [titulosDelMapeo(principal(R('23_pos_vend_export.csv'))), titulosDelMapeo(principal(R('23b_pos_purchase_sale.xlsx'))).costo],
      [{ nombre: 'name', codigo: 'sku', precio: 'retail_price', costo: 'supply_price', stock: 'inventory_Main_Outlet', stock_minimo: 'reorder_point_Main_Outlet', categoria: 'type' }, 'Purchase Price']);
    for (const [archivo, mayor] of [['23c_pos_wholesale_retail.xlsx', 'Wholesale Price'], ['24_precio_x_mayor.xlsx', 'Precio x Mayor'], ['24b_precio_mayor_menor.xlsx', 'Precio Mayor'], ['24c_precio_caja_unidad.xlsx', 'Precio Caja (x mayor)']]) {
      ok(`${archivo.split('_')[0]} · «${mayor}» es el mayorista: no es el precio, y se nombra`,
        R(archivo).avisos.find((a) => a.codigo === 'otro_precio_no_usado')?.columnas ?? null, [mayor]);
    }
    ok('25 · «Precio c/IVA» gana a «Precio Unitario» (sin marca), y el que no dice nada no se avisa como otro precio',
      [titulosDelMapeo(principal(R('25_iva_neto_y_final.xlsx'))).precio, R('25_iva_neto_y_final.xlsx').avisos.some((a) => a.codigo === 'otro_precio_no_usado')], ['Precio c/IVA', false]);
    ok('los títulos con y sin IVA', ['Precio c/IVA', 'Precio Final', 'Precio (IVA incl.)', 'Precio', 'Precio s/IVA', 'Costo con IVA', 'Costo neto'].map((t) => C.tituloDeColumna(t).prioridad), [0.5, 0.5, 0.5, 1, 2, 0.5, 2]);
    ok('los títulos en inglés de un POS', ['Purchase Price', 'supply_price', 'Buy Price', 'Sale Price', 'Wholesale Price', 'inventory_Main_Outlet', 'In Stock', 'Quantity on hand', 'Reorder point', 'Tax', 'Stock Value']
      .map((t) => { const x = C.tituloDeColumna(t); return x === 'nunca' ? 'nunca' : `${x.campo}${x.alterno ? '*' : ''}`; }),
    ['costo', 'costo', 'costo', 'precio', 'precio*', 'stock', 'stock', 'stock', 'stock_minimo', 'nunca', 'nunca']);
    ok('26 · el UTF-16 (con BOM, de los dos lados, y sin BOM): con sus tildes',
      ['26_utf16_punto_y_coma.csv', '26b_texto_unicode_excel.txt', '26c_utf16be.csv', '26d_utf16_sin_bom.csv'].map((a) => R(a).productos.some((p) => /[áéíóúñ]/i.test(p.nombre + p.categoria))), [true, true, true, true]);
    ok('27 · la fila combinada a lo ancho (sin negrita) es la categoría, y no una nota',
      [[...new Set(R('27_categoria_combinada.xlsx').productos.map((p) => p.categoria))], R('27_categoria_combinada.xlsx').descartadas], [['Bebidas', 'Almacén'], { titulos: 2, totales: 0, notas: 0 }]);
    ok('28 · el código con formato «000000» llega con sus ceros, como lo ve el negocio',
      R('28_codigos_con_ceros.xlsx').productos.slice(0, 3).map((p) => p.codigo), ['000005', '000042', '000079']);
    ok('28 · 000005 y 5 son el mismo en la planilla (como en la base): queda el de más abajo',
      C.leerCatalogo(P.libroDesdeCsv(new TextEncoder().encode(['Código;Producto;Precio', '000005;Yerba 500g;11000', '5;Yerba Pajarito 500g;11500'].join('\n')), P.TOPES_CATALOGO)).productos.map((p) => [p.codigo, p.precio]), [['5', 11500]]);
    const r29 = R('29_montos_que_la_base_no_acepta.csv');
    ok('29 · el precio negativo, el costo negativo y el de 13 cifras no se cargan, y se dicen con su fila y lo que decía',
      r29.problemas.monto_invalido.ejemplos.map((p) => [p.fila, p.nombre, p.valor]),
      [[8, 'Envase retornable 1L', '-1500'], [14, 'Ajuste de inventario', '-200'], [20, 'Fila con el código en el precio', '7840009999999']]);
    ok('29 · y ninguno de los que se mandan a guardar tiene un monto que la base no acepta',
      r29.productos.every((p) => p.precio >= 0 && p.precio < 1e12 && (p.costo ?? 0) >= 0 && Math.abs(p.stock ?? 0) < 1e12), true);

    // Las 20.000.
    const x11 = resultados['11_veinte_mil_filas.xlsx'];
    ok('11 · 20.000 filas: la respuesta en corto pesa menos de 3 MB (Vercel corta en 4,5)', x11.json.length < 3 * 1024 * 1024, true);
    console.log(`     (en corto: ${(x11.json.length / 1024 / 1024).toFixed(2)} MB; leer el catálogo: ${x11.ms} ms; el CSV: ${resultados['11b_veinte_mil_filas.csv'].ms} ms)`);
    ok('11 · y entenderlas no tarda (menos de 3 s, en el celular más lento sería poco más)', x11.ms < 3000, true);
    ok('11 · el xlsx y el CSV dicen lo mismo', JSON.stringify(x11.r.productos.map((p) => [p.codigo, p.nombre, p.categoria, p.costo, p.precio, p.stock]))
      === JSON.stringify(resultados['11b_veinte_mil_filas.csv'].r.productos.map((p) => [p.codigo, p.nombre, p.categoria, p.costo, p.precio, p.stock])), true);
    ok('11 · en tandas de 1.000: 20 tandas', Math.ceil(x11.r.productos.length / C.TANDA_IMPORTAR), 20);

    // Cambiar la columna a mano (la revisión).
    const b02 = principal(r02);
    const aMano = C.leerCatalogo(resultados['02_distribuidora_varias_hojas.xlsx'].libro, { mapeo: { [b02.firma]: { precio: 5 } } });
    ok('cambiar a mano: «Precio mayorista» como precio, en las tres hojas (mismo encabezado)',
      [aMano.productos[0].precio, aMano.productos.length, aMano.avisos.find((a) => a.codigo === 'otro_precio_no_usado')?.columnas ?? null], [14900, 63, null]);
    const sinCosto = C.leerCatalogo(resultados['02_distribuidora_varias_hojas.xlsx'].libro, { mapeo: { [b02.firma]: { costo: null } } });
    ok('cambiar a mano: «no está en la planilla» saca el costo', [sinCosto.productos[0].costo, sinCosto.avisos.some((a) => a.codigo === 'sin_costo')], [null, true]);
    ok('sacar una hoja con los chips', C.leerCatalogo(resultados['02_distribuidora_varias_hojas.xlsx'].libro, { hojas: { Limpieza: false } }).productos.length, 52);
    ok('sumar la hoja «Ventas» no la vuelve una lista', C.leerCatalogo(resultados['14_google_sheets_export.xlsx'].libro, { hojas: { Ventas: true } }).productos.length, 60);

    // ═══════════════════════════════════════════════════════════
    console.log('\n── 2 · los montos y el nombre para comparar ──');
    // ═══════════════════════════════════════════════════════════
    const NBSP = String.fromCharCode(0xa0);
    const montos = [
      ['Gs. 15.000', undefined, 15000], ['₲ 7.500', undefined, 7500], ['15.000 Gs', undefined, 15000], ['Gs15.000', undefined, 15000],
      ['₲7.500.-', undefined, 7500], ['12 un.', undefined, 12], ['R$ 12,50', undefined, 12.5], ['$1,234.50', undefined, 1234.5],
      ['1.234,56', undefined, 1234.56], ['15.000,50', undefined, 15000.5], ['15,000.50', undefined, 15000.5], ['0,500', undefined, 0.5],
      ['1.234.567', undefined, 1234567], ['12,5', undefined, 12.5], ['850', undefined, 850], [`Gs.${NBSP}25.000`, undefined, 25000],
      ['1.250', ',', 1250], ['1,250', ',', 1.25], ['1,250', '.', 1250], ['1.250', '.', 1.25], ['-1.500', undefined, -1500],
      ['consultar', undefined, null], ['s/p', undefined, null], ['N/A', undefined, null], ['-', undefined, null], ['#N/A', undefined, null],
      ['', undefined, null], ['2x1', undefined, null], ['23,04%', undefined, null], [1234.567, undefined, 1234.57], [12.5, ',', 12.5],
    ];
    ok('leerMonto: la tabla entera', montos.map(([v, d]) => C.leerMonto(v, d)), montos.map((m) => m[2]));
    ok('el separador de una columna', [C.separadorDeColumna(['13100,50', '19200']), C.separadorDeColumna(['$1,226.00', '$425.00']),
      C.separadorDeColumna(['15.000', '7.500']), C.separadorDeColumna(['1.234.567'])], [',', '.', null, ',']);
    const frases = ['  Yerba  Mate  PAJARITO 1kg ', 'Azúcar Azpa 1kg', `Yerba Kurupí Menta y Limón 1kg${NBSP}`,
      `Coca${String.fromCharCode(0x200b)}Cola`, 'Ñandutí Pão', 'CAFÉ AÇÚCAR ÜBER'];
    ok('claveProducto', frases.map(C.claveProducto), ['yerba mate pajarito 1kg', 'azucar azpa 1kg', 'yerba kurupi menta y limon 1kg', 'cocacola', 'ñanduti pao', 'cafe açucar uber']);
    ok('los títulos: lo que nunca es precio', ['Total', 'Ganancia', 'Margen %', '% IVA', 'IVA', 'Valor en stock', 'Total invertido', 'Marca', 'Proveedor', 'Activo', 'Fecha', 'N°']
      .map((t) => C.tituloDeColumna(t)), Array(12).fill('nunca'));
    ok('los títulos en tres idiomas', ['Descripción', 'Produto', 'Item', 'Cód.', 'SKU', 'Código de barras', 'Precio de compra', 'Custo', 'PVP', 'Preço de venda', 'Price', 'Qtd', 'Estoque', 'Existencia', 'Stock mínimo', 'Rubro', 'Familia', 'U.M.']
      .map((t) => C.tituloDeColumna(t).campo),
    ['nombre', 'nombre', 'nombre', 'codigo', 'codigo', 'codigo', 'costo', 'costo', 'precio', 'precio', 'precio', 'stock', 'stock', 'stock', 'stock_minimo', 'categoria', 'categoria', 'unidad']);

    // ═══════════════════════════════════════════════════════════
    console.log('\n── 3 · las protecciones ──');
    // ═══════════════════════════════════════════════════════════
    // La zip bomba que miente: el directorio dice 1000 bytes y adentro hay 120 MB de ceros.
    const cerosComprimidos = async (mb) => {
      const d = zlib.createDeflateRaw({ level: 9 });
      const partes = [];
      d.on('data', (p) => partes.push(p));
      const fin = new Promise((listo) => d.on('end', listo));
      const mega = Buffer.alloc(1024 * 1024);
      for (let i = 0; i < mb; i++) if (!d.write(mega)) await new Promise((listo) => d.once('drain', listo));
      d.end();
      await fin;
      return Buffer.concat(partes);
    };
    const zipAMano = (entradas) => {
      const locales = [], centrales = [];
      let desplazamiento = 0;
      for (const e of entradas) {
        const nombre = Buffer.from(e.nombre);
        const l = Buffer.alloc(30);
        l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(e.metodo, 8);
        l.writeUInt32LE(e.datos.length, 18); l.writeUInt32LE(e.declarado, 22); l.writeUInt16LE(nombre.length, 26);
        locales.push(l, nombre, e.datos);
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(e.metodo, 10);
        c.writeUInt32LE(e.datos.length, 20); c.writeUInt32LE(e.declarado, 24); c.writeUInt16LE(nombre.length, 28); c.writeUInt32LE(desplazamiento, 42);
        centrales.push(c, nombre);
        desplazamiento += 30 + nombre.length + e.datos.length;
      }
      const directorio = Buffer.concat(centrales);
      const fin = Buffer.alloc(22);
      fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
      fin.writeUInt32LE(directorio.length, 12); fin.writeUInt32LE(desplazamiento, 16);
      return new Uint8Array(Buffer.concat([...locales, directorio, fin]));
    };
    const XLSX = require('exceljs/lib/xlsx/xlsx.js');
    let aperturas = 0;
    const cargar = XLSX.prototype.load;
    XLSX.prototype.load = function (...a) { aperturas++; return cargar.apply(this, a); };
    const libroXml = Buffer.from('<workbook/>');
    const bomba = zipAMano([
      { nombre: 'xl/workbook.xml', metodo: 0, datos: libroXml, declarado: libroXml.length },
      { nombre: 'xl/worksheets/sheet1.xml', metodo: 8, datos: await cerosComprimidos(120), declarado: 1000 },
    ]);
    ok('la zip bomba que miente (120 MB de verdad, 1 KB declarado), con los topes de productos: no se abre',
      [bomba.length < P.TOPES_CATALOGO.bytes, await X.leerXlsx(bomba, OPCIONES_RUTA), aperturas], [true, { error: 'no_es_planilla' }, 0]);
    const declarada = zipAMano([
      { nombre: 'xl/workbook.xml', metodo: 0, datos: libroXml, declarado: 41 * 1024 * 1024 },
    ]);
    ok('la que declara más de 40 MB, tampoco', await X.leerXlsx(declarada, OPCIONES_RUTA), { error: 'no_es_planilla' });
    const enorme = new Uint8Array(P.TOPES_CATALOGO.bytes + 1);
    enorme.set([0x50, 0x4b, 0x03, 0x04]);
    ok('un archivo de más de 4 MB: muy_grande, sin abrirlo', [await X.leerXlsx(enorme, OPCIONES_RUTA), aperturas], [{ error: 'muy_grande' }, 0]);
    XLSX.prototype.load = cargar;
    ok('un .xls viejo: xls_viejo', await X.leerXlsx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, ...new Array(600).fill(0)]), OPCIONES_RUTA), { error: 'xls_viejo' });
    ok('un link que no es de Google no se pide', ['https://evil.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123/edit', 'https://docs.google.com.evil.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123/edit',
      'http://127.0.0.1:8080/x.xlsx', 'file:///etc/passwd'].map((u) => G.exportDeSheets(u)), Array(4).fill({ error: 'enlace_invalido' }));
    let pedidos = 0;
    ok('y bajarDeGoogle tampoco pide a otro host', [await G.bajarDeGoogle('https://evil.com/x.xlsx', async () => { pedidos++; return new Response('x'); }), pedidos],
      [{ error: 'enlace_invalido' }, 0]);
    ok('los topes de productos', P.TOPES_CATALOGO, { bytes: 4194304, hojas: 20, filas: 30000, columnas: 40, descomprimido: 41943040, filasEnTotal: 30000 });
    ok('los de la rutina no cambiaron', P.TOPES_PLANILLA, { bytes: 4194304, hojas: 20, filas: 500, columnas: 40, descomprimido: 41943040 });

    // Más de 30.000 filas: se leen las primeras y se avisa.
    const muchas = ['Código;Producto;Precio'];
    for (let i = 0; i < 30500; i++) muchas.push(`C${i};Producto ${i};${1000 + i}`);
    const csvLargo = P.libroDesdeCsv(new TextEncoder().encode(muchas.join('\n')), P.TOPES_CATALOGO);
    const rLargo = C.leerCatalogo(csvLargo);
    ok('un CSV de 30.501 filas: se leen 30.000 y se avisa', [csvLargo.hojas[0].recortada, rLargo.productos.length, rLargo.avisos.some((a) => a.codigo === 'recortada')], [true, 29999, true]);
    // La respuesta que no entra: se cortan las filas del final, avisando.
    const pesado = { hojas: [{ nombre: 'Lista', filas: Array.from({ length: 3000 }, (_, i) => [{ texto: `Producto ${i} ${'x'.repeat(200)}` }, { texto: '1', numero: 1000 + i }]) }] };
    const corto = P.libroACompacto(pesado, 200 * 1024);
    ok('en corto, si no entra en el tope: las filas del final afuera y la hoja recortada',
      [JSON.stringify(corto).length <= 200 * 1024, corto.hojas[0].recortada, corto.hojas[0].filas.length < 3000, corto.hojas[0].filas.length > 500], [true, true, true, true]);
    ok('el corto de vuelta: el número tal cual, la negrita y la fórmula sin calcular',
      P.compactoALibro({ v: 1, hojas: [{ nombre: 'H', filas: [['BEBIDAS'], ['Coca', 1234.567, false]], negrita: [0] }] }).hojas[0].filas,
      [[{ texto: 'BEBIDAS', negrita: true }], [{ texto: 'Coca' }, { texto: '1234,567', numero: 1234.567 }, { texto: '', sinCalcular: true }]]);
    ok('algo que no tiene forma de libro: null', [P.compactoALibro(null), P.compactoALibro({ hojas: [] }), P.compactoALibro({ v: 1, hojas: [{ nombre: 'x' }] })], [null, null, null]);

    // ═══════════════════════════════════════════════════════════
    console.log('\n── 3b · lo que mostró la verificación visual (01/10) ──');
    // ═══════════════════════════════════════════════════════════
    // «Precio» es lo que paga el kiosco (la lista del proveedor) y «Venta» lo
    // que cobra: se toma «Precio» (es el primero), pero «Venta» no se calla en
    // un «No usamos» gris: tiene su aviso, para elegirla arriba.
    const precioVenta = P.libroDesdeCsv(new TextEncoder().encode(['Producto;Precio;Venta;Stock', 'Galletitas rellenas 120 g;3.200;4.500;96', 'Alfajor de chocolate;2.100;3.500;60', 'Chicle x20;18.500;25.000;8'].join('\n')), P.TOPES_CATALOGO);
    const rPV = C.leerCatalogo(precioVenta);
    ok('«Precio | Venta»: se toma «Precio» y «Venta» se avisa como otro precio',
      [rPV.productos[0].precio, rPV.avisos.find((a) => a.codigo === 'otro_precio_no_usado')?.columnas ?? null], [3200, ['Venta']]);
    const firmaPV = rPV.bloques[0].firma;
    const rPVaMano = C.leerCatalogo(precioVenta, { mapeo: { [firmaPV]: { precio: 2, costo: 1 } } });
    ok('corregido a mano (precio = Venta, costo = Precio): los montos bien y ya no se avisa',
      [rPVaMano.productos[0].precio, rPVaMano.productos[0].costo, rPVaMano.avisos.some((a) => a.codigo === 'otro_precio_no_usado' || a.codigo === 'sin_costo')], [4500, 3200, false]);
    const problemas = P.libroDesdeCsv(new TextEncoder().encode(['Código;Producto;Costo;Precio',
      '1001;Coca-Cola 2 L;9.800;13.000', '1002;Leche en polvo 400 g;32.000;29.000', '1003;Arroz 1 kg;6.900;9.500', '1001;Coca-Cola 2 L retornable;8.900;12.000'].join('\n')), P.TOPES_CATALOGO);
    const rProb = C.leerCatalogo(problemas);
    ok('precio menor al costo: la fila lleva los dos montos, para verlo sin abrir la planilla',
      rProb.problemas.precio_menor_costo.ejemplos, [{ fila: 3, hoja: rProb.problemas.precio_menor_costo.ejemplos[0].hoja, nombre: 'Leche en polvo 400 g', costo: 32000, precio: 29000 }]);
    ok('repetido: la fila dice cuál queda (la de más abajo)',
      rProb.problemas.repetidos.ejemplos.map((p) => [p.fila, p.nombre, p.queda.fila]), [[2, 'Coca-Cola 2 L', 5]]);
    // Los textos del resumen, con su singular (antes: «1 nuevos, 0 actualizados y 0 sin cambios»).
    const ts = require('typescript');
    const cargarTs = (r) => {
      const m = { exports: {} };
      new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', r), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
      return m.exports;
    };
    const TP = cargarTs('src/i18n/textos/planilla-productos.ts');
    const miles = (x) => x.toLocaleString('es-PY').replace(/,/g, '.');
    ok('el resumen al terminar: solo lo que pasó, con su singular (es y pt)', [
      TP.planillaProductosEs.resumen({ creados: 4796, actualizados: 201, sin_cambios: 3 }, miles),
      TP.planillaProductosEs.resumen({ creados: 1, actualizados: 0, sin_cambios: 0 }, miles),
      TP.planillaProductosEs.resumen({ creados: 0, actualizados: 1, sin_cambios: 2 }, miles),
      TP.planillaProductosEs.resumen({ creados: 0, actualizados: 0, sin_cambios: 0 }, miles),
      TP.planillaProductosPt.resumen({ creados: 12, actualizados: 1, sin_cambios: 0 }, miles),
    ], ['4.796 nuevos, 201 actualizados y 3 sin cambios.', '1 nuevo.', '1 actualizado y 2 sin cambios.', 'No hubo cambios.', '12 novos e 1 atualizado.']);
    ok('«se actualizan 0» no se dice: todos nuevos, o todos ya estaban',
      [TP.planillaProductosEs.todosNuevos(15, '15'), TP.planillaProductosEs.todosExisten(36, '36'), TP.planillaProductosPt.todosNuevos(15, '15')],
      ['Todos son nuevos: se crean 15', 'Ya los tenés todos: se actualizan 36', 'Todos são novos: criam-se 15']);

    // ═══════════════════════════════════════════════════════════
    console.log('\n── 4 · lo que se comprueba leyendo el código ──');
    // ═══════════════════════════════════════════════════════════
    const raiz = path.join(__dirname, '..');
    const leerFuente = (r) => fs.readFileSync(path.join(raiz, r), 'utf8').replace(/\r\n/g, '\n');
    const fuente = leerFuente('src/lib/catalogo-planilla.ts');
    ok('el intérprete es puro: solo importa planilla.ts y la regla del código (que no importa nada)',
      [[...fuente.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), /^import /m.test(leerFuente('src/lib/codigo-producto.ts'))], [['./codigo-producto', './planilla'], false]);
    ok('sin caracteres invisibles pegados en la fuente (se escriben con fromCharCode)',
      [...fuente].filter((ch) => [0xa0, 0x2007, 0x202f, 0x200b, 0x2060, 0xfeff].includes(ch.codePointAt(0))).length, 0);
    const sql = leerFuente('supabase/migrations/122_productos_desde_planilla.sql');
    const enSql = /translate\(coalesce\(p_nombre, ''\),\s*'([^']+)'[\s\S]*?'([^']+)'/.exec(sql);
    ok('la clave de la base saca las mismas tildes que la de acá', enSql && [enSql[1], enSql[2].slice(0, enSql[1].length)], [
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜáàâãäéèêëíìîïóòôõöúùûüÑÇ', 'AAAAAEEEEIIIIOOOOOUUUUaaaaaeeeeiiiiooooouuuuñç']);
    ok('y la tanda es la misma', /select 1000/.test(sql) && C.TANDA_IMPORTAR === 1000, true);
    ok('la migración no lleva \\u ni caracteres invisibles pegados (113: se escriben con chr())',
      [/\\u[0-9a-f]{4}/i.test(sql), [...sql].some((ch) => [0xa0, 0x2007, 0x202f, 0x200b, 0x2060, 0xfeff].includes(ch.codePointAt(0)))], [false, false]);

    const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
    const recorrer = (dir) => fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })
      .flatMap((d) => (d.isDirectory() ? recorrer(`${dir}/${d.name}`) : /\.(tsx?|js)$/.test(d.name) ? [`${dir}/${d.name}`] : []));
    ok('el navegador no se lleva exceljs ni el ayudante del servidor',
      recorrer('src/components').filter((a) => /planilla-del-pedido|planilla-xlsx|from ['"]exceljs['"]/.test(leerFuente(a))), []);
    const subir = sinComentarios(leerFuente('src/components/productos/SubirPlanilla.tsx'));
    ok('«Subir planilla»: la ventana de siempre, elegir compartido, la ruta y los topes de productos, en corto',
      [/<Hoja\b/.test(subir), /fixed inset-0/.test(subir), /<ElegirPlanilla/.test(subir), /'\/api\/productos\/planilla'/.test(subir),
        /topes=\{TOPES_CATALOGO\}/.test(subir), /leerRespuesta=\{compactoALibro\}/.test(subir)], [true, false, true, true, true, true]);
    ok('revisa con leerCatalogo y coteja en tandas de 5.000 antes de guardar',
      [/leerCatalogo\(libro, \{ hojas, mapeo, incluirOcultas, tipo \}\)/.test(subir), /rpc\('cotejar_productos'/.test(subir), /TANDA_COTEJAR/.test(subir)], [true, true, true]);
    ok('guarda directo en la base, por tandas de 1.000, con la barra y «seguir desde ahí»',
      [/rpc\('importar_productos'/.test(subir), /i \+= TANDA_IMPORTAR/.test(subir), /role="progressbar"/.test(subir),
        /guardar\(paso\.hechas, paso\.resumen\)/.test(subir), /beforeunload/.test(subir), /fetch\(/.test(subir)], [true, true, true, true, true, false]);
    const revision = sinComentarios(leerFuente('src/components/productos/RevisionCatalogo.tsx'));
    ok('la revisión: chips de hojas compartidos, qué es cada columna con su selector, problemas y los primeros',
      [/<ChipsDeHojas/.test(revision), /<select/.test(revision), /onMapeo\(b\.firma, campo/.test(revision), /<Problema/.test(revision), /slice\(0, 20\)/.test(revision)],
      [true, true, true, true, true]);
    ok('sin blanco opaco ni dark: en lo nuevo',
      ['src/components/productos/SubirPlanilla.tsx', 'src/components/productos/RevisionCatalogo.tsx', 'src/components/planilla/ElegirPlanilla.tsx', 'src/components/planilla/ChipsDeHojas.tsx']
        .filter((a) => /\bbg-white(?!\/)|\bdark:/.test(leerFuente(a))), []);
    const pantalla = sinComentarios(leerFuente('src/components/PantallaProductos.tsx'));
    ok('Productos: el botón, el vacío, ?subir=1, el código en el diálogo y la tabla de a 100',
      [/<SubirPlanilla/.test(pantalla), /t\.productos\.planilla\.vacioSubir/.test(pantalla), /get\('subir'\) === '1'/.test(pantalla),
        /codigo: b\.codigo\.trim\(\)\.slice\(0, 60\) \|\| null/.test(pantalla), /productos_codigo_unico/.test(pantalla), /visibles\.slice\(0, limite\)/.test(pantalla)],
      [true, true, true, true, true, true]);
    const venta = sinComentarios(leerFuente('src/components/PantallaVenta.tsx'));
    ok('Vender: busca por código, el lector de barras va al carrito, de a 60 tarjetas, y el vacío lleva a subir',
      [/\(p\.codigo \?\? ''\)\.toLowerCase\(\)\.includes\(q\)/.test(venta), /alEnterEnBusqueda\(\)/.test(venta), /visibles\.slice\(0, TARJETAS_POR_VEZ\)/.test(venta),
        /href="\/productos\?subir=1"/.test(venta)], [true, true, true, true]);
    ok('los textos, montados en es y pt',
      [leerFuente('src/i18n/textos/es.ts').includes('planilla: planillaProductosEs,'), leerFuente('src/i18n/textos/pt.ts').includes('planilla: planillaProductosPt,'),
        leerFuente('src/i18n/textos/es.ts').includes('planilla: planillaEs,'), leerFuente('src/i18n/textos/pt.ts').includes('planilla: planillaPt,')], [true, true, true, true]);
    // Lo de la revisión del 01/10.
    ok('la revisión muestra los montos que no se cargan, lo que trae el código de otro y los códigos rotos (con su columna fuera de «No usamos»)',
      [/resultado\.problemas\.monto_invalido/.test(revision), /cotejo\.codigoDeOtro/.test(revision), /case 'codigos_no_usados'/.test(revision),
        /a\.codigo === 'codigos_no_usados' \? a\.columnas/.test(revision)], [true, true, true, true]);
    ok('lo que trae el código de otro producto no se manda a guardar (como lo del otro tipo)',
      [/NO_SE_TOCA[^\n]*'codigo_de_otro'/.test(subir), /!NO_SE_TOCA\.includes\(estados\.get\(claveDeFila\(f\)\)\)/.test(subir)], [true, true]);
    ok('Vender: el lector de barras encuentra el código sin mirar los ceros de adelante',
      [/import \{ codigoSinCeros \} from '@\/lib\/codigo-producto'/.test(venta), /productos\.filter\(\(p\) => mismoCodigo\(p\.codigo, qCodigo\)\)/.test(venta)], [true, true]);
    const CP = require('../.compilado/codigo-producto.js');
    ok('codigoSinCeros: los ceros de adelante de un código de solo cifras no cuentan; con letras, tal cual',
      ['000123', '123', '0012345678905', '0', '000', 'BEB-001', '00A1', ' 0042 '].map(CP.codigoSinCeros), ['123', '123', '12345678905', '0', '0', 'BEB-001', '00A1', '42']);
    ok('los textos nuevos, en es y pt', [TP.planillaProductosEs, TP.planillaProductosPt].map((x) => [
      x.problemas.montoInvalido(2, '2'), x.problemas.codigoDeOtro(1, '1'), x.motivos.codigo_de_otro, x.avisos.codigosCientificos('«Código»').includes('7,79E+12'), x.avisos.codigosRepetidos('').length > 20]), [
      ['2 con un monto negativo o demasiado grande: no se cargan.', '1 trae el código de otro producto que ya tenés: no se toca ninguno de los dos.', 'su código es de otro producto', true, true],
      ['2 com um valor negativo ou grande demais: não são cadastrados.', '1 traz o código de outro produto que você já tem: nenhum dos dois é mexido.', 'o código é de outro produto', true, true]]);
    const legal = leerFuente('src/i18n/textos/legal.ts');
    ok('la privacidad dice que la lista de productos también se lee y se descarta (es y pt)',
      [legal.includes('Si subís tu lista de productos en una planilla'), legal.includes('Se você envia sua lista de produtos numa planilha')], [true, true]);
  } finally {
    if (propia) fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(fallos === 0 ? `\n>>> TODAS LAS PRUEBAS PASARON (${corridas} comprobaciones)` : `\n>>> ${fallos} DE ${corridas} FALLARON`);
  process.exit(fallos > 0 ? 1 : 0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
