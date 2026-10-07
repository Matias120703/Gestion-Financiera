/**
 * El personal a 40.000, la prueba más larga y el descuento de cada uno
 * (migración 123, 02/10/2026).
 *
 * Matías: «el plan personal vamos a poner 40.000», «solo 5 % para uso
 * personal, lo que sería el negocio no vas a tocar», «20 días gratis en vez de
 * 8 y para el uso personal 8 días en vez de 5», y que el Premium diga bien que
 * «por cada usuario o funcionario que vaya a tu equipo van a ser 60.000 más».
 *
 * En orden de importancia:
 *   1. que a nadie que ya está probando se le acorte la prueba ni se le saque
 *      un descuento que ya ganó;
 *   2. que el negocio quede como estaba: sus precios, su 18 %, su comisión;
 *   3. que la cuenta personal tenga su precio y su porcentaje, y no los del
 *      negocio;
 *   4. que una base nueva y una que salta desde la 122 terminen con los
 *      mismos números, tenga o no la fila de `ajustes_orden`;
 *   5. que la migración se pueda aplicar dos veces;
 *   6. que el «4 personas» que dicen la portada, /plan y los Términos sobre
 *      el Premium siga saliendo de los precios de la base.
 *
 * Lo que se gana cargando día por día (19 no alcanza, 20 sí; 7 no, 8 sí)
 * está también en habito.test.js, sin la fila de `ajustes_orden`. Acá se
 * repite CON la fila, que es como está producción.
 */
const fs = require('fs');
const path = require('path');
const H = require('./ayuda-db.js');

const RAIZ = path.join(__dirname, '..');
const MIGRACION = 'supabase/migrations/123_precios_prueba_y_descuentos.sql';

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
    console.log(`  ✓ ${nombre} → ${a.length > 150 ? a.slice(0, 147) + '...' : a}`);
  }
}

const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');

/** Aplica la 123 juntando lo que dice por `raise notice`. */
async function aplicar123(db) {
  const avisos = [];
  await db.exec(leer(MIGRACION), { onNotice: (n) => avisos.push(String(n.message ?? n)) });
  return avisos;
}

const descuentoDe = async (db, c) =>
  (await H.comoUsuario(db, c.uid, () =>
    db.query('select public.descuento_por_racha($1) j', [c.empresaId]))).rows[0].j;

/** Carga un movimiento en cada uno de esos días (0 = hoy, 1 = ayer…). */
async function cargar(db, c, haceDias) {
  for (const d of haceDias) {
    await db.query(
      `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria, subtotal, monto)
       values ($1, 'gasto', public.hoy_empresa($1) - $2::int, 'Algo', 'Otros', 1000, 1000)`, [c.empresaId, d]);
  }
}

/** Deja la suscripción como si la cuenta hubiera nacido hace N días, con la prueba de su tipo. */
async function nacio(db, c, haceDias) {
  await db.query(
    `update public.suscripciones s
        set created_at  = now() - make_interval(days => $2::int),
            prueba_fin  = now() - make_interval(days => $2::int) + make_interval(days => public.dias_de_prueba(e.tipo_cuenta)),
            periodo_fin = now() - make_interval(days => $2::int) + make_interval(days => public.dias_de_prueba(e.tipo_cuenta))
       from public.empresas e
      where s.empresa_id = $1 and e.id = s.empresa_id`, [c.empresaId, haceDias]);
}

const preciosDe = async (db, tipo) => (await db.query(
  `select plan, moneda, periodo, importe::float as importe from public.precios
    where tipo_cuenta = $1 order by moneda, plan, periodo`, [tipo])).rows
  .map((r) => `${r.plan} ${r.moneda} ${r.periodo} ${r.importe}`);

