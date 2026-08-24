/**
 * Pruebas del hábito y del consumo de IA (migraciones 008 y 009).
 *
 * Lo que importa acá no es que las funciones "anden", sino que digan la
 * verdad en los bordes: la racha que se corta, el día que todavía no
 * terminó, el vendedor que no puede ver la ganancia ni de refilón, y el
 * tope de capturas que no se puede pasar ni pidiendo dos veces al mismo
 * tiempo.
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
    console.log(`  ✗ ${nombre}\n      NO fue rechazada (devolvió ${JSON.stringify(resultado.valor)})`);
    return;
  }
  if (fragmento && !new RegExp(fragmento, 'i').test(resultado.error)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      rechazada por otro motivo: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${resultado.error}`);
}

/** Carga un gasto en un día concreto (desplazamiento en días respecto de hoy). */
async function gastoEn(db, empresaId, uid, diasAtras, monto = 10000) {
  await H.comoUsuario(db, uid, () => db.query(
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
     values ($1, 'gasto', public.hoy_empresa($1) - $2::int, 'Gasto', 'Varios', $3, $3)`,
    [empresaId, diasAtras, monto]));
}

const leerRacha = (db, uid, empresaId) =>
  H.comoUsuario(db, uid, () =>
    db.query('select public.racha_empresa($1) r', [empresaId]).then((x) => x.rows[0].r));

(async () => {
  const db = await H.crearBase();

  const A = await H.montarEmpresa(db, { email: 'duenio@aurora.com', nombre: 'Aurora' });
  const vendedorA = await H.sumarMiembro(db, A.empresaId, 'vendedor@aurora.com', 'vendedor');

  // ===================================================================
  grupo('1 · Zona horaria por empresa');
  // ===================================================================
  {
    ok('la empresa nace en la zona de Paraguay',
      (await db.query('select zona_horaria from public.empresas where id=$1', [A.empresaId])).rows[0].zona_horaria,
      'America/Asuncion');

    rechazado('una zona inventada se rechaza',
      await H.intentar(db, A.uid, () =>
        db.query('select public.actualizar_zona($1, $2)', [A.empresaId, 'Marte/Olimpo'])),
      'no existe');

    rechazado('un vendedor no cambia la zona',
      await H.intentar(db, vendedorA, () =>
        db.query('select public.actualizar_zona($1, $2)', [A.empresaId, 'America/Sao_Paulo'])),
      'propietario o un administrador');

    await H.comoUsuario(db, A.uid, () =>
      db.query('select public.actualizar_zona($1, $2)', [A.empresaId, 'America/Sao_Paulo']));
    ok('el dueño sí',
      (await db.query('select zona_horaria from public.empresas where id=$1', [A.empresaId])).rows[0].zona_horaria,
      'America/Sao_Paulo');

    // La dejamos como estaba: el resto de las pruebas cuenta días con ella.
    await H.comoUsuario(db, A.uid, () =>
      db.query('select public.actualizar_zona($1, $2)', [A.empresaId, 'America/Asuncion']));
  }

  // ===================================================================
  grupo('2 · La racha');
  // ===================================================================
  {
    const vacia = await leerRacha(db, A.uid, A.empresaId);
    ok('sin movimientos la racha es cero', vacia.dias, 0);
    ok('y no está en riesgo (no hay nada que perder)', vacia.en_riesgo, false);

    // Cuatro días seguidos terminando AYER.
    for (const d of [4, 3, 2, 1]) await gastoEn(db, A.empresaId, A.uid, d);

    const deAyer = await leerRacha(db, A.uid, A.empresaId);
    ok('cuatro días seguidos hasta ayer', deAyer.dias, 4);
    ok('hoy todavía no cargó', deAyer.hoy_cargado, false);
    ok('por eso está en riesgo', deAyer.en_riesgo, true);

    // Carga hoy: la racha crece y deja de estar en riesgo.
    await gastoEn(db, A.empresaId, A.uid, 0);
    const conHoy = await leerRacha(db, A.uid, A.empresaId);
    ok('al cargar hoy suma cinco', conHoy.dias, 5);
    ok('y ya no está en riesgo', conHoy.en_riesgo, false);

    // Un hueco viejo no toca la racha vigente, pero sí queda como historia.
    for (const d of [20, 19, 18, 17, 16, 15, 14]) await gastoEn(db, A.empresaId, A.uid, d);
    const conHistoria = await leerRacha(db, A.uid, A.empresaId);
    ok('la racha vigente sigue siendo cinco', conHistoria.dias, 5);
    ok('pero la mejor de la historia es siete', conHistoria.mejor, 7);
    ok('y hay doce días con actividad', conHistoria.dias_activos, 12);

    // Un movimiento ANULADO no sostiene la racha: si contara, alguien
    // podría mantenerla cargando y anulando cualquier cosa.
    const B = await H.montarEmpresa(db, { email: 'duenio@boreal.com', nombre: 'Boreal' });
    await gastoEn(db, B.empresaId, B.uid, 0);
    const mov = (await db.query(
      'select id from public.movimientos where empresa_id=$1 limit 1', [B.empresaId])).rows[0].id;
    await H.comoUsuario(db, B.uid, () =>
      db.query('select public.anular_movimiento($1,$2)', [mov, 'prueba']));

    const anulada = await leerRacha(db, B.uid, B.empresaId);
    ok('un movimiento anulado no sostiene la racha', anulada.dias, 0);

    rechazado('la racha de otra empresa no se puede espiar',
      await H.intentar(db, A.uid, () => db.query('select public.racha_empresa($1)', [B.empresaId])),
      'no pertenecés');
  }

  // ===================================================================
  grupo('3 · El cierre del día');
  // ===================================================================
  {
    const C = await H.montarEmpresa(db, { email: 'duenio@cierre.com', nombre: 'Cierre' });
    const vendedorC = await H.sumarMiembro(db, C.empresaId, 'vendedor@cierre.com', 'vendedor');
    const prod = await H.crearProducto(db, C.empresaId, C.uid,
      { nombre: 'Perfume', costo: 60000, precio: 150000, stock: 50 });

    // Dos ventas y un gasto, hoy.
    await H.comoUsuario(db, C.uid, () => db.query(
      'select public.registrar_venta($1,$2,$3,$4,$5,$6,$7,$8)',
      [C.empresaId,
       JSON.stringify([{ producto_id: prod, nombre: 'Perfume', cantidad: 2, precio_unitario: 150000 }]),
       null, 'Venta del día', 'efectivo', '', '', 'manual']));
    await gastoEn(db, C.empresaId, C.uid, 0, 40000);

    const cierre = await H.comoUsuario(db, C.uid, () =>
      db.query('select public.cierre_del_dia($1) c', [C.empresaId]).then((x) => x.rows[0].c));

    ok('hubo actividad', cierre.hubo_actividad, true);
    ok('vendido del día', Number(cierre.resumen.ventas), 300000);
    ok('gastos del día', Number(cierre.resumen.gastos), 40000);
    // 300.000 vendido − 120.000 de costo − 40.000 de gasto.
    ok('ganancia neta del día', Number(cierre.resumen.ganancia_neta), 140000);
    ok('el producto estrella es el perfume', cierre.producto_estrella.nombre, 'Perfume');
    ok('la racha del día es uno', cierre.racha.dias, 1);
    ok('todavía no lo cerró', cierre.ya_cerrado, false);

    // El vendedor ve su día, pero sin rentabilidad. Es el mismo permiso por
    // columna de la 003: no lo tapa la pantalla, no llega desde la base.
    const delVendedor = await H.comoUsuario(db, vendedorC, () =>
      db.query('select public.cierre_del_dia($1) c', [C.empresaId]).then((x) => x.rows[0].c));
    ok('el vendedor ve lo vendido', Number(delVendedor.resumen.ventas), 300000);
    ok('pero la ganancia le llega en null', delVendedor.resumen.ganancia_neta, null);
    ok('y el promedio de ganancia también', delVendedor.promedio_semana.ganancia_neta, null);

    // Marcar el cierre.
    await H.comoUsuario(db, C.uid, () => db.query('select public.marcar_cierre($1)', [C.empresaId]));
    const cerrado = await H.comoUsuario(db, C.uid, () =>
      db.query('select public.cierre_del_dia($1) c', [C.empresaId]).then((x) => x.rows[0].c));
    ok('ahora sí figura cerrado', cerrado.ya_cerrado, true);

    // Que el dueño lo haya mirado no significa que el vendedor lo miró.
    const delVendedor2 = await H.comoUsuario(db, vendedorC, () =>
      db.query('select public.cierre_del_dia($1) c', [C.empresaId]).then((x) => x.rows[0].c));
    ok('para el vendedor sigue sin cerrar', delVendedor2.ya_cerrado, false);

    // Marcar dos veces no duplica.
    await H.comoUsuario(db, C.uid, () => db.query('select public.marcar_cierre($1)', [C.empresaId]));
    ok('marcarlo de nuevo no duplica la fila',
      (await db.query('select count(*)::int n from public.cierres where empresa_id=$1', [C.empresaId])).rows[0].n, 1);

    rechazado('no se puede cerrar un día que no pasó',
      await H.intentar(db, C.uid, () =>
        db.query('select public.marcar_cierre($1, public.hoy_empresa($1) + 1)', [C.empresaId])),
      'todavía no pasó');

    rechazado('ni mirar el cierre de otra empresa',
      await H.intentar(db, A.uid, () => db.query('select public.cierre_del_dia($1)', [C.empresaId])),
      'no pertenecés');

    // Un día sin nada tiene que decirlo, no fingir ceros interesantes.
    const vacio = await H.comoUsuario(db, C.uid, () =>
      db.query('select public.cierre_del_dia($1, public.hoy_empresa($1) - 3) c', [C.empresaId])
        .then((x) => x.rows[0].c));
    ok('un día sin movimientos avisa que no hubo actividad', vacio.hubo_actividad, false);
  }

  // ===================================================================
  grupo('4 · A quién se le avisa de noche');
  // ===================================================================
  {
    // A tiene la racha viva y ya cargó hoy → no corresponde molestarla.
    const lista = await H.comoServicio(db, () =>
      db.query('select public.empresas_sin_cargar_hoy(2) l').then((x) => x.rows[0].l));
    const ids = lista.map((x) => x.empresa_id);
    ok('a quien ya cargó hoy no se le avisa', ids.includes(A.empresaId), false);

    // D tiene tres días seguidos hasta ayer y hoy nada → sí corresponde.
    const D = await H.montarEmpresa(db, { email: 'duenio@delta.com', nombre: 'Delta' });
    for (const d of [3, 2, 1]) await gastoEn(db, D.empresaId, D.uid, d);
    const lista2 = await H.comoServicio(db, () =>
      db.query('select public.empresas_sin_cargar_hoy(2) l').then((x) => x.rows[0].l));
    const delta = lista2.find((x) => x.empresa_id === D.empresaId);
    ok('a quien tiene racha viva y hoy vacío sí', Boolean(delta), true);
    ok('y va con el largo de su racha', delta && delta.racha, 3);

    // E cargó un solo día: no hay racha que salvar, no se le escribe.
    const E = await H.montarEmpresa(db, { email: 'duenio@eco.com', nombre: 'Eco' });
    await gastoEn(db, E.empresaId, E.uid, 1);
    const lista3 = await H.comoServicio(db, () =>
      db.query('select public.empresas_sin_cargar_hoy(2) l').then((x) => x.rows[0].l));
    ok('con un solo día no se molesta a nadie',
      lista3.some((x) => x.empresa_id === E.empresaId), false);

    const desdeCliente = await H.intentar(db, A.uid, () =>
      db.query('select public.empresas_sin_cargar_hoy(2)'));
    ok('y el cliente no puede pedir esa lista', desdeCliente.ok, false);
  }

  // ===================================================================
  grupo('5 · El tope de capturas con IA');
  // ===================================================================
  {
    const F = await H.montarEmpresa(db, { email: 'duenio@foxtrot.com', nombre: 'Foxtrot' });

    // Nace en prueba de pro: 600 capturas.
    const enPrueba = await H.comoUsuario(db, F.uid, () =>
      db.query('select public.uso_ia_actual($1) u', [F.empresaId]).then((x) => x.rows[0].u));
    ok('en prueba el tope es el de pro', enPrueba.tope, 600);
    ok('y arranca en cero', enPrueba.usados, 0);

    // La bajamos a gratis para probar el tope chico.
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'gratis')", [F.empresaId]));

    const gratis = await H.comoUsuario(db, F.uid, () =>
      db.query('select public.uso_ia_actual($1) u', [F.empresaId]).then((x) => x.rows[0].u));
    ok('en gratis el tope es veinte', gratis.tope, 20);

    for (let i = 0; i < 20; i++) {
      await H.comoUsuario(db, F.uid, () => db.query('select public.consumir_credito_ia($1)', [F.empresaId]));
    }

    const pasado = await H.comoUsuario(db, F.uid, () =>
      db.query('select public.consumir_credito_ia($1) c', [F.empresaId]).then((x) => x.rows[0].c));
    ok('la captura veintiuno no se permite', pasado.permitido, false);
    ok('y el contador no se pasó del tope', pasado.usados, 20);

    ok('en la tabla tampoco',
      (await db.query('select usados from public.uso_ia where empresa_id=$1', [F.empresaId])).rows[0].usados, 20);

    // Al pasar a un plan pago, el cupo se abre con el mismo contador.
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'pro','activa')", [F.empresaId]));
    const conPro = await H.comoUsuario(db, F.uid, () =>
      db.query('select public.consumir_credito_ia($1) c', [F.empresaId]).then((x) => x.rows[0].c));
    ok('con pro vuelve a permitir', conPro.permitido, true);
    ok('y sigue contando desde donde iba', conPro.usados, 21);

    rechazado('nadie gasta créditos de otra empresa',
      await H.intentar(db, A.uid, () => db.query('select public.consumir_credito_ia($1)', [F.empresaId])),
      'no pertenecés');

    rechazado('ni se edita el contador a mano',
      await H.intentar(db, F.uid, () =>
        db.query('update public.uso_ia set usados = 0 where empresa_id=$1', [F.empresaId])),
      'denied|policy|permission');
  }

  // ===================================================================
  grupo('6 · Precios');
  // ===================================================================
  {
    const precios = (await db.query('select public.lista_precios($1) p', ['PYG'])).rows[0].p;
    ok('hay cuatro precios en guaraníes', precios.length, 4);
    ok('pro mensual en guaraníes',
      Number(precios.find((x) => x.plan === 'pro' && x.periodo === 'mensual').importe), 35000);
    ok('el anual da dos meses gratis',
      Number(precios.find((x) => x.plan === 'pro' && x.periodo === 'anual').importe), 350000);

    const dolares = (await db.query('select public.lista_precios($1) p', ['USD'])).rows[0].p;
    ok('y también están en dólares', dolares.length, 4);

    rechazado('nadie cambia un precio desde el cliente',
      await H.intentar(db, A.uid, () => db.query("update public.precios set importe = 1")),
      'denied|policy|permission');
  }

  console.log(`\n${'═'.repeat(62)}`);
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE HÁBITO FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE HÁBITO PASARON`);
})().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message);
  console.error(e);
  process.exit(1);
});
