/**
 * Ver en otra moneda (migración 051).
 *
 * EL ERROR QUE ESTO ARREGLA
 *
 * En Ajustes se podía cambiar la moneda del negocio y NO convertía nada:
 * solo cambiaba la etiqueta. Un negocio con 5.000.000 de ventas en guaraníes
 * que pasaba a dólares veía «US$ 5.000.000». El panel, los reportes y el
 * Excel pasaban a mentir sin un error y sin un aviso.
 *
 * Ahora son dos cosas distintas: `moneda` es en qué están guardados los
 * datos y no se toca más una vez que hay movimientos; `moneda_vista` es en
 * qué se los quiere mirar, y no toca ni un dato.
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
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 62)}`);
}

function aceptado(nombre, res) {
  corridas++;
  if (!res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      falló: ${res.error}`); return false; }
  console.log(`  ✓ ${nombre}`);
  return true;
}

const empresa = (db, id) =>
  db.query('select moneda, moneda_vista, cotizacion, cotizacion_at from public.empresas where id=$1', [id])
    .then((r) => r.rows[0]);

const gasto = (db, uid, id, monto) =>
  H.comoUsuario(db, uid, () => db.query(
    `insert into public.movimientos
       (empresa_id, tipo, fecha, descripcion, categoria,
        subtotal, descuento, monto, costo_total, metodo_pago, creado_por)
     values ($1,'gasto',current_date,'Un gasto','General',$2,0,$2,0,'efectivo',$3)`,
    [id, monto, uid]));

async function principal() {
  const db = await H.crearBase();

  const A = await H.montarEmpresa(db, { email: 'dueno@local.com', nombre: 'Almacén' });
  const vendedor = await H.sumarMiembro(db, A.empresaId, 'vendedor@local.com', 'vendedor');

  const ver = (uid, moneda, cot) =>
    H.intentar(db, uid, () => db.query(
      'select public.guardar_vista_moneda($1,$2,$3) j', [A.empresaId, moneda, cot])
      .then((r) => r.rows[0].j));

  // =====================================================================
  grupo('1 · Sin vista, todo sigue como siempre');
  // =====================================================================
  {
    const e = await empresa(db, A.empresaId);
    ok('la empresa nace en su moneda', e.moneda, 'PYG');
    ok('y sin vista', e.moneda_vista, null);
    ok('ni cotización', e.cotizacion, null);
  }

  // =====================================================================
  grupo('2 · Encender la vista no toca un solo dato');
  // =====================================================================
  {
    await gasto(db, A.uid, A.empresaId, 5000000);
    const antes = (await db.query(
      'select sum(monto)::numeric s from public.movimientos where empresa_id=$1', [A.empresaId])).rows[0].s;

    const r = await ver(A.uid, 'USD', 7300);
    aceptado('se guarda la vista en dólares', r);
    ok('a la cotización que se puso', Number(r.valor.cotizacion), 7300);

    const e = await empresa(db, A.empresaId);
    ok('la moneda de los datos NO cambió', e.moneda, 'PYG');
    ok('la vista sí quedó', e.moneda_vista, 'USD');
    ok('y quedó la fecha, que es la mitad del dato', e.cotizacion_at !== null, true);

    // Lo más importante de toda esta prueba.
    const despues = (await db.query(
      'select sum(monto)::numeric s from public.movimientos where empresa_id=$1', [A.empresaId])).rows[0].s;
    ok('los importes guardados son los mismos', Number(despues), Number(antes));
    ok('y siguen siendo los que se cargaron', Number(despues), 5000000);
  }

  // =====================================================================
  grupo('3 · La moneda de los datos ya no se puede reetiquetar');
  // =====================================================================
  {
    // Este era el error: con movimientos cargados, cambiar `moneda` volvía
    // falso el historial entero sin avisar.
    rechazado('con movimientos, la moneda del negocio no se cambia',
      await H.intentar(db, A.uid, () =>
        db.query("update public.empresas set moneda='USD' where id=$1", [A.empresaId])),
      'reetiquetaría todo tu historial');

    ok('y sigue en la suya', (await empresa(db, A.empresaId)).moneda, 'PYG');

    // Pero quien se equivocó al abrir la cuenta y no cargó nada todavía sí
    // tiene que poder corregirlo: no se prohíbe siempre, se prohíbe mentir.
    const B = await H.montarEmpresa(db, { email: 'nuevo@local.com', nombre: 'Recién Abierto' });
    aceptado('sin movimientos sí se puede corregir',
      await H.intentar(db, B.uid, () =>
        db.query("update public.empresas set moneda='USD' where id=$1", [B.empresaId])));
    ok('y queda cambiada', (await empresa(db, B.empresaId)).moneda, 'USD');
  }

  // =====================================================================
  grupo('4 · Cambiar la moneda de los datos limpia la vista vieja');
  // =====================================================================
  {
    const C = await H.montarEmpresa(db, { email: 'tercero@local.com', nombre: 'Tercero' });
    await H.intentar(db, C.uid, () =>
      db.query('select public.guardar_vista_moneda($1,$2,$3)', [C.empresaId, 'USD', 7300]));
    ok('tiene vista', (await empresa(db, C.empresaId)).moneda_vista, 'USD');

    // La cotización que había era contra la moneda anterior: si esa cambia,
    // el número deja de significar nada. Dejarla sería peor que borrarla.
    await db.query("update public.empresas set moneda='BRL' where id=$1", [C.empresaId]);
    const e = await empresa(db, C.empresaId);
    ok('cambiada la moneda, la vista se limpia sola', e.moneda_vista, null);
    ok('y la cotización con ella', e.cotizacion, null);
  }

  // =====================================================================
  grupo('5 · Ver en la misma moneda no es ver en otra');
  // =====================================================================
  {
    const r = await ver(A.uid, 'PYG', 1);
    aceptado('pedir la propia se acepta', r);
    ok('pero no queda como vista', (await empresa(db, A.empresaId)).moneda_vista, null);
    // Si quedara escrita, la pantalla mostraría «al cambio 1,00», que es
    // ruido con aspecto de dato.
    ok('ni queda una cotización de 1', (await empresa(db, A.empresaId)).cotizacion, null);
  }

  // =====================================================================
  grupo('6 · Una cotización que no se puede usar se rechaza');
  // =====================================================================
  {
    rechazado('sin cotización no se puede convertir nada',
      await ver(A.uid, 'USD', null), 'a cuánto está el cambio');
    rechazado('ni con cero', await ver(A.uid, 'USD', 0), 'a cuánto está el cambio');
    rechazado('ni negativa', await ver(A.uid, 'USD', -7300), 'a cuánto está el cambio');
    rechazado('ni con un dedazo de ceros', await ver(A.uid, 'USD', 999999999), 'los ceros');
    rechazado('ni una moneda que no conocemos', await ver(A.uid, 'XYZ', 10), 'no conocemos esa moneda');

    ok('y después de todo eso sigue sin vista',
      (await empresa(db, A.empresaId)).moneda_vista, null);
  }

  // =====================================================================
  grupo('7 · Quién puede tocarlo');
  // =====================================================================
  {
    rechazado('un vendedor no cambia en qué moneda mira el negocio',
      await ver(vendedor, 'USD', 7300), 'propietario o un administrador');

    // Y tampoco por la puerta de atrás. Acá la primera versión de esta
    // prueba esperaba un rechazo y falló: RLS no rechaza un UPDATE que no
    // le corresponde, lo FILTRA — la consulta "sale bien" y no toca ninguna
    // fila. Lo que hay que comprobar es el efecto, no el error, porque un
    // UPDATE que no cambia nada es exactamente lo que queremos.
    const intento = await H.intentar(db, vendedor, () =>
      db.query("update public.empresas set moneda_vista='USD', cotizacion=7300 where id=$1",
        [A.empresaId]));
    ok('el UPDATE del vendedor no falla, simplemente no alcanza ninguna fila',
      intento.ok && intento.valor.rowCount === 0, true);
    const tras = await empresa(db, A.empresaId);
    ok('y nada cambió', [tras.moneda_vista, tras.cotizacion], [null, null]);
  }

  // =====================================================================
  grupo('8 · Apagarla devuelve todo a la moneda propia');
  // =====================================================================
  {
    aceptado('se enciende', await ver(A.uid, 'USD', 7300));
    ok('está encendida', (await empresa(db, A.empresaId)).moneda_vista, 'USD');

    const r = await ver(A.uid, null, null);
    aceptado('se apaga mandando null', r);
    const e = await empresa(db, A.empresaId);
    ok('sin vista', e.moneda_vista, null);
    ok('sin cotización', e.cotizacion, null);
    ok('sin fecha', e.cotizacion_at, null);
    ok('y los datos, intactos como siempre estuvieron',
      Number((await db.query(
        'select sum(monto)::numeric s from public.movimientos where empresa_id=$1',
        [A.empresaId])).rows[0].s), 5000000);
  }

  console.log(`\n${fallos === 0 ? '✓' : '✗'} ${corridas - fallos}/${corridas} pruebas`);
  await db.close();
  process.exit(fallos === 0 ? 0 : 1);
}

principal().catch((e) => { console.error(e); process.exit(1); });
