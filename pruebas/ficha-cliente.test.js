/**
 * Pruebas de la migración 022: ficha del cliente, deshacer y borrar.
 *
 * Los tres salieron de usar el panel de verdad:
 *
 *   · se activó un plan por error sobre una cuenta en prueba y el periodo
 *     de prueba se perdió, sin forma de recuperarlo;
 *   · dos cuentas quedaron sin dueño —pasa al borrar un usuario desde
 *     Supabase— y no había manera de sacarlas de la lista;
 *   · había un botón para escribirle al cliente por WhatsApp y ningún lugar
 *     donde guardar su teléfono.
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

const suscripcion = (db, id) => db.query(
  'select plan, estado, periodo_fin from public.suscripciones where empresa_id=$1', [id])
  .then((r) => r.rows[0]);

(async () => {
  const db = await H.crearBase();

  const jefe = await H.crearUsuario(db, 'jefe@orden.app');
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe]);

  let empresaOrden;
  await H.comoUsuario(db, jefe, async () => {
    const r = await db.query('select public.crear_empresa($1,$2,$3) as id', ['Orden', 'PYG', 'Matías']);
    empresaOrden = r.rows[0].id;
  });
  await H.intentar(db, jefe, () => db.query('select public.definir_empresa_orden($1)', [empresaOrden]));

  const cliente = await H.montarEmpresa(db, { email: 'duenio@tienda.com', nombre: 'Perfumeria Zurik' });

  // ═══════════════════════════════════════════════════════════
  grupo('1 · La ficha del cliente');

  aceptado('se guarda',
    await H.intentar(db, jefe, () => db.query(
      'select public.guardar_ficha_cliente($1,$2,$3,$4,$5)',
      [cliente.empresaId, 'Sofía Vigorito', '595981234567', 'Perfumería y cosmética', 'Vino por un conocido.'])));

  const lista = (await H.intentar(db, jefe,
    () => db.query('select public.listar_cuentas() j'))).valor.rows[0].j;
  const fila = lista.find((f) => f.empresa_id === cliente.empresaId);

  ok('el contacto aparece en la lista', fila.contacto, 'Sofía Vigorito');
  ok('y el teléfono', fila.telefono, '595981234567');
  ok('y a qué se dedica', fila.se_dedica, 'Perfumería y cosmética');

  const porTelefono = (await H.intentar(db, jefe,
    () => db.query('select public.listar_cuentas($1) j', ['595981234567']))).valor.rows[0].j;
  ok('se puede buscar por teléfono', porTelefono.length, 1);

  rechazado('un cliente no lee su propia ficha',
    await H.intentar(db, cliente.uid,
      () => db.query('select count(*)::int n from public.ficha_cliente')
        .then((r) => { if (r.rows[0].n > 0) return r; throw new Error('sin filas'); })),
    'sin filas');

  rechazado('ni la escribe',
    await H.intentar(db, cliente.uid, () => db.query(
      'select public.guardar_ficha_cliente($1,$2)', [cliente.empresaId, 'Yo mismo'])),
    'administración de Orden');

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Cómo nos conoció lo contesta la persona');

  const uidX = await H.crearUsuario(db, 'nuevo@correo.com');
  let deTikTok;
  await H.comoUsuario(db, uidX, async () => {
    const r = await db.query(
      'select public.crear_empresa($1,$2,$3,$4,$5,$6,$7) as id',
      ['Kiosco', 'PYG', 'Ana', 'America/Asuncion', 'emprendedor', 'comercio', 'TikTok']);
    deTikTok = r.rows[0].id;
  });
  ok('queda guardado',
    (await db.query('select como_nos_conocio from public.empresas where id=$1', [deTikTok])).rows[0].como_nos_conocio,
    'TikTok');

  // ═══════════════════════════════════════════════════════════
  grupo('2b · El registro carga la ficha solo');

  // Migración 023: quien se registra contesta nombre, teléfono y a qué se
  // dedica ANTES del correo y la contraseña, y eso baja a la ficha sin que
  // nadie del lado de Orden tenga que preguntarlo por WhatsApp.
  const uidReg = await H.crearUsuario(db, 'registro@correo.com');
  let conFicha;
  await H.comoUsuario(db, uidReg, async () => {
    const r = await db.query(
      'select public.crear_empresa($1,$2,$3,$4,$5,$6,$7,$8,$9) as id',
      ['Taller Aranda', 'PYG', 'Matías Aranda', 'America/Asuncion', 'emprendedor',
        'servicios', 'ChatGPT', '0981 234-567', 'Taller mecánico']);
    conFicha = r.rows[0].id;
  });

  const nueva = (await H.intentar(db, jefe,
    () => db.query('select public.listar_cuentas() j'))).valor.rows[0].j
    .find((f) => f.empresa_id === conFicha);

  ok('el nombre y apellido queda de contacto', nueva.contacto, 'Matías Aranda');
  ok('el teléfono se guarda solo con dígitos', nueva.telefono, '0981234567');
  ok('y a qué se dedica', nueva.se_dedica, 'Taller mecánico');
  ok('junto con el canal', nueva.como_nos_conocio, 'ChatGPT');
  ok('y el rubro elegido', nueva.rubro, 'servicios');

  // Sin respuestas no se crea una fila de ficha: tres campos vacíos en la
  // lista de clientes no son un dato, son ruido.
  const uidMudo = await H.crearUsuario(db, 'mudo@correo.com');
  let sinFicha;
  await H.comoUsuario(db, uidMudo, async () => {
    const r = await db.query('select public.crear_empresa($1) as id', ['Anónima']);
    sinFicha = r.rows[0].id;
  });
  ok('sin datos no se crea ficha',
    (await db.query('select count(*)::int n from public.ficha_cliente where empresa_id=$1', [sinFicha])).rows[0].n,
    0);

  rechazado('quien se registra no puede escribir la ficha de otro',
    await H.intentar(db, uidReg, () => db.query(
      "insert into public.ficha_cliente (empresa_id, contacto) values ($1,'Yo')", [cliente.empresaId])),
    'denied|permission|policy|row-level');

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Deshacer una activación hecha por error');

  const antes = await suscripcion(db, cliente.empresaId);
  ok('arranca en prueba', antes.estado, 'prueba');

  // Se activa un plan por error: el periodo de prueba se reemplaza.
  const cobro = (await H.intentar(db, jefe, () => db.query(
    'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5) j',
    [cliente.empresaId, 'negocio', 1, 'me equivoqué', 250000]))).valor.rows[0].j;
  ok('quedó activa', cobro.estado, 'activa');
  ok('y con el ingreso anotado', cobro.ingreso_anotado, true);

  const durante = await suscripcion(db, cliente.empresaId);
  ok('la prueba se perdió', durante.estado, 'activa');

  const deshecho = (await H.intentar(db, jefe,
    () => db.query('select public.deshacer_ultimo_cambio($1) j', [cliente.empresaId]))).valor.rows[0].j;

  ok('vuelve a prueba', deshecho.estado, 'prueba');
  ok('con su plan de antes', deshecho.plan, 'pro');
  ok('y el ingreso se anuló', deshecho.ingreso_anulado, true);

  const despues = await suscripcion(db, cliente.empresaId);
  ok('la suscripción quedó como estaba', despues.estado, 'prueba');
  ok('con el vencimiento original',
    new Date(despues.periodo_fin).toISOString(), new Date(antes.periodo_fin).toISOString());

  // El ingreso NO se borra: se anula. La regla de siempre.
  const mov = (await db.query(
    "select estado, motivo_anulacion from public.movimientos where empresa_id=$1", [empresaOrden])).rows[0];
  ok('el movimiento sigue existiendo', mov.estado, 'anulado');
  ok('y dice por qué', /deshizo/i.test(mov.motivo_anulacion), true);

  // Y las finanzas de Orden ya no lo cuentan.
  const fin = (await H.intentar(db, jefe,
    () => db.query('select public.finanzas_orden() j'))).valor.rows[0].j;
  ok('el cobro no suma más', Number(fin.cobrado_mes), 0);

  rechazado('no se puede deshacer dos veces',
    await H.intentar(db, jefe, () => db.query('select public.deshacer_ultimo_cambio($1)', [cliente.empresaId])),
    'ya se deshizo');

  rechazado('un cliente no deshace nada',
    await H.intentar(db, cliente.uid, () => db.query('select public.deshacer_ultimo_cambio($1)', [cliente.empresaId])),
    'administración de Orden');

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Borrar una cuenta que quedó sin dueño');

  // Se reproduce el caso real: borrar el usuario desde afuera deja la
  // empresa viva y vacía.
  await db.query('delete from auth.users where id = $1', [uidX]);

  const huerfana = (await H.intentar(db, jefe,
    () => db.query('select public.listar_cuentas() j'))).valor.rows[0].j
    .find((f) => f.empresa_id === deTikTok);

  ok('la empresa sobrevivió', Boolean(huerfana), true);
  ok('sin nadie adentro', huerfana.miembros, 0);
  ok('y el panel avisa que quedó sin dueño', huerfana.sin_duenio, true);

  rechazado('sin el nombre exacto no se borra',
    await H.intentar(db, jefe, () => db.query('select public.borrar_cuenta($1,$2)', [deTikTok, 'kiosco'])),
    'nombre exacto');

  aceptado('con el nombre exacto sí',
    await H.intentar(db, jefe, () => db.query('select public.borrar_cuenta($1,$2)', [deTikTok, 'Kiosco'])));

  ok('ya no está',
    (await db.query('select count(*)::int n from public.empresas where id=$1', [deTikTok])).rows[0].n, 0);

  const registro = (await db.query(
    "select detalle from public.registro_admin where accion='borrar_cuenta'")).rows[0];
  ok('queda constancia de cuál era', registro.detalle.nombre, 'Kiosco');

  rechazado('un cliente no borra cuentas',
    await H.intentar(db, cliente.uid, () => db.query(
      'select public.borrar_cuenta($1,$2)', [cliente.empresaId, 'Perfumeria Zurik'])),
    'administración de Orden');

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE FICHA FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE FICHA PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
