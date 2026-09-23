/**
 * Campañas, cosechas y liquidaciones (migración 100).
 *
 * El caso real es el del contrato (§5.8): un negocio en dólares abre
 * «Norte · Soja · Zafra 2026/27 · 50 ha» a US$ 415 la tonelada. Le pone
 * semilla, fertilizante pagado en guaraníes y combustible; se lleva los
 * agroquímicos «a cosecha» (una deuda de la campaña, sin gasto); cosecha
 * dos camiones; y la cooperativa le liquida en UN papel: bruto por los
 * kilos, menos secado, flete y retención, menos la deuda que se cobró el
 * silo, menos el alquiler en kilos del dueño del campo. El banco acredita
 * el neto.
 *
 * Lo que se comprueba, en este orden:
 *
 *   · que ese papel cuadre PESO POR PESO en la cuenta, en la campaña y en
 *     la deuda, y que nada cuente dos veces;
 *   · que un reintento sin señal (mismo id de cosecha, mismo grupo de
 *     liquidación) devuelva lo mismo y no duplique;
 *   · que anular la liquidación deje todo exactamente como estaba;
 *   · que lo que cuenta cuánto se debe —a cosecha, costo, deudas,
 *     estructura— no le llegue al peón, y que los kilos sí;
 *   · que ninguna función deje colgar una cosecha, una deuda o una venta
 *     del lote de otra empresa, y que la base lo frene aunque se salteen
 *     la función;
 *   · y que ganadería y las deudas de los otros rubros sigan igual
 *     (lotes.test.js y deudas.test.js pasan sin cambios).
 */
const H = require('./ayuda-db.js');
const crypto = require('crypto');

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
    console.log(`  ✓ ${nombre} → ${a.length > 90 ? a.slice(0, 87) + '...' : a}`);
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
  console.log(`  ✓ ${nombre} → rechazada: ${resultado.error.split('\n')[0].slice(0, 64)}`);
}

