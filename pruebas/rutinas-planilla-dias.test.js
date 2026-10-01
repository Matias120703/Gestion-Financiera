/**
 * Una planilla de varios días y varias hojas (30/09): «se carga todo para un día».
 *
 * Matías subió la planilla de un trainer (hipertrofia + MMA) y Orden decía
 * «Entendí 13 días y 39 ejercicios»: mezclaba la hoja de la rutina con el
 * registro de series, el progreso corporal, el resumen y la guía, rompía la
 * «Semana tipo» en días raros, avisaba fechas y «500 filas» que no eran, y
 * la revisión no dejaba usar nada (más de 10 días). Lo que pidió: «que al
 * subir la planilla se acomode automáticamente para todos los días, así como
 * tiene la planilla; si la planilla es de lunes a domingo, que esos días se
 * creen». El progreso corporal va aparte.
 *
 * Acá se arma esa planilla EN MEMORIA con exceljs, celda por celda y con
 * sus celdas combinadas (no hay archivos del usuario en el repo), y
 * dieciséis formas más de planillas de trainers (es y pt). Se comprueba de
 * punta a punta: las hojas elegidas, los días con sus nombres y sus
 * ejercicios, que no salgan avisos falsos ni renglones «no entendidos», lo
 * que hace el editor con eso (todos los días, uno por uno) y lo que ve el
 * alumno (el día que le toca nunca es uno sin ejercicios).
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const ExcelJS = require('exceljs');
const P = require('../.compilado/planilla.js');
const X = require('../.compilado/planilla-xlsx.js');
const RP = require('../.compilado/rutina-planilla.js');
const R = require('../.compilado/rutina-texto.js');
const E = require('../.compilado/ejercicios-base.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a.length > 140 ? a.slice(0, 137) + '...' : a);
}

const raiz = path.join(__dirname, '..');
/** Un fuente del proyecto, con los saltos de línea normalizados (los worktrees tienen CRLF). */
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), 'utf8').replace(/\r\n/g, '\n');

/** Transpila un .ts del proyecto (sin React) y lo carga, con sus importaciones resueltas a mano. */
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
const U = cargarTs('src/components/rutinas/panel/utiles.ts');
const M = cargarTs('src/components/rutinas/editor/modelo.ts', { '@/lib/rutina-texto': R, '@/lib/ejercicios-base': E, '../panel/utiles': U });
const T = cargarTs('src/components/rutinas/publico/tildes.ts');
const { rutinasEditorEs: es, rutinasEditorPt: pt } = cargarTs('src/i18n/textos/rutinas-editor.ts', { './planilla': cargarTs('src/i18n/textos/planilla.ts') });
const { rutinasComunEs } = cargarTs('src/i18n/textos/rutinas-comun.ts');

// ─────────────────────────── cómo se arman las planillas ───────────────────────────

const col = (letra) => letra.split('').reduce((n, x) => n * 26 + x.charCodeAt(0) - 64, 0);
const b = (t) => ({ b: t });
const fecha = (y, m, d, fmt = 'dd/mm/yyyy') => ({ d: [y, m, d], fmt });
/** Pone un valor: texto o número, {b} negrita, {d} fecha con formato, {f, r} fórmula con su resultado, {n, fmt} número con formato. */
function poner(c, v) {
  if (v === null || v === undefined) return;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('b' in v) { poner(c, v.b); c.font = { bold: true }; return; }
    if (v.d) { c.value = new Date(Date.UTC(v.d[0], v.d[1] - 1, v.d[2])); c.numFmt = v.fmt; return; }
    if ('f' in v) { c.value = v.r === undefined ? { formula: v.f } : { formula: v.f, result: v.r }; if (v.fmt) c.numFmt = v.fmt; return; }
    if ('n' in v) { c.value = v.n; c.numFmt = v.fmt; return; }
  }
  c.value = v;
}
function fila(ws, r, desde, valores) {
  valores.forEach((v, i) => poner(ws.getRow(r).getCell(col(desde) + i), v));
}
const celda = (ws, dir, v) => poner(ws.getCell(dir), v);
/** Un título combinado a lo ancho, en negrita. */
function titulo(ws, r, desde, hasta, texto) {
  celda(ws, `${desde}${r}`, b(texto));
  ws.mergeCells(`${desde}${r}:${hasta}${r}`);
}
const ENC = ['#', 'Ejercicio', 'Series', 'Reps', 'Descanso', 'Notas'];
/** Título combinado + encabezado + ejercicios [nombre, series, reps, carga, descanso, nota]. Devuelve la fila libre siguiente (deja una vacía). */
function bloque(ws, r, t, ejs, { desde = 'A', hasta = 'F', enc = ENC, fmt = (e, i) => [i + 1, e[0], e[1], e[2], e[4], e[5] || null] } = {}) {
  titulo(ws, r, desde, hasta, t);
  fila(ws, r + 1, desde, enc.map(b));
  ejs.forEach((e, i) => fila(ws, r + 2 + i, desde, fmt(e, i)));
  return r + 2 + ejs.length + 1;
}
async function libroDe(armar) {
  const wb = new ExcelJS.Workbook();
  armar(wb);
  const libro = await X.leerXlsx(new Uint8Array(await wb.xlsx.writeBuffer()));
  if (libro.error) throw new Error(`no se pudo leer: ${libro.error}`);
  return libro;
}

/** Un ejercicio en corto: [nombre, series, reps, carga, descanso, nota]. */
const corto = (e) => [e.nombre, e.series, e.reps, e.carga, e.descanso_seg, e.nota];
const resumen = (res) => res.leida.dias.map((d) => [d.nombre, d.ejercicios.length]);
const usadas = (res) => res.hojas.filter((h) => h.usada).map((h) => h.nombre);
const codigos = (res) => res.avisos.map((a) => a.codigo);

// Los ejercicios de las planillas de prueba (es / pt): [nombre, series, reps, carga, descanso, nota].
const ES = {
  pierna: [['Sentadilla con barra', 4, '8-10', '60 kg', '2 min', 'Profundidad paralela'], ['Prensa 45°', 3, '12', '120 kg', '90 s', ''],
    ['Peso muerto rumano', 3, '10', '50 kg', '2 min', 'Espalda neutra'], ['Sillón de cuádriceps', 3, '12-15', '35 kg', '60 s', ''],
    ['Camilla femoral', 3, '12', '30 kg', '60 s', ''], ['Elevación de talones de pie', 4, '15', '40 kg', '45 s', 'Pausa arriba']],
  empuje: [['Press banca plano', 4, '6-8', '70 kg', '2-3 min', 'Principal del día'], ['Press inclinado con mancuernas', 3, '8-10', '24 kg', '2 min', ''],
    ['Aperturas en polea', 3, '12-15', '10 kg', '60 s', ''], ['Press militar con barra', 3, '8', '40 kg', '2 min', ''],
    ['Elevaciones laterales', 3, '15', '8 kg', '60 s', 'Sin balanceo'], ['Fondos en paralelas', 3, 'al fallo', 'peso corporal', '90 s', '']],
  tiron: [['Dominadas', 4, '6-8', 'peso corporal', '2 min', ''], ['Remo con barra', 4, '8-10', '60 kg', '2 min', 'Torso a 45°'],
    ['Jalón al pecho', 3, '10-12', '50 kg', '90 s', ''], ['Remo con mancuerna', 3, '10', '26 kg', '90 s', 'Cada brazo'],
    ['Face pull', 3, '15', '15 kg', '60 s', ''], ['Curl con barra', 3, '10', '30 kg', '60 s', '']],
  hombro: [['Press militar con mancuernas', 4, '8-10', '18 kg', '2 min', ''], ['Elevaciones laterales', 4, '12-15', '8 kg', '60 s', ''],
    ['Pájaros', 3, '15', '6 kg', '60 s', ''], ['Encogimientos', 3, '12', '30 kg', '60 s', ''], ['Plancha', 3, '45 s', '', '45 s', 'Core firme']],
  brazos: [['Curl con barra Z', 4, '10', '25 kg', '60 s', ''], ['Curl martillo', 3, '12', '12 kg', '60 s', ''],
    ['Extensión de tríceps en polea', 4, '12', '25 kg', '60 s', ''], ['Press francés', 3, '10', '20 kg', '90 s', 'Codos cerrados'],
    ['Crunch en polea', 3, '15', '30 kg', '45 s', '']],
  gluteo: [['Hip thrust', 4, '10', '80 kg', '2 min', 'Pausa de 1 s arriba'], ['Sentadilla búlgara', 3, '10 c/pierna', '12 kg', '90 s', ''],
    ['Patada de glúteo en polea', 3, '15', '10 kg', '60 s', ''], ['Abducción en máquina', 3, '20', '40 kg', '45 s', ''],
    ['Peso muerto sumo', 3, '8', '70 kg', '2 min', '']],
  core: [['Plancha', 3, '45 s', '', '30 s', ''], ['Plancha lateral', 3, '30 s', '', '30 s', 'Cada lado'], ['Rueda abdominal', 3, '10', '', '60 s', ''],
    ['Bird dog', 3, '12', '', '30 s', 'Lento'], ['Movilidad de cadera 90/90', 2, '8 c/lado', '', '', '']],
  fullbody: [['Sentadilla goblet', 3, '12', '20 kg', '90 s', ''], ['Press banca con mancuernas', 3, '10', '22 kg', '90 s', ''],
    ['Remo en polea baja', 3, '12', '45 kg', '90 s', ''], ['Peso muerto con kettlebell', 3, '12', '24 kg', '90 s', ''], ['Plancha', 3, '40 s', '', '45 s', '']],
};
const PT = {
  peito: [['Supino reto com barra', 4, '8-10', '60 kg', '90 s', 'Controlar a descida'], ['Supino inclinado com halteres', 3, '10', '22 kg', '90 s', ''],
    ['Crucifixo na polia', 3, '12-15', '12 kg', '60 s', ''], ['Tríceps corda', 3, '12', '20 kg', '60 s', ''], ['Tríceps testa', 3, '10', '20 kg', '60 s', '']],
  costas: [['Puxada frontal', 4, '10', '50 kg', '90 s', ''], ['Remada curvada', 4, '8-10', '50 kg', '90 s', 'Coluna neutra'],
    ['Remada baixa', 3, '12', '45 kg', '60 s', ''], ['Rosca direta', 3, '10', '25 kg', '60 s', ''], ['Rosca martelo', 3, '12', '12 kg', '60 s', '']],
  pernas: [['Agachamento livre', 4, '8-10', '70 kg', '2 min', ''], ['Leg press 45°', 4, '12', '160 kg', '90 s', ''],
    ['Cadeira extensora', 3, '12-15', '40 kg', '60 s', ''], ['Mesa flexora', 3, '12', '35 kg', '60 s', ''], ['Panturrilha em pé', 4, '15', '50 kg', '45 s', '']],
  ombros: [['Desenvolvimento com halteres', 4, '10', '16 kg', '90 s', ''], ['Elevação lateral', 3, '15', '8 kg', '60 s', ''],
    ['Elevação frontal', 3, '12', '8 kg', '60 s', ''], ['Encolhimento', 3, '12', '28 kg', '60 s', '']],
  gluteos: [['Elevação pélvica', 4, '10', '80 kg', '90 s', 'Pausa no topo'], ['Afundo búlgaro', 3, '10 cada perna', '10 kg', '60 s', ''],
    ['Abdução na máquina', 3, '20', '40 kg', '45 s', ''], ['Coice na polia', 3, '15', '10 kg', '45 s', '']],
  abdomen: [['Prancha', 3, '40 s', '', '30 s', ''], ['Abdominal infra', 3, '15', '', '45 s', ''],
    ['Bicicleta ergométrica', 1, '20 min', '', '', 'Ritmo moderado'], ['Abdominal remador', 3, '15', '', '45 s', '']],
};

