import type { CapturaInterpretada, DeudaInterpretada, Producto } from './tipos';

/**
 * El prompt y el esquema con los que se interpreta una captura.
 *
 * Viven acá y no en la ruta por una razón concreta: la ruta importa
 * next/server y no se puede ejecutar suelta, y el prompt es exactamente la
 * pieza que hay que poder probar. Fue una regla mal escrita —no un error de
 * código— la que hizo que «debo cinco millones de la tarjeta» se guardara
 * como otro ingreso.
 *
 * Este archivo NO importa nada del servidor a propósito.
 */

/** Lo mínimo de una deuda que el modelo necesita para reconocerla. */
/** Una categoría de gasto con ejemplos de qué va adentro. Ver migración 021. */
export type CategoriaSugerida = { nombre: string; pistas?: string };

export type DeudaConocida = { id: string; nombre: string; acreedor: string; saldo: number };

/**
 * Algo que se repite todos los meses: el sueldo, el wifi, la línea del
 * celular.
 *
 * Se le pasa a la IA por el mismo motivo que las deudas: no para que adivine,
 * sino para que no tenga que hacerlo. Alguien con el sueldo cargado dice «ya
 * cobré mi sueldo» y no repite el monto — porque ya se lo dijo al sistema una
 * vez, y volver a pedírselo es la clase de cosa que hace que se deje de usar
 * la captura por voz.
 */
export type FijoConocido = {
  clase: 'ingreso' | 'gasto';
  nombre: string;
  importe: number;
  categoria?: string;
};

/**
 * Alguien que le debe plata a esta cuenta, con lo que debe (054). Para
 * reconocer «Lucas me pagó cien mil» y saber CUÁL Lucas.
 */
export type DeudorConocido = { id: string; nombre: string; saldo: number };

/**
 * Una campaña abierta (100): «Norte · Soja · 50 ha». Para reconocer
 * «gasté dos millones en semilla para el Norte» y saber CUÁL campaña, igual
 * que las deudas sirven para saber cuál tarjeta. Ganadería usa lo mismo: sus
 * lotes son campañas sin cultivo.
 */
export type CampanaConocida = {
  id: string;
  nombre: string;
  cultivo: string;
  campana: string;
  hectareas: number | null;
};

/** Los tipos en los que tiene sentido decir de qué campaña es la plata. */
export const TIPOS_CON_CAMPANA = ['gasto', 'ingreso', 'venta', 'deuda'] as const;

/**
 * Lo que la captura suma cuando la cuenta tiene campañas. Vive acá y no en
 * `tipos.ts` para que la ruta y la pantalla lo compartan sin tocar el tipo
 * de siempre: todo es opcional, así una captura sin campañas sigue siendo
 * exactamente la de antes.
 */
export type DeudaDeVoz = DeudaInterpretada & {
  /** La categoría del gasto que nace al pagarla («Agroquímicos»). '' o null = «Deudas». */
  categoria?: string | null;
};

export type CapturaDeVoz = Omit<CapturaInterpretada, 'deuda'> & {
  deuda?: DeudaDeVoz | null;
  /** La campaña, si se la reconoció. Siempre un id REAL: el servidor lo sanea. */
  lote_id?: string | null;
  /** Cómo llamó a la campaña cuando no se la encontró («el Sur»). */
  lote_nombrado?: string | null;
  /**
   * Nombró una campaña y no se supo cuál: la pantalla pregunta con chips
   * ANTES de guardar. Guardarlo sin campaña sería perderle el gasto a la
   * campaña sin que nadie se entere.
   */
  lote_dudoso?: boolean;
  /** Las campañas abiertas, para los chips. Solo si la cuenta tiene campañas. */
  lotes?: CampanaConocida[];
};

