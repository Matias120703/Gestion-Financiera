/**
 * Importar la rutina desde una planilla (114): Excel, CSV y Google Sheets.
 *
 * Los archivos se arman acá, EN MEMORIA, con exceljs, celda por celda como
 * los describe PLANILLAS-EJEMPLO.md (F1-F10, N1-N10 y G): formas reales de
 * planillas de trainers en español y portugués, con los nombres de las
 * personas inventados. No hay archivos en el repo.
 *
 * Lo que más importa:
 *   · lo que no se entiende no se inventa, y la carga nunca gana una unidad
 *     (todo termina en `leerRutina`, el mismo lector de «Pegar texto»);
 *   · los datos de la persona (Alumno, Fecha, Profesor) y las hojas que no
 *     son de ejercicios (Medidas, Anamnese) no aparecen en NINGÚN lado;
 *   · de una planilla con varias semanas sale UNA rutina, nunca todas juntas;
 *   · un archivo raro (Excel viejo, LibreOffice, Numbers, zip bomba, texto
 *     renombrado) se frena con un código claro y SIN abrirlo con exceljs;
 *   · el link de Google Sheets se arma de cero y nunca se sigue a otro host.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const P = require('../.compilado/planilla.js');
const X = require('../.compilado/planilla-xlsx.js');
const G = require('../.compilado/enlace-sheets.js');
const RP = require('../.compilado/rutina-planilla.js');
const R = require('../.compilado/rutina-texto.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a.length > 140 ? a.slice(0, 137) + '...' : a);
}

// ─────────────────────────── cómo se arman las planillas ───────────────────────────

/** Pone un valor con la notación de PLANILLAS-EJEMPLO.md. */
function poner(c, v) {
  if (v === null || v === undefined) return;
  if (typeof v === 'object') {
    if ('b' in v) { poner(c, v.b); c.font = { bold: true }; return; }
    if (v.d) { c.value = new Date(Date.UTC(v.d[0], v.d[1] - 1, v.d[2])); c.numFmt = v.fmt; return; }
    if ('h' in v) { c.value = v.h; c.numFmt = v.fmt; return; }
    if ('p' in v) { c.value = v.p; c.numFmt = '0%'; return; }
    if (v.link) { c.value = { text: v.text, hyperlink: v.link }; return; }
    if (v.formula) { c.value = { formula: v.formula, result: v.result }; return; }
  }
  c.value = v;
}
const col = (letra) => letra.split('').reduce((n, x) => n * 26 + x.charCodeAt(0) - 64, 0);
/** Una fila desde una columna: `null` es una celda vacía. */
function fila(ws, r, desde, valores) {
  valores.forEach((v, i) => poner(ws.getRow(r).getCell(col(desde) + i), v));
}
const celda = (ws, dir, v) => poner(ws.getCell(dir), v);
const b = (t) => ({ b: t });
const D = (y, m, d, fmt) => ({ d: [y, m, d], fmt });
const H130 = { h: 0.0625, fmt: 'h:mm' };
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function aBytes(wb) { return new Uint8Array(await wb.xlsx.writeBuffer()); }
async function leer(wb) {
  const libro = await X.leerXlsx(await aBytes(wb));
  if (libro.error) throw new Error(`no se pudo leer: ${libro.error}`);
  return libro;
}

/** Un ejercicio en corto: [nombre, series, reps, carga, descanso, nota, junto]. */
const corto = (e) => [e.nombre, e.series, e.reps, e.carga, e.descanso_seg, e.nota, e.junto_al_anterior];
const dias = (res) => res.leida.dias.map((d) => [d.nombre, d.ejercicios.map(corto)]);
const videos = (res) => Object.fromEntries(RP.videosDeLaRutina(res.leida).map((v) => [v.nombre, v.url]));
const todoElTexto = (res) => JSON.stringify(res);

// Para comprobar que un archivo raro NO se abre con exceljs.
const XLSX = require('exceljs/lib/xlsx/xlsx.js');
let aperturas = 0;
const cargarOriginal = XLSX.prototype.load;
XLSX.prototype.load = function (...a) { aperturas++; return cargarOriginal.apply(this, a); };

