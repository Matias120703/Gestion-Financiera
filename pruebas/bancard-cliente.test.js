/**
 * El cliente de Bancard vPOS 2.0 (src/lib/bancard.ts), contra un Bancard de
 * mentira.
 *
 * En orden de importancia:
 *
 *   1. LA FIRMA. Cada md5 contra un vector calculado a mano (con `crypto`,
 *      la clave inventada y la fórmula del manual, sin pasar por el cliente).
 *      Un md5 mal armado no falla acá: falla en producción, con plata.
 *   2. CADA PEDIDO, TAL COMO VA: la dirección de cada entorno, el método, los
 *      campos que van y los que NO van (`test_client` nunca: con él Bancard
 *      no marca la lista de tests).
 *   3. LO QUE CONTESTA BANCARD: aprobado, rechazado, 3D Secure, sus errores,
 *      una respuesta que no es JSON (el 403 de un bloqueo), un corte.
 *   4. LAS ESPERAS: 15 segundos todo, 55 el cobro, y que un corte se
 *      distinga de un rechazo (un cobro cortado NO se reintenta).
 *   5. NINGÚN SECRETO SALE: ni en un resultado, ni en un error, ni en la
 *      consola. La clave privada viaja solo adentro del md5.
 *   6. LA CONFIRMACIÓN que manda Bancard: su md5, en tiempo constante.
 *   7. QUIÉN VE BANCARD (la regla del interruptor).
 *
 * Las claves son inventadas. Acá no va ninguna tarjeta de prueba del portal.
 *
 * Lee `.compilado/` (lo arma `probar:calculos` con tsconfig.calculos.json).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { crearBancardFalso, CLAVES_DE_PRUEBA } = require('./bancard-falso.js');

const B = require('../.compilado/bancard.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a.length > 90 ? a.slice(0, 87) + '...' : a}`);
}
function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

const raiz = path.join(__dirname, '..');
// CRLF normalizado: en un worktree de Windows los fuentes llegan con \r\n.
const leer = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');

const PRIVADA = CLAVES_DE_PRUEBA.clavePrivada;
const PUBLICA = CLAVES_DE_PRUEBA.clavePublica;
const ALIAS = 'aliasinventado0123456789';
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

// ---------------------------------------------------------------
// El espía de la consola. Mientras corre una llamada al cliente, todo lo que
// se escriba por CUALQUIER método de `console` queda guardado. Al final no
// tiene que haber nada, y menos un secreto.
// ---------------------------------------------------------------
const dichoPorElCliente = [];
let espiando = false;
for (const metodo of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table']) {
  const original = console[metodo].bind(console);
  console[metodo] = (...args) => {
    if (espiando) {
      dichoPorElCliente.push(args.map((a) => {
        try { return typeof a === 'string' ? a : JSON.stringify(a) ?? String(a); } catch { return String(a); }
      }).join(' '));
      return;
    }
    original(...args);
  };
}

/** Todo lo que el cliente devolvió o lanzó, para buscar secretos al final. */
const salidas = [];

/** Llama al cliente con el espía prendido. Devuelve el resultado o `{ lanzo }`. */
async function llamar(fn) {
  espiando = true;
  try {
    const r = await fn();
    salidas.push(JSON.stringify(r));
    return r;
  } catch (e) {
    const texto = `${e && e.name}: ${e && e.message}\n${e && e.stack}`;
    salidas.push(texto);
    return { lanzo: String(e && e.message) };
  } finally {
    espiando = false;
  }
}

const CONFIG = { entorno: 'staging', clavePublica: PUBLICA, clavePrivada: PRIVADA, con3ds: true };
const VUELTA = 'https://orden.com.py/plan/pago/1000001';

