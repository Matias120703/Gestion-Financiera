/**
 * Las sillas se pagan (migración 048).
 *
 * DOS AGUJEROS DE COBRO, UNA SOLA CUENTA
 *
 * Antes de la 048, «cuánta gente entra en este negocio» tenía dos respuestas
 * distintas y ninguna servía: el plan daba un número fijo e igual para todos
 * (3 en Pro, 15 en Negocio, mientras la portada prometía «sin tope»), y el
 * equipo de reparto no contaba para nada — se podían cargar seis barberos
 * sin cuenta en el plan gratis.
 *
 * Ahora hay un solo número, escrito por negocio en el panel al momento de
 * cobrar, y todo el mundo pasa por él.
 *
 * EL «+1» ES EL DUEÑO, Y ES LO QUE MÁS SE PRUEBA ACÁ
 *
 * En el panel se escriben VENDEDORES, porque es lo que se cobra. La tabla
 * `miembros` cuenta PERSONAS, y el dueño es una. Esa suma vive en un solo
 * lugar (`tope_de_miembros`), así que si se rompe, se rompe en silencio y
 * cobrando de menos. Por eso el conteo se comprueba de las dos maneras.
 */
const H = require('./ayuda-db.js');

let fallos = 0, corridas = 0;

function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a}`);
}

function rechazado(nombre, res, frag) {
  corridas++;
  if (res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      NO fue rechazada`); return; }
  if (frag && !new RegExp(frag, 'i').test(res.error)) {
    fallos++; console.log(`  ✗ ${nombre}\n      otro motivo: ${res.error}`); return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 64)}`);
}

function aceptado(nombre, res) {
  corridas++;
  if (!res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      falló: ${res.error}`); return false; }
  console.log(`  ✓ ${nombre}`);
  return true;
}

const tope = (db, empresa) =>
  db.query('select public.tope_de_miembros($1) t', [empresa]).then((r) => r.rows[0].t);

const personas = (db, empresa) =>
  db.query('select count(*)::int n from public.miembros where empresa_id=$1', [empresa])
    .then((r) => r.rows[0].n);

/** Sumar a alguien por el camino real: código de acceso. */
const sumar = async (db, empresa, email) => {
  const uid = await H.crearUsuario(db, email);
  const cod = await H.codigoDe(db, empresa);
  return { uid, res: await H.intentar(db, uid, () =>
    db.query('select public.unirse_empresa($1, $2)', [cod, email])) };
};

