/**
 * Lecturas escalables: volumen, reconciliación SQL ↔ TypeScript y tope de filas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ PRUEBA ESTO Y QUÉ NO
 *
 * SÍ prueba, contra PostgreSQL real (PGlite):
 *   · que los agregados den exactos con 20.001 movimientos;
 *   · que PostgreSQL y calculos.ts produzcan los MISMOS números;
 *   · que cada respuesta agregada quepa muy por debajo de cualquier tope
 *     razonable de filas;
 *   · que la paginación por cursor recorra todo sin repetir ni saltear.
 *
 * NO prueba PostgREST ni la Data API de Supabase de verdad: PGlite corre
 * dentro de Node, sin socket TCP, así que no se le puede poner PostgREST
 * adelante. Lo que sí hacemos es interponer una capa que aplica el mismo
 * recorte que aplicaría PostgREST (`db-max-rows`) y comprobar que:
 *   · con el camino viejo (traer todo) los totales salían mal;
 *   · con el camino nuevo (agregados) el recorte no cambia ni un número.
 *
 * La verificación contra la Data API real queda documentada en el README
 * como paso manual, con el script correspondiente.
 * ─────────────────────────────────────────────────────────────────────────
 */
const H = require('./ayuda-db.js');
const {
  resumir, rankingProductos, gastosPorCategoria, serieDiaria, cobrosPorMetodo,
} = require('../.compilado/calculos.js');
const { diasDelRango } = require('../.compilado/fechas.js');

let fallos = 0, corridas = 0;

function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a}`);
}

/** Compara números con tolerancia: numeric de Postgres vs float de JS. */
function casi(nombre, real, esperado, tolerancia = 0.01) {
  corridas++;
  const a = Number(real), b = Number(esperado);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > tolerancia) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`);
  } else {
    console.log(`  ✓ ${nombre} → ${a}`);
  }
}

function rechazado(nombre, res, frag) {
  corridas++;
  if (res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      NO fue rechazada`); return; }
  if (frag && !new RegExp(frag, 'i').test(res.error)) {
    fallos++; console.log(`  ✗ ${nombre}\n      otro motivo: ${res.error}`); return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 66)}`);
}

/**
 * Imita lo que hace PostgREST entre PostgreSQL y el cliente: si la consulta
 * devuelve más filas que `db-max-rows`, entrega solo las primeras y NO avisa.
 * Ese silencio es exactamente el problema que este sprint resuelve.
 */
function capaDataApi(db, maxFilas) {
  return {
    maxFilas,
    recortes: 0,
    async rpc(sql, params = []) {
      const r = await db.query(sql, params);
      const filas = r.rows;
      if (filas.length > this.maxFilas) {
        this.recortes += 1;
        return filas.slice(0, this.maxFilas);
      }
      return filas;
    },
  };
}

const uno = (filas) => (filas[0] ? Object.values(filas[0])[0] : null);
/**
 * Desde la 006 cada función devuelve UNA fila con un array jsonb adentro.
 * Esto desenvuelve ese array. Que sea siempre una sola fila es justamente
 * lo que hace imposible que db-max-rows recorte un reporte.
 */
const lista = (filas) => {
  const v = filas[0] ? Object.values(filas[0])[0] : null;
  return Array.isArray(v) ? v : [];
};
/** Para las simulaciones del camino VIEJO, que sí devolvía muchas filas. */
const crudo = (filas) => filas.map((f) => Object.values(f)[0]);