(async () => {
  // ═══════════════════════════════════════════════════════════
  grupo('1 · La firma: cada md5 contra un vector calculado a mano');
  // ═══════════════════════════════════════════════════════════
  {
    // Los ocho de API-VPOS.md §2: clave privada inventada, pedido 1000001,
    // "250000.00", PYG, usuario 5001, tarjeta 1, alias inventado.
    ok('la clave privada inventada tiene la forma de una de verdad (40)', PRIVADA.length, 40);
    ok('single_buy: md5(clave + pedido + importe + moneda)',
      B.tokens.singleBuy(PRIVADA, 1000001, '250000.00'), 'affb8167a822d4a5f637dffcfea5b75a');
    ok('confirm: md5(clave + pedido + "confirm" + importe + moneda)',
      B.tokens.confirm(PRIVADA, 1000001, '250000.00'), '709edb67ab4f6f3533480a1b9e0271b4');
    ok('el de confirm da lo mismo con el pedido como texto (así llega)',
      B.tokens.confirm(PRIVADA, '1000001', '250000.00'), '709edb67ab4f6f3533480a1b9e0271b4');
    ok('consulta: md5(clave + pedido + "get_confirmation")',
      B.tokens.consulta(PRIVADA, 1000001), 'fd4194d5e0f01bd39f7e90919ee087b8');
    ok('rollback: md5(clave + pedido + "rollback" + "0.00")',
      B.tokens.rollback(PRIVADA, 1000001), 'c9cea935fb32456a8fff3f43e5ae3675');
    ok('cards_new: md5(clave + card_id + user_id + "request_new_card")',
      B.tokens.cardsNew(PRIVADA, 1, 5001), 'fb49b74a0ad58645bcd15f92ff8351fb');
    ok('users_cards: md5(clave + user_id + "request_user_cards")',
      B.tokens.usersCards(PRIVADA, 5001), '6aa366d62260fb403aa26fc17cde4bfa');
    ok('charge: md5(clave + pedido + "charge" + importe + moneda + alias)',
      B.tokens.charge(PRIVADA, 1000001, '250000.00', ALIAS), 'a2faa78f11e86948713170389e9f5717');
    ok('borrar: md5(clave + "delete_card" + user_id + alias)',
      B.tokens.borrar(PRIVADA, 5001, ALIAS), 'e8d385fdf84366f7c4058ad4d316a18d');

    // Y los mismos, vueltos a calcular acá con la fórmula del manual: si
    // alguien copia mal un vector, esto lo dice.
    ok('los ocho coinciden con la fórmula del manual escrita de nuevo', [
      md5(PRIVADA + '1000001' + '250000.00' + 'PYG'),
      md5(PRIVADA + '1000001' + 'confirm' + '250000.00' + 'PYG'),
      md5(PRIVADA + '1000001' + 'get_confirmation'),
      md5(PRIVADA + '1000001' + 'rollback' + '0.00'),
      md5(PRIVADA + '1' + '5001' + 'request_new_card'),
      md5(PRIVADA + '5001' + 'request_user_cards'),
      md5(PRIVADA + '1000001' + 'charge' + '250000.00' + 'PYG' + ALIAS),
      md5(PRIVADA + 'delete_card' + '5001' + ALIAS),
    ], [
      'affb8167a822d4a5f637dffcfea5b75a', '709edb67ab4f6f3533480a1b9e0271b4',
      'fd4194d5e0f01bd39f7e90919ee087b8', 'c9cea935fb32456a8fff3f43e5ae3675',
      'fb49b74a0ad58645bcd15f92ff8351fb', '6aa366d62260fb403aa26fc17cde4bfa',
      'a2faa78f11e86948713170389e9f5717', 'e8d385fdf84366f7c4058ad4d316a18d',
    ]);

    // El orden es exacto: cambiar de lugar dos pedazos da otro md5.
    ok('el orden importa: card_id y user_id cruzados dan otro token',
      B.tokens.cardsNew(PRIVADA, 5001, 1) === B.tokens.cardsNew(PRIVADA, 1, 5001), false);
    ok('son 32 caracteres hexadecimales en minúscula',
      Object.values(B.tokens).length === 8
        && /^[0-9a-f]{32}$/.test(B.tokens.singleBuy(PRIVADA, 1, '1.00')), true);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('2 · El importe: guaraníes enteros, con dos decimales y punto');
  // ═══════════════════════════════════════════════════════════
  {
    ok('370000 → "370000.00"', B.importeTexto(370000), '370000.00');
    ok('1 → "1.00"', B.importeTexto(1), '1.00');
    const lanza = (v) => { try { B.importeTexto(v); return false; } catch { return true; } };
    ok('rechaza 0, negativos, decimales, textos, NaN e infinito',
      [0, -1, 100.5, '370000', NaN, Infinity, null, undefined].map(lanza),
      [true, true, true, true, true, true, true, true]);
    ok('y un importe que no entra en Decimal(15,2)', lanza(10 ** 14), true);

    ok('importeDe lee lo que manda Bancard en sus tres formas',
      [B.importeDe('10100.00'), B.importeDe(10100), B.importeDe('1100.0')], [10100, 10100, 1100]);
    ok('y cualquier otra cosa es null',
      [B.importeDe(''), B.importeDe('10.100,00'), B.importeDe('abc'), B.importeDe(null), B.importeDe(undefined),
        B.importeDe(-5), B.importeDe(NaN), B.importeDe({}), B.importeDe('1e5')],
      [null, null, null, null, null, null, null, null, null]);

    ok('ultimos4 saca los cuatro del final del enmascarado',
      [B.ultimos4('4000********0016'), B.ultimos4('5000 **** **** 0014'), B.ultimos4('****'), B.ultimos4(''), B.ultimos4(null)],
      ['0016', '0014', null, null, null]);

    ok('aprobada = response S y código 00 (también sin el cero, como en el anexo)',
      [B.esAprobada({ response: 'S', response_code: '00' }), B.esAprobada({ response: 'S', response_code: '0' }),
        B.esAprobada({ response: 'S', response_code: 0 })], [true, true, true]);
    ok('y nada más lo es',
      [B.esAprobada({ response: 'N', response_code: '00' }), B.esAprobada({ response: 'S', response_code: '05' }),
        B.esAprobada({ response: 'S' }), B.esAprobada({ response: null, response_code: null }), B.esAprobada({})],
      [false, false, false, false, false]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('3 · Cada pedido, tal como va');
  // ═══════════════════════════════════════════════════════════
  const falso = crearBancardFalso({ entorno: 'staging' });
  const bancard = B.crearBancard(CONFIG, falso.transporte);
  {
    ok('los dos hosts del manual y la ruta de la API',
      [B.HOST_BANCARD.produccion, B.HOST_BANCARD.staging, B.RUTA_API],
      ['https://vpos.infonet.com.py', 'https://vpos.infonet.com.py:8888', '/vpos/api/0.3']);
    ok('el script del formulario es el 4.0.0 del host de cada entorno',
      [B.urlDelScript('staging'), B.urlDelScript('produccion')],
      ['https://vpos.infonet.com.py:8888/checkout/javascript/dist/bancard-checkout-4.0.0.js',
        'https://vpos.infonet.com.py/checkout/javascript/dist/bancard-checkout-4.0.0.js']);

    // ---- single_buy
    const r = await llamar(() => bancard.singleBuy({
      operacion: 1000001, importe: 250000, descripcion: 'Orden Premium', returnUrl: VUELTA, cancelUrl: VUELTA,
    }));
    const p = falso.ultimo();
    ok('single_buy: el Bancard de mentira acepta la firma y devuelve el process_id',
      [r.ok, typeof r.processId, r.processId.length <= 20], [true, 'string', true]);
    ok('va por POST a la dirección de staging (puerto 8888)',
      [p.method, p.url], ['POST', 'https://vpos.infonet.com.py:8888/vpos/api/0.3/single_buy']);
    ok('como JSON', p.headers['Content-Type'], 'application/json');
    ok('el sobre es { public_key, operation }', Object.keys(p.cuerpo).sort(), ['operation', 'public_key']);
    ok('con la clave pública', p.cuerpo.public_key, PUBLICA);
    ok('y la operación lleva exactamente estos campos, ni uno más',
      Object.keys(p.cuerpo.operation).sort(),
      ['amount', 'cancel_url', 'currency', 'description', 'return_url', 'shop_process_id', 'token']);
    ok('el pedido va como NÚMERO, el importe como texto "N.00", en PYG',
      [p.cuerpo.operation.shop_process_id, p.cuerpo.operation.amount, p.cuerpo.operation.currency],
      [1000001, '250000.00', 'PYG']);
    ok('el token es el del vector', p.cuerpo.operation.token, 'affb8167a822d4a5f637dffcfea5b75a');
    ok('no manda test_client, billing, iva_amount, additional_data, preauthorization, zimple ni extras',
      ['test_client', 'billing', 'iva_amount', 'additional_data', 'preauthorization', 'zimple', 'extra_response_attributes']
        .filter((c) => c in p.cuerpo.operation || c in p.cuerpo), []);

    // ---- consulta: todavía no pagó
    const c1 = await llamar(() => bancard.consultar(1000001));
    const pc = falso.ultimo();
    ok('consulta sin pago: no es un error de red, es «todavía no pagó»',
      c1, { ok: false, clave: 'PaymentNotFoundError', http: 200, clase: 'bancard' });
    ok('la consulta va a single_buy/confirmations con el pedido como CADENA',
      [pc.method, pc.ruta, pc.cuerpo.operation.shop_process_id, Object.keys(pc.cuerpo.operation).sort()],
      ['POST', '/single_buy/confirmations', '1000001', ['shop_process_id', 'token']]);
    ok('y el token del vector', pc.cuerpo.operation.token, 'fd4194d5e0f01bd39f7e90919ee087b8');

    // ---- la persona paga; la consulta lo trae
    falso.pagar(1000001);
    const c2 = await llamar(() => bancard.consultar(1000001));
    ok('consulta con pago: trae la confirmación de Bancard',
      [c2.ok, c2.confirmacion.response, c2.confirmacion.response_code, c2.confirmacion.amount, B.esAprobada(c2.confirmacion)],
      [true, 'S', '00', '250000.00', true]);
    ok('un pedido que Bancard no conoce: BuyNotFoundError',
      await llamar(() => bancard.consultar(424242)),
      { ok: false, clave: 'BuyNotFoundError', http: 200, clase: 'bancard' });

    // ---- reversa
    const rv = await llamar(() => bancard.revertir(1000001));
    const pr = falso.ultimo();
    ok('reversa de un pago aprobado', rv, { ok: true, clave: 'RollbackSuccessful' });
    ok('va a single_buy/rollback con el pedido como CADENA y nada más',
      [pr.method, pr.ruta, pr.cuerpo.operation.shop_process_id, Object.keys(pr.cuerpo.operation).sort()],
      ['POST', '/single_buy/rollback', '1000001', ['shop_process_id', 'token']]);
    ok('con el token del vector ("0.00")', pr.cuerpo.operation.token, 'c9cea935fb32456a8fff3f43e5ae3675');
    ok('revertir dos veces: AlreadyRollbackedError (quien llama decide si lo toma por bueno)',
      await llamar(() => bancard.revertir(1000001)),
      { ok: false, clave: 'AlreadyRollbackedError', http: 200, clase: 'bancard' });
    await llamar(() => bancard.singleBuy({ operacion: 1000002, importe: 110000, descripcion: 'Orden Basico', returnUrl: VUELTA, cancelUrl: VUELTA }));
    ok('revertir uno que nadie pagó: PaymentNotFoundError',
      await llamar(() => bancard.revertir(1000002)),
      { ok: false, clave: 'PaymentNotFoundError', http: 200, clase: 'bancard' });

    // ---- pedir el catastro
    const cn = await llamar(() => bancard.cardsNew({
      cardId: 1, userId: 5001, telefono: '0981123456', email: 'persona@example.com',
      returnUrl: 'https://orden.com.py/plan/tarjeta/1',
    }));
    const pn = falso.ultimo();
    ok('cards/new: devuelve el process_id del formulario de catastro', [cn.ok, typeof cn.processId], [true, 'string']);
    ok('va por POST a cards/new con estos campos',
      [pn.method, pn.ruta, Object.keys(pn.cuerpo.operation).sort()],
      ['POST', '/cards/new', ['card_id', 'return_url', 'token', 'user_cell_phone', 'user_id', 'user_mail']]);
    ok('card_id y user_id como números; teléfono y correo como CADENAS',
      [pn.cuerpo.operation.card_id, pn.cuerpo.operation.user_id, pn.cuerpo.operation.user_cell_phone, pn.cuerpo.operation.user_mail],
      [1, 5001, '0981123456', 'persona@example.com']);
    ok('y el token del vector', pn.cuerpo.operation.token, 'fb49b74a0ad58645bcd15f92ff8351fb');

    // ---- las tarjetas del usuario
    ok('antes de cargarla, el usuario no tiene tarjetas',
      await llamar(() => bancard.tarjetas(5001)), { ok: true, tarjetas: [] });
    falso.completarCatastro(cn.processId, { marca: 'Visa', enmascarado: '4000********0016', tipo: 'credit', vencimiento: '12/30' });
    const tj = await llamar(() => bancard.tarjetas(5001));
    const pt = falso.ultimo();
    ok('users/5001/cards es un POST, solo con el token',
      [pt.method, pt.ruta, Object.keys(pt.cuerpo.operation)], ['POST', '/users/5001/cards', ['token']]);
    ok('con el token del vector', pt.cuerpo.operation.token, '6aa366d62260fb403aa26fc17cde4bfa');
    ok('trae la tarjeta con su número de Orden, marca, enmascarado, vencimiento y tipo',
      tj.tarjetas.map((t) => [t.cardId, t.marca, t.enmascarado, t.vencimiento, t.tipo, typeof t.alias, t.alias.length > 10]),
      [[1, 'Visa', '4000********0016', '12/30', 'credit', 'string', true]]);
    ok('y de ahí salen los últimos cuatro', B.ultimos4(tj.tarjetas[0].enmascarado), '0016');

    // ---- cobro con la tarjeta guardada
    const alias1 = tj.tarjetas[0].alias;
    const ch = await llamar(() => bancard.cobrar({
      operacion: 1000003, importe: 250000, descripcion: 'Orden Premium', alias: alias1, returnUrl: VUELTA,
    }));
    const pch = falso.ultimo();
    ok('charge aprobado: «resuelto», con la respuesta de Bancard',
      [ch.ok, ch.tipo, B.esAprobada(ch.respuesta)], [true, 'resuelto', true]);
    ok('el importe de la respuesta de un charge viene como NÚMERO, y se lee igual',
      [typeof ch.respuesta.amount, B.importeDe(ch.respuesta.amount)], ['number', 250000]);
    ok('va por POST a charge con estos campos',
      [pch.method, pch.ruta, Object.keys(pch.cuerpo.operation).sort()],
      ['POST', '/charge', ['additional_data', 'alias_token', 'amount', 'currency', 'description',
        'extra_response_attributes', 'number_of_payments', 'return_url', 'shop_process_id', 'token']]);
    ok('una sola cuota, additional_data vacío, pedido como número, y el pedido de 3DS que manda el manual',
      [pch.cuerpo.operation.number_of_payments, pch.cuerpo.operation.additional_data,
        pch.cuerpo.operation.shop_process_id, pch.cuerpo.operation.extra_response_attributes],
      [1, '', 1000003, ['confirmation.process_id']]);
    ok('el token lleva el alias al final (la fórmula del manual, con ese alias)',
      pch.cuerpo.operation.token, md5(PRIVADA + '1000003' + 'charge' + '250000.00' + 'PYG' + alias1));
    ok('sin test_client, billing, iva_amount ni preauthorization',
      ['test_client', 'billing', 'iva_amount', 'preauthorization'].filter((c) => c in pch.cuerpo.operation), []);

    // El alias vale para UNA operación.
    ok('el mismo alias otra vez: CardAliasTokenExpiredError',
      await llamar(() => bancard.cobrar({ operacion: 1000004, importe: 250000, descripcion: 'Orden Premium', alias: alias1, returnUrl: VUELTA })),
      { ok: false, clave: 'CardAliasTokenExpiredError', http: 200, clase: 'bancard' });

    // ---- rechazado
    falso.proximoCobro({ tipo: 'rechazar', codigo: '51', descripcion: 'NO APROBADA-INSUF.DE FONDOS' });
    const a2 = (await llamar(() => bancard.tarjetas(5001))).tarjetas[0].alias;
    const rj = await llamar(() => bancard.cobrar({ operacion: 1000005, importe: 250000, descripcion: 'Orden Premium', alias: a2, returnUrl: VUELTA }));
    ok('charge rechazado: también «resuelto» (lo decide la base), y no está aprobado',
      [rj.ok, rj.tipo, rj.respuesta.response, rj.respuesta.response_code, rj.respuesta.response_description, B.esAprobada(rj.respuesta)],
      [true, 'resuelto', 'N', '51', 'NO APROBADA-INSUF.DE FONDOS', false]);

    // ---- 3D Secure: todo vacío menos process_id
    falso.proximoCobro({ tipo: '3ds' });
    const a3 = (await llamar(() => bancard.tarjetas(5001))).tarjetas[0].alias;
    const ds = await llamar(() => bancard.cobrar({ operacion: 1000006, importe: 250000, descripcion: 'Orden Premium', alias: a3, returnUrl: VUELTA }));
    ok('charge que pide 3D Secure: «3ds» con el process_id para abrir el formulario',
      [ds.ok, ds.tipo, typeof ds.processId, 'respuesta' in ds], [true, '3ds', 'string', false]);

    // ---- una respuesta de charge que no dice nada: no se sabe qué pasó
    falso.programar('/charge', { json: { operation: { process_id: null, response: null } } });
    ok('charge sin resultado y sin 3DS: forma desconocida (incierto, no se reintenta)',
      await llamar(() => bancard.cobrar({ operacion: 1000007, importe: 250000, descripcion: 'Orden Premium', alias: ALIAS, returnUrl: VUELTA })),
      { ok: false, clave: 'forma_desconocida', http: 200, clase: 'no_json' });

    // ---- borrar la tarjeta
    const a4 = (await llamar(() => bancard.tarjetas(5001))).tarjetas[0].alias;
    const bo = await llamar(() => bancard.borrarTarjeta(5001, a4));
    const pb = falso.ultimo();
    ok('borrar la tarjeta', bo, { ok: true });
    ok('es un DELETE a users/5001/cards CON cuerpo JSON: el token y el alias',
      [pb.method, pb.ruta, Object.keys(pb.cuerpo.operation).sort(), typeof pb.crudo],
      ['DELETE', '/users/5001/cards', ['alias_token', 'token'], 'string']);
    ok('con la fórmula del manual para ese alias',
      pb.cuerpo.operation.token, md5(PRIVADA + 'delete_card' + '5001' + a4));
    ok('y Bancard ya no la tiene', (await llamar(() => bancard.tarjetas(5001))).tarjetas, []);

    // ---- producción: la misma API sin el puerto
    const falsoProd = crearBancardFalso({ entorno: 'produccion' });
    const prod = B.crearBancard({ ...CONFIG, entorno: 'produccion' }, falsoProd.transporte);
    const rp = await llamar(() => prod.singleBuy({ operacion: 1000001, importe: 250000, descripcion: 'Orden Premium', returnUrl: VUELTA, cancelUrl: VUELTA }));
    ok('en producción el pedido va al host sin puerto',
      [rp.ok, falsoProd.ultimo().url], [true, 'https://vpos.infonet.com.py/vpos/api/0.3/single_buy']);
    ok('y el cliente dice de qué entorno es', [bancard.entorno, prod.entorno], ['staging', 'produccion']);

    // ---- con3ds apagado
    const falso2 = crearBancardFalso();
    const sin3ds = B.crearBancard({ ...CONFIG, con3ds: false }, falso2.transporte);
    falso2.registrarTarjeta(5001, 1);
    const a5 = (await llamar(() => sin3ds.tarjetas(5001))).tarjetas[0].alias;
    const s3 = await llamar(() => sin3ds.cobrar({ operacion: 1000001, importe: 250000, descripcion: 'Orden Premium', alias: a5, returnUrl: VUELTA }));
    ok('con con3ds: false el charge NO manda extra_response_attributes',
      [s3.ok, 'extra_response_attributes' in falso2.ultimo().cuerpo.operation], [true, false]);

    // ---- ningún pedido, de ninguno de los clientes, lleva test_client
    const todos = [...falso.pedidos, ...falsoProd.pedidos, ...falso2.pedidos];
    ok('se hicieron pedidos de las siete operaciones',
      [...new Set(todos.map((x) => `${x.method} ${x.ruta.replace(/[0-9]+/, 'N')}`))].sort(),
      ['DELETE /users/N/cards', 'POST /cards/new', 'POST /charge', 'POST /single_buy',
        'POST /single_buy/confirmations', 'POST /single_buy/rollback', 'POST /users/N/cards']);
    ok('y NINGUNO lleva test_client', todos.filter((x) => x.crudo.includes('test_client')).length, 0);
    ok('la clave privada no viaja en ningún pedido (solo adentro del md5)',
      todos.filter((x) => (x.url + x.crudo).includes(PRIVADA)).length, 0);
    ok('todos van al host de su entorno',
      todos.filter((x) => !x.enBase).length, 0);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('4 · Lo que se comprueba ANTES de llamar');
  // ═══════════════════════════════════════════════════════════
  {
    const f = crearBancardFalso();
    const b = B.crearBancard(CONFIG, f.transporte);
    const bien = { operacion: 1000001, importe: 250000, descripcion: 'Orden Premium', returnUrl: VUELTA, cancelUrl: VUELTA };
    const largo = 'https://orden.com.py/' + 'a'.repeat(256 - 'https://orden.com.py/'.length);

    ok('«Orden Premium mensual» tiene 21 caracteres', 'Orden Premium mensual'.length, 21);
    ok('una descripción de 21 lanza',
      (await llamar(() => b.singleBuy({ ...bien, descripcion: 'Orden Premium mensual' }))).lanzo !== undefined, true);
    ok('una de 20 pasa', (await llamar(() => b.singleBuy({ ...bien, descripcion: 'x'.repeat(20) }))).ok, true);
    ok('una dirección de vuelta de 256 lanza',
      [largo.length, (await llamar(() => b.singleBuy({ ...bien, operacion: 1000002, returnUrl: largo }))).lanzo !== undefined],
      [256, true]);
    ok('una de cancelación de 256, también',
      (await llamar(() => b.singleBuy({ ...bien, operacion: 1000002, cancelUrl: largo }))).lanzo !== undefined, true);
    ok('una dirección que no es http(s) lanza',
      (await llamar(() => b.singleBuy({ ...bien, operacion: 1000002, returnUrl: 'javascript:alert(1)' }))).lanzo !== undefined, true);
    ok('un importe de cero o con decimales lanza',
      [(await llamar(() => b.singleBuy({ ...bien, operacion: 1000002, importe: 0 }))).lanzo !== undefined,
        (await llamar(() => b.singleBuy({ ...bien, operacion: 1000002, importe: 100.5 }))).lanzo !== undefined],
      [true, true]);
    ok('un número de operación que no es un entero positivo de hasta 15 dígitos lanza',
      [(await llamar(() => b.singleBuy({ ...bien, operacion: 0 }))).lanzo !== undefined,
        (await llamar(() => b.singleBuy({ ...bien, operacion: 10 ** 15 }))).lanzo !== undefined,
        (await llamar(() => b.consultar('1000001'))).lanzo !== undefined,
        (await llamar(() => b.revertir(1.5))).lanzo !== undefined],
      [true, true, true, true]);
    ok('un charge con descripción larga o sin alias lanza',
      [(await llamar(() => b.cobrar({ operacion: 1000003, importe: 1000, descripcion: 'x'.repeat(21), alias: ALIAS, returnUrl: VUELTA }))).lanzo !== undefined,
        (await llamar(() => b.cobrar({ operacion: 1000003, importe: 1000, descripcion: 'Orden Pro', alias: '', returnUrl: VUELTA }))).lanzo !== undefined],
      [true, true]);
    ok('un catastro sin teléfono o sin correo lanza',
      [(await llamar(() => b.cardsNew({ cardId: 1, userId: 5001, telefono: '', email: 'a@b.com', returnUrl: VUELTA }))).lanzo !== undefined,
        (await llamar(() => b.cardsNew({ cardId: 1, userId: 5001, telefono: '0981', email: '  ', returnUrl: VUELTA }))).lanzo !== undefined],
      [true, true]);
    ok('y NADA de eso llegó a Bancard: solo el pedido bueno',
      f.pedidos.map((x) => x.ruta), ['/single_buy']);

    ok('un cliente sin claves no se arma',
      [(await llamar(() => B.crearBancard({ ...CONFIG, clavePrivada: '' }, f.transporte))).lanzo !== undefined,
        (await llamar(() => B.crearBancard({ ...CONFIG, clavePublica: '' }, f.transporte))).lanzo !== undefined,
        (await llamar(() => B.crearBancard({ ...CONFIG, entorno: 'pruebas' }, f.transporte))).lanzo !== undefined],
      [true, true, true]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('5 · Los errores de Bancard, lo que no es JSON y los cortes');
  // ═══════════════════════════════════════════════════════════
  {
    const f = crearBancardFalso();
    const pedido = { operacion: 1000001, importe: 250000, descripcion: 'Orden Premium', returnUrl: VUELTA, cancelUrl: VUELTA };

    // Una firma mala: el Bancard de mentira la rechaza como el de verdad.
    const mala = B.crearBancard({ ...CONFIG, clavePrivada: 'OtraClavePrivadaInventadaQueNoEsLaBuena0' }, f.transporte);
    ok('con otra clave privada: InvalidTokenError',
      await llamar(() => mala.singleBuy(pedido)),
      { ok: false, clave: 'InvalidTokenError', http: 200, clase: 'bancard' });
    const otraPublica = B.crearBancard({ ...CONFIG, clavePublica: 'OtraClavePublicaInventada0000002' }, f.transporte);
    ok('con otra clave pública: InvalidPublicKeyError',
      await llamar(() => otraPublica.singleBuy(pedido)),
      { ok: false, clave: 'InvalidPublicKeyError', http: 200, clase: 'bancard' });

    const b = B.crearBancard(CONFIG, f.transporte);

    f.programar('/single_buy', { json: { status: 'error', messages: [{ key: 'InvalidAmountError', level: 'error', dsc: 'Amount attribute must be greater than zero.' }] } });
    ok('status error → la clave de messages[0]',
      await llamar(() => b.singleBuy(pedido)),
      { ok: false, clave: 'InvalidAmountError', http: 200, clase: 'bancard' });

    f.programar('/single_buy', { status: 422, json: { status: 'error', messages: [{ key: 'InvalidOperationError', level: 'error', dsc: 'x' }] } });
    ok('se lee el cuerpo aunque el HTTP no sea 200',
      await llamar(() => b.singleBuy(pedido)),
      { ok: false, clave: 'InvalidOperationError', http: 422, clase: 'bancard' });

    f.programar('/single_buy', { json: { status: 'error' } });
    ok('un error sin mensajes igual es un error de Bancard',
      await llamar(() => b.singleBuy(pedido)),
      { ok: false, clave: 'ErrorDesconocido', http: 200, clase: 'bancard' });

    f.programar('/single_buy', { status: 500, json: { algo: 'raro' } });
    ok('un 500 con JSON sin status: error de Bancard con su HTTP',
      await llamar(() => b.singleBuy(pedido)),
      { ok: false, clave: 'http_500', http: 500, clase: 'bancard' });

    // Revisión 07/10 (R3.4): un 5xx con JSON sigue siendo clase 'bancard',
    // pero el cliente CONSERVA el HTTP. Con eso el flujo distingue un «no»
    // de Bancard (4xx o 200 con status error: no se cobró) de un 502 de un
    // proxy que pudo llegar después de cobrar (queda incierta).
    f.registrarTarjeta(5001, 1);
    const aliasDe5xx = (await llamar(() => b.tarjetas(5001))).tarjetas[0].alias;
    const cobro = { operacion: 1000011, importe: 250000, descripcion: 'Orden Premium', alias: aliasDe5xx, returnUrl: VUELTA };
    f.programar('/charge', { status: 502, json: { message: 'Bad Gateway' } });
    ok('charge con 502 y JSON (un proxy): clase bancard, con su 502 a la vista',
      await llamar(() => b.cobrar(cobro)), { ok: false, clave: 'http_502', http: 502, clase: 'bancard' });
    f.programar('/charge', { status: 500, json: { status: 'error', messages: [{ key: 'InternalError', level: 'error', dsc: 'x' }] } });
    ok('charge con 500 y status error: la clave de Bancard, y el 500',
      await llamar(() => b.cobrar(cobro)), { ok: false, clave: 'InternalError', http: 500, clase: 'bancard' });

    // El 403 en HTML de un bloqueo delante de vPOS.
    f.programar('/single_buy', { status: 403, texto: '<!DOCTYPE html><html><title>Attention Required!</title></html>' });
    ok('HTTP 403 con HTML → no_json (se distingue de un rechazo)',
      await llamar(() => b.singleBuy(pedido)),
      { ok: false, clave: 'no_json', http: 403, clase: 'no_json' });

    f.programar('/single_buy', { status: 200, texto: '' });
    ok('un cuerpo vacío → no_json',
      await llamar(() => b.singleBuy(pedido)), { ok: false, clave: 'no_json', http: 200, clase: 'no_json' });

    f.programar('/single_buy', { status: 200, texto: '"success"' });
    ok('un JSON que no es un objeto → no_json',
      await llamar(() => b.singleBuy(pedido)), { ok: false, clave: 'no_json', http: 200, clase: 'no_json' });

    f.programar('/single_buy', { json: { status: 'success' } });
    ok('un success sin process_id → forma desconocida',
      await llamar(() => b.singleBuy(pedido)),
      { ok: false, clave: 'forma_desconocida', http: 200, clase: 'no_json' });

    f.programar('/single_buy/confirmations', { json: { status: 'success' } });
    ok('una consulta success sin confirmation → forma desconocida',
      await llamar(() => b.consultar(1000001)),
      { ok: false, clave: 'forma_desconocida', http: 200, clase: 'no_json' });

    f.programar('/users/5001/cards', { json: { status: 'success' } });
    ok('una lista de tarjetas sin cards → forma desconocida',
      await llamar(() => b.tarjetas(5001)),
      { ok: false, clave: 'forma_desconocida', http: 200, clase: 'no_json' });

    // Un corte de red: el fetch de Node lanza TypeError('fetch failed').
    f.programar('/single_buy', 'red');
    ok('sin red → clase red',
      await llamar(() => b.singleBuy(pedido)), { ok: false, clave: 'red', http: 0, clase: 'red' });

    // Bancard no contesta: el transporte respeta la señal y lanza AbortError.
    f.programar('/single_buy', 'colgar');
    const t0 = Date.now();
    const cortado = await llamar(() => b.singleBuy(pedido, { esperaMs: 40 }));
    ok('Bancard no contesta: AbortError → timeout', cortado, { ok: false, clave: 'timeout', http: 0, clase: 'timeout' });
    ok('y corta a los pocos milisegundos pedidos, no a los 15 segundos', Date.now() - t0 < 2000, true);

    // Un transporte que NO respeta la señal: el corte igual sale.
    const sordo = B.crearBancard(CONFIG, () => new Promise(() => {}));
    const t1 = Date.now();
    ok('aunque el transporte ignore la señal, la espera se corta igual',
      [await llamar(() => sordo.consultar(1000001, { esperaMs: 40 })), Date.now() - t1 < 2000],
      [{ ok: false, clave: 'timeout', http: 0, clase: 'timeout' }, true]);

    // Un transporte que lanza un AbortError propio (el fetch con su señal).
    const abortado = B.crearBancard(CONFIG, async () => { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; });
    ok('un AbortError del transporte también es timeout',
      await llamar(() => abortado.consultar(1000001)), { ok: false, clave: 'timeout', http: 0, clase: 'timeout' });

    // Un error cualquiera cuyo mensaje trae el pedido entero: no sale nada.
    const charlatan = B.crearBancard(CONFIG, async (url, init) => { throw new Error(`falló ${url} con ${init.body}`); });
    const rc = await llamar(() => charlatan.cobrar({ operacion: 1000009, importe: 250000, descripcion: 'Orden Premium', alias: ALIAS, returnUrl: VUELTA }));
    ok('un error del transporte que trae el pedido adentro: el resultado no lo repite',
      rc, { ok: false, clave: 'red', http: 0, clase: 'red' });

    // Las esperas por defecto: se mira con cuánto arma el cliente su reloj.
    const esperas = [];
    const relojDeVerdad = global.setTimeout;
    global.setTimeout = (fn, ms, ...resto) => { esperas.push(ms); return relojDeVerdad(fn, ms, ...resto); };
    try {
      const f2 = crearBancardFalso();
      const b2 = B.crearBancard(CONFIG, f2.transporte);
      f2.registrarTarjeta(5001, 1);
      await b2.singleBuy(pedido);
      await b2.consultar(1000001);
      await b2.revertir(1000001);
      await b2.cardsNew({ cardId: 2, userId: 5001, telefono: '0981123456', email: 'a@b.com', returnUrl: VUELTA });
      const al = (await b2.tarjetas(5001)).tarjetas[0].alias;
      await b2.borrarTarjeta(5001, al);
      f2.registrarTarjeta(5001, 1);
      const al2 = (await b2.tarjetas(5001)).tarjetas[0].alias;
      await b2.cobrar({ operacion: 1000002, importe: 250000, descripcion: 'Orden Premium', alias: al2, returnUrl: VUELTA });
      await b2.cobrar({ operacion: 1000003, importe: 250000, descripcion: 'Orden Premium', alias: ALIAS, returnUrl: VUELTA }, { esperaMs: 40000 });
      await b2.consultar(1000001, { esperaMs: 8000 });
    } finally {
      global.setTimeout = relojDeVerdad;
    }
    ok('15 segundos para todo, 55 para el cobro, y lo que se pida cuando se pide',
      esperas, [15000, 15000, 15000, 15000, 15000, 15000, 15000, 55000, 40000, 8000]);
    ok('las constantes dicen lo mismo', [B.ESPERA_MS, B.ESPERA_DE_COBRO_MS], [15000, 55000]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('6 · La confirmación que manda Bancard');
  // ═══════════════════════════════════════════════════════════
  {
    const f = crearBancardFalso();
    const b = B.crearBancard(CONFIG, f.transporte);
    await b.singleBuy({ operacion: 1000001, importe: 370000, descripcion: 'Orden Premium', returnUrl: VUELTA, cancelUrl: VUELTA });
    f.pagar(1000001);
    const cuerpo = f.confirmacionDe(1000001);

    const v = B.verificarConfirmacion(cuerpo, PRIVADA, 370000);
    ok('una confirmación de verdad: token válido, y no es de reversa',
      [v.forma, v.operacion, v.tokenValido, v.deReversa], ['confirmacion', '1000001', true, false]);
    ok('devuelve la respuesta tal como llegó (la sanea la base al guardarla)',
      [v.respuesta.response, v.respuesta.response_code, v.respuesta.amount, B.esAprobada(v.respuesta)],
      ['S', '00', '370000.00', true]);
    ok('el pedido llega como cadena; como número también se entiende',
      B.verificarConfirmacion({ operation: { ...cuerpo.operation, shop_process_id: 1000001 } }, PRIVADA, 370000).tokenValido, true);

    // El amount «tal como llegó»: Bancard lo escribe de varias formas.
    const raro = { operation: { ...cuerpo.operation, amount: '370000.0', token: md5(PRIVADA + '1000001' + 'confirm' + '370000.0' + 'PYG') } };
    ok('válida también si Bancard firmó con el importe como lo escribió ("370000.0")',
      B.verificarConfirmacion(raro, PRIVADA, 370000).tokenValido, true);
    const numero = { operation: { ...cuerpo.operation, amount: 370000, token: md5(PRIVADA + '1000001' + 'confirm' + '370000' + 'PYG') } };
    ok('o como número', B.verificarConfirmacion(numero, PRIVADA, 370000).tokenValido, true);
    ok('sin saber todavía el importe guardado, vale la firma con el que llegó',
      B.verificarConfirmacion(cuerpo, PRIVADA, null).tokenValido, true);

    // Con el importe guardado, el `amount` del cuerpo puede decir cualquier
    // cosa: la firma es la del importe de la operación. Que el importe
    // recibido sea el guardado lo exige la base (bancard_confirmar).
    const otroMonto = { operation: { ...cuerpo.operation, amount: '1.00' } };
    ok('un cuerpo con otro importe y el token del importe de verdad: la firma es válida (el importe lo frena la base)',
      [B.verificarConfirmacion(otroMonto, PRIVADA, 370000).tokenValido, B.importeDe(otroMonto.operation.amount)], [true, 1]);
    ok('pero contra otra operación (otro importe guardado) ya no',
      B.verificarConfirmacion(otroMonto, PRIVADA, 250000).tokenValido, false);

    // De reversa: md5 con "0.00".
    const reversa = f.confirmacionDeReversa(1000001);
    const vr = B.verificarConfirmacion(reversa, PRIVADA, 370000);
    ok('un aviso de reversa (md5 con "0.00"): es de reversa y NO vale como pago',
      [vr.forma, vr.tokenValido, vr.deReversa], ['confirmacion', false, true]);

    // Token cambiado / inventado.
    const inventada = { operation: { ...cuerpo.operation, token: 'f'.repeat(32) } };
    ok('un token inventado: no vale',
      [B.verificarConfirmacion(inventada, PRIVADA, 370000).tokenValido, B.verificarConfirmacion(inventada, PRIVADA, 370000).deReversa],
      [false, false]);
    ok('el token de otro pedido: no vale',
      B.verificarConfirmacion({ operation: { ...cuerpo.operation, shop_process_id: '1000002' } }, PRIVADA, 370000).tokenValido, false);
    ok('con otra clave privada: no vale',
      B.verificarConfirmacion(cuerpo, 'OtraClavePrivadaInventadaQueNoEsLaBuena0', 370000).tokenValido, false);
    ok('el token en mayúsculas es el mismo token',
      B.verificarConfirmacion({ operation: { ...cuerpo.operation, token: cuerpo.operation.token.toUpperCase() } }, PRIVADA, 370000).tokenValido, true);

    // Lo que no es un pago.
    ok('cuerpo vacío, {} o sin operation → vacía (se contesta 200 y no se hace nada)',
      [B.verificarConfirmacion(null, PRIVADA, 1).forma, B.verificarConfirmacion(undefined, PRIVADA, 1).forma,
        B.verificarConfirmacion({}, PRIVADA, 1).forma, B.verificarConfirmacion({ operation: null }, PRIVADA, 1).forma,
        B.verificarConfirmacion('', PRIVADA, 1).forma, B.verificarConfirmacion([], PRIVADA, 1).forma,
        B.verificarConfirmacion({ status: 'success' }, PRIVADA, 1).forma],
      ['vacia', 'vacia', 'vacia', 'vacia', 'vacia', 'vacia', 'vacia']);
    ok('con operation pero sin pedido o sin token usables → inválida',
      [B.verificarConfirmacion({ operation: {} }, PRIVADA, 1).forma,
        B.verificarConfirmacion({ operation: { shop_process_id: '12', token: 'corto' } }, PRIVADA, 1).forma,
        B.verificarConfirmacion({ operation: { shop_process_id: 'abc', token: 'f'.repeat(32) } }, PRIVADA, 1).forma,
        B.verificarConfirmacion({ operation: { shop_process_id: '0123', token: 'f'.repeat(32) } }, PRIVADA, 1).forma,
        B.verificarConfirmacion({ operation: { shop_process_id: '1'.repeat(16), token: 'f'.repeat(32) } }, PRIVADA, 1).forma,
        B.verificarConfirmacion({ operation: { shop_process_id: { $gt: 0 }, token: 'f'.repeat(32) } }, PRIVADA, 1).forma],
      ['invalida', 'invalida', 'invalida', 'invalida', 'invalida', 'invalida']);

    // La comparación es la de tiempo constante de pagos.ts.
    const fuente = leer('src/lib/bancard.ts');
    ok('el token se compara con firmaCoincide (tiempo constante), no con ===',
      [fuente.includes("import { firmaCoincide } from './pagos';"), /firmaCoincide\(token, tokens\.confirm\(/.test(fuente),
        /token\s*===\s*tokens\./.test(fuente)], [true, true, false]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('7 · Quién ve Bancard');
  // ═══════════════════════════════════════════════════════════
  {
    const d = B.disponibleParaLaCuenta;
    const nadie = { configurado: true, entorno: 'staging', abierto: false, superadmin: false, habilitada: false, admin: true };
    ok('sin configurar no lo ve nadie, ni la administración con todo prendido',
      d({ configurado: false, entorno: null, abierto: true, superadmin: true, habilitada: true, admin: true }), false);
    ok('configurado pero con un entorno que no es ninguno: nadie',
      d({ ...nadie, entorno: 'pruebas', superadmin: true }), false);
    ok('la administración en staging: sí', d({ ...nadie, superadmin: true }), true);
    ok('una cuenta habilitada a mano en staging (la del certificador): sí', d({ ...nadie, habilitada: true }), true);
    ok('el interruptor general en staging NO cuenta', d({ ...nadie, abierto: true }), false);
    ok('el interruptor general en producción: sí', d({ ...nadie, entorno: 'produccion', abierto: true }), true);
    ok('en producción sin interruptor, un cliente cualquiera: no', d({ ...nadie, entorno: 'produccion' }), false);
    ok('en producción la administración y las cuentas habilitadas siguen viendo',
      [d({ ...nadie, entorno: 'produccion', superadmin: true }), d({ ...nadie, entorno: 'produccion', habilitada: true })],
      [true, true]);
    ok('quien no administra la cuenta (un vendedor) no lo ve nunca',
      [d({ ...nadie, admin: false, superadmin: true }), d({ ...nadie, admin: false, habilitada: true }),
        d({ ...nadie, admin: false, entorno: 'produccion', abierto: true })], [false, false, false]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('7b · El transporte HTTP/2 (revisión 03/10: por si Cloudflare bloquea el HTTP/1.1 de Node)');
  // ═══════════════════════════════════════════════════════════
  {
    const http2 = require('http2');
    const recibidos = [];
    const servidor = http2.createServer((req, res) => {
      let cuerpo = '';
      req.setEncoding('utf8');
      req.on('data', (c) => { cuerpo += c; });
      req.on('end', () => {
        recibidos.push({ metodo: req.method, ruta: req.url, tipo: req.headers['content-type'], cuerpo });
        if (req.url.endsWith('/single_buy/confirmations')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', messages: [{ key: 'PaymentNotFoundError', level: 'error', dsc: 'x' }] }));
        } else if (req.url.endsWith('/single_buy/rollback')) {
          res.writeHead(403, { 'content-type': 'text/html' });
          res.end('<!doctype html><title>Attention Required</title>');
        }
        // /single_buy: no contesta nunca.
      });
    });
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    const puerto = servidor.address().port;
    const transporte = B.crearTransporteHttp2({ origenDe: () => `http://127.0.0.1:${puerto}` });
    const b = B.crearBancard(CONFIG, transporte);

    const c = await llamar(() => b.consultar(1000001, { esperaMs: 2000 }));
    ok('la consulta viaja por HTTP/2: POST a la ruta del manual, JSON, y se lee lo que Bancard contesta',
      [c.ok, c.clave, recibidos[0]?.metodo, recibidos[0]?.ruta, recibidos[0]?.tipo],
      [false, 'PaymentNotFoundError', 'POST', '/vpos/api/0.3/single_buy/confirmations', 'application/json']);
    const enviado = JSON.parse(recibidos[0]?.cuerpo ?? '{}');
    ok('con el mismo sobre: clave pública y el token del manual', [enviado.public_key, enviado.operation?.token], [PUBLICA, md5(PRIVADA + '1000001' + 'get_confirmation')]);
    const rv = await llamar(() => b.revertir(1000001, { esperaMs: 2000 }));
    ok('un 403 en HTML por HTTP/2 también es «no_json» con su código', [rv.ok, rv.clase, rv.http], [false, 'no_json', 403]);
    const t0 = Date.now();
    const sb = await llamar(() => b.singleBuy({ operacion: 1000001, importe: 1000, descripcion: 'x', returnUrl: VUELTA, cancelUrl: VUELTA }, { esperaMs: 150 }));
    ok('si no contesta, corta a tiempo: timeout', [sb.ok, sb.clase, Date.now() - t0 < 2000], [false, 'timeout', true]);
    await Promise.race([new Promise((r) => servidor.close(r)), new Promise((r) => setTimeout(r, 1500))]);
    const red = await llamar(() => B.crearBancard(CONFIG, B.crearTransporteHttp2({ origenDe: () => `http://127.0.0.1:${puerto}` })).consultar(1000001, { esperaMs: 2000 }));
    ok('sin nadie del otro lado: red', [red.ok, red.clase], [false, 'red']);
    ok('transporteDe: «2» es el HTTP/2; lo demás (o nada), el fetch de Node',
      [typeof B.transporteDe('2'), B.transporteDe('') === B.transporteDe(undefined), B.transporteDe('2') === B.transporteDe('')], ['function', true, false]);
  }

  // ═══════════════════════════════════════════════════════════
  grupo('8 · Ningún secreto sale del cliente');
  // ═══════════════════════════════════════════════════════════
  {
    ok('en todas las llamadas de arriba el cliente no escribió NADA por la consola', dichoPorElCliente, []);

    // Lo que devolvió o lanzó. Los alias salen solo donde tienen que salir
    // (la lista de tarjetas); la clave privada y los tokens md5, nunca.
    const todo = salidas.join('\n');
    ok('se juntaron las salidas de todas las llamadas (resultados y errores lanzados)',
      [salidas.length >= 50, salidas.some((x) => x.includes('Error: Bancard:')), salidas.some((x) => x.includes('"ok":true'))], [true, true, true]);
    ok('ningún resultado ni error trae la clave privada', todo.includes(PRIVADA), false);
    ok('ni la pública', todo.includes(PUBLICA), false);
    ok('ni otra de las claves inventadas', todo.includes('OtraClavePrivadaInventadaQueNoEsLaBuena0'), false);
    ok('ni el alias con el que se cobró', todo.includes(ALIAS), false);
    ok('ni el cuerpo de un pedido', /public_key|alias_token|"operation"/.test(todo), false);
    // Los tokens md5 que el cliente mandó (los guardó el Bancard de mentira).
    const tokensMandados = ['affb8167a822d4a5f637dffcfea5b75a', 'fd4194d5e0f01bd39f7e90919ee087b8',
      'c9cea935fb32456a8fff3f43e5ae3675', 'fb49b74a0ad58645bcd15f92ff8351fb', '6aa366d62260fb403aa26fc17cde4bfa'];
    ok('ni un token md5 de un pedido', tokensMandados.filter((t) => todo.includes(t)), []);

    // Los errores de programación dicen qué está mal sin repetir el valor.
    const f = crearBancardFalso();
    const b = B.crearBancard(CONFIG, f.transporte);
    let mensaje = '';
    try { await b.cobrar({ operacion: 1, importe: 1000, descripcion: 'x'.repeat(30), alias: 'ALIAS-QUE-NO-SE-DICE', returnUrl: VUELTA }); } catch (e) { mensaje = e.message + e.stack; }
    ok('un error de programación no repite el alias ni la clave',
      [mensaje.length > 0, mensaje.includes('ALIAS-QUE-NO-SE-DICE'), mensaje.includes(PRIVADA)], [true, false, false]);

    // La fuente: ni una llamada a la consola, ni un JSON.stringify de un
    // error, ni la palabra que haría que Bancard no marque la lista.
    const fuente = leer('src/lib/bancard.ts');
    ok('la fuente de bancard.ts no nombra a la consola', fuente.includes('console.'), false);
    const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('ni manda test_client en ningún lado', sinComentarios.includes('test_client'), false);
    ok('ni lee variables de entorno: las claves se las pasan', fuente.includes('process.env'), false);
    ok('no importa Next, Supabase ni los textos: solo node:crypto, node:http2 y ./pagos',
      [...fuente.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]).sort(), ['./pagos', 'node:crypto', 'node:http2']);
    // Una clave de Bancard son 32 o 40 letras y números seguidos.
    ok('y no hay nada con forma de clave escrito en la fuente',
      (sinComentarios.match(/[a-zA-Z0-9]{32,}/g) ?? []).filter((x) => /[0-9]/.test(x) && /[a-zA-Z]/.test(x)), []);

  }

  console.log('\n' + '═'.repeat(62));
  if (fallos > 0) {
    console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL CLIENTE DE BANCARD FALLARON`);
    process.exit(1);
  }
  console.log(`>>> ${corridas} COMPROBACIONES DEL CLIENTE DE BANCARD PASARON`);
  process.exit(0);
})().catch((e) => {
  console.error('\nLa prueba se rompió:', e);
  process.exit(1);
});
