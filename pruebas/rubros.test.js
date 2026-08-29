/**
 * Pruebas de los rubros (migración 021).
 *
 * Lo que importa:
 *
 *   · que cada rubro traiga SUS categorías, porque sugerirle «Publicidad» a
 *     un ganadero hace que el gasto termine en el casillero equivocado y
 *     después los reportes mientan;
 *   · que el recordatorio de la noche NO le llegue a quien no cierra el día
 *     — un «no cargaste nada hoy» todas las noches, cuando no había nada que
 *     cargar, es la forma más rápida de que alguien apague los avisos;
 *   · que cambiar de rubro no borre absolutamente nada;
 *   · que el rubro sea cosmético para los permisos: no puede darle ni
 *     quitarle acceso a nadie.
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

const crear = async (db, uid, nombre, rubro) => {
  let id;
  await H.comoUsuario(db, uid, async () => {
    const r = await db.query('select public.crear_empresa($1,$2,$3,$4,$5,$6) as id',
      [nombre, 'PYG', 'Dueño', 'America/Asuncion', 'emprendedor', rubro]);
    id = r.rows[0].id;
  });
  return id;
};

(async () => {
  const db = await H.crearBase();

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Cada empresa nace con su rubro');

  const viejo = await H.montarEmpresa(db, { email: 'viejo@tienda.com', nombre: 'Almacén' });
  ok('lo que ya existía es comercio',
    (await db.query('select rubro from public.empresas where id=$1', [viejo.empresaId])).rows[0].rubro,
    'comercio');

  const uidG = await H.crearUsuario(db, 'ganadero@campo.com');
  const campo = await crear(db, uidG, 'Estancia San Juan', 'ganaderia');
  ok('un ganadero elige el suyo',
    (await db.query('select rubro from public.empresas where id=$1', [campo])).rows[0].rubro,
    'ganaderia');

  const uidA = await H.crearUsuario(db, 'agri@campo.com');
  const chacra = await crear(db, uidA, 'Chacra', 'agricultura');

  // Un rubro inventado no rompe: cae en comercio.
  const uidX = await H.crearUsuario(db, 'raro@x.com');
  const raro = await crear(db, uidX, 'Rara', 'mineria-espacial');
  ok('un rubro inventado cae en comercio',
    (await db.query('select rubro from public.empresas where id=$1', [raro])).rows[0].rubro,
    'comercio');

  // Una cuenta personal no tiene rubro de negocio.
  const uidP = await H.crearUsuario(db, 'ana@correo.com');
  let personal;
  await H.comoUsuario(db, uidP, async () => {
    const r = await db.query('select public.crear_empresa($1,$2,$3,$4,$5,$6) as id',
      ['Mis finanzas', 'PYG', 'Ana', 'America/Asuncion', 'personal', 'ganaderia']);
    personal = r.rows[0].id;
  });
  ok('una cuenta personal se fuerza a comercio',
    (await db.query('select rubro from public.empresas where id=$1', [personal])).rows[0].rubro,
    'comercio');

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Cada rubro trae sus categorías');

  // Ahora cada categoría es {nombre, pistas}: el nombre solo no alcanzaba
  // para que el modelo clasificara bien.
  const cats = async (rubro) =>
    (await db.query('select public.categorias_de_rubro($1) c', [rubro])).rows[0].c.map((x) => x.nombre);

  ok('el ganadero ve Sanidad', (await cats('ganaderia')).includes('Sanidad'), true);
  ok('y NO ve Publicidad', (await cats('ganaderia')).includes('Publicidad'), false);
  ok('el agricultor ve Fertilizante', (await cats('agricultura')).includes('Fertilizante'), true);
  ok('el taller ve Repuestos', (await cats('servicios')).includes('Repuestos'), true);
  ok('el comercio ve Mercadería', (await cats('comercio')).includes('Mercadería'), true);
  ok('un rubro nulo no rompe', Array.isArray(await cats(null)), true);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Quién cierra el día');

  const cierra = async (r) =>
    (await db.query('select public.rubro_cierra_el_dia($1) c', [r])).rows[0].c;

  ok('el comercio sí', await cierra('comercio'), true);
  ok('el taller también', await cierra('servicios'), true);
  ok('el ganadero NO', await cierra('ganaderia'), false);
  ok('el agricultor tampoco', await cierra('agricultura'), false);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · El recordatorio de la noche respeta el rubro');

  // Los tres cargan tres días seguidos terminando AYER: los tres califican
  // por racha. Lo único que los separa es el rubro.
  for (const [id, uid] of [[viejo.empresaId, viejo.uid], [campo, uidG], [chacra, uidA]]) {
    for (const d of [3, 2, 1]) {
      await H.comoUsuario(db, uid, () => db.query(
        `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, creado_por)
         values ($1, 'gasto', public.hoy_empresa($1) - $2::int, 'Gasto', 'Varios', 10000, 10000, $3)`,
        [id, d, uid]));
    }
  }

  const aviso = (await H.comoServicio(db, () =>
    db.query('select public.empresas_sin_cargar_hoy(2) j'))).rows[0].j;
  const nombres = aviso.map((x) => x.nombre).sort();

  ok('al almacén se le avisa', nombres.includes('Almacén'), true);
  ok('al ganadero NO', nombres.includes('Estancia San Juan'), false);
  ok('al agricultor tampoco', nombres.includes('Chacra'), false);

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Cambiar de rubro no borra nada');

  const antes = (await db.query(
    'select count(*)::int n from public.movimientos where empresa_id=$1', [campo])).rows[0].n;

  await H.intentar(db, uidG, () => db.query('select public.cambiar_rubro($1,$2)', [campo, 'agricultura']));
  ok('ahora es agricultura',
    (await db.query('select rubro from public.empresas where id=$1', [campo])).rows[0].rubro,
    'agricultura');
  ok('y sus movimientos siguen ahí',
    (await db.query('select count(*)::int n from public.movimientos where empresa_id=$1', [campo])).rows[0].n,
    antes);

  rechazado('un rubro inventado se rechaza',
    await H.intentar(db, uidG, () => db.query('select public.cambiar_rubro($1,$2)', [campo, 'vip'])),
    'desconocido');

  const vendedor = await H.sumarMiembro(db, viejo.empresaId, 'vendedor@tienda.com', 'vendedor');
  rechazado('un vendedor no cambia el rubro',
    await H.intentar(db, vendedor, () => db.query('select public.cambiar_rubro($1,$2)', [viejo.empresaId, 'ganaderia'])),
    'propietario o un administrador');

  rechazado('ni un ajeno',
    await H.intentar(db, uidG, () => db.query('select public.cambiar_rubro($1,$2)', [viejo.empresaId, 'ganaderia'])),
    'propietario o un administrador');

  // ═══════════════════════════════════════════════════════════
  grupo('6 · El rubro no da ni quita permisos');

  // Es lo más importante de este archivo. El rubro cambia palabras y
  // pantallas; si además moviera un permiso, sería una puerta lateral.
  rechazado('cambiar de rubro no deja ver la empresa de otro',
    await H.intentar(db, uidG, () =>
      db.query('select count(*)::int n from public.movimientos where empresa_id=$1', [viejo.empresaId])
        .then((r) => { if (r.rows[0].n > 0) return r; throw new Error('sin filas: no ve nada'); })),
    'sin filas');

  ok('el vendedor sigue sin ver costos',
    (await H.intentar(db, vendedor, () =>
      db.query('select costo from public.productos limit 1'))).ok, false);

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE RUBROS FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE RUBROS PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