/** Esquema estricto: obliga al modelo a devolver exactamente esta forma. */
export const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'fecha', 'descripcion', 'categoria', 'monto', 'metodo_pago', 'contraparte', 'cliente_id', 'lote_id', 'lote_nombrado', 'items', 'deuda', 'turno', 'producto', 'ficha', 'confianza', 'aviso'],
  properties: {
    /**
     * `deuda` y `pago_deuda` se agregaron porque, sin ellos, decir «debo
     * cinco millones al banco» terminaba cargado como OTRO INGRESO: el
     * modelo empujaba la frase al tipo que más se le parecía de los tres que
     * conocía, y sumaba cinco millones a las ganancias del negocio.
     *
     * Un tipo que falta no hace que el modelo diga «no sé»: hace que elija
     * mal con total seguridad.
     *
     * Y volvió a pasar al revés con `fiado` y `cobro_fiado`. «Lucas me debe
     * 300 mil» se guardó como una deuda del dueño con Lucas, porque «debe»
     * era lo más parecido que el modelo tenía. Y «Lucas me pagó» caía en
     * ingreso, sumando otra vez a la ganancia una venta que ya había contado.
     */
    tipo: {
      type: 'string',
      enum: ['venta', 'gasto', 'ingreso', 'deuda', 'pago_deuda', 'fiado', 'cobro_fiado', 'turno', 'producto', 'cliente'],
    },
    fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    descripcion: { type: 'string' },
    categoria: { type: 'string' },
    monto: { type: 'number' },
    metodo_pago: { type: 'string', enum: ['efectivo', 'transferencia', 'tarjeta', 'credito', 'otro'] },
    contraparte: { type: ['string', 'null'] },
    /** Para `cobro_fiado` (y `fiado`, si ya debía): el id EXACTO de la lista TE DEBEN. */
    cliente_id: { type: ['string', 'null'] },
    /**
     * En gasto, ingreso, venta y deuda: el id EXACTO de la lista CAMPAÑAS
     * ABIERTAS. Sin campañas, o en cualquier otro tipo, null. Se sanea
     * contra los ids reales igual que `deuda_id`.
     */
    lote_id: { type: ['string', 'null'] },
    /** Cómo nombró una campaña que NO está en la lista. Si no nombró ninguna, null. */
    lote_nombrado: { type: ['string', 'null'] },
    /**
     * Lo que no es plata: un turno, algo del catálogo, un cliente nuevo. El
     * dueño pidió que la voz sirva «para todo». Cada objeto se completa solo
     * en su tipo; en los demás viaja con todo en null, porque el esquema
     * estricto exige que la clave exista siempre.
     */
    turno: {
      type: 'object',
      additionalProperties: false,
      required: ['fecha', 'hora', 'servicio_id', 'profesional_id', 'telefono'],
      properties: {
        fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        hora: { type: ['string', 'null'], description: 'HH:MM, 24 horas' },
        servicio_id: { type: ['string', 'null'] },
        profesional_id: { type: ['string', 'null'] },
        telefono: { type: ['string', 'null'] },
      },
    },
    producto: {
      type: 'object',
      additionalProperties: false,
      required: ['accion', 'producto_id', 'nombre', 'es_servicio', 'precio', 'costo', 'cantidad', 'categoria'],
      properties: {
        accion: { type: ['string', 'null'], enum: ['crear', 'precio', 'stock', null] },
        producto_id: { type: ['string', 'null'] },
        nombre: { type: ['string', 'null'] },
        es_servicio: { type: ['boolean', 'null'] },
        precio: { type: ['number', 'null'] },
        costo: { type: ['number', 'null'] },
        cantidad: { type: ['number', 'null'] },
        categoria: { type: ['string', 'null'] },
      },
    },
    ficha: {
      type: 'object',
      additionalProperties: false,
      required: ['telefono', 'notas'],
      properties: {
        telefono: { type: ['string', 'null'] },
        notas: { type: ['string', 'null'] },
      },
    },
    confianza: { type: 'number' },
    aviso: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'cantidad', 'precio_unitario', 'costo_unitario', 'producto_id'],
        properties: {
          nombre: { type: 'string' },
          cantidad: { type: 'number' },
          precio_unitario: { type: 'number' },
          costo_unitario: { type: ['number', 'null'] },
          producto_id: { type: ['string', 'null'] },
        },
      },
    },
    /**
     * Solo se completa cuando `tipo` es `deuda` o `pago_deuda`. Para los
     * otros tipos viaja con todo en null; el esquema estricto de OpenAI
     * exige que la clave exista siempre.
     */
    deuda: {
      type: 'object',
      additionalProperties: false,
      required: ['clase', 'acreedor', 'cuotas', 'monto_cuota', 'vence_el', 'deuda_id', 'categoria'],
      properties: {
        clase: { type: ['string', 'null'], enum: ['tarjeta', 'prestamo', 'proveedor', 'otro', null] },
        acreedor: { type: ['string', 'null'] },
        cuotas: { type: ['number', 'null'] },
        monto_cuota: { type: ['number', 'null'] },
        vence_el: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        /** Para `pago_deuda`: cuál de las deudas ya cargadas se está pagando. */
        deuda_id: { type: ['string', 'null'] },
        /**
         * Para `deuda`: qué se compró debiendo («Agroquímicos»), de la lista
         * de categorías de gasto. Es la categoría del gasto que nace cuando
         * se paga (100); sin ella nace como «Deudas» y la campaña no sabe
         * en qué se le fue la plata.
         */
        categoria: { type: ['string', 'null'] },
      },
    },
  },
} as const;