(async () => {
  // ═══════════════════════════════════════════════════════════
  console.log('\n── 1 · planilla.ts: firmas, zips raros y CSV ──');
  // ═══════════════════════════════════════════════════════════
  const N1 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(512).fill(0)]);
  ok('N1 · un .xls viejo (o un .xlsx con contraseña): xls_viejo', [P.firmaDeArchivo(N1), await X.leerXlsx(N1)], ['xls_viejo', { error: 'xls_viejo' }]);

  const ods = new JSZip();
  ods.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet', { compression: 'STORE' });
  ods.file('content.xml', '<office:document-content/>');
  const N2 = await ods.generateAsync({ type: 'uint8array' });
  ok('N2 · un LibreOffice (.ods): ods', [P.revisarZip(N2), await X.leerXlsx(N2)], [{ error: 'ods' }, { error: 'ods' }]);

  const numbers = new JSZip();
  numbers.file('Index/Document.iwa', 'x');
  numbers.file('Metadata/Properties.plist', 'x');
  const N3 = await numbers.generateAsync({ type: 'uint8array' });
  ok('N3 · un Numbers: numbers', [P.revisarZip(N3), await X.leerXlsx(N3)], [{ error: 'numbers' }, { error: 'numbers' }]);

  // N7: el directorio central dice que se infla a más de 40 MB (armado a mano).
  const chico = new JSZip();
  chico.file('xl/workbook.xml', '<workbook/>');
  chico.file('xl/worksheets/sheet1.xml', '<worksheet/>');
  const N7 = await chico.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  ok('un zip con xl/workbook.xml pasa la revisión', P.revisarZip(N7), { ok: true });
  const vista = new DataView(N7.buffer, N7.byteOffset, N7.byteLength);
  for (let i = 0; i < N7.length - 4; i++) {
    if (vista.getUint32(i, true) === 0x02014b50) { vista.setUint32(i + 24, 41 * 1024 * 1024, true); break; }
  }
  ok('N7 · zip bomba (41 MB declarados): no_es_planilla', [P.revisarZip(N7), await X.leerXlsx(N7)], [{ error: 'no_es_planilla' }, { error: 'no_es_planilla' }]);

  // N7b: la bomba que MIENTE. El directorio central dice 1000 bytes y adentro
  // hay 120 MB de ceros (armado a mano: ~120 KB). revisarZip lo deja pasar
  // (mira lo declarado); leerXlsx descomprime de verdad, contando, y corta a
  // los 40 MB sin llegar a exceljs (que antes lo inflaba entero en memoria).
  const cerosComprimidos = async (mb) => {
    const d = zlib.createDeflateRaw({ level: 9 });
    const partes = [];
    d.on('data', (p) => partes.push(p));
    const fin = new Promise((listo) => d.on('end', listo));
    const mega = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < mb; i++) if (!d.write(mega)) await new Promise((listo) => d.once('drain', listo));
    d.end();
    await fin;
    return Buffer.concat(partes);
  };
  /** Un zip escrito byte por byte, con el tamaño descomprimido que uno quiera declarar. */
  const zipAMano = (entradas) => {
    const locales = [], centrales = [];
    let desplazamiento = 0;
    for (const e of entradas) {
      const nombre = Buffer.from(e.nombre);
      const l = Buffer.alloc(30);
      l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(e.metodo, 8);
      l.writeUInt32LE(e.datos.length, 18); l.writeUInt32LE(e.declarado, 22); l.writeUInt16LE(nombre.length, 26);
      locales.push(l, nombre, e.datos);
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(e.metodo, 10);
      c.writeUInt32LE(e.datos.length, 20); c.writeUInt32LE(e.declarado, 24); c.writeUInt16LE(nombre.length, 28); c.writeUInt32LE(desplazamiento, 42);
      centrales.push(c, nombre);
      desplazamiento += 30 + nombre.length + e.datos.length;
    }
    const directorio = Buffer.concat(centrales);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
    fin.writeUInt32LE(directorio.length, 12); fin.writeUInt32LE(desplazamiento, 16);
    return new Uint8Array(Buffer.concat([...locales, directorio, fin]));
  };
  const libroXml = Buffer.from('<workbook/>');
  const N7b = zipAMano([
    { nombre: 'xl/workbook.xml', metodo: 0, datos: libroXml, declarado: libroXml.length },
    { nombre: 'xl/worksheets/sheet1.xml', metodo: 8, datos: await cerosComprimidos(120), declarado: 1000 },
  ]);
  const antesBomba = aperturas;
  ok('N7b · el archivo pesa menos de 4 MB y el directorio declara poco: revisarZip lo deja pasar',
    [N7b.length < P.TOPES_PLANILLA.bytes, P.revisarZip(N7b)], [true, { ok: true }]);
  ok('N7b · zip bomba que miente (1000 bytes declarados, 120 MB de verdad): no_es_planilla, sin abrirlo con exceljs',
    [await X.leerXlsx(N7b), aperturas - antesBomba], [{ error: 'no_es_planilla' }, 0]);
  const chicoQueMiente = zipAMano([
    { nombre: 'xl/workbook.xml', metodo: 0, datos: libroXml, declarado: libroXml.length },
    { nombre: 'xl/worksheets/sheet1.xml', metodo: 8, datos: zlib.deflateRawSync(Buffer.alloc(5000)), declarado: 10 },
  ]);
  ok('un zip chico que miente en el tamaño tampoco se lee (y no rompe nada)', await X.leerXlsx(chicoQueMiente), { error: 'no_es_planilla' });

  const N10 = new TextEncoder().encode('Hola, esto no es una planilla. Sentadilla 4x10.');
  ok('N10 · un texto renombrado a .xlsx: no_es_planilla', [P.firmaDeArchivo(N10), await X.leerXlsx(N10)], ['otro', { error: 'no_es_planilla' }]);
  const sinLibro = new JSZip();
  sinLibro.file('word/document.xml', '<w:document/>');
  ok('un .docx (zip sin xl/workbook.xml): no_es_planilla', P.revisarZip(await sinLibro.generateAsync({ type: 'uint8array' })), { error: 'no_es_planilla' });
  ok('ninguno de esos se abrió con exceljs', aperturas, 0);

  const N4 = new Uint8Array(P.TOPES_PLANILLA.bytes + 1);
  N4.set([0x50, 0x4b, 0x03, 0x04]);
  ok('N4 · más de 4 MB: muy_grande, sin abrirlo', [await X.leerXlsx(N4), aperturas], [{ error: 'muy_grande' }, 0]);
  ok('los topes (D3.11)', P.TOPES_PLANILLA, { bytes: 4194304, hojas: 20, filas: 500, columnas: 40, descomprimido: 41943040 });

  // F7: CSV «;» de Excel en español, en Windows-1252, con CRLF y un «;» adentro de comillas.
  const F7_TEXTO = [
    'Día;Ejercicio;Serie;Reps;Peso;Notas',
    'Lunes;Press banca;1;12;40;',
    'Lunes;Press banca;2;10;45;',
    'Lunes;Press banca;3;8;50;"Última al fallo; con ayudante"',
    'Lunes;Aperturas con mancuernas;1;12;12;',
    'Lunes;Aperturas con mancuernas;2;12;12;',
    'Lunes;Aperturas con mancuernas;3;12;12;',
    'Jueves;Sentadilla;1;10;60;',
    'Jueves;Sentadilla;2;8;70;',
    'Jueves;Sentadilla;3;6;80;',
    'Jueves;Estocadas;1;12 c/pierna;10;',
    'Jueves;Estocadas;2;12 c/pierna;10;',
  ].join('\r\n') + '\r\n';
  const F7 = P.libroDesdeCsv(new Uint8Array(Buffer.from(F7_TEXTO, 'latin1')));
  const f7filas = F7.hojas[0].filas.map((f) => f.map((c) => (c ? c.texto : '')));
  ok('F7 · Windows-1252: «Día» y «Última» salen bien; «;» detectado', f7filas[0], ['Día', 'Ejercicio', 'Serie', 'Reps', 'Peso', 'Notas']);
  ok('F7 · el «;» adentro de comillas no corta la celda', f7filas[3], ['Lunes', 'Press banca', '3', '8', '50', 'Última al fallo; con ayudante']);
  ok('F7 · una hoja sin nombre y 12 filas (CRLF)', [F7.hojas.length, F7.hojas[0].nombre, F7.hojas[0].filas.length], [1, '', 12]);

  const F8_TEXTO = 'Ejercicio,Series,Reps,Carga,Descanso,Notas\nSentadilla goblet,3,15,16 kg,60,\nHip thrust,4,12,40 kg,90,"Apretar arriba, 1 s"\n'
    + 'Peso muerto rumano con mancuernas,3,10,2x12 kg,90,\nAbducción con banda,3,20,banda verde,45,\nPlancha,3,40 s,,30,\n';
  const F8 = P.libroDesdeCsv(new TextEncoder().encode(F8_TEXTO));
  ok('F8 · CSV de Google (coma, UTF-8): la coma adentro de comillas', F8.hojas[0].filas[2].map((c) => (c ? c.texto : '')),
    ['Hip thrust', '4', '12', '40 kg', '90', 'Apretar arriba, 1 s']);
  const F8B = P.libroDesdeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(F8_TEXTO.replace(/,/g, ';')
    .replace('Apretar arriba; 1 s', 'Apretar arriba, 1 s').replace(/\n/g, '\r\n'))]));
  ok('F8b · «CSV UTF-8» de Excel: BOM, «;» y CRLF', [F8B.hojas[0].filas[0][0].texto, F8B.hojas[0].filas[2][5].texto, F8B.hojas[0].filas.length],
    ['Ejercicio', 'Apretar arriba, 1 s', 6]);
  ok('comillas dobles adentro («""»)', P.libroDesdeCsv(new TextEncoder().encode('a;"dijo ""bajá"" lento";c')).hojas[0].filas[0].map((c) => c.texto),
    ['a', 'dijo "bajá" lento', 'c']);
  ok('libroDesdeTexto: una fila por renglón, celdas por tabulador', P.libroDesdeTexto('A\tB\r\n\tC').hojas[0].filas.map((f) => f.map((c) => c && c.texto)),
    [['A', 'B'], [null, 'C']]);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 2 · planilla-xlsx.ts: lo que Excel cambió, combinadas, links, ocultas ──');
  // ═══════════════════════════════════════════════════════════
  // F1 · Una hoja por día (Excel de escritorio, Paraguay).
  const f1 = new ExcelJS.Workbook();
  const encabezadoF1 = (ws) => {
    celda(ws, 'A1', b('RUTINA DE ENTRENAMIENTO')); ws.mergeCells('A1:G1');
    celda(ws, 'A2', 'Alumno:'); celda(ws, 'B2', 'Juan Pérez'); ws.mergeCells('B2:C2');
    celda(ws, 'E2', 'Fecha:'); celda(ws, 'F2', D(2026, 9, 1, 'dd/mm/yyyy'));
    celda(ws, 'A3', 'Objetivo:'); celda(ws, 'B3', 'Hipertrofia'); ws.mergeCells('B3:C3');
    fila(ws, 5, 'A', ['N°', 'Ejercicio', 'Series', 'Repeticiones', 'Peso (kg)', 'Descanso', 'Observaciones'].map(b));
  };
  const lunes = f1.addWorksheet('Lunes - Piernas');
  encabezadoF1(lunes);
  fila(lunes, 6, 'A', [1, 'Sentadilla con barra', 4, D(2026, 10, 8, 'd-mmm'), 60, H130, 'Bajar hasta la paralela']);
  fila(lunes, 7, 'A', [2, 'Prensa 45°', 4, 12, 120, 90]);
  fila(lunes, 8, 'A', [3, 'Estocadas', 3, '12 c/pierna', 12.5, 60]);
  fila(lunes, 9, 'A', [4, 'Sillón de cuádriceps', 3, 15, 'placa 5', 60]);
  fila(lunes, 10, 'A', [5, 'Gemelos parado', 4, 20, null, 45, 'Pausa arriba']);
  fila(lunes, 11, 'A', [6, 'Plancha', 3, '45 s']);
  const miercoles = f1.addWorksheet('Miércoles - Torso');
  encabezadoF1(miercoles);
  fila(miercoles, 6, 'A', [1, 'Press banca plano', 4, D(2026, 8, 6, 'd-mmm'), 40, '2 min']);
  fila(miercoles, 7, 'A', [2, 'Remo con barra', 4, 10, 35, 90]);
  fila(miercoles, 8, 'A', [3, 'Press militar', 3, 10, 20, 60]);
  fila(miercoles, 9, 'A', [4, 'Jalón al pecho', 3, D(2026, 12, 10, 'd-mmm'), 45, 60]);
  fila(miercoles, 10, 'A', [5, 'Curl martillo', 3, 12, 10, 45, 'Alternar brazos']);
  fila(miercoles, 11, 'A', [6, 'Fondos', 3, 'al fallo', null, 60]);
  const viernes = f1.addWorksheet('Viernes - Full body');
  encabezadoF1(viernes);
  fila(viernes, 6, 'A', [1, 'Peso muerto rumano', 3, 10, 50, 120]);
  fila(viernes, 7, 'A', [2, 'Hip thrust', 4, 12, 70, 90]);
  fila(viernes, 8, 'A', [3, 'Remo con mancuerna', 3, '12 c/lado', '20 lb', 60]);
  fila(viernes, 9, 'A', [4, 'Face pull', 3, 15, 'placa 4', 45]);
  fila(viernes, 10, 'A', [5, 'Abdominales', 3, 20, null, 30, 'Sin tirar del cuello']);
  const medidas = f1.addWorksheet('Medidas');
  fila(medidas, 1, 'A', [b('Fecha'), b('Peso'), b('Cintura')]);
  fila(medidas, 2, 'A', [D(2026, 9, 1, 'dd/mm/yyyy'), 82.5, 90]);
  fila(medidas, 3, 'A', [D(2026, 9, 15, 'dd/mm/yyyy'), 81.9, 89]);
  const listas = f1.addWorksheet('Listas', { state: 'hidden' });
  ['Sentadilla con barra', 'Prensa 45°', 'Press banca plano', 'Remo con barra', 'Hip thrust'].forEach((t, i) => celda(listas, `A${i + 1}`, t));
  const F1 = await leer(f1);
  ok('(una planilla de verdad sí se abre con exceljs: el contador anda)', aperturas > 0, true);

  const hojaLunes = F1.hojas[0].filas.map((f) => f.map((c) => (c ? c.texto : '')));
  ok('F1 · la hoja oculta «Listas» no se lee', F1.hojas.map((h) => h.nombre), ['Lunes - Piernas', 'Miércoles - Torso', 'Viernes - Full body', 'Medidas']);
  ok('F1 · combinada horizontal: el título solo en A1, B1..G1 vacías', hojaLunes[0], ['RUTINA DE ENTRENAMIENTO', '', '', '', '', '', '']);
  ok('F1 · «8-10» que Excel hizo 8 de octubre vuelve «8-10», y marcada', [hojaLunes[5][3], F1.hojas[0].filas[5][3].fecha], ['8-10', true]);
  ok('F1 · «6-8» y «10-12»', [F1.hojas[1].filas[5][3].texto, F1.hojas[1].filas[8][3].texto], ['6-8', '10-12']);
  ok('F1 · la hora «1:30» vuelve «1:30» (sin marca de fecha)', [hojaLunes[5][5], !!F1.hojas[0].filas[5][5].fecha], ['1:30', false]);
  ok('F1 · 12.5 con coma, como lo vio el trainer', hojaLunes[7][4], '12,5');
  ok('F1 · la negrita del encabezado', F1.hojas[0].filas[4][1].negrita, true);

  // F4 · Ficha de treino (Brasil): logo, combinada vertical, links y HYPERLINK.
  const f4 = new ExcelJS.Workbook();
  const ficha = f4.addWorksheet('Ficha de Treino');
  ficha.addImage(f4.addImage({ base64: PNG_1X1, extension: 'png' }), 'A1:B4');
  celda(ficha, 'C1', b('FICHA DE TREINO')); ficha.mergeCells('C1:H1');
  celda(ficha, 'C2', 'Aluno(a):'); celda(ficha, 'D2', 'Maria Souza'); ficha.mergeCells('D2:E2');
  celda(ficha, 'F2', 'Professor:'); celda(ficha, 'G2', 'Carlos Lima'); ficha.mergeCells('G2:H2');
  celda(ficha, 'C3', 'Objetivo:'); celda(ficha, 'D3', 'Emagrecimento'); ficha.mergeCells('D3:E3');
  celda(ficha, 'F3', 'Início:'); celda(ficha, 'G3', D(2026, 9, 1, 'dd/mm/yyyy'));
  celda(ficha, 'C4', 'Frequência:'); celda(ficha, 'D4', '3x por semana'); ficha.mergeCells('D4:E4');
  celda(ficha, 'F4', 'Validade:'); celda(ficha, 'G4', '8 semanas');
  const encF4 = ['Grupo muscular', 'Exercício', 'Séries', 'Repetições', 'Carga', 'Intervalo', 'Observação', 'Vídeo'].map(b);
  celda(ficha, 'A6', b('TREINO A – PEITO, OMBRO E TRÍCEPS')); ficha.mergeCells('A6:H6');
  fila(ficha, 7, 'A', encF4);
  fila(ficha, 8, 'A', ['Peito', 'Supino reto', 4, '10', '30 kg', "60''", null, { text: 'Ver vídeo', link: 'https://youtu.be/supino123' }]);
  fila(ficha, 9, 'A', [null, 'Supino inclinado com halteres', 3, '12', '14 kg', "60''", null,
    { formula: 'HYPERLINK("https://www.youtube.com/watch?v=incl456","▶")', result: '▶' }]);
  fila(ficha, 10, 'A', [null, 'Crucifixo', 3, '12', '10 kg', '45s', 'Bi-set com crossover']);
  ficha.mergeCells('A8:A10');
  fila(ficha, 11, 'A', ['Ombro', 'Desenvolvimento com halteres', 3, '10', '12 kg', "1'30''"]);
  fila(ficha, 12, 'A', ['Tríceps', 'Tríceps corda', 3, '15', 'placa 5', '45s', 'Até a falha na última']);
  celda(ficha, 'A14', b('TREINO B – COSTAS E BÍCEPS')); ficha.mergeCells('A14:H14');
  fila(ficha, 15, 'A', encF4);
  fila(ficha, 16, 'A', ['Costas', 'Puxada frontal', 4, '10', '40 kg', "60''"]);
  fila(ficha, 17, 'A', [null, 'Remada baixa', 4, '12', '35 kg', "60''"]);
  ficha.mergeCells('A16:A17');
  fila(ficha, 18, 'A', ['Bíceps', 'Rosca direta', 3, '12', '10 kg', '45s', null, { text: 'Ver vídeo', link: 'https://youtu.be/rosca789' }]);
  const anamnese = f4.addWorksheet('Anamnese');
  fila(anamnese, 1, 'A', [b('Pergunta'), b('Resposta')]);
  fila(anamnese, 2, 'A', ['Tem alguma lesão?', 'Joelho direito operado em 2024']);
  fila(anamnese, 3, 'A', ['Pratica atividade física?', 'Caminhada 2x por semana']);
  fila(anamnese, 4, 'A', ['Usa medicamentos?', 'Não']);
  const F4 = await leer(f4);
  const fichaFilas = F4.hojas[0].filas;
  ok('F4 · combinada vertical: «Peito» se repite hacia abajo en la misma columna', [fichaFilas[7][0].texto, fichaFilas[8][0].texto, fichaFilas[9][0].texto], ['Peito', 'Peito', 'Peito']);
  ok('F4 · un link {text, hyperlink}: el texto y el link', [fichaFilas[7][7].texto, fichaFilas[7][7].link], ['Ver vídeo', 'https://youtu.be/supino123']);
  ok('F4 · la fórmula HYPERLINK: el link sale de la fórmula', [fichaFilas[8][7].texto, fichaFilas[8][7].link], ['▶', 'https://www.youtube.com/watch?v=incl456']);
  ok('F4 · la imagen del logo no es una celda: A1 vacía', fichaFilas[0][0], null);

  const porcentaje = new ExcelJS.Workbook();
  const pw = porcentaje.addWorksheet('Hoja1');
  celda(pw, 'A1', { p: 0.75 }); celda(pw, 'B1', { formula: 'A1*2', result: 1.5 }); celda(pw, 'C1', { richText: [{ text: 'Press ' }, { text: 'banca' }] });
  pw.getColumn(4).hidden = true; celda(pw, 'D1', 'oculta'); celda(pw, 'E1', 'Remo\nbajar lento');
  const PC = await leer(porcentaje);
  ok('«75%», el resultado de una fórmula, texto enriquecido, columna oculta afuera',
    PC.hojas[0].filas[0].map((c) => c && c.texto), ['75%', '1,5', 'Press banca', 'Remo\nbajar lento']);

  // N6 · 3000 filas: se leen 500 y queda marcada.
  const n6 = new ExcelJS.Workbook();
  const larga = n6.addWorksheet('Larga');
  fila(larga, 1, 'A', ['Ejercicio', 'Series', 'Reps']);
  for (let i = 2; i <= 3000; i++) fila(larga, i, 'A', [`Ejercicio ${i}`, 3, 10]);
  const N6 = await leer(n6);
  ok('N6 · 3000 filas: 500 leídas y `recortada`', [N6.hojas[0].filas.length, N6.hojas[0].recortada], [500, true]);
  const N6R = RP.planillaARutina(N6);
  ok('N6 · el aviso de filas recortadas (y el tope de 30 por día lo frena la revisión)',
    [N6R.avisos.map((a) => a.codigo), N6R.leida.dias[0].ejercicios.length > 30], [['filas_recortadas'], true]);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 3 · rutina-planilla.ts: cada formato, como lo espera el trainer ──');
  // ═══════════════════════════════════════════════════════════
  const R1 = RP.planillaARutina(F1);
  ok('F1 · nombre (una vez aunque esté en tres hojas), indicaciones y sin semanas',
    [R1.leida.nombre, R1.leida.notas, R1.duracionSemanas, R1.semanas], ['RUTINA DE ENTRENAMIENTO', 'Objetivo: Hipertrofia', null, null]);
  ok('F1 · un día por hoja, con el nombre de la hoja', dias(R1), [
    ['Lunes - Piernas', [
      ['Sentadilla con barra', 4, '8-10', '60', 90, 'Bajar hasta la paralela', false],
      ['Prensa 45°', 4, '12', '120', 90, '', false],
      ['Estocadas', 3, '12 c/pierna', '12,5', 60, '', false],
      ['Sillón de cuádriceps', 3, '15', 'placa 5', 60, '', false],
      ['Gemelos parado', 4, '20', '', 45, 'Pausa arriba', false],
      ['Plancha', 3, '45 s', '', null, '', false]]],
    ['Miércoles - Torso', [
      ['Press banca plano', 4, '6-8', '40', 120, '', false],
      ['Remo con barra', 4, '10', '35', 90, '', false],
      ['Press militar', 3, '10', '20', 60, '', false],
      ['Jalón al pecho', 3, '10-12', '45', 60, '', false],
      ['Curl martillo', 3, '12', '10', 45, 'Alternar brazos', false],
      ['Fondos', 3, 'al fallo', '', 60, '', false]]],
    ['Viernes - Full body', [
      ['Peso muerto rumano', 3, '10', '50', 120, '', false],
      ['Hip thrust', 4, '12', '70', 90, '', false],
      ['Remo con mancuerna', 3, '12 c/lado', '20 lb', 60, '', false],
      ['Face pull', 3, '15', 'placa 4', 45, '', false],
      ['Abdominales', 3, '20', '', 30, 'Sin tirar del cuello', false]]]]);
  ok('F1 · «Medidas» no se usa; «Listas» (oculta) ni aparece', R1.hojas, [
    { nombre: 'Lunes - Piernas', usada: true }, { nombre: 'Miércoles - Torso', usada: true },
    { nombre: 'Viernes - Full body', usada: true }, { nombre: 'Medidas', usada: false }]);
  ok('F1 · avisos: fechas corregidas, cargas sin unidad con «(kg)» arriba, y las etiquetas (sin los valores)', R1.avisos, [
    { codigo: 'fecha_corregida', ejercicios: ['Sentadilla con barra', 'Press banca plano', 'Jalón al pecho'] },
    { codigo: 'cargas_sin_unidad' },
    { codigo: 'datos_no_usados', etiquetas: ['Alumno', 'Fecha'] }]);
  ok('F1 · ni Juan Pérez, ni sus medidas, ni «Fecha» como ejercicio: en ningún campo ni en lo no entendido',
    [/Juan|Pérez|82[,.]5|81[,.]9|Cintura/.test(todoElTexto(R1)), R1.leida.noEntendidas, R1.leida.dias.some((d) => d.ejercicios.some((e) => e.nombre === 'Fecha'))],
    [false, [], false]);
  ok('F1 · la carga nunca gana unidad: «60» con «Peso (kg)» sigue «60»', R1.leida.dias[0].ejercicios[0].carga, '60');

  // F2 · Días como bloques uno debajo del otro (Google Sheets, Argentina).
  const f2 = new ExcelJS.Workbook();
  const rutinaF2 = f2.addWorksheet('Rutina');
  celda(rutinaF2, 'A1', b('PLAN HIPERTROFIA – MES 1')); rutinaF2.mergeCells('A1:F1');
  celda(rutinaF2, 'A2', 'Duración:'); celda(rutinaF2, 'B2', '4 semanas');
  const encF2 = ['#', 'Ejercicio', 'Series x Reps', 'Carga', 'Descanso', 'Notas'].map(b);
  celda(rutinaF2, 'A4', b('DÍA 1 – TREN SUPERIOR')); rutinaF2.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEEFF' } }; rutinaF2.mergeCells('A4:F4');
  fila(rutinaF2, 5, 'A', encF2);
  fila(rutinaF2, 6, 'A', ['1', 'Press banca', '4x8-10', '40 kg', "2'"]);
  fila(rutinaF2, 7, 'A', ['2A', 'Remo con mancuerna', '3x12', '20 kg c/mano', null, 'Superserie con 2B']);
  fila(rutinaF2, 8, 'A', ['2B', 'Flexiones', '3x al fallo', null, '90"']);
  fila(rutinaF2, 9, 'A', ['3', 'Elevaciones laterales', '3x15', '6 kg', '60"', 'Controlar la bajada']);
  fila(rutinaF2, 10, 'A', ['4', 'Tríceps en polea', '3x12', 'placa 6', '60"']);
  celda(rutinaF2, 'A12', b('DÍA 2 – TREN INFERIOR')); rutinaF2.mergeCells('A12:F12');
  fila(rutinaF2, 13, 'A', encF2);
  fila(rutinaF2, 14, 'A', ['1', 'Sentadilla', '4 x 6-8', '70 kg', '3 min', 'RIR 2']);
  fila(rutinaF2, 15, 'A', ['2', 'Peso muerto rumano', '3 x 10', '50 kg', '2 min']);
  fila(rutinaF2, 16, 'A', ['3A', 'Hip thrust', '4x12', '60 kg']);
  fila(rutinaF2, 17, 'A', ['3B', 'Puente de glúteos', '3x20', 'peso corporal', '90 s']);
  fila(rutinaF2, 18, 'A', ['4', 'Plancha', '3x40s', null, '45 s']);
  celda(rutinaF2, 'A20', b('OBSERVACIONES GENERALES')); rutinaF2.mergeCells('A20:F20');
  celda(rutinaF2, 'A21', 'Calentar 10 minutos antes de empezar.'); rutinaF2.mergeCells('A21:F21');
  celda(rutinaF2, 'A22', 'Si la técnica se pierde, bajar el peso.'); rutinaF2.mergeCells('A22:F22');
  const R2 = RP.planillaARutina(await leer(f2));
  ok('F2 · nombre, «Duración: 4 semanas» a las semanas, y las OBSERVACIONES GENERALES a la rutina',
    [R2.leida.nombre, R2.duracionSemanas, R2.leida.notas],
    ['PLAN HIPERTROFIA – MES 1', 4, 'Calentar 10 minutos antes de empezar.\nSi la técnica se pierde, bajar el peso.']);
  ok('F2 · dos días; «2A/2B» y «3A/3B» en superserie', dias(R2), [
    ['DÍA 1 – TREN SUPERIOR', [
      ['Press banca', 4, '8-10', '40 kg', 120, '', false],
      ['Remo con mancuerna', 3, '12', '20 kg c/mano', null, 'Superserie con 2B', false],
      ['Flexiones', 3, 'al fallo', '', 90, '', true],
      ['Elevaciones laterales', 3, '15', '6 kg', 60, 'Controlar la bajada', false],
      ['Tríceps en polea', 3, '12', 'placa 6', 60, '', false]]],
    ['DÍA 2 – TREN INFERIOR', [
      ['Sentadilla', 4, '6-8', '70 kg', 180, 'RIR 2', false],
      ['Peso muerto rumano', 3, '10', '50 kg', 120, '', false],
      ['Hip thrust', 4, '12', '60 kg', null, '', false],
      ['Puente de glúteos', 3, '20', 'peso corporal', 90, '', true],
      ['Plancha', 3, '40 s', '', 45, '', false]]]]);
  ok('F2 · sin avisos, y los días sin notas', [R2.avisos, R2.leida.dias.map((d) => d.notas), R2.leida.noEntendidas], [[], ['', ''], []]);

  // F3a · Días en columnas, lado a lado, con encabezado por bloque.
  const f3a = new ExcelJS.Workbook();
  const lado = f3a.addWorksheet('Rutina');
  celda(lado, 'B2', b('LUNES – PECHO')); lado.mergeCells('B2:E2');
  celda(lado, 'G2', b('MIÉRCOLES – ESPALDA')); lado.mergeCells('G2:J2');
  celda(lado, 'L2', b('VIERNES – PIERNAS')); lado.mergeCells('L2:O2');
  for (const c of ['B', 'G', 'L']) fila(lado, 3, c, ['Ejercicio', 'Series', 'Reps', 'Kg'].map(b));
  fila(lado, 4, 'B', ['Press banca', 4, 10, 40, null, 'Jalón al pecho', 4, 10, 45, null, 'Sentadilla', 4, 8, 60]);
  fila(lado, 5, 'B', ['Press inclinado', 3, 12, 14, null, 'Remo con barra', 4, 10, 40, null, 'Prensa', 4, 12, 100]);
  fila(lado, 6, 'B', ['Aperturas', 3, 12, 10, null, 'Remo en polea baja', 3, 12, 35, null, 'Curl femoral', 3, 12, 'placa 5']);
  fila(lado, 7, 'B', ['Fondos', 3, 'al fallo', null, null, 'Pullover', 3, 12, 15, null, 'Gemelos', 4, 20]);
  fila(lado, 8, 'B', ['Cruce de poleas', 3, 15, 'placa 4', null, null, null, null, null, null, 'Abdominales', 3, 20]);
  fila(lado, 9, 'L', ['Plancha', 3, '30 s']);
  const F3A = await leer(f3a);
  const R3a = RP.planillaARutina(F3A);
  const F3A_DIAS = [
    ['LUNES – PECHO', [
      ['Press banca', 4, '10', '40', null, '', false], ['Press inclinado', 3, '12', '14', null, '', false],
      ['Aperturas', 3, '12', '10', null, '', false], ['Fondos', 3, 'al fallo', '', null, '', false],
      ['Cruce de poleas', 3, '15', 'placa 4', null, '', false]]],
    ['MIÉRCOLES – ESPALDA', [
      ['Jalón al pecho', 4, '10', '45', null, '', false], ['Remo con barra', 4, '10', '40', null, '', false],
      ['Remo en polea baja', 3, '12', '35', null, '', false], ['Pullover', 3, '12', '15', null, '', false]]],
    ['VIERNES – PIERNAS', [
      ['Sentadilla', 4, '8', '60', null, '', false], ['Prensa', 4, '12', '100', null, '', false],
      ['Curl femoral', 3, '12', 'placa 5', null, '', false], ['Gemelos', 4, '20', '', null, '', false],
      ['Abdominales', 3, '20', '', null, '', false], ['Plancha', 3, '30 s', '', null, '', false]]]];
  ok('F3a · tres bloques lado a lado: nada se pierde (hoy Lunes y Miércoles desaparecían)', dias(R3a), F3A_DIAS);
  ok('F3a · el aviso de «Kg» arriba con cargas sin unidad', [R3a.avisos, R3a.leida.nombre], [[{ codigo: 'cargas_sin_unidad' }], null]);

  // F3b · Sin encabezado, un día por columna (Google Sheets simple).
  const f3b = new ExcelJS.Workbook();
  const col3 = f3b.addWorksheet('Hoja 1');
  fila(col3, 1, 'A', [b('DÍA 1'), b('DÍA 2'), b('DÍA 3')]);
  fila(col3, 2, 'A', ['Sentadilla 4x10 60kg', 'Press banca 4x10 40kg', 'Peso muerto 4x6 80kg']);
  fila(col3, 3, 'A', ['Prensa 3x12', 'Remo 4x10 35kg', 'Hip thrust 4x12 60kg']);
  fila(col3, 4, 'A', ['Estocadas 3x10 c/pierna', 'Curl de bíceps 3x12']);
  fila(col3, 5, 'A', ['Gemelos 4x20']);
  const F3B = await leer(f3b);
  const F3B_DIAS = [
    ['DÍA 1', [['Sentadilla', 4, '10', '60 kg', null, '', false], ['Prensa', 3, '12', '', null, '', false],
      ['Estocadas', 3, '10 c/pierna', '', null, '', false], ['Gemelos', 4, '20', '', null, '', false]]],
    ['DÍA 2', [['Press banca', 4, '10', '40 kg', null, '', false], ['Remo', 4, '10', '35 kg', null, '', false],
      ['Curl de bíceps', 3, '12', '', null, '', false]]],
    ['DÍA 3', [['Peso muerto', 4, '6', '80 kg', null, '', false], ['Hip thrust', 4, '12', '60 kg', null, '', false]]]];
  const R3b = RP.planillaARutina(F3B);
  ok('F3b · un día por columna; «Hoja 1» es genérico y no se usa', [dias(R3b), R3b.leida.noEntendidas], [F3B_DIAS, []]);

  // F4 · la ficha entera.
  const R4 = RP.planillaARutina(F4);
  ok('F4 · nombre, «Validade: 8 semanas», Objetivo y Frequência a las indicaciones',
    [R4.leida.nombre, R4.duracionSemanas, R4.leida.notas], ['FICHA DE TREINO', 8, 'Objetivo: Emagrecimento\nFrequência: 3x por semana']);
  ok('F4 · Treino A y B; «Grupo muscular» se ignora y el video no va a la nota', dias(R4), [
    ['TREINO A – PEITO, OMBRO E TRÍCEPS', [
      ['Supino reto', 4, '10', '30 kg', 60, '', false],
      ['Supino inclinado com halteres', 3, '12', '14 kg', 60, '', false],
      ['Crucifixo', 3, '12', '10 kg', 45, 'Bi-set com crossover', false],
      ['Desenvolvimento com halteres', 3, '10', '12 kg', 90, '', false],
      ['Tríceps corda', 3, '15', 'placa 5', 45, 'Até a falha na última', false]]],
    ['TREINO B – COSTAS E BÍCEPS', [
      ['Puxada frontal', 4, '10', '40 kg', 60, '', false],
      ['Remada baixa', 4, '12', '35 kg', 60, '', false],
      ['Rosca direta', 3, '12', '10 kg', 45, '', false]]]]);
  ok('F4 · los tres links de video (con el link y la fórmula HYPERLINK)', videos(R4), {
    'Supino reto': 'https://youtu.be/supino123',
    'Supino inclinado com halteres': 'https://www.youtube.com/watch?v=incl456',
    'Rosca direta': 'https://youtu.be/rosca789',
  });
  ok('F4 · «Anamnese» no se usa', R4.hojas, [{ nombre: 'Ficha de Treino', usada: true }, { nombre: 'Anamnese', usada: false }]);
  ok('F4 · avisos: las etiquetas de la persona y los videos', R4.avisos, [
    { codigo: 'datos_no_usados', etiquetas: ['Aluno(a)', 'Professor', 'Início'] }, { codigo: 'videos', cuantos: 3 }]);
  ok('F4 · nada de Maria, Carlos, la lesión ni los medicamentos: en ningún campo ni en lo no entendido',
    [/Maria|Souza|Carlos|Lima|Joelho|lesão|medicamentos|Caminhada|Pergunta/i.test(todoElTexto(R4)), R4.leida.noEntendidas], [false, []]);

  // F5a · Semanas con subcolumnas (dos filas de encabezado).
  const f5a = new ExcelJS.Workbook();
  const meso = f5a.addWorksheet('Mesociclo 1');
  celda(meso, 'A1', b('MESOCICLO 1 – FUERZA')); meso.mergeCells('A1:O1');
  celda(meso, 'A3', b('Ejercicio')); meso.mergeCells('A3:A4');
  celda(meso, 'B3', b('Semana 1')); meso.mergeCells('B3:D3');
  celda(meso, 'E3', b('Semana 2')); meso.mergeCells('E3:G3');
  celda(meso, 'H3', b('Semana 3')); meso.mergeCells('H3:J3');
  celda(meso, 'K3', b('Semana 4 (descarga)')); meso.mergeCells('K3:M3');
  celda(meso, 'N3', b('Descanso')); meso.mergeCells('N3:N4');
  celda(meso, 'O3', b('Notas')); meso.mergeCells('O3:O4');
  fila(meso, 4, 'B', ['Series', 'Reps', 'RIR', 'Series', 'Reps', 'RIR', 'Series', 'Reps', 'RIR', 'Series', 'Reps', 'RIR'].map(b));
  celda(meso, 'A5', b('DÍA A')); meso.mergeCells('A5:O5');
  fila(meso, 6, 'A', ['Sentadilla', 4, 8, 3, 4, 8, 2, 5, 6, 2, 3, 8, 4, '3 min']);
  fila(meso, 7, 'A', ['Press banca', 4, 8, 3, 4, 7, 2, 5, 6, 1, 3, 8, 4, '2-3 min']);
  fila(meso, 8, 'A', ['Remo con barra', 3, 10, 2, 4, 10, 2, 4, 8, 1, 2, 10, 3, '2 min']);
  fila(meso, 9, 'A', ['Plancha', 3, '30 s', null, 3, '40 s', null, 3, '45 s', null, 2, '30 s', null, '60 s', 'Core apretado']);
  celda(meso, 'A10', b('DÍA B')); meso.mergeCells('A10:O10');
  fila(meso, 11, 'A', ['Peso muerto', 3, 5, 3, 3, 5, 2, 4, 4, 2, 2, 5, 4, '3 min']);
  fila(meso, 12, 'A', ['Press militar', 4, 8, 3, 4, 8, 2, 4, 6, 1, 3, 8, 4, '2 min']);
  fila(meso, 13, 'A', ['Dominadas', 4, 'al fallo', null, 4, 'al fallo', null, 5, 'al fallo', null, 3, '6', null, '2 min']);
  const F5A = await leer(f5a);
  const R5a = RP.planillaARutina(F5A);
  ok('F5a · semana 1 sola: nunca la semana 2 pisando a la 1', dias(R5a), [
    ['DÍA A', [['Sentadilla', 4, '8', '', 180, 'RIR: 3', false], ['Press banca', 4, '8', '', 180, 'RIR: 3', false],
      ['Remo con barra', 3, '10', '', 120, 'RIR: 2', false], ['Plancha', 3, '30 s', '', 60, 'Core apretado', false]]],
    ['DÍA B', [['Peso muerto', 3, '5', '', 180, 'RIR: 3', false], ['Press militar', 4, '8', '', 120, 'RIR: 3', false],
      ['Dominadas', 4, 'al fallo', '', 120, '', false]]]]);
  ok('F5a · nombre, sin inventar la duración, y las cuatro semanas', [R5a.leida.nombre, R5a.duracionSemanas, R5a.semanas, R5a.avisos],
    ['MESOCICLO 1 – FUERZA', null, { cuantas: 4, elegida: 1, nombres: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4 (descarga)'] }, []]);
  const R5a3 = RP.planillaARutina(F5A, { semana: 3 });
  ok('F5a · con la semana 3 elegida', [dias(R5a3), R5a3.semanas.elegida], [[
    ['DÍA A', [['Sentadilla', 5, '6', '', 180, 'RIR: 2', false], ['Press banca', 5, '6', '', 180, 'RIR: 1', false],
      ['Remo con barra', 4, '8', '', 120, 'RIR: 1', false], ['Plancha', 3, '45 s', '', 60, 'Core apretado', false]]],
    ['DÍA B', [['Peso muerto', 4, '4', '', 180, 'RIR: 2', false], ['Press militar', 4, '6', '', 120, 'RIR: 1', false],
      ['Dominadas', 5, 'al fallo', '', 120, '', false]]]], 3]);
  ok('F5a · una semana que no existe se acomoda a la última', RP.planillaARutina(F5A, { semana: 9 }).semanas.elegida, 4);
  ok('F5a · la planilla original no cambia al elegir otra semana', dias(RP.planillaARutina(F5A)), dias(R5a));

  // F5b · Una columna por semana.
  const f5b = new ExcelJS.Workbook();
  const prog = f5b.addWorksheet('Progresión');
  fila(prog, 1, 'A', ['Ejercicio', 'Series', 'Reps', 'S1', 'S2', 'S3', 'S4', 'Descanso'].map(b));
  fila(prog, 2, 'A', ['Sentadilla', 4, 8, '60 kg', '62,5 kg', '65 kg', '67,5 kg', 120]);
  fila(prog, 3, 'A', ['Press banca', 4, 10, '40 kg', '42,5 kg', '45 kg', '40 kg', 90]);
  fila(prog, 4, 'A', ['Plancha', 3, null, '30 s', '40 s', '45 s', '30 s', 60]);
  fila(prog, 5, 'A', ['Curl', 3, 12, 10, 12, 12, 10, 60]);
  const R5b = RP.planillaARutina(await leer(f5b));
  ok('F5b · S1: con unidad es la carga, con tiempo las repeticiones, un número solo a la nota', dias(R5b), [
    ['Progresión', [['Sentadilla', 4, '8', '60 kg', 120, '', false], ['Press banca', 4, '10', '40 kg', 90, '', false],
      ['Plancha', 3, '30 s', '', 60, '', false], ['Curl', 3, '12', '', 60, 'S1: 10', false]]]]);
  ok('F5b · cuatro semanas', R5b.semanas, { cuantas: 4, elegida: 1, nombres: ['S1', 'S2', 'S3', 'S4'] });

  // F6 · Programa de coach online: semanas apiladas, RIR, tempo, alternativas y video.
  const f6 = new ExcelJS.Workbook();
  const programa = f6.addWorksheet('Programa');
  const encF6 = ['Ejercicio', 'Series de aproximación', 'Series efectivas', 'Reps', 'RIR', 'Tempo', 'Descanso', 'Alternativa 1', 'Alternativa 2', 'Video', 'Notas'].map(b);
  const upper = (r, rir, reps) => {
    fila(programa, r, 'A', ['Press banca', 2, 3, reps[0], rir[0], '3-1-1', '~3 min', 'Press con mancuernas', 'Press en máquina', { text: 'Ver', link: 'https://youtu.be/pb1' }, 'Pausa de 1 s en el pecho']);
    fila(programa, r + 1, 'A', ['Remo con pecho apoyado', 1, 3, reps[1], rir[1], null, '~2 min', 'Remo en polea']);
    fila(programa, r + 2, 'A', ['Elevaciones laterales', 0, 3, reps[2], rir[2], null, '~1.5 min', 'Laterales en polea', null, { text: 'Ver', link: 'https://youtu.be/el1' }, 'Última serie: drop set']);
  };
  const lower = (r, rir) => {
    fila(programa, r, 'A', ['Sentadilla', 2, 3, '5-7', rir, '3-0-1', '~3 min', 'Sentadilla hack']);
    fila(programa, r + 1, 'A', ['Peso muerto rumano', 1, 3, '8-10', rir, null, '~2 min']);
    fila(programa, r + 2, 'A', ['Gemelos de pie', 1, 4, '10-12', rir === 2 ? 0 : rir, '2-1-1', '~1 min']);
  };
  celda(programa, 'A1', b('PROGRAMA UPPER / LOWER – 8 SEMANAS'));
  celda(programa, 'A3', b('SEMANA 1')); celda(programa, 'A4', b('UPPER 1')); fila(programa, 5, 'A', encF6);
  upper(6, [2, '1-2', 0], ['6-8', '8-10', '12-15']);
  celda(programa, 'A10', b('LOWER 1')); fila(programa, 11, 'A', encF6);
  lower(12, 2);
  celda(programa, 'A16', b('SEMANA 2')); celda(programa, 'A17', b('UPPER 1')); fila(programa, 18, 'A', encF6);
  upper(19, [1, 1, 0], ['6-8', '8-10', '12-15']);
  celda(programa, 'A23', b('LOWER 1')); fila(programa, 24, 'A', encF6);
  lower(25, 1);
  const instr = f6.addWorksheet('Instrucciones');
  celda(instr, 'A1', b('Cómo usar este programa'));
  celda(instr, 'A2', 'RIR = repeticiones en reserva. RIR 2 = te quedan 2 repeticiones.');
  celda(instr, 'A3', 'Tempo 3-1-1 = 3 s bajando, 1 s abajo, 1 s subiendo.');
  celda(instr, 'A4', 'Descansá lo indicado entre series.');
  const F6 = await leer(f6);
  const R6 = RP.planillaARutina(F6);
  ok('F6 · semana 1: UPPER 1 y LOWER 1, con « · », aproximación, RIR, tempo y alternativas; «~3 min» = 180', dias(R6), [
    ['UPPER 1', [
      ['Press banca', 3, '6-8', '', 180, 'Pausa de 1 s en el pecho · Aproximación: 2 · RIR: 2 · Tempo: 3-1-1 · Alternativas: Press con mancuernas, Press en máquina', false],
      ['Remo con pecho apoyado', 3, '8-10', '', 120, 'Aproximación: 1 · RIR: 1-2 · Alternativas: Remo en polea', false],
      ['Elevaciones laterales', 3, '12-15', '', 90, 'Última serie: drop set · RIR: 0 · Alternativas: Laterales en polea', false]]],
    ['LOWER 1', [
      ['Sentadilla', 3, '5-7', '', 180, 'Aproximación: 2 · RIR: 2 · Tempo: 3-0-1 · Alternativas: Sentadilla hack', false],
      ['Peso muerto rumano', 3, '8-10', '', 120, 'Aproximación: 1 · RIR: 2', false],
      ['Gemelos de pie', 4, '10-12', '', 60, 'Aproximación: 1 · RIR: 0 · Tempo: 2-1-1', false]]]]);
  ok('F6 · nombre, sin duración, dos semanas, «Instrucciones» sin usar, dos videos', [R6.leida.nombre, R6.duracionSemanas, R6.semanas, R6.hojas, R6.avisos, videos(R6)], [
    'PROGRAMA UPPER / LOWER – 8 SEMANAS', null, { cuantas: 2, elegida: 1, nombres: ['SEMANA 1', 'SEMANA 2'] },
    [{ nombre: 'Programa', usada: true }, { nombre: 'Instrucciones', usada: false }], [{ codigo: 'videos', cuantos: 2 }],
    { 'Press banca': 'https://youtu.be/pb1', 'Elevaciones laterales': 'https://youtu.be/el1' }]);
  ok('F6 · nunca cuatro días; «SEMANA 1» no queda como no entendido; nada de «Instrucciones»',
    [R6.leida.dias.length, R6.leida.noEntendidas, /repeticiones en reserva|Cómo usar/.test(todoElTexto(R6))], [2, [], false]);
  ok('F6 · con la semana 2: el RIR de la semana 2', RP.planillaARutina(F6, { semana: 2 }).leida.dias[0].ejercicios.map((e) => e.nota.split(' · ')[e.nota.startsWith('Pausa') ? 2 : 1]),
    ['RIR: 1', 'RIR: 1', 'RIR: 0']);

  // F7 · Una fila por serie (el CSV de arriba).
  const R7 = RP.planillaARutina(F7);
  ok('F7 · una fila por serie se junta: series = cuántas, «12-10-8», «40-45-50»', dias(R7), [
    ['Lunes', [['Press banca', 3, '12-10-8', '40-45-50', null, 'Última al fallo; con ayudante', false],
      ['Aperturas con mancuernas', 3, '12', '12', null, '', false]]],
    ['Jueves', [['Sentadilla', 3, '10-8-6', '60-70-80', null, '', false], ['Estocadas', 2, '12 c/pierna', '10', null, '', false]]]]);
  ok('F7 · sin avisos («Peso» no dice la unidad)', R7.avisos, []);
  ok('una columna «Series» que no numera 1, 2, 3 no se junta', dias(RP.planillaARutina(P.libroDesdeTexto(
    'Ejercicio\tSeries\tReps\nRemo\t1\t12\nRemo\t3\t10'))), [['', [['Remo', 1, '12', '', null, '', false], ['Remo', 3, '10', '', null, '', false]]]]);

  // F8 · CSV de Google (coma) y F8b (BOM, «;», CRLF): lo mismo.
  const F8_DIAS = [['', [['Sentadilla goblet', 3, '15', '16 kg', 60, '', false], ['Hip thrust', 4, '12', '40 kg', 90, 'Apretar arriba, 1 s', false],
    ['Peso muerto rumano con mancuernas', 3, '10', '2x12 kg', 90, '', false], ['Abducción con banda', 3, '20', 'banda verde', 45, '', false],
    ['Plancha', 3, '40 s', '', 30, '', false]]]];
  ok('F8 · un día sin nombre (el nombre del archivo no se usa)', [dias(RP.planillaARutina(F8)), RP.planillaARutina(F8).leida.nombre], [F8_DIAS, null]);
  ok('F8b · igual', dias(RP.planillaARutina(F8B)), F8_DIAS);

  // F9 · Una sola columna (un WhatsApp pegado en Excel).
  const f9 = new ExcelJS.Workbook();
  const una = f9.addWorksheet('Hoja1');
  [[1, 'RUTINA FULL BODY 💪'], [3, 'LUNES'], [4, '1) Sentadilla 4x12 40kg'], [5, '2) Press banca 4x10 30kg'], [6, '3) Remo 3x12 25 lb 1:30'],
    [8, 'JUEVES'], [9, '1) Peso muerto 4x6 60kg'], [10, '2) Dominadas 4x al fallo'], [11, '3) Plancha 3x45s']].forEach(([r, t]) => celda(una, `A${r}`, t));
  const R9 = RP.planillaARutina(await leer(f9));
  ok('F9 · igual que pegar el texto', [R9.leida.nombre, dias(R9)], ['RUTINA FULL BODY', [
    ['LUNES', [['Sentadilla', 4, '12', '40 kg', null, '', false], ['Press banca', 4, '10', '30 kg', null, '', false], ['Remo', 3, '12', '25 lb', 90, '', false]]],
    ['JUEVES', [['Peso muerto', 4, '6', '60 kg', null, '', false], ['Dominadas', 4, 'al fallo', '', null, '', false], ['Plancha', 3, '45 s', '', null, '', false]]]]]);

  // F10 · Una hoja por semana.
  const f10 = new ExcelJS.Workbook();
  const semanasF10 = [
    [['Sentadilla', 4, 10, '60 kg'], ['Press banca', 4, 10, '40 kg'], ['Peso muerto', 3, 8, '70 kg'], ['Remo', 4, 10, '35 kg']],
    [['Sentadilla', 4, 8, '65 kg'], ['Press banca', 4, 8, '42,5 kg'], ['Peso muerto', 3, 6, '75 kg'], ['Remo', 4, 8, '37,5 kg']],
    [['Sentadilla', 5, 6, '70 kg'], ['Press banca', 5, 6, '45 kg'], ['Peso muerto', 4, 5, '80 kg'], ['Remo', 4, 6, '40 kg']],
  ];
  semanasF10.forEach((filas, i) => {
    const ws = f10.addWorksheet(`Semana ${i + 1}`);
    celda(ws, 'A1', b('DÍA A')); fila(ws, 2, 'A', ['Ejercicio', 'Series', 'Reps', 'Carga']);
    fila(ws, 3, 'A', filas[0]); fila(ws, 4, 'A', filas[1]);
    celda(ws, 'A6', b('DÍA B')); fila(ws, 7, 'A', ['Ejercicio', 'Series', 'Reps', 'Carga']);
    fila(ws, 8, 'A', filas[2]); fila(ws, 9, 'A', filas[3]);
  });
  const F10 = await leer(f10);
  const R10 = RP.planillaARutina(F10);
  ok('F10 · la hoja «Semana 1»: nunca seis días', [dias(R10), R10.semanas, R10.hojas], [[
    ['DÍA A', [['Sentadilla', 4, '10', '60 kg', null, '', false], ['Press banca', 4, '10', '40 kg', null, '', false]]],
    ['DÍA B', [['Peso muerto', 3, '8', '70 kg', null, '', false], ['Remo', 4, '10', '35 kg', null, '', false]]]],
  { cuantas: 3, elegida: 1, nombres: ['Semana 1', 'Semana 2', 'Semana 3'] }, [{ nombre: 'Semana 1', usada: true }]]);
  ok('F10 · con la semana 2', RP.planillaARutina(F10, { semana: 2 }).leida.dias[1].ejercicios.map(corto),
    [['Peso muerto', 3, '6', '75 kg', null, '', false], ['Remo', 4, '8', '37,5 kg', null, '', false]]);

  // N5, N8: sin ejercicios.
  const n5 = new ExcelJS.Workbook();
  const gastos = n5.addWorksheet('Gastos');
  fila(gastos, 1, 'A', [b('Fecha'), b('Concepto'), b('Monto')]);
  const conceptos = ['Supermercado', 'Luz', 'Agua', 'Internet', 'Nafta'];
  for (let i = 0; i < 20; i++) fila(gastos, i + 2, 'A', [D(2026, 9, i + 1, 'dd/mm/yyyy'), conceptos[i % 5], 150000 + i * 1000]);
  const R5 = RP.planillaARutina(await leer(n5));
  ok('N5 · un presupuesto: ningún ejercicio (la revisión dice sin_ejercicios)', [R5.leida.dias.length, R5.hojas, R5.leida.noEntendidas], [0, [{ nombre: 'Gastos', usada: false }], []]);
  const n8 = new ExcelJS.Workbook();
  n8.addWorksheet('Hoja1');
  const R8 = RP.planillaARutina(await leer(n8));
  ok('N8 · un libro vacío: ningún ejercicio', [R8.leida.dias.length, R8.avisos], [0, []]);

  // N9 · «12x3»: no se da vuelta solo; aviso y un toque.
  const n9 = new ExcelJS.Workbook();
  const reves = n9.addWorksheet('Hoja1');
  fila(reves, 1, 'A', ['Ejercicio', 'Series x Reps']);
  fila(reves, 2, 'A', ['Sentadilla', '12x3']);
  fila(reves, 3, 'A', ['Press', '4x10']);
  const R9n = RP.planillaARutina(await leer(n9));
  ok('N9 · sale como está, con el aviso series_raras', [dias(R9n)[0][1].map((e) => e.slice(0, 3)), R9n.avisos],
    [[['Sentadilla', 12, '3'], ['Press', 4, '10']], [{ codigo: 'series_raras', ejercicios: [{ dia: 0, indice: 0, nombre: 'Sentadilla' }] }]]);
  const vuelta = RP.darVueltaSeriesYReps(R9n.leida, 0, 0);
  ok('N9 · «Dar vuelta»: 3 × 12, y el aviso ya no aplica', [corto(vuelta.dias[0].ejercicios[0]).slice(0, 3), RP.seriesRaras(vuelta)], [['Sentadilla', 3, '12'], []]);
  ok('N9 · darVuelta no toca la original ni unas repeticiones que no son un entero de 1 a 20',
    [corto(R9n.leida.dias[0].ejercicios[0]).slice(0, 3), RP.darVueltaSeriesYReps(R4.leida, 0, 0) === R4.leida,
      RP.darVueltaSeriesYReps({ ...R9n.leida, dias: [{ ...R9n.leida.dias[0], ejercicios: [{ ...R9n.leida.dias[0].ejercicios[0], reps: '30' }] }] }, 0, 0).dias[0].ejercicios[0].series],
    [['Sentadilla', 12, '3'], false, 12]);

  // Variantes que aparecen en planillas reales (fuera de PLANILLAS-EJEMPLO.md).
  const deTexto = (filas, op) => RP.planillaARutina(P.libroDesdeTexto(filas.map((f) => f.join('\t')).join('\n')), op);
  const MED = deTexto([['Ejercicio', 'Series', 'Reps'], ['Sentadilla', '4', '10'], [''], ['Fecha', 'Peso', 'Cintura'], ['01/09/2026', '82,5', '90']]);
  ok('una tabla de medidas debajo de la rutina no se lee ni se muestra', [dias(MED), MED.leida.noEntendidas],
    [[['', [['Sentadilla', 4, '10', '', null, '', false]]]], []]);
  const TIT = deTexto([['DÍA 1:', 'PIERNAS'], ['Ejercicio', 'Series', 'Reps'], ['Sentadilla', '4', '10'], [''], ['DÍA 2:', 'TORSO'], ['Ejercicio', 'Series', 'Reps'], ['Press', '4', '10']]);
  ok('«DÍA 1: | PIERNAS» en dos celdas es el título del día, no un ejercicio ni un dato de la persona',
    [TIT.leida.dias.map((d) => [d.nombre, d.ejercicios.map((e) => e.nombre)]), TIT.avisos], [[['DÍA 1: PIERNAS', ['Sentadilla']], ['DÍA 2: TORSO', ['Press']]], []]);
  const SALUD = deTexto([['Alumno:', 'Juan'], ['Observaciones:', 'Rodilla operada'], ['Lesiones: hombro'], [''], ['Ejercicio', 'Series', 'Reps'], ['Sentadilla', '4', '10']]);
  ok('arriba del encabezado, observaciones y lesiones de la persona se descartan (solo la etiqueta)',
    [SALUD.avisos, /Rodilla|hombro|Juan/.test(JSON.stringify(SALUD.leida))], [[{ codigo: 'datos_no_usados', etiquetas: ['Alumno', 'Observaciones', 'Lesiones'] }], false]);
  const SUELTAS = deTexto([['Sentadilla:', '4x10'], ['Prensa:', '3x12']]);
  ok('sin encabezado, «Sentadilla: | 4x10» es un ejercicio, no una etiqueta', dias(SUELTAS).map((d) => d[1].map((e) => e.slice(0, 3))),
    [[['Sentadilla', 4, '10'], ['Prensa', 3, '12']]]);
  const MEZCLA = deTexto([['Ejercicio', 'Serie', 'Reps'], ['Press', '1', '12'], ['Press', '2', '10'], ['Plancha', '', '30 s'], ['Remo', '1', '12'], ['Remo', '2', '12']]);
  ok('una fila por serie con un renglón sin numerar en el medio: se juntan las numeradas, el otro queda igual',
    dias(MEZCLA)[0][1].map((e) => e.slice(0, 3)), [['Press', 2, '12-10'], ['Plancha', null, '30 s'], ['Remo', 2, '12']]);
  ok('la tabla de medidas no se muestra, pero sus títulos sí se nombran en el aviso (no se pierde en silencio)',
    MED.avisos, [{ codigo: 'datos_no_usados', etiquetas: ['Fecha', 'Peso', 'Cintura'] }]);

  // Revisión (30/09): una fila sin números NO es el encabezado de una tabla ajena.
  const SIN_ENC = deTexto([['Día 1'], ['Sentadilla', '4', '10', '60kg'], ['Zancada búlgara', 'lento'], ['Prensa', '3', '12', '100kg'], ['Curl femoral', '3', '15']]);
  ok('sin encabezado, «Zancada búlgara | lento» en el medio: no se tira nada (antes quedaba solo Sentadilla)',
    [dias(SIN_ENC).map((d) => [d[0], d[1].map((e) => e[0])]), SIN_ENC.leida.noEntendidas, SIN_ENC.avisos],
    [[['Día 1', ['Sentadilla', 'Zancada búlgara', 'Prensa', 'Curl femoral']]], [], []]);
  const PRIMERA_SIN = deTexto([['Día 1'], ['Pullover', 'controlado'], ['Vuelos laterales', 'lento'], ['Sentadilla', '4', '10']]);
  ok('y si la fila sin números es la primera del día, el día no se pierde', dias(PRIMERA_SIN).map((d) => [d[0], d[1].map((e) => e[0])]),
    [['Día 1', ['Pullover', 'Vuelos laterales', 'Sentadilla']]]);
  const PREGUNTAS = deTexto([['Sentadilla', '4', '10'], [''], ['Pregunta', 'Respuesta'], ['¿Lesiones?', 'Rodilla'], ['¿Hace deporte?', 'Sí, 3 veces por semana']]);
  ok('una tabla de preguntas de salud sigue sin leerse ni mostrarse',
    [dias(PREGUNTAS).map((d) => d[1].map((e) => e[0])), /Rodilla|Lesiones|deporte/.test(JSON.stringify(PREGUNTAS.leida)), PREGUNTAS.avisos],
    [[['Sentadilla']], false, [{ codigo: 'datos_no_usados', etiquetas: ['Pregunta', 'Respuesta'] }]]);
  const CSV_SIN_ENC = RP.planillaARutina(P.libroDesdeCsv(new TextEncoder().encode('Día 1;;\nSentadilla;4;10\nPullover;controlado;\nPrensa;3;12\nCurl femoral;3;15\n')));
  ok('lo mismo en un CSV sin encabezado', CSV_SIN_ENC.leida.dias.map((d) => d.ejercicios.map((e) => e.nombre)), [['Sentadilla', 'Pullover', 'Prensa', 'Curl femoral']]);

  // Revisión (30/09): la grilla semanal con «#» / «Nº» y la matriz «Ejercicios × días».
  const GRILLA = deTexto([
    ['PLAN DE ENTRENAMIENTO – OCTUBRE'],
    ['#', 'LUNES (Pecho / Tríceps)', 'MARTES (Espalda / Bíceps)', 'JUEVES (Piernas)'],
    ['1', 'Press banca 4x10', 'Jalón al pecho 4x10', 'Sentadilla 4x8'],
    ['2', 'Aperturas 3x15', 'Remo con barra 4x10', 'Prensa 4x12'],
    ['3', 'Fondos 3x al fallo', '', 'Gemelos 4x20'],
    [''],
    ['Descanso: 60-90 s entre series.'],
  ]);
  ok('grilla con la columna «#»: un día por columna, sin el ejercicio «LUNES…» ni lo no entendido',
    [dias(GRILLA).map((d) => [d[0], d[1].map((e) => e.slice(0, 3))]), GRILLA.leida.noEntendidas, GRILLA.leida.nombre],
    [[
      ['LUNES (Pecho / Tríceps)', [['Press banca', 4, '10'], ['Aperturas', 3, '15'], ['Fondos', 3, 'al fallo']]],
      ['MARTES (Espalda / Bíceps)', [['Jalón al pecho', 4, '10'], ['Remo con barra', 4, '10']]],
      ['JUEVES (Piernas)', [['Sentadilla', 4, '8'], ['Prensa', 4, '12'], ['Gemelos', 4, '20']]],
    ], [], 'PLAN DE ENTRENAMIENTO – OCTUBRE']);
  ok('y el renglón suelto de la columna «#» va a las indicaciones, no se pierde', GRILLA.leida.notas.includes('Descanso: 60-90 s entre series.'), true);
  const GRADE = deTexto([
    ['Nº', 'SEGUNDA – Peito', 'QUARTA – Costas', 'SEXTA – Pernas'],
    ['1', 'Supino reto 4x10', 'Puxada frontal 4x10', 'Agachamento 4x10'],
    ['2', 'Crucifixo 3x12', 'Remada baixa 3x12', 'Leg press 4x12'],
  ]);
  ok('lo mismo en portugués con «Nº» (antes: el ejercicio «Nº»)', dias(GRADE).map((d) => [d[0], d[1].map((e) => e.slice(0, 3))]), [
    ['SEGUNDA – Peito', [['Supino reto', 4, '10'], ['Crucifixo', 3, '12']]],
    ['QUARTA – Costas', [['Puxada frontal', 4, '10'], ['Remada baixa', 3, '12']]],
    ['SEXTA – Pernas', [['Agachamento', 4, '10'], ['Leg press', 4, '12']]],
  ]);
  const MATRIZ = deTexto([
    ['EJERCICIOS', 'LUNES', 'MIÉRCOLES', 'VIERNES'],
    ['Sentadilla', '4x10', '', '4x8'],
    ['Press banca', '4x10', '4x8', ''],
    ['Remo con barra', '', '4x10', '4x10'],
    ['Plancha', '3x30 s', 'x', '3x30 s'],
  ]);
  ok('matriz «Ejercicios × días»: un día por columna y cada ejercicio solo donde tiene algo (una «x» es «ese día sí»)',
    [dias(MATRIZ).map((d) => [d[0], d[1].map((e) => e.slice(0, 3))]), MATRIZ.leida.noEntendidas], [[
      ['LUNES', [['Sentadilla', 4, '10'], ['Press banca', 4, '10'], ['Plancha', 3, '30 s']]],
      ['MIÉRCOLES', [['Press banca', 4, '8'], ['Remo con barra', 4, '10'], ['Plancha', null, '']]],
      ['VIERNES', [['Sentadilla', 4, '8'], ['Remo con barra', 4, '10'], ['Plancha', 3, '30 s']]],
    ], []]);
  ok('ningún encabezado reconocido queda como ejercicio', [GRILLA, GRADE, MATRIZ].flatMap((r) => r.leida.dias.flatMap((d) => d.ejercicios.map((e) => e.nombre)))
    .filter((n) => /^(?:#|Nº|EJERCICIOS|LUNES|SEGUNDA)/.test(n)), []);
  const MATRIZ_DESC = deTexto([['Ejercicio', 'Día 1', 'Día 2', 'Descanso'], ['Sentadilla', '4x8 60 kg', '', '2 min'], ['Press banca', '', '4x10', '90 s']]);
  ok('la matriz con otra columna (Descanso): va con cada ejercicio, y la carga del día también',
    dias(MATRIZ_DESC).map((d) => [d[0], d[1].map((e) => e.slice(0, 5))]),
    [['Día 1', [['Sentadilla', 4, '8', '60 kg', 120]]], ['Día 2', [['Press banca', 4, '10', '', 90]]]]);

  // Revisión (30/09): la semana en una celda con series, repeticiones y carga («4x8 60 kg»).
  const PROGRESION = [['Ejercicio', 'Sem 1', 'Sem 2', 'Sem 3', 'Descanso'],
    ['Sentadilla', '4x8 60 kg', '4x6 65 kg', '4x5 67,5 kg', '3 min'],
    ['Press banca', '4x8 @ 50kg', '4x6 - 55 kg', '4x5 57,5 kg', '2 min'],
    ['Dominadas', '3x al fallo', '4x al fallo', '4x al fallo', '2 min']];
  ok('«4x8 60 kg» en la semana: series, repeticiones y carga, cada una en su lugar (antes: todo a la carga)',
    dias(deTexto(PROGRESION))[0][1].map((e) => e.slice(0, 5)),
    [['Sentadilla', 4, '8', '60 kg', 180], ['Press banca', 4, '8', '50 kg', 120], ['Dominadas', 3, 'al fallo', '', 120]]);
  ok('y con la semana 3', dias(deTexto(PROGRESION, { semana: 3 }))[0][1].map((e) => e.slice(0, 4)),
    [['Sentadilla', 4, '5', '67,5 kg'], ['Press banca', 4, '5', '57,5 kg'], ['Dominadas', 4, 'al fallo', '']]);
  ok('una semana con solo la carga sigue siendo la carga, y un número solo sigue yendo a la nota',
    dias(deTexto([['Ejercicio', 'Series', 'Reps', 'S1', 'S2'], ['Sentadilla', '4', '10', '60 kg', '65 kg'], ['Prensa', '3', '12', '100', '110']]))[0][1].map((e) => e.slice(0, 6)),
    [['Sentadilla', 4, '10', '60 kg', null, ''], ['Prensa', 3, '12', '', null, 'S1: 100']]);

  // Nada de «Anamnese» ni «Medidas» en ningún formato.
  ok('ningún resultado trae datos de Anamnese o Medidas', [R1, R4].some((r) => /Anamnese|Pergunta|Joelho|Cintura|82[,.]5/.test(JSON.stringify(r.leida))), false);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 4 · leerTextoPegado: «Pegar texto» con tabuladores pasa por el convertidor ──');
  // ═══════════════════════════════════════════════════════════
  // Sin tabuladores: exactamente lo mismo que leerRutina (textos de los casos 1-10 de rutinas-texto.test.js).
  const SIN_TAB = [
    'Hola! Te paso tu rutina 💪🏼\n\n🔥 LUNES – PIERNAS 🔥\n1) Sentadilla libre 4x12\n2) Prensa 45° 4x15\n3) Estocadas 3x10 c/pierna\n4) Sillón de cuádriceps 3x15\n5) Gemelos parado 4x20\n\n🔥 MIÉRCOLES – PECHO Y TRÍCEPS 🔥\n1) Press banca plano 4x10\n2) Press inclinado con mancuernas 3x12\n3) Aperturas 3x12\n4) Tríceps en polea 3x15\n5) Fondos en banco 3 x al fallo\n\nCualquier duda me escribís 🙌',
    'TREINO A – PEITO E TRÍCEPS\nSupino reto 4x10 30kg\nSupino inclinado com halteres 3x12 14kg\nCrucifixo 3x12\nTríceps corda 4x12\nTríceps testa 3x10 10kg\nDescanso: 60s entre as séries\n\nTREINO B – COSTAS E BÍCEPS\nPuxada frontal 4x10\nRemada baixa 4x12 40kg\nRemada unilateral (serrote) 3x10 cada lado\nRosca direta 3x12 12kg',
    'RUTINA HIPERTROFIA – MES 1\n\nDÍA 1 (Tren superior)\n• Press banca: 4 series de 8 a 10 – descanso 2 min\n• Remo con mancuerna: 4 series de 10 c/lado – descanso 90 seg\n• Curl martillo: 3 series de 12 – 10 kg\n• Tríceps francés: 3 series de 12',
    'Día A · Full body\n1. Sentadilla goblet 3x12 16kg\n2a. Press de hombros con mancuernas 3x10 8kg\n2b. Remo invertido 3x10\n3a. Plancha 3x40s\n3b. Dead bug 3x10 c/lado\n\nTreino B\nA1 - Levantamento terra 4x6 80kg\nA2 - Prancha lateral 3x30s cada lado',
    'LUNES\n- Press de pecho en máquina 3x12 placa 6\n- Remo sentado 3x12 7 placas\n- Curl con mancuernas 3x12 20 lbs\n- Face pull 3x15 25lb 1:30',
    'Día 3 – Cardio y core\nCinta 20 min\nBici fija 15 min suave\nPlancha lateral 3 x 30" c/lado\nBurpees 4x10 descanso 30s',
    'Día B – Espalda\n\nJalón al pecho\n4 x 12\nDescanso: 1 min\n\nRemo en polea baja\n3 series de 10 repeticiones\nCarga: 35 kg',
    '*Semana 1 a 4*\n*Día A – Piernas*\nCalentamiento: 10 min de bici + movilidad de cadera\n1. Sentadilla con barra 4x8-10 60kg 2 min\n   Obs: bajar hasta la paralela\n2. Prensa 4x12 120 kg',
  ];
  ok('sin tabuladores, exactamente lo mismo que leerRutina (8 textos)', SIN_TAB.map((t) => JSON.stringify(RP.leerTextoPegado(t)) === JSON.stringify(R.leerRutina(t))),
    SIN_TAB.map(() => true));
  // Con tabuladores y un solo bloque: lo mismo que leerRutina.
  const CON_TAB = [
    'Ejercicio\tSeries\tReps\tPeso\tDescanso\nSentadilla\t4\t10\t40 kg\t90 s\nPress banca\t4\t8-10\t30kg\t2 min\nRemo con barra\t3\t12\t25\t60\nPlancha\t3\t45 s\t\t30',
    'Dia\tExercício\tSéries\tRepetições\tCarga\tIntervalo\tObservação\nA\tAgachamento livre\t4\t12\t20kg\t1 min\t\nA\tCadeira extensora\t3\t15\tplaca 5\t45s\t\nB\tSupino reto\t4\t10\t25 kg\t90s\tDescer controlando\nB\tPuxada frontal\t4\t10\t35\t60s\t',
    'N°\tEjercicio\tSeries\tRepeticiones\tKg\tDescanso (min)\tVideo\n1\tHip thrust\t4\t12\t60\t1,5\thttps://youtu.be/abc123\n2\tPeso muerto rumano\t3\t10\t40\t2\t\n3\tPatada de glúteo en polea\t3\t15 c/pierna\tplaca 3\t1\t',
    'DÍA A\nSentadilla\t4\t10\t40 kg\nPrensa\t4\t12\t100\nCamilla de isquios\t3\t12\tplaca 5',
    'Ejercicio\tReps\tPeso\nSentadilla\t4x12\t40kg',
  ];
  ok('con tabuladores y un solo bloque, lo mismo que leerRutina (5 planillas pegadas)',
    CON_TAB.map((t) => JSON.stringify(RP.leerTextoPegado(t)) === JSON.stringify(R.leerRutina(t))), CON_TAB.map(() => true));
  const OBS_PESO = 'Sentadilla\t4x10\nObs: bajar lento\nPrensa\t3x12\nPeso: 40kg';
  ok('pegada sin encabezado, «Obs:» y «Peso:» abajo de un ejercicio son suyos (no datos de la persona), como con leerRutina',
    [RP.leerTextoPegado(OBS_PESO).dias[0].ejercicios.map((e) => [e.nombre, e.carga, e.nota]),
      JSON.stringify(RP.leerTextoPegado(OBS_PESO)) === JSON.stringify(R.leerRutina(OBS_PESO))],
    [[['Sentadilla', '', 'bajar lento'], ['Prensa', '40 kg', '']], true]);
  // Revisión (30/09): lo pegado de un Excel SIN encabezado no pierde ejercicios.
  const PEGADAS_SIN_ENC = [
    'Día 1\nSentadilla\t4\t10\t60kg\nZancada búlgara\tlento\nPrensa\t3\t12\t100kg\nCurl femoral\t3\t15\n\nDía 2\nPress banca\t4\t8',
    'Día 1\nZancada búlgara\tlento\nSentadilla\t4\t10\t60kg\nPrensa\t3\t12\t100kg',
    'Pullover\tcontrolado\nSentadilla\t4\t10\nPrensa\t3\t12',
    'Inicio: 10 min de bicicleta\nSentadilla\t4\t10\nPrensa\t3\t12\nFin: 5 min de estiramientos',
    ...['Pullover', 'Vuelos laterales', 'Abducción en máquina', 'Remo gironda', 'Zancadas', 'Crunch en polea']
      .map((n) => `Día 1\nSentadilla\t4\t10\n${n}\tcontrolado\nPrensa\t3\t12`),
  ];
  ok('una fila sin números en el medio o al principio, e «Inicio: 10 min…»: lo mismo que leerRutina (10 textos)',
    PEGADAS_SIN_ENC.map((t) => JSON.stringify(RP.leerTextoPegado(t)) === JSON.stringify(R.leerRutina(t))), PEGADAS_SIN_ENC.map(() => true));
  const PEGADA_SEMANAS = 'Ejercicio\tSeries\tReps\tSemana 1\tSemana 2\tSemana 3\nSentadilla\t4\t10\t60 kg\t65 kg\t70 kg\nPrensa\t3\t12\t100 kg\t110 kg\t120 kg';
  ok('pegada con semanas: la revisión trae el selector (antes las semanas 2 y 3 desaparecían sin verse)',
    [RP.pegadoComoPlanilla(PEGADA_SEMANAS).semanas, RP.pegadoComoPlanilla(PEGADA_SEMANAS, { semana: 2 }).leida.dias[0].ejercicios.map((e) => e.carga)],
    [{ cuantas: 3, elegida: 1, nombres: ['Semana 1', 'Semana 2', 'Semana 3'] }, ['65 kg', '110 kg']]);
  ok('pegada con «Nombre: Juan»: no es un ejercicio y se nombra en el aviso (antes desaparecía sin decir nada)',
    [RP.pegadoComoPlanilla('Nombre: Juan\nSentadilla\t4\t10\nPrensa\t3\t12').avisos, /Juan/.test(JSON.stringify(RP.leerTextoPegado('Nombre: Juan\nSentadilla\t4\t10\nPrensa\t3\t12')))],
    [[{ codigo: 'datos_no_usados', etiquetas: ['Nombre'] }], false]);
  ok('pegadoComoPlanilla sin tabuladores: lo del lector de siempre, sin extras',
    RP.pegadoComoPlanilla(SIN_TAB[0]), { leida: R.leerRutina(SIN_TAB[0]), semanas: null, duracionSemanas: null, hojas: [], avisos: [] });
  ok('la tabla en markdown (sin tabuladores) también',JSON.stringify(RP.leerTextoPegado('| Ejercicio | Series | Reps |\r\n|---|---|---|\r\n| Remo | 3 | 12 |'))
    === JSON.stringify(R.leerRutina('| Ejercicio | Series | Reps |\r\n|---|---|---|\r\n| Remo | 3 | 12 |')), true);

  const pegado = (libro) => libro.hojas[0].filas.map((f) => f.map((c) => (c ? c.texto.replace(/\n/g, ' ') : '')).join('\t')).join('\n');
  const F3A_PEGADA = RP.leerTextoPegado(pegado(F3A));
  const F3B_PEGADA = RP.leerTextoPegado(pegado(F3B));
  ok('F3a pegada: 3 días, nada perdido', F3A_PEGADA.dias.map((d) => [d.nombre, d.ejercicios.map(corto)]), F3A_DIAS);
  ok('F3b pegada: 3 días (hoy iba todo a lo no entendido)', [F3B_PEGADA.dias.map((d) => [d.nombre, d.ejercicios.map(corto)]), F3B_PEGADA.noEntendidas], [F3B_DIAS, []]);
  const F4_PEGADA = RP.leerTextoPegado(pegado(F4));
  ok('F4 pegada: «Aluno(a)», «Objetivo» ni «FICHA DE TREINO» son ejercicios o días',
    [F4_PEGADA.nombre, F4_PEGADA.dias.map((d) => d.nombre), F4_PEGADA.dias.flatMap((d) => d.ejercicios.map((e) => e.nombre)).filter((n) => /Aluno|Objetivo|Professor/.test(n)),
      /Maria|Carlos/.test(JSON.stringify(F4_PEGADA))],
    ['FICHA DE TREINO', ['TREINO A – PEITO, OMBRO E TRÍCEPS', 'TREINO B – COSTAS E BÍCEPS'], [], false]);
  ok('pegada, la columna «Vídeo» con el texto «Ver vídeo» no va a la nota', F4_PEGADA.dias[0].ejercicios[0].nota, '');

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 5 · enlace-sheets.ts: el link de Google Sheets ──');
  // ═══════════════════════════════════════════════════════════
  const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCd';
  const EXPORT = `https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx`;
  const PUB = '2PACX-1vQabcdefghijklmnopqrstuvwxyz0123456789';
  const casosG = [
    [`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`, { url: EXPORT }],
    [`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123456`, { url: EXPORT }],
    [`https://docs.google.com/spreadsheets/u/1/d/${ID}/edit`, { url: EXPORT }],
    [`docs.google.com/spreadsheets/d/${ID}/view`, { url: EXPORT }],
    [`http://docs.google.com/spreadsheets/d/${ID}/htmlview`, { url: EXPORT }],
    [`  https://docs.google.com/spreadsheets/d/${ID}/edit?usp=drivesdk  `, { url: EXPORT }],
    [`https://docs.google.com/spreadsheets/d/e/${PUB}/pubhtml`, { url: `https://docs.google.com/spreadsheets/d/e/${PUB}/pub?output=xlsx` }],
    [`https://docs.google.com.evil.com/spreadsheets/d/${ID}/edit`, { error: 'enlace_invalido' }],
    [`https://evil.com/?u=https://docs.google.com/spreadsheets/d/${ID}`, { error: 'enlace_invalido' }],
    [`https://user@evil.com/docs.google.com/spreadsheets/d/${ID}`, { error: 'enlace_invalido' }],
    [`https://user@docs.google.com/spreadsheets/d/${ID}/edit`, { error: 'enlace_invalido' }],
    [`https://docs.google.com/document/d/${ID}/edit`, { error: 'no_es_sheets' }],
    [`https://drive.google.com/file/d/${ID}/view`, { error: 'archivo_en_drive' }],
    ['javascript:alert(1)', { error: 'enlace_invalido' }],
    ['file:///C:/x.xlsx', { error: 'enlace_invalido' }],
    ['https://127.0.0.1/x', { error: 'enlace_invalido' }],
    ['https://docs.google.com/spreadsheets/d/../../x/edit', { error: 'enlace_invalido' }],
    ['https://docs.google.com/spreadsheets/d/corto/edit', { error: 'enlace_invalido' }],
    ['', { error: 'enlace_invalido' }],
  ];
  ok('la tabla G entera: el export se arma de cero, y lo demás se rechaza', casosG.map(([pego]) => G.exportDeSheets(pego)), casosG.map(([, r]) => r));

  const xlsxChico = await aBytes(f9);
  const respuesta = (status, { location, tipo, cuerpo } = {}) => new Response(cuerpo ?? null, {
    status, headers: { ...(location ? { location } : {}), ...(tipo ? { 'content-type': tipo } : {}) },
  });
  /** Un fetch de mentira: contesta en orden y anota lo que se pidió. */
  const falso = (...respuestas) => {
    const pedidos = [];
    const f = async (url, init) => {
      pedidos.push([url, init && init.redirect]);
      const r = respuestas.shift();
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? r() : r;
    };
    f.pedidos = pedidos;
    return f;
  };
  const f307 = falso(respuesta(307, { location: 'https://doc-08-4o-sheets.googleusercontent.com/export/abc' }),
    respuesta(200, { tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', cuerpo: xlsxChico }));
  const bajado = await G.bajarDeGoogle(EXPORT, f307);
  ok('307 a googleusercontent y después el xlsx: se lee (y siempre con redirect manual)',
    [bajado instanceof Uint8Array, bajado.length === xlsxChico.length, f307.pedidos.map(([, r]) => r)], [true, true, ['manual', 'manual']]);
  ok('y lo bajado se abre como planilla', (await X.leerXlsx(bajado)).hojas[0].nombre, 'Hoja1');
  const fLogin = falso(respuesta(302, { location: 'https://accounts.google.com/ServiceLogin?continue=x' }));
  ok('302 al login de Google: no_compartida, sin seguirlo', [await G.bajarDeGoogle(EXPORT, fLogin), fLogin.pedidos.length], [{ error: 'no_compartida' }, 1]);
  ok('404: no_existe', await G.bajarDeGoogle(EXPORT, falso(respuesta(404, { tipo: 'text/html', cuerpo: '<html>' }))), { error: 'no_existe' });
  ok('401 y 403: no_compartida', [await G.bajarDeGoogle(EXPORT, falso(respuesta(401))), await G.bajarDeGoogle(EXPORT, falso(respuesta(403)))],
    [{ error: 'no_compartida' }, { error: 'no_compartida' }]);
  ok('200 con una página HTML: no_compartida', await G.bajarDeGoogle(EXPORT, falso(respuesta(200, { tipo: 'text/html; charset=utf-8', cuerpo: '<html>login</html>' }))),
    { error: 'no_compartida' });
  ok('200 con algo que no es un zip: no_compartida', await G.bajarDeGoogle(EXPORT, falso(respuesta(200, { tipo: 'application/octet-stream', cuerpo: 'hola' }))),
    { error: 'no_compartida' });
  const fOtro = falso(respuesta(302, { location: 'https://evil.com/x.xlsx' }));
  const fHttp = falso(respuesta(302, { location: 'http://doc-1.googleusercontent.com/x' }));
  ok('3xx a otro host o a http: no_compartida, sin seguirlo', [await G.bajarDeGoogle(EXPORT, fOtro), fOtro.pedidos.length, await G.bajarDeGoogle(EXPORT, fHttp), fHttp.pedidos.length],
    [{ error: 'no_compartida' }, 1, { error: 'no_compartida' }, 1]);
  const vueltas = () => respuesta(307, { location: 'https://docs.google.com/spreadsheets/d/x/export?format=xlsx' });
  const f4r = falso(vueltas(), vueltas(), vueltas(), vueltas(), vueltas());
  ok('más de 3 redirecciones: google_no_responde', [await G.bajarDeGoogle(EXPORT, f4r), f4r.pedidos.length], [{ error: 'google_no_responde' }, 4]);
  ok('429, 500 y un fetch que se corta (o los 10 s): google_no_responde',
    [await G.bajarDeGoogle(EXPORT, falso(respuesta(429))), await G.bajarDeGoogle(EXPORT, falso(respuesta(503))),
      await G.bajarDeGoogle(EXPORT, falso(new Error('The operation was aborted')))],
    [{ error: 'google_no_responde' }, { error: 'google_no_responde' }, { error: 'google_no_responde' }]);
  let pedazos = 0;
  const infinito = new ReadableStream({ pull(c) { pedazos++; const x = new Uint8Array(1024 * 1024); x[0] = 0x50; x[1] = 0x4b; c.enqueue(x); if (pedazos > 50) c.close(); } });
  ok('un cuerpo de más de 4 MB se corta leyendo, sin esperar al final', [await G.bajarDeGoogle(EXPORT, falso(new Response(infinito, { status: 200 }))), pedazos <= 7],
    [{ error: 'muy_grande' }, true]);
  ok('con Content-Length de más, ni se lee', await G.bajarDeGoogle(EXPORT, falso(new Response('x', { status: 200, headers: { 'content-length': String(5 * 1024 * 1024) } }))),
    { error: 'muy_grande' });
  ok('bajarDeGoogle solo pide a docs.google.com por https', [await G.bajarDeGoogle('https://evil.com/x', falso()), await G.bajarDeGoogle('http://docs.google.com/x', falso())],
    [{ error: 'enlace_invalido' }, { error: 'enlace_invalido' }]);

  // ═══════════════════════════════════════════════════════════
  console.log('\n── 6 · Lo que se comprueba leyendo el código ──');
  // ═══════════════════════════════════════════════════════════
  const raiz = path.join(__dirname, '..');
  const leerFuente = (r) => fs.readFileSync(path.join(raiz, r), 'utf8').replace(/\r\n/g, '\n');
  const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const ruta = sinComentarios(leerFuente('src/app/api/rutinas/importar/route.ts'));
  ok('la ruta de importar: nodejs, con sesión, solo para /rutinas, y sin console.log',
    [/export const runtime = 'nodejs'/.test(ruta), /auth\.getUser\(\)/.test(ruta), /tieneSeccion\(/.test(ruta), /console\.log\(/.test(ruta)],
    [true, true, true, false]);
  ok('la ruta no guarda nada: ni storage, ni insert, ni rpc', /storage\.|\.insert\(|\.rpc\(|\.upsert\(/.test(ruta), false);
  ok('la ruta lee con leerXlsx y trae de Google con exportDeSheets + bajarDeGoogle',
    [/leerXlsx\(/.test(ruta), /exportDeSheets\(/.test(ruta), /bajarDeGoogle\(/.test(ruta)], [true, true, true]);
  const recorrer = (dir) => fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? recorrer(`${dir}/${d.name}`) : /\.(tsx?|js)$/.test(d.name) ? [`${dir}/${d.name}`] : []));
  const delCliente = [...recorrer('src/components'), ...recorrer('src/app/rutina')];
  ok('exceljs y planilla-xlsx solo en el servidor: ningún componente ni la página del alumno los importan',
    delCliente.filter((a) => /from ['"](?:exceljs|@\/lib\/planilla-xlsx|[./]+lib\/planilla-xlsx)['"]|require\(['"]exceljs/.test(leerFuente(a))), []);
  const importar = sinComentarios(leerFuente('src/components/rutinas/editor/ImportarPlanilla.tsx'));
  ok('el navegador frena más de 4 MB antes de subir, y el CSV lo lee sin subirlo',
    [/TOPES_PLANILLA\.bytes/.test(importar), /libroDesdeCsv\(/.test(importar), /'\/api\/rutinas\/importar'/.test(importar), /<form/.test(importar)],
    [true, true, true, false]);
  ok('la revisión usa planillaARutina y VistaLeida, y «Dar vuelta» usa darVueltaSeriesYReps',
    [/planillaARutina\(/.test(importar), /<VistaLeida/.test(importar), /darVueltaSeriesYReps\(/.test(importar)], [true, true, true]);
  const enlace = leerFuente('src/lib/enlace-sheets.ts');
  ok('Google: redirect manual y 10 segundos', [/redirect: 'manual'/.test(enlace), /10_000/.test(enlace)], [true, true]);
  const legal = leerFuente('src/i18n/textos/legal.ts');
  ok('la privacidad dice que la planilla se lee y se descarta (es y pt)', [legal.includes('se lee y se descarta'), legal.includes('é lida e descartada')], [true, true]);
  const editor = sinComentarios(leerFuente('src/components/rutinas/EditorRutina.tsx'));
  ok('al guardar, los links van a la biblioteca con completar_videos_de_ejercicios, después de guardar_rutina',
    editor.indexOf("'completar_videos_de_ejercicios'") > editor.indexOf("'guardar_rutina'") && editor.includes("'completar_videos_de_ejercicios'"), true);
  const modelo = sinComentarios(leerFuente('src/components/rutinas/editor/modelo.ts'));
  ok('video_importado no viaja en guardar_rutina ni cambia la firma',
    [/video_importado/.test(modelo.slice(modelo.indexOf('export function paraGuardar'))), /video_importado/.test(modelo.slice(modelo.indexOf('export function firma'), modelo.indexOf('const firmaEjercicio')))],
    [false, false]);

  console.log(fallos === 0 ? `\n>>> TODAS LAS PRUEBAS PASARON (${corridas} comprobaciones)` : `\n>>> ${fallos} DE ${corridas} FALLARON`);
  process.exit(fallos > 0 ? 1 : 0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
