/**
 * «Subir planilla» en Productos (122): cómo se GUARDA la lista de productos.
 *
 * Sobre un PostgreSQL de verdad (PGlite) con todas las migraciones:
 *
 *   1. la migración corre dos veces más sin romper ni duplicar nada;
 *   2. el nombre para comparar de la base es el mismo que el de la pantalla;
 *   3. la tanda grande: 20.000 productos leídos de un CSV con el mismo lector
 *      de la pantalla, guardados en 20 tandas de 1.000; subir lo mismo otra
 *      vez no cambia nada; cambiar 2.000 precios actualiza 2.000;
 *   4. crea o actualiza SIN DUPLICAR: por código, por nombre escrito de otra
 *      forma, adoptando el código, el homónimo de otro proveedor, lo que ya
 *      es un servicio, el nuevo sin precio, el pausado que vuelve, el stock
 *      «dejar como está», los servicios sin costo;
 *   5. el stock inicial NO es un gasto de mercadería, y lo importado se vende
 *      con su costo (los reportes lo ven);
 *   6. los candados: solo quien puede editar productos, la cuenta personal
 *      (también en Gratis), el negocio vencido, el tope por tanda, la tanda
 *      mal armada, todo o nada, nada abierto a anon;
 *   7. otra empresa no se toca;
 *   8. lo que encontró la revisión del 01/10: el código que Excel rompió
 *      («7,84E+12») no le pone el precio de un producto a otro; 000123 y 123
 *      son el mismo; un monto negativo no frena la tanda.
 */
const H = require('./ayuda-db');
const ExcelJS = require('exceljs');
const P = require('../.compilado/planilla.js');
const X = require('../.compilado/planilla-xlsx.js');
const C = require('../.compilado/catalogo-planilla.js');
const CP = require('../.compilado/codigo-producto.js');
const { productos: datosDe } = require('./planillas-catalogo/generar.js');

let fallos = 0;
let corridas = 0;
const ok = (nombre, real, esperado) => {
  corridas++;
  const a = JSON.stringify(real) ?? 'undefined', b = JSON.stringify(esperado) ?? 'undefined';
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a.length > 110 ? a.slice(0, 107) + '...' : a}`);
};
const rechazado = (nombre, r, fragmento) => {
  corridas++;
  if (r.ok) { fallos++; console.log(`  ✗ ${nombre}: NO fue rechazada`); return; }
  if (fragmento && !new RegExp(fragmento, 'i').test(r.error)) { fallos++; console.log(`  ✗ ${nombre}: otro motivo: ${r.error}`); return; }
  console.log(`  ✓ ${nombre} → rechazada («${r.error}»)`);
};
const grupo = (t) => console.log(`\n── ${t} ──`);

const SQL_IMPORTAR = 'select public.importar_productos($1, $2::jsonb, $3::jsonb) r';
const importar = (db, uid, empresa, filas, opciones = {}) => H.comoUsuario(db, uid, async () =>
  (await db.query(SQL_IMPORTAR, [empresa, JSON.stringify(filas), JSON.stringify(opciones)])).rows[0].r);
const intentarImportar = (db, uid, empresa, filas, opciones = {}) => H.intentar(db, uid, async () =>
  (await db.query(SQL_IMPORTAR, [empresa, JSON.stringify(filas), JSON.stringify(opciones)])).rows[0].r);
const cotejar = (db, uid, empresa, filas, tipo = 'productos') => H.comoUsuario(db, uid, async () =>
  (await db.query('select public.cotejar_productos($1, $2::jsonb, $3) r', [empresa, JSON.stringify(filas), tipo])).rows[0].r);
const producto = async (db, empresa, nombre) =>
  (await db.query(`select nombre, codigo, categoria, costo::float, precio::float, stock::float, stock_minimo::float, activo, controla_stock, unidad
                   from public.productos where empresa_id = $1 and nombre = $2`, [empresa, nombre])).rows[0] ?? null;
const cuantos = async (db, empresa) => (await db.query('select count(*)::int n from public.productos where empresa_id = $1', [empresa])).rows[0].n;
const movimientos = async (db, empresa) => (await db.query('select count(*)::int n from public.movimientos where empresa_id = $1', [empresa])).rows[0].n;
const vencer = (db, id) => db.query(
  `update public.suscripciones set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day' where empresa_id = $1`, [id]);

/** Guardar como la pantalla: en tandas de TANDA_IMPORTAR, en orden. */
async function guardarEnTandas(db, uid, empresa, filas, opciones = {}) {
  const total = { creados: 0, actualizados: 0, reactivados: 0, sin_cambios: 0, renombrados: [], omitidos: [], tiempos: [] };
  for (let i = 0; i < filas.length; i += C.TANDA_IMPORTAR) {
    const t = Date.now();
    const r = await importar(db, uid, empresa, filas.slice(i, i + C.TANDA_IMPORTAR).map(C.filaParaGuardar), opciones);
    total.tiempos.push(Date.now() - t);
    total.creados += r.creados; total.actualizados += r.actualizados; total.reactivados += r.reactivados;
    total.sin_cambios += r.sin_cambios; total.renombrados.push(...r.renombrados); total.omitidos.push(...r.omitidos);
  }
  return total;
}