export function instrucciones(
  hoy: string,
  moneda: string,
  catalogo: Producto[],
  deudas: DeudaConocida[] = [],
  /**
   * Una cuenta personal no vende. Sin esto, «cobré mi sueldo» se parece
   * bastante a una venta y el modelo la elegiría — cargando un movimiento
   * que espera productos y mueve stock en una cuenta que no tiene ni una
   * cosa ni la otra.
   */
  esPersonal = false,
  /**
   * Las categorías de gasto de este rubro, que salen de la base
   * (`categorias_de_rubro`). Sugerir «Publicidad» a un ganadero es tan inútil
   * como sugerirle «Sanidad» a una perfumería: la persona termina metiendo
   * el gasto en el casillero equivocado, y después los reportes mienten.
   */
  categorias: CategoriaSugerida[] = [],
  /**
   * Lo que se repite todos los meses, con su monto. Ver `FijoConocido`.
   */
  fijos: FijoConocido[] = [],
  /** En qué casilleros puede caer lo que ENTRA. Ver `listaIngresos`. */
  ingresos: CategoriaSugerida[] = [],
  /** Quién le debe plata a esta cuenta (054). Ver `DeudorConocido`. */
  deudores: DeudorConocido[] = [],
  /**
   * Lo que no es plata y existe en esta cuenta (turno, producto, cliente), y
   * el bloque de turnos ya armado (turno-voz.ts). Viene de afuera porque
   * depende de la agenda y del rubro de cada negocio.
   */
  extras: {
    tipos?: string[];
    bloqueTurnos?: string;
    idioma?: string;
    /** Las campañas abiertas (100). Solo en una cuenta que tiene «/lotes». */
    campanas?: CampanaConocida[];
  } = {},
) {
  const tipos = new Set(extras.tipos ?? []);
  const campanas = extras.campanas ?? [];
  const conTurnos = tipos.has('turno') && !!extras.bloqueTurnos;

  // En qué idioma se escribe lo que la persona va a LEER: el aviso y la
  // descripción. Las categorías no: son valores de la base y tienen que
  // volver escritas tal cual están en la lista, o el gasto cae en un
  // casillero nuevo que nadie creó.
  const enPortugues = extras.idioma === 'pt';
  const enSuIdioma = enPortugues ? 'en portugués de Brasil' : 'en español rioplatense';
  const bloqueIdioma = enPortugues ? `

IDIOMA
   La persona usa Orden en portugués de Brasil. Puede hablar en portugués, en español o mezclando los dos: entendé las tres cosas igual.
   - "descripcion" y "aviso" van en portugués de Brasil.
   - Las categorías se devuelven EXACTAMENTE como están escritas en la lista, aunque estén en español: son valores del sistema, no texto para leer.
   - "mil" y "milhão/milhões" son escalas igual que en español: "150 mil" es 150000, "dois milhões" es 2000000.` : '';

  // Los tipos que no son plata, en la lista de tipos. Solo los que existen
  // en esta cuenta: un tipo disponible es un tipo que el modelo va a usar.
  const tiposAccion = [
    conTurnos ? '   - "turno": anotar un turno a futuro para alguien (ver TURNOS). No es una venta: todavía no se cobró nada.' : '',
    tipos.has('producto') ? '   - "producto": agregar algo al catálogo, o cambiarle el precio o el stock (ver PRODUCTOS). No entra ni sale plata.' : '',
    tipos.has('cliente') ? '   - "cliente": anotar un cliente nuevo, sin plata de por medio (ver CLIENTES).' : '',
  ].filter(Boolean).join('\n');

  /**
   * Lo que no es plata. El dueño pidió que la voz sirva «para todo», y cada
   * cosa que se suma tiene que decirle al modelo también cuándo NO es ella:
   * sin «si pagó la mercadería es un gasto», «entraron diez shampoos» y
   * «compré diez shampoos» caerían en el mismo lugar.
   */
  const bloqueAcciones = [
    conTurnos ? extras.bloqueTurnos : '',
    tipos.has('producto') ? `PRODUCTOS — "producto" es agregar algo al catálogo, o cambiarle el precio o el stock. No entra ni sale plata: NO es una venta ni un gasto.
   - "agregá el shampoo, me cuesta 20 mil y lo vendo a 35"      → producto, accion "crear"
   - "agregá el servicio barba, 30 mil"                         → producto, accion "crear", es_servicio true
   - "subile el precio al corte a 60 mil"                       → producto, accion "precio"
   - "entraron 10 shampoos" / "me llegaron 10 shampoos"         → producto, accion "stock"
   Si PAGÓ la mercadería ("compré 10 shampoos a 20 mil"), es un GASTO, no un producto.

   En "producto":
   - "producto.accion": "crear", "precio" o "stock".
   - "producto.producto_id": para "precio" y "stock", el id EXACTO del CATÁLOGO de arriba. Para "crear", null.
   - "producto.nombre": como lo dicen.
   - "producto.es_servicio": true si es algo que se hace (un corte, una barba, una sesión); false si es algo que se compra y se revende.
   - "producto.precio": a cuánto se vende. "producto.costo": cuánto le cuesta, solo en productos. Si no lo dicen, null.
   - "producto.cantidad": al crear, cuántos tiene; en "stock", cuántos entraron. Si no lo dicen, null.
   - "producto.categoria": solo si la dice. Si no, null.
   - "descripcion": qué se hizo, corto ("Nuevo: Shampoo").` : '',
    tipos.has('cliente') ? `CLIENTES — "cliente" es anotar un cliente nuevo, sin plata de por medio: "agregá a Marta como clienta, su número es 0981 234 567".
   - "contraparte": el nombre.
   - "ficha.telefono": el número si lo dicen, con dígitos. Si no, null. Nunca lo inventes.
   - "ficha.notas": algo que quieran recordar de esa persona ("prefiere los martes"). Si no, null.` : '',
    tiposAccion ? 'En "turno", "producto" y "cliente": "monto" va en 0, "items" vacío y todo el objeto "deuda" en null. '
      + 'Y en cualquier tipo, los objetos "turno", "producto" y "ficha" que no son del tipo elegido van con todo en null.' : '',

    /*
     * LO QUE ESTA CUENTA NO TIENE, SE DICE. NO SE CONVIERTE EN OTRA COSA.
     *
     * Pasó de verdad: «tengo un nuevo turno mañana a las ocho, un corte para
     * Juan» se guardó como un GASTO de cero en una cuenta sin agenda. El
     * modelo no tenía «turno» entre los tipos, así que eligió el que más se
     * parecía, y el sistema lo dejó pasar.
     *
     * Un turno que se guarda como gasto no es un error de transcripción: es
     * un número inventado en las finanzas de alguien. Así que se pide el tipo
     * igual —la respuesta lo admite— y el sistema contesta que acá no hay
     * agenda, que es la verdad y encima dice dónde se activa.
     */
    !conTurnos ? `AGENDAR UN TURNO — esta cuenta NO tiene agenda.
   Si igual te piden anotar un turno, una cita, una hora o una reserva para alguien
   ("tengo un turno mañana a las ocho", "agendame a Juan el viernes", "reservale la hora a Marta"),
   devolvé tipo "turno" lo mismo, con TODO el resto en null y "monto" en 0.
   NUNCA lo conviertas en gasto, venta ni ingreso: no se cobró ni se pagó nada.` : '',
  ].filter(Boolean).join('\n\n');
  const listaDeudores = deudores.length
    ? deudores.slice(0, 60).map((d) => `- ${d.nombre} | id=${d.id} | debe=${d.saldo}`).join('\n')
    : '(nadie te debe nada)';

  /**
   * Quién le debe a quién. La otra mitad de la confusión entre deuda e
   * ingreso, y la que faltaba: «Lucas me debe 300 mil» se guardaba como una
   * deuda del dueño con Lucas, porque la regla decía que «queda debiendo»
   * era deuda y no había un tipo para lo que te deben. Va igual en las dos
   * cuentas: una persona también le presta plata a un amigo.
   */
  const reglaFiado = `
   Y la otra mitad de la misma pregunta: ¿el que debe es quien te habla, o
   es OTRO?

   Debe quien te habla → "deuda":
   - "le debo 300 mil a Lucas"                                  → deuda
   - "Lucas me fió 300 mil"                                     → deuda

   Debe OTRO → "fiado". No entró plata: se anota lo que le deben.
   - "Lucas me debe 300 mil"                                    → fiado
   - "Juan me quedó debiendo 50 mil"                            → fiado
   - "le presté 200 mil a David" / "le fié 200 mil a David"     → fiado
${esPersonal ? '' : `   Si además vendió productos ("le vendí tres yerbas fiado a Juan"), NO es
   "fiado": es una VENTA con metodo_pago "credito".
`}
   OTRO pagó lo que debía → "cobro_fiado". NO es ingreso: esa plata ya se
   contó cuando se vendió o se prestó, y sumarla otra vez la contaría dos
   veces.
   - "Lucas me pagó 100 mil de lo que me debía"                 → cobro_fiado
   - "Juan me pagó el fiado"                                    → cobro_fiado

   En "fiado" y "cobro_fiado":
   - "contraparte": el nombre de quien debe o de quien pagó.
   - "cliente_id": el id EXACTO de la lista TE DEBEN, si es alguien de ahí.
     En "cobro_fiado" casi siempre lo es; si no está, null, y decilo en
     "aviso". En cualquier otro tipo, "cliente_id" va en null.
   - "monto": lo que debe (fiado) o lo que pagó (cobro_fiado).
   - "descripcion": por qué debe, si lo dice ("Plata que le presté"). Si no, "Fiado".
   - "categoria": "Fiado". "items" va vacío y todo el objeto "deuda" va en null.`;

  // El costo NO va en el prompt: la base lo asigna sola al registrar la venta.
  // Mandarlo sería filtrarlo sin necesidad.
  const lista = catalogo.length
    ? catalogo.slice(0, 120).map((p) => `- ${p.nombre} | id=${p.id} | precio=${p.precio}`).join('\n')
    : '(el catálogo está vacío)';

  // Con las pistas, no solo el nombre: «veinte bolsas de maíz» caía en
  // «Otros» hasta que el modelo supo que el maíz de un ganadero es comida de
  // animales. Un nombre suelto no alcanza para clasificar bien.
  const listaCategorias = categorias.length
    ? categorias.map((c) => (c.pistas ? `"${c.nombre}" (${c.pistas})` : `"${c.nombre}"`)).join('\n     - ')
    : '"Mercadería", "Transporte", "Comida", "Publicidad", "Servicios", "Alquiler", "Sueldos", "Impuestos", "Otros"';

  /**
   * De dónde vino la plata.
   *
   * Para un negocio casi todo ingreso es una venta y el desglose da igual.
   * Para alguien con sueldo es la distinción más importante que existe: qué
   * parte de lo que entró es lo de todos los meses y qué parte fue de una.
   * Es la diferencia entre «gano bien» y «este mes zafé».
   */
  const listaIngresos = ingresos.length
    ? ingresos.map((c) => (c.pistas ? `"${c.nombre}" (${c.pistas})` : `"${c.nombre}"`)).join('\n     - ')
    : '"Sueldo", "Extra", "Vendí algo", "Otros ingresos"';

  const listaDeudas = deudas.length
    ? deudas.slice(0, 40).map((d) =>
        `- ${d.nombre}${d.acreedor ? ` (${d.acreedor})` : ''} | id=${d.id} | falta=${d.saldo}`).join('\n')
    : '(no hay deudas cargadas)';

  const listaFijos = fijos.length
    ? fijos.slice(0, 40).map((f) =>
        `- ${f.nombre} | ${f.clase === 'ingreso' ? 'ENTRA' : 'SALE'} ${f.importe}`
        + `${f.categoria ? ` | categoría "${f.categoria}"` : ''}`).join('\n')
    : '';

  /**
   * La regla que convierte esa lista en algo útil.
   *
   * Vale para los dos lados: «ya cobré mi sueldo» y «pagué el wifi» tienen
   * exactamente el mismo problema —la persona no repite un monto que ya
   * cargó— y exactamente la misma solución.
   */
  const bloqueFijos = fijos.length ? `
LO QUE SE REPITE TODOS LOS MESES (con su monto ya conocido):
${listaFijos}

CÓMO USAR ESA LISTA — importante:
   Si el mensaje menciona uno de esos por su nombre y NO dice un monto,
   usá el monto de la lista y poné confianza alta (0.9).
   - "ya cobré mi sueldo" / "entró mi sueldo"     → ingreso por el monto del sueldo
   - "pagué el wifi" / "ya está el internet"      → gasto por el monto del wifi
   - "cargué la línea del celular"                → gasto por el monto de la línea
   Si SÍ dice un monto, mandá el que dijo: la lista es lo habitual, no una regla.
   Si menciona uno de la lista y además dice otro monto, ganá el que dijo y
   avisá la diferencia en "aviso".
   Para un gasto de la lista, usá la categoría que dice la lista.
` : '';

  /**
   * Las campañas abiertas, con su id: «gasté dos millones en semilla para el
   * Norte» tiene que caer en el Norte, no quedar como texto en la
   * descripción y obligar a ir después a la campaña a «sumarlo» — cosa que
   * nadie hace dos veces.
   *
   * La regla de la que no nombra nada es tan importante como la otra: una
   * campaña adivinada carga el costo de la soja en el maíz, y eso no se ve
   * hasta la liquidación. Si nombra una que no existe, se deja vacío y se
   * dice cómo la llamó: la pantalla pregunta con chips antes de guardar.
   *
   * Sin campañas el bloque no existe (un título con una lista vacía le
   * sugiere al modelo que hay algo donde no hay nada), pero la regla de
   * dejar `lote_id` en null sí: la clave va siempre en la respuesta.
   */
  const listaCampanas = campanas.slice(0, 40).map((c) => {
    const nombre = c.campana ? `${c.nombre} (${c.campana})` : c.nombre;
    const cultivo = c.cultivo || '—';
    const ha = c.hectareas != null && Number(c.hectareas) > 0 ? `${Number(c.hectareas)} ha` : '—';
    return `- ${c.id} · ${nombre} · ${cultivo} · ${ha}`;
  }).join('\n');

  const bloqueCampanas = campanas.length ? `
CAMPAÑAS ABIERTAS (id · nombre · cultivo · hectáreas):
${listaCampanas}

CÓMO USAR ESA LISTA — en "gasto", "ingreso", "venta" y "deuda":
   La persona las puede llamar por el nombre del lote ("el Norte", "la Parcela 3"),
   por el cultivo ("la soja"), o con palabras del campo en los dos idiomas:
   lote, campaña, chacra, parcela, zafra, zafriña, talhão, lavoura, safra, safrinha.
   - Si el usuario nombra una campaña, poné su id en "lote_id", copiado EXACTO de la lista.
   - Si nombra una que no está, dejá lote_id vacío (null) y escribí en "lote_nombrado" cómo la llamó.
   - Si nombra solo el cultivo y hay UNA sola campaña abierta de ese cultivo, es esa.
     Si hay dos o más que coinciden (dos "Norte", dos de soja), lote_id null y en
     "lote_nombrado" lo que dijo: la persona elige.
   - Si no nombra ninguna campaña ni ningún cultivo, "lote_id" y "lote_nombrado" van en null.
     NO adivines: cargarle a una campaña el gasto de otra arruina su costo por hectárea.
   - El lote y el cultivo NO son la categoría: la categoría es QUÉ se compró o se pagó.
   - "gasté dos millones en semilla para el Norte"   → gasto, categoría "Semilla", lote_id del Norte
   - "paguei o frete da soja do talhão 3"            → gasto, categoría "Fletes", lote_id del talhão 3
   - "cargué gasoil para el Sur" (y no hay ningún Sur) → gasto, lote_id null, lote_nombrado "el Sur"
   En cualquier otro tipo, "lote_id" y "lote_nombrado" van en null.
` : `
"lote_id" y "lote_nombrado" van siempre en null.
`;

  if (esPersonal) {
    return `Sos el asistente de finanzas personales de alguien en Paraguay. Convertís lenguaje cotidiano en un movimiento financiero estructurado.

FECHA DE HOY: ${hoy}
MONEDA: ${moneda}

DEUDAS YA CARGADAS:
${listaDeudas}

TE DEBEN (gente que le debe plata, con lo que falta):
${listaDeudores}
${bloqueFijos}
ESTA ES UNA CUENTA PERSONAL, NO UN NEGOCIO.

Quien te habla no vende nada: lleva sus propias finanzas. Anota su sueldo,
lo que gasta, lo que debe y lo que le deben.

REGLAS:

1. TIPO — solo existen SEIS. "venta" NO existe acá, nunca la uses.
   - "ingreso": entró plata. El sueldo, un aguinaldo, un trabajo extra, algo
     que le devolvieron, plata que le prestaron y no tiene que devolver.
   - "gasto": salió plata. Comida, transporte, alquiler, farmacia, ropa,
     servicios, salidas.
   - "deuda": DEBE plata. No entró ni salió nada ahora: se está anotando una
     obligación.
   - "pago_deuda": está pagando una cuota o parte de una deuda YA cargada.
   - "fiado": ALGUIEN LE DEBE plata a esta persona: le prestó a un amigo, le
     vendió algo que todavía no le pagaron. No entró nada ahora.
   - "cobro_fiado": alguien que le debía le pagó o le devolvió, todo o
     parte. Si es alguien de la lista TE DEBEN, es esto aunque diga «me
     devolvió»: no es un ingreso.

   OJO con el sueldo: "cobré mi sueldo", "me pagaron", "entraron 3 millones"
   son INGRESO. Aunque suene a que le pagaron por algo, no es una venta:
   en esta cuenta no se vende.

2. DEUDA vs INGRESO — la confusión más cara.
   La pregunta que decide: ¿la plata ENTRÓ ahora, o está contando lo que DEBE?

   Son DEUDA:
   - "debo tres millones de la tarjeta"                    → deuda
   - "saqué un préstamo de diez millones en doce cuotas"   → deuda
   - "le debo un millón a mi hermano"                      → deuda

   Son PAGO_DEUDA:
   - "pagué la cuota de la tarjeta, quinientos mil"        → pago_deuda
   - "aboné un millón del préstamo"                        → pago_deuda

   Es INGRESO:
   - "cobré mi sueldo, cuatro millones"                    → ingreso
   - "me devolvieron doscientos mil"                       → ingreso

   Si la frase tiene "debo", "tengo una deuda", "saqué un préstamo" o "me
   fiaron", es DEUDA. Nunca ingreso.
${reglaFiado}

3. CAMPOS DE LA DEUDA
   Cuando el tipo es "deuda", completá el objeto "deuda":
   - clase: "tarjeta" si menciona tarjeta; "prestamo" si dice préstamo,
     financiera o banco; "proveedor" si le debe a un comercio; "otro" si no
     queda claro (por ejemplo, plata que le debe a una persona).
   - acreedor: a quién le debe, SOLO si lo dice. Si no, null. NUNCA lo saques
     de la lista de arriba: esa lista sirve para reconocer pagos de deudas que
     ya existen, no para completar una deuda nueva.
   - cuotas y monto_cuota: solo si los dice. Si no, null.
   - vence_el: solo si menciona una fecha concreta. Si no, null.
   - "monto" es el TOTAL de la deuda.
   - deuda_id: null. "deuda.categoria": null.
   - Si se parece mucho a una deuda que YA está en la lista, avisalo en
     "aviso": cargar dos veces la misma hace parecer que se debe el doble.

   Cuando el tipo es "pago_deuda":
   - deuda_id: el id EXACTO de la lista que mejor coincida. Si ninguna
     coincide con claridad, dejalo en null y explicá la duda en "aviso".
   - "monto" es lo que pagó.

   Para "gasto" e "ingreso", TODO el objeto "deuda" va en null.

4. MONTOS EN GUARANÍES — prestá mucha atención:
   - "150 mil", "150 lucas", "150k"  → 150000
   - "2 millones", "2 palos"          → 2000000
   - "1 millón y medio"               → 1500000
   - "25 mil quinientos"              → 25500
   - Nunca devuelvas separadores de miles ni símbolos: solo el número.
   ${moneda !== 'PYG' ? `- OJO: la moneda es ${moneda}, los montos chicos SÍ pueden ser literales.` : ''}

5. "items" SIEMPRE va vacío: []. Acá no hay productos. Y "turno", "producto" y "ficha" van siempre con todo en null: en una cuenta personal no hay agenda, ni catálogo, ni clientes. "lote_id" y "lote_nombrado" también van siempre en null.

   UNA SOLA EXCEPCIÓN: si te piden anotar un turno, una cita o una hora para alguien
   ("tengo un turno mañana a las ocho", "agendame a Juan el viernes"), devolvé tipo
   "turno" con todo lo demás en null y "monto" en 0. NO lo guardes como gasto: no se
   pagó nada. El sistema avisa que una cuenta personal no tiene agenda.

6. FECHA
   - Sin referencia temporal → hoy (${hoy}).
   - "ayer", "anteayer", "el lunes" → calculá la fecha real en YYYY-MM-DD.

7. CATEGORÍA — usá EXACTAMENTE una de estas listas, con esa misma escritura.
   Inventar una parecida rompe el plan de gastos: el plan se arma por
   categoría, y un gasto en una categoría que no está en la lista queda
   afuera de la cuenta que la persona hizo.

   Si es GASTO:
     - ${listaCategorias}

   Si es INGRESO:
     - ${listaIngresos}

8. CONFIANZA (0 a 1)
   - 0.9+ si el monto y el concepto están claros.
   - 0.5-0.7 si tuviste que asumir el monto o la escala.
   - Menos de 0.5 si el mensaje es confuso; explicá la duda en "aviso" con
     una frase corta ${enSuIdioma}.
   - "aviso" es null cuando todo está claro.

9. DESCRIPCIÓN
   - Corta y concreta. Ej: "Sueldo de agosto", "Supermercado".
   - En una deuda es el NOMBRE con el que la va a reconocer en la lista:
     "Tarjeta Visa", "Préstamo del banco". Sin el monto adentro.
   - Nunca inventes datos que no estén en el mensaje.${bloqueIdioma}`;
  }

  return `Sos el asistente de un negocio pequeño en Paraguay. Convertís lo que te dicen, en lenguaje cotidiano, en algo que el sistema pueda guardar: casi siempre un movimiento de plata${tiposAccion ? ', y a veces un turno, algo del catálogo o un cliente' : ''}.

FECHA DE HOY: ${hoy}
MONEDA DEL NEGOCIO: ${moneda}

CATÁLOGO DE PRODUCTOS DEL NEGOCIO:
${lista}

DEUDAS YA CARGADAS:
${listaDeudas}

TE DEBEN (clientes con plata pendiente, con lo que falta):
${listaDeudores}
${bloqueFijos}${bloqueCampanas}
REGLAS:

1. TIPO
   - "venta": entró plata por vender un producto o servicio.
   - "gasto": salió plata (compra de mercadería, combustible, comida, delivery, alquiler, publicidad).
   - "ingreso": entró plata que NO es venta de producto (aporte de capital, devolución, algo que le pagaron).
   - "deuda": la persona DEBE plata. No entró ni salió nada ahora: se está anotando una obligación.
   - "pago_deuda": está pagando una cuota o parte de una deuda que YA está cargada.
   - "fiado": ALGUIEN LE DEBE plata al negocio y no hubo venta de productos ahora: "Lucas me debe 300 mil", "le presté 200 mil a David". No entró nada.
   - "cobro_fiado": alguien que le debía al negocio le pagó, todo o parte. Si es alguien de la lista TE DEBEN, es esto y NO un ingreso, aunque diga «me pagó».
${tiposAccion ? `${tiposAccion}\n` : ''}   Si dice "compré" mercadería para revender, es un GASTO, no una venta.
${bloqueAcciones ? `\n${bloqueAcciones}\n` : ''}

1 bis. DEUDA vs INGRESO — LA CONFUSIÓN MÁS CARA
   Esto se equivocaba antes y le sumaba millones falsos a la ganancia.
   La pregunta que decide: ¿la plata ENTRÓ a la caja ahora, o la persona
   está contando lo que DEBE?

   Son DEUDA (no ingreso):
   - "tengo una deuda con el banco Atlas de cinco millones"      → deuda
   - "debo cinco millones de mi tarjeta de crédito"              → deuda
   - "le debo dos millones al proveedor"                         → deuda
   - "saqué un préstamo de diez millones en doce cuotas"         → deuda
   - "mi tarjeta tiene tres millones de saldo"                   → deuda

   Son PAGO_DEUDA:
   - "pagué la cuota de la tarjeta, quinientos mil"              → pago_deuda
   - "aboné un millón del préstamo del banco"                    → pago_deuda

   OJO: «pagar» solo NO alcanza para que sea pago_deuda. Casi todo lo que
   uno paga es un GASTO común:
   - "le pagué al peón un millón"                                → gasto
   - "pagué el flete"                                            → gasto
   - "pagué las vacunas"                                         → gasto
   - "pagué la luz"                                              → gasto

   Es pago_deuda SOLO si se refiere a una deuda de la lista de arriba, o si
   dice claramente "cuota", "tarjeta", "préstamo" o "financiera". Si no hay
   ninguna deuda cargada, es casi seguro que NO es pago_deuda.

   Es INGRESO de verdad:
   - "me devolvieron doscientos mil"                             → ingreso
   - "puse un millón de mi bolsillo en la caja"                  → ingreso

   Si la frase tiene "debo", "tengo una deuda", "saqué un préstamo" o "me
   fiaron", es DEUDA. Nunca ingreso.
${reglaFiado}

1 ter. CAMPOS DE LA DEUDA
   Cuando el tipo es "deuda", completá el objeto "deuda":
   - clase: "tarjeta" si menciona tarjeta de crédito; "prestamo" si dice
     préstamo, financiera o banco prestando; "proveedor" si le debe a quien
     le vende mercadería; "otro" si no queda claro.
   - acreedor: a quién le debe, SOLO si lo dice el mensaje ("Banco Atlas",
     "Visa", "el mayorista"). Si no lo dice, va en null.
     NUNCA lo saques de la lista DEUDAS YA CARGADAS: esa lista sirve para
     reconocer pagos de deudas que ya existen, no para completar una deuda
     nueva. Poner ahí un banco que la persona no nombró es inventarle un
     acreedor, y después no va a saber a quién le debe.
     Lo mismo vale para el nombre de la deuda.
   - cuotas y monto_cuota: solo si los dice. Si no, null.
   - vence_el: solo si menciona una fecha concreta. Si no, null.
   - "monto" es el TOTAL de la deuda.
   - deuda_id: null (es una deuda nueva).
   - "deuda.categoria": si lo que se debe es algo que se compró o un servicio que
     se contrató ("le debo los agroquímicos a Agrofértil", "debo el flete"), la
     categoría de gasto de la regla 6 que corresponda, escrita EXACTO como está
     ahí: es la categoría del gasto que va a nacer cuando la pague. Si es plata
     prestada, una tarjeta o no queda claro qué se compró, null.
   - SI lo que describe se parece mucho a una deuda que YA está en la lista
     (mismo acreedor, misma clase, monto parecido), igual devolvé "deuda",
     pero avisá en "aviso": "Ya tenés cargada <nombre>. Fijate si no es la
     misma." Cargar dos veces la misma deuda hace que parezca deber el doble,
     y eso asusta más que cualquier error de monto.

   Cuando el tipo es "pago_deuda":
   - deuda_id: el id EXACTO de la deuda de la lista de arriba que mejor
     coincida con lo que dijo. Si ninguna coincide con claridad, dejalo en
     null y explicá la duda en "aviso".
   - "monto" es lo que pagó.
   - Los demás campos de "deuda" van en null (también "deuda.categoria").

   Para "venta", "gasto" e "ingreso", TODO el objeto "deuda" va en null.

2. MONTOS EN GUARANÍES — esto es lo más importante, prestá mucha atención:
   - "150 mil", "150 lucas", "150k"  → 150000
   - "2 millones", "2 palos"          → 2000000
   - "1 millón y medio"               → 1500000
   - "25 mil quinientos"              → 25500
   - "50" a secas, hablando de guaraníes en una venta, casi seguro significa 50000. Si dudás, interpretá el valor razonable y bajá la confianza.
   - Nunca devuelvas separadores de miles ni símbolos: solo el número.
   ${moneda !== 'PYG' ? `- OJO: la moneda es ${moneda}, así que los montos chicos SÍ pueden ser literales.` : ''}

3. PRECIO UNITARIO vs TOTAL
   - "3 perfumes a 150 mil cada uno" → cantidad 3, precio_unitario 150000, monto 450000.
   - "3 perfumes por 450 mil"        → cantidad 3, precio_unitario 150000, monto 450000.
   - "monto" siempre es el TOTAL de la operación.

4. PRODUCTOS DEL CATÁLOGO
   - Si lo que menciona se parece a un producto del catálogo (aunque esté mal escrito o abreviado), poné su "producto_id" exacto y dejá costo_unitario en null: el costo lo pone la base de datos.
   - Si menciona un producto que NO está en el catálogo, dejá producto_id en null y costo_unitario en 0.
   - Si no dice el precio pero el producto está en el catálogo, usá el precio del catálogo.
   - Para gastos e ingresos, "items" va vacío: [].

5. FECHA
   - Sin referencia temporal → hoy (${hoy}).
   - "ayer", "anteayer", "el lunes" → calculá la fecha real en formato YYYY-MM-DD.

6. CATEGORÍA
   - Ventas → "Ventas".
   - Gastos → elegí una de estas, mirando lo que hay entre paréntesis:
     - ${listaCategorias}
     Si ninguna encaja de verdad, escribí una corta y clara: es mejor una
     categoría nueva que meter el gasto en el casillero equivocado.

7. CONFIANZA (0 a 1)
   - 0.9+ si el monto y el concepto están explícitos y claros.
   - 0.5-0.7 si tuviste que asumir el monto, la escala o el producto.
   - Menos de 0.5 si el mensaje es confuso. En ese caso explicá la duda en "aviso" con una frase corta y ${enSuIdioma}.
   - "aviso" es null cuando todo está claro.

8. DESCRIPCIÓN
   - Corta, concreta, ${enPortugues ? 'en portugués de Brasil' : 'en español'}. Ej: "Venta 3 perfumes Lattafa", "Combustible moto".
   - En una deuda es el NOMBRE con el que la persona la va a reconocer en la
     lista: "Tarjeta Visa", "Préstamo Banco Atlas", "Fiado del mayorista".
     No pongas el monto adentro del nombre.
   - Nunca inventes datos que no estén en el mensaje.${bloqueIdioma}`;
}

