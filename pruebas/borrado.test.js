/**
 * Pruebas del borrado (migración 014).
 *
 * Es lo más peligroso que tiene el sistema: acá no hay "anulado", las filas
 * se van de verdad. Lo que se prueba, en orden de importancia:
 *
 *   1. que NO borre de más — sobre todo, que no le vuele el negocio a un
 *      equipo porque el dueño se dio de baja;
 *   2. que no borre lo de otra empresa;
 *   3. que efectivamente borre lo que dijo que iba a borrar.
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
  console.log(`  ✓ ${nombre} → rechazada: ${resultado.error.slice(0, 80)}`);
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

async function gasto(db, empresaId, uid, desc = 'Gasto', monto = 50000) {
  await H.comoUsuario(db, uid, () => db.query(
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
     values ($1,'gasto', current_date, $2, 'Varios', $3, $3)`,
    [empresaId, desc, monto]));
}

const contar = (db, tabla, empresaId) =>
  db.query(`select count(*)::int n from public.${tabla} where empresa_id = $1`, [empresaId])
    .then((r) => r.rows[0].n);

(async () => {
  const db = await H.crearBase();

  // ===================================================================
  grupo('1 · Vaciar el negocio para empezar de cero');
  // ===================================================================
  {
    const A = await H.montarEmpresa(db, { email: 'duenio@aurora.com', nombre: 'Aurora' });
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'negocio')", [A.empresaId]));
    const admin = await H.sumarMiembro(db, A.empresaId, 'admin@aurora.com', 'admin');

    const prod = await H.crearProducto(db, A.empresaId, A.uid,
      { nombre: 'Perfume', costo: 60000, precio: 150000, stock: 20 });
    await H.comoUsuario(db, A.uid, () => db.query(
      'select public.registrar_venta($1,$2,$3,$4,$5,$6,$7,$8)',
      [A.empresaId,
       JSON.stringify([{ producto_id: prod, nombre: 'Perfume', cantidad: 2, precio_unitario: 150000 }]),
       null, 'Venta', 'efectivo', '', '', 'manual']));
    await gasto(db, A.empresaId, A.uid);

    // Un comprobante colgado de la venta.
    const mov = (await db.query(
      "select id from public.movimientos where empresa_id=$1 and tipo='venta' limit 1", [A.empresaId])).rows[0].id;
    await H.comoUsuario(db, A.uid, () => db.query(
      'select public.adjuntar($1,$2,$3,$4,$5,$6)',
      [mov, 'foto', `${A.empresaId}/${mov}/x.webp`, 'image/webp', 1000, '']));

    await H.comoUsuario(db, A.uid, () => db.query('select public.marcar_cierre($1)', [A.empresaId]));

    ok('antes de vaciar hay movimientos', await contar(db, 'movimientos', A.empresaId), 2);
    ok('y productos', await contar(db, 'productos', A.empresaId), 1);
    ok('y un comprobante', await contar(db, 'adjuntos', A.empresaId), 1);

    rechazado('un admin no puede vaciar el negocio',
      await H.intentar(db, admin, () => db.query('select public.vaciar_empresa($1,$2)', [A.empresaId, 'Aurora'])),
      'solo el propietario');

    rechazado('sin escribir el nombre exacto no se vacía',
      await H.intentar(db, A.uid, () => db.query('select public.vaciar_empresa($1,$2)', [A.empresaId, 'aurora'])),
      'nombre exacto');

    rechazado('ni con el nombre vacío',
      await H.intentar(db, A.uid, () => db.query('select public.vaciar_empresa($1,$2)', [A.empresaId, ''])),
      'nombre exacto');

    ok('después de los intentos fallidos no se borró nada',
      await contar(db, 'movimientos', A.empresaId), 2);

    const r = await H.intentar(db, A.uid, () =>
      db.query('select public.vaciar_empresa($1,$2) v', [A.empresaId, 'Aurora']).then((x) => x.rows[0].v));
    aceptado('con el nombre exacto sí', r);
    ok('informa cuántos movimientos borró', r.valor.movimientos, 2);
    ok('y devuelve los archivos a limpiar de Storage', r.valor.archivos.length, 1);

    ok('no quedan movimientos', await contar(db, 'movimientos', A.empresaId), 0);
    ok('ni líneas de venta', await contar(db, 'movimiento_items', A.empresaId), 0);
    ok('ni comprobantes', await contar(db, 'adjuntos', A.empresaId), 0);
    ok('ni productos', await contar(db, 'productos', A.empresaId), 0);
    ok('ni cierres marcados', await contar(db, 'cierres', A.empresaId), 0);

    // Lo que TIENE que sobrevivir.
    ok('la empresa sigue existiendo',
      (await db.query('select count(*)::int n from public.empresas where id=$1', [A.empresaId])).rows[0].n, 1);
    ok('el equipo sigue completo', await contar(db, 'miembros', A.empresaId), 2);
    ok('y la suscripción no se tocó',
      (await db.query('select plan from public.suscripciones where empresa_id=$1', [A.empresaId])).rows[0].plan,
      'negocio');
    ok('el código de invitación sigue siendo el mismo',
      (await db.query('select count(*)::int n from public.empresa_accesos where empresa_id=$1', [A.empresaId])).rows[0].n, 1);
  }

  // ===================================================================
  grupo('2 · Vaciar NO regala capturas de IA');
  // ===================================================================
  {
    const B = await H.montarEmpresa(db, { email: 'duenio@beta.com', nombre: 'Beta' });
    // Se queda en la prueba de pro, que es donde nace. Antes se la bajaba a
    // gratis para probar el tope chico, pero desde la 018 gratis es CUENTA
    // VENCIDA y no permite ni una captura — y lo que se prueba acá no tiene
    // nada que ver con el plan: es que vaciar el negocio no borre el contador.

    for (let i = 0; i < 5; i++) {
      await H.comoUsuario(db, B.uid, () => db.query('select public.consumir_credito_ia($1)', [B.empresaId]));
    }
    ok('gastó cinco capturas',
      (await db.query('select usados from public.uso_ia where empresa_id=$1', [B.empresaId])).rows[0].usados, 5);

    await H.comoUsuario(db, B.uid, () => db.query('select public.vaciar_empresa($1,$2)', [B.empresaId, 'Beta']));

    // Si vaciar reseteara el contador, sería captura infinita gratis.
    ok('el contador de IA sigue en cinco después de vaciar',
      (await db.query('select usados from public.uso_ia where empresa_id=$1', [B.empresaId])).rows[0].usados, 5);
  }

  // ===================================================================
  grupo('3 · Vaciar no toca a nadie más');
  // ===================================================================
  {
    const C = await H.montarEmpresa(db, { email: 'duenio@ceta.com', nombre: 'Ceta' });
    const D = await H.montarEmpresa(db, { email: 'duenio@delta.com', nombre: 'Delta' });
    await gasto(db, C.empresaId, C.uid, 'de Ceta');
    await gasto(db, D.empresaId, D.uid, 'de Delta');

    rechazado('no se puede vaciar la empresa de otro',
      await H.intentar(db, C.uid, () => db.query('select public.vaciar_empresa($1,$2)', [D.empresaId, 'Delta'])),
      'solo el propietario');

    await H.comoUsuario(db, C.uid, () => db.query('select public.vaciar_empresa($1,$2)', [C.empresaId, 'Ceta']));
    ok('Ceta quedó vacía', await contar(db, 'movimientos', C.empresaId), 0);
    ok('y Delta quedó intacta', await contar(db, 'movimientos', D.empresaId), 1);
  }

  // ===================================================================
  grupo('4 · Borrar la cuenta · el resumen dice la verdad');
  // ===================================================================
  {
    const E = await H.montarEmpresa(db, { email: 'solo@eco.com', nombre: 'Eco' });
    await gasto(db, E.empresaId, E.uid, 'uno');
    await gasto(db, E.empresaId, E.uid, 'dos');

    // Además es vendedor en la empresa de otro.
    const F = await H.montarEmpresa(db, { email: 'duenio@fox.com', nombre: 'Fox' });
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'negocio')", [F.empresaId]));
    const codigo = await H.codigoDe(db, F.empresaId);
    await H.comoUsuario(db, E.uid, () => db.query('select public.unirse_empresa($1,$2)', [codigo, 'Eco']));

    const res = (await H.intentar(db, E.uid, () =>
      db.query('select public.resumen_borrado_cuenta() r').then((x) => x.rows[0].r))).valor;

    ok('avisa que se borra su propia empresa', res.se_borran.map((x) => x.nombre), ['Eco']);
    ok('con los movimientos que se pierden', res.movimientos_que_se_pierden, 2);
    ok('y que solo se va de la ajena', res.me_voy_de.map((x) => x.nombre), ['Fox']);
    ok('nada bloqueado', res.bloqueadas, []);
  }

  // ===================================================================
  grupo('5 · No le borra el negocio a un equipo que sigue trabajando');
  // ===================================================================
  {
    const G = await H.montarEmpresa(db, { email: 'duenio@gama.com', nombre: 'Gama' });
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'negocio')", [G.empresaId]));
    await H.sumarMiembro(db, G.empresaId, 'vendedor@gama.com', 'vendedor');
    await gasto(db, G.empresaId, G.uid, 'del negocio');

    const res = (await H.intentar(db, G.uid, () =>
      db.query('select public.resumen_borrado_cuenta() r').then((x) => x.rows[0].r))).valor;
    ok('el resumen la marca como bloqueada', res.bloqueadas.map((x) => x.nombre), ['Gama']);

    // Y si igual se intenta, la base lo frena. Esta es la comprobación que
    // importa: entre que alguien mira la pantalla y confirma, pudo entrar
    // alguien nuevo con el código.
    rechazado('el borrado se frena en la base',
      await H.comoServicio(db, async () => {
        try {
          await db.query('select public.borrar_datos_de_usuario($1)', [G.uid]);
          return { ok: true, valor: null, error: null };
        } catch (e) {
          return { ok: false, valor: null, error: e.message };
        }
      }),
      'gente trabajando');

    ok('la empresa sigue entera',
      (await db.query('select count(*)::int n from public.empresas where id=$1', [G.empresaId])).rows[0].n, 1);
    ok('y su movimiento también', await contar(db, 'movimientos', G.empresaId), 1);
  }

  // ===================================================================
  grupo('6 · Borrar de verdad');
  // ===================================================================
  {
    const H1 = await H.montarEmpresa(db, { email: 'chau@hotel.com', nombre: 'Hotel' });
    await gasto(db, H1.empresaId, H1.uid, 'mío');

    const I = await H.montarEmpresa(db, { email: 'duenio@india.com', nombre: 'India' });
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'negocio')", [I.empresaId]));
    const cod = await H.codigoDe(db, I.empresaId);
    await H.comoUsuario(db, H1.uid, () => db.query('select public.unirse_empresa($1,$2)', [cod, 'Visitante']));
    await gasto(db, I.empresaId, H1.uid, 'cargado por el que se va');

    await H.comoUsuario(db, H1.uid, () =>
      db.query('select public.guardar_preferencias($1,$2,$3,$4)', ['pt', true, false, 21]));

    const r = await H.comoServicio(db, () =>
      db.query('select public.borrar_datos_de_usuario($1) r', [H1.uid]).then((x) => x.rows[0].r));

    ok('borró su empresa', r.empresas_borradas, 1);
    ok('la empresa propia ya no existe',
      (await db.query('select count(*)::int n from public.empresas where id=$1', [H1.empresaId])).rows[0].n, 0);
    ok('y sus movimientos tampoco', await contar(db, 'movimientos', H1.empresaId), 0);

    // Lo que cargó en la empresa AJENA se queda: es del negocio, no suyo.
    ok('la empresa ajena sigue existiendo',
      (await db.query('select count(*)::int n from public.empresas where id=$1', [I.empresaId])).rows[0].n, 1);
    ok('y el movimiento que cargó ahí también', await contar(db, 'movimientos', I.empresaId), 1);
    ok('pero ya no es miembro',
      (await db.query('select count(*)::int n from public.miembros where user_id=$1', [H1.uid])).rows[0].n, 0);
    ok('sus preferencias se fueron',
      (await db.query('select count(*)::int n from public.preferencias where user_id=$1', [H1.uid])).rows[0].n, 0);

    // Y ahora la cuenta se puede borrar sin que ninguna clave foránea lo impida.
    let borrado = { ok: true, error: null };
    try { await db.query('delete from auth.users where id=$1', [H1.uid]); }
    catch (e) { borrado = { ok: false, error: e.message }; }
    aceptado('la cuenta de auth se borra sin trabas', borrado);
  }

  // ===================================================================
  grupo('7 · Nadie borra la cuenta de otro');
  // ===================================================================
  {
    const J = await H.montarEmpresa(db, { email: 'duenio@juliet.com', nombre: 'Juliet' });

    rechazado('un usuario común no puede llamar a borrar_datos_de_usuario',
      await H.intentar(db, J.uid, () => db.query('select public.borrar_datos_de_usuario($1)', [J.uid])),
      'permission denied|no existe|does not exist');

    rechazado('ni pedir los archivos de otro',
      await H.intentar(db, J.uid, () => db.query('select public.archivos_a_borrar($1)', [J.uid])),
      'permission denied|no existe|does not exist');

    ok('sigue existiendo',
      (await db.query('select count(*)::int n from public.empresas where id=$1', [J.empresaId])).rows[0].n, 1);
  }

  console.log(`\n${'═'.repeat(62)}`);
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE BORRADO FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE BORRADO PASARON`);
})().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message);
  console.error(e);
  process.exit(1);
});