// Las hojas que acompañan a la rutina en un libro de verdad.
function hojaRegistro(wb, { nombre = 'Registro', idioma = 'es', filasFormula = 500, ejemplo = null } = {}) {
  const ws = wb.addWorksheet(nombre);
  const esp = idioma === 'es';
  celda(ws, 'A1', b(esp ? 'Registro de entrenamientos' : 'Registro de cargas'));
  fila(ws, 4, 'A', (esp ? ['Fecha', 'Sesión', 'Ejercicio', 'Serie', 'Peso (kg)', 'Reps', 'RIR', 'Volumen (kg)', '1RM est. (kg)']
    : ['Data', 'Treino', 'Exercício', 'Série', 'Carga (kg)', 'Reps', 'RIR', 'Volume (kg)', '1RM est. (kg)']).map(b));
  let r = 5;
  if (ejemplo) {
    fila(ws, r, 'A', [fecha(2026, 10, 5), ejemplo[0], ejemplo[1], 1, ejemplo[2], ejemplo[3], 2,
      { f: `IF(OR(E${r}="",F${r}=""),"",E${r}*F${r})`, r: ejemplo[2] * ejemplo[3] }, null, esp ? '← EJEMPLO' : '← EXEMPLO']);
    r++;
  }
  for (let k = 0; k < filasFormula; k++, r++) fila(ws, r, 'H', [{ f: `IF(OR(E${r}="",F${r}=""),"",E${r}*F${r})`, fmt: '#,##0' }]);
}
function hojaProgreso(wb, { nombre = 'Progreso', idioma = 'es', pesoInicial = 84 } = {}) {
  const ws = wb.addWorksheet(nombre);
  const esp = idioma === 'es';
  celda(ws, 'A1', b(esp ? 'Progreso corporal' : 'Evolução corporal'));
  fila(ws, 4, 'A', [b(esp ? 'Fecha de inicio' : 'Data de início'), fecha(2026, 10, 5)]);
  fila(ws, 6, 'A', (esp ? ['Semana', 'Fecha', 'Peso (kg)', 'Cintura (cm)', 'Notas'] : ['Semana', 'Data', 'Peso (kg)', 'Cintura (cm)', 'Observações']).map(b));
  for (let k = 0; k <= 8; k++) {
    fila(ws, 7 + k, 'A', [k, { f: `$B$4+7*A${7 + k}`, r: new Date(Date.UTC(2026, 9, 5 + 7 * k)), fmt: 'dd/mm/yyyy' },
      k === 0 ? { n: pesoInicial, fmt: '0.0' } : null, k === 0 ? 92 : null, k === 0 ? `Peso inicial: ${pesoInicial} kg` : null]);
  }
}
function hojaResumen(wb, { nombre = 'Resumen', hoja, celdas }) {
  const ws = wb.addWorksheet(nombre);
  celda(ws, 'A1', b('Resumen por ejercicio'));
  fila(ws, 4, 'A', ['Ejercicio', 'Series registradas', 'Peso máx. (kg)'].map(b));
  // Con el resultado de las fórmulas ya calculado: «Series registradas» tiene números.
  celdas.forEach(([dir, n], i) => fila(ws, 5 + i, 'A', [{ f: `${hoja}!$B$${dir}`, r: n }, { f: `COUNTIF(Registro!C:C,A${5 + i})`, r: 12 }]));
}
function hojaGuia(wb, { nombre = 'Guía' } = {}) {
  const ws = wb.addWorksheet(nombre);
  celda(ws, 'A1', b('Guía rápida'));
  fila(ws, 3, 'A', [b('Progresión doble'), 'Trabajá dentro del rango de reps. Cuando llegues al tope en todas las series, subí el peso.']);
  fila(ws, 4, 'A', [b('Descanso'), 'Ejercicios pesados 2-3 min, accesorios 60-90 s.']);
  fila(ws, 5, 'A', [b('Semana de descarga'), 'Cada 4-6 semanas, una semana con ~60% del peso.']);
  celda(ws, 'A7', b('Proteína diaria (referencia)'));
  fila(ws, 8, 'A', ['Peso actual (kg)', 84]);
}
function hojaMedidas(wb, { nombre = 'Medidas' } = {}) {
  const ws = wb.addWorksheet(nombre);
  fila(ws, 1, 'A', ['Fecha', 'Peso', 'Cintura', 'Cadera'].map(b));
  [[2026, 9, 1, 71.5, 78, 99], [2026, 9, 15, 70.8, 77, 98]].forEach(([y, m, d, ...v], i) => fila(ws, 2 + i, 'A', [fecha(y, m, d), ...v]));
}

// ─────────────────────────── la planilla de Matías (30/09) ───────────────────────────

const REAL_LUNES = [
  ['Sentadilla con barra', 4, '6-8', '2-3 min', 'Bajá controlado, profundidad cómoda. Es el ejercicio principal del día.'],
  ['Prensa 45°', 3, '10-12', '2 min', 'No bloquees las rodillas arriba.'],
  ['Peso muerto rumano', 3, '8-10', '2 min', 'Espalda neutra, sentí el estiramiento en el femoral.'],
  ['Zancadas con mancuernas', 3, '10 c/pierna', '90 s', 'Pasos largos, torso erguido.'],
  ['Curl femoral', 3, '10-12', '90 s', null],
  ['Elevación de talones', 4, '12-15', '60 s', 'Pausa de 1 s arriba.'],
  ['Plancha', 3, '45-60 s', '60 s', 'Core firme, sin hundir la cintura.'],
];
const REAL_MIERCOLES = [
  ['Press banca plano con barra', 4, '6-8', '2-3 min', 'Ejercicio principal del día.'],
  ['Press inclinado con mancuernas', 3, '8-10', '2 min', 'Banco a 30°.'],
  ['Press militar con mancuernas', 3, '8-10', '2 min', null],
  ['Elevaciones laterales', 3, '12-15', '60 s', 'Sin balanceo, peso moderado.'],
  ['Extensión de tríceps en polea', 3, '10-12', '60-90 s', null],
  ['Press francés', 3, '10-12', '90 s', 'Codos cerrados.'],
];
const REAL_VIERNES = [
  ['Dominadas (o jalón al pecho)', 4, '6-10', '2 min', 'Agregá lastre o subí peso cuando llegues a 10.'],
  ['Remo con barra', 4, '8-10', '2 min', 'Torso a ~45°, espalda recta.'],
  ['Remo con mancuerna', 3, '10-12', '90 s', null],
  ['Face pull', 3, '12-15', '60 s', 'Bueno para hombros con tanto MMA.'],
  ['Curl con barra', 3, '8-10', '90 s', null],
  ['Curl martillo', 2, '10-12', '60 s', null],
];
const SEMANA_TIPO_REAL = [
  ['Lunes', 'Gimnasio', 'Piernas y core'], ['Martes', 'MMA', 'Técnica / sparring'], ['Miércoles', 'Gimnasio', 'Empuje: pecho, hombros, tríceps'],
  ['Jueves', 'MMA', 'Técnica / sparring'], ['Viernes', 'Gimnasio corto + tatami', 'Tirón: espalda y bíceps (≈40 min) y luego MMA'],
  ['Sábado', 'Cardio suave', 'Trote o caminata en el parque'], ['Domingo', 'Descanso', 'Dormir bien y comer en orden'],
];

/**
 * El libro de Matías, celda por celda como el archivo que subió (mismas
 * celdas, negritas, formatos y combinadas): Rutina, Registro, Progreso,
 * Resumen y Guía.
 */
function libroMatias(wb) {
  const ws = wb.addWorksheet('Rutina');
  celda(ws, 'A1', b('Plan de hipertrofia – Gimnasio'));
  celda(ws, 'A2', 'Objetivo: subir masa muscular y bajar la panza. Ajustá ejercicios con tu profe si lo ve necesario.');
  celda(ws, 'A4', b('Semana tipo'));
  fila(ws, 5, 'A', [b('Día'), b('Actividad'), b('Enfoque')]); ws.mergeCells('C5:F5');
  SEMANA_TIPO_REAL.forEach(([d, a, e], i) => { fila(ws, 6 + i, 'A', [b(d), a, e]); ws.mergeCells(`C${6 + i}:F${6 + i}`); });
  const fmt = (e, i) => [i + 1, e[0], e[1], e[2], e[3], e[4]];
  bloque(ws, 14, 'LUNES – Piernas y core', REAL_LUNES, { fmt });
  bloque(ws, 24, 'MIÉRCOLES – Empuje (pecho, hombros, tríceps)', REAL_MIERCOLES, { fmt });
  bloque(ws, 33, 'VIERNES – Tirón corto (espalda y bíceps, antes del tatami)', REAL_VIERNES, { fmt });
  celda(ws, 'A42', 'Calentamiento: 5-8 min de cardio suave + 2 series ligeras del primer ejercicio antes de las series efectivas.');

  const reg = wb.addWorksheet('Registro');
  celda(reg, 'A1', b('Registro de entrenamientos'));
  celda(reg, 'A2', 'Una fila por serie. Completá solo las celdas amarillas (Fecha, Sesión, Ejercicio, Serie, Peso, Reps, RIR).');
  fila(reg, 3, 'A', [b('Leyenda:'), 'Amarillo = lo completás vos · Volumen = peso × reps · 1RM est. = peso × (1 + reps/30) (fórmula de Epley) · RIR = repeticiones que te quedaron en reserva']);
  fila(reg, 5, 'A', ['Fecha', 'Sesión', 'Ejercicio', 'Serie', 'Peso (kg)', 'Reps', 'RIR', 'Volumen (kg)', '1RM est. (kg)'].map(b));
  fila(reg, 6, 'A', [fecha(2026, 10, 5), 'Piernas', 'Sentadilla con barra', 1, 60, 8, 2,
    { f: 'IF(OR(E6="",F6=""),"",E6*F6)', r: 480 }, { f: 'IF(OR(E6="",F6=""),"",E6*(1+F6/30))', r: 76 },
    '← EJEMPLO (no se suma en el Resumen). Podés dejarlo como guía.']);
  // Las fórmulas de las filas 7 a 506, todavía sin resultado (el registro vacío).
  for (let r = 7; r <= 506; r++) {
    fila(reg, r, 'H', [{ f: `IF(OR(E${r}="",F${r}=""),"",E${r}*F${r})`, fmt: '#,##0' }, { f: `IF(OR(E${r}="",F${r}=""),"",E${r}*(1+F${r}/30))`, fmt: '0.0' }]);
  }

  const pro = wb.addWorksheet('Progreso');
  celda(pro, 'A1', b('Progreso corporal'));
  celda(pro, 'A2', 'Pesate en ayunas el mismo día de cada semana y medí la cintura a la altura del ombligo.');
  fila(pro, 4, 'A', [b('Fecha de inicio'), fecha(2026, 10, 5), '← lunes 5/10 por defecto; cambialo si empezás otro día']);
  fila(pro, 6, 'A', ['Semana', 'Fecha', 'Peso (kg)', 'Cintura (cm)', 'Δ peso vs inicio (kg)', 'Δ cintura vs inicio (cm)', 'Notas'].map(b));
  for (let k = 0; k <= 7; k++) {
    const r = 7 + k;
    fila(pro, r, 'A', [k, { f: `$B$4+7*A${r}`, r: new Date(Date.UTC(2026, 9, 5 + 7 * k)), fmt: 'dd/mm/yyyy' },
      k === 0 ? { n: 90, fmt: '0.0' } : null, null,
      { f: `IF(C${r}="","",C${r}-$C$7)`, fmt: '+0.0;-0.0;0.0' }, { f: `IF(OR(D${r}="",$D$7=""),"",D${r}-$D$7)`, fmt: '+0.0;-0.0;0.0' },
      k === 0 ? 'Peso inicial: 90 kg (dato que me diste)' : null]);
  }
  celda(pro, 'A16', 'Semana 7 cae justo antes de tu viaje del 26/11.');

  const res = wb.addWorksheet('Resumen');
  celda(res, 'A1', b('Resumen por ejercicio'));
  celda(res, 'A2', 'Se calcula solo desde la hoja Registro. No hace falta tocar nada acá.');
  fila(res, 4, 'A', ['Ejercicio', 'Series registradas', 'Peso máx. (kg)', '1RM estimado máx. (kg)', 'Volumen total (kg)'].map(b));
  [...REAL_LUNES.map((e, i) => [16 + i, e[0]]), ...REAL_MIERCOLES.map((e, i) => [26 + i, e[0]]), ...REAL_VIERNES.map((e, i) => [35 + i, e[0]])]
    .forEach(([fr, n], i) => {
      const r = 5 + i;
      fila(res, r, 'A', [{ f: `Rutina!$B$${fr}`, r: n }, { f: `COUNTIF(Registro!$C$7:$C$506,A${r})` },
        { f: `IF(B${r}=0,"",_xlfn.MAXIFS(Registro!$E$7:$E$506,Registro!$C$7:$C$506,A${r}))`, fmt: '0.0' },
        { f: `IF(B${r}=0,"",_xlfn.MAXIFS(Registro!$I$7:$I$506,Registro!$C$7:$C$506,A${r}))`, fmt: '0.0' },
        { f: `SUMIF(Registro!$C$7:$C$506,A${r},Registro!$H$7:$H$506)`, fmt: '#,##0' }]);
    });

  const gui = wb.addWorksheet('Guía');
  celda(gui, 'A1', b('Guía rápida'));
  fila(gui, 3, 'A', [b('Progresión doble'), 'Trabajá dentro del rango de reps. Cuando hagas el tope del rango en TODAS las series con buena técnica, subí el peso (≈2,5 kg en barra, 1-2 kg en mancuernas) y volvé al piso del rango.']);
  fila(gui, 4, 'A', [b('Intensidad'), 'Terminá las series efectivas con 1-2 repeticiones en reserva (RIR 1-2). La última serie de cada ejercicio principal puede ir más cerca del fallo.']);
  fila(gui, 5, 'A', [b('Descanso'), 'Ejercicios pesados 2-3 min, accesorios 60-90 s.']);
  fila(gui, 6, 'A', [b('Semana de descarga'), 'Cada 4-6 semanas, una semana con ~60% del peso si sentís las articulaciones cargadas (con tanto MMA suma).']);
  fila(gui, 7, 'A', [b('Lunes y martes'), 'Si después de las piernas del lunes llegás muy cargado al MMA del martes, bajá una serie en sentadilla y prensa.']);
  celda(gui, 'A9', b('Proteína diaria (referencia)'));
  fila(gui, 10, 'A', ['Peso actual (kg)', { f: 'Progreso!C7', r: 90, fmt: '0.0' }]);
  fila(gui, 11, 'A', ['g/kg mínimo', 1.6]);
  fila(gui, 12, 'A', ['g/kg máximo', 2.2]);
  fila(gui, 13, 'A', ['Proteína mínima (g/día)', { f: 'B10*B11', r: 144, fmt: '0' }]); gui.getCell('B13').font = { bold: true };
  fila(gui, 14, 'A', ['Proteína máxima (g/día)', { f: 'B10*B12', r: 198, fmt: '0' }]); gui.getCell('B14').font = { bold: true };
  celda(gui, 'A15', 'Supuesto: el rango de 1,6–2,2 g/kg es el habitual en la literatura para ganar masa muscular. Editá las celdas amarillas si tu profe o nutricionista te indica otro.');
}

