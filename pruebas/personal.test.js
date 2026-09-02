/**
 * Pruebas de la migración 024: la cuenta personal.
 *
 * Dos de estos casos son errores que estaban vivos en producción:
 *
 *   · la cuenta personal veía «Cierre del día», porque esa pantalla se
 *     oculta por rubro y a toda cuenta personal se le guarda rubro
 *     'comercio';
 *   · y recibía las categorías de un almacén —Mercadería, Publicidad,
 *     Sueldos— para clasificar el gasto de una persona.
 *
 * El resto prueba lo que se agregó: ingresos que se repiten, el plan de
 * gastos, y el ciclo que va de cobro a cobro en vez de día a día.
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

/** Crea una cuenta personal, que es lo que `montarEmpresa` no sabe hacer. */
async function montarPersonal(db, email, nombre) {
  const uid = await H.crearUsuario(db, email);
  let empresaId;
  await H.comoUsuario(db, uid, async () => {
    const r = await db.query(
      'select public.crear_empresa($1,$2,$3,$4,$5) as id',
      [nombre, 'USD', 'Dueño', 'America/Asuncion', 'personal']);
    empresaId = r.rows[0].id;
  });
  return { uid, empresaId };
}

const resumen = (db, uid, empresa) => H.intentar(db, uid,
  () => db.query('select public.resumen_personal($1) j', [empresa]))
  .then((r) => (r.ok ? r.valor.rows[0].j : Promise.reject(new Error(r.error))));

