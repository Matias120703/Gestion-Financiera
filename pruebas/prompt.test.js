/**
 * Pruebas del prompt de la captura.
 *
 * No comprueban que la IA acierte —eso solo se sabe hablándole de verdad—
 * sino que el prompt DIGA lo que tiene que decir. Es la diferencia entre un
 * modelo que se equivoca y un modelo al que nunca le contamos el dato.
 *
 * El caso que las trajo: alguien con el sueldo cargado dijo «ya cobré mi
 * sueldo de este mes» y el sistema contestó «no pude sacar el monto del
 * mensaje, escribilo vos». El monto estaba guardado. Nunca llegó al prompt.
 */
const { instrucciones, ESQUEMA, sanearCampana, sanearCategoriaDeuda, sanearCuotas } = require('../.compilado/captura.js');
const { planDeLoDictado } = require('../.compilado/cuotas-dictadas.js');

let fallos = 0;
let corridas = 0;

function grupo(nombre) {
  console.log(`\n── ${nombre} ${'─'.repeat(Math.max(0, 58 - nombre.length))}`);
}

function ok(nombre, real, esperado) {
  corridas++;
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(esperado)}`);
  } else {
    console.log(`  ✓ ${nombre}`);
  }
}

const HOY = '2026-08-31';

const FIJOS = [
  { clase: 'ingreso', nombre: 'sueldo', importe: 1850000, categoria: 'Sueldo' },
  { clase: 'gasto', nombre: 'wifi', importe: 200000, categoria: 'Servicios' },
];

// ═══════════════════════════════════════════════════════════
grupo('1 · Lo que se repite llega al prompt');

const personal = instrucciones(HOY, 'PYG', [], [], true, [], FIJOS);

ok('aparece la sección', personal.includes('LO QUE SE REPITE TODOS LOS MESES'), true);
ok('con el sueldo y su monto', /sueldo \| ENTRA 1850000/.test(personal), true);
ok('con el wifi y su monto', /wifi \| SALE 200000/.test(personal), true);
ok('y con la categoría del gasto', personal.includes('categoría "Servicios"'), true);

ok('dice qué hacer si no menciona el monto',
  personal.includes('usá el monto de la lista'), true);
ok('y que gana el monto dicho si lo dice',
  personal.includes('ganá el que dijo'), true);
ok('el ejemplo del caso real está',
  personal.includes('ya cobré mi sueldo'), true);

// ═══════════════════════════════════════════════════════════
grupo('2 · Sin fijos cargados, la sección no existe');

// Un bloque vacío con un título sería peor que nada: le gasta atención al
// modelo y le sugiere que hay una lista donde no hay ninguna.
const sinFijos = instrucciones(HOY, 'PYG', [], [], true, [], []);
ok('no aparece la sección', sinFijos.includes('LO QUE SE REPITE'), false);
ok('pero el resto del prompt sigue entero',
  sinFijos.includes('ESTA ES UNA CUENTA PERSONAL'), true);

// ═══════════════════════════════════════════════════════════
grupo('3 · Vale también para un negocio');

const negocio = instrucciones(HOY, 'PYG', [], [], false, [], FIJOS);
ok('el negocio también los recibe', negocio.includes('LO QUE SE REPITE TODOS LOS MESES'), true);
ok('y sigue siendo el prompt de negocio', negocio.includes('CATÁLOGO DE PRODUCTOS'), true);

// ═══════════════════════════════════════════════════════════
grupo('3b · Las categorías salen de la base, no del prompt');

// El prompt personal las tenía escritas a mano y NO coincidían con las de la
// base: decía "Salidas" donde el plan ofrece "Ocio". Un gasto clasificado en
// una categoría que el plan no conoce queda afuera de la cuenta que la
// persona hizo.
const GASTOS = [
  { nombre: 'Ocio', pistas: 'salida, cine' },
  { nombre: 'Cuidado personal', pistas: 'peluquería, uñas' },
];
const INGRESOS = [
  { nombre: 'Sueldo', pistas: 'sueldo, quincena' },
  { nombre: 'Extra', pistas: 'horas extra, bonificación' },
];

const conListas = instrucciones(HOY, 'PYG', [], [], true, GASTOS, [], INGRESOS);

ok('usa las categorías de gasto que le pasan', conListas.includes('"Cuidado personal"'), true);
ok('y las de ingreso', conListas.includes('"Extra"'), true);
ok('ya no inventa "Salidas"', conListas.includes('"Salidas"'), false);
ok('avisa por qué importa clavarse a la lista',
  conListas.includes('rompe el plan de gastos'), true);

// ═══════════════════════════════════════════════════════════
grupo('4 · Lo que no puede filtrarse');

// El costo de un producto no entra al prompt: la base lo asigna sola al
// registrar la venta, y mandarlo sería filtrarlo sin ninguna necesidad.
const conCatalogo = instrucciones(
  HOY, 'PYG',
  [{ id: 'p1', nombre: 'Perfume', precio: 180000, costo: 90000 }],
  [], false, [], [],
);
ok('el precio va', conCatalogo.includes('precio=180000'), true);
ok('el costo NO va', conCatalogo.includes('90000'), false);

// ═══════════════════════════════════════════════════════════
grupo('5 · Quién le debe a quién: lo que te deben no es una deuda tuya');

// «Lucas me debe 300 mil» se guardó como una deuda del DUEÑO con Lucas: la
// voz no conocía el fiado, y la regla decía que «queda debiendo» era deuda.
// En un bloque: `negocio` y `persona` ya son nombres de otros grupos.
{
  const DEUDORES = [{ id: 'c-lucas', nombre: 'Lucas', saldo: 300000 }];
  const negocio = instrucciones(HOY, 'PYG', [], [], false, [], [], [], DEUDORES);
  const persona = instrucciones(HOY, 'PYG', [], [], true, [], [], [], DEUDORES);

  ok('el negocio conoce el fiado', negocio.includes('"fiado"'), true);
  ok('y el cobro de un fiado', negocio.includes('"cobro_fiado"'), true);
  ok('«me debe» es fiado, con el ejemplo', /Lucas me debe 300 mil"\s+→ fiado/.test(negocio), true);
  ok('«queda debiendo» ya no es una deuda del dueño',
    /queda debiendo" o|"queda debiendo", es DEUDA/.test(negocio), false);
  ok('cobrar un fiado no es un ingreso', negocio.includes('NO es ingreso'), true);
  ok('una venta fiada sigue siendo venta a crédito', negocio.includes('es una VENTA con metodo_pago "credito"'), true);
  ok('llega la lista de quién debe, con su id', negocio.includes('- Lucas | id=c-lucas | debe=300000'), true);
  ok('una cuenta personal también conoce el fiado',
    persona.includes('"fiado"') && persona.includes('"cobro_fiado"'), true);
  ok('y recibe la misma lista', persona.includes('- Lucas | id=c-lucas | debe=300000'), true);
  ok('sin nadie debiendo, se dice', instrucciones(HOY, 'PYG', [], [], false).includes('(nadie te debe nada)'), true);
}

// ═══════════════════════════════════════════════════════════
grupo('6 · La voz sirve para todo: turnos, catálogo y clientes');

// El dueño lo pidió así: el micrófono de siempre, para todo lo del sistema.
// Solo se ofrece lo que existe en la cuenta: un tipo disponible es un tipo
// que el modelo va a usar.
{
  const conTodo = instrucciones(HOY, 'PYG', [], [], false, [], [], [], [],
    { tipos: ['turno', 'producto', 'cliente'], bloqueTurnos: 'TURNOS — bloque de prueba' });
  ok('ofrece el turno', conTodo.includes('- "turno":'), true);
  ok('con su bloque', conTodo.includes('TURNOS — bloque de prueba'), true);
  ok('ofrece el catálogo', conTodo.includes('- "producto":'), true);
  ok('comprar mercadería sigue siendo gasto', conTodo.includes('es un GASTO, no un producto'), true);
  ok('sumar stock dice cuánto entró', conTodo.includes('en "stock", cuántos entraron'), true);
  ok('ofrece cargar clientes', conTodo.includes('- "cliente":'), true);
  ok('lo que no es del tipo va en null', conTodo.includes('van con todo en null'), true);

  const sinAgenda = instrucciones(HOY, 'PYG', [], [], false, [], [], [], [], { tipos: ['producto', 'cliente'] });
  ok('sin agenda no hay turnos', sinAgenda.includes('- "turno":'), false);

  const sinNada = instrucciones(HOY, 'PYG', [], [], false);
  ok('sin decir qué hay, no se ofrece nada de esto', /- "(turno|producto|cliente)":/.test(sinNada), false);

  const persona = instrucciones(HOY, 'PYG', [], [], true);
  ok('una cuenta personal lleva esos objetos en null',
    persona.includes('"turno", "producto" y "ficha" van siempre con todo en null'), true);
}

// --- Lo que esta cuenta no tiene, se dice (no se convierte en gasto) ---
//
// Pasó de verdad: «tengo un nuevo turno mañana a las ocho, un corte para
// Juan», dicho en una cuenta sin agenda, terminó guardado como un GASTO de
// cero: el modelo no tenía «turno» entre los tipos y eligió el que más se
// parecía. Un turno guardado como gasto es un número inventado en las
// finanzas de alguien.
{
  const sinAgenda = instrucciones(HOY, 'PYG', [], [], false, [], FIJOS);
  ok('sin agenda, igual se pide devolver el tipo turno',
    sinAgenda.includes('devolvé tipo "turno" lo mismo'), true);
  ok('y se prohíbe convertirlo en plata',
    sinAgenda.includes('NUNCA lo conviertas en gasto, venta ni ingreso'), true);

  const conAgenda = instrucciones(HOY, 'PYG', [], [], false, [], FIJOS, [], [], {
    tipos: ['turno'], bloqueTurnos: 'TURNOS — ejemplo',
  });
  ok('con agenda esa regla no aparece: sería ruido',
    conAgenda.includes('esta cuenta NO tiene agenda'), false);

  const persona2 = instrucciones(HOY, 'PYG', [], [], true);
  ok('y en una cuenta personal también se avisa, en vez de inventar un gasto',
    persona2.includes('UNA SOLA EXCEPCIÓN'), true);
}

// ---------------------------------------------------------------------
// El idioma: quien usa Orden en portugués lee la descripción y el aviso en
// portugués, pero las categorías vuelven tal cual están en la lista.
// ---------------------------------------------------------------------
{
  const enEspanol = instrucciones(HOY, 'PYG', [], [], false, [], FIJOS);
  const enPortugues = instrucciones(HOY, 'PYG', [], [], false, [], FIJOS, [], [], { idioma: 'pt' });
  const personaPt = instrucciones(HOY, 'PYG', [], [], true, [], FIJOS, [], [], { idioma: 'pt' });

  ok('sin decir idioma, el aviso sigue en español rioplatense',
    enEspanol.includes('frase corta y en español rioplatense'), true);
  ok('y no aparece ningún bloque de idioma',
    enEspanol.includes('IDIOMA\n'), false);

  ok('en portugués, el aviso se pide en portugués',
    enPortugues.includes('frase corta y en portugués de Brasil'), true);
  ok('la descripción también',
    enPortugues.includes('Corta, concreta, en portugués de Brasil'), true);
  ok('y ya no se pide nada en español rioplatense',
    enPortugues.includes('español rioplatense'), false);
  ok('se avisa que puede mezclar los dos idiomas',
    enPortugues.includes('mezclando los dos'), true);
  ok('las categorías vuelven como están en la lista',
    enPortugues.includes('EXACTAMENTE como están escritas en la lista'), true);
  ok('la cuenta personal en portugués también lo dice',
    personaPt.includes('IDIOMA\n') && !personaPt.includes('español rioplatense'), true);
}

// ═══════════════════════════════════════════════════════════
grupo('7 · Las campañas: «gasté dos millones en semilla para el Norte»');

// Sin la lista, el Norte quedaba como texto en la descripción y había que
// ir a la campaña a «sumarlo» después — cosa que nadie hace dos veces. Con
// la lista, la regla de la que NO nombra ninguna importa igual: una campaña
// adivinada carga el costo de la soja en el maíz.
{
  const CAMPANAS = [
    { id: 'l-norte', nombre: 'Norte', cultivo: 'Soja', campana: 'Zafra 2026/27', hectareas: 50 },
    { id: 'l-t3', nombre: 'Talhão 3', cultivo: 'Soja', campana: 'Safra 26/27', hectareas: 120 },
    { id: 'l-sur', nombre: 'Sur', cultivo: 'Maíz', campana: '', hectareas: null },
  ];
  const AGRO = [
    { nombre: 'Semilla', pistas: 'semilla, bolsa · semente' },
    { nombre: 'Fletes', pistas: 'flete, camión · frete, caminhão' },
    { nombre: 'Agroquímicos', pistas: 'herbicida, glifosato · defensivo' },
  ];
  const es = instrucciones(HOY, 'USD', [], [], false, AGRO, [], [], [], { campanas: CAMPANAS });
  const pt = instrucciones(HOY, 'USD', [], [], false, AGRO, [], [], [], { campanas: CAMPANAS, idioma: 'pt' });

  ok('aparece el bloque con su encabezado',
    es.includes('CAMPAÑAS ABIERTAS (id · nombre · cultivo · hectáreas)'), true);
  ok('cada campaña con id, nombre, campaña, cultivo y hectáreas',
    es.includes('- l-norte · Norte (Zafra 2026/27) · Soja · 50 ha'), true);
  ok('sin hectáreas ni campaña no inventa nada',
    es.includes('- l-sur · Sur · Maíz · —'), true);
  ok('si nombra una campaña, pone su id',
    es.includes('Si el usuario nombra una campaña, poné su id'), true);
  ok('si nombra una que no está, lote_id vacío',
    es.includes('Si nombra una que no está, dejá lote_id vacío'), true);
  ok('y dice cómo la llamó', es.includes('"lote_nombrado" cómo la llamó'), true);
  ok('sin nombrar ninguna, no adivina', es.includes('NO adivines'), true);
  ok('dos que coinciden: elige la persona', es.includes('la persona elige'), true);
  ok('el ejemplo en español', /gasté dos millones en semilla para el Norte"\s+→ gasto, categoría "Semilla", lote_id del Norte/.test(es), true);
  ok('el ejemplo en portugués', /paguei o frete da soja do talhão 3"\s+→ gasto, categoría "Fletes", lote_id del talhão 3/.test(es), true);
  ok('entiende las palabras del campo en los dos idiomas',
    es.includes('talhão') && es.includes('safrinha') && es.includes('chacra'), true);
  ok('el lote no es la categoría', es.includes('NO son la categoría'), true);
  ok('en portugués llega el mismo bloque',
    pt.includes('CAMPAÑAS ABIERTAS (id · nombre · cultivo · hectáreas)') && pt.includes('- l-t3 · Talhão 3 (Safra 26/27) · Soja · 120 ha'), true);
  ok('el bloque va antes de las reglas', es.indexOf('CAMPAÑAS ABIERTAS') < es.indexOf('REGLAS:'), true);

  const sinCampanas = instrucciones(HOY, 'PYG', [], [], false, AGRO);
  ok('sin campañas no hay bloque', sinCampanas.includes('CAMPAÑAS ABIERTAS'), false);
  ok('pero lote_id sigue yendo en null', sinCampanas.includes('"lote_id" y "lote_nombrado" van siempre en null'), true);
  const persona = instrucciones(HOY, 'PYG', [], [], true);
  ok('una cuenta personal no tiene campañas', persona.includes('CAMPAÑAS ABIERTAS'), false);
  ok('y también manda lote_id en null', persona.includes('"lote_id" y "lote_nombrado" también van siempre en null'), true);

  ok('la deuda pide la categoría del gasto que va a nacer',
    es.includes('"deuda.categoria"') && es.includes('la categoría del gasto que va a nacer cuando la pague'), true);

  // El esquema estricto exige que cada clave exista en la respuesta.
  ok('el esquema pide lote_id', ESQUEMA.required.includes('lote_id') && !!ESQUEMA.properties.lote_id, true);
  ok('y lote_nombrado', ESQUEMA.required.includes('lote_nombrado'), true);
  ok('y la categoría dentro de la deuda',
    ESQUEMA.properties.deuda.required.includes('categoria') && !!ESQUEMA.properties.deuda.properties.categoria, true);
  ok('todas las claves pedidas existen',
    ESQUEMA.required.every((k) => k in ESQUEMA.properties), true);

  // ─── el saneo: una instrucción se puede ignorar, esto no ───
  ok('un id real queda',
    sanearCampana({ lote_id: 'l-norte', lote_nombrado: null }, 'gasto', CAMPANAS),
    { lote_id: 'l-norte', lote_nombrado: null, lote_dudoso: false });
  ok('un id inventado se tira y se pregunta',
    sanearCampana({ lote_id: 'l-inventado', lote_nombrado: null }, 'gasto', CAMPANAS),
    { lote_id: null, lote_nombrado: null, lote_dudoso: true });
  ok('el id de otra cuenta tampoco pasa',
    sanearCampana({ lote_id: 'l-de-otro', lote_nombrado: 'Norte de Juan' }, 'venta', CAMPANAS),
    { lote_id: null, lote_nombrado: 'Norte de Juan', lote_dudoso: true });
  ok('nombró una que no existe: sin campaña, con el nombre, y se pregunta',
    sanearCampana({ lote_id: null, lote_nombrado: 'el Oeste' }, 'gasto', CAMPANAS),
    { lote_id: null, lote_nombrado: 'el Oeste', lote_dudoso: true });
  ok('el nombre coincide con una sola: es esa aunque el id venga mal',
    sanearCampana({ lote_id: 'x', lote_nombrado: 'do talhao 3' }, 'gasto', CAMPANAS),
    { lote_id: 'l-t3', lote_nombrado: null, lote_dudoso: false });
  ok('sin nombrar nada, sin campaña y sin preguntar',
    sanearCampana({ lote_id: null, lote_nombrado: null }, 'gasto', CAMPANAS),
    { lote_id: null, lote_nombrado: null, lote_dudoso: false });
  ok('en un ingreso y en una deuda también vale',
    [sanearCampana({ lote_id: 'l-sur' }, 'ingreso', CAMPANAS).lote_id,
      sanearCampana({ lote_id: 'l-sur' }, 'deuda', CAMPANAS).lote_id], ['l-sur', 'l-sur']);
  ok('un pago de deuda no lleva campaña (la tiene la deuda)',
    sanearCampana({ lote_id: 'l-norte' }, 'pago_deuda', CAMPANAS).lote_id, null);
  ok('un fiado tampoco', sanearCampana({ lote_id: 'l-norte' }, 'fiado', CAMPANAS).lote_id, null);
  ok('sin campañas abiertas, nada',
    sanearCampana({ lote_id: 'l-norte', lote_nombrado: 'Norte' }, 'gasto', []),
    { lote_id: null, lote_nombrado: null, lote_dudoso: false });
  ok('lo que no es texto se ignora',
    sanearCampana({ lote_id: 42, lote_nombrado: { x: 1 } }, 'gasto', CAMPANAS),
    { lote_id: null, lote_nombrado: null, lote_dudoso: false });

  // La categoría de la deuda: solo una de la lista, escrita como en la lista.
  ok('categoría del rubro, escrita como en la lista',
    sanearCategoriaDeuda('agroquimicos', AGRO), 'Agroquímicos');
  ok('una inventada no pasa (nacería como «Deudas»)', sanearCategoriaDeuda('Veneno para la soja', AGRO), '');
  ok('null no pasa', sanearCategoriaDeuda(null, AGRO), '');
}

// ═══════════════════════════════════════════════════════════
grupo('El profe que también vende productos (121)');
{
  // Lo que separa sus clases de sus productos es el producto_id: el cobro de
  // una clase va sin él, lo del catálogo con el suyo, y lo que no está
  // cargado se avisa (sin costo, caería en lo de las clases).
  const CATALOGO = [{ id: 'p-raq', nombre: 'Raqueta', precio: 350000 }, { id: 'p-pel', nombre: 'Tubo de pelotas', precio: 25000 }];
  const conProductos = instrucciones(HOY, 'PYG', CATALOGO, [], false, [], [], [], [], { deAlumnosConProductos: true });
  const sinProductos = instrucciones(HOY, 'PYG', CATALOGO, [], false, [], [], [], [], {});
  ok('trae el bloque', conProductos.includes('ESTE NEGOCIO DA CLASES Y TAMBIÉN VENDE PRODUCTOS.'), true);
  ok('el cobro de una clase va sin producto_id', /clase, una sesión, una inscripción, un mes o un paquete es una "venta" con un ítem SIN producto_id/.test(conProductos), true);
  ok('lo del catálogo, con el suyo', conProductos.includes('lleva su "producto_id" exacto'), true);
  ok('y lo que no está en el catálogo se avisa', /NO está en el catálogo, dejalo con producto_id null y avisá en "aviso"/.test(conProductos), true);
  ok('el catálogo sigue en el prompt, sin costos', [conProductos.includes('- Raqueta | id=p-raq | precio=350000'), /costo=/.test(conProductos)], [true, false]);
  ok('sin el interruptor, el bloque no está', sinProductos.includes('ESTE NEGOCIO DA CLASES'), false);
  ok('y el resto del prompt es el mismo', conProductos.replace(/\n   ESTE NEGOCIO DA CLASES[\s\S]*?cuánto gana con él\.\n/, ''), sinProductos);
  const enPt = instrucciones(HOY, 'PYG', CATALOGO, [], false, [], [], [], [], { deAlumnosConProductos: true, idioma: 'pt' });
  ok('en portugués, el aviso en su idioma', enPt.includes('avisá en "aviso", en portugués de Brasil,'), true);
  ok('una cuenta personal nunca lo trae',
    instrucciones(HOY, 'PYG', [], [], true, [], [], [], [], { deAlumnosConProductos: true }).includes('ESTE NEGOCIO DA CLASES'), false);
}

// ═══════════════════════════════════════════════════════════
grupo('Cuándo te paga: «en 3 cuotas, la primera el 15» (127)');
{
  // Matías: una venta a crédito puede llevar fecha de cobro, una sola o en
  // cuotas. Por voz, la fecha era lo único que se decía de más y se perdía:
  // el esquema no tenía dónde ponerla.
  const negocio = instrucciones(HOY, 'PYG', [], [], false);
  const persona = instrucciones(HOY, 'PYG', [], [], true);

  // --- El esquema ---
  const c = ESQUEMA.properties.cuotas;
  ok('el esquema tiene "cuotas", y es obligatoria (modo estricto)',
    [ESQUEMA.required.includes('cuotas'), c.type, c.required, c.additionalProperties],
    [true, ['object', 'null'], ['cantidad', 'cada', 'primera'], false]);
  ok('cantidad entera, cada de la lista, primera puede faltar',
    [c.properties.cantidad.type, c.properties.cada.enum, c.properties.primera.type],
    ['integer', ['semana', 'quincena', 'mes'], ['string', 'null']]);
  ok('todo lo requerido existe en properties (si no, la API rechaza el esquema)',
    ESQUEMA.required.filter((k) => !(k in ESQUEMA.properties)), []);

  // --- Las tres frases ---
  ok('«le fié a Juan 300 mil en 3 cuotas, la primera el 15»',
    /le fié a Juan 300 mil en 3 cuotas, la primera el 15"\s+→ fiado, cuotas \{"cantidad":3,"cada":"mes","primera":"<el 15 que viene>"\}/.test(negocio), true);
  ok('«me paga el viernes» es una sola fecha',
    /me paga el viernes"\s+→ fiado, cuotas \{"cantidad":1,"cada":"mes","primera":"<el viernes que viene>"\}/.test(negocio), true);
  ok('«cada quince días» es quincena, «por semana» es semana',
    /"cada quince días" \/ "por semana" \/ "cada 15"\s+→ "cada": "quincena" \/ "semana" \/ "quincena"/.test(negocio), true);
  ok('la venta en cuotas es venta a crédito, sin fecha dicha',
    /le vendí la tele a Ana en 6 cuotas"\s+→ venta "credito", cuotas \{"cantidad":6,"cada":"mes","primera":null\}/.test(negocio), true);

  // --- Y la que no dice cuándo ---
  ok('«Lucas me debe 300 mil» sigue sin fecha',
    /"Lucas me debe 300 mil" \(no dijo cuándo\)\s+→ cuotas null/.test(negocio), true);
  ok('y se dice: si no dijo cuándo, null', negocio.includes('si no, "cuotas" en null'), true);

  // --- Lo que evita los dos errores caros ---
  ok('el modelo sabe qué día es hoy para «el 15» y «el viernes»',
    negocio.includes(`nunca una fecha anterior a hoy (${HOY})`), true);
  ok('el monto es el total, no el valor de una cuota', negocio.includes('"monto" sigue siendo el TOTAL'), true);
  ok('no son las cuotas de una deuda propia', negocio.includes('NO "deuda.cuotas"'), true);
  ok('ni las de una tarjeta: esa plata ya entró',
    /Las cuotas de una TARJETA[\s\S]{0,120}"cuotas" en null/.test(negocio), true);
  ok('la cuenta personal también: «Lucas me debe, me paga el 30»',
    /me paga el 30"\s+→ fiado, cuotas \{"cantidad":1/.test(persona), true);
  ok('pero sin la venta a crédito, que no tiene', persona.includes('le vendí la tele a Ana'), false);

  // --- El saneo: lo que devuelve el modelo no se cree ---
  const dicho = { cantidad: 3, cada: 'mes', primera: '2026-09-15' };
  ok('fiado: pasa tal cual', sanearCuotas(dicho, 'fiado', 'efectivo', HOY), dicho);
  ok('venta a crédito: pasa', sanearCuotas(dicho, 'venta', 'credito', HOY), dicho);
  ok('venta en efectivo: no tiene cuándo cobrarse', sanearCuotas(dicho, 'venta', 'efectivo', HOY), null);
  ok('en cualquier otro tipo, null',
    ['gasto', 'ingreso', 'deuda', 'pago_deuda', 'cobro_fiado', 'turno', 'producto', 'cliente']
      .map((tipo) => sanearCuotas(dicho, tipo, 'credito', HOY)),
    [null, null, null, null, null, null, null, null]);
  ok('sin cuotas, null', [sanearCuotas(null, 'fiado', 'efectivo', HOY), sanearCuotas(undefined, 'fiado', 'efectivo', HOY), sanearCuotas('3', 'fiado', 'efectivo', HOY)], [null, null, null]);
  ok('una sola fecha es cantidad 1', sanearCuotas({ cantidad: 1, cada: 'mes', primera: '2026-09-04' }, 'fiado', 'efectivo', HOY),
    { cantidad: 1, cada: 'mes', primera: '2026-09-04' });
  ok('60 cuotas sí; 61, 0, negativas, con coma o en texto, no (se tira todo)',
    [60, 61, 0, -3, 2.5, '3', null, true].map((n) => sanearCuotas({ cantidad: n, cada: 'mes', primera: null }, 'fiado', 'efectivo', HOY)?.cantidad ?? null),
    [60, null, null, null, null, null, null, null]);
  ok('un «cada» inventado cae en mes', sanearCuotas({ cantidad: 2, cada: 'bimestre', primera: null }, 'fiado', 'efectivo', HOY),
    { cantidad: 2, cada: 'mes', primera: null });
  ok('semana y quincena se respetan',
    ['semana', 'quincena'].map((cada) => sanearCuotas({ cantidad: 2, cada, primera: null }, 'fiado', 'efectivo', HOY).cada),
    ['semana', 'quincena']);
  // HOY = 2026-08-31: un año atrás es 2025-08-31; diez adelante, 2036-08-28.
  ok('la fecha, en un rango razonable: ni 1926 ni 2206',
    ['1926-09-15', '2025-08-30', '2025-08-31', '2026-08-01', '2036-08-28', '2036-08-29', '2206-01-01']
      .map((primera) => sanearCuotas({ cantidad: 3, cada: 'mes', primera }, 'fiado', 'efectivo', HOY).primera),
    [null, null, '2025-08-31', '2026-08-01', '2036-08-28', null, null]);
  ok('una fecha que no existe o mal escrita, null (y las cuotas quedan)',
    ['2026-02-30', '15/09/2026', 'el viernes', '', 20260915].map((primera) => sanearCuotas({ cantidad: 3, cada: 'mes', primera }, 'fiado', 'efectivo', HOY)),
    Array(5).fill({ cantidad: 3, cada: 'mes', primera: null }));

  // --- De lo dictado al plan que se ve en la revisión ---
  ok('3 cuotas de 300.000 desde el 15: el plan que se manda',
    planDeLoDictado(dicho, 300000, HOY, 0),
    [{ vence_el: '2026-09-15', monto: 100000 }, { vence_el: '2026-10-15', monto: 100000 }, { vence_el: '2026-11-15', monto: 100000 }]);
  ok('el resto va en la última',
    planDeLoDictado({ cantidad: 3, cada: 'mes', primera: '2026-09-15' }, 500000, HOY, 0).map((q) => q.monto), [166666, 166666, 166668]);
  ok('sin fecha dicha, la primera a un período de hoy',
    [planDeLoDictado({ cantidad: 2, cada: 'semana', primera: null }, 100, HOY, 0)[0].vence_el,
      planDeLoDictado({ cantidad: 2, cada: 'quincena', primera: null }, 100, HOY, 0)[0].vence_el,
      planDeLoDictado({ cantidad: 2, cada: 'mes', primera: null }, 100, HOY, 0)[0].vence_el],
    ['2026-09-07', '2026-09-15', '2026-09-30']);
  ok('«me paga el viernes»: un plan de una sola cuota por todo',
    planDeLoDictado({ cantidad: 1, cada: 'mes', primera: '2026-09-04' }, 200000, HOY, 0), [{ vence_el: '2026-09-04', monto: 200000 }]);
  ok('sin nada dictado o sin monto, sin fecha (lo de siempre)',
    [planDeLoDictado(null, 300000, HOY, 0), planDeLoDictado(undefined, 300000, HOY, 0), planDeLoDictado(dicho, 0, HOY, 0)], [null, null, null]);

  // --- El prompt no viaja al navegador ---
  const fs = require('fs');
  const fuente = (f) => fs.readFileSync(require('path').join(__dirname, '..', 'src', 'components', f), 'utf8').replace(/\r\n/g, '\n');
  for (const f of ['RevisionFiado.tsx', 'CapturaInteligente.tsx']) {
    const s = fuente(f);
    ok(`${f}: de captura.ts solo importa tipos`,
      (s.match(/^import (?!type )[^\n]*from '@\/lib\/captura';$/gm) ?? []).length, 0);
    ok(`${f}: muestra «¿Cuándo te paga?» para corregir`, s.includes('<CuandoTePaga'), true);
  }
  const captura = fuente('CapturaInteligente.tsx');
  ok('la venta fiada por voz programa las cuotas en un segundo paso',
    /rpc\('programar_cuotas', \{ p_venta: idGuardado, p_plan: plan \}\)/.test(captura), true);
  ok('y si falla, lo dice con el aviso de Vender', captura.includes('t.venta.cuotasNoQuedaron'), true);
  ok('el fiado por voz manda el plan junto con la línea', fuente('RevisionFiado.tsx').includes('p_plan: elPlan'), true);
}

console.log('\n' + '═'.repeat(62));
if (fallos > 0) {
  console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL PROMPT FALLARON`);
  process.exit(1);
}
console.log(`>>> ${corridas} COMPROBACIONES DEL PROMPT PASARON`);
process.exit(0);
