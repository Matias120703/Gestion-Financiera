/**
 * Socios y comisiones (migración 060).
 *
 * LA REGLA QUE SE PRUEBA ACÁ ES «UNA SOLA VEZ»
 *
 * La comisión es el 50% del PRIMER pago del cliente que alguien trajo, y nada
 * más. Si eso se afloja en algún borde —dos cobros, un cambio de plan, un
 * negocio anotado dos veces— Orden termina pagando dos, tres veces por el
 * mismo cliente y nadie se da cuenta hasta que no cierran las cuentas.
 *
 * Por eso «una sola vez» no vive en el código que cobra: vive en el índice
 * único de `comisiones` sobre `empresa_id`. Y lo que se prueba acá es
 * justamente eso, golpeando la misma empresa varias veces.
 *
 * LO OTRO QUE SE PRUEBA ES «SOLO SI ENTRÓ PLATA»
 *
 * Activar una cuenta no es cobrar. Un plan gratis, un importe en cero o un
 * ingreso que no se pudo anotar no generan comisión, porque no hay de dónde
 * pagarla. Y si el cobro se anula después, la comisión que estaba por pagar
 * se cae sola: nadie tiene que acordarse de ir a revisarla.
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

async function principal() {
  const db = await H.crearBase();

  const jefe = await H.crearUsuario(db, 'jefe@orden.com');
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe]);

  const comoJefe = (fn) => H.intentar(db, jefe, fn);
  const valor = (res) => (res.ok ? res.valor : { error: res.error });

  // La empresa de Orden: acá se anotan los cobros y los pagos de comisiones.
  const rOrden = await comoJefe(() =>
    db.query('select public.crear_empresa($1,$2,$3) id', ['Orden', 'PYG', 'Matías'])
      .then((r) => r.rows[0].id));
  const ORDEN = rOrden.valor;
  await comoJefe(() => db.query('select public.definir_empresa_orden($1)', [ORDEN]));

  const guardarSocio = (p = {}) => comoJefe(() => db.query(
    'select public.guardar_socio($1::uuid,$2,$3,$4,$5,$6,$7::boolean) j',
    [p.id ?? null, p.nombre ?? '', p.telefono ?? '', p.email ?? '',
      p.cobra_en ?? '', p.notas ?? '', p.activo ?? true],
  ).then((r) => r.rows[0].j));

  const anotar = (empresa, codigo, nota = '') => comoJefe(() => db.query(
    'select public.asignar_referido($1,$2,$3) j', [empresa, codigo, nota],
  ).then((r) => r.rows[0].j));

  const cobrar = (empresa, plan, importe) => comoJefe(() => db.query(
    'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5::numeric,$6::integer) j',
    [empresa, plan, 1, 'cobrado por transferencia', importe, null],
  ).then((r) => r.rows[0].j));

  const pagar = (comision, monto = null, medio = 'transferencia', nota = '') => comoJefe(() =>
    db.query('select public.marcar_comision_pagada($1,$2::numeric,$3,$4) j',
      [comision, monto, medio, nota]).then((r) => r.rows[0].j));

  // Lectura directa, como superusuario: para comprobar el dato, no el permiso.
  const comisionDe = (empresa) => db.query(
    `select id, monto, base, porcentaje, estado, nota, gasto_id, movimiento_id
       from public.comisiones where empresa_id = $1`,
    [empresa],
  ).then((r) => r.rows[0] ?? null);

  const cuantasComisiones = () => db.query('select count(*)::int n from public.comisiones')
    .then((r) => r.rows[0].n);

  const ingresoDe = (empresa) => db.query(
    `select mv.id from public.movimientos mv
      join public.comisiones c on c.movimiento_id = mv.id
     where c.empresa_id = $1`, [empresa]).then((r) => r.rows[0]?.id ?? null);

  // =====================================================================
  grupo('1 · Dar de alta un socio');
  // =====================================================================
  {
    const A = await H.montarEmpresa(db, { email: 'ajeno@cliente.com', nombre: 'Un cliente' });

    rechazado('un cliente no puede crear socios',
      await H.intentar(db, A.uid, () => db.query(
        'select public.guardar_socio(null::uuid, $1,$2,$3,$4,$5,true)',
        ['Colado', '', '', '', ''])),
      'administración de Orden');

    rechazado('sin nombre no se guarda', await guardarSocio({ nombre: '  ' }), 'Falta el nombre');

    const r = await guardarSocio({
      nombre: 'Lucas Vera', telefono: '0981222333', email: 'LUCAS@gmail.com',
      cobra_en: 'Banco Itaú 123456', notas: 'Es peluquero, conoce a todos',
    });
    aceptado('se crea el socio', r);
    ok('le tocó un código de 8', r.valor.codigo.length, 8);
    ok('en mayúsculas', r.valor.codigo, r.valor.codigo.toUpperCase());

    const fila = await db.query('select nombre, email, activo from public.socios where id=$1',
      [r.valor.id]).then((x) => x.rows[0]);
    ok('el mail se guarda en minúsculas', fila.email, 'lucas@gmail.com');
    ok('arranca activo', fila.activo, true);

    // Editar no puede cambiarle el código: puede estar escrito en un WhatsApp
    // que mandó hace dos meses.
    const edit = await guardarSocio({ id: r.valor.id, nombre: 'Lucas Vera', telefono: '0981999888' });
    ok('editarlo no le cambia el código', edit.valor.codigo, r.valor.codigo);

    rechazado('no se edita un socio que no existe',
      await guardarSocio({ id: '00000000-0000-0000-0000-000000000000', nombre: 'Fantasma' }),
      'no existe');
  }

  // =====================================================================
  grupo('2 · Anotar quién trajo a un negocio');
  // =====================================================================
  const S1 = (await guardarSocio({ nombre: 'Sofía Benítez', cobra_en: 'Tigo Money 0981000111' })).valor;
  const S2 = (await guardarSocio({ nombre: 'Ramón Díaz' })).valor;
  const A = await H.montarEmpresa(db, { email: 'dueno@barberia.com', nombre: 'Barbería Central' });
  const B = await H.montarEmpresa(db, { email: 'dueno@kiosco.com', nombre: 'Kiosco 24' });
  {
    rechazado('un código inventado no anota nada',
      await anotar(A.empresaId, 'NOEXISTE'), 'ningún socio con ese código');

    rechazado('un negocio que no existe tampoco',
      await anotar('00000000-0000-0000-0000-000000000000', S1.codigo), 'no existe');

    const r = await anotar(A.empresaId, S1.codigo.toLowerCase(), 'lo trajo por WhatsApp');
    aceptado('anotarlo funciona, y el código no distingue mayúsculas', r);
    ok('dice de quién es', r.valor.socio, 'Sofía Benítez');
    ok('sin aviso: el negocio no había pagado nunca', r.valor.aviso, null);

    const otra = await anotar(A.empresaId, S1.codigo);
    ok('anotarlo de nuevo no rompe ni duplica', otra.valor.aviso,
      'Ya estaba anotado a nombre de Sofía Benítez.');
    ok('y sigue habiendo un solo referido',
      await db.query('select count(*)::int n from public.referidos').then((r2) => r2.rows[0].n), 1);

    rechazado('otro no puede reclamar el mismo negocio',
      await anotar(A.empresaId, S2.codigo), 'ya está anotado a nombre de Sofía Benítez');

    // Nadie se trae a sí mismo: es la forma más fácil de cobrarse el 50% del
    // propio plan.
    const propio = await guardarSocio({ nombre: 'El dueño del kiosco', email: 'dueno@kiosco.com' });
    ok('el socio quedó vinculado a su usuario',
      await db.query('select user_id is not null v from public.socios where id=$1',
        [propio.valor.id]).then((r2) => r2.rows[0].v), true);
    rechazado('no puede traerse a sí mismo',
      await anotar(B.empresaId, propio.valor.codigo), 'traerse a uno mismo');

    const dormido = await guardarSocio({ nombre: 'Se fue', activo: false });
    rechazado('un socio desactivado no recibe negocios nuevos',
      await anotar(B.empresaId, dormido.valor.codigo), 'desactivado');
  }

  // =====================================================================
  grupo('3 · La comisión nace cuando entra la plata');
  // =====================================================================
  {
    const gratis = await cobrar(A.empresaId, 'gratis', null);
    ok('un plan gratis no genera comisión', gratis.valor.comision_generada, false);

    const cero = await cobrar(A.empresaId, 'negocio', 0);
    ok('un importe en cero tampoco', cero.valor.comision_generada, false);
    ok('todavía no hay ninguna comisión', await cuantasComisiones(), 0);

    const pago = await cobrar(A.empresaId, 'negocio', 190000);
    ok('cobrarle de verdad sí la genera', pago.valor.comision_generada, true);

    const c = await comisionDe(A.empresaId);
    ok('la base es lo que pagó', Number(c.base), 190000);
    ok('el porcentaje es 50', Number(c.porcentaje), 50);
    ok('y el monto la mitad', Number(c.monto), 95000);
    ok('queda por pagar', c.estado, 'por_pagar');

    // Acá está el corazón: el segundo mes no se paga de nuevo.
    const segundo = await cobrar(A.empresaId, 'negocio', 190000);
    ok('el segundo pago del mismo negocio no genera otra', segundo.valor.comision_generada, false);
    const tercero = await cobrar(A.empresaId, 'negocio', 250000);
    ok('ni subirlo de plan', tercero.valor.comision_generada, false);
    ok('sigue habiendo una sola comisión', await cuantasComisiones(), 1);
    ok('y sigue valiendo lo del primer pago', Number((await comisionDe(A.empresaId)).monto), 95000);

    const sinSocio = await cobrar(B.empresaId, 'negocio', 60000);
    ok('un negocio que nadie trajo no genera comisión', sinSocio.valor.comision_generada, false);
    ok('y el cobro se anotó igual', sinSocio.valor.ingreso_anotado, true);
  }

  // =====================================================================
  grupo('4 · Anotarlo tarde no inventa comisiones viejas');
  // =====================================================================
  {
    // B ya pagó antes de que alguien lo reclame. El primer pago ya pasó: se
    // avisa, porque el monto de lo que venga hay que mirarlo a mano.
    const r = await anotar(B.empresaId, S2.codigo);
    aceptado('se puede anotar igual', r);
    ok('pero avisa que ya había pagado', /ya pagó 1 vez/.test(r.valor.aviso ?? ''), true);
    ok('no se generó ninguna comisión retroactiva', await comisionDe(B.empresaId), null);
  }

  // =====================================================================
  grupo('5 · El porcentaje se decide una vez y no vuelve atrás');
  // =====================================================================
  const C = await H.montarEmpresa(db, { email: 'dueno@taller.com', nombre: 'Taller Díaz' });
  {
    await db.query('update public.ajustes_orden set comision_porcentaje = 30 where unica');
    await anotar(C.empresaId, S1.codigo);
    await cobrar(C.empresaId, 'negocio', 100000);

    const c = await comisionDe(C.empresaId);
    ok('la comisión nueva usa el porcentaje nuevo', Number(c.porcentaje), 30);
    ok('y el monto sale de ahí', Number(c.monto), 30000);
    ok('la vieja no se toca', Number((await comisionDe(A.empresaId)).porcentaje), 50);

    await db.query('update public.ajustes_orden set comision_porcentaje = 50 where unica');

    // Ni siquiera con la mano en la base: un cero dejaría comisiones en cero
    // sin que nadie lo note.
    let porCero = 'pasó';
    try {
      await db.query('update public.ajustes_orden set comision_porcentaje = 0 where unica');
    } catch (e) { porCero = e.message; }
    ok('el porcentaje no puede ser cero', /comision_rango/.test(porCero), true);
  }

  // =====================================================================
  grupo('6 · Pagarla');
  // =====================================================================
  {
    const c = await comisionDe(A.empresaId);

    rechazado('un cliente no puede marcar nada como pagado',
      await H.intentar(db, A.uid, () => db.query(
        'select public.marcar_comision_pagada($1,null::numeric,$2,$3)', [c.id, '', ''])),
      'administración de Orden');

    const r = await pagar(c.id, null, 'transferencia', 'pagado el 5');
    aceptado('el jefe sí', r);
    ok('sin ajustar el monto', r.valor.ajustado, false);
    ok('se anotó el gasto', r.valor.gasto_anotado, true);
    ok('sin avisos', r.valor.aviso, null);

    const fila = await comisionDe(A.empresaId);
    ok('queda pagada', fila.estado, 'pagada');
    ok('con el gasto pegado', fila.gasto_id !== null, true);

    const gasto = await db.query(
      'select tipo, monto, categoria, descripcion, empresa_id from public.movimientos where id=$1',
      [fila.gasto_id]).then((x) => x.rows[0]);
    ok('el pago es un gasto de Orden', [gasto.tipo, gasto.empresa_id === ORDEN], ['gasto', true]);
    ok('por el monto de la comisión', Number(gasto.monto), 95000);
    ok('en su categoría', gasto.categoria, 'Comisiones');
    ok('con el nombre de quien lo trajo', gasto.descripcion, 'Comisión a Sofía Benítez');

    rechazado('no se paga dos veces', await pagar(c.id), 'ya está pagada');

    // El monto se puede ajustar al pagar: si alguien pagó un año adelantado,
    // la mitad de ese pago es mucha plata.
    const cc = await comisionDe(C.empresaId);
    const ajustada = await pagar(cc.id, 20000, 'efectivo', 'acordamos 20 mil');
    ok('se puede pagar menos, a mano', Number(ajustada.valor.monto), 20000);
    ok('y queda marcado que se ajustó', ajustada.valor.ajustado, true);
    ok('el monto guardado es el que se pagó', Number((await comisionDe(C.empresaId)).monto), 20000);
  }

  // =====================================================================
  grupo('7 · Si el cobro se deshace, la comisión también');
  // =====================================================================
  const D = await H.montarEmpresa(db, { email: 'dueno@vivero.com', nombre: 'Vivero Sur' });
  {
    await anotar(D.empresaId, S2.codigo);
    await cobrar(D.empresaId, 'negocio', 190000);
    ok('nació por pagar', (await comisionDe(D.empresaId)).estado, 'por_pagar');

    const mov = await ingresoDe(D.empresaId);
    aceptado('se anula el ingreso que la generó',
      await comoJefe(() => db.query('select public.anular_movimiento($1,$2)',
        [mov, 'el cliente se arrepintió'])));

    const c = await comisionDe(D.empresaId);
    ok('la comisión se cayó sola', c.estado, 'anulada');
    ok('y dice por qué', /Se anuló el cobro/.test(c.nota), true);

    rechazado('una comisión anulada no se paga', await pagar(c.id), 'está anulada');

    // Y el negocio sigue anotado: no se le genera otra comisión al mes que viene.
    const otra = await cobrar(D.empresaId, 'negocio', 190000);
    ok('un cobro nuevo no resucita ni duplica la comisión',
      otra.valor.comision_generada, false);
    ok('sigue anulada', (await comisionDe(D.empresaId)).estado, 'anulada');
  }

  // =====================================================================
  grupo('8 · Anularla a mano, y desanotar un error');
  // =====================================================================
  const E = await H.montarEmpresa(db, { email: 'dueno@lavadero.com', nombre: 'Lavadero Norte' });
  {
    const anular = (id, nota) => comoJefe(() => db.query(
      'select public.anular_comision($1,$2) j', [id, nota]).then((r) => r.rows[0].j));

    await anotar(E.empresaId, S1.codigo);
    await cobrar(E.empresaId, 'negocio', 60000);
    const c = await comisionDe(E.empresaId);

    rechazado('no se puede desanotar un negocio con comisión por pagar',
      await comoJefe(() => db.query('select public.quitar_referido($1)', [E.empresaId])),
      'Anulala primero');

    aceptado('se anula a mano, con motivo', await anular(c.id, 'el referido era falso'));
    ok('queda anulada', (await comisionDe(E.empresaId)).estado, 'anulada');
    ok('con el motivo escrito', (await comisionDe(E.empresaId)).nota, 'el referido era falso');

    aceptado('ahora sí se puede desanotar',
      await comoJefe(() => db.query('select public.quitar_referido($1)', [E.empresaId])));
    ok('el negocio quedó sin socio',
      await db.query('select count(*)::int n from public.referidos where empresa_id=$1',
        [E.empresaId]).then((r) => r.rows[0].n), 0);

    const pagada = await comisionDe(A.empresaId);
    rechazado('una comisión ya pagada no se anula', await anular(pagada.id, 'me arrepentí'),
      'ya se pagó');
    rechazado('ni se desanota su negocio',
      await comoJefe(() => db.query('select public.quitar_referido($1)', [A.empresaId])),
      'Ya se pagó');
    rechazado('desanotar dos veces no hace nada',
      await comoJefe(() => db.query('select public.quitar_referido($1)', [E.empresaId])),
      'no está anotado');
  }

  // =====================================================================
  grupo('9 · Las listas del panel');
  // =====================================================================
  {
    const socios = await comoJefe(() => db.query('select public.listar_socios($1,$2) j', [null, 200])
      .then((r) => r.rows[0].j));
    aceptado('el jefe ve la lista de socios', socios);
    const sofia = socios.valor.find((s) => s.nombre === 'Sofía Benítez');
    ok('cuenta a cuántos trajo', sofia.traidos, 2);
    ok('cuánto se le pagó ya', Number(sofia.pagado), 115000);
    ok('y dónde cobra', sofia.cobra_en, 'Tigo Money 0981000111');

    const porCodigo = await comoJefe(() => db.query('select public.listar_socios($1,$2) j',
      [S2.codigo, 200]).then((r) => r.rows[0].j));
    ok('se busca por código', porCodigo.valor.map((s) => s.nombre), ['Ramón Díaz']);

    const comisiones = await comoJefe(() => db.query(
      'select public.listar_comisiones($1::text,$2::uuid,$3::integer) j', [null, null, 200])
      .then((r) => r.rows[0].j));
    aceptado('el jefe ve la lista de comisiones', comisiones);
    ok('están todas las comisiones', comisiones.valor.length, await cuantasComisiones());
    ok('con el nombre del negocio y de quien lo trajo',
      comisiones.valor.every((c) => c.negocio && c.socio), true);

    const anuladas = await comoJefe(() => db.query(
      'select public.listar_comisiones($1,$2::uuid,$3) j', ['anulada', null, 200])
      .then((r) => r.rows[0].j));
    ok('se filtran por estado', anuladas.valor.every((c) => c.estado === 'anulada'), true);
    ok('y avisa cuál se cayó por un cobro anulado',
      anuladas.valor.some((c) => c.ingreso_anulado), true);

    const referidos = await comoJefe(() => db.query('select public.listar_referidos($1::integer) j',
      [500]).then((r) => r.rows[0].j));
    aceptado('y quién trajo a cada negocio', referidos);
    const barberia = referidos.valor.find((r) => r.empresa_id === A.empresaId);
    ok('con el socio y su código', [barberia.socio, barberia.codigo === S1.codigo],
      ['Sofía Benítez', true]);
    ok('y el estado de la comisión de ese negocio', barberia.comision, 'pagada');
    ok('el negocio desanotado ya no está',
      referidos.valor.some((r) => r.empresa_id === E.empresaId), false);

    rechazado('un cliente no ve la lista de socios',
      await H.intentar(db, A.uid, () => db.query('select public.listar_socios(null,200)')),
      'administración de Orden');
    rechazado('ni la de comisiones',
      await H.intentar(db, A.uid, () => db.query('select public.listar_comisiones(null,null,200)')),
      'administración de Orden');
  }

  // =====================================================================
  grupo('10 · Nadie toca las tablas directo');
  // =====================================================================
  {
    for (const tabla of ['socios', 'referidos', 'comisiones']) {
      rechazado(`un cliente no lee ${tabla}`,
        await H.intentar(db, A.uid, () => db.query(`select * from public.${tabla}`)),
        'permission denied|denegado');
      rechazado(`ni escribe en ${tabla}`,
        await H.intentar(db, A.uid, () => db.query(`delete from public.${tabla}`)),
        'permission denied|denegado');
      rechazado(`anon tampoco lee ${tabla}`,
        await H.intentarComo(db, 'anon', null, () => db.query(`select * from public.${tabla}`)),
        'permission denied|denegado');
    }
  }

  // =====================================================================
  grupo('11 · Recomendar Orden desde adentro (061)');
  // =====================================================================
  {
    const miCodigo = (uid) => H.intentar(db, uid, () =>
      db.query('select public.mi_codigo_socio() j').then((r) => r.rows[0].j));
    const miPanel = (uid) => H.intentar(db, uid, () =>
      db.query('select public.mi_panel_socio() j').then((r) => r.rows[0].j));
    const usar = (uid, empresa, codigo) => H.intentar(db, uid, () =>
      db.query('select public.usar_codigo_referido($1,$2) j', [empresa, codigo])
        .then((r) => r.rows[0].j));

    // El dueño de la barbería nunca pidió nada: no tiene código todavía.
    ok('sin pedirlo, no hay código', (await miPanel(A.uid)).valor.tiene_codigo, false);

    const pedido = await miCodigo(A.uid);
    aceptado('cualquiera con cuenta puede pedir el suyo', pedido);
    ok('con 8 caracteres', pedido.valor.codigo.length, 8);
    ok('y con su nombre del negocio', pedido.valor.nombre, 'Dueño');
    ok('pedirlo dos veces da el mismo', (await miCodigo(A.uid)).valor.codigo, pedido.valor.codigo);

    // El mismo humano cargado a mano y registrado después es uno solo.
    const antes = await db.query('select count(*)::int n from public.socios').then((r) => r.rows[0].n);
    const aMano = await guardarSocio({ nombre: 'Todavía sin cuenta', email: 'futuro@correo.com' });
    const futuro = await H.crearUsuario(db, 'futuro@correo.com');
    const suyo = await miCodigo(futuro);
    ok('el socio cargado a mano y el que se registra son el mismo',
      suyo.valor.codigo, aMano.valor.codigo);
    ok('y no quedan dos socios para la misma persona',
      await db.query('select count(*)::int n from public.socios').then((r) => r.rows[0].n), antes + 1);

    // Dónde cobra lo escribe él, no la administración.
    // Los cuatro datos que pide cualquier transferencia (064). Antes era una
    // sola línea de texto y había que adivinar qué parte era el banco.
    const dondeCobra = (uid, banco, titular, cuenta, doc) => H.intentar(db, uid, () =>
      db.query('select public.guardar_donde_cobro($1,$2,$3,$4)', [banco, titular, cuenta, doc]));

    rechazado('sin código no se puede decir dónde cobra',
      await dondeCobra(C.uid, 'Itaú', 'Ana', '123', '1234567'),
      'Todavía no pediste');
    aceptado('con código sí',
      await dondeCobra(A.uid, 'Banco Familiar', 'Matías Aranda', '0984158986', '4.123.456'));

    const conDatos = (await miPanel(A.uid)).valor;
    ok('quedan los cuatro datos separados',
      [conDatos.banco, conDatos.titular, conDatos.cuenta, conDatos.documento],
      ['Banco Familiar', 'Matías Aranda', '0984158986', '4.123.456']);
    ok('y la línea de un vistazo se arma sola', conDatos.cobra_en, 'Banco Familiar · 0984158986');

    // El camino del link: alguien se registra con el código de otro.
    const F = await H.montarEmpresa(db, { email: 'dueno@panaderia.com', nombre: 'Panadería del Sur' });
    rechazado('un código inventado se rechaza con un mensaje claro',
      await usar(F.uid, F.empresaId, 'NADA1234'), 'Ese código no existe');
    rechazado('y el propio, también', await usar(F.uid, F.empresaId, (await miCodigo(F.uid)).valor.codigo),
      'tu propio código');

    aceptado('entra con el código de quien lo trajo', await usar(F.uid, F.empresaId, S1.codigo));
    ok('queda anotado como que vino por el link',
      await db.query('select origen from public.referidos where empresa_id=$1', [F.empresaId])
        .then((r) => r.rows[0].origen), 'link');
    rechazado('y no puede cambiarlo por otro después',
      await usar(F.uid, F.empresaId, S2.codigo), 'ya entró con otro código');

    const cobro = await cobrar(F.empresaId, 'negocio', 60000);
    ok('cuando paga, la comisión sale sola', cobro.valor.comision_generada, true);
    ok('y es del que lo trajo', Number((await comisionDe(F.empresaId)).monto), 30000);

    // Un vendedor del negocio no decide a nombre de quién queda la cuenta.
    const G = await H.montarEmpresa(db, { email: 'dueno@ferreteria.com', nombre: 'Ferretería Paraná' });
    const empleado = await H.sumarMiembro(db, G.empresaId, 'empleado@ferreteria.com', 'vendedor');
    rechazado('un empleado no puede usar un código',
      await usar(empleado, G.empresaId, S1.codigo), 'Solo el dueño');

    // El código es para cuentas nuevas.
    await db.query(`update public.empresas set created_at = now() - interval '40 days' where id = $1`,
      [G.empresaId]);
    rechazado('una cuenta de hace más de un mes ya no sirve',
      await usar(G.uid, G.empresaId, S1.codigo), 'cuentas nuevas');

    // Ni para clientes que ya estaban pagando.
    const Hh = await H.montarEmpresa(db, { email: 'dueno@heladeria.com', nombre: 'Heladería Luna' });
    await cobrar(Hh.empresaId, 'negocio', 190000);
    rechazado('un cliente que ya pagó no se puede reclamar',
      await usar(Hh.uid, Hh.empresaId, S1.codigo), 'ya pagó');

    // Lo que ve el socio en su panel, y lo que NO ve.
    const panelSofia = await H.intentar(db, futuro, () => db.query('select public.mi_panel_socio() j')
      .then((r) => r.rows[0].j));
    ok('quien no trajo a nadie ve su lista vacía', panelSofia.valor.referidos, []);

    const duenoF = await miPanel(F.uid);
    ok('el traído no aparece como socio de nadie', duenoF.valor.referidos, []);

    const campos = (await comoJefe(() => db.query('select public.mi_panel_socio() j')
      .then((r) => r.rows[0].j)));
    ok('el panel propio no se cae para quien no es socio', campos.valor.tiene_codigo, false);

    // Y el administrador ve en qué se suscribió cada referido.
    const refs = await comoJefe(() => db.query('select public.listar_referidos($1::integer) j', [500])
      .then((r) => r.rows[0].j));
    const pana = refs.valor.find((r) => r.empresa_id === F.empresaId);
    ok('la lista del panel dice el plan del referido', [pana.plan, pana.paga], ['negocio', true]);
    ok('y por dónde entró', pana.origen, 'link');
  }

  // =====================================================================
  grupo('12 · Pedirlo en el momento (062)');
  // =====================================================================
  {
    const momento = (uid, empresa) => H.intentar(db, uid, () =>
      db.query('select public.momento_de_recomendar($1) j', [empresa]).then((r) => r.rows[0].j));
    const pedir = async (uid, empresa) => (await momento(uid, empresa)).valor.pedir;

    // Un negocio que usa Orden de verdad: viejo, pagando y con movimientos.
    const I = await H.montarEmpresa(db, { email: 'dueno@carniceria.com', nombre: 'Carnicería Don José' });
    await db.query(`update public.empresas set created_at = now() - interval '60 days' where id=$1`,
      [I.empresaId]);
    await cobrar(I.empresaId, 'negocio', 190000);

    const cargar = async (cuantos) => {
      for (let i = 0; i < cuantos; i++) {
        await H.intentar(db, I.uid, () => db.query(
          `insert into public.movimientos (empresa_id, tipo, estado, fecha, descripcion, categoria,
             subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
           values ($1, 'ingreso', 'activo', public.hoy_empresa($1), 'Venta', 'General',
             50000, 0, 50000, 0, 'efectivo', $2)`, [I.empresaId, I.uid]));
      }
    };

    await cargar(14);
    ok('con pocos movimientos todavía no se le pide', await pedir(I.uid, I.empresaId), false);

    await cargar(1);
    ok('con la cuenta usada de verdad, sí', await pedir(I.uid, I.empresaId), true);

    // Una cuenta recién creada no: pedirle que recomiende sería pedirle que
    // invente una opinión que no tiene.
    const J = await H.montarEmpresa(db, { email: 'dueno@nuevo.com', nombre: 'Recién Abierto' });
    ok('a uno de esta semana no se le pide', await pedir(J.uid, J.empresaId), false);

    // Ni a uno con la cuenta vencida: es el peor momento para pedir un favor.
    await db.query(`update public.empresas set created_at = now() - interval '60 days' where id=$1`,
      [J.empresaId]);
    await db.query(`update public.suscripciones set plan='gratis', estado='vencida',
      periodo_fin = now() - interval '5 days' where empresa_id=$1`, [J.empresaId]);
    ok('a uno con la cuenta vencida, tampoco', await pedir(J.uid, J.empresaId), false);

    // Y nadie pregunta por un negocio ajeno.
    ok('ni se contesta por un negocio de otro', await pedir(B.uid, I.empresaId), false);

    // «Ahora no» dura 30 días.
    aceptado('dice que ahora no',
      await H.intentar(db, I.uid, () => db.query('select public.posponer_recomendacion()')));
    ok('y no se le vuelve a ofrecer', await pedir(I.uid, I.empresaId), false);

    await db.query(`update public.preferencias
      set recomendar_pedido_at = now() - interval '31 days' where user_id = $1`, [I.uid]);
    ok('al mes siguiente, sí', await pedir(I.uid, I.empresaId), true);

    // Al que ya tiene su código no se le pide más: ya está adentro.
    await H.intentar(db, I.uid, () => db.query('select public.mi_codigo_socio()'));
    ok('al que ya tiene su código no se le pide', await pedir(I.uid, I.empresaId), false);

    // ---- La novedad: «Fulano pagó su primer mes» ----
    const nueva = (uid) => H.intentar(db, uid, () =>
      db.query('select public.novedad_comisiones() j').then((r) => r.rows[0].j));

    ok('sin comisiones nuevas no hay aviso', (await nueva(I.uid)).valor.hay, false);
    ok('y quien no es socio tampoco recibe nada', (await nueva(C.uid)).valor.hay, false);

    // Sofía trajo cuatro negocios a lo largo de la prueba; nunca miró.
    const sofiaUid = await H.crearUsuario(db, 'sofia@correo.com');
    await db.query('update public.socios set user_id = $1 where nombre = $2', [sofiaUid, 'Sofía Benítez']);

    const avisoSofia = await nueva(sofiaUid);
    ok('a quien le pagaron, sí', avisoSofia.valor.hay, true);
    ok('con cuántos y cuánto', Number(avisoSofia.valor.total) > 0, true);

    aceptado('lo marca como visto',
      await H.intentar(db, sofiaUid, () => db.query('select public.marcar_comisiones_vistas()')));
    ok('y el aviso no vuelve', (await nueva(sofiaUid)).valor.hay, false);

    // Una comisión que nace anulada no promete nada que después haya que
    // desdecir.
    const K = await H.montarEmpresa(db, { email: 'dueno@vidrieria.com', nombre: 'Vidriería Central' });
    await anotar(K.empresaId, S1.codigo);
    await cobrar(K.empresaId, 'negocio', 100000);
    ok('una comisión nueva vuelve a avisar', (await nueva(sofiaUid)).valor.hay, true);

    const cK = await comisionDe(K.empresaId);
    await comoJefe(() => db.query('select public.anular_comision($1,$2)', [cK.id, 'no llegó']));
    ok('pero si se anula, el aviso se va', (await nueva(sofiaUid)).valor.hay, false);
  }

  // =====================================================================
  grupo('13 · La comisión no cuelga de la contabilidad (063)');
  // =====================================================================
  {
    // El incidente que obligó a la 063, tal como pasó: la empresa que
    // representaba a Orden estaba borrada, así que el cobro no se pudo anotar
    // en ningún lado. El socio había traído a un cliente que pagó de verdad y
    // se quedó sin nada por un problema de contabilidad ajeno a él.
    await db.query('update public.ajustes_orden set empresa_id = null where unica');

    const L = await H.montarEmpresa(db, { email: 'dueno@rotiseria.com', nombre: 'Rotisería del Centro' });
    await anotar(L.empresaId, S1.codigo);
    const cobro = await cobrar(L.empresaId, 'negocio', 190000);

    ok('sin empresa de Orden, el ingreso no se anota', cobro.valor.ingreso_anotado, false);
    ok('y se avisa por qué', /empresa de Orden/.test(cobro.valor.aviso ?? ''), true);
    ok('pero la comisión se genera igual', cobro.valor.comision_generada, true);

    const c = await comisionDe(L.empresaId);
    ok('con su monto completo', Number(c.monto), 95000);
    ok('y sin movimiento que la respalde, que es justo lo que pasó',
      c.movimiento_id, null);

    ok('sigue siendo una sola por negocio',
      (await cobrar(L.empresaId, 'negocio', 190000)).valor.comision_generada, false);

    // Y «este ya pagó» también se mide por el importe: que la contabilidad
    // haya fallado no convierte a un cliente viejo en uno nuevo.
    const M = await H.montarEmpresa(db, { email: 'dueno@bazar.com', nombre: 'Bazar Luz' });
    await cobrar(M.empresaId, 'negocio', 60000);
    rechazado('un cliente que ya pagó no se reclama, aunque el asiento haya fallado',
      await H.intentar(db, M.uid, () => db.query(
        'select public.usar_codigo_referido($1,$2)', [M.empresaId, S1.codigo])),
      'ya pagó');

    await db.query('update public.ajustes_orden set empresa_id = $1 where unica', [ORDEN]);
  }

  // =====================================================================
  grupo('14 · El socio pide su cobro (066)');
  // =====================================================================
  {
    // Antes de esto la comisión quedaba en «te deben» esperando a que alguien
    // de administración se acordara de mirar el panel. El socio no tenía
    // botón y nosotros no teníamos aviso.
    const pedir = (uid) => H.intentar(db, uid, () =>
      db.query('select public.solicitar_cobro() j').then((r) => r.rows[0].j));
    const panelDe = (uid) => H.intentar(db, uid, () =>
      db.query('select public.mi_panel_socio() j').then((r) => r.rows[0].j));

    const pedroUid = await H.crearUsuario(db, 'pedro@correo.com');
    const P = (await guardarSocio({ nombre: 'Pedro Cañete', email: 'pedro@correo.com' })).valor;
    await db.query('update public.socios set user_id = $1 where id = $2', [pedroUid, P.id]);

    // Sin nada por cobrar no hay pedido: un botón de cobrar en cero es una
    // promesa vacía.
    rechazado('sin comisiones no se puede pedir nada', await pedir(pedroUid), 'nada por cobrar');

    const N = await H.montarEmpresa(db, { email: 'dueno@pizzeria.com', nombre: 'Pizzería Sur' });
    await anotar(N.empresaId, P.codigo);
    await cobrar(N.empresaId, 'pro', 190000);

    // Pedir sin decir a dónde transferir deja a administración con un aviso
    // que no puede resolver, y al socio esperando una plata que nadie sabe
    // mandar. Se frena en la base, no en la pantalla.
    rechazado('sin datos bancarios tampoco', await pedir(pedroUid), 'dónde te transferimos');

    await H.intentar(db, pedroUid, () => db.query(
      'select public.guardar_donde_cobro($1,$2,$3,$4)',
      ['Banco Familiar', 'Pedro Cañete', '123456', '4567890']));

    const primero = await pedir(pedroUid);
    aceptado('con los datos cargados, el pedido entra', primero);
    ok('dice cuánto se le debe', Number(primero.valor.total), 95000);
    ok('y sobre cuántas comisiones', primero.valor.comisiones, 1);
    ok('marca una como pedida', primero.valor.nuevas, 1);
    ok('así que hay que avisar', primero.valor.ya_estaba, false);
    ok('y dice a dónde transferirle', primero.valor.donde, '123456');

    // Tocar el botón cinco veces no manda cinco avisos.
    const segundo = await pedir(pedroUid);
    ok('pedirlo de nuevo no vuelve a marcar nada', segundo.valor.nuevas, 0);
    ok('y avisa que ya estaba pedido', segundo.valor.ya_estaba, true);
    ok('sin mover la fecha del pedido original',
      segundo.valor.pedido_el, primero.valor.pedido_el);

    ok('el socio lo ve en su pantalla',
      (await panelDe(pedroUid)).valor.cobro_pedido_el !== null, true);

    const enPanel = await comoJefe(() => db.query(
      'select public.listar_comisiones($1,$2::uuid,$3) j', ['por_pagar', P.id, 200],
    ).then((r) => r.rows[0].j));
    ok('y la administración ve que lo pidió',
      enPanel.valor.every((c) => c.solicitada_at !== null), true);

    // Una comisión nueva que llega DESPUÉS del pedido no queda marcada: es
    // plata que todavía no pidió, y tiene que poder pedirla.
    const O = await H.montarEmpresa(db, { email: 'dueno@libreria.com', nombre: 'Librería Norte' });
    await anotar(O.empresaId, P.codigo);
    await cobrar(O.empresaId, 'pro', 190000);
    const tercero = await pedir(pedroUid);
    ok('una comisión posterior se puede pedir aparte', tercero.valor.nuevas, 1);
    ok('y el total ya son las dos', Number(tercero.valor.total), 190000);

    // Pagarle una saca ese pedido del camino: queda pendiente solo la otra.
    await pagar((await comisionDe(N.empresaId)).id);
    const luego = await panelDe(pedroUid);
    ok('pagada una, queda pendiente la otra', Number(luego.valor.por_pagar), 95000);

    // Un socio pausado no puede pedir: si quedó afuera del programa, tiene
    // que enterarse por el mensaje y no esperando una transferencia.
    await guardarSocio({ id: P.id, nombre: 'Pedro Cañete', activo: false });
    rechazado('un socio pausado no puede pedir', await pedir(pedroUid), 'pausado');

    // Y nadie puede pedir el cobro de otro: se resuelve de auth.uid().
    const ajenoUid = await H.crearUsuario(db, 'ajeno@correo.com');
    rechazado('quien no es socio no puede pedir nada',
      await pedir(ajenoUid), 'código de recomendación');
  }

  // =====================================================================
  grupo('15 · Borrar un socio (067)');
  // =====================================================================
  {
    // Desactivar y borrar son cosas distintas, y hasta la 067 solo existía
    // la primera: la lista únicamente podía crecer.
    const borrar = (id, nombre) => comoJefe(() => db.query(
      'select public.borrar_socio($1,$2) j', [id, nombre]).then((r) => r.rows[0].j));
    const cuantosSocios = () => db.query('select count(*)::int n from public.socios')
      .then((r) => r.rows[0].n);

    const T = (await guardarSocio({ nombre: 'Cargado por error' })).valor;

    rechazado('solo la administración borra socios',
      await H.intentar(db, A.uid, () => db.query('select public.borrar_socio($1,$2)',
        [T.id, 'Cargado por error'])), 'administración de Orden');

    rechazado('el nombre mal escrito no alcanza',
      await borrar(T.id, 'cargado por error'), 'nombre exacto');

    const antes = await cuantosSocios();
    aceptado('escrito igual, se va', await borrar(T.id, 'Cargado por error'));
    ok('y la lista tiene uno menos', await cuantosSocios(), antes - 1);
    ok('queda constancia de quién era',
      await db.query(`select detalle ->> 'nombre' as n from public.registro_admin
                       where accion = 'borrar_socio' order by created_at desc limit 1`)
        .then((r) => r.rows[0].n), 'Cargado por error');

    rechazado('borrar al que ya no está avisa bien',
      await borrar(T.id, 'Cargado por error'), 'no existe');

    // Un socio que trajo un negocio NO se borra: ese vínculo es lo que
    // hace nacer la comisión cuando el cliente paga.
    const U = (await guardarSocio({ nombre: 'Trajo uno' })).valor;
    const V = await H.montarEmpresa(db, { email: 'dueno@zapateria.com', nombre: 'Zapatería Este' });
    await anotar(V.empresaId, U.codigo);
    rechazado('el que trajo cuentas no se borra', await borrar(U.id, 'Trajo uno'), 'Trajo 1 cuenta');

    // Sacado el referido, sí.
    await comoJefe(() => db.query('select public.quitar_referido($1)', [V.empresaId]));
    aceptado('sin el referido, ya se puede', await borrar(U.id, 'Trajo uno'));

    // Con plata de por medio no se borra ni sacando el referido: la
    // comisión es historial de Orden, no del socio.
    const W = (await guardarSocio({ nombre: 'Ya cobró algo' })).valor;
    const X = await H.montarEmpresa(db, { email: 'dueno@cerrajeria.com', nombre: 'Cerrajería Oeste' });
    await anotar(X.empresaId, W.codigo);
    await cobrar(X.empresaId, 'pro', 190000);
    rechazado('con comisiones anotadas no se borra',
      await borrar(W.id, 'Ya cobró algo'), 'historial de Orden');

    await comoJefe(() => db.query('select public.quitar_referido($1)', [X.empresaId]));
    rechazado('ni sacándole el referido después',
      await borrar(W.id, 'Ya cobró algo'), 'historial de Orden');
    ok('ese sigue en la lista, que es lo que se quería',
      await db.query('select count(*)::int n from public.socios where id = $1', [W.id])
        .then((r) => r.rows[0].n), 1);
  }

  // =====================================================================
  grupo('16 · El código del enlace no se pierde en silencio (068)');
  // =====================================================================
  {
    // Lo que pasó el 2026-09-16: el socio estaba pausado, alguien entró con
    // su enlace, pagó, y la comisión no apareció por ningún lado.
    const usar = (uid, empresa, codigo) => H.intentar(db, uid, () =>
      db.query('select public.usar_codigo_referido($1,$2) j', [empresa, codigo]).then((r) => r.rows[0].j));
    const guardarRechazo = (uid, empresa, codigo, motivo) => H.intentar(db, uid, () =>
      db.query('select public.guardar_codigo_rechazado($1,$2,$3) j', [empresa, codigo, motivo]).then((r) => r.rows[0].j));
    const rechazados = () => comoJefe(() =>
      db.query('select public.listar_codigos_rechazados() j').then((r) => r.rows[0].j));

    const M = (await guardarSocio({ nombre: 'Matías del enlace' })).valor;
    await guardarSocio({ id: M.id, nombre: 'Matías del enlace', activo: false });

    const Q = await H.montarEmpresa(db, { email: 'dueno@finanzas.com', nombre: 'Finanzas' });
    const intento = await usar(Q.uid, Q.empresaId, M.codigo);
    rechazado('con el socio pausado, el enlace se rechaza', intento, 'ya no está activo');

    // La pantalla guarda el rechazo en vez de tirarlo.
    const ajeno = await H.montarEmpresa(db, { email: 'dueno@otro.com', nombre: 'Otro negocio' });
    rechazado('nadie guarda un rechazo en la cuenta de otro',
      await guardarRechazo(ajeno.uid, Q.empresaId, M.codigo, 'x'), 'Solo el dueño');
    aceptado('el dueño de la cuenta sí', await guardarRechazo(Q.uid, Q.empresaId, M.codigo, intento.error));
    await guardarRechazo(Q.uid, Q.empresaId, 'OTRO1234', 'probó otro después');

    const lista = (await rechazados()).valor;
    const suyo = lista.find((x) => x.empresa_id === Q.empresaId);
    ok('la administración lo ve en la ficha', !!suyo, true);
    ok('con el código con el que llegó, no el que probó después', suyo?.codigo, M.codigo);
    ok('y a quién pertenece', suyo?.socio, 'Matías del enlace');
    ok('y que ese socio está pausado', suyo?.socio_activo, false);

    // Se le cobra sin que nadie lo haya anotado: no nace comisión.
    await cobrar(Q.empresaId, 'pro', 60000);
    await cobrar(Q.empresaId, 'pro', 60000);
    ok('sin referido, el cobro no generó comisión', await comisionDe(Q.empresaId), null);

    // Anotarlo con el socio pausado explica qué hacer.
    rechazado('pausado, el panel dice cómo seguir', await anotar(Q.empresaId, M.codigo), 'Activalo en «Socios»');

    await guardarSocio({ id: M.id, nombre: 'Matías del enlace', activo: true });
    const r = await anotar(Q.empresaId, M.codigo);
    aceptado('reactivado, se anota', r);
    ok('queda como que vino por el enlace', await db.query(
      'select origen from public.referidos where empresa_id = $1', [Q.empresaId]).then((x) => x.rows[0].origen), 'link');
    ok('y avisa que se generó la comisión', r.valor.comision_generada, true);
    const c = await comisionDe(Q.empresaId);
    ok('por el PRIMER pago, no por los dos', Number(c.base), 60000);
    ok('la mitad', Number(c.monto), 30000);
    ok('queda escrito por qué nació tarde', /código fue rechazado/.test(c.nota), true);
    ok('y el rechazo ya no figura', (await rechazados()).valor.some((x) => x.empresa_id === Q.empresaId), false);

    // La regla del grupo 4 sigue intacta: sin rechazo que lo pruebe, anotar
    // tarde a un cliente que ya pagó no inventa comisiones viejas.
    const V2 = await H.montarEmpresa(db, { email: 'dueno@viejo.com', nombre: 'Cliente viejo' });
    await cobrar(V2.empresaId, 'pro', 60000);
    const tarde = await anotar(V2.empresaId, M.codigo);
    ok('sin rechazo guardado, no hay comisión retroactiva', await comisionDe(V2.empresaId), null);
    ok('y el aviso de que ya pagó aparece aunque no haya asiento', /ya pagó 1 vez/.test(tarde.valor.aviso ?? ''), true);

    // Con otro código anotado, el rechazo no regala nada a quien no trajo.
    const W2 = await H.montarEmpresa(db, { email: 'dueno@cruzado.com', nombre: 'Cruzado' });
    await guardarRechazo(W2.uid, W2.empresaId, M.codigo, 'ya no está activo');
    await cobrar(W2.empresaId, 'pro', 60000);
    await anotar(W2.empresaId, S2.codigo);
    ok('si se anota a otra persona, no sale comisión del primer pago',
      await comisionDe(W2.empresaId), null);

    // Si ya hay referido, un rechazo posterior no se guarda.
    ok('con referido anotado, el rechazo se ignora',
      (await guardarRechazo(Q.uid, Q.empresaId, 'ZZZZ9999', 'x')).valor.guardado, false);
  }

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE COMISIONES FALLARON`);
    process.exit(1);
  }
  console.log(`✓ ${corridas}/${corridas} pruebas`);
}

principal().catch((e) => { console.error(e); process.exit(1); });
