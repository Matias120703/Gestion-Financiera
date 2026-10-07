/**
 * UN BANCARD DE MENTIRA.
 *
 * Las pruebas no llaman nunca a los servidores de Bancard (ni a staging): no
 * hay claves, y un cobro de prueba que sale mal no se arregla con un test.
 * Esto hace de vPOS 2.0 en memoria, escrito contra el mismo manual que el
 * cliente («eCommerce Bancard compra simple versión 1.23») pero SIN usar el
 * cliente: el md5 de cada pedido se vuelve a calcular acá, con `crypto` y la
 * fórmula del manual. Si el cliente firma mal, este Bancard contesta
 * `InvalidTokenError`, igual que el de verdad.
 *
 * Sirve como `Transporte` de `crearBancard` (src/lib/bancard.ts):
 *
 *   const falso = crearBancardFalso({ clavePublica, clavePrivada, entorno });
 *   const bancard = crearBancard(config, falso.transporte);
 *
 * Y deja:
 *   · mirar cada pedido que recibió (`falso.pedidos`);
 *   · hacer de la persona que paga en el formulario (`pagar`, `rechazar`) o
 *     que carga su tarjeta (`registrarTarjeta`);
 *   · armar lo que Bancard mandaría a la URL de confirmación
 *     (`confirmacionDe`);
 *   · decidir qué pasa con el próximo cobro con tarjeta guardada
 *     (`proximoCobro`);
 *   · programar la respuesta de un pedido (`programar`): un JSON, un texto
 *     que no es JSON, un corte de red, o colgarse hasta que venza la espera.
 *
 * LAS CLAVES SON INVENTADAS. Acá no va ninguna clave ni tarjeta de verdad.
 */
const crypto = require('crypto');

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

const HOSTS = {
  produccion: 'https://vpos.infonet.com.py',
  staging: 'https://vpos.infonet.com.py:8888',
};

/** Las claves de todas las pruebas: inventadas, con la forma de las de verdad. */
const CLAVES_DE_PRUEBA = {
  clavePublica: 'ClavePublicaInventadaPruebas0001',
  clavePrivada: 'ClavePrivadaInventadaParaPruebas00000001',
};

