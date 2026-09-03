/**
 * Cierre de permisos e información sensible.
 *
 * Todo corre contra PostgreSQL real con RLS y privilegios de columna activos.
 * Los roles se cambian de verdad (`set local role`), así que ninguna prueba
 * pasa "por ser superusuario".
 *
 * LÍMITE CONOCIDO DE ESTA SIMULACIÓN:
 * en Supabase hosted el rol `service_role` tiene el atributo BYPASSRLS; acá se
 * crea sin él. Es decir, este entorno es MÁS restrictivo que producción. Lo que
 * estas pruebas verifican de service_role es el privilegio EXECUTE (que es lo
 * que faltaba y se corrigió), no una réplica exacta de sus atributos. Un permiso
 * que funciona acá funciona en producción; la recíproca no está garantizada.
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
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 70)}`);
}

function aceptado(nombre, res) {
  corridas++;
  if (!res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      falló: ${res.error}`); return false; }
  console.log(`  ✓ ${nombre}`);
  return true;
}

// Desde la 006 estas funciones devuelven UNA fila con un array jsonb adentro
// (para que db-max-rows no pueda recortar un reporte). Hay que desenvolverlo.
const listarProductos = (db, empresa, pausados = false) =>
  db.query('select public.listar_productos($1, $2) as p', [empresa, pausados])
    .then((r) => r.rows[0]?.p ?? []);

const listarMovimientos = (db, empresa, desde, hasta) =>
  db.query('select public.listar_movimientos($1, $2, $3) as m', [empresa, desde, hasta])
    .then((r) => r.rows[0]?.m ?? []);

/** El plan ahora exige pertenencia: hay que preguntarlo como miembro. */
const planComo = (db, uid, empresa) =>
  H.intentarComo(db, 'authenticated', uid, () =>
    db.query('select public.plan_efectivo($1) p', [empresa]).then((r) => r.rows[0].p));

/** Cálculo interno, sin control de acceso: para verificar desde la prueba. */
const planInterno = (db, empresa) =>
  db.query('select public.plan_efectivo_calculado($1) p', [empresa]).then((r) => r.rows[0].p);

const vender = (db, empresa, items, extra = {}) =>
  db.query(
    `select public.registrar_venta($1, $2::jsonb, $3, '', 'efectivo', '', '', 'manual', $4) as id`,
    [empresa, JSON.stringify(items), extra.fecha ?? null, extra.descuento ?? 0],
  ).then((r) => r.rows[0].id);