async function principal() {
  const db = await H.crearBase();

  const jefe = await H.crearUsuario(db, 'jefe@orden.com');
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe]);

  const A = await H.montarEmpresa(db, { email: 'dueno@barberia.com', nombre: 'Barbería Central' });

  const cobrar = (empresa, plan, vendedores) =>
    H.intentarComo(db, 'authenticated', jefe, () => db.query(
      'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5,$6) j',
      [empresa, plan, 1, 'cobrado por transferencia', null, vendedores],
    ).then((r) => r.rows[0].j));

  // =====================================================================
  grupo('1 · Sin trato especial manda el plan, como siempre');
  // =====================================================================
  {
    ok('una empresa nueva arranca en prueba de pro', await tope(db, A.empresaId), 3);
    ok('y todavía no tiene tope escrito',
      (await db.query('select tope_vendedores from public.suscripciones where empresa_id=$1',
        [A.empresaId])).rows[0].tope_vendedores, null);
    ok('el dueño ya ocupa una silla', await personas(db, A.empresaId), 1);
  }

  // =====================================================================
  grupo('2 · El tope se escribe al cobrar, en vendedores');
  // =====================================================================
  {
    const r = await cobrar(A.empresaId, 'negocio', 4);
    aceptado('la administración habilita 4 vendedores', r);
    ok('lo devuelve como se escribió', r.valor.tope_vendedores, 4);
    // Acá es donde el «+1» tiene que aparecer, y en ningún otro lado.
    ok('y en personas son 5, con el dueño', r.valor.personas_permitidas, 5);
    ok('la función lo confirma', await tope(db, A.empresaId), 5);
  }

  // =====================================================================
  grupo('3 · La puerta cuenta ese número y no el del plan');
  // =====================================================================
  {
    for (const n of [1, 2, 3, 4]) {
      aceptado(`entra el vendedor ${n}`, (await sumar(db, A.empresaId, `v${n}@barberia.com`)).res);
    }
    ok('el negocio quedó con 5 personas', await personas(db, A.empresaId), 5);

    const quinto = await sumar(db, A.empresaId, 'v5@barberia.com');
    rechazado('el quinto vendedor ya no entra', quinto.res, 'ya tiene sus 5 personas');
    // El mensaje viejo mandaba a contratar el plan Negocio. Este negocio YA
    // está en Negocio: seguir diciéndolo lo mandaría a comprar lo que tiene.
    ok('y no le ofrece un plan que ya tiene',
      /plan Negocio permite/i.test(quinto.res.error), false);
  }

  // =====================================================================
  grupo('4 · Bajar el tope no echa a nadie, pero avisa');
  // =====================================================================
  {
    const r = await cobrar(A.empresaId, 'negocio', 2);
    aceptado('se baja el trato a 2 vendedores', r);
    ok('nadie perdió el acceso', await personas(db, A.empresaId), 5);
    ok('pero el panel avisa', /ya tiene 5 personas/i.test(r.valor.aviso ?? ''), true);

    rechazado('y no se puede sumar a nadie más',
      (await sumar(db, A.empresaId, 'v6@barberia.com')).res, 'ya tiene sus 3 personas');
  }

  // =====================================================================
  grupo('5 · Volver al valor del plan, y el cero');
  // =====================================================================
  {
    // `null` no puede significar «borrar el trato» porque ya significa «no
    // toques nada». Por eso hay un -1.
    const sinTocar = await cobrar(A.empresaId, 'negocio', null);
    aceptado('mandar null no toca el tope', sinTocar);
    ok('sigue en 2', sinTocar.valor.tope_vendedores, 2);

    const alPlan = await cobrar(A.empresaId, 'negocio', -1);
    aceptado('mandar -1 lo devuelve al plan', alPlan);
    ok('el tope queda sin escribir', alPlan.valor.tope_vendedores, null);
    ok('y vuelve a valer el del plan Negocio', await tope(db, A.empresaId), 15);

    const cero = await cobrar(A.empresaId, 'negocio', 0);
    aceptado('cero vendedores es un trato válido', cero);
    ok('queda solo el dueño', await tope(db, A.empresaId), 1);
    // Cero y null son distintos, y el día que se confundan alguien va a
    // pagar por un vendedor que no puede sumar.
    ok('cero no es lo mismo que null', cero.valor.tope_vendedores, 0);

    rechazado('un tope negativo que no sea -1 se rechaza',
      await cobrar(A.empresaId, 'negocio', -5), 'no puede ser negativo');
  }

  // =====================================================================
  grupo('6 · El trato no sobrevive a dejar de pagar');
  // =====================================================================
  {
    const B = await H.montarEmpresa(db, { email: 'dueno@otro.com', nombre: 'Otro Local' });
    aceptado('se le habilitan 10 vendedores', await cobrar(B.empresaId, 'negocio', 10));
    ok('son 11 personas', await tope(db, B.empresaId), 11);

    // Se le vence solo, sin que nadie corra nada.
    await db.query(
      "update public.suscripciones set periodo_fin = now() - interval '1 day' where empresa_id=$1",
      [B.empresaId]);

    ok('vencido, el plan efectivo cae a gratis',
      (await db.query('select public.plan_efectivo_calculado($1) p', [B.empresaId])).rows[0].p, 'gratis');
    // Sin esto, el que dejó de pagar se quedaba con las diez sillas que le
    // habilitamos cuando pagaba.
    ok('y el tope cae con él', await tope(db, B.empresaId), 1);

    rechazado('no puede sumar a nadie',
      (await sumar(db, B.empresaId, 'alguien@otro.com')).res, 'ya tiene sus 1 personas');

    // Y al volver a cobrarle, el trato se vuelve a escribir.
    aceptado('vuelve a pagar', await cobrar(B.empresaId, 'negocio', 10));
    ok('y recupera sus sillas', await tope(db, B.empresaId), 11);
  }

  // =====================================================================
  grupo('7 · Cortar el servicio borra el trato');
  // =====================================================================
  {
    const C = await H.montarEmpresa(db, { email: 'dueno@tercero.com', nombre: 'Tercer Local' });
    await cobrar(C.empresaId, 'negocio', 8);

    const cortado = await cobrar(C.empresaId, 'gratis', null);
    aceptado('la administración corta el servicio', cortado);
    ok('el tope queda borrado, no guardado', cortado.valor.tope_vendedores, null);
    ok('y vale el del plan gratis', await tope(db, C.empresaId), 1);
  }

  // =====================================================================
  grupo('8 · El tope lo pone la administración, nadie más');
  // =====================================================================
  {
    rechazado('el dueño del negocio no puede ampliarse solo',
      await H.intentarComo(db, 'authenticated', A.uid, () => db.query(
        'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5,$6)',
        [A.empresaId, 'negocio', 1, '', null, 99])),
      'solo para la administración');

    // La firma vieja de 5 argumentos tiene que estar muerta, o PostgREST ve
    // dos funciones con el mismo nombre y no sabe cuál llamar.
    ok('la firma de 5 argumentos ya no existe',
      (await db.query(`select count(*)::int n from pg_proc p
         where p.proname = 'cambiar_plan_cuenta' and p.pronargs = 5`)).rows[0].n, 0);
    ok('y queda solo la de 6',
      (await db.query(`select count(*)::int n from pg_proc p
         where p.proname = 'cambiar_plan_cuenta'`)).rows[0].n, 1);
  }

  // =====================================================================
  grupo('9 · Para estar en el equipo de reparto hay que estar en el negocio');
  // =====================================================================
  {
    const D = await H.montarEmpresa(db, { email: 'dueno@peluqueria.com', nombre: 'Peluquería' });
    await cobrar(D.empresaId, 'negocio', 3);
    const barbero = await H.sumarMiembro(db, D.empresaId, 'barbero@peluqueria.com', 'vendedor');
    const ajeno = await H.crearUsuario(db, 'ajeno@ningunlado.com');

    // Este era el agujero: seis barberos cargados así, sin sumar un miembro,
    // con agenda y reparto andando, en el plan gratis.
    rechazado('ya no se puede cargar a alguien sin cuenta',
      await H.intentar(db, D.uid, () => db.query(
        "select public.guardar_profesional($1, 'Juan sin cuenta', 'comision', 50)", [D.empresaId])),
      'tiene que entrar antes al negocio');

    rechazado('ni a alguien de otro negocio',
      await H.intentar(db, D.uid, () => db.query(
        "select public.guardar_profesional($1, 'Ajeno', 'comision', 50, $2)", [D.empresaId, ajeno])),
      'no es parte de este negocio');

    aceptado('un miembro del negocio sí',
      await H.intentar(db, D.uid, () => db.query(
        "select public.guardar_profesional($1, 'Barbero', 'comision', 50, $2)", [D.empresaId, barbero])));

    ok('y quedó en el equipo',
      (await db.query(
        'select count(*)::int n from public.turnos_profesional where empresa_id=$1 and activo',
        [D.empresaId])).rows[0].n, 1);

    // El dueño también puede cortar pelo: es miembro como cualquiera.
    aceptado('el dueño puede ser profesional de su propio local',
      await H.intentar(db, D.uid, () => db.query(
        "select public.guardar_profesional($1, 'El dueño', 'local', null, $2)", [D.empresaId, D.uid])));
  }

  // =====================================================================
  grupo('10 · Ahora las dos cuentas son la misma');
  // =====================================================================
  {
    // Lo que cierra el círculo: como el profesional tiene que ser miembro y
    // los miembros están topeados, no hay forma de tener más sillas en la
    // agenda que sillas pagadas. Antes eran dos números independientes.
    const E = await H.montarEmpresa(db, { email: 'dueno@dos.com', nombre: 'Dos Sillas' });
    await cobrar(E.empresaId, 'negocio', 1);
    ok('paga por un vendedor', await tope(db, E.empresaId), 2);

    const uno = await sumar(db, E.empresaId, 'uno@dos.com');
    aceptado('entra el primero', uno.res);
    rechazado('el segundo no entra', (await sumar(db, E.empresaId, 'dos@dos.com')).res,
      'ya tiene sus 2 personas');

    aceptado('el que entró puede ser profesional',
      await H.intentar(db, E.uid, () => db.query(
        "select public.guardar_profesional($1, 'Uno', 'comision', 40, $2)", [E.empresaId, uno.uid])));

    ok('el equipo no puede tener más gente que el negocio',
      (await db.query(
        `select (select count(*) from public.turnos_profesional where empresa_id=$1 and activo)
              <= (select count(*) from public.miembros where empresa_id=$1) as ok`,
        [E.empresaId])).rows[0].ok, true);
  }

  console.log(`\n${fallos === 0 ? '✓' : '✗'} ${corridas - fallos}/${corridas} pruebas`);
  await db.close();
  process.exit(fallos === 0 ? 0 : 1);
}

principal().catch((e) => { console.error(e); process.exit(1); });
