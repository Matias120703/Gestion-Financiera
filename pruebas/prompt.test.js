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

console.log('\n' + '═'.repeat(62));
if (fallos > 0) {
  console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DEL PROMPT FALLARON`);
  process.exit(1);
}
console.log(`>>> ${corridas} COMPROBACIONES DEL PROMPT PASARON`);
process.exit(0);