function crearBancardFalso({
  clavePublica = CLAVES_DE_PRUEBA.clavePublica,
  clavePrivada = CLAVES_DE_PRUEBA.clavePrivada,
  entorno = 'staging',
} = {}) {
  const base = HOSTS[entorno] + '/vpos/api/0.3';
  /** Todo lo que llegó, en orden. */
  const pedidos = [];
  /** shop_process_id → la compra. */
  const compras = new Map();
  /** user_id → Map(card_id → tarjeta). */
  const usuarios = new Map();
  /** process_id de catastro → { cardId, userId }. */
  const catastros = new Map();
  /** alias_token vivo → { userId, cardId }. Vale para una sola operación. */
  const alias = new Map();
  /** Respuestas programadas: [{ ruta, respuesta, veces }]. */
  const programadas = [];
  /** Qué hacer con los próximos cobros con tarjeta guardada. */
  const cobros = [];
  let serie = 0;

  const proceso = () => `pf*${String(++serie).padStart(4, '0')}${crypto.randomBytes(6).toString('hex')}`.slice(0, 20);
  const json = (cuerpo, status = 200) => ({ status, texto: JSON.stringify(cuerpo) });
  const error = (key, dsc = key, status = 200) =>
    json({ status: 'error', messages: [{ key, level: 'error', dsc }] }, status);

  /** El objeto que Bancard manda como `operation` / `confirmation`. */
  function resultadoDe(id, compra, { conToken = true } = {}) {
    const aprobada = compra.estado === 'pagada';
    return {
      ...(conToken ? { token: md5(clavePrivada + id + 'confirm' + compra.amount + 'PYG') } : {}),
      shop_process_id: String(id),
      response: aprobada ? 'S' : 'N',
      response_details: aprobada ? 'Procesado Satisfactoriamente' : 'No procesado',
      extended_response_description: aprobada ? null : 'RECHAZO DEL EMISOR',
      currency: 'PYG',
      amount: compra.amountConfirmado ?? compra.amount,
      authorization_number: aprobada ? '123456' : null,
      ticket_number: '2117960079',
      response_code: aprobada ? '00' : (compra.codigo ?? '05'),
      response_description: aprobada ? 'Transaccion aprobada' : (compra.descripcion ?? 'NO APROBADO'),
      security_information: {
        customer_ip: '190.128.0.1',
        card_source: 'L',
        card_country: 'PARAGUAY',
        version: '0.3',
        risk_index: '0',
      },
    };
  }

  function nuevoAlias(userId, cardId) {
    const valor = 'alias' + crypto.randomBytes(18).toString('hex');
    alias.set(valor, { userId, cardId });
    return valor;
  }

  function atender(metodo, ruta, cuerpo) {
    if (typeof cuerpo !== 'object' || cuerpo === null) return error('InvalidJsonError');
    if (cuerpo.public_key !== clavePublica) return error('InvalidPublicKeyError', 'Invalid Public key');
    const op = cuerpo.operation;
    if (typeof op !== 'object' || op === null) return error('InvalidOperationError');

    // ---- single_buy
    if (metodo === 'POST' && ruta === '/single_buy') {
      if (!Number.isInteger(op.shop_process_id)) return error('InvalidOperationError');
      if (typeof op.amount !== 'string' || !/^[0-9]+[.][0-9]{2}$/.test(op.amount)) return error('InvalidOperationError');
      if (Number(op.amount) <= 0) return error('InvalidAmountError', 'Amount attribute must be greater than zero.');
      if (op.currency !== 'PYG') return error('InvalidOperationError');
      if (typeof op.description !== 'string' || op.description.length > 20) return error('InvalidOperationError');
      if (typeof op.return_url !== 'string' || op.return_url.length > 255) return error('InvalidOperationError');
      if (op.token !== md5(clavePrivada + op.shop_process_id + op.amount + op.currency)) {
        return error('InvalidTokenError', 'Invalid token');
      }
      if (compras.has(op.shop_process_id)) return error('InvalidOperationError', 'Duplicated shop_process_id');
      const processId = proceso();
      compras.set(op.shop_process_id, { amount: op.amount, estado: 'pendiente', processId, medio: 'formulario' });
      return json({ status: 'success', process_id: processId });
    }

    // ---- consulta
    if (metodo === 'POST' && ruta === '/single_buy/confirmations') {
      if (typeof op.shop_process_id !== 'string') return error('InvalidOperationError');
      if (op.token !== md5(clavePrivada + op.shop_process_id + 'get_confirmation')) {
        return error('InvalidTokenError', 'Invalid token');
      }
      const id = Number(op.shop_process_id);
      const compra = compras.get(id);
      if (!compra) return error('BuyNotFoundError', 'Buy Not Found');
      if (compra.estado === 'revertida') return error('AlreadyRollbackedError');
      if (compra.estado === 'pendiente') return error('PaymentNotFoundError');
      return json({ status: 'success', confirmation: resultadoDe(id, compra) });
    }

    // ---- reversa
    if (metodo === 'POST' && ruta === '/single_buy/rollback') {
      if (typeof op.shop_process_id !== 'string') return error('InvalidOperationError');
      if (op.token !== md5(clavePrivada + op.shop_process_id + 'rollback' + '0.00')) {
        return error('InvalidTokenError', 'Invalid token');
      }
      const id = Number(op.shop_process_id);
      const compra = compras.get(id);
      if (!compra) return error('BuyNotFoundError', 'Buy Not Found');
      if (compra.estado === 'revertida') return error('AlreadyRollbackedError');
      if (compra.cuponada) return error('TransactionAlreadyConfirmed');
      if (compra.estado !== 'pagada') {
        // «El cliente no pagó este pedido»: el pedido igual queda cerrado.
        compra.cerrada = true;
        return error('PaymentNotFoundError');
      }
      compra.estado = 'revertida';
      return json({ status: 'success', messages: [{ key: 'RollbackSuccessful', level: 'info', dsc: 'Rollback correcto.' }] });
    }

    // ---- pedir el catastro
    if (metodo === 'POST' && ruta === '/cards/new') {
      if (!Number.isInteger(op.card_id) || !Number.isInteger(op.user_id)) return error('InvalidOperationError');
      if (typeof op.user_cell_phone !== 'string' || !op.user_cell_phone) return error('InvalidOperationError');
      if (typeof op.user_mail !== 'string' || !op.user_mail) return error('InvalidOperationError');
      if (op.token !== md5(clavePrivada + op.card_id + op.user_id + 'request_new_card')) {
        return error('InvalidTokenError', 'Invalid token');
      }
      const processId = proceso();
      catastros.set(processId, { cardId: op.card_id, userId: op.user_id });
      return json({ status: 'success', process_id: processId });
    }

    // ---- tarjetas del usuario / borrar tarjeta
    const m = /^[/]users[/]([0-9]+)[/]cards$/.exec(ruta);
    if (m && metodo === 'POST') {
      const userId = Number(m[1]);
      if (op.token !== md5(clavePrivada + userId + 'request_user_cards')) {
        return error('InvalidTokenError', 'Invalid token');
      }
      const tarjetas = [...(usuarios.get(userId) ?? new Map()).values()];
      return json({
        status: 'success',
        cards: tarjetas.map((t) => ({
          alias_token: nuevoAlias(userId, t.cardId),
          card_masked_number: t.enmascarado,
          expiration_date: t.vencimiento,
          card_brand: t.marca,
          card_id: t.cardId,
          card_type: t.tipo,
        })),
      });
    }
    if (m && metodo === 'DELETE') {
      const userId = Number(m[1]);
      if (typeof op.alias_token !== 'string') return error('InvalidOperationError');
      if (op.token !== md5(clavePrivada + 'delete_card' + userId + op.alias_token)) {
        return error('InvalidTokenError', 'Invalid token');
      }
      const dueno = alias.get(op.alias_token);
      alias.delete(op.alias_token);
      if (!dueno || dueno.userId !== userId) return error('CardAliasTokenExpiredError');
      const suyas = usuarios.get(userId);
      if (!suyas || !suyas.has(dueno.cardId)) return error('CardNotFoundError');
      suyas.delete(dueno.cardId);
      return json({ status: 'success' });
    }

    // ---- cobro con tarjeta guardada
    if (metodo === 'POST' && ruta === '/charge') {
      if (!Number.isInteger(op.shop_process_id)) return error('InvalidOperationError');
      if (typeof op.amount !== 'string' || !/^[0-9]+[.][0-9]{2}$/.test(op.amount)) return error('InvalidOperationError');
      if (op.number_of_payments !== 1) return error('InvalidOperationError');
      if (typeof op.alias_token !== 'string') return error('InvalidOperationError');
      if (typeof op.description !== 'string' || op.description.length > 20) return error('InvalidOperationError');
      if (op.token !== md5(clavePrivada + op.shop_process_id + 'charge' + op.amount + op.currency + op.alias_token)) {
        return error('InvalidTokenError', 'Invalid token');
      }
      const dueno = alias.get(op.alias_token);
      alias.delete(op.alias_token);
      if (!dueno) return error('CardAliasTokenExpiredError', 'The card alias token has expired.');
      if (compras.has(op.shop_process_id)) return error('InvalidOperationError', 'Duplicated shop_process_id');

      const plan = cobros.shift() ?? { tipo: 'aprobar' };
      const compra = { amount: op.amount, estado: 'pendiente', medio: 'token', userId: dueno.userId, cardId: dueno.cardId };
      compras.set(op.shop_process_id, compra);

      if (plan.tipo === '3ds') {
        compra.processId = proceso();
        return json({ operation: {
          token: null, process_id: compra.processId, shop_process_id: null, response: null,
          response_details: null, extended_response_description: null, currency: null, amount: null,
          authorization_number: null, ticket_number: null, response_code: null, response_description: null,
          security_information: { customer_ip: null, card_source: null, card_country: null, version: null, risk_index: null },
        } });
      }
      if (plan.tipo === 'rechazar') {
        compra.estado = 'rechazada';
        compra.codigo = plan.codigo ?? '51';
        compra.descripcion = plan.descripcion ?? 'NO APROBADA-INSUF.DE FONDOS';
      } else {
        compra.estado = 'pagada';
      }
      const operation = { ...resultadoDe(op.shop_process_id, compra), process_id: null };
      // El ejemplo del manual trae el importe del cobro como NÚMERO.
      operation.amount = Number(compra.amount);
      return json({ operation });
    }

    return error('InvalidOperationError', 'Ruta desconocida', 404);
  }

  /** El `Transporte` de crearBancard. */
  async function transporte(url, init) {
    let cuerpo = null;
    try { cuerpo = JSON.parse(init.body); } catch { /* lo dirá atender */ }
    const ruta = url.startsWith(base) ? url.slice(base.length) : url;
    const pedido = { url, ruta, method: init.method, headers: init.headers, crudo: init.body, cuerpo, enBase: url.startsWith(base) };
    pedidos.push(pedido);

    const i = programadas.findIndex((p) => p.ruta === null || p.ruta === ruta || (p.ruta instanceof RegExp && p.ruta.test(ruta)));
    if (i !== -1) {
      const p = programadas[i];
      if (--p.veces <= 0) programadas.splice(i, 1);
      const r = typeof p.respuesta === 'function' ? await p.respuesta(pedido, init) : p.respuesta;
      if (r === 'red') throw new TypeError('fetch failed');
      if (r === 'colgar') {
        // No contesta nunca: solo termina si alguien corta la espera.
        return new Promise((_, rechazar) => {
          init.signal.addEventListener('abort', () => {
            const e = new Error('This operation was aborted');
            e.name = 'AbortError';
            rechazar(e);
          });
        });
      }
      if (r === 'atender') return atender(init.method, ruta, cuerpo);
      if (r && typeof r === 'object' && 'json' in r) return json(r.json, r.status ?? 200);
      return r;
    }

    if (!pedido.enBase) return { status: 404, texto: '<html>Not found</html>' };
    return atender(init.method, ruta, cuerpo);
  }

  return {
    transporte,
    pedidos,
    compras,
    base,
    entorno,
    md5,

    /** El último pedido que llegó. */
    ultimo: () => pedidos[pedidos.length - 1],

    /**
     * La respuesta del próximo pedido a esa ruta (o a cualquiera, con null):
     * `{ status, texto }`, `{ json, status? }`, 'red', 'colgar', 'atender' o
     * una función que devuelve una de esas.
     */
    programar(ruta, respuesta, veces = 1) {
      programadas.push({ ruta, respuesta, veces });
    },

    /** La persona paga en el formulario (tarjeta, QR…): la compra queda aprobada. */
    pagar(id, { amount } = {}) {
      const compra = compras.get(Number(id));
      if (!compra) throw new Error(`El Bancard de mentira no conoce el pedido ${id}`);
      compra.estado = 'pagada';
      if (amount !== undefined) compra.amountConfirmado = amount;
      return compra;
    },

    /** El banco rechaza el pago del formulario. */
    rechazar(id, codigo = '05', descripcion = 'NO APROBADO') {
      const compra = compras.get(Number(id));
      if (!compra) throw new Error(`El Bancard de mentira no conoce el pedido ${id}`);
      compra.estado = 'rechazada';
      compra.codigo = codigo;
      compra.descripcion = descripcion;
      return compra;
    },

    /** Pasó el día: la reversa ya no sale (TransactionAlreadyConfirmed). */
    cuponar(id) {
      const compra = compras.get(Number(id));
      if (compra) compra.cuponada = true;
    },

    /** La persona termina el formulario de catastro: Bancard ya tiene la tarjeta. */
    registrarTarjeta(userId, cardId, datos = {}) {
      if (!usuarios.has(userId)) usuarios.set(userId, new Map());
      usuarios.get(userId).set(cardId, {
        cardId,
        // Enmascarado inventado: ninguna tarjeta de verdad ni de prueba.
        enmascarado: datos.enmascarado ?? '4000********0016',
        vencimiento: datos.vencimiento ?? '12/30',
        marca: datos.marca ?? 'Visa',
        tipo: datos.tipo ?? 'credit',
      });
    },

    /** Lo mismo, a partir del process_id que devolvió cards/new. */
    completarCatastro(processId, datos = {}) {
      const c = catastros.get(processId);
      if (!c) throw new Error('El Bancard de mentira no conoce ese catastro');
      this.registrarTarjeta(c.userId, c.cardId, datos);
      return c;
    },

    tarjetasDe: (userId) => [...(usuarios.get(userId) ?? new Map()).values()],

    /** Qué pasa con el próximo cobro: { tipo: 'aprobar' | 'rechazar' | '3ds', codigo?, descripcion? }. */
    proximoCobro(plan) {
      cobros.push(plan);
    },

    /**
     * El cuerpo que Bancard manda por POST a la URL de confirmación del
     * comercio para ese pedido, con su md5. `cambios` pisa campos (para
     * probar un importe cambiado o un token inventado).
     */
    confirmacionDe(id, cambios = {}) {
      const compra = compras.get(Number(id));
      if (!compra) throw new Error(`El Bancard de mentira no conoce el pedido ${id}`);
      return { operation: { ...resultadoDe(Number(id), compra), ...cambios } };
    },

    /** El aviso de una reversa: el md5 se arma con "0.00" (manual, «Token»). */
    confirmacionDeReversa(id) {
      const compra = compras.get(Number(id));
      if (!compra) throw new Error(`El Bancard de mentira no conoce el pedido ${id}`);
      return { operation: {
        ...resultadoDe(Number(id), compra, { conToken: false }),
        token: md5(clavePrivada + id + 'confirm' + '0.00' + 'PYG'),
      } };
    },

    /** Lo que quedó escrito de todos los pedidos, para buscar lo que no tiene que estar. */
    todoLoPedido: () => pedidos.map((p) => p.url + ' ' + p.crudo).join('\n'),
  };
}

module.exports = { crearBancardFalso, CLAVES_DE_PRUEBA, md5 };
