/**
 * Rutinas como texto, medidas del cuerpo y la lista base de ejercicios (098).
 *
 * Lo que se prueba acá es lo que un trainer va a hacer el primer día: pegar
 * la rutina que ya tiene en WhatsApp, en Notas o en un Excel. Si el lector
 * solo entendiera el formato que exporta Orden, la función no serviría para
 * nada. Por eso la mayoría de los casos son rutinas como las que se mandan
 * de verdad en Paraguay, Argentina y Brasil (inventadas, sin datos de nadie):
 * con emojis, mayúsculas, «4 series de 12», «3x12-10-8», «c/lado», libras,
 * placas, «1:30», planillas con tabulador y encabezado, en español y en
 * portugués.
 *
 * Las reglas que más importan:
 *   · lo que no se entiende va a `noEntendidas`, entero: nunca se inventa;
 *   · la carga NUNCA gana una unidad que no tenía («40» sigue siendo «40»):
 *     25 lb leído como 25 kg puede lastimar a alguien;
 *   · lo que exporta Orden vuelve igual al pegarlo (ida y vuelta), con las
 *     palabras del diccionario real en los dos idiomas.
 *
 * Las medidas: los rangos tienen que ser los de los check de la 098 (la
 * prueba de la base lee este mismo catálogo), y las cuentas del progreso
 * no pueden comparar una balanza con un plicómetro.
 */
const fs = require('fs');
const path = require('path');
const R = require('../.compilado/rutina-texto.js');
const M = require('../.compilado/medidas.js');
const E = require('../.compilado/ejercicios-base.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a.length > 140 ? a.slice(0, 137) + '...' : a);
}

// El diccionario de verdad, no una copia: si alguien cambia «Descanso» por
// otra palabra que el lector no reconoce, la ida y vuelta se rompe acá.
// rutinas-comun.ts no se compila con las librerías (vive en src/i18n), así
// que se transpila en el momento con el TypeScript del proyecto.
function cargarTs(ruta) {
  const ts = require('typescript');
  const fuente = fs.readFileSync(path.join(__dirname, '..', ruta), 'utf8');
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const modulo = { exports: {} };
  new Function('module', 'exports', 'require', js)(modulo, modulo.exports, require);
  return modulo.exports;
}
const { rutinasComunEs, rutinasComunPt } = cargarTs('src/i18n/textos/rutinas-comun.ts');
const tEs = rutinasComunEs.texto;
const tPt = rutinasComunPt.texto;

/** Una rutina leída, en corto: [nombre, series, reps, carga, descanso, nota, junto]. */
function corto(r) {
  return {
    nombre: r.nombre,
    notas: r.notas,
    dias: r.dias.map((d) => [d.nombre, d.notas, d.ejercicios.map((e) =>
      [e.nombre, e.series, e.reps, e.carga, e.descanso_seg, e.nota, e.junto_al_anterior])]),
    no: r.noEntendidas,
  };
}
const ej = (nombre, series, reps, carga = '', descanso_seg = null, nota = '', junto_al_anterior = false) =>
  ({ nombre, series, reps, carga, descanso_seg, nota, junto_al_anterior });

