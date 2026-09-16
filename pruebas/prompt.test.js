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
const { instrucciones } = require('../.compilado/captura.js');

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

console.log('\n' + '═'.repeat(62));
if (fallos > 0) {
  console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL PROMPT FALLARON`);
  process.exit(1);
}
console.log(`>>> ${corridas} COMPROBACIONES DEL PROMPT PASARON`);
process.exit(0);