(async () => {
  const db = await H.crearBase();

  const yo = await montarPersonal(db, 'sueldo@correo.com', 'Mis finanzas');
  const negocio = await H.montarEmpresa(db, { email: 'duenio@tienda.com', nombre: 'Perfumería' });

  const zona = 'America/Asuncion';
  const hoy = (await db.query(
    `select (now() at time zone '${zona}')::date d`)).rows[0].d;
  const diaDeHoy = new Date(hoy).getUTCDate();

  // ═══════════════════════════════════════════════════════════
  grupo('1 · La cuenta personal ya no es un comercio disfrazado');

  const cierra = async (empresa) => (await db.query(
    'select public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta) c from public.empresas e where e.id=$1',
    [empresa])).rows[0].c;

  ok('una cuenta personal NO cierra el día', await cierra(yo.empresaId), false);
  ok('un comercio sí', await cierra(negocio.empresaId), true);

  const cats = async (rubro, tipo) => (await db.query(
    'select public.categorias_de_rubro($1,$2) c', [rubro, tipo])).rows[0].c.map((x) => x.nombre);

  const personales = await cats('comercio', 'personal');
  ok('la cuenta personal tiene sus propias categorías',
    personales.includes('Cuidado personal') && personales.includes('Salud'), true);
  ok('y ya no ve las de un almacén',
    personales.some((c) => ['Mercadería', 'Publicidad', 'Sueldos'].includes(c)), false);
  ok('el comercio conserva las suyas',
    (await cats('comercio', 'emprendedor')).includes('Mercadería'), true);
  ok('y la ganadería las suyas',
    (await cats('ganaderia', 'emprendedor')).includes('Sanidad'), true);

  // El recordatorio de la noche (031).
  //
  // Hasta la 031 una cuenta personal quedaba afuera, y el motivo era una
  // conclusión de más: que no cierre el día no quiere decir que no necesite
  // que le recuerden cargar. Es al revés — el gasto de una persona es el que
  // más fácil se olvida, y una cuenta sin datos no sirve.
  //
  // Lo que NO cambió es la pantalla: la cuenta personal sigue sin cerrar el
  // día. Son dos preguntas distintas y se comprueban por separado, porque
  // resolverlas con la misma función haría aparecer «Cierre del día» en el
  // menú de todas las cuentas personales.
  await db.query(
    "insert into public.movimientos (empresa_id, tipo, fecha, monto, subtotal, categoria) values ($1,'gasto',(now() at time zone 'America/Asuncion')::date - 1, 100, 100, 'Comida')",
    [yo.empresaId]);
  await db.query(
    "insert into public.movimientos (empresa_id, tipo, fecha, monto, subtotal, categoria) values ($1,'gasto',(now() at time zone 'America/Asuncion')::date - 2, 100, 100, 'Comida')",
    [yo.empresaId]);

  const avisados = (await H.comoServicio(db,
    () => db.query('select public.empresas_sin_cargar_hoy(2) j'))).rows[0].j;
  const miAviso = avisados.find((e) => e.empresa_id === yo.empresaId);

  ok('con dos días de racha y nada hoy, a la persona sí se le avisa',
    Boolean(miAviso), true);
  ok('y el aviso dice que es una cuenta personal',
    miAviso && miAviso.tipo_cuenta, 'personal');
  ok('con la racha que está por perder', miAviso && miAviso.racha, 2);
  ok('pero la pantalla de cierre sigue sin existir para ella',
    await cierra(yo.empresaId), false);

  // Un día de racha no alcanza: a quien todavía no tiene el hábito, un aviso
  // no se lo crea. Lo único que logra es enseñarle a ignorarnos.
  const soloUno = (await H.comoServicio(db,
    () => db.query('select public.empresas_sin_cargar_hoy(3) j'))).rows[0].j;
  ok('con la exigencia en tres, esa racha de dos ya no alcanza',
    soloUno.some((e) => e.empresa_id === yo.empresaId), false);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Ingresos que se repiten');

  let sueldoId;
  aceptado('se guarda el sueldo',
    await H.intentar(db, yo.uid, async () => {
      const r = await db.query(
        'select public.guardar_ingreso_fijo($1,$2,$3,$4,$5) as id',
        [yo.empresaId, 'Sueldo', 1000, 30, true]);
      sueldoId = r.rows[0].id;
      return r;
    }));

  aceptado('y una segunda entrada',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_ingreso_fijo($1,$2,$3,$4,$5)',
      [yo.empresaId, 'Alquiler de la pieza', 150, 5, false])));

  ok('quedan las dos',
    (await db.query('select count(*)::int n from public.ingresos_fijos where empresa_id=$1',
      [yo.empresaId])).rows[0].n, 2);

  // Un solo principal: si hubiera dos, el ciclo dependería del orden de lectura.
  aceptado('marcar otro como principal destrona al anterior',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_ingreso_fijo($1,$2,$3,$4,$5)',
      [yo.empresaId, 'Changas', 200, 12, true])));

  ok('hay exactamente un principal',
    (await db.query(
      'select count(*)::int n from public.ingresos_fijos where empresa_id=$1 and principal',
      [yo.empresaId])).rows[0].n, 1);

  rechazado('no se acepta monto cero',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_ingreso_fijo($1,$2,$3)', [yo.empresaId, 'Nada', 0])),
    'mayor que cero');

  rechazado('ni sin nombre',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_ingreso_fijo($1,$2,$3)', [yo.empresaId, '   ', 500])),
    'nombre');

  // Cuánto cobra alguien es del mismo orden que sus deudas: un vendedor no lo ve.
  const vendedor = await H.sumarMiembro(db, negocio.empresaId, 'vendedor@tienda.com', 'vendedor');
  await H.intentar(db, negocio.uid, () => db.query(
    'select public.guardar_ingreso_fijo($1,$2,$3)', [negocio.empresaId, 'Sueldo del dueño', 900]));

  ok('un vendedor no ve los ingresos fijos de la empresa',
    (await H.intentar(db, vendedor,
      () => db.query('select count(*)::int n from public.ingresos_fijos'))).valor.rows[0].n, 0);

  rechazado('ni los puede escribir',
    await H.intentar(db, vendedor, () => db.query(
      'select public.guardar_ingreso_fijo($1,$2,$3)', [negocio.empresaId, 'Mi aumento', 5000])),
    'dueño de la cuenta');

  rechazado('y un extraño tampoco',
    await H.intentar(db, negocio.uid, () => db.query(
      'select public.guardar_ingreso_fijo($1,$2,$3)', [yo.empresaId, 'Intruso', 100])),
    'dueño de la cuenta');

  // ═══════════════════════════════════════════════════════════
  grupo('3 · El ciclo va de cobro a cobro');

  const ciclo = async (empresa) => (await db.query(
    'select desde, hasta, dia_cobro from public.ciclo_personal($1)', [empresa])).rows[0];

  // Se deja un solo ingreso fijo, el sueldo del 30, para que el ciclo sea
  // predecible en la prueba.
  await db.query("delete from public.ingresos_fijos where empresa_id=$1 and nombre <> 'Sueldo'",
    [yo.empresaId]);
  await db.query('update public.ingresos_fijos set principal = true where id = $1', [sueldoId]);

  const c = await ciclo(yo.empresaId);
  ok('el ciclo arranca el día de cobro', new Date(c.desde).getUTCDate(), 30);
  ok('y termina el día antes del próximo', new Date(c.hasta).getUTCDate(), 29);
  ok('hoy cae adentro del ciclo',
    new Date(c.desde) <= new Date(hoy) && new Date(hoy) <= new Date(c.hasta), true);

  // Febrero no tiene 30: quien cobra el 30 cobra el último día que existe.
  ok('el día 31 se recorta en un mes corto',
    (await db.query("select public.fecha_de_cobro(date '2026-02-10', 31) f")).rows[0].f
      .toISOString().slice(0, 10),
    '2026-02-28');

  // Sin ningún ingreso fijo, el ciclo es el mes corrido.
  const sinNada = await montarPersonal(db, 'sinsueldo@correo.com', 'Sin sueldo');
  ok('sin ingresos fijos, el ciclo arranca el 1',
    (await ciclo(sinNada.empresaId)).dia_cobro, 1);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Cuánto te queda, y para cuántos días');

  // Todo dentro del ciclo vigente: se usa el día de hoy.
  const cargar = (tipo, monto, categoria) => db.query(
    `insert into public.movimientos (empresa_id, tipo, fecha, monto, subtotal, categoria)
     values ($1,$2,(now() at time zone 'America/Asuncion')::date,$3,$3,$4)`,
    [yo.empresaId, tipo, monto, categoria]);

  await db.query('delete from public.movimientos where empresa_id=$1', [yo.empresaId]);
  await cargar('ingreso', 1000, 'General');   // entró el sueldo
  await cargar('gasto', 120, 'Comida');
  await cargar('gasto', 50, 'Cuidado personal');
  await cargar('gasto', 30, 'Ocio');

  let r = await resumen(db, yo.uid, yo.empresaId);
  ok('entró el sueldo', Number(r.entro), 1000);
  ok('salieron los gastos', Number(r.salio), 200);
  ok('queda la diferencia', Number(r.disponible), 800);
  ok('y ya no pregunta si cobraste', r.cobro_pendiente, false);

  // Una deuda que vence dentro del ciclo se descuenta ANTES de que la
  // persona reparta: es lo que se olvida y rompe el plan.
  await db.query(
    `insert into public.deudas (empresa_id, nombre, monto_original, saldo, monto_cuota, vence_el)
     values ($1,'Tarjeta',2000,2000,200,(now() at time zone 'America/Asuncion')::date + 1)`,
    [yo.empresaId]);

  r = await resumen(db, yo.uid, yo.empresaId);
  ok('la cuota por vencer se descuenta sola', Number(r.cuotas_por_vencer), 200);
  ok('y baja lo disponible', Number(r.disponible), 600);
  ok('el reparto por día sale de ahí',
    Number(r.por_dia), Number((600 / r.dias_restantes).toFixed(2)));

  // Una cuota que vence DESPUÉS del ciclo no es problema de este mes.
  await db.query(
    `update public.deudas set vence_el = (now() at time zone 'America/Asuncion')::date + 90
     where empresa_id = $1`, [yo.empresaId]);
  r = await resumen(db, yo.uid, yo.empresaId);
  ok('una cuota lejana no descuenta nada hoy', Number(r.cuotas_por_vencer), 0);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · El plan contra la realidad');

  aceptado('se pone número a una categoría',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_presupuesto($1,$2,$3)', [yo.empresaId, 'Cuidado personal', 70])));

  await H.intentar(db, yo.uid, () => db.query(
    'select public.guardar_presupuesto($1,$2,$3)', [yo.empresaId, 'Comida', 300]));

  r = await resumen(db, yo.uid, yo.empresaId);
  const cuidado = r.plan.find((p) => p.categoria === 'Cuidado personal');
  ok('el plan sabe lo planeado', Number(cuidado.planeado), 70);
  ok('y lo que ya se gastó', Number(cuidado.gastado), 50);
  ok('y cuánto queda', Number(cuidado.resta), 20);

  const comida = r.plan.find((p) => p.categoria === 'Comida');
  ok('la comida va bien', Number(comida.resta), 180);

  // Lo gastado fuera del plan tiene que verse, o el plan miente por omisión.
  ok('lo de Ocio queda contado aparte', Number(r.gastado_sin_planear), 30);

  // Pasarse tiene que verse en negativo, no recortarse en cero: 15 de más
  // son 15 que la persona tiene que sacar de otro lado.
  await cargar('gasto', 35, 'Cuidado personal');
  r = await resumen(db, yo.uid, yo.empresaId);
  ok('pasarse se muestra en negativo',
    Number(r.plan.find((p) => p.categoria === 'Cuidado personal').resta), -15);

  aceptado('poner cero saca la categoría del plan',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_presupuesto($1,$2,$3)', [yo.empresaId, 'Comida', 0])));

  r = await resumen(db, yo.uid, yo.empresaId);
  ok('y deja de figurar', r.plan.some((p) => p.categoria === 'Comida'), false);
  ok('pero lo gastado no se pierde: pasa a lo no planeado',
    Number(r.gastado_sin_planear), 150);

  rechazado('un vendedor no lee el presupuesto ajeno',
    await H.intentar(db, vendedor, () => db.query(
      'select public.guardar_presupuesto($1,$2,$3)', [negocio.empresaId, 'Comida', 100])),
    'dueño de la cuenta');

  rechazado('ni pide el resumen de otro',
    await H.intentar(db, negocio.uid, () => db.query(
      'select public.resumen_personal($1)', [yo.empresaId])),
    'No tenés acceso');

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Lo que se paga todos los meses');

  // Se limpia el plan para que los números de este grupo sean solo de fijos.
  await db.query('delete from public.presupuesto where empresa_id=$1', [yo.empresaId]);
  await db.query('delete from public.movimientos where empresa_id=$1', [yo.empresaId]);
  await db.query('delete from public.deudas where empresa_id=$1', [yo.empresaId]);
  await cargar('ingreso', 1000, 'Sueldo');

  aceptado('se guarda el wifi',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_gasto_fijo($1,$2,$3,$4,$5,$6)',
      [yo.empresaId, 'Wifi de casa', 120, 'Servicios', 10, 'Plan de 30 megas, Tigo'])));

  aceptado('y la línea del celular, misma categoría',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_gasto_fijo($1,$2,$3,$4,$5)',
      [yo.empresaId, 'Línea del celular', 80, 'Servicios', 5])));

  // El pasaje del bus se gasta todos los días: obligar a inventar un día
  // haría que el dato sea mentira.
  aceptado('el bus se guarda sin día',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_gasto_fijo($1,$2,$3,$4)',
      [yo.empresaId, 'Bus', 150, 'Transporte'])));

  r = await resumen(db, yo.uid, yo.empresaId);
  ok('el mes fijo suma los tres', Number(r.fijo_mensual), 350);
  ok('y todavía falta pagarlos todos', Number(r.fijos_por_pagar), 350);
  ok('lo disponible ya los descuenta', Number(r.disponible), 650);
  ok('la nota queda guardada',
    r.gastos_fijos.find((g) => g.nombre === 'Wifi de casa').notas,
    'Plan de 30 megas, Tigo');

  // Pagar de verdad NO puede descontar dos veces.
  await cargar('gasto', 120, 'Servicios');
  r = await resumen(db, yo.uid, yo.empresaId);
  ok('pagar el wifi baja lo que falta', Number(r.fijos_por_pagar), 230);
  ok('y lo disponible no se mueve por eso', Number(r.disponible), 650);

  // Dos fijos en la misma categoría se comparan JUNTOS contra lo gastado
  // en esa categoría: si pagás los dos, no queda nada pendiente ahí.
  await cargar('gasto', 80, 'Servicios');
  r = await resumen(db, yo.uid, yo.empresaId);
  ok('pagando los dos de Servicios no queda nada de esa categoría',
    Number(r.fijos_por_pagar), 150);

  // Gastar de más en una categoría no genera crédito para las otras.
  await cargar('gasto', 500, 'Servicios');
  r = await resumen(db, yo.uid, yo.empresaId);
  ok('pasarse en una categoría no descuenta de otra',
    Number(r.fijos_por_pagar), 150);

  aceptado('se puede borrar un gasto fijo',
    await H.intentar(db, yo.uid, async () => {
      const id = (await db.query(
        "select id from public.gastos_fijos where empresa_id=$1 and nombre='Bus'",
        [yo.empresaId])).rows[0].id;
      return db.query('select public.borrar_gasto_fijo($1,$2)', [yo.empresaId, id]);
    }));

  r = await resumen(db, yo.uid, yo.empresaId);
  ok('y deja de descontar', Number(r.fijos_por_pagar), 0);

  rechazado('un vendedor no carga gastos fijos ajenos',
    await H.intentar(db, vendedor, () => db.query(
      'select public.guardar_gasto_fijo($1,$2,$3)', [negocio.empresaId, 'Mi nafta', 999])),
    'dueño de la cuenta');

  ok('ni los ve',
    (await H.intentar(db, vendedor,
      () => db.query('select count(*)::int n from public.gastos_fijos'))).valor.rows[0].n, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Lo que se repite, para la captura');

  const paraIA = (await H.intentar(db, yo.uid,
    () => db.query('select public.fijos_para_captura($1) j', [yo.empresaId]))).valor.rows[0].j;

  ok('viaja el sueldo con su monto',
    paraIA.some((f) => f.clase === 'ingreso' && Number(f.importe) === 1000), true);
  ok('y el wifi con el suyo',
    paraIA.some((f) => f.clase === 'gasto' && f.nombre === 'Wifi de casa' && Number(f.importe) === 120), true);
  ok('con su categoría, para clasificar bien',
    paraIA.find((f) => f.nombre === 'Wifi de casa').categoria, 'Servicios');

  // Un vendedor no tiene por qué enterarse de cuánto cobra el dueño, ni
  // siquiera de rebote por el prompt de una captura.
  ok('a un vendedor le llega vacío',
    (await H.intentar(db, vendedor,
      () => db.query('select public.fijos_para_captura($1) j', [negocio.empresaId]))).valor.rows[0].j,
    []);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Ahorros');

  // Se deja el ciclo limpio para que los números sean solo de este grupo.
  await db.query('delete from public.gastos_fijos where empresa_id=$1', [yo.empresaId]);
  await db.query('delete from public.movimientos where empresa_id=$1', [yo.empresaId]);
  await cargar('ingreso', 1000, 'Sueldo');

  let fondo;
  aceptado('se crea un fondo con meta',
    await H.intentar(db, yo.uid, async () => {
      const r = await db.query('select public.guardar_ahorro($1,$2,$3) as id',
        [yo.empresaId, 'Viaje a Brasil', 2000]);
      fondo = r.rows[0].id;
      return r;
    }));

  aceptado('y se le guarda plata',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.mover_ahorro($1,$2,$3,$4)', [yo.empresaId, fondo, 'aporte', 300])));

  r = await resumen(db, yo.uid, yo.empresaId);
  ok('el fondo tiene saldo', Number(r.ahorros[0].saldo), 300);
  ok('y su meta', Number(r.ahorros[0].meta), 2000);
  ok('el ahorro total lo cuenta', Number(r.ahorro_total), 300);
  ok('y lo del ciclo también', Number(r.ahorrado_en_el_ciclo), 300);

  // Guardar plata NO es gastarla: sigue siendo tuya. Pero ya no la podés
  // gastar dos veces, así que baja lo disponible.
  ok('no cuenta como gasto', Number(r.salio), 0);
  ok('pero sí baja lo disponible', Number(r.disponible), 700);

  aceptado('se puede retirar',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.mover_ahorro($1,$2,$3,$4)', [yo.empresaId, fondo, 'retiro', 100])));

  r = await resumen(db, yo.uid, yo.empresaId);
  ok('el saldo baja', Number(r.ahorros[0].saldo), 200);
  ok('y retirar devuelve plata para gastar', Number(r.disponible), 800);

  rechazado('no se puede retirar más de lo que hay',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.mover_ahorro($1,$2,$3,$4)', [yo.empresaId, fondo, 'retiro', 5000])),
    'menos de lo que querés retirar');

  rechazado('ni inventar un tipo de movimiento',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.mover_ahorro($1,$2,$3,$4)', [yo.empresaId, fondo, 'robar', 10])),
    'guardar o retirar');

  // Un fondo con plata adentro no se borra: borrarlo haría desaparecer el
  // registro de esa plata.
  rechazado('un fondo con plata no se borra',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.borrar_ahorro($1,$2)', [yo.empresaId, fondo])),
    'todavía tiene plata');

  await H.intentar(db, yo.uid, () => db.query(
    'select public.mover_ahorro($1,$2,$3,$4)', [yo.empresaId, fondo, 'retiro', 200]));

  aceptado('vacío sí',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.borrar_ahorro($1,$2)', [yo.empresaId, fondo])));

  // ---- La meta con fecha (029) ----
  //
  // «Quiero juntar 5.000.000» no le dice a nadie qué hacer este mes. Con una
  // fecha sí: son once meses, faltan tanto, guardá tanto. Ese número —cuánto
  // tengo que guardar ahora— es el único que cambia una conducta.
  const conFecha = (await H.intentar(db, yo.uid, () => db.query(
    "select public.guardar_ahorro($1,$2,$3,(now() at time zone 'America/Asuncion')::date + 90) as id",
    [yo.empresaId, 'Viaje de fin de año', 3000]))).valor.rows[0].id;

  await H.intentar(db, yo.uid, () => db.query(
    'select public.mover_ahorro($1,$2,$3,$4)', [yo.empresaId, conFecha, 'aporte', 600]));

  r = await resumen(db, yo.uid, yo.empresaId);
  const viaje = r.ahorros.find((a) => a.nombre === 'Viaje de fin de año');

  ok('el fondo guarda su fecha', Boolean(viaje.fecha_limite), true);
  ok('sabe cuánto falta', Number(viaje.falta), 2400);
  ok('y cuántos días quedan', Number(viaje.dias_para_limite), 90);
  // 90 días son tres meses redondeando para arriba: 2.400 / 3 = 800.
  ok('el ritmo lo calcula la base', Number(viaje.por_mes), 800);

  // Un fondo sin fecha no tiene ritmo que calcular, y eso NO es lo mismo que
  // un ritmo de cero: la pantalla los distingue mirando los otros campos.
  const sinFecha = (await H.intentar(db, yo.uid, () => db.query(
    'select public.guardar_ahorro($1,$2,$3) as id',
    [yo.empresaId, 'Emergencias', 1000]))).valor.rows[0].id;
  r = await resumen(db, yo.uid, yo.empresaId);
  const emer = r.ahorros.find((a) => a.nombre === 'Emergencias');
  ok('sin fecha no hay ritmo', emer.por_mes, null);
  ok('pero sí se sabe cuánto falta', Number(emer.falta), 1000);

  // Una fecha que ya pasó casi siempre es un año mal tipeado.
  rechazado('no se puede poner una fecha que ya pasó',
    await H.intentar(db, yo.uid, () => db.query(
      "select public.guardar_ahorro($1,$2,$3,(now() at time zone 'America/Asuncion')::date - 5)",
      [yo.empresaId, 'Tarde', 500])),
    'ya pasó');

  // Pero editar un fondo cuya fecha venció mientras tanto tiene que seguir
  // siendo posible: si no, el día después del viaje nadie podría ni
  // corregirle el nombre a su propio fondo.
  await db.query(
    "update public.ahorros set fecha_limite = (now() at time zone 'America/Asuncion')::date - 3 where id = $1",
    [conFecha]);
  aceptado('un fondo ya vencido se puede seguir editando',
    await H.intentar(db, yo.uid, () => db.query(
      "select public.guardar_ahorro($1,$2,$3,(now() at time zone 'America/Asuncion')::date - 3,$4)",
      [yo.empresaId, 'Viaje que ya pasó', 3000, conFecha])));

  r = await resumen(db, yo.uid, yo.empresaId);
  const vencido = r.ahorros.find((a) => a.id === conFecha);
  ok('con la fecha vencida y sin llegar, no hay ritmo', vencido.por_mes, null);
  ok('y los días quedan en negativo', Number(vencido.dias_para_limite) < 0, true);

  // Meta cumplida: el ritmo es cero, que es distinto de no tener ritmo.
  await H.intentar(db, yo.uid, () => db.query(
    "select public.guardar_ahorro($1,$2,$3,(now() at time zone 'America/Asuncion')::date + 60,$4)",
    [yo.empresaId, 'Viaje que ya pasó', 500, conFecha]));
  r = await resumen(db, yo.uid, yo.empresaId);
  const logrado = r.ahorros.find((a) => a.id === conFecha);
  ok('con la meta ya juntada el ritmo es cero', Number(logrado.por_mes), 0);
  ok('y no falta nada', Number(logrado.falta), 0);

  // Se deja la cuenta como estaba para lo que sigue.
  await H.intentar(db, yo.uid, () => db.query(
    'select public.mover_ahorro($1,$2,$3,$4)', [yo.empresaId, conFecha, 'retiro', 600]));
  await H.intentar(db, yo.uid, () => db.query(
    'select public.borrar_ahorro($1,$2)', [yo.empresaId, conFecha]));
  await H.intentar(db, yo.uid, () => db.query(
    'select public.borrar_ahorro($1,$2)', [yo.empresaId, sinFecha]));

  rechazado('un vendedor no toca ahorros ajenos',
    await H.intentar(db, vendedor, () => db.query(
      'select public.guardar_ahorro($1,$2)', [negocio.empresaId, 'Mi fondo'])),
    'dueño de la cuenta');

  ok('ni los ve',
    (await H.intentar(db, vendedor,
      () => db.query('select count(*)::int n from public.ahorros'))).valor.rows[0].n, 0);

  // ═══════════════════════════════════════════════════════════
  grupo('9 · De dónde vino la plata');

  await db.query('delete from public.movimientos where empresa_id=$1', [yo.empresaId]);
  await cargar('ingreso', 1850, 'Sueldo');
  await cargar('ingreso', 300, 'Extra');
  await cargar('ingreso', 200, 'Vendí algo');

  r = await resumen(db, yo.uid, yo.empresaId);
  ok('se desglosa por categoría', r.de_donde_vino.length, 3);
  ok('y viene ordenado de mayor a menor', r.de_donde_vino[0].categoria, 'Sueldo');
  ok('con su monto', Number(r.de_donde_vino[0].monto), 1850);
  ok('el total sigue siendo la suma', Number(r.entro), 2350);

  const catIngreso = (tipo) => db.query(
    'select public.categorias_de_ingreso($1) c', [tipo])
    .then((x) => x.rows[0].c.map((y) => y.nombre));

  const ingPersonal = await catIngreso('personal');
  ok('una persona puede anotar horas extra', ingPersonal.includes('Extra'), true);
  ok('y haber vendido algo suyo', ingPersonal.includes('Vendí algo'), true);
  ok('un negocio tiene las suyas',
    (await catIngreso('emprendedor')).includes('Ventas'), true);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · Cada uno nombra sus gastos como los entiende');

  aceptado('se crea una categoría propia',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_categoria_propia($1,$2,$3,$4)',
      [yo.empresaId, 'Mascotas', 'gasto', 'veterinaria, comida del perro, baño'])));

  const misCats = (clase) => H.intentar(db, yo.uid,
    () => db.query('select public.categorias_de_empresa($1,$2) c', [yo.empresaId, clase]))
    .then((x) => x.valor.rows[0].c);

  const gastos = await misCats('gasto');
  const nombresGasto = gastos.map((c) => c.nombre);

  ok('aparece junto a las de fábrica', nombresGasto.includes('Mascotas'), true);
  ok('y las fijas siguen estando', nombresGasto.includes('Comida'), true);
  ok('viene marcada como propia',
    gastos.find((c) => c.nombre === 'Mascotas').propia, true);
  ok('con sus pistas, para que la IA la use sola',
    /perro/.test(gastos.find((c) => c.nombre === 'Mascotas').pistas), true);

  // «Otros» siempre cierra: una categoría nueva escondida debajo del cajón
  // de sastre no se usa nunca.
  ok('«Otros» queda al final', nombresGasto[nombresGasto.length - 1], 'Otros');
  ok('y la propia va antes',
    nombresGasto.indexOf('Mascotas') < nombresGasto.indexOf('Otros'), true);

  rechazado('no se puede repetir una que ya viene de fábrica',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_categoria_propia($1,$2)', [yo.empresaId, 'Comida'])),
    'ya existe');

  rechazado('ni repetir una propia',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_categoria_propia($1,$2)', [yo.empresaId, 'mascotas'])),
    'ya existe');

  rechazado('ni dejarla sin nombre',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_categoria_propia($1,$2)', [yo.empresaId, '  '])),
    'nombre');

  aceptado('también se puede crear una de ingreso',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_categoria_propia($1,$2,$3,$4)',
      [yo.empresaId, 'Alquiler que cobro', 'ingreso', 'me pagaron el alquiler'])));

  ok('y va a la lista de ingresos',
    (await misCats('ingreso')).map((c) => c.nombre).includes('Alquiler que cobro'), true);
  ok('sin ensuciar la de gastos',
    (await misCats('gasto')).map((c) => c.nombre).includes('Alquiler que cobro'), false);

  // Borrar la categoría se lleva su presupuesto, pero NO los movimientos:
  // el gasto de marzo fue en Mascotas aunque hoy ya no se ofrezca.
  await H.intentar(db, yo.uid, () => db.query(
    'select public.guardar_presupuesto($1,$2,$3)', [yo.empresaId, 'Mascotas', 200]));
  await cargar('gasto', 50, 'Mascotas');

  const idMascotas = (await db.query(
    "select id from public.categorias_propias where empresa_id=$1 and nombre='Mascotas'",
    [yo.empresaId])).rows[0].id;

  aceptado('se puede borrar',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.borrar_categoria_propia($1,$2)', [yo.empresaId, idMascotas])));

  ok('se lleva su presupuesto',
    (await db.query(
      "select count(*)::int n from public.presupuesto where empresa_id=$1 and categoria='Mascotas'",
      [yo.empresaId])).rows[0].n, 0);
  ok('pero el gasto sigue existiendo con su nombre',
    (await db.query(
      "select count(*)::int n from public.movimientos where empresa_id=$1 and categoria='Mascotas'",
      [yo.empresaId])).rows[0].n, 1);

  rechazado('un vendedor no inventa categorías',
    await H.intentar(db, vendedor, () => db.query(
      'select public.guardar_categoria_propia($1,$2)', [negocio.empresaId, 'Mis viáticos'])),
    'dueño de la cuenta');

  // Pero sí las LEE: carga gastos, y para clasificarlos necesita los nombres.
  aceptado('pero sí las lee, porque carga gastos',
    await H.intentar(db, vendedor, () => db.query(
      'select public.categorias_de_empresa($1)', [negocio.empresaId])));

  rechazado('y un extraño no lee las de otro',
    await H.intentar(db, negocio.uid, () => db.query(
      'select public.categorias_de_empresa($1)', [yo.empresaId])),
    'No tenés acceso');

  // ═══════════════════════════════════════════════════════════
  grupo('11 · Con la cuenta vencida se mira, no se escribe');

  await db.query(
    "update public.suscripciones set estado='vencida', plan='gratis', periodo_fin = now() - interval '5 days' where empresa_id=$1",
    [yo.empresaId]);

  rechazado('ni guardar plata en un ahorro',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_ahorro($1,$2)', [yo.empresaId, 'Fondo nuevo'])),
    'prueba|activar el plan');

  rechazado('ni cargar un gasto fijo',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_gasto_fijo($1,$2,$3)', [yo.empresaId, 'Netflix', 60])),
    'prueba|activar el plan');

  rechazado('no se puede cambiar el plan de gastos',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_presupuesto($1,$2,$3)', [yo.empresaId, 'Ropa', 80])),
    'prueba|activar el plan');

  rechazado('ni cargar un ingreso fijo',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_ingreso_fijo($1,$2,$3)', [yo.empresaId, 'Aguinaldo', 500])),
    'prueba|activar el plan');

  aceptado('pero se sigue viendo todo',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.resumen_personal($1)', [yo.empresaId])));

  aceptado('y se puede borrar: nadie paga para irse',
    await H.intentar(db, yo.uid, () => db.query(
      'select public.guardar_presupuesto($1,$2,$3)', [yo.empresaId, 'Cuidado personal', 0])));

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES PERSONALES FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES PERSONALES PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
