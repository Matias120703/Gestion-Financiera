/**
 * El editor de rutinas (098): /rutinas/[id].
 *
 * La base ya se prueba en rutinas.test.js y el lector de texto en
 * rutinas-texto.test.js. Acá va lo que hace la pantalla con eso, que es
 * donde se podía romper sin que ninguna de las dos se enterara:
 *
 *   · la carga NUNCA gana una unidad que el trainer no escribió («40»
 *     sigue siendo «40»): un «25» pensado en libras y leído como kilos
 *     lastima a alguien;
 *   · al guardar viajan los ids de cada día y de cada ejercicio (así los
 *     tildes del cliente y el historial de cargas no se pierden) y la
 *     versión que se abrió (así no se pisa lo que cambió otro);
 *   · «Salud y lesiones» se muestra pero no entra en lo que se guarda;
 *   · lo que queda en el celular se lee con cuidado: un dato roto o un
 *     navegador sin almacenamiento no rompen el editor.
 *
 * Las cuentas del editor (editor/modelo.ts, editor/borradorLocal.ts) no
 * tienen React: se transpilan en el momento con el TypeScript del proyecto
 * y se prueban de verdad. El resto se comprueba leyendo el código.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a.length > 140 ? a.slice(0, 137) + '...' : a);
}

const raiz = path.join(__dirname, '..');
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), 'utf8');

/** Transpila un .ts del proyecto y lo carga, con sus importaciones resueltas a mano. */
function cargarTs(ruta, importaciones = {}) {
  const js = ts.transpileModule(leer(ruta), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const modulo = { exports: {} };
  const pedir = (nombre) => {
    if (nombre in importaciones) return importaciones[nombre];
    throw new Error(`${ruta}: importación sin resolver en la prueba: ${nombre}`);
  };
  new Function('module', 'exports', 'require', js)(modulo, modulo.exports, pedir);
  return modulo.exports;
}

const E = cargarTs('src/lib/ejercicios-base.ts');
const R = cargarTs('src/lib/rutina-texto.ts', { './ejercicios-base': E });
const U = cargarTs('src/components/rutinas/panel/utiles.ts');
const M = cargarTs('src/components/rutinas/editor/modelo.ts', {
  '@/lib/rutina-texto': R, '@/lib/ejercicios-base': E, '../panel/utiles': U,
});

/** Lo que devuelve `rutina()` de la base, en chico. */
function rutinaDeLaBase() {
  const ej = (id, orden, nombre, extra = {}) => ({
    id, orden, ejercicio_id: `lib-${nombre}`, nombre, grupo: null, indicaciones: '', video_url: null,
    series: 4, reps: '10', carga: '40', descanso_seg: 90, nota: '', junto_al_anterior: false, ...extra,
  });
  return {
    id: 'r1', cliente_id: 'c1', cliente_nombre: 'Ana Ruiz', cliente_notas: 'Rodilla operada: nada de saltos',
    estado: 'vigente', nombre: 'Fuerza base', notas: 'Tomá agua', desde: '2026-09-01', hasta: null,
    semanas: 6, version: 3, updated_at: '2026-09-20T10:00:00Z',
    dias: [
      { id: 'd2', orden: 2, nombre: 'Día B', notas: '', ejercicios: [ej('e3', 1, 'Remo')] },
      {
        id: 'd1', orden: 1, nombre: 'Día A', notas: '10 min de bici', ejercicios: [
          ej('e2', 2, 'Estocadas', { junto_al_anterior: true, carga: '25 lb' }),
          ej('e1', 1, 'Sentadilla'),
        ],
      },
    ],
  };
}

const nombres = { rutina: 'Rutina', dia: (i) => `Día ${String.fromCharCode(65 + i)}` };

// ═══════════════════════════════════════════════════════════
console.log('\n── 1 · De la base al editor, y de vuelta ──');
{
  const base = M.desdeRutina(rutinaDeLaBase());
  ok('los días y los ejercicios quedan en su orden', base.dias.map((d) => [d.id, d.ejercicios.map((e) => e.id)]),
    [['d1', ['e1', 'e2']], ['d2', ['e3']]]);
  ok('la superserie se conserva', base.dias[0].ejercicios.map((e) => e.junto_al_anterior), [false, true]);

  const p = M.paraGuardar(base, nombres);
  ok('al guardar viajan los ids de cada día', p.dias.map((d) => d.id), ['d1', 'd2']);
  ok('y los de cada ejercicio', p.dias.map((d) => d.ejercicios.map((e) => e.id)), [['e1', 'e2'], ['e3']]);
  ok('el ejercicio va por su id de biblioteca, sin el nombre', p.dias[0].ejercicios[0],
    { id: 'e1', ejercicio_id: 'lib-Sentadilla', series: 4, reps: '10', carga: '40', descanso_seg: 90, nota: '', junto_al_anterior: false });
  ok('la carga viaja tal cual: «40» sin unidad sigue siendo «40»', p.dias.flatMap((d) => d.ejercicios.map((e) => e.carga)),
    ['40', '25 lb', '40']);
  ok('«Salud y lesiones» no entra en lo que se guarda', JSON.stringify(p).includes('Rodilla'), false);
  ok('lo que se guarda tiene las claves del contrato', Object.keys(p).sort(), ['dias', 'nombre', 'notas', 'semanas']);

  const nuevo = M.paraGuardar({
    nombre: '  ', notas: '', semanas: 99,
    dias: [{ clave: 'x', nombre: '', notas: '', ejercicios: [
      { clave: 'a', nombre: ' Plancha ', series: 3, reps: ' 45 s ', carga: '', descanso_seg: null, nota: '', junto_al_anterior: true },
    ] }],
  }, nombres);
  ok('sin nombre, la rutina y el día toman el del diccionario', [nuevo.nombre, nuevo.dias[0].nombre], ['Rutina', 'Día A']);
  ok('lo nuevo va sin id y por nombre', nuevo.dias[0].ejercicios[0],
    { nombre: 'Plancha', series: 3, reps: '45 s', carga: '', descanso_seg: null, nota: '', junto_al_anterior: false });
  ok('unas semanas fuera de rango no viajan', nuevo.semanas, null);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 2 · La carga nunca gana una unidad ──');
{
  const lib = [];
  const deRenglon = (l) => M.desdeLeido(R.leerRenglon(l), lib);
  ok('«40» sin unidad queda «40»', deRenglon('Press banca 4x10 40 90s').carga, '40');
  ok('«40kg» queda «40 kg»', deRenglon('Press banca 4x10 40kg 90s').carga, '40 kg');
  ok('«25 lbs» queda «25 lb», no kilos', deRenglon('Remo 3x12 25 lbs 1:30').carga, '25 lb');
  ok('el renglón rápido entero', (({ nombre, series, reps, carga, descanso_seg }) => [nombre, series, reps, carga, descanso_seg])(
    deRenglon('Press banca 4x10 40kg 90s')), ['Press banca', 4, '10', '40 kg', 90]);
  ok('una carga sin unidad se marca', ['40', '20-25', '40 kg', '25 lb', 'placa 7', 'peso corporal', 'banda roja', ''].map(M.cargaSinUnidad),
    [true, true, false, false, false, false, false, false]);
  ok('los botones de unidad escriben sobre el número', [R.conUnidad('40', 'kg'), R.conUnidad('40 kg', 'lb'), R.conUnidad('7', 'placa')],
    ['40 kg', '40 lb', 'placa 7']);
  ok('y sin número no inventan nada', R.conUnidad('', 'kg'), '');
  ok('el resumen de la tarjeta', M.resumenEjercicio({ ...deRenglon('Sentadilla 4 x 8-10 60 kg 2 min') }, 'series'), '4 × 8-10 · 60 kg · 2 min');
  ok('y el de una carga sin unidad, sin unidad', M.resumenEjercicio({ ...deRenglon('Remo 3x12 25') }, 'series'), '3 × 12 · 25');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 3 · El nombre del ejercicio y la biblioteca ──');
{
  const lib = [
    { id: 'L1', nombre: 'Sentadilla con barra', grupo: 'piernas', indicaciones: '', video_url: null, activo: true, usos: 3 },
    { id: 'L2', nombre: 'Remo con mancuerna', grupo: 'espalda', indicaciones: '', video_url: null, activo: false, usos: 0 },
  ];
  const vacio = { clave: 'k', nombre: '', series: null, reps: '', carga: '', descanso_seg: null, nota: '', junto_al_anterior: false };
  const a = M.conNombre(vacio, '  sentadilla   CON barra ', lib);
  ok('sin mirar mayúsculas ni espacios, es el de la biblioteca', [a.nombre, a.ejercicio_id], ['Sentadilla con barra', 'L1']);
  const b = M.conNombre(vacio, 'Remo con mancuerna', lib);
  ok('uno apagado va por nombre (la base lo prende)', [b.nombre, b.ejercicio_id], ['Remo con mancuerna', undefined]);
  const c = M.conNombre({ ...a, id: 'e9' }, 'Prensa', lib);
  ok('cambiarlo por otro suelta el de la biblioteca y conserva el renglón', [c.nombre, c.ejercicio_id, c.id], ['Prensa', undefined, 'e9']);
  const d = M.conNombre({ ...a, id: 'e9' }, 'SENTADILLA CON BARRA', lib);
  ok('el mismo con otras mayúsculas no renombra la biblioteca', [d.nombre, d.ejercicio_id], ['Sentadilla con barra', 'L1']);
  ok('los nombres nuevos para la lista, sin repetir', M.nombresNuevos(['sentadilla con barra', 'Prensa', 'prensa ', 'Remo con mancuerna'], lib), ['Prensa']);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 4 · Mover, duplicar, quitar ──');
{
  const ej = (clave, junto = false) => ({ clave, id: `id-${clave}`, nombre: clave, series: 3, reps: '10', carga: '', descanso_seg: null, nota: '', junto_al_anterior: junto });
  const r = { nombre: 'R', notas: '', semanas: null, dias: [{ clave: 'd', id: 'D', nombre: 'Día A', notas: '', ejercicios: [ej('A'), ej('B', true), ej('C')] }] };
  const orden = (x) => x.dias[0].ejercicios.map((e) => `${e.clave}${e.junto_al_anterior ? '+' : ''}`);

  ok('quitar el primero de una superserie deja al segundo encabezándola', orden(M.quitarEjercicio(r, 0, 0)), ['B', 'C']);
  ok('quitar el segundo no toca al resto', orden(M.quitarEjercicio(r, 0, 1)), ['A', 'C']);
  ok('subir uno «junto» al primer lugar lo suelta', orden(M.moverEjercicio(r, 0, 1, -1)), ['B', 'A', 'C']);
  ok('no se sube más allá del primero', orden(M.moverEjercicio(r, 0, 0, -1)), ['A', 'B+', 'C']);
  const dup = M.duplicarEjercicio(r, 0, 1);
  ok('la copia va abajo, suelta', orden(dup), ['A', 'B+', `${dup.dias[0].ejercicios[2].clave}`, 'C']);
  ok('y sin id: para la base es nueva', [dup.dias[0].ejercicios[2].id, dup.dias[0].ejercicios[2].nombre], [undefined, 'B']);
  ok('el primero nunca va «junto al anterior»', M.alternarJunto(r, 0, 0) === r, true);

  const dosDias = M.duplicarDia(r, 0, 'Día A (copia)');
  ok('duplicar un día: al lado, sin ids', [dosDias.dias.map((d) => d.id), dosDias.dias[1].ejercicios.map((e) => e.id)],
    [['D', undefined], [undefined, undefined, undefined]]);
  ok('mover un día', M.moverDia(dosDias, 1, -1).dias.map((d) => d.nombre), ['Día A (copia)', 'Día A']);
  ok('el último día no se borra', M.quitarDia(r, 0).dias.length, 1);

  let lleno = r;
  for (let i = 0; i < 40; i++) lleno = M.agregarEjercicios(lleno, 0, [ej(`n${i}`)]);
  ok('un día no pasa de 30 ejercicios', lleno.dias[0].ejercicios.length, 30);
  let muchos = r;
  for (let i = 0; i < 12; i++) muchos = M.agregarDia(muchos, `D${i}`);
  ok('una rutina no pasa de 10 días', muchos.dias.length, 10);

  const copia = M.sinIds(M.desdeRutina(rutinaDeLaBase()));
  ok('partir de la actual: ningún id, pero el ejercicio de la biblioteca sí',
    [copia.dias.map((d) => d.id), copia.dias[0].ejercicios.map((e) => [e.id, e.ejercicio_id])],
    [[undefined, undefined], [[undefined, 'lib-Sentadilla'], [undefined, 'lib-Estocadas']]]);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 5 · ¿Hay cambios? y lo que frena antes de guardar ──');
{
  const a = M.desdeRutina(rutinaDeLaBase());
  const b = JSON.parse(JSON.stringify(a));
  // El mismo ejercicio armado con las claves en otro orden no es un cambio.
  b.dias[0].ejercicios[0] = Object.fromEntries(Object.entries(b.dias[0].ejercicios[0]).reverse());
  ok('la misma rutina da la misma firma', M.firma(a) === M.firma(b), true);
  b.dias[0].ejercicios[0].carga = '42.5';
  ok('una carga distinta, no', M.firma(a) === M.firma(b), false);

  const vacia = M.rutinaVacia('Día A');
  ok('sin ejercicios no se guarda', M.validar(vacia), { tipo: 'sinEjercicios' });
  const larga = M.agregarEjercicios(vacia, 0, [{ clave: 'x', nombre: 'Remo', series: 3, reps: '10', carga: '25 lb por lado con banda roja', descanso_seg: null, nota: '', junto_al_anterior: false }]);
  ok('una carga de más de 24 letras frena (no se recorta)', M.validar(larga), { tipo: 'cargaLarga', dia: 0, ejercicio: 0 });
  const sinNombre = M.agregarEjercicios(vacia, 0, [{ clave: 'x', nombre: ' ', series: 3, reps: '10', carga: '', descanso_seg: null, nota: '', junto_al_anterior: false }]);
  ok('un ejercicio sin nombre frena', M.validar(sinNombre), { tipo: 'sinNombre', dia: 0, ejercicio: 0 });
  ok('una rutina bien, pasa', M.validar(a), null);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 6 · Lo que queda en el celular ──');
{
  const guardado = new Map();
  let roto = false;
  global.window = {
    localStorage: {
      getItem: (k) => { if (roto) throw new Error('SecurityError'); return guardado.has(k) ? guardado.get(k) : null; },
      setItem: (k, v) => { if (roto) throw new Error('QuotaExceededError'); guardado.set(k, String(v)); },
      removeItem: (k) => { if (roto) throw new Error('SecurityError'); guardado.delete(k); },
    },
  };
  const B = cargarTs('src/components/rutinas/editor/borradorLocal.ts', { '@/lib/rutina-texto': R, './modelo': M });

  ok('una clave por rutina y por negocio', [B.claveBorrador('E', 'R', null), B.claveBorrador('E', null, 'C'), B.claveBorrador('E', null, null)],
    ['orden:rutina-editor:E:R', 'orden:rutina-editor:E:nueva:C', 'orden:rutina-editor:E:nueva:plantilla']);
  const datos = M.desdeRutina(rutinaDeLaBase());
  B.guardarBorradorLocal('k', datos, 3);
  const vuelta = B.leerBorradorLocal('k');
  ok('ida y vuelta, igual', [M.firma(vuelta.datos) === M.firma(datos), vuelta.version], [true, 3]);
  B.borrarBorradorLocal('k');
  ok('borrado, ya no está', B.leerBorradorLocal('k'), null);

  guardado.set('roto', '{no es json');
  ok('un dato roto se ignora', B.leerBorradorLocal('roto'), null);
  guardado.set('viejo', JSON.stringify({ guardado: 'x', datos: { dias: 'no' } }));
  ok('uno con otra forma, también', B.leerBorradorLocal('viejo'), null);
  guardado.set('raro', JSON.stringify({ guardado: '2026-09-22T10:00:00Z', version: 1, datos: {
    nombre: 'R', notas: '', semanas: 99, dias: [{ nombre: 'Día A', notas: '', ejercicios: [
      { nombre: 'Remo', series: 50, reps: '10', carga: '40', descanso_seg: 5000, nota: '', junto_al_anterior: true },
      { nombre: '', reps: '10' },
    ] }],
  } }));
  const raro = B.leerBorradorLocal('raro');
  ok('los valores imposibles se sueltan y lo vacío se descarta',
    [raro.datos.semanas, raro.datos.dias[0].ejercicios.length, raro.datos.dias[0].ejercicios[0].series,
      raro.datos.dias[0].ejercicios[0].descanso_seg, raro.datos.dias[0].ejercicios[0].junto_al_anterior],
    [null, 1, null, null, false]);

  // La base sobre la que se editó viaja con la versión: es lo que permite
  // mezclar al recuperar (grupo 8). Sin versión no hay con qué comparar.
  B.guardarBorradorLocal('con-base', datos, 3, datos);
  ok('la base sobre la que se editó viaja con la versión', M.firma(B.leerBorradorLocal('con-base').base) === M.firma(datos), true);
  B.guardarBorradorLocal('sin-version', datos, null, datos);
  ok('sin versión, sin base', B.leerBorradorLocal('sin-version').base, null);

  roto = true;
  let tiro = false;
  try {
    B.guardarBorradorLocal('k', datos, 1);
    ok('sin almacenamiento, leer da nada', B.leerBorradorLocal('k'), null);
    B.borrarBorradorLocal('k');
  } catch { tiro = true; }
  ok('y nada rompe (navegación privada, sin espacio)', tiro, false);
  delete global.window;
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 7 · Lo que se comprueba leyendo el código ──');
{
  /** El código sin comentarios: lo que dicen los comentarios no cuenta. */
  const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const dir = 'src/components/rutinas/editor';
  const archivos = ['src/components/rutinas/EditorRutina.tsx', 'src/app/(app)/rutinas/[id]/page.tsx',
    ...fs.readdirSync(path.join(raiz, dir)).map((f) => `${dir}/${f}`)];
  const codigo = Object.fromEntries(archivos.map((a) => [a, sinComentarios(leer(a))]));
  const editor = codigo['src/components/rutinas/EditorRutina.tsx'];
  const hoja = codigo[`${dir}/HojaEjercicio.tsx`];
  const pagina = codigo['src/app/(app)/rutinas/[id]/page.tsx'];

  ok('guardar manda la versión que se abrió', /p_version:\s*rutinaId\s*\?\s*version\s*:\s*null/.test(editor), true);
  ok('y lo arma paraGuardar (con los ids), no a mano', /p_datos:\s*paraGuardar\(datos/.test(editor), true);
  ok('una sola llamada a guardar_rutina, y ningún autoguardado',
    [(editor.match(/'guardar_rutina'/g) || []).length, /useEffect\([^)]*guardar\(\)/.test(editor)], [1, false]);
  ok('el choque de versión se reconoce y ofrece recargar',
    [/Alguien cambió esta rutina/.test(editor), /window\.location\.reload\(\)/.test(editor)], [true, true]);
  ok('avisar al salir solo con cambios sin guardar',
    /if \(!sucio \|\| guardando\) return;\s*const avisar[\s\S]{0,200}addEventListener\('beforeunload'/.test(editor), true);
  ok('lo que queda en el celular se borra al guardar', /borrarBorradorLocal\(claveLocal\)[\s\S]{0,80}setRecuperable\(null\)/.test(editor), true);
  ok('las lesiones no se copian a la rutina', /cliente_notas|lesiones/.test(codigo[`${dir}/modelo.ts`]), false);

  // Ninguna unidad escrita a mano en el código del editor: la única forma de
  // que una carga tenga unidad es que la escriba el trainer o `conUnidad`.
  const conUnidadAMano = archivos.filter((a) => /['"`][^'"`\n]*\d?\s*\b(kg|kgs|lb|lbs|kilos?)\b[^'"`\n]*['"`]/i.test(codigo[a]));
  ok('ningún archivo del editor escribe «kg» o «lb» por su cuenta', conUnidadAMano, []);
  ok('los botones de unidad usan conUnidad', /conUnidad\(carga, u\)/.test(hoja), true);
  ok('el renglón rápido usa leerRenglon, y pegar texto leerRutina',
    [/leerRenglon\(/.test(codigo[`${dir}/RenglonRapido.tsx`]), /leerRutina\(/.test(codigo[`${dir}/PegarTexto.tsx`])], [true, true]);
  ok('lo no entendido se muestra', /noEntendidas/.test(codigo[`${dir}/PegarTexto.tsx`]), true);
  ok('el descanso ofrece 30 s, 60 s, 90 s, 2 min y 3 min', /DESCANSOS = \[30, 60, 90, 120, 180\]/.test(hoja), true);

  const localStorageSinTry = archivos.filter((a) => {
    const lineas = codigo[a].split('\n');
    return lineas.some((l, i) => /localStorage\./.test(l) && !lineas.slice(Math.max(0, i - 3), i).some((x) => /try \{/.test(x)));
  });
  ok('todo acceso a localStorage va con try/catch', localStorageSinTry, []);
  ok('nada de bg-white opaco (modo oscuro)', archivos.filter((a) => /\bbg-white(?!\/)/.test(codigo[a])), []);
  // Texto entre etiquetas («>Guardar</»), no una flecha (=>) ni una comparación.
  const textoSuelto = archivos.filter((a) => a.endsWith('.tsx')
    && /(?<![=-])>\s*[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}[^<{}()=;]*(<\/|\{)/.test(codigo[a]));
  ok('ningún texto suelto en los componentes (todo en el diccionario)', textoSuelto, []);

  ok('la página es dinámica y solo del rubro entrenamiento',
    [/dynamic = 'force-dynamic'/.test(pagina), /tieneSeccion\([^)]*'\/rutinas'\)/.test(pagina)], [true, true]);
  ok('sin loading.tsx (rompe Next 15)', fs.existsSync(path.join(raiz, 'src/app/(app)/rutinas/[id]/loading.tsx')), false);

  // Lo que encontró la revisión de las pantallas, para que no vuelva.
  const tarjeta = codigo[`${dir}/TarjetaEjercicio.tsx`];
  const pegar = codigo[`${dir}/PegarTexto.tsx`];
  const piezas = sinComentarios(leer('src/components/rutinas/panel/Piezas.tsx'));
  ok('la hoja del ejercicio no es un <form>: el «siguiente» del iPhone no la envía', /<form/.test(hoja), false);
  ok('el Enter pasa al campo que sigue, y en el nombre elige la sugerencia',
    [/onKeyDown=\{enterPasaAlSiguiente\}/.test(hoja), /onKeyDown=\{enterEnNombre\}/.test(hoja), /setNombre\(sugerencias\[0\]\.nombre\)/.test(hoja)],
    [true, true, true]);
  ok('la hoja se achica a lo que el teclado deja ver', /visualViewport/.test(piezas), true);
  ok('«sin guardar» va en su propio span y no se trunca', /<span className="shrink-0[^>]*>[^<]*\{e\.barra\.sinGuardar\}/.test(editor), true);
  ok('recuperar sobre una versión más nueva mezcla, no pisa', /mezclar\(recuperable\.base, recuperable\.datos, base\)/.test(editor), true);
  ok('y al recargar tras el choque se guarda la base junto con la versión',
    /guardarBorradorLocal\(u\.claveLocal, u\.datos, u\.version, u\.base\)/.test(editor), true);
  ok('guardar una plantilla o una próxima no saca del editor',
    [/router\.replace\(`\/rutinas\/\$\{r\.id\}\?dia=\$\{indiceDia\}`\)/.test(editor), /setGuardadaAca\(true\)/.test(editor)], [true, true]);
  ok('el resumen de la tarjeta («4 × 10 · 40 kg») también abre la hoja', (tarjeta.match(/onClick=\{onEditar\}/g) || []).length >= 2, true);
  ok('el textarea de «Pegar texto» no baja de los 16px de .campo (zoom del iPhone)',
    /text-\[1[0-5](?:\.\d+)?px\]/.test(pegar.match(/<textarea[\s\S]*?\/>/)?.[0] ?? ''), false);
  ok('las copias las hace la base como su próxima (p_borrador): el editor no arma copias',
    [/desdeCopia|copiar_rutina/.test(editor), /desdeCopia/.test(codigo[`${dir}/modelo.ts`])], [false, false]);
  ok('la página lee «copiada» y el editor lo dice arriba', [/busqueda\.copiada/.test(pagina), /copiada && rutina/.test(editor)], [true, true]);
  ok('un «Rutina» de respaldo en una cuenta en portugués se pide de nuevo',
    /rutina\.nombre === 'Rutina' && e\.datos\.nombrePorDefecto !== 'Rutina'/.test(editor), true);
  // Si solo se vaciara en `datos`, la copia abriría con un «sin guardar»
  // falso; y Guardar tiene que quedar a mano para ponerle «Treino» de un toque.
  ok('sin un «sin guardar» falso: el nombre se vacía en la base y en los datos, y Guardar queda a mano',
    [/return nombreDeRespaldo \? \{ \.\.\.r, nombre: '' \} : r;/.test(editor),
      (editor.match(/useState<RutinaEditor>\(inicio\)/g) || []).length,
      /const puedeGuardar = !guardando && \(sucio \|\| !rutinaId \|\| nombreDeRespaldo\);/.test(editor),
      (editor.match(/disabled=\{!puedeGuardar\}/g) || []).length],
    [true, 2, true, 2]);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 8 · Lo del celular sobre una versión que otro guardó (mezclar) ──');
{
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const vieja = M.desdeRutina(rutinaDeLaBase());
  // El trainer cambió la nota de Sentadilla y agregó Plancha al día B, sin guardar.
  const mia = copia(vieja);
  mia.dias[0].ejercicios[0].nota = 'Bajá lento';
  mia.dias[1].ejercicios.push({ clave: 'nuevo', nombre: 'Plancha', series: 3, reps: '45 s', carga: '', descanso_seg: null, nota: '', junto_al_anterior: false });
  // Mientras tanto, desde la agenda subieron la carga de Sentadilla y las reps de Remo.
  const nueva = copia(vieja);
  nueva.dias[0].ejercicios[0].carga = '42,5 kg';
  nueva.dias[1].ejercicios[0].reps = '12';

  const r = M.mezclar(vieja, mia, nueva);
  ok('la carga que subió el otro se queda: no vuelve a 40', r.dias[0].ejercicios[0].carga, '42,5 kg');
  ok('y la nota del trainer también', r.dias[0].ejercicios[0].nota, 'Bajá lento');
  ok('las repeticiones que cambió el otro, igual', r.dias[1].ejercicios[0].reps, '12');
  ok('lo que agregó el trainer sigue ahí', r.dias[1].ejercicios.map((e) => e.nombre), ['Remo', 'Plancha']);
  ok('los ids se conservan (los tildes del cliente y el historial de cargas viven ahí)',
    [r.dias.map((d) => d.id), r.dias[0].ejercicios.map((e) => e.id)], [['d1', 'd2'], ['e1', 'e2']]);

  const mia2 = copia(vieja);
  mia2.dias[0].ejercicios[0].carga = '45 kg';
  ok('si los dos tocaron la carga, queda la del trainer, que la tiene a la vista',
    M.mezclar(vieja, mia2, nueva).dias[0].ejercicios[0].carga, '45 kg');

  const nueva2 = copia(vieja);
  nueva2.dias[0].ejercicios = [nueva2.dias[0].ejercicios[0]];
  ok('lo que quitó el otro y el trainer no tocó, se va', M.mezclar(vieja, vieja, nueva2).dias[0].ejercicios.map((e) => e.id), ['e1']);
  const mia3 = copia(vieja);
  mia3.dias[0].ejercicios[1].carga = '30 lb';
  ok('pero si el trainer lo había cambiado, vuelve como renglón nuevo',
    M.mezclar(vieja, mia3, nueva2).dias[0].ejercicios.map((e) => [e.nombre, e.id === undefined]), [['Sentadilla', false], ['Estocadas', true]]);

  const nueva3 = copia(vieja);
  nueva3.dias[1].ejercicios.push({ clave: 'e9', id: 'e9', ejercicio_id: 'lib-Prensa', nombre: 'Prensa', series: 3, reps: '10', carga: '', descanso_seg: null, nota: '', junto_al_anterior: false });
  ok('lo que agregó el otro se suma al final', M.mezclar(vieja, mia, nueva3).dias[1].ejercicios.map((e) => e.nombre), ['Remo', 'Plancha', 'Prensa']);

  const x = M.mezclar(vieja, { ...vieja, nombre: 'Fuerza 2' }, { ...vieja, semanas: 8 });
  ok('el nombre y las semanas se mezclan campo por campo', [x.nombre, x.semanas], ['Fuerza 2', 8]);
  ok('sin nada cambiado de ningún lado, queda igual', M.firma(M.mezclar(vieja, vieja, vieja)) === M.firma(vieja), true);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 9 · Los textos, en los dos idiomas ──');
{
  const { rutinasEditorEs: es, rutinasEditorPt: pt } = cargarTs('src/i18n/textos/rutinas-editor.ts');
  const hojas = (o, ruta = '') => Object.entries(o).flatMap(([k, v]) =>
    (v && typeof v === 'object' && !Array.isArray(v) ? hojas(v, `${ruta}${k}.`) : [[`${ruta}${k}`, v]]));
  const claves = (o) => hojas(o).map(([k]) => k).sort();
  ok('el portugués tiene las mismas claves', claves(pt), claves(es));
  const vacios = [];
  for (const [nombre, t] of [['es', es], ['pt', pt]]) {
    for (const [k, v] of hojas(t)) {
      const texto = typeof v === 'function' ? v('Ana', 'x') : Array.isArray(v) ? v.join('') : v;
      if (typeof texto !== 'string' || !texto.trim()) vacios.push(`${nombre}:${k}`);
    }
  }
  ok('ningún texto vacío', vacios, []);
  ok('el español habla de vos', [es.hoja.faltaNombre, es.renglon.noEntendi.includes('Empezá'), es.avisos.vigente('Ana').includes('guardás')],
    ['Escribí el nombre del ejercicio.', true, true]);
  ok('los días por defecto', [es.dias.porDefecto(0), es.dias.porDefecto(1), pt.dias.porDefecto(0)], ['Día A', 'Día B', 'Treino A']);
  ok('nadie es «alumno» ni va a «clase»', hojas(es).some(([, v]) => /alumn|\bclases?\b/i.test(typeof v === 'function' ? v('Ana', 'x') : String(v))), false);
}

console.log(fallos === 0 ? `\n>>> TODAS LAS PRUEBAS PASARON (${corridas} comprobaciones)` : `\n>>> ${fallos} DE ${corridas} FALLARON`);
process.exit(fallos ? 1 : 0);
