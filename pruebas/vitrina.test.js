/**
 * La vitrina de la portada (24/09): «Orden se transforma según lo que hacés».
 *
 * Lo que importa acá:
 *
 *   · cada chip muestra SOLO los planes que su rubro puede comprar, los mismos
 *     de `fichaDe(rubro).planes` (espejo de `planes_de_rubro()`, 102), en el
 *     mismo orden. Mostrarle Premium a un profe es venderle algo que al pagar
 *     no existe;
 *   · los precios salen de las filas que manda la página: el grande en
 *     guaraníes, el «≈ US$» solo si hay precio en guaraníes al lado, los meses
 *     de regalo calculados, el «desde» y el vendedor extra solo en Premium;
 *   · la prueba arranca en el plan que dice `plan_de_prueba()`;
 *   · el botón de la prueba lleva al alta con el rubro ya elegido, y cada
 *     rubro de la lista de alta tiene su chip;
 *   · cada rubro tiene su mini pantalla, su titular y sus tres beneficios en
 *     español y en portugués, y los textos de cada plan que compra;
 *   · los números de ejemplo de las pantallas cierran entre sí (lo que dice
 *     la vitrina no puede ser una cuenta mal hecha);
 *   · el teclado se mueve entre los chips como en un grupo de radio.
 *
 * NO usa `.compilado/`: compila acá mismo, con el compilador de TypeScript
 * del proyecto, `vitrina-datos.ts`, `textos/vitrina.ts` y `rubros.ts`. Los
 * tres no pueden importar nada en tiempo de ejecución (solo tipos): si alguno
 * lo hace, la carga falla y la prueba lo dice.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const RAIZ = path.join(__dirname, '..');

/** Compila un .ts del proyecto a CommonJS y lo carga, sin dejar archivos. */
function cargar(rel) {
  const archivo = path.join(RAIZ, rel);
  const fuente = fs.readFileSync(archivo, 'utf8');
  const salida = ts.transpileModule(fuente, {
    fileName: archivo,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, isolatedModules: true,
    },
  });
  if (salida.diagnostics && salida.diagnostics.length > 0) {
    throw new Error(`${rel} no compila: ${ts.flattenDiagnosticMessageText(salida.diagnostics[0].messageText, '\n')}`);
  }
  const m = new Module(archivo, module);
  m.filename = archivo;
  m.paths = Module._nodeModulePaths(path.dirname(archivo));
  m.require = (id) => {
    throw new Error(`${rel} importa «${id}» en tiempo de ejecución: tiene que ser puro (solo \`import type\`)`);
  };
  m._compile(salida.outputText, archivo);
  return m.exports;
}

const D = cargar('src/components/portada/vitrina-datos.ts');
const { vitrinaEs, vitrinaPt } = cargar('src/i18n/textos/vitrina.ts');
const { fichaDe, LISTA_RUBROS } = cargar('src/lib/rubros.ts');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a.length > 140 ? a.slice(0, 137) + '...' : a);
}

const fichaDeClave = (c) => fichaDe(D.rubroDeClave(c), D.tipoDeCuenta(c));
const IDIOMAS = { es: vitrinaEs, pt: vitrinaPt };

