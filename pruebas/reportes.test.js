/**
 * Pruebas de la migración 106 (reportes por rubro).
 *
 * Dos partes, en este orden:
 *
 *   1. LOS ARREGLOS DE PLATA (3.1 del contrato). Cada uno se escribió PRIMERO
 *      como prueba contra la base sin la 106, y falló: así se comprobó que el
 *      error existía antes de tocar nada.
 *        · la compra de mercadería restaba dos veces en un comercio que carga
 *          el costo de lo que vende (decisión de Matías del 23/09);
 *        · el pago al barbero a comisión restaba dos veces (costo de la venta
 *          + gasto «Sueldos»);
 *        · el que alquila la silla aparecía con un «le debés» por todo lo que
 *          facturó, plata que nunca pasó por el local.
 *
 *   2. LAS LECTURAS NUEVAS POR PERÍODO: movimientos con cuenta, cliente,
 *      vendedor y lote; turnos; alumnos; progreso del trainer; ventas por
 *      vendedor; fiado del período. Con sus permisos (047): lo que es costo o
 *      sueldo le llega en null a un vendedor, y a un extraño no le llega nada.
 */
const H = require('./ayuda-db.js');
const { resumir, serieDiaria } = require('../.compilado/calculos.js');
const { diasDelRango } = require('../.compilado/fechas.js');

let fallos = 0;
let corridas = 0;