async function principal() {
  // ═══════════════════════════════════════════════════════════
  grupo('1 · Una base nueva: los precios');
  // ═══════════════════════════════════════════════════════════
  const db = await H.crearBase();
  {
    ok('el Pro personal: Gs. 40.000 por mes y 440.000 el año; US$ 7 y 77 de referencia',
      await preciosDe(db, 'personal'),
      ['pro PYG anual 440000', 'pro PYG mensual 40000', 'pro USD anual 77', 'pro USD mensual 7']);
    const anual = (await db.query(
      `select (select importe from public.precios where tipo_cuenta='personal' and plan='pro' and moneda='PYG' and periodo='anual')
            / (select importe from public.precios where tipo_cuenta='personal' and plan='pro' and moneda='PYG' and periodo='mensual') as meses`)).rows[0];
    ok('el año son once meses: un mes de regalo', Number(anual.meses), 11);

    // Los del negocio no se tocan.
    const negocio = await db.query(
      `select plan, importe::float as importe from public.precios
        where tipo_cuenta = 'emprendedor' and moneda = 'PYG' and periodo = 'mensual' order by importe`);
    ok('los precios de un negocio siguen iguales',
      negocio.rows.map((r) => [r.plan, r.importe]), [['basico', 110000], ['pro', 190000], ['negocio', 250000]]);
    ok('y cada persona extra del Premium, Gs. 60.000 y US$ 11',
      [Number((await db.query("select public.precio_por_vendedor('PYG') v")).rows[0].v),
        Number((await db.query("select public.precio_por_vendedor('USD') v")).rows[0].v)], [60000, 11]);

    // Lo que ve quien entra a /plan con una cuenta personal.
    const lista = (await db.query("select public.lista_precios('PYG', 'personal') p")).rows[0].p;
    ok('lista_precios le muestra a la personal su precio nuevo',
      lista.map((x) => [x.plan, x.periodo, Number(x.importe)]).sort((a, b) => a[2] - b[2]),
      [['pro', 'mensual', 40000], ['pro', 'anual', 440000]]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Una base nueva: la prueba de 20 y de 8 días');
  // ═══════════════════════════════════════════════════════════
  const jefe = await H.crearUsuario(db, 'jefe@orden.com');
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe]);
  {
    const d = (await db.query(
      "select public.dias_de_prueba('emprendedor') e, public.dias_de_prueba('personal') p, public.dias_de_prueba(null) n")).rows[0];
    ok('dias_de_prueba: 20 un negocio, 8 una cuenta personal; sin tipo, la del negocio', [d.e, d.p, d.n], [20, 8, 20]);

    const N = await H.montarEmpresa(db, { email: 'nuevo@negocio.com', nombre: 'Negocio nuevo' });
    const P = await H.montarEmpresa(db, { email: 'nueva@persona.com', nombre: 'Persona nueva', tipoCuenta: 'personal' });
    const nacimiento = async (c) => (await db.query(
      `select estado,
              round(extract(epoch from (prueba_fin  - created_at)) / 86400)::int as prueba,
              round(extract(epoch from (periodo_fin - created_at)) / 86400)::int as periodo,
              racha_objetivo, racha_porcentaje,
              public.plan_efectivo_calculado(empresa_id) as efectivo
         from public.suscripciones where empresa_id = $1`, [c.empresaId])).rows[0];
    const n = await nacimiento(N);
    const p = await nacimiento(P);
    ok('un negocio nace con 20 días de prueba', [n.estado, n.prueba, n.periodo, n.efectivo], ['prueba', 20, 20, 'pro']);
    ok('una cuenta personal, con 8', [p.estado, p.prueba, p.periodo, p.efectivo], ['prueba', 8, 8, 'pro']);
    ok('y ninguna trae un trato guardado: manda ajustes_orden',
      [n.racha_objetivo, n.racha_porcentaje, p.racha_objetivo, p.racha_porcentaje], [null, null, null, null]);

    // El objetivo de la racha es toda la prueba, y el premio el de su tipo.
    const dn = await descuentoDe(db, N);
    const dp = await descuentoDe(db, P);
    ok('el negocio nuevo: 20 días seguidos para ganar 18 %',
      [dn.fase, dn.objetivo, Number(dn.porcentaje), dn.faltan, dn.logrado, dn.vigente], ['prueba', 20, 18, 20, false, true]);
    ok('la cuenta personal nueva: 8 días seguidos para ganar 5 %',
      [dp.fase, dp.objetivo, Number(dp.porcentaje), dp.faltan, dp.logrado, dp.vigente], ['prueba', 8, 5, 8, false, true]);
    ok('el objetivo de cada uno es su prueba entera',
      [dn.objetivo === d.e, dp.objetivo === d.p], [true, true]);

    // Y se puede cumplir: la racha se cuenta por fechas, entre el día en que
    // nació la cuenta y el día en que termina la prueba. Tiene que haber al
    // menos tantas fechas como días pide el objetivo (hay una de margen).
    const fechas = async (c) => (await db.query(
      `select ((s.prueba_fin at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date
             - (s.created_at at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date + 1) as n
         from public.suscripciones s join public.empresas e on e.id = s.empresa_id
        where s.empresa_id = $1`, [c.empresaId])).rows[0].n;
    ok('el objetivo entra en la prueba: 21 fechas para 20 días, 9 para 8',
      [await fechas(N), await fechas(P)], [dn.objetivo + 1, dp.objetivo + 1]);

    // Sin suscripción (no pasa, pero la función contesta): cada uno lo suyo.
    await db.query('begin');
    await db.query('delete from public.suscripciones where empresa_id = $1', [P.empresaId]);
    const sinSus = (await db.query(
      `select set_config('orden.uid', $1, true), public.descuento_por_racha($2) j`, [jefe, P.empresaId])).rows[0].j;
    await db.query('rollback');
    ok('una cuenta personal sin suscripción tampoco recibe los números del negocio',
      [sinSus.objetivo, Number(sinSus.porcentaje)], [8, 5]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Los números de la promo, sin la fila de ajustes y con ella');
  // ═══════════════════════════════════════════════════════════
  const NUMEROS = { porcentaje: 18, porcentaje_personal: 5, negocio: 20, personal: 8, constancia_porcentaje: 5, constancia_dias: 30 };
  const promo = async (base) => {
    const j = (await base.query('select public.promo_de_la_prueba() j')).rows[0].j;
    return Object.fromEntries(Object.keys(NUMEROS).map((k) => [k, Number(j[k])]));
  };
  {
    ok('en una base nueva no hay fila de ajustes: mandan las reservas',
      (await db.query('select count(*)::int n from public.ajustes_orden')).rows[0].n, 0);
    ok('promo_de_la_prueba devuelve los dos porcentajes y los dos objetivos', await promo(db), NUMEROS);
    ok('y no trae claves de más ni de menos',
      Object.keys((await db.query('select public.promo_de_la_prueba() j')).rows[0].j).sort(), Object.keys(NUMEROS).sort());
    ok('sin sesión también se puede leer (la portada)',
      (await H.intentarComo(db, 'anon', null, () => db.query('select public.promo_de_la_prueba() j'))).ok, true);

    // Con la fila, como en producción: la crea definir_empresa_orden (019).
    const ORDEN = (await H.intentar(db, jefe, () =>
      db.query("select public.crear_empresa('Orden','PYG','Matías') id"))).valor.rows[0].id;
    await H.intentar(db, jefe, () => db.query('select public.definir_empresa_orden($1)', [ORDEN]));
    const fila = (await db.query(
      `select racha_objetivo_negocio n, racha_objetivo_personal p, descuento_racha_porcentaje::float pct,
              descuento_racha_porcentaje_personal::float pctp, descuento_constancia_porcentaje::float c,
              racha_objetivo_constancia cd, comision_porcentaje::float com
         from public.ajustes_orden`)).rows;
    ok('la fila nace con los números nuevos (los valores por defecto de las columnas)',
      fila, [{ n: 20, p: 8, pct: 18, pctp: 5, c: 5, cd: 30, com: 50 }]);
    ok('con la fila, la portada dice lo mismo que sin ella', await promo(db), NUMEROS);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('4 · El descuento de cada uno, con la fila de ajustes');
  // ═══════════════════════════════════════════════════════════
  {
    // Un negocio: 20 días seguidos, 18 %. 19 no alcanza.
    const N = await H.montarEmpresa(db, { email: 'racha@negocio.com', nombre: 'Racha negocio' });
    await db.query(
      `update public.suscripciones set created_at = now() - interval '25 days', prueba_fin = now() + interval '1 day'
        where empresa_id = $1`, [N.empresaId]);
    await cargar(db, N, [19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    let d = await descuentoDe(db, N);
    ok('negocio: con 19 días seguidos no alcanza', [d.objetivo, d.mejor, d.faltan, d.logrado, Number(d.porcentaje)], [20, 19, 1, false, 18]);
    await cargar(db, N, [0]);
    d = await descuentoDe(db, N);
    ok('negocio: con los 20 gana 18 %', [d.mejor, d.faltan, d.logrado, Number(d.porcentaje)], [20, 0, true, 18]);

    // Lo mismo en una prueba REAL, sin estirar nada a mano: nació hace 20
    // días y hoy es su último día. El margen es de una sola fecha: quien no
    // cargó el día en que creó la cuenta llega justo; quien salteó dos, no.
    const R = await H.montarEmpresa(db, { email: 'real@negocio.com', nombre: 'Prueba real' });
    await nacio(db, R, 20);
    await cargar(db, R, [18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    d = await descuentoDe(db, R);
    ok('prueba real de 20 días: empezando al tercer día ya no se llega (19 de 20)',
      [d.objetivo, d.mejor, d.logrado, d.vigente], [20, 19, false, true]);
    await cargar(db, R, [19]);
    d = await descuentoDe(db, R);
    ok('prueba real de 20 días: empezando al segundo día se llega justo, el último día',
      [d.mejor, d.logrado, Number(d.porcentaje), d.vigente], [20, true, 18, true]);

    // Un día salteado corta la racha: 12 + 7 no son 20.
    const C = await H.montarEmpresa(db, { email: 'cortada@negocio.com', nombre: 'Racha cortada' });
    await db.query(
      `update public.suscripciones set created_at = now() - interval '25 days', prueba_fin = now() + interval '1 day'
        where empresa_id = $1`, [C.empresaId]);
    await cargar(db, C, [19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, /* el 7 no */ 6, 5, 4, 3, 2, 1, 0]);
    d = await descuentoDe(db, C);
    ok('negocio: 19 días cargados con uno salteado en el medio no son 20 seguidos', [d.mejor, d.logrado], [12, false]);

    // Una cuenta personal: 8 días seguidos, 5 %. 7 no alcanza.
    const P = await H.montarEmpresa(db, { email: 'racha@persona.com', nombre: 'Racha persona', tipoCuenta: 'personal' });
    await db.query(
      `update public.suscripciones set created_at = now() - interval '10 days', prueba_fin = now() + interval '1 day'
        where empresa_id = $1`, [P.empresaId]);
    await cargar(db, P, [7, 6, 5, 4, 3, 2, 1]);
    d = await descuentoDe(db, P);
    ok('personal: con 7 días seguidos no alcanza', [d.objetivo, d.mejor, d.faltan, d.logrado, Number(d.porcentaje)], [8, 7, 1, false, 5]);
    await cargar(db, P, [0]);
    d = await descuentoDe(db, P);
    ok('personal: con los 8 gana 5 %, no 18', [d.mejor, d.logrado, Number(d.porcentaje)], [8, true, 5]);

    // Ya paga: la constancia es la misma para los dos (5 % con 30 días).
    await db.query("update public.suscripciones set estado = 'activa', plan = 'pro' where empresa_id = any($1)",
      [[N.empresaId, P.empresaId]]);
    const dn = await descuentoDe(db, N);
    const dp = await descuentoDe(db, P);
    ok('al pagar, la constancia sigue en 5 % con 30 días para los dos',
      [[dn.fase, dn.objetivo, Number(dn.porcentaje)], [dp.fase, dp.objetivo, Number(dp.porcentaje)]],
      [['constancia', 30, 5], ['constancia', 30, 5]]);

    // Los números se editan, no se despliegan: cambiar la fila cambia la
    // respuesta, y el del negocio no arrastra al de la personal ni al revés.
    await db.query('begin');
    await db.query('update public.ajustes_orden set descuento_racha_porcentaje_personal = 7, racha_objetivo_personal = 6 where unica');
    const otra = await promo(db);
    const Q = (await db.query(
      `select e.id from public.empresas e join public.suscripciones s on s.empresa_id = e.id
        where e.tipo_cuenta = 'personal' and s.estado = 'prueba' limit 1`)).rows[0].id;
    const dq = (await db.query(
      `select set_config('orden.uid', $1, true), public.descuento_por_racha($2) j`, [jefe, Q])).rows[0].j;
    await db.query('rollback');
    ok('cambiar el porcentaje personal en ajustes_orden no toca el del negocio',
      [otra.porcentaje, otra.porcentaje_personal, otra.negocio, otra.personal], [18, 7, 20, 6]);
    ok('y la cuenta personal lo lee de ahí', [dq.objetivo, Number(dq.porcentaje)], [6, 7]);

    // Rechazado o sin efecto (RLS), da igual: lo que importa es que el
    // número no cambió.
    await H.intentar(db, N.uid, () =>
      db.query('update public.ajustes_orden set descuento_racha_porcentaje_personal = 99'));
    ok('nadie cambia esos números desde el cliente',
      Number((await db.query('select descuento_racha_porcentaje_personal p from public.ajustes_orden')).rows[0].p), 5);
    const propio = await H.intentar(db, N.uid, () =>
      db.query('update public.suscripciones set racha_objetivo = 1, racha_porcentaje = 100 where empresa_id = $1', [N.empresaId]));
    ok('ni se escribe un trato propio en su suscripción',
      [propio.ok, (await db.query('select racha_objetivo o, racha_porcentaje p from public.suscripciones where empresa_id = $1',
        [N.empresaId])).rows[0]], [false, { o: null, p: null }]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('5 · La comisión del socio con el personal nuevo');
  // ═══════════════════════════════════════════════════════════
  {
    const S = await H.montarEmpresa(db, { email: 'socia@negocio.com', nombre: 'La que recomienda' });
    const cod = (await H.comoUsuario(db, S.uid, () => db.query('select public.mi_codigo_socio() j'))).rows[0].j.codigo;
    const traer = async (email, nombre, tipoCuenta) => {
      const c = await H.montarEmpresa(db, { email, nombre, tipoCuenta });
      await H.comoUsuario(db, c.uid, () => db.query('select public.usar_codigo_referido($1,$2)', [c.empresaId, cod]));
      return c;
    };
    const cobrar = (c, plan, importe) => H.intentar(db, jefe, () => db.query(
      'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5::numeric,$6::integer) j',
      [c.empresaId, plan, 1, 'transferencia', importe, null]));
    const comisionDe = async (c) => {
      const r = (await db.query('select base::float as base, monto::float as monto from public.comisiones where empresa_id = $1',
        [c.empresaId])).rows[0];
      return r ? [r.base, r.monto] : null;
    };

    const P1 = await traer('lista@persona.com', 'Paga la lista', 'personal');
    ok('se cobra el Pro personal de lista', (await cobrar(P1, 'pro', 40000)).ok, true);
    ok('la comisión es la mitad de 40.000: Gs. 20.000', await comisionDe(P1), [40000, 20000]);

    // Pagó con su 5 % de la racha: la comisión no baja (es sobre la lista).
    const P2 = await traer('descuento@persona.com', 'Paga con el 5 %', 'personal');
    await cobrar(P2, 'pro', 38000);
    ok('si pagó con el 5 % (Gs. 38.000), la comisión sigue siendo 20.000', await comisionDe(P2), [40000, 20000]);

    // Pagó el año: sigue siendo la mitad de UN mes de lista.
    const P3 = await traer('anual@persona.com', 'Paga el año', 'personal');
    await cobrar(P3, 'pro', 440000);
    ok('si pagó el año (Gs. 440.000), también 20.000', await comisionDe(P3), [40000, 20000]);

    // Y el negocio, igual que siempre.
    const N1 = await traer('lista@comercio.com', 'Comercio traído');
    await cobrar(N1, 'pro', 190000);
    ok('la comisión por un negocio no cambió: la mitad de 190.000', await comisionDe(N1), [190000, 95000]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('6 · El Premium: cuántas personas trae su precio');
  // ═══════════════════════════════════════════════════════════
  {
    const incluidas = Number((leer('src/lib/constantes.ts').match(/export const PERSONAS_INCLUIDAS_PREMIUM = (\d+);/) ?? [])[1]);
    ok('se leyó PERSONAS_INCLUIDAS_PREMIUM de constantes.ts', Number.isInteger(incluidas), true);
    // 124: la base ya conoce ese número (lo usa para cobrar por Bancard). Son
    // el mismo: si se cambia uno sin el otro, la pantalla y el cobro dirían
    // precios distintos.
    ok('y es el mismo que usa la base para cobrar: personas_incluidas_premium()',
      (await db.query('select public.personas_incluidas_premium() n')).rows[0].n, incluidas);

    const precio = async (plan) => Number((await db.query(
      `select importe from public.precios
        where tipo_cuenta = 'emprendedor' and plan = $1 and moneda = 'PYG' and periodo = 'mensual'`, [plan])).rows[0].importe);
    const porPersona = Number((await db.query("select public.precio_por_vendedor('PYG') v")).rows[0].v);
    const limite = async (plan) => (await db.query('select public.limites_plan($1) j', [plan])).rows[0].j.miembros;
    const pro = await limite('pro');
    const tope = await limite('negocio');

    // La cuenta que hace la administración al cobrar: el Pro son el dueño y 2
    // más, cada persona de más suma lo que dice precio_por_vendedor, y el
    // Premium de lista vale justo un Pro más una persona.
    ok('el Premium de lista vale un Pro más una persona extra',
      (await precio('negocio')) - (await precio('pro')), porPersona);
    ok('así que su precio trae las personas del Pro más una: el dueño y 3 más', incluidas, pro + 1);
    ok('y de ahí hasta el tope del plan se suma por persona', [tope, tope > incluidas], [15, true]);
    ok('llegar al tope cuesta el Premium más once personas',
      (await precio('negocio')) + (tope - incluidas) * porPersona, 910000);

    // El espejo de la pantalla dice el mismo tope y las mismas personas del Pro.
    const preciosTs = leer('src/lib/precios.ts');
    ok('LIMITES_VISIBLES dice lo mismo que limites_plan()',
      [Number((preciosTs.match(/pro:\s*\{[^}]*miembros:\s*(\d+)/) ?? [])[1]),
        Number((preciosTs.match(/negocio:\s*\{[^}]*miembros:\s*(\d+)/) ?? [])[1])], [pro, tope]);

    // Cómo queda la cuenta cuando la administración activa un Premium.
    const E = await H.montarEmpresa(db, { email: 'equipo@local.com', nombre: 'Local con equipo' });
    const activar = async (vendedores, importe) => (await H.intentar(db, jefe, () => db.query(
      'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5::numeric,$6::integer) j',
      [E.empresaId, 'negocio', 1, 'transferencia', importe, vendedores]))).valor.rows[0].j.personas_permitidas;
    ok('Premium con 3 vendedores habilitados: entran las 4 personas del precio base',
      await activar(incluidas - 1, 250000), incluidas);
    ok('con 5 vendedores (dos personas más, Gs. 120.000 más): entran 6', await activar(5, 370000), 6);
    // OJO, y por eso el aviso en el panel de administración: si al activar no
    // se escribe el número, entra el tope del plan por el precio base.
    await H.intentar(db, jefe, () => db.query(
      'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5::numeric,$6::integer) j', [E.empresaId, 'negocio', 1, 'x', 250000, -1]));
    ok('sin número escrito manda el tope del plan (lo dice la ayuda del panel de administración)',
      [(await db.query('select public.tope_de_miembros($1) t', [E.empresaId])).rows[0].t,
        leer('src/components/PanelAdmin.tsx').includes('En un Premium escribí siempre el número')], [tope, true]);

    // Las tres pantallas dicen el Premium con esos números, leídos.
    const plan = leer('src/app/(app)/plan/page.tsx');
    ok('/plan dice las personas incluidas y lo que suma cada una, con el precio leído de la base',
      [plan.includes('t.plan.premiumIncluye(PERSONAS_INCLUIDAS_PREMIUM)'), plan.includes('t.plan.premiumPorPersona('),
        plan.includes("rpc('precio_por_vendedor'")], [true, true, true]);
    const terminos = leer('src/app/terminos/page.tsx');
    ok('los Términos también, con los importes leídos',
      [terminos.includes("rpc('precio_por_vendedor'"), terminos.includes("rpc('lista_precios'"),
        (leer('src/i18n/textos/legal.ts').match(/\{ especial: 'premium' \}/g) || []).length], [true, true, 2]);
    for (const [idioma, archivo] of [['es', 'src/i18n/textos/es.ts'], ['pt', 'src/i18n/textos/pt.ts']]) {
      const t = leer(archivo);
      ok(`${idioma}: /plan y la pregunta frecuente tienen el texto del Premium, sin importes escritos`,
        [t.includes('premiumIncluye: (n: number)'), t.includes('premiumPorPersona: (monto: string | null, tope: number)'),
          t.includes('${equipo.porPersona}'), /(250|60)\.000/.test(t.replace(/^\s*\/\/.*$/gm, ''))], [true, true, true, false]);
    }
  }

  // ═══════════════════════════════════════════════════════════
  grupo('7 · El salto desde la 122: nadie pierde días ni lo que ya ganó');
  // ═══════════════════════════════════════════════════════════
  for (const conFila of [true, false]) {
    const como = conFila ? 'con la fila de ajustes' : 'sin la fila de ajustes';
    const vieja = await H.crearBase({ hasta: '122' });
    if (conFila) await vieja.query('insert into public.ajustes_orden (unica) values (true)');

    const mk = (email, nombre, tipoCuenta) => H.montarEmpresa(vieja, { email, nombre, tipoCuenta });

    // Negocios. La prueba de antes: 8 días.
    const N1 = await mk('n1@x.com', 'N1 día 3 de su prueba');            await nacio(vieja, N1, 3);
    const N2 = await mk('n2@x.com', 'N2 venció hace 4 días');            await nacio(vieja, N2, 12);
    const N3 = await mk('n3@x.com', 'N3 venció hace 22 días');           await nacio(vieja, N3, 30);
    const N4 = await mk('n4@x.com', 'N4 estirada a mano');               await nacio(vieja, N4, 6);
    await vieja.query(
      `update public.suscripciones set prueba_fin = now() + interval '40 days', periodo_fin = now() + interval '40 days'
        where empresa_id = $1`, [N4.empresaId]);
    const N5 = await mk('n5@x.com', 'N5 ya paga');
    await vieja.query(
      `update public.suscripciones set estado = 'activa', created_at = now() - interval '9 days',
              periodo_fin = now() + interval '15 days' where empresa_id = $1`, [N5.empresaId]);
    const N6 = await mk('n6@x.com', 'N6 ya juntó sus 8');                await nacio(vieja, N6, 8);
    await cargar(vieja, N6, [7, 6, 5, 4, 3, 2, 1, 0]);
    const N7 = await mk('n7@x.com', 'N7 va 4 de 8');                     await nacio(vieja, N7, 3);
    await cargar(vieja, N7, [3, 2, 1, 0]);
    // Cuentas personales. La prueba de antes: 5 días.
    const P1 = await mk('p1@x.com', 'P1 día 2 de su prueba', 'personal'); await nacio(vieja, P1, 2);
    const P2 = await mk('p2@x.com', 'P2 en Gratis hace 1 día', 'personal'); await nacio(vieja, P2, 6);
    const P3 = await mk('p3@x.com', 'P3 ya juntó sus 5', 'personal');     await nacio(vieja, P3, 4);
    await cargar(vieja, P3, [4, 3, 2, 1, 0]);
    const P4 = await mk('p4@x.com', 'P4 en Gratis hace 15 días', 'personal'); await nacio(vieja, P4, 20);

    const todas = { N1, N2, N3, N4, N5, N6, N7, P1, P2, P3, P4 };
    const foto = async () => {
      const o = {};
      for (const [k, c] of Object.entries(todas)) {
        const s = (await vieja.query(
          `select estado, plan, prueba_fin::text as prueba_fin, periodo_fin::text as periodo_fin,
                  extract(epoch from prueba_fin)::float as prueba_ts, extract(epoch from periodo_fin)::float as periodo_ts,
                  round(extract(epoch from (periodo_fin - created_at)) / 86400)::int as dura,
                  round(extract(epoch from (periodo_fin - now())) / 86400)::int as faltan,
                  public.plan_efectivo_calculado(empresa_id) as efectivo
             from public.suscripciones where empresa_id = $1`, [c.empresaId])).rows[0];
        const d = await descuentoDe(vieja, c);
        o[k] = { ...s, objetivo: d.objetivo, mejor: d.mejor, logrado: d.logrado, porcentaje: Number(d.porcentaje), fase: d.fase };
      }
      return o;
    };
    const guardado = async () => (await vieja.query(
      `select e.nombre, s.racha_objetivo, s.racha_porcentaje::float as racha_porcentaje
         from public.suscripciones s join public.empresas e on e.id = s.empresa_id
        where s.racha_objetivo is not null or s.racha_porcentaje is not null order by e.nombre`)).rows;

    const antes = await foto();
    ok(`${como} · antes: el negocio ve 8 días y 18 %, la personal 5 días y 18 %`,
      [[antes.N1.dura, antes.N1.objetivo, antes.N1.porcentaje], [antes.P1.dura, antes.P1.objetivo, antes.P1.porcentaje]],
      [[8, 8, 18], [5, 5, 18]]);
    ok(`${como} · antes: N6 y P3 ya tienen su descuento ganado`,
      [[antes.N6.mejor, antes.N6.logrado, antes.N6.porcentaje], [antes.P3.mejor, antes.P3.logrado, antes.P3.porcentaje]],
      [[8, true, 18], [5, true, 18]]);
    ok(`${como} · antes: el Pro personal vale 60.000`,
      await preciosDe(vieja, 'personal'), ['pro PYG anual 660000', 'pro PYG mensual 60000', 'pro USD anual 121', 'pro USD mensual 11']);
    const negocioAntes = await preciosDe(vieja, 'emprendedor');
    const adicionalesAntes = (await vieja.query('select concepto, moneda, importe::float as importe from public.precios_adicionales order by moneda')).rows;

    const avisos = await aplicar123(vieja);
    const despues = await foto();

    // ---- los precios ----
    ok(`${como} · el Pro personal pasa a 40.000 / 440.000 y US$ 7 / 77`,
      await preciosDe(vieja, 'personal'), ['pro PYG anual 440000', 'pro PYG mensual 40000', 'pro USD anual 77', 'pro USD mensual 7']);
    ok(`${como} · los precios del negocio no se tocan`, await preciosDe(vieja, 'emprendedor'), negocioAntes);
    ok(`${como} · ni el de la persona extra del Premium`,
      (await vieja.query('select concepto, moneda, importe::float as importe from public.precios_adicionales order by moneda')).rows, adicionalesAntes);

    // ---- los números de la promo: iguales a los de una base nueva ----
    ok(`${como} · la promo queda igual que en una base nueva`, await promo(vieja), NUMEROS);
    ok(`${como} · y los días de prueba también`,
      (await vieja.query("select public.dias_de_prueba('emprendedor') e, public.dias_de_prueba('personal') p")).rows[0], { e: 20, p: 8 });
    if (conFila) {
      ok('con la fila · la fila quedó con los números nuevos, y el 18 % del negocio intacto',
        (await vieja.query(
          `select racha_objetivo_negocio n, racha_objetivo_personal p, descuento_racha_porcentaje::float pct,
                  descuento_racha_porcentaje_personal::float pctp, descuento_constancia_porcentaje::float c
             from public.ajustes_orden`)).rows, [{ n: 20, p: 8, pct: 18, pctp: 5, c: 5 }]);
    }

    // ---- las pruebas ----
    ok(`${como} · NADIE pierde un día: ninguna fecha quedó antes de donde estaba`,
      Object.keys(todas).filter((k) => despues[k].periodo_ts < antes[k].periodo_ts || despues[k].prueba_ts < antes[k].prueba_ts), []);
    ok(`${como} · N1 (día 3 de 8): ahora su prueba dura 20 días y le quedan 17`,
      [despues.N1.dura, despues.N1.faltan, despues.N1.estado, despues.N1.efectivo], [20, 17, 'prueba', 'pro']);
    ok(`${como} · N2 (vencida hace 4 días, nació hace 12): se reabre con 8 días`,
      [antes.N2.efectivo, despues.N2.efectivo, despues.N2.dura, despues.N2.faltan], ['gratis', 'pro', 20, 8]);
    ok(`${como} · N3 (nació hace 30 días): igual seguiría vencida, no se toca`,
      [despues.N3.prueba_fin === antes.N3.prueba_fin, despues.N3.periodo_fin === antes.N3.periodo_fin, despues.N3.efectivo],
      [true, true, 'gratis']);
    ok(`${como} · N4 (estirada a mano a 40 días): no se acorta`,
      [despues.N4.periodo_fin === antes.N4.periodo_fin, despues.N4.prueba_fin === antes.N4.prueba_fin, despues.N4.faltan], [true, true, 40]);
    ok(`${como} · N5 (ya paga): no se toca nada`,
      [despues.N5.estado, despues.N5.periodo_fin === antes.N5.periodo_fin, despues.N5.prueba_fin === antes.N5.prueba_fin],
      ['activa', true, true]);
    ok(`${como} · P1 (día 2 de 5): ahora su prueba dura 8 días y le quedan 6`,
      [despues.P1.dura, despues.P1.faltan, despues.P1.efectivo], [8, 6, 'pro']);
    ok(`${como} · P2 (en Gratis hace un día, nació hace 6): vuelve al Pro de prueba 2 días`,
      [antes.P2.efectivo, despues.P2.efectivo, despues.P2.dura, despues.P2.faltan], ['gratis', 'pro', 8, 2]);
    ok(`${como} · P4 (nació hace 20 días): sigue en Gratis, no se toca`,
      [despues.P4.periodo_fin === antes.P4.periodo_fin, despues.P4.efectivo], [true, 'gratis']);
    ok(`${como} · en todas, la prueba y el período terminan el mismo día`,
      ['N1', 'N2', 'P1', 'P2'].filter((k) => despues[k].prueba_fin !== despues[k].periodo_fin), []);

    // ---- lo ya ganado ----
    ok(`${como} · N6 conserva su 18 % ganado con 8 días`,
      [despues.N6.objetivo, despues.N6.mejor, despues.N6.logrado, despues.N6.porcentaje], [8, 8, true, 18]);
    ok(`${como} · P3 conserva su 18 % ganado con 5 días (no baja a 5 %)`,
      [despues.P3.objetivo, despues.P3.mejor, despues.P3.logrado, despues.P3.porcentaje], [5, 5, true, 18]);
    ok(`${como} · y son las únicas dos con un trato guardado`, await guardado(), [
      { nombre: 'N6 ya juntó sus 8', racha_objetivo: 8, racha_porcentaje: 18 },
      { nombre: 'P3 ya juntó sus 5', racha_objetivo: 5, racha_porcentaje: 18 },
    ]);
    ok(`${como} · N7 (iba 4 de 8) pasa al objetivo nuevo: 20 días, 18 %`,
      [despues.N7.objetivo, despues.N7.mejor, despues.N7.logrado, despues.N7.porcentaje], [20, 4, false, 18]);
    ok(`${como} · P1 (sin racha) pasa a 8 días y 5 %`,
      [despues.P1.objetivo, despues.P1.logrado, despues.P1.porcentaje], [8, false, 5]);
    ok(`${como} · N5, que paga, sigue en la constancia de siempre`,
      [despues.N5.fase, despues.N5.objetivo, despues.N5.porcentaje], ['constancia', 30, 5]);

    // Y N6 puede seguir con su prueba estirada sin perder lo ganado.
    ok(`${como} · N6 además tiene sus 20 días de prueba`, [despues.N6.dura, despues.N6.faltan], [20, 12]);

    // ---- lo que dice la migración al aplicarse ----
    const estiradas = avisos.filter((a) => a.includes('prueba estirada:'));
    ok(`${como} · avisa cada prueba que estiró, por su nombre`,
      ['N1', 'N2', 'N6', 'N7', 'P1', 'P2', 'P3'].map((k) => estiradas.some((a) => a.includes(k + ' '))),
      [true, true, true, true, true, true, true]);
    ok(`${como} · y ninguna de las que no tocó`,
      ['N3 ', 'N4 ', 'N5 ', 'P4 '].filter((k) => estiradas.some((a) => a.includes(k))), []);
    ok(`${como} · con la cuenta total`, avisos.filter((a) => a.includes('pruebas estiradas: 7')).length, 1);
    ok(`${como} · y a quién le respetó el descuento`,
      [avisos.filter((a) => a.includes('conserva su 18 %')).map((a) => (a.match(/(N6|P3) /) ?? [])[1]).sort(),
        avisos.some((a) => a.includes('ya habían ganado el descuento: 2'))], [['N6', 'P3'], true]);

    // ---- lo que queda anotado en el registro de cada cuenta ----
    //
    // El `raise notice` se pierde si quien aplica la migración no lo muestra.
    // Lo que se le movió a cada cuenta tiene que quedar en `registro_admin`
    // (016), que es donde se mira cuando alguien reclama: con la fecha de
    // antes, para poder volver atrás una sola cuenta.
    const jefeV = await H.crearUsuario(vieja, 'jefe@orden.com');
    await vieja.query('insert into public.superadmins (usuario_id) values ($1)', [jefeV]);
    const anotadas = async (accion) => (await vieja.query(
      `select e.nombre, r.empresa_id, r.actor_id, r.detalle,
              extract(epoch from (r.detalle ->> 'vence_antes')::timestamptz)::float      as antes_ts,
              extract(epoch from (r.detalle ->> 'prueba_fin_antes')::timestamptz)::float as prueba_antes_ts,
              extract(epoch from (r.detalle ->> 'vence_despues')::timestamptz)::float    as despues_ts
         from public.registro_admin r join public.empresas e on e.id = r.empresa_id
        where r.accion = $1 order by e.nombre`, [accion])).rows;
    const clave = (nombre) => nombre.split(' ')[0];
    const estiradasReg = await anotadas('prueba_estirada_123');
    ok(`${como} · cada prueba estirada queda en el registro de su cuenta, y solo esas`,
      estiradasReg.map((r) => clave(r.nombre)), ['N1', 'N2', 'N6', 'N7', 'P1', 'P2', 'P3']);
    ok(`${como} · con la fecha en que terminaba antes y la de ahora, exactas`,
      estiradasReg.filter((r) => r.antes_ts !== antes[clave(r.nombre)].periodo_ts
        || r.prueba_antes_ts !== antes[clave(r.nombre)].prueba_ts
        || r.despues_ts !== despues[clave(r.nombre)].periodo_ts).map((r) => clave(r.nombre)), []);
    // N6 nació hace 8 días justos: su prueba de 8 terminó en ese instante,
    // así que también cuenta como reabierta. Es lo mismo que decía su plan
    // efectivo antes de la migración.
    ok(`${como} · dice cuáles ya habían terminado y se reabrieron: N2, N6 y P2`,
      [estiradasReg.filter((r) => r.detalle.reabierta === true).map((r) => clave(r.nombre)),
        estiradasReg.filter((r) => r.detalle.reabierta !== (antes[clave(r.nombre)].efectivo === 'gratis')).map((r) => clave(r.nombre))],
      [['N2', 'N6', 'P2'], []]);
    ok(`${como} · con el tipo de cuenta, los días de su prueba nueva y una nota para leer`,
      estiradasReg.map((r) => [r.detalle.tipo_cuenta, r.detalle.dias, typeof r.detalle.nota === 'string' && r.detalle.nota.includes('123')])
        .filter((x, i) => JSON.stringify(x) !== JSON.stringify(
          [clave(estiradasReg[i].nombre).startsWith('P') ? 'personal' : 'emprendedor',
            clave(estiradasReg[i].nombre).startsWith('P') ? 8 : 20, true])), []);
    ok(`${como} · sin actor: lo hizo el sistema, no una persona`, estiradasReg.filter((r) => r.actor_id !== null).length, 0);

    const conservadasReg = await anotadas('descuento_conservado_123');
    ok(`${como} · y a quién se le respetó el descuento, con el trato que conserva`,
      conservadasReg.map((r) => [clave(r.nombre), r.detalle.racha_objetivo, Number(r.detalle.racha_porcentaje), r.detalle.mejor]),
      [['N6', 8, 18, 8], ['P3', 5, 18, 5]]);

    // El historial de la ficha (lo que ve la administración) lo muestra.
    const historialDe = async (c) => (await H.intentar(vieja, jefeV, () =>
      vieja.query('select public.historial_cuenta($1) j', [c.empresaId]))).valor.rows[0].j;
    const hN2 = await historialDe(N2);
    ok(`${como} · el historial de N2 muestra que se le reabrió la prueba, hecho por el sistema`,
      hN2.map((h) => [h.accion, h.quien, h.detalle.reabierta]), [['prueba_estirada_123', 'sistema', true]]);
    ok(`${como} · el de N6, las dos cosas`,
      (await historialDe(N6)).map((h) => h.accion).sort(), ['descuento_conservado_123', 'prueba_estirada_123']);
    ok(`${como} · y el de una cuenta que no se tocó sigue vacío`,
      [(await historialDe(N3)).length, (await historialDe(N5)).length], [0, 0]);

    // No se confunde con un cambio hecho a mano: «Deshacer el último cambio»
    // (022) no aparece por esto en ninguna cuenta.
    const lista = (await H.intentar(vieja, jefeV, () => vieja.query('select public.listar_cuentas() j'))).valor.rows[0].j;
    ok(`${como} · ninguna cuenta queda con «Deshacer el último cambio» por la migración`,
      lista.filter((c) => c.puede_deshacer).map((c) => c.nombre), []);

    // Y con lo anotado alcanza para volver atrás una sola cuenta.
    await vieja.query('begin');
    await vieja.query(
      `update public.suscripciones s
          set periodo_fin = (r.detalle ->> 'vence_antes')::timestamptz,
              prueba_fin  = (r.detalle ->> 'prueba_fin_antes')::timestamptz
         from public.registro_admin r
        where r.accion = 'prueba_estirada_123' and r.empresa_id = s.empresa_id and s.empresa_id = $1`, [N2.empresaId]);
    const vuelta = (await vieja.query(
      `select prueba_fin::text as prueba_fin, periodo_fin::text as periodo_fin, public.plan_efectivo_calculado(empresa_id) as efectivo
         from public.suscripciones where empresa_id = $1`, [N2.empresaId])).rows[0];
    const otraIntacta = (await vieja.query(
      'select periodo_fin::text as f from public.suscripciones where empresa_id = $1', [N1.empresaId])).rows[0].f;
    await vieja.query('rollback');
    ok(`${como} · con lo anotado se vuelve atrás una sola cuenta (N2) sin tocar otra (N1)`,
      [vuelta.prueba_fin === antes.N2.prueba_fin, vuelta.periodo_fin === antes.N2.periodo_fin, vuelta.efectivo,
        otraIntacta === despues.N1.periodo_fin], [true, true, 'gratis', true]);

    // ---- idempotente ----
    const registroAntes = (await vieja.query('select count(*)::int n from public.registro_admin')).rows[0].n;
    const otraVez = await aplicar123(vieja);
    ok(`${como} · aplicada dos veces deja todo igual`, await foto(), despues);
    ok(`${como} · y no anota nada de nuevo en el registro (7 pruebas y 2 descuentos, una vez)`,
      [registroAntes, (await vieja.query('select count(*)::int n from public.registro_admin')).rows[0].n], [9, 9]);
    ok(`${como} · la segunda vez no estira nada ni vuelve a repartir descuentos`,
      [otraVez.some((a) => a.includes('pruebas estiradas: 0')), otraVez.some((a) => a.includes('no se vuelve a mirar')),
        otraVez.some((a) => a.includes('conserva su 18 %')), (await guardado()).length], [true, true, false, 2]);
    ok(`${como} · y los precios y la promo siguen iguales`,
      [await preciosDe(vieja, 'personal'), await promo(vieja)],
      [['pro PYG anual 440000', 'pro PYG mensual 40000', 'pro USD anual 77', 'pro USD mensual 7'], NUMEROS]);

    // ---- una cuenta que nace después del salto ----
    const NN = await mk('nn@x.com', 'Negocio de después');
    const PN = await mk('pn@x.com', 'Persona de después', 'personal');
    const dn = await descuentoDe(vieja, NN);
    const dp = await descuentoDe(vieja, PN);
    const dura = async (c) => (await vieja.query(
      'select round(extract(epoch from (prueba_fin - created_at)) / 86400)::int d from public.suscripciones where empresa_id = $1',
      [c.empresaId])).rows[0].d;
    ok(`${como} · una cuenta que nace después: 20 días y 18 % el negocio, 8 días y 5 % la personal`,
      [[await dura(NN), dn.objetivo, Number(dn.porcentaje)], [await dura(PN), dp.objetivo, Number(dp.porcentaje)]],
      [[20, 20, 18], [8, 8, 5]]);

    await vieja.close();
  }

  // ═══════════════════════════════════════════════════════════
  grupo('8 · La migración, como texto');
  // ═══════════════════════════════════════════════════════════
  {
    const sql = leer(MIGRACION);
    // El MCP con el que se aplica convierte las secuencias de escape y deja
    // las barras dobles (rompió una función el 30/09): que no haya ninguna.
    ok('sin barras invertidas', sql.includes('\\'), false);
    const cuerpo = (nombre) => sql.slice(sql.indexOf(`create or replace function public.${nombre}(`));
    ok('descuento_por_racha sigue siendo security definer con su search_path',
      /^create or replace function public\.descuento_por_racha\(p_empresa uuid\)\nreturns jsonb language plpgsql stable security definer set search_path = public as/
        .test(cuerpo('descuento_por_racha')), true);
    ok('promo_de_la_prueba también',
      /^create or replace function public\.promo_de_la_prueba\(\)\nreturns jsonb language sql stable security definer set search_path = public as/
        .test(cuerpo('promo_de_la_prueba')), true);
    ok('dias_de_prueba sigue inmutable y con su search_path',
      /^create or replace function public\.dias_de_prueba\(p_tipo text\)\nreturns integer language sql immutable set search_path = public as/
        .test(cuerpo('dias_de_prueba')), true);
    ok('con los mismos permisos de siempre',
      ['revoke all on function public.descuento_por_racha(uuid) from public, anon;',
        'grant execute on function public.descuento_por_racha(uuid) to authenticated;',
        'grant execute on function public.promo_de_la_prueba() to anon, authenticated;',
        'grant execute on function public.dias_de_prueba(text) to anon, authenticated;'].filter((l) => !sql.includes(l)), []);
    const deOtro = (await db.query("select id from public.empresas where nombre = 'Racha negocio'")).rows[0].id;
    const ajena = await H.montarEmpresa(db, { email: 'ajena@x.com', nombre: 'Ajena' });
    const intentoAjeno = await H.intentar(db, ajena.uid, () => db.query('select public.descuento_por_racha($1)', [deOtro]));
    ok('una cuenta ajena no lee el descuento de otra',
      [intentoAjeno.ok, /due[nñ]o/i.test(intentoAjeno.error ?? '')], [false, true]);
    const intentoAnonimo = await H.intentarComo(db, 'anon', null, () => db.query('select public.descuento_por_racha($1)', [deOtro]));
    ok('ni nadie sin sesión', [intentoAnonimo.ok, /denied|permiso|permission/i.test(intentoAnonimo.error ?? '')], [false, true]);

    // El espejo de la pantalla dice lo mismo que la base.
    const constantes = leer('src/lib/constantes.ts');
    const bloque = constantes.slice(constantes.indexOf('export const DIAS_DE_PRUEBA'));
    ok('DIAS_DE_PRUEBA (lo que dicen la portada y los Términos) coincide con la base',
      [Number((bloque.match(/emprendedor:\s*(\d+)/) ?? [])[1]), Number((bloque.match(/personal:\s*(\d+)/) ?? [])[1])],
      [(await db.query("select public.dias_de_prueba('emprendedor') d")).rows[0].d,
        (await db.query("select public.dias_de_prueba('personal') d")).rows[0].d]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Cambiar el tipo de cuenta en plena prueba');
  // ═══════════════════════════════════════════════════════════
  //
  // La administración pasa a negocio a quien se registró como personal y
  // abrió un local (016). La prueba la escribió `crear_empresa` con los días
  // del tipo con el que nació: sin esto quedaba con 8 días de prueba y un
  // objetivo de 20 días seguidos, que no entra en 9 fechas, mientras la
  // portada y los Términos le prometen 20 días a un negocio.
  {
    const cambiar = (c, tipo) => H.intentar(db, jefe, () =>
      db.query('select public.cambiar_tipo_cuenta($1,$2) j', [c.empresaId, tipo]));
    const estado = async (c) => {
      const s = (await db.query(
        `select s.estado,
                round(extract(epoch from (s.prueba_fin  - s.created_at)) / 86400)::int as prueba,
                round(extract(epoch from (s.periodo_fin - s.created_at)) / 86400)::int as periodo,
                round(extract(epoch from (s.periodo_fin - now())) / 86400)::int as quedan,
                s.prueba_fin::text as prueba_fin, s.periodo_fin::text as periodo_fin,
                extract(epoch from s.periodo_fin)::float as periodo_ts,
                ((s.prueba_fin at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date
                  - (s.created_at at time zone coalesce(e.zona_horaria, 'America/Asuncion'))::date + 1) as fechas,
                e.tipo_cuenta, public.plan_efectivo_calculado(s.empresa_id) as efectivo
           from public.suscripciones s join public.empresas e on e.id = s.empresa_id
          where s.empresa_id = $1`, [c.empresaId])).rows[0];
      const d = (await H.comoUsuario(db, jefe, () =>
        db.query('select public.descuento_por_racha($1) j', [c.empresaId]))).rows[0].j;
      return { ...s, objetivo: d.objetivo, porcentaje: Number(d.porcentaje) };
    };
    const ultimoCambio = async (c) => (await db.query(
      `select detalle,
              extract(epoch from (detalle ->> 'vence_antes')::timestamptz)::float   as antes_ts,
              extract(epoch from (detalle ->> 'vence_despues')::timestamptz)::float as despues_ts
         from public.registro_admin where empresa_id = $1 and accion = 'cambiar_tipo'
        order by created_at desc limit 1`, [c.empresaId])).rows[0];

    // Recién nacida como personal → negocio.
    const A = await H.montarEmpresa(db, { email: 'abrio@local.com', nombre: 'Abrió un local', tipoCuenta: 'personal' });
    const aAntes = await estado(A);
    ok('nace personal: 8 días de prueba, objetivo 8, 5 %',
      [aAntes.tipo_cuenta, aAntes.prueba, aAntes.objetivo, aAntes.porcentaje], ['personal', 8, 8, 5]);
    const rA = await cambiar(A, 'emprendedor');
    const aDespues = await estado(A);
    ok('la administración la pasa a negocio y la función contesta lo de siempre',
      [rA.ok, rA.valor?.rows[0].j], [true, { tipo_cuenta: 'emprendedor' }]);
    ok('ahora su prueba es la de un negocio: 20 días desde que nació, y sigue en prueba',
      [aDespues.tipo_cuenta, aDespues.estado, aDespues.prueba, aDespues.periodo, aDespues.efectivo],
      ['emprendedor', 'prueba', 20, 20, 'pro']);
    ok('y el objetivo de 20 días seguidos entra en su prueba (antes: 20 días en 9 fechas)',
      [aDespues.objetivo, aDespues.porcentaje, aDespues.fechas >= aDespues.objetivo, aAntes.fechas], [20, 18, true, 9]);
    const regA = await ultimoCambio(A);
    ok('el registro guarda el tipo de antes y de después, y cómo se movió el vencimiento',
      [regA.detalle.antes, regA.detalle.despues, regA.antes_ts === aAntes.periodo_ts, regA.despues_ts === aDespues.periodo_ts],
      ['personal', 'emprendedor', true, true]);

    // Al revés: nunca se acorta.
    const B = await H.montarEmpresa(db, { email: 'cerro@local.com', nombre: 'Cerró el local' });
    const bAntes = await estado(B);
    await cambiar(B, 'personal');
    const bDespues = await estado(B);
    ok('de negocio a personal no se le saca un día: conserva sus 20, con el objetivo y el 5 % de la personal',
      [bDespues.tipo_cuenta, bDespues.prueba, bDespues.periodo_fin === bAntes.periodo_fin, bDespues.prueba_fin === bAntes.prueba_fin,
        bDespues.objetivo, bDespues.porcentaje], ['personal', 20, true, true, 8, 5]);
    const regB = await ultimoCambio(B);
    ok('y como no se movió ninguna fecha, el registro no inventa una',
      [regB.detalle.antes, regB.detalle.despues, 'vence_antes' in regB.detalle, 'vence_despues' in regB.detalle],
      ['emprendedor', 'personal', false, false]);

    // En el día 5 de sus 8.
    const C5 = await H.montarEmpresa(db, { email: 'dia5@casa.com', nombre: 'Día cinco', tipoCuenta: 'personal' });
    await nacio(db, C5, 5);
    await cambiar(C5, 'emprendedor');
    const c5 = await estado(C5);
    ok('una personal en su día 5 pasa a negocio: 20 días desde que nació, le quedan 15',
      [c5.prueba, c5.quedan, c5.efectivo], [20, 15, 'pro']);

    // Una prueba que ya terminó no se reabre por cambiar el tipo: para eso
    // está «Dar unos días más». (personal-gratis.test.js, grupo 8: la
    // personal en Gratis que pasa a negocio queda con el candado.)
    const V = await H.montarEmpresa(db, { email: 'vencida@casa.com', nombre: 'Ya vencida', tipoCuenta: 'personal' });
    await nacio(db, V, 9);
    const vAntes = await estado(V);
    await cambiar(V, 'emprendedor');
    const vDespues = await estado(V);
    ok('una personal con la prueba terminada pasa a negocio sin reabrirse',
      [vAntes.efectivo, vDespues.tipo_cuenta, vDespues.efectivo, vDespues.periodo_fin === vAntes.periodo_fin,
        vDespues.prueba_fin === vAntes.prueba_fin], ['gratis', 'emprendedor', 'gratis', true, true]);

    // A quien la administración le dio más días, no se le acorta.
    const M = await H.montarEmpresa(db, { email: 'amano@casa.com', nombre: 'Estirada a mano', tipoCuenta: 'personal' });
    await db.query(
      `update public.suscripciones set prueba_fin = now() + interval '40 days', periodo_fin = now() + interval '40 days'
        where empresa_id = $1`, [M.empresaId]);
    const mAntes = await estado(M);
    await cambiar(M, 'emprendedor');
    const mDespues = await estado(M);
    ok('si ya tenía más días que los de un negocio, se queda con los suyos',
      [mDespues.periodo_fin === mAntes.periodo_fin, mDespues.prueba_fin === mAntes.prueba_fin, mDespues.quedan], [true, true, 40]);

    // Y a quien ya paga no se le toca el período.
    const G = await H.montarEmpresa(db, { email: 'paga@casa.com', nombre: 'Ya paga', tipoCuenta: 'personal' });
    await db.query(
      `update public.suscripciones set estado = 'activa', plan = 'pro', periodo_fin = now() + interval '3 days'
        where empresa_id = $1`, [G.empresaId]);
    const gAntes = await estado(G);
    await cambiar(G, 'emprendedor');
    const gDespues = await estado(G);
    ok('a una cuenta que paga, cambiarle el tipo no le mueve el vencimiento',
      [gDespues.estado, gDespues.periodo_fin === gAntes.periodo_fin, gDespues.prueba_fin === gAntes.prueba_fin], ['activa', true, true]);

    // Los permisos, los de siempre.
    const ajeno = await H.intentar(db, A.uid, () => db.query('select public.cambiar_tipo_cuenta($1,$2)', [A.empresaId, 'personal']));
    ok('sigue siendo solo de la administración', [ajeno.ok, /administraci[oó]n/i.test(ajeno.error ?? '')], [false, true]);
    const anonimo = await H.intentarComo(db, 'anon', null, () => db.query('select public.cambiar_tipo_cuenta($1,$2)', [A.empresaId, 'personal']));
    ok('y nadie sin sesión', [anonimo.ok, /denied|permiso|permission/i.test(anonimo.error ?? '')], [false, true]);
    const sql = leer(MIGRACION);
    ok('cambiar_tipo_cuenta sigue siendo security definer con su search_path, y con sus permisos',
      [/create or replace function public\.cambiar_tipo_cuenta\(\n  p_empresa uuid,\n  p_tipo    text\n\)\nreturns jsonb language plpgsql security definer set search_path = public as/.test(sql),
        sql.includes('revoke all on function public.cambiar_tipo_cuenta(uuid, text) from public, anon;'),
        sql.includes('grant execute on function public.cambiar_tipo_cuenta(uuid, text) to authenticated;')], [true, true, true]);
  }

  console.log(`\n${'═'.repeat(62)}`);
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE PRECIOS, PRUEBA Y DESCUENTOS PASARON`);
  process.exit(0);
}

principal().catch((e) => {
  console.error('\nLA PRUEBA SE CAYÓ:', e);
  process.exit(1);
});
