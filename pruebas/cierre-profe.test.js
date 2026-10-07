/**
 * El profe que vende cierra el día (migración 128, 07/10/2026).
 *
 * Matías: «También tenemos que agregar lo que sería cierre del día, en la
 * parte de cuando el profesor activa lo que sería venta de productos y más
 * cosas. Tiene que tener un cierre del día también.»
 *
 * La 090 le sacó el cierre al profe porque el recordatorio de la noche lo
 * retaba un sábado sin clases. La 121 le dio «También vendo productos». La
 * 128 le da el Cierre del día a ESE profe (y al trainer), sin devolverle
 * ninguno de los avisos que retan.
 *
 * El caso: «Tenis manía». En un día cobra dos inscripciones (150.000 cada
 * una), vende una raqueta a 450.000 que le costó 300.000 y gasta 50.000 de
 * cancha. Entró 750.000 (300.000 de clases + 450.000 de productos), salió
 * 50.000, ganancia neta 400.000.
 *
 * LO QUE SE PRUEBA (cada número es el grupo del mismo número, abajo)
 *
 *   0. COMPATIBILIDAD: una base hasta la 127 con una cuenta de cada rubro;
 *      las llamadas del código de antes de la 128 (leídas de git) a las
 *      funciones del cierre y de los avisos; se aplica la 128; se repiten:
 *      contestan igual para todos. Con el momento nuevo ('noche') solo se
 *      suman el profe y el trainer que venden. Ninguna otra función cambió.
 *   1. El espejo: `cuenta_cierra_el_dia` contra `fichaDeLaCuenta` de
 *      rubros.ts, y `rubro_cierra_el_dia` contra `cierraElDia`, en cada
 *      rubro, tipo de cuenta y posición del interruptor.
 *   2. El profe sin el interruptor queda igual que hoy.
 *   3. Con el interruptor, los números cierran: cierre, panel, reporte y
 *      resumen dan lo mismo; «Salió» es el «Gastado» del panel.
 *   4. El día que compra mercadería: la ganancia no cambia, «Salió» sí.
 *   5. Un día solo con clases dadas, sin plata.
 *   6. `marcar_cierre`: queda cerrado, dos veces no duplica, es por persona.
 *   7. Los avisos: ni mañana, ni tarde, ni recordatorio de racha; noche sí.
 *   8. Apagarlo: sale de todo y no pierde los días cerrados. Prenderlo
 *      de nuevo: vuelve.
 *   9. Comercio y servicios, sin cambios.
 *  10. La cuenta personal nunca, aunque tenga todo forzado.
 *  11. La cuenta vencida: no marca el cierre ni recibe el aviso.
 *  12. El trainer, igual que el profe. El campo, nunca.
 *  13. Permisos, una sola `avisos_del_dia`, search_path, sin barras
 *      invertidas, y aplicada dos veces.
 *  14. `avisos_del_dia` es la de la 106, letra por letra, salvo lo marcado.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const H = require('./ayuda-db.js');
const { fichaDe, fichaDeLaCuenta } = require('../.compilado/rubros.js');
const { salioDelCierre, mercaderiaAparteDelCierre, desgloseDelCierre, conCostoDeLoVendido } = require('../.compilado/cierre-alumnos.js');
const { fraseDelDia } = require('../.compilado/frases-del-dia.js');

let fallos = 0;
let corridas = 0;

function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a.length > 140 ? `${a.slice(0, 137)}…` : a}`);
}

/** Dos cosas grandes iguales; si no, la primera clave que difiere. */
function iguales(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) { console.log(`  ✓ ${nombre} → ${a.length} letras iguales`); return; }
  fallos++;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  console.log(`  ✗ ${nombre}\n      se separan en la letra ${i}:\n      obtenido: ${a.slice(Math.max(0, i - 80), i + 80)}\n      esperado: ${b.slice(Math.max(0, i - 80), i + 80)}`);
}

function rechazado(nombre, res, frag) {
  corridas++;
  if (res.ok) { fallos++; console.log(`  ✗ ${nombre}\n      NO fue rechazada`); return; }
  if (frag && !new RegExp(frag, 'i').test(res.error)) {
    fallos++; console.log(`  ✗ ${nombre}\n      otro motivo: ${res.error}`); return;
  }
  console.log(`  ✓ ${nombre} → rechazada: ${res.error.split('\n')[0].slice(0, 64)}`);
}

// Las worktrees traen CRLF: se normaliza antes de buscar nada.
const leer = (ruta) => fs.readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const archivo = (prefijo) => `supabase/migrations/${H.migraciones().find((f) => f.startsWith(prefijo))}`;
const num = (v) => Math.round(Number(v) * 100) / 100;
const BARRA = String.fromCharCode(92);

/**
 * El código de ANTES de la 128, leído de git: el commit anterior al que
 * sumó la migración, o HEAD si todavía no se commiteó. Null si no hay git
 * (una copia suelta): esa parte se saltea y se dice.
 */