// ---------------------------------------------------------------------
// EL SANEO DE LA CAMPAÑA
//
// Vive acá y no en la ruta para poder probarlo sin servidor
// (pruebas/prompt.test.js). La regla es la de `deuda_id`: una instrucción
// se puede ignorar, esto no.
// ---------------------------------------------------------------------

/** Minúsculas, sin tildes y sin espacios de más: «Talhão 3» = «talhao 3». */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Lo que se dice antes del nombre y no es el nombre: «el Norte», «la
 * campaña Norte», «do talhão 3». Se saca para comparar, nunca para guardar.
 */
const PALABRAS_DE_ANTES = /^(?:(?:el|la|los|las|del|de|do|da|o|a|lote|campana|chacra|parcela|talhao|lavoura|safra)\s+)+/;

function nombreLimpio(texto: string): string {
  return normalizar(texto).replace(PALABRAS_DE_ANTES, '').trim();
}

/**
 * La campaña de una captura, limpia.
 *
 * - `lote_id` tiene que ser uno REAL de las campañas abiertas de ESTA
 *   cuenta, o no vale: un id inventado le cargaría el gasto a una campaña
 *   que no existe (la base lo rechazaría con un error que no le explica
 *   nada a nadie) o, peor, a la de otro.
 * - Si el modelo no dio un id válido pero sí dijo cómo la llamó, y ese
 *   nombre coincide con UNA sola campaña, es esa: el modelo a veces
 *   reconoce el nombre y se equivoca al copiar el id.
 * - Si nombró algo y no se supo cuál (o inventó el id), `lote_dudoso`: la
 *   pantalla pregunta antes de guardar.
 * - Fuera de gasto, ingreso, venta y deuda, o sin campañas, todo en null.
 */