/** Una lista como la escribe el negocio, leída con el mismo lector de la pantalla. */
function leerCsv(lineas) {
  return C.leerCatalogo(P.libroDesdeCsv(new TextEncoder().encode(lineas.join('\r\n')), P.TOPES_CATALOGO));
}

(async () => {
  const t0 = Date.now();
  const db = await H.crearBase();
  console.log(`base con ${H.migraciones().length} migraciones en ${Date.now() - t0} ms`);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · la migración, dos veces más');
  // ═══════════════════════════════════════════════════════════
  await H.aplicarMigracion(db, '122');
  await H.aplicarMigracion(db, '122');
  ok('cada función de la 122 existe una sola vez',
    (await db.query(`select p.proname, count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname = 'public' and p.proname in ('clave_producto','codigo_sin_ceros','tope_importar_productos','importar_productos','cotejar_productos','listar_productos')
      group by p.proname order by 1`)).rows, [
      { proname: 'clave_producto', n: 1 }, { proname: 'codigo_sin_ceros', n: 1 }, { proname: 'cotejar_productos', n: 1 }, { proname: 'importar_productos', n: 1 },
      { proname: 'listar_productos', n: 1 }, { proname: 'tope_importar_productos', n: 1 }]);
  ok('las columnas y los índices',
    [(await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='productos'
      and column_name in ('codigo','unidad') order by 1`)).rows.map((r) => r.column_name),
    (await db.query(`select indexname from pg_indexes where schemaname='public' and tablename='productos'
      and indexname in ('productos_codigo_unico','productos_clave_idx','productos_codigo_sin_ceros_idx') order by 1`)).rows.map((r) => r.indexname)],
    [['codigo', 'unidad'], ['productos_clave_idx', 'productos_codigo_sin_ceros_idx', 'productos_codigo_unico']]);
  ok('la tanda de la base es la de la pantalla', (await db.query('select public.tope_importar_productos() n')).rows[0].n, C.TANDA_IMPORTAR);
  const anon = (await db.query(`select
      has_function_privilege('anon', 'public.importar_productos(uuid, jsonb, jsonb)', 'execute') a,
      has_function_privilege('anon', 'public.cotejar_productos(uuid, jsonb, text)', 'execute') b,
      has_function_privilege('anon', 'public.clave_producto(text)', 'execute') c,
      has_function_privilege('authenticated', 'public.importar_productos(uuid, jsonb, jsonb)', 'execute') d,
      has_function_privilege('authenticated', 'public.cotejar_productos(uuid, jsonb, text)', 'execute') e`)).rows[0];
  ok('nada abierto a anon; authenticated sí puede llamarlas', [anon.a, anon.b, anon.c, anon.d, anon.e], [false, false, false, true, true]);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · el nombre para comparar: el mismo en la base y en la pantalla');
  // ═══════════════════════════════════════════════════════════
  const NBSP = String.fromCharCode(0xa0);
  const frases = ['  Yerba  Mate  PAJARITO 1kg ', 'Azúcar Azpa 1kg', `Yerba Kurupí Menta y Limón 1kg${NBSP}`,
    `Coca${String.fromCharCode(0x200b)}Cola`, 'Ñandutí Pão', 'CAFÉ AÇÚCAR ÜBER', `Leche${String.fromCharCode(0x2007)}Trébol${String.fromCharCode(0x202f)}1L`,
    `Té${String.fromCharCode(9)}Negro${String.fromCharCode(0xfeff)}`, 'ÀÂÃÄ ÈÊË ÌÎÏ ÒÔÕÖ ÙÛ'];
  const enSql = [];
  for (const f of frases) enSql.push((await db.query('select public.clave_producto($1) c', [f])).rows[0].c);
  ok('las mismas frases, la misma clave', enSql, frases.map(C.claveProducto));
  const codigos = ['000123', '123', '0012345678905', '0', '000', '7840001000073', 'BEB-001', '00A1', 'X-1', '0,5'];
  const codigosEnSql = [];
  for (const c of codigos) codigosEnSql.push((await db.query('select public.codigo_sin_ceros($1) c', [c])).rows[0].c);
  ok('los mismos códigos, sin los mismos ceros (la base, Vender y el lector)', codigosEnSql, codigos.map(CP.codigoSinCeros));
  ok('…y con los ceros que tienen que irse', codigosEnSql.slice(0, 5), ['123', '123', '12345678905', '0', '0']);

  const A = await H.montarEmpresa(db, { email: 'almacen@x.com', nombre: 'Almacén Don Pedro', rubro: 'comercio' });
  const vendedor = await H.sumarMiembro(db, A.empresaId, 'vende@x.com', 'vendedor');
  const admin = await H.sumarMiembro(db, A.empresaId, 'admin@x.com', 'admin');

  // ═══════════════════════════════════════════════════════════
  grupo('3 · la tanda grande: 20.000 productos de un CSV');
  // ═══════════════════════════════════════════════════════════
  const veinteMil = datosDe(20000, 1111, { conVariante: true });
  const lineas = ['Código;Descripción;Rubro;Costo;Precio;Stock',
    ...veinteMil.map((p) => [p.codigo, p.nombre, p.categoria, p.costo, p.precio, String(p.stock).replace('.', ',')].join(';'))];
  const leidos = leerCsv(lineas);
  ok('el lector de la pantalla entiende 20.000', leidos.productos.length, 20000);
  const movAntes = await movimientos(db, A.empresaId);
  const t3 = Date.now();
  const primera = await guardarEnTandas(db, A.uid, A.empresaId, leidos.productos);
  console.log(`     20 tandas en ${Date.now() - t3} ms (PGlite; la más lenta: ${Math.max(...primera.tiempos)} ms)`);
  ok('20 tandas, 20.000 creados', [primera.tiempos.length, primera.creados, primera.actualizados, primera.omitidos.length], [20, 20000, 0, 0]);
  ok('cada tanda, muy lejos de los 8 s de Supabase (aun en PGlite, que es más lento)', Math.max(...primera.tiempos) < 6000, true);
  ok('en la base hay 20.000', await cuantos(db, A.empresaId), 20000);
  ok('el stock inicial no es una compra: ni un movimiento nuevo', (await movimientos(db, A.empresaId)) - movAntes, 0);
  const p0 = await producto(db, A.empresaId, veinteMil[0].nombre);
  ok('el primero quedó tal cual', p0 && { codigo: p0.codigo, categoria: p0.categoria, costo: p0.costo, precio: p0.precio, stock: p0.stock, controla_stock: p0.controla_stock },
    { codigo: veinteMil[0].codigo, categoria: veinteMil[0].categoria, costo: veinteMil[0].costo, precio: veinteMil[0].precio, stock: veinteMil[0].stock, controla_stock: true });
  const conDecimales = veinteMil.find((p) => !Number.isInteger(p.stock));
  ok('el stock con coma decimal («12,5») llega bien', (await producto(db, A.empresaId, conDecimales.nombre)).stock, conDecimales.stock);

  const otraVez = await guardarEnTandas(db, A.uid, A.empresaId, leidos.productos);
  ok('subir la misma planilla otra vez: 20.000 sin cambios, nada creado', [otraVez.sin_cambios, otraVez.creados, otraVez.actualizados], [20000, 0, 0]);
  const nuevosPrecios = leerCsv(['Código;Descripción;Rubro;Costo;Precio;Stock',
    ...veinteMil.map((p, i) => [p.codigo, p.nombre, p.categoria, p.costo, i % 10 === 0 ? p.precio + 500 : p.precio, String(p.stock).replace('.', ',')].join(';'))]);
  const cambio = await guardarEnTandas(db, A.uid, A.empresaId, nuevosPrecios.productos);
  ok('uno de cada diez con precio nuevo: 2.000 actualizados, sin duplicar', [cambio.actualizados, cambio.sin_cambios, cambio.creados, await cuantos(db, A.empresaId)], [2000, 18000, 0, 20000]);
  ok('…y el precio nuevo quedó', (await producto(db, A.empresaId, veinteMil[0].nombre)).precio, veinteMil[0].precio + 500);

  const muestra = leidos.productos.slice(0, 4990).map((p) => ({ codigo: p.codigo, nombre: p.nombre }))
    .concat(Array.from({ length: 10 }, (_, i) => ({ codigo: `NUEVO-${i}`, nombre: `Producto nuevo ${i}` })));
  const t4 = Date.now();
  const cot = await cotejar(db, A.uid, A.empresaId, muestra);
  console.log(`     cotejar 5.000: ${Date.now() - t4} ms`);
  ok('cotejar 5.000 antes de guardar: 4.990 existen y 10 son nuevos', { existe: cot.filter((x) => x === 'existe').length, nuevo: cot.filter((x) => x === 'nuevo').length, largo: cot.length }, { existe: 4990, nuevo: 10, largo: 5000 });
  const lista = await H.comoUsuario(db, A.uid, async () => (await db.query('select public.listar_productos($1, false) j', [A.empresaId])).rows[0].j);
  ok('listar_productos (Vender) trae los 20.000, con código y unidad', [lista.length, 'codigo' in lista[0], 'unidad' in lista[0]], [20000, true, true]);
  const delVendedor = await H.comoUsuario(db, vendedor, async () => (await db.query('select public.listar_productos($1, false) j', [A.empresaId])).rows[0].j);
  ok('al vendedor le llega el precio y el código, el costo no', [delVendedor[0].costo, delVendedor[0].codigo !== null, delVendedor[0].precio > 0], [null, true, true]);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · crea o actualiza, sin duplicar');
  // ═══════════════════════════════════════════════════════════
  const B = await H.montarEmpresa(db, { email: 'despensa@x.com', nombre: 'Despensa Rosa', rubro: 'comercio' });
  const crear = (d) => H.crearProducto(db, B.empresaId, B.uid, d);
  await crear({ nombre: 'Yerba Mate Pajarito 500g', costo: 8000, precio: 11000, stock: 3 });
  await crear({ nombre: 'Azúcar Azpa 1kg', costo: 6000, precio: 8000, stock: 10 });
  await crear({ nombre: 'Corte de pelo', costo: 0, precio: 40000, controla_stock: false });
  const pausadoId = await crear({ nombre: 'Leche Trébol Entera 1L', costo: 5000, precio: 7000, stock: 0 });
  await db.query('update public.productos set activo = false where id = $1', [pausadoId]);
  await crear({ nombre: 'Gaseosa Coca-Cola 2L', costo: 9000, precio: 12000, stock: 5 });
  await db.query("update public.productos set codigo = '7840000000001' where empresa_id = $1 and nombre = 'Gaseosa Coca-Cola 2L'", [B.empresaId]);

  const filas = [
    { fila: 2, nombre: 'yerba  mate pajarito 500g', precio: 12000, stock: 7 },               // por nombre, sin código
    { fila: 3, codigo: '7840000000099', nombre: 'Azucar Azpa 1kg', costo: 6500, precio: 8500 }, // por nombre, adopta el código
    { fila: 4, nombre: 'Corte de pelo', costo: 100, precio: 45000, stock: 1 },               // es un servicio: no se toca
    { fila: 5, nombre: 'Leche Trébol Entera 1L', precio: 7500, stock: 24 },                  // pausado: vuelve a la venta
    { fila: 6, codigo: '7840000000002', nombre: 'Gaseosa Coca-Cola 2L', precio: 13000 },     // mismo nombre, OTRO código
    { fila: 7, codigo: '7840000000001', nombre: 'Coca-Cola 2 litros', precio: 12500 },       // por código: toma el nombre nuevo
    { fila: 8, nombre: 'Chipa por docena' },                                                 // nuevo sin precio: no se crea
    { fila: 9, nombre: 'Hielo 3kg', precio: 9000, unidad: 'un' },                            // nuevo
  ];
  ok('cotejar antes de guardar', await cotejar(db, B.uid, B.empresaId, filas.map((f) => ({ codigo: f.codigo, nombre: f.nombre }))),
    ['existe', 'existe', 'otro_tipo', 'pausado', 'nuevo', 'existe', 'nuevo', 'nuevo']);
  const r = await importar(db, B.uid, B.empresaId, filas);
  ok('el resultado', { creados: r.creados, actualizados: r.actualizados, reactivados: r.reactivados, sin_cambios: r.sin_cambios },
    { creados: 2, actualizados: 4, reactivados: 1, sin_cambios: 0 });
  ok('lo que no se cargó, con su fila y su motivo', r.omitidos.map((o) => `${o.fila}:${o.motivo}`), ['4:otro_tipo', '8:sin_precio']);
  ok('el homónimo de otro proveedor se guarda con su código', r.renombrados, [{ fila: 6, nombre: 'Gaseosa Coca-Cola 2L (7840000000002)' }]);
  const yerba = await producto(db, B.empresaId, 'Yerba Mate Pajarito 500g');
  ok('por nombre: precio y stock nuevos, el nombre de Orden queda, el costo (que no vino) no se toca', yerba && [yerba.precio, yerba.stock, yerba.costo], [12000, 7, 8000]);
  ok('adoptó el código', (await producto(db, B.empresaId, 'Azúcar Azpa 1kg'))?.codigo, '7840000000099');
  ok('el servicio no se tocó', (await producto(db, B.empresaId, 'Corte de pelo'))?.precio, 40000);
  const leche = await producto(db, B.empresaId, 'Leche Trébol Entera 1L');
  ok('el pausado vuelve a la venta', leche && [leche.activo, leche.stock, leche.precio], [true, 24, 7500]);
  ok('por código: se llama como dice la planilla', (await producto(db, B.empresaId, 'Coca-Cola 2 litros'))?.codigo, '7840000000001');
  ok('el homónimo existe aparte', (await producto(db, B.empresaId, 'Gaseosa Coca-Cola 2L (7840000000002)'))?.precio, 13000);
  ok('el nuevo, con lo de siempre donde no vino (General, costo 0) y su unidad',
    await producto(db, B.empresaId, 'Hielo 3kg'), { nombre: 'Hielo 3kg', codigo: null, categoria: 'General', costo: 0, precio: 9000, stock: 0, stock_minimo: 0, activo: true, controla_stock: true, unidad: 'un' });
  ok('stock «dejar como está»', (await importar(db, B.uid, B.empresaId, [{ fila: 2, nombre: 'Hielo 3kg', precio: 9500, stock: 99 }], { stock: 'no_tocar' })).actualizados, 1);
  ok('…el precio cambió y el stock quedó', [(await producto(db, B.empresaId, 'Hielo 3kg')).precio, (await producto(db, B.empresaId, 'Hielo 3kg')).stock], [9500, 0]);
  const serv = await importar(db, B.uid, B.empresaId, [{ fila: 2, nombre: 'Barba', precio: 25000, costo: 999, stock: 5 }], { tipo: 'servicios' });
  const barba = await producto(db, B.empresaId, 'Barba');
  ok('desde la pestaña Servicios: nace servicio, sin costo ni stock', serv.creados === 1 && [barba.controla_stock, barba.costo, barba.stock], [false, 0, 0]);
  const mixta = await importar(db, B.uid, B.empresaId, [
    { fila: 2, nombre: 'Corte clásico', precio: 40000, servicio: true },
    { fila: 9, nombre: 'Cera para el pelo', costo: 18000, precio: 30000, stock: 12, servicio: false },
  ]);
  ok('la barbería: la tabla de servicios y la de productos en la misma tanda (20)',
    [mixta.creados, (await producto(db, B.empresaId, 'Corte clásico')).controla_stock, (await producto(db, B.empresaId, 'Cera para el pelo')).stock], [2, false, 12]);
  const dup = await importar(db, B.uid, B.empresaId, [
    { fila: 2, codigo: 'X-1', nombre: 'Pan felipe', precio: 1000 },
    { fila: 3, codigo: 'X-1', nombre: 'Pan felipe', precio: 1200 },
  ]);
  ok('el mismo código dos veces en una tanda: se crea uno y la segunda lo actualiza', [dup.creados, dup.actualizados, (await producto(db, B.empresaId, 'Pan felipe')).precio], [1, 1, 1200]);
  const nombreRaro = await importar(db, B.uid, B.empresaId, [{ fila: 2, nombre: `  Pan${NBSP}de  ${String.fromCharCode(0x200b)}queso `, precio: 3000 }]);
  ok('el nombre se guarda limpio (sin espacios invisibles ni de más)', [nombreRaro.creados, (await producto(db, B.empresaId, 'Pan de queso'))?.precio], [1, 3000]);
  ok('un código con espacios en los bordes no entra por la puerta de atrás',
    (await H.intentar(db, B.uid, () => db.query("update public.productos set codigo = ' Z-9 ' where empresa_id = $1 and nombre = 'Pan de queso'", [B.empresaId]))).ok, false);
  ok('ni un código repetido en el mismo negocio',
    (await H.intentar(db, B.uid, () => db.query("update public.productos set codigo = 'X-1' where empresa_id = $1 and nombre = 'Pan de queso'", [B.empresaId]))).ok, false);

  // La planilla 07 del corpus (sin código, nombres escritos distinto), contra lo que ya está en Orden.
  const S = await H.montarEmpresa(db, { email: 'sincodigo@x.com', nombre: 'Almacén Sin Código', rubro: 'comercio' });
  const lista07 = datosDe(25, 707, { rubros: ['Almacén'] });
  for (const p of lista07.slice(0, 4)) await H.crearProducto(db, S.empresaId, S.uid, { nombre: p.nombre, costo: 1, precio: 2, stock: 1 });
  const escrito = (p, i) => (i === 0 ? p.nombre.toLowerCase() : i === 1 ? `  ${p.nombre.replace(/ /g, '  ')} `
    : i === 2 ? p.nombre.normalize('NFD').replace(new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'), '')
      : i === 3 ? p.nombre + NBSP : p.nombre);
  const leidos07 = leerCsv(['Producto;Categoría;Costo;Precio', ...lista07.map((p, i) => [escrito(p, i), p.categoria, p.costo, p.precio].join(';'))]);
  const cot07 = await cotejar(db, S.uid, S.empresaId, leidos07.productos.map((p) => ({ codigo: p.codigo, nombre: p.nombre })));
  ok('07 · cotejar: se crean 21, se actualizan 4', { nuevo: cot07.filter((x) => x === 'nuevo').length, existe: cot07.filter((x) => x === 'existe').length }, { nuevo: 21, existe: 4 });
  const r07 = await guardarEnTandas(db, S.uid, S.empresaId, leidos07.productos);
  ok('07 · guardar: 21 creados y 4 actualizados, sin duplicar', [r07.creados, r07.actualizados, await cuantos(db, S.empresaId)], [21, 4, 25]);
  ok('07 · el nombre que ya tenía en Orden queda', (await Promise.all(lista07.slice(0, 4).map((p) => producto(db, S.empresaId, p.nombre)))).map((p) => p && p.precio),
    lista07.slice(0, 4).map((p) => p.precio));

  // ═══════════════════════════════════════════════════════════
  grupo('5 · el stock no es un gasto, y lo importado se vende con su costo');
  // ═══════════════════════════════════════════════════════════
  const hoy = 'current_date - 1, current_date + 1';
  const resumenAntes = await H.comoUsuario(db, A.uid, async () => (await db.query(`select public.resumen_financiero($1, ${hoy}) r`, [A.empresaId])).rows[0].r);
  ok('después de importar 20.000 con stock: sin gastos ni compras de mercadería', [Number(resumenAntes.gastos), Number(resumenAntes.compras_mercaderia), Number(resumenAntes.ventas)], [0, 0, 0]);
  const vendido = veinteMil[5];
  const id = (await db.query('select id from public.productos where empresa_id = $1 and nombre = $2', [A.empresaId, vendido.nombre])).rows[0].id;
  const venta = await H.comoUsuario(db, A.uid, async () => (await db.query(
    "select public.registrar_venta($1,$2::jsonb,null,'Venta','efectivo','','','manual',0,null,null) id",
    [A.empresaId, JSON.stringify([{ producto_id: id, nombre: 'x', cantidad: 2, precio_unitario: vendido.precio }])])).rows[0].id);
  const item = (await db.query('select costo_unitario::float c, afecto_stock from public.movimiento_items where movimiento_id = $1', [venta])).rows[0];
  ok('la línea de la venta lleva el costo de la planilla y mueve el stock', [item.c, item.afecto_stock], [vendido.costo, true]);
  ok('el stock bajó 2', (await producto(db, A.empresaId, vendido.nombre)).stock, vendido.stock - 2);
  const res = await H.comoUsuario(db, A.uid, async () => (await db.query(`select public.resumen_financiero($1, ${hoy}) r`, [A.empresaId])).rows[0].r);
  ok('los reportes: lo vendido con su costo y su ganancia, sin gasto de mercadería',
    [Number(res.ventas), Number(res.costo_mercaderia), Number(res.ganancia_bruta), Number(res.gastos)],
    [vendido.precio * 2, vendido.costo * 2, (vendido.precio - vendido.costo) * 2, 0]);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · los candados');
  // ═══════════════════════════════════════════════════════════
  const una = [{ fila: 2, nombre: 'Algo', precio: 1 }];
  rechazado('un vendedor no sube la lista', await intentarImportar(db, vendedor, A.empresaId, una), 'dueño o de un administrador');
  rechazado('ni coteja', await H.intentar(db, vendedor, () => db.query('select public.cotejar_productos($1, $2::jsonb)', [A.empresaId, JSON.stringify(una)])), 'dueño o de un administrador');
  ok('un administrador sí', (await importar(db, admin, A.empresaId, [{ fila: 2, nombre: 'Lo cargó el admin', precio: 1500 }])).creados, 1);
  const otro = await H.crearUsuario(db, 'nadie@x.com');
  rechazado('alguien de otra cuenta', await intentarImportar(db, otro, A.empresaId, una), 'No pertenecés');
  rechazado('sin sesión', await intentarImportar(db, null, A.empresaId, una), 'iniciar sesión');
  rechazado('1.001 filas en una tanda', await intentarImportar(db, A.uid, A.empresaId, Array.from({ length: 1001 }, (_, i) => ({ fila: i + 2, nombre: `N${i}`, precio: 1 }))), 'hasta 1.000');
  rechazado('una tanda vacía', await intentarImportar(db, A.uid, A.empresaId, []), 'ningún producto');
  rechazado('un monto en texto (armado a mano)', await intentarImportar(db, A.uid, A.empresaId, [{ fila: 5, nombre: 'X', precio: 'Gs. 15.000' }]), 'fila 5 tiene un número');
  rechazado('un monto negativo', await intentarImportar(db, A.uid, A.empresaId, [{ fila: 6, nombre: 'X', precio: -1 }]), 'fila 6 tiene un monto negativo');
  rechazado('un número enorme', await intentarImportar(db, A.uid, A.empresaId, [{ fila: 8, nombre: 'X', precio: 1e13 }]), 'fila 8 tiene un número demasiado grande');
  rechazado('una fila sin nombre', await intentarImportar(db, A.uid, A.empresaId, [{ fila: 7, nombre: '  ', precio: 1 }]), 'fila 7 no tiene nombre');
  rechazado('una fila que no es un objeto', await intentarImportar(db, A.uid, A.empresaId, ['hola']), 'mal armada');
  rechazado('opciones que no existen', await intentarImportar(db, A.uid, A.empresaId, una, { stock: 'sumar' }), 'opciones');
  const antes = await cuantos(db, A.empresaId);
  await intentarImportar(db, A.uid, A.empresaId, [{ fila: 2, nombre: 'Bueno 1', precio: 1 }, { fila: 3, nombre: '', precio: 1 }]);
  ok('todo o nada: la fila buena de una tanda mala tampoco quedó', await cuantos(db, A.empresaId), antes);
  const Pe = await H.montarEmpresa(db, { email: 'yo@x.com', nombre: 'Mis cuentas', tipoCuenta: 'personal' });
  rechazado('una cuenta personal', await intentarImportar(db, Pe.uid, Pe.empresaId, una), 'personal no lleva productos');
  const Pg = await H.montarEmpresa(db, { email: 'gratis@x.com', nombre: 'Mis cuentas gratis', tipoCuenta: 'personal' });
  await vencer(db, Pg.empresaId);
  ok('(la personal vencida está en Gratis)', (await db.query('select public.es_gratis_personal($1) g', [Pg.empresaId])).rows[0].g, true);
  rechazado('una cuenta personal en Gratis', await intentarImportar(db, Pg.uid, Pg.empresaId, una), 'personal no lleva productos');
  const V = await H.montarEmpresa(db, { email: 'vencido@x.com', nombre: 'Kiosco vencido', rubro: 'comercio' });
  await H.crearProducto(db, V.empresaId, V.uid, { nombre: 'Caramelo', costo: 100, precio: 200, stock: 10 });
  await vencer(db, V.empresaId);
  rechazado('un negocio vencido: el mensaje del candado', await intentarImportar(db, V.uid, V.empresaId, una), 'Se te terminó la prueba');
  rechazado('tampoco actualiza lo que ya tenía', await intentarImportar(db, V.uid, V.empresaId, [{ fila: 2, nombre: 'Caramelo', precio: 250 }]), 'Se te terminó la prueba');
  ok('…y su lista quedó como estaba', (await producto(db, V.empresaId, 'Caramelo')).precio, 200);
  ok('cotejar sí le contesta (solo lee: puede mirar su planilla)', (await cotejar(db, V.uid, V.empresaId, [{ nombre: 'caramelo' }])), ['existe']);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · otra empresa no se toca');
  // ═══════════════════════════════════════════════════════════
  // (el 11: el 10 cambió de precio en el grupo 3)
  const codigoDeA = veinteMil[11].codigo;
  const deBAntes = await cuantos(db, B.empresaId);
  rechazado('el dueño de A no puede subir a B', await intentarImportar(db, A.uid, B.empresaId, una), 'No pertenecés');
  const enB = await importar(db, B.uid, B.empresaId, [{ fila: 2, codigo: codigoDeA, nombre: 'Lo mismo pero en B', precio: 1 }]);
  ok('el mismo código en otra empresa es otro producto: B crea el suyo', [enB.creados, enB.actualizados, await cuantos(db, B.empresaId)], [1, 0, deBAntes + 1]);
  const deA = (await db.query('select nombre, precio::float from public.productos where empresa_id = $1 and codigo = $2', [A.empresaId, codigoDeA])).rows[0];
  ok('y el de A quedó como estaba', [deA.nombre, deA.precio], [veinteMil[11].nombre, veinteMil[11].precio]);
  const cotB = await cotejar(db, B.uid, B.empresaId, [{ codigo: veinteMil[12].codigo, nombre: veinteMil[12].nombre }]);
  ok('cotejar en B no ve los productos de A', cotB, ['nuevo']);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · lo que encontró la revisión del 01/10');
  // ═══════════════════════════════════════════════════════════
  ok('codigo_sin_ceros tampoco está abierta a anon',
    (await db.query("select has_function_privilege('anon', 'public.codigo_sin_ceros(text)', 'execute') a")).rows[0].a, false);

  // A. Los ceros de adelante: primero el Excel (formato «000000»), después el CSV del sistema de caja.
  const Z = await H.montarEmpresa(db, { email: 'ceros@x.com', nombre: 'Almacén Ceros', rubro: 'comercio' });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Código', 'Descripción', 'Costo', 'Precio', 'Stock']);
  ws.addRow([123, 'Yerba Pajarito 500g', 8000, 11000, 5]);
  ws.addRow([45, 'Azúcar Azpa 1kg', 6000, 8000, 3]);
  ws.getColumn(1).numFmt = '000000';
  const libroXlsx = await X.leerXlsx(new Uint8Array(await wb.xlsx.writeBuffer()), { topes: P.TOPES_CATALOGO, ocultas: true, numeros: true });
  const deExcel = C.leerCatalogo(P.compactoALibro(JSON.parse(JSON.stringify(P.libroACompacto(libroXlsx)))));
  ok('A · el Excel con formato «000000»: los códigos con sus ceros', deExcel.productos.map((p) => p.codigo), ['000123', '000045']);
  ok('A · se crean los dos', (await guardarEnTandas(db, Z.uid, Z.empresaId, deExcel.productos)).creados, 2);
  const deCsv = leerCsv(['Código;Descripción;Costo;Precio;Stock', '000123;Yerba Pajarito 500g;8000;11500;5', '000045;Azúcar Azpa 1kg;6000;8200;3']);
  ok('A · el CSV del sistema de caja: ya existen (antes: «nuevo», y se duplicaban como «Yerba (000123)»)',
    await cotejar(db, Z.uid, Z.empresaId, deCsv.productos.map((p) => ({ codigo: p.codigo, nombre: p.nombre }))), ['existe', 'existe']);
  const rCsv = await guardarEnTandas(db, Z.uid, Z.empresaId, deCsv.productos);
  ok('A · se actualizan, sin duplicar ni renombrar', [rCsv.creados, rCsv.actualizados, rCsv.renombrados.length, await cuantos(db, Z.empresaId)], [0, 2, 0, 2]);
  ok('A · …con el precio nuevo', (await producto(db, Z.empresaId, 'Yerba Pajarito 500g')).precio, 11500);
  await importar(db, Z.uid, Z.empresaId, [{ fila: 2, codigo: '777', nombre: 'Pan felipe', precio: 1000 }]);
  ok('A · lo guardado como 777 se encuentra con 000777 (la base empareja sin los ceros de adelante)',
    [await cotejar(db, Z.uid, Z.empresaId, [{ codigo: '000777', nombre: 'Pan felipe' }]),
      (await importar(db, Z.uid, Z.empresaId, [{ fila: 2, codigo: '000777', nombre: 'Pan felipe', precio: 1200 }])).actualizados,
      (await producto(db, Z.empresaId, 'Pan felipe')).codigo, (await producto(db, Z.empresaId, 'Pan felipe')).precio], [['existe'], 1, '777', 1200]);

  // B. El código que Excel rompió («7,84E+12» en todas las filas del CSV).
  const Ci = await H.montarEmpresa(db, { email: 'cientifico@x.com', nombre: 'Despensa Científica', rubro: 'comercio' });
  await H.crearProducto(db, Ci.empresaId, Ci.uid, { nombre: 'Coca-Cola 2L', costo: 9000, precio: 12000, stock: 4 });
  const lista1 = leerCsv(['Código;Descripción;Costo;Precio;Stock', ...['Fanta 2L', 'Sprite 2L', 'Pilsen lata', 'Agua La Fuente 2L'].map((n, i) => `7,84E+12;${n};${3000 + i};${5000 + i};10`)]);
  ok('B · la lista de 4 con «7,84E+12»: los 4, sin código y con el aviso (antes: 1, y 3 «repetidos»)',
    [lista1.productos.length, lista1.productos.filter((p) => p.codigo).length, lista1.avisos.some((a) => a.codigo === 'codigos_no_usados')], [4, 0, true]);
  ok('B · se crean los 4', (await guardarEnTandas(db, Ci.uid, Ci.empresaId, lista1.productos)).creados, 4);
  const lista2 = leerCsv(['Código;Descripción;Costo;Precio;Stock', '7,84E+12;Coca-Cola 2L;9500;13000;24']);
  ok('B · al mes, la Coca-Cola con el mismo «código»: es la Coca-Cola', await cotejar(db, Ci.uid, Ci.empresaId, lista2.productos.map((p) => ({ codigo: p.codigo, nombre: p.nombre }))), ['existe']);
  await guardarEnTandas(db, Ci.uid, Ci.empresaId, lista2.productos);
  const coca = await producto(db, Ci.empresaId, 'Coca-Cola 2L');
  const agua = await producto(db, Ci.empresaId, 'Agua La Fuente 2L');
  ok('B · la Coca-Cola queda con su precio nuevo, y el agua con el suyo (antes: el agua se quedaba con el de la Coca)',
    [coca.precio, coca.stock, agua.precio, agua.costo, agua.codigo], [13000, 24, 5003, 3003, null]);
  // Y si el código roto ya estaba guardado (o llega un número redondeado en una sola fila): la base no cruza los productos.
  await db.query("update public.productos set codigo = '7840000000000' where empresa_id = $1 and nombre = 'Agua La Fuente 2L'", [Ci.empresaId]);
  const cruzada = [{ fila: 2, codigo: '7840000000000', nombre: 'Coca-Cola 2L', costo: 9900, precio: 14000, stock: 30 }];
  ok('B · cotejar: el código es del agua y el nombre de la Coca-Cola → «codigo_de_otro»', await cotejar(db, Ci.uid, Ci.empresaId, cruzada), ['codigo_de_otro']);
  const rCruzada = await importar(db, Ci.uid, Ci.empresaId, cruzada);
  ok('B · importar: no toca a ninguno, y lo dice con su fila y su motivo',
    [rCruzada.actualizados, rCruzada.creados, rCruzada.omitidos.map((o) => `${o.fila}:${o.nombre}:${o.motivo}`)], [0, 0, ['2:Coca-Cola 2L:codigo_de_otro']]);
  ok('B · …el agua y la Coca-Cola quedaron como estaban',
    [(await producto(db, Ci.empresaId, 'Agua La Fuente 2L')).precio, (await producto(db, Ci.empresaId, 'Coca-Cola 2L')).precio], [5003, 13000]);
  ok('B · por código con un nombre que no es de nadie: sigue siendo el mismo producto con su nombre nuevo',
    (await importar(db, Ci.uid, Ci.empresaId, [{ fila: 2, codigo: '7840000000000', nombre: 'Agua La Fuente 2 litros', precio: 5100 }])).actualizados, 1);

  // C. Un monto negativo: la revisión lo saca, y las tandas entran todas (antes: la 2 fallaba siempre).
  const N = await H.montarEmpresa(db, { email: 'envases@x.com', nombre: 'Kiosco Envases', rubro: 'comercio' });
  const conNegativo = ['Código;Descripción;Costo;Precio;Stock'];
  for (let i = 0; i < 2500; i++) conNegativo.push(i === 1500 ? 'ENV-1;Envase retornable 1L;0;-1500;40' : `P-${i};Producto ${i};1000;1500;5`);
  const leidoNegativo = leerCsv(conNegativo);
  ok('C · la revisión: 2.499 a guardar, y el envase como «monto que no se carga» con su fila',
    [leidoNegativo.productos.length, leidoNegativo.problemas.monto_invalido.ejemplos.map((p) => [p.fila, p.nombre, p.valor])], [2499, [[1502, 'Envase retornable 1L', '-1500']]]);
  let cortada = null;
  let rNegativo = null;
  try { rNegativo = await guardarEnTandas(db, N.uid, N.empresaId, leidoNegativo.productos); } catch (e) { cortada = e.message; }
  ok('C · las 3 tandas entran, sin cortarse', [cortada, rNegativo && rNegativo.creados, await cuantos(db, N.empresaId)], [null, 2499, 2499]);

  console.log(`\n${fallos ? `✗ ${fallos} DE ${corridas} FALLARON` : `>>> TODAS LAS PRUEBAS PASARON (${corridas} comprobaciones)`} · ${Date.now() - t0} ms`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
