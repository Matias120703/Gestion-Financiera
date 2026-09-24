/**
 * La fase 0 de ganadería (24/09): sacar lo que le mentía al ganadero.
 *
 * El análisis de ganadería (Matías eligió arrancar por acá) encontró que un
 * ganadero leía ejemplos de soja y de silo, que su ayudante se llamaba
 * «vendedor», que el lote decía «Cobrado» a una venta que el frigorífico
 * todavía no pagó, que sus lotes estaban escondidos en «Más» y que el
 * catálogo del almacén le restaba dos veces el costo de un novillo.
 *
 * LO QUE IMPORTA
 *
 *   · que la jerga del ganadero no nombre nada del grano, en los dos idiomas;
 *   · que el ayudante sea el capataz y lo vendido se llame «Vendido»;
 *   · que la ficha no tenga catálogo y tenga los lotes en la barra;
 *   · que «por animale» no vuelva;
 *   · y que el Historial y Gastos no le digan otra cosa.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const RAIZ = path.join(__dirname, '..');

let fallos = 0;
let corridas = 0;

function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a}`);
}

/** Compila un .ts puro (solo `import type`) a CommonJS y lo carga, sin dejar archivos. */
function cargar(rel) {
  const archivo = path.join(RAIZ, rel);
  const salida = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    fileName: archivo,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, isolatedModules: true,
    },
  });
  const m = new Module(archivo, module);
  m.filename = archivo;
  m.paths = Module._nodeModulePaths(path.dirname(archivo));
  m.require = (id) => { throw new Error(`${rel} importa «${id}»: tiene que ser puro`); };
  m._compile(salida.outputText, archivo);
  return m.exports;
}

/** Todos los textos de un diccionario parcial, funciones incluidas (con argumentos de muestra). */
function textosDe(obj) {
  const salida = [];
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') salida.push(v);
    else if (typeof v === 'function') salida.push(String(v('X', 2, 'Y', 'Z')));
    else if (v && typeof v === 'object') salida.push(...textosDe(v));
  }
  return salida;
}

const { ganaderiaEs, ganaderiaPt } = cargar('src/i18n/textos/ganaderia.ts');
const { singularEs, singularPt } = cargar('src/i18n/textos/singular.ts');
const { fichaDe } = cargar('src/lib/rubros.ts');

console.log('\n── Las palabras del ganadero ─────────────────────────────────');
const DEL_GRANO = /zafr|silo|hect[aá]re|parcela|soja|cosech|grano|safra|talh[aã]o|colheit|gr[aã]o|armaz[eé]m/i;
for (const [idioma, dic] of [['es', ganaderiaEs], ['pt', ganaderiaPt]]) {
  const conGrano = textosDe(dic).filter((s) => DEL_GRANO.test(s));
  ok(`${idioma}: ningún texto del ganadero nombra el grano, el silo ni las hectáreas`, conGrano, []);
  ok(`${idioma}: el que se suma con el código es el capataz`, [dic.roles.vendedor, dic.pantallas.colVendedor], ['Capataz', 'Capataz']);
  ok(`${idioma}: lo que vendió se llama «Vendido», en la lista y en la tarjeta`,
    [dic.lotes.cobrado, dic.campanas.tarjeta.cobrado], ['Vendido', 'Vendido']);
  ok(`${idioma}: sin hectáreas, el reparto dice que va en partes iguales`,
    /iguales|iguais/.test(dic.gastosCampana.chip.guardadoRepartido('Gs 100', 3)), true);
}

console.log('\n── La ficha ──────────────────────────────────────────────────');
const g = fichaDe('ganaderia', 'emprendedor');
ok('habla con su jerga', g.jerga, 'ganaderia');
ok('sin el catálogo del almacén, que restaba dos veces', g.secciones['/productos'], false);
ok('con los lotes en la barra, no escondidos en «Más»', g.barra, ['/panel', '/lotes', '/gastos', '/vender']);
ok('y cada botón de la barra existe en su rubro', g.barra.every((h) => g.secciones[h]), true);
ok('sus ciclos son largos', g.ciclosLargos, true);
ok('al que le debe el frigorífico no le dice «Fiado»', [g.palabras.fiado, g.pt.palabras.fiado], ['Te deben', 'Te devem']);
ok('el agricultor sigue con la suya', fichaDe('agricultura', 'emprendedor').jerga, 'agricultura');

console.log('\n── Por cabeza, no «por animale» ──────────────────────────────');
ok('es: el singular de lo que escribe cada uno',
  ['cabezas', 'animales', 'unidades', 'bueyes', 'lotes', 'hectáreas', 'novillos'].map(singularEs),
  ['cabeza', 'animal', 'unidad', 'buey', 'lote', 'hectárea', 'novillo']);
ok('pt: o singular do que cada um escreve',
  ['cabeças', 'animais', 'bois', 'hectares', 'bezerrões'].map(singularPt),
  ['cabeça', 'animal', 'boi', 'hectare', 'bezerrão']);
{
  const es = fs.readFileSync(path.join(RAIZ, 'src/i18n/textos/es.ts'), 'utf8');
  const pt = fs.readFileSync(path.join(RAIZ, 'src/i18n/textos/pt.ts'), 'utf8');
  const rc = fs.readFileSync(path.join(RAIZ, 'src/i18n/textos/reportes-campo.ts'), 'utf8');
  ok('ningún «por» de la unidad le saca la «s» a mano',
    [es, pt, rc].some((f) => /por \$\{unidad\.replace\(\/s\$\//.test(f)), false);
}

console.log('\n── El Historial y Gastos ─────────────────────────────────────');
{
  const hist = fs.readFileSync(path.join(RAIZ, 'src/app/(app)/movimientos/page.tsx'), 'utf8');
  ok('en el campo, el Historial no muestra la ganancia neta del mes', /ciclosLargos \? \(/.test(hist), true);
  const gastos = fs.readFileSync(path.join(RAIZ, 'src/app/(app)/gastos/page.tsx'), 'utf8');
  ok('el ganadero arranca en «Otros», no en «Alimentación»',
    gastos.includes("categoriaPorDefecto={ctx.empresa.rubro === 'ganaderia' ? 'Otros' : null}"), true);
}

console.log('\n' + '═'.repeat(62));
if (fallos > 0) {
  console.log(`>>> ${fallos} DE ${corridas} COMPROBACIONES DE GANADERÍA FALLARON`);
  process.exit(1);
}
console.log(`>>> ${corridas} COMPROBACIONES DE GANADERÍA PASARON`);
process.exit(0);
