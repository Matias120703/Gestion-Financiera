/**
 * Confiabilidad de lecturas.
 *
 * Dos cosas que una aplicación de plata no puede hacer:
 *
 *   1. Mostrar un número financiero válido para representar una falla técnica.
 *      Si la consulta falló, no sabemos cuánto se vendió. "Gs. 0" sería mentira.
 *
 *   2. Entregar un reporte a medias como si estuviera completo.
 *      Media lista parece una lista.
 *
 * Acá se prueba la capa de lectura aislada (`lectura.ts`), simulando lo que
 * devuelve supabase-js en cada caso. No necesita base de datos.
 */
const {
  ErrorDeLectura, esErrorDeLectura, exigir, exigirLista, recorrerPaginas,
} = require('../.compilado/lectura.js');

let fallos = 0, corridas = 0;

function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a}`);
}

/** Espera que la función lance un ErrorDeLectura. */
function lanza(nombre, fn) {
  corridas++;
  try {
    const v = fn();
    fallos++;
    console.log(`  ✗ ${nombre}\n      NO lanzó, devolvió ${JSON.stringify(v)}`);
  } catch (e) {
    if (!esErrorDeLectura(e)) {
      fallos++;
      console.log(`  ✗ ${nombre}\n      lanzó otra cosa: ${e.name} ${e.message}`);
      return;
    }
    console.log(`  ✓ ${nombre} → lanzó: ${e.message.slice(0, 62)}`);
  }
}

async function lanzaAsync(nombre, fn) {
  corridas++;
  try {
    const v = await fn();
    fallos++;
    console.log(`  ✗ ${nombre}\n      NO lanzó, devolvió ${JSON.stringify(v)?.slice(0, 60)}`);
  } catch (e) {
    console.log(`  ✓ ${nombre} → lanzó: ${e.message.slice(0, 62)}`);
  }
}

// Lo que devuelve supabase-js en cada situación.
const conDatos = (data) => ({ data, error: null });
const conError = (mensaje) => ({ data: null, error: { message: mensaje } });

// Silenciamos los console.error esperados para que la salida quede legible.
const errorOriginal = console.error;
console.error = () => {};

async function principal() {
  // =====================================================================
  grupo('1 · Vacío legítimo: la consulta anduvo y no hay nada');
  // =====================================================================
  ok('un resumen en cero es un dato válido',
    exigir(conDatos({ ventas: 0, gastos: 0 }), 'resumen'), { ventas: 0, gastos: 0 });
  ok('un ranking vacío es un dato válido', exigirLista(conDatos([]), 'ranking'), []);
  ok('una serie vacía también', exigirLista(conDatos([]), 'serie'), []);
  ok('gastos vacíos también', exigirLista(conDatos([]), 'gastos'), []);
  ok('cero movimientos contados es un dato válido', exigir(conDatos(0), 'conteo'), 0);
  ok('una página vacía es un dato válido',
    exigir(conDatos({ movimientos: [], siguiente: null }), 'historial'),
    { movimientos: [], siguiente: null });
  ok('false también es un dato válido', exigir(conDatos(false), 'bandera'), false);
  ok('un string vacío también', exigir(conDatos(''), 'texto'), '');

  // =====================================================================
  grupo('2 · Consulta fallida: NUNCA un número financiero');
  // =====================================================================
  lanza('el resumen falla → no devuelve RESUMEN_VACIO',
    () => exigir(conError('connection terminated'), 'resumen financiero'));
  lanza('el ranking falla → no devuelve []',
    () => exigirLista(conError('statement timeout'), 'ranking de productos'));
  lanza('la serie falla → no devuelve []',
    () => exigirLista(conError('canceling statement due to statement timeout'), 'serie diaria'));
  lanza('los gastos fallan → no devuelve []',
    () => exigirLista(conError('permission denied'), 'gastos por categoría'));
  lanza('los cobros fallan → no devuelve []',
    () => exigirLista(conError('JWT expired'), 'cobros por método'));
  lanza('el historial falla → no dice "se terminó"',
    () => exigir(conError('fetch failed'), 'historial de movimientos'));
  lanza('el conteo falla → no devuelve 0',
    () => exigir(conError('network error'), 'conteo de movimientos'));
  lanza('el catálogo falla → no devuelve []',
    () => exigirLista(conError('could not connect'), 'catálogo de productos'));

  // Sin error pero sin datos tampoco alcanza para afirmar nada.
  lanza('data null sin error también lanza', () => exigir({ data: null, error: null }, 'resumen'));
  lanza('data undefined también', () => exigir({ data: undefined, error: null }, 'resumen'));

  // Forma inesperada: si esperábamos lista y llega otra cosa, no la usamos.
  lanza('si esperábamos lista y llega un objeto, lanza',
    () => exigirLista(conDatos({ ventas: 5 }), 'ranking'));
  lanza('si llega un número donde iba una lista, lanza',
    () => exigirLista(conDatos(42), 'serie'));

  // =====================================================================
  grupo('3 · El error dice qué falló y conserva la causa');
  // =====================================================================
  try {
    exigir(conError('connection refused'), 'resumen financiero');
  } catch (e) {
    ok('es un ErrorDeLectura', e.name, 'ErrorDeLectura');
    ok('guarda el contexto', e.contexto, 'resumen financiero');
    ok('guarda la causa técnica', e.causa, 'connection refused');
    ok('el mensaje es entendible', /No se pudieron cargar los datos/.test(e.message), true);
    ok('esErrorDeLectura lo reconoce', esErrorDeLectura(e), true);
  }
  ok('y no confunde otros errores', esErrorDeLectura(new Error('otra cosa')), false);

  // =====================================================================
  grupo('4 · Recorrer páginas: entero o nada');
  // =====================================================================
  {
    // Caso feliz: tres páginas completas.
    const paginas = [
      { items: [1, 2, 3], siguiente: 'c1' },
      { items: [4, 5, 6], siguiente: 'c2' },
      { items: [7, 8], siguiente: null },
    ];
    let i = 0;
    const todo = await recorrerPaginas(async () => paginas[i++]);
    ok('recorre todas las páginas', todo, [1, 2, 3, 4, 5, 6, 7, 8]);
    ok('y pidió exactamente 3 páginas', i, 3);
  }

  {
    // La página 2 falla: no puede devolver la 1 como si fuera todo.
    let pedidas = 0;
    await lanzaAsync('si falla la página 2, NO devuelve la página 1', () =>
      recorrerPaginas(async (cursor) => {
        pedidas += 1;
        if (pedidas === 1) return { items: [1, 2, 3], siguiente: 'c1' };
        throw new ErrorDeLectura('detalle de movimientos', 'timeout en la página 2');
      }));
    ok('se cortó en la página 2', pedidas, 2);
  }

  {
    // La última página falla: tampoco vale devolver lo acumulado.
    let pedidas = 0;
    await lanzaAsync('si falla la última página, tampoco devuelve lo acumulado', () =>
      recorrerPaginas(async () => {
        pedidas += 1;
        if (pedidas < 3) return { items: [pedidas], siguiente: 'c' + pedidas };
        throw new ErrorDeLectura('detalle', 'se cortó al final');
      }));
    ok('llegó hasta la tercera', pedidas, 3);
  }

  {
    // Cursor que no avanza: antes se cortaba en silencio; ahora falla.
    await lanzaAsync('un cursor que nunca termina falla en vez de girar para siempre', () =>
      recorrerPaginas(async () => ({ items: [1], siguiente: 'siempre' }), { maxPaginas: 5 }));
  }

  {
    // Demasiados registros: mejor fallar que devolver una parte.
    await lanzaAsync('superar el tope de registros falla', () =>
      recorrerPaginas(async () => ({ items: [1, 2, 3, 4, 5], siguiente: 'c' }), { tope: 8 }));
  }

  {
    // El tope hay que controlarlo ANTES de cortar. Si se revisara después,
    // la última página podría pasarse y la función terminaría sin lanzar.
    const paginas = [
      { items: [1, 2, 3, 4, 5], siguiente: 'c1' },
      { items: [6, 7, 8, 9], siguiente: null },   // acá llegamos a 9 con tope 8
    ];
    let i = 0;
    await lanzaAsync('la ÚLTIMA página que se pasa del tope también falla', () =>
      recorrerPaginas(async () => paginas[i++], { tope: 8 }));
  }

  {
    // Y el borde exacto sí tiene que funcionar: justo el tope y sin más páginas.
    const paginas = [
      { items: [1, 2, 3, 4, 5], siguiente: 'c1' },
      { items: [6, 7, 8], siguiente: null },      // exactamente 8
    ];
    let i = 0;
    const todo = await recorrerPaginas(async () => paginas[i++], { tope: 8 });
    ok('justo en el tope, sin más páginas, devuelve todo', todo, [1, 2, 3, 4, 5, 6, 7, 8]);
    ok('y son exactamente 8', todo.length, 8);
  }

  {
    // Justo en el tope pero con otra página pendiente: no entra todo, falla.
    const paginas = [
      { items: [1, 2, 3, 4], siguiente: 'c1' },
      { items: [5, 6, 7, 8], siguiente: 'c2' },   // llega a 8 y todavía hay más
    ];
    let i = 0;
    await lanzaAsync('justo en el tope pero con más páginas pendientes, falla', () =>
      recorrerPaginas(async () => paginas[i++], { tope: 8 }));
  }

  {
    // Una sola página que ya termina.
    const todo = await recorrerPaginas(async () => ({ items: ['a'], siguiente: null }));
    ok('una página única funciona', todo, ['a']);
    const vacio = await recorrerPaginas(async () => ({ items: [], siguiente: null }));
    ok('cero páginas devuelve lista vacía, sin lanzar', vacio, []);
  }

  console.error = errorOriginal;
  console.log(`\n${'═'.repeat(62)}`);
  console.log(fallos === 0
    ? `>>> ${corridas} COMPROBACIONES DE CONFIABILIDAD PASARON`
    : `>>> ${fallos} DE ${corridas} COMPROBACIONES FALLARON`);
  process.exit(fallos ? 1 : 0);
}

principal().catch((e) => {
  console.error = errorOriginal;
  console.error('\nERROR INESPERADO:', e.message ?? e, '\n', e.stack);
  process.exit(1);
});