async function principal() {
  const db = await H.crearBase();

  const A = await H.montarEmpresa(db, { email: 'dueno@vol.com', nombre: 'Negocio Grande' });
  const vendedor = await H.sumarMiembro(db, A.empresaId, 'vendedor@vol.com', 'vendedor');
  const B = await H.montarEmpresa(db, { email: 'dueno@otra.com', nombre: 'Otro Negocio' });

  // =====================================================================
  grupo('1 · Dataset de volumen (se construye una sola vez)');
  // =====================================================================

  const DIAS = 30;
  const VENTAS_POR_DIA = 500;      // 15.000 ventas
  const GASTOS_POR_DIA = 100;      //  3.000 gastos
  const INGRESOS_POR_DIA = 50;     //  1.500 otros ingresos
  const ANULADAS_POR_DIA = 50;     //  1.500 ventas anuladas
  // Total: 21.000 movimientos.

  const PRECIO = 100, COSTO = 60, GASTO = 30, INGRESO = 20;
  const desde = '2026-01-01';
  const hasta = '2026-01-30';

  const prod = await H.crearProducto(db, A.empresaId, A.uid, {
    nombre: 'Producto de volumen', costo: COSTO, precio: PRECIO, stock: 0, controla_stock: false,
  });

  console.log('  · generando movimientos…');
  const t0 = Date.now();

  // Insertamos en bloque. Las reglas de negocio ya están probadas en las otras
  // suites; acá lo que importa es el volumen y que los agregados den exacto.
  await db.exec(`
    create temp table dias_carga as
    select generate_series('${desde}'::date, '${hasta}'::date, interval '1 day')::date as fecha;
  `);

  // --- ventas válidas ---
  await db.query(`
    with nuevas as (
      insert into public.movimientos
        (empresa_id, tipo, estado, fecha, descripcion, categoria, subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
      select $1, 'venta', 'activo', d.fecha, 'Venta ' || n, 'Ventas', $3, 0, $3, $4,
             case when n % 3 = 0 then 'transferencia' else 'efectivo' end, $2
      from dias_carga d, generate_series(1, ${VENTAS_POR_DIA}) n
      returning id, empresa_id
    )
    insert into public.movimiento_items
      (movimiento_id, empresa_id, producto_id, nombre, cantidad, precio_unitario, costo_unitario, afecto_stock)
    select nuevas.id, nuevas.empresa_id, $5, 'Producto de volumen', 1, $3, $4, false from nuevas
  `, [A.empresaId, A.uid, PRECIO, COSTO, prod]);

  // --- ventas anuladas (no deben sumar) ---
  await db.query(`
    with nuevas as (
      insert into public.movimientos
        (empresa_id, tipo, estado, fecha, descripcion, categoria, subtotal, descuento, monto, costo_total,
         metodo_pago, creado_por, anulado_por, anulado_at, motivo_anulacion)
      select $1, 'venta', 'anulado', d.fecha, 'Anulada ' || n, 'Ventas', 9999, 0, 9999, 5555,
             'efectivo', $2, $2, now(), 'Prueba de volumen'
      from dias_carga d, generate_series(1, ${ANULADAS_POR_DIA}) n
      returning id, empresa_id
    )
    insert into public.movimiento_items
      (movimiento_id, empresa_id, producto_id, nombre, cantidad, precio_unitario, costo_unitario, afecto_stock)
    select nuevas.id, nuevas.empresa_id, $3, 'Producto de volumen', 7, 9999, 5555, false from nuevas
  `, [A.empresaId, A.uid, prod]);

  // --- gastos ---
  await db.query(`
    insert into public.movimientos
      (empresa_id, tipo, estado, fecha, descripcion, categoria, subtotal, descuento, monto, metodo_pago, creado_por)
    select $1, 'gasto', 'activo', d.fecha, 'Gasto ' || n,
           case when n % 2 = 0 then 'Transporte' else 'Mercadería' end,
           $3, 0, $3, 'efectivo', $2
    from dias_carga d, generate_series(1, ${GASTOS_POR_DIA}) n
  `, [A.empresaId, A.uid, GASTO]);

  // --- otros ingresos ---
  await db.query(`
    insert into public.movimientos
      (empresa_id, tipo, estado, fecha, descripcion, categoria, subtotal, descuento, monto, metodo_pago, creado_por)
    select $1, 'ingreso', 'activo', d.fecha, 'Ingreso ' || n, 'Otros', $3, 0, $3, 'transferencia', $2
    from dias_carga d, generate_series(1, ${INGRESOS_POR_DIA}) n
  `, [A.empresaId, A.uid, INGRESO]);

  const totalCreados = Number((await db.query(
    'select count(*)::int n from public.movimientos where empresa_id=$1', [A.empresaId])).rows[0].n);
  console.log(`  · listo en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const esperado = {
    total: DIAS * (VENTAS_POR_DIA + GASTOS_POR_DIA + INGRESOS_POR_DIA + ANULADAS_POR_DIA),
    ventas: DIAS * VENTAS_POR_DIA * PRECIO,
    costo: DIAS * VENTAS_POR_DIA * COSTO,
    gastos: DIAS * GASTOS_POR_DIA * GASTO,
    ingresos: DIAS * INGRESOS_POR_DIA * INGRESO,
    cantidadVentas: DIAS * VENTAS_POR_DIA,
    unidades: DIAS * VENTAS_POR_DIA,
    anuladas: DIAS * ANULADAS_POR_DIA,
  };
  esperado.gananciaBruta = esperado.ventas - esperado.costo;
  esperado.gananciaNeta = esperado.gananciaBruta + esperado.ingresos - esperado.gastos;

  ok('movimientos creados', totalCreados, esperado.total);
  ok('son más de 20.000', totalCreados > 20000, true);

  // =====================================================================
  grupo('2 · Los agregados son exactos con 21.000 movimientos');
  // =====================================================================
  let resumenSql, rankingSql, serieSql, gastosSql, cobrosSql;

  await H.comoUsuario(db, A.uid, async () => {
    resumenSql = uno((await db.query('select public.resumen_financiero($1,$2,$3)', [A.empresaId, desde, hasta])).rows);
    rankingSql = lista((await db.query('select public.ranking_productos($1,$2,$3,null)', [A.empresaId, desde, hasta])).rows);
    serieSql   = lista((await db.query('select public.serie_financiera_diaria($1,$2,$3)', [A.empresaId, desde, hasta])).rows);
    gastosSql  = lista((await db.query('select public.gastos_por_categoria($1,$2,$3)', [A.empresaId, desde, hasta])).rows);
    cobrosSql  = lista((await db.query('select public.cobros_por_metodo($1,$2,$3)', [A.empresaId, desde, hasta])).rows);
  });

  casi('ventas', resumenSql.ventas, esperado.ventas);
  casi('costo de mercadería', resumenSql.costo_mercaderia, esperado.costo);
  casi('ganancia bruta', resumenSql.ganancia_bruta, esperado.gananciaBruta);
  casi('gastos', resumenSql.gastos, esperado.gastos);
  casi('otros ingresos', resumenSql.otros_ingresos, esperado.ingresos);
  casi('ganancia neta', resumenSql.ganancia_neta, esperado.gananciaNeta);
  casi('cantidad de ventas', resumenSql.cantidad_ventas, esperado.cantidadVentas);
  casi('unidades vendidas', resumenSql.unidades_vendidas, esperado.unidades);
  casi('ticket promedio', resumenSql.ticket_promedio, PRECIO);
  casi('ventas anuladas', resumenSql.ventas_anuladas, esperado.anuladas);
  ok('las anuladas no se sumaron a ventas', Number(resumenSql.ventas) === esperado.ventas, true);

  ok('el ranking devuelve 1 producto', rankingSql.length, 1);
  casi('unidades del ranking', rankingSql[0].unidades, esperado.unidades);
  casi('ingresos del ranking = ventas del resumen', rankingSql[0].ingresos, resumenSql.ventas);
  casi('ganancia del ranking', rankingSql[0].ganancia, esperado.gananciaBruta);

  ok('la serie tiene una fila por día', serieSql.length, DIAS);
  casi('la suma de la serie = ventas del resumen',
    serieSql.reduce((s, d) => s + Number(d.ventas), 0), esperado.ventas);
  casi('un día cualquiera', serieSql[0].ventas, VENTAS_POR_DIA * PRECIO);

  ok('gastos en 2 categorías', gastosSql.length, 2);
  casi('la suma de categorías = gastos del resumen',
    gastosSql.reduce((s, c) => s + Number(c.monto), 0), esperado.gastos);

  casi('la suma de cobros = ventas + otros ingresos',
    cobrosSql.reduce((s, c) => s + Number(c.monto), 0), esperado.ventas + esperado.ingresos);

  // =====================================================================
  grupo('3 · Tamaño de las respuestas agregadas');
  // =====================================================================
  ok('el resumen es UN objeto', typeof resumenSql, 'object');
  ok('el ranking devuelve pocas filas', rankingSql.length <= 50, true);
  ok('la serie devuelve una por día', serieSql.length <= 400, true);
  ok('los gastos, una por categoría', gastosSql.length <= 50, true);
  ok('los cobros, una por método', cobrosSql.length <= 10, true);
  const maxFilas = Math.max(rankingSql.length, serieSql.length, gastosSql.length, cobrosSql.length, 1);
  ok('ninguna respuesta agregada pasa de 1.000 filas', maxFilas < 1000, true);
  console.log(`      (la mayor devolvió ${maxFilas} filas, contra ${totalCreados} movimientos)`);

  // =====================================================================
  grupo('4 · Con un tope de filas tipo PostgREST, los números no cambian');
  // =====================================================================
  for (const tope of [1000, 5000, 100]) {
    const api = capaDataApi(db, tope);
    let rSql, rkSql, sSql;

    await H.comoUsuario(db, A.uid, async () => {
      rSql  = uno(await api.rpc('select public.resumen_financiero($1,$2,$3)', [A.empresaId, desde, hasta]));
      rkSql = lista(await api.rpc('select public.ranking_productos($1,$2,$3,null)', [A.empresaId, desde, hasta]));
      sSql  = lista(await api.rpc('select public.serie_financiera_diaria($1,$2,$3)', [A.empresaId, desde, hasta]));
    });

    casi(`con db-max-rows=${tope}: ventas siguen exactas`, rSql.ventas, esperado.ventas);
    casi(`con db-max-rows=${tope}: ganancia neta sigue exacta`, rSql.ganancia_neta, esperado.gananciaNeta);
    casi(`con db-max-rows=${tope}: el ranking sigue exacto`, rkSql[0].ingresos, esperado.ventas);
    ok(`con db-max-rows=${tope}: nada fue recortado`, api.recortes, 0);
    ok(`con db-max-rows=${tope}: la serie llegó completa`, sSql.length, DIAS);
  }

  // El camino viejo, para dejar constancia de qué se estaba arreglando.
  {
    const api = capaDataApi(db, 1000);
    let movs;
    await H.comoUsuario(db, A.uid, async () => {
      // Solo columnas que el rol puede leer: así habría sido la consulta vieja.
      // Ojo: acá usamos `crudo`, porque el camino viejo devolvía MUCHAS filas.
      movs = crudo(await api.rpc(
        `select jsonb_build_object('id', m.id, 'monto', m.monto) from public.movimientos m
         where m.empresa_id=$1 and m.fecha between $2 and $3 and m.estado='activo' and m.tipo='venta'`,
        [A.empresaId, desde, hasta]));
    });
    const sumaTruncada = movs.reduce((s, m) => s + Number(m.monto), 0);
    ok('el camino viejo SÍ habría sido recortado', api.recortes, 1);
    ok('y habría mostrado un total incompleto', sumaTruncada < esperado.ventas, true);
    console.log(`      (habría mostrado ${sumaTruncada} en vez de ${esperado.ventas})`);
  }

  // =====================================================================
  grupo('5 · Reconciliación SQL ↔ TypeScript');
  // =====================================================================
  // Dataset chico pero con todos los casos difíciles: descuentos, varios
  // productos, ventas sueltas, anuladas, gastos e ingresos.
  {
    const C = await H.montarEmpresa(db, { email: 'dueno@rec.com', nombre: 'Reconciliación' });
    const p1 = await H.crearProducto(db, C.empresaId, C.uid, { nombre: 'Perfume', costo: 100, precio: 250, stock: 500 });
    const p2 = await H.crearProducto(db, C.empresaId, C.uid, { nombre: 'Auricular', costo: 40, precio: 90, stock: 500 });
    const d1 = '2026-03-01', d2 = '2026-03-05';

    const vender = (items, extra = {}) => db.query(
      `select public.registrar_venta($1,$2::jsonb,$3,'','${extra.metodo ?? 'efectivo'}','','','manual',$4) as id`,
      [C.empresaId, JSON.stringify(items), extra.fecha ?? d1, extra.descuento ?? 0],
    ).then((r) => r.rows[0].id);

    let anulable;
    await H.comoUsuario(db, C.uid, async () => {
      await vender([{ producto_id: p1, cantidad: 2 }]);
      await vender([{ producto_id: p1, cantidad: 3 }, { producto_id: p2, cantidad: 2 }], { descuento: 130 });
      await vender([{ nombre: 'Cargador suelto', cantidad: 4, precio_unitario: 55, costo_unitario: 25 }], { fecha: d2 });
      await vender([{ producto_id: p2, cantidad: 1 }], { fecha: d2, metodo: 'transferencia', descuento: 15 });
      anulable = await vender([{ producto_id: p1, cantidad: 10 }], { fecha: d2 });
      await db.query('select public.anular_movimiento($1, $2)', [anulable, 'Para la prueba']);
      await db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, metodo_pago)
         values ($1,'gasto',$2,'Nafta','Transporte',700,700,'efectivo'),
                ($1,'gasto',$3,'Almuerzo','Comida',250,250,'efectivo'),
                ($1,'ingreso',$3,'Aporte','Otros',400,400,'transferencia')`,
        [C.empresaId, d1, d2]);
    });

    let sqlRes, sqlRank, sqlSerie, sqlGastos, sqlCobros, movimientos;
    await H.comoUsuario(db, C.uid, async () => {
      sqlRes    = uno((await db.query('select public.resumen_financiero($1,$2,$3)', [C.empresaId, d1, d2])).rows);
      sqlRank   = lista((await db.query('select public.ranking_productos($1,$2,$3,null)', [C.empresaId, d1, d2])).rows);
      sqlSerie  = lista((await db.query('select public.serie_financiera_diaria($1,$2,$3)', [C.empresaId, d1, d2])).rows);
      sqlGastos = lista((await db.query('select public.gastos_por_categoria($1,$2,$3)', [C.empresaId, d1, d2])).rows);
      sqlCobros = lista((await db.query('select public.cobros_por_metodo($1,$2,$3)', [C.empresaId, d1, d2])).rows);
      // Los mismos datos, pero traídos crudos para que los calcule TypeScript.
      // (listar_movimientos también devuelve un array dentro de una fila.)
      movimientos = lista((await db.query('select public.listar_movimientos($1,$2,$3)', [C.empresaId, d1, d2])).rows);
      // El orden importa para la reconciliación del ranking: la versión de
      // TypeScript toma el nombre de la línea más reciente.
      movimientos.sort((a, b) => (a.fecha === b.fecha
        ? (a.created_at < b.created_at ? 1 : -1)
        : (a.fecha < b.fecha ? 1 : -1)));
    });

    const ts = resumir(movimientos);
    casi('ventas', sqlRes.ventas, ts.ventas);
    casi('ventas brutas', sqlRes.ventas_brutas, ts.ventasBrutas);
    casi('descuentos', sqlRes.descuentos, ts.descuentos);
    casi('otros ingresos', sqlRes.otros_ingresos, ts.otrosIngresos);
    casi('ingresos totales', sqlRes.ingresos_totales, ts.ingresosTotales);
    casi('gastos', sqlRes.gastos, ts.gastos);
    casi('costo de mercadería', sqlRes.costo_mercaderia, ts.costoMercaderia);
    casi('ganancia bruta', sqlRes.ganancia_bruta, ts.gananciaBruta);
    casi('ganancia neta', sqlRes.ganancia_neta, ts.gananciaNeta);
    casi('margen bruto', sqlRes.margen_bruto, ts.margenBruto);
    casi('margen neto', sqlRes.margen_neto, ts.margenNeto);
    casi('cantidad de ventas', sqlRes.cantidad_ventas, ts.cantidadVentas);
    casi('ticket promedio', sqlRes.ticket_promedio, ts.ticketPromedio);
    casi('unidades vendidas', sqlRes.unidades_vendidas, ts.unidadesVendidas);
    casi('ventas anuladas', sqlRes.ventas_anuladas, ts.ventasAnuladas);
    casi('monto de ventas anuladas', sqlRes.monto_ventas_anuladas, ts.montoVentasAnuladas);
    casi('movimientos anulados', sqlRes.movimientos_anulados, ts.movimientosAnulados);

    const tsRank = rankingProductos(movimientos);
    ok('el ranking tiene la misma cantidad de filas', sqlRank.length, tsRank.length);
    for (let i = 0; i < tsRank.length; i++) {
      ok(`ranking[${i}] mismo producto`, sqlRank[i].nombre, tsRank[i].nombre);
      casi(`ranking[${i}] unidades`, sqlRank[i].unidades, tsRank[i].unidades);
      casi(`ranking[${i}] ingresos brutos`, sqlRank[i].ingresos_brutos, tsRank[i].ingresosBrutos);
      casi(`ranking[${i}] descuento prorrateado`, sqlRank[i].descuento, tsRank[i].descuento);
      casi(`ranking[${i}] ingresos netos`, sqlRank[i].ingresos, tsRank[i].ingresos);
      casi(`ranking[${i}] costo`, sqlRank[i].costo, tsRank[i].costo);
      casi(`ranking[${i}] ganancia`, sqlRank[i].ganancia, tsRank[i].ganancia);
      casi(`ranking[${i}] margen`, sqlRank[i].margen, tsRank[i].margen);
      casi(`ranking[${i}] participación`, sqlRank[i].participacion, tsRank[i].participacion);
      casi(`ranking[${i}] operaciones`, sqlRank[i].operaciones, tsRank[i].operaciones);
    }
    casi('la suma del ranking reconcilia con las ventas del resumen',
      sqlRank.reduce((s, f) => s + Number(f.ingresos), 0), sqlRes.ventas);

    const tsSerie = serieDiaria(movimientos, diasDelRango(d1, d2));
    ok('la serie tiene la misma cantidad de días', sqlSerie.length, tsSerie.length);
    for (let i = 0; i < tsSerie.length; i++) {
      ok(`serie[${i}] fecha`, sqlSerie[i].fecha, tsSerie[i].fecha);
      casi(`serie[${i}] ventas`, sqlSerie[i].ventas, tsSerie[i].ventas);
      casi(`serie[${i}] gastos`, sqlSerie[i].gastos, tsSerie[i].gastos);
      casi(`serie[${i}] otros ingresos`, sqlSerie[i].otros_ingresos, tsSerie[i].otrosIngresos);
      casi(`serie[${i}] ganancia`, sqlSerie[i].ganancia, tsSerie[i].ganancia);
    }

    const tsGastos = gastosPorCategoria(movimientos);
    ok('mismas categorías de gasto', sqlGastos.map((g) => g.nombre), tsGastos.map((g) => g.nombre));
    for (let i = 0; i < tsGastos.length; i++) {
      casi(`gastos[${i}] monto`, sqlGastos[i].monto, tsGastos[i].monto);
      casi(`gastos[${i}] participación`, sqlGastos[i].participacion, tsGastos[i].participacion);
    }

    const tsCobros = cobrosPorMetodo(movimientos);
    ok('mismos métodos de cobro', sqlCobros.map((c) => c.metodo), tsCobros.map((c) => c.metodo));
    for (let i = 0; i < tsCobros.length; i++) {
      casi(`cobros[${i}] monto`, sqlCobros[i].monto, tsCobros[i].monto);
      casi(`cobros[${i}] participación`, sqlCobros[i].participacion, tsCobros[i].participacion);
    }
  }

  // =====================================================================
  grupo('6 · Paginación por cursor: recorre todo, sin repetir ni saltear');
  // =====================================================================
  {
    const vistos = new Set();
    let cursor = null, paginas = 0, ultimaClave = null, desordenes = 0;

    await H.comoUsuario(db, A.uid, async () => {
      for (;;) {
        const pagina = uno((await db.query(
          'select public.pagina_movimientos($1,$2,$3,$4,$5,$6,$7)',
          [A.empresaId, desde, hasta, 500,
            cursor?.fecha ?? null, cursor?.created_at ?? null, cursor?.id ?? null],
        )).rows);
        const filas = pagina.movimientos;
        if (filas.length === 0) break;

        for (const m of filas) {
          if (vistos.has(m.id)) desordenes += 1000;   // repetido
          vistos.add(m.id);
          const clave = `${m.fecha}|${m.created_at}|${m.id}`;
          if (ultimaClave !== null && clave >= ultimaClave) desordenes += 1;
          ultimaClave = clave;
        }

        paginas += 1;
        // El cursor lo calcula el servidor, no lo derivamos de la lista.
        cursor = pagina.siguiente;
        if (!cursor) break;
        if (paginas > 100) break;
      }
    });

    ok('recorrió todos los movimientos', vistos.size, totalCreados);
    ok('sin repetir ninguno', vistos.size, totalCreados);
    ok('siempre en orden descendente', desordenes, 0);
    ok('en la cantidad de páginas esperada', paginas, Math.ceil(totalCreados / 500));
    console.log(`      (${paginas} páginas de 500 para ${totalCreados} movimientos)`);

    // Ninguna página se acerca al tope de filas de la API.
    let tamPagina, filasSql;
    await H.comoUsuario(db, A.uid, async () => {
      const r = await db.query('select public.pagina_movimientos($1,$2,$3,$4)', [A.empresaId, desde, hasta, 500]);
      filasSql = r.rows.length;
      tamPagina = uno(r.rows).movimientos.length;
    });
    ok('la RPC devuelve UNA sola fila', filasSql, 1);
    ok('con hasta 500 movimientos adentro', tamPagina <= 500, true);

    let recortada;
    await H.comoUsuario(db, A.uid, async () => {
      recortada = uno((await db.query('select public.pagina_movimientos($1,$2,$3,$4)', [A.empresaId, desde, hasta, 99999])).rows).movimientos.length;
    });
    ok('pedir 99.999 por página no sirve de nada: el tope es 500', recortada, 500);
  }

  // =====================================================================
  grupo('6b · Con db-max-rows = 10, ningún reporte se recorta');
  // =====================================================================
  // Antes de la 006 estas funciones devolvían `setof jsonb`: para PostgREST,
  // MUCHAS filas. Con 15 productos y un tope de 10, el ranking habría llegado
  // recortado. Ahora devuelven UNA fila con un array adentro.
  {
    const D = await H.montarEmpresa(db, { email: 'dueno@chico.com', nombre: 'Muchos Productos' });
    const d1 = '2026-05-01', d2 = '2026-05-15';   // 15 días
    const PRODUCTOS = 15;
    const CATEGORIAS = 12;

    const ids = [];
    for (let i = 0; i < PRODUCTOS; i++) {
      ids.push(await H.crearProducto(db, D.empresaId, D.uid, {
        nombre: `Producto ${String(i).padStart(2, '0')}`,
        costo: 40 + i, precio: 100 + i, stock: 0, controla_stock: false,
      }));
    }

    await H.comoUsuario(db, D.uid, async () => {
      // Una venta por producto y por día: 15 productos × 15 días.
      for (let dia = 0; dia < 15; dia++) {
        const fecha = `2026-05-${String(dia + 1).padStart(2, '0')}`;
        for (let i = 0; i < PRODUCTOS; i++) {
          await db.query(
            `select public.registrar_venta($1,$2::jsonb,$3,'','efectivo','','','manual',0)`,
            [D.empresaId, JSON.stringify([{ producto_id: ids[i], cantidad: 1 }]), fecha],
          );
        }
      }
      // Un gasto por categoría, para tener 12 categorías distintas.
      for (let c = 0; c < CATEGORIAS; c++) {
        await db.query(
          `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, metodo_pago)
           values ($1,'gasto',$2,'Gasto','Categoría ' || $3, 100, 100, 'efectivo')`,
          [D.empresaId, d1, String(c).padStart(2, '0')],
        );
      }
    });

    const ventasEsperadas = Array.from({ length: PRODUCTOS }, (_, i) => (100 + i) * 15)
      .reduce((s, v) => s + v, 0);

    // Tope brutalmente bajo: 10 filas.
    const api = capaDataApi(db, 10);
    let rank, serie, gastos, resumen, productos;

    await H.comoUsuario(db, D.uid, async () => {
      resumen   = uno(await api.rpc('select public.resumen_financiero($1,$2,$3)', [D.empresaId, d1, d2]));
      rank      = lista(await api.rpc('select public.ranking_productos($1,$2,$3,null)', [D.empresaId, d1, d2]));
      serie     = lista(await api.rpc('select public.serie_financiera_diaria($1,$2,$3)', [D.empresaId, d1, d2]));
      gastos    = lista(await api.rpc('select public.gastos_por_categoria($1,$2,$3)', [D.empresaId, d1, d2]));
      productos = lista(await api.rpc('select public.listar_productos($1,false)', [D.empresaId]));
    });

    ok('con tope 10, no se recortó NADA', api.recortes, 0);
    ok('el ranking trae los 15 productos', rank.length, PRODUCTOS);
    ok('la serie trae los 15 días', serie.length, 15);
    ok('los gastos traen las 12 categorías', gastos.length, CATEGORIAS);
    ok('el catálogo trae los 15 productos', productos.length, PRODUCTOS);

    casi('las ventas del resumen son exactas', resumen.ventas, ventasEsperadas);
    casi('la suma del ranking reconcilia', rank.reduce((s, f) => s + Number(f.ingresos), 0), ventasEsperadas);
    casi('la suma de la serie reconcilia', serie.reduce((s, d) => s + Number(d.ventas), 0), ventasEsperadas);
    casi('la suma de gastos reconcilia', gastos.reduce((s, g) => s + Number(g.monto), 0), CATEGORIAS * 100);

    // La paginación también: una fila con el objeto adentro.
    let pag;
    await H.comoUsuario(db, D.uid, async () => {
      pag = uno(await api.rpc('select public.pagina_movimientos($1,$2,$3,100)', [D.empresaId, d1, d2]));
    });
    ok('la página tampoco se recortó', api.recortes, 0);
    ok('y trae sus 100 movimientos', pag.movimientos.length, 100);
    ok('con el cursor calculado por el servidor', pag.siguiente !== null, true);

    // Prueba de contraste: así se veía antes, con SETOF.
    const apiVieja = capaDataApi(db, 10);
    let rankViejo;
    await H.comoUsuario(db, D.uid, async () => {
      rankViejo = (await apiVieja.rpc(
        `select jsonb_build_object('pid', i.producto_id, 'v', sum(i.cantidad * i.precio_unitario))
         from public.movimiento_items i join public.movimientos m on m.id = i.movimiento_id
         where m.empresa_id=$1 and m.fecha between $2 and $3 and m.estado='activo' and m.tipo='venta'
         group by i.producto_id`,
        [D.empresaId, d1, d2])).map((f) => Object.values(f)[0]);
    });
    ok('con SETOF, el tope SÍ habría recortado', apiVieja.recortes, 1);
    ok('y habría mostrado solo 10 de 15 productos', rankViejo.length, 10);
    const sumaVieja = rankViejo.reduce((s, f) => s + Number(f.v), 0);
    ok('con un total equivocado', sumaVieja < ventasEsperadas, true);
    console.log(`      (habría mostrado ${sumaVieja} en vez de ${ventasEsperadas})`);

    // El vendedor sigue sin ver costos, también acá.
    const vendedorD = await H.sumarMiembro(db, D.empresaId, 'vendedor@chico.com', 'vendedor');
    let rankVend, resVend;
    await H.comoUsuario(db, vendedorD, async () => {
      rankVend = lista((await db.query('select public.ranking_productos($1,$2,$3,null)', [D.empresaId, d1, d2])).rows);
      resVend  = uno((await db.query('select public.resumen_financiero($1,$2,$3)', [D.empresaId, d1, d2])).rows);
    });
    ok('el vendedor recibe los 15 productos completos', rankVend.length, PRODUCTOS);
    ok('pero sin costo', rankVend.every((f) => f.costo === null), true);
    ok('sin ganancia', rankVend.every((f) => f.ganancia === null), true);
    ok('y el resumen sin rentabilidad', resVend.ganancia_neta, null);
    casi('aunque las ventas sí las ve', resVend.ventas, ventasEsperadas);
  }

  // =====================================================================
  grupo('7 · Los permisos siguen valiendo en los agregados');
  // =====================================================================
  {
    let comoVendedor, rankVendedor, serieVendedor;
    await H.comoUsuario(db, vendedor, async () => {
      comoVendedor  = uno((await db.query('select public.resumen_financiero($1,$2,$3)', [A.empresaId, desde, hasta])).rows);
      rankVendedor  = lista((await db.query('select public.ranking_productos($1,$2,$3,null)', [A.empresaId, desde, hasta])).rows);
      serieVendedor = lista((await db.query('select public.serie_financiera_diaria($1,$2,$3)', [A.empresaId, desde, hasta])).rows);
    });

    casi('el vendedor SÍ ve las ventas', comoVendedor.ventas, esperado.ventas);
    casi('y los gastos', comoVendedor.gastos, esperado.gastos);
    casi('y las unidades', comoVendedor.unidades_vendidas, esperado.unidades);
    ok('pero el costo viene en null', comoVendedor.costo_mercaderia, null);
    ok('la ganancia bruta también', comoVendedor.ganancia_bruta, null);
    ok('la ganancia neta también', comoVendedor.ganancia_neta, null);
    ok('el margen bruto también', comoVendedor.margen_bruto, null);
    ok('el margen neto también', comoVendedor.margen_neto, null);
    ok('y avisa que no tiene costos', comoVendedor.con_costos, false);
    ok('ninguno viene en cero disfrazado de dato',
      [comoVendedor.costo_mercaderia, comoVendedor.ganancia_bruta].every((v) => v === null), true);

    casi('el ranking le muestra lo vendido', rankVendedor[0].ingresos, esperado.ventas);
    ok('pero sin costo', rankVendedor[0].costo, null);
    ok('sin ganancia', rankVendedor[0].ganancia, null);
    ok('sin margen', rankVendedor[0].margen, null);
    ok('la serie le da ventas', Number(serieVendedor[0].ventas) > 0, true);
    ok('pero la ganancia del día en null', serieVendedor[0].ganancia, null);

    // Aislamiento entre empresas.
    rechazado('un usuario de B no puede pedir el resumen de A',
      await H.intentarComo(db, 'authenticated', B.uid, () =>
        db.query('select public.resumen_financiero($1,$2,$3)', [A.empresaId, desde, hasta])),
      'No pertenecés');
    rechazado('ni el ranking',
      await H.intentarComo(db, 'authenticated', B.uid, () =>
        db.query('select public.ranking_productos($1,$2,$3,null)', [A.empresaId, desde, hasta])),
      'No pertenecés');
    rechazado('ni la serie',
      await H.intentarComo(db, 'authenticated', B.uid, () =>
        db.query('select public.serie_financiera_diaria($1,$2,$3)', [A.empresaId, desde, hasta])),
      'No pertenecés');
    rechazado('ni los gastos',
      await H.intentarComo(db, 'authenticated', B.uid, () =>
        db.query('select public.gastos_por_categoria($1,$2,$3)', [A.empresaId, desde, hasta])),
      'No pertenecés');
    rechazado('ni una página del historial',
      await H.intentarComo(db, 'authenticated', B.uid, () =>
        db.query('select public.pagina_movimientos($1,$2,$3,10)', [A.empresaId, desde, hasta])),
      'No pertenecés');
    rechazado('sin sesión, nada',
      await H.intentarComo(db, 'authenticated', null, () =>
        db.query('select public.resumen_financiero($1,$2,$3)', [A.empresaId, desde, hasta])),
      'iniciar sesión');

    let resumenB;
    await H.comoUsuario(db, B.uid, async () => {
      resumenB = uno((await db.query('select public.resumen_financiero($1,$2,$3)', [B.empresaId, desde, hasta])).rows);
    });
    ok('la empresa B ve su propio resumen en cero', Number(resumenB.ventas), 0);
  }

  // =====================================================================
  grupo('8 · Reto sobre el rango completo, sin descargar nada');
  // =====================================================================
  {
    let resumenReto;
    await H.comoUsuario(db, A.uid, async () => {
      resumenReto = uno((await db.query('select public.resumen_financiero($1,$2,$3)', [A.empresaId, desde, hasta])).rows);
    });
    casi('un reto por ventas se mide con el agregado', resumenReto.ventas, esperado.ventas);
    casi('uno por ganancia también', resumenReto.ganancia_neta, esperado.gananciaNeta);

    let retoVendedor;
    await H.comoUsuario(db, vendedor, async () => {
      retoVendedor = uno((await db.query('select public.resumen_financiero($1,$2,$3)', [A.empresaId, desde, hasta])).rows);
    });
    ok('un vendedor no puede medir un reto por ganancia', retoVendedor.ganancia_neta, null);
    casi('pero sí uno por ventas', retoVendedor.ventas, esperado.ventas);
  }

  console.log(`\n${'═'.repeat(62)}`);
  console.log(fallos === 0
    ? `>>> ${corridas} COMPROBACIONES DE LECTURAS ESCALABLES PASARON`
    : `>>> ${fallos} DE ${corridas} COMPROBACIONES FALLARON`);
  process.exit(fallos ? 1 : 0);
}

principal().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message ?? e);
  console.error(e.stack);
  process.exit(1);
});
