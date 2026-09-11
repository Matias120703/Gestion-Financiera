/**
 * Lo que la voz hace además de cargar plata: productos y clientes.
 *
 * El dueño pidió que el micrófono de siempre sirva «para todo». Estas
 * pruebas no comprueban que la IA acierte —eso solo se sabe hablándole—
 * sino que nada de lo que devuelve llegue a la pantalla sin limpiar: un
 * producto inventado, un número negativo, algo que ya estaba en el catálogo.
 */
const { sanearProducto, sanearFicha } = require('../.compilado/acciones.js');

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

const CATALOGO = [
  { id: 'p-shampoo', nombre: 'Shampoo', categoria: 'Cuidado', precio: 35000, costo: 20000,
    stock: 4, stock_minimo: 0, controla_stock: true, activo: true },
  { id: 's-corte', nombre: 'Corte', categoria: 'Cortes', precio: 50000, costo: 0,
    stock: 0, stock_minimo: 0, controla_stock: false, activo: true },
];

// ═══════════════════════════════════════════════════════════
grupo('1 · Algo nuevo para el catálogo');
{
  const r = sanearProducto({ producto: {
    accion: 'crear', producto_id: null, nombre: '  Acondicionador ', es_servicio: false,
    precio: 40000, costo: 22000, cantidad: 10, categoria: 'Cuidado',
  } }, CATALOGO);
  ok('lo que está bien pasa entero', r.producto, {
    accion: 'crear', producto_id: null, nombre: 'Acondicionador', es_servicio: false,
    precio: 40000, costo: 22000, cantidad: 10, categoria: 'Cuidado',
  });
  ok('sin aviso', r.aviso, null);

  ok('un servicio sale como servicio',
    sanearProducto({ producto: { accion: 'crear', nombre: 'Barba', es_servicio: true, precio: 30000 } }, CATALOGO)
      .producto.es_servicio, true);

  const repetido = sanearProducto({ producto: { accion: 'crear', nombre: 'shampoo', precio: 1 } }, CATALOGO);
  ok('lo que ya está en el catálogo se avisa', /Ya tenés «Shampoo»/.test(repetido.aviso ?? ''), true);

  const raros = sanearProducto({ producto: { accion: 'crear', nombre: 'X', precio: -5, costo: 'mucho', cantidad: Infinity } }, CATALOGO);
  ok('un número negativo o raro no pasa', [raros.producto.precio, raros.producto.costo, raros.producto.cantidad], [null, null, null]);
  ok('sin categoría, General', raros.producto.categoria, 'General');
}

// ═══════════════════════════════════════════════════════════
grupo('2 · Cambiar lo que ya está');
{
  const precio = sanearProducto({ producto: { accion: 'precio', producto_id: 'p-shampoo', precio: 40000 } }, CATALOGO);
  ok('un precio nuevo va al producto de verdad', [precio.producto.accion, precio.producto.producto_id], ['precio', 'p-shampoo']);
  ok('con su nombre del catálogo', precio.producto.nombre, 'Shampoo');
  ok('sin aviso', precio.aviso, null);

  const inventado = sanearProducto({ producto: { accion: 'precio', producto_id: 'p-nada', precio: 1 } }, CATALOGO);
  ok('un producto inventado no llega', inventado.producto.producto_id, null);
  ok('y se pide elegirlo', /No encontré ese producto/.test(inventado.aviso ?? ''), true);

  const aUnServicio = sanearProducto({ producto: { accion: 'stock', producto_id: 's-corte', cantidad: 3 } }, CATALOGO);
  ok('un servicio no lleva stock', /es un servicio: no lleva stock/.test(aUnServicio.aviso ?? ''), true);

  const entro = sanearProducto({ producto: { accion: 'stock', producto_id: 'p-shampoo', cantidad: 10 } }, CATALOGO);
  ok('stock que entra a un producto', [entro.producto.accion, entro.producto.cantidad, entro.aviso], ['stock', 10, null]);

  ok('una acción inventada es agregar',
    sanearProducto({ producto: { accion: 'borrar', nombre: 'Algo' } }, CATALOGO).producto.accion, 'crear');
}

// ═══════════════════════════════════════════════════════════
grupo('3 · Un cliente nuevo');
{
  const r = sanearFicha({ contraparte: ' Marta ', ficha: { telefono: ' 0981 234 567 ', notas: 'Prefiere los martes' } });
  ok('lo que está bien pasa entero', r.ficha, { nombre: 'Marta', telefono: '0981 234 567', notas: 'Prefiere los martes' });
  ok('sin aviso', r.aviso, null);
  ok('sin nombre, se pide', /No entendí el nombre/.test(sanearFicha({ ficha: { telefono: '0981' } }).aviso ?? ''), true);
  ok('sin nada, no se rompe', sanearFicha(null).ficha, { nombre: '', telefono: '', notas: '' });
}

console.log(`\n${fallos === 0 ? '✓' : '✗'} ${corridas - fallos}/${corridas} pruebas`);
process.exit(fallos === 0 ? 0 : 1);
