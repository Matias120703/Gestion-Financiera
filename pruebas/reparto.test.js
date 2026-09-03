/**
 * Pruebas del módulo de reparto (migraciones 033, 034 y 035).
 *
 * Lo que se comprueba acá no es que las tablas existan: es que la plata
 * cierre. En una peluquería con comisiones hay tres formas clásicas de
 * mentir sin darse cuenta, y las tres tienen su prueba:
 *
 *   · contar dos veces —la venta de 30.000 más un ingreso de 15.000 para el
 *     local— y mostrar 45.000 de facturación por un corte de 30.000;
 *   · contar como facturación del local los cortes de quien alquila la silla,
 *     que nunca fueron suyos;
 *   · redondear las dos partes por separado, y hacer aparecer o desaparecer
 *     un guaraní que nadie cobró.
 */
const H = require('./ayuda-db.js');

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

function aceptado(nombre, resultado) {
  corridas++;
  if (!resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      fue rechazada: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre}`);
}

const num = (v) => Number(v);

(async () => {
  const db = await H.crearBase();

  // Una barbería: el dueño corta, y tiene tres arreglos distintos con su gente.
  const local = await H.montarEmpresa(db, { email: 'dueno@barberia.com', nombre: 'Barbería Aurora' });
  const uidPedro = await H.sumarMiembro(db, local.empresaId, 'pedro@barberia.com', 'vendedor');
  const uidLuis = await H.sumarMiembro(db, local.empresaId, 'luis@barberia.com', 'vendedor');

  const llamar = (uid, sql, args) => H.intentar(db, uid, () => db.query(sql, args));
  // Inspección desde afuera: `movimientos` no da select directo a nadie —se
  // lee por funciones— así que mirarla desde la prueba es cosa del
  // superusuario. Lo que se comprueba con esto es el CONTENIDO, no el permiso;
  // los permisos tienen sus propias comprobaciones más abajo.
  const crudo = async (sql, args) => (await db.query(sql, args)).rows[0];
  const valor = async (uid, sql, args) => {
    const r = await llamar(uid, sql, args);
    if (!r.ok) throw new Error(r.error);
    return r.valor.rows[0];
  };

  // Los servicios son productos que no controlan stock: un corte no se
  // descuenta de ningún inventario.
  const corte = await H.crearProducto(db, local.empresaId, local.uid,
    { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
  const cera = await H.crearProducto(db, local.empresaId, local.uid,
    { nombre: 'Cera para el pelo', costo: 20000, precio: 35000, stock: 10, controla_stock: true });

  // ═══════════════════════════════════════════════════════════
  grupo('1 · El equipo lo arma el dueño, y solo él');
  // ═══════════════════════════════════════════════════════════

  rechazado('un vendedor no suma gente al equipo',
    await llamar(uidPedro, 'select public.guardar_profesional($1,$2)', [local.empresaId, 'Yo mismo']),
    'dueño de la cuenta');

  rechazado('ni una comisión sin porcentaje, que nadie podría calcular',
    await llamar(local.uid, "select public.guardar_profesional($1,$2,'comision',null)",
      [local.empresaId, 'Sin porcentaje']),
    'porcentaje');

  rechazado('ni un porcentaje imposible',
    await llamar(local.uid, "select public.guardar_profesional($1,$2,'comision',140)",
      [local.empresaId, 'Ambicioso']),
    'porcentaje');

  rechazado('ni un arreglo inventado',
    await llamar(local.uid, "select public.guardar_profesional($1,$2,'trueque')",
      [local.empresaId, 'Raro']),
    'arreglo');

  const dueno = (await valor(local.uid,
    "select public.guardar_profesional($1,$2,'local',null,$3) as id",
    [local.empresaId, 'Matías (dueño)', local.uid])).id;

  const pedro = (await valor(local.uid,
    "select public.guardar_profesional($1,$2,'comision',50,$3) as id",
    [local.empresaId, 'Pedro', uidPedro])).id;

  const luis = (await valor(local.uid,
    "select public.guardar_profesional($1,$2,'alquiler',null,$3) as id",
    [local.empresaId, 'Luis', uidLuis])).id;

  const ana = (await valor(local.uid,
    "select public.guardar_profesional($1,$2,'sueldo') as id",
    [local.empresaId, 'Ana (sin cuenta)'])).id;

  ok('quedaron cuatro en el equipo',
    num((await valor(local.uid,
      'select count(*)::int n from public.turnos_profesional where empresa_id=$1', [local.empresaId])).n), 4);

  ok('el porcentaje solo se guarda donde significa algo',
    (await valor(local.uid,
      'select porcentaje from public.turnos_profesional where id=$1', [luis])).porcentaje, null);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · El precio es de cada uno; el porcentaje, del dueño');
  // ═══════════════════════════════════════════════════════════

  aceptado('el barbero pone el precio de sus propios cortes',
    await llamar(uidPedro, 'select public.guardar_precio_profesional($1,$2,$3,$4)',
      [local.empresaId, pedro, corte, 30000]));

  rechazado('pero no el de un compañero',
    await llamar(uidPedro, 'select public.guardar_precio_profesional($1,$2,$3,$4)',
      [local.empresaId, luis, corte, 10000]),
    'tus propios servicios');

  rechazado('y el porcentaje no lo toca nadie más que el dueño',
    await llamar(uidPedro, "select public.guardar_profesional($1,$2,'comision',100,$3,$4)",
      [local.empresaId, 'Pedro', uidPedro, pedro]),
    'dueño de la cuenta');

  ok('sin precio propio vale el del catálogo',
    num((await valor(local.uid, 'select public.precio_de_servicio($1,$2) p', [dueno, corte])).p), 50000);

  ok('con precio propio vale el suyo',
    num((await valor(local.uid, 'select public.precio_de_servicio($1,$2) p', [pedro, corte])).p), 30000);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Un corte de 30.000 al 50%');
  // ═══════════════════════════════════════════════════════════

  const r1 = await valor(uidPedro,
    "select public.registrar_servicio($1,$2,$3,null,null,'efectivo','Juan') j",
    [local.empresaId, pedro, corte]);

  ok('se cobraron 30.000', num(r1.j.monto), 30000);
  ok('15.000 son de Pedro', num(r1.j.parte_profesional), 15000);
  ok('y 15.000 del local', num(r1.j.parte_local), 15000);

  const venta = await crudo(
    'select monto, costo_total, tipo from public.movimientos where id=$1', [r1.j.movimiento]);

  ok('la venta es de 30.000, no de 45.000', num(venta.monto), 30000);
  ok('y el costo de esa venta es la parte de Pedro', num(venta.costo_total), 15000);

  // Esta es la que atrapa el error de contar dos veces.
  ok('un solo movimiento por corte, nunca dos',
    num((await crudo(
      "select count(*)::int n from public.movimientos where empresa_id=$1 and estado='activo'",
      [local.empresaId])).n), 1);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Cada arreglo reparte distinto');
  // ═══════════════════════════════════════════════════════════

  const rDueno = await valor(local.uid,
    'select public.registrar_servicio($1,$2,$3) j', [local.empresaId, dueno, corte]);
  ok('el corte del dueño es 100% del local', num(rDueno.j.parte_local), 50000);
  ok('y nada para el profesional', num(rDueno.j.parte_profesional), 0);

  const rAna = await valor(local.uid,
    'select public.registrar_servicio($1,$2,$3) j', [local.empresaId, ana, corte]);
  ok('a sueldo también queda todo en el local', num(rAna.j.parte_local), 50000);

  const rLuis = await valor(uidLuis,
    'select public.registrar_servicio($1,$2,$3) j', [local.empresaId, luis, corte]);
  ok('con alquiler de silla, todo es del barbero', num(rLuis.j.parte_profesional), 50000);
  ok('y nada del local', num(rLuis.j.parte_local), 0);

  // La más importante del módulo: esa plata nunca fue del local, así que no
  // puede figurar como facturación suya.
  ok('el corte alquilado NO genera ninguna venta', rLuis.j.movimiento, null);
  ok('pero sí queda registrado quién lo hizo',
    num((await valor(local.uid,
      'select count(*)::int n from public.turnos_atribucion where profesional_id=$1', [luis])).n), 1);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Nadie carga cortes ajenos');
  // ═══════════════════════════════════════════════════════════

  rechazado('un barbero no le anota un corte a otro',
    await llamar(uidPedro, 'select public.registrar_servicio($1,$2,$3)', [local.empresaId, luis, corte]),
    'tus propios servicios');

  aceptado('el dueño sí puede, porque hay gente sin cuenta',
    await llamar(local.uid, 'select public.registrar_servicio($1,$2,$3)', [local.empresaId, ana, corte]));

  rechazado('un producto con stock no se cobra como servicio',
    await llamar(local.uid, 'select public.registrar_servicio($1,$2,$3)', [local.empresaId, dueno, cera]),
    'stock');

  // ═══════════════════════════════════════════════════════════
  grupo('6 · El barbero no ve el margen del local');
  // ═══════════════════════════════════════════════════════════

  ok('un vendedor no lee la tabla de atribuciones',
    num((await valor(uidPedro,
      'select count(*)::int n from public.turnos_atribucion', [])).n), 0);

  const mio = (await valor(uidPedro, 'select public.mis_servicios($1,$2,$3) j',
    [local.empresaId, '2000-01-01', '2100-01-01'])).j;

  ok('pero sí ve lo suyo', mio.es_profesional, true);
  ok('con su parte', num(mio.le_toca), 15000);
  ok('y sus cortes no traen la parte del local',
    Object.keys(mio.cortes[0]).includes('parte_local'), false);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · El desglose cierra con el total');
  // ═══════════════════════════════════════════════════════════

  // Una venta de mercadería, que es el tercer renglón.
  await llamar(local.uid,
    'select public.registrar_venta($1,$2::jsonb)',
    [local.empresaId, JSON.stringify([{ producto_id: cera, cantidad: 2, precio_unitario: 35000 }])]);

  // Y el alquiler que cobra el local, que es el cuarto.
  await db.query(
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, creado_por)
     values ($1,'ingreso',public.hoy_empresa($1),'Alquiler de silla de Luis','Alquileres',400000,400000,$2)`,
    [local.empresaId, local.uid]);

  const desglose = (await valor(local.uid, 'select public.resumen_reparto($1,$2,$3) j',
    [local.empresaId, '2000-01-01', '2100-01-01'])).j;

  const bruta = num((await crudo(
    `select coalesce(sum(monto - costo_total),0) b from public.movimientos
      where empresa_id=$1 and tipo='venta' and estado='activo'`, [local.empresaId])).b);

  ok('mis cortes: los 50.000 del dueño', num(desglose.mis_cortes), 50000);
  ok('de mi equipo: 15.000 de Pedro + 50.000 de Ana x2', num(desglose.de_mi_equipo), 115000);
  ok('mercadería: 2 ceras con su costo', num(desglose.mercaderia), 30000);
  ok('otros ingresos: el alquiler de la silla', num(desglose.otros_ingresos), 400000);

  // LA PRUEBA QUE IMPORTA: si el desglose no cierra con la ganancia bruta que
  // ya calcula el panel, hay que elegir a cuál de los dos creerle.
  ok('los tres primeros renglones SON la ganancia bruta',
    num(desglose.mis_cortes) + num(desglose.de_mi_equipo) + num(desglose.mercaderia), bruta);
  ok('y el resumen lo dice igual', num(desglose.ganancia_bruta), bruta);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · El redondeo no pierde un guaraní');
  // ═══════════════════════════════════════════════════════════

  // 33.333 al 40% da 13.333,2. En guaraníes no hay centavos.
  const raro = (await valor(local.uid,
    "select public.guardar_profesional($1,$2,'comision',40) as id", [local.empresaId, 'Impar'])).id;

  const rRaro = await valor(local.uid,
    'select public.registrar_servicio($1,$2,$3,33333) j', [local.empresaId, raro, corte]);

  ok('la parte del profesional queda redondeada', num(rRaro.j.parte_profesional), 13333);
  ok('y el resto es del local, sin inventar nada',
    num(rRaro.j.parte_profesional) + num(rRaro.j.parte_local), 33333);

  // ═══════════════════════════════════════════════════════════
  grupo('9 · La liquidación del viernes');
  // ═══════════════════════════════════════════════════════════

  aceptado('el dueño le paga a Pedro lo que le debe',
    await llamar(local.uid, 'select public.pagar_profesional($1,$2,$3)', [local.empresaId, pedro, 10000]));

  rechazado('un barbero no se paga solo',
    await llamar(uidPedro, 'select public.pagar_profesional($1,$2,$3)', [local.empresaId, pedro, 999999]),
    'dueño de la cuenta');

  const liq = (await valor(local.uid, 'select public.liquidacion($1,$2,$3) j',
    [local.empresaId, '2000-01-01', '2100-01-01'])).j;
  const dePedro = liq.find((x) => x.nombre === 'Pedro');

  ok('Pedro hizo un corte', num(dePedro.cortes), 1);
  ok('le corresponden 15.000', num(dePedro.le_toca), 15000);
  ok('ya cobró 10.000', num(dePedro.pagado), 10000);
  ok('le quedan debiendo 5.000', num(dePedro.le_debe), 5000);

  // El pago es un gasto de verdad, no contabilidad paralela.
  ok('el pago figura como gasto en el negocio',
    num((await crudo(
      `select count(*)::int n from public.movimientos
        where empresa_id=$1 and tipo='gasto' and descripcion like 'Pago a Pedro%'`,
      [local.empresaId])).n), 1);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Un corte anulado no se le paga a nadie');
  // ═══════════════════════════════════════════════════════════

  await llamar(local.uid, 'select public.anular_movimiento($1,$2)', [r1.j.movimiento, 'El cliente se arrepintió']);

  const liq2 = (await valor(local.uid, 'select public.liquidacion($1,$2,$3) j',
    [local.empresaId, '2000-01-01', '2100-01-01'])).j;
  const pedro2 = liq2.find((x) => x.nombre === 'Pedro');

  ok('el corte anulado sale de la liquidación', num(pedro2.cortes), 0);
  ok('y ya no le corresponde nada', num(pedro2.le_toca), 0);
  ok('pero lo que ya cobró sigue estando', num(pedro2.pagado), 10000);

  const desglose2 = (await valor(local.uid, 'select public.resumen_reparto($1,$2,$3) j',
    [local.empresaId, '2000-01-01', '2100-01-01'])).j;
  // Quedan los dos cortes de Ana (50.000 cada uno) y el de «Impar» del grupo
  // anterior, que le dejó 20.000 al local. Los 15.000 de Pedro ya no están.
  ok('y el desglose deja de contarlo',
    num(desglose2.de_mi_equipo), 120000);

  const bruta2 = num((await crudo(
    `select coalesce(sum(monto - costo_total),0) b from public.movimientos
      where empresa_id=$1 and tipo='venta' and estado='activo'`, [local.empresaId])).b);
  ok('el desglose sigue cerrando con la ganancia bruta',
    num(desglose2.mis_cortes) + num(desglose2.de_mi_equipo) + num(desglose2.mercaderia), bruta2);

  // ═══════════════════════════════════════════════════════════
  grupo('11 · Aislamiento entre negocios');
  // ═══════════════════════════════════════════════════════════

  const otra = await H.montarEmpresa(db, { email: 'otro@barberia.com', nombre: 'Otra Barbería' });

  rechazado('un extraño no ve la liquidación ajena',
    await llamar(otra.uid, 'select public.liquidacion($1,$2,$3)',
      [local.empresaId, '2000-01-01', '2100-01-01']),
    'acceso');

  rechazado('ni el desglose',
    await llamar(otra.uid, 'select public.resumen_reparto($1,$2,$3)',
      [local.empresaId, '2000-01-01', '2100-01-01']),
    'acceso');

  ok('ni lee un solo profesional del otro negocio',
    num((await valor(otra.uid,
      'select count(*)::int n from public.turnos_profesional where empresa_id=$1',
      [local.empresaId])).n), 0);

  rechazado('ni le carga un corte',
    await llamar(otra.uid, 'select public.registrar_servicio($1,$2,$3)', [local.empresaId, pedro, corte]),
    'No pertenecés');

  console.log('\n══════════════════════════════════════════════════════════════');
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL REPARTO FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DEL REPARTO PASARON`);
  process.exit(0);
})().catch((e) => { console.error('error inesperado:', e); process.exit(2); });