// Las filas de `lista_precios` de las migraciones 020, 050 y 077 (como las
// manda la página: el importe ya como número).
const PYG = [
  { tipo: 'emprendedor', plan: 'basico', periodo: 'mensual', importe: 110000 },
  { tipo: 'emprendedor', plan: 'basico', periodo: 'anual', importe: 1210000 },
  { tipo: 'emprendedor', plan: 'pro', periodo: 'mensual', importe: 190000 },
  { tipo: 'emprendedor', plan: 'pro', periodo: 'anual', importe: 2090000 },
  { tipo: 'emprendedor', plan: 'negocio', periodo: 'mensual', importe: 250000 },
  { tipo: 'personal', plan: 'pro', periodo: 'mensual', importe: 60000 },
  { tipo: 'personal', plan: 'pro', periodo: 'anual', importe: 660000 },
];
const USD = [
  { tipo: 'emprendedor', plan: 'basico', periodo: 'mensual', importe: 19 },
  { tipo: 'emprendedor', plan: 'pro', periodo: 'mensual', importe: 32 },
  { tipo: 'emprendedor', plan: 'negocio', periodo: 'mensual', importe: 42 },
  { tipo: 'personal', plan: 'pro', periodo: 'mensual', importe: 11 },
];
const planesPorRubro = D.planesPorRubroDe(fichaDe);
const datos = { planesPorRubro, preciosPYG: PYG, referenciaUSD: USD, precioPorVendedor: 60000 };