function aceptado(nombre, resultado) {
  corridas++;
  if (!resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      fue rechazada: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre}`);
}

const num = (v) => (v === null || v === undefined ? null : Number(v));
const uuid = () => crypto.randomUUID();

(async () => {
  const db = await H.crearBase();

  // El sojero: negocio en dólares. El peón pesa los camiones y carga gastos.
  const campo = await H.montarEmpresa(db, { email: 'sojero@norte.com', nombre: 'Agro Norte', rubro: 'agricultura', moneda: 'USD' });
  const uidPeon = await H.sumarMiembro(db, campo.empresaId, 'peon@norte.com', 'vendedor');
  const vecino = await H.montarEmpresa(db, { email: 'vecino@sur.com', nombre: 'Agro Sur', rubro: 'agricultura', moneda: 'USD' });
  const estancia = await H.montarEmpresa(db, { email: 'ganadero@estancia.com', nombre: 'Estancia La Esperanza', rubro: 'ganaderia' });
  const E = campo.empresaId;

  const llamar = (uid, sql, args) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args) => {
    const r = await llamar(uid, sql, args);
    if (!r.ok) throw new Error(`${sql} → ${r.error}`);
    return r.valor.rows[0];
  };
  const crudo = async (sql, args) => (await db.query(sql, args)).rows[0];
  const cuenta = async (sql, args) => Number((await crudo(sql, args)).n);

  const hoy = (await crudo('select public.hoy_empresa($1)::text h', [E])).h;
  const dia = async (n) => (await crudo('select ($1::date + $2::int)::text d', [hoy, n])).d;

  /** Carga un gasto o un ingreso como lo hace la pantalla: insert directo bajo RLS. */
  const movimiento = async (uid, { tipo = 'gasto', monto, descripcion, categoria = 'Insumos', lote = null, extras = {} }) => {
    const cols = ['empresa_id', 'tipo', 'estado', 'fecha', 'descripcion', 'categoria', 'subtotal', 'descuento', 'monto',
      'costo_total', 'metodo_pago', 'creado_por', 'lote_id', ...Object.keys(extras)];
    const vals = [E, tipo, 'activo', hoy, descripcion, categoria, monto, 0, monto, 0, 'efectivo', uid, lote,
      ...Object.values(extras)];
    const r = await H.intentar(db, uid, () => db.query(
      `insert into public.movimientos (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
      vals));
    return r.ok ? r.valor.rows[0].id : r;
  };

  const lotes = async (uid, empresa = E, cerrados = true) =>
    (await valor(uid, 'select public.listar_lotes($1,$2) j', [empresa, cerrados])).j;
  const unLote = async (uid, id, empresa = E) => (await lotes(uid, empresa)).find((l) => l.id === id);
  const resumen = async (uid, id) => (await valor(uid, 'select public.resumen_lote($1,$2) j', [E, id])).j;
  const abrir = (uid, empresa, nombre, { unidad = '', cantidad = 0, id = null, cultivo = '', campana = '', ha = null, precio = null } = {}) =>
    llamar(uid, 'select public.guardar_lote($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) id',
      [empresa, nombre, unidad, cantidad, '', id, null, cultivo, campana, ha, precio]);
  const saldoDeuda = async (id) => Number((await crudo('select saldo::numeric s from public.deudas where id=$1', [id])).s);
  const saldoCuenta = async (id) => Number((await crudo('select public.saldo_cuenta_dinero($1) s', [id])).s);

  const banco = (await valor(campo.uid, 'select public.guardar_cuenta_dinero($1,$2,$3,$4,$5) id',
    [E, 'Banco', 'banco', 0, ['transferencia']])).id;

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Abrir la campaña');
  // ═══════════════════════════════════════════════════════════

  rechazado('un peón no abre una campaña',
    await abrir(uidPeon, E, 'Norte', { cultivo: 'Soja', ha: 50 }), 'Solo administración');
  rechazado('en agricultura, sin hectáreas no hay costo por hectárea: se rechaza',
    await abrir(campo.uid, E, 'Norte', { cultivo: 'Soja' }), 'cuántas hectáreas');
  rechazado('ni con cero hectáreas',
    await abrir(campo.uid, E, 'Norte', { cultivo: 'Soja', ha: 0 }), 'más que cero');
  rechazado('ni con un precio esperado negativo',
    await abrir(campo.uid, E, 'Norte', { cultivo: 'Soja', ha: 50, precio: -1 }), 'no puede ser negativo');

  const r1 = await abrir(campo.uid, E, 'Norte', { cultivo: 'Soja', campana: 'Zafra 2026/27', ha: 50, precio: 415 });
  aceptado('el dueño abre Norte · Soja · Zafra 2026/27 · 50 ha a 415', r1);
  const norte = r1.valor.rows[0].id;

  const filaNorte = await crudo('select unidad, cantidad::numeric c, hectareas::numeric h from public.lotes where id=$1', [norte]);
  ok('con hectáreas y sin unidad, la unidad es la hectárea', filaNorte.unidad, 'ha');
  ok('y la cantidad son las hectáreas: el «por unidad» de siempre es por hectárea', num(filaNorte.c), 50);

  const corral = await abrir(estancia.uid, estancia.empresaId, 'Novillos corral 3', { unidad: 'cabezas', cantidad: 40 });
  aceptado('ganadería sigue abriendo sin hectáreas', corral);
  ok('y con sus cabezas',
    (await crudo('select unidad from public.lotes where id=$1', [corral.valor.rows[0].id])).unidad, 'cabezas');

  aceptado('editar con p_id cambia precio y hectáreas',
    await abrir(campo.uid, E, 'Norte', { id: norte, cultivo: 'Soja', campana: 'Zafra 2026/27', ha: 60, precio: 420 }));
  let l = await unLote(campo.uid, norte);
  ok('la lista trae cultivo, campaña, hectáreas y precio esperado',
    [l.cultivo, l.campana, num(l.hectareas), num(l.precio_esperado)], ['Soja', 'Zafra 2026/27', 60, 420]);
  // Se vuelve al ejemplo del contrato.
  await abrir(campo.uid, E, 'Norte', { id: norte, cultivo: 'Soja', campana: 'Zafra 2026/27', ha: 50, precio: 415 });
  l = await unLote(campo.uid, norte);
  ok('y después de editar, la campaña sigue con sus 50 ha y sus 415', [num(l.hectareas), num(l.precio_esperado)], [50, 415]);
  ok('todos los números vienen aunque todavía no haya nada',
    ['puesto', 'cobrado', 'resultado', 'a_cosecha', 'costo', 'costo_ha', 'kg_cosechados', 'kg_vendidos', 'kg_sin_vender',
      'vendido', 'precio_promedio', 'precio_ref', 'rendimiento', 'costo_ton', 'kg_ha_para_cubrir', 'falta_cubrir', 'kg_para_cubrir']
      .every((k) => k in l), true);
  ok('sin ventas, el precio de referencia es el esperado', num(l.precio_ref), 415);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Ponerle plata, también en otra moneda');
  // ═══════════════════════════════════════════════════════════

  const semilla = await movimiento(campo.uid, { monto: 3400, descripcion: 'Semilla', categoria: 'Semilla', lote: norte });
  ok('el dueño carga la semilla a la campaña', typeof semilla, 'string');

  // 36.000.000 guaraníes al 6.000: US$ 6.000. `cambio` son dólares por guaraní.
  const ferti = await movimiento(uidPeon, {
    monto: 6000, descripcion: 'Fertilizante', categoria: 'Fertilizante', lote: norte,
    extras: { monto_original: 36000000, moneda_original: 'PYG', cambio: 0.0001666667 },
  });
  ok('el peón carga el fertilizante pagado en guaraníes, bajo RLS', typeof ferti, 'string');
  const reparto = uuid();
  const combustible = await movimiento(uidPeon, {
    monto: 1200, descripcion: 'Gasoil', categoria: 'Combustible', lote: norte, extras: { reparto_id: reparto },
  });
  ok('y el gasoil con su id de reparto', typeof combustible, 'string');

  rechazado('un monto original sin cambio no cierra',
    await movimiento(campo.uid, { monto: 10, descripcion: 'Raro', lote: norte, extras: { monto_original: 60000, moneda_original: 'PYG' } }),
    'movimiento_original_coherente|check');

  l = await unLote(campo.uid, norte);
  ok('lleva puesto lo que se gastó', num(l.puesto), 10600);
  ok('y por hectárea', num(l.costo_ha), 212);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Los agroquímicos, a cosecha');
  // ═══════════════════════════════════════════════════════════

  const rSur = await abrir(vecino.uid, vecino.empresaId, 'Sur', { cultivo: 'Maíz', ha: 10 });
  const loteVecino = rSur.valor.rows[0].id;

  rechazado('una deuda no se cuelga del lote de otro',
    await llamar(campo.uid, "select public.crear_deuda($1,'Ajena','proveedor','X',100,null,null,null,null,'',$2,'Otros')",
      [E, loteVecino]), 'no es de esta cuenta');

  const agro = (await valor(campo.uid,
    'select public.crear_deuda($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) id',
    [E, 'Agroquímicos Agrofértil', 'proveedor', 'Agrofértil', 4800, null, null, null, '2027-03-15', '', norte, 'Agroquímicos'])).id;
  ok('la deuda quedó con su campaña y su categoría',
    (await crudo('select lote_id = $2 l, categoria from public.deudas where id=$1', [agro, norte])), { l: true, categoria: 'Agroquímicos' });

  l = await unLote(campo.uid, norte);
  ok('no es gasto: lo puesto no cambió', num(l.puesto), 10600);
  ok('pero se debe a cosecha', num(l.a_cosecha), 4800);
  ok('y el costo lo cuenta', num(l.costo), 15400);
  ok('con su costo por hectárea', num(l.costo_ha), 308);
  ok('y cuántos kilos por hectárea hacen falta para cubrirlo al precio esperado', num(l.kg_ha_para_cubrir), 742.17);
  ok('la campaña no cobró nada todavía: falta cubrir todo el costo', num(l.falta_cubrir), 15400);
  ok('que son estos kilos', num(l.kg_para_cubrir), 37108);

  // Otra campaña, para el pago parcial: no ensucia los números de Norte.
  const sur = (await abrir(campo.uid, E, 'Sur', { cultivo: 'Maíz', campana: 'Zafriña 2027', ha: 20 })).valor.rows[0].id;
  const venceSemilla = await dia(30);
  const semillaFiada = (await valor(campo.uid,
    'select public.crear_deuda($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) id',
    [E, 'Semilla fiada', 'proveedor', 'Semillería', 1000, null, null, null, venceSemilla, '', sur, 'Semilla'])).id;

  const pagoParcial = (await valor(campo.uid,
    'select public.registrar_pago_deuda($1,$2,$3,$4,$5,$6,$7,$8,$9) r',
    [semillaFiada, 400, hoy, true, 'transferencia', 'A cuenta', banco, null, null])).r;
  ok('el pago parcial bajó el saldo', await saldoDeuda(semillaFiada), 600);
  ok('y NO corrió el vencimiento: una deuda con campaña vence cuando vence la cosecha',
    (await crudo('select vence_el::text v from public.deudas where id=$1', [semillaFiada])).v, venceSemilla);
  const gastoPago = await crudo('select categoria, lote_id, cuenta_id, monto::numeric m from public.movimientos where id=$1',
    [pagoParcial.movimiento_id]);
  ok('el gasto que nació lleva la categoría de la deuda', gastoPago.categoria, 'Semilla');
  ok('la campaña de la deuda', gastoPago.lote_id, sur);
  ok('y la cuenta elegida', gastoPago.cuenta_id, banco);
  ok('por lo pagado', num(gastoPago.m), 400);
  ok('la campaña Sur lo cuenta como puesto', num((await unLote(campo.uid, sur)).puesto), 400);
  ok('y lo que falta, a cosecha', num((await unLote(campo.uid, sur)).a_cosecha), 600);

  rechazado('una cuenta de otro negocio no se acepta',
    await llamar(campo.uid, 'select public.registrar_pago_deuda($1,$2,$3,$4,$5,$6,$7)', [semillaFiada, 10, hoy, true, 'transferencia', '', uuid()]),
    'cuenta no existe');
  rechazado('ni una liquidación que no existe',
    await llamar(campo.uid, 'select public.registrar_pago_deuda($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [semillaFiada, 10, hoy, true, 'transferencia', '', null, null, uuid()]),
    'liquidación no existe');

  // Sin campaña, todo sigue como hoy: cada pago corre el vencimiento un mes.
  const tarjeta = (await valor(campo.uid, "select public.crear_deuda($1,'Tarjeta','tarjeta','Visa',900,null,null,null,'2026-10-15') id", [E])).id;
  await valor(campo.uid, 'select public.registrar_pago_deuda($1,$2,$3,$4)', [tarjeta, 300, hoy, false]);
  ok('una deuda sin campaña sigue corriendo el mes',
    (await crudo('select vence_el::text v from public.deudas where id=$1', [tarjeta])).v, '2026-11-15');

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Lo que ve el peón');
  // ═══════════════════════════════════════════════════════════

  const lp = await unLote(uidPeon, norte);
  ok('cuánto se debe a cosecha no le llega', lp.a_cosecha, null);
  ok('ni el costo', lp.costo, null);
  ok('ni por hectárea', lp.costo_ha, null);
  ok('ni cuánto falta cubrir', [lp.falta_cubrir, lp.kg_ha_para_cubrir, lp.kg_para_cubrir], [null, null, null]);
  // Lo puesto sí, como desde la 045: son sumas de montos que ya ve de a uno.
  ok('lo puesto sí, como siempre (lotes.test.js lo exige)', num(lp.puesto), 10600);
  ok('los kilos también, aunque todavía no haya', [num(lp.kg_cosechados), num(lp.kg_vendidos)], [0, 0]);

  const rp = await resumen(uidPeon, norte);
  ok('el detalle no le da las deudas', rp.deudas, null);
  ok('ni la estructura de costos', rp.estructura, null);
  ok('y de los movimientos ve solo los suyos (regla de la 047)',
    rp.movimientos.map((m) => m.descripcion).sort(), ['Fertilizante', 'Gasoil']);
  ok('sin el costo reservado del núcleo', rp.movimientos.some((m) => 'costo_total' in m), false);

  const ra = await resumen(campo.uid, norte);
  ok('el dueño ve los tres', ra.movimientos.length, 3);
  ok('con la moneda original del fertilizante',
    ra.movimientos.filter((m) => m.moneda_original).map((m) => [m.moneda_original, num(m.monto_original)]), [['PYG', 36000000]]);
  ok('la deuda a cosecha en su lista', ra.deudas.map((d) => [d.acreedor, num(d.saldo)]), [['Agrofértil', 4800]]);
  ok('y la estructura por categoría, de mayor a menor',
    ra.estructura.map((e) => [e.categoria, num(e.monto)]), [['Fertilizante', 6000], ['Semilla', 3400], ['Combustible', 1200]]);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Los camiones');
  // ═══════════════════════════════════════════════════════════

  const ticket1 = uuid();
  const cosechar = (uid, lote, kg, opc = {}) => llamar(uid,
    'select public.registrar_cosecha($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id',
    [opc.empresa ?? E, lote, opc.fecha ?? hoy, kg, opc.brutos ?? null, opc.humedad ?? null, opc.destino ?? 'Coop', opc.ticket ?? '', '', opc.id ?? null]);

  const c1 = await cosechar(uidPeon, norte, 28665, { brutos: 30000, humedad: 14.5, ticket: 'R-1', id: ticket1 });
  aceptado('el peón pesa el primer camión', c1);
  ok('con el id que generó el celular', c1.valor.rows[0].id, ticket1);
  const c1bis = await cosechar(uidPeon, norte, 28665, { brutos: 30000, humedad: 14.5, ticket: 'R-1', id: ticket1 });
  ok('el reintento sin señal devuelve el mismo id', c1bis.valor.rows[0].id, ticket1);
  ok('y no duplica', await cuenta('select count(*)::int n from public.cosechas where lote_id=$1', [norte]), 1);

  rechazado('acreditar más kilos que los que pesó la balanza',
    await cosechar(campo.uid, norte, 1000, { brutos: 900 }), 'peso de balanza');
  rechazado('cero kilos', await cosechar(campo.uid, norte, 0), 'más que cero');
  rechazado('una humedad imposible', await cosechar(campo.uid, norte, 100, { humedad: 60 }), 'humedad');
  rechazado('una fecha de la semana que viene', await cosechar(campo.uid, norte, 100, { fecha: await dia(5) }), 'fecha no es válida');
  rechazado('ni de antes de abrir la campaña', await cosechar(campo.uid, norte, 100, { fecha: '2020-01-01' }), 'fecha no es válida');

  const c2 = await cosechar(campo.uid, norte, 1335, { ticket: 'R-2' });
  aceptado('el dueño carga el segundo camión', c2);
  const ticket2 = c2.valor.rows[0].id;

  l = await unLote(campo.uid, norte);
  ok('30.000 kg cosechados', num(l.kg_cosechados), 30000);
  ok('600 kg/ha', num(l.rendimiento), 600);
  ok('todos en el silo sin vender', num(l.kg_sin_vender), 30000);
  ok('lo que sale la tonelada, con la deuda a cosecha adentro', num(l.costo_ton), 513.33);
  ok('el peón ve los kilos y el rendimiento', [num((await unLote(uidPeon, norte)).kg_cosechados), num((await unLote(uidPeon, norte)).rendimiento)], [30000, 600]);

  rechazado('el peón no borra el camión que cargó el dueño',
    await llamar(uidPeon, 'select public.borrar_cosecha($1,$2)', [E, ticket2]), 'quien la cargó o administración');
  const c3 = await cosechar(uidPeon, norte, 100, { ticket: 'error' });
  aceptado('el peón borra el suyo', await llamar(uidPeon, 'select public.borrar_cosecha($1,$2) j', [E, c3.valor.rows[0].id]));
  rechazado('y borrarlo dos veces avisa que no existe',
    await llamar(campo.uid, 'select public.borrar_cosecha($1,$2)', [E, c3.valor.rows[0].id]), 'cosecha no existe');
  ok('los 30.000 siguen', num((await unLote(campo.uid, norte)).kg_cosechados), 30000);

  rechazado('nadie carga una cosecha en el lote de otra empresa',
    await cosechar(campo.uid, loteVecino, 100), 'no es de esta cuenta');
  rechazado('ni con el id de una cosecha ajena',
    await cosechar(vecino.uid, loteVecino, 100, { id: ticket1, empresa: vecino.empresaId }), 'cosecha no existe');

  // Y aunque alguien se saltee la función, la llave compuesta lo frena.
  const comoDueno = async (sql, args) => {
    try { await db.query(sql, args); return { ok: true, error: null }; }
    catch (e) { return { ok: false, error: e.message ?? String(e) }; }
  };
  rechazado('ni la base misma deja colgar una cosecha del lote de otro',
    await comoDueno('insert into public.cosechas (empresa_id, lote_id, fecha, kg_netos) values ($1,$2,$3,100)', [E, loteVecino, hoy]),
    'foreign key|cosechas_lote_fk');
  rechazado('ni una deuda', await comoDueno('update public.deudas set lote_id = $1 where id = $2', [loteVecino, tarjeta]),
    'foreign key|deudas_lote_fk');

  rechazado('un lote con cosechas no se borra',
    await llamar(campo.uid, 'select public.borrar_lote($1,$2)', [E, norte]), 'cosechas, liquidaciones o deudas');

  // ═══════════════════════════════════════════════════════════
  grupo('6 · El papel de la cooperativa (ejemplo del contrato, §5.8)');
  // ═══════════════════════════════════════════════════════════

  const papel = uuid();
  const partes = [{
    lote_id: norte, kg: 30000,
    descuentos: [{ categoria: 'Secado y acopio', monto: 502 }, { categoria: 'Fletes', monto: 360 }, { categoria: 'Retención de IVA', monto: 178 }],
    deudas: [{ deuda_id: agro, monto: 4800 }],
    grano: [{ categoria: 'Arrendamiento', monto: 4980, descripcion: '12.000 kg del dueño a 0,415' }],
  }];
  const liquidar = (uid, grupoId, p, { precio = 415, cuenta = banco, metodo = 'transferencia', fecha = hoy, comprador = 'Coop San Juan' } = {}) =>
    llamar(uid, 'select public.registrar_liquidacion($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) j',
      [E, grupoId, fecha, comprador, precio, JSON.stringify(p), cuenta, metodo, 'Papel 123']);

  rechazado('un peón no liquida', await liquidar(uidPeon, papel, partes), 'Solo administración carga');
  rechazado('ni se liquida fiado', await liquidar(campo.uid, papel, partes, { metodo: 'credito' }), 'forma de cobro');
  rechazado('ni sin campañas', await liquidar(campo.uid, papel, []), 'al menos una campaña');
  rechazado('ni descontando a la deuda más de lo que debe',
    await liquidar(campo.uid, papel, [{ lote_id: norte, kg: 30000, deudas: [{ deuda_id: agro, monto: 4800.01 }] }]), 'más de lo que debe');
  rechazado('ni descontando a la deuda de otro',
    await liquidar(campo.uid, papel, [{ lote_id: norte, kg: 30000, deudas: [{ deuda_id: uuid(), monto: 1 }] }]), 'deuda no existe');
  rechazado('ni un papel que no cuadra',
    await liquidar(campo.uid, papel, [{ lote_id: norte, kg: 1000, descuentos: [{ categoria: 'Fletes', monto: 500 }] }]), 'no cuadra');
  rechazado('ni un descuento sin categoría',
    await liquidar(campo.uid, papel, [{ lote_id: norte, kg: 1000, descuentos: [{ categoria: ' ', monto: 5 }] }]), 'Cada descuento');
  rechazado('ni con una cuenta que no es de acá',
    await liquidar(campo.uid, papel, partes, { cuenta: uuid() }), 'cuenta no existe');
  rechazado('ni con el lote del vecino',
    await liquidar(campo.uid, papel, [{ lote_id: loteVecino, kg: 1000 }]), 'no es de esta cuenta');
  ok('nada de eso dejó rastro', await cuenta('select count(*)::int n from public.liquidaciones where empresa_id=$1', [E]), 0);

  // Lo que el banco tenía antes del papel (el pago parcial de Sur ya salió de ahí).
  const bancoAntes = await saldoCuenta(banco);
  const rl = await liquidar(campo.uid, papel, partes);
  aceptado('el dueño carga el papel: 30.000 kg a 415', rl);
  const liq = rl.valor.rows[0].j;
  ok('bruto 12.450', num(liq.bruto), 12450);
  ok('neto 1.630, lo que dice el papel', num(liq.neto), 1630);
  ok('una parte', liq.liquidaciones.length, 1);
  ok('con su grupo', liq.grupo_id, papel);
  const liqId = liq.liquidaciones[0].id;
  const venta = liq.liquidaciones[0].movimiento_id;

  ok('el banco recibió exactamente el neto', await saldoCuenta(banco) - bancoAntes, 1630);
  ok('la deuda de Agrofértil quedó saldada', await saldoDeuda(agro), 0);

  l = await unLote(campo.uid, norte);
  ok('cobrado: el bruto', num(l.cobrado), 12450);
  ok('puesto: 10.600 + 1.040 de descuentos + 4.800 de la deuda + 4.980 de alquiler', num(l.puesto), 21420);
  ok('a cosecha: nada', num(l.a_cosecha), 0);
  ok('costo', num(l.costo), 21420);
  ok('costo por hectárea', num(l.costo_ha), 428.4);
  ok('resultado', num(l.resultado), -8970);
  ok('resultado por hectárea', num(l.resultado_ha), -179.4);
  ok('y por unidad, que es lo mismo', num(l.por_unidad), -179.4);
  ok('kilos vendidos', num(l.kg_vendidos), 30000);
  ok('nada sin vender', num(l.kg_sin_vender), 0);
  ok('precio promedio 415', num(l.precio_promedio), 415);
  ok('vendido', num(l.vendido), 12450);
  ok('la tonelada salió 714', num(l.costo_ton), 714);
  ok('kilos por hectárea para cubrir', num(l.kg_ha_para_cubrir), 1032.29);
  ok('falta cubrir', num(l.falta_cubrir), 8970);
  ok('en kilos', num(l.kg_para_cubrir), 21614);

  const ventaFila = await crudo(
    'select tipo, categoria, descripcion, monto::numeric m, contraparte, cuenta_id, lote_id, liquidacion_id, metodo_pago from public.movimientos where id=$1', [venta]);
  ok('la venta es por el bruto', [ventaFila.tipo, num(ventaFila.m)], ['venta', 12450]);
  ok('dice qué, cuánto y a quién', ventaFila.descripcion, 'Soja · 30000 kg · Coop San Juan');
  ok('categoría Granos, en el banco, de la campaña, parte del papel',
    [ventaFila.categoria, ventaFila.cuenta_id, ventaFila.lote_id, ventaFila.liquidacion_id], ['Granos', banco, norte, liqId]);
  ok('la venta y los cinco gastos llevan el id de la liquidación',
    await cuenta('select count(*)::int n from public.movimientos where liquidacion_id=$1', [liqId]), 6);
  ok('los gastos: tres descuentos, un pago de deuda y el alquiler',
    (await db.query(`select categoria, monto::numeric m from public.movimientos where liquidacion_id=$1 and tipo='gasto' order by categoria`, [liqId]))
      .rows.map((r) => [r.categoria, num(r.m)]),
    [['Agroquímicos', 4800], ['Arrendamiento', 4980], ['Fletes', 360], ['Retención de IVA', 178], ['Secado y acopio', 502]]);
  ok('el pago de la deuda sabe de qué papel es',
    (await crudo('select liquidacion_id from public.pagos_deuda where deuda_id=$1', [agro])).liquidacion_id, liqId);
  ok('con la nota del silo',
    (await crudo('select nota from public.pagos_deuda where deuda_id=$1', [agro])).nota, 'Descontado en la liquidación de Coop San Juan');

  rechazado('la venta del papel no se mueve de campaña suelta',
    await llamar(campo.uid, 'select public.asignar_a_lote($1,null)', [venta]), 'parte de una liquidación');
  rechazado('y nadie se inventa desde el celular un gasto «parte de un papel»',
    await movimiento(campo.uid, { monto: 10, descripcion: 'Trucho', lote: norte, extras: { liquidacion_id: liqId } }),
    'policy|row-level');

  const rl2 = await liquidar(campo.uid, papel, partes);
  aceptado('mandar el mismo papel de nuevo (reintento sin señal) no falla', rl2);
  ok('devuelve exactamente lo mismo', rl2.valor.rows[0].j, liq);
  ok('y no duplicó nada', [
    await cuenta('select count(*)::int n from public.liquidaciones where grupo_id=$1', [papel]),
    await cuenta('select count(*)::int n from public.movimientos where liquidacion_id=$1', [liqId]),
    await saldoCuenta(banco) - bancoAntes,
  ], [1, 6, 1630]);
  rechazado('el vecino no ve ese papel ni por el id del grupo',
    await llamar(vecino.uid, 'select public.registrar_liquidacion($1,$2,$3,$4,$5,$6::jsonb)',
      [vecino.empresaId, papel, hoy, 'X', 400, JSON.stringify([{ lote_id: loteVecino, kg: 100 }])]), 'liquidación no existe');

  const rr = await resumen(campo.uid, norte);
  ok('el detalle trae la liquidación con sus descuentos',
    rr.liquidaciones.map((q) => [num(q.kg), num(q.bruto), num(q.descuentos), num(q.compensado), num(q.pagado_con_grano), num(q.neto), q.estado]),
    [[30000, 12450, 1040, 4800, 4980, 1630, 'activa']]);
  const rrp = await resumen(uidPeon, norte);
  ok('el peón ve la venta y los kilos, pero no lo que descontó el silo',
    rrp.liquidaciones.map((q) => [num(q.kg), num(q.bruto), q.descuentos, q.compensado, q.pagado_con_grano]),
    [[30000, 12450, null, null, null]]);
  ok('y la venta del papel, porque las ventas son de todos',
    rrp.movimientos.filter((m) => m.tipo === 'venta').map((m) => m.liquidacion_id), [liqId]);

  // Por PostgREST tampoco: el grant es por columnas, como el de `movimientos`
  // desde la 003. La fila sí (la policy es de miembro), esas tres no.
  aceptado('por la tabla el peón lee la fila: kilos, bruto y neto',
    await llamar(uidPeon, 'select id, kg, bruto, neto, estado from public.liquidaciones where empresa_id=$1', [E]));
  for (const col of ['descuentos', 'compensado', 'pagado_con_grano']) {
    rechazado(`pero la columna ${col} no se la dan`,
      await llamar(uidPeon, `select ${col} from public.liquidaciones where empresa_id=$1`, [E]), 'permission denied');
  }
  rechazado('ni al dueño: es cosa de resumen_lote',
    await llamar(campo.uid, 'select descuentos from public.liquidaciones where empresa_id=$1', [E]), 'permission denied');

  // Dos toques sin señal que llegan al mismo tiempo pasan los dos el
  // `exists` de la idempotencia: la base tiene que frenar al segundo. Se
  // prueba como dueño de la base, salteando la función.
  rechazado('la base no deja dos filas de la misma campaña en el mismo papel',
    await db.query(
      `insert into public.liquidaciones (empresa_id, grupo_id, lote_id, fecha, movimiento_id, kg, precio_tonelada, bruto, neto)
       select empresa_id, grupo_id, lote_id, fecha, movimiento_id, kg, precio_tonelada, bruto, bruto from public.liquidaciones where id=$1`,
      [liqId]).then(() => ({ ok: true, error: null }), (e) => ({ ok: false, error: e.message })), 'liquidaciones_grupo_lote_idx');

  // Un papel con dos campañas: la coop liquida por socio.
  const este = (await abrir(campo.uid, E, 'Este', { cultivo: 'Soja', ha: 10 })).valor.rows[0].id;
  const oeste = (await abrir(campo.uid, E, 'Oeste', { cultivo: 'Soja', ha: 10 })).valor.rows[0].id;
  const papel2 = uuid();
  rechazado('la misma campaña no va dos veces en un papel',
    await liquidar(campo.uid, papel2, [{ lote_id: este, kg: 100 }, { lote_id: este, kg: 100 }], { precio: 400 }), 'una sola vez');
  const rl3 = await liquidar(campo.uid, papel2, [
    { lote_id: este, kg: 1000, descuentos: [{ categoria: 'Fletes', monto: 30 }] },
    { lote_id: oeste, kg: 2000, descuentos: [{ categoria: 'Fletes', monto: 60 }] },
  ], { precio: 400 });
  aceptado('un papel con dos campañas', rl3);
  const liq2 = rl3.valor.rows[0].j;
  ok('dos filas, un grupo', [liq2.liquidaciones.length, num(liq2.bruto), num(liq2.neto)], [2, 1200, 1110]);
  ok('cada campaña recibe su bruto y sus descuentos',
    [num((await unLote(campo.uid, este)).cobrado), num((await unLote(campo.uid, este)).puesto),
      num((await unLote(campo.uid, oeste)).cobrado), num((await unLote(campo.uid, oeste)).puesto)],
    [400, 30, 800, 60]);
  ok('y el banco, el neto de las dos', await saldoCuenta(banco) - bancoAntes, 1630 + 1110);

  // Un canje puro: entregué kilos para pagar el alquiler. Neto cero, sin cuenta.
  const canje = await liquidar(campo.uid, uuid(), [
    { lote_id: este, kg: 1000, grano: [{ categoria: 'Arrendamiento', monto: 400, descripcion: 'Alquiler en kilos' }] },
  ], { precio: 400, cuenta: null });
  aceptado('neto cero sin cuenta pasa: es un canje', canje);
  ok('con neto 0', num(canje.valor.rows[0].j.neto), 0);
  ok('la campaña cobró y puso lo mismo', [num((await unLote(campo.uid, este)).cobrado), num((await unLote(campo.uid, este)).puesto)], [800, 430]);
  ok('y el banco no se enteró', await saldoCuenta(banco) - bancoAntes, 2740);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Anular el papel deja todo como estaba');
  // ═══════════════════════════════════════════════════════════

  rechazado('un peón no anula', await llamar(uidPeon, "select public.anular_liquidacion($1,$2,'x')", [E, papel]), 'Solo administración carga');
  rechazado('un papel que no existe', await llamar(campo.uid, 'select public.anular_liquidacion($1,$2)', [E, uuid()]), 'liquidación no existe');

  const an = await llamar(campo.uid, "select public.anular_liquidacion($1,$2,'Vino mal el papel') j", [E, papel]);
  aceptado('el dueño anula el papel de Norte', an);
  ok('anuló una', num(an.valor.rows[0].j.anuladas), 1);
  ok('el banco volvió a lo que tenía antes de ese papel', await saldoCuenta(banco) - bancoAntes, 1110);
  ok('la deuda de Agrofértil vuelve a deberse entera', await saldoDeuda(agro), 4800);
  ok('con su vencimiento', (await crudo('select vence_el::text v from public.deudas where id=$1', [agro])).v, '2027-03-15');
  ok('el pago del silo ya no está', await cuenta('select count(*)::int n from public.pagos_deuda where deuda_id=$1', [agro]), 0);
  l = await unLote(campo.uid, norte);
  ok('kilos vendidos: cero', num(l.kg_vendidos), 0);
  ok('todo sigue en el silo', num(l.kg_sin_vender), 30000);
  ok('puesto: los 10.600 de antes', num(l.puesto), 10600);
  ok('cobrado: nada', num(l.cobrado), 0);
  ok('a cosecha: los 4.800 de nuevo', num(l.a_cosecha), 4800);
  ok('y el precio de referencia vuelve al esperado', num(l.precio_ref), 415);
  ok('nada se borró: la venta y los gastos quedaron anulados con su motivo',
    (await db.query('select estado::text e, motivo_anulacion m from public.movimientos where liquidacion_id=$1', [liqId]))
      .rows.every((r) => r.e === 'anulado' && /papel|deshizo/i.test(r.m ?? '')), true);
  ok('y la liquidación dice quién y cuándo',
    (await crudo('select estado, anulada_por = $2 q, anulada_at is not null t from public.liquidaciones where id=$1', [liqId, campo.uid])),
    { estado: 'anulada', q: true, t: true });

  rechazado('anular dos veces avisa', await llamar(campo.uid, 'select public.anular_liquidacion($1,$2)', [E, papel]), 'ya estaba anulada');

  const an2 = await llamar(campo.uid, 'select public.anular_liquidacion($1,$2) j', [E, papel2]);
  aceptado('el papel de dos campañas se anula entero', an2);
  ok('las dos', num(an2.valor.rows[0].j.anuladas), 2);
  ok('y las dos campañas vuelven a cero',
    [num((await unLote(campo.uid, este)).cobrado), num((await unLote(campo.uid, este)).puesto),
      num((await unLote(campo.uid, oeste)).cobrado), num((await unLote(campo.uid, oeste)).puesto)],
    [400, 400, 0, 0]);
  ok('el banco también', await saldoCuenta(banco) - bancoAntes, 0);

  // Una misma deuda repartida entre dos campañas del papel: lo que se le
  // descuenta en TOTAL no puede pasar el saldo, pero la suma que cierra sí
  // pasa (la parte 2 no se valida contra el saldo ya rebajado por la 1).
  const urea = (await valor(campo.uid,
    'select public.crear_deuda($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) id',
    [E, 'Urea a cosecha', 'proveedor', 'Agrofértil', 4800, null, null, null, '2027-03-15', '', este, 'Fertilizante'])).id;
  const dosPartes = (a, b) => [
    { lote_id: este, kg: 10000, deudas: [{ deuda_id: urea, monto: a }] },
    { lote_id: oeste, kg: 10000, deudas: [{ deuda_id: urea, monto: b }] },
  ];
  rechazado('la misma deuda en dos partes: 3.000 + 1.801 sobre 4.800 no',
    await liquidar(campo.uid, uuid(), dosPartes(3000, 1801), { precio: 400 }), 'más de lo que debe');
  rechazado('ni 3.000 + 3.000 dentro de la misma parte',
    await liquidar(campo.uid, uuid(), [{ lote_id: este, kg: 10000, deudas: [{ deuda_id: urea, monto: 3000 }, { deuda_id: urea, monto: 3000 }] }],
      { precio: 400 }), 'más de lo que debe');
  ok('y nada quedó escrito', await saldoDeuda(urea), 4800);
  const papel3 = uuid();
  aceptado('3.000 + 1.800 sobre 4.800 sí', await liquidar(campo.uid, papel3, dosPartes(3000, 1800), { precio: 400 }));
  ok('la deuda quedó saldada', await saldoDeuda(urea), 0);
  ok('y cada parte guarda lo que compensó',
    (await db.query('select compensado::numeric c from public.liquidaciones where grupo_id=$1 order by compensado desc', [papel3]))
      .rows.map((r) => num(r.c)), [3000, 1800]);
  ok('el banco recibió el neto de las dos: 8.000 − 4.800', await saldoCuenta(banco) - bancoAntes, 3200);
  await valor(campo.uid, 'select public.anular_liquidacion($1,$2)', [E, papel3]);
  ok('anulado, la deuda vuelve entera', [await saldoDeuda(urea), await saldoCuenta(banco) - bancoAntes], [4800, 0]);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Un préstamo no es plata que dio la campaña');
  // ═══════════════════════════════════════════════════════════

  await movimiento(campo.uid, { tipo: 'ingreso', monto: 5000, descripcion: 'Crédito del banco', categoria: 'Préstamo', lote: norte });
  await movimiento(campo.uid, { tipo: 'ingreso', monto: 2000, descripcion: 'Plata del socio', categoria: 'Aporte', lote: norte });
  ok('un préstamo y un aporte colgados de la campaña no suman en cobrado', num((await unLote(campo.uid, norte)).cobrado), 0);
  await movimiento(campo.uid, { tipo: 'ingreso', monto: 100, descripcion: 'Venta de rastrojo', categoria: 'Otros', lote: norte });
  ok('otro ingreso sí', num((await unLote(campo.uid, norte)).cobrado), 100);
  ok('pero todos cuentan como movimientos', num((await unLote(campo.uid, norte)).movimientos), 6);

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Borrar solo lo que no tiene historia');
  // ═══════════════════════════════════════════════════════════

  rechazado('Sur tiene una deuda a cosecha',
    await llamar(campo.uid, 'select public.borrar_lote($1,$2)', [E, sur]), 'cosechas, liquidaciones o deudas');
  rechazado('Este tiene liquidaciones, aunque estén anuladas',
    await llamar(campo.uid, 'select public.borrar_lote($1,$2)', [E, este]), 'cosechas, liquidaciones o deudas');
  const vacio = (await abrir(campo.uid, E, 'Abierto por error', { ha: 1 })).valor.rows[0].id;
  aceptado('uno vacío sí', await llamar(campo.uid, 'select public.borrar_lote($1,$2)', [E, vacio]));

  // Las fórmulas son internas: las llaman listar_lotes y resumen_lote, que
  // ya miraron el rol. Desde el navegador no se pueden pedir con `p_admin`
  // en true.
  ok('numeros_de_lote no se puede llamar desde el navegador',
    (await crudo("select has_function_privilege('authenticated', 'public.numeros_de_lote(uuid, boolean)', 'EXECUTE') p")).p, false);
  rechazado('ni pidiéndola a mano', await llamar(uidPeon, 'select public.numeros_de_lote($1, true)', [norte]), 'permission denied');

  console.log('\n══════════════════════════════════════════════════════════════');
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE CAMPAÑAS FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE CAMPAÑAS PASARON`);
  process.exit(0);
})().catch((e) => { console.error('error inesperado:', e); process.exit(2); });
