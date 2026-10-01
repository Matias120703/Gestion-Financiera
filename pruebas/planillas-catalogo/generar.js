/**
 * CORPUS DE PLANILLAS DE PRODUCTOS (122, 01/10/2026) para «Subir planilla»
 * en Productos.
 *
 * Arma, con exceljs (el mismo que usa el servidor), las planillas que un
 * negocio de verdad tiene: la exportación del sistema de caja, la lista de la
 * distribuidora, la planilla casera con títulos y totales, el CSV del Excel en
 * español, la de Google Sheets... Y para cada una dice QUÉ DEBERÍA SALIR: qué
 * hojas se usan, qué columna es cada dato, cuántos productos, los primeros
 * tal cual, los problemas y los avisos.
 *
 * La verdad sale de los mismos datos con que se arma cada archivo (no de leer
 * el archivo): la prueba compara contra lo que el negocio quiso decir y no
 * contra lo que el lector entendió.
 *
 * Los archivos NO están en el repo: pruebas/catalogo-planilla.test.js los
 * arma en una carpeta temporal cada vez (`generarCorpus(carpeta)`), y los
 * borra al terminar. Suelto: `node pruebas/planillas-catalogo/generar.js
 * <carpeta>` los deja ahí, con esperado.json, para abrirlos en Excel.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

let SALIDA = '';

// ───────────────────────────── datos ─────────────────────────────

/** Un generador con semilla: el corpus sale igual cada vez. */
function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** EAN-13 con su dígito verificador, con el prefijo de Paraguay (784). */
function ean13(n) {
  const base = `784${String(n).padStart(9, '0')}`.slice(0, 12);
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(base[i]) * (i % 2 ? 3 : 1);
  return base + ((10 - (suma % 10)) % 10);
}

const redondear = (n, a = 100) => Math.round(n / a) * a;

/** Lo que vende un almacén paraguayo, por rubro. */
const CATALOGO = {
  Bebidas: [
    ['Gaseosa Coca-Cola', ['500ml', '1,5L', '2L', '3L']], ['Gaseosa Pulp Naranja', ['500ml', '2L']],
    ['Gaseosa Guaraná Brahma', ['600ml', '2L']], ['Agua mineral La Fuente', ['500ml', '2L', '6L']],
    ['Cerveza Pilsen', ['lata 350ml', '1L']], ['Cerveza Munich', ['lata 350ml', '1L']],
    ['Cerveza Brahma', ['lata 350ml', '1L']], ['Jugo Watts Durazno', ['1L']], ['Energizante Speed', ['250ml']],
    ['Vino Santa Helena Tinto', ['750ml']], ['Caña Aristócrata', ['1L']], ['Sidra Real', ['750ml']],
  ],
  Almacén: [
    ['Yerba Mate Pajarito', ['500g', '1kg']], ['Yerba Kurupí Menta y Limón', ['500g', '1kg']],
    ['Yerba Selecta Tradicional', ['500g', '1kg']], ['Arroz Tío Jorge', ['1kg', '5kg']],
    ['Fideo Don Vittorio Tallarín', ['500g']], ['Fideo Don Vittorio Coditos', ['500g']],
    ['Azúcar Azpa', ['1kg', '2kg']], ['Aceite de soja Primor', ['900ml', '1,5L']], ['Harina Santa Lucía 000', ['1kg']],
    ['Poroto Rojo', ['500g']], ['Locro Blanco', ['500g']], ['Sal fina Bahía', ['1kg']],
    ['Galletitas Tentación Chocolate', ['130g']], ['Galletas de agua Sol', ['400g']],
    ['Café Tres Corazones', ['250g']], ['Mermelada Arcor Durazno', ['454g']],
  ],
  Lácteos: [
    ['Leche Trébol Entera', ['1L']], ['Leche Lactolanda Descremada', ['1L']], ['Yogur Trébol Frutilla', ['1L', '180g']],
    ['Queso Paraguay', ['por kg']], ['Manteca Lactolanda', ['200g']], ['Dulce de leche Trébol', ['500g']],
  ],
  Limpieza: [
    ['Jabón en polvo Ala', ['800g', '3kg']], ['Detergente Cif Limón', ['750ml']], ['Lavandina Ayudín', ['1L', '2L']],
    ['Papel higiénico Higienol', ['x4', 'x12']], ['Esponja Mortimer', ['x3']], ['Desodorante de ambiente Glade', ['360ml']],
  ],
  Fiambrería: [
    ['Jamón cocido Ochsi', ['por kg']], ['Mortadela Bolonia', ['por kg']], ['Salame Milano', ['por kg']],
    ['Panchos Ochsi', ['x6', 'x12']],
  ],
};

/** Productos únicos: nombre + presentación, con código, costo, precio y stock. */
function productos(cuantos, semilla = 1, { rubros = Object.keys(CATALOGO), conVariante = false } = {}) {
  const r = azar(semilla);
  const lista = [];
  const usados = new Set();
  let n = 0;
  let vuelta = 0;
  while (lista.length < cuantos) {
    for (const rubro of rubros) {
      for (const [base, tamanos] of CATALOGO[rubro]) {
        for (const tam of tamanos) {
          if (lista.length >= cuantos) break;
          // Más de una vuelta (20.000 filas): variantes de sabor/línea para que no se repitan.
          const variante = vuelta === 0 && !conVariante ? '' : ` ${VARIANTES[(vuelta + n) % VARIANTES.length]} ${vuelta + 1}`;
          const nombre = `${base}${variante} ${tam}`.replace(/\s+/g, ' ').trim();
          if (usados.has(nombre.toLowerCase())) continue;
          usados.add(nombre.toLowerCase());
          n++;
          const porKg = /por kg/.test(tam);
          const costo = redondear(porKg ? 25000 + r() * 60000 : 2500 + r() * 30000, porKg ? 500 : 50);
          const precio = redondear(costo * (1.2 + r() * 0.3), 100);
          const stock = porKg ? Math.round(r() * 300) / 10 : Math.floor(r() * 60);
          lista.push({ codigo: ean13(100000 + n * 7), nombre, categoria: rubro, costo, precio, stock, unidad: porKg ? 'kg' : 'un' });
        }
      }
    }
    vuelta++;
  }
  return lista;
}
const VARIANTES = ['Clásico', 'Light', 'Zero', 'Premium', 'Familiar', 'Económico', 'Original', 'Suave', 'Intenso', 'Natural'];

// ─────────────────────────── utilidades ───────────────────────────

/** Las marcas de tilde que deja normalize('NFD'): U+0300 a U+036F. */
const RE_MARCAS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
const NBSP = String.fromCharCode(0xa0);

const ESPERADO = [];

function esperar(e) {
  // `primeros`: los tres primeros productos como tienen que quedar (sin los campos que no van).
  ESPERADO.push(e);
}

const recortar = (p, campos) => Object.fromEntries(campos.map((c) => [c, p[c] ?? null]));

const gs = (n) => `Gs. ${Math.round(n).toLocaleString('de-DE')}`; // «Gs. 15.000»
const coma = (n, dec = 2) => n.toFixed(dec).replace('.', ',');
const milesComa = (n, dec = 2) => {
  const [e, d] = n.toFixed(dec).split('.');
  return `${Number(e).toLocaleString('de-DE')},${d}`; // «1.250,50»
};

function bordes(fila) {
  fila.eachCell((c) => { c.border = { bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } } }; });
}

async function guardar(wb, nombre) {
  wb.creator = 'Orden corpus';
  const ruta = path.join(SALIDA, nombre);
  await wb.xlsx.writeFile(ruta);
  return fs.statSync(ruta).size;
}

/**
 * Un CSV en el disco. `codificacion`: utf8, latin1 (el CSV de Excel en
 * español), utf16le o utf16be (el «Texto Unicode» de Excel, el «Unicode» de
 * LibreOffice); `bom`: con su BOM (EF BB BF, FF FE o FE FF).
 */
function csv(nombre, filas, { sep = ';', codificacion = 'utf8', bom = false, crlf = true } = {}) {
  const cel = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /["\n;,\t]/.test(s) && (s.includes(sep) || /["\n]/.test(s)) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = filas.map((f) => f.map(cel).join(sep)).join(crlf ? '\r\n' : '\n') + (crlf ? '\r\n' : '\n');
  let buf;
  if (codificacion === 'latin1') buf = Buffer.from(texto, 'latin1');
  else if (codificacion === 'utf16le' || codificacion === 'utf16be') {
    buf = Buffer.from(texto, 'utf16le');
    if (codificacion === 'utf16be') for (let i = 0; i + 1 < buf.length; i += 2) { const a = buf[i]; buf[i] = buf[i + 1]; buf[i + 1] = a; }
  } else buf = Buffer.from(texto, 'utf8');
  if (bom) {
    const marca = codificacion === 'utf16le' ? [0xff, 0xfe] : codificacion === 'utf16be' ? [0xfe, 0xff] : [0xef, 0xbb, 0xbf];
    buf = Buffer.concat([Buffer.from(marca), buf]);
  }
  fs.writeFileSync(path.join(SALIDA, nombre), buf);
  return buf.length;
}

/** Lo que Excel en español escribe en el CSV de un número largo en formato General: «7,84E+12». */
const cientifico = (codigo) => {
  const n = Number(codigo);
  const e = Math.floor(Math.log10(n));
  return `${String(+(n / 10 ** e).toPrecision(3)).replace('.', ',')}E+${e}`;
};

// ─────────────────────────── las planillas ───────────────────────────

