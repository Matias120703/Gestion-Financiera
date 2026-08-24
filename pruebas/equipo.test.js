/**
 * Pruebas de la baja de miembros (migración 011).
 *
 * Lo que importa acá no es que el borrado "funcione", sino la jerarquía y,
 * sobre todo, que sacar a alguien NO le toque un solo movimiento al negocio.
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

function aceptado(nombre, resultado) {
  corridas++;
  if (!resultado.ok) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      fue rechazada: ${resultado.error}`);
    return;
  }
  console.log(`  ✓ ${nombre}`);
}

const cuantos = (db, empresaId) =>
  db.query('select count(*)::int n from public.miembros where empresa_id=$1', [empresaId])
    .then((r) => r.rows[0].n);

(async () => {
  const db = await H.crearBase();

  const A = await H.montarEmpresa(db, { email: 'duenio@aurora.com', nombre: 'Aurora' });
  // El plan negocio deja entrar a todos los que hacen falta para probar.
  await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'negocio')", [A.empresaId]));

  const adminA    = await H.sumarMiembro(db, A.empresaId, 'admin@aurora.com', 'admin');
  const otroAdmin = await H.sumarMiembro(db, A.empresaId, 'admin2@aurora.com', 'admin');
  const vendedorA = await H.sumarMiembro(db, A.empresaId, 'vendedor@aurora.com', 'vendedor');

  const B = await H.montarEmpresa(db, { email: 'duenio@boreal.com', nombre: 'Boreal' });

  // ===================================================================
  grupo('1 · Quién puede sacar a quién');
  // ===================================================================
  {
    rechazado('un vendedor no puede sacar a nadie',
      await H.intentar(db, vendedorA, () =>
        db.query('select public.quitar_miembro($1,$2)', [A.empresaId, adminA])),
      'propietario o un administrador');

    rechazado('nadie de afuera puede tocar el equipo',
      await H.intentar(db, B.uid, () =>
        db.query('select public.quitar_miembro($1,$2)', [A.empresaId, vendedorA])),
      'propietario o un administrador');

    rechazado('al propietario no se lo saca',
      await H.intentar(db, adminA, () =>
        db.query('select public.quitar_miembro($1,$2)', [A.empresaId, A.uid])),
      'propietario');

    rechazado('nadie se saca a sí mismo',
      await H.intentar(db, adminA, () =>
        db.query('select public.quitar_miembro($1,$2)', [A.empresaId, adminA])),
      'a vos mismo');

    rechazado('un admin no saca a otro admin',
      await H.intentar(db, adminA, () =>
        db.query('select public.quitar_miembro($1,$2)', [A.empresaId, otroAdmin])),
      'otro administrador');

    rechazado('sacar a alguien que no está',
      await H.intentar(db, A.uid, () =>
        db.query('select public.quitar_miembro($1,$2)', [A.empresaId, B.uid])),
      'no está en el equipo');

    ok('después de todos los intentos el equipo sigue igual', await cuantos(db, A.empresaId), 4);
  }

  // ===================================================================
  grupo('2 · La baja no toca la contabilidad');
  // ===================================================================
  {
    // El vendedor carga un gasto antes de que lo saquen.
    await H.comoUsuario(db, vendedorA, () => db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
       values ($1,'gasto', current_date, 'Nafta de la moto', 'Transporte', 90000, 90000)`,
      [A.empresaId]));

    const antes = (await db.query(
      'select count(*)::int n, coalesce(sum(monto),0)::numeric s from public.movimientos where empresa_id=$1',
      [A.empresaId])).rows[0];

    const salida = await H.intentar(db, A.uid, () =>
      db.query('select public.quitar_miembro($1,$2) nombre', [A.empresaId, vendedorA])
        .then((r) => r.rows[0].nombre));
    aceptado('el propietario saca al vendedor', salida);

    ok('ya no está en el equipo', await cuantos(db, A.empresaId), 3);

    const despues = (await db.query(
      'select count(*)::int n, coalesce(sum(monto),0)::numeric s from public.movimientos where empresa_id=$1',
      [A.empresaId])).rows[0];

    ok('no se borró ningún movimiento', despues.n, antes.n);
    ok('ni cambió un solo guaraní', Number(despues.s), Number(antes.s));
    ok('el gasto sigue con su autor',
      (await db.query(
        `select creado_por from public.movimientos
         where empresa_id=$1 and descripcion='Nafta de la moto'`, [A.empresaId])).rows[0].creado_por,
      vendedorA);

    // Y ya no ve nada del negocio: RLS lo deja afuera al instante.
    const mirando = await H.intentar(db, vendedorA, () =>
      db.query('select count(*)::int n from public.movimientos where empresa_id=$1', [A.empresaId])
        .then((r) => r.rows[0].n));
    ok('el que salió ya no ve los movimientos', mirando.valor, 0);

    rechazado('ni puede pedir los datos de la empresa',
      await H.intentar(db, vendedorA, () => db.query('select public.datos_empresa($1)', [A.empresaId])),
      'no pertenecés');
  }

  // ===================================================================
  grupo('3 · El propietario puede sacar a un administrador');
  // ===================================================================
  {
    aceptado('el dueño sí saca a un admin',
      await H.intentar(db, A.uid, () =>
        db.query('select public.quitar_miembro($1,$2)', [A.empresaId, otroAdmin])));
    // Arrancaron 4 (dueño + 2 admin + vendedor). Salió el vendedor en el
    // grupo anterior y ahora un admin: quedan el dueño y un administrador.
    ok('quedan el dueño y un admin', await cuantos(db, A.empresaId), 2);
  }

  // ===================================================================
  grupo('4 · Rotar el código de invitación');
  // ===================================================================
  {
    const viejo = await H.codigoDe(db, A.empresaId);

    rechazado('un admin no puede rotarlo',
      await H.intentar(db, adminA, () => db.query('select public.rotar_codigo_acceso($1)', [A.empresaId])),
      'solo el propietario');

    rechazado('ni alguien de otra empresa',
      await H.intentar(db, B.uid, () => db.query('select public.rotar_codigo_acceso($1)', [A.empresaId])),
      'solo el propietario');

    const nuevo = await H.intentar(db, A.uid, () =>
      db.query('select public.rotar_codigo_acceso($1) c', [A.empresaId]).then((r) => r.rows[0].c));
    aceptado('el propietario sí puede', nuevo);
    ok('y el código cambió', nuevo.valor !== viejo, true);

    // Lo importante: el que salió no puede volver con el código que sabía.
    rechazado('el código viejo ya no sirve',
      await H.intentar(db, vendedorA, () =>
        db.query('select public.unirse_empresa($1,$2)', [viejo, 'Vuelvo'])),
      'no corresponde');

    // El nuevo sí, si se lo pasan.
    aceptado('el nuevo sí funciona',
      await H.intentar(db, vendedorA, () =>
        db.query('select public.unirse_empresa($1,$2)', [nuevo.valor, 'Vuelvo'])));

    await db.query('delete from public.miembros where empresa_id=$1 and user_id=$2', [A.empresaId, vendedorA]);
  }

  // ===================================================================
  grupo('5 · La puerta cruda también está cerrada');
  // ===================================================================
  {
    rechazado('un admin no se borra a sí mismo con delete directo',
      await H.intentar(db, adminA, () =>
        db.query('delete from public.miembros where empresa_id=$1 and user_id=$2 returning id', [A.empresaId, adminA])
          .then((r) => { if (r.rows.length === 0) throw new Error('policy: no afectó ninguna fila'); return r.rows; })),
      'policy|denied|permission|no afectó');

    ok('el admin sigue estando',
      (await db.query(
        'select count(*)::int n from public.miembros where empresa_id=$1 and user_id=$2',
        [A.empresaId, adminA])).rows[0].n, 1);
  }

  console.log(`\n${'═'.repeat(62)}`);
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE EQUIPO FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE EQUIPO PASARON`);
})().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message);
  console.error(e);
  process.exit(1);
});
