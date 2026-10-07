/**
 * «Empezar de cero» anda siempre (migración 115, 30/09/2026).
 *
 * Irse tiene que ser gratis y tiene que andar siempre (018:124-129). Hasta
 * la 115, vaciar_empresa fallaba con CUALQUIER plan —en prueba, pagando o
 * vencido— en todo negocio con una reserva de la agenda
 * (turnos_reserva.producto_id es RESTRICT, 037:116) y en agricultura con una
 * liquidación (liquidaciones_mov_fk sin ON DELETE, 100:299).
 *
 * En orden:
 *   1. el diagnóstico, en la base misma: las llaves RESTRICT / NO ACTION que
 *      apuntan a lo que vaciar borra son las que la 115 resuelve y ninguna
 *      más (si mañana aparece otra, esta prueba avisa antes que un cliente);
 *      cada trigger de UPDATE (antes o después) de las tablas con SET NULL
 *      lee la marca, no hay triggers de DELETE en lo que se borra que no la
 *      lean, y ninguna columna con SET NULL es NOT NULL;
 *   2. un negocio de cada rubro, cargado con todo, se vacía en prueba,
 *      pagando y vencido; y la personal en Gratis; y la cuenta de Orden, con
 *      las comisiones y los retiros que anotó (SET NULL hacia sus
 *      movimientos). Toda tabla que «queda» y toda la que «se va» tiene filas
 *      en alguna de esas cuentas: si no, la comprobación no probaría nada;
 *   3. después no queda nada de lo que se va y queda todo lo que queda;
 *   4. otra cuenta cargada igual, de cada rubro, no se toca;
 *   5. solo el propietario, con el nombre exacto;
 *   6. los alumnos no quedan debiendo lo que ya pagaron: los paquetes y las
 *      inscripciones se van con sus ventas (115);
 *   7. los turnos por venir que se borran se cuentan antes de confirmar, y
 *      la pantalla lo dice.
 */
const H = require('./ayuda-db.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Las fuentes de la pantalla, con CRLF normalizado: en una worktree de
// Windows los saltos de línea son \r\n (ver pruebas/calculos.test.js).
const RAIZ = path.join(__dirname, '..');
const fuente = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');

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
    console.log(`  ✓ ${nombre} → ${a.length > 90 ? a.slice(0, 87) + '...' : a}`);
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
    return false;
  }
  console.log(`  ✓ ${nombre}`);
  return true;
}

// El de siempre para un negocio vencido (069).
const CANDADO = 'Se te terminó la prueba';

// Lo que vaciar_empresa borraba hasta la 110 (014:199-205) y lo que suma la
// 115: las reservas, las liquidaciones y los paquetes (con sus clases dadas).
const BORRA_ANTES = ['cierres', 'movimientos', 'productos', 'retos'];
const BORRA_AHORA = [...BORRA_ANTES, 'liquidaciones', 'paquetes', 'turnos_reserva'];

// Cada llave RESTRICT / NO ACTION que apunta a lo que se borra, con lo que
// se decidió (115). Una que no esté acá es una decisión que falta tomar.
const DECISIONES = {
  liquidaciones_mov_fk: 'la liquidación se va con su venta, en la misma sentencia',
  movimientos_liquidacion_fk: 'la venta se va con su liquidación, en la misma sentencia',
  pagos_deuda_liquidacion_fk: 'el pago que se cobró el silo queda, sin su liquidación',
  turnos_reserva_producto_id_fkey: 'las reservas se van antes que el catálogo',
};

// Lo que tiene que irse entero, lo que se va en parte y lo que queda. Toda
// tabla con empresa_id tiene que estar en una de las tres (grupo 1).
// paquetes y clases_dadas (115): un paquete es una venta; si quedara sin su
// venta, el alumno figuraría debiendo lo que ya pagó (grupo 8).
const SE_VAN = ['adjuntos', 'cierres', 'clases_dadas', 'liquidaciones', 'movimiento_items', 'movimientos',
  'paquetes', 'productos', 'retos', 'turnos_precio', 'turnos_reserva', 'turnos_servicio'];
// fiado: las líneas de una venta fiada (fiado.venta_id es CASCADE, 054).
// turnos_atribucion: las cobradas (movimiento_id CASCADE, 033); la silla
// alquilada no tiene movimiento y queda, sin su producto.
// fiado_cuotas (127): las cuotas cuelgan de su línea de fiado (CASCADE), así
// que se van las de una venta fiada y quedan las de lo anotado a mano.
const EN_PARTE = ['fiado', 'fiado_cuotas', 'turnos_atribucion'];
const QUEDAN = ['ahorros', 'ajustes_cuenta', 'ajustes_orden', 'cargas_historial', 'categorias_propias',
  'clientes', 'codigos_rechazados', 'comisiones', 'cosechas', 'cuentas_dinero', 'deudas',
  'ejercicios', 'empresa_accesos', 'envios', 'ficha_cliente', 'fichas_entreno', 'gastos_fijos',
  'ingresos_fijos', 'lotes', 'mediciones', 'miembros', 'movimientos_ahorro', 'pagos_deuda',
  'presupuesto', 'referidos', 'registro_admin', 'rutina_dias', 'rutina_ejercicios', 'rutina_enlaces',
  'rutinas', 'suscripciones', 'turnos_bloqueo', 'turnos_excepcion', 'turnos_horario', 'turnos_pago',
  'turnos_profesional', 'turnos_publico', 'turnos_slug_usado', 'uso_ia',
  // videos (113): son de la biblioteca de ejercicios, que queda.
  'videos',
  // Bancard (124): el pago de la suscripción, la tarjeta guardada y el débito.
  // Es la plata que la cuenta le paga a Orden, no la del negocio: vaciar no
  // la toca (bancard_eventos no tiene empresa_id y tampoco se toca).
  'bancard_cuentas', 'bancard_operaciones', 'bancard_pagadores', 'bancard_tarjetas'];

// El insert de PantallaGastos.tsx (candado-vencido.test.js), con la campaña.
const MOV = `insert into public.movimientos (empresa_id, tipo, fecha, descripcion, categoria,
               subtotal, descuento, monto, costo_total, metodo_pago, contraparte, notas, cuenta_id, origen, lote_id)
             values ($1,$2,current_date,$3,$4,$5,0,$5,0,'efectivo','','',null,'manual',$6) returning id`;

