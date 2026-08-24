/**
 * Pruebas de los adjuntos (migración 007).
 *
 * Lo que se prueba acá es lo que alguien podría intentar desde la consola del
 * navegador llamando a Supabase directo, no lo que permite la interfaz:
 * colgarle un comprobante al movimiento de otra empresa, inventar una ruta
 * que apunte a la carpeta de otro, pasarse del tope, borrar lo que subió otro.
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

/**
 * Carga un gasto por la misma vía que la app: insert directo con RLS puesta.
 * `subtotal` va igual que `monto` porque la policy de la 002 lo exige — un
 * gasto no lleva descuento.
 */
async function gasto(db, empresaId, uid, monto = 50000) {
  let id;
  await H.comoUsuario(db, uid, async () => {
    const r = await db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
       values ($1, 'gasto', current_date, 'Combustible', 'Transporte', $2, $2) returning id`,
      [empresaId, monto]);
    id = r.rows[0].id;
  });
  return id;
}

const ruta = (empresa, movimiento, nombre = 'foto.webp') => `${empresa}/${movimiento}/${nombre}`;

(async () => {
  const db = await H.crearBase();

  const A = await H.montarEmpresa(db, { email: 'duenio@aurora.com', nombre: 'Aurora' });
  const B = await H.montarEmpresa(db, { email: 'duenio@boreal.com', nombre: 'Boreal' });
  const vendedorA = await H.sumarMiembro(db, A.empresaId, 'vendedor@aurora.com', 'vendedor');

  const movA = await gasto(db, A.empresaId, A.uid);
  const movB = await gasto(db, B.empresaId, B.uid);

  // ===================================================================
  grupo('1 · Adjuntar por la puerta oficial');
  // ===================================================================
  {
    const r = await H.intentar(db, A.uid, () =>
      db.query('select public.adjuntar($1, $2, $3, $4, $5, $6) id',
        [movA, 'foto', ruta(A.empresaId, movA), 'image/webp', 140000, 'Factura de combustible'])
        .then((x) => x.rows[0].id));
    aceptado('el dueño adjunta una foto a su movimiento', r);

    ok('quedó una fila',
      (await db.query('select count(*)::int n from public.adjuntos where movimiento_id=$1', [movA])).rows[0].n, 1);

    const audio = await H.intentar(db, A.uid, () =>
      db.query("select public.adjuntar($1,'audio',null,null,0,$2) id", [movA, 'vendí dos perfumes a 150 mil'])
        .then((x) => x.rows[0].id));
    aceptado('y una transcripción de audio', audio);

    ok('el audio NO guarda archivo',
      (await db.query("select ruta from public.adjuntos where movimiento_id=$1 and tipo='audio'", [movA])).rows[0].ruta,
      null);

    const lista = (await H.intentar(db, A.uid, () =>
      db.query('select public.adjuntos_de($1) a', [movA]).then((x) => x.rows[0].a))).valor;
    ok('adjuntos_de devuelve los dos', lista.length, 2);
    ok('y viene el texto del audio', lista.some((x) => x.texto.includes('perfumes')), true);
  }

  // ===================================================================
  grupo('2 · Lo que no se puede hacer');
  // ===================================================================
  {
    rechazado('adjuntar al movimiento de otra empresa',
      await H.intentar(db, A.uid, () =>
        db.query('select public.adjuntar($1,$2,$3,$4,$5,$6)',
          [movB, 'foto', ruta(B.empresaId, movB), 'image/webp', 1000, ''])),
      'no pertenecés');

    // El caso importante: ruta válida en forma, pero de OTRO movimiento de
    // la MISMA empresa. Si esto pasara, el comprobante de una venta quedaría
    // colgado de otra y el respaldo dejaría de servir para nada.
    const otro = await gasto(db, A.empresaId, A.uid, 12000);
    rechazado('ruta que apunta a otro movimiento de la misma empresa',
      await H.intentar(db, A.uid, () =>
        db.query('select public.adjuntar($1,$2,$3,$4,$5,$6)',
          [movA, 'foto', ruta(A.empresaId, otro), 'image/webp', 1000, ''])),
      'no corresponde a este movimiento');

    rechazado('ruta de la carpeta de otra empresa',
      await H.intentar(db, A.uid, () =>
        db.query('select public.adjuntar($1,$2,$3,$4,$5,$6)',
          [movA, 'foto', ruta(B.empresaId, movA), 'image/webp', 1000, ''])),
      'no corresponde a este movimiento');

    rechazado('una foto sin archivo',
      await H.intentar(db, A.uid, () =>
        db.query("select public.adjuntar($1,'foto',null,'image/webp',10,'')", [movA])),
      'falta la ruta');

    rechazado('un audio sin transcripción',
      await H.intentar(db, A.uid, () =>
        db.query("select public.adjuntar($1,'audio',null,null,0,'')", [movA])),
      'sin transcripción');

    rechazado('un tipo inventado',
      await H.intentar(db, A.uid, () =>
        db.query("select public.adjuntar($1,'video','x/y.mp4','video/mp4',10,'')", [movA])),
      'no reconocido');

    rechazado('una foto de 20 MB',
      await H.intentar(db, A.uid, () =>
        db.query('select public.adjuntar($1,$2,$3,$4,$5,$6)',
          [movA, 'foto', ruta(A.empresaId, movA, 'gorda.webp'), 'image/webp', 20 * 1024 * 1024, ''])),
      'pesa demasiado');

    rechazado('insertar directo en la tabla, salteando la función',
      await H.intentar(db, A.uid, () =>
        db.query(`insert into public.adjuntos (empresa_id, movimiento_id, tipo, ruta)
                  values ($1,$2,'foto','cualquier/cosa.webp')`, [A.empresaId, movA])),
      'denied|policy|permission');

    rechazado('leer los adjuntos de otra empresa',
      await H.intentar(db, A.uid, () => db.query('select public.adjuntos_de($1)', [movB])),
      'no pertenecés');

    const filasDeB = await H.intentar(db, A.uid, () =>
      db.query('select count(*)::int n from public.adjuntos where empresa_id=$1', [B.empresaId])
        .then((x) => x.rows[0].n));
    ok('un select directo tampoco los trae', filasDeB.valor, 0);
  }

  // ===================================================================
  grupo('3 · Tope por movimiento');
  // ===================================================================
  {
    const tope = (await db.query('select public.limite_adjuntos_movimiento() t')).rows[0].t;
    const libre = await gasto(db, A.empresaId, A.uid, 9000);

    for (let i = 0; i < tope; i++) {
      await H.comoUsuario(db, A.uid, () =>
        db.query('select public.adjuntar($1,$2,$3,$4,$5,$6)',
          [libre, 'foto', ruta(A.empresaId, libre, `f${i}.webp`), 'image/webp', 1000, '']));
    }
    ok(`entran ${tope} comprobantes`,
      (await db.query('select count(*)::int n from public.adjuntos where movimiento_id=$1', [libre])).rows[0].n, tope);

    rechazado('el que pasa el tope se rechaza',
      await H.intentar(db, A.uid, () =>
        db.query('select public.adjuntar($1,$2,$3,$4,$5,$6)',
          [libre, 'foto', ruta(A.empresaId, libre, 'extra.webp'), 'image/webp', 1000, ''])),
      'máximo');

    const cuenta = (await H.intentar(db, A.uid, () =>
      db.query('select public.conteo_adjuntos($1,$2) c', [A.empresaId, [libre, movA]])
        .then((x) => x.rows[0].c))).valor;
    ok('conteo_adjuntos cuenta bien', cuenta[libre], tope);
  }

  // ===================================================================
  grupo('4 · Borrar');
  // ===================================================================
  {
    const mov = await gasto(db, A.empresaId, A.uid, 7000);

    // Lo sube el vendedor.
    const id = (await H.intentar(db, vendedorA, () =>
      db.query('select public.adjuntar($1,$2,$3,$4,$5,$6) id',
        [mov, 'foto', ruta(A.empresaId, mov, 'del-vendedor.webp'), 'image/webp', 1000, ''])
        .then((x) => x.rows[0].id))).valor;

    // Y otro lo sube el dueño.
    const idDuenio = (await H.intentar(db, A.uid, () =>
      db.query('select public.adjuntar($1,$2,$3,$4,$5,$6) id',
        [mov, 'foto', ruta(A.empresaId, mov, 'del-duenio.webp'), 'image/webp', 1000, ''])
        .then((x) => x.rows[0].id))).valor;

    rechazado('el vendedor no borra lo que subió el dueño',
      await H.intentar(db, vendedorA, () => db.query('select public.borrar_adjunto($1)', [idDuenio])),
      'que subiste vos');

    aceptado('el vendedor sí borra lo suyo',
      await H.intentar(db, vendedorA, () => db.query('select public.borrar_adjunto($1)', [id])));

    aceptado('y el dueño puede borrar cualquiera',
      await H.intentar(db, A.uid, () => db.query('select public.borrar_adjunto($1)', [idDuenio])));

    ok('no quedó ninguno',
      (await db.query('select count(*)::int n from public.adjuntos where movimiento_id=$1', [mov])).rows[0].n, 0);

    rechazado('borrar directo con delete',
      await H.intentar(db, A.uid, () => db.query('delete from public.adjuntos where movimiento_id=$1', [movA])),
      'denied|policy|permission');
  }

  // ===================================================================
  grupo('5 · Un movimiento anulado no recibe más comprobantes');
  // ===================================================================
  {
    const mov = await gasto(db, A.empresaId, A.uid, 3000);
    await H.comoUsuario(db, A.uid, () =>
      db.query('select public.anular_movimiento($1, $2)', [mov, 'cargado por error']));

    rechazado('adjuntar a un movimiento anulado',
      await H.intentar(db, A.uid, () =>
        db.query('select public.adjuntar($1,$2,$3,$4,$5,$6)',
          [mov, 'foto', ruta(A.empresaId, mov), 'image/webp', 1000, ''])),
      'anulado');
  }

  // ===================================================================
  grupo('6 · Los adjuntos se van con su movimiento');
  // ===================================================================
  {
    const mov = await gasto(db, A.empresaId, A.uid, 4000);
    await H.comoUsuario(db, A.uid, () =>
      db.query('select public.adjuntar($1,$2,$3,$4,$5,$6)',
        [mov, 'foto', ruta(A.empresaId, mov, 'x.webp'), 'image/webp', 1000, '']));

    // Borrar la empresa tiene que arrastrar todo. Si quedaran adjuntos
    // huérfanos, quedarían archivos en Storage que nadie sabe de quién son.
    const C = await H.montarEmpresa(db, { email: 'temporal@c.com', nombre: 'Temporal' });
    const movC = await gasto(db, C.empresaId, C.uid, 1000);
    await H.comoUsuario(db, C.uid, () =>
      db.query('select public.adjuntar($1,$2,$3,$4,$5,$6)',
        [movC, 'foto', ruta(C.empresaId, movC, 'y.webp'), 'image/webp', 1000, '']));

    await db.query('delete from public.empresas where id=$1', [C.empresaId]);
    ok('borrada la empresa no quedan adjuntos huérfanos',
      (await db.query('select count(*)::int n from public.adjuntos where empresa_id=$1', [C.empresaId])).rows[0].n, 0);
  }

  console.log(`\n${'═'.repeat(62)}`);
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE ADJUNTOS FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE ADJUNTOS PASARON`);
})().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message);
  console.error(e);
  process.exit(1);
});