const DIAS_MATIAS = [
  ['LUNES – Piernas y core', 7], ['Martes – MMA', 0], ['MIÉRCOLES – Empuje', 6], ['Jueves – MMA', 0],
  ['VIERNES – Tirón corto', 6], ['Sábado – Cardio suave', 0], ['Domingo – Descanso', 0],
];

(async () => {
  // ═══════════════════════════════════════════════════════════
  console.log('\n── 1 · La planilla de Matías, como la lee el servidor ──');
  // ═══════════════════════════════════════════════════════════
  const LIBRO = await libroDe(libroMatias);
  const hoja = (n) => LIBRO.hojas.find((h) => h.nombre === n);
  ok('las cinco hojas', LIBRO.hojas.map((h) => h.nombre), ['Rutina', 'Registro', 'Progreso', 'Resumen', 'Guía']);
  ok('el título combinado A14:F14 queda en A, B a F vacías', hoja('Rutina').filas[13].map((c) => (c ? c.texto : null)),
    ['LUNES – Piernas y core', null, null, null, null, null]);
  ok('«Enfoque» combinado C:F: el texto en C', hoja('Rutina').filas[5].map((c) => (c ? c.texto : null)), ['Lunes', 'Gimnasio', 'Piernas y core', null, null, null]);
  ok('Registro: las fórmulas sin resultado de las filas 7 a 506 no cuentan (6 filas, sin «leímos 500»)',
    [hoja('Registro').filas.length, !!hoja('Registro').recortada], [6, false]);
  ok('una fecha con año (dd/mm/yyyy) no se marca como «Excel la convirtió»: la del registro y las del progreso',
    [hoja('Registro').filas[5][0].texto, !!hoja('Registro').filas[5][0].fecha, !!hoja('Progreso').filas[3][1].fecha, !!hoja('Progreso').filas[6][1].fecha],
    ['5/10/26', false, false, false]);
  ok('los ejercicios del Resumen son fórmulas, y están marcadas', [hoja('Resumen').filas[4][0].texto, hoja('Resumen').filas[4][0].formula],
    ['Sentadilla con barra', true]);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 2 · Lo que entiende Orden: la semana entera, solo de la hoja Rutina ──');
  // ═══════════════════════════════════════════════════════════
  const RES = RP.planillaARutina(LIBRO);
  const ejercicios = RES.leida.dias.reduce((s, d) => s + d.ejercicios.length, 0);
  ok('«Entendí 7 días y 19 ejercicios.» (antes: 13 días y 39 ejercicios)', es.pegar.entendi(RES.leida.dias.length, ejercicios), 'Entendí 7 días y 19 ejercicios.');
  ok('los 7 días en el orden de la semana, con el nombre de la planilla', resumen(RES), DIAS_MATIAS);
  ok('las notas de cada día: la actividad de la semana tipo, y el paréntesis entero del título', RES.leida.dias.map((d) => d.notas), [
    '', 'Técnica / sparring', 'pecho, hombros, tríceps', 'Técnica / sparring',
    'espalda y bíceps, antes del tatami\nGimnasio corto + tatami · Tirón: espalda y bíceps (≈40 min) y luego MMA',
    'Trote o caminata en el parque', 'Dormir bien y comer en orden']);
  ok('el lunes: series, repeticiones, descanso y notas en su lugar', RES.leida.dias[0].ejercicios.map(corto), [
    ['Sentadilla con barra', 4, '6-8', '', 180, 'Bajá controlado, profundidad cómoda. Es el ejercicio principal del día.'],
    ['Prensa 45°', 3, '10-12', '', 120, 'No bloquees las rodillas arriba.'],
    ['Peso muerto rumano', 3, '8-10', '', 120, 'Espalda neutra, sentí el estiramiento en el femoral.'],
    ['Zancadas con mancuernas', 3, '10 c/pierna', '', 90, 'Pasos largos, torso erguido.'],
    ['Curl femoral', 3, '10-12', '', 90, ''],
    ['Elevación de talones', 4, '12-15', '', 60, 'Pausa de 1 s arriba.'],
    ['Plancha', 3, '45-60 s', '', 60, 'Core firme, sin hundir la cintura.']]);
  ok('el miércoles y el viernes, enteros', [RES.leida.dias[2].ejercicios.map((e) => [e.nombre, e.series, e.reps, e.descanso_seg]),
    RES.leida.dias[4].ejercicios.map((e) => [e.nombre, e.series, e.reps, e.descanso_seg])], [
    REAL_MIERCOLES.map((e) => [e[0], e[1], e[2], { '2-3 min': 180, '2 min': 120, '60 s': 60, '60-90 s': 90, '90 s': 90 }[e[3]]]),
    REAL_VIERNES.map((e) => [e[0], e[1], e[2], { '2 min': 120, '90 s': 90, '60 s': 60 }[e[3]]])]);
  ok('el nombre de la rutina, y en sus notas el objetivo y el calentamiento (no en el viernes)', [RES.leida.nombre, RES.leida.notas], [
    'Plan de hipertrofia – Gimnasio',
    'Objetivo: subir masa muscular y bajar la panza. Ajustá ejercicios con tu profe si lo ve necesario.\n'
      + 'Calentamiento: 5-8 min de cardio suave + 2 series ligeras del primer ejercicio antes de las series efectivas']);
  ok('solo la hoja Rutina; las otras tienen algo y se pueden sumar', RES.hojas, [
    { nombre: 'Rutina', usada: true, conEjercicios: true }, { nombre: 'Registro', usada: false, conEjercicios: true },
    { nombre: 'Progreso', usada: false, conEjercicios: true }, { nombre: 'Resumen', usada: false, conEjercicios: true },
    { nombre: 'Guía', usada: false, conEjercicios: true }]);
  ok('sin avisos falsos (fechas, cargas, «Leyenda», 500 filas) y sin renglones «no entendí»', [RES.avisos, RES.leida.noEntendidas], [[], []]);
  ok('nada del registro, del progreso, del resumen ni de la guía en la rutina',
    /Leyenda|EJEMPLO|Peso inicial|Progresi[oó]n doble|Prote[ií]na|Fecha de inicio|viaje|Registro/.test(JSON.stringify(RES.leida)), false);
  ok('la revisión lo dice en una línea', `${es.importar.hojasNoUsadas('Registro, Progreso, Resumen', 'Guía')} ${es.importar.tocaUnaParaSumarla}`,
    'No usamos las hojas Registro, Progreso, Resumen y Guía. Tocá una para sumarla.');
  ok('y en portugués', `${pt.importar.hojasNoUsadas('Registro, Progreso, Resumen', 'Guía')} ${pt.importar.tocaUnaParaSumarla}`,
    'Não usamos as abas Registro, Progreso, Resumen e Guía. Toque numa para somá-la.');

  // El trainer elige otra hoja con los chips.
  const CON_REGISTRO = RP.planillaARutina(LIBRO, { hojas: { Registro: true } });
  ok('tocar «Registro» la suma (su fila de ejemplo como un día más, al final)', [usadas(CON_REGISTRO), resumen(CON_REGISTRO).slice(-1),
    CON_REGISTRO.leida.dias[7].ejercicios.map(corto)], [['Rutina', 'Registro'], [['Piernas', 1]],
    [['Sentadilla con barra', 1, '8', '60', null, '← EJEMPLO (no se suma en el Resumen). Podés dejarlo como guía. · Fecha: 5/10/26 · RIR: 2 · Volumen (kg): 480 · 1RM est. (kg): 76']]]);
  ok('y sacar «Rutina» deja solo lo elegido', [usadas(RP.planillaARutina(LIBRO, { hojas: { Registro: true, Rutina: false } })),
    resumen(RP.planillaARutina(LIBRO, { hojas: { Registro: true, Rutina: false } }))], [['Registro'], [['Piernas', 1]]]);
  ok('una hoja sin ejercicios no se puede forzar, y un nombre que no está no cambia nada',
    [usadas(RP.planillaARutina({ hojas: [...LIBRO.hojas, { nombre: 'Vacía', filas: [[{ texto: 'Nada acá' }]] }] }, { hojas: { Vacía: true, Otra: true } }))],
    [['Rutina']]);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 3 · El editor crea TODOS los días, y el alumno los ve bien ──');
  // ═══════════════════════════════════════════════════════════
  const DIAS_EDITOR = M.diasDesdeLeida(RES.leida, []);
  ok('usarPegado (diasDesdeLeida): 7 días, uno por uno, también los que solo tienen su nota',
    DIAS_EDITOR.map((d) => [d.nombre, d.ejercicios.length, d.notas.split('\n')[0]]), DIAS_MATIAS.map(([n, k], i) => [n, k, RES.leida.dias[i].notas.split('\n')[0]]));
  const RUTINA_EDITOR = { nombre: RES.leida.nombre, notas: RES.leida.notas, semanas: null, dias: DIAS_EDITOR };
  ok('validar: se puede guardar (la base pide de 1 a 10 días y un ejercicio en toda la rutina)', [M.validar(RUTINA_EDITOR), DIAS_EDITOR.length <= M.TOPES.dias], [null, true]);
  ok('lo que viaja a guardar_rutina: 7 días con nombre, 0 a 30 ejercicios cada uno',
    M.paraGuardar(RUTINA_EDITOR, { rutina: 'Rutina', dia: (i) => `Día ${i + 1}` }).dias.map((d) => [d.nombre, d.ejercicios.length]), DIAS_MATIAS);
  ok('usarPegado lo usa (y no arma los días por su cuenta)',
    /const dias: DiaEditor\[\] = diasDesdeLeida\(leida, biblioteca\);/.test(leer('src/components/rutinas/EditorRutina.tsx')), true);

  // El link del alumno: el día que le toca nunca es uno sin ejercicios.
  const delAlumno = RES.leida.dias.map((d, i) => ({ orden: i + 1, ejercicios: d.ejercicios.map((_, j) => ({ id: `d${i}e${j}` })) }));
  const tilde = (id, dia, hoy) => ({ fecha: '2026-10-06', hechos: hoy ? [id] : [], ultimo: hoy ? { id, dia, fecha: '2026-10-06' } : null, previo: hoy ? null : { id, dia, fecha: '2026-10-05' } });
  ok('después del lunes abre el miércoles (no «Martes – MMA»), después del viernes el lunes; sin tildes, el lunes',
    [T.diaParaAbrir(delAlumno, tilde('d0e3', 1, false)), T.diaParaAbrir(delAlumno, tilde('d2e0', 3, false)), T.diaParaAbrir(delAlumno, tilde('d4e5', 5, false)),
      T.diaParaAbrir(delAlumno, { fecha: '2026-10-06', hechos: [], ultimo: null, previo: null }), T.diaParaAbrir(delAlumno, tilde('d0e1', 1, true))],
    [2, 4, 0, 0, 0]);
  const tresDias = [{ orden: 1, ejercicios: [{ id: 'a' }] }, { orden: 2, ejercicios: [{ id: 'b' }] }, { orden: 3, ejercicios: [{ id: 'c' }] }];
  ok('una rutina de siempre (todos con ejercicios) abre igual que antes', [T.diaParaAbrir(tresDias, tilde('a', 1, false)), T.diaParaAbrir(tresDias, tilde('c', 3, false))], [1, 0]);
  const vistas = ['src/components/rutinas/RutinaDelCliente.tsx', 'src/components/rutinas/RutinaVista.tsx', 'src/components/rutinas/HojaRutinaSesion.tsx'].map(leer);
  ok('un día sin ejercicios con su nota no dice «Este día todavía no tiene ejercicios» (alumno, carpeta y sesión)',
    vistas.map((v) => /dia\.ejercicios\.length === 0 \? \(\s*!dia\.notas\.trim\(\) && <p/.test(v)), [true, true, true]);

  // «Editar como texto» y «Pegar texto» con lo mismo.
  const ida = R.leerRutina(R.rutinaComoTexto(RES.leida, rutinasComunEs.texto));
  ok('«Editar como texto»: ida y vuelta con los 7 días («Domingo – Descanso» con su nota sigue siendo un día)',
    [ida.dias.map((d) => [d.nombre, d.ejercicios.length, d.notas]), ida.noEntendidas], [RES.leida.dias.map((d) => [d.nombre, d.ejercicios.length, d.notas]), []]);
  const comoTexto = (h) => h.filas.map((f) => f.map((c) => (c ? c.texto.replace(/[\t\r\n]+/g, ' ') : '')).join('\t').replace(/\t+$/, '')).join('\n');
  const PEGADA = RP.pegadoComoPlanilla(comoTexto(hoja('Rutina')));
  ok('«Pegar texto» con la hoja Rutina copiada de Excel: los mismos 7 días', [resumen(PEGADA), PEGADA.leida.notas === RES.leida.notas, PEGADA.leida.noEntendidas],
    [DIAS_MATIAS, true, []]);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 4 · Los días, como los escriben los trainers (es y pt) ──');
  // ═══════════════════════════════════════════════════════════
  const titulos = ['LUN · Pierna', 'MIÉ: Empuje', 'MIE - Empuje', 'SEG – Pernas', 'Sáb.', 'Segunda-feira', 'TERÇA-FEIRA', 'Lunes: Pierna',
    'Miercoles', 'DÍA 1 - PECHO', 'Dia 1', 'Día A', 'Treino A', 'SEXTA – Costas'];
  ok('títulos de día: completos, abreviados, con o sin tildes, «Día 1», «Treino A»', titulos.filter((t) => !R.esTituloDeDia(t)), []);
  ok('y lo que no es un día', ['Martillo', 'Mar del Plata', 'Dominadas', 'Lunes: descanso', 'LUN · Sentadilla 4x10', 'Sexo: M', 'Segundos', 'Domingo - libre']
    .filter((t) => R.esTituloDeDia(t)), []);
  ok('qué día de la semana es (0 el lunes)', ['Lunes', 'LUN', 'Segunda-feira', 'SEG – Pernas', 'martes', 'Terça', 'MIÉ', 'Miércoles', 'quarta-feira',
    'Jue.', 'Quinta', 'VIE · Tirón', 'Sexta-feira', 'Sábado', 'SAB', 'Domingo', 'DOM', 'Día 1', 'Treino A', 'Martillo'].map(R.diaDeLaSemana),
  [0, 0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, null, null, null]);
  ok('«Pegar texto» con días abreviados', R.leerRutina('LUN · Pierna\nSentadilla 4x10\nMIÉ · Empuje\nPress banca 4x8').dias.map((d) => [d.nombre, d.ejercicios.length]),
    [['LUN · Pierna', 1], ['MIÉ · Empuje', 1]]);
  ok('un título largo con paréntesis: el paréntesis entero a las notas', [R.partirTitulo('MIÉRCOLES – Empuje (pecho, hombros, tríceps)', 40),
    R.partirTitulo('VIERNES – Tirón corto (espalda y bíceps, antes del tatami)', 40), R.partirTitulo('Lunes (pierna)', 40)],
  [['MIÉRCOLES – Empuje', 'pecho, hombros, tríceps'], ['VIERNES – Tirón corto', 'espalda y bíceps, antes del tatami'], ['Lunes (pierna)', '']]);
  ok('un descanso con su nota en itálica es un día; solo, no', [
    R.leerRutina('*LUNES*\nSentadilla 4x10\n\n*Domingo – Descanso*\n_Dormir bien_').dias.map((d) => [d.nombre, d.ejercicios.length, d.notas]),
    R.leerRutina('LUNES\nSentadilla 4x10\nMARTES: descanso\nJUEVES\nRemo 4x10').noEntendidas],
  [[['LUNES', 1, ''], ['Domingo – Descanso', 0, 'Dormir bien']], ['MARTES: descanso']]);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 5 · Dieciséis formas de planilla: hojas, días y ejercicios ──');
  // ═══════════════════════════════════════════════════════════
  // [nombre, armar(wb), hojas usadas, días [nombre, ejercicios], avisos permitidos, notas que tiene que decir, semanas]
  const CASOS = [
    ['02 · pt: Treino + Registro de cargas + Evolução + Resumo + Dicas', (wb) => {
      const ws = wb.addWorksheet('Treino');
      titulo(ws, 1, 'A', 'F', 'PLANILHA DE TREINO – HIPERTROFIA');
      fila(ws, 2, 'A', ['Aluno:', 'Rafael Souza', null, 'Início:', fecha(2026, 10, 6)]);
      fila(ws, 3, 'A', ['Objetivo:', 'Hipertrofia', null, 'Frequência:', '3x por semana']);
      const enc = ['Nº', 'Exercício', 'Séries', 'Repetições', 'Descanso', 'Observações'];
      let r = bloque(ws, 5, 'TREINO A – PEITO E TRÍCEPS', PT.peito, { enc });
      r = bloque(ws, r, 'TREINO B – COSTAS E BÍCEPS', PT.costas, { enc });
      bloque(ws, r, 'TREINO C – PERNAS E OMBROS', [...PT.pernas.slice(0, 4), ...PT.ombros.slice(0, 2)], { enc });
      hojaRegistro(wb, { nombre: 'Registro de cargas', idioma: 'pt', filasFormula: 300, ejemplo: ['A', 'Supino reto com barra', 60, 10] });
      hojaProgreso(wb, { nombre: 'Evolução', idioma: 'pt', pesoInicial: 78 });
      hojaResumen(wb, { nombre: 'Resumo', hoja: 'Treino', celdas: PT.peito.map((e, i) => [7 + i, e[0]]) });
      hojaGuia(wb, { nombre: 'Dicas' });
    }, ['Treino'], [['TREINO A – PEITO E TRÍCEPS', 5], ['TREINO B – COSTAS E BÍCEPS', 5], ['TREINO C – PERNAS E OMBROS', 6]], ['datos_no_usados'], ['Objetivo']],

    ['03 · títulos combinados «LUNES – Piernas (cuádriceps)», 4 días', (wb) => {
      const ws = wb.addWorksheet('Rutina');
      titulo(ws, 1, 'A', 'F', 'RUTINA FUERZA + HIPERTROFIA (4 DÍAS)');
      fila(ws, 2, 'A', ['Alumna:', 'Carla Méndez', null, 'Inicio:', fecha(2026, 10, 6)]);
      fila(ws, 3, 'A', ['Duración:', '6 semanas']);
      const enc = ['#', 'Ejercicio', 'Series', 'Repeticiones', 'Carga', 'Descanso'];
      const fmt = (e, i) => [i + 1, e[0], e[1], e[2], e[3] || null, e[4]];
      let r = bloque(ws, 5, 'LUNES – Piernas (cuádriceps)', ES.pierna, { enc, fmt });
      r = bloque(ws, r, 'MARTES – Pecho y tríceps', ES.empuje, { enc, fmt });
      r = bloque(ws, r, 'JUEVES – Espalda y bíceps', ES.tiron, { enc, fmt });
      bloque(ws, r, 'VIERNES – Glúteos y femorales', ES.gluteo, { enc, fmt });
    }, ['Rutina'], [['LUNES – Piernas (cuádriceps)', 6], ['MARTES – Pecho y tríceps', 6], ['JUEVES – Espalda y bíceps', 6], ['VIERNES – Glúteos y femorales', 5]],
    ['datos_no_usados'], []],

    ['04 · columna «Día» combinada a lo alto, con «DESCANSO»', (wb) => {
      const ws = wb.addWorksheet('Plan semanal');
      fila(ws, 1, 'A', ['DÍA', 'GRUPO MUSCULAR', 'EJERCICIO', 'SERIES', 'REPS', 'PESO (kg)', 'DESCANSO'].map(b));
      let r = 2;
      const dia = (nombre, grupo, ejs) => {
        const ini = r;
        for (const e of ejs) { fila(ws, r, 'C', [e[0], e[1], e[2], parseFloat(e[3]) || null, e[4]]); r++; }
        celda(ws, `A${ini}`, b(nombre)); ws.mergeCells(`A${ini}:A${r - 1}`);
        celda(ws, `B${ini}`, grupo); ws.mergeCells(`B${ini}:B${r - 1}`);
      };
      const descanso = (nombre) => { celda(ws, `A${r}`, b(nombre)); celda(ws, `B${r}`, 'DESCANSO'); ws.mergeCells(`B${r}:G${r}`); r++; };
      dia('LUNES', 'Pecho', ES.empuje);
      dia('MARTES', 'Espalda', ES.tiron);
      descanso('MIÉRCOLES');
      dia('JUEVES', 'Piernas', ES.pierna);
      dia('VIERNES', 'Hombros', ES.hombro);
      descanso('SÁBADO');
    }, ['Plan semanal'], [['LUNES', 6], ['MARTES', 6], ['JUEVES', 6], ['VIERNES', 5]], ['cargas_sin_unidad'], []],

    ['06 · columna «DÍA» abreviada LUN / MAR / MIÉ', (wb) => {
      const ws = wb.addWorksheet('Semana');
      fila(ws, 1, 'A', ['DÍA', 'EJERCICIO', 'SERIES', 'REPS'].map(b));
      let r = 2;
      for (const [d, ejs] of [['LUN', ES.pierna.slice(0, 5)], ['MAR', ES.empuje.slice(0, 5)], ['MIÉ', ES.tiron.slice(0, 5)], ['JUE', ES.hombro], ['VIE', ES.gluteo]]) {
        for (const e of ejs) { fila(ws, r, 'A', [d, e[0], e[1], e[2]]); r++; }
        r++;
      }
    }, ['Semana'], [['LUN', 5], ['MAR', 5], ['MIÉ', 5], ['JUE', 5], ['VIE', 5]], [], []],

    ['07 · una hoja por día, «Sábado» de descanso con su nota y «Medidas»', (wb) => {
      for (const [n, ejs] of [['Lunes', ES.pierna], ['Martes', ES.empuje], ['Miércoles', ES.tiron], ['Jueves', ES.hombro], ['Viernes', ES.brazos]]) {
        const ws = wb.addWorksheet(n);
        fila(ws, 1, 'A', ['Ejercicio', 'Series', 'Reps', 'Carga', 'Descanso'].map(b));
        ejs.forEach((e, i) => fila(ws, 2 + i, 'A', [e[0], e[1], e[2], e[3] || null, e[4]]));
      }
      celda(wb.addWorksheet('Sábado'), 'A1', 'Descanso activo: caminar 40 min');
      hojaMedidas(wb);
    }, ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    [['Lunes', 6], ['Martes', 6], ['Miércoles', 6], ['Jueves', 5], ['Viernes', 5], ['Sábado', 0]], [], []],

    ['09 · tres días lado a lado (títulos combinados, una columna vacía en medio)', (wb) => {
      const ws = wb.addWorksheet('Rutina');
      [['A', 'D', 'LUNES – Tren inferior', ES.pierna], ['F', 'I', 'MIÉRCOLES – Tren superior', ES.empuje], ['K', 'N', 'VIERNES – Full body', ES.fullbody]]
        .forEach(([de, a, t, ejs]) => {
          titulo(ws, 1, de, a, t);
          fila(ws, 2, de, ['Ejercicio', 'Series', 'Reps', 'Descanso'].map(b));
          ejs.forEach((e, i) => fila(ws, 3 + i, de, [e[0], e[1], e[2], e[4]]));
        });
    }, ['Rutina'], [['LUNES – Tren inferior', 6], ['MIÉRCOLES – Tren superior', 6], ['VIERNES – Full body', 5]], [], []],

    ['11 · el mes como calendario: Semana 1..4 × Lunes..Viernes, varios ejercicios por celda', (wb) => {
      const ws = wb.addWorksheet('Plan mensual');
      titulo(ws, 1, 'A', 'F', 'PLAN DE ENTRENAMIENTO – OCTUBRE');
      fila(ws, 3, 'A', ['Semana', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map(b));
      for (let s = 1; s <= 4; s++) {
        fila(ws, 3 + s, 'A', [b(`Semana ${s}`), ...[ES.pierna, ES.empuje, ES.tiron, ES.hombro, ES.fullbody]
          .map((ejs) => ejs.slice(0, 4).map((e) => `${e[0]} ${e[1]}x${['12', '10', '8', '12'][s - 1]}`).join('\n'))]);
      }
    }, ['Plan mensual'], [['Lunes', 4], ['Martes', 4], ['Miércoles', 4], ['Jueves', 4], ['Viernes', 4]], [], [], 4],

    ['12 · semana tipo de 5 días de gimnasio + Registro + Progreso', (wb) => {
      const ws = wb.addWorksheet('Rutina');
      celda(ws, 'A1', b('Plan 5 días – Recomposición'));
      celda(ws, 'A4', b('Semana tipo'));
      fila(ws, 5, 'A', [b('Día'), b('Actividad'), b('Enfoque')]); ws.mergeCells('C5:F5');
      [['Lunes', 'Gimnasio', 'Pierna'], ['Martes', 'Gimnasio', 'Empuje'], ['Miércoles', 'Gimnasio', 'Tirón'], ['Jueves', 'Gimnasio', 'Glúteo y femoral'],
        ['Viernes', 'Gimnasio', 'Torso y brazos'], ['Sábado', 'Descanso activo', 'Caminata de 40 min o bici'], ['Domingo', 'Descanso', 'Dormir 8 h']]
        .forEach(([d, a, e], i) => { fila(ws, 6 + i, 'A', [b(d), a, e]); ws.mergeCells(`C${6 + i}:F${6 + i}`); });
      let r = 14;
      for (const [t, ejs] of [['LUNES – Pierna', ES.pierna], ['MARTES – Empuje', ES.empuje], ['MIÉRCOLES – Tirón', ES.tiron],
        ['JUEVES – Glúteo y femoral', ES.gluteo], ['VIERNES – Torso y brazos', ES.brazos]]) r = bloque(ws, r, t, ejs);
      celda(ws, `A${r}`, 'Calentamiento: 5 min de bici + 2 series livianas del primer ejercicio.');
      hojaRegistro(wb, { filasFormula: 200 });
      hojaProgreso(wb);
    }, ['Rutina'], [['LUNES – Pierna', 6], ['MARTES – Empuje', 6], ['MIÉRCOLES – Tirón', 6], ['JUEVES – Glúteo y femoral', 5],
      ['VIERNES – Torso y brazos', 5], ['Sábado – Descanso activo', 0], ['Domingo – Descanso', 0]], [], ['Calentamiento']],

    ['13 · semana tipo de 7 días, todos con bloque, + Guía', (wb) => {
      const SIETE = [['LUNES – Pecho', ES.empuje], ['MARTES – Espalda', ES.tiron], ['MIÉRCOLES – Pierna', ES.pierna], ['JUEVES – Hombro', ES.hombro],
        ['VIERNES – Brazos', ES.brazos], ['SÁBADO – Glúteo y femoral', ES.gluteo], ['DOMINGO – Core y movilidad', ES.core]];
      const ws = wb.addWorksheet('Rutina');
      celda(ws, 'A1', b('Rutina semanal completa'));
      celda(ws, 'A3', b('Semana tipo'));
      fila(ws, 4, 'A', [b('Día'), b('Actividad'), b('Enfoque')]);
      SIETE.forEach(([t], i) => { const [d, e] = t.split(' – '); fila(ws, 5 + i, 'A', [b(d.charAt(0) + d.slice(1).toLowerCase()), 'Gimnasio', e]); });
      let r = 13;
      for (const [t, ejs] of SIETE) r = bloque(ws, r, t, ejs);
      hojaGuia(wb);
    }, ['Rutina'], [['LUNES – Pecho', 6], ['MARTES – Espalda', 6], ['MIÉRCOLES – Pierna', 6], ['JUEVES – Hombro', 5], ['VIERNES – Brazos', 5],
      ['SÁBADO – Glúteo y femoral', 5], ['DOMINGO – Core y movilidad', 5]], [], []],

    ['14 · descansos como títulos («Martes: descanso», «Sábado - libre»)', (wb) => {
      const ws = wb.addWorksheet('Semana');
      let r = 1;
      for (const [t, ejs] of [['Lunes: Pierna', ES.pierna], ['Martes: descanso'], ['Miércoles: Empuje', ES.empuje], ['Jueves: Descanso'],
        ['Viernes: Tirón', ES.tiron], ['Sábado - libre'], ['Domingo: descanso']]) {
        celda(ws, `A${r}`, b(t)); r++;
        if (ejs) {
          fila(ws, r, 'A', ['Ejercicio', 'Series', 'Reps', 'Peso', 'Descanso'].map(b)); r++;
          for (const e of ejs) { fila(ws, r, 'A', [e[0], e[1], e[2], e[3] || null, e[4]]); r++; }
        }
        r++;
      }
    }, ['Semana'], [['Lunes: Pierna', 6], ['Miércoles: Empuje', 6], ['Viernes: Tirón', 6]], [], ['Martes: descanso', 'Domingo: descanso']],

    ['15 · pt: SEGUNDA-FEIRA … SEXTA-FEIRA + aba «Avaliação»', (wb) => {
      const ws = wb.addWorksheet('Treino semanal');
      titulo(ws, 1, 'A', 'F', 'PLANILHA DE TREINO SEMANAL');
      fila(ws, 2, 'A', ['Aluna:', 'Beatriz Lima']);
      const enc = ['Exercício', 'Séries', 'Repetições', 'Carga', 'Intervalo', 'Observação'];
      const fmt = (e) => [e[0], e[1], e[2], e[3] || null, e[4], e[5] || null];
      let r = 4;
      for (const [t, ejs] of [['SEGUNDA-FEIRA – Membros inferiores', PT.pernas], ['TERÇA-FEIRA – Peito e tríceps', PT.peito],
        ['QUARTA-FEIRA – Cardio e abdômen', PT.abdomen], ['QUINTA-FEIRA – Costas e bíceps', PT.costas], ['SEXTA-FEIRA – Ombros e glúteos', PT.gluteos]]) {
        r = bloque(ws, r, t, ejs, { enc, fmt });
      }
      hojaMedidas(wb, { nombre: 'Avaliação' });
    }, ['Treino semanal'], [['SEGUNDA-FEIRA – Membros inferiores', 5], ['TERÇA-FEIRA – Peito e tríceps', 5], ['QUARTA-FEIRA – Cardio e abdômen', 4],
      ['QUINTA-FEIRA – Costas e bíceps', 5], ['SEXTA-FEIRA – Ombros e glúteos', 4]], ['datos_no_usados'], []],

    ['16 · pt: «DIA 1 … DIA 4» lado a lado, sin columna vacía', (wb) => {
      const ws = wb.addWorksheet('Planilha1');
      [['A', 'C', 'DIA 1 – SUPERIORES', PT.peito], ['D', 'F', 'DIA 2 – INFERIORES', PT.pernas], ['G', 'I', 'DIA 3 – SUPERIORES', PT.costas], ['J', 'L', 'DIA 4 – INFERIORES', PT.gluteos]]
        .forEach(([de, a, t, ejs]) => {
          titulo(ws, 1, de, a, t);
          fila(ws, 2, de, ['Exercício', 'Séries', 'Reps'].map(b));
          ejs.forEach((e, i) => fila(ws, 3 + i, de, [e[0], e[1], e[2]]));
        });
    }, ['Planilha1'], [['DIA 1 – SUPERIORES', 5], ['DIA 2 – INFERIORES', 5], ['DIA 3 – SUPERIORES', 5], ['DIA 4 – INFERIORES', 4]], [], []],

    ['19 · planificador LUNES..DOMINGO en columnas, con el enfoque abajo y dos DESCANSO', (wb) => {
      const ws = wb.addWorksheet('Planificador');
      titulo(ws, 1, 'A', 'G', 'PLANIFICADOR SEMANAL DE ENTRENAMIENTO');
      fila(ws, 3, 'A', ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'].map(b));
      fila(ws, 4, 'A', ['Pierna', 'Pecho', 'Espalda', 'DESCANSO', 'Hombros', 'Full body', 'DESCANSO']);
      const cols = [ES.pierna.slice(0, 5), ES.empuje.slice(0, 5), ES.tiron.slice(0, 5), [], ES.hombro.slice(0, 4), ES.fullbody];
      for (let i = 0; i < 5; i++) fila(ws, 5 + i, 'A', cols.map((ejs) => (ejs[i] ? `${ejs[i][0]} ${ejs[i][1]}x${ejs[i][2]}` : null)));
    }, ['Planificador'], [['LUNES – Pierna', 5], ['MARTES – Pecho', 5], ['MIÉRCOLES – Espalda', 5], ['VIERNES – Hombros', 4], ['SÁBADO – Full body', 5]],
    [], ['JUEVES: DESCANSO', 'DOMINGO: DESCANSO']],

    ['20 · pt: columna «Treino» combinada con A / B / C', (wb) => {
      const ws = wb.addWorksheet('Ficha');
      fila(ws, 1, 'A', ['Treino', 'Grupo', 'Exercício', 'Séries', 'Repetições', 'Descanso'].map(b));
      let r = 2;
      for (const [t, grupo, ejs] of [['A', 'Peito / Tríceps', PT.peito], ['B', 'Costas / Bíceps', PT.costas], ['C', 'Pernas', PT.pernas]]) {
        const ini = r;
        for (const e of ejs) { fila(ws, r, 'C', [e[0], e[1], e[2], e[4]]); r++; }
        celda(ws, `A${ini}`, b(t)); ws.mergeCells(`A${ini}:A${r - 1}`);
        celda(ws, `B${ini}`, grupo); ws.mergeCells(`B${ini}:B${r - 1}`);
      }
    }, ['Ficha'], [['A', 5], ['B', 5], ['C', 5]], [], []],

    ['22 · títulos abreviados combinados «LUN · Pierna», «MIÉ · Empuje», «VIE · Tirón»', (wb) => {
      const ws = wb.addWorksheet('Rutina');
      let r = 1;
      for (const [t, ejs] of [['LUN · Pierna', ES.pierna], ['MIÉ · Empuje', ES.empuje], ['VIE · Tirón', ES.tiron]]) {
        r = bloque(ws, r, t, ejs, { hasta: 'D', enc: ['Ejercicio', 'Series', 'Reps', 'Descanso'], fmt: (e) => [e[0], e[1], e[2], e[4]] });
      }
    }, ['Rutina'], [['LUN · Pierna', 6], ['MIÉ · Empuje', 6], ['VIE · Tirón', 6]], [], []],

    ['23 · pt: «Semana típica» + 3 blocos + Registro + Evolução', (wb) => {
      const ws = wb.addWorksheet('Treino');
      celda(ws, 'A1', b('Treino de força – Academia'));
      celda(ws, 'A2', 'Objetivo: ganhar força sem atrapalhar o jiu-jitsu.');
      celda(ws, 'A4', b('Semana típica'));
      fila(ws, 5, 'A', [b('Dia'), b('Atividade'), b('Foco')]); ws.mergeCells('C5:F5');
      [['Segunda-feira', 'Academia', 'Pernas'], ['Terça-feira', 'Jiu-jitsu', 'Técnica e rola'], ['Quarta-feira', 'Academia', 'Peito e ombros'],
        ['Quinta-feira', 'Jiu-jitsu', 'Técnica e rola'], ['Sexta-feira', 'Academia', 'Costas e bíceps (≈45 min)'], ['Sábado', 'Corrida leve', '30 min no parque'],
        ['Domingo', 'Descanso', 'Dormir bem']].forEach(([d, a, e], i) => { fila(ws, 6 + i, 'A', [b(d), a, e]); ws.mergeCells(`C${6 + i}:F${6 + i}`); });
      const enc = ['#', 'Exercício', 'Séries', 'Repetições', 'Descanso', 'Observações'];
      let r = bloque(ws, 14, 'SEGUNDA – Pernas', PT.pernas, { enc });
      r = bloque(ws, r, 'QUARTA – Peito e ombros', [...PT.peito.slice(0, 3), ...PT.ombros.slice(0, 3)], { enc });
      r = bloque(ws, r, 'SEXTA – Costas e bíceps', PT.costas, { enc });
      celda(ws, `A${r}`, 'Aquecimento: 5 min de bicicleta + 2 séries leves do primeiro exercício.');
      hojaRegistro(wb, { idioma: 'pt', ejemplo: ['Pernas', 'Agachamento livre', 70, 8] });
      hojaProgreso(wb, { nombre: 'Evolução', idioma: 'pt', pesoInicial: 81 });
    }, ['Treino'], [['SEGUNDA – Pernas', 5], ['Terça-feira – Jiu-jitsu', 0], ['QUARTA – Peito e ombros', 6], ['Quinta-feira – Jiu-jitsu', 0],
      ['SEXTA – Costas e bíceps', 5], ['Sábado – Corrida leve', 0], ['Domingo – Descanso', 0]], [], ['Aquecimento']],
  ];

  for (const [nombre, armar, hojasEsperadas, diasEsperados, permitidos, notas, semanas = null] of CASOS) {
    const libro = await libroDe(armar);
    const r = RP.planillaARutina(libro);
    const total = r.leida.dias.reduce((s, d) => s + d.ejercicios.length, 0);
    const conDatos = r.leida.dias.reduce((s, d) => s + d.ejercicios.filter((e) => e.series !== null && e.reps).length, 0);
    ok(`${nombre}: hojas, días, ejercicios por día, sin avisos falsos ni «no entendí»`, {
      hojas: usadas(r), dias: resumen(r), avisos: codigos(r).filter((c) => c !== 'videos' && !permitidos.includes(c)),
      noEntendidas: r.leida.noEntendidas, notas: notas.filter((n) => !r.leida.notas.includes(n)), semanas: r.semanas ? r.semanas.cuantas : null,
      todosConDatos: total === conDatos,
    }, { hojas: hojasEsperadas, dias: diasEsperados, avisos: [], noEntendidas: [], notas: [], semanas, todosConDatos: true });
  }

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 6 · Lo que no es la rutina no gana, aunque tenga más filas ──');
  // ═══════════════════════════════════════════════════════════
  const LLENO = await libroDe((wb) => {
    const ws = wb.addWorksheet('Rutina');
    let r = bloque(ws, 1, 'LUNES – Pierna', ES.pierna);
    bloque(ws, r, 'JUEVES – Torso', ES.empuje);
    // Un registro ya usado: 600 series con fecha (más ejercicios con series que la rutina).
    const reg = wb.addWorksheet('Registro');
    fila(reg, 1, 'A', ['Fecha', 'Sesión', 'Ejercicio', 'Serie', 'Peso (kg)', 'Reps'].map(b));
    for (let i = 0; i < 600; i++) fila(reg, 2 + i, 'A', [fecha(2026, 10, 1 + (i % 28)), 'Pierna', ES.pierna[i % 6][0], 1 + (i % 4), 60, 8]);
    // Un resumen con los resultados ya calculados (series registradas: 12).
    hojaResumen(wb, { hoja: 'Rutina', celdas: ES.pierna.map((e, i) => [3 + i, e[0]]) });
  });
  const RLLENO = RP.planillaARutina(LLENO);
  ok('un registro de 600 series y un resumen calculado no se usan; tampoco avisan «leímos las primeras 500»',
    [usadas(RLLENO), resumen(RLLENO), codigos(RLLENO), LLENO.hojas[1].recortada], [['Rutina'], [['LUNES – Pierna', 6], ['JUEVES – Torso', 6]], [], true]);
  ok('si el trainer suma el registro, el aviso sí aparece', codigos(RP.planillaARutina(LLENO, { hojas: { Registro: true } })).includes('filas_recortadas'), true);

  const SOLO_REGISTRO = await libroDe((wb) => {
    const reg = wb.addWorksheet('Hoja1');
    fila(reg, 1, 'A', ['Fecha', 'Ejercicio', 'Series', 'Reps'].map(b));
    fila(reg, 2, 'A', [fecha(2026, 10, 1), 'Sentadilla', 4, 10]);
  });
  ok('un libro que solo tiene un registro: se usa igual (como antes)', [usadas(RP.planillaARutina(SOLO_REGISTRO)), resumen(RP.planillaARutina(SOLO_REGISTRO))],
    [['Hoja1'], [['', 1]]]);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 7 · La semana tipo cuando no se puede armar la semana ──');
  // ═══════════════════════════════════════════════════════════
  const deTexto = (filas, op) => RP.planillaARutina(P.libroDesdeTexto(filas.map((f) => f.join('\t')).join('\n')), op);
  const SEMANA = [['Semana tipo'], ['Día', 'Actividad', 'Enfoque'], ['Lunes', 'Gimnasio', 'Pierna'], ['Miércoles', 'Natación', '40 min'], ['Viernes', 'Gimnasio', 'Torso'], ['']];
  const SIN_DIAS = deTexto([...SEMANA, ['DÍA 1 – Pierna'], ['Ejercicio', 'Series', 'Reps'], ['Sentadilla', '4', '10'], [''], ['Treino B – Torso'], ['Ejercicio', 'Series', 'Reps'], ['Press banca', '4', '8']]);
  ok('bloques «Día 1» / «Treino B» (sin día de la semana): los días quedan, la semana tipo va a las notas', [resumen(SIN_DIAS), SIN_DIAS.leida.notas, SIN_DIAS.leida.noEntendidas],
    [[['DÍA 1 – Pierna', 1], ['Treino B – Torso', 1]], 'Semana tipo:\nLunes: Gimnasio – Pierna\nMiércoles: Natación – 40 min\nViernes: Gimnasio – Torso', []]);
  const ONCE = deTexto([['Día', 'Actividad'], ...['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => [d, 'Cardio']), [''],
    ['LUNES – Pierna'], ['Ejercicio', 'Series', 'Reps'], ['Sentadilla', '4', '10'],
    ...['A', 'B', 'C', 'D'].flatMap((l) => [[''], [`Día ${l}`], ['Ejercicio', 'Series', 'Reps'], ['Remo', '3', '12']])]);
  ok('si la semana armada pasaría de 10 días, la semana tipo va a las notas', [ONCE.leida.dias.length, ONCE.leida.notas.split('\n').length], [5, 7]);
  const SIN_ENCABEZADO = deTexto([['Lunes', 'Pecho'], ['Miércoles', 'Espalda'], ['Viernes', 'Pierna'], [''],
    ['LUNES – Pecho'], ['Ejercicio', 'Series', 'Reps'], ['Press banca', '4', '10'], [''], ['MIÉRCOLES – Espalda'], ['Ejercicio', 'Series', 'Reps'], ['Remo', '4', '10'],
    [''], ['VIERNES – Pierna'], ['Ejercicio', 'Series', 'Reps'], ['Sentadilla', '4', '10']]);
  ok('una semana tipo sin encabezado (tres filas o más): ningún día roto', [resumen(SIN_ENCABEZADO), SIN_ENCABEZADO.leida.dias.map((d) => d.notas), SIN_ENCABEZADO.leida.noEntendidas],
    [[['LUNES – Pecho', 1], ['MIÉRCOLES – Espalda', 1], ['VIERNES – Pierna', 1]], ['', '', ''], []]);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 8 · «Pegar texto» de Excel: una celda con renglones adentro ──');
  // ═══════════════════════════════════════════════════════════
  const CALENDARIO = 'Semana\tLunes\tMartes\nSemana 1\t"Sentadilla 4x10\nPrensa 3x12"\tPress banca 4x8\nSemana 2\t"Sentadilla 4x8\nPrensa 3x10"\tPress banca 4x6';
  ok('la celda entre comillas (como copia Excel) es UNA celda', P.libroDesdeTexto(CALENDARIO).hojas[0].filas.map((f) => f.map((c) => c && c.texto)),
    [['Semana', 'Lunes', 'Martes'], ['Semana 1', 'Sentadilla 4x10\nPrensa 3x12', 'Press banca 4x8'], ['Semana 2', 'Sentadilla 4x8\nPrensa 3x10', 'Press banca 4x6']]);
  const CAL = RP.pegadoComoPlanilla(CALENDARIO);
  ok('y el calendario pegado: un día por columna, con la semana elegida', [resumen(CAL), CAL.semanas, resumen(RP.pegadoComoPlanilla(CALENDARIO, { semana: 2 })),
    RP.pegadoComoPlanilla(CALENDARIO, { semana: 2 }).leida.dias[0].ejercicios.map((e) => e.reps)],
  [[['Lunes', 2], ['Martes', 1]], { cuantas: 2, elegida: 1, nombres: ['Semana 1', 'Semana 2'] }, [['Lunes', 2], ['Martes', 1]], ['8', '10']]);
  ok('unas comillas escritas a mano quedan como estaban', [P.libroDesdeTexto('"Bajar lento"\tx').hojas[0].filas[0].map((c) => c && c.texto),
    P.libroDesdeTexto('A\tB\r\n\tC\n').hojas[0].filas.map((f) => f.map((c) => c && c.texto))], [['"Bajar lento"', 'x'], [['A', 'B'], [null, 'C'], [null]]]);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 9 · La revisión y los textos ──');
  // ═══════════════════════════════════════════════════════════
  const extras = leer('src/components/rutinas/editor/ExtrasPlanilla.tsx');
  const importar = leer('src/components/rutinas/editor/ImportarPlanilla.tsx');
  // Los chips son de toda planilla desde la 122 (la lista de productos los usa también).
  const chips = leer('src/components/planilla/ChipsDeHojas.tsx');
  ok('las hojas con ejercicios son botones (aria-pressed), y la última que queda no se saca',
    [/aria-pressed=\{h\.usada\}/.test(chips), /disabled=\{h\.usada && usadasActivables <= 1\}/.test(chips),
      /<ChipsDeHojas/.test(extras), /activable: h\.conEjercicios/.test(extras)], [true, true, true, true]);
  ok('ImportarPlanilla pasa las hojas elegidas, se reinician con otro archivo y se mantienen al cambiar de semana',
    [/planillaARutina\(libro, \{ semana, hojas \}\)/.test(importar), (importar.match(/setHojas\(\{\}\)/g) || []).length,
      /onSemana=\{\(n\) => \{ setSemana\(n\); setVueltas\(\[\]\); \}\}/.test(importar)], [true, 2, true]);
  const textos = ['hojaNoUsadaConEjercicios', 'hojasNoUsadas', 'tocalaParaSumarla', 'tocaUnaParaSumarla'];
  ok('los textos nuevos, en es y pt', textos.filter((k) => !es.importar[k] || !pt.importar[k]), []);
  const { planillaEs, planillaPt } = cargarTs('src/i18n/textos/planilla.ts');
  ok('y el nombre de los chips, en los textos de toda planilla', [planillaEs.hojas, planillaPt.hojas], ['Hojas de la planilla', 'Abas da planilha']);
  ok('una sola hoja sin usar', [`${es.importar.hojaNoUsadaConEjercicios('Guía')} ${es.importar.tocalaParaSumarla}`, pt.importar.hojaNoUsadaConEjercicios('Dicas')],
    ['No usamos la hoja Guía. Tocala para sumarla.', 'Não usamos a aba Dicas.']);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 10 · La revisión (30/09): cada planilla que todavía fallaba ──');
  // ═══════════════════════════════════════════════════════════
  /** Una hoja escrita fila por fila desde A1 ('' y null: celda vacía). */
  const tabla = (ws, filas) => filas.forEach((f, i) => fila(ws, i + 1, 'A', f.map((v) => (v === '' ? null : v))));
  const ENC4 = ['Ejercicio', 'Series', 'Reps', 'Descanso'];
  /** Título combinado + encabezado + ejercicios tal cual. */
  const bloqueTal = (ws, r, t, ejs, enc = ENC4) => bloque(ws, r, t, ejs, { hasta: String.fromCharCode(64 + enc.length), enc, fmt: (e) => e });
  const E3 = [['Sentadilla', 4, '8', '2 min'], ['Prensa', 3, '12', '90 s'], ['Gemelos', 4, '15', '45 s']];
  const E4 = [['Press banca', 4, '8', '2 min'], ['Remo con barra', 4, '8', '2 min'], ['Press militar', 3, '10', '90 s'], ['Dominadas', 3, '8', '90 s']];
  const E5 = [['Peso muerto', 3, '5', '3 min'], ['Press inclinado', 3, '10', '90 s'], ['Zancadas', 3, '10', '90 s'], ['Face pull', 3, '15', '60 s'], ['Plancha', 3, '40 s', '45 s']];
  const comoPegado = (libro) => RP.pegadoComoPlanilla(comoTexto(libro.hojas[0]));
  const cuantasSemanas = (r) => (r.semanas ? r.semanas.cuantas : null);

  // H1 · La semana y el día en el mismo título.
  const MESO = await libroDe((wb) => {
    const ws = wb.addWorksheet('Mesociclo');
    titulo(ws, 1, 'A', 'E', 'Mesociclo de fuerza – 4 semanas');
    const base = [['LUNES', ['Sentadilla', 'Prensa', 'Peso muerto rumano', 'Zancadas', 'Plancha']],
      ['MIÉRCOLES', ['Press banca', 'Press militar', 'Fondos', 'Elevaciones laterales']], ['VIERNES', ['Peso muerto', 'Dominadas', 'Remo con barra', 'Curl con barra', 'Face pull']]];
    let r = 3;
    for (let s = 1; s <= 4; s++) {
      for (const [dia, ejs] of base) {
        r = bloqueTal(ws, r, `SEMANA ${s} / ${dia}`, ejs.map((e, j) => [e, s === 4 ? 2 : 4, ['10', '8', '6', '12'][s - 1], `${40 + 5 * s + j * 2} kg`, '2 min']),
          ['Ejercicio', 'Series', 'Reps', 'Carga', 'Descanso']);
      }
    }
  });
  const MESO1 = RP.planillaARutina(MESO);
  ok('H1 · «SEMANA 1 / LUNES» … «SEMANA 4 / VIERNES»: 3 días de la semana 1 y el selector de 4 semanas (antes 12 días y «Usar» apagado)',
    [resumen(MESO1), MESO1.semanas, MESO1.leida.nombre, MESO1.leida.noEntendidas, MESO1.leida.dias.length <= M.TOPES.dias],
    [[['LUNES', 5], ['MIÉRCOLES', 4], ['VIERNES', 5]], { cuantas: 4, elegida: 1, nombres: ['SEMANA 1', 'SEMANA 2', 'SEMANA 3', 'SEMANA 4'] },
      'Mesociclo de fuerza – 4 semanas', [], true]);
  const MESO4 = RP.planillaARutina(MESO, { semana: 4 });
  ok('H1 · la semana 4 elegida: los mismos días, con sus series, repeticiones y cargas', [resumen(MESO4), MESO4.leida.dias[0].ejercicios.slice(0, 2).map(corto)],
    [[['LUNES', 5], ['MIÉRCOLES', 4], ['VIERNES', 5]], [['Sentadilla', 2, '12', '60 kg', 120, ''], ['Prensa', 2, '12', '62 kg', 120, '']]]);
  ok('H1 · y por «Pegar texto», lo mismo', [resumen(comoPegado(MESO)), cuantasSemanas(comoPegado(MESO))], [[['LUNES', 5], ['MIÉRCOLES', 4], ['VIERNES', 5]], 4]);
  const SEM_DIA = await libroDe((wb) => {
    const ws = wb.addWorksheet('Plan');
    let r = 1;
    for (let s = 1; s <= 2; s++) [E3, E4, E5].forEach((ejs, i) => { r = bloqueTal(ws, r, `Semana ${s} – Día ${i + 1}`, ejs); });
  });
  const SEMANA_PT = await libroDe((wb) => {
    const ws = wb.addWorksheet('Treino');
    let r = 1;
    for (let s = 1; s <= 4; s++) [['SEGUNDA', E3], ['QUARTA', E4], ['SEXTA', E5]].forEach(([d, ejs]) => { r = bloqueTal(ws, r, `SEMANA ${s} / ${d}`, ejs, ['Exercício', 'Séries', 'Repetições', 'Intervalo']); });
  });
  ok('H1 · «Semana 1 – Día 1» (2 semanas, antes las dos mezcladas) y en pt «SEMANA 1 / SEGUNDA» (4 semanas)',
    [resumen(RP.planillaARutina(SEM_DIA)), cuantasSemanas(RP.planillaARutina(SEM_DIA)), resumen(RP.planillaARutina(SEMANA_PT)), cuantasSemanas(RP.planillaARutina(SEMANA_PT))],
    [[['Día 1', 3], ['Día 2', 4], ['Día 3', 5]], 2, [['SEGUNDA', 3], ['QUARTA', 4], ['SEXTA', 5]], 4]);
  const UNA_SEMANA = await libroDe((wb) => {
    const ws = wb.addWorksheet('Plan');
    let r = bloqueTal(ws, 1, 'Semana 1 – Día 1', E3);
    bloqueTal(ws, r, 'Semana 1 – Día 2', E4);
  });
  ok('H1 · con una sola semana no hay nada que elegir: el título queda como está', [resumen(RP.planillaARutina(UNA_SEMANA)), RP.planillaARutina(UNA_SEMANA).semanas],
    [[['Semana 1 – Día 1', 3], ['Semana 1 – Día 2', 4]], null]);

  // H2 · Dos versiones de la misma rutina.
  const versiones = (hojas) => libroDe((wb) => {
    for (const [nombre, tituloHoja, bloques] of hojas) {
      const ws = wb.addWorksheet(nombre);
      let r = 1;
      if (tituloHoja) { celda(ws, 'A1', b(tituloHoja)); r = 3; }
      for (const [t, ejs] of bloques) r = bloqueTal(ws, r, t, ejs);
    }
  });
  const N8 = await versiones([
    ['Hoja1', 'Rutina noviembre', [['Lunes – Pierna', [['Sentadilla', 4, '6-8', '2 min'], ['Prensa', 4, '10', '2 min'], ['Peso muerto rumano', 3, '8', '2 min'], ['Gemelos', 4, '12', '60 s']]],
      ['Miércoles – Torso', [['Press banca', 4, '6-8', '2 min'], ['Remo con barra', 4, '8', '2 min'], ['Press militar', 3, '8', '90 s'], ['Dominadas lastradas', 3, '6', '2 min']]],
      ['Viernes – Full body', [['Peso muerto', 3, '5', '3 min'], ['Press inclinado', 3, '8', '90 s'], ['Zancadas', 3, '10', '90 s'], ['Face pull', 3, '15', '60 s']]]]],
    ['Rutina anterior', 'Rutina octubre (anterior)', [['Lunes – Pierna', [['Sentadilla', 3, '10', '90 s'], ['Prensa', 3, '12', '90 s'], ['Sillón de cuádriceps', 3, '15', '60 s']]],
      ['Miércoles – Torso', [['Press banca', 3, '10', '90 s'], ['Remo con mancuerna', 3, '12', '90 s'], ['Elevaciones laterales', 3, '15', '60 s']]],
      ['Viernes – Full body', [['Sentadilla goblet', 3, '12', '60 s'], ['Flexiones', 3, '12', '60 s'], ['Jalón al pecho', 3, '12', '60 s']]]]],
  ]);
  const RN8 = RP.planillaARutina(N8);
  ok('H2 · «Hoja1» (noviembre) y «Rutina anterior» (octubre) con los mismos días: solo la actual (antes 6 días repetidos)',
    [usadas(RN8), resumen(RN8), RN8.leida.nombre, RN8.hojas.map((h) => h.conEjercicios)],
    [['Hoja1'], [['Lunes – Pierna', 4], ['Miércoles – Torso', 4], ['Viernes – Full body', 4]], 'Rutina noviembre', [true, true]]);
  ok('H2 · la revisión lo dice, y el trainer puede sumar la anterior con un toque',
    [`${es.importar.hojaNoUsadaConEjercicios('Rutina anterior')} ${es.importar.tocalaParaSumarla}`, resumen(RP.planillaARutina(N8, { hojas: { 'Rutina anterior': true } })).length],
    ['No usamos la hoja Rutina anterior. Tocala para sumarla.', 6]);
  const COPIA = await versiones([['Rutina', null, [['Lunes', E3.slice(0, 2)], ['Miércoles', E4.slice(0, 3)], ['Viernes', E5.slice(0, 4)]]],
    ['Rutina (2)', null, [['Lunes', E3], ['Miércoles', E4], ['Viernes', E5]]]]);
  const MESES = await versiones([['Octubre', null, [['Lunes – Pierna', E3], ['Miércoles – Torso', E4], ['Viernes – Full', E5]]],
    ['Noviembre', null, [['Lunes – Pierna', E3], ['Miércoles – Torso', E4], ['Viernes – Full', E5]]]]);
  ok('H2 · «Rutina» y su copia «Rutina (2)»: la que tiene más; «Octubre» y «Noviembre» iguales: la de más a la derecha',
    [usadas(RP.planillaARutina(COPIA)), resumen(RP.planillaARutina(COPIA)), usadas(RP.planillaARutina(MESES)), resumen(RP.planillaARutina(MESES)).length],
    [['Rutina (2)'], [['Lunes', 3], ['Miércoles', 4], ['Viernes', 5]], ['Noviembre'], 3]);
  const COMPLEMENTO = await versiones([['Gimnasio', null, [['Lunes', E3], ['Miércoles', E4]]], ['Casa', null, [['Martes', E3], ['Jueves', E5]]]]);
  ok('H2 · dos hojas con días distintos (gimnasio y casa) se usan las dos', [usadas(RP.planillaARutina(COMPLEMENTO)), resumen(RP.planillaARutina(COMPLEMENTO))],
    [['Gimnasio', 'Casa'], [['Lunes', 3], ['Miércoles', 4], ['Martes', 3], ['Jueves', 5]]]);

  // H3 · Una lista de ejercicios al lado de la rutina.
  const BIB = ['Sentadilla', 'Prensa', 'Gemelos', 'Press banca', 'Remo con barra', 'Press militar', 'Dominadas', 'Peso muerto', 'Press inclinado', 'Zancadas',
    'Face pull', 'Plancha', 'Curl con barra', 'Curl martillo', 'Fondos', 'Elevaciones laterales', 'Hip thrust', 'Sillón de cuádriceps', 'Camilla femoral', 'Jalón al pecho',
    'Remo con mancuerna', 'Aperturas', 'Extensión de tríceps', 'Abdominales', 'Puente de glúteos', 'Peso muerto rumano', 'Estocadas', 'Pájaros', 'Encogimientos', 'Press francés'];
  const CON_LISTA = (nombre, cuantos) => libroDe((wb) => {
    const ws = wb.addWorksheet('Rutina');
    let r = bloqueTal(ws, 1, 'Lunes', E3);
    r = bloqueTal(ws, r, 'Miércoles', E4);
    bloqueTal(ws, r, 'Viernes', E5);
    const bi = wb.addWorksheet(nombre);
    fila(bi, 1, 'A', ['Ejercicio', 'Grupo muscular', 'Series', 'Reps', 'Video'].map(b));
    for (let i = 0; i < cuantos; i++) {
      fila(bi, 2 + i, 'A', [i < BIB.length ? BIB[i] : `Ejercicio de prueba ${i + 1}`, ['Piernas', 'Pecho', 'Espalda'][i % 3], 3, '10-12', { text: 'Ver', hyperlink: `https://youtu.be/x${i}` }]);
    }
  });
  const L30 = RP.planillaARutina(await CON_LISTA('Ejercicios', 30));
  const L40 = RP.planillaARutina(await CON_LISTA('Banco de ejercicios', 40));
  ok('H3 · «Ejercicios» (30, con video) y «Banco de ejercicios» (40) al lado de la rutina: solo la rutina (antes un día «Ejercicios» de 30, o solo el banco)',
    [usadas(L30), resumen(L30), codigos(L30), usadas(L40), resumen(L40)],
    [['Rutina'], [['Lunes', 3], ['Miércoles', 4], ['Viernes', 5]], [], ['Rutina'], [['Lunes', 3], ['Miércoles', 4], ['Viernes', 5]]]);
  ok('H3 · sola, la lista se usa igual (un libro de una hoja nunca queda vacío)',
    resumen(RP.planillaARutina({ hojas: [(await CON_LISTA('Ejercicios', 12)).hojas[1]] })), [['Ejercicios', 12]]);

  // H4 · «DESCANSO» escrito en la columna de un día.
  const V1B = await libroDe((wb) => {
    tabla(wb.addWorksheet('Semana'), [['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'].map(b),
      ['Sentadilla 4x8', 'Press banca 4x8', 'DESCANSO', 'Peso muerto 3x5', 'Dominadas 4x6'],
      ['Prensa 3x12', 'Press militar 3x10', null, 'Hip thrust 3x10', 'Remo 4x8'], ['Gemelos 4x15', 'Fondos 3x10', null, 'Zancadas 3x10', null]]);
  });
  const RV1B = RP.planillaARutina(V1B);
  ok('H4 · días en la fila 1 y «DESCANSO» en la columna del miércoles: a las notas de la rutina (antes «no entendí» y el miércoles sin rastro)',
    [resumen(RV1B), RV1B.leida.notas, RV1B.leida.noEntendidas, RP.pegadoComoPlanilla(comoTexto(V1B.hojas[0])).leida.notas],
    [[['LUNES', 3], ['MARTES', 3], ['JUEVES', 3], ['VIERNES', 2]], 'MIÉRCOLES: DESCANSO', [], 'MIÉRCOLES: DESCANSO']);
  const V1B_NOTA = RP.pegadoComoPlanilla('LUNES\tMIÉRCOLES\nSentadilla 4x8\tDescanso activo\nPrensa 3x12\tCaminar 30 min');
  const V1B_SERIES = RP.pegadoComoPlanilla('LUNES\tMIÉRCOLES\nSentadilla 4x8\tDescanso 90 s\nPrensa 3x12\tPress banca 4x8');
  ok('H4 · con su nota abajo, igual; «Descanso 90 s» arriba de los ejercicios no es un día libre',
    [V1B_NOTA.leida.notas, resumen(V1B_NOTA), resumen(V1B_SERIES)], ['MIÉRCOLES: Descanso activo · Caminar 30 min', [['LUNES', 2]], [['LUNES', 2], ['MIÉRCOLES', 1]]]);

  // H5 · Una tabla de progresión o de asistencia con forma de calendario.
  const PROGRESION = [[], [b('Progresión de intensidad')], ['Semana', 'Lunes', 'Miércoles', 'Viernes'].map(b), ['Semana 1', '70%', '70%', '70%'],
    ['Semana 2', '75%', '75%', '75%'], ['Semana 3', '80%', '80%', '80%'], ['Semana 4', 'Descarga', 'Descarga', 'Descarga']];
  const NOTAS_PROGRESION = 'Progresión de intensidad:\nSemana 1: 70%\nSemana 2: 75%\nSemana 3: 80%\nSemana 4: Descarga';
  const FORMAS = [
    ['días lado a lado', [['LUNES', '', '', '', 'MIÉRCOLES', '', '', '', 'VIERNES'].map((t) => (t ? b(t) : t)),
      [...ENC4.slice(0, 3), '', ...ENC4.slice(0, 3), '', ...ENC4.slice(0, 3)], ['Sentadilla', 4, 10, '', 'Press banca', 4, 10, '', 'Peso muerto', 4, 6],
      ['Prensa', 4, 12, '', 'Remo con barra', 4, 10, '', 'Dominadas', 4, 8], ['Curl femoral', 3, 12, '', 'Press militar', 3, 10, '', 'Fondos', 3, 10]],
    [['LUNES', 3], ['MIÉRCOLES', 3], ['VIERNES', 3]]],
    ['fila de días, una columna por día', [['LUNES', 'MIÉRCOLES', 'VIERNES'].map(b), ['Sentadilla 4x10', 'Press banca 4x10', 'Peso muerto 4x6'], ['Prensa 3x12', 'Remo 4x10', 'Zancadas 3x10']],
      [['LUNES', 2], ['MIÉRCOLES', 2], ['VIERNES', 2]]],
    ['columna Día', [['Día', 'Ejercicio', 'Series', 'Reps'].map(b), ['Lunes', 'Sentadilla', 4, 10], ['Lunes', 'Prensa', 4, 12], ['Miércoles', 'Press banca', 4, 10],
      ['Miércoles', 'Remo', 4, 10], ['Viernes', 'Peso muerto', 4, 6]], [['Lunes', 2], ['Miércoles', 2], ['Viernes', 1]]],
  ];
  for (const [forma, filas, dias] of FORMAS) {
    const libro = await libroDe((wb) => tabla(wb.addWorksheet('Rutina'), [...filas, ...PROGRESION]));
    const subida = RP.planillaARutina(libro);
    const pegada = comoPegado(libro);
    ok(`H5 · ${forma} + «Semana | Lunes | …» con 70 %: los días enteros, la progresión en las notas, sin selector de semanas falso (subida y pegada)`,
      [resumen(subida), subida.leida.notas, subida.semanas, subida.leida.noEntendidas, resumen(pegada), pegada.leida.notas, pegada.semanas],
      [dias, NOTAS_PROGRESION, null, [], dias, NOTAS_PROGRESION, null]);
  }
  const ASISTENCIA = await libroDe((wb) => tabla(wb.addWorksheet('Rutina'), [...FORMAS[0][1], [], [b('Control de asistencia')], ['Semana', 'Lunes', 'Miércoles', 'Viernes'].map(b),
    ['Semana 1', '✓', '✓', ''], ['Semana 2'], ['Semana 3'], ['Semana 4']]));
  const RASIS = RP.planillaARutina(ASISTENCIA);
  ok('H5 · una asistencia (✓ o vacía): los días enteros, nada en las notas, sin selector; el aviso nombra la tabla',
    [resumen(RASIS), RASIS.leida.notas, RASIS.semanas, RASIS.leida.noEntendidas, RASIS.avisos],
    [FORMAS[0][2], '', null, [], [{ codigo: 'datos_no_usados', etiquetas: ['Control de asistencia'] }]]);
  const SIN_LLENAR = await libroDe((wb) => {
    const ws = wb.addWorksheet('Plan mensual');
    fila(ws, 1, 'A', ['Semana', 'Lunes', 'Miércoles'].map(b));
    for (let s = 1; s <= 3; s++) fila(ws, 1 + s, 'A', [b(`Semana ${s}`), `Sentadilla 4x${12 - 2 * s}\nPrensa 3x12`, `Press banca 4x${12 - 2 * s}`]);
    celda(ws, 'A5', b('Semana 4'));
  });
  ok('H5 · el calendario de verdad sigue andando, también con la semana 4 sin llenar', [resumen(RP.planillaARutina(SIN_LLENAR)), cuantasSemanas(RP.planillaARutina(SIN_LLENAR)),
    RP.planillaARutina(SIN_LLENAR, { semana: 3 }).leida.dias[0].ejercicios.map((e) => e.reps)], [[['Lunes', 2], ['Miércoles', 1]], 4, ['6', '12']]);

  // H6 · Hojas chicas que son parte de la rutina.
  const LIBROS_H6 = [
    ['«DÍA 3 – CORE Y CARDIO» en Hoja3 con 2 ejercicios (los otros con 12)', (wb) => {
      bloqueTal(wb.addWorksheet('Hoja1'), 1, 'DÍA 1 - PIERNA', [...E3, ...E4, ...E5]);
      bloqueTal(wb.addWorksheet('Hoja2'), 1, 'DÍA 2 - TORSO', [...E4, ...E5, ...E3]);
      bloqueTal(wb.addWorksheet('Hoja3'), 1, 'DÍA 3 - CORE Y CARDIO', [['Plancha', 3, '45 s', '30 s'], ['Bicicleta', 1, '20 min', null]]);
    }, ['Hoja1', 'Hoja2', 'Hoja3'], [['DÍA 1 - PIERNA', 12], ['DÍA 2 - TORSO', 12], ['DÍA 3 - CORE Y CARDIO', 2]]],
    ['Pecho / Espalda / Abdominales (1 ejercicio)', (wb) => {
      tabla(wb.addWorksheet('Pecho'), [ENC4, ...E4, ...E5.slice(0, 4)]);
      tabla(wb.addWorksheet('Espalda'), [ENC4, ...E5, ...E3]);
      tabla(wb.addWorksheet('Abdominales'), [ENC4, ['Plancha', 3, '45 s', '30 s']]);
    }, ['Pecho', 'Espalda', 'Abdominales'], [['Pecho', 8], ['Espalda', 8], ['Abdominales', 1]]],
    ['Rutina + «Calentamiento» en su hoja', (wb) => {
      const ws = wb.addWorksheet('Rutina');
      bloqueTal(ws, bloqueTal(ws, 1, 'LUNES', [...E3, ...E4]), 'MIÉRCOLES', E5);
      tabla(wb.addWorksheet('Calentamiento'), [ENC4, ['Movilidad de cadera', 1, '10', null], ['Sentadilla con peso corporal', 2, '15', '30 s']]);
    }, ['Rutina', 'Calentamiento'], [['LUNES', 7], ['MIÉRCOLES', 5], ['Calentamiento', 2]]],
    ['nombres traídos con BUSCARV desde un banco + una guía con «2x10»', (wb) => {
      const r = wb.addWorksheet('Rutina');
      fila(r, 1, 'A', ['Código', ...ENC4].map(b));
      ['Sentadilla', 'Press banca', 'Remo con barra', 'Press militar', 'Peso muerto'].forEach((n, i) => fila(r, 2 + i, 'A', [i + 1, { f: `VLOOKUP(A${i + 2},Banco!A:B,2,0)`, r: n }, 4, 10, 90]));
      tabla(wb.addWorksheet('Banco'), [['Código', 'Ejercicio'], [1, 'Sentadilla'], [2, 'Press banca'], [3, 'Remo con barra'], [4, 'Press militar'], [5, 'Peso muerto']]);
      tabla(wb.addWorksheet('Guía'), [['Calentamiento'], ['Sentadilla sin peso 2x10'], ['Movilidad de hombros 2x15']]);
    }, ['Rutina', 'Guía'], [['', 5], ['Guía', 2]]],
    ['un plan con fecha («Fecha | Ejercicio | Series | Reps») + tips', (wb) => {
      const r = wb.addWorksheet('Plan');
      fila(r, 1, 'A', ['Fecha', ...ENC4].map(b));
      ['Sentadilla', 'Press banca', 'Remo con barra'].forEach((n, i) => fila(r, 2 + i, 'A', [fecha(2026, 10, 5), n, 4, 10]));
      tabla(wb.addWorksheet('Tips'), [['Recordá'], ['Plancha 3x30 s al final de cada sesión']]);
    }, ['Plan', 'Tips'], [['', 3], ['Tips', 1]]],
  ];
  for (const [nombre, armar, hojasEsperadas, diasEsperados] of LIBROS_H6) {
    const r = RP.planillaARutina(await libroDe(armar));
    ok(`H6 · ${nombre}: se usan todas las hojas de la rutina (como antes de la planilla de Matías)`, [usadas(r), resumen(r)], [hojasEsperadas, diasEsperados]);
  }
  const SEMANAS_ABD = await libroDe((wb) => {
    for (let s = 1; s <= 3; s++) { const ws = wb.addWorksheet(`Semana ${s}`); bloqueTal(ws, bloqueTal(ws, 1, 'DÍA A', E4), 'DÍA B', E5); }
    tabla(wb.addWorksheet('Abdominales'), [ENC4, ['Plancha', 3, '45 s', '30 s']]);
  });
  ok('H6 · una hoja por semana + «Abdominales», con la semana 2 elegida: también los abdominales',
    [usadas(RP.planillaARutina(SEMANAS_ABD, { semana: 2 })), resumen(RP.planillaARutina(SEMANAS_ABD, { semana: 2 }))],
    [['Semana 2', 'Abdominales'], [['DÍA A', 4], ['DÍA B', 5], ['Abdominales', 1]]]);
  const REGISTRO_VACIO = await libroDe((wb) => {
    bloqueTal(wb.addWorksheet('Rutina'), 1, 'LUNES', E3);
    tabla(wb.addWorksheet('Registro'), [['Fecha', 'Ejercicio', 'Serie', 'Peso', 'Reps'].map(b), [fecha(2026, 9, 1), 'Sentadilla', 1, 80, 10]]);
  });
  ok('H6 · un registro recién empezado («Serie» en singular, una fila de ejemplo) sigue afuera', usadas(RP.planillaARutina(REGISTRO_VACIO)), ['Rutina']);

  // H7 · «Dom. pronas» en una planilla de un día (los casos de texto, en rutinas-texto.test.js).
  const UN_DIA = await libroDe((wb) => tabla(wb.addWorksheet('Rutina'), [['Espalda'], ['Dom. pronas'], ['4x8'], ['Remo con barra 4x10'], ['Face pull 3x15']]));
  const AGARRE = await libroDe((wb) => tabla(wb.addWorksheet('Rutina'), [['ESPALDA'], ['Remo con barra 4x10'], ['Dom. pronas', 'agarre ancho'], ['Face pull 3x15']]));
  ok('H7 · «Dom. pronas» con sus series abajo, o con «agarre ancho» al lado: un ejercicio, no un día',
    [RP.planillaARutina(UN_DIA).leida.dias.map((d) => d.ejercicios.map((e) => [e.nombre, e.series, e.reps])), resumen(RP.planillaARutina(AGARRE))],
    [[[['Dom. pronas', 4, '8'], ['Remo con barra', 4, '10'], ['Face pull', 3, '15']]], [['', 3]]]);

  // H8 · La semana tipo con «Martes:» en su celda.
  const DOS_PUNTOS = await libroDe((wb) => tabla(wb.addWorksheet('Rutina'), [['Semana tipo'], ['Día', 'Actividad', 'Enfoque'].map(b), ['Lunes:', 'Gimnasio', 'Piernas'],
    ['Martes:', 'MMA', 'Técnica'], ['Miércoles:', 'Gimnasio', 'Empuje'], [], [b('LUNES – Piernas')], ENC4.map(b), ['Sentadilla', 4, 10, '2 min'], [],
    [b('MIÉRCOLES – Empuje')], ENC4.map(b), ['Press banca', 4, 10, '2 min']]));
  const DISTRIBUCION = await libroDe((wb) => tabla(wb.addWorksheet('Rutina'), [['Distribución semanal'], ['Lunes y jueves:', 'Tren inferior'],
    ['Martes y viernes:', 'Tren superior'], ['Miércoles:', 'Cardio 30 min'], [], ['TREN INFERIOR'], ENC4, ['Sentadilla', 4, 10, null], [], ['TREN SUPERIOR'], ENC4, ['Press banca', 4, 10, null]]));
  ok('H8 · «Martes:» en la semana tipo: el día es «Martes – MMA», y en las notas «Lunes y jueves: Tren inferior» (sin «::»)',
    [resumen(RP.planillaARutina(DOS_PUNTOS)), RP.planillaARutina(DISTRIBUCION).leida.notas],
    [[['LUNES – Piernas', 1], ['Martes – MMA', 0], ['MIÉRCOLES – Empuje', 1]],
      'Distribución semanal:\nLunes y jueves: Tren inferior\nMartes y viernes: Tren superior\nMiércoles: Cardio 30 min']);

  console.log(fallos === 0 ? `\n>>> TODAS LAS PRUEBAS PASARON (${corridas} comprobaciones)` : `\n>>> ${fallos} DE ${corridas} FALLARON`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