(async () => {
  const db = await H.crearBase();
  const como = (uid, sql, args = []) => H.intentar(db, uid, () => db.query(sql, args));
  const val = async (uid, sql, args = []) => {
    const r = await como(uid, sql, args);
    if (!r.ok) throw new Error(`${sql} → ${r.error}`);
    return r.valor.rows[0];
  };
  const J = async (uid, sql, args = []) => (await val(uid, sql, args)).j;
  const filas = async (sql, args = []) => (await db.query(sql, args)).rows;
  const n = async (sql, args = []) => Number((await filas(sql, args))[0].n);
  const anon = (sql, args = []) => H.intentarComo(db, 'anon', null, () => db.query(sql, args));
  // Sin sesión: superusuario sin orden.uid, como el cron (candado-vencido.test.js).
  const sinSesion = async (sql, args = []) => {
    await db.exec('begin');
    try {
      const valor = await db.query(sql, args);
      await db.exec('commit');
      return { ok: true, valor, error: null };
    } catch (e) {
      try { await db.exec('rollback'); } catch { /* ya abortada */ }
      return { ok: false, valor: null, error: e.message ?? String(e) };
    }
  };
  const nombreDe = async (id) => (await filas('select nombre from public.empresas where id=$1', [id]))[0].nombre;
  const vaciar = async (C, nombre) => como(C.uid, 'select public.vaciar_empresa($1,$2) j',
    [C.empresaId, nombre ?? await nombreDe(C.empresaId)]);

  // Receta de solo-lectura.test.js: la prueba termina sola.
  const vencer = (id) => db.query(
    `update public.suscripciones
     set periodo_fin = now() - interval '1 day', prueba_fin = now() - interval '1 day'
     where empresa_id = $1`, [id]);

  const hoy = (await filas("select (now() at time zone 'America/Asuncion')::date::text h"))[0].h;
  const dia = async (d) => (await filas('select ($1::date + $2::int)::text d', [hoy, d]))[0].d;
  const dow = Number((await filas('select extract(dow from $1::date)::int d', [hoy]))[0].d);

  // ═══════════════════════════════════════════════════════════
  // LA CUENTA DE ORDEN (comisiones.test.js)
  //
  // Ahí la administración anota lo que cobra a cada negocio y lo que les
  // paga a los socios. comisiones y retiros apuntan a esos movimientos con
  // SET NULL: vaciar la cuenta de Orden es la única forma de verlos pasar.
  // Y cobrar a un negocio referido deja filas en comisiones, referidos y
  // registro_admin de ESE negocio, que tienen que quedar al vaciarlo.
  // ═══════════════════════════════════════════════════════════
  const jefe = await H.crearUsuario(db, 'jefe@orden.com');
  await db.query('insert into public.superadmins (usuario_id) values ($1)', [jefe]);
  const O = { uid: jefe, rubro: 'la cuenta de Orden', estado: 'en prueba' };
  O.empresaId = (await val(jefe, "select public.crear_empresa('Orden','PYG','Matías') id")).id;
  await val(jefe, 'select public.definir_empresa_orden($1)', [O.empresaId]);
  const socio = async (nombre, email) => (await J(jefe,
    'select public.guardar_socio($1::uuid,$2,$3,$4,$5,$6,$7::boolean) j', [null, nombre, '', email, '', '', true]));
  // S1 no tiene usuario: se le paga comisión por comisión. S2 sí: retira de
  // su saldo (070).
  const S1 = await socio('Lucas Vera', '');
  const S2 = await socio('Pedro Cañete', 'pedro.socio@correo.com');
  S2.uid = await H.crearUsuario(db, 'pedro.socio@correo.com');
  await db.query('update public.socios set user_id = $1 where id = $2', [S2.uid, S2.id]);
  await val(S2.uid, 'select public.guardar_donde_cobro($1,$2,$3,$4)', ['Banco Familiar', 'Pedro Cañete', '123456', '4567890']);
  // Pagando: la administración anota al socio y cobra el mes, como en
  // comisiones.test.js. El cobro genera la comisión, con su ingreso en la
  // cuenta de Orden.
  const pagar = async (C) => {
    await J(jefe, 'select public.asignar_referido($1,$2,$3) j', [C.empresaId, (C.rubro === 'comercio' ? S1 : S2).codigo, '']);
    await J(jefe, 'select public.cambiar_plan_cuenta($1,$2,$3,$4,$5::numeric,$6::integer) j',
      [C.empresaId, 'pro', 1, 'cobrado por transferencia', 190000, null]);
  };

  // ═══════════════════════════════════════════════════════════
  // LO QUE SE CARGA
  // ═══════════════════════════════════════════════════════════

  /** Lo que tiene cualquier negocio: plata, catálogo, fiado, deudas, hábito. */
  const comun = async (C) => {
    const E = C.empresaId;
    const U = C.uid;
    C.cliente = (await val(U, "select public.guardar_cliente($1,'Juan Pérez','0981 234 567') id", [E])).id;
    C.caja = (await val(U, "select public.guardar_cuenta_dinero($1,'Caja','efectivo',500000,'{efectivo}') id", [E])).id;
    C.banco = (await val(U, "select public.guardar_cuenta_dinero($1,'Banco','banco',0,'{transferencia}') id", [E])).id;
    await val(U, 'select public.transferir_entre_cuentas($1,$2,$3,$4)', [E, C.caja, C.banco, 1000]);
    await val(U, "select public.ajustar_saldo_cuenta($1,$2,$3,'')", [E, C.caja, 480000]);
    await val(U, MOV, [E, 'gasto', 'Luz', 'Servicios', 150000, null]);
    C.producto = await H.crearProducto(db, E, U, { nombre: 'Shampoo', costo: 20000, precio: 35000, stock: 10 });
    C.venta = (await val(U, 'select public.registrar_venta($1,$2) id',
      [E, JSON.stringify([{ producto_id: C.producto, nombre: 'Shampoo', cantidad: 2, precio_unitario: 35000 }])])).id;
    C.ruta = `${E}/${C.venta}/ticket.webp`;
    await val(U, "select public.adjuntar($1,'foto',$2,'image/webp',1000,'')", [C.venta, C.ruta]);
    // Una venta fiada (055): la línea de fiado cuelga de la venta.
    C.ventaFiada = (await val(U, "select public.registrar_venta(p_empresa => $1, p_items => $2, p_metodo_pago => 'credito', p_cliente => $3) id",
      [E, JSON.stringify([{ nombre: 'Crema', cantidad: 1, precio_unitario: 20000 }]), C.cliente])).id;
    await val(U, 'select public.cobrar_fiado($1,$2,5000)', [E, C.cliente]);
    await val(U, "select public.anotar_fiado($1,$2,3000,'a cuenta')", [E, C.cliente]);
    // (127) La venta fiada, en dos cuotas, con un pago que dice ser de esa
    // venta; y un fiado anotado a mano, también en cuotas. Al vaciar se van
    // las cuotas de la venta, el pago queda suelto y lo anotado a mano queda.
    const cuotas = (montos) => JSON.stringify(montos.map((monto, i) => ({ vence_el: `2027-0${i + 1}-15`, monto })));
    const plan = (await val(U, 'select public.programar_cuotas(p_venta => $1, p_plan => $2::jsonb) j', [C.ventaFiada, cuotas([10000, 10000])])).j;
    await val(U, 'select public.cobrar_fiado(p_empresa => $1, p_cliente => $2, p_monto => 2000, p_cuota => $3)', [E, C.cliente, plan.cuotas[0].id]);
    await val(U, "select public.anotar_fiado($1,$2,4000,'en dos veces',null,null,$3::jsonb)", [E, C.cliente, cuotas([2000, 2000])]);
    // Una línea de fiado vieja con su cobro atado a un movimiento (candado-vencido.test.js).
    const cobroViejo = (await val(U, MOV, [E, 'ingreso', 'Cobro viejo', 'Cobros', 100, null])).id;
    await db.query(
      `update public.fiado set cobro_id = $2
       where id = (select id from public.fiado where empresa_id = $1 and tipo = 'cobro' limit 1)`, [E, cobroViejo]);
    C.deuda = (await val(U, "select public.crear_deuda($1,'Visa','tarjeta','Banco',100000) id", [E])).id;
    await val(U, 'select public.registrar_pago_deuda($1,$2)', [C.deuda, 1000]);
    await val(U, 'select public.marcar_cierre($1)', [E]);
    await db.query(
      `insert into public.retos (empresa_id, nombre, meta, medida, fecha_inicio, fecha_fin)
       values ($1, 'Vender más', 1000000, 'ventas', $2::date, $2::date + 30)`, [E, hoy]);
    await val(U, 'select public.consumir_credito_ia($1)', [E]);
    // Un código de socio que no anduvo (068) y un correo ya mandado (010):
    // quedan al vaciar, y sin esto la prueba nunca las vería con filas. (Al
    // que paga, asignar_referido le borra el rechazo: queda su referido.)
    await val(U, "select public.guardar_codigo_rechazado($1,'NOEXISTE','no existe')", [E]);
    await db.query("select public.reservar_envio('cierre', $1, $2, $3, 'email')", [`cierre-${E}`, U, E]);
    return C;
  };

  const comercio = async (C) => {
    await comun(C);
    await H.crearProducto(db, C.empresaId, C.uid, { nombre: 'Acondicionador', costo: 15000, precio: 30000, stock: 4 });
    return C;
  };

  /** Servicios con agenda: reservas de todo tipo, turnos cobrados, reparto y silla. */
  const servicios = async (C) => {
    await comun(C);
    const E = C.empresaId;
    const U = C.uid;
    C.corte = await H.crearProducto(db, E, U, { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
    await val(U, 'select public.guardar_servicio_agenda($1,$2,$3)', [E, C.corte, 30]);
    C.prof = (await val(U, "select public.guardar_profesional($1,'Pedro','comision',50,$2) id", [E, U])).id;
    await val(U, 'select public.guardar_precio_profesional($1,$2,$3,$4)', [E, C.prof, C.corte, 55000]);
    for (let d = 0; d < 7; d++) {
      await val(U, "select public.guardar_horario($1,$2,$3,'08:00','20:00')", [E, C.prof, d]);
    }
    await val(U, "select public.guardar_excepcion($1,$2,true,null,null,null,'Feriado')", [E, await dia(20)]);
    C.slug = `agenda-${E.slice(0, 8)}`;
    // El primer link se cambia: el viejo queda quemado (turnos_slug_usado, 038).
    await val(U, 'select public.guardar_link_publico($1,$2)', [E, `viejo-${E.slice(0, 8)}`]);
    await val(U, 'select public.guardar_link_publico($1,$2)', [E, C.slug]);
    await val(U, "select public.bloquear_telefono($1,'0981 000 999','reservas falsas')", [E]);

    const huecos = (await filas('select inicia from public.huecos_del_dia($1,$2,$3) order by 1',
      [C.prof, await dia(3), C.corte])).map((x) => x.inicia);
    const reservar = async (i, nombre, tel) => (await val(U,
      'select public.reservar($1,$2,$3,$4,$5,$6) j', [E, C.prof, C.corte, huecos[i], nombre, tel])).j;
    const alPasado = (id) => db.query(
      `update public.turnos_reserva set inicia = inicia - interval '10 days', termina = termina - interval '10 days'
       where id = $1`, [id]);
    await reservar(0, 'Futura', '0981 111 001');
    const cancelada = await reservar(1, 'Cancelada', '0981 111 002');
    await val(U, 'select public.cancelar_turno($1)', [cancelada.reserva]);
    const atendida = await reservar(2, 'Atendida', '0981 111 003');
    await val(U, 'select public.atender_reserva($1)', [atendida.reserva]);
    await alPasado(atendida.reserva);
    const noVino = await reservar(3, 'No vino', '0981 111 004');
    await val(U, 'select public.marcar_no_vino($1)', [noVino.reserva]);
    await alPasado(noVino.reserva);
    const publica = await anon('select public.reservar_publico($1,$2,$3,$4,$5,$6) j',
      [C.slug, C.prof, C.corte, huecos[4], 'Por el link', '0981 111 005']);
    if (!publica.ok) throw new Error(`reservar_publico → ${publica.error}`);
    // El enlace que se llevó el cliente (grupo 9).
    C.tokenLink = publica.valor.rows[0].j.token;

    // Un turno cobrado sin reserva y lo que se le pagó al profesional.
    await val(U, 'select public.registrar_servicio($1,$2,$3)', [E, C.prof, C.corte]);
    await val(U, 'select public.pagar_profesional($1,$2,$3)', [E, C.prof, 15000]);
    // Una silla alquilada: una atribución sin movimiento que apunta al producto.
    const inquilino = await H.sumarMiembro(db, E, `silla-${E.slice(0, 8)}@orden.app`, 'vendedor');
    const silla = (await val(U, "select public.guardar_profesional($1,'Silla','alquiler',null,$2) id", [E, inquilino])).id;
    await val(U, 'select public.registrar_servicio($1,$2,$3)', [E, silla, C.corte]);
    return C;
  };

  /** Clases: paquetes, clases dadas e inscripciones con su agenda. */
  const clases = async (C) => {
    await comun(C);
    const E = C.empresaId;
    const U = C.uid;
    const alumno = (await val(U, "select public.guardar_cliente($1,'Matías','0981 111 111') id", [E])).id;
    const paquete = (await J(U, "select public.vender_paquete($1,$2,'8 clases',8,400000,'efectivo',null,null) j", [E, alumno])).paquete;
    await val(U, "select public.dar_clase($1,1,null,'dada',null)", [paquete]);
    await J(U, "select public.vender_paquete($1,$2,'Prueba',2,0,'efectivo',null,null) j", [E, alumno]);
    const alumna = (await val(U, "select public.guardar_cliente($1,'Ana','0982 222 222') id", [E])).id;
    const ins = await J(U, 'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) j',
      [E, alumna, [1, 2, 3, 4, 5], '18:00', '19:00', await dia(1), await dia(21), 50000, null, true, 'transferencia', 'Mes de inglés']);
    const primera = (await filas('select id from public.turnos_reserva where paquete_id = $1 order by inicia limit 1', [ins.paquete]))[0].id;
    await val(U, 'select public.marcar_clase($1, true)', [primera]);
    const sinCobrar = await J(U, 'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) j',
      [E, alumno, [6], '10:00', '11:00', await dia(1), await dia(21), 50000, null, false, 'efectivo', null]);
    await val(U, "select public.cobrar_inscripcion($1,'efectivo')", [sinCobrar.paquete]);
    // Y una que de verdad falta cobrar: dos domingos a 50.000 (en 14 días
    // seguidos siempre caen dos).
    const sofia = (await val(U, "select public.guardar_cliente($1,'Sofía','0983 333 333') id", [E])).id;
    await J(U, 'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) j',
      [E, sofia, [0], '09:00', '10:00', await dia(1), await dia(14), 50000, null, false, 'efectivo', 'Apoyo']);
    // Lo ya cobrado (grupo 8): el paquete vendido y las dos inscripciones pagas.
    C.cobrados = [paquete, ins.paquete, sinCobrar.paquete];
    C.porCobrarAntes = 100000;
    return C;
  };

  /** Entrenamiento: biblioteca, rutinas con link, cargas, medidas y agenda. */
  const entrenamiento = async (C) => {
    await comun(C);
    const E = C.empresaId;
    const U = C.uid;
    const ana = (await val(U, "select public.guardar_cliente($1,'Ana Ruiz','0981 000 001','Rodilla') id", [E])).id;
    await J(U, "select public.guardar_ejercicio($1,'Sentadilla con barra','piernas','Espalda recta','https://youtu.be/x') j", [E]);
    // Un video propio reservado (113): la biblioteca queda, y su video también.
    await J(U, 'select public.reservar_video($1,30,8000000) j', [E]);
    const renglon = { nombre: 'Sentadilla con barra', series: 3, reps: '12', carga: '40 kg', descanso_seg: 60, nota: '', junto_al_anterior: false };
    await J(U, 'select public.guardar_rutina($1,$2::jsonb,null,null,null) j',
      [E, JSON.stringify({ nombre: 'Principiante', notas: '', semanas: 4, dias: [{ nombre: 'Full body', notas: '', ejercicios: [renglon] }] })]);
    const vigente = await J(U, 'select public.guardar_rutina($1,$2::jsonb,null,$3,null) j',
      [E, JSON.stringify({ nombre: 'Rutina de Ana', notas: '', semanas: 6, dias: [{ nombre: 'Día A', notas: '', ejercicios: [renglon] }] }), ana]);
    const leida = await J(U, 'select public.rutina($1,$2) j', [E, vigente.id]);
    await J(U, "select public.cambiar_carga($1,$2,'45 kg') j", [E, leida.dias[0].ejercicios[0].id]);
    await J(U, 'select public.anotar_medicion($1,$2,$3,$4::jsonb,true) j',
      [E, ana, hoy, JSON.stringify({ peso_kg: 80, altura_cm: 165 })]);
    const plan = await J(U, 'select public.inscribir_alumno($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) j',
      [E, ana, [dow], '07:00', '08:00', hoy, await dia(14), null, 250000, true, 'transferencia', 'Plan', null]);
    C.cobrados = [plan.paquete];
    C.porCobrarAntes = 0;
    return C;
  };

  /** Agricultura: campañas, cosechas, liquidaciones, canje y deudas a cosecha. */
  const agricultura = async (C) => {
    await comun(C);
    const E = C.empresaId;
    const U = C.uid;
    const abrir = async (nombre, cultivo, ha) => (await val(U,
      "select public.guardar_lote($1,$2,'',0,'',null,null,$3,'Zafra 2026/27',$4,2500000) id", [E, nombre, cultivo, ha])).id;
    const norte = await abrir('Norte', 'Soja', 50);
    const sur = await abrir('Sur', 'Maíz', 20);
    await val(U, MOV, [E, 'gasto', 'Semilla', 'Semilla', 3400000, norte]);
    const deuda = (nombre, monto, lote, categoria) => val(U,
      'select public.crear_deuda($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) id',
      [E, nombre, 'proveedor', 'Agrofértil', monto, null, null, null, null, '', lote, categoria]);
    const agro = (await deuda('Agroquímicos', 4800000, norte, 'Agroquímicos')).id;
    const semilla = (await deuda('Semilla fiada', 1000000, sur, 'Semilla')).id;
    await val(U, "select public.registrar_pago_deuda($1,$2,$3,true,'transferencia','A cuenta',$4,null,null)",
      [semilla, 400000, hoy, C.banco]);
    const cosechar = (lote, kg, ticket) => val(U,
      "select public.registrar_cosecha($1,$2,$3,$4,null,14.5,'Coop',$5,'',null) id", [E, lote, hoy, kg, ticket]);
    await cosechar(norte, 31000, 'R-1');
    await cosechar(sur, 2000, 'R-2');
    const liquidar = (grupo, precio, partes, cuenta) => val(U,
      "select public.registrar_liquidacion($1,$2,$3,'Coop San Juan',$4,$5::jsonb,$6,'transferencia','Papel') j",
      [E, grupo, hoy, precio, JSON.stringify(partes), cuenta]);
    // El papel del contrato: descuentos, la deuda que se cobró el silo y el
    // alquiler en kilos del dueño del campo.
    await liquidar(crypto.randomUUID(), 2500000, [{
      lote_id: norte, kg: 30000,
      descuentos: [{ categoria: 'Secado y acopio', monto: 500000 }],
      deudas: [{ deuda_id: agro, monto: 4800000 }],
      grano: [{ categoria: 'Arrendamiento', monto: 10000000, descripcion: 'kilos del dueño' }],
    }], C.banco);
    // Canje puro: los kilos pagaron el alquiler, neto cero y sin cuenta.
    await liquidar(crypto.randomUUID(), 400000, [{
      lote_id: sur, kg: 1000, grano: [{ categoria: 'Arrendamiento', monto: 400000, descripcion: 'canje' }],
    }], null);
    // Y un papel anulado: su venta y sus gastos quedan anulados, no borrados.
    const anulado = crypto.randomUUID();
    await liquidar(anulado, 2500000, [{ lote_id: norte, kg: 1000, deudas: [{ deuda_id: semilla, monto: 100000 }] }], C.banco);
    await val(U, "select public.anular_liquidacion($1,$2,'mal cargado')", [E, anulado]);
    return C;
  };

  /** Ganadería: lotes con gastos y ventas, uno cerrado. */
  const ganaderia = async (C) => {
    await comun(C);
    const E = C.empresaId;
    const U = C.uid;
    const corral = (await val(U, "select public.guardar_lote($1,'Novillos corral 3','cabezas',40) id", [E])).id;
    await val(U, MOV, [E, 'gasto', 'Balanceado', 'Alimento', 800000, corral]);
    const venta = (await val(U, 'select public.registrar_venta($1,$2) id',
      [E, JSON.stringify([{ nombre: 'Novillo', cantidad: 1, precio_unitario: 3000000 }])])).id;
    await val(U, 'select public.asignar_a_lote($1,$2)', [venta, corral]);
    const terneros = (await val(U, "select public.guardar_lote($1,'Terneros','cabezas',10) id", [E])).id;
    await val(U, MOV, [E, 'gasto', 'Vacunas', 'Sanidad', 200000, terneros]);
    await val(U, 'select public.cerrar_lote($1,$2)', [E, terneros]);
    return C;
  };

  const RUBROS = { comercio, servicios, clases, entrenamiento, agricultura, ganaderia };

  let k = 0;
  const armar = async (rubro, estado) => {
    k++;
    const C = await H.montarEmpresa(db, { email: `duenio${k}@${rubro}.com`, nombre: `${rubro} ${estado} ${k}`, rubro });
    C.rubro = rubro;
    C.estado = estado;
    return RUBROS[rubro](C);
  };

  /**
   * La personal: Pedro trabaja en una barbería (le pagaron y lo trajo a su
   * cuenta: turnos_pago_traido) y lleva su plata con todo lo del Pro.
   */
  const armarPersonal = async (sufijo) => {
    const jefa = await H.montarEmpresa(db, { email: `jefa${sufijo}@barberia.com`, nombre: `Barbería ${sufijo}`, rubro: 'servicios' });
    const pedro = await H.sumarMiembro(db, jefa.empresaId, `pedro${sufijo}@barberia.com`, 'vendedor');
    const corte = await H.crearProducto(db, jefa.empresaId, jefa.uid, { nombre: 'Corte', costo: 0, precio: 50000, controla_stock: false });
    const prof = (await val(jefa.uid, "select public.guardar_profesional($1,'Pedro','comision',50,$2) id", [jefa.empresaId, pedro])).id;
    await val(jefa.uid, 'select public.registrar_servicio($1,$2,$3)', [jefa.empresaId, prof, corte]);
    await val(jefa.uid, 'select public.pagar_profesional($1,$2,$3)', [jefa.empresaId, prof, 15000]);

    const P = { uid: pedro, rubro: 'personal', jefa };
    P.empresaId = (await val(pedro, "select public.crear_empresa('Mis finanzas','PYG','Pedro','America/Asuncion','personal') id")).id;
    const E = P.empresaId;
    P.cliente = (await val(pedro, "select public.guardar_cliente($1,'Primo','0981 555 555') id", [E])).id;
    await val(pedro, "select public.anotar_fiado($1,$2,50000,'le presté')", [E, P.cliente]);
    await val(pedro, 'select public.cobrar_fiado($1,$2,20000)', [E, P.cliente]);
    P.caja = (await val(pedro, "select public.guardar_cuenta_dinero($1,'Billetera','efectivo',100000,'{efectivo}') id", [E])).id;
    P.banco = (await val(pedro, "select public.guardar_cuenta_dinero($1,'Ueno','banco',0,'{transferencia}') id", [E])).id;
    await val(pedro, 'select public.transferir_entre_cuentas($1,$2,$3,$4)', [E, P.caja, P.banco, 5000]);
    await val(pedro, "select public.ajustar_saldo_cuenta($1,$2,$3,'')", [E, P.caja, 90000]);
    const gasto = (await val(pedro, MOV, [E, 'gasto', 'Súper', 'Comida', 25000, null])).id;
    await val(pedro, MOV, [E, 'ingreso', 'Sueldo', 'Sueldo', 3000000, null]);
    P.ruta = `${E}/${gasto}/ticket.webp`;
    await val(pedro, "select public.adjuntar($1,'foto',$2,'image/webp',1000,'')", [gasto, P.ruta]);
    P.deuda = (await val(pedro, "select public.crear_deuda($1,'Visa','tarjeta','Banco',100000) id", [E])).id;
    await val(pedro, 'select public.registrar_pago_deuda($1,$2)', [P.deuda, 1000]);
    await val(pedro, "select public.guardar_presupuesto($1,'Comida',300000)", [E]);
    await val(pedro, "select public.guardar_gasto_fijo($1,'Wifi',120000,'Servicios',10)", [E]);
    await val(pedro, "select public.guardar_ingreso_fijo($1,'Sueldo',3000000,5,true,null,$2)", [E, P.banco]);
    const ahorro = (await val(pedro, "select public.guardar_ahorro($1,'Viaje',2000000) id", [E])).id;
    await val(pedro, "select public.mover_ahorro($1,$2,'aporte',300000)", [E, ahorro]);
    await val(pedro, "select public.guardar_categoria_propia($1,'Mascotas','gasto','')", [E]);
    await val(pedro, 'select public.marcar_cierre($1)', [E]);
    await val(pedro, 'select public.traer_ingreso_de_trabajo($1,$2) j', [jefa.empresaId, E]);
    return P;
  };

  // Una cuenta por rubro en cada estado, más un testigo en prueba que nadie
  // vacía y que tiene que quedar exactamente igual.
  const ESTADOS = ['en prueba', 'pagando', 'vencido'];
  const CUENTAS = [];
  const TESTIGOS = [];
  for (const rubro of Object.keys(RUBROS)) {
    for (const estado of ESTADOS) CUENTAS.push(await armar(rubro, estado));
    TESTIGOS.push(await armar(rubro, 'testigo'));
  }
  const P = await armarPersonal('1');
  P.estado = 'Gratis';
  const PT = await armarPersonal('2');
  // Un administrador en la de comercio en prueba, para el grupo 5.
  const DUENIO = CUENTAS.find((c) => c.rubro === 'comercio' && c.estado === 'en prueba');
  DUENIO.admin = await H.sumarMiembro(db, DUENIO.empresaId, 'admin@comercio.com', 'admin');

  for (const C of CUENTAS) {
    if (C.estado === 'pagando') await pagar(C);
    if (C.estado === 'vencido') await vencer(C.empresaId);
  }
  // Bancard (124-126): el comercio que paga renovó con tarjeta (un pago de
  // staging, que no anota ingreso ni comisión) y la dejó guardada para el
  // débito. Son cuatro tablas con empresa_id, y las cuatro tienen que quedar.
  {
    const C = CUENTAS.find((c) => c.rubro === 'comercio' && c.estado === 'pagando');
    const S = async (sql, p) => (await H.comoServicio(db, () => db.query(sql, p))).rows[0].j;
    const op = await S("select public.bancard_crear_operacion($1,$2,'staging','plan','formulario','pro','mensual',null) j", [C.empresaId, C.uid]);
    await S("select public.bancard_confirmar($1,$2,'confirmacion') j",
      [op.operacion, { response: 'S', response_code: '00', amount: String(op.importe), currency: 'PYG' }]);
    const tarjeta = await S("select public.bancard_crear_catastro($1,$2,'staging','0981123456','Autorizo el cobro de cada renovación.') j", [C.empresaId, C.uid]);
    await S("select public.bancard_activar_tarjeta($1,'Visa','0016','credit') j", [tarjeta.card_id]);
  }
  await vencer(P.empresaId);

  // La cuenta de Orden, cargada como cualquier negocio, más lo que les pagó
  // a los socios: la comisión de S1, suelta (060), y un retiro de S2 desde
  // su saldo (070). Los dos son gastos en esta cuenta.
  await comun(O);
  const comisionS1 = (await filas('select id from public.comisiones where socio_id = $1', [S1.id]))[0].id;
  await J(jefe, 'select public.marcar_comision_pagada($1,$2::numeric,$3,$4) j', [comisionS1, null, 'transferencia', '']);
  const retiro = await J(S2.uid, 'select public.solicitar_retiro($1::numeric) j', [150000]);
  await J(jefe, 'select public.marcar_retiro_pagado($1,$2,$3) j', [retiro.retiro_id, 'transferencia', '']);
  const saldoS2 = async () => Number((await J(S2.uid, 'select public.mi_panel_socio() j')).por_pagar);
  const saldoS2Antes = await saldoS2();
  // Las que se vacían. Orden al final: al vaciarla, las comisiones de los
  // negocios que pagan pierden su asiento, y eso no tiene que cambiar nada
  // de lo que se compara de ellos.
  const VACIADAS = [...CUENTAS, P, O];

  // ═══════════════════════════════════════════════════════════
  grupo('1 · Diagnóstico: qué llaves frenan a «Empezar de cero»');
  // ═══════════════════════════════════════════════════════════
  const fks = await filas(`
    select c.conname, c.conrelid::regclass::text as tabla, c.confrelid::regclass::text as ref, c.confdeltype as del
    from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`);
  // Lo que se borra a mano y todo lo que arrastra en cascada.
  const alcance = (borra) => {
    const s = new Set(borra);
    let crecio = true;
    while (crecio) {
      crecio = false;
      for (const f of fks) {
        if (f.del === 'c' && s.has(f.ref) && !s.has(f.tabla)) { s.add(f.tabla); crecio = true; }
      }
    }
    return s;
  };
  const frenos = (borra) => {
    const s = alcance(borra);
    return fks.filter((f) => (f.del === 'r' || f.del === 'a') && s.has(f.ref)).map((f) => f.conname).sort();
  };
  ok('lo que vaciar borraba, con su cascada',
    [...alcance(BORRA_ANTES)].sort(),
    // fiado_cuotas (127): cuelga de la línea de fiado, que cuelga de la venta.
    ['adjuntos', 'cierres', 'fiado', 'fiado_cuotas', 'movimiento_items', 'movimientos', 'productos', 'retos',
      'turnos_atribucion', 'turnos_precio', 'turnos_servicio']);
  ok('por qué fallaba: dos llaves apuntan ahí sin dejar borrar',
    frenos(BORRA_ANTES), ['liquidaciones_mov_fk', 'turnos_reserva_producto_id_fkey']);
  const frenosAhora = frenos(BORRA_AHORA);
  for (const f of frenosAhora) console.log(`      · ${f}: ${DECISIONES[f] ?? '¡SIN DECIDIR!'}`);
  ok('al sumar reservas y liquidaciones son cuatro, y cada una tiene su decisión',
    frenosAhora, Object.keys(DECISIONES).sort());
  ok('ninguna llave cambió (la 115 no toca FKs)',
    fks.filter((f) => DECISIONES[f.conname]).map((f) => `${f.conname}:${f.del}`).sort(),
    ['liquidaciones_mov_fk:a', 'movimientos_liquidacion_fk:a', 'pagos_deuda_liquidacion_fk:a',
      'turnos_reserva_producto_id_fkey:r']);

  // Los SET NULL en cascada son UPDATE: los triggers de esas tablas tienen
  // que dejar pasar el de «vaciar» (la marca orden.vaciando, 110/111).
  const enAlcance = [...alcance(BORRA_AHORA)].sort();
  const conSetNull = [...new Set(fks.filter((f) => f.del === 'n' && alcance(BORRA_AHORA).has(f.ref)).map((f) => f.tabla))].sort();
  // tgtype (pg_trigger.h): 2 = BEFORE, 8 = DELETE, 16 = UPDATE, 64 = INSTEAD.
  // Sin mirar el momento: un AFTER UPDATE que escribe en otra tabla con
  // candado frena igual que un BEFORE.
  const disparadores = async (bit, tablas) => filas(`
    select distinct t.tgrelid::regclass::text tabla, p.proname,
           case when (t.tgtype & 2) = 2 then 'antes' when (t.tgtype & 64) = 64 then 'en vez' else 'después' end momento,
           p.prosrc ~ 'orden\\.vaciando' as lee_la_marca
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal and (t.tgtype & $1::int) = $1::int
      and t.tgrelid::regclass::text = any($2)
    order by 1, 2`, [bit, tablas]);
  // bancard_operaciones (124): el pago guarda el ingreso que dejó en la cuenta
  // de Orden (ingreso_id); si esa cuenta se vacía, queda en null. No tiene
  // triggers.
  ok('las tablas que quedan con un SET NULL en cascada',
    conSetNull, ['bancard_operaciones', 'clases_dadas', 'comisiones', 'fiado', 'movimiento_items', 'pagos_deuda', 'paquetes', 'retiros',
      'turnos_atribucion', 'turnos_pago', 'turnos_pago_traido', 'turnos_reserva']);
  const deUpdate = await disparadores(16, conSetNull);
  for (const d of deUpdate) console.log(`      · ${d.tabla}.${d.proname} (${d.momento})${d.lee_la_marca ? '' : ' ¡NO LEE LA MARCA!'}`);
  ok('cada trigger de UPDATE que tienen, antes o después, lee la marca de «vaciar»',
    deUpdate.filter((d) => !d.lee_la_marca).map((d) => `${d.tabla}.${d.proname}`), []);
  ok('y esos triggers existen: la comprobación de arriba no pasa en vacío',
    deUpdate.length > 0, true);
  // Los que se borran también pueden tener triggers: un DELETE que escribe
  // en otra tabla con candado frenaría a «vaciar» en un negocio vencido.
  ok('en lo que se borra no hay triggers de DELETE que no lean la marca',
    (await disparadores(8, enAlcance)).filter((d) => !d.lee_la_marca).map((d) => `${d.tabla}.${d.proname}`), []);
  // Un SET NULL sobre una columna NOT NULL (o sobre una llave compuesta que
  // arrastra empresa_id) revienta al borrar. confdelsetcols (PG 15+) es la
  // lista de columnas cuando el SET NULL nombra solo algunas.
  ok('ninguna columna que un SET NULL deja en null es NOT NULL',
    (await filas(`
      select c.conname || '.' || a.attname x
      from pg_constraint c
      cross join lateral unnest(case when c.confdelsetcols is null or cardinality(c.confdelsetcols) = 0
                                     then c.conkey else c.confdelsetcols end) k(num)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.num
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confdeltype = 'n'
        and c.confrelid::regclass::text = any($1) and a.attnotnull
      order by 1`, [enAlcance])).map((x) => x.x), []);

  // Toda tabla con empresa_id tiene su destino decidido.
  const TABLAS = (await filas(`
    select c.table_name t from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'empresa_id' and t.table_type = 'BASE TABLE'
    order by 1`)).map((x) => x.t);
  ok('toda tabla con empresa_id está en «se van», «en parte» o «quedan»',
    TABLAS.filter((t) => [SE_VAN, EN_PARTE, QUEDAN].filter((l) => l.includes(t)).length !== 1), []);
  ok('y ninguna de esas listas nombra una tabla que no existe',
    [...SE_VAN, ...EN_PARTE, ...QUEDAN].filter((t) => !TABLAS.includes(t)), []);

  // ═══════════════════════════════════════════════════════════
  grupo('2 · Armado: cada rubro cargado con todo');
  // ═══════════════════════════════════════════════════════════
  const cuantas = (t, E) => n(`select count(*)::int n from public.${t} where empresa_id=$1`, [E]);
  const foto = async (E) => {
    const r = {};
    for (const t of TABLAS) r[t] = await cuantas(t, E);
    r.traidos = await n('select count(*)::int n from public.turnos_pago_traido where empresa_personal=$1', [E]);
    r.fiado_de_venta = await n('select count(*)::int n from public.fiado where empresa_id=$1 and venta_id is not null', [E]);
    // (127) Las cuotas de una venta fiada, y los pagos que dicen de qué deuda son.
    r.cuotas_de_venta = await n(
      `select count(*)::int n from public.fiado_cuotas q join public.fiado f on f.id = q.fio_id
       where q.empresa_id=$1 and f.venta_id is not null`, [E]);
    r.pagos_de_una_deuda = await n('select count(*)::int n from public.fiado where empresa_id=$1 and fio_id is not null', [E]);
    r.atribuciones_cobradas = await n(
      'select count(*)::int n from public.turnos_atribucion where empresa_id=$1 and movimiento_id is not null', [E]);
    r.saldo_deudas = await n('select coalesce(sum(saldo),0)::numeric n from public.deudas where empresa_id=$1', [E]);
    r.suscripcion = (await filas(
      `select plan, estado, periodo_fin::text, prueba_fin::text from public.suscripciones where empresa_id=$1`, [E]))[0];
    r.codigo = await H.codigoDe(db, E);
    r.ia = await n('select coalesce(sum(usados),0)::int n from public.uso_ia where empresa_id=$1', [E]);
    r.nombre = await nombreDe(E);
    r.montos = await n("select coalesce(sum(monto),0)::numeric n from public.movimientos where empresa_id=$1", [E]);
    return r;
  };
  const antes = new Map();
  for (const C of VACIADAS) antes.set(C.empresaId, await foto(C.empresaId));
  const fotoTestigos = new Map();
  for (const C of [...TESTIGOS, PT]) fotoTestigos.set(C.empresaId, await foto(C.empresaId));

  // «Queda todo lo que queda» con una tabla vacía en todas las cuentas se
  // cumple sin probar nada. Lo mismo «no queda nada de lo que se va».
  const vacias = (lista) => lista.filter((t) => VACIADAS.every((c) => antes.get(c.empresaId)[t] === 0));
  ok('toda tabla que queda tiene filas en alguna de las cuentas que se vacían', vacias(QUEDAN), []);
  ok('y toda tabla que se va, también', vacias([...SE_VAN, ...EN_PARTE]), []);
  ok('Orden tiene comisiones con su ingreso y su pago, y un retiro pagado, anotados en su cuenta',
    [await n(`select count(*)::int n from public.comisiones c join public.movimientos m on m.id = c.movimiento_id
              where m.empresa_id = $1`, [O.empresaId]),
      await n(`select count(*)::int n from public.comisiones c join public.movimientos m on m.id = c.gasto_id
              where m.empresa_id = $1`, [O.empresaId]),
      await n(`select count(*)::int n from public.retiros r join public.movimientos m on m.id = r.gasto_id
              where m.empresa_id = $1`, [O.empresaId])],
    [CUENTAS.filter((c) => c.estado === 'pagando').length, 1, 1]);

  const tiene = (C, t) => antes.get(C.empresaId)[t] > 0;
  const deRubro = (r) => CUENTAS.filter((c) => c.rubro === r);
  ok('servicios, clases y entrenamiento tienen reservas',
    ['servicios', 'clases', 'entrenamiento'].map((r) => deRubro(r).every((c) => tiene(c, 'turnos_reserva'))), [true, true, true]);
  const estadosDe = async (C) => (await filas(
    'select distinct estado from public.turnos_reserva where empresa_id=$1 order by 1', [C.empresaId])).map((x) => x.estado);
  ok('la agenda de servicios: atendidas, canceladas, pendientes y no vino',
    await estadosDe(deRubro('servicios')[0]), ['atendida', 'cancelada', 'no_vino', 'pendiente']);
  ok('y una reserva ya pasada', await n(
    'select count(*)::int n from public.turnos_reserva where empresa_id=$1 and inicia < now()', [deRubro('servicios')[0].empresaId]) > 0, true);
  ok('clases: paquetes, clases dadas y una dada desde la agenda',
    [tiene(deRubro('clases')[0], 'paquetes'), tiene(deRubro('clases')[0], 'clases_dadas'),
      await n('select count(*)::int n from public.clases_dadas where empresa_id=$1 and reserva_id is not null', [deRubro('clases')[0].empresaId]) > 0],
    [true, true, true]);
  ok('entrenamiento: rutinas, links, cargas y medidas',
    ['rutinas', 'rutina_enlaces', 'cargas_historial', 'mediciones', 'fichas_entreno'].map((t) => tiene(deRubro('entrenamiento')[0], t)),
    [true, true, true, true, true]);
  ok('agricultura: campañas, cosechas, liquidaciones (una anulada) y pagos que se cobró el silo',
    [tiene(deRubro('agricultura')[0], 'lotes'), tiene(deRubro('agricultura')[0], 'cosechas'),
      await n("select count(*)::int n from public.liquidaciones where empresa_id=$1 and estado='anulada'", [deRubro('agricultura')[0].empresaId]),
      await n('select count(*)::int n from public.pagos_deuda where empresa_id=$1 and liquidacion_id is not null', [deRubro('agricultura')[0].empresaId])],
    [true, true, 1, 1]);
  ok('y un canje puro: neto cero, sin cuenta',
    await n('select count(*)::int n from public.liquidaciones where empresa_id=$1 and neto = 0 and cuenta_id is null', [deRubro('agricultura')[0].empresaId]), 1);
  ok('ganadería: dos lotes, uno cerrado',
    await n('select count(*)::int n from public.lotes where empresa_id=$1', [deRubro('ganaderia')[0].empresaId]), 2);
  ok('la personal: presupuesto, fijos, ahorro, fiado, billetera y lo traído del trabajo',
    ['presupuesto', 'gastos_fijos', 'ingresos_fijos', 'ahorros', 'movimientos_ahorro', 'categorias_propias', 'fiado', 'cuentas_dinero', 'traidos']
      .map((t) => antes.get(P.empresaId)[t] > 0), [true, true, true, true, true, true, true, true, true]);
  const escribe = async (C) => (await val(C.uid, 'select public.puede_cargar($1) p', [C.empresaId])).p;
  ok('cada negocio en su estado: ¿puede cargar?',
    await Promise.all(ESTADOS.map(async (e) => escribe(CUENTAS.find((c) => c.estado === e)))), [true, true, false]);
  ok('la personal vencida está en Gratis',
    (await filas('select public.es_gratis_personal($1) g', [P.empresaId]))[0].g, true);

  // Lo que miran los grupos 8, 9 y 10, antes de vaciar.
  const DE_ALUMNOS = CUENTAS.filter((c) => c.cobrados);
  const porCobrar = async (C) => {
    const desde = await dia(-60);
    const hasta = await dia(60);
    return [
      Number((await J(C.uid, 'select public.por_cobrar_alumnos($1) j', [C.empresaId])).total),
      Number((await J(C.uid, 'select public.panel_profe($1,$2,$3) j', [C.empresaId, desde, hasta])).por_cobrar),
      Number((await J(C.uid, 'select public.reporte_alumnos($1,$2,$3) j', [C.empresaId, desde, hasta])).por_cobrar),
    ];
  };
  for (const C of DE_ALUMNOS) {
    ok(`${C.rubro} ${C.estado}: por cobrar es solo lo que de verdad falta (alumnos, panel y reporte)`,
      await porCobrar(C), [C.porCobrarAntes, C.porCobrarAntes, C.porCobrarAntes]);
  }
  // La misma cuenta que hace ajustes/page.tsx para avisar antes de
  // confirmar, como la hace PostgREST: con la sesión del dueño y RLS.
  const TURNOS_POR_VENIR = `select count(*)::int n from public.turnos_reserva
    where empresa_id = $1 and estado in ('pendiente', 'confirmada') and inicia > now()`;
  const porVenir = async (uid, E) => (await val(uid, TURNOS_POR_VENIR, [E])).n;
  for (const C of deRubro('servicios')) {
    ok(`servicios ${C.estado}: el dueño ve sus 2 turnos por venir (el del mostrador y el del link)`,
      await porVenir(C.uid, C.empresaId), 2);
  }
  ok('el dueño de otra cuenta no ve ninguno (RLS)', await porVenir(TESTIGOS[0].uid, deRubro('servicios')[0].empresaId), 0);
  // Una por una: cada consulta abre su transacción en la misma conexión.
  const conClasesPorVenir = [];
  for (const c of [...deRubro('clases'), ...deRubro('entrenamiento')]) {
    conClasesPorVenir.push((await porVenir(c.uid, c.empresaId)) > 0);
  }
  ok('clases y entrenamiento también tienen clases por venir en la agenda',
    conClasesPorVenir, [true, true, true, true, true, true]);
  const totalDe = async (t) => n(`select count(*)::int n from public.${t}`);
  const comisionesAntes = await totalDe('comisiones');
  const retirosAntes = await totalDe('retiros');

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Solo el propietario, con el nombre exacto');
  // ═══════════════════════════════════════════════════════════
  const D = DUENIO;
  const nombreD = await nombreDe(D.empresaId);
  rechazado('un administrador no puede', await como(D.admin, 'select public.vaciar_empresa($1,$2)', [D.empresaId, nombreD]), 'propietario');
  rechazado('el dueño de otra cuenta tampoco',
    await como(TESTIGOS[0].uid, 'select public.vaciar_empresa($1,$2)', [D.empresaId, nombreD]), 'propietario');
  rechazado('con el nombre en minúsculas no', await vaciar(D, nombreD.toUpperCase()), 'nombre exacto');
  rechazado('ni vacío', await vaciar(D, ''), 'nombre exacto');
  rechazado('sin sesión no', await sinSesion('select public.vaciar_empresa($1,$2)', [D.empresaId, nombreD]), 'iniciar sesión');
  rechazado('y anon ni la puede llamar', await anon('select public.vaciar_empresa($1,$2)', [D.empresaId, nombreD]), 'permission denied');
  ok('después de los intentos no se borró nada', await foto(D.empresaId), antes.get(D.empresaId));

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Vaciar cada rubro en prueba, pagando y vencido, la personal en Gratis y la de Orden');
  // ═══════════════════════════════════════════════════════════
  const resultados = new Map();
  for (const C of VACIADAS) {
    const r = await vaciar(C);
    resultados.set(C.empresaId, r);
    aceptado(`${C.rubro} ${C.estado}: vaciar`, r);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Se fue lo que se va, quedó lo que queda');
  // ═══════════════════════════════════════════════════════════
  for (const C of VACIADAS) {
    const r = resultados.get(C.empresaId);
    if (!r.ok) continue;
    const E = C.empresaId;
    const a = antes.get(E);
    const d = await foto(E);
    const j = r.valor.rows[0].j;
    const quien = `${C.rubro} ${C.estado}`;
    ok(`${quien}: devuelve lo mismo que antes (movimientos, productos y archivos)`,
      [Object.keys(j).sort(), j.movimientos, j.productos, j.archivos], [['archivos', 'movimientos', 'productos'], a.movimientos, a.productos, [C.ruta]]);
    ok(`${quien}: no queda nada de lo que se va`, SE_VAN.filter((t) => d[t] !== 0), []);
    ok(`${quien}: queda todo lo que queda`,
      QUEDAN.filter((t) => d[t] !== a[t]).map((t) => `${t}: ${a[t]} → ${d[t]}`), []);
    ok(`${quien}: la cuenta, el plan, el código, la IA y las deudas, iguales`,
      [d.nombre, d.suscripcion, d.codigo, d.ia, d.saldo_deudas, d.traidos],
      [a.nombre, a.suscripcion, a.codigo, a.ia, a.saldo_deudas, a.traidos]);
    ok(`${quien}: del fiado y de la agenda cobrada se fue solo lo que colgaba de una venta`,
      [d.fiado, d.turnos_atribucion], [a.fiado - a.fiado_de_venta, a.turnos_atribucion - a.atribuciones_cobradas]);
    // (127) Con cuotas: se fueron las de la venta, quedaron las de lo anotado
    // a mano, y el pago que era de la venta quedó como pago suelto.
    ok(`${quien}: de las cuotas se fueron solo las de la venta fiada, y su pago quedó suelto`,
      [d.fiado_cuotas, d.cuotas_de_venta, d.pagos_de_una_deuda], [a.fiado_cuotas - a.cuotas_de_venta, 0, 0]);
    ok(`${quien}: y lo que debe cada uno sigue cerrando con sus cuotas`,
      await n(`select count(*)::int n from public.clientes c where c.empresa_id = $1
               and public.sin_fecha_fiado(c.id) + coalesce((select sum(e.pendiente) from public.estado_cuotas(c.id) e), 0)
                   <> greatest(public.saldo_fiado(c.id), 0)`, [E]), 0);
    ok(`${quien}: y nada quedó apuntando a lo borrado`,
      [
        await n(`select count(*)::int n from public.fiado where empresa_id=$1 and (cobro_id is not null or venta_id is not null)`, [E]),
        await n(`select count(*)::int n from public.pagos_deuda where empresa_id=$1 and (movimiento_id is not null or liquidacion_id is not null)`, [E]),
        await n('select count(*)::int n from public.turnos_pago where empresa_id=$1 and movimiento_id is not null', [E]),
        await n('select count(*)::int n from public.turnos_atribucion where empresa_id=$1 and (movimiento_id is not null or producto_id is not null)', [E]),
        await n('select count(*)::int n from public.turnos_pago_traido where empresa_personal=$1 and movimiento_id is not null', [E]),
      ],
      [0, 0, 0, 0, 0]);
  }
  const silla = CUENTAS.find((c) => c.rubro === 'servicios');
  ok('servicios: la silla alquilada quedó, sin su producto',
    await cuantas('turnos_atribucion', silla.empresaId), 1);

  // ═══════════════════════════════════════════════════════════
  grupo('6 · Después de vaciar');
  // ═══════════════════════════════════════════════════════════
  for (const C of CUENTAS.filter((c) => c.rubro === 'servicios')) {
    const r = await como(C.uid, MOV, [C.empresaId, 'gasto', 'Después', 'Servicios', 1000, null]);
    if (C.estado === 'vencido') rechazado(`${C.estado}: sigue con el candado (la marca no quedó puesta)`, r, CANDADO);
    else aceptado(`${C.estado}: vuelve a cargar`, r);
  }
  aceptado('la personal en Gratis sigue anotando un gasto',
    await como(P.uid, MOV, [P.empresaId, 'gasto', 'Pan', 'Comida', 5000, null]));
  const otraVez = await vaciar(CUENTAS.find((c) => c.rubro === 'agricultura' && c.estado === 'vencido'));
  ok('vaciar dos veces seguidas anda y la segunda no encuentra nada',
    otraVez.ok ? [otraVez.valor.rows[0].j.movimientos, otraVez.valor.rows[0].j.productos, otraVez.valor.rows[0].j.archivos] : otraVez.error,
    [0, 0, []]);
  let marca = null;
  await H.intentar(db, silla.uid, async () => {
    await db.query('select public.vaciar_empresa($1,$2)', [silla.empresaId, await nombreDe(silla.empresaId)]);
    marca = (await db.query("select coalesce(current_setting('orden.vaciando', true), '') m")).rows[0].m;
  });
  ok('y apaga la marca antes de volver', marca, '');

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Otra cuenta cargada igual no se toca');
  // ═══════════════════════════════════════════════════════════
  for (const C of [...TESTIGOS, PT]) {
    ok(`${C.rubro}: el testigo quedó exactamente igual`, await foto(C.empresaId), fotoTestigos.get(C.empresaId));
  }
  ok('la barbería donde trabaja Pedro tampoco perdió su pago',
    await n('select count(*)::int n from public.turnos_pago where empresa_id=$1 and movimiento_id is not null', [P.jefa.empresaId]), 1);

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Los alumnos no quedan debiendo lo que ya pagaron');
  // ═══════════════════════════════════════════════════════════
  // Hasta que la 115 borró los paquetes, vaciar dejaba cada paquete sin su
  // venta (SET NULL) y ese null se lee como «no se cobró»: la academia
  // pasaba a tener Gs. 1.150.000 por cobrar de alumnos que ya habían pagado,
  // y cobrar_inscripcion los volvía a cobrar.
  for (const C of DE_ALUMNOS) {
    const quien = `${C.rubro} ${C.estado}`;
    ok(`${quien}: nada por cobrar en alumnos, en el panel ni en el reporte`, await porCobrar(C), [0, 0, 0]);
    ok(`${quien}: la lista de a quién pedirle plata está vacía`,
      (await J(C.uid, 'select public.por_cobrar_alumnos($1) j', [C.empresaId])).lista, []);
    for (const p of C.cobrados) {
      rechazado(`${quien}: lo que ya se cobró no se vuelve a cobrar`,
        await como(C.uid, "select public.cobrar_inscripcion($1,'efectivo')", [p]), 'no existe');
    }
    ok(`${quien}: y no entró ninguna venta nueva`, await cuantas('movimientos', C.empresaId), 0);
    ok(`${quien}: los alumnos siguen ahí`, await cuantas('clientes', C.empresaId), antes.get(C.empresaId).clientes);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('9 · Los turnos que sacaron los clientes: se van, y se avisa antes');
  // ═══════════════════════════════════════════════════════════
  // Lo que se decidió (115): vaciar no se frena por turnos por venir (irse
  // tiene que andar siempre), pero la pantalla los cuenta y lo dice antes de
  // que el dueño escriba el nombre, porque a esos clientes no les llega nada.
  for (const C of deRubro('servicios')) {
    ok(`servicios ${C.estado}: después, ningún turno por venir`, await porVenir(C.uid, C.empresaId), 0);
    const suyo = await anon('select public.reserva_por_token($1) j', [C.tokenLink]);
    ok(`servicios ${C.estado}: el enlace del cliente ya no encuentra su turno`, suyo.ok ? suyo.valor.rows[0].j : suyo.error, { existe: false });
  }
  const ajustes = fuente('src/app/(app)/ajustes/page.tsx');
  const zona = fuente('src/components/ZonaPeligro.tsx');
  const es = fuente('src/i18n/textos/es.ts');
  const pt = fuente('src/i18n/textos/pt.ts');
  ok('ajustes cuenta los turnos por venir con los mismos filtros que la prueba',
    [/\.from\('turnos_reserva'\)/, /\.eq\('empresa_id', ctx\.empresa\.id\)/, /\.in\('estado', \['pendiente', 'confirmada'\]\)/,
      /\.gt\('inicia', new Date\(\)\.toISOString\(\)\)/, /turnosPorVenir=\{turnosPorVenir\}/].map((r) => r.test(ajustes)),
    [true, true, true, true, true]);
  ok('la zona delicada lo muestra antes del campo del nombre',
    zona.indexOf('vaciarTurnosPorVenir(turnosPorVenir)') > 0
      && zona.indexOf('vaciarTurnosPorVenir(turnosPorVenir)') < zona.indexOf('vaciarPide(nombreEmpresa)'), true);
  const detalle = (src) => (src.match(/vaciarDetalle: '([^']*)'/) ?? [null, ''])[1];
  ok('el texto de «Empezar de cero» nombra los turnos de los clientes, los paquetes y las liquidaciones (es)',
    [/turnos/, /reservaron tus clientes/, /paquetes e inscripciones/, /liquidaciones/].map((r) => r.test(detalle(es))), [true, true, true, true]);
  ok('y en portugués',
    [/horários/, /clientes já marcaram/, /pacotes e inscrições/, /liquidações/].map((r) => r.test(detalle(pt))), [true, true, true, true]);
  ok('el aviso de los turnos por venir existe en es y pt',
    [/vaciarTurnosPorVenir: \(n: number\)/.test(es), /vaciarTurnosPorVenir: \(n: number\)/.test(pt)], [true, true]);

  // ═══════════════════════════════════════════════════════════
  grupo('10 · La cuenta de Orden: comisiones y retiros quedan, sin su asiento');
  // ═══════════════════════════════════════════════════════════
  ok('las comisiones y los retiros siguen todos', [await totalDe('comisiones'), await totalDe('retiros')],
    [comisionesAntes, retirosAntes]);
  ok('ninguno apunta ya a un movimiento (SET NULL)',
    [await n('select count(*)::int n from public.comisiones where movimiento_id is not null or gasto_id is not null'),
      await n('select count(*)::int n from public.retiros where gasto_id is not null')], [0, 0]);
  ok('el saldo del socio no cambió: la comisión no cuelga del asiento (063)', await saldoS2(), saldoS2Antes);
  ok('y Orden sigue siendo la cuenta de Orden',
    (await filas('select empresa_id from public.ajustes_orden where unica'))[0].empresa_id, O.empresaId);

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE «EMPEZAR DE CERO» FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DE «EMPEZAR DE CERO» PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