// ═══════════════════════════════════════════════════════════
console.log('\n── 1 · El renglón rápido del editor ──');
{
  // Los cinco del contrato.
  ok('press banca 4x10 40kg 90s', R.leerRenglon('Press banca 4x10 40kg 90s'), ej('Press banca', 4, '10', '40 kg', 90));
  ok('sentadilla 4 x 8-10 60 kg 2 min', R.leerRenglon('Sentadilla 4 x 8-10 60 kg 2 min'), ej('Sentadilla', 4, '8-10', '60 kg', 120));
  ok('plancha 3x45s: el tiempo pegado a la x son las repeticiones', R.leerRenglon('Plancha 3x45s'), ej('Plancha', 3, '45 s'));
  ok('remo 3x12 25 lb 1:30', R.leerRenglon('Remo 3x12 25 lb 1:30'), ej('Remo', 3, '12', '25 lb', 90));
  ok('flexiones 3 series de 15 peso corporal', R.leerRenglon('Flexiones 3 series de 15 peso corporal'), ej('Flexiones', 3, '15', 'peso corporal'));

  ok('el nombre puede venir después de los números', R.leerRenglon('4x10 Press banca 40kg'), ej('Press banca', 4, '10', '40 kg'));
  ok('c/lado va con las repeticiones', R.leerRenglon('Sentadilla búlgara 3x12 c/lado 10 kg'), ej('Sentadilla búlgara', 3, '12 c/lado', '10 kg'));
  ok('pirámide 12-10-8 y lbs', R.leerRenglon('Curl 3x12-10-8 20 lbs'), ej('Curl', 3, '12-10-8', '20 lb'));
  ok('un número antes de las series es parte del nombre', R.leerRenglon('Leg press 45 4x15 100'), ej('Leg press 45', 4, '15', '100'));
  ok('«45°» también', R.leerRenglon('Prensa 45° 4x15 100kg'), ej('Prensa 45°', 4, '15', '100 kg'));
  ok('«Peso muerto» no es la etiqueta de la carga', R.leerRenglon('Peso muerto 4x8 60kg'), ej('Peso muerto', 4, '8', '60 kg'));
  ok('la banda es la carga y el «con» no queda colgando', R.leerRenglon('Remo con banda roja 3x15'), ej('Remo', 3, '15', 'banda roja'));
  ok('lo que sobra va a la nota, con sus palabras',
    R.leerRenglon('press de hombros 3 de 12 con botellas de 1 litro'),
    ej('press de hombros', 3, '12', '', null, 'con botellas de 1 litro'));
  ok('cardio: el tiempo es lo que dura', R.leerRenglon('Cinta 20 min'), ej('Cinta', null, '20 min'));
  ok('y si ya hay repeticiones, el tiempo es el descanso', R.leerRenglon('Saltar la cuerda 5x1 min descanso 1 min'), ej('Saltar la cuerda', 5, '1 min', '', 60));
  ok('portugués: até a falha', R.leerRenglon('Abdominal supra 3x até a falha'), ej('Abdominal supra', 3, 'até a falha'));
  ok('carga por lado', R.leerRenglon('Estocadas caminando 3x12 c/pierna 10 kg c/mano'), ej('Estocadas caminando', 3, '12 c/pierna', '10 kg c/mano'));
  ok('x20 sin series', R.leerRenglon('Sentadillas x20'), ej('Sentadillas', null, '20'));
  ok('solo el nombre sirve (después se completa)', R.leerRenglon('Sentadilla'), ej('Sentadilla', null, ''));
  ok('sin nombre no hay ejercicio', R.leerRenglon('4x12'), null);
  ok('vacío', R.leerRenglon('   '), null);
  ok('con viñeta, número y emoji', R.leerRenglon('✅ 3) Hip thrust 4x12 60kg 🔥'), ej('Hip thrust', 4, '12', '60 kg'));
  ok('«×» y comillas tipográficas', R.leerRenglon('Plancha lateral 3 × 30″ c/lado'), ej('Plancha lateral', 3, '30 s c/lado'));
  ok('«descanso 2» no se adivina: ¿segundos o minutos? queda en la nota',
    R.leerRenglon('Remo al mentón 3x12 descanso 2'), ej('Remo al mentón', 3, '12', '', null, 'descanso 2'));
  ok('un rango de descanso no es UN descanso', R.leerRenglon('Press 4x10 descanso 60-90 s'), ej('Press', 4, '10', '', null, 'descanso 60-90 s'));
  ok('el rango de tiempo sin series previas es la duración', R.leerRenglon('Plancha 3 series 30-45 s'), ej('Plancha', 3, '30-45 s'));
  ok('«de 12 – 10 kg»: la raya con espacios separa, no es un rango',
    R.leerRenglon('Curl martillo: 3 series de 12 – 10 kg – descanso 45"'), ej('Curl martillo', 3, '12', '10 kg', 45));
  ok('el reloj de WhatsApp es un descanso', R.leerRenglon('Sentadilla 4x10 ⏱️ 1:30'), ej('Sentadilla', 4, '10', '', 90));
  ok('«1\'30»', R.leerRenglon('Pájaros 3x15 1\'30'), ej('Pájaros', 3, '15', '', 90));
  ok('series y reps con etiqueta', R.leerRenglon('Sentadilla - Series: 4 - Reps: 12 - Peso: 40kg - Descanso: 60s'), ej('Sentadilla', 4, '12', '40 kg', 60));
  ok('mancuernas de a dos', R.leerRenglon('Press con mancuernas 3x12 2x10kg'), ej('Press con mancuernas', 3, '12', '2x10 kg'));
  ok('la nota con etiqueta va entera', R.leerRenglon('Sentadilla 4x10 60kg - Obs: rodilla hacia afuera, 3x por semana'),
    ej('Sentadilla', 4, '10', '60 kg', null, 'rodilla hacia afuera, 3x por semana'));
  ok('«junto con el anterior»', R.leerRenglon('Remo 3x12 junto con el anterior').junto_al_anterior, true);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 2 · La carga nunca gana una unidad ──');
{
  ok('«40» queda «40»', R.normalizarCarga('40'), '40');
  ok('«12,5» queda «12,5»', R.normalizarCarga('12,5'), '12,5');
  ok('40kg → 40 kg', R.normalizarCarga('40kg'), '40 kg');
  ok('40 KG → 40 kg', R.normalizarCarga('40 KG'), '40 kg');
  ok('40 kilos → 40 kg', R.normalizarCarga('40 kilos'), '40 kg');
  ok('20 lbs → 20 lb', R.normalizarCarga('20 lbs'), '20 lb');
  ok('20 libras → 20 lb', R.normalizarCarga('20 libras'), '20 lb');
  ok('25LB → 25 lb', R.normalizarCarga('25LB'), '25 lb');
  ok('placa7 → placa 7', R.normalizarCarga('placa7'), 'placa 7');
  ok('7 placas → placa 7', R.normalizarCarga('7 placas'), 'placa 7');
  ok('40 - 50 kg → 40-50 kg', R.normalizarCarga('40 - 50 kg'), '40-50 kg');
  ok('peso do corpo → peso corporal', R.normalizarCarga('peso do corpo'), 'peso corporal');
  ok('banda roja queda', R.normalizarCarga('Banda roja'), 'Banda roja');
  ok('normalizar dos veces da lo mismo', R.normalizarCarga(R.normalizarCarga('20lbs c/ lado')), '20 lb c/lado');
  ok('una fila de Excel con columna «Kg» no le pone kg al número',
    R.leerRutina('Ejercicio\tSeries\tReps\tKg\nSentadilla\t4\t10\t60').dias[0].ejercicios[0].carga, '60');
  ok('un texto pegado tampoco', R.leerRutina('Día 1\nPress banca 4x10 40').dias[0].ejercicios[0].carga, '40');

  ok('botón kg sobre «40»', R.conUnidad('40', 'kg'), '40 kg');
  ok('botón lb sobre «40 kg»: corrige la unidad, no convierte', R.conUnidad('40 kg', 'lb'), '40 lb');
  ok('botón placa sobre «7»', R.conUnidad('7', 'placa'), 'placa 7');
  ok('botón kg sobre «placa 7»', R.conUnidad('placa 7', 'kg'), '7 kg');
  ok('botón placa dos veces', R.conUnidad(R.conUnidad('7', 'placa'), 'placa'), 'placa 7');
  ok('botón lb conserva «c/lado»', R.conUnidad('20 kg c/lado', 'lb'), '20 lb c/lado');
  ok('botón kg sobre un rango', R.conUnidad('40-50', 'kg'), '40-50 kg');
  ok('botón kg con coma', R.conUnidad('12,5', 'kg'), '12,5 kg');
  ok('peso corporal', R.conUnidad('', 'corporal'), 'peso corporal');
  ok('de peso corporal a kg: se vacía para escribir el número', R.conUnidad('peso corporal', 'kg'), '');
  ok('sin número no hay a qué ponerle unidad', R.conUnidad('banda roja', 'kg'), 'banda roja');
  ok('vacío sigue vacío', R.conUnidad('', 'kg'), '');
  ok('qué botón está prendido', ['40 kg', '25 lb', 'placa 7', 'peso corporal', '40', 'banda roja'].map(R.unidadDe),
    ['kg', 'lb', 'placa', 'corporal', null, null]);
  ok('las cuatro unidades, en orden', R.UNIDADES_CARGA, ['kg', 'lb', 'placa', 'corporal']);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 3 · Repeticiones y descanso ──');
{
  ok('45s → 45 s', R.normalizarReps('45s'), '45 s');
  ok('45" → 45 s', R.normalizarReps('45"'), '45 s');
  ok('30 segundos → 30 s', R.normalizarReps('30 segundos'), '30 s');
  ok('1min → 1 min', R.normalizarReps('1min'), '1 min');
  ok('8 - 12 → 8-12', R.normalizarReps('8 - 12'), '8-12');
  ok('12 reps → 12', R.normalizarReps('12 reps'), '12');
  ok('10 repetições → 10', R.normalizarReps('10 repetições'), '10');
  ok('c/ lado → c/lado', R.normalizarReps('12 c/ lado'), '12 c/lado');
  ok('al fallo queda', R.normalizarReps('AL FALLO'), 'AL FALLO');

  const d = ['90', '90s', '90 seg', '90"', "90''", '1:30', "1'30", '1 min', '1,5 min', '1 min 30 s', "2'", '0 s', '15 min'];
  ok('descansos escritos de muchas formas', d.map((x) => R.leerDescanso(x)), [90, 90, 90, 90, 90, 90, 90, 60, 90, 90, 120, 0, 900]);
  ok('un número solo menor a 10 no se adivina', R.leerDescanso('2'), null);
  ok('salvo que la columna diga «(min)»', R.leerDescanso('2', 'min'), 120);
  ok('más de 15 minutos no entra en la base', R.leerDescanso('20 min'), null);
  ok('texto que no es un tiempo', R.leerDescanso('poco'), null);
  ok('cómo se muestra', [30, 45, 60, 90, 120, 75, 0, 900, null].map(R.formatoDescanso),
    ['30 s', '45 s', '1 min', '1:30', '2 min', '1:15', '0 s', '15 min', '']);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 4 · Rutinas reales pegadas ──');

// 1. WhatsApp de Paraguay: saludo, días en mayúsculas con emojis, «1)».
const WHATSAPP = `Hola! Te paso tu rutina 💪🏼

🔥 LUNES – PIERNAS 🔥
1) Sentadilla libre 4x12
2) Prensa 45° 4x15
3) Estocadas 3x10 c/pierna
4) Sillón de cuádriceps 3x15
5) Gemelos parado 4x20

🔥 MIÉRCOLES – PECHO Y TRÍCEPS 🔥
1) Press banca plano 4x10
2) Press inclinado con mancuernas 3x12
3) Aperturas 3x12
4) Tríceps en polea 3x15
5) Fondos en banco 3 x al fallo

Cualquier duda me escribís 🙌`;
ok('1 · WhatsApp con saludo, emojis y días en mayúsculas', corto(R.leerRutina(WHATSAPP)), {
  nombre: null, notas: '',
  dias: [
    ['LUNES – PIERNAS', '', [
      ['Sentadilla libre', 4, '12', '', null, '', false],
      ['Prensa 45°', 4, '15', '', null, '', false],
      ['Estocadas', 3, '10 c/pierna', '', null, '', false],
      ['Sillón de cuádriceps', 3, '15', '', null, '', false],
      ['Gemelos parado', 4, '20', '', null, '', false]]],
    ['MIÉRCOLES – PECHO Y TRÍCEPS', '', [
      ['Press banca plano', 4, '10', '', null, '', false],
      ['Press inclinado con mancuernas', 3, '12', '', null, '', false],
      ['Aperturas', 3, '12', '', null, '', false],
      ['Tríceps en polea', 3, '15', '', null, '', false],
      ['Fondos en banco', 3, 'al fallo', '', null, '', false]]]],
  no: ['Hola! Te paso tu rutina 💪🏼', 'Cualquier duda me escribís 🙌'],
});

// 2. Brasil: «Treino A – Peito», sin viñetas, descanso general al final.
const TREINO = `TREINO A – PEITO E TRÍCEPS
Supino reto 4x10 30kg
Supino inclinado com halteres 3x12 14kg
Crucifixo 3x12
Tríceps corda 4x12
Tríceps testa 3x10 10kg
Descanso: 60s entre as séries

TREINO B – COSTAS E BÍCEPS
Puxada frontal 4x10
Remada baixa 4x12 40kg
Remada unilateral (serrote) 3x10 cada lado
Rosca direta 3x12 12kg

TREINO C – PERNAS
Agachamento livre 4 séries de 10 repetições
Leg press 45° 4x12 100kg
Panturrilha em pé 4x20
Prancha 3x30s`;
ok('2 · Treino A/B/C en portugués', corto(R.leerRutina(TREINO)), {
  nombre: null, notas: '',
  dias: [
    ['TREINO A – PEITO E TRÍCEPS', 'Descanso: 60s entre as séries', [
      ['Supino reto', 4, '10', '30 kg', null, '', false],
      ['Supino inclinado com halteres', 3, '12', '14 kg', null, '', false],
      ['Crucifixo', 3, '12', '', null, '', false],
      ['Tríceps corda', 4, '12', '', null, '', false],
      ['Tríceps testa', 3, '10', '10 kg', null, '', false]]],
    ['TREINO B – COSTAS E BÍCEPS', '', [
      ['Puxada frontal', 4, '10', '', null, '', false],
      ['Remada baixa', 4, '12', '40 kg', null, '', false],
      ['Remada unilateral (serrote)', 3, '10 cada lado', '', null, '', false],
      ['Rosca direta', 3, '12', '12 kg', null, '', false]]],
    ['TREINO C – PERNAS', '', [
      ['Agachamento livre', 4, '10', '', null, '', false],
      ['Leg press 45°', 4, '12', '100 kg', null, '', false],
      ['Panturrilha em pé', 4, '20', '', null, '', false],
      ['Prancha', 3, '30 s', '', null, '', false]]]],
  no: [],
});

// 3. Planilla de Excel con encabezado en español (sin días).
const EXCEL = 'Ejercicio\tSeries\tReps\tPeso\tDescanso\n'
  + 'Sentadilla\t4\t10\t40 kg\t90 s\n'
  + 'Press banca\t4\t8-10\t30kg\t2 min\n'
  + 'Remo con barra\t3\t12\t25\t60\n'
  + 'Plancha\t3\t45 s\t\t30';
ok('3 · Excel con encabezado: la columna Peso con «25» queda «25»', corto(R.leerRutina(EXCEL)), {
  nombre: null, notas: '',
  dias: [['', '', [
    ['Sentadilla', 4, '10', '40 kg', 90, '', false],
    ['Press banca', 4, '8-10', '30 kg', 120, '', false],
    ['Remo con barra', 3, '12', '25', 60, '', false],
    ['Plancha', 3, '45 s', '', 30, '', false]]]],
  no: [],
});

// 4. Planilla en portugués con columna «Dia» y observaciones.
const PLANILHA = 'Dia\tExercício\tSéries\tRepetições\tCarga\tIntervalo\tObservação\n'
  + 'A\tAgachamento livre\t4\t12\t20kg\t1 min\t\n'
  + 'A\tCadeira extensora\t3\t15\tplaca 5\t45s\t\n'
  + 'B\tSupino reto\t4\t10\t25 kg\t90s\tDescer controlando\n'
  + 'B\tPuxada frontal\t4\t10\t35\t60s\t';
ok('4 · Planilha con Dia, Intervalo y Observação', corto(R.leerRutina(PLANILHA)), {
  nombre: null, notas: '',
  dias: [
    ['A', '', [
      ['Agachamento livre', 4, '12', '20 kg', 60, '', false],
      ['Cadeira extensora', 3, '15', 'placa 5', 45, '', false]]],
    ['B', '', [
      ['Supino reto', 4, '10', '25 kg', 90, 'Descer controlando', false],
      ['Puxada frontal', 4, '10', '35', 60, '', false]]]],
  no: [],
});

// 5. Argentina: título de la rutina, «4 series de 8 a 10 – descanso 2 min».
const SERIES_DE = `RUTINA HIPERTROFIA – MES 1

DÍA 1 (Tren superior)
• Press banca: 4 series de 8 a 10 – descanso 2 min
• Remo con mancuerna: 4 series de 10 c/lado – descanso 90 seg
• Curl martillo: 3 series de 12 – 10 kg
• Tríceps francés: 3 series de 12

DÍA 2 (Tren inferior)
• Sentadilla búlgara: 3 series de 10 c/pierna
• Peso muerto rumano: 4 series de 8 – 50 kg – descanso 2 min
• Abdominales: 3 series de 20`;
ok('5 · Título, «series de» y descansos con palabras', corto(R.leerRutina(SERIES_DE)), {
  nombre: 'RUTINA HIPERTROFIA – MES 1', notas: '',
  dias: [
    ['DÍA 1 (Tren superior)', '', [
      ['Press banca', 4, '8 a 10', '', 120, '', false],
      ['Remo con mancuerna', 4, '10 c/lado', '', 90, '', false],
      ['Curl martillo', 3, '12', '10 kg', null, '', false],
      ['Tríceps francés', 3, '12', '', null, '', false]]],
    ['DÍA 2 (Tren inferior)', '', [
      ['Sentadilla búlgara', 3, '10 c/pierna', '', null, '', false],
      ['Peso muerto rumano', 4, '8', '50 kg', 120, '', false],
      ['Abdominales', 3, '20', '', null, '', false]]]],
  no: [],
});

// 6. Superseries escritas como 2a/2b y como A1/A2.
const SUPERSERIES = `Día A · Full body
1. Sentadilla goblet 3x12 16kg
2a. Press de hombros con mancuernas 3x10 8kg
2b. Remo invertido 3x10
3a. Plancha 3x40s
3b. Dead bug 3x10 c/lado

Treino B
A1 - Levantamento terra 4x6 80kg
A2 - Prancha lateral 3x30s cada lado
B1 - Supino inclinado 3x10
B2 - Remada curvada 3x10`;
ok('6 · Superseries 2a/2b y A1/A2', corto(R.leerRutina(SUPERSERIES)), {
  nombre: null, notas: '',
  dias: [
    ['Día A · Full body', '', [
      ['Sentadilla goblet', 3, '12', '16 kg', null, '', false],
      ['Press de hombros con mancuernas', 3, '10', '8 kg', null, '', false],
      ['Remo invertido', 3, '10', '', null, '', true],
      ['Plancha', 3, '40 s', '', null, '', false],
      ['Dead bug', 3, '10 c/lado', '', null, '', true]]],
    ['Treino B', '', [
      ['Levantamento terra', 4, '6', '80 kg', null, '', false],
      ['Prancha lateral', 3, '30 s cada lado', '', null, '', true],
      ['Supino inclinado', 3, '10', '', null, '', false],
      ['Remada curvada', 3, '10', '', null, '', true]]]],
  no: [],
});

// 7. Todas las formas de escribir la carga.
const UNIDADES = `LUNES
- Press de pecho en máquina 3x12 placa 6
- Remo sentado 3x12 7 placas
- Curl con mancuernas 3x12 20 lbs
- Elevaciones laterales 3x15 10 libras
- Sentadilla con banda 3x15 banda roja
- Flexiones 3 series de 15 peso corporal
- Face pull 3x15 25lb 1:30`;
ok('7 · Placas, libras, bandas y peso corporal', corto(R.leerRutina(UNIDADES)), {
  nombre: null, notas: '',
  dias: [['LUNES', '', [
    ['Press de pecho en máquina', 3, '12', 'placa 6', null, '', false],
    ['Remo sentado', 3, '12', 'placa 7', null, '', false],
    ['Curl con mancuernas', 3, '12', '20 lb', null, '', false],
    ['Elevaciones laterales', 3, '15', '10 lb', null, '', false],
    ['Sentadilla con banda', 3, '15', 'banda roja', null, '', false],
    ['Flexiones', 3, '15', 'peso corporal', null, '', false],
    ['Face pull', 3, '15', '25 lb', 90, '', false]]]],
  no: [],
});

// 8. Cardio y core: tiempos como duración y como descanso.
const CARDIO = `Día 3 – Cardio y core
Cinta 20 min
Bici fija 15 min suave
Plancha lateral 3 x 30" c/lado
Burpees 4x10 descanso 30s
Saltar la cuerda 5x1 min descanso 1 min`;
ok('8 · Cardio: minutos, segundos y «c/lado»', corto(R.leerRutina(CARDIO)), {
  nombre: null, notas: '',
  dias: [['Día 3 – Cardio y core', '', [
    ['Cinta', null, '20 min', '', null, '', false],
    ['Bici fija', null, '15 min', '', null, 'suave', false],
    ['Plancha lateral', 3, '30 s c/lado', '', null, '', false],
    ['Burpees', 4, '10', '', 30, '', false],
    ['Saltar la cuerda', 5, '1 min', '', 60, '', false]]]],
  no: [],
});

// 9. Un ejercicio en varios renglones (como se escribe en Notas del celular).
const RENGLONES = `Día B – Espalda

Jalón al pecho
4 x 12
Descanso: 1 min

Remo en polea baja
3 series de 10 repeticiones
Carga: 35 kg

Pullover en polea
3x15`;
ok('9 · Nombre arriba y los datos abajo', corto(R.leerRutina(RENGLONES)), {
  nombre: null, notas: '',
  dias: [['Día B – Espalda', '', [
    ['Jalón al pecho', 4, '12', '', 60, '', false],
    ['Remo en polea baja', 3, '10', '35 kg', null, '', false],
    ['Pullover en polea', 3, '15', '', null, '', false]]]],
  no: [],
});

// 10. Negritas de WhatsApp, calentamiento, «Obs:» abajo del ejercicio. Un
// renglón entero en negrita es un título (así exporta Orden los nombres):
// el primero, seguido de otro título, es el nombre de la rutina.
const NOTAS = `*Semana 1 a 4*
*Día A – Piernas*
Calentamiento: 10 min de bici + movilidad de cadera
1. Sentadilla con barra 4x8-10 60kg 2 min
   Obs: bajar hasta la paralela
2. Prensa 4x12 120 kg
3. Estocadas caminando 3x12 c/pierna 10 kg c/mano`;
ok('10 · Calentamiento a las notas del día y «Obs:» a la del ejercicio', corto(R.leerRutina(NOTAS)), {
  nombre: 'Semana 1 a 4', notas: '',
  dias: [['Día A – Piernas', 'Calentamiento: 10 min de bici + movilidad de cadera', [
    ['Sentadilla con barra', 4, '8-10', '60 kg', 120, 'bajar hasta la paralela', false],
    ['Prensa', 4, '12', '120 kg', null, '', false],
    ['Estocadas caminando', 3, '12 c/pierna', '10 kg c/mano', null, '', false]]]],
  no: [],
});

// 11. Google Sheets con columna de número, descanso en minutos y un link.
const SHEETS = 'N°\tEjercicio\tSeries\tRepeticiones\tKg\tDescanso (min)\tVideo\n'
  + '1\tHip thrust\t4\t12\t60\t1,5\thttps://youtu.be/abc123\n'
  + '2\tPeso muerto rumano\t3\t10\t40\t2\t\n'
  + '3\tPatada de glúteo en polea\t3\t15 c/pierna\tplaca 3\t1\t';
ok('11 · «Descanso (min)» da la unidad; la columna que no se conoce va a la nota', corto(R.leerRutina(SHEETS)), {
  nombre: null, notas: '',
  dias: [['', '', [
    ['Hip thrust', 4, '12', '60', 90, 'Video: https://youtu.be/abc123', false],
    ['Peso muerto rumano', 3, '10', '40', 120, '', false],
    ['Patada de glúteo en polea', 3, '15 c/pierna', 'placa 3', 60, '', false]]]],
  no: [],
});

// 12. Todo en minúsculas, «3 de 15», entrenamiento en casa.
const MINUSCULAS = `lunes y jueves
sentadilla 3 de 15
puente de gluteos 3 de 20
abduccion con banda 3 de 20 banda verde
plancha 3 de 30 seg

martes y viernes
flexiones de rodillas 3 de 10
press de hombros 3 de 12 con botellas de 1 litro`;
ok('12 · Minúsculas y «3 de 15»', corto(R.leerRutina(MINUSCULAS)), {
  nombre: null, notas: '',
  dias: [
    ['lunes y jueves', '', [
      ['sentadilla', 3, '15', '', null, '', false],
      ['puente de gluteos', 3, '20', '', null, '', false],
      ['abduccion con banda', 3, '20', 'banda verde', null, '', false],
      ['plancha', 3, '30 s', '', null, '', false]]],
    ['martes y viernes', '', [
      ['flexiones de rodillas', 3, '10', '', null, '', false],
      ['press de hombros', 3, '12', '', null, 'con botellas de 1 litro', false]]]],
  no: [],
});

// 13. Brasil: «intervalo 60s», «cada perna», «até a falha».
const INFERIORES = `Treino A - Inferiores
Agachamento sumô com halter 4x12 20kg intervalo 60s
Afundo 3x10 cada perna
Stiff 4x10 30kg
Elevação pélvica 4x12 40kg intervalo 90s
Abdominal supra 3x até a falha`;
ok('13 · Intervalo, cada perna y até a falha', corto(R.leerRutina(INFERIORES)), {
  nombre: null, notas: '',
  dias: [['Treino A - Inferiores', '', [
    ['Agachamento sumô com halter', 4, '12', '20 kg', 60, '', false],
    ['Afundo', 3, '10 cada perna', '', null, '', false],
    ['Stiff', 4, '10', '30 kg', null, '', false],
    ['Elevação pélvica', 4, '12', '40 kg', 90, '', false],
    ['Abdominal supra', 3, 'até a falha', '', null, '', false]]]],
  no: [],
});

// 14. Numeración con los emojis de número y nombres en negrita.
const TECLAS = `*RUTINA FULL BODY* 💪
1️⃣ *Sentadilla goblet* 3x15
2️⃣ *Flexiones* 3x10
3️⃣ *Remo con mancuerna* 3x12 c/lado 12kg
4️⃣ *Plancha* 3x30"`;
ok('14 · 1️⃣ 2️⃣ 3️⃣ y *negritas*: un solo título es el nombre de la rutina', corto(R.leerRutina(TECLAS)), {
  nombre: 'RUTINA FULL BODY', notas: '',
  dias: [['', '', [
    ['Sentadilla goblet', 3, '15', '', null, '', false],
    ['Flexiones', 3, '10', '', null, '', false],
    ['Remo con mancuerna', 3, '12 c/lado', '12 kg', null, '', false],
    ['Plancha', 3, '30 s', '', null, '', false]]]],
  no: [],
});

// 15. Descansos escritos de todas las formas, y uno que no se adivina.
const DESCANSOS = `Día 2
Press militar 4x10 20kg descanso 60
Elevaciones laterales 3x12 6kg desc. 45"
Pájaros 3x15 1'30
Encogimientos 3x15 24 kg pausa 1 min
Remo al mentón 3x12 descanso 2`;
ok('15 · «descanso 60», «desc. 45"», «1\'30», «pausa 1 min», y «descanso 2» a la nota', corto(R.leerRutina(DESCANSOS)), {
  nombre: null, notas: '',
  dias: [['Día 2', '', [
    ['Press militar', 4, '10', '20 kg', 60, '', false],
    ['Elevaciones laterales', 3, '12', '6 kg', 45, '', false],
    ['Pájaros', 3, '15', '', 90, '', false],
    ['Encogimientos', 3, '15', '24 kg', 60, '', false],
    ['Remo al mentón', 3, '12', '', null, 'descanso 2', false]]]],
  no: [],
});

// 16. Filas de planilla sin encabezado, debajo de un día.
const SIN_ENCABEZADO = 'DÍA A\nSentadilla\t4\t10\t40 kg\nPrensa\t4\t12\t100\nCamilla de isquios\t3\t12\tplaca 5';
ok('16 · Planilla sin encabezado: series, reps y carga en el orden de siempre', corto(R.leerRutina(SIN_ENCABEZADO)), {
  nombre: null, notas: '',
  dias: [['DÍA A', '', [
    ['Sentadilla', 4, '10', '40 kg', null, '', false],
    ['Prensa', 4, '12', '100', null, '', false],
    ['Camilla de isquios', 3, '12', 'placa 5', null, '', false]]]],
  no: [],
});

// 17. «Superserie:» y «X + Y» en un renglón.
const BLOQUES = `Día C
Superserie:
- Curl de bíceps 3x12
- Tríceps en polea 3x12
Abdominales 3x20

Día D
Press banca 4x10 + Remo con barra 4x10
Sentadilla 4x8`;
ok('17 · «Superserie:» agrupa los dos que siguen; «+» junta en un renglón', corto(R.leerRutina(BLOQUES)), {
  nombre: null, notas: '',
  dias: [
    ['Día C', '', [
      ['Curl de bíceps', 3, '12', '', null, '', false],
      ['Tríceps en polea', 3, '12', '', null, '', true],
      ['Abdominales', 3, '20', '', null, '', false]]],
    ['Día D', '', [
      ['Press banca', 4, '10', '', null, '', false],
      ['Remo con barra', 4, '10', '', null, '', true],
      ['Sentadilla', 4, '8', '', null, '', false]]]],
  no: [],
});

// 18. Un circuito: lo que no se puede representar queda a la vista.
const CIRCUITO = `Día E – Circuito
Circuito x3 vueltas
- Sentadillas x20
- Flexiones x10
- Burpees x10
Descansar 2 min entre vueltas`;
ok('18 · Circuito: los ejercicios sí, «x3 vueltas» no se inventa', corto(R.leerRutina(CIRCUITO)), {
  nombre: null, notas: '',
  dias: [['Día E – Circuito', '', [
    ['Sentadillas', null, '20', '', null, '', false],
    ['Flexiones', null, '10', '', null, '', false],
    ['Burpees', null, '10', '', null, '', false]]]],
  no: ['Circuito x3 vueltas', 'Descansar 2 min entre vueltas'],
});

// 19. Días de descanso, semanas y una despedida: nada de eso es un día.
const SEMANA = `LUNES: Pecho
Press banca 4x10
MARTES: descanso
Semana 2: subir 2,5 kg
MIÉRCOLES: Espalda
Remo con barra 4x10
Éxitos!! 💥`;
ok('19 · «MARTES: descanso» y «Semana 2» no son días', corto(R.leerRutina(SEMANA)), {
  nombre: null, notas: '',
  dias: [
    ['LUNES: Pecho', '', [['Press banca', 4, '10', '', null, '', false]]],
    ['MIÉRCOLES: Espalda', '', [['Remo con barra', 4, '10', '', null, '', false]]]],
  no: ['MARTES: descanso', 'Semana 2: subir 2,5 kg', 'Éxitos!! 💥'],
});

// 20. Una lista sin días, con renglones de solo nombre.
const LISTA = `Estocadas
- Sillón de cuádriceps
Algo que no es un ejercicio
Gemelos 4x20`;
ok('20 · Sin días: un día sin nombre; lo conocido o con viñeta es ejercicio', corto(R.leerRutina(LISTA)), {
  nombre: null, notas: '',
  dias: [['', '', [
    ['Estocadas', null, '', '', null, '', false],
    ['Sillón de cuádriceps', null, '', '', null, '', false],
    ['Gemelos', 4, '20', '', null, '', false]]]],
  no: ['Algo que no es un ejercicio'],
});

// 21. Un día que arranca con «Calentamiento:» como subtítulo.
ok('21 · Un día y abajo «Calentamiento:»: sigue siendo un día', corto(R.leerRutina('DÍA 1\nCalentamiento:\n- Bici 5 min\n- Sentadilla 4x10')), {
  nombre: null, notas: '',
  dias: [['DÍA 1', '', [
    ['Bici', null, '5 min', '', null, '', false],
    ['Sentadilla', 4, '10', '', null, '', false]]]],
  no: ['Calentamiento:'],
});

// 22. Una lista con letras no son días.
ok('22 · «A) Sentadilla 4x12» es un ejercicio; «A - Pecho» es un día', corto(R.leerRutina('A - Pecho\nA) Press banca 4x10\nB) Aperturas 3x12')), {
  nombre: null, notas: '',
  dias: [['A - Pecho', '', [
    ['Press banca', 4, '10', '', null, '', false],
    ['Aperturas', 3, '12', '', null, '', false]]]],
  no: [],
});
ok('rayas largas como separador (no es el formato de Orden)', R.leerRenglon('Sentadilla — 4x12 — 40kg — 90s'), ej('Sentadilla', 4, '12', '40 kg', 90));
ok('una celda de repeticiones con «4x12»', R.leerRutina('Ejercicio\tReps\tPeso\nSentadilla\t4x12\t40kg').dias[0].ejercicios[0], ej('Sentadilla', 4, '12', '40 kg'));
ok('Windows (\\r\\n) y una tabla en markdown', corto(R.leerRutina('| Ejercicio | Series | Reps |\r\n|---|---|---|\r\n| Remo | 3 | 12 |')), {
  nombre: null, notas: '', dias: [['', '', [['Remo', 3, '12', '', null, '', false]]]], no: [],
});

ok('un texto vacío no rompe', corto(R.leerRutina('')), { nombre: null, notas: '', dias: [], no: [] });
ok('solo emojis tampoco', corto(R.leerRutina('💪🔥\n\n🙌')), { nombre: null, notas: '', dias: [], no: [] });

// ═══════════════════════════════════════════════════════════
console.log('\n── 4b · Más rutinas reales: lo que no puede inventar ni perder ──');
// Un nombre con datos adentro es un ejercicio inventado: `guardar_rutina` lo
// crea en la biblioteca con ese nombre y parte el historial de cargas.
const nombresDe = (r) => r.dias.flatMap((d) => d.ejercicios.map((e) => e.nombre));
const conDatos = (r) => nombresDe(r).filter((n) => /\d\s*[x×/\-]\s*\d|\b\d+\s*(?:x|series)\b|\s\d{1,2}$|^(?:superserie|bi-?set)/i.test(n));
const fila = (e) => e && [e.nombre, e.series, e.reps, e.carga, e.descanso_seg, e.nota];

// 23. WhatsApp de Paraguay: «3 x 12 x 20kg», «3x12x10kg», pirámide sin series, «Calentar…».
const PY = `🏋️‍♂️ RUTINA DE FUERZA 🏋️‍♀️

📌 DÍA 1 - PECHO/TRÍCEPS
🔥 Calentar 10 min en cinta
✅ Press banca 3 x 12 x 20kg
✅ Press inclinado mancuernas 3x12x10kg
✅ Aperturas 12/10/8
💧 Tomá agua`;
ok('23 · «NxMxcarga», pirámide sin series y «Calentar» a las notas del día', corto(R.leerRutina(PY)), {
  nombre: 'RUTINA DE FUERZA', notas: '',
  dias: [['DÍA 1 - PECHO/TRÍCEPS', 'Calentar 10 min en cinta', [
    ['Press banca', 3, '12', '20 kg', null, '', false],
    ['Press inclinado mancuernas', 3, '12', '10 kg', null, '', false],
    ['Aperturas', null, '12/10/8', '', null, '', false]]]],
  no: ['💧 Tomá agua'],
});

// 24. Pirámides sin series: los números no se quedan en el nombre.
const PIRAMIDES = 'Día 1\nPress banca 12-10-8-6 40kg\nRemo 12/10/8 30kg\nCurl 15-12-10\nRemo bajo 12/10/8 1:30';
ok('24 · «12-10-8-6 40kg», «12/10/8»: las repeticiones, no el nombre', R.leerRutina(PIRAMIDES).dias[0].ejercicios.map(fila), [
  ['Press banca', null, '12-10-8-6', '40 kg', null, ''],
  ['Remo', null, '12/10/8', '30 kg', null, ''],
  ['Curl', null, '15-12-10', '', null, ''],
  ['Remo bajo', null, '12/10/8', '', 90, '']]);

// 25. El guion con espacios separa; pegado o con números cercanos es un rango.
const GUION = 'Día 1\nSentadilla 4x10 - 60\nPress militar 3x10 - 1 min\nBurpees 3 x 10 - 30 seg de descanso\n'
  + 'Remada curvada 4x10 - 40kg\nPrensa 4 x 8 - 12\nZancadas 3x10-30 seg de descanso\nPress 4x10 40 - 50 kg';
ok('25 · «4x10 - 60» es la carga, «- 1 min» el descanso; «8 - 12» y «40 - 50 kg» son rangos',
  R.leerRutina(GUION).dias[0].ejercicios.map(fila), [
    ['Sentadilla', 4, '10', '60', null, ''],
    ['Press militar', 3, '10', '', 60, ''],
    ['Burpees', 3, '10', '', 30, ''],
    ['Remada curvada', 4, '10', '40 kg', null, ''],
    ['Prensa', 4, '8-12', '', null, ''],
    ['Zancadas', 3, '10', '', 30, ''],
    ['Press', 4, '10', '40-50 kg', null, '']]);

// 26. Números que no son una carga: RIR, RPE, tempo, velocidad de la cinta.
const NUMEROS = 'Treino A\nRemada curvada 3x12 RIR 2\nAgachamento 4x8 RPE 8\nStiff 4x6 tempo 3-1-1\n'
  + 'Caminhada na esteira 30 min velocidade 6\nRemo 3x12 con 25\nPress 4x10 carga 25';
ok('26 · «RIR 2», «RPE 8», «tempo 3-1-1» quedan en la nota; «con 25» y «carga 25» sí son la carga',
  R.leerRutina(NUMEROS).dias[0].ejercicios.map((e) => [e.carga, e.nota]),
  [['', 'RIR 2'], ['', 'RPE 8'], ['', 'tempo 3-1-1'], ['', 'velocidade 6'], ['25', ''], ['25', '']]);

// 27. Una pausa isométrica no es el descanso.
ok('27 · «pausa 2 seg arriba» y «2 seg abajo» van a la nota, no al descanso',
  R.leerRutina('Día 2 - Glúteos\nHip thrust 4x12 70 kg (pausa 2 seg arriba)\nSentadilla 4x8 60kg 2 seg abajo\nPlancha 3x30s pausa 30 s')
    .dias[0].ejercicios.map((e) => [e.descanso_seg, e.nota]),
  [[null, 'pausa 2 seg arriba'], [null, '2 seg abajo'], [30, '']]);

// 28. Series en rango: no se inventa ni el 3 ni el 4, y el nombre queda limpio.
const RANGO_SERIES = R.leerRutina('Día 1\nSentadilla 3-4 x 10-12\nLeg press 3 a 4 séries de 12');
ok('28 · «3-4 x 10-12», «3 a 4 séries de 12»: repeticiones sí, series no, el rango a la nota',
  [RANGO_SERIES.dias[0].ejercicios.map(fila), conDatos(RANGO_SERIES)], [[
    ['Sentadilla', null, '10-12', '', null, '3-4 x 10-12'],
    ['Leg press', null, '12', '', null, '3 a 4 séries de 12']], []]);

// 29. Días de semana en portugués con descanso, «D1 - Piernas», «Semana 1 - Día 1».
ok('29 · «Terça-feira - folga» y «QUARTA-FEIRA: descanso» no son días',
  R.leerRutina('SEGUNDA-FEIRA\nSupino reto 4x12\nTerça-feira - folga\nQUARTA-FEIRA: descanso\nQuinta-feira\nRemada baixa 4x12')
    .dias.map((d) => d.nombre), ['SEGUNDA-FEIRA', 'Quinta-feira']);
ok('29 · «D1 - Piernas» es un día, no el ejercicio «Piernas»',
  R.leerRutina('D1 - Piernas\nSentadilla 4x10\nD2 - Pecho\nPress banca 4x10').dias.map((d) => [d.nombre, nombresDe({ dias: [d] })]),
  [['D1 - Piernas', ['Sentadilla']], ['D2 - Pecho', ['Press banca']]]);
ok('29 · pero «D1 - Sentadilla 4x10» sigue siendo una superserie',
  R.leerRutina('Día 1\nD1 - Sentadilla 4x10\nD2 - Prensa 4x12').dias[0].ejercicios.map((e) => [e.nombre, e.junto_al_anterior]),
  [['Sentadilla', false], ['Prensa', true]]);
ok('29 · «Semana 1 - Día 1» y «Semana 1 - Día 2» son dos días',
  R.leerRutina('Semana 1 - Día 1\nSentadilla 4x10\nSemana 1 - Día 2\nPress banca 4x10').dias.map((d) => d.nombre),
  ['Semana 1 - Día 1', 'Semana 1 - Día 2']);

// 30. «al fallo» sin series, con viñeta o número.
ok('30 · «- Flexiones al fallo», «1) Fondos hasta el fallo»',
  R.leerRutina('Día 1\n- Flexiones al fallo\n1) Fondos hasta el fallo').dias[0].ejercicios.map(fila),
  [['Flexiones', null, 'al fallo', '', null, ''], ['Fondos', null, 'hasta el fallo', '', null, '']]);

// 31. Circuitos y superseries en un renglón.
ok('31 · «x3 vueltas» y «Todo x3» no son ejercicios',
  corto(R.leerRutina('Día 3 – Circuito\nSentadillas x20\nFlexiones x10\nx3 vueltas\nTodo x3')), {
    nombre: null, notas: '',
    dias: [['Día 3 – Circuito', '', [['Sentadillas', null, '20', '', null, '', false], ['Flexiones', null, '10', '', null, '', false]]]],
    no: ['x3 vueltas', 'Todo x3'],
  });
ok('31 · «Superserie: Curl 3x12 + Tríceps 3x12» no crea «Superserie: Curl»',
  R.leerRutina('Día 1\nSuperserie: Curl 3x12 + Tríceps 3x12\nPlancha 3x30s').dias[0].ejercicios.map((e) => [e.nombre, e.junto_al_anterior]),
  [['Curl', false], ['Tríceps', true], ['Plancha', false]]);
ok('31 · «Superserie: Curl 3x12» y abajo el otro: van juntos',
  R.leerRutina('Día 1\nSuperserie: Curl 3x12\nTríceps 3x12\nPlancha 3x30s').dias[0].ejercicios.map((e) => [e.nombre, e.junto_al_anterior]),
  [['Curl', false], ['Tríceps', true], ['Plancha', false]]);

// 32. Planillas sin encabezado con los datos en la celda del nombre, y un día por columna.
ok('32 · celda «Sentadilla 4x12»: los datos salen de la celda',
  R.leerRutina('Día 1\nSentadilla 4x12\t40kg\nPrensa 3x15\t100 kg').dias[0].ejercicios.map(fila),
  [['Sentadilla', 4, '12', '40 kg', null, ''], ['Prensa', 3, '15', '100 kg', null, '']]);
ok('32 · con encabezado también', R.leerRutina('Ejercicio\tPeso\nSentadilla 4x12\t40kg').dias[0].ejercicios.map(fila),
  [['Sentadilla', 4, '12', '40 kg', null, '']]);
const COLUMNAS = R.leerRutina('DIA 1\tDIA 2\nSentadilla 4x12\tPress banca 4x10\nPrensa 3x15\tRemo 4x10');
ok('32 · un día por columna no se sabe leer: a lo no entendido, sin inventar «DIA 1» ni esconder el día 2 en notas',
  [COLUMNAS.dias.length, COLUMNAS.noEntendidas.length], [0, 3]);

// 33. Conectores sueltos, «un minuto y medio», «Buenos días» (el ejercicio).
ok('33 · sin «con»/«com» sueltos en la nota', R.leerRutina('Día A\nVuelos laterales 3 series de 15 repeticiones con 5 kg\n'
  + 'Agachamento 4 séries de 10 com 40kg\nCurl 3x10 con 15 lb en cada mano').dias[0].ejercicios.map((e) => [e.carga, e.nota]),
[['5 kg', ''], ['40 kg', ''], ['15 lb en cada mano', '']]);
ok('33 · «1 minuto y medio» / «1 minuto e meio» son 90 s',
  R.leerRutina('Día 1\nSentadilla 3x15 descanso 1 minuto y medio\nRemada 3x12 intervalo de 1 minuto e meio')
    .dias[0].ejercicios.map((e) => [e.descanso_seg, e.nota]), [[90, ''], [90, '']]);
ok('33 · y leerDescanso también', [R.leerDescanso('1 minuto y medio'), R.leerDescanso('2 minutos e meio')], [90, 150]);
ok('33 · «Buenos días 3x12 30kg» es el ejercicio; «Buenos días!» sigue siendo un saludo',
  corto(R.leerRutina('Buenos días!\nDía 1\nBuenos días 3x12 30kg\n- Bom dia 3x12\nSentadilla 4x10')), {
    nombre: null, notas: '',
    dias: [['Día 1', '', [['Buenos días', 3, '12', '30 kg', null, '', false], ['Bom dia', 3, '12', '', null, '', false],
      ['Sentadilla', 4, '10', '', null, '', false]]]],
    no: ['Buenos días!'],
  });

// 34. Un título más largo que la base: lo que sobra va a las notas, no desaparece.
ok('34 · un día de más de 40 letras se corta en un espacio y el resto va a sus notas',
  corto(R.leerRutina('DÍA 1 - PECHO, HOMBROS Y TRÍCEPS + ABDOMINALES Y CARDIO\nPress banca 4x10')).dias.map((d) => [d[0], d[1]]),
  [['DÍA 1 - PECHO, HOMBROS Y TRÍCEPS', 'ABDOMINALES Y CARDIO']]);
const LARGO = R.leerRutina('*Plan de fuerza e hipertrofia para las primeras seis semanas del año*\n*Día A*\nSentadilla 4x10');
ok('34 · el nombre de la rutina, igual (60 letras)', [LARGO.nombre, LARGO.notas],
  ['Plan de fuerza e hipertrofia para las primeras seis semanas', 'del año']);

// 35. Una negrita entera: título, salvo que sea un ejercicio con sus datos.
ok('35 · «*Sentadilla 4x10*» (de la lista base) y «*1. Remo 4x10*» son ejercicios',
  nombresDe(R.leerRutina('Día 1\n*Sentadilla 4x10*\n*1. Remo 4x10*')), ['Sentadilla', 'Remo']);
ok('35 · una negrita con datos pegada a otros renglones es un ejercicio; arrancando un bloque, un título',
  corto(R.leerRutina('*LUNES*\n*Jalón al pecho agarre cerrado 4x10*\n\n*Fuerza 5x5*\nSentadilla 5x5')), {
    nombre: null, notas: '',
    dias: [['LUNES', '', [['Jalón al pecho agarre cerrado', 4, '10', '', null, '', false]]],
      ['Fuerza 5x5', '', [['Sentadilla', 5, '5', '', null, '', false]]]],
    no: [],
  });
ok('35 · pirámides con espacios: «12 - 10 - 8» y «6 - 8 - 10»; «10 - 60 - 90s» son tres datos', [
  fila(R.leerRenglon('Curl 3 x 12 - 10 - 8 x 10kg')), fila(R.leerRenglon('Press banca 4 x 6 - 8 - 10')),
  fila(R.leerRenglon('Remo 4x10 - 60 - 90s'))], [
  ['Curl', 3, '12-10-8', '10 kg', null, ''], ['Press banca', 4, '6-8-10', '', null, ''], ['Remo', 4, '10', '60', 90, '']]);
ok('35 · «*MARTES: descanso*» y «*Hola!*» no son títulos',
  R.leerRutina('*Hola!*\n*LUNES*\nSentadilla 4x10\n*MARTES: descanso*\n*JUEVES*\nRemo 4x10').noEntendidas, ['*Hola!*', '*MARTES: descanso*']);

// ═══════════════════════════════════════════════════════════
console.log('\n── 5 · Ida y vuelta: lo que exporta Orden vuelve igual ──');

const e2 = (orden, nombre, series, reps, carga, descanso_seg, nota = '', junto_al_anterior = false) => ({
  id: `re-${orden}-${nombre}`, orden, ejercicio_id: `ej-${nombre}`, nombre, grupo: null, indicaciones: 'NO VA',
  video_url: null, series, reps, carga, descanso_seg, nota, junto_al_anterior,
});
const FUERZA = {
  id: 'r1', cliente_id: 'c1', cliente_nombre: 'Cliente', cliente_notas: 'Rodilla operada, sin saltos',
  estado: 'vigente', nombre: 'Fuerza base',
  notas: 'Entrá en calor 10 minutos antes de empezar.\nTomá agua entre series.',
  desde: '2026-09-01', hasta: null, semanas: 6, version: 3, updated_at: '2026-09-20T10:00:00Z',
  dias: [
    { id: 'd2', orden: 2, nombre: 'Día B · Torso', notas: '', ejercicios: [
      e2(1, 'Press banca plano', 4, '10', '30 kg', 90),
      e2(2, 'Remo con mancuerna', 4, '12', '25 lb', null, '', true),
      e2(3, 'Elevaciones laterales', 3, '15', '5 kg', null, 'Sin balancear el cuerpo.\nSubí hasta la altura del hombro.'),
      e2(4, 'Tríceps con soga', 3, '12-10-8', 'placa 5', 60),
      e2(5, 'Curl martillo', 3, '10', '', 60, '', true),
      e2(6, 'Flexiones de brazos', 3, 'al fallo', 'peso corporal', null),
    ] },
    { id: 'd1', orden: 1, nombre: 'Día A · Piernas', notas: '5 min de bici suave.', ejercicios: [
      e2(2, 'Prensa 45°', 3, '12', '120 kg', 120),
      e2(1, 'Sentadilla con barra', 4, '8-10', '40 kg', 90, 'Bajá hasta la paralela.'),
      e2(3, 'Estocadas caminando', 3, '12 c/pierna', '10 kg c/mano', 60),
      e2(4, 'Gemelos de pie', 4, '20', 'placa 7', 45),
      e2(5, 'Plancha', 3, '45 s', '', 30),
    ] },
    { id: 'd3', orden: 3, nombre: 'Cardio y core', notas: 'Vuelta a la calma: 5 min de caminata.\nEstirá 10 minutos.', ejercicios: [
      e2(1, 'Caminata en cinta', null, '20 min', '', null),
      e2(2, 'Bicicleta fija', null, '15 min', 'nivel 6', null),
      e2(3, 'Abdominales', null, '20', '', 30),
      e2(4, 'Sentadilla con salto', 4, '', '', 60),
      e2(5, 'Remo en máquina', 3, '10 (lento)', '40', 75),
      e2(6, 'Saltar la cuerda', null, '', '', null),
      e2(7, 'Cinta 20 min', null, '', '', null),
      e2(8, 'Separación de banda', 3, '15', 'banda roja', 0),
      e2(9, 'Remo ergómetro', 5, '500 m', 'barra sola', 900, 'Ritmo suave'),
      e2(10, 'Press con mancuernas', 3, '8 a 12', '2x10 kg', 120),
    ] },
    { id: 'd4', orden: 4, nombre: 'Movilidad', notas: 'Todo suave, sin dolor.', ejercicios: [] },
  ],
};
const TREINO_PT = {
  nombre: 'Treino hipertrofia', notas: '', dias: [
    { nombre: 'Treino A – Peito', notas: 'Aquecimento: 10 min de esteira.', ejercicios: [
      e2(1, 'Supino reto', 4, '10', '30 kg', 90),
      e2(2, 'Crucifixo', 3, '12', '12 kg', null, 'Descer devagar.'),
      e2(3, 'Crossover', 3, '15', 'placa 4', 60, '', true),
    ] },
    { nombre: 'Pernas', notas: '', ejercicios: [
      e2(1, 'Agachamento livre', 4, '10', '2x10 kg', 120),
      e2(2, 'Stiff', 3, '12', 'barra sola', null),
      e2(3, 'Rosca direta', 3, 'até a falha', '10 kg', 60),
    ] },
  ],
};
// Un nombre que parece un día («Rutina 1») y un día que no («Semana de base»).
const RARA = {
  nombre: 'Rutina 1', notas: '', dias: [
    { nombre: 'Semana de base', notas: '', ejercicios: [e2(1, 'Sentadilla', 3, '10', '', null)] },
    { nombre: 'LUNES', notas: '', ejercicios: [e2(1, 'Plancha', 3, '30 s', '', null)] },
  ],
};

/** Lo que leerRutina tiene que devolver para una rutina de Orden. */
function esperado(r) {
  return {
    nombre: r.nombre,
    notas: r.notas,
    dias: [...r.dias].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((d) => ({
      nombre: d.nombre,
      notas: d.notas,
      ejercicios: [...d.ejercicios].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((x) => ({
        nombre: x.nombre, series: x.series, reps: x.reps, carga: x.carga,
        descanso_seg: x.descanso_seg, nota: x.nota, junto_al_anterior: x.junto_al_anterior,
      })),
    })),
    noEntendidas: [],
  };
}

{
  const texto = R.rutinaComoTexto(FUERZA, tEs);
  const lineas = texto.split('\n');
  ok('arranca con el nombre en negrita y las notas en itálica', lineas.slice(0, 3),
    ['*Fuerza base*', '_Entrá en calor 10 minutos antes de empezar._', '_Tomá agua entre series._']);
  ok('los días van en orden aunque lleguen desordenados', lineas.filter((l) => /^\*/.test(l)),
    ['*Fuerza base*', '*Día A · Piernas*', '*Día B · Torso*', '*Cardio y core*', '*Movilidad*']);
  ok('un ejercicio completo, con su nota', [lineas[6], lineas[7]],
    ['1. Sentadilla con barra — 4 × 8-10 · 40 kg · Descanso 1:30', '   _Nota: Bajá hasta la paralela._']);
  ok('las superseries van 1a / 1b y dicen con cuál van; la numeración cuenta grupos',
    lineas.filter((l) => /^\d+[ab]?\. (Press banca|Remo con|Elevaciones|Tríceps|Curl|Flexiones)/.test(l)),
    ['1a. Press banca plano — 4 × 10 · 30 kg · Descanso 1:30',
      '1b. Remo con mancuerna — 4 × 12 · 25 lb · Junto con el anterior',
      '2. Elevaciones laterales — 3 × 15 · 5 kg',
      '3a. Tríceps con soga — 3 × 12-10-8 · placa 5 · Descanso 1 min',
      '3b. Curl martillo — 3 × 10 · Descanso 1 min · Junto con el anterior',
      '4. Flexiones de brazos — 3 × al fallo · peso corporal']);
  ok('series sin repeticiones', lineas.includes('4. Sentadilla con salto — 4 series · Descanso 1 min'), true);
  ok('un nombre que parece traer datos se marca con la raya', lineas.includes('7. Cinta 20 min —'), true);
  ok('un nombre solo, sin raya', lineas.includes('6. Saltar la cuerda'), true);
  ok('la carga sin unidad sale sin unidad', lineas.includes('5. Remo en máquina — 3 × 10 (lento) · 40 · Descanso 1:15'), true);
  ok('nunca lleva «Salud y lesiones»', texto.includes('Rodilla'), false);
  ok('ni lo que es de la biblioteca («cómo se hace»)', texto.includes('NO VA'), false);

  ok('ida y vuelta en español', R.leerRutina(texto), esperado(FUERZA));
  ok('ida y vuelta con las palabras en portugués', R.leerRutina(R.rutinaComoTexto(FUERZA, tPt)), esperado(FUERZA));
  ok('una rutina en portugués', R.leerRutina(R.rutinaComoTexto(TREINO_PT, tPt)), esperado(TREINO_PT));
  ok('un nombre de rutina que parece un día, y días que no', R.leerRutina(R.rutinaComoTexto(RARA, tEs)), esperado(RARA));

  // Lo que la base acepta y el lector confundía: repeticiones sin series que
  // no son un número (volvían como carga), una carga sin repeticiones (volvía
  // como repeticiones), una pausa dentro de las repeticiones (volvía como
  // descanso), nombres que parecen otra cosa y emojis.
  const rut = (dias, extra = {}) => ({ nombre: 'Rutina X', notas: '', ...extra, dias });
  const diaR = (orden, nombre, ejercicios, notas = '') => ({ orden, nombre, notas, ejercicios });
  const DIFICILES = [
    ['«al fallo» sin series, con carga', rut([diaR(1, 'Día A', [e2(1, 'Dominadas', null, 'al fallo', '10 kg', null)])])],
    ['«10 c/lado» sin series', rut([diaR(1, 'Día A', [e2(1, 'Estocadas', null, '10 c/lado', '', null)])])],
    ['«AMRAP» sin series, con descanso', rut([diaR(1, 'Día A', [e2(1, 'Burpees', null, 'AMRAP', '', 60)])])],
    ['solo la carga «40»', rut([diaR(1, 'Día A', [e2(1, 'Sentadilla', null, '', '40', 60)])])],
    ['solo la carga «barra sola»', rut([diaR(1, 'Día A', [e2(1, 'Remo', null, '', 'barra sola', null)])])],
    ['«12 (pausa 2 s)»', rut([diaR(1, 'Día A', [e2(1, 'Sentadilla', 4, '12 (pausa 2 s)', '', null)])])],
    ['un día «Circuito» y otro «HIIT»', rut([diaR(1, 'Día A', [e2(1, 'Sentadilla', 4, '10', '', null)]),
      diaR(2, 'Circuito', [e2(1, 'Burpees', 3, '10', '', null)]), diaR(3, 'HIIT', [e2(1, 'Remo', 3, '10', '', null)])])],
    ['un día «Cardio 30 min»', rut([diaR(1, 'Fuerza', [e2(1, 'Sentadilla', 4, '10', '', null)]),
      diaR(2, 'Cardio 30 min', [e2(1, 'Burpees', 3, '10', '', null)])])],
    ['un día «Activación y glúteos»', rut([diaR(1, 'Fuerza', [e2(1, 'Sentadilla', 4, '10', '', null)]),
      diaR(2, 'Activación y glúteos', [e2(1, 'Hip thrust', 3, '10', '', null)])])],
    ['la rutina «Fuerza 5x5»', rut([diaR(1, 'Día A', [e2(1, 'Sentadilla', 5, '5', '', null)])], { nombre: 'Fuerza 5x5' })],
    ['un día vacío «Libre» en el medio', rut([diaR(1, 'Día A', [e2(1, 'Sentadilla', 4, '10', '', null)]), diaR(2, 'Libre', []),
      diaR(3, 'Día C', [e2(1, 'Remo', 4, '10', '', null)])])],
    ['una nota «Bajá lento 🐢»', rut([diaR(1, 'Día A', [e2(1, 'Sentadilla', 4, '10', '', null, 'Bajá lento 🐢')])])],
    ['las notas de la rutina y del día con emojis', rut([diaR(1, 'Día A 🔥', [e2(1, 'Sentadilla', 4, '10', '', null)], 'Movilidad 🧘')],
      { notas: 'Tomá agua 💧' })],
    ['un ejercicio «Sentadilla 🔥»', rut([diaR(1, 'Día A', [e2(1, 'Sentadilla 🔥', 4, '10', '', null), e2(2, 'Plancha 🔥', null, '', '', null)])])],
  ];
  for (const [nombre, r] of DIFICILES) {
    for (const [idioma, t] of [['es', tEs], ['pt', tPt]]) {
      ok(`ida y vuelta (${idioma}): ${nombre}`, R.leerRutina(R.rutinaComoTexto(r, t)), esperado(r));
    }
  }
  const soloCarga = DIFICILES[3][1];
  ok('una carga sin series ni repeticiones sale con su etiqueta', R.rutinaComoTexto(soloCarga, tEs).split('\n')[3],
    '1. Sentadilla — Carga: 40 · Descanso 1 min');
  const sinEtiqueta = { series: tEs.series, descanso: tEs.descanso, nota: tEs.nota, superserie: tEs.superserie };
  ok('sin la palabra «Carga» en el diccionario, «@ 40», que también vuelve igual',
    [R.rutinaComoTexto(soloCarga, sinEtiqueta).split('\n')[3], R.leerRutina(R.rutinaComoTexto(soloCarga, sinEtiqueta))],
    ['1. Sentadilla — @ 40 · Descanso 1 min', esperado(soloCarga)]);

  // La rutina del link (`rutina_por_token`) llama `junto` a la superserie.
  const publica = {
    nombre: FUERZA.nombre, notas: FUERZA.notas, desde: FUERZA.desde,
    dias: FUERZA.dias.map((d) => ({
      orden: d.orden, nombre: d.nombre, notas: d.notas,
      ejercicios: d.ejercicios.map((x) => ({
        id: x.id, orden: x.orden, nombre: x.nombre, series: x.series, reps: x.reps, carga: x.carga,
        descanso_seg: x.descanso_seg, nota: x.nota, junto: x.junto_al_anterior, video: null, como: '',
      })),
    })),
  };
  ok('la rutina del link da el mismo texto', R.rutinaComoTexto(publica, tEs), texto);

  // Lo leído de un texto real, exportado y vuelto a leer, da lo mismo.
  for (const [nombre, t] of [['WhatsApp', WHATSAPP], ['Treino', TREINO], ['Series de', SERIES_DE],
    ['Superseries', SUPERSERIES], ['Unidades', UNIDADES], ['Notas', NOTAS], ['Excel', EXCEL],
    ['Planilha', PLANILHA], ['Sheets', SHEETS], ['Teclas', TECLAS], ['Descansos', DESCANSOS], ['Bloques', BLOQUES]]) {
    const primera = R.leerRutina(t);
    const segunda = R.leerRutina(R.rutinaComoTexto(primera, tEs));
    ok(`leer, exportar y volver a leer: ${nombre}`, segunda, { ...primera, noEntendidas: [] });
  }
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 6 · Medidas: el catálogo es el de los check de la 098 ──');
{
  ok('las diez medidas con sus rangos', M.MEDIDAS.map((m) => [m.clave, m.unidad, m.minimo, m.maximo, m.decimales]), [
    ['peso_kg', 'kg', 20, 300, 1],
    ['altura_cm', 'cm', 100, 230, 1],
    ['cintura_cm', 'cm', 40, 200, 1],
    ['cadera_cm', 'cm', 50, 200, 1],
    ['pecho_cm', 'cm', 50, 180, 1],
    ['brazo_cm', 'cm', 15, 75, 1],
    ['muslo_cm', 'cm', 30, 110, 1],
    ['grasa_pct', '%', 3, 70, 1],
    ['pantorrilla_cm', 'cm', 20, 70, 1],
    ['cuello_cm', 'cm', 25, 65, 1],
  ]);
  ok('las 8 por defecto', M.MEDIDAS.filter((m) => m.porDefecto).map((m) => m.clave),
    ['peso_kg', 'altura_cm', 'cintura_cm', 'cadera_cm', 'pecho_cm', 'brazo_cm', 'muslo_cm', 'grasa_pct']);
  ok('y en «Más medidas»', M.MEDIDAS.filter((m) => !m.porDefecto).map((m) => m.clave), ['pantorrilla_cm', 'cuello_cm']);
  ok('los métodos de grasa', M.METODOS_GRASA, ['balanza', 'plicometro', 'cinta', 'otro']);
  // El check de la migración, leído del archivo si ya existe: los dos tienen que decir lo mismo.
  const migracion = path.join(__dirname, '..', 'supabase', 'migrations', '098_rutinas_y_medidas.sql');
  if (fs.existsSync(migracion)) {
    const sql = fs.readFileSync(migracion, 'utf8');
    for (const m of M.MEDIDAS) {
      const re = new RegExp(`${m.clave}\\s+numeric\\(\\s*\\d\\s*,\\s*1\\s*\\)[^,]*between\\s+(\\d+)\\s+and\\s+(\\d+)`, 'i');
      const h = re.exec(sql);
      ok(`la 098 tiene el mismo rango para ${m.clave}`, h ? [+h[1], +h[2]] : null, [m.minimo, m.maximo]);
    }
  } else {
    console.log('     (la 098 todavía no existe: los rangos se comparan en pruebas/rutinas.test.js)');
  }

  for (const m of M.MEDIDAS) {
    ok(`${m.clave}: el mínimo y el máximo valen, lo de afuera no`, [
      M.validarMedida(m.clave, m.minimo).ok,
      M.validarMedida(m.clave, m.maximo).ok,
      M.validarMedida(m.clave, m.minimo - 0.1).ok,
      M.validarMedida(m.clave, m.maximo + 0.1).ok,
    ], [true, true, false, false]);
  }
  ok('redondea antes de mirar el rango, como la columna', [
    M.validarMedida('peso_kg', 19.96), M.validarMedida('peso_kg', 19.94).ok, M.validarMedida('peso_kg', 300.04),
  ], [{ ok: true, valor: 20 }, false, { ok: true, valor: 300 }]);
  ok('acepta coma', M.validarMedida('cintura_cm', '84,5'), { ok: true, valor: 84.5 });
  ok('vacío vale (todas son optativas)', [M.validarMedida('peso_kg', ''), M.validarMedida('peso_kg', null)],
    [{ ok: true, valor: null }, { ok: true, valor: null }]);
  ok('el error de tipeo «8,5» por «85»', M.validarMedida('peso_kg', '8,5'), { ok: false, motivo: 'bajo', minimo: 20, maximo: 300 });
  ok('texto que no es un número', M.validarMedida('peso_kg', '85kg').motivo, 'no_es_numero');
  ok('un negativo tampoco', M.validarMedida('cintura_cm', '-80').motivo, 'no_es_numero');
  ok('grasa de más', M.validarMedida('grasa_pct', 71).motivo, 'alto');

  ok('redondear: la mitad se aleja del cero, como numeric', [M.redondear(1.25, 1), M.redondear(-1.25, 1), M.redondear(1.005, 2), M.redondear(-0.04, 1)],
    [1.3, -1.3, 1.01, 0]);
  ok('IMC con un decimal', M.imc(80, 180), 24.7);
  ok('IMC sin altura', M.imc(80, null), null);
  ok('categorías de la OMS', [18.4, 18.5, 24.9, 25, 29.9, 30, 41].map(M.categoriaImc),
    ['bajo', 'normal', 'normal', 'sobrepeso', 'sobrepeso', 'obesidad', 'obesidad']);
  ok('la categoría sale del número redondeado que se muestra', M.categoriaImc(M.imc(73.7, 172)), 'normal');
  ok('cintura / altura', M.cinturaAltura(84, 170), 0.49);
  ok('cintura / cadera', M.cinturaCadera(84, 100), 0.84);

  const controles = [
    { fecha: '2026-08-15', peso_kg: 80.5, altura_cm: 170, cintura_cm: 90, grasa_pct: 28, grasa_metodo: 'balanza', brazo_cm: null },
    { fecha: '2026-07-15', peso_kg: 82.1, altura_cm: 169, cintura_cm: 92.5, grasa_pct: 24, grasa_metodo: 'plicometro', brazo_cm: 33 },
    { fecha: '2026-09-15', peso_kg: '78.4', altura_cm: null, cintura_cm: null, grasa_pct: 26.5, grasa_metodo: 'balanza', brazo_cm: null },
  ];
  const ia = M.inicioContraAhora(controles);
  ok('peso: del primero al último, aunque lleguen desordenados', ia.peso_kg,
    { inicio: 82.1, ahora: 78.4, diferencia: -3.7, fechaInicio: '2026-07-15', fechaAhora: '2026-09-15' });
  ok('cintura: «ahora» es el último control que la tiene', ia.cintura_cm,
    { inicio: 92.5, ahora: 90, diferencia: -2.5, fechaInicio: '2026-07-15', fechaAhora: '2026-08-15' });
  ok('altura: la del último control que la tiene, sin diferencia', ia.altura_cm,
    { inicio: 170, ahora: 170, diferencia: null, fechaInicio: '2026-08-15', fechaAhora: '2026-08-15' });
  ok('grasa: nunca compara la balanza con el plicómetro', ia.grasa_pct,
    { inicio: 28, ahora: 26.5, diferencia: -1.5, fechaInicio: '2026-08-15', fechaAhora: '2026-09-15', metodo: 'balanza' });
  ok('un solo dato: sin diferencia (un «0» diría que no cambió)', ia.brazo_cm,
    { inicio: 33, ahora: 33, diferencia: null, fechaInicio: '2026-07-15', fechaAhora: '2026-07-15' });
  ok('el IMC de cada punta con la última altura', ia.imc,
    { inicio: 28.4, ahora: 27.1, diferencia: -1.3, fechaInicio: '2026-07-15', fechaAhora: '2026-09-15' });
  ok('lo que no se midió no aparece', Object.keys(ia).sort(),
    ['altura_cm', 'brazo_cm', 'cintura_cm', 'grasa_pct', 'imc', 'peso_kg']);
  ok('sin controles, nada', M.inicioContraAhora([]), {});
  ok('la lista original no se toca', controles[0].fecha, '2026-08-15');

  ok('el último valor, para el «la última: …»', M.ultimoValor(controles, 'cintura_cm'), { valor: 90, fecha: '2026-08-15' });
  ok('y el anterior a una fecha (al editar un control)', M.ultimoValor(controles, 'peso_kg', '2026-09-15'), { valor: 80.5, fecha: '2026-08-15' });
  ok('«¿Seguro?»: más de 5 kg', [M.seAlejaMucho('peso_kg', 85, 8.5), M.seAlejaMucho('peso_kg', 85, 81), M.seAlejaMucho('peso_kg', 85, 79.9)],
    [true, false, true]);
  ok('«¿Seguro?»: más del 10 % en un perímetro', [M.seAlejaMucho('cintura_cm', 90, 80), M.seAlejaMucho('cintura_cm', 90, 82)], [true, false]);
  ok('sin anterior no pregunta', M.seAlejaMucho('peso_kg', null, 80), false);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 7 · La lista base de ejercicios ──');
{
  const lista = E.EJERCICIOS_BASE;
  ok('son unos cien', lista.length >= 95 && lista.length <= 130, true);
  ok('cada uno con nombre en los dos idiomas y un grupo válido',
    lista.filter((x) => !x.es || !x.pt || !E.GRUPOS_EJERCICIO.includes(x.grupo)), []);
  ok('los grupos son los del check de la base', E.GRUPOS_EJERCICIO,
    ['piernas', 'gluteos', 'pecho', 'espalda', 'hombros', 'brazos', 'core', 'cardio', 'movilidad', 'otro']);
  ok('todos los grupos tienen ejercicios', E.GRUPOS_EJERCICIO.filter((g) => !lista.some((x) => x.grupo === g)), []);
  const repetidos = (idioma) => {
    const vistos = new Set(), rep = [];
    for (const x of lista) { const k = E.claveEjercicio(x[idioma]); if (vistos.has(k)) rep.push(x[idioma]); vistos.add(k); }
    return rep;
  };
  ok('ningún nombre repetido en español', repetidos('es'), []);
  ok('ni en portugués', repetidos('pt'), []);
  ok('los nombres entran en la columna (80)', lista.filter((x) => x.es.length > 80 || x.pt.length > 80), []);

  ok('la clave es la de la base: sin tildes, minúsculas, espacios colapsados',
    E.claveEjercicio('  Sentadilla   BÚLGARA  '), 'sentadilla bulgara');
  ok('ñ y ç como en el translate de la 098', [E.claveEjercicio('Muñeca'), E.claveEjercicio('Braço')], ['muneca', 'braco']);

  const nombres = (s) => s.map((x) => `${x.propio ? '*' : ''}${x.nombre}`);
  ok('«sent» sugiere las sentadillas', nombres(E.sugerir('sent', 'es', [], 3)),
    ['Sentadilla con barra', 'Sentadilla', 'Sentadilla goblet']);
  ok('sin tildes: «biceps» encuentra «Curl de bíceps»', E.sugerir('biceps', 'es', [], 2).map((x) => x.nombre),
    ['Curl de bíceps con barra', 'Curl de bíceps con mancuernas']);
  ok('lo que empieza igual va antes que las palabras sueltas: «press inc»', E.sugerir('press inc', 'es', [], 2).map((x) => x.nombre),
    ['Press inclinado con mancuernas', 'Press banca inclinado']);
  ok('primero los propios, y el de la lista que ya tiene no se repite',
    nombres(E.sugerir('sentadilla', 'es', ['Sentadilla búlgara', 'Sentadilla con pausa'], 4)),
    ['*Sentadilla búlgara', '*Sentadilla con pausa', 'Sentadilla', 'Sentadilla con barra']);
  ok('en portugués', E.sugerir('supino', 'pt', [], 2).map((x) => x.nombre), ['Supino reto', 'Supino inclinado']);
  ok('trae el grupo', E.sugerir('hip', 'es', [], 1)[0].grupo, 'gluteos');
  ok('sin texto: los propios y después la lista', nombres(E.sugerir('', 'es', ['Mi ejercicio'], 2)), ['*Mi ejercicio', 'Sentadilla con barra']);
  ok('lo que no coincide no aparece', E.sugerir('zzz', 'es', ['Algo']), []);
  ok('reconoce un nombre de la lista, en cualquier idioma y en singular', [
    E.buscarBase('estocada')?.es, E.buscarBase('Supino reto')?.grupo, E.buscarBase('Algo inventado'),
  ], ['Estocadas', 'pecho', undefined]);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 8 · Los textos comunes, en los dos idiomas ──');
{
  const claves = (o) => Object.keys(o).sort();
  for (const [nombre, t] of [['es', rutinasComunEs], ['pt', rutinasComunPt]]) {
    ok(`${nombre}: un nombre para cada medida del catálogo`, claves(t.medidas), M.MEDIDAS.map((m) => m.clave).sort());
    ok(`${nombre}: la unidad de cada medida es la del catálogo`, M.MEDIDAS.filter((m) => t.medidas[m.clave].unidad !== m.unidad), []);
    ok(`${nombre}: cada método de grasa`, claves(t.metodosGrasa), [...M.METODOS_GRASA].sort());
    ok(`${nombre}: cada grupo`, claves(t.grupos), [...E.GRUPOS_EJERCICIO].sort());
    ok(`${nombre}: cada unidad de carga`, claves(t.unidadesCarga), [...R.UNIDADES_CARGA].sort());
    ok(`${nombre}: cada categoría del IMC`, claves(t.categoriasImc), ['bajo', 'normal', 'obesidad', 'sobrepeso']);
    const vacios = [];
    (function recorrer(o, ruta) {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string') { if (!v.trim()) vacios.push(`${ruta}${k}`); } else recorrer(v, `${ruta}${k}.`);
      }
    })(t, '');
    ok(`${nombre}: ningún texto vacío`, vacios, []);
  }
  ok('el portugués está traducido', [rutinasComunPt.grupos.espalda, rutinasComunPt.acciones.verComoSeHace, rutinasComunPt.texto.superserie],
    ['Costas', 'Ver como se faz', 'Junto com o anterior']);
  // Lo que exporta rutinaComoTexto tiene que poder leerse: las palabras del
  // diccionario son de las que el lector reconoce.
  for (const [nombre, t] of [['es', tEs], ['pt', tPt]]) {
    const r = R.leerRenglon(`Remo — 3 ${t.series} · ${t.descanso} 1:30 · ${t.superserie}`);
    ok(`${nombre}: el lector entiende «${t.series}», «${t.descanso}» y «${t.superserie}»`,
      [r.series, r.descanso_seg, r.junto_al_anterior], [3, 90, true]);
    const c = R.leerRenglon(`Sentadilla — ${t.carga}: 40`);
    ok(`${nombre}: y «${t.carga}: 40» es la carga, no 40 repeticiones`, [c.reps, c.carga], ['', '40']);
  }
}

console.log(fallos === 0 ? `\n>>> TODAS LAS PRUEBAS PASARON (${corridas} comprobaciones)` : `\n>>> ${fallos} DE ${corridas} FALLARON`);
process.exit(fallos ? 1 : 0);