function fuenteDeAntes(ruta) {
  const git = (...args) => execFileSync('git', args, { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const alta = git('log', '--format=%H', '--diff-filter=A', '--', archivo('128')).trim().split('\n').filter(Boolean).pop();
    const ref = alta ? `${alta}^` : 'HEAD';
    return { ref, texto: git('show', `${ref}:${ruta}`).replace(/\r\n/g, '\n') };
  } catch { return null; }
}

/** Ayudantes contra una base y una empresa. */
function ayudantes(db, P) {
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const valor = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(`${sql} → ${r.error}`);
    return r.valor.rows[0];
  };
  const j = async (sql, args, uid = P.uid) => (await valor(uid, sql, args)).j;
  const uno = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const cliente = async (nombre, tel) => (await valor(P.uid,
    'select public.guardar_cliente($1,$2,$3,$4,$5) id', [P.empresaId, nombre, tel, '', null])).id;
  const inscribir = async (c, dia, total, pagado = true) => valor(P.uid,
    'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) j',
    [P.empresaId, c, [0, 1, 2, 3, 4, 5, 6], '17:00', '18:00', dia, dia, null, total, pagado, 'efectivo', null, 'Tenis', null, true]);
  const vender = async (items) => (await valor(P.uid,
    'select public.registrar_venta(p_empresa => $1, p_items => $2::jsonb) id', [P.empresaId, JSON.stringify(items)])).id;
  const gasto = (dia, descripcion, categoria, monto) => como(P.uid,
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, metodo_pago, creado_por)
     values ($1,'gasto',$2,$3,$4,$5,$5,'efectivo',auth.uid())`, [P.empresaId, dia, descripcion, categoria, monto]);
  // Un movimiento de otro día, directo: acá se mide la racha, no el permiso.
  const viejo = (diasAtras, tipo, monto) => db.query(
    `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto, costo_total)
     values ($1, $2, public.hoy_empresa($1) - $3::int, 'De antes', 'Otros', $4, $4, 0)`, [P.empresaId, tipo, diasAtras, monto]);
  const cierre = (dia = null, uid) => j('select public.cierre_del_dia($1,$2) j', [P.empresaId, dia], uid);
  const marcar = (dia = null, uid = P.uid) => como(uid, 'select public.marcar_cierre($1,$2) d', [P.empresaId, dia]);
  const panel = (dia, uid) => j('select public.panel_profe($1,$2,$2) j', [P.empresaId, dia], uid);
  const reporte = (dia, uid) => j('select public.reporte_alumnos($1,$2,$2) j', [P.empresaId, dia], uid);
  const resumen = (dia) => j('select public.resumen_financiero($1,$2,$2) j', [P.empresaId, dia]);
  const racha = () => j('select public.racha_empresa($1) j', [P.empresaId]);
  const prender = (v) => db.query('update public.empresas set vende_productos = $2 where id = $1', [P.empresaId, v]);
  const cierra = async () => (await uno('select public.cuenta_cierra_el_dia($1) c', [P.empresaId])).c;
  return { como, valor, j, uno, cliente, inscribir, vender, gasto, viejo, cierre, marcar, panel, reporte, resumen, racha, prender, cierra };
}

(async () => {
  const t0 = Date.now();
  const db = await H.crearBase({ hasta: '127' });
  console.log(`base hasta la 127 en ${Math.round((Date.now() - t0) / 1000)} s`);

  const servicio = (sql, args = []) => H.comoServicio(db, () => db.query(sql, args).then((x) => x.rows[0].l));
  const uno = async (sql, args = []) => (await db.query(sql, args)).rows[0];

  // ── Una cuenta de cada rubro, con algo cargado hoy ──────────────────
  /** Todas las cuentas que arma la prueba, para decir de quién es cada fila. */
  const TODAS = [];
  const montar = async (clave, rubro, tipoCuenta) => {
    const P = await H.montarEmpresa(db, { email: `${clave}@prueba.com`, nombre: `Cuenta ${clave}`, rubro, tipoCuenta });
    const c = { ...P, clave, A: ayudantes(db, P) };
    TODAS.push(c);
    return c;
  };
  const kiosco = await montar('kiosco', 'comercio');
  const barber = await montar('barber', 'servicios');
  const campo = await montar('campo', 'ganaderia');
  const chacra = await montar('chacra', 'agricultura');
  const persona = await montar('persona', 'comercio', 'personal');
  const profe = await montar('profe', 'clases');        // sin el interruptor
  const tenis = await montar('tenis', 'clases');        // con el interruptor: el caso
  const trainer = await montar('trainer', 'entrenamiento'); // con el interruptor
  const hoy = (await uno('select public.hoy_empresa($1)::text d', [tenis.empresaId])).d;
  const ayer = (await uno('select ($1::date - 1)::text d', [hoy])).d;

  const yerba = await H.crearProducto(db, kiosco.empresaId, kiosco.uid, { nombre: 'Yerba', costo: 10000, precio: 15000, stock: 20 });
  await kiosco.A.vender([{ producto_id: yerba, cantidad: 4 }]);
  await kiosco.A.gasto(hoy, 'Luz', 'Servicios', 20000);
  await kiosco.A.viejo(1, 'venta', 30000);
  await barber.A.vender([{ nombre: 'Corte', cantidad: 1, precio_unitario: 40000 }]);
  await campo.A.gasto(hoy, 'Sal mineral', 'Insumos', 80000);
  await chacra.A.gasto(hoy, 'Gasoil', 'Combustible', 60000);
  await persona.A.gasto(hoy, 'Súper', 'Comida', 45000);

  // El profe sin interruptor: cobra una inscripción hoy.
  const lucia = await profe.A.cliente('Lucía', '0981000001');
  await profe.A.inscribir(lucia, hoy, 200000, true);

  // «Tenis manía»: el ejemplo del diseño.
  await tenis.A.prender(true);
  const raqueta = await H.crearProducto(db, tenis.empresaId, tenis.uid, { nombre: 'Raqueta', costo: 300000, precio: 450000, stock: 5 });
  const juan = await tenis.A.cliente('Juan', '0981000002');
  const maria = await tenis.A.cliente('María', '0981000003');
  await tenis.A.inscribir(juan, hoy, 150000, true);
  await tenis.A.inscribir(maria, hoy, 150000, true);
  await tenis.A.vender([{ producto_id: raqueta, cantidad: 1 }]);
  await tenis.A.gasto(hoy, 'Cancha', 'Alquiler', 50000);

  // El trainer con interruptor: una sesión cobrada y una proteína.
  await trainer.A.prender(true);
  const proteina = await H.crearProducto(db, trainer.empresaId, trainer.uid, { nombre: 'Proteína', costo: 150000, precio: 220000, stock: 10 });
  const marta = await trainer.A.cliente('Marta', '0981000004');
  await trainer.A.inscribir(marta, hoy, 500000, true);
  await trainer.A.vender([{ producto_id: proteina, cantidad: 1 }]);

  const CUENTAS = [kiosco, barber, campo, chacra, persona, profe, tenis, trainer];
  const DE_ALUMNOS = new Set(['profe', 'tenis', 'trainer']);
  const nombreDe = (id) => TODAS.find((c) => c.empresaId === id)?.clave ?? id;

  // ═══════════════════════════════════════════════════════════
  grupo('0 · Compatibilidad: el código de antes, con la base de después');
  // ═══════════════════════════════════════════════════════════
  // Cómo llama el código publicado a lo que la 128 toca.
  const antes = {
    avisos: fuenteDeAntes('src/lib/avisos-diarios.ts'),
    habito: fuenteDeAntes('src/lib/habito.ts'),
    boton: fuenteDeAntes('src/components/BotonCerrarDia.tsx'),
  };
  if (!antes.avisos) {
    console.log('  · sin git no se puede leer el código de antes: se usan las llamadas de siempre');
  } else {
    console.log(`  · el código de antes: ${antes.avisos.ref}`);
    ok('el código de antes pide los avisos SIN argumentos',
      antes.avisos.texto.match(/rpc\('avisos_del_dia'[^)]*\)/g), ["rpc('avisos_del_dia')"]);
    ok('pide el cierre con p_empresa y p_fecha',
      /rpc\('cierre_del_dia', \{\s*p_empresa: empresaId,\s*p_fecha: fecha \?\? null,\s*\}\)/.test(antes.habito.texto), true);
    ok('y marca el cierre con p_empresa y p_fecha',
      /rpc\('marcar_cierre', \{\s*p_empresa: empresaId,\s*p_fecha: fecha,\s*\}\)/.test(antes.boton.texto), true);
  }

  // Esas mismas llamadas, y las que arman los números de cada pantalla.
  const foto = async () => {
    const f = { cuentas: {} };
    f.avisos = await servicio('select public.avisos_del_dia() l');
    f.sinCargar = await servicio('select public.empresas_sin_cargar_hoy(2) l');
    for (const c of CUENTAS) {
      f.cuentas[c.clave] = {
        cierre: await c.A.cierre(null),
        cierreDeAyer: await c.A.cierre(ayer),
        resumen: await c.A.resumen(hoy),
        racha: await c.A.racha(),
        rubroCierra: (await uno('select public.rubro_cierra_el_dia(e.rubro, e.tipo_cuenta) c from public.empresas e where e.id = $1', [c.empresaId])).c,
        panel: DE_ALUMNOS.has(c.clave) ? await c.A.panel(hoy) : null,
        reporte: DE_ALUMNOS.has(c.clave) ? await c.A.reporte(hoy) : null,
        // Marcar el cierre, y deshacerlo: la foto no deja rastro.
        marcar: await (async () => {
          await db.exec('begin');
          await db.exec('set local role authenticated');
          await db.query(`select set_config('orden.uid', $1, true)`, [c.uid]);
          const r = await db.query('select public.marcar_cierre($1,$2)::text d', [c.empresaId, hoy]).then((x) => x.rows[0].d, (e) => `ERROR ${e.message}`);
          await db.exec('rollback');
          return r;
        })(),
      };
    }
    return f;
  };
  const funciones = async () => (await db.query(
    `select p.oid::regprocedure::text firma, pg_get_functiondef(p.oid) def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' order by 1`)).rows;

  const fotoAntes = await foto();
  const funcionesAntes = await funciones();
  ok('antes de la 128: quién recibe avisos',
    fotoAntes.avisos.map((x) => nombreDe(x.empresa_id)).sort(), ['barber', 'kiosco', 'persona']);
  ok('antes de la 128 no existe cuenta_cierra_el_dia',
    Number((await uno(`select count(*)::int n from pg_proc where proname = 'cuenta_cierra_el_dia'`)).n), 0);

  await H.aplicarMigracion(db, '128');
  console.log('  · 128 aplicada');

  const fotoDespues = await foto();
  const sinDeAlumnos = (lista) => lista.map((x) => { const c = { ...x }; delete c.de_alumnos; return c; });
  iguales('avisos_del_dia() como la llama el código de antes: las mismas cuentas y los mismos números',
    sinDeAlumnos(fotoDespues.avisos), fotoAntes.avisos);
  ok('la única clave nueva es de_alumnos, y es false en todas esas',
    fotoDespues.avisos.map((x) => [Object.keys(x).filter((k) => !(k in fotoAntes.avisos[0])), x.de_alumnos]),
    fotoDespues.avisos.map(() => [['de_alumnos'], false]));
  iguales('empresas_sin_cargar_hoy(2), igual', fotoDespues.sinCargar, fotoAntes.sinCargar);
  for (const c of CUENTAS) {
    iguales(`${c.clave}: cierre, cierre de ayer, resumen, racha, panel, reporte y marcar_cierre, iguales`,
      fotoDespues.cuentas[c.clave], fotoAntes.cuentas[c.clave]);
  }

  const funcionesDespues = await funciones();
  const defAntes = new Map(funcionesAntes.map((f) => [f.firma, f.def]));
  const defDespues = new Map(funcionesDespues.map((f) => [f.firma, f.def]));
  ok('funciones que la 128 suma', [...defDespues.keys()].filter((k) => !defAntes.has(k)).sort(),
    ['avisos_del_dia(text)', 'cuenta_cierra_el_dia(uuid)']);
  ok('funciones que la 128 saca', [...defAntes.keys()].filter((k) => !defDespues.has(k)), ['avisos_del_dia()']);
  ok('ninguna otra función cambió una letra (cierre_del_dia, marcar_cierre, panel_profe, rubro_cierra_el_dia…)',
    [...defAntes.keys()].filter((k) => defDespues.has(k) && defDespues.get(k) !== defAntes.get(k)), []);
  ok('y son muchas las que se compararon', defAntes.size > 300, true);

  // El código NUEVO, a la noche: los de siempre, más el profe y el trainer que venden.
  const avisos = (momento) => (momento === undefined
    ? servicio('select public.avisos_del_dia() l')
    : servicio('select public.avisos_del_dia($1) l', [momento]));
  const quienes = async (momento) => (await avisos(momento)).map((x) => nombreDe(x.empresa_id)).sort();
  const noche = await avisos('noche');
  ok("con 'noche': los de siempre, más los dos que venden", noche.map((x) => nombreDe(x.empresa_id)).sort(),
    ['barber', 'kiosco', 'persona', 'tenis', 'trainer']);
  iguales("con 'noche', los de siempre reciben letra por letra lo mismo",
    noche.filter((x) => !['tenis', 'trainer'].includes(nombreDe(x.empresa_id))), fotoDespues.avisos);
  ok("'manana', 'tarde', null y cualquier otra cosa: los de siempre",
    [await quienes('manana'), await quienes('tarde'), await quienes(null), await quienes('NOCHE'), await quienes('')],
    Array(5).fill(['barber', 'kiosco', 'persona']));

  // ═══════════════════════════════════════════════════════════
  grupo('1 · El espejo: la base y rubros.ts dicen lo mismo');
  // ═══════════════════════════════════════════════════════════
  const RUBROS = ['comercio', 'servicios', 'clases', 'entrenamiento', 'ganaderia', 'agricultura'];
  const espejo = await H.montarEmpresa(db, { email: 'espejo@prueba.com', nombre: 'Espejo', rubro: 'comercio' });
  const filas = [];
  const difieren = [];
  // Una sola cuenta que se va disfrazando: lo que se compara es la fila de
  // `empresas` contra la ficha que arma el código con esa misma fila. Los
  // triggers de usuario se apagan para poder forzar hasta lo imposible (una
  // cuenta personal con rubro de profe y el interruptor prendido).
  await db.exec('alter table public.empresas disable trigger user');
  for (const rubro of [...RUBROS, null]) {
    for (const tipo of ['emprendedor', 'personal']) {
      for (const vende of [false, true]) {
        await db.query('update public.empresas set rubro = coalesce($2, rubro), tipo_cuenta = $3, vende_productos = $4 where id = $1',
          [espejo.empresaId, rubro, tipo, vende]);
        const fila = await uno('select rubro, tipo_cuenta, vende_productos from public.empresas where id = $1', [espejo.empresaId]);
        const base = (await uno('select public.cuenta_cierra_el_dia($1) c', [espejo.empresaId])).c;
        const codigo = fichaDeLaCuenta(fila).secciones['/cierre'];
        const rubroBase = (await uno('select public.rubro_cierra_el_dia($1, $2) c', [fila.rubro, fila.tipo_cuenta])).c;
        const rubroCodigo = fichaDe(fila.rubro, fila.tipo_cuenta).cierraElDia;
        filas.push(`${fila.rubro}/${fila.tipo_cuenta}/${vende ? 'vende' : 'no'}=${base ? 'sí' : 'no'}`);
        if (base !== codigo || rubroBase !== rubroCodigo) difieren.push({ fila, base, codigo, rubroBase, rubroCodigo });
      }
    }
  }
  await db.query(`update public.empresas set rubro = 'comercio', tipo_cuenta = 'emprendedor', vende_productos = false where id = $1`, [espejo.empresaId]);
  await db.exec('alter table public.empresas enable trigger user');
  ok('se compararon todas las combinaciones', filas.length, 28);
  ok('cuenta_cierra_el_dia = fichaDeLaCuenta().secciones[/cierre], y rubro_cierra_el_dia = cierraElDia, en todas', difieren, []);
  ok('las que SÍ cierran el día', filas.filter((f) => f.endsWith('=sí')).sort(), [
    'clases/emprendedor/vende=sí', 'comercio/emprendedor/no=sí', 'comercio/emprendedor/vende=sí',
    'entrenamiento/emprendedor/vende=sí', 'servicios/emprendedor/no=sí', 'servicios/emprendedor/vende=sí',
  ]);
  ok('una cuenta que no existe, no', (await uno(`select public.cuenta_cierra_el_dia('00000000-0000-0000-0000-000000000000') c`)).c, false);
  ok('y sin cuenta (null), tampoco', (await uno('select public.cuenta_cierra_el_dia(null) c')).c, false);
  ok('las cuentas reales, una por una',
    await Promise.all(CUENTAS.map(async (c) => [c.clave, await c.A.cierra()])),
    [['kiosco', true], ['barber', true], ['campo', false], ['chacra', false], ['persona', false], ['profe', false], ['tenis', true], ['trainer', true]]);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · El profe sin el interruptor, igual que hoy');
  // ═══════════════════════════════════════════════════════════
  ok('no tiene cierre', [await profe.A.cierra(), fichaDeLaCuenta({ rubro: 'clases', tipo_cuenta: 'emprendedor', vende_productos: false }).secciones['/cierre']], [false, false]);
  ok('cargó plata hoy y no está en ningún aviso',
    [(await quienes()).includes('profe'), (await quienes('manana')).includes('profe'), (await quienes('tarde')).includes('profe'), (await quienes('noche')).includes('profe')],
    [false, false, false, false]);
  // Racha de tres días hasta ayer y hoy vacío: el momento del recordatorio.
  const conRacha = async (clave, rubro, vende) => {
    const c = await montar(clave, rubro);
    if (vende) await c.A.prender(true);
    for (const d of [1, 2, 3]) await c.A.viejo(d, 'venta', 100000);
    return c;
  };
  const profeRacha = await conRacha('profe-racha', 'clases', false);
  const tenisRacha = await conRacha('tenis-racha', 'clases', true);
  const kioscoRacha = await conRacha('kiosco-racha', 'comercio', false);
  const sinCargar = (await servicio('select public.empresas_sin_cargar_hoy(2) l')).map((x) => [nombreDe(x.empresa_id), x.racha]);
  ok('el recordatorio de la racha le llega al kiosco (control)', sinCargar.filter((x) => x[0] === 'kiosco-racha'), [['kiosco-racha', 3]]);
  ok('y no al profe, con la misma racha', sinCargar.some((x) => x[0] === 'profe-racha'), false);

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Con el interruptor, los números cierran');
  // ═══════════════════════════════════════════════════════════
  const ci = await tenis.A.cierre(null);
  const pa = await tenis.A.panel(hoy);
  const re = await tenis.A.reporte(hoy);
  const rs = await tenis.A.resumen(hoy);
  const entro = num(ci.resumen.ventas) + num(ci.resumen.otros_ingresos);
  ok('el cierre: es de hoy, hubo actividad', [ci.fecha, ci.es_hoy, ci.hubo_actividad], [hoy, true, true]);
  ok('entró 750.000, gastos 50.000, ganancia neta 400.000',
    [entro, num(ci.resumen.gastos), num(ci.resumen.ganancia_neta)], [750000, 50000, 400000]);
  ok('lo que más dejó: la raqueta', [ci.producto_estrella.nombre, num(ci.producto_estrella.ingresos)], ['Raqueta', 450000]);
  ok('el panel de ese día: cobrado, gastado, de clases, de productos y lo que dejaron',
    [num(pa.cobrado), num(pa.gastado), num(pa.cobrado_clases), num(pa.productos.vendido), num(pa.productos.ganancia)],
    [750000, 50000, 300000, 450000, 150000]);
  ok('el reporte de ese día: cobrado, de clases y de productos',
    [num(re.cobrado), num(re.cobrado_clases), num(re.productos.vendido), num(re.productos.costo)], [750000, 300000, 450000, 300000]);
  ok('el resumen (el «Te queda» del panel y el «Te quedó» del reporte)', num(rs.ganancia_neta), 400000);
  ok('«Entró» del cierre = «Cobrado» del panel = cobrado del reporte', [entro, entro], [num(pa.cobrado), num(re.cobrado)]);
  ok('«Salió» del cierre = «Gastado» del panel', salioDelCierre(ci.resumen), num(pa.gastado));
  ok('nada se cuenta dos veces: clases + productos = entró', num(pa.cobrado_clases) + num(pa.productos.vendido), entro);
  ok('y entró − costo de lo vendido − salió = ganancia neta', entro - num(rs.costo_mercaderia) - salioDelCierre(ci.resumen), num(ci.resumen.ganancia_neta));
  ok('el desglose que dibuja la pantalla', desgloseDelCierre(pa, hoy, ci.fecha),
    { clases: 300000, productos: 450000, gananciaProductos: 150000, otros: 0, clasesDadas: num(pa.clases_periodo) });
  ok('sin mercadería aparte; con costo de lo vendido', [mercaderiaAparteDelCierre(ci.resumen), conCostoDeLoVendido(ci.resumen)], [0, true]);
  ok('si el panel es de otro día, no hay desglose (y el cierre sale igual)', desgloseDelCierre(pa, ayer, ci.fecha), null);
  ok('si el panel no se pudo leer, tampoco', [desgloseDelCierre(null, hoy, hoy), desgloseDelCierre(undefined, hoy, hoy)], [null, null]);

  // El aviso de la noche, de punta a punta: la base y la frase.
  const TX = {
    manana: { negocioConVentas: () => 'M', negocioConPerdida: () => 'M', negocioSoloGastos: () => 'M', negocioNada: 'M', personalConGastos: () => 'M', personalSoloIngresos: () => 'M', personalNada: 'M', rachaLinea: (d) => `R${d}` },
    tarde: { negocio: 'T', personal: 'T', negocioRacha: () => 'T', personalRacha: () => 'T' },
    noche: {
      titulo: (n) => `Día en ${n}`, negocio: () => 'NEGOCIO', negocioConPerdida: () => 'NEGOCIO', negocioSinVentas: () => 'NEGOCIO',
      personal: () => 'P', personalSoloGastos: () => 'P', personalSoloIngresos: () => 'P',
      masQueAyer: () => '', menosQueAyer: () => '', igualQueAyer: '', rachaLinea: (d) => `R${d}`,
      alumnos: (e, q) => `A:${e}|${q}`, alumnosConPerdida: (e, a) => `AP:${e}|${a}`, alumnosSinIngresos: (g) => `AS:${g}`,
      alumnosSoloPerdida: (a) => `SP:${a}`,
    },
  };
  const soloNumeros = (s) => s.replace(/[^0-9APS:|]/g, '');
  const filaTenis = (await avisos('noche')).find((x) => x.empresa_id === tenis.empresaId);
  ok('el aviso de la noche: de alumnos, con lo que entró, lo que gastó y lo que le queda',
    [filaTenis.de_alumnos, num(filaTenis.hoy.ventas), num(filaTenis.hoy.gastos), num(filaTenis.hoy.ganancia), filaTenis.hoy.cargados > 0],
    [true, 750000, 50000, 400000, true]);
  ok('le llega al dueño', filaTenis.destinatarios.map((d) => d.user_id), [tenis.uid]);
  const frase = fraseDelDia('noche', filaTenis, TX, 'es-PY');
  ok('la frase: «te entraron 750.000 y te quedan 400.000», y lleva al cierre',
    [soloNumeros(frase.cuerpo), frase.url, frase.titulo], ['A:750000|400000', '/cierre', 'Día en Cuenta tenis']);
  ok('a la mañana y a la tarde no hay frase para él, aunque la base lo mandara',
    [fraseDelDia('manana', filaTenis, TX, 'es-PY'), fraseDelDia('tarde', { ...filaTenis, hoy: { ...filaTenis.hoy, cargados: 0 } }, TX, 'es-PY')], [null, null]);

  // ═══════════════════════════════════════════════════════════
  grupo('4 · El día que compra mercadería');
  // ═══════════════════════════════════════════════════════════
  await tenis.A.gasto(hoy, 'Tres raquetas', 'Mercadería', 900000);
  const ci4 = await tenis.A.cierre(null);
  const pa4 = await tenis.A.panel(hoy);
  ok('la ganancia neta no cambia (106): sigue en 400.000', num(ci4.resumen.ganancia_neta), 400000);
  ok('la mercadería va aparte: gastos sigue en 50.000',
    [ci4.resumen.mercaderia_aparte, num(ci4.resumen.compras_mercaderia), num(ci4.resumen.gastos)], [true, 900000, 50000]);
  ok('«Salió» = 950.000 = «Gastado» del panel', [salioDelCierre(ci4.resumen), num(pa4.gastado)], [950000, 950000]);
  ok('y la nota dice cuánto fue', mercaderiaAparteDelCierre(ci4.resumen), 900000);
  const fila4 = (await avisos('noche')).find((x) => x.empresa_id === tenis.empresaId);
  ok('el aviso de la noche sigue diciendo 400.000', [num(fila4.hoy.ventas) + num(fila4.hoy.ingresos), num(fila4.hoy.ganancia)], [750000, 400000]);
  // Un día de pura compra, sin vender nada con costo: ahí sí es un gasto.
  const soloCompra = await montar('solo-compra', 'clases');
  await soloCompra.A.prender(true);
  await soloCompra.A.gasto(hoy, 'Pelotas', 'Mercadería', 120000);
  const ci4b = await soloCompra.A.cierre(null);
  const pa4b = await soloCompra.A.panel(hoy);
  ok('un día de pura compra: salió 120.000 una sola vez, igual que el panel',
    [salioDelCierre(ci4b.resumen), num(pa4b.gastado), mercaderiaAparteDelCierre(ci4b.resumen), ci4b.hubo_actividad], [120000, 120000, 0, true]);
  const fila4b = (await avisos('noche')).find((x) => x.empresa_id === soloCompra.empresaId);
  ok('y su aviso no dice «ninguna venta, todavía estás a tiempo»: dice que no entró plata',
    soloNumeros(fraseDelDia('noche', fila4b, TX, 'es-PY').cuerpo), 'AS:120000');

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Un día solo con clases dadas, sin plata');
  // ═══════════════════════════════════════════════════════════
  const soloClases = await montar('solo-clases', 'clases');
  await soloClases.A.prender(true);
  const pedro = await soloClases.A.cliente('Pedro', '0981000005');
  // Cobró ayer (la plata se corre de día a mano); hoy solo da la clase.
  await soloClases.A.inscribir(pedro, hoy, 200000, true);
  await db.query('update public.movimientos set fecha = $2 where empresa_id = $1', [soloClases.empresaId, ayer]);
  // Marca como dada la clase de hoy de su agenda, como en la pantalla.
  const claseDeHoy = (await db.query('select id from public.turnos_reserva where empresa_id = $1 order by inicia limit 1', [soloClases.empresaId])).rows[0];
  await soloClases.A.valor(soloClases.uid, 'select public.marcar_clase($1, true) j', [claseDeHoy.id]);
  const ci5 = await soloClases.A.cierre(null);
  const pa5 = await soloClases.A.panel(hoy);
  ok('no hubo actividad de plata', [ci5.hubo_actividad, num(ci5.resumen.ventas), num(ci5.resumen.gastos)], [false, 0, 0]);
  ok('pero dio una clase, y el panel de ese día lo sabe', num(pa5.clases_periodo), 1);
  ok('la pantalla tiene con qué decir «Diste 1 clase»', desgloseDelCierre(pa5, hoy, ci5.fecha).clasesDadas, 1);
  ok('y la racha cuenta el día (092)', [ci5.racha.hoy_cargado, ci5.racha.dias >= 1], [true, true]);
  ok('a la noche no recibe nada: no cargó plata',
    fraseDelDia('noche', (await avisos('noche')).find((x) => x.empresa_id === soloClases.empresaId), TX, 'es-PY'), null);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Cerrar el día');
  // ═══════════════════════════════════════════════════════════
  await db.query('update public.suscripciones set tope_vendedores = 2 where empresa_id = $1', [tenis.empresaId]);
  const ayudante = await H.sumarMiembro(db, tenis.empresaId, 'ayudante@tenis.com', 'vendedor');
  const cierresDe = async (id) => Number((await uno('select count(*)::int n from public.cierres where empresa_id = $1', [id])).n);
  ok('antes de cerrar', [ci.ya_cerrado, await cierresDe(tenis.empresaId)], [false, 0]);
  const m1 = await tenis.A.marcar(hoy);
  ok('el profe cierra el día', [m1.ok, m1.ok && String(m1.valor.rows[0].d).length > 0], [true, true]);
  ok('queda cerrado', [(await tenis.A.cierre(null)).ya_cerrado, await cierresDe(tenis.empresaId)], [true, 1]);
  await tenis.A.marcar(hoy);
  ok('dos veces no duplica', await cierresDe(tenis.empresaId), 1);
  ok('es por persona: para su ayudante no figura cerrado', (await tenis.A.cierre(null, ayudante)).ya_cerrado, false);
  rechazado('otra cuenta no cierra el día de esta', await profe.A.como(profe.uid, 'select public.marcar_cierre($1,$2)', [tenis.empresaId, hoy]), 'No pertenecés');
  rechazado('ni mira su cierre', await profe.A.como(profe.uid, 'select public.cierre_del_dia($1,$2)', [tenis.empresaId, hoy]), 'No pertenecés');

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Los avisos del profe que vende');
  // ═══════════════════════════════════════════════════════════
  ok('con plata cargada hoy: ni sin momento, ni a la mañana, ni a la tarde',
    [(await quienes()).includes('tenis'), (await quienes('manana')).includes('tenis'), (await quienes('tarde')).includes('tenis')], [false, false, false]);
  ok('a la noche, sí', (await quienes('noche')).includes('tenis'), true);
  ok('con racha hasta ayer y hoy vacío, el recordatorio de la racha NO le llega (090)',
    (await servicio('select public.empresas_sin_cargar_hoy(2) l')).some((x) => x.empresa_id === tenisRacha.empresaId), false);
  const filaRacha = (await avisos('noche')).find((x) => x.empresa_id === tenisRacha.empresaId);
  ok('ese día vacío la base lo lista a la noche, pero no hay frase: no se le manda nada',
    [Boolean(filaRacha), filaRacha.hoy.cargados, fraseDelDia('noche', filaRacha, TX, 'es-PY')], [true, 0, null]);
  ok('y tampoco a la tarde, que es la que reta', (await quienes('tarde')).includes('tenis-racha'), false);

  // El día que solo regala un producto (venta con descuento total): un
  // movimiento, cero plata. Salía «Hoy no entró plata y gastaste Gs. 0».
  const regalo = await montar('regalo', 'clases');
  await regalo.A.prender(true);
  const grip = await H.crearProducto(db, regalo.empresaId, regalo.uid, { nombre: 'Grip', costo: 5000, precio: 12000, stock: 9 });
  await regalo.A.valor(regalo.uid, 'select public.registrar_venta(p_empresa => $1, p_items => $2::jsonb, p_descuento => $3) id',
    [regalo.empresaId, JSON.stringify([{ producto_id: grip, cantidad: 1 }]), 12000]);
  const ciRegalo = await regalo.A.cierre(null);
  const filaRegalo = (await avisos('noche')).find((x) => x.empresa_id === regalo.empresaId);
  ok('regaló un producto: la base lo trae con un movimiento, cero plata y el costo abajo',
    [filaRegalo.hoy.cargados, num(filaRegalo.hoy.ventas), num(filaRegalo.hoy.ingresos), num(filaRegalo.hoy.gastos), num(filaRegalo.hoy.ganancia)],
    [1, 0, 0, 0, -5000]);
  ok('su cierre dice lo mismo: entró 0, salió 0, ganancia neta -5.000',
    [num(ciRegalo.resumen.ventas) + num(ciRegalo.resumen.otros_ingresos), salioDelCierre(ciRegalo.resumen), num(ciRegalo.resumen.ganancia_neta)],
    [0, 0, -5000]);
  const fraseRegalo = fraseDelDia('noche', filaRegalo, TX, 'es-PY');
  ok('la frase nombra los 5.000 que quedó abajo, no «gastaste Gs. 0», y lleva al cierre',
    [soloNumeros(fraseRegalo.cuerpo), fraseRegalo.url], ['SP:5000', '/cierre']);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Apagarlo, y volver a prenderlo');
  // ═══════════════════════════════════════════════════════════
  const apagar = await tenis.A.como(tenis.uid, 'update public.empresas set vende_productos = false where id = $1 returning id', [tenis.empresaId]);
  ok('el dueño lo apaga', apagar.ok && apagar.valor.rows.length, 1);
  ok('ya no tiene cierre (base y código)',
    [await tenis.A.cierra(), fichaDeLaCuenta(await uno('select rubro, tipo_cuenta, vende_productos from public.empresas where id = $1', [tenis.empresaId])).secciones['/cierre']],
    [false, false]);
  ok('sale del aviso de la noche', (await quienes('noche')).includes('tenis'), false);
  ok('el día que cerró sigue guardado', await cierresDe(tenis.empresaId), 1);
  const ci8 = await tenis.A.cierre(hoy);
  ok('y la base sigue contestando ese día, cerrado y con sus números', [ci8.ya_cerrado, num(ci8.resumen.ganancia_neta)], [true, 400000]);
  await tenis.A.como(tenis.uid, 'update public.empresas set vende_productos = true where id = $1', [tenis.empresaId]);
  ok('al prenderlo de nuevo vuelve todo, con el día cerrado',
    [await tenis.A.cierra(), (await quienes('noche')).includes('tenis'), (await tenis.A.cierre(null)).ya_cerrado], [true, true, true]);

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Comercio y servicios, sin cambios');
  // ═══════════════════════════════════════════════════════════
  const k0 = (await avisos()).find((x) => x.empresa_id === kiosco.empresaId);
  const kN = (await avisos('noche')).find((x) => x.empresa_id === kiosco.empresaId);
  iguales('el kiosco recibe lo mismo con y sin el momento', kN, k0);
  ok('y no es de alumnos', [k0.de_alumnos, (await avisos('noche')).find((x) => x.empresa_id === barber.empresaId).de_alumnos], [false, false]);
  ok('su frase de la noche es la del negocio, y lleva al panel',
    [fraseDelDia('noche', kN, TX, 'es-PY').cuerpo.split(' ')[0], fraseDelDia('noche', kN, TX, 'es-PY').url], ['NEGOCIO', '/panel']);
  ok('cierre_del_dia y marcar_cierre son las de antes, letra por letra',
    ['cierre_del_dia(uuid,date)', 'marcar_cierre(uuid,date)'].map((f) => defAntes.has(f) && defAntes.get(f) === defDespues.get(f)), [true, true]);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · La cuenta personal, nunca');
  // ═══════════════════════════════════════════════════════════
  await db.exec('alter table public.empresas disable trigger user');
  await db.query(`update public.empresas set rubro = 'clases', vende_productos = true where id = $1`, [persona.empresaId]);
  await db.exec('alter table public.empresas enable trigger user');
  ok('con rubro de profe y el interruptor forzados, sigue sin cierre', await persona.A.cierra(), false);
  const filaPersona = (await avisos('noche')).find((x) => x.empresa_id === persona.empresaId);
  ok('sigue en sus avisos de siempre, y no es de alumnos',
    [(await quienes()).includes('persona'), (await quienes('tarde')).includes('persona'), filaPersona.de_alumnos, filaPersona.tipo_cuenta], [true, true, false, 'personal']);
  ok('su frase es la de una persona', fraseDelDia('noche', filaPersona, TX, 'es-PY').cuerpo, 'P');

  // ═══════════════════════════════════════════════════════════
  grupo('11 · La cuenta vencida');
  // ═══════════════════════════════════════════════════════════
  const vencida = await montar('vencida', 'clases');
  await vencida.A.prender(true);
  const ema = await vencida.A.cliente('Ema', '0981000006');
  await vencida.A.inscribir(ema, hoy, 100000, true);
  ok('antes de vencer está en el aviso de la noche', (await quienes('noche')).includes('vencida'), true);
  await db.query(`update public.suscripciones set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day' where empresa_id = $1`, [vencida.empresaId]);
  rechazado('vencida, no marca el cierre (el candado de la 069)', await vencida.A.marcar(hoy), 'Se te terminó la prueba');
  ok('y sale del aviso de la noche (puede_cargar)', (await quienes('noche')).includes('vencida'), false);
  ok('sigue siendo una cuenta con cierre: al pagar, vuelve', await vencida.A.cierra(), true);

  // ═══════════════════════════════════════════════════════════
  grupo('12 · El trainer, igual. El campo, nunca');
  // ═══════════════════════════════════════════════════════════
  const ciT = await trainer.A.cierre(null);
  const paT = await trainer.A.panel(hoy);
  ok('el trainer: entró 720.000 (500.000 de sesiones + 220.000 de productos), ganancia neta 570.000',
    [num(ciT.resumen.ventas), num(paT.cobrado_clases), num(paT.productos.vendido), num(ciT.resumen.ganancia_neta)], [720000, 500000, 220000, 570000]);
  ok('«Salió» = «Gastado»', salioDelCierre(ciT.resumen), num(paT.gastado));
  ok('cierra su día', (await trainer.A.marcar(hoy)).ok, true);
  ok('y a la noche le llega, como al profe', (await avisos('noche')).find((x) => x.empresa_id === trainer.empresaId).de_alumnos, true);
  await campo.A.prender(true);
  await chacra.A.prender(true);
  ok('el campo con el interruptor forzado: sin cierre y sin aviso',
    [await campo.A.cierra(), await chacra.A.cierra(), (await quienes('noche')).some((q) => q === 'campo' || q === 'chacra')], [false, false, false]);

  // ═══════════════════════════════════════════════════════════
  grupo('13 · Permisos y forma');
  // ═══════════════════════════════════════════════════════════
  const puede = async (rol, firma) => (await uno('select has_function_privilege($1, $2, $3) p', [rol, firma, 'execute'])).p;
  ok('cuenta_cierra_el_dia: ni anon ni authenticated; service_role sí',
    [await puede('anon', 'public.cuenta_cierra_el_dia(uuid)'), await puede('authenticated', 'public.cuenta_cierra_el_dia(uuid)'), await puede('service_role', 'public.cuenta_cierra_el_dia(uuid)')],
    [false, false, true]);
  ok('avisos_del_dia(text): lo mismo',
    [await puede('anon', 'public.avisos_del_dia(text)'), await puede('authenticated', 'public.avisos_del_dia(text)'), await puede('service_role', 'public.avisos_del_dia(text)')],
    [false, false, true]);
  rechazado('un usuario común no la puede llamar', await tenis.A.como(tenis.uid, 'select public.avisos_del_dia()'), 'denied|permission');
  rechazado('ni con el momento', await tenis.A.como(tenis.uid, `select public.avisos_del_dia('noche')`), 'denied|permission');
  rechazado('ni preguntar por el cierre de una cuenta', await tenis.A.como(tenis.uid, 'select public.cuenta_cierra_el_dia($1)', [kiosco.empresaId]), 'denied|permission');
  ok('hay UNA sola avisos_del_dia (sin argumentos no es ambigua)',
    (await db.query(`select pg_get_function_identity_arguments(oid) a from pg_proc where proname = 'avisos_del_dia'`)).rows.map((x) => x.a), ['p_momento text']);
  ok('las dos, definer y con el search_path fijo',
    (await db.query(`select proname, prosecdef, proconfig from pg_proc where proname in ('avisos_del_dia', 'cuenta_cierra_el_dia') order by 1`)).rows
      .map((x) => [x.proname, x.prosecdef, x.proconfig]),
    [['avisos_del_dia', true, ['search_path=public']], ['cuenta_cierra_el_dia', true, ['search_path=public']]]);
  ok('rubro_cierra_el_dia sigue contestando lo de la 090',
    (await uno(`select array[public.rubro_cierra_el_dia('clases','emprendedor'), public.rubro_cierra_el_dia('entrenamiento','emprendedor'),
       public.rubro_cierra_el_dia('comercio','emprendedor'), public.rubro_cierra_el_dia('servicios','emprendedor')] c`)).c, [false, false, true, true]);
  const sql128 = leer(archivo('128'));
  ok('la 128 no tiene ni una barra invertida', sql128.includes(BARRA), false);
  ok('ni toca datos (sin insert, update ni delete)', /^\s*(insert|update|delete)\s/im.test(sql128.replace(/^\s*--.*$/gm, '')), false);
  // Dos veces: la segunda no encuentra la firma vieja y pisa la nueva.
  const antesDeRepetir = await avisos('noche');
  await H.aplicarMigracion(db, '128');
  iguales('aplicada dos veces, contesta lo mismo', await avisos('noche'), antesDeRepetir);
  ok('y sigue habiendo una sola', Number((await uno(`select count(*)::int n from pg_proc where proname = 'avisos_del_dia'`)).n), 1);
  // Lo que pasaría si una migración vieja se volviera a correr encima: la
  // firma sin argumentos reaparece, y la 128 la vuelve a sacar.
  await H.aplicarMigracion(db, '106');
  ok('con la 106 encima hay dos firmas', Number((await uno(`select count(*)::int n from pg_proc where proname = 'avisos_del_dia'`)).n), 2);
  await H.aplicarMigracion(db, '128');
  ok('y la 128 deja una sola otra vez', Number((await uno(`select count(*)::int n from pg_proc where proname = 'avisos_del_dia'`)).n), 1);

  // ═══════════════════════════════════════════════════════════
  grupo('14 · avisos_del_dia es la de la 106, salvo lo marcado');
  // ═══════════════════════════════════════════════════════════
  const cuerpo = (sql, firma) => {
    const i = sql.indexOf(`create or replace function public.avisos_del_dia(${firma})`);
    if (i < 0) throw new Error(`no encontré avisos_del_dia(${firma})`);
    const fin = 'end $function$;';
    return sql.slice(i, sql.indexOf(fin, i) + fin.length);
  };
  const de128 = cuerpo(sql128, 'p_momento text default null');
  const de106 = cuerpo(leer(archivo('106')), '');
  const marcadas = de128.split('\n').filter((l) => l.includes('(128)'));
  ok('las líneas marcadas (128) son dos', marcadas.map((l) => l.trim().split(/[ ,(]/)[0]), ["'de_alumnos'", 'or']);
  const sinMarcas = de128.split('\n').filter((l) => !l.includes('(128)')).join('\n')
    .replace('avisos_del_dia(p_momento text default null)', 'avisos_del_dia()');
  corridas++;
  if (sinMarcas === de106) console.log(`  ✓ sin esas dos líneas y con la firma vieja, es la 106 letra por letra → ${de106.length} letras iguales`);
  else { fallos++; console.log('  ✗ el cuerpo de avisos_del_dia de la 128 no es el de la 106'); }

  console.log(`\n${corridas} comprobaciones, ${fallos} fallos, ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