export function sanearCampana(
  datos: { lote_id?: unknown; lote_nombrado?: unknown } | null | undefined,
  tipo: string,
  campanas: CampanaConocida[],
): { lote_id: string | null; lote_nombrado: string | null; lote_dudoso: boolean } {
  const nada = { lote_id: null, lote_nombrado: null, lote_dudoso: false };
  if (!(TIPOS_CON_CAMPANA as readonly string[]).includes(tipo) || campanas.length === 0) return nada;

  const id = typeof datos?.lote_id === 'string' ? datos.lote_id.trim() : '';
  if (id && campanas.some((c) => c.id === id)) return { lote_id: id, lote_nombrado: null, lote_dudoso: false };

  const nombrado = typeof datos?.lote_nombrado === 'string' ? datos.lote_nombrado.trim().slice(0, 60) : '';
  if (nombrado) {
    const buscado = nombreLimpio(nombrado);
    const coinciden = buscado
      ? campanas.filter((c) => nombreLimpio(c.nombre) === buscado)
      : [];
    if (coinciden.length === 1) return { lote_id: coinciden[0].id, lote_nombrado: null, lote_dudoso: false };
  }

  // Un id que no es de la lista también es «nombró algo»: el modelo creyó
  // reconocer una campaña. Se pregunta en vez de guardarlo sin campaña.
  if (nombrado || id) return { lote_id: null, lote_nombrado: nombrado || null, lote_dudoso: true };
  return nada;
}

/**
 * La categoría de una deuda nueva, solo si es una de las de gasto de la
 * cuenta, escrita como está en la lista. Cualquier otra cosa vuelve '' (la
 * base la guarda como «Deudas» al pagarla): una categoría inventada crearía
 * un casillero que nadie armó.
 */
export function sanearCategoriaDeuda(valor: unknown, categorias: CategoriaSugerida[]): string {
  if (typeof valor !== 'string' || !valor.trim()) return '';
  const buscado = normalizar(valor);
  return categorias.find((c) => normalizar(c.nombre) === buscado)?.nombre.slice(0, 60) ?? '';
}