async function principal() {
  const db = await H.crearBase();

  const A = await H.montarEmpresa(db, { email: 'dueno@a.com', nombre: 'Perfumería Aurora' });
  const adminA = await H.sumarMiembro(db, A.empresaId, 'admin@a.com', 'admin');
  const vendedorA = await H.sumarMiembro(db, A.empresaId, 'vendedor@a.com', 'vendedor');
  const B = await H.montarEmpresa(db, { email: 'dueno@b.com', nombre: 'Kiosco Beta' });
  const externo = await H.crearUsuario(db, 'nadie@ninguna.com');
  const hoy = (await db.query('select current_date::text d')).rows[0].d;

  // =====================================================================
  grupo('1 · Toda empresa nueva nace con su suscripción');
  // =====================================================================
  {
    const C = await H.montarEmpresa(db, { email: 'nueva@c.com', nombre: 'Negocio Nuevo' });

    ok('empresa creada',
      (await db.query('select count(*)::int n from public.empresas where id=$1', [C.empresaId])).rows[0].n, 1);
    ok('un solo miembro y es propietario',
      (await db.query("select rol from public.miembros where empresa_id=$1", [C.empresaId])).rows.map((r) => r.rol), ['propietario']);
    ok('tiene exactamente una suscripción',
      (await db.query('select count(*)::int n from public.suscripciones where empresa_id=$1', [C.empresaId])).rows[0].n, 1);

    // Desde la 009 la empresa nace en prueba de `pro`, no en gratis.
    // Desde la 016 el largo depende del tipo de cuenta: 20 días para un
    // comercio (que es lo que crea montarEmpresa) y 14 para una personal.
    const s = (await db.query('select plan, estado, prueba_fin from public.suscripciones where empresa_id=$1', [C.empresaId])).rows[0];
    ok('plan inicial', s.plan, 'pro');
    ok('estado inicial', s.estado, 'prueba');
    ok('la prueba tiene fecha de vencimiento', s.prueba_fin !== null, true);
    ok('y un comercio vence dentro de 20 días',
      (await db.query(
        `select round(extract(epoch from (prueba_fin - now())) / 86400)::int d
         from public.suscripciones where empresa_id=$1`, [C.empresaId])).rows[0].d, 20);
    ok('y su código de acceso',
      (await db.query('select count(*)::int n from public.empresa_accesos where empresa_id=$1', [C.empresaId])).rows[0].n, 1);
    ok('plan efectivo', await planInterno(db, C.empresaId), 'pro');
    ok('y el dueño lo puede consultar', (await planComo(db, C.uid, C.empresaId)).valor, 'pro');

    // Vencida la prueba, cae sola a gratis sin que nadie corra nada.
    await db.query(
      "update public.suscripciones set periodo_fin = now() - interval '1 day' where empresa_id=$1", [C.empresaId]);
    ok('prueba vencida → vuelve a gratis', await planInterno(db, C.empresaId), 'gratis');
    ok('y los datos siguen siendo suyos',
      (await db.query('select count(*)::int n from public.empresas where id=$1', [C.empresaId])).rows[0].n, 1);
    await db.query(
      "update public.suscripciones set periodo_fin = now() + interval '14 days' where empresa_id=$1", [C.empresaId]);

    // Atomicidad: si la creación falla, no queda nada a medias.
    const fallida = await H.intentar(db, C.uid, () => db.query("select public.crear_empresa('X', 'PYG', null)"));
    rechazado('nombre inválido rechaza la creación entera', fallida, 'muy corto');
    ok('no quedó ninguna empresa huérfana sin suscripción',
      (await db.query(`select count(*)::int n from public.empresas e
        where not exists (select 1 from public.suscripciones s where s.empresa_id = e.id)`)).rows[0].n, 0);
    ok('ni ninguna sin código de acceso',
      (await db.query(`select count(*)::int n from public.empresas e
        where not exists (select 1 from public.empresa_accesos a where a.empresa_id = e.id)`)).rows[0].n, 0);
  }

  // =====================================================================
  grupo('2 · service_role (rol real, no superusuario)');
  // =====================================================================
  {
    // Lo que sí se puede afirmar desde acá: el rol de la prueba no tiene
    // atajos. No es superusuario y no saltea RLS, así que si la llamada
    // funciona es por el GRANT EXECUTE, no por privilegios heredados.
    // (En Supabase hosted service_role además tiene BYPASSRLS; eso lo hace
    //  más permisivo allá, nunca menos. Ver la cabecera del archivo.)
    const rol = (await db.query("select rolsuper, rolbypassrls from pg_roles where rolname='service_role'")).rows[0];
    ok('el rol de prueba no es superusuario', rol.rolsuper, false);
    ok('ni tiene atajos de RLS (más estricto que producción)', rol.rolbypassrls, false);

    // La prueba central: sin el GRANT, esto falla; con él, funciona.
    const permiso = (await db.query(
      `select has_function_privilege('service_role',
         'public.aplicar_suscripcion(uuid,text,text,timestamptz,timestamptz,text,text,text,text,text,numeric)', 'EXECUTE') as p`)).rows[0].p;
    ok('service_role TIENE el privilegio EXECUTE', permiso, true);

    for (const otro of ['authenticated', 'anon', 'public']) {
      const p2 = (await db.query(
        `select has_function_privilege($1,
           'public.aplicar_suscripcion(uuid,text,text,timestamptz,timestamptz,text,text,text,text,text,numeric)', 'EXECUTE') as p`,
        [otro])).rows[0].p;
      ok(`${otro} NO tiene el privilegio EXECUTE`, p2, false);
    }

    rechazado('authenticated llama aplicar_suscripcion',
      await H.intentarComo(db, 'authenticated', A.uid, () =>
        db.query("select public.aplicar_suscripcion($1,'pro')", [A.empresaId])),
      'permission denied');

    rechazado('anon llama aplicar_suscripcion',
      await H.intentarComo(db, 'anon', null, () =>
        db.query("select public.aplicar_suscripcion($1,'pro')", [A.empresaId])),
      'permission denied');

    const conServicio = await H.intentarComo(db, 'service_role', null, () =>
      db.query("select public.aplicar_suscripcion($1,'pro','activa',now(),now()+interval '30 days','manual')", [A.empresaId]));
    aceptado('service_role SÍ puede aplicar la suscripción', conServicio);

    ok('la suscripción quedó en pro',
      (await db.query('select plan from public.suscripciones where empresa_id=$1', [A.empresaId])).rows[0].plan, 'pro');
    ok('y el espejo empresas.plan se actualizó',
      (await db.query('select plan from public.empresas where id=$1', [A.empresaId])).rows[0].plan, 'pro');
    ok('plan efectivo', await planInterno(db, A.empresaId), 'pro');

    // Bajar a gratis funciona...
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'gratis')", [A.empresaId]));
    ok('vuelve a gratis', await planInterno(db, A.empresaId), 'gratis');

    // ...pero desde la 018 gratis es CUENTA VENCIDA y no deja cargar nada.
    // Se la devolvemos a un plan que paga, o el resto de la suite no podría
    // ni crear un producto.
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'pro','activa')", [A.empresaId]));
  }

  // =====================================================================
  grupo('3 · El código de acceso no lo ve un vendedor');
  // =====================================================================
  {
    const leerCodigo = (uid) => H.intentarComo(db, 'authenticated', uid, async () =>
      (await db.query('select codigo from public.empresa_accesos where empresa_id=$1', [A.empresaId])).rows);

    const comoDueno = await leerCodigo(A.uid);
    ok('el propietario lo ve', comoDueno.ok && comoDueno.valor.length === 1, true);

    const comoAdmin = await leerCodigo(adminA);
    ok('un admin lo ve', comoAdmin.ok && comoAdmin.valor.length === 1, true);

    const comoVendedor = await leerCodigo(vendedorA);
    ok('un vendedor NO ve ninguna fila', comoVendedor.ok ? comoVendedor.valor.length : 'error', 0);

    const comoExterno = await leerCodigo(externo);
    ok('un externo tampoco', comoExterno.ok ? comoExterno.valor.length : 'error', 0);

    const otraEmpresa = await H.intentarComo(db, 'authenticated', A.uid, async () =>
      (await db.query('select codigo from public.empresa_accesos where empresa_id=$1', [B.empresaId])).rows);
    ok('nadie ve el código de otra empresa', otraEmpresa.ok ? otraEmpresa.valor.length : 'error', 0);

    // La columna vieja ya no existe: no hay forma de leerlo desde `empresas`.
    ok('empresas.codigo_acceso ya no existe',
      (await db.query(`select count(*)::int n from information_schema.columns
        where table_schema='public' and table_name='empresas' and column_name='codigo_acceso'`)).rows[0].n, 0);

    const conSelectTodo = await H.intentarComo(db, 'authenticated', vendedorA, async () =>
      (await db.query('select * from public.empresas where id=$1', [A.empresaId])).rows[0]);
    ok('un select * de empresas ya no trae ningún código',
      conSelectTodo.ok && !('codigo_acceso' in conSelectTodo.valor), true);

    // Pero unirse con el código sigue funcionando sin permiso de lectura.
    // La empresa va a `negocio` para este tramo: acá se prueba el mecanismo
    // del código, no el tope de personas del plan, que tiene su propio grupo.
    const codigo = await H.codigoDe(db, A.empresaId);
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'negocio')", [A.empresaId]));

    const nuevo = await H.crearUsuario(db, 'recien@llegado.com');
    const union = await H.intentarComo(db, 'authenticated', nuevo, () =>
      db.query('select public.unirse_empresa($1, $2) as id', [codigo, 'Recién llegado']));
    aceptado('unirse con el código sigue funcionando', union);
    ok('y entra como vendedor',
      (await db.query('select rol from public.miembros where empresa_id=$1 and user_id=$2', [A.empresaId, nuevo])).rows[0].rol,
      'vendedor');

    rechazado('un código inventado no sirve',
      await H.intentarComo(db, 'authenticated', externo, () =>
        db.query("select public.unirse_empresa('NOEXISTE', 'X')")),
      'no corresponde');

    // Limpiamos al recién llegado para no ensuciar el resto.
    await db.query('delete from public.miembros where user_id=$1', [nuevo]);
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'pro','activa')", [A.empresaId]));
  }

  // =====================================================================
  grupo('7 bis · El tope de personas lo pone el plan, no la interfaz');
  // =====================================================================
  {
    const codigo = await H.codigoDe(db, A.empresaId);
    const cuantos = (await db.query(
      'select count(*)::int n from public.miembros where empresa_id=$1', [A.empresaId])).rows[0].n;

    // A está en gratis y ya tiene más gente que la que gratis permite.
    ok('gratis permite una sola persona',
      (await db.query("select (public.limites_plan('gratis')->>'miembros')::int m")).rows[0].m, 1);
    ok('pro permite tres',
      (await db.query("select (public.limites_plan('pro')->>'miembros')::int m")).rows[0].m, 3);
    ok('negocio permite quince',
      (await db.query("select (public.limites_plan('negocio')->>'miembros')::int m")).rows[0].m, 15);

    const cuarto = await H.crearUsuario(db, 'cuarto@aurora.com');
    rechazado('en gratis no entra nadie más',
      await H.intentarComo(db, 'authenticated', cuarto, () =>
        db.query('select public.unirse_empresa($1,$2)', [codigo, 'Cuarto'])),
      'máximo|plan');

    // Lo importante: el tope NO es retroactivo. Bajar de plan no puede
    // echar a la gente que ya estaba trabajando adentro.
    ok('los que ya estaban siguen adentro',
      (await db.query('select count(*)::int n from public.miembros where empresa_id=$1', [A.empresaId])).rows[0].n,
      cuantos);

    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'negocio')", [A.empresaId]));
    aceptado('con el plan negocio sí entra',
      await H.intentarComo(db, 'authenticated', cuarto, () =>
        db.query('select public.unirse_empresa($1,$2)', [codigo, 'Cuarto'])));

    await db.query('delete from public.miembros where user_id=$1', [cuarto]);
    // A pro, no a gratis: gratis ahora es cuenta vencida y bloquea escrituras.
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'pro','activa')", [A.empresaId]));
  }

  // =====================================================================
  grupo('4 · El costo de los productos no llega al vendedor');
  // =====================================================================
  {
    const p = await H.crearProducto(db, A.empresaId, A.uid, {
      nombre: 'Perfume Élite', costo: 100, precio: 150, stock: 10,
    });

    rechazado('consulta SQL directa a productos.costo',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select costo from public.productos where id=$1', [p])),
      'permission denied');

    rechazado('select * sobre productos (expande a costo)',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select * from public.productos where id=$1', [p])),
      'permission denied');

    rechazado('intento disimulado: costo dentro de un cálculo',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select precio - costo as margen from public.productos where id=$1', [p])),
      'permission denied');

    rechazado('intento disimulado: ordenar por costo',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select id from public.productos order by costo limit 1')),
      'permission denied');

    rechazado('intento disimulado: filtrar por costo',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select id from public.productos where costo > 0')),
      'permission denied');

    rechazado('agregación sobre costo',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select sum(costo) from public.productos')),
      'permission denied');

    // Lo que SÍ necesita para trabajar.
    const operativo = await H.intentarComo(db, 'authenticated', vendedorA, () =>
      db.query('select nombre, precio, stock from public.productos where id=$1', [p]).then((r) => r.rows[0]));
    aceptado('el vendedor sí puede ver nombre, precio y stock', operativo);
    ok('precio visible', Number(operativo.valor.precio), 150);
    ok('stock visible', Number(operativo.valor.stock), 10);

    // Y por la puerta oficial: el costo viene en null.
    const porRpcVendedor = await H.intentarComo(db, 'authenticated', vendedorA, () => listarProductos(db, A.empresaId));
    const elProducto = porRpcVendedor.valor.find((x) => x.id === p);
    ok('listar_productos le da el producto', elProducto.nombre, 'Perfume Élite');
    ok('con el precio', Number(elProducto.precio), 150);
    ok('pero el costo viene vacío', elProducto.costo, null);

    const porRpcAdmin = await H.intentarComo(db, 'authenticated', adminA, () => listarProductos(db, A.empresaId));
    ok('a un admin sí le da el costo', Number(porRpcAdmin.valor.find((x) => x.id === p).costo), 100);

    const porRpcDueno = await H.intentarComo(db, 'authenticated', A.uid, () => listarProductos(db, A.empresaId));
    ok('al propietario también', Number(porRpcDueno.valor.find((x) => x.id === p).costo), 100);

    rechazado('un externo no puede llamar listar_productos',
      await H.intentarComo(db, 'authenticated', externo, () => listarProductos(db, A.empresaId)),
      'No pertenecés');
  }

  // =====================================================================
  grupo('5 · El vendedor vende, pero no conoce la rentabilidad');
  // =====================================================================
  {
    const p = await H.crearProducto(db, A.empresaId, A.uid, {
      nombre: 'Reloj', costo: 100, precio: 150, stock: 10,
    });

    const venta = await H.intentarComo(db, 'authenticated', vendedorA, () =>
      vender(db, A.empresaId, [{ producto_id: p, cantidad: 1 }]));
    aceptado('el vendedor registra la venta', venta);
    ok('y el stock se movió', await H.stockDe(db, p), 9);

    // La base guardó el costo real aunque el vendedor no lo conozca.
    ok('internamente el costo quedó bien',
      Number((await db.query('select costo_total from public.movimientos where id=$1', [venta.valor])).rows[0].costo_total), 100);

    rechazado('el vendedor consulta movimientos.costo_total',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select costo_total from public.movimientos where id=$1', [venta.valor])),
      'permission denied');

    rechazado('el vendedor consulta movimiento_items.costo_unitario',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select costo_unitario from public.movimiento_items where movimiento_id=$1', [venta.valor])),
      'permission denied');

    rechazado('el vendedor calcula la ganancia a mano',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select sum(monto - costo_total) from public.movimientos where empresa_id=$1', [A.empresaId])),
      'permission denied');

    rechazado('select * sobre movimientos',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select * from public.movimientos where empresa_id=$1', [A.empresaId])),
      'permission denied');

    rechazado('select * sobre movimiento_items',
      await H.intentarComo(db, 'authenticated', vendedorA, () =>
        db.query('select * from public.movimiento_items where empresa_id=$1', [A.empresaId])),
      'permission denied');

    // Lo operativo sigue disponible.
    const operativo = await H.intentarComo(db, 'authenticated', vendedorA, () =>
      db.query('select monto, fecha, descripcion from public.movimientos where id=$1', [venta.valor]).then((r) => r.rows[0]));
    aceptado('el vendedor ve monto, fecha y descripción', operativo);
    ok('monto visible', Number(operativo.valor.monto), 150);

    // Y por la puerta oficial.
    const movVendedor = await H.intentarComo(db, 'authenticated', vendedorA, () =>
      listarMovimientos(db, A.empresaId, hoy, hoy));
    const mv = movVendedor.valor.find((x) => x.id === venta.valor);
    ok('listar_movimientos le da el movimiento', Number(mv.monto), 150);
    ok('sin costo total', mv.costo_total, null);
    ok('y sin costo por línea', mv.movimiento_items[0].costo_unitario, null);
    ok('pero con el detalle de productos', mv.movimiento_items[0].nombre, 'Reloj');

    const movAdmin = await H.intentarComo(db, 'authenticated', adminA, () =>
      listarMovimientos(db, A.empresaId, hoy, hoy));
    const mvA = movAdmin.valor.find((x) => x.id === venta.valor);
    ok('el admin sí recibe el costo total', Number(mvA.costo_total), 100);
    ok('y el costo por línea', Number(mvA.movimiento_items[0].costo_unitario), 100);
    ok('así puede calcular la ganancia', Number(mvA.monto) - Number(mvA.costo_total), 50);
  }

  // =====================================================================
  grupo('6 · Plan efectivo');
  // =====================================================================
  {
    const casos = [
      ['gratis', 'activa',    null,        'gratis', 'gratis + activa'],
      ['pro',    'activa',    null,        'pro',    'pro + activa sin vencimiento'],
      ['pro',    'activa',    '+30 days',  'pro',    'pro + activa vigente'],
      ['pro',    'prueba',    '+7 days',   'pro',    'pro + prueba vigente'],
      ['pro',    'prueba',    '-1 days',   'gratis', 'pro + prueba expirada'],
      ['pro',    'vencida',   '+30 days',  'gratis', 'pro + vencida (aunque el periodo siga)'],
      ['pro',    'vencida',   null,        'gratis', 'pro + vencida sin periodo'],
      ['pro',    'cancelada', '+15 days',  'pro',    'pro + cancelada con periodo pagado por delante'],
      ['pro',    'cancelada', '-1 days',   'gratis', 'pro + cancelada con periodo terminado'],
      ['pro',    'cancelada', null,        'gratis', 'pro + cancelada sin periodo'],
      ['pro',    'activa',    '-1 days',   'gratis', 'pro + activa pero periodo vencido'],
    ];

    for (const [plan, estado, fin, esperado, nombre] of casos) {
      await H.comoServicio(db, () => db.query(
        `select public.aplicar_suscripcion($1, $2, $3, null, ${fin ? `now() + interval '${fin}'` : 'null'})`,
        [B.empresaId, plan, estado]));
      ok(nombre, await planInterno(db, B.empresaId), esperado);
    }

    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'pro','activa')", [B.empresaId]));
    const proB = await H.intentarComo(db, 'authenticated', B.uid, () =>
      db.query('select public.empresa_es_pro($1) e', [B.empresaId]).then((r) => r.rows[0].e));
    ok('empresa_es_pro coincide', proB.valor, true);
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'gratis')", [B.empresaId]));
    const gratisB = await H.intentarComo(db, 'authenticated', B.uid, () =>
      db.query('select public.empresa_es_pro($1) e', [B.empresaId]).then((r) => r.rows[0].e));
    ok('y también cuando es gratis', gratisB.valor, false);
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'pro','activa')", [B.empresaId]));

    // Una empresa sin fila de suscripción no puede colarse como pro.
    const huerfana = (await db.query(
      `insert into public.empresas (nombre, moneda, creada_por) values ('Sin suscripción','PYG',$1) returning id`,
      [A.uid])).rows[0].id;
    ok('sin suscripción → gratis', await planInterno(db, huerfana), 'gratis');
    await db.query('delete from public.empresas where id=$1', [huerfana]);

    // Y el espejo sigue sin poder tocarse desde el cliente.
    // Con un valor DISTINTO al que ya tiene: si se escribe el mismo, no hay
    // cambio que frenar y la prueba pasaría sin probar nada.
    rechazado('un admin no puede tocar empresas.plan',
      await H.intentarComo(db, 'authenticated', adminA, () =>
        db.query("update public.empresas set plan='gratis' where id=$1", [A.empresaId])),
      'sistema de suscripciones');
  }

  // =====================================================================
  grupo('6b · El plan de otra empresa no se filtra');
  // =====================================================================
  {
    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'pro','activa')", [B.empresaId]));

    rechazado('un usuario de A pregunta el plan de B',
      await H.intentarComo(db, 'authenticated', A.uid, () =>
        db.query('select public.plan_efectivo($1)', [B.empresaId])),
      'No pertenecés');

    rechazado('y con empresa_es_pro tampoco',
      await H.intentarComo(db, 'authenticated', A.uid, () =>
        db.query('select public.empresa_es_pro($1)', [B.empresaId])),
      'No pertenecés');

    rechazado('un usuario sin empresa tampoco',
      await H.intentarComo(db, 'authenticated', externo, () =>
        db.query('select public.plan_efectivo($1)', [B.empresaId])),
      'No pertenecés');

    rechazado('sin sesión tampoco',
      await H.intentarComo(db, 'authenticated', null, () =>
        db.query('select public.plan_efectivo($1)', [B.empresaId])),
      'iniciar sesión');

    ok('el dueño de B sí lo ve', (await planComo(db, B.uid, B.empresaId)).valor, 'pro');

    // Y el cálculo interno no está al alcance de nadie con sesión.
    for (const rol of ['authenticated', 'anon']) {
      const priv = (await db.query(
        "select has_function_privilege($1, 'public.plan_efectivo_calculado(uuid)', 'EXECUTE') as p", [rol])).rows[0].p;
      ok(`${rol} no puede llamar al cálculo interno`, priv, false);
    }

    await H.comoServicio(db, () => db.query("select public.aplicar_suscripcion($1,'pro','activa')", [B.empresaId]));
  }

  // =====================================================================
  grupo('6c · listar_movimientos no trunca en silencio');
  // =====================================================================
  {
    const C = await H.montarEmpresa(db, { email: 'volumen@d.com', nombre: 'Mucho Volumen' });
    const tope = 20000;

    // Cargamos movimientos directamente para no depender de la RPC de venta.
    await db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, creado_por)
       select $1, 'gasto', current_date, 'Carga masiva', 'Otros', 1000, 1000, $2
       from generate_series(1, $3)`,
      [C.empresaId, C.uid, tope]);

    const enElLimite = await H.intentarComo(db, 'authenticated', C.uid, () =>
      listarMovimientos(db, C.empresaId, '2000-01-01', hoy));
    aceptado('justo en el tope devuelve todo', enElLimite);
    ok('y son exactamente los que hay', enElLimite.valor.length, tope);

    // Una fila más y ya no entra: tiene que FALLAR, no recortar.
    await db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, creado_por)
       values ($1, 'gasto', current_date, 'La que sobra', 'Otros', 1000, 1000, $2)`,
      [C.empresaId, C.uid]);

    const pasado = await H.intentarComo(db, 'authenticated', C.uid, () =>
      listarMovimientos(db, C.empresaId, '2000-01-01', hoy));
    rechazado('pasado el tope NO devuelve totales incompletos', pasado, 'rango más corto');
    ok('y el mensaje dice cuántos hay', /20001/.test(pasado.error), true);

    // El negocio sigue pudiendo trabajar con un rango que sí entra.
    const acotado = await H.intentarComo(db, 'authenticated', C.uid, () =>
      listarMovimientos(db, C.empresaId, '2000-01-01', '2000-01-02'));
    aceptado('con un rango más corto vuelve a funcionar', acotado);
    ok('y ahí no hay nada', acotado.valor.length, 0);

    await db.query('delete from public.empresas where id=$1', [C.empresaId]);
  }

  // =====================================================================
  grupo('7 · El admin sigue viendo todo lo que necesita');
  // =====================================================================
  {
    const productos = await H.intentarComo(db, 'authenticated', adminA, () => listarProductos(db, A.empresaId, true));
    aceptado('el admin lista productos', productos);
    ok('todos con costo', productos.valor.every((p) => p.costo !== null), true);

    const movs = await H.intentarComo(db, 'authenticated', adminA, () =>
      listarMovimientos(db, A.empresaId, '2000-01-01', hoy));
    aceptado('el admin lista movimientos', movs);
    const ventas = movs.valor.filter((m) => m.tipo === 'venta' && m.estado === 'activo');
    ok('todas las ventas traen costo', ventas.every((m) => m.costo_total !== null), true);
    ok('y sus líneas también', ventas.every((m) => m.movimiento_items.every((i) => i.costo_unitario !== null)), true);

    const datos = await H.intentarComo(db, 'authenticated', adminA, () =>
      db.query('select public.datos_empresa($1) d', [A.empresaId]).then((r) => r.rows[0].d));
    ok('datos_empresa le da el código al admin', typeof datos.valor.codigo_acceso, 'string');
    ok('y el plan efectivo', datos.valor.plan_efectivo, 'pro');

    const datosVendedor = await H.intentarComo(db, 'authenticated', vendedorA, () =>
      db.query('select public.datos_empresa($1) d', [A.empresaId]).then((r) => r.rows[0].d));
    ok('al vendedor NO le da el código', datosVendedor.valor.codigo_acceso, null);
    ok('pero sí el nombre del negocio', datosVendedor.valor.nombre, 'Perfumería Aurora');

    rechazado('un externo no puede pedir datos_empresa',
      await H.intentarComo(db, 'authenticated', externo, () =>
        db.query('select public.datos_empresa($1)', [A.empresaId])),
      'No pertenecés');
  }

  // =====================================================================
  grupo('8 · Aislamiento entre empresas sigue firme');
  // =====================================================================
  {
    rechazado('A no puede listar movimientos de B',
      await H.intentarComo(db, 'authenticated', A.uid, () => listarMovimientos(db, B.empresaId, hoy, hoy)),
      'No pertenecés');
    rechazado('A no puede listar productos de B',
      await H.intentarComo(db, 'authenticated', A.uid, () => listarProductos(db, B.empresaId)),
      'No pertenecés');
    rechazado('rango de fechas inválido',
      await H.intentarComo(db, 'authenticated', A.uid, () => listarMovimientos(db, A.empresaId, hoy, '2020-01-01')),
      'rango de fechas');
    rechazado('sin sesión no se lista nada',
      await H.intentarComo(db, 'authenticated', null, () => listarProductos(db, A.empresaId)),
      'iniciar sesión');
  }

  // =====================================================================
  grupo('12 · `anon` no puede ejecutar nada que escriba');
  // =====================================================================
  {
    // PostgreSQL otorga EXECUTE sobre toda función nueva al pseudo-rol
    // PUBLIC, y `anon` —el rol de quien NO inició sesión— lo hereda de ahí.
    // Si una migración futura crea una función y se olvida de revocarle a
    // PUBLIC, esa función queda expuesta en internet sin que nadie lo note.
    //
    // Las funciones igual se defienden solas (`if auth.uid() is null then
    // raise`), pero esa defensa está a una línea de distancia de que alguien
    // la borre editando el cuerpo. El permiso es la segunda pared.
    // Esta lista se agranda a mano y con motivo. Cada nombre acá es una
    // puerta a internet, y agregar uno sin pensarlo es exactamente el error
    // que esta comprobación existe para evitar.
    const permitidasParaAnon = [
      // La pantalla de planes muestra los precios antes de registrarse.
      'lista_precios',

      // LA PÁGINA PÚBLICA DE RESERVAS (migración 038). Un cliente sin cuenta
      // tiene que poder ver los horarios libres y tomar uno. Son cuatro, y
      // cada una devuelve lo mínimo:
      //
      //   · `agenda_publica`     el negocio, quiénes atienden y qué servicios.
      //   · `huecos_publicos`    horarios libres. NUNCA de quién son los tomados.
      //   · `reservar_publico`   la única que escribe, con freno de abuso.
      //   · `reserva_por_token`  la reserva propia, con el enlace que guardó.
      //   · `cancelar_reserva`   cancelar con ese mismo enlace.
      //
      // Lo que estas funciones pueden y no pueden ver se comprueba una por
      // una en pruebas/publico.test.js.
      'agenda_publica',
      'huecos_publicos',
      'reservar_publico',
      'reserva_por_token',
      'cancelar_reserva',
    ];

    const expuestas = (await db.query(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and has_function_privilege('anon', p.oid, 'EXECUTE')
      order by 1
    `)).rows.map((r) => r.proname);

    const inesperadas = expuestas.filter((f) => !permitidasParaAnon.includes(f));
    ok('ninguna función SECURITY DEFINER de más está abierta a anon', inesperadas, []);
    ok('y la lista de precios sí lo está, a propósito',
      expuestas.includes('lista_precios'), true);

    // Y aunque la llame, no escribe: la guarda interna sigue estando.
    rechazado('anon llamando a registrar_venta',
      await H.intentarComo(db, 'anon', null, () =>
        db.query("select public.registrar_venta($1, '[]'::jsonb)", [A.empresaId])),
      'permission denied|iniciar sesión');

    // Ninguna función nueva debería quedar sin search_path fijo: sin él, el
    // esquema que resuelve cada nombre depende de quién la llame.
    const sinRuta = (await db.query(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prosecdef
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
        )
      order by 1
    `)).rows.map((r) => r.proname);
    ok('toda función SECURITY DEFINER tiene search_path fijo', sinRuta, []);
  }

  console.log(`\n${'═'.repeat(62)}`);
  console.log(fallos === 0
    ? `>>> ${corridas} COMPROBACIONES DE PERMISOS PASARON`
    : `>>> ${fallos} DE ${corridas} COMPROBACIONES FALLARON`);
  process.exit(fallos ? 1 : 0);
}

principal().catch((e) => {
  console.error('\nERROR INESPERADO:', e.message ?? e);
  console.error(e.stack);
  process.exit(1);
});