// ═══════════════════════════════════════════════════════════
console.log('\n── 1 · Los chips y los rubros ──');
{
  ok('siete chips, en el orden de la portada', D.CLAVES_VITRINA,
    ['comercio', 'servicios', 'clases', 'entrenamiento', 'agricultura', 'ganaderia', 'personal']);
  ok('cada rubro del alta tiene su chip, y ningún chip inventa un rubro',
    D.CLAVES_VITRINA.map(D.rubroDeClave).filter(Boolean).sort(),
    LISTA_RUBROS.map((f) => f.clave).sort());
  ok('la personal es otro tipo de cuenta, sin rubro', [D.tipoDeCuenta('personal'), D.rubroDeClave('personal')], ['personal', null]);
  ok('el campo es un negocio', D.tipoDeCuenta('agricultura'), 'emprendedor');
  ok('en español arranca en comercio', D.claveInicial('es'), 'comercio');
  ok('en portugués arranca en el campo', D.claveInicial('pt'), 'agricultura');
  ok('esClaveVitrina acepta las siete y nada más',
    [...D.CLAVES_VITRINA.map(D.esClaveVitrina), D.esClaveVitrina('lotes'), D.esClaveVitrina(null)],
    [true, true, true, true, true, true, true, false, false]);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 2 · El botón de la prueba ──');
{
  for (const c of D.CLAVES_VITRINA) {
    const esperado = c === 'personal' ? '/crear?para=personal' : `/crear?para=negocio&rubro=${c}`;
    ok(`${c} → ${esperado}`, D.enlaceDePrueba(c), esperado);
  }
  ok('los días: 8 el negocio, 5 la personal',
    [D.diasDePrueba('clases', { negocio: 8, personal: 5 }), D.diasDePrueba('personal', { negocio: 8, personal: 5 })], [8, 5]);
  ok('la racha del descuento: la del negocio o la personal',
    [D.rachaDelDescuento('ganaderia', { negocio: 8, personal: 5 }), D.rachaDelDescuento('personal', { negocio: 8, personal: 5 })], [8, 5]);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 3 · Los planes de cada rubro son los de su ficha ──');
{
  for (const c of D.CLAVES_VITRINA) {
    const ficha = [...fichaDeClave(c).planes];
    ok(`${c}: el respaldo es igual a la ficha`, [...D.PLANES_POR_DEFECTO[c]], ficha);
    ok(`${c}: planesPorRubroDe(fichaDe)`, planesPorRubro[c], ficha);
    ok(`${c}: la vitrina muestra exactamente esos`, D.planesDeLaVitrina(c, datos).map((t) => t.plan), ficha);
    ok(`${c}: sin la lista de la página, los mismos`,
      D.planesDeLaVitrina(c, { ...datos, planesPorRubro: null }).map((t) => t.plan), ficha);
    // plan_de_prueba (102): Pro si lo ofrece; si no, el más alto de su lista.
    const prueba = ficha.includes('pro') ? 'pro' : ficha[ficha.length - 1];
    ok(`${c}: la prueba arranca en ${prueba}`, D.planesDeLaVitrina(c, datos).filter((t) => t.conEsteProbas).map((t) => t.plan), [prueba]);
  }
  ok('clases y trainer: solo Básico', [planesPorRubro.clases, planesPorRubro.entrenamiento], [['basico'], ['basico']]);
  ok('campo y ganadería: Básico y Pro', [planesPorRubro.agricultura, planesPorRubro.ganaderia], [['basico', 'pro'], ['basico', 'pro']]);
  ok('Premium solo en comercio y servicios',
    D.CLAVES_VITRINA.filter((c) => planesPorRubro[c].includes('negocio')), ['comercio', 'servicios']);
  ok('planDePrueba de una lista vacía', D.planDePrueba([]), null);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 4 · Los precios ──');
{
  const comercio = D.planesDeLaVitrina('comercio', datos);
  ok('comercio: guaraníes por mes', comercio.map((t) => t.mensual), [110000, 190000, 250000]);
  ok('comercio: referencia en dólares', comercio.map((t) => t.referenciaUSD), [19, 32, 42]);
  ok('comercio: meses de regalo al año (11 meses)', comercio.map((t) => t.mesesDeRegalo), [1, 1, 0]);
  ok('comercio: «desde» solo en Premium', comercio.map((t) => t.desde), [false, false, true]);
  ok('comercio: el vendedor extra solo en Premium', comercio.map((t) => t.porVendedor), [null, null, 60000]);

  const campo = D.planesDeLaVitrina('agricultura', datos);
  ok('campo: sin Premium no hay vendedor extra ni «desde»',
    campo.map((t) => [t.plan, t.desde, t.porVendedor]), [['basico', false, null], ['pro', false, null]]);

  const personal = D.planesDeLaVitrina('personal', datos);
  ok('personal: su precio, no el del negocio', personal.map((t) => [t.plan, t.mensual, t.anual, t.referenciaUSD, t.mesesDeRegalo]),
    [['pro', 60000, 660000, 11, 1]]);

  const profe = D.planesDeLaVitrina('clases', datos);
  ok('profe: Básico a su precio', profe.map((t) => [t.plan, t.mensual, t.referenciaUSD, t.conEsteProbas]), [['basico', 110000, 19, true]]);

  // Sin la fila en guaraníes no se muestra la referencia: sería mostrar lo que no se cobra.
  const sinGs = D.planesDeLaVitrina('comercio', { ...datos, preciosPYG: [] });
  ok('sin precio en guaraníes: ni precio ni «≈ US$» ni regalo',
    sinGs.map((t) => [t.mensual, t.referenciaUSD, t.mesesDeRegalo]), [[null, null, 0], [null, null, 0], [null, null, 0]]);
  ok('sin precio por vendedor, Premium no inventa uno',
    D.planesDeLaVitrina('servicios', { ...datos, precioPorVendedor: null }).map((t) => t.porVendedor), [null, null, null]);
  ok('mesesDeRegalo: dos meses si el año sale 10', D.mesesDeRegalo(100, 1000), 2);
  ok('mesesDeRegalo: nunca negativo', D.mesesDeRegalo(100, 1500), 0);
  ok('mesesDeRegalo: sin precio, cero', [D.mesesDeRegalo(null, 1000), D.mesesDeRegalo(0, 1000), D.mesesDeRegalo(100, null)], [0, 0, 0]);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 5 · El teclado en los chips ──');
{
  ok('flecha derecha: el siguiente', D.claveConTecla('comercio', 'ArrowRight'), 'servicios');
  ok('flecha abajo: igual que la derecha', D.claveConTecla('clases', 'ArrowDown'), 'entrenamiento');
  ok('desde el último, da la vuelta', D.claveConTecla('personal', 'ArrowRight'), 'comercio');
  ok('flecha izquierda desde el primero, al último', D.claveConTecla('comercio', 'ArrowLeft'), 'personal');
  ok('flecha arriba: el anterior', D.claveConTecla('agricultura', 'ArrowUp'), 'entrenamiento');
  ok('Inicio y Fin', [D.claveConTecla('ganaderia', 'Home'), D.claveConTecla('servicios', 'End')], ['comercio', 'personal']);
  ok('otra tecla no mueve nada', [D.claveConTecla('comercio', 'a'), D.claveConTecla('comercio', 'Tab')], [null, null]);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 6 · Los textos, en los dos idiomas ──');
{
  // La misma forma en los dos: ninguna clave de más ni de menos.
  const forma = (o) => (Array.isArray(o) ? o.map(forma)
    : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, forma(o[k])]))
      : typeof o);
  ok('español y portugués tienen la misma forma', forma(vitrinaPt), forma(vitrinaEs));

  const PANTALLAS = {
    comercio: 'Comercio', servicios: 'Servicios', clases: 'Clases', entrenamiento: 'Entrenamiento',
    agricultura: 'Campo', ganaderia: 'Ganaderia', personal: 'Personal',
  };
  const elegi = fs.readFileSync(path.join(RAIZ, 'src/components/portada/ElegiTuRubro.tsx'), 'utf8');

  for (const [idioma, v] of Object.entries(IDIOMAS)) {
    for (const c of D.CLAVES_VITRINA) {
      const r = v.rubros[c];
      ok(`${idioma} ${c}: chip y titular`, Boolean(r && r.chip.trim() && r.titulo.trim()), true);
      ok(`${idioma} ${c}: tres beneficios, distintos y de una línea`,
        [r.beneficios.length, new Set(r.beneficios).size, r.beneficios.every((b) => b.trim() && !b.includes('\n') && b.length <= 110)],
        [3, 3, true]);
      ok(`${idioma} ${c}: su mini pantalla tiene resumen para el lector de pantalla`,
        typeof v.pantallas[c].resumen === 'string' && v.pantallas[c].resumen.length > 40, true);
      for (const plan of fichaDeClave(c).planes) {
        const tx = v.planes[c][plan];
        ok(`${idioma} ${c}: textos propios del plan ${plan}`,
          Boolean(tx && tx.para.trim() && tx.puntos.length >= 3 && tx.puntos.every((x) => x.trim())), true);
      }
      ok(`${idioma} ${c}: no hay textos de planes que el rubro no compra`,
        Object.keys(v.planes[c]).filter((p) => !fichaDeClave(c).planes.includes(p)), []);
    }
    const todo = JSON.stringify(v);
    ok(`${idioma}: nada de «cinco hojas» (el Excel cambia por rubro desde la 106)`, /cinco (hojas|abas)/i.test(todo), false);
    ok(`${idioma}: nada de «sin señal» (no se carga sin conexión)`, /sin señal|sem sinal/i.test(todo), false);
    ok(`${idioma}: nada de «quién ve los costos lo decidís vos» (todos entran como vendedor y ninguna pantalla cambia el rol)`, /qui[eé]n ve los costos|quem v[eê] os custos/i.test(todo), false);
    ok(`${idioma}: nada de «martes 12 de agosto» (en 2026 es miércoles)`, /12 de ag/i.test(todo), false);
    ok(`${idioma}: el Básico de un comercio no promete agenda`,
      v.planes.comercio.basico.puntos.some((x) => /agenda/i.test(x)), false);
    ok(`${idioma}: las deudas con vencimiento no son solo de Pro`,
      v.planes.comercio.pro.puntos.some((x) => /deuda|dívida/i.test(x)), false);
    ok(`${idioma}: el botón dice los días`, v.probar(8).includes('8'), true);
  }

  for (const c of D.CLAVES_VITRINA) {
    const archivo = `src/components/portada/pantallas/${PANTALLAS[c]}.tsx`;
    const fuente = fs.existsSync(path.join(RAIZ, archivo)) ? fs.readFileSync(path.join(RAIZ, archivo), 'utf8') : '';
    ok(`${c}: tiene su pantalla (${archivo})`, fuente.includes(`export function Pantalla${PANTALLAS[c]}(`), true);
    ok(`${c}: la pantalla lee sus propios textos`, fuente.includes(`v.pantallas.${c}`), true);
    const enElSwitch = c === 'comercio'
      ? /default: return <PantallaComercio /.test(elegi)
      : new RegExp(`case '${c}': return <Pantalla${PANTALLAS[c]} `).test(elegi);
    ok(`${c}: ElegiTuRubro la muestra`, enElSwitch, true);
  }
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 7 · Los números de ejemplo cierran ──');
{
  const n = (s) => Number(String(s).replace(/[^\d]/g, ''));
  for (const [idioma, v] of Object.entries(IDIOMAS)) {
    const com = v.pantallas.comercio;
    const [vendido, merca, gastos] = com.filas.map((f) => n(f.valor));
    ok(`${idioma} comercio: vendido − mercadería − gastos = te quedó`, vendido - merca - gastos, n(com.monto));

    const per = v.pantallas.personal;
    const [entro, ...resta] = per.filas.map((f) => n(f.valor));
    ok(`${idioma} personal: el detalle da lo disponible`, entro - resta.reduce((a, b) => a + b, 0), n(per.monto));
    ok(`${idioma} personal: por día, en 30 días (redondeado a mil)`, Math.floor(n(per.monto) / 30 / 1000) * 1000, n(per.porDia));

    // Un solo lote de muestra desde la fase 0 de ganadería (24/09): el
    // segundo prometía un resultado que un encierre de 2026 no da.
    ok(`${idioma} ganadería: un solo lote de muestra`, v.pantallas.ganaderia.lista.length, 1);
    for (const [i, cabezas] of [[0, 40]]) {
      const l = v.pantallas.ganaderia.lista[i];
      ok(`${idioma} ganadería ${l.nombre}: cobrado − puesto = resultado`, n(l.cobrado) - n(l.puesto), n(l.resultado));
      ok(`${idioma} ganadería ${l.nombre}: resultado por cabeza`, n(l.resultado) / cabezas, n(l.porCabeza));
      ok(`${idioma} ganadería ${l.nombre}: dice las cabezas`, l.detalle.startsWith(`${cabezas} `), true);
    }

    const campo = v.pantallas.agricultura;
    const [costo, cobrado, resultado, cosechado] = campo.filas.map((f) => n(f.valor));
    ok(`${idioma} campo: 50 ha a US$ 308/ha`, costo, 50 * 308);
    ok(`${idioma} campo: 742 kg/ha a US$ 415/t cubren los US$ 308/ha`, Math.round(742 * 415 / 1000), 308);
    ok(`${idioma} campo: 742 kg/ha son 12,4 sacas`, Math.round(742 / 60 * 10) / 10, 12.4);
    ok(`${idioma} campo: 120.000 kg a US$ 415/t`, 120000 * 415 / 1000, cobrado);
    ok(`${idioma} campo: cobrado − costo = resultado`, cobrado - costo, resultado);
    ok(`${idioma} campo: resultado por hectárea`, resultado / 50, n(campo.resultadoHa));
    ok(`${idioma} campo: cosechado − vendido = lo del silo`, cosechado - 120000, n(campo.silo));
    ok(`${idioma} campo: 3.000 kg/ha son 50 sacas`, [cosechado / 50, cosechado / 50 / 60], [3000, 50]);
    ok(`${idioma} campo: la tonelada salió US$ 103`, Math.round(costo / (cosechado / 1000)), 103);

    const cl = v.pantallas.clases;
    ok(`${idioma} clases: 3 alumnos deben Gs. 450 mil`, [cl.teDeben.startsWith('3 '), cl.porCobrarMonto.includes('450')], [true, true]);
  }
}

console.log(`\n${corridas} comprobaciones, ${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