async function p01() {
  // Exportación de un sistema de caja paraguayo: la primera fila es el
  // encabezado, el código es un número (EAN) y el IVA dice 10, 5 o EXENTA.
  const lista = productos(320, 101);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Productos');
  ws.addRow(['Código', 'Descripción', 'Costo', 'Precio', 'Stock', 'IVA']);
  lista.forEach((p, i) => {
    const iva = /Leche|Arroz|Poroto|Locro|Harina|Sal fina/.test(p.nombre) ? 5 : i % 17 === 0 ? 'EXENTA' : 10;
    ws.addRow([Number(p.codigo), p.nombre.toUpperCase(), p.costo, p.precio, p.stock, iva]);
  });
  ws.getColumn(1).numFmt = '0';
  const bytes = await guardar(wb, '01_caja_py_sistema.xlsx');
  esperar({
    archivo: '01_caja_py_sistema.xlsx', bytes,
    caso: 'Exportación de sistema de caja paraguayo (Código, Descripción, Costo, Precio, Stock, IVA). Nombres en MAYÚSCULAS, código EAN como número.',
    hojas: { usadas: ['Productos'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    ignoradas: ['IVA'],
    productos: 320,
    primeros: lista.slice(0, 3).map((p) => ({ ...recortar(p, ['codigo', 'costo', 'precio', 'stock']), nombre: p.nombre.toUpperCase(), categoria: null })),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'El código llega como número (7840000...): se guarda como texto sin decimales ni notación científica. Categoría: ninguna columna → «General» (o la que elija). Los nombres en mayúsculas quedan como vienen (no se «embellecen»).',
  });
}

async function p02() {
  // Lista de precios de una distribuidora: portada, una hoja por rubro con
  // títulos arriba, y una hoja oculta de configuración.
  const wb = new ExcelJS.Workbook();
  const portada = wb.addWorksheet('Portada');
  portada.mergeCells('A1:F1');
  portada.getCell('A1').value = 'DISTRIBUIDORA EL SOL S.A.';
  portada.getCell('A1').font = { bold: true, size: 18 };
  portada.getCell('A3').value = 'Lista de precios – Octubre 2026';
  portada.getCell('A4').value = 'Ventas: (021) 555-123 · WhatsApp 0981 123 456';
  portada.getCell('A5').value = 'Precios con IVA incluido. Sujetos a cambio sin previo aviso.';
  portada.getCell('A7').value = 'Contenido';
  portada.getCell('A8').value = 'Bebidas';
  portada.getCell('A9').value = 'Limpieza';
  portada.getCell('A10').value = 'Almacén';

  const hojas = ['Bebidas', 'Limpieza', 'Almacén'];
  const todos = [];
  let k = 0;
  for (const h of hojas) {
    const lista = productos(60, 200 + k++, { rubros: [h] }).slice(0, h === 'Limpieza' ? 11 : h === 'Bebidas' ? 22 : 30);
    const ws = wb.addWorksheet(h);
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = `DISTRIBUIDORA EL SOL — ${h.toUpperCase()}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A2').value = 'Lista vigente desde el 01/10/2026';
    ws.addRow([]);
    const enc = ws.addRow(['Cód.', 'Artículo', 'Unidad', 'Costo', 'Precio minorista', 'Precio mayorista']);
    enc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    enc.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }; });
    lista.forEach((p, i) => {
      const cod = `${h.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(4, '0')}`;
      p.codigo = cod;
      const may = redondear(p.precio * 0.92, 100);
      ws.addRow([cod, p.nombre, p.unidad === 'kg' ? 'KG' : 'UN', p.costo, p.precio, may]);
      todos.push(p);
    });
    for (const col of [4, 5, 6]) ws.getColumn(col).numFmt = '#,##0';
  }
  const cfg = wb.addWorksheet('Config');
  cfg.state = 'hidden';
  cfg.addRow(['Código', 'Nombre', 'Precio']);
  cfg.addRow(['X', 'No debería leerse', 1]);

  const bytes = await guardar(wb, '02_distribuidora_varias_hojas.xlsx');
  esperar({
    archivo: '02_distribuidora_varias_hojas.xlsx', bytes,
    caso: 'Lista de distribuidora: Portada (sin tabla), una hoja por rubro con títulos y encabezado en la fila 4, hoja oculta «Config».',
    hojas: { usadas: ['Bebidas', 'Limpieza', 'Almacén'], noUsadas: ['Portada'], ocultas: ['Config (no se lee)'] },
    mapeo: { codigo: 'Cód.', nombre: 'Artículo', unidad: 'Unidad', costo: 'Costo', precio: 'Precio minorista' },
    ignoradas: ['Precio mayorista'],
    categoria: 'el nombre de cada hoja (no hay columna de categoría)',
    productos: todos.length,
    primeros: todos.slice(0, 3).map((p) => ({ ...recortar(p, ['codigo', 'nombre', 'costo', 'precio']), categoria: 'Bebidas', unidad: p.unidad === 'kg' ? 'kg' : 'un' })),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: ['otro_precio_no_usado: «Precio mayorista»'],
    notas: 'Las tres hojas tienen el mismo encabezado: se usan TODAS por defecto (chips para sacar una). Con dos precios, el de venta es el «minorista/público/contado»; el mayorista se nombra como «no usado». Los títulos de arriba (fila 1-2) no son productos.',
  });
}

async function p03() {
  // Planilla casera: título combinado, colores, subtítulos por rubro en
  // negrita, fórmulas de ganancia y total, fila TOTAL al pie y una nota.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Inventario');
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = 'Despensa Doña Rosa — Inventario 2026';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF7030A0' } };
  ws.addRow([]);
  const enc = ws.addRow(['Producto', 'Cantidad', 'Precio de compra', 'Precio de venta', 'Ganancia', 'Total invertido']);
  enc.font = { bold: true };
  enc.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } }; });
  bordes(enc);
  const todos = [];
  let fila = 4;
  const primeraDatos = 5;
  for (const rubro of ['Bebidas', 'Lácteos', 'Limpieza']) {
    const sub = ws.addRow([rubro.toUpperCase()]);
    sub.font = { bold: true };
    sub.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    fila++;
    const lista = productos(30, 300 + rubro.length, { rubros: [rubro] }).slice(0, 8);
    for (const p of lista) {
      fila++;
      const r = ws.addRow([p.nombre, p.stock, p.costo, p.precio, null, null]);
      r.getCell(5).value = { formula: `D${fila}-C${fila}`, result: p.precio - p.costo };
      r.getCell(6).value = { formula: `B${fila}*C${fila}`, result: p.stock * p.costo };
      todos.push({ ...p, categoria: rubro.toUpperCase() });
    }
    ws.addRow([]);
    fila++;
  }
  const totalInv = todos.reduce((s, p) => s + p.stock * p.costo, 0);
  const tot = ws.addRow(['TOTAL', null, null, null, null, { formula: `SUM(F${primeraDatos}:F${fila})`, result: totalInv }]);
  tot.font = { bold: true };
  ws.addRow([]);
  ws.addRow(['Actualizado el 15/09/2026 — Rosa']);
  for (const col of [3, 4, 5, 6]) ws.getColumn(col).numFmt = '"Gs." #,##0';
  ws.getColumn(1).width = 38;
  const bytes = await guardar(wb, '03_casera_titulos_colores_totales.xlsx');
  esperar({
    archivo: '03_casera_titulos_colores_totales.xlsx', bytes,
    caso: 'Planilla casera: título combinado arriba, colores, subtítulos BEBIDAS/LÁCTEOS/LIMPIEZA en negrita, fórmulas de ganancia y total, fila TOTAL y una nota al pie.',
    hojas: { usadas: ['Inventario'], noUsadas: [] },
    mapeo: { nombre: 'Producto', stock: 'Cantidad', costo: 'Precio de compra', precio: 'Precio de venta' },
    ignoradas: ['Ganancia', 'Total invertido'],
    categoria: 'el subtítulo de grupo de arriba (BEBIDAS, LÁCTEOS, LIMPIEZA), tal como está escrito (BEBIDAS): no se inventa ni se cambia',
    productos: todos.length,
    primeros: todos.slice(0, 3).map((p) => recortar(p, ['nombre', 'categoria', 'costo', 'precio', 'stock'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    filasDescartadas: ['título (fila 1)', '3 subtítulos de grupo (pasan a categoría)', 'TOTAL', 'nota «Actualizado el…»'],
    avisos: [],
    notas: '«Cantidad» es stock. «Ganancia» y «Total invertido» son fórmulas derivadas: no son precio. La fila TOTAL no es un producto.',
  });
}

async function p04() {
  // CSV del Excel en español: «;», coma decimal, puntos de miles, en Windows-1252.
  const lista = productos(45, 404, { rubros: ['Almacén', 'Lácteos'] });
  const filas = [['Código', 'Descripción', 'Costo', 'Precio', 'Stock']];
  lista.forEach((p, i) => {
    // Unos con decimales («12500,50»), otros con puntos de miles («1.250,00»).
    p.costo = i % 3 === 0 ? p.costo + 0.5 : p.costo;
    filas.push([p.codigo, p.nombre, i % 2 ? milesComa(p.costo) : coma(p.costo), i % 2 ? milesComa(p.precio) : coma(p.precio, 0), coma(p.stock, p.unidad === 'kg' ? 1 : 0)]);
  });
  const bytes = csv('04_csv_punto_y_coma_coma_decimal.csv', filas, { sep: ';', codificacion: 'latin1' });
  esperar({
    archivo: '04_csv_punto_y_coma_coma_decimal.csv', bytes,
    caso: 'CSV de Excel en español: separado por «;», en Windows-1252 (Azúcar, Jabón), coma decimal («12500,50») y puntos de miles («1.250,50»).',
    hojas: { usadas: [''], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => recortar(p, ['codigo', 'nombre', 'costo', 'precio', 'stock'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'Se lee en el navegador (no sube). «Azúcar» tiene que salir con tilde (Windows-1252). Con PYG (sin decimales) el costo 12500,5 se guarda 12500,50: numeric(14,2) lo admite; la pantalla lo muestra redondeado.',
  });
}

async function p05() {
  // Montos con «Gs.», «₲», «Gs» al final, puntos de miles; texto y número con formato.
  const lista = productos(40, 505, { rubros: ['Bebidas', 'Fiambrería'] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Nombre', 'Costo', 'Precio de venta', 'Stock']);
  const formas = [
    (n) => gs(n), (n) => `₲ ${Math.round(n).toLocaleString('de-DE')}`, (n) => `${Math.round(n).toLocaleString('de-DE')} Gs`,
    (n) => `Gs${Math.round(n).toLocaleString('de-DE')}`, (n) => n, (n) => `₲${Math.round(n).toLocaleString('de-DE')}.-`,
  ];
  lista.forEach((p, i) => {
    const f = formas[i % formas.length];
    const r = ws.addRow([p.nombre, f(p.costo), f(p.precio), i % 4 === 0 ? `${p.stock} un.` : p.stock]);
    if (typeof f(p.costo) === 'number') { r.getCell(2).numFmt = '"Gs." #,##0'; r.getCell(3).numFmt = '[$₲-3C0A] #,##0'; }
  });
  const bytes = await guardar(wb, '05_montos_con_gs.xlsx');
  esperar({
    archivo: '05_montos_con_gs.xlsx', bytes,
    caso: 'Montos escritos como texto con «Gs. 15.000», «₲ 7.500», «15.000 Gs», «Gs15.000», «₲7.500.-», y números con formato de guaraníes. Stock «12 un.».',
    hojas: { usadas: ['Hoja1'], noUsadas: [] },
    mapeo: { nombre: 'Nombre', costo: 'Costo', precio: 'Precio de venta', stock: 'Stock' },
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => recortar(p, ['nombre', 'costo', 'precio', 'stock'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: '«15.000» con punto y tres cifras es quince mil (puntos de miles), no 15. «12 un.» es 12.',
  });
}

async function p06() {
  // Columnas en otro orden, con nombres raros.
  const lista = productos(50, 606);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Stock');
  ws.addRow(['Stock', 'PVP', 'Familia', 'Artículo', 'Ref.', 'Costo unitario']);
  lista.forEach((p, i) => { p.codigo = `R${1000 + i}`; ws.addRow([p.stock, p.precio, p.categoria, p.nombre, p.codigo, p.costo]); });
  const bytes = await guardar(wb, '06_columnas_otro_orden.xlsx');
  esperar({
    archivo: '06_columnas_otro_orden.xlsx', bytes,
    caso: 'Las columnas en otro orden: Stock, PVP, Familia, Artículo, Ref., Costo unitario.',
    hojas: { usadas: ['Stock'], noUsadas: [] },
    mapeo: { stock: 'Stock', precio: 'PVP', categoria: 'Familia', nombre: 'Artículo', codigo: 'Ref.', costo: 'Costo unitario' },
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => recortar(p, ['codigo', 'nombre', 'categoria', 'costo', 'precio', 'stock'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'El nombre de la hoja «Stock» no confunde: la columna Stock es stock, la hoja se usa igual.',
  });
}

async function p07() {
  // Sin código: se empareja por nombre normalizado con lo que ya está en Orden.
  const lista = productos(25, 707, { rubros: ['Almacén'] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lista');
  ws.addRow(['Producto', 'Categoría', 'Costo', 'Precio']);
  // Variantes de escritura del mismo producto (para el emparejamiento con la base):
  const escrito = lista.map((p, i) => {
    if (i === 0) return p.nombre.toLowerCase();                       // «yerba mate pajarito 500g»
    if (i === 1) return `  ${p.nombre.replace(/ /g, '  ')} `;          // espacios de más
    if (i === 2) return p.nombre.normalize('NFD').replace(RE_MARCAS, ''); // sin tildes
    if (i === 3) return p.nombre + NBSP;                     // espacio duro de WhatsApp (U+00A0) al final
    return p.nombre;
  });
  lista.forEach((p, i) => ws.addRow([escrito[i], p.categoria, p.costo, p.precio]));
  const bytes = await guardar(wb, '07_sin_codigo.xlsx');
  esperar({
    archivo: '07_sin_codigo.xlsx', bytes,
    caso: 'Sin columna de código. Los primeros cuatro nombres están escritos distinto a como están en Orden (minúsculas, espacios de más, sin tildes, espacio duro al final).',
    hojas: { usadas: ['Lista'], noUsadas: [] },
    mapeo: { nombre: 'Producto', categoria: 'Categoría', costo: 'Costo', precio: 'Precio' },
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => recortar(p, ['nombre', 'categoria', 'costo', 'precio'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    conBase: {
      preparar: 'Antes de importar, en Orden ya existen los 4 primeros con su nombre bien escrito (lista[0..3].nombre) y precio viejo.',
      resultado: { seCrean: lista.length - 4, seActualizan: 4 },
      nombreQueda: 'el que ya tenía en Orden (no se pisa con la variante de la planilla)',
    },
    avisos: [],
    notas: 'Nombre normalizado = minúsculas, sin tildes en vocales, espacios (también U+00A0, U+2007, U+202F, U+2060, U+FEFF, U+200B) colapsados y recortados.',
    escritos: escrito.slice(0, 4),
  });
}

async function p08() {
  // Códigos repetidos, nombres repetidos con otro código, filas sin código.
  const lista = productos(30, 808, { rubros: ['Bebidas'] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Código', 'Descripción', 'Precio', 'Stock']);
  lista.forEach((p) => ws.addRow([p.codigo, p.nombre, p.precio, p.stock]));
  // 1) el mismo código dos veces, más abajo con otro precio (la última gana)
  const rep = { ...lista[2], precio: lista[2].precio + 1000, stock: 99 };
  ws.addRow([rep.codigo, rep.nombre, rep.precio, rep.stock]);
  // 2) el mismo nombre que lista[5] con OTRO código (dos proveedores)
  const otroCod = ean13(999001);
  ws.addRow([otroCod, lista[5].nombre, lista[5].precio + 500, 4]);
  // 3) sin código: se empareja por nombre (nuevo)
  ws.addRow([null, 'Hielo en bolsa 3kg', 9000, 20]);
  // 4) mismo código y otro nombre (renombrado en la misma planilla)
  ws.addRow([lista[7].codigo, `${lista[7].nombre} (nuevo envase)`, lista[7].precio, lista[7].stock]);
  const bytes = await guardar(wb, '08_codigos_repetidos.xlsx');
  esperar({
    archivo: '08_codigos_repetidos.xlsx', bytes,
    caso: 'Códigos repetidos dentro de la planilla, un nombre repetido con otro código, una fila sin código, y un código repetido con otro nombre.',
    hojas: { usadas: ['Hoja1'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', precio: 'Precio', stock: 'Stock' },
    productos: 32,
    detalle: {
      filasLeidas: 34,
      repetidos: [
        { codigo: lista[2].codigo, filas: [4, 32], queda: 'la última (fila 32): precio ' + rep.precio + ', stock 99' },
        { codigo: lista[7].codigo, filas: [9, 35], queda: `la última: «${lista[7].nombre} (nuevo envase)»` },
      ],
      mismoNombreOtroCodigo: { nombre: lista[5].nombre, codigos: [lista[5].codigo, otroCod], resolucion: `el segundo se guarda como «${lista[5].nombre} (${otroCod})» para no chocar con unique(empresa_id, nombre)` },
      sinCodigo: 'Hielo en bolsa 3kg: se crea, emparejado por nombre',
    },
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 2 },
    avisos: ['sin_costo: la planilla no trae costo (la ganancia de esas ventas sale sin costo)'],
    notas: 'Sin columna de costo: costo 0 al crear; al actualizar NO se pisa el costo que ya tenía.',
  });
}

async function p09() {
  // Fórmulas: precio = costo × 1,3 redondeado (fórmula compartida, como al «arrastrar» en Excel), con resultado guardado.
  const lista = productos(40, 909, { rubros: ['Almacén'] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Precios');
  ws.addRow(['Código', 'Producto', 'Costo', 'Precio', 'Margen %']);
  lista.forEach((p, i) => {
    const f = i + 2;
    p.precio = Math.round((p.costo * 1.3) / 100) * 100;
    const fila = ws.addRow([p.codigo, p.nombre, p.costo, null, null]);
    if (i === 0) fila.getCell(4).value = { formula: `ROUND(C${f}*1.3,-2)`, result: p.precio, shareType: 'shared', ref: `D2:D${lista.length + 1}` };
    else fila.getCell(4).value = { sharedFormula: 'D2', result: p.precio };
    fila.getCell(5).value = { formula: `(D${f}-C${f})/D${f}`, result: (p.precio - p.costo) / p.precio };
    fila.getCell(5).numFmt = '0%';
  });
  const bytes = await guardar(wb, '09_formulas_precio_costo_x13.xlsx');
  esperar({
    archivo: '09_formulas_precio_costo_x13.xlsx', bytes,
    caso: 'El precio es una fórmula =REDONDEAR(C2*1,3;-2) arrastrada (fórmula compartida) con su resultado guardado; «Margen %» también es fórmula.',
    hojas: { usadas: ['Precios'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Producto', costo: 'Costo', precio: 'Precio' },
    ignoradas: ['Margen %'],
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => recortar(p, ['codigo', 'nombre', 'costo', 'precio'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'Se usa el RESULTADO de la fórmula. El valor numérico tiene que llegar como número (no como «7800» reconvertido), para que un costo 1234,567 no se lea 1.234.567.',
  });
}

async function p09b() {
  // Fórmulas SIN resultado guardado: lo que escribe un sistema que arma el xlsx sin calcular.
  const lista = productos(20, 919, { rubros: ['Lácteos'] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Código', 'Producto', 'Costo', 'Precio']);
  lista.forEach((p, i) => {
    const f = i + 2;
    const fila = ws.addRow([p.codigo, p.nombre, p.costo, null]);
    fila.getCell(4).value = { formula: `C${f}*1.3` };
  });
  const bytes = await guardar(wb, '09b_formulas_sin_calcular.xlsx');
  esperar({
    archivo: '09b_formulas_sin_calcular.xlsx', bytes,
    caso: 'El precio es una fórmula sin resultado guardado (la planilla la armó un programa y nunca se abrió en Excel).',
    hojas: { usadas: ['Hoja1'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Producto', costo: 'Costo', precio: 'Precio' },
    productos: 0,
    problemas: { sin_nombre: 0, sin_precio: lista.length, precio_menor_costo: 0, repetidos: 0 },
    avisos: ['formulas_sin_calcular: «La columna Precio tiene fórmulas sin calcular. Abrí la planilla en Excel o Google Sheets, guardala y subila de nuevo.»'],
    notas: 'Hoy valorComoCelda devuelve null para {formula, result: undefined}: se pierde que había una fórmula. Hay que marcarla (sinCalcular) para poder dar este aviso en vez de «20 sin precio» a secas.',
  });
}

async function p10() {
  // En portugués, con R$ y coma decimal.
  const lista = productos(35, 1010, { rubros: ['Almacén', 'Limpieza'] }).map((p) => ({
    ...p,
    nombre: p.nombre.replace('Yerba Mate', 'Erva-mate').replace('Arroz', 'Arroz').replace('Azúcar', 'Açúcar').replace('Jabón en polvo', 'Sabão em pó').replace('Fideo', 'Macarrão'),
    categoria: p.categoria === 'Almacén' ? 'Mercearia' : 'Limpeza',
    costo: Math.round(p.costo / 13) / 100, // reales con centavos
    precio: Math.round(p.precio / 13) / 100,
  }));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Planilha1');
  ws.addRow(['Código', 'Produto', 'Categoria', 'Custo', 'Preço de venda', 'Estoque', 'Unidade']);
  lista.forEach((p, i) => {
    const r = ws.addRow([p.codigo, p.nombre, p.categoria, i % 2 ? `R$ ${coma(p.costo)}` : p.costo, i % 2 ? `R$ ${milesComa(p.precio)}` : p.precio, p.stock, p.unidad === 'kg' ? 'kg' : 'un']);
    if (!(i % 2)) { r.getCell(4).numFmt = '"R$" #,##0.00'; r.getCell(5).numFmt = '"R$" #,##0.00'; }
  });
  const bytes = await guardar(wb, '10_portugues.xlsx');
  esperar({
    archivo: '10_portugues.xlsx', bytes,
    caso: 'Planilla en portugués: Código, Produto, Categoria, Custo, Preço de venda, Estoque, Unidade. Montos «R$ 12,50» como texto y números con formato de reales.',
    hojas: { usadas: ['Planilha1'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Produto', categoria: 'Categoria', costo: 'Custo', precio: 'Preço de venda', stock: 'Estoque', unidad: 'Unidade' },
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => ({ ...recortar(p, ['codigo', 'nombre', 'categoria', 'costo', 'precio', 'stock']), unidad: 'un' })),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: '«R$ 1.234,56» = 1234.56. La moneda de la cuenta (BRL) no cambia la lectura; solo los decimales que se muestran.',
  });
}

async function p11() {
  // 20.000 filas: xlsx y CSV.
  const lista = productos(20000, 1111, { conVariante: true });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Catalogo');
  ws.addRow(['Código', 'Descripción', 'Rubro', 'Costo', 'Precio', 'Stock']);
  for (const p of lista) ws.addRow([p.codigo, p.nombre, p.categoria, p.costo, p.precio, p.stock]);
  const bytes = await guardar(wb, '11_veinte_mil_filas.xlsx');
  const filas = [['Código', 'Descripción', 'Rubro', 'Costo', 'Precio', 'Stock'], ...lista.map((p) => [p.codigo, p.nombre, p.categoria, p.costo, p.precio, String(p.stock).replace('.', ',')])];
  const bytesCsv = csv('11b_veinte_mil_filas.csv', filas, { sep: ';', bom: true });
  const caso = {
    hojas: { usadas: ['Catalogo'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', categoria: 'Rubro', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    productos: 20000,
    primeros: lista.slice(0, 3).map((p) => recortar(p, ['codigo', 'nombre', 'categoria', 'costo', 'precio', 'stock'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
  };
  esperar({ archivo: '11_veinte_mil_filas.xlsx', bytes, caso: '20.000 productos en una hoja (lo que pidió Matías probar).', ...caso, notas: 'Tiene que pasar por la ruta (≤ 4 MB subida) y volver en ≤ 4 MB (respuesta compacta), y guardarse en 20 tandas de 1.000.' });
  esperar({ archivo: '11b_veinte_mil_filas.csv', bytes: bytesCsv, caso: 'Los mismos 20.000 como CSV UTF-8 con BOM y «;».', ...caso, hojas: { usadas: [''], noUsadas: [] }, notas: 'Se lee en el navegador: hoy libroDesdeCsv corta en 500 filas (TOPES_PLANILLA.filas); tiene que aceptar un tope propio.' });
}

async function p12() {
  // Celdas vacías y filas basura.
  const lista = productos(30, 1212, { rubros: ['Almacén', 'Bebidas'] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Precios');
  ws.addRow(['LISTA DE PRECIOS']);
  ws.addRow(['Precios sujetos a cambio sin previo aviso']);
  ws.addRow([]);
  ws.addRow(['Item', 'Producto', 'Precio', 'Costo', 'Stock']);
  let item = 0;
  const buenos = [];
  const raros = [];
  lista.forEach((p, i) => {
    if (i === 4) { ws.addRow([]); ws.addRow([]); }
    if (i === 6) ws.addRow(['-', '-', '-', '-', '-']);
    if (i === 9) ws.addRow([null, null, 15000, null, null]);                    // precio sin nombre → sin_nombre
    if (i === 11) { ws.addRow([++item, 'Pan casero (consultar)', 'consultar', 3000, null]); raros.push('sin_precio: «consultar»'); }
    if (i === 13) { ws.addRow([++item, 'Chipa por docena', 's/p', null, 10]); raros.push('sin_precio: «s/p»'); }
    if (i === 15) { const f = ws.addRow([++item, 'Gaseosa sin datos', { error: '#N/A' }, { error: '#N/A' }, null]); raros.push('sin_precio: #N/A'); void f; }
    if (i === 17) { ws.addRow([++item, 'Promo Pilsen + hielo', 12000, 13500, 5]); raros.push('precio_menor_costo'); }
    if (i === 19) ws.addRow(['x']);
    if (i === 21) ws.addRow([null, 'N/A', null, null, null]);
    ws.addRow([++item, p.nombre, p.precio, p.costo, i % 5 === 0 ? null : p.stock]);
    buenos.push({ ...p, stock: i % 5 === 0 ? null : p.stock });
  });
  ws.addRow([]);
  ws.addRow(['', 'Total de artículos: ' + item]);
  const bytes = await guardar(wb, '12_celdas_vacias_filas_basura.xlsx');
  esperar({
    archivo: '12_celdas_vacias_filas_basura.xlsx', bytes,
    caso: 'Título y aviso arriba, columna «Item» con números de fila, filas vacías en el medio, una fila de guiones, una fila con solo un precio, «consultar», «s/p», #N/A, una «x» suelta, «N/A» como nombre, precio menor al costo, stock vacío y «Total de artículos» al pie.',
    hojas: { usadas: ['Precios'], noUsadas: [] },
    mapeo: { nombre: 'Producto', precio: 'Precio', costo: 'Costo', stock: 'Stock' },
    ignoradas: ['Item (es el número de fila 1, 2, 3…: no es el nombre ni el código)'],
    productos: buenos.length + 1,
    primeros: buenos.slice(0, 3).map((p) => ({ ...recortar(p, ['nombre', 'precio', 'costo']), stock: p.stock })),
    problemas: { sin_nombre: 1, sin_precio: 3, precio_menor_costo: 1, repetidos: 0 },
    filasDescartadas: ['título', 'aviso', 'vacías', 'guiones', '«x»', '«N/A»', '«Total de artículos: N»'],
    avisos: [],
    notas: 'Stock vacío: 0 al crear y «no tocar» al actualizar. «Promo Pilsen + hielo» se carga (precio menor al costo es un aviso, no un error). Las tres sin precio NO se cargan (se listan). «N/A» como nombre no es un producto.',
    raros,
  });
}

async function p13() {
  // Dos tablas lado a lado en la misma hoja, y un resumen debajo.
  const a = productos(15, 1313, { rubros: ['Bebidas'] }).slice(0, 12);
  const b = productos(15, 1314, { rubros: ['Almacén'] }).slice(0, 10).map((p, i) => ({ ...p, codigo: ean13(500000 + i * 11) }));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lista');
  ws.getCell('A1').value = 'BEBIDAS';
  ws.getCell('F1').value = 'ALMACÉN';
  ws.getCell('A1').font = ws.getCell('F1').font = { bold: true };
  const enc = ['Código', 'Producto', 'Precio', 'Stock'];
  enc.forEach((t, k) => { ws.getCell(2, 1 + k).value = t; ws.getCell(2, 6 + k).value = t; });
  a.forEach((p, i) => [p.codigo, p.nombre, p.precio, p.stock].forEach((v, k) => { ws.getCell(3 + i, 1 + k).value = v; }));
  b.forEach((p, i) => [p.codigo, p.nombre, p.precio, p.stock].forEach((v, k) => { ws.getCell(3 + i, 6 + k).value = v; }));
  const abajo = 3 + Math.max(a.length, b.length) + 2;
  ws.getCell(abajo, 1).value = 'Resumen';
  ws.getCell(abajo + 1, 1).value = 'Rubro';
  ws.getCell(abajo + 1, 2).value = 'Artículos';
  ws.getCell(abajo + 1, 3).value = 'Valor en stock';
  ws.getCell(abajo + 2, 1).value = 'Bebidas';
  ws.getCell(abajo + 2, 2).value = a.length;
  ws.getCell(abajo + 2, 3).value = a.reduce((s, p) => s + p.precio * p.stock, 0);
  ws.getCell(abajo + 3, 1).value = 'Almacén';
  ws.getCell(abajo + 3, 2).value = b.length;
  ws.getCell(abajo + 3, 3).value = b.reduce((s, p) => s + p.precio * p.stock, 0);
  const bytes = await guardar(wb, '13_dos_tablas_misma_hoja.xlsx');
  esperar({
    archivo: '13_dos_tablas_misma_hoja.xlsx', bytes,
    caso: 'Dos tablas lado a lado (A-D bebidas, F-I almacén) separadas por una columna vacía, con su título arriba, y una tabla «Resumen» debajo.',
    hojas: { usadas: ['Lista'], noUsadas: [] },
    bloques: [
      { columnas: 'A:D', titulo: 'BEBIDAS', mapeo: { codigo: 'Código', nombre: 'Producto', precio: 'Precio', stock: 'Stock' }, productos: a.length },
      { columnas: 'F:I', titulo: 'ALMACÉN', mapeo: { codigo: 'Código', nombre: 'Producto', precio: 'Precio', stock: 'Stock' }, productos: b.length },
    ],
    categoria: 'el título de cada bloque (BEBIDAS / ALMACÉN), tal como está escrito',
    productos: a.length + b.length,
    primeros: a.slice(0, 3).map((p) => ({ ...recortar(p, ['codigo', 'nombre', 'precio', 'stock']), categoria: 'BEBIDAS' })),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    filasDescartadas: ['Resumen (Rubro | Artículos | Valor en stock): no es un catálogo; «Bebidas» y «Almacén» no son productos'],
    avisos: ['sin_costo'],
    notas: 'El encabezado repetido en la misma fila (dos «Producto») parte la hoja en bloques, como el lector de rutinas con los días lado a lado. El resumen de abajo tiene otro encabezado sin nombre de producto ni precio: corta la tabla.',
  });
}

async function p14() {
  // Exportada de Google Sheets: «Hoja 1» con el catálogo y casillas; «Ventas» con el registro.
  const lista = productos(60, 1414);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja 1');
  ws.addRow(['Nombre del producto', 'Precio', 'Costo', 'Stock', 'Categoría', 'Código de barras', 'Activo']);
  lista.forEach((p, i) => {
    const r = ws.addRow([p.nombre, p.precio, p.costo, p.stock, p.categoria, p.codigo, i % 9 !== 0]);
    r.getCell(2).numFmt = '[$₲-3C0A]#,##0';
    r.getCell(3).numFmt = '[$₲-3C0A]#,##0';
  });
  const v = wb.addWorksheet('Ventas');
  v.addRow(['Fecha', 'Producto', 'Cantidad', 'Total', 'Cliente']);
  for (let i = 0; i < 40; i++) {
    const p = lista[i % lista.length];
    const r = v.addRow([new Date(Date.UTC(2026, 8, 1 + (i % 28))), p.nombre, 1 + (i % 3), p.precio * (1 + (i % 3)), i % 2 ? 'Juan' : '']);
    r.getCell(1).numFmt = 'dd/mm/yyyy';
  }
  const bytes = await guardar(wb, '14_google_sheets_export.xlsx');
  esperar({
    archivo: '14_google_sheets_export.xlsx', bytes,
    caso: 'Exportada de Google Sheets: «Hoja 1» con el catálogo (formato de moneda de Google, casilla «Activo») y «Ventas» con el registro de ventas (Fecha, Producto, Cantidad, Total, Cliente).',
    hojas: { usadas: ['Hoja 1'], noUsadas: ['Ventas (es un registro: tiene Fecha y Total, no precio de catálogo)'] },
    mapeo: { nombre: 'Nombre del producto', precio: 'Precio', costo: 'Costo', stock: 'Stock', categoria: 'Categoría', codigo: 'Código de barras' },
    ignoradas: ['Activo (casilla): por ahora no se usa; los destildados se cargan igual (decisión abierta: ¿cargarlos pausados?)'],
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => recortar(p, ['codigo', 'nombre', 'categoria', 'costo', 'precio', 'stock'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'La hoja «Ventas» NO se elige aunque tenga «Producto» y «Cantidad»: tiene Fecha y Total, y el mismo producto se repite. El link de Sheets baja este mismo xlsx (export?format=xlsx).',
  });
}

async function p15() {
  // Columna de costo oculta (para imprimir la lista sin costo) y filas ocultas por un filtro.
  const lista = productos(40, 1515, { rubros: ['Bebidas', 'Almacén'] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lista');
  ws.addRow(['Código', 'Producto', 'Rubro', 'Costo', 'Precio', 'Stock']);
  lista.forEach((p) => ws.addRow([p.codigo, p.nombre, p.categoria, p.costo, p.precio, p.stock]));
  ws.getColumn(4).hidden = true;
  // El filtro «Rubro = Bebidas» esconde las de Almacén.
  ws.autoFilter = 'A1:F' + (lista.length + 1);
  lista.forEach((p, i) => { if (p.categoria !== 'Bebidas') ws.getRow(i + 2).hidden = true; });
  const ocultas = lista.filter((p) => p.categoria !== 'Bebidas').length;
  const bytes = await guardar(wb, '15_columnas_ocultas_y_filtro.xlsx');
  esperar({
    archivo: '15_columnas_ocultas_y_filtro.xlsx', bytes,
    caso: 'La columna Costo está OCULTA (el dueño la esconde para imprimir la lista) y hay un filtro activo que esconde las filas de Almacén.',
    hojas: { usadas: ['Lista'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Producto', categoria: 'Rubro', costo: 'Costo (oculta)', precio: 'Precio', stock: 'Stock' },
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => recortar(p, ['codigo', 'nombre', 'categoria', 'costo', 'precio', 'stock'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [`filas_ocultas: «${ocultas} filas estaban ocultas en tu planilla (por un filtro): se cargan igual.» (con opción de dejarlas afuera)`],
    notas: 'Hoy leerXlsx salta columnas y filas ocultas (bien para rutinas). Para el catálogo se pierde el COSTO y la mitad de los productos sin avisar: hace falta una opción `ocultas: true` que las lea y las marque.',
  });
}

async function p16() {
  // Encabezado en dos filas: «Precio» combinado arriba de «Compra | Venta».
  const lista = productos(30, 1616, { rubros: ['Limpieza', 'Lácteos'] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.getCell('A1').value = 'Producto';
  ws.getCell('B1').value = 'Código';
  ws.mergeCells('C1:D1');
  ws.getCell('C1').value = 'Precio';
  ws.getCell('E1').value = 'Stock';
  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:B2');
  ws.mergeCells('E1:E2');
  ws.getCell('C2').value = 'Compra';
  ws.getCell('D2').value = 'Venta';
  ws.getRow(1).font = ws.getRow(2).font = { bold: true };
  lista.forEach((p) => ws.addRow([p.nombre, p.codigo, p.costo, p.precio, p.stock]));
  const bytes = await guardar(wb, '16_encabezado_doble.xlsx');
  esperar({
    archivo: '16_encabezado_doble.xlsx', bytes,
    caso: 'Encabezado en dos filas: «Precio» combinado sobre «Compra | Venta»; Producto, Código y Stock combinados verticalmente.',
    hojas: { usadas: ['Hoja1'], noUsadas: [] },
    mapeo: { nombre: 'Producto', codigo: 'Código', costo: 'Precio Compra', precio: 'Precio Venta', stock: 'Stock' },
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => recortar(p, ['codigo', 'nombre', 'costo', 'precio', 'stock'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'La combinada vertical repite el valor hacia abajo (planilla-xlsx): la fila 2 dice «Producto | Código | Compra | Venta | Stock». La horizontal deja vacía la D1: «Precio» arriba + «Compra»/«Venta» abajo se combinan como en rutina-planilla (combinar).',
  });
}

async function p17() {
  // CSV sin encabezado.
  const lista = productos(25, 1717, { rubros: ['Bebidas'] });
  const filas = lista.map((p) => [p.codigo, p.nombre, p.costo, p.precio, p.stock]);
  const bytes = csv('17_sin_encabezado.csv', filas, { sep: ';' });
  esperar({
    archivo: '17_sin_encabezado.csv', bytes,
    caso: 'CSV sin fila de títulos: código; nombre; costo; precio; stock.',
    hojas: { usadas: [''], noUsadas: [] },
    mapeo: { codigo: 'columna 1 (13 dígitos)', nombre: 'columna 2 (texto)', costo: 'columna 3 (el menor de los dos montos)', precio: 'columna 4 (el mayor)', stock: 'columna 5 (enteros chicos)' },
    sinEncabezado: true,
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => recortar(p, ['codigo', 'nombre', 'costo', 'precio', 'stock'])),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: ['sin_encabezado: «La planilla no tiene títulos: adivinamos qué es cada columna. Revisalas.»'],
    notas: 'Por contenido: la columna de texto más larga es el nombre; 8-14 dígitos sin repetir es el código; de dos columnas de montos, la que es casi siempre mayor es el precio. La primera fila ES un producto (no se descarta como encabezado).',
  });
}

async function p18() {
  // Formato de EE.UU.: «,» como separador de campos, montos entre comillas «15,000.50», con «$».
  const lista = productos(20, 1818, { rubros: ['Bebidas'] }).map((p) => ({ ...p, costo: Math.round(p.costo / 7.3) / 100 * 100 / 100, precio: Math.round(p.precio / 7.3) / 100 * 100 / 100 }));
  lista.forEach((p) => { p.costo = Math.round(p.costo * 100) / 100; p.precio = Math.round(p.precio * 100) / 100; });
  const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const filas = [['SKU', 'Item', 'Cost', 'Price', 'Qty'], ...lista.map((p, i) => [`SKU-${i + 1}`, p.nombre, usd(p.costo * 100), usd(p.precio * 100), p.stock])];
  lista.forEach((p) => { p.costo = Math.round(p.costo * 10000) / 100; p.precio = Math.round(p.precio * 10000) / 100; });
  const bytes = csv('18_formato_us_comas.csv', filas, { sep: ',' });
  esperar({
    archivo: '18_formato_us_comas.csv', bytes,
    caso: 'CSV de Google Sheets en inglés: separado por «,», montos entre comillas «$1,234.50», encabezado SKU/Item/Cost/Price/Qty.',
    hojas: { usadas: [''], noUsadas: [] },
    mapeo: { codigo: 'SKU', nombre: 'Item', costo: 'Cost', precio: 'Price', stock: 'Qty' },
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p, i) => ({ codigo: `SKU-${i + 1}`, nombre: p.nombre, costo: p.costo, precio: p.precio, stock: p.stock })),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: '«$1,234.50»: coma de miles y punto decimal (dos separadores distintos: el último es el decimal). «Item» acá es el nombre (columna de texto), no un número de fila. Sinónimos en inglés: Cost, Price, Qty, SKU (en.ts existe).',
  });
}

async function p19() {
  // Marca, proveedor, rubro y sub rubro, costo y precio con y sin IVA, stock mínimo.
  const lista = productos(50, 1919);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Articulos');
  ws.addRow(['Código', 'Descripción', 'Marca', 'Proveedor', 'Rubro', 'Sub rubro', 'Costo s/IVA', 'Costo c/IVA', 'Precio s/IVA', 'Precio c/IVA', '% IVA', 'Existencia', 'Mínimo']);
  lista.forEach((p) => {
    const marca = p.nombre.split(' ')[1] || '';
    ws.addRow([p.codigo, p.nombre, marca, 'Distribuidora El Sol', p.categoria, 'Varios', Math.round(p.costo / 1.1), p.costo, Math.round(p.precio / 1.1), p.precio, 10, p.stock, 3]);
  });
  const bytes = await guardar(wb, '19_marca_proveedor_iva.xlsx');
  esperar({
    archivo: '19_marca_proveedor_iva.xlsx', bytes,
    caso: 'Sistema de gestión completo: Marca, Proveedor, Rubro, Sub rubro, costo y precio con y sin IVA, % IVA, Existencia y Mínimo.',
    hojas: { usadas: ['Articulos'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', categoria: 'Rubro', costo: 'Costo c/IVA', precio: 'Precio c/IVA', stock: 'Existencia', stock_minimo: 'Mínimo' },
    ignoradas: ['Marca', 'Proveedor', 'Sub rubro', 'Costo s/IVA', 'Precio s/IVA', '% IVA'],
    productos: lista.length,
    primeros: lista.slice(0, 3).map((p) => ({ ...recortar(p, ['codigo', 'nombre', 'categoria', 'costo', 'precio', 'stock']), stock_minimo: 3 })),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'Con y sin IVA: se toma CON IVA (lo que paga el cliente y lo que salió del bolsillo; en Paraguay el precio de góndola lleva IVA). «Rubro» gana a «Sub rubro». «Mínimo» es el aviso de reponer (stock_minimo).',
  });
}

async function p20() {
  // Barbería (rubro servicios): lista de servicios con duración, y abajo los productos que vende.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Precios');
  ws.addRow(['Servicio', 'Duración', 'Precio']);
  const servicios = [['Corte clásico', '30 min', 40000], ['Corte + barba', '45 min', 60000], ['Barba', '20 min', 25000], ['Afeitado con navaja', '30 min', 35000], ['Corte niño', '25 min', 30000], ['Tintura', '60 min', 90000]];
  servicios.forEach((s) => ws.addRow(s));
  ws.addRow([]);
  ws.addRow(['Producto', 'Costo', 'Precio', 'Stock']);
  const prods = [['Cera para el pelo Gummy', 18000, 30000, 12], ['Shampoo anticaspa 400ml', 22000, 38000, 8], ['Aceite para barba', 35000, 60000, 5]];
  prods.forEach((p) => ws.addRow(p));
  const bytes = await guardar(wb, '20_barberia_servicios_y_productos.xlsx');
  esperar({
    archivo: '20_barberia_servicios_y_productos.xlsx', bytes,
    caso: 'Barbería (rubro servicios): una tabla de servicios (Servicio, Duración, Precio) y debajo otra de productos (Producto, Costo, Precio, Stock).',
    hojas: { usadas: ['Precios'], noUsadas: [] },
    bloques: [
      { filas: '1-7', tipo: 'servicios', mapeo: { nombre: 'Servicio', precio: 'Precio' }, ignoradas: ['Duración (se pone en Agenda)'], items: servicios.length },
      { filas: '9-12', tipo: 'productos', mapeo: { nombre: 'Producto', costo: 'Costo', precio: 'Precio', stock: 'Stock' }, items: prods.length },
    ],
    productos: servicios.length + prods.length,
    primeros: [{ nombre: 'Corte clásico', precio: 40000, controla_stock: false }, { nombre: 'Corte + barba', precio: 60000, controla_stock: false }, { nombre: 'Barba', precio: 25000, controla_stock: false }],
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: ['datos_no_usados: Duración'],
    notas: 'Encabezado nuevo a mitad de hoja = otra tabla. Un encabezado «Servicio» marca servicios (sin stock, sin costo); «Producto» con stock marca productos. Si no se quiere distinguir por bloque en la v1: se importa todo como lo que dice la pestaña desde donde se subió, y la tabla de abajo queda con su propio mapeo.',
  });
}

// ─────────── las que encontró la revisión del 01/10 (21 a 29) ───────────
//
// Cada una falló antes del arreglo: el corpus las guarda para que no vuelvan.
// `todos`: cada producto con lo suyo (no solo los primeros), en el orden de
// la planilla.

const campos = (lista, cs, extra = () => ({})) => lista.map((p) => ({ ...recortar(p, cs), ...extra(p) }));

async function p21() {
  // El catálogo y, en otra hoja, el registro de ventas: con precio y con MÁS filas que el catálogo.
  const lista = productos(80, 2121);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Productos');
  ws.addRow(['Código', 'Producto', 'Costo', 'Precio', 'Stock']);
  lista.forEach((p) => ws.addRow([p.codigo, p.nombre, p.costo, p.precio, p.stock]));
  const v = wb.addWorksheet('Ventas');
  v.addRow(['Fecha', 'Producto', 'Cantidad', 'Precio Unitario', 'Total']);
  const r = azar(21);
  for (let i = 0; i < 300; i++) {
    const p = lista[Math.floor(r() * lista.length)];
    const q = 1 + Math.floor(r() * 4);
    const unitario = redondear(p.precio * 0.95, 100);
    const fila = v.addRow([new Date(Date.UTC(2026, 6 + Math.floor(i / 100), 1 + (i % 28))), p.nombre, q, unitario, null]);
    fila.getCell(1).numFmt = 'dd/mm/yyyy';
    fila.getCell(5).value = { formula: `C${fila.number}*D${fila.number}`, result: q * unitario };
  }
  const bytes = await guardar(wb, '21_catalogo_y_ventas.xlsx');
  esperar({
    archivo: '21_catalogo_y_ventas.xlsx', bytes,
    caso: '«Productos» con 80 (Código, Producto, Costo, Precio, Stock) y «Ventas» con 300 ventas (Fecha, Producto, Cantidad, Precio Unitario, Total).',
    hojas: { usadas: ['Productos'], noUsadas: ['Ventas (un registro: la fecha de cada venta; con los chips se puede sumar)'] },
    mapeo: { codigo: 'Código', nombre: 'Producto', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'costo', 'precio', 'stock'], () => ({ categoria: null })),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'Antes se elegía «Ventas» (la de más filas): el precio salía de la venta, el stock de la cantidad vendida, la categoría «Ventas» y 221 «repetidos»; al guardar, pisaba los productos de verdad.',
  });
}

async function p21b() {
  // «Lista de precios» de 200 y «Ventas Septiembre» de 250, con el cliente y el precio de cada venta.
  const lista = productos(200, 2122, { conVariante: true });
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Lista de precios');
  a.addRow(['Código', 'Descripción', 'Costo', 'Precio', 'Stock']);
  lista.forEach((p) => a.addRow([p.codigo, p.nombre, p.costo, p.precio, p.stock]));
  const v = wb.addWorksheet('Ventas Septiembre');
  v.addRow(['Fecha', 'Cliente', 'Descripción', 'Cant.', 'Precio', 'Total']);
  for (let i = 0; i < 250; i++) {
    const p = lista[i % lista.length];
    const q = 1 + (i % 3);
    const fila = v.addRow([new Date(Date.UTC(2026, 8, 1 + (i % 28))), `Cliente ${i % 7}`, p.nombre, q, p.precio, q * p.precio]);
    fila.getCell(1).numFmt = 'dd/mm/yyyy';
  }
  const bytes = await guardar(wb, '21b_lista_y_ventas_con_cliente.xlsx');
  esperar({
    archivo: '21b_lista_y_ventas_con_cliente.xlsx', bytes,
    caso: '«Lista de precios» con 200 y «Ventas Septiembre» con 250 (Fecha, Cliente, Descripción, Cant., Precio, Total).',
    hojas: { usadas: ['Lista de precios'], noUsadas: ['Ventas Septiembre'] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'costo', 'precio', 'stock'], () => ({ categoria: null })),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'La hoja de ventas no cuenta como otra lista: «Lista de precios» no pasa a ser la categoría de todo.',
  });
}

/** Los productos con el código como lo dejó Excel (22): roto, en las cuatro formas. */
async function p22() {
  const lista = productos(50, 2222, { rubros: ['Bebidas', 'Almacén'] });
  const sinCodigo = campos(lista, ['nombre', 'costo', 'precio', 'stock'], () => ({ codigo: null }));
  const comun = {
    mapeo: { nombre: 'Descripción', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    productos: lista.length,
    todos: sinCodigo,
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: ['codigos_no_usados: «Excel cambió los códigos de la columna «Código» a notación científica…»'],
  };
  const titulos = ['Código', 'Descripción', 'Costo', 'Precio', 'Stock'];

  // 22: el CSV del Excel en español (lo que mostraba la celda en General).
  const filas = [titulos, ...lista.map((p) => [cientifico(p.codigo), p.nombre, p.costo, p.precio, p.stock])];
  let bytes = csv('22_ean_cientifico_excel.csv', filas, { sep: ';', codificacion: 'latin1' });
  esperar({ archivo: '22_ean_cientifico_excel.csv', bytes, caso: `CSV de Excel en español: los 50 EAN quedaron «${cientifico(lista[0].codigo)}».`, hojas: { usadas: [''], noUsadas: [] }, ...comun,
    notas: 'Antes: 1 producto con código «7,84E+12» y 49 «repetidos».' });

  // 22b: ese CSV abierto de nuevo y guardado como .xlsx: el mismo número redondeado en todas.
  let wb = new ExcelJS.Workbook();
  let ws = wb.addWorksheet('Hoja1');
  ws.addRow(titulos);
  lista.forEach((p) => { const r = ws.addRow([Number(cientifico(p.codigo).replace(',', '.')), p.nombre, p.costo, p.precio, p.stock]); r.getCell(1).numFmt = '0.00E+00'; });
  bytes = await guardar(wb, '22b_ean_redondeado.xlsx');
  esperar({ archivo: '22b_ean_redondeado.xlsx', bytes, caso: 'Ese CSV guardado como .xlsx: 7840000000000 en las 50 filas.', hojas: { usadas: ['Hoja1'], noUsadas: [] }, ...comun });

  // 22c: el texto «7,84E+12» pegado en un .xlsx.
  wb = new ExcelJS.Workbook();
  ws = wb.addWorksheet('Hoja1');
  ws.addRow(titulos);
  lista.forEach((p) => ws.addRow([cientifico(p.codigo), p.nombre, p.costo, p.precio, p.stock]));
  bytes = await guardar(wb, '22c_ean_texto_cientifico.xlsx');
  esperar({ archivo: '22c_ean_texto_cientifico.xlsx', bytes, caso: 'El texto «7,84E+12» pegado en las 50 filas de un .xlsx.', hojas: { usadas: ['Hoja1'], noUsadas: [] }, ...comun });

  // 22d (control): el EAN entero con formato científico: se VE 7,84E+12, pero el número está completo.
  wb = new ExcelJS.Workbook();
  ws = wb.addWorksheet('Hoja1');
  ws.addRow(titulos);
  lista.forEach((p) => { const r = ws.addRow([Number(p.codigo), p.nombre, p.costo, p.precio, p.stock]); r.getCell(1).numFmt = '0.00E+00'; });
  bytes = await guardar(wb, '22d_ean_formato_cientifico.xlsx');
  esperar({
    archivo: '22d_ean_formato_cientifico.xlsx', bytes, caso: 'El EAN completo con formato científico: el código está entero y se usa.',
    hojas: { usadas: ['Hoja1'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'costo', 'precio', 'stock']),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
  });
}

/** Exportaciones de un POS en inglés con otros títulos (23). */
async function p23() {
  const lista = productos(60, 2323, { rubros: ['Bebidas', 'Almacén', 'Limpieza'] });
  // 23: CSV estilo Vend/Lightspeed.
  const filas = [['handle', 'sku', 'name', 'type', 'supply_price', 'retail_price', 'inventory_Main_Outlet', 'reorder_point_Main_Outlet', 'tax_name']];
  lista.forEach((p, i) => filas.push([`h${i}`, p.codigo, p.nombre, p.categoria, p.costo, p.precio, p.stock, 5, 'IVA 10%']));
  let bytes = csv('23_pos_vend_export.csv', filas, { sep: ',' });
  esperar({
    archivo: '23_pos_vend_export.csv', bytes,
    caso: 'CSV de un POS en inglés (Vend/Lightspeed): handle, sku, name, type, supply_price, retail_price, inventory_Main_Outlet, reorder_point_Main_Outlet, tax_name.',
    hojas: { usadas: [''], noUsadas: [] },
    mapeo: { codigo: 'sku', nombre: 'name', categoria: 'type', costo: 'supply_price', precio: 'retail_price', stock: 'inventory_Main_Outlet', stock_minimo: 'reorder_point_Main_Outlet' },
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'categoria', 'costo', 'precio', 'stock'], () => ({ stock_minimo: 5 })),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: ['datos_no_usados: handle'],
    notas: 'Antes: precio = supply_price (el costo) en los 60, sin costo ni stock.',
  });

  // 23b: Item Code | Item Name | Purchase Price | Sale Price | On Hand.
  let wb = new ExcelJS.Workbook();
  let ws = wb.addWorksheet('Inventory');
  ws.addRow(['Item Code', 'Item Name', 'Purchase Price', 'Sale Price', 'On Hand']);
  lista.forEach((p) => ws.addRow([p.codigo, p.nombre, p.costo, p.precio, p.stock]));
  bytes = await guardar(wb, '23b_pos_purchase_sale.xlsx');
  esperar({
    archivo: '23b_pos_purchase_sale.xlsx', bytes, caso: 'Item Code | Item Name | Purchase Price | Sale Price | On Hand.',
    hojas: { usadas: ['Inventory'], noUsadas: [] },
    mapeo: { codigo: 'Item Code', nombre: 'Item Name', costo: 'Purchase Price', precio: 'Sale Price', stock: 'On Hand' },
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'costo', 'precio', 'stock']),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'Antes: precio = Purchase Price (el costo) y el costo vacío.',
  });

  // 23c: Wholesale antes que Retail.
  wb = new ExcelJS.Workbook();
  ws = wb.addWorksheet('Products');
  ws.addRow(['SKU', 'Product Name', 'Unit Cost', 'Wholesale Price', 'Retail Price', 'Stock']);
  lista.forEach((p) => ws.addRow([p.codigo, p.nombre, p.costo, redondear(p.costo * 1.12, 100), p.precio, p.stock]));
  bytes = await guardar(wb, '23c_pos_wholesale_retail.xlsx');
  esperar({
    archivo: '23c_pos_wholesale_retail.xlsx', bytes, caso: 'SKU | Product Name | Unit Cost | Wholesale Price | Retail Price | Stock.',
    hojas: { usadas: ['Products'], noUsadas: [] },
    mapeo: { codigo: 'SKU', nombre: 'Product Name', costo: 'Unit Cost', precio: 'Retail Price', stock: 'Stock' },
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'costo', 'precio', 'stock']),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: ['otro_precio_no_usado: «Wholesale Price»'],
  });
}

/** El mayorista antes que el minorista, escrito como en Paraguay (24). */
async function p24() {
  const lista = productos(40, 2424, { rubros: ['Almacén', 'Limpieza'] });
  const variantes = [
    ['24_precio_x_mayor.xlsx', 'Precio x Mayor', 'Precio x Menor'],
    ['24b_precio_mayor_menor.xlsx', 'Precio Mayor', 'Precio Menor'],
    ['24c_precio_caja_unidad.xlsx', 'Precio Caja (x mayor)', 'Precio Unidad'],
  ];
  for (const [archivo, mayor, menor] of variantes) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Lista de precios');
    ws.addRow(['Código', 'Producto', 'Costo', mayor, menor, 'Stock']);
    lista.forEach((p) => ws.addRow([p.codigo, p.nombre, p.costo, redondear(p.costo * 1.12, 100), p.precio, p.stock]));
    const bytes = await guardar(wb, archivo);
    esperar({
      archivo, bytes, caso: `Código | Producto | Costo | ${mayor} | ${menor} | Stock.`,
      hojas: { usadas: ['Lista de precios'], noUsadas: [] },
      mapeo: { codigo: 'Código', nombre: 'Producto', costo: 'Costo', precio: menor, stock: 'Stock' },
      productos: lista.length,
      todos: campos(lista, ['codigo', 'nombre', 'costo', 'precio', 'stock']),
      problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
      avisos: [`otro_precio_no_usado: «${mayor}»`],
      notas: 'Antes: el precio de venta era el mayorista (la primera de las dos columnas).',
    });
  }
}

/** El precio sin marca al lado del que dice «con IVA» (25). */
async function p25() {
  const lista = productos(45, 2525, { rubros: ['Almacén', 'Bebidas'] }).map((p, i) => ({ ...p, tasa: i % 3 === 0 ? 5 : 10 }));
  const neto = (p) => Math.round(p.precio / (1 + p.tasa / 100));
  let wb = new ExcelJS.Workbook();
  let ws = wb.addWorksheet('Productos');
  ws.addRow(['Código', 'Descripción', 'Costo', 'Precio Unitario', 'IVA 10%', 'IVA 5%', 'Precio c/IVA', 'Stock']);
  lista.forEach((p) => ws.addRow([p.codigo, p.nombre, p.costo, neto(p), p.tasa === 10 ? p.precio - neto(p) : 0, p.tasa === 5 ? p.precio - neto(p) : 0, p.precio, p.stock]));
  let bytes = await guardar(wb, '25_iva_neto_y_final.xlsx');
  esperar({
    archivo: '25_iva_neto_y_final.xlsx', bytes, caso: 'Facturación paraguaya: Costo | Precio Unitario (sin IVA, sin decirlo) | IVA 10% | IVA 5% | Precio c/IVA | Stock.',
    hojas: { usadas: ['Productos'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', costo: 'Costo', precio: 'Precio c/IVA', stock: 'Stock' },
    ignoradas: ['Precio Unitario', 'IVA 10%', 'IVA 5%'],
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'costo', 'precio', 'stock']),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'Antes: se tomaba «Precio Unitario» (sin IVA): 69.238 en lugar de 72.700.',
  });

  wb = new ExcelJS.Workbook();
  ws = wb.addWorksheet('Productos');
  ws.addRow(['Código', 'Descripción', 'Costo', 'Precio', 'IVA', 'Precio Final', 'Stock']);
  lista.forEach((p) => ws.addRow([p.codigo, p.nombre, p.costo, neto(p), p.precio - neto(p), p.precio, p.stock]));
  bytes = await guardar(wb, '25b_precio_iva_final.xlsx');
  esperar({
    archivo: '25b_precio_iva_final.xlsx', bytes, caso: 'Precio | IVA | Precio Final.',
    hojas: { usadas: ['Productos'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', costo: 'Costo', precio: 'Precio Final', stock: 'Stock' },
    ignoradas: ['Precio', 'IVA'],
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'costo', 'precio', 'stock']),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
  });
}

/** El CSV en UTF-16, con y sin BOM (26). */
async function p26() {
  const lista = productos(30, 2626, { rubros: ['Almacén', 'Lácteos'] }).filter((p) => p.unidad === 'un');
  const filas = [['Código', 'Descripción', 'Categoría', 'Costo', 'Precio', 'Stock'], ...lista.map((p) => [p.codigo, p.nombre, p.categoria, p.costo, p.precio, p.stock])];
  const comun = (archivo, caso, bytes) => ({
    archivo, bytes, caso,
    hojas: { usadas: [''], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', categoria: 'Categoría', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'categoria', 'costo', 'precio', 'stock']),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
  });
  esperar(comun('26_utf16_punto_y_coma.csv', 'UTF-16LE con BOM, separado por «;» (LibreOffice «Unicode»).', csv('26_utf16_punto_y_coma.csv', filas, { sep: ';', codificacion: 'utf16le', bom: true })));
  esperar(comun('26b_texto_unicode_excel.txt', '«Texto Unicode (*.txt)» de Excel: UTF-16LE con BOM, separado por tabulador.', csv('26b_texto_unicode_excel.txt', filas, { sep: '\t', codificacion: 'utf16le', bom: true })));
  esperar(comun('26c_utf16be.csv', 'UTF-16BE con BOM.', csv('26c_utf16be.csv', filas, { sep: ';', codificacion: 'utf16be', bom: true })));
  esperar(comun('26d_utf16_sin_bom.csv', 'UTF-16LE SIN BOM (se reconoce por los ceros).', csv('26d_utf16_sin_bom.csv', filas, { sep: ';', codificacion: 'utf16le' })));
}

async function p27() {
  // La categoría en una fila combinada a lo ancho (A:F), centrada y con color, SIN negrita ni mayúsculas.
  const lista = productos(36, 2727, { rubros: ['Bebidas', 'Almacén', 'Limpieza'] });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lista');
  ws.addRow(['Código', 'Producto', 'Costo', 'Precio', 'Stock', 'Obs.']);
  let fila = 2;
  const grupos = [...new Set(lista.map((p) => p.categoria))];
  const enOrden = [];
  for (const cat of grupos) {
    ws.addRow([cat]);
    ws.mergeCells(`A${fila}:F${fila}`);
    ws.getCell(`A${fila}`).alignment = { horizontal: 'center' };
    ws.getCell(`A${fila}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEEFF' } };
    fila++;
    for (const p of lista.filter((x) => x.categoria === cat)) { ws.addRow([p.codigo, p.nombre, p.costo, p.precio, p.stock]); enOrden.push(p); fila++; }
  }
  const bytes = await guardar(wb, '27_categoria_combinada.xlsx');
  esperar({
    archivo: '27_categoria_combinada.xlsx', bytes,
    caso: 'Las filas «Bebidas», «Almacén», «Limpieza» combinadas de A a F, centradas y con fondo de color, sin negrita.',
    hojas: { usadas: ['Lista'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Producto', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    productos: lista.length,
    todos: campos(enOrden, ['codigo', 'nombre', 'categoria', 'costo', 'precio', 'stock']),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'Antes: la categoría quedaba vacía y las filas contaban como notas.',
  });
}

async function p28() {
  // Códigos con ceros a la izquierda: el número 123 con formato «000000» (Excel muestra 000123).
  const lista = productos(30, 2828, { rubros: ['Almacén'] }).map((p, i) => ({ ...p, codigo: String(i * 37 + 5).padStart(6, '0') }));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Código', 'Descripción', 'Costo', 'Precio', 'Stock']);
  lista.forEach((p) => ws.addRow([Number(p.codigo), p.nombre, p.costo, p.precio, p.stock]));
  ws.getColumn(1).numFmt = '000000';
  const bytes = await guardar(wb, '28_codigos_con_ceros.xlsx');
  esperar({
    archivo: '28_codigos_con_ceros.xlsx', bytes,
    caso: 'El código es un número con formato «000000»: Excel muestra 000005, 000042… y así lo exporta el sistema de caja.',
    hojas: { usadas: ['Hoja1'], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'costo', 'precio', 'stock']),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0 },
    avisos: [],
    notas: 'Antes: el código llegaba «5» y el mismo producto del CSV del sistema («000005») se duplicaba.',
  });
}

async function p29() {
  // Un monto que la base no acepta: el envase con precio negativo, un costo negativo y un precio de 13 cifras.
  const lista = productos(40, 2929, { rubros: ['Bebidas'] }).filter((p) => p.unidad === 'un');
  const filas = [['Código', 'Descripción', 'Costo', 'Precio', 'Stock']];
  lista.forEach((p, i) => {
    filas.push([p.codigo, p.nombre, p.costo, p.precio, p.stock]);
    if (i === 5) filas.push(['ENV-1', 'Envase retornable 1L', 0, -1500, 40]);
    if (i === 10) filas.push(['AJ-1', 'Ajuste de inventario', -200, 0, 1]);
    if (i === 15) filas.push(['7840009999999', 'Fila con el código en el precio', 1000, '7840009999999', 3]);
  });
  const bytes = csv('29_montos_que_la_base_no_acepta.csv', filas, { sep: ';' });
  esperar({
    archivo: '29_montos_que_la_base_no_acepta.csv', bytes,
    caso: 'Un precio negativo («Envase retornable 1L»: -1500), un costo negativo y un precio de 13 cifras, entre productos buenos.',
    hojas: { usadas: [''], noUsadas: [] },
    mapeo: { codigo: 'Código', nombre: 'Descripción', costo: 'Costo', precio: 'Precio', stock: 'Stock' },
    productos: lista.length,
    todos: campos(lista, ['codigo', 'nombre', 'costo', 'precio', 'stock']),
    problemas: { sin_nombre: 0, sin_precio: 0, precio_menor_costo: 0, repetidos: 0, monto_invalido: 3 },
    avisos: [],
    notas: 'Antes: pasaban la revisión («se carga igual») y al guardar frenaban la tanda entera, siempre la misma.',
  });
}

/**
 * Arma el corpus en `carpeta` y devuelve lo esperado de cada planilla, en
 * orden. `soloChicas`: sin las de 20.000 filas (para mirar rápido).
 */
async function generarCorpus(carpeta, { soloChicas = false, alTerminarUna = null } = {}) {
  SALIDA = carpeta;
  fs.mkdirSync(SALIDA, { recursive: true });
  ESPERADO.length = 0;
  const pasos = [p01, p02, p03, p04, p05, p06, p07, p08, p09, p09b, p10, ...(soloChicas ? [] : [p11]), p12, p13, p14, p15, p16, p17, p18, p19, p20,
    p21, p21b, p22, p23, p24, p25, p26, p27, p28, p29];
  for (const p of pasos) {
    const t = Date.now();
    const antes = ESPERADO.length;
    await p();
    if (alTerminarUna) for (const e of ESPERADO.slice(antes)) alTerminarUna(e, Date.now() - t);
  }
  return ESPERADO.slice();
}

module.exports = { generarCorpus, ean13, productos, cientifico };

if (require.main === module) {
  const carpeta = process.argv[2] || path.join(process.cwd(), 'corpus-productos');
  generarCorpus(carpeta, {
    alTerminarUna: (e, ms) => console.log(`${e.archivo.padEnd(42)} ${String(e.bytes).padStart(9)} B  ${String(e.productos).padStart(6)} productos  ${ms} ms`),
  }).then((esperado) => {
    fs.writeFileSync(path.join(carpeta, 'esperado.json'), JSON.stringify(esperado, null, 2));
    console.log(`\n${esperado.length} planillas → ${carpeta}`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