function grupo(nombre) {
  console.log(`\n── ${nombre} ${'─'.repeat(Math.max(0, 58 - nombre.length))}`);
}

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`);
  } else {
    console.log(`  ✓ ${nombre} → ${a}`);
  }
}

function rechazado(nombre, resultado, fragmento) {
  corridas++;
  if (resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      NO fue rechazada`);
    return;
  }
  if (fragmento && !new RegExp(fragmento, 'i').test(resultado.error)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      rechazada por otro motivo: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre} → rechazada`);
}

const num = (v) => (v === null || v === undefined ? v : Number(v));
// jsonb no guarda el orden de las claves: se comparan ordenadas.
const ordenado = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

(async () => {
  // REPORTES_SIN_106=1 monta la base hasta la 105: así se vuelve a comprobar,
  // cuando haga falta, que los arreglos de plata fallaban antes de la 106.
  // Con esa variable solo corre la primera parte (las lecturas nuevas no
  // existen sin la 106).
  const sin106 = process.env.REPORTES_SIN_106 === '1';
  const db = await H.crearBase(sin106 ? { hasta: '105' } : {});

  const llamar = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await llamar(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };
  const j = async (uid, sql, args = []) => (await valor(uid, sql, args)).j;
  const hoyDe = async (empresa) =>
    (await db.query('select public.hoy_empresa($1)::text d', [empresa])).rows[0].d;
  const masDias = async (fecha, n) =>
    (await db.query('select ($1::date + $2::int)::text d', [fecha, n])).rows[0].d;
  // Un gasto cargado a mano, como lo carga la pantalla de Gastos: insert
  // directo con la policy de la 047 (tipo distinto de venta, creado_por propio).
  const gasto = (uid, empresa, fecha, categoria, monto, descripcion = 'Gasto') => valor(uid,
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, metodo_pago, creado_por)
     values ($1,'gasto',$2,$3,$4,$5,$5,'efectivo',auth.uid()) returning id`,
    [empresa, fecha, descripcion, categoria, monto]);

  // ═══════════════════════════════════════════════════════════
  grupo('1 · La compra de mercadería no resta dos veces (decisión 2)');
  // ═══════════════════════════════════════════════════════════
  // Un almacén que carga el costo: compra 500.000 de mercadería y vende 10
  // bolsas de arroz a 10.000 con costo 6.000. Ganó 40.000 de bruta; con
  // 20.000 de nafta, le quedaron 20.000. Antes el reporte decía −480.000.
  const A = await H.montarEmpresa(db, { email: 'dueno@almacen.com', nombre: 'Almacén Don Pedro' });
  const vendA = await H.sumarMiembro(db, A.empresaId, 'caja@almacen.com', 'vendedor');
  const arroz = await H.crearProducto(db, A.empresaId, A.uid,
    { nombre: 'Arroz', costo: 6000, precio: 10000, stock: 100 });
  const dA = '2026-03-02';
  await valor(A.uid, 'select public.registrar_venta($1,$2::jsonb,$3) id',
    [A.empresaId, JSON.stringify([{ producto_id: arroz, cantidad: 10 }]), dA]);
  await gasto(A.uid, A.empresaId, dA, 'Mercadería', 500000, 'Compra al mayorista');
  await gasto(A.uid, A.empresaId, '2026-03-03', 'Transporte', 20000, 'Nafta');

  const rA = await j(A.uid, 'select public.resumen_financiero($1,$2,$3) j', [A.empresaId, dA, '2026-03-03']);
  ok('con costo cargado, la mercadería va aparte', rA.mercaderia_aparte, true);
  ok('lo que compró se informa aparte', num(rA.compras_mercaderia), 500000);
  ok('y NO entra en los gastos', num(rA.gastos), 20000);
  ok('la ganancia neta es la de verdad: 100.000 − 60.000 − 20.000', num(rA.ganancia_neta), 20000);
  ok('el margen neto sale de esa ganancia', Math.round(num(rA.margen_neto)), 20);

  const sA = await j(A.uid, 'select public.serie_financiera_diaria($1,$2,$3) j', [A.empresaId, dA, '2026-03-03']);
  ok('la serie dice lo mismo: suma de ganancias = ganancia neta',
    sA.reduce((s, d) => s + Number(d.ganancia), 0), 20000);
  ok('el día de la compra no muestra la compra como gasto', num(sA[0].gastos), 0);
  ok('pero la trae aparte', num(sA[0].compras_mercaderia), 500000);
  ok('y cada día sabe que la mercadería va aparte en el período', sA.every((d) => d.mercaderia_aparte === true), true);

  // El espejo en TypeScript (calculos.ts) aplica la misma regla.
  let movsA;
  await H.comoUsuario(db, A.uid, async () => {
    movsA = (await db.query('select public.listar_movimientos($1,$2,$3) j', [A.empresaId, dA, '2026-03-03'])).rows[0].j;
  });
  const tsA = resumir(movsA);
  ok('calculos.ts: mismos gastos', tsA.gastos, 20000);
  ok('calculos.ts: misma compra aparte', [tsA.comprasMercaderia, tsA.mercaderiaAparte], [500000, true]);
  ok('calculos.ts: misma ganancia neta', tsA.gananciaNeta, 20000);
  const tsSerieA = serieDiaria(movsA, diasDelRango(dA, '2026-03-03'));
  ok('calculos.ts: misma serie', tsSerieA.map((d) => [d.gastos, d.ganancia]), sA.map((d) => [Number(d.gastos), Number(d.ganancia)]));

  // Un vendedor: la ganancia sigue en null, y la regla de sus gastos es la misma.
  const rVend = await j(vendA, 'select public.resumen_financiero($1,$2,$3) j', [A.empresaId, dA, '2026-03-03']);
  ok('al vendedor la ganancia le sigue llegando en null', rVend.ganancia_neta, null);

  // Un período SIN costo cargado: la compra sigue restando, como hoy.
  const B = await H.montarEmpresa(db, { email: 'dueno@kiosco.com', nombre: 'Kiosco sin costos' });
  const chicle = await H.crearProducto(db, B.empresaId, B.uid,
    { nombre: 'Chicle', costo: 0, precio: 10000, stock: 100 });
  await valor(B.uid, 'select public.registrar_venta($1,$2::jsonb,$3) id',
    [B.empresaId, JSON.stringify([{ producto_id: chicle, cantidad: 10 }]), dA]);
  await gasto(B.uid, B.empresaId, dA, 'Mercadería', 50000);
  const rB = await j(B.uid, 'select public.resumen_financiero($1,$2,$3) j', [B.empresaId, dA, dA]);
  ok('sin costo cargado, la mercadería no va aparte', rB.mercaderia_aparte, false);
  ok('y resta como siempre', [num(rB.gastos), num(rB.ganancia_neta)], [50000, 50000]);
  ok('igual se informa cuánto compró', num(rB.compras_mercaderia), 50000);
  let movsB;
  await H.comoUsuario(db, B.uid, async () => {
    movsB = (await db.query('select public.listar_movimientos($1,$2,$3) j', [B.empresaId, dA, dA])).rows[0].j;
  });
  ok('calculos.ts coincide sin costo', [resumir(movsB).gastos, resumir(movsB).gananciaNeta, resumir(movsB).mercaderiaAparte],
    [50000, 50000, false]);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · El pago al barbero a comisión no resta dos veces');
  // ═══════════════════════════════════════════════════════════
  // El ejemplo del análisis: un corte de 30.000 al 50 %, ya pagado. La parte
  // de Pedro (15.000) ya es el costo de la venta; el pago no puede volver a
  // restarla. Antes la ganancia neta daba 0.
  const S = await H.montarEmpresa(db, { email: 'dueno@barber.com', nombre: 'Barbería Norte' });
  await db.query("update public.suscripciones set plan='negocio' where empresa_id=$1", [S.empresaId]);
  const uidPedro = await H.sumarMiembro(db, S.empresaId, 'pedro@barber.com', 'vendedor');
  const uidLuis = await H.sumarMiembro(db, S.empresaId, 'luis@barber.com', 'vendedor');
  const uidAna = await H.sumarMiembro(db, S.empresaId, 'ana@barber.com', 'vendedor');
  const corte = await H.crearProducto(db, S.empresaId, S.uid,
    { nombre: 'Corte', costo: 0, precio: 30000, controla_stock: false });
  const pedro = (await valor(S.uid, "select public.guardar_profesional($1,'Pedro','comision',50,$2) id",
    [S.empresaId, uidPedro])).id;
  const luis = (await valor(S.uid, "select public.guardar_profesional($1,'Luis','alquiler',null,$2) id",
    [S.empresaId, uidLuis])).id;
  const ana = (await valor(S.uid, "select public.guardar_profesional($1,'Ana','sueldo',null,$2) id",
    [S.empresaId, uidAna])).id;
  const hoyS = await hoyDe(S.empresaId);

  await valor(uidPedro, 'select public.registrar_servicio($1,$2,$3) j', [S.empresaId, pedro, corte]);
  // Sin cuentas creadas, lo que se mueve queda «sin cuenta»: la plata de la
  // billetera es el total de las cuentas más ese neto.
  const plata = async () => {
    const b = await j(S.uid, 'select public.billetera($1) j', [S.empresaId]);
    return num(b.total) + num(b.sin_cuenta.neto);
  };
  const billeteraAntes = await plata();
  await valor(S.uid, 'select public.pagar_profesional($1,$2,$3) j', [S.empresaId, pedro, 15000]);

  const rS = await j(S.uid, 'select public.resumen_financiero($1,$2,$2) j', [S.empresaId, hoyS]);
  ok('la venta es de 30.000 y su costo, la parte de Pedro', [num(rS.ventas), num(rS.costo_mercaderia)], [30000, 15000]);
  ok('el pago a Pedro no entra en los gastos', num(rS.gastos), 0);
  ok('se informa aparte, como pagado a profesionales', num(rS.pagado_a_profesionales), 15000);
  ok('y al local le quedan 15.000, no 0', num(rS.ganancia_neta), 15000);
  const sS = await j(S.uid, 'select public.serie_financiera_diaria($1,$2,$2) j', [S.empresaId, hoyS]);
  ok('la serie dice lo mismo', [num(sS[0].gastos), num(sS[0].ganancia), num(sS[0].pagado_a_profesionales)], [0, 15000, 15000]);
  const billeteraDespues = await plata();
  ok('pero la plata sí salió de la billetera', billeteraAntes - billeteraDespues, 15000);
  ok('y el pago sigue siendo un gasto en el historial',
    num((await db.query("select count(*)::int n from public.movimientos where empresa_id=$1 and tipo='gasto' and descripcion='Pago a Pedro'",
      [S.empresaId])).rows[0].n), 1);

  // El sueldo fijo no es costo de ninguna venta: sigue restando.
  await valor(S.uid, 'select public.registrar_servicio($1,$2,$3) j', [S.empresaId, ana, corte]);
  await valor(S.uid, 'select public.pagar_profesional($1,$2,$3) j', [S.empresaId, ana, 20000]);
  const rS2 = await j(S.uid, 'select public.resumen_financiero($1,$2,$2) j', [S.empresaId, hoyS]);
  ok('el sueldo de Ana sí es un gasto', num(rS2.gastos), 20000);
  ok('y lo pagado a profesionales sigue siendo solo lo de comisión', num(rS2.pagado_a_profesionales), 15000);
  ok('ganancia: 15.000 de Pedro + 30.000 de Ana − 20.000 de sueldo', num(rS2.ganancia_neta), 25000);

  // En la barbería el único costo es la comisión: eso no es «costo de
  // mercadería cargado», así que una compra de mercadería sigue restando.
  await gasto(S.uid, S.empresaId, hoyS, 'Mercadería', 10000, 'Ceras');
  const rS3 = await j(S.uid, 'select public.resumen_financiero($1,$2,$2) j', [S.empresaId, hoyS]);
  ok('la comisión no hace que la mercadería vaya aparte', rS3.mercaderia_aparte, false);
  ok('la compra de ceras resta', num(rS3.ganancia_neta), 15000);

  const rSV = await j(uidPedro, 'select public.resumen_financiero($1,$2,$2) j', [S.empresaId, hoyS]);
  ok('a un vendedor lo pagado a profesionales le llega en null', rSV.pagado_a_profesionales, null);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · El que alquila la silla no tiene «le debés»');
  // ═══════════════════════════════════════════════════════════
  await valor(uidLuis, 'select public.registrar_servicio($1,$2,$3) j', [S.empresaId, luis, corte]);
  const liq = await j(S.uid, 'select public.liquidacion($1,$2,$2) j', [S.empresaId, hoyS]);
  const deLuis = liq.find((x) => x.nombre === 'Luis');
  ok('Luis hizo un corte', num(deLuis.cortes), 1);
  ok('cobró 30.000, que se quedó él', num(deLuis.cobrado), 30000);
  ok('el local no le debe nada', num(deLuis.le_debe), 0);
  ok('y lo que le toca es 0: ya lo cobró él', num(deLuis.le_toca), 0);
  const dePedro = liq.find((x) => x.nombre === 'Pedro');
  ok('Pedro, a comisión, sigue igual: le tocan 15.000, cobró 15.000', [num(dePedro.le_toca), num(dePedro.le_debe)], [15000, 0]);
  const deLuisMio = await j(uidLuis, 'select public.mis_servicios($1,$2,$2) j', [S.empresaId, hoyS]);
  ok('en su propia vista, Luis tampoco figura con plata a cobrarle al local', num(deLuisMio.le_deben), 0);

  // ═══════════════════════════════════════════════════════════
  grupo('3b · El aviso del día dice la misma ganancia que el panel');
  // ═══════════════════════════════════════════════════════════
  // El push de la mañana y el de la noche (avisos_del_dia, 080) calculaban
  // la ganancia a mano con TODOS los gastos: con los arreglos 1 y 2 iban a
  // decir «perdiste» el día que el panel dice que ganó.
  const delDia = async (empresa) => (await H.comoServicio(db, () =>
    db.query('select public.avisos_del_dia() l').then((x) => x.rows[0].l))).find((x) => x.empresa_id === empresa);
  const AL = await H.montarEmpresa(db, { email: 'dueno@despensa.com', nombre: 'Despensa Rosa' });
  const yerba = await H.crearProducto(db, AL.empresaId, AL.uid,
    { nombre: 'Yerba', costo: 6000, precio: 10000, stock: 100 });
  const hoyAL = await hoyDe(AL.empresaId);
  const ayerAL = await masDias(hoyAL, -1);
  // Hoy: vende 10 yerbas con costo, compra 500.000 de mercadería y paga
  // 20.000 de nafta. Ayer: solo compró mercadería (sin ventas con costo ese
  // día), así que ayer la compra sí resta, como en el panel de ayer.
  await valor(AL.uid, 'select public.registrar_venta($1,$2::jsonb,$3) id',
    [AL.empresaId, JSON.stringify([{ producto_id: yerba, cantidad: 10 }]), hoyAL]);
  await gasto(AL.uid, AL.empresaId, hoyAL, 'Mercadería', 500000, 'Compra al mayorista');
  await gasto(AL.uid, AL.empresaId, hoyAL, 'Transporte', 20000, 'Nafta');
  await gasto(AL.uid, AL.empresaId, ayerAL, 'Mercadería', 30000, 'Reposición');
  const avAL = await delDia(AL.empresaId);
  const panelHoyAL = await j(AL.uid, 'select public.resumen_financiero($1,$2,$2) j', [AL.empresaId, hoyAL]);
  const panelAyerAL = await j(AL.uid, 'select public.resumen_financiero($1,$2,$2) j', [AL.empresaId, ayerAL]);
  ok('el almacén recibe su aviso', Boolean(avAL), true);
  ok('hoy: la compra con costo cargado no resta (ganó 100.000 − 60.000 − 20.000)',
    [num(avAL.hoy.gastos), num(avAL.hoy.ganancia)], [20000, 20000]);
  ok('hoy: el aviso dice lo mismo que el panel',
    [num(avAL.hoy.gastos), num(avAL.hoy.ganancia)], [num(panelHoyAL.gastos), num(panelHoyAL.ganancia_neta)]);
  ok('ayer: sin costo cargado ese día, la compra resta, igual que el panel de ayer',
    [num(avAL.ayer.gastos), num(avAL.ayer.ganancia)], [num(panelAyerAL.gastos), num(panelAyerAL.ganancia_neta)]);
  ok('y ese número es −30.000', num(avAL.ayer.ganancia), -30000);

  // La barbería de arriba, hoy: el pago a Pedro (comisión) no resta; el
  // sueldo de Ana y las ceras sí. El panel dice 15.000.
  const avS = await delDia(S.empresaId);
  ok('la barbería: el pago a comisión no resta otra vez en el aviso',
    [num(avS.hoy.gastos), num(avS.hoy.ganancia)], [num(rS3.gastos), num(rS3.ganancia_neta)]);
  ok('y la ganancia del aviso es 15.000', num(avS.hoy.ganancia), 15000);

  const listaGrupo2 = { A, vendA, dA, S, uidPedro, uidLuis, uidAna, pedro, luis, ana, corte, hoyS };
  if (!sin106) await lecturas(db, { llamar, valor, j, hoyDe, masDias, gasto, ...listaGrupo2 });

  console.log('\n══════════════════════════════════════════════════════════════');
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE REPORTES FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE REPORTES PASARON`);
  process.exit(0);
})().catch((e) => { console.error('error inesperado:', e); process.exit(2); });

// Las lecturas nuevas, aparte para que la primera parte se lea sola.
//
// Los datos de cada caso se cargan directo en las tablas (como el sistema):
// lo que se prueba acá es la LECTURA, no cómo se carga cada cosa, que ya
// tiene sus propias pruebas (agenda, paquetes, entrenamiento, clientes).
async function lecturas(db, c) {
  const { llamar, valor, j, hoyDe, masDias, A, vendA, dA, S, uidPedro, pedro, ana, corte } = c;
  const sql = async (q, args = []) => (await db.query(q, args)).rows;
  const uno = async (q, args = []) => (await sql(q, args))[0];
  const extrano = await H.crearUsuario(db, 'extrano@nadie.com');
  const venta = async (uid, empresa, producto, cantidad, fecha) =>
    (await valor(uid, 'select public.registrar_venta($1,$2::jsonb,$3) id',
      [empresa, JSON.stringify([{ producto_id: producto, cantidad }]), fecha])).id;

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Movimientos con cuenta, cliente, quién lo cargó, lote y moneda');
  // ═══════════════════════════════════════════════════════════
  const cuenta = (await uno("insert into public.cuentas_dinero (empresa_id, nombre) values ($1,'Caja chica') returning id",
    [A.empresaId])).id;
  const marta = (await uno("insert into public.clientes (empresa_id, nombre) values ($1,'Marta') returning id",
    [A.empresaId])).id;
  const lote = (await uno("insert into public.lotes (empresa_id, nombre, abierto_el) values ($1,'Lote 7',$2) returning id",
    [A.empresaId, dA])).id;
  const arroz2 = await H.crearProducto(db, A.empresaId, A.uid, { nombre: 'Fideo', costo: 3000, precio: 10000, stock: 100 });
  const vv = await venta(vendA, A.empresaId, arroz2, 2, dA);
  await sql(`update public.movimientos set cuenta_id=$2, cliente_id=$3, lote_id=$4, moneda_original='USD', monto_original=3, cambio=6666.6666666667
             where id=$1`, [vv, cuenta, marta, lote]);
  const nombreVend = (await uno('select nombre from public.miembros where empresa_id=$1 and user_id=$2', [A.empresaId, vendA])).nombre;

  const pag = await j(A.uid, 'select public.pagina_movimientos($1,$2,$3) j', [A.empresaId, dA, '2026-03-03']);
  const fila = pag.movimientos.find((m) => m.id === vv);
  ok('trae la cuenta', [fila.cuenta_id === cuenta, fila.cuenta_nombre], [true, 'Caja chica']);
  ok('trae el cliente', [fila.cliente_id === marta, fila.cliente_nombre], [true, 'Marta']);
  ok('trae quién la cargó, con su nombre', [fila.creado_por === vendA, fila.creado_por_nombre], [true, nombreVend]);
  ok('trae el lote', [fila.lote_id === lote, fila.lote_nombre], [true, 'Lote 7']);
  ok('trae la moneda original y el cambio', [fila.moneda_original, num(fila.monto_original), Math.round(num(fila.cambio))], ['USD', 3, 6667]);
  ok('lo de siempre no cambió: ítems y costo', [fila.movimiento_items.length, num(fila.costo_total)], [1, 6000]);
  const sinDatos = pag.movimientos.find((m) => m.descripcion === 'Nafta');
  ok('un gasto sin esos datos los trae en null',
    [sinDatos.cuenta_nombre, sinDatos.cliente_nombre, sinDatos.lote_nombre, sinDatos.moneda_original], [null, null, null, null]);
  const pagV = await j(vendA, 'select public.pagina_movimientos($1,$2,$3) j', [A.empresaId, dA, '2026-03-03']);
  ok('al vendedor el costo le sigue llegando en null', pagV.movimientos.find((m) => m.id === vv).costo_total, null);
  ok('y no ve los gastos de otros', pagV.movimientos.some((m) => m.descripcion === 'Nafta'), false);
  rechazado('a alguien de afuera no le llega nada',
    await llamar(extrano, 'select public.pagina_movimientos($1,$2,$3) j', [A.empresaId, dA, dA]), 'No pertenecés');

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Turnos del período');
  // ═══════════════════════════════════════════════════════════
  const hS = await hoyDe(S.empresaId);
  const dS = await masDias(hS, -3);
  const antes = await masDias(hS, -30);
  const cliS = (await uno("insert into public.clientes (empresa_id, nombre) values ($1,'Carlos') returning id", [S.empresaId])).id;
  // Un turno a la hora local del negocio (Asunción): así el de las 23:30 del
  // último día cae en ese día y no en el siguiente, como lo ve la agenda.
  const turno = (prof, dia, hora, estado, origen = 'local', cliente = null) => sql(
    `insert into public.turnos_reserva (empresa_id, profesional_id, producto_id, inicia, termina, cliente_nombre, estado, origen, cliente_id)
     values ($1,$2,$3, ($4::date + $5::time) at time zone 'America/Asuncion',
             ($4::date + $5::time + interval '30 minutes') at time zone 'America/Asuncion', 'Cliente', $6, $7, $8)`,
    [S.empresaId, prof, corte, dia, hora, estado, origen, cliente]);
  await turno(pedro, dS, '10:00', 'atendida', 'local', cliS);
  await turno(pedro, await masDias(hS, -2), '11:00', 'atendida', 'publico', cliS);
  await turno(pedro, await masDias(hS, -1), '09:00', 'no_vino');
  await turno(ana, dS, '15:00', 'cancelada', 'publico');
  await turno(ana, hS, '23:30', 'pendiente');
  await turno(ana, antes, '10:00', 'atendida');                  // fuera del período

  const rt = await j(S.uid, 'select public.reporte_turnos($1,$2,$3) j', [S.empresaId, dS, hS]);
  ok('cuenta los turnos del período, no los de antes', rt.total, 5);
  ok('por estado', ordenado(rt.por_estado), ordenado({ pendiente: 1, confirmada: 0, atendida: 2, no_vino: 1, cancelada: 1 }));
  ok('por origen (link o local)', ordenado(rt.por_origen), { local: 3, publico: 2 });
  ok('por profesional',
    rt.por_profesional.map((p) => [p.nombre, p.total, p.atendidas, p.no_vino, p.canceladas, p.pendientes]),
    [['Pedro', 3, 2, 1, 0, 0], ['Ana', 2, 0, 0, 1, 1]]);
  ok('por servicio', rt.por_servicio.map((p) => [p.nombre, p.total, p.atendidas]), [['Corte', 5, 2]]);
  ok('los clientes que más vuelven: solo atendidos y de la agenda',
    rt.clientes.map((x) => [x.nombre, x.visitas]), [['Carlos', 2]]);
  const rtV = await j(uidPedro, 'select public.reporte_turnos($1,$2,$3) j', [S.empresaId, dS, hS]);
  ok('un miembro del equipo también lo ve (no hay plata)', rtV.total, 5);
  rechazado('a alguien de afuera no',
    await llamar(extrano, 'select public.reporte_turnos($1,$2,$3) j', [S.empresaId, dS, hS]), 'No pertenecés');

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Alumnos del período (clases desde clases_dadas)');
  // ═══════════════════════════════════════════════════════════
  const P = await H.montarEmpresa(db, { email: 'profe@musica.com', nombre: 'Clases de Lu' });
  const vendP = await H.sumarMiembro(db, P.empresaId, 'ayudante@musica.com', 'vendedor');
  const h = await hoyDe(P.empresaId);
  const d = (n) => masDias(h, n);
  const desde = await d(-20);
  const clase = await H.crearProducto(db, P.empresaId, P.uid,
    { nombre: 'Clase', costo: 0, precio: 100000, controla_stock: false });
  const alumno = async (nombre) =>
    (await uno('insert into public.clientes (empresa_id, nombre) values ($1,$2) returning id', [P.empresaId, nombre])).id;
  const paquete = async (cliente, nombre, clases, precio, creado, { materia = null, vence = null, cobro = null } = {}) => {
    let mov = null;
    if (cobro) {
      mov = await venta(P.uid, P.empresaId, clase, precio / 100000, cobro);
      await sql('update public.movimientos set cliente_id=$2 where id=$1', [mov, cliente]);
    }
    return (await uno(
      `insert into public.paquetes (empresa_id, cliente_id, nombre, clases, precio, movimiento_id, vence_el, materia, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8, ($9::date + time '12:00') at time zone 'America/Asuncion') returning id`,
      [P.empresaId, cliente, nombre, clases, precio, mov, vence, materia, creado])).id;
  };
  const dar = async (paq, fecha, motivo = 'dada', cantidad = 1) => sql(
    'insert into public.clases_dadas (empresa_id, paquete_id, fecha, cantidad, motivo) values ($1,$2,$3,$4,$5)',
    [P.empresaId, paq, fecha, cantidad, motivo]);

  const juan = await alumno('Juan');
  const sofia = await alumno('Sofía');
  const leo = await alumno('Leo');
  // Juan: alumno nuevo, pagó su paquete; 3 clases y 1 falta en el período.
  const j1 = await paquete(juan, '8 clases', 8, 200000, await d(-10), { materia: 'Guitarra', cobro: await d(-10) });
  for (const n of [-9, -7, -5]) await dar(j1, await d(n));
  await dar(j1, await d(-3), 'falta');
  // Sofía: su primer paquete (sin cobrar) terminó en el período y renovó.
  const s1 = await paquete(sofia, '4 clases', 4, 100000, await d(-40), { materia: 'Piano' });
  await dar(s1, await d(-35), 'dada', 2);
  await dar(s1, await d(-15));
  await dar(s1, await d(-12));
  const s2 = await paquete(sofia, '4 clases', 4, 100000, await d(-11),
    { materia: 'Piano', cobro: await d(-11), vence: await d(5) });
  await dar(s2, await d(-2));
  // Leo: su paquete venció en el período y no renovó; debe un fiado.
  const l1 = await paquete(leo, '10 clases', 10, 300000, await d(-50), { materia: 'Piano', vence: await d(-5), cobro: await d(-50) });
  await dar(l1, await d(-45), 'dada', 3);
  await sql("insert into public.fiado (empresa_id, cliente_id, tipo, monto, fecha) values ($1,$2,'fio',50000,$3)",
    [P.empresaId, leo, await d(-6)]);

  const ra = await j(P.uid, 'select public.reporte_alumnos($1,$2,$3) j', [P.empresaId, desde, h]);
  ok('clases dadas y faltas del período', [num(ra.clases_dadas), num(ra.faltas)], [6, 1]);
  ok('por semana suma lo mismo', ra.por_semana.reduce((s, x) => s + Number(x.dadas), 0), 6);
  ok('cobrado: las ventas del período', num(ra.cobrado), 300000);
  ok('cobrado por clase: 300.000 ÷ 6', num(ra.cobrado_por_clase), 50000);
  ok('por cobrar hoy: la regla de por_cobrar_alumnos', num(ra.por_cobrar),
    num((await j(P.uid, 'select public.por_cobrar_alumnos($1) j', [P.empresaId])).total));
  ok('y el fiado, aparte', num(ra.fiado_pendiente), 50000);
  ok('activos hoy y nuevos del período', [ra.activos, ra.nuevos], [2, 1]);
  ok('paquetes: vendidos, terminados, vencidos, renovaron', ordenado(ra.paquetes),
    ordenado({ vendidos: 2, terminados: 1, vencidos: 1, renovaron: 1 }));
  ok('a quién llamar: el de Sofía vence en 5 días',
    ra.por_terminar.map((x) => [x.alumno, num(x.quedan)]), [['Sofía', 3]]);
  const fil = Object.fromEntries(ra.alumnos.map((x) => [x.nombre, x]));
  ok('Juan: clases, faltas, cobrado, debe', [num(fil.Juan.clases), num(fil.Juan.faltas), num(fil.Juan.cobrado), num(fil.Juan.debe)],
    [3, 1, 200000, 0]);
  ok('Juan: su paquete vigente (la falta también gasta clase)', [fil.Juan.paquete, num(fil.Juan.usadas), num(fil.Juan.quedan)],
    ['8 clases', 4, 4]);
  ok('Sofía debe la inscripción que no pagó', [num(fil['Sofía'].debe_inscripciones), num(fil['Sofía'].debe)], [100000, 100000]);
  ok('Leo: sin paquete vigente, debe el fiado', [fil.Leo.paquete, num(fil.Leo.debe_fiado), num(fil.Leo.debe)], [null, 50000, 50000]);
  ok('la suma de lo que deben es por cobrar + fiado',
    ra.alumnos.reduce((s, x) => s + Number(x.debe), 0), num(ra.por_cobrar) + num(ra.fiado_pendiente));
  ok('cobrado por paquete', ra.por_paquete.map((x) => [x.nombre, num(x.cobrado)]), [['8 clases', 200000], ['4 clases', 100000]]);
  ok('por materia, porque enseña dos', ra.por_materia.map((x) => [x.materia, num(x.cobrado)]), [['Guitarra', 200000], ['Piano', 100000]]);
  rechazado('a alguien de afuera no',
    await llamar(extrano, 'select public.reporte_alumnos($1,$2,$3) j', [P.empresaId, desde, h]), 'No pertenecés');

  // Un profe con una sola materia: no hay «por materia».
  await sql("update public.paquetes set materia='Piano' where id=$1", [j1]);
  const ra1 = await j(P.uid, 'select public.reporte_alumnos($1,$2,$3) j', [P.empresaId, desde, h]);
  ok('con una sola materia, por materia va vacío', ra1.por_materia, []);
  // Sin clases dadas, no hay «cobrado por clase»: null, no cero.
  const vacio = await j(P.uid, 'select public.reporte_alumnos($1,$2,$3) j', [P.empresaId, await d(-100), await d(-90)]);
  ok('sin clases, el cobrado por clase es null', vacio.cobrado_por_clase, null);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Progreso de los clientes del trainer');
  // ═══════════════════════════════════════════════════════════
  const med = (cliente, fecha, datos) => sql(
    `insert into public.mediciones (empresa_id, cliente_id, fecha, peso_kg, cintura_cm, grasa_pct, grasa_metodo)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [P.empresaId, cliente, fecha, datos.peso ?? null, datos.cintura ?? null, datos.grasa ?? null, datos.metodo ?? null]);
  // Juan y Sofía tienen plan activo; Leo, no (venció). Se suma Caro, activa y sin medir.
  const caro = await alumno('Caro');
  await paquete(caro, 'Plan mensual', 12, 250000, await d(-3));
  await med(juan, await d(-50), { peso: 80, cintura: 90, grasa: 25, metodo: 'balanza' });
  await med(juan, await d(-10), { peso: 76, cintura: 86, grasa: 23, metodo: 'balanza' });
  await med(sofia, await d(-45), { peso: 100, grasa: 30, metodo: 'plicometro' });
  await med(sofia, await d(-40), { peso: 98, grasa: 28, metodo: 'balanza' });
  await sql(`insert into public.rutinas (empresa_id, cliente_id, estado, nombre, desde) values ($1,$2,'vigente','Fuerza A',$3)`,
    [P.empresaId, juan, await d(-50)]);

  const pg = await j(P.uid, 'select public.progreso_clientes($1,$2,$3) j', [P.empresaId, await d(-60), h]);
  ok('se midieron dos', pg.medidos, 2);
  ok('cambio promedio de peso: (−4 −2) ÷ 2', [pg.con_peso, num(pg.cambio_peso)], [2, -3]);
  ok('cintura: solo Juan tiene dos', [pg.con_cintura, num(pg.cambio_cintura)], [1, -4]);
  ok('grasa: la de Sofía cambió de aparato y no se compara', [pg.con_grasa, num(pg.cambio_grasa)], [1, -2]);
  const deSofia = pg.clientes.find((x) => x.nombre === 'Sofía');
  ok('en su fila, la grasa va en null', [deSofia.grasa_cambio, num(deSofia.peso_cambio)], [null, -2]);
  ok('sin medir hace más de 30 días (Sofía y Caro)', pg.sin_medir_30, 2);
  ok('sin rutina vigente (Sofía y Caro)', pg.sin_rutina, 2);
  const deCaro = pg.clientes.find((x) => x.nombre === 'Caro');
  ok('Caro: sin mediciones, todo en null', [deCaro.mediciones, deCaro.peso_cambio, deCaro.dias_sin_medir, deCaro.sin_medir_30],
    [0, null, null, true]);
  ok('Leo (sin plan activo y sin medir) no aparece', pg.clientes.some((x) => x.nombre === 'Leo'), false);
  const pgVacio = await j(P.uid, 'select public.progreso_clientes($1,$2,$3) j', [P.empresaId, await d(-9), h]);
  ok('sin dos mediciones en el período, los cambios son null', [pgVacio.cambio_peso, pgVacio.medidos], [null, 0]);
  rechazado('al ayudante (no administra) no le llega',
    await llamar(vendP, 'select public.progreso_clientes($1,$2,$3) j', [P.empresaId, desde, h]), 'dueño o de un administrador');
  rechazado('a alguien de afuera tampoco',
    await llamar(extrano, 'select public.progreso_clientes($1,$2,$3) j', [P.empresaId, desde, h]), 'No pertenecés');

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Ventas por vendedor');
  // ═══════════════════════════════════════════════════════════
  // En el almacén: el dueño vendió 100.000 (grupo 1) y la caja 20.000 de
  // fideos (grupo 4). La caja además carga una venta que después se anula.
  const anulada = await venta(vendA, A.empresaId, arroz2, 1, dA);
  await valor(A.uid, "select public.anular_movimiento($1,'Se equivocó')", [anulada]);
  const vpv = await j(A.uid, 'select public.ventas_por_vendedor($1,$2,$3) j', [A.empresaId, dA, '2026-03-03']);
  ok('por quien la cargó, de mayor a menor',
    vpv.map((x) => [x.nombre, num(x.vendido), x.cantidad, num(x.ticket_promedio), x.anuladas, num(x.monto_anulado)]),
    [[(await uno('select nombre from public.miembros where empresa_id=$1 and user_id=$2', [A.empresaId, A.uid])).nombre,
      100000, 1, 100000, 0, 0],
     [nombreVend, 20000, 1, 20000, 1, 10000]]);
  rechazado('a la caja (vendedor) no le llega',
    await llamar(vendA, 'select public.ventas_por_vendedor($1,$2,$3) j', [A.empresaId, dA, dA]), 'No tenés acceso');
  rechazado('a alguien de afuera tampoco',
    await llamar(extrano, 'select public.ventas_por_vendedor($1,$2,$3) j', [A.empresaId, dA, dA]), 'No tenés acceso');

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Fiado del período');
  // ═══════════════════════════════════════════════════════════
  const fia = (tipo, monto, fecha) => sql(
    'insert into public.fiado (empresa_id, cliente_id, tipo, monto, fecha) values ($1,$2,$3,$4,$5)',
    [A.empresaId, marta, tipo, monto, fecha]);
  await fia('fio', 30000, '2026-02-20');   // antes del período
  await fia('fio', 40000, dA);
  await fia('cobro', 25000, '2026-03-03');
  const fp = await j(A.uid, 'select public.fiado_del_periodo($1,$2,$3) j', [A.empresaId, dA, '2026-03-03']);
  ok('otorgado y cobrado del período', [num(fp.otorgado), num(fp.cobrado)], [40000, 25000]);
  ok('por cliente, con lo que debe hoy (30.000 + 40.000 − 25.000)',
    fp.clientes.map((x) => [x.nombre, num(x.otorgado), num(x.cobrado), num(x.saldo_hoy)]), [['Marta', 40000, 25000, 45000]]);
  ok('coincide con la foto de hoy (resumen_fiado)',
    num(fp.clientes[0].saldo_hoy),
    num((await j(A.uid, 'select public.resumen_fiado($1) j', [A.empresaId])).total));
  const fpV = await j(vendA, 'select public.fiado_del_periodo($1,$2,$3) j', [A.empresaId, dA, '2026-03-03']);
  ok('la caja también lo ve, como el fiado de hoy', num(fpV.otorgado), 40000);
  rechazado('a alguien de afuera no',
    await llamar(extrano, 'select public.fiado_del_periodo($1,$2,$3) j', [A.empresaId, dA, dA]), 'No pertenecés');

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Ninguna función nueva está abierta a anon');
  // ═══════════════════════════════════════════════════════════
  const abiertas = await sql(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('reporte_turnos','reporte_alumnos','progreso_clientes','ventas_por_vendedor',
                        'fiado_del_periodo','es_categoria_mercaderia','pagina_movimientos','resumen_financiero',
                        'serie_financiera_diaria','gastos_por_categoria','liquidacion','mis_servicios','pagar_profesional')
      and has_function_privilege('anon', p.oid, 'execute')`);
  ok('anon no puede ejecutar ninguna', abiertas.map((x) => x.proname), []);
  const inseguras = await sql(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('reporte_turnos','reporte_alumnos','progreso_clientes','ventas_por_vendedor','fiado_del_periodo')
      and (not p.prosecdef or p.provolatile <> 's'
           or not coalesce(p.proconfig::text like '%search_path=public%', false))`);
  ok('todas stable, security definer y con search_path fijo', inseguras.map((x) => x.proname), []);
}
